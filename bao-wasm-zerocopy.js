/**
 * Zero-copy WASM-accelerated Bao operations.
 *
 * Eliminates memory copy overhead by:
 * 1. Using persistent Uint8Array views into WASM memory
 * 2. Exposing direct buffer access for callers
 * 3. Using subarray() instead of slice() for output
 */
'use strict';

const fs = require('fs');
const path = require('path');

// Constants matching WASM module
const CHUNK_LEN = 1024;
const HASH_SIZE = 32;
const INPUT_OFFSET = 65536;   // Where input data goes
const OUTPUT_OFFSET = 131072; // Where output CVs appear

// WASM state
let wasmModule = null;
let wasmMemory = null;
let wasmExports = null;

// Persistent views into WASM memory (created once, reused forever)
let memoryBuffer = null;
let inputView = null;
let outputView = null;

// Reusable result buffer for single CV operations
const cvResultBuffer = new Uint8Array(HASH_SIZE);

/**
 * Initialize WASM module and create persistent memory views.
 * @returns {Promise<boolean>} True if WASM loaded successfully
 */
async function initWasm() {
  if (wasmModule) return true;

  try {
    const wasmPath = path.join(__dirname, 'build', 'release.wasm');
    const wasmBuffer = fs.readFileSync(wasmPath);

    const result = await WebAssembly.instantiate(wasmBuffer, {
      env: {
        abort: (msg, file, line, col) => {
          console.error(`WASM abort at ${file}:${line}:${col}: ${msg}`);
        }
      }
    });

    wasmModule = result.instance;
    wasmExports = wasmModule.exports;
    wasmMemory = wasmExports.memory;

    // Create persistent views - these are NOT copies, they're windows into WASM memory
    _refreshViews();

    return true;
  } catch (err) {
    console.warn('WASM initialization failed:', err.message);
    return false;
  }
}

/**
 * Refresh memory views (needed if WASM memory grows).
 * @private
 */
function _refreshViews() {
  memoryBuffer = new Uint8Array(wasmMemory.buffer);
  inputView = memoryBuffer.subarray(INPUT_OFFSET, INPUT_OFFSET + 65536);
  outputView = memoryBuffer.subarray(OUTPUT_OFFSET, OUTPUT_OFFSET + 65536);
}

/**
 * Check if memory buffer is detached (happens if WASM memory grows).
 * @private
 */
function _checkMemory() {
  if (memoryBuffer.buffer !== wasmMemory.buffer) {
    _refreshViews();
  }
}

/**
 * Check if WASM is available.
 * @returns {boolean}
 */
function isWasmEnabled() {
  return wasmModule !== null;
}

/**
 * Get direct access to the WASM input buffer.
 * Write data directly here to avoid copy overhead.
 *
 * @returns {Uint8Array} View into 64KB input buffer
 */
function getInputBuffer() {
  _checkMemory();
  return inputView;
}

/**
 * Get direct access to the WASM output buffer.
 * Read results directly from here to avoid copy overhead.
 *
 * @returns {Uint8Array} View into 64KB output buffer
 */
function getOutputBuffer() {
  _checkMemory();
  return outputView;
}

// =============================================================================
// ZERO-COPY API (Maximum Performance)
// =============================================================================

/**
 * Compute chunk CV - zero-copy version.
 *
 * PRECONDITION: Chunk data must already be in input buffer
 * POSTCONDITION: Result is a VIEW into output buffer
 *
 * @param {number} chunkLen - Number of bytes in input buffer (0-1024)
 * @param {number} chunkIndex - Chunk counter
 * @param {boolean} isRoot - Whether this is the root node
 * @returns {Uint8Array} VIEW into output buffer (32 bytes) - COPY if you need to keep it!
 */
function chunkCVDirect(chunkLen, chunkIndex, isRoot) {
  _checkMemory();
  wasmExports.chunkCV(chunkLen, BigInt(chunkIndex), isRoot ? 1 : 0);
  return outputView.subarray(0, HASH_SIZE);
}

/**
 * Compute parent CV - zero-copy version.
 *
 * PRECONDITION: leftCV at input[0:32], rightCV at input[32:64]
 * POSTCONDITION: Result is a VIEW into output buffer
 *
 * @param {boolean} isRoot - Whether this is the root node
 * @returns {Uint8Array} VIEW into output buffer (32 bytes)
 */
function parentCVDirect(isRoot) {
  _checkMemory();
  wasmExports.parentCV(isRoot ? 1 : 0);
  return outputView.subarray(0, HASH_SIZE);
}

/**
 * Batch compute chunk CVs - zero-copy version.
 *
 * PRECONDITION: numChunks * 1024 bytes in input buffer
 * POSTCONDITION: numChunks * 32 bytes in output buffer
 *
 * @param {number} numChunks - Number of 1024-byte chunks (max 64)
 * @param {number} startIndex - Starting chunk index
 * @returns {Uint8Array} VIEW into output buffer (numChunks * 32 bytes)
 */
function batchChunkCVsDirect(numChunks, startIndex) {
  _checkMemory();
  wasmExports.batchChunkCVs(numChunks, BigInt(startIndex));
  return outputView.subarray(0, numChunks * HASH_SIZE);
}

/**
 * Batch compute parent CVs - zero-copy version.
 *
 * PRECONDITION: numPairs * 64 bytes (CV pairs) in input buffer
 * POSTCONDITION: numPairs * 32 bytes in output buffer
 *
 * @param {number} numPairs - Number of CV pairs
 * @param {number} rootIndex - Index of pair to mark as root (-1 for none)
 * @returns {Uint8Array} VIEW into output buffer
 */
function batchParentCVsDirect(numPairs, rootIndex) {
  _checkMemory();
  wasmExports.batchParentCVs(numPairs, rootIndex);
  return outputView.subarray(0, numPairs * HASH_SIZE);
}

// =============================================================================
// CONVENIENT API (Handles copying, returns safe values)
// =============================================================================

/**
 * Compute chunk CV with automatic input handling.
 *
 * @param {Uint8Array} chunk - Chunk data (up to 1024 bytes)
 * @param {number} chunkIndex - Chunk counter
 * @param {boolean} isRoot - Whether this is the root node
 * @returns {Uint8Array} NEW array with 32-byte CV (safe to store)
 */
function chunkCV(chunk, chunkIndex, isRoot) {
  _checkMemory();
  inputView.set(chunk, 0);
  wasmExports.chunkCV(chunk.length, BigInt(chunkIndex), isRoot ? 1 : 0);
  // Return copy for safety
  cvResultBuffer.set(outputView.subarray(0, HASH_SIZE));
  return new Uint8Array(cvResultBuffer);
}

/**
 * Compute parent CV with automatic input handling.
 *
 * @param {Uint8Array} leftCV - Left child CV (32 bytes)
 * @param {Uint8Array} rightCV - Right child CV (32 bytes)
 * @param {boolean} isRoot - Whether this is the root node
 * @returns {Uint8Array} NEW array with 32-byte CV
 */
function parentCV(leftCV, rightCV, isRoot) {
  _checkMemory();
  inputView.set(leftCV, 0);
  inputView.set(rightCV, 32);
  wasmExports.parentCV(isRoot ? 1 : 0);
  return new Uint8Array(outputView.subarray(0, HASH_SIZE));
}

/**
 * Batch compute chunk CVs with automatic handling.
 *
 * @param {Uint8Array} data - Data containing multiple chunks
 * @param {number} startIndex - Starting chunk index
 * @param {number} numChunks - Number of complete 1024-byte chunks
 * @returns {Array<Uint8Array>} Array of 32-byte CVs (safe to store)
 */
function batchChunkCVs(data, startIndex, numChunks) {
  _checkMemory();
  const maxChunksPerBatch = 64;
  const results = [];
  let processed = 0;

  while (processed < numChunks) {
    const batchSize = Math.min(numChunks - processed, maxChunksPerBatch);
    const dataOffset = processed * CHUNK_LEN;

    // Copy batch to input buffer
    inputView.set(data.subarray(dataOffset, dataOffset + batchSize * CHUNK_LEN), 0);

    // Process batch
    wasmExports.batchChunkCVs(batchSize, BigInt(startIndex + processed));

    // Copy results out
    for (let i = 0; i < batchSize; i++) {
      results.push(new Uint8Array(outputView.subarray(i * HASH_SIZE, (i + 1) * HASH_SIZE)));
    }

    processed += batchSize;
  }

  return results;
}

/**
 * Batch compute parent CVs with automatic handling.
 *
 * @param {Array<Array<Uint8Array>>} cvPairs - Array of [leftCV, rightCV] pairs
 * @param {number} rootIndex - Index of pair to mark as root (-1 for none)
 * @returns {Array<Uint8Array>} Array of parent CVs
 */
function batchParentCVs(cvPairs, rootIndex = -1) {
  _checkMemory();
  const numPairs = cvPairs.length;
  const maxPairsPerBatch = 1024;

  const results = [];
  let processed = 0;

  while (processed < numPairs) {
    const batchSize = Math.min(numPairs - processed, maxPairsPerBatch);

    // Copy pairs to input buffer
    for (let i = 0; i < batchSize; i++) {
      const pair = cvPairs[processed + i];
      inputView.set(pair[0], i * 64);
      inputView.set(pair[1], i * 64 + 32);
    }

    // Determine root index for this batch
    let batchRootIndex = -1;
    if (rootIndex >= processed && rootIndex < processed + batchSize) {
      batchRootIndex = rootIndex - processed;
    }

    wasmExports.batchParentCVs(batchSize, batchRootIndex);

    for (let i = 0; i < batchSize; i++) {
      results.push(new Uint8Array(outputView.subarray(i * HASH_SIZE, (i + 1) * HASH_SIZE)));
    }

    processed += batchSize;
  }

  return results;
}

// =============================================================================
// HIGH-PERFORMANCE BAO ENCODE
// =============================================================================

/**
 * WASM-accelerated Bao encode using zero-copy where possible.
 *
 * @param {Uint8Array} buf - Input data
 * @param {boolean} outboard - If true, omit chunk data (outboard format)
 * @returns {{ encoded: Uint8Array, hash: Uint8Array }}
 */
function baoEncodeWasm(buf, outboard = false) {
  if (typeof buf === 'string') {
    buf = new TextEncoder().encode(buf);
  }
  if (!(buf instanceof Uint8Array)) {
    buf = new Uint8Array(buf);
  }

  _checkMemory();

  const totalLen = buf.length;
  const numCompleteChunks = Math.floor(totalLen / CHUNK_LEN);
  const hasPartialChunk = totalLen % CHUNK_LEN !== 0;
  const totalChunks = numCompleteChunks + (hasPartialChunk ? 1 : 0) || 1;

  // Single chunk case - direct computation
  if (totalChunks === 1) {
    inputView.set(buf, 0);
    wasmExports.chunkCV(buf.length, 0n, 1);
    const rootHash = new Uint8Array(outputView.subarray(0, HASH_SIZE));

    if (outboard) {
      return { encoded: encodeLen(totalLen), hash: rootHash };
    } else {
      const encoded = new Uint8Array(8 + totalLen);
      encoded.set(encodeLen(totalLen), 0);
      encoded.set(buf, 8);
      return { encoded, hash: rootHash };
    }
  }

  // Multi-chunk: batch compute all chunk CVs
  const chunkCVs = [];

  if (numCompleteChunks > 0) {
    let processed = 0;
    while (processed < numCompleteChunks) {
      const batchSize = Math.min(numCompleteChunks - processed, 64);
      const dataOffset = processed * CHUNK_LEN;

      inputView.set(buf.subarray(dataOffset, dataOffset + batchSize * CHUNK_LEN), 0);
      wasmExports.batchChunkCVs(batchSize, BigInt(processed));

      for (let i = 0; i < batchSize; i++) {
        chunkCVs.push(new Uint8Array(outputView.subarray(i * HASH_SIZE, (i + 1) * HASH_SIZE)));
      }
      processed += batchSize;
    }
  }

  // Handle partial last chunk
  if (hasPartialChunk) {
    const lastChunkOffset = numCompleteChunks * CHUNK_LEN;
    const lastChunk = buf.subarray(lastChunkOffset);
    inputView.set(lastChunk, 0);
    wasmExports.chunkCV(lastChunk.length, BigInt(numCompleteChunks), 0);
    chunkCVs.push(new Uint8Array(outputView.subarray(0, HASH_SIZE)));
  }

  return buildBaoFromCVs(buf, chunkCVs, outboard, totalLen);
}

/**
 * Build Bao encoding from pre-computed chunk CVs.
 */
function buildBaoFromCVs(data, chunkCVs, outboard, totalLen) {
  const HEADER_SIZE = 8;
  const numChunks = chunkCVs.length;

  const numParents = numChunks - 1;
  const outputSize = outboard
    ? HEADER_SIZE + numParents * 64
    : HEADER_SIZE + numParents * 64 + totalLen;

  const output = new Uint8Array(outputSize);

  // Write header
  let n = totalLen;
  for (let i = 0; i < 8; i++) {
    output[i] = n & 0xff;
    n = Math.floor(n / 256);
  }

  let writePos = HEADER_SIZE;
  let chunkDataIdx = 0;

  const cvCache = new Map();

  const getSubtreeCV = (startIdx, count) => {
    if (count === 1) return chunkCVs[startIdx];

    const key = `${startIdx}:${count}`;
    if (cvCache.has(key)) return cvCache.get(key);

    const leftCount = 1 << Math.floor(Math.log2(count - 1));
    const leftCV = getSubtreeCV(startIdx, leftCount);
    const rightCV = getSubtreeCV(startIdx + leftCount, count - leftCount);

    inputView.set(leftCV, 0);
    inputView.set(rightCV, 32);
    wasmExports.parentCV(0);
    const cv = new Uint8Array(outputView.subarray(0, HASH_SIZE));

    cvCache.set(key, cv);
    return cv;
  };

  const writeTree = (startIdx, count, isRoot) => {
    if (count === 1) {
      if (!outboard) {
        const chunkStart = chunkDataIdx * CHUNK_LEN;
        const chunkEnd = Math.min(chunkStart + CHUNK_LEN, totalLen);
        output.set(data.subarray(chunkStart, chunkEnd), writePos);
        writePos += chunkEnd - chunkStart;
        chunkDataIdx++;
      }
      return chunkCVs[startIdx];
    }

    const leftCount = 1 << Math.floor(Math.log2(count - 1));
    const rightCount = count - leftCount;

    const leftCV = getSubtreeCV(startIdx, leftCount);
    const rightCV = getSubtreeCV(startIdx + leftCount, rightCount);

    output.set(leftCV, writePos);
    output.set(rightCV, writePos + 32);
    writePos += 64;

    writeTree(startIdx, leftCount, false);
    writeTree(startIdx + leftCount, rightCount, false);

    inputView.set(leftCV, 0);
    inputView.set(rightCV, 32);
    wasmExports.parentCV(isRoot ? 1 : 0);
    return new Uint8Array(outputView.subarray(0, HASH_SIZE));
  };

  const rootHash = writeTree(0, numChunks, true);

  return { encoded: output, hash: rootHash };
}

function encodeLen(len) {
  const bytes = new Uint8Array(8);
  let n = len;
  for (let i = 0; i < 8; i++) {
    bytes[i] = n & 0xff;
    n = Math.floor(n / 256);
  }
  return bytes;
}

module.exports = {
  initWasm,
  isWasmEnabled,
  getInputBuffer,
  getOutputBuffer,
  chunkCVDirect,
  parentCVDirect,
  batchChunkCVsDirect,
  batchParentCVsDirect,
  chunkCV,
  parentCV,
  batchChunkCVs,
  batchParentCVs,
  baoEncodeWasm,
  CHUNK_LEN,
  HASH_SIZE
};

/**
 * WASM-accelerated Bao operations.
 *
 * Loads the custom AssemblyScript WASM module for fast chunk CV and parent CV
 * computation. Falls back to pure JS when WASM is not available.
 */
'use strict';

const fs = require('fs');
const path = require('path');

// Constants matching the WASM module
const CHUNK_LEN = 1024;
const HASH_SIZE = 32;
const INPUT_OFFSET = 65536;   // Skip AssemblyScript's data segment (64KB reserved)
const OUTPUT_OFFSET = 131072;

// WASM module state
let wasmModule = null;
let wasmMemory = null;
let wasmExports = null;

// Fallback to JS implementation
let jsBao = null;

/**
 * Initialize the WASM module.
 *
 * @returns {Promise<boolean>} True if WASM loaded successfully
 */
async function initWasm() {
  if (wasmModule) return true;

  try {
    // Load the WASM file
    const wasmPath = path.join(__dirname, 'build', 'release.wasm');
    const wasmBuffer = fs.readFileSync(wasmPath);

    // Create memory (3 pages = 192KB for input + output + scratch)
    wasmMemory = new WebAssembly.Memory({ initial: 3 });

    // Instantiate the module
    const result = await WebAssembly.instantiate(wasmBuffer, {
      env: {
        memory: wasmMemory,
        abort: (msg, file, line, col) => {
          console.error(`WASM abort at ${file}:${line}:${col}: ${msg}`);
        }
      }
    });

    wasmModule = result.instance;
    wasmExports = wasmModule.exports;

    // Use WASM's memory if it exports one
    if (wasmExports.memory) {
      wasmMemory = wasmExports.memory;
    }

    return true;
  } catch (err) {
    console.warn('WASM initialization failed, using JS fallback:', err.message);
    // Load JS fallback
    if (!jsBao) {
      jsBao = require('./bao.js');
    }
    return false;
  }
}

/**
 * Check if WASM is available.
 *
 * @returns {boolean}
 */
function isWasmEnabled() {
  return wasmModule !== null;
}

/**
 * Compute chunk CV using WASM.
 *
 * @param {Uint8Array} chunk - Chunk data (up to 1024 bytes)
 * @param {number} chunkIndex - Chunk counter
 * @param {boolean} isRoot - Whether this is the root node
 * @returns {Uint8Array} 32-byte chaining value
 */
function chunkCV(chunk, chunkIndex, isRoot) {
  if (!wasmModule) {
    if (!jsBao) jsBao = require('./bao.js');
    return jsBao.chunkCV(chunk, chunkIndex, isRoot);
  }

  const mem = new Uint8Array(wasmMemory.buffer);

  // Copy chunk to input buffer
  mem.set(chunk, INPUT_OFFSET);

  // Call WASM function
  wasmExports.chunkCV(chunk.length, BigInt(chunkIndex), isRoot ? 1 : 0);

  // Read result from output buffer
  return new Uint8Array(mem.slice(OUTPUT_OFFSET, OUTPUT_OFFSET + HASH_SIZE));
}

/**
 * Compute parent CV using WASM.
 *
 * @param {Uint8Array} leftCV - Left child CV (32 bytes)
 * @param {Uint8Array} rightCV - Right child CV (32 bytes)
 * @param {boolean} isRoot - Whether this is the root node
 * @returns {Uint8Array} 32-byte chaining value
 */
function parentCV(leftCV, rightCV, isRoot) {
  if (!wasmModule) {
    if (!jsBao) jsBao = require('./bao.js');
    return jsBao.parentCV(leftCV, rightCV, isRoot);
  }

  const mem = new Uint8Array(wasmMemory.buffer);

  // Copy left and right CVs to input buffer
  mem.set(leftCV, INPUT_OFFSET);
  mem.set(rightCV, INPUT_OFFSET + 32);

  // Call WASM function
  wasmExports.parentCV(isRoot ? 1 : 0);

  // Read result from output buffer
  return new Uint8Array(mem.slice(OUTPUT_OFFSET, OUTPUT_OFFSET + HASH_SIZE));
}

/**
 * Batch compute chunk CVs using WASM.
 *
 * @param {Uint8Array} data - Data containing multiple complete chunks
 * @param {number} startIndex - Starting chunk index
 * @param {number} numChunks - Number of complete 1024-byte chunks
 * @returns {Array<Uint8Array>} Array of 32-byte chunk CVs
 */
function batchChunkCVs(data, startIndex, numChunks) {
  if (!wasmModule) {
    // Fallback to sequential JS
    if (!jsBao) jsBao = require('./bao.js');
    const cvs = [];
    for (let i = 0; i < numChunks; i++) {
      const offset = i * CHUNK_LEN;
      const chunk = data.subarray(offset, offset + CHUNK_LEN);
      cvs.push(jsBao.chunkCV(chunk, startIndex + i, false));
    }
    return cvs;
  }

  const mem = new Uint8Array(wasmMemory.buffer);

  // Check if data fits in input buffer (64KB)
  const maxChunksPerBatch = Math.floor(65536 / CHUNK_LEN); // 64 chunks

  const cvs = [];
  let processed = 0;

  while (processed < numChunks) {
    const batchSize = Math.min(numChunks - processed, maxChunksPerBatch);
    const dataOffset = processed * CHUNK_LEN;

    // Copy batch data to input buffer
    mem.set(data.subarray(dataOffset, dataOffset + batchSize * CHUNK_LEN), INPUT_OFFSET);

    // Call WASM batch function
    wasmExports.batchChunkCVs(batchSize, BigInt(startIndex + processed));

    // Read CVs from output buffer
    for (let i = 0; i < batchSize; i++) {
      const cvOffset = OUTPUT_OFFSET + i * HASH_SIZE;
      cvs.push(new Uint8Array(mem.slice(cvOffset, cvOffset + HASH_SIZE)));
    }

    processed += batchSize;
  }

  return cvs;
}

/**
 * Batch compute parent CVs using WASM.
 *
 * @param {Array<Uint8Array>} cvPairs - Array of CV pairs (each pair is [left, right])
 * @param {number} rootIndex - Index of pair that should be marked as root (-1 for none)
 * @returns {Array<Uint8Array>} Array of parent CVs
 */
function batchParentCVs(cvPairs, rootIndex = -1) {
  if (!wasmModule) {
    // Fallback to sequential JS
    if (!jsBao) jsBao = require('./bao.js');
    return cvPairs.map((pair, i) => jsBao.parentCV(pair[0], pair[1], i === rootIndex));
  }

  const mem = new Uint8Array(wasmMemory.buffer);
  const numPairs = cvPairs.length;

  // Check if pairs fit in input buffer (64KB / 64 bytes per pair = 1024 pairs)
  const maxPairsPerBatch = Math.floor(65536 / 64);

  const results = [];
  let processed = 0;

  while (processed < numPairs) {
    const batchSize = Math.min(numPairs - processed, maxPairsPerBatch);

    // Copy pairs to input buffer
    for (let i = 0; i < batchSize; i++) {
      const pair = cvPairs[processed + i];
      mem.set(pair[0], INPUT_OFFSET + i * 64);
      mem.set(pair[1], INPUT_OFFSET + i * 64 + 32);
    }

    // Determine if any pair in this batch is the root
    let batchRootIndex = -1;
    if (rootIndex >= processed && rootIndex < processed + batchSize) {
      batchRootIndex = rootIndex - processed;
    }

    // Call WASM batch function
    wasmExports.batchParentCVs(batchSize, batchRootIndex);

    // Read results from output buffer
    for (let i = 0; i < batchSize; i++) {
      const cvOffset = OUTPUT_OFFSET + i * HASH_SIZE;
      results.push(new Uint8Array(mem.slice(cvOffset, cvOffset + HASH_SIZE)));
    }

    processed += batchSize;
  }

  return results;
}

/**
 * WASM-accelerated Bao encode.
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

  // For small inputs or no WASM, use JS
  if (!wasmModule || buf.length < CHUNK_LEN * 4) {
    if (!jsBao) jsBao = require('./bao.js');
    return jsBao.baoEncode(buf, outboard);
  }

  const totalLen = buf.length;
  const numCompleteChunks = Math.floor(totalLen / CHUNK_LEN);
  const hasPartialChunk = totalLen % CHUNK_LEN !== 0;
  const totalChunks = numCompleteChunks + (hasPartialChunk ? 1 : 0) || 1;

  // Batch compute chunk CVs for complete chunks
  const chunkCVs = numCompleteChunks > 0
    ? batchChunkCVs(buf, 0, numCompleteChunks)
    : [];

  // Handle partial last chunk
  if (hasPartialChunk) {
    const lastChunkOffset = numCompleteChunks * CHUNK_LEN;
    const lastChunk = buf.subarray(lastChunkOffset);
    chunkCVs.push(chunkCV(lastChunk, numCompleteChunks, false));
  } else if (numCompleteChunks === 0) {
    // Empty input
    chunkCVs.push(chunkCV(new Uint8Array(0), 0, true));
    return buildBaoFromCVs(buf, chunkCVs, outboard);
  }

  return buildBaoFromCVs(buf, chunkCVs, outboard);
}

/**
 * Build Bao encoding from pre-computed chunk CVs.
 *
 * @param {Uint8Array} data - Original data
 * @param {Array<Uint8Array>} chunkCVs - Pre-computed chunk CVs
 * @param {boolean} outboard - Outboard mode
 * @returns {{ encoded: Uint8Array, hash: Uint8Array }}
 */
function buildBaoFromCVs(data, chunkCVs, outboard) {
  const HEADER_SIZE = 8;
  const numChunks = chunkCVs.length;
  const totalLen = data.length;

  // Handle single chunk case - need to recompute with isRoot=true
  if (numChunks === 1) {
    const chunk = data.length <= CHUNK_LEN ? data : data.subarray(0, CHUNK_LEN);
    const rootHash = chunkCV(chunk, 0, true);
    const header = encodeLen(totalLen);

    if (outboard) {
      return { encoded: header, hash: rootHash };
    } else {
      const encoded = new Uint8Array(HEADER_SIZE + data.length);
      encoded.set(header, 0);
      encoded.set(data, HEADER_SIZE);
      return { encoded, hash: rootHash };
    }
  }

  // Calculate output size
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

  // Memoize subtree CV computations
  const cvCache = new Map();

  const getSubtreeCV = (startIdx, count) => {
    if (count === 1) return chunkCVs[startIdx];

    const key = `${startIdx}:${count}`;
    if (cvCache.has(key)) return cvCache.get(key);

    const leftCount = 1 << Math.floor(Math.log2(count - 1));
    const leftCV = getSubtreeCV(startIdx, leftCount);
    const rightCV = getSubtreeCV(startIdx + leftCount, count - leftCount);
    const cv = parentCV(leftCV, rightCV, false);
    cvCache.set(key, cv);
    return cv;
  };

  // Write tree in pre-order
  const writeTree = (startIdx, count, isRoot) => {
    if (count === 1) {
      // Leaf: write chunk data (combined mode only)
      if (!outboard) {
        const chunkStart = chunkDataIdx * CHUNK_LEN;
        const chunkEnd = Math.min(chunkStart + CHUNK_LEN, totalLen);
        const chunk = data.subarray(chunkStart, chunkEnd);
        output.set(chunk, writePos);
        writePos += chunk.length;
        chunkDataIdx++;
      }
      return chunkCVs[startIdx];
    }

    const leftCount = 1 << Math.floor(Math.log2(count - 1));
    const rightCount = count - leftCount;

    const leftCV = getSubtreeCV(startIdx, leftCount);
    const rightCV = getSubtreeCV(startIdx + leftCount, rightCount);

    // Pre-order: write parent node first
    output.set(leftCV, writePos);
    output.set(rightCV, writePos + 32);
    writePos += 64;

    // Then recurse into subtrees
    writeTree(startIdx, leftCount, false);
    writeTree(startIdx + leftCount, rightCount, false);

    return parentCV(leftCV, rightCV, isRoot);
  };

  const rootHash = writeTree(0, numChunks, true);

  return { encoded: output, hash: rootHash };
}

/**
 * Encode length as 8-byte little-endian.
 */
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
  chunkCV,
  parentCV,
  batchChunkCVs,
  batchParentCVs,
  baoEncodeWasm,

  // Constants
  CHUNK_LEN,
  HASH_SIZE
};

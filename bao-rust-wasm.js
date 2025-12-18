/**
 * Rust WASM SIMD-accelerated Bao operations.
 *
 * Uses the Rust-compiled WASM module with optimized BLAKE3 implementation.
 * Provides zero-copy buffer access for maximum performance.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const CHUNK_LEN = 1024;
const HASH_SIZE = 32;

// WASM module state
let wasmModule = null;
let wasmMemory = null;
let inputPtr = null;
let outputPtr = null;
let inputView = null;
let outputView = null;

/**
 * Initialize the Rust WASM module.
 * @returns {Promise<boolean>} True if initialization succeeded
 */
async function initWasm() {
  if (wasmModule) return true;

  try {
    const wasmPath = path.join(__dirname, 'rust-bao', 'pkg', 'bao_wasm_bg.wasm');
    const wasmBuffer = fs.readFileSync(wasmPath);

    // Create imports object
    const imports = {
      wbg: {
        __wbindgen_init_externref_table: function() {
          // Initialize externref table if present
          if (wasmModule && wasmModule.exports.__wbindgen_externrefs) {
            const table = wasmModule.exports.__wbindgen_externrefs;
            const offset = table.grow(4);
            table.set(0, undefined);
            table.set(offset + 0, undefined);
            table.set(offset + 1, null);
            table.set(offset + 2, true);
            table.set(offset + 3, false);
          }
        }
      }
    };

    const result = await WebAssembly.instantiate(wasmBuffer, imports);
    wasmModule = result.instance;

    // Call wasm start function if present
    if (wasmModule.exports.__wbindgen_start) {
      wasmModule.exports.__wbindgen_start();
    }

    wasmMemory = wasmModule.exports.memory;

    // Get buffer pointers
    inputPtr = wasmModule.exports.get_input_ptr();
    outputPtr = wasmModule.exports.get_output_ptr();

    // Create buffer views
    _refreshViews();

    return true;
  } catch (err) {
    console.warn('Rust WASM initialization failed:', err.message);
    return false;
  }
}

/**
 * Refresh memory views (needed if WASM memory grows).
 * @private
 */
function _refreshViews() {
  const memBuffer = new Uint8Array(wasmMemory.buffer);
  inputView = new Uint8Array(wasmMemory.buffer, inputPtr, 65536);
  outputView = new Uint8Array(wasmMemory.buffer, outputPtr, 65536);
}

/**
 * Check if memory buffer is detached.
 * @private
 */
function _checkMemory() {
  if (inputView.buffer !== wasmMemory.buffer) {
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
 * Get direct access to input buffer.
 * @returns {Uint8Array}
 */
function getInputBuffer() {
  _checkMemory();
  return inputView;
}

/**
 * Get direct access to output buffer.
 * @returns {Uint8Array}
 */
function getOutputBuffer() {
  _checkMemory();
  return outputView;
}

/**
 * Compute chunk CV using Rust WASM.
 * @param {Uint8Array} chunk - Chunk data (up to 1024 bytes)
 * @param {number} chunkIndex - Chunk counter
 * @param {boolean} isRoot - Whether this is the root node
 * @returns {Uint8Array} 32-byte chaining value
 */
function chunkCV(chunk, chunkIndex, isRoot) {
  if (!wasmModule) {
    throw new Error('WASM not initialized. Call initWasm() first.');
  }

  _checkMemory();
  inputView.set(chunk, 0);
  wasmModule.exports.chunk_cv(chunk.length, BigInt(chunkIndex), isRoot);
  return new Uint8Array(outputView.subarray(0, HASH_SIZE));
}

/**
 * Compute parent CV using Rust WASM.
 * @param {Uint8Array} leftCV - Left child CV (32 bytes)
 * @param {Uint8Array} rightCV - Right child CV (32 bytes)
 * @param {boolean} isRoot - Whether this is the root node
 * @returns {Uint8Array} 32-byte chaining value
 */
function parentCV(leftCV, rightCV, isRoot) {
  if (!wasmModule) {
    throw new Error('WASM not initialized. Call initWasm() first.');
  }

  _checkMemory();
  inputView.set(leftCV, 0);
  inputView.set(rightCV, 32);
  wasmModule.exports.parent_cv(isRoot);
  return new Uint8Array(outputView.subarray(0, HASH_SIZE));
}

/**
 * Batch compute chunk CVs using Rust WASM.
 * @param {Uint8Array} data - Data containing multiple chunks
 * @param {number} startIndex - Starting chunk index
 * @param {number} numChunks - Number of complete 1024-byte chunks
 * @returns {Array<Uint8Array>} Array of 32-byte CVs
 */
function batchChunkCVs(data, startIndex, numChunks) {
  if (!wasmModule) {
    throw new Error('WASM not initialized. Call initWasm() first.');
  }

  _checkMemory();
  const maxBatch = 64; // Max chunks per batch (64KB input buffer)
  const results = [];
  let processed = 0;

  while (processed < numChunks) {
    const batchSize = Math.min(numChunks - processed, maxBatch);
    const dataOffset = processed * CHUNK_LEN;

    // Copy batch data to input buffer
    inputView.set(data.subarray(dataOffset, dataOffset + batchSize * CHUNK_LEN), 0);

    // Process batch
    wasmModule.exports.batch_chunk_cvs(batchSize, BigInt(startIndex + processed));

    // Extract results
    for (let i = 0; i < batchSize; i++) {
      results.push(new Uint8Array(outputView.subarray(i * HASH_SIZE, (i + 1) * HASH_SIZE)));
    }

    processed += batchSize;
  }

  return results;
}

/**
 * Batch compute parent CVs using Rust WASM.
 * @param {Array<Array<Uint8Array>>} cvPairs - Array of [leftCV, rightCV] pairs
 * @param {number} rootIndex - Index of pair to mark as root (-1 for none)
 * @returns {Array<Uint8Array>} Array of parent CVs
 */
function batchParentCVs(cvPairs, rootIndex = -1) {
  if (!wasmModule) {
    throw new Error('WASM not initialized. Call initWasm() first.');
  }

  _checkMemory();
  const numPairs = cvPairs.length;
  const maxPairs = 1024; // Max pairs per batch
  const results = [];
  let processed = 0;

  while (processed < numPairs) {
    const batchSize = Math.min(numPairs - processed, maxPairs);

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

    // Process batch
    wasmModule.exports.batch_parent_cvs(batchSize, batchRootIndex);

    // Extract results
    for (let i = 0; i < batchSize; i++) {
      results.push(new Uint8Array(outputView.subarray(i * HASH_SIZE, (i + 1) * HASH_SIZE)));
    }

    processed += batchSize;
  }

  return results;
}

// Zero-copy direct API

/**
 * Compute chunk CV - zero-copy version.
 * PRECONDITION: Data must already be in input buffer.
 * @param {number} chunkLen - Number of bytes in input buffer
 * @param {number} chunkIndex - Chunk counter
 * @param {boolean} isRoot - Whether this is root
 * @returns {Uint8Array} VIEW into output buffer (copy if you need to keep it!)
 */
function chunkCVDirect(chunkLen, chunkIndex, isRoot) {
  _checkMemory();
  wasmModule.exports.chunk_cv(chunkLen, BigInt(chunkIndex), isRoot);
  return outputView.subarray(0, HASH_SIZE);
}

/**
 * Batch compute chunk CVs - zero-copy version.
 * PRECONDITION: numChunks * 1024 bytes in input buffer.
 * @param {number} numChunks - Number of chunks
 * @param {number} startIndex - Starting chunk index
 * @returns {Uint8Array} VIEW into output buffer
 */
function batchChunkCVsDirect(numChunks, startIndex) {
  _checkMemory();
  wasmModule.exports.batch_chunk_cvs(numChunks, BigInt(startIndex));
  return outputView.subarray(0, numChunks * HASH_SIZE);
}

/**
 * Get SIMD status info from the WASM module.
 * @returns {string} SIMD status message
 */
function getSimdInfo() {
  if (!wasmModule) {
    return 'WASM not initialized';
  }
  if (!wasmModule.exports.get_simd_info) {
    return 'get_simd_info not available';
  }
  // wasm-bindgen returns [ptr, len] tuple for strings
  const ret = wasmModule.exports.get_simd_info();
  const ptr = ret[0] >>> 0;
  const len = ret[1] >>> 0;
  // Read the string from WASM memory
  const memory = new Uint8Array(wasmMemory.buffer);
  const bytes = memory.slice(ptr, ptr + len);
  const decoder = new TextDecoder('utf-8');
  const result = decoder.decode(bytes);
  // Free the allocation
  wasmModule.exports.__wbindgen_free(ptr, len, 1);
  return result;
}

module.exports = {
  initWasm,
  isWasmEnabled,
  getSimdInfo,
  getInputBuffer,
  getOutputBuffer,
  chunkCV,
  parentCV,
  batchChunkCVs,
  batchParentCVs,
  chunkCVDirect,
  batchChunkCVsDirect,
  CHUNK_LEN,
  HASH_SIZE
};

/**
 * Rust WASM SIMD Worker for parallel chunk CV computation.
 *
 * This worker runs in a separate thread, loading its own WASM instance
 * for parallel SIMD-accelerated chunk processing.
 */
'use strict';

const { parentPort, workerData } = require('worker_threads');
const fs = require('fs');
const path = require('path');

const CHUNK_LEN = 1024;
const HASH_SIZE = 32;

// WASM module state (each worker has its own instance)
let wasmModule = null;
let wasmMemory = null;
let inputPtr = null;
let outputPtr = null;
let inputView = null;
let outputView = null;

/**
 * Initialize the Rust WASM module in this worker.
 */
async function initWasm() {
  if (wasmModule) return true;

  try {
    const wasmPath = path.join(__dirname, 'rust-bao', 'pkg', 'bao_wasm_bg.wasm');
    const wasmBuffer = fs.readFileSync(wasmPath);

    const importsObj = {};
    importsObj['__wbindgen_placeholder__'] = {
      __wbindgen_init_externref_table: function() {
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
    };

    const result = await WebAssembly.instantiate(wasmBuffer, importsObj);
    wasmModule = result.instance;

    if (wasmModule.exports.__wbindgen_start) {
      wasmModule.exports.__wbindgen_start();
    }

    wasmMemory = wasmModule.exports.memory;
    inputPtr = wasmModule.exports.get_input_ptr();
    outputPtr = wasmModule.exports.get_output_ptr();

    refreshViews();
    return true;
  } catch (err) {
    console.error('Worker WASM init failed:', err.message);
    return false;
  }
}

function refreshViews() {
  inputView = new Uint8Array(wasmMemory.buffer, inputPtr, 1048576);
  outputView = new Uint8Array(wasmMemory.buffer, outputPtr, 1048576);
}

function checkMemory() {
  if (inputView.buffer !== wasmMemory.buffer) {
    refreshViews();
  }
}

/**
 * Compute batch of chunk CVs.
 * @param {Uint8Array} data - Raw chunk data
 * @param {number} startIndex - Starting chunk index
 * @param {number} numChunks - Number of chunks
 * @returns {Uint8Array} Array of CVs (numChunks * 32 bytes)
 */
function batchChunkCVs(data, startIndex, numChunks) {
  checkMemory();

  const maxBatch = 256; // Max chunks per WASM call
  const results = new Uint8Array(numChunks * HASH_SIZE);
  let processed = 0;

  while (processed < numChunks) {
    const batchSize = Math.min(numChunks - processed, maxBatch);
    const dataOffset = processed * CHUNK_LEN;

    // Copy batch data to input buffer
    inputView.set(data.subarray(dataOffset, dataOffset + batchSize * CHUNK_LEN), 0);

    // Process batch
    wasmModule.exports.batch_chunk_cvs(batchSize, BigInt(startIndex + processed));

    // Copy results
    results.set(outputView.subarray(0, batchSize * HASH_SIZE), processed * HASH_SIZE);

    processed += batchSize;
  }

  return results;
}

/**
 * Compute single chunk CV.
 */
function chunkCV(chunk, chunkIndex, isRoot) {
  checkMemory();
  inputView.set(chunk, 0);
  wasmModule.exports.chunk_cv(chunk.length, BigInt(chunkIndex), isRoot);
  return new Uint8Array(outputView.subarray(0, HASH_SIZE));
}

/**
 * Compute batch of parent CVs.
 * @param {Uint8Array} cvPairs - CV pairs (numPairs * 64 bytes)
 * @param {number} numPairs - Number of CV pairs
 * @param {number} rootIndex - Index of root pair (-1 for none)
 * @returns {Uint8Array} Array of parent CVs (numPairs * 32 bytes)
 */
function batchParentCVs(cvPairs, numPairs, rootIndex) {
  checkMemory();

  const maxPairs = 4096; // Max pairs per WASM call (256KB / 64 bytes)
  const results = new Uint8Array(numPairs * HASH_SIZE);
  let processed = 0;

  while (processed < numPairs) {
    const batchSize = Math.min(numPairs - processed, maxPairs);
    const dataOffset = processed * 64;

    // Copy pairs to input buffer
    inputView.set(cvPairs.subarray(dataOffset, dataOffset + batchSize * 64), 0);

    // Determine root index for this batch
    let batchRootIndex = -1;
    if (rootIndex >= processed && rootIndex < processed + batchSize) {
      batchRootIndex = rootIndex - processed;
    }

    // Process batch
    wasmModule.exports.batch_parent_cvs(batchSize, batchRootIndex);

    // Copy results
    results.set(outputView.subarray(0, batchSize * HASH_SIZE), processed * HASH_SIZE);

    processed += batchSize;
  }

  return results;
}

// Initialize WASM on worker start
initWasm().then(ok => {
  if (ok) {
    parentPort.postMessage({ type: 'ready', workerId: workerData.workerId });
  } else {
    parentPort.postMessage({ type: 'error', error: 'WASM init failed' });
  }
});

// Handle messages from main thread
parentPort.on('message', (msg) => {
  try {
    switch (msg.type) {
      case 'batchChunkCVs': {
        const { taskId, data, startIndex, numChunks } = msg;
        const cvs = batchChunkCVs(new Uint8Array(data), startIndex, numChunks);
        parentPort.postMessage({
          type: 'result',
          taskId,
          cvs: cvs.buffer
        }, [cvs.buffer]);
        break;
      }

      case 'chunkCV': {
        const { taskId, chunk, chunkIndex, isRoot } = msg;
        const cv = chunkCV(new Uint8Array(chunk), chunkIndex, isRoot);
        parentPort.postMessage({
          type: 'result',
          taskId,
          cv: cv.buffer
        }, [cv.buffer]);
        break;
      }

      case 'batchParentCVs': {
        const { taskId, cvPairs, numPairs, rootIndex } = msg;
        const cvs = batchParentCVs(new Uint8Array(cvPairs), numPairs, rootIndex);
        parentPort.postMessage({
          type: 'result',
          taskId,
          cvs: cvs.buffer
        }, [cvs.buffer]);
        break;
      }

      case 'shutdown':
        process.exit(0);
        break;

      default:
        parentPort.postMessage({ type: 'error', error: `Unknown message type: ${msg.type}` });
    }
  } catch (err) {
    parentPort.postMessage({ type: 'error', error: err.message, taskId: msg.taskId });
  }
});

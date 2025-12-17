/**
 * Web Worker for parallel Bao chunk processing.
 *
 * Processes chunks in parallel and returns CVs.
 * Works in both browser (Web Workers) and Node.js (worker_threads).
 */
'use strict';

// Detect environment
const isNode = typeof process !== 'undefined' && process.versions && process.versions.node;

let parentPort, workerData;
if (isNode) {
  try {
    const wt = require('worker_threads');
    parentPort = wt.parentPort;
    workerData = wt.workerData;
  } catch (e) {
    // Not in a worker thread
  }
}

// Import Bao functions (will be initialized via message in browser)
let chunkCV, parentCV;

if (isNode) {
  const bao = require('./bao.js');
  chunkCV = bao.chunkCV;
  parentCV = bao.parentCV;
}

/**
 * Process a batch of chunks and return their CVs.
 *
 * @param {Object} task - Task data
 * @param {Uint8Array} task.data - Data buffer (already sliced to this worker's portion)
 * @param {number} task.startChunk - Starting chunk index (global)
 * @param {number} task.endChunk - Ending chunk index (exclusive, global)
 * @param {number} task.chunkSize - Size of each chunk (1024)
 * @param {number} task.totalLen - Total data length (for determining last chunk size)
 * @returns {Array<Uint8Array>} Array of chunk CVs
 */
function processChunks(task) {
  const { data, startChunk, endChunk, chunkSize, totalLen } = task;
  const cvs = [];

  for (let i = startChunk; i < endChunk; i++) {
    // Offset within the received data buffer (not global offset)
    const localOffset = (i - startChunk) * chunkSize;
    // Calculate actual chunk end considering total file length
    const globalOffset = i * chunkSize;
    const globalEnd = Math.min(globalOffset + chunkSize, totalLen);
    const actualChunkSize = globalEnd - globalOffset;

    const chunk = data.subarray(localOffset, localOffset + actualChunkSize);

    // Compute chunk CV (not root - that's determined at merge time)
    const cv = chunkCV(chunk, i, false);
    cvs.push(cv);
  }

  return cvs;
}

/**
 * Merge a sequence of CVs into a tree.
 *
 * @param {Array<Uint8Array>} cvs - Chunk CVs
 * @param {number} startIdx - Starting index for this subtree
 * @param {boolean} isRoot - Whether this produces the root CV
 * @returns {Uint8Array} Subtree CV
 */
function mergeCVs(cvs, startIdx, isRoot) {
  if (cvs.length === 1) {
    return cvs[0];
  }

  // Split using left-balanced tree
  const leftCount = 1 << Math.floor(Math.log2(cvs.length - 1));
  const leftCVs = cvs.slice(0, leftCount);
  const rightCVs = cvs.slice(leftCount);

  const leftCV = mergeCVs(leftCVs, startIdx, false);
  const rightCV = mergeCVs(rightCVs, startIdx + leftCount, false);

  return parentCV(leftCV, rightCV, isRoot);
}

// Message handler
function handleMessage(msg) {
  const { id, type, payload } = msg;

  try {
    let result;

    switch (type) {
      case 'init':
        // Initialize with Bao functions (for browser)
        // In Node.js, already loaded
        result = { ready: true };
        break;

      case 'processChunks':
        result = processChunks(payload);
        break;

      case 'mergeCVs':
        result = mergeCVs(payload.cvs, payload.startIdx, payload.isRoot);
        break;

      default:
        throw new Error(`Unknown message type: ${type}`);
    }

    return { id, success: true, result };
  } catch (error) {
    return { id, success: false, error: error.message };
  }
}

// Set up message handling based on environment
if (isNode && parentPort) {
  parentPort.on('message', (msg) => {
    const response = handleMessage(msg);
    parentPort.postMessage(response);
  });
} else if (typeof self !== 'undefined' && typeof self.onmessage !== 'undefined') {
  // Browser Web Worker
  self.onmessage = function(e) {
    const response = handleMessage(e.data);
    self.postMessage(response);
  };
}

// Export for testing
if (typeof module !== 'undefined') {
  module.exports = { processChunks, mergeCVs, handleMessage };
}

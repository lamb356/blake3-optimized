/**
 * Parallel Bao encoder using Web Workers / worker_threads.
 *
 * Provides significant speedup for large files by processing
 * chunks in parallel across multiple CPU cores.
 */
'use strict';

const bao = require('./bao.js');
const { chunkCV, parentCV, encodeLen, CHUNK_LEN, HASH_SIZE, HEADER_SIZE } = bao;

// Detect environment
const isNode = typeof process !== 'undefined' && process.versions && process.versions.node;

let Worker, workerPath;
if (isNode) {
  try {
    Worker = require('worker_threads').Worker;
    workerPath = require('path').join(__dirname, 'bao-worker.js');
  } catch (e) {
    // worker_threads not available
  }
}

/**
 * Get optimal worker count based on available CPU cores.
 *
 * @returns {number} Number of workers to use
 */
function getOptimalWorkerCount() {
  if (isNode) {
    const os = require('os');
    return Math.max(1, os.cpus().length - 1);
  } else if (typeof navigator !== 'undefined' && navigator.hardwareConcurrency) {
    return Math.max(1, navigator.hardwareConcurrency - 1);
  }
  return 4; // Default fallback
}

/**
 * Parallel Bao encoder for large files.
 *
 * For files larger than the threshold (default 1MB), uses multiple workers
 * to process chunks in parallel, then merges results.
 *
 * @example
 * ```javascript
 * const encoder = new ParallelBaoEncoder();
 * await encoder.init();
 * const { encoded, hash } = await encoder.encode(largeData, { outboard: true });
 * encoder.terminate();
 * ```
 */
class ParallelBaoEncoder {
  /**
   * Create a parallel Bao encoder.
   *
   * @param {Object} options - Configuration options
   * @param {number} [options.workerCount] - Number of workers (default: CPU cores - 1)
   * @param {number} [options.parallelThreshold] - Min size for parallel processing (default: 10MB)
   * @param {number} [options.minChunksPerWorker] - Min chunks per worker (default: 256 = 256KB)
   */
  constructor(options = {}) {
    this.workerCount = options.workerCount || getOptimalWorkerCount();
    this.parallelThreshold = options.parallelThreshold || 10 * 1024 * 1024; // 10MB default
    this.minChunksPerWorker = options.minChunksPerWorker || 256; // 256KB per worker minimum
    this.workers = [];
    this.taskId = 0;
    this.pendingTasks = new Map();
    this.initialized = false;
  }

  /**
   * Initialize the worker pool.
   *
   * @returns {Promise<void>}
   */
  async init() {
    if (this.initialized) return;

    if (!Worker) {
      // Workers not available - will fall back to single-threaded
      this.initialized = true;
      return;
    }

    const initPromises = [];

    for (let i = 0; i < this.workerCount; i++) {
      const worker = new Worker(workerPath);

      // Set up message handling
      worker.on('message', (msg) => {
        const { id, success, result, error } = msg;
        const task = this.pendingTasks.get(id);
        if (task) {
          this.pendingTasks.delete(id);
          if (success) {
            task.resolve(result);
          } else {
            task.reject(new Error(error));
          }
        }
      });

      worker.on('error', (err) => {
        console.error('Worker error:', err);
      });

      this.workers.push(worker);

      // Initialize worker
      initPromises.push(this._sendToWorker(worker, 'init', {}));
    }

    await Promise.all(initPromises);
    this.initialized = true;
  }

  /**
   * Send a message to a worker and wait for response.
   *
   * @param {Worker} worker - The worker to send to
   * @param {string} type - Message type
   * @param {any} payload - Message payload
   * @returns {Promise<any>} Worker response
   */
  _sendToWorker(worker, type, payload) {
    return new Promise((resolve, reject) => {
      const id = ++this.taskId;
      this.pendingTasks.set(id, { resolve, reject });
      worker.postMessage({ id, type, payload });
    });
  }

  /**
   * Encode data using parallel processing.
   *
   * @param {Uint8Array|string} data - Data to encode
   * @param {Object} [options] - Encoding options
   * @param {boolean} [options.outboard=false] - If true, produce outboard format
   * @returns {Promise<{encoded: Uint8Array, hash: Uint8Array}>}
   */
  async encode(data, options = {}) {
    if (typeof data === 'string') {
      data = new TextEncoder().encode(data);
    }
    if (!(data instanceof Uint8Array)) {
      data = new Uint8Array(data);
    }

    const outboard = options.outboard || false;

    // For small files or if workers not available, use single-threaded
    if (data.length < this.parallelThreshold || this.workers.length === 0) {
      return bao.baoEncode(data, outboard);
    }

    // Calculate chunk distribution - ensure each worker gets enough work
    const numChunks = Math.ceil(data.length / CHUNK_LEN) || 1;
    const effectiveWorkers = Math.min(
      this.workerCount,
      Math.floor(numChunks / this.minChunksPerWorker) || 1
    );
    const chunksPerWorker = Math.ceil(numChunks / effectiveWorkers);

    // Phase 1: Compute chunk CVs in parallel
    const cvPromises = [];
    for (let i = 0; i < effectiveWorkers; i++) {
      const startChunk = i * chunksPerWorker;
      const endChunk = Math.min(startChunk + chunksPerWorker, numChunks);

      if (startChunk >= numChunks) break;

      const worker = this.workers[i % this.workers.length];
      const startOffset = startChunk * CHUNK_LEN;
      const endOffset = Math.min(endChunk * CHUNK_LEN, data.length);

      // Send chunk data to worker
      cvPromises.push(
        this._sendToWorker(worker, 'processChunks', {
          data: data.subarray(startOffset, endOffset),
          startChunk,
          endChunk,
          chunkSize: CHUNK_LEN,
          totalLen: data.length
        })
      );
    }

    // Wait for all chunk CVs
    const cvArrays = await Promise.all(cvPromises);
    const allCVs = cvArrays.flat();

    // Phase 2: Build tree (single-threaded for correctness)
    // This is fast since we're just merging CVs, not hashing chunks
    return this._buildTreeFromCVs(data, allCVs, outboard);
  }

  /**
   * Build the Bao tree from pre-computed chunk CVs.
   *
   * @param {Uint8Array} data - Original data
   * @param {Array<Uint8Array>} chunkCVs - Pre-computed chunk CVs
   * @param {boolean} outboard - Whether to produce outboard format
   * @returns {{encoded: Uint8Array, hash: Uint8Array}}
   */
  _buildTreeFromCVs(data, chunkCVs, outboard) {
    const numChunks = chunkCVs.length;
    const totalLen = data.length;

    // Handle single chunk case - need to recompute with isRoot=true
    if (numChunks === 1) {
      const rootHash = chunkCV(data, 0, true);
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
   * Terminate all workers.
   */
  terminate() {
    for (const worker of this.workers) {
      worker.terminate();
    }
    this.workers = [];
    this.initialized = false;
  }

  /**
   * Get the number of active workers.
   *
   * @returns {number}
   */
  getWorkerCount() {
    return this.workers.length;
  }
}

/**
 * Convenience function for one-shot parallel encoding.
 *
 * @param {Uint8Array|string} data - Data to encode
 * @param {Object} [options] - Options
 * @param {boolean} [options.outboard=false] - Outboard mode
 * @param {number} [options.workerCount] - Number of workers
 * @returns {Promise<{encoded: Uint8Array, hash: Uint8Array}>}
 */
async function parallelEncode(data, options = {}) {
  const encoder = new ParallelBaoEncoder(options);
  await encoder.init();
  try {
    return await encoder.encode(data, options);
  } finally {
    encoder.terminate();
  }
}

module.exports = {
  ParallelBaoEncoder,
  parallelEncode,
  getOptimalWorkerCount
};

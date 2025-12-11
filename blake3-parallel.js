/**
 * BLAKE3 Parallel - Multi-threaded hashing using Web Workers
 *
 * Architecture:
 * - Main thread splits large inputs into power-of-2 aligned subtrees
 * - Workers process subtrees independently using SIMD
 * - Main thread merges returned CVs into final hash
 *
 * This can potentially beat native SHA256 at all input sizes!
 */

const { Worker } = require('worker_threads');
const path = require('path');

const IV = new Uint32Array([
  0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
  0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
]);

const BLOCK_LEN = 64;
const CHUNK_LEN = 1024;
const PARENT = 4;
const ROOT = 8;

// Scalar compress for final merging
function compress(cv, cvOffset, m, mOffset, out, outOffset, truncateOutput, counter, blockLen, flags) {
  let m_0 = m[mOffset + 0] | 0, m_1 = m[mOffset + 1] | 0, m_2 = m[mOffset + 2] | 0, m_3 = m[mOffset + 3] | 0;
  let m_4 = m[mOffset + 4] | 0, m_5 = m[mOffset + 5] | 0, m_6 = m[mOffset + 6] | 0, m_7 = m[mOffset + 7] | 0;
  let m_8 = m[mOffset + 8] | 0, m_9 = m[mOffset + 9] | 0, m_10 = m[mOffset + 10] | 0, m_11 = m[mOffset + 11] | 0;
  let m_12 = m[mOffset + 12] | 0, m_13 = m[mOffset + 13] | 0, m_14 = m[mOffset + 14] | 0, m_15 = m[mOffset + 15] | 0;

  let s_0 = cv[cvOffset + 0] | 0, s_1 = cv[cvOffset + 1] | 0, s_2 = cv[cvOffset + 2] | 0, s_3 = cv[cvOffset + 3] | 0;
  let s_4 = cv[cvOffset + 4] | 0, s_5 = cv[cvOffset + 5] | 0, s_6 = cv[cvOffset + 6] | 0, s_7 = cv[cvOffset + 7] | 0;
  let s_8 = 0x6a09e667 | 0, s_9 = 0xbb67ae85 | 0, s_10 = 0x3c6ef372 | 0, s_11 = 0xa54ff53a | 0;
  let s_12 = counter | 0, s_13 = (counter / 0x100000000) | 0, s_14 = blockLen | 0, s_15 = flags | 0;

  for (let r = 0; r < 7; r++) {
    s_0 = (((s_0 + s_4) | 0) + m_0) | 0; s_12 ^= s_0; s_12 = (s_12 >>> 16) | (s_12 << 16);
    s_8 = (s_8 + s_12) | 0; s_4 ^= s_8; s_4 = (s_4 >>> 12) | (s_4 << 20);
    s_0 = (((s_0 + s_4) | 0) + m_1) | 0; s_12 ^= s_0; s_12 = (s_12 >>> 8) | (s_12 << 24);
    s_8 = (s_8 + s_12) | 0; s_4 ^= s_8; s_4 = (s_4 >>> 7) | (s_4 << 25);

    s_1 = (((s_1 + s_5) | 0) + m_2) | 0; s_13 ^= s_1; s_13 = (s_13 >>> 16) | (s_13 << 16);
    s_9 = (s_9 + s_13) | 0; s_5 ^= s_9; s_5 = (s_5 >>> 12) | (s_5 << 20);
    s_1 = (((s_1 + s_5) | 0) + m_3) | 0; s_13 ^= s_1; s_13 = (s_13 >>> 8) | (s_13 << 24);
    s_9 = (s_9 + s_13) | 0; s_5 ^= s_9; s_5 = (s_5 >>> 7) | (s_5 << 25);

    s_2 = (((s_2 + s_6) | 0) + m_4) | 0; s_14 ^= s_2; s_14 = (s_14 >>> 16) | (s_14 << 16);
    s_10 = (s_10 + s_14) | 0; s_6 ^= s_10; s_6 = (s_6 >>> 12) | (s_6 << 20);
    s_2 = (((s_2 + s_6) | 0) + m_5) | 0; s_14 ^= s_2; s_14 = (s_14 >>> 8) | (s_14 << 24);
    s_10 = (s_10 + s_14) | 0; s_6 ^= s_10; s_6 = (s_6 >>> 7) | (s_6 << 25);

    s_3 = (((s_3 + s_7) | 0) + m_6) | 0; s_15 ^= s_3; s_15 = (s_15 >>> 16) | (s_15 << 16);
    s_11 = (s_11 + s_15) | 0; s_7 ^= s_11; s_7 = (s_7 >>> 12) | (s_7 << 20);
    s_3 = (((s_3 + s_7) | 0) + m_7) | 0; s_15 ^= s_3; s_15 = (s_15 >>> 8) | (s_15 << 24);
    s_11 = (s_11 + s_15) | 0; s_7 ^= s_11; s_7 = (s_7 >>> 7) | (s_7 << 25);

    s_0 = (((s_0 + s_5) | 0) + m_8) | 0; s_15 ^= s_0; s_15 = (s_15 >>> 16) | (s_15 << 16);
    s_10 = (s_10 + s_15) | 0; s_5 ^= s_10; s_5 = (s_5 >>> 12) | (s_5 << 20);
    s_0 = (((s_0 + s_5) | 0) + m_9) | 0; s_15 ^= s_0; s_15 = (s_15 >>> 8) | (s_15 << 24);
    s_10 = (s_10 + s_15) | 0; s_5 ^= s_10; s_5 = (s_5 >>> 7) | (s_5 << 25);

    s_1 = (((s_1 + s_6) | 0) + m_10) | 0; s_12 ^= s_1; s_12 = (s_12 >>> 16) | (s_12 << 16);
    s_11 = (s_11 + s_12) | 0; s_6 ^= s_11; s_6 = (s_6 >>> 12) | (s_6 << 20);
    s_1 = (((s_1 + s_6) | 0) + m_11) | 0; s_12 ^= s_1; s_12 = (s_12 >>> 8) | (s_12 << 24);
    s_11 = (s_11 + s_12) | 0; s_6 ^= s_11; s_6 = (s_6 >>> 7) | (s_6 << 25);

    s_2 = (((s_2 + s_7) | 0) + m_12) | 0; s_13 ^= s_2; s_13 = (s_13 >>> 16) | (s_13 << 16);
    s_8 = (s_8 + s_13) | 0; s_7 ^= s_8; s_7 = (s_7 >>> 12) | (s_7 << 20);
    s_2 = (((s_2 + s_7) | 0) + m_13) | 0; s_13 ^= s_2; s_13 = (s_13 >>> 8) | (s_13 << 24);
    s_8 = (s_8 + s_13) | 0; s_7 ^= s_8; s_7 = (s_7 >>> 7) | (s_7 << 25);

    s_3 = (((s_3 + s_4) | 0) + m_14) | 0; s_14 ^= s_3; s_14 = (s_14 >>> 16) | (s_14 << 16);
    s_9 = (s_9 + s_14) | 0; s_4 ^= s_9; s_4 = (s_4 >>> 12) | (s_4 << 20);
    s_3 = (((s_3 + s_4) | 0) + m_15) | 0; s_14 ^= s_3; s_14 = (s_14 >>> 8) | (s_14 << 24);
    s_9 = (s_9 + s_14) | 0; s_4 ^= s_9; s_4 = (s_4 >>> 7) | (s_4 << 25);

    const t0 = m_0, t1 = m_1, t2 = m_2, t3 = m_3, t4 = m_4, t5 = m_5, t6 = m_6, t7 = m_7;
    const t8 = m_8, t9 = m_9, t10 = m_10, t11 = m_11, t12 = m_12, t13 = m_13, t14 = m_14, t15 = m_15;
    m_0 = t2; m_1 = t6; m_2 = t3; m_3 = t10; m_4 = t7; m_5 = t0; m_6 = t4; m_7 = t13;
    m_8 = t1; m_9 = t11; m_10 = t12; m_11 = t5; m_12 = t9; m_13 = t14; m_14 = t15; m_15 = t8;
  }

  out[outOffset + 0] = s_0 ^ s_8;
  out[outOffset + 1] = s_1 ^ s_9;
  out[outOffset + 2] = s_2 ^ s_10;
  out[outOffset + 3] = s_3 ^ s_11;
  out[outOffset + 4] = s_4 ^ s_12;
  out[outOffset + 5] = s_5 ^ s_13;
  out[outOffset + 6] = s_6 ^ s_14;
  out[outOffset + 7] = s_7 ^ s_15;
}

function wordsToBytes(words) {
  const bytes = new Uint8Array(words.length * 4);
  const view = new DataView(bytes.buffer);
  for (let i = 0; i < words.length; i++) {
    view.setUint32(i * 4, words[i], true);
  }
  return bytes;
}

class Blake3Parallel {
  constructor(numWorkers = 4) {
    this.numWorkers = numWorkers;
    this.workers = [];
    this.initialized = false;
    this.pendingTasks = new Map();
    this.taskIdCounter = 0;
  }

  async init() {
    if (this.initialized) return;

    const workerPath = path.join(__dirname, 'blake3-worker.js');

    // Create workers
    const initPromises = [];
    for (let i = 0; i < this.numWorkers; i++) {
      const worker = new Worker(workerPath);
      this.workers.push(worker);

      // Set up message handler
      worker.on('message', (msg) => {
        const task = this.pendingTasks.get(msg.taskId);
        if (task) {
          task.resolve(msg);
          this.pendingTasks.delete(msg.taskId);
        }
      });

      // Initialize worker
      initPromises.push(this._sendToWorker(worker, { type: 'init' }));
    }

    await Promise.all(initPromises);
    this.initialized = true;
  }

  _sendToWorker(worker, message) {
    return new Promise((resolve) => {
      const taskId = this.taskIdCounter++;
      this.pendingTasks.set(taskId, { resolve });
      worker.postMessage({ ...message, taskId });
    });
  }

  async hash(input, outputLen = 32) {
    if (!this.initialized) await this.init();

    if (typeof input === 'string') {
      input = Buffer.from(input);
    }
    if (!(input instanceof Uint8Array)) {
      input = new Uint8Array(input);
    }

    const totalLen = input.length;
    const numChunks = Math.ceil(totalLen / CHUNK_LEN);

    // For small inputs, use single-threaded
    // Threshold: at least 16 chunks per worker to make parallelism worthwhile
    const minChunksForParallel = this.numWorkers * 16;
    if (numChunks < minChunksForParallel) {
      // Fall back to single-threaded (import the main blake3 module)
      const blake3 = require('./blake3.js');
      if (!blake3.isSimdEnabled()) await blake3.initSimd();
      return blake3.hash(input, outputLen);
    }

    // Divide work among workers
    // Each worker gets a power-of-2 number of chunks for easy merging
    const chunksPerWorker = Math.floor(numChunks / this.numWorkers);
    const subtreeSize = 1 << Math.floor(Math.log2(chunksPerWorker)); // Largest power of 2 <= chunksPerWorker

    // Distribute subtrees to workers
    const tasks = [];
    let offset = 0;
    let chunkCounter = 0;

    for (let i = 0; i < this.numWorkers && offset < totalLen; i++) {
      const remainingChunks = Math.ceil((totalLen - offset) / CHUNK_LEN);
      const workerChunks = Math.min(subtreeSize, remainingChunks);

      if (workerChunks > 0) {
        const workerData = input.slice(offset, offset + workerChunks * CHUNK_LEN);
        tasks.push(this._sendToWorker(this.workers[i], {
          type: 'process',
          data: workerData,
          startOffset: 0,
          numChunks: workerChunks,
          baseChunkCounter: chunkCounter
        }));

        offset += workerChunks * CHUNK_LEN;
        chunkCounter += workerChunks;
      }
    }

    // Wait for all workers
    const results = await Promise.all(tasks);

    // Merge CVs from workers
    const cvs = results.map(r => new Uint32Array(r.cv));

    // Merge CVs pairwise until we have a single root
    while (cvs.length > 1) {
      const newCvs = [];
      for (let i = 0; i < cvs.length; i += 2) {
        if (i + 1 < cvs.length) {
          // Merge pair
          const parentBlock = new Uint32Array(16);
          parentBlock.set(cvs[i], 0);
          parentBlock.set(cvs[i + 1], 8);
          const out = new Uint32Array(8);
          const isRoot = cvs.length === 2;
          compress(IV, 0, parentBlock, 0, out, 0, true, 0, BLOCK_LEN, PARENT | (isRoot ? ROOT : 0));
          newCvs.push(out);
        } else {
          // Odd one out, carry forward
          newCvs.push(cvs[i]);
        }
      }
      cvs.length = 0;
      cvs.push(...newCvs);
    }

    return wordsToBytes(cvs[0]).slice(0, outputLen);
  }

  terminate() {
    for (const worker of this.workers) {
      worker.terminate();
    }
    this.workers = [];
    this.initialized = false;
  }
}

// Export
module.exports = { Blake3Parallel };

// CLI test
if (require.main === module) {
  const os = require('os');

  (async () => {
    const numCPUs = os.cpus().length;
    console.log('BLAKE3 Parallel - Multi-threaded Benchmark');
    console.log('==========================================');
    console.log('CPU cores:', numCPUs);
    console.log('');

    // Test with different worker counts
    for (const numWorkers of [1, 2, 4, Math.min(8, numCPUs)]) {
      console.log(`Testing with ${numWorkers} workers:`);

      const hasher = new Blake3Parallel(numWorkers);
      await hasher.init();

      // Test data sizes
      const sizes = [
        ['64 KB', 64 * 1024],
        ['256 KB', 256 * 1024],
        ['1 MB', 1024 * 1024],
        ['4 MB', 4 * 1024 * 1024],
        ['16 MB', 16 * 1024 * 1024],
      ];

      for (const [name, size] of sizes) {
        const data = new Uint8Array(size);
        for (let i = 0; i < size; i++) data[i] = i & 0xff;

        // Warmup
        await hasher.hash(data);

        // Benchmark
        const iterations = Math.max(1, Math.floor(100 * 1024 * 1024 / size));
        const start = performance.now();
        for (let i = 0; i < iterations; i++) {
          await hasher.hash(data);
        }
        const elapsed = performance.now() - start;
        const throughput = (size * iterations / 1024 / 1024) / (elapsed / 1000);
        console.log(`  ${name.padEnd(10)} ${throughput.toFixed(1).padStart(8)} MB/s`);
      }

      hasher.terminate();
      console.log('');
    }
  })();
}

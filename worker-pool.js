/**
 * Persistent Worker Pool for Bao encoding.
 *
 * Keeps workers alive across multiple encode calls for better amortized performance.
 * Workers are created once and reused, eliminating startup overhead for batch processing.
 */
'use strict';

const { Worker } = require('worker_threads');
const path = require('path');
const os = require('os');

const CHUNK_LEN = 1024;
const HASH_SIZE = 32;

// Singleton pool instance
let poolInstance = null;

class PersistentWorkerPool {
  /**
   * Create a persistent worker pool.
   * @param {number} numWorkers - Number of worker threads
   */
  constructor(numWorkers = null) {
    this.numWorkers = numWorkers || Math.min(os.cpus().length, 8);
    this.workers = [];
    this.workerReady = [];
    this.taskId = 0;
    this.pendingTasks = new Map();
    this.initialized = false;
    this.workerPath = path.join(__dirname, 'bao-rust-worker.js');
    this.totalTasksProcessed = 0;
  }

  /**
   * Initialize all worker threads.
   * @returns {Promise<boolean>}
   */
  async init() {
    if (this.initialized) return true;

    const workerPromises = [];

    for (let i = 0; i < this.numWorkers; i++) {
      workerPromises.push(this._createWorker(i));
    }

    try {
      await Promise.all(workerPromises);
      this.initialized = true;
      return true;
    } catch (err) {
      console.error('Failed to initialize worker pool:', err);
      await this.shutdown();
      return false;
    }
  }

  /**
   * Create a single worker.
   * @private
   */
  _createWorker(workerId) {
    return new Promise((resolve, reject) => {
      const worker = new Worker(this.workerPath, {
        workerData: { workerId }
      });

      const timeout = setTimeout(() => {
        reject(new Error(`Worker ${workerId} init timeout`));
      }, 10000);

      worker.on('message', (msg) => {
        if (msg.type === 'ready') {
          clearTimeout(timeout);
          this.workers[workerId] = worker;
          this.workerReady[workerId] = true;
          this._setupWorkerHandlers(worker, workerId);
          resolve(worker);
        } else if (msg.type === 'error' && !this.workers[workerId]) {
          clearTimeout(timeout);
          reject(new Error(msg.error));
        }
      });

      worker.on('error', (err) => {
        clearTimeout(timeout);
        reject(err);
      });
    });
  }

  /**
   * Setup message handlers for a worker.
   * @private
   */
  _setupWorkerHandlers(worker, workerId) {
    worker.on('message', (msg) => {
      if (msg.type === 'result' || msg.type === 'error') {
        const task = this.pendingTasks.get(msg.taskId);
        if (task) {
          this.pendingTasks.delete(msg.taskId);
          this.workerReady[workerId] = true;
          this.totalTasksProcessed++;

          if (msg.type === 'result') {
            task.resolve(msg);
          } else {
            task.reject(new Error(msg.error));
          }
        }
      }
    });

    worker.on('error', (err) => {
      console.error(`Worker ${workerId} error:`, err);
      this.workerReady[workerId] = false;
    });
  }

  /**
   * Execute a task on an available worker.
   * @param {Object} message - Task message to send
   * @returns {Promise<Object>} Task result
   */
  async executeTask(message) {
    if (!this.initialized) {
      throw new Error('Worker pool not initialized. Call init() first.');
    }

    // Find available worker (round-robin with availability check)
    let workerId = -1;
    for (let i = 0; i < this.numWorkers; i++) {
      if (this.workerReady[i]) {
        workerId = i;
        break;
      }
    }

    // If no worker available, wait for one
    if (workerId === -1) {
      await this._waitForWorker();
      for (let i = 0; i < this.numWorkers; i++) {
        if (this.workerReady[i]) {
          workerId = i;
          break;
        }
      }
    }

    return this._sendTask(workerId, message);
  }

  /**
   * Execute batch chunk CVs across all workers in parallel.
   * @param {Uint8Array} data - Data to process
   * @param {number} startIndex - Starting chunk index
   * @returns {Promise<Uint8Array[]>} Array of CVs
   */
  async batchChunkCVsParallel(data, startIndex = 0) {
    if (!this.initialized) {
      throw new Error('Worker pool not initialized. Call init() first.');
    }

    const totalChunks = Math.floor(data.length / CHUNK_LEN);
    if (totalChunks === 0) {
      return [];
    }

    // Divide work among workers
    const chunksPerWorker = Math.ceil(totalChunks / this.numWorkers);
    const tasks = [];

    for (let i = 0; i < this.numWorkers && i * chunksPerWorker < totalChunks; i++) {
      const workerStartChunk = i * chunksPerWorker;
      const workerEndChunk = Math.min(workerStartChunk + chunksPerWorker, totalChunks);
      const workerNumChunks = workerEndChunk - workerStartChunk;

      const dataStart = workerStartChunk * CHUNK_LEN;
      const dataEnd = workerEndChunk * CHUNK_LEN;
      const workerData = data.slice(dataStart, dataEnd);

      tasks.push({
        workerId: i,
        startChunk: workerStartChunk,
        numChunks: workerNumChunks,
        data: workerData
      });
    }

    // Send all tasks in parallel
    const taskPromises = tasks.map(task => {
      return this._sendTask(task.workerId, {
        type: 'batchChunkCVs',
        data: task.data.buffer,
        startIndex: startIndex + task.startChunk,
        numChunks: task.numChunks,
        transfer: [task.data.buffer]
      }).then(result => ({
        startChunk: task.startChunk,
        cvs: new Uint8Array(result.cvs)
      }));
    });

    // Wait for all workers to complete
    const results = await Promise.all(taskPromises);

    // Combine results in order
    const allCVs = [];
    results.sort((a, b) => a.startChunk - b.startChunk);

    for (const result of results) {
      for (let i = 0; i < result.cvs.length; i += HASH_SIZE) {
        allCVs.push(result.cvs.slice(i, i + HASH_SIZE));
      }
    }

    return allCVs;
  }

  /**
   * Send task to a specific worker.
   * @private
   */
  _sendTask(workerId, message) {
    return new Promise((resolve, reject) => {
      const taskId = this.taskId++;
      message.taskId = taskId;

      this.pendingTasks.set(taskId, { resolve, reject, workerId });
      this.workerReady[workerId] = false;
      this.workers[workerId].postMessage(message, message.transfer || []);
    });
  }

  /**
   * Wait for a worker to become available.
   * @private
   */
  async _waitForWorker() {
    while (true) {
      for (let i = 0; i < this.numWorkers; i++) {
        if (this.workerReady[i]) return;
      }
      await new Promise(resolve => setTimeout(resolve, 0));
    }
  }

  /**
   * Get pool statistics.
   * @returns {Object} Pool stats
   */
  getStats() {
    return {
      numWorkers: this.numWorkers,
      initialized: this.initialized,
      totalTasksProcessed: this.totalTasksProcessed,
      activeWorkers: this.workers.filter(w => w !== null).length,
      readyWorkers: this.workerReady.filter(r => r).length
    };
  }

  /**
   * Shutdown all workers.
   */
  async shutdown() {
    const shutdownPromises = this.workers.map((worker, i) => {
      if (worker) {
        return new Promise(resolve => {
          worker.postMessage({ type: 'shutdown' });
          worker.on('exit', resolve);
          setTimeout(resolve, 1000);
        });
      }
      return Promise.resolve();
    });

    await Promise.all(shutdownPromises);
    this.workers = [];
    this.workerReady = [];
    this.initialized = false;
    poolInstance = null;
  }
}

/**
 * Get or create singleton worker pool.
 * @param {number} numWorkers - Number of workers (only used on first call)
 * @returns {Promise<PersistentWorkerPool>}
 */
async function getWorkerPool(numWorkers) {
  if (!poolInstance) {
    poolInstance = new PersistentWorkerPool(numWorkers);
    await poolInstance.init();
  }
  return poolInstance;
}

/**
 * Shutdown the singleton pool if it exists.
 */
async function shutdownPool() {
  if (poolInstance) {
    await poolInstance.shutdown();
    poolInstance = null;
  }
}

module.exports = {
  PersistentWorkerPool,
  getWorkerPool,
  shutdownPool,
  CHUNK_LEN,
  HASH_SIZE
};

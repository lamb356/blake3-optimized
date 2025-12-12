/**
 * BLAKE3 High-Performance Implementation with SharedArrayBuffer + Worker Pool
 * - Zero-copy data transfer to workers via SharedArrayBuffer
 * - Persistent worker pool (no spawn overhead)
 * - Atomic job counter for dynamic load balancing
 * - Correct Merkle tree merging with ROOT flag handling
 */

'use strict';

const { Worker, isMainThread, parentPort, workerData } = require('worker_threads');
const os = require('os');

const IV = new Uint32Array([
  0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
  0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
]);

const BLOCK_LEN = 64;
const CHUNK_LEN = 1024;
const CHUNK_START = 1;
const CHUNK_END = 2;
const PARENT = 4;
const ROOT = 8;

// Shared control buffer layout (Int32Array):
// [0] = job counter (atomic)
// [1] = numChunks
// [2] = inputLen
// [3] = workers done counter (atomic)
// [4] = generation counter (atomic) - increments each hash() call
// [5] = acknowledged counter (atomic) - workers increment after processing
const CTRL_JOB_COUNTER = 0;
const CTRL_NUM_CHUNKS = 1;
const CTRL_INPUT_LEN = 2;
const CTRL_DONE_COUNTER = 3;
const CTRL_GENERATION = 4;
const CTRL_ACK_COUNTER = 5;

function compress(cv, cvOff, block, bOff, out, outOff, counter, blockLen, flags) {
  let m0 = block[bOff]|0, m1 = block[bOff+1]|0, m2 = block[bOff+2]|0, m3 = block[bOff+3]|0;
  let m4 = block[bOff+4]|0, m5 = block[bOff+5]|0, m6 = block[bOff+6]|0, m7 = block[bOff+7]|0;
  let m8 = block[bOff+8]|0, m9 = block[bOff+9]|0, m10 = block[bOff+10]|0, m11 = block[bOff+11]|0;
  let m12 = block[bOff+12]|0, m13 = block[bOff+13]|0, m14 = block[bOff+14]|0, m15 = block[bOff+15]|0;

  let v0 = cv[cvOff]|0, v1 = cv[cvOff+1]|0, v2 = cv[cvOff+2]|0, v3 = cv[cvOff+3]|0;
  let v4 = cv[cvOff+4]|0, v5 = cv[cvOff+5]|0, v6 = cv[cvOff+6]|0, v7 = cv[cvOff+7]|0;
  let v8 = 0x6a09e667, v9 = 0xbb67ae85, v10 = 0x3c6ef372, v11 = 0xa54ff53a;
  let v12 = counter|0, v13 = (counter / 0x100000000)|0, v14 = blockLen|0, v15 = flags|0;

  v0 = v0+v4+m0|0; v12 ^= v0; v12 = v12>>>16|v12<<16;
  v8 = v8+v12|0; v4 ^= v8; v4 = v4>>>12|v4<<20;
  v0 = v0+v4+m1|0; v12 ^= v0; v12 = v12>>>8|v12<<24;
  v8 = v8+v12|0; v4 ^= v8; v4 = v4>>>7|v4<<25;
  v1 = v1+v5+m2|0; v13 ^= v1; v13 = v13>>>16|v13<<16;
  v9 = v9+v13|0; v5 ^= v9; v5 = v5>>>12|v5<<20;
  v1 = v1+v5+m3|0; v13 ^= v1; v13 = v13>>>8|v13<<24;
  v9 = v9+v13|0; v5 ^= v9; v5 = v5>>>7|v5<<25;
  v2 = v2+v6+m4|0; v14 ^= v2; v14 = v14>>>16|v14<<16;
  v10 = v10+v14|0; v6 ^= v10; v6 = v6>>>12|v6<<20;
  v2 = v2+v6+m5|0; v14 ^= v2; v14 = v14>>>8|v14<<24;
  v10 = v10+v14|0; v6 ^= v10; v6 = v6>>>7|v6<<25;
  v3 = v3+v7+m6|0; v15 ^= v3; v15 = v15>>>16|v15<<16;
  v11 = v11+v15|0; v7 ^= v11; v7 = v7>>>12|v7<<20;
  v3 = v3+v7+m7|0; v15 ^= v3; v15 = v15>>>8|v15<<24;
  v11 = v11+v15|0; v7 ^= v11; v7 = v7>>>7|v7<<25;
  v0 = v0+v5+m8|0; v15 ^= v0; v15 = v15>>>16|v15<<16;
  v10 = v10+v15|0; v5 ^= v10; v5 = v5>>>12|v5<<20;
  v0 = v0+v5+m9|0; v15 ^= v0; v15 = v15>>>8|v15<<24;
  v10 = v10+v15|0; v5 ^= v10; v5 = v5>>>7|v5<<25;
  v1 = v1+v6+m10|0; v12 ^= v1; v12 = v12>>>16|v12<<16;
  v11 = v11+v12|0; v6 ^= v11; v6 = v6>>>12|v6<<20;
  v1 = v1+v6+m11|0; v12 ^= v1; v12 = v12>>>8|v12<<24;
  v11 = v11+v12|0; v6 ^= v11; v6 = v6>>>7|v6<<25;
  v2 = v2+v7+m12|0; v13 ^= v2; v13 = v13>>>16|v13<<16;
  v8 = v8+v13|0; v7 ^= v8; v7 = v7>>>12|v7<<20;
  v2 = v2+v7+m13|0; v13 ^= v2; v13 = v13>>>8|v13<<24;
  v8 = v8+v13|0; v7 ^= v8; v7 = v7>>>7|v7<<25;
  v3 = v3+v4+m14|0; v14 ^= v3; v14 = v14>>>16|v14<<16;
  v9 = v9+v14|0; v4 ^= v9; v4 = v4>>>12|v4<<20;
  v3 = v3+v4+m15|0; v14 ^= v3; v14 = v14>>>8|v14<<24;
  v9 = v9+v14|0; v4 ^= v9; v4 = v4>>>7|v4<<25;

  for (let r = 1; r < 7; r++) {
    const t0=m0,t1=m1,t2=m2,t3=m3,t4=m4,t5=m5,t6=m6,t7=m7;
    const t8=m8,t9=m9,t10=m10,t11=m11,t12=m12,t13=m13,t14=m14,t15=m15;
    m0=t2;m1=t6;m2=t3;m3=t10;m4=t7;m5=t0;m6=t4;m7=t13;
    m8=t1;m9=t11;m10=t12;m11=t5;m12=t9;m13=t14;m14=t15;m15=t8;

    v0 = v0+v4+m0|0; v12 ^= v0; v12 = v12>>>16|v12<<16;
    v8 = v8+v12|0; v4 ^= v8; v4 = v4>>>12|v4<<20;
    v0 = v0+v4+m1|0; v12 ^= v0; v12 = v12>>>8|v12<<24;
    v8 = v8+v12|0; v4 ^= v8; v4 = v4>>>7|v4<<25;
    v1 = v1+v5+m2|0; v13 ^= v1; v13 = v13>>>16|v13<<16;
    v9 = v9+v13|0; v5 ^= v9; v5 = v5>>>12|v5<<20;
    v1 = v1+v5+m3|0; v13 ^= v1; v13 = v13>>>8|v13<<24;
    v9 = v9+v13|0; v5 ^= v9; v5 = v5>>>7|v5<<25;
    v2 = v2+v6+m4|0; v14 ^= v2; v14 = v14>>>16|v14<<16;
    v10 = v10+v14|0; v6 ^= v10; v6 = v6>>>12|v6<<20;
    v2 = v2+v6+m5|0; v14 ^= v2; v14 = v14>>>8|v14<<24;
    v10 = v10+v14|0; v6 ^= v10; v6 = v6>>>7|v6<<25;
    v3 = v3+v7+m6|0; v15 ^= v3; v15 = v15>>>16|v15<<16;
    v11 = v11+v15|0; v7 ^= v11; v7 = v7>>>12|v7<<20;
    v3 = v3+v7+m7|0; v15 ^= v3; v15 = v15>>>8|v15<<24;
    v11 = v11+v15|0; v7 ^= v11; v7 = v7>>>7|v7<<25;
    v0 = v0+v5+m8|0; v15 ^= v0; v15 = v15>>>16|v15<<16;
    v10 = v10+v15|0; v5 ^= v10; v5 = v5>>>12|v5<<20;
    v0 = v0+v5+m9|0; v15 ^= v0; v15 = v15>>>8|v15<<24;
    v10 = v10+v15|0; v5 ^= v10; v5 = v5>>>7|v5<<25;
    v1 = v1+v6+m10|0; v12 ^= v1; v12 = v12>>>16|v12<<16;
    v11 = v11+v12|0; v6 ^= v11; v6 = v6>>>12|v6<<20;
    v1 = v1+v6+m11|0; v12 ^= v1; v12 = v12>>>8|v12<<24;
    v11 = v11+v12|0; v6 ^= v11; v6 = v6>>>7|v6<<25;
    v2 = v2+v7+m12|0; v13 ^= v2; v13 = v13>>>16|v13<<16;
    v8 = v8+v13|0; v7 ^= v8; v7 = v7>>>12|v7<<20;
    v2 = v2+v7+m13|0; v13 ^= v2; v13 = v13>>>8|v13<<24;
    v8 = v8+v13|0; v7 ^= v8; v7 = v7>>>7|v7<<25;
    v3 = v3+v4+m14|0; v14 ^= v3; v14 = v14>>>16|v14<<16;
    v9 = v9+v14|0; v4 ^= v9; v4 = v4>>>12|v4<<20;
    v3 = v3+v4+m15|0; v14 ^= v3; v14 = v14>>>8|v14<<24;
    v9 = v9+v14|0; v4 ^= v9; v4 = v4>>>7|v4<<25;
  }

  out[outOff] = v0^v8; out[outOff+1] = v1^v9;
  out[outOff+2] = v2^v10; out[outOff+3] = v3^v11;
  out[outOff+4] = v4^v12; out[outOff+5] = v5^v13;
  out[outOff+6] = v6^v14; out[outOff+7] = v7^v15;
}

// Worker code
if (!isMainThread) {
  const { ctrlSab, inputSab, cvSab, maxInputSize } = workerData;
  const ctrl = new Int32Array(ctrlSab);
  const input = new Uint8Array(inputSab);
  const cvs = new Uint32Array(cvSab);
  const blockWords = new Uint32Array(16);
  const chunkCv = new Uint32Array(8);
  let lastGeneration = 0;

  while (true) {
    // Wait for generation to change (new work available)
    Atomics.wait(ctrl, CTRL_GENERATION, lastGeneration);
    const generation = Atomics.load(ctrl, CTRL_GENERATION);
    if (generation === -1) break; // Terminate signal
    lastGeneration = generation;

    const numChunks = ctrl[CTRL_NUM_CHUNKS];
    const inputLen = ctrl[CTRL_INPUT_LEN];

    // Process chunks using work-stealing
    while (true) {
      const chunkIdx = Atomics.add(ctrl, CTRL_JOB_COUNTER, 1);
      if (chunkIdx >= numChunks) break;

      const chunkStart = chunkIdx * CHUNK_LEN;
      const chunkEnd = Math.min(chunkStart + CHUNK_LEN, inputLen);
      const chunkLen = chunkEnd - chunkStart;
      const numBlocks = Math.max(1, Math.ceil(chunkLen / BLOCK_LEN));

      chunkCv.set(IV);
      for (let block = 0; block < numBlocks; block++) {
        const blockStart = chunkStart + block * BLOCK_LEN;
        const blockEnd = Math.min(blockStart + BLOCK_LEN, chunkEnd);
        const blockLen = blockEnd - blockStart;
        let flags = 0;
        if (block === 0) flags |= CHUNK_START;
        if (block === numBlocks - 1) flags |= CHUNK_END;

        blockWords.fill(0);
        for (let i = 0; i < blockLen; i++) {
          blockWords[i >> 2] |= input[blockStart + i] << ((i & 3) * 8);
        }
        compress(chunkCv, 0, blockWords, 0, chunkCv, 0, chunkIdx, blockLen, flags);
      }

      const cvOffset = chunkIdx * 8;
      for (let i = 0; i < 8; i++) cvs[cvOffset + i] = chunkCv[i];
    }

    // Signal done
    Atomics.add(ctrl, CTRL_DONE_COUNTER, 1);
    Atomics.notify(ctrl, CTRL_DONE_COUNTER);
  }
}

// Max input size for pre-allocated buffers (64 MB)
const MAX_INPUT_SIZE = 64 * 1024 * 1024;

class Blake3SAB {
  constructor(numWorkers = null) {
    this.numWorkers = numWorkers || Math.max(1, os.cpus().length - 1);
    this.workers = [];
    this.initialized = false;

    // Pre-allocate shared buffers
    this.ctrlSab = new SharedArrayBuffer(6 * 4);
    this.generation = 0;
    this.inputSab = new SharedArrayBuffer(MAX_INPUT_SIZE);
    this.cvSab = new SharedArrayBuffer(Math.ceil(MAX_INPUT_SIZE / CHUNK_LEN) * 8 * 4);
    this.ctrl = new Int32Array(this.ctrlSab);
  }

  async init() {
    if (this.initialized) return;

    // Spawn workers
    for (let i = 0; i < this.numWorkers; i++) {
      const worker = new Worker(__filename, {
        workerData: {
          ctrlSab: this.ctrlSab,
          inputSab: this.inputSab,
          cvSab: this.cvSab,
          maxInputSize: MAX_INPUT_SIZE
        }
      });
      this.workers.push(worker);
    }

    this.initialized = true;
  }

  async hash(input, outputLen = 32) {
    if (!(input instanceof Uint8Array)) input = new Uint8Array(input);
    const inputLen = input.length;

    if (inputLen === 0) return this._hashEmpty(outputLen);
    if (inputLen > MAX_INPUT_SIZE) throw new Error(`Input too large (max ${MAX_INPUT_SIZE} bytes)`);

    const numChunks = Math.ceil(inputLen / CHUNK_LEN);
    if (numChunks < 4 || inputLen < 64 * 1024) {
      return this._hashSingleThread(input, outputLen);
    }

    if (!this.initialized) await this.init();

    // Copy input to shared buffer
    new Uint8Array(this.inputSab).set(input);

    // Reset control
    this.ctrl[CTRL_JOB_COUNTER] = 0;
    this.ctrl[CTRL_NUM_CHUNKS] = numChunks;
    this.ctrl[CTRL_INPUT_LEN] = inputLen;
    this.ctrl[CTRL_DONE_COUNTER] = 0;

    // Increment generation to signal new work
    this.generation++;
    Atomics.store(this.ctrl, CTRL_GENERATION, this.generation);
    Atomics.notify(this.ctrl, CTRL_GENERATION, this.numWorkers);

    // Wait for all workers to complete
    while (Atomics.load(this.ctrl, CTRL_DONE_COUNTER) < this.numWorkers) {
      Atomics.wait(this.ctrl, CTRL_DONE_COUNTER, Atomics.load(this.ctrl, CTRL_DONE_COUNTER), 100);
    }

    return this._mergeCvs(new Uint32Array(this.cvSab), numChunks, outputLen);
  }

  terminate() {
    // Signal workers to terminate by setting generation to -1
    Atomics.store(this.ctrl, CTRL_GENERATION, -1);
    Atomics.notify(this.ctrl, CTRL_GENERATION, this.numWorkers);
    for (const worker of this.workers) {
      worker.terminate();
    }
    this.workers = [];
    this.initialized = false;
    this.generation = 0;
  }

  _mergeCvs(cvs, numChunks, outputLen) {
    const stack = new Uint32Array(64 * 8);
    const parentBlock = new Uint32Array(16);
    let stackLen = 0;

    for (let i = 0; i < numChunks; i++) {
      for (let j = 0; j < 8; j++) stack[stackLen * 8 + j] = cvs[i * 8 + j];
      stackLen++;

      let totalChunks = i + 1;
      while ((totalChunks & 1) === 0 && stackLen >= 2) {
        if (i === numChunks - 1 && stackLen === 2) break;
        stackLen -= 2;
        for (let j = 0; j < 8; j++) {
          parentBlock[j] = stack[stackLen * 8 + j];
          parentBlock[8 + j] = stack[(stackLen + 1) * 8 + j];
        }
        compress(IV, 0, parentBlock, 0, stack, stackLen * 8, 0, BLOCK_LEN, PARENT);
        stackLen++;
        totalChunks >>= 1;
      }
    }

    while (stackLen > 1) {
      stackLen -= 2;
      for (let j = 0; j < 8; j++) {
        parentBlock[j] = stack[stackLen * 8 + j];
        parentBlock[8 + j] = stack[(stackLen + 1) * 8 + j];
      }
      compress(IV, 0, parentBlock, 0, stack, stackLen * 8, 0, BLOCK_LEN, stackLen === 0 ? (PARENT | ROOT) : PARENT);
      stackLen++;
    }

    const result = new Uint8Array(outputLen);
    const view = new DataView(result.buffer);
    for (let i = 0; i < Math.min(8, Math.ceil(outputLen / 4)); i++) {
      view.setUint32(i * 4, stack[i], true);
    }
    return result;
  }

  _hashSingleThread(input, outputLen) {
    const inputLen = input.length;
    const numChunks = Math.ceil(inputLen / CHUNK_LEN);
    const stack = new Uint32Array(64 * 8);
    const blockWords = new Uint32Array(16);
    const parentBlock = new Uint32Array(16);
    let stackLen = 0;

    for (let chunk = 0; chunk < numChunks; chunk++) {
      const chunkStart = chunk * CHUNK_LEN;
      const chunkEnd = Math.min(chunkStart + CHUNK_LEN, inputLen);
      const chunkLen = chunkEnd - chunkStart;
      const numBlocks = Math.max(1, Math.ceil(chunkLen / BLOCK_LEN));
      const isSingleChunk = numChunks === 1;
      const cvOff = stackLen * 8;

      stack.set(IV, cvOff);
      for (let block = 0; block < numBlocks; block++) {
        const blockStart = chunkStart + block * BLOCK_LEN;
        const blockEnd = Math.min(blockStart + BLOCK_LEN, chunkEnd);
        const blockLen = blockEnd - blockStart;
        let flags = 0;
        if (block === 0) flags |= CHUNK_START;
        if (block === numBlocks - 1) flags |= CHUNK_END;
        if (isSingleChunk && block === numBlocks - 1) flags |= ROOT;

        blockWords.fill(0);
        for (let i = 0; i < blockLen; i++) {
          blockWords[i >> 2] |= input[blockStart + i] << ((i & 3) * 8);
        }
        compress(stack, cvOff, blockWords, 0, stack, cvOff, chunk, blockLen, flags);
      }
      stackLen++;

      let totalChunks = chunk + 1;
      while ((totalChunks & 1) === 0 && stackLen >= 2) {
        if (chunk === numChunks - 1 && stackLen === 2) break;
        stackLen -= 2;
        for (let j = 0; j < 8; j++) {
          parentBlock[j] = stack[stackLen * 8 + j];
          parentBlock[8 + j] = stack[(stackLen + 1) * 8 + j];
        }
        compress(IV, 0, parentBlock, 0, stack, stackLen * 8, 0, BLOCK_LEN, PARENT);
        stackLen++;
        totalChunks >>= 1;
      }
    }

    while (stackLen > 1) {
      stackLen -= 2;
      for (let j = 0; j < 8; j++) {
        parentBlock[j] = stack[stackLen * 8 + j];
        parentBlock[8 + j] = stack[(stackLen + 1) * 8 + j];
      }
      compress(IV, 0, parentBlock, 0, stack, stackLen * 8, 0, BLOCK_LEN, stackLen === 0 ? (PARENT | ROOT) : PARENT);
      stackLen++;
    }

    const result = new Uint8Array(outputLen);
    const view = new DataView(result.buffer);
    for (let i = 0; i < Math.min(8, Math.ceil(outputLen / 4)); i++) {
      view.setUint32(i * 4, stack[i], true);
    }
    return result;
  }

  _hashEmpty(outputLen) {
    const cv = new Uint32Array(IV);
    compress(cv, 0, new Uint32Array(16), 0, cv, 0, 0, 0, CHUNK_START | CHUNK_END | ROOT);
    const result = new Uint8Array(outputLen);
    const view = new DataView(result.buffer);
    for (let i = 0; i < Math.min(8, Math.ceil(outputLen / 4)); i++) {
      view.setUint32(i * 4, cv[i], true);
    }
    return result;
  }
}

module.exports = { Blake3SAB, compress, IV, CHUNK_LEN, BLOCK_LEN };

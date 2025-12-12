/**
 * BLAKE3 High-Performance Implementation with SharedArrayBuffer + Worker Pool + WASM SIMD
 * - Zero-copy data transfer to workers via SharedArrayBuffer
 * - Persistent worker pool (no spawn overhead)
 * - WASM SIMD for 4x parallel chunk processing within each worker
 * - Atomic job counter for dynamic load balancing
 */

'use strict';

const { Worker, isMainThread, parentPort, workerData } = require('worker_threads');
const os = require('os');

// Fixed WASM SIMD module (base64) - processes 4 chunks in parallel
const WASM_SIMD_B64 = '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';

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

// Control buffer layout
const CTRL_JOB_COUNTER = 0;
const CTRL_NUM_CHUNKS = 1;
const CTRL_INPUT_LEN = 2;
const CTRL_DONE_COUNTER = 3;
const CTRL_GENERATION = 4;

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

// Worker code with SIMD
if (!isMainThread) {
  const { ctrlSab, inputSab, cvSab } = workerData;
  const ctrl = new Int32Array(ctrlSab);
  const input = new Uint8Array(inputSab);
  const cvs = new Uint32Array(cvSab);

  // SIMD state
  let wasmSimdEnabled = false;
  let wasmCompress4x = null;
  let wasmMem32 = null;
  const simdCvs = [new Uint32Array(8), new Uint32Array(8), new Uint32Array(8), new Uint32Array(8)];

  // Scalar fallback buffers
  const blockWords = new Uint32Array(16);
  const chunkCv = new Uint32Array(8);

  // Initialize WASM SIMD
  async function initSimd() {
    try {
      const wasmBinary = Uint8Array.from(atob(WASM_SIMD_B64), c => c.charCodeAt(0));
      const wasmModule = await WebAssembly.compile(wasmBinary);
      const wasmInstance = await WebAssembly.instantiate(wasmModule);
      wasmCompress4x = wasmInstance.exports.compressChunks4x;
      wasmMem32 = new Uint32Array(wasmInstance.exports.memory.buffer);
      wasmSimdEnabled = true;
    } catch (e) {
      wasmSimdEnabled = false;
    }
  }

  // Process 4 chunks with SIMD
  function processChunks4xSimd(inputOffset, baseChunkCounter) {
    // Transpose input to word-major layout for SIMD
    const c0 = inputOffset, c1 = inputOffset + CHUNK_LEN, c2 = inputOffset + 2*CHUNK_LEN, c3 = inputOffset + 3*CHUNK_LEN;

    for (let block = 0; block < 16; block++) {
      const blockOff = block * BLOCK_LEN;
      const dstBlockOff = block * 64;

      for (let w = 0; w < 16; w++) {
        const dst = dstBlockOff + w * 4;
        const wOff = w * 4;
        wasmMem32[dst]     = input[c0 + blockOff + wOff] | (input[c0 + blockOff + wOff + 1] << 8) | (input[c0 + blockOff + wOff + 2] << 16) | (input[c0 + blockOff + wOff + 3] << 24);
        wasmMem32[dst + 1] = input[c1 + blockOff + wOff] | (input[c1 + blockOff + wOff + 1] << 8) | (input[c1 + blockOff + wOff + 2] << 16) | (input[c1 + blockOff + wOff + 3] << 24);
        wasmMem32[dst + 2] = input[c2 + blockOff + wOff] | (input[c2 + blockOff + wOff + 1] << 8) | (input[c2 + blockOff + wOff + 2] << 16) | (input[c2 + blockOff + wOff + 3] << 24);
        wasmMem32[dst + 3] = input[c3 + blockOff + wOff] | (input[c3 + blockOff + wOff + 1] << 8) | (input[c3 + blockOff + wOff + 2] << 16) | (input[c3 + blockOff + wOff + 3] << 24);
      }
    }

    // Set counters
    wasmMem32[1024] = baseChunkCounter;
    wasmMem32[1025] = baseChunkCounter + 1;
    wasmMem32[1026] = baseChunkCounter + 2;
    wasmMem32[1027] = baseChunkCounter + 3;

    // Process all 16 blocks of 4 chunks
    wasmCompress4x();

    // Read output CVs
    for (let w = 0; w < 8; w++) {
      const src = 1028 + w * 4;
      simdCvs[0][w] = wasmMem32[src];
      simdCvs[1][w] = wasmMem32[src + 1];
      simdCvs[2][w] = wasmMem32[src + 2];
      simdCvs[3][w] = wasmMem32[src + 3];
    }
  }

  // Process single chunk with scalar
  function processChunkScalar(chunkIdx, inputLen) {
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
    return chunkCv;
  }

  let lastGeneration = 0;

  // Init SIMD then start processing
  initSimd().then(() => {
    while (true) {
      Atomics.wait(ctrl, CTRL_GENERATION, lastGeneration);
      const generation = Atomics.load(ctrl, CTRL_GENERATION);
      if (generation === -1) break;
      lastGeneration = generation;

      const numChunks = ctrl[CTRL_NUM_CHUNKS];
      const inputLen = ctrl[CTRL_INPUT_LEN];

      // Process chunks - grab 4 at a time for SIMD when possible
      while (true) {
        if (wasmSimdEnabled) {
          // Try to grab 4 chunks for SIMD processing
          const baseChunk = Atomics.add(ctrl, CTRL_JOB_COUNTER, 4);
          if (baseChunk >= numChunks) {
            // Not enough chunks left, put back and process singles
            Atomics.sub(ctrl, CTRL_JOB_COUNTER, 4);
            break;
          }

          // Check if we have 4 full chunks
          if (baseChunk + 4 <= numChunks && (baseChunk + 4) * CHUNK_LEN <= inputLen) {
            // Process 4 chunks with SIMD
            processChunks4xSimd(baseChunk * CHUNK_LEN, baseChunk);

            // Write all 4 CVs
            for (let i = 0; i < 4; i++) {
              const cvOffset = (baseChunk + i) * 8;
              for (let j = 0; j < 8; j++) cvs[cvOffset + j] = simdCvs[i][j];
            }
          } else {
            // Not 4 full chunks, put back and process singles
            Atomics.sub(ctrl, CTRL_JOB_COUNTER, 4);
            break;
          }
        } else {
          break;
        }
      }

      // Process remaining chunks with scalar
      while (true) {
        const chunkIdx = Atomics.add(ctrl, CTRL_JOB_COUNTER, 1);
        if (chunkIdx >= numChunks) break;

        const cv = processChunkScalar(chunkIdx, inputLen);
        const cvOffset = chunkIdx * 8;
        for (let i = 0; i < 8; i++) cvs[cvOffset + i] = cv[i];
      }

      Atomics.add(ctrl, CTRL_DONE_COUNTER, 1);
      Atomics.notify(ctrl, CTRL_DONE_COUNTER);
    }
  });
}

const MAX_INPUT_SIZE = 64 * 1024 * 1024;

class Blake3SAB {
  constructor(numWorkers = null) {
    this.numWorkers = numWorkers || Math.max(1, os.cpus().length - 1);
    this.workers = [];
    this.initialized = false;
    this.ctrlSab = new SharedArrayBuffer(6 * 4);
    this.generation = 0;
    this.inputSab = new SharedArrayBuffer(MAX_INPUT_SIZE);
    this.cvSab = new SharedArrayBuffer(Math.ceil(MAX_INPUT_SIZE / CHUNK_LEN) * 8 * 4);
    this.ctrl = new Int32Array(this.ctrlSab);
  }

  async init() {
    if (this.initialized) return;

    for (let i = 0; i < this.numWorkers; i++) {
      const worker = new Worker(__filename, {
        workerData: { ctrlSab: this.ctrlSab, inputSab: this.inputSab, cvSab: this.cvSab }
      });
      this.workers.push(worker);
    }

    // Give workers time to init SIMD
    await new Promise(r => setTimeout(r, 50));
    this.initialized = true;
  }

  async hash(input, outputLen = 32) {
    if (!(input instanceof Uint8Array)) input = new Uint8Array(input);
    const inputLen = input.length;

    if (inputLen === 0) return this._hashEmpty(outputLen);
    if (inputLen > MAX_INPUT_SIZE) throw new Error(`Input too large`);

    const numChunks = Math.ceil(inputLen / CHUNK_LEN);
    // Use parallel only for larger inputs where overhead is worth it
    if (numChunks < 16 || inputLen < 512 * 1024) {
      return this._hashSingleThread(input, outputLen);
    }

    if (!this.initialized) await this.init();

    new Uint8Array(this.inputSab).set(input);

    this.ctrl[CTRL_JOB_COUNTER] = 0;
    this.ctrl[CTRL_NUM_CHUNKS] = numChunks;
    this.ctrl[CTRL_INPUT_LEN] = inputLen;
    this.ctrl[CTRL_DONE_COUNTER] = 0;

    this.generation++;
    Atomics.store(this.ctrl, CTRL_GENERATION, this.generation);
    Atomics.notify(this.ctrl, CTRL_GENERATION, this.numWorkers);

    while (Atomics.load(this.ctrl, CTRL_DONE_COUNTER) < this.numWorkers) {
      Atomics.wait(this.ctrl, CTRL_DONE_COUNTER, Atomics.load(this.ctrl, CTRL_DONE_COUNTER), 100);
    }

    return this._mergeCvs(new Uint32Array(this.cvSab), numChunks, outputLen);
  }

  terminate() {
    Atomics.store(this.ctrl, CTRL_GENERATION, -1);
    Atomics.notify(this.ctrl, CTRL_GENERATION, this.numWorkers);
    for (const worker of this.workers) worker.terminate();
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

module.exports = { Blake3SAB };

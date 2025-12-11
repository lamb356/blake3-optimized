/**
 * BLAKE3 Web Worker - Processes subtrees in parallel (Scalar-only version)
 * Uses pure JavaScript for reliable cross-platform correctness
 */

const IV = new Uint32Array([
  0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
  0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
]);

const BLOCK_LEN = 64;
const CHUNK_LEN = 1024;
const CHUNK_START = 1;
const CHUNK_END = 2;
const PARENT = 4;

const blockWords = new Uint32Array(16);

// Scalar compress function - fully optimized
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

// Process a subtree and return its CV (scalar only)
function processSubtree(input, startOffset, numChunks, baseChunkCounter) {
  const stack = new Uint32Array(64 * 8); // Max 64 levels
  let stackPos = 0;
  let offset = startOffset;
  let chunkCounter = baseChunkCounter;
  let chunksProcessed = 0;

  // Process all chunks using scalar
  while (chunksProcessed < numChunks) {
    stack.set(IV, stackPos);

    // Process all 16 blocks in chunk
    for (let block = 0; block < 16; block++) {
      const blockStart = offset + block * BLOCK_LEN;
      let blockFlags = 0;
      if (block === 0) blockFlags |= CHUNK_START;
      if (block === 15) blockFlags |= CHUNK_END;

      // Create view into input for this block
      if ((input.byteOffset + blockStart) % 4 === 0) {
        const inputWords = new Uint32Array(input.buffer, input.byteOffset + blockStart, 16);
        compress(stack, stackPos, inputWords, 0, stack, stackPos, true, chunkCounter, BLOCK_LEN, blockFlags);
      } else {
        // Unaligned - copy to temp buffer
        blockWords.fill(0);
        for (let i = 0; i < BLOCK_LEN; i++) {
          blockWords[i >> 2] |= input[blockStart + i] << ((i & 3) * 8);
        }
        compress(stack, stackPos, blockWords, 0, stack, stackPos, true, chunkCounter, BLOCK_LEN, blockFlags);
      }
    }

    stackPos += 8;
    chunkCounter++;
    chunksProcessed++;
    offset += CHUNK_LEN;

    // Merge pairs
    let tc = chunksProcessed;
    while ((tc & 1) === 0 && stackPos > 8) {
      stackPos -= 16;
      compress(IV, 0, stack, stackPos, stack, stackPos, true, 0, BLOCK_LEN, PARENT);
      stackPos += 8;
      tc >>= 1;
    }
  }

  // Final merges to get single CV
  while (stackPos > 8) {
    stackPos -= 16;
    compress(IV, 0, stack, stackPos, stack, stackPos, true, 0, BLOCK_LEN, PARENT);
    stackPos += 8;
  }

  return new Uint32Array(stack.buffer, 0, 8);
}

// Node.js worker_threads API
const { parentPort } = require('worker_threads');

// Message handler
parentPort.on('message', async (msg) => {
  const { type, data, startOffset, numChunks, baseChunkCounter, taskId } = msg;

  if (type === 'init') {
    // No WASM to init, always succeeds
    parentPort.postMessage({ type: 'init', success: true, taskId });
  } else if (type === 'process') {
    const cv = processSubtree(new Uint8Array(data), startOffset, numChunks, baseChunkCounter);
    parentPort.postMessage({ type: 'result', cv: Array.from(cv), taskId });
  }
});

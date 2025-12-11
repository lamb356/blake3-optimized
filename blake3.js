/**
 * BLAKE3 - Ultra-Optimized Pure JavaScript Implementation with WASM SIMD
 *
 * Optimizations:
 * 1. Fully unrolled compress function (no loops in hot path)
 * 2. All state in local SMI variables
 * 3. Direct message word permutation (no array copies)
 * 4. Pre-allocated reusable buffers
 * 5. Direct Uint32Array view for aligned LE input
 * 6. WASM SIMD compress4x for 4-way parallel chunk processing
 *
 * @author Implementation for Zooko's bounty
 * @see https://x.com/zooko/status/1998185559542657145
 */

(function(exports) {
  'use strict';

  // WASM SIMD compress4x module (base64 encoded)
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

  const blockWords = new Uint32Array(16);
  let cvStack = null;

  // WASM SIMD state
  let wasmSimdEnabled = false;
  let wasmCompress4x = null;
  let wasmMem32 = null;

  function getCvStack(size) {
    if (cvStack === null || cvStack.length < size) {
      cvStack = new Uint32Array(size);
    }
    return cvStack;
  }

  // Ultra-optimized compress: fully unrolled, all local variables
  function compress(cv, cvOffset, m, mOffset, out, outOffset, truncateOutput, counter, blockLen, flags) {
    let m_0 = m[mOffset + 0] | 0;
    let m_1 = m[mOffset + 1] | 0;
    let m_2 = m[mOffset + 2] | 0;
    let m_3 = m[mOffset + 3] | 0;
    let m_4 = m[mOffset + 4] | 0;
    let m_5 = m[mOffset + 5] | 0;
    let m_6 = m[mOffset + 6] | 0;
    let m_7 = m[mOffset + 7] | 0;
    let m_8 = m[mOffset + 8] | 0;
    let m_9 = m[mOffset + 9] | 0;
    let m_10 = m[mOffset + 10] | 0;
    let m_11 = m[mOffset + 11] | 0;
    let m_12 = m[mOffset + 12] | 0;
    let m_13 = m[mOffset + 13] | 0;
    let m_14 = m[mOffset + 14] | 0;
    let m_15 = m[mOffset + 15] | 0;

    let s_0 = cv[cvOffset + 0] | 0;
    let s_1 = cv[cvOffset + 1] | 0;
    let s_2 = cv[cvOffset + 2] | 0;
    let s_3 = cv[cvOffset + 3] | 0;
    let s_4 = cv[cvOffset + 4] | 0;
    let s_5 = cv[cvOffset + 5] | 0;
    let s_6 = cv[cvOffset + 6] | 0;
    let s_7 = cv[cvOffset + 7] | 0;
    let s_8 = 0x6a09e667 | 0;
    let s_9 = 0xbb67ae85 | 0;
    let s_10 = 0x3c6ef372 | 0;
    let s_11 = 0xa54ff53a | 0;
    let s_12 = counter | 0;
    let s_13 = (counter / 0x100000000) | 0;
    let s_14 = blockLen | 0;
    let s_15 = flags | 0;

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
    if (!truncateOutput) {
      out[outOffset + 8] = s_8 ^ cv[cvOffset + 0];
      out[outOffset + 9] = s_9 ^ cv[cvOffset + 1];
      out[outOffset + 10] = s_10 ^ cv[cvOffset + 2];
      out[outOffset + 11] = s_11 ^ cv[cvOffset + 3];
      out[outOffset + 12] = s_12 ^ cv[cvOffset + 4];
      out[outOffset + 13] = s_13 ^ cv[cvOffset + 5];
      out[outOffset + 14] = s_14 ^ cv[cvOffset + 6];
      out[outOffset + 15] = s_15 ^ cv[cvOffset + 7];
    }
  }

  function wordsToBytes(words) {
    const bytes = new Uint8Array(words.length * 4);
    const view = new DataView(bytes.buffer);
    for (let i = 0; i < words.length; i++) {
      view.setUint32(i * 4, words[i], true);
    }
    return bytes;
  }

  // Pre-allocated CV arrays for SIMD output
  const simdCvs = [new Uint32Array(8), new Uint32Array(8), new Uint32Array(8), new Uint32Array(8)];

  // Process 4 complete chunks in parallel using SIMD
  // Returns array of 4 CVs (each Uint32Array of 8 words)
  function processChunks4xSimd(input, inputOffset, baseChunkCounter) {
    // Memory layout for compress4x:
    // Offset 0-127 (words 0-31): Input CV - 8 v128s, each word interleaved across 4 chunks
    // Offset 256-511 (words 64-127): Message - 16 v128s, each word interleaved
    // Offset 768-831 (words 192-207): counter_lo, counter_hi, block_len, flags (each v128)
    // Offset 1024-1151 (words 256-287): Output CV

    // Initialize all 4 CVs to IV (unrolled for speed)
    const iv0 = IV[0], iv1 = IV[1], iv2 = IV[2], iv3 = IV[3];
    const iv4 = IV[4], iv5 = IV[5], iv6 = IV[6], iv7 = IV[7];
    wasmMem32[0] = iv0; wasmMem32[1] = iv0; wasmMem32[2] = iv0; wasmMem32[3] = iv0;
    wasmMem32[4] = iv1; wasmMem32[5] = iv1; wasmMem32[6] = iv1; wasmMem32[7] = iv1;
    wasmMem32[8] = iv2; wasmMem32[9] = iv2; wasmMem32[10] = iv2; wasmMem32[11] = iv2;
    wasmMem32[12] = iv3; wasmMem32[13] = iv3; wasmMem32[14] = iv3; wasmMem32[15] = iv3;
    wasmMem32[16] = iv4; wasmMem32[17] = iv4; wasmMem32[18] = iv4; wasmMem32[19] = iv4;
    wasmMem32[20] = iv5; wasmMem32[21] = iv5; wasmMem32[22] = iv5; wasmMem32[23] = iv5;
    wasmMem32[24] = iv6; wasmMem32[25] = iv6; wasmMem32[26] = iv6; wasmMem32[27] = iv6;
    wasmMem32[28] = iv7; wasmMem32[29] = iv7; wasmMem32[30] = iv7; wasmMem32[31] = iv7;

    // Create typed array views if input is aligned
    const inputAligned = (input.byteOffset + inputOffset) % 4 === 0;
    let inputView = null;
    if (inputAligned) {
      inputView = new Uint32Array(input.buffer, input.byteOffset + inputOffset);
    }

    // Pre-set static counter values
    wasmMem32[192] = baseChunkCounter;
    wasmMem32[193] = baseChunkCounter + 1;
    wasmMem32[194] = baseChunkCounter + 2;
    wasmMem32[195] = baseChunkCounter + 3;
    wasmMem32[196] = 0; wasmMem32[197] = 0; wasmMem32[198] = 0; wasmMem32[199] = 0;  // counter_hi
    wasmMem32[200] = BLOCK_LEN; wasmMem32[201] = BLOCK_LEN; wasmMem32[202] = BLOCK_LEN; wasmMem32[203] = BLOCK_LEN;

    // Process all 16 blocks
    for (let block = 0; block < 16; block++) {
      // Set flags
      const flags = (block === 0 ? CHUNK_START : 0) | (block === 15 ? CHUNK_END : 0);
      wasmMem32[204] = flags; wasmMem32[205] = flags; wasmMem32[206] = flags; wasmMem32[207] = flags;

      // Set up message words (interleaved across 4 chunks)
      const blockOff = block * 16;  // 16 words per block
      if (inputView) {
        // Fast path: aligned input, use Uint32Array
        const c0 = 0, c1 = 256, c2 = 512, c3 = 768;  // chunk offsets in words
        for (let w = 0; w < 16; w++) {
          const dst = 64 + w * 4;
          wasmMem32[dst] = inputView[c0 + blockOff + w];
          wasmMem32[dst + 1] = inputView[c1 + blockOff + w];
          wasmMem32[dst + 2] = inputView[c2 + blockOff + w];
          wasmMem32[dst + 3] = inputView[c3 + blockOff + w];
        }
      } else {
        // Slow path: unaligned input
        for (let w = 0; w < 16; w++) {
          const dst = 64 + w * 4;
          for (let c = 0; c < 4; c++) {
            const byteOff = c * CHUNK_LEN + block * BLOCK_LEN + w * 4;
            wasmMem32[dst + c] =
              input[inputOffset + byteOff] |
              (input[inputOffset + byteOff + 1] << 8) |
              (input[inputOffset + byteOff + 2] << 16) |
              (input[inputOffset + byteOff + 3] << 24);
          }
        }
      }

      // Call compress4x
      wasmCompress4x();

      // Copy output CVs back to input for next block
      for (let i = 0; i < 32; i++) {
        wasmMem32[i] = wasmMem32[256 + i];
      }
    }

    // Extract 4 CVs from output (de-interleave into pre-allocated arrays)
    for (let w = 0; w < 8; w++) {
      const src = 256 + w * 4;
      simdCvs[0][w] = wasmMem32[src];
      simdCvs[1][w] = wasmMem32[src + 1];
      simdCvs[2][w] = wasmMem32[src + 2];
      simdCvs[3][w] = wasmMem32[src + 3];
    }
    return simdCvs;
  }

  function hash(input, outputLen) {
    if (typeof input === 'string') {
      input = new TextEncoder().encode(input);
    }
    if (!(input instanceof Uint8Array)) {
      input = new Uint8Array(input);
    }

    outputLen = outputLen || 32;
    const out = new Uint32Array(8);
    const totalLen = input.length;
    const flags = 0;

    // Direct Uint32Array view for aligned LE input
    let inputWords = null;
    if (input.byteOffset % 4 === 0) {
      inputWords = new Uint32Array(input.buffer, input.byteOffset, input.length >> 2);
    }

    if (totalLen === 0) {
      blockWords.fill(0);
      compress(IV, 0, blockWords, 0, out, 0, true, 0, 0, CHUNK_START | CHUNK_END | ROOT);
      return wordsToBytes(out).slice(0, outputLen);
    }

    const numChunks = Math.ceil(totalLen / CHUNK_LEN);
    const maxDepth = Math.ceil(Math.log2(numChunks + 1)) + 2;
    const stack = getCvStack(maxDepth * 8);
    let stackPos = 0;
    let offset = 0;
    let chunkCounter = 0;

    // SIMD path: process 4 full chunks at a time
    // Uses WASM SIMD to process 4 independent chunks in parallel
    if (wasmSimdEnabled && totalLen >= 4 * CHUNK_LEN) {
      while (offset + 4 * CHUNK_LEN <= totalLen) {
        // Process 4 chunks with SIMD
        const cvs = processChunks4xSimd(input, offset, chunkCounter);

        // Add all 4 CVs to stack and merge
        for (let i = 0; i < 4; i++) {
          stack.set(cvs[i], stackPos);
          stackPos += 8;
          chunkCounter++;

          // Merge pairs in Merkle tree
          let tc = chunkCounter;
          while ((tc & 1) === 0 && stackPos > 8) {
            stackPos -= 16;
            compress(IV, 0, stack, stackPos, stack, stackPos, true, 0, BLOCK_LEN, flags | PARENT);
            stackPos += 8;
            tc >>= 1;
          }
        }
        offset += 4 * CHUNK_LEN;
      }
    }

    // Scalar path for remaining chunks
    while (offset < totalLen) {
      const chunkStart = offset;
      const chunkEnd = Math.min(offset + CHUNK_LEN, totalLen);
      const chunkLen = chunkEnd - chunkStart;
      const isLastChunk = chunkEnd === totalLen;

      stack.set(IV, stackPos);
      const numBlocks = Math.ceil(chunkLen / BLOCK_LEN);

      for (let block = 0; block < numBlocks; block++) {
        const blockStart = chunkStart + block * BLOCK_LEN;
        const blockEnd = Math.min(blockStart + BLOCK_LEN, chunkEnd);
        const blockLen = blockEnd - blockStart;
        const isFirstBlock = block === 0;
        const isLastBlockOfChunk = block === numBlocks - 1;

        let blockFlags = flags;
        if (isFirstBlock) blockFlags |= CHUNK_START;
        if (isLastBlockOfChunk) blockFlags |= CHUNK_END;
        if (isLastBlockOfChunk && isLastChunk && chunkCounter === 0) {
          blockFlags |= ROOT;
        }

        if (blockLen === BLOCK_LEN && inputWords && blockStart % 4 === 0) {
          compress(stack, stackPos, inputWords, blockStart >> 2, stack, stackPos, true, chunkCounter, BLOCK_LEN, blockFlags);
        } else {
          blockWords.fill(0);
          for (let i = 0; i < blockLen; i++) {
            blockWords[i >> 2] |= input[blockStart + i] << ((i & 3) * 8);
          }
          compress(stack, stackPos, blockWords, 0, stack, stackPos, true, chunkCounter, blockLen, blockFlags);
        }
      }

      stackPos += 8;
      chunkCounter++;
      offset = chunkEnd;

      if (!isLastChunk) {
        let totalChunks = chunkCounter;
        while ((totalChunks & 1) === 0) {
          stackPos -= 16;
          compress(IV, 0, stack, stackPos, stack, stackPos, true, 0, BLOCK_LEN, flags | PARENT);
          stackPos += 8;
          totalChunks >>= 1;
        }
      }
    }

    if (chunkCounter === 1) {
      out.set(new Uint32Array(stack.buffer, 0, 8));
    } else {
      while (stackPos > 8) {
        stackPos -= 16;
        const isRoot = stackPos === 0;
        compress(IV, 0, stack, stackPos, isRoot ? out : stack, isRoot ? 0 : stackPos, true, 0, BLOCK_LEN, flags | PARENT | (isRoot ? ROOT : 0));
        if (!isRoot) stackPos += 8;
      }
    }

    return wordsToBytes(out).slice(0, outputLen);
  }

  function hashHex(input) {
    const bytes = hash(input);
    let hex = '';
    for (let i = 0; i < bytes.length; i++) {
      hex += bytes[i].toString(16).padStart(2, '0');
    }
    return hex;
  }

  function toHex(bytes) {
    return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
  }

  // Initialize WASM SIMD
  async function initSimd() {
    try {
      // Decode base64 and compile WASM - if SIMD isn't supported, compilation will fail
      const wasmBinary = Uint8Array.from(atob(WASM_SIMD_B64), c => c.charCodeAt(0));
      const wasmModule = await WebAssembly.compile(wasmBinary);
      const wasmInstance = await WebAssembly.instantiate(wasmModule);

      wasmCompress4x = wasmInstance.exports.compress4x;
      wasmMem32 = new Uint32Array(wasmInstance.exports.memory.buffer);
      wasmSimdEnabled = true;
      return true;
    } catch (e) {
      return false;
    }
  }

  function isSimdEnabled() {
    return wasmSimdEnabled;
  }

  exports.hash = hash;
  exports.hashHex = hashHex;
  exports.toHex = toHex;
  exports.initSimd = initSimd;
  exports.isSimdEnabled = isSimdEnabled;
  exports.IV = IV;
  exports.BLOCK_LEN = BLOCK_LEN;
  exports.CHUNK_LEN = CHUNK_LEN;

})(typeof exports !== 'undefined' ? exports : (this.blake3 = {}));

// CLI runner
if (typeof require !== 'undefined' && require.main === module) {
  const blake3 = exports;
  (async () => {
    await blake3.initSimd();
    console.log('BLAKE3 Final - SIMD enabled:', blake3.isSimdEnabled());

    // Quick test
    console.log('Test "hello":', blake3.hashHex('hello'));
    console.log('Expected:    ', 'ea8f163db38682925e4491c5e58d4bb3506ef8c14eb78a86e908c5624a67200f');
  })();
}

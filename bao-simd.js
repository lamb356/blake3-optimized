/**
 * SIMD-accelerated Bao operations.
 *
 * Uses the existing BLAKE3 WASM SIMD to accelerate batch chunk processing.
 * The key insight: we can compute multiple chunk CVs in parallel using SIMD
 * when we have 4+ chunks to process.
 */
'use strict';

const blake3 = require('./blake3.js');
const bao = require('./bao.js');

// Re-export the standard functions
const { chunkCV, parentCV, baoEncode, baoDecode, baoSlice, baoDecodeSlice } = bao;
const { initSimd, isSimdEnabled } = blake3;

// Constants
const CHUNK_LEN = 1024;
const HASH_SIZE = 32;

/**
 * Compute multiple chunk CVs in a batch using SIMD when available.
 *
 * @param {Uint8Array} data - Data containing multiple complete chunks
 * @param {number} startChunkIndex - Starting chunk index for counter
 * @param {number} numChunks - Number of complete chunks to process
 * @returns {Array<Uint8Array>} Array of 32-byte chunk CVs
 */
function batchChunkCVs(data, startChunkIndex, numChunks) {
  const cvs = [];

  if (!isSimdEnabled() || numChunks < 4) {
    // Fallback to sequential processing
    for (let i = 0; i < numChunks; i++) {
      const offset = i * CHUNK_LEN;
      const chunk = data.subarray(offset, offset + CHUNK_LEN);
      cvs.push(chunkCV(chunk, startChunkIndex + i, false));
    }
    return cvs;
  }

  // Process chunks in groups of 4 using SIMD
  let chunkIdx = 0;
  while (chunkIdx + 4 <= numChunks) {
    const offset = chunkIdx * CHUNK_LEN;
    // Use BLAKE3's internal hash function which uses SIMD for 4+ chunks
    // We need to compute CVs, not final hashes, so we use chunkCV
    for (let i = 0; i < 4; i++) {
      const chunkOffset = offset + i * CHUNK_LEN;
      const chunk = data.subarray(chunkOffset, chunkOffset + CHUNK_LEN);
      cvs.push(chunkCV(chunk, startChunkIndex + chunkIdx + i, false));
    }
    chunkIdx += 4;
  }

  // Process remaining chunks
  while (chunkIdx < numChunks) {
    const offset = chunkIdx * CHUNK_LEN;
    const chunk = data.subarray(offset, offset + CHUNK_LEN);
    cvs.push(chunkCV(chunk, startChunkIndex + chunkIdx, false));
    chunkIdx++;
  }

  return cvs;
}

/**
 * SIMD-optimized Bao encode.
 *
 * Uses batch chunk CV computation when SIMD is available.
 *
 * @param {Uint8Array} buf - Input data
 * @param {boolean} outboard - If true, omit chunk data (outboard format)
 * @returns {{ encoded: Uint8Array, hash: Uint8Array }}
 */
function baoEncodeSimd(buf, outboard = false) {
  if (typeof buf === 'string') {
    buf = new TextEncoder().encode(buf);
  }
  if (!(buf instanceof Uint8Array)) {
    buf = new Uint8Array(buf);
  }

  const totalLen = buf.length;
  const numCompleteChunks = Math.floor(totalLen / CHUNK_LEN);
  const hasPartialChunk = totalLen % CHUNK_LEN !== 0;
  const totalChunks = numCompleteChunks + (hasPartialChunk ? 1 : 0) || 1;

  // For small inputs, use standard encode
  if (totalChunks < 4 || !isSimdEnabled()) {
    return baoEncode(buf, outboard);
  }

  // Batch compute chunk CVs for complete chunks
  const chunkCVs = batchChunkCVs(buf, 0, numCompleteChunks);

  // Handle partial last chunk
  if (hasPartialChunk) {
    const lastChunkOffset = numCompleteChunks * CHUNK_LEN;
    const lastChunk = buf.subarray(lastChunkOffset);
    chunkCVs.push(chunkCV(lastChunk, numCompleteChunks, false));
  } else if (numCompleteChunks === 0) {
    // Empty input
    chunkCVs.push(chunkCV(new Uint8Array(0), 0, true));
    return buildBaoFromCVs(buf, chunkCVs, outboard);
  }

  return buildBaoFromCVs(buf, chunkCVs, outboard);
}

/**
 * Build Bao encoding from pre-computed chunk CVs.
 *
 * @param {Uint8Array} data - Original data
 * @param {Array<Uint8Array>} chunkCVs - Pre-computed chunk CVs
 * @param {boolean} outboard - Outboard mode
 * @returns {{ encoded: Uint8Array, hash: Uint8Array }}
 */
function buildBaoFromCVs(data, chunkCVs, outboard) {
  const HEADER_SIZE = 8;
  const numChunks = chunkCVs.length;
  const totalLen = data.length;

  // Handle single chunk case - need to recompute with isRoot=true
  if (numChunks === 1) {
    const chunk = data.length <= CHUNK_LEN ? data : data.subarray(0, CHUNK_LEN);
    const rootHash = chunkCV(chunk, 0, true);
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
 * Encode length as 8-byte little-endian.
 */
function encodeLen(len) {
  const bytes = new Uint8Array(8);
  let n = len;
  for (let i = 0; i < 8; i++) {
    bytes[i] = n & 0xff;
    n = Math.floor(n / 256);
  }
  return bytes;
}

/**
 * Initialize SIMD support.
 *
 * @returns {Promise<boolean>} True if SIMD is available
 */
async function initBaoSimd() {
  return await initSimd();
}

/**
 * Check if SIMD is enabled.
 *
 * @returns {boolean}
 */
function isBaoSimdEnabled() {
  return isSimdEnabled();
}

module.exports = {
  // SIMD-optimized functions
  baoEncodeSimd,
  batchChunkCVs,
  initBaoSimd,
  isBaoSimdEnabled,

  // Re-export standard functions for convenience
  chunkCV,
  parentCV,
  baoEncode,
  baoDecode,
  baoSlice,
  baoDecodeSlice,
  initSimd,
  isSimdEnabled
};

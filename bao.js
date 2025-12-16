/**
 * Bao - Verified Streaming for BLAKE3
 *
 * Implements the Bao tree construction primitives for verified streaming.
 * Based on the official Bao specification.
 *
 * @see https://github.com/oconnor663/bao/blob/master/docs/spec.md
 */

const blake3 = require('./blake3.js');

// Import from blake3.js
const { IV, BLOCK_LEN, CHUNK_LEN, _compress: compress } = blake3;

// BLAKE3 domain separation flags
const CHUNK_START = 1;
const CHUNK_END = 2;
const PARENT = 4;
const ROOT = 8;

/**
 * Convert a Uint32Array to a Uint8Array (little-endian)
 */
function wordsToBytes(words) {
  const bytes = new Uint8Array(words.length * 4);
  for (let i = 0; i < words.length; i++) {
    bytes[i * 4] = words[i] & 0xff;
    bytes[i * 4 + 1] = (words[i] >> 8) & 0xff;
    bytes[i * 4 + 2] = (words[i] >> 16) & 0xff;
    bytes[i * 4 + 3] = (words[i] >> 24) & 0xff;
  }
  return bytes;
}

/**
 * Compute the chaining value (CV) for a chunk.
 *
 * @param {Uint8Array} chunkBytes - The chunk data (0 to 1024 bytes)
 * @param {number} chunkIndex - The chunk counter (0-indexed)
 * @param {boolean} isRoot - Whether this is the root node
 * @returns {Uint8Array} 32-byte chaining value
 */
function chunkCV(chunkBytes, chunkIndex, isRoot) {
  // Initialize CV with IV
  let cv = new Uint32Array(IV);

  const chunkLen = chunkBytes.length;
  const numBlocks = chunkLen === 0 ? 1 : Math.ceil(chunkLen / BLOCK_LEN);

  for (let blockIdx = 0; blockIdx < numBlocks; blockIdx++) {
    const blockStart = blockIdx * BLOCK_LEN;
    const blockEnd = Math.min(blockStart + BLOCK_LEN, chunkLen);
    const blockLen = blockEnd - blockStart;

    // Build block words
    const blockWords = new Uint32Array(16);
    for (let i = 0; i < blockLen; i++) {
      blockWords[i >> 2] |= chunkBytes[blockStart + i] << ((i & 3) * 8);
    }

    // Determine flags
    let flags = 0;
    const isFirstBlock = blockIdx === 0;
    const isLastBlock = blockIdx === numBlocks - 1;

    if (isFirstBlock) flags |= CHUNK_START;
    if (isLastBlock) flags |= CHUNK_END;
    if (isLastBlock && isRoot) flags |= ROOT;

    // Compress
    const out = new Uint32Array(8);
    compress(cv, 0, blockWords, 0, out, 0, true, chunkIndex, blockLen, flags);
    cv = out;
  }

  return wordsToBytes(cv);
}

/**
 * Compute the chaining value for a parent node.
 *
 * @param {Uint8Array} leftCV - Left child's 32-byte CV
 * @param {Uint8Array} rightCV - Right child's 32-byte CV
 * @param {boolean} isRoot - Whether this is the root node
 * @returns {Uint8Array} 32-byte chaining value
 */
function parentCV(leftCV, rightCV, isRoot) {
  // Build block from concatenated CVs (64 bytes = 16 words)
  const blockWords = new Uint32Array(16);

  // Left CV -> words 0-7
  for (let i = 0; i < 32; i++) {
    blockWords[i >> 2] |= leftCV[i] << ((i & 3) * 8);
  }

  // Right CV -> words 8-15
  for (let i = 0; i < 32; i++) {
    blockWords[8 + (i >> 2)] |= rightCV[i] << ((i & 3) * 8);
  }

  // Flags: always PARENT, optionally ROOT
  let flags = PARENT;
  if (isRoot) flags |= ROOT;

  // Compress with IV as input CV, counter = 0, blockLen = 64
  const out = new Uint32Array(8);
  compress(IV, 0, blockWords, 0, out, 0, true, 0, BLOCK_LEN, flags);

  return wordsToBytes(out);
}

/**
 * Calculate the left subtree size for a given parent length.
 *
 * The left subtree contains the largest power-of-two number of chunks
 * that leaves at least 1 byte for the right subtree.
 *
 * @param {number} parentLen - Total length of the parent's content
 * @returns {number} Size of the left subtree in bytes
 */
function leftLen(parentLen) {
  // Exact translation from Python reference:
  // available_chunks = (parent_len - 1) // CHUNK_SIZE
  // power_of_two_chunks = 2 ** (available_chunks.bit_length() - 1)
  // return CHUNK_SIZE * power_of_two_chunks

  const availableChunks = Math.floor((parentLen - 1) / CHUNK_LEN);

  // bit_length() in Python = number of bits needed to represent the number
  // For JavaScript: Math.floor(Math.log2(n)) + 1 for n > 0
  const bitLength = availableChunks > 0 ? Math.floor(Math.log2(availableChunks)) + 1 : 0;

  const powerOfTwoChunks = Math.pow(2, bitLength - 1);

  return CHUNK_LEN * powerOfTwoChunks;
}

/**
 * Count the number of chunks for a given content length.
 * Empty content still counts as 1 chunk.
 *
 * @param {number} contentLen - Content length in bytes
 * @returns {number} Number of chunks
 */
function countChunks(contentLen) {
  if (contentLen === 0) return 1;
  return Math.ceil(contentLen / CHUNK_LEN);
}

/**
 * Calculate the size of an encoded subtree (parent nodes only, for outboard).
 * A subtree of N chunks always has N-1 parent nodes.
 *
 * @param {number} contentLen - Content length in bytes
 * @param {boolean} outboard - If true, only count parent nodes (no chunk data)
 * @returns {number} Encoded size in bytes
 */
function encodedSubtreeSize(contentLen, outboard = false) {
  const numChunks = countChunks(contentLen);
  const parentsSize = (numChunks - 1) * 64; // Each parent is 64 bytes (2 CVs)
  return outboard ? parentsSize : parentsSize + contentLen;
}

// ============================================
// BAO ENCODING
// ============================================

const HEADER_SIZE = 8;

/**
 * Encode content length as 8-byte little-endian.
 *
 * @param {number} contentLen - Content length
 * @returns {Uint8Array} 8-byte little-endian length
 */
function encodeLen(contentLen) {
  const bytes = new Uint8Array(HEADER_SIZE);
  // JavaScript can safely represent integers up to 2^53-1
  // For a proper 64-bit LE encoding:
  let n = contentLen;
  for (let i = 0; i < 8; i++) {
    bytes[i] = n & 0xff;
    n = Math.floor(n / 256);
  }
  return bytes;
}

/**
 * Decode 8-byte little-endian length.
 *
 * @param {Uint8Array} bytes - 8-byte buffer
 * @returns {number} Decoded length
 */
function decodeLen(bytes) {
  let n = 0;
  let mult = 1;
  for (let i = 0; i < 8; i++) {
    n += bytes[i] * mult;
    mult *= 256;
  }
  return n;
}

/**
 * Encode data in Bao format.
 *
 * Format: [8-byte length LE] + [pre-order tree nodes]
 * Pre-order: parent node, then left subtree, then right subtree
 *
 * @param {Uint8Array} buf - Input data
 * @param {boolean} outboard - If true, omit chunk data (outboard format)
 * @returns {{ encoded: Uint8Array, hash: Uint8Array }} Encoded data and root hash
 */
function baoEncode(buf, outboard = false) {
  if (typeof buf === 'string') {
    buf = new TextEncoder().encode(buf);
  }
  if (!(buf instanceof Uint8Array)) {
    buf = new Uint8Array(buf);
  }

  let chunkIndex = 0;

  /**
   * Recursive encoding function.
   *
   * @param {Uint8Array} data - Data segment to encode
   * @param {boolean} isRoot - Whether this is the root node
   * @returns {{ encoded: Uint8Array, cv: Uint8Array }}
   */
  function encodeRecurse(data, isRoot) {
    if (data.length <= CHUNK_LEN) {
      // Leaf node: single chunk
      const cv = chunkCV(data, chunkIndex, isRoot);
      const chunkEncoded = outboard ? new Uint8Array(0) : data;
      chunkIndex++;
      return { encoded: chunkEncoded, cv };
    }

    // Interior node: split into left and right subtrees
    const lLen = leftLen(data.length);

    // Recursively encode left and right (neither is root)
    const leftResult = encodeRecurse(data.subarray(0, lLen), false);
    const rightResult = encodeRecurse(data.subarray(lLen), false);

    // Parent node = left_cv + right_cv (64 bytes)
    const parentNode = new Uint8Array(64);
    parentNode.set(leftResult.cv, 0);
    parentNode.set(rightResult.cv, 32);

    // Compute parent CV
    const cv = parentCV(leftResult.cv, rightResult.cv, isRoot);

    // Pre-order: parent node, then left, then right
    const encoded = new Uint8Array(
      parentNode.length + leftResult.encoded.length + rightResult.encoded.length
    );
    encoded.set(parentNode, 0);
    encoded.set(leftResult.encoded, parentNode.length);
    encoded.set(rightResult.encoded, parentNode.length + leftResult.encoded.length);

    return { encoded, cv };
  }

  // Encode the tree (root finalization at top level)
  const result = encodeRecurse(buf, true);

  // Prepend length header
  const header = encodeLen(buf.length);
  const output = new Uint8Array(header.length + result.encoded.length);
  output.set(header, 0);
  output.set(result.encoded, header.length);

  return { encoded: output, hash: result.cv };
}

// ============================================
// BAO DECODING
// ============================================

const HASH_SIZE = 32;
const PARENT_SIZE = 64;

/**
 * Compare two byte arrays in constant time.
 *
 * @param {Uint8Array} a - First array
 * @param {Uint8Array} b - Second array
 * @returns {boolean} True if equal
 */
function constantTimeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a[i] ^ b[i];
  }
  return diff === 0;
}

/**
 * Verify a chunk's CV matches the expected value.
 *
 * @param {Uint8Array} expectedCV - Expected 32-byte CV
 * @param {Uint8Array} chunkBytes - Chunk data
 * @param {number} chunkIndex - Chunk counter
 * @param {boolean} isRoot - Whether this is the root
 * @throws {Error} If verification fails
 */
function verifyChunk(expectedCV, chunkBytes, chunkIndex, isRoot) {
  const actualCV = chunkCV(chunkBytes, chunkIndex, isRoot);
  if (!constantTimeEqual(expectedCV, actualCV)) {
    throw new Error(`Chunk ${chunkIndex} verification failed: hash mismatch`);
  }
}

/**
 * Verify a parent node's CV matches the expected value.
 *
 * @param {Uint8Array} expectedCV - Expected 32-byte CV
 * @param {Uint8Array} parentBytes - 64-byte parent node (left_cv + right_cv)
 * @param {boolean} isRoot - Whether this is the root
 * @throws {Error} If verification fails
 */
function verifyParent(expectedCV, parentBytes, isRoot) {
  const leftCV = parentBytes.subarray(0, HASH_SIZE);
  const rightCV = parentBytes.subarray(HASH_SIZE, PARENT_SIZE);
  const actualCV = parentCV(leftCV, rightCV, isRoot);
  if (!constantTimeEqual(expectedCV, actualCV)) {
    throw new Error('Parent node verification failed: hash mismatch');
  }
}

/**
 * Decode and verify a Bao-encoded stream.
 *
 * @param {Uint8Array} encoded - Combined Bao encoding (header + tree + chunks)
 * @param {Uint8Array} rootHash - Expected 32-byte root hash
 * @param {Uint8Array} [outboardData] - Optional original data for outboard mode
 * @returns {Uint8Array} Decoded and verified data
 * @throws {Error} If verification fails
 */
function baoDecode(encoded, rootHash, outboardData = null) {
  if (encoded.length < HEADER_SIZE) {
    throw new Error('Encoded data too short: missing header');
  }

  // Parse length header
  const contentLen = decodeLen(encoded.subarray(0, HEADER_SIZE));

  // For outboard mode, we need the original data
  const isOutboard = outboardData !== null;
  if (isOutboard && outboardData.length !== contentLen) {
    throw new Error(`Outboard data length mismatch: expected ${contentLen}, got ${outboardData.length}`);
  }

  // Validate root hash length
  if (rootHash.length !== HASH_SIZE) {
    throw new Error(`Root hash must be ${HASH_SIZE} bytes`);
  }

  // Output buffer
  const output = new Uint8Array(contentLen);
  let outputPos = 0;

  // Reading positions
  let treePos = HEADER_SIZE; // Position in tree/parent nodes
  let dataPos = 0;          // Position in outboard data (if applicable)
  let chunkIndex = 0;

  /**
   * Recursive decode function.
   *
   * @param {Uint8Array} subtreeCV - Expected CV for this subtree
   * @param {number} subtreeLen - Length of content in this subtree
   * @param {boolean} isRoot - Whether this is the root node
   */
  function decodeRecurse(subtreeCV, subtreeLen, isRoot) {
    if (subtreeLen <= CHUNK_LEN) {
      // Leaf node: read and verify chunk
      let chunk;
      if (isOutboard) {
        chunk = outboardData.subarray(dataPos, dataPos + subtreeLen);
        dataPos += subtreeLen;
      } else {
        chunk = encoded.subarray(treePos, treePos + subtreeLen);
        treePos += subtreeLen;
      }

      verifyChunk(subtreeCV, chunk, chunkIndex, isRoot);
      chunkIndex++;

      // Copy to output
      output.set(chunk, outputPos);
      outputPos += subtreeLen;
    } else {
      // Interior node: read parent, verify, and recurse
      const parent = encoded.subarray(treePos, treePos + PARENT_SIZE);
      treePos += PARENT_SIZE;

      verifyParent(subtreeCV, parent, isRoot);

      const leftCV = parent.subarray(0, HASH_SIZE);
      const rightCV = parent.subarray(HASH_SIZE, PARENT_SIZE);
      const lLen = leftLen(subtreeLen);

      // Recurse into left and right subtrees (neither is root)
      decodeRecurse(leftCV, lLen, false);
      decodeRecurse(rightCV, subtreeLen - lLen, false);
    }
  }

  // Start decoding from root
  decodeRecurse(rootHash, contentLen, true);

  return output;
}

// ============================================
// BAO SLICING
// ============================================

/**
 * Extract a slice from a Bao encoding.
 *
 * The slice contains only the parent nodes and chunks needed to verify
 * the requested byte range. This is always a combined-format slice
 * (chunks are included inline).
 *
 * @param {Uint8Array} encoded - Combined Bao encoding
 * @param {number} sliceStart - Start byte offset
 * @param {number} sliceLen - Number of bytes to include
 * @param {Uint8Array} [outboardData] - Original data for outboard mode
 * @returns {Uint8Array} Slice encoding
 */
function baoSlice(encoded, sliceStart, sliceLen, outboardData = null) {
  if (encoded.length < HEADER_SIZE) {
    throw new Error('Encoded data too short: missing header');
  }

  const contentLen = decodeLen(encoded.subarray(0, HEADER_SIZE));
  const isOutboard = outboardData !== null;

  // Validate outboard data length
  if (isOutboard && outboardData.length !== contentLen) {
    throw new Error(`Outboard data length mismatch: expected ${contentLen}, got ${outboardData.length}`);
  }

  // Normalize slice parameters (per spec)
  if (sliceLen === 0) {
    sliceLen = 1;
  }
  let sliceEnd = sliceStart + sliceLen;

  // If sliceStart is past EOF, adjust to include final chunk
  if (sliceStart >= contentLen) {
    sliceStart = contentLen > 0 ? contentLen - 1 : 0;
    sliceEnd = sliceStart + 1;
  }

  // Collect output chunks
  const outputParts = [];
  outputParts.push(encoded.subarray(0, HEADER_SIZE)); // Header

  // Reading positions
  let treePos = HEADER_SIZE;
  let dataPos = 0;

  /**
   * Recursive slice extraction.
   *
   * @param {number} subtreeStart - Start byte of this subtree in content
   * @param {number} subtreeLen - Length of content in this subtree
   */
  function sliceRecurse(subtreeStart, subtreeLen) {
    const subtreeEnd = subtreeStart + subtreeLen;

    if (subtreeEnd <= sliceStart) {
      // Subtree is entirely before slice - skip it
      const parentNodesSize = encodedSubtreeSize(subtreeLen, true);
      treePos += parentNodesSize;
      if (!isOutboard) {
        treePos += subtreeLen;
      }
      dataPos += subtreeLen;
    } else if (sliceEnd <= subtreeStart) {
      // Subtree is entirely after slice - skip it (don't even read)
      // Nothing to do
    } else if (subtreeLen <= CHUNK_LEN) {
      // Chunk overlaps with slice - include it
      let chunk;
      if (isOutboard) {
        chunk = outboardData.subarray(dataPos, dataPos + subtreeLen);
      } else {
        chunk = encoded.subarray(treePos, treePos + subtreeLen);
        treePos += subtreeLen;
      }
      dataPos += subtreeLen;
      outputParts.push(chunk);
    } else {
      // Parent node - include it and recurse
      const parent = encoded.subarray(treePos, treePos + PARENT_SIZE);
      treePos += PARENT_SIZE;
      outputParts.push(parent);

      const lLen = leftLen(subtreeLen);
      sliceRecurse(subtreeStart, lLen);
      sliceRecurse(subtreeStart + lLen, subtreeLen - lLen);
    }
  }

  sliceRecurse(0, contentLen);

  // Concatenate all parts
  const totalLen = outputParts.reduce((sum, part) => sum + part.length, 0);
  const result = new Uint8Array(totalLen);
  let offset = 0;
  for (const part of outputParts) {
    result.set(part, offset);
    offset += part.length;
  }

  return result;
}

/**
 * Decode and verify a Bao slice.
 *
 * @param {Uint8Array} slice - Slice encoding
 * @param {Uint8Array} rootHash - Expected 32-byte root hash
 * @param {number} sliceStart - Start byte offset of the slice
 * @param {number} sliceLen - Number of bytes in the slice
 * @returns {Uint8Array} Decoded and verified slice data
 * @throws {Error} If verification fails
 */
function baoDecodeSlice(slice, rootHash, sliceStart, sliceLen) {
  if (slice.length < HEADER_SIZE) {
    throw new Error('Slice too short: missing header');
  }

  if (rootHash.length !== HASH_SIZE) {
    throw new Error(`Root hash must be ${HASH_SIZE} bytes`);
  }

  const contentLen = decodeLen(slice.subarray(0, HEADER_SIZE));

  // Normalize parameters (per spec)
  let skipOutput = false;
  if (sliceLen === 0) {
    sliceLen = 1;
    skipOutput = true;
  }
  let sliceEnd = sliceStart + sliceLen;

  // If sliceStart is past EOF, adjust to verify final chunk but skip output
  if (sliceStart >= contentLen) {
    sliceStart = contentLen > 0 ? contentLen - 1 : 0;
    sliceEnd = sliceStart + 1;
    skipOutput = true;
  }

  // Calculate output size
  const outputStart = Math.max(0, sliceStart);
  const outputEnd = Math.min(contentLen, sliceEnd);
  const outputLen = skipOutput ? 0 : Math.max(0, outputEnd - outputStart);

  const output = new Uint8Array(outputLen);
  let outputPos = 0;
  let slicePos = HEADER_SIZE;

  /**
   * Recursive slice decoding.
   *
   * @param {number} subtreeStart - Start byte of this subtree in content
   * @param {number} subtreeLen - Length of content in this subtree
   * @param {Uint8Array} subtreeCV - Expected CV for this subtree
   * @param {boolean} isRoot - Whether this is the root node
   */
  function decodeSliceRecurse(subtreeStart, subtreeLen, subtreeCV, isRoot) {
    const subtreeEnd = subtreeStart + subtreeLen;

    if (subtreeEnd <= sliceStart && contentLen > 0) {
      // Subtree is before slice - skip (not in slice encoding)
      return;
    }

    if (sliceEnd <= subtreeStart && contentLen > 0) {
      // Subtree is after slice - skip (not in slice encoding)
      return;
    }

    if (subtreeLen <= CHUNK_LEN) {
      // Chunk - read, verify, and output overlapping portion
      const chunk = slice.subarray(slicePos, slicePos + subtreeLen);
      slicePos += subtreeLen;

      const chunkIndex = Math.floor(subtreeStart / CHUNK_LEN);
      verifyChunk(subtreeCV, chunk, chunkIndex, isRoot);

      if (!skipOutput) {
        // Calculate which part of this chunk to output
        const chunkStart = Math.max(0, Math.min(subtreeLen, sliceStart - subtreeStart));
        const chunkEnd = Math.max(0, Math.min(subtreeLen, sliceEnd - subtreeStart));
        const chunkSlice = chunk.subarray(chunkStart, chunkEnd);
        output.set(chunkSlice, outputPos);
        outputPos += chunkSlice.length;
      }
    } else {
      // Parent node - read, verify, and recurse
      const parent = slice.subarray(slicePos, slicePos + PARENT_SIZE);
      slicePos += PARENT_SIZE;

      verifyParent(subtreeCV, parent, isRoot);

      const leftCV = parent.subarray(0, HASH_SIZE);
      const rightCV = parent.subarray(HASH_SIZE, PARENT_SIZE);
      const lLen = leftLen(subtreeLen);

      decodeSliceRecurse(subtreeStart, lLen, leftCV, false);
      decodeSliceRecurse(subtreeStart + lLen, subtreeLen - lLen, rightCV, false);
    }
  }

  decodeSliceRecurse(0, contentLen, rootHash, true);

  return output;
}

// Exports
module.exports = {
  // Core primitives
  chunkCV,
  parentCV,
  leftLen,

  // Encoding/Decoding
  baoEncode,
  baoDecode,
  encodeLen,
  decodeLen,

  // Slicing
  baoSlice,
  baoDecodeSlice,

  // Verification helpers
  verifyChunk,
  verifyParent,
  constantTimeEqual,

  // Utilities
  countChunks,
  encodedSubtreeSize,
  wordsToBytes,

  // Constants
  CHUNK_LEN,
  BLOCK_LEN,
  CHUNK_START,
  CHUNK_END,
  PARENT,
  ROOT,
  HEADER_SIZE,
  HASH_SIZE,
  PARENT_SIZE,
  IV
};

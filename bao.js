/**
 * Bao - Verified Streaming for BLAKE3
 *
 * Implements the Bao tree construction primitives for verified streaming.
 * Based on the official Bao specification.
 *
 * @see https://github.com/oconnor663/bao/blob/master/docs/spec.md
 */

const blake3 = require('./blake3.js');
const pool = require('./buffer-pool.js');

// Import from blake3.js
const { IV, BLOCK_LEN, CHUNK_LEN, _compress: compress } = blake3;

// BLAKE3 domain separation flags
const CHUNK_START = 1;
const CHUNK_END = 2;
const PARENT = 4;
const ROOT = 8;

/**
 * Convert a Uint32Array to a Uint8Array (little-endian)
 * @param {Uint32Array} words - Input words
 * @param {Uint8Array} [out] - Optional output buffer (if not provided, allocates new)
 * @returns {Uint8Array} Output bytes
 */
function wordsToBytes(words, out) {
  const bytes = out || new Uint8Array(words.length * 4);
  for (let i = 0; i < words.length; i++) {
    bytes[i * 4] = words[i] & 0xff;
    bytes[i * 4 + 1] = (words[i] >> 8) & 0xff;
    bytes[i * 4 + 2] = (words[i] >> 16) & 0xff;
    bytes[i * 4 + 3] = (words[i] >> 24) & 0xff;
  }
  return bytes;
}

// Reusable Uint32Array buffers for chunkCV/parentCV to reduce allocations
const _blockWords = new Uint32Array(16);
const _cvOut = new Uint32Array(8);
const _cvTemp = new Uint32Array(8);

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
  _cvTemp.set(IV);
  let cv = _cvTemp;

  const chunkLen = chunkBytes.length;
  const numBlocks = chunkLen === 0 ? 1 : Math.ceil(chunkLen / BLOCK_LEN);

  for (let blockIdx = 0; blockIdx < numBlocks; blockIdx++) {
    const blockStart = blockIdx * BLOCK_LEN;
    const blockEnd = Math.min(blockStart + BLOCK_LEN, chunkLen);
    const blockLen = blockEnd - blockStart;

    // Build block words (reuse buffer, clear first)
    _blockWords.fill(0);
    for (let i = 0; i < blockLen; i++) {
      _blockWords[i >> 2] |= chunkBytes[blockStart + i] << ((i & 3) * 8);
    }

    // Determine flags
    let flags = 0;
    const isFirstBlock = blockIdx === 0;
    const isLastBlock = blockIdx === numBlocks - 1;

    if (isFirstBlock) flags |= CHUNK_START;
    if (isLastBlock) flags |= CHUNK_END;
    if (isLastBlock && isRoot) flags |= ROOT;

    // Compress into reusable buffer
    compress(cv, 0, _blockWords, 0, _cvOut, 0, true, chunkIndex, blockLen, flags);

    // Swap buffers for next iteration
    const temp = cv;
    cv = _cvOut;
    if (blockIdx < numBlocks - 1) {
      // Need to preserve cv for next iteration
      _cvTemp.set(_cvOut);
      cv = _cvTemp;
    }
  }

  // Return a new Uint8Array (must allocate for return value)
  return wordsToBytes(cv);
}

// Reusable buffers for parentCV
const _parentBlockWords = new Uint32Array(16);
const _parentOut = new Uint32Array(8);

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
  // Clear and reuse buffer
  _parentBlockWords.fill(0);

  // Left CV -> words 0-7
  for (let i = 0; i < 32; i++) {
    _parentBlockWords[i >> 2] |= leftCV[i] << ((i & 3) * 8);
  }

  // Right CV -> words 8-15
  for (let i = 0; i < 32; i++) {
    _parentBlockWords[8 + (i >> 2)] |= rightCV[i] << ((i & 3) * 8);
  }

  // Flags: always PARENT, optionally ROOT
  let flags = PARENT;
  if (isRoot) flags |= ROOT;

  // Compress with IV as input CV, counter = 0, blockLen = 64
  compress(IV, 0, _parentBlockWords, 0, _parentOut, 0, true, 0, BLOCK_LEN, flags);

  return wordsToBytes(_parentOut);
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
 * Encode data in Bao format (optimized single-allocation version).
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

  // Pre-calculate total output size for single allocation
  const totalSize = HEADER_SIZE + encodedSubtreeSize(buf.length, outboard);
  const output = new Uint8Array(totalSize);

  // Write header
  let n = buf.length;
  for (let i = 0; i < 8; i++) {
    output[i] = n & 0xff;
    n = Math.floor(n / 256);
  }

  let writePos = HEADER_SIZE;
  let chunkIndex = 0;

  /**
   * Recursive encoding function that writes directly to output buffer.
   *
   * @param {Uint8Array} data - Data segment to encode
   * @param {boolean} isRoot - Whether this is the root node
   * @returns {Uint8Array} Chaining value (32 bytes)
   */
  function encodeRecurse(data, isRoot) {
    if (data.length <= CHUNK_LEN) {
      // Leaf node: single chunk
      const cv = chunkCV(data, chunkIndex, isRoot);
      if (!outboard) {
        output.set(data, writePos);
        writePos += data.length;
      }
      chunkIndex++;
      return cv;
    }

    // Interior node: split into left and right subtrees
    const lLen = leftLen(data.length);

    // Reserve space for parent node (64 bytes) at current position
    const parentPos = writePos;
    writePos += 64;

    // Recursively encode left and right (neither is root)
    const leftCV = encodeRecurse(data.subarray(0, lLen), false);
    const rightCV = encodeRecurse(data.subarray(lLen), false);

    // Write parent node at reserved position
    output.set(leftCV, parentPos);
    output.set(rightCV, parentPos + 32);

    // Compute and return parent CV
    return parentCV(leftCV, rightCV, isRoot);
  }

  // Encode the tree (root finalization at top level)
  const rootHash = encodeRecurse(buf, true);

  return { encoded: output, hash: rootHash };
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

      // Verify we got the expected amount of data
      if (chunk.length !== subtreeLen) {
        throw new Error(`Truncated chunk: expected ${subtreeLen} bytes, got ${chunk.length}`);
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

// ============================================
// STREAMING BAO ENCODER
// ============================================

/**
 * Streaming Bao encoder with optimized memory usage.
 *
 * - Outboard mode: O(n) memory but only 32 bytes per chunk (stores CVs only)
 * - Combined mode: O(n) memory (must store full chunks)
 *
 * Computes chunk CVs incrementally as data arrives.
 */
class BaoEncoder {
  /**
   * Create a streaming Bao encoder.
   *
   * @param {boolean} outboard - If true, produce outboard format (no chunk data)
   */
  constructor(outboard = false) {
    this.outboard = outboard;
    this.totalLen = 0;
    this.pendingData = [];
    this.pendingLen = 0;

    // For outboard mode: store only chunk CVs (32 bytes each)
    // For combined mode: store full chunk data
    this.chunkCVs = [];      // Used in outboard mode
    this.chunkData = [];     // Used in combined mode
    this.chunkIndex = 0;

    // Cache finalize result for idempotency
    this._finalResult = null;
  }

  /**
   * Write data to the encoder.
   *
   * @param {Uint8Array|string} data - Data to write
   * @returns {BaoEncoder} this (for chaining)
   */
  write(data) {
    if (typeof data === 'string') {
      data = new TextEncoder().encode(data);
    }
    if (!(data instanceof Uint8Array)) {
      data = new Uint8Array(data);
    }

    if (data.length === 0) return this;

    this.totalLen += data.length;

    // Add to pending buffer
    this.pendingData.push(data);
    this.pendingLen += data.length;

    // Process complete chunks
    while (this.pendingLen >= CHUNK_LEN) {
      const chunk = this._extractChunk(CHUNK_LEN);
      this._processChunk(chunk);
    }

    return this;
  }

  /**
   * Extract a chunk of specified size from pending data.
   */
  _extractChunk(size) {
    if (this.pendingData.length === 1 && this.pendingData[0].length >= size) {
      const first = this.pendingData[0];
      const result = new Uint8Array(first.subarray(0, size));
      if (first.length === size) {
        this.pendingData.shift();
      } else {
        this.pendingData[0] = first.subarray(size);
      }
      this.pendingLen -= size;
      return result;
    }

    const result = new Uint8Array(size);
    let resultPos = 0;

    while (resultPos < size && this.pendingData.length > 0) {
      const first = this.pendingData[0];
      const needed = size - resultPos;

      if (first.length <= needed) {
        result.set(first, resultPos);
        resultPos += first.length;
        this.pendingData.shift();
      } else {
        result.set(first.subarray(0, needed), resultPos);
        this.pendingData[0] = first.subarray(needed);
        resultPos += needed;
      }
    }

    this.pendingLen -= size;
    return result;
  }

  /**
   * Process a complete chunk.
   */
  _processChunk(chunk) {
    // Compute chunk CV (not root - determined at finalize)
    const cv = chunkCV(chunk, this.chunkIndex, false);
    this.chunkIndex++;

    if (this.outboard) {
      this.chunkCVs.push(cv);  // Store 32-byte CV only
    } else {
      this.chunkCVs.push(cv);  // Store CV for tree building
      this.chunkData.push(chunk);  // Store full chunk
    }
  }

  /**
   * Finalize the encoding and return the result.
   * This method is idempotent - calling it multiple times returns the same result.
   *
   * @returns {{ encoded: Uint8Array, hash: Uint8Array }}
   */
  finalize() {
    // Return cached result if already finalized
    if (this._finalResult) {
      return this._finalResult;
    }

    // Handle remaining pending data as final chunk
    if (this.pendingLen > 0 || this.chunkIndex === 0) {
      const finalChunk = this.pendingLen > 0
        ? this._extractChunk(this.pendingLen)
        : new Uint8Array(0);

      // Single chunk case: it's the root
      if (this.chunkIndex === 0) {
        const rootHash = chunkCV(finalChunk, 0, true);
        const header = encodeLen(this.totalLen);

        if (this.outboard) {
          this._finalResult = { encoded: header, hash: rootHash };
          return this._finalResult;
        } else {
          const encoded = new Uint8Array(HEADER_SIZE + finalChunk.length);
          encoded.set(header, 0);
          encoded.set(finalChunk, HEADER_SIZE);
          this._finalResult = { encoded, hash: rootHash };
          return this._finalResult;
        }
      }

      // Multiple chunks: process final chunk
      const cv = chunkCV(finalChunk, this.chunkIndex, false);
      this.chunkIndex++;
      this.chunkCVs.push(cv);

      if (!this.outboard) {
        this.chunkData.push(finalChunk);
      }
    }

    // Build tree from chunk CVs
    if (this.outboard) {
      this._finalResult = this._buildOutboardFromCVs();
    } else {
      this._finalResult = this._buildCombinedFromCVs();
    }
    return this._finalResult;
  }

  /**
   * Build outboard encoding from stored chunk CVs.
   * Memory efficient: only stores 32 bytes per chunk.
   */
  _buildOutboardFromCVs() {
    const numChunks = this.chunkCVs.length;

    if (numChunks === 1) {
      // Recompute with isRoot=true (the stored CV used isRoot=false)
      const header = encodeLen(this.totalLen);
      // For single chunk, the CV should have been computed with isRoot=true
      // But we stored it with isRoot=false, so we need the original chunk...
      // Actually, this case is handled in finalize() above, so we shouldn't get here
      return { encoded: header, hash: this.chunkCVs[0] };
    }

    const numParents = numChunks - 1;
    const outputSize = HEADER_SIZE + numParents * 64;
    const output = new Uint8Array(outputSize);

    // Write header
    let n = this.totalLen;
    for (let i = 0; i < 8; i++) {
      output[i] = n & 0xff;
      n = Math.floor(n / 256);
    }

    let writePos = HEADER_SIZE;

    // Memoize subtree CV computations
    const cvCache = new Map();

    const getSubtreeCV = (startIdx, count) => {
      if (count === 1) return this.chunkCVs[startIdx];

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
        return this.chunkCVs[startIdx];
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
   * Build combined encoding from stored chunks and CVs.
   */
  _buildCombinedFromCVs() {
    const numChunks = this.chunkCVs.length;

    // Calculate output size
    const numParents = Math.max(0, numChunks - 1);
    const outputSize = HEADER_SIZE + numParents * 64 + this.totalLen;
    const output = new Uint8Array(outputSize);

    // Write header
    let n = this.totalLen;
    for (let i = 0; i < 8; i++) {
      output[i] = n & 0xff;
      n = Math.floor(n / 256);
    }

    let writePos = HEADER_SIZE;
    let chunkWriteIdx = 0;

    // Memoize subtree CV computations
    const cvCache = new Map();

    const getSubtreeCV = (startIdx, count) => {
      if (count === 1) return this.chunkCVs[startIdx];

      const key = `${startIdx}:${count}`;
      if (cvCache.has(key)) return cvCache.get(key);

      const leftCount = 1 << Math.floor(Math.log2(count - 1));
      const leftCV = getSubtreeCV(startIdx, leftCount);
      const rightCV = getSubtreeCV(startIdx + leftCount, count - leftCount);
      const cv = parentCV(leftCV, rightCV, false);
      cvCache.set(key, cv);
      return cv;
    };

    // Write tree in pre-order (combined mode includes chunk data)
    const writeTree = (startIdx, count, isRoot) => {
      if (count === 1) {
        // Leaf: write chunk data
        output.set(this.chunkData[chunkWriteIdx], writePos);
        writePos += this.chunkData[chunkWriteIdx].length;
        chunkWriteIdx++;
        return this.chunkCVs[startIdx];
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

    if (numChunks === 1) {
      // Single chunk, no parent nodes
      output.set(this.chunkData[0], HEADER_SIZE);
      return { encoded: output, hash: chunkCV(this.chunkData[0], 0, true) };
    }

    const rootHash = writeTree(0, numChunks, true);

    return { encoded: output, hash: rootHash };
  }
}

// ============================================
// STREAMING BAO DECODER
// ============================================

/**
 * Streaming Bao decoder.
 *
 * Verifies and decodes Bao data incrementally as it arrives.
 * Uses O(log n) memory via a verification stack.
 */
class BaoDecoder {
  /**
   * Create a streaming Bao decoder.
   *
   * @param {Uint8Array} rootHash - Expected 32-byte root hash
   * @param {number} contentLen - Expected content length
   * @param {boolean} isOutboard - If true, expect outboard format
   */
  constructor(rootHash, contentLen, isOutboard = false) {
    if (rootHash.length !== HASH_SIZE) {
      throw new Error(`Root hash must be ${HASH_SIZE} bytes`);
    }

    this.rootHash = rootHash;
    this.contentLen = contentLen;
    this.isOutboard = isOutboard;
    this.outboardData = null;  // Set via setOutboardData() if needed

    // Input buffer
    this.buffer = [];
    this.bufferLen = 0;

    // Output buffer (verified data)
    this.outputBuffer = [];

    // Verification state
    this.verified = false;
    this.error = null;

    // Tree traversal state (pre-order DFS)
    this.stack = [];          // Stack of { cv, len, isRoot, isLeft }
    this.chunkIndex = 0;
    this.bytesDecoded = 0;

    // Initialize stack with root
    if (contentLen > 0 || contentLen === 0) {
      this.stack.push({
        cv: rootHash,
        start: 0,
        len: contentLen,
        isRoot: true
      });
    }

    // For outboard mode, we need the data separately
    this.outboardPos = 0;
  }

  /**
   * Set outboard data source for outboard mode.
   *
   * @param {Uint8Array} data - Original content data
   */
  setOutboardData(data) {
    if (data.length !== this.contentLen) {
      throw new Error(`Outboard data length mismatch: expected ${this.contentLen}, got ${data.length}`);
    }
    this.outboardData = data;
  }

  /**
   * Write encoded data to the decoder.
   *
   * @param {Uint8Array} data - Encoded data chunk
   */
  write(data) {
    if (this.error) {
      throw new Error(`Decoder in error state: ${this.error}`);
    }

    if (typeof data === 'string') {
      data = new TextEncoder().encode(data);
    }
    if (!(data instanceof Uint8Array)) {
      data = new Uint8Array(data);
    }

    if (data.length > 0) {
      this.buffer.push(data);
      this.bufferLen += data.length;
    }

    // Process as much as possible (even for empty writes, handles empty content case)
    this._process();
  }

  /**
   * Get the number of bytes available in the buffer.
   *
   * @returns {number} Available bytes
   */
  _available() {
    return this.bufferLen;
  }

  /**
   * Peek at bytes from the buffer without consuming.
   *
   * @param {number} size - Number of bytes to peek
   * @returns {Uint8Array|null} Bytes or null if not enough available
   */
  _peek(size) {
    if (this.bufferLen < size) return null;

    const result = new Uint8Array(size);
    let resultPos = 0;
    let bufIdx = 0;
    let bufOffset = 0;

    while (resultPos < size) {
      const buf = this.buffer[bufIdx];
      const available = buf.length - bufOffset;
      const needed = size - resultPos;

      if (available <= needed) {
        result.set(buf.subarray(bufOffset), resultPos);
        resultPos += available;
        bufIdx++;
        bufOffset = 0;
      } else {
        result.set(buf.subarray(bufOffset, bufOffset + needed), resultPos);
        resultPos += needed;
      }
    }

    return result;
  }

  /**
   * Consume bytes from the buffer.
   *
   * @param {number} size - Number of bytes to consume
   * @returns {Uint8Array} Consumed bytes
   */
  _consume(size) {
    if (this.bufferLen < size) {
      throw new Error('Not enough data in buffer');
    }

    const result = new Uint8Array(size);
    let resultPos = 0;

    while (resultPos < size) {
      const first = this.buffer[0];
      const needed = size - resultPos;

      if (first.length <= needed) {
        result.set(first, resultPos);
        resultPos += first.length;
        this.buffer.shift();
      } else {
        result.set(first.subarray(0, needed), resultPos);
        this.buffer[0] = first.subarray(needed);
        resultPos += needed;
      }
    }

    this.bufferLen -= size;
    return result;
  }

  /**
   * Process buffered data.
   */
  _process() {
    try {
      while (this.stack.length > 0) {
        const node = this.stack[this.stack.length - 1];

        if (node.len <= CHUNK_LEN) {
          // Leaf node: need full chunk data
          const chunkSize = node.len;
          let chunk;

          if (this.isOutboard) {
            // Get chunk from outboard data
            if (!this.outboardData && chunkSize > 0) {
              throw new Error('Outboard data not set');
            }
            chunk = chunkSize > 0
              ? this.outboardData.subarray(this.outboardPos, this.outboardPos + chunkSize)
              : new Uint8Array(0);
            this.outboardPos += chunkSize;
          } else {
            // Need chunk from encoded stream (0-byte chunks need no data)
            if (chunkSize > 0 && this._available() < chunkSize) {
              return; // Wait for more data
            }
            chunk = chunkSize > 0 ? this._consume(chunkSize) : new Uint8Array(0);
          }

          // Verify chunk
          verifyChunk(node.cv, chunk, this.chunkIndex, node.isRoot);
          this.chunkIndex++;
          this.bytesDecoded += chunkSize;

          // Output verified chunk (only if non-empty)
          if (chunkSize > 0) {
            this.outputBuffer.push(chunk);
          }

          // Pop from stack
          this.stack.pop();

        } else {
          // Interior node: need parent data (64 bytes)
          if (this._available() < PARENT_SIZE) {
            return; // Wait for more data
          }

          const parent = this._consume(PARENT_SIZE);

          // Verify parent
          verifyParent(node.cv, parent, node.isRoot);

          const leftCV = parent.subarray(0, HASH_SIZE);
          const rightCV = parent.subarray(HASH_SIZE, PARENT_SIZE);
          const lLen = leftLen(node.len);

          // Pop current node
          this.stack.pop();

          // Push right first (so left is processed first - pre-order)
          this.stack.push({
            cv: new Uint8Array(rightCV), // Copy since parent buffer may be reused
            start: node.start + lLen,
            len: node.len - lLen,
            isRoot: false
          });

          this.stack.push({
            cv: new Uint8Array(leftCV),
            start: node.start,
            len: lLen,
            isRoot: false
          });
        }
      }

      // If stack is empty and we've decoded all bytes, we're done
      if (this.stack.length === 0 && this.bytesDecoded === this.contentLen) {
        this.verified = true;
      }
    } catch (e) {
      this.error = e.message;
      throw e;
    }
  }

  /**
   * Read verified decoded data.
   *
   * @returns {Uint8Array} Verified decoded data available so far
   */
  read() {
    if (this.outputBuffer.length === 0) {
      return new Uint8Array(0);
    }

    // Concatenate all output chunks
    const totalLen = this.outputBuffer.reduce((sum, chunk) => sum + chunk.length, 0);
    const result = new Uint8Array(totalLen);
    let pos = 0;
    for (const chunk of this.outputBuffer) {
      result.set(chunk, pos);
      pos += chunk.length;
    }

    // Clear output buffer
    this.outputBuffer = [];

    return result;
  }

  /**
   * Check if decoding is complete.
   *
   * @returns {boolean} True if all data has been verified
   */
  isComplete() {
    return this.verified;
  }

  /**
   * Finalize decoding and return all verified data.
   *
   * @returns {Uint8Array} Complete verified decoded data
   * @throws {Error} If not all data has been received
   */
  finalize() {
    if (!this.verified) {
      if (this.error) {
        throw new Error(`Decoding failed: ${this.error}`);
      }
      throw new Error('Incomplete data: not all bytes received');
    }

    return this.read();
  }
}

// ============================================
// IROH CHUNK GROUP SUPPORT
// ============================================

/**
 * Iroh uses chunk groups to reduce outboard size.
 * A chunk group of 2^N chunks means we only store parent nodes
 * at or above the chunk group level in outboard format.
 *
 * Default Iroh uses chunkGroupLog=4 (16 chunks = 16 KiB groups)
 * This reduces outboard size by ~16x compared to standard Bao.
 */

const IROH_CHUNK_GROUP_LOG = 4;  // 2^4 = 16 chunks per group
const IROH_CHUNK_GROUP_SIZE = CHUNK_LEN * (1 << IROH_CHUNK_GROUP_LOG);  // 16384 bytes

/**
 * Count chunk groups for a given content length.
 *
 * @param {number} contentLen - Content length in bytes
 * @param {number} chunkGroupLog - Log2 of chunks per group (default 4)
 * @returns {number} Number of chunk groups
 */
function countChunkGroups(contentLen, chunkGroupLog = IROH_CHUNK_GROUP_LOG) {
  const groupSize = CHUNK_LEN * (1 << chunkGroupLog);
  if (contentLen === 0) return 1;
  return Math.ceil(contentLen / groupSize);
}

/**
 * Calculate outboard size for Iroh format (chunk groups).
 * Only stores parent nodes at or above chunk group level.
 *
 * @param {number} contentLen - Content length in bytes
 * @param {number} chunkGroupLog - Log2 of chunks per group
 * @returns {number} Outboard size in bytes
 */
function irohOutboardSize(contentLen, chunkGroupLog = IROH_CHUNK_GROUP_LOG) {
  const numGroups = countChunkGroups(contentLen, chunkGroupLog);
  // N groups = N-1 parent nodes at group level, each 64 bytes
  return HEADER_SIZE + (numGroups - 1) * PARENT_SIZE;
}

/**
 * Compute the chaining value for a chunk group.
 * This computes the subtree hash for a group of chunks.
 *
 * @param {Uint8Array} groupData - Data for this chunk group
 * @param {number} startChunkIndex - Index of first chunk in group
 * @param {boolean} isRoot - Whether this is the root (only if single group)
 * @returns {Uint8Array} 32-byte chaining value for the group
 */
function chunkGroupCV(groupData, startChunkIndex, isRoot) {
  const numChunks = Math.ceil(groupData.length / CHUNK_LEN) || 1;

  if (numChunks === 1) {
    // Single chunk - just compute chunk CV
    return chunkCV(groupData, startChunkIndex, isRoot);
  }

  // Multiple chunks - build subtree
  // Compute all chunk CVs first
  const chunkCVs = [];
  for (let i = 0; i < numChunks; i++) {
    const chunkStart = i * CHUNK_LEN;
    const chunkEnd = Math.min(chunkStart + CHUNK_LEN, groupData.length);
    const chunk = groupData.subarray(chunkStart, chunkEnd);
    chunkCVs.push(chunkCV(chunk, startChunkIndex + i, false));
  }

  // Build tree bottom-up
  while (chunkCVs.length > 1) {
    const newLevel = [];
    for (let i = 0; i < chunkCVs.length; i += 2) {
      if (i + 1 < chunkCVs.length) {
        // Pair available
        const isRootNode = isRoot && newLevel.length === 0 && i + 2 >= chunkCVs.length;
        newLevel.push(parentCV(chunkCVs[i], chunkCVs[i + 1], isRootNode));
      } else {
        // Odd one out - promote to next level
        newLevel.push(chunkCVs[i]);
      }
    }
    chunkCVs.length = 0;
    chunkCVs.push(...newLevel);
  }

  return chunkCVs[0];
}

/**
 * Encode data in Iroh-compatible Bao format with chunk groups.
 *
 * The hash is identical to standard Bao (same BLAKE3 tree).
 * In outboard mode, only parent nodes at chunk group level are stored.
 *
 * @param {Uint8Array} buf - Input data
 * @param {boolean} outboard - If true, produce outboard format
 * @param {number} chunkGroupLog - Log2 of chunks per group (default 4 = 16 chunks)
 * @returns {{ encoded: Uint8Array, hash: Uint8Array }} Encoded data and root hash
 */
function baoEncodeIroh(buf, outboard = false, chunkGroupLog = IROH_CHUNK_GROUP_LOG) {
  if (typeof buf === 'string') {
    buf = new TextEncoder().encode(buf);
  }
  if (!(buf instanceof Uint8Array)) {
    buf = new Uint8Array(buf);
  }

  // For combined mode, use standard encoding (no difference)
  if (!outboard) {
    return baoEncode(buf, false);
  }

  // For outboard mode with chunk groups:
  // 1. Compute chunk group CVs
  // 2. Build tree from group CVs only
  // 3. Store only group-level parent nodes

  const groupSize = CHUNK_LEN * (1 << chunkGroupLog);
  const numGroups = countChunkGroups(buf.length, chunkGroupLog);

  if (numGroups === 1) {
    // Single group - just compute root hash, no parent nodes needed
    const rootHash = chunkGroupCV(buf, 0, true);
    const header = encodeLen(buf.length);
    return { encoded: header, hash: rootHash };
  }

  // Multiple groups - compute group CVs and build tree
  const groupCVs = [];
  for (let g = 0; g < numGroups; g++) {
    const groupStart = g * groupSize;
    const groupEnd = Math.min(groupStart + groupSize, buf.length);
    const groupData = buf.subarray(groupStart, groupEnd);
    const startChunkIndex = g * (1 << chunkGroupLog);
    groupCVs.push(chunkGroupCV(groupData, startChunkIndex, false));
  }

  // Build tree from group CVs using same left-len split as standard Bao
  // but operating on groups instead of chunks
  function encodeGroupTree(cvs, isRoot) {
    if (cvs.length === 1) {
      return { encoded: new Uint8Array(0), cv: cvs[0] };
    }

    if (cvs.length === 2) {
      const parentNode = new Uint8Array(64);
      parentNode.set(cvs[0], 0);
      parentNode.set(cvs[1], 32);
      const cv = parentCV(cvs[0], cvs[1], isRoot);
      return { encoded: parentNode, cv };
    }

    // Split using power-of-two rule
    const leftCount = 1 << (Math.floor(Math.log2(cvs.length - 1)));
    const leftCVs = cvs.slice(0, leftCount);
    const rightCVs = cvs.slice(leftCount);

    const leftResult = encodeGroupTree(leftCVs, false);
    const rightResult = encodeGroupTree(rightCVs, false);

    const parentNode = new Uint8Array(64);
    parentNode.set(leftResult.cv, 0);
    parentNode.set(rightResult.cv, 32);

    const cv = parentCV(leftResult.cv, rightResult.cv, isRoot);

    const encoded = new Uint8Array(64 + leftResult.encoded.length + rightResult.encoded.length);
    encoded.set(parentNode, 0);
    encoded.set(leftResult.encoded, 64);
    encoded.set(rightResult.encoded, 64 + leftResult.encoded.length);

    return { encoded, cv };
  }

  const result = encodeGroupTree(groupCVs, true);
  const header = encodeLen(buf.length);
  const output = new Uint8Array(header.length + result.encoded.length);
  output.set(header, 0);
  output.set(result.encoded, header.length);

  return { encoded: output, hash: result.cv };
}

/**
 * Decode and verify Iroh-format Bao encoding.
 *
 * @param {Uint8Array} encoded - Iroh outboard encoding
 * @param {Uint8Array} rootHash - Expected 32-byte root hash
 * @param {Uint8Array} data - Original data (required for outboard)
 * @param {number} chunkGroupLog - Log2 of chunks per group
 * @returns {Uint8Array} Verified data
 */
function baoDecodeIroh(encoded, rootHash, data, chunkGroupLog = IROH_CHUNK_GROUP_LOG) {
  if (encoded.length < HEADER_SIZE) {
    throw new Error('Encoded data too short: missing header');
  }

  if (rootHash.length !== HASH_SIZE) {
    throw new Error(`Root hash must be ${HASH_SIZE} bytes`);
  }

  const contentLen = decodeLen(encoded.subarray(0, HEADER_SIZE));

  if (data.length !== contentLen) {
    throw new Error(`Data length mismatch: expected ${contentLen}, got ${data.length}`);
  }

  const groupSize = CHUNK_LEN * (1 << chunkGroupLog);
  const numGroups = countChunkGroups(contentLen, chunkGroupLog);

  // Compute expected group CVs from data
  const groupCVs = [];
  for (let g = 0; g < numGroups; g++) {
    const groupStart = g * groupSize;
    const groupEnd = Math.min(groupStart + groupSize, data.length);
    const groupData = data.subarray(groupStart, groupEnd);
    const startChunkIndex = g * (1 << chunkGroupLog);
    groupCVs.push(chunkGroupCV(groupData, startChunkIndex, false));
  }

  let treePos = HEADER_SIZE;

  // Verify tree structure
  function verifyGroupTree(cvs, expectedCV, isRoot) {
    if (cvs.length === 1) {
      // Single group - verify directly against expected CV
      // The computed CV should match the expected CV from parent (or root hash)
      if (!constantTimeEqual(cvs[0], expectedCV)) {
        throw new Error(isRoot ? 'Root hash mismatch' : 'Group CV mismatch');
      }
      return;
    }

    if (cvs.length >= 2) {
      // Read parent node from encoding
      const parent = encoded.subarray(treePos, treePos + PARENT_SIZE);
      treePos += PARENT_SIZE;

      // Verify parent hash
      verifyParent(expectedCV, parent, isRoot);

      const leftCV = parent.subarray(0, HASH_SIZE);
      const rightCV = parent.subarray(HASH_SIZE, PARENT_SIZE);

      // Split using same rule as encoding
      const leftCount = 1 << (Math.floor(Math.log2(cvs.length - 1)));
      const leftCVs = cvs.slice(0, leftCount);
      const rightCVs = cvs.slice(leftCount);

      verifyGroupTree(leftCVs, leftCV, false);
      verifyGroupTree(rightCVs, rightCV, false);
    }
  }

  if (numGroups === 1) {
    // Single group - just verify root hash
    const actualHash = chunkGroupCV(data, 0, true);
    if (!constantTimeEqual(actualHash, rootHash)) {
      throw new Error('Root hash mismatch');
    }
  } else {
    verifyGroupTree(groupCVs, rootHash, true);
  }

  return data;
}

/**
 * Verify data against Iroh outboard encoding.
 * Convenience function that returns boolean instead of throwing.
 *
 * @param {Uint8Array} outboard - Iroh outboard encoding
 * @param {Uint8Array} rootHash - Expected root hash
 * @param {Uint8Array} data - Data to verify
 * @param {number} chunkGroupLog - Log2 of chunks per group
 * @returns {boolean} True if verification passes
 */
function baoVerifyIroh(outboard, rootHash, data, chunkGroupLog = IROH_CHUNK_GROUP_LOG) {
  try {
    baoDecodeIroh(outboard, rootHash, data, chunkGroupLog);
    return true;
  } catch {
    return false;
  }
}

// ============================================
// BITFIELD HELPERS
// ============================================

/**
 * Create an empty bitfield with the given number of bits.
 * @param {number} numBits - Number of bits in the bitfield
 * @returns {Uint8Array} Bitfield with all bits set to 0
 */
function createBitfield(numBits) {
  const numBytes = Math.ceil(numBits / 8);
  return new Uint8Array(numBytes);
}

/**
 * Set a bit at the given index.
 * @param {Uint8Array} bitfield - The bitfield
 * @param {number} index - Bit index to set
 */
function setBit(bitfield, index) {
  const byteIndex = Math.floor(index / 8);
  const bitIndex = index % 8;
  if (byteIndex < bitfield.length) {
    bitfield[byteIndex] |= (1 << bitIndex);
  }
}

/**
 * Clear a bit at the given index.
 * @param {Uint8Array} bitfield - The bitfield
 * @param {number} index - Bit index to clear
 */
function clearBit(bitfield, index) {
  const byteIndex = Math.floor(index / 8);
  const bitIndex = index % 8;
  if (byteIndex < bitfield.length) {
    bitfield[byteIndex] &= ~(1 << bitIndex);
  }
}

/**
 * Get a bit at the given index.
 * @param {Uint8Array} bitfield - The bitfield
 * @param {number} index - Bit index to get
 * @returns {boolean} True if bit is set
 */
function getBit(bitfield, index) {
  const byteIndex = Math.floor(index / 8);
  const bitIndex = index % 8;
  if (byteIndex >= bitfield.length) return false;
  return (bitfield[byteIndex] & (1 << bitIndex)) !== 0;
}

/**
 * Count the number of set bits in a bitfield.
 * @param {Uint8Array} bitfield - The bitfield
 * @param {number} numBits - Total number of valid bits (to handle partial last byte)
 * @returns {number} Number of set bits
 */
function countSetBits(bitfield, numBits = bitfield.length * 8) {
  let count = 0;
  for (let i = 0; i < numBits; i++) {
    if (getBit(bitfield, i)) count++;
  }
  return count;
}

// ============================================
// PARTIAL BAO - RESUMABLE DOWNLOADS
// ============================================

/**
 * PartialBao class for tracking incomplete file downloads.
 * Enables resumable downloads and multi-source fetching by tracking
 * which chunk groups have been downloaded and verified.
 */
class PartialBao {
  /**
   * Create a new PartialBao instance.
   * @param {Uint8Array} rootHash - Expected 32-byte root hash
   * @param {number} contentLen - Total content length in bytes
   * @param {number} chunkGroupLog - Log2 of chunks per group (default 4 = 16 chunks)
   */
  constructor(rootHash, contentLen, chunkGroupLog = IROH_CHUNK_GROUP_LOG) {
    if (rootHash.length !== HASH_SIZE) {
      throw new Error(`Root hash must be ${HASH_SIZE} bytes`);
    }
    if (contentLen < 0) {
      throw new Error('Content length must be non-negative');
    }

    this.rootHash = new Uint8Array(rootHash);
    this.contentLen = contentLen;
    this.chunkGroupLog = chunkGroupLog;
    this.groupSize = CHUNK_LEN * (1 << chunkGroupLog);

    // Calculate number of groups
    this._numGroups = countChunkGroups(contentLen, chunkGroupLog);

    // Create bitfield to track which groups are present
    this.bitfield = createBitfield(this._numGroups);

    // Storage for chunk group data
    this.groupData = new Map();

    // Cache for verified parent nodes (for proof verification)
    this.verifiedNodes = new Map();
  }

  /**
   * Get the total number of chunk groups.
   * @returns {number}
   */
  get numGroups() {
    return this._numGroups;
  }

  /**
   * Get the number of groups that have been received.
   * @returns {number}
   */
  get receivedGroups() {
    return countSetBits(this.bitfield, this._numGroups);
  }

  /**
   * Check if all groups have been received.
   * @returns {boolean}
   */
  isComplete() {
    return this.receivedGroups === this._numGroups;
  }

  /**
   * Get completion percentage.
   * @returns {number} Percentage from 0 to 100
   */
  getProgress() {
    if (this._numGroups === 0) return 100;
    return (this.receivedGroups / this._numGroups) * 100;
  }

  /**
   * Check if a specific group has been received.
   * @param {number} groupIndex - Group index
   * @returns {boolean}
   */
  hasGroup(groupIndex) {
    if (groupIndex < 0 || groupIndex >= this._numGroups) return false;
    return getBit(this.bitfield, groupIndex);
  }

  /**
   * Get the expected size of a chunk group.
   * @param {number} groupIndex - Group index
   * @returns {number} Expected size in bytes
   */
  getGroupSize(groupIndex) {
    if (groupIndex < 0 || groupIndex >= this._numGroups) {
      throw new Error(`Invalid group index: ${groupIndex}`);
    }

    const groupStart = groupIndex * this.groupSize;
    const groupEnd = Math.min(groupStart + this.groupSize, this.contentLen);
    return groupEnd - groupStart;
  }

  /**
   * Add a verified chunk group.
   *
   * @param {number} groupIndex - Index of the chunk group (0-based)
   * @param {Uint8Array} data - The chunk group data
   * @param {Uint8Array[]} proof - Array of sibling hashes from leaf to root
   * @returns {boolean} True if the group was added successfully
   */
  addChunkGroup(groupIndex, data, proof) {
    if (groupIndex < 0 || groupIndex >= this._numGroups) {
      throw new Error(`Invalid group index: ${groupIndex}`);
    }

    // Check if already have this group
    if (this.hasGroup(groupIndex)) {
      return true; // Already have it
    }

    // Verify data length
    const expectedSize = this.getGroupSize(groupIndex);
    if (data.length !== expectedSize) {
      throw new Error(`Data length mismatch: expected ${expectedSize}, got ${data.length}`);
    }

    // Compute the chunk group CV
    const startChunkIndex = groupIndex * (1 << this.chunkGroupLog);
    const isOnlyGroup = this._numGroups === 1;
    const groupCV = chunkGroupCV(data, startChunkIndex, isOnlyGroup);

    // Verify against proof (or root hash if single group)
    if (isOnlyGroup) {
      // Single group - verify directly against root hash
      if (!constantTimeEqual(groupCV, this.rootHash)) {
        throw new Error('Group CV does not match root hash');
      }
    } else {
      // Multiple groups - verify proof
      if (!this._verifyProof(groupIndex, groupCV, proof)) {
        throw new Error('Proof verification failed');
      }
    }

    // Store the data
    this.groupData.set(groupIndex, new Uint8Array(data));
    setBit(this.bitfield, groupIndex);

    return true;
  }

  /**
   * Verify a Merkle proof for a chunk group.
   * @private
   */
  _verifyProof(groupIndex, leafCV, proof) {
    if (!proof || proof.length === 0) {
      // No proof provided - cannot verify
      return false;
    }

    let currentCV = leafCV;
    let index = groupIndex;
    let levelSize = this._numGroups;

    for (let i = 0; i < proof.length; i++) {
      const siblingCV = proof[i];

      if (siblingCV.length !== HASH_SIZE) {
        return false;
      }

      // Determine if we're on the left or right
      const isRight = index % 2 === 1;
      const isRoot = i === proof.length - 1;

      if (isRight) {
        currentCV = parentCV(siblingCV, currentCV, isRoot);
      } else {
        currentCV = parentCV(currentCV, siblingCV, isRoot);
      }

      // Move up the tree
      index = Math.floor(index / 2);
      levelSize = Math.ceil(levelSize / 2);
    }

    // Final CV should match root hash
    return constantTimeEqual(currentCV, this.rootHash);
  }

  /**
   * Add a chunk group without proof verification.
   * Use this when you trust the source or have already verified.
   *
   * @param {number} groupIndex - Index of the chunk group
   * @param {Uint8Array} data - The chunk group data
   */
  addChunkGroupTrusted(groupIndex, data) {
    if (groupIndex < 0 || groupIndex >= this._numGroups) {
      throw new Error(`Invalid group index: ${groupIndex}`);
    }

    const expectedSize = this.getGroupSize(groupIndex);
    if (data.length !== expectedSize) {
      throw new Error(`Data length mismatch: expected ${expectedSize}, got ${data.length}`);
    }

    this.groupData.set(groupIndex, new Uint8Array(data));
    setBit(this.bitfield, groupIndex);
  }

  /**
   * Get the data for a specific chunk group.
   * @param {number} groupIndex - Group index
   * @returns {Uint8Array|null} The group data, or null if not present
   */
  getGroupData(groupIndex) {
    return this.groupData.get(groupIndex) || null;
  }

  /**
   * Get the bitfield as a Uint8Array.
   * @returns {Uint8Array} Copy of the bitfield
   */
  getBitfield() {
    return new Uint8Array(this.bitfield);
  }

  /**
   * Set the bitfield (for loading saved state).
   * Note: This only sets which groups are marked as present,
   * not the actual data. Use with caution.
   *
   * @param {Uint8Array} bitfield - Bitfield to set
   */
  setBitfield(bitfield) {
    const expectedBytes = Math.ceil(this._numGroups / 8);
    if (bitfield.length !== expectedBytes) {
      throw new Error(`Bitfield length mismatch: expected ${expectedBytes}, got ${bitfield.length}`);
    }
    this.bitfield = new Uint8Array(bitfield);
  }

  /**
   * Get ranges of missing chunk groups.
   * @returns {Array<{start: number, end: number}>} Array of ranges (inclusive start, exclusive end)
   */
  getMissingRanges() {
    const ranges = [];
    let rangeStart = null;

    for (let i = 0; i < this._numGroups; i++) {
      const present = getBit(this.bitfield, i);

      if (!present && rangeStart === null) {
        // Start of a missing range
        rangeStart = i;
      } else if (present && rangeStart !== null) {
        // End of a missing range
        ranges.push({ start: rangeStart, end: i });
        rangeStart = null;
      }
    }

    // Handle range that extends to the end
    if (rangeStart !== null) {
      ranges.push({ start: rangeStart, end: this._numGroups });
    }

    return ranges;
  }

  /**
   * Get ranges of present chunk groups.
   * @returns {Array<{start: number, end: number}>} Array of ranges (inclusive start, exclusive end)
   */
  getPresentRanges() {
    const ranges = [];
    let rangeStart = null;

    for (let i = 0; i < this._numGroups; i++) {
      const present = getBit(this.bitfield, i);

      if (present && rangeStart === null) {
        // Start of a present range
        rangeStart = i;
      } else if (!present && rangeStart !== null) {
        // End of a present range
        ranges.push({ start: rangeStart, end: i });
        rangeStart = null;
      }
    }

    // Handle range that extends to the end
    if (rangeStart !== null) {
      ranges.push({ start: rangeStart, end: this._numGroups });
    }

    return ranges;
  }

  /**
   * Get the list of missing group indices.
   * @returns {number[]} Array of missing group indices
   */
  getMissingGroups() {
    const missing = [];
    for (let i = 0; i < this._numGroups; i++) {
      if (!getBit(this.bitfield, i)) {
        missing.push(i);
      }
    }
    return missing;
  }

  /**
   * Get the list of present group indices.
   * @returns {number[]} Array of present group indices
   */
  getPresentGroups() {
    const present = [];
    for (let i = 0; i < this._numGroups; i++) {
      if (getBit(this.bitfield, i)) {
        present.push(i);
      }
    }
    return present;
  }

  /**
   * Finalize and return the complete data.
   * Throws if not all groups have been received.
   *
   * @param {boolean} verify - If true, verify the final hash (default true)
   * @returns {Uint8Array} The complete file data
   */
  finalize(verify = true) {
    if (!this.isComplete()) {
      const missing = this.getMissingGroups();
      throw new Error(`Cannot finalize: missing ${missing.length} groups: [${missing.slice(0, 5).join(', ')}${missing.length > 5 ? '...' : ''}]`);
    }

    // Assemble the complete data
    const data = new Uint8Array(this.contentLen);
    for (let i = 0; i < this._numGroups; i++) {
      const groupData = this.groupData.get(i);
      const offset = i * this.groupSize;
      data.set(groupData, offset);
    }

    // Optionally verify the final hash
    if (verify) {
      const computedHash = chunkGroupCV(data, 0, true);
      if (!constantTimeEqual(computedHash, this.rootHash)) {
        throw new Error('Final hash verification failed');
      }
    }

    return data;
  }

  /**
   * Export the current state for serialization.
   * @returns {Object} Serializable state object
   */
  exportState() {
    // Convert groupData Map to array of [index, base64] pairs
    const groupDataArray = [];
    for (const [index, data] of this.groupData.entries()) {
      groupDataArray.push([index, Array.from(data)]);
    }

    return {
      rootHash: Array.from(this.rootHash),
      contentLen: this.contentLen,
      chunkGroupLog: this.chunkGroupLog,
      bitfield: Array.from(this.bitfield),
      groupData: groupDataArray
    };
  }

  /**
   * Import state from a serialized object.
   * @param {Object} state - State object from exportState()
   * @returns {PartialBao} New PartialBao instance
   */
  static importState(state) {
    const partial = new PartialBao(
      new Uint8Array(state.rootHash),
      state.contentLen,
      state.chunkGroupLog
    );

    partial.bitfield = new Uint8Array(state.bitfield);

    for (const [index, dataArray] of state.groupData) {
      partial.groupData.set(index, new Uint8Array(dataArray));
    }

    return partial;
  }

  /**
   * Create a Merkle proof for a chunk group.
   * Requires all groups to be present.
   *
   * @param {number} groupIndex - Group index to create proof for
   * @returns {Uint8Array[]} Array of sibling hashes from leaf to root
   */
  createProof(groupIndex) {
    if (!this.isComplete()) {
      throw new Error('Cannot create proof: not all groups present');
    }

    if (groupIndex < 0 || groupIndex >= this._numGroups) {
      throw new Error(`Invalid group index: ${groupIndex}`);
    }

    if (this._numGroups === 1) {
      // Single group - no proof needed
      return [];
    }

    // Compute all group CVs
    const groupCVs = [];
    for (let i = 0; i < this._numGroups; i++) {
      const data = this.groupData.get(i);
      const startChunkIndex = i * (1 << this.chunkGroupLog);
      groupCVs.push(chunkGroupCV(data, startChunkIndex, false));
    }

    // Build proof by walking up the tree
    const proof = [];
    let cvs = groupCVs;
    let index = groupIndex;

    while (cvs.length > 1) {
      // Get sibling
      const siblingIndex = index % 2 === 0 ? index + 1 : index - 1;

      if (siblingIndex < cvs.length) {
        proof.push(new Uint8Array(cvs[siblingIndex]));
      } else {
        // No sibling (odd number of nodes) - use self as placeholder
        // This shouldn't normally happen in a proper proof
        proof.push(new Uint8Array(cvs[index]));
      }

      // Build next level
      const nextLevel = [];
      const isLastLevel = cvs.length <= 2;

      for (let i = 0; i < cvs.length; i += 2) {
        if (i + 1 < cvs.length) {
          const isRoot = isLastLevel && i === 0;
          nextLevel.push(parentCV(cvs[i], cvs[i + 1], isRoot));
        } else {
          // Odd one out - promote
          nextLevel.push(cvs[i]);
        }
      }

      cvs = nextLevel;
      index = Math.floor(index / 2);
    }

    return proof;
  }
}

// ============================================
// HASH SEQUENCES - BLOB COLLECTIONS
// ============================================

/**
 * HashSequence - Ordered list of blob hashes representing a collection.
 *
 * Hash sequences are used to represent collections like directories or datasets.
 * The sequence itself has a hash, allowing the entire collection to be verified
 * with a single hash.
 *
 * Format (matching Iroh):
 * - Header: 4-byte little-endian count of hashes
 * - Body: Concatenated 32-byte hashes
 * - Total size: 4 + (count * 32) bytes
 *
 * The sequence hash is the BLAKE3 hash of the serialized bytes.
 */
class HashSequence {
  /**
   * Create a new HashSequence.
   * @param {Uint8Array[]} [hashes] - Optional initial array of 32-byte hashes
   */
  constructor(hashes = []) {
    this._hashes = [];
    for (const hash of hashes) {
      this.addHash(hash);
    }
  }

  /**
   * Add a hash to the sequence.
   * @param {Uint8Array} hash - 32-byte hash to add
   * @returns {HashSequence} this (for chaining)
   */
  addHash(hash) {
    if (!(hash instanceof Uint8Array)) {
      throw new Error('Hash must be a Uint8Array');
    }
    if (hash.length !== HASH_SIZE) {
      throw new Error(`Hash must be ${HASH_SIZE} bytes, got ${hash.length}`);
    }
    this._hashes.push(new Uint8Array(hash));
    return this;
  }

  /**
   * Get the number of hashes in the sequence.
   * @returns {number}
   */
  get length() {
    return this._hashes.length;
  }

  /**
   * Get hash at the specified index.
   * @param {number} index - Index of hash to get
   * @returns {Uint8Array} Copy of the 32-byte hash
   */
  getHash(index) {
    if (index < 0 || index >= this._hashes.length) {
      throw new Error(`Index out of bounds: ${index}`);
    }
    return new Uint8Array(this._hashes[index]);
  }

  /**
   * Check if the sequence contains a specific hash.
   * @param {Uint8Array} hash - Hash to search for
   * @returns {boolean}
   */
  hasHash(hash) {
    return this.indexOf(hash) !== -1;
  }

  /**
   * Find the index of a hash in the sequence.
   * @param {Uint8Array} hash - Hash to search for
   * @returns {number} Index of hash, or -1 if not found
   */
  indexOf(hash) {
    if (!(hash instanceof Uint8Array) || hash.length !== HASH_SIZE) {
      return -1;
    }
    for (let i = 0; i < this._hashes.length; i++) {
      if (constantTimeEqual(this._hashes[i], hash)) {
        return i;
      }
    }
    return -1;
  }

  /**
   * Iterator for the sequence.
   * @yields {Uint8Array} Each hash in order
   */
  *[Symbol.iterator]() {
    for (const hash of this._hashes) {
      yield new Uint8Array(hash);
    }
  }

  /**
   * Get all hashes as an array.
   * @returns {Uint8Array[]} Array of hash copies
   */
  toArray() {
    return this._hashes.map(h => new Uint8Array(h));
  }

  /**
   * Compute the sequence hash (BLAKE3 of serialized bytes).
   * @returns {Uint8Array} 32-byte hash of the sequence
   */
  finalize() {
    const bytes = this.toBytes();
    return blake3.hash(bytes);
  }

  /**
   * Serialize to bytes.
   * Format: 4-byte LE count + concatenated 32-byte hashes
   * @returns {Uint8Array} Serialized sequence
   */
  toBytes() {
    const count = this._hashes.length;
    const totalSize = 4 + count * HASH_SIZE;
    const bytes = new Uint8Array(totalSize);

    // Write 4-byte little-endian count
    bytes[0] = count & 0xff;
    bytes[1] = (count >> 8) & 0xff;
    bytes[2] = (count >> 16) & 0xff;
    bytes[3] = (count >> 24) & 0xff;

    // Write concatenated hashes
    for (let i = 0; i < count; i++) {
      bytes.set(this._hashes[i], 4 + i * HASH_SIZE);
    }

    return bytes;
  }

  /**
   * Deserialize from bytes.
   * @param {Uint8Array} bytes - Serialized sequence
   * @returns {HashSequence} New HashSequence instance
   */
  static fromBytes(bytes) {
    if (!(bytes instanceof Uint8Array)) {
      throw new Error('Input must be a Uint8Array');
    }
    if (bytes.length < 4) {
      throw new Error('Input too short: missing header');
    }

    // Read 4-byte little-endian count
    const count = bytes[0] |
      (bytes[1] << 8) |
      (bytes[2] << 16) |
      (bytes[3] << 24);

    const expectedSize = 4 + count * HASH_SIZE;
    if (bytes.length !== expectedSize) {
      throw new Error(`Invalid size: expected ${expectedSize}, got ${bytes.length}`);
    }

    const sequence = new HashSequence();
    for (let i = 0; i < count; i++) {
      const start = 4 + i * HASH_SIZE;
      const hash = bytes.slice(start, start + HASH_SIZE);
      sequence._hashes.push(hash);
    }

    return sequence;
  }

  /**
   * Create a HashSequence from an array of hashes.
   * @param {Uint8Array[]} hashes - Array of 32-byte hashes
   * @returns {HashSequence} New HashSequence instance
   */
  static from(hashes) {
    return new HashSequence(hashes);
  }

  /**
   * Create a HashSequence from hex strings.
   * @param {string[]} hexStrings - Array of 64-character hex strings
   * @returns {HashSequence} New HashSequence instance
   */
  static fromHex(hexStrings) {
    const sequence = new HashSequence();
    for (const hex of hexStrings) {
      if (typeof hex !== 'string' || hex.length !== 64) {
        throw new Error('Each hex string must be 64 characters');
      }
      const hash = new Uint8Array(32);
      for (let i = 0; i < 32; i++) {
        hash[i] = parseInt(hex.substr(i * 2, 2), 16);
      }
      sequence._hashes.push(hash);
    }
    return sequence;
  }

  /**
   * Export to JSON-serializable object.
   * @returns {Object} JSON-serializable representation
   */
  toJSON() {
    return {
      hashes: this._hashes.map(h =>
        Array.from(h).map(b => b.toString(16).padStart(2, '0')).join('')
      )
    };
  }

  /**
   * Create from JSON object.
   * @param {Object} json - Object with hashes array
   * @returns {HashSequence} New HashSequence instance
   */
  static fromJSON(json) {
    if (!json || !Array.isArray(json.hashes)) {
      throw new Error('Invalid JSON: missing hashes array');
    }
    return HashSequence.fromHex(json.hashes);
  }

  /**
   * Get hex string representation of a hash at index.
   * @param {number} index - Index of hash
   * @returns {string} 64-character hex string
   */
  getHashHex(index) {
    const hash = this.getHash(index);
    return Array.from(hash).map(b => b.toString(16).padStart(2, '0')).join('');
  }

  /**
   * Get hex string of the sequence hash.
   * @returns {string} 64-character hex string
   */
  finalizeHex() {
    const hash = this.finalize();
    return Array.from(hash).map(b => b.toString(16).padStart(2, '0')).join('');
  }

  /**
   * Clear all hashes from the sequence.
   * @returns {HashSequence} this (for chaining)
   */
  clear() {
    this._hashes = [];
    return this;
  }

  /**
   * Remove hash at the specified index.
   * @param {number} index - Index of hash to remove
   * @returns {Uint8Array} The removed hash
   */
  removeAt(index) {
    if (index < 0 || index >= this._hashes.length) {
      throw new Error(`Index out of bounds: ${index}`);
    }
    const removed = this._hashes.splice(index, 1)[0];
    return new Uint8Array(removed);
  }

  /**
   * Insert a hash at the specified index.
   * @param {number} index - Index to insert at
   * @param {Uint8Array} hash - 32-byte hash to insert
   * @returns {HashSequence} this (for chaining)
   */
  insertAt(index, hash) {
    if (index < 0 || index > this._hashes.length) {
      throw new Error(`Index out of bounds: ${index}`);
    }
    if (!(hash instanceof Uint8Array) || hash.length !== HASH_SIZE) {
      throw new Error(`Hash must be ${HASH_SIZE} bytes`);
    }
    this._hashes.splice(index, 0, new Uint8Array(hash));
    return this;
  }

  /**
   * Create a slice of the sequence.
   * @param {number} start - Start index (inclusive)
   * @param {number} [end] - End index (exclusive), defaults to length
   * @returns {HashSequence} New HashSequence with sliced hashes
   */
  slice(start, end) {
    const sliced = this._hashes.slice(start, end);
    return new HashSequence(sliced);
  }

  /**
   * Concatenate with another sequence.
   * @param {HashSequence} other - Sequence to concatenate
   * @returns {HashSequence} New HashSequence with combined hashes
   */
  concat(other) {
    if (!(other instanceof HashSequence)) {
      throw new Error('Argument must be a HashSequence');
    }
    const combined = new HashSequence(this._hashes);
    for (const hash of other._hashes) {
      combined._hashes.push(new Uint8Array(hash));
    }
    return combined;
  }

  /**
   * Check equality with another sequence.
   * @param {HashSequence} other - Sequence to compare
   * @returns {boolean} True if sequences are equal
   */
  equals(other) {
    if (!(other instanceof HashSequence)) {
      return false;
    }
    if (this._hashes.length !== other._hashes.length) {
      return false;
    }
    for (let i = 0; i < this._hashes.length; i++) {
      if (!constantTimeEqual(this._hashes[i], other._hashes[i])) {
        return false;
      }
    }
    return true;
  }
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

  // Streaming API
  BaoEncoder,
  BaoDecoder,

  // Iroh chunk group support
  baoEncodeIroh,
  baoDecodeIroh,
  baoVerifyIroh,
  chunkGroupCV,
  countChunkGroups,
  irohOutboardSize,

  // Partial/Resumable downloads
  PartialBao,
  createBitfield,
  setBit,
  clearBit,
  getBit,
  countSetBits,

  // Hash sequences (blob collections)
  HashSequence,

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
  IV,
  IROH_CHUNK_GROUP_LOG,
  IROH_CHUNK_GROUP_SIZE
};

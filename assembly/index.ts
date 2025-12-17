/**
 * BLAKE3/Bao WASM Module
 *
 * Provides accelerated implementations of:
 * - chunkCV: Compute CV for a 1KB chunk
 * - parentCV: Compute CV from two child CVs
 * - batchChunkCVs: Process multiple chunks at once
 */

// BLAKE3 IV constants
const IV0: u32 = 0x6a09e667;
const IV1: u32 = 0xbb67ae85;
const IV2: u32 = 0x3c6ef372;
const IV3: u32 = 0xa54ff53a;
const IV4: u32 = 0x510e527f;
const IV5: u32 = 0x9b05688c;
const IV6: u32 = 0x1f83d9ab;
const IV7: u32 = 0x5be0cd19;

// Domain separation flags
const CHUNK_START: u32 = 1;
const CHUNK_END: u32 = 2;
const PARENT: u32 = 4;
const ROOT: u32 = 8;

// Constants
const BLOCK_LEN: u32 = 64;
const CHUNK_LEN: u32 = 1024;

// Memory layout (leaving ample space for AssemblyScript's data at low addresses):
// 0-65535: Reserved for AssemblyScript runtime/heap (64KB)
// 65536-131071: Input buffer (64KB)
// 131072-196607: Output buffer (64KB)
// 196608-262143: Scratch space (64KB)

const INPUT_OFFSET: u32 = 65536;
const OUTPUT_OFFSET: u32 = 131072;
const SCRATCH_OFFSET: u32 = 196608;

// Message schedule permutation
// Each round permutes the message words according to SIGMA
const SIGMA: StaticArray<u8> = [
  0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15,
  2, 6, 3, 10, 7, 0, 4, 13, 1, 11, 12, 5, 9, 14, 15, 8,
  3, 4, 10, 12, 13, 2, 7, 14, 6, 5, 9, 0, 11, 15, 8, 1,
  10, 7, 12, 9, 14, 3, 13, 15, 4, 0, 11, 2, 5, 8, 1, 6,
  12, 13, 9, 11, 15, 10, 14, 8, 7, 2, 5, 3, 0, 1, 6, 4,
  9, 14, 11, 5, 8, 12, 15, 1, 13, 3, 0, 10, 2, 6, 4, 7,
  11, 15, 5, 0, 1, 9, 8, 6, 14, 10, 2, 12, 3, 4, 7, 13,
];

// G mixing function - inlined for performance
@inline
function g(
  state: StaticArray<u32>,
  a: i32, b: i32, c: i32, d: i32,
  mx: u32, my: u32
): void {
  let va = unchecked(state[a]);
  let vb = unchecked(state[b]);
  let vc = unchecked(state[c]);
  let vd = unchecked(state[d]);

  va = va + vb + mx;
  vd = rotr(vd ^ va, 16);
  vc = vc + vd;
  vb = rotr(vb ^ vc, 12);
  va = va + vb + my;
  vd = rotr(vd ^ va, 8);
  vc = vc + vd;
  vb = rotr(vb ^ vc, 7);

  unchecked(state[a] = va);
  unchecked(state[b] = vb);
  unchecked(state[c] = vc);
  unchecked(state[d] = vd);
}

// State array for compress function
const compressState: StaticArray<u32> = new StaticArray<u32>(16);
const msgWords: StaticArray<u32> = new StaticArray<u32>(16);

/**
 * BLAKE3 compress function.
 *
 * @param cv - Chaining value (8 words)
 * @param blockPtr - Pointer to 64-byte block
 * @param counter - Block counter
 * @param blockLen - Length of block data
 * @param flags - Domain separation flags
 * @param out - Output array (8 words)
 */
function compress(
  cv: StaticArray<u32>,
  blockPtr: u32,
  counter: u64,
  blockLen: u32,
  flags: u32,
  out: StaticArray<u32>
): void {
  // Initialize state
  unchecked(compressState[0] = cv[0]);
  unchecked(compressState[1] = cv[1]);
  unchecked(compressState[2] = cv[2]);
  unchecked(compressState[3] = cv[3]);
  unchecked(compressState[4] = cv[4]);
  unchecked(compressState[5] = cv[5]);
  unchecked(compressState[6] = cv[6]);
  unchecked(compressState[7] = cv[7]);
  unchecked(compressState[8] = IV0);
  unchecked(compressState[9] = IV1);
  unchecked(compressState[10] = IV2);
  unchecked(compressState[11] = IV3);
  unchecked(compressState[12] = <u32>counter);
  unchecked(compressState[13] = <u32>(counter >> 32));
  unchecked(compressState[14] = blockLen);
  unchecked(compressState[15] = flags);

  // Load message words (little-endian)
  for (let i: u32 = 0; i < 16; i++) {
    unchecked(msgWords[i] = load<u32>(blockPtr + i * 4));
  }

  // 7 rounds
  for (let round: i32 = 0; round < 7; round++) {
    const sigmaOffset = round * 16;

    // Column step
    g(compressState, 0, 4, 8, 12,
      unchecked(msgWords[SIGMA[sigmaOffset + 0]]),
      unchecked(msgWords[SIGMA[sigmaOffset + 1]]));
    g(compressState, 1, 5, 9, 13,
      unchecked(msgWords[SIGMA[sigmaOffset + 2]]),
      unchecked(msgWords[SIGMA[sigmaOffset + 3]]));
    g(compressState, 2, 6, 10, 14,
      unchecked(msgWords[SIGMA[sigmaOffset + 4]]),
      unchecked(msgWords[SIGMA[sigmaOffset + 5]]));
    g(compressState, 3, 7, 11, 15,
      unchecked(msgWords[SIGMA[sigmaOffset + 6]]),
      unchecked(msgWords[SIGMA[sigmaOffset + 7]]));

    // Diagonal step
    g(compressState, 0, 5, 10, 15,
      unchecked(msgWords[SIGMA[sigmaOffset + 8]]),
      unchecked(msgWords[SIGMA[sigmaOffset + 9]]));
    g(compressState, 1, 6, 11, 12,
      unchecked(msgWords[SIGMA[sigmaOffset + 10]]),
      unchecked(msgWords[SIGMA[sigmaOffset + 11]]));
    g(compressState, 2, 7, 8, 13,
      unchecked(msgWords[SIGMA[sigmaOffset + 12]]),
      unchecked(msgWords[SIGMA[sigmaOffset + 13]]));
    g(compressState, 3, 4, 9, 14,
      unchecked(msgWords[SIGMA[sigmaOffset + 14]]),
      unchecked(msgWords[SIGMA[sigmaOffset + 15]]));
  }

  // Finalize - XOR upper and lower halves
  unchecked(out[0] = compressState[0] ^ compressState[8]);
  unchecked(out[1] = compressState[1] ^ compressState[9]);
  unchecked(out[2] = compressState[2] ^ compressState[10]);
  unchecked(out[3] = compressState[3] ^ compressState[11]);
  unchecked(out[4] = compressState[4] ^ compressState[12]);
  unchecked(out[5] = compressState[5] ^ compressState[13]);
  unchecked(out[6] = compressState[6] ^ compressState[14]);
  unchecked(out[7] = compressState[7] ^ compressState[15]);
}

// CV arrays for chunkCV
const chunkCv: StaticArray<u32> = new StaticArray<u32>(8);
const tempCv: StaticArray<u32> = new StaticArray<u32>(8);

/**
 * Compute the chaining value for a chunk.
 *
 * Input: chunk data at INPUT_OFFSET (up to 1024 bytes)
 * Output: 32-byte CV at OUTPUT_OFFSET
 *
 * @param chunkLen - Length of chunk (0-1024)
 * @param chunkIndex - Chunk counter
 * @param isRoot - Whether this is the root node
 */
export function chunkCV(chunkLen: u32, chunkIndex: u64, isRoot: bool): void {
  // Initialize CV with IV
  unchecked(chunkCv[0] = IV0);
  unchecked(chunkCv[1] = IV1);
  unchecked(chunkCv[2] = IV2);
  unchecked(chunkCv[3] = IV3);
  unchecked(chunkCv[4] = IV4);
  unchecked(chunkCv[5] = IV5);
  unchecked(chunkCv[6] = IV6);
  unchecked(chunkCv[7] = IV7);

  const numBlocks: u32 = chunkLen == 0 ? 1 : ((chunkLen + BLOCK_LEN - 1) / BLOCK_LEN);

  for (let blockIdx: u32 = 0; blockIdx < numBlocks; blockIdx++) {
    const blockStart = blockIdx * BLOCK_LEN;
    const blockEnd = min(blockStart + BLOCK_LEN, chunkLen);
    const blockLen = blockEnd - blockStart;

    // Determine flags
    let flags: u32 = 0;
    if (blockIdx == 0) flags |= CHUNK_START;
    if (blockIdx == numBlocks - 1) {
      flags |= CHUNK_END;
      if (isRoot) flags |= ROOT;
    }

    // Clear scratch area for partial blocks
    if (blockLen < BLOCK_LEN) {
      for (let i: u32 = blockLen; i < BLOCK_LEN; i++) {
        store<u8>(SCRATCH_OFFSET + i, 0);
      }
      // Copy block data to scratch
      memory.copy(SCRATCH_OFFSET, INPUT_OFFSET + blockStart, blockLen);
      compress(chunkCv, SCRATCH_OFFSET, chunkIndex, blockLen, flags, tempCv);
    } else {
      compress(chunkCv, INPUT_OFFSET + blockStart, chunkIndex, BLOCK_LEN, flags, tempCv);
    }

    // Copy result back to CV
    unchecked(chunkCv[0] = tempCv[0]);
    unchecked(chunkCv[1] = tempCv[1]);
    unchecked(chunkCv[2] = tempCv[2]);
    unchecked(chunkCv[3] = tempCv[3]);
    unchecked(chunkCv[4] = tempCv[4]);
    unchecked(chunkCv[5] = tempCv[5]);
    unchecked(chunkCv[6] = tempCv[6]);
    unchecked(chunkCv[7] = tempCv[7]);
  }

  // Write output (little-endian)
  for (let i: u32 = 0; i < 8; i++) {
    store<u32>(OUTPUT_OFFSET + i * 4, unchecked(chunkCv[i]));
  }
}

// Parent CV arrays
const parentCvIn: StaticArray<u32> = new StaticArray<u32>(8);

/**
 * Compute the chaining value for a parent node.
 *
 * Input: leftCV at INPUT_OFFSET (32 bytes), rightCV at INPUT_OFFSET+32 (32 bytes)
 * Output: 32-byte CV at OUTPUT_OFFSET
 *
 * @param isRoot - Whether this is the root node
 */
export function parentCV(isRoot: bool): void {
  // Initialize CV with IV
  unchecked(parentCvIn[0] = IV0);
  unchecked(parentCvIn[1] = IV1);
  unchecked(parentCvIn[2] = IV2);
  unchecked(parentCvIn[3] = IV3);
  unchecked(parentCvIn[4] = IV4);
  unchecked(parentCvIn[5] = IV5);
  unchecked(parentCvIn[6] = IV6);
  unchecked(parentCvIn[7] = IV7);

  // Flags: PARENT, optionally ROOT
  let flags: u32 = PARENT;
  if (isRoot) flags |= ROOT;

  // Input is 64 bytes (left CV + right CV) at INPUT_OFFSET
  compress(parentCvIn, INPUT_OFFSET, 0, BLOCK_LEN, flags, tempCv);

  // Write output
  for (let i: u32 = 0; i < 8; i++) {
    store<u32>(OUTPUT_OFFSET + i * 4, unchecked(tempCv[i]));
  }
}

/**
 * Batch compute CVs for multiple complete chunks.
 *
 * Input: chunk data at INPUT_OFFSET (numChunks * 1024 bytes)
 * Output: CVs at OUTPUT_OFFSET (numChunks * 32 bytes)
 *
 * @param numChunks - Number of complete 1024-byte chunks
 * @param startIndex - Starting chunk index
 */
export function batchChunkCVs(numChunks: u32, startIndex: u64): void {
  for (let i: u32 = 0; i < numChunks; i++) {
    // Set up input pointer for this chunk
    const chunkOffset = i * CHUNK_LEN;
    const outputOffset = i * 32;

    // Initialize CV with IV
    unchecked(chunkCv[0] = IV0);
    unchecked(chunkCv[1] = IV1);
    unchecked(chunkCv[2] = IV2);
    unchecked(chunkCv[3] = IV3);
    unchecked(chunkCv[4] = IV4);
    unchecked(chunkCv[5] = IV5);
    unchecked(chunkCv[6] = IV6);
    unchecked(chunkCv[7] = IV7);

    const chunkIndex = startIndex + <u64>i;

    // Process 16 blocks per chunk
    for (let blockIdx: u32 = 0; blockIdx < 16; blockIdx++) {
      let flags: u32 = 0;
      if (blockIdx == 0) flags |= CHUNK_START;
      if (blockIdx == 15) flags |= CHUNK_END;

      compress(
        chunkCv,
        INPUT_OFFSET + chunkOffset + blockIdx * BLOCK_LEN,
        chunkIndex,
        BLOCK_LEN,
        flags,
        tempCv
      );

      // Copy result back to CV
      unchecked(chunkCv[0] = tempCv[0]);
      unchecked(chunkCv[1] = tempCv[1]);
      unchecked(chunkCv[2] = tempCv[2]);
      unchecked(chunkCv[3] = tempCv[3]);
      unchecked(chunkCv[4] = tempCv[4]);
      unchecked(chunkCv[5] = tempCv[5]);
      unchecked(chunkCv[6] = tempCv[6]);
      unchecked(chunkCv[7] = tempCv[7]);
    }

    // Write CV to output
    for (let j: u32 = 0; j < 8; j++) {
      store<u32>(OUTPUT_OFFSET + outputOffset + j * 4, unchecked(chunkCv[j]));
    }
  }
}

/**
 * Batch compute parent CVs.
 *
 * Input: pairs of CVs at INPUT_OFFSET (numPairs * 64 bytes)
 * Output: parent CVs at OUTPUT_OFFSET (numPairs * 32 bytes)
 *
 * @param numPairs - Number of CV pairs to process
 * @param rootIndex - Index of the pair that should be marked as root (-1 for none)
 */
export function batchParentCVs(numPairs: u32, rootIndex: i32): void {
  for (let i: u32 = 0; i < numPairs; i++) {
    const inputOffset = i * 64;
    const outputOffset = i * 32;

    // Initialize CV with IV
    unchecked(parentCvIn[0] = IV0);
    unchecked(parentCvIn[1] = IV1);
    unchecked(parentCvIn[2] = IV2);
    unchecked(parentCvIn[3] = IV3);
    unchecked(parentCvIn[4] = IV4);
    unchecked(parentCvIn[5] = IV5);
    unchecked(parentCvIn[6] = IV6);
    unchecked(parentCvIn[7] = IV7);

    let flags: u32 = PARENT;
    if (<i32>i == rootIndex) flags |= ROOT;

    compress(parentCvIn, INPUT_OFFSET + inputOffset, 0, BLOCK_LEN, flags, tempCv);

    // Write output
    for (let j: u32 = 0; j < 8; j++) {
      store<u32>(OUTPUT_OFFSET + outputOffset + j * 4, unchecked(tempCv[j]));
    }
  }
}

// Export memory offsets for JS integration
export const INPUT_PTR: u32 = INPUT_OFFSET;
export const OUTPUT_PTR: u32 = OUTPUT_OFFSET;

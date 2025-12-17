/**
 * Bao TypeScript definitions
 * Verified streaming with Merkle tree verification and Iroh compatibility
 */

declare module 'blake3-bao/bao' {
  // ============================================
  // Core Types
  // ============================================

  /** Result of Bao encoding */
  export interface BaoEncodeResult {
    /** Encoded data (tree + content for combined, tree only for outboard) */
    encoded: Uint8Array;
    /** 32-byte root hash */
    hash: Uint8Array;
  }

  /** Range of chunk groups */
  export interface GroupRange {
    start: number;
    end: number;
  }

  // ============================================
  // Core Encoding/Decoding
  // ============================================

  /**
   * Encode data with Bao tree structure
   * @param data - Data to encode
   * @param outboard - If true, return tree only (data stored separately)
   * @returns Encoded data and root hash
   */
  export function baoEncode(data: Uint8Array, outboard?: boolean): BaoEncodeResult;

  /**
   * Decode and verify Bao-encoded data
   * @param encoded - Bao-encoded data
   * @param hash - Expected root hash
   * @param outboardData - Original data for outboard mode
   * @returns Verified decoded data
   * @throws Error if verification fails
   */
  export function baoDecode(encoded: Uint8Array, hash: Uint8Array, outboardData?: Uint8Array): Uint8Array;

  /**
   * Encode content length as 8-byte little-endian
   * @param len - Content length
   * @returns 8-byte Uint8Array
   */
  export function encodeLen(len: number): Uint8Array;

  /**
   * Decode content length from 8-byte little-endian
   * @param bytes - 8-byte length header
   * @returns Content length
   */
  export function decodeLen(bytes: Uint8Array): number;

  // ============================================
  // Slicing
  // ============================================

  /**
   * Extract a minimal slice for verifying a byte range
   * @param encoded - Full Bao encoding
   * @param start - Start byte offset
   * @param length - Number of bytes
   * @param outboardData - Original data for outboard mode
   * @returns Minimal slice containing the requested range
   */
  export function baoSlice(encoded: Uint8Array, start: number, length: number, outboardData?: Uint8Array): Uint8Array;

  /**
   * Decode and verify a Bao slice
   * @param slice - Bao slice data
   * @param hash - Expected root hash
   * @param start - Start byte offset
   * @param length - Number of bytes
   * @returns Verified slice content
   * @throws Error if verification fails
   */
  export function baoDecodeSlice(slice: Uint8Array, hash: Uint8Array, start: number, length: number): Uint8Array;

  // ============================================
  // Iroh Chunk Groups
  // ============================================

  /**
   * Encode data with Iroh-compatible chunk groups (16x smaller outboard)
   * @param data - Data to encode
   * @param outboard - If true, return tree only
   * @param chunkGroupLog - Log2 of chunks per group (default: 4 = 16 chunks)
   * @returns Encoded data and root hash
   */
  export function baoEncodeIroh(data: Uint8Array, outboard?: boolean, chunkGroupLog?: number): BaoEncodeResult;

  /**
   * Decode and verify Iroh-encoded data
   * @param outboard - Outboard tree data
   * @param hash - Expected root hash
   * @param data - Original data to verify
   * @param chunkGroupLog - Log2 of chunks per group (default: 4)
   * @returns Verified data
   * @throws Error if verification fails
   */
  export function baoDecodeIroh(outboard: Uint8Array, hash: Uint8Array, data: Uint8Array, chunkGroupLog?: number): Uint8Array;

  /**
   * Verify data against Iroh outboard encoding
   * @param outboard - Outboard tree data
   * @param hash - Expected root hash
   * @param data - Data to verify
   * @param chunkGroupLog - Log2 of chunks per group (default: 4)
   * @returns true if valid, false otherwise
   */
  export function baoVerifyIroh(outboard: Uint8Array, hash: Uint8Array, data: Uint8Array, chunkGroupLog?: number): boolean;

  /**
   * Compute chunk group chaining value
   * @param data - Group data (up to 16 KiB)
   * @param startChunkIndex - Starting chunk index
   * @param isRoot - Whether this is the root node
   * @returns 32-byte chaining value
   */
  export function chunkGroupCV(data: Uint8Array, startChunkIndex: number, isRoot?: boolean): Uint8Array;

  /**
   * Count chunk groups for a given content length
   * @param contentLen - Content length in bytes
   * @param chunkGroupLog - Log2 of chunks per group (default: 4)
   * @returns Number of chunk groups
   */
  export function countChunkGroups(contentLen: number, chunkGroupLog?: number): number;

  /**
   * Calculate Iroh outboard size
   * @param contentLen - Content length in bytes
   * @param chunkGroupLog - Log2 of chunks per group (default: 4)
   * @returns Outboard size in bytes
   */
  export function irohOutboardSize(contentLen: number, chunkGroupLog?: number): number;

  // ============================================
  // Streaming API
  // ============================================

  /**
   * Streaming Bao encoder for incremental encoding
   */
  export class BaoEncoder {
    /**
     * Create a streaming encoder
     * @param outboard - If true, create outboard encoding
     */
    constructor(outboard?: boolean);

    /**
     * Add data to the encoder
     * @param chunk - Data chunk to add
     */
    write(chunk: Uint8Array): void;

    /**
     * Alias for write()
     * @param chunk - Data chunk to add
     */
    update(chunk: Uint8Array): void;

    /**
     * Finalize encoding and return result
     * @returns Encoded data and root hash
     */
    finalize(): BaoEncodeResult;
  }

  /**
   * Streaming Bao decoder for incremental decoding
   */
  export class BaoDecoder {
    /**
     * Create a streaming decoder
     * @param hash - Expected root hash
     * @param contentLen - Expected content length
     * @param isOutboard - If true, expect outboard encoding
     */
    constructor(hash: Uint8Array, contentLen: number, isOutboard?: boolean);

    /**
     * Set original data for outboard decoding
     * @param data - Original data
     */
    setOutboardData(data: Uint8Array): void;

    /**
     * Add encoded data to decoder
     * @param chunk - Encoded chunk
     * @returns Verified data if available, null otherwise
     */
    write(chunk: Uint8Array): Uint8Array | null;

    /**
     * Read available verified data
     * @returns Verified data buffer
     */
    read(): Uint8Array;

    /**
     * Check if decoding is complete
     * @returns true if all data has been decoded
     */
    isComplete(): boolean;

    /**
     * Finalize decoding and return all data
     * @returns Complete verified data
     * @throws Error if incomplete or verification fails
     */
    finalize(): Uint8Array;
  }

  // ============================================
  // Partial/Resumable Downloads
  // ============================================

  /** Serialized state for PartialBao persistence */
  export interface PartialBaoState {
    rootHash: number[];
    contentLen: number;
    chunkGroupLog: number;
    bitfield: number[];
    groupData: Array<[number, number[]]>;
  }

  /**
   * Track partial downloads with chunk group granularity
   * Supports resumable downloads and multi-source fetching
   */
  export class PartialBao {
    /**
     * Create a partial download tracker
     * @param rootHash - Expected root hash (32 bytes)
     * @param contentLen - Total content length in bytes
     * @param chunkGroupLog - Log2 of chunks per group (default: 4 = 16 chunks)
     */
    constructor(rootHash: Uint8Array, contentLen: number, chunkGroupLog?: number);

    /** Total number of chunk groups */
    readonly numGroups: number;

    /** Number of groups received so far */
    readonly receivedGroups: number;

    /**
     * Check if all groups have been received
     * @returns true if download is complete
     */
    isComplete(): boolean;

    /**
     * Get download progress as percentage
     * @returns Progress 0-100
     */
    getProgress(): number;

    /**
     * Check if a specific group has been received
     * @param index - Group index
     * @returns true if group is present
     */
    hasGroup(index: number): boolean;

    /**
     * Get expected size of a chunk group
     * @param index - Group index
     * @returns Size in bytes
     */
    getGroupSize(index: number): number;

    /**
     * Get data for a specific group
     * @param index - Group index
     * @returns Group data or null if not present
     */
    getGroupData(index: number): Uint8Array | null;

    /**
     * Add a chunk group with Merkle proof verification
     * @param index - Group index
     * @param data - Group data
     * @param proof - Merkle proof (array of 32-byte hashes)
     * @returns true if added successfully
     * @throws Error if proof verification fails
     */
    addChunkGroup(index: number, data: Uint8Array, proof: Uint8Array[]): boolean;

    /**
     * Add a chunk group without verification (trusted source)
     * @param index - Group index
     * @param data - Group data
     * @returns true if added successfully
     */
    addChunkGroupTrusted(index: number, data: Uint8Array): boolean;

    /**
     * Get the download bitfield
     * @returns Bitfield as Uint8Array
     */
    getBitfield(): Uint8Array;

    /**
     * Set the download bitfield (for loading state)
     * @param bitfield - Bitfield to set
     */
    setBitfield(bitfield: Uint8Array): void;

    /**
     * Get ranges of missing groups
     * @returns Array of {start, end} ranges (end is exclusive)
     */
    getMissingRanges(): GroupRange[];

    /**
     * Get ranges of present groups
     * @returns Array of {start, end} ranges (end is exclusive)
     */
    getPresentRanges(): GroupRange[];

    /**
     * Get indices of missing groups
     * @returns Array of missing group indices
     */
    getMissingGroups(): number[];

    /**
     * Get indices of present groups
     * @returns Array of present group indices
     */
    getPresentGroups(): number[];

    /**
     * Assemble and return complete data
     * @param verify - If true, verify final hash (default: true)
     * @returns Complete data
     * @throws Error if incomplete or verification fails
     */
    finalize(verify?: boolean): Uint8Array;

    /**
     * Create Merkle proof for a group
     * @param groupIndex - Group to create proof for
     * @returns Array of 32-byte proof hashes
     */
    createProof(groupIndex: number): Uint8Array[];

    /**
     * Export state for serialization/persistence
     * @returns Serializable state object
     */
    exportState(): PartialBaoState;

    /**
     * Import state from serialized form
     * @param state - Previously exported state
     * @returns New PartialBao instance
     */
    static importState(state: PartialBaoState): PartialBao;
  }

  // ============================================
  // Bitfield Helpers
  // ============================================

  /**
   * Create a bitfield for tracking N items
   * @param numBits - Number of bits needed
   * @returns Uint8Array bitfield
   */
  export function createBitfield(numBits: number): Uint8Array;

  /**
   * Set a bit in the bitfield
   * @param bitfield - Bitfield to modify
   * @param index - Bit index to set
   */
  export function setBit(bitfield: Uint8Array, index: number): void;

  /**
   * Clear a bit in the bitfield
   * @param bitfield - Bitfield to modify
   * @param index - Bit index to clear
   */
  export function clearBit(bitfield: Uint8Array, index: number): void;

  /**
   * Get a bit from the bitfield
   * @param bitfield - Bitfield to read
   * @param index - Bit index to get
   * @returns true if bit is set
   */
  export function getBit(bitfield: Uint8Array, index: number): boolean;

  /**
   * Count set bits in the bitfield
   * @param bitfield - Bitfield to count
   * @param numBits - Total number of bits to check
   * @returns Number of set bits
   */
  export function countSetBits(bitfield: Uint8Array, numBits: number): number;

  // ============================================
  // Hash Sequences (Blob Collections)
  // ============================================

  /** JSON representation of a HashSequence */
  export interface HashSequenceJSON {
    hashes: string[];
  }

  /**
   * Ordered list of blob hashes representing a collection
   * The sequence itself has a hash for verifying the entire collection
   */
  export class HashSequence {
    /**
     * Create a hash sequence
     * @param hashes - Optional initial hashes
     */
    constructor(hashes?: Uint8Array[]);

    /** Number of hashes in the sequence */
    readonly length: number;

    /**
     * Add a hash to the sequence
     * @param hash - 32-byte hash to add
     * @returns this (for chaining)
     */
    addHash(hash: Uint8Array): this;

    /**
     * Get hash at index
     * @param index - Hash index
     * @returns Copy of the hash
     * @throws Error if index out of bounds
     */
    getHash(index: number): Uint8Array;

    /**
     * Get hash at index as hex string
     * @param index - Hash index
     * @returns Hash as hex string
     */
    getHashHex(index: number): string;

    /**
     * Check if hash exists in sequence
     * @param hash - Hash to search for
     * @returns true if found
     */
    hasHash(hash: Uint8Array): boolean;

    /**
     * Find index of hash
     * @param hash - Hash to search for
     * @returns Index or -1 if not found
     */
    indexOf(hash: Uint8Array): number;

    /**
     * Iterate over hashes
     */
    [Symbol.iterator](): Iterator<Uint8Array>;

    /**
     * Get all hashes as array
     * @returns Array of hash copies
     */
    toArray(): Uint8Array[];

    /**
     * Get BLAKE3 hash of the sequence
     * @returns 32-byte sequence hash
     */
    finalize(): Uint8Array;

    /**
     * Get sequence hash as hex string
     * @returns Sequence hash as hex
     */
    finalizeHex(): string;

    /**
     * Serialize to bytes (4-byte count + concatenated hashes)
     * @returns Serialized bytes
     */
    toBytes(): Uint8Array;

    /**
     * Deserialize from bytes
     * @param bytes - Serialized sequence
     * @returns New HashSequence
     */
    static fromBytes(bytes: Uint8Array): HashSequence;

    /**
     * Create from array of hashes
     * @param hashes - Array of 32-byte hashes
     * @returns New HashSequence
     */
    static from(hashes: Uint8Array[]): HashSequence;

    /**
     * Create from hex strings
     * @param hexStrings - Array of 64-char hex strings
     * @returns New HashSequence
     */
    static fromHex(hexStrings: string[]): HashSequence;

    /**
     * Export to JSON-serializable object
     * @returns JSON object with hex hashes
     */
    toJSON(): HashSequenceJSON;

    /**
     * Create from JSON object
     * @param json - JSON object from toJSON()
     * @returns New HashSequence
     */
    static fromJSON(json: HashSequenceJSON): HashSequence;

    /**
     * Remove all hashes
     * @returns this (for chaining)
     */
    clear(): this;

    /**
     * Remove and return hash at index
     * @param index - Index to remove
     * @returns Removed hash
     * @throws Error if index out of bounds
     */
    removeAt(index: number): Uint8Array;

    /**
     * Insert hash at index
     * @param index - Index to insert at
     * @param hash - 32-byte hash to insert
     * @returns this (for chaining)
     */
    insertAt(index: number, hash: Uint8Array): this;

    /**
     * Create slice of sequence
     * @param start - Start index (inclusive)
     * @param end - End index (exclusive)
     * @returns New HashSequence with sliced hashes
     */
    slice(start: number, end?: number): HashSequence;

    /**
     * Concatenate with another sequence
     * @param other - Sequence to append
     * @returns New combined HashSequence
     */
    concat(other: HashSequence): HashSequence;

    /**
     * Check equality with another sequence
     * @param other - Sequence to compare
     * @returns true if equal
     */
    equals(other: HashSequence): boolean;
  }

  // ============================================
  // Verification Helpers
  // ============================================

  /**
   * Verify a single chunk against expected chaining value
   * @param chunk - Chunk data (up to 1024 bytes)
   * @param chunkIndex - Chunk index
   * @param isRoot - Whether this is the root
   * @param expectedCV - Expected chaining value
   * @returns true if valid
   */
  export function verifyChunk(chunk: Uint8Array, chunkIndex: number, isRoot: boolean, expectedCV: Uint8Array): boolean;

  /**
   * Verify parent node against expected chaining value
   * @param leftCV - Left child CV
   * @param rightCV - Right child CV
   * @param isRoot - Whether this is the root
   * @param expectedCV - Expected chaining value
   * @returns true if valid
   */
  export function verifyParent(leftCV: Uint8Array, rightCV: Uint8Array, isRoot: boolean, expectedCV: Uint8Array): boolean;

  /**
   * Constant-time comparison of two byte arrays
   * @param a - First array
   * @param b - Second array
   * @returns true if equal
   */
  export function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean;

  // ============================================
  // Utility Functions
  // ============================================

  /**
   * Count chunks for a given content length
   * @param contentLen - Content length in bytes
   * @returns Number of chunks
   */
  export function countChunks(contentLen: number): number;

  /**
   * Calculate left subtree length
   * @param totalLen - Total length
   * @returns Left subtree length
   */
  export function leftLen(totalLen: number): number;

  /**
   * Calculate encoded subtree size
   * @param contentLen - Content length
   * @param outboard - Whether outboard mode
   * @returns Encoded size in bytes
   */
  export function encodedSubtreeSize(contentLen: number, outboard?: boolean): number;

  /**
   * Compute chunk chaining value
   * @param chunk - Chunk data
   * @param chunkIndex - Chunk index
   * @param isRoot - Whether this is the root
   * @returns 32-byte chaining value
   */
  export function chunkCV(chunk: Uint8Array, chunkIndex: number, isRoot?: boolean): Uint8Array;

  /**
   * Compute parent chaining value
   * @param leftCV - Left child CV
   * @param rightCV - Right child CV
   * @param isRoot - Whether this is the root
   * @returns 32-byte chaining value
   */
  export function parentCV(leftCV: Uint8Array, rightCV: Uint8Array, isRoot?: boolean): Uint8Array;

  // ============================================
  // Constants
  // ============================================

  export const CHUNK_LEN: number;
  export const BLOCK_LEN: number;
  export const CHUNK_START: number;
  export const CHUNK_END: number;
  export const PARENT: number;
  export const ROOT: number;
  export const HEADER_SIZE: number;
  export const HASH_SIZE: number;
  export const PARENT_SIZE: number;
  export const IV: Uint32Array;
  export const IROH_CHUNK_GROUP_LOG: number;
  export const IROH_CHUNK_GROUP_SIZE: number;
}

export = bao;
export as namespace bao;

/**
 * blake3-bao/bao - ESM wrapper for Bao
 */
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const lib = require('./bao.js');

// Core primitives
export const chunkCV = lib.chunkCV;
export const parentCV = lib.parentCV;
export const leftLen = lib.leftLen;

// Encoding/Decoding
export const baoEncode = lib.baoEncode;
export const baoDecode = lib.baoDecode;
export const encodeLen = lib.encodeLen;
export const decodeLen = lib.decodeLen;

// Slicing
export const baoSlice = lib.baoSlice;
export const baoDecodeSlice = lib.baoDecodeSlice;

// Verification helpers
export const verifyChunk = lib.verifyChunk;
export const verifyParent = lib.verifyParent;
export const constantTimeEqual = lib.constantTimeEqual;

// Streaming API
export const BaoEncoder = lib.BaoEncoder;
export const BaoDecoder = lib.BaoDecoder;

// Iroh chunk group support
export const baoEncodeIroh = lib.baoEncodeIroh;
export const baoDecodeIroh = lib.baoDecodeIroh;
export const baoVerifyIroh = lib.baoVerifyIroh;
export const chunkGroupCV = lib.chunkGroupCV;
export const countChunkGroups = lib.countChunkGroups;
export const irohOutboardSize = lib.irohOutboardSize;

// Partial/Resumable downloads
export const PartialBao = lib.PartialBao;
export const createBitfield = lib.createBitfield;
export const setBit = lib.setBit;
export const clearBit = lib.clearBit;
export const getBit = lib.getBit;
export const countSetBits = lib.countSetBits;

// Hash sequences (blob collections)
export const HashSequence = lib.HashSequence;

// Utilities
export const countChunks = lib.countChunks;
export const encodedSubtreeSize = lib.encodedSubtreeSize;
export const wordsToBytes = lib.wordsToBytes;

// Constants
export const CHUNK_LEN = lib.CHUNK_LEN;
export const BLOCK_LEN = lib.BLOCK_LEN;
export const CHUNK_START = lib.CHUNK_START;
export const CHUNK_END = lib.CHUNK_END;
export const PARENT = lib.PARENT;
export const ROOT = lib.ROOT;
export const HEADER_SIZE = lib.HEADER_SIZE;
export const HASH_SIZE = lib.HASH_SIZE;
export const PARENT_SIZE = lib.PARENT_SIZE;
export const IV = lib.IV;
export const IROH_CHUNK_GROUP_LOG = lib.IROH_CHUNK_GROUP_LOG;
export const IROH_CHUNK_GROUP_SIZE = lib.IROH_CHUNK_GROUP_SIZE;

export default lib;

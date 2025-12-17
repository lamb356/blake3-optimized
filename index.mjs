/**
 * blake3-bao - ESM entry point
 */
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const lib = require('./index.js');

// Re-export blake3 functions
export const hash = lib.hash;
export const hashHex = lib.hashHex;
export const toHex = lib.toHex;
export const initSimd = lib.initSimd;
export const isSimdEnabled = lib.isSimdEnabled;
export const createHasher = lib.createHasher;
export const createKeyedHasher = lib.createKeyedHasher;
export const hashKeyed = lib.hashKeyed;
export const deriveKey = lib.deriveKey;
export const Hasher = lib.Hasher;

// Re-export bao functions
export const baoEncode = lib.baoEncode;
export const baoDecode = lib.baoDecode;
export const baoSlice = lib.baoSlice;
export const baoDecodeSlice = lib.baoDecodeSlice;
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

// Named sub-modules
export const blake3 = lib.blake3;
export const bao = lib.bao;

// Default export
export default lib;

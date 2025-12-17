/**
 * blake3-bao TypeScript definitions
 * Pure JavaScript BLAKE3 and Bao implementation with Iroh compatibility
 */

// Import sub-modules
import * as blake3Module from './blake3';
import * as baoModule from './bao';

// Re-export sub-modules
export import blake3 = blake3Module;
export import bao = baoModule;

// Re-export commonly used BLAKE3 functions at top level
export const hash: typeof blake3Module.hash;
export const hashHex: typeof blake3Module.hashHex;
export const toHex: typeof blake3Module.toHex;
export const initSimd: typeof blake3Module.initSimd;
export const isSimdEnabled: typeof blake3Module.isSimdEnabled;
export const createHasher: typeof blake3Module.createHasher;
export const createKeyedHasher: typeof blake3Module.createKeyedHasher;
export const hashKeyed: typeof blake3Module.hashKeyed;
export const deriveKey: typeof blake3Module.deriveKey;
export const Hasher: typeof blake3Module.Hasher;

// Re-export commonly used Bao functions at top level
export const baoEncode: typeof baoModule.baoEncode;
export const baoDecode: typeof baoModule.baoDecode;
export const baoSlice: typeof baoModule.baoSlice;
export const baoDecodeSlice: typeof baoModule.baoDecodeSlice;
export const baoEncodeIroh: typeof baoModule.baoEncodeIroh;
export const baoDecodeIroh: typeof baoModule.baoDecodeIroh;
export const baoVerifyIroh: typeof baoModule.baoVerifyIroh;
export const BaoEncoder: typeof baoModule.BaoEncoder;
export const BaoDecoder: typeof baoModule.BaoDecoder;
export const PartialBao: typeof baoModule.PartialBao;
export const HashSequence: typeof baoModule.HashSequence;
export const createBitfield: typeof baoModule.createBitfield;
export const setBit: typeof baoModule.setBit;
export const clearBit: typeof baoModule.clearBit;
export const getBit: typeof baoModule.getBit;
export const countSetBits: typeof baoModule.countSetBits;
export const chunkGroupCV: typeof baoModule.chunkGroupCV;
export const countChunkGroups: typeof baoModule.countChunkGroups;
export const irohOutboardSize: typeof baoModule.irohOutboardSize;

// Re-export types
export type { BaoEncodeResult, GroupRange, PartialBaoState, HashSequenceJSON } from './bao';

// Default export
declare const _default: {
  blake3: typeof blake3Module;
  bao: typeof baoModule;
  hash: typeof blake3Module.hash;
  hashHex: typeof blake3Module.hashHex;
  toHex: typeof blake3Module.toHex;
  initSimd: typeof blake3Module.initSimd;
  isSimdEnabled: typeof blake3Module.isSimdEnabled;
  createHasher: typeof blake3Module.createHasher;
  createKeyedHasher: typeof blake3Module.createKeyedHasher;
  hashKeyed: typeof blake3Module.hashKeyed;
  deriveKey: typeof blake3Module.deriveKey;
  Hasher: typeof blake3Module.Hasher;
  baoEncode: typeof baoModule.baoEncode;
  baoDecode: typeof baoModule.baoDecode;
  baoSlice: typeof baoModule.baoSlice;
  baoDecodeSlice: typeof baoModule.baoDecodeSlice;
  baoEncodeIroh: typeof baoModule.baoEncodeIroh;
  baoDecodeIroh: typeof baoModule.baoDecodeIroh;
  baoVerifyIroh: typeof baoModule.baoVerifyIroh;
  BaoEncoder: typeof baoModule.BaoEncoder;
  BaoDecoder: typeof baoModule.BaoDecoder;
  PartialBao: typeof baoModule.PartialBao;
  HashSequence: typeof baoModule.HashSequence;
  createBitfield: typeof baoModule.createBitfield;
  setBit: typeof baoModule.setBit;
  clearBit: typeof baoModule.clearBit;
  getBit: typeof baoModule.getBit;
  countSetBits: typeof baoModule.countSetBits;
};

export default _default;

// Declare module for main package
declare module 'blake3-bao' {
  export * from './index';
}

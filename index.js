/**
 * blake3-bao - Pure JavaScript BLAKE3 and Bao implementation
 *
 * Re-exports everything from blake3.js and bao.js for convenient access.
 */
'use strict';

const blake3 = require('./blake3.js');
const bao = require('./bao.js');

// Re-export blake3 functions
exports.hash = blake3.hash;
exports.hashHex = blake3.hashHex;
exports.toHex = blake3.toHex;
exports.initSimd = blake3.initSimd;
exports.isSimdEnabled = blake3.isSimdEnabled;
exports.createHasher = blake3.createHasher;
exports.createKeyedHasher = blake3.createKeyedHasher;
exports.hashKeyed = blake3.hashKeyed;
exports.deriveKey = blake3.deriveKey;
exports.Hasher = blake3.Hasher;

// Re-export bao functions
exports.baoEncode = bao.baoEncode;
exports.baoDecode = bao.baoDecode;
exports.baoSlice = bao.baoSlice;
exports.baoDecodeSlice = bao.baoDecodeSlice;
exports.BaoEncoder = bao.BaoEncoder;
exports.BaoDecoder = bao.BaoDecoder;

// Iroh chunk group support
exports.baoEncodeIroh = bao.baoEncodeIroh;
exports.baoDecodeIroh = bao.baoDecodeIroh;
exports.baoVerifyIroh = bao.baoVerifyIroh;
exports.chunkGroupCV = bao.chunkGroupCV;
exports.countChunkGroups = bao.countChunkGroups;
exports.irohOutboardSize = bao.irohOutboardSize;

// Partial/Resumable downloads
exports.PartialBao = bao.PartialBao;
exports.createBitfield = bao.createBitfield;
exports.setBit = bao.setBit;
exports.clearBit = bao.clearBit;
exports.getBit = bao.getBit;
exports.countSetBits = bao.countSetBits;

// Hash sequences (blob collections)
exports.HashSequence = bao.HashSequence;

// Named sub-modules
exports.blake3 = blake3;
exports.bao = bao;

// WASM-accelerated modules (optional)
// These provide faster Bao operations for large files
try {
  exports.baoWasm = require('./bao-wasm.js');
  exports.baoWasmZerocopy = require('./bao-wasm-zerocopy.js');
} catch (e) {
  // WASM modules are optional - may not be available in all environments
  exports.baoWasm = null;
  exports.baoWasmZerocopy = null;
}

// Rust WASM SIMD-accelerated module (optional)
// Uses official blake3 crate for 3x faster crypto operations
try {
  exports.baoRustWasm = require('./bao-rust-wasm.js');
} catch (e) {
  exports.baoRustWasm = null;
}

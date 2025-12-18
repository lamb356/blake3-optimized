# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.2.0] - 2024-12-18

### Added
- **Rust WASM SIMD acceleration** using the official blake3 crate
  - `bao-rust-wasm.js` module with zero-copy buffer operations
  - SIMD128 instructions for parallel processing
  - Batch `chunkCV` and `parentCV` operations
  - Direct memory access API for maximum performance

### Performance
- chunkCV primitive: **651 MB/s** (was ~203 MB/s, **3.3x faster** than v1.1.0)
- Batch chunk processing: **665 MB/s** throughput
- **6.4x faster** than v1.0.0 baseline (~101 MB/s)
- parentCV: 1.67x faster than JS

### Technical Details
- Uses `blake3::guts::ChunkState` for chunk CV computation
- Uses `blake3::guts::parent_cv` for parent CV computation
- 64KB pre-allocated input/output buffers for zero-copy operations
- Built with wasm32-unknown-unknown target + wasm-bindgen

## [1.1.0] - 2024-12-17

### Added
- `BaoEncoder` streaming class for memory-efficient Bao encoding
  - O(log n) memory usage in outboard mode (stores only chunk CVs)
  - Supports incremental `write()` API for large file streaming
  - Idempotent `finalize()` for safe repeated calls
- WASM-accelerated Bao operations (optional)
  - `bao-wasm.js` module with AssemblyScript-compiled WASM
  - `bao-wasm-zerocopy.js` with direct buffer access for maximum performance
  - Batch `chunkCV` and `parentCV` operations
  - Fallback to pure JS when WASM unavailable

### Changed
- **Buffer pooling**: Reusable Uint32Array buffers reduce GC pressure
- **Single allocation**: `baoEncode` pre-calculates exact output size
- **Pre-order tree traversal**: Optimized tree building for Bao encoding

### Performance
- Bao encode outboard: ~198 MB/s (was ~153 MB/s, **29% faster**)
- Bao encode combined: ~185 MB/s (was ~101 MB/s, **83% faster**)
- chunkCV primitive: ~203 MB/s throughput
- BaoEncoder streaming: ~150-168 MB/s with O(log n) memory

## [1.0.0] - 2024-12-17

### Added
- Pure JavaScript BLAKE3 implementation with WASM SIMD acceleration
- Full BLAKE3 API: `hash`, `hashHex`, `hashKeyed`, `deriveKey`, streaming `Hasher`
- Bao verified streaming: `baoEncode`, `baoDecode`, `baoSlice`, `baoDecodeSlice`
- Streaming Bao API: `BaoEncoder`, `BaoDecoder`
- Iroh-compatible chunk groups (16 chunks = 16 KiB per group)
  - 93.8% smaller outboard encoding compared to standard Bao
  - `baoEncodeIroh`, `baoDecodeIroh`, `baoVerifyIroh`
- `PartialBao` class for resumable downloads with Merkle proof verification
  - Bitfield tracking for chunk group status
  - Multi-source download support
  - State persistence with `exportState`/`importState`
- `HashSequence` class for blob collections (ordered hash lists)
  - Serialization matching Iroh format
  - Collection hashing with `finalize()`
- Browser bundles via Webpack (UMD format)
  - `dist/blake3-bao.min.js` (37.8 KB) - Full bundle
  - `dist/blake3.min.js` (18.9 KB) - BLAKE3 only
  - `dist/bao.min.js` (36.9 KB) - Bao only
- Full TypeScript definitions
- CommonJS and ESM module support
- 1,158 tests including official Bao test vectors

### Performance
- BLAKE3: ~883 MB/s with SIMD (1 MB input)
- Bao encode: ~153 MB/s outboard, ~101 MB/s combined
- Bao decode: ~173 MB/s combined, ~155 MB/s outboard

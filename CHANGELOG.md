# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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

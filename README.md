# BLAKE3 Optimized - Pure JavaScript Implementation with WASM SIMD

A highly optimized pure JavaScript implementation of the [BLAKE3](https://github.com/BLAKE3-team/BLAKE3) cryptographic hash function with embedded WASM SIMD support for maximum performance.

**Created for [Zooko's 10 ZEC bounty](https://x.com/zooko/status/1998185559542657145)**

## Features

- **Pure JavaScript** - No native dependencies, works everywhere
- **WASM SIMD** - Embedded compress4x module for 4-way parallel chunk processing
- **Self-contained** - Single file with WASM binary embedded as base64
- **All optimizations** from Fleek Network's case study
- **35/35 test vectors pass**

## Performance

| Input Size | Scalar (no SIMD) | With SIMD (expected) |
|------------|------------------|----------------------|
| 1 KB       | ~400 MB/s        | ~800+ MB/s           |
| 16 KB      | ~450 MB/s        | ~1200+ MB/s          |
| 1 MB       | ~450 MB/s        | ~1500+ MB/s          |

*SIMD performance requires WASM SIMD support (M1/M4 Mac, modern Linux).*

## Installation

```bash
# Clone the repo
git clone https://github.com/lamb356/blake3-optimized.git
cd blake3-optimized

# Run tests
node test.js

# Run benchmarks
node benchmark.js
```

## Usage

```javascript
const blake3 = require('./blake3.js');

// Initialize SIMD (optional, for best performance)
await blake3.initSimd();
console.log('SIMD enabled:', blake3.isSimdEnabled());

// Hash binary data - returns Uint8Array(32)
const data = new Uint8Array([1, 2, 3, 4, 5]);
const digest = blake3.hash(data);

// Hash to hex string
const hexDigest = blake3.hashHex(data);

// Hash a string (UTF-8)
const stringDigest = blake3.hash('hello world');
const stringHex = blake3.hashHex('hello world');
```

## API

| Function | Input | Output | Description |
|----------|-------|--------|-------------|
| `hash(input)` | `Uint8Array` or `string` | `Uint8Array(32)` | Hash to bytes |
| `hashHex(input)` | `Uint8Array` or `string` | `string` (64 chars) | Hash to hex |
| `initSimd()` | - | `Promise<boolean>` | Initialize WASM SIMD |
| `isSimdEnabled()` | - | `boolean` | Check if SIMD active |

## Optimizations

### Scalar Optimizations (from Fleek Network)
1. **Fully unrolled compress** - No loops in hot path
2. **SMI local variables** - State in 16 local vars for V8 optimization
3. **Direct permutation** - Hardcoded message word swaps
4. **Buffer reuse** - Pre-allocated internal buffers
5. **Uint32Array views** - Direct LE read for aligned input
6. **Minimal allocations** - Offset-based array access

### WASM SIMD (compress4x)
- Processes 4 independent chunks in parallel
- Uses `v128` (i32x4) SIMD vectors
- `i8x16.shuffle` for 8/16-bit rotations
- `i32x4.add`, `i32x4.xor` for arithmetic
- ~3-4x throughput improvement for large inputs

## Files

| File | Description |
|------|-------------|
| `blake3.js` | Main implementation (self-contained) |
| `test.js` | Test suite with 35 official vectors |
| `benchmark.js` | Performance benchmarks |
| `compress4x.wat` | WASM SIMD source (WebAssembly Text) |
| `compress4x.wasm` | Compiled WASM binary |

## Testing

```bash
# Run all 35 test vectors
node test.js

# Quick test
node -e "const b3 = require('./blake3.js'); console.log(b3.hashHex('hello'))"
# Expected: ea8f163db38682925e4491c5e58d4bb3506ef8c14eb78a86e908c5624a67200f
```

## SIMD Support

WASM SIMD is supported on:
- **macOS**: M1/M4 chips (Node.js, Safari, Chrome)
- **Linux**: Modern x64 with Node.js 16+
- **Windows**: Limited support (may require specific Node.js builds)

Check SIMD support:
```javascript
const blake3 = require('./blake3.js');
blake3.initSimd().then(enabled => console.log('SIMD:', enabled));
```

## License

CC0-1.0 (Public Domain)

## References

- [BLAKE3 Specification](https://github.com/BLAKE3-team/BLAKE3-specs/blob/master/blake3.pdf)
- [Fleek Network Case Study](https://blog.fleek.network/post/fleek-network-blake3-case-study/)
- [Zooko's Bounty](https://x.com/zooko/status/1998185559542657145)

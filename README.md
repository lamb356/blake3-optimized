# BLAKE3 Optimized - Pure JavaScript Implementation

A highly optimized pure JavaScript implementation of the [BLAKE3](https://github.com/BLAKE3-team/BLAKE3) cryptographic hash function, following all optimizations from [Fleek Network's case study](https://blog.fleek.network/post/fleek-network-blake3-case-study/).

**Created for [Zooko's 10 ZEC bounty](https://x.com/zooko/status/1998185559542657145)** for implementing optimized BLAKE3 in JavaScript.

## Performance

| Input Size | Throughput |
|------------|------------|
| 96 bytes   | ~50 MB/s   |
| 1 KB       | ~343 MB/s  |
| 32 KB      | ~388 MB/s  |
| 1 MB       | ~390 MB/s  |

Benchmarked on Node.js. Performance varies by JavaScript engine.

## Installation

```bash
npm install blake3-optimized
```

Or use directly in browser/Deno:

```javascript
import { hash, hashHex } from './blake3.js';
```

## Usage

```javascript
const { hash, hashHex, hashString, hashStringHex } = require('blake3-optimized');

// Hash binary data
const data = new Uint8Array([1, 2, 3, 4, 5]);
const digest = hash(data);  // Returns Uint8Array(32)

// Hash binary data to hex string
const hexDigest = hashHex(data);  // Returns 64-char hex string

// Hash a string (UTF-8 encoded)
const stringDigest = hashString("hello world");  // Returns Uint8Array(32)
const stringHex = hashStringHex("hello world");  // Returns hex string
```

## Optimizations Applied

This implementation follows all 9 optimizations from Fleek Network's case study:

### 1. Optimized Little-Endian Read
Removed conditional branching for full block reads, using direct byte manipulation.

### 2. Precomputed Permutations  
Message permutation table precomputed for all 7 rounds instead of computing at runtime.

### 3. Inlined Round Function
The round function is fully inlined into the compress function, eliminating function call overhead.

### 4. Local Variables for State
Uses 16 local SMI (Small Integer) variables (`s_0` through `s_15`) instead of array access for the state, enabling V8 optimizations.

### 5. Offset-Based Access (Avoid Copies)
Uses pointer-style offsets instead of creating new arrays, reducing allocations.

### 6. Variables for Block Words
Message words stored in 16 local variables (`m_0` through `m_15`) with hardcoded permutation swaps using only 2 temporary variables.

### 7. Buffer Reuse
Internal buffers (`blockWords`, `cvStack`) are reused between hash calls instead of reallocating.

### 8. Little-Endian Optimization
On little-endian systems (most modern hardware), creates a `Uint32Array` view directly over the input buffer, avoiding byte-by-byte conversion.

### 9. WASM SIMD (Future)
The architecture supports adding a WASM SIMD `compress4x` function for even higher throughput (not yet implemented in this version).

## API Reference

### `hash(input: Uint8Array): Uint8Array`
Hash binary data, returns 32-byte Uint8Array.

### `hashHex(input: Uint8Array): string`
Hash binary data, returns 64-character hex string.

### `hashString(str: string): Uint8Array`
Hash UTF-8 string, returns 32-byte Uint8Array.

### `hashStringHex(str: string): string`
Hash UTF-8 string, returns 64-character hex string.

## Test Vectors

All official BLAKE3 test vectors pass. Run tests with:

```bash
npm test
```

## Compatibility

- Node.js 14+
- Deno
- Modern browsers (Chrome, Firefox, Safari, Edge)
- Any JavaScript runtime with TypedArray support

## License

CC0-1.0 (Public Domain)

This is free and unencumbered software released into the public domain.

## References

- [BLAKE3 Paper](https://github.com/BLAKE3-team/BLAKE3-specs/blob/master/blake3.pdf)
- [Official BLAKE3 Repository](https://github.com/BLAKE3-team/BLAKE3)
- [Fleek Network Case Study](https://blog.fleek.network/post/fleek-network-blake3-case-study/)
- [Zooko's Bounty Tweet](https://x.com/zooko/status/1998185559542657145)

## Credits

- BLAKE3 created by Jack O'Connor, Jean-Philippe Aumasson, Samuel Neves, and Zooko Wilcox-O'Hearn
- Optimization techniques from Fleek Network (Parsa)
- JavaScript implementation for Zooko's bounty

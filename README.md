# BLAKE3 + Bao - Pure JavaScript Implementation

A complete pure JavaScript implementation of [BLAKE3](https://github.com/BLAKE3-team/BLAKE3) cryptographic hash function and [Bao](https://github.com/oconnor663/bao) verified streaming, with optional WASM SIMD acceleration.

**977 tests passing** (228 BLAKE3 + 749 Bao)

## Features

- **Pure JavaScript** - No native dependencies, works everywhere
- **BLAKE3 Hashing** - Full implementation with keyed hashing and key derivation
- **Bao Verified Streaming** - Encode, decode, and slice with Merkle tree verification
- **WASM SIMD** - Optional 4-way parallel chunk processing for maximum performance
- **Streaming API** - Memory-efficient processing for large files
- **Self-contained** - Single files with no external dependencies

## Installation

```bash
git clone https://github.com/lamb356/blake3-optimized.git
cd blake3-optimized

# Run all tests
node test.js                    # BLAKE3 tests (228)
node test-bao-vectors.js        # Bao official vectors (574)
node test-bao-primitives.js     # Bao primitives (41)
node test-bao-encode.js         # Bao encoding (38)
node test-bao-decode.js         # Bao decoding (33)
node test-bao-slice.js          # Bao slicing (24)
node test-bao-streaming.js      # Bao streaming (39)

# Run benchmarks
node benchmark.js               # BLAKE3 benchmarks
node benchmark-bao.js           # Bao benchmarks
```

## Quick Start

```javascript
const blake3 = require('./blake3.js');
const bao = require('./bao.js');

// Simple hashing
const hash = blake3.hash('hello world');
console.log(blake3.hashHex('hello world'));
// d74981efa70a0c880b8d8c1985d075dbcbf679b99a5f9914e5aaf96b831a9e24

// Bao encode for verified streaming
const data = new Uint8Array(10000);
const { encoded, hash: rootHash } = bao.baoEncode(data);

// Decode with verification
const decoded = bao.baoDecode(encoded, rootHash);

// Extract and verify a slice (random access)
const slice = bao.baoSlice(encoded, 5000, 1000);
const sliceData = bao.baoDecodeSlice(slice, rootHash, 5000, 1000);
```

---

## BLAKE3 API

### `hash(input, outputLen = 32)`

Hash data and return bytes.

```javascript
const digest = blake3.hash('hello world');           // Uint8Array(32)
const digest64 = blake3.hash('hello world', 64);     // Uint8Array(64) - XOF
const digest = blake3.hash(new Uint8Array([1,2,3])); // Binary input
```

### `hashHex(input, outputLen = 32)`

Hash data and return hex string.

```javascript
const hex = blake3.hashHex('hello world');
// "d74981efa70a0c880b8d8c1985d075dbcbf679b99a5f9914e5aaf96b831a9e24"
```

### `hashKeyed(key, input, outputLen = 32)`

Keyed hash (MAC) with 32-byte key.

```javascript
const key = new Uint8Array(32).fill(0x42);
const mac = blake3.hashKeyed(key, 'message');
```

### `deriveKey(context, keyMaterial, outputLen = 32)`

Derive a key from context string and key material.

```javascript
const derivedKey = blake3.deriveKey('myapp v1 encryption', masterKey);
```

### `Hasher` - Streaming API

For processing large data incrementally:

```javascript
const hasher = new blake3.Hasher();
hasher.update('chunk 1');
hasher.update('chunk 2');
hasher.update(new Uint8Array([1, 2, 3]));
const digest = hasher.finalize();      // Uint8Array(32)
const hex = hasher.finalizeHex();      // hex string
```

### SIMD Acceleration

```javascript
// Initialize WASM SIMD (optional, for best performance)
await blake3.initSimd();
console.log('SIMD enabled:', blake3.isSimdEnabled());

// All hash functions automatically use SIMD when available
```

---

## Bao API

Bao provides verified streaming - the ability to verify portions of a file without downloading the whole thing.

### `baoEncode(data, outboard = false)`

Encode data with Bao tree structure.

```javascript
const data = new Uint8Array(10000);

// Combined mode: tree + data interleaved
const { encoded, hash } = bao.baoEncode(data);

// Outboard mode: tree only (data stored separately)
const { encoded: tree, hash } = bao.baoEncode(data, true);
```

### `baoDecode(encoded, rootHash, outboardData = null)`

Decode and verify Bao-encoded data.

```javascript
// Combined mode
const decoded = bao.baoDecode(encoded, hash);

// Outboard mode
const decoded = bao.baoDecode(tree, hash, originalData);
```

### `baoSlice(encoded, start, len, outboardData = null)`

Extract a minimal slice for verifying a byte range.

```javascript
// Extract bytes 5000-6000 from a file
const slice = bao.baoSlice(encoded, 5000, 1000);

// Slice is much smaller than full encoding
console.log(`Full: ${encoded.length}, Slice: ${slice.length}`);
```

### `baoDecodeSlice(slice, rootHash, start, len)`

Decode and verify a slice.

```javascript
const slice = bao.baoSlice(encoded, 5000, 1000);
const data = bao.baoDecodeSlice(slice, hash, 5000, 1000);
// data contains verified bytes 5000-6000
```

### `BaoEncoder` - Streaming Encoder

```javascript
const encoder = new bao.BaoEncoder(outboard = false);

// Feed data incrementally
encoder.write(chunk1);
encoder.write(chunk2);
encoder.write(chunk3);

// Get final encoding
const { encoded, hash } = encoder.finalize();
```

### `BaoDecoder` - Streaming Decoder

```javascript
const decoder = new bao.BaoDecoder(rootHash, contentLen, isOutboard = false);

// For outboard mode
decoder.setOutboardData(originalData);

// Feed encoded data incrementally
decoder.write(encodedChunk1);
decoder.write(encodedChunk2);

// Read verified data as it becomes available
const verifiedData = decoder.read();

// Check completion
if (decoder.isComplete()) {
  const allData = decoder.finalize();
}
```

---

## Examples

### Verifying File Integrity

```javascript
const fs = require('fs');
const bao = require('./bao.js');

// Encode a file
const fileData = fs.readFileSync('largefile.bin');
const { encoded, hash } = bao.baoEncode(fileData);

// Save encoding and hash
fs.writeFileSync('largefile.bao', encoded);
fs.writeFileSync('largefile.hash', hash);

// Later: verify and decode
const savedEncoded = fs.readFileSync('largefile.bao');
const savedHash = fs.readFileSync('largefile.hash');
const verified = bao.baoDecode(savedEncoded, savedHash);
```

### Random Access Verification

```javascript
// Only download and verify specific byte range
const slice = bao.baoSlice(encoded, 1000000, 4096);  // 4KB at offset 1MB
const data = bao.baoDecodeSlice(slice, hash, 1000000, 4096);

// Slice is ~2KB regardless of file size (only tree nodes + 1-2 chunks)
```

### Streaming Large Files

```javascript
const encoder = new bao.BaoEncoder();

// Process file in chunks
const stream = fs.createReadStream('hugefile.bin', { highWaterMark: 64 * 1024 });
for await (const chunk of stream) {
  encoder.write(chunk);
}

const { encoded, hash } = encoder.finalize();
```

### Keyed Hashing for Authentication

```javascript
const blake3 = require('./blake3.js');

// Create MAC
const key = crypto.randomBytes(32);
const mac = blake3.hashKeyed(key, message);

// Verify MAC
const expectedMac = blake3.hashKeyed(key, receivedMessage);
if (mac.every((b, i) => b === expectedMac[i])) {
  console.log('Message authenticated');
}
```

---

## Performance

### BLAKE3 Throughput

| Input Size | Scalar | With SIMD |
|------------|--------|-----------|
| 1 KB       | ~400 MB/s | ~800+ MB/s |
| 16 KB      | ~450 MB/s | ~1200+ MB/s |
| 1 MB       | ~450 MB/s | ~1500+ MB/s |

### Bao Throughput

| Operation | 1 MB | 10 MB |
|-----------|------|-------|
| Encode (combined) | ~104 MB/s | ~96 MB/s |
| Encode (outboard) | ~160 MB/s | ~165 MB/s |
| Decode | ~162 MB/s | ~171 MB/s |

### Slice Efficiency

| File Size | 1KB Slice Size | Reduction |
|-----------|----------------|-----------|
| 100 KB    | 1.45 KB        | 98.6%     |
| 1 MB      | 1.63 KB        | 99.8%     |
| 10 MB     | 1.88 KB        | 100.0%    |

### Encoding Overhead

- Combined mode: ~6.25% (tree nodes interleaved with data)
- Outboard mode: ~6.25% of input size (tree only)

---

## Files

| File | Description |
|------|-------------|
| `blake3.js` | BLAKE3 implementation (self-contained) |
| `bao.js` | Bao verified streaming implementation |
| `test.js` | BLAKE3 test suite (228 tests) |
| `test-bao-*.js` | Bao test suites (749 tests total) |
| `test-vectors.json` | Official Bao test vectors |
| `benchmark.js` | BLAKE3 performance benchmarks |
| `benchmark-bao.js` | Bao performance benchmarks |
| `compress4x.wat` | WASM SIMD source |
| `compress4x.wasm` | Compiled WASM binary |

---

## Test Coverage

| Component | Tests |
|-----------|-------|
| BLAKE3 core | 35 |
| BLAKE3 keyed | 35 |
| BLAKE3 derive_key | 35 |
| BLAKE3 XOF | 123 |
| Bao primitives | 41 |
| Bao encoding | 38 |
| Bao decoding | 33 |
| Bao slicing | 24 |
| Bao streaming | 39 |
| Bao official vectors | 574 |
| **Total** | **977** |

---

## Platform Support

### BLAKE3
- Node.js 14+
- All modern browsers
- Deno, Bun

### WASM SIMD
- macOS: M1/M2/M3/M4 chips
- Linux: Modern x64 with Node.js 16+
- Windows: Node.js with SIMD support

### Bao
- Same as BLAKE3 (pure JavaScript)

---

## References

- [BLAKE3 Specification](https://github.com/BLAKE3-team/BLAKE3-specs/blob/master/blake3.pdf)
- [Bao Specification](https://github.com/oconnor663/bao/blob/master/docs/spec.md)
- [Fleek Network Case Study](https://blog.fleek.network/post/fleek-network-blake3-case-study/)

## License

CC0-1.0 (Public Domain)

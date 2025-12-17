# blake3-bao

[![npm version](https://img.shields.io/npm/v/blake3-bao.svg)](https://www.npmjs.com/package/blake3-bao)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![Tests](https://img.shields.io/badge/tests-1%2C158%20passing-brightgreen.svg)](https://github.com/lamb356/blake3-optimized)

Pure JavaScript [BLAKE3](https://github.com/BLAKE3-team/BLAKE3) cryptographic hash and [Bao](https://github.com/oconnor663/bao) verified streaming implementation with Iroh compatibility and optional WASM SIMD acceleration.

**1,158 tests passing** (228 BLAKE3 + 930 Bao)

## Features

- **Pure JavaScript** - No native dependencies, works everywhere
- **BLAKE3 Hashing** - Full implementation with keyed hashing and key derivation
- **Bao Verified Streaming** - Encode, decode, and slice with Merkle tree verification
- **Iroh Chunk Groups** - 16x smaller outboard size for efficient verified streaming
- **WASM SIMD** - Optional 4-way parallel chunk processing for maximum performance
- **Streaming API** - Memory-efficient processing for large files
- **Self-contained** - Single files with no external dependencies

## Installation

### npm

```bash
npm install blake3-bao
```

### From Source

```bash
git clone https://github.com/lamb356/blake3-optimized.git
cd blake3-optimized

# Run all tests
npm test

# Or run individually:
node test.js                    # BLAKE3 tests (228)
node test-bao-vectors.js        # Bao official vectors (574)
node test-bao-primitives.js     # Bao primitives (41)
node test-bao-encode.js         # Bao encoding (38)
node test-bao-decode.js         # Bao decoding (33)
node test-bao-slice.js          # Bao slicing (24)
node test-bao-streaming.js      # Bao streaming (39)
node test-bao-iroh.js           # Bao Iroh chunk groups (54)
node test-bao-partial.js        # Bao resumable downloads (55)
node test-bao-sequence.js       # Bao hash sequences (72)

# Run benchmarks
node benchmark.js               # BLAKE3 benchmarks
node benchmark-bao.js           # Bao benchmarks

# Build browser bundles
npm run build
```

## Browser Usage

Include the minified bundle via script tag:

```html
<!-- Full bundle (BLAKE3 + Bao) - 37.8 KB -->
<script src="https://unpkg.com/blake3-bao/dist/blake3-bao.min.js"></script>

<!-- Or individual bundles -->
<script src="https://unpkg.com/blake3-bao/dist/blake3.min.js"></script>  <!-- 18.9 KB -->
<script src="https://unpkg.com/blake3-bao/dist/bao.min.js"></script>     <!-- 36.9 KB -->
```

```javascript
// Full bundle - access via blake3Bao global
const hash = blake3Bao.blake3.hash('hello');
const hex = blake3Bao.blake3.toHex(hash);
const { encoded } = blake3Bao.bao.baoEncode(data);

// Individual bundles - direct global access
const hash = blake3.hash('hello');
const { encoded } = bao.baoEncode(data);
```

## TypeScript Support

Full TypeScript definitions are included:

```typescript
import {
  hash, hashHex, Hasher, createHasher,
  baoEncode, baoDecode, PartialBao, HashSequence
} from 'blake3-bao';
import type { BaoEncodeResult, PartialBaoState } from 'blake3-bao/bao';

// Hashing with type inference
const digest: Uint8Array = hash('hello world');
const hex: string = hashHex('hello world');

// Streaming hasher
const hasher: Hasher = createHasher();
hasher.update('hello ').update('world');
const result: Uint8Array = hasher.finalize();

// Bao encoding with typed result
const data = new Uint8Array(2048);
const { encoded, hash: rootHash }: BaoEncodeResult = baoEncode(data);

// Resumable downloads
const partial = new PartialBao(rootHash, data.length);
partial.addChunkGroupTrusted(0, data.slice(0, 16384));
const progress: number = partial.getProgress();

// Hash sequences for collections
const seq = new HashSequence();
seq.addHash(digest).addHash(rootHash);
const collectionHash: Uint8Array = seq.finalize();
```

## Quick Start

```javascript
// CommonJS
const { hash, hashHex, baoEncode, baoDecode, baoSlice, baoDecodeSlice } = require('blake3-bao');

// Or import individual modules
const blake3 = require('blake3-bao/blake3');
const bao = require('blake3-bao/bao');

// ESM
import { hash, hashHex, baoEncode, baoDecode } from 'blake3-bao';
import blake3 from 'blake3-bao/blake3';
import bao from 'blake3-bao/bao';

// Simple hashing
const digest = blake3.hash('hello world');
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

## Iroh Chunk Groups API

Iroh uses chunk groups (16 chunks = 16 KiB) to reduce outboard size by ~16x compared to standard Bao. The root hash is identical, making it compatible with standard Bao verification.

### `baoEncodeIroh(data, outboard = false, chunkGroupLog = 4)`

Encode data with Iroh-compatible chunk groups.

```javascript
const data = new Uint8Array(1024 * 1024);  // 1 MB

// Combined mode (same as standard Bao)
const { encoded, hash } = bao.baoEncodeIroh(data, false);

// Outboard mode (16x smaller than standard!)
const { encoded: outboard, hash } = bao.baoEncodeIroh(data, true);

// Standard Bao outboard: ~64 KB
// Iroh outboard: ~4 KB (16x smaller!)
```

### `baoVerifyIroh(outboard, rootHash, data, chunkGroupLog = 4)`

Verify data against Iroh outboard encoding.

```javascript
const data = new Uint8Array(1024 * 1024);
const { encoded: outboard, hash } = bao.baoEncodeIroh(data, true);

// Verify later
const isValid = bao.baoVerifyIroh(outboard, hash, data);
console.log('Data is valid:', isValid);  // true
```

### `baoDecodeIroh(outboard, rootHash, data, chunkGroupLog = 4)`

Verify and return data (throws on failure).

```javascript
const data = new Uint8Array(1024 * 1024);
const { encoded: outboard, hash } = bao.baoEncodeIroh(data, true);

try {
  const verified = bao.baoDecodeIroh(outboard, hash, data);
  // verified === data (same reference on success)
} catch (e) {
  console.error('Verification failed:', e.message);
}
```

### Helper Functions

```javascript
// Count chunk groups for a given content length
const groups = bao.countChunkGroups(1024 * 1024);  // 64 groups for 1 MB

// Calculate outboard size
const size = bao.irohOutboardSize(1024 * 1024);  // ~4 KB for 1 MB

// Compute chunk group chaining value
const cv = bao.chunkGroupCV(groupData, startChunkIndex, isRoot);
```

### Outboard Size Comparison

| Content Size | Standard Bao | Iroh Outboard | Reduction |
|--------------|--------------|---------------|-----------|
| 100 KB       | 6.2 KB       | 0.4 KB        | 93.8%     |
| 1 MB         | 63.9 KB      | 3.9 KB        | 93.8%     |
| 10 MB        | 639.9 KB     | 39.9 KB       | 93.8%     |
| 100 MB       | 6.4 MB       | 400 KB        | 93.8%     |

---

## PartialBao - Resumable Downloads

The `PartialBao` class enables resumable downloads and multi-source fetching by tracking which chunk groups have been downloaded and verified.

### Basic Usage

```javascript
const bao = require('./bao.js');

// Get hash and size from metadata/header
const rootHash = /* 32-byte hash */;
const contentLen = 1024 * 1024;  // 1 MB

// Create partial download tracker
const partial = new bao.PartialBao(rootHash, contentLen);

console.log('Total groups:', partial.numGroups);  // 64 for 1 MB
console.log('Progress:', partial.getProgress());  // 0%

// Add chunk groups as they're downloaded
partial.addChunkGroupTrusted(0, groupData0);
partial.addChunkGroupTrusted(5, groupData5);

console.log('Progress:', partial.getProgress());  // ~3%
console.log('Missing:', partial.getMissingGroups().length);

// When complete, finalize to get the data
if (partial.isComplete()) {
  const data = partial.finalize();
}
```

### Multi-Source Download

```javascript
// Track what we need
const partial = new bao.PartialBao(rootHash, contentLen);
const needed = partial.getMissingRanges();
// [{start: 0, end: 64}] - need all 64 groups

// Download from source A (has groups 0-31)
for (let i = 0; i < 32; i++) {
  const data = await fetchFromSourceA(i);
  partial.addChunkGroupTrusted(i, data);
}

// Check what's still missing
const stillNeeded = partial.getMissingRanges();
// [{start: 32, end: 64}] - need groups 32-63

// Download remaining from source B
for (const range of stillNeeded) {
  for (let i = range.start; i < range.end; i++) {
    const data = await fetchFromSourceB(i);
    partial.addChunkGroupTrusted(i, data);
  }
}

const complete = partial.finalize();
```

### Resumable Download with Persistence

```javascript
// Start download
const partial = new bao.PartialBao(rootHash, contentLen);

// Download some groups...
partial.addChunkGroupTrusted(0, group0);
partial.addChunkGroupTrusted(1, group1);

// Save state before closing
const state = partial.exportState();
fs.writeFileSync('download.state', JSON.stringify(state));

// --- Later, resume ---

// Restore state
const savedState = JSON.parse(fs.readFileSync('download.state'));
const resumed = bao.PartialBao.importState(savedState);

console.log('Already have:', resumed.receivedGroups);
console.log('Still need:', resumed.getMissingGroups());

// Continue downloading...
```

### With Merkle Proofs

```javascript
// Server creates proofs for each chunk group
const complete = new bao.PartialBao(rootHash, contentLen);
// ... add all groups ...

const proof = complete.createProof(groupIndex);

// Client verifies proof before accepting
const client = new bao.PartialBao(rootHash, contentLen);
client.addChunkGroup(groupIndex, groupData, proof);  // Throws if invalid
```

### PartialBao API Reference

| Method | Description |
|--------|-------------|
| `new PartialBao(rootHash, contentLen, chunkGroupLog?)` | Create tracker |
| `numGroups` | Total number of chunk groups |
| `receivedGroups` | Number of groups received |
| `isComplete()` | Check if all groups received |
| `getProgress()` | Get completion percentage (0-100) |
| `hasGroup(index)` | Check if specific group is present |
| `getGroupSize(index)` | Get expected size of a group |
| `addChunkGroup(index, data, proof)` | Add with Merkle proof verification |
| `addChunkGroupTrusted(index, data)` | Add without proof (trusted source) |
| `getGroupData(index)` | Get data for a group (or null) |
| `getMissingRanges()` | Get `[{start, end}, ...]` of missing groups |
| `getPresentRanges()` | Get `[{start, end}, ...]` of present groups |
| `getMissingGroups()` | Get array of missing group indices |
| `getPresentGroups()` | Get array of present group indices |
| `getBitfield()` | Get bitfield as Uint8Array |
| `setBitfield(bf)` | Set bitfield (for loading state) |
| `finalize(verify?)` | Assemble and return complete data |
| `exportState()` | Export state for serialization |
| `PartialBao.importState(state)` | Import serialized state |
| `createProof(index)` | Create Merkle proof for a group |

### Bitfield Helpers

```javascript
// Create a bitfield for tracking N items
const bf = bao.createBitfield(100);  // 100 bits = 13 bytes

// Set/get/clear individual bits
bao.setBit(bf, 5);
bao.getBit(bf, 5);   // true
bao.clearBit(bf, 5);
bao.getBit(bf, 5);   // false

// Count set bits
bao.countSetBits(bf, 100);  // Number of bits set
```

---

## HashSequence - Blob Collections

Hash sequences are ordered lists of blob hashes representing collections like directories or datasets. The sequence itself has a hash, allowing the entire collection to be verified with one hash.

### Basic Usage

```javascript
const bao = require('./bao.js');
const blake3 = require('./blake3.js');

// Create a collection of files
const seq = new bao.HashSequence();

// Add hashes of individual files
seq.addHash(blake3.hash(file1Data));
seq.addHash(blake3.hash(file2Data));
seq.addHash(blake3.hash(file3Data));

// Get the collection hash (verifies entire collection)
const collectionHash = seq.finalize();
console.log('Collection hash:', seq.finalizeHex());

// Check collection contents
console.log('Files in collection:', seq.length);
console.log('Has file1:', seq.hasHash(file1Hash));
console.log('File1 index:', seq.indexOf(file1Hash));
```

### Serialization

```javascript
// Serialize for storage/transmission
const bytes = seq.toBytes();  // 4-byte count + concatenated hashes

// Deserialize
const restored = bao.HashSequence.fromBytes(bytes);

// JSON serialization
const json = seq.toJSON();
const fromJson = bao.HashSequence.fromJSON(json);

// Hex string input
const seq2 = bao.HashSequence.fromHex([
  '0123456789abcdef...', // 64-char hex strings
  'fedcba9876543210...'
]);
```

### Sequence Format (Matching Iroh)

| Field | Size | Description |
|-------|------|-------------|
| Count | 4 bytes | Little-endian number of hashes |
| Hashes | N × 32 bytes | Concatenated 32-byte hashes |

Total size: `4 + (count × 32)` bytes

### HashSequence API Reference

| Method | Description |
|--------|-------------|
| `new HashSequence([hashes])` | Create sequence, optionally with initial hashes |
| `addHash(hash)` | Add 32-byte hash, returns this |
| `length` | Number of hashes in sequence |
| `getHash(index)` | Get hash at index (copy) |
| `getHashHex(index)` | Get hash at index as hex string |
| `hasHash(hash)` | Check if hash exists in sequence |
| `indexOf(hash)` | Find index of hash (-1 if not found) |
| `[Symbol.iterator]` | Iterate over hashes (for...of) |
| `toArray()` | Get all hashes as array |
| `finalize()` | Get BLAKE3 hash of the sequence |
| `finalizeHex()` | Get sequence hash as hex string |
| `toBytes()` | Serialize to bytes |
| `fromBytes(bytes)` | Deserialize from bytes (static) |
| `from(hashes)` | Create from hash array (static) |
| `fromHex(hexStrings)` | Create from hex strings (static) |
| `toJSON()` | Export to JSON-serializable object |
| `fromJSON(json)` | Create from JSON object (static) |
| `clear()` | Remove all hashes |
| `removeAt(index)` | Remove and return hash at index |
| `insertAt(index, hash)` | Insert hash at index |
| `slice(start, end?)` | Create new sequence with slice |
| `concat(other)` | Create new sequence combining both |
| `equals(other)` | Check if sequences are equal |

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
| `test-bao-*.js` | Bao test suites (930 tests total) |
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
| Bao Iroh chunk groups | 54 |
| Bao resumable downloads | 55 |
| Bao hash sequences | 72 |
| Bao official vectors | 574 |
| **Total** | **1,158** |

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
- [Iroh Bao Format](https://iroh.computer/) - Chunk group optimization for smaller outboard
- [Fleek Network Case Study](https://blog.fleek.network/post/fleek-network-blake3-case-study/)

## License

MIT

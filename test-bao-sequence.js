/**
 * Tests for HashSequence - Blob Collections
 *
 * Hash sequences are ordered lists of blob hashes representing collections
 * like directories or datasets. The sequence itself has a hash for verification.
 */

const bao = require('./bao.js');
const blake3 = require('./blake3.js');

// Test helper functions
function toHex(bytes) {
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

function fromHex(hex) {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
  }
  return bytes;
}

// Generate a random-looking hash for testing
function generateHash(seed) {
  const data = new Uint8Array(4);
  data[0] = seed & 0xff;
  data[1] = (seed >> 8) & 0xff;
  data[2] = (seed >> 16) & 0xff;
  data[3] = (seed >> 24) & 0xff;
  return blake3.hash(data);
}

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`PASS: ${name}`);
    passed++;
  } catch (e) {
    console.log(`FAIL: ${name}`);
    console.log(`  Error: ${e.message}`);
    failed++;
  }
}

function assertEqual(actual, expected, msg) {
  if (actual !== expected) {
    throw new Error(`${msg}\n  Expected: ${expected}\n  Got: ${actual}`);
  }
}

function assertArrayEqual(actual, expected, msg) {
  if (actual.length !== expected.length) {
    throw new Error(`${msg}\n  Length mismatch: ${actual.length} vs ${expected.length}`);
  }
  for (let i = 0; i < actual.length; i++) {
    if (actual[i] !== expected[i]) {
      throw new Error(`${msg}\n  Mismatch at index ${i}: ${actual[i]} vs ${expected[i]}`);
    }
  }
}

console.log('HashSequence Tests - Blob Collections');
console.log('=====================================\n');

// ============================
// Constructor Tests
// ============================
console.log('--- Constructor Tests ---\n');

test('Constructor: empty sequence', () => {
  const seq = new bao.HashSequence();
  assertEqual(seq.length, 0, 'Should have 0 hashes');
});

test('Constructor: with initial hashes', () => {
  const hash1 = generateHash(1);
  const hash2 = generateHash(2);
  const seq = new bao.HashSequence([hash1, hash2]);
  assertEqual(seq.length, 2, 'Should have 2 hashes');
});

test('Constructor: rejects invalid hashes', () => {
  let threw = false;
  try {
    new bao.HashSequence([new Uint8Array(16)]);  // Wrong size
  } catch (e) {
    threw = true;
  }
  assertEqual(threw, true, 'Should reject invalid hash size');
});

// ============================
// addHash Tests
// ============================
console.log('\n--- addHash Tests ---\n');

test('addHash: adds hash to sequence', () => {
  const seq = new bao.HashSequence();
  const hash = generateHash(1);
  seq.addHash(hash);
  assertEqual(seq.length, 1, 'Should have 1 hash');
});

test('addHash: returns this for chaining', () => {
  const seq = new bao.HashSequence();
  const result = seq.addHash(generateHash(1)).addHash(generateHash(2));
  assertEqual(result, seq, 'Should return this');
  assertEqual(seq.length, 2, 'Should have 2 hashes');
});

test('addHash: rejects non-Uint8Array', () => {
  const seq = new bao.HashSequence();
  let threw = false;
  try {
    seq.addHash([1, 2, 3]);
  } catch (e) {
    threw = true;
  }
  assertEqual(threw, true, 'Should reject non-Uint8Array');
});

test('addHash: rejects wrong size', () => {
  const seq = new bao.HashSequence();
  let threw = false;
  try {
    seq.addHash(new Uint8Array(16));
  } catch (e) {
    threw = true;
  }
  assertEqual(threw, true, 'Should reject wrong size');
});

test('addHash: copies the hash', () => {
  const seq = new bao.HashSequence();
  const hash = generateHash(1);
  seq.addHash(hash);
  hash[0] ^= 0xff;  // Modify original
  const stored = seq.getHash(0);
  assertEqual(stored[0] !== hash[0], true, 'Should store a copy');
});

// ============================
// getHash Tests
// ============================
console.log('\n--- getHash Tests ---\n');

test('getHash: returns correct hash', () => {
  const hash1 = generateHash(1);
  const hash2 = generateHash(2);
  const seq = new bao.HashSequence([hash1, hash2]);

  assertArrayEqual(seq.getHash(0), hash1, 'Index 0 should match');
  assertArrayEqual(seq.getHash(1), hash2, 'Index 1 should match');
});

test('getHash: returns copy', () => {
  const hash = generateHash(1);
  const seq = new bao.HashSequence([hash]);

  const retrieved = seq.getHash(0);
  retrieved[0] ^= 0xff;

  const again = seq.getHash(0);
  assertArrayEqual(again, hash, 'Should not modify stored hash');
});

test('getHash: throws on invalid index', () => {
  const seq = new bao.HashSequence([generateHash(1)]);

  let threw = false;
  try {
    seq.getHash(-1);
  } catch (e) {
    threw = true;
  }
  assertEqual(threw, true, 'Should throw on negative index');

  threw = false;
  try {
    seq.getHash(5);
  } catch (e) {
    threw = true;
  }
  assertEqual(threw, true, 'Should throw on out-of-bounds index');
});

// ============================
// hasHash / indexOf Tests
// ============================
console.log('\n--- hasHash / indexOf Tests ---\n');

test('hasHash: finds existing hash', () => {
  const hash1 = generateHash(1);
  const hash2 = generateHash(2);
  const seq = new bao.HashSequence([hash1, hash2]);

  assertEqual(seq.hasHash(hash1), true, 'Should find hash1');
  assertEqual(seq.hasHash(hash2), true, 'Should find hash2');
});

test('hasHash: returns false for missing hash', () => {
  const hash1 = generateHash(1);
  const hash2 = generateHash(2);
  const hash3 = generateHash(3);
  const seq = new bao.HashSequence([hash1, hash2]);

  assertEqual(seq.hasHash(hash3), false, 'Should not find hash3');
});

test('hasHash: handles invalid input', () => {
  const seq = new bao.HashSequence([generateHash(1)]);

  assertEqual(seq.hasHash(null), false, 'Should return false for null');
  assertEqual(seq.hasHash(new Uint8Array(16)), false, 'Should return false for wrong size');
});

test('indexOf: returns correct index', () => {
  const hash1 = generateHash(1);
  const hash2 = generateHash(2);
  const hash3 = generateHash(3);
  const seq = new bao.HashSequence([hash1, hash2, hash3]);

  assertEqual(seq.indexOf(hash1), 0, 'hash1 at index 0');
  assertEqual(seq.indexOf(hash2), 1, 'hash2 at index 1');
  assertEqual(seq.indexOf(hash3), 2, 'hash3 at index 2');
});

test('indexOf: returns -1 for missing hash', () => {
  const seq = new bao.HashSequence([generateHash(1)]);
  assertEqual(seq.indexOf(generateHash(2)), -1, 'Should return -1');
});

// ============================
// Iterator Tests
// ============================
console.log('\n--- Iterator Tests ---\n');

test('Iterator: iterates over all hashes', () => {
  const hashes = [generateHash(1), generateHash(2), generateHash(3)];
  const seq = new bao.HashSequence(hashes);

  const collected = [];
  for (const hash of seq) {
    collected.push(hash);
  }

  assertEqual(collected.length, 3, 'Should iterate 3 times');
  for (let i = 0; i < 3; i++) {
    assertArrayEqual(collected[i], hashes[i], `Hash ${i} should match`);
  }
});

test('Iterator: empty sequence', () => {
  const seq = new bao.HashSequence();
  const collected = [...seq];
  assertEqual(collected.length, 0, 'Should be empty');
});

test('Iterator: yields copies', () => {
  const hash = generateHash(1);
  const seq = new bao.HashSequence([hash]);

  for (const h of seq) {
    h[0] ^= 0xff;  // Modify yielded value
  }

  assertArrayEqual(seq.getHash(0), hash, 'Should not modify stored hash');
});

// ============================
// toArray Tests
// ============================
console.log('\n--- toArray Tests ---\n');

test('toArray: returns array of hashes', () => {
  const hashes = [generateHash(1), generateHash(2)];
  const seq = new bao.HashSequence(hashes);

  const arr = seq.toArray();
  assertEqual(arr.length, 2, 'Should have 2 elements');
  assertArrayEqual(arr[0], hashes[0], 'First hash should match');
  assertArrayEqual(arr[1], hashes[1], 'Second hash should match');
});

test('toArray: returns copies', () => {
  const hash = generateHash(1);
  const seq = new bao.HashSequence([hash]);

  const arr = seq.toArray();
  arr[0][0] ^= 0xff;

  assertArrayEqual(seq.getHash(0), hash, 'Should not modify stored hash');
});

// ============================
// finalize Tests
// ============================
console.log('\n--- finalize Tests ---\n');

test('finalize: returns 32-byte hash', () => {
  const seq = new bao.HashSequence([generateHash(1), generateHash(2)]);
  const hash = seq.finalize();
  assertEqual(hash.length, 32, 'Should be 32 bytes');
});

test('finalize: empty sequence', () => {
  const seq = new bao.HashSequence();
  const hash = seq.finalize();
  assertEqual(hash.length, 32, 'Should be 32 bytes');
});

test('finalize: deterministic', () => {
  const hashes = [generateHash(1), generateHash(2), generateHash(3)];

  const seq1 = new bao.HashSequence(hashes);
  const seq2 = new bao.HashSequence(hashes);

  const hash1 = seq1.finalize();
  const hash2 = seq2.finalize();

  assertArrayEqual(hash1, hash2, 'Same sequence should produce same hash');
});

test('finalize: different sequences produce different hashes', () => {
  const seq1 = new bao.HashSequence([generateHash(1), generateHash(2)]);
  const seq2 = new bao.HashSequence([generateHash(2), generateHash(1)]);  // Different order

  const hash1 = seq1.finalize();
  const hash2 = seq2.finalize();

  let same = true;
  for (let i = 0; i < 32; i++) {
    if (hash1[i] !== hash2[i]) {
      same = false;
      break;
    }
  }
  assertEqual(same, false, 'Different order should produce different hash');
});

test('finalize: matches BLAKE3 of serialized bytes', () => {
  const hashes = [generateHash(1), generateHash(2)];
  const seq = new bao.HashSequence(hashes);

  const serialized = seq.toBytes();
  const expected = blake3.hash(serialized);
  const actual = seq.finalize();

  assertArrayEqual(actual, expected, 'Should match BLAKE3 of toBytes()');
});

test('finalizeHex: returns hex string', () => {
  const seq = new bao.HashSequence([generateHash(1)]);
  const hex = seq.finalizeHex();
  assertEqual(typeof hex, 'string', 'Should be a string');
  assertEqual(hex.length, 64, 'Should be 64 characters');
});

// ============================
// toBytes / fromBytes Tests
// ============================
console.log('\n--- toBytes / fromBytes Tests ---\n');

test('toBytes: empty sequence', () => {
  const seq = new bao.HashSequence();
  const bytes = seq.toBytes();
  assertEqual(bytes.length, 4, 'Empty should be just 4-byte header');
  assertEqual(bytes[0], 0, 'Count should be 0');
  assertEqual(bytes[1], 0, 'Count should be 0');
  assertEqual(bytes[2], 0, 'Count should be 0');
  assertEqual(bytes[3], 0, 'Count should be 0');
});

test('toBytes: single hash', () => {
  const hash = generateHash(1);
  const seq = new bao.HashSequence([hash]);
  const bytes = seq.toBytes();

  assertEqual(bytes.length, 4 + 32, 'Should be 36 bytes');
  assertEqual(bytes[0], 1, 'Count should be 1');
  assertEqual(bytes[1], 0, 'Count high bytes should be 0');
  assertArrayEqual(bytes.subarray(4, 36), hash, 'Hash should follow header');
});

test('toBytes: multiple hashes', () => {
  const hashes = [generateHash(1), generateHash(2), generateHash(3)];
  const seq = new bao.HashSequence(hashes);
  const bytes = seq.toBytes();

  assertEqual(bytes.length, 4 + 3 * 32, 'Should be 100 bytes');
  assertEqual(bytes[0], 3, 'Count should be 3');

  for (let i = 0; i < 3; i++) {
    const start = 4 + i * 32;
    assertArrayEqual(bytes.subarray(start, start + 32), hashes[i], `Hash ${i} should match`);
  }
});

test('toBytes: large count (little-endian)', () => {
  const seq = new bao.HashSequence();
  // Add 256 + 1 hashes
  for (let i = 0; i < 257; i++) {
    seq.addHash(generateHash(i));
  }
  const bytes = seq.toBytes();

  // 257 in little-endian = 0x01, 0x01, 0x00, 0x00
  assertEqual(bytes[0], 1, 'Low byte should be 1');
  assertEqual(bytes[1], 1, 'Second byte should be 1');
  assertEqual(bytes[2], 0, 'Third byte should be 0');
  assertEqual(bytes[3], 0, 'Fourth byte should be 0');
});

test('fromBytes: empty sequence', () => {
  const bytes = new Uint8Array([0, 0, 0, 0]);
  const seq = bao.HashSequence.fromBytes(bytes);
  assertEqual(seq.length, 0, 'Should be empty');
});

test('fromBytes: single hash', () => {
  const hash = generateHash(1);
  const bytes = new Uint8Array(36);
  bytes[0] = 1;
  bytes.set(hash, 4);

  const seq = bao.HashSequence.fromBytes(bytes);
  assertEqual(seq.length, 1, 'Should have 1 hash');
  assertArrayEqual(seq.getHash(0), hash, 'Hash should match');
});

test('fromBytes: multiple hashes', () => {
  const hashes = [generateHash(1), generateHash(2)];
  const bytes = new Uint8Array(4 + 64);
  bytes[0] = 2;
  bytes.set(hashes[0], 4);
  bytes.set(hashes[1], 36);

  const seq = bao.HashSequence.fromBytes(bytes);
  assertEqual(seq.length, 2, 'Should have 2 hashes');
  assertArrayEqual(seq.getHash(0), hashes[0], 'Hash 0 should match');
  assertArrayEqual(seq.getHash(1), hashes[1], 'Hash 1 should match');
});

test('fromBytes: rejects non-Uint8Array', () => {
  let threw = false;
  try {
    bao.HashSequence.fromBytes([0, 0, 0, 0]);
  } catch (e) {
    threw = true;
  }
  assertEqual(threw, true, 'Should reject array');
});

test('fromBytes: rejects too short', () => {
  let threw = false;
  try {
    bao.HashSequence.fromBytes(new Uint8Array([0, 0, 0]));
  } catch (e) {
    threw = true;
  }
  assertEqual(threw, true, 'Should reject < 4 bytes');
});

test('fromBytes: rejects wrong size', () => {
  const bytes = new Uint8Array(36);
  bytes[0] = 2;  // Claims 2 hashes but only has space for 1

  let threw = false;
  try {
    bao.HashSequence.fromBytes(bytes);
  } catch (e) {
    threw = true;
  }
  assertEqual(threw, true, 'Should reject mismatched size');
});

test('toBytes/fromBytes: round-trip', () => {
  const hashes = [generateHash(1), generateHash(2), generateHash(3)];
  const original = new bao.HashSequence(hashes);

  const bytes = original.toBytes();
  const restored = bao.HashSequence.fromBytes(bytes);

  assertEqual(restored.length, original.length, 'Length should match');
  for (let i = 0; i < original.length; i++) {
    assertArrayEqual(restored.getHash(i), original.getHash(i), `Hash ${i} should match`);
  }
});

test('toBytes/fromBytes: round-trip preserves finalize hash', () => {
  const hashes = [generateHash(1), generateHash(2)];
  const original = new bao.HashSequence(hashes);
  const originalHash = original.finalize();

  const bytes = original.toBytes();
  const restored = bao.HashSequence.fromBytes(bytes);
  const restoredHash = restored.finalize();

  assertArrayEqual(restoredHash, originalHash, 'Finalize hash should match');
});

// ============================
// Static from / fromHex Tests
// ============================
console.log('\n--- Static from / fromHex Tests ---\n');

test('static from: creates sequence from array', () => {
  const hashes = [generateHash(1), generateHash(2)];
  const seq = bao.HashSequence.from(hashes);

  assertEqual(seq.length, 2, 'Should have 2 hashes');
  assertArrayEqual(seq.getHash(0), hashes[0], 'Hash 0 should match');
});

test('static fromHex: creates sequence from hex strings', () => {
  const hash1 = generateHash(1);
  const hash2 = generateHash(2);
  const hex1 = toHex(hash1);
  const hex2 = toHex(hash2);

  const seq = bao.HashSequence.fromHex([hex1, hex2]);

  assertEqual(seq.length, 2, 'Should have 2 hashes');
  assertArrayEqual(seq.getHash(0), hash1, 'Hash 0 should match');
  assertArrayEqual(seq.getHash(1), hash2, 'Hash 1 should match');
});

test('static fromHex: rejects invalid hex', () => {
  let threw = false;
  try {
    bao.HashSequence.fromHex(['abc']);  // Too short
  } catch (e) {
    threw = true;
  }
  assertEqual(threw, true, 'Should reject invalid hex length');
});

// ============================
// JSON Serialization Tests
// ============================
console.log('\n--- JSON Serialization Tests ---\n');

test('toJSON: returns object with hashes array', () => {
  const hashes = [generateHash(1), generateHash(2)];
  const seq = new bao.HashSequence(hashes);
  const json = seq.toJSON();

  assertEqual(Array.isArray(json.hashes), true, 'Should have hashes array');
  assertEqual(json.hashes.length, 2, 'Should have 2 hashes');
  assertEqual(typeof json.hashes[0], 'string', 'Should be hex strings');
  assertEqual(json.hashes[0].length, 64, 'Should be 64 char hex');
});

test('fromJSON: creates sequence from JSON', () => {
  const hashes = [generateHash(1), generateHash(2)];
  const original = new bao.HashSequence(hashes);
  const json = original.toJSON();

  const restored = bao.HashSequence.fromJSON(json);

  assertEqual(restored.length, 2, 'Should have 2 hashes');
  assertArrayEqual(restored.getHash(0), hashes[0], 'Hash 0 should match');
  assertArrayEqual(restored.getHash(1), hashes[1], 'Hash 1 should match');
});

test('JSON.stringify/parse round-trip', () => {
  const hashes = [generateHash(1), generateHash(2), generateHash(3)];
  const original = new bao.HashSequence(hashes);

  const jsonStr = JSON.stringify(original.toJSON());
  const parsed = JSON.parse(jsonStr);
  const restored = bao.HashSequence.fromJSON(parsed);

  assertEqual(restored.equals(original), true, 'Should be equal after round-trip');
});

test('fromJSON: rejects invalid input', () => {
  let threw = false;
  try {
    bao.HashSequence.fromJSON({});
  } catch (e) {
    threw = true;
  }
  assertEqual(threw, true, 'Should reject missing hashes');

  threw = false;
  try {
    bao.HashSequence.fromJSON({ hashes: 'not-array' });
  } catch (e) {
    threw = true;
  }
  assertEqual(threw, true, 'Should reject non-array hashes');
});

// ============================
// getHashHex Tests
// ============================
console.log('\n--- getHashHex Tests ---\n');

test('getHashHex: returns hex string', () => {
  const hash = generateHash(1);
  const seq = new bao.HashSequence([hash]);

  const hex = seq.getHashHex(0);
  assertEqual(typeof hex, 'string', 'Should be string');
  assertEqual(hex.length, 64, 'Should be 64 chars');
  assertEqual(hex, toHex(hash), 'Should match expected hex');
});

// ============================
// Modification Tests
// ============================
console.log('\n--- Modification Tests ---\n');

test('clear: removes all hashes', () => {
  const seq = new bao.HashSequence([generateHash(1), generateHash(2)]);
  seq.clear();
  assertEqual(seq.length, 0, 'Should be empty');
});

test('clear: returns this', () => {
  const seq = new bao.HashSequence([generateHash(1)]);
  const result = seq.clear();
  assertEqual(result, seq, 'Should return this');
});

test('removeAt: removes hash at index', () => {
  const hashes = [generateHash(1), generateHash(2), generateHash(3)];
  const seq = new bao.HashSequence(hashes);

  const removed = seq.removeAt(1);
  assertEqual(seq.length, 2, 'Should have 2 hashes');
  assertArrayEqual(removed, hashes[1], 'Should return removed hash');
  assertArrayEqual(seq.getHash(0), hashes[0], 'First should remain');
  assertArrayEqual(seq.getHash(1), hashes[2], 'Third should shift down');
});

test('removeAt: throws on invalid index', () => {
  const seq = new bao.HashSequence([generateHash(1)]);

  let threw = false;
  try {
    seq.removeAt(5);
  } catch (e) {
    threw = true;
  }
  assertEqual(threw, true, 'Should throw on invalid index');
});

test('insertAt: inserts at beginning', () => {
  const hash1 = generateHash(1);
  const hash2 = generateHash(2);
  const seq = new bao.HashSequence([hash2]);

  seq.insertAt(0, hash1);

  assertEqual(seq.length, 2, 'Should have 2 hashes');
  assertArrayEqual(seq.getHash(0), hash1, 'First should be hash1');
  assertArrayEqual(seq.getHash(1), hash2, 'Second should be hash2');
});

test('insertAt: inserts in middle', () => {
  const hashes = [generateHash(1), generateHash(3)];
  const middle = generateHash(2);
  const seq = new bao.HashSequence(hashes);

  seq.insertAt(1, middle);

  assertEqual(seq.length, 3, 'Should have 3 hashes');
  assertArrayEqual(seq.getHash(1), middle, 'Middle should be inserted');
});

test('insertAt: inserts at end', () => {
  const hash1 = generateHash(1);
  const hash2 = generateHash(2);
  const seq = new bao.HashSequence([hash1]);

  seq.insertAt(1, hash2);

  assertEqual(seq.length, 2, 'Should have 2 hashes');
  assertArrayEqual(seq.getHash(1), hash2, 'Should be at end');
});

test('insertAt: returns this', () => {
  const seq = new bao.HashSequence();
  const result = seq.insertAt(0, generateHash(1));
  assertEqual(result, seq, 'Should return this');
});

// ============================
// slice Tests
// ============================
console.log('\n--- slice Tests ---\n');

test('slice: returns new sequence', () => {
  const hashes = [generateHash(1), generateHash(2), generateHash(3)];
  const seq = new bao.HashSequence(hashes);

  const sliced = seq.slice(1, 3);

  assertEqual(sliced.length, 2, 'Should have 2 hashes');
  assertArrayEqual(sliced.getHash(0), hashes[1], 'First should be hash[1]');
  assertArrayEqual(sliced.getHash(1), hashes[2], 'Second should be hash[2]');
});

test('slice: original unchanged', () => {
  const hashes = [generateHash(1), generateHash(2)];
  const seq = new bao.HashSequence(hashes);

  seq.slice(0, 1);

  assertEqual(seq.length, 2, 'Original should still have 2');
});

test('slice: defaults to end', () => {
  const hashes = [generateHash(1), generateHash(2), generateHash(3)];
  const seq = new bao.HashSequence(hashes);

  const sliced = seq.slice(1);

  assertEqual(sliced.length, 2, 'Should have 2 hashes');
});

// ============================
// concat Tests
// ============================
console.log('\n--- concat Tests ---\n');

test('concat: combines sequences', () => {
  const seq1 = new bao.HashSequence([generateHash(1)]);
  const seq2 = new bao.HashSequence([generateHash(2), generateHash(3)]);

  const combined = seq1.concat(seq2);

  assertEqual(combined.length, 3, 'Should have 3 hashes');
});

test('concat: originals unchanged', () => {
  const seq1 = new bao.HashSequence([generateHash(1)]);
  const seq2 = new bao.HashSequence([generateHash(2)]);

  seq1.concat(seq2);

  assertEqual(seq1.length, 1, 'seq1 should still have 1');
  assertEqual(seq2.length, 1, 'seq2 should still have 1');
});

test('concat: rejects non-HashSequence', () => {
  const seq = new bao.HashSequence();

  let threw = false;
  try {
    seq.concat([]);
  } catch (e) {
    threw = true;
  }
  assertEqual(threw, true, 'Should reject array');
});

// ============================
// equals Tests
// ============================
console.log('\n--- equals Tests ---\n');

test('equals: same sequence', () => {
  const hashes = [generateHash(1), generateHash(2)];
  const seq1 = new bao.HashSequence(hashes);
  const seq2 = new bao.HashSequence(hashes);

  assertEqual(seq1.equals(seq2), true, 'Should be equal');
});

test('equals: different length', () => {
  const seq1 = new bao.HashSequence([generateHash(1)]);
  const seq2 = new bao.HashSequence([generateHash(1), generateHash(2)]);

  assertEqual(seq1.equals(seq2), false, 'Should not be equal');
});

test('equals: different hashes', () => {
  const seq1 = new bao.HashSequence([generateHash(1)]);
  const seq2 = new bao.HashSequence([generateHash(2)]);

  assertEqual(seq1.equals(seq2), false, 'Should not be equal');
});

test('equals: different order', () => {
  const seq1 = new bao.HashSequence([generateHash(1), generateHash(2)]);
  const seq2 = new bao.HashSequence([generateHash(2), generateHash(1)]);

  assertEqual(seq1.equals(seq2), false, 'Order matters');
});

test('equals: non-HashSequence', () => {
  const seq = new bao.HashSequence([generateHash(1)]);

  assertEqual(seq.equals({}), false, 'Should return false for non-HashSequence');
  assertEqual(seq.equals(null), false, 'Should return false for null');
});

test('equals: empty sequences', () => {
  const seq1 = new bao.HashSequence();
  const seq2 = new bao.HashSequence();

  assertEqual(seq1.equals(seq2), true, 'Empty sequences should be equal');
});

// ============================
// Integration Tests
// ============================
console.log('\n--- Integration Tests ---\n');

test('Integration: create collection from files', () => {
  // Simulate creating a collection from multiple files
  const files = ['file1.txt', 'file2.txt', 'file3.txt'];
  const seq = new bao.HashSequence();

  for (const file of files) {
    // Hash file content (simulated)
    const content = new TextEncoder().encode(file);
    const hash = blake3.hash(content);
    seq.addHash(hash);
  }

  // Get collection hash
  const collectionHash = seq.finalize();

  assertEqual(seq.length, 3, 'Should have 3 files');
  assertEqual(collectionHash.length, 32, 'Should have collection hash');

  // Verify we can find files
  const file1Hash = blake3.hash(new TextEncoder().encode('file1.txt'));
  assertEqual(seq.hasHash(file1Hash), true, 'Should find file1');
  assertEqual(seq.indexOf(file1Hash), 0, 'file1 should be at index 0');
});

test('Integration: verify collection integrity', () => {
  // Create original collection
  const hashes = [generateHash(1), generateHash(2), generateHash(3)];
  const original = new bao.HashSequence(hashes);
  const originalHash = original.finalize();

  // Serialize and "transmit"
  const bytes = original.toBytes();

  // "Receive" and verify
  const received = bao.HashSequence.fromBytes(bytes);
  const receivedHash = received.finalize();

  assertArrayEqual(receivedHash, originalHash, 'Collection hash should match');
  assertEqual(received.equals(original), true, 'Collections should be equal');
});

test('Integration: large collection', () => {
  const seq = new bao.HashSequence();

  // Add 1000 hashes
  for (let i = 0; i < 1000; i++) {
    seq.addHash(generateHash(i));
  }

  assertEqual(seq.length, 1000, 'Should have 1000 hashes');

  // Serialize and deserialize
  const bytes = seq.toBytes();
  assertEqual(bytes.length, 4 + 1000 * 32, 'Should be correct size');

  const restored = bao.HashSequence.fromBytes(bytes);
  assertEqual(restored.length, 1000, 'Restored should have 1000 hashes');

  // Finalize should work
  const hash = restored.finalize();
  assertEqual(hash.length, 32, 'Should produce hash');
});

// ============================
// Edge Cases
// ============================
console.log('\n--- Edge Cases ---\n');

test('Edge: duplicate hashes allowed', () => {
  const hash = generateHash(1);
  const seq = new bao.HashSequence([hash, hash, hash]);

  assertEqual(seq.length, 3, 'Should allow duplicates');
  assertEqual(seq.indexOf(hash), 0, 'indexOf returns first occurrence');
});

test('Edge: very long sequence (65536 hashes)', () => {
  const seq = new bao.HashSequence();

  // Add 65536 hashes (tests 2-byte count handling)
  for (let i = 0; i < 65536; i++) {
    seq.addHash(generateHash(i));
  }

  assertEqual(seq.length, 65536, 'Should have 65536 hashes');

  const bytes = seq.toBytes();
  // Count in LE: 0x00, 0x00, 0x01, 0x00 = 65536
  assertEqual(bytes[0], 0, 'Low byte');
  assertEqual(bytes[1], 0, 'Second byte');
  assertEqual(bytes[2], 1, 'Third byte');
  assertEqual(bytes[3], 0, 'Fourth byte');
});

// ============================
// Summary
// ============================
console.log('\n=====================================');
console.log(`Results: ${passed} passed, ${failed} failed`);

if (failed === 0) {
  console.log('\nAll HashSequence tests passed!');
} else {
  console.log('\nSome tests failed.');
  process.exit(1);
}

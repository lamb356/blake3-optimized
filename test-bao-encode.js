/**
 * Tests for Bao encoding functions
 */

const blake3 = require('./blake3.js');
const bao = require('./bao.js');

function toHex(bytes) {
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

function generateTestInput(length) {
  const input = new Uint8Array(length);
  for (let i = 0; i < length; i++) {
    input[i] = i % 251;
  }
  return input;
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

console.log('Bao Encoding Tests');
console.log('==================\n');

// ============================
// encodeLen / decodeLen Tests
// ============================
console.log('--- encodeLen/decodeLen Tests ---\n');

test('encodeLen(0) roundtrips correctly', () => {
  const encoded = bao.encodeLen(0);
  assertEqual(encoded.length, 8, 'Should be 8 bytes');
  assertEqual(bao.decodeLen(encoded), 0, 'Should decode to 0');
});

test('encodeLen(1) roundtrips correctly', () => {
  const encoded = bao.encodeLen(1);
  assertEqual(bao.decodeLen(encoded), 1, 'Should decode to 1');
  assertEqual(encoded[0], 1, 'First byte should be 1');
  for (let i = 1; i < 8; i++) {
    assertEqual(encoded[i], 0, `Byte ${i} should be 0`);
  }
});

test('encodeLen(256) roundtrips correctly', () => {
  const encoded = bao.encodeLen(256);
  assertEqual(bao.decodeLen(encoded), 256, 'Should decode to 256');
  assertEqual(encoded[0], 0, 'First byte should be 0');
  assertEqual(encoded[1], 1, 'Second byte should be 1');
});

test('encodeLen(2049) matches expected', () => {
  // 2049 = 0x0801 in little-endian: 01 08 00 00 00 00 00 00
  const encoded = bao.encodeLen(2049);
  assertEqual(encoded[0], 0x01, 'Byte 0');
  assertEqual(encoded[1], 0x08, 'Byte 1');
  assertEqual(bao.decodeLen(encoded), 2049, 'Roundtrip');
});

test('encodeLen large number roundtrips', () => {
  const large = 1000000000; // 1 billion
  const encoded = bao.encodeLen(large);
  assertEqual(bao.decodeLen(encoded), large, 'Should roundtrip large number');
});

// ============================
// baoEncode Basic Tests
// ============================
console.log('\n--- baoEncode Basic Tests ---\n');

test('baoEncode returns hash matching blake3.hash for empty input', () => {
  const data = new Uint8Array(0);
  const result = bao.baoEncode(data);
  const expected = blake3.hash(data);
  assertArrayEqual(result.hash, expected, 'Hash mismatch');
});

test('baoEncode returns hash matching blake3.hash for 1 byte', () => {
  const data = new Uint8Array([0x42]);
  const result = bao.baoEncode(data);
  const expected = blake3.hash(data);
  assertArrayEqual(result.hash, expected, 'Hash mismatch');
});

test('baoEncode returns hash matching blake3.hash for 100 bytes', () => {
  const data = generateTestInput(100);
  const result = bao.baoEncode(data);
  const expected = blake3.hash(data);
  assertArrayEqual(result.hash, expected, 'Hash mismatch');
});

test('baoEncode returns hash matching blake3.hash for 1024 bytes', () => {
  const data = generateTestInput(1024);
  const result = bao.baoEncode(data);
  const expected = blake3.hash(data);
  assertArrayEqual(result.hash, expected, 'Hash mismatch');
});

test('baoEncode returns hash matching blake3.hash for 2048 bytes', () => {
  const data = generateTestInput(2048);
  const result = bao.baoEncode(data);
  const expected = blake3.hash(data);
  assertArrayEqual(result.hash, expected, 'Hash mismatch');
});

test('baoEncode returns hash matching blake3.hash for 2049 bytes', () => {
  const data = generateTestInput(2049);
  const result = bao.baoEncode(data);
  const expected = blake3.hash(data);
  assertArrayEqual(result.hash, expected, 'Hash mismatch');
});

test('baoEncode returns hash matching blake3.hash for 100KB', () => {
  const data = generateTestInput(102400);
  const result = bao.baoEncode(data);
  const expected = blake3.hash(data);
  assertArrayEqual(result.hash, expected, 'Hash mismatch');
});

// ============================
// Encoding Format Tests
// ============================
console.log('\n--- Encoding Format Tests ---\n');

test('Empty input: encoded = [8-byte header] only', () => {
  const data = new Uint8Array(0);
  const result = bao.baoEncode(data);
  assertEqual(result.encoded.length, 8, 'Empty encoding is just header');
  assertEqual(bao.decodeLen(result.encoded.subarray(0, 8)), 0, 'Header says length 0');
});

test('Single chunk: encoded = [header] + [chunk data]', () => {
  const data = generateTestInput(100);
  const result = bao.baoEncode(data);
  // Format: 8-byte header + 100 bytes data = 108 bytes
  assertEqual(result.encoded.length, 8 + 100, 'Single chunk size');
  assertEqual(bao.decodeLen(result.encoded.subarray(0, 8)), 100, 'Header length');
  // Data should be at offset 8
  assertArrayEqual(result.encoded.subarray(8), data, 'Chunk data preserved');
});

test('Two chunks: encoded = [header] + [parent node] + [chunk0] + [chunk1]', () => {
  const data = generateTestInput(2048);
  const result = bao.baoEncode(data);
  // Format: 8-byte header + 64-byte parent + 2048 bytes data = 2120 bytes
  assertEqual(result.encoded.length, 8 + 64 + 2048, 'Two chunk size');
  assertEqual(bao.decodeLen(result.encoded.subarray(0, 8)), 2048, 'Header length');

  // Parent node is at offset 8, 64 bytes
  const parentNode = result.encoded.subarray(8, 72);
  assertEqual(parentNode.length, 64, 'Parent node is 64 bytes');

  // Chunk data follows parent
  assertArrayEqual(result.encoded.subarray(72, 72 + 1024), data.subarray(0, 1024), 'Chunk 0');
  assertArrayEqual(result.encoded.subarray(72 + 1024), data.subarray(1024), 'Chunk 1');
});

test('Three chunks: correct pre-order structure', () => {
  const data = generateTestInput(2049);
  const result = bao.baoEncode(data);
  // 3 chunks = 2 parent nodes
  // Format: 8 header + 64 root + 64 left_parent + 1024 chunk0 + 1024 chunk1 + 1 chunk2
  const expectedLen = 8 + 64 + 64 + 1024 + 1024 + 1;
  assertEqual(result.encoded.length, expectedLen, 'Three chunk size');

  // Verify header
  assertEqual(bao.decodeLen(result.encoded.subarray(0, 8)), 2049, 'Header length');

  // Root parent at offset 8
  const rootParent = result.encoded.subarray(8, 72);
  assertEqual(rootParent.length, 64, 'Root parent is 64 bytes');

  // Left subtree parent at offset 72
  const leftParent = result.encoded.subarray(72, 136);
  assertEqual(leftParent.length, 64, 'Left parent is 64 bytes');

  // Chunks follow
  assertArrayEqual(result.encoded.subarray(136, 136 + 1024), data.subarray(0, 1024), 'Chunk 0');
  assertArrayEqual(result.encoded.subarray(136 + 1024, 136 + 2048), data.subarray(1024, 2048), 'Chunk 1');
  assertArrayEqual(result.encoded.subarray(136 + 2048), data.subarray(2048), 'Chunk 2');
});

// ============================
// Outboard Encoding Tests
// ============================
console.log('\n--- Outboard Encoding Tests ---\n');

test('Outboard empty: only header', () => {
  const data = new Uint8Array(0);
  const result = bao.baoEncode(data, true);
  assertEqual(result.encoded.length, 8, 'Outboard empty is just header');
});

test('Outboard single chunk: only header (no chunk data)', () => {
  const data = generateTestInput(100);
  const result = bao.baoEncode(data, true);
  assertEqual(result.encoded.length, 8, 'Outboard single chunk is just header');
  assertEqual(bao.decodeLen(result.encoded.subarray(0, 8)), 100, 'Header length');
});

test('Outboard two chunks: header + parent (no chunk data)', () => {
  const data = generateTestInput(2048);
  const result = bao.baoEncode(data, true);
  // Format: 8-byte header + 64-byte parent = 72 bytes
  assertEqual(result.encoded.length, 8 + 64, 'Outboard two chunk size');
});

test('Outboard three chunks: header + 2 parents (no chunk data)', () => {
  const data = generateTestInput(2049);
  const result = bao.baoEncode(data, true);
  // 3 chunks = 2 parent nodes
  // Format: 8 header + 64 root + 64 left_parent = 136 bytes
  assertEqual(result.encoded.length, 8 + 64 + 64, 'Outboard three chunk size');
});

test('Outboard hash matches combined hash', () => {
  const data = generateTestInput(5000);
  const combined = bao.baoEncode(data, false);
  const outboard = bao.baoEncode(data, true);
  assertArrayEqual(combined.hash, outboard.hash, 'Hashes should match');
});

test('Outboard 100KB: header + parent nodes only', () => {
  const data = generateTestInput(102400);
  const result = bao.baoEncode(data, true);

  // 102400 bytes = 100 chunks
  // 100 chunks = 99 parent nodes
  // Format: 8 header + 99 * 64 = 8 + 6336 = 6344 bytes
  const numChunks = bao.countChunks(102400);
  const expectedParents = numChunks - 1;
  const expectedLen = 8 + expectedParents * 64;
  assertEqual(result.encoded.length, expectedLen, 'Outboard 100KB size');
});

// ============================
// Parent Node Verification Tests
// ============================
console.log('\n--- Parent Node Verification Tests ---\n');

test('Two chunks: parent node contains correct CVs', () => {
  const data = generateTestInput(2048);
  const result = bao.baoEncode(data);

  // Compute expected CVs
  const cv0 = bao.chunkCV(data.subarray(0, 1024), 0, false);
  const cv1 = bao.chunkCV(data.subarray(1024, 2048), 1, false);

  // Parent node at offset 8
  const parentNode = result.encoded.subarray(8, 72);
  const leftCV = parentNode.subarray(0, 32);
  const rightCV = parentNode.subarray(32, 64);

  assertArrayEqual(leftCV, cv0, 'Left CV in parent node');
  assertArrayEqual(rightCV, cv1, 'Right CV in parent node');
});

test('Three chunks: root parent contains correct CVs', () => {
  const data = generateTestInput(2049);
  const result = bao.baoEncode(data);

  // Left subtree: chunks 0 and 1
  const cv0 = bao.chunkCV(data.subarray(0, 1024), 0, false);
  const cv1 = bao.chunkCV(data.subarray(1024, 2048), 1, false);
  const leftParentCV = bao.parentCV(cv0, cv1, false);

  // Right subtree: chunk 2
  const cv2 = bao.chunkCV(data.subarray(2048, 2049), 2, false);

  // Root parent at offset 8
  const rootParent = result.encoded.subarray(8, 72);
  const rootLeftCV = rootParent.subarray(0, 32);
  const rootRightCV = rootParent.subarray(32, 64);

  assertArrayEqual(rootLeftCV, leftParentCV, 'Root left CV');
  assertArrayEqual(rootRightCV, cv2, 'Root right CV');
});

// ============================
// Encoding Size Verification
// ============================
console.log('\n--- Encoding Size Verification ---\n');

const sizeTestCases = [
  { len: 0, combined: 8, outboard: 8 },
  { len: 1, combined: 8 + 1, outboard: 8 },
  { len: 1024, combined: 8 + 1024, outboard: 8 },
  { len: 1025, combined: 8 + 64 + 1025, outboard: 8 + 64 },
  { len: 2048, combined: 8 + 64 + 2048, outboard: 8 + 64 },
  { len: 2049, combined: 8 + 128 + 2049, outboard: 8 + 128 },
  { len: 4096, combined: 8 + 192 + 4096, outboard: 8 + 192 },
];

for (const tc of sizeTestCases) {
  test(`Encoding size for ${tc.len} bytes (combined)`, () => {
    const data = generateTestInput(tc.len);
    const result = bao.baoEncode(data, false);
    assertEqual(result.encoded.length, tc.combined, `Combined size for ${tc.len}`);
  });

  test(`Encoding size for ${tc.len} bytes (outboard)`, () => {
    const data = generateTestInput(tc.len);
    const result = bao.baoEncode(data, true);
    assertEqual(result.encoded.length, tc.outboard, `Outboard size for ${tc.len}`);
  });
}

// ============================
// Summary
// ============================
console.log('\n==================');
console.log(`Results: ${passed} passed, ${failed} failed`);

if (failed === 0) {
  console.log('\nAll Bao encoding tests passed!');
} else {
  console.log('\nSome tests failed.');
  process.exit(1);
}

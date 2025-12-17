/**
 * Tests for Iroh-compatible chunk groups in Bao
 *
 * Iroh uses chunk groups (default 16 chunks = 16 KiB) to reduce
 * outboard size by approximately 16x compared to standard Bao.
 */

const bao = require('./bao.js');

// Test helper functions
function toHex(bytes) {
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

function generateInput(length) {
  const input = new Uint8Array(length);
  let counter = 1;
  for (let i = 0; i < length; i += 4) {
    const remaining = Math.min(4, length - i);
    for (let j = 0; j < remaining; j++) {
      input[i + j] = (counter >> (j * 8)) & 0xff;
    }
    counter++;
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

function assertClose(actual, expected, tolerance, msg) {
  if (Math.abs(actual - expected) > tolerance) {
    throw new Error(`${msg}\n  Expected: ~${expected}\n  Got: ${actual}`);
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

console.log('Iroh Chunk Group Tests');
console.log('======================\n');

// ============================
// Constants
// ============================
const CHUNK_LEN = 1024;
const CHUNK_GROUP_LOG = bao.IROH_CHUNK_GROUP_LOG;  // 4
const CHUNK_GROUP_SIZE = bao.IROH_CHUNK_GROUP_SIZE;  // 16384 (16 KiB)
const HEADER_SIZE = 8;
const PARENT_SIZE = 64;

console.log(`Chunk group log: ${CHUNK_GROUP_LOG}`);
console.log(`Chunk group size: ${CHUNK_GROUP_SIZE} bytes (${CHUNK_GROUP_SIZE / 1024} KiB)`);
console.log(`Chunks per group: ${1 << CHUNK_GROUP_LOG}\n`);

// ============================
// countChunkGroups Tests
// ============================
console.log('--- countChunkGroups Tests ---\n');

test('countChunkGroups: empty input', () => {
  const count = bao.countChunkGroups(0);
  assertEqual(count, 1, 'Empty input should have 1 group');
});

test('countChunkGroups: 1 byte', () => {
  const count = bao.countChunkGroups(1);
  assertEqual(count, 1, '1 byte should fit in 1 group');
});

test('countChunkGroups: exactly 1 chunk (1024 bytes)', () => {
  const count = bao.countChunkGroups(1024);
  assertEqual(count, 1, '1 chunk should fit in 1 group');
});

test('countChunkGroups: exactly 16 chunks (16 KiB)', () => {
  const count = bao.countChunkGroups(16384);
  assertEqual(count, 1, '16 chunks should fit in 1 group');
});

test('countChunkGroups: 16 KiB + 1 byte', () => {
  const count = bao.countChunkGroups(16385);
  assertEqual(count, 2, '16 KiB + 1 should require 2 groups');
});

test('countChunkGroups: 32 KiB (2 full groups)', () => {
  const count = bao.countChunkGroups(32768);
  assertEqual(count, 2, '32 KiB should require 2 groups');
});

test('countChunkGroups: 1 MB', () => {
  const count = bao.countChunkGroups(1024 * 1024);
  assertEqual(count, 64, '1 MB should require 64 groups');
});

test('countChunkGroups: 10 MB', () => {
  const count = bao.countChunkGroups(10 * 1024 * 1024);
  assertEqual(count, 640, '10 MB should require 640 groups');
});

// ============================
// irohOutboardSize Tests
// ============================
console.log('\n--- irohOutboardSize Tests ---\n');

test('irohOutboardSize: empty input', () => {
  const size = bao.irohOutboardSize(0);
  assertEqual(size, 8, 'Empty input outboard should be just header (8 bytes)');
});

test('irohOutboardSize: 1 group', () => {
  const size = bao.irohOutboardSize(16384);
  assertEqual(size, 8, '1 group needs only header');
});

test('irohOutboardSize: 2 groups', () => {
  const size = bao.irohOutboardSize(16385);
  // 2 groups = 1 parent node
  assertEqual(size, 8 + 64, '2 groups need header + 1 parent');
});

test('irohOutboardSize: 64 groups (1 MB)', () => {
  const size = bao.irohOutboardSize(1024 * 1024);
  // 64 groups = 63 parent nodes
  assertEqual(size, 8 + 63 * 64, '64 groups need header + 63 parents');
});

test('irohOutboardSize: vs standard outboard (16x reduction)', () => {
  const contentLen = 1024 * 1024;  // 1 MB

  // Standard Bao outboard
  const { encoded: stdOutboard } = bao.baoEncode(generateInput(contentLen), true);

  // Iroh outboard
  const { encoded: irohOutboard } = bao.baoEncodeIroh(generateInput(contentLen), true);

  const ratio = stdOutboard.length / irohOutboard.length;
  console.log(`    Standard outboard: ${stdOutboard.length} bytes`);
  console.log(`    Iroh outboard: ${irohOutboard.length} bytes`);
  console.log(`    Ratio: ${ratio.toFixed(2)}x`);

  // Should be approximately 16x smaller
  assertClose(ratio, 16, 1, 'Iroh should be ~16x smaller');
});

// ============================
// chunkGroupCV Tests
// ============================
console.log('\n--- chunkGroupCV Tests ---\n');

test('chunkGroupCV: single chunk equals chunkCV', () => {
  const data = generateInput(1000);
  const groupCV = bao.chunkGroupCV(data, 0, false);
  const singleCV = bao.chunkCV(data, 0, false);
  assertArrayEqual(groupCV, singleCV, 'Single chunk group should equal chunk CV');
});

test('chunkGroupCV: empty data', () => {
  const data = new Uint8Array(0);
  const groupCV = bao.chunkGroupCV(data, 0, true);
  // Should not throw
  assertEqual(groupCV.length, 32, 'Should produce 32-byte CV');
});

test('chunkGroupCV: 2 chunks', () => {
  const data = generateInput(2048);
  const groupCV = bao.chunkGroupCV(data, 0, false);

  // Manual calculation: 2 chunk CVs -> 1 parent
  const cv0 = bao.chunkCV(data.subarray(0, 1024), 0, false);
  const cv1 = bao.chunkCV(data.subarray(1024, 2048), 1, false);
  const expected = bao.parentCV(cv0, cv1, false);

  assertArrayEqual(groupCV, expected, '2-chunk group should match manual calculation');
});

test('chunkGroupCV: 16 chunks (full group)', () => {
  const data = generateInput(16384);
  const groupCV = bao.chunkGroupCV(data, 0, false);

  assertEqual(groupCV.length, 32, 'Should produce 32-byte CV');
  // Just verify it produces a result - full tree calculation is complex
});

// ============================
// baoEncodeIroh Tests
// ============================
console.log('\n--- baoEncodeIroh Tests ---\n');

test('baoEncodeIroh: combined mode equals standard', () => {
  const data = generateInput(50000);
  const stdResult = bao.baoEncode(data, false);
  const irohResult = bao.baoEncodeIroh(data, false);

  assertArrayEqual(irohResult.hash, stdResult.hash, 'Hash should match');
  assertArrayEqual(irohResult.encoded, stdResult.encoded, 'Combined encoding should match');
});

test('baoEncodeIroh: outboard hash matches standard', () => {
  const data = generateInput(100000);
  const stdResult = bao.baoEncode(data, true);
  const irohResult = bao.baoEncodeIroh(data, true);

  assertArrayEqual(irohResult.hash, stdResult.hash, 'Root hash should match');
});

test('baoEncodeIroh: empty input', () => {
  const data = new Uint8Array(0);
  const result = bao.baoEncodeIroh(data, true);

  assertEqual(result.encoded.length, 8, 'Empty input should have 8-byte header');
  assertEqual(result.hash.length, 32, 'Should produce 32-byte hash');
});

test('baoEncodeIroh: single group (< 16 KiB)', () => {
  const data = generateInput(10000);
  const result = bao.baoEncodeIroh(data, true);

  assertEqual(result.encoded.length, 8, 'Single group needs only header');
});

test('baoEncodeIroh: two groups', () => {
  const data = generateInput(20000);  // 2 groups
  const result = bao.baoEncodeIroh(data, true);

  // 2 groups = header (8) + 1 parent (64) = 72 bytes
  assertEqual(result.encoded.length, 72, 'Two groups need 72 bytes');
});

test('baoEncodeIroh: 1 MB outboard size', () => {
  const data = generateInput(1024 * 1024);
  const result = bao.baoEncodeIroh(data, true);

  const expected = bao.irohOutboardSize(1024 * 1024);
  assertEqual(result.encoded.length, expected, `1 MB outboard should be ${expected} bytes`);
});

test('baoEncodeIroh: string input', () => {
  const result = bao.baoEncodeIroh('hello world', true);
  assertEqual(result.hash.length, 32, 'Should handle string input');
});

// ============================
// baoDecodeIroh / baoVerifyIroh Tests
// ============================
console.log('\n--- baoDecodeIroh / baoVerifyIroh Tests ---\n');

test('baoVerifyIroh: empty data', () => {
  const data = new Uint8Array(0);
  const { encoded, hash } = bao.baoEncodeIroh(data, true);
  const valid = bao.baoVerifyIroh(encoded, hash, data);
  assertEqual(valid, true, 'Empty data should verify');
});

test('baoVerifyIroh: single group', () => {
  const data = generateInput(10000);
  const { encoded, hash } = bao.baoEncodeIroh(data, true);
  const valid = bao.baoVerifyIroh(encoded, hash, data);
  assertEqual(valid, true, 'Single group should verify');
});

test('baoVerifyIroh: two groups', () => {
  const data = generateInput(20000);
  const { encoded, hash } = bao.baoEncodeIroh(data, true);
  const valid = bao.baoVerifyIroh(encoded, hash, data);
  assertEqual(valid, true, 'Two groups should verify');
});

test('baoVerifyIroh: 1 MB', () => {
  const data = generateInput(1024 * 1024);
  const { encoded, hash } = bao.baoEncodeIroh(data, true);
  const valid = bao.baoVerifyIroh(encoded, hash, data);
  assertEqual(valid, true, '1 MB should verify');
});

test('baoVerifyIroh: wrong hash fails', () => {
  const data = generateInput(50000);
  const { encoded } = bao.baoEncodeIroh(data, true);
  const wrongHash = new Uint8Array(32).fill(0x42);
  const valid = bao.baoVerifyIroh(encoded, wrongHash, data);
  assertEqual(valid, false, 'Wrong hash should fail verification');
});

test('baoVerifyIroh: corrupted data fails', () => {
  const data = generateInput(50000);
  const { encoded, hash } = bao.baoEncodeIroh(data, true);

  // Corrupt the data
  const corrupted = new Uint8Array(data);
  corrupted[25000] ^= 0xff;

  const valid = bao.baoVerifyIroh(encoded, hash, corrupted);
  assertEqual(valid, false, 'Corrupted data should fail verification');
});

test('baoDecodeIroh: returns data on success', () => {
  const data = generateInput(50000);
  const { encoded, hash } = bao.baoEncodeIroh(data, true);
  const result = bao.baoDecodeIroh(encoded, hash, data);
  assertArrayEqual(result, data, 'Should return original data');
});

test('baoDecodeIroh: throws on wrong hash', () => {
  const data = generateInput(50000);
  const { encoded } = bao.baoEncodeIroh(data, true);
  const wrongHash = new Uint8Array(32).fill(0x42);

  let threw = false;
  try {
    bao.baoDecodeIroh(encoded, wrongHash, data);
  } catch (e) {
    threw = true;
  }
  assertEqual(threw, true, 'Should throw on wrong hash');
});

// ============================
// Size Comparison Tests
// ============================
console.log('\n--- Outboard Size Comparison ---\n');

const sizesToTest = [
  { name: '100 KB', bytes: 100 * 1024 },
  { name: '1 MB', bytes: 1024 * 1024 },
  { name: '10 MB', bytes: 10 * 1024 * 1024 },
  { name: '100 MB', bytes: 100 * 1024 * 1024 },
];

console.log('Content Size | Standard    | Iroh        | Reduction');
console.log('-------------|-------------|-------------|----------');

for (const size of sizesToTest) {
  // Calculate standard Bao outboard size
  // numChunks = ceil(size / 1024)
  // Standard outboard = 8 + (numChunks - 1) * 64
  const numChunks = Math.ceil(size.bytes / 1024) || 1;
  const stdSize = 8 + (numChunks - 1) * 64;

  // Calculate Iroh outboard size
  const irohSize = bao.irohOutboardSize(size.bytes);

  const reduction = ((1 - irohSize / stdSize) * 100).toFixed(1);

  console.log(
    `${size.name.padEnd(12)} | ${(stdSize / 1024).toFixed(1).padStart(8)} KB | ${(irohSize / 1024).toFixed(1).padStart(8)} KB | ${reduction}%`
  );

  test(`Size reduction ${size.name}: ~93.75%`, () => {
    // Standard has (chunks-1) parents, Iroh has (groups-1) parents
    // With 16 chunks per group, Iroh should be ~1/16 the size
    // (minus headers), which is ~93.75% reduction
    const expectedReduction = 93;  // Allow some tolerance
    const actualReduction = (1 - irohSize / stdSize) * 100;
    if (actualReduction < expectedReduction) {
      throw new Error(`Expected ~${expectedReduction}% reduction, got ${actualReduction.toFixed(1)}%`);
    }
  });
}

// ============================
// Round-trip Tests
// ============================
console.log('\n--- Round-trip Tests ---\n');

const roundTripSizes = [
  { name: 'empty', bytes: 0 },
  { name: '1 byte', bytes: 1 },
  { name: '1 KB', bytes: 1024 },
  { name: '16 KB (1 group)', bytes: 16384 },
  { name: '16 KB + 1', bytes: 16385 },
  { name: '32 KB (2 groups)', bytes: 32768 },
  { name: '100 KB', bytes: 102400 },
  { name: '1 MB', bytes: 1024 * 1024 },
];

for (const size of roundTripSizes) {
  test(`Round-trip ${size.name}`, () => {
    const original = generateInput(size.bytes);
    const { encoded, hash } = bao.baoEncodeIroh(original, true);
    const verified = bao.baoDecodeIroh(encoded, hash, original);
    assertArrayEqual(verified, original, 'Data should match');
  });
}

// ============================
// Hash Consistency Tests
// ============================
console.log('\n--- Hash Consistency Tests ---\n');

test('Hash matches: empty', () => {
  const data = new Uint8Array(0);
  const std = bao.baoEncode(data, true);
  const iroh = bao.baoEncodeIroh(data, true);
  assertArrayEqual(iroh.hash, std.hash, 'Hash should match standard Bao');
});

test('Hash matches: small data', () => {
  const data = generateInput(500);
  const std = bao.baoEncode(data, true);
  const iroh = bao.baoEncodeIroh(data, true);
  assertArrayEqual(iroh.hash, std.hash, 'Hash should match standard Bao');
});

test('Hash matches: 1 chunk', () => {
  const data = generateInput(1024);
  const std = bao.baoEncode(data, true);
  const iroh = bao.baoEncodeIroh(data, true);
  assertArrayEqual(iroh.hash, std.hash, 'Hash should match standard Bao');
});

test('Hash matches: 16 chunks (1 group)', () => {
  const data = generateInput(16384);
  const std = bao.baoEncode(data, true);
  const iroh = bao.baoEncodeIroh(data, true);
  assertArrayEqual(iroh.hash, std.hash, 'Hash should match standard Bao');
});

test('Hash matches: 17 chunks (2 groups)', () => {
  const data = generateInput(17408);
  const std = bao.baoEncode(data, true);
  const iroh = bao.baoEncodeIroh(data, true);
  assertArrayEqual(iroh.hash, std.hash, 'Hash should match standard Bao');
});

test('Hash matches: 1 MB', () => {
  const data = generateInput(1024 * 1024);
  const std = bao.baoEncode(data, true);
  const iroh = bao.baoEncodeIroh(data, true);
  assertArrayEqual(iroh.hash, std.hash, 'Hash should match standard Bao');
});

// ============================
// Custom chunk group log tests
// ============================
console.log('\n--- Custom Chunk Group Log Tests ---\n');

test('chunkGroupLog=0 (1 chunk per group)', () => {
  const data = generateInput(5000);
  const count = bao.countChunkGroups(data.length, 0);
  assertEqual(count, 5, '5000 bytes = 5 chunks = 5 groups');
});

test('chunkGroupLog=3 (8 chunks per group)', () => {
  const data = generateInput(16384);  // 16 chunks
  const count = bao.countChunkGroups(data.length, 3);
  assertEqual(count, 2, '16 chunks with log=3 = 2 groups');
});

test('chunkGroupLog=5 (32 chunks per group)', () => {
  const data = generateInput(65536);  // 64 chunks
  const count = bao.countChunkGroups(data.length, 5);
  assertEqual(count, 2, '64 chunks with log=5 = 2 groups');
});

test('baoEncodeIroh with custom chunkGroupLog', () => {
  const data = generateInput(50000);

  // log=3: 8 chunks per group
  const result3 = bao.baoEncodeIroh(data, true, 3);
  const expected3 = bao.irohOutboardSize(data.length, 3);
  assertEqual(result3.encoded.length, expected3, 'Should match expected size for log=3');

  // log=5: 32 chunks per group
  const result5 = bao.baoEncodeIroh(data, true, 5);
  const expected5 = bao.irohOutboardSize(data.length, 5);
  assertEqual(result5.encoded.length, expected5, 'Should match expected size for log=5');

  // Both should produce same hash as standard
  const std = bao.baoEncode(data, true);
  assertArrayEqual(result3.hash, std.hash, 'log=3 hash should match');
  assertArrayEqual(result5.hash, std.hash, 'log=5 hash should match');
});

// ============================
// Summary
// ============================
console.log('\n======================');
console.log(`Results: ${passed} passed, ${failed} failed`);

if (failed === 0) {
  console.log('\nAll Iroh chunk group tests passed!');
} else {
  console.log('\nSome tests failed.');
  process.exit(1);
}

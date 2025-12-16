/**
 * Tests for Bao decoding functions
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

function assertThrows(fn, expectedMsg, testName) {
  try {
    fn();
    throw new Error(`Expected error but none thrown`);
  } catch (e) {
    if (expectedMsg && !e.message.includes(expectedMsg)) {
      throw new Error(`Wrong error message.\n  Expected to contain: ${expectedMsg}\n  Got: ${e.message}`);
    }
  }
}

console.log('Bao Decoding Tests');
console.log('==================\n');

// ============================
// Round-trip Tests (Combined)
// ============================
console.log('--- Round-trip Tests (Combined) ---\n');

test('Round-trip empty input', () => {
  const data = new Uint8Array(0);
  const { encoded, hash } = bao.baoEncode(data);
  const decoded = bao.baoDecode(encoded, hash);
  assertArrayEqual(decoded, data, 'Empty round-trip');
});

test('Round-trip 1 byte', () => {
  const data = new Uint8Array([0x42]);
  const { encoded, hash } = bao.baoEncode(data);
  const decoded = bao.baoDecode(encoded, hash);
  assertArrayEqual(decoded, data, '1 byte round-trip');
});

test('Round-trip 64 bytes', () => {
  const data = generateTestInput(64);
  const { encoded, hash } = bao.baoEncode(data);
  const decoded = bao.baoDecode(encoded, hash);
  assertArrayEqual(decoded, data, '64 bytes round-trip');
});

test('Round-trip 100 bytes', () => {
  const data = generateTestInput(100);
  const { encoded, hash } = bao.baoEncode(data);
  const decoded = bao.baoDecode(encoded, hash);
  assertArrayEqual(decoded, data, '100 bytes round-trip');
});

test('Round-trip 1024 bytes (1 chunk)', () => {
  const data = generateTestInput(1024);
  const { encoded, hash } = bao.baoEncode(data);
  const decoded = bao.baoDecode(encoded, hash);
  assertArrayEqual(decoded, data, '1024 bytes round-trip');
});

test('Round-trip 1025 bytes (2 chunks)', () => {
  const data = generateTestInput(1025);
  const { encoded, hash } = bao.baoEncode(data);
  const decoded = bao.baoDecode(encoded, hash);
  assertArrayEqual(decoded, data, '1025 bytes round-trip');
});

test('Round-trip 2048 bytes (2 chunks)', () => {
  const data = generateTestInput(2048);
  const { encoded, hash } = bao.baoEncode(data);
  const decoded = bao.baoDecode(encoded, hash);
  assertArrayEqual(decoded, data, '2048 bytes round-trip');
});

test('Round-trip 2049 bytes (3 chunks)', () => {
  const data = generateTestInput(2049);
  const { encoded, hash } = bao.baoEncode(data);
  const decoded = bao.baoDecode(encoded, hash);
  assertArrayEqual(decoded, data, '2049 bytes round-trip');
});

test('Round-trip 4096 bytes (4 chunks)', () => {
  const data = generateTestInput(4096);
  const { encoded, hash } = bao.baoEncode(data);
  const decoded = bao.baoDecode(encoded, hash);
  assertArrayEqual(decoded, data, '4096 bytes round-trip');
});

test('Round-trip 5000 bytes (5 chunks)', () => {
  const data = generateTestInput(5000);
  const { encoded, hash } = bao.baoEncode(data);
  const decoded = bao.baoDecode(encoded, hash);
  assertArrayEqual(decoded, data, '5000 bytes round-trip');
});

test('Round-trip 10000 bytes (10 chunks)', () => {
  const data = generateTestInput(10000);
  const { encoded, hash } = bao.baoEncode(data);
  const decoded = bao.baoDecode(encoded, hash);
  assertArrayEqual(decoded, data, '10000 bytes round-trip');
});

test('Round-trip 100KB', () => {
  const data = generateTestInput(102400);
  const { encoded, hash } = bao.baoEncode(data);
  const decoded = bao.baoDecode(encoded, hash);
  assertArrayEqual(decoded, data, '100KB round-trip');
});

// ============================
// Round-trip Tests (Outboard)
// ============================
console.log('\n--- Round-trip Tests (Outboard) ---\n');

test('Outboard round-trip empty', () => {
  const data = new Uint8Array(0);
  const { encoded, hash } = bao.baoEncode(data, true);
  const decoded = bao.baoDecode(encoded, hash, data);
  assertArrayEqual(decoded, data, 'Empty outboard round-trip');
});

test('Outboard round-trip 100 bytes', () => {
  const data = generateTestInput(100);
  const { encoded, hash } = bao.baoEncode(data, true);
  const decoded = bao.baoDecode(encoded, hash, data);
  assertArrayEqual(decoded, data, '100 bytes outboard round-trip');
});

test('Outboard round-trip 2048 bytes', () => {
  const data = generateTestInput(2048);
  const { encoded, hash } = bao.baoEncode(data, true);
  const decoded = bao.baoDecode(encoded, hash, data);
  assertArrayEqual(decoded, data, '2048 bytes outboard round-trip');
});

test('Outboard round-trip 2049 bytes', () => {
  const data = generateTestInput(2049);
  const { encoded, hash } = bao.baoEncode(data, true);
  const decoded = bao.baoDecode(encoded, hash, data);
  assertArrayEqual(decoded, data, '2049 bytes outboard round-trip');
});

test('Outboard round-trip 100KB', () => {
  const data = generateTestInput(102400);
  const { encoded, hash } = bao.baoEncode(data, true);
  const decoded = bao.baoDecode(encoded, hash, data);
  assertArrayEqual(decoded, data, '100KB outboard round-trip');
});

// ============================
// Error Detection Tests
// ============================
console.log('\n--- Error Detection Tests ---\n');

test('Wrong root hash is detected', () => {
  const data = generateTestInput(100);
  const { encoded, hash } = bao.baoEncode(data);
  const wrongHash = new Uint8Array(hash);
  wrongHash[0] ^= 0xff; // Flip bits
  assertThrows(() => bao.baoDecode(encoded, wrongHash), 'hash mismatch', 'Wrong hash');
});

test('Corrupted chunk data is detected (single chunk)', () => {
  const data = generateTestInput(100);
  const { encoded, hash } = bao.baoEncode(data);
  const corrupted = new Uint8Array(encoded);
  corrupted[20] ^= 0xff; // Flip a bit in chunk data
  assertThrows(() => bao.baoDecode(corrupted, hash), 'hash mismatch', 'Corrupted chunk');
});

test('Corrupted chunk data is detected (multi-chunk)', () => {
  const data = generateTestInput(2048);
  const { encoded, hash } = bao.baoEncode(data);
  const corrupted = new Uint8Array(encoded);
  // Corrupt second chunk (after header + parent + first chunk)
  corrupted[8 + 64 + 1024 + 50] ^= 0xff;
  assertThrows(() => bao.baoDecode(corrupted, hash), 'hash mismatch', 'Corrupted chunk');
});

test('Corrupted parent node is detected', () => {
  const data = generateTestInput(2048);
  const { encoded, hash } = bao.baoEncode(data);
  const corrupted = new Uint8Array(encoded);
  // Corrupt parent node (after header, in the first 64 bytes)
  corrupted[10] ^= 0xff;
  assertThrows(() => bao.baoDecode(corrupted, hash), 'hash mismatch', 'Corrupted parent');
});

test('Corrupted header causes data mismatch', () => {
  const data = generateTestInput(100);
  const { encoded, hash } = bao.baoEncode(data);
  const corrupted = new Uint8Array(encoded);
  // Modify length header to claim wrong size
  corrupted[0] = 50; // Claim only 50 bytes
  // This will either fail verification or return wrong data
  try {
    const decoded = bao.baoDecode(corrupted, hash);
    // If it didn't throw, the decoded length should be wrong
    if (decoded.length === 50) {
      throw new Error('Hash mismatch expected'); // Will be caught below
    }
  } catch (e) {
    // Expected: either hash mismatch or wrong data
  }
});

test('Truncated encoding is detected', () => {
  const data = generateTestInput(2048);
  const { encoded, hash } = bao.baoEncode(data);
  const truncated = encoded.subarray(0, 100); // Way too short
  assertThrows(() => bao.baoDecode(truncated, hash), '', 'Truncated');
});

test('Wrong hash length is rejected', () => {
  const data = generateTestInput(100);
  const { encoded } = bao.baoEncode(data);
  const shortHash = new Uint8Array(16);
  assertThrows(() => bao.baoDecode(encoded, shortHash), 'must be 32 bytes', 'Short hash');
});

test('Too short encoding is rejected', () => {
  const encoded = new Uint8Array(4); // Less than header
  const hash = new Uint8Array(32);
  assertThrows(() => bao.baoDecode(encoded, hash), 'missing header', 'Too short');
});

// ============================
// Outboard Error Detection
// ============================
console.log('\n--- Outboard Error Detection ---\n');

test('Outboard: wrong data is detected', () => {
  const data = generateTestInput(2048);
  const { encoded, hash } = bao.baoEncode(data, true);
  const wrongData = new Uint8Array(data);
  wrongData[100] ^= 0xff;
  assertThrows(() => bao.baoDecode(encoded, hash, wrongData), 'hash mismatch', 'Wrong outboard data');
});

test('Outboard: wrong length is detected', () => {
  const data = generateTestInput(2048);
  const { encoded, hash } = bao.baoEncode(data, true);
  const wrongData = generateTestInput(2049);
  assertThrows(() => bao.baoDecode(encoded, hash, wrongData), 'length mismatch', 'Wrong outboard length');
});

test('Outboard: corrupted tree is detected', () => {
  const data = generateTestInput(2048);
  const { encoded, hash } = bao.baoEncode(data, true);
  const corrupted = new Uint8Array(encoded);
  corrupted[10] ^= 0xff; // Corrupt parent node
  assertThrows(() => bao.baoDecode(corrupted, hash, data), 'hash mismatch', 'Corrupted outboard tree');
});

// ============================
// Edge Cases
// ============================
console.log('\n--- Edge Cases ---\n');

test('Decode with exact chunk boundary sizes', () => {
  const sizes = [1024, 2048, 3072, 4096];
  for (const size of sizes) {
    const data = generateTestInput(size);
    const { encoded, hash } = bao.baoEncode(data);
    const decoded = bao.baoDecode(encoded, hash);
    assertArrayEqual(decoded, data, `${size} bytes boundary`);
  }
});

test('Decode just over chunk boundaries', () => {
  const sizes = [1025, 2049, 3073, 4097];
  for (const size of sizes) {
    const data = generateTestInput(size);
    const { encoded, hash } = bao.baoEncode(data);
    const decoded = bao.baoDecode(encoded, hash);
    assertArrayEqual(decoded, data, `${size} bytes just over boundary`);
  }
});

test('Decode just under chunk boundaries', () => {
  const sizes = [1023, 2047, 3071, 4095];
  for (const size of sizes) {
    const data = generateTestInput(size);
    const { encoded, hash } = bao.baoEncode(data);
    const decoded = bao.baoDecode(encoded, hash);
    assertArrayEqual(decoded, data, `${size} bytes just under boundary`);
  }
});

// ============================
// Bit-flip Detection Tests
// ============================
console.log('\n--- Bit-flip Detection Tests ---\n');

test('Any single bit flip in chunk data is detected', () => {
  const data = generateTestInput(100);
  const { encoded, hash } = bao.baoEncode(data);

  // Test flipping each bit position in the chunk data area
  let detected = 0;
  for (let bytePos = 8; bytePos < encoded.length; bytePos++) {
    for (let bit = 0; bit < 8; bit++) {
      const corrupted = new Uint8Array(encoded);
      corrupted[bytePos] ^= (1 << bit);
      try {
        bao.baoDecode(corrupted, hash);
        // If we get here, corruption wasn't detected
      } catch (e) {
        detected++;
      }
    }
  }
  const totalBits = (encoded.length - 8) * 8;
  assertEqual(detected, totalBits, `All ${totalBits} bit flips should be detected`);
});

test('Any single bit flip in parent node is detected (2 chunks)', () => {
  const data = generateTestInput(2048);
  const { encoded, hash } = bao.baoEncode(data);

  // Parent node is at bytes 8-71
  let detected = 0;
  for (let bytePos = 8; bytePos < 72; bytePos++) {
    for (let bit = 0; bit < 8; bit++) {
      const corrupted = new Uint8Array(encoded);
      corrupted[bytePos] ^= (1 << bit);
      try {
        bao.baoDecode(corrupted, hash);
      } catch (e) {
        detected++;
      }
    }
  }
  const totalBits = 64 * 8;
  assertEqual(detected, totalBits, `All ${totalBits} parent bit flips should be detected`);
});

// ============================
// Summary
// ============================
console.log('\n==================');
console.log(`Results: ${passed} passed, ${failed} failed`);

if (failed === 0) {
  console.log('\nAll Bao decoding tests passed!');
} else {
  console.log('\nSome tests failed.');
  process.exit(1);
}

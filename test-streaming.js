/**
 * BLAKE3 Streaming API Test
 * Tests that hashing in chunks produces identical results to hashing all at once
 */

const blake3 = require('./blake3.js');

function toHex(bytes) {
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

function generateTestData(length) {
  const data = new Uint8Array(length);
  for (let i = 0; i < length; i++) {
    data[i] = i % 251;
  }
  return data;
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

console.log('BLAKE3 Streaming API Tests');
console.log('===========================\n');

// Test 1: Empty input
test('Empty input', () => {
  const hasher = blake3.createHasher();
  const streamResult = toHex(hasher.finalize());
  const directResult = blake3.hashHex('');
  assertEqual(streamResult, directResult, 'Empty input mismatch');
});

// Test 2: Single byte
test('Single byte', () => {
  const data = new Uint8Array([0]);
  const hasher = blake3.createHasher();
  hasher.update(data);
  const streamResult = toHex(hasher.finalize());
  const directResult = toHex(blake3.hash(data));
  assertEqual(streamResult, directResult, 'Single byte mismatch');
});

// Test 3: Small string ("hello")
test('Small string "hello"', () => {
  const hasher = blake3.createHasher();
  hasher.update('hello');
  const streamResult = toHex(hasher.finalize());
  const directResult = blake3.hashHex('hello');
  assertEqual(streamResult, directResult, 'hello mismatch');
});

// Test 4: Multiple small updates
test('Multiple small updates', () => {
  const hasher = blake3.createHasher();
  hasher.update('hel');
  hasher.update('lo');
  const streamResult = toHex(hasher.finalize());
  const directResult = blake3.hashHex('hello');
  assertEqual(streamResult, directResult, 'Multiple updates mismatch');
});

// Test 5: Exactly one block (64 bytes)
test('Exactly one block (64 bytes)', () => {
  const data = generateTestData(64);
  const hasher = blake3.createHasher();
  hasher.update(data);
  const streamResult = toHex(hasher.finalize());
  const directResult = toHex(blake3.hash(data));
  assertEqual(streamResult, directResult, '64 bytes mismatch');
});

// Test 6: One block + 1 byte (65 bytes)
test('One block + 1 byte (65 bytes)', () => {
  const data = generateTestData(65);
  const hasher = blake3.createHasher();
  hasher.update(data);
  const streamResult = toHex(hasher.finalize());
  const directResult = toHex(blake3.hash(data));
  assertEqual(streamResult, directResult, '65 bytes mismatch');
});

// Test 7: Exactly one chunk (1024 bytes)
test('Exactly one chunk (1024 bytes)', () => {
  const data = generateTestData(1024);
  const hasher = blake3.createHasher();
  hasher.update(data);
  const streamResult = toHex(hasher.finalize());
  const directResult = toHex(blake3.hash(data));
  assertEqual(streamResult, directResult, '1024 bytes mismatch');
});

// Test 8: One chunk + 1 byte (1025 bytes)
test('One chunk + 1 byte (1025 bytes)', () => {
  const data = generateTestData(1025);
  const hasher = blake3.createHasher();
  hasher.update(data);
  const streamResult = toHex(hasher.finalize());
  const directResult = toHex(blake3.hash(data));
  assertEqual(streamResult, directResult, '1025 bytes mismatch');
});

// Test 9: Two chunks (2048 bytes)
test('Two chunks (2048 bytes)', () => {
  const data = generateTestData(2048);
  const hasher = blake3.createHasher();
  hasher.update(data);
  const streamResult = toHex(hasher.finalize());
  const directResult = toHex(blake3.hash(data));
  assertEqual(streamResult, directResult, '2048 bytes mismatch');
});

// Test 10: Two chunks in separate updates
test('Two chunks in separate updates', () => {
  const data = generateTestData(2048);
  const hasher = blake3.createHasher();
  hasher.update(data.subarray(0, 1024));
  hasher.update(data.subarray(1024, 2048));
  const streamResult = toHex(hasher.finalize());
  const directResult = toHex(blake3.hash(data));
  assertEqual(streamResult, directResult, 'Split chunks mismatch');
});

// Test 11: Large file simulation (100KB)
test('Large data (100KB)', () => {
  const data = generateTestData(102400);
  const hasher = blake3.createHasher();
  hasher.update(data);
  const streamResult = toHex(hasher.finalize());
  const directResult = toHex(blake3.hash(data));
  assertEqual(streamResult, directResult, '100KB mismatch');
});

// Test 12: Large file in small chunks (100KB in 1000-byte chunks)
test('Large data in 1000-byte chunks', () => {
  const data = generateTestData(102400);
  const hasher = blake3.createHasher();
  for (let i = 0; i < data.length; i += 1000) {
    hasher.update(data.subarray(i, Math.min(i + 1000, data.length)));
  }
  const streamResult = toHex(hasher.finalize());
  const directResult = toHex(blake3.hash(data));
  assertEqual(streamResult, directResult, 'Chunked 100KB mismatch');
});

// Test 13: Large file byte by byte (small sample)
test('Small data byte by byte (100 bytes)', () => {
  const data = generateTestData(100);
  const hasher = blake3.createHasher();
  for (let i = 0; i < data.length; i++) {
    hasher.update(data.subarray(i, i + 1));
  }
  const streamResult = toHex(hasher.finalize());
  const directResult = toHex(blake3.hash(data));
  assertEqual(streamResult, directResult, 'Byte-by-byte mismatch');
});

// Test 14: Method chaining
test('Method chaining', () => {
  const hasher = blake3.createHasher()
    .update('hello')
    .update(' ')
    .update('world');
  const streamResult = toHex(hasher.finalize());
  const directResult = blake3.hashHex('hello world');
  assertEqual(streamResult, directResult, 'Chaining mismatch');
});

// Test 15: Custom output length
test('Custom output length (16 bytes)', () => {
  const data = generateTestData(100);
  const hasher = blake3.createHasher();
  hasher.update(data);
  const streamResult = hasher.finalize(16);
  const directResult = blake3.hash(data, 16);
  assertEqual(toHex(streamResult), toHex(directResult), '16-byte output mismatch');
  assertEqual(streamResult.length, 16, 'Output length mismatch');
});

// Test 16: 3 chunks (tests Merkle tree merging)
test('Three chunks (3072 bytes)', () => {
  const data = generateTestData(3072);
  const hasher = blake3.createHasher();
  hasher.update(data);
  const streamResult = toHex(hasher.finalize());
  const directResult = toHex(blake3.hash(data));
  assertEqual(streamResult, directResult, '3072 bytes mismatch');
});

// Test 17: 4 chunks
test('Four chunks (4096 bytes)', () => {
  const data = generateTestData(4096);
  const hasher = blake3.createHasher();
  hasher.update(data);
  const streamResult = toHex(hasher.finalize());
  const directResult = toHex(blake3.hash(data));
  assertEqual(streamResult, directResult, '4096 bytes mismatch');
});

// Test 18: 5 chunks
test('Five chunks (5120 bytes)', () => {
  const data = generateTestData(5120);
  const hasher = blake3.createHasher();
  hasher.update(data);
  const streamResult = toHex(hasher.finalize());
  const directResult = toHex(blake3.hash(data));
  assertEqual(streamResult, directResult, '5120 bytes mismatch');
});

// Test 19: Uneven chunk splits
test('Uneven chunk splits (5000 bytes)', () => {
  const data = generateTestData(5000);
  const hasher = blake3.createHasher();
  hasher.update(data.subarray(0, 1500));
  hasher.update(data.subarray(1500, 2700));
  hasher.update(data.subarray(2700, 5000));
  const streamResult = toHex(hasher.finalize());
  const directResult = toHex(blake3.hash(data));
  assertEqual(streamResult, directResult, 'Uneven splits mismatch');
});

console.log('\n===========================');
console.log(`Results: ${passed} passed, ${failed} failed`);

if (failed === 0) {
  console.log('\nAll streaming tests passed!');
} else {
  console.log('\nSome tests failed.');
  process.exit(1);
}

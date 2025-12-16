/**
 * Tests for Bao slice extraction and decoding
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
    throw new Error('Expected error but none thrown');
  } catch (e) {
    if (expectedMsg && !e.message.includes(expectedMsg)) {
      throw new Error(`Wrong error message.\n  Expected to contain: ${expectedMsg}\n  Got: ${e.message}`);
    }
  }
}

console.log('Bao Slice Tests');
console.log('===============\n');

// ============================
// Basic Slice Extraction
// ============================
console.log('--- Basic Slice Extraction ---\n');

test('Full slice equals full encoding', () => {
  const data = generateTestInput(2048);
  const { encoded, hash } = bao.baoEncode(data);
  const slice = bao.baoSlice(encoded, 0, data.length);
  assertArrayEqual(slice, encoded, 'Full slice should equal full encoding');
});

test('Slice of single chunk file', () => {
  const data = generateTestInput(100);
  const { encoded, hash } = bao.baoEncode(data);
  const slice = bao.baoSlice(encoded, 0, 50);
  // Slice should contain header + full chunk (needed for verification)
  assertEqual(slice.length, 8 + 100, 'Single chunk slice size');
});

test('Slice includes entire overlapping chunks', () => {
  const data = generateTestInput(2048);
  const { encoded, hash } = bao.baoEncode(data);
  // Request bytes 500-1500 (spans both chunks)
  const slice = bao.baoSlice(encoded, 500, 1000);
  // Should include header + parent + both chunks
  assertEqual(slice.length, 8 + 64 + 2048, 'Two-chunk spanning slice');
});

// ============================
// Slice Size Efficiency
// ============================
console.log('\n--- Slice Size Efficiency ---\n');

test('Extracting 1KB from 10KB file produces small slice', () => {
  const data = generateTestInput(10240); // 10 chunks
  const { encoded, hash } = bao.baoEncode(data);

  // Request bytes 1024-2048 (second chunk only)
  const slice = bao.baoSlice(encoded, 1024, 1024);

  // Slice should be much smaller than full encoding
  const fullSize = encoded.length;
  const sliceSize = slice.length;

  console.log(`    Full encoding: ${fullSize} bytes`);
  console.log(`    Slice (1KB from 10KB): ${sliceSize} bytes`);
  console.log(`    Reduction: ${((1 - sliceSize/fullSize) * 100).toFixed(1)}%`);

  if (sliceSize >= fullSize) {
    throw new Error('Slice should be smaller than full encoding');
  }
});

test('Extracting 1KB from 100KB file produces small slice', () => {
  const data = generateTestInput(102400); // 100 chunks
  const { encoded, hash } = bao.baoEncode(data);

  // Request bytes 50000-51000 (middle of file)
  const slice = bao.baoSlice(encoded, 50000, 1000);

  const fullSize = encoded.length;
  const sliceSize = slice.length;

  console.log(`    Full encoding: ${fullSize} bytes`);
  console.log(`    Slice (1KB from 100KB): ${sliceSize} bytes`);
  console.log(`    Reduction: ${((1 - sliceSize/fullSize) * 100).toFixed(1)}%`);

  // Should be at least 90% smaller
  if (sliceSize > fullSize * 0.1) {
    throw new Error('Slice should be much smaller than full encoding');
  }
});

// ============================
// Slice Round-trip Tests
// ============================
console.log('\n--- Slice Round-trip Tests ---\n');

test('Slice decode: full file', () => {
  const data = generateTestInput(2048);
  const { encoded, hash } = bao.baoEncode(data);
  const slice = bao.baoSlice(encoded, 0, data.length);
  const decoded = bao.baoDecodeSlice(slice, hash, 0, data.length);
  assertArrayEqual(decoded, data, 'Full slice decode');
});

test('Slice decode: first half of two chunks', () => {
  const data = generateTestInput(2048);
  const { encoded, hash } = bao.baoEncode(data);
  const slice = bao.baoSlice(encoded, 0, 1024);
  const decoded = bao.baoDecodeSlice(slice, hash, 0, 1024);
  assertArrayEqual(decoded, data.subarray(0, 1024), 'First chunk slice');
});

test('Slice decode: second half of two chunks', () => {
  const data = generateTestInput(2048);
  const { encoded, hash } = bao.baoEncode(data);
  const slice = bao.baoSlice(encoded, 1024, 1024);
  const decoded = bao.baoDecodeSlice(slice, hash, 1024, 1024);
  assertArrayEqual(decoded, data.subarray(1024, 2048), 'Second chunk slice');
});

test('Slice decode: middle of file spans chunks', () => {
  const data = generateTestInput(3072);
  const { encoded, hash } = bao.baoEncode(data);
  // Bytes 500-2500 spans first two chunks
  const slice = bao.baoSlice(encoded, 500, 2000);
  const decoded = bao.baoDecodeSlice(slice, hash, 500, 2000);
  assertArrayEqual(decoded, data.subarray(500, 2500), 'Middle spanning slice');
});

test('Slice decode: bytes 1024-2048 from 10KB', () => {
  const data = generateTestInput(10240);
  const { encoded, hash } = bao.baoEncode(data);
  const slice = bao.baoSlice(encoded, 1024, 1024);
  const decoded = bao.baoDecodeSlice(slice, hash, 1024, 1024);
  assertArrayEqual(decoded, data.subarray(1024, 2048), 'Second chunk from 10KB');
});

test('Slice decode: last chunk of 10KB', () => {
  const data = generateTestInput(10240);
  const { encoded, hash } = bao.baoEncode(data);
  const slice = bao.baoSlice(encoded, 9216, 1024);
  const decoded = bao.baoDecodeSlice(slice, hash, 9216, 1024);
  assertArrayEqual(decoded, data.subarray(9216, 10240), 'Last chunk from 10KB');
});

test('Slice decode: small range from large file', () => {
  const data = generateTestInput(102400);
  const { encoded, hash } = bao.baoEncode(data);
  // Request 100 bytes from middle
  const slice = bao.baoSlice(encoded, 50000, 100);
  const decoded = bao.baoDecodeSlice(slice, hash, 50000, 100);
  assertArrayEqual(decoded, data.subarray(50000, 50100), 'Small range from 100KB');
});

// ============================
// Edge Cases
// ============================
console.log('\n--- Edge Cases ---\n');

test('Slice with length 0 treated as length 1', () => {
  const data = generateTestInput(100);
  const { encoded, hash } = bao.baoEncode(data);
  const slice = bao.baoSlice(encoded, 50, 0);
  // Should still include the chunk containing byte 50
  const decoded = bao.baoDecodeSlice(slice, hash, 50, 0);
  // With sliceLen=0, output is empty per spec
  assertEqual(decoded.length, 0, 'Zero-length slice output');
});

test('Slice past EOF includes final chunk', () => {
  const data = generateTestInput(100);
  const { encoded, hash } = bao.baoEncode(data);
  const slice = bao.baoSlice(encoded, 200, 50); // Past EOF
  // Should still be valid (contains final chunk)
  const decoded = bao.baoDecodeSlice(slice, hash, 200, 50);
  assertEqual(decoded.length, 0, 'Past-EOF slice output empty');
});

test('Empty file slice', () => {
  const data = new Uint8Array(0);
  const { encoded, hash } = bao.baoEncode(data);
  const slice = bao.baoSlice(encoded, 0, 1);
  const decoded = bao.baoDecodeSlice(slice, hash, 0, 1);
  assertEqual(decoded.length, 0, 'Empty file slice');
});

test('Slice at exact chunk boundary', () => {
  const data = generateTestInput(4096);
  const { encoded, hash } = bao.baoEncode(data);
  // Exactly chunk 2 (bytes 2048-3072)
  const slice = bao.baoSlice(encoded, 2048, 1024);
  const decoded = bao.baoDecodeSlice(slice, hash, 2048, 1024);
  assertArrayEqual(decoded, data.subarray(2048, 3072), 'Exact chunk boundary');
});

test('Slice crossing multiple chunks', () => {
  const data = generateTestInput(5120); // 5 chunks
  const { encoded, hash } = bao.baoEncode(data);
  // Bytes 500-4500 spans chunks 0-4
  const slice = bao.baoSlice(encoded, 500, 4000);
  const decoded = bao.baoDecodeSlice(slice, hash, 500, 4000);
  assertArrayEqual(decoded, data.subarray(500, 4500), 'Multi-chunk span');
});

// ============================
// Outboard Slice Tests
// ============================
console.log('\n--- Outboard Slice Tests ---\n');

test('Outboard slice extraction', () => {
  const data = generateTestInput(2048);
  const { encoded: outboard, hash } = bao.baoEncode(data, true);
  const slice = bao.baoSlice(outboard, 0, 1024, data);
  // Slice is combined format even from outboard source
  const decoded = bao.baoDecodeSlice(slice, hash, 0, 1024);
  assertArrayEqual(decoded, data.subarray(0, 1024), 'Outboard slice decode');
});

test('Outboard slice from middle', () => {
  const data = generateTestInput(10240);
  const { encoded: outboard, hash } = bao.baoEncode(data, true);
  const slice = bao.baoSlice(outboard, 5000, 2000, data);
  const decoded = bao.baoDecodeSlice(slice, hash, 5000, 2000);
  assertArrayEqual(decoded, data.subarray(5000, 7000), 'Outboard middle slice');
});

// ============================
// Error Detection
// ============================
console.log('\n--- Error Detection ---\n');

test('Corrupted slice data detected', () => {
  const data = generateTestInput(2048);
  const { encoded, hash } = bao.baoEncode(data);
  const slice = bao.baoSlice(encoded, 0, 1024);
  const corrupted = new Uint8Array(slice);
  corrupted[100] ^= 0xff; // Corrupt chunk data
  assertThrows(() => bao.baoDecodeSlice(corrupted, hash, 0, 1024), 'hash mismatch', 'Corrupted slice');
});

test('Wrong hash detected for slice', () => {
  const data = generateTestInput(2048);
  const { encoded, hash } = bao.baoEncode(data);
  const slice = bao.baoSlice(encoded, 0, 1024);
  const wrongHash = new Uint8Array(hash);
  wrongHash[0] ^= 0xff;
  assertThrows(() => bao.baoDecodeSlice(slice, wrongHash, 0, 1024), 'hash mismatch', 'Wrong hash');
});

test('Corrupted parent node in slice detected', () => {
  const data = generateTestInput(2048);
  const { encoded, hash } = bao.baoEncode(data);
  const slice = bao.baoSlice(encoded, 0, 2048);
  const corrupted = new Uint8Array(slice);
  corrupted[10] ^= 0xff; // Corrupt parent node
  assertThrows(() => bao.baoDecodeSlice(corrupted, hash, 0, 2048), 'hash mismatch', 'Corrupted parent');
});

// ============================
// Comprehensive Slice Tests
// ============================
console.log('\n--- Comprehensive Slice Tests ---\n');

test('All 1KB slices of 10KB file verify correctly', () => {
  const data = generateTestInput(10240);
  const { encoded, hash } = bao.baoEncode(data);

  for (let start = 0; start < 10240; start += 1024) {
    const len = Math.min(1024, 10240 - start);
    const slice = bao.baoSlice(encoded, start, len);
    const decoded = bao.baoDecodeSlice(slice, hash, start, len);
    assertArrayEqual(decoded, data.subarray(start, start + len), `Slice at ${start}`);
  }
});

test('Random access slices verify correctly', () => {
  const data = generateTestInput(10240);
  const { encoded, hash } = bao.baoEncode(data);

  const testCases = [
    [0, 100],
    [100, 200],
    [1000, 500],
    [1020, 10],
    [1024, 1],
    [5000, 2000],
    [9000, 1240],
  ];

  for (const [start, len] of testCases) {
    const slice = bao.baoSlice(encoded, start, len);
    const decoded = bao.baoDecodeSlice(slice, hash, start, len);
    assertArrayEqual(decoded, data.subarray(start, start + len), `Slice [${start}, ${start + len})`);
  }
});

// ============================
// Summary
// ============================
console.log('\n===============');
console.log(`Results: ${passed} passed, ${failed} failed`);

if (failed === 0) {
  console.log('\nAll Bao slice tests passed!');
} else {
  console.log('\nSome tests failed.');
  process.exit(1);
}

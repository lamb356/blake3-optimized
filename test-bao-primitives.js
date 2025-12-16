/**
 * Tests for Bao primitives
 * Verifies that chunkCV, parentCV, and leftLen work correctly
 */

const blake3 = require('./blake3.js');
const bao = require('./bao.js');

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

// Generate test input pattern: incrementing bytes mod 251
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
  const actualHex = toHex(actual);
  const expectedHex = toHex(expected);
  if (actualHex !== expectedHex) {
    throw new Error(`${msg}\n  Expected: ${expectedHex}\n  Got: ${actualHex}`);
  }
}

console.log('Bao Primitives Tests');
console.log('====================\n');

// ============================
// chunkCV Tests
// ============================
console.log('--- chunkCV Tests ---\n');

// Test: Single-chunk root hash should match blake3.hash
test('chunkCV(data, 0, true) === blake3.hash(data) for empty input', () => {
  const data = new Uint8Array(0);
  const chunkResult = bao.chunkCV(data, 0, true);
  const hashResult = blake3.hash(data);
  assertArrayEqual(chunkResult, hashResult, 'Empty input mismatch');
});

test('chunkCV(data, 0, true) === blake3.hash(data) for 1 byte', () => {
  const data = new Uint8Array([0x42]);
  const chunkResult = bao.chunkCV(data, 0, true);
  const hashResult = blake3.hash(data);
  assertArrayEqual(chunkResult, hashResult, '1 byte mismatch');
});

test('chunkCV(data, 0, true) === blake3.hash(data) for 64 bytes', () => {
  const data = generateTestInput(64);
  const chunkResult = bao.chunkCV(data, 0, true);
  const hashResult = blake3.hash(data);
  assertArrayEqual(chunkResult, hashResult, '64 byte mismatch');
});

test('chunkCV(data, 0, true) === blake3.hash(data) for 65 bytes', () => {
  const data = generateTestInput(65);
  const chunkResult = bao.chunkCV(data, 0, true);
  const hashResult = blake3.hash(data);
  assertArrayEqual(chunkResult, hashResult, '65 byte mismatch');
});

test('chunkCV(data, 0, true) === blake3.hash(data) for 1024 bytes', () => {
  const data = generateTestInput(1024);
  const chunkResult = bao.chunkCV(data, 0, true);
  const hashResult = blake3.hash(data);
  assertArrayEqual(chunkResult, hashResult, '1024 byte mismatch');
});

test('chunkCV(data, 0, true) === blake3.hash(data) for 100 bytes', () => {
  const data = generateTestInput(100);
  const chunkResult = bao.chunkCV(data, 0, true);
  const hashResult = blake3.hash(data);
  assertArrayEqual(chunkResult, hashResult, '100 byte mismatch');
});

test('chunkCV(data, 0, true) === blake3.hash(data) for 500 bytes', () => {
  const data = generateTestInput(500);
  const chunkResult = bao.chunkCV(data, 0, true);
  const hashResult = blake3.hash(data);
  assertArrayEqual(chunkResult, hashResult, '500 byte mismatch');
});

// Test: Non-root chunks should NOT match blake3.hash (different flags)
test('chunkCV(data, 0, false) !== blake3.hash(data) for non-root', () => {
  const data = generateTestInput(100);
  const chunkResult = bao.chunkCV(data, 0, false);
  const hashResult = blake3.hash(data);
  const chunkHex = toHex(chunkResult);
  const hashHex = toHex(hashResult);
  if (chunkHex === hashHex) {
    throw new Error('Non-root chunk should differ from hash');
  }
});

// Test: Different chunk indices should produce different results
test('Different chunk indices produce different CVs', () => {
  const data = generateTestInput(100);
  const cv0 = toHex(bao.chunkCV(data, 0, false));
  const cv1 = toHex(bao.chunkCV(data, 1, false));
  const cv2 = toHex(bao.chunkCV(data, 2, false));
  if (cv0 === cv1 || cv1 === cv2 || cv0 === cv2) {
    throw new Error('Different indices should produce different CVs');
  }
});

// ============================
// parentCV Tests
// ============================
console.log('\n--- parentCV Tests ---\n');

// Test: parent of two identical CVs
test('parentCV produces correct result for two CVs', () => {
  const left = new Uint8Array(32).fill(0x11);
  const right = new Uint8Array(32).fill(0x22);
  const result = bao.parentCV(left, right, false);
  assertEqual(result.length, 32, 'Parent CV should be 32 bytes');
});

// Test: parentCV is deterministic
test('parentCV is deterministic', () => {
  const left = generateTestInput(32);
  const right = new Uint8Array(32);
  for (let i = 0; i < 32; i++) right[i] = (i * 7) % 256;

  const result1 = toHex(bao.parentCV(left, right, false));
  const result2 = toHex(bao.parentCV(left, right, false));
  assertEqual(result1, result2, 'parentCV should be deterministic');
});

// Test: Order matters
test('parentCV(left, right) !== parentCV(right, left)', () => {
  const left = generateTestInput(32);
  const right = new Uint8Array(32);
  for (let i = 0; i < 32; i++) right[i] = (i * 7) % 256;

  const lr = toHex(bao.parentCV(left, right, false));
  const rl = toHex(bao.parentCV(right, left, false));
  if (lr === rl) {
    throw new Error('Order should matter for parentCV');
  }
});

// Test: Root flag changes result
test('parentCV with isRoot=true differs from isRoot=false', () => {
  const left = generateTestInput(32);
  const right = new Uint8Array(32);
  for (let i = 0; i < 32; i++) right[i] = (i * 7) % 256;

  const nonRoot = toHex(bao.parentCV(left, right, false));
  const asRoot = toHex(bao.parentCV(left, right, true));
  if (nonRoot === asRoot) {
    throw new Error('Root flag should change the result');
  }
});

// Test: Verify two-chunk hash using parentCV
test('Two chunks combined with parentCV matches blake3.hash', () => {
  // 2048 bytes = exactly 2 chunks
  const data = generateTestInput(2048);

  // Compute CVs for each chunk (not root)
  const cv0 = bao.chunkCV(data.subarray(0, 1024), 0, false);
  const cv1 = bao.chunkCV(data.subarray(1024, 2048), 1, false);

  // Combine with parentCV as root
  const rootCV = bao.parentCV(cv0, cv1, true);

  // Compare to blake3.hash
  const expected = blake3.hash(data);
  assertArrayEqual(rootCV, expected, 'Two-chunk tree should match blake3.hash');
});

// Test: Three chunks (left subtree = 2 chunks, right = 1 chunk)
test('Three chunks combined correctly matches blake3.hash', () => {
  // 2049 bytes = 3 chunks
  const data = generateTestInput(2049);

  // Left subtree: 2 chunks (2048 bytes)
  const cv0 = bao.chunkCV(data.subarray(0, 1024), 0, false);
  const cv1 = bao.chunkCV(data.subarray(1024, 2048), 1, false);
  const leftParentCV = bao.parentCV(cv0, cv1, false);

  // Right subtree: 1 chunk (1 byte)
  const cv2 = bao.chunkCV(data.subarray(2048, 2049), 2, false);

  // Root: combine left and right
  const rootCV = bao.parentCV(leftParentCV, cv2, true);

  // Compare to blake3.hash
  const expected = blake3.hash(data);
  assertArrayEqual(rootCV, expected, 'Three-chunk tree should match blake3.hash');
});

// Test: Four chunks
test('Four chunks combined correctly matches blake3.hash', () => {
  const data = generateTestInput(4096);

  const cv0 = bao.chunkCV(data.subarray(0, 1024), 0, false);
  const cv1 = bao.chunkCV(data.subarray(1024, 2048), 1, false);
  const cv2 = bao.chunkCV(data.subarray(2048, 3072), 2, false);
  const cv3 = bao.chunkCV(data.subarray(3072, 4096), 3, false);

  // Left subtree
  const left = bao.parentCV(cv0, cv1, false);
  // Right subtree
  const right = bao.parentCV(cv2, cv3, false);
  // Root
  const rootCV = bao.parentCV(left, right, true);

  const expected = blake3.hash(data);
  assertArrayEqual(rootCV, expected, 'Four-chunk tree should match blake3.hash');
});

// ============================
// leftLen Tests
// ============================
console.log('\n--- leftLen Tests ---\n');

// Test cases from Python reference
test('leftLen(2049) = 2048', () => {
  assertEqual(bao.leftLen(2049), 2048, 'leftLen(2049)');
});

test('leftLen(4096) = 2048', () => {
  assertEqual(bao.leftLen(4096), 2048, 'leftLen(4096)');
});

test('leftLen(5120) = 4096', () => {
  assertEqual(bao.leftLen(5120), 4096, 'leftLen(5120)');
});

test('leftLen(1025) = 1024', () => {
  assertEqual(bao.leftLen(1025), 1024, 'leftLen(1025)');
});

test('leftLen(3072) = 2048', () => {
  assertEqual(bao.leftLen(3072), 2048, 'leftLen(3072)');
});

test('leftLen(3073) = 2048', () => {
  assertEqual(bao.leftLen(3073), 2048, 'leftLen(3073)');
});

test('leftLen(8192) = 4096', () => {
  assertEqual(bao.leftLen(8192), 4096, 'leftLen(8192)');
});

test('leftLen(8193) = 8192', () => {
  assertEqual(bao.leftLen(8193), 8192, 'leftLen(8193)');
});

// Verify the split always leaves room for right subtree
test('leftLen always leaves room for right subtree', () => {
  const testCases = [1025, 2048, 2049, 3000, 4096, 5000, 8192, 10000, 16384, 100000];
  for (const len of testCases) {
    const left = bao.leftLen(len);
    const right = len - left;
    if (right <= 0) {
      throw new Error(`leftLen(${len}) = ${left}, leaves no room for right`);
    }
    if (left <= 0) {
      throw new Error(`leftLen(${len}) = ${left}, left is empty`);
    }
  }
});

// ============================
// countChunks Tests
// ============================
console.log('\n--- countChunks Tests ---\n');

test('countChunks(0) = 1', () => {
  assertEqual(bao.countChunks(0), 1, 'Empty content is 1 chunk');
});

test('countChunks(1) = 1', () => {
  assertEqual(bao.countChunks(1), 1, '1 byte is 1 chunk');
});

test('countChunks(1024) = 1', () => {
  assertEqual(bao.countChunks(1024), 1, '1024 bytes is 1 chunk');
});

test('countChunks(1025) = 2', () => {
  assertEqual(bao.countChunks(1025), 2, '1025 bytes is 2 chunks');
});

test('countChunks(2048) = 2', () => {
  assertEqual(bao.countChunks(2048), 2, '2048 bytes is 2 chunks');
});

test('countChunks(2049) = 3', () => {
  assertEqual(bao.countChunks(2049), 3, '2049 bytes is 3 chunks');
});

// ============================
// encodedSubtreeSize Tests
// ============================
console.log('\n--- encodedSubtreeSize Tests ---\n');

test('encodedSubtreeSize(0, true) = 0', () => {
  // 1 chunk, 0 parents
  assertEqual(bao.encodedSubtreeSize(0, true), 0, 'Empty outboard');
});

test('encodedSubtreeSize(1024, true) = 0', () => {
  // 1 chunk, 0 parents
  assertEqual(bao.encodedSubtreeSize(1024, true), 0, '1 chunk outboard');
});

test('encodedSubtreeSize(2048, true) = 64', () => {
  // 2 chunks, 1 parent
  assertEqual(bao.encodedSubtreeSize(2048, true), 64, '2 chunks outboard');
});

test('encodedSubtreeSize(2049, true) = 128', () => {
  // 3 chunks, 2 parents
  assertEqual(bao.encodedSubtreeSize(2049, true), 128, '3 chunks outboard');
});

test('encodedSubtreeSize(4096, true) = 192', () => {
  // 4 chunks, 3 parents
  assertEqual(bao.encodedSubtreeSize(4096, true), 192, '4 chunks outboard');
});

// Combined encoding includes content
test('encodedSubtreeSize(2048, false) = 2048 + 64', () => {
  assertEqual(bao.encodedSubtreeSize(2048, false), 2048 + 64, '2 chunks combined');
});

// ============================
// Integration: Larger trees
// ============================
console.log('\n--- Larger Tree Integration Tests ---\n');

// Recursive hash function using Bao primitives
function baoHash(data) {
  const len = data.length;

  if (len <= 1024) {
    // Single chunk - root
    return bao.chunkCV(data, 0, true);
  }

  // Build tree recursively
  function hashSubtree(buf, chunkIndexStart, isRoot) {
    if (buf.length <= 1024) {
      return bao.chunkCV(buf, chunkIndexStart, isRoot);
    }

    const lLen = bao.leftLen(buf.length);
    const leftChunks = Math.ceil(lLen / 1024);

    const leftCV = hashSubtree(buf.subarray(0, lLen), chunkIndexStart, false);
    const rightCV = hashSubtree(buf.subarray(lLen), chunkIndexStart + leftChunks, false);

    return bao.parentCV(leftCV, rightCV, isRoot);
  }

  return hashSubtree(data, 0, true);
}

test('Bao tree hash matches blake3.hash for 5 chunks', () => {
  const data = generateTestInput(5000);
  const baoResult = baoHash(data);
  const expected = blake3.hash(data);
  assertArrayEqual(baoResult, expected, '5 chunks');
});

test('Bao tree hash matches blake3.hash for 8 chunks', () => {
  const data = generateTestInput(8192);
  const baoResult = baoHash(data);
  const expected = blake3.hash(data);
  assertArrayEqual(baoResult, expected, '8 chunks');
});

test('Bao tree hash matches blake3.hash for 16 chunks', () => {
  const data = generateTestInput(16384);
  const baoResult = baoHash(data);
  const expected = blake3.hash(data);
  assertArrayEqual(baoResult, expected, '16 chunks');
});

test('Bao tree hash matches blake3.hash for 100KB', () => {
  const data = generateTestInput(102400);
  const baoResult = baoHash(data);
  const expected = blake3.hash(data);
  assertArrayEqual(baoResult, expected, '100KB');
});

// ============================
// Summary
// ============================
console.log('\n====================');
console.log(`Results: ${passed} passed, ${failed} failed`);

if (failed === 0) {
  console.log('\nAll Bao primitives tests passed!');
} else {
  console.log('\nSome tests failed.');
  process.exit(1);
}

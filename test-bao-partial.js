/**
 * Tests for PartialBao - Resumable Downloads with Bitfield Tracking
 *
 * Tests incomplete file downloads, bitfield operations, and
 * resumable/multi-source file assembly.
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

function assertDeepEqual(actual, expected, msg) {
  const actualStr = JSON.stringify(actual);
  const expectedStr = JSON.stringify(expected);
  if (actualStr !== expectedStr) {
    throw new Error(`${msg}\n  Expected: ${expectedStr}\n  Got: ${actualStr}`);
  }
}

console.log('PartialBao Tests - Resumable Downloads');
console.log('======================================\n');

// Constants
const CHUNK_LEN = 1024;
const CHUNK_GROUP_LOG = 4;  // 16 chunks per group
const CHUNK_GROUP_SIZE = CHUNK_LEN * (1 << CHUNK_GROUP_LOG);  // 16384 bytes

// ============================
// Bitfield Helper Tests
// ============================
console.log('--- Bitfield Helper Tests ---\n');

test('createBitfield: creates correct size', () => {
  const bf1 = bao.createBitfield(1);
  assertEqual(bf1.length, 1, '1 bit needs 1 byte');

  const bf8 = bao.createBitfield(8);
  assertEqual(bf8.length, 1, '8 bits needs 1 byte');

  const bf9 = bao.createBitfield(9);
  assertEqual(bf9.length, 2, '9 bits needs 2 bytes');

  const bf64 = bao.createBitfield(64);
  assertEqual(bf64.length, 8, '64 bits needs 8 bytes');
});

test('createBitfield: initialized to zeros', () => {
  const bf = bao.createBitfield(16);
  for (let i = 0; i < bf.length; i++) {
    assertEqual(bf[i], 0, `Byte ${i} should be 0`);
  }
});

test('setBit/getBit: basic operations', () => {
  const bf = bao.createBitfield(16);

  assertEqual(bao.getBit(bf, 0), false, 'Bit 0 should be unset');

  bao.setBit(bf, 0);
  assertEqual(bao.getBit(bf, 0), true, 'Bit 0 should be set');

  bao.setBit(bf, 7);
  assertEqual(bao.getBit(bf, 7), true, 'Bit 7 should be set');

  bao.setBit(bf, 8);
  assertEqual(bao.getBit(bf, 8), true, 'Bit 8 should be set');

  assertEqual(bao.getBit(bf, 1), false, 'Bit 1 should still be unset');
});

test('clearBit: clears bits', () => {
  const bf = bao.createBitfield(16);

  bao.setBit(bf, 5);
  assertEqual(bao.getBit(bf, 5), true, 'Bit 5 should be set');

  bao.clearBit(bf, 5);
  assertEqual(bao.getBit(bf, 5), false, 'Bit 5 should be cleared');
});

test('countSetBits: counts correctly', () => {
  const bf = bao.createBitfield(16);

  assertEqual(bao.countSetBits(bf, 16), 0, 'Should have 0 bits set');

  bao.setBit(bf, 0);
  bao.setBit(bf, 5);
  bao.setBit(bf, 15);

  assertEqual(bao.countSetBits(bf, 16), 3, 'Should have 3 bits set');
});

test('countSetBits: respects numBits parameter', () => {
  const bf = bao.createBitfield(16);
  bao.setBit(bf, 8);  // In second byte

  assertEqual(bao.countSetBits(bf, 8), 0, 'Should count 0 in first 8 bits');
  assertEqual(bao.countSetBits(bf, 16), 1, 'Should count 1 in first 16 bits');
});

// ============================
// PartialBao Constructor Tests
// ============================
console.log('\n--- PartialBao Constructor Tests ---\n');

test('Constructor: basic initialization', () => {
  const data = generateInput(50000);  // ~3 groups
  const { hash } = bao.baoEncodeIroh(data, true);

  const partial = new bao.PartialBao(hash, data.length);

  assertEqual(partial.contentLen, 50000, 'Content length should match');
  assertEqual(partial.numGroups, 4, '50KB should have 4 groups');
  assertEqual(partial.receivedGroups, 0, 'Should have 0 received groups');
  assertEqual(partial.isComplete(), false, 'Should not be complete');
});

test('Constructor: rejects invalid hash length', () => {
  let threw = false;
  try {
    new bao.PartialBao(new Uint8Array(16), 1000);
  } catch (e) {
    threw = true;
  }
  assertEqual(threw, true, 'Should throw on invalid hash length');
});

test('Constructor: rejects negative content length', () => {
  let threw = false;
  try {
    new bao.PartialBao(new Uint8Array(32), -1);
  } catch (e) {
    threw = true;
  }
  assertEqual(threw, true, 'Should throw on negative content length');
});

test('Constructor: handles empty file', () => {
  const data = new Uint8Array(0);
  const { hash } = bao.baoEncodeIroh(data, true);

  const partial = new bao.PartialBao(hash, 0);

  assertEqual(partial.numGroups, 1, 'Empty file should have 1 group');
  assertEqual(partial.getGroupSize(0), 0, 'Group 0 should be 0 bytes');
});

test('Constructor: handles single group', () => {
  const data = generateInput(10000);  // < 16 KiB
  const { hash } = bao.baoEncodeIroh(data, true);

  const partial = new bao.PartialBao(hash, data.length);

  assertEqual(partial.numGroups, 1, 'Should have 1 group');
});

test('Constructor: custom chunkGroupLog', () => {
  const data = generateInput(50000);
  const { hash } = bao.baoEncodeIroh(data, true, 3);  // 8 chunks per group

  const partial = new bao.PartialBao(hash, data.length, 3);

  // 50000 bytes / 8192 bytes per group = 7 groups
  assertEqual(partial.numGroups, 7, 'Should have 7 groups with log=3');
});

// ============================
// Group Size Tests
// ============================
console.log('\n--- Group Size Tests ---\n');

test('getGroupSize: full groups', () => {
  const data = generateInput(32768);  // Exactly 2 groups
  const { hash } = bao.baoEncodeIroh(data, true);

  const partial = new bao.PartialBao(hash, data.length);

  assertEqual(partial.getGroupSize(0), 16384, 'Group 0 should be full');
  assertEqual(partial.getGroupSize(1), 16384, 'Group 1 should be full');
});

test('getGroupSize: partial last group', () => {
  const data = generateInput(20000);  // 1 full + 1 partial group
  const { hash } = bao.baoEncodeIroh(data, true);

  const partial = new bao.PartialBao(hash, data.length);

  assertEqual(partial.getGroupSize(0), 16384, 'Group 0 should be full');
  assertEqual(partial.getGroupSize(1), 20000 - 16384, 'Group 1 should be partial');
});

test('getGroupSize: invalid index throws', () => {
  const data = generateInput(10000);
  const { hash } = bao.baoEncodeIroh(data, true);
  const partial = new bao.PartialBao(hash, data.length);

  let threw = false;
  try {
    partial.getGroupSize(5);
  } catch (e) {
    threw = true;
  }
  assertEqual(threw, true, 'Should throw on invalid index');
});

// ============================
// Adding Groups (Trusted) Tests
// ============================
console.log('\n--- addChunkGroupTrusted Tests ---\n');

test('addChunkGroupTrusted: add single group', () => {
  const data = generateInput(10000);
  const { hash } = bao.baoEncodeIroh(data, true);

  const partial = new bao.PartialBao(hash, data.length);

  partial.addChunkGroupTrusted(0, data);

  assertEqual(partial.hasGroup(0), true, 'Should have group 0');
  assertEqual(partial.receivedGroups, 1, 'Should have 1 received group');
  assertEqual(partial.isComplete(), true, 'Should be complete');
});

test('addChunkGroupTrusted: add multiple groups', () => {
  const data = generateInput(50000);  // 4 groups
  const { hash } = bao.baoEncodeIroh(data, true);

  const partial = new bao.PartialBao(hash, data.length);

  // Add groups out of order
  partial.addChunkGroupTrusted(2, data.subarray(2 * 16384, 3 * 16384));
  assertEqual(partial.hasGroup(2), true, 'Should have group 2');
  assertEqual(partial.receivedGroups, 1, 'Should have 1 group');

  partial.addChunkGroupTrusted(0, data.subarray(0, 16384));
  assertEqual(partial.hasGroup(0), true, 'Should have group 0');
  assertEqual(partial.receivedGroups, 2, 'Should have 2 groups');
});

test('addChunkGroupTrusted: wrong size throws', () => {
  const data = generateInput(50000);
  const { hash } = bao.baoEncodeIroh(data, true);

  const partial = new bao.PartialBao(hash, data.length);

  let threw = false;
  try {
    partial.addChunkGroupTrusted(0, new Uint8Array(100));  // Wrong size
  } catch (e) {
    threw = true;
  }
  assertEqual(threw, true, 'Should throw on wrong data size');
});

test('addChunkGroupTrusted: invalid index throws', () => {
  const data = generateInput(50000);
  const { hash } = bao.baoEncodeIroh(data, true);

  const partial = new bao.PartialBao(hash, data.length);

  let threw = false;
  try {
    partial.addChunkGroupTrusted(10, new Uint8Array(16384));
  } catch (e) {
    threw = true;
  }
  assertEqual(threw, true, 'Should throw on invalid index');
});

// ============================
// Adding Groups with Proof Tests
// ============================
console.log('\n--- addChunkGroup (with proof) Tests ---\n');

test('addChunkGroup: single group (no proof needed)', () => {
  const data = generateInput(10000);
  const { hash } = bao.baoEncodeIroh(data, true);

  const partial = new bao.PartialBao(hash, data.length);

  // Single group doesn't need proof
  const result = partial.addChunkGroup(0, data, []);

  assertEqual(result, true, 'Should return true');
  assertEqual(partial.isComplete(), true, 'Should be complete');
});

test('addChunkGroup: wrong data for single group fails', () => {
  const data = generateInput(10000);
  const { hash } = bao.baoEncodeIroh(data, true);

  const partial = new bao.PartialBao(hash, data.length);

  // Corrupt the data
  const corrupted = new Uint8Array(data);
  corrupted[0] ^= 0xff;

  let threw = false;
  try {
    partial.addChunkGroup(0, corrupted, []);
  } catch (e) {
    threw = true;
  }
  assertEqual(threw, true, 'Should throw on wrong data');
});

test('addChunkGroup: duplicate group returns true', () => {
  const data = generateInput(10000);
  const { hash } = bao.baoEncodeIroh(data, true);

  const partial = new bao.PartialBao(hash, data.length);

  partial.addChunkGroup(0, data, []);
  const result = partial.addChunkGroup(0, data, []);

  assertEqual(result, true, 'Should return true for duplicate');
});

// ============================
// Proof Creation and Verification Tests
// ============================
console.log('\n--- Proof Creation/Verification Tests ---\n');

test('createProof: single group returns empty proof', () => {
  const data = generateInput(10000);
  const { hash } = bao.baoEncodeIroh(data, true);

  const partial = new bao.PartialBao(hash, data.length);
  partial.addChunkGroupTrusted(0, data);

  const proof = partial.createProof(0);
  assertEqual(proof.length, 0, 'Single group should have empty proof');
});

test('createProof: two groups', () => {
  const data = generateInput(32768);  // 2 groups
  const { hash } = bao.baoEncodeIroh(data, true);

  const partial = new bao.PartialBao(hash, data.length);
  partial.addChunkGroupTrusted(0, data.subarray(0, 16384));
  partial.addChunkGroupTrusted(1, data.subarray(16384, 32768));

  const proof0 = partial.createProof(0);
  const proof1 = partial.createProof(1);

  assertEqual(proof0.length, 1, 'Proof for group 0 should have 1 element');
  assertEqual(proof1.length, 1, 'Proof for group 1 should have 1 element');
});

test('createProof: verify round-trip', () => {
  const data = generateInput(50000);  // 4 groups
  const { hash } = bao.baoEncodeIroh(data, true);

  // Create complete partial to generate proofs
  const source = new bao.PartialBao(hash, data.length);
  for (let i = 0; i < source.numGroups; i++) {
    const start = i * 16384;
    const end = Math.min(start + 16384, data.length);
    source.addChunkGroupTrusted(i, data.subarray(start, end));
  }

  // Create new partial and add groups with proofs
  const dest = new bao.PartialBao(hash, data.length);

  for (let i = 0; i < source.numGroups; i++) {
    const groupData = source.getGroupData(i);
    const proof = source.createProof(i);

    const result = dest.addChunkGroup(i, groupData, proof);
    assertEqual(result, true, `Group ${i} should be verified`);
  }

  assertEqual(dest.isComplete(), true, 'Destination should be complete');
});

test('createProof: fails when incomplete', () => {
  const data = generateInput(50000);
  const { hash } = bao.baoEncodeIroh(data, true);

  const partial = new bao.PartialBao(hash, data.length);
  partial.addChunkGroupTrusted(0, data.subarray(0, 16384));
  // Missing groups 1, 2, 3

  let threw = false;
  try {
    partial.createProof(0);
  } catch (e) {
    threw = true;
  }
  assertEqual(threw, true, 'Should throw when incomplete');
});

// ============================
// Bitfield Tests
// ============================
console.log('\n--- Bitfield Get/Set Tests ---\n');

test('getBitfield: returns copy', () => {
  const data = generateInput(50000);
  const { hash } = bao.baoEncodeIroh(data, true);

  const partial = new bao.PartialBao(hash, data.length);
  partial.addChunkGroupTrusted(0, data.subarray(0, 16384));

  const bf = partial.getBitfield();

  // Modify the copy
  bf[0] = 0xff;

  // Original should be unchanged
  assertEqual(partial.hasGroup(1), false, 'Group 1 should still be missing');
});

test('setBitfield: sets bitfield', () => {
  const data = generateInput(50000);
  const { hash } = bao.baoEncodeIroh(data, true);

  const partial = new bao.PartialBao(hash, data.length);

  const bf = new Uint8Array(1);
  bf[0] = 0b00001010;  // Groups 1 and 3 set

  partial.setBitfield(bf);

  assertEqual(partial.hasGroup(0), false, 'Group 0 should be missing');
  assertEqual(partial.hasGroup(1), true, 'Group 1 should be present');
  assertEqual(partial.hasGroup(2), false, 'Group 2 should be missing');
  assertEqual(partial.hasGroup(3), true, 'Group 3 should be present');
});

test('setBitfield: rejects wrong size', () => {
  const data = generateInput(50000);
  const { hash } = bao.baoEncodeIroh(data, true);

  const partial = new bao.PartialBao(hash, data.length);

  let threw = false;
  try {
    partial.setBitfield(new Uint8Array(10));  // Wrong size
  } catch (e) {
    threw = true;
  }
  assertEqual(threw, true, 'Should throw on wrong bitfield size');
});

// ============================
// Missing/Present Ranges Tests
// ============================
console.log('\n--- Missing/Present Ranges Tests ---\n');

test('getMissingRanges: all missing', () => {
  const data = generateInput(64 * 1024);  // 4 groups
  const { hash } = bao.baoEncodeIroh(data, true);

  const partial = new bao.PartialBao(hash, data.length);

  const ranges = partial.getMissingRanges();
  assertDeepEqual(ranges, [{ start: 0, end: 4 }], 'All groups should be missing');
});

test('getMissingRanges: none missing', () => {
  const data = generateInput(10000);  // 1 group
  const { hash } = bao.baoEncodeIroh(data, true);

  const partial = new bao.PartialBao(hash, data.length);
  partial.addChunkGroupTrusted(0, data);

  const ranges = partial.getMissingRanges();
  assertDeepEqual(ranges, [], 'No groups should be missing');
});

test('getMissingRanges: gap in middle', () => {
  const data = generateInput(64 * 1024);  // 4 groups
  const { hash } = bao.baoEncodeIroh(data, true);

  const partial = new bao.PartialBao(hash, data.length);
  partial.addChunkGroupTrusted(0, data.subarray(0, 16384));
  partial.addChunkGroupTrusted(3, data.subarray(3 * 16384));

  const ranges = partial.getMissingRanges();
  assertDeepEqual(ranges, [{ start: 1, end: 3 }], 'Groups 1-2 should be missing');
});

test('getMissingRanges: multiple gaps', () => {
  const data = generateInput(128 * 1024);  // 8 groups
  const { hash } = bao.baoEncodeIroh(data, true);

  const partial = new bao.PartialBao(hash, data.length);
  // Add groups 0, 2, 4, 6
  partial.addChunkGroupTrusted(0, data.subarray(0, 16384));
  partial.addChunkGroupTrusted(2, data.subarray(2 * 16384, 3 * 16384));
  partial.addChunkGroupTrusted(4, data.subarray(4 * 16384, 5 * 16384));
  partial.addChunkGroupTrusted(6, data.subarray(6 * 16384, 7 * 16384));

  const ranges = partial.getMissingRanges();
  assertDeepEqual(ranges, [
    { start: 1, end: 2 },
    { start: 3, end: 4 },
    { start: 5, end: 6 },
    { start: 7, end: 8 }
  ], 'Should have 4 single-group gaps');
});

test('getPresentRanges: none present', () => {
  const data = generateInput(64 * 1024);
  const { hash } = bao.baoEncodeIroh(data, true);

  const partial = new bao.PartialBao(hash, data.length);

  const ranges = partial.getPresentRanges();
  assertDeepEqual(ranges, [], 'No groups should be present');
});

test('getPresentRanges: contiguous', () => {
  const data = generateInput(64 * 1024);  // 4 groups
  const { hash } = bao.baoEncodeIroh(data, true);

  const partial = new bao.PartialBao(hash, data.length);
  partial.addChunkGroupTrusted(0, data.subarray(0, 16384));
  partial.addChunkGroupTrusted(1, data.subarray(16384, 2 * 16384));

  const ranges = partial.getPresentRanges();
  assertDeepEqual(ranges, [{ start: 0, end: 2 }], 'Groups 0-1 should be present');
});

test('getMissingGroups: returns list', () => {
  const data = generateInput(64 * 1024);  // 4 groups
  const { hash } = bao.baoEncodeIroh(data, true);

  const partial = new bao.PartialBao(hash, data.length);
  partial.addChunkGroupTrusted(1, data.subarray(16384, 2 * 16384));

  const missing = partial.getMissingGroups();
  assertDeepEqual(missing, [0, 2, 3], 'Groups 0, 2, 3 should be missing');
});

test('getPresentGroups: returns list', () => {
  const data = generateInput(64 * 1024);  // 4 groups
  const { hash } = bao.baoEncodeIroh(data, true);

  const partial = new bao.PartialBao(hash, data.length);
  partial.addChunkGroupTrusted(1, data.subarray(16384, 2 * 16384));
  partial.addChunkGroupTrusted(3, data.subarray(3 * 16384));

  const present = partial.getPresentGroups();
  assertDeepEqual(present, [1, 3], 'Groups 1, 3 should be present');
});

// ============================
// Progress Tests
// ============================
console.log('\n--- Progress Tests ---\n');

test('getProgress: 0% at start', () => {
  const data = generateInput(64 * 1024);  // 4 groups
  const { hash } = bao.baoEncodeIroh(data, true);

  const partial = new bao.PartialBao(hash, data.length);

  assertEqual(partial.getProgress(), 0, 'Should be 0%');
});

test('getProgress: 25% with 1 of 4 groups', () => {
  const data = generateInput(64 * 1024);  // 4 groups
  const { hash } = bao.baoEncodeIroh(data, true);

  const partial = new bao.PartialBao(hash, data.length);
  partial.addChunkGroupTrusted(0, data.subarray(0, 16384));

  assertEqual(partial.getProgress(), 25, 'Should be 25%');
});

test('getProgress: 100% when complete', () => {
  const data = generateInput(10000);  // 1 group
  const { hash } = bao.baoEncodeIroh(data, true);

  const partial = new bao.PartialBao(hash, data.length);
  partial.addChunkGroupTrusted(0, data);

  assertEqual(partial.getProgress(), 100, 'Should be 100%');
});

// ============================
// Finalize Tests
// ============================
console.log('\n--- Finalize Tests ---\n');

test('finalize: returns complete data', () => {
  const data = generateInput(50000);  // 4 groups
  const { hash } = bao.baoEncodeIroh(data, true);

  const partial = new bao.PartialBao(hash, data.length);

  // Add all groups
  for (let i = 0; i < partial.numGroups; i++) {
    const start = i * 16384;
    const end = Math.min(start + 16384, data.length);
    partial.addChunkGroupTrusted(i, data.subarray(start, end));
  }

  const result = partial.finalize();
  assertArrayEqual(result, data, 'Finalized data should match original');
});

test('finalize: throws when incomplete', () => {
  const data = generateInput(50000);
  const { hash } = bao.baoEncodeIroh(data, true);

  const partial = new bao.PartialBao(hash, data.length);
  partial.addChunkGroupTrusted(0, data.subarray(0, 16384));
  // Missing groups 1, 2, 3

  let threw = false;
  try {
    partial.finalize();
  } catch (e) {
    threw = true;
  }
  assertEqual(threw, true, 'Should throw when incomplete');
});

test('finalize: verify=false skips verification', () => {
  const data = generateInput(10000);
  const { hash } = bao.baoEncodeIroh(data, true);

  const partial = new bao.PartialBao(hash, data.length);
  partial.addChunkGroupTrusted(0, data);

  const result = partial.finalize(false);
  assertArrayEqual(result, data, 'Should return data without verification');
});

test('finalize: assembles non-contiguous groups correctly', () => {
  const data = generateInput(64 * 1024);  // 4 groups
  const { hash } = bao.baoEncodeIroh(data, true);

  const partial = new bao.PartialBao(hash, data.length);

  // Add groups in reverse order
  for (let i = 3; i >= 0; i--) {
    const start = i * 16384;
    const end = Math.min(start + 16384, data.length);
    partial.addChunkGroupTrusted(i, data.subarray(start, end));
  }

  const result = partial.finalize();
  assertArrayEqual(result, data, 'Data should be correctly assembled');
});

// ============================
// Serialization Tests
// ============================
console.log('\n--- Serialization Tests ---\n');

test('exportState/importState: round-trip', () => {
  const data = generateInput(50000);  // 4 groups
  const { hash } = bao.baoEncodeIroh(data, true);

  const original = new bao.PartialBao(hash, data.length);

  // Add some groups
  original.addChunkGroupTrusted(0, data.subarray(0, 16384));
  original.addChunkGroupTrusted(2, data.subarray(2 * 16384, 3 * 16384));

  // Export and import
  const state = original.exportState();
  const restored = bao.PartialBao.importState(state);

  // Verify restored state
  assertEqual(restored.contentLen, original.contentLen, 'Content length should match');
  assertEqual(restored.numGroups, original.numGroups, 'Num groups should match');
  assertEqual(restored.receivedGroups, original.receivedGroups, 'Received groups should match');
  assertEqual(restored.hasGroup(0), true, 'Should have group 0');
  assertEqual(restored.hasGroup(1), false, 'Should not have group 1');
  assertEqual(restored.hasGroup(2), true, 'Should have group 2');
  assertEqual(restored.hasGroup(3), false, 'Should not have group 3');

  // Verify group data
  assertArrayEqual(restored.getGroupData(0), original.getGroupData(0), 'Group 0 data should match');
  assertArrayEqual(restored.getGroupData(2), original.getGroupData(2), 'Group 2 data should match');
});

test('exportState: serializable to JSON', () => {
  const data = generateInput(10000);
  const { hash } = bao.baoEncodeIroh(data, true);

  const partial = new bao.PartialBao(hash, data.length);
  partial.addChunkGroupTrusted(0, data);

  const state = partial.exportState();
  const json = JSON.stringify(state);
  const parsed = JSON.parse(json);

  const restored = bao.PartialBao.importState(parsed);
  assertEqual(restored.isComplete(), true, 'Restored should be complete');
});

test('exportState/importState: complete file', () => {
  const data = generateInput(50000);
  const { hash } = bao.baoEncodeIroh(data, true);

  const original = new bao.PartialBao(hash, data.length);

  // Add all groups
  for (let i = 0; i < original.numGroups; i++) {
    const start = i * 16384;
    const end = Math.min(start + 16384, data.length);
    original.addChunkGroupTrusted(i, data.subarray(start, end));
  }

  // Export and import
  const state = original.exportState();
  const restored = bao.PartialBao.importState(state);

  // Finalize and verify
  const result = restored.finalize();
  assertArrayEqual(result, data, 'Restored and finalized data should match');
});

// ============================
// getGroupData Tests
// ============================
console.log('\n--- getGroupData Tests ---\n');

test('getGroupData: returns null for missing group', () => {
  const data = generateInput(50000);
  const { hash } = bao.baoEncodeIroh(data, true);

  const partial = new bao.PartialBao(hash, data.length);

  const result = partial.getGroupData(0);
  assertEqual(result, null, 'Should return null for missing group');
});

test('getGroupData: returns data for present group', () => {
  const data = generateInput(50000);
  const { hash } = bao.baoEncodeIroh(data, true);

  const partial = new bao.PartialBao(hash, data.length);
  const group0 = data.subarray(0, 16384);
  partial.addChunkGroupTrusted(0, group0);

  const result = partial.getGroupData(0);
  assertArrayEqual(result, group0, 'Should return correct data');
});

// ============================
// Integration Tests
// ============================
console.log('\n--- Integration Tests ---\n');

test('Integration: simulate multi-source download', () => {
  const data = generateInput(64 * 1024);  // 4 groups
  const { hash } = bao.baoEncodeIroh(data, true);

  // Source A has groups 0, 2
  const sourceA = new bao.PartialBao(hash, data.length);
  sourceA.addChunkGroupTrusted(0, data.subarray(0, 16384));
  sourceA.addChunkGroupTrusted(2, data.subarray(2 * 16384, 3 * 16384));

  // Source B has groups 1, 3
  const sourceB = new bao.PartialBao(hash, data.length);
  sourceB.addChunkGroupTrusted(1, data.subarray(16384, 2 * 16384));
  sourceB.addChunkGroupTrusted(3, data.subarray(3 * 16384));

  // Destination assembles from both sources
  const dest = new bao.PartialBao(hash, data.length);

  // Get missing from perspective of dest
  assertEqual(dest.getMissingGroups().length, 4, 'Should need all 4 groups');

  // Download from source A
  for (const idx of sourceA.getPresentGroups()) {
    dest.addChunkGroupTrusted(idx, sourceA.getGroupData(idx));
  }
  assertEqual(dest.receivedGroups, 2, 'Should have 2 groups after source A');

  // Download from source B
  for (const idx of sourceB.getPresentGroups()) {
    if (!dest.hasGroup(idx)) {
      dest.addChunkGroupTrusted(idx, sourceB.getGroupData(idx));
    }
  }
  assertEqual(dest.isComplete(), true, 'Should be complete after both sources');

  const result = dest.finalize();
  assertArrayEqual(result, data, 'Assembled data should match original');
});

test('Integration: resume interrupted download', () => {
  const data = generateInput(64 * 1024);
  const { hash } = bao.baoEncodeIroh(data, true);

  // Start download, get groups 0 and 1
  const session1 = new bao.PartialBao(hash, data.length);
  session1.addChunkGroupTrusted(0, data.subarray(0, 16384));
  session1.addChunkGroupTrusted(1, data.subarray(16384, 2 * 16384));

  // "Save" state
  const savedState = JSON.stringify(session1.exportState());

  // Simulate restart - restore state
  const session2 = bao.PartialBao.importState(JSON.parse(savedState));

  // Continue downloading
  assertEqual(session2.getMissingGroups().length, 2, 'Should need 2 more groups');

  session2.addChunkGroupTrusted(2, data.subarray(2 * 16384, 3 * 16384));
  session2.addChunkGroupTrusted(3, data.subarray(3 * 16384));

  const result = session2.finalize();
  assertArrayEqual(result, data, 'Resumed download should complete correctly');
});

test('Integration: large file with many groups', () => {
  const data = generateInput(1024 * 1024);  // 1 MB = 64 groups
  const { hash } = bao.baoEncodeIroh(data, true);

  const partial = new bao.PartialBao(hash, data.length);

  assertEqual(partial.numGroups, 64, '1 MB should have 64 groups');

  // Add groups in random order
  const indices = Array.from({ length: 64 }, (_, i) => i);
  // Fisher-Yates shuffle
  for (let i = indices.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [indices[i], indices[j]] = [indices[j], indices[i]];
  }

  for (const i of indices) {
    const start = i * 16384;
    const end = Math.min(start + 16384, data.length);
    partial.addChunkGroupTrusted(i, data.subarray(start, end));
  }

  assertEqual(partial.isComplete(), true, 'Should be complete');
  const result = partial.finalize();
  assertArrayEqual(result, data, 'Data should match after random-order assembly');
});

// ============================
// Edge Case Tests
// ============================
console.log('\n--- Edge Case Tests ---\n');

test('Edge: empty file', () => {
  const data = new Uint8Array(0);
  const { hash } = bao.baoEncodeIroh(data, true);

  const partial = new bao.PartialBao(hash, 0);

  assertEqual(partial.numGroups, 1, 'Empty file has 1 group');
  assertEqual(partial.getGroupSize(0), 0, 'Group 0 size is 0');

  partial.addChunkGroupTrusted(0, new Uint8Array(0));
  assertEqual(partial.isComplete(), true, 'Should be complete');

  const result = partial.finalize();
  assertEqual(result.length, 0, 'Finalized should be empty');
});

test('Edge: exactly one group', () => {
  const data = generateInput(16384);  // Exactly 1 group
  const { hash } = bao.baoEncodeIroh(data, true);

  const partial = new bao.PartialBao(hash, data.length);

  assertEqual(partial.numGroups, 1, 'Should have exactly 1 group');

  partial.addChunkGroupTrusted(0, data);
  const result = partial.finalize();
  assertArrayEqual(result, data, 'Should finalize correctly');
});

test('Edge: hasGroup with out-of-bounds index', () => {
  const data = generateInput(10000);
  const { hash } = bao.baoEncodeIroh(data, true);

  const partial = new bao.PartialBao(hash, data.length);

  assertEqual(partial.hasGroup(-1), false, 'Negative index should return false');
  assertEqual(partial.hasGroup(100), false, 'Large index should return false');
});

// ============================
// Summary
// ============================
console.log('\n======================================');
console.log(`Results: ${passed} passed, ${failed} failed`);

if (failed === 0) {
  console.log('\nAll PartialBao tests passed!');
} else {
  console.log('\nSome tests failed.');
  process.exit(1);
}

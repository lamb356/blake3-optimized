/**
 * Tests for Bao streaming encoder and decoder
 */

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

console.log('Bao Streaming Tests');
console.log('===================\n');

// ============================
// BaoEncoder Tests
// ============================
console.log('--- BaoEncoder Tests ---\n');

test('Streaming encode empty input', () => {
  const encoder = new bao.BaoEncoder();
  const result = encoder.finalize();
  const batch = bao.baoEncode(new Uint8Array(0));

  assertArrayEqual(result.encoded, batch.encoded, 'Encoded mismatch');
  assertArrayEqual(result.hash, batch.hash, 'Hash mismatch');
});

test('Streaming encode single write (100 bytes)', () => {
  const data = generateTestInput(100);
  const encoder = new bao.BaoEncoder();
  encoder.write(data);
  const result = encoder.finalize();
  const batch = bao.baoEncode(data);

  assertArrayEqual(result.encoded, batch.encoded, 'Encoded mismatch');
  assertArrayEqual(result.hash, batch.hash, 'Hash mismatch');
});

test('Streaming encode single write (1024 bytes - 1 chunk)', () => {
  const data = generateTestInput(1024);
  const encoder = new bao.BaoEncoder();
  encoder.write(data);
  const result = encoder.finalize();
  const batch = bao.baoEncode(data);

  assertArrayEqual(result.encoded, batch.encoded, 'Encoded mismatch');
  assertArrayEqual(result.hash, batch.hash, 'Hash mismatch');
});

test('Streaming encode single write (2048 bytes - 2 chunks)', () => {
  const data = generateTestInput(2048);
  const encoder = new bao.BaoEncoder();
  encoder.write(data);
  const result = encoder.finalize();
  const batch = bao.baoEncode(data);

  assertArrayEqual(result.encoded, batch.encoded, 'Encoded mismatch');
  assertArrayEqual(result.hash, batch.hash, 'Hash mismatch');
});

test('Streaming encode multiple writes - byte at a time', () => {
  const data = generateTestInput(100);
  const encoder = new bao.BaoEncoder();
  for (let i = 0; i < data.length; i++) {
    encoder.write(new Uint8Array([data[i]]));
  }
  const result = encoder.finalize();
  const batch = bao.baoEncode(data);

  assertArrayEqual(result.encoded, batch.encoded, 'Encoded mismatch');
  assertArrayEqual(result.hash, batch.hash, 'Hash mismatch');
});

test('Streaming encode multiple writes - 10 bytes at a time', () => {
  const data = generateTestInput(1000);
  const encoder = new bao.BaoEncoder();
  for (let i = 0; i < data.length; i += 10) {
    encoder.write(data.subarray(i, Math.min(i + 10, data.length)));
  }
  const result = encoder.finalize();
  const batch = bao.baoEncode(data);

  assertArrayEqual(result.encoded, batch.encoded, 'Encoded mismatch');
  assertArrayEqual(result.hash, batch.hash, 'Hash mismatch');
});

test('Streaming encode multiple writes - crossing chunk boundary', () => {
  const data = generateTestInput(2048);
  const encoder = new bao.BaoEncoder();
  // Write in chunks that don't align with 1024-byte chunk boundary
  encoder.write(data.subarray(0, 500));
  encoder.write(data.subarray(500, 1500));
  encoder.write(data.subarray(1500, 2048));
  const result = encoder.finalize();
  const batch = bao.baoEncode(data);

  assertArrayEqual(result.encoded, batch.encoded, 'Encoded mismatch');
  assertArrayEqual(result.hash, batch.hash, 'Hash mismatch');
});

test('Streaming encode large file (10KB)', () => {
  const data = generateTestInput(10240);
  const encoder = new bao.BaoEncoder();

  // Write in 333-byte chunks
  for (let i = 0; i < data.length; i += 333) {
    encoder.write(data.subarray(i, Math.min(i + 333, data.length)));
  }

  const result = encoder.finalize();
  const batch = bao.baoEncode(data);

  assertArrayEqual(result.encoded, batch.encoded, 'Encoded mismatch');
  assertArrayEqual(result.hash, batch.hash, 'Hash mismatch');
});

test('Streaming encode outboard mode', () => {
  const data = generateTestInput(2048);
  const encoder = new bao.BaoEncoder(true);
  encoder.write(data);
  const result = encoder.finalize();
  const batch = bao.baoEncode(data, true);

  assertArrayEqual(result.encoded, batch.encoded, 'Outboard encoded mismatch');
  assertArrayEqual(result.hash, batch.hash, 'Outboard hash mismatch');
});

test('Streaming encode outboard large file', () => {
  const data = generateTestInput(10240);
  const encoder = new bao.BaoEncoder(true);

  for (let i = 0; i < data.length; i += 500) {
    encoder.write(data.subarray(i, Math.min(i + 500, data.length)));
  }

  const result = encoder.finalize();
  const batch = bao.baoEncode(data, true);

  assertArrayEqual(result.encoded, batch.encoded, 'Outboard encoded mismatch');
  assertArrayEqual(result.hash, batch.hash, 'Outboard hash mismatch');
});

test('Streaming encode with string input', () => {
  const str = 'Hello, Bao streaming world!';
  const encoder = new bao.BaoEncoder();
  encoder.write(str);
  const result = encoder.finalize();
  const batch = bao.baoEncode(new TextEncoder().encode(str));

  assertArrayEqual(result.encoded, batch.encoded, 'Encoded mismatch');
  assertArrayEqual(result.hash, batch.hash, 'Hash mismatch');
});

// ============================
// BaoDecoder Tests
// ============================
console.log('\n--- BaoDecoder Tests ---\n');

test('Streaming decode empty input', () => {
  const data = new Uint8Array(0);
  const { encoded, hash } = bao.baoEncode(data);

  const decoder = new bao.BaoDecoder(hash, 0);
  decoder.write(encoded.subarray(bao.HEADER_SIZE)); // Skip header

  assertEqual(decoder.isComplete(), true, 'Should be complete');
  const decoded = decoder.read();
  assertArrayEqual(decoded, data, 'Decoded mismatch');
});

test('Streaming decode single chunk (100 bytes)', () => {
  const data = generateTestInput(100);
  const { encoded, hash } = bao.baoEncode(data);

  const decoder = new bao.BaoDecoder(hash, data.length);
  decoder.write(encoded.subarray(bao.HEADER_SIZE));

  assertEqual(decoder.isComplete(), true, 'Should be complete');
  const decoded = decoder.read();
  assertArrayEqual(decoded, data, 'Decoded mismatch');
});

test('Streaming decode two chunks (2048 bytes)', () => {
  const data = generateTestInput(2048);
  const { encoded, hash } = bao.baoEncode(data);

  const decoder = new bao.BaoDecoder(hash, data.length);
  decoder.write(encoded.subarray(bao.HEADER_SIZE));

  assertEqual(decoder.isComplete(), true, 'Should be complete');
  const decoded = decoder.read();
  assertArrayEqual(decoded, data, 'Decoded mismatch');
});

test('Streaming decode byte at a time', () => {
  const data = generateTestInput(100);
  const { encoded, hash } = bao.baoEncode(data);

  const decoder = new bao.BaoDecoder(hash, data.length);
  const content = encoded.subarray(bao.HEADER_SIZE);

  for (let i = 0; i < content.length; i++) {
    decoder.write(new Uint8Array([content[i]]));
  }

  assertEqual(decoder.isComplete(), true, 'Should be complete');
  const decoded = decoder.read();
  assertArrayEqual(decoded, data, 'Decoded mismatch');
});

test('Streaming decode multiple writes', () => {
  const data = generateTestInput(2048);
  const { encoded, hash } = bao.baoEncode(data);

  const decoder = new bao.BaoDecoder(hash, data.length);
  const content = encoded.subarray(bao.HEADER_SIZE);

  // Write in irregular chunks
  decoder.write(content.subarray(0, 50));
  decoder.write(content.subarray(50, 100));
  decoder.write(content.subarray(100, 500));
  decoder.write(content.subarray(500));

  assertEqual(decoder.isComplete(), true, 'Should be complete');
  const decoded = decoder.read();
  assertArrayEqual(decoded, data, 'Decoded mismatch');
});

test('Streaming decode large file (10KB)', () => {
  const data = generateTestInput(10240);
  const { encoded, hash } = bao.baoEncode(data);

  const decoder = new bao.BaoDecoder(hash, data.length);
  const content = encoded.subarray(bao.HEADER_SIZE);

  // Write in 500-byte chunks
  for (let i = 0; i < content.length; i += 500) {
    decoder.write(content.subarray(i, Math.min(i + 500, content.length)));
  }

  assertEqual(decoder.isComplete(), true, 'Should be complete');
  const decoded = decoder.read();
  assertArrayEqual(decoded, data, 'Decoded mismatch');
});

test('Streaming decode with incremental read()', () => {
  const data = generateTestInput(3072);
  const { encoded, hash } = bao.baoEncode(data);

  const decoder = new bao.BaoDecoder(hash, data.length);
  const content = encoded.subarray(bao.HEADER_SIZE);

  const collected = [];

  // Feed data gradually and read when available
  for (let i = 0; i < content.length; i += 100) {
    decoder.write(content.subarray(i, Math.min(i + 100, content.length)));
    const chunk = decoder.read();
    if (chunk.length > 0) {
      collected.push(chunk);
    }
  }

  // Collect any remaining
  const final = decoder.read();
  if (final.length > 0) {
    collected.push(final);
  }

  // Concatenate all collected chunks
  const totalLen = collected.reduce((sum, c) => sum + c.length, 0);
  const decoded = new Uint8Array(totalLen);
  let pos = 0;
  for (const chunk of collected) {
    decoded.set(chunk, pos);
    pos += chunk.length;
  }

  assertEqual(decoder.isComplete(), true, 'Should be complete');
  assertArrayEqual(decoded, data, 'Decoded mismatch');
});

test('Streaming decode outboard mode', () => {
  const data = generateTestInput(2048);
  const { encoded: outboard, hash } = bao.baoEncode(data, true);

  const decoder = new bao.BaoDecoder(hash, data.length, true);
  decoder.setOutboardData(data);
  decoder.write(outboard.subarray(bao.HEADER_SIZE));

  assertEqual(decoder.isComplete(), true, 'Should be complete');
  const decoded = decoder.read();
  assertArrayEqual(decoded, data, 'Decoded mismatch');
});

test('Streaming decode outboard large file', () => {
  const data = generateTestInput(10240);
  const { encoded: outboard, hash } = bao.baoEncode(data, true);

  const decoder = new bao.BaoDecoder(hash, data.length, true);
  decoder.setOutboardData(data);

  const content = outboard.subarray(bao.HEADER_SIZE);
  for (let i = 0; i < content.length; i += 64) {
    decoder.write(content.subarray(i, Math.min(i + 64, content.length)));
  }

  assertEqual(decoder.isComplete(), true, 'Should be complete');
  const decoded = decoder.read();
  assertArrayEqual(decoded, data, 'Decoded mismatch');
});

// ============================
// Error Detection Tests
// ============================
console.log('\n--- Streaming Error Detection ---\n');

test('Streaming decode detects wrong root hash', () => {
  const data = generateTestInput(100);
  const { encoded, hash } = bao.baoEncode(data);

  const wrongHash = new Uint8Array(hash);
  wrongHash[0] ^= 0xff;

  const decoder = new bao.BaoDecoder(wrongHash, data.length);

  assertThrows(() => {
    decoder.write(encoded.subarray(bao.HEADER_SIZE));
  }, 'hash mismatch', 'Wrong hash');
});

test('Streaming decode detects corrupted chunk', () => {
  const data = generateTestInput(100);
  const { encoded, hash } = bao.baoEncode(data);

  const corrupted = new Uint8Array(encoded);
  corrupted[20] ^= 0xff;

  const decoder = new bao.BaoDecoder(hash, data.length);

  assertThrows(() => {
    decoder.write(corrupted.subarray(bao.HEADER_SIZE));
  }, 'hash mismatch', 'Corrupted chunk');
});

test('Streaming decode detects corrupted parent node', () => {
  const data = generateTestInput(2048);
  const { encoded, hash } = bao.baoEncode(data);

  const corrupted = new Uint8Array(encoded);
  corrupted[10] ^= 0xff; // Corrupt parent node

  const decoder = new bao.BaoDecoder(hash, data.length);

  assertThrows(() => {
    decoder.write(corrupted.subarray(bao.HEADER_SIZE));
  }, 'hash mismatch', 'Corrupted parent');
});

test('Streaming decode finalize throws if incomplete', () => {
  const data = generateTestInput(2048);
  const { encoded, hash } = bao.baoEncode(data);

  const decoder = new bao.BaoDecoder(hash, data.length);
  // Only write partial data
  decoder.write(encoded.subarray(bao.HEADER_SIZE, bao.HEADER_SIZE + 64));

  assertThrows(() => {
    decoder.finalize();
  }, 'Incomplete', 'Incomplete data');
});

test('Streaming decoder rejects short hash', () => {
  assertThrows(() => {
    new bao.BaoDecoder(new Uint8Array(16), 100);
  }, '32 bytes', 'Short hash');
});

test('Streaming decoder rejects wrong outboard data length', () => {
  const decoder = new bao.BaoDecoder(new Uint8Array(32), 100, true);
  assertThrows(() => {
    decoder.setOutboardData(new Uint8Array(50));
  }, 'length mismatch', 'Wrong outboard length');
});

// ============================
// Round-trip Tests
// ============================
console.log('\n--- Streaming Round-trip Tests ---\n');

test('Full streaming round-trip (100 bytes)', () => {
  const data = generateTestInput(100);

  // Encode streaming
  const encoder = new bao.BaoEncoder();
  encoder.write(data);
  const { encoded, hash } = encoder.finalize();

  // Decode streaming
  const decoder = new bao.BaoDecoder(hash, data.length);
  decoder.write(encoded.subarray(bao.HEADER_SIZE));
  const decoded = decoder.read();

  assertArrayEqual(decoded, data, 'Round-trip mismatch');
});

test('Full streaming round-trip (2048 bytes)', () => {
  const data = generateTestInput(2048);

  const encoder = new bao.BaoEncoder();
  for (let i = 0; i < data.length; i += 100) {
    encoder.write(data.subarray(i, Math.min(i + 100, data.length)));
  }
  const { encoded, hash } = encoder.finalize();

  const decoder = new bao.BaoDecoder(hash, data.length);
  const content = encoded.subarray(bao.HEADER_SIZE);
  for (let i = 0; i < content.length; i += 100) {
    decoder.write(content.subarray(i, Math.min(i + 100, content.length)));
  }
  const decoded = decoder.read();

  assertArrayEqual(decoded, data, 'Round-trip mismatch');
});

test('Full streaming round-trip (10KB)', () => {
  const data = generateTestInput(10240);

  const encoder = new bao.BaoEncoder();
  for (let i = 0; i < data.length; i += 333) {
    encoder.write(data.subarray(i, Math.min(i + 333, data.length)));
  }
  const { encoded, hash } = encoder.finalize();

  const decoder = new bao.BaoDecoder(hash, data.length);
  const content = encoded.subarray(bao.HEADER_SIZE);
  for (let i = 0; i < content.length; i += 500) {
    decoder.write(content.subarray(i, Math.min(i + 500, content.length)));
  }
  const decoded = decoder.read();

  assertArrayEqual(decoded, data, 'Round-trip mismatch');
});

test('Full streaming round-trip outboard mode', () => {
  const data = generateTestInput(5000);

  const encoder = new bao.BaoEncoder(true);
  for (let i = 0; i < data.length; i += 500) {
    encoder.write(data.subarray(i, Math.min(i + 500, data.length)));
  }
  const { encoded: outboard, hash } = encoder.finalize();

  const decoder = new bao.BaoDecoder(hash, data.length, true);
  decoder.setOutboardData(data);

  const content = outboard.subarray(bao.HEADER_SIZE);
  for (let i = 0; i < content.length; i += 64) {
    decoder.write(content.subarray(i, Math.min(i + 64, content.length)));
  }
  const decoded = decoder.read();

  assertArrayEqual(decoded, data, 'Outboard round-trip mismatch');
});

// ============================
// Various Chunk Sizes
// ============================
console.log('\n--- Various Write Sizes ---\n');

const testSizes = [1, 2, 3, 7, 13, 64, 100, 256, 512, 1000, 1023, 1024, 1025, 2000];

for (const writeSize of [1, 10, 64, 100, 256, 1024]) {
  test(`Streaming encode/decode with ${writeSize}-byte writes`, () => {
    const data = generateTestInput(3000);

    // Encode
    const encoder = new bao.BaoEncoder();
    for (let i = 0; i < data.length; i += writeSize) {
      encoder.write(data.subarray(i, Math.min(i + writeSize, data.length)));
    }
    const { encoded, hash } = encoder.finalize();

    // Verify against batch
    const batch = bao.baoEncode(data);
    assertArrayEqual(encoded, batch.encoded, 'Encoded mismatch');
    assertArrayEqual(hash, batch.hash, 'Hash mismatch');

    // Decode
    const decoder = new bao.BaoDecoder(hash, data.length);
    const content = encoded.subarray(bao.HEADER_SIZE);
    for (let i = 0; i < content.length; i += writeSize) {
      decoder.write(content.subarray(i, Math.min(i + writeSize, content.length)));
    }
    const decoded = decoder.read();

    assertArrayEqual(decoded, data, 'Decoded mismatch');
  });
}

// ============================
// Edge Cases
// ============================
console.log('\n--- Edge Cases ---\n');

test('Multiple finalize calls work', () => {
  const data = generateTestInput(100);
  const encoder = new bao.BaoEncoder();
  encoder.write(data);

  const result1 = encoder.finalize();
  const result2 = encoder.finalize();

  // Both should produce same result (encoder state preserved after finalize)
  assertArrayEqual(result1.encoded, result2.encoded, 'Encoded should match');
  assertArrayEqual(result1.hash, result2.hash, 'Hash should match');
});

test('Empty writes are ignored', () => {
  const data = generateTestInput(100);
  const encoder = new bao.BaoEncoder();

  encoder.write(new Uint8Array(0));
  encoder.write(data.subarray(0, 50));
  encoder.write(new Uint8Array(0));
  encoder.write(data.subarray(50));
  encoder.write(new Uint8Array(0));

  const result = encoder.finalize();
  const batch = bao.baoEncode(data);

  assertArrayEqual(result.encoded, batch.encoded, 'Encoded mismatch');
});

test('Decoder read() returns empty when no data available', () => {
  const data = generateTestInput(2048);
  const { encoded, hash } = bao.baoEncode(data);

  const decoder = new bao.BaoDecoder(hash, data.length);

  // Before any writes
  const empty1 = decoder.read();
  assertEqual(empty1.length, 0, 'Should be empty before writes');

  // After partial write (only parent node, no complete chunk yet)
  decoder.write(encoded.subarray(bao.HEADER_SIZE, bao.HEADER_SIZE + 64));

  // After reading all available data, subsequent read is empty
  const read1 = decoder.read();
  const read2 = decoder.read();
  assertEqual(read2.length, 0, 'Subsequent read should be empty');
});

// ============================
// Summary
// ============================
console.log('\n===================');
console.log(`Results: ${passed} passed, ${failed} failed`);

if (failed === 0) {
  console.log('\nAll Bao streaming tests passed!');
} else {
  console.log('\nSome tests failed.');
  process.exit(1);
}

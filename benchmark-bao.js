/**
 * Bao Performance Benchmarks
 */

const bao = require('./bao.js');

// Generate test data
function generateInput(length) {
  const input = new Uint8Array(length);
  for (let i = 0; i < length; i++) {
    input[i] = i % 251;
  }
  return input;
}

// Format bytes as human-readable
function formatBytes(bytes) {
  if (bytes >= 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
  if (bytes >= 1024) return (bytes / 1024).toFixed(2) + ' KB';
  return bytes + ' B';
}

// Format throughput
function formatThroughput(bytesPerMs) {
  const mbPerSec = (bytesPerMs * 1000) / (1024 * 1024);
  return mbPerSec.toFixed(2) + ' MB/s';
}

// Benchmark helper
function benchmark(name, fn, iterations = 10) {
  // Warmup
  for (let i = 0; i < 3; i++) {
    fn();
  }

  // Timed runs
  const times = [];
  for (let i = 0; i < iterations; i++) {
    const start = performance.now();
    fn();
    const end = performance.now();
    times.push(end - start);
  }

  const avg = times.reduce((a, b) => a + b, 0) / times.length;
  const min = Math.min(...times);
  const max = Math.max(...times);

  return { avg, min, max };
}

console.log('Bao Performance Benchmarks');
console.log('==========================\n');

// Test sizes
const sizes = [
  { name: '1 KB', bytes: 1024 },
  { name: '10 KB', bytes: 10 * 1024 },
  { name: '100 KB', bytes: 100 * 1024 },
  { name: '1 MB', bytes: 1024 * 1024 },
  { name: '10 MB', bytes: 10 * 1024 * 1024 },
];

// Pre-generate test data
const testData = {};
for (const size of sizes) {
  testData[size.bytes] = generateInput(size.bytes);
}

// ============================
// Encoding Benchmarks
// ============================
console.log('--- Encoding Throughput (Combined Mode) ---\n');
console.log('Size       | Time (ms) | Throughput');
console.log('-----------|-----------|------------');

const encodedResults = {};
for (const size of sizes) {
  const data = testData[size.bytes];
  let result;
  const { avg } = benchmark(`encode_${size.name}`, () => {
    result = bao.baoEncode(data);
  }, size.bytes >= 1024 * 1024 ? 5 : 10);

  encodedResults[size.bytes] = result;
  const throughput = formatThroughput(size.bytes / avg);
  console.log(`${size.name.padEnd(10)} | ${avg.toFixed(2).padStart(9)} | ${throughput}`);
}

console.log('\n--- Encoding Throughput (Outboard Mode) ---\n');
console.log('Size       | Time (ms) | Throughput');
console.log('-----------|-----------|------------');

const outboardResults = {};
for (const size of sizes) {
  const data = testData[size.bytes];
  let result;
  const { avg } = benchmark(`encode_outboard_${size.name}`, () => {
    result = bao.baoEncode(data, true);
  }, size.bytes >= 1024 * 1024 ? 5 : 10);

  outboardResults[size.bytes] = result;
  const throughput = formatThroughput(size.bytes / avg);
  console.log(`${size.name.padEnd(10)} | ${avg.toFixed(2).padStart(9)} | ${throughput}`);
}

// ============================
// Decoding Benchmarks
// ============================
console.log('\n--- Decoding Throughput (Combined Mode) ---\n');
console.log('Size       | Time (ms) | Throughput');
console.log('-----------|-----------|------------');

for (const size of sizes) {
  const { encoded, hash } = encodedResults[size.bytes];
  const { avg } = benchmark(`decode_${size.name}`, () => {
    bao.baoDecode(encoded, hash);
  }, size.bytes >= 1024 * 1024 ? 5 : 10);

  const throughput = formatThroughput(size.bytes / avg);
  console.log(`${size.name.padEnd(10)} | ${avg.toFixed(2).padStart(9)} | ${throughput}`);
}

console.log('\n--- Decoding Throughput (Outboard Mode) ---\n');
console.log('Size       | Time (ms) | Throughput');
console.log('-----------|-----------|------------');

for (const size of sizes) {
  const data = testData[size.bytes];
  const { encoded, hash } = outboardResults[size.bytes];
  const { avg } = benchmark(`decode_outboard_${size.name}`, () => {
    bao.baoDecode(encoded, hash, data);
  }, size.bytes >= 1024 * 1024 ? 5 : 10);

  const throughput = formatThroughput(size.bytes / avg);
  console.log(`${size.name.padEnd(10)} | ${avg.toFixed(2).padStart(9)} | ${throughput}`);
}

// ============================
// Slice Extraction Benchmarks
// ============================
console.log('\n--- Slice Extraction Performance ---\n');

// Test extracting 1KB from various file sizes
const sliceSize = 1024;
const sliceSizes = [
  { name: '100 KB', bytes: 100 * 1024 },
  { name: '1 MB', bytes: 1024 * 1024 },
  { name: '10 MB', bytes: 10 * 1024 * 1024 },
];

console.log('Extracting 1KB slice from middle of file:\n');
console.log('File Size  | Slice Size | Reduction | Extract (ms) | Decode (ms)');
console.log('-----------|------------|-----------|--------------|------------');

for (const size of sliceSizes) {
  const { encoded, hash } = encodedResults[size.bytes];
  const sliceStart = Math.floor(size.bytes / 2);

  let slice;
  const extractTime = benchmark(`slice_extract_${size.name}`, () => {
    slice = bao.baoSlice(encoded, sliceStart, sliceSize);
  }, 10);

  const decodeTime = benchmark(`slice_decode_${size.name}`, () => {
    bao.baoDecodeSlice(slice, hash, sliceStart, sliceSize);
  }, 10);

  const reduction = ((1 - slice.length / encoded.length) * 100).toFixed(1);
  console.log(
    `${size.name.padEnd(10)} | ${formatBytes(slice.length).padEnd(10)} | ${(reduction + '%').padStart(9)} | ${extractTime.avg.toFixed(3).padStart(12)} | ${decodeTime.avg.toFixed(3).padStart(10)}`
  );
}

// ============================
// Streaming vs Batch Comparison
// ============================
console.log('\n--- Streaming vs Batch Encoding ---\n');
console.log('Size       | Batch (ms) | Stream (ms) | Ratio');
console.log('-----------|------------|-------------|-------');

for (const size of sizes.slice(0, 4)) { // Skip 10MB for streaming (too slow)
  const data = testData[size.bytes];

  const batchTime = benchmark(`batch_encode_${size.name}`, () => {
    bao.baoEncode(data);
  }, 10);

  // Streaming encode with 1KB chunks
  const streamTime = benchmark(`stream_encode_${size.name}`, () => {
    const encoder = new bao.BaoEncoder();
    for (let i = 0; i < data.length; i += 1024) {
      encoder.write(data.subarray(i, Math.min(i + 1024, data.length)));
    }
    encoder.finalize();
  }, 10);

  const ratio = (streamTime.avg / batchTime.avg).toFixed(2);
  console.log(
    `${size.name.padEnd(10)} | ${batchTime.avg.toFixed(2).padStart(10)} | ${streamTime.avg.toFixed(2).padStart(11)} | ${ratio}x`
  );
}

console.log('\n--- Streaming vs Batch Decoding ---\n');
console.log('Size       | Batch (ms) | Stream (ms) | Ratio');
console.log('-----------|------------|-------------|-------');

for (const size of sizes.slice(0, 4)) {
  const { encoded, hash } = encodedResults[size.bytes];
  const content = encoded.subarray(bao.HEADER_SIZE);

  const batchTime = benchmark(`batch_decode_${size.name}`, () => {
    bao.baoDecode(encoded, hash);
  }, 10);

  // Streaming decode with 1KB chunks
  const streamTime = benchmark(`stream_decode_${size.name}`, () => {
    const decoder = new bao.BaoDecoder(hash, size.bytes);
    for (let i = 0; i < content.length; i += 1024) {
      decoder.write(content.subarray(i, Math.min(i + 1024, content.length)));
    }
    decoder.read();
  }, 10);

  const ratio = (streamTime.avg / batchTime.avg).toFixed(2);
  console.log(
    `${size.name.padEnd(10)} | ${batchTime.avg.toFixed(2).padStart(10)} | ${streamTime.avg.toFixed(2).padStart(11)} | ${ratio}x`
  );
}

// ============================
// Encoding Size Overhead
// ============================
console.log('\n--- Encoding Size Overhead ---\n');
console.log('Input Size | Combined   | Outboard  | Combined OH | Outboard OH');
console.log('-----------|------------|-----------|-------------|------------');

for (const size of sizes) {
  const combined = encodedResults[size.bytes].encoded.length;
  const outboard = outboardResults[size.bytes].encoded.length;
  const combinedOH = ((combined - size.bytes) / size.bytes * 100).toFixed(2);
  const outboardOH = (outboard / size.bytes * 100).toFixed(2);

  console.log(
    `${size.name.padEnd(10)} | ${formatBytes(combined).padEnd(10)} | ${formatBytes(outboard).padEnd(9)} | ${(combinedOH + '%').padStart(11)} | ${(outboardOH + '%').padStart(10)}`
  );
}

// ============================
// Summary
// ============================
console.log('\n==========================');
console.log('Benchmark complete.');

// Quick summary of peak performance
const peakEncodeSize = sizes[sizes.length - 1];
const peakEncodeTime = benchmark('peak_encode', () => {
  bao.baoEncode(testData[peakEncodeSize.bytes]);
}, 3);
const peakEncodeThroughput = formatThroughput(peakEncodeSize.bytes / peakEncodeTime.avg);

console.log(`\nPeak encoding throughput (${peakEncodeSize.name}): ${peakEncodeThroughput}`);

const peakDecodeSize = sizes[sizes.length - 1];
const { encoded: peakEncoded, hash: peakHash } = encodedResults[peakDecodeSize.bytes];
const peakDecodeTime = benchmark('peak_decode', () => {
  bao.baoDecode(peakEncoded, peakHash);
}, 3);
const peakDecodeThroughput = formatThroughput(peakDecodeSize.bytes / peakDecodeTime.avg);

console.log(`Peak decoding throughput (${peakDecodeSize.name}): ${peakDecodeThroughput}`);

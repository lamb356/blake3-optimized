// Test SharedArrayBuffer BLAKE3 implementation
const { Blake3SAB } = require('./blake3-sab.js');
const blake3 = require('./blake3.js');

async function test() {
  await blake3.initSimd();
  const sab = new Blake3SAB(4);
  await sab.init();

  console.log('Testing Blake3SAB correctness...\n');

  const testSizes = [0, 1, 64, 1024, 4096, 8192, 65536, 102400, 1024*1024];
  let passed = 0, failed = 0;

  for (const size of testSizes) {
    const data = new Uint8Array(size);
    for (let i = 0; i < size; i++) data[i] = i % 251;

    const expected = blake3.hashHex(data);
    const result = await sab.hash(data);
    const actual = Array.from(result).map(b => b.toString(16).padStart(2, '0')).join('');

    if (expected === actual) {
      console.log(`✓ PASS: ${size} bytes`);
      passed++;
    } else {
      console.log(`✗ FAIL: ${size} bytes`);
      console.log(`  Expected: ${expected}`);
      console.log(`  Actual:   ${actual}`);
      failed++;
    }
  }

  console.log(`\nResults: ${passed} passed, ${failed} failed`);

  // Benchmark
  console.log('\nBenchmark (1 MB):');
  const benchData = new Uint8Array(1024 * 1024);
  for (let i = 0; i < benchData.length; i++) benchData[i] = i & 0xff;

  // Warmup
  for (let i = 0; i < 5; i++) await sab.hash(benchData);

  const iterations = 50;
  const start = performance.now();
  for (let i = 0; i < iterations; i++) await sab.hash(benchData);
  const elapsed = performance.now() - start;
  const throughput = (benchData.length * iterations / 1024 / 1024) / (elapsed / 1000);
  console.log(`  Blake3SAB: ${throughput.toFixed(1)} MB/s`);

  // Compare with single-threaded
  for (let i = 0; i < 5; i++) blake3.hash(benchData);
  const start2 = performance.now();
  for (let i = 0; i < iterations; i++) blake3.hash(benchData);
  const elapsed2 = performance.now() - start2;
  const throughput2 = (benchData.length * iterations / 1024 / 1024) / (elapsed2 / 1000);
  console.log(`  Single-threaded: ${throughput2.toFixed(1)} MB/s`);
  console.log(`  Speedup: ${(throughput / throughput2).toFixed(2)}x`);

  sab.terminate();
}

test().catch(console.error);

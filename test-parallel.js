// Test parallel BLAKE3 correctness
const blake3 = require('./blake3.js');
const { Blake3Parallel } = require('./blake3-parallel.js');

async function test() {
  await blake3.initSimd();
  console.log('Single-threaded SIMD enabled:', blake3.isSimdEnabled());

  const parallel = new Blake3Parallel(4);
  await parallel.init();

  console.log('\nCorrectness Tests:');
  console.log('==================');

  const testSizes = [
    64 * 1024,      // 64 KB - 64 chunks
    256 * 1024,     // 256 KB - 256 chunks
    1024 * 1024,    // 1 MB - 1024 chunks
    4 * 1024 * 1024 // 4 MB - 4096 chunks
  ];

  let allPassed = true;

  for (const size of testSizes) {
    const data = new Uint8Array(size);
    for (let i = 0; i < size; i++) data[i] = i & 0xff;

    const singleHash = blake3.hashHex(data);
    const parallelHashBytes = await parallel.hash(data);
    const parallelHash = Array.from(parallelHashBytes).map(b => b.toString(16).padStart(2, '0')).join('');

    const passed = singleHash === parallelHash;
    console.log((passed ? 'PASS' : 'FAIL') + ': ' + (size / 1024) + ' KB');
    if (!passed) {
      console.log('  Single:   ' + singleHash);
      console.log('  Parallel: ' + parallelHash);
      allPassed = false;
    }
  }

  parallel.terminate();

  console.log('\n' + (allPassed ? 'All tests passed!' : 'SOME TESTS FAILED'));

  // Now compare throughput
  console.log('\nThroughput Comparison (1 MB):');
  console.log('=============================');

  const testData = new Uint8Array(1024 * 1024);
  for (let i = 0; i < testData.length; i++) testData[i] = i & 0xff;

  // Single-threaded
  const warmup1 = 10;
  for (let i = 0; i < warmup1; i++) blake3.hash(testData);
  const iter1 = 50;
  const start1 = performance.now();
  for (let i = 0; i < iter1; i++) blake3.hash(testData);
  const elapsed1 = performance.now() - start1;
  const throughput1 = (testData.length * iter1 / 1024 / 1024) / (elapsed1 / 1000);
  console.log('Single-threaded: ' + throughput1.toFixed(1) + ' MB/s');

  // Parallel with different worker counts
  for (const numWorkers of [2, 4, 8]) {
    const p = new Blake3Parallel(numWorkers);
    await p.init();

    // Warmup
    for (let i = 0; i < 5; i++) await p.hash(testData);

    const iter2 = 50;
    const start2 = performance.now();
    for (let i = 0; i < iter2; i++) await p.hash(testData);
    const elapsed2 = performance.now() - start2;
    const throughput2 = (testData.length * iter2 / 1024 / 1024) / (elapsed2 / 1000);
    console.log('Parallel (' + numWorkers + ' workers): ' + throughput2.toFixed(1) + ' MB/s');

    p.terminate();
  }
}

test().catch(console.error);

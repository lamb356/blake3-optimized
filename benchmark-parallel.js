// Comprehensive parallel benchmark
const blake3 = require('./blake3.js');
const { Blake3Parallel } = require('./blake3-parallel.js');

async function benchmark() {
  await blake3.initSimd();

  console.log('BLAKE3 Parallel Benchmark');
  console.log('=========================\n');

  const sizes = [
    { name: '1 MB', bytes: 1024 * 1024 },
    { name: '4 MB', bytes: 4 * 1024 * 1024 },
    { name: '16 MB', bytes: 16 * 1024 * 1024 },
    { name: '64 MB', bytes: 64 * 1024 * 1024 },
  ];

  const workerCounts = [1, 2, 4, 8];

  for (const { name, bytes } of sizes) {
    console.log(`\n${name} input:`);
    console.log('-'.repeat(50));

    // Create test data
    const data = new Uint8Array(bytes);
    for (let i = 0; i < bytes; i++) data[i] = i & 0xff;

    // Single-threaded baseline
    blake3.hash(data); // warmup
    const singleStart = performance.now();
    const iterations = bytes >= 16 * 1024 * 1024 ? 3 : 10;
    for (let i = 0; i < iterations; i++) blake3.hash(data);
    const singleTime = (performance.now() - singleStart) / iterations;
    const singleThroughput = (bytes / 1024 / 1024) / (singleTime / 1000);
    console.log(`Single-threaded:    ${singleThroughput.toFixed(1)} MB/s`);

    // Parallel with different worker counts
    for (const numWorkers of workerCounts) {
      const parallel = new Blake3Parallel(numWorkers);
      await parallel.init();

      // Warmup
      await parallel.hash(data);
      await parallel.hash(data);

      const parallelStart = performance.now();
      for (let i = 0; i < iterations; i++) await parallel.hash(data);
      const parallelTime = (performance.now() - parallelStart) / iterations;
      const parallelThroughput = (bytes / 1024 / 1024) / (parallelTime / 1000);
      const speedup = parallelThroughput / singleThroughput;

      console.log(`${numWorkers} workers:           ${parallelThroughput.toFixed(1)} MB/s (${speedup.toFixed(2)}x)`);
      parallel.terminate();
    }
  }
}

benchmark().catch(console.error);

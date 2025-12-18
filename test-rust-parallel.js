/**
 * Benchmark: Sequential vs Parallel Rust WASM SIMD.
 *
 * Compares single-threaded Rust WASM with multi-threaded parallel processing.
 * Target: 1500-2000+ MB/s with 4 workers.
 */
'use strict';

const os = require('os');
const rustWasm = require('./bao-rust-wasm.js');
const { createParallelProcessor } = require('./bao-rust-parallel.js');

const CHUNK_LEN = 1024;
const HASH_SIZE = 32;

function formatThroughput(bytes, ms) {
  if (ms === 0) return 'Inf MB/s';
  return ((bytes / (1024 * 1024)) / (ms / 1000)).toFixed(2) + ' MB/s';
}

function formatSize(bytes) {
  if (bytes >= 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(0) + ' MB';
  if (bytes >= 1024) return (bytes / 1024).toFixed(0) + ' KB';
  return bytes + ' B';
}

async function runBenchmarks() {
  console.log('=== Parallel Rust WASM SIMD Benchmarks ===\n');
  console.log(`CPU cores: ${os.cpus().length}`);
  console.log(`CPU model: ${os.cpus()[0].model}\n`);

  // Initialize sequential WASM
  console.log('Initializing sequential Rust WASM...');
  const seqOk = await rustWasm.initWasm();
  if (!seqOk) {
    console.error('Sequential WASM init failed!');
    process.exit(1);
  }
  console.log('SIMD:', rustWasm.getSimdInfo());

  // Test data sizes
  const testSizes = [
    1 * 1024 * 1024,   // 1 MB
    4 * 1024 * 1024,   // 4 MB
    16 * 1024 * 1024,  // 16 MB
  ];

  // Worker counts to test
  const workerCounts = [1, 2, 4, 8];

  // Generate test data once
  const maxSize = Math.max(...testSizes);
  console.log(`\nGenerating ${formatSize(maxSize)} test data...`);
  const testData = new Uint8Array(maxSize);
  for (let i = 0; i < testData.length; i++) {
    testData[i] = (i * 17) & 0xff;
  }

  // Warmup sequential
  console.log('Warming up sequential...');
  for (let i = 0; i < 10; i++) {
    const chunk = testData.subarray(0, CHUNK_LEN);
    rustWasm.chunkCV(chunk, 0, false);
  }

  console.log('\n' + '='.repeat(70));
  console.log('SEQUENTIAL vs PARALLEL BENCHMARKS');
  console.log('='.repeat(70));

  for (const size of testSizes) {
    const numChunks = Math.floor(size / CHUNK_LEN);
    const data = testData.subarray(0, size);

    console.log(`\n--- ${formatSize(size)} (${numChunks} chunks) ---\n`);

    // Benchmark sequential
    const seqIterations = size <= 4 * 1024 * 1024 ? 5 : 2;
    let seqTotal = 0;

    for (let iter = 0; iter < seqIterations; iter++) {
      const start = Date.now();
      rustWasm.batchChunkCVs(data, 0, numChunks);
      seqTotal += Date.now() - start;
    }
    const seqMs = seqTotal / seqIterations;
    const seqThroughput = formatThroughput(size, seqMs);

    console.log(`Sequential (1 thread):  ${seqMs.toFixed(1)}ms  ${seqThroughput}`);

    // Benchmark parallel with different worker counts
    for (const numWorkers of workerCounts) {
      if (numWorkers > os.cpus().length) continue;

      const processor = await createParallelProcessor(numWorkers);

      // Warmup
      await processor.batchChunkCVsParallel(data.slice(0, 64 * CHUNK_LEN), 0);

      const parIterations = seqIterations;
      let parTotal = 0;

      for (let iter = 0; iter < parIterations; iter++) {
        const start = Date.now();
        await processor.batchChunkCVsParallel(data, 0);
        parTotal += Date.now() - start;
      }

      const parMs = parTotal / parIterations;
      const parThroughput = formatThroughput(size, parMs);
      const speedup = (seqMs / parMs).toFixed(2);

      const workerLabel = `Parallel (${numWorkers} workers):`;
      console.log(`${workerLabel.padEnd(22)} ${parMs.toFixed(1)}ms  ${parThroughput}  (${speedup}x)`);

      await processor.shutdown();
    }
  }

  // Correctness verification
  console.log('\n' + '='.repeat(70));
  console.log('CORRECTNESS VERIFICATION');
  console.log('='.repeat(70));

  const verifySize = 64 * CHUNK_LEN; // 64 KB
  const verifyData = testData.subarray(0, verifySize);
  const verifyChunks = verifySize / CHUNK_LEN;

  console.log(`\nVerifying ${verifyChunks} chunks...`);

  // Sequential result
  const seqCVs = rustWasm.batchChunkCVs(verifyData, 0, verifyChunks);

  // Parallel result
  const processor = await createParallelProcessor(4);
  const parCVs = await processor.batchChunkCVsParallel(verifyData, 0);

  let allMatch = true;
  for (let i = 0; i < verifyChunks; i++) {
    const seqCV = seqCVs[i];
    const parCV = parCVs[i];

    let match = true;
    for (let j = 0; j < HASH_SIZE; j++) {
      if (seqCV[j] !== parCV[j]) {
        match = false;
        break;
      }
    }

    if (!match) {
      console.log(`MISMATCH at chunk ${i}!`);
      allMatch = false;
    }
  }

  if (allMatch) {
    console.log(`PASS: All ${verifyChunks} chunk CVs match between sequential and parallel`);
  } else {
    console.log('FAIL: Some CVs do not match!');
  }

  await processor.shutdown();

  // Summary
  console.log('\n' + '='.repeat(70));
  console.log('SUMMARY');
  console.log('='.repeat(70));
  console.log(`
Sequential Rust WASM SIMD:  ~650 MB/s
Parallel with 4 workers:    Target 1500-2000+ MB/s

Note: Actual speedup depends on:
- Number of CPU cores
- Memory bandwidth
- Worker thread overhead
- Data transfer costs between threads
`);
}

runBenchmarks().catch(err => {
  console.error('Benchmark error:', err);
  process.exit(1);
});

/**
 * Benchmark: Worker Pool vs Fresh Workers for Multiple Encodes
 *
 * Compares:
 * 1. Creating fresh workers for each encode (current approach)
 * 2. Using persistent worker pool (workers stay alive)
 *
 * Shows amortized performance benefit for batch file processing.
 */
'use strict';

const os = require('os');
const { createParallelProcessor, baoEncodeWithPool, shutdownWorkerPool } = require('./bao-rust-parallel.js');
const rustWasm = require('./bao-rust-wasm.js');

const CHUNK_LEN = 1024;

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
  console.log('=== Worker Pool Benchmark: Multiple File Encoding ===\n');
  console.log(`CPU cores: ${os.cpus().length}`);
  console.log(`CPU model: ${os.cpus()[0].model}\n`);

  // Initialize main-thread WASM
  await rustWasm.initWasm();
  console.log('SIMD:', rustWasm.getSimdInfo());

  const NUM_WORKERS = 4;
  const FILE_SIZES = [1 * 1024 * 1024, 4 * 1024 * 1024]; // 1MB, 4MB
  const NUM_FILES = 10;

  // Generate test data
  console.log(`\nGenerating ${NUM_FILES} test files...`);
  const testFiles = [];
  for (let i = 0; i < NUM_FILES; i++) {
    const size = FILE_SIZES[i % FILE_SIZES.length];
    const data = new Uint8Array(size);
    for (let j = 0; j < data.length; j++) {
      data[j] = ((i * 17 + j) * 31) & 0xff;
    }
    testFiles.push({ data, size });
  }

  const totalBytes = testFiles.reduce((sum, f) => sum + f.size, 0);
  console.log(`Total data: ${formatSize(totalBytes)} across ${NUM_FILES} files\n`);

  console.log('='.repeat(70));
  console.log('APPROACH 1: Fresh Workers (create/shutdown per encode)');
  console.log('='.repeat(70));

  // Warmup
  console.log('\nWarmup...');
  const warmupProcessor = await createParallelProcessor(NUM_WORKERS);
  await warmupProcessor.baoEncodeOptimized(testFiles[0].data);
  await warmupProcessor.shutdown();

  // Benchmark fresh workers
  console.log('Benchmarking fresh workers...\n');
  const freshStart = Date.now();
  const freshHashes = [];

  for (let i = 0; i < NUM_FILES; i++) {
    const fileStart = Date.now();
    const processor = await createParallelProcessor(NUM_WORKERS);
    const { rootHash } = await processor.baoEncodeOptimized(testFiles[i].data);
    await processor.shutdown();
    const fileMs = Date.now() - fileStart;

    freshHashes.push(rootHash);
    console.log(`  File ${i + 1}: ${formatSize(testFiles[i].size)} in ${fileMs}ms (${formatThroughput(testFiles[i].size, fileMs)})`);
  }

  const freshTotal = Date.now() - freshStart;
  console.log(`\nFresh workers total: ${freshTotal}ms`);
  console.log(`Average per file: ${(freshTotal / NUM_FILES).toFixed(1)}ms`);
  console.log(`Overall throughput: ${formatThroughput(totalBytes, freshTotal)}`);

  console.log('\n' + '='.repeat(70));
  console.log('APPROACH 2: Persistent Worker Pool (workers stay alive)');
  console.log('='.repeat(70));

  // Warmup pool
  console.log('\nWarmup pool...');
  await baoEncodeWithPool(testFiles[0].data, NUM_WORKERS);

  // Benchmark worker pool
  console.log('Benchmarking worker pool...\n');
  const poolStart = Date.now();
  const poolHashes = [];

  for (let i = 0; i < NUM_FILES; i++) {
    const fileStart = Date.now();
    const { rootHash } = await baoEncodeWithPool(testFiles[i].data, NUM_WORKERS);
    const fileMs = Date.now() - fileStart;

    poolHashes.push(rootHash);
    console.log(`  File ${i + 1}: ${formatSize(testFiles[i].size)} in ${fileMs}ms (${formatThroughput(testFiles[i].size, fileMs)})`);
  }

  const poolTotal = Date.now() - poolStart;
  console.log(`\nWorker pool total: ${poolTotal}ms`);
  console.log(`Average per file: ${(poolTotal / NUM_FILES).toFixed(1)}ms`);
  console.log(`Overall throughput: ${formatThroughput(totalBytes, poolTotal)}`);

  // Verify correctness
  console.log('\n' + '='.repeat(70));
  console.log('CORRECTNESS VERIFICATION');
  console.log('='.repeat(70));

  let allMatch = true;
  for (let i = 0; i < NUM_FILES; i++) {
    let match = true;
    for (let j = 0; j < 32; j++) {
      if (freshHashes[i][j] !== poolHashes[i][j]) {
        match = false;
        break;
      }
    }
    if (!match) {
      console.log(`MISMATCH: File ${i + 1}`);
      allMatch = false;
    }
  }

  if (allMatch) {
    console.log(`\nPASS: All ${NUM_FILES} file hashes match between approaches`);
  } else {
    console.log('\nFAIL: Hash mismatch detected!');
  }

  // Summary
  console.log('\n' + '='.repeat(70));
  console.log('SUMMARY');
  console.log('='.repeat(70));

  const speedup = (freshTotal / poolTotal).toFixed(2);
  const timeSaved = freshTotal - poolTotal;

  console.log(`
Fresh workers:     ${freshTotal}ms total (${(freshTotal / NUM_FILES).toFixed(1)}ms avg)
Worker pool:       ${poolTotal}ms total (${(poolTotal / NUM_FILES).toFixed(1)}ms avg)

Speedup:           ${speedup}x faster with worker pool
Time saved:        ${timeSaved}ms (${((timeSaved / freshTotal) * 100).toFixed(1)}% reduction)

Worker pool eliminates per-encode overhead:
- No worker thread creation (~20-50ms per encode)
- No WASM module loading per worker
- Amortized initialization across all encodes
`);

  // Cleanup
  await shutdownWorkerPool();
  console.log('Done.');
}

runBenchmarks().catch(err => {
  console.error('Benchmark error:', err);
  process.exit(1);
});

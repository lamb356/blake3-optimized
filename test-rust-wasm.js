/**
 * Test Rust WASM Bao operations.
 */
'use strict';

const rustWasm = require('./bao-rust-wasm.js');
const baoJs = require('./bao.js');

function toHex(arr) {
  return Array.from(arr).map(b => b.toString(16).padStart(2, '0')).join('');
}

function formatThroughput(bytes, ms) {
  if (ms === 0) return 'Inf MB/s';
  return ((bytes / (1024 * 1024)) / (ms / 1000)).toFixed(2) + ' MB/s';
}

async function runTests() {
  console.log('=== Rust WASM Bao Tests ===\n');

  console.log('Initializing Rust WASM...');
  const ok = await rustWasm.initWasm();
  if (!ok) {
    console.error('Rust WASM initialization failed!');
    process.exit(1);
  }
  console.log('Rust WASM enabled:', rustWasm.isWasmEnabled());
  console.log('');

  let passed = 0;
  let failed = 0;

  // Test 1: Empty chunk CV
  console.log('--- Test 1: Empty chunk CV ---');
  const jsEmpty = baoJs.chunkCV(new Uint8Array(0), 0, true);
  const rustEmpty = rustWasm.chunkCV(new Uint8Array(0), 0, true);
  if (toHex(jsEmpty) === toHex(rustEmpty)) {
    console.log('PASS');
    console.log('  Hash:', toHex(jsEmpty).substring(0, 32) + '...');
    passed++;
  } else {
    console.log('FAIL');
    console.log('  JS:  ', toHex(jsEmpty));
    console.log('  Rust:', toHex(rustEmpty));
    failed++;
  }

  // Test 2: Single byte chunk CV
  console.log('--- Test 2: Single byte chunk CV ---');
  const js1 = baoJs.chunkCV(new Uint8Array([42]), 0, false);
  const rust1 = rustWasm.chunkCV(new Uint8Array([42]), 0, false);
  if (toHex(js1) === toHex(rust1)) {
    console.log('PASS');
    passed++;
  } else {
    console.log('FAIL');
    console.log('  JS:  ', toHex(js1));
    console.log('  Rust:', toHex(rust1));
    failed++;
  }

  // Test 3: Full chunk CV (1024 bytes)
  console.log('--- Test 3: Full chunk CV (1024 bytes) ---');
  const fullChunk = new Uint8Array(1024);
  for (let i = 0; i < 1024; i++) fullChunk[i] = (i * 13) & 0xff;
  const jsFull = baoJs.chunkCV(fullChunk, 5, false);
  const rustFull = rustWasm.chunkCV(fullChunk, 5, false);
  if (toHex(jsFull) === toHex(rustFull)) {
    console.log('PASS');
    passed++;
  } else {
    console.log('FAIL');
    console.log('  JS:  ', toHex(jsFull));
    console.log('  Rust:', toHex(rustFull));
    failed++;
  }

  // Test 4: Parent CV
  console.log('--- Test 4: Parent CV ---');
  const left = new Uint8Array(32).fill(0x11);
  const right = new Uint8Array(32).fill(0x22);
  const jsParent = baoJs.parentCV(left, right, false);
  const rustParent = rustWasm.parentCV(left, right, false);
  if (toHex(jsParent) === toHex(rustParent)) {
    console.log('PASS');
    passed++;
  } else {
    console.log('FAIL');
    console.log('  JS:  ', toHex(jsParent));
    console.log('  Rust:', toHex(rustParent));
    failed++;
  }

  // Test 5: Parent CV with isRoot
  console.log('--- Test 5: Parent CV (root) ---');
  const jsParentRoot = baoJs.parentCV(left, right, true);
  const rustParentRoot = rustWasm.parentCV(left, right, true);
  if (toHex(jsParentRoot) === toHex(rustParentRoot)) {
    console.log('PASS');
    passed++;
  } else {
    console.log('FAIL');
    console.log('  JS:  ', toHex(jsParentRoot));
    console.log('  Rust:', toHex(rustParentRoot));
    failed++;
  }

  // Test 6: Batch chunk CVs
  console.log('--- Test 6: Batch chunk CVs (4 chunks) ---');
  const batchData = new Uint8Array(4 * 1024);
  for (let i = 0; i < batchData.length; i++) batchData[i] = (i * 7) & 0xff;
  const jsBatch = [];
  for (let i = 0; i < 4; i++) {
    jsBatch.push(baoJs.chunkCV(batchData.subarray(i * 1024, (i + 1) * 1024), i, false));
  }
  const rustBatch = rustWasm.batchChunkCVs(batchData, 0, 4);
  let batchOk = true;
  for (let i = 0; i < 4; i++) {
    if (toHex(jsBatch[i]) !== toHex(rustBatch[i])) {
      batchOk = false;
      console.log(`  Chunk ${i} mismatch:`);
      console.log(`    JS:  `, toHex(jsBatch[i]));
      console.log(`    Rust:`, toHex(rustBatch[i]));
    }
  }
  if (batchOk) {
    console.log('PASS');
    passed++;
  } else {
    console.log('FAIL');
    failed++;
  }

  // Test 7: Zero-copy direct API
  console.log('--- Test 7: Zero-copy direct API ---');
  const input = rustWasm.getInputBuffer();
  input.set(fullChunk, 0);
  const directCV = rustWasm.chunkCVDirect(1024, 5, false);
  if (toHex(directCV) === toHex(jsFull)) {
    console.log('PASS');
    passed++;
  } else {
    console.log('FAIL');
    console.log('  Expected:', toHex(jsFull));
    console.log('  Got:     ', toHex(directCV));
    failed++;
  }

  console.log('');
  console.log(`Results: ${passed} passed, ${failed} failed`);

  if (failed > 0) {
    process.exit(1);
  }

  // Benchmarks
  console.log('');
  console.log('=== BENCHMARKS ===');
  console.log('');

  // Warmup
  for (let i = 0; i < 100; i++) {
    baoJs.chunkCV(fullChunk, i, false);
    rustWasm.chunkCV(fullChunk, i, false);
  }

  // Benchmark 1: Single chunkCV
  console.log('--- chunkCV (10,000 iterations) ---');
  const iterations = 10000;

  let start = Date.now();
  for (let i = 0; i < iterations; i++) {
    baoJs.chunkCV(fullChunk, i, false);
  }
  const jsTime = Date.now() - start;

  start = Date.now();
  for (let i = 0; i < iterations; i++) {
    rustWasm.chunkCV(fullChunk, i, false);
  }
  const rustTime = Date.now() - start;

  // Zero-copy benchmark
  input.set(fullChunk, 0);
  start = Date.now();
  for (let i = 0; i < iterations; i++) {
    rustWasm.chunkCVDirect(1024, i, false);
  }
  const zcTime = Date.now() - start;

  console.log(`  JS:        ${jsTime}ms (${formatThroughput(iterations * 1024, jsTime)})`);
  console.log(`  Rust:      ${rustTime}ms (${formatThroughput(iterations * 1024, rustTime)}) - ${(jsTime/rustTime).toFixed(2)}x`);
  console.log(`  Zero-copy: ${zcTime}ms (${formatThroughput(iterations * 1024, zcTime)}) - ${(jsTime/zcTime).toFixed(2)}x`);

  // Benchmark 2: Batch chunk CVs
  console.log('');
  console.log('--- Batch 64 chunks (500 iterations) ---');
  const batchIterations = 500;
  const batch64 = new Uint8Array(64 * 1024);
  for (let i = 0; i < batch64.length; i++) batch64[i] = (i * 17) & 0xff;

  start = Date.now();
  for (let iter = 0; iter < batchIterations; iter++) {
    for (let i = 0; i < 64; i++) {
      baoJs.chunkCV(batch64.subarray(i * 1024, (i + 1) * 1024), i, false);
    }
  }
  const jsSeqTime = Date.now() - start;

  start = Date.now();
  for (let iter = 0; iter < batchIterations; iter++) {
    rustWasm.batchChunkCVs(batch64, 0, 64);
  }
  const rustBatchTime = Date.now() - start;

  console.log(`  JS Sequential:  ${jsSeqTime}ms (${formatThroughput(batchIterations * 64 * 1024, jsSeqTime)})`);
  console.log(`  Rust Batch:     ${rustBatchTime}ms (${formatThroughput(batchIterations * 64 * 1024, rustBatchTime)}) - ${(jsSeqTime/rustBatchTime).toFixed(2)}x`);

  // Benchmark 3: Parent CV
  console.log('');
  console.log('--- parentCV (10,000 iterations) ---');

  start = Date.now();
  for (let i = 0; i < iterations; i++) {
    baoJs.parentCV(left, right, false);
  }
  const jsParentTime = Date.now() - start;

  start = Date.now();
  for (let i = 0; i < iterations; i++) {
    rustWasm.parentCV(left, right, false);
  }
  const rustParentTime = Date.now() - start;

  console.log(`  JS:   ${jsParentTime}ms`);
  console.log(`  Rust: ${rustParentTime}ms - ${(jsParentTime/rustParentTime).toFixed(2)}x`);
}

runTests().catch(console.error);

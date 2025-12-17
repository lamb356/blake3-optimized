/**
 * Test and benchmark zero-copy WASM operations.
 */
'use strict';

const wasmZC = require('./bao-wasm-zerocopy.js');
const baoJs = require('./bao.js');

function toHex(arr) {
  return Array.from(arr).map(b => b.toString(16).padStart(2, '0')).join('');
}

function formatThroughput(bytes, ms) {
  if (ms === 0) return 'Inf MB/s';
  return ((bytes / (1024 * 1024)) / (ms / 1000)).toFixed(2) + ' MB/s';
}

async function runTests() {
  console.log('Initializing WASM...');
  const ok = await wasmZC.initWasm();
  if (!ok) {
    console.error('WASM init failed');
    process.exit(1);
  }
  console.log('WASM available:', wasmZC.isWasmEnabled());
  console.log('');

  let passed = 0;
  let failed = 0;

  // Test 1: Empty chunk CV
  console.log('--- Test 1: Empty chunk CV ---');
  const jsEmpty = baoJs.chunkCV(new Uint8Array(0), 0, true);
  const wasmEmpty = wasmZC.chunkCV(new Uint8Array(0), 0, true);
  if (toHex(jsEmpty) === toHex(wasmEmpty)) {
    console.log('PASS');
    passed++;
  } else {
    console.log('FAIL');
    console.log('  JS:  ', toHex(jsEmpty));
    console.log('  WASM:', toHex(wasmEmpty));
    failed++;
  }

  // Test 2: Single byte
  console.log('--- Test 2: Single byte chunk CV ---');
  const js1 = baoJs.chunkCV(new Uint8Array([42]), 0, false);
  const wasm1 = wasmZC.chunkCV(new Uint8Array([42]), 0, false);
  if (toHex(js1) === toHex(wasm1)) {
    console.log('PASS');
    passed++;
  } else {
    console.log('FAIL');
    failed++;
  }

  // Test 3: Full chunk
  console.log('--- Test 3: Full chunk CV ---');
  const fullChunk = new Uint8Array(1024);
  for (let i = 0; i < 1024; i++) fullChunk[i] = (i * 13) & 0xff;
  const jsFull = baoJs.chunkCV(fullChunk, 5, false);
  const wasmFull = wasmZC.chunkCV(fullChunk, 5, false);
  if (toHex(jsFull) === toHex(wasmFull)) {
    console.log('PASS');
    passed++;
  } else {
    console.log('FAIL');
    failed++;
  }

  // Test 4: Parent CV
  console.log('--- Test 4: Parent CV ---');
  const left = new Uint8Array(32).fill(0x11);
  const right = new Uint8Array(32).fill(0x22);
  const jsParent = baoJs.parentCV(left, right, false);
  const wasmParent = wasmZC.parentCV(left, right, false);
  if (toHex(jsParent) === toHex(wasmParent)) {
    console.log('PASS');
    passed++;
  } else {
    console.log('FAIL');
    failed++;
  }

  // Test 5: Batch chunk CVs
  console.log('--- Test 5: Batch chunk CVs (4 chunks) ---');
  const batchData = new Uint8Array(4 * 1024);
  for (let i = 0; i < batchData.length; i++) batchData[i] = (i * 7) & 0xff;
  const jsBatch = [];
  for (let i = 0; i < 4; i++) {
    jsBatch.push(baoJs.chunkCV(batchData.subarray(i * 1024, (i + 1) * 1024), i, false));
  }
  const wasmBatch = wasmZC.batchChunkCVs(batchData, 0, 4);
  let batchOk = true;
  for (let i = 0; i < 4; i++) {
    if (toHex(jsBatch[i]) !== toHex(wasmBatch[i])) {
      batchOk = false;
      console.log(`  Chunk ${i} mismatch`);
    }
  }
  if (batchOk) {
    console.log('PASS');
    passed++;
  } else {
    console.log('FAIL');
    failed++;
  }

  // Test 6: Zero-copy API
  console.log('--- Test 6: Zero-copy direct API ---');
  const input = wasmZC.getInputBuffer();
  input.set(fullChunk, 0);
  const directCV = wasmZC.chunkCVDirect(1024, 5, false);
  if (toHex(directCV) === toHex(jsFull)) {
    console.log('PASS');
    passed++;
  } else {
    console.log('FAIL');
    failed++;
  }

  // Test 7: baoEncodeWasm vs baoEncode
  console.log('--- Test 7: baoEncodeWasm (4KB) ---');
  const data4k = new Uint8Array(4096);
  for (let i = 0; i < data4k.length; i++) data4k[i] = (i * 11) & 0xff;
  const jsEnc = baoJs.baoEncode(data4k, true);
  const wasmEnc = wasmZC.baoEncodeWasm(data4k, true);
  if (toHex(jsEnc.hash) === toHex(wasmEnc.hash) &&
      toHex(jsEnc.encoded) === toHex(wasmEnc.encoded)) {
    console.log('PASS');
    passed++;
  } else {
    console.log('FAIL');
    console.log('  JS hash:  ', toHex(jsEnc.hash));
    console.log('  WASM hash:', toHex(wasmEnc.hash));
    failed++;
  }

  // Test 8: baoEncodeWasm combined mode
  console.log('--- Test 8: baoEncodeWasm combined (4KB) ---');
  const jsEncComb = baoJs.baoEncode(data4k, false);
  const wasmEncComb = wasmZC.baoEncodeWasm(data4k, false);
  if (toHex(jsEncComb.hash) === toHex(wasmEncComb.hash) &&
      toHex(jsEncComb.encoded) === toHex(wasmEncComb.encoded)) {
    console.log('PASS');
    passed++;
  } else {
    console.log('FAIL');
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
    wasmZC.chunkCV(fullChunk, i, false);
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
    wasmZC.chunkCV(fullChunk, i, false);
  }
  const wasmTime = Date.now() - start;

  // Zero-copy: write once, call many times with same data
  input.set(fullChunk, 0);
  start = Date.now();
  for (let i = 0; i < iterations; i++) {
    wasmZC.chunkCVDirect(1024, i, false);
  }
  const zcTime = Date.now() - start;

  console.log(`  JS:        ${jsTime}ms (${formatThroughput(iterations * 1024, jsTime)})`);
  console.log(`  WASM:      ${wasmTime}ms (${formatThroughput(iterations * 1024, wasmTime)}) - ${(jsTime/wasmTime).toFixed(2)}x`);
  console.log(`  Zero-copy: ${zcTime}ms (${formatThroughput(iterations * 1024, zcTime)}) - ${(jsTime/zcTime).toFixed(2)}x`);

  // Benchmark 2: Batch vs sequential
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
    wasmZC.batchChunkCVs(batch64, 0, 64);
  }
  const wasmBatchTime = Date.now() - start;

  // Zero-copy batch
  start = Date.now();
  for (let iter = 0; iter < batchIterations; iter++) {
    input.set(batch64, 0);
    wasmZC.batchChunkCVsDirect(64, 0);
  }
  const zcBatchTime = Date.now() - start;

  console.log(`  JS Sequential:  ${jsSeqTime}ms (${formatThroughput(batchIterations * 64 * 1024, jsSeqTime)})`);
  console.log(`  WASM Batch:     ${wasmBatchTime}ms (${formatThroughput(batchIterations * 64 * 1024, wasmBatchTime)}) - ${(jsSeqTime/wasmBatchTime).toFixed(2)}x`);
  console.log(`  ZC Batch:       ${zcBatchTime}ms (${formatThroughput(batchIterations * 64 * 1024, zcBatchTime)}) - ${(jsSeqTime/zcBatchTime).toFixed(2)}x`);

  // Benchmark 3: Full baoEncode
  console.log('');
  console.log('--- baoEncode outboard ---');
  const sizes = [
    { name: '4 KB', bytes: 4 * 1024, iters: 5000 },
    { name: '64 KB', bytes: 64 * 1024, iters: 1000 },
    { name: '1 MB', bytes: 1024 * 1024, iters: 100 },
  ];

  for (const { name, bytes, iters } of sizes) {
    const data = new Uint8Array(bytes);
    for (let i = 0; i < bytes; i++) data[i] = (i * 13) & 0xff;

    start = Date.now();
    for (let i = 0; i < iters; i++) {
      baoJs.baoEncode(data, true);
    }
    const jsT = Date.now() - start;

    start = Date.now();
    for (let i = 0; i < iters; i++) {
      wasmZC.baoEncodeWasm(data, true);
    }
    const wasmT = Date.now() - start;

    const jsTP = formatThroughput(bytes * iters, jsT);
    const wasmTP = formatThroughput(bytes * iters, wasmT);
    const speedup = (jsT / wasmT).toFixed(2);

    console.log(`  ${name.padEnd(6)}: JS=${jsTP.padEnd(12)} WASM=${wasmTP.padEnd(12)} (${speedup}x)`);
  }
}

runTests().catch(console.error);

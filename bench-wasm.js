/**
 * Benchmark WASM vs JS Bao operations.
 */
'use strict';

const baoWasm = require('./bao-wasm.js');
const baoJs = require('./bao.js');

function formatThroughput(bytes, ms) {
  const mbps = (bytes / (1024 * 1024)) / (ms / 1000);
  return `${mbps.toFixed(2)} MB/s`;
}

async function benchmark() {
  console.log('Initializing WASM...');
  const wasmAvailable = await baoWasm.initWasm();
  console.log('WASM available:', wasmAvailable);
  console.log('');

  // Test sizes
  const sizes = [
    { name: '1 KB', bytes: 1024 },
    { name: '4 KB', bytes: 4 * 1024 },
    { name: '16 KB', bytes: 16 * 1024 },
    { name: '64 KB', bytes: 64 * 1024 },
    { name: '256 KB', bytes: 256 * 1024 },
    { name: '1 MB', bytes: 1024 * 1024 },
    { name: '4 MB', bytes: 4 * 1024 * 1024 }
  ];

  // Warmup
  console.log('Warming up...');
  const warmupData = new Uint8Array(64 * 1024);
  for (let i = 0; i < warmupData.length; i++) warmupData[i] = i & 0xff;
  for (let i = 0; i < 10; i++) {
    baoJs.baoEncode(warmupData, true);
    if (wasmAvailable) baoWasm.baoEncodeWasm(warmupData, true);
  }
  console.log('');

  // Benchmark chunkCV
  console.log('=== chunkCV Benchmark ===');
  const chunkData = new Uint8Array(1024);
  for (let i = 0; i < 1024; i++) chunkData[i] = i & 0xff;

  const iterations = 10000;

  // JS chunkCV
  let start = Date.now();
  for (let i = 0; i < iterations; i++) {
    baoJs.chunkCV(chunkData, i, false);
  }
  let jsTime = Date.now() - start;
  console.log(`JS:   ${iterations} iterations in ${jsTime}ms = ${(iterations * 1024 / (1024*1024)) / (jsTime/1000)} MB/s`);

  // WASM chunkCV
  if (wasmAvailable) {
    start = Date.now();
    for (let i = 0; i < iterations; i++) {
      baoWasm.chunkCV(chunkData, i, false);
    }
    let wasmTime = Date.now() - start;
    console.log(`WASM: ${iterations} iterations in ${wasmTime}ms = ${(iterations * 1024 / (1024*1024)) / (wasmTime/1000)} MB/s`);
    console.log(`Speedup: ${(jsTime / wasmTime).toFixed(2)}x`);
  }
  console.log('');

  // Benchmark parentCV
  console.log('=== parentCV Benchmark ===');
  const leftCV = new Uint8Array(32).fill(0x11);
  const rightCV = new Uint8Array(32).fill(0x22);

  start = Date.now();
  for (let i = 0; i < iterations; i++) {
    baoJs.parentCV(leftCV, rightCV, false);
  }
  jsTime = Date.now() - start;
  console.log(`JS:   ${iterations} iterations in ${jsTime}ms`);

  if (wasmAvailable) {
    start = Date.now();
    for (let i = 0; i < iterations; i++) {
      baoWasm.parentCV(leftCV, rightCV, false);
    }
    let wasmTime = Date.now() - start;
    console.log(`WASM: ${iterations} iterations in ${wasmTime}ms`);
    console.log(`Speedup: ${(jsTime / wasmTime).toFixed(2)}x`);
  }
  console.log('');

  // Benchmark batchChunkCVs
  console.log('=== batchChunkCVs Benchmark (64 chunks) ===');
  const batch64Data = new Uint8Array(64 * 1024);
  for (let i = 0; i < batch64Data.length; i++) batch64Data[i] = i & 0xff;

  const batchIterations = 500;

  // JS sequential
  start = Date.now();
  for (let iter = 0; iter < batchIterations; iter++) {
    for (let i = 0; i < 64; i++) {
      const chunk = batch64Data.subarray(i * 1024, (i + 1) * 1024);
      baoJs.chunkCV(chunk, i, false);
    }
  }
  jsTime = Date.now() - start;
  console.log(`JS Sequential: ${batchIterations * 64 * 1024 / (1024*1024)} MB in ${jsTime}ms = ${formatThroughput(batchIterations * 64 * 1024, jsTime)}`);

  if (wasmAvailable) {
    start = Date.now();
    for (let iter = 0; iter < batchIterations; iter++) {
      baoWasm.batchChunkCVs(batch64Data, 0, 64);
    }
    let wasmTime = Date.now() - start;
    console.log(`WASM Batch:    ${batchIterations * 64 * 1024 / (1024*1024)} MB in ${wasmTime}ms = ${formatThroughput(batchIterations * 64 * 1024, wasmTime)}`);
    console.log(`Speedup: ${(jsTime / wasmTime).toFixed(2)}x`);
  }
  console.log('');

  // Benchmark full baoEncode
  console.log('=== baoEncode Benchmark ===');
  for (const { name, bytes } of sizes) {
    const data = new Uint8Array(bytes);
    for (let i = 0; i < bytes; i++) data[i] = (i * 17) & 0xff;

    const iterations = Math.max(10, Math.floor(10000000 / bytes)); // Scale iterations by size

    // JS encode
    start = Date.now();
    for (let i = 0; i < iterations; i++) {
      baoJs.baoEncode(data, true);
    }
    jsTime = Date.now() - start;
    const jsTP = formatThroughput(bytes * iterations, jsTime);

    let wasmTP = 'N/A';
    let speedup = '';

    if (wasmAvailable) {
      start = Date.now();
      for (let i = 0; i < iterations; i++) {
        baoWasm.baoEncodeWasm(data, true);
      }
      let wasmTime = Date.now() - start;
      wasmTP = formatThroughput(bytes * iterations, wasmTime);
      speedup = ` (${(jsTime / wasmTime).toFixed(2)}x)`;
    }

    console.log(`${name.padEnd(8)}: JS=${jsTP.padEnd(12)} WASM=${wasmTP}${speedup}`);
  }
}

benchmark().catch(console.error);

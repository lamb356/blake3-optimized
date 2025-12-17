/**
 * Test WASM module correctness against JS implementation.
 */
'use strict';

const baoWasm = require('./bao-wasm.js');
const baoJs = require('./bao.js');

function toHex(arr) {
  return Array.from(arr).map(b => b.toString(16).padStart(2, '0')).join('');
}

function arraysEqual(a, b) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

async function runTests() {
  console.log('Initializing WASM...');
  const wasmAvailable = await baoWasm.initWasm();
  console.log('WASM available:', wasmAvailable);

  if (!wasmAvailable) {
    console.log('WASM not available, tests will use JS fallback');
  }

  let passed = 0;
  let failed = 0;

  // Test 1: Empty chunk CV
  console.log('\n--- Test 1: Empty chunk CV ---');
  {
    const jsResult = baoJs.chunkCV(new Uint8Array(0), 0, true);
    const wasmResult = baoWasm.chunkCV(new Uint8Array(0), 0, true);
    console.log('JS:  ', toHex(jsResult));
    console.log('WASM:', toHex(wasmResult));
    if (arraysEqual(jsResult, wasmResult)) {
      console.log('PASS');
      passed++;
    } else {
      console.log('FAIL: Results differ');
      failed++;
    }
  }

  // Test 2: Single byte chunk CV
  console.log('\n--- Test 2: Single byte chunk CV ---');
  {
    const data = new Uint8Array([0x42]);
    const jsResult = baoJs.chunkCV(data, 0, true);
    const wasmResult = baoWasm.chunkCV(data, 0, true);
    console.log('JS:  ', toHex(jsResult));
    console.log('WASM:', toHex(wasmResult));
    if (arraysEqual(jsResult, wasmResult)) {
      console.log('PASS');
      passed++;
    } else {
      console.log('FAIL: Results differ');
      failed++;
    }
  }

  // Test 3: Full chunk (1024 bytes)
  console.log('\n--- Test 3: Full 1024-byte chunk CV ---');
  {
    const data = new Uint8Array(1024);
    for (let i = 0; i < 1024; i++) data[i] = i & 0xff;
    const jsResult = baoJs.chunkCV(data, 0, false);
    const wasmResult = baoWasm.chunkCV(data, 0, false);
    console.log('JS:  ', toHex(jsResult));
    console.log('WASM:', toHex(wasmResult));
    if (arraysEqual(jsResult, wasmResult)) {
      console.log('PASS');
      passed++;
    } else {
      console.log('FAIL: Results differ');
      failed++;
    }
  }

  // Test 4: Chunk with non-zero index
  console.log('\n--- Test 4: Chunk with index=5 ---');
  {
    const data = new Uint8Array(1024).fill(0xaa);
    const jsResult = baoJs.chunkCV(data, 5, false);
    const wasmResult = baoWasm.chunkCV(data, 5, false);
    console.log('JS:  ', toHex(jsResult));
    console.log('WASM:', toHex(wasmResult));
    if (arraysEqual(jsResult, wasmResult)) {
      console.log('PASS');
      passed++;
    } else {
      console.log('FAIL: Results differ');
      failed++;
    }
  }

  // Test 5: Parent CV
  console.log('\n--- Test 5: Parent CV ---');
  {
    const leftCV = new Uint8Array(32);
    const rightCV = new Uint8Array(32);
    for (let i = 0; i < 32; i++) {
      leftCV[i] = i;
      rightCV[i] = 255 - i;
    }
    const jsResult = baoJs.parentCV(leftCV, rightCV, false);
    const wasmResult = baoWasm.parentCV(leftCV, rightCV, false);
    console.log('JS:  ', toHex(jsResult));
    console.log('WASM:', toHex(wasmResult));
    if (arraysEqual(jsResult, wasmResult)) {
      console.log('PASS');
      passed++;
    } else {
      console.log('FAIL: Results differ');
      failed++;
    }
  }

  // Test 6: Parent CV as root
  console.log('\n--- Test 6: Parent CV (root) ---');
  {
    const leftCV = new Uint8Array(32).fill(0x11);
    const rightCV = new Uint8Array(32).fill(0x22);
    const jsResult = baoJs.parentCV(leftCV, rightCV, true);
    const wasmResult = baoWasm.parentCV(leftCV, rightCV, true);
    console.log('JS:  ', toHex(jsResult));
    console.log('WASM:', toHex(wasmResult));
    if (arraysEqual(jsResult, wasmResult)) {
      console.log('PASS');
      passed++;
    } else {
      console.log('FAIL: Results differ');
      failed++;
    }
  }

  // Test 7: Batch chunk CVs
  console.log('\n--- Test 7: Batch chunk CVs (4 chunks) ---');
  {
    const data = new Uint8Array(4 * 1024);
    for (let i = 0; i < data.length; i++) data[i] = (i * 7) & 0xff;

    // JS sequential
    const jsCVs = [];
    for (let i = 0; i < 4; i++) {
      const chunk = data.subarray(i * 1024, (i + 1) * 1024);
      jsCVs.push(baoJs.chunkCV(chunk, i, false));
    }

    // WASM batch
    const wasmCVs = baoWasm.batchChunkCVs(data, 0, 4);

    let allMatch = true;
    for (let i = 0; i < 4; i++) {
      console.log(`Chunk ${i} JS:  `, toHex(jsCVs[i]));
      console.log(`Chunk ${i} WASM:`, toHex(wasmCVs[i]));
      if (!arraysEqual(jsCVs[i], wasmCVs[i])) {
        allMatch = false;
      }
    }
    if (allMatch) {
      console.log('PASS');
      passed++;
    } else {
      console.log('FAIL: Some chunks differ');
      failed++;
    }
  }

  // Test 8: Bao encode comparison
  console.log('\n--- Test 8: Bao encode (2KB) ---');
  {
    const data = new Uint8Array(2048);
    for (let i = 0; i < data.length; i++) data[i] = (i * 13) & 0xff;

    const jsResult = baoJs.baoEncode(data, false);
    const wasmResult = baoWasm.baoEncodeWasm(data, false);

    console.log('JS hash:  ', toHex(jsResult.hash));
    console.log('WASM hash:', toHex(wasmResult.hash));

    const hashMatch = arraysEqual(jsResult.hash, wasmResult.hash);
    const encodedMatch = arraysEqual(jsResult.encoded, wasmResult.encoded);

    console.log('Hash match:', hashMatch);
    console.log('Encoded match:', encodedMatch);
    console.log('Encoded length JS:', jsResult.encoded.length, 'WASM:', wasmResult.encoded.length);

    if (hashMatch && encodedMatch) {
      console.log('PASS');
      passed++;
    } else {
      console.log('FAIL');
      failed++;
    }
  }

  // Test 9: Bao encode outboard
  console.log('\n--- Test 9: Bao encode outboard (4KB) ---');
  {
    const data = new Uint8Array(4096);
    for (let i = 0; i < data.length; i++) data[i] = (i * 17) & 0xff;

    const jsResult = baoJs.baoEncode(data, true);
    const wasmResult = baoWasm.baoEncodeWasm(data, true);

    console.log('JS hash:  ', toHex(jsResult.hash));
    console.log('WASM hash:', toHex(wasmResult.hash));

    const hashMatch = arraysEqual(jsResult.hash, wasmResult.hash);
    const encodedMatch = arraysEqual(jsResult.encoded, wasmResult.encoded);

    console.log('Hash match:', hashMatch);
    console.log('Encoded match:', encodedMatch);

    if (hashMatch && encodedMatch) {
      console.log('PASS');
      passed++;
    } else {
      console.log('FAIL');
      failed++;
    }
  }

  // Test 10: Large encode
  console.log('\n--- Test 10: Bao encode (64KB) ---');
  {
    const data = new Uint8Array(64 * 1024);
    for (let i = 0; i < data.length; i++) data[i] = (i * 19) & 0xff;

    const jsResult = baoJs.baoEncode(data, false);
    const wasmResult = baoWasm.baoEncodeWasm(data, false);

    console.log('JS hash:  ', toHex(jsResult.hash));
    console.log('WASM hash:', toHex(wasmResult.hash));

    const hashMatch = arraysEqual(jsResult.hash, wasmResult.hash);

    if (hashMatch) {
      console.log('PASS');
      passed++;
    } else {
      console.log('FAIL: Hash mismatch');
      failed++;
    }
  }

  console.log('\n========================================');
  console.log(`Results: ${passed} passed, ${failed} failed`);

  return failed === 0;
}

runTests().then(success => {
  process.exit(success ? 0 : 1);
}).catch(err => {
  console.error('Test error:', err);
  process.exit(1);
});

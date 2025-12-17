/**
 * Tests for parallel Bao encoding.
 */
'use strict';

const bao = require('./bao.js');
const { ParallelBaoEncoder, parallelEncode, getOptimalWorkerCount } = require('./bao-parallel.js');

let passed = 0;
let failed = 0;

async function asyncTest(name, fn) {
  try {
    await fn();
    console.log('PASS: ' + name);
    passed++;
  } catch (e) {
    console.log('FAIL: ' + name);
    console.log('  Error: ' + e.message);
    failed++;
  }
}

function assertArrayEqual(a, b, msg) {
  msg = msg || '';
  if (a.length !== b.length) {
    throw new Error(msg + 'Length mismatch: ' + a.length + ' vs ' + b.length);
  }
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) {
      throw new Error(msg + 'Mismatch at index ' + i + ': ' + a[i] + ' vs ' + b[i]);
    }
  }
}

function generateTestData(size) {
  const data = new Uint8Array(size);
  for (let i = 0; i < size; i++) {
    data[i] = (i * 7 + 13) % 256;
  }
  return data;
}

async function runTests() {
  console.log('Parallel Bao Tests');
  console.log('==================');
  console.log('');

  console.log('Detected CPU cores: ' + (getOptimalWorkerCount() + 1));
  console.log('');

  console.log('--- Basic Functionality ---');
  console.log('');

  await asyncTest('Small file (below threshold)', async () => {
    const data = generateTestData(1000);
    const result = await parallelEncode(data, { parallelThreshold: 2000 });
    const expected = bao.baoEncode(data);
    assertArrayEqual(result.encoded, expected.encoded);
    assertArrayEqual(result.hash, expected.hash);
  });

  await asyncTest('Large file combined mode', async () => {
    const data = generateTestData(100 * 1024);
    const result = await parallelEncode(data, { parallelThreshold: 10 * 1024 });
    const expected = bao.baoEncode(data);
    assertArrayEqual(result.encoded, expected.encoded, 'Encoded: ');
    assertArrayEqual(result.hash, expected.hash, 'Hash: ');
  });

  await asyncTest('Large file outboard mode', async () => {
    const data = generateTestData(100 * 1024);
    const result = await parallelEncode(data, { outboard: true, parallelThreshold: 10 * 1024 });
    const expected = bao.baoEncode(data, true);
    assertArrayEqual(result.encoded, expected.encoded, 'Encoded: ');
    assertArrayEqual(result.hash, expected.hash, 'Hash: ');
  });

  console.log('');
  console.log('--- Edge Cases ---');
  console.log('');

  await asyncTest('Empty input', async () => {
    const data = new Uint8Array(0);
    const result = await parallelEncode(data, { parallelThreshold: 1024 });
    const expected = bao.baoEncode(data);
    assertArrayEqual(result.encoded, expected.encoded);
    assertArrayEqual(result.hash, expected.hash);
  });

  await asyncTest('Single chunk', async () => {
    const data = generateTestData(1024);
    const result = await parallelEncode(data, { parallelThreshold: 512 });
    const expected = bao.baoEncode(data);
    assertArrayEqual(result.encoded, expected.encoded);
    assertArrayEqual(result.hash, expected.hash);
  });

  await asyncTest('Exactly 2 chunks', async () => {
    const data = generateTestData(2048);
    const result = await parallelEncode(data, { parallelThreshold: 1024 });
    const expected = bao.baoEncode(data);
    assertArrayEqual(result.encoded, expected.encoded);
    assertArrayEqual(result.hash, expected.hash);
  });

  console.log('');
  console.log('==================');
  console.log('Results: ' + passed + ' passed, ' + failed + ' failed');
  console.log('');

  if (failed > 0) {
    console.log('Some tests failed.');
    process.exit(1);
  } else {
    console.log('All parallel Bao tests passed!');
  }
}

runTests().catch(e => {
  console.error('Test runner error:', e);
  process.exit(1);
});

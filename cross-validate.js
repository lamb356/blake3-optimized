/**
 * Cross-validation against Python reference implementation
 */

const { execSync, spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const blake3 = require('./blake3.js');
const bao = require('./bao.js');

// Check Python availability
function checkPython() {
  try {
    execSync('python --version', { stdio: 'pipe' });
    return 'python';
  } catch {
    try {
      execSync('python3 --version', { stdio: 'pipe' });
      return 'python3';
    } catch {
      return null;
    }
  }
}

const PYTHON = checkPython();

function toHex(bytes) {
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

function fromHex(hex) {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
  }
  return bytes;
}

// Generate test input (same as test vectors: 4-byte LE counter)
function generateInput(length) {
  const input = new Uint8Array(length);
  let counter = 1;
  for (let i = 0; i < length; i += 4) {
    const remaining = Math.min(4, length - i);
    for (let j = 0; j < remaining; j++) {
      input[i + j] = (counter >> (j * 8)) & 0xff;
    }
    counter++;
  }
  return input;
}

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`PASS: ${name}`);
    passed++;
  } catch (e) {
    console.log(`FAIL: ${name}`);
    console.log(`  Error: ${e.message}`);
    failed++;
  }
}

function assertEqual(actual, expected, msg) {
  if (actual !== expected) {
    throw new Error(`${msg}\n  Expected: ${expected}\n  Got: ${actual}`);
  }
}

// Run Python bao_hash function
function pythonHash(inputBytes) {
  const tempFile = path.join(__dirname, '.temp_input');
  fs.writeFileSync(tempFile, Buffer.from(inputBytes));

  try {
    const result = spawnSync(PYTHON, ['-c', `
import sys
sys.path.insert(0, '${__dirname.replace(/\\/g, '/')}')
from docs import bao_reference
import io

with open('${tempFile.replace(/\\/g, '/')}', 'rb') as f:
    data = f.read()

hash_result = bao_reference.bao_hash(io.BytesIO(data))
print(hash_result.hex())
`], { encoding: 'utf8', cwd: __dirname });

    if (result.error) throw result.error;
    if (result.status !== 0) throw new Error(result.stderr);

    return result.stdout.trim().replace(/\r/g, '');
  } finally {
    try { fs.unlinkSync(tempFile); } catch {}
  }
}

// Run Python bao_encode function
function pythonEncode(inputBytes, outboard = false) {
  const tempFile = path.join(__dirname, '.temp_input');
  fs.writeFileSync(tempFile, Buffer.from(inputBytes));

  try {
    const result = spawnSync(PYTHON, ['-c', `
import sys
sys.path.insert(0, '${__dirname.replace(/\\/g, '/')}')
from docs import bao_reference

with open('${tempFile.replace(/\\/g, '/')}', 'rb') as f:
    data = f.read()

encoded, hash_result = bao_reference.bao_encode(data, outboard=${outboard ? 'True' : 'False'})
print(hash_result.hex())
print(encoded.hex())
`], { encoding: 'utf8', cwd: __dirname });

    if (result.error) throw result.error;
    if (result.status !== 0) throw new Error(result.stderr);

    const lines = result.stdout.trim().replace(/\r/g, '').split('\n');
    return {
      hash: lines[0],
      encoded: lines[1]
    };
  } finally {
    try { fs.unlinkSync(tempFile); } catch {}
  }
}

// Run Python bao_slice function
function pythonSlice(inputBytes, sliceStart, sliceLen) {
  const tempFile = path.join(__dirname, '.temp_input');
  const tempEncoded = path.join(__dirname, '.temp_encoded');

  // First encode the input
  const { encoded: encodedHex } = pythonEncode(inputBytes, false);
  fs.writeFileSync(tempEncoded, Buffer.from(encodedHex, 'hex'));

  try {
    const result = spawnSync(PYTHON, ['-c', `
import sys
sys.path.insert(0, '${__dirname.replace(/\\/g, '/')}')
from docs import bao_reference
import io

with open('${tempEncoded.replace(/\\/g, '/')}', 'rb') as f:
    encoded_data = f.read()

output = io.BytesIO()
bao_reference.bao_slice(
    io.BytesIO(encoded_data),
    output,
    ${sliceStart},
    ${sliceLen}
)
print(output.getvalue().hex())
`], { encoding: 'utf8', cwd: __dirname });

    if (result.error) throw result.error;
    if (result.status !== 0) throw new Error(result.stderr);

    return result.stdout.trim().replace(/\r/g, '');
  } finally {
    try { fs.unlinkSync(tempFile); } catch {}
    try { fs.unlinkSync(tempEncoded); } catch {}
  }
}

console.log('Cross-Validation Against Python Reference');
console.log('==========================================\n');

if (!PYTHON) {
  console.log('ERROR: Python not found. Cannot run cross-validation.');
  console.log('Please install Python 3 and ensure it is in PATH.');
  process.exit(1);
}

console.log(`Using Python: ${PYTHON}\n`);

// Create docs/__init__.py if needed for Python imports
const initFile = path.join(__dirname, 'docs', '__init__.py');
if (!fs.existsSync(initFile)) {
  fs.writeFileSync(initFile, '');
}

// Rename bao-reference.py to bao_reference.py for Python import
const refOriginal = path.join(__dirname, 'docs', 'bao-reference.py');
const refRenamed = path.join(__dirname, 'docs', 'bao_reference.py');
if (fs.existsSync(refOriginal) && !fs.existsSync(refRenamed)) {
  fs.copyFileSync(refOriginal, refRenamed);
}

// ============================
// BLAKE3 Hash Tests
// ============================
console.log('--- BLAKE3 Hash Comparison ---\n');

const hashTests = [
  { name: 'empty', data: new Uint8Array(0) },
  { name: '"hello"', data: new TextEncoder().encode('hello') },
  { name: '1 KB', data: generateInput(1024) },
  { name: '1025 bytes (2 chunks)', data: generateInput(1025) },
  { name: '2048 bytes', data: generateInput(2048) },
  { name: '10 KB', data: generateInput(10240) },
];

for (const tc of hashTests) {
  test(`Hash ${tc.name}`, () => {
    const jsHash = blake3.hashHex(tc.data);
    const pyHash = pythonHash(tc.data);
    assertEqual(jsHash, pyHash, `Hash mismatch for ${tc.name}`);
  });
}

// ============================
// Bao Encode Tests
// ============================
console.log('\n--- Bao Encode Comparison ---\n');

const encodeTests = [
  { name: 'empty', data: new Uint8Array(0) },
  { name: '1 byte', data: new Uint8Array([0x42]) },
  { name: '100 bytes', data: generateInput(100) },
  { name: '1024 bytes (1 chunk)', data: generateInput(1024) },
  { name: '1025 bytes (2 chunks)', data: generateInput(1025) },
  { name: '2048 bytes', data: generateInput(2048) },
  { name: '2049 bytes (3 chunks)', data: generateInput(2049) },
  { name: '5000 bytes', data: generateInput(5000) },
];

for (const tc of encodeTests) {
  test(`Encode ${tc.name} - hash`, () => {
    const jsResult = bao.baoEncode(tc.data);
    const pyResult = pythonEncode(tc.data, false);
    assertEqual(toHex(jsResult.hash), pyResult.hash, `Hash mismatch for ${tc.name}`);
  });

  test(`Encode ${tc.name} - encoded bytes`, () => {
    const jsResult = bao.baoEncode(tc.data);
    const pyResult = pythonEncode(tc.data, false);
    assertEqual(toHex(jsResult.encoded), pyResult.encoded, `Encoded mismatch for ${tc.name}`);
  });
}

// ============================
// Bao Outboard Encode Tests
// ============================
console.log('\n--- Bao Outboard Encode Comparison ---\n');

for (const tc of encodeTests) {
  test(`Outboard ${tc.name} - hash`, () => {
    const jsResult = bao.baoEncode(tc.data, true);
    const pyResult = pythonEncode(tc.data, true);
    assertEqual(toHex(jsResult.hash), pyResult.hash, `Outboard hash mismatch for ${tc.name}`);
  });

  test(`Outboard ${tc.name} - encoded bytes`, () => {
    const jsResult = bao.baoEncode(tc.data, true);
    const pyResult = pythonEncode(tc.data, true);
    assertEqual(toHex(jsResult.encoded), pyResult.encoded, `Outboard encoded mismatch for ${tc.name}`);
  });
}

// ============================
// Bao Slice Tests
// ============================
console.log('\n--- Bao Slice Comparison ---\n');

const sliceTests = [
  { name: '2KB file, [0, 1024)', data: generateInput(2048), start: 0, len: 1024 },
  { name: '2KB file, [1024, 1024)', data: generateInput(2048), start: 1024, len: 1024 },
  { name: '5KB file, [1000, 2000)', data: generateInput(5120), start: 1000, len: 2000 },
  { name: '5KB file, [0, 100)', data: generateInput(5120), start: 0, len: 100 },
  { name: '10KB file, [5000, 1000)', data: generateInput(10240), start: 5000, len: 1000 },
];

for (const tc of sliceTests) {
  test(`Slice ${tc.name}`, () => {
    const { encoded } = bao.baoEncode(tc.data);
    const jsSlice = bao.baoSlice(encoded, tc.start, tc.len);
    const pySlice = pythonSlice(tc.data, tc.start, tc.len);
    assertEqual(toHex(jsSlice), pySlice, `Slice mismatch for ${tc.name}`);
  });
}

// ============================
// Round-trip Verification
// ============================
console.log('\n--- Round-trip Verification ---\n');

for (const tc of encodeTests) {
  test(`Round-trip ${tc.name}`, () => {
    // Encode with Python, decode with JS
    const pyResult = pythonEncode(tc.data, false);
    const pyEncoded = fromHex(pyResult.encoded);
    const pyHash = fromHex(pyResult.hash);

    // Decode with our JS implementation
    const decoded = bao.baoDecode(pyEncoded, pyHash);

    // Verify data matches
    if (decoded.length !== tc.data.length) {
      throw new Error(`Length mismatch: ${decoded.length} vs ${tc.data.length}`);
    }
    for (let i = 0; i < decoded.length; i++) {
      if (decoded[i] !== tc.data[i]) {
        throw new Error(`Data mismatch at index ${i}`);
      }
    }
  });
}

// ============================
// Summary
// ============================
console.log('\n==========================================');
console.log(`Results: ${passed} passed, ${failed} failed`);

if (failed === 0) {
  console.log('\nAll cross-validation tests passed!');
  console.log('JavaScript implementation matches Python reference exactly.');
} else {
  console.log('\nSome tests failed. Investigation needed.');
  process.exit(1);
}

// Cleanup
try { fs.unlinkSync(initFile); } catch {}

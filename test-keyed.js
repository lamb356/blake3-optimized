/**
 * BLAKE3 Keyed Hashing Test
 * Uses official test vectors from the BLAKE3 spec
 * Test key: "whats the Elvish word for friend" (32 bytes)
 */

const blake3 = require('./blake3.js');

function toHex(bytes) {
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

// Official test key from BLAKE3 test vectors
const TEST_KEY = new TextEncoder().encode("whats the Elvish word for friend");

// Generate test input pattern: incrementing bytes mod 251
function generateTestInput(length) {
  const input = new Uint8Array(length);
  for (let i = 0; i < length; i++) {
    input[i] = i % 251;
  }
  return input;
}

// Official keyed_hash test vectors from BLAKE3 repo
const KEYED_HASH_VECTORS = [
  { inputLen: 0, hash: '92b2b75604ed3c761f9d6f62392c8a9227ad0ea3f09573e783f1498a4ed60d26' },
  { inputLen: 1, hash: '6d7878dfff2f485635d39013278ae14f1454b8c0a3a2d34bc1ab38228a80c95b' },
  { inputLen: 2, hash: '5392ddae0e0a69d5f40160462cbd9bd889375082ff224ac9c758802b7a6fd20a' },
  { inputLen: 3, hash: '39e67b76b5a007d4921969779fe666da67b5213b096084ab674742f0d5ec62b9' },
  { inputLen: 4, hash: '7671dde590c95d5ac9616651ff5aa0a27bee5913a348e053b8aa9108917fe070' },
  { inputLen: 5, hash: '73ac69eecf286894d8102018a6fc729f4b1f4247d3703f69bdc6a5fe3e0c8461' },
  { inputLen: 6, hash: '82d3199d0013035682cc7f2a399d4c212544376a839aa863a0f4c91220ca7a6d' },
  { inputLen: 7, hash: 'af0a7ec382aedc0cfd626e49e7628bc7a353a4cb108855541a5651bf64fbb28a' },
  { inputLen: 8, hash: 'be2f5495c61cba1bb348a34948c004045e3bd4dae8f0fe82bf44d0da245a0600' },
  { inputLen: 63, hash: 'bb1eb5d4afa793c1ebdd9fb08def6c36d10096986ae0cfe148cd101170ce37ae' },
  { inputLen: 64, hash: 'ba8ced36f327700d213f120b1a207a3b8c04330528586f414d09f2f7d9ccb7e6' },
  { inputLen: 65, hash: 'c0a4edefa2d2accb9277c371ac12fcdbb52988a86edc54f0716e1591b4326e72' },
  { inputLen: 127, hash: 'c64200ae7dfaf35577ac5a9521c47863fb71514a3bcad18819218b818de85818' },
  { inputLen: 128, hash: 'b04fe15577457267ff3b6f3c947d93be581e7e3a4b018679125eaf86f6a628ec' },
  { inputLen: 129, hash: 'd4a64dae6cdccbac1e5287f54f17c5f985105457c1a2ec1878ebd4b57e20d38f' },
  { inputLen: 1023, hash: 'c951ecdf03288d0fcc96ee3413563d8a6d3589547f2c2fb36d9786470f1b9d6e' },
  { inputLen: 1024, hash: '75c46f6f3d9eb4f55ecaaee480db732e6c2105546f1e675003687c31719c7ba4' },
  { inputLen: 1025, hash: '357dc55de0c7e382c900fd6e320acc04146be01db6a8ce7210b7189bd664ea69' },
  { inputLen: 2048, hash: '879cf1fa2ea0e79126cb1063617a05b6ad9d0b696d0d757cf053439f60a99dd1' },
  { inputLen: 2049, hash: '9f29700902f7c86e514ddc4df1e3049f258b2472b6dd5267f61bf13983b78dd5' },
  { inputLen: 3072, hash: '044a0e7b172a312dc02a4c9a818c036ffa2776368d7f528268d2e6b5df191770' },
  { inputLen: 3073, hash: '68dede9bef00ba89e43f31a6825f4cf433389fedae75c04ee9f0cf16a427c95a' },
  { inputLen: 4096, hash: 'befc660aea2f1718884cd8deb9902811d332f4fc4a38cf7c7300d597a081bfc0' },
  { inputLen: 4097, hash: '00df940cd36bb9fa7cbbc3556744e0dbc8191401afe70520ba292ee3ca80abbc' },
  { inputLen: 5120, hash: '2c493e48e9b9bf31e0553a22b23503c0a3388f035cece68eb438d22fa1943e20' },
  { inputLen: 5121, hash: '6ccf1c34753e7a044db80798ecd0782a8f76f33563accaddbfbb2e0ea4b2d024' },
  { inputLen: 6144, hash: '3d6b6d21281d0ade5b2b016ae4034c5dec10ca7e475f90f76eac7138e9bc8f1d' },
  { inputLen: 6145, hash: '9ac301e9e39e45e3250a7e3b3df701aa0fb6889fbd80eeecf28dbc6300fbc539' },
  { inputLen: 7168, hash: 'b42835e40e9d4a7f42ad8cc04f85a963a76e18198377ed84adddeaecacc6f3fc' },
  { inputLen: 7169, hash: 'ed9b1a922c046fdb3d423ae34e143b05ca1bf28b710432857bf738bcedbfa511' },
  { inputLen: 8192, hash: 'dc9637c8845a770b4cbf76b8daec0eebf7dc2eac11498517f08d44c8fc00d58a' },
  { inputLen: 8193, hash: '954a2a75420c8d6547e3ba5b98d963e6fa6491addc8c023189cc519821b4a1f5' },
  { inputLen: 16384, hash: '9e9fc4eb7cf081ea7c47d1807790ed211bfec56aa25bb7037784c13c4b707b0d' },
  { inputLen: 31744, hash: 'efa53b389ab67c593dba624d898d0f7353ab99e4ac9d42302ee64cbf9939a419' },
  { inputLen: 102400, hash: '1c35d1a5811083fd7119f5d5d1ba027b4d01c0c6c49fb6ff2cf75393ea5db4a7' },
];

// Test against official BLAKE3 test vectors
function testOfficialVectors() {
  console.log('Testing against official BLAKE3 keyed_hash vectors:');
  let passed = 0;
  let failed = 0;

  for (const vec of KEYED_HASH_VECTORS) {
    const input = generateTestInput(vec.inputLen);
    const result = toHex(blake3.hashKeyed(TEST_KEY, input));

    if (result === vec.hash) {
      console.log(`  PASS: ${vec.inputLen} bytes`);
      passed++;
    } else {
      console.log(`  FAIL: ${vec.inputLen} bytes`);
      console.log(`    Expected: ${vec.hash}`);
      console.log(`    Got:      ${result}`);
      failed++;
    }
  }

  return { passed, failed };
}

// More reliable test: compare streaming keyed hash vs one-shot keyed hash
function testStreamingVsOneShot() {
  console.log('Testing streaming keyed hash vs one-shot keyed hash:');
  let passed = 0;
  let failed = 0;

  const testSizes = [0, 1, 31, 32, 33, 63, 64, 65, 100, 1023, 1024, 1025, 2048, 5000, 10000];

  for (const size of testSizes) {
    const data = generateTestInput(size);

    // One-shot
    const oneShot = toHex(blake3.hashKeyed(TEST_KEY, data));

    // Streaming
    const hasher = blake3.createKeyedHasher(TEST_KEY);
    hasher.update(data);
    const streaming = toHex(hasher.finalize());

    if (oneShot === streaming) {
      console.log(`  PASS: ${size} bytes - one-shot matches streaming`);
      passed++;
    } else {
      console.log(`  FAIL: ${size} bytes`);
      console.log(`    One-shot:  ${oneShot}`);
      console.log(`    Streaming: ${streaming}`);
      failed++;
    }
  }

  return { passed, failed };
}

// Test chunked streaming matches one-shot
function testChunkedStreaming() {
  console.log('\nTesting chunked streaming keyed hash:');
  let passed = 0;
  let failed = 0;

  const testCases = [
    { size: 100, chunkSize: 10 },
    { size: 1000, chunkSize: 100 },
    { size: 2048, chunkSize: 512 },
    { size: 5000, chunkSize: 1000 },
    { size: 10000, chunkSize: 1 },  // byte by byte (small sample)
  ];

  for (const { size, chunkSize } of testCases) {
    const data = generateTestInput(size);

    // One-shot
    const expected = toHex(blake3.hashKeyed(TEST_KEY, data));

    // Chunked streaming
    const hasher = blake3.createKeyedHasher(TEST_KEY);
    for (let i = 0; i < data.length; i += chunkSize) {
      hasher.update(data.subarray(i, Math.min(i + chunkSize, data.length)));
    }
    const actual = toHex(hasher.finalize());

    if (expected === actual) {
      console.log(`  PASS: ${size} bytes in ${chunkSize}-byte chunks`);
      passed++;
    } else {
      console.log(`  FAIL: ${size} bytes in ${chunkSize}-byte chunks`);
      console.log(`    Expected: ${expected}`);
      console.log(`    Actual:   ${actual}`);
      failed++;
    }
  }

  return { passed, failed };
}

// Test that keyed hash differs from regular hash
function testKeyedDiffersFromRegular() {
  console.log('\nTesting keyed hash differs from regular hash:');
  let passed = 0;
  let failed = 0;

  const testSizes = [0, 1, 64, 1024, 5000];

  for (const size of testSizes) {
    const data = generateTestInput(size);

    const regular = toHex(blake3.hash(data));
    const keyed = toHex(blake3.hashKeyed(TEST_KEY, data));

    if (regular !== keyed) {
      console.log(`  PASS: ${size} bytes - keyed differs from regular`);
      passed++;
    } else {
      console.log(`  FAIL: ${size} bytes - keyed should differ from regular!`);
      failed++;
    }
  }

  return { passed, failed };
}

// Test different keys produce different results
function testDifferentKeys() {
  console.log('\nTesting different keys produce different results:');
  let passed = 0;
  let failed = 0;

  const key1 = new Uint8Array(32).fill(0);
  const key2 = new Uint8Array(32).fill(1);
  const key3 = new Uint8Array(32);
  for (let i = 0; i < 32; i++) key3[i] = i;

  const data = generateTestInput(100);

  const hash1 = toHex(blake3.hashKeyed(key1, data));
  const hash2 = toHex(blake3.hashKeyed(key2, data));
  const hash3 = toHex(blake3.hashKeyed(key3, data));

  if (hash1 !== hash2 && hash2 !== hash3 && hash1 !== hash3) {
    console.log('  PASS: All three keys produce different hashes');
    passed++;
  } else {
    console.log('  FAIL: Some keys produced same hash');
    console.log(`    Key1 (0s): ${hash1}`);
    console.log(`    Key2 (1s): ${hash2}`);
    console.log(`    Key3 (0-31): ${hash3}`);
    failed++;
  }

  return { passed, failed };
}

// Test key validation
function testKeyValidation() {
  console.log('\nTesting key validation:');
  let passed = 0;
  let failed = 0;

  // Test wrong key lengths
  const wrongLengths = [0, 1, 16, 31, 33, 64];
  for (const len of wrongLengths) {
    try {
      const badKey = new Uint8Array(len);
      blake3.createKeyedHasher(badKey);
      console.log(`  FAIL: Should reject ${len}-byte key`);
      failed++;
    } catch (e) {
      console.log(`  PASS: Correctly rejected ${len}-byte key`);
      passed++;
    }
  }

  // Test correct key length
  try {
    const goodKey = new Uint8Array(32);
    blake3.createKeyedHasher(goodKey);
    console.log('  PASS: Accepted 32-byte key');
    passed++;
  } catch (e) {
    console.log('  FAIL: Should accept 32-byte key');
    failed++;
  }

  return { passed, failed };
}

// Run all tests
console.log('BLAKE3 Keyed Hash Tests');
console.log('=======================\n');

let totalPassed = 0;
let totalFailed = 0;

let result = testOfficialVectors();
totalPassed += result.passed;
totalFailed += result.failed;

result = testStreamingVsOneShot();
totalPassed += result.passed;
totalFailed += result.failed;

result = testChunkedStreaming();
totalPassed += result.passed;
totalFailed += result.failed;

result = testKeyedDiffersFromRegular();
totalPassed += result.passed;
totalFailed += result.failed;

result = testDifferentKeys();
totalPassed += result.passed;
totalFailed += result.failed;

result = testKeyValidation();
totalPassed += result.passed;
totalFailed += result.failed;

console.log('\n=======================');
console.log(`Results: ${totalPassed} passed, ${totalFailed} failed`);

if (totalFailed === 0) {
  console.log('\nAll keyed hash tests passed!');
} else {
  console.log('\nSome tests failed.');
  process.exit(1);
}

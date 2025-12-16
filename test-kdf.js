/**
 * BLAKE3 KDF (Key Derivation Function) Test
 * Uses official test vectors from the BLAKE3 spec
 */

const blake3 = require('./blake3.js');

function toHex(bytes) {
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

// Official test context string from BLAKE3 test vectors
const TEST_CONTEXT = "BLAKE3 2019-12-27 16:29:52 test vectors context";

// Generate test input pattern: incrementing bytes mod 251
function generateTestInput(length) {
  const input = new Uint8Array(length);
  for (let i = 0; i < length; i++) {
    input[i] = i % 251;
  }
  return input;
}

// Official derive_key test vectors from BLAKE3 repo (first 64 hex chars = 32 bytes)
const DERIVE_KEY_VECTORS = [
  { inputLen: 0, hash: '2cc39783c223154fea8dfb7c1b1660f2ac2dcbd1c1de8277b0b0dd39b7e50d7d' },
  { inputLen: 1, hash: 'b3e2e340a117a499c6cf2398a19ee0d29cca2bb7404c73063382693bf66cb06c' },
  { inputLen: 2, hash: '1f166565a7df0098ee65922d7fea425fb18b9943f19d6161e2d17939356168e6' },
  { inputLen: 3, hash: '440aba35cb006b61fc17c0529255de438efc06a8c9ebf3f2ddac3b5a86705797' },
  { inputLen: 4, hash: 'f46085c8190d69022369ce1a18880e9b369c135eb93f3c63550d3e7630e91060' },
  { inputLen: 5, hash: '1f24eda69dbcb752847ec3ebb5dd42836d86e58500c7c98d906ecd82ed9ae47f' },
  { inputLen: 6, hash: 'be96b30b37919fe4379dfbe752ae77b4f7e2ab92f7ff27435f76f2f065f6a5f4' },
  { inputLen: 7, hash: 'dc3b6485f9d94935329442916b0d059685ba815a1fa2a14107217453a7fc9f0e' },
  { inputLen: 8, hash: '2b166978cef14d9d438046c720519d8b1cad707e199746f1562d0c87fbd32940' },
  { inputLen: 63, hash: 'b6451e30b953c206e34644c6803724e9d2725e0893039cfc49584f991f451af3' },
  { inputLen: 64, hash: 'a5c4a7053fa86b64746d4bb688d06ad1f02a18fce9afd3e818fefaa7126bf73e' },
  { inputLen: 65, hash: '51fd05c3c1cfbc8ed67d139ad76f5cf8236cd2acd26627a30c104dfd9d3ff8a8' },
  { inputLen: 127, hash: 'c91c090ceee3a3ac81902da31838012625bbcd73fcb92e7d7e56f78deba4f0c3' },
  { inputLen: 128, hash: '81720f34452f58a0120a58b6b4608384b5c51d11f39ce97161a0c0e442ca0225' },
  { inputLen: 129, hash: '938d2d4435be30eafdbb2b7031f7857c98b04881227391dc40db3c7b21f41fc1' },
  { inputLen: 1023, hash: '74a16c1c3d44368a86e1ca6df64be6a2f64cce8f09220787450722d85725dea5' },
  { inputLen: 1024, hash: '7356cd7720d5b66b6d0697eb3177d9f8d73a4a5c5e968896eb6a689684302706' },
  { inputLen: 1025, hash: 'effaa245f065fbf82ac186839a249707c3bddf6d3fdda22d1b95a3c970379bcb' },
  { inputLen: 2048, hash: '7b2945cb4fef70885cc5d78a87bf6f6207dd901ff239201351ffac04e1088a23' },
  { inputLen: 2049, hash: '2ea477c5515cc3dd606512ee72bb3e0e758cfae7232826f35fb98ca1bcbdf273' },
  { inputLen: 3072, hash: '050df97f8c2ead654d9bb3ab8c9178edcd902a32f8495949feadcc1e0480c46b' },
  { inputLen: 3073, hash: '72613c9ec9ff7e40f8f5c173784c532ad852e827dba2bf85b2ab4b76f7079081' },
  { inputLen: 4096, hash: '1e0d7f3db8c414c97c6307cbda6cd27ac3b030949da8e23be1a1a924ad2f25b9' },
  { inputLen: 4097, hash: 'aca51029626b55fda7117b42a7c211f8c6e9ba4fe5b7a8ca922f34299500ead8' },
  { inputLen: 5120, hash: '7a7acac8a02adcf3038d74cdd1d34527de8a0fcc0ee3399d1262397ce5817f60' },
  { inputLen: 5121, hash: 'b07f01e518e702f7ccb44a267e9e112d403a7b3f4883a47ffbed4b48339b3c34' },
  { inputLen: 6144, hash: '2a95beae63ddce523762355cf4b9c1d8f131465780a391286a5d01abb5683a15' },
  { inputLen: 6145, hash: '379bcc61d0051dd489f686c13de00d5b14c505245103dc040d9e4dd1facab8e5' },
  { inputLen: 7168, hash: '11c37a112765370c94a51415d0d651190c288566e295d505defdad895dae2237' },
  { inputLen: 7169, hash: '554b0a5efea9ef183f2f9b931b7497995d9eb26f5c5c6dad2b97d62fc5ac31d9' },
  { inputLen: 8192, hash: 'ad01d7ae4ad059b0d33baa3c01319dcf8088094d0359e5fd45d6aeaa8b2d0c3d' },
  { inputLen: 8193, hash: 'af1e0346e389b17c23200270a64aa4e1ead98c61695d917de7d5b00491c9b0f1' },
  { inputLen: 16384, hash: '160e18b5878cd0df1c3af85eb25a0db5344d43a6fbd7a8ef4ed98d0714c3f7e1' },
  { inputLen: 31744, hash: '39772aef80e0ebe60596361e45b061e8f417429d529171b6764468c22928e28e' },
  { inputLen: 102400, hash: '4652cff7a3f385a6103b5c260fc1593e13c778dbe608efb092fe7ee69df6e9c6' },
];

// Test against official vectors
function testOfficialVectors() {
  console.log('Testing against official BLAKE3 derive_key vectors:');
  let passed = 0;
  let failed = 0;

  for (const vec of DERIVE_KEY_VECTORS) {
    const input = generateTestInput(vec.inputLen);
    const result = toHex(blake3.deriveKey(TEST_CONTEXT, input));

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

// Test that different contexts produce different keys
function testDifferentContexts() {
  console.log('\nTesting different contexts produce different keys:');
  let passed = 0;
  let failed = 0;

  const keyMaterial = generateTestInput(32);

  const key1 = toHex(blake3.deriveKey("context one", keyMaterial));
  const key2 = toHex(blake3.deriveKey("context two", keyMaterial));
  const key3 = toHex(blake3.deriveKey("context three", keyMaterial));

  if (key1 !== key2 && key2 !== key3 && key1 !== key3) {
    console.log('  PASS: All three contexts produce different keys');
    passed++;
  } else {
    console.log('  FAIL: Some contexts produced same key');
    console.log(`    Context 1: ${key1}`);
    console.log(`    Context 2: ${key2}`);
    console.log(`    Context 3: ${key3}`);
    failed++;
  }

  return { passed, failed };
}

// Test that different key materials produce different keys
function testDifferentKeyMaterials() {
  console.log('\nTesting different key materials produce different keys:');
  let passed = 0;
  let failed = 0;

  const context = "test context";

  const key1 = toHex(blake3.deriveKey(context, new Uint8Array(32).fill(0)));
  const key2 = toHex(blake3.deriveKey(context, new Uint8Array(32).fill(1)));
  const key3 = toHex(blake3.deriveKey(context, generateTestInput(32)));

  if (key1 !== key2 && key2 !== key3 && key1 !== key3) {
    console.log('  PASS: All three key materials produce different keys');
    passed++;
  } else {
    console.log('  FAIL: Some key materials produced same key');
    console.log(`    Material 1: ${key1}`);
    console.log(`    Material 2: ${key2}`);
    console.log(`    Material 3: ${key3}`);
    failed++;
  }

  return { passed, failed };
}

// Test custom output lengths (up to 32 bytes, which is the default max)
function testOutputLengths() {
  console.log('\nTesting custom output lengths:');
  let passed = 0;
  let failed = 0;

  const context = "test context";
  const keyMaterial = generateTestInput(32);

  // Test lengths up to 32 bytes (default max for finalize)
  const outputLengths = [8, 16, 24, 32];
  for (const len of outputLengths) {
    const key = blake3.deriveKey(context, keyMaterial, len);
    if (key.length === len) {
      console.log(`  PASS: Output length ${len} bytes`);
      passed++;
    } else {
      console.log(`  FAIL: Expected ${len} bytes, got ${key.length}`);
      failed++;
    }
  }

  // Verify that shorter outputs are prefixes of longer outputs
  const key32 = blake3.deriveKey(context, keyMaterial, 32);
  const key16 = blake3.deriveKey(context, keyMaterial, 16);
  const key8 = blake3.deriveKey(context, keyMaterial, 8);

  if (toHex(key32).startsWith(toHex(key16)) && toHex(key16).startsWith(toHex(key8))) {
    console.log('  PASS: Shorter outputs are prefixes of longer outputs');
    passed++;
  } else {
    console.log('  FAIL: Shorter outputs should be prefixes of longer outputs');
    failed++;
  }

  return { passed, failed };
}

// Test that KDF differs from regular hash
function testKdfDiffersFromHash() {
  console.log('\nTesting KDF differs from regular hash:');
  let passed = 0;
  let failed = 0;

  const data = generateTestInput(64);
  const context = "test context";

  const regularHash = toHex(blake3.hash(data));
  const derivedKey = toHex(blake3.deriveKey(context, data));

  if (regularHash !== derivedKey) {
    console.log('  PASS: KDF output differs from regular hash');
    passed++;
  } else {
    console.log('  FAIL: KDF output should differ from regular hash');
    failed++;
  }

  return { passed, failed };
}

// Test that KDF differs from keyed hash
function testKdfDiffersFromKeyedHash() {
  console.log('\nTesting KDF differs from keyed hash:');
  let passed = 0;
  let failed = 0;

  const data = generateTestInput(64);
  const key = new Uint8Array(32);
  for (let i = 0; i < 32; i++) key[i] = i;

  const keyedHash = toHex(blake3.hashKeyed(key, data));
  const derivedKey = toHex(blake3.deriveKey("test context", data));

  if (keyedHash !== derivedKey) {
    console.log('  PASS: KDF output differs from keyed hash');
    passed++;
  } else {
    console.log('  FAIL: KDF output should differ from keyed hash');
    failed++;
  }

  return { passed, failed };
}

// Run all tests
console.log('BLAKE3 KDF Tests');
console.log('================\n');

let totalPassed = 0;
let totalFailed = 0;

let result = testOfficialVectors();
totalPassed += result.passed;
totalFailed += result.failed;

result = testDifferentContexts();
totalPassed += result.passed;
totalFailed += result.failed;

result = testDifferentKeyMaterials();
totalPassed += result.passed;
totalFailed += result.failed;

result = testOutputLengths();
totalPassed += result.passed;
totalFailed += result.failed;

result = testKdfDiffersFromHash();
totalPassed += result.passed;
totalFailed += result.failed;

result = testKdfDiffersFromKeyedHash();
totalPassed += result.passed;
totalFailed += result.failed;

console.log('\n================');
console.log(`Results: ${totalPassed} passed, ${totalFailed} failed`);

if (totalFailed === 0) {
  console.log('\nAll KDF tests passed!');
} else {
  console.log('\nSome tests failed.');
  process.exit(1);
}

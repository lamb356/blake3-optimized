/**
 * BLAKE3 Test Suite
 * Using official test vectors from the BLAKE3 repository
 */

const blake3 = require('./blake3.js');

// Official BLAKE3 test vectors
// Input: incrementing bytes 0, 1, 2, ... 250 repeated
function generateTestInput(length) {
  const input = new Uint8Array(length);
  for (let i = 0; i < length; i++) {
    input[i] = i % 251;
  }
  return input;
}

// Test vectors from official BLAKE3 repo (hash mode, 32-byte output)
const TEST_VECTORS = [
  { inputLen: 0, hash: 'af1349b9f5f9a1a6a0404dea36dcc9499bcb25c9adc112b7cc9a93cae41f3262' },
  { inputLen: 1, hash: '2d3adedff11b61f14c886e35afa036736dcd87a74d27b5c1510225d0f592e213' },
  { inputLen: 2, hash: '7b7015bb92cf0b318037702a6cdd81dee41224f734684c2c122cd6359cb1ee63' },
  { inputLen: 3, hash: 'e1be4d7a8ab5560aa4199eea339849ba8e293d55ca0a81006726d184519e647f' },
  { inputLen: 4, hash: 'f30f5ab28fe047904037f77b6da4fea1e27241c5d132638d8bedce9d40494f32' },
  { inputLen: 5, hash: 'b40b44dfd97e7a84a996a91af8b85188c66c126940ba7aad2e7ae6b385402aa2' },
  { inputLen: 6, hash: '06c4e8ffb6872fad96f9aaca5eee1553eb62aed0ad7198cef42e87f6a616c844' },
  { inputLen: 7, hash: '3f8770f387faad08faa9d8414e9f449ac68e6ff0417f673f602a646a891419fe' },
  { inputLen: 8, hash: '2351207d04fc16ade43ccab08600939c7c1fa70a5c0aaca76063d04c3228eaeb' },
  { inputLen: 63, hash: 'e9bc37a594daad83be9470df7f7b3798297c3d834ce80ba85d6e207627b7db7b' },
  { inputLen: 64, hash: '4eed7141ea4a5cd4b788606bd23f46e212af9cacebacdc7d1f4c6dc7f2511b98' },
  { inputLen: 65, hash: 'de1e5fa0be70df6d2be8fffd0e99ceaa8eb6e8c93a63f2d8d1c30ecb6b263dee' },
  { inputLen: 127, hash: 'd81293fda863f008c09e92fc382a81f5a0b4a1251cba1634016a0f86a6bd640d' },
  { inputLen: 128, hash: 'f17e570564b26578c33bb7f44643f539624b05df1a76c81f30acd548c44b45ef' },
  { inputLen: 129, hash: '683aaae9f3c5ba37eaaf072aed0f9e30bac0865137bae68b1fde4ca2aebdcb12' },
  { inputLen: 1023, hash: '10108970eeda3eb932baac1428c7a2163b0e924c9a9e25b35bba72b28f70bd11' },
  { inputLen: 1024, hash: '42214739f095a406f3fc83deb889744ac00df831c10daa55189b5d121c855af7' },
  { inputLen: 1025, hash: 'd00278ae47eb27b34faecf67b4fe263f82d5412916c1ffd97c8cb7fb814b8444' },
  { inputLen: 2048, hash: 'e776b6028c7cd22a4d0ba182a8bf62205d2ef576467e838ed6f2529b85fba24a' },
  { inputLen: 2049, hash: '5f4d72f40d7a5f82b15ca2b2e44b1de3c2ef86c426c95c1af0b6879522563030' },
  { inputLen: 3072, hash: 'b98cb0ff3623be03326b373de6b9095218513e64f1ee2edd2525c7ad1e5cffd2' },
  { inputLen: 3073, hash: '7124b49501012f81cc7f11ca069ec9226cecb8a2c850cfe644e327d22d3e1cd3' },
  { inputLen: 4096, hash: '015094013f57a5277b59d8475c0501042c0b642e531b0a1c8f58d2163229e969' },
  { inputLen: 4097, hash: '9b4052b38f1c5fc8b1f9ff7ac7b27cd242487b3d890d15c96a1c25b8aa0fb995' },
  { inputLen: 5120, hash: '9cadc15fed8b5d854562b26a9536d9707cadeda9b143978f319ab34230535833' },
  { inputLen: 5121, hash: '628bd2cb2004694adaab7bbd778a25df25c47b9d4155a55f8fbd79f2fe154cff' },
  { inputLen: 6144, hash: '3e2e5b74e048f3add6d21faab3f83aa44d3b2278afb83b80b3c35164ebeca205' },
  { inputLen: 6145, hash: 'f1323a8631446cc50536a9f705ee5cb619424d46887f3c376c695b70e0f0507f' },
  { inputLen: 7168, hash: '61da957ec2499a95d6b8023e2b0e604ec7f6b50e80a9678b89d2628e99ada77a' },
  { inputLen: 7169, hash: 'a003fc7a51754a9b3c7fae0367ab3d782dccf28855a03d435f8cfe74605e7817' },
  { inputLen: 8192, hash: 'aae792484c8efe4f19e2ca7d371d8c467ffb10748d8a5a1ae579948f718a2a63' },
  { inputLen: 8193, hash: 'bab6c09cb8ce8cf459261398d2e7aef35700bf488116ceb94a36d0f5f1b7bc3b' },
  { inputLen: 16384, hash: 'f875d6646de28985646f34ee13be9a576fd515f76b5b0a26bb324735041ddde4' },
  { inputLen: 31744, hash: '62b6960e1a44bcc1eb1a611a8d6235b6b4b78f32e7abc4fb4c6cdcce94895c47' },
  { inputLen: 102400, hash: 'bc3e3d41a1146b069abffad3c0d44860cf664390afce4d9661f7902e7943e085' },
];

let passed = 0;
let failed = 0;

console.log('BLAKE3 Test Suite');
console.log('=================\n');

for (const vec of TEST_VECTORS) {
  const input = generateTestInput(vec.inputLen);
  const result = blake3.hashHex(input);
  
  if (result === vec.hash) {
    passed++;
    console.log(`✓ PASS: ${vec.inputLen} bytes`);
  } else {
    failed++;
    console.log(`✗ FAIL: ${vec.inputLen} bytes`);
    console.log(`  Expected: ${vec.hash}`);
    console.log(`  Got:      ${result}`);
  }
}

console.log(`\n=================`);
console.log(`Results: ${passed} passed, ${failed} failed`);

if (failed === 0) {
  console.log('\n🎉 All tests passed! Implementation is correct.');
} else {
  console.log('\n❌ Some tests failed. Implementation needs debugging.');
  process.exit(1);
}

// Quick benchmark
console.log('\nQuick Benchmark:');
const sizes = [96, 1024, 32768, 1024*1024];
for (const size of sizes) {
  const data = new Uint8Array(size);
  for (let i = 0; i < size; i++) data[i] = i & 0xff;
  
  const iterations = size < 10000 ? 10000 : (size < 100000 ? 1000 : 100);
  const start = performance.now();
  for (let i = 0; i < iterations; i++) {
    blake3.hash(data);
  }
  const elapsed = performance.now() - start;
  const throughput = (size * iterations / 1024 / 1024) / (elapsed / 1000);
  console.log(`  ${size} bytes: ${throughput.toFixed(2)} MB/s`);
}

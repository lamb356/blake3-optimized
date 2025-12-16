/**
 * BLAKE3 XOF (Extended Output Function) Test
 * Tests outputs longer than 32 bytes against official test vectors
 */

const blake3 = require('./blake3.js');

function toHex(bytes) {
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

// Generate test input pattern: incrementing bytes mod 251
function generateTestInput(length) {
  const input = new Uint8Array(length);
  for (let i = 0; i < length; i++) {
    input[i] = i % 251;
  }
  return input;
}

// Official test vectors with 131-byte (262 hex char) extended outputs
const XOF_VECTORS = [
  { inputLen: 0, hash: 'af1349b9f5f9a1a6a0404dea36dcc9499bcb25c9adc112b7cc9a93cae41f3262e00f03e7b69af26b7faaf09fcd333050338ddfe085b8cc869ca98b206c08243a26f5487789e8f660afe6c99ef9e0c52b92e7393024a80459cf91f476f9ffdbda7001c22e159b402631f277ca96f2defdf1078282314e763699a31c5363165421cce14d' },
  { inputLen: 1, hash: '2d3adedff11b61f14c886e35afa036736dcd87a74d27b5c1510225d0f592e213c3a6cb8bf623e20cdb535f8d1a5ffb86342d9c0b64aca3bce1d31f60adfa137b358ad4d79f97b47c3d5e79f179df87a3b9776ef8325f8329886ba42f07fb138bb502f4081cbcec3195c5871e6c23e2cc97d3c69a613eba131e5f1351f3f1da786545e5' },
  { inputLen: 2, hash: '7b7015bb92cf0b318037702a6cdd81dee41224f734684c2c122cd6359cb1ee63d8386b22e2ddc05836b7c1bb693d92af006deb5ffbc4c70fb44d0195d0c6f252faac61659ef86523aa16517f87cb5f1340e723756ab65efb2f91964e14391de2a432263a6faf1d146937b35a33621c12d00be8223a7f1919cec0acd12097ff3ab00ab1' },
  { inputLen: 3, hash: 'e1be4d7a8ab5560aa4199eea339849ba8e293d55ca0a81006726d184519e647f5b49b82f805a538c68915c1ae8035c900fd1d4b13902920fd05e1450822f36de9454b7e9996de4900c8e723512883f93f4345f8a58bfe64ee38d3ad71ab027765d25cdd0e448328a8e7a683b9a6af8b0af94fa09010d9186890b096a08471e4230a134' },
  { inputLen: 4, hash: 'f30f5ab28fe047904037f77b6da4fea1e27241c5d132638d8bedce9d40494f328f603ba4564453e06cdcee6cbe728a4519bbe6f0d41e8a14b5b225174a566dbfa61b56afb1e452dc08c804f8c3143c9e2cc4a31bb738bf8c1917b55830c6e65797211701dc0b98daa1faeaa6ee9e56ab606ce03a1a881e8f14e87a4acf4646272cfd12' },
  { inputLen: 5, hash: 'b40b44dfd97e7a84a996a91af8b85188c66c126940ba7aad2e7ae6b385402aa2ebcfdac6c5d32c31209e1f81a454751280db64942ce395104e1e4eaca62607de1c2ca748251754ea5bbe8c20150e7f47efd57012c63b3c6a6632dc1c7cd15f3e1c999904037d60fac2eb9397f2adbe458d7f264e64f1e73aa927b30988e2aed2f03620' },
  { inputLen: 6, hash: '06c4e8ffb6872fad96f9aaca5eee1553eb62aed0ad7198cef42e87f6a616c844611a30c4e4f37fe2fe23c0883cde5cf7059d88b657c7ed2087e3d210925ede716435d6d5d82597a1e52b9553919e804f5656278bd739880692c94bff2824d8e0b48cac1d24682699e4883389dc4f2faa2eb3b4db6e39debd5061ff3609916f3e07529a' },
  { inputLen: 7, hash: '3f8770f387faad08faa9d8414e9f449ac68e6ff0417f673f602a646a891419fe66036ef6e6d1a8f54baa9fed1fc11c77cfb9cff65bae915045027046ebe0c01bf5a941f3bb0f73791d3fc0b84370f9f30af0cd5b0fc334dd61f70feb60dad785f070fef1f343ed933b49a5ca0d16a503f599a365a4296739248b28d1a20b0e2cc8975c' },
  { inputLen: 8, hash: '2351207d04fc16ade43ccab08600939c7c1fa70a5c0aaca76063d04c3228eaeb725d6d46ceed8f785ab9f2f9b06acfe398c6699c6129da084cb531177445a682894f9685eaf836999221d17c9a64a3a057000524cd2823986db378b074290a1a9b93a22e135ed2c14c7e20c6d045cd00b903400374126676ea78874d79f2dd7883cf5c' },
  { inputLen: 63, hash: 'e9bc37a594daad83be9470df7f7b3798297c3d834ce80ba85d6e207627b7db7b1197012b1e7d9af4d7cb7bdd1f3bb49a90a9b5dec3ea2bbc6eaebce77f4e470cbf4687093b5352f04e4a4570fba233164e6acc36900e35d185886a827f7ea9bdc1e5c3ce88b095a200e62c10c043b3e9bc6cb9b6ac4dfa51794b02ace9f98779040755' },
  { inputLen: 64, hash: '4eed7141ea4a5cd4b788606bd23f46e212af9cacebacdc7d1f4c6dc7f2511b98fc9cc56cb831ffe33ea8e7e1d1df09b26efd2767670066aa82d023b1dfe8ab1b2b7fbb5b97592d46ffe3e05a6a9b592e2949c74160e4674301bc3f97e04903f8c6cf95b863174c33228924cdef7ae47559b10b294acd660666c4538833582b43f82d74' },
  { inputLen: 65, hash: 'de1e5fa0be70df6d2be8fffd0e99ceaa8eb6e8c93a63f2d8d1c30ecb6b263dee0e16e0a4749d6811dd1d6d1265c29729b1b75a9ac346cf93f0e1d7296dfcfd4313b3a227faaaaf7757cc95b4e87a49be3b8a270a12020233509b1c3632b3485eef309d0abc4a4a696c9decc6e90454b53b000f456a3f10079072baaf7a981653221f2c' },
  { inputLen: 127, hash: 'd81293fda863f008c09e92fc382a81f5a0b4a1251cba1634016a0f86a6bd640de3137d477156d1fde56b0cf36f8ef18b44b2d79897bece12227539ac9ae0a5119da47644d934d26e74dc316145dcb8bb69ac3f2e05c242dd6ee06484fcb0e956dc44355b452c5e2bbb5e2b66e99f5dd443d0cbcaaafd4beebaed24ae2f8bb672bcef78' },
  { inputLen: 128, hash: 'f17e570564b26578c33bb7f44643f539624b05df1a76c81f30acd548c44b45efa69faba091427f9c5c4caa873aa07828651f19c55bad85c47d1368b11c6fd99e47ecba5820a0325984d74fe3e4058494ca12e3f1d3293d0010a9722f7dee64f71246f75e9361f44cc8e214a100650db1313ff76a9f93ec6e84edb7add1cb4a95019b0c' },
  { inputLen: 129, hash: '683aaae9f3c5ba37eaaf072aed0f9e30bac0865137bae68b1fde4ca2aebdcb12f96ffa7b36dd78ba321be7e842d364a62a42e3746681c8bace18a4a8a79649285c7127bf8febf125be9de39586d251f0d41da20980b70d35e3dac0eee59e468a894fa7e6a07129aaad09855f6ad4801512a116ba2b7841e6cfc99ad77594a8f2d181a7' },
  { inputLen: 1023, hash: '10108970eeda3eb932baac1428c7a2163b0e924c9a9e25b35bba72b28f70bd11a182d27a591b05592b15607500e1e8dd56bc6c7fc063715b7a1d737df5bad3339c56778957d870eb9717b57ea3d9fb68d1b55127bba6a906a4a24bbd5acb2d123a37b28f9e9a81bbaae360d58f85e5fc9d75f7c370a0cc09b6522d9c8d822f2f28f485' },
  { inputLen: 1024, hash: '42214739f095a406f3fc83deb889744ac00df831c10daa55189b5d121c855af71cf8107265ecdaf8505b95d8fcec83a98a6a96ea5109d2c179c47a387ffbb404756f6eeae7883b446b70ebb144527c2075ab8ab204c0086bb22b7c93d465efc57f8d917f0b385c6df265e77003b85102967486ed57db5c5ca170ba441427ed9afa684e' },
  { inputLen: 1025, hash: 'd00278ae47eb27b34faecf67b4fe263f82d5412916c1ffd97c8cb7fb814b8444f4c4a22b4b399155358a994e52bf255de60035742ec71bd08ac275a1b51cc6bfe332b0ef84b409108cda080e6269ed4b3e2c3f7d722aa4cdc98d16deb554e5627be8f955c98e1d5f9565a9194cad0c4285f93700062d9595adb992ae68ff12800ab67a' },
  { inputLen: 2048, hash: 'e776b6028c7cd22a4d0ba182a8bf62205d2ef576467e838ed6f2529b85fba24a9a60bf80001410ec9eea6698cd537939fad4749edd484cb541aced55cd9bf54764d063f23f6f1e32e12958ba5cfeb1bf618ad094266d4fc3c968c2088f677454c288c67ba0dba337b9d91c7e1ba586dc9a5bc2d5e90c14f53a8863ac75655461cea8f9' },
  { inputLen: 2049, hash: '5f4d72f40d7a5f82b15ca2b2e44b1de3c2ef86c426c95c1af0b687952256303096de31d71d74103403822a2e0bc1eb193e7aecc9643a76b7bbc0c9f9c52e8783aae98764ca468962b5c2ec92f0c74eb5448d519713e09413719431c802f948dd5d90425a4ecdadece9eb178d80f26efccae630734dff63340285adec2aed3b51073ad3' },
  { inputLen: 3072, hash: 'b98cb0ff3623be03326b373de6b9095218513e64f1ee2edd2525c7ad1e5cffd29a3f6b0b978d6608335c09dc94ccf682f9951cdfc501bfe47b9c9189a6fc7b404d120258506341a6d802857322fbd20d3e5dae05b95c88793fa83db1cb08e7d8008d1599b6209d78336e24839724c191b2a52a80448306e0daa84a3fdb566661a37e11' },
  { inputLen: 3073, hash: '7124b49501012f81cc7f11ca069ec9226cecb8a2c850cfe644e327d22d3e1cd39a27ae3b79d68d89da9bf25bc27139ae65a324918a5f9b7828181e52cf373c84f35b639b7fccbb985b6f2fa56aea0c18f531203497b8bbd3a07ceb5926f1cab74d14bd66486d9a91eba99059a98bd1cd25876b2af5a76c3e9eed554ed72ea952b603bf' },
  { inputLen: 4096, hash: '015094013f57a5277b59d8475c0501042c0b642e531b0a1c8f58d2163229e9690289e9409ddb1b99768eafe1623da896faf7e1114bebeadc1be30829b6f8af707d85c298f4f0ff4d9438aef948335612ae921e76d411c3a9111df62d27eaf871959ae0062b5492a0feb98ef3ed4af277f5395172dbe5c311918ea0074ce0036454f620' },
  { inputLen: 4097, hash: '9b4052b38f1c5fc8b1f9ff7ac7b27cd242487b3d890d15c96a1c25b8aa0fb99505f91b0b5600a11251652eacfa9497b31cd3c409ce2e45cfe6c0a016967316c426bd26f619eab5d70af9a418b845c608840390f361630bd497b1ab44019316357c61dbe091ce72fc16dc340ac3d6e009e050b3adac4b5b2c92e722cffdc46501531956' },
  { inputLen: 5120, hash: '9cadc15fed8b5d854562b26a9536d9707cadeda9b143978f319ab34230535833acc61c8fdc114a2010ce8038c853e121e1544985133fccdd0a2d507e8e615e611e9a0ba4f47915f49e53d721816a9198e8b30f12d20ec3689989175f1bf7a300eee0d9321fad8da232ece6efb8e9fd81b42ad161f6b9550a069e66b11b40487a5f5059' },
  { inputLen: 5121, hash: '628bd2cb2004694adaab7bbd778a25df25c47b9d4155a55f8fbd79f2fe154cff96adaab0613a6146cdaabe498c3a94e529d3fc1da2bd08edf54ed64d40dcd6777647eac51d8277d70219a9694334a68bc8f0f23e20b0ff70ada6f844542dfa32cd4204ca1846ef76d811cdb296f65e260227f477aa7aa008bac878f72257484f2b6c95' },
];

// Test 131-byte extended outputs against official vectors
function testOfficialVectors() {
  console.log('Testing 131-byte XOF outputs against official vectors:');
  let passed = 0;
  let failed = 0;

  for (const vec of XOF_VECTORS) {
    const input = generateTestInput(vec.inputLen);
    const result = toHex(blake3.hash(input, 131));

    if (result === vec.hash) {
      console.log(`  PASS: ${vec.inputLen} bytes input`);
      passed++;
    } else {
      console.log(`  FAIL: ${vec.inputLen} bytes input`);
      console.log(`    Expected: ${vec.hash}`);
      console.log(`    Got:      ${result}`);
      failed++;
    }
  }

  return { passed, failed };
}

// Test that first 32 bytes of extended output match regular hash
function testPrefixConsistency() {
  console.log('\nTesting XOF prefix matches regular 32-byte hash:');
  let passed = 0;
  let failed = 0;

  const testSizes = [0, 1, 5, 63, 64, 65, 100, 1000, 1024, 1025, 5000];

  for (const size of testSizes) {
    const data = generateTestInput(size);

    const regular32 = toHex(blake3.hash(data, 32));
    const extended64 = toHex(blake3.hash(data, 64));
    const extended131 = toHex(blake3.hash(data, 131));

    const prefix64 = extended64.substring(0, 64);
    const prefix131 = extended131.substring(0, 64);

    if (regular32 === prefix64 && regular32 === prefix131) {
      console.log(`  PASS: ${size} bytes - prefixes match`);
      passed++;
    } else {
      console.log(`  FAIL: ${size} bytes - prefix mismatch`);
      console.log(`    32-byte:  ${regular32}`);
      console.log(`    64-byte prefix: ${prefix64}`);
      console.log(`    131-byte prefix: ${prefix131}`);
      failed++;
    }
  }

  return { passed, failed };
}

// Test various output lengths
function testOutputLengths() {
  console.log('\nTesting various output lengths:');
  let passed = 0;
  let failed = 0;

  const data = generateTestInput(100);
  const outputLengths = [1, 8, 16, 31, 32, 33, 48, 63, 64, 65, 96, 128, 131, 200, 256, 500, 1000];

  for (const len of outputLengths) {
    const result = blake3.hash(data, len);
    if (result.length === len) {
      console.log(`  PASS: Output length ${len} bytes`);
      passed++;
    } else {
      console.log(`  FAIL: Expected ${len} bytes, got ${result.length}`);
      failed++;
    }
  }

  return { passed, failed };
}

// Test streaming XOF
function testStreamingXof() {
  console.log('\nTesting streaming API with extended output:');
  let passed = 0;
  let failed = 0;

  const testCases = [
    { size: 100, outputLen: 64 },
    { size: 100, outputLen: 131 },
    { size: 1000, outputLen: 200 },
    { size: 5000, outputLen: 500 },
  ];

  for (const { size, outputLen } of testCases) {
    const data = generateTestInput(size);

    // One-shot
    const oneShot = toHex(blake3.hash(data, outputLen));

    // Streaming
    const hasher = blake3.createHasher();
    hasher.update(data);
    const streaming = toHex(hasher.finalize(outputLen));

    if (oneShot === streaming) {
      console.log(`  PASS: ${size} bytes input, ${outputLen} bytes output`);
      passed++;
    } else {
      console.log(`  FAIL: ${size} bytes input, ${outputLen} bytes output`);
      console.log(`    One-shot:  ${oneShot.substring(0, 64)}...`);
      console.log(`    Streaming: ${streaming.substring(0, 64)}...`);
      failed++;
    }
  }

  return { passed, failed };
}

// Test keyed XOF
function testKeyedXof() {
  console.log('\nTesting keyed hash with extended output:');
  let passed = 0;
  let failed = 0;

  const key = new TextEncoder().encode("whats the Elvish word for friend");

  // Official keyed_hash extended output for input_len=0
  const expectedKeyedXof = '92b2b75604ed3c761f9d6f62392c8a9227ad0ea3f09573e783f1498a4ed60d26b18171a2f22a4b94822c701f107153dba24918c4bae4d2945c20ece13387627d3b73cbf97b797d5e59948c7ef788f54372df45e45e4293c7dc18c1d41144a9758be58960856be1eabbe22c2653190de560ca3b2ac4aa692a9210694254c371e851bc8f';

  const result = toHex(blake3.hashKeyed(key, new Uint8Array(0), 131));

  if (result === expectedKeyedXof) {
    console.log('  PASS: Keyed XOF for empty input');
    passed++;
  } else {
    console.log('  FAIL: Keyed XOF for empty input');
    console.log(`    Expected: ${expectedKeyedXof}`);
    console.log(`    Got:      ${result}`);
    failed++;
  }

  // Test with non-empty input
  const input = generateTestInput(64);
  const result64 = blake3.hashKeyed(key, input, 64);
  const result32 = blake3.hashKeyed(key, input, 32);

  if (toHex(result64).startsWith(toHex(result32))) {
    console.log('  PASS: Keyed XOF prefix consistency');
    passed++;
  } else {
    console.log('  FAIL: Keyed XOF prefix consistency');
    failed++;
  }

  return { passed, failed };
}

// Test derive_key XOF
function testDeriveKeyXof() {
  console.log('\nTesting derive_key with extended output:');
  let passed = 0;
  let failed = 0;

  const context = "BLAKE3 2019-12-27 16:29:52 test vectors context";

  // Official derive_key extended output for input_len=0
  const expectedDeriveXof = '2cc39783c223154fea8dfb7c1b1660f2ac2dcbd1c1de8277b0b0dd39b7e50d7d905630c8be290dfcf3e6842f13bddd573c098c3f17361f1f206b8cad9d088aa4a3f746752c6b0ce6a83b0da81d59649257cdf8eb3e9f7d4998e41021fac119deefb896224ac99f860011f73609e6e0e4540f93b273e56547dfd3aa1a035ba6689d89a0';

  const result = toHex(blake3.deriveKey(context, new Uint8Array(0), 131));

  if (result === expectedDeriveXof) {
    console.log('  PASS: derive_key XOF for empty input');
    passed++;
  } else {
    console.log('  FAIL: derive_key XOF for empty input');
    console.log(`    Expected: ${expectedDeriveXof}`);
    console.log(`    Got:      ${result}`);
    failed++;
  }

  // Test prefix consistency
  const keyMaterial = generateTestInput(32);
  const result64 = blake3.deriveKey(context, keyMaterial, 64);
  const result32 = blake3.deriveKey(context, keyMaterial, 32);

  if (toHex(result64).startsWith(toHex(result32))) {
    console.log('  PASS: derive_key XOF prefix consistency');
    passed++;
  } else {
    console.log('  FAIL: derive_key XOF prefix consistency');
    failed++;
  }

  return { passed, failed };
}

// Run all tests
console.log('BLAKE3 XOF (Extended Output) Tests');
console.log('===================================\n');

let totalPassed = 0;
let totalFailed = 0;

let result = testOfficialVectors();
totalPassed += result.passed;
totalFailed += result.failed;

result = testPrefixConsistency();
totalPassed += result.passed;
totalFailed += result.failed;

result = testOutputLengths();
totalPassed += result.passed;
totalFailed += result.failed;

result = testStreamingXof();
totalPassed += result.passed;
totalFailed += result.failed;

result = testKeyedXof();
totalPassed += result.passed;
totalFailed += result.failed;

result = testDeriveKeyXof();
totalPassed += result.passed;
totalFailed += result.failed;

console.log('\n===================================');
console.log(`Results: ${totalPassed} passed, ${totalFailed} failed`);

if (totalFailed === 0) {
  console.log('\nAll XOF tests passed!');
} else {
  console.log('\nSome tests failed.');
  process.exit(1);
}

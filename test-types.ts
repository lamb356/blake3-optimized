/**
 * TypeScript type verification test
 * This file verifies that the type definitions compile correctly.
 * Run: npx tsc --noEmit test-types.ts
 */

// Test main module imports
import {
  // BLAKE3
  hash,
  hashHex,
  toHex,
  initSimd,
  isSimdEnabled,
  createHasher,
  createKeyedHasher,
  hashKeyed,
  deriveKey,
  Hasher,
  // Bao
  baoEncode,
  baoDecode,
  baoSlice,
  baoDecodeSlice,
  baoEncodeIroh,
  baoDecodeIroh,
  baoVerifyIroh,
  BaoEncoder,
  BaoDecoder,
  PartialBao,
  HashSequence,
  createBitfield,
  setBit,
  clearBit,
  getBit,
  countSetBits,
  chunkGroupCV,
  countChunkGroups,
  irohOutboardSize,
  // Sub-modules
  blake3,
  bao
} from 'blake3-bao';

// Test type imports
import type { BaoEncodeResult, PartialBaoState, HashSequenceJSON, GroupRange } from 'blake3-bao/bao';

// ============================================
// BLAKE3 Tests
// ============================================

// Basic hashing
const digest: Uint8Array = hash('hello world');
const digestFromBytes: Uint8Array = hash(new Uint8Array([1, 2, 3]));
const digestLong: Uint8Array = hash('hello', 64);

// Hex output
const hexDigest: string = hashHex('hello world');
const hexString: string = toHex(digest);

// SIMD
async function testSimd(): Promise<void> {
  const enabled: boolean = await initSimd();
  const isEnabled: boolean = isSimdEnabled();
}

// Streaming hasher
const hasher: Hasher = createHasher();
hasher.update('hello ');
hasher.update(new Uint8Array([119, 111, 114, 108, 100]));
const streamDigest: Uint8Array = hasher.finalize();
const streamHex: string = hasher.finalizeHex();
hasher.reset();

// Keyed hashing
const key = new Uint8Array(32);
const keyedHasher: Hasher = createKeyedHasher(key);
const mac: Uint8Array = hashKeyed(key, 'message');

// Key derivation
const derivedKey: Uint8Array = deriveKey('my-app v1', 'secret');

// Sub-module access
const blake3Digest: Uint8Array = blake3.hash('test');

// ============================================
// Bao Tests
// ============================================

// Basic encoding
const data = new Uint8Array(2048);
const encodeResult: BaoEncodeResult = baoEncode(data);
const encoded: Uint8Array = encodeResult.encoded;
const baoHash: Uint8Array = encodeResult.hash;

// Outboard encoding
const outboardResult: BaoEncodeResult = baoEncode(data, true);

// Decoding
const decoded: Uint8Array = baoDecode(encoded, baoHash);
const decodedOutboard: Uint8Array = baoDecode(outboardResult.encoded, outboardResult.hash, data);

// Slicing
const slice: Uint8Array = baoSlice(encoded, 1024, 512);
const sliceData: Uint8Array = baoDecodeSlice(slice, baoHash, 1024, 512);

// Iroh encoding
const irohResult: BaoEncodeResult = baoEncodeIroh(data, true);
const irohDecoded: Uint8Array = baoDecodeIroh(irohResult.encoded, irohResult.hash, data);
const isValid: boolean = baoVerifyIroh(irohResult.encoded, irohResult.hash, data);

// Iroh helpers
const groupCV: Uint8Array = chunkGroupCV(data.slice(0, 16384), 0, true);
const numGroups: number = countChunkGroups(data.length);
const outboardSize: number = irohOutboardSize(data.length);

// Streaming encoder
const encoder = new BaoEncoder(false);
encoder.write(data.slice(0, 1024));
encoder.update(data.slice(1024));
const encoderResult: BaoEncodeResult = encoder.finalize();

// Streaming decoder
const decoder = new BaoDecoder(baoHash, data.length, false);
const partial: Uint8Array | null = decoder.write(encoded.slice(0, 100));
const available: Uint8Array = decoder.read();
const complete: boolean = decoder.isComplete();
const final: Uint8Array = decoder.finalize();

// ============================================
// PartialBao Tests
// ============================================

const partialBao = new PartialBao(irohResult.hash, data.length);
const totalGroups: number = partialBao.numGroups;
const received: number = partialBao.receivedGroups;
const isComplete: boolean = partialBao.isComplete();
const progress: number = partialBao.getProgress();
const hasGroup: boolean = partialBao.hasGroup(0);
const groupSize: number = partialBao.getGroupSize(0);
const groupData: Uint8Array | null = partialBao.getGroupData(0);

// Add groups
const addedTrusted: boolean = partialBao.addChunkGroupTrusted(0, data.slice(0, 16384));
const proof: Uint8Array[] = [new Uint8Array(32)];
// const addedWithProof: boolean = partialBao.addChunkGroup(1, data.slice(16384), proof);

// Bitfield operations
const bitfield: Uint8Array = partialBao.getBitfield();
partialBao.setBitfield(bitfield);

// Range queries
const missingRanges: GroupRange[] = partialBao.getMissingRanges();
const presentRanges: GroupRange[] = partialBao.getPresentRanges();
const missingGroups: number[] = partialBao.getMissingGroups();
const presentGroups: number[] = partialBao.getPresentGroups();

// State persistence
const state: PartialBaoState = partialBao.exportState();
const restored: PartialBao = PartialBao.importState(state);

// Finalization
// const finalData: Uint8Array = partialBao.finalize(true);
const createdProof: Uint8Array[] = partialBao.createProof(0);

// ============================================
// Bitfield Helpers Tests
// ============================================

const bf: Uint8Array = createBitfield(100);
setBit(bf, 5);
clearBit(bf, 5);
const bitValue: boolean = getBit(bf, 5);
const setBitCount: number = countSetBits(bf, 100);

// ============================================
// HashSequence Tests
// ============================================

const seq = new HashSequence();
const seqWithInit = new HashSequence([digest, baoHash]);

// Chaining
seq.addHash(digest).addHash(baoHash);

// Properties
const seqLength: number = seq.length;

// Access
const seqHash: Uint8Array = seq.getHash(0);
const seqHashHex: string = seq.getHashHex(0);
const seqHasHash: boolean = seq.hasHash(digest);
const seqIndex: number = seq.indexOf(digest);

// Iteration
const seqArray: Uint8Array[] = seq.toArray();
for (const h of seq) {
  const _: Uint8Array = h;
}

// Finalization
const seqDigest: Uint8Array = seq.finalize();
const seqDigestHex: string = seq.finalizeHex();

// Serialization
const seqBytes: Uint8Array = seq.toBytes();
const fromBytes: HashSequence = HashSequence.fromBytes(seqBytes);
const fromArray: HashSequence = HashSequence.from([digest, baoHash]);
const fromHex: HashSequence = HashSequence.fromHex([hexDigest, hexDigest]);

// JSON
const seqJson: HashSequenceJSON = seq.toJSON();
const fromJson: HashSequence = HashSequence.fromJSON(seqJson);

// Mutation
seq.clear();
seq.addHash(digest);
const removed: Uint8Array = seq.removeAt(0);
seq.insertAt(0, digest);

// Operations
const sliced: HashSequence = seq.slice(0, 1);
const concatenated: HashSequence = seq.concat(seqWithInit);
const areEqual: boolean = seq.equals(seqWithInit);

// Sub-module access
const baoResult: BaoEncodeResult = bao.baoEncode(data);

// ============================================
// Type Inference Tests
// ============================================

// Verify return types are correctly inferred
function typeTests() {
  // These should all compile without explicit type annotations
  const h = hash('test');
  const e = baoEncode(new Uint8Array(100));
  const p = new PartialBao(e.hash, 100);
  const s = new HashSequence();

  // Verify method chaining types
  const chained = s.addHash(h).addHash(e.hash).clear().addHash(h);

  // Verify iterator type
  const iterator = s[Symbol.iterator]();
  const next = iterator.next();
}

console.log('TypeScript types verified successfully!');

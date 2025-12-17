/**
 * blake3-bao/blake3 - ESM wrapper for BLAKE3
 */
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const lib = require('./blake3.js');

export const hash = lib.hash;
export const hashHex = lib.hashHex;
export const toHex = lib.toHex;
export const initSimd = lib.initSimd;
export const isSimdEnabled = lib.isSimdEnabled;
export const createHasher = lib.createHasher;
export const createKeyedHasher = lib.createKeyedHasher;
export const hashKeyed = lib.hashKeyed;
export const deriveKey = lib.deriveKey;
export const Hasher = lib.Hasher;
export const IV = lib.IV;
export const BLOCK_LEN = lib.BLOCK_LEN;
export const CHUNK_LEN = lib.CHUNK_LEN;
export const KEYED_HASH = lib.KEYED_HASH;
export const DERIVE_KEY_CONTEXT = lib.DERIVE_KEY_CONTEXT;
export const DERIVE_KEY_MATERIAL = lib.DERIVE_KEY_MATERIAL;

export default lib;

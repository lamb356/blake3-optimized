/**
 * BLAKE3 TypeScript definitions
 * Pure JavaScript implementation with optional WASM SIMD acceleration
 */

declare module 'blake3-bao/blake3' {
  /**
   * Hash input and return 32-byte digest (or custom length for XOF)
   * @param input - String or binary data to hash
   * @param outputLen - Output length in bytes (default: 32)
   * @returns Hash digest as Uint8Array
   */
  export function hash(input: string | Uint8Array, outputLen?: number): Uint8Array;

  /**
   * Hash input and return hex string
   * @param input - String or binary data to hash
   * @param outputLen - Output length in bytes (default: 32)
   * @returns Hash digest as hex string
   */
  export function hashHex(input: string | Uint8Array, outputLen?: number): string;

  /**
   * Convert Uint8Array to hex string
   * @param bytes - Bytes to convert
   * @returns Hex string representation
   */
  export function toHex(bytes: Uint8Array): string;

  /**
   * Initialize WASM SIMD acceleration for improved performance
   * @returns Promise resolving to true if SIMD was enabled, false otherwise
   */
  export function initSimd(): Promise<boolean>;

  /**
   * Check if WASM SIMD acceleration is enabled
   * @returns true if SIMD is enabled
   */
  export function isSimdEnabled(): boolean;

  /**
   * Create a streaming hasher for incremental hashing
   * @returns New Hasher instance
   */
  export function createHasher(): Hasher;

  /**
   * Create a keyed hasher for MAC generation
   * @param key - 32-byte key
   * @returns New keyed Hasher instance
   */
  export function createKeyedHasher(key: Uint8Array): Hasher;

  /**
   * Compute keyed hash (MAC)
   * @param key - 32-byte key
   * @param input - String or binary data to hash
   * @param outputLen - Output length in bytes (default: 32)
   * @returns Keyed hash digest
   */
  export function hashKeyed(key: Uint8Array, input: string | Uint8Array, outputLen?: number): Uint8Array;

  /**
   * Derive a key from context string and key material
   * @param context - Context string for domain separation
   * @param keyMaterial - Key material to derive from
   * @param outputLen - Output length in bytes (default: 32)
   * @returns Derived key
   */
  export function deriveKey(context: string, keyMaterial: string | Uint8Array, outputLen?: number): Uint8Array;

  /**
   * Streaming hasher for incremental hashing
   */
  export class Hasher {
    constructor();

    /**
     * Update hasher with more data
     * @param input - String or binary data to add
     * @returns this (for chaining)
     */
    update(input: string | Uint8Array): this;

    /**
     * Finalize and return hash digest
     * @param outputLen - Output length in bytes (default: 32)
     * @returns Hash digest as Uint8Array
     */
    finalize(outputLen?: number): Uint8Array;

    /**
     * Finalize and return hash as hex string
     * @param outputLen - Output length in bytes (default: 32)
     * @returns Hash digest as hex string
     */
    finalizeHex(outputLen?: number): string;

    /**
     * Reset hasher to initial state
     */
    reset(): void;
  }

  // Constants
  export const IV: Uint32Array;
  export const BLOCK_LEN: number;
  export const CHUNK_LEN: number;
  export const KEYED_HASH: number;
  export const DERIVE_KEY_CONTEXT: number;
  export const DERIVE_KEY_MATERIAL: number;
}

export = blake3;
export as namespace blake3;

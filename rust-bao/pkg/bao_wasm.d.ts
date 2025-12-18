/* tslint:disable */
/* eslint-disable */

/**
 * Batch compute chunk CVs
 * Reads num_chunks * 1024 bytes from INPUT_BUFFER
 * Writes num_chunks * 32 bytes to OUTPUT_BUFFER
 */
export function batch_chunk_cvs(num_chunks: number, start_index: bigint): void;

/**
 * Batch compute parent CVs
 * Reads num_pairs * 64 bytes (CV pairs) from INPUT_BUFFER
 * Writes num_pairs * 32 bytes to OUTPUT_BUFFER
 * root_index: if >= 0, marks that pair as root
 */
export function batch_parent_cvs(num_pairs: number, root_index: number): void;

/**
 * Build entire Merkle tree in a single pass
 * Reads num_leaves * 32 bytes (leaf CVs) from INPUT_BUFFER
 * Writes 32-byte root CV to OUTPUT_BUFFER
 * Returns bytes written (32) or 0 on error
 */
export function build_tree_single_pass(num_leaves: number): number;

/**
 * Compute chunk CV - main export
 * Reads chunk data from INPUT_BUFFER, writes CV to OUTPUT_BUFFER
 */
export function chunk_cv(chunk_len: number, chunk_index: bigint, is_root: boolean): void;

/**
 * Get pointer to input buffer for direct memory access from JS
 */
export function get_input_ptr(): number;

/**
 * Get input buffer size
 */
export function get_input_size(): number;

/**
 * Get pointer to output buffer for direct memory access from JS
 */
export function get_output_ptr(): number;

/**
 * Get output buffer size
 */
export function get_output_size(): number;

/**
 * Get SIMD status info
 */
export function get_simd_info(): string;

/**
 * Compute parent CV from two child CVs
 * Reads left CV from INPUT_BUFFER[0..32], right from INPUT_BUFFER[32..64]
 * Writes result to OUTPUT_BUFFER[0..32]
 */
export function parent_cv(is_root: boolean): void;

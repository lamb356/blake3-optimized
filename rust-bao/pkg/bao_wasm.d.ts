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
 * Compute parent CV from two child CVs
 * Reads left CV from INPUT_BUFFER[0..32], right from INPUT_BUFFER[32..64]
 * Writes result to OUTPUT_BUFFER[0..32]
 */
export function parent_cv(is_root: boolean): void;

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
  readonly memory: WebAssembly.Memory;
  readonly chunk_cv: (a: number, b: bigint, c: number) => void;
  readonly get_input_ptr: () => number;
  readonly get_input_size: () => number;
  readonly get_output_ptr: () => number;
  readonly parent_cv: (a: number) => void;
  readonly batch_parent_cvs: (a: number, b: number) => void;
  readonly get_output_size: () => number;
  readonly batch_chunk_cvs: (a: number, b: bigint) => void;
  readonly __wbindgen_externrefs: WebAssembly.Table;
  readonly __wbindgen_start: () => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;

/**
* Instantiates the given `module`, which can either be bytes or
* a precompiled `WebAssembly.Module`.
*
* @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
*
* @returns {InitOutput}
*/
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
* If `module_or_path` is {RequestInfo} or {URL}, makes a request and
* for everything else, calls `WebAssembly.instantiate` directly.
*
* @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
*
* @returns {Promise<InitOutput>}
*/
export default function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;

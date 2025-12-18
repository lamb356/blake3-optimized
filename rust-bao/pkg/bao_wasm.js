
let imports = {};
imports['__wbindgen_placeholder__'] = module.exports;

function getStringFromWasm0(ptr, len) {
    ptr = ptr >>> 0;
    return decodeText(ptr, len);
}

let cachedUint8ArrayMemory0 = null;
function getUint8ArrayMemory0() {
    if (cachedUint8ArrayMemory0 === null || cachedUint8ArrayMemory0.byteLength === 0) {
        cachedUint8ArrayMemory0 = new Uint8Array(wasm.memory.buffer);
    }
    return cachedUint8ArrayMemory0;
}

let cachedTextDecoder = new TextDecoder('utf-8', { ignoreBOM: true, fatal: true });
cachedTextDecoder.decode();
function decodeText(ptr, len) {
    return cachedTextDecoder.decode(getUint8ArrayMemory0().subarray(ptr, ptr + len));
}

/**
 * Batch compute chunk CVs
 * Reads num_chunks * 1024 bytes from INPUT_BUFFER
 * Writes num_chunks * 32 bytes to OUTPUT_BUFFER
 * @param {number} num_chunks
 * @param {bigint} start_index
 */
function batch_chunk_cvs(num_chunks, start_index) {
    wasm.batch_chunk_cvs(num_chunks, start_index);
}
exports.batch_chunk_cvs = batch_chunk_cvs;

/**
 * Batch compute parent CVs
 * Reads num_pairs * 64 bytes (CV pairs) from INPUT_BUFFER
 * Writes num_pairs * 32 bytes to OUTPUT_BUFFER
 * root_index: if >= 0, marks that pair as root
 * @param {number} num_pairs
 * @param {number} root_index
 */
function batch_parent_cvs(num_pairs, root_index) {
    wasm.batch_parent_cvs(num_pairs, root_index);
}
exports.batch_parent_cvs = batch_parent_cvs;

/**
 * Build entire Merkle tree in a single pass
 * Reads num_leaves * 32 bytes (leaf CVs) from INPUT_BUFFER
 * Writes 32-byte root CV to OUTPUT_BUFFER
 * Returns bytes written (32) or 0 on error
 * @param {number} num_leaves
 * @returns {number}
 */
function build_tree_single_pass(num_leaves) {
    const ret = wasm.build_tree_single_pass(num_leaves);
    return ret >>> 0;
}
exports.build_tree_single_pass = build_tree_single_pass;

/**
 * Compute chunk CV - main export
 * Reads chunk data from INPUT_BUFFER, writes CV to OUTPUT_BUFFER
 * @param {number} chunk_len
 * @param {bigint} chunk_index
 * @param {boolean} is_root
 */
function chunk_cv(chunk_len, chunk_index, is_root) {
    wasm.chunk_cv(chunk_len, chunk_index, is_root);
}
exports.chunk_cv = chunk_cv;

/**
 * Get pointer to input buffer for direct memory access from JS
 * @returns {number}
 */
function get_input_ptr() {
    const ret = wasm.get_input_ptr();
    return ret >>> 0;
}
exports.get_input_ptr = get_input_ptr;

/**
 * Get input buffer size
 * @returns {number}
 */
function get_input_size() {
    const ret = wasm.get_input_size();
    return ret >>> 0;
}
exports.get_input_size = get_input_size;

/**
 * Get pointer to output buffer for direct memory access from JS
 * @returns {number}
 */
function get_output_ptr() {
    const ret = wasm.get_output_ptr();
    return ret >>> 0;
}
exports.get_output_ptr = get_output_ptr;

/**
 * Get output buffer size
 * @returns {number}
 */
function get_output_size() {
    const ret = wasm.get_input_size();
    return ret >>> 0;
}
exports.get_output_size = get_output_size;

/**
 * Get SIMD status info
 * @returns {string}
 */
function get_simd_info() {
    let deferred1_0;
    let deferred1_1;
    try {
        const ret = wasm.get_simd_info();
        deferred1_0 = ret[0];
        deferred1_1 = ret[1];
        return getStringFromWasm0(ret[0], ret[1]);
    } finally {
        wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
    }
}
exports.get_simd_info = get_simd_info;

/**
 * Compute parent CV from two child CVs
 * Reads left CV from INPUT_BUFFER[0..32], right from INPUT_BUFFER[32..64]
 * Writes result to OUTPUT_BUFFER[0..32]
 * @param {boolean} is_root
 */
function parent_cv(is_root) {
    wasm.parent_cv(is_root);
}
exports.parent_cv = parent_cv;

exports.__wbindgen_init_externref_table = function() {
    const table = wasm.__wbindgen_externrefs;
    const offset = table.grow(4);
    table.set(0, undefined);
    table.set(offset + 0, undefined);
    table.set(offset + 1, null);
    table.set(offset + 2, true);
    table.set(offset + 3, false);
};

const wasmPath = `${__dirname}/bao_wasm_bg.wasm`;
const wasmBytes = require('fs').readFileSync(wasmPath);
const wasmModule = new WebAssembly.Module(wasmBytes);
const wasm = exports.__wasm = new WebAssembly.Instance(wasmModule, imports).exports;

wasm.__wbindgen_start();

let wasm;

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
const MAX_SAFARI_DECODE_BYTES = 2146435072;
let numBytesDecoded = 0;
function decodeText(ptr, len) {
    numBytesDecoded += len;
    if (numBytesDecoded >= MAX_SAFARI_DECODE_BYTES) {
        cachedTextDecoder = new TextDecoder('utf-8', { ignoreBOM: true, fatal: true });
        cachedTextDecoder.decode();
        numBytesDecoded = len;
    }
    return cachedTextDecoder.decode(getUint8ArrayMemory0().subarray(ptr, ptr + len));
}

/**
 * Batch compute chunk CVs
 * Reads num_chunks * 1024 bytes from INPUT_BUFFER
 * Writes num_chunks * 32 bytes to OUTPUT_BUFFER
 * @param {number} num_chunks
 * @param {bigint} start_index
 */
export function batch_chunk_cvs(num_chunks, start_index) {
    wasm.batch_chunk_cvs(num_chunks, start_index);
}

/**
 * Batch compute parent CVs
 * Reads num_pairs * 64 bytes (CV pairs) from INPUT_BUFFER
 * Writes num_pairs * 32 bytes to OUTPUT_BUFFER
 * root_index: if >= 0, marks that pair as root
 * @param {number} num_pairs
 * @param {number} root_index
 */
export function batch_parent_cvs(num_pairs, root_index) {
    wasm.batch_parent_cvs(num_pairs, root_index);
}

/**
 * Compute chunk CV - main export
 * Reads chunk data from INPUT_BUFFER, writes CV to OUTPUT_BUFFER
 * @param {number} chunk_len
 * @param {bigint} chunk_index
 * @param {boolean} is_root
 */
export function chunk_cv(chunk_len, chunk_index, is_root) {
    wasm.chunk_cv(chunk_len, chunk_index, is_root);
}

/**
 * Get pointer to input buffer for direct memory access from JS
 * @returns {number}
 */
export function get_input_ptr() {
    const ret = wasm.get_input_ptr();
    return ret >>> 0;
}

/**
 * Get input buffer size
 * @returns {number}
 */
export function get_input_size() {
    const ret = wasm.get_input_size();
    return ret >>> 0;
}

/**
 * Get pointer to output buffer for direct memory access from JS
 * @returns {number}
 */
export function get_output_ptr() {
    const ret = wasm.get_output_ptr();
    return ret >>> 0;
}

/**
 * Get output buffer size
 * @returns {number}
 */
export function get_output_size() {
    const ret = wasm.get_input_size();
    return ret >>> 0;
}

/**
 * Get SIMD status info
 * @returns {string}
 */
export function get_simd_info() {
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

/**
 * Compute parent CV from two child CVs
 * Reads left CV from INPUT_BUFFER[0..32], right from INPUT_BUFFER[32..64]
 * Writes result to OUTPUT_BUFFER[0..32]
 * @param {boolean} is_root
 */
export function parent_cv(is_root) {
    wasm.parent_cv(is_root);
}

const EXPECTED_RESPONSE_TYPES = new Set(['basic', 'cors', 'default']);

async function __wbg_load(module, imports) {
    if (typeof Response === 'function' && module instanceof Response) {
        if (typeof WebAssembly.instantiateStreaming === 'function') {
            try {
                return await WebAssembly.instantiateStreaming(module, imports);
            } catch (e) {
                const validResponse = module.ok && EXPECTED_RESPONSE_TYPES.has(module.type);

                if (validResponse && module.headers.get('Content-Type') !== 'application/wasm') {
                    console.warn("`WebAssembly.instantiateStreaming` failed because your server does not serve Wasm with `application/wasm` MIME type. Falling back to `WebAssembly.instantiate` which is slower. Original error:\n", e);

                } else {
                    throw e;
                }
            }
        }

        const bytes = await module.arrayBuffer();
        return await WebAssembly.instantiate(bytes, imports);
    } else {
        const instance = await WebAssembly.instantiate(module, imports);

        if (instance instanceof WebAssembly.Instance) {
            return { instance, module };
        } else {
            return instance;
        }
    }
}

function __wbg_get_imports() {
    const imports = {};
    imports.wbg = {};
    imports.wbg.__wbindgen_init_externref_table = function() {
        const table = wasm.__wbindgen_externrefs;
        const offset = table.grow(4);
        table.set(0, undefined);
        table.set(offset + 0, undefined);
        table.set(offset + 1, null);
        table.set(offset + 2, true);
        table.set(offset + 3, false);
    };

    return imports;
}

function __wbg_finalize_init(instance, module) {
    wasm = instance.exports;
    __wbg_init.__wbindgen_wasm_module = module;
    cachedUint8ArrayMemory0 = null;


    wasm.__wbindgen_start();
    return wasm;
}

function initSync(module) {
    if (wasm !== undefined) return wasm;


    if (typeof module !== 'undefined') {
        if (Object.getPrototypeOf(module) === Object.prototype) {
            ({module} = module)
        } else {
            console.warn('using deprecated parameters for `initSync()`; pass a single object instead')
        }
    }

    const imports = __wbg_get_imports();
    if (!(module instanceof WebAssembly.Module)) {
        module = new WebAssembly.Module(module);
    }
    const instance = new WebAssembly.Instance(module, imports);
    return __wbg_finalize_init(instance, module);
}

async function __wbg_init(module_or_path) {
    if (wasm !== undefined) return wasm;


    if (typeof module_or_path !== 'undefined') {
        if (Object.getPrototypeOf(module_or_path) === Object.prototype) {
            ({module_or_path} = module_or_path)
        } else {
            console.warn('using deprecated parameters for the initialization function; pass a single object instead')
        }
    }

    if (typeof module_or_path === 'undefined') {
        module_or_path = new URL('bao_wasm_bg.wasm', import.meta.url);
    }
    const imports = __wbg_get_imports();

    if (typeof module_or_path === 'string' || (typeof Request === 'function' && module_or_path instanceof Request) || (typeof URL === 'function' && module_or_path instanceof URL)) {
        module_or_path = fetch(module_or_path);
    }

    const { instance, module } = await __wbg_load(await module_or_path, imports);

    return __wbg_finalize_init(instance, module);
}

export { initSync };
export default __wbg_init;

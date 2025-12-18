//! WASM SIMD-accelerated Bao operations using the official BLAKE3 crate.
//!
//! This module provides high-performance chunk CV and parent CV computations
//! for Bao verified streaming, using the blake3 crate's optimized SIMD implementations.

use wasm_bindgen::prelude::*;

const CHUNK_LEN: usize = 1024;
const OUT_LEN: usize = 32;

// Pre-allocated buffers for zero-copy operations (1MB each)
// Supports up to 32K leaf CVs for single-pass tree building
const INPUT_SIZE: usize = 1048576;  // 1MB
const OUTPUT_SIZE: usize = 1048576; // 1MB

static mut INPUT_BUFFER: [u8; INPUT_SIZE] = [0u8; INPUT_SIZE];
static mut OUTPUT_BUFFER: [u8; OUTPUT_SIZE] = [0u8; OUTPUT_SIZE];

/// Get pointer to input buffer for direct memory access from JS
#[wasm_bindgen]
pub fn get_input_ptr() -> *mut u8 {
    unsafe { INPUT_BUFFER.as_mut_ptr() }
}

/// Get pointer to output buffer for direct memory access from JS
#[wasm_bindgen]
pub fn get_output_ptr() -> *const u8 {
    unsafe { OUTPUT_BUFFER.as_ptr() }
}

/// Get input buffer size
#[wasm_bindgen]
pub fn get_input_size() -> usize {
    INPUT_SIZE
}

/// Get output buffer size
#[wasm_bindgen]
pub fn get_output_size() -> usize {
    OUTPUT_SIZE
}

/// Get SIMD status info
#[wasm_bindgen]
pub fn get_simd_info() -> String {
    #[cfg(target_feature = "simd128")]
    { "SIMD128 enabled".to_string() }
    #[cfg(not(target_feature = "simd128"))]
    { "SIMD NOT enabled".to_string() }
}

/// Compute chunk chaining value using blake3 crate's guts module
fn compute_chunk_cv(data: &[u8], chunk_index: u64, is_root: bool) -> [u8; 32] {
    // Use the guts module with deprecated API (still works)
    #[allow(deprecated)]
    {
        let mut state = blake3::guts::ChunkState::new(chunk_index);
        state.update(data);
        let output = state.finalize(is_root);
        *output.as_bytes()
    }
}

/// Compute parent chaining value from two child CVs using blake3 crate
fn compute_parent_cv(left: &[u8; 32], right: &[u8; 32], is_root: bool) -> [u8; 32] {
    #[allow(deprecated)]
    {
        let left_hash = blake3::Hash::from_bytes(*left);
        let right_hash = blake3::Hash::from_bytes(*right);
        let result = blake3::guts::parent_cv(&left_hash, &right_hash, is_root);
        *result.as_bytes()
    }
}

/// Compute chunk CV - main export
/// Reads chunk data from INPUT_BUFFER, writes CV to OUTPUT_BUFFER
#[wasm_bindgen]
pub fn chunk_cv(chunk_len: usize, chunk_index: u64, is_root: bool) {
    unsafe {
        let data = &INPUT_BUFFER[..chunk_len];
        let cv = compute_chunk_cv(data, chunk_index, is_root);
        OUTPUT_BUFFER[..OUT_LEN].copy_from_slice(&cv);
    }
}

/// Compute parent CV from two child CVs
/// Reads left CV from INPUT_BUFFER[0..32], right from INPUT_BUFFER[32..64]
/// Writes result to OUTPUT_BUFFER[0..32]
#[wasm_bindgen]
pub fn parent_cv(is_root: bool) {
    unsafe {
        let left: [u8; 32] = INPUT_BUFFER[..32].try_into().unwrap();
        let right: [u8; 32] = INPUT_BUFFER[32..64].try_into().unwrap();
        let cv = compute_parent_cv(&left, &right, is_root);
        OUTPUT_BUFFER[..OUT_LEN].copy_from_slice(&cv);
    }
}

/// Batch compute chunk CVs
/// Reads num_chunks * 1024 bytes from INPUT_BUFFER
/// Writes num_chunks * 32 bytes to OUTPUT_BUFFER
#[wasm_bindgen]
pub fn batch_chunk_cvs(num_chunks: usize, start_index: u64) {
    unsafe {
        for i in 0..num_chunks {
            let offset = i * CHUNK_LEN;
            let chunk_end = offset + CHUNK_LEN;
            let data = &INPUT_BUFFER[offset..chunk_end];
            let cv = compute_chunk_cv(data, start_index + i as u64, false);

            let out_offset = i * OUT_LEN;
            OUTPUT_BUFFER[out_offset..out_offset + OUT_LEN].copy_from_slice(&cv);
        }
    }
}

/// Batch compute parent CVs
/// Reads num_pairs * 64 bytes (CV pairs) from INPUT_BUFFER
/// Writes num_pairs * 32 bytes to OUTPUT_BUFFER
/// root_index: if >= 0, marks that pair as root
#[wasm_bindgen]
pub fn batch_parent_cvs(num_pairs: usize, root_index: i32) {
    unsafe {
        for i in 0..num_pairs {
            let in_offset = i * 64;
            let left: [u8; 32] = INPUT_BUFFER[in_offset..in_offset + 32].try_into().unwrap();
            let right: [u8; 32] = INPUT_BUFFER[in_offset + 32..in_offset + 64].try_into().unwrap();

            let is_root = root_index == i as i32;
            let cv = compute_parent_cv(&left, &right, is_root);

            let out_offset = i * OUT_LEN;
            OUTPUT_BUFFER[out_offset..out_offset + OUT_LEN].copy_from_slice(&cv);
        }
    }
}

/// Build entire Merkle tree in a single pass
/// Reads num_leaves * 32 bytes (leaf CVs) from INPUT_BUFFER
/// Writes 32-byte root CV to OUTPUT_BUFFER
/// Returns bytes written (32) or 0 on error
#[wasm_bindgen]
pub fn build_tree_single_pass(num_leaves: usize) -> usize {
    unsafe {
        if num_leaves == 0 {
            return 0;
        }
        if num_leaves == 1 {
            // Single leaf is root - copy from input to output
            OUTPUT_BUFFER[..32].copy_from_slice(&INPUT_BUFFER[..32]);
            return 32;
        }

        // Read all leaf CVs from INPUT_BUFFER
        let mut current_level: Vec<[u8; 32]> = Vec::with_capacity(num_leaves);
        for i in 0..num_leaves {
            let offset = i * 32;
            let mut cv = [0u8; 32];
            cv.copy_from_slice(&INPUT_BUFFER[offset..offset + 32]);
            current_level.push(cv);
        }

        // Build tree level by level
        while current_level.len() > 1 {
            let num_pairs = current_level.len() / 2;
            let has_odd = current_level.len() % 2 == 1;
            let is_root_level = current_level.len() == 2 && !has_odd;

            let mut next_level = Vec::with_capacity(num_pairs + if has_odd { 1 } else { 0 });

            for i in 0..num_pairs {
                let is_root = is_root_level && i == 0;
                let parent = compute_parent_cv(&current_level[i * 2], &current_level[i * 2 + 1], is_root);
                next_level.push(parent);
            }

            if has_odd {
                next_level.push(current_level[current_level.len() - 1]);
            }

            current_level = next_level;
        }

        // Write root to output buffer
        OUTPUT_BUFFER[..32].copy_from_slice(&current_level[0]);
        32 // Return bytes written
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_empty_chunk() {
        let cv = compute_chunk_cv(&[], 0, true);
        // Expected: af1349b9f5f9a1a6a0404dea36dcc9499bcb25c9adc112b7cc9a93cae41f3262
        assert_eq!(cv[0], 0xaf);
        assert_eq!(cv[31], 0x62);
    }

    #[test]
    fn test_hello_world() {
        let data = b"hello world";
        let cv = compute_chunk_cv(data, 0, true);
        // d74981efa70a0c880b8d8c1985d075dbcbf679b99a5f9914e5aaf96b831a9e24
        assert_eq!(cv[0], 0xd7);
    }
}

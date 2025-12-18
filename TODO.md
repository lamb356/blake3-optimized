# TODO: Code Review Fixes for blake3-bao v1.3.2

## Critical Issues (Must Fix)

### 1. Buffer Transfer Bug - FIXED in v1.3.2
**File:** worker-pool.js line 154
**Problem:** After slice(), transfers original buffer instead of sliced buffer. Causes race condition and potential memory corruption.
**Fix:** Ensure task.data.buffer refers to the sliced buffer, not original.

### 2. Race Condition in executeTask() - FIXED in v1.3.2
**File:** worker-pool.js line 102-122
**Problem:** After _waitForWorker() returns, another concurrent call could grab the worker. workerId ends up as -1, causing crash on workers[-1].
**Fix:** Use atomic claim - set workerReady[i] = false immediately when found.

### 3. WASM Buffer Size Mismatch - FIXED in v1.3.2
**File:** bao-rust-worker.js line 16-28
**Problem:** Buffer size hardcoded to 65536 (64KB) but Rust uses 1MB. Views point to wrong memory range.
**Fix:** Export get_input_size() and get_output_size() from Rust, use in JS.

### 4. Rust Static Mut Safety
**File:** rust-bao/src/lib.rs
**Problem:** static mut buffers work but are fragile. Reentrancy or async interleaving could corrupt.
**Fix:** Either use thread_local! RefCell pattern or document safety requirements.

## High Priority

### 5. Worker Shutdown Leak - FIXED in v1.3.2
**File:** worker-pool.js line 229-240
**Problem:** If worker doesn't respond to shutdown, timeout resolves but worker keeps running.
**Fix:** Call worker.terminate() after timeout if not exited.

### 6. Missing Error Propagation - FIXED in v1.3.2
**File:** bao-rust-worker.js line 118-155
**Problem:** msg.taskId could be undefined, error handling incomplete.
**Fix:** Default taskId, validate required fields, include stack trace.

### 7. DataView Edge Cases - FIXED in v1.3.2
**File:** bao.js loadBlockFast()
**Problem:** No check for detached buffers or bounds.
**Fix:** Add buffer.byteLength check and bounds validation.

## Medium Priority

### 8. build_tree_single_pass Overflow - FIXED in v1.3.2
**File:** rust-bao/src/lib.rs
**Problem:** No bounds check - num_leaves > INPUT_SIZE/32 causes panic.
**Fix:** Return Result with error for too many leaves.

### 9. Worker Pool Singleton Confusion
**File:** worker-pool.js line 256
**Problem:** numWorkers ignored on subsequent calls.
**Fix:** Warn if numWorkers differs from existing pool.

### 10. Worker Crash Handling
**File:** worker-pool.js line 108
**Problem:** Dead worker marked not ready but pending tasks not rejected.
**Fix:** Reject pending tasks, optionally restart worker.

## Low Priority

### 11. Code Duplication
Extract common worker handler logic to shared module.

### 12. TypeScript Definitions
Add proper .d.ts files for ParallelBaoProcessor and PersistentWorkerPool.

---

## Fix Order for Tomorrow

1. Fix #1 (buffer transfer) - 30 min
2. Fix #2 (race condition) - 30 min
3. Fix #3 (buffer sizes) - 30 min, requires Rust rebuild
4. Fix #8 (bounds check) - 30 min
5. Fix #5 (shutdown) - 15 min
6. Fix #6 (error handling) - 15 min
7. Run full test suite
8. Bump to v1.3.2, commit, push, npm publish

Estimated time: 2-3 hours

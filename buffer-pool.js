/**
 * Buffer Pool for reducing GC pressure in hot paths
 *
 * Reuses Uint8Array buffers to avoid repeated allocations during
 * Bao encoding/decoding operations.
 */
'use strict';

class BufferPool {
  /**
   * @param {number} maxPoolSize - Maximum buffers per size class
   */
  constructor(maxPoolSize = 32) {
    this.pools = new Map(); // size -> array of buffers
    this.maxPoolSize = maxPoolSize;
    this.stats = {
      hits: 0,
      misses: 0,
      releases: 0
    };
  }

  /**
   * Round up to nearest power of 2 for better buffer reuse
   * @param {number} n
   * @returns {number}
   */
  _nextPowerOf2(n) {
    if (n <= 0) return 1;
    n--;
    n |= n >> 1;
    n |= n >> 2;
    n |= n >> 4;
    n |= n >> 8;
    n |= n >> 16;
    return n + 1;
  }

  /**
   * Acquire a buffer of at least the specified size
   * @param {number} size - Minimum buffer size needed
   * @returns {Uint8Array}
   */
  acquire(size) {
    if (size <= 0) return new Uint8Array(0);

    // Round up to nearest power of 2 for better reuse
    const poolSize = this._nextPowerOf2(size);
    const pool = this.pools.get(poolSize);

    if (pool && pool.length > 0) {
      this.stats.hits++;
      const buf = pool.pop();
      // Return a view of the exact size requested
      if (buf.length === size) {
        return buf;
      }
      return new Uint8Array(buf.buffer, 0, size);
    }

    this.stats.misses++;
    return new Uint8Array(poolSize).subarray(0, size);
  }

  /**
   * Release a buffer back to the pool for reuse
   * @param {Uint8Array} buffer
   */
  release(buffer) {
    if (!buffer || buffer.byteLength === 0) return;

    // Get the underlying buffer size (power of 2)
    const poolSize = buffer.buffer.byteLength;

    // Only pool power-of-2 sized buffers
    if ((poolSize & (poolSize - 1)) !== 0) return;

    let pool = this.pools.get(poolSize);
    if (!pool) {
      pool = [];
      this.pools.set(poolSize, pool);
    }

    if (pool.length < this.maxPoolSize) {
      // Store the full buffer, not the view
      pool.push(new Uint8Array(buffer.buffer));
      this.stats.releases++;
    }
  }

  /**
   * Acquire a buffer and zero it
   * @param {number} size
   * @returns {Uint8Array}
   */
  acquireZeroed(size) {
    const buf = this.acquire(size);
    buf.fill(0);
    return buf;
  }

  /**
   * Clear all pooled buffers
   */
  clear() {
    this.pools.clear();
  }

  /**
   * Get pool statistics
   * @returns {{hits: number, misses: number, releases: number, hitRate: number, pooledBuffers: number}}
   */
  getStats() {
    let pooledBuffers = 0;
    for (const pool of this.pools.values()) {
      pooledBuffers += pool.length;
    }

    const total = this.stats.hits + this.stats.misses;
    return {
      ...this.stats,
      hitRate: total > 0 ? (this.stats.hits / total * 100).toFixed(1) + '%' : '0%',
      pooledBuffers
    };
  }

  /**
   * Reset statistics
   */
  resetStats() {
    this.stats.hits = 0;
    this.stats.misses = 0;
    this.stats.releases = 0;
  }
}

// Global pool instance for common buffer sizes
const globalPool = new BufferPool(64);

// Pre-defined pool accessors for common Bao sizes
const CHUNK_SIZE = 1024;
const HASH_SIZE = 32;
const BLOCK_SIZE = 64;
const CHUNK_GROUP_SIZE = 16 * 1024;
const PARENT_SIZE = 64; // Two hashes concatenated

/**
 * Acquire a chunk-sized buffer (1024 bytes)
 * @returns {Uint8Array}
 */
function acquireChunk() {
  return globalPool.acquire(CHUNK_SIZE);
}

/**
 * Acquire a hash-sized buffer (32 bytes)
 * @returns {Uint8Array}
 */
function acquireHash() {
  return globalPool.acquire(HASH_SIZE);
}

/**
 * Acquire a block-sized buffer (64 bytes)
 * @returns {Uint8Array}
 */
function acquireBlock() {
  return globalPool.acquire(BLOCK_SIZE);
}

/**
 * Acquire a chunk group buffer (16 KB)
 * @returns {Uint8Array}
 */
function acquireChunkGroup() {
  return globalPool.acquire(CHUNK_GROUP_SIZE);
}

/**
 * Acquire a parent node buffer (64 bytes - two hashes)
 * @returns {Uint8Array}
 */
function acquireParent() {
  return globalPool.acquire(PARENT_SIZE);
}

/**
 * Acquire a buffer of arbitrary size
 * @param {number} size
 * @returns {Uint8Array}
 */
function acquire(size) {
  return globalPool.acquire(size);
}

/**
 * Release a buffer back to the pool
 * @param {Uint8Array} buffer
 */
function release(buffer) {
  globalPool.release(buffer);
}

/**
 * Get the global pool instance
 * @returns {BufferPool}
 */
function getPool() {
  return globalPool;
}

/**
 * Clear the global pool
 */
function clearPool() {
  globalPool.clear();
}

/**
 * Get pool statistics
 */
function getPoolStats() {
  return globalPool.getStats();
}

module.exports = {
  BufferPool,
  globalPool,
  acquire,
  release,
  acquireChunk,
  acquireHash,
  acquireBlock,
  acquireChunkGroup,
  acquireParent,
  getPool,
  clearPool,
  getPoolStats,
  // Constants
  CHUNK_SIZE,
  HASH_SIZE,
  BLOCK_SIZE,
  CHUNK_GROUP_SIZE,
  PARENT_SIZE
};

/**
 * utils/lruCache.js — LRU (Least Recently Used) Cache for contacts.
 *
 * WHY LRU?
 *   Repeatedly fetching the same contact from MongoDB (especially inside
 *   graph traversals) is wasteful. An LRU cache keeps the N most recently
 *   accessed contacts in memory. On a cache HIT we skip the DB round-trip
 *   entirely — returning the result in O(1).
 *
 * IMPLEMENTATION:
 *   Uses a Map (insertion-ordered) as a doubly-linked list equivalent.
 *   Map preserves insertion order, so we delete-and-reinsert on access
 *   to move an entry to the "most recent" position. The oldest entry is
 *   always Map.keys().next().value (first key).
 */

class LRUCache {
  /**
   * @param {number} capacity — max number of contacts to hold in memory
   */
  constructor(capacity = 50) {
    this.capacity = capacity;
    this.cache = new Map(); // contactId (string) → contact object
    this.hits = 0;
    this.misses = 0;
  }

  /**
   * Retrieve a contact from cache.
   * Moves the entry to "most recently used" position.
   * @param {string} id
   * @returns {object|null}
   */
  get(id) {
    if (!this.cache.has(id)) {
      this.misses++;
      return null;
    }
    // Move to end (most recent)
    const value = this.cache.get(id);
    this.cache.delete(id);
    this.cache.set(id, value);
    this.hits++;
    return value;
  }

  /**
   * Store a contact in cache.
   * Evicts the least recently used entry if at capacity.
   * @param {string} id
   * @param {object} contact
   */
  put(id, contact) {
    if (this.cache.has(id)) {
      this.cache.delete(id); // remove old position
    } else if (this.cache.size >= this.capacity) {
      // Evict LRU: first key in Map is the oldest
      const lruKey = this.cache.keys().next().value;
      this.cache.delete(lruKey);
    }
    this.cache.set(id, contact);
  }

  /**
   * Invalidate a single entry (call on update/delete).
   * @param {string} id
   */
  invalidate(id) {
    this.cache.delete(id);
  }

  /** Clear everything (e.g. on bulk operations). */
  clear() {
    this.cache.clear();
  }

  /** Return cache statistics for debugging / API transparency. */
  stats() {
    return {
      size: this.cache.size,
      capacity: this.capacity,
      hits: this.hits,
      misses: this.misses,
      hitRate: this.hits + this.misses === 0
        ? '0%'
        : `${((this.hits / (this.hits + this.misses)) * 100).toFixed(1)}%`,
    };
  }
}

// Singleton — one cache shared across all requests
module.exports = new LRUCache(50);

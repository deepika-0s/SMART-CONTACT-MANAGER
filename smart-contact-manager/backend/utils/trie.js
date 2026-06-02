/**
 * utils/trie.js — Trie (Prefix Tree) for fast contact name search.
 *
 * WHY A TRIE?
 *   A simple Array.filter() is O(n·m) per search (n contacts, m query length).
 *   A Trie gives O(m) lookup time regardless of how many contacts exist,
 *   making it ideal for real-time autocomplete / prefix search.
 *
 * STRUCTURE:
 *   Each TrieNode holds:
 *     - children: map of character → TrieNode
 *     - contactIds: Set of contact IDs whose names pass through this node
 *     - isEnd: marks end of a complete name
 */

class TrieNode {
  constructor() {
    this.children = {};       // char → TrieNode
    this.contactIds = new Set(); // IDs of contacts whose name ends here or passes through
    this.isEnd = false;
  }
}

class Trie {
  constructor() {
    this.root = new TrieNode();
  }

  /**
   * Insert a contact name into the Trie.
   * Stores the contactId at every node along the path so prefix search
   * can collect all matching IDs without extra traversal.
   * @param {string} name  — contact's name (lowercased internally)
   * @param {string} id    — MongoDB contact _id
   */
  insert(name, id) {
    let node = this.root;
    const normalized = name.toLowerCase();

    for (const char of normalized) {
      if (!node.children[char]) {
        node.children[char] = new TrieNode();
      }
      node = node.children[char];
      node.contactIds.add(id); // every prefix node tracks this contact
    }
    node.isEnd = true;
  }

  /**
   * Remove a contact from the Trie (on delete/update).
   * @param {string} name
   * @param {string} id
   */
  remove(name, id) {
    let node = this.root;
    const normalized = name.toLowerCase();

    for (const char of normalized) {
      if (!node.children[char]) return; // name not in trie
      node = node.children[char];
      node.contactIds.delete(id);
    }
  }

  /**
   * Search for all contact IDs whose name starts with the given prefix.
   * Returns a Set of contact IDs.
   * @param {string} prefix
   * @returns {Set<string>}
   */
  search(prefix) {
    let node = this.root;
    const normalized = prefix.toLowerCase();

    for (const char of normalized) {
      if (!node.children[char]) return new Set(); // prefix not found
      node = node.children[char];
    }

    // All contactIds stored at this prefix node match
    return new Set(node.contactIds);
  }

  /**
   * Rebuild the entire Trie from an array of contacts.
   * Called on server startup after loading contacts from MongoDB.
   * @param {Array<{_id: string, name: string}>} contacts
   */
  rebuild(contacts) {
    this.root = new TrieNode();
    for (const contact of contacts) {
      this.insert(contact.name, contact._id.toString());
    }
  }
}

// Export a singleton so the same Trie instance is reused across requests
module.exports = new Trie();

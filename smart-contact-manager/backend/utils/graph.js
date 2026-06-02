/**
 * utils/graph.js — Adjacency-list Graph for contact relationships.
 *
 * WHY A GRAPH?
 *   Contacts in real life are not isolated — they know each other.
 *   Modelling this as a graph lets us answer questions like:
 *     "Who are all the work contacts reachable from Alice within 2 hops?"
 *   A plain array lookup cannot answer this efficiently.
 *
 * IMPLEMENTATION:
 *   - Undirected weighted graph using a Map of adjacency lists.
 *   - Vertices = contact IDs (strings).
 *   - Edges = { type: 'friend'|'work'|'family'|'other' }.
 *   - BFS traversal to find all contacts reachable within N hops.
 *   - DFS to detect clusters / connected components.
 */

class ContactGraph {
  constructor() {
    // Map<contactId, Map<neighborId, {type}>>
    this.adjacency = new Map();
  }

  /** Ensure a vertex exists in the graph. */
  addVertex(id) {
    if (!this.adjacency.has(id)) {
      this.adjacency.set(id, new Map());
    }
  }

  /** Remove a vertex and all its edges (on contact delete). */
  removeVertex(id) {
    if (!this.adjacency.has(id)) return;
    // Remove this id from all neighbors' lists
    for (const neighborId of this.adjacency.get(id).keys()) {
      if (this.adjacency.has(neighborId)) {
        this.adjacency.get(neighborId).delete(id);
      }
    }
    this.adjacency.delete(id);
  }

  /**
   * Add an undirected edge between two contacts.
   * @param {string} idA
   * @param {string} idB
   * @param {string} type — relationship type
   */
  addEdge(idA, idB, type = 'other') {
    this.addVertex(idA);
    this.addVertex(idB);
    this.adjacency.get(idA).set(idB, { type });
    this.adjacency.get(idB).set(idA, { type });
  }

  /** Remove an edge (relationship removed). */
  removeEdge(idA, idB) {
    if (this.adjacency.has(idA)) this.adjacency.get(idA).delete(idB);
    if (this.adjacency.has(idB)) this.adjacency.get(idB).delete(idA);
  }

  /**
   * BFS — find all contacts reachable from `startId` within `maxDepth` hops.
   * Returns an array of { id, depth, relationshipType }.
   * @param {string} startId
   * @param {number} maxDepth
   * @returns {Array<{id: string, depth: number, type: string}>}
   */
  bfs(startId, maxDepth = 2) {
    if (!this.adjacency.has(startId)) return [];

    const visited = new Set([startId]);
    const result = [];
    // Queue entries: [contactId, depth, relationshipType]
    const queue = [[startId, 0, null]];

    while (queue.length > 0) {
      const [current, depth, relType] = queue.shift();

      if (depth > 0) {
        result.push({ id: current, depth, type: relType });
      }

      if (depth >= maxDepth) continue;

      const neighbors = this.adjacency.get(current) || new Map();
      for (const [neighborId, edge] of neighbors.entries()) {
        if (!visited.has(neighborId)) {
          visited.add(neighborId);
          queue.push([neighborId, depth + 1, edge.type]);
        }
      }
    }

    return result;
  }

  /**
   * DFS — find the connected component containing `startId`.
   * Returns a Set of all contact IDs in the same cluster.
   * @param {string} startId
   * @returns {Set<string>}
   */
  dfs(startId) {
    const visited = new Set();
    const stack = [startId];

    while (stack.length > 0) {
      const current = stack.pop();
      if (visited.has(current)) continue;
      visited.add(current);

      const neighbors = this.adjacency.get(current) || new Map();
      for (const neighborId of neighbors.keys()) {
        if (!visited.has(neighborId)) {
          stack.push(neighborId);
        }
      }
    }

    return visited;
  }

  /**
   * Get direct neighbors of a contact with their relationship types.
   * @param {string} id
   * @returns {Array<{id: string, type: string}>}
   */
  getNeighbors(id) {
    if (!this.adjacency.has(id)) return [];
    const neighbors = [];
    for (const [neighborId, edge] of this.adjacency.get(id).entries()) {
      neighbors.push({ id: neighborId, type: edge.type });
    }
    return neighbors;
  }

  /**
   * Rebuild graph from all contacts stored in MongoDB.
   * @param {Array} contacts — array of Contact documents
   */
  rebuild(contacts) {
    this.adjacency = new Map();
    for (const contact of contacts) {
      const id = contact._id.toString();
      this.addVertex(id);
      for (const rel of contact.relationships || []) {
        const neighborId = rel.contactId.toString();
        // Only add once per pair (addEdge is idempotent)
        this.addEdge(id, neighborId, rel.type);
      }
    }
  }

  /** Return a plain-object snapshot for API responses. */
  snapshot() {
    const obj = {};
    for (const [id, neighbors] of this.adjacency.entries()) {
      obj[id] = [];
      for (const [nId, edge] of neighbors.entries()) {
        obj[id].push({ id: nId, type: edge.type });
      }
    }
    return obj;
  }
}

// Singleton
module.exports = new ContactGraph();

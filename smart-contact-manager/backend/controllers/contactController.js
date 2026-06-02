/**
 * controllers/contactController.js
 * All business logic for contact CRUD + DSA-powered features.
 * Trie, LRU Cache, and Graph are updated in sync with every DB mutation.
 */

const Contact = require('../models/Contact');
const trie = require('../utils/trie');
const lruCache = require('../utils/lruCache');
const graph = require('../utils/graph');

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Bootstrap DSA structures once on server startup.
 * Called from contactRoutes after the DB is ready.
 */
async function initDSA() {
  const contacts = await Contact.find({});
  trie.rebuild(contacts);
  graph.rebuild(contacts);
  console.log(`[DSA] Trie & Graph initialised with ${contacts.length} contacts`);
}

// ─── CREATE ───────────────────────────────────────────────────────────────────

/**
 * POST /api/contacts
 * Creates a new contact and registers it with the Trie and Graph.
 */
async function createContact(req, res, next) {
  try {
    const { name, phone, email, tags, relationships } = req.body;

    const contact = await Contact.create({ name, phone, email, tags, relationships });
    const id = contact._id.toString();

    // Update Trie
    trie.insert(name, id);

    // Update Graph
    graph.addVertex(id);
    for (const rel of contact.relationships || []) {
      graph.addEdge(id, rel.contactId.toString(), rel.type);
    }

    // Warm the LRU cache with the new entry
    lruCache.put(id, contact.toObject());

    res.status(201).json({ success: true, data: contact });
  } catch (err) {
    next(err);
  }
}

// ─── READ ALL ─────────────────────────────────────────────────────────────────

/**
 * GET /api/contacts
 * Returns all contacts sorted by name.
 */
async function getAllContacts(req, res, next) {
  try {
    const contacts = await Contact.find({}).sort({ name: 1 });
    res.json({ success: true, count: contacts.length, data: contacts });
  } catch (err) {
    next(err);
  }
}

// ─── SEARCH (TRIE-POWERED) ────────────────────────────────────────────────────

/**
 * GET /api/contacts/search?q=<prefix>
 * Uses the Trie to find matching contact IDs in O(m), then fetches
 * those contacts from the LRU cache or MongoDB.
 */
async function searchContacts(req, res, next) {
  try {
    const query = (req.query.q || '').trim();

    if (!query) {
      return res.json({ success: true, data: [], source: 'empty-query' });
    }

    // ── Step 1: Trie lookup — O(m) where m = query length ──
    const matchedIds = trie.search(query); // returns Set<string>

    if (matchedIds.size === 0) {
      return res.json({ success: true, data: [], source: 'trie', trieHits: 0 });
    }

    // ── Step 2: Resolve each ID via LRU cache or DB ──
    const results = [];
    const dbFetchIds = [];

    for (const id of matchedIds) {
      const cached = lruCache.get(id);
      if (cached) {
        results.push(cached);
      } else {
        dbFetchIds.push(id);
      }
    }

    if (dbFetchIds.length > 0) {
      const fromDb = await Contact.find({ _id: { $in: dbFetchIds } });
      for (const doc of fromDb) {
        const obj = doc.toObject();
        lruCache.put(doc._id.toString(), obj); // warm cache
        results.push(obj);
      }
    }

    results.sort((a, b) => a.name.localeCompare(b.name));

    res.json({
      success: true,
      data: results,
      source: 'trie',
      trieHits: matchedIds.size,
      cacheStats: lruCache.stats(),
    });
  } catch (err) {
    next(err);
  }
}

// ─── UPDATE ───────────────────────────────────────────────────────────────────

/**
 * PUT /api/contacts/:id
 * Updates a contact, keeping Trie, LRU, and Graph consistent.
 */
async function updateContact(req, res, next) {
  try {
    const { id } = req.params;
    const { name, phone, email, tags, relationships } = req.body;

    const old = await Contact.findById(id);
    if (!old) return res.status(404).json({ success: false, message: 'Contact not found' });

    // Remove old Trie entry, add new one
    trie.remove(old.name, id);

    // Remove old graph edges
    graph.removeVertex(id);

    // Update in DB
    const updated = await Contact.findByIdAndUpdate(
      id,
      { name, phone, email, tags, relationships },
      { new: true, runValidators: true }
    );

    // Re-insert into Trie with new name
    trie.insert(updated.name, id);

    // Re-add to Graph
    graph.addVertex(id);
    for (const rel of updated.relationships || []) {
      graph.addEdge(id, rel.contactId.toString(), rel.type);
    }

    // Invalidate LRU and re-warm
    lruCache.invalidate(id);
    lruCache.put(id, updated.toObject());

    res.json({ success: true, data: updated });
  } catch (err) {
    next(err);
  }
}

// ─── DELETE ───────────────────────────────────────────────────────────────────

/**
 * DELETE /api/contacts/:id
 * Removes contact from DB, Trie, LRU cache, and Graph.
 */
async function deleteContact(req, res, next) {
  try {
    const { id } = req.params;
    const contact = await Contact.findById(id);

    if (!contact) return res.status(404).json({ success: false, message: 'Contact not found' });

    await contact.deleteOne();

    trie.remove(contact.name, id);
    lruCache.invalidate(id);
    graph.removeVertex(id);

    res.json({ success: true, message: 'Contact deleted', id });
  } catch (err) {
    next(err);
  }
}

// ─── GRAPH TRAVERSAL ──────────────────────────────────────────────────────────

/**
 * GET /api/contacts/:id/network?depth=2
 * Returns all contacts reachable from :id within `depth` hops using BFS.
 */
async function getNetwork(req, res, next) {
  try {
    const { id } = req.params;
    const depth = Math.min(parseInt(req.query.depth) || 2, 4); // cap at 4

    const bfsResult = graph.bfs(id, depth); // [{id, depth, type}]

    // Resolve contact names from LRU or DB
    const enriched = [];
    const dbIds = [];

    for (const entry of bfsResult) {
      const cached = lruCache.get(entry.id);
      if (cached) {
        enriched.push({ ...entry, name: cached.name, email: cached.email });
      } else {
        dbIds.push(entry);
      }
    }

    if (dbIds.length > 0) {
      const fromDb = await Contact.find({ _id: { $in: dbIds.map((e) => e.id) } });
      const dbMap = {};
      for (const doc of fromDb) {
        dbMap[doc._id.toString()] = doc;
        lruCache.put(doc._id.toString(), doc.toObject());
      }
      for (const entry of dbIds) {
        const doc = dbMap[entry.id];
        if (doc) enriched.push({ ...entry, name: doc.name, email: doc.email });
      }
    }

    enriched.sort((a, b) => a.depth - b.depth);

    res.json({ success: true, rootId: id, depth, network: enriched });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/contacts/graph
 * Returns a snapshot of the entire contact graph.
 */
async function getGraph(req, res, next) {
  try {
    res.json({ success: true, graph: graph.snapshot(), cacheStats: lruCache.stats() });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  initDSA,
  createContact,
  getAllContacts,
  searchContacts,
  updateContact,
  deleteContact,
  getNetwork,
  getGraph,
};

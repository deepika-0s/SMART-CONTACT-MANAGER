/**
 * routes/contactRoutes.js — Express router for contact endpoints.
 * Delegates all logic to contactController.js (MVC pattern).
 */

const express = require('express');
const router = express.Router();
const {
  initDSA,
  createContact,
  getAllContacts,
  searchContacts,
  updateContact,
  deleteContact,
  getNetwork,
  getGraph,
} = require('../controllers/contactController');

// Initialise DSA structures when routes are first loaded
initDSA().catch((err) => console.error('[DSA Init Error]', err.message));

// ── REST Endpoints ────────────────────────────────────────────────────────────
router.post('/', createContact);                  // Create
router.get('/', getAllContacts);                   // Read all
router.get('/search', searchContacts);            // Trie-based search
router.get('/graph', getGraph);                   // Full graph snapshot
router.get('/:id/network', getNetwork);           // BFS network traversal
router.put('/:id', updateContact);                // Update
router.delete('/:id', deleteContact);             // Delete

module.exports = router;

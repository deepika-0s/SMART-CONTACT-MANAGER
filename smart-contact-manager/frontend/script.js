/**
 * script.js — Smart Contact Manager Frontend
 *
 * Communicates with the Express backend (REST API).
 * Handles:
 *   - CRUD operations with animated UI updates
 *   - Trie-powered live search (via /api/contacts/search?q=)
 *   - LRU cache status display
 *   - Graph visualization using Canvas API + BFS network view
 */

'use strict';

// ── Config ───────────────────────────────────────────────────────────────────
const API = '/api/contacts';

// ── State ────────────────────────────────────────────────────────────────────
let allContacts = [];         // Full contact list (for graph, rendering)
let searchTimeout = null;     // Debounce timer for search
let graphNodes = [];          // Rendered graph node positions {id, x, y, name}
let currentTab = 'all';

// ── Colour palette for avatars ────────────────────────────────────────────────
const AVATAR_PALETTES = [
  ['#4f35e0', '#7c6aff'],
  ['#0d9488', '#2dd4bf'],
  ['#be185d', '#fb7185'],
  ['#b45309', '#fbbf24'],
  ['#1d4ed8', '#60a5fa'],
];
function avatarColors(name) {
  const idx = name.charCodeAt(0) % AVATAR_PALETTES.length;
  return AVATAR_PALETTES[idx];
}

// ── Fetch helper ─────────────────────────────────────────────────────────────
async function apiFetch(url, options = {}) {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.message || 'API error');
  return json;
}

// ── Toast ─────────────────────────────────────────────────────────────────────
let toastTimer;
function showToast(msg, type = 'success') {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className = `toast show ${type}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 3000);
}

// ═════════════════════════════════════════════════════════════════════════════
// CRUD
// ═════════════════════════════════════════════════════════════════════════════

async function loadContacts() {
  try {
    const data = await apiFetch(API);
    allContacts = data.data;
    renderContactsList(allContacts);
    updateCount(allContacts.length);
    if (currentTab === 'graph') drawGraph();
  } catch (e) {
    showToast('Failed to load contacts', 'error');
  }
}

async function handleSubmit() {
  const id    = document.getElementById('editId').value;
  const name  = document.getElementById('inputName').value.trim();
  const phone = document.getElementById('inputPhone').value.trim();
  const email = document.getElementById('inputEmail').value.trim();
  const tags  = document.getElementById('inputTags').value
    .split(',').map(t => t.trim()).filter(Boolean);

  if (!name || !phone || !email) {
    showToast('Name, phone and email are required', 'error');
    return;
  }

  try {
    if (id) {
      // ── UPDATE ──
      await apiFetch(`${API}/${id}`, {
        method: 'PUT',
        body: JSON.stringify({ name, phone, email, tags }),
      });
      showToast(`${name} updated ✓`);
    } else {
      // ── CREATE ──
      await apiFetch(API, {
        method: 'POST',
        body: JSON.stringify({ name, phone, email, tags }),
      });
      showToast(`${name} added ✓`);
    }
    resetForm();
    await loadContacts();
  } catch (e) {
    showToast(e.message, 'error');
  }
}

async function deleteContact(id, name) {
  if (!confirm(`Delete "${name}"?`)) return;
  try {
    await apiFetch(`${API}/${id}`, { method: 'DELETE' });
    showToast(`${name} deleted`);
    await loadContacts();
  } catch (e) {
    showToast(e.message, 'error');
  }
}

function editContact(contact) {
  document.getElementById('editId').value   = contact._id;
  document.getElementById('inputName').value  = contact.name;
  document.getElementById('inputPhone').value = contact.phone;
  document.getElementById('inputEmail').value = contact.email;
  document.getElementById('inputTags').value  = (contact.tags || []).join(', ');
  document.getElementById('formTitle').textContent = 'Edit Contact';
  document.getElementById('submitBtn').innerHTML = '<span class="btn-icon">✓</span> Save Changes';
  document.getElementById('cancelBtn').style.display = 'flex';
  document.getElementById('inputName').focus();
}

function cancelEdit() {
  resetForm();
}

function resetForm() {
  document.getElementById('editId').value     = '';
  document.getElementById('inputName').value  = '';
  document.getElementById('inputPhone').value = '';
  document.getElementById('inputEmail').value = '';
  document.getElementById('inputTags').value  = '';
  document.getElementById('formTitle').textContent = 'Add Contact';
  document.getElementById('submitBtn').innerHTML = '<span class="btn-icon">+</span> Add Contact';
  document.getElementById('cancelBtn').style.display = 'none';
}

// ═════════════════════════════════════════════════════════════════════════════
// RENDERING
// ═════════════════════════════════════════════════════════════════════════════

function renderContactsList(contacts) {
  const list = document.getElementById('contactsList');
  const empty = document.getElementById('emptyState');

  if (!contacts.length) {
    list.innerHTML = '';
    list.appendChild(empty);
    empty.style.display = 'flex';
    return;
  }
  empty.style.display = 'none';

  list.innerHTML = contacts.map(c => {
    const initials = c.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
    const [bg, fg] = avatarColors(c.name);
    const tagsHtml = (c.tags || []).map(t =>
      `<span class="contact-tag">${escHtml(t)}</span>`
    ).join('');

    return `
    <div class="contact-card" data-id="${c._id}">
      <div class="contact-avatar" style="background:${bg}20;color:${fg};border:1px solid ${fg}30">
        ${initials}
      </div>
      <div class="contact-body">
        <div class="contact-name">${escHtml(c.name)}</div>
        <div class="contact-meta">
          <span>📞 ${escHtml(c.phone)}</span>
          <span>✉ ${escHtml(c.email)}</span>
        </div>
        ${tagsHtml ? `<div class="contact-tags">${tagsHtml}</div>` : ''}
      </div>
      <div class="contact-actions">
        <button class="action-btn net" title="View network (BFS)"
          onclick='showNetwork("${c._id}", "${escHtml(c.name)}")'>⌬</button>
        <button class="action-btn edit" title="Edit"
          onclick='editContact(${JSON.stringify(c).replace(/'/g, "\\'")})'> ✎</button>
        <button class="action-btn del" title="Delete"
          onclick='deleteContact("${c._id}","${escHtml(c.name)}")'>✕</button>
      </div>
    </div>`;
  }).join('');
}

function escHtml(str) {
  return String(str)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function updateCount(n) {
  document.getElementById('contactCount').textContent = `${n} contact${n !== 1 ? 's' : ''}`;
}

// ═════════════════════════════════════════════════════════════════════════════
// TRIE SEARCH
// ═════════════════════════════════════════════════════════════════════════════

function handleSearch() {
  const q = document.getElementById('searchInput').value.trim();
  const badge = document.getElementById('searchBadge');
  const clear = document.getElementById('searchClear');

  clear.style.display = q ? 'block' : 'none';

  clearTimeout(searchTimeout);

  if (!q) {
    badge.style.display = 'none';
    renderContactsList(allContacts);
    updateCount(allContacts.length);
    return;
  }

  badge.style.display = 'block';

  // Debounce 180ms — feels instant but avoids flooding the API
  searchTimeout = setTimeout(async () => {
    try {
      const data = await apiFetch(`${API}/search?q=${encodeURIComponent(q)}`);
      renderContactsList(data.data);
      updateCount(data.data.length);

      // Show LRU cache stats
      if (data.cacheStats) {
        document.getElementById('cacheStatus').textContent =
          `Cache: ${data.cacheStats.hitRate} hit`;
      }
    } catch (e) {
      showToast('Search failed', 'error');
    }
  }, 180);
}

function clearSearch() {
  document.getElementById('searchInput').value = '';
  document.getElementById('searchBadge').style.display = 'none';
  document.getElementById('searchClear').style.display = 'none';
  renderContactsList(allContacts);
  updateCount(allContacts.length);
}

// ═════════════════════════════════════════════════════════════════════════════
// TABS
// ═════════════════════════════════════════════════════════════════════════════

function switchTab(tab) {
  currentTab = tab;
  document.getElementById('tabAll').classList.toggle('active', tab === 'all');
  document.getElementById('tabGraph').classList.toggle('active', tab === 'graph');
  document.getElementById('contactsList').style.display = tab === 'all' ? 'flex' : 'none';
  document.getElementById('graphView').style.display = tab === 'graph' ? 'flex' : 'none';

  if (tab === 'graph') {
    setTimeout(drawGraph, 50); // wait for layout paint
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// GRAPH VISUALIZATION (Canvas)
// ═════════════════════════════════════════════════════════════════════════════

function drawGraph() {
  const canvas = document.getElementById('graphCanvas');
  const ctx = canvas.getContext('2d');
  const W = canvas.offsetWidth || 600;
  const H = 380;
  canvas.width = W;
  canvas.height = H;

  ctx.clearRect(0, 0, W, H);

  if (!allContacts.length) {
    ctx.fillStyle = 'rgba(255,255,255,0.15)';
    ctx.font = '14px DM Sans, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Add contacts to see the network graph', W / 2, H / 2);
    return;
  }

  // Position nodes in a circle layout
  const n = allContacts.length;
  const cx = W / 2, cy = H / 2;
  const r = Math.min(cx, cy) - 55;
  graphNodes = allContacts.map((c, i) => {
    const angle = (2 * Math.PI * i) / n - Math.PI / 2;
    return {
      id: c._id,
      name: c.name,
      x: cx + r * Math.cos(angle),
      y: cy + r * Math.sin(angle),
      relationships: c.relationships || [],
    };
  });

  // Build id → node map for edge drawing
  const nodeMap = {};
  for (const node of graphNodes) nodeMap[node.id] = node;

  // ── Draw edges ──
  for (const node of graphNodes) {
    for (const rel of node.relationships) {
      const target = nodeMap[rel.contactId];
      if (!target) continue;
      // Draw only once (check id order)
      if (node.id > rel.contactId) continue;

      ctx.save();
      ctx.beginPath();
      ctx.moveTo(node.x, node.y);
      ctx.lineTo(target.x, target.y);
      const edgeColors = { friend: '#7c6aff', work: '#2dd4bf', family: '#fb7185', other: '#888' };
      ctx.strokeStyle = (edgeColors[rel.type] || '#888') + '55';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.restore();
    }
  }

  // ── Draw nodes ──
  const palette = AVATAR_PALETTES;
  graphNodes.forEach((node, i) => {
    const [bg, fg] = palette[i % palette.length];
    // Glow
    ctx.save();
    ctx.shadowColor = fg;
    ctx.shadowBlur = 16;
    ctx.beginPath();
    ctx.arc(node.x, node.y, 18, 0, Math.PI * 2);
    ctx.fillStyle = bg + '33';
    ctx.fill();
    ctx.restore();

    // Circle
    ctx.beginPath();
    ctx.arc(node.x, node.y, 18, 0, Math.PI * 2);
    ctx.fillStyle = bg + '55';
    ctx.strokeStyle = fg;
    ctx.lineWidth = 1.5;
    ctx.fill();
    ctx.stroke();

    // Initials
    ctx.fillStyle = fg;
    ctx.font = `bold 11px Syne, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(
      node.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase(),
      node.x, node.y
    );

    // Name label below
    ctx.fillStyle = 'rgba(232,234,240,0.7)';
    ctx.font = '10px DM Sans, sans-serif';
    ctx.textBaseline = 'top';
    const label = node.name.split(' ')[0].slice(0, 10);
    ctx.fillText(label, node.x, node.y + 22);
  });
}

// Click a graph node → BFS network
document.getElementById('graphCanvas').addEventListener('click', async (e) => {
  const canvas = document.getElementById('graphCanvas');
  const rect = canvas.getBoundingClientRect();
  const mx = (e.clientX - rect.left) * (canvas.width / rect.width);
  const my = (e.clientY - rect.top) * (canvas.height / rect.height);

  for (const node of graphNodes) {
    const dx = mx - node.x, dy = my - node.y;
    if (Math.sqrt(dx * dx + dy * dy) <= 20) {
      await showNetwork(node.id, node.name);
      break;
    }
  }
});

async function showNetwork(id, name) {
  // Switch to graph tab if not already there
  if (currentTab !== 'graph') switchTab('graph');

  try {
    const data = await apiFetch(`${API}/${id}/network?depth=2`);
    const resultDiv = document.getElementById('graphResult');
    const listDiv = document.getElementById('graphResultList');
    document.getElementById('graphRootName').textContent = name;

    if (!data.network.length) {
      listDiv.innerHTML = '<p style="color:var(--text-muted);font-size:0.8rem;padding:10px 0">No connected contacts found. Add relationships to contacts!</p>';
    } else {
      listDiv.innerHTML = data.network.map(n => `
        <div class="network-item">
          <span class="network-depth">Hop ${n.depth}</span>
          <span style="flex:1">${escHtml(n.name || n.id)}</span>
          ${n.email ? `<span style="color:var(--text-muted);font-size:0.72rem">${escHtml(n.email)}</span>` : ''}
          <span class="network-type">${escHtml(n.type || 'other')}</span>
        </div>
      `).join('');
    }

    resultDiv.style.display = 'block';
  } catch (e) {
    showToast('Network fetch failed', 'error');
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// INIT
// ═════════════════════════════════════════════════════════════════════════════

window.addEventListener('load', loadContacts);

// Redraw graph on window resize
window.addEventListener('resize', () => {
  if (currentTab === 'graph') drawGraph();
});

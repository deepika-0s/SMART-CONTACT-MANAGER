# ◈ Smart Contact Manager — DSA-Powered

A full-stack contact management application that showcases **real-world Data Structures & Algorithms** — not just CRUD. Built with Node.js, Express, MongoDB, and a glassmorphism frontend.

---

## ✨ Features

| Feature | Description |
|---|---|
| **Add / Edit / Delete** contacts | Full CRUD with validation |
| **Trie prefix search** | Sub-millisecond name search |
| **LRU Cache** | Avoids redundant DB fetches |
| **Graph + BFS** | Map contact relationships & traverse networks |
| **Canvas Graph View** | Visual network diagram |
| **Glassmorphism UI** | Aurora dark theme, blur cards |

---

## 🛠 Tech Stack

- **Backend**: Node.js, Express 4, Mongoose 8
- **Database**: MongoDB
- **Frontend**: HTML5, CSS3 (Glassmorphism), Vanilla JS
- **DSA**: Trie, LRU Cache, Undirected Graph (all custom implementations)

---

## 📁 Project Structure

```
smart-contact-manager/
├── backend/
│   ├── server.js                   # Express entry point
│   ├── .env.example                # Environment variables template
│   ├── models/
│   │   └── Contact.js              # Mongoose schema
│   ├── routes/
│   │   └── contactRoutes.js        # REST routing (MVC)
│   ├── controllers/
│   │   └── contactController.js    # Business logic
│   └── utils/
│       ├── trie.js                 # Trie data structure
│       ├── lruCache.js             # LRU Cache
│       └── graph.js                # Adjacency-list Graph
└── frontend/
    ├── index.html                  # Single-page app shell
    ├── style.css                   # Glassmorphism styles
    └── script.js                   # CRUD + Graph canvas + Search
```

---

## 🚀 How to Run

### Prerequisites
- Node.js ≥ 18
- MongoDB running locally (`mongod`) **or** a MongoDB Atlas URI

### 1. Clone & Install

```bash
git clone https://github.com/your-username/smart-contact-manager.git
cd smart-contact-manager/backend
npm install
```

### 2. Configure Environment

```bash
cp .env.example .env
# Edit .env and set your MONGO_URI
```

`.env` file:
```
PORT=5000
MONGO_URI=mongodb://localhost:27017/smart-contact-manager
```

### 3. Start the Server

```bash
npm start
# or for hot-reload:
npm run dev
```

### 4. Open the App

Navigate to **http://localhost:5000** in your browser.

---

## 🔌 REST API Reference

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/contacts` | Create a contact |
| `GET` | `/api/contacts` | Get all contacts |
| `GET` | `/api/contacts/search?q=<prefix>` | Trie-based prefix search |
| `PUT` | `/api/contacts/:id` | Update a contact |
| `DELETE` | `/api/contacts/:id` | Delete a contact |
| `GET` | `/api/contacts/:id/network?depth=2` | BFS network traversal |
| `GET` | `/api/contacts/graph` | Full graph snapshot |

---

## 🧠 DSA Implementation Details

### 1. Trie (Prefix Tree) — `utils/trie.js`

**Problem solved**: Fast prefix-based name search.

**Why not `Array.filter()`?**  
A naive filter is `O(n × m)` — it scans every contact for every character of the query. With 10,000 contacts and a 5-character query, that's 50,000 comparisons per keystroke.

**How the Trie works**:
- Each node holds a `children` map (character → TrieNode) and a `contactIds` Set.
- On `insert("Alice", id)` — every prefix node (`a`, `al`, `ali`, `alic`, `alice`) stores Alice's ID.
- On `search("ali")` — traverse 3 nodes, return the `contactIds` Set in **O(m)** time.

```
search("ali") → O(3) → returns {aliceId, alison_id, …}
```

**Lifecycle**: The Trie is rebuilt from MongoDB on server start. Every create/update/delete keeps it in sync.

---

### 2. LRU Cache — `utils/lruCache.js`

**Problem solved**: Avoid redundant MongoDB round-trips for frequently accessed contacts.

**Implementation**: Uses JavaScript's `Map` (insertion-ordered). On `get`, the entry is deleted and reinserted to move it to the "most recently used" end. On eviction, `map.keys().next().value` gives the oldest key in O(1).

**Where it helps most**: The Trie search returns matching IDs, then we resolve them to full contact objects. If the same contacts are searched repeatedly, the LRU cache serves them without touching MongoDB.

```
Hit rate shown live in the search results header.
```

---

### 3. Graph (Adjacency List) — `utils/graph.js`

**Problem solved**: Model real-world relationships between contacts.

**Structure**: `Map<contactId, Map<neighborId, {type}>>` — an undirected weighted adjacency list.

**Algorithms**:

- **BFS** (`graph.bfs(startId, maxDepth)`): Finds all contacts reachable within N relationship hops. Useful for "who are all the work colleagues of this contact's friend?"
- **DFS** (`graph.dfs(startId)`): Finds the full connected cluster — all contacts in the same social circle.

**API**: Click any contact's `⌬` button (or click a node in the Canvas graph) to trigger a BFS traversal and see the network.

---

## 🎨 Design

- **Theme**: Aurora dark glassmorphism — blurred translucent cards over animated gradient orbs
- **Fonts**: Syne (headings) + DM Sans (body)
- **Canvas Graph**: Contact network drawn with the HTML5 Canvas API — nodes positioned in a circle, edges colour-coded by relationship type
- **Responsive**: Stacks to single-column on mobile

---

## 📸 Interview Talking Points

1. **Why Trie over a DB text index?** — Trie lives in-memory, no DB round-trip for prefix search; ideal for autocomplete latency.
2. **LRU eviction policy** — O(1) get & put using Map's insertion-order guarantee.
3. **Graph vs relational join** — Graph traversal (BFS) naturally expresses multi-hop relationships without recursive SQL joins.
4. **Singleton pattern** — All three DSA structures are singletons, shared across every request in the same Node.js process.
5. **Consistency** — Every create/update/delete mutates Trie, Cache, and Graph atomically so they never drift from the DB.

---

## 📄 License

MIT — free for personal and commercial use.

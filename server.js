
import express from 'express';
import Database from 'better-sqlite3';
import { nanoid } from 'nanoid';


const app = express();
const PORT = process.env.PORT || 3000;
app.use(express.json());
app.get('/', (req, res) => {
  res.send(`
<!DOCTYPE html>
<html>
<head>
  <title>Pastebin Lite</title>
  <style>
    body { font-family: Arial; padding: 30px; }
    textarea { width: 100%; height: 150px; }
    button { padding: 10px 20px; margin-top: 10px; }
  </style>
</head>
<body>
  <h2>Pastebin Lite</h2>

  <textarea id="content" placeholder="Enter text here..."></textarea><br>

  <label>TTL (seconds):</label>
  <input type="number" id="ttl"><br><br>

  <label>Max Views:</label>
  <input type="number" id="views"><br><br>

  <button onclick="createPaste()">Create Paste</button>

  <p id="result"></p>

  <script>
    async function createPaste() {
      const content = document.getElementById('content').value;
      const ttl = document.getElementById('ttl').value;
      const views = document.getElementById('views').value;

      const res = await fetch('/api/pastes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content,
          ttl_seconds: ttl ? Number(ttl) : undefined,
          max_views: views ? Number(views) : undefined
        })
      });

      const data = await res.json();
      document.getElementById('result').innerHTML =
        'Paste URL: <a href="' + data.url + '" target="_blank">' + data.url + '</a>';
    }
  </script>
</body>
</html>
  `);
});

const db = new Database('data.db');
db.prepare(`
CREATE TABLE IF NOT EXISTS pastes (
  id TEXT PRIMARY KEY,
  content TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  ttl_seconds INTEGER,
  max_views INTEGER,
  views INTEGER NOT NULL DEFAULT 0
);
`).run();

function nowMs(req) {
  if (process.env.TEST_MODE === '1' && req.headers['x-test-now-ms']) {
    return Number(req.headers['x-test-now-ms']);
  }
  return Date.now();
}

function isExpired(row, currentMs) {
  if (!row.ttl_seconds) return false;
  return currentMs >= row.created_at + row.ttl_seconds * 1000;
}

function isViewExceeded(row) {
  if (!row.max_views) return false;
  return row.views >= row.max_views;
}

// Health check
app.get('/api/healthz', (req, res) => {
  try {
    db.prepare('SELECT 1').get();
    res.json({ ok: true });
  } catch {
    res.status(500).json({ ok: false });
  }
});

// Create paste
app.post('/api/pastes', (req, res) => {
  const { content, ttl_seconds, max_views } = req.body || {};
  if (!content || typeof content !== 'string' || content.trim() === '') {
    return res.status(400).json({ error: 'content is required' });
  }
  if (ttl_seconds !== undefined && (!Number.isInteger(ttl_seconds) || ttl_seconds < 1)) {
    return res.status(400).json({ error: 'invalid ttl_seconds' });
  }
  if (max_views !== undefined && (!Number.isInteger(max_views) || max_views < 1)) {
    return res.status(400).json({ error: 'invalid max_views' });
  }
  const id = nanoid(8);
  db.prepare(`
    INSERT INTO pastes (id, content, created_at, ttl_seconds, max_views, views)
    VALUES (?, ?, ?, ?, ?, 0)
  `).run(id, content, nowMs(req), ttl_seconds ?? null, max_views ?? null);

  const baseUrl = `${req.protocol}://${req.get('host')}`;
  res.json({ id, url: `${baseUrl}/p/${id}` });
});

// Fetch paste (API)
app.get('/api/pastes/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM pastes WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'not found' });

  const currentMs = nowMs(req);
  if (isExpired(row, currentMs) || isViewExceeded(row)) {
    return res.status(404).json({ error: 'not found' });
  }

  db.prepare('UPDATE pastes SET views = views + 1 WHERE id = ?').run(row.id);
  const remaining_views = row.max_views ? Math.max(row.max_views - (row.views + 1), 0) : null;
  const expires_at = row.ttl_seconds
    ? new Date(row.created_at + row.ttl_seconds * 1000).toISOString()
    : null;

  res.json({ content: row.content, remaining_views, expires_at });
});

// View paste (HTML)
app.get('/p/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM pastes WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).send('Not found');

  const currentMs = nowMs(req);
  if (isExpired(row, currentMs) || isViewExceeded(row)) {
    return res.status(404).send('Not found');
  }

  db.prepare('UPDATE pastes SET views = views + 1 WHERE id = ?').run(row.id);

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(`<!doctype html>
<html><head><meta charset="utf-8"><title>Paste</title></head>
<body><pre>${row.content.replace(/[&<>]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]))}</pre></body></html>`);
});

app.listen(PORT, () => console.log(`Running on http://localhost:${PORT}`));

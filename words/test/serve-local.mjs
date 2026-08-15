#!/usr/bin/env node
// words — run the whole surface locally.
//
//   node words/test/serve-local.mjs [port]      # default 8787
//
// The real worker, the real migrations, node's SQLite standing in for D1, and
// the files served straight off the working tree. `wrangler dev` would be the
// obvious tool and it needs Cloudflare credentials this sandbox does not have;
// this needs nothing but node.
//
// It exists to test MULTIPLAYER without deploying: open two browsers at
// http://127.0.0.1:8787, start a game with two people in one, take the link in
// the other, and the turns, the compare-and-set and the redaction all behave
// exactly as they do in production, because it is the same worker.
//
// What it CANNOT do is deliver a real push — the endpoints belong to Google,
// Apple and Mozilla and a subscription made here would be for a service that
// cannot reach a localhost worker. Everything up to the send is exercised.

import { DatabaseSync } from 'node:sqlite';
import { createServer } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join, extname, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const PORT = Number(process.argv[2] || 8787);

const db = new DatabaseSync(':memory:');
for (const f of ['0035_words.sql', '0036_words_push.sql']) {
  db.exec(readFileSync(join(ROOT, '..', 'poll', 'apps', 'api', 'migrations', f), 'utf8'));
}

const statement = (sql, params = []) => ({
  bind: (...args) => statement(sql, args),
  first: () => db.prepare(sql).get(...params) ?? null,
  all: () => ({ results: db.prepare(sql).all(...params) }),
  run: () => {
    const r = db.prepare(sql).run(...params);
    return { meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) } };
  },
});

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json',
  '.webmanifest': 'application/manifest+json', '.png': 'image/png',
  '.dawg': 'application/octet-stream', '.txt': 'text/plain; charset=utf-8',
};

function fileFor(pathname) {
  const rel = normalize(decodeURIComponent(pathname)).replace(/^(\.\.[/\\])+/, '');
  const f = join(ROOT, rel === '/' ? 'index.html' : rel);
  return f.startsWith(ROOT) && existsSync(f) ? f : null;
}

const ASSETS = {
  async fetch(request) {
    const f = fileFor(new URL(request.url).pathname);
    if (!f) return new Response('not found', { status: 404 });
    return new Response(readFileSync(f), { headers: { 'content-type': TYPES[extname(f)] || 'application/octet-stream' } });
  },
};

const { default: worker } = await import('../worker.js');
const env = { DB: { prepare: (sql) => statement(sql), batch: async (st) => st.map((x) => x.run()) }, ASSETS };

createServer(async (req, res) => {
  const url = `http://127.0.0.1:${PORT}${req.url}`;
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const request = new Request(url, {
    method: req.method,
    headers: req.headers,
    body: chunks.length ? Buffer.concat(chunks) : undefined,
  });
  try {
    const out = await worker.fetch(request, env);
    res.writeHead(out.status, Object.fromEntries(out.headers));
    res.end(Buffer.from(await out.arrayBuffer()));
  } catch (e) {
    res.writeHead(500, { 'content-type': 'text/plain' });
    res.end(String(e?.stack || e));
  }
}).listen(PORT, '127.0.0.1', () => {
  console.log(`words running on http://127.0.0.1:${PORT} (in-memory database, nothing persists)`);
});

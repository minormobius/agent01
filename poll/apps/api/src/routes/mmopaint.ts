/**
 * MMOPaint routes.
 *
 *   GET  /api/mmo/canvases                            — list canvases
 *   GET  /api/mmo/canvases/:id                        — get canvas metadata + head
 *   GET  /api/mmo/canvases/:id/strokes?since=&limit=  — paginated stroke replay
 *   GET  /api/mmo/canvases/:id/audit                  — chain head + contributor counts
 *   GET  /api/mmo/canvases/:id/contributors           — whitelist (if any)
 *   POST /api/mmo/canvases                            — create canvas (auth)   [v2]
 *   POST /api/mmo/canvases/:id/contributors           — add to whitelist (owner)
 *   GET  /api/mmo/canvases/:id/ws?session=…           — WebSocket upgrade -> DO
 *
 * The hash chain: each stroke row records prev_hash (the previous
 * stroke's this_hash) and this_hash = SHA-256(
 *   prev_hash || "\n" || seq || "\n" || author_did || "\n" ||
 *   tool || "\n" || color || "\n" || size || "\n" || points_json
 * ). Anyone with the full stroke log can replay & verify.
 */

import type { Env } from '../index.js';
import { getSession } from './auth.js';

const VALID_TOOLS = new Set(['brush', 'eraser', 'fill']);

// Cached per-isolate so we only probe sqlite_master once after a cold start.
let mmoSchemaReady = false;

// Self-heal: bootstrap the mmo_* tables on first request if the SQL
// migration didn't land (the deploy-poll workflow masks D1 failures
// with `|| echo continuing`, so a failed migration goes unnoticed
// until the worker tries to query the table at runtime).
async function ensureMmoSchema(env: Env): Promise<void> {
  if (mmoSchemaReady) return;
  try {
    const probe = await env.DB.prepare(
      `SELECT name FROM sqlite_master WHERE type='table' AND name='mmo_canvases' LIMIT 1`
    ).first<{ name: string }>();
    if (probe && probe.name) {
      mmoSchemaReady = true;
      return;
    }
    console.log('[mmo] mmo_canvases missing — bootstrapping schema inline');
    await env.DB.batch([
      env.DB.prepare(`CREATE TABLE IF NOT EXISTS mmo_canvases (
        id TEXT PRIMARY KEY,
        owner_did TEXT NOT NULL,
        owner_handle TEXT NOT NULL,
        name TEXT NOT NULL,
        width INTEGER NOT NULL DEFAULT 1024,
        height INTEGER NOT NULL DEFAULT 1024,
        public_contribute INTEGER NOT NULL DEFAULT 1,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        head_seq INTEGER NOT NULL DEFAULT 0,
        head_hash TEXT,
        stroke_count INTEGER NOT NULL DEFAULT 0,
        contributor_count INTEGER NOT NULL DEFAULT 0,
        record_uri TEXT,
        record_cid TEXT
      )`),
      env.DB.prepare(`CREATE TABLE IF NOT EXISTS mmo_contributors (
        canvas_id TEXT NOT NULL,
        did TEXT NOT NULL,
        handle TEXT NOT NULL,
        added_at INTEGER NOT NULL,
        added_by_did TEXT NOT NULL,
        PRIMARY KEY (canvas_id, did)
      )`),
      env.DB.prepare(`CREATE TABLE IF NOT EXISTS mmo_strokes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        canvas_id TEXT NOT NULL,
        seq INTEGER NOT NULL,
        author_did TEXT NOT NULL,
        author_handle TEXT NOT NULL,
        tool TEXT NOT NULL,
        color TEXT NOT NULL,
        size INTEGER NOT NULL,
        points TEXT NOT NULL,
        prev_hash TEXT,
        this_hash TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        record_uri TEXT,
        record_cid TEXT
      )`),
      env.DB.prepare(`CREATE UNIQUE INDEX IF NOT EXISTS idx_mmo_strokes_canvas_seq
        ON mmo_strokes(canvas_id, seq)`),
      env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_mmo_strokes_canvas_created
        ON mmo_strokes(canvas_id, created_at DESC)`),
      env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_mmo_strokes_author
        ON mmo_strokes(author_did, created_at DESC)`),
      env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_mmo_canvases_owner
        ON mmo_canvases(owner_did)`),
      env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_mmo_canvases_updated
        ON mmo_canvases(updated_at DESC)`),
      env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_mmo_contributors_did
        ON mmo_contributors(did)`),
    ]);
    const now = Date.now();
    await env.DB.prepare(
      `INSERT OR IGNORE INTO mmo_canvases
         (id, owner_did, owner_handle, name, width, height,
          public_contribute, created_at, updated_at)
       VALUES ('global', 'did:plc:service', 'minomobi.com',
               'Global Canvas', 1024, 1024, 1, ?, ?)`
    ).bind(now, now).run();
    mmoSchemaReady = true;
    console.log('[mmo] schema bootstrapped + seed canvas inserted');
  } catch (e: any) {
    console.error('[mmo] ensureMmoSchema failed:', e?.message || e);
    // Don't cache the failure — next request can retry.
  }
}

export async function handleMmoRoutes(
  request: Request,
  env: Env,
  url: URL
): Promise<Response | null> {
  if (!url.pathname.startsWith('/api/mmo/')) return null;

  // Self-heal on first hit. Cheap once the cache is warm.
  await ensureMmoSchema(env);

  if (url.pathname === '/api/mmo/canvases' && request.method === 'GET') {
    return listCanvases(env);
  }
  if (url.pathname === '/api/mmo/canvases' && request.method === 'POST') {
    return createCanvas(request, env);
  }

  const m = url.pathname.match(/^\/api\/mmo\/canvases\/([^/]+)(?:\/(.+))?$/);
  if (!m) return null;
  const canvasId = decodeURIComponent(m[1]);
  const sub      = m[2] || '';

  if (!sub) {
    if (request.method === 'GET') return getCanvas(env, canvasId);
    return null;
  }
  if (sub === 'strokes' && request.method === 'GET')      return getStrokes(env, url, canvasId);
  if (sub === 'audit'   && request.method === 'GET')      return getAudit(env, canvasId);
  if (sub === 'ws-debug' && request.method === 'GET')     return wsDebug(env, url, canvasId);
  if (sub === 'contributors' && request.method === 'GET') return listContributors(env, canvasId);
  if (sub === 'contributors' && request.method === 'POST') return addContributor(request, env, canvasId);
  if (sub === 'ws') return upgradeWebSocket(request, env, url, canvasId);

  return null;
}

// ---- canvas CRUD ------------------------------------------------------

async function listCanvases(env: Env): Promise<Response> {
  const rows = await env.DB.prepare(
    `SELECT id, owner_did, owner_handle, name, width, height,
            public_contribute, head_seq, head_hash, stroke_count,
            contributor_count, created_at, updated_at
       FROM mmo_canvases
       ORDER BY updated_at DESC, created_at DESC LIMIT 50`
  ).all();
  return json({ canvases: rows.results || [] });
}

async function getCanvas(env: Env, id: string): Promise<Response> {
  const row = await env.DB.prepare(
    `SELECT id, owner_did, owner_handle, name, width, height,
            public_contribute, head_seq, head_hash, stroke_count,
            contributor_count, created_at, updated_at, record_uri, record_cid
       FROM mmo_canvases WHERE id = ?`
  ).bind(id).first();
  if (!row) return json({ error: 'not found' }, 404);
  return json(row);
}

async function createCanvas(request: Request, env: Env): Promise<Response> {
  const session = await getSession(request, env);
  if (!session) return json({ error: 'not authenticated' }, 401);

  let body: any;
  try { body = await request.json(); } catch { return json({ error: 'invalid body' }, 400); }
  const name   = String(body.name || '').trim().slice(0, 64);
  const w      = Math.max(64, Math.min(4096, Number(body.width)  || 1024));
  const h      = Math.max(64, Math.min(4096, Number(body.height) || 1024));
  const pubC   = body.public_contribute === false ? 0 : 1;
  if (!name) return json({ error: 'name is required' }, 400);

  const id = `c-${cryptoRandomId(10)}`;
  const now = Date.now();
  await env.DB.prepare(
    `INSERT INTO mmo_canvases (id, owner_did, owner_handle, name, width, height,
                               public_contribute, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(id, session.did, session.handle, name, w, h, pubC, now, now).run();

  return json({ id, name, width: w, height: h, public_contribute: pubC,
                owner_did: session.did, owner_handle: session.handle });
}

// ---- audit / replay ---------------------------------------------------

async function getStrokes(env: Env, url: URL, canvasId: string): Promise<Response> {
  const since = Math.max(0, parseInt(url.searchParams.get('since') || '0', 10) || 0);
  const limit = Math.min(2000, Math.max(1, parseInt(url.searchParams.get('limit') || '500', 10) || 500));

  const rows = await env.DB.prepare(
    `SELECT seq, author_did, author_handle, tool, color, size, points,
            prev_hash, this_hash AS hash, created_at
       FROM mmo_strokes
      WHERE canvas_id = ? AND seq > ?
      ORDER BY seq ASC LIMIT ?`
  ).bind(canvasId, since, limit).all();

  // Inflate points JSON for the client.
  const strokes = (rows.results || []).map((r: any) => ({
    ...r,
    points: safeParseArray(r.points),
  }));

  return json({ canvas_id: canvasId, since, count: strokes.length, strokes });
}

async function getAudit(env: Env, canvasId: string): Promise<Response> {
  const head = await env.DB.prepare(
    `SELECT head_seq, head_hash, stroke_count, contributor_count, updated_at, record_uri, record_cid
       FROM mmo_canvases WHERE id = ?`
  ).bind(canvasId).first();
  if (!head) return json({ error: 'not found' }, 404);

  const contribs = await env.DB.prepare(
    `SELECT author_did, author_handle, COUNT(*) AS n, MAX(created_at) AS last_at
       FROM mmo_strokes WHERE canvas_id = ?
       GROUP BY author_did ORDER BY n DESC LIMIT 50`
  ).bind(canvasId).all();

  return json({
    canvas_id: canvasId,
    head_seq: head.head_seq,
    head_hash: head.head_hash,
    stroke_count: head.stroke_count,
    contributors: contribs.results || [],
    published_to_pds: !!head.record_uri,
    record_uri: head.record_uri || null,
  });
}

async function listContributors(env: Env, canvasId: string): Promise<Response> {
  const rows = await env.DB.prepare(
    `SELECT did, handle, added_at, added_by_did
       FROM mmo_contributors WHERE canvas_id = ?
       ORDER BY added_at ASC`
  ).bind(canvasId).all();
  return json({ canvas_id: canvasId, contributors: rows.results || [] });
}

async function addContributor(request: Request, env: Env, canvasId: string): Promise<Response> {
  const session = await getSession(request, env);
  if (!session) return json({ error: 'not authenticated' }, 401);

  const canvas = await env.DB.prepare(
    `SELECT owner_did FROM mmo_canvases WHERE id = ?`
  ).bind(canvasId).first<{ owner_did: string }>();
  if (!canvas) return json({ error: 'not found' }, 404);
  if (canvas.owner_did !== session.did) return json({ error: 'only the owner can add contributors' }, 403);

  let body: any;
  try { body = await request.json(); } catch { return json({ error: 'invalid body' }, 400); }
  const did    = String(body.did    || '').trim();
  const handle = String(body.handle || '').trim().replace(/^@/, '');
  if (!did || !did.startsWith('did:')) return json({ error: 'did is required' }, 400);
  if (!handle)                          return json({ error: 'handle is required' }, 400);

  const now = Date.now();
  try {
    await env.DB.prepare(
      `INSERT INTO mmo_contributors (canvas_id, did, handle, added_at, added_by_did)
       VALUES (?, ?, ?, ?, ?)`
    ).bind(canvasId, did, handle, now, session.did).run();
    await env.DB.prepare(
      `UPDATE mmo_canvases SET contributor_count = contributor_count + 1, updated_at = ?
        WHERE id = ?`
    ).bind(now, canvasId).run();
  } catch (e: any) {
    return json({ error: 'already a contributor or db error', detail: e?.message }, 409);
  }
  return json({ ok: true, did, handle });
}

// ---- WebSocket upgrade ------------------------------------------------

// Mirror of the /ws upgrade's validation chain, but returns JSON instead
// of attempting to upgrade. Useful when the browser fails the WS
// handshake without telling us why.
async function wsDebug(env: Env, url: URL, canvasId: string): Promise<Response> {
  const out: Record<string, any> = { canvasId, ts: new Date().toISOString() };

  const sessionId = url.searchParams.get('session') || '';
  out.hasSession = !!sessionId;
  if (!sessionId) return json({ ...out, ok: false, reason: 'missing session' }, 400);

  try {
    const session = await env.DB.prepare(
      `SELECT did, handle FROM sessions
        WHERE session_id = ? AND expires_at > datetime('now') AND did != 'pending'`
    ).bind(sessionId).first<{ did: string; handle: string }>();
    out.sessionValid = !!session;
    if (!session) return json({ ...out, ok: false, reason: 'invalid or expired session' }, 401);
    out.did = session.did;
    out.handle = session.handle;

    const canvas = await env.DB.prepare(
      `SELECT id, owner_did, public_contribute, head_seq FROM mmo_canvases WHERE id = ?`
    ).bind(canvasId).first<any>();
    out.canvasExists = !!canvas;
    if (!canvas) return json({ ...out, ok: false, reason: 'canvas row missing — migration may not have applied' }, 404);
    out.public_contribute = canvas.public_contribute;
    out.head_seq = canvas.head_seq;

    let allowed = false;
    let why = '';
    if (canvas.public_contribute === 1) { allowed = true; why = 'public canvas'; }
    else if (canvas.owner_did === session.did) { allowed = true; why = 'owner'; }
    else {
      const contrib = await env.DB.prepare(
        `SELECT 1 FROM mmo_contributors WHERE canvas_id = ? AND did = ? LIMIT 1`
      ).bind(canvasId, session.did).first();
      allowed = !!contrib;
      why = allowed ? 'on whitelist' : 'not on whitelist';
    }
    out.contributorAllowed = allowed;
    out.contributorReason = why;
    if (!allowed) return json({ ...out, ok: false, reason: why }, 403);

    // Verify the DO binding exists. If migration v3 wasn't applied, the
    // binding lookup will throw — and the actual WS upgrade would have
    // failed for the same reason.
    try {
      const doNs: any = (env as any).MMO_CANVAS;
      if (!doNs || typeof doNs.idFromName !== 'function') {
        return json({ ...out, ok: false, reason: 'MMO_CANVAS DO binding missing — wrangler migration v3 not applied' }, 500);
      }
      const id = doNs.idFromName(canvasId);
      out.doId = id.toString();
      out.doBinding = 'ok';
    } catch (e: any) {
      return json({ ...out, ok: false, reason: 'DO binding error: ' + (e?.message || String(e)) }, 500);
    }

    return json({ ...out, ok: true, reason: 'all checks pass' });
  } catch (e: any) {
    return json({ ...out, ok: false, reason: 'unexpected error: ' + (e?.message || String(e)) }, 500);
  }
}

async function upgradeWebSocket(request: Request, env: Env, url: URL, canvasId: string): Promise<Response> {
  if (request.headers.get('Upgrade') !== 'websocket') {
    return new Response('expected websocket', { status: 426 });
  }
  // Light pre-checks so we don't spin up a DO for obviously-bad requests.
  // The DO does the full session/canvas resolution — we forward the
  // *original* Request unchanged because constructing a new Request with
  // a `headers` init silently strips the forbidden Upgrade / Connection
  // headers, which then breaks the WS handshake inside the DO.
  if (!url.searchParams.get('session')) {
    return new Response('missing session', { status: 401 });
  }
  const canvas = await env.DB.prepare(
    `SELECT id FROM mmo_canvases WHERE id = ?`
  ).bind(canvasId).first();
  if (!canvas) return new Response('canvas not found', { status: 404 });

  const id  = env.MMO_CANVAS.idFromName(canvasId);
  const obj = env.MMO_CANVAS.get(id);
  return obj.fetch(request);
}

// ---- utils ------------------------------------------------------------

function json(data: any, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
function safeParseArray(s: any): number[] {
  if (typeof s !== 'string') return [];
  try { const v = JSON.parse(s); return Array.isArray(v) ? v : []; } catch { return []; }
}
function cryptoRandomId(n: number): string {
  const bytes = new Uint8Array(n);
  crypto.getRandomValues(bytes);
  return [...bytes].map(b => b.toString(36).padStart(2, '0')).join('').slice(0, n);
}

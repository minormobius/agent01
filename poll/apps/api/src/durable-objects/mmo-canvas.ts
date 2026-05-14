/**
 * MmoCanvas — the per-canvas WebSocket coordinator.
 *
 * One DO instance per canvas id. Holds the active WebSocket set,
 * assigns monotone sequence numbers to incoming strokes, computes the
 * hash chain link, persists strokes to D1, and broadcasts to all
 * connected painters.
 *
 * State that persists across DO eviction lives in D1 (mmo_canvases.head_seq
 * and head_hash). DO storage is only used for the in-memory live socket
 * set, which doesn't need to survive an eviction.
 */

import type { Env } from '../index.js';

// Per-DID rate limit. Keeps a single user from flooding the canvas.
const STROKE_BURST_LIMIT = 24;       // max strokes in a 4s sliding window
const STROKE_BURST_WINDOW_MS = 4000;
const MAX_POINTS_PER_STROKE = 600;   // hard cap on stroke length

const VALID_TOOLS = new Set(["brush", "eraser", "fill"]);

interface SocketMeta {
  ws: WebSocket;
  did: string;
  handle: string;
  canvasId: string;
  recentTs: number[];   // for sliding-window rate limit
}

export class MmoCanvas {
  state: DurableObjectState;
  env: Env;
  sockets = new Set<SocketMeta>();
  // Mirror of mmo_canvases head row. Lazy-loaded.
  headSeq = 0;
  headHash: string | null = null;
  canvasId: string | null = null;
  canvasMeta: any = null;
  loaded = false;
  loadingPromise: Promise<void> | null = null;

  constructor(state: DurableObjectState, env: Env) {
    this.state = state;
    this.env = env;
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const upgrade = request.headers.get('Upgrade');
    if (upgrade !== 'websocket') {
      return new Response('expected WebSocket', { status: 426 });
    }

    const canvasId = request.headers.get('X-Canvas-Id') || '';
    const did      = request.headers.get('X-Session-Did') || '';
    const handle   = request.headers.get('X-Session-Handle') || '';
    if (!canvasId || !did) {
      return new Response('missing session/canvas headers', { status: 400 });
    }
    this.canvasId = canvasId;

    await this.loadCanvas();
    if (!this.canvasMeta) {
      return new Response('canvas not found', { status: 404 });
    }

    // Authorization check: owner OR public_contribute OR whitelist entry.
    const allowed = await this.isContributorAllowed(did);
    if (!allowed) {
      return new Response('not whitelisted', { status: 403 });
    }

    const pair = new WebSocketPair();
    const [client, server] = [pair[0], pair[1]];
    this.acceptSocket(server, did, handle, canvasId);

    return new Response(null, { status: 101, webSocket: client });
  }

  async loadCanvas(): Promise<void> {
    if (this.loaded) return;
    if (this.loadingPromise) return this.loadingPromise;
    this.loadingPromise = (async () => {
      const row = await this.env.DB.prepare(
        `SELECT id, owner_did, owner_handle, name, width, height,
                public_contribute, head_seq, head_hash, stroke_count
         FROM mmo_canvases WHERE id = ?`
      ).bind(this.canvasId).first<any>();
      if (row) {
        this.canvasMeta = row;
        this.headSeq    = Number(row.head_seq) || 0;
        this.headHash   = row.head_hash || null;
      }
      this.loaded = true;
    })();
    return this.loadingPromise;
  }

  async isContributorAllowed(did: string): Promise<boolean> {
    if (!this.canvasMeta) return false;
    if (this.canvasMeta.public_contribute === 1) return true;
    if (this.canvasMeta.owner_did === did) return true;
    const row = await this.env.DB.prepare(
      `SELECT 1 FROM mmo_contributors WHERE canvas_id = ? AND did = ? LIMIT 1`
    ).bind(this.canvasId, did).first();
    return !!row;
  }

  acceptSocket(ws: WebSocket, did: string, handle: string, canvasId: string) {
    (ws as any).accept();
    const meta: SocketMeta = { ws, did, handle, canvasId, recentTs: [] };
    this.sockets.add(meta);

    ws.addEventListener('message', async (event) => {
      let msg: any;
      try { msg = JSON.parse(typeof event.data === 'string' ? event.data : ''); }
      catch { return this.sendError(ws, 'bad-json'); }

      if (!msg || typeof msg !== 'object') return;
      switch (msg.type) {
        case 'hello':    return this.handleHello(meta, msg);
        case 'stroke':   return this.handleStroke(meta, msg);
        case 'ping':     return this.sendJson(ws, { type: 'pong', t: Date.now() });
        default:         return this.sendError(ws, 'unknown-type');
      }
    });

    ws.addEventListener('close', () => { this.sockets.delete(meta); this.broadcastPresence(); });
    ws.addEventListener('error', () => { this.sockets.delete(meta); this.broadcastPresence(); });

    // Greet with current head + presence so the new joiner can start their replay.
    this.sendJson(ws, {
      type: 'welcome',
      canvasId,
      did, handle,
      head_seq: this.headSeq,
      head_hash: this.headHash,
      width: this.canvasMeta?.width || 1024,
      height: this.canvasMeta?.height || 1024,
      connected: this.sockets.size,
    });
    this.broadcastPresence();
  }

  handleHello(_meta: SocketMeta, _msg: any) {
    // Reserved for future client capability negotiation; the welcome
    // frame is already sent on connect.
  }

  async handleStroke(meta: SocketMeta, msg: any) {
    // Rate limit (sliding window).
    const now = Date.now();
    meta.recentTs = meta.recentTs.filter(t => now - t < STROKE_BURST_WINDOW_MS);
    if (meta.recentTs.length >= STROKE_BURST_LIMIT) {
      return this.sendError(meta.ws, 'rate-limited');
    }
    meta.recentTs.push(now);

    // Validate.
    const tool   = String(msg.tool || '');
    const color  = String(msg.color || '');
    const size   = Number(msg.size);
    const points = Array.isArray(msg.points) ? msg.points : null;
    if (!VALID_TOOLS.has(tool))                         return this.sendError(meta.ws, 'bad-tool');
    if (!/^#[0-9a-fA-F]{6}$/.test(color))               return this.sendError(meta.ws, 'bad-color');
    if (!Number.isInteger(size) || size < 1 || size > 80) return this.sendError(meta.ws, 'bad-size');
    if (!points || points.length < 2 || points.length % 2 !== 0) return this.sendError(meta.ws, 'bad-points');
    if (points.length / 2 > MAX_POINTS_PER_STROKE)      return this.sendError(meta.ws, 'too-many-points');

    const w = this.canvasMeta?.width  || 1024;
    const h = this.canvasMeta?.height || 1024;
    for (let i = 0; i < points.length; i++) {
      const v = points[i];
      if (typeof v !== 'number' || !isFinite(v))        return this.sendError(meta.ws, 'bad-point');
      const max = (i % 2 === 0 ? w : h) + 16;
      if (v < -16 || v > max)                            return this.sendError(meta.ws, 'out-of-bounds');
    }

    // Quantize to integers to keep the JSON payload small and the hash
    // stable across clients with slightly different float precision.
    const intPoints: number[] = points.map((v: number) => Math.round(v));
    const pointsJson = JSON.stringify(intPoints);

    // Assign seq + hash.
    const seq = this.headSeq + 1;
    const prevHash = this.headHash;
    const thisHash = await sha256Hex(
      [prevHash || '', String(seq), meta.did, tool, color.toLowerCase(), String(size), pointsJson].join('\n')
    );

    // Persist + update head atomically (best effort; D1 doesn't expose
    // transactions across statements at runtime, so do two writes).
    try {
      await this.env.DB.batch([
        this.env.DB.prepare(
          `INSERT INTO mmo_strokes
             (canvas_id, seq, author_did, author_handle, tool, color, size, points, prev_hash, this_hash, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).bind(meta.canvasId, seq, meta.did, meta.handle, tool, color.toLowerCase(), size,
               pointsJson, prevHash, thisHash, now),
        this.env.DB.prepare(
          `UPDATE mmo_canvases
              SET head_seq = ?, head_hash = ?, stroke_count = stroke_count + 1, updated_at = ?
            WHERE id = ?`
        ).bind(seq, thisHash, now, meta.canvasId),
      ]);
    } catch (e: any) {
      console.error('[mmo] stroke write failed:', e?.message);
      return this.sendError(meta.ws, 'write-failed');
    }

    this.headSeq  = seq;
    this.headHash = thisHash;

    // Broadcast to everyone connected, including the author so they
    // get the assigned seq + hash for their local optimistic stroke.
    this.broadcast({
      type: 'stroke',
      seq,
      author_did:    meta.did,
      author_handle: meta.handle,
      tool, color: color.toLowerCase(), size,
      points: intPoints,
      prev_hash: prevHash,
      hash: thisHash,
      created_at: now,
    });
  }

  broadcast(obj: any) {
    const json = JSON.stringify(obj);
    for (const m of this.sockets) {
      try { m.ws.send(json); }
      catch { /* dead socket; will be cleaned up on close */ }
    }
  }
  broadcastPresence() {
    const handles = new Set<string>();
    for (const m of this.sockets) handles.add(m.handle);
    this.broadcast({ type: 'presence', connected: this.sockets.size, handles: [...handles] });
  }
  sendJson(ws: WebSocket, obj: any) {
    try { ws.send(JSON.stringify(obj)); } catch {}
  }
  sendError(ws: WebSocket, code: string) {
    this.sendJson(ws, { type: 'error', code });
  }
}

async function sha256Hex(input: string): Promise<string> {
  const enc = new TextEncoder().encode(input);
  const buf = await crypto.subtle.digest('SHA-256', enc);
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}

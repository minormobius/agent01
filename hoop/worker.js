// hoop worker — static assets + the HoopRoom presence Durable Object.
//
// Two tiers of state (see /mmo for the precedent):
//   • HOT / ephemeral  → this DO. Live player positions + who's online, held in
//     memory, broadcast over WebSockets. Nothing persists; disconnect = you fade
//     from the map. This is what makes "I see you on the map, you see me" work.
//   • COLD / durable   → ATProto lexicons (com.minomobi.hoop.place / .message),
//     written to each user's PDS. Presence is deliberately NOT a lexicon: you
//     can't write a permanent firehose record on every footstep.

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // Live presence socket — one global room for the whole world.
    if (url.pathname === '/ws') {
      const id = env.HOOP_ROOM.idFromName('world');
      return env.HOOP_ROOM.get(id).fetch(request);
    }

    if (url.pathname === '/api/presence/health') {
      return new Response(JSON.stringify({ ok: true, service: 'hoop' }), {
        headers: { 'content-type': 'application/json' },
      });
    }

    return env.ASSETS.fetch(request);
  },
};

// ── HoopRoom: the per-world WebSocket coordinator ──────────────────────────
// Identity is borrowed from the shared auth worker: the browser carries an
// opaque session token (mino_auth_session) which we pass as ?session=… and
// validate against auth.mino.mobi/api/me. The .mino.mobi SSO cookie is also
// forwarded as a fallback, so a session minted on another mino.mobi site works.
export class HoopRoom {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    this.sockets = new Set(); // { ws, did, handle, x, y }
  }

  async fetch(request) {
    const url = new URL(request.url);
    if (request.headers.get('Upgrade') !== 'websocket') {
      return new Response('expected WebSocket', { status: 426 });
    }
    const id = await this.validate(request, url);
    if (!id) return new Response('unauthorized', { status: 401 });

    const pair = new WebSocketPair();
    const [client, server] = [pair[0], pair[1]];
    this.accept(server, id);
    return new Response(null, { status: 101, webSocket: client });
  }

  async validate(request, url) {
    try {
      const token = url.searchParams.get('session');
      const cookie = request.headers.get('Cookie');
      if (!token && !cookie) return null;
      const headers = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;
      if (cookie) headers['Cookie'] = cookie;
      const r = await fetch('https://auth.mino.mobi/api/me', { headers });
      if (!r.ok) return null;
      const u = await r.json();
      if (!u || !u.did) return null;
      return { did: u.did, handle: u.handle || u.did };
    } catch {
      return null;
    }
  }

  accept(ws, id) {
    ws.accept();
    const meta = { ws, did: id.did, handle: id.handle, x: 24, y: 14 };
    this.sockets.add(meta);

    ws.addEventListener('message', (e) => this.onMessage(meta, e));
    const cleanup = () => {
      if (this.sockets.delete(meta)) this.broadcast({ type: 'leave', did: meta.did }, meta);
    };
    ws.addEventListener('close', cleanup);
    ws.addEventListener('error', cleanup);

    // Greet the joiner with everyone currently here.
    this.send(ws, { type: 'welcome', self: { did: meta.did, handle: meta.handle }, peers: this.peers(meta) });
  }

  onMessage(meta, e) {
    let msg;
    try { msg = JSON.parse(typeof e.data === 'string' ? e.data : ''); } catch { return; }
    if (!msg || typeof msg !== 'object') return;

    if (msg.type === 'hello' || msg.type === 'move') {
      if (Number.isFinite(msg.x) && Number.isFinite(msg.y)) {
        meta.x = msg.x | 0;
        meta.y = msg.y | 0;
      }
      // First position announcement is a 'join' for peers; subsequent are 'move'.
      this.broadcast(
        { type: msg.type === 'hello' ? 'join' : 'move', did: meta.did, handle: meta.handle, x: meta.x, y: meta.y },
        meta
      );
    } else if (msg.type === 'emote') {
      // Ephemeral speech bubble over a node — transient, never persisted.
      this.broadcast(
        { type: 'emote', did: meta.did, handle: meta.handle, placeId: String(msg.placeId || ''), text: String(msg.text || '').slice(0, 280) },
        null
      );
    } else if (msg.type === 'ping') {
      this.send(meta.ws, { type: 'pong' });
    }
  }

  peers(exclude) {
    const out = [];
    for (const m of this.sockets) if (m !== exclude) out.push({ did: m.did, handle: m.handle, x: m.x, y: m.y });
    return out;
  }

  broadcast(obj, exclude) {
    const s = JSON.stringify(obj);
    for (const m of this.sockets) {
      if (m === exclude) continue;
      try { m.ws.send(s); } catch { /* drop */ }
    }
  }

  send(ws, obj) {
    try { ws.send(JSON.stringify(obj)); } catch { /* drop */ }
  }
}

// ── ar.mino.mobi — Worker entry ──────────────────────────────
// Serves the static AR app (public/) and hosts a Durable Object that
// relays signaling/state between the two paired phones over WebSocket.
//
// Transport choice (rev 1): a WebSocket *relay* through one Durable
// Object per room code — not WebRTC. Orientation/spot payloads are tiny
// (a few KB at ~15 Hz), DOs are the natural single-point coordinator,
// and this sidesteps STUN/TURN/NAT entirely. WebRTC P2P can come later.

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const m = url.pathname.match(/^\/api\/room\/([A-Za-z0-9_-]{1,32})$/);
    if (m) {
      if (request.headers.get('Upgrade') !== 'websocket') {
        return new Response('expected websocket', { status: 426 });
      }
      const id = env.SIGNAL.idFromName(m[1].toUpperCase());
      return env.SIGNAL.get(id).fetch(request);
    }
    if (url.pathname === '/api/queue') {
      if (request.headers.get('Upgrade') !== 'websocket') {
        return new Response('expected websocket', { status: 426 });
      }
      // one global lobby coordinates all matchmaking
      const id = env.LOBBY.idFromName('lobby');
      return env.LOBBY.get(id).fetch(request);
    }
    if (url.pathname === '/api/health') {
      return new Response(JSON.stringify({ ok: true, ts: Date.now() }), {
        headers: { 'content-type': 'application/json' },
      });
    }
    // everything else → static assets
    return env.ASSETS.fetch(request);
  },
};

function roomCode() {
  const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = ''; for (let i = 0; i < 4; i++) s += A[(Math.random() * A.length) | 0];
  return s;
}

// ── Room: relays JSON messages between the peers in one room ──
// Uses the WebSocket Hibernation API so the DO can sleep between bursts.
export class Room {
  constructor(ctx, env) {
    this.ctx = ctx;
    this.env = env;
  }

  async fetch(request) {
    const pair = new WebSocketPair();
    const client = pair[0], server = pair[1];
    const role = new URL(request.url).searchParams.get('role') || '?';
    // tag the socket so we can enumerate roles after hibernation
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({ role });
    this.broadcastPeers();
    return new Response(null, { status: 101, webSocket: client });
  }

  peerList() {
    return this.ctx.getWebSockets().map(ws => {
      const a = ws.deserializeAttachment() || {};
      return a.role || '?';
    });
  }

  broadcastPeers() {
    const roles = this.peerList();
    const msg = JSON.stringify({ type: 'peers', count: roles.length, roles });
    for (const ws of this.ctx.getWebSockets()) {
      try { ws.send(msg); } catch {}
    }
  }

  async webSocketMessage(ws, raw) {
    if (typeof raw !== 'string') return;
    // 'hello' carries the role; record it then announce presence
    if (raw.length < 200) {
      try {
        const m = JSON.parse(raw);
        if (m && m.type === 'hello' && m.role) {
          ws.serializeAttachment({ role: m.role });
          this.broadcastPeers();
          return;
        }
      } catch {}
    }
    // relay everything else to the OTHER peer(s)
    for (const other of this.ctx.getWebSockets()) {
      if (other === ws) continue;
      try { other.send(raw); } catch {}
    }
  }

  async webSocketClose(ws) {
    try { ws.close(); } catch {}
    this.broadcastPeers();
  }

  async webSocketError(ws) {
    this.broadcastPeers();
  }
}

// ── Lobby: matchmaking — pairs waiting players, assigns roles ──
// A singleton DO. Players open a WebSocket and send {type:'join'}; when
// two are waiting it mints a room code, randomly assigns crystal/detector,
// and tells each peer {type:'matched', room, role}. They then close this
// socket and connect to that Room.
export class Lobby {
  constructor(ctx, env) { this.ctx = ctx; this.env = env; }

  async fetch(request) {
    const pair = new WebSocketPair();
    const client = pair[0], server = pair[1];
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({ state: 'idle' });
    return new Response(null, { status: 101, webSocket: client });
  }

  waiting() {
    return this.ctx.getWebSockets().filter(ws => {
      const a = ws.deserializeAttachment() || {};
      return ws.readyState === 1 && a.state === 'waiting';
    });
  }

  announce() {
    const n = this.waiting().length;
    const msg = JSON.stringify({ type: 'queue', waiting: n });
    for (const ws of this.waiting()) { try { ws.send(msg); } catch {} }
  }

  tryMatch() {
    const w = this.waiting();
    while (w.length >= 2) {
      const a = w.shift(), b = w.shift();
      const room = roomCode();
      const aCrystal = Math.random() < 0.5;
      a.serializeAttachment({ state: 'matched' });
      b.serializeAttachment({ state: 'matched' });
      try { a.send(JSON.stringify({ type: 'matched', room, role: aCrystal ? 'emitter' : 'detector' })); } catch {}
      try { b.send(JSON.stringify({ type: 'matched', room, role: aCrystal ? 'detector' : 'emitter' })); } catch {}
    }
  }

  async webSocketMessage(ws, raw) {
    if (typeof raw !== 'string') return;
    let m; try { m = JSON.parse(raw); } catch { return; }
    if (m.type === 'join') {
      ws.serializeAttachment({ state: 'waiting' });
      this.tryMatch();
      this.announce();
    } else if (m.type === 'leave') {
      ws.serializeAttachment({ state: 'idle' });
      this.announce();
    }
  }

  async webSocketClose(ws) { try { ws.close(); } catch {} this.announce(); }
  async webSocketError() { this.announce(); }
}

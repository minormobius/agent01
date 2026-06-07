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
    if (url.pathname === '/api/health') {
      return new Response(JSON.stringify({ ok: true, ts: Date.now() }), {
        headers: { 'content-type': 'application/json' },
      });
    }
    // everything else → static assets
    return env.ASSETS.fetch(request);
  },
};

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

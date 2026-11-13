// HYPERBALL's room: one Durable Object per room code, carrying sockets for js/room-core.js, which is the whole game.
// Not the hibernation API: the room ticks (a 60 Hz interval stepping the 120 Hz physics) while anyone is connected,
// and stops ticking when the last one leaves. A room keeps nothing: when everyone has gone it is just a code again.
//
// Joining: the page opens wss://hyperball.mino.mobi/api/rooms/CODE/ws and sends { t: 'hi', token, team } first.
// A token (auth.mino.mobi's bearer, from AuthClient.getToken()) is checked with GET auth.mino.mobi/api/me, which
// gives the DID and handle; no token or a bad one is a guest. The token goes in the message, not the URL, so it
// stays out of logs.
import { RoomCore } from './js/room-core.js';

const AUTH = 'https://auth.mino.mobi';
export async function whoIs(token, f = (...a) => fetch(...a)) {
  if (!token || typeof token !== 'string' || token.length > 4096) return null;
  try {
    const r = await f(`${AUTH}/api/me`, { headers: { authorization: `Bearer ${token}` } });
    if (!r.ok) return null;
    const me = await r.json();
    return me && typeof me.did === 'string' ? { did: me.did, handle: me.handle || null } : null;
  } catch { return null; }
}

export class HyperballRoom {
  constructor(state, env) {
    this.state = state; this.env = env;
    this.sockets = new Map();      // id → WebSocket
    this.core = null; this.timer = null; this.lastT = 0; this.n = 0;
  }
  ensure(code) {
    if (!this.core) this.core = new RoomCore(code, { send: (id, m) => this.send(id, m) });
    return this.core;
  }
  send(id, m) {
    const ws = this.sockets.get(id);
    if (!ws) return;
    try { ws.send(JSON.stringify(m)); } catch { this.drop(id); }
  }
  async fetch(request) {
    if (request.headers.get('upgrade') !== 'websocket') return new Response('a websocket, please', { status: 426 });
    const code = new URL(request.url).pathname.split('/')[3];
    const core = this.ensure(code);
    if (core.conns.size >= 12) return new Response('room full', { status: 503 });
    const pair = new WebSocketPair(), client = pair[0], ws = pair[1];
    ws.accept();
    const id = `c${Date.now().toString(36)}${(++this.n).toString(36)}`;
    let joined = false;
    ws.addEventListener('message', async (ev) => {
      let m; try { m = JSON.parse(ev.data); } catch { return; }
      if (!joined) {
        if (!m || m.t !== 'hi') return;
        joined = true;
        const who = (await whoIs(m.token)) || {};
        if (ws.readyState > 1) return;
        this.sockets.set(id, ws);
        core.join(id, { ...who, team: m.team === 'orange' ? 'orange' : m.team === 'cyan' ? 'cyan' : null });
        this.run();
        return;
      }
      if (m.t === 'ping') { this.send(id, { t: 'pong', c: m.c }); return; }
      core.message(id, m);
    });
    const bye = () => this.drop(id);
    ws.addEventListener('close', bye); ws.addEventListener('error', bye);
    return new Response(null, { status: 101, webSocket: client });
  }
  drop(id) {
    if (!this.sockets.has(id)) return;
    const ws = this.sockets.get(id); this.sockets.delete(id);
    try { ws.close(1000, 'bye'); } catch {}
    this.core.leave(id);
    if (this.core.empty) { clearInterval(this.timer); this.timer = null; this.core = null; }
  }
  run() {
    if (this.timer) return;
    this.lastT = Date.now();
    this.timer = setInterval(() => {
      const t = Date.now(), dt = (t - this.lastT) / 1000; this.lastT = t;
      if (this.core) this.core.tick(dt);
    }, 1000 / 60);
  }
}

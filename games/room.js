// RoomCoordinator — one Durable Object per 4-char room code.
//
// Holds:
//   - compiled game (immutable after create)
//   - players map (did -> { handle, score })
//   - phase + phaseState
//   - host did + whitelist
//
// Sockets are hibernation-friendly: metadata attached via serializeAttachment.
// Per-socket roles are 'tv' (read-only) or 'phone' (player).

import { getTemplate } from './engine/runtime.js';

const AUTH_BASE = 'https://auth.mino.mobi';

async function validateBearer(token) {
  if (!token) return null;
  try {
    const res = await fetch(`${AUTH_BASE}/api/me`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;
    return await res.json(); // { did, handle, scope }
  } catch {
    return null;
  }
}

export class RoomCoordinator {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    this._loaded = false;
  }

  async load() {
    if (this._loaded) return;
    const store = this.state.storage;
    this.code = await store.get('code');
    this.gameId = await store.get('gameId');
    this.game = await store.get('game');
    this.players = (await store.get('players')) || {};
    this.phase = (await store.get('phase')) || 'lobby';
    this.phaseState = (await store.get('phaseState')) || {};
    this.runState = (await store.get('runState')) || {};
    this.hostDid = await store.get('hostDid');
    this.whitelist = (await store.get('whitelist')) || { mode: 'open', dids: [], handles: [] };
    this._loaded = true;
  }

  async persist() {
    await this.state.storage.put({
      players: this.players,
      phase: this.phase,
      phaseState: this.phaseState,
      runState: this.runState,
      hostDid: this.hostDid,
      whitelist: this.whitelist,
    });
  }

  // -------- HTTP entry points (from worker) --------

  async fetch(request) {
    const url = new URL(request.url);
    await this.load();

    if (url.pathname === '/create' && request.method === 'POST') {
      if (this.game) {
        return new Response(JSON.stringify({ error: 'room exists' }), { status: 409 });
      }
      const body = await request.json();
      this.code = body.code;
      this.gameId = body.gameId;
      this.game = body.game;
      this.phase = 'lobby';
      this.runState = {};
      this.players = {};
      this.whitelist = { mode: 'open', dids: [], handles: [] };
      await this.state.storage.put({
        code: this.code,
        gameId: this.gameId,
        game: this.game,
        phase: this.phase,
        runState: this.runState,
        players: this.players,
        whitelist: this.whitelist,
      });
      return new Response(JSON.stringify({ ok: true, code: this.code }), {
        headers: { 'content-type': 'application/json' },
      });
    }

    if (url.pathname === '/snapshot') {
      if (!this.game) return new Response('not found', { status: 404 });
      return new Response(JSON.stringify(this.snapshotPublic()), {
        headers: { 'content-type': 'application/json' },
      });
    }

    // Websocket upgrade.
    if (request.headers.get('Upgrade') === 'websocket') {
      return this.handleUpgrade(request);
    }

    return new Response('not found', { status: 404 });
  }

  async handleUpgrade(request) {
    if (!this.game) return new Response('room not initialized', { status: 404 });
    const url = new URL(request.url);
    const role = url.searchParams.get('role') === 'tv' ? 'tv' : 'phone';
    const sid = url.searchParams.get('sid');

    let did = null;
    let handle = null;
    if (role === 'phone') {
      const me = await validateBearer(sid);
      if (!me) return new Response('auth required', { status: 401 });
      did = me.did;
      handle = me.handle;
      // Whitelist check.
      if (!this.canJoin(did, handle)) {
        return new Response('not on whitelist', { status: 403 });
      }
      // First phone player becomes host.
      if (!this.hostDid) {
        this.hostDid = did;
        await this.state.storage.put('hostDid', did);
      }
      // Register player.
      if (!this.players[did]) {
        this.players[did] = { handle, score: 0 };
        await this.state.storage.put('players', this.players);
        this.broadcastStateLater();
      }
    }

    const pair = new WebSocketPair();
    const [client, server] = [pair[0], pair[1]];
    this.state.acceptWebSocket(server);
    server.serializeAttachment({ role, did, handle });

    // Send hello immediately with the snapshot.
    try {
      server.send(JSON.stringify({
        type: 'hello',
        role,
        you: did ? { did, handle, isHost: did === this.hostDid } : null,
        snapshot: this.snapshotPublic(),
        playerView: did ? this.snapshotPlayer(did) : null,
      }));
    } catch {}

    return new Response(null, { status: 101, webSocket: client });
  }

  canJoin(did, handle) {
    const wl = this.whitelist || { mode: 'open' };
    if (wl.mode === 'open') return true;
    if (wl.mode === 'list') {
      return wl.dids.includes(did) || wl.handles.includes(handle) || did === this.hostDid;
    }
    return true;
  }

  // -------- WebSocket message handling (called by runtime) --------

  async webSocketMessage(ws, message) {
    await this.load();
    let msg;
    try { msg = JSON.parse(message); } catch { return; }
    const att = ws.deserializeAttachment() || {};

    if (att.role === 'tv') {
      // TV is read-only; ignore writes.
      return;
    }

    const player = { did: att.did, handle: att.handle };
    if (!player.did) return;

    // Host control messages.
    if (msg.type === 'host:start' && player.did === this.hostDid) {
      if (this.phase !== 'lobby') return;
      const minPlayers = this.game.minPlayers || 2;
      if (Object.keys(this.players).length < minPlayers) {
        ws.send(JSON.stringify({ type: 'error', message: `Need ${minPlayers}+ players` }));
        return;
      }
      await this.transition('prompt');
      return;
    }
    if (msg.type === 'host:next' && player.did === this.hostDid) {
      const t = getTemplate(this.game.template);
      const next = t.nextPhase(this.phase, this.buildCtx());
      if (next) await this.transition(next);
      return;
    }
    if (msg.type === 'host:reset' && player.did === this.hostDid) {
      this.players = Object.fromEntries(
        Object.entries(this.players).map(([d, p]) => [d, { ...p, score: 0 }])
      );
      this.runState = {};
      await this.transition('lobby');
      return;
    }
    if (msg.type === 'host:whitelist' && player.did === this.hostDid) {
      this.whitelist = {
        mode: msg.mode || 'open',
        dids: Array.isArray(msg.dids) ? msg.dids : [],
        handles: Array.isArray(msg.handles) ? msg.handles : [],
      };
      await this.state.storage.put('whitelist', this.whitelist);
      this.broadcastState();
      return;
    }

    // Game messages — delegated to the template.
    const t = getTemplate(this.game.template);
    const ctx = this.buildCtx();
    let transitionedTo = null;
    ctx.transition = (next) => { transitionedTo = next; };
    t.onMessage(this.phase, msg, player, ctx);
    this.phaseState = ctx.phaseState;
    this.runState = ctx.state;
    await this.persist();
    if (transitionedTo) {
      await this.transition(transitionedTo);
    } else {
      this.broadcastState();
    }
  }

  async webSocketClose(ws) {
    // Keep player in the room across disconnects (Jackbox behavior).
    // Eviction is host-driven only.
  }

  // -------- Phase / broadcast helpers --------

  buildCtx() {
    return {
      game: this.game,
      players: this.players,
      state: this.runState,
      phaseState: this.phaseState,
    };
  }

  async transition(nextPhase) {
    const t = getTemplate(this.game.template);
    this.phase = nextPhase;
    const ctx = this.buildCtx();
    t.enterPhase(nextPhase, ctx);
    this.phaseState = ctx.phaseState;
    this.runState = ctx.state || this.runState;
    await this.persist();
    this.broadcastState();
  }

  broadcastStateLater() {
    // Debounce broadcasts triggered during synchronous setup.
    queueMicrotask(() => this.broadcastState());
  }

  broadcastState() {
    const pub = this.snapshotPublic();
    for (const ws of this.state.getWebSockets()) {
      const att = ws.deserializeAttachment() || {};
      try {
        if (att.role === 'tv') {
          ws.send(JSON.stringify({ type: 'state', snapshot: pub }));
        } else {
          ws.send(JSON.stringify({
            type: 'state',
            snapshot: pub,
            playerView: this.snapshotPlayer(att.did),
          }));
        }
      } catch {}
    }
  }

  snapshotPublic() {
    if (!this.game) return null;
    const t = getTemplate(this.game.template);
    return {
      code: this.code,
      gameId: this.gameId,
      game: { name: this.game.meta.name, template: this.game.template, rounds: this.game.rounds },
      hostDid: this.hostDid,
      whitelist: this.whitelist,
      phase: this.phase,
      view: t.publicState(this.phase, this.buildCtx()),
    };
  }

  snapshotPlayer(did) {
    if (!this.game || !this.players[did]) return null;
    const t = getTemplate(this.game.template);
    const player = { did, handle: this.players[did].handle };
    const view = t.playerState(this.phase, player, this.buildCtx());
    return { ...view, isHost: did === this.hostDid };
  }
}

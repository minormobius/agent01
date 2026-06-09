// hoop — client side of the live presence layer.
//
// Opens one WebSocket to the HoopRoom DO (/ws), announces our position, and
// relays peer join/move/leave events back to the caller. Movement is throttled
// so a fast walker doesn't flood the socket. Reconnects with backoff. Entirely
// best-effort: if the socket never opens, the rest of the app is unaffected.

const MOVE_THROTTLE_MS = 70;

export class Presence {
  constructor({ token, handlers = {} }) {
    this.token = token || null;
    this.h = handlers; // { onSelf, onPeer, onLeave, onReset, onCount, onEmote, onState }
    this.x = 24; this.y = 14;
    this.ws = null;
    this.open = false;
    this.peers = new Map(); // did -> { handle, x, y }
    this._backoff = 1000;
    this._closed = false;
    this._pending = null;
    this._lastSent = 0;
    this._timer = null;
  }

  connect() {
    this._closed = false;
    const scheme = location.protocol === 'https:' ? 'wss' : 'ws';
    const q = this.token ? `?session=${encodeURIComponent(this.token)}` : '';
    let ws;
    try { ws = new WebSocket(`${scheme}://${location.host}/ws${q}`); } catch { this._scheduleReconnect(); return; }
    this.ws = ws;
    ws.onopen = () => {
      this.open = true;
      this._backoff = 1000;
      this._raw({ type: 'hello', x: this.x, y: this.y });
      this.h.onState && this.h.onState('connected');
    };
    ws.onmessage = (e) => this._recv(e);
    ws.onclose = () => { this.open = false; this.h.onState && this.h.onState('disconnected'); this._scheduleReconnect(); };
    ws.onerror = () => { try { ws.close(); } catch {} };
  }

  close() {
    this._closed = true;
    clearTimeout(this._timer);
    this.peers.clear();
    if (this.ws) { try { this.ws.close(); } catch {} this.ws = null; }
    this.open = false;
  }

  // Throttled position update.
  move(x, y) {
    this.x = x; this.y = y;
    const now = Date.now();
    if (now - this._lastSent >= MOVE_THROTTLE_MS) {
      this._lastSent = now;
      this._raw({ type: 'move', x, y });
    } else if (!this._pending) {
      const wait = MOVE_THROTTLE_MS - (now - this._lastSent);
      this._pending = setTimeout(() => {
        this._pending = null; this._lastSent = Date.now();
        this._raw({ type: 'move', x: this.x, y: this.y });
      }, wait);
    }
  }

  emote(placeId, text) { this._raw({ type: 'emote', placeId, text }); }

  _raw(obj) {
    if (this.ws && this.open) { try { this.ws.send(JSON.stringify(obj)); } catch {} }
  }

  _recv(e) {
    let msg; try { msg = JSON.parse(e.data); } catch { return; }
    switch (msg.type) {
      case 'welcome':
        this.selfDid = msg.self?.did;
        this.peers.clear();
        this.h.onReset && this.h.onReset();
        for (const p of msg.peers || []) { this.peers.set(p.did, p); this.h.onPeer && this.h.onPeer(p); }
        this.h.onSelf && this.h.onSelf(msg.self);
        this._count();
        break;
      case 'join':
      case 'move': {
        if (msg.did === this.selfDid) break;
        this.peers.set(msg.did, { handle: msg.handle, x: msg.x, y: msg.y });
        this.h.onPeer && this.h.onPeer({ did: msg.did, handle: msg.handle, x: msg.x, y: msg.y });
        this._count();
        break;
      }
      case 'leave':
        this.peers.delete(msg.did);
        this.h.onLeave && this.h.onLeave(msg.did);
        this._count();
        break;
      case 'emote':
        this.h.onEmote && this.h.onEmote(msg);
        break;
    }
  }

  _count() { this.h.onCount && this.h.onCount(this.peers.size + 1); }

  _scheduleReconnect() {
    if (this._closed) return;
    clearTimeout(this._timer);
    this._timer = setTimeout(() => this.connect(), this._backoff);
    this._backoff = Math.min(this._backoff * 2, 15000);
  }
}

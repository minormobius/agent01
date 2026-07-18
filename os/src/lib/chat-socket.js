// Chat socket — connects the chat UI to the container's headless-agent
// endpoint (/chat on os-api). Simpler than the PTY transport: JSON frames,
// one in-flight run, plus an HTTP auth preflight so failures are explained
// before a socket ever opens.

import { CONTAINER_API_URL } from './container-config.js';

const httpBase = () => CONTAINER_API_URL.replace(/^ws/, 'http');

// GET /chat without an Upgrade header runs the full server-side authorization
// and returns { ok, did } or { ok:false, error } — the diagnosis, up front.
export async function chatPreflight({ session, auth, authMode }, timeoutMs = 8000) {
  const params = new URLSearchParams({ session });
  if (auth) params.set('auth', auth);
  if (authMode) params.set('authMode', authMode);
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${httpBase()}/chat?${params}`, { signal: ctrl.signal });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, error: body.error || `os-api HTTP ${res.status}` };
    return { ok: true, did: body.did };
  } catch (err) {
    return { ok: false, error: `os-api unreachable (${err.name === 'AbortError' ? 'timeout' : err.message})` };
  } finally {
    clearTimeout(t);
  }
}

// Exercise the full container boot through the DO and return the verdict —
// called when a socket dies before ever connecting, to name the cause.
export async function debugBoot({ session, auth, authMode }, timeoutMs = 170000) {
  const params = new URLSearchParams({ session });
  if (auth) params.set('auth', auth);
  if (authMode) params.set('authMode', authMode);
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${httpBase()}/debug/boot?${params}`, { signal: ctrl.signal });
    return await res.json();
  } catch (err) {
    return { ok: false, error: `debug/boot unreachable (${err.name === 'AbortError' ? 'timeout' : err.message})` };
  } finally {
    clearTimeout(t);
  }
}

// Gracefully stop the container so the next boot runs the CURRENT image —
// the cure for an instance that never idles long enough to pick up a deploy.
export async function debugRestart({ session, auth, authMode }, timeoutMs = 20000) {
  const params = new URLSearchParams({ session });
  if (auth) params.set('auth', auth);
  if (authMode) params.set('authMode', authMode);
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${httpBase()}/debug/restart?${params}`, { signal: ctrl.signal });
    return await res.json();
  } catch (err) {
    return { ok: false, error: `restart failed (${err.name === 'AbortError' ? 'timeout' : err.message})` };
  } finally {
    clearTimeout(t);
  }
}

// Assist mode: direct worker→Moonshot chat (no container). POSTs the thread
// plus options ({system, thinking, webSearch}), parses the Anthropic-messages
// SSE stream, and invokes onEvent with typed events:
//   {type:'text', text} · {type:'thinking', text} · {type:'tool', name, detail}
//   {type:'stop', reason}  (reason 'refusal'/'max_tokens' deserve UI texture)
export async function assistStream({ session, auth, authMode }, payload, onEvent, signal) {
  const params = new URLSearchParams({ session });
  if (auth) params.set('auth', auth);
  if (authMode) params.set('authMode', authMode);
  const res = await fetch(`${httpBase()}/assist?${params}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal,
  });
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(`assist ${res.status}: ${t.slice(0, 300)}`);
  }
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = '';
  const handle = (evt) => {
    if (evt.type === 'content_block_delta') {
      if (evt.delta?.type === 'thinking_delta' && evt.delta.thinking) {
        onEvent({ type: 'thinking', text: evt.delta.thinking });
      } else if (evt.delta?.text) {
        onEvent({ type: 'text', text: evt.delta.text });
      }
    } else if (evt.type === 'content_block_start') {
      const b = evt.content_block;
      if (b?.type === 'server_tool_use') {
        onEvent({ type: 'tool', name: b.name || 'tool', detail: JSON.stringify(b.input || {}).slice(0, 120) });
      } else if (b?.type === 'web_search_tool_result') {
        const n = Array.isArray(b.content) ? b.content.length : '';
        onEvent({ type: 'tool', name: 'web results', detail: String(n) });
      }
    } else if (evt.type === 'message_delta' && evt.delta?.stop_reason) {
      onEvent({ type: 'stop', reason: evt.delta.stop_reason });
    } else if (evt.type === 'error') {
      throw new Error(evt.error?.message || 'stream error');
    }
  };
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i).trim();
      buf = buf.slice(i + 1);
      if (!line.startsWith('data:')) continue;
      const data = line.slice(5).trim();
      if (data === '[DONE]') return;
      let evt;
      try { evt = JSON.parse(data); } catch { continue; }
      handle(evt);
    }
  }
}

// Private assist-thread store — per-DID Durable Object storage via the worker
// (deliberately NOT PDS records: the PDS is the open web; the DO is private).
export const threadsApi = {
  _params({ session, auth, authMode }) {
    const p = new URLSearchParams({ session });
    if (auth) p.set('auth', auth);
    if (authMode) p.set('authMode', authMode);
    return p;
  },
  async list(authInfo) {
    const res = await fetch(`${httpBase()}/threads/list?${this._params(authInfo)}`);
    if (!res.ok) throw new Error(`threads list ${res.status}`);
    return (await res.json()).threads || [];
  },
  async get(authInfo, id) {
    const p = this._params(authInfo); p.set('id', id);
    const res = await fetch(`${httpBase()}/threads/get?${p}`);
    if (!res.ok) return null;
    return res.json();
  },
  async save(authInfo, { id, title, msgs }) {
    const res = await fetch(`${httpBase()}/threads/save?${this._params(authInfo)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, title, msgs }),
    });
    if (!res.ok) throw new Error(`threads save ${res.status}`);
  },
  async remove(authInfo, id) {
    await fetch(`${httpBase()}/threads/delete?${this._params(authInfo)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    });
  },
};

const RECONNECT_DELAYS_MS = [1000, 2000, 4000, 8000, 15000];

export class ChatSocket {
  constructor({ onMessage, onStatus }) {
    this.onMessage = onMessage;   // (obj) — parsed frames from the container
    this.onStatus = onStatus;     // ('connecting'|'connected'|'reconnecting'|'closed')
    this.ws = null;
    this.intentionalClose = false;
    this.pingInterval = null;
    this.reconnectAttempt = 0;
    this._connectParams = null;
  }

  connect(params) {
    this._connectParams = params;
    this.reconnectAttempt = 0;
    this._open();
  }

  // Manual retry after auto-reconnect gave up (or from a visibility rejoin).
  reconnectNow() {
    if (!this._connectParams) return;
    this.reconnectAttempt = 0;
    this._open();
  }

  _open() {
    const { session, auth, authMode, profile } = this._connectParams;
    this.intentionalClose = false;
    const params = new URLSearchParams({ session });
    if (auth) params.set('auth', auth);
    if (authMode) params.set('authMode', authMode);
    if (profile) params.set('profile', profile);

    this.onStatus?.(this.reconnectAttempt ? 'reconnecting' : 'connecting');
    this.ws = new WebSocket(`${CONTAINER_API_URL}/chat?${params}`);

    this.ws.onopen = () => {
      this.reconnectAttempt = 0;
      this.onStatus?.('connected');
      this._startPing();
    };
    this.ws.onmessage = (event) => {
      let msg;
      try { msg = JSON.parse(event.data); } catch { return; }
      if (msg.type !== 'pong') this.onMessage?.(msg);
    };
    this.ws.onclose = (event) => {
      this._stopPing();
      if (this.intentionalClose) {
        this.onStatus?.('closed', { code: event.code, reason: event.reason, final: true });
        return;
      }
      // Auto-reconnect with backoff — mobile sockets die on rotate/lock and
      // the server keeps runs alive, so rejoining is always the right move.
      if (this.reconnectAttempt < RECONNECT_DELAYS_MS.length) {
        const delay = RECONNECT_DELAYS_MS[this.reconnectAttempt++];
        this.onStatus?.('reconnecting', { attempt: this.reconnectAttempt });
        setTimeout(() => { if (!this.intentionalClose) this._open(); }, delay);
      } else {
        this.onStatus?.('closed', { code: event.code, reason: event.reason, final: true });
      }
    };
    this.ws.onerror = () => { /* onclose follows */ };
  }

  sendUser(text) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'user', text }));
      return true;
    }
    return false;
  }

  interrupt() {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'interrupt' }));
    }
  }

  disconnect() {
    this.intentionalClose = true;
    this._stopPing();
    this.ws?.close();
    this.ws = null;
  }

  get connected() {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  _startPing() {
    this._stopPing();
    this.pingInterval = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ type: 'ping' }));
      }
    }, 25_000);
  }

  _stopPing() {
    if (this.pingInterval) { clearInterval(this.pingInterval); this.pingInterval = null; }
  }
}

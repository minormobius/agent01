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
export async function debugBoot({ session, auth, authMode }, timeoutMs = 45000) {
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

export class ChatSocket {
  constructor({ onMessage, onStatus }) {
    this.onMessage = onMessage;   // (obj) — parsed frames from the container
    this.onStatus = onStatus;     // ('connecting'|'connected'|'closed')
    this.ws = null;
    this.intentionalClose = false;
    this.pingInterval = null;
  }

  connect({ session, auth, authMode, profile }) {
    this.intentionalClose = false;
    const params = new URLSearchParams({ session });
    if (auth) params.set('auth', auth);
    if (authMode) params.set('authMode', authMode);
    if (profile) params.set('profile', profile);

    this.onStatus?.('connecting');
    this.ws = new WebSocket(`${CONTAINER_API_URL}/chat?${params}`);

    this.ws.onopen = () => {
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
      this.onStatus?.('closed', { code: event.code, reason: event.reason });
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

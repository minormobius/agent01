// hoop — controller. Wires the canvas world, the thread sidebar, the data store
// (local ⇆ atproto), and sign-in. Keep it dependency-free; ES modules only.

import { AuthClient } from '/vendor/auth.js';
import { World } from '/js/world.js';
import { LocalBackend, AtprotoBackend, threadTree, placeId } from '/js/store.js';

const $ = (sel, root = document) => root.querySelector(sel);
const el = (tag, props = {}, kids = []) => {
  const n = Object.assign(document.createElement(tag), props);
  for (const k of [].concat(kids)) n.append(k);
  return n;
};
const fmtTime = (iso) => {
  const d = new Date(iso);
  if (isNaN(d)) return '';
  const diff = (Date.now() - d) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return d.toLocaleDateString();
};

const CREW_KEY = 'hoop:crew:v1';
const PERSONA_KEY = 'hoop:persona:v1';

const App = {
  auth: new AuthClient(),
  backend: null,
  world: null,
  places: [],
  selected: null,    // place
  replyTo: null,     // message being replied to
  persona: localStorage.getItem(PERSONA_KEY) || 'mino',

  async init() {
    this.backend = new LocalBackend(); // instant, offline-safe default
    this.world = new World($('#world'), {
      onSelectPlace: (p) => this.openPlace(p),
      onStatus: (t) => this.setStatus(t),
      onDropHere: (x, y) => this.dropNode(x, y),
    });
    this.world.start();
    this.bindChrome();

    await this.refreshPlaces();
    // open The Hub to start
    const hub = this.places.find((p) => p.id === '24-14') || this.places[0];
    if (hub) { this.world.select(hub.id); this.openPlace(hub); }

    // pick up an existing SSO / OAuth session in the background
    this.auth.onAuthChange((u) => this.renderIdentity(u));
    try { await this.auth.init(); } catch { /* stays local */ }
    this.renderIdentity(this.auth.getUser());
  },

  getCrew() {
    try { return JSON.parse(localStorage.getItem(CREW_KEY) || '[]'); } catch { return []; }
  },
  setCrew(list) { localStorage.setItem(CREW_KEY, JSON.stringify(list)); },

  // ── identity / mode ───────────────────────────────────────────────────────
  renderIdentity(user) {
    const box = $('#identity');
    box.innerHTML = '';
    if (user) {
      box.append(
        el('span', { className: 'who', textContent: '@' + user.handle }),
        el('button', { className: 'btn', textContent: this.backend.mode === 'atproto' ? '● atproto' : 'use atproto', onclick: () => this.setMode('atproto') }),
        el('button', { className: 'btn ghost', textContent: 'sign out', onclick: () => this.signOut() }),
      );
    } else {
      const inp = el('input', { className: 'handle-input', placeholder: 'you.bsky.social', spellcheck: false });
      inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') this.signIn(inp.value.trim()); });
      box.append(inp, el('button', { className: 'btn', textContent: 'sign in', onclick: () => this.signIn(inp.value.trim()) }));
    }
    $('#mode-pill').textContent = this.backend.mode === 'atproto' ? 'ATProto · live' : 'Local · preview';
    $('#mode-pill').className = 'pill ' + (this.backend.mode === 'atproto' ? 'live' : 'preview');
    // persona switch only matters in local mode
    $('#persona-wrap').style.display = this.backend.mode === 'local' ? '' : 'none';
  },

  async signIn(handle) {
    if (!handle) return;
    this.setStatus('Redirecting to Bluesky for sign-in…');
    try {
      // Default scope is the unified mino.mobi scope (includes hoop collections
      // once scope.ts is redeployed). No transition:generic.
      await this.auth.login(handle);
    } catch (e) { this.setStatus('Sign-in failed: ' + e.message); }
  },
  async signOut() {
    try { await this.auth.logout(); } catch {}
    this.setMode('local');
    this.renderIdentity(null);
  },
  async setMode(mode) {
    if (mode === 'atproto') {
      if (!this.auth.getUser()) { this.setStatus('Sign in first to go live on atproto.'); return; }
      this.backend = new AtprotoBackend(this.auth, () => this.getCrew());
    } else {
      this.backend = new LocalBackend();
    }
    this.renderIdentity(this.auth.getUser());
    this.setStatus(`Backend → ${mode}. Loading…`);
    await this.refreshPlaces();
    if (this.selected) await this.openPlace(this.selected);
  },

  // ── places ────────────────────────────────────────────────────────────────
  async refreshPlaces() {
    try {
      this.places = await this.backend.listPlaces();
    } catch (e) { this.setStatus('Could not load places: ' + e.message); this.places = this.places || []; }
    this.world.setPlaces(this.places);
    this.renderPlaceList();
  },

  renderPlaceList() {
    const list = $('#place-list');
    list.innerHTML = '';
    for (const p of [...this.places].sort((a, b) => a.title.localeCompare(b.title))) {
      const row = el('button', {
        className: 'place-row' + (this.selected && p.id === this.selected.id ? ' active' : ''),
        onclick: () => { this.world.select(p.id); this.openPlace(p); },
      }, [
        el('span', { className: 'pg', textContent: p.glyph || '◆' }),
        el('span', { className: 'pt', textContent: p.title }),
        el('span', { className: 'pk', textContent: p.kind || '' }),
      ]);
      list.append(row);
    }
  },

  async dropNode(x, y) {
    if (this.world.placeKey(x, y)) { this.setStatus('A node already stands here.'); return; }
    const title = prompt('Name this place — what part of the infinite game lives here?');
    if (!title) return;
    const glyph = (prompt('A glyph for the map (1 char):', '◆') || '◆').slice(0, 2);
    const kind = prompt('Kind (hub / system / lore / sandbox / threshold):', 'system') || 'node';
    const place = { id: placeId(x, y), x, y, title: title.trim(), glyph, kind, summary: '' };
    try {
      const saved = await this.backend.putPlace(place);
      this.setStatus(`Dropped “${saved.title}”.` + (this.backend.mode === 'atproto' ? ' Written to your PDS.' : ''));
      await this.refreshPlaces();
      this.world.select(saved.id);
      this.openPlace(saved);
    } catch (e) { this.setStatus('Could not create place: ' + e.message); }
  },

  // ── thread / chat ───────────────────────────────────────────────────────
  async openPlace(place) {
    this.selected = place;
    this.replyTo = null;
    this.renderPlaceList();
    $('#thread-title').textContent = place.title;
    $('#thread-glyph').textContent = place.glyph || '◆';
    $('#thread-meta').textContent = `${place.kind || 'node'} · tile (${place.x}, ${place.y})`;
    $('#thread-summary').textContent = place.summary || '';
    $('#thread-summary').style.display = place.summary ? '' : 'none';
    const body = $('#thread-body');
    body.innerHTML = '<div class="loading">loading thread…</div>';
    let msgs = [];
    try { msgs = await this.backend.listMessages(place.id); } catch (e) { body.innerHTML = ''; this.setStatus('thread load failed: ' + e.message); }
    body.innerHTML = '';
    const tree = threadTree(msgs);
    if (!tree.length) body.append(el('div', { className: 'empty', textContent: 'No messages yet. Start the conversation about this place.' }));
    for (const node of tree) body.append(this.renderMsg(node, 0));
    body.scrollTop = body.scrollHeight;
    this.renderComposer();
  },

  renderMsg(node, depth) {
    const wrap = el('div', { className: 'msg', style: `margin-left:${Math.min(depth, 4) * 16}px` });
    const av = this.avatarEl(node);
    const body = el('div', { className: 'msg-main' });
    const head = el('div', { className: 'msg-head' }, [
      el('span', { className: 'msg-author', textContent: '@' + (node.author || 'someone') }),
    ]);
    if (node.seed) head.append(el('span', { className: 'ghost', textContent: '👻', title: 'Auto-seeded preview message — a specter, not a real ATProto record.' }));
    head.append(el('span', { className: 'msg-time', textContent: fmtTime(node.createdAt) }));
    head.append(el('button', { className: 'reply-link', textContent: 'reply', onclick: () => this.setReply(node) }));
    body.append(head, el('div', { className: 'msg-text', textContent: node.text }));
    const row = el('div', { className: 'msg-row' }, [av, body]);
    wrap.append(row);
    for (const c of node.children) wrap.append(this.renderMsg(c, depth + 1));
    return wrap;
  },

  // Real pfp from the author's DID when we have one; otherwise a deterministic
  // identicon so even the seed-data specters get a stable face.
  avatarEl(node) {
    const a = el('div', { className: 'avatar' });
    if (node.avatar) {
      a.append(el('img', { src: node.avatar, loading: 'lazy', alt: '', referrerPolicy: 'no-referrer' }));
      if (node.authorDid) a.title = node.authorDid;
    } else {
      a.classList.add('identicon');
      const name = (node.author || '?').replace(/^@/, '');
      let h = 0; for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
      a.style.background = `hsl(${h % 360} 45% 38%)`;
      a.textContent = name.slice(0, 1).toUpperCase();
      if (node.seed) a.classList.add('identicon-ghost');
    }
    return a;
  },

  setReply(node) {
    this.replyTo = node;
    this.renderComposer();
    $('#composer-input').focus();
  },

  renderComposer() {
    const c = $('#composer');
    c.innerHTML = '';
    if (this.replyTo) {
      c.append(el('div', { className: 'reply-ctx' }, [
        el('span', { textContent: `↳ replying to @${this.replyTo.author}: “${this.replyTo.text.slice(0, 48)}…”` }),
        el('button', { className: 'x', textContent: '×', onclick: () => { this.replyTo = null; this.renderComposer(); } }),
      ]));
    }
    const ta = el('textarea', { id: 'composer-input', placeholder: this.selected ? `Message ${this.selected.title}…` : 'Select a place…', rows: 2 });
    ta.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); this.send(); }
    });
    const send = el('button', { className: 'btn send', textContent: 'Send ⏎', onclick: () => this.send() });
    c.append(ta, send);
    if (!this.selected) ta.disabled = true;
  },

  async send() {
    const ta = $('#composer-input');
    const text = ta.value.trim();
    if (!text || !this.selected) return;
    ta.value = '';
    const author = this.backend.mode === 'atproto' ? (this.auth.getUser()?.handle || 'you') : this.persona;
    try {
      await this.backend.postMessage({ placeId: this.selected.id, text, parentId: this.replyTo?.id, author });
      this.replyTo = null;
      await this.openPlace(this.selected);
      this.setStatus(this.backend.mode === 'atproto' ? 'Posted to atproto.' : 'Posted (local preview).');
    } catch (e) { this.setStatus('Send failed: ' + e.message); ta.value = text; }
  },

  // ── chrome / footer ───────────────────────────────────────────────────────
  bindChrome() {
    $('#drop-btn').onclick = () => this.dropNode(this.world.player.x, this.world.player.y);
    $('#recenter-btn').onclick = () => { if (this.selected) this.world.select(this.selected.id); };

    // persona switch (local preview demo of a two-person thread)
    const ps = $('#persona-wrap');
    for (const name of ['mino', 'hoopy']) {
      const b = el('button', { className: 'persona' + (name === this.persona ? ' on' : ''), textContent: name });
      b.onclick = () => {
        this.persona = name; localStorage.setItem(PERSONA_KEY, name);
        [...ps.querySelectorAll('.persona')].forEach((x) => x.classList.toggle('on', x.textContent === name));
        this.setStatus(`Posting as ${name} (local preview persona).`);
      };
      ps.append(b);
    }

    // crew editor
    $('#crew-btn').onclick = () => {
      const cur = this.getCrew().join(', ');
      const next = prompt('Crew — comma-separated Bluesky handles whose hoop records are merged into the live view:', cur);
      if (next == null) return;
      this.setCrew(next.split(',').map((s) => s.trim().replace(/^@/, '')).filter(Boolean));
      this.setStatus('Crew updated.');
      if (this.backend.mode === 'atproto') this.refreshPlaces().then(() => this.selected && this.openPlace(this.selected));
    };

    // focus canvas for keyboard control
    $('#world').focus();
  },

  setStatus(t) { $('#status').textContent = t; },
};

App.init();

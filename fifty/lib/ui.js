// fifty/lib/ui.js — the chrome and the small helpers every tool page uses.
//
// Each tool page includes concepts.js and then calls UI.mount(n), which draws
// the top bar, the concept header (number, title, the original pitch verbatim,
// what we made of it) and the footer. The tool itself renders into <main>.
//
// Also here: DOM building, number/date formatting, clipboard, file download,
// and URL state — several tools make the document live in the address bar, so
// `UI.state` is load-bearing rather than a convenience.

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

/** el('div.panel', {onclick}, 'text', childNode, [more]) */
export function el(spec, attrs, ...kids) {
  const m = /^([a-z0-9-]+)?((?:[.#][\w-]+)*)$/i.exec(spec) || [];
  const node = document.createElement(m[1] || 'div');
  for (const token of (m[2] || '').match(/[.#][\w-]+/g) || []) {
    if (token[0] === '.') node.classList.add(token.slice(1));
    else node.id = token.slice(1);
  }
  if (attrs && (typeof attrs !== 'object' || attrs instanceof Node || Array.isArray(attrs))) {
    kids.unshift(attrs);
  } else if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
      else if (k === 'style' && typeof v === 'object') Object.assign(node.style, v);
      else if (k === 'html') node.innerHTML = v;
      else if (k in node && k !== 'list' && k !== 'form') node[k] = v;
      else node.setAttribute(k, v);
    }
  }
  add(node, kids);
  return node;
}

function add(node, kids) {
  for (const k of kids.flat(4)) {
    if (k == null || k === false) continue;
    node.appendChild(k instanceof Node ? k : document.createTextNode(String(k)));
  }
}

export function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); return node; }
export function fill(node, ...kids) { clear(node); add(node, kids); return node; }

// ───────────────────────────────────────────────────── chrome ──

function concept(n) {
  return (window.FIFTY || []).find((c) => c.n === Number(n));
}

/**
 * Draw the page chrome for concept `n`. Returns the concept record.
 * Inserts a <main class="wrap"> if the page has not supplied one.
 */
export function mount(n, opts = {}) {
  const c = concept(n);
  if (!c) throw new Error(`no concept ${n}`);
  document.title = `${String(c.n).padStart(2, '0')} · ${c.title} — fifty`;

  const prev = (window.FIFTY || []).find((x) => x.n === c.n - 1);
  const next = (window.FIFTY || []).find((x) => x.n === c.n + 1);

  const bar = el('header.topbar', el('div.wrap',
    el('a.home', { href: '/' }, 'fifty'),
    el('span.sep', '/'),
    el('span.here', `${String(c.n).padStart(2, '0')} ${c.title}`),
    el('span.spacer'),
    el('nav.nav',
      prev && el('a', { href: `/c/${prev.n}`, title: prev.title }, '←'),
      next && el('a', { href: `/c/${next.n}`, title: next.title }, '→'),
      el('a', { href: '/' }, 'all fifty'))));

  const head = el('div.tool-head', el('div.wrap' + (opts.wide ? '.wide' : ''),
    el('div.num', `concept ${String(c.n).padStart(2, '0')} · ${c.kind}`,
      c.state === 'partial' ? el('span.tag.partial', { style: { marginLeft: '10px' } }, 'partial') : null),
    el('h1', c.title),
    el('p.pitch', c.pitch),
    c.made ? el('p.made', c.made) : null,
    c.gap ? el('p.gap', el('b', 'What it does not do. '), c.gap) : null));

  document.body.insertBefore(head, document.body.firstChild);
  document.body.insertBefore(bar, document.body.firstChild);

  let main = document.querySelector('main');
  if (!main) { main = el('main.wrap' + (opts.wide ? '.wide' : '')); document.body.appendChild(main); }

  document.body.appendChild(el('div.wrap' + (opts.wide ? '.wide' : ''),
    el('div.foot',
      el('a', { href: '/' }, '← all fifty concepts'),
      el('span.dim', 'Everything here is a public read. Nothing writes to your repo.'))));

  return c;
}

// ────────────────────────────────────────────────── formatting ──

export const pad2 = (n) => String(n).padStart(2, '0');

export function num(v, digits = 0) {
  if (v == null || Number.isNaN(v)) return '—';
  return Number(v).toLocaleString(undefined, {
    minimumFractionDigits: digits, maximumFractionDigits: digits,
  });
}

/** 1.2k, 34.5k, 1.1M — for counts that appear in tables. */
export function compact(v) {
  const n = Number(v) || 0;
  if (Math.abs(n) < 1000) return String(n);
  if (Math.abs(n) < 1e6) return (n / 1e3).toFixed(n < 1e4 ? 1 : 0) + 'k';
  return (n / 1e6).toFixed(1) + 'M';
}

/** "3 days ago", "in 2 months". */
export function ago(date) {
  const t = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(+t)) return '—';
  const s = (t - Date.now()) / 1000;
  const units = [['year', 31536000], ['month', 2592000], ['week', 604800],
                 ['day', 86400], ['hour', 3600], ['minute', 60], ['second', 1]];
  const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
  for (const [unit, secs] of units) {
    if (Math.abs(s) >= secs || unit === 'second') return rtf.format(Math.round(s / secs), unit);
  }
  return '—';
}

export function isoDay(d = new Date()) {
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
}

// ─────────────────────────────────────────────────── behaviour ──

export async function copy(text, btn) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const ta = el('textarea', { value: text, style: { position: 'fixed', opacity: '0' } });
    document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); } finally { ta.remove(); }
  }
  if (btn) {
    const was = btn.textContent;
    btn.textContent = 'copied';
    setTimeout(() => { btn.textContent = was; }, 1200);
  }
}

export function download(filename, text, type = 'application/json') {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = el('a', { href: url, download: filename });
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/** A copy-to-clipboard block for a record or snippet. */
export function codeBlock(text, label = 'copy') {
  const pre = el('pre.out', text);
  const btn = el('button.small.ghost', { onclick: (e) => copy(text, e.target) }, label);
  return el('div',
    el('div.row', { style: { justifyContent: 'flex-end', marginBottom: '6px' } }, btn),
    pre);
}

// ─────────────────────────────────────────────────── URL state ──

// Several tools are "the document is the URL" — a dungeon, a quadrant, a
// bracket. Encoded as URL-safe base64 of JSON in the hash so it survives
// pasting into chat clients that mangle query strings.

export const state = {
  read(fallback = null) {
    const h = location.hash.replace(/^#/, '');
    if (!h) return fallback;
    try {
      const b64 = h.replace(/-/g, '+').replace(/_/g, '/');
      const bytes = Uint8Array.from(atob(b64), (ch) => ch.charCodeAt(0));
      return JSON.parse(new TextDecoder().decode(bytes));
    } catch { return fallback; }
  },
  encode(obj) {
    const bytes = new TextEncoder().encode(JSON.stringify(obj));
    let bin = '';
    for (const b of bytes) bin += String.fromCharCode(b);
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  },
  write(obj, { replace = true } = {}) {
    const url = `${location.pathname}#${this.encode(obj)}`;
    if (replace) history.replaceState(null, '', url);
    else history.pushState(null, '', url);
    return location.origin + url;
  },
  url(obj) { return `${location.origin}${location.pathname}#${this.encode(obj)}`; },
};

// ────────────────────────────────────────────── determinism ──

/** Deterministic 32-bit hash. Seeds every generator on this surface. */
export function hash32(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

/** mulberry32 — small, fast, good enough, and identical everywhere. */
export function rng(seed) {
  let a = (typeof seed === 'string' ? hash32(seed) : seed >>> 0) || 1;
  return function next() {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function pick(random, arr) { return arr[Math.floor(random() * arr.length)]; }

export function shuffled(random, arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const k = Math.floor(random() * (i + 1));
    [a[i], a[k]] = [a[k], a[i]];
  }
  return a;
}

/** SHA-256 hex — used for commitment hashes and pseudonym derivation. */
export async function sha256(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

// ─────────────────────────────────────────────────── feedback ──

export function busy(node, message = 'working…') {
  fill(node, el('div.row', el('span.spinner'), el('span.dim.small', message)));
}

export function fail(node, e) {
  const msg = e && e.message ? e.message : String(e);
  fill(node, el('div.err', msg));
}

export const UI = {
  $, $$, el, clear, fill, mount, pad2, num, compact, ago, isoDay,
  copy, download, codeBlock, state, hash32, rng, pick, shuffled, sha256, busy, fail,
};
if (typeof window !== 'undefined') window.UI = UI;
export default UI;

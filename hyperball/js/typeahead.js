// typeahead.js — handle suggestions on an input, the Bluesky way.
//
// Attach it to any field that takes a handle: as the person types, a small
// list opens UNDER the field with matching accounts from
// app.bsky.actor.searchActorsTypeahead, so "morph" becomes
// morphyxmino.bsky.social without the rest being remembered. The request
// goes through the cad worker's /xrpc/ gateway (default), which forwards
// the two public actor methods to the public API, so a page's CSP needs
// only that host — 'self' on cad.mino.mobi — and never the public API
// directly. A page with its own gateway passes `gateway`.
//
// Its own list, not a <datalist>: browsers draw the native one wherever
// they like — over the field itself on some — and cannot be told not to.
// This one is positioned below the input in the page's flow, never covers
// it, follows ↑ ↓ Enter Esc, closes on blur or when the value matches a
// suggestion, and a fetch that fails just leaves it closed. `when(value)`
// decides whether a value is a handle at all — the browse-a-repo field
// skips DIDs and AT URIs.
//
//   import { attachHandleTypeahead } from './vendor/typeahead.js';
//   attachHandleTypeahead(document.querySelector('#handle'));
//   attachHandleTypeahead(input, { when: (v) => !/^(did:|at:\/\/)/.test(v) });

let seq = 0;
const cache = new Map();

export function searchHandles(q, { gateway = 'https://cad.mino.mobi', limit = 8, fetch: f = globalThis.fetch.bind(globalThis), signal } = {}) {
  const key = `${gateway}|${limit}|${q}`;
  if (cache.has(key)) return cache.get(key);
  const p = (async () => {
    try {
      const r = await f(`${gateway.replace(/\/$/, '')}/xrpc/app.bsky.actor.searchActorsTypeahead?q=${encodeURIComponent(q)}&limit=${limit}`, { signal });
      if (!r.ok) return [];
      const j = await r.json();
      return (j.actors || []).map((a) => ({ handle: a.handle, displayName: a.displayName || '' })).filter((a) => a.handle);
    } catch { cache.delete(key); return []; }
  })();
  cache.set(key, p);
  if (cache.size > 200) cache.delete(cache.keys().next().value);
  return p;
}

const CSS = `
.ta-wrap{position:relative;display:block;min-width:0}
.ta-wrap>input{width:100%;box-sizing:border-box}
.ta-list{position:absolute;left:0;right:0;top:100%;margin:2px 0 0;padding:0;list-style:none;z-index:50;max-height:14em;overflow-y:auto;border:1px solid rgba(127,127,127,.45);border-radius:4px;background:Canvas;color:CanvasText;box-shadow:0 6px 18px rgba(0,0,0,.25);font:inherit;font-size:.92em;text-align:left}
.ta-list[hidden]{display:none}
.ta-list li{padding:.3em .55em;cursor:pointer;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ta-list li small{opacity:.6;margin-left:.5em}
.ta-list li.on,.ta-list li:hover{background:rgba(127,160,255,.22)}`;
function ensureCss() { if (typeof document === 'undefined' || document.getElementById('ta-css')) return; const s = document.createElement('style'); s.id = 'ta-css'; s.textContent = CSS; document.head.append(s); }

export function attachHandleTypeahead(input, { gateway, limit = 8, min = 2, delay = 180, when = () => true, fetch: f } = {}) {
  if (!input || input.dataset.typeahead) return;
  ensureCss();
  // wrap the input so the list can hang below it without touching the page's layout
  const wrap = document.createElement('span'); wrap.className = 'ta-wrap';
  input.replaceWith(wrap); wrap.append(input);
  const list = document.createElement('ul'); list.className = 'ta-list'; list.id = `handles-${++seq}`; list.hidden = true; list.setAttribute('role', 'listbox');
  wrap.append(list);
  input.setAttribute('autocomplete', 'off'); input.setAttribute('autocapitalize', 'off'); input.setAttribute('spellcheck', 'false'); input.setAttribute('aria-autocomplete', 'list'); input.setAttribute('aria-controls', list.id);
  input.dataset.typeahead = list.id;
  let timer = null, ctl = null, last = '', items = [], active = -1;
  const close = () => { list.hidden = true; list.replaceChildren(); items = []; active = -1; input.removeAttribute('aria-activedescendant'); };
  const choose = (i) => { const a = items[i]; if (!a) return; input.value = a.handle; close(); input.dispatchEvent(new Event('change', { bubbles: true })); };
  const mark = () => { [...list.children].forEach((li, i) => { li.classList.toggle('on', i === active); if (i === active) { input.setAttribute('aria-activedescendant', li.id); li.scrollIntoView?.({ block: 'nearest' }); } }); };
  const render = (actors) => {
    items = actors; active = -1;
    if (!actors.length) return close();
    list.replaceChildren(...actors.map((a, i) => { const li = document.createElement('li'); li.id = `${list.id}-${i}`; li.setAttribute('role', 'option'); li.textContent = a.handle; if (a.displayName) { const s = document.createElement('small'); s.textContent = a.displayName; li.append(s); } li.addEventListener('pointerdown', (e) => { e.preventDefault(); choose(i); }); return li; }));
    list.hidden = false;
  };
  input.addEventListener('input', () => {
    const v = input.value.trim().replace(/^@/, '');
    clearTimeout(timer);
    if (v.length < min || !when(v)) { close(); last = ''; return; }
    timer = setTimeout(async () => {
      if (v === last) return; last = v;
      ctl?.abort(); ctl = new AbortController();
      const actors = await searchHandles(v, { gateway, limit, fetch: f, signal: ctl.signal });
      if (input.value.trim().replace(/^@/, '') !== v) return;
      render(actors.filter((a) => a.handle !== v)); // the exact value is not a suggestion
    }, delay);
  });
  input.addEventListener('keydown', (e) => {
    if (list.hidden) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); active = (active + 1) % items.length; mark(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); active = (active - 1 + items.length) % items.length; mark(); }
    else if (e.key === 'Enter' && active >= 0) { e.preventDefault(); choose(active); }
    else if (e.key === 'Escape') { close(); }
  });
  input.addEventListener('blur', () => setTimeout(close, 120));
  return list;
}

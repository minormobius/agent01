// typeahead.js — handle suggestions on an input, the Bluesky way.
//
// Attach it to any field that takes a handle: as the person types, a
// <datalist> under the input fills with matching accounts from
// app.bsky.actor.searchActorsTypeahead, so "morph" becomes
// morphyxmino.bsky.social without the rest being remembered. The request
// goes through the cad worker's /xrpc/ gateway (default), which forwards
// the two public actor methods to the public API, so a page's CSP needs
// only that host — 'self' on cad.mino.mobi — and never the public API
// directly. A page with its own gateway passes `gateway`.
//
// Native <datalist>, deliberately: no dropdown to style, works with the
// keyboard and on phones, and a fetch that fails just leaves the list as it
// was. `when(value)` decides whether a value is a handle at all — the
// browse-a-repo field skips DIDs and AT URIs.
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

export function attachHandleTypeahead(input, { gateway, limit = 8, min = 2, delay = 180, when = () => true, fetch: f } = {}) {
  if (!input || input.dataset.typeahead) return;
  const list = document.createElement('datalist');
  list.id = `handles-${++seq}`;
  input.after(list);
  input.setAttribute('list', list.id);
  input.setAttribute('autocomplete', 'off');
  input.setAttribute('autocapitalize', 'off');
  input.setAttribute('spellcheck', 'false');
  input.dataset.typeahead = list.id;
  let timer = null, ctl = null, last = '';
  const render = (actors) => { list.replaceChildren(...actors.map((a) => { const o = document.createElement('option'); o.value = a.handle; if (a.displayName) o.label = a.displayName; return o; })); };
  input.addEventListener('input', () => {
    const v = input.value.trim().replace(/^@/, '');
    clearTimeout(timer);
    if (v.length < min || !when(v)) { render([]); last = ''; return; }
    timer = setTimeout(async () => {
      if (v === last) return; last = v;
      ctl?.abort(); ctl = new AbortController();
      const actors = await searchHandles(v, { gateway, limit, fetch: f, signal: ctl.signal });
      if (input.value.trim().replace(/^@/, '') === v) render(actors);
    }, delay);
  });
  return list;
}

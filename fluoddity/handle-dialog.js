// Shared Bluesky handle picker with typeahead — a small modal that resolves to a
// handle string (or null if cancelled). Used by the sign-in chip so every
// fluoddity surface gets the same real autocomplete instead of a bare prompt().
//
//   import { askHandle } from './handle-dialog.js';
//   const handle = await askHandle();
//   if (handle) auth.login(handle, { returnTo: <clean url, no #fragment> });

const BSKY_PUBLIC = 'https://public.api.bsky.app';

let _styled = false;
function injectStyles() {
  if (_styled) return; _styled = true;
  const s = document.createElement('style');
  s.textContent = `
.fhd-ov { position: fixed; inset: 0; z-index: 9999; display: flex; align-items: center; justify-content: center; padding: 24px; background: rgba(5,6,8,0.82); backdrop-filter: blur(4px); font-family: var(--mono, ui-monospace, monospace); }
.fhd-card { width: min(94vw, 380px); background: var(--panel-solid, var(--panel, #0e1014)); border: 1px solid var(--rule, #23272f); border-radius: 14px; padding: 22px; }
.fhd-title { font-size: 17px; font-weight: 700; color: var(--fg, #e7e9ee); }
.fhd-sub { font-size: 12px; color: var(--muted, #8b909c); line-height: 1.55; margin: 8px 0 16px; }
.fhd-wrap { position: relative; }
.fhd-input { width: 100%; font-family: inherit; font-size: 15px; color: var(--fg, #e7e9ee); background: #0b0d11; border: 1px solid var(--rule, #23272f); border-radius: 10px; padding: 12px 14px; text-align: center; }
.fhd-input:focus { outline: none; border-color: var(--accent, #38e1c0); }
.fhd-results { position: absolute; left: 0; right: 0; top: calc(100% + 6px); background: #0b0d11; border: 1px solid var(--rule, #23272f); border-radius: 10px; display: none; z-index: 5; max-height: 240px; overflow-y: auto; text-align: left; }
.fhd-results.show { display: block; }
.fhd-item { display: flex; align-items: center; gap: 9px; padding: 8px 11px; cursor: pointer; }
.fhd-item.on, .fhd-item:hover { background: rgba(56,225,192,0.12); }
.fhd-item img, .fhd-item .av { width: 22px; height: 22px; border-radius: 50%; background: #23272f; flex: 0 0 auto; object-fit: cover; }
.fhd-item .nm { font-size: 13px; color: var(--fg, #e7e9ee); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.fhd-item .nm small { color: var(--muted, #8b909c); }
.fhd-row { display: flex; gap: 8px; justify-content: flex-end; margin-top: 18px; }
.fhd-btn { font-family: inherit; font-size: 13px; cursor: pointer; border-radius: 9px; padding: 10px 16px; border: 1px solid var(--rule, #23272f); background: transparent; color: var(--muted, #8b909c); }
.fhd-btn:hover { color: var(--accent, #38e1c0); border-color: var(--accent, #38e1c0); }
.fhd-btn.fhd-go { color: #04110e; background: var(--accent, #38e1c0); border-color: var(--accent, #38e1c0); font-weight: 700; }`;
  document.head.appendChild(s);
}

// Wire a handle input to the Bluesky public typeahead (no auth needed).
export function wireHandleTypeahead(input, box, submit) {
  let items = [], active = -1, timer = null, abort = null;
  const close = () => { box.classList.remove('show'); box.innerHTML = ''; items = []; active = -1; };
  const render = () => {
    if (!items.length) { close(); return; }
    box.innerHTML = items.map((a, i) => `<div class="fhd-item${i === active ? ' on' : ''}" data-i="${i}">${a.avatar ? `<img src="${a.avatar}" referrerpolicy="no-referrer" alt="">` : '<span class="av"></span>'}<span class="nm">${(a.displayName || a.handle).replace(/</g, '&lt;')}<br><small>@${a.handle.replace(/</g, '&lt;')}</small></span></div>`).join('');
    box.classList.add('show');
  };
  const pick = (i) => { if (items[i]) { input.value = items[i].handle; close(); } };
  input.addEventListener('input', () => {
    clearTimeout(timer);
    const q = input.value.trim().replace(/^@/, '');
    if (q.length < 2) { close(); return; }
    timer = setTimeout(async () => {
      if (abort) abort.abort(); abort = new AbortController();
      try {
        const res = await fetch(`${BSKY_PUBLIC}/xrpc/app.bsky.actor.searchActorsTypeahead?q=${encodeURIComponent(q)}&limit=8`, { signal: abort.signal });
        if (!res.ok) return; const d = await res.json();
        items = d.actors || []; active = -1; render();
      } catch (e) { /* aborted or offline */ }
    }, 180);
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' && items.length) { e.preventDefault(); active = (active + 1) % items.length; render(); }
    else if (e.key === 'ArrowUp' && items.length) { e.preventDefault(); active = (active - 1 + items.length) % items.length; render(); }
    else if (e.key === 'Escape') { if (items.length) { close(); } else if (submit) submit(null); }
    else if (e.key === 'Enter') { e.preventDefault(); if (active >= 0) pick(active); if (submit) submit(); }
  });
  box.addEventListener('mousedown', (e) => { const it = e.target.closest('.fhd-item'); if (it) { e.preventDefault(); pick(+it.dataset.i); input.focus(); } });
}

// Show the modal. Resolves with a cleaned handle, or null on cancel.
export function askHandle(opts = {}) {
  return new Promise((resolve) => {
    injectStyles();
    const ov = document.createElement('div'); ov.className = 'fhd-ov';
    ov.innerHTML =
      '<div class="fhd-card">' +
        '<div class="fhd-title">' + (opts.title || 'Sign in with Bluesky') + '</div>' +
        '<div class="fhd-sub">' + (opts.sub || 'Signed in once, it carries across every fluoddity surface on this device. Your work is saved to your own account.') + '</div>' +
        '<div class="fhd-wrap"><input class="fhd-input" placeholder="your-handle.bsky.social" autocapitalize="off" autocorrect="off" autocomplete="off" spellcheck="false"><div class="fhd-results"></div></div>' +
        '<div class="fhd-row"><button class="fhd-btn fhd-cancel">cancel</button><button class="fhd-btn fhd-go">sign in →</button></div>' +
      '</div>';
    document.body.appendChild(ov);
    const input = ov.querySelector('.fhd-input');
    const box = ov.querySelector('.fhd-results');
    let settled = false;
    const done = (val) => { if (settled) return; settled = true; ov.remove(); resolve(val); };
    const submit = (forceNull) => { if (forceNull === null) return done(null); const h = input.value.trim().replace(/^@/, ''); if (!h) { input.focus(); return; } done(h); };
    ov.querySelector('.fhd-go').addEventListener('click', () => submit());
    ov.querySelector('.fhd-cancel').addEventListener('click', () => done(null));
    ov.addEventListener('click', (e) => { if (e.target === ov) done(null); });
    wireHandleTypeahead(input, box, submit);
    setTimeout(() => input.focus(), 50);
  });
}

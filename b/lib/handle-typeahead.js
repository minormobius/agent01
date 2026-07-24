// handle-typeahead.js — dependency-free Bluesky handle autocomplete.
// Attaches a suggestion dropdown to any text input via the public
// app.bsky.actor.searchActorsTypeahead endpoint (no auth). Shared by /unique and
// /coin; served as a static asset and loaded as a classic <script> so it exposes
// a global before either page's main script runs.
//
//   window.attachHandleTypeahead(inputEl, { onPick });
//
// The dropdown is appended to <body> and positioned against the input's bounding
// box, so it never disturbs the flex layouts it lives inside. It themes off the
// host page's CSS vars (--bg, --rule, --sky-faint, --muted, --text, --mono).
(function () {
  const PUB = 'https://public.api.bsky.app/xrpc';
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  // Inject the dropdown stylesheet once.
  let styled = false;
  function ensureStyle() {
    if (styled) return; styled = true;
    const st = document.createElement('style');
    st.textContent = `
.ta-dropdown{position:absolute;z-index:2000;background:var(--bg);border:1px solid var(--rule);border-radius:8px;
  box-shadow:0 8px 28px rgba(0,0,0,.18);overflow-y:auto;max-height:288px;font-family:var(--mono)}
.ta-item{display:flex;align-items:center;gap:.55rem;padding:.5rem .7rem;cursor:pointer;border-bottom:1px solid var(--rule)}
.ta-item:last-child{border-bottom:0}
.ta-item.on,.ta-item:hover{background:var(--sky-faint)}
.ta-item img,.ta-noav{width:22px;height:22px;border-radius:50%;flex:none;object-fit:cover;background:var(--rule)}
.ta-h{font-size:.82rem;color:var(--text);font-weight:600;white-space:nowrap}
.ta-dn{font-size:.72rem;color:var(--muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0}`;
    document.head.appendChild(st);
  }

  function attach(input, opts) {
    if (!input || input._taAttached) return;
    input._taAttached = true;
    ensureStyle();
    opts = opts || {};
    const onPick = opts.onPick || ((h) => { input.value = h; });

    let box = null, items = [], active = -1, seq = 0, timer = null, lastQ = '';

    const openBox = () => { if (!box) { box = document.createElement('div'); box.className = 'ta-dropdown'; document.body.appendChild(box); } return box; };
    const close = () => { if (box) { box.remove(); box = null; } items = []; active = -1; };
    const position = () => {
      const r = input.getBoundingClientRect(), b = openBox();
      b.style.left = (r.left + window.scrollX) + 'px';
      b.style.top = (r.bottom + window.scrollY + 4) + 'px';
      b.style.width = Math.max(r.width, 220) + 'px';
    };
    const render = () => {
      const b = openBox(); position();
      b.innerHTML = items.map((a, i) =>
        `<div class="ta-item${i === active ? ' on' : ''}" data-i="${i}">` +
          (a.avatar ? `<img src="${esc(a.avatar)}" alt="" loading="lazy">` : '<span class="ta-noav"></span>') +
          `<span class="ta-h">@${esc(a.handle)}</span>` +
          (a.displayName ? `<span class="ta-dn">${esc(a.displayName)}</span>` : '') +
        `</div>`).join('');
      b.querySelectorAll('.ta-item').forEach((el) => {
        el.addEventListener('mousedown', (e) => { e.preventDefault(); pick(+el.dataset.i); });
      });
    };
    const pick = (i) => { const a = items[i]; if (!a) return; onPick(a.handle, a); close(); };

    async function search(q) {
      const my = ++seq;
      try {
        const r = await fetch(`${PUB}/app.bsky.actor.searchActorsTypeahead?q=${encodeURIComponent(q)}&limit=8`);
        if (!r.ok) return;
        const d = await r.json();
        if (my !== seq) return;                              // a newer keystroke won
        items = Array.isArray(d.actors) ? d.actors : []; active = -1;
        if (items.length && document.activeElement === input) render(); else close();
      } catch { /* offline / blip — just show nothing */ }
    }

    input.setAttribute('autocomplete', 'off');
    input.setAttribute('autocapitalize', 'none');
    input.setAttribute('spellcheck', 'false');

    input.addEventListener('input', () => {
      const q = input.value.trim().replace(/^@/, '');
      clearTimeout(timer);
      if (q.length < 2) { lastQ = ''; close(); return; }
      if (q === lastQ) return; lastQ = q;
      timer = setTimeout(() => search(q), 150);
    });
    input.addEventListener('keydown', (e) => {
      if (!box || !items.length) return;
      if (e.key === 'ArrowDown') { e.preventDefault(); active = (active + 1) % items.length; render(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); active = (active - 1 + items.length) % items.length; render(); }
      else if (e.key === 'Enter' && active >= 0) { e.preventDefault(); e.stopImmediatePropagation(); pick(active); }
      else if (e.key === 'Escape') { e.stopPropagation(); close(); }
    });
    input.addEventListener('blur', () => setTimeout(close, 120));
    window.addEventListener('scroll', () => { if (box) position(); }, true);
    window.addEventListener('resize', () => { if (box) position(); });
  }

  window.attachHandleTypeahead = attach;
})();

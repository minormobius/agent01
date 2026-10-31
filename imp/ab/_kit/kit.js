/* lab kit — the behaviours nearly every tenant reimplements.
 *
 * Served same-origin at <slot>.minomobi.com/_kit/kit.js. Plain functions on a
 * global; no modules, no build step, no dependencies — a tenant is one HTML file
 * and this has to work from a <script src> with nothing else in the pipeline.
 *
 * Human-owned. Agents read and call these; the containment gate refuses any
 * build that writes here, so a change is always a deliberate human act.
 */
window.kit = (function () {
  'use strict';

  /** Show a message in an element, styled as an error. Returns the element. */
  function showError(el, msg) {
    el.textContent = msg;
    el.className = 'err';
    el.hidden = false;
    return el;
  }

  function clear(el) { el.textContent = ''; el.hidden = true; return el; }

  /** Copy text, with the button feedback users expect. Falls back for
   *  non-secure contexts, where navigator.clipboard is undefined. */
  async function copy(text, btn) {
    const done = (ok) => {
      if (!btn) return;
      const was = btn.textContent;
      btn.textContent = ok ? 'copied' : 'copy failed';
      setTimeout(() => { btn.textContent = was; }, 1200);
    };
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
      } else {
        const ta = document.createElement('textarea');
        ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
        document.body.appendChild(ta); ta.select();
        document.execCommand('copy'); ta.remove();
      }
      done(true); return true;
    } catch (e) { done(false); return false; }
  }

  /** fetch() with a real timeout. Bare fetch has none, so a hung network leaves
   *  a page spinning forever with its catch block never running — the exact bug
   *  the first lab tenant shipped with. Use this instead of fetch. */
  async function fetchJson(url, opts) {
    const o = opts || {};
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), o.timeoutMs || 10000);
    try {
      const res = await fetch(url, { signal: ctl.signal, headers: { Accept: 'application/json' } });
      if (!res.ok) {
        const err = new Error('HTTP ' + res.status);
        err.status = res.status;
        throw err;
      }
      return await res.json();
    } catch (e) {
      if (e.name === 'AbortError') throw new Error('timed out reaching ' + new URL(url, location.href).host);
      if (e instanceof TypeError) throw new Error('could not reach ' + new URL(url, location.href).host);
      throw e;
    } finally { clearTimeout(timer); }
  }

  // -------------------------------------------------------------------------
  // Bluesky, the only way a lab site is allowed to touch it
  // -------------------------------------------------------------------------

  /** Methods a lab site may call. Same list as scripts/lab-content-gate.mjs,
   *  which fails the build, and the same list the CSP's connect-src supports.
   *  Every one takes a subject the visitor named. Kept here too so the mistake
   *  surfaces in the browser console during development rather than as a red
   *  build twenty minutes later. */
  const BSKY_OK = [
    'com.atproto.identity.resolveHandle',
    'app.bsky.actor.getProfile', 'app.bsky.actor.getProfiles',
    'app.bsky.actor.searchActors', 'app.bsky.actor.searchActorsTypeahead',
    'app.bsky.feed.getAuthorFeed', 'app.bsky.feed.getPostThread',
    'app.bsky.feed.getPosts', 'app.bsky.feed.getLikes', 'app.bsky.feed.getRepostedBy',
    'app.bsky.graph.getFollows', 'app.bsky.graph.getFollowers', 'app.bsky.graph.getList',
    'app.bsky.labeler.getServices',
  ];

  /** Label values we do not render. The `!` ones are system labels — !takedown
   *  and !hide are moderation decisions, not preferences, and honouring them is
   *  the whole reason to read from the AppView instead of the firehose. */
  const HIDE_LABELS = [
    '!hide', '!takedown', '!warn', '!no-unauthenticated',
    'porn', 'sexual', 'nudity', 'graphic-media', 'gore', 'nsfw',
    'sexual-figurative', 'self-harm', 'spam', 'impersonation',
  ];

  /** Call the AppView. Fails loudly on a method that is not allowed, rather
   *  than letting the CSP fail it silently at runtime. */
  function bskyGet(method, params) {
    if (BSKY_OK.indexOf(method) === -1) {
      return Promise.reject(new Error(
        method + ' is not an allowed method here. A lab site may only ask about a subject ' +
        'the visitor named — see scripts/lab-content-gate.mjs.'));
    }
    const qs = new URLSearchParams(params || {}).toString();
    return fetchJson('https://public.api.bsky.app/xrpc/' + method + (qs ? '?' + qs : ''));
  }

  /** True if this post/profile/embed carries a label we will not render.
   *  Checks both the moderation labels and the author's own self-labels. */
  function hidden(subject) {
    if (!subject) return false;
    const pools = [subject.labels, subject.post && subject.post.labels,
                   subject.author && subject.author.labels,
                   subject.record && subject.record.labels && subject.record.labels.values];
    for (const pool of pools) {
      if (!Array.isArray(pool)) continue;
      for (const l of pool) {
        const v = typeof l === 'string' ? l : (l && l.val);
        if (v && HIDE_LABELS.indexOf(v) !== -1) return true;
      }
    }
    return false;
  }

  /** Drop everything labelled. Use this on ANY list of other people's content
   *  before rendering it — a feed, a thread, search results. The AppView returns
   *  labels as data and expects the client to act on them; a page that renders
   *  the array as-is is showing what bsky.app itself would have hidden. */
  function visible(items) { return (items || []).filter((i) => !hidden(i)); }

  /** Standard breadcrumb: mino.mobi / lab / <name>. */
  function crumb(name) {
    return '<div class="crumb"><a href="https://mino.mobi">mino.mobi</a> / ' +
           '<a href="../">lab</a> / ' + name + '</div>';
  }


  /** HANDLE ENTRY, DONE ONCE. Attach Bluesky typeahead to any text input.
   *
   *      kit.handleInput(el, { onPick: (handle, actor) => ... })
   *
   *  Nearly every lab site starts with "type a handle", and every one of them
   *  reimplemented it: a bare text box, no completion, and a 400 when somebody
   *  typed a display name or forgot the .bsky.social. Adapted from the version
   *  in b/lib/handle-typeahead.js, which had already learned the two things that
   *  are easy to get wrong — debounce the keystrokes, and DROP OUT-OF-ORDER
   *  RESPONSES (a slow "al" must not overwrite a fast "alice").
   *
   *  What was added here: the ARIA a combobox needs to be usable by a screen
   *  reader at all, and the mobile handling — pointer events rather than mouse,
   *  44px touch targets, and the keyboard hints that stop iOS autocapitalising
   *  a handle into nonsense. Half the people who open a lab site from a Bluesky
   *  link are on a phone. */
  function handleInput(input, opts) {
    if (!input || input._kitTypeahead) return input;
    input._kitTypeahead = true;
    opts = opts || {};
    const onPick = opts.onPick || function (h) { input.value = h; };
    ensureTypeaheadStyle();

    let box = null, items = [], active = -1, seq = 0, timer = null, lastQ = '';
    const id = 'kit-ta-' + Math.random().toString(36).slice(2, 8);

    // Typing a handle: never autocapitalise, never autocorrect, never spellcheck,
    // and ask for the keyboard that has a dot on it.
    input.setAttribute('autocomplete', 'off');
    input.setAttribute('autocapitalize', 'none');
    input.setAttribute('autocorrect', 'off');
    input.setAttribute('spellcheck', 'false');
    input.setAttribute('inputmode', 'url');
    input.setAttribute('role', 'combobox');
    input.setAttribute('aria-autocomplete', 'list');
    input.setAttribute('aria-expanded', 'false');
    input.setAttribute('aria-controls', id);

    function open() {
      if (!box) {
        box = document.createElement('div');
        box.className = 'kit-ta';
        box.id = id;
        box.setAttribute('role', 'listbox');
        document.body.appendChild(box);
        input.setAttribute('aria-expanded', 'true');
      }
      return box;
    }
    function close() {
      if (box) { box.remove(); box = null; }
      items = []; active = -1;
      input.setAttribute('aria-expanded', 'false');
      input.removeAttribute('aria-activedescendant');
    }
    function position() {
      const r = input.getBoundingClientRect(), b = open();
      b.style.left = (r.left + window.scrollX) + 'px';
      b.style.top = (r.bottom + window.scrollY + 4) + 'px';
      b.style.width = Math.max(r.width, 220) + 'px';
    }
    function render() {
      const b = open(); position();
      b.textContent = '';
      items.forEach(function (a, i) {
        const row = document.createElement('div');
        row.className = 'kit-ta-item' + (i === active ? ' on' : '');
        row.id = id + '-' + i;
        row.setAttribute('role', 'option');
        row.setAttribute('aria-selected', i === active ? 'true' : 'false');
        if (a.avatar) {
          const img = document.createElement('img');
          img.src = a.avatar; img.alt = ''; img.loading = 'lazy';
          row.appendChild(img);
        } else {
          const sp = document.createElement('span'); sp.className = 'kit-ta-noav'; row.appendChild(sp);
        }
        const h = document.createElement('span');
        h.className = 'kit-ta-h'; h.textContent = '@' + a.handle;
        row.appendChild(h);
        if (a.displayName) {
          const dn = document.createElement('span');
          dn.className = 'kit-ta-dn'; dn.textContent = a.displayName;
          row.appendChild(dn);
        }
        // pointerdown covers mouse, touch and pen in one listener, and firing
        // before blur is what stops the list closing out from under a tap.
        row.addEventListener('pointerdown', function (e) { e.preventDefault(); pick(i); });
        b.appendChild(row);
      });
      if (active >= 0) input.setAttribute('aria-activedescendant', id + '-' + active);
      else input.removeAttribute('aria-activedescendant');
    }
    function pick(i) {
      const a = items[i];
      if (!a) return;
      input.value = a.handle;
      close();
      onPick(a.handle, a);
    }

    function search(q) {
      const my = ++seq;
      bskyGet('app.bsky.actor.searchActorsTypeahead', { q: q, limit: 8 }).then(function (d) {
        // A NEWER KEYSTROKE ALREADY WON. Without this, a slow response for "al"
        // lands after a fast one for "alice" and replaces the right list.
        if (my !== seq) return;
        items = Array.isArray(d && d.actors) ? d.actors : [];
        active = -1;
        if (items.length && document.activeElement === input) render(); else close();
      }).catch(function () { /* offline or a blip: show nothing, say nothing */ });
    }

    input.addEventListener('input', function () {
      const q = input.value.trim().replace(/^@/, '');
      clearTimeout(timer);
      if (q.length < 2) { lastQ = ''; close(); return; }
      if (q === lastQ) return;
      lastQ = q;
      timer = setTimeout(function () { search(q); }, 150);
    });
    input.addEventListener('keydown', function (e) {
      if (!box || !items.length) return;
      if (e.key === 'ArrowDown') { e.preventDefault(); active = (active + 1) % items.length; render(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); active = (active - 1 + items.length) % items.length; render(); }
      else if (e.key === 'Enter' && active >= 0) { e.preventDefault(); e.stopImmediatePropagation(); pick(active); }
      else if (e.key === 'Escape') { e.stopPropagation(); close(); }
    });
    input.addEventListener('blur', function () { setTimeout(close, 150); });
    window.addEventListener('scroll', function () { if (box) position(); }, true);
    window.addEventListener('resize', function () { if (box) position(); });
    return input;
  }

  let typeaheadStyled = false;
  function ensureTypeaheadStyle() {
    if (typeaheadStyled) return;
    typeaheadStyled = true;
    const st = document.createElement('style');
    st.textContent =
      '.kit-ta{position:absolute;z-index:2000;background:var(--bg-raised,#111);' +
      'border:1px solid var(--border,#333);border-radius:var(--radius,8px);' +
      'box-shadow:0 8px 28px rgba(0,0,0,.35);overflow-y:auto;max-height:min(60vh,320px);' +
      'font-family:var(--mono,ui-monospace,monospace);-webkit-overflow-scrolling:touch}' +
      // 44px is the smallest thing a thumb hits reliably; the desktop version of
      // this was 32 and unusable on a phone.
      '.kit-ta-item{display:flex;align-items:center;gap:.55rem;padding:.6rem .7rem;' +
      'min-height:44px;cursor:pointer;border-bottom:1px solid var(--border,#333)}' +
      '.kit-ta-item:last-child{border-bottom:0}' +
      '.kit-ta-item.on,.kit-ta-item:hover{background:var(--accent-dim,#222)}' +
      '.kit-ta-item img,.kit-ta-noav{width:24px;height:24px;border-radius:50%;flex:none;' +
      'object-fit:cover;background:var(--border,#333)}' +
      '.kit-ta-h{font-size:.85rem;color:var(--fg,#eee);font-weight:600;white-space:nowrap}' +
      '.kit-ta-dn{font-size:.75rem;color:var(--muted,#888);overflow:hidden;' +
      'text-overflow:ellipsis;white-space:nowrap;min-width:0}' +
      '@media (prefers-reduced-motion:no-preference){.kit-ta{animation:kit-ta-in .12s ease-out}' +
      '@keyframes kit-ta-in{from{opacity:0;transform:translateY(-4px)}to{opacity:1}}}';
    document.head.appendChild(st);
  }

  return { showError, clear, copy, fetchJson, crumb, bskyGet, hidden, visible, handleInput };
})();

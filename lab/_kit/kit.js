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

  return { showError, clear, copy, fetchJson, crumb, bskyGet, hidden, visible };
})();

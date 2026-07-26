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

  /** Standard breadcrumb: mino.mobi / lab / <slot> / <slug>. */
  function crumb(slot, slug) {
    return '<div class="crumb"><a href="https://mino.mobi">mino.mobi</a> / lab / ' +
           '<a href="../">' + slot + '</a> / ' + slug + '</div>';
  }

  return { showError, clear, copy, fetchJson, crumb };
})();

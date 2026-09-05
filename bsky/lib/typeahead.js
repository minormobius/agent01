/**
 * Handle typeahead — attach to any input that takes a Bluesky handle.
 *
 * Wraps `app.bsky.actor.searchActorsTypeahead` (the endpoint the Bluesky app's
 * own "@" autocomplete uses) with the parts that make it feel right:
 *
 *   • debounced, so a fast typist makes one request, not eight
 *   • every superseded request is ABORTED, so a slow early response can never
 *     overwrite a fast later one — the classic autocomplete race
 *   • keyboard first: ↑/↓ to move, Enter to take, Escape to dismiss
 *   • ARIA combobox roles, so it is usable without sight
 *   • a DID, an @handle or a pasted bsky.app profile URL all pass through
 *     untouched; the menu is a convenience, never a gate
 *
 * Usage:
 *   const ta = attachTypeahead(inputEl, { onPick: (actor) => go(actor.did) });
 *   ta.destroy();
 */

import { searchActorsTypeahead } from '/packages/atproto/bsky.js';

const DEBOUNCE_MS = 160;

let seq = 0;

/**
 * @param {HTMLInputElement} input
 * @param {object} [opts]
 * @param {(actor: {did,handle,displayName?,avatar?}) => void} [opts.onPick]
 * @param {number} [opts.limit=8]
 * @returns {{destroy: () => void}}
 */
export function attachTypeahead(input, opts = {}) {
  const limit = opts.limit ?? 8;
  const menu = document.createElement('ul');
  menu.className = 'ta-menu';
  menu.setAttribute('role', 'listbox');
  menu.hidden = true;
  menu.id = `ta-${++seq}`;

  // The menu is positioned against a wrapper so it tracks the input rather
  // than the page — the input may sit in a scrolling toolbar.
  const wrap = document.createElement('div');
  wrap.className = 'ta-wrap';
  input.parentNode.insertBefore(wrap, input);
  wrap.appendChild(input);
  wrap.appendChild(menu);

  input.setAttribute('role', 'combobox');
  input.setAttribute('aria-autocomplete', 'list');
  input.setAttribute('aria-expanded', 'false');
  input.setAttribute('aria-controls', menu.id);
  input.setAttribute('autocomplete', 'off');
  input.setAttribute('autocapitalize', 'none');
  input.setAttribute('spellcheck', 'false');

  let actors = [];
  let active = -1;
  let timer = null;
  let inflight = null;

  const close = () => {
    menu.hidden = true;
    menu.innerHTML = '';
    input.setAttribute('aria-expanded', 'false');
    input.removeAttribute('aria-activedescendant');
    actors = [];
    active = -1;
  };

  const render = () => {
    if (!actors.length) return close();
    menu.innerHTML = actors.map((a, i) => `
      <li role="option" id="${menu.id}-o${i}" data-i="${i}"
          aria-selected="${i === active}" class="${i === active ? 'on' : ''}">
        <img alt="" src="${a.avatar ? escapeAttr(a.avatar) : BLANK}">
        <span class="h">@${escapeText(a.handle)}</span>
        ${a.displayName ? `<span class="d">${escapeText(a.displayName)}</span>` : ''}
      </li>`).join('');
    menu.hidden = false;
    input.setAttribute('aria-expanded', 'true');
    if (active >= 0) input.setAttribute('aria-activedescendant', `${menu.id}-o${active}`);
    else input.removeAttribute('aria-activedescendant');
  };

  const search = async (term) => {
    // Abort the previous keystroke's request. Without this, responses can land
    // out of order and the menu shows results for a prefix already typed past.
    if (inflight) inflight.abort();
    inflight = new AbortController();
    const mine = inflight;
    const found = await searchActorsTypeahead(term, limit, mine.signal);
    if (mine !== inflight) return;   // superseded while awaiting
    inflight = null;
    actors = found;
    active = -1;
    render();
  };

  const onInput = () => {
    const v = input.value.trim();
    clearTimeout(timer);
    // A DID or a URL is already an answer — do not offer to complete it.
    if (!v || v.startsWith('did:') || v.includes('/')) return close();
    timer = setTimeout(() => search(v), DEBOUNCE_MS);
  };

  const pick = (i) => {
    const a = actors[i];
    if (!a) return;
    input.value = a.handle;
    close();
    opts.onPick?.(a);
  };

  const onKeyDown = (e) => {
    if (menu.hidden || !actors.length) {
      // Enter with no menu open is the caller's business, not ours.
      return;
    }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      // Positions cycle through -1 (the text as typed) and 0..n-1, so a user
      // can always arrow back to what they actually wrote.
      const n = actors.length;
      active += e.key === 'ArrowDown' ? 1 : -1;
      if (active >= n) active = -1;
      else if (active < -1) active = n - 1;
      render();
    } else if (e.key === 'Enter') {
      if (active >= 0) { e.preventDefault(); pick(active); }
      else close();     // typed text stands; let the form handle Enter
    } else if (e.key === 'Escape') {
      e.preventDefault();
      close();
    } else if (e.key === 'Tab') {
      if (active >= 0) pick(active);
      else close();
    }
  };

  // mousedown, not click: click fires after blur, by which point we have closed.
  const onMouseDown = (e) => {
    const li = e.target.closest('li[data-i]');
    if (!li) return;
    e.preventDefault();
    pick(Number(li.dataset.i));
  };

  const onBlur = () => setTimeout(close, 120);

  input.addEventListener('input', onInput);
  input.addEventListener('keydown', onKeyDown);
  input.addEventListener('blur', onBlur);
  menu.addEventListener('mousedown', onMouseDown);

  return {
    /**
     * Dismiss the menu and cancel anything in flight. A caller that acts on the
     * typed text — running a full search, submitting a form — must call this,
     * because a debounced request fired just before Enter will otherwise land
     * afterwards and reopen the menu ON TOP of the results, where it silently
     * intercepts taps.
     */
    close() {
      clearTimeout(timer);
      inflight?.abort();
      inflight = null;
      close();
    },
    destroy() {
      clearTimeout(timer);
      inflight?.abort();
      input.removeEventListener('input', onInput);
      input.removeEventListener('keydown', onKeyDown);
      input.removeEventListener('blur', onBlur);
      menu.remove();
    },
  };
}

const BLANK = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg"/>');
const escapeText = (s) => String(s).replace(/[&<>"']/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const escapeAttr = escapeText;

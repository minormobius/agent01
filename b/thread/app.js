// app.js — the thread reader's view layer.
//
// Ported from photo's `Thread.jsx`, which is where this lived when it was
// (wrongly) filed as an image tool. `b` has no build step, so the component
// became this: plain DOM, one render function per thing on screen, no
// framework. The parsing and fetching in `./thread.js` came across unchanged —
// it never had a React import in it, which is exactly why the port was
// possible in an afternoon rather than a week.
//
// TWO THINGS WORTH KNOWING
// -----------------------
// * **Facet offsets are BYTES.** `renderText` converts to a byte array and
//   slices there, because a link after an emoji lands on the wrong characters
//   if you count with `String.length`. Same rule as everywhere else on ATProto.
// * **The gallery is the point, not a second-class view.** A long thread is
//   usually a person quoting a lot of other posts, and the quote wall is the
//   readable form of that. It reuses the same `extractMedia` the timeline does.

import { extractMedia, fetchThread, flattenThread, parsePostInput, resolvePostUri } from './thread.js';

const $ = (sel) => document.querySelector(sel);
const el = (tag, cls, text) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
};

const state = { posts: [], view: 'timeline', loading: false };

// ───────────────────────────────────────────────────────────── loading ──

async function load(raw) {
  const value = String(raw || '').trim();
  if (!value || state.loading) return;

  state.loading = true;
  setStatus('resolving…');
  $('#error').hidden = true;
  $('#out').innerHTML = '';

  try {
    const parsed = parsePostInput(value);
    if (!parsed) throw new Error('that is not a bsky.app post URL or an at:// URI');

    const uri = await resolvePostUri(parsed);
    const thread = await fetchThread(uri, {
      onProgress: ({ fetched }) => setStatus(`fetching… ${fetched} request${fetched === 1 ? '' : 's'}`),
    });

    state.posts = flattenThread(thread);
    setStatus('');
    render();

    // The thread is the page, so it belongs in the address bar.
    const share = `?p=${encodeURIComponent(value)}`;
    if (location.search !== share) history.replaceState(null, '', location.pathname + share);
  } catch (err) {
    setStatus('');
    fail(err.message);
  } finally {
    state.loading = false;
    $('#go').disabled = false;
  }
}

const setStatus = (text) => {
  $('#status').textContent = text;
  $('#status').hidden = !text;
  $('#go').disabled = !!text;
};

function fail(message) {
  const box = $('#error');
  box.textContent = message;
  box.hidden = false;
}

// ─────────────────────────────────────────────────────────── rendering ──

function render() {
  const out = $('#out');
  out.innerHTML = '';
  if (!state.posts.length) return;

  const quotes = state.posts
    .filter((p) => p.isOp && p.embed)
    .flatMap((p) => extractMedia(p.embed).filter((m) => m.type === 'quote'));

  out.appendChild(renderControls(quotes.length));
  out.appendChild(state.view === 'gallery' ? renderGallery(quotes) : renderTimeline());
}

function renderControls(quoteCount) {
  const bar = el('div', 'controls');
  const media = state.posts.reduce((n, p) => n + extractMedia(p.embed).filter((m) => m.type === 'image' || m.type === 'video').length, 0);
  const authors = new Set(state.posts.map((p) => p.author.did)).size;

  bar.appendChild(el('div', 'stats',
    `${state.posts.length} posts · ${media} media · ${authors} author${authors === 1 ? '' : 's'}`
    + (quoteCount ? ` · ${quoteCount} quoted` : '')));

  const toggle = el('div', 'toggle');
  for (const [id, label] of [['timeline', 'timeline'], ['gallery', 'quote wall']]) {
    const b = el('button', `seg${state.view === id ? ' on' : ''}`, label);
    b.disabled = id === 'gallery' && !quoteCount;
    b.onclick = () => { state.view = id; render(); };
    toggle.appendChild(b);
  }
  bar.appendChild(toggle);
  return bar;
}

function renderTimeline() {
  const list = el('div', 'timeline');
  for (const post of state.posts) list.appendChild(renderPost(post));
  return list;
}

function renderPost(post) {
  const card = el('article', `post${post.isOp ? ' op' : ''}`);

  const head = el('header', 'post-head');
  if (post.author.avatar) {
    const av = el('img', 'avatar');
    av.src = post.author.avatar; av.alt = ''; av.loading = 'lazy';
    head.appendChild(av);
  }
  const who = el('div', 'who');
  const name = el('a', 'name', post.author.displayName);
  name.href = `https://bsky.app/profile/${post.author.handle}`;
  name.target = '_blank'; name.rel = 'noopener noreferrer';
  who.appendChild(name);
  who.appendChild(el('span', 'handle', `@${post.author.handle}`));
  head.appendChild(who);

  const when = el('a', 'when', post.createdAt ? new Date(post.createdAt).toLocaleString(undefined,
    { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '');
  when.href = `https://bsky.app/profile/${post.author.did}/post/${post.uri.split('/').pop()}`;
  when.target = '_blank'; when.rel = 'noopener noreferrer';
  head.appendChild(when);
  card.appendChild(head);

  if (post.text) card.appendChild(renderText(post.text, post.facets));

  const media = extractMedia(post.embed);
  if (media.length) card.appendChild(renderMedia(media));

  if (post.likeCount || post.repostCount || post.replyCount) {
    card.appendChild(el('div', 'counts',
      `${post.likeCount} likes · ${post.repostCount} reposts · ${post.replyCount} replies`));
  }
  return card;
}

function renderMedia(items) {
  const wrap = el('div', 'media');
  for (const m of items) {
    if (m.type === 'image') {
      const a = el('a', 'shot');
      a.href = m.fullsize || m.thumb;
      a.target = '_blank'; a.rel = 'noopener noreferrer';
      const img = el('img');
      img.src = m.thumb || m.fullsize; img.alt = m.alt || ''; img.loading = 'lazy';
      a.appendChild(img);
      wrap.appendChild(a);
    } else if (m.type === 'video') {
      const v = el('video');
      v.src = m.playlist; v.poster = m.thumbnail || ''; v.controls = true; v.preload = 'none';
      wrap.appendChild(v);
    } else if (m.type === 'external') {
      const a = el('a', 'card');
      a.href = m.uri; a.target = '_blank'; a.rel = 'noopener noreferrer';
      a.appendChild(el('div', 'card-title', m.title || m.uri));
      if (m.description) a.appendChild(el('div', 'card-desc', m.description));
      wrap.appendChild(a);
    } else if (m.type === 'quote') {
      wrap.appendChild(renderQuote(m));
    }
  }
  return wrap;
}

function renderQuote(q) {
  const box = el('div', 'quote');
  const head = el('div', 'quote-head');
  head.appendChild(el('span', 'handle', `@${q.author?.handle || '…'}`));
  box.appendChild(head);
  if (q.text) box.appendChild(el('div', 'quote-text', q.text));
  const inner = (q.embeds || []).filter((m) => m.type === 'image');
  if (inner.length) box.appendChild(renderMedia(inner));
  if (q.uri) {
    const a = el('a', 'quote-link', 'open');
    a.href = `https://bsky.app/profile/${q.author?.did}/post/${q.uri.split('/').pop()}`;
    a.target = '_blank'; a.rel = 'noopener noreferrer';
    box.appendChild(a);
  }
  return box;
}

/** The quote wall: every post the thread's author quoted, as cards. */
function renderGallery(quotes) {
  const grid = el('div', 'wall');
  for (const q of quotes) grid.appendChild(renderQuote(q));
  return grid;
}

/**
 * Post text with its facets as real links.
 *
 * ATProto facet indices are BYTE offsets. Counting with `String.length` puts
 * the link on the wrong span the moment the post contains an emoji — which is
 * most posts — so this slices a Uint8Array and decodes each piece.
 */
function renderText(text, facets) {
  const p = el('div', 'text');
  if (!facets || !facets.length) { p.textContent = text; return p; }

  const bytes = new TextEncoder().encode(text);
  const dec = new TextDecoder();
  const sorted = [...facets].sort((a, b) => (a.index?.byteStart || 0) - (b.index?.byteStart || 0));
  let at = 0;

  for (const facet of sorted) {
    const start = facet.index?.byteStart ?? 0;
    const end = facet.index?.byteEnd ?? 0;
    if (start < at || end <= start) continue;
    if (start > at) p.appendChild(document.createTextNode(dec.decode(bytes.slice(at, start))));

    const body = dec.decode(bytes.slice(start, end));
    const feature = facet.features?.[0] || {};
    const type = feature.$type || '';
    if (type.includes('#link') || type.includes('#mention') || type.includes('#tag')) {
      const a = el('a', 'facet', body);
      a.href = type.includes('#link') ? feature.uri
        : type.includes('#mention') ? `https://bsky.app/profile/${feature.did}`
          : `https://bsky.app/search?q=${encodeURIComponent(`#${feature.tag}`)}`;
      a.target = '_blank'; a.rel = 'noopener noreferrer';
      p.appendChild(a);
    } else {
      p.appendChild(document.createTextNode(body));
    }
    at = end;
  }
  if (at < bytes.length) p.appendChild(document.createTextNode(dec.decode(bytes.slice(at))));
  return p;
}

// ───────────────────────────────────────────────────────────── booting ──

$('#form').addEventListener('submit', (e) => { e.preventDefault(); load($('#url').value); });

const initial = new URLSearchParams(location.search).get('p');
if (initial) { $('#url').value = initial; load(initial); }

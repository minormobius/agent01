/**
 * bsky.mino.mobi — a frontend-only AppView.
 *
 * The whole point: this page answers AppView questions with no database of its
 * own, by leaning on the three public services that already did the aggregation.
 *
 *   timeline  ← Jetstream v2 live tail, `dids` filtered to the follow graph.
 *               The server does the fan-out. One WebSocket, no auth, no key.
 *   counts    ← Constellation, the global backlink index. Likes/reposts/replies
 *               for any at:// URI, for any lexicon, no auth.
 *   who       ← the public AppView, for profile hydration only (display names,
 *               avatars). Deliberately NOT for the feed itself — that would
 *               make this a client, not an AppView.
 *
 * History comes from the same socket: the live tail's cursor accepts a
 * unix-microsecond timestamp, so `since` replays up to LOOKBACK_HOURS (~36h,
 * measured) of the past before cutting over to live — unauthenticated, no key,
 * no fan-out. Only history OLDER than that window needs the archive, which is
 * API-keyed and metered and lives behind worker.js at /api/replay/*.
 */

import { JetstreamClient, KIND, eventUri, LOOKBACK_HOURS, clampSince } from '/packages/atproto/jetstream.js';
import { postCounts } from '/packages/atproto/constellation.js';
import { getProfiles, getFollows, getListMembers } from '/packages/atproto/bsky.js';

const BSKY_PUBLIC = 'https://public.api.bsky.app';
const MAX_POSTS = 400;          // ring buffer; the DOM is the only store
const HYDRATE_EVERY = 900;      // ms between profile-hydration sweeps

const $ = (id) => document.getElementById(id);

const state = {
  client: null,
  dids: [],
  posts: new Map(),             // at:// URI → post (idempotency key; Jetstream
                                // delivery is at-least-once)
  profiles: new Map(),          // did → profile
  pendingProfiles: new Set(),
  seen: 0,
  started: 0,
  rateWindow: [],
};

// ─── identity ────────────────────────────────────────────────────

async function resolveActor(input) {
  const raw = input.trim().replace(/^@/, '').replace(/^https?:\/\/bsky\.app\/profile\//, '');
  if (raw.startsWith('did:')) return raw;
  const res = await fetch(
    `${BSKY_PUBLIC}/xrpc/com.atproto.identity.resolveHandle?handle=${encodeURIComponent(raw)}`
  );
  if (!res.ok) throw new Error(`could not resolve "${raw}"`);
  const { did } = await res.json();
  return did;
}

// ─── the subscription ────────────────────────────────────────────

async function start() {
  const source = $('source').value;
  const input = $('actor').value.trim();
  if (!input) return status('enter a handle or a list URI', true);

  stop();
  reset();
  status('resolving…');

  let dids;
  try {
    if (source === 'list') {
      dids = await getListMembers(input);
    } else {
      const did = await resolveActor(input);
      status('reading the follow graph…');
      // 100 pages × 100 = the 10,000 Jetstream accepts, which is also where
      // this design stops being free.
      dids = await getFollows(did, 100);
      if ($('include-self').checked) dids.unshift(did);
    }
  } catch (err) {
    return status(err.message, true);
  }

  if (!dids.length) return status('no accounts found for that source', true);

  state.dids = dids;
  state.started = Date.now();

  const overflow = dids.length > 10_000;
  const requested = Number($('depth').value);
  status(
    `subscribing to ${dids.length.toLocaleString()} accounts` +
    (overflow ? ' — capped at Jetstream\'s 10,000 limit' : '') +
    ` · ${describeDepth(requested)}`
  );

  state.client = new JetstreamClient({
    dids,
    since: requested,
    collections: ['app.bsky.feed.post'],
    kinds: [KIND.commit],
    onEvent: onEvent,
    onConnect: (host) => {
      $('conn').textContent = host.replace('wss://', '');
      $('conn').className = 'live';
      const d = clampSince(requested);
      status(
        (d ? `replaying ${d}h, then live` : 'live') +
        ` · the server is fanning out ${dids.length.toLocaleString()} accounts for you`
      );
    },
    onDisconnect: () => { $('conn').className = 'dead'; },
    onError: (e) => console.warn('jetstream', e),
  });
  state.client.connect();

  $('go').textContent = 'stop';
  $('go').dataset.running = '1';
}

function stop() {
  state.client?.close();
  state.client = null;
  $('conn').className = 'dead';
  $('go').textContent = 'go';
  delete $('go').dataset.running;
}

function reset() {
  state.posts.clear();
  state.seen = 0;
  state.rateWindow = [];
  $('feed').innerHTML = '';
  $('empty').hidden = false;
}

// ─── events → posts ──────────────────────────────────────────────

function onEvent(payload) {
  if (payload.$type && !payload.$type.endsWith('#commit')) return;
  if (payload.collection !== 'app.bsky.feed.post') return;

  const uri = eventUri(payload);
  if (!uri) return;

  if (payload.operation === 'delete') {
    state.posts.delete(uri);
    document.querySelector(`[data-uri="${CSS.escape(uri)}"]`)?.remove();
    return;
  }

  const record = payload.record;
  if (!record || typeof record.text !== 'string') return;

  // Replies are a different product from a timeline; the real AppView hides
  // most of them too. Keep the toggle honest rather than silently dropping.
  if (record.reply && !$('show-replies').checked) return;

  state.seen++;
  state.rateWindow.push(Date.now());

  if (state.posts.has(uri)) return;      // at-least-once delivery
  state.posts.set(uri, { uri, payload, record });

  if (!state.profiles.has(payload.did)) state.pendingProfiles.add(payload.did);

  render({ uri, payload, record });
  trim();
  $('empty').hidden = true;
}

function trim() {
  while (state.posts.size > MAX_POSTS) {
    const oldest = state.posts.keys().next().value;
    state.posts.delete(oldest);
    document.querySelector(`[data-uri="${CSS.escape(oldest)}"]`)?.remove();
  }
}

// ─── rendering ───────────────────────────────────────────────────

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
));

function render({ uri, payload, record }) {
  const el = document.createElement('article');
  el.className = 'post';
  el.dataset.uri = uri;
  el.dataset.did = payload.did;

  const profile = state.profiles.get(payload.did);
  const rkey = payload.rkey;
  const webUrl = `https://bsky.app/profile/${payload.did}/post/${rkey}`;

  el.innerHTML = `
    <div class="who">
      <img class="avatar" alt="" src="${profile?.avatar ? esc(profile.avatar) : transparent()}">
      <a class="handle" href="https://bsky.app/profile/${esc(payload.did)}" target="_blank" rel="noopener">
        ${esc(profile?.handle ?? payload.did.slice(0, 24) + '…')}
      </a>
      <time datetime="${esc(record.createdAt ?? '')}">${when(record.createdAt)}</time>
    </div>
    <div class="text">${esc(record.text) || '<span class="muted">(no text)</span>'}</div>
    ${embedLine(record)}
    <div class="foot">
      <button class="counts" data-uri="${esc(uri)}">counts ↻</button>
      <a href="${webUrl}" target="_blank" rel="noopener">open ↗</a>
    </div>`;

  $('feed').prepend(el);
}

function embedLine(record) {
  const t = record.embed?.$type;
  if (!t) return '';
  const label = {
    'app.bsky.embed.images': 'images',
    'app.bsky.embed.video': 'video',
    'app.bsky.embed.external': 'link',
    'app.bsky.embed.record': 'quote',
    'app.bsky.embed.recordWithMedia': 'quote + media',
  }[t] ?? t;
  return `<div class="embed">⧉ ${esc(label)}</div>`;
}

const transparent = () =>
  'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg"/>');

function when(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(+d)) return '';
  const s = Math.max(0, (Date.now() - d) / 1000);
  if (s < 60) return `${s | 0}s`;
  if (s < 3600) return `${(s / 60) | 0}m`;
  return `${(s / 3600) | 0}h`;
}

// ─── hydration: profiles, in batches, out of band ────────────────

async function hydrate() {
  if (!state.pendingProfiles.size) return;
  const batch = [...state.pendingProfiles].slice(0, 25);
  batch.forEach((d) => state.pendingProfiles.delete(d));

  const got = await getProfiles(batch);
  for (const [did, profile] of got) {
    state.profiles.set(did, profile);
    for (const el of document.querySelectorAll(`[data-did="${CSS.escape(did)}"]`)) {
      const h = el.querySelector('.handle');
      const a = el.querySelector('.avatar');
      if (h) h.textContent = profile.handle ?? did;
      if (a && profile.avatar) a.src = profile.avatar;
    }
  }
}

// ─── counts: Constellation, on demand ────────────────────────────

async function showCounts(button) {
  const uri = button.dataset.uri;
  button.disabled = true;
  button.textContent = '…';
  try {
    const c = await postCounts(uri);
    button.replaceWith(Object.assign(document.createElement('span'), {
      className: 'counts-out',
      textContent: `♡ ${c.likeCount}  ↻ ${c.repostCount}  ↳ ${c.replyCount}  ❝ ${c.quoteCount}`,
    }));
  } catch {
    button.textContent = 'counts unavailable';
    button.disabled = false;
  }
}

// ─── history ─────────────────────────────────────────────────────

/**
 * Nothing to do: history arrives through the same socket. `start()` passes
 * `since` to the client, which converts it to a microsecond cursor, and the
 * server replays from there and cuts over to live without a seam.
 *
 * The one thing worth surfacing is the clamp. Past ~36h the server silently
 * gives you the oldest it has instead of erroring, so the UI reports the depth
 * the client actually asked for rather than the one the user picked.
 */
function describeDepth(requestedHours) {
  const actual = clampSince(requestedHours);
  if (!actual) return 'live only, from now';
  const clamped = actual < requestedHours;
  return `replaying ${actual}h of history`
       + (clamped ? ` — ${requestedHours}h was asked for, but the window is ${LOOKBACK_HOURS}h` : '');
}

async function checkReplay() {
  try {
    const res = await fetch('/api/health');
    const { replay, note } = await res.json();
    $('replay-note').textContent = replay
      ? `deep archive: on (older than ${LOOKBACK_HOURS}h)`
      : `deep archive: off — history beyond ${LOOKBACK_HOURS}h needs an API key`;
    $('replay-note').title = note ?? '';
  } catch {
    $('replay-note').textContent = 'deep archive: unknown (worker unreachable)';
  }
}

// ─── chrome ──────────────────────────────────────────────────────

function status(msg, isError = false) {
  const el = $('status');
  el.textContent = msg;
  el.classList.toggle('err', isError);
}

function tickStats() {
  const now = Date.now();
  state.rateWindow = state.rateWindow.filter((t) => now - t < 10_000);
  const rate = (state.rateWindow.length / 10).toFixed(1);
  $('stat-rate').textContent = `${rate}/s`;
  $('stat-seen').textContent = state.seen.toLocaleString();
  $('stat-held').textContent = state.posts.size.toLocaleString();
  $('stat-dids').textContent = state.dids.length.toLocaleString();
  $('stat-cursor').textContent = state.client?.cursor ?? '—';
}

// ─── wiring ──────────────────────────────────────────────────────

$('go').addEventListener('click', () => {
  if ($('go').dataset.running) stop(); else start();
});
$('actor').addEventListener('keydown', (e) => { if (e.key === 'Enter') start(); });
$('feed').addEventListener('click', (e) => {
  const b = e.target.closest('button.counts');
  if (b) showCounts(b);
});
$('source').addEventListener('change', () => {
  const list = $('source').value === 'list';
  $('actor').placeholder = list ? 'at://did:plc:…/app.bsky.graph.list/… or a bsky list URL' : 'handle, e.g. bsky.app';
  $('self-wrap').hidden = list;
});

setInterval(hydrate, HYDRATE_EVERY);
setInterval(tickStats, 1000);
checkReplay();

// Deep link: ?actor=handle starts immediately.
const q = new URLSearchParams(location.search);
if (q.get('actor')) { $('actor').value = q.get('actor'); start(); }

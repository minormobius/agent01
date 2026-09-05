/**
 * bsky.mino.mobi — a frontend-only AppView.
 *
 * No database, no backend, no account required to read.
 *
 *   timeline  ← Jetstream v2 live tail, `dids`-filtered to a follow graph.
 *               The server does the fan-out; the ~36h window replays history
 *               over the same unauthenticated socket.
 *   history   ← that window, PLUS everything this browser has already stored.
 *               See lib/cache.js — the cache is what makes the 36h limit stop
 *               mattering after the first few visits.
 *   counts    ← Constellation, the global backlink index. Any at:// URI, any
 *               lexicon, no auth.
 *   who       ← the public AppView, for profile hydration and typeahead only.
 *   posting   ← the shared OAuth worker, narrow scope. See lib/compose.js.
 *
 * The only thing needing a key is archive history older than the window, and
 * that is the user's own key, spent from their own quota — see lib/archive.js.
 */

import { JetstreamClient, KIND, eventUri, LOOKBACK_HOURS, clampSince }
  from '/packages/atproto/jetstream.js';
import { postCounts } from '/packages/atproto/constellation.js';
import { getProfiles, getFollows, getListMembers, resolveActor, getProfile }
  from '/packages/atproto/bsky.js';
import { attachTypeahead } from '/lib/typeahead.js';
import * as cache from '/lib/cache.js';
import { auth, publish, graphemeLength, MAX_GRAPHEMES } from '/lib/compose.js';

const MAX_RENDERED = 400;
const HYDRATE_EVERY = 900;

const $ = (id) => document.getElementById(id);

const state = {
  client: null,
  dids: [],
  subKey: null,
  rendered: new Map(),      // uri -> post (idempotency; at-least-once delivery)
  profiles: new Map(),
  pending: new Set(),
  writeQueue: [],           // batched IndexedDB writes
  seen: 0,
  rate: [],
  view: 'feed',
  cacheOk: false,
};

// ─── routing ─────────────────────────────────────────────────────

function route() {
  const hash = location.hash.slice(1) || '/';
  const [, section, arg] = hash.split('/');
  if (section === 'profile' && arg) return showProfile(decodeURIComponent(arg));
  showFeed();
}

function showFeed() {
  state.view = 'feed';
  $('profile-view').hidden = true;
  $('feed-view').hidden = false;
}

// ─── the subscription ────────────────────────────────────────────

async function start() {
  const source = $('source').value;
  const input = $('actor').value.trim();
  if (!input) return status('enter a handle or a list URI', true);

  stop();
  resetFeed();
  status('resolving…');

  let dids;
  try {
    if (source === 'list') {
      dids = await getListMembers(input);
    } else {
      const did = await resolveActor(input);
      status('reading the follow graph…');
      dids = await getFollows(did, 100);
      if ($('include-self').checked) dids.unshift(did);
    }
  } catch (err) {
    return status(err.message, true);
  }
  if (!dids.length) return status('no accounts found for that source', true);

  state.dids = dids;
  state.subKey = cache.subscriptionKey(dids);

  // 1. Paint from the local store first. This is instant and works offline;
  //    the socket then fills forward from wherever we left off.
  let restored = 0;
  if (state.cacheOk) {
    try {
      const held = await cache.recentPosts({ limit: 200 });
      for (const p of held) renderPost(p, 'append');
      restored = held.length;
    } catch { /* a cache miss is never fatal */ }
  }

  // 2. Decide how to reconnect — resume by seq if we can, else replay a window.
  //    lib/cache.js explains why this distinction is the whole design.
  const requested = Number($('depth').value);
  const plan = state.cacheOk
    ? await cache.resumePlan(state.subKey, requested)
    : { mode: 'since', hours: requested, reason: 'no local store' };

  if (plan.mode === 'since' && plan.reason !== 'first visit' && restored) {
    // We have posts but cannot bridge to them: say so rather than letting the
    // feed imply continuity it does not have.
    await cache.recordGap(state.subKey, {
      from: Date.now() - plan.hours * 3_600_000, to: Date.now(), reason: plan.reason,
    }).catch(() => {});
  }

  const opts = {
    dids,
    collections: ['app.bsky.feed.post'],
    kinds: [KIND.commit],
    onEvent,
    onConnect: () => {
      $('conn').className = 'live';
      status(
        (plan.mode === 'resume'
          ? `resumed at seq ${plan.cursor}`
          : clampSince(plan.hours) ? `replaying ${clampSince(plan.hours)}h` : 'live')
        + ` · ${dids.length.toLocaleString()} accounts, one socket`
        + (restored ? ` · ${restored} from cache` : '')
      );
    },
    onDisconnect: () => { $('conn').className = 'dead'; },
    onError: (e) => console.warn('jetstream', e),
  };
  if (plan.mode === 'resume') opts.cursor = plan.cursor; else opts.since = plan.hours;

  state.client = new JetstreamClient(opts);
  state.client.connect();

  $('go').textContent = 'stop';
  $('go').dataset.running = '1';
  if (plan.mode === 'since' && plan.reason !== 'first visit') {
    status(`${plan.reason} — gap recorded`, false);
  }
}

function stop() {
  state.client?.close();
  state.client = null;
  $('conn').className = 'dead';
  $('go').textContent = 'go';
  delete $('go').dataset.running;
  flushWrites();
}

function resetFeed() {
  state.rendered.clear();
  state.seen = 0;
  state.rate = [];
  $('feed').innerHTML = '';
  $('empty').hidden = false;
}

// ─── events ──────────────────────────────────────────────────────

function onEvent(payload) {
  if (payload.collection !== 'app.bsky.feed.post') return;
  const uri = eventUri(payload);
  if (!uri) return;

  if (payload.operation === 'delete') {
    state.rendered.delete(uri);
    document.querySelector(`[data-uri="${CSS.escape(uri)}"]`)?.remove();
    if (state.cacheOk) cache.deletePost(uri).catch(() => {});
    return;
  }

  const record = payload.record;
  if (!record || typeof record.text !== 'string') return;

  state.seen++;
  state.rate.push(Date.now());

  const post = {
    uri,
    did: payload.did,
    rkey: payload.rkey,
    seq: payload.seq,
    createdAt: record.createdAt || new Date().toISOString(),
    record,
  };

  // Always store, even replies we do not render — the cache is the archive, and
  // what is filtered from THIS view may be wanted by a profile view later.
  if (state.cacheOk) {
    state.writeQueue.push(post);
    if (state.writeQueue.length >= 100) flushWrites();
  }

  if (record.reply && !$('show-replies').checked) return;
  if (state.rendered.has(uri)) return;      // at-least-once delivery

  state.rendered.set(uri, post);
  if (!state.profiles.has(post.did)) state.pending.add(post.did);
  renderPost(post, 'prepend');
  trim();
  $('empty').hidden = true;
}

function flushWrites() {
  if (!state.writeQueue.length || !state.cacheOk) return;
  const batch = state.writeQueue;
  state.writeQueue = [];
  cache.putPosts(batch).catch(() => {});
  const newest = batch.reduce((m, p) => (p.seq > (m?.seq ?? -1) ? p : m), null);
  if (newest?.seq && state.subKey) cache.saveCursor(state.subKey, newest.seq).catch(() => {});
}

function trim() {
  while (state.rendered.size > MAX_RENDERED) {
    const oldest = state.rendered.keys().next().value;
    state.rendered.delete(oldest);
    document.querySelector(`[data-uri="${CSS.escape(oldest)}"]`)?.remove();
  }
}

// ─── rendering ───────────────────────────────────────────────────

const esc = (s) => String(s).replace(/[&<>"']/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const BLANK = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg"/>');

function renderPost(post, where = 'prepend', into = 'feed') {
  const el = document.createElement('article');
  el.className = 'post';
  el.dataset.uri = post.uri;
  el.dataset.did = post.did;

  const p = state.profiles.get(post.did);
  el.innerHTML = `
    <div class="who">
      <img class="avatar" alt="" src="${p?.avatar ? esc(p.avatar) : BLANK}">
      <a class="handle" href="#/profile/${encodeURIComponent(p?.handle || post.did)}">
        ${esc(p?.handle ?? post.did.slice(0, 22) + '…')}
      </a>
      <time datetime="${esc(post.createdAt)}">${when(post.createdAt)}</time>
    </div>
    <div class="text">${esc(post.record.text) || '<span class="muted">(no text)</span>'}</div>
    ${embedLine(post.record)}
    <div class="foot">
      <button class="counts" data-uri="${esc(post.uri)}">counts &#8635;</button>
      <a href="https://bsky.app/profile/${esc(post.did)}/post/${esc(post.rkey)}"
         target="_blank" rel="noopener">open &#8599;</a>
    </div>`;

  const parent = $(into);
  if (where === 'prepend') parent.prepend(el); else parent.append(el);
  if (!state.profiles.has(post.did)) state.pending.add(post.did);
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
  return `<div class="embed">&#8687; ${esc(label)}</div>`;
}

function when(iso) {
  const d = new Date(iso);
  if (Number.isNaN(+d)) return '';
  const s = Math.max(0, (Date.now() - d) / 1000);
  if (s < 60) return `${s | 0}s`;
  if (s < 3600) return `${(s / 60) | 0}m`;
  if (s < 86400) return `${(s / 3600) | 0}h`;
  return `${(s / 86400) | 0}d`;
}

// ─── hydration ───────────────────────────────────────────────────

async function hydrate() {
  if (!state.pending.size) return;
  const batch = [...state.pending].slice(0, 25);
  batch.forEach((d) => state.pending.delete(d));

  // Try the cache first — a stored profile costs no request at all.
  const need = [];
  for (const did of batch) {
    const hit = state.cacheOk ? await cache.getCachedProfile(did).catch(() => null) : null;
    if (hit) applyProfile(hit); else need.push(did);
  }
  if (!need.length) return;

  const got = await getProfiles(need);
  for (const [, profile] of got) {
    applyProfile(profile);
    if (state.cacheOk) cache.putProfile(profile).catch(() => {});
  }
}

function applyProfile(profile) {
  state.profiles.set(profile.did, profile);
  for (const el of document.querySelectorAll(`[data-did="${CSS.escape(profile.did)}"]`)) {
    const h = el.querySelector('.handle');
    const a = el.querySelector('.avatar');
    if (h && profile.handle) {
      h.textContent = profile.handle;
      h.setAttribute('href', `#/profile/${encodeURIComponent(profile.handle)}`);
    }
    if (a && profile.avatar) a.src = profile.avatar;
  }
}

// ─── counts ──────────────────────────────────────────────────────

async function showCounts(button) {
  button.disabled = true;
  button.textContent = '…';
  try {
    const c = await postCounts(button.dataset.uri);
    button.replaceWith(Object.assign(document.createElement('span'), {
      className: 'counts-out',
      textContent: `♡ ${c.likeCount}  ↻ ${c.repostCount}  ↳ ${c.replyCount}  ❝ ${c.quoteCount}`,
    }));
  } catch {
    button.textContent = 'unavailable';
    button.disabled = false;
  }
}

// ─── profile view ────────────────────────────────────────────────

async function showProfile(actor) {
  state.view = 'profile';
  $('feed-view').hidden = true;
  $('profile-view').hidden = false;
  $('profile-posts').innerHTML = '';
  $('profile-head').innerHTML = '<div class="muted">loading…</div>';

  let did;
  try { did = await resolveActor(actor); }
  catch { $('profile-head').innerHTML = `<div class="muted">could not resolve ${esc(actor)}</div>`; return; }

  const p = await getProfile(did);
  if (p) {
    state.profiles.set(p.did, p);
    if (state.cacheOk) cache.putProfile(p).catch(() => {});
  }

  $('profile-head').innerHTML = `
    <img class="pavatar" alt="" src="${p?.avatar ? esc(p.avatar) : BLANK}">
    <div class="pmeta">
      <div class="pname">${esc(p?.displayName || p?.handle || did)}</div>
      <div class="phandle">@${esc(p?.handle || did)}</div>
      ${p?.description ? `<div class="pdesc">${esc(p.description)}</div>` : ''}
      <div class="pstats">
        <span><b>${(p?.followersCount ?? 0).toLocaleString()}</b> followers</span>
        <span><b>${(p?.followsCount ?? 0).toLocaleString()}</b> following</span>
        <span><b>${(p?.postsCount ?? 0).toLocaleString()}</b> posts</span>
      </div>
      <div class="pactions">
        <a href="https://bsky.app/profile/${esc(did)}" target="_blank" rel="noopener">on bsky.app &#8599;</a>
        <button id="watch-profile" class="ghost">watch live</button>
      </div>
    </div>`;

  // Posts we already hold for this account — free, instant, and often the only
  // thing available for a quiet account whose posts predate the window.
  let held = [];
  if (state.cacheOk) held = await cache.recentPosts({ did, limit: 100 }).catch(() => []);
  if (held.length) {
    for (const post of held) renderPost(post, 'append', 'profile-posts');
    $('profile-note').textContent = `${held.length} posts from this browser's store`;
  } else {
    $('profile-note').textContent =
      'Nothing stored for this account yet. "watch live" subscribes to them; '
      + 'anything they post from now on is kept here.';
  }

  $('watch-profile')?.addEventListener('click', () => {
    $('source').value = 'follows';
    $('actor').value = p?.handle || did;
    $('include-self').checked = true;
    location.hash = '#/';
    start();
  });
}

// ─── composer ────────────────────────────────────────────────────

async function initAuth() {
  const a = auth();
  try { await a.init(); } catch { /* offline: the read-only app still works */ }
  a.onAuthChange(renderAuth);
  renderAuth();
}

function renderAuth() {
  const a = auth();
  const user = a.getUser();
  $('auth-state').innerHTML = user
    ? `<span class="muted">@${esc(user.handle)}</span> <button id="signout" class="ghost">sign out</button>`
    : `<button id="signin" class="ghost">sign in to post</button>`;
  $('composer').hidden = !user;
  $('signout')?.addEventListener('click', () => a.logout());
  $('signin')?.addEventListener('click', () => {
    const handle = prompt('Your Bluesky handle:');
    if (handle) a.login(handle.trim().replace(/^@/, ''), { scope: 'atproto repo:app.bsky.feed.post' });
  });
}

function updateCount() {
  const n = graphemeLength($('compose-text').value);
  const el = $('compose-count');
  el.textContent = `${n}/${MAX_GRAPHEMES}`;
  el.className = n > MAX_GRAPHEMES ? 'over' : '';
  $('compose-send').disabled = n === 0 || n > MAX_GRAPHEMES;
}

async function send() {
  const text = $('compose-text').value;
  $('compose-send').disabled = true;
  $('compose-status').textContent = 'posting…';
  try {
    const res = await publish(text, { resolveHandle: (h) => resolveActor(h).catch(() => null) });
    $('compose-text').value = '';
    updateCount();
    $('compose-status').innerHTML =
      `posted &middot; <a href="https://bsky.app/profile/${esc(auth().getUser()?.handle || '')}"
        target="_blank" rel="noopener">view</a>`;
    void res;
  } catch (err) {
    $('compose-status').textContent = err.message;
    $('compose-send').disabled = false;
  }
}

// ─── deep history (the visitor's own key) ────────────────────────

// Loaded lazily: the SDK bundle and the zstd WASM are ~570 KB together, and a
// visitor who never reaches past the live window should never pay for them.
let archiveMod = null;
async function archive() {
  if (!archiveMod) archiveMod = await import('/lib/archive.js');
  return archiveMod;
}

async function renderKeyState() {
  const a = await archive().catch(() => null);
  if (!a) return;
  const on = a.hasKey();
  $('key-state').textContent = on ? '· key saved' : '· no key';
  $('key-state').className = on ? 'on' : 'muted';
  $('quota').textContent = a.quotaSummary() || '';
  $('deeper').disabled = !on;
  $('deeper').title = on
    ? 'Fetch history older than the live window, using your key and your quota.'
    : 'Add your own Jetstream key below to reach past ~36h.';
}

async function fetchDeeper() {
  if (!state.dids.length) return status('subscribe to something first', true);
  const a = await archive();

  // Start from the oldest thing we hold, so this fills backwards from the
  // store rather than re-downloading what the live window already gave us.
  let beforeSeq;
  if (state.cacheOk) {
    const held = await cache.recentPosts({ limit: 5000 }).catch(() => []);
    const seqs = held.map((p) => p.seq).filter(Boolean);
    if (seqs.length) beforeSeq = Math.min(...seqs);
  }

  const btn = $('deeper');
  btn.disabled = true;
  const controller = new AbortController();
  const batch = [];
  status(`archive: fetching older history for ${state.dids.length} accounts…`);

  try {
    const { events, stopped } = await a.fetchOlder({
      dids: state.dids,
      beforeSeq,
      maxEvents: 5000,
      signal: controller.signal,
      onEvent: (post) => {
        batch.push(post);
        if (batch.length >= 200 && state.cacheOk) cache.putPosts(batch.splice(0)).catch(() => {});
      },
      onProgress: (n) => {
        status(`archive: ${n.toLocaleString()} posts… ${a.quotaSummary() || ''}`);
      },
    });
    if (batch.length && state.cacheOk) await cache.putPosts(batch).catch(() => {});
    status(`archive: ${events.toLocaleString()} older posts stored — ${stopped}. ${a.quotaSummary() || ''}`);
    await refreshStorage();
  } catch (err) {
    status(`archive: ${err.message}`, true);
  } finally {
    btn.disabled = false;
    renderKeyState();
  }
}

// ─── storage panel ───────────────────────────────────────────────

async function refreshStorage() {
  if (!state.cacheOk) { $('store-stat').textContent = 'no local store (private window?)'; return; }
  const [n, est, gaps] = await Promise.all([
    cache.countPosts().catch(() => 0),
    cache.estimate(),
    state.subKey ? cache.getGaps(state.subKey) : [],
  ]);
  const mb = est ? ` · ${(est.usage / 1048576).toFixed(1)} MB of ${(est.quota / 1048576 / 1024).toFixed(1)} GB` : '';
  $('store-stat').textContent = `${n.toLocaleString()} posts stored${mb}`
    + (gaps.length ? ` · ${gaps.length} gap${gaps.length > 1 ? 's' : ''}` : '');
}

// ─── chrome ──────────────────────────────────────────────────────

function status(msg, isError = false) {
  const el = $('status');
  el.textContent = msg;
  el.classList.toggle('err', isError);
}

function tickStats() {
  const now = Date.now();
  state.rate = state.rate.filter((t) => now - t < 10_000);
  $('stat-rate').textContent = `${(state.rate.length / 10).toFixed(1)}/s`;
  $('stat-seen').textContent = state.seen.toLocaleString();
  $('stat-dids').textContent = state.dids.length.toLocaleString();
  $('stat-cursor').textContent = state.client?.cursor ?? '—';
}

// ─── wiring ──────────────────────────────────────────────────────

$('go').addEventListener('click', () => { if ($('go').dataset.running) stop(); else start(); });
$('actor').addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !document.querySelector('.ta-menu:not([hidden]) li.on')) start();
});
document.addEventListener('click', (e) => {
  const b = e.target.closest('button.counts');
  if (b) showCounts(b);
});
$('source').addEventListener('change', () => {
  const list = $('source').value === 'list';
  $('actor').placeholder = list ? 'at:// list URI or a bsky list URL' : 'handle, e.g. bsky.app';
  $('self-wrap').hidden = list;
});
$('compose-text').addEventListener('input', updateCount);
$('compose-send').addEventListener('click', send);
$('clear-store').addEventListener('click', async () => {
  if (!confirm('Delete every post and profile this browser has stored?')) return;
  await cache.clearAll();
  refreshStorage();
  status('local store cleared — the next subscribe starts from the window again');
});
$('deeper').addEventListener('click', fetchDeeper);
$('savekey').addEventListener('click', async () => {
  const a = await archive();
  a.setKey($('apikey').value);
  $('apikey').value = '';
  await renderKeyState();
  status(a.hasKey() ? 'key saved in this browser only' : 'key cleared');
});
$('dropkey').addEventListener('click', async () => {
  const a = await archive();
  a.setKey('');
  await renderKeyState();
  status('key removed from this browser');
});
window.addEventListener('hashchange', route);
// Flushing on hide rather than unload is what actually survives a mobile tab
// switch; unload does not fire reliably on iOS.
document.addEventListener('visibilitychange', () => { if (document.hidden) flushWrites(); });

// Typeahead on every handle input.
attachTypeahead($('actor'), { onPick: () => start() });
attachTypeahead($('lookup'), { onPick: (a) => { location.hash = `#/profile/${encodeURIComponent(a.handle)}`; } });

setInterval(hydrate, HYDRATE_EVERY);
setInterval(tickStats, 1000);
setInterval(() => { flushWrites(); refreshStorage(); }, 15_000);

(async () => {
  state.cacheOk = await cache.available();
  $('lookback').textContent = String(LOOKBACK_HOURS);
  await refreshStorage();
  await renderKeyState();
  initAuth();
  route();
  const q = new URLSearchParams(location.search);
  if (q.get('actor')) { $('actor').value = q.get('actor'); start(); }
})();

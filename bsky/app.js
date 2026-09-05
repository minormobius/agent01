/**
 * bsky.mino.mobi — a Bluesky client with no database.
 *
 * Three tabs, a compose sheet, and posts. Everything below the UI is the same
 * frontend-only AppView it always was:
 *
 *   Home    an algorithmic feed by default (simcluster, this repo's own feed
 *           generator at feed.mino.mobi — a skeleton of at:// URIs hydrated by
 *           getPosts), or a LIVE follow-graph timeline over one Jetstream
 *           socket, or whatever this browser has stored.
 *   Notifs  built from Constellation, the global backlink index. A notification
 *           IS a backlink, so this works with no account at all.
 *   Me      your profile, the local store, and the deep-history key.
 *
 * No DMs. They are not protocol records — chat.bsky.* is a centralised service
 * that never touches the firehose — so nothing in this design can reach them.
 * See bsky/CLAUDE.md.
 */

import { JetstreamClient, KIND, eventUri, LOOKBACK_HOURS, clampSince }
  from '/packages/atproto/jetstream.js';
import { postCounts } from '/packages/atproto/constellation.js';
import { getProfiles, getFollows, resolveActor, getProfile } from '/packages/atproto/bsky.js';
import { FEEDS, loadFeed, authorFeed, notifications } from '/lib/sources.js';
import { attachTypeahead } from '/lib/typeahead.js';
import * as cache from '/lib/cache.js';
import { auth, publish, graphemeLength, MAX_GRAPHEMES } from '/lib/compose.js';

const $ = (id) => document.getElementById(id);
const el = (html) => { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; };
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const BLANK = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg"/>');

const state = {
  tab: 'home',
  feed: 'simcluster',       // a FEEDS id, 'live', or 'stored'
  cursor: null,
  live: null,               // JetstreamClient
  dids: [],
  subKey: null,
  seen: new Set(),          // rendered at:// URIs — delivery is at-least-once
  profiles: new Map(),
  pending: new Set(),
  writeQueue: [],
  cacheOk: false,
  me: null,                 // signed-in profile
  loading: false,
};

// ─── chrome ──────────────────────────────────────────────────────

function say(text, live = false) {
  $('statustext').textContent = text;
  $('dot').className = 'dot' + (live ? ' live' : '');
}

function showTab(tab) {
  state.tab = tab;
  for (const b of document.querySelectorAll('.tab')) b.classList.toggle('on', b.dataset.tab === tab);
  $('v-home').hidden = tab !== 'home';
  $('v-notifs').hidden = tab !== 'notifs';
  $('v-me').hidden = tab !== 'me';
  $('chips').hidden = tab !== 'home';
  $('fab').hidden = tab !== 'home';
  window.scrollTo(0, 0);
  if (tab === 'notifs') renderNotifs();
  if (tab === 'me') renderMe();
}

function renderChips() {
  const opts = [
    ...FEEDS.map((f) => ({ id: f.id, label: f.label })),
    { id: 'live', label: '⚡ live' },
    { id: 'stored', label: '⛁ stored' },
  ];
  $('chips').innerHTML = '';
  for (const o of opts) {
    const b = el(`<button class="pill${o.id === state.feed ? ' on' : ''}">${esc(o.label)}</button>`);
    b.addEventListener('click', () => selectFeed(o.id));
    $('chips').append(b);
  }
}

// ─── home ────────────────────────────────────────────────────────

async function selectFeed(id) {
  if (state.live) { state.live.close(); state.live = null; }
  state.feed = id;
  state.cursor = null;
  state.seen.clear();
  $('v-home').innerHTML = '';
  renderChips();

  if (id === 'live') return startLive();
  if (id === 'stored') return showStored();
  return loadAlgorithmic(true);
}

async function loadAlgorithmic(fresh) {
  const feed = FEEDS.find((f) => f.id === state.feed);
  if (!feed || state.loading) return;
  state.loading = true;
  say(fresh ? `loading ${feed.label}…` : 'loading more…');
  try {
    const { posts, cursor } = await loadFeed(feed.uri, { limit: 30, cursor: state.cursor });
    state.cursor = cursor;
    document.getElementById('more-btn')?.remove();

    if (!posts.length && fresh) {
      $('v-home').append(el(`<div class="empty"><strong>Nothing in this feed right now.</strong>
        ${esc(feed.blurb)}</div>`));
    }
    for (const p of posts) appendPost(p);
    // Store what the feed gave us: it is history the live window cannot reach.
    if (state.cacheOk && posts.length) cache.putPosts(posts).catch(() => {});
    if (cursor && posts.length) {
      const more = el('<button class="more" id="more-btn">load more</button>');
      more.addEventListener('click', () => loadAlgorithmic(false));
      $('v-home').append(more);
    }
    say(`${feed.label} · ${feed.blurb}`);
  } catch (err) {
    say(`could not load ${feed.label}: ${err.message}`);
  } finally {
    state.loading = false;
  }
}

async function showStored() {
  if (!state.cacheOk) {
    $('v-home').append(el(`<div class="empty"><strong>No local store.</strong>
      A private window or blocked site data means nothing can be kept here.</div>`));
    return say('no local store');
  }
  const posts = await cache.recentPosts({ limit: 100 }).catch(() => []);
  if (!posts.length) {
    $('v-home').append(el(`<div class="empty"><strong>Nothing stored yet.</strong>
      Everything this app sees is written to your browser. Read a feed or run the live
      timeline, and it accumulates here — history the network only offers for about
      ${LOOKBACK_HOURS} hours at a time.</div>`));
    return say('local store is empty');
  }
  for (const p of posts) appendPost(p);
  say(`${posts.length} posts from this browser's store`);
}

async function startLive() {
  const handle = state.me?.handle || prompt('Whose follow graph? (a handle)');
  if (!handle) { selectFeed('simcluster'); return; }
  say('reading the follow graph…');
  let dids;
  try {
    const did = await resolveActor(handle);
    dids = await getFollows(did, 100);
    dids.unshift(did);
  } catch (err) { return say(err.message); }
  if (!dids.length) return say('no follows found');

  state.dids = dids;
  state.subKey = cache.subscriptionKey(dids);

  // Paint from the store first, then fill forward from where we stopped.
  if (state.cacheOk) {
    const held = await cache.recentPosts({ limit: 80 }).catch(() => []);
    for (const p of held) appendPost(p);
  }
  const plan = state.cacheOk
    ? await cache.resumePlan(state.subKey, 6)
    : { mode: 'since', hours: 6, reason: 'no local store' };

  const opts = {
    dids, collections: ['app.bsky.feed.post'], kinds: [KIND.commit],
    onEvent: onLiveEvent,
    onConnect: () => say(`live · ${dids.length} accounts, one socket`, true),
    onDisconnect: () => say('reconnecting…'),
  };
  if (plan.mode === 'resume') opts.cursor = plan.cursor; else opts.since = plan.hours;
  state.live = new JetstreamClient(opts);
  state.live.connect();
}

function onLiveEvent(payload) {
  if (payload.collection !== 'app.bsky.feed.post') return;
  const uri = eventUri(payload);
  if (!uri) return;
  if (payload.operation === 'delete') {
    document.querySelector(`[data-uri="${CSS.escape(uri)}"]`)?.remove();
    if (state.cacheOk) cache.deletePost(uri).catch(() => {});
    return;
  }
  const record = payload.record;
  if (!record || typeof record.text !== 'string') return;

  const post = { uri, did: payload.did, rkey: payload.rkey, seq: payload.seq,
                 createdAt: record.createdAt || new Date().toISOString(), record };
  if (state.cacheOk) {
    state.writeQueue.push(post);
    if (state.writeQueue.length >= 100) flushWrites();
  }
  if (record.reply) return;                 // a timeline, not a thread view
  if (state.seen.has(uri)) return;
  prependPost(post);
}

function flushWrites() {
  if (!state.writeQueue.length || !state.cacheOk) return;
  const batch = state.writeQueue.splice(0);
  cache.putPosts(batch).catch(() => {});
  const newest = batch.reduce((m, p) => (p.seq > (m?.seq ?? -1) ? p : m), null);
  if (newest?.seq && state.subKey) cache.saveCursor(state.subKey, newest.seq).catch(() => {});
}

// ─── post rendering ──────────────────────────────────────────────

function postNode(p) {
  const prof = p.author || state.profiles.get(p.did);
  const c = p.counts;
  const node = el(`
    <article class="post" data-uri="${esc(p.uri)}" data-did="${esc(p.did)}">
      <img class="pav" alt="" src="${prof?.avatar ? esc(prof.avatar) : BLANK}">
      <div class="pbody">
        <div class="phead">
          <span class="pname">${esc(prof?.displayName || prof?.handle || 'unknown')}</span>
          <span class="phandle">@${esc(prof?.handle || p.did.slice(8, 20) + '…')}</span>
          <span class="ptime">${when(p.createdAt)}</span>
        </div>
        <div class="ptext">${esc(p.record?.text || '')}</div>
        ${embed(p.record)}
        <div class="pacts">
          <button data-act="reply">↳ <span>${c ? c.replyCount : ''}</span></button>
          <button data-act="repost">↻ <span>${c ? c.repostCount : ''}</span></button>
          <button data-act="like">♡ <span>${c ? c.likeCount : ''}</span></button>
          <button data-act="open">↗</button>
        </div>
      </div>
    </article>`);
  if (!prof && !state.profiles.has(p.did)) state.pending.add(p.did);
  node._post = p;
  return node;
}

function appendPost(p) { if (state.seen.has(p.uri)) return; state.seen.add(p.uri); $('v-home').append(postNode(p)); }
function prependPost(p) {
  if (state.seen.has(p.uri)) return;
  state.seen.add(p.uri);
  const first = $('v-home').firstElementChild;
  $('v-home').insertBefore(postNode(p), first);
}

function embed(record) {
  const t = record?.embed?.$type;
  if (!t) return '';
  const label = { 'app.bsky.embed.images': '🖼 images', 'app.bsky.embed.video': '▶ video',
    'app.bsky.embed.external': '🔗 link', 'app.bsky.embed.record': '❝ quote',
    'app.bsky.embed.recordWithMedia': '❝ quote + media' }[t] || t;
  return `<div class="pembed">${esc(label)}</div>`;
}

function when(iso) {
  const d = new Date(iso);
  if (Number.isNaN(+d)) return '';
  const s = Math.max(0, (Date.now() - d) / 1000);
  if (s < 60) return `${s | 0}s`;
  if (s < 3600) return `${(s / 60) | 0}m`;
  if (s < 86400) return `${(s / 3600) | 0}h`;
  if (s < 2592000) return `${(s / 86400) | 0}d`;
  return d.toISOString().slice(0, 10);
}

async function hydrate() {
  if (!state.pending.size) return;
  const batch = [...state.pending].slice(0, 25);
  batch.forEach((d) => state.pending.delete(d));
  const need = [];
  for (const did of batch) {
    const hit = state.cacheOk ? await cache.getCachedProfile(did).catch(() => null) : null;
    if (hit) paintProfile(hit); else need.push(did);
  }
  if (!need.length) return;
  const got = await getProfiles(need);
  for (const [, prof] of got) {
    paintProfile(prof);
    if (state.cacheOk) cache.putProfile(prof).catch(() => {});
  }
}

function paintProfile(prof) {
  state.profiles.set(prof.did, prof);
  for (const node of document.querySelectorAll(`[data-did="${CSS.escape(prof.did)}"]`)) {
    const n = node.querySelector('.pname'); const h = node.querySelector('.phandle');
    const a = node.querySelector('.pav');
    if (n) n.textContent = prof.displayName || prof.handle;
    if (h) h.textContent = '@' + prof.handle;
    if (a && prof.avatar) a.src = prof.avatar;
  }
}

// ─── notifications ───────────────────────────────────────────────

let notifsFor = null;

async function renderNotifs() {
  const v = $('v-notifs');
  const who = state.me?.handle || notifsFor;
  if (!who) {
    v.innerHTML = '';
    const box = el(`<div class="section">
      <h3>notifications for any account</h3>
      <p>Bluesky's own notifications need a session. These do not: a notification <em>is</em> a
      backlink — someone's like, reply or follow record pointing at you — and Constellation
      indexes those for the whole network. So this works signed out, for anyone.</p>
      <div class="row"><input type="text" id="nwho" placeholder="a handle"></div>
      <button class="btn" id="ngo">show</button>
    </div>`);
    v.append(box);
    attachTypeahead($('nwho'), { onPick: (a) => { notifsFor = a.handle; renderNotifs(); } });
    $('ngo').addEventListener('click', () => {
      const val = $('nwho').value.trim();
      if (val) { notifsFor = val; renderNotifs(); }
    });
    return;
  }

  v.innerHTML = '<div class="empty">reading the backlink index…</div>';
  let did;
  try { did = await resolveActor(who); }
  catch { v.innerHTML = `<div class="empty">could not resolve ${esc(who)}</div>`; return; }

  const items = await notifications(did, { postDepth: 8 }).catch(() => []);
  v.innerHTML = '';
  v.append(el(`<div class="bar">for @${esc(who)} · from Constellation, no account needed
    <span class="spacer"></span></div>`));
  if (!items.length) {
    v.append(el('<div class="empty"><strong>Nothing yet.</strong>No likes, replies or follows found for this account\'s recent posts.</div>'));
    return;
  }
  const icon = { follow: '＋', like: '♡', reply: '↳' };
  const verb = { follow: 'followed', like: 'liked your post', reply: 'replied to you' };
  for (const n of items) {
    v.append(el(`<div class="notif">
      <div class="nicon">${icon[n.kind] || '·'}</div>
      <div class="nbody">
        <b>${esc(n.actor?.displayName || n.actor?.handle || n.actorDid.slice(8, 22))}</b>
        <span class="muted">${verb[n.kind] || n.kind}</span>
        ${n.subjectText ? `<div class="nsub">${esc(n.subjectText)}</div>` : ''}
      </div>
    </div>`));
  }
  v.append(el(`<div class="empty" style="padding:18px 22px;font-size:12.5px">
    A snapshot of who interacted, not a read/unread inbox — the index stores links, not event
    times, so this cannot tell you what is new since last time.</div>`));
}

// ─── me ──────────────────────────────────────────────────────────

let archiveMod = null;
const archive = async () => (archiveMod ??= await import('/lib/archive.js'));

async function renderMe() {
  const v = $('v-me');
  v.innerHTML = '';

  if (state.me) {
    v.append(el(`<div class="phead-big">
      <img class="pbig" alt="" src="${state.me.avatar ? esc(state.me.avatar) : BLANK}">
      <div class="pdisp">${esc(state.me.displayName || state.me.handle)}</div>
      <div class="phand">@${esc(state.me.handle)}</div>
      ${state.me.description ? `<div class="pdesc">${esc(state.me.description)}</div>` : ''}
      <div class="pstats">
        <span><b>${(state.me.followersCount ?? 0).toLocaleString()}</b> followers</span>
        <span><b>${(state.me.followsCount ?? 0).toLocaleString()}</b> following</span>
        <span><b>${(state.me.postsCount ?? 0).toLocaleString()}</b> posts</span>
      </div></div>`));
  } else {
    v.append(el(`<div class="section"><h3>account</h3>
      <p>Reading needs no account. Signing in is only for posting — it goes through the shared
      OAuth worker, which holds the token so this page never does, and asks for exactly one
      permission: create posts.</p>
      <button class="btn" id="me-signin">sign in with Bluesky</button></div>`));
  }

  const n = state.cacheOk ? await cache.countPosts().catch(() => 0) : 0;
  const est = state.cacheOk ? await cache.estimate() : null;
  v.append(el(`<div class="section"><h3>local store</h3>
    <p>Everything this app sees is written to your browser and never uploaded. The network only
    replays about ${LOOKBACK_HOURS} hours at a time — but it is a <em>rolling</em> window, so what
    you keep becomes an archive it will not serve you twice.</p>
    <p><b>${n.toLocaleString()}</b> posts held${est ? ` · ${(est.usage / 1048576).toFixed(1)} MB` : ''}${state.cacheOk ? '' : ' · unavailable in this browser'}</p>
    <button class="btn ghost" id="me-clear">clear the store</button></div>`));

  const a = await archive().catch(() => null);
  v.append(el(`<div class="section"><h3>deep history</h3>
    <p>Older than the ${LOOKBACK_HOURS}h window is the <em>archive</em>, which is metered by the
    byte and needs a key — so it uses <strong>yours</strong>, not ours. Free at
    <a href="https://bsky.network/account" target="_blank" rel="noopener">bsky.network/account</a>;
    it stays in this browser and goes straight from here to Jetstream.</p>
    <div class="row"><input type="text" id="akey" placeholder="${a?.hasKey() ? 'key saved — paste to replace' : 'paste your Jetstream key'}" autocomplete="off"></div>
    <div class="row"><button class="btn" id="akey-save">save key</button>
      <button class="btn ghost" id="akey-drop">forget</button></div>
    <p id="aquota">${a ? esc(a.quotaSummary() || '') : ''}</p></div>`));

  v.append(el(`<div class="section"><h3>about</h3>
    <p>No DMs: <code>chat.bsky.*</code> is a centralised service, not protocol records, so it never
    reaches the firehose this client reads. Nothing here can see them.</p>
    <p><a href="https://github.com/minormobius/agent01/blob/main/docs/APPVIEW-FEASIBILITY.md">how this works</a>
     · <a href="https://b.mino.mobi">the rest of the Bluesky corner ↗</a></p></div>`));

  $('me-signin')?.addEventListener('click', signIn);
  $('me-clear')?.addEventListener('click', async () => {
    if (!confirm('Delete every post this browser has stored?')) return;
    await cache.clearAll(); renderMe();
  });
  $('akey-save')?.addEventListener('click', async () => {
    const mod = await archive();
    mod.setKey($('akey').value); $('akey').value = ''; renderMe();
  });
  $('akey-drop')?.addEventListener('click', async () => {
    const mod = await archive(); mod.setKey(''); renderMe();
  });
}

// ─── auth + compose ──────────────────────────────────────────────

async function signIn() {
  const handle = prompt('Your Bluesky handle:');
  if (handle) auth().login(handle.trim().replace(/^@/, ''), { scope: 'atproto repo:app.bsky.feed.post' });
}

/**
 * Reflect the signed-in user in the chrome. Deliberately NOT awaited by boot:
 * the feed must never wait on the account. An earlier version awaited the
 * profile fetch before rendering anything, so a slow or unreachable AppView
 * left the page permanently empty — reading needs no account, and the code
 * should say so structurally, not just in the copy.
 */
async function refreshAuth() {
  const user = auth().getUser();
  const btn = $('authbtn');
  if (!user?.did) {
    state.me = null;
    btn.className = 'pill'; btn.textContent = 'sign in';
    btn.onclick = signIn;
    if (state.tab === 'me') renderMe();
    return;
  }
  // Paint what we already know immediately; the full profile can arrive late.
  state.me = { handle: user.handle, did: user.did };
  btn.className = 'avatar-btn';
  btn.innerHTML = `<img alt="@${esc(user.handle || '')}" src="${BLANK}">`;
  btn.onclick = () => showTab('me');
  if (state.tab === 'me') renderMe();

  const full = await getProfile(user.did).catch(() => null);
  if (full) {
    state.me = full;
    btn.innerHTML = `<img alt="@${esc(full.handle)}" src="${full.avatar ? esc(full.avatar) : BLANK}">`;
    if (state.tab === 'me') renderMe();
  }
}

function openSheet() {
  if (!auth().isLoggedIn()) return signIn();
  $('sheet').hidden = false;
  $('ct').focus();
}
function closeSheet() { $('sheet').hidden = true; $('cs').textContent = ''; }

function countChars() {
  const n = graphemeLength($('ct').value);
  $('cc').textContent = `${n}/${MAX_GRAPHEMES}`;
  $('cc').className = n > MAX_GRAPHEMES ? 'over' : '';
  $('sheet-post').disabled = n === 0 || n > MAX_GRAPHEMES;
}

async function sendPost() {
  $('sheet-post').disabled = true;
  $('cs').textContent = 'posting…';
  try {
    await publish($('ct').value, { resolveHandle: (h) => resolveActor(h).catch(() => null) });
    $('ct').value = ''; countChars(); closeSheet();
    say('posted');
  } catch (err) {
    $('cs').textContent = err.message;
    $('sheet-post').disabled = false;
  }
}

// ─── wiring ──────────────────────────────────────────────────────

for (const b of document.querySelectorAll('.tab')) {
  b.addEventListener('click', () => showTab(b.dataset.tab));
}
$('fab').addEventListener('click', openSheet);
$('sheet-cancel').addEventListener('click', closeSheet);
$('sheet-post').addEventListener('click', sendPost);
$('ct').addEventListener('input', countChars);
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('sheet').hidden) closeSheet(); });

// Post actions. Like/repost need write scopes this site does not request, so
// they say so rather than failing silently.
$('v-home').addEventListener('click', async (e) => {
  const btn = e.target.closest('button[data-act]');
  if (!btn) return;
  const post = btn.closest('.post')._post;
  const act = btn.dataset.act;
  if (act === 'open') {
    window.open(`https://bsky.app/profile/${post.did}/post/${post.rkey}`, '_blank', 'noopener');
  } else if (act === 'like' || act === 'repost') {
    say(`${act}s need a write scope this site does not ask for — opening on bsky.app instead`);
    window.open(`https://bsky.app/profile/${post.did}/post/${post.rkey}`, '_blank', 'noopener');
  } else if (act === 'reply') {
    // Live posts carry no counts; fetch them on demand from Constellation.
    const span = btn.querySelector('span');
    span.textContent = '…';
    try { const c = await postCounts(post.uri); span.textContent = c.replyCount; }
    catch { span.textContent = ''; }
  }
});

document.addEventListener('visibilitychange', () => { if (document.hidden) flushWrites(); });
setInterval(hydrate, 900);
setInterval(flushWrites, 15_000);

(async () => {
  state.cacheOk = await cache.available();
  renderChips();
  showTab('home');

  // The feed starts loading FIRST and is never gated on auth. Sign-in only
  // affects the top-right button and the Me tab, so it settles in the
  // background — an auth worker that is slow, blocked or down must not be able
  // to stop a logged-out reader seeing posts.
  selectFeed('simcluster');

  auth().init()
    .catch(() => { /* offline or blocked: reading still works */ })
    .finally(() => { auth().onAuthChange(refreshAuth); refreshAuth(); });
})();

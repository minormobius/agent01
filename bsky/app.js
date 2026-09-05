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
import { FEEDS, loadFeed, authorFeed, authorMedia, notifications, searchActors, getThread }
  from '/lib/sources.js';
import { renderEmbed, imageUrl, videoUrls } from '/lib/blobs.js';
import { attachTypeahead } from '/lib/typeahead.js';
import * as cache from '/lib/cache.js';
import { auth, publish, graphemeLength, MAX_GRAPHEMES, SCOPE } from '/lib/compose.js';
import * as theme from '/lib/theme.js';
import * as lightbox from '/lib/lightbox.js';
import * as share from '/lib/share.js';
import * as actions from '/lib/actions.js';

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
  canWrite: { like: false, repost: false },  // what the auth ceiling allows
};

// ─── chrome ──────────────────────────────────────────────────────

function say(text, live = false) {
  $('statustext').textContent = text;
  $('dot').className = 'dot' + (live ? ' live' : '');
}

const VIEWS = ['home', 'search', 'notifs', 'me', 'profile', 'thread'];

function showTab(tab) {
  state.tab = tab;
  // `profile` is a screen, not a tab — no tab lights up for it.
  for (const b of document.querySelectorAll('.tab')) b.classList.toggle('on', b.dataset.tab === tab);
  for (const v of VIEWS) $(`v-${v}`).hidden = v !== tab;
  // A live IntersectionObserver on a hidden list would keep paging in the
  // background against a profile the reader has left.
  if (tab !== 'profile') { profileObserver?.disconnect(); profileObserver = null; }
  $('chips').hidden = tab !== 'home';
  $('fab').hidden = tab === 'profile' ? false : tab !== 'home';
  window.scrollTo(0, 0);
  if (tab === 'search') renderSearch();
  if (tab === 'notifs') { renderNotifs(); startNotifPolling(); } else stopNotifPolling();
  if (tab === 'me') renderMe();
}

/** Open a profile screen for a handle or DID. */
function openProfile(actor) {
  location.hash = `#/profile/${encodeURIComponent(actor)}`;
}

function openThread(uri) { location.hash = `#/thread/${encodeURIComponent(uri)}`; }

function route() {
  const t = location.hash.match(/^#\/thread\/(.+)$/);
  if (t) return renderThread(decodeURIComponent(t[1]));
  const m = location.hash.match(/^#\/profile\/(.+)$/);
  if (m) return renderProfile(decodeURIComponent(m[1]));
  if (state.tab === 'profile' || state.tab === 'thread') showTab('home');
}

function renderChips() {
  const opts = [
    // Signed in, your own follows come first — it is the feed you actually want.
    ...(state.me ? [{ id: 'following', label: 'following' }] : []),
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
  state.sorted = false;
  state.seen.clear();
  $('v-home').innerHTML = '';
  renderChips();

  if (id === 'following') return startFollowing();
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

/**
 * Your following feed: strictly reverse-chronological, no ranking.
 *
 * Same machinery as `live` — one Jetstream socket filtered to the follow graph —
 * but presented as a timeline rather than a ticker. The difference that matters
 * is ORDERING: a replay arrives oldest-first while live events arrive newest,
 * and the local store contributes posts from any time at all. Prepending would
 * interleave those three sources wrongly, so every post is inserted at its
 * position by `createdAt`.
 */
async function startFollowing() {
  const me = state.me;
  if (!me?.did) { selectFeed('simcluster'); return say('sign in to see your following feed'); }

  say('reading your follow graph…');
  let dids;
  try {
    dids = await getFollows(me.did, 100);
    dids.unshift(me.did);              // your own posts belong in your timeline
  } catch (err) { return say(err.message); }
  if (dids.length < 2) {
    $('v-home').append(el(`<div class="empty"><strong>You follow nobody yet.</strong>
      Follow some accounts and this fills up. Meanwhile the simcluster chip is a good place to look.</div>`));
    return say('no follows');
  }

  state.dids = dids;
  state.subKey = cache.subscriptionKey(dids);
  state.sorted = true;

  if (state.cacheOk) {
    const held = await cache.recentPosts({ limit: 120 }).catch(() => []);
    const mine = new Set(dids);
    for (const p of held) if (mine.has(p.did) && !p.record?.reply) insertSorted(p);
  }

  const plan = state.cacheOk
    ? await cache.resumePlan(state.subKey, 24)
    : { mode: 'since', hours: 24, reason: 'no local store' };

  const opts = {
    dids, collections: ['app.bsky.feed.post'], kinds: [KIND.commit],
    onEvent: onLiveEvent,
    onConnect: () => say(`following · ${dids.length - 1} accounts, reverse chronological`, true),
    onDisconnect: () => say('reconnecting…'),
  };
  if (plan.mode === 'resume') opts.cursor = plan.cursor; else opts.since = plan.hours;
  state.live = new JetstreamClient(opts);
  state.live.connect();
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

  // The cid is REQUIRED to like or repost — a like whose subject lacks one is
  // rejected by the PDS — so it is carried from the event and stored with it.
  const post = { uri, did: payload.did, rkey: payload.rkey, seq: payload.seq, cid: payload.cid,
                 createdAt: record.createdAt || new Date().toISOString(), record };
  if (state.cacheOk) {
    state.writeQueue.push(post);
    if (state.writeQueue.length >= 100) flushWrites();
  }
  if (record.reply) return;                 // a timeline, not a thread view
  if (state.seen.has(uri)) return;
  if (state.sorted) insertSorted(post); else prependPost(post);
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
    <article class="post" data-uri="${esc(p.uri)}" data-did="${esc(p.did)}" data-thread="${esc(p.uri)}">
      <img class="pav" alt="" data-profile="${esc(prof?.handle || p.did)}"
           src="${prof?.avatar ? esc(prof.avatar) : BLANK}">
      <div class="pbody">
        <div class="phead">
          <span class="pname" data-profile="${esc(prof?.handle || p.did)}">${esc(prof?.displayName || prof?.handle || 'unknown')}</span>
          <span class="phandle" data-profile="${esc(prof?.handle || p.did)}">@${esc(prof?.handle || p.did.slice(8, 20) + '…')}</span>
          <span class="ptime">${when(p.createdAt)}</span>
        </div>
        <div class="ptext">${esc(p.record?.text || '')}</div>
        ${renderEmbed(p.record, p.did, p.viewEmbed)}
        <div class="pacts">
          <button data-act="reply">↳ <span>${c ? c.replyCount : ''}</span></button>
          <button data-act="repost">↻ <span>${c ? c.repostCount : ''}</span></button>
          <button data-act="like">♡ <span>${c ? c.likeCount : ''}</span></button>
          <button data-act="menu" aria-label="More">⋯</button>
        </div>
      </div>
    </article>`);
  if (!prof && !state.profiles.has(p.did)) state.pending.add(p.did);
  node._post = p;
  // Paint what we already know we've liked/reposted. The read path is
  // unauthenticated so there is no `viewer` block to consult — lib/actions.js
  // keeps that locally instead.
  const mine = actions.localState(p.uri);
  if (mine.like) node.querySelector('[data-act="like"]')?.classList.add('on');
  if (mine.repost) node.querySelector('[data-act="repost"]')?.classList.add('on');
  return node;
}

function appendPost(p) { if (state.seen.has(p.uri)) return; state.seen.add(p.uri); $('v-home').append(postNode(p)); }

/**
 * Insert at the right place by `createdAt`, newest first. Linear from the top,
 * which is the cheap direction: live posts are newer than almost everything and
 * land within the first comparison or two.
 */
function insertSorted(p) {
  if (state.seen.has(p.uri)) return;
  state.seen.add(p.uri);
  const node = postNode(p);
  const t = Date.parse(p.createdAt) || 0;
  for (const sib of $('v-home').children) {
    if (!sib.classList.contains('post')) continue;
    const st = Date.parse(sib._post?.createdAt) || 0;
    if (t > st) { $('v-home').insertBefore(node, sib); return; }
  }
  $('v-home').append(node);
}
function prependPost(p) {
  if (state.seen.has(p.uri)) return;
  state.seen.add(p.uri);
  const first = $('v-home').firstElementChild;
  $('v-home').insertBefore(postNode(p), first);
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
    if (n) { n.textContent = prof.displayName || prof.handle; n.dataset.profile = prof.handle; }
    if (h) { h.textContent = '@' + prof.handle; h.dataset.profile = prof.handle; }
    if (a) { a.dataset.profile = prof.handle; if (prof.avatar) a.src = prof.avatar; }
  }
}

// ─── notifications ───────────────────────────────────────────────

let notifsFor = null;

async function renderNotifs({ quiet = false } = {}) {
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

  // A quiet refresh keeps the current list on screen until the new one is ready,
  // so a poll never blanks what someone is reading.
  if (!quiet) v.innerHTML = '<div class="empty">reading the backlink index…</div>';
  let did;
  try { did = await resolveActor(who); }
  catch { v.innerHTML = `<div class="empty">could not resolve ${esc(who)}</div>`; return; }

  const items = await notifications(did, { postDepth: 10 }).catch(() => []);
  v.innerHTML = '';
  v.append(el(`<div class="bar">for @${esc(who)} · from Constellation, no account needed
    <span class="spacer"></span></div>`));
  if (!items.length) {
    v.append(el('<div class="empty"><strong>Nothing yet.</strong>No likes, replies or follows found for this account\'s recent posts.</div>'));
    return;
  }
  const icon = { follow: '＋', like: '♡', reply: '↳' };
  const verb = { follow: 'followed you', like: 'liked your post', reply: 'replied to you' };
  for (const n of items) {
    const node = el(`<div class="notif"${n.replyUri || n.subjectUri ? ` data-thread="${esc(n.replyUri || n.subjectUri)}"` : ''}>
      <div class="nicon">${icon[n.kind] || '·'}</div>
      <div class="nbody">
        <b data-profile="${esc(n.actor?.handle || n.actorDid)}">${esc(n.actor?.displayName || n.actor?.handle || n.actorDid.slice(8, 22))}</b>
        <span class="muted">${verb[n.kind] || n.kind}</span>
        <span class="ntime">${n.at ? when(new Date(n.at).toISOString()) : ''}</span>
        ${n.subjectText ? `<div class="nsub">${esc(n.subjectText)}</div>` : ''}
      </div>
    </div>`);
    v.append(node);
  }
  v.append(el(`<div class="empty" style="padding:18px 22px;font-size:12.5px">
    Times are decoded from each record's TID — the rkey encodes the microsecond it was
    written — so this is genuinely reverse-chronological across likes, replies and follows.
    It is still a snapshot rather than a read/unread inbox.</div>`));
  say(`${items.length} notifications for @${who}`);
}

/**
 * Poll for new notifications while the tab is visible and the Notifs tab is
 * open. Constellation is a public index with no push, so polling is the only
 * option — but it is bounded: only when the tab is actually being looked at,
 * and never while the document is hidden.
 */
let notifTimer = null;
function startNotifPolling() {
  stopNotifPolling();
  notifTimer = setInterval(() => {
    if (document.hidden || state.tab !== 'notifs') return;
    renderNotifs({ quiet: true });
  }, 90_000);
}
function stopNotifPolling() {
  if (notifTimer) clearInterval(notifTimer);
  notifTimer = null;
}

// ─── search ──────────────────────────────────────────────────────

let searchState = { q: '', cursor: null, loading: false };
let searchTypeahead = null;

function renderSearch() {
  const v = $('v-search');
  if (v.dataset.built) return;
  v.dataset.built = '1';
  v.innerHTML = `<div class="searchbar"><input type="text" id="sq" placeholder="search people…"></div>
                 <div id="sresults"></div>`;

  const input = $('sq');
  // Typeahead here too — picking a suggestion goes straight to the profile,
  // while Enter runs the deeper searchActors query.
  searchTypeahead = attachTypeahead(input, { onPick: (a) => openProfile(a.handle) });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !document.querySelector('.ta-menu:not([hidden]) li.on')) {
      input.blur();          // dismiss the mobile keyboard so results are visible
      runSearch(input.value);
    }
  });
}

async function runSearch(q, more = false) {
  const term = String(q || '').trim();
  if (!term || searchState.loading) return;
  // Close the suggestion menu FIRST. A debounced typeahead request fired just
  // before Enter lands after this one and would drop its menu over the results.
  searchTypeahead?.close();
  searchState.loading = true;
  if (!more) { searchState.q = term; searchState.cursor = null; $('sresults').innerHTML = ''; }
  say(`searching for “${term}”…`);
  try {
    const { actors, cursor } = await searchActors(term, { limit: 25, cursor: more ? searchState.cursor : null });
    searchState.cursor = cursor;
    document.getElementById('smore')?.remove();
    if (!actors.length && !more) {
      $('sresults').append(el('<div class="empty"><strong>Nobody found.</strong>Try a handle, a display name, or a word from a bio.</div>'));
    }
    for (const a of actors) $('sresults').append(actorNode(a));
    if (cursor && actors.length) {
      const b = el('<button class="more" id="smore">more results</button>');
      b.addEventListener('click', () => runSearch(searchState.q, true));
      $('sresults').append(b);
    }
    say(`${actors.length} result${actors.length === 1 ? '' : 's'} for “${term}”`);
  } catch (err) {
    say(`search failed: ${err.message}`);
  } finally {
    searchState.loading = false;
  }
}

function actorNode(a) {
  const node = el(`<div class="actor" data-profile="${esc(a.handle)}">
    <img class="aav" alt="" src="${a.avatar ? esc(a.avatar) : BLANK}">
    <div class="abody">
      <div class="aname">${esc(a.displayName || a.handle)}</div>
      <div class="ahandle">@${esc(a.handle)}</div>
      ${a.description ? `<div class="adesc">${esc(a.description)}</div>` : ''}
    </div></div>`);
  return node;
}

// ─── profile screen ──────────────────────────────────────────────

async function renderProfile(actor) {
  showTab('profile');
  const v = $('v-profile');
  v.innerHTML = '<div class="empty">loading…</div>';

  let did;
  try { did = await resolveActor(actor); }
  catch { v.innerHTML = `<div class="empty"><strong>Not found.</strong>Could not resolve ${esc(actor)}.</div>`; return; }

  const prof = await getProfile(did).catch(() => null);
  if (prof) {
    state.profiles.set(prof.did, prof);
    if (state.cacheOk) cache.putProfile(prof).catch(() => {});
  }

  v.innerHTML = '';
  const back = el('<div class="backbar"><button class="pill" id="pback">← back</button></div>');
  v.append(back);
  $('pback').addEventListener('click', () => history.back());

  if (prof?.banner) v.append(el(`<img class="pbanner" alt="" src="${esc(prof.banner)}">`));
  v.append(el(`<div class="phead-big">
    <img class="pbig" alt="" src="${prof?.avatar ? esc(prof.avatar) : BLANK}">
    <div class="pdisp">${esc(prof?.displayName || prof?.handle || did)}</div>
    <div class="phand">@${esc(prof?.handle || did)}</div>
    ${prof?.description ? `<div class="pdesc">${esc(prof.description)}</div>` : ''}
    <div class="pstats">
      <span><b>${(prof?.followersCount ?? 0).toLocaleString()}</b> followers</span>
      <span><b>${(prof?.followsCount ?? 0).toLocaleString()}</b> following</span>
      <span><b>${(prof?.postsCount ?? 0).toLocaleString()}</b> posts</span>
    </div>
    <div class="pstats"><a href="https://bsky.app/profile/${esc(did)}" target="_blank" rel="noopener">open on bsky.app ↗</a></div>
  </div>`));

  const tabs = el(`<div class="ptabs">
    <button class="ptab on" data-ptab="posts">Posts</button>
    <button class="ptab" data-ptab="media">Media</button>
  </div>`);
  v.append(tabs);
  const list = el('<div id="pposts"></div>');
  v.append(list);

  profileState = { did, handle: prof?.handle || did, tab: 'posts', cursor: null, done: false, loading: false };
  tabs.addEventListener('click', (e) => {
    const b = e.target.closest('[data-ptab]');
    if (!b || b.dataset.ptab === profileState.tab) return;
    for (const x of tabs.querySelectorAll('.ptab')) x.classList.toggle('on', x === b);
    profileState = { ...profileState, tab: b.dataset.ptab, cursor: null, done: false, loading: false };
    list.innerHTML = '';
    loadProfilePage();
  });

  await loadProfilePage();
  say(`@${prof?.handle || did}`);
}

let profileState = null;
let profileObserver = null;

/**
 * One page of the profile's current tab, then re-arm the infinite scroll.
 *
 * The sentinel is recreated per page rather than reused: an IntersectionObserver
 * on an element that stays in view after the append fires repeatedly, which is
 * how infinite scrolls turn into runaway request loops.
 */
async function loadProfilePage() {
  const ps = profileState;
  if (!ps || ps.loading || ps.done) return;
  ps.loading = true;
  const list = $('pposts');
  document.getElementById('psentinel')?.remove();
  profileObserver?.disconnect();

  try {
    const media = ps.tab === 'media';
    const { posts, cursor } = media
      ? await authorMedia(ps.did, { limit: 40, cursor: ps.cursor })
      : await authorFeed(ps.did, { limit: 30, cursor: ps.cursor });

    if (!posts.length && !ps.cursor) {
      list.append(el(`<div class="empty">${media ? 'No photos or video.' : 'No posts.'}</div>`));
      ps.done = true;
      return;
    }

    if (media) {
      let grid = list.querySelector('.masonry');
      if (!grid) { grid = el('<div class="masonry"></div>'); list.append(grid); }
      for (const p of posts) for (const tile of mediaTiles(p)) grid.append(tile);
    } else {
      for (const p of posts) list.append(postNode(p));
    }

    if (state.cacheOk && posts.length) cache.putPosts(posts).catch(() => {});
    ps.cursor = cursor;
    ps.done = !cursor || !posts.length;

    if (!ps.done) {
      const sentinel = el('<div class="sentinel" id="psentinel"></div>');
      list.append(sentinel);
      profileObserver = new IntersectionObserver((entries) => {
        if (entries.some((e) => e.isIntersecting)) loadProfilePage();
      }, { rootMargin: '600px' });   // start fetching before the reader arrives
      profileObserver.observe(sentinel);
    }
  } catch (err) {
    list.append(el(`<div class="empty">Could not load: ${esc(err.message)}</div>`));
    ps.done = true;
  } finally {
    ps.loading = false;
  }
}

/**
 * A post's media as individual masonry tiles — one per image, so a four-image
 * post becomes four tiles rather than a nested grid inside a column.
 *
 * Handles both embed shapes for the same reason lib/blobs.js does: a profile
 * page is hydrated, but the same function serves posts restored from the cache,
 * which are raw.
 */
function mediaTiles(p) {
  const e = p.viewEmbed || p.record?.embed;
  if (!e) return [];
  const type = String(e.$type || '');
  const hydrated = type.includes('#view');
  const out = [];

  const media = type.startsWith('app.bsky.embed.recordWithMedia') ? e.media : e;
  const mtype = String(media?.$type || '');

  if (mtype.startsWith('app.bsky.embed.images')) {
    for (const im of media.images || []) {
      const src = hydrated ? im.thumb : imageUrl(p.did, im.image, 'feed_thumbnail');
      if (!src) continue;
      const ar = im.aspectRatio;
      const tile = el(`<a class="mtile" data-thread="${esc(p.uri)}" href="#/thread/${encodeURIComponent(p.uri)}">
        <img loading="lazy" decoding="async" alt="${esc(im.alt || '')}"
             ${ar?.width && ar?.height ? `width="${ar.width}" height="${ar.height}"` : ''}
             src="${esc(src)}"></a>`);
      out.push(tile);
    }
  } else if (mtype.startsWith('app.bsky.embed.video')) {
    const urls = hydrated ? { thumbnail: media.thumbnail } : videoUrls(p.did, media.video);
    if (urls?.thumbnail) {
      out.push(el(`<a class="mtile" href="#/thread/${encodeURIComponent(p.uri)}">
        <img loading="lazy" decoding="async" alt="" src="${esc(urls.thumbnail)}">
        <span class="vbadge">▶</span></a>`));
    }
  }
  return out;
}

// ─── post menu ───────────────────────────────────────────────────

let menuOpenedAt = 0;

function closeMenu() {
  $('postmenu').hidden = true;
  document.getElementById('menu-back')?.remove();
  menuOpenedAt = 0;
}

function openPostMenu(anchor, post) {
  closeMenu();
  const menu = $('postmenu');
  const imgs = [...(anchor.closest('.post')?.querySelectorAll('.imgcell img') || [])];

  menuOpenedAt = Date.now();
  menu.innerHTML = `
    <button data-m="link"><span class="ic">🔗</span>Copy link to post</button>
    <button data-m="text"><span class="ic">📋</span>Copy post text</button>
    ${imgs.length ? `<button data-m="media"><span class="ic">🖼</span>Copy ${imgs.length > 1 ? 'first image' : 'image'}</button>` : ''}
    <button data-m="bsky"><span class="ic">↗</span>View on bsky.app</button>`;
  menu.hidden = false;

  // Position above the button when there is no room below — a menu that opens
  // off the bottom of a phone is a menu you cannot use.
  const r = anchor.getBoundingClientRect();
  const mh = menu.offsetHeight;
  const below = window.innerHeight - r.bottom;
  menu.style.top = (below > mh + 16 ? r.bottom + 6 : Math.max(8, r.top - mh - 6)) + 'px';
  menu.style.left = Math.max(8, Math.min(r.left, window.innerWidth - menu.offsetWidth - 8)) + 'px';

  const back = el('<div class="menu-back" id="menu-back"></div>');
  document.body.append(back);
  back.addEventListener('click', closeMenu);

  menu.onclick = async (e) => {
    const b = e.target.closest('[data-m]');
    if (!b) return;
    const what = b.dataset.m;
    closeMenu();

    if (what === 'bsky') {
      return window.open(share.postUrl(post), '_blank', 'noopener');
    }
    if (what === 'link') {
      const r2 = await share.copyText(share.postUrl(post));
      return say(r2 === 'manual' ? share.postUrl(post) : 'link copied');
    }
    if (what === 'text') {
      const text = post.record?.text || '';
      if (!text) return say('this post has no text');
      const r2 = await share.copyText(text);
      return say(r2 === 'manual' ? 'could not copy — long-press the post text' : 'post text copied');
    }
    if (what === 'media' && imgs[0]) {
      say('copying image…');
      const full = imgs[0].src.replace('/feed_thumbnail/', '/feed_fullsize/');
      const r2 = await share.copyImage(full);
      return say(r2 === 'copied' ? 'image copied' : 'could not copy the image — opening it instead');
    }
  };
}

// ─── thread ──────────────────────────────────────────────────────

async function renderThread(uri) {
  showTab('thread');
  const v = $('v-thread');
  v.innerHTML = '<div class="empty">loading thread…</div>';

  let data;
  try { data = await getThread(uri, { depth: 6, parentHeight: 20 }); }
  catch (err) { v.innerHTML = `<div class="empty"><strong>Thread unavailable.</strong>${esc(err.message)}</div>`; return; }

  v.innerHTML = '';
  const back = el('<div class="backbar"><button class="pill" id="tback">← back</button></div>');
  v.append(back);
  $('tback').addEventListener('click', () => history.back());

  for (const a of data.ancestors) {
    const n = postNode(a);
    n.classList.add('ancestor');
    v.append(n);
  }

  const focus = postNode(data.post);
  focus.classList.add('focus');
  v.append(focus);

  v.append(replyBox(data.post));

  if (!data.replies.length) {
    v.append(el('<div class="threadnote">No replies yet.</div>'));
  } else {
    v.append(el(`<div class="threadnote">${data.replies.length} repl${data.replies.length === 1 ? 'y' : 'ies'}</div>`));
    for (const r of data.replies) {
      const n = postNode(r);
      // Cap the visual nesting: a 30-deep argument must not slide off a phone.
      n.dataset.level = String(Math.min(r.level, 4));
      v.append(n);
    }
  }
  say(`thread · ${data.replies.length} replies`);
}

/**
 * The in-context reply composer.
 *
 * A reply carries BOTH `root` and `parent`. The root is the thread's root, not
 * the post being replied to — take it from the parent's own `record.reply.root`
 * when there is one, and only fall back to the parent itself when replying to a
 * top-level post. Getting this wrong detaches the reply in every client.
 */
function replyBox(parent) {
  const box = el(`<div class="replybox">
    <textarea id="rt" placeholder="Reply to @${esc(parent.author?.handle || '')}…" maxlength="3000"></textarea>
    <div class="replyrow">
      <button class="btn" id="rsend" disabled>reply</button>
      <span id="rstatus" class="muted" style="font-size:13px"></span>
      <span class="cc" id="rcc">0/300</span>
    </div></div>`);

  const ta = box.querySelector('#rt');
  const send = box.querySelector('#rsend');
  const cc = box.querySelector('#rcc');
  const st = box.querySelector('#rstatus');

  const count = () => {
    const n = graphemeLength(ta.value);
    cc.textContent = `${n}/${MAX_GRAPHEMES}`;
    cc.className = 'cc' + (n > MAX_GRAPHEMES ? ' over' : '');
    send.disabled = n === 0 || n > MAX_GRAPHEMES || !auth().isLoggedIn();
  };
  ta.addEventListener('input', count);

  if (!auth().isLoggedIn()) {
    st.textContent = 'sign in to reply';
    send.disabled = true;
  }

  send.addEventListener('click', async () => {
    send.disabled = true;
    st.textContent = 'posting…';
    try {
      const rootRef = parent.record?.reply?.root || { uri: parent.uri, cid: parent.cid };
      await publish(ta.value, {
        resolveHandle: (h) => resolveActor(h).catch(() => null),
        replyTo: { uri: parent.uri, cid: parent.cid, root: rootRef },
      });
      ta.value = '';
      count();
      st.textContent = 'replied';
      // Re-read the thread so the new reply appears where it belongs.
      setTimeout(() => renderThread(parent.uri), 900);
    } catch (err) {
      st.textContent = err.message;
      send.disabled = false;
    }
  });

  return box;
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

  const cur = theme.stored();
  const picker = el(`<div class="section"><h3>palette</h3>
    <div class="palettes">
      <button class="pal${cur === 'auto' ? ' on' : ''}" data-pal="auto">
        <span class="sw"><i style="background:#0b0d12"></i><i style="background:#fbfaf8"></i></span>
        <span class="nm">Auto</span></button>
      ${Object.entries(theme.PALETTES).map(([k, p]) => `
        <button class="pal${cur === k ? ' on' : ''}" data-pal="${k}">
          <span class="sw"><i style="background:${p.bg}"></i><i style="background:${p.accent}"></i><i style="background:${p.text}"></i></span>
          <span class="nm">${esc(p.label)}</span></button>`).join('')}
    </div></div>`);
  v.append(picker);
  picker.addEventListener('click', (e) => {
    const b = e.target.closest('[data-pal]');
    if (!b) return;
    theme.set(b.dataset.pal);
    for (const x of picker.querySelectorAll('.pal')) x.classList.toggle('on', x === b);
  });

  v.append(el(`<div class="section"><h3>about</h3>
    <p>No DMs: <code>chat.bsky.*</code> is a centralised service, not protocol records, so it never
    reaches the firehose this client reads. Nothing here can see them.</p>
    <p>Likes and reposts: ${state.canWrite.like && state.canWrite.repost
      ? 'enabled.'
      : 'waiting on <code>auth.mino.mobi</code> to publish the two scopes. The collections are '
        + 'added in this branch, but that worker deploys from its own branch, so until it ships '
        + 'the buttons explain themselves instead of failing at the consent screen.'}</p>
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

let signinTypeahead = null;

/**
 * The sign-in sheet. Was a `prompt()`, which has no typeahead, no validation
 * and no way to explain what is being asked for.
 *
 * The scope is the site's whole SCOPE — post, like and repost in one consent —
 * so nothing here ever has to escalate mid-gesture again.
 */
function signIn() {
  const sheet = $('signin');
  sheet.hidden = false;
  const input = $('signin-handle');
  input.value = '';
  $('signin-status').textContent = '';
  $('signin-go').disabled = true;

  if (!signinTypeahead) {
    signinTypeahead = attachTypeahead(input, {
      onPick: (a) => { input.value = a.handle; $('signin-go').disabled = false; },
    });
  }
  input.addEventListener('input', () => {
    $('signin-go').disabled = input.value.trim().length < 3;
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !document.querySelector('.ta-menu:not([hidden]) li.on')) doSignIn();
  });
  setTimeout(() => input.focus(), 60);
}

async function doSignIn() {
  const handle = $('signin-handle').value.trim().replace(/^@/, '');
  if (!handle) return;
  signinTypeahead?.close();
  $('signin-go').disabled = true;
  $('signin-status').textContent = 'redirecting to Bluesky…';
  try {
    await auth().login(handle, { scope: SCOPE });
  } catch (err) {
    $('signin-status').textContent = err.message;
    $('signin-go').disabled = false;
  }
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

  // Signing in adds the `following` chip, and that feed is the one you came
  // for — switch to it unless the reader has already chosen something else.
  renderChips();
  if (justSignedIn && state.feed === 'simcluster') selectFeed('following');
  justSignedIn = false;
}

/** True for the first refreshAuth that finds a session, so the feed switches once. */
let justSignedIn = true;

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
$('signin-cancel').addEventListener('click', () => { signinTypeahead?.close(); $('signin').hidden = true; });
$('signin-go').addEventListener('click', doSignIn);
$('sheet-post').addEventListener('click', sendPost);
$('ct').addEventListener('input', countChars);
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  if (!$('postmenu').hidden) return closeMenu();
  if (!$('sheet').hidden) return closeSheet();
  if (!$('signin').hidden) { signinTypeahead?.close(); $('signin').hidden = true; }
});
// A scroll under an open menu leaves it floating over the wrong post, so it
// closes — but not for the first moment. Bringing the button into view, and the
// momentum still settling from the tap that opened it, both fire scroll events
// immediately afterwards, and closing on those makes the menu impossible to
// open near the bottom of the screen.
window.addEventListener('scroll', () => {
  if ($('postmenu').hidden) return;
  if (Date.now() - menuOpenedAt < 400) return;
  closeMenu();
}, { passive: true });

// Post actions. Like/repost need write scopes this site does not request, so
// they say so rather than failing silently.
document.addEventListener('click', async (e) => {
  const btn = e.target.closest('button[data-act]');
  if (!btn) return;
  const post = btn.closest('.post')._post;
  const act = btn.dataset.act;

  if (act === 'menu') return openPostMenu(btn, post);

  if (act === 'reply') {
    // Live posts carry no counts; fetch them on demand from Constellation.
    const span = btn.querySelector('span');
    span.textContent = '…';
    try { const c = await postCounts(post.uri); span.textContent = c.replyCount; }
    catch { span.textContent = ''; }
    return;
  }

  if (act !== 'like' && act !== 'repost') return;

  if (!actions.signedIn()) return say(`sign in to ${act}`);
  if (!state.canWrite[act]) {
    return say(`${act}s need repo:app.bsky.feed.${act} on auth.mino.mobi — the collection is `
      + `added in this branch but that worker deploys from its own`);
  }

  // Optimistic: flip immediately, reconcile with what the PDS actually says.
  const span = btn.querySelector('span');
  const wasOn = btn.classList.contains('on');
  const n = Number(span?.textContent) || 0;
  btn.classList.toggle('on', !wasOn);
  btn.classList.add('busy');
  if (span && span.textContent !== '') span.textContent = String(Math.max(0, n + (wasOn ? -1 : 1)));

  try {
    const { on } = await actions.toggle(post, act);
    btn.classList.toggle('on', on);
  } catch (err) {
    btn.classList.toggle('on', wasOn);           // put it back
    if (span && span.textContent !== '') span.textContent = String(n);
    say(err.message);
  } finally {
    btn.classList.remove('busy');
  }
});

// Any element carrying data-profile opens that profile — avatars, names,
// handles, search rows. One listener rather than a binding per post.
/**
 * One delegated click handler, most specific target first.
 *
 * The whole post card carries data-thread, so the empty margin beside the
 * avatar opens the thread — that dead space was the biggest miss on a phone.
 * Everything interactive inside it therefore has to claim the tap first, which
 * is what this ordering does: profile links, then media, then action buttons,
 * then real links, and only then the card itself.
 */
document.addEventListener('click', (e) => {
  const prof = e.target.closest('[data-profile]');
  if (prof) { e.preventDefault(); return openProfile(prof.dataset.profile); }

  const cell = e.target.closest('.imgcell, .mtile');
  if (cell) { e.preventDefault(); return openMedia(cell); }

  // Buttons and genuine links keep their own behaviour.
  if (e.target.closest('button[data-act]')) return;
  if (e.target.closest('a[href]:not([data-thread])') || e.target.closest('video')) return;

  const th = e.target.closest('[data-thread]');
  if (th) { e.preventDefault(); return openThread(th.dataset.thread); }
});

/** Open the lightbox on the tapped image, with the post's whole album loaded. */
function openMedia(cell) {
  const holder = cell.closest('.post, .masonry');
  const post = cell.closest('.post')?._post;

  // In a post: the album is that post's images, opened at the tapped one.
  if (post) {
    const cells = [...holder.querySelectorAll('.imgcell')];
    const images = cells.map((c) => ({
      src: c.querySelector('img')?.src,
      full: c.getAttribute('href') || c.querySelector('img')?.src,
      alt: c.querySelector('img')?.alt || '',
    })).filter((x) => x.src);
    return lightbox.open(images, Math.max(0, cells.indexOf(cell)));
  }

  // In the profile media wall: every loaded tile is the album, so a swipe runs
  // through the whole grid rather than stopping at one post's images.
  const tiles = [...document.querySelectorAll('.masonry .mtile')];
  const images = tiles.map((t) => {
    const img = t.querySelector('img');
    return img ? { src: img.src, full: img.src.replace('/feed_thumbnail/', '/feed_fullsize/'), alt: img.alt } : null;
  }).filter(Boolean);
  lightbox.open(images, Math.max(0, tiles.indexOf(cell)));
}

window.addEventListener('hashchange', route);
document.addEventListener('visibilitychange', () => { if (document.hidden) flushWrites(); });
setInterval(hydrate, 900);
setInterval(flushWrites, 15_000);

(async () => {
  theme.apply();
  theme.watchSystem();
  state.cacheOk = await cache.available();
  renderChips();
  if (location.hash.startsWith('#/profile/')) route(); else showTab('home');

  // The feed starts loading FIRST and is never gated on auth. Sign-in only
  // affects the top-right button and the Me tab, so it settles in the
  // background — an auth worker that is slow, blocked or down must not be able
  // to stop a logged-out reader seeing posts.
  selectFeed('simcluster');

  actions.available().then((can) => { state.canWrite = can; }).catch(() => {});

  auth().init()
    .catch(() => { /* offline or blocked: reading still works */ })
    .finally(() => { auth().onAuthChange(refreshAuth); refreshAuth(); });
})();

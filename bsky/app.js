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
import * as rulefeed from '/lib/rulefeed.js';
import * as apikey from '/lib/apikey.js';
import { paperOf } from '/lib/paper.js';
import { linksOf } from '/lib/rulefeed.js';
import { postCounts } from '/packages/atproto/constellation.js';
import { getProfiles, getFollows, resolveActor, getProfile } from '/packages/atproto/bsky.js';
import { FEEDS, loadFeed, authorFeed, authorMedia, notifications, searchActors, getThread }
  from '/lib/sources.js';
import { renderEmbed, imageUrl, videoUrls } from '/lib/blobs.js';
import { attachTypeahead } from '/lib/typeahead.js';
import * as cache from '/lib/cache.js';
import { auth, publish, graphemeLength, MAX_GRAPHEMES, MAX_IMAGES, SCOPE } from '/lib/compose.js';
import * as theme from '/lib/theme.js';
import * as lightbox from '/lib/lightbox.js';
import * as share from '/lib/share.js';
import * as feedgen from '/lib/feedgen.js';
import * as actions from '/lib/actions.js';

const $ = (id) => document.getElementById(id);

/**
 * Attach a handler without letting one bad wire take out the rest.
 *
 * `renderMe()` wires eight buttons in a row. When `signOut` turned out to be
 * undefined, the ReferenceError on ITS line aborted the function, so the three
 * buttons wired after it never got handlers either — one missing function, four
 * dead controls, no error anywhere the reader could see. Sequential wiring
 * makes every later control depend on every earlier one, which is a dependency
 * nobody intends.
 *
 * `lib/wiring.selftest.mjs` fails the build on an undefined handler, so this is
 * the second line of defence rather than the first: it also covers a handler
 * that exists but throws while being attached, and it makes the failure VISIBLE
 * instead of silent.
 */
function on(id, event, fn) {
  const el = $(id);
  if (!el) return false;
  try {
    el.addEventListener(event, fn);
    return true;
  } catch (err) {
    console.error(`wiring ${id}.${event} failed:`, err);
    say(`a control failed to wire: ${id}`);
    return false;
  }
}
const el = (html) => { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; };
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const BLANK = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg"/>');

const state = {
  tab: 'home',
  feed: 'simcluster',       // a FEEDS id, 'live', or 'stored'
  cursor: null,
  live: null,               // JetstreamClient
  runner: null,             // RuleRunner — a feed generator running in this tab
  conn: null,               // connectionStatus() for whichever socket is open
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
  if (tab === 'search') renderSearch();
  if (tab === 'notifs') { renderNotifs(); startNotifPolling(); } else stopNotifPolling();
  if (tab === 'me') renderMe();
}

/**
 * The connection status line, which used to lie.
 *
 * The old wiring was `onConnect: () => say('live · …')` and
 * `onDisconnect: () => say('reconnecting…')`, straight through. That reads as a
 * permanently reconnecting app even while posts are visibly arriving, and the
 * reason is that a Jetstream socket ending is NORMAL: it closes when a replay
 * finishes, on idle, on a host rotation. Each close painted "reconnecting…",
 * and the reconnect that followed a moment later painted over it — but the
 * backoff grows to 30s, so "reconnecting…" is what is on screen almost all of
 * the time. The status was reporting socket transitions when what a reader
 * wants to know is whether posts are still coming.
 *
 * So: a drop is only reported if it has not repaired itself within GRACE, and
 * the line otherwise counts what has actually arrived.
 */
const RECONNECT_GRACE_MS = 2500;

function connectionStatus(label) {
  let pending = null;
  let connected = false;
  let events = 0;

  const paint = () => say(events ? `${label} · ${events.toLocaleString()} posts` : label, connected);

  return {
    onConnect() {
      connected = true;
      clearTimeout(pending);
      pending = null;
      paint();
    },
    onDisconnect() {
      connected = false;
      clearTimeout(pending);
      pending = setTimeout(() => { if (!connected) say('reconnecting…', false); }, RECONNECT_GRACE_MS);
    },
    /** Called per delivered event, so the line proves flow rather than asserting it. */
    bump() {
      events++;
      if (connected && events % 10 === 0) paint();
    },
    stop() { clearTimeout(pending); pending = null; },
  };
}

/** Open a profile screen for a handle or DID. */
function openProfile(actor) {
  location.hash = `#/profile/${encodeURIComponent(actor)}`;
}

function openThread(uri) { location.hash = `#/thread/${encodeURIComponent(uri)}`; }

/**
 * Tabs are addressable. That is not for the sake of shareable links — nobody
 * shares a link to a tab — it is for INSTALLED copies of this app: a standalone
 * PWA has no browser chrome, so Android's hardware back button walks
 * `history` and, with nothing on the stack, closes the app. Pushing a hash per
 * tab means back goes Notifs -> Home rather than Notifs -> gone. It also gives
 * the manifest's shortcuts somewhere to point.
 */
const TABS = ['home', 'search', 'notifs', 'me'];

function goTab(tab) {
  const want = tab === 'home' ? '#/' : `#/${tab}`;
  if (location.hash === want) return showTab(tab);   // re-tap: no history entry
  location.hash = want;
}

/**
 * Where each screen was scrolled to, keyed by its route.
 *
 * Losing your place is the single most expensive bug in a feed reader: you tap
 * a post, read the thread, come back — and you are at the top, with no way to
 * find the post you were on or anything below it. Everything you had already
 * scrolled past is effectively gone.
 *
 * `showTab` used to `window.scrollTo(0, 0)` unconditionally. It no longer
 * scrolls at all; this decides, because only the router knows whether you are
 * ARRIVING somewhere new (top) or GOING BACK (where you were).
 *
 * The home feed survives because showTab only hides `#v-home`, it does not
 * rebuild it — so the posts are still there and the offset still means what it
 * meant. Thread and profile screens rebuild, so their offsets are dropped when
 * you leave rather than restored onto different content.
 */
const scrollMemory = new Map();
let currentRoute = null;

function rememberScroll() {
  if (currentRoute) scrollMemory.set(currentRoute, window.scrollY);
}

function restoreScroll(key, { top = false } = {}) {
  const y = top ? 0 : (scrollMemory.get(key) ?? 0);
  // Two frames: one for the view to be un-hidden, one for layout to settle.
  // A single frame lands before the feed has height and silently scrolls to 0.
  requestAnimationFrame(() => requestAnimationFrame(() => window.scrollTo(0, y)));
}

function route() {
  const next = location.hash || '#/';
  if (next === currentRoute) return;
  rememberScroll();
  const previous = currentRoute;
  currentRoute = next;

  const t = next.match(/^#\/thread\/(.+)$/);
  if (t) {
    // A thread rebuilds its content every time, so an old offset would land on
    // different posts. Always start at the top of a thread.
    scrollMemory.delete(next);
    renderThread(decodeURIComponent(t[1]));
    restoreScroll(next, { top: true });
    return;
  }
  const m = next.match(/^#\/profile\/(.+)$/);
  if (m) {
    scrollMemory.delete(next);
    renderProfile(decodeURIComponent(m[1]));
    restoreScroll(next, { top: true });
    return;
  }

  // Leaving a rebuilt screen: its offset is meaningless next time.
  if (previous && /^#\/(thread|profile)\//.test(previous)) scrollMemory.delete(previous);

  const tab = next.replace(/^#\/?/, '');
  showTab(TABS.includes(tab) ? tab : 'home');
  restoreScroll(next);
}

function renderChips() {
  const saved = feedgen.savedFeeds();
  const custom = [feedgen.FOR_YOU, ...saved.filter((u) => u !== feedgen.FOR_YOU)];
  const opts = [
    // Signed in, your own follows come first — it is the feed you actually want.
    ...(state.me ? [{ id: 'following', label: 'following' }] : []),
    // Third-party generators, For You first. These personalise per reader when
    // signed in — see lib/feedgen.js.
    ...custom.map((uri) => ({ id: `gen:${uri}`, label: feedLabel(uri) })),
    ...FEEDS.map((f) => ({ id: f.id, label: f.label })),
    // Feeds this browser generates for itself — see lib/rulefeed.js.
    ...rulefeed.rules().map((r) => ({ id: `rule:${r.id}`, label: r.label })),
    { id: 'live', label: '⚡ live' },
    { id: 'stored', label: '⛁ stored' },
    { id: 'addfeed', label: '+ feed' },
  ];
  $('chips').innerHTML = '';
  for (const o of opts) {
    const b = el(`<button class="pill${o.id === state.feed ? ' on' : ''}">${esc(o.label)}</button>`);
    b.addEventListener('click', () => selectFeed(o.id));
    $('chips').append(b);
  }
}

// ─── custom feed generators ──────────────────────────────────────

const feedLabels = new Map([[feedgen.FOR_YOU, 'for you']]);
function feedLabel(uri) { return feedLabels.get(uri) || '…'; }

/** Warm the chip labels from each generator's own record. */
async function loadFeedLabels() {
  for (const uri of [feedgen.FOR_YOU, ...feedgen.savedFeeds()]) {
    if (feedLabels.has(uri)) continue;
    try {
      const meta = await feedgen.generatorMeta(uri);
      feedLabels.set(uri, meta.displayName.toLowerCase());
    } catch { feedLabels.set(uri, 'feed'); }
  }
  renderChips();
}

async function loadGenerator(uri, fresh) {
  if (state.loading) return;
  state.loading = true;
  let meta = null;
  try { meta = await feedgen.generatorMeta(uri); } catch { /* label only */ }
  say(fresh ? `loading ${meta?.displayName || 'feed'}…` : 'loading more…');

  try {
    const { posts, cursor, personalised, route, why, fix } =
      await feedgen.loadCustomFeed(uri, { limit: 30, cursor: state.cursor });
    state.cursor = cursor;
    document.getElementById('more-btn')?.remove();

    if (!posts.length && fresh) {
      $('v-home').append(el(`<div class="empty"><strong>This feed came back empty.</strong>
        ${esc(meta?.description || '')}</div>`));
    }
    for (const p of posts) appendPost(p);
    if (state.cacheOk && posts.length) cache.putPosts(posts).catch(() => {});

    if (cursor && posts.length) {
      const more = el('<button class="more" id="more-btn">load more</button>');
      more.addEventListener('click', () => loadGenerator(uri, false));
      $('v-home').append(more);
    }

    // Say plainly whose feed this is AND how it was fetched — `direct` means no
    // worker touched it at all. When it is NOT personalised, say which of the
    // four possible reasons applied: "cannot mint a service token" covered all
    // of them and was actionable for none.
    const how = route === 'direct' ? 'direct from the generator' : 'via our CORS relay';
    const name = meta?.displayName || 'feed';
    if (personalised) {
      say(`${name} · personalised for @${state.me?.handle || 'you'} · ${how}`);
    } else {
      say(`${name} · generic — ${why || 'not personalised'} · ${how}`);
      // The commonest cause is a session that predates the rpc scope, and it is
      // fixable in one tap — but `ensureScope` redirects, so it needs a real
      // gesture and cannot be done for them.
      if (fix === 'rescope') offerRescope(uri);
      else if (fix === 'signin') offerSignIn();
    }
  } catch (err) {
    say(`could not load that feed: ${err.message}`);
  } finally {
    state.loading = false;
  }
}

/**
 * A one-tap repair for the commonest personalisation failure.
 *
 * `ensureScope` REDIRECTS to a consent screen, so it must run from a user
 * gesture — it cannot be done silently on the reader's behalf, and a banner is
 * the honest way to ask.
 */
function offerRescope(uri) {
  const bar = el(`<div class="rulehead">
    <div class="rulemeta"><strong>Personalise this feed</strong></div>
    <div class="rulenote">Your sign-in was granted before this site could ask your PDS for the
      short-lived token a feed generator uses to recognise you. Reauthorising adds that one
      permission — it takes nothing away.</div>
    <div class="rulebtns"><button class="btn small" id="rescope-go">reauthorise</button></div>
  </div>`);
  $('v-home').prepend(bar);
  on('rescope-go', 'click', async () => {
    try {
      await feedgen.rescopeForFeeds();     // redirects; does not return
    } catch (err) {
      say(`could not reauthorise: ${err.message}`);
    }
  });
}

function offerSignIn() {
  const bar = el(`<div class="rulehead">
    <div class="rulemeta"><strong>This feed can be personalised</strong></div>
    <div class="rulenote">Signed in, your own PDS mints a short-lived token that identifies you to
      the feed's operator. We never hold it.</div>
    <div class="rulebtns"><button class="btn small" id="rescope-signin">sign in</button></div>
  </div>`);
  $('v-home').prepend(bar);
  on('rescope-signin', 'click', signIn);
}

let feedPickerTypeahead = null;

/** Find feeds by the handle that publishes them, and add them to the chips. */
function openFeedPicker() {
  const v = $('v-home');
  v.innerHTML = '';
  const box = el(`<div class="section">
    <h3>add a feed</h3>
    <p>Any <code>app.bsky.feed.generator</code> on the network works here. Enter the handle
    that publishes it — try <b>spacecowboy17.bsky.social</b> — and pick one. Signed in, a
    personalised feed is personalised to <em>you</em>: your PDS mints a short-lived token
    that identifies you to that feed's service, and nothing of yours is stored here.</p>
    <div class="row"><input type="text" id="feedwho" placeholder="a handle that publishes feeds"></div>
    <div id="feedlist"></div>
  </div>`);
  v.append(box);

  const input = $('feedwho');
  feedPickerTypeahead = attachTypeahead(input, { onPick: (a) => listFeedsBy(a.handle) });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !document.querySelector('.ta-menu:not([hidden]) li.on')) {
      feedPickerTypeahead?.close();
      listFeedsBy(input.value.trim());
    }
  });
  say('add any feed generator on the network');
}

async function listFeedsBy(handle) {
  if (!handle) return;
  const list = $('feedlist');
  list.innerHTML = '<div class="empty">looking…</div>';
  const feeds = await feedgen.feedsBy(handle);
  list.innerHTML = '';
  if (!feeds.length) {
    list.append(el(`<div class="empty">@${esc(handle)} publishes no feeds.</div>`));
    return;
  }
  const saved = new Set(feedgen.savedFeeds());
  for (const f of feeds) {
    const on = saved.has(f.uri) || f.uri === feedgen.FOR_YOU;
    const row = el(`<div class="actor">
      <img class="aav" alt="" src="${f.avatar ? esc(f.avatar) : BLANK}">
      <div class="abody">
        <div class="aname">${esc(f.displayName)}</div>
        <div class="ahandle">${(f.likeCount ?? 0).toLocaleString()} likes</div>
        ${f.description ? `<div class="adesc">${esc(f.description)}</div>` : ''}
      </div>
      <button class="pill" data-add="${esc(f.uri)}">${on ? 'added' : 'add'}</button>
    </div>`);
    list.append(row);
  }
  list.onclick = (e) => {
    const b = e.target.closest('[data-add]');
    if (!b) return;
    const uri = b.dataset.add;
    feedgen.saveFeed(uri);
    b.textContent = 'added';
    loadFeedLabels();
    say('feed added — it is in the chips above');
  };
}

// ─── home ────────────────────────────────────────────────────────

async function selectFeed(id) {
  if (state.live) { state.live.close(); state.live = null; }
  if (state.runner) { state.runner.close(); state.runner = null; }
  if (state.conn) { state.conn.stop(); state.conn = null; }
  state.oldestRuleSeq = null;
  state.feed = id;
  state.cursor = null;
  state.sorted = false;
  state.seen.clear();
  $('v-home').innerHTML = '';
  renderChips();

  if (id === 'addfeed') { renderChips(); return openFeedPicker(); }
  if (id.startsWith('gen:')) return loadGenerator(id.slice(4), true);
  if (id === 'following') return startFollowing();
  if (id.startsWith('rule:')) return startRuleFeed(id.slice(5));
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

  state.conn = connectionStatus(`following · ${dids.length - 1} accounts, reverse chronological`);
  const opts = {
    dids, collections: ['app.bsky.feed.post'], kinds: [KIND.commit],
    onEvent: onLiveEvent,
    onConnect: () => state.conn?.onConnect(),
    onDisconnect: () => state.conn?.onDisconnect(),
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

  state.conn = connectionStatus(`live · ${dids.length} accounts, one socket`);
  const opts = {
    dids, collections: ['app.bsky.feed.post'], kinds: [KIND.commit],
    onEvent: onLiveEvent,
    onConnect: () => state.conn?.onConnect(),
    onDisconnect: () => state.conn?.onDisconnect(),
  };
  if (plan.mode === 'resume') opts.cursor = plan.cursor; else opts.since = plan.hours;
  state.live = new JetstreamClient(opts);
  state.live.connect();
}

/**
 * Open a paper. pdf.js is ~1.75 MB with its worker, so the module is imported
 * on the tap and never before — this must stay a dynamic import.
 */
let paperView = null;

async function openPaperFor(pdf, label) {
  if (paperView) { paperView.close?.(); paperView = null; }
  say(`opening ${label}…`);
  try {
    const mod = await import('/lib/paper.js');
    paperView = await mod.openPaper({ pdf, label });
    say(label);
  } catch (err) {
    say(`could not open the paper: ${err.message}`);
  }
}

// ─── rule feeds: a feed generator running in this tab ─────────────

/**
 * Run one of the reader's own rules.
 *
 * This is the answer to a feed generator going away. A generator record holds
 * only metadata — displayName, description, the service DID — so when the
 * service stops answering there is nothing in the record to rebuild from. But a
 * feed defined by CONTENT rather than by a follow graph needs no server at all:
 * Jetstream hands every post to anyone who asks, and the rule runs here.
 *
 * Two passes, in this order on purpose:
 *   1. the ARCHIVE — free, instant, works offline, and reaches back as far as
 *      this browser's store goes, which for a regular reader is further than
 *      Jetstream will ever replay.
 *   2. the FIREHOSE — matched live, with a visible meter, because an
 *      unfiltered post socket is real bandwidth and the reader should see what
 *      it costs rather than discover it on a phone bill.
 */
async function startRuleFeed(id) {
  const rule = rulefeed.getRule(id);
  if (!rule) return say('no such rule');
  state.sorted = true;                      // archive is old, live is new: place by time

  const head = el(`<div class="rulehead">
    <div class="rulemeta"><strong>${esc(rule.label)}</strong>
      <span class="rulenote">${esc(rule.note || 'A feed this browser generates for itself.')}</span></div>
    <div class="rulemeter" id="rulemeter">scanning what this browser already holds…</div>
    <div class="rulebtns">
      <button class="btn ghost small" id="ruleedit">edit the rule</button>
      <button class="btn ghost small" id="ruleback">reach further back</button>
      <label class="rulebudget">slug
        <select id="rulebudget">
          <option value="50">50 MB</option>
          <option value="150">150 MB</option>
          <option value="250">250 MB</option>
          <option value="500">500 MB</option>
        </select></label>
    </div>
    <div class="rulemeter" id="ruleplan" hidden></div>
  </div>`);
  $('v-home').append(head);
  on('ruleedit', 'click', () => openRuleEditor(rule.id));
  on('ruleback', 'click', () => reachBack(rule));
  const budget = $('rulebudget');
  budget.value = String(slugBudgetMb());
  budget.addEventListener('change', () => {
    try { localStorage.setItem('bsky:slug-mb', budget.value); } catch { /* fine */ }
  });

  // 1. the archive
  let held = 0;
  if (state.cacheOk) {
    const posts = await cache.recentPosts({ limit: 4000 }).catch(() => []);
    const hits = rulefeed.scanArchive(posts, rule);
    held = posts.length;
    for (const p of hits) appendPost(p);
    if (!hits.length) {
      $('v-home').append(el(`<div class="empty"><strong>Nothing matching in the local store yet.</strong>
        Scanned ${held.toLocaleString()} posts this browser already had. The firehose below fills it
        in from here — matches appear as they are posted.</div>`));
    }
  }

  // 2. deep history, or the live tail.
  //
  // Replay is the DEFAULT when the reader has a key, and that is the whole
  // point of the exercise: a subscription only hands you what happens next, so
  // a rule feed opened today is empty today however good the rule is. The
  // archive is the same events addressed by sequence, so the same rule can be
  // pointed backwards — 50 MB of it is ~59,000 posts and ~85 papers, measured.
  //
  // The firehose is the fallback for a reader with no key, not the design.
  if (apikey.hasKey()) {
    $('ruleback').textContent = 'reach further back';
    await reachBack(rule);
    // Offer the tail as an explicit extra, since it is the only way to see a
    // post that has not been sealed into a segment yet.
    const live = el('<button class="btn ghost small" id="rulelive">also listen live</button>');
    document.querySelector('.rulebtns')?.append(live);
    on('rulelive', 'click', () => startRuleFirehose(rule));
    return;
  }

  const plan = $('ruleplan');
  plan.hidden = false;
  plan.innerHTML = 'Reading the <strong>live firehose</strong>, which only shows posts from now on. '
    + 'The archive reaches backwards and is where this feed actually fills up — it is metered by '
    + 'the byte so it uses <strong>your</strong> key, free at '
    + '<a href="https://bsky.network/account" target="_blank" rel="noopener">bsky.network/account</a>, '
    + 'pasted under <strong>Me → deep history</strong>.';
  startRuleFirehose(rule);
}

/** The live tail: everything from now on, matched as it arrives. */
function startRuleFirehose(rule) {
  if (state.runner) return;
  const meter = $('rulemeter');
  state.runner = new rulefeed.RuleRunner({
    rule,
    Client: JetstreamClient,
    KIND,
    onStatus: (msg, live) => say(msg, live),
    onStats: (st) => {
      if (!meter.isConnected) return;
      meter.textContent = `${st.matched.toLocaleString()} matched of `
        + `${st.scanned.toLocaleString()} scanned · ${st.perSec.toFixed(0)} posts/s · `
        + `~${st.kbPerSec.toFixed(0)} KB/s · ${st.mb.toFixed(1)} MB this session`;
    },
    onMatch: (payload, hits) => {
      const uri = eventUri(payload);
      if (!uri || state.seen.has(uri)) return;
      const rec = payload.record;
      const post = {
        uri, did: payload.did, rkey: payload.rkey, seq: payload.seq, cid: payload.cid,
        createdAt: rec.createdAt || new Date().toISOString(), record: rec, hits,
      };
      // Store it even though this socket is unfiltered: a matched post is
      // exactly the history this reader wanted and will not be replayed twice.
      if (state.cacheOk) {
        state.writeQueue.push(post);
        if (state.writeQueue.length >= 100) flushWrites();
      }
      if (rec.reply) return;
      insertSorted(post);
    },
  });
  state.runner.start();
  say(`${rule.label} · connecting to the firehose`, false);
}

/**
 * Replay a bounded slug of the ARCHIVE and run the rule over it.
 *
 * This is what the live tail cannot do. The tail is a subscription: it only
 * ever hands you what happens next, so a rule feed opened today is empty today
 * however good the rule is. The archive is the same events addressed by
 * sequence rather than by arrival, so the same rule can be pointed backwards.
 *
 * Two properties make it usable rather than theoretical, and both are
 * deliberate:
 *
 *   PLAN BEFORE YOU PAY. `planCost()` asks the archive's index what a window
 *   contains — which segments hold matching events, and where a block index
 *   exists, which blocks. It is unauthenticated and free, so the size of the
 *   job is known before a byte of it is bought. The reader sees that number.
 *
 *   BUDGET IN BYTES. The meter is the reader's own quota, so the only promise
 *   worth making is "this will not spend more than N MB". `fetchSlug` counts
 *   wire bytes and aborts on the budget; the rule runs per event and everything
 *   that does not match is dropped rather than buffered.
 *
 * Pressing it again walks further back: `beforeSeq` starts at the oldest seq
 * this browser holds and moves down with each slug.
 */
/**
 * How big a slug to buy, in MB.
 *
 * Raising it is cheap because nothing is accumulated: `fetchSlug` streams and
 * DISCARDS every non-match, so peak memory is one block plus the keepers, not
 * the window. At the measured hit rate (~0.144%) a 250 MB slug is roughly 300k
 * posts and ~425 papers.
 *
 * The costs that DO scale are wall-clock (~7.6 MB/s measured, so 250 MB is
 * about half a minute) and the reader's metered quota, which is theirs. Hence a
 * control rather than a bigger constant.
 */
function slugBudgetMb() {
  try {
    const v = Number(localStorage.getItem('bsky:slug-mb'));
    if (v >= 10 && v <= 1000) return v;
  } catch { /* fall through */ }
  return 50;
}

let reachingBack = false;

async function reachBack(rule) {
  if (reachingBack) return;
  const btn = $('ruleback');
  const plan = $('ruleplan');
  const archiveMod = await archive().catch(() => null);
  if (!archiveMod) return say('the archive module failed to load');

  if (!archiveMod.hasKey()) {
    plan.hidden = false;
    plan.innerHTML = 'The archive is metered by the byte, so it uses <strong>your</strong> key, '
      + 'not ours — free at <a href="https://bsky.network/account" target="_blank" rel="noopener">'
      + 'bsky.network/account</a>. Paste it under <strong>Me → deep history</strong>.';
    return;
  }

  reachingBack = true;
  btn.disabled = true;
  plan.hidden = false;

  // Where to start: older than anything this browser already holds.
  const beforeSeq = state.oldestRuleSeq || undefined;

  try {
    plan.textContent = 'asking the archive what this window costs…';
    const cost = await archiveMod.planCost({
      collections: ['app.bsky.feed.post'],
      ...(beforeSeq ? { beforeSeq } : {}),
    });
    plan.textContent = `plan: ${cost.segments.length} segments · ${cost.blocks.toLocaleString()} `
      + `indexed blocks · ${cost.wholeSegments} whole. Downloading up to 50 MB of it…`;

    const matcher = rulefeed.compile(rule);
    const found = [];
    const budgetBytes = slugBudgetMb() * 1024 * 1024;
    const res = await archiveMod.fetchSlug({
      budgetBytes,
      match: (record) => matcher.why(record),
      onMatch: (post) => {
        found.push(post);
        if (state.seen.has(post.uri)) return;
        if (post.record.reply) return;
        insertSorted(post);
      },
      ...(beforeSeq ? { beforeSeq } : {}),
      onProgress: ({ scanned, matched, bytes }) => {
        plan.textContent = `${matched.toLocaleString()} matched of ${scanned.toLocaleString()} `
          + `scanned · ${(bytes / 1048576).toFixed(1)} of ${slugBudgetMb()} MB`;
      },
    });

    if (res.oldestSeq) state.oldestRuleSeq = res.oldestSeq;
    if (state.cacheOk && found.length) cache.putPosts(found).catch(() => {});

    plan.textContent = `${res.matched.toLocaleString()} kept from `
      + `${res.scanned.toLocaleString()} posts · ${(res.bytes / 1048576).toFixed(1)} MB · ${res.stopped}`
      + (res.matched ? '' : ' — nothing matched; try widening the rule');
  } catch (err) {
    plan.textContent = `archive: ${err.message}`;
  } finally {
    reachingBack = false;
    btn.disabled = false;
  }
}

/** Edit a rule as one directive per line — see rulefeed.toText for the grammar. */
function openRuleEditor(id) {
  const rule = rulefeed.getRule(id);
  if (!rule) return;
  const sheet = el(`<div class="sheet" id="rulesheet" role="dialog" aria-modal="true"
       aria-label="Edit ${esc(rule.label)}">
    <div class="sheethead">
      <button id="rulecancel" class="pill">cancel</button>
      <span class="spacer"></span>
      <button id="rulesave" class="btn">save</button>
    </div>
    <div class="sheetbody">
      <p class="rulehelp">One directive per line.<br>
        <code>preprint</code> a term · <code>vaccin*</code> a prefix (also matches
        vaccines, vaccination) · <code>"new paper"</code> an exact phrase ·
        <code>@arxiv.org</code> a link domain · <code>#openscience</code> a hashtag ·
        <code>-trump</code> excludes a term · <code>-@politico.com</code> excludes an
        outlet · <code>doi</code> matches any DOI.<br>
        Exclusions win over everything, and they read links as well as text.</p>
      <textarea id="ruletext" spellcheck="false" autocapitalize="off">${esc(rulefeed.toText(rule))}</textarea>
    </div>
    <div class="sheetfoot">
      <span class="muted" style="font-size:12.5px">stays in this browser</span>
      <span class="spacer"></span>
      <button class="btn ghost" id="rulereset">reset</button>
    </div></div>`);
  document.body.append(sheet);
  const close = () => sheet.remove();
  $('rulecancel').addEventListener('click', close);
  $('rulesave').addEventListener('click', () => {
    rulefeed.saveRule(rulefeed.fromText($('ruletext').value, { id: rule.id, label: rule.label, note: rule.note, minChars: rule.minChars }));
    close();
    selectFeed(`rule:${rule.id}`);          // restart against the new rule
  });
  $('rulereset').addEventListener('click', () => {
    rulefeed.resetRules();
    close();
    selectFeed(`rule:${rule.id}`);
  });
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
  state.conn?.bump();

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

/**
 * "Read the paper" — only where the browser can actually fetch the PDF.
 *
 * Offered on measurement, not on hope: arXiv sends `access-control-allow-origin: *`
 * AND accepts Range requests, so pdf.js can stream it. Every other publisher
 * tested refuses cross-origin reads, and a button that opens an error is worse
 * than the plain link the reader already had — see lib/paper.js for the table.
 */
function paperButton(p) {
  const paper = paperOf(linksOf(p.record));
  if (!paper) return '';
  return `<button class="paperbtn" data-paper="${esc(paper.pdf)}" data-paperlabel="${esc(paper.label)}">`
    + `📄 read ${esc(paper.label)}</button>`;
}

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
        ${paperButton(p)}
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
      </div>
      <div class="pactions"><button class="btn ghost" id="me-signout">sign out</button></div>
      </div>`));
  } else {
    v.append(el(`<div class="section"><h3>account</h3>
      <p>Reading needs no account. Signing in is only for writing — it goes through the shared
      OAuth worker, which holds the token so this page never does, and asks once for exactly what
      this site writes: posts, likes and reposts, plus permission to ask your own PDS for the
      short-lived token that identifies you to a third-party feed.</p>
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

  // Install / update. Offline this app is not a blank page: the shell is
  // precached and the posts are already in IndexedDB, so it opens on the
  // archive this browser has accumulated.
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  let installBody;
  if (swWaiting) {
    installBody = `<p>A new version has downloaded and is waiting.</p>
      <button class="btn" id="me-update">update now</button>`;
  } else if (isInstalled()) {
    installBody = `<p>Running from your home screen. The app shell is stored on this device, so
      it opens without a network — and everything in the local store below is readable offline.</p>`;
  } else if (deferredInstall) {
    installBody = `<p>Add it to your home screen and it opens like an app: no address bar, and it
      still works with no network — the shell is stored on this device and the posts are already
      in the local store below.</p>
      <button class="btn" id="me-install">install</button>`;
  } else if (ios) {
    installBody = `<p>To add this to your home screen: tap <b>Share</b>, then <b>Add to Home
      Screen</b>. iOS gives a page no way to ask on its own. Once added it opens without an
      address bar and works with no network.</p>`;
  } else {
    installBody = `<p>Your browser installs this from its own menu — look for <b>Install</b> or
      <b>Add to Home Screen</b>. Once installed it opens without an address bar and works with
      no network.</p>`;
  }
  v.append(el(`<div class="section"><h3>install</h3>${installBody}</div>`));

  const a = await archive().catch(() => null);
  v.append(el(`<div class="section"><h3>deep history</h3>
    <p>Older than the ${LOOKBACK_HOURS}h window is the <em>archive</em>, which is metered by the
    byte and needs a key — so it uses <strong>yours</strong>, not ours. Free at
    <a href="https://bsky.network/account" target="_blank" rel="noopener">bsky.network/account</a>;
    it stays in this browser and goes straight from here to Jetstream.</p>
    <div class="row"><input type="text" id="akey" placeholder="${apikey.hasKey() ? 'key saved — paste to replace' : 'paste your Jetstream key'}" autocomplete="off"></div>
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
      ? 'enabled — <code>auth.mino.mobi</code> publishes both scopes.'
        : '<code>auth.mino.mobi</code> is not currently offering the two scopes, so the buttons '
        + 'explain themselves rather than failing at the consent screen.'}</p>
    <p><a href="https://github.com/minormobius/agent01/blob/main/docs/APPVIEW-FEASIBILITY.md">how this works</a>
     · <a href="https://b.mino.mobi">the rest of the Bluesky corner ↗</a></p></div>`));

  on('me-install', 'click', promptInstall);
  on('me-update', 'click', applyUpdate);
  on('me-signin', 'click', signIn);
  on('me-signout', 'click', signOut);
  on('me-clear', 'click', async () => {
    if (!confirm('Delete every post this browser has stored?')) return;
    await cache.clearAll(); renderMe();
  });
  // apikey.js, NOT archive() — saving a key is localStorage.setItem and must
  // not depend on the WASM bundle, which is exactly what is missing when
  // somebody is trying to set a key up in the first place.
  on('akey-save', 'click', () => {
    const val = $('akey').value.trim();
    if (!val) return say('paste a key first');
    if (!apikey.setKey(val)) return say('could not save — this browser is blocking site data');
    $('akey').value = '';
    renderMe();
    say('key saved — "reach further back" can now read the archive');
  });
  on('akey-drop', 'click', () => {
    apikey.setKey('');
    renderMe();
    say('key forgotten');
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
  btn.onclick = () => goTab('me');
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

/**
 * What the compose sheet is currently carrying besides text: up to four
 * prepared images, and at most one quoted post.
 */
let draft = { images: [], quote: null };

function openSheet(opts = {}) {
  if (!auth().isLoggedIn()) return signIn();
  draft = { images: [], quote: opts.quote || null };
  $('ct').value = opts.text || '';
  renderThumbs();
  renderQuotePreview();
  countChars();
  $('sheet').hidden = false;
  $('ct').focus();
}

function closeSheet() {
  $('sheet').hidden = true;
  $('cs').textContent = '';
  // Object URLs are not garbage collected; leaking one per picked image adds up
  // over a session of posting.
  for (const img of draft.images) URL.revokeObjectURL(img.url);
  draft = { images: [], quote: null };
  renderThumbs();
  renderQuotePreview();
}

function renderQuotePreview() {
  const box = $('cquote');
  if (!box) return;
  box.hidden = !draft.quote;
  if (draft.quote) {
    box.textContent = `quoting @${draft.quote.handle || 'a post'}: `
      + (draft.quote.text || '').slice(0, 120);
  }
}

/** Thumbnails, each with its own ALT box — alt text is not optional here. */
function renderThumbs() {
  const box = $('cthumbs');
  if (!box) return;
  box.innerHTML = '';
  draft.images.forEach((img, i) => {
    const t = el(`<div class="cthumb">
      <img alt="" src="${esc(img.url)}">
      <button type="button" data-rm="${i}" aria-label="Remove image">×</button>
      <input type="text" data-alt="${i}" placeholder="alt text" value="${esc(img.alt || '')}">
    </div>`);
    box.append(t);
  });
  countChars();
}

async function addImages(files) {
  const room = MAX_IMAGES - draft.images.length;
  if (room <= 0) return say(`${MAX_IMAGES} images is the limit`);
  for (const file of [...files].slice(0, room)) {
    if (!file.type.startsWith('image/')) {
      // Video needs Bluesky's transcoding service, not a PDS blob — see the
      // note in this surface's CLAUDE.md. Saying so beats a silent skip.
      say(file.type.startsWith('video/')
        ? 'video needs Bluesky\'s transcoder — images only for now'
        : `not an image: ${file.type || 'unknown type'}`);
      continue;
    }
    draft.images.push({ file, url: URL.createObjectURL(file), alt: '' });
  }
  renderThumbs();
}

function countChars() {
  const n = graphemeLength($('ct').value);
  $('cc').textContent = `${n}/${MAX_GRAPHEMES}`;
  $('cc').className = n > MAX_GRAPHEMES ? 'over' : '';
  // An image-only or quote-only post is legitimate; requiring text is not.
  const hasBody = n > 0 || draft.images.length > 0 || Boolean(draft.quote);
  $('sheet-post').disabled = !hasBody || n > MAX_GRAPHEMES;
}

async function sendPost() {
  $('sheet-post').disabled = true;
  $('cs').textContent = 'posting…';
  try {
    await publish($('ct').value, {
      resolveHandle: (h) => resolveActor(h).catch(() => null),
      images: draft.images,
      quote: draft.quote,
    });
    $('ct').value = ''; countChars(); closeSheet();
    say('posted');
  } catch (err) {
    $('cs').textContent = err.message;
    $('sheet-post').disabled = false;
  }
}

/**
 * Sign out.
 *
 * This function did not exist. The button, the docs and the commit message all
 * shipped without it, and because `$('me-signout').addEventListener('click',
 * signOut)` throws a ReferenceError, it also took out every handler wired after
 * it — "clear the store", "save key" and "forget key" were all dead, but only
 * for signed-in readers, because signed out the `?.` short-circuits and the
 * line never runs. `lib/wiring.selftest.mjs` now fails the build on a handler
 * that names an undefined function.
 *
 * Three things it must keep doing:
 *
 *   - `forgetInteractions()` FIRST. The like/repost rkeys in localStorage
 *     belong to one account; leaving them paints hearts on the next reader's
 *     feed for likes that are not theirs, and an unlike would try to delete a
 *     record in a repo they do not own.
 *   - KEEP the post cache. Those are public posts this browser collected, not
 *     account data, and discarding them would throw away the archive the whole
 *     design rests on. Clearing it is a separate, explicit button.
 *   - Say that it signs you out everywhere. The session is a `*.mino.mobi`
 *     domain cookie, so this is not a per-site sign-out.
 */
async function signOut() {
  if (!confirm('Sign out? This signs you out of every mino.mobi site.\n\n'
    + 'Posts this browser has stored are kept — clearing those is a separate button.')) return;

  // Before the session goes: these rkeys are only meaningful for this account.
  try { actions.forgetInteractions(); } catch { /* nothing stored */ }

  try {
    await auth().logout();               // the client's method is logout(), not signOut()
  } catch (err) {
    say(`sign-out failed: ${err.message}`);
    return;
  }

  state.me = null;
  state.canWrite = { like: false, repost: false };
  refreshAuth();
  renderMe();
  renderChips();
  // The following feed is not readable signed out; fall back rather than
  // leaving an empty chip selected.
  if (state.feed === 'following') selectFeed('simcluster');
  say('signed out');
}

// ─── installing, and updating once installed ─────────────────────

/**
 * Chromium fires `beforeinstallprompt` when it decides a page is installable,
 * and the prompt can only be shown from a user gesture afterwards — so the
 * event is stashed and the Me tab grows an "install" button. Safari fires
 * nothing at all and offers no API: on iOS the only route is Share -> Add to
 * Home Screen, which is why the Me tab tells iOS readers that in words.
 */
let deferredInstall = null;
let swWaiting = null;

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();                 // or Chrome shows its own mini-infobar
  deferredInstall = e;
  if (state.tab === 'me') renderMe();
});

window.addEventListener('appinstalled', () => {
  deferredInstall = null;
  if (state.tab === 'me') renderMe();
});

/** True when running from the home screen rather than a browser tab. */
function isInstalled() {
  return matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
}

async function promptInstall() {
  if (!deferredInstall) return;
  deferredInstall.prompt();
  await deferredInstall.userChoice.catch(() => {});
  deferredInstall = null;             // the event is single-use
  renderMe();
}

/**
 * sw.js deliberately does not skipWaiting, so a deploy sits in the `waiting`
 * state rather than swapping modules under a page mid-session. This surfaces
 * that as a button instead of leaving the reader silently a version behind.
 */
function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  // `isSecureContext` is the exact condition the API itself requires, and it
  // already knows that https, localhost AND 127.0.0.1 all qualify. Hand-rolling
  // the check (`hostname === 'localhost'`) silently refuses to register on a
  // loopback IP, which is how this was first written and how it was caught.
  if (!window.isSecureContext) return;

  navigator.serviceWorker.register('/sw.js').then((reg) => {
    if (reg.waiting && navigator.serviceWorker.controller) {
      swWaiting = reg.waiting;
      if (state.tab === 'me') renderMe();
    }
    reg.addEventListener('updatefound', () => {
      const sw = reg.installing;
      if (!sw) return;
      sw.addEventListener('statechange', () => {
        // `controller` distinguishes an UPDATE from the very first install —
        // without it every first-time visitor is told an update is ready.
        if (sw.state === 'installed' && navigator.serviceWorker.controller) {
          swWaiting = sw;
          if (state.tab === 'me') renderMe();
        }
      });
    });
  }).catch(() => { /* private mode, or site data blocked: the app still works */ });

  // `controllerchange` fires for TWO different reasons and only one of them
  // wants a reload: an updated worker taking over (reload, or the page keeps
  // running last version's modules), and sw.js's own clients.claim() adopting
  // a page that had no controller yet — which is every FIRST visit. Reloading
  // on that one gives every new reader a gratuitous double-load. Snapshot
  // whether a controller already existed and let that decide.
  const hadController = Boolean(navigator.serviceWorker.controller);
  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController || reloading) return;
    reloading = true;
    location.reload();
  });
}

function applyUpdate() {
  swWaiting?.postMessage({ type: 'SKIP_WAITING' });   // controllerchange reloads us
  swWaiting = null;
}

/**
 * Swipe right to go back.
 *
 * Scoped deliberately to an EDGE swipe — the gesture must start within
 * `EDGE_PX` of the left edge — for one reason: this app already uses horizontal
 * drags for other things. The lightbox pages through a post's images with them,
 * and the PDF viewer pans a zoomed page with them. A general "swipe right
 * anywhere goes back" would fight both, and a gesture that sometimes navigates
 * away mid-read is worse than no gesture.
 *
 * The other guards, each for a specific way this goes wrong:
 *   - any overlay open (lightbox, paper, a sheet) → the gesture is theirs.
 *   - a multi-touch gesture → that is a pinch, not a swipe.
 *   - more vertical than horizontal movement → that is a scroll.
 *   - nothing to go back to → do nothing rather than leave the site.
 */
const EDGE_PX = 32;
const SWIPE_MIN = 64;          // shorter than this is a tap that wandered
const SWIPE_SLOPE = 1.4;       // horizontal must beat vertical by this much

function installBackSwipe() {
  let x0 = 0, y0 = 0, tracking = false;

  const overlayOpen = () =>
    document.querySelector('.paper, .lightbox, #rulesheet')
    || [...document.querySelectorAll('.sheet')].some((el) => !el.hidden);

  document.addEventListener('touchstart', (e) => {
    tracking = false;
    if (e.touches.length !== 1 || overlayOpen()) return;
    const t = e.touches[0];
    if (t.clientX > EDGE_PX) return;
    x0 = t.clientX; y0 = t.clientY; tracking = true;
  }, { passive: true });

  document.addEventListener('touchend', (e) => {
    if (!tracking) return;
    tracking = false;
    const t = e.changedTouches[0];
    if (!t) return;
    const dx = t.clientX - x0;
    const dy = Math.abs(t.clientY - y0);
    if (dx < SWIPE_MIN || dx < dy * SWIPE_SLOPE) return;
    goBack();
  }, { passive: true });
}

/**
 * Back, with a floor. `history.back()` on the first page of a session leaves
 * the site entirely, which is not what a back gesture means — so a thread or
 * profile with nothing behind it falls back to the feed.
 */
function goBack() {
  const deep = /^#\/(thread|profile)\//.test(location.hash || '');
  if (history.length > 1) { history.back(); return; }
  location.hash = deep ? '#/' : '#/';
}

/**
 * Repost, or quote?
 *
 * Anchored to the button rather than shown as a centred modal: the reader's
 * thumb is already there, and a modal in the middle of the screen for a
 * two-word choice is a bigger interruption than the choice deserves.
 *
 * Un-reposting skips this entirely — there is only one way to undo.
 */
function askRepostKind(btn, post) {
  document.querySelector('.repostmenu')?.remove();
  const menu = el(`<div class="repostmenu">
    <button type="button" data-kind="repost">↻ Repost</button>
    <button type="button" data-kind="quote">❝ Quote post</button>
  </div>`);
  const r = btn.getBoundingClientRect();
  menu.style.left = `${Math.max(8, Math.min(window.innerWidth - 188, r.left))}px`;
  menu.style.top = `${r.bottom + window.scrollY + 6}px`;
  document.body.append(menu);

  const close = () => { menu.remove(); document.removeEventListener('click', away, true); };
  const away = (e) => { if (!menu.contains(e.target)) close(); };
  // The click that opened this is still propagating; listen from the next tick
  // or the menu closes itself immediately.
  setTimeout(() => document.addEventListener('click', away, true), 0);

  menu.addEventListener('click', (e) => {
    const kind = e.target.closest('[data-kind]')?.dataset.kind;
    if (!kind) return;
    close();
    if (kind === 'repost') { toggleAction(btn, post, 'repost'); return; }
    openQuote(post);
  });
}

/** Open the composer with this post attached as a quote. */
function openQuote(post) {
  // A quote without the quoted post's CID is rejected by the PDS — the same
  // trap as a like. Saying so beats failing after the reader has written.
  if (!post?.uri || !post?.cid) {
    return say('cannot quote this post — its cid is not known here');
  }
  openSheet({
    quote: {
      uri: post.uri,
      cid: post.cid,
      handle: post.author?.handle || state.profiles.get(post.did)?.handle,
      text: post.record?.text || '',
    },
  });
}

// ─── wiring ──────────────────────────────────────────────────────

for (const b of document.querySelectorAll('.tab')) {
  b.addEventListener('click', () => goTab(b.dataset.tab));
}
installBackSwipe();
$('fab').addEventListener('click', openSheet);
$('sheet-cancel').addEventListener('click', closeSheet);
$('signin-cancel').addEventListener('click', () => { signinTypeahead?.close(); $('signin').hidden = true; });
$('signin-go').addEventListener('click', doSignIn);
$('sheet-post').addEventListener('click', sendPost);
on('cfile', 'change', (e) => { addImages(e.target.files); e.target.value = ''; });
$('cthumbs')?.addEventListener('click', (e) => {
  const rm = e.target.closest('[data-rm]');
  if (!rm) return;
  const [img] = draft.images.splice(Number(rm.dataset.rm), 1);
  if (img) URL.revokeObjectURL(img.url);
  renderThumbs();
});
$('cthumbs')?.addEventListener('input', (e) => {
  const alt = e.target.closest('[data-alt]');
  if (alt) draft.images[Number(alt.dataset.alt)].alt = alt.value;
});
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
    return say(`${act}s need repo:app.bsky.feed.${act} — reauthorise from the Me tab`);
  }

  // A repost is two different intentions sharing one glyph: pass it on, or pass
  // it on WITH something to say. Every client asks, because doing the wrong one
  // is public and cannot be quietly undone.
  if (act === 'repost' && !btn.classList.contains('on')) {
    return askRepostKind(btn, post);
  }

  return toggleAction(btn, post, act);
});

/**
 * The optimistic like/repost flip. Extracted so the repost/quote menu can reach
 * it: the menu's "Repost" must do exactly what a direct tap does, and a second
 * copy of this would drift.
 */
async function toggleAction(btn, post, act) {
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
}

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
  // Before the card's own data-thread: opening the paper is not opening the
  // thread, and the button sits inside the article.
  const pb = e.target.closest('[data-paper]');
  if (pb) {
    e.preventDefault();
    openPaperFor(pb.dataset.paper, pb.dataset.paperlabel);
    return;
  }

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
  route();   // handles a deep link, a manifest shortcut, or nothing at all
  registerServiceWorker();

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

/**
 * dweet.mino.mobi — a feed of 140-character animations, and a place to write one.
 *
 * No backend, for the same reason the AppView next door has none: at 140
 * characters the whole artwork arrives inside the firehose event, so tailing
 * Jetstream IS the feed. Nothing is fetched to render a card and nothing is
 * stored to remember one.
 *
 *   the art            Jetstream v2, filtered to one collection
 *   who made it        the public AppView, profile hydration only
 *   how many remixes   Constellation, the global backlink index
 *   posting            the shared OAuth worker, one narrow scope
 *
 * The execution boundary lives in sandbox.js and is the reason this surface is
 * safe to build at all — read that file's header before changing anything here
 * that touches a frame.
 */
import { JetstreamClient, KIND } from '/packages/atproto/jetstream.js';
import { countDistinct } from '/packages/atproto/constellation.js';
import { getProfiles } from '/packages/atproto/bsky.js';
import { AuthClient } from '/packages/oauth-client/auth.js';
import {
  DweetFrame, captureFrames, validate, countChars, sizeClass, dwitterPortable,
  MAX_CHARS, DWITTER_CHARS, CAPTURE_W, CAPTURE_H, CAPTURE_FPS,
} from '/dweet/sandbox.js';
// One place that knows what a Jetstream v2 payload looks like. See its header:
// the payload is FLAT, and reading it as nested is silent, total failure.
import { dweetFromEvent } from '/dweet/event.js';
import { SEEDS } from '/dweet/seeds.js';
// History and profiles come straight from each poster's own repo. See its
// header for why the firehose replay alone left the feed empty.
import { resolveDid, resolveIdentity, listDweets } from '/dweet/repo.js';
import { encodeGif } from '/dweet/gif.js';
import {
  mp4Support, recordMp4, uploadLimits, uploadVideo, awaitJob, videoEmbed, jobLabel,
  VIDEO_SERVICE_DID, UPLOAD_LXM,
} from '/dweet/video.js';
import {
  composePost, altText, feedPost, permalink, fromPermalink, pickStill,
  SHARE_SCOPES, graphemes, POST_MAX,
} from '/dweet/share.js';
// The AppView next door already owns handle typeahead, including the abort
// race and the ARIA roles. Same asset root, same origin, one implementation.
import { attachTypeahead } from '/lib/typeahead.js';

const NSID = 'com.minomobi.dweet.dweet';

/**
 * Where this surface is mounted.
 *
 * It used to be the literal `'/'`, written when the plan was a subdomain of
 * its own. At `bsky.mino.mobi/dweet/` that made every `show()` rewrite the URL
 * to the AppView's root, so a refresh left dweet entirely and landed on the
 * timeline — reported as "when I refresh I go to bsky.mino.mobi". Derived from
 * the document's own path so it is right wherever the surface ends up,
 * including if the subdomain ever does get bound.
 */
const BASE = location.pathname.replace(/[^/]*$/, '');

/** The remix edge, as a Constellation link. Same shape as its built-in LINK entries. */
const REMIX_LINK = { collection: NSID, path: '.remixOf' };

/**
 * Only what this surface writes. The consent screen should be one line long —
 * which matters more than usual when the pitch is "we run strangers' code".
 */
const SCOPE = `atproto repo:${NSID}`;

const $ = (id) => document.getElementById(id);
const el = (tag, cls, text) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
};

const auth = new AuthClient('https://auth.mino.mobi');

// ── feed ──────────────────────────────────────────────────────────

/** at:// URI → card, so an at-least-once firehose does not double-render. */
const seen = new Map();
/** Frames currently mounted, keyed by card, so the observer can start/stop them. */
const frames = new WeakMap();
/** at:// URI -> card element. A WeakMap cannot answer this, and a delete needs to. */
const cards = new Map();
const profiles = new Map();

/**
 * Only visible dweets run. A feed of 60fps canvases that all animate at once
 * is the one way this page could be slower than the AppView it sits beside.
 */
const visibility = new IntersectionObserver((entries) => {
  for (const e of entries) {
    const f = frames.get(e.target);
    if (!f) continue;
    if (e.isIntersecting) f.start();
    else f.stop();
  }
  // No rootMargin. Pre-warming one card off-screen sounds friendly and is not:
  // a 16:9 card is most of a phone screen, so a 200px margin ran three dweets
  // at once, and three concurrent full-screen shaders on a device without a
  // GPU starved each other badly enough to trip the watchdog on an innocent
  // sketch. Measured, not guessed — see WATCHDOG_MS. Starting on the
  // intersection costs a few frames of black at the top of a card and buys
  // every other card its full frame budget.
}, { rootMargin: '0px' });

function timeAgo(iso) {
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (!isFinite(s)) return '';
  if (s < 60) return `${s | 0}s`;
  if (s < 3600) return `${(s / 60) | 0}m`;
  if (s < 86400) return `${(s / 3600) | 0}h`;
  return `${(s / 86400) | 0}d`;
}

/**
 * Build one card. `d` is either a record off the wire or a local seed.
 */
function card(d) {
  const root = el('article', 'card');

  const meta = el('div', 'meta');
  const avatar = el('img');
  avatar.alt = '';
  avatar.loading = 'lazy';
  meta.append(avatar);
  const name = el('span', 'name', d.local ? d.author : (d.did || '').slice(0, 24));
  const handle = el('span', 'handle', d.local ? '' : '');
  if (!d.local && d.did) {
    // The author is a way in to everything else they have made.
    const who = el('button', 'who');
    who.title = 'all of their dweets';
    who.append(avatar, name, handle);
    who.onclick = () => openProfile(d.did);
    meta.append(who);
  } else {
    meta.append(name, handle);
  }
  if (d.title) meta.append(el('span', 'name', `· ${d.title}`));
  meta.append(el('span', 'when', d.when ?? (d.local ? 'house' : timeAgo(d.createdAt))));
  root.append(meta);

  const stage = el('div', 'stage');
  const placeholder = el('div', 'placeholder', 'paused — scroll into view');
  stage.append(placeholder);
  root.append(stage);

  const pre = el('pre');
  pre.textContent = d.src;
  root.append(pre);

  const foot = el('div', 'foot');
  foot.append(el('span', 'tag lang', d.lang));
  // The size CATEGORY leads, because that is the achievement; the raw count
  // follows, because a badge that hides how close you are to the next tier
  // down is no use to anyone golfing toward it.
  const sz = sizeClass(d.src);
  const tier = el('span', 'tag tier', sz.label);
  tier.title = `${sz.bytes} bytes`
    + (sz.tier ? ` — inside the ${sz.label} category` : ' — above 256b');
  foot.append(tier);
  foot.append(el('span', 'tag', `${countChars(d.src)}/${MAX_CHARS}`));
  if (dwitterPortable(d)) {
    const port = el('span', 'tag port', 'dwitter');
    port.title = `${DWITTER_CHARS} chars or fewer of js — runs on dwitter.net unchanged`;
    foot.append(port);
  }
  const remixTag = el('span', 'tag');
  remixTag.hidden = true;
  foot.append(remixTag);

  const act = el('div', 'act');
  const share = el('button', null, 'share');
  share.title = 'a still, a link that runs it, or a GIF';
  share.onclick = () => openShare(d);
  const remix = el('button', null, 'remix');
  remix.onclick = () => openComposer({ src: d.src, lang: d.lang, remixOf: d.uri || null });
  act.append(share, remix);
  foot.append(act);
  root.append(foot);

  // The frame is built now but only told to run when it is on screen.
  const frame = new DweetFrame({
    src: d.src,
    lang: d.lang,
    onLive: () => placeholder.remove(),
    onError: (e) => {
      const fault = el('div', 'fault', `${e.stage}: ${e.message}`);
      stage.append(fault);
    },
    onHang: () => {
      stage.append(el('div', 'fault',
        'stopped — this dweet did not yield for 2.5s and was removed'));
    },
  });
  frame.mount(stage);
  // captureTime: draw the author's chosen moment now, so a paused card shows a
  // composed frame instead of whatever t=0 looks like — which, for anything
  // that draws itself over time, is an empty canvas.
  if (typeof d.captureTime === 'number' && d.captureTime > 0) {
    frame.poster(d.captureTime / 1000);
  }
  frames.set(root, frame);
  visibility.observe(root);

  // Remix count, if this is a real record. One request, no auth, no index.
  if (d.uri) {
    countDistinct(d.uri, REMIX_LINK)
      .then((n) => { if (n > 0) { remixTag.textContent = `${n} remix${n > 1 ? 'es' : ''}`; remixTag.hidden = false; } })
      .catch(() => {});
    hydrate(d.did, name, handle, avatar);
  } else if (d.note) {
    const note = el('p', 'note', d.note);
    root.append(note);
  }

  return root;
}

/** Profile hydration, batched by the caller's natural arrival rate. */
const pending = new Map();
let hydrateTimer = 0;
function hydrate(did, nameEl, handleEl, avatarEl) {
  if (profiles.has(did)) return paint(profiles.get(did));
  if (!pending.has(did)) pending.set(did, []);
  pending.get(did).push(paint);
  clearTimeout(hydrateTimer);
  hydrateTimer = setTimeout(flushHydrate, 250);

  function paint(p) {
    if (!p) return;
    nameEl.textContent = p.displayName || p.handle || did.slice(0, 24);
    handleEl.textContent = p.handle ? `@${p.handle}` : '';
    if (p.avatar) avatarEl.src = p.avatar;
  }
}
async function flushHydrate() {
  const dids = [...pending.keys()];
  if (!dids.length) return;
  const waiting = new Map(pending);
  pending.clear();
  let got;
  try { got = await getProfiles(dids); } catch { return; }
  for (const [did, fns] of waiting) {
    const p = got.get?.(did) ?? got[did];
    if (p) profiles.set(did, p);
    for (const fn of fns) fn(p);
  }
}

function addCard(d, { prepend = false, sorted = false, into = 'feed' } = {}) {
  const feed = $(into);
  const node = card(d);
  // `cards` answers deletes for the FEED. A profile shows the same record in a
  // second card, and registering that one would orphan the feed's.
  if (d.uri && into === 'feed') cards.set(d.uri, node);
  if (sorted) {
    // Two sources now fill the feed — repos (history) and the firehose (live)
    // — and they arrive in no useful order relative to each other. So each
    // card takes its place by createdAt, newest first.
    const t = Date.parse(d.createdAt) || 0;
    node.dataset.t = String(t);
    const after = [...feed.children].find((c) => Number(c.dataset.t || 0) < t);
    feed.insertBefore(node, after || null);
  } else if (prepend && feed.firstChild) feed.insertBefore(node, feed.firstChild);
  else feed.append(node);
}

/** Tear down every frame in a container — a terminated worker frees its thread. */
function clearCards(into) {
  const box = $(into);
  for (const c of [...box.children]) {
    frames.get(c)?.destroy();
    visibility.unobserve(c);
  }
  box.replaceChildren();
}

function showSeeds() {
  $('feed-empty').hidden = false;
  for (const s of SEEDS) {
    addCard(s);
    $('feed').lastChild.dataset.seed = '1';
  }
}

// ── the firehose ──────────────────────────────────────────────────

/**
 * A socket ending is NOT a fault, and reporting it as one is why this line
 * read "disconnected" essentially all the time.
 *
 * Jetstream closes normally: when a replay finishes, on idle, on a host
 * rotation. Every close painted red, the reconnect painted over it, and the
 * backoff grows to 30s — so the lie was what was on screen most of the time.
 * The AppView next door hit this first and its fix is the one ported here
 * (`connectionStatus()` in ../app.js): report a drop only if it has not
 * repaired itself within a grace period.
 *
 * The second half is specific to dweet, and it is the bigger half. This socket
 * is filtered to ONE collection, and that collection is new — so "connected
 * and silent" is the normal, correct, expected state, for hours. A status line
 * that can only say live or dead has no way to say that, and silence reads as
 * failure. So it says it: `live · waiting for the next dweet`.
 */
const RECONNECT_GRACE_MS = 2500;

function connectionStatus() {
  const dot = $('live-dot');
  const text = $('live-text');
  let connected = false;
  let events = 0;
  let pendingDrop = null;
  let everConnected = false;
  let attempts = 0;

  const paint = () => {
    dot.className = connected ? 'dot on' : 'dot off';
    if (!connected) {
      // Three states, not two. "Connecting" that never resolves is its own
      // answer and the page should give it rather than spinning: the socket
      // is refused before the upgrade, which is what a bad filter looks like
      // and what a blocked WebSocket looks like.
      text.textContent = everConnected ? 'reconnecting…'
        : attempts >= 3 ? 'cannot reach the firehose — still retrying'
        : 'connecting to the firehose…';
      return;
    }
    text.textContent = events
      ? `live · ${events.toLocaleString()} dweet${events === 1 ? '' : 's'} seen`
      // The honest empty state. Tailing a brand-new lexicon means a quiet
      // socket, and quiet is not broken.
      : 'live · waiting for the next dweet';
  };

  paint();
  return {
    onConnect() {
      connected = true;
      everConnected = true;
      clearTimeout(pendingDrop);
      pendingDrop = null;
      paint();
    },
    onDisconnect() {
      connected = false;
      if (!everConnected) attempts++;
      clearTimeout(pendingDrop);
      // Do NOT repaint now. If the client reconnects inside the grace period
      // — which is the common case — nothing on screen ever moved.
      pendingDrop = setTimeout(() => { if (!connected) paint(); }, RECONNECT_GRACE_MS);
    },
    /** A failure the client could name — a bad filter, a refused upgrade. */
    fault(why) {
      connected = false;
      clearTimeout(pendingDrop);
      dot.className = 'dot off';
      text.textContent = `firehose unreachable — ${why}`;
    },
    /** Per delivered event, so the line proves flow rather than asserting it. */
    bump() { events++; if (connected) paint(); },
  };
}

/**
 * Posters whose repos the feed reads on arrival. The house account, plus
 * everyone this browser has seen post — so the second visit paints real work
 * immediately instead of waiting on the firehose. localStorage, capped, and
 * every access guarded: a private window must still get a working feed.
 */
const HOUSE = ['did:plc:yivyyp54vddf7qf2lpsikhe4'];   // morphyx, the house account
const KNOWN_KEY = 'dweet.authors';
const KNOWN_MAX = 40;
function knownAuthors() {
  let mine = [];
  try { mine = JSON.parse(localStorage.getItem(KNOWN_KEY) || '[]'); } catch { /* none */ }
  return [...new Set([...HOUSE, ...(Array.isArray(mine) ? mine : [])])].slice(0, KNOWN_MAX);
}
function rememberAuthor(did) {
  if (!did || HOUSE.includes(did)) return;
  try {
    const mine = JSON.parse(localStorage.getItem(KNOWN_KEY) || '[]').filter((d) => d !== did);
    localStorage.setItem(KNOWN_KEY, JSON.stringify([did, ...mine].slice(0, KNOWN_MAX)));
  } catch { /* storage unavailable: the feed simply forgets */ }
}

function startFeed() {
  const status = connectionStatus();
  let real = 0;

  /** One gate for a dweet from ANY source — repo or firehose. */
  const accept = (d, { fromWire = false } = {}) => {
    if (seen.has(d.uri)) return;                   // at-least-once, and two sources
    seen.set(d.uri, d);
    if (real === 0) { $('feed-empty').hidden = true; clearSeeds(); }
    real++;
    rememberAuthor(d.did);
    if (fromWire) status.bump();
    addCard(d, { sorted: true });
  };

  const onEvent = (payload) => {
    const d = dweetFromEvent(payload);
    if (!d) return;
    if (d.kind === 'delete') {
      // A deletion is an event like any other, and a feed that ignores one
      // leaves work on screen that its author has withdrawn.
      const card = cards.get(d.uri);
      if (card) {
        frames.get(card)?.destroy();
        card.remove();
        cards.delete(d.uri);
        seen.delete(d.uri);
      }
      return;
    }
    accept(d, { fromWire: true });
  };

  // ── 1. history, from the repos we know about ──
  // Resolved in parallel and painted as each answers. A poster whose PDS is
  // down costs that poster's cards and nothing else.
  for (const did of knownAuthors()) {
    resolveIdentity(did)
      .then(({ pds }) => listDweets(pds, did, { limit: 10 }))
      .then(({ dweets }) => dweets.forEach((d) => accept(d)))
      .catch(() => {});
  }

  // ── 2. the LIVE tail — no cursor, so it opens at the tip and is live at once ──
  // This is the socket the status line reports on. It used to ask for the
  // whole 36h replay, and for a sparse collection the server scans the entire
  // network's traffic for that window before it sends a byte: measured
  // 2026-09-25, 42 seconds of silence before the first dweet. Any idle-socket
  // reaper on the way (a carrier, a proxy, a phone's radio) kills that, and a
  // reconnect that never received an event restarts the scan from the same
  // cursor — so on such a network the page was "reconnecting" forever.
  const live = new JetstreamClient({
    collections: [NSID],
    // Lowercase. `KIND.COMMIT` is undefined, which the server rejects before
    // the upgrade with `unknown kind "undefined"` — see ../CLAUDE.md.
    kinds: [KIND.commit],
    onConnect: () => status.onConnect(),
    onDisconnect: () => status.onDisconnect(),
    onError: (err) => status.fault(String(err?.message || err || 'unknown')),
    onEvent,
  });
  live.connect();

  // ── 3. discovery — the 36h replay, quietly ──
  // Still worth having: it is the only way to find posters we have never seen.
  // But it no longer drives the status line, and once it has delivered an
  // event its cursor advances, so a reconnect resumes rather than rescans.
  const replay = new JetstreamClient({
    collections: [NSID],
    kinds: [KIND.commit],
    since: 36,
    onEvent,
  });
  replay.connect();

  // Nothing from any source after a grace period: show the house set rather
  // than a blank column. Real work arriving later replaces it.
  setTimeout(() => { if (real === 0) showSeeds(); }, 4000);
}

function clearSeeds() {
  for (const c of [...$('feed').children]) {
    if (c.dataset.seed) { frames.get(c)?.destroy(); visibility.unobserve(c); c.remove(); }
  }
}

// ── composer ──────────────────────────────────────────────────────

let composeLang = 'js';
let previewFrame = null;
let remixOf = null;

const HINTS = {
  js: 't seconds · S C T R · c canvas · x context · 1920×1080, not auto-cleared',
  glsl: 't seconds · r resolution · FC fragcoord · o out colour',
};

function setLang(lang) {
  composeLang = lang;
  $('lang-js').setAttribute('aria-pressed', String(lang === 'js'));
  $('lang-glsl').setAttribute('aria-pressed', String(lang === 'glsl'));
  $('lang-hint').textContent = `— ${HINTS[lang]}`;
  refreshCount();
}

function refreshCount() {
  const src = $('src').value;
  const n = countChars(src);
  const over = n > MAX_CHARS;
  const sz = sizeClass(src);
  const port = dwitterPortable({ src, lang: composeLang });
  $('count').innerHTML = `<b>${n}</b>/${MAX_CHARS}`
    + ` <span class="tier">${sz.label}</span>`
    + (port ? ' <span class="port">dwitter</span>' : '');
  $('count').classList.toggle('over', over);
  $('src').classList.toggle('over', over);
  const v = validate({ src, lang: composeLang });
  $('post').disabled = !v.ok || !auth.isLoggedIn();
  return v;
}

/** Each run gets a brand-new frame: a dweet never inherits another's canvas. */
function runPreview() {
  const v = refreshCount();
  const stage = $('preview-stage');
  previewFrame?.destroy();
  stage.textContent = '';
  if (!v.ok) {
    stage.append(el('div', 'fault', v.error));
    return;
  }
  previewFrame = new DweetFrame({
    src: $('src').value,
    lang: composeLang,
    onError: (e) => stage.append(el('div', 'fault', `${e.stage}: ${e.message}`)),
    onHang: () => stage.append(el('div', 'fault',
      'stopped — your dweet did not yield for 2.5s')),
  });
  previewFrame.mount(stage).start();
}

function openComposer(seed) {
  show('compose');
  if (seed) {
    $('src').value = seed.src;
    remixOf = seed.remixOf || null;
    setLang(seed.lang === 'glsl' ? 'glsl' : 'js');
    $('post-note').textContent = remixOf
      ? 'Posting writes one record, crediting the original in remixOf.'
      : `Posting writes one ${NSID} record to your repo.`;
    runPreview();
  }
}

async function post() {
  const v = refreshCount();
  const err = $('post-err');
  err.hidden = true;
  if (!v.ok) return;

  // Scope is fixed at authorization, so a session minted elsewhere on
  // *.mino.mobi may not cover this collection. Escalate from the click —
  // it is a user gesture, which is what the redirect needs.
  if (!auth.hasScope(NSID)) {
    await auth.ensureScope(SCOPE);
    return;
  }

  $('post').disabled = true;
  $('post').textContent = 'posting…';
  try {
    const record = {
      $type: NSID,
      src: $('src').value,
      lang: composeLang,
      createdAt: new Date().toISOString(),
    };
    const title = $('title').value.trim();
    if (title) record.title = title.slice(0, 64);
    if (remixOf) record.remixOf = remixOf;
    // Where the preview happens to be when you press post IS the framing you
    // chose — no separate "capture" gesture, because one more button to get a
    // good thumbnail is a button nobody presses.
    const frames = previewFrame?.lastFrame ?? 0;
    if (frames > 0) record.captureTime = Math.round((frames / 60) * 1000);

    await auth.pds.createRecord(NSID, record);
    $('post').textContent = 'posted';
    // No optimistic insert: the record comes back through the firehose like
    // anyone else's, which is also the cheapest proof that it really landed.
    setTimeout(() => { show('feed'); $('post').textContent = 'post'; }, 900);
  } catch (e) {
    err.textContent = String(e?.message || e);
    err.hidden = false;
    $('post').textContent = 'post';
  } finally {
    refreshCount();
  }
}

// ── sharing ───────────────────────────────────────────────────────

/**
 * The still is captured bigger than the GIF because it is doing a different
 * job: the CDN re-encodes it anyway (see share.js), so what matters is that it
 * arrives sharp. 1280x720 is 1920x1080 exactly two-thirds down, which the
 * worker's box filter handles cleanly.
 */
const STILL_W = 1280;
const STILL_H = 720;

/** How much of the animation a GIF captures. */
const GIF_SECONDS = 2;

/**
 * How many candidate moments the still tries, and how far apart.
 *
 * Four at three seconds covers t = 0, 3, 6, 9. That span is chosen against a
 * real sketch rather than picked round: the house heartbeat's loop is
 * `for(a=t%8;a>0;a-=.01)`, so it redraws itself over an EIGHT second cycle and
 * a window shorter than that only ever catches a partial heart. Period-8 is
 * not special, but "a few seconds" plainly was not enough.
 */
const STILL_TRIES = 4;
const STILL_FPS = 1 / 3;        // one candidate every three seconds

/**
 * The blob ceiling. The lexicon now says 2,000,000 and adds "formerly limited
 * to 1 MB" — but the enforcement is the PDS's, and a self-hosted one may still
 * be on the old limit. The cost of staying under the old number is a slightly
 * more compressed picture; the cost of guessing wrong is an upload that fails
 * at the very end, after the author has waited through a capture.
 */
const MAX_BLOB_BYTES = 950_000;

/**
 * Minting a service-auth JWT needs one more scope. It is an RPC, not a write:
 * `com.atproto.server.getServiceAuth` runs on the reader's OWN PDS and returns
 * a token narrowed to one audience and one method, valid for about a minute.
 * It is already in the auth worker's RPC_SCOPES and therefore in the live
 * ceiling, so this needs no deploy of `workers/auth` — but a scope is only
 * granted if it is ASKED for.
 */
const VIDEO_SCOPES = [...SHARE_SCOPES, 'rpc:com.atproto.server.getServiceAuth'];

/** The dweet the share sheet is currently about, and what has been captured. */
let shareOf = null;
let shareStill = null;    // { canvas, width, height }
let shareGif = null;      // { bytes, blob, url, name }

function rgbaCanvas(data, width, height) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  canvas.getContext('2d').putImageData(new ImageData(data, width, height), 0, 0);
  return canvas;
}

/**
 * Encode the still small enough to upload.
 *
 * PNG is tried first and that is not the usual advice. A dweet is generative
 * graphics — flat fields, hard edges, thin bright lines on black — which is
 * precisely what JPEG fringes, and at these sizes a PNG of a simple sketch is
 * often smaller than the JPEG anyway. A busy shader will blow the ceiling, and
 * then the quality ladder takes over.
 */
async function stillBlob(canvas) {
  const toBlob = (type, q) => new Promise((r) => canvas.toBlob(r, type, q));
  const png = await toBlob('image/png');
  if (png && png.size <= MAX_BLOB_BYTES) return { blob: png, mime: 'image/png' };
  for (const quality of [0.92, 0.85, 0.75, 0.65, 0.55, 0.45]) {
    const jpeg = await toBlob('image/jpeg', quality);
    if (jpeg && jpeg.size <= MAX_BLOB_BYTES) return { blob: jpeg, mime: 'image/jpeg' };
  }
  throw new Error('this frame will not compress under the blob limit');
}

const shareSay = (msg, isError = false) => {
  const line = $('share-status');
  line.textContent = msg;
  line.classList.toggle('err', isError);
};

function shareUrl() {
  return new URL(permalink(BASE, shareOf), location.origin).href;
}

/** Live preview of what will actually be posted, and what it costs. */
function refreshSharePost() {
  if (!shareOf) return null;
  const built = composePost({
    src: shareOf.src,
    lang: shareOf.lang,
    title: shareOf.title,
    chars: countChars(shareOf.src),
    tier: sizeClass(shareOf.src).label,
    url: shareUrl(),
    note: $('share-note').value.trim(),
  });
  $('share-preview').textContent = built.text;
  const n = graphemes(built.text);
  $('share-count').innerHTML = `<b>${n}</b>/${POST_MAX}`
    + (built.dropped.length ? ` <span class="drop">— ${built.dropped[0]} dropped to fit</span>` : '');
  $('share-count').classList.toggle('over', n > POST_MAX);
  return built;
}

async function openShare(d) {
  shareOf = { src: d.src, lang: d.lang, title: d.title || '' };
  shareStill = null;
  openSheet('share');
  $('share-note').value = '';
  $('share-shot').textContent = '';
  $('share-gifout').textContent = '';
  if (shareGif?.url) { URL.revokeObjectURL(shareGif.url); shareGif = null; }
  $('share-gif').disabled = true;
  $('share-post').disabled = true;
  $('share-gif').textContent = 'make GIF';
  paintMovingToggle();
  refreshSharePost();

  // The author's chosen moment, exactly as the card uses it.
  const at = typeof d.captureTime === 'number' && d.captureTime > 0 ? d.captureTime / 1000 : 0;
  shareOf.at = at;

  shareSay('drawing the still…');
  try {
    // Not one frame — three, two seconds apart, and take the first that has
    // anything in it.
    //
    // A dweet very often draws NOTHING at t=0: the house heartbeat's loop is
    // `for(a=t%8;a>0;a-=.01)`, which at t=0 runs zero times. Capturing the
    // first frame gave a perfectly black 1280x720 picture — measured, 0 lit
    // pixels of 921,600 — and a black still is the one outcome that makes this
    // whole feature pointless. A fixed non-zero default would be a guess;
    // three candidates and a brightness test is a measurement, and it costs
    // one compile rather than three.
    const shot = await captureFrames({
      src: shareOf.src, lang: shareOf.lang, at,
      // fps 0.5 -> one candidate every 2 seconds of the dweet's own clock;
      // count is seconds*fps, so STILL_TRIES of them needs STILL_TRIES/0.5.
      seconds: STILL_TRIES / STILL_FPS, fps: STILL_FPS, width: STILL_W, height: STILL_H,
    });
    const chosen = pickStill(shot.frames);
    shareOf.at = at + chosen.index / STILL_FPS;
    shareStill = {
      canvas: rgbaCanvas(chosen.frame, STILL_W, STILL_H),
      width: STILL_W, height: STILL_H,
      blank: chosen.blank,
    };
    shareStill.canvas.className = 'shot';
    $('share-shot').append(shareStill.canvas);
    $('share-gif').disabled = false;
    $('share-post').disabled = !auth.isLoggedIn();
    // Say so rather than letting a black rectangle look like a broken capture.
    const blankNote = shareStill.blank
      ? 'this one draws almost nothing in its first seconds — post it anyway, or remix it. '
      : '';
    shareSay(blankNote + (auth.isLoggedIn()
      ? `still taken at t=${shareOf.at.toFixed(1)}s.`
      : `still taken at t=${shareOf.at.toFixed(1)}s. Sign in to post; the GIF needs no account.`));
  } catch (err) {
    shareSay(String(err?.message || err), true);
  }
}

/**
 * Encode and download an animated GIF.
 *
 * It is a DOWNLOAD and not an attachment, and share.js explains at length why:
 * a GIF posted as a Bluesky image is a still, because the CDN transcodes every
 * blob and motion in that app is an allowlisted external player keyed on host.
 * A GIF is still the right artifact — it plays in a chat, a wiki, a README and
 * a Mastodon post, none of which need this site to be up.
 */
async function saveGif() {
  if (!shareOf) return;
  const btn = $('share-gif');
  btn.disabled = true;
  try {
    const shot = await captureFrames({
      src: shareOf.src, lang: shareOf.lang, at: shareOf.at,
      seconds: GIF_SECONDS, fps: CAPTURE_FPS, width: CAPTURE_W, height: CAPTURE_H,
      onProgress: (done, total) => {
        btn.textContent = `recording ${done}/${total}`;
        shareSay(`recording ${GIF_SECONDS}s at ${CAPTURE_FPS}fps…`);
      },
    });
    btn.textContent = 'encoding…';
    shareSay('encoding — a few hundred milliseconds.');
    // A frame yields to the browser before the encoder takes the main thread,
    // so the button's own label actually paints before it blocks.
    await new Promise((r) => requestAnimationFrame(r));
    const bytes = encodeGif({
      width: shot.width, height: shot.height, frames: shot.frames,
      delayMs: 1000 / shot.fps, colors: 128,
    });

    const name = `${(shareOf.title || 'dweet').replace(/[^\w.-]+/g, '-').slice(0, 40) || 'dweet'}.gif`;
    const blob = new Blob([bytes], { type: 'image/gif' });
    if (shareGif?.url) URL.revokeObjectURL(shareGif.url);
    shareGif = { bytes, blob, url: URL.createObjectURL(blob), name };

    // NOT a synthetic click on a hidden anchor. That pattern is the reason a
    // "save" button does nothing on a phone: by the time the encode finishes
    // the tap's transient activation is seconds gone, and iOS Safari has never
    // handled a programmatic blob: download well in the first place. So the
    // GIF is PUT ON SCREEN and the reader is given the three ways out that
    // actually work everywhere:
    //
    //   • the image itself — long-press → Save Image on iOS and Android,
    //     right-click → Save on a desktop;
    //   • the share sheet, where the platform offers Photos, Messages, and
    //     any app registered for image/gif — including Bluesky's;
    //   • a REAL anchor the reader clicks themselves, which carries its own
    //     activation and needs none of ours.
    const holder = $('share-gifout');
    holder.textContent = '';
    const img = el('img', 'shot');
    img.src = shareGif.url;
    img.alt = `an animated GIF of ${shareOf.title || 'this dweet'}`;
    holder.append(img);

    const row = el('div', 'row');
    const a = el('a', 'ghost', `save ${name}`);
    a.href = shareGif.url;
    a.download = name;
    row.append(a);

    // Web Share is the right affordance on a phone and simply absent on most
    // desktops, so it is offered only when the platform will take this file.
    const file = typeof File !== 'undefined'
      ? new File([blob], name, { type: 'image/gif' }) : null;
    if (file && navigator.canShare?.({ files: [file] })) {
      const sh = el('button', 'ghost', 'share…');
      sh.onclick = () => navigator.share({ files: [file], title: shareOf.title || 'a dweet' })
        .catch(() => { /* dismissing the sheet is not an error */ });
      row.append(sh);
    }
    holder.append(row);

    shareSay(`${name} — ${(bytes.length / 1024).toFixed(0)} KB, ${shot.frames.length} frames at `
      + `${shot.width}\u00d7${shot.height}. Long-press or right-click the image to save it.`);
  } catch (err) {
    shareSay(String(err?.message || err), true);
  } finally {
    btn.textContent = 'make GIF';
    btn.disabled = false;
  }
}

/**
 * Mint a service-auth JWT for the video service.
 *
 * The credential is the READER's, not ours: their own PDS issues it, bound to
 * one audience (`did:web:video.bsky.app`) and one method
 * (`com.atproto.repo.uploadBlob`), and it lives about a minute. This page
 * never holds a PDS token and the video bytes never touch our worker.
 */
/**
 * The toggle explains itself rather than sitting greyed out.
 *
 * A disabled control with no reason is the same bug as a control that does
 * nothing: from the outside they are indistinguishable. Safari and Chrome can
 * record H.264; a browser built without it cannot, and should be told so along
 * with what it CAN have.
 */
function paintMovingToggle() {
  const support = mp4Support();
  const box = $('share-moving');
  box.disabled = !support;
  box.checked = !!support;
  $('share-moving-note').textContent = !support
    ? 'this browser cannot record MP4 at all, so a moving post is not available here — the still and the GIF both are'
    : `records ${GIF_SECONDS}s and posts it looping — costs one of your daily video uploads, and takes about half a minute`
      + (support.certain ? ''
        // Honest about what is not yet known. The recorder checks the file it
        // actually produced and will say so if it is not H.264.
        : '. Your browser did not say which codec it will use; if it is not H.264 this will stop and tell you');
}

async function videoToken() {
  const params = new URLSearchParams({ aud: VIDEO_SERVICE_DID, lxm: UPLOAD_LXM });
  const res = await auth.request(`/pds/server/getServiceAuth?${params}`);
  if (!res.ok) {
    throw new Error(`your PDS would not mint an upload token (${res.status})`);
  }
  const token = (await res.json())?.token;
  if (!token) throw new Error('your PDS returned no token');
  return token;
}

/**
 * Record the dweet and hand Bluesky a looping video.
 *
 * Returns the embed, or throws. Everything it spends is checked first:
 * `getUploadLimits` before the recording, because finding out the daily quota
 * is gone AFTER two seconds of recording and thirty of transcoding is the
 * worst possible moment.
 */
async function makeVideoEmbed(support) {
  shareSay('checking your video quota…');
  const token = await videoToken();
  const limits = await uploadLimits({ token });
  if (limits?.canUpload === false) {
    throw new Error(limits.message || limits.error || 'your account cannot upload video right now');
  }
  const left = limits?.remainingDailyVideos;

  const shot = await captureFrames({
    src: shareOf.src, lang: shareOf.lang, at: shareOf.at,
    seconds: GIF_SECONDS, fps: CAPTURE_FPS, width: CAPTURE_W, height: CAPTURE_H,
    onProgress: (d, n) => shareSay(`capturing ${d}/${n}…`),
  });

  const { blob } = await recordMp4({
    frames: shot.frames, width: shot.width, height: shot.height, fps: shot.fps, mimeType: support,
    // Real-time paced, by MediaRecorder's nature — say so rather than looking stuck.
    onProgress: (d, n) => shareSay(`recording ${(d / shot.fps).toFixed(1)}s of ${(n / shot.fps).toFixed(1)}s…`),
  });

  shareSay(`uploading ${(blob.size / 1024).toFixed(0)} KB…`);
  const me = auth.getUser();
  const job = await uploadVideo({
    data: await blob.arrayBuffer(), did: me.did, token,
    name: `${(shareOf.title || 'dweet').replace(/[^\w.-]+/g, '-').slice(0, 40) || 'dweet'}.mp4`,
  });

  const ref = await awaitJob({
    jobId: job.jobId, token,
    onState: (st) => shareSay(`Bluesky is ${jobLabel(st.state)}${st.progress ? ` (${st.progress}%)` : ''}…`
      + (left != null ? `  ·  ${left - 1} video uploads left today` : '')),
  });

  return videoEmbed({
    blob: ref, width: shot.width, height: shot.height,
    alt: altText({
      title: shareOf.title, lang: shareOf.lang,
      chars: countChars(shareOf.src), src: shareOf.src, atSeconds: shareOf.at,
    }),
  });
}

async function postToBsky() {
  if (!shareOf || !shareStill) return;
  const built = refreshSharePost();
  if (!built) return;

  // Moving or still? The toggle only offers moving where the browser can
  // actually encode H.264 — see video.js on why a bare `video/mp4` probe is
  // not that question.
  const support = mp4Support();
  const moving = support && $('share-moving').checked;

  // Scope is fixed at authorization, so a session minted for the dweet
  // collection alone does not cover a feed post, a blob, or minting a service
  // token. Escalate from the CLICK, which is the gesture the redirect needs —
  // and escalate BEFORE anything is spent, not between an upload and the
  // record, because a redirect there would leave an orphan blob, burn a video
  // quota slot and lose the author's note.
  const need = moving ? VIDEO_SCOPES : SHARE_SCOPES;
  if (!auth.hasScope(need)) {
    shareSay('this session needs one more consent — redirecting…');
    await auth.ensureScope(need);
    return;
  }

  const btn = $('share-post');
  btn.disabled = true;
  btn.textContent = 'posting…';
  try {
    let embed;
    if (moving) {
      embed = { video: await makeVideoEmbed(support) };
    } else {
      shareSay('preparing the picture…');
      const { blob, mime: imgMime } = await stillBlob(shareStill.canvas);
      shareSay(`uploading ${(blob.size / 1024).toFixed(0)} KB…`);
      // Blobs go up FIRST. A createRecord naming a blob that does not exist is
      // rejected, and the author would lose the post to an error mentioning
      // neither the picture nor the text.
      const uploaded = await auth.pds.uploadBlob(new Uint8Array(await blob.arrayBuffer()), imgMime);
      embed = {
        image: {
          blob: uploaded?.blob ?? uploaded,
          width: shareStill.width,
          height: shareStill.height,
          alt: altText({
            title: shareOf.title, lang: shareOf.lang,
            chars: countChars(shareOf.src), src: shareOf.src, atSeconds: shareOf.at,
          }),
        },
      };
    }

    const record = feedPost({ text: built.text, facets: built.facets, ...embed });
    shareSay('writing the post…');
    const res = await auth.pds.createRecord('app.bsky.feed.post', record);
    const rkey = String(res?.uri || '').split('/').pop();
    const me = auth.getUser();
    const link = rkey && me?.handle ? `https://bsky.app/profile/${me.handle}/post/${rkey}` : null;
    $('share-status').innerHTML = link
      ? `posted — <a href="${link}" target="_blank" rel="noopener">see it on bsky.app</a>`
      : 'posted.';
    btn.textContent = 'posted';
  } catch (err) {
    shareSay(String(err?.message || err), true);
    btn.textContent = 'post to Bluesky';
    btn.disabled = false;
  }
}

// ── chrome ────────────────────────────────────────────────────────

function openSheet(id) {
  $(id).hidden = false;
  document.body.classList.add('sheet-open');
}

function closeSheet(id) {
  $(id).hidden = true;
  if (!document.querySelector('.sheet:not([hidden])')) {
    document.body.classList.remove('sheet-open');
  }
}

function show(view, { url = true } = {}) {
  $('view-feed').hidden = view !== 'feed';
  $('view-compose').hidden = view !== 'compose';
  $('view-profile').hidden = view !== 'profile';
  $('tab-feed').setAttribute('aria-current', view === 'feed' ? 'page' : 'false');
  $('tab-compose').setAttribute('aria-current', view === 'compose' ? 'page' : 'false');
  if (view === 'compose') previewFrame?.start();
  else previewFrame?.stop();
  // A profile's frames are torn down on the way out, not paused: they are
  // rebuilt on the way back in, and a paused worker still holds a thread.
  if (view !== 'profile') { profileSeq++; clearCards('profile-feed'); }
  // The profile writes its own URL (it pushes, so back returns to the feed).
  if (url && view !== 'profile') history.replaceState(null, '', view === 'feed' ? BASE : `${BASE}?compose`);
}

// ── profiles: one poster's dweets, read from their own repo ──────────

/** Bumped per open, so a slow page for somebody you have left cannot paint. */
let profileSeq = 0;
let profileMore = null;

/**
 * Open a poster's profile. `actor` is a handle, a DID or a bsky.app profile
 * URL. The records come from THEIR PDS, not from the firehose — so this shows
 * everything they have ever posted, not just the last 36 hours.
 */
async function openProfile(actor, { push = true } = {}) {
  const my = ++profileSeq;
  show('profile', { url: false });
  clearCards('profile-feed');
  $('profile-more').hidden = true;
  $('profile-avatar').removeAttribute('src');
  $('profile-name').textContent = String(actor).replace(/^@/, '');
  $('profile-handle').textContent = '';
  const say = (text, on) => {
    $('profile-status').textContent = text;
    $('profile-dot').className = on == null ? 'dot' : on ? 'dot on' : 'dot off';
  };
  say('finding their repo…');
  window.scrollTo(0, 0);

  let did, pds, handle;
  try {
    did = await resolveDid(actor);
    ({ pds, handle } = await resolveIdentity(did));
  } catch (err) {
    if (my === profileSeq) say(String(err?.message || err), false);
    return;
  }
  if (my !== profileSeq) return;
  const label = handle || did;
  if (push) history.pushState({ at: label }, '', `${BASE}?at=${encodeURIComponent(label)}`);
  else history.replaceState({ at: label }, '', `${BASE}?at=${encodeURIComponent(label)}`);
  $('profile-name').textContent = handle || did;
  $('profile-handle').textContent = handle ? `@${handle} · ${did}` : did;
  getProfiles([did]).then((got) => {
    const p = got.get?.(did) ?? got[did];
    if (my !== profileSeq || !p) return;
    if (p.displayName) $('profile-name').textContent = p.displayName;
    if (p.avatar) $('profile-avatar').src = p.avatar;
  }).catch(() => {});

  let shown = 0;
  let dropped = 0;
  const page = async (cursor) => {
    say(`reading ${new URL(pds).host}…`, null);
    let got;
    try { got = await listDweets(pds, did, { limit: 25, cursor }); }
    catch (err) { if (my === profileSeq) say(`their PDS did not answer — ${err.message}`, false); return; }
    if (my !== profileSeq) return;
    for (const d of got.dweets) addCard(d, { into: 'profile-feed' });
    shown += got.dweets.length;
    dropped += got.dropped;
    say(shown
      ? `${shown} dweet${shown === 1 ? '' : 's'}${got.cursor ? ' so far' : ''}, from their repo`
        + (dropped ? ` · ${dropped} record${dropped === 1 ? '' : 's'} skipped as invalid` : '')
      : `@${label} has not posted a dweet`, true);
    profileMore = got.cursor ? () => page(got.cursor) : null;
    $('profile-more').hidden = !got.cursor;
  };
  await page();
}

/** Where the URL says we are. Runs at boot and on back/forward. */
function route() {
  const q = new URLSearchParams(location.search);
  const at = q.get('at');
  if (at) return openProfile(at, { push: false });
  show(q.has('compose') ? 'compose' : 'feed', { url: false });
}

function paintAuth() {
  const u = auth.getUser();
  $('who').textContent = u ? `@${u.handle || (u.did || '').slice(0, 18)}` : 'sign in';
  refreshCount();
}

let signinTypeahead = null;

/**
 * Was a `prompt()`. A prompt has no completion, no validation and nowhere to
 * say what is being asked for — which matters more here than on most sites,
 * because the thing being consented to is a write scope on the reader's own
 * repo and they have arrived at a page whose pitch is "we run strangers' code".
 */
async function signIn() {
  if (auth.isLoggedIn()) {
    closeSheet('signin');
    if (confirm('Sign out?')) { await auth.logout(); paintAuth(); }
    return;
  }
  openSheet('signin');
  const input = $('signin-handle');
  input.value = '';
  $('signin-status').textContent = '';
  $('signin-go').disabled = true;
  // Attached once. The menu lives inside a wrapper the helper inserts around
  // the input, so attaching twice would nest wrappers and orphan the first.
  if (!signinTypeahead) {
    signinTypeahead = attachTypeahead(input, {
      onPick: () => { $('signin-go').disabled = false; },
    });
  }
  setTimeout(() => input.focus(), 60);
}

async function doSignIn() {
  const handle = $('signin-handle').value.trim().replace(/^@/, '');
  if (!handle) return;
  // Close the menu FIRST. A debounced suggestion request fired just before
  // Enter otherwise lands afterwards and drops its menu over the sheet, where
  // it silently intercepts the taps meant for the button underneath. The
  // AppView shipped that bug and a click test caught it; same helper, same
  // trap, so the same call.
  signinTypeahead?.close();
  $('signin-go').disabled = true;
  $('signin-status').textContent = 'redirecting to Bluesky…';
  try {
    await auth.login(handle, { scope: SCOPE });
  } catch (err) {
    $('signin-status').textContent = String(err?.message || err);
    $('signin-go').disabled = false;
  }
}

function wire() {
  $('tab-feed').onclick = () => show('feed');
  $('tab-compose').onclick = () => show('compose');
  $('profile-back').onclick = () => show('feed');
  $('profile-more').onclick = () => { $('profile-more').hidden = true; profileMore?.(); };
  window.addEventListener('popstate', route);

  // Find a poster. Enter opens what was typed, unless the typeahead has a row
  // highlighted — then Enter is the typeahead's.
  const find = $('find-handle');
  const findTa = attachTypeahead(find, { onPick: (a) => { find.value = a.handle; go(); } });
  const go = () => {
    const v = find.value.trim();
    if (!v) return;
    findTa.close();   // before navigating: a late suggestion would land on the profile
    openProfile(v);
  };
  $('find-go').onclick = go;
  find.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !document.querySelector('.ta-menu:not([hidden]) li.on')) go();
  });
  $('who').onclick = signIn;
  $('lang-js').onclick = () => setLang('js');
  $('lang-glsl').onclick = () => setLang('glsl');
  $('run').onclick = runPreview;
  $('post').onclick = post;
  $('share-draft').onclick = () => {
    const v = refreshCount();
    if (!v.ok) return;
    openShare({ src: $('src').value, lang: composeLang, title: $('title').value.trim() });
  };

  $('signin-go').onclick = doSignIn;
  $('signin-cancel').onclick = () => closeSheet('signin');
  $('signin-handle').addEventListener('input', () => {
    $('signin-go').disabled = $('signin-handle').value.trim().length < 3;
  });
  $('signin-handle').addEventListener('keydown', (e) => {
    // Enter belongs to the typeahead while one of its rows is highlighted;
    // otherwise it submits what was typed.
    if (e.key === 'Enter' && !document.querySelector('.ta-menu:not([hidden]) li.on')) doSignIn();
  });

  $('share-close').onclick = () => closeSheet('share');
  $('share-gif').onclick = saveGif;
  $('share-post').onclick = postToBsky;
  $('share-note').addEventListener('input', refreshSharePost);

  // Escape closes whichever sheet is open. Not a listener per sheet: two
  // listeners would both fire and close both.
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    for (const s of document.querySelectorAll('.sheet:not([hidden])')) closeSheet(s.id);
  });

  $('src').addEventListener('input', refreshCount);
  $('src').addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); runPreview(); }
  });

  const ex = $('examples');
  for (const s of SEEDS) {
    const b = el('button', null, s.title);
    b.onclick = () => {
      $('src').value = s.src;
      setLang(s.lang);
      remixOf = null;
      runPreview();
    };
    ex.append(b);
  }

  setLang('js');
  auth.onAuthChange(paintAuth);
}

/**
 * A dweet arriving by link.
 *
 * The whole source travels in the URL, so this needs no network and no record:
 * a link shared from the composer works before anything is posted, a link to a
 * house seed works though a seed is not a record, and a link posted to Bluesky
 * works in the minute after posting when the firehose has not caught up. It is
 * pinned above the feed and plays immediately — arriving at a still of the
 * thing you clicked to see move would be the wrong first second.
 */
function openShared() {
  const shared = fromPermalink(location.search);
  if (!shared) return false;
  const v = validate({ src: shared.src, lang: shared.lang });
  if (!v.ok) return false;
  $('shared-note').hidden = false;
  // Its own container above the feed, so a live dweet arriving a second later
  // cannot push the thing somebody actually clicked on off the top.
  addCard({ ...shared, local: true, author: 'shared with you', when: 'linked' },
    { into: 'pinned' });
  return true;
}

wire();
openShared();
startFeed();
auth.init().then(paintAuth).catch(paintAuth);
route();

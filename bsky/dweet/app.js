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
import { encodeGif } from '/dweet/gif.js';
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
  meta.append(name, handle);
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

function addCard(d, { prepend = false, into = 'feed' } = {}) {
  const feed = $(into);
  const node = card(d);
  if (d.uri) cards.set(d.uri, node);
  if (prepend && feed.firstChild) feed.insertBefore(node, feed.firstChild);
  else feed.append(node);
}

function showSeeds() {
  $('feed-empty').hidden = false;
  for (const s of SEEDS) addCard(s);
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
 * failure. So it says it: `live · nothing posted yet`.
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
      : `live · tailing ${NSID} — nothing posted yet`;
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

function startFeed() {
  const status = connectionStatus();
  let live = 0;

  const client = new JetstreamClient({
    collections: [NSID],
    // Lowercase. `KIND.COMMIT` is undefined, which the server rejects before
    // the upgrade with `unknown kind "undefined"` — so this socket NEVER
    // opened, from the day the surface shipped, and the page said
    // "disconnected — retrying" forever. Measured against the live host
    // 2026-09-22; `jetstream.js` now throws on an unknown kind rather than
    // letting it become a permanently dead connection.
    kinds: [KIND.commit],
    // The whole replay window. A brand-new lexicon has no volume, so asking
    // for the full 36h costs nothing and is the difference between a feed and
    // an empty page for anyone who arrives between posts.
    since: 36,
    onConnect: () => status.onConnect(),
    onDisconnect: () => status.onDisconnect(),
    onError: (err) => status.fault(String(err?.message || err || 'unknown')),
    // The wire shape lives in event.js, with its own selftest pinned to a
    // payload captured off the live firehose. This handler used to read
    // `payload.commit.operation` — the ARCHIVE's shape — so every event was
    // dropped on the first line. Two bugs, one symptom: fixing the socket
    // alone would have left the feed just as empty.
    onEvent: (payload) => {
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

      if (seen.has(d.uri)) return;                 // delivery is at-least-once
      seen.set(d.uri, d);
      if (live === 0) $('feed-empty').hidden = true;
      live++;
      status.bump();
      addCard(d, { prepend: true });
    },
  });
  client.connect();

  // Nothing after a grace period means nothing has ever been posted. Say so
  // plainly and show the house set rather than leaving a blank column.
  setTimeout(() => { if (live === 0) showSeeds(); }, 4000);
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

/** The dweet the share sheet is currently about, and what has been captured. */
let shareOf = null;
let shareStill = null;    // { canvas, width, height }
let shareGifBytes = null;

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
  shareGifBytes = null;
  openSheet('share');
  $('share-note').value = '';
  $('share-shot').textContent = '';
  $('share-gif').disabled = true;
  $('share-post').disabled = true;
  $('share-gif').textContent = 'save GIF';
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
    shareGifBytes = encodeGif({
      width: shot.width, height: shot.height, frames: shot.frames,
      delayMs: 1000 / shot.fps, colors: 128,
    });

    const name = (shareOf.title || 'dweet').replace(/[^\w.-]+/g, '-').slice(0, 40) || 'dweet';
    const url = URL.createObjectURL(new Blob([shareGifBytes], { type: 'image/gif' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `${name}.gif`;
    a.click();
    // Revoked late: Safari has been known to abandon the download if the URL
    // dies in the same turn as the click.
    setTimeout(() => URL.revokeObjectURL(url), 30_000);
    shareSay(`saved ${name}.gif — ${(shareGifBytes.length / 1024).toFixed(0)} KB, `
      + `${shot.frames.length} frames at ${shot.width}x${shot.height}.`);
  } catch (err) {
    shareSay(String(err?.message || err), true);
  } finally {
    btn.textContent = 'save GIF';
    btn.disabled = false;
  }
}

async function postToBsky() {
  if (!shareOf || !shareStill) return;
  const built = refreshSharePost();
  if (!built) return;

  // Scope is fixed at authorization, so a session minted for the dweet
  // collection alone does not cover a feed post or a blob. Escalate from the
  // CLICK, which is the gesture the redirect needs — and escalate BEFORE the
  // upload, not between the upload and the record, because a redirect there
  // would leave an orphan blob and lose the author's note.
  if (!auth.hasScope(SHARE_SCOPES)) {
    shareSay('this session needs one more consent — redirecting…');
    await auth.ensureScope(SHARE_SCOPES);
    return;
  }

  const btn = $('share-post');
  btn.disabled = true;
  btn.textContent = 'posting…';
  try {
    shareSay('preparing the picture…');
    const { blob, mime } = await stillBlob(shareStill.canvas);
    shareSay(`uploading ${(blob.size / 1024).toFixed(0)} KB…`);
    // Blobs go up FIRST. A createRecord naming a blob that does not exist is
    // rejected, and the author would lose the post to an error mentioning
    // neither the picture nor the text.
    const uploaded = await auth.pds.uploadBlob(new Uint8Array(await blob.arrayBuffer()), mime);
    const ref = uploaded?.blob ?? uploaded;

    const record = feedPost({
      text: built.text,
      facets: built.facets,
      image: {
        blob: ref,
        width: shareStill.width,
        height: shareStill.height,
        alt: altText({
          title: shareOf.title, lang: shareOf.lang,
          chars: countChars(shareOf.src), src: shareOf.src, atSeconds: shareOf.at,
        }),
      },
    });
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

function show(view) {
  const feed = view === 'feed';
  $('view-feed').hidden = !feed;
  $('view-compose').hidden = feed;
  $('tab-feed').setAttribute('aria-current', feed ? 'page' : 'false');
  $('tab-compose').setAttribute('aria-current', feed ? 'false' : 'page');
  if (feed) previewFrame?.stop();
  else previewFrame?.start();
  history.replaceState(null, '', feed ? BASE : `${BASE}?compose`);
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
if (location.search.includes('compose')) show('compose');

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
import { JetstreamClient, KIND, eventUri } from '/packages/atproto/jetstream.js';
import { countDistinct } from '/packages/atproto/constellation.js';
import { getProfiles } from '/packages/atproto/bsky.js';
import { AuthClient } from '/packages/oauth-client/auth.js';
import { DweetFrame, validate, countChars, MAX_CHARS, LANGS } from '/dweet/sandbox.js';
import { SEEDS } from '/dweet/seeds.js';

const NSID = 'com.minomobi.dweet.dweet';

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
}, { rootMargin: '200px' });

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
  meta.append(el('span', 'when', d.local ? 'house' : timeAgo(d.createdAt)));
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
  foot.append(el('span', 'tag', `${countChars(d.src)}/${MAX_CHARS}`));
  const remixTag = el('span', 'tag');
  remixTag.hidden = true;
  foot.append(remixTag);

  const act = el('div', 'act');
  const remix = el('button', null, 'remix');
  remix.onclick = () => openComposer({ src: d.src, lang: d.lang, remixOf: d.uri || null });
  act.append(remix);
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

function addCard(d, { prepend = false } = {}) {
  const feed = $('feed');
  const node = card(d);
  if (prepend && feed.firstChild) feed.insertBefore(node, feed.firstChild);
  else feed.append(node);
}

function showSeeds() {
  $('feed-empty').hidden = false;
  for (const s of SEEDS) addCard(s);
}

// ── the firehose ──────────────────────────────────────────────────

function startFeed() {
  const dot = $('live-dot');
  const text = $('live-text');
  let live = 0;

  const client = new JetstreamClient({
    collections: [NSID],
    kinds: [KIND.COMMIT],
    // The whole replay window. A brand-new lexicon has no volume, so asking
    // for the full 36h costs nothing and is the difference between a feed and
    // an empty page for anyone who arrives between posts.
    since: 36,
    onConnect: () => {
      dot.className = 'dot on';
      text.textContent = 'live — tailing the firehose for com.minomobi.dweet.dweet';
    },
    onDisconnect: () => {
      dot.className = 'dot off';
      text.textContent = 'disconnected — retrying';
    },
    onError: () => {
      dot.className = 'dot off';
      text.textContent = 'firehose unreachable';
    },
    onEvent: (payload) => {
      const commit = payload?.commit;
      if (!commit || commit.operation !== 'create') return;
      const rec = commit.record;
      if (!rec || typeof rec.src !== 'string') return;
      const uri = eventUri(payload);
      if (!uri || seen.has(uri)) return;           // delivery is at-least-once

      // The record is a stranger's JSON. Everything below treats it as data:
      // `src` is never interpolated into markup (it goes to a <pre> as
      // textContent and to the frame by postMessage), and a record that fails
      // validation is dropped rather than repaired.
      const v = validate({ src: rec.src, lang: rec.lang });
      if (!v.ok) return;

      const d = {
        uri,
        did: payload.did,
        src: rec.src,
        lang: LANGS.includes(rec.lang) ? rec.lang : 'js',
        title: typeof rec.title === 'string' ? rec.title.slice(0, 64) : '',
        createdAt: rec.createdAt || new Date().toISOString(),
      };
      seen.set(uri, d);
      if (live === 0) $('feed-empty').hidden = true;
      live++;
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
  $('count').innerHTML = `<b>${n}</b>/${MAX_CHARS}`;
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

// ── chrome ────────────────────────────────────────────────────────

function show(view) {
  const feed = view === 'feed';
  $('view-feed').hidden = !feed;
  $('view-compose').hidden = feed;
  $('tab-feed').setAttribute('aria-current', feed ? 'page' : 'false');
  $('tab-compose').setAttribute('aria-current', feed ? 'false' : 'page');
  if (feed) previewFrame?.stop();
  else previewFrame?.start();
  history.replaceState(null, '', feed ? '/' : '/?compose');
}

function paintAuth() {
  const u = auth.getUser();
  $('who').textContent = u ? `@${u.handle || (u.did || '').slice(0, 18)}` : 'sign in';
  refreshCount();
}

async function signIn() {
  if (auth.isLoggedIn()) {
    if (confirm('Sign out?')) { await auth.logout(); paintAuth(); }
    return;
  }
  const handle = prompt('Your Bluesky handle');
  if (!handle) return;
  await auth.login(handle, { scope: SCOPE });
}

function wire() {
  $('tab-feed').onclick = () => show('feed');
  $('tab-compose').onclick = () => show('compose');
  $('who').onclick = signIn;
  $('lang-js').onclick = () => setLang('js');
  $('lang-glsl').onclick = () => setLang('glsl');
  $('run').onclick = runPreview;
  $('post').onclick = post;
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

wire();
startFeed();
auth.init().then(paintAuth).catch(paintAuth);
if (location.search.includes('compose')) show('compose');

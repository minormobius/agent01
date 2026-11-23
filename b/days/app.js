// days/app.js — handle in, every day out. The work is in repoindex.js (the
// download) and calendar.js (the maths); this file fetches identity, draws, and
// opens a day.
import { indexRepo, dayRecords, localDay } from './repoindex.js';
import { extractMedia } from '../thread/thread.js';
import { METRICS, countFor, yearGrids, levels, summary, cumulative, handleHistory, neighbours, daysBetween, addDays } from './calendar.js';

const $ = (id) => document.getElementById(id);
const API = 'https://public.api.bsky.app/xrpc';
const num = (n) => Number(n || 0).toLocaleString('en-US');
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const P = 'app.bsky.feed.post', L = 'app.bsky.feed.like', R = 'app.bsky.feed.repost', F = 'app.bsky.graph.follow';

let S = null;            // { profile, did, pds, ix, hist, cum, from, to }
let metric = 'all', selected = null, abort = null, dayAbort = null;

const say = (m, err = false) => { $('status').textContent = m; $('status').className = err ? 'status err' : 'status'; };
const progress = (f) => { $('prog').style.width = Math.max(0, Math.min(1, f)) * 100 + '%'; };
async function j(url, signal) { const r = await fetch(url, { signal }); if (!r.ok) throw new Error(String(r.status)); return r.json(); }

// ── a tiny cache: one repo download is expensive enough to keep for 6 hours ──
const DB = 'b-days', STORE = 'index', TTL = 6 * 3600 * 1000;
function idb() {
  return new Promise((res, rej) => {
    if (typeof indexedDB === 'undefined') return rej(new Error('no idb'));
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE);
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  });
}
async function cacheGet(key) {
  try {
    const db = await idb();
    const hit = await new Promise((res) => { const t = db.transaction(STORE).objectStore(STORE).get(key); t.onsuccess = () => res(t.result); t.onerror = () => res(null); });
    return hit && Date.now() - hit.at < TTL ? hit.v : null;
  } catch { return null; }
}
async function cachePut(key, v) {
  try { const db = await idb(); db.transaction(STORE, 'readwrite').objectStore(STORE).put({ at: Date.now(), v }, key); } catch { /* a nicety */ }
}
const tz = () => Intl.DateTimeFormat().resolvedOptions().timeZone || 'local';

// ── run ──────────────────────────────────────────────────────────────────────
async function run(raw, wantDay = null) {
  const actor = String(raw || '').trim().replace(/^@/, '').replace(/^https?:\/\/bsky\.app\/profile\//, '').split(/[/?#\s]/)[0];
  if (!actor) return;
  if (abort) abort.abort();
  abort = new AbortController();
  const signal = abort.signal;
  $('go').disabled = true; $('stop').classList.remove('hidden'); progress(0);
  try {
    say('finding ' + actor + '…');
    const profile = await j(`${API}/app.bsky.actor.getProfile?actor=${encodeURIComponent(actor)}`, signal);
    const did = profile.did;
    $('h').value = profile.handle;
    const doc = did.startsWith('did:web:') ? await j(`https://${did.slice(8)}/.well-known/did.json`, signal) : await j(`https://plc.directory/${did}`, signal);
    const pds = (doc.service || []).find((s) => s.id === '#atproto_pds' || s.type === 'AtprotoPersonalDataServer')?.serviceEndpoint;
    if (!pds) throw new Error('no PDS listed for this account');
    const auditP = did.startsWith('did:plc:') ? j(`https://plc.directory/${did}/log/audit`, signal).catch(() => []) : Promise.resolve([]);

    const key = `${did}|${tz()}`;
    let ix = await cacheGet(key), cached = !!ix;
    const t0 = performance.now();
    if (ix) ix.days = new Map(ix.days);
    else {
      say('downloading the whole repo…');
      ix = await indexRepo(pds, did, {
        signal, dayOf: localDay,
        onProgress: ({ bytes, total }) => {
          progress(total ? bytes / total : 0);
          say(`downloading the whole repo · ${(bytes / 1048576).toFixed(1)}${total ? ' of ' + (total / 1048576).toFixed(1) : ''} MB`);
        },
      });
      cachePut(key, { ...ix, days: [...ix.days] });
    }
    progress(1);
    const hist = handleHistory(await auditP);
    if (!ix.days.size) throw new Error('this repo has no dated records');
    const from = localDay(ix.first), to = localDay(Date.now());
    S = { profile, did, pds, ix, hist, cum: cumulative(ix.days), from, to };
    const secs = ((performance.now() - t0) / 1000).toFixed(1);
    const dated = [...ix.days.values()].reduce((s, r) => s + countFor(r), 0);
    say(cached ? `${num(dated)} records · from this browser's cache` : `${num(dated)} records from a ${(ix.bytes / 1048576).toFixed(1)} MB repo in ${secs}s`);
    history.replaceState(null, '', `?u=${encodeURIComponent(profile.handle)}${metric !== 'all' ? '&m=' + metric : ''}`);
    $('out').classList.remove('hidden');
    renderAll();
    if (wantDay && wantDay >= from && wantDay <= to) openDay(wantDay);
  } catch (e) {
    if (e?.name === 'AbortError') { say('stopped'); return; }
    say(/^4\d\d$/.test(e.message) ? `couldn't find ${actor}` : String(e.message || e), true);
  } finally {
    $('go').disabled = false; $('stop').classList.add('hidden'); abort = null;
  }
}

// ── render ───────────────────────────────────────────────────────────────────
function renderAll() {
  const { profile, ix, from, to } = S;
  $('who').innerHTML = `${profile.avatar ? `<img src="${esc(profile.avatar)}" alt="">` : '<img alt="">'}
    <div><div class="n">${esc(profile.displayName || profile.handle)}</div>
    <div class="h">@${esc(profile.handle)} · first record ${esc(from)} · ${num(daysBetween(from, to))} days ago</div></div>`;
  $('chips').innerHTML = Object.entries(METRICS).map(([k, m]) => `<button class="chip" data-m="${k}" aria-pressed="${k === metric}">${m.label}</button>`).join('');
  renderTiles();
  renderYears();
}

function renderTiles() {
  const { ix, from, to } = S;
  const s = summary(ix.days, from, to, metric, to);
  const t = (v, l, sub = '') => `<div class="tile"><div class="v">${v}</div><div class="l">${l}</div>${sub ? `<div class="s">${sub}</div>` : ''}</div>`;
  $('tiles').innerHTML = [
    t(num(s.total), METRICS[metric].label),
    t(num(s.active), 'active days', `of ${num(daysBetween(from, to) + 1)}`),
    t(s.busiest ? num(s.busiest.n) : '—', 'busiest day', s.busiest ? `<a href="#" data-go="${s.busiest.day}">${s.busiest.day}</a>` : ''),
    t(num(s.longest), 'longest streak', s.longestFrom ? `from ${s.longestFrom}` : ''),
  ].join('');
}

function renderYears() {
  const { ix, from, to } = S;
  const lv = levels(ix.days, metric);
  const CELL = 11, STEP = 14, LEFT = 26, TOP = 14;
  $('years').innerHTML = yearGrids(ix.days, from, to, metric).map((g) => {
    const total = g.cells.reduce((s, c) => s + c.n, 0);
    const w = LEFT + g.weeks * STEP, h = TOP + 7 * STEP;
    const rects = g.cells.map((c) => `<rect class="c${c.day === selected ? ' sel' : ''}" data-d="${c.day}" x="${LEFT + c.col * STEP}" y="${TOP + c.row * STEP}" width="${CELL}" height="${CELL}" rx="2" fill="var(--l${lv.level(c.n)})"><title>${c.day} · ${num(c.n)} ${METRICS[metric].label}</title></rect>`).join('');
    const months = g.months.map((m) => `<text x="${LEFT + m.col * STEP}" y="9">${m.label}</text>`).join('');
    const wd = [[1, 'Mon'], [3, 'Wed'], [5, 'Fri']].map(([r, l]) => `<text x="0" y="${TOP + r * STEP + 9}">${l}</text>`).join('');
    return `<div class="year"><h3>${g.year} <span>· ${num(total)} ${METRICS[metric].label}</span></h3>
      <div class="scroll"><svg class="cal" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img" aria-label="${g.year}: ${num(total)} ${METRICS[metric].label}">${months}${wd}${rects}</svg></div></div>`;
  }).join('');
  // the newest year opens scrolled to today, like GitHub's
  const first = $('years').querySelector('.scroll');
  if (first) first.scrollLeft = first.scrollWidth;
  $('legend').innerHTML = `less ${[0, 1, 2, 3, 4].map((i) => `<i style="background:var(--l${i})"></i>`).join('')} more · busiest days darkest · click a day`;
}

// ── a day ────────────────────────────────────────────────────────────────────
const dayStart = (d) => { const [y, m, dd] = d.split('-').map(Number); return new Date(y, m - 1, dd).getTime(); };
const timeOf = (t) => new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

async function openDay(d) {
  if (!S) return;
  selected = d;
  for (const r of document.querySelectorAll('rect.sel')) r.classList.remove('sel');
  const cell = document.querySelector(`rect[data-d="${d}"]`);
  if (cell) cell.classList.add('sel');
  const u = new URL(location.href); u.searchParams.set('d', d); history.replaceState(null, '', u);

  const { ix, hist, cum, profile, did, from } = S;
  const row = ix.days.get(d) || {};
  const start = dayStart(d), end = dayStart(addDays(d, 1));
  const then = hist.at(end - 1) || profile.handle;
  const asOf = cum.asOf(d);
  const posts = ix.posts.filter((p) => p.t >= start && p.t < end);
  const repliesSoFar = countRepliesUpTo(end);
  const nb = neighbours(ix.days, d, metric);
  const dateLong = new Date(start).toLocaleDateString([], { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  const others = Object.entries(row).filter(([c]) => ![P, L, R, F].includes(c));
  // the day's own posts are drawn first from the repo (instant), then upgraded
  // in place with what the AppView adds: media, quotes, link cards, counts
  const me = { did, handle: then, displayName: profile.displayName || then, avatar: profile.avatar };
  const repoCard = (p) => cardHtml({ uri: `at://${did}/${P}/${p.rkey}`, author: me, t: p.t, text: p.text, reply: p.reply, pending: true });

  $('day').classList.remove('hidden');
  $('day').innerHTML = `
    <div class="top"><h2>${esc(dateLong)}</h2>
      <div class="nav"><button class="ghost small" data-step="${nb.prev || ''}" ${nb.prev ? '' : 'disabled'} aria-label="previous active day">← ${nb.prev || ''}</button>
      <button class="ghost small" data-step="${nb.next || ''}" ${nb.next ? '' : 'disabled'} aria-label="next active day">${nb.next || ''} →</button></div></div>
    <div class="then">${profile.avatar ? `<img src="${esc(profile.avatar)}" alt="">` : '<img alt="">'}
      <div><div class="h">@${esc(then)}</div>
      <div class="m">day ${num(daysBetween(from, d) + 1)} on Bluesky${then !== profile.handle ? ` · today @${esc(profile.handle)}` : ''}</div></div></div>
    <div class="tiles">
      ${tile(asOf[P], 'posts so far', `${num(repliesSoFar)} of them replies`)}
      ${tile(asOf[L], 'likes given so far')}
      ${tile(asOf[R], 'reposts so far')}
      ${tile(asOf[F], 'following', 'follows made by then')}
    </div>
    <p class="note">On this day: ${num(row[P])} posts, ${num(row[L])} likes, ${num(row[R])} reposts, ${num(row[F])} follows${others.length ? `, and ${others.map(([c, n]) => `${num(n)} ${esc(NAMES[c] || c)}`).join(', ')}` : ''}.
      Totals count what the repo still holds today. The avatar is today's; a repo keeps no history of it.</p>
    <h4>posts and replies${posts.length ? ' · ' + num(posts.length) : ''}</h4>
    <div id="dposts" class="feed">${posts.length ? posts.slice(0, SHOW).map(repoCard).join('') : '<p class="note">none this day</p>'}</div>
    ${posts.length > SHOW ? `<button class="ghost small" id="allposts">show all ${num(posts.length)}</button>` : ''}
    <div id="dlikes"></div><div id="dreposts"></div><div id="dfollows"></div>`;
  for (const b of $('day').querySelectorAll('[data-step]')) b.onclick = () => b.dataset.step && openDay(b.dataset.step);
  $('day').scrollIntoView({ behavior: 'smooth', block: 'start' });

  // everything below is fetched for this day only, and abandoned if another day is opened
  if (dayAbort) dayAbort.abort();
  dayAbort = new AbortController();
  const signal = dayAbort.signal;
  const upgrade = (list) => hydrateInPlace(list.map((p) => `at://${did}/${P}/${p.rkey}`), signal, { handle: then });
  upgrade(posts.slice(0, SHOW));
  if ($('allposts')) $('allposts').onclick = () => {
    $('dposts').insertAdjacentHTML('beforeend', posts.slice(SHOW).map(repoCard).join(''));
    $('allposts').remove();
    upgrade(posts.slice(SHOW));
  };

  const load = async (col, target, title, render, body = target) => {
    if (!row[col]) return;
    body.innerHTML = `<p class="note">loading ${num(row[col])}…</p>`;
    try {
      const recs = await dayRecords(S.pds, did, col, start, end, { limit: 100, signal });
      if (signal.aborted) return;
      body.innerHTML = await render(recs, signal)
        + (row[col] > recs.length ? `<p class="more">showing the latest ${num(recs.length)} of ${num(row[col])}</p>` : '');
    } catch (e) { if (e?.name !== 'AbortError') body.innerHTML = `<p class="note">couldn't load these (${esc(e.message)})</p>`; }
  };
  // Liked and reposted are OTHER people's posts, and a busy day holds hundreds:
  // they start folded, so scrolling down the day's own posts never runs on into
  // a stranger's feed unannounced. Fetched on first open only, which also
  // spares the requests on every day nobody unfolds.
  const folded = (col, target, title, render) => {
    if (!row[col]) return;
    target.innerHTML = `<details class="fold"><summary>${title} · ${num(row[col])}</summary><div class="foldbody"></div></details>`;
    const det = target.querySelector('details');
    det.addEventListener('toggle', () => {
      if (det.open && !det.dataset.loaded) { det.dataset.loaded = '1'; load(col, target, title, render, det.querySelector('.foldbody')); }
    });
  };
  folded(L, $('dlikes'), 'liked', (recs, sig) => subjectsHtml(recs, sig));
  folded(R, $('dreposts'), 'reposted', (recs, sig) => subjectsHtml(recs, sig));
  if (row[F]) { $('dfollows').innerHTML = `<h4>followed · ${num(row[F])}</h4><div class="foldbody"></div>`; load(F, $('dfollows'), 'followed', (recs, sig) => followsHtml(recs, sig), $('dfollows').querySelector('.foldbody')); }
}
// a busy day can hold hundreds of posts: the first SHOW, then a button
const SHOW = 40;
const NAMES = {
  'app.bsky.graph.block': 'blocks', 'app.bsky.graph.listitem': 'list additions', 'app.bsky.graph.list': 'lists made',
  'app.bsky.feed.generator': 'feeds made', 'app.bsky.feed.threadgate': 'reply settings', 'app.bsky.feed.postgate': 'quote settings',
  'app.bsky.graph.starterpack': 'starter packs', 'app.bsky.actor.profile': 'profile edits',
};
const tile = (v, l, s = '') => `<div class="tile"><div class="v">${num(v)}</div><div class="l">${l}</div>${s ? `<div class="s">${s}</div>` : ''}</div>`;

let replyIndex = null;
function countRepliesUpTo(end) {
  if (!replyIndex || replyIndex.posts !== S.ix.posts) {
    const times = S.ix.posts.filter((p) => p.reply).map((p) => p.t);
    replyIndex = { posts: S.ix.posts, times };
  }
  const a = replyIndex.times; let lo = 0, hi = a.length;
  while (lo < hi) { const m = (lo + hi) >> 1; if (a[m] < end) lo = m + 1; else hi = m; }
  return lo;
}

// ── posts as a feed ──────────────────────────────────────────────────────────
const thumbOf = (url) => (url ? String(url).replace('/img/avatar/plain/', '/img/avatar_thumbnail/plain/') : '');
const webUrl = (uri) => { const [, , a, , k] = String(uri || '').split('/'); return a && k ? `https://bsky.app/profile/${a}/post/${k}` : '#'; };

/**
 * One post as a feed card. `media` is extractMedia() output (b/thread/thread.js:
 * images, galleries, video, link cards, quotes). `pending` marks a card drawn
 * from the repo that hydration will replace.
 */
function cardHtml({ uri, author, t, text, reply, media = [], counts = null, pending = false, compact = false }) {
  const a = author || {};
  return `<article class="card${compact ? ' compact' : ''}" data-uri="${esc(uri)}"${reply ? ' data-reply="1"' : ''}${pending ? ' data-pending="1"' : ''}>
    <a class="av" href="https://bsky.app/profile/${esc(a.did || '')}" target="_blank" rel="noopener">${a.avatar ? `<img src="${esc(thumbOf(a.avatar))}" alt="" loading="lazy">` : '<img alt="">'}</a>
    <div class="main">
      <div class="meta"><b>${esc(a.displayName || a.handle || '')}</b> <span>@${esc(a.handle || '')}</span> · <a href="${webUrl(uri)}" target="_blank" rel="noopener">${timeOf(t)}</a></div>
      ${reply ? `<button class="replyto" type="button" aria-expanded="false">↳ a reply · show the thread</button>` : ''}
      <div class="thread hidden"></div>
      ${text ? `<div class="txt">${esc(text)}</div>` : (text === null ? '<div class="note">(this post could not be read)</div>' : '')}
      ${mediaHtml(media, uri)}
      ${counts ? `<div class="counts"><span title="replies">💬 ${num(counts.reply)}</span><span title="reposts">↻ ${num(counts.repost)}</span><span title="likes">♡ ${num(counts.like)}</span></div>` : ''}
    </div></article>`;
}

function mediaHtml(media, uri = '') {
  const imgs = media.filter((m) => m.type === 'image');
  let out = '';
  if (imgs.length) {
    out += `<div class="imgs n${Math.min(imgs.length, 4)}">${imgs.map((m) => {
      const ar = m.aspectRatio && m.aspectRatio.width && m.aspectRatio.height ? ` style="aspect-ratio:${m.aspectRatio.width}/${m.aspectRatio.height}"` : '';
      return `<a href="${esc(m.fullsize || m.thumb)}" target="_blank" rel="noopener"${imgs.length === 1 ? ar : ''}><img src="${esc(m.thumb)}" alt="${esc(m.alt)}" loading="lazy"></a>`;
    }).join('')}</div>`;
  }
  for (const m of media) {
    // video is HLS, which only Safari plays from a plain <video>: the poster
    // opens the post on bsky.app rather than pulling a player into this page
    if (m.type === 'video' && m.thumbnail) out += `<a class="vid" href="${webUrl(uri)}" target="_blank" rel="noopener" title="play on bsky.app"><img src="${esc(m.thumbnail)}" alt="${esc(m.alt)}" loading="lazy"><span>▶</span></a>`;
    if (m.type === 'external') {
      let host = ''; try { host = new URL(m.uri).hostname; } catch { /* leave blank */ }
      out += `<a class="ext" href="${esc(m.uri)}" target="_blank" rel="noopener">${m.thumb ? `<img src="${esc(m.thumb)}" alt="" loading="lazy">` : ''}<div><b>${esc(m.title || host)}</b><div class="note">${esc((m.description || '').slice(0, 160))}</div><div class="h">${esc(host)}</div></div></a>`;
    }
    if (m.type === 'quote') {
      out += `<div class="quote"><div class="meta">${m.author?.avatar ? `<img src="${esc(thumbOf(m.author.avatar))}" alt="">` : ''}<b>${esc(m.author?.displayName || '')}</b> <span>@${esc(m.author?.handle || '')}</span> · <a href="${webUrl(m.uri)}" target="_blank" rel="noopener">open</a></div>
        <div class="txt">${esc((m.text || '').slice(0, 500))}</div>${mediaHtml((m.embeds || []).filter((e) => e.type === 'image' || e.type === 'video' || e.type === 'external'), m.uri)}</div>`;
    }
  }
  return out;
}

/** A hydrated postView → card fields. */
const fromView = (v, override = {}) => ({
  uri: v.uri, t: Date.parse(v.record?.createdAt || v.indexedAt) || 0, text: v.record?.text || '',
  author: { ...v.author, ...override }, reply: !!v.record?.reply, media: extractMedia(v.embed),
  counts: { reply: v.replyCount || 0, repost: v.repostCount || 0, like: v.likeCount || 0 },
});

async function getPosts(uris, signal) {
  const out = new Map();
  const chunks = [];
  for (let i = 0; i < uris.length; i += 25) chunks.push(uris.slice(i, i + 25));
  await Promise.all(chunks.map(async (c) => {
    try {
      const d = await j(`${API}/app.bsky.feed.getPosts?${c.map((u) => 'uris=' + encodeURIComponent(u)).join('&')}`, signal);
      for (const p of d.posts || []) out.set(p.uri, p);
    } catch (e) { if (e?.name === 'AbortError') throw e; }
  }));
  return out;
}

/** Replace repo-drawn cards with full ones, keeping the handle they had that day. */
async function hydrateInPlace(uris, signal, override) {
  if (!uris.length) return;
  let views;
  try { views = await getPosts(uris, signal); } catch { return; }
  if (signal.aborted) return;
  for (const uri of uris) {
    const v = views.get(uri);
    const el = $('dposts')?.querySelector(`article[data-uri="${CSS.escape(uri)}"]`);
    if (!el) continue;
    if (!v) { el.removeAttribute('data-pending'); continue; }   // hidden or taken down: keep the repo's text
    el.outerHTML = cardHtml(fromView(v, override));
  }
}

// liked / reposted: the posts they saw, as cards
async function subjectsHtml(recs, signal) {
  const uris = recs.map((r) => r.value?.subject?.uri).filter(Boolean).slice(0, 50);
  const views = await getPosts(uris, signal);
  return `<div class="feed">${recs.slice(0, 50).map((r) => {
    const uri = r.value?.subject?.uri, v = views.get(uri);
    if (!v) return `<div class="gone"><span class="h">${timeOf(r.t)}</span> · <a href="${webUrl(uri)}" target="_blank" rel="noopener">a post that is gone or hidden</a></div>`;
    return cardHtml(fromView(v));
  }).join('')}</div>` + (recs.length > 50 ? `<p class="more">and ${num(recs.length - 50)} more that day</p>` : '');
}

async function followsHtml(recs, signal) {
  const dids = recs.map((r) => r.value?.subject).filter(Boolean);
  const prof = new Map();
  for (let i = 0; i < dids.length; i += 25) {
    try {
      const d = await j(`${API}/app.bsky.actor.getProfiles?${dids.slice(i, i + 25).map((x) => 'actors=' + encodeURIComponent(x)).join('&')}`, signal);
      for (const p of d.profiles || []) prof.set(p.did, p);
    } catch (e) { if (e?.name === 'AbortError') throw e; }
  }
  return `<div class="faces">${dids.map((x) => {
    const p = prof.get(x);
    return `<a href="https://bsky.app/profile/${esc(x)}" target="_blank" rel="noopener">${p?.avatar ? `<img src="${esc(thumbOf(p.avatar))}" alt="">` : '<img alt="">'}${p ? '@' + esc(p.handle) : '<span class="note">an account that is gone</span>'}</a>`;
  }).join('')}</div>`;
}

// ── a reply's thread, in context, on demand ──────────────────────────────────
/**
 * The posts above a reply, root first. getPostThread walks `parent` upward;
 * a parent that is deleted or blocked comes back as a different $type with no
 * `post`, so it is drawn as a gap rather than skipped (skipping would join two
 * posts that were never adjacent).
 */
async function showThread(card) {
  const box = card.querySelector('.thread'), btn = card.querySelector('.replyto');
  if (!box || !btn) return;
  if (!box.classList.contains('hidden')) { box.classList.add('hidden'); btn.setAttribute('aria-expanded', 'false'); btn.textContent = '↳ a reply · show the thread'; return; }
  box.classList.remove('hidden'); btn.setAttribute('aria-expanded', 'true');
  if (box.dataset.loaded) { btn.textContent = '↳ hide the thread'; return; }
  btn.textContent = '↳ loading the thread…';
  try {
    const d = await j(`${API}/app.bsky.feed.getPostThread?uri=${encodeURIComponent(card.dataset.uri)}&depth=0&parentHeight=30`);
    const chain = [];
    for (let n = d.thread?.parent; n; n = n.parent) chain.push(n);
    chain.reverse();
    box.innerHTML = chain.map((n) => n.post
      ? cardHtml({ ...fromView(n.post), reply: false, compact: true })
      : `<div class="gone">${n.$type?.includes('blocked') ? 'a post from an account that blocks or is blocked' : 'a post that was deleted'}</div>`).join('')
      + (chain.length ? '' : '<div class="gone">the post this replied to is gone</div>');
    box.dataset.loaded = '1';
    btn.textContent = '↳ hide the thread';
  } catch (e) {
    box.innerHTML = `<div class="gone">couldn't load the thread (${esc(e.message)})</div>`;
    btn.textContent = '↳ a reply · show the thread';
  }
}
$('day').addEventListener('click', (e) => {
  const b = e.target.closest('.replyto');
  if (b) { e.preventDefault(); showThread(b.closest('.card')); }
});

// ── back to the top ──────────────────────────────────────────────────────────
// A day can run thousands of pixels; a small pull button appears once you are a
// screen below the grid and brings you back to the top.
const toTop = document.createElement('button');
toTop.className = 'totop hidden'; toTop.type = 'button'; toTop.setAttribute('aria-label', 'back to top'); toTop.textContent = '↑';
toTop.onclick = () => window.scrollTo({ top: 0, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
document.body.appendChild(toTop);
let topTick = false;
addEventListener('scroll', () => {
  if (topTick) return;
  topTick = true;
  requestAnimationFrame(() => { toTop.classList.toggle('hidden', scrollY < innerHeight * 0.9); topTick = false; });
}, { passive: true });

// ── events ───────────────────────────────────────────────────────────────────
$('f').addEventListener('submit', (e) => { e.preventDefault(); selected = null; $('day').classList.add('hidden'); run($('h').value); });
$('stop').addEventListener('click', () => { if (abort) abort.abort(); });
$('chips').addEventListener('click', (e) => {
  const b = e.target.closest('[data-m]'); if (!b || !S) return;
  metric = b.dataset.m;
  const u = new URL(location.href); if (metric === 'all') u.searchParams.delete('m'); else u.searchParams.set('m', metric); history.replaceState(null, '', u);
  renderAll();
  if (selected) openDay(selected);
});
$('years').addEventListener('click', (e) => { const r = e.target.closest('rect[data-d]'); if (r) openDay(r.dataset.d); });
$('tiles').addEventListener('click', (e) => { const a = e.target.closest('[data-go]'); if (a) { e.preventDefault(); openDay(a.dataset.go); } });
document.addEventListener('keydown', (e) => {
  if (!selected || e.target.closest('input')) return;
  if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
    const nb = neighbours(S.ix.days, selected, metric);
    const go = e.key === 'ArrowLeft' ? nb.prev : nb.next;
    if (go) { e.preventDefault(); openDay(go); }
  }
});

const qs = new URLSearchParams(location.search);
if (METRICS[qs.get('m')]) metric = qs.get('m');
if (qs.get('u')) { $('h').value = qs.get('u'); run(qs.get('u'), qs.get('d')); }

// days/app.js — handle in, every day out. The work is in repoindex.js (the
// download) and calendar.js (the maths); this file fetches identity, draws, and
// opens a day.
import { indexRepo, dayRecords, localDay } from './repoindex.js';
import { extractMedia } from '../thread/thread.js';
import { lines as bingoLines, hashSeed } from './bingo.js';
import { emptyCounts, put, miss, value, ranked, daySums, batches, pack, unpack } from './engage.js';
import { METRICS, countFor, yearGrids, levels, summary, cumulative, handleHistory, neighbours, daysBetween, addDays } from './calendar.js';

const $ = (id) => document.getElementById(id);
const API = 'https://public.api.bsky.app/xrpc';
const num = (n) => Number(n || 0).toLocaleString('en-US');
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const P = 'app.bsky.feed.post', L = 'app.bsky.feed.like', R = 'app.bsky.feed.repost', F = 'app.bsky.graph.follow';

let S = null;            // { profile, did, pds, ix, hist, cum, from, to }
let metric = 'all', selected = null, abort = null, dayAbort = null;
// The search. While a query is active the grid, the tiles and the legend show
// the SEARCH's days instead of the chosen metric: a topic lit up across years.
const Q = { mode: 'words', topic: null, top: null, q: '', active: false, ids: [], scores: [], terms: [], days: new Map(), hit: new Set(), sort: 'best', shown: 0, seq: 0 };
const view = () => (Q.active
  ? { days: Q.days, metric: '__search', label: Q.top ? 'interactions' : Q.topic ? 'posts on it' : Q.mode === 'meaning' ? 'close matches' : 'matches' }
  : { days: S.ix.days, metric, label: METRICS[metric].label });

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
async function run(raw, wantDay = null, wantQuery = null, wantBingo = null) {
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
    startSearch();
    G.cells = null; G.open = false; $('bingo').classList.add('hidden');
    if (eAbort) eAbort.abort(); E = null; Q.top = null;
    if (wantQuery) { $('sq').value = wantQuery.q; setMode(wantQuery.mode, false); runQuery(); }
    if (qs.get('top') && KIND_LABEL[qs.get('top')]) showTop(qs.get('top'));
    if (wantBingo) openBingo(/^\d+$/.test(wantBingo) ? +wantBingo >>> 0 : undefined);
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
  $('chips').classList.toggle('hidden', Q.active);
  $('chips').innerHTML = Object.entries(METRICS).map(([k, m]) => `<button class="chip" data-m="${k}" aria-pressed="${k === metric}">${m.label}</button>`).join('');
  renderTiles();
  renderYears();
}

function renderTiles() {
  const { from, to } = S;
  const V = view();
  const s = summary(V.days, from, to, V.metric, to);
  const t = (v, l, sub = '') => `<div class="tile"><div class="v">${v}</div><div class="l">${l}</div>${sub ? `<div class="s">${sub}</div>` : ''}</div>`;
  if (Q.top) {
    const best = Q.ids[0], tot = [...Q.days.values()].reduce((a, r) => a + r.hit, 0);
    $('tiles').innerHTML = [
      t(num(tot), Q.top === 'all' ? 'interactions received' : KIND_LABEL[Q.top] + ' received', E.done < E.n ? `counted ${num(E.done)} of ${num(E.n)} posts` : `on ${num(E.n)} posts`),
      t(num(s.active), 'days', 'that drew any'),
      t(best !== undefined ? num(value(E, best, Q.top)) : '—', 'best post', best !== undefined ? `<a href="#" data-go="${localDay(S.ix.posts[best].t)}">${localDay(S.ix.posts[best].t)}</a>` : ''),
      t(s.busiest ? num(s.busiest.n) : '—', 'best day', s.busiest ? `<a href="#" data-go="${s.busiest.day}">${s.busiest.day}</a>` : ''),
    ].join('');
    return;
  }
  if (Q.active) {
    const first = [...Q.days.keys()].sort()[0];
    $('tiles').innerHTML = [
      t(num(Q.ids.length), Q.topic ? `posts on ${esc(Q.topic)}` : Q.mode === 'meaning' ? 'closest posts' : 'posts match'),
      t(num(s.active), 'days', `of ${num(daysBetween(from, to) + 1)}`),
      t(first ? `<a href="#" data-go="${first}">${first}</a>` : '—', 'first said'),
      t(s.busiest ? num(s.busiest.n) : '—', 'peak day', s.busiest ? `<a href="#" data-go="${s.busiest.day}">${s.busiest.day}</a>` : ''),
    ].join('');
    return;
  }
  $('tiles').innerHTML = [
    t(num(s.total), METRICS[metric].label),
    t(num(s.active), 'active days', `of ${num(daysBetween(from, to) + 1)}`),
    t(s.busiest ? num(s.busiest.n) : '—', 'busiest day', s.busiest ? `<a href="#" data-go="${s.busiest.day}">${s.busiest.day}</a>` : ''),
    t(num(s.longest), 'longest streak', s.longestFrom ? `from ${s.longestFrom}` : ''),
  ].join('');
}

function renderYears() {
  const { from, to } = S;
  const V = view();
  const lv = levels(V.days, V.metric);
  const CELL = 11, STEP = 14, LEFT = 26, TOP = 14;
  $('years').innerHTML = yearGrids(V.days, from, to, V.metric).map((g) => {
    const total = g.cells.reduce((s, c) => s + c.n, 0);
    const w = LEFT + g.weeks * STEP, h = TOP + 7 * STEP;
    const rects = g.cells.map((c) => `<rect class="c${c.day === selected ? ' sel' : ''}" data-d="${c.day}" x="${LEFT + c.col * STEP}" y="${TOP + c.row * STEP}" width="${CELL}" height="${CELL}" rx="2" fill="var(--l${lv.level(c.n)})"><title>${c.day} · ${num(c.n)} ${V.label}</title></rect>`).join('');
    const months = g.months.map((m) => `<text x="${LEFT + m.col * STEP}" y="9">${m.label}</text>`).join('');
    const wd = [[1, 'Mon'], [3, 'Wed'], [5, 'Fri']].map(([r, l]) => `<text x="0" y="${TOP + r * STEP + 9}">${l}</text>`).join('');
    return `<div class="year"><h3>${g.year} <span>· ${num(total)} ${V.label}</span></h3>
      <div class="scroll"><svg class="cal" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img" aria-label="${g.year}: ${num(total)} ${V.label}">${months}${wd}${rects}</svg></div></div>`;
  }).join('');
  // the newest year opens scrolled to today, like GitHub's
  const first = $('years').querySelector('.scroll');
  if (first) first.scrollLeft = first.scrollWidth;
  $('legend').innerHTML = `less ${[0, 1, 2, 3, 4].map((i) => `<i style="background:var(--l${i})"></i>`).join('')} more · ${Q.top ? 'what that day\'s posts drew' : Q.active ? 'the days it came up' : 'busiest days darkest'} · click a day`;
}

// ── a day ────────────────────────────────────────────────────────────────────
const dayStart = (d) => { const [y, m, dd] = d.split('-').map(Number); return new Date(y, m - 1, dd).getTime(); };
const timeOf = (t) => new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

async function openDay(d, { scroll = true, focus = null } = {}) {
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
  const lo = firstAtOrAfter(ix.posts, start), hi = firstAtOrAfter(ix.posts, end);
  const posts = ix.posts.slice(lo, hi).map((p, k) => ({ ...p, i: lo + k }));
  const repliesSoFar = countRepliesUpTo(end);
  const nb = neighbours(ix.days, d, metric);
  const dateLong = new Date(start).toLocaleDateString([], { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  const others = Object.entries(row).filter(([c]) => ![P, L, R, F].includes(c));
  // the day's own posts are drawn first from the repo (instant), then upgraded
  // in place with what the AppView adds: media, quotes, link cards, counts
  const me = { did, handle: then, displayName: profile.displayName || then, avatar: profile.avatar };
  const repoCard = (p) => cardHtml({ uri: `at://${did}/${P}/${p.rkey}`, author: me, t: p.t, text: p.text, reply: p.reply, pending: true, ...extraFor(p.i) });

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
  if (scroll && !focus) $('day').scrollIntoView({ behavior: 'smooth', block: 'start' });

  // everything below is fetched for this day only, and abandoned if another day is opened
  if (dayAbort) dayAbort.abort();
  dayAbort = new AbortController();
  const signal = dayAbort.signal;
  const upgrade = (list) => hydrateInPlace(list.map((p) => `at://${did}/${P}/${p.rkey}`), signal, { handle: then }, $('dposts'), list.map((p) => extraFor(p.i)));
  const ups = [upgrade(posts.slice(0, SHOW))];
  if ($('allposts')) $('allposts').onclick = () => {
    $('dposts').insertAdjacentHTML('beforeend', posts.slice(SHOW).map(repoCard).join(''));
    $('allposts').remove();
    ups.push(upgrade(posts.slice(SHOW)));
  };
  // opened from a search result: make sure that post is drawn (a busy day pages
  // at SHOW, and the hit can be the 300th post) and bring it into view
  if (focus) {
    const k = posts.findIndex((p) => `at://${did}/${P}/${p.rkey}` === focus);
    if (k >= SHOW && $('allposts')) $('allposts').onclick();
    // hydration swaps the card and its images shift everything above it, so
    // centre it now and again once the AppView has filled the day in
    const go = () => { if (selected === d) $('dposts')?.querySelector(`article[data-uri="${CSS.escape(focus)}"]`)?.scrollIntoView({ block: 'center' }); };
    requestAnimationFrame(go);
    Promise.all(ups).then(() => setTimeout(go, 150));
  }

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
function cardHtml({ uri, author, t, text, reply, media = [], counts = null, pending = false, compact = false, date = false, marks = null, hit = false }) {
  const a = author || {};
  const when = date ? `<a href="#" data-day="${localDay(t)}" title="open this day">${new Date(t).toLocaleDateString([], { year: 'numeric', month: 'short', day: 'numeric' })}</a> · ` : '';
  return `<article class="card${compact ? ' compact' : ''}${hit ? ' hit' : ''}" data-uri="${esc(uri)}"${reply ? ' data-reply="1"' : ''}${pending ? ' data-pending="1"' : ''}>
    <a class="av" href="https://bsky.app/profile/${esc(a.did || '')}" target="_blank" rel="noopener">${a.avatar ? `<img src="${esc(thumbOf(a.avatar))}" alt="" loading="lazy">` : '<img alt="">'}</a>
    <div class="main">
      <div class="meta"><b>${esc(a.displayName || a.handle || '')}</b> <span>@${esc(a.handle || '')}</span> · ${when}<a href="${webUrl(uri)}" target="_blank" rel="noopener">${timeOf(t)}</a></div>
      ${reply ? `<button class="replyto" type="button" aria-expanded="false">↳ a reply · show the thread</button>` : ''}
      <div class="thread hidden"></div>
      ${text ? `<div class="txt">${markUp(esc(text), marks)}</div>` : (text === null ? '<div class="note">(this post could not be read)</div>' : '')}
      ${mediaHtml(media, uri)}
      ${counts ? `<div class="counts"><span title="replies">💬 ${num(counts.reply)}</span><span title="reposts">↻ ${num(counts.repost)}</span><span title="likes">♡ ${num(counts.like)}</span>${counts.quote ? `<span title="quotes">❝ ${num(counts.quote)}</span>` : ''}</div>` : ''}
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
  counts: { reply: Math.max(0, v.replyCount || 0), repost: Math.max(0, v.repostCount || 0), like: Math.max(0, v.likeCount || 0), quote: Math.max(0, v.quoteCount || 0) },
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
async function hydrateInPlace(uris, signal, override, box = $('dposts'), extras = []) {
  if (!uris.length) return;
  let views;
  try { views = await getPosts(uris, signal); } catch { return; }
  if (signal.aborted) return;
  for (const uri of uris) {
    const v = views.get(uri);
    const el = box?.querySelector(`article[data-uri="${CSS.escape(uri)}"]`);
    if (!el) continue;
    if (!v) { el.removeAttribute('data-pending'); continue; }   // hidden or taken down: keep the repo's text
    el.outerHTML = cardHtml({ ...fromView(v, override), ...(extras[uris.indexOf(uri)] || {}) });
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

// ── search ───────────────────────────────────────────────────────────────────
let worker = null, semReady = false, semState = '';
function startSearch() {
  if (worker) worker.terminate();
  semReady = false; semState = 'loading the meaning model…';
  worker = new Worker(new URL('./search.worker.js', import.meta.url), { type: 'module' });
  worker.onmessage = (e) => {
    const m = e.data;
    if (m.type === 'keyword-ready') { $('searchbar').classList.remove('hidden'); searchStatus(); }
    else if (m.type === 'semantic-progress') { semState = m.stage === 'model' ? 'loading the meaning model…' : `indexing meaning · ${Math.round(100 * m.done / m.n)}%`; searchStatus(); }
    else if (m.type === 'semantic-ready') { semReady = true; semState = `meaning ready (${(m.ms / 1000).toFixed(1)}s)`; searchStatus(); }
    else if (m.type === 'semantic-error') { semState = `meaning unavailable (${m.message})`; searchStatus(); }
    else if (m.type === 'result' && m.id === Q.seq) showResults(m);
    else if (m.type === 'bingo-progress' && m.id === G.seq) bingoStatus(m.stage);
    else if (m.type === 'bingo' && m.id === G.seq) showBingo(m);
    else if (m.type === 'bingo-error' && m.id === G.seq) bingoStatus(`couldn't draw a card: ${m.message}`, true);
  };
  worker.postMessage({ type: 'init', texts: S.ix.posts.map((p) => p.text || ''), times: S.ix.posts.map((p) => p.t) });
}
function searchStatus(extra = '') {
  if (!extra && Q.active && Q.topic) extra = Q.statusText;
  if (!extra && Q.top) extra = TOP_STATUS;    // a late "meaning ready" must not overwrite what is on screen
  const m = Q.mode === 'meaning';
  $('sstat').textContent = extra || (m ? (semReady ? 'finds posts by what they mean, not the words in them' : semState)
    : 'words · "a phrase" · -exclude · the word you are typing matches as a prefix') + (m || !semState ? '' : ` · ${semState}`);
}
function setMode(mode, rerun = true) {
  Q.mode = mode === 'meaning' ? 'meaning' : 'words';
  for (const b of document.querySelectorAll('[data-sm]')) b.setAttribute('aria-pressed', String(b.dataset.sm === Q.mode));
  $('sq').placeholder = Q.mode === 'meaning' ? 'describe it: "missing someone", "a good meal"' : 'search their posts';
  searchStatus();
  if (rerun) runQuery();
}
let qTimer = null;
function runQuery() {
  const q = $('sq').value;
  if (G.cells && G.pick >= 0 && G.cells[G.pick].kind !== 'says') { G.pick = -1; renderBingo(); }
  const u = new URL(location.href);
  if (q.trim()) { u.searchParams.set('q', q); u.searchParams.set('sm', Q.mode); u.searchParams.delete('top'); } else { u.searchParams.delete('q'); u.searchParams.delete('sm'); }
  history.replaceState(null, '', u);
  if (!q.trim()) { clearSearch(); return; }
  if (Q.mode === 'meaning' && !semReady) searchStatus(`${semState} · your search runs the moment it is ready`);
  Q.seq++;
  worker?.postMessage({ type: 'query', id: Q.seq, mode: Q.mode, q, k: 250 });
}
function clearSearch() {
  Q.active = false; Q.topic = null; Q.top = null; $('topgo').setAttribute('aria-pressed', 'false'); Q.ids = []; Q.days = new Map(); Q.hit = new Set(); Q.terms = [];
  G.pick = -1; if (G.cells) renderBingo();
  $('results').classList.add('hidden'); $('results').innerHTML = '';
  $('sclear').classList.add('hidden');
  searchStatus();
  renderAll();
  if (selected) openDay(selected);
}
function showResults(m) {
  const { ix } = S;
  if (Q.top) { Q.top = null; $('topgo').setAttribute('aria-pressed', 'false'); }
  Q.active = true; Q.topic = m.topic || null; Q.ids = Array.from(m.ids); Q.scores = Array.from(m.scores || []); Q.terms = m.terms || [];
  Q.hit = new Set(Q.ids);
  Q.days = new Map();
  for (const i of Q.ids) { const d = localDay(ix.posts[i].t); Q.days.set(d, { hit: (Q.days.get(d)?.hit || 0) + 1 }); }
  Q.marks = markRegex(Q.terms);
  $('sclear').classList.remove('hidden');
  if (m.empty) searchStatus('none of those words are in the model, so there is no meaning to search for');
  else if (Q.topic) searchStatus(Q.statusText = `the topic “${Q.topic}”: ${num(Q.ids.length)} posts, the one nearest its centre first`);
  else searchStatus(Q.mode === 'meaning' ? `the ${num(Q.ids.length)} posts closest in meaning, best first` : `${num(Q.ids.length)} posts`);
  renderAll();
  renderResults();
  if (selected) openDay(selected, { scroll: false });
}
function orderedHits() {
  const { ix } = S;
  const ids = Q.ids.slice();
  if (Q.top) return Q.ids;
  if (Q.sort === 'top' && E) { const seen = ranked(E, 'all', ids), set = new Set(seen); return seen.concat(ids.filter((i) => !set.has(i))); }
  if (Q.sort === 'newest') ids.sort((a, b) => ix.posts[b].t - ix.posts[a].t);
  else if (Q.sort === 'oldest') ids.sort((a, b) => ix.posts[a].t - ix.posts[b].t);
  return ids;
}
function renderResults() {
  const box = $('results');
  box.classList.remove('hidden');
  const sorts = Q.top
    ? Object.entries(KIND_LABEL).map(([k, l]) => `<button class="chip" data-kind="${k}" aria-pressed="${Q.top === k}">${l}</button>`).join('')
    : ['best', 'top', 'newest', 'oldest'].map((k) => `<button class="chip" data-sort="${k}" aria-pressed="${Q.sort === k}">${k === 'best' ? 'best match' : k === 'top' ? 'most interactions' : k}</button>`).join('');
  const title = Q.top ? `${num(Q.ids.length)} posts by ${Q.top === 'all' ? 'interactions' : KIND_LABEL[Q.top]}<span class="cnt" id="ecount">${E.done < E.n ? ` · counting ${num(E.done)} of ${num(E.n)}` : ''}</span>`
    : `${num(Q.ids.length)} ${Q.topic ? `posts on “${esc(Q.topic)}”` : Q.mode === 'meaning' ? 'closest posts' : 'posts'} on ${num(Q.days.size)} days`;
  box.innerHTML = `<div class="rhead"><h4>${title}</h4><div class="chips">${sorts}</div></div>
    <div class="feed" id="rlist"></div><button class="ghost small hidden" id="rmore"></button>`;
  Q.shown = 0;
  moreResults();
}
const PAGE = 30;
function moreResults() {
  const { ix, did, profile } = S;
  const ids = orderedHits().slice(Q.shown, Q.shown + PAGE);
  Q.shown += ids.length;
  const me = (t) => ({ did, handle: S.hist.at(t) || profile.handle, displayName: profile.displayName || profile.handle, avatar: profile.avatar });
  const cnt = (i) => (E && E.seen[i] === 1 ? { like: E.like[i], repost: E.repost[i], reply: E.reply[i], quote: E.quote[i] } : null);
  const html = ids.map((i) => { const p = ix.posts[i]; return cardHtml({ uri: `at://${did}/${P}/${p.rkey}`, author: me(p.t), t: p.t, text: p.text, reply: p.reply, pending: true, date: true, marks: Q.marks, counts: cnt(i) }); }).join('');
  $('rlist').insertAdjacentHTML('beforeend', html || '<p class="note">nothing found</p>');
  const more = Q.ids.length - Q.shown;
  $('rmore').classList.toggle('hidden', more <= 0);
  $('rmore').textContent = `show ${num(Math.min(PAGE, more))} more`;
  // upgrade in place with media and counts; each keeps the handle it had that day
  hydrateInPlace(ids.map((i) => `at://${did}/${P}/${ix.posts[i].rkey}`), new AbortController().signal, {}, $('rlist'),
    ids.map((i) => ({ date: true, marks: Q.marks, author: me(ix.posts[i].t) })));
}
// marking: the matched words, at word starts, case-insensitive
const reEsc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
function markRegex(terms) {
  const ts = (terms || []).filter((t) => t.length > 1).sort((a, b) => b.length - a.length).slice(0, 80);
  return ts.length ? new RegExp(`(^|[^\\p{L}\\p{N}])(${ts.map(reEsc).join('|')})`, 'giu') : null;
}
const markUp = (html, re) => (re ? html.replace(re, (_, pre, w) => `${pre}<mark>${w}</mark>`) : html);
function extraFor(i) { return Q.active && Q.hit.has(i) ? { hit: true, marks: Q.marks } : {}; }
function firstAtOrAfter(posts, t) { let lo = 0, hi = posts.length; while (lo < hi) { const m = (lo + hi) >> 1; if (posts[m].t < t) lo = m + 1; else hi = m; } return lo; }

$('sq').addEventListener('input', () => { clearTimeout(qTimer); qTimer = setTimeout(runQuery, Q.mode === 'meaning' ? 220 : 110); });
$('sq').addEventListener('keydown', (e) => { if (e.key === 'Escape') { $('sq').value = ''; runQuery(); } });
$('sclear').addEventListener('click', () => { $('sq').value = ''; runQuery(); $('sq').focus(); });
for (const b of document.querySelectorAll('[data-sm]')) b.addEventListener('click', () => setMode(b.dataset.sm));
$('results').addEventListener('click', (e) => {
  const s = e.target.closest('[data-sort]'); if (s) { Q.sort = s.dataset.sort; if (Q.sort === 'top' && !E) countEngagement(); renderResults(); return; }
  const kd = e.target.closest('[data-kind]'); if (kd) { showTop(kd.dataset.kind); return; }
  if (e.target.closest('#rmore')) { moreResults(); return; }
  const b = e.target.closest('.replyto'); if (b) { e.preventDefault(); showThread(b.closest('.card')); return; }
});
document.addEventListener('click', (e) => { const a = e.target.closest('[data-day]'); if (a) { e.preventDefault(); openDay(a.dataset.day, { focus: a.closest('article')?.dataset.uri || null }); } });

// ── top posts: everything they posted, by what other people did with it ───────
// The repo has no counts (likes etc. are other people's records), so they come
// from getPosts, 25 posts a call, newest first, ~30 s for 52k posts. Cached per
// account for 6 h. engage.js holds the arithmetic; this fetches and draws.
const TOP_STATUS = 'every post, by what other people did with it: each like, repost, reply and quote counts 1 · the calendar shows what each day\'s posts drew';
const KIND_LABEL = { all: 'all', like: 'likes', repost: 'reposts', reply: 'replies', quote: 'quotes' };
let E = null, eAbort = null, eTick = 0;
async function countEngagement() {
  if (E && (E.done === E.n || eAbort)) return;
  const { ix, did } = S, key = `${did}|eng2`;
  const hit = await cacheGet(key);
  if (hit && hit.n === ix.posts.length) { E = unpack(hit); topProgress(true); return; }
  E = emptyCounts(ix.posts.length);
  eAbort = new AbortController();
  const signal = eAbort.signal, todo = batches(E);
  let k = 0;
  const one = async (b) => {
    const url = `${API}/app.bsky.feed.getPosts?${b.map((i) => 'uris=' + encodeURIComponent(`at://${did}/${P}/${ix.posts[i].rkey}`)).join('&')}`;
    for (let attempt = 0; attempt < 5; attempt++) {
      const r = await fetch(url, { signal });
      if (r.status === 429 || r.status >= 500) { await new Promise((res) => setTimeout(res, 1000 * (+r.headers.get('retry-after') || 2 ** attempt))); continue; }
      if (!r.ok) break;
      const views = new Map(((await r.json()).posts || []).map((v) => [v.uri, v]));
      for (const i of b) { const v = views.get(`at://${did}/${P}/${ix.posts[i].rkey}`); if (v) put(E, i, v); else miss(E, i); }
      return;
    }
    for (const i of b) miss(E, i);
  };
  try {
    await Promise.all(Array.from({ length: 10 }, async () => { while (k < todo.length) { await one(todo[k++]); if (S?.did !== did) return; topProgress(); } }));
  } catch (e) { if (e?.name !== 'AbortError') throw e; return; }
  finally { eAbort = null; }
  if (S?.did !== did) return;
  cachePut(key, pack(E));
  topProgress(true);
}
// redraw while counting, at most every 1.5 s, and the list only while the
// reader is still on its first page (re-sorting under someone's thumb is rude)
function topProgress(final = false) {
  const now = performance.now();
  if (!final && now - eTick < 1500) { const c = $('ecount'); if (c) c.textContent = ` · counting ${num(E.done)} of ${num(E.n)}`; return; }
  eTick = now;
  if (Q.top) { refreshTop(Q.shown <= PAGE); }
  else if (Q.active && Q.sort === 'top' && final) renderResults();
}
function refreshTop(redrawList = true) {
  Q.ids = ranked(E, Q.top);
  Q.days = daySums(E, S.ix.posts, localDay, Q.top);
  Q.hit = new Set(Q.ids.slice(0, 250));
  renderTiles(); renderYears();
  if (redrawList) renderResults(); else { const c = $('ecount'); if (c) c.textContent = E.done < E.n ? ` · counting ${num(E.done)} of ${num(E.n)}` : ''; }
}
function showTop(kind = 'all') {
  Q.top = kind; Q.topic = null; Q.active = true; Q.terms = []; Q.marks = null; Q.sort = 'best';
  $('topgo').setAttribute('aria-pressed', 'true');
  $('sq').value = '';
  const u = new URL(location.href); u.searchParams.delete('q'); u.searchParams.delete('sm'); u.searchParams.set('top', kind); history.replaceState(null, '', u);
  if (!E) E = emptyCounts(S.ix.posts.length);
  searchStatus(TOP_STATUS);
  $('chips').classList.add('hidden');
  refreshTop(true);
  countEngagement();
}
function hideTop() {
  const u = new URL(location.href); u.searchParams.delete('top'); history.replaceState(null, '', u);
  clearSearch();
}
$('topgo').addEventListener('click', () => (Q.top ? hideTop() : showTop()));

// ── bingo ────────────────────────────────────────────────────────────────────
// The card is computed in the search worker (bingo.js); this only draws it,
// daubs it from a window of recent posts, and turns a square into its posts.
const G = { seq: 0, seed: 0, cells: null, pick: -1, win: 30, open: false };
// a year daubs nearly everything on an active account (12 lines on the test one), so the longest window is a month
const WINDOWS = [[1, 'today'], [7, 'this week'], [30, 'this month'], [0, 'off']];
// a term too rare to make the background (under 5 authors in the sample) has
// only a floor for a ratio: "rare elsewhere" says that, ×833 would pretend
const ratioText = (c, wide = '') => (!c.known ? 'rare elsewhere' : '×' + (c.ratio >= 100 ? num(Math.round(c.ratio)) : c.ratio.toFixed(c.ratio < 10 ? 1 : 0)) + (wide || ' bluesky'));
function bingoStatus(text, err = false) {
  if (!G.cells) $('bingo').innerHTML = `<p class="bnote${err ? ' err' : ''}">${esc(text)}</p>`;
  else { const n = $('bingo').querySelector('.bnote .live'); if (n) n.textContent = text; }
}
function openBingo(seed = G.seed || hashSeed(S.did)) {
  G.open = true; G.seed = seed; G.seq++;
  $('bingo').classList.remove('hidden');
  if (!G.cells) bingoStatus('drawing a card from the whole history…');
  worker?.postMessage({ type: 'bingo', id: G.seq, seed });
  const u = new URL(location.href); u.searchParams.set('bingo', String(seed)); history.replaceState(null, '', u);
}
function closeBingo() {
  G.open = false; G.cells = null; G.pick = -1;
  $('bingo').classList.add('hidden'); $('bingo').innerHTML = '';
  const u = new URL(location.href); u.searchParams.delete('bingo'); history.replaceState(null, '', u);
  if (Q.topic) { $('sq').value = ''; clearSearch(); }
}
function showBingo(m) {
  G.cells = m.cells.map((c) => ({ ...c, ids: Array.from(c.ids) }));
  G.ms = m.ms; G.pick = -1;
  renderBingo();
}
function daubs() {
  const now = Date.now(), since = now - G.win * 86400e3, posts = S.ix.posts;
  // the centre is the free space; a blank from a short history is NOT, or a thin card would win for free
  return G.cells.map((c, i) => c.centre || i === 12 || (G.win > 0 && c.ids.some((k) => posts[k].t >= since)));
}
function renderBingo() {
  if (!G.cells) return;
  const marked = daubs();
  const ln = G.win > 0 ? bingoLines(marked) : [];
  const inLine = new Set();
  for (const l of ln) for (let k = 0; k < 5; k++) inLine.add(l.kind === 'row' ? l.i * 5 + k : l.kind === 'col' ? k * 5 + l.i : l.i === 0 ? k * 6 : (k + 1) * 4);
  // on a phone the captions shrink to their number; the words ride in a span CSS hides
  const sub = (c) => c.centre ? 'free<span class="wide"> · their surest</span>' : c.kind === 'says' ? ratioText(c, '<span class="wide"> bluesky</span>') : c.kind === 'on' ? `topic<span class="wide"> · ${num(c.posts)}</span>` : '';
  const cells = G.cells.map((c, i) => `<button type="button" class="sq ${c.kind}${c.centre ? ' centre' : ''}${marked[i] && G.win > 0 ? ' daub' : ''}${inLine.has(i) ? ' line' : ''}" data-sq="${i}" aria-pressed="${G.pick === i}"
      title="${esc(c.kind === 'on' ? `a topic: ${num(c.posts)} posts on ${num(c.days)} days${c.alts?.length ? ' · also ' + c.alts.join(', ') : ''}` : c.kind === 'says' ? `in ${num(c.posts)} posts on ${num(c.days)} days, ${c.known ? c.ratio.toFixed(1) + '× as often as Bluesky at large' : 'and almost nowhere else on Bluesky'}` : '')}">
      <span class="t">${esc(c.term)}</span><span class="s">${sub(c)}</span></button>`).join('');
  const n = marked.filter(Boolean).length - 1;
  const win = WINDOWS.find(([d]) => d === G.win)[1];
  const blanks = G.cells.filter((c) => c.kind === 'free').length - 1;
  const head = (blanks > 0 ? `not enough history for a full card: ${blanks} blank square${blanks > 1 ? 's' : ''} · ` : '') + (ln.length ? `<span class="banner">BINGO</span> · ${ln.length} line${ln.length > 1 ? 's' : ''} ${win}` : G.win > 0 ? `${n} of 24 squares came up ${win}` : 'daubing off');
  $('bingo').innerHTML = `<div class="bhead"><h4>@${esc(S.profile.handle)} bingo</h4>
      <div class="bctl"><div class="seg" role="group" aria-label="daub what came up">${WINDOWS.map(([d, l]) => `<button type="button" data-win="${d}" aria-pressed="${G.win === d}">${l}</button>`).join('')}</div>
      <button type="button" class="ghost small" id="breroll">new card</button><button type="button" class="ghost small" id="bcopy">copy image + alt</button><button type="button" class="ghost small" id="bsave">save image</button><button type="button" class="ghost small" id="bclose" aria-label="close the card">×</button></div></div>
    <div class="bgrid">${[...'BINGO'].map((l) => `<div class="col">${l}</div>`).join('')}${cells}</div>
    <p class="bnote"><span class="live">${head}</span>. <b>Solid</b> squares are words and phrases they use far more often than Bluesky does
      (measured against 390k English posts sampled from the firehose). <b>Dashed</b> squares are topics they keep coming back to: their posts clustered by meaning,
      each named by the word nearest its centre. Tap a square for its posts.</p>`;
  drawBingoCard(marked, inLine);
}

// the shareable card: canvas, text only (no avatar, so nothing taints it)
let bingoPng = null, bingoAlt = '';
function drawBingoCard(marked, inLine) {
  const W = 1080, H = 1350, c = document.createElement('canvas');
  c.width = W; c.height = H;
  const x = c.getContext('2d');
  const dark = matchMedia('(prefers-color-scheme: dark)').matches && document.documentElement.dataset.theme !== 'light';
  const ink = dark ? '#e6e6e6' : '#1a1a1a', paper = dark ? '#121211' : '#faf9f6', cell = dark ? '#1c1c1a' : '#ffffff', sky = dark ? '#6ec1e4' : '#1a82c4', muted = dark ? '#8a8a8a' : '#777';
  x.fillStyle = paper; x.fillRect(0, 0, W, H);
  x.fillStyle = ink; x.textAlign = 'center'; x.textBaseline = 'alphabetic';
  x.font = '600 34px ui-monospace, Menlo, monospace';
  x.fillText('@' + S.profile.handle, W / 2, 92);
  const G0 = 70, gap = 14, size = (W - 2 * G0 - 4 * gap) / 5, top = 250;
  x.font = '800 96px Georgia, serif'; x.fillStyle = sky;
  [...'BINGO'].forEach((l, k) => x.fillText(l, G0 + k * (size + gap) + size / 2, top - 30));
  G.cells.forEach((cl, i) => {
    const r = Math.floor(i / 5), k = i % 5, X0 = G0 + k * (size + gap), Y0 = top + r * (size + gap);
    x.fillStyle = inLine.has(i) ? (dark ? '#3a3418' : '#fff6cc') : cell;
    x.beginPath(); x.roundRect(X0, Y0, size, size, 12); x.fill();
    x.lineWidth = cl.centre ? 4 : 2.5; x.strokeStyle = cl.centre ? sky : dark ? '#3a3a38' : '#d0cec8';
    x.setLineDash(cl.kind === 'on' ? [10, 7] : []); x.stroke(); x.setLineDash([]);
    if (marked[i] && G.win > 0) { x.fillStyle = 'rgba(230,57,70,.30)'; x.beginPath(); x.arc(X0 + size / 2, Y0 + size / 2, size * 0.36, 0, 7); x.fill(); }
    // fit the term: biggest font that wraps into ≤ 3 lines inside the square
    const txt = cl.term, maxW = size - 22;
    // shrink until every WORD fits whole and the block clears the caption;
    // only at the smallest size may a word be broken by letters
    let fs = 40, lines;
    for (; fs >= 18; fs -= 2) {
      x.font = `${cl.kind === 'on' ? 'italic ' : ''}700 ${fs}px ui-monospace, Menlo, monospace`;
      lines = wrap(x, txt, maxW, false);
      if (lines.every((l) => x.measureText(l).width <= maxW) && lines.length * fs * 1.15 <= size - 70) break;
    }
    if (fs < 18) { fs = 18; x.font = `${cl.kind === 'on' ? 'italic ' : ''}700 18px ui-monospace, Menlo, monospace`; lines = wrap(x, txt, maxW, true); }
    x.fillStyle = ink;
    const lh = fs * 1.15, y0 = Y0 + size / 2 - ((lines.length - 1) * lh) / 2 + fs * 0.35 - 8;
    lines.forEach((l, j) => x.fillText(l, X0 + size / 2, y0 + j * lh));
    x.font = '400 17px ui-monospace, Menlo, monospace'; x.fillStyle = muted;
    x.fillText(cl.centre || i === 12 ? 'FREE' : cl.kind === 'on' ? 'topic' : cl.kind === 'says' ? ratioText(cl) : '', X0 + size / 2, Y0 + size - 16);
  });
  x.textAlign = 'left'; x.font = '400 22px ui-monospace, Menlo, monospace'; x.fillStyle = muted;
  const yb = top + 5 * size + 4 * gap + 56;
  x.fillText('solid: says it far more than bluesky does', G0, yb);
  x.fillText('dashed: a topic they keep coming back to', G0, yb + 34);
  if (G.win > 0) x.fillText(`marked: came up ${WINDOWS.find(([d]) => d === G.win)[1]}`, G0, yb + 68);
  x.textAlign = 'right'; x.font = '700 26px ui-monospace, Menlo, monospace'; x.fillStyle = sky;
  x.fillText('b.mino.mobi/days', W - G0, H - 40);
  const rows = [0, 1, 2, 3, 4].map((r) => G.cells.slice(r * 5, r * 5 + 5).map((cl, k) => cl.term + (cl.kind === 'on' ? ' (topic)' : '') + (marked[r * 5 + k] && G.win > 0 && !cl.centre ? ' ✓' : '')).join(', '));
  bingoAlt = `Bingo card for @${S.profile.handle}, drawn from their whole Bluesky history at b.mino.mobi/days. Free centre: ${G.cells[12].term}. `
    + rows.map((r, k) => `Row ${k + 1}: ${r}.`).join(' ')
    + (G.win > 0 ? ` ✓ = came up ${WINDOWS.find(([d]) => d === G.win)[1]}.` : '');
  bingoPng = new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('blank'))), 'image/png'));
  bingoPng.catch(() => {});
}
function wrap(x, text, maxW, breakWords) {
  const out = [];
  let line = '';
  for (const w of text.split(' ')) {
    const t = line ? line + ' ' + w : w;
    if (x.measureText(t).width <= maxW || !line) line = t; else { out.push(line); line = w; }
  }
  if (line) out.push(line);
  if (!breakWords) return out;
  // a single word wider than the square is broken by characters
  return out.flatMap((l) => {
    if (x.measureText(l).width <= maxW) return [l];
    const parts = []; let p = '';
    for (const ch of l) { if (x.measureText(p + ch).width > maxW && p) { parts.push(p); p = ch; } else p += ch; }
    if (p) parts.push(p);
    return parts;
  });
}
function bflash(btn, text) { const was = btn.textContent; btn.textContent = text; setTimeout(() => { btn.textContent = was; }, 1600); }

$('bingogo').addEventListener('click', () => { if (G.open) closeBingo(); else openBingo(); });
$('bingo').addEventListener('click', async (e) => {
  const w = e.target.closest('[data-win]'); if (w) { G.win = +w.dataset.win; renderBingo(); return; }
  if (e.target.closest('#bclose')) { closeBingo(); return; }
  if (e.target.closest('#breroll')) { openBingo((G.seed + 0x9e3779b9) >>> 0); return; }
  if (e.target.closest('#bsave')) {
    try { const a = document.createElement('a'); a.href = URL.createObjectURL(await bingoPng); a.download = `bingo-${S.profile.handle}.png`; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); }
    catch { bflash(e.target, 'save failed'); }
    return;
  }
  if (e.target.closest('#bcopy')) {
    // o's rule: image/png + text/html <img alt>, and NO text/plain, so the
    // mainline composer sees a plain image paste and bsky.mino.mobi fills the alt
    const btn = e.target.closest('#bcopy');
    if (!window.ClipboardItem || !navigator.clipboard?.write) { bflash(btn, 'not supported: save image'); return; }
    const a = bingoAlt.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const html = bingoPng.then((b) => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(new Blob([`<img src="${r.result}" alt="${a}">`], { type: 'text/html' })); r.onerror = () => rej(r.error); r.readAsDataURL(b); }));
    try { await navigator.clipboard.write([new ClipboardItem({ 'image/png': bingoPng, 'text/html': html })]); bflash(btn, 'copied: paste into a post'); }
    catch { try { await navigator.clipboard.write([new ClipboardItem({ 'image/png': bingoPng })]); bflash(btn, 'image copied (no alt here)'); } catch { bflash(btn, 'copy failed: save image'); } }
    return;
  }
  const sq = e.target.closest('[data-sq]');
  if (!sq) return;
  const i = +sq.dataset.sq, c = G.cells[i];
  if (G.pick === i) { G.pick = -1; $('sq').value = ''; runQuery(); renderBingo(); return; }
  G.pick = i;
  if (c.kind === 'says') {
    // a saying is a real search: the box says what was asked
    $('sq').value = c.term.includes(' ') ? `"${c.term}"` : c.term + ' ';
    setMode('words', false); runQuery();
  } else if (c.kind === 'on') {
    $('sq').value = '';
    const u = new URL(location.href); u.searchParams.delete('q'); u.searchParams.delete('sm'); history.replaceState(null, '', u);
    showResults({ ids: c.ids, scores: [], terms: [c.term, ...(c.alts || [])], topic: c.term });
  }
  renderBingo();
  $('results').scrollIntoView({ behavior: 'smooth', block: 'start' });
});

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
if (qs.get('u')) { $('h').value = qs.get('u'); run(qs.get('u'), qs.get('d'), qs.get('q') ? { q: qs.get('q'), mode: qs.get('sm') || 'words' } : null, qs.get('bingo')); }

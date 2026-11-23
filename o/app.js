// o/app.js — handle in, circle out.
import { rank, toQuery, fromQuery, cleanActor, DEFAULTS, sum } from './circle.js';
import { gather, profile, profiles, proxied, stats } from './data.js';
import { draw, loadImages, SIZE } from './render.js';

const $ = (id) => document.getElementById(id);
const num = (n) => Number(n).toLocaleString('en-US');
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// On o.mino.mobi avatars come through our CORS proxy so the card can be exported.
// Anywhere else (local dev) the proxy does not exist; use the CDN and accept a
// card that can be seen but not saved.
const PROXY = location.hostname === 'o.mino.mobi' || window.O_PROXY === true;
const avatarSrc = (url) => (url ? (PROXY ? proxied(url) || url : url) : null);

let settings = fromQuery(location.search);
let centre = null, events = null, meta = null, eventsDays = 0, people = [], geom = null, abort = null, t0 = 0;
const prof = new Map();

function status(msg, err = false) { $('status').textContent = msg; $('status').className = err ? 'status err' : 'status'; }
const theme = () => (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');

// ── run ──────────────────────────────────────────────────────────────────────
async function run(raw, { push = true } = {}) {
  const actor = cleanActor(raw);
  if (!actor) return;
  if (abort) abort.abort();
  abort = new AbortController();
  const signal = abort.signal;
  t0 = performance.now(); stats.requests = 0;
  $('go').disabled = true;
  $('out').classList.remove('hidden'); $('spin').classList.remove('hidden');
  status('finding ' + actor + '…');
  try {
    centre = await profile(actor, signal);
    $('h').value = centre.handle;
    if (push) history.pushState(null, '', '/' + centre.handle + (toQuery(settings) ? '?' + toQuery(settings) : ''));
    document.title = `@${centre.handle}'s circle · o.mino.mobi`;
    const cached = fromCache(centre.did, settings.days);
    if (cached) ({ events, meta } = cached);
    else {
      ({ events, meta } = await gather(centre.did, { days: settings.days, signal, onProgress: (m) => status(m + '…') }));
      toCache(centre.did, settings.days, { events, meta });
    }
    eventsDays = settings.days;
    await paint(signal);
  } catch (e) {
    if (e?.name === 'AbortError') return;
    status(/^4\d\d$/.test(e.message) ? `couldn't find ${actor}. check the handle?` : `something went wrong (${e.message}). try again?`, true);
    $('spin').classList.add('hidden');
    if (!people.length) $('out').classList.add('hidden');
  } finally {
    $('go').disabled = false;
  }
}

async function paint(signal) {
  $('spin').classList.remove('hidden');
  const ranked = rank(events, centre.did, settings);
  const seats = settings.inner + settings.outer + settings.third;
  const top = ranked.slice(0, seats);
  const need = [centre.did, ...top.map((r) => r.did)].filter((d) => !prof.has(d));
  if (need.length) for (const [k, v] of await profiles(need, signal)) prof.set(k, v);
  prof.set(centre.did, { ...centre, ...(prof.get(centre.did) || {}) });
  people = top.map((r) => ({ ...r, profile: prof.get(r.did) || { did: r.did, handle: r.did } }));
  const [cImg, ...pImgs] = await loadImages([avatarSrc(centre.avatar), ...people.map((p) => avatarSrc(p.profile.avatar))]);
  if (signal?.aborted) return;
  geom = draw($('c'), { centre, people, imgs: { centre: cImg, people: pImgs }, days: settings.days, inner: settings.inner, outer: settings.outer, third: settings.third, theme: theme() });
  $('spin').classList.add('hidden');

  const total = ranked.reduce((s, r) => s + r.total, 0);
  const secs = ((performance.now() - t0) / 1000).toFixed(1);
  status('');
  $('meta').textContent = `${num(total)} interactions with ${num(ranked.length)} people over ${settings.days} days`
    + ` · ${secs}s, ${num(stats.requests)} requests`
    + (meta.capped.length ? ` · not read: ${meta.capped.join(', ')}` : '')
    + (meta.failed ? ` · ${meta.failed} lookups failed` : '');
  table(ranked);
}

function table(ranked) {
  const rows = ranked.slice(0, 50).map((r, i) => {
    const p = prof.get(r.did);
    const h = p?.handle || r.did;
    const av = p?.avatar ? `<img src="${esc(p.avatar.replace('/avatar/', '/avatar_thumbnail/'))}" alt="" loading="lazy">` : '<img alt="">';
    return `<tr><td class="n">${i + 1}</td><td><a class="who" href="https://bsky.app/profile/${esc(h)}" target="_blank" rel="noopener">${av}@${esc(h)}</a></td>`
      + `<td class="n">${num(sum(r.in))}</td><td class="n">${num(sum(r.out))}</td><td class="n">${num(r.in.reply + r.out.reply)}</td><td class="n"><b>${num(r.score)}</b></td></tr>`;
  }).join('');
  $('table').innerHTML = `<thead><tr><th class="n">#</th><th>who</th><th class="n">them → you</th><th class="n">you → them</th><th class="n">replies</th><th class="n">score</th></tr></thead><tbody>${rows}</tbody>`;
  // names for anyone past the drawn seats, lazily
  const missing = ranked.slice(0, 50).map((r) => r.did).filter((d) => !prof.has(d));
  if (missing.length) profiles(missing).then((m) => { for (const [k, v] of m) prof.set(k, v); if ($('numbers').open) table(ranked); });
}

// ── cache (per tab, 10 min): re-tuning and back/forward never refetch ─────────
function fromCache(did, days) {
  try {
    const hit = JSON.parse(sessionStorage.getItem(`o:${did}:${days}`) || 'null');
    return hit && Date.now() - hit.at < 600000 ? hit.v : null;
  } catch { return null; }
}
function toCache(did, days, v) { try { sessionStorage.setItem(`o:${did}:${days}`, JSON.stringify({ at: Date.now(), v })); } catch { /* full or private */ } }

// ── tune ─────────────────────────────────────────────────────────────────────
const TUNE = ['days', 'dir', 'inner', 'outer', 'third', 'wl', 'wp', 'wr', 'wq'];
function syncTune() {
  $('days').value = String(settings.days); $('dir').value = settings.dir;
  $('inner').value = settings.inner; $('outer').value = settings.outer; $('third').value = settings.third;
  $('wl').value = settings.weights.like; $('wp').value = settings.weights.repost; $('wr').value = settings.weights.reply; $('wq').value = settings.weights.quote;
  if (![...$('days').options].some((o) => o.value === String(settings.days))) {
    const o = document.createElement('option'); o.value = settings.days; o.textContent = settings.days + ' days'; $('days').appendChild(o); $('days').value = String(settings.days);
  }
}
let tuneT;
for (const id of TUNE) $(id).addEventListener('change', () => {
  const clamp = (v, lo, hi, d) => (Number.isFinite(+v) ? Math.max(lo, Math.min(hi, +v)) : d);
  settings = {
    days: +$('days').value, dir: $('dir').value,
    inner: Math.round(clamp($('inner').value, 3, 12, 8)), outer: Math.round(clamp($('outer').value, 0, 24, 16)), third: Math.round(clamp($('third').value, 0, 32, 0)),
    weights: { like: clamp($('wl').value, 0, 10, 1), repost: clamp($('wp').value, 0, 10, 1), reply: clamp($('wr').value, 0, 10, 1), quote: clamp($('wq').value, 0, 10, 1) },
  };
  syncTune();
  if (!centre) return;
  history.replaceState(null, '', '/' + centre.handle + (toQuery(settings) ? '?' + toQuery(settings) : ''));
  clearTimeout(tuneT);
  // a longer window needs more data; anything else re-ranks what we have
  tuneT = setTimeout(() => (settings.days > eventsDays ? run(centre.handle, { push: false }) : paint()), 150);
});

// ── share ────────────────────────────────────────────────────────────────────
const link = () => `https://o.mino.mobi/${centre.handle}${toQuery(settings) ? '?' + toQuery(settings) : ''}`;
const png = () => new Promise((res, rej) => { try { $('c').toBlob((b) => (b ? res(b) : rej(new Error('blank'))), 'image/png'); } catch (e) { rej(e); } });
function flash(btn, text) { const was = btn.textContent; btn.textContent = text; setTimeout(() => { btn.textContent = was; }, 1600); }
$('share').onclick = async () => {
  if (!centre) return;
  const text = `my circle on bluesky, last ${settings.days} days`;
  try {
    const file = new File([await png()], `circle-${centre.handle}.png`, { type: 'image/png' });
    if (navigator.canShare?.({ files: [file] })) { await navigator.share({ files: [file], text, url: link() }); return; }
  } catch (e) { if (e?.name === 'AbortError') return; }
  try { if (navigator.share) { await navigator.share({ text, url: link() }); return; } } catch (e) { if (e?.name === 'AbortError') return; }
  try { await navigator.clipboard.writeText(link()); flash($('share'), 'link copied'); } catch { flash($('share'), 'copy failed'); }
};
$('save').onclick = async () => {
  if (!centre) return;
  try {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(await png()); a.download = `circle-${centre.handle}.png`;
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  } catch { flash($('save'), 'long-press the image to save'); }
};
$('copy').onclick = async () => { try { await navigator.clipboard.writeText(link()); flash($('copy'), 'copied'); } catch { flash($('copy'), 'copy failed'); } };

// ── the canvas is live: hover for who, click for their profile ───────────────
function seatAt(ev) {
  if (!geom || !people.length) return -1;
  const r = $('c').getBoundingClientRect(), k = SIZE / r.width;
  const x = (ev.clientX - r.left) * k, y = (ev.clientY - r.top) * k;
  const seats = [...geom.inner, ...geom.outer, ...geom.third];
  for (let i = 0; i < seats.length && i < people.length; i++) if (Math.hypot(seats[i].x - x, seats[i].y - y) <= seats[i].r + 4) return i;
  return -1;
}
$('c').addEventListener('pointermove', (ev) => {
  const i = seatAt(ev), t = $('tip');
  if (i < 0) { t.classList.add('hidden'); $('c').style.cursor = 'default'; return; }
  const p = people[i];
  $('c').style.cursor = 'pointer';
  t.innerHTML = `<b>#${i + 1} @${esc(p.profile.handle)}</b><div class="m">${num(sum(p.in))} them → you · ${num(sum(p.out))} you → them</div>`;
  t.classList.remove('hidden');
  t.style.left = Math.min(ev.clientX + 14, innerWidth - t.offsetWidth - 8) + 'px';
  t.style.top = (ev.clientY + 16) + 'px';
});
$('c').addEventListener('pointerleave', () => $('tip').classList.add('hidden'));
$('c').addEventListener('click', (ev) => { const i = seatAt(ev); if (i >= 0) window.open(`https://bsky.app/profile/${people[i].profile.handle}`, '_blank', 'noopener'); });

// ── input ────────────────────────────────────────────────────────────────────
$('f').addEventListener('submit', (e) => { e.preventDefault(); run($('h').value); });
$('h').addEventListener('bsky-select', () => run($('h').value));
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { if (events) paint(); });
addEventListener('popstate', () => { settings = fromQuery(location.search); syncTune(); const h = location.pathname.slice(1); if (h) run(h, { push: false }); });

// deep link: o.mino.mobi/<handle>
syncTune();
const start = decodeURIComponent(location.pathname.replace(/^\/+|\/+$/g, ''));
if (start && !start.includes('/') && !/\.(html|js|png)$/.test(start)) { $('h').value = start; run(start, { push: false }); }
else $('h').focus();

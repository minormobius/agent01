// pod/app — a small, real podcast client. Subscribe to any RSS feed (stored in
// localStorage), parse it client-side, and play episodes. Cross-origin feeds go
// through the worker's guarded /api/fetch proxy; same-origin (our own PDS feeds)
// are fetched directly. Audio enclosures play straight from their host.

const $ = (id) => document.getElementById(id);
const SUBS_KEY = 'pod.app.subs';
const COMMUNAL = 'https://pod.mino.mobi/feed.xml';

let subs = loadSubs();      // [{ url, title }]
let active = null;          // active feed url
const cache = {};           // url -> parsed feed
let current = -1;           // playing episode index in the active feed

// ---- boot ------------------------------------------------------------------
(function init() {
  const add = new URLSearchParams(location.search).get('add');
  if (!subs.length) subs.push({ url: COMMUNAL, title: 'minomobi · all shows' });
  if (add) addSub(add, true);
  saveSubs();
  renderSubs();
  selectFeed(active || (subs[0] && subs[0].url));
})();

$('addBtn').addEventListener('click', () => {
  const v = $('addUrl').value.trim();
  if (!v) return;
  let url;
  try { url = new URL(v, location.href).toString(); }
  catch { return showErr('That doesn’t look like a URL.'); }
  $('addUrl').value = '';
  addSub(url, false);
  saveSubs();
  renderSubs();
  selectFeed(url);
});
$('addUrl').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('addBtn').click(); });

// ---- subscriptions ---------------------------------------------------------
function loadSubs() { try { return JSON.parse(localStorage.getItem(SUBS_KEY)) || []; } catch { return []; } }
function saveSubs() { localStorage.setItem(SUBS_KEY, JSON.stringify(subs)); }
function addSub(url, setActive) {
  if (!subs.find((s) => s.url === url)) subs.push({ url, title: url });
  if (setActive) active = url;
}
function removeSub(url) {
  subs = subs.filter((s) => s.url !== url);
  saveSubs();
  if (active === url) { active = null; selectFeed(subs[0] && subs[0].url); }
  renderSubs();
}

function renderSubs() {
  $('subsRow').innerHTML = subs.map((s) => `
    <div class="chip ${s.url === active ? 'active' : ''}" data-url="${escAttr(s.url)}">
      <span class="ct">${esc(s.title || s.url)}</span>
      <span class="x" data-x="${escAttr(s.url)}">✕</span>
    </div>`).join('');
  $('subsRow').querySelectorAll('.chip').forEach((el) => {
    el.addEventListener('click', (e) => {
      if (e.target.dataset.x !== undefined) { removeSub(el.dataset.url); return; }
      selectFeed(el.dataset.url);
    });
  });
}

// ---- feed loading ----------------------------------------------------------
async function selectFeed(url) {
  if (!url) { $('feedHead').style.display = 'none'; $('episodes').innerHTML = '<p class="empty">No subscriptions. Paste a feed URL above, or <a href="/shows/">discover shows</a>.</p>'; renderSubs(); return; }
  active = url;
  renderSubs();
  hideErr();
  $('episodes').innerHTML = '<p class="empty">Loading feed…</p>';
  try {
    const feed = await loadFeed(url);
    $('feedHead').style.display = '';
    $('feedTitle').textContent = feed.title;
    $('feedImg').src = feed.image || '';
    $('feedImg').style.visibility = feed.image ? 'visible' : 'hidden';
    renderEpisodes(feed);
  } catch (e) {
    $('feedHead').style.display = 'none';
    $('episodes').innerHTML = `<p class="empty">Couldn’t load this feed.<br><span style="font-size:12px">${esc(e.message || e)}</span></p>`;
  }
}

async function loadFeed(url) {
  if (cache[url]) return cache[url];
  const src = sameOrigin(url) ? url : `/api/fetch?url=${encodeURIComponent(url)}`;
  const res = await fetch(src);
  if (!res.ok) throw new Error('HTTP ' + res.status);
  const feed = parseFeed(await res.text(), url);
  cache[url] = feed;
  const sub = subs.find((s) => s.url === url);
  if (sub && feed.title) { sub.title = feed.title; saveSubs(); renderSubs(); }
  return feed;
}

function sameOrigin(url) {
  try { return new URL(url, location.href).origin === location.origin; } catch { return false; }
}

function parseFeed(xml, url) {
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  if (doc.querySelector('parsererror')) throw new Error('Not a valid RSS feed');
  const channel = doc.querySelector('channel') || doc.documentElement;
  const title = childText(channel, 'title') || url;
  let image = '';
  const imgUrl = channel.querySelector('image > url');
  if (imgUrl) image = imgUrl.textContent.trim();
  if (!image) { const it = nsEl(channel, 'itunes:image'); if (it) image = it.getAttribute('href') || ''; }
  const items = [...doc.querySelectorAll('item')].map((it) => {
    const enc = it.querySelector('enclosure');
    return {
      title: childText(it, 'title') || 'Untitled',
      desc: stripHtml(childText(it, 'description') || nsText(it, 'itunes:summary') || ''),
      audio: enc ? enc.getAttribute('url') : '',
      date: childText(it, 'pubDate') || '',
      duration: nsText(it, 'itunes:duration') || '',
    };
  }).filter((i) => i.audio);
  return { title, image, items, url };
}

// ---- episodes + player -----------------------------------------------------
function renderEpisodes(feed) {
  if (!feed.items.length) { $('episodes').innerHTML = '<p class="empty">This feed has no playable episodes.</p>'; return; }
  $('episodes').innerHTML = feed.items.map((e, i) => {
    const meta = [fmtDur(e.duration), e.date ? new Date(e.date).toLocaleDateString() : ''].filter(Boolean).join(' · ');
    return `<div class="ep" data-i="${i}">
      <div class="play">▶</div>
      <div class="meta">
        <div class="t">${esc(e.title)}</div>
        ${e.desc ? `<div class="d">${esc(e.desc)}</div>` : ''}
        ${meta ? `<div class="sub2">${esc(meta)}</div>` : ''}
      </div>
    </div>`;
  }).join('');
  $('episodes').querySelectorAll('.ep').forEach((el) => el.addEventListener('click', () => play(feed, +el.dataset.i)));
}

function play(feed, i) {
  const e = feed.items[i];
  if (!e || !e.audio) return;
  current = i;
  const audio = $('audio');
  audio.src = e.audio;
  audio.play().catch(() => {});
  $('pTitle').textContent = e.title;
  $('pShow').textContent = feed.title;
  $('player').classList.add('on');
  document.querySelectorAll('.ep').forEach((el, k) => {
    el.classList.toggle('playing', k === i);
    el.querySelector('.play').textContent = k === i ? '❚❚' : '▶';
  });
}
$('audio').addEventListener('play', () => syncIcon(true));
$('audio').addEventListener('pause', () => syncIcon(false));
function syncIcon(playing) {
  const a = document.querySelector('.ep.playing .play');
  if (a) a.textContent = playing ? '❚❚' : '▶';
}

// ---- util ------------------------------------------------------------------
function childText(el, tag) { const n = el.querySelector(tag); return n ? n.textContent.trim() : ''; }
function nsEl(el, qname) { return el.getElementsByTagName(qname)[0] || null; }
function nsText(el, qname) { const n = nsEl(el, qname); return n ? n.textContent.trim() : ''; }
function stripHtml(s) { return String(s).replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim(); }
function fmtDur(d) {
  if (!d) return '';
  if (/^\d+$/.test(d)) {
    const s = +d, m = Math.floor(s / 60), sec = s % 60;
    return `${m}:${String(sec).padStart(2, '0')}`;
  }
  return d;
}
function esc(s) { return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
function escAttr(s) { return esc(s); }
function showErr(m) { $('addErr').textContent = m; $('addErr').style.display = ''; }
function hideErr() { $('addErr').style.display = 'none'; }

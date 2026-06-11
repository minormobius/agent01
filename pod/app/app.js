// pod/app — a small, real podcast client.
//
// Subscribe to any RSS feed, parse it client-side, and play episodes.
// Subscriptions are PDS records (com.minomobi.podcast.subscription) when signed
// in — they sync across every device — and fall back to localStorage when not.
// Cross-origin feeds go through the worker's guarded /api/fetch proxy; same-
// origin (our PDS feeds) are fetched directly. Audio plays straight from its host.

import { AuthClient } from '../lib/auth.js';

const $ = (id) => document.getElementById(id);
const SUBS_KEY = 'pod.app.subs';
const COMMUNAL = 'https://pod.mino.mobi/feed.xml';
const COLLECTION = 'com.minomobi.podcast.subscription';
const SCOPE = 'atproto transition:generic';

const auth = new AuthClient();
let authUser = null;

let subs = loadLocal();     // [{ url, title, rkey? }]
let active = null;          // active feed url
const cache = {};           // url -> parsed feed

// ---- boot ------------------------------------------------------------------
(async function init() {
  const add = new URLSearchParams(location.search).get('add');
  if (!subs.length) subs.push({ url: COMMUNAL, title: 'minomobi · all shows' });
  if (add) addLocal(add, add, true);
  saveLocal();
  renderSubs();
  selectFeed(active || (subs[0] && subs[0].url));

  try { authUser = await auth.init(); } catch (_) {}
  updateSyncUi();
  if (authUser) syncFromPds();
})();

$('addBtn').addEventListener('click', onAdd);
$('addUrl').addEventListener('keydown', (e) => { if (e.key === 'Enter') onAdd(); });
$('syncBtn').addEventListener('click', () => {
  if (authUser) { auth.logout().then(() => location.reload()); return; }
  $('authRow').style.display = $('authRow').style.display === 'none' ? 'flex' : 'none';
});
$('authBtn').addEventListener('click', signIn);
$('authHandle').addEventListener('keydown', (e) => { if (e.key === 'Enter') signIn(); });

async function onAdd() {
  const v = $('addUrl').value.trim();
  if (!v) return;
  let url;
  try { url = new URL(v, location.href).toString(); }
  catch { return showErr('That doesn’t look like a URL.'); }
  hideErr();
  $('addUrl').value = '';
  addLocal(url, url, false);
  saveLocal();
  renderSubs();
  selectFeed(url);
  if (authUser) { try { await pdsPut(url, url); } catch (e) { showErr('Saved locally, but PDS sync failed: ' + (e.message || e)); } }
}

async function signIn() {
  const handle = $('authHandle').value.trim();
  if (!handle) return;
  try { await auth.login(handle, { scope: SCOPE }); } // redirects back here
  catch (e) { showErr(e.message || String(e)); }
}

// ---- subscription store ----------------------------------------------------
function loadLocal() { try { return JSON.parse(localStorage.getItem(SUBS_KEY)) || []; } catch { return []; } }
function saveLocal() { localStorage.setItem(SUBS_KEY, JSON.stringify(subs)); }
function addLocal(url, title, setActive) {
  const ex = subs.find((s) => s.url === url);
  if (!ex) subs.push({ url, title });
  if (setActive) active = url;
}
function removeLocal(url) { subs = subs.filter((s) => s.url !== url); }

async function removeSub(url) {
  const sub = subs.find((s) => s.url === url);
  removeLocal(url);
  saveLocal();
  if (active === url) { active = null; selectFeed(subs[0] && subs[0].url); }
  renderSubs();
  if (authUser) { try { await auth.pds.deleteRecord(COLLECTION, sub.rkey || rkeyFor(url)); } catch (_) {} }
}

// Merge local + PDS, then treat the PDS as source of truth. Any local-only feed
// (e.g. added before signing in) is pushed up so it follows you to other devices.
async function syncFromPds() {
  let remote = [];
  try {
    const res = await auth.pds.listRecords(COLLECTION, 100);
    remote = (res.records || []).map((r) => ({ url: r.value.url, title: r.value.title || r.value.url, rkey: rkeyOf(r.uri) }));
  } catch (_) { updateSyncUi('PDS sync unavailable.'); return; }

  const remoteUrls = new Set(remote.map((r) => r.url));
  const localOnly = subs.filter((s) => !remoteUrls.has(s.url) && s.url !== COMMUNAL);
  for (const s of localOnly) { try { await pdsPut(s.url, s.title); } catch (_) {} }

  // union: remote ∪ pushed local-only, keeping the communal seed visible
  const byUrl = new Map();
  for (const s of subs.filter((x) => x.url === COMMUNAL)) byUrl.set(s.url, s);
  for (const s of remote) byUrl.set(s.url, s);
  for (const s of localOnly) byUrl.set(s.url, { ...s, rkey: rkeyFor(s.url) });
  subs = [...byUrl.values()];
  saveLocal();
  renderSubs();
  updateSyncUi();
}

async function pdsPut(url, title) {
  await auth.pds.putRecord(COLLECTION, rkeyFor(url), {
    $type: COLLECTION, url, title: title || url, createdAt: new Date().toISOString(),
  });
}

// ---- ui: sync + saved list -------------------------------------------------
function updateSyncUi(override) {
  const bar = $('syncBar');
  if (authUser) {
    bar.classList.add('synced');
    $('syncState').textContent = override || `Synced to @${authUser.handle || authUser.did}’s PDS.`;
    $('syncBtn').textContent = 'Sign out';
    $('authRow').style.display = 'none';
  } else {
    bar.classList.remove('synced');
    $('syncState').textContent = override || 'Saved on this device. Sign in to sync across devices.';
    $('syncBtn').textContent = 'Sign in to sync';
  }
}

function renderSubs() {
  $('subsCount').textContent = subs.length ? `${subs.length} feed${subs.length === 1 ? '' : 's'}` : '';
  $('subsList').innerHTML = subs.map((s) => `
    <div class="srow ${s.url === active ? 'active' : ''}" data-url="${esc(s.url)}">
      <span class="st">${esc(s.title || s.url)}</span>
      <button class="rm" data-x="${esc(s.url)}" title="Remove">✕</button>
    </div>`).join('');
  $('subsList').querySelectorAll('.srow').forEach((el) => {
    el.addEventListener('click', (e) => {
      if (e.target.classList.contains('rm')) { removeSub(el.dataset.url); return; }
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
  if (sub && feed.title && sub.title !== feed.title) {
    sub.title = feed.title; saveLocal(); renderSubs();
    if (authUser) { try { await pdsPut(url, feed.title); } catch (_) {} }
  }
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
// Deterministic rkey per feed URL (FNV-1a hex) so the same feed is one record.
function rkeyFor(url) {
  let h = 0x811c9dc5;
  for (let i = 0; i < url.length; i++) { h ^= url.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return 'u' + (h >>> 0).toString(16).padStart(8, '0');
}
function rkeyOf(uri) { return uri.split('/').pop(); }
function childText(el, tag) { const n = el.querySelector(tag); return n ? n.textContent.trim() : ''; }
function nsEl(el, qname) { return el.getElementsByTagName(qname)[0] || null; }
function nsText(el, qname) { const n = nsEl(el, qname); return n ? n.textContent.trim() : ''; }
function stripHtml(s) { return String(s).replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim(); }
function fmtDur(d) {
  if (!d) return '';
  if (/^\d+$/.test(d)) { const s = +d, m = Math.floor(s / 60); return `${m}:${String(s % 60).padStart(2, '0')}`; }
  return d;
}
function esc(s) { return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
function showErr(m) { $('addErr').textContent = m; $('addErr').style.display = ''; }
function hideErr() { $('addErr').style.display = 'none'; }

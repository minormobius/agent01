// pod/listen — the feed player. Lists published episodes from /api/episodes and
// plays the worker's stitched /enclosure URL in a sticky bottom player.

const $ = (id) => document.getElementById(id);

// Per-publisher view when ?handle=/?did= is present: the feed + episode list are
// sourced from that user's PDS, and the RSS URL is their PDS-owned feed.
const params = new URLSearchParams(location.search);
const who = params.get('handle') || params.get('did');
const RSS = who
  ? `https://pod.mino.mobi/u/${encodeURIComponent(who)}/feed.xml`
  : 'https://pod.mino.mobi/feed.xml';
const API = who ? `/api/episodes?handle=${encodeURIComponent(who)}` : '/api/episodes';

function esc(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}
function fmtDur(sec) {
  sec = Math.round(sec || 0);
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  const p = (n) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${p(m)}:${p(s)}` : `${m}:${p(s)}`;
}

$('rssUrl').textContent = RSS;
$('copyRss').addEventListener('click', () => {
  navigator.clipboard.writeText(RSS).then(() => {
    $('copyRss').textContent = 'Copied';
    setTimeout(() => { $('copyRss').textContent = 'Copy'; }, 1500);
  });
});

// Per-publisher header (name + avatar from their Bluesky profile).
if (who) {
  $('rssLbl').textContent = 'Subscribe to this show (RSS)';
  $('crumbWho').textContent = ' / show';
  $('title').textContent = '@' + who.replace(/^@/, '');
  $('pageSub').textContent = 'This show lives on the publisher’s PDS. Subscribe in any podcast app.';
  fetch(`https://public.api.bsky.app/xrpc/app.bsky.actor.getProfile?actor=${encodeURIComponent(who)}`)
    .then((r) => (r.ok ? r.json() : null))
    .then((p) => {
      if (!p) return;
      $('title').textContent = p.displayName || '@' + (p.handle || who);
      const bits = ['@' + (p.handle || who)];
      if (p.description) bits.push(p.description.split('\n')[0]);
      $('pageSub').textContent = bits.join(' · ');
    })
    .catch(() => {});
}

let episodes = [];

fetch(API)
  .then((r) => r.json())
  .then(({ items }) => { episodes = items || []; render(); })
  .catch(() => { $('episodes').innerHTML = '<p class="empty">Feed unavailable.</p>'; });

function render() {
  if (!episodes.length) {
    $('episodes').innerHTML = who
      ? '<p class="empty">This show has no episodes yet.</p>'
      : '<p class="empty">No episodes published yet. Record one in <a href="/room/">/room</a>, edit it in <a href="/prod/">/prod</a>, then publish.</p>';
    return;
  }
  $('episodes').innerHTML = episodes
    .map((e, i) => {
      const dur = e.duration_sec ? fmtDur(e.duration_sec) : '';
      const date = e.pub_date ? new Date(e.pub_date).toLocaleDateString() : '';
      const meta = [dur, date].filter(Boolean).join(' · ');
      return `<div class="ep" data-i="${i}">
        <div class="play">▶</div>
        <div class="meta">
          <div class="t">${esc(e.title || 'Untitled')}</div>
          ${e.description ? `<div class="d">${esc(e.description)}</div>` : ''}
          ${meta ? `<div class="sub2">${esc(meta)}</div>` : ''}
        </div>
      </div>`;
    })
    .join('');
  $('episodes').querySelectorAll('.ep').forEach((el) => {
    el.addEventListener('click', () => play(+el.dataset.i));
  });
}

function play(i) {
  const e = episodes[i];
  if (!e || !e.audio_url) return;
  const audio = $('audio');
  audio.src = e.audio_url;
  audio.play().catch(() => {});
  $('pTitle').textContent = e.title || 'Untitled';
  $('player').classList.add('on');
  document.querySelectorAll('.ep').forEach((el, k) => el.classList.toggle('playing', k === i));
  document.querySelectorAll('.ep .play').forEach((el, k) => { el.textContent = k === i ? '❚❚' : '▶'; });
}

// reflect play/pause from the native control back onto the list
$('audio').addEventListener('play', () => syncIcons(true));
$('audio').addEventListener('pause', () => syncIcons(false));
function syncIcons(playing) {
  const active = document.querySelector('.ep.playing .play');
  if (active) active.textContent = playing ? '❚❚' : '▶';
}

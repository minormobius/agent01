// pod/listen — a per-show viewer. With ?handle=/?did=, the episode list + RSS URL
// are sourced entirely from that publisher's PDS. With no handle, it's just a
// box to enter one — there is no global feed, by design.

const $ = (id) => document.getElementById(id);
const who = new URLSearchParams(location.search).get('handle')
  || new URLSearchParams(location.search).get('did');

function esc(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}
function fmtDur(sec) {
  sec = Math.round(sec || 0);
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  const p = (n) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${p(m)}:${p(s)}` : `${m}:${p(s)}`;
}
function goHandle() {
  const h = $('handleInput').value.trim().replace(/^@/, '');
  if (h) location.search = '?handle=' + encodeURIComponent(h);
}

let episodes = [];

if (!who) {
  // No show selected — show the handle-entry box only.
  $('handleBox').style.display = '';
  $('goHandle').addEventListener('click', goHandle);
  $('handleInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') goHandle(); });
} else {
  const RSS = `https://pod.mino.mobi/u/${encodeURIComponent(who)}/feed.xml`;
  $('subscribeBox').style.display = '';
  $('rssUrl').textContent = RSS;
  $('rssOpen').href = RSS;
  $('copyRss').addEventListener('click', () => {
    navigator.clipboard.writeText(RSS).then(() => {
      $('copyRss').textContent = 'Copied';
      setTimeout(() => { $('copyRss').textContent = 'Copy'; }, 1500);
    });
  });
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

  $('episodes').innerHTML = '<p class="empty">Loading…</p>';
  fetch(`/api/episodes?handle=${encodeURIComponent(who)}`)
    .then((r) => r.json())
    .then(({ items }) => { episodes = items || []; render(); })
    .catch(() => { $('episodes').innerHTML = '<p class="empty">Feed unavailable.</p>'; });
}

function render() {
  if (!episodes.length) {
    $('episodes').innerHTML = '<p class="empty">This show has no episodes yet.</p>';
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

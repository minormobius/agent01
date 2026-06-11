// pod/shows — discovery directory. Lists distinct publishers from the communal
// feed (/api/shows), hydrates each with their Bluesky profile, and links to the
// PDS-owned feed + the in-house app.

const $ = (id) => document.getElementById(id);
function esc(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

fetch('/api/shows')
  .then((r) => r.json())
  .then(({ shows }) => render(shows || []))
  .catch(() => { $('shows').innerHTML = '<p class="empty">Couldn’t load shows.</p>'; });

async function render(shows) {
  if (!shows.length) {
    $('shows').innerHTML =
      '<p class="empty">No shows yet. Be the first — record in <a href="/room/">/room</a>, edit in <a href="/prod/">/prod</a>, and publish.</p>';
    return;
  }
  // Render skeletons immediately, then hydrate each with its profile.
  $('shows').innerHTML = shows.map(skeleton).join('');
  shows.forEach(hydrate);
}

function skeleton(s) {
  const feed = `https://pod.mino.mobi/u/${encodeURIComponent(s.did)}/feed.xml`;
  const add = `/app/?add=${encodeURIComponent(feed)}`;
  return `<div class="show" id="s-${cssId(s.did)}">
    <img src="" alt="" loading="lazy" />
    <div class="meta">
      <div class="nm">…</div>
      <div class="hd">${esc(s.did)}</div>
      <div class="ct">${s.episodes} episode${s.episodes == 1 ? '' : 's'}${s.latest ? ' · ' + new Date(s.latest).toLocaleDateString() : ''}</div>
      <div class="acts">
        <a class="primary" href="/listen?handle=${encodeURIComponent(s.did)}">Listen</a>
        <a href="${esc(add)}">Add to app</a>
        <a href="${esc(feed)}">RSS</a>
      </div>
    </div>
  </div>`;
}

async function hydrate(s) {
  try {
    const res = await fetch(`https://public.api.bsky.app/xrpc/app.bsky.actor.getProfile?actor=${encodeURIComponent(s.did)}`);
    if (!res.ok) return;
    const p = await res.json();
    const el = $(`s-${cssId(s.did)}`);
    if (!el) return;
    if (p.avatar) el.querySelector('img').src = p.avatar;
    el.querySelector('.nm').textContent = p.displayName || '@' + p.handle;
    el.querySelector('.hd').textContent = '@' + p.handle;
  } catch (_) { /* leave skeleton */ }
}

function cssId(did) { return did.replace(/[^a-zA-Z0-9]/g, '_'); }

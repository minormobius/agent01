// hovercard.js — hover previews for Bluesky posts and profiles.
//
// Any link to a post shows the post; any link to a profile shows the profile.
// Dependency-free, delegated from document, so it covers links that are drawn
// later (every lathe view re-renders its output) without re-attaching anything.
//
//   <script src="/lib/hovercard.js"></script>   // that's it — it self-attaches
//
// Post links should carry data-uri="at://…" when the at-URI is known (the caller
// almost always has it); otherwise the at-URI is reconstructed from the bsky.app
// URL, which needs the actor resolved first. Profile links need nothing.
//
// Desktop only by design: it triggers on hover, and on touch a long-press that
// opens a card would fight the tap that follows the link.
(function () {
  const PUB = 'https://public.api.bsky.app/xrpc';
  const DELAY = 220;      // ms of hovering before we bother the network
  const HIDE = 140;       // grace period so the pointer can travel into the card
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  let styled = false;
  function ensureStyle() {
    if (styled) return; styled = true;
    const st = document.createElement('style');
    st.textContent = `
.hovercard{position:fixed;z-index:3000;width:340px;max-width:calc(100vw - 24px);background:var(--panel,#fff);
  color:var(--text,#111);border:1px solid var(--rule,#ccc);border-radius:10px;box-shadow:0 10px 34px rgba(0,0,0,.22);
  padding:.7rem .8rem;font-family:var(--serif,Georgia,serif);font-size:.86rem;line-height:1.45;pointer-events:auto}
.hovercard .hc-top{display:flex;gap:.5rem;align-items:center;margin-bottom:.4rem}
.hovercard img.hc-av{width:38px;height:38px;border-radius:50%;object-fit:cover;background:var(--rule,#ccc);flex:none}
.hovercard .hc-name{font-weight:600;font-size:.9rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.hovercard .hc-handle{font-family:var(--mono,monospace);font-size:.7rem;color:var(--muted,#777);
  overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.hovercard .hc-body{white-space:pre-wrap;overflow-wrap:anywhere;max-height:9.5rem;overflow:hidden}
.hovercard .hc-imgs{display:flex;gap:.25rem;margin-top:.45rem}
.hovercard .hc-imgs img{width:56px;height:56px;object-fit:cover;border-radius:5px;background:var(--rule,#ccc)}
.hovercard .hc-meta{font-family:var(--mono,monospace);font-size:.66rem;color:var(--muted,#777);
  margin-top:.5rem;display:flex;gap:.8rem;flex-wrap:wrap}
.hovercard .hc-load{font-family:var(--mono,monospace);font-size:.72rem;color:var(--muted,#777)}
@media (hover:none){.hovercard{display:none}}`;
    document.head.appendChild(st);
  }

  const cache = new Map();
  let card = null, timer = null, hideTimer = null, overCard = false, current = null;

  function place(x, y) {
    if (!card) return;
    const w = card.offsetWidth || 340, h = card.offsetHeight || 140;
    let left = x + 16, top = y + 16;
    if (left + w > window.innerWidth - 10) left = Math.max(10, x - w - 16);
    if (top + h > window.innerHeight - 10) top = Math.max(10, y - h - 16);
    card.style.left = left + 'px';
    card.style.top = top + 'px';
  }
  function show(html, x, y) {
    ensureStyle();
    if (!card) {
      card = document.createElement('div');
      card.className = 'hovercard';
      card.addEventListener('mouseenter', () => { overCard = true; clearTimeout(hideTimer); });
      card.addEventListener('mouseleave', () => { overCard = false; scheduleHide(); });
      document.body.appendChild(card);
    }
    card.innerHTML = html;
    card.style.display = 'block';
    place(x, y);
  }
  function scheduleHide() {
    clearTimeout(hideTimer);
    hideTimer = setTimeout(() => {
      if (overCard) return;
      if (card) card.style.display = 'none';
      current = null;
    }, HIDE);
  }

  // ── what is this link? ──────────────────────────────────────────────────────
  function classify(a) {
    const uri = a.getAttribute('data-uri');
    if (uri && uri.startsWith('at://')) return { kind: 'post', key: 'p:' + uri, uri };
    const href = a.getAttribute('href') || '';
    const m = /^https?:\/\/bsky\.app\/profile\/([^/?#]+)(?:\/post\/([^/?#]+))?/.exec(href);
    if (!m) return null;
    const actor = decodeURIComponent(m[1]);
    if (m[2]) return { kind: 'post', key: `p:${actor}/${m[2]}`, actor, rkey: m[2] };
    return { kind: 'profile', key: 'a:' + actor, actor };
  }

  async function jget(url) {
    const r = await fetch(url);
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return r.json();
  }
  async function resolveActor(actor) {
    if (actor.startsWith('did:')) return actor;
    const k = 'did:' + actor;
    if (cache.has(k)) return cache.get(k);
    const d = await jget(`${PUB}/com.atproto.identity.resolveHandle?handle=${encodeURIComponent(actor)}`);
    cache.set(k, d.did);
    return d.did;
  }

  async function loadProfile(actor) {
    const p = await jget(`${PUB}/app.bsky.actor.getProfile?actor=${encodeURIComponent(actor)}`);
    return renderProfile(p);
  }
  function renderProfile(p) {
    return `<div class="hc-top">` +
      (p.avatar ? `<img class="hc-av" src="${esc(p.avatar)}" alt="">` : '<span class="hc-av"></span>') +
      `<div style="min-width:0"><div class="hc-name">${esc(p.displayName || p.handle)}</div>` +
      `<div class="hc-handle">@${esc(p.handle)}</div></div></div>` +
      (p.description ? `<div class="hc-body">${esc(String(p.description).slice(0, 260))}</div>` : '') +
      `<div class="hc-meta"><span><b>${(p.followersCount || 0).toLocaleString()}</b> followers</span>` +
      `<span><b>${(p.followsCount || 0).toLocaleString()}</b> following</span>` +
      `<span><b>${(p.postsCount || 0).toLocaleString()}</b> posts</span></div>`;
  }

  async function loadPost(info) {
    let uri = info.uri;
    if (!uri) uri = `at://${await resolveActor(info.actor)}/app.bsky.feed.post/${info.rkey}`;
    const d = await jget(`${PUB}/app.bsky.feed.getPosts?uris=${encodeURIComponent(uri)}`);
    const p = (d.posts || [])[0];
    if (!p) throw new Error('not found');
    const a = p.author || {}, rec = p.record || {};
    const imgs = ((p.embed && (p.embed.images || (p.embed.media && p.embed.media.images))) || []).slice(0, 4);
    const when = rec.createdAt ? new Date(rec.createdAt).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : '';
    return `<div class="hc-top">` +
      (a.avatar ? `<img class="hc-av" src="${esc(a.avatar)}" alt="">` : '<span class="hc-av"></span>') +
      `<div style="min-width:0"><div class="hc-name">${esc(a.displayName || a.handle || '')}</div>` +
      `<div class="hc-handle">@${esc(a.handle || '')}${when ? ' · ' + esc(when) : ''}</div></div></div>` +
      `<div class="hc-body">${esc(String(rec.text || '').slice(0, 420))}</div>` +
      (imgs.length ? `<div class="hc-imgs">${imgs.map((im) => `<img src="${esc(im.thumb)}" alt="">`).join('')}</div>` : '') +
      `<div class="hc-meta"><span><b>${(p.likeCount || 0).toLocaleString()}</b> likes</span>` +
      `<span><b>${(p.repostCount || 0).toLocaleString()}</b> reposts</span>` +
      `<span><b>${(p.replyCount || 0).toLocaleString()}</b> replies</span></div>`;
  }

  // ── delegated hover ─────────────────────────────────────────────────────────
  document.addEventListener('mouseover', (e) => {
    const a = e.target.closest && e.target.closest('a');
    if (!a) return;
    const info = classify(a);
    if (!info) return;
    if (current === info.key) { clearTimeout(hideTimer); return; }
    clearTimeout(timer);
    const x = e.clientX, y = e.clientY;
    timer = setTimeout(async () => {
      current = info.key;
      if (cache.has(info.key)) { show(cache.get(info.key), x, y); return; }
      show('<div class="hc-load">loading…</div>', x, y);
      try {
        const html = info.kind === 'post' ? await loadPost(info) : await loadProfile(info.actor);
        cache.set(info.key, html);
        if (current === info.key) { show(html, x, y); }
      } catch (err) {
        if (current === info.key) show('<div class="hc-load">couldn’t load that preview</div>', x, y);
      }
    }, DELAY);
  });
  document.addEventListener('mouseout', (e) => {
    const a = e.target.closest && e.target.closest('a');
    if (!a) return;
    clearTimeout(timer);
    scheduleHide();
  });
  document.addEventListener('mousemove', (e) => {
    if (card && card.style.display === 'block' && !overCard) place(e.clientX, e.clientY);
  }, { passive: true });
  window.addEventListener('scroll', () => { if (card) card.style.display = 'none'; current = null; }, { passive: true });

  window.hovercard = { cache, classify };
})();

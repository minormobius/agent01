// b/tetr — Bluesky threads fall as hex pieces; slide them as the structure
// descends and build a tower. Each piece is a real thread quantized onto a hex
// grid: root post -> a cell, each reply -> an adjacent hex (the threadbeast,
// gridded). Source: our SimCluster feed by default; ?list=<bsky list url> to
// bring your own. Fully client-side + unauthed (feed skeleton + getPostThread).

const FEED_SKELETON = 'https://feed.mino.mobi/xrpc/app.bsky.feed.getFeedSkeleton';
const SIMCLUSTER = 'at://did:plc:oqyev6xmuwgbtpr6jgxh5xg3/app.bsky.feed.generator/simcluster';
const PUB = 'https://public.api.bsky.app/xrpc';
const SQRT3 = Math.sqrt(3);
const DIRS = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]]; // flat-top axial neighbors

const COLS = 7, R_FLOOR = 14, MAX_CELLS = 7;
const FALL_MS = 900;

const canvas = document.getElementById('tetr');
const ctx = canvas.getContext('2d');
const elScore = document.getElementById('t-score');
const elPlaced = document.getElementById('t-placed');
const elHeight = document.getElementById('t-height');
const elStatus = document.getElementById('t-status');
const elPanel = document.getElementById('t-panel');

const params = new URLSearchParams(location.search);
const listInput = params.get('list');

// ── source: a stream of thread polyhex pieces ───────────────────────────────
let feedCursor = null, uriQueue = [], pieceQueue = [], filling = false;

async function xrpc(base, method, p = {}) {
  const u = new URL(`${base}/${method}`);
  for (const k in p) if (p[k] != null && p[k] !== '') u.searchParams.set(k, p[k]);
  const r = await fetch(u.toString());
  if (!r.ok) throw new Error(`${method} ${r.status}`);
  return r.json();
}
async function resolveListUri(s) {
  const v = (s || '').trim();
  if (v.startsWith('at://')) return v;
  const m = v.match(/\/profile\/([^/]+)\/lists\/([^/?#]+)/);
  if (!m) return v;
  let actor = decodeURIComponent(m[1]);
  if (!actor.startsWith('did:')) actor = (await xrpc(PUB, 'com.atproto.identity.resolveHandle', { handle: actor })).did;
  return `at://${actor}/app.bsky.graph.list/${m[2]}`;
}
async function refillUris() {
  if (listInput) {
    const list = await resolveListUri(listInput);
    const r = await xrpc(PUB, 'app.bsky.feed.getListFeed', { list, limit: 50, cursor: feedCursor });
    feedCursor = r.cursor; uriQueue.push(...(r.feed || []).map((fi) => fi.post && fi.post.uri).filter(Boolean));
  } else {
    const u = new URL(FEED_SKELETON);
    u.searchParams.set('feed', SIMCLUSTER); u.searchParams.set('limit', '30');
    if (feedCursor) u.searchParams.set('cursor', feedCursor);
    const r = await (await fetch(u.toString())).json();
    feedCursor = r.cursor; uriQueue.push(...(r.feed || []).map((x) => x.post).filter(Boolean));
  }
}
async function nextPiece() {
  for (let tries = 0; tries < 40; tries++) {
    if (!uriQueue.length) { try { await refillUris(); } catch (_) {} if (!uriQueue.length) return null; }
    const uri = uriQueue.shift();
    try {
      const r = await xrpc(PUB, 'app.bsky.feed.getPostThread', { uri, depth: 8 });
      const p = threadToPiece(r.thread);
      if (p) return p;
    } catch (_) {}
  }
  return null;
}
async function keepFilled() {
  if (filling) return; filling = true;
  while (pieceQueue.length < 4) { const p = await nextPiece(); if (!p) break; pieceQueue.push(p); if (!piece && !over) spawnNext(); }
  filling = false;
}

// ── thread -> connected polyhex (BFS onto the hex grid) ─────────────────────
function threadToPiece(root) {
  if (!root || !root.post) return null;
  const occ = new Set(['0,0']);
  const cells = [{ q: 0, r: 0, post: root.post }];
  const queue = [{ node: root, q: 0, r: 0 }];
  while (queue.length && cells.length < MAX_CELLS) {
    const { node, q, r } = queue.shift();
    const kids = (node.replies || []).filter((x) => x && x.post);
    for (const kid of kids) {
      if (cells.length >= MAX_CELLS) break;
      for (const [dq, dr] of DIRS) {
        const nq = q + dq, nr = r + dr, key = nq + ',' + nr;
        if (!occ.has(key)) { occ.add(key); cells.push({ q: nq, r: nr, post: kid.post }); queue.push({ node: kid, q: nq, r: nr }); break; }
      }
    }
  }
  return { cells, root: root.post };
}

// ── game state ──────────────────────────────────────────────────────────────
let occupied = new Map(); // "q,r" -> { post }
let piece = null;         // { cells:[{q,r,post}], aq, ar, root }
let score = 0, placed = 0, over = false, started = false, timer = 0;
const avatars = new Map();

function absCells(pc, dq = 0, dr = 0) {
  return pc.cells.map((c) => ({ q: pc.aq + c.q + dq, r: pc.ar + c.r + dr, post: c.post }));
}
function collides(pc, dq, dr) {
  for (const c of absCells(pc, dq, dr)) {
    if (c.q < 0 || c.q >= COLS || c.r > R_FLOOR) return true;
    if (occupied.has(c.q + ',' + c.r)) return true;
  }
  return false;
}
function spawn(p) {
  const minr = Math.min(...p.cells.map((c) => c.r));
  const minq = Math.min(...p.cells.map((c) => c.q));
  const maxq = Math.max(...p.cells.map((c) => c.q));
  const cells = p.cells.map((c) => ({ q: c.q - minq, r: c.r - minr, post: c.post }));
  piece = { cells, aq: Math.max(0, Math.floor((COLS - 1 - (maxq - minq)) / 2)), ar: -1, root: p.root };
  loadAvatars(cells);
  if (collides(piece, 0, 0)) { over = true; setStatus('topped out — press R to restart'); }
}
function spawnNext() { if (pieceQueue.length) { spawn(pieceQueue.shift()); keepFilled(); } else keepFilled(); }
function rot60(c) { return { q: -c.r, r: c.q + c.r, post: c.post }; }

function move(dq) { if (piece && !over && !collides(piece, dq, 0)) { piece.aq += dq; render(); } }
function rotate() {
  if (!piece || over) return;
  const rc = piece.cells.map(rot60);
  const test = { ...piece, cells: rc };
  if (!collides(test, 0, 0)) { piece.cells = rc; render(); }
}
function softDrop() { if (!piece || over) return; if (!collides(piece, 0, 1)) { piece.ar++; } else lock(); render(); }
function hardDrop() { if (!piece || over) return; let d = 0; while (!collides(piece, 0, d + 1)) d++; piece.ar += d; lock(); render(); }

function tick() { if (over || !started || !piece) return; if (!collides(piece, 0, 1)) piece.ar++; else lock(); render(); }

function heightScore() {
  let m = R_FLOOR + 1;
  for (const k of occupied.keys()) { const r = parseInt(k.split(',')[1], 10); if (r < m) m = r; }
  return Math.max(0, R_FLOOR - m + 1);
}
function lock() {
  let topOut = false;
  for (const c of absCells(piece)) {
    occupied.set(c.q + ',' + c.r, { post: c.post });
    if (c.r < 0) topOut = true;
  }
  placed += piece.cells.length;
  score = placed + heightScore() * 3;
  piece = null;
  elPlaced.textContent = placed;
  elHeight.textContent = heightScore();
  elScore.textContent = score;
  if (topOut) { over = true; setStatus('topped out — press R to restart'); return; }
  spawnNext();
}

function reset() {
  occupied = new Map(); piece = null; score = 0; placed = 0; over = false; started = true;
  elScore.textContent = '0'; elPlaced.textContent = '0'; elHeight.textContent = '0';
  setStatus('');
  pieceQueue = []; uriQueue = []; feedCursor = null;
  keepFilled();
}

// ── rendering ────────────────────────────────────────────────────────────────
let S = 22, OX = 26, OY = 26;
function resize() {
  const maxW = Math.min(window.innerWidth - 24, 560);
  const maxH = window.innerHeight - 150;
  const sW = maxW / (1.5 * COLS + 0.6);
  const sH = maxH / (SQRT3 * (R_FLOOR + (COLS - 1) / 2 + 2.5));
  S = Math.max(10, Math.min(sW, sH));
  OX = S + 4; OY = S * SQRT3 * 1.2;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const cw = 1.5 * S * (COLS - 1) + 2 * S + 8;
  const ch = SQRT3 * S * (R_FLOOR + (COLS - 1) / 2 + 2.5) + 8;
  canvas.width = cw * dpr; canvas.height = ch * dpr;
  canvas.style.width = cw + 'px'; canvas.style.height = ch + 'px';
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  render();
}
function center(q, r) { return { x: OX + 1.5 * S * q, y: OY + SQRT3 * S * (r + q / 2) }; }
function hexPath(cx, cy) {
  ctx.beginPath();
  for (let i = 0; i < 6; i++) { const a = Math.PI / 180 * (60 * i); const x = cx + S * Math.cos(a), y = cy + S * Math.sin(a); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
  ctx.closePath();
}
function hue(did) { let h = 0; for (let i = 0; i < (did || '').length; i++) h = (h * 31 + did.charCodeAt(i)) % 360; return h; }
function drawCell(q, r, post, active) {
  const { x, y } = center(q, r);
  const did = post && post.author && post.author.did;
  hexPath(x, y);
  ctx.fillStyle = `hsl(${hue(did)} ${active ? 70 : 55}% ${active ? 52 : 38}%)`;
  ctx.fill();
  const av = did && avatars.get(did);
  if (av) { ctx.save(); hexPath(x, y); ctx.clip(); ctx.globalAlpha = active ? 1 : 0.85; ctx.drawImage(av, x - S, y - S, 2 * S, 2 * S); ctx.restore(); }
  ctx.lineWidth = 1.5; ctx.strokeStyle = active ? 'rgba(255,255,255,0.85)' : 'rgba(10,18,32,0.6)'; hexPath(x, y); ctx.stroke();
}
function render() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  // faint grid columns
  for (let q = 0; q < COLS; q++) for (let r = 0; r <= R_FLOOR; r++) { const { x, y } = center(q, r); hexPath(x, y); ctx.fillStyle = 'rgba(120,160,220,0.04)'; ctx.fill(); ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(120,160,220,0.08)'; ctx.stroke(); }
  for (const [k, v] of occupied) { const [q, r] = k.split(',').map(Number); if (r >= -1) drawCell(q, r, v.post, false); }
  if (piece) for (const c of absCells(piece)) drawCell(c.q, c.r, c.post, true);
}
function loadAvatars(cells) {
  for (const c of cells) {
    const a = c.post && c.post.author; const did = a && a.did;
    if (!did || avatars.has(did) || !a.avatar) continue;
    avatars.set(did, null);
    // No crossOrigin: Bluesky's avatar CDN serves no CORS headers, so setting it
    // would block the load. We only drawImage (never read pixels back), so a
    // tainted canvas is fine.
    const img = new Image();
    img.onload = () => { avatars.set(did, img); render(); };
    img.onerror = () => {};
    img.src = a.avatar;
  }
}
function setStatus(m) { elStatus.textContent = m || ''; elStatus.style.display = m ? 'block' : 'none'; }

// ── input ─────────────────────────────────────────────────────────────────
function start() { if (started) return; started = true; setStatus(''); keepFilled(); }
addEventListener('keydown', (e) => {
  if (['ArrowLeft', 'ArrowRight', 'ArrowDown', 'ArrowUp', ' '].includes(e.key)) e.preventDefault();
  if (e.key === 'r' || e.key === 'R') return reset();
  if (!started) start();
  if (e.key === 'ArrowLeft') move(-1);
  else if (e.key === 'ArrowRight') move(1);
  else if (e.key === 'ArrowDown') softDrop();
  else if (e.key === 'ArrowUp' || e.key === 'x') rotate();
  else if (e.key === ' ') hardDrop();
});
document.querySelectorAll('[data-act]').forEach((b) => b.addEventListener('click', () => {
  if (!started) start();
  const a = b.getAttribute('data-act');
  ({ left: () => move(-1), right: () => move(1), rot: rotate, drop: hardDrop, soft: softDrop, restart: reset }[a] || (() => {}))();
}));
// tap a heap hex -> show the post
canvas.addEventListener('pointerdown', (e) => {
  const rect = canvas.getBoundingClientRect();
  const px = e.clientX - rect.left, py = e.clientY - rect.top;
  let best = null, bd = S * S;
  for (const [k, v] of occupied) { const [q, r] = k.split(',').map(Number); const c = center(q, r); const d = (c.x - px) ** 2 + (c.y - py) ** 2; if (d < bd) { bd = d; best = v; } }
  if (best && best.post) showPost(best.post); else hidePost();
});
function showPost(p) {
  const a = p.author || {};
  elPanel.innerHTML = `<button id="t-panel-x">✕</button><div class="t-p-head"><b>${esc(a.displayName || a.handle || '')}</b> <span>@${esc(a.handle || '')}</span></div><div class="t-p-text">${esc((p.record && p.record.text) || '')}</div><a href="https://bsky.app/profile/${esc(a.handle || a.did)}/post/${esc((p.uri || '').split('/').pop())}" target="_blank" rel="noopener">open on Bluesky ↗</a>`;
  elPanel.style.display = 'block';
  document.getElementById('t-panel-x').onclick = hidePost;
}
function hidePost() { elPanel.style.display = 'none'; }
function esc(s) { return (s || '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

addEventListener('resize', resize, { passive: true });
resize();
timer = setInterval(tick, FALL_MS);
setStatus(listInput ? 'press any key / tap a button to start (your list)' : 'press any key / tap a button to start');
keepFilled();

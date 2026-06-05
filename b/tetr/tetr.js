// b/tetr — Bluesky threads fall as pointy-top hex pieces; slide them and stack.
// Each piece is a real thread quantized onto a hex grid (getPostThread -> tree ->
// BFS onto cells). Geometry: pieces are RIGID in cube coords, the field is odd-r
// OFFSET (upright rectangle with real horizontal rows), so we get proper line
// clears and pieces that nestle a half-hex as they fall without distorting.
// Source: our SimCluster feed by default; ?list=<bsky list url> for your own.

const FEED_SKELETON = 'https://feed.mino.mobi/xrpc/app.bsky.feed.getFeedSkeleton';
const SIMCLUSTER = 'at://did:plc:oqyev6xmuwgbtpr6jgxh5xg3/app.bsky.feed.generator/simcluster';
const PUB = 'https://public.api.bsky.app/xrpc';
const SQRT3 = Math.sqrt(3);
const DIRS = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]]; // axial neighbors (piece build)

const COLS = 8, ROWS = 18, MAX_CELLS = 7;
const FALL_MS = 900;

const canvas = document.getElementById('tetr');
const ctx = canvas.getContext('2d');
const elScore = document.getElementById('t-score');
const elPlaced = document.getElementById('t-placed');
const elHeight = document.getElementById('t-height');
const elLines = document.getElementById('t-lines');
const elStatus = document.getElementById('t-status');
const elPanel = document.getElementById('t-panel');

const params = new URLSearchParams(location.search);
const listInput = params.get('list');

// ── hex math: odd-q offset <-> cube; offset -> pixel (flat-top, upright) ──────
const parity = (n) => ((n % 2) + 2) % 2;
function offsetToCube(col, row) { const x = col, z = row - (col - parity(col)) / 2; return { x, y: -x - z, z }; }
function cubeToOffset(c) { return { col: c.x, row: c.z + (c.x - parity(c.x)) / 2 }; }
function offsetToPixel(col, row) { return { x: OX + 1.5 * S * col, y: OY + SQRT3 * S * (row + 0.5 * parity(col)) }; }

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
  for (let t = 0; t < 40; t++) {
    if (!uriQueue.length) { try { await refillUris(); } catch (_) {} if (!uriQueue.length) return null; }
    const uri = uriQueue.shift();
    try { const r = await xrpc(PUB, 'app.bsky.feed.getPostThread', { uri, depth: 8 }); const p = threadToPiece(r.thread); if (p) return p; } catch (_) {}
  }
  return null;
}
async function keepFilled() {
  if (filling) return; filling = true;
  while (pieceQueue.length < 4) { const p = await nextPiece(); if (!p) break; pieceQueue.push(p); if (!piece && !over && started) spawnNext(); }
  filling = false;
  if (!piece && !pieceQueue.length && !over) setStatus('no threads from the feed — retrying…'), setTimeout(() => { if (!piece && !over) keepFilled(); }, 4000);
}

// thread -> connected polyhex, returned as relative CUBE cells (root at origin)
function threadToPiece(root) {
  if (!root || !root.post) return null;
  const occ = new Set(['0,0']);
  const ax = [{ q: 0, r: 0, post: root.post }];
  const queue = [{ node: root, q: 0, r: 0 }];
  while (queue.length && ax.length < MAX_CELLS) {
    const { node, q, r } = queue.shift();
    for (const kid of (node.replies || []).filter((x) => x && x.post)) {
      if (ax.length >= MAX_CELLS) break;
      for (const [dq, dr] of DIRS) {
        const nq = q + dq, nr = r + dr, key = nq + ',' + nr;
        if (!occ.has(key)) { occ.add(key); ax.push({ q: nq, r: nr, post: kid.post }); queue.push({ node: kid, q: nq, r: nr }); break; }
      }
    }
  }
  return { cells: ax.map((c) => ({ x: c.q, y: -c.q - c.r, z: c.r, post: c.post })), root: root.post };
}

// ── game state ──────────────────────────────────────────────────────────────
let occupied = new Map(); // "col,row" -> { post }
let piece = null;         // { cells:[cube], col, row, root }  (anchor in offset)
let score = 0, placed = 0, lines = 0, over = false, started = true;
const avatars = new Map();

function absOffset(pc, dCol = 0, dRow = 0) {
  const base = offsetToCube(pc.col + dCol, pc.row + dRow);
  return pc.cells.map((c) => { const o = cubeToOffset({ x: base.x + c.x, y: base.y + c.y, z: base.z + c.z }); return { col: o.col, row: o.row, post: c.post }; });
}
function collides(pc, dCol, dRow) {
  for (const o of absOffset(pc, dCol, dRow)) {
    if (o.col < 0 || o.col >= COLS || o.row >= ROWS) return true;
    if (occupied.has(o.col + ',' + o.row)) return true;
  }
  return false;
}
function spawn(p) {
  piece = { cells: p.cells, col: Math.floor(COLS / 2), row: 0, root: p.root };
  let off = absOffset(piece);
  const minc = Math.min(...off.map((o) => o.col)), maxc = Math.max(...off.map((o) => o.col));
  if (minc < 0) piece.col -= minc; if (maxc > COLS - 1) piece.col -= (maxc - (COLS - 1));
  off = absOffset(piece); piece.row -= Math.min(...off.map((o) => o.row));
  loadAvatars(piece.cells);
  if (collides(piece, 0, 0)) { over = true; setStatus('topped out — press R to restart'); }
  else setStatus('');
}
function spawnNext() { if (pieceQueue.length) { spawn(pieceQueue.shift()); keepFilled(); } else keepFilled(); }

function move(dCol) { if (piece && !over && !collides(piece, dCol, 0)) { piece.col += dCol; render(); } }
function rotate() { if (!piece || over) return; const rc = piece.cells.map((c) => ({ x: -c.z, y: -c.x, z: -c.y, post: c.post })); if (!collides({ ...piece, cells: rc }, 0, 0)) { piece.cells = rc; render(); } }
function softDrop() { if (!piece || over) return; if (!collides(piece, 0, 1)) piece.row++; else lock(); render(); }
function hardDrop() { if (!piece || over) return; let d = 0; while (!collides(piece, 0, d + 1)) d++; piece.row += d; lock(); render(); }
function tick() { if (over || !started || !piece) return; if (!collides(piece, 0, 1)) piece.row++; else lock(); render(); }

function heightScore() { let m = ROWS; for (const k of occupied.keys()) { const r = +k.split(',')[1]; if (r < m) m = r; } return Math.max(0, ROWS - m); }
function clearLines() {
  let cleared = 0;
  for (let row = ROWS - 1; row >= 0; row--) {
    let full = true;
    for (let col = 0; col < COLS; col++) if (!occupied.has(col + ',' + row)) { full = false; break; }
    if (full) {
      cleared++;
      const next = new Map();
      for (const [k, v] of occupied) { const [c, r] = k.split(',').map(Number); if (r === row) continue; next.set(c + ',' + (r < row ? r + 1 : r), v); }
      occupied = next; row++;
    }
  }
  return cleared;
}
function lock() {
  for (const o of absOffset(piece)) occupied.set(o.col + ',' + o.row, { post: o.post });
  placed += piece.cells.length;
  const cl = clearLines(); lines += cl;
  score = placed + heightScore() * 2 + lines * 12;
  elPlaced.textContent = placed; elHeight.textContent = heightScore(); elLines.textContent = lines; elScore.textContent = score;
  piece = null;
  if (cl) setStatus(cl > 1 ? `${cl} lines!` : 'line!'), setTimeout(() => { if (!over) setStatus(''); }, 700);
  spawnNext();
}
function reset() {
  occupied = new Map(); piece = null; score = placed = lines = 0; over = false; started = true;
  elScore.textContent = elPlaced.textContent = elHeight.textContent = elLines.textContent = '0';
  setStatus(''); pieceQueue = []; uriQueue = []; feedCursor = null; keepFilled();
}

// ── rendering ────────────────────────────────────────────────────────────────
let S = 22, OX = 26, OY = 26;
function resize() {
  const maxW = Math.min((document.querySelector('.stage') || document.body).clientWidth - 8, 460);
  const maxH = window.innerHeight - 150;
  const sW = maxW / (1.5 * COLS + 0.5);
  const sH = maxH / (SQRT3 * (ROWS + 0.5));
  S = Math.max(9, Math.min(sW, sH));
  OX = S + 3; OY = SQRT3 * S * 0.5 + 3;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const cw = 1.5 * S * (COLS - 1) + 2 * S + 6, ch = SQRT3 * S * (ROWS + 0.5) + 6;
  canvas.width = cw * dpr; canvas.height = ch * dpr; canvas.style.width = cw + 'px'; canvas.style.height = ch + 'px';
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0); render();
}
function hexPath(cx, cy) {
  ctx.beginPath();
  for (let i = 0; i < 6; i++) { const a = Math.PI / 180 * (60 * i); const x = cx + S * Math.cos(a), y = cy + S * Math.sin(a); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
  ctx.closePath();
}
function hue(did) { let h = 0; for (let i = 0; i < (did || '').length; i++) h = (h * 31 + did.charCodeAt(i)) % 360; return h; }
function drawCell(col, row, post, active) {
  const { x, y } = offsetToPixel(col, row);
  const did = post && post.author && post.author.did;
  hexPath(x, y); ctx.fillStyle = `hsl(${hue(did)} ${active ? 68 : 50}% ${active ? 50 : 34}%)`; ctx.fill();
  const av = did && avatars.get(did);
  if (av) { const p = S * 0.78; ctx.save(); hexPath(x, y); ctx.clip(); ctx.globalAlpha = active ? 1 : 0.82; ctx.drawImage(av, x - p, y - p, 2 * p, 2 * p); ctx.restore(); }
  ctx.lineWidth = 1.4; ctx.strokeStyle = active ? 'rgba(255,255,255,0.9)' : 'rgba(10,18,32,0.6)'; hexPath(x, y); ctx.stroke();
}
function render() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  for (let row = 0; row < ROWS; row++) for (let col = 0; col < COLS; col++) { const { x, y } = offsetToPixel(col, row); hexPath(x, y); ctx.fillStyle = 'rgba(120,160,220,0.04)'; ctx.fill(); ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(120,160,220,0.08)'; ctx.stroke(); }
  for (const [k, v] of occupied) { const [c, r] = k.split(',').map(Number); drawCell(c, r, v.post, false); }
  if (piece) for (const o of absOffset(piece)) drawCell(o.col, o.row, o.post, true);
}
function loadAvatars(cells) {
  for (const c of cells) {
    const a = c.post && c.post.author, did = a && a.did;
    if (!did || avatars.has(did) || !a.avatar) continue;
    avatars.set(did, null);
    const img = new Image(); // no crossOrigin: bsky CDN has no CORS; we only drawImage
    img.onload = () => { avatars.set(did, img); render(); }; img.onerror = () => {};
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
  if (e.key === 'ArrowLeft') move(-1); else if (e.key === 'ArrowRight') move(1);
  else if (e.key === 'ArrowDown') softDrop(); else if (e.key === 'ArrowUp' || e.key === 'x') rotate();
  else if (e.key === ' ') hardDrop();
});
document.querySelectorAll('[data-act]').forEach((b) => b.addEventListener('click', () => {
  if (!started) start();
  ({ left: () => move(-1), right: () => move(1), rot: rotate, drop: hardDrop, soft: softDrop, restart: reset }[b.getAttribute('data-act')] || (() => {}))();
}));
canvas.addEventListener('pointerdown', (e) => {
  const rect = canvas.getBoundingClientRect(), px = e.clientX - rect.left, py = e.clientY - rect.top;
  let best = null, bd = (S * 0.95) ** 2;
  const consider = (col, row, post) => { const p = offsetToPixel(col, row); const d = (p.x - px) ** 2 + (p.y - py) ** 2; if (d < bd) { bd = d; best = post; } };
  for (const [k, v] of occupied) { const [c, r] = k.split(',').map(Number); consider(c, r, v.post); }
  if (piece) for (const o of absOffset(piece)) consider(o.col, o.row, o.post);
  if (best && best.uri) showThread(best.uri);
});
async function showThread(uri) {
  elPanel.innerHTML = '<div class="t-empty">loading thread…</div>';
  try { const r = await xrpc(PUB, 'app.bsky.feed.getPostThread', { uri, depth: 20 }); elPanel.innerHTML = '<div class="t-thread">' + threadHtml(r.thread, uri) + '</div>'; elPanel.scrollTop = 0; }
  catch (_) { elPanel.innerHTML = '<div class="t-empty">could not load thread</div>'; }
}
function threadHtml(node, focus) {
  if (!node || !node.post) return '<div class="t-empty">no thread</div>';
  const anc = []; let p = node.parent; while (p && p.post) { anc.unshift(p.post); p = p.parent; }
  let h = '';
  anc.forEach((post, i) => { h += postHtml(post, i, false); });
  h += postHtml(node.post, anc.length, node.post.uri === focus);
  h += repliesHtml(node.replies, anc.length + 1, focus);
  return h;
}
function repliesHtml(replies, depth, focus) {
  if (!replies) return '';
  let h = '';
  for (const r of replies) { if (!r || !r.post) continue; h += postHtml(r.post, depth, r.post.uri === focus) + repliesHtml(r.replies, depth + 1, focus); }
  return h;
}
function postHtml(post, depth, focus) {
  const a = post.author || {}, rec = post.record || {};
  const av = a.avatar ? `<img class="t-av" src="${esc(a.avatar)}" loading="lazy">` : '<span class="t-av"></span>';
  return `<div class="t-post${focus ? ' focus' : ''}" style="margin-left:${Math.min(depth, 7) * 11}px">`
    + `<div class="t-ph">${av}<b>${esc(a.displayName || a.handle || '')}</b><span>@${esc(a.handle || '')}</span></div>`
    + `<div class="t-pt">${esc(rec.text || '')}</div>${embedHtml(post.embed)}</div>`;
}
function embedHtml(e) {
  if (!e) return '';
  const t = e.$type || '';
  if (t.includes('recordWithMedia')) return embedHtml(e.media) + quoteHtml(e.record);
  if (t.includes('embed.images')) return '<div class="t-imgs">' + (e.images || []).map((im) => `<img src="${esc(im.thumb)}" alt="${esc(im.alt || '')}" loading="lazy">`).join('') + '</div>';
  if (t.includes('embed.video')) return `<div class="t-vid">${e.thumbnail ? `<img src="${esc(e.thumbnail)}" loading="lazy">` : ''}<span>▶ video</span></div>`;
  if (t.includes('embed.external')) { const x = e.external || {}; return `<a class="t-ext" href="${esc(x.uri)}" target="_blank" rel="noopener">${x.thumb ? `<img src="${esc(x.thumb)}" loading="lazy">` : ''}<span>${esc(x.title || x.uri)}</span></a>`; }
  if (t.includes('embed.record')) return quoteHtml(e);
  return '';
}
function quoteHtml(e) {
  let v = e && (e.record || e);
  if (v && v.record && v.record.author) v = v.record;
  if (!v || !v.author) return '';
  const a = v.author || {}, val = v.value || {};
  return `<div class="t-quote"><div class="t-ph"><b>${esc(a.displayName || a.handle || '')}</b><span>@${esc(a.handle || '')}</span></div><div class="t-pt">${esc(val.text || '')}</div>${embedHtml(v.embeds && v.embeds[0])}</div>`;
}
function esc(s) { return (s || '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

addEventListener('resize', resize, { passive: true });
resize();
setInterval(tick, FALL_MS);
setStatus(listInput ? 'loading threads… (your list)' : 'loading threads…');
keepFilled();

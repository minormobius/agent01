// orb — a thread's images wrapped onto a glowing WebGPU sphere.
//
// Thread fetching + media extraction is delegated to ./thread.js (a copy of
// photo/src/lib/thread.js — the same library the /thread route uses, which
// chases the OP's reply chain across multiple API calls and handles every
// embed shape including nested quote posts). Images are fetched through
// /api/img (a Pages Function image proxy) because cdn.bsky.app Origin-checks
// cross-origin requests; <img src> works without CORS but canvas/WebGPU
// requires it.
import {
  parsePostInput,
  resolvePostUri,
  fetchThread as fetchBskyThread,
  flattenThread,
  extractMedia,
} from './thread.js';

const DEFAULT_URL = 'https://bsky.app/profile/norvid-studies.bsky.social/post/3mmwrhd6ots2a';
const MAX_TILES    = 1000;  // queue cap for deep archive threads; cycles modulo this
const ATLAS_W      = 2048;  // 4x atlas area vs the previous default
const ATLAS_H      = 4096;
const TILE_PX      = 1024;  // render each tile at this resolution before composite
const AUTOSTAMP_DELAY_MS = 80;
const TAP_PIXEL_THRESHOLD = 8;   // drag farther than this = orbit, not a tap
const TILE_PER_ROW = 4;
const MAX_TEX_AXIS = 4096;
const MAX_TILE     = 384;
const MIN_TILE     = 64;

const canvas = document.getElementById('orb');
const statusEl = document.getElementById('status');
const fallbackEl = document.getElementById('fallback');
const form = document.getElementById('thread-form');
const urlInput = document.getElementById('thread-url');
const feedSelect = document.getElementById('feed-select');
const loadBtn = document.getElementById('load-btn');
const modeThreadBtn = document.getElementById('mode-thread');
const modeFeedBtn   = document.getElementById('mode-feed');
const scrollSlider = document.getElementById('scroll-speed');
const spinSlider = document.getElementById('spin-speed');
const brightnessSlider = document.getElementById('brightness');
const colsSlider = document.getElementById('cols');
const rowsSlider = document.getElementById('rows');
const padSlider  = document.getElementById('padding');

// Source mode. 'thread' loads a single Bluesky thread (the original orb).
// 'feed' pulls the SimCluster feed skeleton from feed.mino.mobi and hydrates
// each post via the public AppView.
let sourceMode = 'thread';
const FEED_SKEL_ENDPOINT = 'https://feed.mino.mobi/xrpc/app.bsky.feed.getFeedSkeleton';
const BSKY_GETPOSTS      = 'https://public.api.bsky.app/xrpc/app.bsky.feed.getPosts';

// Stamp-grid layout. cols + rows are independent so the user can shape each
// tile's angular footprint: cols sets longitude span, rows sets latitude.
// pad is fractional gap between tiles. Defaults of 4/8 keep the previous
// square-on-sphere look.
function gridSpec() {
  const cols = Math.max(1, parseInt(colsSlider.value, 10) || 4);
  const rows = Math.max(1, parseInt(rowsSlider.value, 10) || 8);
  const pad  = Math.max(0, Math.min(40, parseInt(padSlider.value, 10) || 0)) / 100;
  return { cols, rows, pad };
}

urlInput.value = DEFAULT_URL;

function setStatus(msg, err = false) {
  statusEl.textContent = msg;
  statusEl.classList.toggle('err', err);
}

if (!navigator.gpu) {
  fallbackEl.hidden = false;
  setStatus('WebGPU not available in this browser', true);
  throw new Error('WebGPU not available in this browser');
}

// Probe the image proxy at startup. A correctly-deployed Pages Function
// replies 400 + JSON {ok:false, proxy:'…'} to a GET with no params; anything
// else (404, HTML, fetch failure) means it isn't routed and media won't
// work regardless of what's in the queue.
async function probeImageProxy() {
  try {
    const r = await fetch('/api/img', { cache: 'no-store' });
    if (r.status === 400) {
      const ct = r.headers.get('content-type') || '';
      if (ct.includes('application/json')) {
        const j = await r.json().catch(() => ({}));
        if (j && j.proxy) return { ok: true, version: j.proxy };
      }
    }
    return { ok: false, status: r.status, marker: r.headers.get('x-orb-proxy') || null };
  } catch (e) {
    return { ok: false, error: e?.message || String(e) };
  }
}

function resizeCanvas() {
  // DPR cap of 2 — iPhones report 3, which would mean 9x fragment shader
  // cost vs CSS pixels. 2 hits a sharp/fast balance once tiles are rich.
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = Math.max(1, Math.floor(window.innerWidth * dpr));
  const h = Math.max(1, Math.floor(window.innerHeight * dpr));
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }
}

// ─────────────────────────────── Bluesky ────────────────────────────────
// Delegated to ./thread.js (same code as the /thread route).

async function loadThread(rawInput) {
  setStatus('parsing URL…');
  const parsed = parsePostInput(rawInput);
  if (!parsed) throw new Error('Could not parse URL. Paste a bsky.app post URL or AT-URI.');
  setStatus('resolving post URI…');
  const uri = await resolvePostUri(parsed);
  setStatus('fetching thread…');
  const tree = await fetchBskyThread(uri, {
    onProgress: ({ fetched }) => setStatus(`fetching thread (${fetched} chunks)…`),
  });
  const posts = flattenThread(tree);
  return { posts };
}

// Pull a SimCluster feed: ask feed.mino.mobi for the post-uri skeleton, then
// hydrate every uri via the public AppView in batches of 25 (the getPosts
// per-call cap). Returns a list of hydrated PostView objects.
async function loadFeedPosts(feedUri, limit = 100) {
  setStatus('fetching feed skeleton…');
  const skelRes = await fetch(
    `${FEED_SKEL_ENDPOINT}?feed=${encodeURIComponent(feedUri)}&limit=${limit}`,
    { cache: 'no-store' },
  );
  if (!skelRes.ok) throw new Error(`feed skeleton: HTTP ${skelRes.status}`);
  const skel = await skelRes.json();
  const uris = (skel.feed || []).map(p => p.post).filter(Boolean);
  if (uris.length === 0) return [];

  const posts = [];
  for (let i = 0; i < uris.length; i += 25) {
    const slice = uris.slice(i, i + 25);
    const params = new URLSearchParams();
    for (const u of slice) params.append('uris', u);
    setStatus(`hydrating ${posts.length}/${uris.length}…`);
    const r = await fetch(`${BSKY_GETPOSTS}?${params}`);
    if (!r.ok) continue;            // skip dead batches, keep going
    const data = await r.json();
    for (const p of data.posts || []) posts.push(p);
  }
  return posts;
}

// Paints the orb's idle "celestial body" pattern across a canvas of any size.
// Used both at init and whenever the column slider resets the atlas.
function paintCelestialPattern(canvas) {
  const W = canvas.width, H = canvas.height;
  const ctx = canvas.getContext('2d');
  const grad = ctx.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0.00, '#1a0d36');
  grad.addColorStop(0.18, '#7a2d4f');
  grad.addColorStop(0.35, '#d4b86a');
  grad.addColorStop(0.50, '#e8a04a');
  grad.addColorStop(0.65, '#d4b86a');
  grad.addColorStop(0.82, '#5c3d96');
  grad.addColorStop(1.00, '#1a0d36');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = 'rgba(255, 200, 140, 0.12)';
  for (let y = 0; y < H; y += 32) ctx.fillRect(0, y, W, 2);
  ctx.fillStyle = 'rgba(255, 240, 220, 0.55)';
  const stars = Math.floor((W * H) / 8500);
  for (let i = 0; i < stars; i++) {
    const x = Math.random() * W;
    const y = Math.random() * H;
    const r = 0.8 + Math.random() * 2.6;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
}

// Build a queue of post units to render on the orb.
//
// For archive threads (which point at "cool stuff being quoted") we want the
// QUOTED posts, not the OP's commentary. For regular discussion threads with
// no quotes, fall back to the posts themselves.
function buildPostQueue(posts) {
  const quotes = [];
  for (const p of posts) {
    if (quotes.length >= MAX_TILES) break;
    if (p.embed) {
      for (const m of extractMedia(p.embed)) addQuotedTo(quotes, m);
    }
  }
  if (quotes.length > 0) return quotes;

  const out = [];
  for (const p of posts) {
    if (out.length >= MAX_TILES) break;
    const text = (p.text || '').trim();
    const media = allMediaInEmbed(p.embed);
    if (text || media.length) {
      out.push({ kind: 'post', uri: p.uri, author: p.author, text, media, createdAt: p.createdAt });
    }
  }
  return out;
}

// Build a queue from hydrated feed PostView objects. Unlike threads we don't
// prefer quotes — every top-level feed post is a tile in its own right; media
// from inside a quote embed still gets collected because allMediaInEmbed
// recurses into quote.embeds.
function buildFeedQueue(postViews) {
  const out = [];
  for (const p of postViews) {
    if (out.length >= MAX_TILES) break;
    const text = (p.record?.text || '').trim();
    const media = allMediaInEmbed(p.embed);
    if (!text && media.length === 0) continue;
    out.push({
      kind: 'feed',
      uri: p.uri,
      author: {
        did: p.author?.did,
        handle: p.author?.handle,
        displayName: p.author?.displayName || p.author?.handle,
        avatar: p.author?.avatar,
      },
      text,
      media,
      createdAt: p.record?.createdAt || p.indexedAt || '',
    });
  }
  return out;
}

function addQuotedTo(out, m) {
  if (out.length >= MAX_TILES) return;
  if (m.type !== 'quote' || !m.author) return;
  const text = (m.text || '').trim();
  const media = allMediaInMediaList(m.embeds);
  if (text || media.length) {
    out.push({
      kind: 'quote',
      uri: m.uri,
      author: m.author,
      text,
      media,
      createdAt: m.createdAt,
    });
  }
  // A quote can itself contain quotes — flatten those too.
  if (Array.isArray(m.embeds)) for (const inner of m.embeds) addQuotedTo(out, inner);
}

// Collect up to N image-or-video items from an embed (recursing through
// quote.embeds). Videos contribute their thumbnail; we mark them so the tile
// renderer can stamp a play overlay.
function allMediaInEmbed(embed, cap = 4) {
  if (!embed) return [];
  const out = [];
  collectMediaInto(out, extractMedia(embed), cap);
  return out;
}
function allMediaInMediaList(items, cap = 4) {
  const out = [];
  collectMediaInto(out, items, cap);
  return out;
}
function collectMediaInto(out, items, cap) {
  if (!Array.isArray(items)) return;
  for (const m of items) {
    if (out.length >= cap) return;
    if (m.type === 'image' && m.thumb) {
      out.push({ kind: 'image', thumb: m.thumb, fullsize: m.fullsize, alt: m.alt || '' });
    } else if (m.type === 'video' && m.thumbnail) {
      out.push({ kind: 'video', thumb: m.thumbnail, alt: m.alt || '' });
    } else if (m.type === 'quote' && Array.isArray(m.embeds)) {
      collectMediaInto(out, m.embeds, cap);
    }
  }
}

// ───────────────────────────── Atlas (strip) ────────────────────────────

function chooseTileSize(count) {
  const rows = Math.ceil(count / TILE_PER_ROW);
  const fromHeight = Math.floor(MAX_TEX_AXIS / Math.max(1, rows));
  const fromWidth  = Math.floor(MAX_TEX_AXIS / TILE_PER_ROW);
  return Math.max(MIN_TILE, Math.min(MAX_TILE, fromHeight, fromWidth));
}

// fetch+createImageBitmap rather than <img>.onerror so we know *why* a load
// fails — Safari's onerror gives no detail, but a real HTTP status + a
// TypeError (network/CORS) are distinguishable here.
//
// We try two paths in order:
//   1. /api/img — our same-origin proxy on photo.mino.mobi. This is the
//      preferred path: zero third-party dependency, cached at our own edge.
//   2. https://corsproxy.io/?u=… — public CORS proxy. Used only when our own
//      proxy isn't routed (the deploy config is finicky about it). Public
//      proxies are flaky and rate-limited, so this is a fallback, not the
//      main road.
const SELF_PROXY  = '/api/img?u=';
const PUBLIC_PROXY = 'https://corsproxy.io/?';
let lastImageError = '';
let selfProxyKnownDown = false;     // set true after the first /api/img 4xx

async function tryFetchAsBitmap(url) {
  try {
    const r = await fetch(url, { mode: 'cors', credentials: 'omit' });
    if (!r.ok) { lastImageError = `HTTP ${r.status}`; return null; }
    const blob = await r.blob();
    return await createImageBitmap(blob);
  } catch (e) {
    lastImageError = (e && e.name === 'TypeError') ? 'network/CORS' : (e?.message || 'fetch error');
    return null;
  }
}

async function loadImage(url) {
  if (!url) { lastImageError = 'empty url'; return null; }
  // Same-origin first, unless we've already confirmed it isn't routed.
  if (!selfProxyKnownDown) {
    const bm = await tryFetchAsBitmap(SELF_PROXY + encodeURIComponent(url));
    if (bm) return bm;
    // 404 from our own origin means the route isn't wired; mark it down so
    // we don't pay the round-trip on every subsequent media item.
    if (lastImageError === 'HTTP 404') selfProxyKnownDown = true;
  }
  // Public proxy fallback. Records the upstream HTTP status if non-OK.
  return await tryFetchAsBitmap(PUBLIC_PROXY + encodeURIComponent(url));
}

// Lay out up to 4 media items in a tile's media area: 1 fills it, 2 split it
// in half, 3-4 use a 2x2 grid. Videos get a circular play-button overlay.
function drawMediaArea(ctx, items, x, y, w, h) {
  if (!items.length) return;
  const n = Math.min(items.length, 4);
  if (n === 1) {
    drawMediaCell(ctx, items[0], x, y, w, h);
    return;
  }
  if (n === 2) {
    const hw = w / 2;
    drawMediaCell(ctx, items[0], x,      y, hw, h);
    drawMediaCell(ctx, items[1], x + hw, y, hw, h);
    return;
  }
  const hw = w / 2, hh = h / 2;
  for (let i = 0; i < n; i++) {
    const cx = i % 2, cy = (i / 2) | 0;
    drawMediaCell(ctx, items[i], x + cx * hw, y + cy * hh, hw, hh);
  }
}

function drawMediaCell(ctx, { media, bitmap }, x, y, w, h) {
  if (bitmap) {
    drawCoverImage(ctx, bitmap, x, y, w, h);
  } else {
    // No bitmap (load failed or no thumb at all) — placeholder rectangle
    // so video-only embeds still get a visible play button.
    ctx.fillStyle = 'rgba(20, 10, 35, 0.85)';
    ctx.fillRect(x, y, w, h);
  }
  if (media?.kind === 'video') {
    drawPlayOverlay(ctx, x + w / 2, y + h / 2, Math.min(w, h) * 0.18);
  }
}

function drawPlayOverlay(ctx, cx, cy, r) {
  ctx.save();
  ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(255, 248, 235, 0.95)';
  ctx.beginPath();
  ctx.moveTo(cx - r * 0.34, cy - r * 0.5);
  ctx.lineTo(cx + r * 0.56, cy);
  ctx.lineTo(cx - r * 0.34, cy + r * 0.5);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawCoverImage(ctx, img, dx, dy, dw, dh) {
  // Works for both HTMLImageElement and ImageBitmap.
  const iw = img.naturalWidth || img.width;
  const ih = img.naturalHeight || img.height;
  const ir = iw / ih, dr = dw / dh;
  let sw, sh, sx, sy;
  if (ir > dr) { sh = ih; sw = ih * dr; sx = (iw - sw) / 2; sy = 0; }
  else         { sw = iw; sh = iw / dr; sx = 0;             sy = (ih - sh) / 2; }
  ctx.drawImage(img, sx, sy, sw, sh, dx, dy, dw, dh);
}

// Simple word-wrap into an array of lines that fit `maxWidth`.
function wrapText(ctx, text, maxWidth) {
  const out = [];
  for (const para of String(text || '').split('\n')) {
    const words = para.split(/\s+/).filter(Boolean);
    let line = '';
    for (const w of words) {
      const test = line ? line + ' ' + w : w;
      if (ctx.measureText(test).width <= maxWidth) line = test;
      else { if (line) out.push(line); line = w; }
    }
    if (line) out.push(line);
    if (out[out.length - 1] !== '') out.push('');
  }
  while (out.length && out[out.length - 1] === '') out.pop();
  return out;
}

// Stable per-author color (HSL) so each author has a recognisable hue.
function hashHue(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h) % 360;
}

// Render a single post unit as a square canvas tile. Text always succeeds;
// media is best-effort (failed loads just leave a text-only card). Up to 4
// images/videos mosaic into the top area; videos get a play-button overlay.
async function renderPostTile(entry, size) {
  const c = document.createElement('canvas');
  c.width = size; c.height = size;
  const ctx = c.getContext('2d');

  const hue = hashHue(entry.author?.handle || entry.uri || 'x');
  ctx.fillStyle = `hsl(${hue}, 50%, 20%)`;
  ctx.fillRect(0, 0, size, size);

  // Load all media bitmaps in parallel — each via /api/img — keeping nulls
  // so videos with failed thumbnails still draw their play overlay.
  const media = (entry.media || []).slice(0, 4);
  const loaded = await Promise.all(media.map(async m => {
    if (!m.thumb) return { media: m, bitmap: null };
    mediaAttempted++;
    const bm = await loadImage(m.thumb);
    if (bm) mediaSucceeded++;
    else lastMediaFailReason = lastImageError || lastMediaFailReason;
    return { media: m, bitmap: bm };
  }));
  const valid = loaded.filter(p => p.bitmap);

  let imgArea = 0;
  if (valid.length > 0) {
    imgArea = Math.floor(size * 0.58);
    drawMediaArea(ctx, loaded, 0, 0, size, imgArea);
    const fade = ctx.createLinearGradient(0, imgArea - 56, 0, imgArea);
    fade.addColorStop(0, 'rgba(0,0,0,0)');
    fade.addColorStop(1, 'rgba(0,0,0,0.6)');
    ctx.fillStyle = fade;
    ctx.fillRect(0, imgArea - 56, size, 56);
  }

  const textY = imgArea;
  const textH = size - imgArea;
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fillRect(0, textY, size, textH);

  const pad = Math.floor(size * 0.05);
  // Author handle.
  ctx.fillStyle = 'rgba(255,215,140,0.95)';
  const handleSize = Math.floor(size * 0.055);
  ctx.font = `600 ${handleSize}px -apple-system, BlinkMacSystemFont, "Inter", system-ui, sans-serif`;
  ctx.textBaseline = 'top';
  ctx.textAlign = 'left';
  ctx.fillText('@' + (entry.author?.handle || 'unknown'), pad, textY + pad);

  // Body text.
  const bodySize = Math.floor(size * 0.055);
  ctx.fillStyle = 'rgba(248,242,228,0.96)';
  ctx.font = `400 ${bodySize}px Georgia, "Iowan Old Style", "Palatino Linotype", serif`;
  const bodyTop = textY + pad + handleSize + Math.floor(size * 0.025);
  const lineH = Math.floor(bodySize * 1.25);
  const maxLines = Math.max(1, Math.floor((textY + size - bodyTop - pad) / lineH));
  const lines = wrapText(ctx, entry.text, size - pad * 2);
  for (let i = 0; i < Math.min(lines.length, maxLines); i++) {
    let line = lines[i];
    if (i === maxLines - 1 && lines.length > maxLines) {
      // Truncate with an ellipsis when there's more.
      while (line && ctx.measureText(line + '…').width > size - pad * 2) line = line.slice(0, -1);
      line = line.replace(/[\s,;:.!?]+$/, '') + '…';
    }
    ctx.fillText(line, pad, bodyTop + i * lineH);
  }

  return c;
}

// Builds the atlas progressively; calls onChunk(canvas) every BATCH images
// so the orb can re-upload its texture as more cats^Wphotos arrive.
async function buildAtlasProgressively(images, onChunk) {
  if (images.length === 0) return null;
  const tile = chooseTileSize(images.length);
  const rows = Math.ceil(images.length / TILE_PER_ROW);
  const W = TILE_PER_ROW * tile;
  const H = rows * tile;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const ctx = c.getContext('2d');
  // Subtle warm fill so empty tiles aren't a hard black void during the load.
  ctx.fillStyle = '#0a0410';
  ctx.fillRect(0, 0, W, H);

  const BATCH = 24;   // was 8 — fewer texture re-uploads during load
  let drawn = 0;
  for (let i = 0; i < images.length; i += BATCH) {
    const slice = images.slice(i, i + BATCH);
    const loaded = await Promise.all(slice.map(im => loadImage(im.thumb)));
    for (let k = 0; k < loaded.length; k++) {
      const idx = i + k;
      const img = loaded[k];
      if (!img) continue;
      const row = Math.floor(idx / TILE_PER_ROW);
      const col = idx % TILE_PER_ROW;
      drawTile(ctx, img, col * tile, row * tile, tile);
      drawn++;
    }
    onChunk(c, drawn, images.length);
  }
  return c;
}

// ─────────────────────────────── Matrix math ────────────────────────────
// All matrices stored column-major (WebGPU convention).

function mat4Perspective(fov, aspect, near, far) {
  const f = 1 / Math.tan(fov / 2);
  const nf = 1 / (near - far);
  const out = new Float32Array(16);
  out[0]  = f / aspect;
  out[5]  = f;
  out[10] = far * nf;
  out[11] = -1;
  out[14] = far * near * nf;
  return out;
}

function mat4LookAt(eye, target, up) {
  const z = normalize3([eye[0]-target[0], eye[1]-target[1], eye[2]-target[2]]);
  const x = normalize3(cross3(up, z));
  const y = cross3(z, x);
  const out = new Float32Array(16);
  // rows: x, y, z, translation
  out[0]=x[0]; out[1]=y[0]; out[2]=z[0]; out[3]=0;
  out[4]=x[1]; out[5]=y[1]; out[6]=z[1]; out[7]=0;
  out[8]=x[2]; out[9]=y[2]; out[10]=z[2]; out[11]=0;
  out[12]=-dot3(x,eye); out[13]=-dot3(y,eye); out[14]=-dot3(z,eye); out[15]=1;
  return out;
}

function mat4Mul(a, b) {
  // Column-major: C[col][row] = sum_k A[k][row] * B[col][k]
  const out = new Float32Array(16);
  for (let col = 0; col < 4; col++) {
    for (let row = 0; row < 4; row++) {
      let s = 0;
      for (let k = 0; k < 4; k++) s += a[k*4 + row] * b[col*4 + k];
      out[col*4 + row] = s;
    }
  }
  return out;
}

function normalize3(v) { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0]/l, v[1]/l, v[2]/l]; }
function cross3(a, b) { return [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]]; }
function dot3(a, b) { return a[0]*b[0] + a[1]*b[1] + a[2]*b[2]; }

// ─────────────────────────────── Sphere mesh ────────────────────────────

function buildSphere(lat = 64, lon = 96) {
  const verts = new Float32Array((lat + 1) * (lon + 1) * 5);
  let v = 0;
  for (let i = 0; i <= lat; i++) {
    const vv = i / lat;
    const theta = vv * Math.PI;
    const st = Math.sin(theta), ct = Math.cos(theta);
    for (let j = 0; j <= lon; j++) {
      const uu = j / lon;
      const phi = uu * Math.PI * 2;
      verts[v++] = st * Math.cos(phi);
      verts[v++] = ct;
      verts[v++] = st * Math.sin(phi);
      verts[v++] = uu;
      verts[v++] = vv;
    }
  }
  const idx = [];
  for (let i = 0; i < lat; i++) {
    for (let j = 0; j < lon; j++) {
      const a = i * (lon + 1) + j;
      const b = a + lon + 1;
      // Two triangles per quad. Winding: outward-facing normals (for cull back).
      idx.push(a, a + 1, b, a + 1, b + 1, b);
    }
  }
  return {
    verts,
    indices: new Uint16Array(idx),
    indexCount: idx.length,
  };
}

// ─────────────────────────────── WebGPU ─────────────────────────────────

const WGSL = `
struct Uniforms {
  viewProj: mat4x4<f32>,
  scroll: f32,
  brightness: f32,
  _pad: vec2<f32>,
};

@group(0) @binding(0) var<uniform> u: Uniforms;
@group(0) @binding(1) var stripTex: texture_2d<f32>;
@group(0) @binding(2) var stripSamp: sampler;

struct VSOut {
  @builtin(position) pos: vec4<f32>,
  @location(0) uv: vec2<f32>,
};

@vertex
fn vs(@location(0) p: vec3<f32>, @location(1) uv: vec2<f32>) -> VSOut {
  var o: VSOut;
  o.pos = u.viewProj * vec4<f32>(p, 1.0);
  o.uv = uv;
  return o;
}

@fragment
fn fs(in: VSOut) -> @location(0) vec4<f32> {
  // Flip u so text reads correctly on the visible (outward) face: the UV
  // sphere's winding has phi increasing west-to-east in world space, which
  // appears as right-to-left from the default camera position.
  let uv = vec2<f32>(1.0 - in.uv.x, fract(in.uv.y + u.scroll));
  let c  = textureSample(stripTex, stripSamp, uv).rgb;
  // Emissive soft-saturation: amplify, then roll off to 1.0 via 1 - exp(-x).
  let g  = c * u.brightness;
  let lit = vec3<f32>(1.0) - exp(-g);
  // Edge darkening for a bit of "glass marble" depth — falls off near the
  // silhouette. We can't easily compute view angle without the normal, so
  // just trust the equirect UV: poles get a soft vignette.
  let polar = abs(in.uv.y - 0.5) * 2.0;
  let vign  = 1.0 - 0.18 * smoothstep(0.85, 1.0, polar);
  return vec4<f32>(lit * vign, 1.0);
}
`;

const state = {
  device: null, context: null, format: null,
  pipeline: null, sampler: null,
  uniformBuffer: null,
  sphere: null,
  stripTex: null, stripView: null,
  bindGroup: null,
  depthTex: null,
  scroll: 0, yaw: 0, pitch: 0.18, distance: 2.3,
};

async function initWebGPU() {
  setStatus('requesting GPU adapter…');
  const adapter = await navigator.gpu.requestAdapter();
  if (!adapter) throw new Error('navigator.gpu present but requestAdapter() returned null');
  setStatus('requesting GPU device…');
  const device = await adapter.requestDevice();
  device.lost.then(info => setStatus('GPU lost: ' + info.message, true));

  // Size the canvas backing store BEFORE configuring the context. The default
  // 300x150 drawing buffer trips Safari's WebGPU swapchain on some builds.
  resizeCanvas();

  setStatus('configuring canvas context…');
  const context = canvas.getContext('webgpu');
  if (!context) throw new Error('canvas.getContext("webgpu") returned null');
  const format = navigator.gpu.getPreferredCanvasFormat();
  // 'opaque' is universally supported; 'premultiplied' is optional and some
  // iOS Safari builds reject it. The CSS halo behind the canvas won't show
  // through with opaque, but the emissive shader still does the heavy lifting.
  context.configure({ device, format, alphaMode: 'opaque' });

  setStatus('compiling shaders…');
  const mod = device.createShaderModule({ code: WGSL });
  // Surface WGSL compile errors verbatim (instead of letting pipeline creation
  // hide them behind a generic message).
  try {
    const info = await mod.getCompilationInfo();
    const errs = info.messages.filter(m => m.type === 'error');
    if (errs.length) throw new Error('WGSL: ' + errs.map(e => e.message).join(' | '));
  } catch (e) {
    if (/WGSL:/.test(e.message)) throw e;
    // getCompilationInfo not implemented on some builds — non-fatal.
  }

  setStatus('building render pipeline…');
  const pipeline = device.createRenderPipeline({
    layout: 'auto',
    vertex: {
      module: mod, entryPoint: 'vs',
      buffers: [{
        arrayStride: 5 * 4,
        attributes: [
          { shaderLocation: 0, offset: 0,     format: 'float32x3' },
          { shaderLocation: 1, offset: 3 * 4, format: 'float32x2' },
        ],
      }],
    },
    fragment: {
      module: mod, entryPoint: 'fs',
      targets: [{ format }],
    },
    // cullMode 'none' so neither winding flips nor Metal coordinate-system
    // quirks can make the sphere disappear. The overdraw is trivial at this
    // sphere density and the user gets to see *something* unambiguously.
    primitive: { topology: 'triangle-list', cullMode: 'none', frontFace: 'ccw' },
    depthStencil: { format: 'depth24plus', depthWriteEnabled: true, depthCompare: 'less' },
  });

  const sampler = device.createSampler({
    magFilter: 'linear', minFilter: 'linear',
    addressModeU: 'repeat', addressModeV: 'repeat',
  });

  const sphere = buildSphere(64, 96);   // denser mesh — text in tiles looks sharper
  sphere.vertexBuffer = device.createBuffer({
    size: sphere.verts.byteLength,
    usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
  });
  device.queue.writeBuffer(sphere.vertexBuffer, 0, sphere.verts);
  sphere.indexBuffer = device.createBuffer({
    size: sphere.indices.byteLength,
    usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
  });
  device.queue.writeBuffer(sphere.indexBuffer, 0, sphere.indices);

  // Uniform buffer: mat4 (64) + scroll (4) + brightness (4) + pad (8) = 80; pad to 96.
  const uniformBuffer = device.createBuffer({
    size: 96,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });

  // Placeholder texture: the celestial-body pattern, painted once here and
  // repainted later whenever the column slider changes (which clears stamps).
  const placeholder = document.createElement('canvas');
  placeholder.width = ATLAS_W; placeholder.height = ATLAS_H;
  paintCelestialPattern(placeholder);

  state.device = device;
  state.context = context;
  state.format = format;
  state.pipeline = pipeline;
  state.sampler = sampler;
  state.uniformBuffer = uniformBuffer;
  state.sphere = sphere;
  state.atlasCanvas = placeholder;       // single source of truth for the texture
  setStripFromCanvas(placeholder);
}

function setStripFromCanvas(c) {
  const { device } = state;
  if (state.stripTex) state.stripTex.destroy();
  state.stripTex = device.createTexture({
    size: { width: c.width, height: c.height },
    format: 'rgba8unorm',
    usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT,
  });
  device.queue.copyExternalImageToTexture(
    { source: c, flipY: false },
    { texture: state.stripTex },
    { width: c.width, height: c.height },
  );
  state.stripView = state.stripTex.createView();
  state.bindGroup = device.createBindGroup({
    layout: state.pipeline.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: { buffer: state.uniformBuffer } },
      { binding: 1, resource: state.stripView },
      { binding: 2, resource: state.sampler },
    ],
  });
}

function ensureDepth() {
  const { device, depthTex } = state;
  if (depthTex && depthTex.width === canvas.width && depthTex.height === canvas.height) return;
  if (depthTex) depthTex.destroy();
  state.depthTex = device.createTexture({
    size: { width: canvas.width, height: canvas.height, depthOrArrayLayers: 1 },
    format: 'depth24plus',
    usage: GPUTextureUsage.RENDER_ATTACHMENT,
  });
}

// ─────────────────────────────── Render loop ────────────────────────────

let lastT = performance.now();

function frame() {
  requestAnimationFrame(frame);
  if (!state.device || !state.bindGroup) return;

  const t = performance.now();
  const dt = Math.min(0.1, (t - lastT) / 1000);
  lastT = t;

  resizeCanvas();
  ensureDepth();

  // auto scroll / spin (slider units → reasonable per-second rates). Gated by
  // `paused` so the user can freeze the orb to read or tap a specific tile;
  // manual drag still updates yaw/pitch directly regardless.
  if (!paused) {
    const scrollDelta = dt * parseFloat(scrollSlider.value) * 0.0012;
    state.scroll = (state.scroll + scrollDelta) % 1;
    // cycleProgress is the unbounded version of state.scroll — drives the
    // cyclic row replacer below, which fires once per (1 / rows) of progress.
    cycleProgress += scrollDelta;
    if (!dragState) {
      state.yaw += dt * parseFloat(spinSlider.value) * 0.004;
    }
  }
  tickCyclicReplacer();

  // matrices
  const aspect = canvas.width / canvas.height;
  const proj = mat4Perspective(0.72, aspect, 0.1, 100);
  const cp = Math.cos(state.pitch), sp = Math.sin(state.pitch);
  const cy = Math.cos(state.yaw),   sy = Math.sin(state.yaw);
  const eye = [
    state.distance * cp * sy,
    state.distance * sp,
    state.distance * cp * cy,
  ];
  const view = mat4LookAt(eye, [0, 0, 0], [0, 1, 0]);
  const viewProj = mat4Mul(proj, view);

  const ub = new Float32Array(24);
  ub.set(viewProj, 0);
  ub[16] = state.scroll;
  ub[17] = parseFloat(brightnessSlider.value) * 0.01;
  state.device.queue.writeBuffer(state.uniformBuffer, 0, ub);

  const enc = state.device.createCommandEncoder();
  const pass = enc.beginRenderPass({
    colorAttachments: [{
      view: state.context.getCurrentTexture().createView(),
      // Transparent clear so the CSS radial halo behind the canvas shows
      // through the empty area around the sphere. Premultiplied alpha: rgb
      // must be 0 when alpha is 0.
      clearValue: { r: 0, g: 0, b: 0, a: 0 },
      loadOp: 'clear', storeOp: 'store',
    }],
    depthStencilAttachment: {
      view: state.depthTex.createView(),
      depthClearValue: 1, depthLoadOp: 'clear', depthStoreOp: 'store',
    },
  });
  pass.setPipeline(state.pipeline);
  pass.setBindGroup(0, state.bindGroup);
  pass.setVertexBuffer(0, state.sphere.vertexBuffer);
  pass.setIndexBuffer(state.sphere.indexBuffer, 'uint16');
  pass.drawIndexed(state.sphere.indexCount);
  pass.end();
  state.device.queue.submit([enc.finish()]);
}

// ─────────────────────────────── Interaction ────────────────────────────
// 1 finger / mouse drag = orbit (yaw + pitch)
// 2 fingers              = pinch zoom (camera distance)
// wheel                  = zoom

const pointers = new Map();
const pointerStarts = new Map();   // pointerId -> {x, y} at pointerdown, for tap detection
let dragState = null;
let pinchState = null;

function pickPan() {
  const [p] = [...pointers.values()];
  dragState = { x: p.x, y: p.y, yaw: state.yaw, pitch: state.pitch };
  pinchState = null;
}
function pickPinch() {
  const [a, b] = [...pointers.values()];
  pinchState = {
    dist: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)),
    distance: state.distance,
  };
  dragState = null;
}
function refreshGesture() {
  dragState = null; pinchState = null;
  if (pointers.size === 1) pickPan();
  else if (pointers.size >= 2) pickPinch();
}

canvas.addEventListener('pointerdown', (e) => {
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  pointerStarts.set(e.pointerId, { x: e.clientX, y: e.clientY });
  try { canvas.setPointerCapture(e.pointerId); } catch {}
  refreshGesture();
});
canvas.addEventListener('pointermove', (e) => {
  if (!pointers.has(e.pointerId)) return;
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

  if (pointers.size >= 2 && pinchState) {
    const [a, b] = [...pointers.values()];
    const curDist = Math.max(1, Math.hypot(a.x - b.x, a.y - b.y));
    // Fingers apart -> curDist grows -> distance shrinks -> zoom in.
    state.distance = Math.max(1.3, Math.min(8, pinchState.distance * pinchState.dist / curDist));
  } else if (pointers.size === 1 && dragState) {
    const dx = e.clientX - dragState.x;
    const dy = e.clientY - dragState.y;
    state.yaw   = dragState.yaw   - dx * 0.005;
    state.pitch = Math.max(-1.5, Math.min(1.5, dragState.pitch + dy * 0.005));
  }
});
function endPointer(e) {
  if (!pointers.has(e.pointerId)) return;
  const start = pointerStarts.get(e.pointerId);
  pointers.delete(e.pointerId);
  pointerStarts.delete(e.pointerId);
  try { canvas.releasePointerCapture(e.pointerId); } catch {}

  // Tap detection: single pointer, didn't drag more than a few pixels, and
  // no other fingers are still down. If so, try picking a tile.
  if (e.type === 'pointerup' && start && pointers.size === 0) {
    const dx = e.clientX - start.x;
    const dy = e.clientY - start.y;
    if (Math.hypot(dx, dy) < TAP_PIXEL_THRESHOLD) {
      pickTileAt(e.clientX, e.clientY);
    }
  }

  // Re-baseline so lifting one finger of a pinch doesn't snap the view.
  refreshGesture();
}
canvas.addEventListener('pointerup', endPointer);
canvas.addEventListener('pointercancel', endPointer);

// Tap-to-open. On a non-drag tap, cast a ray from the camera through the
// click point, intersect the unit sphere, convert the hit to the same UV
// the shader samples (matching the 1 - u flip and the scroll offset), find
// which grid cell that maps to, and look up the entry in stampedTiles.
// If found, open the original post on bsky.app in a new tab.
function pickTileAt(clientX, clientY) {
  if (!state.atlasCanvas) return;
  const rect = canvas.getBoundingClientRect();
  const ndcX = 2 * (clientX - rect.left) / rect.width - 1;
  const ndcY = 1 - 2 * (clientY - rect.top) / rect.height;

  // Camera basis — must match what frame() uses to build view.
  const cp = Math.cos(state.pitch), sp = Math.sin(state.pitch);
  const cy = Math.cos(state.yaw),   sy = Math.sin(state.yaw);
  const eye = [
    state.distance * cp * sy,
    state.distance * sp,
    state.distance * cp * cy,
  ];
  const fwd = normalize3([-eye[0], -eye[1], -eye[2]]);
  const right = normalize3(cross3(fwd, [0, 1, 0]));
  const up = cross3(right, fwd);

  // Match the projection in frame() (fov ~ 0.72 rad).
  const fovY = 0.72;
  const aspect = canvas.width / Math.max(1, canvas.height);
  const halfH = Math.tan(fovY / 2);
  const halfW = halfH * aspect;
  const dx = ndcX * halfW;
  const dy = ndcY * halfH;
  const dir = normalize3([
    fwd[0] + dx * right[0] + dy * up[0],
    fwd[1] + dx * right[1] + dy * up[1],
    fwd[2] + dx * right[2] + dy * up[2],
  ]);

  // Sphere intersection (unit sphere at origin).
  const ed = dot3(eye, dir);
  const e2 = dot3(eye, eye);
  const disc = ed * ed - (e2 - 1);
  if (disc < 0) return;                       // missed the orb
  const sq = Math.sqrt(disc);
  const t = -ed - sq;
  if (t < 0) return;                          // behind camera (shouldn't happen)
  const hit = [eye[0] + t * dir[0], eye[1] + t * dir[1], eye[2] + t * dir[2]];

  // Sphere point -> UV, matching the sphere mesh's parameterisation.
  const theta = Math.acos(Math.max(-1, Math.min(1, hit[1])));
  const phi = Math.atan2(hit[2], hit[0]);
  let uRaw = phi / (2 * Math.PI);
  if (uRaw < 0) uRaw += 1;
  const vRaw = theta / Math.PI;

  // Apply the same transforms the fragment shader applies: u flipped, v
  // shifted by the auto-scroll and wrapped.
  const atlasU = 1 - uRaw;
  let atlasV = (vRaw + state.scroll) % 1;
  if (atlasV < 0) atlasV += 1;

  const { cols, rows } = gridSpec();
  const col = Math.min(cols - 1, Math.max(0, Math.floor(atlasU * cols)));
  const row = Math.min(rows - 1, Math.max(0, Math.floor(atlasV * rows)));
  const slot = row * cols + col;

  const entry = stampedTiles.get(slot);
  if (!entry || !entry.uri) {
    setStatus(`tapped slot ${col},${row} — empty`);
    return;
  }
  // at://did:plc:.../app.bsky.feed.post/rkey -> https://bsky.app/profile/did/post/rkey
  const m = entry.uri.match(/^at:\/\/(did:[^/]+)\/[^/]+\/([^/]+)/);
  if (!m) { setStatus('tile has no bsky URL'); return; }
  const url = `https://bsky.app/profile/${m[1]}/post/${m[2]}`;
  setStatus(`opening @${entry.author?.handle || ''}…`);
  window.open(url, '_blank', 'noopener');
}
canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  const f = e.deltaY > 0 ? 1.08 : 1 / 1.08;
  state.distance = Math.max(1.3, Math.min(8, state.distance * f));
}, { passive: false });

// Any layout slider cancels the in-flight autostamp (via stampGen++), clears
// the atlas, resets the queue cursor, and kicks off a fresh autostamp into
// the new grid. The fetched tileQueue is preserved so there's no re-fetch.
function resetGridLayout() {
  if (!state.atlasCanvas) return;
  stampGen++;                                     // cancel any in-progress run
  paintCelestialPattern(state.atlasCanvas);
  setStripFromCanvas(state.atlasCanvas);
  queueIndex = 0;
  mediaAttempted = 0;
  mediaSucceeded = 0;
  initialFillDone = false;
  cycleProgress = 0;
  lastReplaceCycle = 0;
  nextRowToReplace = 0;
  pendingReplacements = 0;
  tileCache.length = 0;          // pre-rendered tiles invalidated by layout change
  cacheCursor = 0;
  cacheFilling = false;
  stampedTiles.clear();   // slot indexing changes with cols/rows; map invalidated
  const { cols, rows, pad } = gridSpec();
  const padTxt = Math.round(pad * 100) + '%';
  if (tileQueue.length) {
    setStatus(`${cols}×${rows} grid, ${padTxt} pad · refilling…`);
    autoStamp();
  } else {
    setStatus(`${cols}×${rows} grid, ${padTxt} pad`);
  }
}
colsSlider.addEventListener('change', resetGridLayout);
rowsSlider.addEventListener('change', resetGridLayout);
padSlider.addEventListener('change', resetGridLayout);

// ─────────────────────────────── Bootstrap ──────────────────────────────

// Queue + cyclic stamping. The orb's atlas has a fixed C*R slots. The queue
// (tileQueue) holds every post-unit collected from the thread. queueIndex is
// monotonic — we read tileQueue[queueIndex % length], so over time every
// post in the queue passes through the atlas, indefinitely.
//
// Flow:
//   1. ensureThreadLoaded() fetches the thread and builds the queue.
//   2. autoStamp() does the *initial fill* — stamps each of C*R slots once,
//      then sets initialFillDone and kicks off fillCache() to pre-render the
//      next batch of tile canvases in the background.
//   3. From then on, frame() watches cycleProgress (a monotonic counter that
//      grows with state.scroll). Each time it crosses 1/rows of a full cycle,
//      it asks replaceRowFromCache() to atomically composite the next row's
//      worth of pre-rendered tiles into the atlas and re-upload the texture
//      — an instant, single-tick swap so the visual change lands exactly at
//      the south-pole crossing, not multiple seconds later as it would if we
//      kicked off async renderPostTile work from inside the replacer.
let tileQueue = [];
let queueIndex = 0;            // monotonic; read modulo tileQueue.length
let lastFetchedUrl = '';
let mediaAttempted = 0;
let mediaSucceeded = 0;
let lastMediaFailReason = '';
let stampGen = 0;
let paused = false;
let initialFillDone = false;
let cycleProgress = 0;         // monotonic scroll counter for replacement timing
let lastReplaceCycle = 0;
let nextRowToReplace = 0;
let pendingReplacements = 0;
const stampedTiles = new Map();   // slot -> tile entry, for tap-to-open

// Pre-render cache. The slow part of putting a tile on the orb is
// renderPostTile (image fetches + canvas draws). If we do that work
// inside the cyclic replacer, replacements happen multiple seconds after
// the row wraps past the pole — visibly mid-flight. Solution: keep a
// background queue rendering the *next* tiles into canvases, and have
// the replacer just composite from the cache instantly. The swap then
// lands at the moment the row wraps north→south, which is the south pole.
const tileCache = [];             // [{ canvas, entry }, ...]
let cacheCursor = 0;              // queue position for next pre-render
let cacheFilling = false;
const CACHE_TARGET = 24;

// Background-fill the tile cache up to CACHE_TARGET entries. Each call only
// runs one instance at a time; subsequent calls while a fill is in flight
// are no-ops (the in-flight fill will keep going until full).
async function fillCache() {
  if (cacheFilling) return;
  if (tileQueue.length === 0) return;
  cacheFilling = true;
  const gen = stampGen;
  try {
    while (tileCache.length < CACHE_TARGET && gen === stampGen) {
      const entry = tileQueue[cacheCursor % tileQueue.length];
      cacheCursor++;
      const tileCanvas = await renderPostTile(entry, TILE_PX);
      if (gen !== stampGen) return;
      tileCache.push({ canvas: tileCanvas, entry });
    }
  } finally {
    cacheFilling = false;
  }
}

// Synchronously composite cached tiles into the given atlas row + upload to
// GPU. No awaits — the entire swap lands in one tick so it visually lines up
// with the row's south-pole crossing. Returns false if the cache doesn't
// have enough tiles yet (caller should retry next frame).
function replaceRowFromCache(rowIdx) {
  const c = state.atlasCanvas;
  if (!c) return false;
  const { cols, rows, pad } = gridSpec();
  if (rowIdx >= rows) return false;
  if (tileCache.length < cols) return false;   // not enough cached, defer

  const ctx = c.getContext('2d');
  const cellW = c.width / cols;
  const cellH = c.height / rows;
  const padX  = cellW * pad;
  const padY  = cellH * pad;
  const y = rowIdx * cellH + padY;
  const h = cellH - padY * 2;
  let lastHandle = '';
  for (let col = 0; col < cols; col++) {
    const cached = tileCache.shift();
    if (!cached) break;
    const x = col * cellW + padX;
    const w = cellW - padX * 2;
    ctx.clearRect(x, y, w, h);
    ctx.drawImage(cached.canvas, 0, 0, TILE_PX, TILE_PX, x, y, w, h);
    stampedTiles.set(rowIdx * cols + col, cached.entry);
    lastHandle = cached.entry.author?.handle || lastHandle;
  }
  setStripFromCanvas(c);
  // Top up the cache for next row's worth of swaps.
  fillCache();
  setStatus(`row ${rowIdx + 1}/${rows} ↺ @${lastHandle} · cache ${tileCache.length}/${CACHE_TARGET}`);
  return true;
}

function nextQueueEntry() {
  if (tileQueue.length === 0) return null;
  const entry = tileQueue[queueIndex % tileQueue.length];
  queueIndex++;
  return entry;
}

async function ensureSourceLoaded(wantedKey) {
  // wantedKey is `thread:<url>` or `feed:<feed-uri>` — caching key so we
  // don't re-fetch the same source. Switching mode always re-fetches.
  if (tileQueue.length && wantedKey === lastFetchedUrl) return true;

  if (wantedKey.startsWith('feed:')) {
    const feedUri = wantedKey.slice(5);
    const feedLabel = feedSelect?.selectedOptions?.[0]?.textContent || 'feed';
    const posts = await loadFeedPosts(feedUri);
    tileQueue = buildFeedQueue(posts);
    if (tileQueue.length === 0) {
      setStatus(`feed returned no postable content`, true);
      return false;
    }
    queueIndex = 0;
    mediaAttempted = 0;
    mediaSucceeded = 0;
    lastMediaFailReason = '';
    lastFetchedUrl = wantedKey;
    const withMedia = tileQueue.filter(t => t.media?.length).length;
    setStatus(
      `${feedLabel} · ${tileQueue.length} tiles (${withMedia} with media) · autostamping…`,
    );
    return true;
  }

  // Thread mode (default).
  const wantedUrl = wantedKey.slice(7);
  const { posts } = await loadThread(wantedUrl);
  const rootHandle = posts[0]?.author?.handle || 'unknown';
  tileQueue = buildPostQueue(posts);
  if (tileQueue.length === 0) {
    setStatus(`thread has no postable content (root @${rootHandle})`, true);
    return false;
  }
  queueIndex = 0;
  mediaAttempted = 0;
  mediaSucceeded = 0;
  lastMediaFailReason = '';
  lastFetchedUrl = wantedKey;
  const withMedia = tileQueue.filter(t => t.media?.length).length;
  const videos = tileQueue.reduce((n, t) => n + (t.media || []).filter(m => m.kind === 'video').length, 0);
  const videoNote = videos ? `, ${videos} video${videos === 1 ? '' : 's'}` : '';
  setStatus(
    `${posts.length} posts → ${tileQueue.length} tiles (${withMedia} with media${videoNote}) · autostamping…`,
  );
  return true;
}

// Stamp the given queue entry into a specific (rowIdx, colIdx) cell of the
// atlas. Used both by the initial fill (slot index 0..C*R-1) and by the
// cyclic row replacer (rowIdx = whichever row just wrapped past the pole).
async function stampInSlot(rowIdx, colIdx, entry) {
  const tileCanvas = await renderPostTile(entry, TILE_PX);
  const c = state.atlasCanvas;
  if (!c) return;
  const ctx = c.getContext('2d');
  const { cols, rows, pad } = gridSpec();
  if (rowIdx >= rows || colIdx >= cols) return;   // slider changed mid-flight
  const cellW = c.width / cols;
  const cellH = c.height / rows;
  const padX  = cellW * pad;
  const padY  = cellH * pad;
  const x = colIdx * cellW + padX;
  const y = rowIdx * cellH + padY;
  const w = cellW - padX * 2;
  const h = cellH - padY * 2;
  // Wipe the inner tile region so previous content doesn't peek through if
  // the new tile is letterboxed; padding ring keeps its background.
  ctx.clearRect(x, y, w, h);
  ctx.drawImage(tileCanvas, 0, 0, TILE_PX, TILE_PX, x, y, w, h);
  setStripFromCanvas(c);
  stampedTiles.set(rowIdx * cols + colIdx, entry);
}

async function autoStamp() {
  const gen = ++stampGen;
  initialFillDone = false;
  cycleProgress = 0;
  lastReplaceCycle = 0;
  nextRowToReplace = 0;
  pendingReplacements = 0;
  tileCache.length = 0;
  cacheFilling = false;
  const { cols, rows } = gridSpec();
  const cap = cols * rows;
  let placed = 0;
  while (placed < cap) {
    if (gen !== stampGen) return;
    const entry = nextQueueEntry();
    if (!entry) break;
    const colIdx = placed % cols;
    const rowIdx = Math.floor(placed / cols);
    await stampInSlot(rowIdx, colIdx, entry);
    placed++;
    if (gen !== stampGen) return;
    const k = entry.kind === 'quote' ? '↪' : '';
    const mediaStat = mediaAttempted
      ? ` · media ${mediaSucceeded}/${mediaAttempted}`
      : '';
    setStatus(`stamped ${placed}/${cap} initial · ${k}@${entry.author?.handle || ''}${mediaStat}`);
    if (placed < cap) await new Promise(r => setTimeout(r, AUTOSTAMP_DELAY_MS));
  }
  if (gen !== stampGen) return;
  initialFillDone = true;
  // Cache cursor picks up where the initial fill left off in the queue, so
  // pre-rendered tiles slot in seamlessly after the initial batch.
  cacheCursor = queueIndex;
  fillCache();
  // After the initial fill the cyclic replacer takes over (see frame()).
  setStatus(`stamped ${placed}/${cap} · cycling through ${tileQueue.length} posts as the orb scrolls`);
}

// Run by frame() each tick. If the scroll has advanced enough to wrap another
// row past the north pole, do an instant swap from the pre-render cache so
// the visual change lands at the moment of the pole crossing. If the cache
// is too small (slow network), the swap is deferred until enough tiles are
// ready — we'd rather slip a beat than swap mid-flight.
function tickCyclicReplacer() {
  if (!initialFillDone || paused || tileQueue.length === 0) return;
  const { rows } = gridSpec();
  const threshold = 1 / Math.max(1, rows);
  while (cycleProgress - lastReplaceCycle >= threshold) {
    lastReplaceCycle += threshold;
    pendingReplacements++;
  }
  // Cap the backlog — if we get really far behind (fast scroll + slow media
  // loads) we'd otherwise spend forever catching up rather than showing the
  // current cycle. Two cycles of pending feels like the right ceiling.
  const ceiling = rows * 2;
  if (pendingReplacements > ceiling) pendingReplacements = ceiling;

  if (pendingReplacements > 0) {
    const rowIdx = nextRowToReplace;
    if (replaceRowFromCache(rowIdx)) {
      pendingReplacements--;
      nextRowToReplace = (nextRowToReplace + 1) % rows;
    } else {
      // Not enough cached tiles to swap atomically; kick a refill and try
      // again next frame. We do NOT decrement pendingReplacements — we'll
      // catch up once the cache has enough.
      fillCache();
    }
  }
}

function currentSourceKey() {
  if (sourceMode === 'feed') return 'feed:' + feedSelect.value;
  return 'thread:' + urlInput.value.trim();
}

async function loadAndAutoStamp() {
  if (loadBtn.disabled) return;
  loadBtn.disabled = true;
  try {
    const ok = await ensureSourceLoaded(currentSourceKey());
    if (ok) await autoStamp();
  } catch (err) {
    console.error(err);
    setStatus('error: ' + (err?.message || String(err)), true);
  } finally {
    loadBtn.disabled = false;
  }
}

form.addEventListener('submit', (e) => {
  e.preventDefault();
  loadAndAutoStamp();
});

// Mode toggle: swap the visible input (URL vs feed select) and immediately
// load the new source so the orb reflects the click. The previous queue
// stays in tileQueue until ensureSourceLoaded() overwrites it.
function setMode(next) {
  if (next === sourceMode) return;
  sourceMode = next;
  const isThread = sourceMode === 'thread';
  modeThreadBtn.classList.toggle('active', isThread);
  modeFeedBtn.classList.toggle('active', !isThread);
  modeThreadBtn.setAttribute('aria-selected', String(isThread));
  modeFeedBtn.setAttribute('aria-selected', String(!isThread));
  urlInput.hidden = !isThread;
  feedSelect.hidden = isThread;
  loadAndAutoStamp();
}
modeThreadBtn.addEventListener('click', () => setMode('thread'));
modeFeedBtn.addEventListener('click', () => setMode('feed'));
feedSelect.addEventListener('change', () => {
  if (sourceMode === 'feed') loadAndAutoStamp();
});

const pauseBtn = document.getElementById('pause-btn');
pauseBtn.addEventListener('click', () => {
  paused = !paused;
  pauseBtn.textContent = paused ? '▶' : '⏸';
  pauseBtn.title = paused ? 'resume orb auto-motion' : 'pause orb auto-motion';
  setStatus(paused ? 'orb paused · drag still works · tap a tile to open it' : 'orb resumed');
});

(async () => {
  try {
    await initWebGPU();
    requestAnimationFrame(frame);
    setStatus('checking image proxy…');
    const probe = await probeImageProxy();
    if (probe.ok) {
      setStatus(`ready · image proxy ${probe.version} · loading default thread…`);
    } else {
      // Our same-origin proxy isn't routed; mark it down so loadImage skips
      // straight to the public-proxy fallback instead of retrying every time.
      selfProxyKnownDown = true;
      const why = probe.status ? `HTTP ${probe.status}` : (probe.error || 'no response');
      setStatus(`ready · public CORS proxy (our /api/img returned ${why}) · loading default thread…`);
      console.warn('orb: /api/img probe failed; using corsproxy.io fallback', probe);
    }
    // Auto-load the default thread and autostamp it onto the orb.
    loadAndAutoStamp();
  } catch (err) {
    console.error('orb init failed:', err);
    setStatus('init failed: ' + (err?.message || String(err)), true);
  }
})();

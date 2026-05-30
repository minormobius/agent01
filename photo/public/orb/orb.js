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
const MAX_TILES    = 96;    // queue cap (posts + quoted posts)
const TILE_PER_ROW = 4;
const MAX_TEX_AXIS = 4096;
const MAX_TILE     = 384;
const MIN_TILE     = 64;

const canvas = document.getElementById('orb');
const statusEl = document.getElementById('status');
const fallbackEl = document.getElementById('fallback');
const form = document.getElementById('thread-form');
const urlInput = document.getElementById('thread-url');
const loadBtn = document.getElementById('load-btn');
const scrollSlider = document.getElementById('scroll-speed');
const spinSlider = document.getElementById('spin-speed');
const brightnessSlider = document.getElementById('brightness');
const colsSlider = document.getElementById('cols');

// Stamp-grid layout: derive rows from cols so cells render square on the
// sphere. The atlas is 512x2048 (1:4 in pixels) but equirectangular wrapping
// gives 360° longitude / 180° latitude, so a square cell needs cellH = 2*cellW
// — hence rows = 2 * cols.
function gridSpec() {
  const cols = Math.max(1, parseInt(colsSlider.value, 10) || 4);
  const rows = Math.max(1, cols * 2);
  return { cols, rows };
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

function resizeCanvas() {
  // Cap DPR conservatively — iPhones report 3, which means 9x the fragment
  // shader cost vs CSS pixels. 1.5 is the sweet spot for an orb at any size.
  const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
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
    const image = firstImageInEmbed(p.embed);
    if (text || image) {
      out.push({ kind: 'post', uri: p.uri, author: p.author, text, image, createdAt: p.createdAt });
    }
  }
  return out;
}

function addQuotedTo(out, m) {
  if (out.length >= MAX_TILES) return;
  if (m.type !== 'quote' || !m.author) return;
  const text = (m.text || '').trim();
  const image = firstImageInMediaList(m.embeds);
  if (text || image) {
    out.push({
      kind: 'quote',
      uri: m.uri,
      author: m.author,
      text,
      image,
      createdAt: m.createdAt,
    });
  }
  // A quote can itself contain quotes — flatten those too.
  if (Array.isArray(m.embeds)) for (const inner of m.embeds) addQuotedTo(out, inner);
}

function firstImageInEmbed(embed) {
  if (!embed) return null;
  return firstImageInMediaList(extractMedia(embed));
}
function firstImageInMediaList(items) {
  if (!Array.isArray(items)) return null;
  for (const m of items) {
    if (m.type === 'image' && m.thumb) return { thumb: m.thumb, fullsize: m.fullsize, alt: m.alt || '' };
    if (m.type === 'quote' && Array.isArray(m.embeds)) {
      const inner = firstImageInMediaList(m.embeds);
      if (inner) return inner;
    }
  }
  return null;
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
// All image fetches go through /api/img (a Pages Function on this same
// origin) which proxies to cdn.bsky.app server-side. cdn.bsky.app Origin-
// checks cross-origin browser fetches and returns 403; server-side fetch
// doesn't send a browser Origin header so it returns 200, and we re-emit
// the bytes with Access-Control-Allow-Origin so canvas/WebGPU can read them.
const IMG_PROXY = '/api/img?u=';
let lastImageError = '';

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
  return await tryFetchAsBitmap(IMG_PROXY + encodeURIComponent(url));
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
// image is best-effort (failed image just leaves a text-only card).
async function renderPostTile(entry, size) {
  const c = document.createElement('canvas');
  c.width = size; c.height = size;
  const ctx = c.getContext('2d');

  const hue = hashHue(entry.author?.handle || entry.uri || 'x');
  ctx.fillStyle = `hsl(${hue}, 50%, 20%)`;
  ctx.fillRect(0, 0, size, size);

  // Try the image — proxy through /api/img, ignore failure.
  let imgArea = 0;
  if (entry.image?.thumb) {
    const img = await loadImage(entry.image.thumb);
    if (img) {
      imgArea = Math.floor(size * 0.58);
      drawCoverImage(ctx, img, 0, 0, size, imgArea);
      // soft fade at the bottom into the text area
      const fade = ctx.createLinearGradient(0, imgArea - 40, 0, imgArea);
      fade.addColorStop(0, 'rgba(0,0,0,0)');
      fade.addColorStop(1, 'rgba(0,0,0,0.55)');
      ctx.fillStyle = fade;
      ctx.fillRect(0, imgArea - 40, size, 40);
    }
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

  const sphere = buildSphere(48, 64);   // was 80x128 — still plenty smooth
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
  placeholder.width = 512; placeholder.height = 2048;
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

  // auto scroll / spin (slider units → reasonable per-second rates)
  state.scroll = (state.scroll + dt * parseFloat(scrollSlider.value) * 0.0012) % 1;
  if (!dragState) {
    state.yaw += dt * parseFloat(spinSlider.value) * 0.004;
  }

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
  pointers.delete(e.pointerId);
  try { canvas.releasePointerCapture(e.pointerId); } catch {}
  // Re-baseline so lifting one finger of a pinch doesn't snap the view.
  refreshGesture();
}
canvas.addEventListener('pointerup', endPointer);
canvas.addEventListener('pointercancel', endPointer);
canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  const f = e.deltaY > 0 ? 1.08 : 1 / 1.08;
  state.distance = Math.max(1.3, Math.min(8, state.distance * f));
}, { passive: false });

// Cols slider clears existing stamps and resets the queue cursor so the user
// can re-fill into the new grid. We keep the fetched tileQueue so they don't
// have to re-fetch the thread.
colsSlider.addEventListener('change', () => {
  if (!state.atlasCanvas) return;
  paintCelestialPattern(state.atlasCanvas);
  setStripFromCanvas(state.atlasCanvas);
  queueIndex = 0;
  successCount = 0;
  const { cols, rows } = gridSpec();
  if (tileQueue.length) {
    setStatus(`reset · grid ${cols}×${rows} · click load to stamp into the new layout`);
  } else {
    setStatus(`grid ${cols}×${rows}`);
  }
});

// ─────────────────────────────── Bootstrap ──────────────────────────────

// Each click stamps one post-tile onto the orb's atlas. Text always renders
// (it's drawn straight from thread.js's flattened post data), and the image
// inside the tile is best-effort — a 404 on the thumbnail just leaves a
// text-only card with the post's author + body. The orb populates regardless
// of CDN health.
let tileQueue = [];
let queueIndex = 0;
let successCount = 0;
let lastFetchedUrl = '';

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (loadBtn.disabled) return;
  loadBtn.disabled = true;
  try {
    const wantedUrl = urlInput.value.trim();
    const needFetch = tileQueue.length === 0 || wantedUrl !== lastFetchedUrl;

    if (needFetch) {
      const { posts } = await loadThread(wantedUrl);
      const rootHandle = posts[0]?.author?.handle || 'unknown';
      tileQueue = buildPostQueue(posts);
      if (tileQueue.length === 0) {
        setStatus(`thread has no postable content (root @${rootHandle})`, true);
        return;
      }
      queueIndex = 0;
      successCount = 0;
      lastFetchedUrl = wantedUrl;
      const imgCount = tileQueue.filter(t => t.image).length;
      setStatus(
        `${posts.length} posts → ${tileQueue.length} tiles (${imgCount} with images) · click load to stamp one`,
      );
      loadBtn.textContent = 'stamp +1';
      return;
    }

    if (queueIndex >= tileQueue.length) {
      setStatus(`exhausted queue · ${successCount} stamped`);
      return;
    }

    const entry = tileQueue[queueIndex];
    setStatus(`rendering tile ${queueIndex + 1} / ${tileQueue.length} · @${entry.author?.handle || ''}…`);

    // Render the tile at its natural size, then composite into the atlas grid.
    const TILE_PX = 256;
    const tileCanvas = await renderPostTile(entry, TILE_PX);

    const c = state.atlasCanvas;
    const ctx = c.getContext('2d');
    const { cols, rows } = gridSpec();
    const cellW = c.width / cols;
    const cellH = c.height / rows;
    // Fill each cell entirely (tiles are already rendered square at TILE_PX,
    // and we map a square source to a non-square cell — the sphere geometry
    // un-stretches it back). No padding so the orb is fully covered.
    const i = successCount;
    const slot = i % (cols * rows);                    // wrap if user over-stamps
    const col = slot % cols;
    const row = Math.floor(slot / cols);
    const x = col * cellW;
    const y = row * cellH;
    ctx.drawImage(tileCanvas, 0, 0, TILE_PX, TILE_PX, x, y, cellW, cellH);
    setStripFromCanvas(c);

    queueIndex++;
    successCount++;
    const k = entry.kind === 'quote' ? '↪' : '';
    const gridFull = successCount >= cols * rows ? ' (grid full · next stamps wrap)' : '';
    setStatus(`stamped ${successCount} / ${tileQueue.length} ${k} @${entry.author?.handle || ''}${gridFull}`);
  } catch (err) {
    console.error(err);
    setStatus('error: ' + (err?.message || String(err)), true);
  } finally {
    loadBtn.disabled = false;
  }
});

(async () => {
  try {
    await initWebGPU();
    requestAnimationFrame(frame);
    // No auto-load: the orb just sits and glows on its own. Thread loading
    // is wired up (paste a URL + hit load) but doesn't fire until asked.
    setStatus('ready · paste a thread URL and hit load to populate');
  } catch (err) {
    console.error('orb init failed:', err);
    setStatus('init failed: ' + (err?.message || String(err)), true);
  }
})();

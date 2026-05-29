// orb — a thread's images wrapped onto a glowing WebGPU sphere.
//
// Pipeline:
//   1. Parse a bsky.app post URL, resolve the handle, fetch the thread.
//      Climb to the root, re-fetch with depth=1000, collect all embedded
//      images BFS-style.
//   2. Pack the images into a single offscreen 2D canvas as square cover-fit
//      tiles arranged 4-per-row — that's the "Cartesian map".
//   3. Upload that canvas as a GPU texture. Wrap it onto a UV sphere with
//      equirectangular UVs (U = longitude, V = latitude). The fragment
//      shader samples with V offset by a scroll uniform, modulo 1.0,
//      producing the auto-scroll behaviour. Wraparound happens at the pole,
//      which is a degenerate point on the sphere so there's no seam.
//   4. Glow: emissive shader with `1 - exp(-c*k)` soft saturation, plus a
//      CSS warm radial halo behind the canvas.

const DEFAULT_URL = 'https://bsky.app/profile/norvid-studies.bsky.social/post/3mmwrhd6ots2a';
const APPVIEW = 'https://public.api.bsky.app';
const MAX_IMAGES   = 96;    // smaller default — easier first paint
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

function parseBskyUrl(url) {
  const m = url.match(/bsky\.app\/profile\/([^/]+)\/post\/([^/?#]+)/);
  if (!m) throw new Error('Not a bsky.app post URL');
  return { handle: decodeURIComponent(m[1]), rkey: m[2] };
}

async function resolveHandle(handle) {
  if (handle.startsWith('did:')) return handle;
  const r = await fetch(`${APPVIEW}/xrpc/com.atproto.identity.resolveHandle?handle=${encodeURIComponent(handle)}`);
  if (!r.ok) throw new Error(`resolveHandle: HTTP ${r.status}`);
  return (await r.json()).did;
}

async function getPostThread(uri, depth = 1000, parentHeight = 1000) {
  const u = new URL(`${APPVIEW}/xrpc/app.bsky.feed.getPostThread`);
  u.searchParams.set('uri', uri);
  u.searchParams.set('depth', String(depth));
  u.searchParams.set('parentHeight', String(parentHeight));
  const r = await fetch(u);
  if (!r.ok) throw new Error(`getPostThread: HTTP ${r.status}`);
  const j = await r.json();
  if (!j.thread || j.thread.$type !== 'app.bsky.feed.defs#threadViewPost')
    throw new Error('Thread not viewable (blocked or private?)');
  return j.thread;
}

function climbToRoot(thread) {
  let cur = thread;
  while (cur.parent && cur.parent.$type === 'app.bsky.feed.defs#threadViewPost') {
    cur = cur.parent;
  }
  return cur;
}

// Recursively walks an embed tree, collecting image refs. Handles three view
// types:
//   - app.bsky.embed.images#view           — direct images on this post
//   - app.bsky.embed.recordWithMedia#view  — text + media + quote
//   - app.bsky.embed.record#view           — a pure quote-post; walk into the
//                                            quoted record's own `embeds`
// Each collected image is attributed to the post (or quoted post) it lives on,
// so quote-archive threads display the original authors, not the OP.
function collectFromEmbed(out, embed, attributedAuthor) {
  if (!embed || out.length >= MAX_IMAGES) return;
  const t = embed.$type;
  if (t === 'app.bsky.embed.images#view') {
    for (const im of embed.images) {
      if (out.length >= MAX_IMAGES) break;
      out.push({
        thumb: im.thumb,
        fullsize: im.fullsize,
        alt: im.alt || '',
        authorHandle: attributedAuthor?.handle || '',
      });
    }
    return;
  }
  if (t === 'app.bsky.embed.recordWithMedia#view') {
    if (embed.media)  collectFromEmbed(out, embed.media, attributedAuthor);
    if (embed.record) collectFromEmbed(out, embed.record, attributedAuthor);
    return;
  }
  if (t === 'app.bsky.embed.record#view') {
    const inner = embed.record;
    if (inner && inner.$type === 'app.bsky.embed.record#viewRecord') {
      const quotedAuthor = inner.author || attributedAuthor;
      if (Array.isArray(inner.embeds)) {
        for (const e of inner.embeds) collectFromEmbed(out, e, quotedAuthor);
      }
    }
    return;
  }
}

// BFS through the thread tree so the visible scroll order roughly tracks
// thread time (or at least the breadth-first walk of replies).
function collectImages(rootThread) {
  const out = [];
  const queue = [rootThread];
  while (queue.length && out.length < MAX_IMAGES) {
    const node = queue.shift();
    if (!node?.post) continue;
    collectFromEmbed(out, node.post.embed, node.post.author);
    if (Array.isArray(node.replies)) {
      for (const r of node.replies) {
        if (r?.$type === 'app.bsky.feed.defs#threadViewPost') queue.push(r);
      }
    }
  }
  return out;
}

async function loadThread(url) {
  setStatus('parsing URL…');
  const { handle, rkey } = parseBskyUrl(url);
  setStatus(`resolving @${handle}…`);
  const did = await resolveHandle(handle);
  const uri = `at://${did}/app.bsky.feed.post/${rkey}`;
  setStatus('fetching thread…');
  const initial = await getPostThread(uri);
  const root = climbToRoot(initial);
  let rootThread = root;
  if (root.post.uri !== uri) {
    setStatus('found root — fetching full subtree…');
    rootThread = await getPostThread(root.post.uri);
  }
  const images = collectImages(rootThread);
  return { images, root: rootThread.post };
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
// NOTE: cdn.bsky.app doesn't send Access-Control-Allow-Origin, so cross-
// origin fetch fails with TypeError. The right long-term fix is a route on
// our own worker (e.g. /api/imgproxy?url=…) that re-sends the bytes with
// CORS headers. For now we fall back to corsproxy.io after a direct CORS
// failure so we can verify the rest of the pipeline works end-to-end.
const CORS_PROXY = 'https://corsproxy.io/?';
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
  // Direct.
  let bm = await tryFetchAsBitmap(url);
  if (bm) return bm;
  // If that was a CORS failure (the common case for cdn.bsky.app), retry
  // through a public proxy. HTTP errors aren't retried — a 404 on direct is
  // still a 404 through the proxy.
  if (lastImageError === 'network/CORS') {
    bm = await tryFetchAsBitmap(CORS_PROXY + encodeURIComponent(url));
    if (bm) { lastImageError = ''; return bm; }
    // proxy itself failed — keep the proxy's error as lastImageError
  }
  return null;
}

function drawTile(ctx, img, dx, dy, size) {
  // Works for both HTMLImageElement and ImageBitmap.
  const w = img.naturalWidth || img.width;
  const h = img.naturalHeight || img.height;
  const sw = Math.min(w, h);
  const sx = (w - sw) / 2;
  const sy = (h - sw) / 2;
  ctx.drawImage(img, sx, sy, sw, sw, dx, dy, size, size);
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
  let uv = vec2<f32>(in.uv.x, fract(in.uv.y + u.scroll));
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

  // Placeholder texture: a procedural "celestial body" pattern. This is what
  // the orb shows when no thread has been loaded — meant to be pretty in its
  // own right, not just a debug fill. Tall (1:4) so it wraps the sphere from
  // pole to pole with full vertical resolution.
  const placeholder = document.createElement('canvas');
  placeholder.width = 256; placeholder.height = 1024;
  const pctx = placeholder.getContext('2d');
  const grad = pctx.createLinearGradient(0, 0, 0, 1024);
  grad.addColorStop(0.00, '#1a0d36');
  grad.addColorStop(0.18, '#7a2d4f');
  grad.addColorStop(0.35, '#d4b86a');
  grad.addColorStop(0.50, '#e8a04a');
  grad.addColorStop(0.65, '#d4b86a');
  grad.addColorStop(0.82, '#5c3d96');
  grad.addColorStop(1.00, '#1a0d36');
  pctx.fillStyle = grad;
  pctx.fillRect(0, 0, 256, 1024);
  pctx.fillStyle = 'rgba(255, 200, 140, 0.14)';
  for (let y = 0; y < 1024; y += 16) pctx.fillRect(0, y, 256, 1);
  pctx.fillStyle = 'rgba(255, 240, 220, 0.55)';
  for (let i = 0; i < 60; i++) {
    const x = Math.random() * 256;
    const y = Math.random() * 1024;
    const r = 0.8 + Math.random() * 2.2;
    pctx.beginPath();
    pctx.arc(x, y, r, 0, Math.PI * 2);
    pctx.fill();
  }

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

// ─────────────────────────────── Bootstrap ──────────────────────────────

// Minimal one-at-a-time stamping. First click (or URL change) fetches the
// thread and stores the image list; each click stamps the next image onto
// the placeholder canvas (so the celestial backdrop stays put — failed loads
// or weird sizes won't black-hole the orb). Re-uploads the texture after
// each stamp.
let imageQueue = [];
let stampedCount = 0;
let lastFetchedUrl = '';

function urlTail(u) {
  if (!u) return '(none)';
  const idx = u.lastIndexOf('/');
  return u.slice(idx + 1).slice(0, 48);
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (loadBtn.disabled) return;
  loadBtn.disabled = true;
  try {
    const wantedUrl = urlInput.value.trim();
    const needFetch = imageQueue.length === 0 || wantedUrl !== lastFetchedUrl;

    if (needFetch) {
      setStatus('fetching thread…');
      const { images, root } = await loadThread(wantedUrl);
      if (images.length === 0) {
        setStatus(`no images in thread (root @${root.author.handle}) — even after walking quote embeds`, true);
        imageQueue = [];
        return;
      }
      imageQueue = images;
      stampedCount = 0;
      lastFetchedUrl = wantedUrl;
      setStatus(`thread has ${images.length} images (incl. quote embeds) · click load to stamp one`);
      loadBtn.textContent = 'stamp +1';
      return;
    }

    if (stampedCount >= imageQueue.length) {
      setStatus(`done · ${stampedCount} stamped`);
      return;
    }

    const entry = imageQueue[stampedCount];
    setStatus(`loading image ${stampedCount + 1} / ${imageQueue.length}…`);
    let img = await loadImage(entry.thumb);
    const firstErr = lastImageError;
    // CDN sometimes evicts the cached thumb while the fullsize is still there;
    // try the fullsize URL as a fallback.
    if (!img && entry.fullsize && entry.fullsize !== entry.thumb) {
      img = await loadImage(entry.fullsize);
    }
    if (!img) {
      stampedCount++;
      const reason = lastImageError || firstErr || 'unknown';
      setStatus(`image ${stampedCount} failed (${reason}) · …/${urlTail(entry.thumb)}`, true);
      console.warn('orb: image failed to load:', { thumb: entry.thumb, fullsize: entry.fullsize, reason });
      return;
    }

    // Stamp onto the placeholder canvas. Cycle through a small grid of
    // positions so successive stamps spread out over the sphere.
    const c = state.atlasCanvas;
    const ctx = c.getContext('2d');
    const cols = 2, rows = 8;
    const cellW = c.width / cols;
    const cellH = c.height / rows;
    const tile = Math.floor(Math.min(cellW, cellH) * 0.86);
    const i = stampedCount;
    const col = i % cols;
    const row = Math.floor(i / cols) % rows;
    const x = col * cellW + (cellW - tile) / 2;
    const y = row * cellH + (cellH - tile) / 2;
    drawTile(ctx, img, x, y, tile);
    setStripFromCanvas(c);

    stampedCount++;
    setStatus(`stamped ${stampedCount} / ${imageQueue.length} · @${entry.authorHandle}`);
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

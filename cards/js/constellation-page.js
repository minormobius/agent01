// ── Flavor Constellation — WebGPU 3D UMAP of compound embeddings ────
import { FOOD_CATEGORIES } from "./yum-pool.js";

// ── State ───────────────────────────────────────────────────────────
let idx = null, emb = null, pts = null;
let activeCats = new Set(Object.keys(FOOD_CATEGORIES));
let searchHits = new Set();
let hovered = -1;
let lastInteract = 0;

const $ = id => document.getElementById(id);
const statusEl = $("cst-status");
const box = $("cst-box");
const tooltip = $("cst-tooltip");

// ── UMAP helpers ────────────────────────────────────────────────────

function buildKNN(data, dim, k) {
  const n = data.length / dim;
  const nn = new Int32Array(n * k), nd = new Float32Array(n * k);
  for (let i = 0; i < n; i++) {
    const dists = [];
    for (let j = 0; j < n; j++) {
      if (i === j) continue;
      let d = 0;
      for (let dd = 0; dd < dim; dd++) { const v = data[i*dim+dd] - data[j*dim+dd]; d += v*v; }
      dists.push({ j, d });
    }
    dists.sort((a, b) => a.d - b.d);
    for (let ki = 0; ki < k; ki++) { nn[i*k+ki] = dists[ki].j; nd[i*k+ki] = Math.sqrt(dists[ki].d); }
  }
  return { nn, nd };
}

function runUMAP3D(data, dim, nEpochs = 300) {
  const n = data.length / dim, k = Math.min(15, n - 1);
  statusEl.textContent = `UMAP: building kNN (${n} pts)...`;
  const { nn, nd } = buildKNN(data, dim, k);

  // Compute sigmas (bandwidths)
  const sigmas = new Float32Array(n);
  const target = Math.log2(k);
  for (let i = 0; i < n; i++) {
    let lo = 0, hi = 1000, mid = 1;
    for (let iter = 0; iter < 64; iter++) {
      mid = (lo + hi) / 2;
      let sum = 0;
      for (let ki = 0; ki < k; ki++) sum += Math.exp(-nd[i*k+ki] / mid);
      if (Math.log2(sum + 1e-10) > target) hi = mid; else lo = mid;
    }
    sigmas[i] = mid;
  }

  // Fuzzy simplicial set
  const edges = new Map();
  const ek = (i, j) => i < j ? `${i},${j}` : `${j},${i}`;
  for (let i = 0; i < n; i++) {
    const rho = nd[i * k];
    for (let ki = 0; ki < k; ki++) {
      const j = nn[i*k+ki], d = nd[i*k+ki];
      const w = Math.exp(-Math.max(0, d - rho) / sigmas[i]);
      const key = ek(i, j), ex = edges.get(key) || 0;
      edges.set(key, ex + w - ex * w);
    }
  }

  // Init from PCA (first 3 dims) + jitter
  const Y = new Float32Array(n * 3);
  let mx = 0;
  for (let i = 0; i < n; i++) {
    Y[i*3] = data[i*dim]; Y[i*3+1] = data[i*dim+1]; Y[i*3+2] = data[i*dim+2];
    mx = Math.max(mx, Math.abs(Y[i*3]), Math.abs(Y[i*3+1]), Math.abs(Y[i*3+2]));
  }
  for (let i = 0; i < n * 3; i++) Y[i] = Y[i] / (mx + 1e-10) * 5 + (Math.random() - 0.5) * 0.01;

  // Optimize
  const edgeList = [];
  for (const [key, w] of edges) { const [i, j] = key.split(",").map(Number); edgeList.push({ i, j, w }); }
  const a = 1.929, b = 0.7915;

  for (let epoch = 0; epoch < nEpochs; epoch++) {
    const alpha = 1.0 * (1 - epoch / nEpochs);
    for (const { i, j, w } of edgeList) {
      if (Math.random() > w) continue;
      const dx = Y[i*3]-Y[j*3], dy = Y[i*3+1]-Y[j*3+1], dz = Y[i*3+2]-Y[j*3+2];
      const d2 = dx*dx + dy*dy + dz*dz + 0.001;
      const grad = (-2 * a * b * Math.pow(d2, b-1)) / (1 + a * Math.pow(d2, b));
      const gx = grad*dx*alpha, gy = grad*dy*alpha, gz = grad*dz*alpha;
      Y[i*3]+=gx; Y[i*3+1]+=gy; Y[i*3+2]+=gz;
      Y[j*3]-=gx; Y[j*3+1]-=gy; Y[j*3+2]-=gz;
    }
    for (let i = 0; i < n; i++) {
      for (let s = 0; s < 5; s++) {
        const j = Math.floor(Math.random() * n);
        if (i === j) continue;
        const dx = Y[i*3]-Y[j*3], dy = Y[i*3+1]-Y[j*3+1], dz = Y[i*3+2]-Y[j*3+2];
        const d2 = dx*dx + dy*dy + dz*dz + 0.001;
        const grad = (2 * b) / ((0.001 + d2) * (1 + a * Math.pow(d2, b)));
        const cl = v => Math.max(-4, Math.min(4, v));
        Y[i*3]+=cl(grad*dx*alpha); Y[i*3+1]+=cl(grad*dy*alpha); Y[i*3+2]+=cl(grad*dz*alpha);
      }
    }
  }
  return Y;
}

// ── Matrix math ─────────────────────────────────────────────────────
function mat4Perspective(fov, aspect, near, far) {
  const f = 1 / Math.tan(fov / 2), nf = 1 / (near - far);
  return new Float32Array([f/aspect,0,0,0, 0,f,0,0, 0,0,(far+near)*nf,-1, 0,0,2*far*near*nf,0]);
}
function mat4LookAt(eye, center, up) {
  const z = norm3(sub3(eye, center)), x = norm3(cross3(up, z)), y = cross3(z, x);
  return new Float32Array([x[0],y[0],z[0],0, x[1],y[1],z[1],0, x[2],y[2],z[2],0, -dot3(x,eye),-dot3(y,eye),-dot3(z,eye),1]);
}
function mat4Mul(a, b) {
  const o = new Float32Array(16);
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
    o[j*4+i] = a[i]*b[j*4] + a[4+i]*b[j*4+1] + a[8+i]*b[j*4+2] + a[12+i]*b[j*4+3];
  }
  return o;
}
function sub3(a, b) { return [a[0]-b[0], a[1]-b[1], a[2]-b[2]]; }
function cross3(a, b) { return [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]]; }
function dot3(a, b) { return a[0]*b[0]+a[1]*b[1]+a[2]*b[2]; }
function norm3(v) { const l = Math.sqrt(dot3(v,v)) || 1; return [v[0]/l, v[1]/l, v[2]/l]; }

// ── WebGPU WGSL shaders ────────────────────────────────────────────
const WGSL = /* wgsl */`
struct Uniforms {
  viewProj: mat4x4f,
  eye: vec3f,
  pointScale: f32,
  canvasSize: vec2f,
  _pad: vec2f,
};
@group(0) @binding(0) var<uniform> u: Uniforms;

struct Instance {
  @location(2) pos: vec3f,
  @location(3) color: vec3f,
  @location(4) size: f32,
  @location(5) highlight: f32,
};

struct VSOut {
  @builtin(position) pos: vec4f,
  @location(0) uv: vec2f,
  @location(1) color: vec3f,
  @location(2) highlight: f32,
};

@vertex fn vs(
  @location(0) quadPos: vec2f,
  inst: Instance,
) -> VSOut {
  var out: VSOut;

  let worldPos = inst.pos;
  let clip = u.viewProj * vec4f(worldPos, 1.0);
  let ndcW = clip.w;

  // Billboard size in clip space
  let sz = inst.size * u.pointScale * (1.0 + inst.highlight * 0.8);
  let pixelSize = sz / ndcW;
  let aspect = u.canvasSize.x / u.canvasSize.y;

  out.pos = clip + vec4f(quadPos.x * pixelSize / aspect, quadPos.y * pixelSize, 0.0, 0.0);
  out.uv = quadPos;
  out.color = inst.color;
  out.highlight = inst.highlight;
  return out;
}

@fragment fn fs(in: VSOut) -> @location(0) vec4f {
  let d = length(in.uv);
  if (d > 1.0) { discard; }

  let edge = smoothstep(1.0, 0.6, d);
  let glow = in.highlight * exp(-d * d * 2.0) * 0.5;
  let alpha = edge * 0.85 + glow;
  let col = in.color * (0.8 + 0.2 * (1.0 - d)) + vec3f(glow);

  return vec4f(col * alpha, alpha);
}
`;

// ── WebGPU init + rendering ─────────────────────────────────────────
let device, ctx, pipeline, uniformBuffer, uniformBG, quadVB, instanceBuf;
let canvasEl, overlayEl, overlayCtx;
let camTheta = 0.5, camPhi = 0.7, camDist = 20, camDistTarget = 20;
let camCenter = [0, 0, 0];
let drag = null;

function hexToRGB(hex) {
  const r = parseInt(hex.slice(1,3), 16) / 255;
  const g = parseInt(hex.slice(3,5), 16) / 255;
  const b = parseInt(hex.slice(5,7), 16) / 255;
  return [r, g, b];
}

async function initWebGPU() {
  if (!navigator.gpu) { $("cst-fallback").style.display = "flex"; return false; }
  const adapter = await navigator.gpu.requestAdapter();
  if (!adapter) { $("cst-fallback").style.display = "flex"; return false; }
  device = await adapter.requestDevice();

  canvasEl = $("cst-canvas");
  overlayEl = $("cst-overlay");
  overlayCtx = overlayEl.getContext("2d");

  ctx = canvasEl.getContext("webgpu");
  const format = navigator.gpu.getPreferredCanvasFormat();
  ctx.configure({ device, format, alphaMode: "opaque" });

  const shaderModule = device.createShaderModule({ code: WGSL });

  // Quad vertices: 2 triangles forming a [-1,1] square
  const quadData = new Float32Array([-1,-1, 1,-1, 1,1, -1,-1, 1,1, -1,1]);
  quadVB = device.createBuffer({ size: quadData.byteLength, usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST });
  device.queue.writeBuffer(quadVB, 0, quadData);

  // Uniform buffer
  uniformBuffer = device.createBuffer({ size: 128, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
  const bgl = device.createBindGroupLayout({
    entries: [{ binding: 0, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: "uniform" } }],
  });
  uniformBG = device.createBindGroup({ layout: bgl, entries: [{ binding: 0, resource: { buffer: uniformBuffer } }] });

  pipeline = device.createRenderPipeline({
    layout: device.createPipelineLayout({ bindGroupLayouts: [bgl] }),
    vertex: {
      module: shaderModule, entryPoint: "vs",
      buffers: [
        { arrayStride: 8, stepMode: "vertex", attributes: [{ shaderLocation: 0, offset: 0, format: "float32x2" }] },
        { arrayStride: 32, stepMode: "instance", attributes: [
          { shaderLocation: 2, offset: 0, format: "float32x3" },  // pos
          { shaderLocation: 3, offset: 12, format: "float32x3" }, // color
          { shaderLocation: 4, offset: 24, format: "float32" },   // size
          { shaderLocation: 5, offset: 28, format: "float32" },   // highlight
        ]},
      ],
    },
    fragment: { module: shaderModule, entryPoint: "fs", targets: [{ format, blend: {
      color: { srcFactor: "src-alpha", dstFactor: "one-minus-src-alpha" },
      alpha: { srcFactor: "one", dstFactor: "one-minus-src-alpha" },
    }}] },
    depthStencil: { format: "depth24plus", depthWriteEnabled: true, depthCompare: "less" },
    primitive: { topology: "triangle-list" },
  });

  return true;
}

function buildInstanceData() {
  if (!pts) return;
  const n = pts.length;
  const data = new Float32Array(n * 8); // pos(3) + color(3) + size(1) + highlight(1)
  const hasSearch = searchHits.size > 0;

  for (let i = 0; i < n; i++) {
    const p = pts[i];
    const vis = activeCats.has(p.cat);
    const isHit = hasSearch && searchHits.has(i);
    const isDim = hasSearch && !isHit;
    const isHov = i === hovered;
    const cat = FOOD_CATEGORIES[p.cat];
    const [r, g, b] = cat ? hexToRGB(cat.color) : [0.5, 0.5, 0.5];

    const off = i * 8;
    data[off]   = vis ? p.x : 99999; // hide by moving offscreen
    data[off+1] = vis ? p.y : 99999;
    data[off+2] = vis ? p.z : 99999;

    if (isDim) {
      data[off+3] = 0.15; data[off+4] = 0.15; data[off+5] = 0.15;
    } else {
      data[off+3] = r; data[off+4] = g; data[off+5] = b;
    }

    data[off+6] = isHov ? 0.08 : isHit ? 0.05 : 0.035; // size
    data[off+7] = isHov ? 1.0 : isHit ? 0.6 : 0.0;      // highlight
  }

  if (!instanceBuf || instanceBuf.size < data.byteLength) {
    if (instanceBuf) instanceBuf.destroy();
    instanceBuf = device.createBuffer({ size: data.byteLength, usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST });
  }
  device.queue.writeBuffer(instanceBuf, 0, data);
}

let depthTex = null;
function ensureDepth(w, h) {
  if (depthTex && depthTex.width === w && depthTex.height === h) return;
  if (depthTex) depthTex.destroy();
  depthTex = device.createTexture({ size: [w, h], format: "depth24plus", usage: GPUTextureUsage.RENDER_ATTACHMENT });
}

function resize() {
  const rect = box.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  const w = Math.floor(rect.width * dpr), h = Math.floor(rect.height * dpr);
  canvasEl.width = w; canvasEl.height = h;
  overlayEl.width = w; overlayEl.height = h;
  overlayEl.style.width = rect.width + "px";
  overlayEl.style.height = rect.height + "px";
}

function getEye() {
  return [
    camCenter[0] + camDist * Math.sin(camPhi) * Math.cos(camTheta),
    camCenter[1] + camDist * Math.cos(camPhi),
    camCenter[2] + camDist * Math.sin(camPhi) * Math.sin(camTheta),
  ];
}

function render() {
  if (!pts || !device) { requestAnimationFrame(render); return; }

  // Auto-rotate when idle
  if (Date.now() - lastInteract > 3000) {
    camTheta += 0.0008;
  }
  camDist += (camDistTarget - camDist) * 0.1;

  const w = canvasEl.width, h = canvasEl.height;
  if (w === 0 || h === 0) { requestAnimationFrame(render); return; }
  ensureDepth(w, h);

  const eye = getEye();
  const proj = mat4Perspective(Math.PI / 4, w / h, 0.1, 200);
  const view = mat4LookAt(eye, camCenter, [0, 1, 0]);
  const vp = mat4Mul(proj, view);

  // Write uniforms: viewProj(64) + eye(12) + pointScale(4) + canvasSize(8) + pad(8)
  const ub = new Float32Array(32);
  ub.set(vp, 0);
  ub.set(eye, 16);
  ub[19] = 1.0; // pointScale
  ub[20] = w; ub[21] = h;
  device.queue.writeBuffer(uniformBuffer, 0, ub);

  buildInstanceData();

  const enc = device.createCommandEncoder();
  const pass = enc.beginRenderPass({
    colorAttachments: [{ view: ctx.getCurrentTexture().createView(), clearValue: { r: 0.02, g: 0.02, b: 0.06, a: 1 }, loadOp: "clear", storeOp: "store" }],
    depthStencilAttachment: { view: depthTex.createView(), depthClearValue: 1, depthLoadOp: "clear", depthStoreOp: "store" },
  });
  pass.setPipeline(pipeline);
  pass.setBindGroup(0, uniformBG);
  pass.setVertexBuffer(0, quadVB);
  pass.setVertexBuffer(1, instanceBuf);
  pass.draw(6, pts.length);
  pass.end();
  device.queue.submit([enc.finish()]);

  // Overlay labels
  drawOverlay(vp, w, h);

  requestAnimationFrame(render);
}

function project(vp, x, y, z, w, h) {
  const cx = vp[0]*x + vp[4]*y + vp[8]*z + vp[12];
  const cy = vp[1]*x + vp[5]*y + vp[9]*z + vp[13];
  const cw = vp[3]*x + vp[7]*y + vp[11]*z + vp[15];
  if (cw <= 0) return null;
  return { sx: (cx/cw * 0.5 + 0.5) * w, sy: (1 - (cy/cw * 0.5 + 0.5)) * h };
}

function drawOverlay(vp, w, h) {
  const dpr = window.devicePixelRatio || 1;
  overlayCtx.clearRect(0, 0, w, h);
  if (!pts) return;

  overlayCtx.font = `${11 * dpr}px Georgia, serif`;
  overlayCtx.textAlign = "center";

  // Draw labels for search hits
  if (searchHits.size > 0) {
    overlayCtx.fillStyle = "rgba(255,255,255,0.9)";
    for (const i of searchHits) {
      const p = pts[i];
      if (!activeCats.has(p.cat)) continue;
      const s = project(vp, p.x, p.y, p.z, w, h);
      if (!s) continue;
      overlayCtx.fillText(p.title, s.sx, s.sy - 14 * dpr);
    }
  }

  // Hovered label
  if (hovered >= 0) {
    const p = pts[hovered];
    const s = project(vp, p.x, p.y, p.z, w, h);
    if (s) {
      overlayCtx.font = `bold ${13 * dpr}px Georgia, serif`;
      overlayCtx.fillStyle = "#fff";
      overlayCtx.fillText(p.title, s.sx, s.sy - 18 * dpr);
    }
  }
}

// ── Hit testing (screen-space) ──────────────────────────────────────
function findNearest(mx, my) {
  if (!pts) return -1;
  const dpr = window.devicePixelRatio || 1;
  const w = canvasEl.width, h = canvasEl.height;
  const eye = getEye();
  const proj = mat4Perspective(Math.PI / 4, w / h, 0.1, 200);
  const view = mat4LookAt(eye, camCenter, [0, 1, 0]);
  const vp = mat4Mul(proj, view);

  let best = -1, bestD = 20 * dpr * 20 * dpr;
  for (let i = 0; i < pts.length; i++) {
    if (!activeCats.has(pts[i].cat)) continue;
    const p = pts[i];
    const s = project(vp, p.x, p.y, p.z, w, h);
    if (!s) continue;
    const dx = s.sx - mx * dpr, dy = s.sy - my * dpr;
    const d2 = dx*dx + dy*dy;
    if (d2 < bestD) { bestD = d2; best = i; }
  }
  return best;
}

// ── Input handling ──────────────────────────────────────────────────
function getPos(e) {
  const rect = box.getBoundingClientRect();
  if (e.touches) return { x: e.touches[0].clientX - rect.left, y: e.touches[0].clientY - rect.top };
  return { x: e.clientX - rect.left, y: e.clientY - rect.top };
}

box.addEventListener("mousedown", e => {
  drag = { x: e.clientX, y: e.clientY, theta: camTheta, phi: camPhi };
  lastInteract = Date.now();
});
box.addEventListener("touchstart", e => {
  if (e.touches.length === 1) {
    const t = e.touches[0];
    drag = { x: t.clientX, y: t.clientY, theta: camTheta, phi: camPhi };
    lastInteract = Date.now();
  }
}, { passive: true });

window.addEventListener("mousemove", e => {
  if (drag) {
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    camTheta = drag.theta - dx * 0.005;
    camPhi = Math.max(0.1, Math.min(Math.PI - 0.1, drag.phi + dy * 0.005));
    lastInteract = Date.now();
    tooltip.style.display = "none";
    return;
  }
  const p = getPos(e);
  const hit = findNearest(p.x, p.y);
  if (hit !== hovered) {
    hovered = hit;
    if (hit >= 0) {
      const pt = pts[hit];
      const cat = FOOD_CATEGORIES[pt.cat];
      $("cst-tt-title").textContent = pt.title;
      $("cst-tt-cat").textContent = cat ? `${cat.icon} ${cat.name}` : pt.cat;
      tooltip.style.display = "block";
      tooltip.style.left = (p.x + 14) + "px";
      tooltip.style.top = (p.y - 10) + "px";
    } else {
      tooltip.style.display = "none";
    }
  } else if (hit >= 0) {
    tooltip.style.left = (p.x + 14) + "px";
    tooltip.style.top = (p.y - 10) + "px";
  }
});

window.addEventListener("mouseup", () => { drag = null; });
window.addEventListener("touchend", () => { drag = null; });
window.addEventListener("touchmove", e => {
  if (drag && e.touches.length === 1) {
    const t = e.touches[0];
    const dx = t.clientX - drag.x, dy = t.clientY - drag.y;
    camTheta = drag.theta - dx * 0.005;
    camPhi = Math.max(0.1, Math.min(Math.PI - 0.1, drag.phi + dy * 0.005));
    lastInteract = Date.now();
  }
}, { passive: true });

box.addEventListener("wheel", e => {
  e.preventDefault();
  camDistTarget *= e.deltaY > 0 ? 1.08 : 0.92;
  camDistTarget = Math.max(2, Math.min(80, camDistTarget));
  lastInteract = Date.now();
}, { passive: false });

// ── Legend ───────────────────────────────────────────────────────────
function buildLegend() {
  const el = $("cst-legend");
  el.innerHTML = Object.entries(FOOD_CATEGORIES).map(([key, cat]) => {
    const count = pts ? pts.filter(p => p.cat === key).length : 0;
    return `<div class="cst-legend-item" data-cat="${key}">
      <div class="cst-legend-dot" style="background:${cat.color}"></div>
      ${cat.icon} ${cat.name} <span style="color:var(--text-dim)">(${count})</span>
    </div>`;
  }).join("");
  el.querySelectorAll(".cst-legend-item").forEach(item => {
    item.addEventListener("click", () => {
      const key = item.dataset.cat;
      if (activeCats.has(key)) { activeCats.delete(key); item.classList.add("dim"); }
      else { activeCats.add(key); item.classList.remove("dim"); }
    });
  });
}

$("cst-all").addEventListener("click", () => {
  Object.keys(FOOD_CATEGORIES).forEach(k => activeCats.add(k));
  document.querySelectorAll(".cst-legend-item").forEach(i => i.classList.remove("dim"));
});
$("cst-none").addEventListener("click", () => {
  activeCats.clear();
  document.querySelectorAll(".cst-legend-item").forEach(i => i.classList.add("dim"));
});

// ── Search ──────────────────────────────────────────────────────────
$("cst-search").addEventListener("input", e => {
  const q = e.target.value.trim().toLowerCase();
  searchHits.clear();
  if (q.length > 0 && pts) {
    for (let i = 0; i < pts.length; i++) {
      if (pts[i].title.toLowerCase().includes(q)) searchHits.add(i);
    }
    statusEl.textContent = `${searchHits.size} match${searchHits.size !== 1 ? "es" : ""}`;
  } else {
    statusEl.textContent = pts ? `${pts.length} ingredients` : "";
  }
});

// ── Reset ───────────────────────────────────────────────────────────
function resetView() {
  if (!pts) return;
  let cx = 0, cy = 0, cz = 0;
  for (const p of pts) { cx += p.x; cy += p.y; cz += p.z; }
  camCenter = [cx/pts.length, cy/pts.length, cz/pts.length];
  let maxR = 0;
  for (const p of pts) {
    const dx = p.x-camCenter[0], dy = p.y-camCenter[1], dz = p.z-camCenter[2];
    maxR = Math.max(maxR, Math.sqrt(dx*dx+dy*dy+dz*dz));
  }
  camDistTarget = camDist = maxR * 2.5;
  camTheta = 0.5; camPhi = 0.7;
}
$("cst-reset").addEventListener("click", () => { resetView(); lastInteract = Date.now(); });

// ── Init ────────────────────────────────────────────────────────────
async function init() {
  const gpuOk = await initWebGPU();
  if (!gpuOk) return;

  resize();
  window.addEventListener("resize", resize);

  // Load embeddings
  try {
    const [jr, br] = await Promise.all([
      fetch("data/yum-embeddings.json"),
      fetch("data/yum-embeddings.bin"),
    ]);
    if (!jr.ok || !br.ok) { statusEl.textContent = "Flavor data not available yet."; return; }
    idx = await jr.json();
    emb = new Float32Array(await br.arrayBuffer());
  } catch {
    statusEl.textContent = "Failed to load flavor data.";
    return;
  }

  statusEl.textContent = `Running 3D UMAP on ${idx.count} ingredients...`;
  await new Promise(r => setTimeout(r, 50));

  const Y = runUMAP3D(emb, idx.dim, 300);

  pts = [];
  for (let i = 0; i < idx.count; i++) {
    pts.push({ x: Y[i*3], y: Y[i*3+1], z: Y[i*3+2], title: idx.titles[i], cat: idx.categories[i], i });
  }

  statusEl.textContent = `${pts.length} ingredients`;
  buildLegend();
  resetView();
  $("cst-hint").style.opacity = "1";
  setTimeout(() => { $("cst-hint").style.transition = "opacity 3s"; $("cst-hint").style.opacity = "0"; }, 4000);
  requestAnimationFrame(render);
}

init();

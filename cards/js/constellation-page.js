// ── Flavor Constellation — UMAP 2D projection of flavor embeddings ──
// Loads 64d compound embeddings, runs UMAP client-side, renders interactive canvas.

import { FOOD_CATEGORIES } from "./yum-pool.js";

// ── State ──────────────────────────────────────────────────────
let idx = null;    // { dim, count, titles[], categories[] }
let emb = null;    // Float32Array
let pts = null;    // [{x, y, title, cat, i}]

// Camera: canvas coords = (world - cam.x) * cam.zoom + canvas.width/2
let cam = { x: 0, y: 0, zoom: 1 };
let drag = null;   // { sx, sy, cx, cy } screen start + cam start
let hovered = -1;
let searchHits = new Set();
let activeCats = new Set(Object.keys(FOOD_CATEGORIES));

const DOT_R = 4;
const HIT_R = 12;

const canvas = document.getElementById("cst-canvas");
const ctx = canvas.getContext("2d");
const box = document.getElementById("cst-box");
const tooltip = document.getElementById("cst-tooltip");
const ttTitle = document.getElementById("cst-tt-title");
const ttCat = document.getElementById("cst-tt-cat");
const statusEl = document.getElementById("cst-status");

// ── UMAP (minimal implementation) ──────────────────────────────
// Simplified Barnes-Hut UMAP for <1000 points.
// We use a lightweight approach: t-SNE style with UMAP-like fuzzy simplicial set.

function buildKNN(data, dim, k) {
  const n = data.length / dim;
  const nn = new Int32Array(n * k);
  const nd = new Float32Array(n * k);

  for (let i = 0; i < n; i++) {
    // Brute force kNN (fine for n < 1000)
    const dists = [];
    for (let j = 0; j < n; j++) {
      if (i === j) continue;
      let d = 0;
      for (let d2 = 0; d2 < dim; d2++) {
        const diff = data[i * dim + d2] - data[j * dim + d2];
        d += diff * diff;
      }
      dists.push({ j, d });
    }
    dists.sort((a, b) => a.d - b.d);
    for (let ki = 0; ki < k; ki++) {
      nn[i * k + ki] = dists[ki].j;
      nd[i * k + ki] = Math.sqrt(dists[ki].d);
    }
  }
  return { nn, nd };
}

function computeSigmas(nd, k, n) {
  const sigmas = new Float32Array(n);
  const target = Math.log2(k);

  for (let i = 0; i < n; i++) {
    let lo = 0, hi = 1000, mid = 1;
    for (let iter = 0; iter < 64; iter++) {
      mid = (lo + hi) / 2;
      let sum = 0;
      for (let ki = 0; ki < k; ki++) {
        sum += Math.exp(-nd[i * k + ki] / mid);
      }
      const entropy = Math.log2(sum + 1e-10);
      if (entropy > target) hi = mid; else lo = mid;
      if (Math.abs(entropy - target) < 0.01) break;
    }
    sigmas[i] = mid;
  }
  return sigmas;
}

function buildGraph(nn, nd, sigmas, k, n) {
  // Fuzzy simplicial set: asymmetric weights → symmetrize
  const edges = new Map();
  const key = (i, j) => i < j ? `${i},${j}` : `${j},${i}`;

  for (let i = 0; i < n; i++) {
    const rho = nd[i * k]; // distance to nearest neighbor
    for (let ki = 0; ki < k; ki++) {
      const j = nn[i * k + ki];
      const d = nd[i * k + ki];
      const w = Math.exp(-Math.max(0, d - rho) / sigmas[i]);
      const ek = key(i, j);
      const existing = edges.get(ek) || 0;
      // Fuzzy union: a + b - a*b
      edges.set(ek, existing + w - existing * w);
    }
  }
  return edges;
}

function runUMAP(data, dim, { nNeighbors = 15, minDist = 0.1, nEpochs = 200 } = {}) {
  const n = data.length / dim;
  const k = Math.min(nNeighbors, n - 1);

  statusEl.textContent = `Computing kNN (${n} points)...`;

  const { nn, nd } = buildKNN(data, dim, k);
  const sigmas = computeSigmas(nd, k, n);
  const graph = buildGraph(nn, nd, sigmas, k, n);

  // Initialize with spectral-ish layout (PCA on first 2 components)
  const Y = new Float32Array(n * 2);
  // Simple PCA init: use first two dims of data, scaled
  let maxVal = 0;
  for (let i = 0; i < n; i++) {
    Y[i * 2] = data[i * dim];
    Y[i * 2 + 1] = data[i * dim + 1];
    maxVal = Math.max(maxVal, Math.abs(Y[i * 2]), Math.abs(Y[i * 2 + 1]));
  }
  // Add jitter and normalize
  for (let i = 0; i < n * 2; i++) {
    Y[i] = Y[i] / (maxVal + 1e-10) * 5 + (Math.random() - 0.5) * 0.01;
  }

  // UMAP optimization
  const a = 1.929;  // For min_dist=0.1
  const b = 0.7915;
  const edgeList = [];
  for (const [ek, w] of graph) {
    const [i, j] = ek.split(",").map(Number);
    edgeList.push({ i, j, w });
  }

  const alpha0 = 1.0;

  for (let epoch = 0; epoch < nEpochs; epoch++) {
    const alpha = alpha0 * (1 - epoch / nEpochs);

    // Attractive forces
    for (const { i, j, w } of edgeList) {
      if (Math.random() > w) continue;
      const dx = Y[i * 2] - Y[j * 2];
      const dy = Y[i * 2 + 1] - Y[j * 2 + 1];
      const d2 = dx * dx + dy * dy + 0.001;
      const grad = (-2 * a * b * Math.pow(d2, b - 1)) / (1 + a * Math.pow(d2, b));
      const gx = grad * dx * alpha;
      const gy = grad * dy * alpha;
      Y[i * 2] += gx;
      Y[i * 2 + 1] += gy;
      Y[j * 2] -= gx;
      Y[j * 2 + 1] -= gy;
    }

    // Repulsive forces (sample negative edges)
    const nNeg = 5;
    for (let i = 0; i < n; i++) {
      for (let s = 0; s < nNeg; s++) {
        const j = Math.floor(Math.random() * n);
        if (i === j) continue;
        const dx = Y[i * 2] - Y[j * 2];
        const dy = Y[i * 2 + 1] - Y[j * 2 + 1];
        const d2 = dx * dx + dy * dy + 0.001;
        const grad = (2 * b) / ((0.001 + d2) * (1 + a * Math.pow(d2, b)));
        const gx = Math.max(-4, Math.min(4, grad * dx * alpha));
        const gy = Math.max(-4, Math.min(4, grad * dy * alpha));
        Y[i * 2] += gx;
        Y[i * 2 + 1] += gy;
      }
    }
  }

  return Y;
}

// ── World coordinate transforms ────────────────────────────────

function worldToScreen(wx, wy) {
  return {
    sx: (wx - cam.x) * cam.zoom + canvas.width / 2,
    sy: (wy - cam.y) * cam.zoom + canvas.height / 2,
  };
}

function screenToWorld(sx, sy) {
  return {
    wx: (sx - canvas.width / 2) / cam.zoom + cam.x,
    wy: (sy - canvas.height / 2) / cam.zoom + cam.y,
  };
}

// ── Rendering ──────────────────────────────────────────────────

function resize() {
  const rect = box.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  canvas.style.width = rect.width + "px";
  canvas.style.height = rect.height + "px";
}

function draw() {
  if (!pts) return;
  const w = canvas.width / (window.devicePixelRatio || 1);
  const h = canvas.height / (window.devicePixelRatio || 1);

  ctx.clearRect(0, 0, w, h);

  // Background
  ctx.fillStyle = "#0a0a0a";
  ctx.fillRect(0, 0, w, h);

  // Faint grid
  ctx.strokeStyle = "rgba(255,255,255,0.03)";
  ctx.lineWidth = 0.5;
  const gridStep = 50 * cam.zoom;
  if (gridStep > 10) {
    const offX = ((-cam.x) * cam.zoom + w / 2) % gridStep;
    const offY = ((-cam.y) * cam.zoom + h / 2) % gridStep;
    for (let x = offX; x < w; x += gridStep) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
    }
    for (let y = offY; y < h; y += gridStep) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
    }
  }

  // Draw points
  const r = DOT_R * Math.min(2, Math.max(0.5, cam.zoom * 0.3 + 0.7));
  const hasSearch = searchHits.size > 0;

  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    if (!activeCats.has(p.cat)) continue;

    const { sx, sy } = worldToScreen(p.x, p.y);
    if (sx < -20 || sx > w + 20 || sy < -20 || sy > h + 20) continue;

    const catInfo = FOOD_CATEGORIES[p.cat];
    const isHit = hasSearch && searchHits.has(i);
    const isDim = hasSearch && !isHit;
    const isHov = i === hovered;

    ctx.beginPath();
    ctx.arc(sx, sy, isHov ? r * 2 : isHit ? r * 1.5 : r, 0, Math.PI * 2);

    if (isDim) {
      ctx.fillStyle = "rgba(80,80,80,0.25)";
    } else {
      ctx.fillStyle = catInfo ? catInfo.color : "#888";
      ctx.globalAlpha = isHov ? 1 : isHit ? 0.95 : 0.7;
    }
    ctx.fill();
    ctx.globalAlpha = 1;

    // Glow for hovered or search hits
    if (isHov) {
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = 2;
      ctx.stroke();
    } else if (isHit) {
      ctx.strokeStyle = "rgba(255,255,255,0.5)";
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  }

  // Labels for search hits
  if (hasSearch) {
    ctx.font = "11px Georgia, serif";
    ctx.textAlign = "center";
    ctx.fillStyle = "#fff";
    for (const i of searchHits) {
      const p = pts[i];
      if (!activeCats.has(p.cat)) continue;
      const { sx, sy } = worldToScreen(p.x, p.y);
      if (sx < -50 || sx > w + 50 || sy < -50 || sy > h + 50) continue;
      ctx.fillText(p.title, sx, sy - r * 2 - 4);
    }
  }

  // Hovered label
  if (hovered >= 0) {
    const p = pts[hovered];
    const { sx, sy } = worldToScreen(p.x, p.y);
    ctx.font = "bold 13px Georgia, serif";
    ctx.textAlign = "center";
    ctx.fillStyle = "#fff";
    ctx.fillText(p.title, sx, sy - r * 2.5 - 6);
  }

  requestAnimationFrame(draw);
}

// ── Hit testing ────────────────────────────────────────────────

function findNearest(sx, sy) {
  if (!pts) return -1;
  let best = -1, bestD = HIT_R * HIT_R;
  for (let i = 0; i < pts.length; i++) {
    if (!activeCats.has(pts[i].cat)) continue;
    const s = worldToScreen(pts[i].x, pts[i].y);
    const dx = s.sx - sx, dy = s.sy - sy;
    const d2 = dx * dx + dy * dy;
    if (d2 < bestD) { bestD = d2; best = i; }
  }
  return best;
}

// ── Interaction ────────────────────────────────────────────────

function getPos(e) {
  const rect = box.getBoundingClientRect();
  if (e.touches) {
    return { x: e.touches[0].clientX - rect.left, y: e.touches[0].clientY - rect.top };
  }
  return { x: e.clientX - rect.left, y: e.clientY - rect.top };
}

box.addEventListener("mousedown", (e) => {
  const p = getPos(e);
  drag = { sx: p.x, sy: p.y, cx: cam.x, cy: cam.y };
});
box.addEventListener("touchstart", (e) => {
  if (e.touches.length === 1) {
    const p = getPos(e);
    drag = { sx: p.x, sy: p.y, cx: cam.x, cy: cam.y };
  }
}, { passive: true });

window.addEventListener("mousemove", (e) => {
  const p = getPos(e);
  if (drag) {
    cam.x = drag.cx - (p.x - drag.sx) / cam.zoom;
    cam.y = drag.cy - (p.y - drag.sy) / cam.zoom;
    tooltip.style.display = "none";
    return;
  }
  // Hover
  const hit = findNearest(p.x, p.y);
  if (hit !== hovered) {
    hovered = hit;
    if (hit >= 0) {
      const pt = pts[hit];
      const catInfo = FOOD_CATEGORIES[pt.cat];
      ttTitle.textContent = pt.title;
      ttCat.textContent = catInfo ? `${catInfo.icon} ${catInfo.name}` : pt.cat;
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
window.addEventListener("touchmove", (e) => {
  if (drag && e.touches.length === 1) {
    const p = getPos(e);
    cam.x = drag.cx - (p.x - drag.sx) / cam.zoom;
    cam.y = drag.cy - (p.y - drag.sy) / cam.zoom;
  }
}, { passive: true });

box.addEventListener("wheel", (e) => {
  e.preventDefault();
  const scale = e.deltaY > 0 ? 0.9 : 1.1;
  const p = getPos(e);
  // Zoom toward mouse position
  const before = screenToWorld(p.x, p.y);
  cam.zoom *= scale;
  cam.zoom = Math.max(0.1, Math.min(20, cam.zoom));
  const after = screenToWorld(p.x, p.y);
  cam.x -= (after.wx - before.wx);
  cam.y -= (after.wy - before.wy);
}, { passive: false });

// ── Legend ──────────────────────────────────────────────────────

function buildLegend() {
  const el = document.getElementById("cst-legend");
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

document.getElementById("cst-all").addEventListener("click", () => {
  Object.keys(FOOD_CATEGORIES).forEach(k => activeCats.add(k));
  document.querySelectorAll(".cst-legend-item").forEach(i => i.classList.remove("dim"));
});
document.getElementById("cst-none").addEventListener("click", () => {
  activeCats.clear();
  document.querySelectorAll(".cst-legend-item").forEach(i => i.classList.add("dim"));
});

// ── Search ─────────────────────────────────────────────────────

document.getElementById("cst-search").addEventListener("input", (e) => {
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

// ── Reset view ─────────────────────────────────────────────────

function resetView() {
  if (!pts) return;
  cam.x = 0; cam.y = 0; cam.zoom = 1;
  // Auto-fit
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const p of pts) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }
  cam.x = (minX + maxX) / 2;
  cam.y = (minY + maxY) / 2;
  const w = canvas.width / (window.devicePixelRatio || 1);
  const h = canvas.height / (window.devicePixelRatio || 1);
  const rangeX = maxX - minX || 1;
  const rangeY = maxY - minY || 1;
  cam.zoom = Math.min(w / rangeX, h / rangeY) * 0.85;
}

document.getElementById("cst-reset").addEventListener("click", resetView);

// ── Init ───────────────────────────────────────────────────────

async function init() {
  resize();
  window.addEventListener("resize", () => { resize(); });

  // Load embeddings
  try {
    const [jr, br] = await Promise.all([
      fetch("data/yum-embeddings.json"),
      fetch("data/yum-embeddings.bin"),
    ]);
    if (!jr.ok || !br.ok) {
      statusEl.textContent = "Flavor data not available yet.";
      return;
    }
    idx = await jr.json();
    emb = new Float32Array(await br.arrayBuffer());
  } catch {
    statusEl.textContent = "Failed to load flavor data.";
    return;
  }

  statusEl.textContent = `Running UMAP on ${idx.count} ingredients...`;

  // Defer UMAP to next frame so status text renders
  await new Promise(r => setTimeout(r, 50));

  const Y = runUMAP(emb, idx.dim, { nNeighbors: 15, minDist: 0.25, nEpochs: 300 });

  // Build point array
  pts = [];
  for (let i = 0; i < idx.count; i++) {
    pts.push({
      x: Y[i * 2],
      y: Y[i * 2 + 1],
      title: idx.titles[i],
      cat: idx.categories[i],
      i,
    });
  }

  statusEl.textContent = `${pts.length} ingredients`;
  buildLegend();
  resetView();
  requestAnimationFrame(draw);
}

init();

// ── Tech Tree — infinite canvas with polar fan layout ─────────
import { TECH_ERAS, TECH_DOMAINS, TECH_POOL } from "./tech-pool.js";
import { fetchArticleData } from "./shared.js";

/* ── Config ──────────────────────────────────────────────── */
const NODE_R = 30;          // image circle radius (world px)
const GAP = 16;             // min gap between node edges
const SPAN = Math.PI / 2;   // 90° fan
const HALF = SPAN / 2;      // 45° each side of vertical

/* ── Build graph ─────────────────────────────────────────── */
const nodes = TECH_POOL.map((t, i) => ({
  id: i, title: t[0], era: t[1], props: t[2], wx: 0, wy: 0, depth: 0,
}));
const byTitle = Object.fromEntries(nodes.map(n => [n.title, n]));
const childOf = {};
nodes.forEach(n => n.props.prereqs.forEach(p => (childOf[p] ??= []).push(n.title)));

/* ── Topological depth ───────────────────────────────────── */
const _d = {};
function depth(t) {
  if (_d[t] != null) return _d[t];
  const n = byTitle[t];
  if (!n || !n.props.prereqs.length) return (_d[t] = 0);
  _d[t] = -1;
  return (_d[t] = 1 + Math.max(...n.props.prereqs.map(depth)));
}
nodes.forEach(n => (n.depth = depth(n.title)));
const maxDepth = Math.max(...nodes.map(n => n.depth));

/* ── Polar fan layout ────────────────────────────────────── */
const domKeys = Object.keys(TECH_DOMAINS);
const levels = Array.from({ length: maxDepth + 1 }, () => []);
nodes.forEach(n => levels[n.depth].push(n));

// Level 0: sort by domain + year
levels[0].sort((a, b) =>
  (domKeys.indexOf(a.props.domain) - domKeys.indexOf(b.props.domain)) || a.props.year - b.props.year);

const ang = {};
levels[0].forEach((n, i) => {
  ang[n.title] = -HALF + ((i + 0.5) / levels[0].length) * SPAN;
});

// Deeper levels: sort by average parent angle (keeps children near parents)
for (let d = 1; d <= maxDepth; d++) {
  levels[d].forEach(n => {
    const pa = n.props.prereqs.map(p => ang[p]).filter(a => a != null);
    n._ta = pa.length ? pa.reduce((s, a) => s + a, 0) / pa.length : 0;
  });
  levels[d].sort((a, b) => a._ta - b._ta);
  levels[d].forEach((n, i) => {
    ang[n.title] = -HALF + ((i + 0.5) / levels[d].length) * SPAN;
  });
}

// Compute ring radii — each ring just large enough to avoid overlap
const radii = [];
let r = 140;
for (let d = 0; d <= maxDepth; d++) {
  const count = levels[d].length;
  const minR = (count * (NODE_R * 2 + GAP)) / SPAN;
  r = Math.max(r, minR);
  radii[d] = r;
  r += NODE_R * 2 + GAP;
}

// World positions (origin at 0,0; Y-up = negative canvas Y)
nodes.forEach(n => {
  const a = ang[n.title], rv = radii[n.depth];
  n.wx = rv * Math.sin(a);
  n.wy = -rv * Math.cos(a);
});

/* ── Canvas state ────────────────────────────────────────── */
const canvas = document.getElementById("tree-canvas");
const ctx = canvas.getContext("2d");
let panX = 0, panY = 0, zm = 1;
let dirty = false;

function resize() {
  const dpr = devicePixelRatio || 1;
  canvas.width = innerWidth * dpr;
  canvas.height = innerHeight * dpr;
  canvas.style.width = innerWidth + "px";
  canvas.style.height = innerHeight + "px";
  scheduleDraw();
}

function fitView() {
  const pad = NODE_R * 3;
  const xs = nodes.map(n => n.wx), ys = nodes.map(n => n.wy);
  const x0 = Math.min(...xs) - pad, x1 = Math.max(...xs) + pad;
  const y0 = Math.min(...ys) - pad, y1 = Math.max(...ys) + pad;
  const bw = x1 - x0, bh = y1 - y0;
  zm = Math.min(innerWidth / bw, innerHeight / bh) * 0.92;
  panX = innerWidth / 2 - (x0 + bw / 2) * zm;
  panY = innerHeight / 2 - (y0 + bh / 2) * zm;
  scheduleDraw();
}

function scheduleDraw() {
  if (!dirty) { dirty = true; requestAnimationFrame(draw); }
}

/* ── Selection state ─────────────────────────────────────── */
let sel = null;
const anc = new Set(), desc = new Set();

function getAnc(title) {
  const s = new Set(), stk = [title];
  while (stk.length) {
    const t = stk.pop(), n = byTitle[t];
    if (!n) continue;
    for (const p of n.props.prereqs) { if (!s.has(p)) { s.add(p); stk.push(p); } }
  }
  return s;
}

function getDesc(title) {
  const s = new Set(), stk = [title];
  while (stk.length) {
    const t = stk.pop();
    for (const c of childOf[t] || []) { if (!s.has(c)) { s.add(c); stk.push(c); } }
  }
  return s;
}

function selectNode(title) {
  sel = title;
  anc.clear(); getAnc(title).forEach(t => anc.add(t));
  desc.clear(); getDesc(title).forEach(t => desc.add(t));
  scheduleDraw();
  showDetail(title);
}

function clearSel() {
  sel = null; anc.clear(); desc.clear();
  scheduleDraw();
  document.getElementById("tt-detail").classList.add("hidden");
}

/* ── Image loading ───────────────────────────────────────── */
const images = new Map();

async function loadImages() {
  const BATCH = 50;
  for (let i = 0; i < nodes.length; i += BATCH) {
    const batch = nodes.slice(i, i + BATCH);
    try {
      const pages = await fetchArticleData(batch.map(n => n.title));
      for (const pg of Object.values(pages)) {
        if (!pg?.thumbnail?.source || !pg.pageid) continue;
        const node = byTitle[pg.title];
        if (!node || images.has(node.title)) continue;
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.onload = () => { images.set(node.title, img); scheduleDraw(); };
        img.src = pg.thumbnail.source;
      }
    } catch (_) {}
  }
}

/* ── Draw ─────────────────────────────────────────────────── */
function draw() {
  dirty = false;
  const dpr = devicePixelRatio || 1;

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.setTransform(dpr * zm, 0, 0, dpr * zm, dpr * panX, dpr * panY);

  const sR = NODE_R * zm;  // screen-space node radius

  // Depth arcs
  ctx.strokeStyle = "rgba(255,255,255,0.035)";
  ctx.lineWidth = 1 / zm;
  for (let d = 0; d <= maxDepth; d++) {
    ctx.beginPath();
    ctx.arc(0, 0, radii[d], -3 * Math.PI / 4, -Math.PI / 4);
    ctx.stroke();
  }

  // Origin dot
  ctx.beginPath();
  ctx.arc(0, 0, 5, 0, Math.PI * 2);
  ctx.fillStyle = "#c9a84c";
  ctx.fill();

  // --- Edges (two passes: dimmed, then highlighted) ---
  drawEdges(false, sR);
  if (sel) drawEdges(true, sR);

  // --- Nodes ---
  for (const n of nodes) {
    const isSel = n.title === sel;
    const isAnc = sel && anc.has(n.title);
    const isDesc = sel && desc.has(n.title);
    const dimmed = sel && !isSel && !isAnc && !isDesc;

    ctx.globalAlpha = dimmed ? 0.1 : 1;
    const era = TECH_ERAS[n.era];
    const dom = TECH_DOMAINS[n.props.domain];
    const img = images.get(n.title);

    // Image or placeholder
    if (sR > 10 && img) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(n.wx, n.wy, NODE_R - 1, 0, Math.PI * 2);
      ctx.clip();
      ctx.drawImage(img, n.wx - NODE_R, n.wy - NODE_R, NODE_R * 2, NODE_R * 2);
      ctx.restore();
    } else {
      ctx.beginPath();
      ctx.arc(n.wx, n.wy, NODE_R - 1, 0, Math.PI * 2);
      ctx.fillStyle = era.color + (dimmed ? "11" : "33");
      ctx.fill();
      if (sR > 6) {
        ctx.font = `${Math.max(10, NODE_R * 0.55)}px sans-serif`;
        ctx.fillStyle = era.color;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(dom.icon, n.wx, n.wy);
      }
    }

    // Border ring with glow for selection states
    ctx.beginPath();
    ctx.arc(n.wx, n.wy, NODE_R, 0, Math.PI * 2);
    ctx.lineWidth = (isSel ? 3 : 2) / zm;

    if (isSel) {
      ctx.shadowColor = "rgba(255,255,255,0.6)";
      ctx.shadowBlur = 16 / zm;
      ctx.strokeStyle = "#fff";
    } else if (isAnc) {
      ctx.shadowColor = "rgba(201,168,76,0.6)";
      ctx.shadowBlur = 10 / zm;
      ctx.strokeStyle = "#c9a84c";
    } else if (isDesc) {
      ctx.shadowColor = "rgba(70,130,180,0.6)";
      ctx.shadowBlur = 10 / zm;
      ctx.strokeStyle = "#4682B4";
    } else {
      ctx.shadowBlur = 0;
      ctx.strokeStyle = era.color;
      // Rarity glow (unselected)
      if (n.props.rarity === "legendary" && !dimmed) {
        ctx.shadowColor = era.color + "66";
        ctx.shadowBlur = 8 / zm;
      }
    }
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Title label (only when zoomed in enough)
    if (sR > 20 && !dimmed) {
      const fs = Math.min(11, NODE_R * 0.38);
      ctx.font = `${fs}px system-ui, sans-serif`;
      ctx.fillStyle = "#e8e4dc";
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      const label = n.title.replace(/ \(.*\)$/, "");
      ctx.fillText(label.length > 28 ? label.slice(0, 26) + "..." : label, n.wx, n.wy + NODE_R + 4);
    }

    ctx.globalAlpha = 1;
  }
}

function drawEdges(hlOnly) {
  for (const n of nodes) {
    for (const pTitle of n.props.prereqs) {
      const p = byTitle[pTitle];
      if (!p) continue;
      const isAnc_ = anc.has(n.title) || n.title === sel;
      const isDesc_ = desc.has(n.title) && (pTitle === sel || desc.has(pTitle));
      const hl = sel && (isAnc_ || isDesc_);
      if (hlOnly && !hl) continue;
      if (!hlOnly && hl && sel) continue;

      ctx.beginPath();
      ctx.moveTo(p.wx, p.wy);
      ctx.lineTo(n.wx, n.wy);

      if (isAnc_ && sel) {
        ctx.strokeStyle = "rgba(201,168,76,0.7)";
        ctx.lineWidth = 2.5 / zm;
      } else if (isDesc_ && sel) {
        ctx.strokeStyle = "rgba(70,130,180,0.7)";
        ctx.lineWidth = 2.5 / zm;
      } else if (sel) {
        ctx.strokeStyle = "rgba(100,100,100,0.05)";
        ctx.lineWidth = 0.5 / zm;
      } else {
        ctx.strokeStyle = "rgba(140,130,120,0.18)";
        ctx.lineWidth = 1 / zm;
      }
      ctx.stroke();
    }
  }
}

/* ── Interaction ─────────────────────────────────────────── */
let drag = null, dragged = false, pinchDist = 0;

function screenToWorld(sx, sy) {
  return { x: (sx - panX) / zm, y: (sy - panY) / zm };
}

function hitTest(sx, sy) {
  const { x, y } = screenToWorld(sx, sy);
  let best = null, bestD = NODE_R + 4;
  for (const n of nodes) {
    const d = Math.hypot(n.wx - x, n.wy - y);
    if (d < bestD) { best = n; bestD = d; }
  }
  return best;
}

// Mouse
canvas.addEventListener("mousedown", e => {
  drag = { x: e.clientX, y: e.clientY, px: panX, py: panY };
  dragged = false;
});
canvas.addEventListener("mousemove", e => {
  if (drag) {
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) dragged = true;
    panX = drag.px + dx; panY = drag.py + dy;
    scheduleDraw();
  }
  // Tooltip
  const tip = document.getElementById("tt-tooltip");
  const n = hitTest(e.clientX, e.clientY);
  if (n) {
    tip.textContent = n.title.replace(/ \(.*\)$/, "");
    tip.style.left = (e.clientX + 14) + "px";
    tip.style.top = (e.clientY - 10) + "px";
    tip.classList.remove("hidden");
    canvas.style.cursor = "pointer";
  } else {
    tip.classList.add("hidden");
    canvas.style.cursor = drag ? "grabbing" : "grab";
  }
});
canvas.addEventListener("mouseup", e => {
  if (!dragged) {
    const n = hitTest(e.clientX, e.clientY);
    n ? selectNode(n.title) : clearSel();
  }
  drag = null;
});

// Wheel zoom (around cursor)
canvas.addEventListener("wheel", e => {
  e.preventDefault();
  const f = e.deltaY > 0 ? 0.88 : 1.12;
  const nz = Math.max(0.02, Math.min(6, zm * f));
  panX = e.clientX - (e.clientX - panX) * (nz / zm);
  panY = e.clientY - (e.clientY - panY) * (nz / zm);
  zm = nz;
  scheduleDraw();
}, { passive: false });

// Touch (pan + pinch zoom)
canvas.addEventListener("touchstart", e => {
  if (e.touches.length === 1) {
    const t = e.touches[0];
    drag = { x: t.clientX, y: t.clientY, px: panX, py: panY };
    dragged = false;
  }
  pinchDist = 0;
});
canvas.addEventListener("touchmove", e => {
  e.preventDefault();
  if (e.touches.length === 2) {
    const d = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
    if (pinchDist) {
      const cx = (e.touches[0].clientX + e.touches[1].clientX) / 2;
      const cy = (e.touches[0].clientY + e.touches[1].clientY) / 2;
      const nz = Math.max(0.02, Math.min(6, zm * (d / pinchDist)));
      panX = cx - (cx - panX) * (nz / zm);
      panY = cy - (cy - panY) * (nz / zm);
      zm = nz;
      scheduleDraw();
    }
    pinchDist = d;
  } else if (e.touches.length === 1 && drag) {
    const t = e.touches[0];
    const dx = t.clientX - drag.x, dy = t.clientY - drag.y;
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) dragged = true;
    panX = drag.px + dx; panY = drag.py + dy;
    scheduleDraw();
  }
}, { passive: false });
canvas.addEventListener("touchend", e => {
  if (!dragged && e.changedTouches.length === 1) {
    const t = e.changedTouches[0];
    const n = hitTest(t.clientX, t.clientY);
    n ? selectNode(n.title) : clearSel();
  }
  drag = null; pinchDist = 0;
});

/* ── Detail panel ────────────────────────────────────────── */
function fmtYear(y) {
  if (y <= -1e6) return `~${Math.round(y / -1000)} kya`;
  return y < 0 ? `${-y} BCE` : `${y} CE`;
}

async function showDetail(title) {
  const n = byTitle[title];
  if (!n) return;
  const el = document.getElementById("tt-detail");
  const era = TECH_ERAS[n.era], dom = TECH_DOMAINS[n.props.domain];
  const display = title.replace(/ \(.*\)$/, "");
  const wikiUrl = `https://en.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, "_"))}`;

  const reqTags = n.props.prereqs.map(p =>
    `<span class="tt-dep req" data-t="${p.replace(/"/g, "&quot;")}">${p.replace(/ \(.*\)$/, "")}</span>`
  ).join("");
  const enTags = (childOf[title] || []).map(c =>
    `<span class="tt-dep ena" data-t="${c.replace(/"/g, "&quot;")}">${c.replace(/ \(.*\)$/, "")}</span>`
  ).join("");

  el.classList.remove("hidden");
  el.innerHTML = `
    <div class="tt-d-head">
      <div class="tt-d-title">${display}<span class="tt-d-status ${n.props.status}">${n.props.status}</span></div>
      <button class="tt-d-close">&times;</button>
    </div>
    <div class="tt-d-meta" style="color:${era.color}">
      ${era.icon} ${era.name} · ${dom.icon} ${dom.name} · ${fmtYear(n.props.year)} · Complexity ${n.props.complexity}/10
    </div>
    <div class="tt-d-chain">Depth ${n.depth} — ${anc.size} ancestor${anc.size !== 1 ? "s" : ""} · ${desc.size} descendant${desc.size !== 1 ? "s" : ""}</div>
    <div class="tt-d-deps">
      ${reqTags ? `<h4>Requires</h4>${reqTags}` : ""}
      ${enTags ? `<h4>Enables</h4>${enTags}` : ""}
    </div>
    <div class="tt-d-extract" id="tt-ext">Loading...</div>
    <a class="tt-d-link" href="${wikiUrl}" target="_blank">Wikipedia &rarr;</a>`;

  el.querySelector(".tt-d-close").onclick = clearSel;
  el.querySelectorAll(".tt-dep").forEach(tag =>
    tag.addEventListener("click", () => navigateTo(tag.dataset.t))
  );

  try {
    const pages = await fetchArticleData([title]);
    const pg = Object.values(pages).find(p => p.pageid);
    const ext = document.getElementById("tt-ext");
    if (ext) ext.textContent = pg?.extract || "";
  } catch (_) {
    const ext = document.getElementById("tt-ext");
    if (ext) ext.textContent = "";
  }
}

/* ── Navigate (smooth pan to node) ───────────────────────── */
let animTarget = null;

function navigateTo(title) {
  const n = byTitle[title];
  if (!n) return;
  selectNode(title);
  animTarget = {
    x: innerWidth / 2 - n.wx * zm,
    y: innerHeight / 2 - n.wy * zm,
  };
  animStep();
}

function animStep() {
  if (!animTarget) return;
  panX += (animTarget.x - panX) * 0.18;
  panY += (animTarget.y - panY) * 0.18;
  if (Math.abs(panX - animTarget.x) < 1 && Math.abs(panY - animTarget.y) < 1) {
    panX = animTarget.x; panY = animTarget.y;
    animTarget = null;
    scheduleDraw();
  } else {
    scheduleDraw();
    requestAnimationFrame(animStep);
  }
}

/* ── Init ────────────────────────────────────────────────── */
document.getElementById("tt-count").textContent =
  `${nodes.length} technologies · depth ${maxDepth} · ${nodes.filter(n => !n.props.prereqs.length).length} roots`;

resize();
fitView();
loadImages();

window.addEventListener("resize", () => { resize(); fitView(); });

// ── Tech Tree — infinite canvas with polar fan layout ─────────
import { TECH_ERAS, TECH_DOMAINS, TECH_POOL } from "../pools/tech-pool.js";
import { fetchArticleData } from "../core/shared.js";

/* ── Config ──────────────────────────────────────────────── */
const NODE_R = 30;          // world-space radius for layout spacing
const HEX_R = 16;           // constant screen-pixel radius for rendering
const GAP = 16;             // min gap between node edges (arc-length)
const SPAN = Math.PI * (2 / 3); // 120° fan (tight wedge, open at bottom)
const HALF = SPAN / 2;          // 60° each side of vertical
const DOM_GRAVITY = 0.70;   // how strongly nodes cling to domain sector
const INNER_R = 600;        // innermost node radius (year-based)
const OUTER_R = 6000;       // outermost node radius

/* ── Build graph ─────────────────────────────────────────── */
const nodes = TECH_POOL.map((t, i) => ({
  id: i, title: t[0], era: t[1], props: t[2], wx: 0, wy: 0, sx: 0, sy: 0, depth: 0,
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

/* ── Year-to-radius mapping (temporal layout) ────────────── */
const TIME_BREAKS = [
  [-3500000, 0.00], [-100000, 0.04], [-10000, 0.10], [-3000, 0.18],
  [0, 0.28], [500, 0.33], [1400, 0.42], [1700, 0.52],
  [1800, 0.60], [1900, 0.70], [1950, 0.78], [1970, 0.84],
  [1990, 0.90], [2010, 0.95], [2030, 1.00],
];

function yearToRadius(year) {
  if (year <= TIME_BREAKS[0][0]) return INNER_R;
  for (let i = 1; i < TIME_BREAKS.length; i++) {
    if (year <= TIME_BREAKS[i][0]) {
      const t = (year - TIME_BREAKS[i-1][0]) / (TIME_BREAKS[i][0] - TIME_BREAKS[i-1][0]);
      const frac = TIME_BREAKS[i-1][1] + t * (TIME_BREAKS[i][1] - TIME_BREAKS[i-1][1]);
      return INNER_R + frac * (OUTER_R - INNER_R);
    }
  }
  return OUTER_R;
}

nodes.forEach(n => { n.rv = yearToRadius(n.props.year); });

/* ── Polar fan layout — domain sectors + arc-length spacing ── */
const MAX_BEND = Math.PI / 3;           // 60° bend ceiling
const domKeys = Object.keys(TECH_DOMAINS);
const levels = Array.from({ length: maxDepth + 1 }, () => []);
nodes.forEach(n => levels[n.depth].push(n));

const ang = {};

// ── Domain sector calculation ──────────────────────────────
// Each domain gets proportional angular width based on node count
const SECTOR_PAD = 0.015;  // radians gap between sectors
const domCount = {};
domKeys.forEach(k => { domCount[k] = nodes.filter(n => n.props.domain === k).length; });
const totalCards = nodes.length;
const padTotal = SECTOR_PAD * domKeys.length;
const usableSpan = SPAN - padTotal;

const domSectors = {};
let runAngle = -HALF;
domKeys.forEach(k => {
  const width = (domCount[k] / totalCards) * usableSpan;
  domSectors[k] = { start: runAngle, end: runAngle + width, mid: runAngle + width / 2, width };
  runAngle += width + SECTOR_PAD;
});

// Level 0: place roots within their domain sector, sorted by year
levels[0].sort((a, b) =>
  (domKeys.indexOf(a.props.domain) - domKeys.indexOf(b.props.domain)) || a.props.year - b.props.year);

const rootsByDom = {};
levels[0].forEach(n => (rootsByDom[n.props.domain] ??= []).push(n));
for (const dom of domKeys) {
  const roots = rootsByDom[dom] || [];
  const sec = domSectors[dom];
  roots.forEach((n, i) => {
    ang[n.title] = sec.start + ((i + 0.5) / Math.max(roots.length, 1)) * sec.width;
  });
}

// Helper: push sorted angle array apart to maintain min arc-length gap
function separate(pos, minGap, lo, hi) {
  if (lo == null) lo = -HALF + minGap * 0.4;
  if (hi == null) hi = HALF - minGap * 0.4;
  if (pos.length < 2) {
    if (pos.length === 1) pos[0] = Math.max(lo, Math.min(hi, pos[0]));
    return;
  }
  for (let pass = 0; pass < 40; pass++) {
    let ok = true;
    for (let i = 1; i < pos.length; i++) {
      if (pos[i] - pos[i - 1] < minGap) {
        const half = (minGap - (pos[i] - pos[i - 1])) / 2 + 1e-4;
        pos[i - 1] -= half;  pos[i] += half;  ok = false;
      }
    }
    for (let i = 0; i < pos.length; i++) pos[i] = Math.max(lo, Math.min(hi, pos[i]));
    if (ok) break;
  }
}

// Deeper levels: gravity toward parents + domain sector pull, clamped per sector
for (let d = 1; d <= maxDepth; d++) {
  // Compute pull targets and clamp to sector bounds
  levels[d].forEach(n => {
    const sec = domSectors[n.props.domain];
    const pa = n.props.prereqs.map(p => ang[p]).filter(a => a != null);
    const parentPull = pa.length ? pa.reduce((s, v) => s + v, 0) / pa.length : 0;
    const domPull = sec.mid;
    const raw = parentPull * (1 - DOM_GRAVITY) + domPull * DOM_GRAVITY;
    // Hard-clamp to own sector so cards never leave their pie slice
    n._pull = Math.max(sec.start, Math.min(sec.end, raw));
  });

  // Separate within each sector independently (polar-aware)
  for (const dom of domKeys) {
    const sec = domSectors[dom];
    const group = levels[d].filter(n => n.props.domain === dom);
    if (!group.length) continue;
    const avgR = group.reduce((s, n) => s + n.rv, 0) / group.length;
    const minGap = (NODE_R * 2 + GAP) / Math.max(avgR, 200);
    group.sort((a, b) => a._pull - b._pull);
    const pos = group.map(n => n._pull);
    // Use sector bounds as hard limits for separation
    const pad = minGap * 0.4;
    separate(pos, minGap, sec.start + pad, sec.end - pad);
    group.forEach((n, i) => { ang[n.title] = pos[i]; });
  }
}

// ── Bend relaxation (reduce deflections > 60°) ─────────────
function _xy(title) {
  const n = byTitle[title], a = ang[title];
  return [n.rv * Math.sin(a), -n.rv * Math.cos(a)];
}

function bendRad(parent, node, child) {
  const [px, py] = _xy(parent), [nx, ny] = _xy(node), [cx, cy] = _xy(child);
  const ax = px - nx, ay = py - ny, bx = cx - nx, by = cy - ny;
  const mag = Math.sqrt((ax * ax + ay * ay) * (bx * bx + by * by));
  if (mag < 1e-10) return 0;
  const cosA = Math.max(-1, Math.min(1, (ax * bx + ay * by) / mag));
  return Math.PI - Math.acos(cosA);  // deflection: 0 = straight, π = U-turn
}

for (let iter = 0; iter < 12; iter++) {
  let worst = 0;
  for (let d = 1; d < maxDepth; d++) {
    // Bend-relax per sector so cards stay in their pie slice
    for (const dom of domKeys) {
      const sec = domSectors[dom];
      const group = levels[d].filter(n => n.props.domain === dom);
      if (!group.length) continue;
      const avgR = group.reduce((s, n) => s + n.rv, 0) / group.length;
      const minGap = (NODE_R * 2 + GAP) / Math.max(avgR, 200);
      const pos = group.map(n => ang[n.title]);

      for (let i = 0; i < group.length; i++) {
        const n = group[i];
        const kids = childOf[n.title] || [];
        if (!kids.length) continue;
        for (const pT of n.props.prereqs) {
          if (!byTitle[pT]) continue;
          for (const cT of kids) {
            if (!byTitle[cT]) continue;
            const b = bendRad(pT, n.title, cT);
            if (b > MAX_BEND) {
              worst = Math.max(worst, b);
              let target = (ang[pT] + ang[cT]) / 2;
              // Clamp bend target to sector
              target = Math.max(sec.start, Math.min(sec.end, target));
              pos[i] += (target - pos[i]) * 0.2;
            }
          }
        }
      }
      const pad = minGap * 0.4;
      separate(pos, minGap, sec.start + pad, sec.end - pad);
      group.forEach((n, j) => { ang[n.title] = pos[j]; });
    }
  }
  if (worst <= MAX_BEND) break;
}

// ── Global overlap resolution (cross-depth collisions, sector-clamped) ───────
for (let pass = 0; pass < 12; pass++) {
  let moved = false;
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const ni = nodes[i], nj = nodes[j];
      if (Math.abs(ni.rv - nj.rv) > NODE_R * 3) continue;
      const ai = ang[ni.title], aj = ang[nj.title];
      const dx = ni.rv * Math.sin(ai) - nj.rv * Math.sin(aj);
      const dy = ni.rv * Math.cos(ai) - nj.rv * Math.cos(aj);
      const dist = Math.sqrt(dx * dx + dy * dy);
      const minDist = NODE_R * 2 + GAP * 0.5;
      if (dist < minDist && dist > 0.1) {
        const dAng = aj - ai;
        const nudge = Math.abs(dAng) < 0.001 ? 0.005
          : (minDist - dist) / (ni.rv + nj.rv) * 0.4;
        const sign = dAng >= 0 ? 1 : -1;
        let newAi = ang[ni.title] - nudge * sign;
        let newAj = ang[nj.title] + nudge * sign;
        // Clamp to each node's sector bounds
        const secI = domSectors[ni.props.domain];
        const secJ = domSectors[nj.props.domain];
        ang[ni.title] = Math.max(secI.start, Math.min(secI.end, newAi));
        ang[nj.title] = Math.max(secJ.start, Math.min(secJ.end, newAj));
        moved = true;
      }
    }
  }
  if (!moved) break;
}

// World positions (origin at 0,0 — Y-up = negative canvas Y)
nodes.forEach(n => {
  const a = ang[n.title];
  n.wx = n.rv * Math.sin(a);
  n.wy = -n.rv * Math.cos(a);
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

/* ── Hex packing (world-space grid, deterministic) ───────── */
const RARITY_PRI = { legendary: 0, rare: 1, uncommon: 2, common: 3 };
let cellMap = new Map();   // "col,row" → node (for O(1) hit testing)

// Flat-top hexagon path (screen-space)
function hexPath(ctx, cx, cy, r) {
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const a = i * Math.PI / 3;
    const x = cx + r * Math.cos(a);
    const y = cy + r * Math.sin(a);
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  }
  ctx.closePath();
}

function computeHexPositions() {
  // Grid lives in world space; cell size scales with zoom so hexes are
  // always HEX_R pixels on screen.  Pan moves the viewport over a fixed
  // grid, so node-to-cell assignments are deterministic at a given zoom.
  const wR = HEX_R / zm;
  const colW = 1.5 * wR;
  const rowH = Math.sqrt(3) * wR;

  const occupied = new Set();
  cellMap = new Map();
  const cellKey = (c, r) => c + "," + r;

  const toHex = (wx, wy) => {
    const col = Math.round(wx / colW);
    const row = Math.round((wy - ((col & 1) ? rowH * 0.5 : 0)) / rowH);
    return { col, row };
  };
  const toWorld = (col, row) => ({
    hx: col * colW,
    hy: row * rowH + ((col & 1) ? rowH * 0.5 : 0),
  });

  // Deterministic priority: rarity then complexity (no selection bias
  // so the grid stays stable while clicking around)
  const sorted = [...nodes].sort((a, b) =>
    (RARITY_PRI[a.props.rarity] ?? 3) - (RARITY_PRI[b.props.rarity] ?? 3)
    || b.props.complexity - a.props.complexity
    || a.id - b.id);

  for (const n of sorted) {
    const ideal = toHex(n.wx, n.wy);
    let bestCol = ideal.col, bestRow = ideal.row;

    if (occupied.has(cellKey(ideal.col, ideal.row))) {
      let bestDist = Infinity;
      for (let ring = 1; ring <= 30; ring++) {
        let found = false;
        for (let dc = -ring; dc <= ring; dc++) {
          for (let dr = -ring; dr <= ring; dr++) {
            if (Math.abs(dc) !== ring && Math.abs(dr) !== ring) continue;
            const c = ideal.col + dc, r = ideal.row + dr;
            if (occupied.has(cellKey(c, r))) continue;
            const pos = toWorld(c, r);
            const idealPos = toWorld(ideal.col, ideal.row);
            const dist = Math.hypot(pos.hx - idealPos.hx, pos.hy - idealPos.hy);
            if (dist < bestDist) {
              bestDist = dist; bestCol = c; bestRow = r; found = true;
            }
          }
        }
        if (found) break;
      }
    }

    occupied.add(cellKey(bestCol, bestRow));
    cellMap.set(cellKey(bestCol, bestRow), n);
    const pos = toWorld(bestCol, bestRow);
    // World-space hex center → screen position
    n.sx = pos.hx * zm + panX;
    n.sy = pos.hy * zm + panY;
  }
}

/* ── Draw ─────────────────────────────────────────────────── */
function draw() {
  dirty = false;
  const dpr = devicePixelRatio || 1;

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.setTransform(dpr * zm, 0, 0, dpr * zm, dpr * panX, dpr * panY);

  // Era arcs at temporal breakpoints
  ctx.strokeStyle = "rgba(255,255,255,0.025)";
  ctx.lineWidth = 1 / zm;
  const arcStart = -Math.PI / 2 - HALF;  // canvas angle for fan start
  const arcEnd   = -Math.PI / 2 + HALF;  // canvas angle for fan end
  for (const [, frac] of TIME_BREAKS) {
    if (frac <= 0) continue;
    const r = INNER_R + frac * (OUTER_R - INNER_R);
    ctx.beginPath();
    ctx.arc(0, 0, r, arcStart, arcEnd);
    ctx.stroke();
  }

  // ── Domain sector separators + labels ───────────────────
  const outerR = OUTER_R + NODE_R * 2;
  const labelR = outerR + 18;
  for (const dom of domKeys) {
    const sec = domSectors[dom];
    const info = TECH_DOMAINS[dom];

    // Sector boundary line (faint radial)
    ctx.beginPath();
    ctx.moveTo(0, 0);
    const bx = outerR * Math.sin(sec.start);
    const by = -outerR * Math.cos(sec.start);
    ctx.lineTo(bx, by);
    ctx.strokeStyle = "rgba(255,255,255,0.06)";
    ctx.lineWidth = 1 / zm;
    ctx.stroke();

    // Sector tint arc (very faint color wash along the outer ring)
    ctx.beginPath();
    ctx.arc(0, 0, outerR - 4, -Math.PI / 2 + sec.start, -Math.PI / 2 + sec.end);
    ctx.strokeStyle = (info.color || "#888") + "18";
    ctx.lineWidth = 8 / zm;
    ctx.stroke();

    // Domain label at sector midpoint (only when zoomed out enough to see the full tree)
    if (zm < 0.9) {
      const la = sec.mid;
      const lx = labelR * Math.sin(la);
      const ly = -labelR * Math.cos(la);
      ctx.save();
      ctx.translate(lx, ly);
      // Rotate text to follow the arc
      const rot = la;
      ctx.rotate(rot);
      // Flip text if on the left half so it reads left-to-right
      if (la < -Math.PI / 2 || la > Math.PI / 2) {
        ctx.rotate(Math.PI);
      }
      const fs = Math.max(8, 12 / zm);
      ctx.font = `${fs}px system-ui, sans-serif`;
      ctx.fillStyle = "rgba(232,228,220,0.35)";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(`${info.icon} ${info.name}`, 0, 0);
      ctx.restore();
    }
  }
  // Closing boundary line for last sector
  { const lastSec = domSectors[domKeys[domKeys.length - 1]];
    ctx.beginPath();
    ctx.moveTo(0, 0);
    const ex = outerR * Math.sin(lastSec.end);
    const ey = -outerR * Math.cos(lastSec.end);
    ctx.lineTo(ex, ey);
    ctx.strokeStyle = "rgba(255,255,255,0.06)";
    ctx.lineWidth = 1 / zm;
    ctx.stroke();
  }

  // Origin dot
  ctx.beginPath();
  ctx.arc(0, 0, 5, 0, Math.PI * 2);
  ctx.fillStyle = "#c9a84c";
  ctx.fill();

  // --- Edges (two passes: dimmed, then highlighted) ---
  drawEdges(false);
  if (sel) drawEdges(true);

  // --- Nodes (screen-space hex tiles, world-space grid) ---
  computeHexPositions();
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  for (const n of nodes) {
    // Cull off-screen nodes
    if (n.sx < -HEX_R * 2 || n.sx > innerWidth + HEX_R * 2 ||
        n.sy < -HEX_R * 2 || n.sy > innerHeight + HEX_R * 2) continue;

    const isSel = n.title === sel;
    const isAnc_ = sel && anc.has(n.title);
    const isDesc_ = sel && desc.has(n.title);
    const dimmed = sel && !isSel && !isAnc_ && !isDesc_;

    ctx.globalAlpha = dimmed ? 0.1 : 1;
    const era = TECH_ERAS[n.era];
    const dom = TECH_DOMAINS[n.props.domain];
    const img = images.get(n.title);

    // Hex fill: image clipped to hex, or domain-tinted hex
    if (img) {
      ctx.save();
      hexPath(ctx, n.sx, n.sy, HEX_R - 0.5);
      ctx.clip();
      ctx.drawImage(img, n.sx - HEX_R, n.sy - HEX_R, HEX_R * 2, HEX_R * 2);
      ctx.restore();
    } else {
      hexPath(ctx, n.sx, n.sy, HEX_R - 0.5);
      ctx.fillStyle = (dom.color || era.color) + (dimmed ? "11" : "33");
      ctx.fill();
      ctx.font = `${Math.max(8, HEX_R * 0.7)}px sans-serif`;
      ctx.fillStyle = dom.color || era.color;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(dom.icon, n.sx, n.sy);
    }

    // Hex border
    hexPath(ctx, n.sx, n.sy, HEX_R);
    ctx.lineWidth = isSel ? 2.5 : 1;

    if (isSel) {
      ctx.shadowColor = "rgba(255,255,255,0.6)";
      ctx.shadowBlur = 12;
      ctx.strokeStyle = "#fff";
    } else if (isAnc_) {
      ctx.shadowColor = "rgba(201,168,76,0.6)";
      ctx.shadowBlur = 8;
      ctx.strokeStyle = "#c9a84c";
    } else if (isDesc_) {
      ctx.shadowColor = "rgba(70,130,180,0.6)";
      ctx.shadowBlur = 8;
      ctx.strokeStyle = "#4682B4";
    } else {
      ctx.shadowBlur = 0;
      ctx.strokeStyle = dom.color || era.color;
      if (n.props.rarity === "legendary" && !dimmed) {
        ctx.shadowColor = (dom.color || era.color) + "66";
        ctx.shadowBlur = 6;
      }
    }
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Title label (show when zoomed in enough that there's room)
    if (zm > 0.25 && !dimmed) {
      ctx.font = "9px system-ui, sans-serif";
      ctx.fillStyle = "#e8e4dc";
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      const label = n.title.replace(/ \(.*\)$/, "");
      ctx.fillText(label.length > 22 ? label.slice(0, 20) + "..." : label, n.sx, n.sy + HEX_R + 2);
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

      // Polar-straight edge: r = mθ + b  (Archimedean spiral segment)
      const pA = ang[p.title], nA = ang[n.title];
      const pR = p.rv, nR = n.rv;
      const dA = nA - pA;

      ctx.beginPath();
      ctx.moveTo(p.wx, p.wy);

      const STEPS = 24;
      for (let i = 1; i <= STEPS; i++) {
        const t = i / STEPS;
        const a = pA + dA * t;
        const r = pR + (nR - pR) * t;
        ctx.lineTo(r * Math.sin(a), -r * Math.cos(a));
      }

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
  // Convert screen click → world → hex cell → O(1) lookup
  const wx = (sx - panX) / zm;
  const wy = (sy - panY) / zm;
  const wR = HEX_R / zm;
  const colW = 1.5 * wR;
  const rowH = Math.sqrt(3) * wR;
  const col0 = Math.round(wx / colW);
  const row0 = Math.round((wy - ((col0 & 1) ? rowH * 0.5 : 0)) / rowH);

  // Check candidate cell and immediate neighbors (handles hex boundary ambiguity)
  let best = null, bestD = wR * 1.1;
  for (let dc = -1; dc <= 1; dc++) {
    for (let dr = -1; dr <= 1; dr++) {
      const c = col0 + dc, r = row0 + dr;
      const n = cellMap.get(c + "," + r);
      if (!n) continue;
      const cx = c * colW;
      const cy = r * rowH + ((c & 1) ? rowH * 0.5 : 0);
      const d = Math.hypot(wx - cx, wy - cy);
      if (d < bestD) { best = n; bestD = d; }
    }
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
    <div class="tt-d-meta">
      <span style="color:${era.color}">${era.icon} ${era.name}</span> · <span style="color:${dom.color || era.color}">${dom.icon} ${dom.name}</span> · ${fmtYear(n.props.year)} · Complexity ${n.props.complexity}/10
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

// Docs overlay
const docsEl = document.getElementById("tt-docs");
document.getElementById("tt-help-btn").onclick = () => docsEl.classList.toggle("hidden");
document.getElementById("tt-docs-close").onclick = () => docsEl.classList.add("hidden");
docsEl.addEventListener("click", e => { if (e.target === docsEl) docsEl.classList.add("hidden"); });

window.addEventListener("resize", () => { resize(); fitView(); });

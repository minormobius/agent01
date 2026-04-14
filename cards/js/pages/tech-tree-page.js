// ── Tech Tree — infinite canvas with polar fan layout ─────────
import { TECH_ERAS, TECH_DOMAINS, TECH_POOL } from "../pools/tech-pool.js";
import { fetchArticleData } from "../core/shared.js";

/* ── Config ──────────────────────────────────────────────── */
const NODE_R = 30;          // world-space radius for layout spacing
const HEX_R = 16;           // constant screen-pixel radius for rendering
const GAP = 16;             // min gap between node edges (arc-length)
const SPAN = Math.PI / 4;       // 45° fan (narrow tree, grows outward via hex packing)
const HALF = SPAN / 2;          // 22.5° each side of vertical
const DOM_GRAVITY = 0.70;   // how strongly nodes cling to domain sector
const INNER_R = 600;        // innermost node radius (year-based)
const OUTER_R = 6000;       // outermost node radius

/* ── Funnel boundary: θ_max ∝ r² (parabolic tree envelope) ── */
function funnelHalf(r) {
  const t = Math.min(1.3, Math.max(0, r / OUTER_R));
  return HALF * Math.max(0.08, t * t);   // 0.08 = min trunk width
}

function inFunnel(wx, wy) {
  const r = Math.hypot(wx, wy);
  if (r < 1) return true;
  const theta = Math.atan2(wx, -wy);     // angle from north (our convention)
  return Math.abs(theta) <= funnelHalf(r);
}

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
let hexMode = true;        // toggle: hex-packed tree vs. polar map

/* ── Plinko mode — gravity-driven packed bed ────────────── */
let plinkoMode = false;
let pkTime = 0, pkFrame = 0, pkSettled = 0;
const pkSorted = [...nodes].sort((a, b) => a.props.year - b.props.year || a.id - b.id);
const pkState = new Map();   // title → {x, y, vx, vy}
const pkBirth = new Map();   // title → frame released

const PK_R = HEX_R;
const PK_GRAV = 0.22;            // gravity (px/frame²)
const PK_DAMP = 0.86;            // heavy damping — kills thermal jiggle
const PK_BOUNCE = 0.02;          // near-zero restitution
const PK_PREREQ = 0.03;          // gentle grappling-hook pull
const PK_VKILL = 0.05;           // velocity snap-to-zero threshold
const LJ_EPS = 2.5;              // Lennard-Jones well depth
const LJ_FMAX = 3.0;             // cap repulsive force per pair

// Funnel: V-cone — wide at top, narrow at bottom
let pkCx, pkTopY, pkBotY, pkTopHW, pkBotHW;
function pkHW(y) {
  const t = Math.max(0, Math.min(1, (y - pkTopY) / (pkBotY - pkTopY)));
  return pkTopHW + t * (pkBotHW - pkTopHW);
}
function pkWallL(y) { return pkCx - pkHW(y); }
function pkWallR(y) { return pkCx + pkHW(y); }

function initPlinko() {
  pkTime = 0; pkFrame = 0; pkSettled = 0;
  pkState.clear(); pkBirth.clear();
  const W = innerWidth, H = innerHeight;
  pkCx = W / 2;
  pkTopY = PK_R * 2;
  pkBotY = H - PK_R;
  pkTopHW = W * 0.44;             // wide opening at top
  pkBotHW = PK_R * 2;             // 2-disk-wide point at bottom
  for (const n of nodes) {
    const sec = domSectors[n.props.domain];
    const frac = (sec.mid + HALF) / SPAN;
    const x = pkWallL(pkTopY) + frac * (pkWallR(pkTopY) - pkWallL(pkTopY));
    pkState.set(n.title, {
      x, y: pkTopY - PK_R * 4 - Math.random() * PK_R * 2,
      vx: (Math.random() - 0.5) * 0.1, vy: 0
    });
  }
}

function stepPlinko() {
  pkFrame++;
  // Release 1 disk per 4 frames (~33 s for 500 at 60 fps)
  if (pkFrame % 4 === 0 && pkTime < pkSorted.length)
    pkBirth.set(pkSorted[pkTime++].title, pkFrame);

  const active = [];
  const D = PK_R * 2;
  const LJ_SIG = D * 0.8909;      // equilibrium at r = D (contact)
  const LJ_CUT2 = D * D * 4;      // cutoff at 2D
  for (const n of nodes) { if (pkBirth.has(n.title)) active.push(n); }

  // Gravity + prerequisite springs → velocity
  for (const n of active) {
    const s = pkState.get(n.title);
    s.vy += PK_GRAV;
    for (const pT of n.props.prereqs) {
      if (!pkBirth.has(pT)) continue;
      const ps = pkState.get(pT);
      if (!ps) continue;
      const dx = ps.x - s.x, dy = ps.y - s.y;
      const d = Math.hypot(dx, dy);
      if (d > 1) { s.vx += (dx / d) * PK_PREREQ; s.vy += (dy / d) * PK_PREREQ * 0.15; }
    }
  }

  // Lennard-Jones inter-disk potential → velocity
  // Repulsive core prevents overlap; attractive well encourages hex packing
  for (let i = 0; i < active.length; i++) {
    const si = pkState.get(active[i].title);
    for (let j = i + 1; j < active.length; j++) {
      const sj = pkState.get(active[j].title);
      const dx = si.x - sj.x, dy = si.y - sj.y;
      const r2 = dx * dx + dy * dy;
      if (r2 > LJ_CUT2 || r2 < 1) continue;
      const r = Math.sqrt(r2);
      const inv = LJ_SIG / r;
      const inv3 = inv * inv * inv;
      const inv6 = inv3 * inv3;
      // F = 24ε/r · [2(σ/r)^12 − (σ/r)^6]  (+ve = repulsive)
      let f = 24 * LJ_EPS / r * (2 * inv6 * inv6 - inv6);
      f = Math.max(-0.12, Math.min(LJ_FMAX, f));   // cap attraction gently
      const fx = f * dx / r, fy = f * dy / r;
      si.vx += fx; si.vy += fy;
      sj.vx -= fx; sj.vy -= fy;
    }
  }

  // Damping + integration
  for (const n of active) {
    const s = pkState.get(n.title);
    s.vx *= PK_DAMP; s.vy *= PK_DAMP;
    s.x += s.vx; s.y += s.vy;
  }

  // Wall + floor clamping
  for (const n of active) {
    const s = pkState.get(n.title);
    const lw = pkWallL(s.y) + PK_R, rw = pkWallR(s.y) - PK_R;
    if (lw >= rw) { s.x = pkCx; s.vx = 0; }
    else {
      if (s.x < lw) { s.x = lw; s.vx = Math.abs(s.vx) * PK_BOUNCE; }
      if (s.x > rw) { s.x = rw; s.vx = -Math.abs(s.vx) * PK_BOUNCE; }
    }
    if (s.y > pkBotY - PK_R) { s.y = pkBotY - PK_R; s.vy = -Math.abs(s.vy) * PK_BOUNCE; s.vx *= 0.8; }
    if (s.y < pkTopY - PK_R * 8) { s.y = pkTopY - PK_R * 8; s.vy = 0; }
  }

  // Position correction safety net — 2 passes for deep piles
  for (let pass = 0; pass < 2; pass++) {
    for (let i = 0; i < active.length; i++) {
      const si = pkState.get(active[i].title);
      for (let j = i + 1; j < active.length; j++) {
        const sj = pkState.get(active[j].title);
        const dx = si.x - sj.x, dy = si.y - sj.y;
        const r2 = dx * dx + dy * dy;
        if (r2 >= D * D || r2 < 0.01) continue;
        const r = Math.sqrt(r2);
        const nx = dx / r, ny = dy / r;
        const ov = (D - r) * 0.52;
        si.x += nx * ov; si.y += ny * ov;
        sj.x -= nx * ov; sj.y -= ny * ov;
        const rv = (si.vx - sj.vx) * nx + (si.vy - sj.vy) * ny;
        if (rv < 0) {
          si.vx -= nx * rv * 0.5; si.vy -= ny * rv * 0.5;
          sj.vx += nx * rv * 0.5; sj.vy += ny * rv * 0.5;
        }
      }
    }
  }

  // Post-correction wall clamp
  for (const n of active) {
    const s = pkState.get(n.title);
    const lw = pkWallL(s.y) + PK_R, rw = pkWallR(s.y) - PK_R;
    if (lw >= rw) { s.x = pkCx; s.vx = 0; }
    else { if (s.x < lw) { s.x = lw; s.vx = 0; } if (s.x > rw) { s.x = rw; s.vx = 0; } }
    if (s.y > pkBotY - PK_R) { s.y = pkBotY - PK_R; s.vy = 0; }
  }

  // Velocity kill + settle detection
  let moving = false;
  for (const n of active) {
    const s = pkState.get(n.title);
    if (Math.abs(s.vx) < PK_VKILL) s.vx = 0;
    if (Math.abs(s.vy) < PK_VKILL) s.vy = 0;
    if (s.vx !== 0 || s.vy !== 0) moving = true;
  }
  if (!moving && pkTime >= pkSorted.length) {
    pkSettled++;
    return pkSettled < 3;
  }
  pkSettled = 0;
  return true;
}

function endPlinko() {
  const a_ = ang;
  nodes.forEach(n => { n.wx = n.rv * Math.sin(a_[n.title]); n.wy = -n.rv * Math.cos(a_[n.title]); });
  pkState.clear(); pkBirth.clear();
}

function drawPlinko(dpr) {
  const running = stepPlinko();
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  // Cone fill
  ctx.beginPath();
  ctx.moveTo(pkWallL(pkTopY), pkTopY);
  ctx.lineTo(pkWallL(pkBotY), pkBotY);
  ctx.lineTo(pkWallR(pkBotY), pkBotY);
  ctx.lineTo(pkWallR(pkTopY), pkTopY);
  ctx.closePath();
  ctx.fillStyle = "rgba(201,168,76,0.03)";
  ctx.fill();

  // Cone outline
  ctx.beginPath();
  ctx.moveTo(pkWallL(pkTopY), pkTopY);
  ctx.lineTo(pkWallL(pkBotY), pkBotY);
  ctx.lineTo(pkWallR(pkBotY), pkBotY);
  ctx.lineTo(pkWallR(pkTopY), pkTopY);
  ctx.strokeStyle = "rgba(201,168,76,0.35)";
  ctx.lineWidth = 2;
  ctx.stroke();

  // Domain lane guides (converging toward bottom)
  for (const dom of domKeys) {
    const sec = domSectors[dom];
    const frac = (sec.mid + HALF) / SPAN;
    const x1 = pkWallL(pkTopY) + frac * (pkWallR(pkTopY) - pkWallL(pkTopY));
    const x2 = pkWallL(pkBotY) + frac * (pkWallR(pkBotY) - pkWallL(pkBotY));
    ctx.beginPath(); ctx.moveTo(x1, pkTopY); ctx.lineTo(x2, pkBotY);
    ctx.strokeStyle = (TECH_DOMAINS[dom].color || "#888") + "12";
    ctx.lineWidth = 1; ctx.stroke();
  }

  // Edges (grappling hooks)
  for (const n of nodes) {
    if (!pkBirth.has(n.title)) continue;
    const sn = pkState.get(n.title);
    for (const pTitle of n.props.prereqs) {
      if (!pkBirth.has(pTitle)) continue;
      const sp = pkState.get(pTitle);
      if (!sp) continue;
      const isAnc_ = anc.has(n.title) || n.title === sel;
      const isDesc_ = desc.has(n.title) && (pTitle === sel || desc.has(pTitle));
      if (sel && !isAnc_ && !isDesc_) continue;
      ctx.beginPath(); ctx.moveTo(sp.x, sp.y); ctx.lineTo(sn.x, sn.y);
      if (isAnc_ && sel) { ctx.strokeStyle = "rgba(201,168,76,0.65)"; ctx.lineWidth = 1.5; }
      else if (isDesc_ && sel) { ctx.strokeStyle = "rgba(70,130,180,0.65)"; ctx.lineWidth = 1.5; }
      else {
        const age = pkFrame - Math.max(pkBirth.get(n.title), pkBirth.get(pTitle));
        const br = Math.max(0.04, 0.4 * Math.exp(-age / 12));
        ctx.strokeStyle = `rgba(201,168,76,${br.toFixed(2)})`; ctx.lineWidth = br > 0.12 ? 1 : 0.5;
      }
      ctx.stroke();
    }
  }

  // Disks
  for (const n of nodes) {
    if (!pkBirth.has(n.title)) continue;
    const s = pkState.get(n.title);
    const isSel = n.title === sel;
    const isAnc_ = sel && anc.has(n.title);
    const isDesc_ = sel && desc.has(n.title);
    const dimmed = sel && !isSel && !isAnc_ && !isDesc_;
    ctx.globalAlpha = dimmed ? 0.1 : 1;
    const dom = TECH_DOMAINS[n.props.domain];
    const era = TECH_ERAS[n.era];
    const img = images.get(n.title);
    if (img) {
      ctx.save(); hexPath(ctx, s.x, s.y, PK_R - 0.5); ctx.clip();
      ctx.drawImage(img, s.x - PK_R, s.y - PK_R, PK_R * 2, PK_R * 2); ctx.restore();
    } else {
      hexPath(ctx, s.x, s.y, PK_R - 0.5);
      ctx.fillStyle = (dom.color || era.color) + "33"; ctx.fill();
      ctx.font = `${Math.max(8, PK_R * 0.7)}px sans-serif`;
      ctx.fillStyle = dom.color || era.color;
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText(dom.icon, s.x, s.y);
    }
    hexPath(ctx, s.x, s.y, PK_R);
    ctx.lineWidth = isSel ? 2.5 : 1;
    if (isSel) { ctx.shadowColor = "rgba(255,255,255,0.6)"; ctx.shadowBlur = 12; ctx.strokeStyle = "#fff"; }
    else if (isAnc_) { ctx.shadowColor = "rgba(201,168,76,0.6)"; ctx.shadowBlur = 8; ctx.strokeStyle = "#c9a84c"; }
    else if (isDesc_) { ctx.shadowColor = "rgba(70,130,180,0.6)"; ctx.shadowBlur = 8; ctx.strokeStyle = "#4682B4"; }
    else { ctx.shadowBlur = 0; ctx.strokeStyle = dom.color || era.color;
      if (n.props.rarity === "legendary" && !dimmed) { ctx.shadowColor = (dom.color || era.color) + "66"; ctx.shadowBlur = 6; }
    }
    ctx.stroke(); ctx.shadowBlur = 0;
    ctx.globalAlpha = 1;
  }
  if (running) scheduleDraw();
}

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

  // Deterministic priority: TEMPORAL FIRST (oldest nodes fill trunk inward),
  // then rarity, then complexity.  Ensures strict time ordering radially.
  const sorted = [...nodes].sort((a, b) =>
    a.props.year - b.props.year
    || (RARITY_PRI[a.props.rarity] ?? 3) - (RARITY_PRI[b.props.rarity] ?? 3)
    || b.props.complexity - a.props.complexity
    || a.id - b.id);

  for (const n of sorted) {
    const ideal = toHex(n.wx, n.wy);
    let bestCol = ideal.col, bestRow = ideal.row;
    const idealPos = toWorld(ideal.col, ideal.row);
    const idealR = Math.hypot(idealPos.hx, idealPos.hy);
    const idealFree = !occupied.has(cellKey(ideal.col, ideal.row))
                      && inFunnel(idealPos.hx, idealPos.hy)
                      && idealR >= n.rv - wR;

    if (!idealFree) {
      let bestDist = Infinity;
      for (let ring = 1; ring <= 40; ring++) {
        let found = false;
        for (let dc = -ring; dc <= ring; dc++) {
          for (let dr = -ring; dr <= ring; dr++) {
            if (Math.abs(dc) !== ring && Math.abs(dr) !== ring) continue;
            const c = ideal.col + dc, r = ideal.row + dr;
            if (occupied.has(cellKey(c, r))) continue;
            const pos = toWorld(c, r);
            if (!inFunnel(pos.hx, pos.hy)) continue;   // funnel boundary
            const cellR = Math.hypot(pos.hx, pos.hy);
            if (cellR < n.rv - wR) continue;            // can't go back in time
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

  const sR = NODE_R * zm;  // screen-space node radius (polar mode)

  // Era arcs at temporal breakpoints
  ctx.strokeStyle = "rgba(255,255,255,0.025)";
  ctx.lineWidth = 1 / zm;
  for (const [, frac] of TIME_BREAKS) {
    if (frac <= 0) continue;
    const r = INNER_R + frac * (OUTER_R - INNER_R);
    const fh = hexMode ? funnelHalf(r) : HALF;
    ctx.beginPath();
    ctx.arc(0, 0, r, -Math.PI / 2 - fh, -Math.PI / 2 + fh);
    ctx.stroke();
  }

  // ── Funnel envelope (hex mode only) ─────────────────────
  if (hexMode) {
    const FSTEPS = 48;
    for (const side of [1, -1]) {
      ctx.beginPath();
      for (let i = 0; i <= FSTEPS; i++) {
        const r = INNER_R * 0.2 + (OUTER_R * 1.3 - INNER_R * 0.2) * (i / FSTEPS);
        const a = side * funnelHalf(r);
        const fx = r * Math.sin(a);
        const fy = -r * Math.cos(a);
        i === 0 ? ctx.moveTo(fx, fy) : ctx.lineTo(fx, fy);
      }
      ctx.strokeStyle = "rgba(201,168,76,0.06)";
      ctx.lineWidth = 1.5 / zm;
      ctx.stroke();
    }
  }

  // ── Domain sector separators + labels ───────────────────
  const corners = [[-panX / zm, -panY / zm],
    [(innerWidth - panX) / zm, -panY / zm],
    [(innerWidth - panX) / zm, (innerHeight - panY) / zm],
    [-panX / zm, (innerHeight - panY) / zm]];
  const maxVisR = Math.max(OUTER_R, ...corners.map(([x, y]) => Math.hypot(x, y)));
  const labelR = maxVisR + 30 / zm;

  for (const dom of domKeys) {
    const sec = domSectors[dom];
    const info = TECH_DOMAINS[dom];

    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(maxVisR * Math.sin(sec.start), -maxVisR * Math.cos(sec.start));
    ctx.strokeStyle = "rgba(255,255,255,0.06)";
    ctx.lineWidth = 1 / zm;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(0, 0, maxVisR - 4 / zm, -Math.PI / 2 + sec.start, -Math.PI / 2 + sec.end);
    ctx.strokeStyle = (info.color || "#888") + "18";
    ctx.lineWidth = 8 / zm;
    ctx.stroke();

    const la = sec.mid;
    const lx = labelR * Math.sin(la);
    const ly = -labelR * Math.cos(la);
    ctx.save();
    ctx.translate(lx, ly);
    ctx.rotate(la);
    if (la < -Math.PI / 2 || la > Math.PI / 2) ctx.rotate(Math.PI);
    const fs = Math.max(8, 14 / zm);
    ctx.font = `${fs}px system-ui, sans-serif`;
    ctx.fillStyle = "rgba(232,228,220,0.35)";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(`${info.icon} ${info.name}`, 0, 0);
    ctx.restore();
  }
  { const lastSec = domSectors[domKeys[domKeys.length - 1]];
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(maxVisR * Math.sin(lastSec.end), -maxVisR * Math.cos(lastSec.end));
    ctx.strokeStyle = "rgba(255,255,255,0.06)";
    ctx.lineWidth = 1 / zm;
    ctx.stroke();
  }

  // Origin dot
  ctx.beginPath();
  ctx.arc(0, 0, 5, 0, Math.PI * 2);
  ctx.fillStyle = "#c9a84c";
  ctx.fill();

  if (plinkoMode) { drawPlinko(dpr); return; }

  if (hexMode) {
    // ── HEX MODE: constant-pixel hex tiles, world-space grid ──
    computeHexPositions();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    drawEdges(false);
    if (sel) drawEdges(true);

    for (const n of nodes) {
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

      hexPath(ctx, n.sx, n.sy, HEX_R);
      ctx.lineWidth = isSel ? 2.5 : 1;
      if (isSel) { ctx.shadowColor = "rgba(255,255,255,0.6)"; ctx.shadowBlur = 12; ctx.strokeStyle = "#fff"; }
      else if (isAnc_) { ctx.shadowColor = "rgba(201,168,76,0.6)"; ctx.shadowBlur = 8; ctx.strokeStyle = "#c9a84c"; }
      else if (isDesc_) { ctx.shadowColor = "rgba(70,130,180,0.6)"; ctx.shadowBlur = 8; ctx.strokeStyle = "#4682B4"; }
      else { ctx.shadowBlur = 0; ctx.strokeStyle = dom.color || era.color;
        if (n.props.rarity === "legendary" && !dimmed) { ctx.shadowColor = (dom.color || era.color) + "66"; ctx.shadowBlur = 6; }
      }
      ctx.stroke();
      ctx.shadowBlur = 0;

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
  } else {
    // ── POLAR MODE ──
    drawEdgesPolar(false); if (sel) drawEdgesPolar(true);

    for (const n of nodes) {
      const isSel = n.title === sel;
      const isAnc_ = sel && anc.has(n.title);
      const isDesc_ = sel && desc.has(n.title);
      const dimmed = sel && !isSel && !isAnc_ && !isDesc_;

      ctx.globalAlpha = dimmed ? 0.1 : 1;
      const era = TECH_ERAS[n.era];
      const dom = TECH_DOMAINS[n.props.domain];
      const img = images.get(n.title);

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
        ctx.fillStyle = (dom.color || era.color) + (dimmed ? "11" : "33");
        ctx.fill();
        if (sR > 6) {
          ctx.font = `${Math.max(10, NODE_R * 0.55)}px sans-serif`;
          ctx.fillStyle = dom.color || era.color;
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText(dom.icon, n.wx, n.wy);
        }
      }

      ctx.beginPath();
      ctx.arc(n.wx, n.wy, NODE_R, 0, Math.PI * 2);
      ctx.lineWidth = (isSel ? 3 : 2) / zm;
      if (isSel) { ctx.shadowColor = "rgba(255,255,255,0.6)"; ctx.shadowBlur = 16 / zm; ctx.strokeStyle = "#fff"; }
      else if (isAnc_) { ctx.shadowColor = "rgba(201,168,76,0.6)"; ctx.shadowBlur = 10 / zm; ctx.strokeStyle = "#c9a84c"; }
      else if (isDesc_) { ctx.shadowColor = "rgba(70,130,180,0.6)"; ctx.shadowBlur = 10 / zm; ctx.strokeStyle = "#4682B4"; }
      else { ctx.shadowBlur = 0; ctx.strokeStyle = dom.color || era.color;
        if (n.props.rarity === "legendary" && !dimmed) { ctx.shadowColor = (dom.color || era.color) + "66"; ctx.shadowBlur = 8 / zm; }
      }
      ctx.stroke();
      ctx.shadowBlur = 0;

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

}

function drawEdgesPolar(hlOnly) {
  // Archimedean spiral edges in world space: linearly interpolate θ and r
  const STEPS = 24;
  for (const n of nodes) {
    for (const pTitle of n.props.prereqs) {
      const p = byTitle[pTitle];
      if (!p) continue;
      const isAnc_ = anc.has(n.title) || n.title === sel;
      const isDesc_ = desc.has(n.title) && (pTitle === sel || desc.has(pTitle));
      const hl = sel && (isAnc_ || isDesc_);
      if (hlOnly && !hl) continue;
      if (!hlOnly && hl && sel) continue;

      const a0 = ang[pTitle], r0 = p.rv;
      const a1 = ang[n.title], r1 = n.rv;

      ctx.beginPath();
      for (let i = 0; i <= STEPS; i++) {
        const t = i / STEPS;
        const a = a0 + (a1 - a0) * t;
        const r = r0 + (r1 - r0) * t;
        const x = r * Math.sin(a);
        const y = -r * Math.cos(a);
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }

      if (isAnc_ && sel) {
        ctx.strokeStyle = "rgba(201,168,76,0.7)";
        ctx.lineWidth = 2 / zm;
      } else if (isDesc_ && sel) {
        ctx.strokeStyle = "rgba(70,130,180,0.7)";
        ctx.lineWidth = 2 / zm;
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

function drawEdges(hlOnly) {
  // Edges connect hex window centers in screen space
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
      ctx.moveTo(p.sx, p.sy);
      ctx.lineTo(n.sx, n.sy);

      if (isAnc_ && sel) {
        ctx.strokeStyle = "rgba(201,168,76,0.7)";
        ctx.lineWidth = 2;
      } else if (isDesc_ && sel) {
        ctx.strokeStyle = "rgba(70,130,180,0.7)";
        ctx.lineWidth = 2;
      } else if (sel) {
        ctx.strokeStyle = "rgba(100,100,100,0.05)";
        ctx.lineWidth = 0.5;
      } else {
        ctx.strokeStyle = "rgba(140,130,120,0.18)";
        ctx.lineWidth = 1;
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
  const wx = (sx - panX) / zm;
  const wy = (sy - panY) / zm;

  if (plinkoMode) {
    // Plinko mode: screen-space distance check
    let best = null, bestD = PK_R * 1.3;
    for (const n of nodes) {
      if (!pkBirth.has(n.title)) continue;
      const s = pkState.get(n.title);
      const d = Math.hypot(s.x - sx, s.y - sy);
      if (d < bestD) { best = n; bestD = d; }
    }
    return best;
  }

  if (!hexMode) {
    // Polar mode: world-space distance check
    let best = null, bestD = NODE_R * 1.5;
    for (const n of nodes) {
      const d = Math.hypot(n.wx - wx, n.wy - wy);
      if (d < bestD) { best = n; bestD = d; }
    }
    return best;
  }

  // Hex mode: screen click → world → hex cell → O(1) lookup
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

/* ── Innovation timeline ─────────────────────────────────── */
const TL_BINS = [
  [-3500000, -10000, "Pre-10k BCE"],
  [-10000, -3000,    "Neolithic"],
  [-3000, 0,         "Ancient"],
  [0, 500,           "0–500"],
  [500, 1000,        "500–1000"],
  [1000, 1400,       "Medieval"],
  [1400, 1600,       "1400–1600"],
  [1600, 1700,       "1600s"],
  [1700, 1750,       "1700–50"],
  [1750, 1800,       "1750–1800"],
  [1800, 1850,       "1800–50"],
  [1850, 1900,       "1850–1900"],
  [1900, 1935,       "1900–35"],
  [1935, 1960,       "1935–60"],
  [1960, 1990,       "1960–90"],
  [1990, 2010,       "1990–2010"],
  [2010, 2030,       "2010+"],
];

function buildTimeline() {
  const chart = document.getElementById("tt-tl-chart");
  chart.innerHTML = "";

  const bins = TL_BINS.map(([lo, hi, label]) => {
    const techs = nodes.filter(n => n.props.year >= lo && n.props.year < hi);
    const total = techs.reduce((s, n) => s + n.props.complexity, 0);
    return { lo, hi, label, count: techs.length, total, techs };
  });

  const maxTotal = Math.max(...bins.map(b => b.total), 1);

  for (const bin of bins) {
    const bar = document.createElement("div");
    bar.className = "tt-tl-bar";

    const val = document.createElement("div");
    val.className = "tt-tl-val";
    val.textContent = bin.total || "";

    const fill = document.createElement("div");
    fill.className = "tt-tl-fill";
    const h = bin.total ? Math.max(3, (bin.total / maxTotal) * 90) : 0;
    fill.style.height = h + "px";
    // Gold intensity scales with density
    const a = 0.35 + 0.65 * (bin.total / maxTotal);
    fill.style.background = `rgba(201,168,76,${a.toFixed(2)})`;

    const lbl = document.createElement("div");
    lbl.className = "tt-tl-lbl";
    lbl.textContent = bin.label;

    bar.appendChild(val);
    bar.appendChild(fill);
    bar.appendChild(lbl);

    bar.title = `${bin.label}: ${bin.count} techs, complexity ${bin.total}`;
    bar.addEventListener("click", () => {
      if (!bin.techs.length) return;
      const xs = bin.techs.map(n => n.wx), ys = bin.techs.map(n => n.wy);
      const pad = NODE_R * 5;
      const x0 = Math.min(...xs) - pad, x1 = Math.max(...xs) + pad;
      const y0 = Math.min(...ys) - pad, y1 = Math.max(...ys) + pad;
      const bw = x1 - x0, bh = y1 - y0;
      zm = Math.min(innerWidth / bw, (innerHeight - 160) / bh) * 0.88;
      panX = innerWidth / 2 - (x0 + bw / 2) * zm;
      panY = (innerHeight - 160) / 2 - (y0 + bh / 2) * zm;
      scheduleDraw();
    });

    chart.appendChild(bar);
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

// Hex/polar toggle
const modeBtn = document.getElementById("tt-mode-btn");
modeBtn.classList.add("active");  // hex mode starts active
function toggleMode() {
  if (plinkoMode) { plinkoMode = false; endPlinko(); }
  hexMode = !hexMode;
  modeBtn.textContent = hexMode ? "\u2B21" : "\u25C9";
  modeBtn.classList.toggle("active", hexMode);
  scheduleDraw();
}
modeBtn.onclick = toggleMode;

// Plinko toggle
const plinkoBtn = document.getElementById("tt-plinko-btn");
function togglePlinko() {
  plinkoMode = !plinkoMode;
  if (plinkoMode) {
    hexMode = false;
    modeBtn.textContent = "\u25C9";
    modeBtn.classList.remove("active");
    initPlinko();
  } else {
    endPlinko();
  }
  plinkoBtn.classList.toggle("active", plinkoMode);
  scheduleDraw();
}
plinkoBtn.onclick = togglePlinko;

// Timeline chart
const tlEl = document.getElementById("tt-timeline");
const chartBtn = document.getElementById("tt-chart-btn");
function toggleTimeline() {
  const opening = tlEl.classList.contains("hidden");
  tlEl.classList.toggle("hidden");
  chartBtn.classList.toggle("active", opening);
  if (opening) buildTimeline();
}
chartBtn.onclick = toggleTimeline;
document.getElementById("tt-tl-close").onclick = () => {
  tlEl.classList.add("hidden");
  chartBtn.classList.remove("active");
};

window.addEventListener("keydown", e => {
  if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") return;
  if (e.key === "h" || e.key === "H") toggleMode();
  if (e.key === "t" || e.key === "T") toggleTimeline();
  if (e.key === "p" || e.key === "P") togglePlinko();
});

window.addEventListener("resize", () => { resize(); fitView(); });

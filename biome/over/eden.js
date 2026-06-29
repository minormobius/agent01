// biome/over/eden.js — the biosphere generator for the overworld. Pure, deterministic, node-testable.
//
// VENDORED from hoop/over/eden.js (the game wing's "level zero"). Kept near-verbatim so the two stay
// in sync; the only addition is the `treeSpacing` opt (a rolled biome dials forest density). Re-sync
// from hoop, don't fork — same rule as the repo's other vendored kernels.
//
// NOT a reskin of the city foam — its own model. The order of operations is the hydrology:
//   1. MEGA-LAKES are placed deliberately (controlled surfaces for the bioengine) — a sparse jittered
//      grid of large basins with wavy shores. There are NO anomalous lakes: water only exists where a
//      lake was placed, or in a stream that drains into one.
//   2. STREAMS are TRIBUTARIES, traced per lake: from a source ring, each follows downhill (−∇ of a
//      value-noise terrain) blended with a pull toward the lake and a meander term, so it WINDS and is
//      GUARANTEED to terminate in the lake. Width accretes toward the mouth. Every stream ends in a lake.
//   3. The FOREST is a tree-DENSITY field, not a palette: variable-radius Poisson-disk (blue-noise) where
//      the spacing is the inverse of a wetness field — a real spatial-density gradient (the Voronoi
//      seed-size gradient). Trees are occluders; you weave between trunks.
//   4. BRIDGES are placed along streams at intervals, so the land a stream divides stays connected — the
//      only places you cross water.
// Everything is a pure function of (seed, world position); tiles (az,ax) just bound generation + caching.

const TAU = Math.PI * 2, clamp = (x, a, b) => (x < a ? a : x > b ? b : x), lerp = (a, b, t) => a + (b - a) * t;
function hash2(seed, x, y) { let n = Math.imul((x | 0) ^ 0x1f83a9b3, 0x2c1b3c6d) ^ Math.imul((y | 0) ^ 0x0f0f0f0f, 0x9e3779b1) ^ Math.imul(seed | 0, 0x85ebca6b); n = Math.imul(n ^ (n >>> 15), 0x27d4eb2f); n ^= n >>> 13; return (n >>> 0) / 4294967296; }
function vnoise(seed, x, y) { const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi, sx = xf * xf * (3 - 2 * xf), sy = yf * yf * (3 - 2 * yf); const a = hash2(seed, xi, yi), b = hash2(seed, xi + 1, yi), c = hash2(seed, xi, yi + 1), d = hash2(seed, xi + 1, yi + 1), top = a + (b - a) * sx, bot = c + (d - c) * sx; return top + (bot - top) * sy; }
function fbm(seed, x, y) { let v = 0, amp = 0.5, f = 1; for (let i = 0; i < 4; i++) { v += amp * vnoise(seed + i * 131, x * f, y * f); f *= 2; amp *= 0.5; } return v; }

export function makeEden(seed = 7, opts = {}) {
  const TILE = opts.tile || 1600, R = opts.R || 30;
  const TREE_SP = opts.treeSpacing || 1;   // a rolled biome dials canopy density (>1 sparser heath, <1 denser thicket)
  const LAKE_SP = TILE * 2.1, TERRAIN = 240, MOIST = 620, STEP = 26;

  // ── 1. mega-lakes: a sparse jittered grid; wavy shore so they aren't perfect discs ──
  function lakeCell(i, j) {
    if (hash2(seed ^ 0x10ce, i, j) > 0.46) return null;     // ~46% of grid cells host a lake (deliberate, not everywhere)
    const jx = hash2(seed ^ 1, i, j), jy = hash2(seed ^ 2, i, j), jr = hash2(seed ^ 3, i, j);
    return { id: i + ',' + j, cx: (i + 0.15 + 0.7 * jx) * LAKE_SP, cy: (j + 0.15 + 0.7 * jy) * LAKE_SP, r: TILE * (0.42 + 0.62 * jr) };
  }
  function lakesNear(gx, gy, pad = 0) {
    const out = [], reach = TILE * 1.1 + pad, i0 = Math.floor((gx - reach - LAKE_SP) / LAKE_SP), i1 = Math.floor((gx + reach + LAKE_SP) / LAKE_SP), j0 = Math.floor((gy - reach - LAKE_SP) / LAKE_SP), j1 = Math.floor((gy + reach + LAKE_SP) / LAKE_SP);
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) { const l = lakeCell(i, j); if (l && (l.cx - gx) ** 2 + (l.cy - gy) ** 2 < (l.r + reach) ** 2) out.push(l); }
    return out;
  }
  const shoreR = (l, ang) => l.r * (0.86 + 0.17 * vnoise(seed ^ 0xa11, Math.cos(ang) * 3 + l.cx * 0.003, Math.sin(ang) * 3 + l.cy * 0.003));
  function lakeAt(gx, gy) { for (const l of lakesNear(gx, gy)) { const dx = gx - l.cx, dy = gy - l.cy, d = Math.hypot(dx, dy); if (d < shoreR(l, Math.atan2(dy, dx))) return l; } return null; }

  // ── 2. streams: winding tributaries traced into each lake (guaranteed to terminate there) ──
  // A stream reaches ~2.5 TILE from its lake, so "is this point on a stream" can't just look at nearby
  // lakes — segments are indexed into a global grid for O(1) queries (also what makes the forest fast).
  const streamCache = new Map(), segGrid = new Map(), SCELL = 40, STREAM_REACH = TILE * 1.7;
  const sk = (cx, cy) => cx + '|' + cy;
  function indexStream(st) {
    const P = st.pts, hw = st.width * 1.1 + 6;
    for (let i = 1; i < P.length; i++) { const x1 = P[i - 1][0], y1 = P[i - 1][1], x2 = P[i][0], y2 = P[i][1], seg = { x1, y1, x2, y2, w: st.width, st };
      const cx0 = Math.floor((Math.min(x1, x2) - hw) / SCELL), cx1 = Math.floor((Math.max(x1, x2) + hw) / SCELL), cy0 = Math.floor((Math.min(y1, y2) - hw) / SCELL), cy1 = Math.floor((Math.max(y1, y2) + hw) / SCELL);
      for (let cx = cx0; cx <= cx1; cx++) for (let cy = cy0; cy <= cy1; cy++) { const k = sk(cx, cy); let a = segGrid.get(k); if (!a) { a = []; segGrid.set(k, a); } a.push(seg); } }
  }
  function lakeStreams(l) {
    if (streamCache.has(l.id)) return streamCache.get(l.id);
    const K = 3 + (hash2(seed ^ 7, l.cx | 0, l.cy | 0) * 4 | 0), out = [];
    for (let k = 0; k < K; k++) {
      const a = (k / K + 0.18 * hash2(seed ^ 5, k, l.cx | 0)) * TAU, mph = hash2(seed ^ 9, k, l.cy | 0) * TAU;
      let x = l.cx + Math.cos(a) * l.r * 2.3, y = l.cy + Math.sin(a) * l.r * 2.3; const pts = [[x, y]]; let w = 1.6;
      for (let s = 0; s < 240; s++) {
        const tx = l.cx - x, ty = l.cy - y, td = Math.hypot(tx, ty) || 1;
        // downhill of the terrain (unit, for wind), the lake pull (unit, dominant → guarantees it drains), a meander
        let gx = fbm(seed, (x + 8) / TERRAIN, y / TERRAIN) - fbm(seed, (x - 8) / TERRAIN, y / TERRAIN);
        let gy = fbm(seed, x / TERRAIN, (y + 8) / TERRAIN) - fbm(seed, x / TERRAIN, (y - 8) / TERRAIN);
        const gl = Math.hypot(gx, gy) || 1; gx /= gl; gy /= gl;
        const px = -ty / td, py = tx / td, mw = Math.sin(s * 0.2 + mph) + 0.4 * Math.sin(s * 0.07 - mph);   // broad snake + slow drift
        let dx = tx / td * 1.0 - gx * 0.6 + px * mw * 0.9, dy = ty / td * 1.0 - gy * 0.6 + py * mw * 0.9;
        const dl = Math.hypot(dx, dy) || 1; x += dx / dl * STEP; y += dy / dl * STEP; w += 0.04; pts.push([x, y]);
        if (Math.hypot(l.cx - x, l.cy - y) < l.r * 0.8) break;
      }
      out.push({ pts, width: Math.min(9, w), lakeId: l.id });
    }
    for (const st of out) indexStream(st);
    streamCache.set(l.id, out); return out;
  }
  // generate+index every stream whose lake could reach (gx,gy), so the segment grid is complete here
  function ensureStreams(gx, gy) { for (const l of lakesNear(gx, gy, STREAM_REACH)) lakeStreams(l); }
  function streamsNear(gx, gy, pad = 0) { const out = []; for (const l of lakesNear(gx, gy, STREAM_REACH + pad)) for (const st of lakeStreams(l)) out.push(st); return out; }
  // distance from a point to a stream centreline → on-stream test (within half-width), via the seg grid
  function onStream(gx, gy) {
    ensureStreams(gx, gy); const cx = Math.floor(gx / SCELL), cy = Math.floor(gy / SCELL);
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) { const arr = segGrid.get(sk(cx + a, cy + b)); if (arr) for (const s of arr) if (segDist(gx, gy, s.x1, s.y1, s.x2, s.y2) < s.w * 1.1 + 5) return s.st; }
    return null;
  }

  // ── 4. bridges: along each stream at intervals, so the divided land stays connected ──
  const bridgesNear = (gx, gy, pad = 0) => { const out = []; for (const st of streamsNear(gx, gy, pad)) { const P = st.pts; for (let i = 16; i < P.length - 8; i += 24) out.push({ x: P[i][0], y: P[i][1], ang: Math.atan2(P[i][1] - P[i - 1][1], P[i][0] - P[i - 1][0]), w: st.width }); } return out; };
  const nearBridge = (gx, gy) => { for (const b of bridgesNear(gx, gy, 30)) if ((b.x - gx) ** 2 + (b.y - gy) ** 2 < (b.w * 2.2 + 14) ** 2) return true; return false; };

  // ── 3. forest: variable-radius Poisson-disk over a tile; spacing = inverse of a wetness density ──
  const wetness = (gx, gy) => clamp(0.12 + 0.92 * fbm(seed ^ 0x5eed, gx / MOIST, gy / MOIST), 0, 1);   // clumped wet/dry → clumped canopy
  const inWater = (gx, gy) => !!(lakeAt(gx, gy) || onStream(gx, gy));
  const treeCache = new Map(), treeGridCache = new Map(), TCELL = 24;
  function tileTrees(az, ax) {
    const tk = az + ',' + ax; if (treeCache.has(tk)) return treeCache.get(tk);
    const ox = az * TILE, oy = ax * TILE, trees = [], grid = new Map(), CELL = 20, S0 = 15;
    const cands = [];
    for (let y = 0; y < TILE; y += S0) for (let x = 0; x < TILE; x += S0) { const jx = hash2(seed ^ 11, (ox + x) | 0, (oy + y) | 0), jy = hash2(seed ^ 12, (ox + x) | 0, (oy + y) | 0); cands.push([ox + x + jx * S0, oy + y + jy * S0]); }
    cands.sort((p, q) => hash2(seed ^ 99, p[0] | 0, p[1] | 0) - hash2(seed ^ 99, q[0] | 0, q[1] | 0));
    for (const [px, py] of cands) {
      if (inWater(px, py)) continue;
      const rho = wetness(px, py), rad = lerp(46, 17, rho) * TREE_SP, cx = Math.floor(px / CELL), cy = Math.floor(py / CELL); let ok = true;
      for (let a = -2; a <= 2 && ok; a++) for (let b = -2; b <= 2; b++) { const arr = grid.get((cx + a) + '|' + (cy + b)); if (arr) for (const t of arr) if ((t[0] - px) ** 2 + (t[1] - py) ** 2 < rad * rad) { ok = false; break; } }
      if (!ok) continue;
      const t = [px, py, 5 + rho * 8]; trees.push(t); const key = cx + '|' + cy; let arr = grid.get(key); if (!arr) { arr = []; grid.set(key, arr); } arr.push(t);
    }
    // a coarse global spatial grid for O(1) trunk-collision queries during movement
    for (const t of trees) { const gk = Math.floor(t[0] / TCELL) + '|' + Math.floor(t[1] / TCELL); let arr = treeGridCache.get(gk); if (!arr) { arr = []; treeGridCache.set(gk, arr); } arr.push(t); }
    treeCache.set(tk, trees); return trees;
  }
  function ensureTrees(gx, gy) { const az = Math.floor(gx / TILE), ax = Math.floor(gy / TILE); for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) tileTrees(az + a, ax + b); }
  const inTree = (gx, gy) => {
    ensureTrees(gx, gy); const cx = Math.floor(gx / TCELL), cy = Math.floor(gy / TCELL);
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) { const arr = treeGridCache.get((cx + a) + '|' + (cy + b)); if (arr) for (const t of arr) if ((t[0] - gx) ** 2 + (t[1] - gy) ** 2 < (t[2] * 0.7) ** 2) return true; }
    return false;
  };

  // ── the public surface ──
  function passable(gx, gy) { if (inTree(gx, gy)) return false; if (lakeAt(gx, gy)) return false; if (onStream(gx, gy) && !nearBridge(gx, gy)) return false; return true; }
  function featuresFor(az, ax) {   // global-coord geometry for rendering one tile (+ its overhang)
    const ox = az * TILE, oy = ax * TILE, cx = ox + TILE / 2, cy = oy + TILE / 2;
    const owned = lakesNear(cx, cy).filter((l) => l.cx >= ox - TILE * 0.6 && l.cx < ox + TILE * 1.6 && l.cy >= oy - TILE * 0.6 && l.cy < oy + TILE * 1.6);
    const streams = []; for (const l of owned) for (const st of lakeStreams(l)) streams.push(st);
    const lakes = owned.map((l) => ({ cx: l.cx, cy: l.cy, r: l.r, ring: (n) => Array.from({ length: n }, (_, i) => { const a = i / n * TAU, rr = shoreR(l, a); return [l.cx + Math.cos(a) * rr, l.cy + Math.sin(a) * rr]; }) }));
    const bridges = []; for (const st of streams) { const P = st.pts; for (let i = 16; i < P.length - 8; i += 24) bridges.push({ x: P[i][0], y: P[i][1], ang: Math.atan2(P[i][1] - P[i - 1][1], P[i][0] - P[i - 1][0]), w: st.width }); }
    return { lakes, streams, trees: tileTrees(az, ax), bridges };
  }
  function spawn() { let gx = TILE * 0.5, gy = TILE * 0.5; for (let t = 0; t < 4000; t++) { const x = (hash2(seed ^ 31, t, 1) * 4 - 1) * TILE, y = (hash2(seed ^ 32, t, 2) * 4 - 1) * TILE; if (passable(x, y)) return { gx: x, gy: y }; } return { gx, gy }; }

  const lakeRing = (l, n) => Array.from({ length: n }, (_, i) => { const a = i / n * TAU, rr = shoreR(l, a); return [l.cx + Math.cos(a) * rr, l.cy + Math.sin(a) * rr]; });
  return { TILE, R, lakeAt, onStream, inWater, inTree, passable, featuresFor, lakesNear, lakeStreams, lakeRing, streamsNear, bridgesNear, wetness, tileTrees, spawn };
}

function segDist(px, py, ax, ay, bx, by) { const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy; if (!l2) return Math.hypot(px - ax, py - ay); let t = ((px - ax) * dx + (py - ay) * dy) / l2; t = t < 0 ? 0 : t > 1 ? 1 : t; return Math.hypot(px - (ax + t * dx), py - (ay + t * dy)); }
export { segDist };

// weavefloor.js — the OPS WEAVE as a POLAR / SPIRAL weave: a woven rosette over a 19-chunk region, two floors.
//
// THE PUZZLE (the user's): all 6 white-collar roles meet at the TOP-floor CENTRE tile; all 8 production lines
// meet at the BOTTOM-floor CENTRE tile; and those two centre tiles are DISCONNECTED except through the weave.
//
// THE STRUCTURE: two COUNTER-ROTATING spiral families (the rind's own {N/k} Shukhov motif, laid on the floor):
//   • 6 WHITE arms spiral OUT from the centre one way; all 6 converge at the centre → the top-floor hub.
//   • 8 PRODUCTION arms spiral OUT the OTHER way; all 8 converge at the centre → the bottom-floor hub.
// Because they counter-rotate, every white arm sweeps past (crosses) every production arm as the radius grows
// — so every (white,production) pair meets: K(6,8), preserved. Over/under at each crossing puts it on the
// upper or lower floor (plain-weave parity), filling BOTH floors 100%. The white hub (top centre) and the
// production hub (bottom centre) share no shaft: to get from one to the other you must ride a white arm out,
// cross to a production arm in the field (the weave), and ride it back in. That coupling-only-through-the-weave
// is the whole point — and it reads as a tangled rosette, not an orderly checkerboard.
//
// A FAMILY, not one solution: the spiral pitch (turns) and the per-arm phases are seeded, so every seed is a
// different valid weave that still meets all the constraints. Rooms are sub-chunk (fine voronoi). Node-tested.

import { buildFoam } from './foam.js';
import { ENGINE_RING, ENGINES, supplyChain } from './engines.js';
import { WHITE, warpOver } from './weave.js';

export const DEFAULTS = { hexSize: 132, GAP: 165, seed: 1, chamber: 25 };
const SQRT3 = 1.7320508075688772, TAU = Math.PI * 2;
const wrap = (a) => ((a % TAU) + TAU) % TAU;
function mulberry32(a) { return function () { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

const hexCenter = (q, r, s) => ({ x: s * 1.5 * q, y: s * SQRT3 * (r + q / 2) });
const inHex = (px, py, cx, cy, s) => { const dx = Math.abs(px - cx), dy = Math.abs(py - cy); return dx <= s && dy <= s * SQRT3 / 2 && dy <= SQRT3 * (s - dx); };
const hexVerts = (cx, cy, s) => { const v = []; for (let k = 0; k < 6; k++) { const a = Math.PI / 3 * k; v.push([cx + s * Math.cos(a), cy + s * Math.sin(a)]); } return v; };

export function buildWeaveFloor(seed = DEFAULTS.seed, opts = {}) {
  const o = { ...DEFAULTS, ...opts, seed: (seed >>> 0) };
  const s = o.hexSize, GAP = o.GAP;
  const NW = WHITE.length, NF = ENGINE_RING.length;            // 6 white, 8 production
  const rng = mulberry32((o.seed ^ 0x5c1a) >>> 0);

  // ── the family parameters (seeded) — every seed is a different valid woven rosette ──
  // counter-rotating spiral twists, in turns; their SUM ≥ 1 guarantees every white sweeps past all 8
  // production (⇒ K(6,8)). phases rotate each family of arms.
  const turnsW = 0.62 + 0.30 * rng(), turnsP = 0.62 + 0.30 * rng();  // ~0.62..0.92 each, sum ≥ 1.24
  const twistW = TAU * turnsW, twistP = TAU * turnsP;
  const phaseW = rng() * TAU, phaseP = rng() * TAU;
  const dir = rng() < 0.5 ? 1 : -1;                              // which way the whole rosette spins (seeded)

  // ── the 19 chunks (centre + 6 + 12) ──
  const chunks = [];
  for (let q = -2; q <= 2; q++) for (let r = -2; r <= 2; r++) if (Math.abs(q + r) <= 2) { const c = hexCenter(q, r, s); chunks.push({ q, r, cx: c.x, cy: c.y, verts: hexVerts(c.x, c.y, s) }); }
  let minx = Infinity, miny = Infinity, maxx = -Infinity, maxy = -Infinity;
  for (const ch of chunks) for (const v of ch.verts) { minx = Math.min(minx, v[0]); miny = Math.min(miny, v[1]); maxx = Math.max(maxx, v[0]); maxy = Math.max(maxy, v[1]); }
  const W = maxx - minx, H = maxy - miny, cx = W / 2, cy = H / 2;
  const inRegion = (x, y) => chunks.some((ch) => inHex(x, y, ch.cx, ch.cy, s));
  const chunkAt = (x, y) => { for (let i = 0; i < chunks.length; i++) if (inHex(x, y, chunks[i].cx, chunks[i].cy, s)) return i; return -1; };

  const warps = WHITE.map((wc, w) => ({ ...wc, w }));
  const wefts = ENGINE_RING.map((id, f) => ({ id, f, ...ENGINES[id] }));

  // ── fine voronoi (rooms are sub-chunk) over the region ──
  const cols = Math.max(12, Math.round(W / o.chamber)), rows = Math.max(10, Math.round(H / o.chamber));
  const foam = buildFoam(o.seed, { W, H, cols, rows, jitter: 0.5 });

  // first pass: radius of each in-region chamber (to normalise + find the centre tile + Rmax)
  const inR = []; let Rmax = 1, centerCell = -1, cd = Infinity;
  for (const c of foam.cells) { const gx = c.cx + minx, gy = c.cy + miny; if (!inRegion(gx, gy)) continue; const dx = c.cx - cx, dy = c.cy - cy, r = Math.hypot(dx, dy); inR.push(c.i); if (r > Rmax) Rmax = r; if (r < cd) { cd = r; centerCell = c.i; } }
  const hubR = Math.max(o.chamber * 1.4, Rmax * 0.06);          // the small central hub (≈ the centre tile)

  // the polar weave: which white arm / production arm a point is in (counter-rotating spirals)
  const armW = (r, th) => Math.min(NW - 1, Math.max(0, Math.floor(NW * wrap(th + phaseW - dir * twistW * (r / Rmax)) / TAU)));
  const armP = (r, th) => Math.min(NF - 1, Math.max(0, Math.floor(NF * wrap(th + phaseP + dir * twistP * (r / Rmax)) / TAU)));

  const cells = [];
  for (const i of inR) {
    const c = foam.cells[i], gx = c.cx + minx, gy = c.cy + miny;
    const dx = c.cx - cx, dy = c.cy - cy, r = Math.hypot(dx, dy), th = Math.atan2(dy, dx);
    const base = { i, poly: c.poly.map(([x, y]) => [x, y]), cx: c.cx, cy: c.cy, gx, gy, r, th, chunk: chunkAt(gx, gy) };
    if (r < hubR) {
      // the centre tile(s): white hub on TOP, production hub on BOTTOM — disconnected (no shaft between them)
      cells.push({ ...base, hub: true, w: -1, f: -1, over: true, upper: { kind: 'whub' }, lower: { kind: 'phub' }, prodFloor: 1 });
      continue;
    }
    const w = armW(r, th), f = armP(r, th), over = warpOver(w, f);
    const upper = over ? { kind: 'warp', idx: w } : { kind: 'weft', idx: f };
    const lower = over ? { kind: 'weft', idx: f } : { kind: 'warp', idx: w };
    cells.push({ ...base, hub: false, w, f, over, upper, lower, prodFloor: ((w + f) % 2 === 1) ? 2 : 1 });
  }

  // ── material flow along each production arm (spiral), centre→rim, riding its floor ──
  const weftFlow = wefts.map((wf) => {
    const rib = cells.filter((c) => !c.hub && c.f === wf.f).sort((a, b) => a.r - b.r).map((c) => ({ cx: c.cx, cy: c.cy, z: c.prodFloor === 2 ? GAP : 0 }));
    return { f: wf.f, id: wf.id, color: wf.color, pts: rib.length >= 2 ? rib : [{ cx, cy, z: 0 }, { cx: cx + Rmax, cy, z: 0 }] };
  });
  const supply = supplyChain().filter((e) => e.from !== 'fulfillment' && e.to !== 'fulfillment').map((e) => ({ ...e, fa: ENGINE_RING.indexOf(e.from), fb: ENGINE_RING.indexOf(e.to), color: ENGINES[e.from].color }));

  // ── tours: enter a white arm at the hub, ride it out; it meets each production arm once, over/under ──
  const tours = warps.map((wc) => {
    const stops = wefts.map((wf) => {
      let best = null, bd = Infinity; for (const c of cells) if (!c.hub && c.w === wc.w && c.f === wf.f) { if (c.r < bd) { bd = c.r; best = c; } }
      return { f: wf.f, engine: wf.id, label: wf.label, glyph: wf.glyph, over: warpOver(wc.w, wf.f), floor: warpOver(wc.w, wf.f) ? 2 : 1, r: best ? best.r : 0, cell: best };
    }).sort((a, b) => a.r - b.r);                              // radial order = the order you meet them going out
    return { w: wc.w, label: wc.label, stops };
  });

  // realised contact pairs (which white actually meets which production in this seed's rosette)
  const pairs = new Set(); for (const c of cells) if (!c.hub) pairs.add(c.w + ':' + c.f);

  return { W, H, minx, miny, GAP, hexSize: s, Rmax, NW, NF, chunks, warps, wefts, foam, cells, centerCell, hubR,
    weftFlow, supply, tours, entry: { x: cx, y: cy }, contactPairs: pairs.size, family: { turnsW, turnsP, phaseW, phaseP, dir }, contact: { everyTouchesEvery: pairs.size === NW * NF } };
}

if (typeof globalThis !== 'undefined') globalThis.RindWeaveFloor = { buildWeaveFloor };

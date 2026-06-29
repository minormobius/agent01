// weavefloor.js — the OPS WEAVE as a SPACE-FILLING fabric over a 19-CHUNK region, on TWO floors, NO GAPS.
//
// Scale: a hex region of 19 CHUNKS (centre + ring of 6 + ring of 12, the forge tiling) around a core entry.
// Coverage: a real plain weave is space-filling — full-width warp and full-width weft, so EVERY chamber is
// either warp-over-weft or weft-over-warp. That tiles BOTH floors 100% (no interstitial gaps):
//   • 6 WARP lanes (white-collar surfaces) run one way across the whole region; 8 WEFT lanes (production
//     engines) run the other way. Their grid is a 6×8 field of PATCHES that fills the region.
//   • plain-weave parity: at patch (w,f) the warp is OVER iff (w+f) even. The OVER strand is on the UPPER
//     floor there, the UNDER strand on the LOWER floor — so the UPPER floor is a full woven checkerboard of
//     white-collar and production patches, and the LOWER floor is its exact complement. Both floors 100% used.
//   • every surface therefore appears on BOTH floors (4 patches over, 4 under for a warp), weaving between
//     them; each patch is a facility where one white surface and one production line meet, one per floor.
//
// One voronoi foam fills the region; each chamber is tagged to its patch and owns a surface on each floor.
// Pure, deterministic, node-tested.

import { buildFoam } from './foam.js';
import { ENGINE_RING, ENGINES, supplyChain } from './engines.js';
import { buildWeave, contact, WHITE, warpOver } from './weave.js';

export const DEFAULTS = { hexSize: 132, GAP: 150, seed: 1, chamber: 34 };
const SQRT3 = 1.7320508075688772;

// flat-top hex: centre of axial (q,r); membership test; vertices
const hexCenter = (q, r, s) => ({ x: s * 1.5 * q, y: s * SQRT3 * (r + q / 2) });
function inHex(px, py, cx, cy, s) { const dx = Math.abs(px - cx), dy = Math.abs(py - cy); return dx <= s && dy <= s * SQRT3 / 2 && dy <= SQRT3 * (s - dx); }
function hexVerts(cx, cy, s) { const v = []; for (let k = 0; k < 6; k++) { const a = Math.PI / 3 * k; v.push([cx + s * Math.cos(a), cy + s * Math.sin(a)]); } return v; }

export function buildWeaveFloor(seed = DEFAULTS.seed, opts = {}) {
  const o = { ...DEFAULTS, ...opts, seed: (seed >>> 0) };
  const s = o.hexSize, GAP = o.GAP;
  const NW = WHITE.length, NF = ENGINE_RING.length;            // 6 warps, 8 wefts

  // ── the 19 chunks: hex of hexes, radius 2 (1 + 6 + 12) ──
  const chunks = [];
  for (let q = -2; q <= 2; q++) for (let r = -2; r <= 2; r++) if (Math.abs(q + r) <= 2) { const c = hexCenter(q, r, s); chunks.push({ q, r, cx: c.x, cy: c.y, verts: hexVerts(c.x, c.y, s) }); }
  // region bbox (+ a small margin)
  let minx = Infinity, miny = Infinity, maxx = -Infinity, maxy = -Infinity;
  for (const ch of chunks) for (const v of ch.verts) { minx = Math.min(minx, v[0]); miny = Math.min(miny, v[1]); maxx = Math.max(maxx, v[0]); maxy = Math.max(maxy, v[1]); }
  const W = maxx - minx, H = maxy - miny;
  const inRegion = (x, y) => chunks.some((ch) => inHex(x, y, ch.cx, ch.cy, s));
  const chunkAt = (x, y) => { for (let i = 0; i < chunks.length; i++) if (inHex(x, y, chunks[i].cx, chunks[i].cy, s)) return i; return -1; };

  const warps = WHITE.map((wc, w) => ({ ...wc, w }));
  const wefts = ENGINE_RING.map((id, f) => ({ id, f, ...ENGINES[id] }));
  const ownerColorKind = (kind, idx) => (kind === 'warp' ? warps[idx] : wefts[idx]);

  // ── one voronoi foam over the bbox; keep only chambers inside the 19-chunk region (100% of it, no gaps) ──
  const cols = Math.max(10, Math.round(W / o.chamber)), rows = Math.max(8, Math.round(H / o.chamber));
  const foam = buildFoam(o.seed, { W, H, cols, rows, jitter: 0.55 });
  const patchW = (x) => Math.min(NW - 1, Math.max(0, Math.floor(NW * (x) / W)));   // x already region-local
  const patchF = (y) => Math.min(NF - 1, Math.max(0, Math.floor(NF * (y) / H)));

  const cells = [];
  for (const c of foam.cells) {
    const gx = c.cx + minx, gy = c.cy + miny;            // global coords (foam is built at 0..W,0..H)
    if (!inRegion(gx, gy)) continue;
    const w = patchW(c.cx), f = patchF(c.cy), over = warpOver(w, f);
    // OVER strand → upper floor; UNDER → lower. parity even ⇒ warp is over.
    const upper = over ? { kind: 'warp', idx: w } : { kind: 'weft', idx: f };
    const lower = over ? { kind: 'weft', idx: f } : { kind: 'warp', idx: w };
    const prodFloor = ((w + f) % 2 === 1) ? 2 : 1;        // production (weft) is over iff (w+f) odd
    cells.push({ i: c.i, poly: c.poly.map(([x, y]) => [x, y]), cx: c.cx, cy: c.cy, gx, gy, w, f, over, upper, lower, prodFloor, chunk: chunkAt(gx, gy) });
  }

  // ── material flow along each production line (weft row f), ordered across the region; rides its floor ──
  const weftFlow = wefts.map((wf) => {
    const rib = cells.filter((c) => c.f === wf.f).sort((a, b) => a.cx - b.cx)
      .map((c) => ({ cx: c.cx, cy: c.cy, z: c.prodFloor === 2 ? GAP : 0 }));
    return { f: wf.f, id: wf.id, color: wf.color, pts: rib.length >= 2 ? rib : [{ cx: 0, cy: H / 2, z: 0 }, { cx: W, cy: H / 2, z: 0 }] };
  });
  const supply = supplyChain().filter((e) => e.from !== 'fulfillment' && e.to !== 'fulfillment')
    .map((e) => ({ ...e, fa: ENGINE_RING.indexOf(e.from), fb: ENGINE_RING.indexOf(e.to), color: ENGINES[e.from].color }));

  // ── tours: enter a white surface at the core, weave through all 8 production lines (floor alternates) ──
  const weave = buildWeave(o.seed); const con = contact(weave);
  const tours = warps.map((wc) => ({ w: wc.w, label: wc.label,
    stops: wefts.map((wf) => ({ f: wf.f, engine: wf.id, label: wf.label, glyph: wf.glyph, over: warpOver(wc.w, wf.f), floor: warpOver(wc.w, wf.f) ? 2 : 1 })) }));

  const entry = { x: W / 2, y: H / 2 };                  // the core (centre chunk)
  return { W, H, minx, miny, GAP, hexSize: s, NW, NF, chunks, warps, wefts, foam, cells, weftFlow, supply, tours, entry, contact: con, ownerColorKind, patchW, patchF };
}

if (typeof globalThis !== 'undefined') globalThis.RindWeaveFloor = { buildWeaveFloor };

// weavefloor.js — the OPS WEAVE as ONE woven fabric across TWO floors (the fix for the "two stacked decks +
// a star of links" render). There are not a white floor and a production floor; there are an UPPER floor and a
// LOWER floor, and every surface WEAVES between them:
//
//   • 6 WARP ribbons = the white-collar surfaces, running one way across the footprint.
//   • 8 WEFT ribbons = the production engines, running the other way.
//   • plain weave: at crossing (w,f) the warp is OVER iff (w+f) is even. The OVER strand rides the UPPER floor
//     there; the UNDER strand is on the LOWER floor. So as a warp runs past the 8 wefts it climbs to the upper
//     floor and dips to the lower one, over and over — it OCCUPIES BOTH FLOORS. Same for every weft.
//   • each crossing is a FACILITY: a chamber where a white surface and a production line meet, one on each
//     floor, vertically adjacent. 48 crossings = the 48 contacts of K(6,8) — realised by the weaving itself,
//     not by a bundle of lines through the gap between two decks.
//
// Drawn over a real VORONOI foam (the /econ·/chunkroller substrate): each chamber is tagged to the ribbon that
// runs through it and lifted to that ribbon's floor height. Pure, deterministic, node-tested.

import { buildFoam, nearestCell, pathCells } from './foam.js';
import { ENGINE_RING, ENGINES, supplyChain } from './engines.js';
import { buildWeave, contact, WHITE, warpOver } from './weave.js';

export const DEFAULTS = { W: 760, H: 520, GAP: 120, seed: 1, cols: 30, rows: 20, bandFrac: 0.40 };

const smooth = (a, b, t) => a + (b - a) * (t * t * (3 - 2 * t));

export function buildWeaveFloor(seed = DEFAULTS.seed, opts = {}) {
  const o = { ...DEFAULTS, ...opts, seed: (seed >>> 0) };
  const { W, H, GAP } = o;
  const NW = WHITE.length, NF = ENGINE_RING.length;            // 6 warps, 8 wefts

  const warps = WHITE.map((wc, w) => ({ ...wc, w }));
  const wefts = ENGINE_RING.map((id, f) => ({ id, f, ...ENGINES[id] }));
  const xOf = (w) => (w + 0.5) / NW * W;                        // warp ribbon centre (x)
  const yOf = (f) => (f + 0.5) / NF * H;                        // weft ribbon centre (y)
  const bandW = (W / NW) * o.bandFrac, bandH = (H / NF) * o.bandFrac;   // half-widths
  const hi = GAP, lo = 0, midZ = GAP / 2;
  const crossH = (over) => (over ? hi : lo);

  // ── the undulation: a warp's floor height as it runs down past the 8 wefts (smooth over/under), and a
  // weft's height as it runs across past the 6 warps. At a crossing the two are guaranteed opposite. ──
  const ys = wefts.map((_, f) => yOf(f)), xs = warps.map((_, w) => xOf(w));
  function hWarp(w, y) {
    if (y <= ys[0]) return crossH(warpOver(w, 0));
    if (y >= ys[NF - 1]) return crossH(warpOver(w, NF - 1));
    let f = 0; while (f < NF - 1 && ys[f + 1] <= y) f++;
    const t = (y - ys[f]) / (ys[f + 1] - ys[f] || 1);
    return smooth(crossH(warpOver(w, f)), crossH(warpOver(w, f + 1)), t);
  }
  function hWeft(f, x) {
    const wo = (w) => !warpOver(w, f);                         // weft is over iff warp is under
    if (x <= xs[0]) return crossH(wo(0));
    if (x >= xs[NW - 1]) return crossH(wo(NW - 1));
    let w = 0; while (w < NW - 1 && xs[w + 1] <= x) w++;
    const t = (x - xs[w]) / (xs[w + 1] - xs[w] || 1);
    return smooth(crossH(wo(w)), crossH(wo(w + 1)), t);
  }

  // ── the voronoi foam; tag every chamber to its ribbon + lift it to that ribbon's floor height ──
  const foam = buildFoam(o.seed, { W, H, cols: o.cols, rows: o.rows, jitter: 0.55 });
  const cells = foam.cells.map((c) => {
    let wstar = 0, dxw = Infinity; for (let w = 0; w < NW; w++) { const d = Math.abs(c.cx - xOf(w)); if (d < dxw) { dxw = d; wstar = w; } }
    let fstar = 0, dyf = Infinity; for (let f = 0; f < NF; f++) { const d = Math.abs(c.cy - yOf(f)); if (d < dyf) { dyf = d; fstar = f; } }
    const inWarp = dxw < bandW, inWeft = dyf < bandH;
    let kind = 'bg', z = lo, floor = 1, w = -1, f = -1, upper = null;
    if (inWarp && inWeft) { kind = 'cross'; w = wstar; f = fstar; z = hi; floor = 2; upper = warpOver(wstar, fstar) ? 'warp' : 'weft'; } // the visible crossing rides the upper floor; the under-strand ducks below
    else if (inWarp) { kind = 'warp'; w = wstar; z = hWarp(wstar, c.cy); floor = z > midZ ? 2 : 1; }
    else if (inWeft) { kind = 'weft'; f = fstar; z = hWeft(fstar, c.cx); floor = z > midZ ? 2 : 1; }
    return { i: c.i, poly: c.poly, cx: c.cx, cy: c.cy, kind, w, f, z, floor, upper };
  });

  // crossings = facilities (the contacts). cellIdx = the chamber nearest the crossing point.
  const crossings = [];
  for (let w = 0; w < NW; w++) for (let f = 0; f < NF; f++) {
    const ci = nearestCell(foam, xOf(w), yOf(f)); const over = warpOver(w, f);
    crossings.push({ w, f, x: xOf(w), y: yOf(f), warpOver: over, upper: over ? 'warp' : 'weft', cell: ci, cx: foam.cells[ci].cx, cy: foam.cells[ci].cy });
  }

  // ── material flow ALONG each production weft ribbon (its cells, left→right), so material runs the line ──
  const weftFlow = wefts.map((wf) => {
    const rib = cells.filter((c) => c.kind === 'weft' && c.f === wf.f).sort((a, b) => a.cx - b.cx);
    const pts = rib.length ? rib : [{ cx: 0, cy: yOf(wf.f) }, { cx: W, cy: yOf(wf.f) }];
    return { f: wf.f, id: wf.id, color: wf.color, pts };
  });
  // the inter-engine supply chain, faint: producer weft → consumer weft (drawn as a side arc by the app)
  const supply = supplyChain().filter((e) => e.from !== 'fulfillment' && e.to !== 'fulfillment')
    .map((e) => ({ ...e, fa: ENGINE_RING.indexOf(e.from), fb: ENGINE_RING.indexOf(e.to), color: ENGINES[e.from].color }));

  // ── tours: enter one warp (white surface), weave down through all 8 wefts; floor alternates over/under ──
  const weave = buildWeave(o.seed); const con = contact(weave);
  const tours = warps.map((wc) => ({
    w: wc.w, label: wc.label,
    stops: wefts.map((wf) => ({ f: wf.f, engine: wf.id, label: wf.label, glyph: wf.glyph, over: warpOver(wc.w, wf.f), floor: warpOver(wc.w, wf.f) ? 2 : 1 })),
  }));

  return { W, H, GAP, seed: o.seed, NW, NF, warps, wefts, xOf, yOf, bandW, bandH, hWarp, hWeft, foam, cells, crossings, weftFlow, supply, tours, contact: con };
}

if (typeof globalThis !== 'undefined') globalThis.RindWeaveFloor = { buildWeaveFloor };

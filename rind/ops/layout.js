// layout.js — place the OPS WEAVE into two voronoi decks and wire the material flow.
//
//   DECK 0 — the PRODUCTION FLOOR. The 8 engines are graph-Voronoi regions of the foam (clusters of chambers,
//            the "facilities are Voronoi regions OF the chambers" conceit). Inside each region the engine's
//            STEPS are planted on spread-out cells and its activity FLOW is routed step→step over the cell
//            adjacency. Across regions the inter-engine SUPPLY CHAIN (reclaim→refiners→mill→assembly→…) is
//            routed cell-to-cell — the long-haul material flow, the core feature of the eight.
//   DECK 1 — the OPS MEZZANINE. The 6 white-collar surfaces are graph-Voronoi regions of a second foam.
//   THE WEAVE — every office is linked to every engine (K(6,8), from weave.js); a fulfillment lift at the
//            production centre is the single entry that rises to the mezzanine.
//
// Pure, deterministic, node-tested. Geometry only — the app animates packets along the routed paths.

import { buildFoam, nearestCell, pathCells, graphVoronoi } from './foam.js';
import { ENGINES, ENGINE_RING, FULFILLMENT, supplyChain } from './engines.js';
import { buildWeave, contact, tour, WHITE } from './weave.js';

export const DEFAULTS = { W: 760, H: 520, seed: 1 };

// farthest-point sampling among a subset of cells (spread the step anchors across a region)
function spread(foam, region, count, startCell) {
  const picks = [startCell]; const rest = region.filter((c) => c !== startCell);
  while (picks.length < count && rest.length) {
    let best = -1, bd = -1;
    for (let k = 0; k < rest.length; k++) {
      const c = foam.cells[rest[k]]; let dmin = Infinity;
      for (const p of picks) { const pc = foam.cells[p]; const d = (c.cx - pc.cx) ** 2 + (c.cy - pc.cy) ** 2; if (d < dmin) dmin = d; }
      if (dmin > bd) { bd = dmin; best = k; }
    }
    picks.push(rest[best]); rest.splice(best, 1);
  }
  return picks;
}

export function buildDecks(seed = DEFAULTS.seed, opts = {}) {
  const o = { ...DEFAULTS, ...opts, seed: (seed >>> 0) };
  const { W, H } = o;
  const cx = W / 2, cy = H / 2;

  // ── DECK 0: production foam + 8 engine regions on the azimuthal ring ──────────────────────────────────
  const foamP = buildFoam(o.seed, { W, H, cols: 24, rows: 16, jitter: 0.6 });
  const Rring = Math.min(W, H) * 0.34;
  const engSeedCells = ENGINE_RING.map((id, f) => { const a = -Math.PI / 2 + f * 2 * Math.PI / 8; return nearestCell(foamP, cx + Rring * Math.cos(a), cy + Rring * Math.sin(a)); });
  const ownerP = graphVoronoi(foamP, engSeedCells);

  const engines = ENGINE_RING.map((id, f) => {
    const E = ENGINES[id];
    const region = []; for (let i = 0; i < foamP.cells.length; i++) if (ownerP[i] === f) region.push(i);
    // core at the cell nearest the region centroid
    let rcx = 0, rcy = 0; for (const i of region) { rcx += foamP.cells[i].cx; rcy += foamP.cells[i].cy; } rcx /= region.length; rcy /= region.length;
    let coreCell = region[0], bd = Infinity; for (const i of region) { const d = (foamP.cells[i].cx - rcx) ** 2 + (foamP.cells[i].cy - rcy) ** 2; if (d < bd) { bd = d; coreCell = i; } }
    // spread the steps across the region; the engine's CORE step lands on coreCell
    const anchors = spread(foamP, region, E.steps.length, coreCell);
    const coreIdx = Math.max(0, E.steps.findIndex((s) => s.id === E.core));
    const order = [coreIdx, ...E.steps.map((_, k) => k).filter((k) => k !== coreIdx)];
    const stepCell = {}; order.forEach((sk, n) => { stepCell[E.steps[sk].id] = anchors[n % anchors.length]; });
    const steps = E.steps.map((s) => ({ ...s, cell: stepCell[s.id], cx: foamP.cells[stepCell[s.id]].cx, cy: foamP.cells[stepCell[s.id]].cy, isCore: s.id === E.core }));
    const allow = new Set(region);
    const flow = E.flow.map(([a, b]) => ({ from: a, to: b, path: (pathCells(foamP, stepCell[a], stepCell[b], allow) || [stepCell[a], stepCell[b]]).map((i) => foamP.cells[i]) }));
    return { id, f, label: E.label, glyph: E.glyph, color: E.color, family: E.family, note: E.note, region, steps, flow,
      cx: foamP.cells[coreCell].cx, cy: foamP.cells[coreCell].cy, coreCell,
      inCell: stepCell[E.inAt], outCell: stepCell[E.outAt], intake: E.intake, output: E.output };
  });
  const engById = Object.fromEntries(engines.map((e) => [e.id, e]));

  // fulfillment lift at the centre — the single entry up to the mezzanine
  const liftCell = nearestCell(foamP, cx, cy);
  const lift = { ...FULFILLMENT, cell: liftCell, cx: foamP.cells[liftCell].cx, cy: foamP.cells[liftCell].cy, inCell: liftCell, outCell: liftCell };

  // ── inter-engine SUPPLY CHAIN routed across the whole floor (the long-haul material flow) ──────────────
  const supply = supplyChain().map((e) => {
    const A = e.from === 'fulfillment' ? lift : engById[e.from], B = e.to === 'fulfillment' ? lift : engById[e.to];
    if (!A || !B) return null;
    let path = pathCells(foamP, A.outCell, B.inCell) || [A.outCell, B.inCell];
    // co-located endpoints (the lift dropping into an adjacent throat) → extend by a neighbour so it's a real edge
    if (path.length < 2) { const nb = foamP.cells[path[0]].neighbors[0]; path = nb != null ? [path[0], nb] : [path[0], path[0]]; }
    return { ...e, color: (A.color || '#cbd3e0'), path: path.map((i) => foamP.cells[i]) };
  }).filter(Boolean);

  // ── DECK 1: office foam + 6 white-collar regions ──────────────────────────────────────────────────────
  const foamO = buildFoam((o.seed ^ 0x0ff1ce) >>> 0, { W, H, cols: 16, rows: 11, jitter: 0.55 });
  const Roff = Math.min(W, H) * 0.30;
  const offSeedCells = WHITE.map((_, w) => { const a = -Math.PI / 2 + w * 2 * Math.PI / 6; return nearestCell(foamO, cx + Roff * Math.cos(a), cy + Roff * Math.sin(a)); });
  const ownerO = graphVoronoi(foamO, offSeedCells);
  const offices = WHITE.map((wc, w) => {
    const region = []; for (let i = 0; i < foamO.cells.length; i++) if (ownerO[i] === w) region.push(i);
    let rcx = 0, rcy = 0; for (const i of region) { rcx += foamO.cells[i].cx; rcy += foamO.cells[i].cy; } rcx /= region.length; rcy /= region.length;
    return { ...wc, w, region, cx: rcx, cy: rcy };
  });

  // ── the WEAVE: K(6,8) office×engine links + the per-office tour (from weave.js, proven complete) ────────
  const weave = buildWeave(o.seed);
  const c = contact(weave);
  const links = []; for (const off of offices) for (const e of engines) links.push({ w: off.w, f: e.f, office: off.id, engine: e.id, over: ((off.w + e.f) % 2 === 0) ? 'office' : 'engine' });
  const tours = offices.map((off) => tour(weave, off.w));

  return { W, H, seed: o.seed, foamP, foamO, ownerP, ownerO, engines, engById, lift, supply, offices, links, tours,
    contact: c, ringOrder: ENGINE_RING.slice() };
}

// the material-flow edge list flattened (intra-engine activity + inter-engine supply) — for animation + tests
export function flowEdges(decks) {
  const intra = decks.engines.flatMap((e) => e.flow.map((fl) => ({ kind: 'activity', engine: e.id, color: e.color, ...fl })));
  const inter = decks.supply.map((s) => ({ kind: 'supply', ...s }));
  return { intra, inter, total: intra.length + inter.length };
}

if (typeof globalThis !== 'undefined') globalThis.RindLayout = { buildDecks, flowEdges };

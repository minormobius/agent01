// occupancy.js — THE SOLVER OBJECTIVE. A voronoi foam distributes chambers HOMOGENEOUSLY through the volume,
// so the analytic weave is only "right" if its paths OCCUPY that volume — leave no chamber stranded far from a
// path, and don't pile paths on top of each other. So we define each path as a TUBE of diameter d and measure:
//
//   • coverage — fraction of chambers within d/2 of THEIR OWN thread's centreline (the volume the weave fills),
//   • overlap  — fraction also within d/2 of ANOTHER thread (wasted, double-occupied volume),
//   • score    — coverage − overlap (what the solver maximises: fill the volume, don't double up).
//
// The current 6+8 fixed spirals are constant-ANGULAR-width wedges, so a constant-DIAMETER tube under-fills the
// rim (the wedges fan out) — `occupancy()` makes that visible and `bestTube()` finds the best single diameter;
// the next solver step (more windings / branching toward the rim) is what pushes coverage to 1. Pure, tested.

// nearest in-plane distance from a chamber to a thread centreline at the same radius (the tube is along θ,z)
function distToThread(m, n, kind, idx) {
  const th = kind === 'warp' ? m.thW(idx, n.rf) : m.thP(idx, n.rf);
  const z = kind === 'warp' ? m.zWhite(idx, n.rf) : m.zProd(idx, n.rf);
  return Math.hypot(n.rad * m.swrap(n.th - th), n.z - z);
}

export function occupancy(m, diameter) {
  const r = diameter / 2; let covered = 0, overlap = 0, N = 0;
  for (const n of m.nuclei) {
    if (n.hub) continue; N++;
    const dOwn = distToThread(m, n, n.owner.kind, n.owner.idx);
    let dOther = Infinity;
    for (let w = 0; w < m.NW; w++) if (!(n.owner.kind === 'warp' && n.owner.idx === w)) dOther = Math.min(dOther, distToThread(m, n, 'warp', w));
    for (let f = 0; f < m.NF; f++) if (!(n.owner.kind === 'weft' && n.owner.idx === f)) dOther = Math.min(dOther, distToThread(m, n, 'weft', f));
    if (dOwn <= r) covered++;
    if (dOwn <= r && dOther <= r) overlap++;
  }
  const coverage = covered / N, ov = overlap / N;
  return { diameter, coverage, overlap: ov, score: coverage - ov, N };
}

// scan diameters, return the one that maximises coverage − overlap (the best single-tube fill)
export function bestTube(m, lo = 6, hi = 200, steps = 48) {
  let best = null;
  for (let k = 0; k <= steps; k++) { const d = lo + (hi - lo) * k / steps, o = occupancy(m, d); if (!best || o.score > best.score) best = o; }
  return best;
}

if (typeof globalThis !== 'undefined') globalThis.RindOccupancy = { occupancy, bestTube };

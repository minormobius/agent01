// occupancy.js — THE SOLVER OBJECTIVE. A voronoi foam distributes chambers HOMOGENEOUSLY through the volume,
// so the analytic weave is only "right" if its paths OCCUPY that volume. Each path is a TUBE of diameter d;
// a chamber is FILLED if it lies within d/2 of the nearest pass of ANY thread's tube (the weave as a whole),
// and DOUBLE-OCCUPIED if within d/2 of two distinct threads. We measure:
//
//   • coverage — fraction of chambers filled (the volume the weave occupies),
//   • overlap  — fraction double-occupied (wasted, piled-up tube),
//   • score    — coverage − overlap (what the solver maximises: fill the volume, don't double up).
//
// This is why MORE WINDINGS help: a tighter spiral lays more tube-passes across the disc, so the same diameter
// fills more of the homogeneous foam (especially the rim). We precompute each chamber's distance to its nearest
// and 2nd-nearest distinct thread ONCE, so scanning diameters (bestTube) is cheap. Pure, deterministic, tested.

function threadSamples(m, S = 90) {
  const out = [];
  for (let w = 0; w < m.NW; w++) { const pts = []; for (let k = 0; k <= S; k++) { const rf = k / S, th = m.thW(w, rf), rad = rf * m.R; pts.push([rad * Math.cos(th), rad * Math.sin(th), m.zWhite(w, rf)]); } out.push(pts); }
  for (let f = 0; f < m.NF; f++) { const pts = []; for (let k = 0; k <= S; k++) { const rf = k / S, th = m.thP(f, rf), rad = rf * m.R; pts.push([rad * Math.cos(th), rad * Math.sin(th), m.zProd(f, rf)]); } out.push(pts); }
  return out;
}

// per-chamber nearest + 2nd-nearest DISTINCT-thread distance (computed once; diameters scan over this)
export function precompute(m) {
  const threads = threadSamples(m), idx = [], d1 = [], d2 = [];
  for (const n of m.nuclei) {
    if (n.hub) continue;
    let best = Infinity, second = Infinity;
    for (const pts of threads) {
      let dm = Infinity; for (const p of pts) { const d = (p[0] - n.x) ** 2 + (p[1] - n.y) ** 2 + (p[2] - n.z) ** 2; if (d < dm) dm = d; }
      dm = Math.sqrt(dm);
      if (dm < best) { second = best; best = dm; } else if (dm < second) second = dm;
    }
    idx.push(n.i); d1.push(best); d2.push(second);
  }
  return { d1, d2, N: d1.length };
}

export function occupancy(m, diameter, pre) {
  pre = pre || precompute(m);
  const r = diameter / 2; let cov = 0, ov = 0;
  for (let i = 0; i < pre.N; i++) { if (pre.d1[i] <= r) cov++; if (pre.d2[i] <= r) ov++; }
  const coverage = cov / pre.N, overlap = ov / pre.N;
  return { diameter, coverage, overlap, score: coverage - overlap, N: pre.N };
}

// scan diameters, return the one maximising coverage − overlap (fill the volume without doubling up)
export function bestTube(m, lo = 6, hi = 140, steps = 40) {
  const pre = precompute(m); let best = null;
  for (let k = 0; k <= steps; k++) { const d = lo + (hi - lo) * k / steps, o = occupancy(m, d, pre); if (!best || o.score > best.score) best = o; }
  return best;
}

if (typeof globalThis !== 'undefined') globalThis.RindOccupancy = { precompute, occupancy, bestTube };

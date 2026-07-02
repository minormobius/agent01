// tessweave.js — SOLVE the tessellating hex weave: its 14 real Voronoi threads, and the
// thread-to-thread interfaces where one hex tile meets its neighbour.
//
// The single-hex curve weave (curveseed.js) packs 6 white + 8 production threads into a flat-top
// hexagonal prism. To make the world INFINITE we honeycomb that hex across the shell. The open
// question the user posed — "those tessellating hexes need to be solved, with their fourteen
// threads, and we should be able to solve thread-to-thread interfaces" — is: when tile A's edge
// meets tile B's edge, what happens to the threads that reach that shared edge?
//
// The answer, derived here from the REAL weave (not a schematic), has two halves:
//
//   • WHITE = CONTINUITY.  The hex has 6 edges and the cortex has 6 white threads. Every white
//     reaches the rim on two adjacent edges, and under the tiling translation each white in A
//     lands exactly on a white in B (mirror position, Δ≈0). So whites SPLICE: thread continues
//     across the boundary into the neighbour as another white. The 6 whites are the connective
//     tissue; chained across tiles they are the emergent global warp (see helix.html).
//
//   • PRODUCTION = LOCAL + K-DOORS.  There are 8 engines; 8 does not divide the hex's 6-fold
//     antipodal symmetry, so production threads cannot all splice. They stay largely local (each
//     tile's own machinery) and where they graze the rim they meet a neighbour's thread of the
//     OTHER kind — a cross-kind K-door. That is the K(6,8) contact reaching across a shared edge.
//
// This module extracts the exits, classifies every interface, and traces the white warp so a
// caller can render the tiling and prove it navigable. Pure, deterministic, node-testable.

const DEG = Math.PI / 180;
const SQRT3 = Math.sqrt(3);

// flat-top hex, circumradius R: vertices at 0°,60°…; edge k has outward normal at (30+60k)°,
// inradius Ri = R·√3/2, edge half-length = R/2 (vertex-to-mid along the edge).
export const edgeNormalAng = (k) => (30 + 60 * k) * DEG;
export const edgeNormal = (k) => { const a = edgeNormalAng(k); return [Math.cos(a), Math.sin(a)]; };
export const edgeTangent = (k) => { const a = edgeNormalAng(k); return [-Math.sin(a), Math.cos(a)]; };
// centre of the neighbour tile sharing edge k: 2·Ri along the outward normal = R·√3 along it.
export const neighbourOffset = (k, R) => { const n = edgeNormal(k); return [R * SQRT3 * n[0], R * SQRT3 * n[1]]; };
export const hexVerts = (R) => { const v = []; for (let k = 0; k < 6; k++) { const a = 60 * k * DEG; v.push([R * Math.cos(a), R * Math.sin(a)]); } return v; };

// ── extract, per hex edge, the threads that reach it ────────────────────────────────────────
// A rim cell (radial fraction > band) is assigned to the edge whose LINE it is closest to (least
// inward distance), provided its along-edge coordinate t∈[-1,1] (inside the edge span, not past a
// vertex). Threads are deduped per edge at their mean t and sorted along the edge.
export function hexExits(model, opts = {}) {
  const R = model.R;
  const Ri = R * SQRT3 / 2;
  const rimFrac = opts.rimFrac ?? 0.72;     // keep only cells out near the rim
  const inBand = opts.inBand ?? 0.22 * R;   // and within this inward distance of an edge line
  const perEdge = Array.from({ length: 6 }, () => []);
  for (const c of model.cells) {
    if (!c.owner) continue;
    const rf = Math.hypot(c.x, c.y) / R;
    if (rf <= rimFrac) continue;
    // pick the edge whose line this cell is closest to, with a valid along-edge coordinate
    let best = -1, bestIn = Infinity, bestT = 0;
    for (let k = 0; k < 6; k++) {
      const n = edgeNormal(k), tg = edgeTangent(k);
      const inward = Ri - (c.x * n[0] + c.y * n[1]);      // ≥0 inside; small ⇒ near this edge
      const t = (c.x * tg[0] + c.y * tg[1]) / (R / 2);    // along edge, ±1 at vertices
      if (inward < -0.04 * R || Math.abs(t) > 1.02) continue;
      if (inward < bestIn) { bestIn = inward; best = k; bestT = t; }
    }
    if (best < 0 || bestIn > inBand) continue;
    perEdge[best].push({ kind: c.owner.kind === 'white' ? 'W' : 'P', idx: c.owner.idx, t: bestT, gi: c.gi });
  }
  return perEdge.map((list) => {
    const g = new Map();
    for (const e of list) { const key = e.kind + e.idx; const o = g.get(key) || { kind: e.kind, idx: e.idx, ts: [], gis: [] }; o.ts.push(e.t); o.gis.push(e.gi); g.set(key, o); }
    return [...g.values()]
      .map((o) => ({ kind: o.kind, idx: o.idx, t: o.ts.reduce((a, b) => a + b, 0) / o.ts.length, cells: o.gis }))
      .sort((a, b) => a.t - b.t);
  });
}

// THE WARP — a 1-white-per-edge bijection. Each white spirals centre→rim and has one rim exit;
// its rim-most cell (max radius) fixes which edge it owns and where (t). With 6 whites and 6 edges
// this is a bijection: if two whites claim the same edge, the one whose exit is closer to the rim
// keeps it and the other is pushed to its next-nearest free edge (greedy, deterministic). The
// resulting per-edge white ownership is the connective-tissue warp: translation-tiling turns each
// owned white into a straight global strand (see traceWarp). Computed from the model for robustness.
export function warpBijection(model) {
  const R = model.R, Ri = R * SQRT3 / 2;
  // per white: its rim-most cell → ranked list of (edge, t, inward) preferences
  const best = new Map();   // idx → { rf, prefs:[{k,t,inward}] }
  for (const c of model.cells) {
    if (!c.owner || c.owner.kind !== 'white') continue;
    const rf = Math.hypot(c.x, c.y) / R, cur = best.get(c.owner.idx);
    if (cur && cur.rf >= rf) continue;
    const prefs = [];
    for (let k = 0; k < 6; k++) {
      const n = edgeNormal(k), tg = edgeTangent(k);
      const inward = Ri - (c.x * n[0] + c.y * n[1]);
      const t = (c.x * tg[0] + c.y * tg[1]) / (R / 2);
      prefs.push({ k, t, inward: Math.abs(inward) });
    }
    prefs.sort((a, b) => a.inward - b.inward);
    best.set(c.owner.idx, { rf, prefs });
  }
  // greedy assignment: whites with the rim-most cell pick first
  const order = [...best.entries()].sort((a, b) => b[1].rf - a[1].rf);
  const perEdge = Array.from({ length: 6 }, () => null);
  const byWhite = new Map();
  for (const [idx, info] of order) {
    let placed = false;
    for (const p of info.prefs) if (!perEdge[p.k]) { perEdge[p.k] = { kind: 'W', idx, t: p.t }; byWhite.set(idx, { k: p.k, t: p.t }); placed = true; break; }
    if (!placed) { const p = info.prefs[0]; byWhite.set(idx, { k: p.k, t: p.t, bumped: true }); }
  }
  return { perEdge, byWhite };
}

// edges-based fallback (used when only the exit lists are available, e.g. drawing overlays)
export function dominantWhiteEdges(edges) {
  const byWhite = new Map();
  edges.forEach((e, k) => e.forEach((x) => {
    if (x.kind !== 'W') return;
    const n = x.cells ? x.cells.length : 1, cur = byWhite.get(x.idx);
    if (!cur || n > cur.n) byWhite.set(x.idx, { k, t: x.t, n });
  }));
  const perEdge = Array.from({ length: 6 }, () => null);
  for (const [idx, b] of byWhite) if (!perEdge[b.k]) perEdge[b.k] = { kind: 'W', idx, t: b.t };
  return { perEdge, byWhite };
}

// ── solve the thread-to-thread interfaces at every shared edge ──────────────────────────────
// Honeycombing the hex GLUES each edge to a neighbour: tile A's edge k mates tile B's edge (k+3).
// B is a translate of A, so B's edge-(k+3) carries A's OWN edge-(k+3) exits, mirrored (the shared
// segment reverses tangent). Continuity across a seam is NOT literal curve-joining (the spiral
// chirality biases every white to the same side of its edge, so opposite edges don't mirror-align);
// it is realised the way continuity is everywhere else in this project — as DOOR-ADJACENCY between
// the rim cells that abut across the seam. Position along the edge decides which A-cell abuts which
// B-cell: A's exit at t abuts B's exit at −t.
//
//   • SAME-KIND abutment (white↔white or prod↔prod) = CONTINUITY: step across onto a like thread,
//     same concourse — the connective tissue carries through. Whites lead this channel (6 of them,
//     one dominant per edge, matching the hex's 6 edges → the warp permutation, see `warp`).
//   • CROSS-KIND abutment (white↔prod) = a K-DOOR: the K(6,8) white×production contact reaching
//     across the seam into the neighbour tile. The 8 engines don't divide the 6-fold symmetry, so
//     production is where the cross-kind doors land.
export function solveInterfaces(edges, warp) {
  warp = warp || dominantWhiteEdges(edges);
  const perEdge = [];
  let sameKind = 0, crossKind = 0, whiteCont = 0, whiteAbut = 0, prodDoors = 0, prodAbut = 0;
  for (let k = 0; k < 6; k++) {
    const A = edges[k], B = edges[(k + 3) % 6];
    const pairs = [];
    for (const a of A) {
      let best = null, bd = Infinity;
      for (const b of B) { const d = Math.abs(b.t - (-a.t)); if (d < bd) { bd = d; best = b; } }
      const same = !!best && best.kind === a.kind;
      pairs.push({ a, b: best, dt: bd, kind: same ? 'continuity' : 'door' });
      if (a.kind === 'W') { whiteAbut++; if (same) whiteCont++; }
      else { prodAbut++; if (!same) prodDoors++; }
      if (same) sameKind++; else crossKind++;
    }
    perEdge.push({ k, neighbour: (k + 3) % 6, pairs });
  }
  return {
    warp, perEdge,
    census: {
      sameKind, crossKind, whiteAbut, whiteCont, prodAbut, prodDoors,
      whiteContinuityRate: whiteAbut ? whiteCont / whiteAbut : 0,       // whites abutting whites
      everyEdgeIsInterface: perEdge.every((e) => e.pairs.length > 0),
      hasKDoors: crossKind > 0,
    },
  };
}

// ── trace the emergent global warp: the 6 whites → 3 global strand families ─────────────────
// The tiling is by translation, so a white crossing its dominant edge continues as the SAME white
// label in the next tile (the pattern repeats) — a straight global strand. Opposite edges k & k+3
// share one direction, so the 6 white edge-slots collapse to 3 global strand families: one
// azimuthal RING (E–W) + two counter-rotating HELICES (this is exactly helix.html's emergence,
// now over the real Voronoi whites). Returns the per-edge white label and the 3 axes.
export function traceWarp(edges, interfaces) {
  const label = interfaces.warp.perEdge.map((w) => (w ? w.idx : null));   // white idx per edge, or null
  const axes = [];
  for (let k = 0; k < 3; k++) axes.push({ dir: k, edges: [k, k + 3], whites: [label[k], label[k + 3]] });
  const covered = new Set(label.filter((v) => v != null));
  return { label, axes, families: axes.length, whiteCount: covered.size, allCovered: covered.size === 6 && label.every((v) => v != null) };
}

// ── one-call solve ──────────────────────────────────────────────────────────────────────────
export function solveTessellation(model, opts = {}) {
  const edges = hexExits(model, opts);
  const warpBij = warpBijection(model);                 // robust 1-white-per-edge bijection from the model
  const interfaces = solveInterfaces(edges, warpBij);
  const warp = traceWarp(edges, interfaces);
  return { R: model.R, edges, interfaces, warp };
}

if (typeof globalThis !== 'undefined') globalThis.RindTessWeave = { hexExits, warpBijection, dominantWhiteEdges, solveInterfaces, traceWarp, solveTessellation, edgeNormal, edgeTangent, edgeNormalAng, neighbourOffset, hexVerts };

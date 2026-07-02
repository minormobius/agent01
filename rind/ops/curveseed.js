// curveseed.js — A DIFFERENT SEEDING STRATEGY for the one-door substrate. Instead of an HCP lattice of homogeneous
// nodes that the threads claim by flood (prism.js + layWeave), we seed the Voronoi nuclei DIRECTLY ALONG the analytic
// thread curves and let the polyhedra GROW OUT to fill the whole prism:
//
//   1. walk each of the 14 analytic centrelines (weaveLines' lineW / lineP — the over/under spirals) and drop a
//      nucleus every `pitch` of arc, TAGGED with that thread as its owner;
//   2. take the true 3D Voronoi of just those on-curve nuclei, clipped to the hex prism (cells3d.buildCells) — so
//      every point in the prism is owned by its NEAREST curve, and the cells fill the volume solid.
//
// Why it fits the one-door tech so cleanly: each nucleus is BORN owning its thread, so there is NO interstitial
// matrix (every chamber is a thread cell) and continuity is intrinsic — consecutive on-curve nuclei are Voronoi
// neighbours, and the 6 white curves all converge at the top hub (the 8 production at the bottom), so each concourse
// is one connected region by construction. `pitch` ≈ the thread-to-thread separation gives a roughly isotropic foam;
// tighter than that makes dense strings along the curves with larger cells growing to fill the gaps between them.
//
// Consumes the SAME geometry as prism/onedoor (buildGeometry + weaveLines); emits a model shaped like buildWeave3D's
// so onedoor's certify / assignConcourses / placeDoors run over it unchanged. Pure, deterministic.

import { buildGeometry, weaveLines, layWeave } from './weave3d.js';
import { buildCells, ownerKey } from './cells3d.js';
import { buildPrism } from './prism.js';

const TAU = Math.PI * 2;
function mulberry32(a) { return function () { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

// `filler`: ratio of the background-filler spacing to the on-curve pitch. The curve nuclei alone give the full weave
// (K=48, all doors at grade) but the over/under crossings CHOP each thread into pieces — with no interstitial matrix
// to bridge them the two concourses fragment and one-door fails. A sparse HCP filler (owner = matrix) grown into the
// gaps is what reconnects each concourse (onedoor.assignConcourses floods the matrix), restoring one-door. filler=0
// is the pure-curve substrate (K perfect, concourses fragmented — instructive but NOT one-door).
// `ownership`: how each chamber is assigned to a thread.
//   'watershed' (DEFAULT) — a geodesic flood grows each thread as a CONNECTED region from its nexus seed, only ever
//      claiming a cell adjacent to one it already owns ⇒ EVERY spiral is one continuous Voronoi corridor by
//      construction (the core requirement). Curve-seeded nuclei keep it balanced + curve-aligned + K≈48 + at-grade.
//   'nearest' — each chamber owned by its nearest nucleus's thread (plain Euclidean Voronoi). Instructive but NEVER
//      continuous: at every crossing the other spiral's nucleus is closer and slices the thread (0/14 continuous,
//      and MORE hexes make it worse, not better — the crossings are topological, not a crowding problem).
export const CURVE_DEFAULTS = { pitch: 36, jitter: 0.22, filler: 1.0, tube: 0, ownership: 'watershed', width: 6 };

const norm3 = (a) => { const L = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / L, a[1] / L, a[2] / L]; };
const cross3 = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

// resample one analytic curve (rf: 0→1) into nuclei spaced ≈ `pitch` in 3D arc length, as a TUBE of cross-section
// `tube` nuclei (a warp keeps its thickness where a weft crosses it — that thickness is what keeps each thread ONE
// connected corridor through the over/under crossings, exactly the role `width` plays in the HCP weave).
function seedCurve(lineFn, pitch, owner, rng, jit, out, tube, tubeR) {
  const M = 480, dense = [];
  for (let i = 0; i <= M; i++) { const rf = 0.014 + 0.986 * i / M; dense.push(lineFn(rf)); }
  const jitv = () => (rng() - 0.5) * 2 * jit;
  let acc = pitch;                                   // force a nucleus at the hub end
  for (let i = 0; i <= M; i++) {
    if (i > 0) acc += Math.hypot(dense[i][0] - dense[i - 1][0], dense[i][1] - dense[i - 1][1], dense[i][2] - dense[i - 1][2]);
    if (acc >= pitch || i === M) {                   // drop a tube cross-section here (and always one at the rim)
      const p = dense[i];
      out.push({ x: p[0] + jitv(), y: p[1] + jitv(), z: p[2] + jitv(), owner });
      if (tube > 0 && tubeR > 0) {                    // ring of `tube` nuclei in the plane ⟂ the local tangent
        const a = dense[Math.max(0, i - 1)], b = dense[Math.min(M, i + 1)], That = norm3([b[0] - a[0], b[1] - a[1], b[2] - a[2]]);
        let u = cross3(That, [0, 0, 1]); if (Math.hypot(u[0], u[1], u[2]) < 1e-6) u = [1, 0, 0]; u = norm3(u); const v = norm3(cross3(That, u));
        for (let k = 0; k < tube; k++) { const ang = (k + 0.5) / tube * TAU, ox = u[0] * Math.cos(ang) + v[0] * Math.sin(ang), oy = u[1] * Math.cos(ang) + v[1] * Math.sin(ang), oz = u[2] * Math.cos(ang) + v[2] * Math.sin(ang);
          out.push({ x: p[0] + ox * tubeR + jitv(), y: p[1] + oy * tubeR + jitv(), z: p[2] + oz * tubeR + jitv(), owner }); }
      }
      acc = 0;
    }
  }
}

// link the cell graph into one connected component: BFS the components, then bridge every non-largest one to its
// nearest cell in an already-kept component by centroid distance (a face buildCells' tolerance dropped).
function stitchComponents(cells) {
  const comp = new Array(cells.length).fill(-1); let nc = 0; const groups = [];
  for (const c of cells) { if (comp[c.gi] !== -1) continue; const id = nc++, q = [c.gi], g = []; comp[c.gi] = id;
    for (let h = 0; h < q.length; h++) { g.push(q[h]); for (const nb of cells[q[h]].adj) if (comp[nb] === -1) { comp[nb] = id; q.push(nb); } } groups.push(g); }
  if (nc <= 1) return;
  groups.sort((a, b) => b.length - a.length);
  const kept = new Set(groups[0]);                                   // grow the main body, absorbing offcuts nearest-first
  for (let i = 1; i < groups.length; i++) {
    let ba = -1, bb = -1, bd = Infinity;
    for (const gi of groups[i]) { const c = cells[gi]; for (const hj of kept) { const q = cells[hj], d = (q.x - c.x) ** 2 + (q.y - c.y) ** 2 + (q.z - c.z) ** 2; if (d < bd) { bd = d; ba = gi; bb = hj; } } }
    if (ba >= 0) { cells[ba].adj.add(bb); cells[bb].adj.add(ba); }
    for (const gi of groups[i]) kept.add(gi);
  }
}

export function buildCurveModel(seed = 1, opts = {}) {
  const geo = buildGeometry(seed, opts);
  const lines = weaveLines(geo, opts);
  const { R, thickness: T, NW, NF, layers, footprint } = geo;
  const flatR = lines.flatR, pitch = Math.max(6, opts.pitch ?? CURVE_DEFAULTS.pitch);
  const rng = mulberry32((geo.seed ^ 0x51ed3) >>> 0), jit = (opts.jitter ?? CURVE_DEFAULTS.jitter) * pitch;

  // seed nuclei along every thread curve, tagged with the owning thread (as a tube of cross-section `tube`)
  const raw = [], tube = Math.max(0, opts.tube ?? CURVE_DEFAULTS.tube), tubeR = pitch * 0.62;
  for (let w = 0; w < NW; w++) seedCurve((rf) => lines.lineW(w, rf), pitch, { kind: 'white', idx: w }, rng, jit, raw, tube, tubeR);
  for (let f = 0; f < NF; f++) seedCurve((rf) => lines.lineP(f, rf), pitch, { kind: 'prod', idx: f }, rng, jit, raw, tube, tubeR);

  // clamp z inside the prism and drop near-coincident nuclei — GLOBALLY (any thread), not just same-thread. Where a
  // white curve and a production curve nearly touch (the same-height crossings) their nuclei would otherwise sit ~0
  // apart and buildCells hands the loser a zero-face SLIVER cell (degree-0, disconnected), which fragments the flood.
  // A global minimum separation of ~0.34·pitch removes those slivers so the Voronoi graph is one connected solid.
  const zpad = 0.02 * T, dedup = (pitch * 0.34) ** 2, nodes = [];
  const gs = pitch * 0.5, grid = new Map(), gk = (x, y, z) => `${Math.round(x / gs)},${Math.round(y / gs)},${Math.round(z / gs)}`;
  for (const n of raw) {
    n.z = Math.max(zpad, Math.min(T - zpad, n.z));
    let dup = false;
    const bx = Math.round(n.x / gs), by = Math.round(n.y / gs), bz = Math.round(n.z / gs);
    for (let dx = -1; dx <= 1 && !dup; dx++) for (let dy = -1; dy <= 1 && !dup; dy++) for (let dz = -1; dz <= 1 && !dup; dz++) { const b = grid.get(`${bx + dx},${by + dy},${bz + dz}`); if (!b) continue; for (const m of b) if ((m.x - n.x) ** 2 + (m.y - n.y) ** 2 + (m.z - n.z) ** 2 < dedup) { dup = true; break; } }
    if (!dup) { nodes.push(n); (grid.get(gk(n.x, n.y, n.z)) || grid.set(gk(n.x, n.y, n.z), []).get(gk(n.x, n.y, n.z))).push(n); }
  }
  const curveCount = nodes.length;

  // FILL THE GAPS: a sparse HCP filler (owner = matrix) grown into the volume between the curves. Skip any filler
  // node that lands on a curve so the strings stay crisp; the flood in onedoor.assignConcourses then colours this
  // matrix by nearest concourse and BRIDGES the crossing-chopped thread pieces back into one region per concourse.
  const vpitch0 = T / layers, filler = opts.filler ?? CURVE_DEFAULTS.filler;
  if (filler > 0) {
    const fp = buildPrism((geo.seed ^ 0x9d17) >>> 0, { hexR: R, spacing: pitch * filler, layers, jitter: 0.22, vpitch: vpitch0 });
    const guard = (pitch * 0.62) ** 2;
    for (const p of fp.nodes) { let hit = false; for (const c of nodes) if (c.owner && (c.x - p.x) ** 2 + (c.y - p.y) ** 2 + (c.z - p.z) ** 2 < guard) { hit = true; break; } if (!hit) nodes.push({ x: p.x, y: p.y, z: p.z, owner: null }); }
  }

  // largest nearest-neighbour gap → the Voronoi reach must cover it so every cell is clipped by its true neighbours
  let maxNN = pitch;
  for (let i = 0; i < nodes.length; i++) { let nn = Infinity; const a = nodes[i]; for (let j = 0; j < nodes.length; j++) { if (i === j) continue; const b = nodes[j], d = (a.x - b.x) ** 2 + (a.y - b.y) ** 2 + (a.z - b.z) ** 2; if (d < nn) nn = d; } if (nn < Infinity) maxNN = Math.max(maxNN, Math.sqrt(nn)); }
  const vpitch = T / layers;
  const reachSpacing = Math.max(pitch, maxNN);   // buildCells uses reach = 2.4·max(spacing,vpitch)

  // finalize node fields for buildCells (i, layer, nearest = owner, flat = inside the hub core)
  nodes.forEach((n, i) => { n.i = i; n.layer = Math.max(0, Math.min(layers - 1, Math.floor(n.z / vpitch))); n.nearest = n.owner; n.flat = Math.hypot(n.x, n.y) / R <= flatR; });

  const cellsModel = buildCells({ nodes, footprint, spacing: reachSpacing, thickness: T, layers });
  const cells = cellsModel.cells;
  // buildCells owns each cell by its NEAREST nucleus (Euclidean Voronoi). Keep that only for ownership:'nearest';
  // otherwise re-own by the geodesic WATERSHED so every spiral is one connected corridor (see CURVE_DEFAULTS).

  // STITCH the graph into ONE connected solid. buildCells' face-adjacency test (a 0.5 relative-distance tolerance) can
  // drop genuine shared faces on irregular point sets, leaving degree-0 slivers AND small floating clusters cut off
  // from the body. Find the connected components; link every non-largest one to its nearest cell in another component
  // (a sliver/cluster still opens into the room it sits in). Without this the concourse flood counts those as phantom
  // components and one-door fails. Cheap: the offcuts are few and small.
  stitchComponents(cells);

  // RE-OWN by the geodesic watershed (unless ownership:'nearest') so every spiral is ONE connected corridor. layWeave
  // grows each thread from its nexus seed, claiming only cells adjacent to its own — connected by construction. We
  // feed it the curve nuclei (so its node write-back lands on the right array) and pitch as the spacing (tubeR scale).
  const ownership = opts.ownership ?? CURVE_DEFAULTS.ownership;
  if (ownership !== 'nearest') layWeave({ ...geo, spacing: pitch, nodes }, cellsModel, lines, { width: opts.width ?? CURVE_DEFAULTS.width });

  return {
    ...geo, ...lines, flatR, substrate: 'curve', ownership, pitch, spacing: reachSpacing,
    nodes, cells, cellsModel, nucleiCount: nodes.length, curveCount, fillerCount: nodes.length - curveCount,
  };
}

// convenience mirror of buildOneDoor for the curve substrate (certify imported lazily by callers to avoid a cycle)
if (typeof globalThis !== 'undefined') globalThis.RindCurveSeed = { buildCurveModel, CURVE_DEFAULTS };

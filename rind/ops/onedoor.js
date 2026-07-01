// onedoor.js — THE ONE-DOOR RESOLUTION. The endpoint that finally makes the hard spec line true BY CONSTRUCTION:
//
//   ┌──────────────────────────────────────────────────────────────────────────────────────────────────────────┐
//   │  Wayfinding from ANY point in the chunk to ANY other point passes through only ONE door — including the    │
//   │  two central hubs.  Not "≈ one door" (the per-thread door graph in cells3d only got avg≈1, max up to 4).   │
//   │  EXACTLY ≤ 1, proven.                                                                                       │
//   └──────────────────────────────────────────────────────────────────────────────────────────────────────────┘
//
// WHY the per-thread model can't do it: the 6 white arms all spiral the SAME way out of the top hub, so no white
// arm ever crosses another white arm — white·i → white·j shares no door and must detour through a production arm
// (2 doors). Same for the 8 production arms. The interstitial matrix is a third region on top. So "different thread
// == a door" makes same-colour trips cost ≥2. It's a property of how doors are COUNTED, not of the geometry.
//
// THE FIX — collapse the walkable space to exactly TWO door-free concourses joined only by controlled doors:
//   • the WHITE concourse  = the 6 arms + the nave (top) hub, ONE connected door-free region (open plates throughout)
//   • the PRODUCTION concourse = the 8 arms + the (bottom) hub, ONE connected door-free region on the floor stratum
//   • the ONLY doors in the whole chunk are the 48 K(6,8) crossings — each a single ZERO-GRADE doorway at the flat
//     the weave already lands there; every other white/production shared plate is a WALL (the rind rule: walls are
//     the default, doors are deliberately-placed gaps).
// Then: within a colour → 0 doors; across colours → exactly 1 (walk free to the nearest crossing, cross once, walk
// free); MAX over all pairs, incl. both hubs, = 1. The "6 threads / 8 threads" survive as a wayfinding IDENTITY
// (which arm tours which engines) laid over the two concourses, not as walled corridors.
//
// This module sits ON TOP of the exact same prism + Voronoi + weave geometry as prism.html — it only re-poses the
// DOOR GRAPH. Pure, deterministic, node-tested (onedoor.selftest.mjs proves maxDoors === 1).

import { buildGeometry, weaveLines, layWeave } from './weave3d.js';
import { buildCells } from './cells3d.js';

// ── STAGE A: partition every chamber into one of TWO connected, door-free concourses ──
// TWO invariants must both hold: (i) NO K crossing may be lost — so every cell an ARM owns keeps its arm's colour
// (white-owned → white, prod-owned → prod), which preserves every white↔production adjacency the weave built; and
// (ii) each concourse is ONE connected door-free region. We get (i) by hard-binding owned cells, and (ii) because
// the interstitial MATRIX is flooded to the nearest colour by a multi-source BFS from every owned cell at once — so
// matrix fills in between the arms and stitches the same-colour arms into a single component (verified per seed by
// the selftest; the arms converge at their hub, and the matrix bridges the rest). Every cell ends exactly one
// colour, no third region. The "6 arms / 8 arms" survive as an owner-identity OVERLAY, not as walls.
export function assignConcourses(model) {
  const cells = model.cells, N = cells.length, zMid = model.thickness / 2, R = model.R;
  const isWhite = (c) => c.owner && c.owner.kind === 'white';
  const isProd = (c) => c.owner && c.owner.kind === 'prod';
  const color = new Array(N).fill(null);

  // (i) hard-bind: an arm's cells ARE that concourse (never recoloured — this is what protects the K contacts)
  for (const c of cells) { if (isWhite(c)) color[c.gi] = 'white'; else if (isProd(c)) color[c.gi] = 'prod'; }

  // (ii) flood the matrix. Multi-source BFS by hop distance from all owned cells; ties (same hop count) break toward
  // the stratum the matrix cell sits in (upper→white, lower→prod) so the fill reads as two strata, not a jagged seam.
  const dist = new Array(N).fill(Infinity), frontier = [];
  for (const c of cells) if (color[c.gi]) { dist[c.gi] = 0; frontier.push(c.gi); }
  for (let h = 0; h < frontier.length; h++) {
    const gi = frontier[h];
    for (const nb of cells[gi].adj) {
      if (color[nb] !== null) continue;
      if (dist[nb] === Infinity) { dist[nb] = dist[gi] + 1; color[nb] = color[gi]; frontier.push(nb); }
      else if (dist[nb] === dist[gi] + 1 && color[nb] !== color[gi]) { const want = cells[nb].z >= zMid ? 'white' : 'prod'; if (color[gi] === want) color[nb] = want; }   // tie-break by stratum
    }
  }
  // any cell the BFS somehow missed (isolated) → nearest by stratum, so the partition is always complete
  for (const c of cells) if (color[c.gi] === null) color[c.gi] = c.z >= zMid ? 'white' : 'prod';

  // the hubs (for reporting + the "including hubs" test): the central cells of each stratum
  const coreR = Math.max(model.flatR * R, 1.6 * model.spacing);
  const whiteHub = new Set(), prodHub = new Set();
  for (const c of cells) if (Math.hypot(c.x, c.y) <= coreR) { if (color[c.gi] === 'white' && c.z >= zMid) whiteHub.add(c.gi); else if (color[c.gi] === 'prod' && c.z < zMid) prodHub.add(c.gi); }
  if (!whiteHub.size) { const c = cells.filter((c) => color[c.gi] === 'white').sort((a, b) => (a.x * a.x + a.y * a.y) - (b.x * b.x + b.y * b.y))[0]; if (c) whiteHub.add(c.gi); }
  if (!prodHub.size) { const c = cells.filter((c) => color[c.gi] === 'prod').sort((a, b) => (a.x * a.x + a.y * a.y) - (b.x * b.x + b.y * b.y))[0]; if (c) prodHub.add(c.gi); }

  for (const c of cells) c.concourse = color[c.gi];
  return { color, whiteHub, prodHub, zMid };
}

// connected components of a colour under SAME-COLOUR face adjacency (the free-walk graph of a concourse)
function componentsOf(cells, color, which) {
  const set = new Set(cells.filter((c) => color[c.gi] === which).map((c) => c.gi)), seen = new Set();
  let comps = 0, largest = 0, largestSet = null;
  for (const gi of set) {
    if (seen.has(gi)) continue; comps++; const q = [gi], mine = new Set([gi]); seen.add(gi);
    for (let h = 0; h < q.length; h++) for (const nb of cells[q[h]].adj) if (set.has(nb) && !seen.has(nb)) { seen.add(nb); mine.add(nb); q.push(nb); }
    if (mine.size > largest) { largest = mine.size; largestSet = mine; }
  }
  return { comps, size: set.size, largest, largestSet: largestSet || new Set() };
}

// ── STAGE B: place the 48 doors. For each K(6,8) pair (white arm w, production arm f) choose the single
// white-w ↔ prod-f face adjacency that reads MOST as a zero-grade doorway: flattest first (small |Δz| over the
// horizontal step — a wall you step through at grade, not a stair), nearest the crossing. Returns the doors + which
// pairs have none (a real K break, reported raw — never faked). ──
export function placeDoors(model, color) {
  const cells = model.cells, NW = model.NW, NF = model.NF;
  const best = new Map(); // "w:f" -> {a,b,w,f,grade,dz,horiz}
  for (const c of cells) {
    if (!(c.owner && c.owner.kind === 'white') || color[c.gi] !== 'white') continue;
    const w = c.owner.idx;
    for (const nb of c.adj) {
      const q = cells[nb];
      if (!(q.owner && q.owner.kind === 'prod') || color[nb] !== 'prod') continue;
      const f = q.owner.idx, key = w + ':' + f;
      const dz = Math.abs(c.z - q.z), horiz = Math.hypot(c.x - q.x, c.y - q.y), grade = horiz > 1e-6 ? dz / horiz : Infinity;
      const prev = best.get(key);
      if (!prev || grade < prev.grade) best.set(key, { a: c.gi, b: nb, w, f, grade, dz, horiz });
    }
  }
  const doors = [...best.values()];
  const missing = []; for (let w = 0; w < NW; w++) for (let f = 0; f < NF; f++) if (!best.has(w + ':' + f)) missing.push([w, f]);
  return { doors, missing, doorPairs: best.size };
}

// ── the concourse door graph: same-colour faces are FREE (walk the concourse), the placed doors cost 1, every
// other cross-colour face is a WALL (no edge). This is the graph the whole guarantee lives in. ──
export function buildDoorGraph(model, color, doors) {
  const cells = model.cells, N = cells.length;
  const free = Array.from({ length: N }, () => []);          // weight-0 neighbours (same concourse)
  for (const c of cells) for (const nb of c.adj) if (color[nb] === color[c.gi]) free[c.gi].push(nb);
  const doorAdj = Array.from({ length: N }, () => []);        // weight-1 neighbours (a placed door)
  const doorSet = new Set();
  for (const d of doors) { doorAdj[d.a].push(d.b); doorAdj[d.b].push(d.a); doorSet.add(d.a + '|' + d.b); doorSet.add(d.b + '|' + d.a); }
  return { N, free, doorAdj, doorSet, color, cells };
}

// route minimising doors on the concourse graph (0/1 weights ⇒ Dial's algorithm / 0-1 BFS). ≤1 by construction.
export function routeOneDoor(graph, aGi, bGi) {
  if (aGi == null || bGi == null) return null;
  if (aGi === bGi) return { path: [aGi], doors: 0 };
  const dist = new Map([[aGi, 0]]), prev = new Map([[aGi, -1]]), deque = [aGi];
  while (deque.length) {
    const cur = deque.shift(), d = dist.get(cur);
    if (cur === bGi) break;
    for (const nb of graph.free[cur]) if (d < (dist.has(nb) ? dist.get(nb) : Infinity)) { dist.set(nb, d); prev.set(nb, cur); deque.unshift(nb); }      // weight 0 → front
    for (const nb of graph.doorAdj[cur]) if (d + 1 < (dist.has(nb) ? dist.get(nb) : Infinity)) { dist.set(nb, d + 1); prev.set(nb, cur); deque.push(nb); } // weight 1 → back
  }
  if (!prev.has(bGi)) return null;
  const path = []; for (let c = bGi; c !== -1; c = prev.get(c)) path.push(c); path.reverse();
  return { path, doors: dist.get(bGi) };
}

const centreOf = (cells, set) => { let best = -1, bd = Infinity; for (const gi of set) { const c = cells[gi], d = c.x * c.x + c.y * c.y; if (d < bd) { bd = d; best = gi; } } return best; };

// ── THE CERTIFICATE — the offline proof that the construction meets the whole spec, maxDoors and all ──
export function certify(model) {
  const { color, whiteHub, prodHub, zMid } = assignConcourses(model);
  const cells = model.cells, N = cells.length;

  // (1) the two concourses PARTITION every chamber, each is exactly ONE connected door-free region
  const noMatrix = cells.every((c) => color[c.gi] === 'white' || color[c.gi] === 'prod');
  const W = componentsOf(cells, color, 'white'), P = componentsOf(cells, color, 'prod');
  const whiteConnected = W.comps === 1 && W.size > 0, prodConnected = P.comps === 1 && P.size > 0;

  // (2) the doors: all 48 K(6,8) crossings realised as at-grade doorways
  const { doors, missing, doorPairs } = placeDoors(model, color);
  const k48 = missing.length === 0 && doorPairs === model.NW * model.NF;
  const grades = doors.map((d) => d.grade).filter((g) => isFinite(g));
  const maxGrade = grades.length ? Math.max(...grades) : 0, avgGrade = grades.length ? grades.reduce((a, b) => a + b, 0) / grades.length : 0;
  // a door is "at grade" (a zero-grade doorway you step through, not a stair) if it stays within the pedestrian cap.
  // The few that don't are genuine over/under crossings (white passes a deck above production) — widen/add decks.
  const gradeCap = model.maxGrade ?? 0.6, atGradeDoors = doors.filter((d) => d.grade <= gradeCap).length, steepDoors = doors.length - atGradeDoors;

  // (3) THE HEADLINE: max doors over ALL pairs === 1. Structural proof: two 0-connected regions joined by ≥1 door
  // ⇒ 0 within a colour, exactly 1 across ⇒ max 1. We assert the structure AND measure it exhaustively-ish.
  const graph = buildDoorGraph(model, color, doors);
  const structuralMax1 = whiteConnected && prodConnected && doors.length > 0;
  let measuredMax = 0, sampled = 0, sumDoors = 0, unreachable = 0;
  const step = Math.max(1, Math.floor(N / 60));                       // ~60² sampled pairs, spread across the chunk
  const probes = []; for (let i = 0; i < N; i += step) probes.push(cells[i].gi);
  for (const a of probes) for (const b of probes) { if (a === b) continue; const r = routeOneDoor(graph, a, b); if (!r) { unreachable++; continue; } measuredMax = Math.max(measuredMax, r.doors); sumDoors += r.doors; sampled++; }

  // (4) "including central hubs": every hub cell is 0 doors from its concourse; the two hubs are exactly 1 apart
  const wc = centreOf(cells, whiteHub), pc = centreOf(cells, prodHub);
  const hubRoute = (wc >= 0 && pc >= 0) ? routeOneDoor(graph, wc, pc) : null;
  const hubsOneDoor = !!hubRoute && hubRoute.doors === 1;
  let hubInternalMax = 0; for (const gi of whiteHub) { const r = routeOneDoor(graph, wc, gi); if (r) hubInternalMax = Math.max(hubInternalMax, r.doors); }
  for (const gi of prodHub) { const r = routeOneDoor(graph, pc, gi); if (r) hubInternalMax = Math.max(hubInternalMax, r.doors); }

  const oneDoor = structuralMax1 && measuredMax <= 1 && unreachable === 0;
  // the THESIS of this endpoint — anywhere→anywhere ≤ 1 door, incl. hubs, two connected concourses, no third region.
  // (K completeness + zero-grade are separate QUALITY metrics — best-effort like the rest of the weave, reported but
  // not part of the one-door proof, which holds no matter how many of the 48 crossings a given seed opens.)
  const oneDoorOk = oneDoor && whiteConnected && prodConnected && noMatrix && hubsOneDoor && hubInternalMax === 0;
  const breaks = [];
  if (!noMatrix) breaks.push('partition incomplete: some chambers are neither concourse');
  if (!whiteConnected) breaks.push(`white concourse is ${W.comps} pieces (must be 1) — not one walkable region`);
  if (!prodConnected) breaks.push(`production concourse is ${P.comps} pieces (must be 1)`);
  if (!k48) breaks.push(`K(${model.NW},${model.NF}) doors incomplete: ${doorPairs}/${model.NW * model.NF} — ${missing.length} crossing(s) have no adjacency to open a door`);
  if (!oneDoor) breaks.push(`one-door FAILED: measured max ${measuredMax} door(s)${unreachable ? ', ' + unreachable + ' unreachable pairs' : ''}`);
  if (!hubsOneDoor) breaks.push('the two central hubs are not exactly one door apart');

  return {
    ok: breaks.length === 0, oneDoorOk,
    noMatrix, whiteConnected, prodConnected, whiteComps: W.comps, prodComps: P.comps,
    whiteCells: W.size, prodCells: P.size,
    doors, doorCount: doors.length, k48, doorPairs, missing, maxGrade, avgGrade, atGradeDoors, steepDoors, gradeCap,
    structuralMax1, measuredMax, avgDoors: sampled ? sumDoors / sampled : 0, sampledPairs: sampled, unreachable,
    hubsOneDoor, hubInternalMax, hubRoute, whiteHub, prodHub, oneDoor, breaks,
    color, graph,
  };
}

// ── convenience: build the exact prism geometry (identical to prism.html) + the one-door layer over it ──
export function buildOneDoor(seed = 1, opts = {}) {
  const geo = buildGeometry(seed, opts);
  const cellsModel = buildCells(geo);
  const lines = weaveLines(geo, opts);
  const lay = layWeave(geo, cellsModel, lines, opts);
  const model = { ...geo, ...lines, flatR: lines.flatR, width: opts.width ?? undefined, cells: cellsModel.cells, cellsModel, lines, metrics: lay.metrics };
  const cert = certify(model);
  return { model, cellsModel, geo, lines, cert };
}

if (typeof globalThis !== 'undefined') globalThis.RindOneDoor = { assignConcourses, placeDoors, buildDoorGraph, routeOneDoor, certify, buildOneDoor };

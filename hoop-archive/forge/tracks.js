// tracks.js — A PROBE for the user's question: can the roadway be the MATERIAL track (spiderbots carrying
// packets) with a SEPARATE, non-intersecting PEDESTRIAN track (technicians, rindwalkers — the white-collar
// layer)? Does it degenerate to a spiral, or fractal out like blood vessels?
//
// The empirical answer on our foam: NEITHER — it's a PLANAR IMPOSSIBILITY. Two disjoint connected networks
// that BOTH reach every facility can't coexist in 2D here, because (a) the foam's interior is partitioned
// entirely into road + rooms with road BETWEEN rooms — there is no interstitial tissue for a second network
// (interstitialFrac ≈ 0), and (b) any connective net that reaches all facilities, when removed, ISLANDS the
// rest (it *was* the connectivity — removing the concourse leaves ~130 isolated room-pockets). Blood vessels
// evade exactly this by using the THIRD dimension: arteries and veins run at different depths and only meet
// at capillaries. So the real answer for the ship is two DECKS (material deck + pedestrian deck), joined by
// lifts at each facility — the vertical exchange the nave lift already hints at. See TRACKS.md.
//
// This module grows the two-thin-tree attempt and REPORTS the obstruction (feasibleIn2D = false), so the
// finding is reproducible. Pure + deterministic. Node-tested in test/tracks.selftest.mjs.

import { regionWalk } from './floor.js';
import { makeGraph, createGrower, finalizeField } from '../paint/flux.js';

// CO-GROW two thin interdigitated trees (arteries + veins). NOT the complement of the fat concourse — that
// islands the rooms (a cyclic road encloses regions). Instead grow MATERIAL as a thin tree (freight: every
// facility → the fulfillment lift), then grow PEDESTRIAN as a thin tree through the gaps (personnel hub →
// every facility). A tree doesn't separate the plane, so the material tree's complement stays connected and
// the pedestrian tree threads it — the blood-vessel structure, on our foam.
export function twoTracks(reg, walk, opts = {}) {
  const { matFrac = 0.16, pedFrac = 0.14, mu = 1.5, iters = 18 } = opts;
  walk = walk || regionWalk(reg);
  const N = walk.N, pos = walk.pos;
  const fullEdges = [], seen = new Set();
  for (let i = 0; i < N; i++) for (const j of walk.adj[i]) { if (j <= i) continue; const k = i + ',' + j; if (seen.has(k)) continue; seen.add(k); fullEdges.push({ a: i, b: j, len: Math.hypot(pos[2 * i] - pos[2 * j], pos[2 * i + 1] - pos[2 * j + 1]) }); }
  const nearest = (x, y, ok) => { let best = -1, bd = Infinity; for (let i = 0; i < N; i++) { if (ok && !ok(i)) continue; const d = (pos[2 * i] - x) ** 2 + (pos[2 * i + 1] - y) ** 2; if (d < bd) { bd = d; best = i; } } return best; };
  const fac = reg.facilities.map((f) => nearest(f.x, f.y));
  const hubFac = reg.facilities.find((f) => f.navePort) || reg.facilities[0], hubFacId = reg.facilities.indexOf(hubFac);
  const matHub = fac[hubFacId];

  // ── MATERIAL tree: freight converges on the lift (every facility → the fulfillment hub) + the supply web ──
  const matGraph = makeGraph(N, fullEdges), matDemand = [];
  for (const s of reg.supply) { const a = fac[s.from], b = fac[s.to]; if (a >= 0 && b >= 0 && a !== b) matDemand.push({ a, b, w: s.cross ? 6 : 3 }); }
  for (let i = 0; i < fac.length; i++) if (fac[i] >= 0 && fac[i] !== matHub) matDemand.push({ a: fac[i], b: matHub, w: 4 });
  const mg = createGrower(matGraph, matDemand, { mu, condMax: 60, condGain: 6 });
  for (let it = 0; it < iters; it++) mg.step();
  const matRoad = finalizeField(matGraph, mg.state, { roadFrac: matFrac }).isRoad;
  const isMat = new Uint8Array(N); for (let i = 0; i < N; i++) if (matRoad[i]) isMat[i] = 1;

  // ── PEDESTRIAN tree through the complement: personnel hub → every facility (non-material tips) ──
  const sub = [], g2s = new Int32Array(N).fill(-1);
  for (let i = 0; i < N; i++) if (!isMat[i]) { g2s[i] = sub.length; sub.push(i); }
  const subEdges = [], s2 = new Set();
  for (const gi of sub) for (const gj of walk.adj[gi]) { if (isMat[gj]) continue; const a = g2s[gi], b = g2s[gj]; if (a < 0 || b < 0) continue; const k = a < b ? a + ',' + b : b + ',' + a; if (s2.has(k)) continue; s2.add(k); subEdges.push({ a, b, len: Math.hypot(pos[2 * gi] - pos[2 * gj], pos[2 * gi + 1] - pos[2 * gj + 1]) }); }
  const subNearest = (x, y) => { let best = -1, bd = Infinity; for (let s = 0; s < sub.length; s++) { const gi = sub[s]; const d = (pos[2 * gi] - x) ** 2 + (pos[2 * gi + 1] - y) ** 2; if (d < bd) { bd = d; best = s; } } return best; };
  const pedHub = subNearest(hubFac.x, hubFac.y);
  const facAccess = reg.facilities.map((f) => subNearest(f.x, f.y));
  const pedGraph = makeGraph(sub.length, subEdges), pedDemand = [];
  for (const s of facAccess) if (s >= 0 && s !== pedHub) pedDemand.push({ a: pedHub, b: s, w: 3 });
  const pg = createGrower(pedGraph, pedDemand, { mu, condMax: 60, condGain: 6 });
  for (let it = 0; it < iters; it++) pg.step();
  const pedRoad = finalizeField(pedGraph, pg.state, { roadFrac: pedFrac }).isRoad;
  const ped = new Uint8Array(N);
  for (let s = 0; s < sub.length; s++) if (pedRoad[s]) ped[sub[s]] = 1;
  for (const s of facAccess) if (s >= 0) ped[sub[s]] = 1; if (pedHub >= 0) ped[sub[pedHub]] = 1;

  const facMat = fac, facPed = facAccess.map((s) => (s >= 0 ? sub[s] : -1));
  return { isMat, ped, walk, facMat, facPed, stats: stats(reg, walk, isMat, ped, facMat, facPed) };
}

// connectivity of a cell-set + how many facility tips land in its largest component
function netStats(walk, mask, facCells) {
  const N = walk.N, comp = new Int32Array(N).fill(-1); let nc = 0;
  for (let s = 0; s < N; s++) { if (!mask[s] || comp[s] >= 0) continue; const q = [s]; comp[s] = nc; while (q.length) { const u = q.pop(); for (const v of walk.adj[u]) if (mask[v] && comp[v] < 0) { comp[v] = nc; q.push(v); } } nc++; }
  const cs = {}; for (let i = 0; i < N; i++) if (mask[i]) cs[comp[i]] = (cs[comp[i]] || 0) + 1;
  let big = -1, bs = 0, tot = 0; for (const k in cs) { tot += cs[k]; if (cs[k] > bs) { bs = cs[k]; big = +k; } }
  let reached = 0; for (const c of facCells) if (c >= 0 && mask[c] && comp[c] === big) reached++;
  return { cells: tot, components: nc, largest: bs, connectedFrac: tot ? bs / tot : 0, reached };
}
function stats(reg, walk, isMat, ped, facMat, facPed) {
  const N = walk.N; let shared = 0, iface = 0;
  for (let i = 0; i < N; i++) if (isMat[i] && ped[i]) shared++;
  for (let i = 0; i < N; i++) if (ped[i]) { for (const j of walk.adj[i]) if (isMat[j]) { iface++; break; } }   // where a tech meets a spiderbot
  const M = netStats(walk, isMat, facMat), P = netStats(walk, ped, facPed), F = reg.facilities.length;
  // THE STRUCTURAL DIAGNOSTIC: the foam's interior is partitioned ENTIRELY into road + rooms, with road
  // BETWEEN rooms — so the complement of the connective network is isolated room-pockets (no interstitial
  // tissue for a second network). interstitialFrac = non-road cells that are NOT inside a room (≈ 0 here).
  let nonRoad = 0, interstitial = 0;
  for (let i = 0; i < N; i++) { const ch = reg.recs[walk.nodeChunk[i]], lc = walk.nodeLocal[i]; if (ch.road[lc]) continue; nonRoad++; if (ch.roomOf[lc] < 0) interstitial++; }
  const comp = complementComponents(reg, walk);
  return {
    facilities: F, disjoint: shared === 0, sharedCells: shared,
    material: { cells: M.cells, connectedFrac: M.connectedFrac, reached: M.reached },
    pedestrian: { cells: P.cells, components: P.components, connectedFrac: P.connectedFrac, reached: P.reached },
    interfaceFrac: P.cells ? iface / P.cells : 0,
    interstitialFrac: nonRoad ? interstitial / nonRoad : 0,        // ≈0 ⇒ no room for a second 2D network
    concourseComplement: comp,                                     // {components, largestFrac} of the rooms minus road
    // the verdict: two non-intersecting connective nets that BOTH reach every facility is a planar
    // impossibility here (removing either islands the other). feasibleIn2D is false ⇒ the answer is 3D (decks).
    feasibleIn2D: M.reached >= F && P.reached >= F,
  };
}
// connectivity of the interior MINUS the carved concourse (the rooms) — shows the islanding.
function complementComponents(reg, walk) {
  const N = walk.N, nonRoad = new Uint8Array(N);
  for (let i = 0; i < N; i++) { const ch = reg.recs[walk.nodeChunk[i]]; if (!ch.road[walk.nodeLocal[i]]) nonRoad[i] = 1; }
  const s = netStats(walk, nonRoad, []);
  return { components: s.components, largestFrac: s.connectedFrac, cells: s.cells };
}

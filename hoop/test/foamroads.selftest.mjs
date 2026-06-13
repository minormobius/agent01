// foamroads.selftest.mjs — pins the GROWN foam city (FOAM.md leg 3 in 3D): desire-line right-of-way
// from the lived society over the chamber graph, in place of wayfind's imposed corkscrew. The
// headline assertion: THE CLIMB EMERGES — the grown network threads most of the shell's radial
// depth from demand alone. Run: node hoop/test/foamroads.selftest.mjs
import { createFoamGrower, buildFoamCity, scoreFoamSociety } from '../econ/society3d.js';
import { buildSociety, socialMetrics, scoreSociety } from '../econ/econ.js';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error('  ✗ ' + m); } };

const OPT = { arcDeg: 5, axial: 8, seed: 1 };
const ITERS = 6;

// ── the grower assembles its provisional world and demand from the lived society ──
const g = createFoamGrower(OPT);
{
  ok(g.nav.n > 5000, 'a dense chamber sector (' + g.nav.n + ')');
  ok(g.base.places.length > 300 && g.society.people.length > 300, 'a provisional no-road city + society to source demand');
  ok(g.base.rightOfWay.size === 0, 'the provisional city has NO roads (everyone climbs raw stair-holes)');
  ok(g.trips.length > 500, 'the society yields aggregated trip demand (' + g.trips.length + ' desire lines)');
  ok(g.trips.every((t) => t.a !== t.b && t.a >= 0 && t.b >= 0 && t.a < g.nav.n && t.b < g.nav.n && t.w > 0), 'every trip joins two distinct chambers with positive weight');
  ok(g.graph.E < g.foam.mi.length, 'the routing graph drops the corner-diagonals (face/edge neighbours only)');
}

// ── stepwise + deterministic ──
{
  const s1 = g.step();
  ok(s1.iter === 1 && g.iter === 1, 'step() advances one reinforcement round');
  for (let i = 1; i < ITERS; i++) g.step();
  const g2 = createFoamGrower(OPT);
  for (let i = 0; i < ITERS; i++) g2.step();
  let same = true;
  for (let i = 0; i < g.state.cond.length; i++) if (g.state.cond[i] !== g2.state.cond[i]) { same = false; break; }
  ok(same, 'the stepwise growth is deterministic (identical conductance state)');
}

// ── finalize: grow-then-settle — the city reassembles around the emergent streets ──
const city = g.finalize();
{
  const e = city.emergent;
  ok(e.chambers > 50 && e.chambers < g.nav.n * 0.2, 'the grown right-of-way is a proper superlevel set (' + e.chambers + ' chambers)');
  ok([...city.rightOfWay].every((c) => city.chamberOwner[c] === -1), 'no building owns a grown right-of-way chamber (the city yields)');
  // THE CLIMB EMERGES: no imposed corkscrew, yet the network threads most of the shell depth
  ok(e.radialSpanFrac > 0.8, 'THE CLIMB EMERGES — the grown network threads ' + (e.radialSpanFrac * 100).toFixed(0) + '% of the shell depth from demand alone');
  ok(e.rampSegs > 20, 'real ramp segments exist (' + e.rampSegs + ' climbing edges in the network)');
  ok(e.levelSegs > e.rampSegs * 0.3, 'level streets coexist with the climbs (not a pure elevator)');
  // the grown row is one connected component on the routing graph
  let start = -1; for (let i = 0; i < g.nav.n; i++) if (city.rightOfWay.has(i)) { start = i; break; }
  const seen = new Set([start]), q = [start];
  while (q.length) { const u = q.pop(); for (const [v] of g.graph.adj[u]) if (city.rightOfWay.has(v) && !seen.has(v)) { seen.add(v); q.push(v); } }
  ok(seen.size === city.rightOfWay.size, 'the grown street network is a single connected component');
  // the downstream city is whole: supply closes, frontage forms, access is measured
  ok(city.closure > 0.9, 'the supply web closes over the grown streets (' + (city.closure * 100).toFixed(0) + '%)');
  ok(city.places.some((p) => p.onRoad), 'buildings front the grown streets');
  ok(city.access >= 0 && city.access <= 1 && isFinite(city.accessMedianCost), 'access is measured over the grown network');
  ok(e.tier.some((t) => t === 3) && e.tier.some((t) => t === 1), 'the grown network has a hierarchy (arterials AND footpaths)');
}

// ── the society + oracle run over the grown city unchanged ──
{
  const s = buildSociety(city, { seed: OPT.seed });
  const v = scoreFoamSociety(city, scoreSociety(city, s, socialMetrics(city, s)));
  ok(s.people.length > 300 && v.vitality > 0 && typeof v.tier === 'string', 'the grown city carries a scored society (' + v.vitality + ' ' + v.tier + ')');
}

// ── grown ≠ certified: a genuinely different (emergent) network on the same seed ──
{
  const cert = buildFoamCity(OPT);
  ok(cert.route !== null && city.route === null, 'certified carries wayfind\'s route; grown carries none (it grew its own)');
  ok(cert.rightOfWay.size !== city.rightOfWay.size, 'the grown right-of-way differs from the imposed corkscrew (' + city.rightOfWay.size + ' vs ' + cert.rightOfWay.size + ')');
}

console.log(`foamroads.selftest: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

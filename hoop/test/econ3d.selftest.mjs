// econ3d.selftest.mjs — pins the FOAM SOCIETY kernel (hoop/econ/society3d.js): the econ genome run
// over rind's actual 3D chamber foam, infrastructure-first. Run: node hoop/test/econ3d.selftest.mjs
import { buildFoamCity, scoreFoamSociety, ACCESS_BASKET } from '../econ/society3d.js';
import { buildSociety, socialMetrics, scoreSociety, rollGenome, ROLES } from '../econ/econ.js';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error('  ✗ ' + m); } };

// one small sector shared by most checks (≈11k chambers — fast enough to build twice)
const OPT = { arcDeg: 6, axial: 10, seed: 1 };
const city = buildFoamCity(OPT);

// ── the foam city assembles, chamber-indexed ──
{
  ok(city.chambers.length > 8000, 'a dense chamber foam (got ' + city.chambers.length + ')');
  ok(city.places.length > 500 && city.places.length < city.chambers.length / 4, 'chambers agglomerate into far fewer buildings');
  ok(city.places.every((p) => p.footprint >= 1 && p.cells.length === p.footprint), 'every building is a clump of chambers (footprint = chamber count)');
  ok(city.places.every((p) => p.door >= 0 && p.cells.includes(p.door)), 'every building has a door chamber among its own');
  // chamberOwner is a complete partition: building id, -1 right-of-way, or -2 void
  let owned = 0, roadCh = 0, voids = 0;
  for (let i = 0; i < city.chambers.length; i++) { const o = city.chamberOwner[i]; if (o >= 0) owned++; else if (o === -1) roadCh++; else voids++; }
  ok(owned + roadCh + voids === city.chambers.length, 'chamberOwner labels every chamber (building / road / void)');
  ok(owned === city.places.reduce((s, p) => s + p.footprint, 0), 'owned chambers sum to the footprints');
}

// ── INFRASTRUCTURE FIRST: the certified route is carved out before anything is built ──
{
  ok(city.route !== null, 'wayfind found the certified ramps + roads on this seed');
  ok(city.rightOfWay.size > 100, 'the route chains reserve a real right-of-way (' + city.rightOfWay.size + ' chambers)');
  ok([...city.rightOfWay].every((c) => city.chamberOwner[c] === -1), 'no building owns a right-of-way chamber (the city yields)');
  ok(city.route.A.turns > 3 && city.route.roads.length >= 1, 'a full-depth corkscrew + at least one azimuthal road');
  ok(city.places.some((p) => p.onRoad), 'some buildings front the right-of-way (door on the road)');
}

// ── buildings are CONNECTED clumps in the chamber graph ──
{
  const adj = new Map();
  for (let i = 0; i < city.chambers.length; i++) adj.set(i, []);
  for (let i = 0; i < city.chambers.length; i++) for (const [v] of city.adjC[i]) adj.get(i).push(v);
  let allConn = true;
  for (const p of city.places.slice(0, 120)) {                  // sample — checking all 1.4k is slow
    const inB = new Set(p.cells), seen = new Set([p.cells[0]]), q = [p.cells[0]];
    while (q.length) { const u = q.pop(); for (const v of adj.get(u)) if (inB.has(v) && !seen.has(v)) { seen.add(v); q.push(v); } }
    if (seen.size !== p.cells.length) { allConn = false; break; }
  }
  ok(allConn, 'every building is a connected clump of chambers (sampled)');
}

// ── SUPPLY MOVES ON ROADS: valid wiring, high closure, and the anisotropy genuinely bites ──
{
  const byId = new Map(city.places.map((p) => [p.id, p]));
  ok(city.edges.every((e) => byId.get(e.from).in.includes(e.r) && byId.get(e.to).out.includes(e.r)), 'every supply edge wires a real in→out for that resource');
  ok(city.edges.every((e) => e.from !== e.to), 'no place supplies itself (the 2-label Dijkstra skips self)');
  ok(city.closure > 0.9, 'the road-wired supply web closes (' + (city.closure * 100).toFixed(0) + '%)');
  ok(city.edges.every((e) => isFinite(e.cost) && e.cost >= 0), 'every supply edge carries its road cost');
  // anisotropy: at least a fifth of assignments differ from the crow-flight nearest producer
  const pos = (p) => { const r = 250 + p.rad; return [r * Math.cos(p.th), r * Math.sin(p.th), p.zax]; };
  let differ = 0, checked = 0;
  for (const e of city.edges) {
    const pl = byId.get(e.from), prods = city.byRes.get(e.r);
    if (!prods || prods.length < 2) continue;
    checked++;
    const P = pos(pl); let best = null, bd = Infinity;
    for (const q of prods) { if (q.id === pl.id) continue; const Q = pos(q), d = (Q[0] - P[0]) ** 2 + (Q[1] - P[1]) ** 2 + (Q[2] - P[2]) ** 2; if (d < bd) { bd = d; best = q.id; } }
    if (best !== null && best !== e.to) differ++;
  }
  ok(checked > 100 && differ / checked > 0.2, 'road distance restructures the economy vs crow-flight (' + (100 * differ / checked).toFixed(0) + '% of edges differ)');
}

// ── ACCESS: the oracle learns geography ──
{
  ok(city.access >= 0 && city.access <= 1, 'access is a 0..1 signal');
  ok(isFinite(city.accessMedianCost), 'the median dwelling→basket road cost is measured');
  ok(ACCESS_BASKET.every((r) => ROLES[r]), 'the access basket is made of real roles');
  // a city with NO right-of-way discount (vert climbing everywhere, roads ignored) has worse access
  const noRoads = buildFoamCity({ ...OPT, roadDiscount: 1.0, vert: 12 });
  ok(noRoads.accessMedianCost > city.accessMedianCost, 'cheap drivable decks improve access (' + city.accessMedianCost.toFixed(1) + ' < ' + noRoads.accessMedianCost.toFixed(1) + ') — the roads matter');
}

// ── the econ society runs over the foam city UNCHANGED, and the blended oracle scores it ──
{
  const s = buildSociety(city, { seed: 1 });
  ok(s.people.length > 300 && s.avgHats > 1.5, 'a multiplex society forms over the foam (' + s.people.length + ' people, ' + s.avgHats.toFixed(2) + ' hats)');
  const m = socialMetrics(city, s);
  const base = scoreSociety(city, s, m);
  const v = scoreFoamSociety(city, base);
  ok(v.vitality >= 0 && v.vitality <= 100 && typeof v.tier === 'string', 'the foam society gets a blended vitality + tier');
  ok(v.signals.access === city.access, 'access joins the oracle signals');
  // genomes steer the foam city too
  const g = rollGenome(7);
  const cg = buildFoamCity({ ...OPT, genome: g });
  ok(cg.places.length !== city.places.length || cg.counts.dwell !== city.counts.dwell, 'the genome steers what gets built in the foam');
}

// ── determinism (the permalink contract) ──
{
  const a = buildFoamCity(OPT);
  ok(a.places.length === city.places.length && a.closure === city.closure && a.access === city.access
    && a.rightOfWay.size === city.rightOfWay.size, 'buildFoamCity is deterministic for a given seed');
  const b = buildFoamCity({ ...OPT, seed: 2 });
  ok(b.places.length !== city.places.length || b.closure !== city.closure || b.rightOfWay.size !== city.rightOfWay.size, 'a different seed builds a different city');
}

console.log(`econ3d.selftest: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

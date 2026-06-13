// econ.selftest.mjs — pins the economy-as-ecosystem kernel (hoop/econ/econ.js).
// Run: node hoop/test/econ.selftest.mjs
import { buildField, buildWorld, buildSociety, socialMetrics, removeImpact, scoreSociety, vitalityTier, rollGenome, route, makePlace, ROLES, ROLE_MIX, DOMAINS, DEFAULT_GENOME, FOOTPRINT, ARCHETYPES } from '../econ/econ.js';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error('  ✗ ' + m); } };

// ── flows are well-formed and role-correct ──
{
  const baker = makePlace(0, 'make', DOMAINS[0]); // make × grain
  ok(baker.in.includes('grain') && baker.out.includes('bread'), 'make×grain takes grain → bread');
  const farm = makePlace(1, 'grow', DOMAINS[0]);
  ok(farm.in.length === 0 && farm.out.includes('grain'), 'grow×grain produces the raw (grain), needs nothing');
  const home = makePlace(2, 'dwell');
  ok(home.out.includes('people') && home.in.includes('regard'), 'a dwelling outputs people and wants regard (the post-scarcity tell)');
  ok(home.domain === null && baker.domain === 'grain', 'domain roles carry a domain, non-domain roles do not');
  ok(Object.values(ROLES).every((R) => typeof R.flows === 'function' && R.color && R.glyph), 'every role has flows, a colour and a glyph');
}

// ── a field builds: places, cells, the supply web ──
{
  const f = buildField({ W: 1200, H: 800, count: 1500, seed: 5 });
  ok(f.places.length > 1000, 'a big field of places');
  ok(f.cells.length === f.places.length && f.cells.every((c) => c.poly.length >= 3), 'one valid Voronoi cell per place');
  ok(f.edges.length > 0, 'the supply web has edges (each in → nearest out)');
  ok(f.closure >= 0 && f.closure <= 1, 'closure is a fraction of needs supplied');
  ok(f.closure > 0.8, 'most needs find a nearby supplier (the web largely closes, got ' + (f.closure * 100).toFixed(0) + '%)');
  // every edge connects a consumer of r to a producer of r
  const byId = new Map(f.places.map((p) => [p.id, p]));
  ok(f.edges.every((e) => byId.get(e.from).in.includes(e.r) && byId.get(e.to).out.includes(e.r)), 'every supply edge wires a real in→out for that resource');
}

// ── the program: dwellings dominate, civic is rare ──
{
  const f = buildField({ W: 1200, H: 800, count: 2000, seed: 2 });
  ok(f.counts.dwell > f.counts.make, 'dwellings are the most common place');
  ok((f.counts.govern || 0) < f.counts.dwell, 'civic anchors (govern) are rare');
  ok(Math.abs(ROLE_MIX.reduce((s, m) => s + m[1], 0) - 100) < 2, 'the role mix is ~100%');
}

// ── determinism ──
{
  const a = buildField({ W: 800, H: 600, count: 900, seed: 9 });
  const b = buildField({ W: 800, H: 600, count: 900, seed: 9 });
  ok(a.places.length === b.places.length && a.edges.length === b.edges.length && a.closure === b.closure, 'buildField is deterministic for a given seed');
  const c = buildField({ W: 800, H: 600, count: 900, seed: 10 });
  ok(c.places.length !== a.places.length || c.places[0].role !== a.places[0].role || c.closure !== a.closure, 'a different seed gives a different economy');
}

// ── PEOPLE WEAR MANY HATS — interaction thickness ──
{
  const f = buildField({ W: 1200, H: 800, count: 1500, seed: 5 });
  const s = buildSociety(f, { hh: 3, seed: 5 });
  ok(s.people.length > 100, 'a society of people forms over the dwellings');
  ok(s.people.every((p) => p.hats.length >= 1 && p.home != null && p.name), 'every person has a home, a name and at least one hat');
  ok(s.avgHats > 1.6, 'the average person wears several hats (multiplexity, got ' + s.avgHats.toFixed(2) + ')');
  ok(s.thirdsFrac > 0 && s.thirdsFrac < 1, 'a fraction keep a "third place" (worship/club/sport) — the social-capital tell');
  // a Jim exists: someone with work + garden + a third place (≥3 hats)
  ok(s.people.some((p) => p.hats.length >= 3 && p.hats.some((h) => h.kind === 'work') && p.hats.some((h) => h.kind === 'home garden')), 'a "Jim" exists — work + home garden + more');
  // every affiliation points at a real place
  const ids = new Set(f.places.map((p) => p.id));
  ok(s.people.every((p) => p.hats.every((h) => ids.has(h.place))), 'every hat references a real place');
  // thickness ⇒ shared membership: third places have multiple members (overlap, not atomised)
  const shared = [...s.placeMembers.values()].filter((m) => m.length >= 2).length;
  ok(shared > 0, 'places gather overlapping memberships (the fabric weaves)');
}

// ── WEAK TIES vs BONDS — bridging + the two-web shock ──
{
  const f = buildField({ W: 1200, H: 800, count: 1500, seed: 5 });
  const s = buildSociety(f, { seed: 5 });
  const m = socialMetrics(f, s);
  ok(m.avgReach > 0, 'the average person reaches others through their hats (global thickness)');
  ok([...m.bridging.values()].every((b) => b.bridging >= 0 && b.bridging <= 1), 'bridging is a fraction per place');
  ok([...m.bridging.values()].some((b) => b.members >= 2 && b.bridging > 0.5), 'some places are real bridges (introduce otherwise-unconnected people)');
  ok(!m.bridging.has(s.people[0].home) || f.places.find((p) => p.id === s.people[0].home).role !== 'dwell', 'homes are not scored for bridging (they are bonds)');
  // the shock: remove the busiest social place — both webs feel it
  let busiest = null, bm = -1; for (const [pid, mem] of s.placeMembers) { const pl = f.places.find((p) => p.id === pid); if (pl && pl.role !== 'dwell' && mem.length > bm) { bm = mem.length; busiest = pid; } }
  const imp = removeImpact(f, s, m, busiest);
  ok(imp.members > 0, 'removing a hub strikes the people who met there');
  ok(imp.ties >= 0 && imp.orphaned >= 0 && imp.needsAtRisk >= 0 && imp.rerouted >= 0, 'the shock reports both cascades (ties broken / orphaned · needs at risk / rerouted)');
  ok(imp.ties + imp.rerouted + imp.needsAtRisk + imp.orphaned > 0, 'removing a hub actually costs something');
}

// ── society + metrics are deterministic ──
{
  const f = buildField({ W: 800, H: 600, count: 900, seed: 7 });
  const a = buildSociety(f, { seed: 7 }), b = buildSociety(f, { seed: 7 });
  ok(a.people.length === b.people.length && a.affiliations === b.affiliations && a.avgHats === b.avgHats, 'buildSociety is deterministic');
  ok(socialMetrics(f, a).avgReach === socialMetrics(f, b).avgReach, 'socialMetrics is deterministic');
}

// ── BUILDINGS AS CLUMPS OF CELLS — function → size → footprint ──
{
  const w = buildWorld({ W: 1400, H: 900, cells: 8000, seed: 5 });
  ok(w.cells.length > 6000, 'a fine cell substrate (many cells)');
  ok(w.places.length > 200 && w.places.length < w.cells.length, 'cells agglomerate up into far fewer buildings');
  ok(w.cells.length > w.places.length * 3, 'far more cells than buildings (buildings are clumps)');
  ok(w.places.every((p) => p.footprint >= 1 && Array.isArray(p.cells) && p.cells.length === p.footprint), 'every building owns a clump of cells (footprint = cell count)');
  // every cell belongs to exactly one building (a partition)
  const owned = w.places.reduce((s, p) => s + p.footprint, 0);
  ok(owned === w.cells.filter((c) => c.building >= 0).length, 'the cell→building map is a partition (cells sum to footprints)');
  ok(w.closure > 0.8, 'the supply web over buildings largely closes (got ' + (w.closure * 100).toFixed(0) + '%)');

  // FUNCTION SETS SIZE: civic anchors are big, dwellings are small — the right ordering, and tracking the targets
  const avgFp = {}; for (const role of Object.keys(ROLES)) { const a = w.places.filter((p) => p.role === role).map((p) => p.footprint); if (a.length) avgFp[role] = a.reduce((s, x) => s + x, 0) / a.length; }
  ok(avgFp.govern > avgFp.dwell * 3, 'a council hall is many times a dwelling (function → size)');
  ok(avgFp.heal > avgFp.make && avgFp.learn > avgFp.make, 'civic buildings (hospital, school) dwarf a workshop');
  ok(avgFp.dwell >= 2, 'a dwelling is still a real clump of cells, not a single cell (got ' + avgFp.dwell.toFixed(1) + ')');
  // footprints track the genome targets (within the graph-Voronoi tolerance)
  ok(Math.abs(avgFp.dwell - FOOTPRINT.dwell) < 3 && Math.abs(avgFp.worship - FOOTPRINT.worship) < 8, 'footprints track the FOOTPRINT targets');
}

// ── PATHING: the building-adjacency graph routes building → building ──
{
  const w = buildWorld({ W: 1200, H: 800, cells: 6000, seed: 3 });
  ok(w.adj.size > 0 && w.paths.length >= w.places.length - 1, 'a path network spans the buildings (≥ buildings − 1 trunk edges)');
  // the trunk paths connect every building into one component
  const par = Array.from({ length: w.places.length }, (_, i) => i), find = (x) => { while (par[x] !== x) { par[x] = par[par[x]]; x = par[x]; } return x; };
  for (const e of w.paths) par[find(e.a)] = find(e.b);
  ok(new Set(w.places.map((p) => p.id)).size && new Set(w.places.map((p) => find(p.id))).size === 1, 'the trunk path network connects every building (one component)');
  const r = route(w, 0, w.places.length - 1);
  ok(Array.isArray(r) && r[0] === 0 && r[r.length - 1] === w.places.length - 1, 'route() returns a building→building path (home to clinic)');
  ok(r.every((id, i) => i === 0 || w.adj.get(r[i - 1]).includes(id)), 'every step in the route crosses a real adjacency (mechanically walkable)');
}

// ── THE SOCIAL GENOME — a seed breeds a whole society, deterministically ──
{
  ok(Object.keys(DEFAULT_GENOME.roleMix).length === Object.keys(ROLES).length || DEFAULT_GENOME.roleMix.dwell, 'the wild-type genome carries the programme (role mix)');
  ok(DEFAULT_GENOME.footprint.govern > DEFAULT_GENOME.footprint.dwell, 'the genome encodes building size by function');
  const g1 = rollGenome(42), g2 = rollGenome(42), g3 = rollGenome(99);
  ok(JSON.stringify(g1) === JSON.stringify(g2), 'rollGenome is deterministic for a given roll number');
  ok(JSON.stringify(g1) !== JSON.stringify(g3), 'a different roll breeds a different genome');
  ok(g1.roleMix.dwell >= 1 && g1.footprint.dwell >= 1 && g1.household.mean >= 1, 'a rolled genome stays in sane bounds');
  // the genome actually steers the world: a roll with a different programme builds a different town
  const wA = buildWorld({ W: 1000, H: 700, cells: 5000, seed: 7 });
  const wB = buildWorld({ W: 1000, H: 700, cells: 5000, seed: 7, genome: g3 });
  ok(wA.places.length !== wB.places.length || wA.counts.dwell !== wB.counts.dwell, 'the genome steers what gets built (a roll changes the town)');
  // world generation is deterministic from (genome, seed)
  const wC = buildWorld({ W: 1000, H: 700, cells: 5000, seed: 7, genome: g3 });
  ok(wB.places.length === wC.places.length && wB.closure === wC.closure, 'buildWorld is deterministic from (genome, seed)');
}

// ── THE VITALITY ORACLE — score a society, the thing we test the genome against ──
{
  const w = buildWorld({ W: 1400, H: 900, cells: 8000, seed: 5 });
  const s = buildSociety(w, { seed: 5 });
  const m = socialMetrics(w, s);
  const sc = scoreSociety(w, s, m);
  ok(sc.vitality >= 0 && sc.vitality <= 100, 'vitality is a 0..100 score');
  ok(['Thriving', 'Healthy', 'Stable', 'Fragile', 'Failing'].includes(sc.tier), 'a society gets a vitality tier');
  ok(sc.tier === vitalityTier(sc.vitality), 'the tier matches the score');
  ok(Object.values(sc.signals).every((v) => v >= 0 && v <= 1), 'every viability sub-signal is a 0..1 fraction');
  ok(typeof sc.headline === 'string' && sc.headline.length > 0, 'the oracle writes a headline verdict');
  ok(sc.vitality > 55, 'a well-formed default town scores at least Stable (got ' + sc.vitality + ' ' + sc.tier + ')');
  // determinism
  const sc2 = scoreSociety(w, buildSociety(w, { seed: 5 }), socialMetrics(w, s));
  ok(sc.vitality === sc2.vitality, 'scoreSociety is deterministic');
  // an ATOMISED society (no third places, no bridges) scores worse than the rich default — the oracle has teeth
  const thin = rollGenome(1, { ...DEFAULT_GENOME, affinity: { garden: 0.05, worship: 0.02, club: 0.02, sport: 0.0, bridge: 0.0, workTries: 6 } });
  const ws = buildWorld({ W: 1400, H: 900, cells: 8000, seed: 5 });
  const ss = buildSociety(ws, { seed: 5, genome: { ...DEFAULT_GENOME, affinity: { garden: 0.05, worship: 0.02, club: 0.02, sport: 0.0, bridge: 0.0, workTries: 6 } } });
  const scThin = scoreSociety(ws, ss, socialMetrics(ws, ss));
  ok(scThin.vitality < sc.vitality, 'a thin, atomised society scores worse than the rich default (oracle discriminates: ' + scThin.vitality + ' < ' + sc.vitality + ')');
}

// ── ARCHETYPES — the genome expresses different societies, and the oracle ranks them ──
{
  ok(ARCHETYPES.some((a) => a.id === 'dormitory') && ARCHETYPES.some((a) => a.id === 'commons'), 'the genome carries society archetypes (dormitory … commons)');
  const rollArc = (id) => { for (let n = 1; n < 5000; n++) { const g = rollGenome(n); if (g.archetype === id) return g; } return null; };
  const gC = rollArc('commons'), gD = rollArc('dormitory');
  ok(gC && gD, 'both a commons and a dormitory genome are reachable by rolling');
  const score = (g) => { const w = buildWorld({ W: 1300, H: 850, cells: 7000, seed: 5, genome: g }); const s = buildSociety(w, { seed: 5, genome: g }); return scoreSociety(w, s, socialMetrics(w, s)); };
  // a commons (rich third places + bridges) out-scores a dormitory (starved third places) — the gradient is real
  ok(score(gC).vitality > score(gD).vitality, 'a commons out-scores a dormitory (the oracle ranks society types: ' + score(gC).vitality + ' > ' + score(gD).vitality + ')');
  // the dormitory really does have a thinner social fabric (fewer third-placers)
  const wD = buildWorld({ W: 1300, H: 850, cells: 7000, seed: 5, genome: gD });
  const wC = buildWorld({ W: 1300, H: 850, cells: 7000, seed: 5, genome: gC });
  ok(buildSociety(wD, { seed: 5, genome: gD }).thirdsFrac < buildSociety(wC, { seed: 5, genome: gC }).thirdsFrac, 'a dormitory keeps fewer third places than a commons (the archetype bites)');
}

console.log(`econ.selftest: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

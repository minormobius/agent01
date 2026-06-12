// econ.selftest.mjs — pins the economy-as-ecosystem kernel (hoop/econ/econ.js).
// Run: node hoop/test/econ.selftest.mjs
import { buildField, buildSociety, socialMetrics, removeImpact, makePlace, ROLES, ROLE_MIX, DOMAINS } from '../econ/econ.js';

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

console.log(`econ.selftest: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

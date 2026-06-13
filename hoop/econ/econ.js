// econ.js — "economies as ecosystems": the ideation kernel behind /econ.
//
// The bet: a place is the economic cousin of a biome species. A species has a guild + a diet
// (who-eats-whom → trophic edges); a place has a ROLE (a verb) + a DOMAIN (the matter) + FLOWS
// (what it takes in, what it puts out → supply edges). Scatter a big field of places, wire each
// place's `in` to its nearest supplier's `out`, and you get a supply web you can read like a food
// web — does it CLOSE (is every need supplied near enough?), where are the gaps, who's a keystone.
//
// Post-scarcity-but-not: the closed loop (biome calories, tide energy) meets the NEEDS, so the
// interesting economy floats above — craft, trade, service, play — whose real output is `regard`
// (the ATProto economy of esteem hoop already runs). This is v1, deliberately coarse: a starter
// taxonomy + flows, brutalist to render. Pure + deterministic; reuses paint's voronoi primitives.

import { clipCell, bucketGrid, jitterGrid, mulberry32, adjacency, assignZones } from '../paint/voronoi.js';

// domains pair a raw with the good a `make` turns it into — the open lexicon ("a million merchants")
export const DOMAINS = [
  { id: 'grain', raw: 'grain', good: 'bread' }, { id: 'fiber', raw: 'fiber', good: 'cloth' },
  { id: 'metal', raw: 'ore', good: 'tools' }, { id: 'wood', raw: 'timber', good: 'furniture' },
  { id: 'glass', raw: 'sand', good: 'glass' }, { id: 'brew', raw: 'must', good: 'brew' },
  { id: 'clay', raw: 'clay', good: 'pottery' }, { id: 'oil', raw: 'seed', good: 'oil' },
  { id: 'paper', raw: 'pulp', good: 'paper' }, { id: 'spice', raw: 'herb', good: 'spice' },
];

// roles = the verbs of place (small, closed). color is a flat brutalist land-use hue. dom=true ⇒
// the role is parameterised by a domain. flows(domain) → { in, out } resource tokens.
export const ROLES = {
  dwell:   { glyph: '⌂', color: '#d9b24a', tier: 1, dom: false, flows: () => ({ in: ['bread', 'cloth', 'regard'], out: ['people'] }) },
  grow:    { glyph: '❀', color: '#5aa845', tier: 1, dom: true,  flows: (d) => ({ in: [], out: [d.raw] }) },
  make:    { glyph: '⚒', color: '#e0772f', tier: 1, dom: true,  flows: (d) => ({ in: [d.raw], out: [d.good] }) },
  mend:    { glyph: '⚙', color: '#9b6b3a', tier: 1, dom: true,  flows: (d) => ({ in: [d.good], out: [d.good] }) },
  trade:   { glyph: '⇄', color: '#cf3b3b', tier: 1, dom: true,  flows: (d) => ({ in: [d.good], out: [d.good] }) },
  serve:   { glyph: '☕', color: '#c853a0', tier: 1, dom: true,  flows: (d) => ({ in: [d.good, 'people'], out: ['regard'] }) },
  play:    { glyph: '◍', color: '#3bb0c9', tier: 2, dom: false, flows: () => ({ in: ['people'], out: ['regard'] }) },
  heal:    { glyph: '✚', color: '#dfe7e2', tier: 2, dom: false, flows: () => ({ in: ['people', 'cloth'], out: ['care'] }) },
  learn:   { glyph: '❍', color: '#5570d8', tier: 2, dom: false, flows: () => ({ in: ['people', 'paper'], out: ['lore'] }) },
  worship: { glyph: '☥', color: '#b39bd8', tier: 2, dom: false, flows: () => ({ in: ['people'], out: ['regard'] }) },
  govern:  { glyph: '⛬', color: '#33408f', tier: 3, dom: false, flows: () => ({ in: ['regard'], out: ['order'] }) },
  move:    { glyph: '↕', color: '#6b7a82', tier: 3, dom: false, flows: () => ({ in: [], out: ['transit'] }) },
  store:   { glyph: '▣', color: '#566066', tier: 2, dom: true,  flows: (d) => ({ in: [d.good], out: [d.good] }) },
};
// the town's "program" — a weighted mix (mostly dwellings, a working middle, a few civic anchors)
export const ROLE_MIX = [['dwell', 46], ['make', 12], ['trade', 9], ['grow', 7], ['serve', 6], ['mend', 4], ['play', 4], ['store', 3], ['learn', 3], ['heal', 2], ['worship', 1], ['govern', 1], ['move', 2]];

export function makePlace(id, roleId, domain) {
  const R = ROLES[roleId], f = R.flows(domain || DOMAINS[0]);
  return { id, role: roleId, domain: R.dom ? domain.id : null, tier: R.tier, glyph: R.glyph, color: R.color, in: f.in, out: f.out };
}
function pickRole(rng) { const tot = ROLE_MIX.reduce((s, m) => s + m[1], 0); let r = rng() * tot; for (const [k, w] of ROLE_MIX) { r -= w; if (r <= 0) return k; } return 'dwell'; }

// Build a big field of places, their Voronoi cells, and the supply web (each `in` → nearest `out`).
export function buildField({ W, H, count, seed = 1 }) {
  const rng = mulberry32(seed >>> 0);
  const spacing = Math.max(5, Math.sqrt((W * H) / Math.max(1, count)));
  const places = jitterGrid(W, H, spacing, 0.6, rng).map((p, i) => {
    const role = pickRole(rng), dom = ROLES[role].dom ? DOMAINS[Math.floor(rng() * DOMAINS.length)] : null;
    const pl = makePlace(i, role, dom); pl.x = p.x; pl.y = p.y; return pl;
  });
  // Voronoi cells (brutalist: flat polygons)
  const grid = bucketGrid(places, spacing * 1.8);
  const cells = places.map((pl) => ({ id: pl.id, role: pl.role, domain: pl.domain, tier: pl.tier, color: pl.color, x: pl.x, y: pl.y, poly: clipCell(pl, grid.near(pl.x, pl.y), spacing * 3) }));

  // supply web: per-resource grid of the places that OUTPUT it, then each `in` links to its nearest
  const byRes = new Map();
  for (const pl of places) for (const r of pl.out) { let a = byRes.get(r); if (!a) { a = []; byRes.set(r, a); } a.push(pl); }
  const outGrid = new Map(); for (const [r, list] of byRes) outGrid.set(r, bucketGrid(list, spacing * 4.5));
  const edges = []; let need = 0, met = 0;
  for (const pl of places) for (const r of [...new Set(pl.in)]) {
    need++;
    const g = outGrid.get(r); if (!g) continue;
    let best = null, bd = Infinity;
    for (const q of g.near(pl.x, pl.y)) { if (q.id === pl.id) continue; const d = (q.x - pl.x) ** 2 + (q.y - pl.y) ** 2; if (d < bd) { bd = d; best = q; } }
    if (best) { met++; edges.push({ from: pl.id, to: best.id, r, fx: pl.x, fy: pl.y, tx: best.x, ty: best.y }); }
  }
  const counts = {}; for (const pl of places) counts[pl.role] = (counts[pl.role] || 0) + 1;
  return { W, H, spacing, places, cells, edges, counts, byRes, need, met, closure: need ? met / need : 1 };
}

// ── THE SOCIAL GENOME — the heritable DNA a seed rolls a whole society from ──────────────────
// biome has a deck (catalog.json) + an assembler (rollDesign) + an oracle (evaluateRoll); a roll
// number breeds an ecosystem you can SCORE. The economic cousin is a *genome*: the small bundle of
// parameters that, given a seed, breeds a whole town — its program (what to build, in what mix), its
// building SIZES by function, its households, and the propensities that decide who affiliates with
// what. DEFAULT_GENOME is the wild type (it reproduces the hand-tuned ROLE_MIX); rollGenome(n)
// mutates it deterministically — the "pull". Everything downstream (buildWorld, buildSociety) reads
// the genome, so a society is fully determined by (genome, seed) and is therefore atproto-stable.
//
// FOOTPRINT is the load-bearing new axis: a building is a CLUMP of cells, and its function sets how
// many — a dwelling is a few cells, a parish a couple dozen, a hospital or a council hall a big
// block. The world has far more cells than people (rooms, yards, corridors), so cells agglomerate
// up into sized buildings, and people sit sparsely on top of the dwellings.
export const FOOTPRINT = {            // target cells per building, by role (≈ floor area / programme)
  dwell: 4, grow: 9, make: 7, mend: 5, trade: 6, serve: 5, play: 14,
  heal: 40, learn: 22, worship: 18, govern: 46, move: 3, store: 13,
};
export const DEFAULT_GENOME = {
  roleMix: Object.fromEntries(ROLE_MIX),                 // the programme — wild type = the hand-tuned mix
  footprint: { ...FOOTPRINT },                           // building size by function (cells/building)
  household: { mean: 3, spread: 2 },                     // people per dwelling ≈ 1..(2·mean+spread)
  affinity: { garden: 0.45, worship: 0.55, club: 0.45, sport: 0.30, bridge: 0.22, workTries: 6 },
  domains: DOMAINS.length,                               // how wide the matter-lexicon is in play
};

// SOCIETY ARCHETYPES — the correlated end of the genome. Independent jitter is mean-preserving, so a
// town stays healthy under noise (a real finding: the multiplex web is robust); to breed genuinely
// different societies you have to pull whole *bundles* of genes together. Each archetype is a set of
// correlated multipliers on sociability + the programme — a dormitory suburb starves its third places,
// a commons doubles down on them, a company town is work-centric. This is what gives the oracle a
// distribution to score: a dormitory lands Fragile, a commons Thriving.
export const ARCHETYPES = [
  { id: 'balanced',  w: 4, aff: {}, mix: {} },
  { id: 'dormitory', w: 2, aff: { worship: 0.30, club: 0.30, sport: 0.25, bridge: 0.30 }, mix: { dwell: 1.3, learn: 0.5, worship: 0.4, play: 0.5 } },
  { id: 'company',   w: 2, aff: { garden: 0.5, worship: 0.5, club: 0.6, bridge: 0.4 }, mix: { make: 1.7, trade: 1.4, store: 1.4, learn: 0.5, worship: 0.4, play: 0.5 } },
  { id: 'commons',   w: 2, aff: { worship: 1.3, club: 1.5, sport: 1.4, bridge: 1.6 }, mix: { learn: 1.6, serve: 1.5, play: 1.6, worship: 1.5 } },
];

// roll a genome: fork a seed, pick an archetype, then nudge each gene inside sane bounds — the
// deterministic "pull". The programme drifts (which trades dominate), buildings swell or shrink,
// households and sociability vary, and the archetype pulls correlated bundles so the town has a soul.
export function rollGenome(n, base = DEFAULT_GENOME) {
  const rng = mulberry32((((n >>> 0) ^ 0x9e3779b9) >>> 0) || 1);
  const jit = (v, frac, lo, hi) => Math.max(lo, Math.min(hi, v * (1 + (rng() - 0.5) * 2 * frac)));
  let arc = ARCHETYPES[0], r = rng() * ARCHETYPES.reduce((s, a) => s + a.w, 0);
  for (const a of ARCHETYPES) { r -= a.w; if (r <= 0) { arc = a; break; } }
  const roleMix = {}; for (const k in base.roleMix) roleMix[k] = Math.max(1, Math.round(jit(base.roleMix[k], 0.5, 1, 200) * (arc.mix[k] || 1)));
  const footprint = {}; for (const k in base.footprint) footprint[k] = Math.max(1, Math.round(jit(base.footprint[k], 0.4, 1, 120)));
  const affinity = {}; for (const k in base.affinity) affinity[k] = k === 'workTries' ? Math.round(jit(base.affinity[k], 0.4, 2, 12)) : Math.max(0, Math.min(0.95, jit(base.affinity[k], 0.4, 0, 0.95) * (arc.aff[k] || 1)));
  return {
    n, archetype: arc.id, roleMix, footprint, affinity,
    household: { mean: Math.round(jit(base.household.mean, 0.45, 1, 7)), spread: Math.round(jit(base.household.spread, 0.6, 0, 5)) },
    domains: base.domains,
  };
}
function pickRoleG(rng, genome) {
  const ent = Object.entries(genome.roleMix), tot = ent.reduce((s, [, w]) => s + w, 0);
  let r = rng() * tot; for (const [k, w] of ent) { r -= w; if (r <= 0) return k; } return 'dwell';
}

// ── BUILDINGS AS CLUMPS OF CELLS — function → size → footprint, mapped for pathing ───────────────
// Scatter a FINE cell field (many cells), then agglomerate cells into BUILDINGS sized by function:
// a weighted programme of buildings (role × domain × footprint target) is laid down until the
// footprints fill the cells, and paint's graph-Voronoi (assignZones) grows each building a connected
// clump of cells whose size ∝ its footprint weight. The result: a coarse layer of sized buildings on
// a fine substrate of cells, with a building-adjacency graph + spanning-tree PATH network so an agent
// can route building→building (and the member cells give the fine floor for in-building pathing).
// Buildings ARE the "places" the supply web and society run over — buildSociety/socialMetrics/
// removeImpact all consume the same shape buildField produces, so they work on a world unchanged.
export function buildWorld({ W, H, cells = 6000, seed = 1, genome = DEFAULT_GENOME }) {
  const rng = mulberry32(seed >>> 0);
  const cellSpacing = Math.max(4, Math.sqrt((W * H) / Math.max(1, cells)));
  // 1. the fine cell substrate: jittered grid → cell Voronoi + cell adjacency (for agglomeration)
  const sites = jitterGrid(W, H, cellSpacing, 0.6, rng).map((p, i) => ({ ...p, id: i }));
  const cellGrid = bucketGrid(sites, cellSpacing * 1.6);
  const cellPolys = sites.map((s) => ({ id: s.id, x: s.x, y: s.y, poly: clipCell(s, cellGrid.near(s.x, s.y), cellSpacing * 3) }));
  const cellAdj = adjacency(cellPolys, sites, cellGrid, cellSpacing * 0.6);
  const N = sites.length;

  // 2. the programme: emit buildings (role, domain, footprint) until the footprints fill the cells
  const program = []; let budget = N;
  while (budget > 0 && program.length < N) {
    const role = pickRoleG(rng, genome);
    const fp = Math.max(1, Math.round(genome.footprint[role] ?? 4));
    const dom = ROLES[role].dom ? DOMAINS[Math.floor(rng() * Math.max(1, Math.min(DOMAINS.length, genome.domains)))] : null;
    program.push({ role, domain: dom, fp }); budget -= fp;
  }
  // 3. graph-Voronoi: grow each building a connected clump of cells, size ∝ footprint. assignZones'
  //    weighted Dijkstra sizes regions SUPER-linearly in weight, so a few big civic seeds would run
  //    away and starve the dwellings; the 0.65 exponent linearises it (footprints then track targets:
  //    dwell≈4, parish≈18, hospital≈40, hall≈46 at ~7 cells/building). Pure function of (genome, seed).
  const buildingOf = assignZones(N, cellAdj, program.map((b) => Math.pow(b.fp, 0.65)), seed >>> 0);
  const members = Array.from({ length: program.length }, () => []);
  for (let i = 0; i < N; i++) { const z = buildingOf[i]; if (z >= 0 && z < members.length) members[z].push(i); }

  // 4. realise the non-empty buildings as PLACES (centroid + true footprint + flows). reindex cleanly.
  const places = [], remap = new Int32Array(program.length).fill(-1);
  for (let z = 0; z < program.length; z++) {
    const mem = members[z]; if (!mem.length) continue;
    let cx = 0, cy = 0; for (const ci of mem) { cx += sites[ci].x; cy += sites[ci].y; }
    const b = program[z], pl = makePlace(places.length, b.role, b.domain);
    pl.x = cx / mem.length; pl.y = cy / mem.length; pl.footprint = mem.length; pl.cells = mem;
    remap[z] = places.length; places.push(pl);
  }
  for (let i = 0; i < N; i++) buildingOf[i] = buildingOf[i] >= 0 ? remap[buildingOf[i]] : -1;
  // tag each cell polygon with its owning building (for rendering the clumps)
  for (const c of cellPolys) c.building = buildingOf[c.id];

  // 5. PATHING: the building-adjacency graph (two buildings touch if any of their cells are
  //    Voronoi-neighbours), then a deterministic spanning tree + spare links → the path network.
  const adjSet = new Map(), addAdj = (a, b) => { if (a === b || a < 0 || b < 0) return; let s = adjSet.get(a); if (!s) { s = new Set(); adjSet.set(a, s); } s.add(b); };
  for (const e of cellAdj) { const a = buildingOf[e.a], b = buildingOf[e.b]; if (a !== b) { addAdj(a, b); addAdj(b, a); } }
  const adj = new Map(); for (const [k, s] of adjSet) adj.set(k, [...s]);
  // spanning tree over the building graph (Kraskal-ish by deterministic edge hash) = the trunk paths
  const bEdges = []; for (const [a, ns] of adjSet) for (const b of ns) if (a < b) bEdges.push([a, b]);
  const ehash = (a, b) => { let x = (seed ^ Math.imul(a + 1, 73856093) ^ Math.imul(b + 1, 19349663)) >>> 0; x ^= x << 13; x >>>= 0; x ^= x >>> 17; x ^= x << 5; return x >>> 0; };
  bEdges.sort((p, q) => ehash(p[0], p[1]) - ehash(q[0], q[1]));
  const par = Array.from({ length: places.length }, (_, i) => i), find = (x) => { while (par[x] !== x) { par[x] = par[par[x]]; x = par[x]; } return x; };
  const paths = []; for (const [a, b] of bEdges) { if (find(a) !== find(b)) { par[find(a)] = find(b); paths.push({ a, b, ax: places[a].x, ay: places[a].y, bx: places[b].x, by: places[b].y }); } }

  // 6. the supply web over BUILDINGS (each `in` → nearest building that `out`s it) — as buildField.
  const bSpacing = Math.max(cellSpacing, Math.sqrt((W * H) / Math.max(1, places.length)));
  const byRes = new Map();
  for (const pl of places) for (const r of pl.out) { let a = byRes.get(r); if (!a) { a = []; byRes.set(r, a); } a.push(pl); }
  const outGrid = new Map(); for (const [r, list] of byRes) outGrid.set(r, bucketGrid(list, bSpacing * 4.5));
  const edges = []; let need = 0, met = 0;
  for (const pl of places) for (const r of [...new Set(pl.in)]) {
    need++; const g = outGrid.get(r); if (!g) continue;
    let best = null, bd = Infinity;
    for (const q of g.near(pl.x, pl.y)) { if (q.id === pl.id) continue; const d = (q.x - pl.x) ** 2 + (q.y - pl.y) ** 2; if (d < bd) { bd = d; best = q; } }
    if (best) { met++; edges.push({ from: pl.id, to: best.id, r, fx: pl.x, fy: pl.y, tx: best.x, ty: best.y }); }
  }
  const counts = {}; for (const pl of places) counts[pl.role] = (counts[pl.role] || 0) + 1;
  return {
    W, H, cells: cellPolys, cellSpacing, spacing: bSpacing, sites, buildingOf, cellAdj,
    places, adj, paths, edges, byRes, counts, need, met,
    closure: need ? met / need : 1, avgFootprint: places.length ? N / places.length : 0,
  };
}

// coarse building→building route: BFS over the building-adjacency graph. The mechanical pathing
// primitive — "can a person get from their home to the clinic, and through which blocks?".
export function route(world, fromId, toId) {
  if (fromId === toId) return [fromId];
  const prev = new Map([[fromId, -1]]), q = [fromId];
  for (let h = 0; h < q.length; h++) {
    const u = q[h]; if (u === toId) break;
    for (const v of world.adj.get(u) || []) if (!prev.has(v)) { prev.set(v, u); q.push(v); }
  }
  if (!prev.has(toId)) return null;                       // disconnected (shouldn't happen — tree spans)
  const path = []; for (let u = toId; u !== -1; u = prev.get(u)) path.push(u);
  return path.reverse();
}

// ── PEOPLE WEAR MANY HATS — the thing that makes the web THICK ─────────────────────────────
// A person isn't a role; they're a bundle of affiliations across places & time: Jim = mend@chopshop
// + grow@home + worship@chapel + learn@toastmasters. Interaction thickness (avg hats/person, how
// memberships overlap) is the economic cousin of ecological CONNECTANCE — thin webs are brittle,
// thick ones hold (the Biosphere-2 lesson). buildSociety lays people over a field and gives each a
// home, an occupation near it, and a spread of avocations (a "third place" or two). Deterministic.
const NAMES = ['Jim', 'Mara', 'Otto', 'Lena', 'Cy', 'Wren', 'Bo', 'Ada', 'Tomas', 'Ines', 'Hal', 'Rosa', 'Gus', 'Pia', 'Ned', 'Suki', 'Cole', 'Mir', 'Vale', 'Ruth', 'Sol', 'Nova', 'Bram', 'Esa', 'Jun', 'Liv', 'Cato', 'Wynn', 'Dax', 'Fenn'];
const WORKING = ['make', 'mend', 'trade', 'grow', 'serve', 'heal', 'learn', 'store', 'move', 'govern'];
const THIRD_KINDS = new Set(['worship', 'club', 'sport']);

export function buildSociety(field, { hh, seed = 1, genome = DEFAULT_GENOME } = {}) {
  const rng = mulberry32((seed ^ 0x5bd1e995) >>> 0);
  const A = genome.affinity, H = genome.household;
  if (hh == null) hh = H.mean;                              // households come from the genome unless pinned
  const places = field.places;
  const working = places.filter((p) => WORKING.includes(p.role));
  const worship = places.filter((p) => p.role === 'worship');
  const clubs = places.filter((p) => p.role === 'learn' || p.role === 'serve');
  const sports = places.filter((p) => p.role === 'play');
  const nearest = (list, x, y) => { let best = null, bd = Infinity; for (const p of list) { const d = (p.x - x) ** 2 + (p.y - y) ** 2; if (d < bd) { bd = d; best = p; } } return best; };
  const people = [], placeMembers = new Map(), homeLocals = new Map();
  const join = (person, place, role, kind) => { person.hats.push({ place: place.id, role, kind, x: place.x, y: place.y, domain: place.domain }); let m = placeMembers.get(place.id); if (!m) { m = []; placeMembers.set(place.id, m); } m.push(person.idx); };
  // each home has a parish / local club / pitch (shared by the household → BONDS)
  const localsFor = (home) => { let L = homeLocals.get(home.id); if (!L) { L = { par: nearest(worship, home.x, home.y), club: nearest(clubs, home.x, home.y), pitch: nearest(sports, home.x, home.y) }; homeLocals.set(home.id, L); } return L; };
  let idx = 0;
  for (const home of places) {
    if (home.role !== 'dwell') continue;
    const L = localsFor(home), n = 1 + Math.floor(rng() * (2 * hh - 1));
    for (let k = 0; k < n; k++) {
      const person = { idx: idx++, name: NAMES[Math.floor(rng() * NAMES.length)], home: home.id, x: home.x, y: home.y, hats: [] };
      // occupation: nearest among a random handful of working places (each household member works
      // somewhere different → workplaces become BRIDGES of coworkers from many homes)
      if (working.length) { let pick = null, bd = Infinity; for (let t = 0; t < A.workTries; t++) { const w = working[Math.floor(rng() * working.length)]; const d = (w.x - home.x) ** 2 + (w.y - home.y) ** 2; if (d < bd) { bd = d; pick = w; } } if (pick) join(person, pick, pick.role, 'work'); }
      if (rng() < A.garden) join(person, home, 'grow', 'home garden');                                // Jim's garden
      // the household's shared locals — neighbours overlap here, so these BOND
      if (L.par && rng() < A.worship) join(person, L.par, L.par.role, 'worship');
      if (L.club && rng() < A.club) join(person, L.club, L.club.role, 'club');
      if (L.pitch && rng() < A.sport) join(person, L.pitch, L.pitch.role, 'sport');
      // an eclectic tie somewhere across town — a weak-tie BRIDGE to a far circle
      if (clubs.length && rng() < A.bridge) { const c = clubs[Math.floor(rng() * clubs.length)]; join(person, c, c.role, 'club'); }
      people.push(person);
    }
  }
  const aff = people.reduce((s, p) => s + p.hats.length, 0);
  const thirds = people.filter((p) => p.hats.some((h) => THIRD_KINDS.has(h.kind))).length;
  return { people, placeMembers, affiliations: aff, avgHats: people.length ? aff / people.length : 0, thirdsFrac: people.length ? thirds / people.length : 0 };
}

// ── WEAK TIES vs BONDS — where the fabric is actually THICK ────────────────────────────────
// Granovetter: a place that introduces people who'd otherwise never meet is a BRIDGE (weak-tie
// rich, the connective tissue); a place whose members already overlap everywhere else is BONDING
// (redundant). Per non-home place, `bridging` = the share of its member-pairs for whom it is their
// ONLY shared social place. `avgReach` is the global thickness: how many others the average person
// rubs shoulders with through their hats. (Homes are bonds by definition — excluded from bridging.)
export function socialMetrics(field, society) {
  const people = society.people;
  const social = people.map((p) => { const s = new Set(); for (const h of p.hats) if (h.place !== p.home) s.add(h.place); return s; });
  const placeById = new Map(field.places.map((p) => [p.id, p]));
  const bridging = new Map();
  for (const [pid, members] of society.placeMembers) {
    const pl = placeById.get(pid); if (!pl || pl.role === 'dwell') continue;
    const M = members.filter((i) => people[i].home !== pid);
    if (M.length < 2) { bridging.set(pid, { members: M.length, bridging: M.length ? 1 : 0 }); continue; }
    let sole = 0, pairs = 0;
    for (let i = 0; i < M.length; i++) for (let j = i + 1; j < M.length; j++) {
      pairs++; const A = social[M[i]], B = social[M[j]]; let other = false;
      for (const x of A) { if (x !== pid && B.has(x)) { other = true; break; } }
      if (!other) sole++;
    }
    bridging.set(pid, { members: M.length, bridging: pairs ? sole / pairs : 1 });
  }
  let reach = 0;
  for (let i = 0; i < people.length; i++) { const seen = new Set(); for (const pid of social[i]) { const m = society.placeMembers.get(pid); if (m) for (const j of m) if (j !== i) seen.add(j); } reach += seen.size; }
  return { bridging, social, avgReach: people.length ? reach / people.length : 0 };
}

// Removing a place strikes TWO webs at once: the supply web (who loses a supplier — and can they
// reroute to another producer nearby?) and the social fabric (whose ties break — pairs whose only
// shared place was this — and who is orphaned, losing their last social place). The thesis in a click.
export function removeImpact(field, society, metrics, placeId) {
  const placeById = new Map(field.places.map((p) => [p.id, p]));
  const r2 = (field.spacing * 4.5) ** 2;
  let needsAtRisk = 0, rerouted = 0;
  for (const e of field.edges) if (e.to === placeId) {
    const cons = placeById.get(e.from), list = field.byRes.get(e.r) || [];
    let alt = false; for (const q of list) { if (q.id === placeId || q.id === e.from) continue; if ((q.x - cons.x) ** 2 + (q.y - cons.y) ** 2 <= r2) { alt = true; break; } }
    if (alt) rerouted++; else needsAtRisk++;
  }
  const atP = []; for (let i = 0; i < society.people.length; i++) if (metrics.social[i].has(placeId)) atP.push(i);
  let ties = 0, orphaned = 0;
  for (let a = 0; a < atP.length; a++) {
    const i = atP[a]; if (metrics.social[i].size === 1) orphaned++;
    for (let b = a + 1; b < atP.length; b++) {
      const A = metrics.social[i], B = metrics.social[atP[b]]; let other = false;
      for (const x of A) { if (x !== placeId && B.has(x)) { other = true; break; } }
      if (!other) ties++;
    }
  }
  return { members: atP.length, needsAtRisk, rerouted, ties, orphaned };
}

// ── THE VITALITY ORACLE — the thing we test the genome AGAINST ───────────────────────────────
// biome's score.mjs turns a rolled food web into one viability number + a rarity tier (does the loop
// close, stay stable, resist shocks, stay fed). The economic cousin scores a generated SOCIETY: does
// the supply web close, is the social fabric THICK (multiplex, not atomised), is it richly BRIDGED
// (weak ties, not just cliques), are people employed and keeping third places, and does it SHRUG OFF
// the loss of a hub. Each sub-signal is 0..1, weighted into a 0..100 `vitality`, minus degeneracy
// penalties (atomisation, supply gaps, idleness). The tiers are the econ register, not rarity foil.
const VITAL_W = { closes: 0.22, thick: 0.16, weave: 0.12, bridges: 0.12, thirds: 0.10, employ: 0.10, resilient: 0.18 };
const VITAL_TIERS = [
  { tier: 'Thriving', min: 85 }, { tier: 'Healthy', min: 70 }, { tier: 'Stable', min: 55 },
  { tier: 'Fragile', min: 38 }, { tier: 'Failing', min: 0 },
];
const clamp01 = (x) => Math.max(0, Math.min(1, x));
export const vitalityTier = (v) => VITAL_TIERS.find((t) => v >= t.min).tier;

export function scoreSociety(field, society, metrics, { hubs = 5 } = {}) {
  const people = society.people, P = people.length || 1;
  const placeById = new Map(field.places.map((p) => [p.id, p]));
  // employment + third-place integration
  const employed = people.filter((p) => p.hats.some((h) => h.kind === 'work')).length / P;
  // share of non-home gathering places that are real BRIDGES (introduce otherwise-unconnected people)
  let bridgeable = 0, bridges = 0;
  for (const [pid, b] of metrics.bridging) { const pl = placeById.get(pid); if (!pl || pl.role === 'dwell' || b.members < 2) continue; bridgeable++; if (b.bridging > 0.5) bridges++; }
  // resilience: average hub damage over the busiest non-home places (orphaning + stranded needs)
  const ranked = [...society.placeMembers.entries()].map(([pid, m]) => [pid, m.length])
    .filter(([pid]) => { const pl = placeById.get(pid); return pl && pl.role !== 'dwell'; })
    .sort((a, b) => b[1] - a[1]).slice(0, hubs);
  let dmg = 0, dn = 0;
  for (const [pid] of ranked) {
    const imp = removeImpact(field, society, metrics, pid);
    const orphFrac = imp.members ? imp.orphaned / imp.members : 0;
    const strand = (imp.needsAtRisk + imp.rerouted) ? imp.needsAtRisk / (imp.needsAtRisk + imp.rerouted) : 0;
    dmg += 0.6 * orphFrac + 0.4 * strand; dn++;
  }
  const sig = {
    closes:    clamp01(field.closure),
    thick:     clamp01((society.avgHats - 1) / 3),         // 3 hats ⇒ ~0.67; headroom so the score is a gradient
    weave:     clamp01(metrics.avgReach / 45),             // shoulders rubbed through one's hats
    bridges:   bridgeable ? bridges / bridgeable : 0,
    thirds:    clamp01(society.thirdsFrac),
    employ:    clamp01(employed),
    resilient: clamp01(1 - (dn ? dmg / dn : 0)),
  };
  let base = 0; for (const k in VITAL_W) base += VITAL_W[k] * sig[k];
  let penalty = 0;
  if (society.avgHats < 1.3) penalty += 20;                // atomised — the brittle, Biosphere-2 web
  if (field.closure < 0.6) penalty += 12;                 // the supply web won't close
  if (society.thirdsFrac < 0.10) penalty += 8;            // no social capital — a town of strangers
  if (employed < 0.5) penalty += 8;                       // idle hands
  if (P < field.places.length * 0.05) penalty += 6;       // a ghost town (sanity)
  const vitality = Math.round(clamp01(base - penalty / 100) * 100);
  const tier = vitalityTier(vitality);
  return { vitality, tier, signals: sig, employed, bridges, bridgeable, headline: vitalHeadline(sig, society, field, vitality) };
}

function vitalHeadline(sig, society, field, v) {
  if (v >= 85) return `A thriving town: thick ties, well bridged, and it shrugs off losing a hub.`;
  if (society.avgHats < 1.3) return `Atomised — people barely overlap (${society.avgHats.toFixed(2)} hats each); the fabric is brittle.`;
  if (field.closure < 0.6) return `The supply web is full of holes (only ${Math.round(field.closure * 100)}% of needs find a maker).`;
  if (sig.resilient < 0.4) return `Fragile — pull one busy place and the social fabric tears.`;
  if (sig.bridges < 0.3) return `Cliquey — plenty of bonds, few bridges; circles rarely meet.`;
  if (v >= 70) return `A healthy town — the loop closes and the weave holds.`;
  return `Getting by — it works, but the weave is thin in places.`;
}


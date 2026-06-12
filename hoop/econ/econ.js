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

import { clipCell, bucketGrid, jitterGrid, mulberry32 } from '../paint/voronoi.js';

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
  return { W, H, spacing, places, cells, edges, counts, need, met, closure: need ? met / need : 1 };
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

export function buildSociety(field, { hh = 3, seed = 1 } = {}) {
  const rng = mulberry32((seed ^ 0x5bd1e995) >>> 0);
  const places = field.places;
  const working = places.filter((p) => WORKING.includes(p.role));
  const worship = places.filter((p) => p.role === 'worship');
  const clubs = places.filter((p) => p.role === 'learn' || p.role === 'serve');
  const sports = places.filter((p) => p.role === 'play');
  const nearest = (list, x, y) => { let best = null, bd = Infinity; for (const p of list) { const d = (p.x - x) ** 2 + (p.y - y) ** 2; if (d < bd) { bd = d; best = p; } } return best; };
  const people = [], placeMembers = new Map();
  const join = (person, place, role, kind) => { person.hats.push({ place: place.id, role, kind, x: place.x, y: place.y, domain: place.domain }); let m = placeMembers.get(place.id); if (!m) { m = []; placeMembers.set(place.id, m); } m.push(person.idx); };
  let idx = 0;
  for (const home of places) {
    if (home.role !== 'dwell') continue;
    const n = 1 + Math.floor(rng() * (2 * hh - 1));
    for (let k = 0; k < n; k++) {
      const person = { idx: idx++, name: NAMES[Math.floor(rng() * NAMES.length)], home: home.id, x: home.x, y: home.y, hats: [] };
      // occupation: nearest among a random handful of working places (locality + variety)
      if (working.length) { let pick = null, bd = Infinity; for (let t = 0; t < 6; t++) { const w = working[Math.floor(rng() * working.length)]; const d = (w.x - home.x) ** 2 + (w.y - home.y) ** 2; if (d < bd) { bd = d; pick = w; } } if (pick) join(person, pick, pick.role, 'work'); }
      // avocations — the other hats
      if (rng() < 0.45) join(person, home, 'grow', 'home garden');                                   // Jim's garden
      if (worship.length && rng() < 0.30) { const c = nearest(worship, home.x, home.y); if (c) join(person, c, c.role, 'worship'); }
      if (clubs.length && rng() < 0.45) { const c = nearest(clubs, home.x, home.y); if (c) join(person, c, c.role, 'club'); }  // toastmasters
      if (sports.length && rng() < 0.30) { const c = nearest(sports, home.x, home.y); if (c) join(person, c, c.role, 'sport'); }
      people.push(person);
    }
  }
  const aff = people.reduce((s, p) => s + p.hats.length, 0);
  const thirds = people.filter((p) => p.hats.some((h) => THIRD_KINDS.has(h.kind))).length;
  return { people, placeMembers, affiliations: aff, avgHats: people.length ? aff / people.length : 0, thirdsFrac: people.length ? thirds / people.length : 0 };
}


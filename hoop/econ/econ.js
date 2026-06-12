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

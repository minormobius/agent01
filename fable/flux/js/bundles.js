// Bundles — the genres, i.e. which physics elements a world is built from. This
// is the "anarchy of mechanics" dial: gravity on/off, wells, magnets, goo,
// bumpers, walls. Each build(rand) lays out a world spec; the generator then
// has the solver vouch for it.

import { ARENA } from './engine.js';

function rnd(rand, lo, hi) { return lo + rand.float() * (hi - lo); }
function pt(rand, m = 14) { return { x: rnd(rand, m, ARENA - m), y: rnd(rand, m, ARENA - m) }; }
function far(a, b, d) { const dx = a.x - b.x, dy = a.y - b.y; return dx * dx + dy * dy >= d * d; }

// place launch + goal a good distance apart
function endpoints(rand) {
  let a, b, tries = 0;
  do { a = pt(rand, 10); b = pt(rand, 10); tries++; } while (!far(a, b, 52) && tries < 60);
  return { ball0: a, goal: { x: b.x, y: b.y, rad: rnd(rand, 5.5, 7) } };
}
function base(rand) {
  return { gravity: false, attractors: [], goo: [], bumpers: [], walls: [], ...endpoints(rand) };
}

// LOB — gravity + bumpers + walls. Arc shots and banks.
const lob = {
  id: 'lob', name: 'Lob', accent: '#c2792e',
  blurb: 'Gravity is on. Arc the ball over the obstacles — or bank it off a bumper — into the goal.',
  build(rand) {
    const w = base(rand); w.gravity = true;
    // launch from low, goal anywhere; bumpers + a wall
    for (let k = 0, n = rand.range(1, 3); k < n; k++) w.bumpers.push({ ...pt(rand), rad: rnd(rand, 5, 9), rest: rnd(rand, 0.8, 0.98) });
    if (rand.float() < 0.6) { const a = pt(rand), b = pt(rand); w.walls.push({ x1: a.x, y1: a.y, x2: b.x, y2: b.y }); }
    w.mechanics = ['gravity', 'bumper'];
    return w;
  },
};

// ORRERY — zero-g gravity wells. Slingshot around the wells.
const orrery = {
  id: 'orrery', name: 'Orrery', accent: '#3f7fd0',
  blurb: 'No gravity, but heavy wells bend everything toward them. Slingshot around them to the goal.',
  build(rand) {
    const w = base(rand);
    for (let k = 0, n = rand.range(1, 2); k < n; k++) w.attractors.push({ ...pt(rand, 22), q: rnd(rand, 0.8, 1.5) });
    w.mechanics = ['well'];
    return w;
  },
};

// MAGNETO — zero-g magnets, attract AND repel. Curve through the fields.
const magneto = {
  id: 'magneto', name: 'Magneto', accent: '#7a55c8',
  blurb: 'Magnets — some pull, some push. Read the field and curve the ball through to the goal.',
  build(rand) {
    const w = base(rand);
    for (let k = 0, n = rand.range(2, 3); k < n; k++) w.attractors.push({ ...pt(rand, 18), q: (rand.float() < 0.5 ? -1 : 1) * rnd(rand, 0.5, 1.1) });
    w.mechanics = ['magnet'];
    return w;
  },
};

// GOOP — goo fields that bleed speed, plus a bumper or two. Thread the viscous bits.
const goop = {
  id: 'goop', name: 'Goop', accent: '#2faa84',
  blurb: 'Goo saps speed and can swallow a ball that stops in it. Thread through — or skim — to the goal.',
  build(rand) {
    const w = base(rand); w.gravity = rand.float() < 0.4;
    for (let k = 0, n = rand.range(1, 3); k < n; k++) w.goo.push({ ...pt(rand, 16), rad: rnd(rand, 10, 18), drag: rnd(rand, 0.03, 0.07) });
    if (rand.float() < 0.5) w.bumpers.push({ ...pt(rand), rad: rnd(rand, 5, 8), rest: 0.9 });
    w.mechanics = ['goo'];
    return w;
  },
};

// CHAOS — the anarchy: throw several families together.
const chaos = {
  id: 'chaos', name: 'Chaos', accent: '#b5476d',
  blurb: 'Everything at once — wells, magnets, goo, bumpers. The solver still guarantees a launch that wins.',
  build(rand) {
    const w = base(rand); w.gravity = rand.float() < 0.4;
    if (rand.float() < 0.7) w.attractors.push({ ...pt(rand, 20), q: rnd(rand, 0.7, 1.3) });
    if (rand.float() < 0.7) w.attractors.push({ ...pt(rand, 18), q: (rand.float() < 0.5 ? -1 : 1) * rnd(rand, 0.5, 1.0) });
    for (let k = 0, n = rand.range(1, 2); k < n; k++) w.goo.push({ ...pt(rand, 16), rad: rnd(rand, 9, 15), drag: rnd(rand, 0.03, 0.06) });
    if (rand.float() < 0.6) w.bumpers.push({ ...pt(rand), rad: rnd(rand, 5, 8), rest: 0.92 });
    w.mechanics = [...new Set(['well', w.attractors.some((a) => a.q < 0) ? 'magnet' : null, w.goo.length ? 'goo' : null, w.bumpers.length ? 'bumper' : null].filter(Boolean))];
    return w;
  },
};

export const BUNDLES = [lob, orrery, magneto, goop, chaos];
export const BUNDLE_BY_ID = Object.fromEntries(BUNDLES.map((b) => [b.id, b]));
export const BUNDLE_WEIGHTS = { lob: 4, orrery: 4, magneto: 4, goop: 4, chaos: 3 };

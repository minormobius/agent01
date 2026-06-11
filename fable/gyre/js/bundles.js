// Bundles — the genres of torus worlds. Placement is in intrinsic (u,v)
// coordinates; bake() embeds everything once. The torus itself is the headline
// mechanic — even the force-free genre is strange, because geodesics are.

import { bake } from './engine.js';

const TAU = Math.PI * 2;
function ang(rand) { return rand.float() * TAU; }
function rnd(rand, lo, hi) { return lo + rand.float() * (hi - lo); }

// chordal-ish separation in (u,v) — crude but fine for placement
function apart(a, b, du, dv) {
  const wu = Math.abs(((a.u - b.u + Math.PI * 3) % TAU) - Math.PI);
  const wv = Math.abs(((a.v - b.v + Math.PI * 3) % TAU) - Math.PI);
  return wu > du || wv > dv;
}
function endpoints(rand) {
  let a, b, tries = 0;
  do { a = { u: ang(rand), v: ang(rand) }; b = { u: ang(rand), v: ang(rand) }; tries++; }
  while (!apart(a, b, 1.8, 1.6) && tries < 60);
  return { ball0: a, goal: { u: b.u, v: b.v, rad: rnd(rand, 1.1, 1.6) } };
}
function base(rand) {
  return { zGravity: false, magnets: [], goo: [], bumpers: [], ...endpoints(rand) };
}

// MERIDIAN — pure curvature + bumpers. The torus IS the puzzle.
const meridian = {
  id: 'meridian', name: 'Meridian', accent: '#3f8fd6',
  blurb: 'No forces at all — only the curvature of the torus and a few bumpers. Geodesics precess, wrap the tube, and thread the hole; aim along the surface and trust the geometry.',
  build(rand) {
    const w = base(rand);
    for (let k = 0, n = rand.range(1, 3); k < n; k++) w.bumpers.push({ u: ang(rand), v: ang(rand), rad: rnd(rand, 1.2, 2.0) });
    w.mechanics = ['curvature', 'bumper'];
    return bake(w);
  },
};

// POLAR — surface magnets, attract and repel.
const polar = {
  id: 'polar', name: 'Polar', accent: '#7a55c8',
  blurb: 'Magnets pinned to the surface — some pull, some push, and their reach cuts through the hole of the torus. Curve the shot through the field.',
  build(rand) {
    const w = base(rand);
    for (let k = 0, n = rand.range(2, 3); k < n; k++) w.magnets.push({ u: ang(rand), v: ang(rand), q: (rand.float() < 0.5 ? -1 : 1) * rnd(rand, 0.6, 1.3) });
    w.mechanics = ['magnet'];
    return bake(w);
  },
};

// SLICK — goo patches; thread or skim them.
const slick = {
  id: 'slick', name: 'Slick', accent: '#2faa84',
  blurb: 'Patches of goo cling to the surface and bleed speed. Skim past them — or use one as a brake to drop into the goal.',
  build(rand) {
    const w = base(rand);
    for (let k = 0, n = rand.range(2, 4); k < n; k++) w.goo.push({ u: ang(rand), v: ang(rand), rad: rnd(rand, 2.2, 3.6), drag: rnd(rand, 0.03, 0.06) });
    if (rand.float() < 0.5) w.bumpers.push({ u: ang(rand), v: ang(rand), rad: rnd(rand, 1.2, 1.8) });
    w.mechanics = ['goo'];
    return bake(w);
  },
};

// HEAVY — embedded-z gravity: the whole torus world has a "down".
const heavy = {
  id: 'heavy', name: 'Heavy', accent: '#c2792e',
  blurb: 'Gravity points down through the embedding — the underside of the ring is a valley, the top a ridge. Lob along the surface and let the world’s tilt do the steering.',
  build(rand) {
    const w = base(rand); w.zGravity = true;
    if (rand.float() < 0.6) w.bumpers.push({ u: ang(rand), v: ang(rand), rad: rnd(rand, 1.2, 2.0) });
    if (rand.float() < 0.4) w.goo.push({ u: ang(rand), v: ang(rand), rad: rnd(rand, 2.0, 3.0), drag: 0.04 });
    w.mechanics = ['gravity'];
    return bake(w);
  },
};

// MAELSTROM — the anarchy dial.
const maelstrom = {
  id: 'maelstrom', name: 'Maelstrom', accent: '#b5476d',
  blurb: 'Everything at once — magnets, goo, bumpers, sometimes a tilted world. The solver still guarantees a launch that wins.',
  build(rand) {
    const w = base(rand);
    w.zGravity = rand.float() < 0.35;
    if (rand.float() < 0.75) w.magnets.push({ u: ang(rand), v: ang(rand), q: rnd(rand, 0.6, 1.2) });
    if (rand.float() < 0.6) w.magnets.push({ u: ang(rand), v: ang(rand), q: -rnd(rand, 0.5, 1.0) });
    for (let k = 0, n = rand.range(1, 2); k < n; k++) w.goo.push({ u: ang(rand), v: ang(rand), rad: rnd(rand, 2.0, 3.2), drag: rnd(rand, 0.03, 0.05) });
    if (rand.float() < 0.6) w.bumpers.push({ u: ang(rand), v: ang(rand), rad: rnd(rand, 1.2, 1.8) });
    w.mechanics = [...new Set([
      w.zGravity ? 'gravity' : null,
      w.magnets.length ? 'magnet' : null,
      w.goo.length ? 'goo' : null,
      w.bumpers.length ? 'bumper' : null,
    ].filter(Boolean))];
    return bake(w);
  },
};

export const BUNDLES = [meridian, polar, slick, heavy, maelstrom];
export const BUNDLE_BY_ID = Object.fromEntries(BUNDLES.map((b) => [b.id, b]));
export const BUNDLE_WEIGHTS = { meridian: 4, polar: 4, slick: 4, heavy: 4, maelstrom: 3 };

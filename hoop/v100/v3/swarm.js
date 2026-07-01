// swarm.js — the BEE-SWARM combat sprite, a compact vendor of the appearance layer from the Sprite Lab's
// bee kernel (mega/bees/swarm.js). That kernel splits a swarm into APPEARANCE (a baked micro-atlas of one
// ~3px bee) + MOTION (a live boids sim). For a battle sprite we only want the appearance, composed into a
// still CLOUD of bees that shimmers off the walk phase — so this copies the bee-pixel primitives (BODY /
// WINGS / beeColors / rotateCells / beeCells, verbatim from swarm.js) and adds buildSwarmGenome / swarmFrame
// in the SAME shape as the other beast kernels (poly/quad/axial/isopod): G.{w,h,seed,_plan}, frame → cells
// {x,y,c}. No boids sim, no DOM. Deterministic from the seed + the frame phase (no Date.now/Math.random).
//
// Re-sync the bee primitives from mega/bees/swarm.js if that kernel's look changes (the vendor discipline).

import { rngFor } from './sprite-core.js';

const TAU = Math.PI * 2;

// ── one bee, in local cell coords, nominally facing +x (copied from mega/bees/swarm.js) ──
const BODY = [
  { x: 1, y: 0, k: 'head' },   // head (dark, leads the heading)
  { x: 0, y: 0, k: 'thorax' }, // thorax (bright amber)
  { x: -1, y: 0, k: 'abdo' },  // abdomen (banded amber)
];
const WINGS = [
  [{ x: 0, y: -1, k: 'wingA' }, { x: 0, y: 1, k: 'wingA' }], // frame 0 — wings out
  [{ x: 0, y: -1, k: 'wingB' }, { x: 0, y: 1, k: 'wingB' }], // frame 1 — retracted (the buzz flicker)
];
function beeColors(seed) {
  const rnd = rngFor(seed + '::col');
  const hue = 38 + (rnd() * 12 - 6), sat = 82 + rnd() * 10;   // amber, small per-swarm jitter
  return {
    head: `hsl(${hue.toFixed(0)} ${(sat - 30).toFixed(0)}% 20%)`,
    thorax: `hsl(${hue.toFixed(0)} ${sat.toFixed(0)}% 53%)`,
    abdo: `hsl(${hue.toFixed(0)} ${sat.toFixed(0)}% 40%)`,
    wingA: 'rgba(222,228,240,0.85)',
    wingB: 'rgba(210,216,232,0.30)',
  };
}
// rotate a base cell by angle, snap to the pixel lattice; head pixel wins collisions (legible silhouette).
function rotateCells(cells, ang, colors) {
  const c = Math.cos(ang), s = Math.sin(ang), seen = new Map();
  for (const cell of cells) {
    const x = Math.round(cell.x * c - cell.y * s), y = Math.round(cell.x * s + cell.y * c), key = x + ',' + y;
    const pri = cell.k === 'head' ? 3 : (cell.k === 'wingA' || cell.k === 'wingB') ? 1 : 2;
    const prev = seen.get(key);
    if (!prev || pri > prev.pri) seen.set(key, { x, y, c: colors[cell.k], pri });
  }
  return [...seen.values()].map(({ x, y, c }) => ({ x, y, c }));
}
function beeCells(angle, wing, colors) { return rotateCells([...BODY, ...WINGS[wing & 1]], angle, colors); }

// ── the SWARM sprite: a deterministic cloud of bees in a w×h box, each with a home point + orbit phase ──
export const FAMILIES = { swarm: {} };   // (parity with the other kernels; one look for now)
export function buildSwarmGenome(seed, genes = {}) {
  const rnd = rngFor('swarm:' + seed), colors = beeColors('swarm:' + seed);
  const count = Math.max(8, Math.min(40, genes.count || 22));
  const w = genes.w || 30, h = genes.h || 26, cx = w / 2, cy = h / 2, rad = Math.min(w, h) * 0.42;
  const bees = [];
  for (let i = 0; i < count; i++) {
    // a Gaussian-ish clump toward the centre (two rolls averaged), each bee with its own orbit phase/heading
    const ux = (rnd() + rnd()) / 2 - 0.5, uy = (rnd() + rnd()) / 2 - 0.5;
    bees.push({ hx: cx + ux * 2 * rad, hy: cy + uy * 2 * rad, phase: rnd() * TAU, spin: rnd() * TAU, orbit: 0.8 + rnd() * 1.6, ang: rnd() * TAU });
  }
  return { _plan: 'swarm', seed: 'swarm:' + seed, w, h, colors, bees, count };
}
// one frame: each bee orbits its home point (phase advanced by t) and flickers its wings → a buzzing cloud.
export function swarmFrame(G, t) {
  const seen = new Map();
  const put = (x, y, c, pri) => { if (x < 0 || y < 0 || x >= G.w || y >= G.h) return; const key = x + ',' + y, prev = seen.get(key); if (!prev || pri > prev.pri) seen.set(key, { x, y, c, pri }); };
  const phi = (t || 0) * TAU;
  for (let i = 0; i < G.bees.length; i++) {
    const b = G.bees[i];
    const bx = Math.round(b.hx + Math.cos(b.phase + phi) * b.orbit);
    const by = Math.round(b.hy + Math.sin(b.spin + phi * 1.3) * b.orbit);
    const wing = (Math.floor((t || 0) * 4) + i) & 1;
    for (const cell of beeCells(b.ang, wing, G.colors)) put(bx + cell.x, by + cell.y, cell.c, cell.c === G.colors.head ? 3 : (cell.c === G.colors.wingA || cell.c === G.colors.wingB) ? 1 : 2);
  }
  return [...seen.values()].map(({ x, y, c }) => ({ x, y, c }));
}

export default { buildSwarmGenome, swarmFrame, FAMILIES };

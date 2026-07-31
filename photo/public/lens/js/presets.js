// presets.js — starting points. Each is just a recipe, the same object the URL
// carries and the stack editor edits, so loading one and pulling it apart is
// the intended way to use them.

import { defaults } from './conformal.js';

const L = (map, params = {}) => ({ map, on: true, params: { ...defaults(map), ...params } });
const R = (ops, extra = {}) => ({
  edge: 'clamp', bias: 0, view: { zoom: 1, rotate: 0, panx: 0, pany: 0 }, ...extra, ops,
});

export const PRESETS = [
  {
    name: 'tiny planet',
    note: 'the picture rolled up by z ↦ exp(z): the bottom edge becomes the pole, the top edge the horizon — and every angle survives',
    recipe: R([L('polar', { mode: 'roll up', spread: 0.44, twist: 0, zoom: 1.15 })], { edge: 'clamp' }),
  },
  {
    name: 'spun planet',
    note: 'the same roll-up with the log-strip sheared, so the world winds into a spiral instead of a ring',
    recipe: R([L('polar', { mode: 'roll up', spread: 0.5, twist: 28, zoom: 1.15 })], { edge: 'clamp' }),
  },
  {
    name: 'unrolled',
    note: 'the other direction: a circular picture opened out into a strip, the logarithm of the plane',
    recipe: R([L('polar', { mode: 'unroll', spread: 0.44, zoom: 1 })], { edge: 'mirror' }),
  },
  {
    name: 'sphere turn',
    note: 'stereographic onto a sphere, rotate, project back — a Möbius transformation, and the conformal fisheye',
    recipe: R([L('sphere', { pitch: 110, yaw: 0, roll: 0, zoom: 1 })], { edge: 'mirror' }),
  },
  {
    name: 'tunnel',
    note: 'the same sphere seen from the other side — the horizon closes overhead instead of underfoot',
    recipe: R([L('sphere', { pitch: -30, yaw: 0, roll: 0, zoom: 0.8 })]),
  },
  {
    name: 'fisheye lens',
    note: 'a real 130° fisheye. Switch the projection with the dilatation view on and watch what each one costs',
    recipe: R([L('fisheye', { projection: 'stereographic', fov: 130, zoom: 1 })]),
  },
  {
    name: 'funhouse mirror',
    note: 'the carnival mirror — pure shear, and the dilatation view fills in to prove it',
    recipe: R([L('mirror', { amplitude: 0.28, frequency: 2.2, angle: 0, taper: 0.2 })], { edge: 'mirror' }),
  },
  {
    name: 'hall of mirrors',
    note: 'the conformal answer to the same idea: a holomorphic ripple, which wobbles without smearing',
    recipe: R([
      L('wave', { amplitude: 0.09, frequency: 2.6, angle: 20 }),
      L('wave', { amplitude: 0.06, frequency: 4.2, angle: 105, phase: 40 }),
    ], { edge: 'mirror' }),
  },
  {
    name: 'droste',
    note: 'the picture inside the picture inside the picture — Escher’s Print Gallery, done properly',
    recipe: R([L('droste', { inner: 0.22, outer: 1, turns: 1, zoom: 1 })], { edge: 'clamp' }),
  },
  {
    name: 'water drop',
    note: 'a glass bead on the photograph: the Möbius bulge magnifies and displaces, as a real lens does',
    recipe: R([
      L('bulge', { strength: 0.62, radius: 0.8, cx: 0, cy: 0 }),
      L('wave', { amplitude: 0.05, frequency: 6, angle: 0 }),
    ]),
  },
  {
    name: 'whirlpool',
    note: 'z^(1+ik): straight rays become logarithmic spirals, and not one neighbourhood is sheared',
    recipe: R([L('spiral', { twist: 0.75, zoom: 1 })], { edge: 'mirror' }),
  },
  {
    name: 'kaleidoscope',
    note: 'six mirrored sectors — angles kept, handedness flipped in every other wedge',
    recipe: R([
      L('kaleido', { sectors: 6, rotate: 0 }),
      L('bulge', { strength: -0.25, radius: 1.2 }),
    ], { edge: 'mirror' }),
  },
  {
    name: 'inside out',
    note: 'inversion through a circle: the middle goes to the edges and the edges come home',
    recipe: R([L('invert', { radius: 0.55 })], { edge: 'clamp' }),
  },
  {
    name: 'twin lobes',
    note: 'the Joukowsky map, which turned circles into aerofoils and here opens the picture into two',
    recipe: R([L('joukowsky', { c: 0.55, zoom: 1.1 })], { edge: 'mirror' }),
  },
  {
    name: 'double angle',
    note: 'z², wrapping the picture twice around its own centre. Conformal everywhere but the middle',
    recipe: R([L('power', { p: 2, rotate: 0 })], { edge: 'mirror' }),
  },
  {
    name: 'the whole zoo',
    note: 'conformal ∘ conformal ∘ conformal — still conformal, which is the reason to compose at all',
    recipe: R([
      L('sphere', { pitch: 65, yaw: 15, zoom: 1.2 }),
      L('spiral', { twist: 0.35, zoom: 1 }),
      L('bulge', { strength: 0.35, radius: 1.1 }),
    ], { edge: 'mirror' }),
  },
];

export const presetByName = (name) => PRESETS.find((p) => p.name === name);

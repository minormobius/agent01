// Selftest for the golem modules. Run: node golem/js/golem.selftest.mjs
//
// nca.js     — golden parity vs the numpy reference of the original TF model;
//              place() recruits new cubes; extract() carries state forward.
// body.js    — connected components, principal axis, contact layer, entropy.
// gaits.js   — Kuramoto synchronises; car drives, house refuses, plane flies,
//              boat floats, waddlers waddle; everything deterministic by seed.
// builder.js — symmetric place/remove, undo/redo, permalink codec roundtrip.

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  NCA, GRID, NC, NCELLS, NEIGHBORS, decodeB64f32, decodeB64u8, splitWeights, unpackShape, mulberry32,
} from './nca.js';
import { components, bodyStats, latticeToWorld } from './body.js';
import { Clock, createKin, applyVerb, applyVerbReef, resolveCollisions } from './gaits.js';
import { Builder, cellOf, mirrorCell, encodeStructure, decodeStructure } from './builder.js';
import { WEIGHTS_B64 } from './weights.js';
import { SHAPES_B64, LABELS, CLASSES, NUM_SHAPES } from './shapes.js';

const here = dirname(fileURLToPath(import.meta.url));
const golden = JSON.parse(readFileSync(join(here, 'golden.json'), 'utf8'));

let failures = 0;
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ' — ' + detail : ''}`);
  if (!ok) failures++;
};

const weights = splitWeights(decodeB64f32(WEIGHTS_B64));
const packed = decodeB64u8(SHAPES_B64);

// ---------------------------------------------------------------- nca golden
for (const g of golden) {
  const nca = new NCA(weights);
  nca.setStructure(unpackShape(packed, g.index));
  for (let s = 0; s < g.steps; s++) nca.step(1.01, () => 0);
  const mean = new Float64Array(NC);
  for (const cell of nca.live) {
    const lg = nca.logits(cell);
    for (let k = 0; k < NC; k++) mean[k] += lg[k];
  }
  for (let k = 0; k < NC; k++) mean[k] /= nca.live.length;
  let maxDev = 0;
  for (let k = 0; k < NC; k++) maxDev = Math.max(maxDev, Math.abs(mean[k] - g.meanLogits[k]));
  check(`nca golden #${g.index} (${CLASSES[g.label]})`, maxDev < 0.02, `max dev ${maxDev.toExponential(2)}`);
}

// ---------------------------------------------------------------- nca place
{
  const rand = mulberry32(7);
  const i = 300; // a chair
  const nca = new NCA(weights);
  nca.setStructure(unpackShape(packed, i));
  for (let s = 0; s < 60; s++) nca.step(0.5, rand);
  // graft 5 new cubes onto existing faces
  const added = [];
  outer: for (const cell of nca.live) {
    for (let d = 1; d < 7; d++) {
      const nb = NEIGHBORS[cell * 7 + d];
      if (nb >= 0 && !nca.structure[nb]) {
        nca.place(nb);
        added.push(nb);
        if (added.length >= 5) break outer;
      }
    }
  }
  check('place() adds cubes', added.length === 5 && nca.live.length > 0);
  for (let s = 0; s < 40; s++) nca.step(0.5, rand);
  const recruited = added.filter((c) => nca.vote(c) === LABELS[i]).length;
  check('placed cubes get recruited by gossip', recruited >= 4, `${recruited}/5 vote ${CLASSES[LABELS[i]]}`);
}

// ---------------------------------------------------------------- components + extract
{
  const structure = new Uint8Array(NCELLS);
  // two disjoint blobs: a 3x3x3 at origin corner and a 2x2x2 far corner
  for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) for (let c = 0; c < 3; c++) structure[cellOf(a, b, c)] = 1;
  for (let a = 12; a < 14; a++) for (let b = 12; b < 14; b++) for (let c = 12; c < 14; c++) structure[cellOf(a, b, c)] = 1;
  const comps = components(structure);
  check('components finds 2 blobs', comps.length === 2, `${comps.map((c) => c.length)}`);
  check('components sorted by size', comps[0].length === 27 && comps[1].length === 8);

  const nca = new NCA(weights);
  nca.setStructure(structure);
  for (let s = 0; s < 10; s++) nca.step(1.01, () => 0);
  const votesBefore = comps[1].map((c) => nca.vote(c));
  const child = nca.extract(comps[1]);
  check('extract carries live set', child.live.length === 8);
  const votesAfter = comps[1].map((c) => child.vote(c));
  check('extract carries beliefs verbatim', votesBefore.every((v, k) => v === votesAfter[k]));
}

// ---------------------------------------------------------------- body stats
{
  // a rod along lattice axis0 -> world x
  const structure = new Uint8Array(NCELLS);
  for (let a = 2; a < 13; a++) structure[cellOf(a, 7, 3)] = 1;
  const nca = new NCA(weights);
  nca.setStructure(structure);
  const st = bodyStats(nca);
  check('rod axis0 -> forward ~ +x', Math.abs(st.forward[0]) > 0.99, `${st.forward.map((v) => v.toFixed(2))}`);
  check('fresh beliefs -> entropy ~ 1', st.entropy > 0.98, st.entropy.toFixed(3));
  check('contact = all rod cells (flat rod)', st.contact.length === 11);
  const rodY = latticeToWorld(cellOf(2, 7, 3))[1];
  check('minY matches lattice a2=3', Math.abs(st.minY - rodY) < 1e-6);

  // a rod along lattice axis1 -> world z
  const s2 = new Uint8Array(NCELLS);
  for (let a = 2; a < 13; a++) s2[cellOf(7, a, 3)] = 1;
  const n2 = new NCA(weights);
  n2.setStructure(s2);
  const st2 = bodyStats(n2);
  check('rod axis1 -> forward ~ z', Math.abs(st2.forward[2]) > 0.99, `${st2.forward.map((v) => v.toFixed(2))}`);

  // convergence drops entropy, consensus rises
  const i = 120; // a boat
  const n3 = new NCA(weights);
  n3.setStructure(unpackShape(packed, i));
  const rand = mulberry32(3);
  for (let s = 0; s < 90; s++) n3.step(0.5, rand);
  const st3 = bodyStats(n3);
  check('converged: lead == truth', st3.lead === LABELS[i], `${CLASSES[st3.lead]}`);
  check('converged: consensus high, entropy low', st3.consensus > 0.9 && st3.entropy < 0.35,
    `consensus ${st3.consensus.toFixed(2)} entropy ${st3.entropy.toFixed(2)}`);
}

// ---------------------------------------------------------------- Kuramoto
{
  const structure = unpackShape(packed, 300);
  const cells = [];
  for (let i = 0; i < NCELLS; i++) if (structure[i]) cells.push(i);
  const clock = new Clock(cells, 42);
  const r0 = clock.order().r;
  for (let s = 0; s < 240; s++) clock.step(1 / 60);
  const r1 = clock.order().r;
  check('Kuramoto synchronises', r0 < 0.5 && r1 > 0.9, `r ${r0.toFixed(2)} -> ${r1.toFixed(2)}`);
  clock.rebuild(cells.slice(0, Math.floor(cells.length / 2)));
  check('rebuild keeps surviving phases', clock.order().r > 0.85, `r ${clock.order().r.toFixed(2)}`);
}

// ---------------------------------------------------------------- verbs
{
  const run = (lead, seconds = 6, seed = 5) => {
    const kin = createKin(seed);
    kin.yaw = 0;
    const S = { lead, consensus: 1, entropy: 0.05, r: 1, psi: 0 };
    let maxAlt = 0, water = false, plucks = 0;
    for (let t = 0; t < seconds * 60; t++) {
      S.psi = (t / 60) * 2 * Math.PI * 0.9;
      applyVerb(kin, S, 1 / 60);
      maxAlt = Math.max(maxAlt, kin.alt);
      water = water || kin.flags.water;
      if (kin.flags.pluck) plucks++;
    }
    return { kin, dist: Math.hypot(kin.pos[0], kin.pos[2]), maxAlt, water, plucks };
  };
  const car = run(2);
  check('car drives', car.dist > 12, `dist ${car.dist.toFixed(1)}`);
  const house = run(4);
  check('house refuses to move', house.dist < 0.01, `dist ${house.dist.toFixed(3)}`);
  check('house settles', house.kin.settle > 0.1);
  const boat = run(6);
  check('boat sails on water', boat.water && boat.dist > 3 && boat.kin.alt === 0, `dist ${boat.dist.toFixed(1)}`);
  const plane = run(0, 20);
  check('plane takes off', plane.maxAlt > 8, `maxAlt ${plane.maxAlt.toFixed(1)}`);
  const chair = run(1);
  check('chair waddles (slower than car)', chair.dist > 1 && chair.dist < car.dist, `dist ${chair.dist.toFixed(1)}`);
  const guitar = run(5, 6);
  check('guitar stays and plucks', guitar.dist < 0.01 && guitar.plucks >= 3, `plucks ${guitar.plucks}`);
  // low consensus -> barely moves
  const kin = createKin(5);
  const S = { lead: 2, consensus: 0.4, entropy: 0.9, r: 1, psi: 0 };
  for (let t = 0; t < 360; t++) applyVerb(kin, S, 1 / 60);
  check('no consensus, no throttle', Math.hypot(kin.pos[0], kin.pos[2]) < 0.01);
  // determinism
  const a = run(2, 4, 9).kin.pos, b = run(2, 4, 9).kin.pos;
  check('verbs deterministic by seed', a[0] === b[0] && a[2] === b[2]);
}

// ---------------------------------------------------------------- reef verbs
{
  const run = (lead, seconds = 8, seed = 5) => {
    const kin = createKin(seed);
    kin.yaw = 0; kin.alt = 2;
    const S = { lead, consensus: 1, entropy: 0.05, r: 1, psi: 0 };
    let minAlt = Infinity, maxAlt = 0, grows = 0;
    for (let t = 0; t < seconds * 60; t++) {
      S.psi = (t / 60) * 2 * Math.PI * 0.9;
      applyVerbReef(kin, S, 1 / 60);
      minAlt = Math.min(minAlt, kin.alt); maxAlt = Math.max(maxAlt, kin.alt);
      if (kin.flags.grow) grows++;
    }
    return { kin, dist: Math.hypot(kin.pos[0], kin.pos[2]), minAlt, maxAlt, grows };
  };
  const fish = run(0);
  check('fish swims', fish.dist > 10 && fish.minAlt >= 0.6 && fish.maxAlt <= 9,
    `dist ${fish.dist.toFixed(1)} alt [${fish.minAlt.toFixed(1)}, ${fish.maxAlt.toFixed(1)}]`);
  const jelly = run(3, 12);
  check('jellyfish pulses vertically', jelly.maxAlt - jelly.minAlt > 0.8 && jelly.dist < 6,
    `alt swing ${(jelly.maxAlt - jelly.minAlt).toFixed(1)}`);
  const coral = run(5, 10);
  check('coral stays rooted and asks to grow', coral.dist < 0.01 && coral.kin.alt === 0 && coral.grows >= 2,
    `grows ${coral.grows}`);
  const anemone = run(6);
  check('anemone stays rooted', anemone.dist < 0.01 && anemone.kin.alt === 0);
  const eel = run(1);
  check('eel undulates along (slower than fish)', eel.dist > 3 && eel.dist < fish.dist);
  // cohesion steers
  const kinA = createKin(5); kinA.yaw = 0; kinA.alt = 2;
  const S = { lead: 0, consensus: 1, entropy: 0, r: 1, psi: 0, cohesion: 0.5 };
  const kinB = createKin(5); kinB.yaw = 0; kinB.alt = 2;
  for (let t = 0; t < 120; t++) { applyVerbReef(kinA, S, 1 / 60); applyVerbReef(kinB, { ...S, cohesion: 0 }, 1 / 60); }
  check('fish cohesion steers the school', kinA.kin === undefined && Math.abs(kinA.yaw - kinB.yaw) > 0.5,
    `Δyaw ${(kinA.yaw - kinB.yaw).toFixed(2)}`);
  // reef determinism
  const a = run(0, 4, 9).kin.pos, b = run(0, 4, 9).kin.pos;
  check('reef verbs deterministic', a[0] === b[0] && a[2] === b[2]);
}

// vertical separation: bodies at different depths pass, same depth collide
{
  const mk = (x, z, y, h) => {
    const kin = createKin(1);
    kin.pos = [x, y, z]; kin.yaw = 0; kin.speed = 0;
    return { kin, radius: 3, mass: 100, mobile: true, airborne: false, y, h };
  };
  const fishHi = mk(0, 0, 6, 2), turtleLo = mk(1, 0, 1, 2);
  resolveCollisions([fishHi, turtleLo]);
  check('different depths pass each other', fishHi.kin.pos[0] === 0 && turtleLo.kin.pos[0] === 1);
  const f1 = mk(0, 0, 3, 2), f2 = mk(1, 0, 3.5, 2);
  resolveCollisions([f1, f2]);
  check('same depth still collides', f1.kin.pos[0] !== 0 || f2.kin.pos[0] !== 1);
}

// ---------------------------------------------------------------- collisions
{
  const mk = (x, z, yaw, speed, { mass = 100, mobile = true, airborne = false, radius = 3 } = {}) => {
    const kin = createKin(1);
    kin.pos = [x, 0, z]; kin.yaw = yaw; kin.speed = speed;
    return { kin, radius, mass, mobile, airborne };
  };
  // head-on cars: separated after resolve, hard impact reported
  const a = mk(-2, 0, 0, 6), b = mk(2, 0, Math.PI, 6);
  const impacts = resolveCollisions([a, b]);
  const d = Math.hypot(b.kin.pos[0] - a.kin.pos[0], b.kin.pos[2] - a.kin.pos[2]);
  check('collision separates overlapping bodies', d >= 6.29, `d ${d.toFixed(2)}`);
  check('head-on crash reports an impact', impacts.length === 1 && impacts[0].closing > 10,
    `closing ${impacts[0]?.closing.toFixed(1)}`);
  // car vs house: house never budges, car does all the yielding
  const car = mk(-2, 0, 0, 6, { mass: 100 });
  const house = mk(2, 0, 0, 0, { mass: 400, mobile: false });
  resolveCollisions([car, house]);
  check('house never budges', house.kin.pos[0] === 2 && house.kin.pos[2] === 0);
  check('car yields fully to the house', Math.hypot(car.kin.pos[0] + 2, car.kin.pos[2]) > 2);
  // gentle graze: separated but no damage-grade impact
  const s1 = mk(-3, 0, 0, 0.5), s2 = mk(3, 0, Math.PI, 0.5);
  check('gentle graze is not a crash', resolveCollisions([s1, s2]).length === 0);
  // airborne planes fly over everything
  const plane = mk(0, 0, 0, 10, { airborne: true }), truck = mk(0.5, 0, 0, 6);
  check('airborne bodies pass over', resolveCollisions([plane, truck]).length === 0
    && plane.kin.pos[0] === 0 && truck.kin.pos[0] === 0.5);
}

// ---------------------------------------------------------------- builder
{
  const b = new Builder();
  const c = cellOf(3, 4, 5);
  const placed = b.place(c, true);
  check('symmetric place -> 2 cubes', placed.length === 2 && b.structure[mirrorCell(c)] === 1);
  check('mirror is self-inverse', mirrorCell(mirrorCell(c)) === c);
  const removed = b.remove(c, false);
  check('remove one of the pair', removed.length === 1 && b.count() === 1);
  b.undo(); // restore removed
  b.undo(); // un-place both
  check('undo to empty', b.count() === 0);
  const rd = b.redo();
  check('redo replaces pair', rd.placed.length === 2 && b.count() === 2);

  // load + undo
  const shape = unpackShape(packed, 0);
  b.load(shape);
  const n = b.count();
  check('load applies shape over junk', n > 0 && [...b.structure].every((v, i) => v === shape[i]));
  b.undo();
  check('undo load restores pair', b.count() === 2);

  // codec roundtrip
  const rand = mulberry32(11);
  const s = new Uint8Array(NCELLS);
  for (let i = 0; i < NCELLS; i++) s[i] = rand() < 0.2 ? 1 : 0;
  const enc = encodeStructure(s);
  const dec = decodeStructure(enc);
  check('codec roundtrip', dec !== null && dec.every((v, i) => v === s[i]), `${enc.length} chars`);
  check('codec rejects garbage', decodeStructure('!!!') === null && decodeStructure(enc.slice(1)) === null);
  const encShape = encodeStructure(shape);
  const decShape = decodeStructure(encShape);
  check('codec roundtrip on dataset shape', decShape.every((v, i) => v === shape[i]));
}

console.log(failures ? `\n${failures} FAILURE(S)` : '\nall good');
process.exit(failures ? 1 : 0);

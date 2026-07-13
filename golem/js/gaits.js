// golem — actuation. Identity becomes a verb, but decentralized-flavored:
//
//  - The gait clock is a KURAMOTO field: every cube carries a phase oscillator
//    coupled only to its face-neighbours. They synchronise in a few seconds —
//    a shared clock with no global timer. Cut the body in half and each half's
//    clock re-syncs on its own.
//  - The throttle is the consensus: fraction of cubes voting for the lead
//    class × the clock's sync order-parameter r. A confused or desynchronised
//    swarm barely moves; conviction drives.
//  - The verb is the lead class: plane flies, chair/table waddle, car drives,
//    house refuses, guitar sings, boat sails.
//
// Pure module: arrays in, kinematics out. No DOM/three. Deterministic given
// (seed, dt sequence). Node-tested in gaits.selftest.mjs.

import { NCELLS, NEIGHBORS, mulberry32 } from './nca.js';

// class indices: 0 Plane · 1 Chair · 2 Car · 3 Table · 4 House · 5 Guitar · 6 Boat
export const VERB_NAMES = ['flies', 'waddles', 'drives', 'waddles', 'stays home', 'sings', 'sails'];

// ---------------------------------------------------------------- Kuramoto
export class Clock {
  constructor(cells, seed = 1) {
    this.rand = mulberry32(seed);
    this.omega = 2 * Math.PI * 0.9;   // base gait frequency, Hz-ish
    this.K = 6.0;                     // face-neighbour coupling strength
    this.Kg = 2.5;                    // mean-field (shared-body sway) coupling
    this.idx = new Int32Array(NCELLS).fill(-1);
    this.cells = [];
    this.phases = new Float32Array(0);
    this.rebuild(cells);
  }

  // Keep phases of surviving cells; new cells join at a random phase.
  rebuild(cells) {
    const old = new Float32Array(NCELLS);
    for (let i = 0; i < this.cells.length; i++) old[this.cells[i]] = this.phases[i] + 1e-6;
    this.cells = [...cells];
    this.phases = new Float32Array(this.cells.length);
    this.idx.fill(-1);
    for (let i = 0; i < this.cells.length; i++) {
      const c = this.cells[i];
      this.idx[c] = i;
      this.phases[i] = old[c] !== 0 ? old[c] - 1e-6 : this.rand() * 2 * Math.PI;
    }
  }

  step(dt) {
    const n = this.cells.length;
    if (!n) return;
    const ph = this.phases, idx = this.idx;
    // Weak mean-field term on top of face-neighbour coupling: the cubes share
    // one rigid body, so the collective sway is something every cube feels.
    // (Pure nearest-neighbour Kuramoto also syncs, but slowly, and loopy
    // bodies can trap twisted states; the mechanical mean field breaks them.)
    let re = 0, im = 0;
    for (let i = 0; i < n; i++) { re += Math.cos(ph[i]); im += Math.sin(ph[i]); }
    const r = Math.hypot(re, im) / n, psi = Math.atan2(im, re);
    const dph = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const c = this.cells[i];
      let sum = 0, deg = 0;
      for (let d = 1; d < 7; d++) {
        const nb = NEIGHBORS[c * 7 + d];
        if (nb < 0) continue;
        const j = idx[nb];
        if (j < 0) continue;
        sum += Math.sin(ph[j] - ph[i]);
        deg++;
      }
      dph[i] = this.omega + (deg ? (this.K / deg) * sum : 0) + this.Kg * r * Math.sin(psi - ph[i]);
    }
    for (let i = 0; i < n; i++) {
      ph[i] += dph[i] * dt;
      if (ph[i] > 1e4) ph[i] -= 1e4; // keep bounded; only relative phase matters
    }
  }

  // Sync order parameter r ∈ [0,1] and mean phase ψ.
  order() {
    const n = this.cells.length;
    if (!n) return { r: 0, psi: 0 };
    let re = 0, im = 0;
    for (let i = 0; i < n; i++) { re += Math.cos(this.phases[i]); im += Math.sin(this.phases[i]); }
    return { r: Math.hypot(re, im) / n, psi: Math.atan2(im, re) };
  }
}

// ---------------------------------------------------------------- verbs
export const WORLD_RADIUS = 26;   // creatures steer back inside this

export function createKin(seed = 1) {
  const rand = mulberry32(seed);
  return {
    pos: [0, 0, 0], yaw: rand() * 2 * Math.PI,
    // pose offsets the renderer applies on top of pos/yaw:
    bounce: 0, pitch: 0, roll: 0, alt: 0, settle: 0, shimmer: 0,
    speed: 0,
    tAwake: 0, tVerb: 0, lastPsi: 0,
    s1: rand() * 10, s2: rand() * 10, // wander seeds
    flags: { water: false, smoke: false, pluck: 0, airborne: false },
  };
}

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const wander = (k, t) => Math.sin(t * 0.31 + k.s1) * 0.7 + Math.sin(t * 0.73 + k.s2) * 0.3;

// Steer back toward origin when out past the fence.
function boundarySteer(k) {
  const d = Math.hypot(k.pos[0], k.pos[2]);
  if (d < WORLD_RADIUS * 0.75) return 0;
  const toCenter = Math.atan2(-k.pos[2], -k.pos[0]);
  let diff = toCenter - k.yaw;
  while (diff > Math.PI) diff -= 2 * Math.PI;
  while (diff < -Math.PI) diff += 2 * Math.PI;
  return clamp(diff, -1, 1) * clamp((d - WORLD_RADIUS * 0.75) / (WORLD_RADIUS * 0.25), 0, 1.5);
}

// One actuation tick. S = { lead, consensus, entropy, r, psi } from body/clock.
// Mutates kin. dt in seconds.
export function applyVerb(kin, S, dt) {
  kin.tAwake += dt;
  kin.tVerb += dt;
  const wakeRamp = clamp(kin.tAwake / 1.5, 0, 1);
  const throttle = clamp((S.consensus - 0.45) / 0.45, 0, 1) * S.r * wakeRamp;
  kin.flags.water = false; kin.flags.smoke = false; kin.flags.pluck = 0; kin.flags.airborne = false;
  let speed = 0, yawRate = 0;
  kin.bounce = 0; kin.pitch = 0; kin.roll = 0; kin.shimmer = 0;
  if (S.lead !== 4) kin.settle = Math.max(0, kin.settle - 0.1 * dt); // un-settle if it changes its mind

  switch (S.lead) {
    case 2: { // Car — drives
      speed = 6.5 * throttle;
      yawRate = 0.7 * wander(kin, kin.tVerb) * throttle;
      kin.bounce = 0.09 * Math.sin(2 * S.psi) * throttle;
      kin.pitch = -0.03 * throttle;
      kin.alt = Math.max(0, kin.alt - 6 * dt);
      break;
    }
    case 6: { // Boat — sails
      speed = 2.4 * throttle;
      yawRate = 0.35 * wander(kin, kin.tVerb) * throttle;
      kin.bounce = 0.22 * Math.sin(S.psi * 0.9) * (0.3 + 0.7 * throttle);
      kin.roll = 0.08 * Math.sin(S.psi * 0.6 + 1.2);
      kin.pitch = 0.04 * Math.sin(S.psi * 0.5);
      kin.flags.water = true;
      kin.alt = Math.max(0, kin.alt - 6 * dt);
      break;
    }
    case 0: { // Plane — taxi, climb, circuit, land, repeat
      const T = kin.tVerb % 40;
      if (throttle < 0.15) { // no conviction: descend and stop
        kin.alt = Math.max(0, kin.alt - 4 * dt);
        speed = kin.alt > 0.1 ? 5 : 0;
      } else if (T < 3) {            // taxi
        speed = 4 * throttle;
        kin.alt = Math.max(0, kin.alt - 4 * dt);
      } else if (T < 9) {            // climb
        speed = 9 * throttle;
        kin.alt = Math.min(12, kin.alt + 2.6 * dt);
        kin.pitch = -0.18;
      } else if (T < 30) {           // cruise circuit
        speed = 10 * throttle;
        yawRate = 0.45;
        kin.roll = 0.28;
        kin.alt = Math.min(12, kin.alt + 1 * dt);
      } else if (T < 37) {           // descend
        speed = 7 * throttle;
        kin.alt = Math.max(0, kin.alt - 2.2 * dt);
        kin.pitch = 0.10;
      } else {                       // rollout
        speed = 2 * throttle;
        kin.alt = Math.max(0, kin.alt - 4 * dt);
      }
      kin.flags.airborne = kin.alt > 0.2;
      break;
    }
    case 1: case 3: { // Chair / Table — waddle on their legs
      const pulse = Math.max(0, Math.sin(S.psi)) ** 2;
      speed = 1.6 * throttle * pulse;
      yawRate = 0.5 * wander(kin, kin.tVerb) * throttle;
      kin.bounce = 0.14 * pulse * throttle;
      kin.roll = 0.10 * Math.sin(S.psi) * throttle;
      kin.pitch = 0.05 * Math.sin(2 * S.psi) * throttle;
      kin.alt = Math.max(0, kin.alt - 6 * dt);
      break;
    }
    case 5: { // Guitar — stays and sings
      kin.shimmer = 0.05 * throttle;
      kin.roll = 0.03 * Math.sin(S.psi) * throttle;
      // pluck on each clock wrap: pentatonic over A3, seeded walk
      if (Math.sin(S.psi) >= 0 && Math.sin(kin.lastPsi) < 0 && throttle > 0.2) {
        const penta = [220, 261.6, 293.7, 329.6, 392, 440];
        kin.flags.pluck = penta[Math.floor((wander(kin, kin.tVerb) * 0.5 + 0.5) * penta.length) % penta.length];
      }
      kin.alt = Math.max(0, kin.alt - 6 * dt);
      break;
    }
    case 4: default: { // House — refuses to move
      kin.settle = Math.min(0.14, kin.settle + 0.05 * dt * wakeRamp);
      kin.bounce = 0.03 * Math.sin(30 * kin.tAwake) * Math.exp(-2 * kin.tAwake); // one shiver, then done
      kin.flags.smoke = throttle > 0.3;
      kin.alt = Math.max(0, kin.alt - 6 * dt);
      break;
    }
  }

  yawRate += boundarySteer(kin) * (speed > 0.05 ? 1.2 : 0);
  kin.yaw += yawRate * dt;
  kin.pos[0] += Math.cos(kin.yaw) * speed * dt;
  kin.pos[2] += Math.sin(kin.yaw) * speed * dt;
  kin.pos[1] = kin.alt;
  kin.speed = speed;
  kin.lastPsi = S.psi;
  // twitch amplitude for the renderer: fidget when unsure, calm when sure
  kin.twitch = 0.10 * S.entropy * wakeRamp;
  return kin;
}

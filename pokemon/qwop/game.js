// game.js — four cilia, four keys, and something eating you.
//
// QWOP's actual idea is not "hard controls". It is that the game takes away the
// abstraction you expected — "run" — and hands you the layer underneath, so
// locomotion stops being a verb and becomes a skill you have to build. The
// flagella model has exactly that layer sitting there already, and it comes
// with a free gift: *Pterosperma* has FOUR CILIA. One per key.
//
//   Q  W  O  P
//   └──┴──┴──┴── left to right across the anterior groove
//
// HOLD a key and dynein engages: that cilium beats. PRESS a key and its beat
// resets to the start of its power stroke. Those two facts are the whole game,
// because of what sits between them:
//
//   THE CILIA ARE DETUNED. Each has a slightly different intrinsic frequency
//   (real cilia do). Held down together they drift out of phase within a
//   second or two.
//
//   PHASE COHERENCE IS WHAT BUNDLES THEM. Four cilia beating in phase pull
//   together into one compound cilium — the thing the real organism does to
//   swim — and a bundle is far faster than four filaments sawing at each
//   other. Out of phase, their thrust vectors point in different directions,
//   partly cancel, and the leftover torque spins you.
//
// So you cannot just hold all four down. You have to re-tap, in rhythm, to
// drag them back into phase. That is the QWOP.
//
// Steering falls out of the same mechanic for free: drive the left pair and
// the net thrust acts off-centre, so you turn. Dodging means deliberately
// breaking your own bundle, which costs you the speed you spent effort
// building. That is the interesting decision.
//
// And the predators come from the paper. A real Pterosperma is stopped 96.6%
// of the time — the paper reads it as a sit-and-wait animal. Here that is a
// strategy rather than a statistic: a beating cell pushes a flow signature
// that predators feel from a long way off, and a stopped one is nearly
// invisible. Sprinting is how you make distance and how you get eaten.
//
// Nothing in ../proteus/flagella.js is modified or re-implemented here. Each
// cilium is one instance of it with nFilaments = 1, and this file drives the
// phase and frequency that the player is really controlling. The behaviour
// chain (Stop/Swim/Reorient) is deliberately NOT used: the player is the
// controller now, and produces those states by hand.

import {
  PTEROSPERMA, createFlagellation, referenceThrust,
  synthesize, thrust, dragCoefficients, SWIM,
} from '../proteus/flagella.js';

const TWO_PI = Math.PI * 2;

// ---------------------------------------------------------------- the cell --

export const KEYS = ['q', 'w', 'o', 'p'];

// Where each basal body sits around the anterior groove, in radians from the
// body axis. The real arrangement is 3+1 — three clustered, one offset — and
// this is a symmetric four instead, traded knowingly: with 3+1 the left and
// right halves steer differently and the controls stop being learnable.
export const BASAL_ANGLES = [-0.46, -0.16, 0.16, 0.46];

// Intrinsic frequency of each cilium as a fraction of the driven target.
// Deterministic, not random: the drift has to be the same every run or the
// player cannot learn the rhythm. This detune is the entire reason holding all
// four keys down does not work.
//
// It is TORQUE-BALANCED, and that is load-bearing rather than tidy. Each
// cilium's contribution to turning is weighted by where it sits in the groove
// (BASAL_ANGLES), so going straight requires sum(basal_i * detune_i) == 0
// rather than merely a symmetric-looking list. An earlier version ran the
// detune as a simple ramp — 0.94, 0.985, 1.02, 1.065 — which left the
// right-hand cilia permanently the faster ones. The cell turned left forever,
// swam in circles at 50 degrees a second, never advanced along the course, and
// so hardly ever met a predator: the difficulty curve was being set by a
// steering bug.
//
// These four are four genuinely different frequencies, and that is the point.
// A version that paired them up (outer pair equal, inner pair equal) tracked
// perfectly straight — and killed the game. With only two distinct
// frequencies the order parameter of a held cell averages <|cos(d/2)|> = 2/pi
// = 0.637 no matter how far apart you set them, so the phases keep
// re-aligning on their own, holding all four stops being a mistake, and the
// skill gradient collapses from 1.6x to 1.3x. Four frequencies average nearer
// 0.40 and holding stays punished.
//
//   d = [1-a, 1+b, 1-b, 1+a]  with  a = 0.02, b = 0.0575
//
// The cost is that the cell does NOT track straight on its own: four unequal
// cilia leave a residual spin of roughly 8 degrees a second. That is kept
// rather than trimmed away, because it is worth about 7% of the player's
// turning authority (which is ~115 deg/s from one side alone) and holding a
// heading is a reasonable thing to ask of someone flying four oars by hand.
// The selftest checks that margin, since a drift the player cannot out-steer
// would be a broken game rather than a demanding one.
const DETUNE = [0.98, 1.0575, 0.9425, 1.02];

const DRIVEN_HZ = PTEROSPERMA.swimFreqHz.mean;      // 95 Hz, held
const IDLE_HZ = PTEROSPERMA.stopFreqHz.mean;        // 10 Hz, released — unfurled

// How fast a cilium spins up and down when the key changes. Spin-up is quicker
// than spin-down, so a tap gives a real kick and the cilium then coasts.
const SPINUP_TAU = 0.09;
const SPINDOWN_TAU = 0.30;

export function createCell(opts = {}) {
  // Display slow-motion. Also sets the pace of the game: the cell's translation
  // is divided by the same factor as its beat, so distance per beat cycle stays
  // honest, and a full sprint reads as ~150 um/s against predators that cruise
  // at 30-170. Faster settings shorten the phase-drift window enough that
  // holding all four keys stops being a mistake, which flattens the skill
  // gradient the selftest measures.
  const beatScale = opts.beatScale ?? 10;
  const cilia = BASAL_ANGLES.map((basal, i) => {
    const fl = createFlagellation(null, {
      seed: 900 + i * 7,
      beatScale,
      stateScale: 0,            // the chain is frozen; the player is in charge
    });
    // One filament each: these are four separate cilia, not one bundle of four.
    fl.nFilaments = 1;
    fl.thrustRef = referenceThrust(fl);
    fl.freqHz = IDLE_HZ;
    fl.phase = i * 0.11;        // start slightly apart, as they really would be
    fl.bendAmp = 0;
    return {
      fl, basal, detune: DETUNE[i],
      // Cilia on the left of the groove beat in mirror image to those on the
      // right. This is not a fudge to make the maths cancel — it is what
      // bilaterally arranged cilia actually do (Chlamydomonas' two flagella
      // beat as a mirrored breaststroke, which is precisely why it swims in a
      // straight line). Without it every cilium's sideways thrust points the
      // same way, they sum instead of cancelling, and the cell corkscrews at
      // 200 degrees a second no matter what the player presses.
      mirror: basal < 0 ? -1 : 1,
      held: false,
      drive: 0,                 // 0..1, ramps with the key
      // Cycle-averaged thrust in the cilium's own frame (+x along its base
      // tangent). Averaged for the same reason flagella.js averages: the
      // instantaneous within-beat thrust swings by more than an order of
      // magnitude and its sign reverses every half-cycle. Using the raw
      // magnitude rectifies the recovery stroke into forward push and the cell
      // swims about ten times too fast — which is what the first draft did.
      avg: { x: 0, y: 0 },
      force: { x: 0, y: 0 },    // world-frame, this tick
    };
  });

  return {
    cilia,
    beatScale,
    // Body state. Position in um, heading in radians. Overdamped — at this
    // Reynolds number there is no inertia, so there is no velocity to carry.
    // heading is the axis of the CILIARY APPARATUS, not the direction of
    // travel. Pterosperma's cilia beat with a base-to-tip wave, which pushes
    // the cell toward the base — so the body leads and the bundle streams out
    // behind it, and the cell travels along -heading (flagella.js, waveDir).
    // Starting at PI therefore points the apparatus at -x and sends the cell
    // down the course in +x, which is what progressUm and the predator seeding
    // assume. Every relative geometry below is untouched by this: the groove,
    // the splay, the torque arms and the detune balance are all as measured.
    x: 0, y: 0, heading: Math.PI,
    speedUmS: 0, turnRate: 0,
    // Phase coherence of the driven cilia, and the bundle it produces.
    coherence: 0, bundle: 0,
    // How loud the cell is, 0..1. Predators hear this.
    signature: 0,
    // Bookkeeping. `progressUm` is the score: the furthest point down the
    // course reached, not the path walked to get there. Those are not the same
    // thing and the difference is a whole exploit — scoring path length means
    // the best strategy is to swim in tight circles somewhere safe forever,
    // racking up millimetres while never advancing into anything dangerous.
    // Scoring the high-water mark makes circling worth exactly nothing, which
    // is also why predators are seeded ahead of it rather than ahead of x.
    progressUm: 0,
    distanceUm: 0, elapsed: 0,
    trail: [],
    alive: true,
  };
}

// Drag on the whole animal, in units of viscosity. Body plus four cilia.
const BODY_RADIUS_UM = 0.25 * (PTEROSPERMA.bodyLongUm + PTEROSPERMA.bodyShortUm);
const CILIUM_COEF = dragCoefficients(PTEROSPERMA.ciliumLenUm, 0.1);
const TRANS_DRAG =
  6 * Math.PI * BODY_RADIUS_UM + 4 * CILIUM_COEF.par * PTEROSPERMA.ciliumLenUm;

// Rotational drag. A sphere gives 8*pi*a^3, which is negligible next to four
// 67 um oars; the cilia dominate, contributing about zeta_perp * L^3 / 3 each.
// Scaled by ROT_EASE, which is the one tuning constant in the physics here:
// the true value makes the cell turn far too slowly to dodge anything at
// playable speed.
const ROT_EASE = 26;
const ROT_DRAG =
  (8 * Math.PI * Math.pow(BODY_RADIUS_UM, 3)
    + 4 * CILIUM_COEF.perp * Math.pow(PTEROSPERMA.ciliumLenUm, 3) / 3) / ROT_EASE;

// Bundled cilia beat as one compound cilium and are meaningfully more
// effective than four separate ones. This is the reward for staying in phase,
// on top of the direction-cancellation that already punishes being out of it.
//
// Unlike everything else here this is a GAME constant, not a measurement — the
// paper says the cilia bundle, not by how much it helps. It is set by the
// skill gradient it produces: at this value rhythmic play travels about 1.6x
// as far as holding all four keys and 1.8x as far as mashing, which is a
// difference a player can feel within one run. Pushed higher the gradient gets
// steeper but a sprint outruns anything the model itself will produce; at this
// value a full bundle swims ~1500 um/s, above the measured 646 mean but inside
// the two orders of magnitude the paper reports. The selftest holds the ratios.
const BUNDLE_GAIN = 2.2;

// How far the basal bodies are spread across the anterior groove, in um. This
// is the lever the whole steering system works on: a cilium's thrust acts
// along its own axis, so the moment about the cell centre comes from where its
// base sits and how far off-axis it points. On a 9 um cell the groove is a few
// microns across.
const GROOVE_UM = 3.0;

export function setKey(cell, index, down) {
  const c = cell.cilia[index];
  if (!c) return;
  // The rising edge is the mechanic. A press restarts the power stroke, which
  // is how a player drags four detuned cilia back into phase.
  if (down && !c.held) {
    c.fl.phase = 0;
    // Resetting the phase reshapes the waveform between one tick and the next,
    // and thrust() reads its velocities from a finite difference across
    // exactly that gap. Without this it would see the jump as an enormous
    // impulse — the same trap flagella.js documents on a frequency change.
    c.fl.havePrev = false;
  }
  c.held = down;
}

export function tickCell(cell, dt) {
  if (!cell.alive) return;

  // 1. Each cilium spins toward the frequency its key is asking for.
  for (const c of cell.cilia) {
    const target = c.held ? 1 : 0;
    const tau = c.held ? SPINUP_TAU : SPINDOWN_TAU;
    c.drive += (target - c.drive) * (1 - Math.exp(-dt / tau));
    const want = (IDLE_HZ + (DRIVEN_HZ - IDLE_HZ) * c.drive) * c.detune;
    c.fl.freqHz = want;
    c.fl.phase = (c.fl.phase + (want / cell.beatScale) * dt) % 1;
  }

  // 2. Phase coherence across the cilia that are actually being driven. This
  //    is the Kuramoto order parameter: 1 when they beat as one, 0 when they
  //    are scattered. Undriven cilia are excluded — a cell coasting on one
  //    cilium is not "perfectly in phase with itself".
  let sx = 0, sy = 0, wsum = 0;
  for (const c of cell.cilia) {
    const w = c.drive;
    sx += Math.cos(TWO_PI * c.fl.phase) * w;
    sy += Math.sin(TWO_PI * c.fl.phase) * w;
    wsum += w;
  }
  const activeCount = cell.cilia.reduce((n, c) => n + (c.drive > 0.35 ? 1 : 0), 0);
  const raw = wsum > 0.2 ? Math.hypot(sx, sy) / wsum : 0;
  // One cilium alone is trivially "coherent"; that must not read as a bundle.
  cell.coherence = activeCount >= 2 ? raw : 0;
  const wantBundle = cell.coherence * Math.min(1, activeCount / 3);
  cell.bundle += (wantBundle - cell.bundle) * (1 - Math.exp(-dt / 0.18));

  // 3. Each cilium's own thrust, in its own direction. Splay closes as the
  //    bundle forms, which is both what the organism does and what turns four
  //    arguing oars into one that agrees with itself.
  //
  //    Worked in the BODY frame — +x along the heading — and rotated out at
  //    the end. Torque in 2D is frame-independent, and doing it this way makes
  //    the geometry legible: each basal body sits at the anterior pole, spread
  //    a little across the groove, and each cilium points off-axis by its own
  //    splayed angle. A cilium pointing off-axis at the front of the cell is
  //    what turns it.
  const splay = (1 - cell.bundle) * 1.0;
  let bfx = 0, bfy = 0, torque = 0;
  for (const c of cell.cilia) {
    synthesize(c.fl, SWIM);
    const t = thrust(c.fl, dt);
    // Display-frame -> model-frame is ONE factor of beatScale: resistive force
    // theory is linear in velocity. (See flagella.js — getting this wrong is a
    // documented past bug.)
    const ix = t.fx * cell.beatScale, iy = t.fy * cell.beatScale;
    const period = cell.beatScale / Math.max(1, c.fl.freqHz);
    const a = 1 - Math.exp(-dt / Math.max(1e-5, period * 3));
    c.avg.x += (ix - c.avg.x) * a;
    c.avg.y += (iy - c.avg.y) * a;

    // Where this cilium points, relative to the body axis.
    const ang = c.basal * (0.35 + splay);
    const ca = Math.cos(ang), sa = Math.sin(ang);
    // Its thrust, mirrored for its side of the groove, then rotated from the
    // cilium's own frame into the body's.
    const ay = c.avg.y * c.mirror;
    const fxi = c.avg.x * ca - ay * sa;
    const fyi = c.avg.x * sa + ay * ca;
    c.force.x = fxi; c.force.y = fyi;
    bfx += fxi; bfy += fyi;

    // Basal body position: at the anterior pole, offset across the groove.
    const rx = BODY_RADIUS_UM;
    const ry = c.basal * GROOVE_UM;
    torque += rx * fyi - ry * fxi;
  }
  const gain = 1 + (BUNDLE_GAIN - 1) * cell.bundle;
  bfx *= gain; bfy *= gain; torque *= gain;

  // Body frame -> world.
  const ch = Math.cos(cell.heading), sh = Math.sin(cell.heading);
  const fx = bfx * ch - bfy * sh;
  const fy = bfx * sh + bfy * ch;

  // 4. Overdamped motion. No inertia, no coasting: velocity is force over
  //    drag, exactly as in the /flag instrument.
  const vx = fx / TRANS_DRAG, vy = fy / TRANS_DRAG;
  const omega = torque / ROT_DRAG;
  // Shown in the same slow motion as the beat, so distance per beat cycle
  // stays honest.
  const shown = 1 / cell.beatScale;
  cell.x += vx * shown * dt;
  cell.y += vy * shown * dt;
  cell.heading += omega * shown * dt;
  cell.speedUmS = Math.hypot(vx, vy);
  cell.turnRate = omega;

  cell.distanceUm += Math.hypot(vx, vy) * shown * dt;
  cell.progressUm = Math.max(cell.progressUm, cell.x);
  cell.elapsed += dt;

  // 5. Hydrodynamic signature. A beating cell pushes a flow that a predator
  //    feels; a stopped one does not. Driven by how hard the cilia are working
  //    and how much they are moving the animal, which is why sprinting in a
  //    tight bundle is both the fastest and the loudest thing you can do.
  const effort = cell.cilia.reduce((s, c) => s + c.drive, 0) / cell.cilia.length;
  const wantSig = Math.min(1, effort * 0.75 + Math.min(1, cell.speedUmS / 700) * 0.45);
  const rising = wantSig > cell.signature;
  cell.signature += (wantSig - cell.signature) * (1 - Math.exp(-dt / (rising ? 0.12 : 0.9)));

  const last = cell.trail[cell.trail.length - 1];
  if (!last || Math.hypot(cell.x - last.x, cell.y - last.y) > 2.5) {
    cell.trail.push({ x: cell.x, y: cell.y });
    if (cell.trail.length > 260) cell.trail.shift();
  }
}

// The cell's tip positions, for drawing and for nothing else.
export function ciliumPath(cell, c, pxPerUm) {
  const splay = (1 - cell.bundle) * 1.0;
  const ang = cell.heading + c.basal * (0.35 + splay);
  const ca = Math.cos(ang), sa = Math.sin(ang);
  const M = c.fl.theta.length;
  const out = new Float32Array(M * 2);
  for (let j = 0; j < M; j++) {
    const lx = c.fl.xy[j * 2] * pxPerUm;
    const ly = c.fl.xy[j * 2 + 1] * pxPerUm * c.mirror;
    out[j * 2] = lx * ca - ly * sa;
    out[j * 2 + 1] = lx * sa + ly * ca;
  }
  return out;
}

// ---------------------------------------------------------------- predators --
// Three things that want to eat you, distinguished by how they hunt rather
// than by how fast they are, so that the counterplay differs.

export const PREDATOR_KINDS = {
  // Drifts a patrol line, hears moderately, gives up quickly. Slower than a
  // bundled cell, so the answer is simply to swim.
  copepod: { r: 22, cruise: 30, chase: 105, hearing: 220, patience: 2.2, color: '#c8708a' },
  // Sits still and listens a very long way, but is slow off the mark. The
  // answer is to go quiet early, well before you are alongside it.
  medusa: { r: 34, cruise: 6, chase: 70, hearing: 380, patience: 4.0, color: '#8a7ad0' },
  // Faster than you and relentless, but nearly deaf. The answer is that it
  // must never hear you at all — there is no outrunning it.
  arrow: { r: 16, cruise: 62, chase: 175, hearing: 130, patience: 6.0, color: '#d08a4a' },
};

function mulberry32(seed) {
  let s = seed >>> 0;
  return function () {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function createWorld(seed = 7) {
  return {
    rng: mulberry32(seed),
    predators: [],
    spawnedTo: 0,          // um of x-axis already populated
    laneHalf: 260,         // um; the swimmable corridor half-width
  };
}

// Where the ocean starts having opinions. The first stretch is empty on
// purpose: a player who has just been told "four keys, work it out" needs room
// to discover that tapping beats holding before anything is allowed to eat
// them. Measured, not guessed — without this a tenth of all runs ended under
// 200 um, which is about two seconds and reads as the game being broken.
const GRACE_UM = 900;
// Each predator is held back until the player has come far enough to have
// plausibly learned the counterplay it demands.
const DEBUT_UM = { copepod: 0, medusa: 1600, arrow: 4500 };

// Populate ahead of the cell. Difficulty rises with distance: they pack closer
// together, and the nastier ones join in.
export function spawnAhead(world, cell) {
  const horizon = Math.max(cell.x, cell.progressUm) + 1400;
  if (world.spawnedTo < GRACE_UM) world.spawnedTo = GRACE_UM;
  while (world.spawnedTo < horizon) {
    const progress = Math.min(1, world.spawnedTo / 12000);
    // 650-1400 um apart at the start, closing to about half that.
    const gap = (650 + world.rng() * 750) * (1 - 0.45 * progress);
    world.spawnedTo += gap;

    const allowed = Object.keys(DEBUT_UM).filter((k) => world.spawnedTo >= DEBUT_UM[k]);
    const roll = world.rng();
    let kind = 'copepod';
    if (allowed.includes('arrow') && roll > 0.80) kind = 'arrow';
    else if (allowed.includes('medusa') && roll > 0.45) kind = 'medusa';
    const spec = PREDATOR_KINDS[kind];
    const y = (world.rng() * 2 - 1) * (world.laneHalf - spec.r);
    world.predators.push({
      kind, spec,
      x: world.spawnedTo, y,
      vx: 0, vy: 0,
      homeY: y,
      phase: world.rng() * TWO_PI,
      alerted: 0,           // seconds of memory left
    });
  }
}

export function tickPredators(world, cell, dt) {
  spawnAhead(world, cell);
  for (let i = world.predators.length - 1; i >= 0; i--) {
    const p = world.predators[i];
    // Cull well behind the cell so the array does not grow without bound.
    if (p.x < cell.x - 1200) { world.predators.splice(i, 1); continue; }

    const dx = cell.x - p.x, dy = cell.y - p.y;
    const dist = Math.hypot(dx, dy) || 1e-6;

    // Detection. Hearing range scales with how loud the cell currently is, so
    // going quiet genuinely erases you — but only from predators that have not
    // already locked on, which is what makes a late panic-stop a bad idea.
    const heard = p.spec.hearing * (0.16 + 0.84 * cell.signature);
    if (dist < heard) p.alerted = p.spec.patience;
    else p.alerted = Math.max(0, p.alerted - dt);

    if (p.alerted > 0 && cell.alive) {
      const s = p.spec.chase;
      p.vx = (dx / dist) * s;
      p.vy = (dy / dist) * s;
    } else {
      // Patrol: drift back toward the lane it was spawned on, bobbing.
      p.phase += dt * 0.7;
      p.vx = -p.spec.cruise * 0.35;
      p.vy = Math.sin(p.phase) * p.spec.cruise * 0.5 + (p.homeY - p.y) * 0.5;
    }
    p.x += p.vx * dt;
    p.y += p.vy * dt;

    if (cell.alive && dist < p.spec.r + BODY_RADIUS_UM * 2.2) {
      cell.alive = false;
      cell.killedBy = p.kind;
    }
  }
}

// The corridor walls. Swimming into one does not kill you, it just stops you —
// there is enough here that wants you dead already.
export function clampToLane(world, cell) {
  const lim = world.laneHalf;
  if (cell.y > lim) cell.y = lim;
  if (cell.y < -lim) cell.y = -lim;
}

// ------------------------------------------------------------- the session --

export function createGame(opts = {}) {
  const cell = createCell(opts);
  const world = createWorld(opts.seed ?? 7);
  return { cell, world, best: opts.best ?? 0, over: false };
}

export function tickGame(game, dt) {
  if (game.over) return;
  tickCell(game.cell, dt);
  clampToLane(game.world, game.cell);
  tickPredators(game.world, game.cell, dt);
  if (!game.cell.alive) {
    game.over = true;
    game.best = Math.max(game.best, game.cell.progressUm);
  }
}

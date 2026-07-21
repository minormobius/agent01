// dragon-sim.js — JS mirror of the Rust `dragon-solver`.
//
// The two-body visual-bearing combat law from Fabian, Yarger, Chen & Lin, "The aerial
// combat strategy of dragonflies", J. R. Soc. Interface 23:20260131 (2026): each male
// steers to hold his rival dead-ahead but slightly ELEVATED in his frontal visual field,
// and MODULATES SPEED by range (braking when close to avoid a direct collision). Both
// run the same rule, so chaser/evader roles reverse emergently and loops/spirals fall
// out of the coupling. A soft altitude band keeps the symmetric elevation preference from
// running away, a lateral juke prevents interpenetration, and a pitch limit caps dives.
//
// This is a line-for-line port of solver/dragon-solver/src/lib.rs so the page works with
// or without the wasm, and so `dragon-sim.selftest.mjs` can cross-check the two. Angles
// are radians; y is up (three.js convention). Output shape matches the wasm's
// `simulate_json` (flat pos/vel arrays of length 3*steps).

// ── minimal 3-vector ─────────────────────────────────────────────────────────────
const V = (x, y, z) => ({ x, y, z });
const add = (a, b) => V(a.x + b.x, a.y + b.y, a.z + b.z);
const sub = (a, b) => V(a.x - b.x, a.y - b.y, a.z - b.z);
const scale = (a, s) => V(a.x * s, a.y * s, a.z * s);
const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;
const cross = (a, b) => V(a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x);
const vlen = (a) => Math.sqrt(dot(a, a));
const norm = (a) => { const l = vlen(a); return l < 1e-12 ? V(0, 0, 1) : scale(a, 1 / l); };
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

const WORLD_UP = V(0, 1, 0);

// Rodrigues rotation of v about unit axis k by ang radians.
function rot(v, k, ang) {
  const s = Math.sin(ang), c = Math.cos(ang);
  return add(add(scale(v, c), scale(cross(k, v), s)), scale(k, dot(k, v) * (1 - c)));
}

// Right-handed body frame for a flyer heading along fwd. Degrades gracefully vertical.
function bodyFrame(fwd) {
  const f = norm(fwd);
  let right = cross(f, WORLD_UP);
  if (vlen(right) < 1e-6) {
    right = cross(f, V(0, 0, 1));
    if (vlen(right) < 1e-6) right = V(1, 0, 0);
  }
  right = norm(right);
  const up = norm(cross(right, f));
  return [right, up];
}

// Clamp a heading's pitch to +/- maxPitch (rad) — a flight envelope (no vertical dives).
function pitchLimit(f, maxPitch) {
  f = norm(f);
  const m = Math.sin(maxPitch);
  if (Math.abs(f.y) <= m) return f;
  const h = Math.sqrt(f.x * f.x + f.z * f.z);
  if (h < 1e-9) return f;
  const yc = Math.sign(f.y) * m;
  const hs = Math.sqrt(Math.max(0, 1 - yc * yc));
  return norm(V((f.x / h) * hs, yc, (f.z / h) * hs));
}

// Desired forward: d (dir to rival) tilted DOWN by elevSet, so steering onto it puts the
// rival dead-ahead and elevSet above the eye horizon.
function desiredForward(d, elevSet) {
  let axis = cross(d, WORLD_UP);
  if (vlen(axis) < 1e-6) return d;
  axis = norm(axis);
  const cand = rot(d, axis, elevSet);
  return cand.y <= d.y ? cand : rot(d, axis, -elevSet);
}

// Look angles of d in a body frame: [azimuth (+right), elevation (+up)].
function lookAngles(d, fwd, right, up) {
  const cf = dot(d, fwd), cr = dot(d, right), cu = dot(d, up);
  return [Math.atan2(cr, cf), Math.atan2(cu, cf)];
}

// Advance one flyer one step under the full guidance rule. Returns { pos, vel, sample }.
function stepAgent(me, foe, pref, cfg) {
  const toFoe = sub(foe.pos, me.pos);
  const range = vlen(toFoe);
  const d = norm(toFoe);

  const speed0 = vlen(me.vel);
  const fwd = speed0 > 1e-6 ? norm(me.vel) : d;
  const [right, up] = bodyFrame(fwd);
  const [az, el] = lookAngles(d, fwd, right, up);

  // (1) frontal + elevated aim
  let fDes = desiredForward(d, cfg.elevSet);
  // (2) altitude band: bias back toward the territory volume
  const altErr = clamp((me.pos.y - cfg.altBase) / cfg.altHalfband, -1, 1);
  fDes = norm(sub(fDes, scale(WORLD_UP, altErr * cfg.bandGain)));
  // (3) lateral collision avoidance inside the bubble
  if (range < cfg.avoidBubble) {
    const w = clamp((cfg.avoidBubble - range) / cfg.avoidBubble, 0, 1);
    let side = cross(WORLD_UP, d);
    if (vlen(side) < 1e-6) side = right;
    side = norm(side);
    if (dot(side, right) < 0) side = scale(side, -1);
    fDes = norm(add(scale(fDes, 1 - w), scale(side, w * cfg.avoidGain)));
  }
  // (4) flight envelope
  fDes = pitchLimit(fDes, cfg.pitchLimit);

  // steer: rotate forward toward fDes, rate-limited
  const ang = Math.acos(clamp(dot(fwd, fDes), -1, 1));
  const cmd = Math.min(cfg.turnGain * ang, cfg.turnMax);
  const stepAng = Math.min(cmd * cfg.dt, ang);
  const newFwd = ang < 1e-9 ? fwd : pitchLimit(rot(fwd, norm(cross(fwd, fDes)), stepAng), cfg.pitchLimit);
  const turnRate = stepAng / cfg.dt;

  // (5) speed modulation by range
  const t = clamp((range - cfg.brakeRange) / (cfg.standoff - cfg.brakeRange), 0, 1);
  const speedTarget = clamp(cfg.speedMin + t * (pref - cfg.speedMin), cfg.speedMin, cfg.speedMax);
  const dvCap = cfg.accelMax * cfg.dt;
  const dv = clamp(cfg.accelGain * (speedTarget - speed0) * cfg.dt, -dvCap, dvCap);
  const newSpeed = clamp(speed0 + dv, cfg.speedMin, cfg.speedMax);

  const newVel = scale(newFwd, newSpeed);
  const newPos = add(me.pos, scale(newVel, cfg.dt));

  return {
    pos: newPos, vel: newVel,
    sample: { pos: me.pos, vel: me.vel, speed: speed0, turnRate, range, azimuth: az, elevation: el },
  };
}

// Chase score: rival ahead of me AND me behind rival (seeing its tail).
function chaseScore(me, foe) {
  const d = norm(sub(foe.pos, me.pos));
  const frontal = Math.max(0, dot(norm(me.vel), d));
  const onTail = Math.max(0, dot(norm(foe.vel), d));
  return frontal * onTail;
}

/** Integrate a whole contest. `cfg` uses the same camelCase fields as the wasm ReqDto. */
export function simulate(cfg) {
  const n = cfg.steps;
  let a = { pos: V(...cfg.aPos), vel: V(...cfg.aVel) };
  let b = { pos: V(...cfg.bPos), vel: V(...cfg.bVel) };
  const prefA = cfg.speedPref * (1 - cfg.asym);
  const prefB = cfg.speedPref * (1 + cfg.asym);

  const mkAgent = () => ({
    pos: new Float64Array(3 * n), vel: new Float64Array(3 * n),
    speed: new Float64Array(n), turnRate: new Float64Array(n),
    range: new Float64Array(n), azimuth: new Float64Array(n), elevation: new Float64Array(n),
  });
  const out = { t: new Float64Array(n), a: mkAgent(), b: mkAgent(), role: new Float64Array(n) };

  const wr = (dst, i, s) => {
    dst.pos[3 * i] = s.pos.x; dst.pos[3 * i + 1] = s.pos.y; dst.pos[3 * i + 2] = s.pos.z;
    dst.vel[3 * i] = s.vel.x; dst.vel[3 * i + 1] = s.vel.y; dst.vel[3 * i + 2] = s.vel.z;
    dst.speed[i] = s.speed; dst.turnRate[i] = s.turnRate; dst.range[i] = s.range;
    dst.azimuth[i] = s.azimuth; dst.elevation[i] = s.elevation;
  };

  for (let i = 0; i < n; i++) {
    const na = stepAgent(a, b, prefA, cfg);
    const nb = stepAgent(b, a, prefB, cfg);

    const ca = chaseScore(a, b);
    const cb = chaseScore(b, a);
    out.role[i] = (ca - cb) / (ca + cb + 1e-9);

    out.t[i] = i * cfg.dt;
    wr(out.a, i, na.sample);
    wr(out.b, i, nb.sample);
    a = { pos: na.pos, vel: na.vel };
    b = { pos: nb.pos, vel: nb.vel };
  }
  return out;
}

/** Defaults mirroring `Config::default()` in the Rust core — the "matched duel". */
export function defaultConfig() {
  return {
    dt: 1 / 120,
    steps: 1440,
    elevSet: 0.17,
    turnGain: 8.0,
    turnMax: 5.0,
    pitchLimit: (55 * Math.PI) / 180,
    speedPref: 3.2,
    speedMax: 5.0,
    speedMin: 2.2,
    standoff: 1.8,
    brakeRange: 0.7,
    accelGain: 4.0,
    accelMax: 14.0,
    altBase: 2.2,
    altHalfband: 1.3,
    bandGain: 0.9,
    avoidBubble: 0.9,
    avoidGain: 1.6,
    asym: 0.0,
    aPos: [0.0, 2.4, -2.0], aVel: [1.6, 0.0, 2.8],
    bPos: [0.0, 2.0, 2.0], bVel: [-1.6, 0.0, -2.8],
  };
}

/**
 * Named bout presets — different contest "types" like the paper's reconstructions. Each
 * is a partial config layered onto defaultConfig(). The engine is the same; only the
 * initial geometry and a few gains change.
 */
export const PRESETS = {
  duel: {
    label: 'Matched duel',
    blurb: 'Two evenly-matched rivals loop and jockey; chaser and evader roles reverse.',
    cfg: {}, // = defaults
  },
  tailchase: {
    label: 'Stern chase',
    blurb: 'A pursuer sits on the quarry\'s tail, holding it dead-ahead & high while closing — the cleanest look at the guidance law. Ride the head-cam here.',
    cfg: {
      aPos: [0, 2.0, -3.5], aVel: [0, 0, 4.0],
      bPos: [0.1, 2.3, -1.0], bVel: [0.1, 0, 3.4],
      elevSet: 0.17, standoff: 2.4, speedPref: 3.8, turnMax: 4.5,
    },
  },
  spiral: {
    label: 'Rolling spiral',
    blurb: 'A tighter turn cap and higher elevation set-point wind the fight into a spiral.',
    cfg: {
      aPos: [-1.6, 2.0, -0.9], aVel: [2.2, 0, 2.2],
      bPos: [1.6, 2.4, 0.9], bVel: [-2.2, 0, -2.2],
      elevSet: 0.26, turnMax: 4.2, standoff: 2.0,
    },
  },
  mismatch: {
    label: 'Uneven pair',
    blurb: 'A speed asymmetry: the faster male tends to keep the initiative (fewer reversals).',
    cfg: {
      asym: 0.18, elevSet: 0.15,
      aPos: [-1.8, 2.2, -0.6], aVel: [2.6, 0, 1.6],
      bPos: [1.8, 2.2, 0.6], bVel: [-2.6, 0, -1.6],
    },
  },
};

/** Build a full config for a preset name. */
export function presetConfig(name) {
  const p = PRESETS[name] || PRESETS.duel;
  return { ...defaultConfig(), ...p.cfg };
}

// ═══════════════════════════════════════════════════════════════════════════════════
// TAG — two flyers with distinct "brains" play tag inside the arena. One is IT (pursuer,
// chases to the frontal set-point); the other evades (steers away + jukes). When IT
// closes inside tagRange the roles SWAP (after a short cooldown so they can't insta-re-
// tag). A round is a fixed clock. The bounded arena corners the evader so catches happen.
// Mirror of the Rust `simulate_tag`.
// ═══════════════════════════════════════════════════════════════════════════════════

/** Soft arena containment: bias a desired-forward back toward the centre near the wall. */
function contain(p, fdes, arenaR) {
  const r = Math.hypot(p.x, p.z);
  if (r < arenaR * 0.8) return fdes;
  const inward = norm(V(-p.x, 0, -p.z));
  const w = clamp((r - arenaR * 0.8) / (arenaR * 0.35), 0, 1);
  return norm(add(scale(fdes, 1 - w), scale(inward, w)));
}

/** Advance one flyer one tag-step. `pursuer` = is this flyer IT. Returns {pos,vel,sample}. */
function stepTag(me, foe, brain, pursuer, t, phase, cfg) {
  const toFoe = sub(foe.pos, me.pos);
  const range = vlen(toFoe);
  const d = norm(toFoe);
  const speed0 = vlen(me.vel);
  const fwd = speed0 > 1e-6 ? norm(me.vel) : d;
  const [right, up] = bodyFrame(fwd);
  const [az, el] = lookAngles(d, fwd, right, up);

  let fDes;
  if (pursuer) {
    fDes = desiredForward(d, brain.elevSet);                 // aim at the quarry, slightly high
  } else {
    fDes = scale(d, -1);                                     // flee: point away
    let side = cross(WORLD_UP, d); if (vlen(side) < 1e-6) side = right; side = norm(side);
    fDes = norm(add(fDes, scale(side, brain.juke * Math.sin(t * brain.jukeFreq + phase)))); // weave
  }
  const altErr = clamp((me.pos.y - cfg.altBase) / cfg.altHalfband, -1, 1);
  fDes = norm(sub(fDes, scale(WORLD_UP, altErr * cfg.bandGain)));
  fDes = contain(me.pos, fDes, cfg.arenaR);
  fDes = pitchLimit(fDes, brain.pitchLimit);

  const ang = Math.acos(clamp(dot(fwd, fDes), -1, 1));
  const cmd = Math.min(brain.turnGain * ang, brain.turnMax);
  const stepAng = Math.min(cmd * cfg.dt, ang);
  const newFwd = ang < 1e-9 ? fwd : pitchLimit(rot(fwd, norm(cross(fwd, fDes)), stepAng), brain.pitchLimit);
  const turnRate = stepAng / cfg.dt;

  // both fly hard; the pursuer presses a touch harder to make catches possible
  const target = pursuer ? brain.speedPref : brain.speedPref * 0.94;
  const dvCap = brain.accelMax * cfg.dt;
  const dv = clamp(brain.accelGain * (target - speed0) * cfg.dt, -dvCap, dvCap);
  const newSpeed = clamp(speed0 + dv, brain.speedMin, brain.speedMax);

  const newVel = scale(newFwd, newSpeed);
  const newPos = add(me.pos, scale(newVel, cfg.dt));
  return { pos: newPos, vel: newVel, sample: { pos: me.pos, vel: me.vel, speed: speed0, turnRate, range, azimuth: az, elevation: el } };
}

/** Play one tag round. Returns trajectories, the per-frame IT flag, tag frames, and the
 *  time each brain spent as IT (pursuing). */
export function simulateTag(cfg) {
  const n = cfg.steps;
  let a = { pos: V(...cfg.aPos), vel: V(...cfg.aVel) };
  let b = { pos: V(...cfg.bPos), vel: V(...cfg.bVel) };
  let aIt = !!cfg.aIsIt;
  const cool = Math.round(cfg.cooldown / cfg.dt);
  let lastTag = -cool - 1;

  const mk = () => ({ pos: new Float64Array(3 * n), vel: new Float64Array(3 * n), speed: new Float64Array(n),
    turnRate: new Float64Array(n), range: new Float64Array(n), azimuth: new Float64Array(n), elevation: new Float64Array(n) });
  const out = { t: new Float64Array(n), a: mk(), b: mk(), it: new Uint8Array(n), tags: [], itTimeA: 0, itTimeB: 0 };
  const wr = (dst, i, s) => { dst.pos[3*i]=s.pos.x; dst.pos[3*i+1]=s.pos.y; dst.pos[3*i+2]=s.pos.z;
    dst.vel[3*i]=s.vel.x; dst.vel[3*i+1]=s.vel.y; dst.vel[3*i+2]=s.vel.z; dst.speed[i]=s.speed; dst.turnRate[i]=s.turnRate;
    dst.range[i]=s.range; dst.azimuth[i]=s.azimuth; dst.elevation[i]=s.elevation; };

  for (let i = 0; i < n; i++) {
    const t = i * cfg.dt;
    const na = stepTag(a, b, cfg.brainA, aIt, t, 0.0, cfg);
    const nb = stepTag(b, a, cfg.brainB, !aIt, t, Math.PI, cfg);
    out.t[i] = t; out.it[i] = aIt ? 0 : 1;
    if (aIt) out.itTimeA += cfg.dt; else out.itTimeB += cfg.dt;
    const range = vlen(sub(a.pos, b.pos));
    if (range < cfg.tagRange && (i - lastTag) > cool) { aIt = !aIt; lastTag = i; out.tags.push(i); }
    wr(out.a, i, na.sample); wr(out.b, i, nb.sample);
    a = { pos: na.pos, vel: na.vel }; b = { pos: nb.pos, vel: nb.vel };
  }
  return out;
}

/** A default brain; layer overrides for the two competitors. */
export function defaultBrain() {
  return {
    speedPref: 4.0, speedMax: 5.5, speedMin: 1.8,
    turnGain: 9.0, turnMax: 6.5, pitchLimit: (55 * Math.PI) / 180,
    accelGain: 6.0, accelMax: 20.0, elevSet: 0.14,
    juke: 0.9, jukeFreq: 5.0,
  };
}

/** A full tag-round config for two brains; `aIsIt` sets who starts as pursuer. */
export function tagConfig(brainA, brainB, aIsIt) {
  return {
    dt: 1 / 120, steps: 2160,               // 18 s round
    brainA, brainB, aIsIt: !!aIsIt,
    tagRange: 0.45, cooldown: 0.6,
    arenaR: 6.6, altBase: 2.4, altHalfband: 1.5, bandGain: 0.9,
    aPos: [-2.4, 2.4, 0], aVel: [3.0, 0, 0.6],
    bPos: [2.4, 2.4, 0], bVel: [-3.0, 0, -0.6],
  };
}

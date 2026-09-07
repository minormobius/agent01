// game.js — a pick-and-place cell on a moving line. Four keys.
//
// THE DESIGN PROBLEM. A six-axis arm has six joints and there are four keys, so
// driving joints directly is off the table. But that is not how anybody
// operates an industrial arm anyway: you teach it POSES and play them back. A
// teach pendant records a handful of joint configurations and the program walks
// between them. So the player is the program.
//
//   Q  BIN     over the tote, clear of everything
//   W  APPROACH  poised above the line, tool pointing down
//   O  PICK    the same point, down at belt height
//   P  GRIP    close the jaws, and keep them closed
//
// Hold a key and the arm servos toward that pose at the AR4's real joint speed
// limit, 60 deg/s. Let go and it stops where it is. Press another and it
// re-aims from wherever it has got to, so a half-finished move blends into the
// next one — which is where the QWOP comes from.
//
// WHY THE MIDDLE KEY EXISTS, and this is the whole game. A joint-space move
// does not travel in a straight line. Going Q -> O directly is 40% quicker than
// Q -> W -> O, and it is quicker because it comes in SIDEWAYS: measured on the
// real chain, the direct move drags the gripper 191 mm along the belt at pick
// height, straight through the line of parts, while the two-leg move descends
// vertically onto the pick point and travels 0 mm sideways while low.
//
// That is not a rule invented for the game. It is why approach waypoints exist
// in real robot programs, and armline.selftest.mjs measures it on the real
// kinematics rather than asserting it.
//
// The line does not stop. Every second spent going the safe way is a part gone
// past — which is exactly the pressure that makes skipping it tempting.

import { forward, servo, JOINT_SPEED, JOINTS, TCP_OFFSET } from './arm.js';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

export const KEYS = ['q', 'w', 'o', 'p'];

// ---------------------------------------------------------------- the cell --
// Metres. The arm's base is the origin; the line runs along x in front of it.

export const CELL = {
  beltY: -0.42,
  beltTopZ: 0.085,
  beltHalfWidth: 0.13,
  beltFromX: -0.62,
  beltToX: 0.62,
  beltSpeed: 0.105,          // m/s
  binX: 0.30, binY: -0.26, binZ: 0.14,
  binRadius: 0.115,
};

// The three taught poses. SOLVED ON THE REAL CHAIN, not hand-set: each is the
// joint vector that puts the tool centre point at the named place with the
// gripper pointing straight down, found by search over arm.js's forward
// kinematics inside the AR4's real joint limits. Recorded here the way a teach
// pendant records them — as joint angles, because that is what the arm stores.
export const POSES = {
  BIN:      [-0.87440, 0.39487, -0.11479, 0.00000, 1.29073, 3.12604],
  APPROACH: [-0.01666, 0.51326, -0.12412, 0.00000, 1.18166, 3.14159],
  PICK:     [-0.01667, 0.85526,  0.11642, 0.00001, 0.59912, 3.14077],
};
export const POSE_FOR_KEY = ['BIN', 'APPROACH', 'PICK'];

export const GRIP = {
  closeSecs: 0.22,           // jaws fully open to fully closed
  graspRadius: 0.034,        // how near the tool point a part must be
  // A part the jaws sweep through without closing on gets knocked off the line.
  knockRadius: 0.030,
};

export const PARTS = {
  // Blue spheres are the product going past. Red wedges are the ones flagged
  // for removal — the occasional reject you are here to pull.
  gapMin: 0.085, gapMax: 0.185,   // metres of belt between parts
  targetShare: 0.22,              // how many are red
  sphereR: 0.024,
  wedgeR: 0.028,
};

export const SHIFT = { scrapLimit: 6 };

function rngFrom(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function createCell(opts = {}) {
  const rng = rngFrom(opts.seed ?? 1);
  const q = POSES.BIN.slice();
  const st = {
    rng,
    q,
    target: null,              // pose name currently being driven toward
    jaw: 1,                    // 1 = fully open, 0 = fully closed
    holding: null,             // the part in the jaws
    parts: [],
    // Belt distance since the last part entered, and how far until the next.
    // Tracked as DISTANCE TRAVELLED rather than as an x position: the first
    // version kept an x and decremented it, which spawned new parts off the
    // END of the belt and quietly emptied the cell within a minute.
    sinceLast: 0,
    nextGap: 0,
    // Ledger.
    picked: 0, wrongPart: 0, missed: 0, scrap: 0, dropped: 0,
    elapsed: 0,
    over: false, cause: '',
    // For the HUD and the tests.
    tcp: { x: 0, y: 0, z: 0 },
    arrived: true,
    lastEvent: null,
    // Diagnostics the selftest reads: how far the tool has travelled sideways
    // while low over the belt. This is the quantity the whole design rests on.
    sweptLowMm: 0,
    lastTcp: null,
  };
  const f = forward(q);
  st.tcp = f.tcp;
  st.lastTcp = { ...f.tcp };
  seedBelt(st);
  return st;
}

function makePart(st, x) {
  const isTarget = st.rng() < PARTS.targetShare;
  return {
    x, y: CELL.beltY, z: CELL.beltTopZ + (isTarget ? PARTS.wedgeR : PARTS.sphereR) * 0.85,
    kind: isTarget ? 'reject' : 'product',
    spin: st.rng() * Math.PI * 2,
    onBelt: true, held: false, gone: false,
    knocked: false, vx: 0, vy: 0, vz: 0,
  };
}

const drawGap = (st) => PARTS.gapMin + st.rng() * (PARTS.gapMax - PARTS.gapMin);

function seedBelt(st) {
  let x = CELL.beltFromX;
  while (x < CELL.beltToX) {
    st.parts.push(makePart(st, x));
    x += drawGap(st);
  }
  st.sinceLast = 0;
  st.nextGap = drawGap(st);
}

/** Which pose key is held wins; if several are held the LAST one pressed would
 *  be ambiguous, so the priority is PICK > APPROACH > BIN — the arm always
 *  commits to the deepest move you are asking for. */
export function heldTarget(held) {
  if (held[2]) return 'PICK';
  if (held[1]) return 'APPROACH';
  if (held[0]) return 'BIN';
  return null;
}

export function tickCell(st, dt, held = [false, false, false, false]) {
  if (st.over) return st;
  st.elapsed += dt;

  // ---- the arm ----------------------------------------------------------
  const want = heldTarget(held);
  st.target = want;
  if (want) {
    const r = servo(st.q, POSES[want], dt, JOINT_SPEED);
    st.q = r.q;
    st.arrived = r.arrived;
  } else {
    st.arrived = true;          // holding position
  }
  const f = forward(st.q);
  st.tcp = f.tcp;
  st.flange = f.flange;
  st.gripBase = f.gripBase;

  // How far the tool moved sideways while low over the belt. The measurement
  // the design claim is made of, kept on the live cell so the game and the
  // experiment are reading the same number.
  if (st.lastTcp) {
    const low = st.tcp.z < CELL.beltTopZ + 0.06;
    const overBelt = Math.abs(st.tcp.y - CELL.beltY) < CELL.beltHalfWidth;
    if (low && overBelt) st.sweptLowMm += Math.abs(st.tcp.x - st.lastTcp.x) * 1000;
  }
  st.lastTcp = { ...st.tcp };

  // ---- the jaws ---------------------------------------------------------
  const wantJaw = held[3] ? 0 : 1;
  const jawStep = dt / GRIP.closeSecs;
  st.jaw = wantJaw < st.jaw ? Math.max(wantJaw, st.jaw - jawStep) : Math.min(wantJaw, st.jaw + jawStep);

  // ---- the line ---------------------------------------------------------
  const adv = CELL.beltSpeed * dt;
  for (const p of st.parts) {
    if (p.held || p.gone) continue;
    if (p.onBelt) {
      p.x += adv;
      if (p.x > CELL.beltToX) {
        p.gone = true;
        // A reject that reaches the end of the line is one that got through.
        if (p.kind === 'reject') { st.missed++; st.lastEvent = { t: st.elapsed, kind: 'missed' }; }
      }
    } else {
      // Knocked off, or dropped. Falls to the floor and is scrap either way.
      p.vz -= 9.81 * dt;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      if (p.z < 0.005) p.gone = true;
    }
  }
  st.parts = st.parts.filter((p) => !p.gone || p.held);
  // Keep the line fed. New parts enter at the START of the belt, spaced by a
  // gap drawn per part, and are placed at however far the belt has run on past
  // the moment they were due — so the spacing is exact and never drifts with
  // the frame rate.
  st.sinceLast += adv;
  while (st.sinceLast >= st.nextGap) {
    st.sinceLast -= st.nextGap;
    st.parts.push(makePart(st, CELL.beltFromX + st.sinceLast));
    st.nextGap = drawGap(st);
  }

  // ---- grasping ---------------------------------------------------------
  const tcp = st.tcp;
  if (st.holding) {
    const p = st.holding;
    p.x = tcp.x; p.y = tcp.y; p.z = tcp.z;
    // Opening the jaws lets go. Over the tote that is a delivery; anywhere
    // else the part falls on the floor.
    if (st.jaw > 0.55) {
      const overBin = Math.hypot(tcp.x - CELL.binX, tcp.y - CELL.binY) < CELL.binRadius
        && tcp.z > CELL.binZ - 0.02;
      p.held = false;
      if (overBin) {
        p.gone = true;
        if (p.kind === 'reject') { st.picked++; st.lastEvent = { t: st.elapsed, kind: 'picked' }; }
        else { st.wrongPart++; st.scrap++; st.lastEvent = { t: st.elapsed, kind: 'wrong' }; }
      } else {
        p.onBelt = false;
        p.vx = 0; p.vy = 0; p.vz = 0;
        st.dropped++; st.scrap++;
        st.lastEvent = { t: st.elapsed, kind: 'dropped' };
      }
      st.holding = null;
    }
  } else if (st.jaw < 0.35) {
    // The jaws are closing or closed. Anything between them gets taken.
    for (const p of st.parts) {
      if (p.gone || p.held || !p.onBelt) continue;
      if (Math.hypot(p.x - tcp.x, p.y - tcp.y, p.z - tcp.z) < GRIP.graspRadius) {
        p.held = true; p.onBelt = false;
        st.holding = p;
        st.lastEvent = { t: st.elapsed, kind: p.kind === 'reject' ? 'grabbed' : 'grabbedWrong' };
        break;
      }
    }
  }

  // ---- knocking things off ----------------------------------------------
  // Open jaws sweeping through a part on the belt scatter it. THIS is what the
  // sideways approach costs you, and it is not a special case bolted on: it is
  // simply what happens when the tool occupies the same space as a part it is
  // not closing on.
  if (!st.holding && st.jaw > 0.55) {
    for (const p of st.parts) {
      if (p.gone || p.held || !p.onBelt) continue;
      if (Math.hypot(p.x - tcp.x, p.y - tcp.y, p.z - tcp.z) < GRIP.knockRadius) {
        p.onBelt = false;
        p.knocked = true;
        p.vx = (p.x - tcp.x) * 6 + 0.2;
        p.vy = (p.y - tcp.y) * 6;
        p.vz = 0.6;
        st.scrap++;
        st.lastEvent = { t: st.elapsed, kind: 'knocked' };
      }
    }
  }

  if (st.scrap >= SHIFT.scrapLimit) {
    st.over = true;
    st.cause = 'line stopped — too much scrap';
  }
  return st;
}

export function score(st) {
  return { picked: st.picked, wrongPart: st.wrongPart, missed: st.missed, scrap: st.scrap };
}

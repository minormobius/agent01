// tjs/brut/stair.js — THE STAIR. Pure, DOM-free, three.js-free.
//
// A stair is SOLVED, not drawn. Given a floor-to-floor height and a box to fit
// inside, everything else follows from three rules that have been in the trade
// for three hundred years:
//
//   1. EVERY RISER IN A FLIGHT IS EQUAL. Not approximately — exactly. A stair
//      is climbed by proprioception, not by looking, so a single odd riser is
//      the classic trip. That makes the riser count an INTEGER and the riser
//      height H/n exactly, which is the one number in this file that is not
//      free to be nudged.
//
//   2. BLONDEL'S RULE: 2R + G ≈ 630 mm, from the length of a human pace on the
//      flat (about 630) losing twice its rise. François Blondel published it in
//      1675 and it has not needed changing. It is what makes a stair feel right
//      rather than merely comply — a 150/330 stair and a 180/270 stair both
//      pass the codes, and both walk badly, because 2R+G lands at 630 for
//      neither.
//
//   3. PITCH is what the leg feels: atan(R/G). Under about 33° reads as
//      generous, 38° is the public limit, 42° private, and past that you are
//      building a ladder.
//
// ─── THE DESIGN SPACE ────────────────────────────────────────────────────────
//
// It really is enormous, and it is enormous for a reason: a stair has to turn a
// vertical distance into a horizontal one inside a plan that has other work to
// do. Every type below is a different answer to "where do I put the length?" —
// straight spends it in one direction, the dog-leg folds it in half, the spiral
// spends it in rotation and none in plan at all. That is the whole taxonomy.
//
// The brutalist ones are the good ones. An escape stair pulled OUT of the
// building becomes the event of the elevation; a scissor puts two independent
// protected routes in one shaft; and a helix with no newel is a piece of
// structure pretending to be a ribbon.

export const VERSION = 'stair/1';

const r2 = (v) => Math.round(v * 100) / 100;
const r3 = (v) => Math.round(v * 1000) / 1000;
const TAU = Math.PI * 2;
const DEG = 180 / Math.PI;

/* ────────────────────────────── the rule book ───────────────────────────── */
//
// A blend of Approved Document K and IBC 1011, which agree more than they
// differ. Where they differ the tighter one is used and said so.

export const RULES = {
  blondel: 0.63,            // 2R + G, the pace
  blondelBand: [0.58, 0.68],
  publicRise: [0.15, 0.17], // AD K "other" stair: max rise 170
  privateRise: [0.15, 0.20],
  going: [0.25, 0.35],      // AD K min going 250; IBC min run 280
  pitchMax: { public: 38, private: 42 },
  maxRisersPerFlight: 16,   // AD K: a flight between landings
  minRisersPerFlight: 3,    // fewer than three is a trip, not a stair
  headroom: 2.0,            // clear, measured off the pitch line
  width: { escape: 1.0, public: 1.2, private: 0.9 },
  landingMin: 1.0,          // and never less than the stair width
  wellMin: 0.1,             // the gap a handrail needs to turn round
  waist: 0.2,               // structural thickness under the treads
  spiralNarrow: 0.145,      // min going at the narrow end of a tapered tread
  spiralWalk: 0.25,         // min going on the walking line
};

/* ──────────────────────────────── the types ─────────────────────────────── */
//
// `spend` says where the type puts the horizontal length it has to find:
// 'run' along one axis, 'fold' back on itself, 'turn' into rotation.

export const STAIR_TYPES = {
  straight: {
    label: 'straight flight', spend: 'run', flights: 1, turn: 0,
    note: 'the whole going in one direction. Cheapest, longest, and the only one that lets you see the top from the bottom',
  },
  dogleg: {
    label: 'dog-leg', spend: 'fold', flights: 2, turn: 180,
    note: 'two flights folded about a half landing — the workhorse, because it returns you above where you started and so stacks',
  },
  'open-well': {
    label: 'open well', spend: 'fold', flights: 2, turn: 180, well: 0.9,
    note: 'a dog-leg pulled apart so daylight and a handrail can run down the gap. The well is the whole point',
  },
  quarter: {
    label: 'quarter turn', spend: 'fold', flights: 2, turn: 90, exact: true,
    note: 'an L: length spent down two sides of a corner, which is what you do when the plan gives you a corner and not a slot',
  },
  three: {
    label: 'three flight', spend: 'fold', flights: 3, turn: 180,
    note: 'a U with two quarter landings — fits a square shaft when a dog-leg would be too long',
  },
  scissor: {
    label: 'scissor', spend: 'fold', flights: 2, turn: 180, scissor: true,
    note: 'two interlocking stairs in ONE shaft, offset half a storey, never meeting — two protected escape routes for the price of one core',
  },
  spiral: {
    label: 'spiral', spend: 'turn', flights: 1, turn: 360, newel: true,
    note: 'all the length spent in rotation and none in plan. Treads taper, so the going is only true on the walking line',
  },
  helical: {
    label: 'helical', spend: 'turn', flights: 1, turn: 360, newel: false,
    note: 'a spiral with the newel taken out and the well opened up — the tread is a cantilever and the stair reads as a ribbon',
  },
  'double-helix': {
    label: 'double helix', spend: 'turn', flights: 1, turn: 360, newel: false, double: true,
    note: 'two interleaved helices in one well. Chambord and the Vatican both have one: two people can climb without ever meeting',
  },
  cantilever: {
    label: 'cantilevered', spend: 'run', flights: 1, turn: 0, cantilever: true,
    note: 'treads built into one wall and free at the other end, no string and no soffit — the flight appears to have nothing holding it up',
  },
};
export const STAIR_IDS = Object.keys(STAIR_TYPES);

/* ═════════════════════════════ the flight solve ═════════════════════════════
   Everything downstream depends on this, and it is four lines of arithmetic
   plus one integer choice. */

export function solveFlight(H, opts = {}) {
  const priv = !!opts.private;
  const [rLo, rHi] = priv ? RULES.privateRise : RULES.publicRise;
  const target = opts.rise || 0.165;

  // The riser count is an integer because every riser must be EQUAL. Pick the
  // count nearest the target rise, then clamp it into the band the code allows.
  let n = Math.round(H / target);
  n = Math.max(Math.ceil(H / rHi - 1e-9), Math.min(Math.floor(H / rLo + 1e-9), n));
  n = Math.max(RULES.minRisersPerFlight, n);
  const R = H / n;

  // Blondel gives the going, then the code clamps it. When the clamp bites,
  // 2R+G leaves the ideal and the stair is reported as walking less well —
  // which is honest: it is the geometry telling you the storey is too tall or
  // too short for a comfortable stair.
  const G = Math.min(RULES.going[1], Math.max(RULES.going[0], RULES.blondel - 2 * R));
  const blondel = 2 * R + G;
  const pitch = Math.atan(R / G) * DEG;

  // rise and going are NOT rounded. They are dimensions the geometry adds up:
  // n × rise must equal the storey exactly, and rounding the rise to a
  // millimetre puts a two-centimetre error at the top of a tall flight — the
  // same class of bug as rounding a second moment of area to zero. Rounding is
  // for the label, and the label does it.
  return {
    risers: n, rise: R, going: G, blondel: r3(blondel), pitch: r2(pitch),
    comfort: r2(1 - Math.min(1, Math.abs(blondel - RULES.blondel) / 0.06)),
    private: priv,
  };
}

// How many flights this many risers needs, given the per-flight cap.
const flightSplit = (n, want) => {
  const need = Math.max(want, Math.ceil(n / RULES.maxRisersPerFlight));
  const base = Math.floor(n / need), extra = n % need;
  return Array.from({ length: need }, (_, i) => base + (i < extra ? 1 : 0));
};

/* ═══════════════════════════ footprint, in reverse ══════════════════════════
   The inversion that makes a core honest: rather than drawing a stair into
   whatever box is left over, ask the stair how big a box it needs. `placeCores`
   uses this so a core is sized by the thing that has to happen inside it. */

// The layout always runs along the box's LONG axis, so a footprint fits a box
// in either orientation — comparing w-to-w and d-to-d rejects a stair that would
// simply have been laid the other way round.
export function fitsBox(fp, box, eps = 1e-6) {
  if (fp.viable === false) return false;
  return Math.min(fp.w, fp.d) <= Math.min(box.w, box.d) + eps &&
    Math.max(fp.w, fp.d) <= Math.max(box.w, box.d) + eps;
}

// H may be a LIST of storey heights, in which case the envelope over all of
// them is returned — and it must be, because the footprint is NOT monotonic in
// storey height. The flight cap is a step function: 34 risers split into three
// flights of 12, while 27 split into two of 14, so the SHORTER storey needs the
// longer shaft. Sizing a core on the tallest floor is wrong for exactly that
// reason, and it was wrong here until the fit check said so.
export function stairFootprint(type, H, opts = {}) {
  if (Array.isArray(H)) {
    const all = H.map((h) => stairFootprint(type, h, opts));
    const out = { ...all[0] };
    for (const f of all) { out.w = Math.max(out.w, f.w); out.d = Math.max(out.d, f.d); }
    if (out.radius != null) for (const f of all) out.radius = Math.max(out.radius, f.radius || 0);
    return out;
  }
  const T = STAIR_TYPES[type] || STAIR_TYPES.dogleg;
  const f = solveFlight(H, opts);
  const w = opts.width || RULES.width.public;
  const land = Math.max(RULES.landingMin, w);

  if (T.spend === 'turn') {
    const h = helixGeom(T, f, w);
    return {
      w: r2(2 * h.outer), d: r2(2 * h.outer), radius: r2(h.outer), inner: r2(h.inner),
      turns: r2(h.turn / TAU), flight: f,
    };
  }

  const parts = flightSplit(f.risers, T.flights);
  // Some types are a fixed number of flights BY DEFINITION — an L with three
  // flights is not an L. When the riser count needs more than the type can
  // express, the type simply does not apply, and saying so here is what stops
  // the layout quietly dropping the flight it has nowhere to put. That dropped
  // flight was a stair arriving two metres below the floor it serves.
  if (T.exact && parts.length !== T.flights) return { w: Infinity, d: Infinity, viable: false, flight: f };
  const longest = Math.max(...parts);
  const run = (longest - 1) * f.going;
  const well = T.well || RULES.wellMin;

  if (T.turn === 180) {
    // two (or three) flights side by side, folded about a landing
    const across = T.flights === 3 ? 2 * w + well : 2 * w + well;
    return { w: r2(across), d: r2(run + land), flight: f, run: r2(run), landing: r2(land), well: r2(well) };
  }
  if (T.turn === 90) {
    const run2 = (parts[1] || parts[0] - 1) * f.going;
    return { w: r2(run + w), d: r2(run2 + w), flight: f, run: r2(run), landing: r2(land), well: 0 };
  }
  // straight: one axis takes all of it, plus a landing per intermediate break
  const total = parts.reduce((a, k) => a + (k - 1) * f.going, 0) + (parts.length - 1) * land;
  return { w: r2(w), d: r2(total + land), flight: f, run: r2(total), landing: r2(land), well: 0 };
}

/* ═════════════════════════════════ layout ═══════════════════════════════════
   Put the solved stair inside a box. Returns flights, landings and every
   individual tread — the treads are the thing both the model and the drawing
   are made from, so neither can invent a step the other does not have. */

export function layout(type, H, box, opts = {}) {
  const T = STAIR_TYPES[type] || STAIR_TYPES.dogleg;
  const f = solveFlight(H, opts);
  const fp = stairFootprint(type, H, opts);
  const y0 = opts.y0 || 0;
  const width = opts.width || RULES.width.public;
  const waist = RULES.waist;

  const st = {
    type, label: T.label, note: T.note, spend: T.spend,
    H: r2(H), ...f, width: r2(width), waist,
    box: { x: box.x, z: box.z, w: box.w, d: box.d },
    footprint: { w: fp.w, d: fp.d },
    fits: fitsBox(fp, box),
    y0: r2(y0), steps: [], landings: [], flights: [], newel: null,
  };

  // The stair is laid out on its own axes and then placed in the box, so a
  // rotated core is one transform rather than four cases.
  // The stair is laid out on its own axes — u along the RUN, v ACROSS it — and
  // then placed in the box, so a rotated core is one transform rather than four
  // cases. Both the mapping AND the extents have to be swapped: mapping the
  // placement while still measuring the run against box.d sent a 7.5 m straight
  // flight nearly two metres out through the end of a 1.35 m deep shaft.
  const long = box.d >= box.w;                       // run down the long axis
  const A = (u, v) => (long ? { x: box.x + v, z: box.z + u } : { x: box.x + u, z: box.z + v });
  const ry = long ? 0 : Math.PI / 2;
  const RUN = long ? box.d : box.w;                  // the box, measured along u
  const ACROSS = long ? box.w : box.d;               // and across it

  // ONE tread convention, everywhere: w is ACROSS the stair (its width) and d
  // is ALONG travel (the going), and `ry` turns that into world. Swapping w and
  // d as well as setting ry applies the rotation twice, which lays every tread
  // along the flight instead of across it — a stair of planks, not steps. It
  // passes a containment test, which is why it survived one.
  const step = (p2, y, dir90) => ({
    x: r2(p2.x), z: r2(p2.z), y: r2(y - f.rise / 2), ry: ry + (dir90 ? Math.PI / 2 : 0),
    w: r2(width), d: r2(f.going), h: r2(f.rise),
  });

  if (T.spend === 'turn') return helix(st, T, f, fp, box, y0, width, opts);

  const parts = flightSplit(f.risers, T.flights);
  const land = Math.max(RULES.landingMin, width);
  const runLen = (k) => (k - 1) * f.going;

  if (T.turn === 180) {
    // ── the dog-leg family ───────────────────────────────────────────────
    // Flight 1 climbs one side to the half landing; flight 2 climbs back down
    // the other side. Because it returns you above where you started, it
    // STACKS: the same shaft serves every storey, which is why it is the
    // workhorse. A scissor is the same geometry with a second stair started
    // half a storey out of phase, sharing the shaft and never meeting it.
    const well = T.well || RULES.wellMin;
    const half = RUN / 2 - land / 2;
    let riser = 0, y = y0;
    for (let i = 0; i < parts.length; i++) {
      const k = parts[i];
      const side = i % 2 === 0 ? -1 : 1;             // which half of the shaft
      const v = side * (width + well) / 2;
      const dir = i % 2 === 0 ? 1 : -1;              // and which way it climbs
      const u0 = dir > 0 ? -RUN / 2 + land / 2 : RUN / 2 - land / 2;
      for (let s = 0; s < k; s++) {
        const u = u0 + dir * (s * f.going + f.going / 2);
        const p = A(u, v);
        y += f.rise;
        st.steps.push({ ...step(p, y, false), flight: i, riser: ++riser });
      }
      const lp = A(dir > 0 ? RUN / 2 - land / 2 : -RUN / 2 + land / 2, 0);
      st.landings.push({
        x: r2(lp.x), z: r2(lp.z), y: r2(y),
        w: r2(long ? 2 * width + well : land), d: r2(long ? land : 2 * width + well),
        kind: i === parts.length - 1 ? 'arrival' : 'half',
      });
      st.flights.push({ i, risers: k, from: r2(y - k * f.rise), to: r2(y), side, dir, run: r2(runLen(k)) });
    }
    st.well = r2(well);
    if (T.scissor) st.scissorOffset = r2(H / 2);
  } else if (T.turn === 90) {
    // ── the quarter turn ─────────────────────────────────────────────────
    let riser = 0, y = y0;
    const k1 = parts[0], k2 = parts[1] || 0;
    st.dropped = parts.slice(2).reduce((a, k) => a + k, 0);   // must always be 0
    for (let s = 0; s < k1; s++) {
      const u = -RUN / 2 + width / 2 + s * f.going + f.going / 2;
      const p = A(u, -ACROSS / 2 + width / 2);
      y += f.rise;
      st.steps.push({ ...step(p, y, false), flight: 0, riser: ++riser });
    }
    const cp = A(RUN / 2 - width / 2, -ACROSS / 2 + width / 2);
    st.landings.push({ x: r2(cp.x), z: r2(cp.z), y: r2(y), w: r2(width), d: r2(width), kind: 'quarter' });
    for (let s = 0; s < k2; s++) {
      const v = -ACROSS / 2 + width + s * f.going + f.going / 2;
      const p = A(RUN / 2 - width / 2, v);
      y += f.rise;
      st.steps.push({ ...step(p, y, true), flight: 1, riser: ++riser });
    }
    st.flights.push({ i: 0, risers: k1, from: r2(y0), to: r2(y0 + k1 * f.rise), dir: 1, run: r2(runLen(k1)) });
    if (k2) st.flights.push({ i: 1, risers: k2, from: r2(y0 + k1 * f.rise), to: r2(y), dir: 1, run: r2(runLen(k2)) });
  } else {
    // ── straight ─────────────────────────────────────────────────────────
    let riser = 0, y = y0, u = -RUN / 2 + land / 2;
    for (let i = 0; i < parts.length; i++) {
      const k = parts[i];
      for (let s = 0; s < k; s++) {
        const p = A(u + f.going / 2, 0);
        y += f.rise;
        st.steps.push({ ...step(p, y, false), flight: i, riser: ++riser });
        u += f.going;
      }
      const lp = A(u + land / 2 - f.going / 2, 0);
      st.landings.push({ x: r2(lp.x), z: r2(lp.z), y: r2(y),
        w: r2(long ? width : land), d: r2(long ? land : width),
        kind: i === parts.length - 1 ? 'arrival' : 'intermediate' });
      u += land - f.going;
      st.flights.push({ i, risers: k, from: r2(y - k * f.rise), to: r2(y), dir: 1, run: r2(runLen(k)) });
    }
  }

  st.top = r2(y0 + H);
  return check(st, opts);
}

// A HELIX DOES NOT HAVE TO CLIMB A STOREY IN EXACTLY ONE TURN, and assuming it
// does is what breaks the geometry. Twenty-one treads round 360° leaves 30 mm
// of tread at the newel — unclimbable, and the code says so. So solve the other
// way: fix the going on the walking line at Blondel's value, and let the total
// rotation be whatever that implies. Real spirals turn 1.0, 1.5, 2 times per
// storey for exactly this reason.
//
//   dθ = G / r_walk           the walking-line going IS Blondel's, by construction
//   turn = n · dθ             however far round that takes it
//   narrow = r_inner · dθ     the number that decides whether it can be walked
//
// which leaves the inner radius as the one real choice: a stout newel for a
// spiral, an open well for a helix, and more again for a double.
// and the narrow-end rule SETS the inner radius, rather than the other way
// round. With r_walk = r_in + k and dθ = G / r_walk, the narrow going is
// r_in·G / (r_in + k), so requiring it to clear N_min rearranges to
//
//     r_in  ≥  N_min · k / (G − N_min)
//
// which for a 1.2 m wide public spiral at Blondel's going comes out near 0.54 m.
// That is not a fudge — it is why a wide spiral has a fat newel and a slim one
// does not, and why spiral escape stairs are narrow.
function helixGeom(T, f, w) {
  const k = Math.max(0.27, w / 2);
  const need = (RULES.spiralNarrow * k) / Math.max(1e-6, f.going - RULES.spiralNarrow);
  const floor = T.double ? Math.max(0.9, w * 0.8) : T.newel ? 0.28 : Math.max(0.6, w * 0.55);
  const inner = Math.max(floor, need * 1.06);
  const rWalk = inner + k;
  const dTh = f.going / rWalk;
  return { inner, rWalk, outer: inner + w, dTh, turn: f.risers * dTh };
}

/* ─────────────────────────────── the helices ────────────────────────────── */
//
// A tapered tread has no single going: it is narrow at the newel and wide at
// the outside, so the code measures it on the WALKING LINE, the arc a person
// actually treads. Everything here is set on that line and the ends are then
// checked, which is the right way round — the opposite gives a stair that
// passes on paper and is unclimbable at the inside.

function helix(st, T, f, fp, box, y0, width, opts) {
  const g = helixGeom(T, f, width);
  const { inner, rWalk, outer } = g;
  const hand = opts.hand === -1 ? -1 : 1;            // clockwise up, or not

  const strands = T.double ? 2 : 1;
  const dTh = g.dTh * hand;
  for (let gi = 0; gi < strands; gi++) {
    let y = y0;
    for (let s = 0; s < f.risers; s++) {
      const th = (gi * g.turn) / strands + (s + 0.5) * dTh;
      y += f.rise;
      st.steps.push({
        x: r2(box.x + rWalk * Math.cos(th)), z: r2(box.z + rWalk * Math.sin(th)),
        y: r2(y - f.rise / 2), ry: -th,
        w: r2(outer - inner), d: r2(rWalk * Math.abs(dTh)), h: r2(f.rise),
        flight: gi, riser: s + 1, strand: gi,
      });
    }
    st.flights.push({ i: gi, risers: f.risers, from: r2(y0), to: r2(y0 + st.H), dir: hand, run: r2(rWalk * g.turn) });
  }
  st.radius = r2(outer); st.inner = r2(inner); st.walk = r2(rWalk); st.hand = hand;
  st.turns = r2(g.turn / TAU);
  st.strands = strands;
  if (T.newel) st.newel = { x: box.x, z: box.z, r: r2(inner), h: r2(st.H) };
  st.landings.push({ x: r2(box.x + outer * Math.cos(0)), z: r2(box.z), y: r2(y0 + st.H),
    w: r2(outer - inner), d: r2(width), kind: 'arrival' });
  // the going on the walking line is what the code asks for; the narrow end is
  // what makes it unclimbable, so both are recorded and both are checked
  st.goingWalk = r3(rWalk * Math.abs(dTh));
  st.goingNarrow = r3(inner * Math.abs(dTh));
  st.top = r2(y0 + st.H);
  return check(st, opts);
}

/* ═════════════════════════════════ checks ═══════════════════════════════════
   Every one of these is a real rule with a real reason, and each says what it
   is protecting rather than just quoting a number. */

export function check(st, opts = {}) {
  const priv = !!opts.private;
  const [rLo, rHi] = priv ? RULES.privateRise : RULES.publicRise;
  const pitchMax = priv ? RULES.pitchMax.private : RULES.pitchMax.public;
  const c = [];
  const add = (id, label, ok, value, note) => c.push({ id, label, pass: ok, value, note });

  add('equal', 'Equal risers', true, `${st.risers} × ${Math.round(st.rise * 1000)} mm`,
    'every riser in a flight is identical by construction — the count is an integer and the rise is H ÷ n');
  add('rise', 'Riser height', st.rise >= rLo - 1e-9 && st.rise <= rHi + 1e-9,
    `${Math.round(st.rise * 1000)} mm`, `against ${rLo * 1000}–${rHi * 1000} mm`);
  add('blondel', 'Blondel 2R + G', st.blondel >= RULES.blondelBand[0] && st.blondel <= RULES.blondelBand[1],
    `${Math.round(st.blondel * 1000)} mm`,
    'the length of a pace, less twice the rise. 630 walks best; outside 580–680 the leg has to change gait');
  add('pitch', 'Pitch', st.pitch <= pitchMax + 1e-6, `${st.pitch}°`, `against ${pitchMax}° — past that it is a ladder`);

  const longest = st.flights.length ? Math.max(...st.flights.map((f) => f.risers)) : st.risers;
  if (st.spend !== 'turn') {
    add('flight', 'Risers per flight', longest <= RULES.maxRisersPerFlight, `${longest}`,
      `against ${RULES.maxRisersPerFlight} — a longer flight needs a landing to break the fall`);
    const worstLanding = st.landings.length
      ? Math.min(...st.landings.map((l) => Math.min(l.w, l.d))) : 0;
    add('landing', 'Landing depth', worstLanding >= Math.min(st.width, RULES.landingMin) - 1e-6,
      `${r2(worstLanding)} m`, 'a landing is never shallower than the stair is wide');
  } else {
    add('walk', 'Going on the walking line', st.goingWalk >= RULES.spiralWalk - 1e-6,
      `${Math.round(st.goingWalk * 1000)} mm`, `against ${RULES.spiralWalk * 1000} mm — a tapered tread is only measured where it is walked`);
    add('narrow', 'Going at the narrow end', st.goingNarrow >= RULES.spiralNarrow - 1e-6,
      `${Math.round(st.goingNarrow * 1000)} mm`, `against ${RULES.spiralNarrow * 1000} mm — this is the number that makes a spiral climbable or not`);
  }

  add('width', 'Clear width', st.width >= RULES.width.escape - 1e-6, `${st.width} m`,
    'the minimum that gets one person out past another');
  const clear = st.H - st.waist;
  add('headroom', 'Headroom', clear >= RULES.headroom - 1e-6, `${r2(clear)} m`,
    'floor to floor less the waist of the flight above — these arrangements all stack, so this is the tight dimension');
  add('fits', 'Fits its shaft', st.fits !== false,
    `${st.footprint.w} × ${st.footprint.d} m in ${r2(st.box.w)} × ${r2(st.box.d)}`,
    'the core is sized from the stair rather than the other way round');

  st.checks = c;
  st.pass = c.every((x) => x.pass);
  st.governing = c.find((x) => !x.pass) || null;
  return st;
}

/* ══════════════════════════════ what gets built ═════════════════════════════
   One list, used by the 3D bench AND by the drawing. A step the model builds
   that the plan does not draw is exactly the divergence this repo tests for. */

export function stairParts(st, level = 0) {
  const out = [];
  // its own material, so the bench can light the stairs and ghost everything
  // else — which is the only way to actually look at one
  const push = (o) => out.push({ mat: 'stair', level, ...o });

  for (const s of st.steps) {
    push({ kind: 'tread', x: s.x, y: s.y, z: s.z, w: s.w, h: s.h, d: s.d, ry: s.ry || 0 });
  }
  for (const l of st.landings) {
    push({ kind: 'landing', x: l.x, y: r2(l.y - st.waist / 2), z: l.z, w: l.w, h: st.waist, d: l.d });
  }
  if (st.newel) {
    push({ kind: 'newel', x: st.newel.x, y: r2(st.y0 + st.newel.h / 2), z: st.newel.z,
      w: r2(st.newel.r * 2), h: st.newel.h, d: r2(st.newel.r * 2) });
  }
  return out;
}

// The plan symbol, as polylines in world coordinates. A stair in plan is not a
// picture of a stair: it is the treads crossed by a BREAK LINE at the cut, an
// arrow that says UP from the bottom riser, and nothing at all of the flight
// above the cut. Drawing all of it is the giveaway of a plan that was rendered
// rather than drawn.
export function stairPlan(st, cutAbove = 1.4) {
  const nosings = [];
  const cut = st.y0 + cutAbove;
  let broke = null;
  for (const s of st.steps) {
    const above = s.y > cut;
    if (above && !broke) broke = s;
    nosings.push({ x: s.x, z: s.z, w: s.w, d: s.d, ry: s.ry || 0, above, riser: s.riser, flight: s.flight });
  }
  const first = st.steps[0] || null;
  const second = st.steps[1] || first;
  const arrow = first && second
    ? { x: first.x, z: first.z, dx: Math.sign(r2(second.x - first.x)), dz: Math.sign(r2(second.z - first.z)) }
    : null;
  return {
    nosings, arrow, breakAt: broke ? broke.riser : null,
    landings: st.landings.map((l) => ({ x: l.x, z: l.z, w: l.w, d: l.d, y: l.y, kind: l.kind })),
    newel: st.newel, radius: st.radius || null, inner: st.inner || null,
    label: `${st.risers}R @ ${Math.round(st.rise * 1000)}`,
  };
}

// Pick a type that suits the shaft it has to live in and the job it has to do.
// Rather than draw at random and hope, every candidate is laid out and the ones
// that do not fit are discarded — so the choice is always among stairs that
// actually work in that box.
export function chooseStair(box, H, rnd, opts = {}) {
  const prefer = opts.prefer || STAIR_IDS;
  const viable = [];
  for (const id of prefer) {
    const fp = stairFootprint(id, H, opts);
    if (fitsBox(fp, box)) viable.push(id);
  }
  if (!viable.length) return null;
  return rnd ? rnd.pick(viable) : viable[0];
}

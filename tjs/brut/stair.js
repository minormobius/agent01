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

  // a ceremonial stair is not a wider version of a service one: it is walked
  // slowly, so the rise comes down and Blondel gives back a deeper going
  grandRise: 0.15,
  grandWidth: [1.8, 3.0],

  // a ramp has no risers, so none of the above applies to it
  rampMax: 1 / 12,          // steepest gradient anyone is expected to push a chair up
  rampPreferred: 1 / 15,
  rampRise: 0.5,            // a landing every half metre of rise

  // and seating steps are furniture: the going is a seat depth
  seatGoing: [0.45, 0.95],
  seatRise: [0.1, 0.45],

  // A CORDONATA IS RIDDEN as much as walked — Michelangelo's at the Campidoglio
  // takes a horse. That sets the arithmetic: the rise drops to something a hoof
  // clears in stride and the going opens to a stride's length, so 2R + G lands
  // near 1050 rather than 630. Blondel is a rule about human pacing and it is
  // the wrong rule to ask of this, so it is not asked.
  cordonata: { rise: [0.08, 0.14], going: [0.55, 1.15], pace: 1.05 },

  // An ALTERNATING TREAD STAIR (AD K 1.25) is legal where a stair is not: the
  // paddles overlap, so each foot gets twice the going the plan shows, which
  // buys a pitch no ordinary stair may have. The price is that you may only
  // use it in a loft or a plant room, and only ever one at a time.
  alternating: { rise: [0.20, 0.30], going: [0.13, 0.22], pitch: [50, 70], width: 0.6 },

  // where a kite tread's going is measured from the inside of the turn (AD K)
  winderNarrow: 0.27,
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
  winder: {
    label: 'winder', spend: 'fold', flights: 2, turn: 90, winder: 3,
    note: 'a quarter turn with the landing taken OUT and kite treads put in its place, so the stair keeps climbing round the corner instead of pausing in it. You buy back a landing’s worth of plan and pay for it at the inside of the turn, where the tread comes to a point',
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
  'triple-helix': {
    label: 'triple helix', spend: 'turn', flights: 1, turn: 360, newel: false, strands: 3, wellFloor: [1.25, 1.05],
    note: 'three helices wound through one well, none of them touching. Chambord is credited with two and rumoured to want a third — three people climb the same shaft, see each other through the void, and never meet',
  },
  flying: {
    label: 'flying stair', spend: 'turn', flights: 1, turn: 360, newel: false, wellFloor: [1.35, 1.1],
    note: 'a geometrical stair: no newel, no inner string, each stone tread bedded into the wall and resting a corner on the one below. The well is wide enough to drop a plumb line down, and the whole flight stands on friction and self-weight',
  },
  cantilever: {
    label: 'cantilevered', spend: 'run', flights: 1, turn: 0, cantilever: true,
    note: 'treads built into one wall and free at the other end, no string and no soffit — the flight appears to have nothing holding it up',
  },
  ladder: {
    label: 'alternating tread', spend: 'run', flights: 1, turn: 0, alternating: true,
    note: 'a ship’s ladder: half-width paddles staggered left and right so each foot gets twice the going the plan shows. It buys a pitch no ordinary stair may have, and the price is that only one person may be on it and only to reach a loft or a plant room',
  },

  // ─── the ceremonial ones ───────────────────────────────────────────────
  // These are not circulation. They are the reason the room exists, and they
  // are drawn only where a parti asks for one.
  imperial: {
    label: 'imperial', spend: 'fold', flights: 3, turn: 180, imperial: true, grandOnly: true,
    note: 'one wide flight to a half landing, then TWO returning left and right — the staircase of a state room, which spends its width on arriving rather than on getting there',
  },
  bifurcated: {
    label: 'bifurcated', spend: 'fold', flights: 3, turn: 180, imperial: true, converge: true, grandOnly: true,
    note: 'the imperial run backwards: TWO flights rise left and right, meet on one landing, and a single wide flight carries everybody on together. An imperial disperses you at the top; this gathers you at the middle, which is a different thing to want from a room',
  },
  crossed: {
    label: 'crossed flights', spend: 'run', flights: 2, turn: 0, crossed: true, grandOnly: true,
    note: 'two straight flights climbing past each other in opposite directions through one void. Nobody meets, and the crossing is the whole event',
  },
  cordonata: {
    label: 'cordonata', spend: 'run', flights: 1, turn: 0, cordonata: true, grandOnly: true,
    note: 'a stepped ramp, ridden as much as walked. Michelangelo’s at the Campidoglio takes a horse: the rise drops to a hoof’s clearance and the going opens to a stride, so 2R + G lands near 1050 mm and Blondel is simply the wrong rule to ask of it',
  },
  amphi: {
    label: 'amphitheatre steps', spend: 'run', flights: 1, turn: 0, seating: true,
    note: 'a stair so wide and shallow it is furniture: you sit on it. It does not satisfy Blondel and is not meant to — the going is a seat depth, not a pace',
  },
  ramp: {
    label: 'ramp', spend: 'fold', flights: 2, turn: 180, ramp: true,
    note: 'no risers at all. Corbusier’s promenade architecturale: you do not climb a ramp, you are carried up it, and the price is twelve metres of length per metre of rise',
  },
};
export const STAIR_IDS = Object.keys(STAIR_TYPES);

/* ═════════════════════════════ the flight solve ═════════════════════════════
   Everything downstream depends on this, and it is four lines of arithmetic
   plus one integer choice. */

export function solveFlight(H, opts = {}) {
  const priv = !!opts.private;

  // A RAMP HAS NO RISERS. Everything below is about dividing a height into
  // equal steps, and a ramp does not do that — it trades the whole height for
  // length at a fixed gradient, so it gets its own arithmetic.
  if (opts.ramp) {
    const grad = RULES.rampPreferred;
    const run = H / grad;
    const legs = Math.max(1, Math.ceil(H / RULES.rampRise));
    return {
      risers: 0, rise: 0, going: 0, ramp: true, gradient: grad,
      run, legs, blondel: 0, pitch: r2(Math.atan(grad) * DEG), comfort: 1, private: priv,
    };
  }

  // Seating steps are furniture, not circulation: the going is a seat depth and
  // Blondel does not apply, so it is not asked to.
  if (opts.seating) {
    const target2 = 0.16;
    const n = Math.max(2, Math.round(H / target2));
    const R2 = H / n;
    return {
      risers: n, rise: R2, going: Math.max(RULES.seatGoing[0], Math.min(RULES.seatGoing[1], 0.62)),
      seating: true, blondel: r3(2 * R2 + 0.62), pitch: r2(Math.atan(R2 / 0.62) * DEG),
      comfort: 1, private: priv,
    };
  }

  // A cordonata is not a stair with generous dimensions — it is a different
  // machine, sized for a stride that may belong to a horse. As few risers as
  // the band allows, then the going from the ridden pace rather than Blondel's.
  if (opts.cordonata) {
    const C = RULES.cordonata;
    const n = Math.max(3, Math.ceil(H / C.rise[1]));
    const R2 = H / n;
    const G = Math.min(C.going[1], Math.max(C.going[0], C.pace - 2 * R2));
    return {
      risers: n, rise: R2, going: G, cordonata: true, pace: r3(2 * R2 + G),
      blondel: r3(2 * R2 + G), pitch: r2(Math.atan(R2 / G) * DEG),
      comfort: r2(1 - Math.min(1, Math.abs(2 * R2 + G - C.pace) / 0.14)), private: priv,
    };
  }

  // An alternating tread stair inverts the whole budget: the paddles overlap,
  // so the pace a foot actually takes is 2R + 2G, and the going in plan is half
  // what the leg gets. That is what buys sixty degrees legally.
  if (opts.alternating) {
    const A2 = RULES.alternating;
    const n = Math.max(4, Math.ceil(H / A2.rise[1]));
    const R2 = H / n;
    const aim = R2 / Math.tan(60 * Math.PI / 180);
    const G = Math.min(A2.going[1], Math.max(A2.going[0], aim));
    return {
      risers: n, rise: R2, going: G, alternating: true,
      pace: r3(2 * R2 + 2 * G), blondel: r3(2 * R2 + 2 * G),
      pitch: r2(Math.atan(R2 / G) * DEG), comfort: 1, private: priv,
    };
  }

  const [rLo, rHi] = priv ? RULES.privateRise : RULES.publicRise;
  const target = opts.rise || (opts.grand ? RULES.grandRise : 0.165);

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
// A type knows what KIND of thing it is. Requiring the caller to pass
// `seating: true` alongside `amphi` is a rule nobody can be relied on to
// remember, and forgetting it silently checks a bench against a stair's code.
export function modeFor(type, opts = {}) {
  const T = STAIR_TYPES[type] || STAIR_TYPES.dogleg;
  return {
    ...opts,
    ramp: T.ramp || !!opts.ramp,
    seating: T.seating || !!opts.seating,
    cordonata: T.cordonata || !!opts.cordonata,
    alternating: T.alternating || !!opts.alternating,
    grand: T.grandOnly || !!opts.grand,
    width: opts.width || (T.seating ? 4.0 : T.cordonata ? 3.6 : T.alternating ? RULES.alternating.width
      : T.grandOnly ? RULES.grandWidth[0] : RULES.width.public),
  };
}

// THE KITE TREADS. A winder's going is measured 270 mm in from the inside of
// the turn, and at a true point that measurement is short — so the rule is
// rearranged the same way the helix rearranges it, and what falls out is the
// little newel the kites have to wind about:
//
//     (r0 + 270) · dθ  ≥  N_min      with  dθ = 90° / n_kites
//
// Three kites in a quarter need barely any newel at all; four need a hundred
// millimetres of one. That is why winders come in threes.
//
// There is a SECOND rule, and it is the one that actually bites on a narrow
// stair: the going of a kite measured on the walking line may not be less than
// the going of the straight flight it turns, or the pace changes at the corner.
// Rearranged the same way, that is r0 ≥ G/dθ − w/2 — and on a 900 mm private
// stair it asks for a 120 mm newel where the narrow-end rule asked for seven.
// Both are solved for and the larger wins.
function winderGeom(T, f, w) {
  const wn = T.winder;
  const dTh = (Math.PI / 2) / wn;
  const r0 = Math.max(0,
    RULES.spiralNarrow / dTh - RULES.winderNarrow,
    f.going / dTh - w / 2);
  const rW = r0 + w / 2;
  const rest = Math.max(2, f.risers - wn);
  const k1 = Math.ceil(rest / 2), k2 = rest - k1;
  return {
    wn, dTh, r0: r3(r0), rW, k1, k2,
    goingWalk: r3(rW * dTh), goingNarrow: r3((r0 + RULES.winderNarrow) * dTh),
  };
}

export function stairFootprint(type, H, opts = {}) {
  if (Array.isArray(H)) {
    const all = H.map((h) => stairFootprint(type, h, opts));
    const out = { ...all[0] };
    for (const f of all) { out.w = Math.max(out.w, f.w); out.d = Math.max(out.d, f.d); }
    if (out.radius != null) for (const f of all) out.radius = Math.max(out.radius, f.radius || 0);
    // VIABILITY IS AND-ED, NOT INHERITED. Taking it from the first height was a
    // silent lie whenever a stack mixed storeys: a winder expresses a 3.4 m
    // floor happily and cannot express the 5.7 m piano nobile above it, and
    // copying the ground floor's verdict sized a core for a stair that then
    // failed its own check three levels up. One storey it cannot climb rules
    // the type out of the whole shaft.
    out.viable = all.every((f) => f.viable !== false);
    return out;
  }
  const T = STAIR_TYPES[type] || STAIR_TYPES.dogleg;
  const o = modeFor(type, opts);
  const f = solveFlight(H, o);
  const w = o.width;
  const land = Math.max(RULES.landingMin, w);

  if (T.spend === 'turn') {
    const h = helixGeom(T, f, w);
    return {
      w: r2(2 * h.outer), d: r2(2 * h.outer), radius: r2(h.outer), inner: r2(h.inner),
      turns: r2(h.turn / TAU), flight: f,
    };
  }

  if (T.ramp) {
    // a switchback ramp: the whole run folded into legs a landing apart
    const legRun = f.run / f.legs;
    return {
      w: r2(2 * w + RULES.wellMin), d: r2(legRun + land), viable: f.run / w < 60,
      flight: f, run: r2(f.run), landing: r2(land), well: RULES.wellMin, legs: f.legs,
    };
  }
  if (T.cordonata || T.alternating) {
    // one continuous run, and deliberately so. A cordonata is a ramp with steps
    // in it and pausing on a landing is not what it is for; a ladder is short
    // enough that the flight cap never bites. Both are therefore measured as a
    // single length, which is also what makes their footprints honest — long
    // for the one, almost nothing for the other.
    const run = (f.risers - 1) * f.going;
    return { w: r2(w), d: r2(run + land), flight: f, run: r2(run), landing: r2(land) };
  }
  if (T.winder) {
    const g = winderGeom(T, f, w);
    const corner = w + g.r0;
    return {
      w: r2(g.k1 * f.going + corner), d: r2(g.k2 * f.going + corner),
      flight: f, ...g, landing: r2(land),
      // the kites are part of the flight they turn, so the cap counts them —
      // and there has to be a straight flight left either side of them, or
      // what you have is a spiral with corners
      viable: f.risers - g.wn >= 2 && g.k2 >= 1 &&
        Math.max(g.k1, g.k2) + g.wn <= RULES.maxRisersPerFlight,
    };
  }
  if (T.imperial) {
    // one wide flight up the middle, two narrower ones returning either side of
    // it (or, bifurcated, two rising to meet one). The returns run back OVER
    // the space beside the central flight, which is why the shaft is wider than
    // it is long for its riser count.
    const k0 = Math.max(2, Math.round(f.risers * 0.45));
    const k1 = f.risers - k0;
    return {
      w: r2(2.2 * w), d: r2(Math.max(k0 - 1, k1 - 1) * f.going + land),
      flight: f, k0, k1, landing: r2(land),
      // a storey tall enough to need a landing inside the returns is a storey
      // an imperial cannot express — it is a one-turn gesture by definition
      viable: k1 >= 2 && k1 <= RULES.maxRisersPerFlight && k0 <= RULES.maxRisersPerFlight,
    };
  }
  if (T.crossed) {
    const legs = flightSplit(f.risers, 1);
    const run2 = legs.reduce((a, k) => a + (k - 1) * f.going, 0) + (legs.length - 1) * land;
    return { w: r2(2 * w + RULES.wellMin), d: r2(run2 + land), flight: f, run: r2(run2), landing: r2(land) };
  }
  if (T.seating) {
    return { w: r2(w), d: r2((f.risers - 1) * f.going + 0.6), flight: f, run: r2((f.risers - 1) * f.going) };
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
  opts = modeFor(type, opts);
  const f = solveFlight(H, opts);
  const fp = stairFootprint(type, H, opts);
  const y0 = opts.y0 || 0;
  const width = opts.width;
  const waist = RULES.waist;

  const st = {
    type, label: T.label, note: T.note, spend: T.spend,
    H: r2(H), ...f, width: r2(width), waist, grand: !!opts.grand,
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
  if (T.ramp) return rampRun(st, T, f, fp, box, y0, width, opts);

  // seating tiers are one continuous run: a landing in the middle of an
  // amphitheatre is a gangway, not a code requirement. A cordonata and a
  // ladder are one run for their own reasons — see the footprint.
  const parts = (T.seating || T.cordonata || T.alternating)
    ? [f.risers] : flightSplit(f.risers, T.flights);
  const land = Math.max(RULES.landingMin, width);
  const runLen = (k) => (k - 1) * f.going;

  if (T.winder) {
    // ── the winder ───────────────────────────────────────────────────────
    // Everything is anchored off the CORNER rather than off the box, so the
    // kites meet the flights exactly whatever slack the shaft has. The pivot
    // is the point where the two inner strings meet, backed off by the little
    // newel the narrow-going rule asked for above.
    const g = winderGeom(T, f, width);
    const corner = width + g.r0;
    const Pu = RUN / 2 - corner, Pv = -ACROSS / 2 + corner;
    // a direction in (u, v) into a world tread rotation — one place, so the
    // kites cannot pick up the double rotation the straight treads once did
    const spin = (du, dv) => (long ? Math.atan2(dv, du) : Math.atan2(du, dv));
    let riser = 0, y = y0;

    for (let s = 0; s < g.k1; s++) {
      const u = Pu - (g.k1 - s - 0.5) * f.going;
      y += f.rise;
      st.steps.push({ ...step(A(u, -ACROSS / 2 + width / 2), y, false), flight: 0, riser: ++riser });
    }
    st.flights.push({ i: 0, risers: g.k1, from: r2(y0), to: r2(y), dir: 1, run: r2(runLen(g.k1)) });

    const yTurn = y;
    for (let k = 0; k < g.wn; k++) {
      const th = (k + 0.5) * g.dTh;
      const p = A(Pu + g.rW * Math.sin(th), Pv - g.rW * Math.cos(th));
      y += f.rise;
      // a kite is a trapezium and this draws it as a box on the walking line,
      // the same approximation the helix treads use — the going that matters
      // is checked against the rule, not against the box
      st.steps.push({
        x: r2(p.x), z: r2(p.z), y: r2(y - f.rise / 2), ry: spin(Math.cos(th), Math.sin(th)),
        w: r2(width), d: r2(g.rW * g.dTh), h: r2(f.rise), flight: 1, riser: k + 1, kite: true,
      });
    }
    st.flights.push({ i: 1, risers: g.wn, from: r2(yTurn), to: r2(y), dir: 1, run: r2(g.rW * Math.PI / 2), kites: g.wn });
    riser += g.wn;

    const yTop = y;
    for (let s = 0; s < g.k2; s++) {
      const v = Pv + (s + 0.5) * f.going;
      y += f.rise;
      st.steps.push({ ...step(A(RUN / 2 - width / 2, v), y, true), flight: 2, riser: ++riser });
    }
    st.flights.push({ i: 2, risers: g.k2, from: r2(yTop), to: r2(y), dir: 1, run: r2(runLen(g.k2)) });

    const ap = A(RUN / 2 - width / 2, Pv + g.k2 * f.going + land / 2 - f.going / 2);
    st.landings.push({ x: r2(ap.x), z: r2(ap.z), y: r2(y),
      w: r2(long ? land : width), d: r2(long ? width : land), kind: 'arrival' });
    st.winders = g.wn; st.newelR = g.r0;
    st.goingWalk = g.goingWalk; st.goingNarrow = g.goingNarrow;
    st.top = r2(y0 + H);
    return check(st, opts);
  }

  if (T.imperial) {
    // ── the imperial, and its mirror ─────────────────────────────────────
    // Two ROUTES share one staircase: up the middle to the half landing, then
    // left or right. Every route climbs the whole storey, which is why the
    // riser count is a property of the route and not of the tread total.
    // BIFURCATED is the same staircase read backwards — two flights up to the
    // landing and one wide one on — so it is the same code with the order of
    // the halves swapped, and nothing else changes.
    const k0 = fp.k0, k1 = fp.k1;
    if (T.converge) return bifurcate(st, T, f, fp, box, y0, width, opts, { A, RUN, ACROSS, long, land, step, runLen, k0, k1 });
    // the returns are narrower than the central flight, but not narrower than a
    // stair: their arrival landings have to be landings
    const wr = Math.max(width * 0.55, RULES.width.escape);
    let riser = 0;
    let y = y0;
    for (let s2 = 0; s2 < k0; s2++) {
      const u = -RUN / 2 + land / 2 + s2 * f.going + f.going / 2;
      y += f.rise;
      st.steps.push({ ...step(A(u, 0), y, false), w: r2(width), flight: 0, riser: ++riser });
    }
    const lp = A(RUN / 2 - land / 2, 0);
    st.landings.push({ x: r2(lp.x), z: r2(lp.z), y: r2(y), w: r2(long ? ACROSS : land),
      d: r2(long ? land : ACROSS), kind: 'half' });
    st.flights.push({ i: 0, risers: k0, from: r2(y0), to: r2(y), dir: 1, run: r2(runLen(k0)) });
    const yMid = y;
    for (const [fi, side] of [[1, -1], [2, 1]]) {
      let y2 = yMid;
      for (let s2 = 0; s2 < k1; s2++) {
        const u = RUN / 2 - land - s2 * f.going - f.going / 2;
        const v = side * (width / 2 + wr / 2 + 0.05);
        y2 += f.rise;
        st.steps.push({ ...step(A(u, v), y2, false), w: r2(wr), flight: fi, riser: s2 + 1 });
      }
      const ap = A(-RUN / 2 + land / 2, side * (width / 2 + wr / 2 + 0.05));
      st.landings.push({ x: r2(ap.x), z: r2(ap.z), y: r2(y2), w: r2(long ? wr : land),
        d: r2(long ? land : wr), kind: 'arrival' });
      st.flights.push({ i: fi, risers: k1, from: r2(yMid), to: r2(y2), dir: -1, run: r2(runLen(k1)) });
      y = y2;
    }
    st.routes = [[0, 1], [0, 2]];
    st.top = r2(y0 + H);
    return check(st, opts);
  }

  if (T.crossed) {
    // ── crossed flights ──────────────────────────────────────────────────
    // Two independent straight routes climbing the same void in opposite
    // directions, side by side. Neither is a landing for the other.
    // A CROSSED FLIGHT IS STILL A FLIGHT. Twenty-two risers in one run breaks
    // the same cap a straight stair obeys, so each direction is split and gets
    // its own intermediate landings — the crossing is a plan idea, not an
    // exemption.
    const legs = flightSplit(f.risers, 1);
    const routes = [[], []];
    let fi = 0;
    for (const [side, dir] of [[0, 1], [1, -1]]) {
      let y = y0;
      const v = (side === 0 ? -1 : 1) * (width / 2 + RULES.wellMin / 2);
      let u = dir > 0 ? -RUN / 2 + land / 2 : RUN / 2 - land / 2;
      for (let li = 0; li < legs.length; li++) {
        const k = legs[li];
        for (let s2 = 0; s2 < k; s2++) {
          y += f.rise;
          st.steps.push({ ...step(A(u + dir * f.going / 2, v), y, false), flight: fi, riser: s2 + 1 });
          u += dir * f.going;
        }
        const lp = A(u + dir * (land / 2 - f.going / 2), v);
        st.landings.push({ x: r2(lp.x), z: r2(lp.z), y: r2(y), w: r2(long ? width : land),
          d: r2(long ? land : width), kind: li === legs.length - 1 ? 'arrival' : 'intermediate' });
        u += dir * (land - f.going);
        st.flights.push({ i: fi, risers: k, from: r2(y - k * f.rise), to: r2(y), dir, run: r2(runLen(k)) });
        routes[side].push(fi);
        fi++;
      }
    }
    st.routes = routes;
    st.top = r2(y0 + H);
    return check(st, opts);
  }

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
        // an alternating tread is HALF a stair wide and staggered: the paddle
        // a foot lands on is every other one, which is why the going in plan
        // is half the going a leg gets
        const alt = T.alternating ? (s % 2 === 0 ? -1 : 1) : 0;
        const p = A(u + f.going / 2, alt * width / 4);
        y += f.rise;
        st.steps.push({
          ...step(p, y, false), flight: i, riser: ++riser,
          ...(T.alternating ? { w: r2(width / 2), paddle: alt } : {}),
        });
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

// THE BIFURCATED STAIR is the imperial read the other way round, and the
// difference is not decorative. An imperial takes you up together and DISPERSES
// you left and right at the top: it serves a room you enter from either side. A
// bifurcated stair GATHERS — two flights from two parts of the plan meet on one
// landing and go on as one wide flight — so it serves a room with one door that
// everybody comes through. Same treads, opposite social fact.
function bifurcate(st, T, f, fp, box, y0, width, opts, C) {
  const { A, RUN, ACROSS, long, land, step, runLen, k0, k1 } = C;
  const wr = Math.max(width * 0.55, RULES.width.escape);
  let y = y0;

  // the two rising either side, in step with each other
  for (const [fi, side] of [[0, -1], [1, 1]]) {
    let y2 = y0;
    for (let s = 0; s < k0; s++) {
      const u = -RUN / 2 + land / 2 + s * f.going + f.going / 2;
      const v = side * (width / 2 + wr / 2 + 0.05);
      y2 += f.rise;
      st.steps.push({ ...step(A(u, v), y2, false), w: r2(wr), flight: fi, riser: s + 1 });
    }
    st.flights.push({ i: fi, risers: k0, from: r2(y0), to: r2(y2), dir: 1, run: r2(runLen(k0)) });
    y = y2;
  }

  const lp = A(RUN / 2 - land / 2, 0);
  st.landings.push({ x: r2(lp.x), z: r2(lp.z), y: r2(y),
    w: r2(long ? ACROSS : land), d: r2(long ? land : ACROSS), kind: 'half' });

  // and the one wide flight everybody continues on
  for (let s = 0; s < k1; s++) {
    const u = RUN / 2 - land - s * f.going - f.going / 2;
    y += f.rise;
    st.steps.push({ ...step(A(u, 0), y, false), w: r2(width), flight: 2, riser: s + 1 });
  }
  const ap = A(-RUN / 2 + land / 2, 0);
  st.landings.push({ x: r2(ap.x), z: r2(ap.z), y: r2(y),
    w: r2(long ? width : land), d: r2(long ? land : width), kind: 'arrival' });
  st.flights.push({ i: 2, risers: k1, from: r2(y - k1 * f.rise), to: r2(y), dir: -1, run: r2(runLen(k1)) });

  st.routes = [[0, 2], [1, 2]];
  st.converge = true;
  st.top = r2(y0 + st.H);
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
  // How much well the type wants, over and above what the narrow-going rule
  // demands: a newel is a post, a helix is an open gap, a double or a triple
  // has to fit its other strands past you, and a flying stair's well is the
  // whole point of it.
  const wf = T.wellFloor || (T.double ? [0.9, 0.8] : null);
  const floor = T.newel ? 0.28 : wf ? Math.max(wf[0], w * wf[1]) : Math.max(0.6, w * 0.55);
  const inner = Math.max(floor, need * 1.06);
  const rWalk = inner + k;
  const dTh = f.going / rWalk;
  return { inner, rWalk, outer: inner + w, dTh, turn: f.risers * dTh };
}

// A RAMP IS NOT A STAIR WITH THE STEPS TAKEN OUT. It has no risers, so none of
// the riser arithmetic applies; what it has is a GRADIENT, and the price of a
// gentle one is length — fifteen metres of ramp per metre of rise. Corbusier
// spent it happily and called it the promenade architecturale. It is folded
// into switchback legs with a landing every half metre of rise, which is what
// keeps a chair from running away.
function rampRun(st, T, f, fp, box, y0, width, opts) {
  const long = box.d >= box.w;
  const A = (u, v) => (long ? { x: box.x + v, z: box.z + u } : { x: box.x + u, z: box.z + v });
  const RUN = long ? box.d : box.w;
  const land = Math.max(RULES.landingMin, width);
  // NOT clamped to the box. Shortening the legs to make them fit would make the
  // ramp arrive below the floor it serves, silently — the same failure the
  // quarter turn had. The run is what the gradient demands; whether it fits is
  // the fit check's business.
  const legRun = f.run / f.legs;
  const theta = Math.atan(f.gradient);
  let y = y0;
  for (let i = 0; i < f.legs; i++) {
    const dir = i % 2 === 0 ? 1 : -1;
    const v = (i % 2 === 0 ? -1 : 1) * (width + RULES.wellMin) / 2;
    const rise = legRun * f.gradient;
    const p2 = A(0, v);
    // one sloped slab per leg — a single-axis rotation, so the Euler order
    // cannot bite whichever way the leg runs
    st.steps.push({
      x: r2(p2.x), z: r2(p2.z), y: r2(y + rise / 2), ramp: true,
      w: r2(long ? width : legRun), d: r2(long ? legRun : width), h: 0.2,
      rx: long ? -theta * dir : 0, rz: long ? 0 : theta * dir, ry: 0,
      flight: i, riser: 0,
    });
    y += rise;
    const lp = A(dir > 0 ? RUN / 2 - land / 2 : -RUN / 2 + land / 2, v);
    st.landings.push({ x: r2(lp.x), z: r2(lp.z), y: r2(y),
      w: r2(long ? width : land), d: r2(long ? land : width),
      kind: i === f.legs - 1 ? 'arrival' : 'half' });
    st.flights.push({ i, risers: 0, from: r2(y - rise), to: r2(y), dir, run: r2(legRun) });
  }
  st.gradient = f.gradient; st.legs = f.legs;
  st.routes = [st.flights.map((q) => q.i)];
  st.top = r2(y0 + st.H);
  return check(st, opts);
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

  const strands = T.strands || (T.double ? 2 : 1);
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
  // each strand of a double helix is a whole route on its own — that is the
  // entire point of Chambord's, where two people climb without meeting
  st.routes = st.flights.map((q) => [q.i]);
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
  // Every stair has at least one ROUTE through it, and most have exactly one.
  // An imperial has two that share a flight; a crossed pair and a double helix
  // have two that share nothing. The invariant is per-route, not per-tread:
  // whichever way you go, you climb the whole storey.
  if (!st.routes) st.routes = [st.flights.map((q) => q.i)];

  if (st.gradient) {
    const c2 = [];
    c2.push({ id: 'gradient', label: 'Gradient', pass: st.gradient <= RULES.rampMax + 1e-9,
      value: `1 : ${Math.round(1 / st.gradient)}`,
      note: `against 1:${Math.round(1 / RULES.rampMax)} — steeper than that and it stops being a route for everyone` });
    c2.push({ id: 'rampland', label: 'Landings', pass: st.legs >= Math.ceil(st.H / RULES.rampRise) - 1e-9,
      value: `${st.legs}`, note: 'one every half metre of rise, so nothing can run away down it' });
    c2.push({ id: 'fits', label: 'Fits its shaft', pass: st.fits !== false,
      value: `${st.footprint.w} × ${st.footprint.d} m in ${r2(st.box.w)} × ${r2(st.box.d)}`,
      note: 'a ramp costs fifteen metres of length per metre of rise, and the plan has to find them' });
    st.checks = c2;
    st.pass = c2.every((x) => x.pass);
    st.governing = c2.find((x) => !x.pass) || null;
    return st;
  }

  if (st.seating) {
    const c2 = [];
    c2.push({ id: 'seat', label: 'Seat depth', pass: st.going >= RULES.seatGoing[0] - 1e-9,
      value: `${Math.round(st.going * 1000)} mm`,
      note: 'deep enough to sit on — which is the point, and why Blondel is not asked of it' });
    c2.push({ id: 'seatrise', label: 'Tier height', pass: st.rise <= RULES.seatRise[1] + 1e-9,
      value: `${Math.round(st.rise * 1000)} mm`, note: 'low enough to sit down onto' });
    c2.push({ id: 'walkable', label: 'Still walkable', pass: st.rise >= RULES.seatRise[0] - 1e-9,
      value: `${st.pitch}°`, note: 'you have to be able to get up it as well as sit on it' });
    c2.push({ id: 'fits', label: 'Fits its shaft', pass: st.fits !== false,
      value: `${st.footprint.w} × ${st.footprint.d} m in ${r2(st.box.w)} × ${r2(st.box.d)}`,
      note: 'seating steps are wide and long, and a plan has to give them the room' });
    st.checks = c2;
    st.pass = c2.every((x) => x.pass);
    st.governing = c2.find((x) => !x.pass) || null;
    return st;
  }

  if (st.cordonata) {
    const C = RULES.cordonata;
    const c2 = [];
    c2.push({ id: 'ride', label: 'Ridden pace 2R + G', pass: Math.abs(st.blondel - C.pace) <= 0.14,
      value: `${Math.round(st.blondel * 1000)} mm`,
      note: `against ${C.pace * 1000} — a stride that may belong to a horse, not the 630 of a person on foot` });
    c2.push({ id: 'rise', label: 'Riser height', pass: st.rise <= C.rise[1] + 1e-9 && st.rise >= C.rise[0] - 1e-9,
      value: `${Math.round(st.rise * 1000)} mm`,
      note: `against ${C.rise[0] * 1000}–${C.rise[1] * 1000} — higher and a hoof catches it` });
    c2.push({ id: 'equal', label: 'Equal risers', pass: true, value: `${st.risers} × ${Math.round(st.rise * 1000)} mm`,
      note: 'the count is an integer and the rise is H ÷ n, so they are identical by construction' });
    c2.push({ id: 'fits', label: 'Fits its shaft', pass: st.fits !== false,
      value: `${st.footprint.w} × ${st.footprint.d} m in ${r2(st.box.w)} × ${r2(st.box.d)}`,
      note: 'a cordonata is monumentally long by nature — it belongs on a slope or in a court, not in a core' });
    st.checks = c2;
    st.pass = c2.every((x) => x.pass);
    st.governing = c2.find((x) => !x.pass) || null;
    return st;
  }

  if (st.alternating) {
    const A2 = RULES.alternating;
    const c2 = [];
    c2.push({ id: 'pace', label: 'Pace 2R + 2G', pass: st.blondel >= 0.72 && st.blondel <= 1.0,
      value: `${Math.round(st.blondel * 1000)} mm`,
      note: 'the paddles overlap, so a foot gets TWICE the going the plan shows — that is the whole trick' });
    c2.push({ id: 'pitch', label: 'Pitch', pass: st.pitch >= A2.pitch[0] - 1e-6 && st.pitch <= A2.pitch[1] + 1e-6,
      value: `${st.pitch}°`, note: `against ${A2.pitch[0]}–${A2.pitch[1]}° — steeper than any ordinary stair may be, which is why it is only allowed to reach a loft or a plant room` });
    c2.push({ id: 'rise', label: 'Riser height', pass: st.rise >= A2.rise[0] - 1e-9 && st.rise <= A2.rise[1] + 1e-9,
      value: `${Math.round(st.rise * 1000)} mm`, note: `against ${A2.rise[0] * 1000}–${A2.rise[1] * 1000}` });
    c2.push({ id: 'width', label: 'Clear width', pass: st.width >= A2.width - 1e-6,
      value: `${st.width} m`, note: `against ${A2.width * 1000} mm — one person at a time, and that is stated rather than assumed` });
    c2.push({ id: 'fits', label: 'Fits its shaft', pass: st.fits !== false,
      value: `${st.footprint.w} × ${st.footprint.d} m in ${r2(st.box.w)} × ${r2(st.box.d)}`,
      note: 'the shortest stair there is — which is the reason to accept everything else about it' });
    st.checks = c2;
    st.pass = c2.every((x) => x.pass);
    st.governing = c2.find((x) => !x.pass) || null;
    return st;
  }

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
    if (st.winders) {
      // a kite tread is measured twice, for the same reason a spiral's is: once
      // where it is walked, and once at the inside, where it decides whether
      // the stair can be walked at all
      add('walk', 'Going on the walking line',
        st.goingWalk >= Math.max(RULES.spiralWalk, st.going) - 1e-6,
        `${Math.round(st.goingWalk * 1000)} mm`,
        `against the ${Math.round(st.going * 1000)} mm of the straight flight — the pace may not change at the corner, which is the rule that sets the newel`);
      add('narrow', 'Going 270 mm from the inside', st.goingNarrow >= RULES.spiralNarrow - 1e-6,
        `${Math.round(st.goingNarrow * 1000)} mm`,
        `against ${RULES.spiralNarrow * 1000} mm — and this is what sets the ${Math.round(st.newelR * 1000)} mm newel the kites wind about`);
    }
  } else {
    add('walk', 'Going on the walking line', st.goingWalk >= RULES.spiralWalk - 1e-6,
      `${Math.round(st.goingWalk * 1000)} mm`, `against ${RULES.spiralWalk * 1000} mm — a tapered tread is only measured where it is walked`);
    add('narrow', 'Going at the narrow end', st.goingNarrow >= RULES.spiralNarrow - 1e-6,
      `${Math.round(st.goingNarrow * 1000)} mm`, `against ${RULES.spiralNarrow * 1000} mm — this is the number that makes a spiral climbable or not`);
  }

  // whichever way you go through it, you climb the whole storey
  const routeOK = st.routes.every((rt) => {
    const sum = rt.reduce((a, i) => a + (st.flights.find((q) => q.i === i)?.risers || 0), 0);
    return sum === st.risers;
  });
  add('route', 'Every route climbs the storey', routeOK,
    st.routes.length === 1 ? '1 route' : `${st.routes.length} routes`,
    st.routes.length > 1
      ? 'this stair offers more than one way up, and each of them is a whole storey'
      : 'the flights add up to the storey exactly');

  // a stair inside a dwelling is held to the private minimum, not the escape
  // one — the code has always had two numbers here and so should this
  const wMin = priv ? RULES.width.private : RULES.width.escape;
  add('width', 'Clear width', st.width >= wMin - 1e-6, `${st.width} m`,
    priv ? 'the private minimum, for a stair only one household uses'
      : 'the minimum that gets one person out past another');
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

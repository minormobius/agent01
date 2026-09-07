// game.js — a short-order pancake station, four keys.
//
// THE DESIGN PROBLEM. A pancake house line cook does one thing: pour, flip,
// plate. Handed to a player as three buttons that is not a game, it is a
// rhythm test with a stopwatch. So what is the layer underneath?
//
// It is this: YOU CANNOT SEE THE FACE THAT IS COOKING. The side that matters
// is against the griddle, and every piece of evidence you have about it comes
// off the top — bubbles opening, edges going matte, the batter losing its
// shine. The flip is the moment you find out whether you were right, and it is
// not reversible. That is the same conceit as /proteus/ (you see only what the
// cell feels of itself), and it is what makes this pancakes rather than
// Whac-A-Mole.
//
//   Q  SQUEEZE   hold to pour. Volume accumulates while held, and the batter
//                that landed first is already cooking while the rest arrives.
//   W  BURNER    hold to drive the burner up. It falls when you let go, and a
//                cold cake dropped on the iron drags it down hard.
//   O  SLIDE     work the spatula under the cake. How fast it goes depends on
//                how SET the cake is; go at a raw one and you tear it.
//   P  LIFT      one motion. Release early and the cake lands back on the
//                griddle, flipped. Hold through and you carry it to the
//                counter. Where it ends up is decided by how long you hold.
//
// THE FOURTH KEY IS THE BURNER, and it is not padding. It is the thing that
// makes the bubble cue LIE. Browning is a Maillard reaction — Arrhenius, and
// steep: it roughly doubles every 15 degC. Bubbling is gas release and steam,
// which is much flatter: nearer a doubling every 25 degC. So the two cues do
// not track each other:
//
//   hot griddle    browning outruns bubbling  -> it is burnt underneath before
//                                                the top says it is ready
//   cool griddle   bubbling outruns browning  -> the top says go and the
//                                                underside is still pale
//
// Which means there is no correct bubble threshold. There is a correct
// threshold FOR THE TEMPERATURE YOU ARE RUNNING, and the whole skill of the
// game is holding those two readings in your head at once. griddle.selftest.mjs
// is an experiment about exactly that claim, and is allowed to say it is false.
//
// THE SEAT. One pancake fits. Tickets keep arriving. That is the pressure —
// every second the griddle is empty, or holds a cake you are too cautious to
// commit to, is a second the rail grows.

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

export const KEYS = ['q', 'w', 'o', 'p'];

// ---------------------------------------------------------------- the iron --

export const GRIDDLE = {
  ambientC: 24,
  batterC: 8,
  // Burner power against ambient loss. These are deliberately ASYMMETRIC and
  // that asymmetry is the feel of the thing: a gas ring puts in far more than
  // the iron radiates away, so the griddle climbs fast and fades slowly. A
  // single time constant cannot do that, and a first draft that used one
  // (coolK 0.055) dropped the griddle 60 degC in a second and pinned it at
  // ambient — cooking is on the compressed clock, so a real-world per-second
  // loss rate runs seven times too fast.
  //
  //   full burner at 190    +22 degC per wall-second
  //   burner off at 200     -16 degC per wall-second
  //
  // Equilibrium at full burner is far above maxC, so holding W always pegs the
  // iron. That is intended: the burner is a lever you tap, not a dial you set.
  burnerGain: 2.5,
  coolK: 0.006,
  maxC: 265,
  // How hard a cake pulls heat out of the iron under it, per ml of contact.
  drawK: 0.020,
  // How fast the cake BODY equilibrates toward the griddle. Only used for the
  // heat it draws — the reactions all run off the contact face, which is the
  // griddle temperature itself.
  cakeK: 0.0042,
};

// Real pancake numbers, at 190 degC on a cast-iron griddle.
export const COOKING = {
  // Browning accumulates on whichever face is down. 0.5 is golden; 1.0 is
  // burnt. At 190 a side reaches golden in about 70 s.
  brownAt190: 0.5 / 70,
  brownDoubleC: 15,          // Maillard: steep in temperature
  // The coagulation front rising from the griddle. 1.0 = set through.
  setAt190: 1 / 105,
  setDoubleC: 20,
  // Leavening gas + steam. Flatter in temperature than browning — this gap IS
  // the game.
  bubbleAt190: 1 / 34,
  bubbleDoubleC: 25,
  // Once the top skins over, bubbles stop breaking through and the surface
  // goes matte. That is the classic cue and it is an emergent one here.
  popSetCeiling: 0.72,
};

// Scales gas that reaches the surface into the 0..1 reading the player sees.
// Tuned so the cue spans most of its range over a normal cook rather than
// living in a narrow band at the bottom.
const CRATER_GAIN = 5.0;

// The clock is compressed. A real pancake is 60-90 s a side, which is not a
// game, so cooking runs at PACE times wall speed: golden in 70 real seconds
// becomes golden in 4.7 played seconds. NOTHING ELSE IS SCALED — the
// temperature curves, the doubling constants and their ratio are all as
// written above, so the burnt-versus-pale trade-off the game is about is the
// real one running fast. Stated here rather than buried, the same way /flag/
// states its display slow-motion.
//
// The player's own actions are NOT on this clock. Pouring, sliding the spatula
// under and carrying to the counter all run on wall time, because those are
// things a hand does rather than reactions in the batter. A first draft poured
// on the compressed clock and a target-sized cake came out in 0.14 s, which is
// not a control, it is a twitch.
export const PACE = 15;

const brownRate = (T) => COOKING.brownAt190 * Math.pow(2, (T - 190) / COOKING.brownDoubleC);
const setRate = (T) => (T < 62 ? 0 : COOKING.setAt190 * Math.pow(2, (T - 190) / COOKING.setDoubleC));
const bubbleRate = (T) => (T < 70 ? 0 : COOKING.bubbleAt190 * Math.pow(2, (T - 190) / COOKING.bubbleDoubleC));

export { brownRate, setRate, bubbleRate };

// --------------------------------------------------------------- the cake --

// Batter spreads to roughly constant thickness, so radius goes as sqrt(volume)
// and thickness barely moves. A big cake is therefore mostly a WIDER problem,
// not a much thicker one — but the little thickness it does gain slows the set
// front, which is why an over-poured cake browns before it sets and cannot be
// slid under without tearing.
export const POUR = {
  mlPerSec: 62,
  minMl: 18,
  maxMl: 145,
  targetMl: 62,              // what a ticket actually wants
  toleranceMl: 26,           // outside this the cake is the wrong size
};

export function cakeRadiusMm(ml) { return 26 * Math.sqrt(ml / POUR.targetMl); }
export function cakeThicknessMm(ml) { return 7.4 * Math.pow(ml / POUR.targetMl, 0.22); }

export function createCake(ml) {
  return {
    ml,
    tempC: GRIDDLE.batterC,
    // The two faces. `down` is against the iron and is the one you cannot see.
    down: 0, up: 0,
    flips: 0,
    set: 0,
    leaven: 1,
    bubbles: 0,        // gas currently working up through the batter
    craters: 0,        // bubbles that have broken the surface — the visible cue
    edgeDry: 0,
    torn: 0,           // damage from sliding under a cake that has not set
    age: 0,
  };
}

// ------------------------------------------------------------- the station --

export const SPATULA = {
  slideSecs: 0.55,           // to get fully under a properly set cake
  tearSet: 0.42,             // below this, sliding damages the cake
  tearRate: 1.9,             // damage per second of sliding at set = 0
  carrySecs: 0.75,           // hold P this long and it goes to the counter
};

export const RAIL = {
  firstTicketSecs: 5,
  // Tickets speed up. This is the whole difficulty curve.
  //
  // Paced so that a COOL griddle is slow but survivable rather than
  // arithmetically impossible. At 175 degC a cake takes about 16 s end to end;
  // at 200 it takes about 7. An earlier, faster rail (a 6.5 s floor) meant the
  // whole cool half of the range lost on throughput no matter how well it was
  // cooked, which collapsed the interesting decision — run the iron hotter for
  // throughput and risk the burn, or run it cool and safe and fall behind —
  // into no decision at all.
  minGapSecs: 11,
  startGapSecs: 20,
  rushPerSec: 0.045,
  patienceSecs: 95,
  maxOpen: 8,
};

export function createStation(opts = {}) {
  const seed = opts.seed ?? 1;
  let s = seed >>> 0;
  const rng = () => {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    rng,
    griddleC: opts.griddleC ?? 168,
    burner: 0,
    cake: null,
    // Spatula: how far under, whether it has the cake, how long P has been held.
    under: 0,
    loaded: false,
    lifting: 0,
    pouring: 0,
    // Ledger.
    served: 0, quality: 0, rejected: 0, torn: 0, walked: 0, burned: 0,
    tickets: [],
    nextTicketIn: RAIL.firstTicketSecs,
    elapsed: 0,
    over: false,
    cause: '',
    lastVerdict: null,
    // For the HUD and the tests: what the top of the cake is telling you.
    cue: { craters: 0, edgeDry: 0 },
  };
}

// What the counter will actually send out. This is a real design lever and it
// was set too low: at 0.25, a stone-pale cake — both faces barely coloured —
// squeaked past, and the selftest reported that the best way to play was to
// cook fast and pale and let throughput do the work. That is a fair reading of
// a counter with no standards. At 0.45 a cake has to be somewhere near golden
// on both sides; roughly, browning outside 0.28..0.72 comes back.
const COUNTER_STANDARD = 0.45;

// How good is this cake? Both faces want to land near golden, it has to be set
// through, it must not be torn, and it should be about the size that was
// ordered. Graded rather than pass/fail, so the sweep in the selftest has a
// gradient to climb.
export { COUNTER_STANDARD };

export function judge(cake) {
  if (!cake) return { q: 0, why: 'nothing' };
  if (cake.torn >= 1) return { q: 0, why: 'torn' };
  const faces = [cake.down, cake.up];
  if (Math.max(...faces) > 1.0) return { q: 0, why: 'burnt' };
  if (cake.set < 0.95) return { q: 0, why: 'raw' };
  if (cake.flips === 0) return { q: 0, why: 'one-sided' };
  // Distance of each face from golden, and how uneven the two are.
  const off = faces.map((b) => Math.abs(b - 0.5) / 0.5);
  const colour = clamp(1 - (off[0] + off[1]) / 2, 0, 1);
  const even = clamp(1 - Math.abs(faces[0] - faces[1]) / 0.5, 0, 1);
  const size = clamp(1 - Math.abs(cake.ml - POUR.targetMl) / POUR.toleranceMl, 0, 1);
  // COLOUR MULTIPLIES, it does not add. A weighted sum let a stone-pale cake
  // score 0.58 and pass the counter, because it was perfectly even and exactly
  // the right size — which is a fair description of a pancake nobody wants.
  // Getting the colour wrong has to be able to fail the cake on its own.
  const q = colour * (0.60 + 0.25 * even + 0.15 * size);
  return {
    q,
    why: q < COUNTER_STANDARD ? (colour < 0.55 ? (faces[0] + faces[1] < 1.0 ? 'pale' : 'dark') : 'wrong size') : 'ok',
  };
}

// ------------------------------------------------------------------- tick --

export function tickStation(st, dtWall, held = [false, false, false, false]) {
  if (st.over) return st;
  const dt = dtWall * PACE;
  st.elapsed += dtWall;

  // ---- W: the burner ----------------------------------------------------
  // Held drives it up quickly, released lets it fall. It is a lever you ride,
  // not a setting you choose, which is what makes the temperature something
  // you have to keep in your head rather than read once.
  // THE FLAME LAGS, AND THAT LAG IS THE POINT. A gas ring under cast iron does
  // not change the plate's temperature when you turn the knob; the flame comes
  // up, then the iron follows. A first draft used a 0.2 s constant here, which
  // let a bang-bang controller pin the griddle to within a fraction of a degree
  // — and the selftest duly reported that a stopwatch cooks as well as reading
  // the cake, because at a genuinely constant temperature it DOES. That is true
  // of real kitchens too: a thermostatted commercial plate is cooked by timer.
  // The bubble cue exists precisely because a griddle you are riding by hand
  // wanders.
  //
  // Being honest about what this constant did and did not fix: it is the right
  // number physically, but on its own it did NOT overturn that result — a
  // bang-bang controller still holds the plate near its setpoint, because the
  // iron's own time constant is long. What the cue actually earns its keep
  // against is a griddle at the WRONG temperature, not one that jitters around
  // the right one, and that is what the selftest measures.
  const wantBurner = held[1] ? 1 : 0;
  st.burner += (wantBurner - st.burner) * (1 - Math.exp(-dtWall / 1.10));

  // Heat balance. The cake draws out of the iron in proportion to how much
  // colder it is and how much of it is in contact.
  let draw = 0;
  if (st.cake) {
    const contact = st.cake.ml * GRIDDLE.drawK;
    draw = contact * (st.griddleC - st.cake.tempC) * 0.004;
  }
  const dT = st.burner * GRIDDLE.burnerGain
    - GRIDDLE.coolK * (st.griddleC - GRIDDLE.ambientC)
    - draw;
  st.griddleC = clamp(st.griddleC + dT * dt, GRIDDLE.ambientC, GRIDDLE.maxC);

  // ---- Q: the squirt bottle ---------------------------------------------
  // NOTE THE UNITS. Pouring runs on WALL time, not the compressed cooking
  // clock. Squeezing a bottle is something the player's hand does; browning is
  // a reaction. Running the pour on the compressed clock made a target cake
  // come out in 0.14 s, which is not a control, it is a twitch.
  if (held[0]) {
    if (!st.cake) {
      st.pouring += POUR.mlPerSec * dtWall;
      if (st.pouring >= POUR.minMl) {
        // The cake exists from the moment enough batter has landed, so the
        // first of it is already cooking while the rest is still coming out.
        if (!st.cake) st.cake = createCake(st.pouring);
      }
    } else if (st.cake && st.pouring > 0) {
      // Still pouring into the cake that is already down.
      st.cake.ml = Math.min(POUR.maxMl, st.cake.ml + POUR.mlPerSec * dtWall);
      st.pouring = st.cake.ml;
    } else {
      // Squeezing onto a cake that is already cooking: batter on top of a
      // half-done pancake ruins it. Mashing the pour key is a real mistake.
      st.cake.torn = 1;
      st.cake.ml = Math.min(POUR.maxMl, st.cake.ml + POUR.mlPerSec * dtWall * 0.4);
    }
  } else {
    st.pouring = 0;
  }

  // ---- the cake cooks ---------------------------------------------------
  // Not while it is in the air. A cake up on the spatula mid-flip is not
  // touching the iron, so nothing happens to it — the first draft went on
  // browning it through the lift, which meant a slow flip quietly cost you
  // colour on a face that was nowhere near the heat.
  const cake = st.cake;
  const inAir = st.loaded && st.lifting > 0;
  if (cake && !inAir) {
    cake.age += dt;
    // The cake body equilibrates toward the iron.
    cake.tempC += (st.griddleC - cake.tempC) * (1 - Math.exp(-dt * GRIDDLE.cakeK * 12));
    // Everything that happens is driven by the temperature at the CONTACT
    // face, which is the griddle, not the cake's bulk temperature.
    const T = st.griddleC;
    const thick = cakeThicknessMm(cake.ml) / cakeThicknessMm(POUR.targetMl);

    // The face against the iron browns. The face in the air does not.
    cake.down += brownRate(T) * dt;

    // The coagulation front rises. A thicker cake sets more slowly. After a
    // flip the body is already hot, so the rest of the set comes fast.
    const setBoost = cake.flips > 0 ? 1.9 : 1;
    cake.set = clamp(cake.set + (setRate(T) / thick) * setBoost * dt, 0, 1);

    // Leavening gas works up through the batter and breaks the surface — but
    // only while the top is still liquid enough to let it through. Once the
    // top skins over the craters stop refilling and the surface goes matte,
    // which is exactly the cue a cook actually uses, and here it falls out of
    // the model rather than being scripted.
    //
    // DRIVEN BY THE BATTER'S OWN TEMPERATURE, not the griddle's. Gas comes out
    // of the whole body of the cake as it warms, and the cake lands cold. That
    // delay is what gives the cue its shape: craters climb over the first few
    // seconds, peak, and then fall away as the top skins over. Driving this off
    // the griddle temperature instead — which the first draft did — makes the
    // craters jump to their maximum on the first frame and decay from there,
    // so the cue is at its loudest when the cake is rawest, which is exactly
    // backwards and left every threshold above 0.4 permanently unreachable.
    const release = bubbleRate(cake.tempC) * cake.leaven * dt;
    cake.leaven = clamp(cake.leaven - release * 0.55, 0, 1);
    cake.bubbles += release;
    const canPop = clamp((COOKING.popSetCeiling - cake.set) / COOKING.popSetCeiling, 0, 1);
    const popped = cake.bubbles * canPop * Math.min(1, dt * 2.6);
    cake.bubbles -= popped;
    cake.craters = clamp(cake.craters + popped * CRATER_GAIN - cake.craters * Math.min(1, dt * 0.09), 0, 1);
    // Edges are thinner and take heat from the side, so they dry first.
    cake.edgeDry = clamp(Math.pow(cake.set, 0.62), 0, 1);

    st.cue.craters = cake.craters;
    st.cue.edgeDry = cake.edgeDry;

    if (Math.max(cake.down, cake.up) > 1.45) {
      // Left on the iron until it is charcoal — it is gone, and the seat is
      // still occupied until you scrape it off.
      cake.torn = 1;
    }
  } else {
    st.cue.craters = 0;
    st.cue.edgeDry = 0;
  }

  // ---- O: sliding the spatula under -------------------------------------
  if (held[2] && cake && !st.loaded) {
    // A set cake lifts cleanly. A raw one drags and tears, and the damage is
    // permanent — this is the key that punishes impatience.
    const ease = clamp((cake.set - SPATULA.tearSet) / (1 - SPATULA.tearSet), 0, 1);
    st.under = clamp(st.under + (0.35 + 0.65 * ease) * (dtWall / SPATULA.slideSecs), 0, 1);
    if (cake.set < SPATULA.tearSet) {
      const short = (SPATULA.tearSet - cake.set) / SPATULA.tearSet;
      cake.torn = clamp(cake.torn + SPATULA.tearRate * short * dtWall, 0, 1);
    }
    if (st.under >= 1) st.loaded = true;
  } else if (!held[2] && !st.loaded) {
    st.under = Math.max(0, st.under - dtWall / 0.35);
  }

  // ---- P: the lift ------------------------------------------------------
  // ONE MOTION. While P is down the cake is off the iron. Let go early and it
  // comes back down flipped; hold through carrySecs and it goes to the
  // counter. Nothing decides which except how long you hold.
  if (held[3] && st.loaded) {
    st.lifting += dtWall;
    if (st.lifting >= SPATULA.carrySecs) {
      deliver(st);
    }
  } else if (!held[3] && st.lifting > 0) {
    if (st.loaded) flip(st);
    st.lifting = 0;
  }
  if (!held[3]) st.lifting = 0;

  // ---- the rail ---------------------------------------------------------
  st.nextTicketIn -= dtWall;
  if (st.nextTicketIn <= 0) {
    st.tickets.push({ age: 0 });
    const gap = Math.max(RAIL.minGapSecs, RAIL.startGapSecs - RAIL.rushPerSec * st.elapsed);
    st.nextTicketIn = gap;
  }
  for (const t of st.tickets) t.age += dtWall;
  const before = st.tickets.length;
  st.tickets = st.tickets.filter((t) => t.age < RAIL.patienceSecs);
  st.walked += before - st.tickets.length;
  if (st.tickets.length > RAIL.maxOpen) {
    st.over = true;
    st.cause = 'the window backed up';
  }
  if (st.walked >= 5) {
    st.over = true;
    st.cause = 'too many walked out';
  }
  return st;
}

// A flip: the faces swap, the spatula comes out from under, and the browning
// clock starts on what used to be the top.
export function flip(st) {
  const c = st.cake;
  if (!c) return;
  const d = c.down; c.down = c.up; c.up = d;
  c.flips++;
  st.loaded = false;
  st.under = 0;
  return c;
}

// The counter judges it. A rejected cake does not close a ticket; the seat is
// free either way, which is the whole cost — you spent the griddle time.
export function deliver(st) {
  const c = st.cake;
  if (!c) return null;
  const v = judge(c);
  st.cake = null;
  st.loaded = false;
  st.under = 0;
  st.lifting = 0;
  st.pouring = 0;
  if (v.q >= COUNTER_STANDARD) {
    st.served++;
    st.quality += v.q;
    if (st.tickets.length) st.tickets.shift();
  } else {
    st.rejected++;
    if (v.why === 'torn') st.torn++;
    if (v.why === 'burnt') st.burned++;
  }
  st.lastVerdict = { ...v, at: st.elapsed, ml: c.ml, down: c.down, up: c.up, set: c.set };
  return v;
}

// Scrape a ruined cake off without walking it to the counter — the seat is
// what matters, not the ceremony.
export function scrape(st) {
  if (!st.cake) return;
  st.rejected++;
  if (st.cake.torn >= 1) st.torn++;
  st.cake = null;
  st.loaded = false;
  st.under = 0;
  st.pouring = 0;
}

export function score(st) {
  return { served: st.served, quality: st.quality, rejected: st.rejected, walked: st.walked };
}

// tjs/brut/lift.js — THE LIFTS. Pure, DOM-free, three.js-free.
//
// A stair is a geometry problem: you have a height, you need equal risers, and
// Blondel tells you the going. A LIFT IS A QUEUEING PROBLEM, and that is the
// whole difference. Nothing about a lift is decided by drawing one. How many
// there are, how big they are and how fast they go all fall out of one number
// nobody can see — how long the round trip takes — and that number is a
// function of how many people are upstairs, how many floors they are spread
// over, and how many of them fit in a car.
//
// So this file does not place anything. It answers three questions in order:
//
//   1. IS ONE NEEDED AT ALL?  Two separate thresholds, and they are different
//      rules with different reasons. ACCESS: a storey nobody in a wheelchair
//      can reach is a storey they are excluded from, and that bites at ONE
//      storey above the entrance, not at four. TRAFFIC: at four or five
//      storeys people stop taking the stairs, and above that a building
//      without enough lifts does not fail — it just makes everybody wait.
//
//   2. HOW MANY, AND HOW BIG?  The round-trip-time calculation (CIBSE Guide D,
//      after Barney and dos Santos), which is the piece of arithmetic the whole
//      discipline rests on:
//
//         RTT = 2·H·tv + (S + 1)·ts + 2·P·tp
//
//      H is the highest floor the car reverses at, S is how many times it
//      stops, and both are EXPECTED VALUES over a random loading of P
//      passengers into N floors — so the sizing is a probability calculation,
//      not a capacity one. Then the two numbers a client actually feels:
//
//         interval  INT  = RTT / L                 (how long you wait)
//         capacity  HC   = 300·P·L / RTT           (persons per five minutes)
//
//   3. DOES IT STILL WORK AT THE TOP?  Past forty-odd storeys one group cannot
//      meet an interval at any car size, because H and S both saturate at N.
//      The answer is not a bigger lift, it is ZONING — and the fact that tall
//      buildings are cut into zones is a consequence of this equation rather
//      than a style.
//
// The couplings to the parti are the interesting part, and one of them is the
// reason a famous building is shaped the way it is: a SKIP-STOP section only
// stops the lift every third floor, which cuts N to a third and the round trip
// with it. Corbusier's rue intérieure is usually explained as a social idea. It
// is also, exactly, a lift economy — and here that is a number you can read.

export const VERSION = 'lift/1';

const r2 = (v) => Math.round(v * 100) / 100;
const r3 = (v) => Math.round(v * 1000) / 1000;

/* ────────────────────────────── the rule book ───────────────────────────── */

export const RULES = {
  // ACCESS, not traffic. Approved Document M and the ADA both say the same
  // thing in different words: if there is a storey above the entrance, there
  // has to be a way up it that does not involve steps.
  accessibleAboveStoreys: 1,

  // TRAFFIC. Below this people walk, and a lift is a convenience; above it the
  // stair stops being the route and the queueing calculation starts to bind.
  trafficAboveStoreys: 4,

  // A FIREFIGHTING LIFT once the top occupied storey is this far above the
  // access level — BS 9999 / AD B. It is not an extra car bolted on: one of
  // the group is built into a protected shaft with its own lobby and its own
  // supply, and it must reach the top floor inside a minute.
  firefightingAboveM: 18,
  firefightingReachS: 60,

  // Beyond this a single group cannot hold an interval at any car size,
  // because H and S have both saturated at N. Zoning is the answer, and the
  // limit here is what makes the code go looking for it.
  maxCarsPerGroup: 8,
  maxZones: 6,

  person: 75,                 // kg, EN 81-20's unit of passenger
  loadFactor: 0.8,            // nobody fills a car to its rated load, and
                              // sizing as though they do is the classic error

  // THE POPULATION IS WHO IS THERE, NOT WHO HAS A DESK. A floor plate designed
  // at one person per ten square metres never holds that many at nine in the
  // morning: people are on holiday, at a client, off sick, in a meeting
  // somewhere else. CIBSE Guide D takes the traffic population as about four
  // fifths of the design population for exactly this reason, and using the desk
  // count instead is how a building ends up with two more shafts than it needed
  // through every floor for sixty years.
  diversity: 0.8,

  // The motion profile. A lift is jerk-limited for the same reason a gantry is
  // — what a passenger objects to is not speed or even acceleration, it is the
  // RATE OF CHANGE of acceleration, which is what turns a stop into a lurch.
  jerk: 1.0,                  // m/s³
  accel: 1.0,                 // m/s²

  doorOpen: 2.0,              // s, advance-opening, 1100 mm centre-opening
  doorClose: 3.2,
  transfer: 1.2,              // s per passenger, in OR out — hence the 2P

  // Rated speed from the travel. Under-speccing shows up as a long journey
  // time rather than a failed check, which is why it is a ladder and not a
  // criterion.
  speedLadder: [[12, 0.63], [25, 1.0], [40, 1.6], [70, 2.0],
                [100, 2.5], [150, 4.0], [Infinity, 6.0]],

  // Pit and headroom follow the speed: both are the distance the car needs to
  // stop if everything else has failed, so both grow with v.
  pit: (v) => r2(1.1 + 0.55 * v),
  overrun: (v) => r2(3.6 + 0.5 * v),
};

// EN 81-20 Table 6: the available car area for a rated load is a LIMIT, not a
// choice — it is set so a car cannot be overloaded by people simply standing in
// it. `w` is across the door, `d` is into the shaft, and the shaft dimensions
// include the running clearances, the counterweight and the door pocket.
export const CARS = [
  { kg: 630, persons: 8, car: [1.10, 1.40], shaft: [1.75, 1.80],
    note: 'the smallest car an accessible route may use — 1100 × 1400 is the wheelchair turning box, and it is a minimum rather than a size' },
  { kg: 1000, persons: 13, car: [1.10, 2.10], shaft: [1.75, 2.60],
    note: 'the workhorse: one wheelchair, or a stretcher, or thirteen people who know each other slightly better afterwards' },
  { kg: 1275, persons: 17, car: [2.00, 1.40], shaft: [2.65, 1.90],
    note: 'wide rather than deep, so the whole car empties at once — the shape that makes an office lobby work' },
  { kg: 1600, persons: 21, car: [1.40, 2.40], shaft: [2.10, 2.90],
    note: 'a goods-capable passenger car; the first size that will take a pallet truck' },
  { kg: 2000, persons: 26, car: [1.50, 2.70], shaft: [2.20, 3.20],
    note: 'a bed lift, and the smallest car that is worth running at 2.5 m/s' },
  { kg: 2500, persons: 33, car: [2.00, 2.30], shaft: [2.70, 2.85],
    note: 'past this the car is no longer the constraint — the doors are, because everybody has to get through them twice' },
];

// Net floor area per person, by room programme. This is the number the whole
// calculation stands on and it is the softest one in it: the same office plate
// is 8 m²/person let to a call centre and 14 to a law firm. The values are the
// BCO / CIBSE Guide D middle, and the point of reading them off the ROOM
// SCHEDULE rather than assuming one density for the building is that a floor of
// stacks and a floor of meeting rooms genuinely do not hold the same crowd.
export const DENSITY = {
  'open office': 8, office: 10, meeting: 2.5, breakout: 4, 'council chamber': 1.5,
  committee: 3, 'reading room': 5, stacks: 30, registry: 12, archive: 40,
  exhibition: 4, reception: 10, 'entrance hall': 6, 'café': 3, cafe: 3,
  'great hall': 3,
  'wet lab': 18, 'dry lab': 15, 'write-up': 8, 'tissue culture': 25, 'cold room': 60,
  print: 20, server: 200, store: 100, 'cycle store': 60, refuse: 200, loading: 60,
  plant: 200, WC: 12, 'drying room': 60, laundry: 20,
  stall: 40,                       // a deck's population arrives by car, not by lift
  nave: 1.2, narthex: 2, chancel: 4, apse: 6, aisle: 1.5, transept: 1.5, chapel: 3,
  DEFAULT: 12,
};
// Dwellings are counted by home, not by area — a 2-bed flat holds about three
// people whether it is 60 m² or 90.
const DWELLING = [[/3-bed/, 4], [/2-bed/, 3], [/1-bed/, 2], [/studio/, 1.4], [/flat|maisonette/, 2.5]];

export function densityFor(program) {
  if (!program) return DENSITY.DEFAULT;
  if (DENSITY[program] != null) return DENSITY[program];
  const k = Object.keys(DENSITY).find((q) => program.startsWith(q) || program.includes(q));
  return k ? DENSITY[k] : DENSITY.DEFAULT;
}

// The service criteria a building is judged against — quality of service, in
// the trade's own phrase. They differ by an order of magnitude across
// typologies for a real reason: an office empties and fills in fifteen minutes
// twice a day, and a housing block never does anything of the sort.
export const CRITERIA = {
  office: { pop: 12, interval: 30, peak: 'up-peak', note: 'the morning arrival, which is the only fifteen minutes that matter' },
  civic: { pop: 10, interval: 40, peak: 'two-way', note: 'the public arrive all day rather than all at once' },
  lab: { pop: 10, interval: 40, peak: 'two-way', note: 'and half the traffic is trolleys' },
  housing: { pop: 6, interval: 60, peak: 'two-way', note: 'nobody in a housing block leaves at the same time as anybody else, and the tolerance for waiting at home is much higher than at work' },
  carpark: { pop: 4, interval: 90, peak: 'two-way', note: 'the deck is the route; the lift is there so the route is not stairs' },
  cathedral: { pop: 0, interval: 0, peak: 'none', note: 'one volume, one floor — there is nothing to serve' },
};

/* ═══════════════════════ the two probability formulas ══════════════════════
   These are the whole calculation, and they are EXPECTED VALUES rather than
   worst cases. Sizing a lift on the worst case (every floor gets a stop, the
   car always goes to the top) gives you roughly twice the lifts you need, and
   the building pays for the extra shafts on every floor for sixty years. */

// The expected number of STOPS a full car makes, when P passengers each pick
// one of N floors at random. Each floor is missed with probability ((N−1)/N)^P,
// so the expected count of floors hit is the complement, N times over.
export function probableStops(N, P) {
  if (N <= 0 || P <= 0) return 0;
  if (N === 1) return 1;
  return N * (1 - Math.pow((N - 1) / N, P));
}

// The expected HIGHEST REVERSAL FLOOR — how far up the car actually goes before
// it turns round. The probability that the highest of P independent uniform
// picks is at or below floor i is (i/N)^P, so
//
//     E[H] = Σ_{i=0}^{N-1} P(H > i) = N − Σ_{i=1}^{N-1} (i/N)^P
//
// which is why a car with twelve people in it goes almost to the top and a car
// with two rarely does. Both saturate at N, and that saturation is exactly why
// a tall building has to be zoned.
export function highestReversal(N, P) {
  if (N <= 0 || P <= 0) return 0;
  let s = 0;
  for (let i = 1; i <= N - 1; i++) s += Math.pow(i / N, P);
  return N - s;
}

/* ═══════════════════════════ the motion profile ════════════════════════════
   A lift is jerk-limited, and the reason is not the machine — it is the
   passenger. What people object to is the RATE OF CHANGE of acceleration: the
   lurch, not the speed. So the profile is the seven-segment S-curve, and over a
   single floor a lift usually never reaches its rated speed at all, which is
   why a fast lift in a low building buys almost nothing. */

// Time to run `d` metres from rest to rest under jerk j, acceleration a and
// rated speed v. Returns the time AND the peak speed actually reached, because
// the second is what says whether the rated speed was ever relevant.
export function flightTime(d, v, a = RULES.accel, j = RULES.jerk) {
  if (d <= 0) return { t: 0, vPeak: 0, reached: false };
  // the duration of one full ramp, 0 → v, and the distance it covers (v·t/2,
  // exactly, because the ramp is antisymmetric about its midpoint)
  const rampFor = (vv) => (vv >= a * a / j ? vv / a + a / j : 2 * Math.sqrt(vv / j));
  const tRamp = rampFor(v);
  if (d >= v * tRamp) {
    // there is a cruise phase: total = 2·tRamp + tCruise, and d = v·tRamp + v·tCruise
    return { t: tRamp + d / v, vPeak: v, reached: true };
  }
  // never reaches rated speed. Solve for the peak that exactly fills d.
  // with the acceleration limit reached:  v²/a + v·a/j = d
  const disc = Math.pow(a * a / j, 2) + 4 * a * d;
  let vp = (-(a * a / j) + Math.sqrt(disc)) / 2;
  if (vp < a * a / j) vp = Math.cbrt(d * d * j / 4);   // a never reached either
  return { t: 2 * rampFor(vp), vPeak: vp, reached: false };
}

export function speedFor(travel) {
  for (const [upTo, v] of RULES.speedLadder) if (travel <= upTo) return v;
  return RULES.speedLadder[RULES.speedLadder.length - 1][1];
}

/* ═════════════════════════════ the round trip ══════════════════════════════ */

// One car, one full round trip from the terminal and back.
//
//   RTT = 2·H·tv + (S + 1)·ts + 2·P·tp   (+ the express run, if it has one)
//
// tv is the rated-speed flight time for ONE floor, so 2H·tv is the running; ts
// is everything a stop costs that running does not (doors, levelling, the
// acceleration the flight time at rated speed pretends did not happen), and the
// +1 is the stop at the terminal itself.
export function roundTrip(o) {
  const { floors: N, passengers: P, df, v, express = 0 } = o;
  const S = probableStops(N, P);
  const H = highestReversal(N, P);
  const tv = df / v;                                   // one floor at rated speed
  const f1 = flightTime(df, v);                        // one floor, honestly
  const ts = f1.t + RULES.doorOpen + RULES.doorClose - tv;
  const tp = RULES.transfer;
  // an express run is made twice and stops nowhere, so it is pure flight time
  const tExp = express > 0 ? 2 * flightTime(express, v).t : 0;
  const rtt = 2 * H * tv + (S + 1) * ts + 2 * P * tp + tExp;
  return {
    rtt: r2(rtt), S: r3(S), H: r3(H), tv: r3(tv), ts: r3(ts), tp,
    express: r2(express), tExpress: r2(tExp),
    singleFloor: r3(f1.t), reachesRated: f1.reached, vPeak: r3(f1.vPeak),
  };
}

// What a client feels: how long you wait, and how many of you get away in five
// minutes. `pop` is the population the group serves.
// NOT ROUNDED, and for the same reason a riser is not rounded: these are
// quantities decisions are made on, not labels. Two identities hold exactly —
// twice the cars is half the wait and twice the capacity — and rounding to a
// reported precision breaks both, which turns a ladder that is choosing between
// close candidates into one that is choosing between rounding errors. The
// formatting belongs to whoever prints it.
export function service(rtt, cars, P, pop) {
  const interval = rtt / cars;
  const hc = (300 * P * cars) / rtt;
  return { interval, hc5: hc, pctPop: pop > 0 ? (100 * hc) / pop : 0 };
}

/* ═══════════════════════════════ the sizing ════════════════════════════════
   The ladder, in the order a designer actually walks it: fewest cars first,
   then smallest car, because every extra shaft is a hole through every floor
   for the life of the building. Only when no group of any size will hold the
   interval does it zone — which is the honest reason tall buildings are cut
   into zones, rather than a stylistic one. */

export function sizeGroup(o) {
  const {
    typology = 'office', floorsAbove: N, population: pop,
    df, travel, stops = null, maxCars = RULES.maxCarsPerGroup,
  } = o;
  const crit = CRITERIA[typology] || CRITERIA.office;
  const v = speedFor(travel);

  // the lift may not stop at every floor it passes — a skip-stop section is the
  // whole reason this is a parameter rather than N
  const served = stops == null ? N : stops;

  const attempts = [];
  for (let zones = 1; zones <= RULES.maxZones; zones++) {
    // floors and population split between zones; the upper zones pay an express
    // run to their own base, and the lowest pays none
    const zoneN = Math.max(1, Math.ceil(served / zones));
    const zonePop = pop / zones;
    for (let cars = 1; cars <= maxCars; cars++) {
      for (let ci = 0; ci < CARS.length; ci++) {
        const C = CARS[ci];
        const P = Math.max(1, Math.round(C.persons * RULES.loadFactor));
        // the worst zone is the top one — the longest express run
        const express = zones > 1 ? (zones - 1) * zoneN * df : 0;
        const trip = roundTrip({ floors: zoneN, passengers: P, df, v, express });
        const svc = service(trip.rtt, cars, P, zonePop);
        const okPop = crit.pop <= 0 || svc.pctPop >= crit.pop;
        const okInt = crit.interval <= 0 || svc.interval <= crit.interval;
        const cand = {
          zones, cars, carsTotal: cars * zones, car: C, P, v, trip, ...svc,
          okPop, okInt, pass: okPop && okInt,
        };
        attempts.push(cand);
        if (cand.pass) return finish(cand, o, crit, v);
      }
    }
  }
  // NOTHING PASSES — which for a tall enough building is the true answer, and
  // it is one worth returning properly. The best failure is the one whose WORST
  // shortfall is smallest: scoring on the sum instead lets a candidate that
  // triples the capacity hide an interval twice the limit, and the thing you
  // then show a client is a lift group nobody would build. Past this point the
  // real moves are double-deck cars or a sky lobby, and neither is something
  // this kernel can pretend its way into.
  const score = (c) => Math.min(
    crit.pop > 0 ? c.pctPop / crit.pop : Infinity,
    crit.interval > 0 ? crit.interval / c.interval : Infinity);
  const best = attempts.reduce((a, b) => (score(b) > score(a) ? b : a), attempts[0]);
  return finish({ ...best, pass: false, exhausted: true }, o, crit, v);
}

function finish(cand, o, crit, v) {
  const travel = o.travel;
  return {
    ...cand,
    criteria: crit,
    speed: v,
    pit: RULES.pit(v),
    overrun: RULES.overrun(v),
    travel: r2(travel),
    // the time a passenger spends inside, terminal to top, non-stop — the
    // number a firefighting lift is actually judged on
    topRun: r2(flightTime(travel, v).t),
    shaft: { w: cand.car.shaft[0], d: cand.car.shaft[1] },
    carBox: { w: cand.car.car[0], d: cand.car.car[1] },
  };
}

/* ═════════════════════════════ the population ══════════════════════════════ */

// At CONCEPT stage there is no room schedule yet — the core has to be set out
// before the plan is cut — so the population comes off an area take: gross to
// net, then net over a density. At STAGE 4 the schedule exists and the same
// building is counted room by room. Both are here, and they are meant to
// DISAGREE: the gap between them is the thing a verification is for.
export function populationFromArea(gia, typology) {
  const netToGross = 0.8;
  const d = typology === 'housing' ? 30           // m² of dwelling per person
    : typology === 'office' ? 10
    : typology === 'lab' ? 15
    : typology === 'civic' ? 12
    : typology === 'carpark' ? 40 : 12;
  return (gia * netToGross) / d;
}

export function populationFromSchedule(levels, from = 1) {
  let pop = 0;
  for (const L of levels) {
    if (L.index < from) continue;                 // the terminal floor walks in
    for (const r of L.rooms || []) {
      const a = (r.w || 0) * (r.d || 0);
      if (!(a > 0)) continue;
      const dw = DWELLING.find(([re]) => re.test(r.program || ''));
      pop += dw ? dw[1] : a / densityFor(r.program);
    }
  }
  return pop;
}

/* ═══════════════════════════════ the checks ════════════════════════════════
   Same shape as the structural ones: every check says what it is protecting
   rather than quoting a number at you, and one of them is named as governing. */

export function check(g, o) {
  const c = [];
  const add = (id, label, pass, value, note) => c.push({ id, label, pass, value, note });
  const crit = g.criteria;

  add('access', 'An accessible route to every storey',
    g.carsTotal >= 1 && g.car.kg >= 630,
    `${g.carsTotal} × ${g.car.kg} kg`,
    'a storey nobody in a wheelchair can reach is a storey they are excluded from — and that bites at ONE storey above the entrance, not at four');

  if (crit.pop > 0) {
    add('hc', 'Handling capacity', g.pctPop >= crit.pop - 1e-9,
      `${g.pctPop.toFixed(1)} % of population in 5 min`,
      `against ${crit.pop} % — ${crit.note}`);
    add('interval', 'Waiting interval', g.interval <= crit.interval + 1e-9,
      `${g.interval.toFixed(1)} s`,
      `against ${crit.interval} s. This is the number anybody in the lobby is actually measuring, whatever the capacity says`);
  }

  add('load', 'Car loading', g.P <= g.car.persons + 1e-9,
    `${g.P} of ${g.car.persons} rated`,
    `sized at ${Math.round(RULES.loadFactor * 100)} % of the rated load, because nobody fills a car and assuming they do is the classic way to under-provide`);

  if (o.topOccupiedM > RULES.firefightingAboveM) {
    add('ff', 'Firefighting lift', g.topRun <= RULES.firefightingReachS,
      `${g.topRun.toFixed(1)} s to the top floor`,
      `the top storey is ${o.topOccupiedM.toFixed(1)} m up, so one of the group is a firefighting lift in a protected shaft — and it has to reach the top floor inside ${RULES.firefightingReachS} s`);
  }

  if (g.zones > 1) {
    add('zones', 'Zoning', true, `${g.zones} zones × ${g.cars} cars`,
      'no single group holds the interval at any car size, because H and S have both saturated at N — so the building is cut into zones, which is what tall buildings do and why');
  }

  const governing = c.find((q) => !q.pass) || null;
  return { checks: c, pass: c.every((q) => q.pass), governing };
}

/* ═══════════════════════════ the whole answer ══════════════════════════════ */

// One call, from a building's massing to a lift group with its verdict. Called
// TWICE in the pipeline and told so: once before the cores are set out, off an
// area take, and once after the plan exists, off the room schedule.
export function liftsFor(o) {
  const {
    typology, levels: n, floorH: df, height, gia, parti = [],
    stops = null, population = null, topOccupiedM = null,
  } = o;

  const floorsAbove = Math.max(0, n - 1);
  const needed = floorsAbove >= RULES.accessibleAboveStoreys;
  if (!needed) {
    return {
      version: VERSION, needed: false, carsTotal: 0, zones: 0, cars: 0,
      reason: 'one storey — there is nothing above the entrance to reach',
      checks: [], pass: true, governing: null,
    };
  }

  const travel = height;
  // the count of people, then the count of people who are actually in
  const design = population != null ? population : populationFromArea(gia, typology);
  const pop = design * RULES.diversity;
  const g = sizeGroup({
    typology, floorsAbove, population: pop, df, travel,
    stops: stops == null ? floorsAbove : stops,
  });
  const top = topOccupiedM != null ? topOccupiedM : height;
  const v = check(g, { topOccupiedM: top });

  // WHAT THE PARTI DOES TO THE LIFTS. These are not decoration: the first of
  // them is the reason a famous section exists, and the arithmetic says so.
  const notes = [];
  if (parti.includes('skip-stop')) {
    const all = roundTrip({ floors: floorsAbove, passengers: g.P, df, v: g.speed });
    notes.push({
      meme: 'skip-stop',
      note: `the car stops only at the ${stops} decks rather than all ${floorsAbove} floors, which takes the round trip from ${all.rtt.toFixed(0)} s to ${g.trip.rtt.toFixed(0)} s — a ${Math.round(100 * (1 - g.trip.rtt / all.rtt))} % saving. The rue intérieure is usually explained as a social idea; it is also, exactly, a lift economy`,
      rttAllStops: all.rtt, rttDecks: g.trip.rtt,
    });
  }
  if (parti.includes('undercroft')) {
    notes.push({ meme: 'undercroft', note: 'the ground is given away, so the shaft lands in the open and is looked at from every side — it is structure and object at once, and it cannot hide in a plan that has nothing in it' });
  }
  if (parti.includes('atrium')) {
    notes.push({ meme: 'atrium', note: 'one car is scenic and runs in the void rather than in the core — a glass box climbing the room it serves, which is the only place a lift is ever the view rather than the wait' });
  }
  if (parti.includes('piano-nobile')) {
    notes.push({ meme: 'piano-nobile', note: 'the lift is deliberately NOT the ceremonial route. The stair is the arrival; the lift exists so that not arriving ceremonially is also possible' });
  }

  return {
    version: VERSION, needed: true, population: r2(pop), designPopulation: r2(design),
    ...g, ...v, parti: notes,
    traffic: floorsAbove >= RULES.trafficAboveStoreys,
    firefighting: top > RULES.firefightingAboveM,
    scenic: parti.includes('atrium'),
    floorsAbove, stops: stops == null ? floorsAbove : stops,
  };
}

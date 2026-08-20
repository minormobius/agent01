// tjs/brut/lift.selftest.mjs — node selftest for the lift traffic kernel.
// Run: node tjs/brut/lift.selftest.mjs
//
// A lift group is sized by a probability calculation, and the failure mode of a
// probability calculation is that it produces a plausible number for the wrong
// reason. So almost nothing here is checked against "does that look about
// right" — the two probability formulas are checked against CLOSED FORM and
// against their own limits, the motion profile against the kinematics it claims
// to integrate, and the round trip against the two identities that make it
// meaningful (double the cars, halve the interval; double the cars, double the
// capacity). Then the ladder is checked for the thing a ladder gets wrong:
// choosing something that does not actually pass.

import {
  RULES, CARS, CRITERIA, DENSITY, densityFor,
  probableStops, highestReversal, flightTime, speedFor,
  roundTrip, service, sizeGroup, liftsFor,
  populationFromArea, populationFromSchedule, check,
} from './lift.js';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error('  ✗ ' + m); } };
const near = (a, b, tol, m) => ok(Math.abs(a - b) <= tol, `${m} (got ${a}, want ${b} ±${tol})`);

/* 1. PROBABLE STOPS — S = N(1 − ((N−1)/N)^P), against hand-computed values and
      against the limits that say the formula means what it claims. */
{
  near(probableStops(10, 10), 6.5132156, 1e-6, 'S(10,10) matches the closed form');
  near(probableStops(16, 13), 16 * (1 - Math.pow(15 / 16, 13)), 1e-12, 'S(16,13) matches the closed form');
  near(probableStops(16, 13), 9.085726, 1e-6, 'and that is the number it should be');
  near(probableStops(1, 8), 1, 1e-12, 'one floor served is always exactly one stop');
  near(probableStops(20, 1), 1, 1e-12, 'one passenger is always exactly one stop');
  ok(probableStops(10, 0) === 0, 'nobody in the car is no stops');

  // monotone in P, and saturating at N — this is the property that makes tall
  // buildings need zoning, so it is worth asserting rather than assuming
  let prev = 0, mono = true;
  for (let P = 1; P <= 60; P++) { const s = probableStops(12, P); if (s < prev - 1e-12) mono = false; prev = s; }
  ok(mono, 'S rises with every extra passenger');
  ok(prev < 12 && prev > 11.9, `S saturates at N as the car fills (${prev.toFixed(4)} of 12)`);
  ok(CARS.every((c) => probableStops(8, c.persons) <= 8 + 1e-9), 'S never exceeds the floors served');
}

/* 2. HIGHEST REVERSAL — E[H] = N − Σ(i/N)^P. The sum is short enough to write
      out, which is exactly why it is worth writing out. */
{
  // N=10, P=10: Σ_{i=1}^{9} (i/10)^10, computed term by term
  const terms = [0.9, 0.8, 0.7, 0.6, 0.5, 0.4, 0.3, 0.2, 0.1].map((x) => Math.pow(x, 10));
  const want = 10 - terms.reduce((a, b) => a + b, 0);
  near(highestReversal(10, 10), want, 1e-12, 'H(10,10) matches the sum term by term');
  near(want, 9.5085658075, 1e-9, 'and that sum is the number it should be');

  near(highestReversal(10, 1), 5.5, 1e-9, 'one passenger reverses at the mean floor');
  near(highestReversal(1, 20), 1, 1e-12, 'one floor served is always reversed at');

  let mono = true, prev = 0;
  for (let P = 1; P <= 40; P++) { const h = highestReversal(15, P); if (h < prev - 1e-12) mono = false; prev = h; }
  ok(mono, 'H rises with every extra passenger');
  ok(prev < 15 && prev > 14.9, `H saturates at N too (${prev.toFixed(4)} of 15)`);
  ok(highestReversal(12, 9) >= probableStops(12, 9), 'the car always reverses at or above the number of stops it makes');
}

/* 3. THE MOTION PROFILE — checked against the kinematics rather than against a
      catalogue. A jerk-limited ramp 0→v covers exactly v·t/2, so the whole
      profile has a closed form and either the code integrates to it or it does
      not. */
{
  const j = RULES.jerk, a = RULES.accel;
  // long travel: reaches rated speed, so t = d/v + v/a + a/j
  {
    const v = 2.0, d = 60;
    const want = d / v + v / a + a / j;
    const got = flightTime(d, v);
    near(got.t, want, 1e-9, 'a long run is d/v + v/a + a/j exactly');
    ok(got.reached, 'and it reaches rated speed');
  }
  // short travel: never reaches rated speed, so re-integrate the peak it did
  // reach and check the distance comes back
  {
    const v = 4.0, d = 3.4;
    const g = flightTime(d, v);
    ok(!g.reached, 'a single floor at 4 m/s never reaches rated speed');
    const tRamp = g.vPeak >= a * a / j ? g.vPeak / a + a / j : 2 * Math.sqrt(g.vPeak / j);
    near(g.vPeak * tRamp, d, 1e-6, 'the peak it does reach integrates back to the distance');
    near(g.t, 2 * tRamp, 1e-9, 'and the time is two ramps with no cruise between them');
  }
  // the whole point: a fast lift in a low building buys almost nothing
  {
    const slow = flightTime(3.4, 1.6).t, fast = flightTime(3.4, 6.0).t;
    ok(fast > slow * 0.75, `quadrupling the rated speed over one floor saves under a quarter of the time (${slow.toFixed(2)} → ${fast.toFixed(2)} s)`);
  }
  ok(flightTime(0, 2).t === 0, 'no distance is no time');
  let mono = true, prev = 0;
  for (let d = 1; d <= 120; d += 1) { const t = flightTime(d, 2.5).t; if (t < prev) mono = false; prev = t; }
  ok(mono, 'flight time rises with distance, everywhere');
  ok(speedFor(10) < speedFor(50) && speedFor(50) < speedFor(120), 'the speed ladder rises with the travel');
}

/* 4. THE ROUND TRIP and the two identities that make it worth computing. */
{
  const base = { floors: 12, passengers: 10, df: 3.4, v: 2.0 };
  const t = roundTrip(base);
  ok(t.rtt > 0 && Number.isFinite(t.rtt), 'a round trip is a finite number of seconds');
  ok(t.ts > 0, 'a stop costs more than the flight it interrupts');

  // more floors, or more people, is always a longer trip
  ok(roundTrip({ ...base, floors: 20 }).rtt > t.rtt, 'more floors served is a longer round trip');
  ok(roundTrip({ ...base, passengers: 16 }).rtt > t.rtt, 'more passengers is a longer round trip');
  ok(roundTrip({ ...base, v: 4.0 }).rtt < t.rtt, 'a faster lift is a shorter round trip');
  ok(roundTrip({ ...base, express: 40 }).rtt > t.rtt, 'an express run to a zone base costs time');

  // THE TWO IDENTITIES. Interval is RTT/L and capacity is 300·P·L/RTT, so
  // doubling the cars must exactly halve the one and exactly double the other.
  // If either of these drifts, the ladder is optimising the wrong thing.
  const s1 = service(t.rtt, 2, 10, 400), s2 = service(t.rtt, 4, 10, 400);
  near(s2.interval, s1.interval / 2, 1e-9, 'twice the cars is exactly half the wait');
  near(s2.hc5, s1.hc5 * 2, 1e-9, 'twice the cars is exactly twice the capacity');
  near(s1.pctPop, (100 * s1.hc5) / 400, 1e-9, 'and %POP is the capacity over the population');
}

/* 5. THE LADDER — the thing a selection ladder gets wrong is returning
      something that does not pass, or spending shafts it did not need. */
{
  const cases = [
    { typology: 'office', floorsAbove: 11, population: 600, df: 3.7, travel: 44 },
    { typology: 'office', floorsAbove: 20, population: 1800, df: 3.9, travel: 82 },
    { typology: 'housing', floorsAbove: 13, population: 320, df: 3.0, travel: 42 },
    { typology: 'civic', floorsAbove: 7, population: 400, df: 4.6, travel: 37 },
    { typology: 'lab', floorsAbove: 8, population: 300, df: 4.4, travel: 40 },
    { typology: 'carpark', floorsAbove: 5, population: 90, df: 3.0, travel: 16 },
  ];
  for (const c of cases) {
    const g = sizeGroup(c);
    const crit = CRITERIA[c.typology];
    ok(g.pass, `${c.typology} ${c.floorsAbove}+${c.population}p: a group that meets the criteria exists`);
    if (g.pass) {
      ok(g.pctPop >= crit.pop - 1e-9, `${c.typology}: and it really meets the capacity (${g.pctPop.toFixed(1)} ≥ ${crit.pop})`);
      ok(g.interval <= crit.interval + 1e-9, `${c.typology}: and the interval (${g.interval.toFixed(1)} ≤ ${crit.interval})`);

      // FEWEST SHAFTS FIRST. Every shaft is a hole through every floor for the
      // life of the building, so one car fewer must genuinely not work.
      if (g.cars > 1 && g.zones === 1) {
        const biggest = CARS[CARS.length - 1];
        const P = Math.max(1, Math.round(biggest.persons * RULES.loadFactor));
        const trip = roundTrip({ floors: c.floorsAbove, passengers: P, df: c.df, v: g.speed });
        const s = service(trip.rtt, g.cars - 1, P, c.population);
        ok(!(s.pctPop >= crit.pop && s.interval <= crit.interval),
          `${c.typology}: one car fewer does not work even in the largest car`);
      }
    }
  }

  // a bigger building never gets a smaller group
  const small = sizeGroup({ typology: 'office', floorsAbove: 6, population: 250, df: 3.7, travel: 25 });
  const big = sizeGroup({ typology: 'office', floorsAbove: 24, population: 2400, df: 3.7, travel: 92 });
  ok(big.carsTotal >= small.carsTotal, 'more building is never fewer lifts');

  // ZONING. Past the point where one group saturates, the answer has to be
  // zones rather than an eighth car in one group.
  const huge = sizeGroup({ typology: 'office', floorsAbove: 60, population: 7000, df: 3.8, travel: 232 });
  ok(huge.zones > 1 || !huge.pass, 'a sixty-storey office is zoned, or honestly reported as unservable');
  ok(huge.carsTotal === huge.cars * huge.zones, 'the total shaft count is cars × zones');
}

/* 6. POPULATION — the two counts are meant to DISAGREE, and both have to be in
      the right order of magnitude or the sizing is theatre. */
{
  const pa = populationFromArea(20000, 'office');
  ok(pa > 1000 && pa < 2200, `20 000 m² of office holds roughly 1 600 people (${pa.toFixed(0)})`);
  ok(populationFromArea(20000, 'housing') < pa, 'the same area of housing holds fewer people than of office');

  ok(densityFor('open office') === DENSITY['open office'], 'a known programme reads its own density');
  ok(densityFor('2-bed flat') === DENSITY.DEFAULT, 'and an unknown one falls back rather than throwing');

  const levels = [
    { index: 0, rooms: [{ w: 10, d: 10, program: 'entrance hall' }] },
    { index: 1, rooms: [{ w: 20, d: 20, program: 'open office' }] },
    { index: 2, rooms: [{ w: 6, d: 5, program: '2-bed flat' }, { w: 6, d: 5, program: '2-bed flat' }] },
  ];
  const ps = populationFromSchedule(levels, 1);
  near(ps, 400 / 8 + 3 + 3, 1e-9, 'the schedule count is area over density, and dwellings by the home');
  ok(populationFromSchedule(levels, 0) > ps, 'counting the terminal floor in gives a larger number');
}

/* 7. THE VERDICT — every check reports, and the governing one is a failing one. */
{
  const g = sizeGroup({ typology: 'office', floorsAbove: 11, population: 600, df: 3.7, travel: 44 });
  const v = check(g, { topOccupiedM: 44 });
  ok(v.checks.length >= 4, `every criterion is reported (${v.checks.length} checks)`);
  ok(v.checks.every((c) => c.note && c.note.length > 20), 'and each says what it is protecting, not just a number');
  ok(v.checks.some((c) => c.id === 'access'), 'the accessibility check is always present, at any height');
  ok(v.checks.some((c) => c.id === 'ff'), 'a 44 m building is asked for a firefighting lift');
  ok(!v.governing || v.governing.pass === false, 'the governing check is a failing one, or there is none');

  const low = check(sizeGroup({ typology: 'housing', floorsAbove: 3, population: 60, df: 3.0, travel: 10 }),
    { topOccupiedM: 10 });
  ok(!low.checks.some((c) => c.id === 'ff'), 'and a 10 m building is not');
}

/* 8. THE THRESHOLDS — the two of them are different rules with different
      reasons, and conflating them is the mistake this asserts against. */
{
  const one = liftsFor({ typology: 'office', levels: 1, floorH: 4, height: 4, gia: 900 });
  ok(!one.needed, 'a single-storey building needs no lift — there is nothing above the entrance');

  const two = liftsFor({ typology: 'housing', levels: 2, floorH: 3, height: 6, gia: 1200 });
  ok(two.needed && two.carsTotal >= 1, 'but TWO storeys does, on access grounds alone, long before traffic');
  ok(!two.traffic, 'and it is honest that this is not a traffic requirement');

  const six = liftsFor({ typology: 'office', levels: 8, floorH: 3.8, height: 30, gia: 9000 });
  ok(six.traffic, 'an eight-storey office is above the traffic threshold too');
  ok(six.checks.some((c) => c.id === 'ff'), 'and past 18 m it is asked for a firefighting lift');
}

/* 9. SKIP-STOP — the coupling that is the point. A section that stops the lift
      every third floor genuinely cuts the round trip, and the kernel has to
      report the saving rather than assert it. */
{
  const n = 14, df = 3.0;
  const all = liftsFor({ typology: 'housing', levels: n, floorH: df, height: n * df, gia: 11000, parti: [] });
  const skip = liftsFor({
    typology: 'housing', levels: n, floorH: df, height: n * df, gia: 11000,
    parti: ['skip-stop'], stops: Math.ceil((n - 1) / 3),
  });
  ok(skip.trip.rtt < all.trip.rtt, `stopping every third floor is a shorter round trip (${skip.trip.rtt} s vs ${all.trip.rtt} s)`);
  ok(skip.carsTotal <= all.carsTotal, 'and never costs more shafts');
  const note = (skip.parti || []).find((q) => q.meme === 'skip-stop');
  ok(note && note.rttDecks < note.rttAllStops, 'and the saving is reported as a number, not a claim');
  ok(skip.trip.S < all.trip.S && skip.trip.H < all.trip.H,
    'because both S and H fall — fewer floors to stop at AND a lower reversal');
}

/* 10. DETERMINISM — the whole surface rests on it, and a lift group that
      wobbles would put a different core in the same permalink. */
{
  const o = { typology: 'office', levels: 14, floorH: 3.8, height: 53, gia: 24000, parti: ['atrium'] };
  const a = JSON.stringify(liftsFor(o)), b = JSON.stringify(liftsFor(o));
  ok(a === b, 'the same building sizes the same group, byte for byte');
  ok(JSON.parse(a).scenic, 'an atrium gets its scenic car');
}

console.log(`\nbrut/lift: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

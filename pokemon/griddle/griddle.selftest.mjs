// griddle selftest — run before changing game.js:
//   node pokemon/griddle/griddle.selftest.mjs
//
// This is an experiment, not a checklist, and it is allowed to come back and
// say the design does not work.
//
// THE DESIGN CLAIM. The game rests on one assertion: that there is no correct
// bubble threshold, only a correct threshold FOR THE TEMPERATURE YOU ARE
// RUNNING. It rests on that because if a single fixed rule — "flip when the
// craters hit 0.6" — plays optimally at every temperature, then the burner is
// decorative, the player has one number to learn instead of two readings to
// hold together, and there is no game in it.
//
// That claim is checkable and it is the centrepiece here: for each griddle
// temperature, find the crater threshold that produces the best cake, and see
// whether the answer MOVES. If the optimum is flat across temperature, the
// design is wrong and this file should say so.
//
// The mechanism underneath is the ratio of two doubling constants — browning
// every 15 degC, bubbling every 25 degC — so the test also measures that ratio
// directly rather than trusting the constants to mean what they say.

import {
  GRIDDLE, COOKING, POUR, SPATULA, RAIL, PACE,
  brownRate, setRate, bubbleRate,
  createStation, tickStation, createCake, judge, flip, deliver, scrape,
  cakeRadiusMm, cakeThicknessMm,
} from './game.js';

let failures = 0;
const ok = (c, m) => { if (!c) { failures++; console.error('  ✗ ' + m); } };
const STEP = 1 / 120;

// ── the two cues really do diverge in temperature ───────────────────────────
{
  // Measured off the rate functions rather than read off the constants, because
  // the claim is about what the model does, not what I labelled it.
  const at = (T) => ({ b: brownRate(T), g: bubbleRate(T) });
  const lo = at(165), mid = at(190), hi = at(215);
  const brownRatio = hi.b / lo.b;
  const bubbleRatio = hi.g / lo.g;
  console.log(`  · over 165->215 degC: browning speeds up ${brownRatio.toFixed(1)}x, bubbling only ${bubbleRatio.toFixed(1)}x`);
  ok(brownRatio > bubbleRatio * 1.5,
    `browning is markedly steeper in temperature than bubbling (${brownRatio.toFixed(1)}x vs ${bubbleRatio.toFixed(1)}x) — if these tracked each other the top of the cake would be a reliable readout of the bottom and there would be nothing to learn`);

  // The consequence, stated as a quantity: how much browning has happened by
  // the time the same bubble cue appears, at each temperature.
  const brownAtSameBubbles = (T) => {
    // Time for a fixed amount of gas to have been released.
    const t = 0.5 / bubbleRate(T);
    return brownRate(T) * t;
  };
  const a = brownAtSameBubbles(165), b = brownAtSameBubbles(215);
  console.log(`  · by the time the same bubbling has happened: browning ${a.toFixed(2)} at 165 degC, ${b.toFixed(2)} at 215 degC`);
  ok(b > a * 1.4,
    'the same top-of-cake reading means a much darker underside on a hot griddle');
}

// ── driving the spatula ────────────────────────────────────────────────────
// A FLIP FIRES ON THE RELEASE OF P, not on the press — that is the whole
// tap-versus-hold mechanic. The first version of this file never released P,
// so every intended flip ran past carrySecs and delivered a one-sided cake to
// the counter instead, and the sweep reported that no threshold ever worked.
// The bug was in the test rig, not the game. So: one small driver, used by
// every experiment below, that expresses an intent correctly.
function makeHands() {
  let lift = 0;
  return (st, want) => {
    const held = [false, false, false, false];
    if (!want) { lift = 0; return held; }
    if (!st.loaded) { held[2] = true; lift = 0; return held; }
    lift++;
    // 'serve' keeps holding, past carrySecs, and the cake goes to the counter.
    // 'flip' holds for exactly one tick and then lets go, which drops it back.
    held[3] = want === 'serve' ? true : lift <= 1;
    return held;
  };
}

// ── a rig that holds one temperature, so the sweep varies one thing ────────
// The thermostat clamps the griddle rather than driving the burner, because
// this experiment is about temperature, not about the player's ability to hold
// one. The full-game sweep further down does drive the burner for real.
function cookOne({ T, threshold, ml = POUR.targetMl, side2 = 0.62, maxSecs = 40 }) {
  const st = createStation({ griddleC: T });
  const hands = makeHands();
  const hold = () => { st.griddleC = T; };

  // Pour. Pouring is on wall time, so this is a real second or so of squeezing.
  for (let t = 0; t < ml / POUR.mlPerSec; t += STEP) {
    hold();
    tickStation(st, STEP, [true, false, false, false]);
  }
  tickStation(st, STEP, [false, false, false, false]);
  if (!st.cake) return { q: 0, why: 'no cake', side1: 0 };

  // Side one. THE CUE IS THE FALLING EDGE, not the rising one. Crater density
  // climbs, peaks and then dies back as the top skins over, so it crosses any
  // given level twice and a rising-edge threshold fires while the cake is still
  // raw. What a cook actually waits for is the bubbling to STOP REFILLING.
  //
  // Measured as a FRACTION OF THE PEAK, not as an absolute level, and that
  // distinction turned out to matter more than it looks. The peak itself moves
  // with temperature (0.54 at 165 degC, 0.75 at 185, back to 0.54 at 205), so
  // an absolute threshold set above the peak degenerates into "flip the instant
  // the bubbling turns over" and stops depending on its own parameter at all —
  // which is exactly what happened, and made every temperature-aware policy
  // byte-identical to the fixed one. A fraction of peak is also what a cook
  // actually perceives: the bubbling has died back to about half what it was.
  let side1 = 0, flipped = false, peak = 0, peaked = false;
  for (; side1 < maxSecs; side1 += STEP) {
    hold();
    const c = st.cue.craters;
    if (c > peak) peak = c;
    if (peak > 0.15 && c < peak * 0.92) peaked = true;
    const want = (peaked && c <= threshold * peak) ? 'flip' : null;
    tickStation(st, STEP, hands(st, want));
    if (!st.cake) break;
    if (st.cake.flips > 0) { flipped = true; break; }
  }
  if (!flipped || !st.cake) return { q: 0, why: flipped ? 'lost it' : 'never flipped', side1 };

  // Side two by the rule of thumb: a fraction of however long side one took.
  for (let t = 0; t < side1 * side2; t += STEP) {
    hold();
    tickStation(st, STEP, [false, false, false, false]);
  }
  // Slide under and carry it to the counter.
  for (let g = 0; g < 5 / STEP && st.cake; g++) {
    hold();
    tickStation(st, STEP, hands(st, 'serve'));
  }
  const v = st.lastVerdict || { q: 0, why: 'stuck' };
  return { q: v.q, why: v.why, side1, down: v.down, up: v.up, set: v.set };
}

// ── THE EXPERIMENT: does the best threshold move with temperature? ─────────
{
  const TEMPS = [165, 175, 185, 195];
  const THRESHOLDS = [0.05, 0.20, 0.40, 0.60, 0.80, 0.95];
  const rows = [];
  for (const T of TEMPS) {
    const scores = THRESHOLDS.map((th) => ({ th, ...cookOne({ T, threshold: th }) }));
    const best = scores.reduce((a, b) => (b.q > a.q ? b : a));
    rows.push({ T, best, scores });
  }

  console.log('  · best crater threshold at each griddle temperature:');
  for (const { T, best, scores } of rows) {
    const line = scores.map((s) => (s.q > 0 ? s.q.toFixed(2) : ' -- ')).join(' ');
    console.log(`      ${T} degC   ${line}   best ${best.th.toFixed(2)} (q ${best.q.toFixed(2)}, ${best.why})`);
  }
  console.log(`      thresholds:  ${THRESHOLDS.map((t) => t.toFixed(2)).join(' ')}`);

  const bestThs = rows.map((r) => r.best.th);
  const spread = Math.max(...bestThs) - Math.min(...bestThs);
  // A cool griddle should want the bubbling to die back almost completely
  // before you commit, because the underside is lagging. A hot one cannot
  // afford to wait that long.
  const cool = rows[0].best.th, hot = rows[rows.length - 1].best.th;
  console.log(`  · the optimum moves from ${cool.toFixed(2)} at ${TEMPS[0]} degC to ${hot.toFixed(2)} at ${TEMPS[TEMPS.length - 1]} degC — a spread of ${spread.toFixed(2)}`);
  ok(spread >= 0.10,
    `the best threshold MOVES with temperature (spread ${spread.toFixed(2)}) — if it did not, one fixed rule would play the game optimally and the burner would be decoration`);
  ok(cool < hot,
    `and it moves the right way: a cool griddle has to wait until the bubbling has almost stopped (${cool.toFixed(2)}) while a hot one must commit while it is still going (${hot.toFixed(2)}), because on the hot griddle the underside is running ahead of what the top is telling you`);

  // The cost of getting it wrong, which is what makes it a skill rather than a
  // detail: play the cool-griddle rule on a hot griddle.
  const hotT = TEMPS[TEMPS.length - 1];
  const right = cookOne({ T: hotT, threshold: hot });
  const wrong = cookOne({ T: hotT, threshold: cool });
  console.log(`  · on a ${hotT} degC griddle: the right rule gives q ${right.q.toFixed(2)} (${right.why}), the cool-griddle rule gives q ${wrong.q.toFixed(2)} (${wrong.why})`);
  ok(right.q > wrong.q + 0.08,
    `bringing the wrong rule to a hot griddle costs you the cake (${right.q.toFixed(2)} vs ${wrong.q.toFixed(2)})`);

  // And there is a temperature above which no rule saves you, which is the
  // other half of why the burner is a real control: run the iron too hot and
  // the underside is golden before the bubbles have even peaked, so the cue
  // you would flip on has not happened yet when it is already too late.
  const scorching = THRESHOLDS.map((th) => cookOne({ T: 215, threshold: th }).q);
  const bestScorching = Math.max(...scorching);
  console.log(`  · at 215 degC the best any threshold manages is q ${bestScorching.toFixed(2)} — the underside is golden before the bubbling peaks`);
  const bestHot = rows[rows.length - 1].best.q;
  ok(bestScorching < bestHot * 0.75,
    `a scorching griddle costs you most of the cake whatever you flip on (best ${bestScorching.toFixed(2)} against ${bestHot.toFixed(2)} at ${TEMPS[TEMPS.length - 1]} degC, a ${(100 * (1 - bestScorching / bestHot)).toFixed(0)}% drop) — the burner is not a difficulty slider, it is a thing you can get wrong`);
}

// ── the spatula punishes impatience, and only impatience ───────────────────
{
  const slideUnder = (setFrac, secs) => {
    const st = createStation({ griddleC: 190 });
    st.cake = createCake(POUR.targetMl);
    st.cake.set = setFrac;
    // Freeze the cake's own progress so this measures the spatula, not the
    // cooking that happens while you dither.
    for (let t = 0; t < secs; t += STEP) {
      st.cake.set = setFrac;
      tickStation(st, STEP, [false, false, true, false]);
      if (!st.cake) break;
    }
    return st;
  };
  const raw = slideUnder(0.05, SPATULA.slideSecs * 2);
  const set = slideUnder(0.95, SPATULA.slideSecs * 2);
  console.log(`  · working the spatula fully under: a raw cake takes ${raw.cake.torn.toFixed(2)} damage, a set one ${set.cake.torn.toFixed(2)}`);
  ok(raw.cake.torn >= 1, 'going at a raw cake with the spatula destroys it');
  ok(set.cake.torn === 0 && set.loaded, 'a set cake comes up clean and loads the spatula');
}

// ── one motion, two destinations ───────────────────────────────────────────
{
  const mk = () => {
    const st = createStation({ griddleC: 190 });
    st.cake = createCake(POUR.targetMl);
    st.cake.set = 1; st.cake.down = 0.5; st.cake.up = 0.5; st.cake.flips = 1;
    st.loaded = true;
    return st;
  };
  // Short hold: it comes back down, flipped.
  const tap = mk();
  for (let t = 0; t < SPATULA.carrySecs * 0.5; t += STEP) tickStation(tap, STEP, [false, false, false, true]);
  // Read the down face at the LAST instant before the release, since it is
  // browning the whole time it is lifted-but-not-yet-flipped.
  const before = tap.cake.down;
  tickStation(tap, STEP, [false, false, false, false]);
  console.log(`  · holding P for ${(SPATULA.carrySecs * 0.5).toFixed(2)}s: cake still on the griddle, flips ${tap.cake ? tap.cake.flips : '-'}`);
  ok(tap.cake !== null && tap.cake.flips === 2, 'a short hold flips the cake back onto the griddle');
  ok(tap.cake && Math.abs(tap.cake.up - before) < 1e-9, 'and the faces really swapped');

  // Long hold: it goes to the counter.
  const carry = mk();
  for (let t = 0; t < SPATULA.carrySecs * 1.4; t += STEP) tickStation(carry, STEP, [false, false, false, true]);
  console.log(`  · holding P for ${(SPATULA.carrySecs * 1.4).toFixed(2)}s: served ${carry.served}, on griddle ${carry.cake ? 'yes' : 'no'}`);
  ok(carry.cake === null && carry.served === 1,
    'holding through carrySecs delivers it to the counter instead — same motion, different destination');
}

// ── the iron is a resource, not a setting ──────────────────────────────────
{
  const st = createStation({ griddleC: 200 });
  const before = st.griddleC;
  for (let t = 0; t < 1.0; t += STEP) tickStation(st, STEP, [true, false, false, false]);
  const afterPour = st.griddleC;
  for (let t = 0; t < 4.0; t += STEP) tickStation(st, STEP, [false, false, false, false]);
  const drifted = st.griddleC;
  console.log(`  · griddle at ${before.toFixed(0)} degC, ${afterPour.toFixed(0)} after a cake lands, ${drifted.toFixed(0)} four seconds later with the burner off`);
  ok(afterPour < before, 'a cold cake pulls the iron down');
  ok(drifted < afterPour, 'and it keeps falling with the burner off — the temperature is something you ride');

  const up = createStation({ griddleC: 150 });
  for (let t = 0; t < 4.0; t += STEP) tickStation(up, STEP, [false, true, false, false]);
  console.log(`  · four seconds on full burner from 150 degC: ${up.griddleC.toFixed(0)} degC`);
  ok(up.griddleC > 175, 'and the burner can actually bring it back');
}

// ── mashing the pour key is a mistake, as designed ─────────────────────────
{
  const st = createStation({ griddleC: 190 });
  for (let t = 0; t < 1.0; t += STEP) tickStation(st, STEP, [true, false, false, false]);
  for (let t = 0; t < 3.0; t += STEP) tickStation(st, STEP, [false, false, false, false]);
  const clean = st.cake.torn;
  for (let t = 0; t < 0.3; t += STEP) tickStation(st, STEP, [true, false, false, false]);
  console.log(`  · squeezing onto a cake already on the iron: damage ${clean.toFixed(2)} -> ${st.cake.torn.toFixed(2)}`);
  ok(clean === 0 && st.cake.torn >= 1, 'batter poured onto a cooking pancake ruins it');
}

// ── THE SECOND EXPERIMENT: does reading the cake beat cooking by clock? ────
{
  // Full game now — the burner is driven for real, cakes land cold and drag the
  // iron down, and the rail fills up. Three families, swept:
  //
  //   stopwatch   flips at a fixed age, ignoring the cake entirely
  //   bubbles     flips at a fixed point on the falling edge, ignoring the iron
  //   aware       shifts that point with the griddle temperature
  //
  // If the stopwatch wins, the cues carry no information and the hidden face is
  // decoration. If bubbles and aware tie, the temperature reading is worth
  // nothing and the burner is decoration. Both are live possibilities and this
  // block is allowed to report either.
  //
  // ACROSS THREE SERVICES AT DIFFERENT GRIDDLE TEMPERATURES, and that is the
  // whole point of the comparison. An earlier version ran every policy at one
  // setpoint and reported that the stopwatch WON — which was correct, and worth
  // keeping in mind: at a genuinely constant temperature a timer is a perfect
  // proxy for the cake, and commercial plates really are cooked that way. The
  // cue is not for a griddle that jitters, it is for a griddle at the wrong
  // temperature.
  //
  // So each family picks ONE parameter and has to live with it across a cool,
  // a correct and a hot service — which is the situation a cook is actually in,
  // since you do not get to retune your stopwatch for every griddle. That is a
  // fair fight: nobody is handicapped, everybody is asked the same question.
  const SETPOINTS = [172, 188, 202];

  function play(policy, { secs = 150, seed = 3, setpoint = 188 } = {}) {
    const st = createStation({ seed, griddleC: setpoint - 10 });
    const hands = makeHands();
    let peak = 0, peaked = false, flipAt = null;
    for (let t = 0; t < secs && !st.over; t += STEP) {
      const held = [false, false, false, false];
      held[1] = st.griddleC < setpoint;
      let want = null;
      if (!st.cake) {
        held[0] = st.pouring < POUR.targetMl;
        peak = 0; peaked = false; flipAt = null;
      } else {
        const c = st.cake;
        if (c.torn >= 1) { scrape(st); continue; }
        const cr = st.cue.craters;
        if (cr > peak) peak = cr;
        if (peak > 0.15 && cr < peak * 0.92) peaked = true;
        if (c.flips === 0) {
          if (policy.flip({ st, c, cr, peak, peaked, age: c.age / PACE })) want = 'flip';
        } else {
          if (flipAt === null) flipAt = t;
          if (policy.serve({ st, c, since: t - flipAt })) want = 'serve';
        }
      }
      const h = hands(st, want);
      held[2] = h[2]; held[3] = h[3];
      tickStation(st, STEP, held);
    }
    return st;
  }

  // Side two is the same rule in every family, so the only thing under test is
  // the side-one decision — the one made against a face you cannot see.
  //
  // WATCH `down`, NOT `up`. A flip swaps the faces, so after it `up` is the
  // finished first side and is frozen forever while `down` is the one now
  // against the iron. An earlier version of this rule waited on `up`, which
  // either fired instantly (serving a cake with a raw second side) or never
  // fired at all (leaving it there until it burned) depending on how side one
  // had gone. It quietly wrecked every number in this block for several
  // iterations, and none of the isolated experiments above could see it,
  // because they cook side two by a timer rather than by a rule.
  const serveRule = ({ c }) => c.set >= 0.99 && c.down >= 0.46;

  const stopwatch = (secs) => ({
    name: `stopwatch ${secs.toFixed(1)}s`,
    flip: ({ age }) => age > secs,
    serve: ({ since }) => since > secs * 0.62,
  });
  const bubbles = (f) => ({
    name: `bubbles ${f.toFixed(2)}`,
    flip: ({ cr, peak, peaked }) => peaked && cr <= f * peak,
    serve: serveRule,
  });
  // From the isolated sweep above, the best fraction-of-peak runs from roughly
  // 0.0 at 165 degC to 1.0 at 195 — about +0.033 per degC.
  const aware = (base, slope) => ({
    name: `aware ${base.toFixed(2)}+${slope.toFixed(3)}`,
    flip: ({ st, cr, peak, peaked }) =>
      peaked && cr <= Math.max(0.02, Math.min(1, base + slope * (st.griddleC - 188))) * peak,
    serve: serveRule,
  });

  const SEEDS = [3, 11];
  const trial = (p) => {
    const runs = [];
    for (const setpoint of SETPOINTS) for (const seed of SEEDS) runs.push({ setpoint, r: play(p, { seed, setpoint }) });
    const mean = (f) => runs.reduce((a, x) => a + f(x.r), 0) / runs.length;
    const per = SETPOINTS.map((sp) => {
      const rs = runs.filter((x) => x.setpoint === sp);
      return rs.reduce((a, x) => a + x.r.quality, 0) / rs.length;
    });
    return {
      name: p.name,
      quality: mean((r) => r.quality),
      per,
      served: mean((r) => r.served),
      rejected: mean((r) => r.rejected),
      lived: mean((r) => r.elapsed),
    };
  };

  const family = [
    ...[2.5, 3.5, 4.5, 6.0].map(stopwatch),
    ...[0.10, 0.35, 0.60, 0.85].map(bubbles),
    ...[0.45, 0.60].flatMap((b) => [0.025, 0.033].map((k) => aware(b, k))),
  ];
  const results = family.map(trial);
  console.log(`  · ${SEEDS.length} services of up to 150 s at each of ${SETPOINTS.join('/')} degC — one parameter per family, no retuning:`);
  for (const r of results) {
    console.log(`      ${r.name.padEnd(20)} mean ${r.quality.toFixed(2).padStart(6)}   [${r.per.map((q) => q.toFixed(1).padStart(5)).join(' ')}]   served ${r.served.toFixed(1).padStart(5)}   rejected ${r.rejected.toFixed(1).padStart(5)}`);
  }
  console.log(`      per-service columns are ${SETPOINTS.join(' / ')} degC`);
  const best = (pre) => results.filter((r) => r.name.startsWith(pre))
    .reduce((a, b) => (b.quality > a.quality ? b : a));
  const bStop = best('stopwatch'), bBub = best('bubbles'), bAware = best('aware');
  console.log(`    best of each family — stopwatch ${bStop.quality.toFixed(2)} (${bStop.name}), bubbles ${bBub.quality.toFixed(2)} (${bBub.name}), aware ${bAware.quality.toFixed(2)} (${bAware.name})`);

  ok(bBub.quality > bStop.quality * 1.10,
    `reading the cake beats cooking by the clock (${bBub.quality.toFixed(2)} vs ${bStop.quality.toFixed(2)}) — if the stopwatch won, the bubbles would be decoration and the hidden face would carry no information`);
  ok(bAware.quality > bBub.quality * 1.02,
    `and reading the iron as well beats reading the cake alone (${bAware.quality.toFixed(2)} vs ${bBub.quality.toFixed(2)}) — this is the assertion that earns the burner its key`);
  ok(bStop.quality > 0,
    `a stopwatch cook is bad, not helpless (${bStop.quality.toFixed(2)}) — the game has a floor to climb from rather than a wall`);
}

if (failures) {
  console.error(`\n✗ griddle selftest FAILED — ${failures} assertion(s)\n`);
  process.exit(1);
}
console.log('✓ griddle selftest passed — browning outruns bubbling on a hot griddle so the best flip cue moves with temperature, the spatula punishes impatience only, one lift motion reaches two destinations, and reading the cake beats cooking by the clock');

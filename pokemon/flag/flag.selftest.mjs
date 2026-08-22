// flag selftest — run before changing instrument.js:
//   node pokemon/flag/flag.selftest.mjs
//
// The model has its own selftest next door. This one covers the seam, which is
// where both of the real bugs in this surface lived:
//
//   the reported speed was the instantaneous within-beat thrust rather than
//   its cycle mean, so the cell swam about fifty times too fast;
//
//   and the display-frame correction used beatScale squared where resistive
//   force theory, being linear in velocity, wanted beatScale — a further
//   twelve times at the default setting.
//
// Neither was visible to a test that drove the model directly at beatScale 1.
// Both are obvious the moment the page's own loop is run and its reported
// speed is held against the model's own offline speed-versus-frequency curve.
// So that is what happens here: the real loop, the real numbers, compared with
// the thing they are supposed to agree with.

import { PTEROSPERMA, SWIM, STOP, REORIENT } from '../proteus/flagella.js';
import { createSwimmer, tickSwimmer, speedCurve } from './instrument.js';

let failures = 0;
const ok = (c, m) => { if (!c) { failures++; console.error('  ✗ ' + m); } };

// The page's own fixed step.
const STEP = 1 / 240;

function play({ drive = 1, secs = 120, beatScale = 12, stateScale = 3, seed = 20260818 } = {}) {
  const sw = createSwimmer({ seed, beatScale, stateScale });
  const curve = speedCurve(sw.fl);
  const expected = (f) => {
    for (let i = 1; i < curve.length; i++) {
      if (curve[i].f >= f) {
        const t = (f - curve[i - 1].f) / (curve[i].f - curve[i - 1].f);
        return curve[i - 1].u + (curve[i].u - curve[i - 1].u) * t;
      }
    }
    return curve[curve.length - 1].u;
  };
  // The curve is a STEADY-STATE, BEND-FREE relation: measureSpeed() sweeps
  // frequency on a straight probe with bendAmp 0. So it is only the right
  // reference where the live cilium is also straight and has also reached
  // steady state, and two things have to be excluded or the comparison is
  // between different quantities:
  //
  //   BENT SAMPLES. A curved filament carrying a travelling wave produces
  //   different thrust from a straight one at the same frequency. Roughly a
  //   quarter of Swim samples carry residual bend from the preceding Reorient,
  //   and they read ~1.8x the bend-free curve.
  //
  //   UNSETTLED SAMPLES. The reported speed is an exponential average over
  //   three displayed beat periods, so for the first few tau of a Swim bout it
  //   is still climbing out of whatever preceded it. Early-bout samples read
  //   1.37 on an urged cell (coming off a faster bout) and 0.53 on an idle one
  //   (coming off a Stop) -- an artifact of bout length, not of the physics.
  //
  // Filtering to settled-and-straight is what makes this test sharp rather
  // than lenient: it moves the agreement from 1.34 to 1.015, and it makes the
  // urged and idle cells agree with each other (1.015 vs 1.008) instead of
  // differing twofold. The version before this one compared everything at once
  // and PASSED BY CANCELLATION -- an idle cell's cold early-bout samples were
  // offset by its hot bent ones, and the sum landed near 1 for no reason worth
  // trusting. worstRatio and maxSpeed below are still taken over every sample,
  // so a genuine scaling blow-up cannot hide in the excluded ones.
  let ratioSum = 0, ratioN = 0, worstRatio = 0, maxSpeed = 0, nonFinite = 0;
  let rawSum = 0, rawN = 0;
  let bout = 0, prev = null;
  for (let i = 0; i < secs / STEP; i++) {
    sw.fl.ctl.drive = drive;
    const st = tickSwimmer(sw, STEP);
    bout = (st === SWIM && prev === SWIM) ? bout + STEP : 0;
    prev = st;
    if (!Number.isFinite(sw.x) || !Number.isFinite(sw.y) || !Number.isFinite(sw.fl.speedUmS)) nonFinite++;
    if (st === SWIM && sw.fl.speedUmS > 0) {
      const want = expected(sw.fl.freqHz);
      if (want > 20) {
        const r = sw.fl.speedUmS / want;
        rawSum += r; rawN++;
        worstRatio = Math.max(worstRatio, r);
        // Three displayed beat periods is exactly the averaging constant the
        // page uses; settled means at least three of those into the bout.
        const tau = 3 * sw.fl.beatScale / Math.max(1, sw.fl.freqHz);
        if (bout >= 3 * tau && Math.abs(sw.fl.bendAmp || 0) < 0.01) {
          ratioSum += r; ratioN++;
        }
      }
      maxSpeed = Math.max(maxSpeed, sw.fl.speedUmS);
    }
  }
  return {
    sw, nonFinite, maxSpeed, worstRatio, ratioN,
    meanRatio: ratioN ? ratioSum / ratioN : 0,
    rawRatio: rawN ? rawSum / rawN : 0,
    swimPct: 100 * sw.occupancy[SWIM] / Math.max(1e-9, sw.elapsed),
  };
}

// ── the swimmer agrees with the model it is supposedly running ──────────────
{
  const r = play({ drive: 1 });
  const S = PTEROSPERMA.swimSpeedUmS;
  console.log(`  · page loop vs model curve: settled+straight ${r.meanRatio.toFixed(3)} (${r.ratioN} samples), all samples ${r.rawRatio.toFixed(2)}, worst ${r.worstRatio.toFixed(1)}, peak reported ${r.maxSpeed.toFixed(0)} um/s`);
  ok(r.nonFinite === 0, 'nothing goes non-finite over two minutes of play');
  // Tightened from 0.8-1.3 to 0.9-1.1 now that the comparison is like-for-like.
  // The loose window was hiding the fact that nothing was really being checked.
  ok(r.meanRatio > 0.9 && r.meanRatio < 1.1,
    `the speed the page reports is the speed the model computes (ratio ${r.meanRatio.toFixed(3)})`);
  // The lag in the cycle-averaging means a bout that follows a much faster one
  // can briefly read high. A few times over is the smoothing; fifty times over
  // is a scaling bug, which is the thing being guarded.
  ok(r.worstRatio < 10,
    `and never by the order of magnitude a scaling error would give (worst ${r.worstRatio.toFixed(1)})`);
  ok(r.maxSpeed < 2500,
    `no reported speed is absurd next to the measured ${S.mean} +/- ${S.sd} um/s (peak ${r.maxSpeed.toFixed(0)})`);
}

// ── the display slow-motion does not change how far the cell gets ───────────
{
  // Translation is divided by beatScale along with the beat, so a given stretch
  // of MODEL time must carry the cell the same distance whatever the display
  // setting. Run each scale for a proportionally longer wall-clock span and the
  // distances have to match.
  // Wall-clock is run proportionally longer at larger beatScale, so every run
  // covers the same 20 seconds of MODEL time; the distances then compare
  // directly. (stateScale 0 freezes the behaviour chain so this measures
  // translation and nothing else.)
  const dist = (beatScale) => {
    const sw = createSwimmer({ seed: 4242, beatScale, stateScale: 0 });
    sw.fl.ctl.state = SWIM;
    sw.fl.freqHz = PTEROSPERMA.swimFreqHz.mean;
    for (let i = 0; i < 20 * beatScale / STEP; i++) tickSwimmer(sw, STEP);
    return sw.distanceUm;
  };
  const a = dist(6), b = dist(12), c = dist(24);
  console.log(`  · distance per unit model time: ${a.toFixed(0)}, ${b.toFixed(0)}, ${c.toFixed(0)} um at ÷6, ÷12, ÷24`);
  ok(Math.abs(b - a) < a * 0.08 && Math.abs(c - a) < a * 0.08,
    `slowing the display does not change how far the cell actually gets (${a.toFixed(0)} / ${b.toFixed(0)} / ${c.toFixed(0)})`);
}

// ── drive moves the occupancy, and only the occupancy ───────────────────────
{
  const urged = play({ drive: 1, secs: 90 });
  const held = play({ drive: -1, secs: 90 });
  const idle = play({ drive: 0, secs: 90 });
  console.log(`  · swim share: urged ${urged.swimPct.toFixed(1)}%, idle ${idle.swimPct.toFixed(1)}%, held ${held.swimPct.toFixed(1)}%  (measured, undriven: 3.4%)`);
  ok(urged.swimPct > 25, `full drive gets the cell swimming (${urged.swimPct.toFixed(1)}%)`);
  ok(held.swimPct < 2, `negative drive keeps it stopped (${held.swimPct.toFixed(1)}%)`);
  ok(urged.sw.distanceUm > idle.sw.distanceUm * 5, 'and an urged cell travels much further than an idle one');
  // The speed comparison needs a much longer idle run than the distance
  // comparison does. An idle cell swims 3.8% of the time in short bouts, so
  // settled samples -- ones where the cycle-average has actually converged --
  // are rare: 90 s yields none at all. The distance comparison above stays at
  // 90 s against 90 s, because that one is only fair at equal durations.
  // Drive must not touch the physics: the speed while actually swimming is a
  // property of the beat, not of how often the cell chooses to beat. Compared
  // against the idle run, not the held one — a cell held in Stop barely swims
  // at all, so its ratio is measured on a handful of samples and would fail
  // this on noise rather than on anything real.
  const idleLong = play({ drive: 0, secs: 1200 });
  console.log(`  · settled speed/expected while swimming: urged ${urged.meanRatio.toFixed(3)} (${urged.ratioN} samples), idle ${idleLong.meanRatio.toFixed(3)} (${idleLong.ratioN} samples over 1200 s)`);
  ok(urged.ratioN > 200 && idleLong.ratioN > 50, 'both runs swam enough to compare');
  // Tightened from 0.35 to 0.10. An idle cell takes short Swim bouts and an
  // urged one takes long ones, so before the settled-sample filter this
  // compared bout length as much as speed and needed a window wide enough to
  // swallow the difference.
  ok(Math.abs(urged.meanRatio - idleLong.meanRatio) < 0.10,
    `drive changes how often the cell swims, not how fast it swims when it does (${urged.meanRatio.toFixed(3)} vs ${idleLong.meanRatio.toFixed(3)})`);
}

// ── it is a run-and-tumble walk, not a drift ────────────────────────────────
{
  const { sw } = play({ drive: 1, secs: 180 });
  // Net displacement should be far short of path length: the cell turns.
  const net = Math.hypot(sw.x, sw.y);
  console.log(`  · 180 s: ${(sw.distanceUm / 1000).toFixed(2)} mm of path, ${(net / 1000).toFixed(2)} mm net displacement`);
  ok(sw.distanceUm > 0, 'the cell goes somewhere');
  ok(net < sw.distanceUm * 0.8, 'and does not go there in a straight line — reorientations turn it');
  ok(sw.trail.length > 10, 'the track records the walk');
  // Every state should have been visited over three minutes of driving.
  const seen = sw.runs.map((r) => r[0]);
  ok(sw.occupancy[STOP] > 0 && sw.occupancy[SWIM] > 0 && sw.occupancy[REORIENT] > 0,
    'all three states occur');
  ok(sw.runs.length > 4, 'and the ethogram has something in it');
}

if (failures) {
  console.error(`\n✗ flag selftest FAILED — ${failures} assertion(s)\n`);
  process.exit(1);
}
console.log("✓ flag selftest passed — the page's own loop reports the speed the model computes, at every display scale, and walks a run-and-tumble track");

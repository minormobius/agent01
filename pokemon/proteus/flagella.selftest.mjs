// flagella selftest — run before changing flagella.js:
//   node pokemon/proteus/flagella.selftest.mjs
//
// Three separate claims live in that file, and they fail in three different
// ways, so they are checked separately here.
//
//   THE BASIS ROUND-TRIPS. The Chebyshev decomposition is not a display
//   detail: the mode vector is the state the rest of the system reads, and the
//   rendered shape is rebuilt from it. If analysis and synthesis disagree by a
//   constant the cilium still looks like a cilium — it is just the wrong one,
//   silently, forever. So the round trip is checked exactly on polynomials and
//   against the paper's own 0.368 um reconstruction error on a real waveform.
//
//   THE CHAIN IS THE PAPER'S CHAIN. Four rates were transcribed from the
//   paper. They over-determine the model: the same four numbers also imply the
//   three dwell times and the three steady-state occupancies that the paper
//   reports separately. That redundancy is the test. A typo in one rate breaks
//   an occupancy that no one would otherwise look at.
//
//   THE THRUST IS THRUST. Resistive force theory only produces net propulsion
//   because drag is anisotropic and the wave travels. Both halves are checked
//   by breaking them: a frozen waveform must produce nothing, an isotropic
//   fluid must produce nothing, and reversing the wave must reverse the force.
//   Then the resulting swimming speed is compared with the measured
//   646 +/- 326 um/s, which is what pins the one free amplitude parameter.

import {
  PTEROSPERMA, WAVE_SPEED_UM_S, WAVELENGTHS_PER_CILIUM, wavenumber,
  chebyshevBasis, chebyshevAt, projectTangent, reconstructTangent,
  centrelineFromTangent,
  createController, stepController, steadyState, drawFrequency, exitRates,
  STOP, SWIM, REORIENT,
  dragCoefficients, rftForce, swimSpeed,
  createFlagellation, synthesize, thrust, advanceFlagellum,
} from './flagella.js';

const TWO_PI = Math.PI * 2;
const waveSpeedFrom = (k, f) => TWO_PI * f / k;

let failures = 0;
const ok = (c, m) => { if (!c) { failures++; console.error('  ✗ ' + m); } };
const near = (a, b, tol, m) =>
  ok(Math.abs(a - b) <= tol, `${m} (got ${a}, want ${b} +/- ${tol})`);

// ── the Chebyshev basis round-trips ──────────────────────────────────────────
{
  const N = 20, M = 64;
  const basis = chebyshevBasis(N, M);
  const T = chebyshevAt(N, basis.S);

  // A function that IS a low-order Chebyshev combination must come back exactly.
  const want = [0.3, -1.1, 0.0, 0.7, 0, 0, 0.25];
  const f = (s) => {
    let v = 0;
    for (let n = 0; n < want.length; n++) v += want[n] * Math.cos(n * Math.acos(s));
    return v;
  };
  const c = projectTangent(f, basis);
  let worst = 0;
  for (let n = 0; n < want.length; n++) worst = Math.max(worst, Math.abs(c[n] - want[n]));
  for (let n = want.length; n < N; n++) worst = Math.max(worst, Math.abs(c[n]));
  ok(worst < 1e-10, `exact recovery of a band-limited signal (worst mode error ${worst.toExponential(2)})`);

  const back = reconstructTangent(c, T, N, M);
  let recon = 0;
  for (let j = 0; j < M; j++) recon = Math.max(recon, Math.abs(back[j] - f(basis.S[j])));
  ok(recon < 1e-10, `synthesis inverts analysis (worst sample error ${recon.toExponential(2)})`);

  // Mode 0 is the arc-weighted mean orientation: a straight cilium at angle a
  // has c_0 = a and nothing else.
  const straight = projectTangent(() => 0.4, basis);
  near(straight[0], 0.4, 1e-12, 'mode 0 is the mean tangent angle');
  ok(Math.abs(straight[1]) < 1e-12, 'and a straight cilium has no curvature mode');
}

// ── 20 modes reconstruct a real beat to the paper's tolerance ────────────────
{
  // The paper reports 0.368 um mean reconstruction error with N = 20 on a
  // 67 um cilium. Reconstruct the same waveform this file synthesizes and
  // measure the centreline displacement error against a 200-mode reference.
  const L = PTEROSPERMA.ciliumLenUm;
  const M = 256, ds = L / M;
  const k = wavenumber(PTEROSPERMA.swimFreqHz.mean);
  const amp = Math.min(2.2, k * 7.5);
  const wave = (s) => {
    const sigma = (s + 1) * 0.5 * L;
    return amp * (sigma / L) * Math.sin(-k * sigma - 1.1);
  };
  const sUni = new Float64Array(M);
  for (let j = 0; j < M; j++) sUni[j] = 2 * ((j + 0.5) / M) - 1;

  const ref = centrelineFromTangent(
    Float64Array.from({ length: M }, (_, j) => wave(sUni[j])), ds, 0, 0);

  const errAt = (N) => {
    const c = projectTangent(wave, chebyshevBasis(N, 256));
    const th = reconstructTangent(c, chebyshevAt(N, sUni), N, M);
    const got = centrelineFromTangent(th, ds, 0, 0);
    let sum = 0;
    for (let j = 0; j < M; j++) {
      sum += Math.hypot(got[j * 2] - ref[j * 2], got[j * 2 + 1] - ref[j * 2 + 1]);
    }
    return sum / M;
  };

  const e20 = errAt(PTEROSPERMA.nModes);
  const e4 = errAt(4);
  const e2 = errAt(2);
  console.log(`  · centreline reconstruction error: ${e20.toFixed(4)} um at N=20, ${e4.toFixed(2)} um at N=4, ${e2.toFixed(1)} um at N=2 (paper: ${PTEROSPERMA.reconErrUm} um at N=20)`);
  ok(e20 < PTEROSPERMA.reconErrUm,
    `20 modes hold the waveform at least as tightly as the paper reports (${e20.toFixed(4)} um)`);
  // Without the contrast the assertion above would pass on a broken projection
  // that returned zeros for a nearly straight cilium. Truncation must hurt,
  // and hurt progressively, or the basis is not doing the work.
  ok(e4 > e20 * 20, `truncating to 4 modes is materially worse (${e4.toFixed(2)} um vs ${e20.toFixed(4)} um)`);
  ok(e2 > e4 * 2, `and 2 modes worse again (${e2.toFixed(1)} um)`);
  ok(e2 > 1.0, 'with the crudest truncation off by more than a micron, so the test can tell them apart');
}

// ── the dispersion relation is actually linear, and is what sets lambda ──────
{
  // f ~ k means the wave speed is frequency-independent. Check across the
  // paper's whole observed swimming band.
  const lo = wavenumber(PTEROSPERMA.swimFreqHz.min);
  const hi = wavenumber(PTEROSPERMA.swimFreqHz.max);
  near(waveSpeedFrom(lo, PTEROSPERMA.swimFreqHz.min), WAVE_SPEED_UM_S, 1e-6, 'wave speed at 12 Hz');
  near(waveSpeedFrom(hi, PTEROSPERMA.swimFreqHz.max), WAVE_SPEED_UM_S, 1e-6, 'wave speed at 304 Hz');
  ok(hi > lo, 'higher frequency means higher wavenumber');

  // At the mean swimming frequency the cilium carries WAVELENGTHS_PER_CILIUM
  // wavelengths, by construction of the wave speed.
  const lam = TWO_PI / wavenumber(PTEROSPERMA.swimFreqHz.mean);
  near(PTEROSPERMA.ciliumLenUm / lam, WAVELENGTHS_PER_CILIUM, 1e-9,
    'wavelengths along the cilium at the mean beat');
  ok(WAVELENGTHS_PER_CILIUM > 0.5 && WAVELENGTHS_PER_CILIUM < 2,
    'and that count is a shape a cilium could actually hold');

  // The quantized bands must lie inside the observed range, or they could
  // never be snapped onto.
  for (const b of PTEROSPERMA.bands) {
    ok(b >= PTEROSPERMA.swimFreqHz.min && b <= PTEROSPERMA.swimFreqHz.max,
      `dynein band ${b} Hz lies inside the observed 12-304 Hz range`);
  }
}

// ── the four rates reproduce every other number the paper reports ────────────
{
  const [pSt, pSw, pR] = steadyState();
  console.log(`  · steady state from the rate set: Stop ${pSt.toFixed(4)}  Swim ${pSw.toFixed(4)}  Reorient ${pR.toExponential(2)}`);
  near(pSt, PTEROSPERMA.steadyState.Stop, 0.002, 'P(Stop) matches the reported 0.966 +/- 0.002');
  near(pSw, PTEROSPERMA.steadyState.Swim, 0.001, 'P(Swim) matches the reported 0.033 +/- 0.001');
  near(pR, PTEROSPERMA.steadyState.Reorient, 0.00005, 'P(Reorient) matches the reported 0.00030 +/- 0.00005');

  const R = PTEROSPERMA.rates;
  near(1 / R.stopToSwim, 58, 2, 'mean Stop dwell matches 58 +/- 2 s');
  near(1 / (R.swimToStop + R.swimToReorient), 1.42, 0.03, 'mean Swim dwell matches 1.42 +/- 0.03 s');
  near(1 / R.reorientToSwim, 0.041, 0.002, 'mean Reorient dwell matches 41 +/- 2 ms');
  near(R.swimToStop / (R.swimToStop + R.swimToReorient), 0.70, 0.04,
    'branching out of Swim matches rho(Sw->St) = 0.70 +/- 0.04');
}

// ── simulating the chain recovers the same occupancy, and the topology holds ─
{
  const ctl = createController({ seed: 4242, rateScale: 1 });
  const DT = 1 / 30;                       // the prototype's real step
  const STEPS = 30 * 60 * 60 * 12;         // twelve model hours
  let observedIllegal = 0;
  let prev = ctl.state;
  for (let i = 0; i < STEPS; i++) {
    const s = stepController(ctl, DT);
    if (s !== prev) {
      if ((prev === STOP && s === REORIENT) || (prev === REORIENT && s === STOP)) observedIllegal++;
      prev = s;
    }
  }
  const total = ctl.occupancy[0] + ctl.occupancy[1] + ctl.occupancy[2];
  const emp = ctl.occupancy.map((o) => o / total);
  const [pSt, pSw, pR] = steadyState();
  console.log(`  · ${(total / 3600).toFixed(1)} model hours, ${ctl.transitions} transitions; empirical Stop ${emp[0].toFixed(4)} Swim ${emp[1].toFixed(4)} Reorient ${emp[2].toExponential(2)}`);
  near(emp[0], pSt, 0.02, 'simulated Stop occupancy converges on the analytic value');
  near(emp[1], pSw, 0.02, 'simulated Swim occupancy converges on the analytic value');
  near(emp[2] / pR, 1, 0.35, 'and so does the rare Reorient occupancy');

  const legal = ['0->1', '1->0', '1->2', '2->1'];
  for (const e of legal) ok((ctl.edges.get(e) || 0) > 0, `edge ${e} is exercised`);
  for (const [k, v] of ctl.edges) {
    ok(legal.includes(k), `no illegal edge fires (${k} fired ${v} times)`);
  }
  ok(observedIllegal > 0,
    'and a per-tick observer DOES see phantom Stop->Reorient jumps, which is why the edges are counted at the source rather than sampled');

  // Every Reorient is entered from Swim and returns to it, so those two counts
  // must match to within one in-flight transition.
  ok(Math.abs((ctl.edges.get('1->2') || 0) - (ctl.edges.get('2->1') || 0)) <= 1,
    'every reorientation returns to Swim');
  // Mean measured dwell in Reorient: the 24 s^-1 exit is faster than the 1/30 s
  // step, so a per-tick coin flip would have stretched each one to a whole
  // tick. The exact competing-risks step must not.
  const meanReorient = ctl.occupancy[2] / Math.max(1, ctl.edges.get('1->2') || 1);
  console.log(`  · mean measured Reorient dwell: ${(meanReorient * 1000).toFixed(1)} ms (step is ${(DT * 1000).toFixed(1)} ms)`);
  near(meanReorient, PTEROSPERMA.reorientSecs, 0.006,
    'reorientations come out at their measured 41 ms despite a 33 ms timestep');
}

// ── the player leans on rates, it does not set the state ────────────────────
{
  const ctl = createController({ seed: 7, rateScale: 1 });
  ctl.drive = 0;
  const neutral = exitRates(ctl, STOP)[0].rate;
  ctl.drive = 1;
  const pushed = exitRates(ctl, STOP)[0].rate;
  ctl.drive = -1;
  const held = exitRates(ctl, STOP)[0].rate;
  ok(pushed > neutral * 3, 'full drive makes leaving Stop several times likelier');
  ok(held < neutral / 3, 'negative drive holds the cell in Stop');
  ctl.drive = 1;
  const rs = exitRates(ctl, SWIM);
  const toStop = rs.find((r) => r.to === STOP).rate;
  const toReo = rs.find((r) => r.to === REORIENT).rate;
  ok(toReo > toStop, 'under drive, a swimming cell turns rather than stopping');
  ok(exitRates(ctl, REORIENT)[0].rate === PTEROSPERMA.rates.reorientToSwim,
    'drive cannot touch the reorientation exit — a tumble runs to completion');
}

// ── turn angles are the measured distribution ───────────────────────────────
{
  const ctl = createController({ seed: 99, rateScale: 1 });
  const mags = [];
  let left = 0, right = 0;
  for (let i = 0; i < 20000; i++) {
    // Force entry into Reorient repeatedly by stepping from Swim.
    ctl.state = SWIM;
    while (ctl.state !== REORIENT) {
      ctl.state = SWIM;
      stepController(ctl, 1 / 30);
    }
    const deg = ctl.turn * 180 / Math.PI;
    mags.push(Math.abs(deg));
    if (deg < 0) left++; else right++;
    if (mags.length >= 4000) break;
  }
  const mean = mags.reduce((a, b) => a + b, 0) / mags.length;
  const sd = Math.sqrt(mags.reduce((a, b) => a + (b - mean) ** 2, 0) / mags.length);
  console.log(`  · turn angle: ${mean.toFixed(1)} +/- ${sd.toFixed(1)} deg over ${mags.length} draws`);
  near(mean, PTEROSPERMA.turnDeg.mean, 4, 'mean turn angle matches 130 deg');
  near(sd, PTEROSPERMA.turnDeg.sd, 4, 'turn angle spread matches 30 deg');
  ok(Math.abs(left - right) < mags.length * 0.08, 'left and right turns are equally likely');
}

// ── beat frequencies sit in band, and snap toward the dynein bands ──────────
{
  const ctl = createController({ seed: 1234, rateScale: 1 });
  const swim = Array.from({ length: 4000 }, () => drawFrequency(ctl, SWIM));
  ok(swim.every((f) => f >= PTEROSPERMA.swimFreqHz.min - 1e-9 && f <= PTEROSPERMA.swimFreqHz.max + 1e-9),
    'every swimming beat lies in the observed 12-304 Hz range');
  // With snapping on, draws cluster near the bands: median distance to the
  // nearest band must be well under what an unsnapped draw would give.
  const dist = (f) => Math.min(...PTEROSPERMA.bands.map((b) => Math.abs(b - f)));
  const snapped = swim.map(dist).sort((a, b) => a - b)[swim.length >> 1];
  const raw = Array.from({ length: 4000 }, () => drawFrequency(ctl, SWIM, 0)).map(dist)
    .sort((a, b) => a - b)[1999];
  console.log(`  · median distance to a dynein band: ${snapped.toFixed(1)} Hz snapped vs ${raw.toFixed(1)} Hz raw`);
  ok(snapped < raw * 0.6, 'snapping pulls the beat onto the quantized bands');

  const stop = Array.from({ length: 2000 }, () => drawFrequency(ctl, STOP));
  const sm = stop.reduce((a, b) => a + b, 0) / stop.length;
  near(sm, PTEROSPERMA.stopFreqHz.mean, 1.5, 'the unfurled Stop oscillation runs near 10 Hz');
  ok(sm < PTEROSPERMA.swimFreqHz.mean / 5, 'and is far slower than the swimming beat');
}

// ── resistive force theory: break both halves and the thrust must vanish ────
{
  const L = PTEROSPERMA.ciliumLenUm;
  const coef = dragCoefficients(L, 0.2);
  ok(coef.perp > coef.par, 'sideways drag exceeds lengthwise drag');
  near(coef.perp / coef.par, 2, 0.35, 'and does so by roughly the slender-body factor of two');

  // Build a flagellum and beat it at the true model frequency (no display
  // scaling), sampling a whole cycle.
  function cycleThrust({ freq = 95, reverse = false, frozen = false, isotropic = false } = {}) {
    const fl = createFlagellation(null, { beatScale: 1, seed: 5 });
    if (isotropic) fl.coef = { par: coef.par, perp: coef.par };
    fl.freqHz = freq;
    fl.bendAmp = 0;
    const STEPS = 240;
    const dt = 1 / (freq * STEPS);
    let sx = 0, sy = 0, n = 0;
    for (let i = 0; i < STEPS * 3; i++) {
      if (!frozen) fl.phase = (fl.phase + (reverse ? -1 : 1) * freq * dt) % 1;
      synthesize(fl, SWIM);
      const t = thrust(fl, dt);
      if (i >= STEPS) { sx += t.fx; sy += t.fy; n++; }
    }
    return { fx: sx / n, fy: sy / n, fl };
  }

  const fwd = cycleThrust({});
  const rev = cycleThrust({ reverse: true });
  const frozen = cycleThrust({ frozen: true });
  const iso = cycleThrust({ isotropic: true });

  const mag = Math.hypot(fwd.fx, fwd.fy);
  ok(mag > 0, `a travelling wave produces net thrust (${mag.toExponential(2)})`);
  ok(Math.hypot(frozen.fx, frozen.fy) < mag * 1e-6,
    'a frozen waveform produces none — thrust needs the wave to travel');
  ok(Math.hypot(iso.fx, iso.fy) < mag * 0.02,
    'an isotropic fluid produces none — thrust needs drag anisotropy');
  // Reversing the wave reverses the force.
  const dot = (fwd.fx * rev.fx + fwd.fy * rev.fy) / (mag * Math.hypot(rev.fx, rev.fy));
  ok(dot < -0.9, `reversing the wave reverses the thrust (cos = ${dot.toFixed(3)})`);
  // Thrust grows with frequency. Not quadratically: the small-amplitude
  // result F ~ A^2 k omega would say 4x at 2f, but the amplitude falls off
  // with frequency (see synthesize) and the waveform is well past small
  // amplitude, so the realised growth is sublinear-per-doubling. Asserted as
  // measured, because the alternative is asserting a formula the model does
  // not obey.
  const fast = cycleThrust({ freq: 190 });
  const ratio = Math.hypot(fast.fx, fast.fy) / mag;
  console.log(`  · thrust ratio at 2f: ${ratio.toFixed(2)}x`);
  ok(ratio > 1.2, 'thrust grows with beat frequency');
  const slow = cycleThrust({ freq: 24 });
  ok(Math.hypot(slow.fx, slow.fy) < mag * 0.3, 'and collapses at a quarter of the beat');
}

// ── the swimming speed lands where it was measured ──────────────────────────
{
  // This is what pins tipAmplitudeUm: it is the only free parameter in the
  // waveform, and the paper measured the speed it has to produce.
  function speedAt(freq) {
    const fl = createFlagellation(null, { beatScale: 1, seed: 11 });
    fl.freqHz = freq;
    fl.bendAmp = 0;
    const STEPS = 240;
    const dt = 1 / (freq * STEPS);
    let sx = 0, sy = 0, n = 0;
    for (let i = 0; i < STEPS * 3; i++) {
      fl.phase = (fl.phase + freq * dt) % 1;
      synthesize(fl, SWIM);
      const t = thrust(fl, dt);
      if (i >= STEPS) { sx += t.fx; sy += t.fy; n++; }
    }
    return swimSpeed(fl, { fx: sx / n, fy: sy / n });
  }
  const U = speedAt(PTEROSPERMA.swimFreqHz.mean);
  const { mean, sd } = PTEROSPERMA.swimSpeedUmS;
  console.log(`  · RFT swimming speed at the mean beat: ${U.toFixed(0)} um/s (measured ${mean} +/- ${sd})`);
  ok(Math.abs(U - mean) < 0.1 * mean,
    `the model's swimming speed reproduces the measured mean of ${mean} um/s (got ${U.toFixed(0)})`);

  // Faster beat, faster cell, monotonically across the whole observed band.
  const band = [12, 24, 40, 60, 95, 140, 190, 250, 304];
  const speeds = band.map(speedAt);
  for (let i = 1; i < speeds.length; i++) {
    ok(speeds[i] > speeds[i - 1],
      `speed rises from ${band[i - 1]} Hz to ${band[i]} Hz (${speeds[i - 1].toFixed(0)} -> ${speeds[i].toFixed(0)} um/s)`);
  }

  // The paper reports cell speeds spanning "two orders of magnitude" over a
  // frequency band spanning 12-304 Hz. That is a joint constraint on the
  // model that nothing else here checks: it fixes how steeply speed may rise
  // with frequency, independently of where the mean sits.
  const decades = Math.log10(speeds[speeds.length - 1] / speeds[0]);
  const exponent = Math.log(speeds[speeds.length - 1] / speeds[0]) / Math.log(304 / 12);
  console.log(`  · across 12-304 Hz the model spans ${decades.toFixed(1)} orders of magnitude in speed (U ~ f^${exponent.toFixed(2)}); the paper reports two`);
  ok(decades > 1.5 && decades < 3.0,
    `the speed range spans roughly the reported two orders of magnitude (got ${decades.toFixed(1)})`);
  ok(exponent > 1.2 && exponent < 2.2,
    `and does so with a plausible U ~ f exponent (got ${exponent.toFixed(2)})`);

  // The Stop state's 10 Hz oscillation must not accidentally propel: the paper
  // reports stopped cells at 20 um/s or less.
  ok(speedAt(PTEROSPERMA.stopFreqHz.mean) < 20,
    `a 10 Hz unfurled oscillation leaves the cell effectively stationary (${speedAt(10).toFixed(1)} um/s, paper says <= 20)`);
}

// ── the speed the model REPORTS is the cycle mean, not a peak ───────────────
{
  // Everything downstream — the HUD, the /flag swimmer, the force pushed into
  // the amoeba's cortex — reads fl.speedUmS. Within one beat the instantaneous
  // thrust swings by more than an order of magnitude, so reporting it raw made
  // the cell swim about fifty times too fast. Driving the live path here, not
  // a hand-averaged probe, is the only way to catch that.
  // stateScale 0 freezes the chain so this measures the beat and nothing else.
  const fl = createFlagellation(null, { beatScale: 1, seed: 77, stateScale: 0 });
  fl.ctl.state = SWIM;
  fl.freqHz = PTEROSPERMA.swimFreqHz.mean;
  const dt = 1 / (fl.freqHz * 60);
  let peakInst = 0, samples = [];
  for (let i = 0; i < 60 * 40; i++) {
    advanceFlagellum(fl, dt);
    peakInst = Math.max(peakInst, Math.hypot(fl.thrustInst.x, fl.thrustInst.y));
    if (i > 60 * 20) samples.push(fl.speedUmS);
  }
  const lo = Math.min(...samples), hi = Math.max(...samples);
  const mean = samples.reduce((a, b) => a + b, 0) / samples.length;
  const { mean: M, sd } = PTEROSPERMA.swimSpeedUmS;
  console.log(`  · live-path reported speed: ${mean.toFixed(0)} um/s (range ${lo.toFixed(0)}-${hi.toFixed(0)}); peak instantaneous thrust is ${(peakInst / fl.thrustRef).toFixed(0)}x the cycle mean`);
  // Tolerance is 15% of the true cycle mean, not the paper's +/- 326 sd: the
  // sd is the spread across cells, and a bug that reports peaks instead of
  // means would hide comfortably inside it. What is being checked is that the
  // live path agrees with the offline cycle average, and the smoothing's known
  // ~3% high bias is the only gap that should be there.
  ok(Math.abs(mean - M) < M * 0.15,
    `the reported speed is the cycle mean, not a within-beat peak (${mean.toFixed(0)} vs ${M})`);
  ok(hi - lo < M * 0.2,
    `and is steady across the cycle rather than swinging with it (${lo.toFixed(0)}-${hi.toFixed(0)})`);
  // The bug this guards is only possible because the raw signal is huge; if it
  // ever stops being huge this test has stopped proving anything.
  ok(peakInst > fl.thrustRef * 3,
    `the raw within-beat thrust really is much larger than the mean (${(peakInst / fl.thrustRef).toFixed(0)}x), so the averaging is load-bearing`);
}

// ── the display slow-motion must not change the physics ─────────────────────
{
  // beatScale is a presentation knob: it slows the waveform on screen and
  // nothing else. So the speed the model reports has to be the same at every
  // setting of it. This is the invariant that catches a wrong power of
  // beatScale in the display-frame correction, which is a whole factor of
  // twelve at the default and which every fixed-beatScale test misses.
  // stateScale 0 freezes the behaviour chain — every rate is zero, so the
  // next-transition time is infinite and the cell stays where it is put. That
  // matters: at large beatScale the timestep is long enough that the chain
  // fires inside it, and a comparison across scales would be measuring
  // transition frequency rather than the physics.
  function reported(beatScale) {
    const fl = createFlagellation(null, { beatScale, seed: 5150, stateScale: 0 });
    fl.ctl.state = SWIM;
    fl.freqHz = PTEROSPERMA.swimFreqHz.mean;
    // Same resolution per displayed cycle at every scale.
    const dt = beatScale / (fl.freqHz * 120);
    const out = [];
    for (let i = 0; i < 120 * 30; i++) {
      advanceFlagellum(fl, dt);
      if (i > 120 * 15) out.push(fl.speedUmS);
    }
    return out.reduce((a, b) => a + b, 0) / out.length;
  }
  const at1 = reported(1), at12 = reported(12), at40 = reported(40);
  console.log(`  · reported speed vs display slow-motion: ${at1.toFixed(0)} at ÷1, ${at12.toFixed(0)} at ÷12, ${at40.toFixed(0)} at ÷40 um/s`);
  ok(Math.abs(at12 - at1) < at1 * 0.1, `slowing the display 12x does not change the physics (${at1.toFixed(0)} vs ${at12.toFixed(0)})`);
  ok(Math.abs(at40 - at1) < at1 * 0.1, `nor does 40x (${at1.toFixed(0)} vs ${at40.toFixed(0)})`);
}

// ── the mode vector really is the state ─────────────────────────────────────
{
  // The manifold claim only means anything if the 20 modes determine the
  // shape. Two flagella given the same modes must render the same centreline.
  const a = createFlagellation(null, { seed: 3, beatScale: 1 });
  const b = createFlagellation(null, { seed: 999, beatScale: 1 });
  a.freqHz = 88; a.phase = 0.37; a.bendAmp = 0.4;
  synthesize(a, SWIM);
  b.modes.set(a.modes);
  reconstructTangent(b.modes, b.Tuniform, b.nModes, b.theta.length, b.theta);
  centrelineFromTangent(b.theta, b.dsUm, 0, 0, b.xy);
  let worst = 0;
  for (let j = 0; j < a.xy.length; j++) worst = Math.max(worst, Math.abs(a.xy[j] - b.xy[j]));
  ok(worst < 1e-9, `the mode vector alone determines the shape (worst ${worst.toExponential(2)})`);
  ok(a.modes.length === PTEROSPERMA.nModes, '20 numbers is the whole state');
}

// ── bolted to the actual cell, it moves it and does not tear it ─────────────
{
  // The physics above is all in um and mu; the host sim is a damped
  // spring-mass polyline in pixels. Everything that could go wrong goes wrong
  // at that seam, so it is driven here for real: two minutes of play with the
  // player holding the brush on the ciliary anchor.
  const { createWorld } = await import('./world.js');
  const { createSim, tick } = await import('./sim.js');

  function play({ cilia, drive, secs = 120 }) {
    const world = createWorld({ w: 800, h: 800, seed: 1729, level: 1 });
    const sim = createSim({
      world, N: 256, radius: 60,
      cx: world.suggestedStart.x, cy: world.suggestedStart.y,
    });
    if (cilia) sim.flagella = createFlagellation(sim, { seed: 20260818, beatScale: 12 });
    let px = sim.cellCx, py = sim.cellCy, path = 0, swimTicks = 0, nonFinite = 0;
    for (let i = 0; i < 30 * secs; i++) {
      if (cilia && drive != null) {
        sim.nodes[Math.min(sim.flagella.anchorIdx, sim.N - 1)].directive = drive;
      }
      tick(sim, 1 / 30);
      path += Math.hypot(sim.cellCx - px, sim.cellCy - py);
      px = sim.cellCx; py = sim.cellCy;
      if (cilia) {
        if (sim.flagella.ctl.state === SWIM) swimTicks++;
        if (!Number.isFinite(sim.flagella.speedUmS) || !Number.isFinite(sim.flagella.thrustMag)) nonFinite++;
      }
      if (!Number.isFinite(sim.cellCx) || !Number.isFinite(sim.cellCy)) nonFinite++;
    }
    return { sim, path, swimPct: 100 * swimTicks / (30 * secs), nonFinite };
  }

  const bare = play({ cilia: false });
  const idle = play({ cilia: true, drive: null });
  const urged = play({ cilia: true, drive: 1 });
  const held = play({ cilia: true, drive: -1 });

  console.log(`  · 120 s of play — bare crawler ${bare.path.toFixed(0)} px; cilia idle ${idle.path.toFixed(0)} px at ${idle.swimPct.toFixed(1)}% swim; urged ${urged.path.toFixed(0)} px at ${urged.swimPct.toFixed(1)}%; held ${held.path.toFixed(0)} px at ${held.swimPct.toFixed(1)}%`);

  for (const [name, r] of [['idle', idle], ['urged', urged], ['held', held]]) {
    ok(r.nonFinite === 0, `${name}: nothing goes non-finite over 3600 ticks`);
  }
  ok(urged.swimPct > 30, `urging the cilia makes it swim (${urged.swimPct.toFixed(1)}% of ticks)`);
  ok(held.swimPct < 2, `holding them back keeps it stopped (${held.swimPct.toFixed(1)}%)`);
  ok(urged.path > idle.path * 2, 'and an urged cell covers far more ground than an idle one');

  // The failure this guards against is specific and was real: delivering the
  // thrust as a point load on the basal body did not move the cell, it
  // stretched the cortex there until tectonics split the membrane to the
  // 1024-node ceiling. Node count is the tell.
  ok(urged.sim.N < 400,
    `swimming does not tear the membrane apart (N = ${urged.sim.N}, started at 256, ceiling is 1024)`);
  ok(bare.sim.N === 256, 'and the bare crawler is untouched by any of this');
}

// ── which way round the animal swims ───────────────────────────────────────
{
  // THIS BLOCK EXISTS BECAUSE THE SIGN WAS WRONG IN SHIPPED CODE. waveDir was
  // -1 (tip-to-base) on the reasoning that Pterosperma's cilia are anterior and
  // must therefore pull the body along behind them like Chlamydomonas. The
  // premise is true and the conclusion does not follow -- "anterior" says where
  // the basal bodies sit, not which end goes first -- and the paper is explicit:
  //
  //   "In the Swim state, the cilia remain bundled. Robust base-to-tip
  //    travelling waves propagate with highly variable frequency and amplitude."
  //   "In the Swim state, a travelling wave propagates down the cilium to drive
  //    forward propulsion."
  //
  // Nothing else in this file catches it. Flipping the sign moves the
  // cycle-mean thrust magnitude by 0.35%, so every speed check above passes
  // either way and the cell simply swims backwards. Hence an explicit test.

  // 1. The wave travels BASE TO TIP: the crest moves to larger arc length as
  //    the beat phase advances.
  const fl = createFlagellation({ nFilaments: 1, seed: 5, beatScale: 1 });
  fl.ctl.state = SWIM; fl.ctl.stateScale = 0;
  fl.freqHz = PTEROSPERMA.swimFreqHz.mean;
  fl.bendAmp = 0;
  const crestAt = (phase) => {
    fl.phase = phase;
    synthesize(fl, SWIM);
    let best = 0, bestV = -Infinity;
    for (let j = 0; j < fl.theta.length; j++) {
      if (fl.theta[j] > bestV) { bestV = fl.theta[j]; best = j; }
    }
    return best / (fl.theta.length - 1);      // 0 at the base, 1 at the tip
  };
  let outward = 0, inward = 0;
  for (let i = 0; i < 60; i++) {
    const a = crestAt(i / 120), b = crestAt((i + 1) / 120);
    const d = b - a;
    if (Math.abs(d) > 0.4) continue;          // the crest wrapped off the tip
    if (d > 0) outward++; else if (d < 0) inward++;
  }
  console.log(`  · wave crest travel over one beat: ${outward} steps toward the tip, ${inward} toward the base`);
  ok(outward > inward * 3,
    'the travelling wave runs base to tip, as the paper measured it');

  // 2. A base-to-tip wave moves the swimmer OPPOSITE to the way the wave
  //    travels, so the cell goes toward the BASE: the body leads and the
  //    ciliary bundle trails behind it, the way a sperm is pushed. In the
  //    cilium's local frame the cilium extends along +x, so the cycle-mean
  //    thrust on the cell must be NEGATIVE in x.
  const probe = createFlagellation({ nFilaments: 1, seed: 5, beatScale: 1 });
  probe.ctl.state = SWIM; probe.ctl.stateScale = 0;
  probe.freqHz = PTEROSPERMA.swimFreqHz.mean;
  probe.bendAmp = 0;
  const dt = 1 / (probe.freqHz * 200);
  let sx = 0, n = 0;
  for (let i = 0; i < 20000; i++) {
    probe.phase = (probe.phase + probe.freqHz * dt) % 1;
    synthesize(probe, SWIM);
    const t = thrust(probe, dt);
    if (i > 400) { sx += t.fx; n++; }
  }
  const meanFx = sx / n;
  console.log(`  · cycle-mean thrust along the cilium axis: ${meanFx.toExponential(2)} (negative = the bundle trails, the body leads)`);
  ok(meanFx < 0,
    'the cell is pushed away from its cilia — it swims body first, with the bundle streaming out behind it, NOT cilia first');
}

if (failures) {
  console.error(`\n✗ flagella selftest FAILED — ${failures} assertion(s)\n`);
  process.exit(1);
}
console.log('✓ flagella selftest passed — Chebyshev round trip, the paper\'s rate set reproducing its own dwell times and occupancies, linear state topology, RFT thrust vanishing when either of its two causes is removed, a swimming speed that reproduces the measured 646 um/s, and the whole thing driving the real cell for two minutes without tearing it');

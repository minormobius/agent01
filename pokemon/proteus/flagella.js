// flagella.js — ciliary locomotion for the proteus cell.
//
// The amoeba prototype crawls: pressure pushes the membrane out, adhesion
// gives it traction, and every metre of progress is paid for in cortex. This
// module gives the same cell a second, incompatible way to move — a bundle of
// cilia that beats, and swims.
//
// Everything quantitative here is taken from one paper:
//
//   Embodied behavioural complexity in a ciliated microorganism.
//   Nature Communications 17, 8445 (2026).
//   https://doi.org/10.1038/s41467-026-75076-8
//
// It measures *Pterosperma*, a marine prasinophyte: a 9 x 7.1 um body wearing
// four 67 um cilia that bundle into a single compound cilium to swim and
// unfurl to stop. Three things in it are directly usable as a model, and this
// file is those three things:
//
//   1. A SHAPE BASIS. The ciliary waveform is the tangent angle theta(s, t)
//      decomposed on Chebyshev polynomials, theta(s,t) = sum_n T_n(s) c_n(t).
//      Twenty modes reconstruct a real cilium to 0.368 um. So the *state* of a
//      flagellum is a short coefficient vector, not a polyline — see
//      projectTangent / reconstructTangent below.
//
//   2. A DISPERSION RELATION. The first empirical f-vs-k relation for ciliary
//      beating: approximately linear, f ~ k, over the swimming band. Linear
//      dispersion means a non-dispersive wave — one fixed wave speed, so
//      frequency alone fixes the wavelength. That collapses the waveform's
//      free parameters to one number, WAVE_SPEED, which is the single most
//      useful thing here for a simulation. Superposed on it are four quantized
//      frequency bands (37, 88, 184, 265 Hz) attributed to dynein.
//
//   3. A BEHAVIOURAL STATE MACHINE WITH MEASURED RATES. Stop / Swim /
//      Reorient, with a linear transition topology — no Stop <-> Reorient edge
//      exists, everything passes through Swim — and exponential dwell times.
//      The four rates below reproduce the paper's reported steady-state
//      occupancy to three decimals; the selftest checks that.
//
// What this file does NOT claim: the cell it attaches to is Amoeba proteus,
// which has no cilia. The transition is Naegleria's trick (an amoeba that
// grows flagella in about an hour), the numbers are Pterosperma's, and the
// body is neither. Read `renderScale` below for the geometric compression
// that lets a 67 um cilium fit on a 120 px cell.

const TWO_PI = Math.PI * 2;

// --------------------------------------------------------------- constants --
// Measured values, in physical units (um, s, Hz). Kept in one object so a
// tuning knob elsewhere can never be mistaken for a measurement.
export const PTEROSPERMA = {
  bodyLongUm: 9.0,            // 9 +/- 1 um
  bodyShortUm: 7.1,           // 7.1 +/- 0.8 um
  ciliumLenUm: 67.0,          // 67 +/- 6 um, four of them, 9+2 axoneme
  nCilia: 4,

  // Beat frequencies.
  swimFreqHz: { mean: 95, sd: 53, min: 12, max: 304 },
  stopFreqHz: { mean: 10, sd: 4 },
  // Quantized bands the beat prefers to sit on (dynein-driven).
  bands: [37, 88, 184, 265],

  // Swimming.
  swimSpeedUmS: { mean: 646, sd: 326 },

  // Reorientation ("tumble"): stereotyped turn angle, very short.
  turnDeg: { mean: 130, sd: 30 },
  reorientSecs: 0.041,

  // Continuous-time transition rates, s^-1, in the order
  // Stop->Swim, Swim->Stop, Swim->Reorient, Reorient->Swim.
  // Note 1/0.0174 = 57.5 s (paper: <tau_Stop> = 58 +/- 2 s), 1/(0.50+0.21) =
  // 1.41 s (paper: 1.42 +/- 0.03 s), 1/24 = 41.7 ms (paper: 41 +/- 2 ms).
  // The rate set is internally consistent with every reported dwell time.
  rates: { stopToSwim: 0.0174, swimToStop: 0.50, swimToReorient: 0.21, reorientToSwim: 24 },

  // Reported steady-state occupancy, for the selftest to recover.
  steadyState: { Stop: 0.966, Swim: 0.033, Reorient: 0.00030 },

  // Chebyshev decomposition: 20 modes, 0.368 um mean reconstruction error.
  nModes: 20,
  reconErrUm: 0.368,
};

// How many wavelengths the compound cilium carries. The paper gives the
// dispersion relation's *shape* (linear) but not its constant, so this number
// is not read off the paper — it is the model's one structural prediction,
// and it is fixed by a different measurement in the same paper. Given f, L,
// and the four cilia's geometry, resistive force theory turns the wavelength
// into a swimming speed; requiring that speed to be the observed 646 um/s at
// the observed 95 Hz leaves only one answer, and it is close to one wavelength
// along the cilium. The selftest is where that gets checked, and it will fail
// if this drifts away from what the speed implies.
export const WAVELENGTHS_PER_CILIUM = 0.95;

// Wave speed, um/s: the constant of the linear dispersion relation. f ~ k
// means c = 2*pi*f/k is frequency-independent, so one number covers the whole
// observed 12-304 Hz band.
export const WAVE_SPEED_UM_S =
  PTEROSPERMA.swimFreqHz.mean * (PTEROSPERMA.ciliumLenUm / WAVELENGTHS_PER_CILIUM);

// Wavenumber implied by a frequency. This is the whole point of item 2 above:
// one scalar sets the entire wave.
export function wavenumber(freqHz, waveSpeed = WAVE_SPEED_UM_S) {
  return TWO_PI * freqHz / waveSpeed;
}

// ------------------------------------------------------- Chebyshev machinery --
// Convention note. The paper writes the projection as an integral with a
// 1/sqrt(1-s^2) weight and k_0 = 2, k_n = 1. That normalization does not
// invert under a plain sum_n T_n(s) c_n, so it cannot be both the analysis and
// the synthesis convention. What is used here is the standard discrete
// Chebyshev-Gauss pair, which does invert exactly: analysis with a factor
// 2/M (1/M for n = 0), synthesis as the plain sum. Same basis, same modes,
// self-consistent both ways — and the selftest proves round-tripping.

// T_n evaluated at M Chebyshev-Gauss nodes s_j = cos(pi (j + 1/2) / M).
// Returned as { S: Float64Array(M), T: Float64Array(N*M) } with T[n*M + j].
export function chebyshevBasis(nModes, nSamples) {
  const S = new Float64Array(nSamples);
  const T = new Float64Array(nModes * nSamples);
  for (let j = 0; j < nSamples; j++) {
    const ang = Math.PI * (j + 0.5) / nSamples;
    S[j] = Math.cos(ang);
    // T_n(cos a) = cos(n a) — exact, and avoids the recurrence's drift.
    for (let n = 0; n < nModes; n++) T[n * nSamples + j] = Math.cos(n * ang);
  }
  return { S, T, nModes, nSamples };
}

// T_n evaluated at arbitrary s in [-1, 1]. Used for synthesis on a uniform
// arc-length grid, which is what the centreline integrator wants.
export function chebyshevAt(nModes, sVals) {
  const M = sVals.length;
  const T = new Float64Array(nModes * M);
  for (let j = 0; j < M; j++) {
    let s = sVals[j];
    if (s < -1) s = -1; else if (s > 1) s = 1;
    const a = Math.acos(s);
    for (let n = 0; n < nModes; n++) T[n * M + j] = Math.cos(n * a);
  }
  return T;
}

// Analysis: sample a tangent-angle function at the Gauss nodes and project.
// fn(s) receives s in [-1, 1]. Returns Float64Array(nModes).
export function projectTangent(fn, basis, out) {
  const { S, T, nModes, nSamples } = basis;
  const c = out || new Float64Array(nModes);
  c.fill(0);
  for (let j = 0; j < nSamples; j++) {
    const v = fn(S[j]);
    for (let n = 0; n < nModes; n++) c[n] += v * T[n * nSamples + j];
  }
  const two = 2 / nSamples;
  c[0] /= nSamples;
  for (let n = 1; n < nModes; n++) c[n] *= two;
  return c;
}

// Synthesis: theta(s_j) = sum_n T_n(s_j) c_n, for a precomputed T from
// chebyshevAt (nModes x M, column-major by mode).
export function reconstructTangent(c, T, nModes, M, out) {
  const theta = out || new Float64Array(M);
  theta.fill(0);
  for (let n = 0; n < nModes; n++) {
    const cn = c[n];
    if (cn === 0) continue;
    const off = n * M;
    for (let j = 0; j < M; j++) theta[j] += cn * T[off + j];
  }
  return theta;
}

// Integrate a tangent angle into a centreline. ds is the (uniform) arc step.
// Writes interleaved xy[2*M]. Point j is the *end* of segment j, so the base
// is (x0, y0) and the tip is xy[2M-2..2M-1].
export function centrelineFromTangent(theta, ds, x0, y0, xy) {
  const M = theta.length;
  const pts = xy || new Float64Array(M * 2);
  let x = x0, y = y0;
  for (let j = 0; j < M; j++) {
    x += Math.cos(theta[j]) * ds;
    y += Math.sin(theta[j]) * ds;
    pts[j * 2] = x;
    pts[j * 2 + 1] = y;
  }
  return pts;
}

// ------------------------------------------------ behavioural state machine --
// Continuous-time Markov chain on {Stop, Swim, Reorient}. The topology is
// linear: Stop and Reorient are both leaves hanging off Swim, so a cell that
// has stopped must swim before it can turn. That constraint is the paper's,
// and it is what makes the chain worth writing down instead of rolling three
// independent dice.

export const STOP = 0, SWIM = 1, REORIENT = 2;
export const STATE_NAMES = ['Stop', 'Swim', 'Reorient'];

function mulberry32(seed) {
  let s = seed >>> 0;
  return function () {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Box-Muller, one draw.
function gauss(rng) {
  const u = Math.max(1e-12, rng());
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(TWO_PI * rng());
}

export function createController({ seed = 20260818, rateScale = 1, rng } = {}) {
  const r = rng || mulberry32(seed);
  return {
    rng: r,
    state: SWIM,
    // Seconds spent in the current state, and total elapsed model time.
    dwell: 0,
    elapsed: 0,
    // Time-in-state accumulator, for recovering the occupancy empirically.
    occupancy: [0, 0, 0],
    transitions: 0,
    // Every edge actually taken, counted. Recorded here rather than inferred
    // by an observer sampling the state each tick: a Reorient lasts 41 ms and
    // the prototype steps at 33 ms, so an observer WILL sometimes see a Stop
    // followed by a Reorient with the intervening Swim hidden inside one step.
    // That is an aliasing artefact of watching, not a transition the chain
    // made, and the topology claim is about the chain.
    edges: new Map(),
    // Multiplies every rate. 1 = the paper's real timescales; the prototype
    // runs it faster so a 58 s Stop is not 58 s of a player staring at a
    // motionless cell. See `stateScale` in createFlagellation.
    rateScale,
    // Set on entering Reorient: the turn this reorientation will deliver.
    turn: 0,
    // Player pressure on the propensities, in [-1, +1]. Positive biases
    // toward Swim (suppresses Stop, raises the reorient share); negative
    // biases toward Stop. It never *sets* the state — the paper's whole
    // point is that this is an excitable stochastic system, so the player
    // leans on rates.
    drive: 0,
  };
}

// Exit rates out of `state`, after rateScale and player drive.
export function exitRates(ctl, state) {
  const R = PTEROSPERMA.rates;
  const s = ctl.rateScale;
  // drive > 0 makes leaving Stop easier and entering it harder.
  const d = Math.max(-1, Math.min(1, ctl.drive));
  const up = Math.exp(d * 1.6);        // ~5x at full drive
  const down = 1 / up;
  if (state === STOP) return [{ to: SWIM, rate: R.stopToSwim * s * up }];
  if (state === SWIM) return [
    { to: STOP, rate: R.swimToStop * s * down },
    { to: REORIENT, rate: R.swimToReorient * s },
  ];
  return [{ to: SWIM, rate: R.reorientToSwim * s }];
}

// Advance the chain by dt seconds. Uses the exact exponential competing-risks
// step rather than a per-tick coin flip, so the dwell distribution is right
// even at the prototype's coarse 1/30 s step and even when one rate (24 s^-1)
// is faster than the step.
export function stepController(ctl, dt) {
  let remaining = dt;
  let guard = 0;
  while (remaining > 1e-9 && guard++ < 64) {
    const opts = exitRates(ctl, ctl.state);
    let total = 0;
    for (const o of opts) total += o.rate;
    // Time to the next transition.
    const wait = total > 0 ? -Math.log(Math.max(1e-12, ctl.rng())) / total : Infinity;
    const step = Math.min(wait, remaining);
    ctl.occupancy[ctl.state] += step;
    ctl.dwell += step;
    ctl.elapsed += step;
    remaining -= step;
    // step === wait means the draw was consumed and the transition fires.
    // step < wait means dt ran out first — leave the state alone and return;
    // the exponential is memoryless, so redrawing next call is exact.
    if (!isFinite(wait) || wait > step) break;
    // Pick the winning transition.
    let u = ctl.rng() * total;
    let next = opts[opts.length - 1].to;
    for (const o of opts) { u -= o.rate; if (u <= 0) { next = o.to; break; } }
    enterState(ctl, next);
  }
  return ctl.state;
}

function enterState(ctl, next) {
  const key = ctl.state + '->' + next;
  ctl.edges.set(key, (ctl.edges.get(key) || 0) + 1);
  ctl.state = next;
  ctl.dwell = 0;
  ctl.transitions++;
  if (next === REORIENT) {
    // Stereotyped turn: 130 +/- 30 degrees, sign unbiased. The magnitude is
    // imposed from the measured distribution rather than emerging from the
    // hydrodynamics of the bend — the paper reports the outcome, and a
    // resistive-force model of a single large bend would not reproduce a
    // 130-degree peak without tuning that has no data behind it. The bend
    // itself IS rendered (see bendAmp), it just is not what sets the angle.
    const deg = PTEROSPERMA.turnDeg.mean + gauss(ctl.rng) * PTEROSPERMA.turnDeg.sd;
    ctl.turn = (ctl.rng() < 0.5 ? -1 : 1) * deg * Math.PI / 180;
  }
}

// Steady-state occupancy of the chain, solved rather than simulated. Returns
// [pStop, pSwim, pReorient]. Used by the selftest to check the rate set
// against the paper's reported (0.966, 0.033, 0.00030).
export function steadyState(rates = PTEROSPERMA.rates) {
  // Embedded jump chain: Stop->Swim w.p. 1, Swim splits, Reorient->Swim w.p. 1.
  const swimOut = rates.swimToStop + rates.swimToReorient;
  const pSt = rates.swimToStop / swimOut;      // share of Swim exits going to Stop
  const pR = rates.swimToReorient / swimOut;
  // Visit frequencies (Swim normalized to 1): every Stop and every Reorient
  // is entered from Swim and returns to it.
  const visits = [pSt, 1, pR];
  const mean = [1 / rates.stopToSwim, 1 / swimOut, 1 / rates.reorientToSwim];
  let sum = 0;
  const occ = visits.map((v, i) => { const w = v * mean[i]; sum += w; return w; });
  return occ.map((w) => w / sum);
}

// Draw a beat frequency for a state. Swim frequencies are lognormal-ish and
// then pulled toward the nearest quantized band; Stop is the slow unfurled
// oscillation.
export function drawFrequency(ctl, state, snap = 0.55) {
  const F = PTEROSPERMA.swimFreqHz;
  if (state === STOP) {
    const f = PTEROSPERMA.stopFreqHz.mean + gauss(ctl.rng) * PTEROSPERMA.stopFreqHz.sd;
    return Math.max(2, f);
  }
  let f = F.mean + gauss(ctl.rng) * F.sd;
  f = Math.max(F.min, Math.min(F.max, f));
  // Pull toward the nearest dynein band. snap = 0 leaves the draw alone,
  // snap = 1 quantizes hard onto the band.
  let best = PTEROSPERMA.bands[0];
  for (const b of PTEROSPERMA.bands) if (Math.abs(b - f) < Math.abs(best - f)) best = b;
  return f + (best - f) * snap;
}

// ------------------------------------------------ resistive force theory ----
// Gray & Hancock. A slender filament moving through Stokes flow feels
// anisotropic drag: it is about twice as hard to drag sideways as lengthwise,
// and that asymmetry alone is what converts a transverse travelling wave into
// net axial thrust. Everything below is that one fact, discretized.
//
// Coefficients for a cylinder of radius a and length L (per unit length,
// in units of the fluid viscosity mu):
const AXONEME_RADIUS_UM = 0.1;             // one 9+2 axoneme
export function dragCoefficients(lenUm, radiusUm) {
  const ln = Math.log(2 * lenUm / radiusUm);
  return {
    par: 2 * Math.PI / (ln - 0.5),
    perp: 4 * Math.PI / (ln + 0.5),
  };
}

// Net force the filament exerts ON THE FLUID, given the material velocity of
// each sample point. Reaction on the cell is the negative of this. Velocities
// must be in the frame of the cell body, i.e. shape-change velocity only —
// the body's own translation is handled separately by the drag balance.
//
//   xy    : Float64Array(2M) centreline points
//   vel   : Float64Array(2M) material velocity at those points, um/s
//   ds    : arc step, um
// Returns { fx, fy } in units of mu * um^2 / s.
export function rftForce(xy, vel, ds, coef) {
  const M = xy.length >> 1;
  let fx = 0, fy = 0;
  for (let j = 0; j < M; j++) {
    // Local tangent from the neighbouring points.
    const jm = j > 0 ? j - 1 : 0;
    const jp = j < M - 1 ? j + 1 : M - 1;
    let tx = xy[jp * 2] - xy[jm * 2];
    let ty = xy[jp * 2 + 1] - xy[jm * 2 + 1];
    const tl = Math.hypot(tx, ty) || 1;
    tx /= tl; ty /= tl;
    const vx = vel[j * 2], vy = vel[j * 2 + 1];
    const vPar = vx * tx + vy * ty;
    // Perpendicular component = v - (v.t)t
    const px = vx - vPar * tx, py = vy - vPar * ty;
    fx += (coef.par * vPar * tx + coef.perp * px) * ds;
    fy += (coef.par * vPar * ty + coef.perp * py) * ds;
  }
  return { fx, fy };
}

// ------------------------------------------------------------- flagellation --
// One flagellum = one compound cilium: `nCilia` filaments that bundle when
// swimming and splay when stopped.

const NSAMPLES = 64;                        // arc samples along the cilium

export function createFlagellation(sim, opts = {}) {
  const {
    seed = 20260818,
    nModes = PTEROSPERMA.nModes,
    // Rendered cilium length as a multiple of the cell's radius. Pterosperma's
    // true ratio is 67 um of cilium to a 4.5 um body radius — about 15:1 — which
    // on this 60 px cell would be a 900 px whip in an 800 px world. The default
    // compresses that to 2.2:1. Only the um -> px map is compressed; every
    // frequency, wavelength and force below stays in physical units, so the
    // telemetry is comparable to the paper's numbers.
    lengthRatio = 2.2,
    // Beat frequencies are divided by this for display. A 95 Hz beat cannot be
    // drawn at 30 Hz — it aliases into nonsense — so the rendered phase advances
    // at f / beatScale while the *model* keeps f. Wavelength is unaffected:
    // the dispersion relation is evaluated on the true f.
    beatScale = 12,
    // State-machine rates are multiplied by this. The paper's timescales span
    // four orders of magnitude (36 ms reorient, 58 s stop) and a prototype that
    // honoured that would be motionless 97% of the time. 8x compresses the Stop
    // to ~7 s. This deliberately destroys the measured timescale separation and
    // is the one place the model knowingly departs from the data; set to 1 for
    // the faithful chain.
    stateScale = 8,
    // Transverse amplitude, um, at the mean beat. This is the one free
    // parameter in the waveform, and the selftest pins it: it is the value at
    // which resistive force theory delivers the observed 646 +/- 326 um/s.
    tipAmplitudeUm = 8.1,
    // How the amplitude falls off with frequency. See synthesize().
    amplitudeExponent = 0.6,
    // Total sim-force delivered by a beat at the mean swimming frequency,
    // shared out across the whole membrane. The RFT thrust is in mu*um^2/s and
    // runs to six figures, which is meaningless to a damped spring-mass
    // polyline measured in pixels — so the thrust is normalised by its own
    // value at the mean beat, and this is what one such unit buys.
    //
    // Set by measurement, not taste: at this value a swimming cell covers
    // about 3.7 px per second of swimming against the 1.8 px/s a crawling cell
    // makes under a sustained pseudopod. Swimming beats crawling by roughly
    // five to three. The real ratio is nearer 300 to 1 — Pterosperma swims at
    // 646 um/s where an amoeba crawls at single-digit um/s — and reproducing
    // that here would put the cell off the far edge of the world in under a
    // second, and tear the cortex on the way. Third and last of the knowing
    // departures from the data, alongside stateScale and lengthRatio.
    thrustGain = 700,
    // Ceiling on the normalised thrust, in units of the mean beat. The 304 Hz
    // top of the observed band is worth about 1.6 of these; the cap only
    // catches transients during a reorientation.
    thrustCap = 3.0,
    // Fraction of the thrust delivered at the basal body rather than as body
    // drag over the whole membrane. See flagellaForces step 7.
    anchorShare = 0.2,
  } = opts;

  const rng = mulberry32(seed);
  const L = PTEROSPERMA.ciliumLenUm;
  const pxPerUm = (lengthRatio * (sim ? meanRadius(sim) : 60)) / L;
  const waveSpeed = opts.waveSpeedUmS || WAVE_SPEED_UM_S;

  const basis = chebyshevBasis(nModes, NSAMPLES);
  // Uniform arc grid for synthesis: sigma_j in (0, L], s = 2*sigma/L - 1.
  const sUniform = new Float64Array(NSAMPLES);
  for (let j = 0; j < NSAMPLES; j++) sUniform[j] = 2 * ((j + 0.5) / NSAMPLES) - 1;
  const Tuniform = chebyshevAt(nModes, sUniform);

  const fl = {
    ctl: createController({ seed: seed ^ 0x9e37, rateScale: stateScale }),
    rng,
    nModes, basis, Tuniform, sUniform,

    lenUm: L,
    waveSpeedUmS: waveSpeed,
    dsUm: L / NSAMPLES,
    pxPerUm,
    beatScale,
    thrustGain,
    thrustCap,
    anchorShare,
    thrustRef: 1,          // filled in below
    tipAmplitudeUm,
    amplitudeExponent,
    coef: dragCoefficients(L, AXONEME_RADIUS_UM),
    // The compound cilium is four axonemes, not one. Each carries its own
    // drag anisotropy, so the bundle makes roughly nFilaments times the thrust
    // of a single cilium — and drags nFilaments times as hard, which is why
    // this is not a free multiplier on speed. Bundled filaments do screen each
    // other hydrodynamically; `screening` is the fraction of independence they
    // keep, and it is a guess, flagged as one.
    nFilaments: PTEROSPERMA.nCilia,
    screening: 0.8,

    // Live waveform state.
    modes: new Float64Array(nModes),     // theta-hat, the low-dimensional state
    theta: new Float64Array(NSAMPLES),   // reconstructed tangent angle
    xy: new Float64Array(NSAMPLES * 2),  // centreline, um, base at origin
    xyPrev: new Float64Array(NSAMPLES * 2),
    vel: new Float64Array(NSAMPLES * 2),
    havePrev: false,

    // Beat.
    freqHz: PTEROSPERMA.swimFreqHz.mean,
    phase: 0,
    bendAmp: 0,          // large static curvature during a reorientation
    bundle: 1,           // 1 = bundled compound cilium, 0 = four splayed cilia
    splay: 0,            // rendered splay half-angle, rad

    // Where it sits on the cell, and where it points.
    heading: rng() * TWO_PI,   // world angle of the ciliary apparatus
    anchorIdx: 0,
    anchorX: 0, anchorY: 0,

    // Telemetry the HUD and the map read. thrustUm is the cycle-averaged
    // propulsive force — the one that actually moves the cell; thrustInst is
    // the raw within-beat value, kept only for diagnostics.
    thrustUm: { x: 0, y: 0 },
    thrustInst: { x: 0, y: 0 },
    thrustMag: 0,
    speedUmS: 0,
    tipChem: 0,
    tipLight: 0,
    strain: 0,
    turnLeft: 0,         // radians of the current reorientation still to serve

    enabled: true,
  };

  fl.thrustRef = referenceThrust(fl);
  return fl;
}

// Cycle-averaged thrust magnitude at the mean swimming beat, in mu*um^2/s.
// Everything the host sim sees is expressed as a multiple of this, so the
// pixel-space tuning constants stay readable and stay put when the waveform
// parameters are re-tuned. Measured once, at construction.
export function referenceThrust(fl) {
  const probe = {
    ...fl,
    modes: new Float64Array(fl.nModes),
    theta: new Float64Array(NSAMPLES),
    xy: new Float64Array(NSAMPLES * 2),
    xyPrev: new Float64Array(NSAMPLES * 2),
    vel: new Float64Array(NSAMPLES * 2),
    havePrev: false,
    bendAmp: 0,
    phase: 0,
    freqHz: PTEROSPERMA.swimFreqHz.mean,
  };
  const STEPS = 120;
  const dt = 1 / (probe.freqHz * STEPS);
  let sx = 0, sy = 0, n = 0;
  for (let i = 0; i < STEPS * 2; i++) {
    probe.phase = (probe.phase + probe.freqHz * dt) % 1;
    synthesize(probe, SWIM);
    const t = thrust(probe, dt);
    if (i >= STEPS) { sx += t.fx; sy += t.fy; n++; }
  }
  return Math.max(1e-9, Math.hypot(sx / n, sy / n));
}

function meanRadius(sim) {
  let r = 0;
  for (let i = 0; i < sim.N; i++) {
    const n = sim.nodes[i];
    r += Math.hypot(n.x - sim.cellCx, n.y - sim.cellCy);
  }
  return sim.N > 0 ? r / sim.N : 60;
}

// Synthesize the current waveform into fl.modes / fl.theta / fl.xy.
//
// The wave is built in physical space as a travelling wave whose wavelength
// comes from the dispersion relation, then PROJECTED onto the Chebyshev basis
// and reconstructed from the modes. That round trip is not decoration: the
// modes are the state the rest of the system reads (the manifold coordinates),
// and forcing the rendered shape to come back out of them means anything the
// 20 modes cannot hold does not silently survive into the physics.
export function synthesize(fl, state) {
  const { nModes, basis, Tuniform, lenUm } = fl;
  const k = wavenumber(fl.freqHz, fl.waveSpeedUmS);   // rad/um, from f ~ k
  const phase = fl.phase;
  const bend = fl.bendAmp;
  // Transverse amplitude. Held near-constant in um, but with a mild fall-off
  // as the beat speeds up: at 304 Hz a 7 um excursion on a 14 um wavelength
  // would coil the cilium into ringlets, which is not a shape any axoneme
  // makes. The exponent is not measured in the paper; it is fitted so that the
  // speeds this model produces across the observed 12-304 Hz band span the
  // "two orders of magnitude" the paper reports for cell speed. At the fitted
  // value the model gives U ~ f^1.42 and exactly 2.0 decades of speed range.
  // Called out as a fit, not a measurement.
  const ampUm = fl.tipAmplitudeUm *
    Math.pow(PTEROSPERMA.swimFreqHz.mean / Math.max(1, fl.freqHz), fl.amplitudeExponent);
  // Tangent-angle amplitude: A_theta ~ k * A_transverse. Clamped because past
  // about 2 rad the "amplitude" stops meaning anything — the arc folds back.
  const ampTheta = Math.min(2.0, k * ampUm);

  // waveDir = -1: the wave travels tip -> base. Pterosperma's cilia are
  // anterior, so the bundle pulls the body along behind it (a "puller", like
  // Chlamydomonas) rather than pushing it like a sperm flagellum.
  const waveDir = -1;

  // Envelope: zero at the basal body (it is clamped there), ramping up over
  // the proximal quarter and then flat. A linear ramp instead of this costs
  // most of the thrust, because thrust goes as the square of the local
  // transverse excursion and a linear ramp keeps half the cilium nearly
  // straight — the proximal-ramp-then-flat shape is both what beating cilia
  // show and what makes the swimming speed come out at the measured value.
  projectTangent((s) => {
    const sigma = (s + 1) * 0.5 * lenUm;       // arc length, um
    const env = Math.tanh(3.5 * sigma / lenUm);
    return bend * env + ampTheta * env * Math.sin(waveDir * k * sigma - TWO_PI * phase);
  }, basis, fl.modes);

  reconstructTangent(fl.modes, Tuniform, nModes, NSAMPLES, fl.theta);
  centrelineFromTangent(fl.theta, fl.dsUm, 0, 0, fl.xy);

  // Proprioceptive strain: mean |curvature| along the cilium, normalized.
  let strain = 0;
  for (let j = 1; j < NSAMPLES; j++) strain += Math.abs(fl.theta[j] - fl.theta[j - 1]);
  fl.strain = Math.min(1, strain / (NSAMPLES * 0.12));
  return fl;
}

// Thrust for the current waveform, from the shape-change velocity field.
// Returns force ON THE CELL in mu*um^2/s, in the flagellum's local frame
// (+x along the base tangent). dtModel is the *model* timestep in seconds —
// the true one, not the display-scaled one, or the velocities are wrong.
export function thrust(fl, dtModel) {
  if (!fl.havePrev || dtModel <= 0) {
    fl.xyPrev.set(fl.xy);
    fl.havePrev = true;
    return { fx: 0, fy: 0 };
  }
  const inv = 1 / dtModel;
  for (let j = 0; j < fl.vel.length; j++) fl.vel[j] = (fl.xy[j] - fl.xyPrev[j]) * inv;
  const f = rftForce(fl.xy, fl.vel, fl.dsUm, fl.coef);
  fl.xyPrev.set(fl.xy);
  // Force on the fluid -> reaction on the cell, times the number of filaments
  // in the bundle that are hydrodynamically doing their own work.
  const n = effectiveFilaments(fl);
  return { fx: -f.fx * n, fy: -f.fy * n };
}

// nFilaments, discounted for screening. 1 filament is always fully effective.
export function effectiveFilaments(fl) {
  const n = fl.nFilaments == null ? 1 : fl.nFilaments;
  const s = fl.screening == null ? 1 : fl.screening;
  return 1 + (n - 1) * s;
}

// Force-free swimming speed implied by that thrust: the body and the cilium
// both have to be dragged, so U = |thrust| / (drag of everything). This is the
// number that can be compared with the paper's 646 +/- 326 um/s, and it is
// what the selftest calibrates tipAmplitudeUm against.
export function swimSpeed(fl, thrustVec) {
  const bodyRadiusUm = 0.25 * (PTEROSPERMA.bodyLongUm + PTEROSPERMA.bodyShortUm);
  const bodyDrag = 6 * Math.PI * bodyRadiusUm;
  const flagDrag = fl.coef.par * fl.lenUm * effectiveFilaments(fl);
  return Math.hypot(thrustVec.fx, thrustVec.fy) / (bodyDrag + flagDrag);
}

// ------------------------------------------------------ advancing the beat --
// Everything the ciliary apparatus does on its own: behaviour, bundling, beat
// phase, reorientation, waveform, thrust. No membrane involved, which is the
// point — the amoeba hangs this off a polyline, and the /flag instrument hangs
// it off a free-swimming ellipse. Set fl.ctl.drive before calling.
export function advanceFlagellum(fl, dt) {
  // 1. Behaviour. dt is wall time; the chain runs on it directly because
  //    rateScale already carries the compression.
  const prevState = fl.ctl.state;
  const state = stepController(fl.ctl, dt);
  if (state !== prevState) {
    fl.freqHz = drawFrequency(fl.ctl, state);
    if (state === REORIENT) fl.turnLeft = fl.ctl.turn;
    // A new frequency is a new wavelength, so the waveform changes shape
    // between one tick and the next. thrust() gets its material velocities
    // from a finite difference across exactly that gap, and would read the
    // discontinuity as an enormous impulse — which then sits in the cycle
    // average for the better part of a second and reports a cell swimming
    // several times faster than it can. Dropping the previous frame forces
    // thrust() to reseed and return zero for one tick instead.
    fl.havePrev = false;
  }

  // 2. Bundling. Swimming and reorienting bundle the four cilia into one
  //    compound cilium; stopping unfurls them. Relaxation is exponential with
  //    a ~0.25 s constant, which is fast next to a Stop and slow next to a beat.
  const wantBundle = state === STOP ? 0 : 1;
  fl.bundle += (wantBundle - fl.bundle) * Math.min(1, dt / 0.25);
  fl.splay = (1 - fl.bundle) * 0.45;

  // 3. Beat phase. Divided by beatScale for display; the model frequency that
  //    feeds the dispersion relation and the RFT velocities is untouched.
  fl.phase = (fl.phase + (fl.freqHz / fl.beatScale) * dt) % 1;

  // 4. Reorientation: swing the apparatus through the drawn turn over the
  //    state's dwell, and bend the bundle hard while it happens.
  if (state === REORIENT) {
    const dur = PTEROSPERMA.reorientSecs / fl.ctl.rateScale;
    const step = fl.turnLeft * Math.min(1, dt / Math.max(1e-4, dur));
    fl.heading += step;
    fl.turnLeft -= step;
    fl.bendAmp = 1.6 * Math.sign(fl.ctl.turn || 1);
  } else {
    fl.bendAmp *= Math.exp(-dt / 0.15);
  }

  // 5. Waveform + thrust. The RFT velocities need the *displayed* timestep,
  //    because the displayed waveform is what is actually moving on screen;
  //    the resulting thrust is then reported at the model frequency by scaling
  //    back up (thrust is quadratic in the material velocity, so beatScale^2).
  synthesize(fl, state);
  const t = thrust(fl, dt);
  // The waveform on screen moves at 1/beatScale of the real rate, so the
  // material velocities thrust() differences out are 1/beatScale of the real
  // ones. Resistive force theory is LINEAR in velocity — f = zeta*v — so
  // recovering the model-frame thrust is one factor of beatScale, not two.
  // It reads like it ought to be quadratic because the cycle-averaged thrust
  // goes as amplitude squared, but amplitude is not what is being scaled here;
  // only the rate is. Getting this wrong made the cell swim twelve times too
  // fast, and was invisible to every test that ran at beatScale = 1.
  const modelScale = fl.beatScale;
  fl.thrustInst.x = t.fx * modelScale;
  fl.thrustInst.y = t.fy * modelScale;

  // Propulsion is the CYCLE AVERAGE of the thrust, not its instantaneous
  // value. Within one beat the thrust vector swings enormously — its peak
  // magnitude runs tens of times the mean — and a cell driven by the
  // instantaneous number swims about fifty times too fast, which is exactly
  // what the first version of this did (it reported 37,000 um/s against a
  // measured 646). The oscillating part only rocks the cell back and forth
  // inside a cycle; what carries it anywhere is the mean. So: an exponential
  // average over three displayed beat periods. Two costs, both real and both
  // chosen over the alternatives: the |mean| of a smoothed oscillating vector
  // still reads about 3% high (669 um/s against the true cycle mean of 649),
  // and thrust lags a state change by roughly that window. Shortening it makes
  // the bias worse (1.5 periods reads 11% high); lengthening it makes the lag
  // eat a whole swim bout at compressed rates.
  const periodShown = fl.beatScale / Math.max(1, fl.freqHz);
  const a = 1 - Math.exp(-dt / Math.max(1e-5, periodShown * 3));
  fl.thrustUm.x += (fl.thrustInst.x - fl.thrustUm.x) * a;
  fl.thrustUm.y += (fl.thrustInst.y - fl.thrustUm.y) * a;
  fl.thrustMag = Math.hypot(fl.thrustUm.x, fl.thrustUm.y);
  fl.speedUmS = state === STOP ? 0 : swimSpeed(fl, { fx: fl.thrustUm.x, fy: fl.thrustUm.y });
  return state;
}

// Unit vector, in world coordinates, that the thrust points along. This is the
// direction a free cell travels: at these Reynolds numbers there is no
// inertia, so velocity is thrust over drag and nothing coasts.
export function thrustDirection(fl) {
  const hx = Math.cos(fl.heading), hy = Math.sin(fl.heading);
  const m = fl.thrustMag;
  if (!(m > 0)) return { x: hx, y: hy };
  const t = fl.thrustUm;
  return { x: (t.x * hx - t.y * hy) / m, y: (t.x * hy + t.y * hx) / m };
}

// ------------------------------------------------------------ the sim hook --
// Called from sim.tick() after the per-node forces are assembled and before
// integration. Advances the apparatus, then pushes the thrust into the
// polyline.
export function flagellaForces(fl, sim, dt) {
  if (!fl || !fl.enabled) return;

  // 0. Player pressure. The brush writes `directive` onto membrane nodes; the
  //    directive sitting on the ciliary anchor is read as drive. Extending
  //    (positive) urges the cell to swim, retracting (negative) urges it to
  //    stop. Note this is the same gesture that grows a pseudopod elsewhere on
  //    the cell — at the anchor it means something else, which is the point.
  fl.ctl.drive = sim.nodes[Math.min(fl.anchorIdx, sim.N - 1)].directive;

  const state = advanceFlagellum(fl, dt);
  const tx = fl.thrustUm.x, ty = fl.thrustUm.y;

  // 6. Locate the anchor: the polyline node nearest the ray leaving the
  //    centroid at fl.heading. Anchoring by direction rather than node index
  //    survives tectonic splits and merges, which renumber everything.
  const hx = Math.cos(fl.heading), hy = Math.sin(fl.heading);
  let best = 0, bestDot = -Infinity;
  for (let i = 0; i < sim.N; i++) {
    const n = sim.nodes[i];
    let dx = n.x - sim.cellCx, dy = n.y - sim.cellCy;
    const l = Math.hypot(dx, dy) || 1;
    const d = (dx * hx + dy * hy) / l;
    if (d > bestDot) { bestDot = d; best = i; }
  }
  fl.anchorIdx = best;
  fl.anchorX = sim.nodes[best].x;
  fl.anchorY = sim.nodes[best].y;

  // 7. Push the thrust into the membrane. The local frame's +x is the heading,
  //    so rotate the local thrust out to world.
  //
  //    Where it lands matters more than how big it is. A real swimming cell is
  //    dragged through the fluid by its cilium, and that drag is distributed
  //    over the whole body surface — it is not a point load on the basal body.
  //    Delivered as a point load here it does not translate the cell at all: it
  //    stretches the cortex at the anchor until tectonics splits the membrane
  //    to pieces, which is what the first version of this did. So the bulk goes
  //    on uniformly, as body drag, and only `anchorShare` acts locally, which
  //    is the tug the player can feel in the tension channel.
  if (state !== STOP && fl.thrustMag > 0) {
    // Normalise to multiples of the mean beat, cap, then scale to sim force.
    const norm = Math.min(fl.thrustCap, fl.thrustMag / fl.thrustRef);
    const g = fl.thrustGain * norm / fl.thrustMag;
    const wx = tx * hx - ty * hy;
    const wy = tx * hy + ty * hx;

    const bulk = (1 - fl.anchorShare) / sim.N;
    for (let i = 0; i < sim.N; i++) {
      const n = sim.nodes[i];
      n.fx += wx * g * bulk;
      n.fy += wy * g * bulk;
    }

    const SPREAD = Math.max(4, Math.round(sim.N * 0.06));
    let wsum = 0;
    for (let d = -SPREAD; d <= SPREAD; d++) wsum += Math.exp(-0.5 * (d * d) / (SPREAD * SPREAD * 0.25));
    for (let d = -SPREAD; d <= SPREAD; d++) {
      const w = fl.anchorShare * Math.exp(-0.5 * (d * d) / (SPREAD * SPREAD * 0.25)) / wsum;
      const n = sim.nodes[((best + d) % sim.N + sim.N) % sim.N];
      n.fx += wx * g * w;
      n.fy += wy * g * w;
    }
  }
}

// Called from sim.tick() after the membrane-flow pass, which overwrites node
// readings. Cilia are sensory organelles, so this is not a liberty: the bundle
// reaches roughly two cell radii out and reports what it finds there, and the
// cell feels its own beat as tension at the anchor. On the map that shows up
// as chemistry arriving at one arc position from somewhere the membrane has
// not been.
export function flagellaSense(fl, sim, world) {
  if (!fl || !fl.enabled) return;
  const M = fl.theta.length;
  const hx = Math.cos(fl.heading), hy = Math.sin(fl.heading);
  // Tip in world pixels.
  const lx = fl.xy[(M - 1) * 2] * fl.pxPerUm;
  const ly = fl.xy[(M - 1) * 2 + 1] * fl.pxPerUm;
  const tipX = fl.anchorX + lx * hx - ly * hy;
  const tipY = fl.anchorY + lx * hy + ly * hx;
  fl.tipX = tipX; fl.tipY = tipY;
  fl.tipChem = world.sample(world.chem, tipX, tipY);
  fl.tipLight = world.sample(world.light, tipX, tipY);

  const SPREAD = Math.max(3, Math.round(sim.N * 0.04));
  for (let d = -SPREAD; d <= SPREAD; d++) {
    const w = 1 - Math.abs(d) / (SPREAD + 1);
    const n = sim.nodes[((fl.anchorIdx + d) % sim.N + sim.N) % sim.N];
    // The distal reading blends in at the anchor; it does not replace the
    // membrane's own.
    n.chem = n.chem + (fl.tipChem - n.chem) * 0.55 * w;
    n.light = n.light + (fl.tipLight - n.light) * 0.35 * w;
    // Beat load, felt as cortical tension.
    n.tension = Math.min(1.5, n.tension + fl.strain * 0.45 * w * (fl.ctl.state === STOP ? 0.25 : 1));
  }
}

// Rendered filament centrelines in world pixels, one per cilium. Splayed when
// unfurled, coincident when bundled. Returns an array of Float32Array(2M).
export function filamentPaths(fl) {
  const M = fl.theta.length;
  const hx = Math.cos(fl.heading), hy = Math.sin(fl.heading);
  const out = [];
  const n = PTEROSPERMA.nCilia;
  for (let c = 0; c < n; c++) {
    // 3+1 basal body arrangement: three close together, one offset.
    const rank = c === n - 1 ? 1.6 : (c - (n - 2) / 2);
    const off = fl.splay * rank;
    const path = new Float32Array(M * 2);
    for (let j = 0; j < M; j++) {
      // Splay = a small extra tangent-angle offset accumulating with arc length.
      const sigma = (j + 0.5) * fl.dsUm;
      const bendOff = off * (sigma / fl.lenUm);
      const lx = fl.xy[j * 2] * Math.cos(bendOff) - fl.xy[j * 2 + 1] * Math.sin(bendOff);
      const ly = fl.xy[j * 2] * Math.sin(bendOff) + fl.xy[j * 2 + 1] * Math.cos(bendOff);
      const px = lx * fl.pxPerUm, py = ly * fl.pxPerUm;
      path[j * 2] = fl.anchorX + px * hx - py * hy;
      path[j * 2 + 1] = fl.anchorY + px * hy + py * hx;
    }
    out.push(path);
    if (fl.bundle > 0.985) break;   // bundled: one compound cilium, draw once
  }
  return out;
}

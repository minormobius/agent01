// climate-forcing.js — a deterministic, causal climate FORCING over deep time.
//
// computeClimate() (engine.js) turns a forcing into a climate field. This module is
// where the forcing COMES FROM: not an arbitrary curve, but the physical drivers a
// generated planet actually has —
//
//   · ORBITAL (Milankovitch): insolation paced by the world's own axial tilt
//     (obliquity ~41 kyr) + precession (~23 kyr) under an eccentricity envelope
//     (~100 kyr). This is the slow metronome that ends an ice age.
//   · SOLAR: grand minima — multi-decade "dark periods" of a dimmer sun (Maunder /
//     Little-Ice-Age analogues), a shallow broad cooling.
//   · VOLCANIC: stratospheric-aerosol winters erupting from the world's OWN major
//     volcanoes (world.volc), a sharp cooling that washes out over a few years —
//     with a rare super-eruption (Toba-scale) that can bury a century.
//
// The state variable is ICE VOLUME, which LAGS temperature by millennia (ice sheets
// grow and melt slowly). So deglaciation is a smooth ramp and sea level tracks it —
// but a volcanic winter is a spike the ice barely feels. Ice-albedo feedback makes
// the glacial colder and the deglaciation sharper. Sea level falls with ice.
//
// The point (for polis): civilization can only nucleate once the ice retreats — a
// causal claim we make on purpose — and a big enough volcanic/solar downturn can cast
// it back into the dark. Every driver is deterministic from (world, seed): same world
// ⇒ same climate history, freezable like everything else. No Date.now / unseeded rng.

import { mulberry32 } from './engine.js';

// ---- tunables (units: tempOffset in °C added to computeClimate; sea in mappa units,
// where computeClimate's shore is 0 and the current polis chronicle used ~[-0.03,+0.015])
const K = {
  yearStart: -12000, yearEnd: 2100, dt: 25,
  BASE: 1.5,            // interglacial baseline °C offset (ice≈0, orbital≈peak)
  ORB_GAIN: 3.4,        // °C per unit orbital insolation anomaly
  ALBEDO: 6.2,          // °C of extra cooling at full ice (ice-albedo feedback)
  ICE_TAU: 1600,        // yr — ice-sheet response time (the millennial lag)
  ICE_THRESH: -0.15,    // slow-forcing level at which ice is half-melted
  ICE_WIDTH: 0.55,      // logistic width of the melt transition
  SEA_LOW: -0.032,      // sea-level offset at full ice (glacial lowstand)
  SEA_HIGH: 0.015,      // sea-level offset at no ice (interglacial highstand)
  OBLIQ: 41000, PREC: 23000, ECC: 100000,
};

function latOf(v) { return Math.asin(Math.max(-1, Math.min(1, v[2]))); }
function lonOf(v) { return Math.atan2(v[1], v[0]); }

// the world's most prominent, spatially-separated volcanoes → eruption sources.
// (same idea as viewer.js computeVolcanoes; kept local so this module needs only engine.js)
export function topVolcanoes(world, max = 8) {
  if (!world || !world.volc) return [];
  const cand = [];
  for (let i = 0; i < world.N; i++) if (world.volc[i] > 0.3) cand.push(i);
  cand.sort((a, b) => world.volc[b] - world.volc[a]);
  const picked = [];
  for (const i of cand) {
    if (picked.length >= max) break;
    let ok = true;
    for (const j of picked) { const d = world.V[i][0] * world.V[j][0] + world.V[i][1] * world.V[j][1] + world.V[i][2] * world.V[j][2]; if (d > 0.985) { ok = false; break; } }
    if (ok) picked.push(i);
  }
  return picked.map((i) => ({ cell: i, volc: world.volc[i], lat: latOf(world.V[i]), lon: lonOf(world.V[i]) }));
}

// derive the driver set (deterministic from world + seed)
function deriveDrivers(world, seed, y0, y1) {
  const rnd = mulberry32((seed ^ 0x0c11ade) >>> 0);
  const span = y1 - y0;
  const tilt = (world && world.meta && world.meta.axialTilt) || 0.41;

  // orbital phases: put the obliquity MINIMUM near the window start so insolation
  // RISES across the window (a deglaciation in-window). cos is minimal a half-period
  // after its phase, so anchor obPhase a half-period before y0. Seeded jitter.
  const obPhase = y0 - K.OBLIQ * 0.5 + (rnd() - 0.5) * 4000;   // obliquity min ≈ y0
  const prPhase = (rnd() * 2 - 1) * K.PREC;
  const ecPhase = (rnd() * 2 - 1) * K.ECC;

  // grand solar minima — 1..3, concentrated in the civilized half (after deglaciation)
  const nMin = 1 + Math.floor(rnd() * 3), solarMins = [];
  for (let i = 0; i < nMin; i++) {
    const year = y0 + span * (0.5 + rnd() * 0.48);
    const dur = 40 + rnd() * 140;                       // decades to ~2 centuries
    const depth = 0.4 + rnd() * 0.8;                    // °C
    solarMins.push({ year, dur, depth });
  }

  // volcanic eruptions — heavy-tailed magnitude, sourced from the world's volcanoes
  const sources = topVolcanoes(world, 8);
  const pick = () => sources.length ? sources[Math.floor(rnd() * sources.length)] : { cell: -1, lat: 0, lon: 0 };
  const nErupt = 10 + Math.floor(rnd() * 12), eruptions = [];
  for (let i = 0; i < nErupt; i++) {
    const year = y0 + rnd() * span;
    const u = rnd();
    const mag = 0.8 + Math.pow(u, 3) * 3.4;             // most small; cube → rare big
    const tau = 2.5 + rnd() * 4;                        // aerosol washout (yr)
    const s = pick();
    eruptions.push({ year, mag, tau, cell: s.cell, lat: s.lat, lon: s.lon, super: false });
  }
  // a rare SUPER-eruption (deterministic ~35% of worlds) — a multi-year buried century,
  // placed in the civilized era so it can actually cast a civilization back
  let superErupt = null;
  if (rnd() < 0.35) {
    const year = y0 + span * (0.55 + rnd() * 0.4);
    const s = pick();
    superErupt = { year, mag: 5.5 + rnd() * 4.5, tau: 6 + rnd() * 8, cell: s.cell, lat: s.lat, lon: s.lon, super: true };
    eruptions.push(superErupt);
  }

  return { tilt, obPhase, prPhase, ecPhase, solarMins, eruptions, superErupt, sources };
}

// orbital insolation anomaly at `year` in ~[-1, +1]
function orbital(d, year) {
  const ob = Math.cos(2 * Math.PI * (year - d.obPhase) / K.OBLIQ);
  const ecc = 0.5 + 0.5 * Math.cos(2 * Math.PI * (year - d.ecPhase) / K.ECC);   // 0..1 envelope
  const pr = Math.cos(2 * Math.PI * (year - d.prPhase) / K.PREC) * ecc;
  const tiltAmp = 0.7 + 0.3 * (d.tilt / 0.41);                                   // planet's tilt scales the forcing (floored so low-tilt worlds still deglaciate)
  return tiltAmp * (0.66 * ob + 0.34 * pr);                                      // ≈ −1 (glacial) at window start → +0.7 (interglacial) as obliquity peaks
}

// raised-cosine window (grand-minimum envelope), 0 outside [c−w/2, c+w/2]
function coswin(year, center, width) {
  const t = (year - center) / (width * 0.5);
  if (t <= -1 || t >= 1) return 0;
  return 0.5 * (1 + Math.cos(Math.PI * t));
}

// the SLOW forcing (orbital + solar) that ice responds to — volcanic spikes excluded,
// because ice sheets have millennial inertia and don't notice a few cold years.
function slowForcing(d, year) {
  let solar = 0;
  for (const m of d.solarMins) solar -= m.depth * coswin(year, m.year, m.dur);
  return orbital(d, year) * K.ORB_GAIN + solar;
}

// volcanic cooling at `year` (sum of decaying pulses; only after each eruption)
function volcanic(d, year) {
  let v = 0;
  for (const e of d.eruptions) if (year >= e.year) { const c = -e.mag * Math.exp(-(year - e.year) / e.tau); if (c < -0.02) v += c; }
  return v;
}

// integrate ice volume + assemble the series
function integrate(d, y0, y1, dt) {
  const series = [];
  let ice = 1;                                    // start fully glaciated
  for (let year = y0; year <= y1 + 0.5; year += dt) {
    const sf = slowForcing(d, year);
    const iceEq = 1 / (1 + Math.exp((sf - K.ICE_THRESH) / K.ICE_WIDTH));  // low forcing → high ice
    ice += (iceEq - ice) * (dt / K.ICE_TAU);
    if (ice < 0) ice = 0; else if (ice > 1) ice = 1;
    const volc = volcanic(d, year);
    const O = orbital(d, year);
    let solar = 0; for (const m of d.solarMins) solar -= m.depth * coswin(year, m.year, m.dur);
    const tempOffset = K.BASE + O * K.ORB_GAIN + solar + volc - K.ALBEDO * ice;
    const seaLevelOffset = K.SEA_LOW + (K.SEA_HIGH - K.SEA_LOW) * (1 - ice);
    series.push({ year, tempOffset, seaLevelOffset, ice, orbital: O, solar, volc });
  }
  // WETNESS (humidity) — a multiplier on the whole moisture field. Two terms:
  //  · a Clausius-Clapeyron floor: warm air holds more moisture, so a glacial is arid
  //    and an interglacial wetter;
  //  · a PLUVIAL PULSE — a broad humid period peaking early in the interglacial then
  //    declining, tied to THIS world's deglaciation timing. This is the Holocene Humid
  //    Period → aridification arc (the wet founding window of Mesopotamia / the Sahara,
  //    then the drying that stressed the Bronze-Age cities). Every world gets its own.
  let degYear = series[series.length - 1].year;
  for (const s of series) if (s.ice < 0.5) { degYear = s.year; break; }
  const pluvialPeak = degYear + 1200, pluvialWidth = 2700;
  for (const s of series) {
    const warmth = Math.max(0, Math.min(1, (s.tempOffset - (-6)) / 10));
    const pluvial = 0.5 * Math.exp(-(((s.year - pluvialPeak) / pluvialWidth) ** 2));
    s.humidity = Math.max(0.5, Math.min(1.5, 0.62 + 0.55 * warmth + pluvial));
  }
  return series;
}

// classify the climate regime at a sample (for the timeline's "why")
function regimeOf(s, prevIce) {
  if (s.volc < -1.2) return 'volcanic-winter';
  if (s.solar < -0.35) return 'grand-minimum';
  if (prevIce != null && prevIce - s.ice > 0.003) return 'deglaciation';  // actively melting (checked before glacial so the ramp is labelled)
  if (s.ice > 0.6) return 'glacial';
  return 'interglacial';
}

// PUBLIC: build the whole causal climate history for a world.
// returns { y0, y1, dt, drivers, series, forcingAt(year), eventsInYears(y0,y1) }
export function buildClimate(world, opts = {}) {
  const seed = (opts.seed != null ? opts.seed : (world && world.meta ? world.meta.seed : 0)) >>> 0;
  const y0 = opts.yearStart ?? K.yearStart, y1 = opts.yearEnd ?? K.yearEnd, dt = opts.dt ?? K.dt;
  const drivers = deriveDrivers(world, seed, y0, y1);
  const series = integrate(drivers, y0, y1, dt);
  // annotate regimes (needs previous ice for the deglaciation slope)
  for (let i = 0; i < series.length; i++) series[i].regime = regimeOf(series[i], i > 0 ? series[i - 1].ice : null);

  const forcingAt = (year) => {
    if (year <= series[0].year) return series[0];
    const last = series[series.length - 1];
    if (year >= last.year) return last;
    const fi = (year - y0) / dt, i = Math.floor(fi), t = fi - i;
    const a = series[i], b = series[i + 1] || a;
    return {
      year,
      tempOffset: a.tempOffset + (b.tempOffset - a.tempOffset) * t,
      seaLevelOffset: a.seaLevelOffset + (b.seaLevelOffset - a.seaLevelOffset) * t,
      ice: a.ice + (b.ice - a.ice) * t,
      humidity: a.humidity + (b.humidity - a.humidity) * t,
      orbital: a.orbital + (b.orbital - a.orbital) * t,
      solar: a.solar + (b.solar - a.solar) * t,
      volc: a.volc + (b.volc - a.volc) * t,
      regime: t < 0.5 ? a.regime : b.regime,
    };
  };

  // discrete driver events (for the timeline): eruptions + solar minima with their years
  const events = [];
  for (const e of drivers.eruptions) if (e.year >= y0 && e.year <= y1) events.push({ kind: e.super ? 'super-eruption' : 'eruption', year: e.year, mag: e.mag, cell: e.cell, lat: e.lat, lon: e.lon });
  for (const m of drivers.solarMins) events.push({ kind: 'grand-minimum', year: m.year, depth: m.depth, dur: m.dur });
  events.sort((a, b) => a.year - b.year);

  return { y0, y1, dt, drivers, series, forcingAt, events };
}

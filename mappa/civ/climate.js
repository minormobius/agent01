// mappa/civ/climate.js — the climate valve (M5).
//
// Nobody is ever told to migrate. Climate is a set of time-varying fields —
// passability and per-package subsistence-viability modifiers — that are PURE
// functions of the tick. When a cell's K drops or a corridor thaws, density stress
// rises, pDisperse spikes, and a migration pulse EMERGES from the demography. The
// presets (kurgan / beringia / 4.2ka) are schedules of field deltas keyed to run
// fraction, recomputed from scratch each tick (idempotent → deterministic, no drift).

import { NPKG, PKG_ID } from './caps.js';

// smooth 0→1 ramp over [a,b]
const ramp = (t, a, b) => t <= a ? 0 : t >= b ? 1 : (t - a) / (b - a);
// triangular pulse: 0 → 1 at peak → back toward `tail` by end of window
function pulse(t, a, peak, b, tail = 0) {
  if (t <= a || t >= b) return t >= b ? tail : 0;
  return t < peak ? ramp(t, a, peak) : (1 - ramp(t, peak, b)) * (1 - tail) + tail;
}

// Preset → schedule of phases. Each phase: { band:[latLoRad,latHiRad], from,peak,to,
// permanent, filter, dPass, dSub:{pkgId:factorAtFull}, dK }. Applied by strength s∈[0,1].
export function compileClimate(spec, w) {
  if (spec && spec.schedule) return spec;
  const id = (spec && spec.preset) || spec || 'stable';
  switch (id) {
    case 'kurgan': // a drying event flips mid-latitude forest→steppe: pastoral corridor.
      return { schedule: [{
        band: [0.30, 0.80], from: 0.28, peak: 0.42, to: 1.0, permanent: true,
        dPass: +0.35,                                   // steppe opens up (more mobile)
        dSub: { [PKG_ID.plough]: 0.45, [PKG_ID.horticulture]: 0.5, [PKG_ID.pastoral]: 1.9, [PKG_ID.forager]: 0.75 },
        dK: 0.9,
      }] };
    case 'beringia': // warming retreats ice at high latitude: a corridor opens.
      return { schedule: [{
        band: [0.75, 1.60], from: 0.08, peak: 0.28, to: 1.0, permanent: true,
        filter: 'frozen', dPass: +0.9, dSub: { [PKG_ID.forager]: 1.6, [PKG_ID.pastoral]: 1.3 }, dK: 1.15,
      }] };
    case '4.2ka': // aridification collapses irrigation cells → ejection, then partial recovery.
      return { schedule: [{
        band: [0.05, 0.55], from: 0.50, peak: 0.60, to: 0.80, permanent: false,
        filter: 'river', dSub: { [PKG_ID.irrigation]: 0.25, [PKG_ID.plough]: 0.6 }, dK: 0.5,
      }] };
    case 'stable':
    default:
      return { schedule: [] };
  }
}

// A climate object holding the current-tick fields. Cheap arrays reused each tick.
export function makeClimate(spec, w) {
  const N = w.N;
  const sched = compileClimate(spec, w);
  const lat = new Float32Array(N);
  for (let i = 0; i < N; i++) lat[i] = Math.abs(Math.asin(Math.max(-1, Math.min(1, w.V[i][2]))));
  const passability = new Float32Array(N);
  const subMod = new Float32Array(N * NPKG);
  const Kmod = new Float32Array(N);
  const st = { passability, subMod, Kmod, active: false, lastPulse: 0 };

  st.step = (tick, totalTicks) => {
    const frac = totalTicks > 0 ? tick / totalTicks : 0;
    passability.fill(1); Kmod.fill(1);
    for (let i = 0; i < N * NPKG; i++) subMod[i] = 1;
    let anyStrong = false, peakStrength = 0;
    for (const ph of sched.schedule) {
      const s = ph.permanent ? ramp(frac, ph.from, ph.peak) : pulse(frac, ph.from, ph.peak, ph.to, 0.25);
      if (s <= 0) continue;
      if (s > peakStrength) peakStrength = s;
      if (s > 0.4) anyStrong = true;
      for (let i = 0; i < N; i++) {
        if (!w.land[i]) continue;
        const la = lat[i]; if (la < ph.band[0] || la > ph.band[1]) continue;
        if (ph.filter === 'frozen') { const b = w.biome[i]; if (!(w.temperature[i] < -4 || b === 3 || b === 15 || b === 17)) continue; }
        if (ph.filter === 'river' && !w.river[i] && !w.lakeAdj[i]) continue;
        if (ph.dPass) passability[i] = Math.max(0, Math.min(1.5, passability[i] + ph.dPass * s));
        if (ph.dK != null) Kmod[i] *= (1 - s) + s * ph.dK;
        if (ph.dSub) for (const p in ph.dSub) { const f = +p; subMod[i * NPKG + f] *= (1 - s) + s * ph.dSub[p]; }
      }
    }
    st.active = anyStrong; st.lastPulse = peakStrength;
  };
  st.hasSchedule = sched.schedule.length > 0;
  return st;
}

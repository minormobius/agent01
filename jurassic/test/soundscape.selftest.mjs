// node jurassic/test/soundscape.selftest.mjs
//
// Gates the surface end to end, against the COMMITTED wasm artifact rather
// than the Rust source. The crate has its own `cargo test` (see
// engine-rs/src/tests.rs) and that is where the acoustics are proved; this file
// exists to catch the failure that one cannot — a stale or mis-built
// jurassic.wasm shipping alongside a green crate. If the artifact in engine/
// does not reproduce ISO 9613-2 Table 2, the site is lying and this goes red.
//
// It also gates the half of the surface that is data: the roster's provenance
// tags, and the ecology those tags are there to keep honest.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { SPECIES, EARS, threshold } from '../js/fauna.js';
import { buildPlot } from '../js/scene.js';

const HERE = dirname(fileURLToPath(import.meta.url));
let failures = 0;
const ck = (c, m) => { if (c) console.log(`  ✓ ${m}`); else { failures++; console.error(`  ✗ ${m}`); } };

const bytes = readFileSync(join(HERE, '..', 'engine', 'jurassic.wasm'));
const { instance } = await WebAssembly.instantiate(bytes, {});
const ex = instance.exports;

console.log('— the committed artifact is the engine we think it is —');
{
  const need = [
    'engine_version', 'max_voices', 'init', 'clear_scene', 'add_voice',
    'set_voice_trim', 'set_listener', 'set_air', 'set_detector', 'set_master',
    'render', 'out_ptr', 'voice_count', 'voice_received_db',
    'voice_audible_radius_m', 'voice_duty', 'voice_activity', 'peak_out',
    'absorption_db_per_m', 'transmission_loss_db', 'memory',
  ];
  const missing = need.filter((n) => !(n in ex));
  ck(missing.length === 0, `all ${need.length} ABI exports present${missing.length ? ' — missing ' + missing : ''}`);
  ck(ex.engine_version() >= 1, `engine version ${ex.engine_version?.()}`);
  ck(ex.max_voices() >= 48, `${ex.max_voices()} voice slots`);
}

console.log('— ISO 9613-2 Table 2, straight out of the wasm —');
{
  const BANDS = [63, 125, 250, 500, 1000, 2000, 4000, 8000];
  const ROWS = [
    [10, 70, [0.1, 0.4, 1.0, 1.9, 3.7, 9.7, 32.8, 117.0]],
    [20, 70, [0.1, 0.3, 1.1, 2.8, 5.0, 9.0, 22.9, 76.6]],
    [30, 70, [0.1, 0.3, 1.0, 3.1, 7.4, 12.7, 23.1, 59.3]],
    [15, 20, [0.3, 0.6, 1.2, 2.7, 8.2, 28.2, 88.8, 202.1]],
  ];
  let worst = 0, worstAt = '';
  for (const [t, rh, expected] of ROWS) {
    for (let i = 0; i < BANDS.length; i++) {
      const got = ex.absorption_db_per_m(BANDS[i], t, rh, 101.325) * 1000;
      const tol = Math.max(expected[i] * 0.03, 0.06);
      const off = Math.abs(got - expected[i]);
      if (off / tol > worst) { worst = off / tol; worstAt = `${t}°C/${rh}% ${BANDS[i]} Hz`; }
      if (off >= tol) {
        failures++;
        console.error(`  ✗ ${t} °C / ${rh} % RH, ${BANDS[i]} Hz: ${got.toFixed(3)} vs ${expected[i]} ± ${tol.toFixed(3)}`);
      }
    }
  }
  ck(worst < 1, `all 32 tabulated points match (worst ${(worst * 100).toFixed(0)} % of tolerance, at ${worstAt})`);
}

console.log('— the roster declares its provenance —');
{
  const KINDS = ['measured', 'modelled', 'hypothesis'];
  ck(SPECIES.every((s) => KINDS.includes(s.from)), 'every species carries a valid provenance tag');
  const measured = SPECIES.filter((s) => s.from === 'measured');
  ck(measured.length === 2, `exactly two carriers claim to be measured (${measured.map((s) => s.name).join(', ')})`);
  ck(measured.every((s) => s.cite && s.cite.length > 8), 'each measured carrier cites its paper');
  ck(SPECIES.every((s) => !s.cite || s.from === 'measured'), 'nothing modelled dresses itself in a citation');
  ck(EARS.every((e) => KINDS.includes(e.from)), 'every audiogram carries a provenance tag');
  ck(EARS.filter((e) => e.from === 'hypothesis').length === 3, 'the three Jurassic ears are flagged as hypothesis');

  const total = SPECIES.reduce((n, s) => n + s.count, 0);
  ck(total <= ex.max_voices(), `the roster asks for ${total} voices, kernel holds ${ex.max_voices()}`);
  ck(SPECIES.every((s) => s.toothRate === s.carrierHz),
    'every species is modelled as a resonant stridulator — strike rate equals carrier');
  ck(SPECIES.every((s) => s.teeth / s.toothRate > 0.002 && s.teeth / s.toothRate < 0.08),
    'every syllable is 2–80 ms, the range extant ensiferans occupy');
  ck(SPECIES.every((s) => s.splDb >= 75 && s.splDb <= 100),
    'every source level is 75–100 dB at 1 m, the range extant katydids occupy');
}

// A scene we can ask real questions of: one individual of each species, all at
// the same distance, so the only thing separating them is frequency.
const scene = () => {
  ex.init(48000);
  ex.clear_scene();
  ex.set_air(24, 80, 101.325, 0.6);
  ex.set_listener(0, 0, 0);
  SPECIES.forEach((s, i) => {
    ex.add_voice(30, 0, s.carrierHz, s.q, s.toothRate, s.teeth, s.sweep, s.jitter,
      s.syllables, s.gapS, s.periodS, s.splDb, i + 1);
  });
};

console.log('— the ultrasound trade, as the page presents it —');
{
  scene();
  const radii = (ear) => SPECIES.map((s, i) =>
    ex.voice_audible_radius_m(i, threshold(ear, s.carrierHz, s.carrierHz)));

  const ultra = SPECIES.findIndex((s) => s.carrierHz > 15000);
  ck(ultra >= 0, `the roster has an ultrasonic singer (${SPECIES[ultra]?.name})`);

  const human = radii(EARS.find((e) => e.id === 'human'));
  ck(SPECIES.every((s, i) => i === ultra || human[i] > human[ultra] * 3),
    `to a human the ultrasonic call reaches ${human[ultra].toFixed(0)} m; every other species reaches 3× further`);

  const mam = radii(EARS.find((e) => e.id === 'mammaliaform'));
  ck(mam[ultra] > human[ultra] * 2,
    `an early mammal hears it out to ${mam[ultra].toFixed(0)} m — the predator is not fooled by pitch alone`);

  const arch = radii(EARS.find((e) => e.id === 'archosaur'));
  ck(arch[ultra] < 5,
    `an archosaur hears it out to ${arch[ultra].toFixed(0)} m — against THAT ear it is a private channel`);

  const fem = radii(EARS.find((e) => e.id === 'female'));
  ck(fem[ultra] > 20 && fem[ultra] < mam[ultra],
    `a conspecific female hears it out to ${fem[ultra].toFixed(0)} m — enough to work, less than the mammal's reach`);
}

console.log('— the air matters, and non-monotonically —');
{
  // This block exists because the obvious assertion — "dry air is worse" — is
  // FALSE, and the first version of this test asserted it. Absorption peaks at
  // an intermediate humidity, because water vapour catalyses the vibrational
  // relaxation of oxygen and nitrogen and each relaxation absorbs hardest when
  // its relaxation frequency passes through the signal. The page says so; this
  // pins the claim to the kernel so the copy cannot drift away from the model.
  scene();
  const ultra = SPECIES.findIndex((s) => s.carrierHz > 15000);
  const f = SPECIES[ultra].carrierHz;
  const at = (rh) => ex.absorption_db_per_m(f, 24, rh, 101.325) * 1000;
  let peakRh = 5;
  for (let rh = 5; rh <= 100; rh++) if (at(rh) > at(peakRh)) peakRh = rh;
  ck(peakRh > 8 && peakRh < 97,
    `at ${(f / 1000).toFixed(0)} kHz and 24 °C the worst humidity is ${peakRh} % — a ridge, not a slope`);
  ck(at(peakRh) > at(100) * 1.5 && at(peakRh) > at(5) * 1.5,
    `and it is a real ridge: ${at(peakRh).toFixed(0)} dB/km there vs ${at(5).toFixed(0)} bone dry and ${at(100).toFixed(0)} saturated`);

  // The 5 kHz chorus has its own, lower, worst humidity — the ridge moves with
  // frequency, which is why the page recomputes it per species.
  const fLo = SPECIES.find((sp) => sp.carrierHz < 8000).carrierHz;
  const atLo = (rh) => ex.absorption_db_per_m(fLo, 24, rh, 101.325) * 1000;
  let peakLo = 5;
  for (let rh = 5; rh <= 100; rh++) if (atLo(rh) > atLo(peakLo)) peakLo = rh;
  ck(peakLo !== peakRh, `the ridge moves with frequency (${(fLo / 1000).toFixed(1)} kHz peaks at ${peakLo} %, not ${peakRh} %)`);

  // Foliage, by contrast, is monotone and always costs.
  const ear = EARS.find((e) => e.id === 'female');
  const thr = threshold(ear, f, f);
  ex.set_air(24, 80, 101.325, 0.0);
  const clearing = ex.voice_audible_radius_m(ultra, thr);
  ex.set_air(24, 80, 101.325, 1.0);
  const thicket = ex.voice_audible_radius_m(ultra, thr);
  ck(thicket < clearing, `dense canopy (${thicket.toFixed(0)} m) costs reach vs a clearing (${clearing.toFixed(0)} m)`);
}

console.log('— the detector moves pitch, never physics —');
{
  scene();
  const ultra = SPECIES.findIndex((s) => s.carrierHz > 15000);
  const before = [ex.voice_received_db(ultra), ex.voice_audible_radius_m(ultra, 20)];
  ex.set_detector(10, 14000);
  const after = [ex.voice_received_db(ultra), ex.voice_audible_radius_m(ultra, 20)];
  ck(before[0] === after[0] && before[1] === after[1],
    'level and audible radius are identical with the detector engaged');
  ex.set_detector(1, 14000);
}

console.log('— the kernel actually makes a sound outside a browser —');
{
  scene();
  // The page's default monitor level, +36 dB — see the note on set_master.
  ex.set_master(Math.pow(10, 36 / 20));
  ex.set_detector(1, 14000);
  let peak = 0, finite = true, frames = 0;
  for (let block = 0; block < 400; block++) {
    const ptr = ex.render(512);
    const buf = new Float32Array(ex.memory.buffer, ptr, 1024);
    for (const v of buf) {
      if (!Number.isFinite(v)) finite = false;
      if (Math.abs(v) > peak) peak = Math.abs(v);
    }
    frames += 512;
  }
  ck(finite, `${frames} frames rendered, every sample finite`);
  ck(peak > 0.02, `the chorus is audible (peak ${peak.toFixed(3)} of full scale)`);
  ck(peak <= 1, `and does not clip (peak ${peak.toFixed(3)})`);

  const duty = SPECIES.map((_, i) => ex.voice_duty(i));
  ck(duty.every((d) => d > 0.005 && d < 0.9),
    `every singer sings between 0.5 % and 90 % of the time (${(Math.min(...duty) * 100).toFixed(1)}–${(Math.max(...duty) * 100).toFixed(1)} %)`);
}

console.log('— the detector actually moves the ultrasound into the audible band —');
{
  // The strongest end-to-end check there is: render a scene containing ONLY
  // the ultrasonic singer, and look at where the energy lands. With the
  // detector off, the audible band must be essentially empty — if it is not,
  // either the bandlimited impulse train is aliasing or the resonator is
  // leaking, and the site would be presenting an audible buzz as "ultrasound".
  // With the detector on, the same call must appear an order of magnitude
  // down in frequency and nowhere near the original.
  const sp = SPECIES.find((x) => x.carrierHz > 15000);
  const build = () => {
    ex.init(48000);
    ex.clear_scene();
    ex.set_air(24, 80, 101.325, 0.3);
    ex.set_listener(0, 0, 0);
    ex.set_master(Math.pow(10, 40 / 20));
    ex.add_voice(3, 0, sp.carrierHz, sp.q, sp.toothRate, sp.teeth, sp.sweep, sp.jitter,
      sp.syllables, sp.gapS, sp.periodS, sp.splDb, 99);
  };
  const capture = (n) => {
    const out = new Float32Array(n);
    let w = 0;
    while (w < n) {
      const ptr = ex.render(512);
      const buf = new Float32Array(ex.memory.buffer, ptr, 1024);
      for (let f = 0; f < 512 && w < n; f++) out[w++] = buf[f * 2];
    }
    return out;
  };
  // Windowed DFT magnitude at one frequency — enough for a band comparison.
  const mag = (buf, f, sr = 48000) => {
    let re = 0, im = 0;
    for (let i = 0; i < buf.length; i++) {
      const win = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / buf.length);
      const v = buf[i] * win;
      re += v * Math.cos((2 * Math.PI * f * i) / sr);
      im += v * Math.sin((2 * Math.PI * f * i) / sr);
    }
    return Math.hypot(re, im) / buf.length;
  };
  const band = (buf, lo, hi, step = 250) => {
    let e = 0;
    for (let f = lo; f <= hi; f += step) e += mag(buf, f) ** 2;
    return e;
  };

  build();
  ex.set_detector(1, 14000);
  const dry = capture(48000);
  const dryUltra = band(dry, 19000, 23000);
  const dryAudible = band(dry, 300, 9000);
  ck(dryUltra > 0, `detector off: the call is there, up at ${(sp.carrierHz / 1000).toFixed(0)} kHz`);
  ck(dryAudible < dryUltra * 0.01,
    `detector off: the audible band is empty (${(dryAudible / dryUltra * 100).toFixed(3)} % of the carrier's energy) — no aliasing, no leak`);

  build();
  ex.set_detector(10, 14000);
  const wet = capture(48000);
  const shifted = band(wet, 1700, 2700);
  const original = band(wet, 19000, 23000);
  ck(shifted > original * 100,
    `detector on: the energy has moved to ~${(sp.carrierHz / 10000).toFixed(1)} kHz and left the ultrasonic band behind`);
  ck(shifted > dryAudible * 100, 'detector on: and it is now loud where a human can hear it');
  ex.set_detector(1, 14000);
}

console.log('— audiograms interpolate sanely —');
{
  const human = EARS.find((e) => e.id === 'human');
  ck(Math.abs(threshold(human, 1000) - 4) < 1e-9, 'a knot returns its own value exactly');
  const mid = threshold(human, 1500);
  ck(mid < 4 && mid > 1, `between knots it interpolates (1.5 kHz → ${mid.toFixed(2)} dB)`);
  ck(threshold(human, 40000) > threshold(human, 20000),
    'past the last knot hearing keeps getting worse rather than plateauing');
  const fem = EARS.find((e) => e.id === 'female');
  ck(threshold(fem, 5000, 5000) === fem.best, 'a female is most sensitive at her own carrier');
  ck(threshold(fem, 10000, 5000) === fem.best + fem.perOctave, 'and 22 dB worse one octave away');
}

console.log('— a plot number is a permalink —');
{
  const a = JSON.stringify(buildPlot(7));
  const b = JSON.stringify(buildPlot(7));
  ck(a === b, 'the same seed grows the same forest');
  ck(a !== JSON.stringify(buildPlot(8)), 'a different seed grows a different one');
  const p = buildPlot(7);
  ck(p.voices.length === SPECIES.reduce((n, s) => n + s.count, 0), `${p.voices.length} singers placed`);
  ck(p.voices.every((v) => Math.abs(v.x) <= p.half + 1e-6 && Math.abs(v.y) <= p.half + 1e-6),
    'every singer is inside the plot');
  ck(p.voices.every((v) => v.seed > 0 && Number.isFinite(v.carrierHz) && v.carrierHz > 0),
    'every voice is fully parameterised');
}

console.log(failures ? `\n${failures} failure(s)` : '\nall good');
process.exit(failures ? 1 : 0);

// Node selftest for unit/lib/chroma.js — run before touching the engine:
//   node unit/lib/chroma.selftest.mjs
//
// The claims worth pinning are physical, so the known answers come from
// outside: Wien's displacement law for the blackbody peaks, D65 for what the
// emitter model must mix back to, and equal temperament for the note naming.
import K from './chroma.js';
import S from './spectrum.js';

let fail = 0;
const approx = (got, want, label, tol = 1e-6) => {
  const rel = Math.abs(got - want) / (Math.abs(want) || 1);
  if (!(rel <= tol)) { console.error(`✗ ${label}: got ${got}, want ${want} (rel ${rel.toExponential(2)})`); fail++; }
};
const near = (got, want, label, abs) => {
  if (!(Math.abs(got - want) <= abs)) { console.error(`✗ ${label}: got ${got}, want ${want} ±${abs}`); fail++; }
};
const eq = (got, want, label) => { if (got !== want) { console.error(`✗ ${label}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`); fail++; } };
const ok = (cond, label) => { if (!cond) { console.error(`✗ ${label}`); fail++; } };

// ── the mapping ──
near(K.toAudio(780), 349.56, '780 nm → Hz', 0.1);
near(K.toAudio(380), 717.48, '380 nm → Hz', 0.1);
approx(K.fromAudio(K.toAudio(632.8)), 632.8, 'nm → Hz → nm round trip', 1e-12);
const r = K.range();
near(r.octaves, 1.0374, 'the visible band is ~1.04 octaves', 1e-3);
ok(r.lo > 20 && r.hi < 20000, 'the shifted band is audible');
ok(r.lo < r.hi, 'red is the low end');
// the shift is what puts it there: one octave either way and it is still audible,
// but 2^40 is the one that lands mid-range
near(K.toAudio(780, 41), 174.78, 'a lower shift halves it', 0.1);

// ── note naming, against equal temperament ──
eq(K.note(440).name, 'A', 'A440 is an A');
eq(K.note(440).octave, 4, 'A440 is in octave 4');
eq(K.note(440).cents, 0, 'A440 is dead in tune');
eq(K.note(880).octave, 5, 'an octave up');
eq(K.note(261.6255653).name, 'C', 'middle C');
eq(K.note(K.toAudio(780)).name, 'F', 'the red end lands on F');
near(K.note(K.toAudio(780)).cents, 2, 'and lands almost dead on it', 1);
eq(K.note(440 * Math.pow(2, 7 / 12)).name, 'E', 'a fifth above A is E');

// ── the stretch, which is a deliberate lie and must behave like one ──
const anchor = K.toAudio(S.VISIBLE.max);
approx(K.stretch(600, 1), 600, 'k=1 changes nothing', 1e-12);
approx(K.stretch(anchor, 3), anchor, 'the anchor never moves', 1e-9);
const span = (k) => K.cents(K.stretch(K.toAudio(780), k), K.stretch(K.toAudio(380), k));
near(span(2) / span(1), 2, 'k=2 doubles the span in cents', 1e-6);
near(span(1), 1245, 'the honest span is 1245 cents', 2);

// ── the emitter model must survive a trip back through the eye ──
const white = K.chromaticityOf(K.spdDisplay({ r: 1, g: 1, b: 1 }));
near(white.x, 0.3127, 'emitters mix to D65 x', 0.006);
near(white.y, 0.3290, 'emitters mix to D65 y', 0.006);
// each emitter against the sRGB primary it stands for
const prim = { r: [0.64, 0.33], g: [0.30, 0.60], b: [0.15, 0.06] };
for (const p of K.PRIMARIES) {
  const c = K.chromaticityOf(K.spdDisplay({ r: 0, g: 0, b: 0, [p.key]: 1 }));
  const d = Math.hypot(c.x - prim[p.key][0], c.y - prim[p.key][1]);
  // Red and green are the loose ones, and on purpose. sRGB's primaries sit
  // INSIDE the spectral locus, so a narrow emitter overshoots them — it is
  // more saturated than the standard asks for. That is not a fitting error,
  // it is why wide-gamut displays exist, and the page says it out loud.
  ok(d < (p.key === 'b' ? 0.015 : 0.05), `${p.key} emitter is near its sRGB primary (off by ${d.toFixed(4)})`);
  const pure = S.chromaticity(p.peak), W = S.WHITE;
  const reach = (q) => Math.hypot(q.x - W.x, q.y - W.y);
  ok(reach(c) <= reach(pure) + 1e-9, `the ${p.key} emitter is no purer than its own wavelength`);
}

// ── blackbody, against Wien's displacement law ──
for (const T of [4200, 5000, 5800, 6500, 7200]) {
  const l = K.lobes(K.spdBlackbody(T));
  eq(l.length, 1, `blackbody ${T}K has one hump`);
  near(l[0].nm, K.wienPeak(T), `blackbody ${T}K peaks where Wien says`, 3);
}
approx(K.wienPeak(5772), 2.897771955e6 / 5772, 'Wien constant', 1e-12);
// hotter is bluer
ok(K.lobes(K.spdBlackbody(7000))[0].nm < K.lobes(K.spdBlackbody(4500))[0].nm, 'hotter peaks bluer');

// ── the bank ──
const bank = K.bank({ count: 48 });
eq(bank.length, 48, 'bank size');
ok(bank.every((b, i) => i === 0 || b.hz > bank[i - 1].hz), 'bank ascends');
ok(bank[0].nm > bank[47].nm, 'low frequency is the red end');
// log-spaced: every neighbouring gap is the same number of cents
const gaps = bank.slice(1).map((b, i) => K.cents(bank[i].hz, b.hz));
ok(Math.max(...gaps) - Math.min(...gaps) < 1e-6, 'bank is evenly log-spaced');
near(gaps[0], 1245 / 48, 'bank spacing is the band divided by the count', 0.2);

// ── gains ──
const g = K.gains(K.spdDisplay({ r: 1, g: 1, b: 1 }), bank);
near(Math.max(...g), 1, 'gains normalise to a peak of 1', 1e-9);
ok(g.every(v => v >= 0), 'no negative gain');
ok(K.gains(() => 0, bank).every(v => v === 0), 'a dark spectrum is silent');

// ── roughness ──
const rough = (spd, count = 48) => K.roughness(K.partials(spd, K.bank({ count })));
ok(rough(K.spdLaser(532)) < 0.02, 'one wavelength is smooth');
ok(rough(K.spdDisplay({ r: 1, g: 1, b: 1 })) > 3 * rough(K.spdLaser(532)), 'a screen colour is rougher than a laser');
ok(rough(K.spdEqual()) > 0.02, 'a flat spectrum is a rough cluster');
// The point of the fixed bank: for a broad spectrum the score is a property of
// the colour, not of how many oscillators were used to measure it.
for (const [name, spd] of [['screen white', K.spdDisplay({ r: 1, g: 1, b: 1 })], ['equal energy', K.spdEqual()], ['6500 K', K.spdBlackbody(6500)]]) {
  const a = rough(spd, 48), b = rough(spd, 192);
  ok(Math.abs(a - b) < 0.005, `${name} roughness is bank-independent (${a.toFixed(4)} vs ${b.toFixed(4)})`);
}
eq(K.roughness([]), 0, 'silence has no roughness');
eq(K.roughness([{ hz: 440, gain: 1 }]), 0, 'a single partial has nothing to beat against');

// ── lobes: what a spectrum's humps are ──
const wl = K.lobes(K.spdDisplay({ r: 1, g: 1, b: 1 }));
eq(wl.length, 3, 'screen white has three humps');
for (const p of K.PRIMARIES) {
  ok(wl.some(l => Math.abs(l.nm - p.peak) < 4), `a hump sits on the ${p.key} emitter`);
}
eq(K.lobes(K.spdDisplay({ r: 1, g: 0, b: 0 })).length, 1, 'screen red has one hump');
eq(K.lobes(K.spdEqual()).length, 0, 'a flat spectrum has no hump at all');
// A cool filament only slopes across the visible band — the finding is the edge.
const warm = K.lobes(K.spdBlackbody(2700));
eq(warm.length, 1, 'a 2700 K bulb reports one');
eq(warm[0].edge, true, 'and flags it as an edge, not a peak');
near(warm[0].nm, S.VISIBLE.max, 'leaning on the red end', 1);

// ── the payoff: magenta has no wavelength, but it has two ──
const mag = K.chord(K.spdDisplay({ r: 1, g: 0, b: 1 }));
eq(mag.length, 2, 'magenta is two humps');
ok(mag[0].hz < mag[1].hz, 'reported low note first');
// 554 cents: a perfect fourth is 500, a tritone 600. Magenta lands between
// them — wider than a fourth, and not a named interval. Do not round it into
// one; the whole page is about not tidying the physics.
near(K.cents(mag[0].hz, mag[1].hz), 554, 'a wide fourth apart', 20);
ok(mag.every(c => /^#[0-9a-f]{6}$/.test(c.color)), 'each hump carries its colour');
ok(mag.every(c => c.note && c.note.label), 'each hump is named');

// ── metamers: identical to the eye, different to the ear ──
const m = K.metamers();
ok(m.smooth.spd, 'a positive smooth metamer exists');
const cs = K.chromaticityOf(m.screen.spd), cd = K.chromaticityOf(m.smooth.spd);
// Not "close" — solved. Anything above rounding error means the solve is wrong.
ok(Math.hypot(cs.x - cd.x, cs.y - cd.y) < 1e-9, 'the pair is an EXACT metamer');
const zs = K.xyz(m.screen.spd), zd = K.xyz(m.smooth.spd);
for (let i = 0; i < 3; i++) approx(zd[i], zs[i], 'metamer XYZ component ' + i, 1e-9);
// ...and yet
eq(K.lobes(m.screen.spd).length, 3, 'the screen is three humps');
eq(K.lobes(m.smooth.spd).length, 1, 'the smooth one is a single hill');
ok(K.roughness(K.partials(m.screen.spd, bank)) > K.roughness(K.partials(m.smooth.spd, bank)),
   'and the screen is the rougher of the two');
// no negative light anywhere
for (let nm = 380; nm <= 780; nm += 5) ok(m.smooth.spd(nm) >= 0, `metamer is positive at ${nm} nm`);
// a blackbody cannot do this job, which is why the basis solve exists
let bestT = null;
for (let T = 4000; T <= 12000; T += 50) {
  const c = K.chromaticityOf(K.spdBlackbody(T));
  const d = Math.hypot(c.x - cs.x, c.y - cs.y);
  if (bestT === null || d < bestT) bestT = d;
}
ok(bestT > 0.004, `no blackbody matches screen white (closest is ${bestT.toFixed(4)} off)`);

if (fail) { console.error(`\n${fail} check(s) failed`); process.exit(1); }
console.log('✓ unit/lib/chroma.js — all checks passed');

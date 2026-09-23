// sand.selftest.mjs — node, over the ABI, against the module being shipped.
//
// The Rust tests check the physics and the mathematics. This checks the seam
// between Rust and the page: that every export the page calls exists and
// behaves, that a pointer read after a step is not stale, and that the two
// headline results survive the trip through wasm unchanged.
//
// Run it after touching the engine, engine.js or app.js:
//   node henderhead/sand/sand.selftest.mjs

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
let failures = 0;
let checks = 0;

function group(name) {
  console.log('\n' + name);
}
function ok(name, cond, detail = '') {
  checks++;
  if (cond) {
    console.log('  ✓ ' + name + (detail ? '  ' + detail : ''));
  } else {
    failures++;
    console.log('  ✗ ' + name + (detail ? '  ' + detail : ''));
  }
}
const close = (a, b, tol) => Number.isFinite(a) && Math.abs(a - b) <= tol;

const KIND = { POINT_SOURCE: 0, POINT_SINK: 1, LINE_SOURCE: 2, LINE_SINK: 3 };
const CONIC = ['circle', 'ellipse', 'parabola', 'hyperbola', 'line', 'degenerate'];

const bytes = await readFile(join(here, 'sandconic.wasm'));
const { instance } = await WebAssembly.instantiate(bytes, {});
const e = instance.exports;

// ---------------------------------------------------------------- the ABI --

group('the module is what the page expects');
ok('no imports, so no shim is needed', WebAssembly.Module.imports(new WebAssembly.Module(bytes)).length === 0);
const NEEDED = [
  'init', 'clear_features', 'add_feature', 'move_feature', 'set_feature_normal',
  'set_feature_rate', 'set_repose', 'repose_deg', 'set_seam_pair', 'reset',
  'flood', 'settle', 'step', 'measure', 'seam_ptr', 'seam_len', 'height_ptr',
  'height_len', 'labels_ptr', 'shade', 'max_height', 'total_mass', 'poured',
  'drained', 'steps', 'oversteep', 'conic_type', 'conic_eccentricity',
  'conic_rms', 'conic_coeff', 'conic_focus', 'conic_center', 'focus_error',
  'focal_constancy_pct', 'predicted_type', 'feature_count', 'feature_kind',
  'feature_xy', 'set_relax', 'grid_n',
];
const missing = NEEDED.filter((k) => typeof e[k] !== 'function');
ok('every export the page calls is present', missing.length === 0, missing.length ? 'missing: ' + missing.join(', ') : '');

// ------------------------------------------------------------- his ellipse --

group('his construction: a pour point and a hole');
// Same plate and same charge as the engine's own ellipse test. Matching it
// matters: this file's job is to check that a result survives the trip across
// the wasm boundary, not to explore a different corner of the parameter space,
// and an earlier version that poured a bigger charge onto a bigger plate in
// bigger helpings got a measurably worse curve out of more sand — the coarser
// helpings leave the surface bumpier, and the seam tracer keeps fewer of it.
const N = 113;

// r1 + r2 about an arbitrary pair of points, as a percentage of its mean. The
// engine's own `focal_constancy_pct` takes feature indices; this takes
// coordinates, so the same curve can be measured about the pile's peak as well
// as about the spout — which is the comparison that says what the scatter is.
function constancyAbout(e, ax, ay, bx, by) {
  const s = new Float64Array(e.memory.buffer, e.seam_ptr(), e.seam_len());
  const v = [];
  for (let i = 0; i < s.length; i += 2) {
    v.push(Math.hypot(s[i] - ax, s[i + 1] - ay) + Math.hypot(s[i] - bx, s[i + 1] - by));
  }
  const m = v.reduce((p, q) => p + q, 0) / v.length;
  const sd = Math.sqrt(v.reduce((p, q) => p + (q - m) * (q - m), 0) / v.length);
  return (sd / m) * 100;
}

// Where the pile's peak actually is, which is not where the sand is poured.
function apexOf(e, n) {
  const hh = new Float64Array(e.memory.buffer, e.height_ptr(), e.height_len());
  const max = e.max_height();
  let sx = 0, sy = 0, sw = 0;
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      if (hh[y * n + x] > max * 0.99) { sx += x; sy += y; sw++; }
    }
  }
  return sw ? [sx / sw, sy / sw] : [NaN, NaN];
}

e.init(N, 34);
ok('the plate is the size asked for', e.grid_n() === N);
ok('the repose angle survives the round trip', close(e.repose_deg(), 34, 1e-9));

const PX = 50, PY = 62, HX = 62, HY = 51;
e.clear_features();
const src = e.add_feature(KIND.POINT_SOURCE, PX, PY, 0, 1, 160);
const sink = e.add_feature(KIND.POINT_SINK, HX, HY, 0, 1, 0);
ok('two features, indexed in order', src === 0 && sink === 1 && e.feature_count() === 2);
ok('their kinds read back', e.feature_kind(0) === KIND.POINT_SOURCE && e.feature_kind(1) === KIND.POINT_SINK);
ok('their positions read back', close(e.feature_xy(0, 0), PX, 1e-9) && close(e.feature_xy(1, 1), HY, 1e-9));
ok('the prediction is an ellipse before a grain has moved', CONIC[e.predicted_type()] === 'ellipse');

// Fewer, bigger helpings than the page pours, for the same total charge. The
// settled shape is an attractor of the toppling rule rather than an artefact
// of the schedule — the engine has a test for exactly that — so this is the
// same sand for a third of the passes, which matters now that a pass checks
// twenty-four directions instead of eight.
for (let i = 0; i < 60; i++) {
  e.step(1);
  e.settle(0.04, 400);
}
e.settle(0.04, 1200);

ok('sand accumulated', e.max_height() > 5, `apex ${e.max_height().toFixed(1)}`);
ok('the books balance', close(e.poured() - e.drained(), e.total_mass(), 1e-6 * Math.max(1, e.poured())),
  `poured ${e.poured().toFixed(0)} − drained ${e.drained().toFixed(0)} vs ${e.total_mass().toFixed(0)} held`);
ok('nothing is left standing too steep', e.oversteep() < 0.02, `${(e.oversteep() * 100).toFixed(2)}%`);

const found = e.measure();
ok('a curve was found', found > 12, `${found} points`);

const sep = Math.hypot(PX - HX, PY - HY);
const pct = e.focal_constancy_pct(0, 1, 1);
// 12%, not 6%: the tracer now returns the whole closed curve rather than a
// quadrant of it, and the whole curve samples the pile's drift away from the
// pour point. The reading got worse and the curve got better — see
// `the_focus_is_the_pile_apex_not_quite_the_pour_point` in the Rust suite, and
// the apex check a few lines below, which is what keeps this honest.
ok('r₁ + r₂ is constant around it', pct < 12, `varies by ${pct.toFixed(2)}%`);

const seam = new Float64Array(e.memory.buffer, e.seam_ptr(), e.seam_len());
let acc = 0;
for (let i = 0; i < seam.length; i += 2) {
  acc += Math.hypot(seam[i] - PX, seam[i + 1] - PY) + Math.hypot(seam[i] - HX, seam[i + 1] - HY);
}
const twoA = acc / (seam.length / 2);
const eMeas = sep / twoA;
ok('the measured eccentricity is near his 0.737', close(eMeas, 0.737, 0.09),
  `2c/2a = ${eMeas.toFixed(3)} (2a = ${twoA.toFixed(2)}, 2c = ${sep.toFixed(2)})`);
ok('the blind fit agrees it is an ellipse', CONIC[e.conic_type(0.08)] === 'ellipse',
  `it says ${CONIC[e.conic_type(0.08)]}`);
ok('and agrees roughly on how eccentric', close(e.conic_eccentricity(0.08), eMeas, 0.12),
  `fit ${e.conic_eccentricity(0.08).toFixed(3)} vs measured ${eMeas.toFixed(3)}`);
ok('the fitted centre sits between the two features',
  close(e.conic_center(0), (PX + HX) / 2, 6) && close(e.conic_center(1), (PY + HY) / 2, 6),
  `(${e.conic_center(0).toFixed(1)}, ${e.conic_center(1).toFixed(1)})`);

// The two readings the page gained when the tracer stopped throwing the curve
// away. A fitted conic means nothing off a short arc, so the arc is reported;
// and the pile's peak is not the pour point, which is where most of the
// scatter above comes from.
const bearings = [];
for (let i = 0; i < seam.length; i += 2) {
  bearings.push(Math.atan2(seam[i + 1] - (PY + HY) / 2, seam[i] - (PX + HX) / 2));
}
bearings.sort((u, v) => u - v);
let gap = bearings[0] + 2 * Math.PI - bearings[bearings.length - 1];
for (let i = 1; i < bearings.length; i++) gap = Math.max(gap, bearings[i] - bearings[i - 1]);
const covered = ((2 * Math.PI - gap) * 180) / Math.PI;
ok('the traced curve closes, so the fit is determined', covered > 270,
  `${covered.toFixed(0)}° of a closed curve`);

const hv = new Float64Array(e.memory.buffer, e.height_ptr(), e.height_len());
const apexH = e.max_height();
let sx = 0, sy = 0, sw = 0;
for (let y = 0; y < N; y++) {
  for (let x = 0; x < N; x++) {
    if (hv[y * N + x] > apexH * 0.99) { sx += x; sy += y; sw++; }
  }
}
const drift = Math.hypot(sx / sw - PX, sy / sw - PY);
// It drifts because the hole eats the sand on its own side. Away from the
// hole is the direction the explanation predicts; the other way would mean
// the explanation is wrong.
const away = ((sx / sw - PX) * (PX - HX) + (sy / sw - PY) * (PY - HY)) / (drift * sep);
ok('the pile peaks away from the hole, not on the pour point', drift > 1 && away > 0.7,
  `${drift.toFixed(1)} cells from the pour, ${(Math.acos(Math.min(1, away)) * 180 / Math.PI).toFixed(0)}° off the away-from-hole line`);

// ------------------------------------------------------------ the parabola --

group('a hole against a slot: the only route to e = 1');
e.init(145, 34);
e.clear_features();
e.add_feature(KIND.POINT_SINK, 72, 95, 0, 1, 0);
e.add_feature(KIND.LINE_SINK, 72, 44, 0, 1, 0);
ok('the prediction is a parabola', CONIC[e.predicted_type()] === 'parabola');
// Deep enough that both funnels clear the plate under the curve, and no
// deeper: the settle has to propagate a crater rim depth/k cells outwards, so
// flooding twice as deep costs twice the passes for nothing.
//
// The tolerance is 0.04 rather than 1e-2 because the drains are *pinned*
// cells, and the worst slope overshoot on the plate never quite stops
// twitching there however long it runs — at 1e-2 this case was still going
// after five thousand passes with the sand visibly settled, 0.00% of it
// standing too steep and the total mass changing in the fourth decimal.
// 0.04 is 6% of tan(repose), which is below anything the curve can see.
e.flood(24);
for (let i = 0; i < 20 && e.settle(0.04, 300) >= 0.04; i++);
const pFound = e.measure();
ok('a curve was found', pFound > 12, `${pFound} points`);
// The focus-directrix ratio below is the robust measurement; the fitted
// eccentricity of a parabola is numerically delicate — the same curve a few
// cells longer or shorter has come back as 1.00, 31 and 39 — so this asks
// only that the fit agrees on the *type*, which rests on the discriminant
// rather than on inverting a near-singular form.
ok('the blind fit calls it a parabola', CONIC[e.conic_type(0.12)] === 'parabola',
  `it says ${CONIC[e.conic_type(0.12)]}, e = ${e.conic_eccentricity(0.12).toFixed(3)}`);

const ps = new Float64Array(e.memory.buffer, e.seam_ptr(), e.seam_len());
let ratio = 0;
let rn = 0;
for (let i = 0; i < ps.length; i += 2) {
  const dFocus = Math.hypot(ps[i] - 72, ps[i + 1] - 95);
  const dLine = Math.abs(ps[i + 1] - 44);
  if (dLine > 1e-6) { ratio += dFocus / dLine; rn++; }
}
ok('distance to the hole equals distance to the slot', rn > 0 && close(ratio / rn, 1, 0.15),
  `ratio ${(ratio / Math.max(rn, 1)).toFixed(3)}`);

// ----------------------------------------------------------- the circle --

group('the hole under the pour point: foci merged');
e.init(N, 34);
e.clear_features();
e.add_feature(KIND.POINT_SOURCE, 56, 48, 0, 1, 160);
e.add_feature(KIND.POINT_SINK, 56, 62, 0, 1, 0);
ok('the prediction is still an ellipse while they are apart', CONIC[e.predicted_type()] === 'ellipse');
for (let i = 0; i < 60; i++) { e.step(1); e.settle(0.04, 400); }
e.settle(0.04, 1200);
const cFound = e.measure();
ok('a curve was found', cFound > 12, `${cFound} points`);
const cpct = e.focal_constancy_pct(0, 1, 1);
// Loosest of the three thresholds, and for a reason: with the foci close
// together the curve is small, so the pile's drift away from the pour point is
// a bigger fraction of it. Hence both readings — about the spout, which is the
// claim, and about the peak, which is where the focus actually is. The second
// being much the tighter is what says the first is offset and not vague.
const [cax, cay] = apexOf(e, N);
const cApex = constancyAbout(e, cax, cay, 56, 62);
ok('r\u2081 + r\u2082 is constant around it', cpct < 14, `varies by ${cpct.toFixed(2)}%`);
ok('and much more so about the pile\'s peak than about the spout', cApex < cpct * 0.8,
  `${cApex.toFixed(2)}% about the peak vs ${cpct.toFixed(2)}% about the spout`);
e.move_feature(1, 56, 48);
ok('with the hole moved under the pour, the prediction becomes a circle',
  CONIC[e.predicted_type()] === 'circle');

// NOT TESTED HERE, deliberately: anything measured between two drains. The
// engine's own tests say why at length -- both drains lie in nearly the same
// direction from anywhere out along the axis beyond them, so the seam tracer
// finds wedges instead of the curve. The page ships no preset for those cases
// and says so in its own prose.

// ------------------------------------------------------- memory discipline --

group('views into wasm memory');
e.init(97, 34);
e.clear_features();
e.add_feature(KIND.POINT_SOURCE, 48, 48, 0, 1, 160);
for (let i = 0; i < 20; i++) { e.step(1); e.settle(0.04, 120); }
const shPtr = e.shade(2.2, -0.5, -0.7, 0.9);
const shade = new Uint8Array(e.memory.buffer, shPtr, 97 * 97);
ok('shade is one byte per cell', shade.length === 97 * 97);
ok('bare plate reads zero and sand does not',
  shade[0] === 0 && shade[48 * 97 + 48] > 0,
  `corner ${shade[0]}, centre ${shade[48 * 97 + 48]}`);
const h = new Float64Array(e.memory.buffer, e.height_ptr(), e.height_len());
ok('the height field is the whole plate', h.length === 97 * 97);
ok('the labels array is the whole plate',
  new Int32Array(e.memory.buffer, e.labels_ptr(), 97 * 97).length === 97 * 97);

// the repose angle changes the pile's size, not which points are its foci
group('the repose angle is not a focus');
const sizes = [];
for (const deg of [28, 34, 40]) {
  e.init(113, deg);
  e.clear_features();
  e.add_feature(KIND.POINT_SOURCE, 50, 62, 0, 1, 400);
  e.add_feature(KIND.POINT_SINK, 62, 51, 0, 1, 0);
  for (let i = 0; i < 24; i++) { e.step(1); e.settle(0.04, 400); }
  e.settle(0.04, 1200);
  if (e.measure() < 8) { sizes.push(NaN); continue; }
  // Measured about the two features, which is the claim as he states it. The
  // pile's peak is a few cells off the spout at every angle, and that offset —
  // not any vagueness in the curve — is most of what this number is.
  const p = e.focal_constancy_pct(0, 1, 1);
  const [rax, ray] = apexOf(e, 113);
  const pApex = constancyAbout(e, rax, ray, 62, 51);
  ok(`at ${deg}° the two features are still the foci`, p < 16,
    `r₁+r₂ varies by ${p.toFixed(2)}% about the spout, ${pApex.toFixed(2)}% about the peak`);
  const s = new Float64Array(e.memory.buffer, e.seam_ptr(), e.seam_len());
  let a2 = 0;
  for (let i = 0; i < s.length; i += 2) {
    a2 += Math.hypot(s[i] - 50, s[i + 1] - 62) + Math.hypot(s[i] - 62, s[i + 1] - 51);
  }
  sizes.push(a2 / (s.length / 2));
}
ok('but the size of the curve does respond to it',
  Math.abs(sizes[0] - sizes[2]) > 0.5,
  `2a: ${sizes.map((v) => (Number.isFinite(v) ? v.toFixed(2) : '—')).join(', ')}`);

console.log('');
if (failures) {
  console.log(`${failures} of ${checks} checks FAILED.`);
  process.exit(1);
}
console.log('All checks passed.');

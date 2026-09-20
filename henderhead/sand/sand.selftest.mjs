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
const N = 145;
e.init(N, 34);
ok('the plate is the size asked for', e.grid_n() === N);
ok('the repose angle survives the round trip', close(e.repose_deg(), 34, 1e-9));

const PX = 64, PY = 80, HX = 80, HY = 66;
e.clear_features();
const src = e.add_feature(KIND.POINT_SOURCE, PX, PY, 0, 1, 160);
const sink = e.add_feature(KIND.POINT_SINK, HX, HY, 0, 1, 0);
ok('two features, indexed in order', src === 0 && sink === 1 && e.feature_count() === 2);
ok('their kinds read back', e.feature_kind(0) === KIND.POINT_SOURCE && e.feature_kind(1) === KIND.POINT_SINK);
ok('their positions read back', close(e.feature_xy(0, 0), PX, 1e-9) && close(e.feature_xy(1, 1), HY, 1e-9));
ok('the prediction is an ellipse before a grain has moved', CONIC[e.predicted_type()] === 'ellipse');

for (let i = 0; i < 130; i++) {
  e.step(1);
  e.settle(1e-2, 200);
}
e.settle(1e-2, 4000);

ok('sand accumulated', e.max_height() > 5, `apex ${e.max_height().toFixed(1)}`);
ok('the books balance', close(e.poured() - e.drained(), e.total_mass(), 1e-6 * Math.max(1, e.poured())),
  `poured ${e.poured().toFixed(0)} − drained ${e.drained().toFixed(0)} vs ${e.total_mass().toFixed(0)} held`);
ok('nothing is left standing too steep', e.oversteep() < 0.02, `${(e.oversteep() * 100).toFixed(2)}%`);

const found = e.measure();
ok('a curve was found', found > 12, `${found} points`);

const sep = Math.hypot(PX - HX, PY - HY);
const pct = e.focal_constancy_pct(0, 1, 1);
ok('r₁ + r₂ is constant around it', pct < 6, `varies by ${pct.toFixed(2)}%`);

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
ok('and agrees roughly on how eccentric', close(e.conic_eccentricity(), eMeas, 0.12),
  `fit ${e.conic_eccentricity().toFixed(3)} vs measured ${eMeas.toFixed(3)}`);
ok('the fitted centre sits between the two features',
  close(e.conic_center(0), (PX + HX) / 2, 6) && close(e.conic_center(1), (PY + HY) / 2, 6),
  `(${e.conic_center(0).toFixed(1)}, ${e.conic_center(1).toFixed(1)})`);

// ------------------------------------------------------------ the parabola --

group('a hole against a slot: the only route to e = 1');
e.init(N, 34);
e.clear_features();
e.add_feature(KIND.POINT_SINK, 72, 95, 0, 1, 0);
e.add_feature(KIND.LINE_SINK, 72, 44, 0, 1, 0);
ok('the prediction is a parabola', CONIC[e.predicted_type()] === 'parabola');
e.flood(38);
e.settle(1e-2, 20000);
const pFound = e.measure();
ok('a curve was found', pFound > 12, `${pFound} points`);
ok('its eccentricity is 1', close(e.conic_eccentricity(), 1, 0.15), `e = ${e.conic_eccentricity().toFixed(3)}`);

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
e.add_feature(KIND.POINT_SOURCE, 72, 62, 0, 1, 160);
e.add_feature(KIND.POINT_SINK, 72, 82, 0, 1, 0);
ok('the prediction is still an ellipse while they are apart', CONIC[e.predicted_type()] === 'ellipse');
for (let i = 0; i < 130; i++) { e.step(1); e.settle(1e-2, 200); }
e.settle(1e-2, 4000);
const cFound = e.measure();
ok('a curve was found', cFound > 12, `${cFound} points`);
const cpct = e.focal_constancy_pct(0, 1, 1);
ok('r\u2081 + r\u2082 is constant around it', cpct < 6, `varies by ${cpct.toFixed(2)}%`);
e.move_feature(1, 72, 62);
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
for (let i = 0; i < 20; i++) { e.step(1); e.settle(1e-2, 120); }
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
  e.add_feature(KIND.POINT_SOURCE, 50, 62, 0, 1, 160);
  e.add_feature(KIND.POINT_SINK, 62, 51, 0, 1, 0);
  for (let i = 0; i < 60; i++) { e.step(1); e.settle(1e-2, 200); }
  e.settle(1e-2, 3000);
  if (e.measure() < 8) { sizes.push(NaN); continue; }
  const p = e.focal_constancy_pct(0, 1, 1);
  ok(`at ${deg}° the two features are still the foci`, p < 6, `r₁+r₂ varies by ${p.toFixed(2)}%`);
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

// misfortune.selftest.mjs — the wheel lands where it says, and the data keeps its rules.
// node misfortune/misfortune.selftest.mjs
import { wedgeAt, step, simulate, launchSpeed, TAU, mod } from './wheel.js';
import { WEDGES, ORDER, COLORS } from './data.js';

let fails = 0, passes = 0;
const ok = (c, m) => { if (c) passes++; else { fails++; console.error('✗ ' + m); } };

const n = ORDER.length;
const byId = new Map(WEDGES.map((w) => [w.id, w]));

// ── data rules ───────────────────────────────────────────────────────────────
ok(n === 24, `24 wedges on the wheel (got ${n})`);
ok(new Set(ORDER).size === n, 'no wedge appears twice');
ok(ORDER.every((id) => byId.has(id)), 'every wedge in ORDER exists');
ok(WEDGES.every((w) => ORDER.includes(w.id)), 'every wedge is on the wheel');
for (const w of WEDGES) {
  ok(['real', 'fiction', 'special'].includes(w.kind), `${w.id}: known kind`);
  ok(w.label.split('\n').every((l) => [...l].length <= 11), `${w.id}: label lines ≤ 11 chars`);
  ok(w.title && w.line, `${w.id}: has a title and a line`);
  if (w.kind === 'real') {
    ok(/^https:\/\//.test(w.url) && w.source && w.date, `${w.id}: a real wedge is dated and sourced`);
    ok(w.stamp === 'ALREADY HAPPENED', `${w.id}: real wedges are stamped`);
  } else {
    ok(!w.url, `${w.id}: fiction and furniture carry no source (nothing to mistake for news)`);
  }
}
// no run of three of the same kind round the wheel
let worst = 0;
for (let i = 0; i < n; i++) {
  let run = 1;
  while (run < n && byId.get(ORDER[(i + run) % n]).kind === byId.get(ORDER[i]).kind) run++;
  worst = Math.max(worst, run);
}
ok(worst <= 3, `no more than three of a kind in a row (got ${worst})`);
ok(Object.keys(COLORS.special).every((id) => byId.get(id)?.kind === 'special'), 'special colours name special wedges');

// ── geometry ─────────────────────────────────────────────────────────────────
const w = TAU / n;
ok(wedgeAt(0, n) === 0, 'at rest, wedge 0 is under the needle');
ok(wedgeAt(-w * 0.5, n) === 0, 'turned back half a wedge: still wedge 0');
ok(wedgeAt(-w * 1.5, n) === 1, 'turned back one and a half: wedge 1');
ok(wedgeAt(w * 0.5, n) === n - 1, 'turned forward half a wedge: the last wedge');
ok(wedgeAt(TAU * 7 - w * 3.2, n) === 3, 'full turns do not matter');

// ── physics ──────────────────────────────────────────────────────────────────
let seed = 12345;
const rand = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
const counts = new Array(n).fill(0);
let minT = Infinity, maxT = 0, minPegs = Infinity;
for (let k = 0; k < 600; k++) {
  const r = simulate(rand() * TAU, launchSpeed(rand), n);
  counts[r.index]++;
  minT = Math.min(minT, r.seconds); maxT = Math.max(maxT, r.seconds);
  minPegs = Math.min(minPegs, r.pegs);
  if (k < 50) ok(r.index === wedgeAt(r.theta, n), 'landing index matches the wedge under the needle');
}
ok(counts.every((c) => c > 0), `every wedge is reachable (min ${Math.min(...counts)} of 600)`);
ok(Math.max(...counts) < 600 / n * 2.6, `no wedge is heavily favoured (max ${Math.max(...counts)})`);
ok(minT > 3 && maxT < 16, `a spin lasts 3–16 s (got ${minT.toFixed(1)}–${maxT.toFixed(1)})`);
ok(minPegs >= n, `even a weak spin passes a full turn of pegs (min ${minPegs})`);

// pegs click exactly once per boundary on a slow pass
const s = { theta: -w * 0.3, omega: 1.2, needle: 0, needleV: 0 };
let clicks = 0;
const t0 = mod(-s.theta, TAU);
for (let i = 0; i < 2000 && s.omega !== 0; i++) clicks += step(s, 1 / 240, n);
const turned = Math.abs(mod(-s.theta, TAU) - t0) / w;
ok(clicks >= 1 && clicks <= Math.ceil(turned) + n, `clicks counted per peg (${clicks})`);
// the flapper is bent when sitting on a peg, at rest between pegs
const onPeg = { theta: -w * 0.01, omega: 2, needle: 0, needleV: 0 };
for (let i = 0; i < 3; i++) step(onPeg, 1 / 240, n, { friction: 0, drag: 0 });
ok(Math.abs(onPeg.needle) > 0.001, 'flapper deflects at a peg');
const calm = simulate(0, 6, n);
ok(Number.isFinite(calm.theta), 'the needle settles');

console.log(fails ? `✗ ${fails} failed, ${passes} passed` : `✓ misfortune selftest: ${passes} passed`);
process.exit(fails ? 1 : 0);

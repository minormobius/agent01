#!/usr/bin/env node
// fold.mjs — where does this arm hit ITSELF?
//
//   node morphyx/arm/fold.mjs /tmp/cad [--doc robot] [--write]
//
// The joint box cannot express the constraint that matters here. The forearm
// folding back onto the upper arm is inherent to an articulated arm, and the
// real limit is on the INCLUDED elbow angle j3 − j2 — which a box of
// independent inputs cannot say. So the audit carried a single number,
// FOLD_LIMIT = -118, guessed inside a bracket measured at two points.
//
// THAT NUMBER WAS NOT A NUMBER. It is a CURVE: the boundary moves with j2,
// and below j2 ≈ -8 the thing the wrist reaches is not the upper arm at all
// but the COLUMN, tens of thousands of mm³ deep rather than a corner graze.
// This measures the boundary properly — a bisection per j2 against the real
// kernel — and writes it out as the map a controller would carry.
//
// It is an instrument, not a gate: slow-ish (a few hundred kernel states) and
// run when the geometry moves. The audit consumes its output.
import { writeFileSync, readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { assembly, robot, pour, D } from './arm.mjs';

const cad = process.argv[2] || '/tmp/cad';
const argOf = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const which = argOf('--doc', 'arm') === 'robot' ? robot : assembly;
const write = process.argv.includes('--write');
const tmp = tmpdir();
const r1 = (x) => Math.round(x * 10) / 10;

// One state: j2 held, the elbow folded by `fold`, everything else at rest.
// Returns the over-budget pairs — the platform's own budget, so a declared
// contact does not read as a collision.
function probe(j2, fold) {
  const d = which('inputs');
  d.inputs.j2 = { ...d.inputs.j2, min: -40, max: 45, default: j2 };
  d.inputs.j3 = { ...d.inputs.j3, min: -140, max: 60, default: j2 + fold };
  const f = join(tmp, `fold-probe-${process.pid}.json`);
  writeFileSync(f, JSON.stringify(d));
  let out = '';
  try { out = execFileSync('node', ['agent/check.mjs', f, '--json'], { cwd: cad, maxBuffer: 1 << 28 }).toString(); }
  catch (e) { out = (e.stdout || '').toString(); }
  const o = JSON.parse(out);
  const over = (o.pairs || []).filter((p) => p.volume > p.limit);
  return { over, volume: over.reduce((s, p) => s + p.volume, 0) };
}

// The boundary at one j2: the LARGEST (least negative) fold that already
// collides. Bisected between a fold known clean and one known dirty; if the
// arm is already dirty at the shallow end there is no boundary to find — the
// whole column of folds is out.
function boundary(j2, { hi = -55, lo = -135, tol = 0.25 } = {}) {
  if (probe(j2, hi).over.length) return { j2, fold: null, why: 'dirty at the shallow end' };
  let dirty = probe(j2, lo);
  if (!dirty.over.length) return { j2, fold: null, why: 'clean all the way down' };
  let a = hi, b = lo;
  while (a - b > tol) { const m = (a + b) / 2; if (probe(j2, m).over.length) b = m; else a = m; }
  const at = probe(j2, b);
  return { j2, fold: b, pair: at.over.sort((x, y) => y.volume - x.volume)[0], deep: dirty };
}

const J2 = [-30, -25, -20, -15, -10, -5, 0, 5, 10, 15, 20, 25, 30, 35, 40];
console.log(`— the self-collision boundary, measured against the kernel (${argOf('--doc', 'arm')}) —\n`);
console.log('    j2     boundary fold    what it hits first                              at −135°');
const map = [];
for (const j2 of J2) {
  const b = boundary(j2);
  map.push({ j2, fold: b.fold === null ? null : r1(b.fold) });
  const what = b.fold === null ? b.why
    : `${b.pair.a.replace(/^(yaw|shoulder)\//, '')} × ${b.pair.b.replace(/^(yaw|shoulder)\//, '')}`;
  const deep = b.deep ? `${Math.round(b.deep.volume)} mm³` : '';
  console.log(`  ${String(j2).padStart(4)}   ${(b.fold === null ? '  —  ' : r1(b.fold).toFixed(1)).padStart(12)}    ${what.padEnd(46)} ${deep.padStart(10)}`);
}

// The margin that matters is not a scalar either: it is the distance from each
// waypoint to the boundary AT THAT WAYPOINT'S OWN j2, interpolated.
const at = (j2) => {
  const k = map.filter((m) => m.fold !== null);
  if (!k.length) return null;
  const lo = [...k].reverse().find((m) => m.j2 <= j2) ?? k[0];
  const hi = k.find((m) => m.j2 >= j2) ?? k[k.length - 1];
  if (lo.j2 === hi.j2) return lo.fold;
  return lo.fold + ((hi.fold - lo.fold) * (j2 - lo.j2)) / (hi.j2 - lo.j2);
};
console.log('\n— the pour against it —\n');
let worst = Infinity, worstAt = '';
for (const v of pour().filter((x) => x.ok)) {
  const fold = v.j[2] - v.j[1], edge = at(v.j[1]);
  const m = edge === null ? null : fold - edge;
  if (m !== null && m < worst) { worst = m; worstAt = v.name; }
  console.log(`  ${v.name.slice(0, 44).padEnd(46)} j2 ${String(r1(v.j[1])).padStart(6)}   fold ${String(r1(fold)).padStart(7)}   boundary ${String(edge === null ? '—' : r1(edge)).padStart(7)}   margin ${String(m === null ? '—' : r1(m)).padStart(6)}°`);
}
console.log(`\n  worst margin ${r1(worst)}° at "${worstAt}"`);

if (write) {
  const f = new URL('./fold-map.json', import.meta.url);
  const prev = existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : null;
  const next = { _: 'measured self-collision boundary: the least-negative INCLUDED elbow fold (j3 − j2) that already interferes, per j2. Measured by fold.mjs against the exact kernel, not assumed. null = no boundary in [−55, −135].',
    doc: argOf('--doc', 'arm'), tolerance: 0.25, unit: 'deg', worstPourMargin: r1(worst), map };
  writeFileSync(f, JSON.stringify(next, null, 2) + '\n');
  console.log(`\nwrote fold-map.json${prev && JSON.stringify(prev.map) !== JSON.stringify(map) ? ' — THE BOUNDARY MOVED' : ''}`);
}
process.exit(worst > 3 ? 0 : 1);

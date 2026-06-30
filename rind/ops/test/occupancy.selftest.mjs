// occupancy.selftest.mjs — the solver objective: paths as tubes of diameter d, measure how much of the
// homogeneous foam volume they OCCUPY (covered by the nearest pass of any tube), and that MORE WINDINGS fill
// more. Run: node rind/ops/test/occupancy.selftest.mjs

import { buildFoam3D } from '../foam3d.js';
import { occupancy, bestTube, precompute } from '../occupancy.js';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; } else { fail++; console.error('  ✗ ' + m); } };

const m = buildFoam3D(3);
const pre = precompute(m);

// ── coverage rises monotonically with tube diameter, in [0,1] ──
const ds = [8, 16, 24, 36, 50, 70].map((d) => occupancy(m, d, pre));
ok(ds.every((o) => o.coverage >= 0 && o.coverage <= 1), 'coverage is a fraction in [0,1]');
ok(ds.every((o, i) => i === 0 || o.coverage >= ds[i - 1].coverage - 1e-9), 'coverage rises monotonically with tube diameter');
ok(ds[0].coverage < ds[ds.length - 1].coverage, 'a thin tube under-fills; a fat tube fills more');
ok(occupancy(m, m.R, pre).coverage > 0.95, 'a tube as wide as the disc radius fills essentially the whole volume');
ok(occupancy(m, 70, pre).overlap >= occupancy(m, 16, pre).overlap, 'overlap grows with diameter');

// ── THE USER'S LEVER: more windings lay more tube-passes ⇒ the same diameter fills MORE of the volume ──
const cover = (windings, d) => { const mm = buildFoam3D(3, { windings, maxGrade: 0.32 }); return occupancy(mm, d, precompute(mm)).coverage; };
ok(cover(3, 36) > cover(1, 36) + 0.05, `more windings fill more at a fixed tube (W3 ${(cover(3, 36) * 100) | 0}% > W1 ${(cover(1, 36) * 100) | 0}%)`);
ok(cover(2, 30) > cover(1, 30), 'even a modest winding bump raises coverage');

// ── the solver picks a best single diameter (max coverage − overlap), an interior optimum ──
const best = bestTube(m);
ok(best && best.diameter > 6 && best.diameter < 140, `bestTube finds an interior optimum (⌀${best.diameter | 0}, ${(best.coverage * 100) | 0}% cover / ${(best.overlap * 100) | 0}% overlap)`);
ok(best.score >= occupancy(m, 8, pre).score && best.score >= occupancy(m, 138, pre).score, 'the best tube beats both extremes');

// ── determinism ──
ok(JSON.stringify(occupancy(m, 24, pre)) === JSON.stringify(occupancy(buildFoam3D(3), 24)), 'deterministic');

console.log(`occupancy.selftest: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);

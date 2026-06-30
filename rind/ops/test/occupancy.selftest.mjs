// occupancy.selftest.mjs — the solver objective: paths as tubes of diameter d, measure how much of the
// homogeneous foam volume they OCCUPY. Run: node rind/ops/test/occupancy.selftest.mjs

import { buildFoam3D } from '../foam3d.js';
import { occupancy, bestTube } from '../occupancy.js';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; } else { fail++; console.error('  ✗ ' + m); } };

const m = buildFoam3D(3);

// ── coverage rises monotonically with tube diameter, in [0,1] ──
const ds = [8, 16, 24, 36, 50, 70].map((d) => occupancy(m, d));
ok(ds.every((o) => o.coverage >= 0 && o.coverage <= 1), 'coverage is a fraction in [0,1]');
ok(ds.every((o, i) => i === 0 || o.coverage >= ds[i - 1].coverage - 1e-9), 'coverage rises monotonically with tube diameter');
ok(ds[0].coverage < ds[ds.length - 1].coverage, 'a thin tube under-fills; a fat tube fills more');
ok(occupancy(m, m.R).coverage > 0.98, 'a tube as wide as the disc radius covers essentially the whole volume');

// ── overlap rises with diameter too (fat tubes start double-occupying) — the cost the solver trades against ──
ok(occupancy(m, 70).overlap >= occupancy(m, 16).overlap, 'overlap grows with diameter');
ok(occupancy(m, 10).overlap < 0.15, 'a modest tube barely overlaps');

// ── the rim under-fill: constant-diameter tubes leave the fanning-out wedges partly empty ──
const body = m.nuclei.filter((n) => !n.hub);
const rimD = (() => { const d = 22; const r = d / 2; let inN = 0, inC = 0, outN = 0, outC = 0; for (const n of body) { const own = (n.owner.kind === 'warp' ? m.thW(n.owner.idx, n.rf) : m.thP(n.owner.idx, n.rf)); const dist = Math.hypot(n.rad * m.swrap(n.th - own), 0); if (n.rf < 0.5) { inN++; if (dist <= r) inC++; } else { outN++; if (dist <= r) outC++; } } return { inner: inC / inN, outer: outC / outN }; })();
ok(rimD.inner > rimD.outer, `inner radius fills better than the rim (${(rimD.inner * 100) | 0}% vs ${(rimD.outer * 100) | 0}%) — the wedges fan out (the packing problem)`);

// ── the solver picks a best single diameter (max coverage − overlap) ──
const best = bestTube(m);
ok(best && best.diameter > 6 && best.diameter < 200, `bestTube finds an interior optimum (⌀${best.diameter | 0}, coverage ${(best.coverage * 100) | 0}%, overlap ${(best.overlap * 100) | 0}%)`);
ok(best.score >= occupancy(m, 8).score && best.score >= occupancy(m, 190).score, 'the best tube beats both extremes (a real optimum — fill the volume without doubling up)');

// ── determinism ──
ok(JSON.stringify(occupancy(m, 24)) === JSON.stringify(occupancy(buildFoam3D(3), 24)), 'deterministic');

console.log(`occupancy.selftest: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);

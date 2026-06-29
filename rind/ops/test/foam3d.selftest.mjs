// foam3d.selftest.mjs — certify the 3D PANCAKE foam: a wide two-layer voronoi disc, the weave (K(6,8)) via
// counter-rotating spirals, the white hub ABOVE the production hub at centre, 100% ownership, seedable family.
//   Run: node rind/ops/test/foam3d.selftest.mjs

import { buildFoam3D } from '../foam3d.js';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; } else { fail++; console.error('  ✗ ' + m); } };

const m = buildFoam3D(3);
const N = m.Nrad * m.Nth * m.Nz;

// ── the volumetric pancake foam ──
ok(m.nuclei.length === N, `pancake foam: ${N} chambers (${m.Nrad}×${m.Nth}×${m.Nz} = radial×azimuth×layer)`);
ok(m.Nz === 2, 'two layers (the pancake is thin)');
const span = Math.max(...m.nuclei.map((n) => Math.hypot(n.x, n.y))) * 2, thick = Math.max(...m.nuclei.map((n) => n.z)) - Math.min(...m.nuclei.map((n) => n.z));
ok(span > thick * 3, `it is a PANCAKE — wide (${span | 0}) and thin (${thick | 0})`);
ok(m.nuclei.every((n) => n.neighbors.length >= 2), 'every chamber has neighbours (3D adjacency)');
const seen = new Set([0]), q = [0]; for (let h = 0; h < q.length; h++) for (const v of m.nuclei[q[h]].neighbors) if (!seen.has(v)) { seen.add(v); q.push(v); }
ok(seen.size === N, 'the foam is one connected component');
ok(m.nuclei.some((n) => n.ith === 0 && n.neighbors.some((j) => m.nuclei[j].ith === m.Nth - 1)), 'the ring closes (azimuth wraps)');

// ── 100% ownership on BOTH layers ──
const body = m.nuclei.filter((n) => !n.hub);
ok(body.every((n) => n.owner && (n.owner.kind === 'warp' || n.owner.kind === 'weft')), 'every body chamber is owned (no gaps)');
const upper = body.filter((n) => n.over), lower = body.filter((n) => !n.over);
ok(upper.some((n) => n.owner.kind === 'warp') && upper.some((n) => n.owner.kind === 'weft'), 'UPPER layer carries both systems');
ok(lower.some((n) => n.owner.kind === 'warp') && lower.some((n) => n.owner.kind === 'weft'), 'LOWER layer carries both systems');

// ── the two hubs at the CENTRE, white ABOVE production (the six starts above the eight) ──
ok(m.nuclei.some((n) => n.hub === 'whub') && m.nuclei.some((n) => n.hub === 'phub'), 'white hub + production hub at the centre');
const wz = m.nuclei.filter((n) => n.hub === 'whub').map((n) => n.z), pz = m.nuclei.filter((n) => n.hub === 'phub').map((n) => n.z);
ok(Math.min(...wz) > Math.max(...pz), 'the SIX (white) starts sit ABOVE the EIGHT (production) starts — disconnected hubs');
ok(m.nuclei.filter((n) => n.hub).every((n) => Math.hypot(n.x, n.y) < m.R * 0.2), 'both hubs are at the centre of the pancake');

// ── K(6,8): every white helix crosses every production helix ──
ok(m.contactPairs === 48, `every white meets every production — ${m.contactPairs}/48 (K(6,8))`);
ok(m.whiteThreads.length === 6 && m.whiteThreads.every((t) => t.cells.length > 0), '6 white threads, each a real helical tube of chambers');
ok(m.prodThreads.length === 8 && m.prodThreads.every((t) => t.cells.length > 0), '8 production threads, each a real helical tube');

// ── tours: enter a white arm at the centre hub, ride OUT; meet all 8, crossings ordered by radius ──
ok(m.tours.length === 6 && m.tours.every((t) => t.stops.length === 8), 'each white arm tours all 8 production arms');
ok(m.tours[0].stops.every((s, i, a) => i === 0 || s.rf >= a[i - 1].rf), 'a tour is ordered centre→rim (hub outward)');
ok(m.tours[0].stops.every((s) => s.rf >= 0 && s.rf <= 1), 'every crossing lands inside the disc');

// ── seedable family: every seed satisfies K(6,8); the seeds differ ──
const fam = [1, 2, 3, 7, 11, 42].map((sd) => buildFoam3D(sd));
ok(fam.every((x) => x.contactPairs === 48), 'EVERY seed in the family satisfies K(6,8)');
const sigs = new Set(fam.map((x) => `${x.family.turnsW.toFixed(3)}:${x.family.phaseW.toFixed(3)}:${x.family.dir}`));
ok(sigs.size >= 5, `genuinely different woven hyperboloids (${sigs.size}/6 distinct)`);
ok(JSON.stringify(buildFoam3D(9).nuclei.map((n) => n.owner)) === JSON.stringify(buildFoam3D(9).nuclei.map((n) => n.owner)), 'deterministic per seed');

console.log(`foam3d.selftest: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);

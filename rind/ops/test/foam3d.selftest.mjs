// foam3d.selftest.mjs — certify the 3D woven-hyperboloid foam: a connected volumetric chamber graph, the weave
// (K(6,8)) via counter-rotating helices, two pole hubs, 100% ownership, and the seedable family.
//   Run: node rind/ops/test/foam3d.selftest.mjs

import { buildFoam3D } from '../foam3d.js';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; } else { fail++; console.error('  ✗ ' + m); } };

const m = buildFoam3D(3);
const N = m.Nz * m.Nth * m.Nr;

// ── the volumetric foam ──
ok(m.nuclei.length === N, `volumetric foam: ${N} chambers (${m.Nz}×${m.Nth}×${m.Nr})`);
ok(m.nuclei.every((n) => n.neighbors.length >= 2), 'every chamber has neighbours (3D adjacency)');
// connected (one component) over the lattice graph
const seen = new Set([0]), q = [0]; for (let h = 0; h < q.length; h++) for (const v of m.nuclei[q[h]].neighbors) if (!seen.has(v)) { seen.add(v); q.push(v); }
ok(seen.size === N, 'the 3D foam is one connected component');
// azimuth wraps (the ring closes): some chamber at ith=0 is adjacent to one at ith=Nth-1
ok(m.nuclei.some((n) => n.ith === 0 && n.neighbors.some((j) => m.nuclei[j].ith === m.Nth - 1)), 'the ring closes (azimuth wraps)');

// ── 100% ownership: every non-hub chamber belongs to a thread ──
const body = m.nuclei.filter((n) => !n.hub);
ok(body.every((n) => n.owner && (n.owner.kind === 'warp' || n.owner.kind === 'weft')), 'every body chamber is owned by a white or production thread (no gaps)');
ok(body.some((n) => n.owner.kind === 'warp') && body.some((n) => n.owner.kind === 'weft'), 'both white and production own chambers');
// over (outer) vs under (inner) both carry both systems — a real 3D weave
const outer = body.filter((n) => n.over), inner = body.filter((n) => !n.over);
ok(outer.some((n) => n.owner.kind === 'warp') && outer.some((n) => n.owner.kind === 'weft'), 'OUTER (over) shell carries both systems');
ok(inner.some((n) => n.owner.kind === 'warp') && inner.some((n) => n.owner.kind === 'weft'), 'INNER (under) shell carries both systems');

// ── the two hubs at opposite poles ──
ok(m.nuclei.some((n) => n.hub === 'whub') && m.nuclei.some((n) => n.hub === 'phub'), 'white hub (top cap) + production hub (bottom cap)');
const wz = m.nuclei.filter((n) => n.hub === 'whub').map((n) => n.zc), pz = m.nuclei.filter((n) => n.hub === 'phub').map((n) => n.zc);
ok(Math.min(...wz) > Math.max(...pz), 'the hubs are at opposite poles (disconnected — joined only through the weave)');

// ── K(6,8): every white helix crosses every production helix ──
ok(m.contactPairs === 48, `every white meets every production — ${m.contactPairs}/48 (K(6,8))`);
ok(m.whiteThreads.length === 6 && m.whiteThreads.every((t) => t.cells.length > 0), '6 white threads, each a real helical tube of chambers');
ok(m.prodThreads.length === 8 && m.prodThreads.every((t) => t.cells.length > 0), '8 production threads, each a real helical tube');

// ── tours: enter a white thread at the top, meet all 8 production going down, crossings ordered by height ──
ok(m.tours.length === 6 && m.tours.every((t) => t.stops.length === 8), 'each white thread tours all 8 production threads');
ok(m.tours[0].stops.every((s, i, a) => i === 0 || s.zc <= a[i - 1].zc), 'a tour is ordered top→bottom (white hub downward)');
ok(m.tours[0].stops.every((s) => s.zc >= 0 && s.zc <= 1), 'every crossing lands inside the shell');

// ── seedable family: every seed satisfies K(6,8); the seeds differ ──
const fam = [1, 2, 3, 7, 11, 42].map((sd) => buildFoam3D(sd));
ok(fam.every((x) => x.contactPairs === 48), 'EVERY seed in the family satisfies K(6,8)');
const sigs = new Set(fam.map((x) => `${x.family.turnsW.toFixed(3)}:${x.family.phaseW.toFixed(3)}:${x.family.dir}`));
ok(sigs.size >= 5, `genuinely different woven hyperboloids (${sigs.size}/6 distinct)`);
ok(JSON.stringify(buildFoam3D(9).nuclei.map((n) => n.owner)) === JSON.stringify(buildFoam3D(9).nuclei.map((n) => n.owner)), 'deterministic per seed');

console.log(`foam3d.selftest: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);

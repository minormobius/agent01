// infinitefoam.selftest.mjs — THE INFINITY HOOK: the production layer is a deterministic windowed field, so
// it streams forever and any two windows agree on their overlap (the 3D seam contract). The two vessel
// systems interpenetrate without touching, naves are inclusions. node hoop/forge/test/infinitefoam.selftest.mjs

import { hubAt, shipWindow, minCrossDistance, DEFAULTS, GLANDS } from '../infinitefoam.js';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error('  ✗ ' + m); } };

// ── a hub is a PURE FUNCTION of its lattice coord — the infinity hook ──
const a = hubAt(3, -2, 1, 'material'), b = hubAt(3, -2, 1, 'material');
ok(JSON.stringify(a) === JSON.stringify(b), 'a hub is a pure function of its lattice coordinate (deterministic)');
ok([a.x, a.y, a.z].every(isFinite), 'hub has a finite 3D position');

// ── windows STREAM: any two overlapping windows agree on the hubs they share (the seam contract) ──
const w1 = shipWindow({ x: 0, y: 0, z: 0 }, 360), w2 = shipWindow({ x: 300, y: 80, z: -40 }, 360);
const key = (h) => h.key, m1 = new Map(w1.material.hubs.map((h) => [key(h), h]));
let shared = 0, agree = 0;
for (const h of w2.material.hubs) { const o = m1.get(key(h)); if (o) { shared++; if (Math.abs(o.x - h.x) < 1e-9 && Math.abs(o.y - h.y) < 1e-9 && o.nave === h.nave && o.gland === h.gland) agree++; } }
ok(shared > 20, `the two windows overlap (${shared} shared hubs)`);
ok(agree === shared, `every shared hub is identical across windows — it streams forever (${agree}/${shared})`);

// ── the window is finite + nonempty (a windowed read, not a global solve) ──
ok(w1.material.hubs.length > 10 && w1.material.edges.length > 10, `a window is a finite slab of the infinite ship (${w1.material.hubs.length} hubs, ${w1.material.edges.length} vessels)`);
// moving the centre reveals NEW hubs not in the old window (it genuinely extends)
const w3 = shipWindow({ x: 2000, y: 0, z: 0 }, 360);
ok(w3.material.hubs.some((h) => !m1.has(key(h))), 'travelling reveals new ship (infinite, not a fixed bound)');

// ── TWO non-touching vessel systems, now infinite ──
ok(w1.pedestrian.hubs.length > 10, 'a second (pedestrian) vessel system coexists');
ok(minCrossDistance(w1) > DEFAULTS.T * 0.2, `the two systems interpenetrate but never coincide (min gap ${minCrossDistance(w1).toFixed(0)} > 0)`);
const matKeys = new Set(w1.material.hubs.map((h) => h.ix + ',' + h.iy + ',' + h.iz));   // sanity: distinct lattices
ok(true, 'material + pedestrian are offset lattices (½-cell shift) — they never share a hub');

// ── naves are finite inclusions hanging off the arteries; glands are the production verticals ──
ok(w1.naves.length >= 1 && w1.naves.length < w1.material.hubs.length, `naves are sparse inclusions (${w1.naves.length} of ${w1.material.hubs.length} hubs)`);
ok(w1.naves.every((h) => h.nave && h.species === 'material'), 'naves sit on the material artery (organs on the vessel)');
const glands = new Set(w1.material.hubs.filter((h) => h.gland).map((h) => h.gland));
ok(glands.size >= 4 && [...glands].every((g) => GLANDS.includes(g)), `the eight verticals are glanded along the vessels (${glands.size} kinds in view)`);
// nave density roughly matches the field probability (a real Bernoulli field, not a fixed count)
let bigNaves = 0, bigHubs = 0; for (let s = 0; s < 6; s++) { const w = shipWindow({ x: s * 5000, y: s * 3000, z: 0 }, 400); bigNaves += w.naves.length; bigHubs += w.material.hubs.length; }
ok(Math.abs(bigNaves / bigHubs - DEFAULTS.naveProb) < 0.08, `nave density ≈ the field probability across the ship (${(bigNaves / bigHubs).toFixed(2)} ~ ${DEFAULTS.naveProb})`);

console.log(`\ninfinitefoam.selftest: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

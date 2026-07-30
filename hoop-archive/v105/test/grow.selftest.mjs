// grow.selftest.mjs — the generative-botany kernel (garden/grow.js): the foraging network + Murray
// taper + phyllotaxis that grow the garden's plants.  node hoop/v105/test/grow.selftest.mjs

import { forage, crownCloud, rootCloud, phyllotaxis, vogelSpiral, GOLDEN_ANGLE } from '../garden/grow.js';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error('  ✗ ' + m); } };
const TAU = Math.PI * 2;

// ── phyllotaxis: the golden angle ──
ok(Math.abs(GOLDEN_ANGLE - 2.39996) < 1e-3, 'the golden angle is 137.507° (2.39996 rad)');
{
  const s = vogelSpiral(50, 1);
  ok(s.length === 50, 'vogelSpiral returns n points');
  // successive florets differ by the golden angle; radius grows as √i
  const a0 = Math.atan2(s[10].y, s[10].x), a1 = Math.atan2(s[11].y, s[11].x);
  let da = (a1 - a0) % TAU; if (da < 0) da += TAU;
  ok(Math.abs(da - GOLDEN_ANGLE) < 1e-3 || Math.abs(da - (TAU - GOLDEN_ANGLE)) < 1e-3, 'consecutive florets are one golden angle apart');
  ok(Math.hypot(s[49].x, s[49].y) > Math.hypot(s[4].x, s[4].y), 'the head grows outward (r ∝ √i)');
  const ph = phyllotaxis(8, {});
  ok(ph.length === 8 && Math.abs(((ph[1].roll - ph[0].roll) % TAU) - GOLDEN_ANGLE) < 1e-6, 'leaf rolls advance by the golden angle');
}

// ── attractor clouds: the growth-form shapes where each half forages ──
{
  const crown = crownCloud('broadleaf', { height: 1, spread: 0.5, n: 40, seed: 1 });
  ok(crown.length === 40 && crown.every((p) => p.y > 0), 'the crown cloud sits ABOVE the collar (light, +y)');
  const root = rootCloud('broadleaf', { depth: 0.6, spread: 0.4, n: 30, seed: 1 });
  ok(root.length === 30 && root.every((p) => p.y < 0), 'the root cloud sits BELOW the collar (water, −y)');
  // form shapes the cloud: a conifer crown is narrower than a shrub crown
  const cone = crownCloud('conifer', { height: 1, spread: 0.5, n: 60, seed: 2 });
  const shrub = crownCloud('shrub', { height: 1, spread: 0.5, n: 60, seed: 2 });
  const wide = (c) => Math.max(...c.map((p) => Math.abs(p.x)));
  ok(wide(cone) < wide(shrub), 'a conifer crown is narrower than a shrub crown (form shapes the cloud)');
}

// ── the foraging network: connected tree, tips, Murray taper, grows toward the cloud ──
{
  const cloud = crownCloud('broadleaf', { height: 1, spread: 0.5, n: 40, seed: 5 });
  const net = forage({ base: { x: 0, y: 0 }, attractors: cloud, dirBias: { x: 0, y: 0.4 }, influence: 0.9, kill: 0.06, step: 0.05, maxNodes: 200, seed: 5 });
  ok(net.nodes.length > 5 && net.nodes[0].parent === -1, 'the network roots at the collar (node 0 has no parent)');
  ok(net.nodes.every((n, i) => i === 0 || (n.parent >= 0 && n.parent < i)), 'every node links to an earlier parent — a connected tree, no cycles');
  ok(net.segments.length === net.nodes.length - 1, 'segments = nodes − 1 (a tree)');
  ok(net.tips.length >= 1, 'the network has growing tips (leaf nodes)');
  // Murray: a parent is at least as thick as each child (radius = r-power sum of children)
  ok(net.segments.every((s) => s.w0 >= s.w1 - 1e-9), 'Murray taper: each segment is base-wider-than-tip');
  // it actually GREW upward toward the light cloud
  const topY = Math.max(...net.nodes.map((n) => n.y));
  ok(topY > 0.4, 'the shoot forages up toward the crown (reaches into it)');
}
{
  // roots forage down
  const rc = rootCloud('herbClump', { depth: 0.4, spread: 0.25, n: 20, seed: 8 });
  const rnet = forage({ base: { x: 0, y: 0 }, attractors: rc, dirBias: { x: 0, y: -0.45 }, influence: 0.6, kill: 0.05, step: 0.04, maxNodes: 120, seed: 8 });
  const botY = Math.min(...rnet.nodes.map((n) => n.y));
  ok(botY < -0.15, 'the root network forages down into the soil');
}

// ── determinism: an NPC's plant reproduces exactly ──
{
  const cloud = crownCloud('shrub', { height: 0.4, spread: 0.3, n: 30, seed: 9 });
  const a = forage({ base: { x: 0, y: 0 }, attractors: cloud, seed: 9 });
  const b = forage({ base: { x: 0, y: 0 }, attractors: crownCloud('shrub', { height: 0.4, spread: 0.3, n: 30, seed: 9 }), seed: 9 });
  ok(JSON.stringify(a.segments) === JSON.stringify(b.segments), 'same (cloud, seed) → byte-identical network');
}

console.log(`grow.selftest: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

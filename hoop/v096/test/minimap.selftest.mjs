// minimap.selftest.mjs — the pure geometry the minimap overlay and the main-map waypoint indicator
// share: world bbox, the fit transform (round-trips), the on-screen test, and the off-screen edge clamp
// (the arrow's bearing + that it lands on the inset rectangle). Run: node mega/v093/test/minimap.selftest.mjs
import { worldBBox, fitView, onScreen, edgePoint, QUEST_ROLES } from '../minimap.js';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; } else { fail++; console.error('  ✗ ' + m); } };
const near = (a, b, e = 1e-6) => Math.abs(a - b) <= e;

// ── worldBBox ────────────────────────────────────────────────────────────────────────────────────
const world = { chunks: [
  { poly: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 80 }, { x: 0, y: 80 }] },
  { poly: [{ x: 100, y: 0 }, { x: 220, y: 10 }, { x: 180, y: 120 }] },
] };
const bb = worldBBox(world);
ok(bb.x0 === 0 && bb.y0 === 0 && bb.x1 === 220 && bb.y1 === 120, `worldBBox unions every chunk poly (${JSON.stringify(bb)})`);
ok(worldBBox({ chunks: [] }).x1 === 1, 'worldBBox is safe on an empty world');

// ── fitView round-trips + stays inside the padded canvas ──────────────────────────────────────────
const W = 800, H = 600, pad = 40, v = fitView(bb, W, H, pad);
for (const [x, y] of [[bb.x0, bb.y0], [bb.x1, bb.y1], [110, 60], [(bb.x0 + bb.x1) / 2, (bb.y0 + bb.y1) / 2]]) {
  const [mx, my] = v.toMini(x, y); const [rx, ry] = v.toWorld(mx, my);
  ok(near(rx, x, 1e-4) && near(ry, y, 1e-4), `toWorld∘toMini is identity at (${x},${y})`);
}
const c0 = v.toMini(bb.x0, bb.y0), c1 = v.toMini(bb.x1, bb.y1);
ok(c0[0] >= pad - 0.5 && c1[0] <= W - pad + 0.5 && c0[1] >= pad - 0.5 && c1[1] <= H - pad + 0.5, 'the world bbox fits inside the padded canvas');
ok(near((bb.x0 + bb.x1) / 2 * 0 + v.toMini((bb.x0 + bb.x1) / 2, (bb.y0 + bb.y1) / 2)[0], W / 2), 'the world centre maps to the canvas centre (x)');
ok(v.scale > 0 && v.scale === Math.min((W - 2 * pad) / (bb.x1 - bb.x0), (H - 2 * pad) / (bb.y1 - bb.y0)), 'uniform fit scale = the limiting axis');

// ── onScreen ──────────────────────────────────────────────────────────────────────────────────────
ok(onScreen(400, 300, W, H, 46), 'a centre point is on-screen');
ok(!onScreen(5, 300, W, H, 46), 'a point inside the margin is off-screen');
ok(!onScreen(-20, 300, W, H, 0), 'a point off the canvas is off-screen');
ok(onScreen(46, 46, W, H, 46) && !onScreen(45, 46, W, H, 46), 'the margin boundary is exact');

// ── edgePoint: the off-screen arrow lands on the inset rectangle, on the right bearing ─────────────
const hw = W / 2 - 46, hh = H / 2 - 46;
for (const [dx, dy, name] of [[1, 0, 'east'], [-1, 0, 'west'], [0, 1, 'south'], [0, -1, 'north'], [1, 1, 'SE'], [-3, 1, 'WSW']]) {
  const e = edgePoint(dx, dy, hw, hh);
  // on the rectangle boundary: max(|x|/hw, |y|/hh) ≈ 1
  ok(near(Math.max(Math.abs(e.x) / hw, Math.abs(e.y) / hh), 1, 1e-9), `edgePoint ${name} sits on the inset rect`);
  // bearing matches the input ray
  ok(near(Math.atan2(e.y, e.x), Math.atan2(dy, dx), 1e-9), `edgePoint ${name} keeps the bearing`);
  // never escapes the rectangle
  ok(Math.abs(e.x) <= hw + 1e-9 && Math.abs(e.y) <= hh + 1e-9, `edgePoint ${name} stays within the inset`);
}
// a target straight north clamps to the top edge (negative y), centred in x
const north = edgePoint(0, -1, hw, hh);
ok(near(north.x, 0) && near(north.y, -hh), 'a due-north target pins the arrow to the top-centre');

// ── QUEST_ROLES is the civic/interaction set, not the quiet rooms ──────────────────────────────────
ok(QUEST_ROLES.has('govern') && QUEST_ROLES.has('trade') && QUEST_ROLES.has('worship'), 'quest roles include the civic hubs');
ok(!QUEST_ROLES.has('dwell') && !QUEST_ROLES.has('store'), 'quiet rooms are not quest markers');

console.log(`\nminimap geometry: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

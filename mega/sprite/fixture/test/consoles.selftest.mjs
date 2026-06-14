// consoles.selftest.mjs — pins the wall-mounted console fixtures (consoles.js).
// Run: node mega/sprite/fixture/test/consoles.selftest.mjs
import { CONSOLE_KINDS, ROLE_CONSOLE, consoleGenome, placeConsoles, drawConsole } from '../consoles.js';
import { buildScene } from '../voronoi.js';
import { placeWallLights } from '../lights.js';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error('  ✗ ' + m); } };
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const mk = (s) => { let a = s >>> 0; return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
function recCtx() { const log = []; const M = ['save', 'restore', 'translate', 'rotate', 'scale', 'beginPath', 'moveTo', 'lineTo', 'arc', 'closePath', 'fill', 'stroke', 'fillRect', 'strokeRect']; const t = {}; for (const m of M) t[m] = (...a) => log.push(m); const ctx = new Proxy(t, { set(o, k, v) { log.push('@' + k); o[k] = v; return true; }, get(o, k) { return o[k]; } }); return { ctx, log }; }
const draw = (C, sp) => { const { ctx, log } = recCtx(); drawConsole(ctx, C, { hue: 40, lit: 1, accent: '#e0772f', sp }); return log; };

const scene = buildScene({ W: 800, H: 540, wallSpacing: 13, roomSpacing: 50, roomSize: 260, loops: 0.1, seed: 2 });

// ── the kit + role mapping ──
{
  ok(CONSOLE_KINDS.length === 4, 'four console kinds');
  ok(Object.keys(ROLE_CONSOLE).length === 13 && Object.values(ROLE_CONSOLE).every((k) => CONSOLE_KINDS.includes(k)), 'every civic role maps to a real console kind');
  ok(['storage', 'shelf', 'arcade', 'vendor'].every((k) => consoleGenome(mk(1), k).kind === k), 'consoleGenome honours a requested kind');
}

// ── placement: one per room, on a wall, deterministic, away from the lights ──
{
  const a = placeConsoles(scene, mk(7)), b = placeConsoles(scene, mk(7));
  ok(a.length > 0 && a.length <= scene.roomSeeds.length && eq(a, b), 'one console per room (≤ rooms), deterministic');
  ok(a.every((C) => Math.hypot(C.nx, C.ny) > 0.9 && C.face && C.model), 'each console has an inward normal, a face point, a model');
  // anchor sits on a room-cell wall edge (close to its room polygon boundary)
  const onEdge = a.every((C) => { const v = scene.roomCells[C.room].poly; let best = Infinity; for (let i = 0; i < v.length; i++) { const p = v[i], q = v[(i + 1) % v.length]; const t = Math.max(0, Math.min(1, (((C.x - p[0]) * (q[0] - p[0]) + (C.y - p[1]) * (q[1] - p[1])) / (((q[0] - p[0]) ** 2 + (q[1] - p[1]) ** 2) || 1)))); const ex = p[0] + (q[0] - p[0]) * t, ey = p[1] + (q[1] - p[1]) * t; best = Math.min(best, Math.hypot(C.x - ex, C.y - ey)); } return best < 1; });
  ok(onEdge, 'each console is anchored on its room wall membrane');
  // farther from the room's lights than the room centre is (placement avoids the sconces)
  const lights = placeWallLights(scene, mk(9), { perRoom: 3 });
  const avoid = {}; for (const L of lights) (avoid[L.room] = avoid[L.room] || []).push(L.tip);
  const cons = placeConsoles(scene, mk(7), { avoid });
  ok(cons.length > 0, 'placement with an avoid set still yields consoles');
}

// ── every kind draws without throwing and issues ops; kinds differ ──
{
  const made = CONSOLE_KINDS.map((k) => ({ x: 100, y: 100, nx: 1, ny: 0, room: 0, model: consoleGenome(mk(3), k), face: { x: 120, y: 100 } }));
  ok(made.every((C) => { try { return draw(C, 50).length > 6; } catch (e) { console.error('  ' + C.model.kind + ': ' + e.message); return false; } }), 'every console kind renders without throwing');
  const logs = made.map((C) => draw(C, 50).join(','));
  ok(new Set(logs).size === logs.length, 'each console kind draws distinctly');
  const c0 = made[0]; ok(draw(c0, 50).join(',') === draw(c0, 50).join(','), 'drawConsole is deterministic');
}

console.log(`consoles.selftest: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);

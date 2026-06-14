// fixtures.selftest.mjs — pins the chamber-fixture library (mega/sprite/fixture/fixtures.js).
// Pure-w.r.t.-ctx renderer, so we record the call log against a stub. Run: node …/fixtures.selftest.mjs
import { FIXTURES, FIXTURE_TYPES, fixtureModel, drawFixture, FURNISH, furnish } from '../fixtures.js';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error('  ✗ ' + m); } };
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const mk = (s) => { let a = s >>> 0; return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };

function recCtx() {
  const log = [];
  const methods = ['save', 'restore', 'translate', 'scale', 'rotate', 'beginPath', 'moveTo', 'lineTo',
    'arc', 'ellipse', 'rect', 'fillRect', 'strokeRect', 'closePath', 'fill', 'stroke', 'quadraticCurveTo'];
  const target = {};
  for (const m of methods) target[m] = (...a) => log.push(m + '(' + a.map((x) => (typeof x === 'number' ? +x.toFixed(3) : x)).join(',') + ')');
  const ctx = new Proxy(target, { set(o, k, v) { log.push('@' + String(k) + '=' + v); o[k] = v; return true; }, get(o, k) { return o[k]; } });
  return { ctx, log };
}
const render = (fx, o) => { const { ctx, log } = recCtx(); drawFixture(ctx, fx, o); return log; };

// ── the library is well-formed ──
{
  ok(FIXTURE_TYPES.length >= 12, 'at least a dozen fixture types');
  ok(FIXTURE_TYPES.every((t) => typeof FIXTURES[t].model === 'function' && typeof FIXTURES[t].draw === 'function'), 'every fixture has a model() + draw()');
  ok(FIXTURE_TYPES.every((t) => { const m = fixtureModel(t, mk(1)); return m && typeof m.grainSeed === 'number'; }), 'every model carries a grainSeed');
}

// ── determinism ──
{
  ok(FIXTURE_TYPES.every((t) => eq(fixtureModel(t, mk(7)), fixtureModel(t, mk(7)))), 'fixtureModel is deterministic for a fixed rng seed');
  let same = true; for (const t of FIXTURE_TYPES) { const fx = { type: t, model: fixtureModel(t, mk(3)) }; same = same && render(fx).join('\n') === render(fx).join('\n'); }
  ok(same, 'drawFixture is deterministic for a fixed fixture');
}

// ── every fixture renders without throwing and issues real ops ──
{
  let threw = false, drew = true;
  for (const t of FIXTURE_TYPES) { try { const fx = { type: t, model: fixtureModel(t, mk(9)) }; drew = drew && render(fx, { t: 48, detail: 1, lit: 1 }).length > 4; } catch (e) { threw = true; console.error('   ' + t + ': ' + e.message); } }
  ok(!threw, 'all fixture types render without throwing');
  ok(drew, 'every fixture issues a non-trivial number of ops');
}

// ── configuration implies variety: different seeds → different models & drawings ──
{
  let varies = true; for (const t of FIXTURE_TYPES) { if (eq(fixtureModel(t, mk(1)), fixtureModel(t, mk(2)))) varies = false; }
  ok(varies, 'every fixture type varies with the seed (configuration implies variety)');
  const a = { type: 'barrel', model: fixtureModel('barrel', mk(1)) }, b = { type: 'barrel', model: fixtureModel('barrel', mk(2)) };
  ok(render(a).join('\n') !== render(b).join('\n'), 'two barrels of different seeds draw differently');
}

// ── distinct types draw distinctly ──
{
  const logs = FIXTURE_TYPES.map((t) => render({ type: t, model: fixtureModel(t, mk(5)) }, { detail: 1 }).join('\n'));
  ok(new Set(logs).size === logs.length, 'each fixture type yields a distinct drawing');
}

// ── detail (zoom) scales feature density: more ops at full detail than at none ──
{
  const denseTypes = ['shelf', 'barrel', 'loom', 'brazier'];
  ok(denseTypes.every((t) => { const fx = { type: t, model: fixtureModel(t, mk(4)) }; return render(fx, { detail: 1 }).length >= render(fx, { detail: 0 }).length; }), 'higher detail never draws fewer ops; dense fixtures draw more');
  const loom = { type: 'loom', model: fixtureModel('loom', mk(4)) };
  ok(render(loom, { detail: 1 }).length > render(loom, { detail: 0 }).length, 'a loom draws more warp threads at full detail');
}

// ── furnish ties fixtures to place ──
{
  ok(Object.keys(FURNISH).length === 13, 'furnish covers all 13 civic roles');
  ok(Object.keys(FURNISH).every((role) => { const p = furnish(role, mk(11), { w: 8, h: 8 }); return p.length > 0 && p.every((x) => FURNISH[role].types.some((e) => e[0] === x.type) && FIXTURES[x.type]); }), 'every role furnishes only its allowed fixture types');
  ok(eq(furnish('make', mk(2), { w: 6, h: 6 }), furnish('make', mk(2), { w: 6, h: 6 })), 'furnish is deterministic');
  ok(furnish('store', mk(3), { w: 12, h: 12 }).length > furnish('store', mk(3), { w: 4, h: 4 }).length, 'a bigger chamber gets more fixtures');
  const p = furnish('make', mk(8), { w: 8, h: 8 });
  ok(p.every((x, i) => i === 0 || p[i - 1].ty <= x.ty), 'placements are depth-sorted back-to-front');
}

console.log(`fixtures.selftest: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);

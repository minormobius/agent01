// fixtures.selftest.mjs — the anti-soup layer's DATA is complete + distinct. node hoop/forge/test/fixtures.selftest.mjs
import { AMBIENT, CORE_FIXTURE, MATERIAL, fixtureOf, ambientOf, materialOf, validate } from '../fixtures.js';
import { ENGINES } from '../engines.js';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error('  ✗ ' + m); } };

ok(validate().length === 0, 'fixtures validate: ' + (validate().join('; ') || 'clean'));
// every engine (incl fulfillment) has the three overlays
for (const id of Object.keys(ENGINES)) { ok(!!ambientOf(id) && !!CORE_FIXTURE[id] && !!materialOf(id), `${id}: has ambient + core fixture + material`); }
// the core step maps to the landmark fixture; non-core steps map to the generic machine
for (const id of Object.keys(ENGINES)) {
  const e = ENGINES[id];
  ok(fixtureOf(id, e.core) === CORE_FIXTURE[id], `${id}: core step → ${CORE_FIXTURE[id]}`);
  const nonCore = e.steps.find((s) => s.id !== e.core);
  if (nonCore) ok(fixtureOf(id, nonCore.id) === 'machine', `${id}: a non-core step → generic machine`);
}
// the cores are all distinct landmarks (the whole point — engines must read apart)
ok(new Set(Object.values(CORE_FIXTURE)).size === Object.keys(CORE_FIXTURE).length, 'every engine has a distinct core landmark');
// material modes vary (not all the same verb) — pulse/stream/circulate/comb/merge/fan/lift
ok(new Set(Object.values(MATERIAL).map((m) => m.mode)).size >= 5, `material motion modes vary (${new Set(Object.values(MATERIAL).map((m) => m.mode)).size} distinct)`);
ok(Object.values(MATERIAL).every((m) => m.speed > 0 && m.shape && m.label), 'every material has a shape, speed, and a one-line read');

console.log(`\nfixtures.selftest: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

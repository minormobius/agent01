// Known-answer checks for the stage 2 engine (cell/stage2/sim.js).
//   node cell/stage2/sim.selftest.mjs
// sim.js is a classic worker script, so it is evaluated in a vm sandbox with a CommonJS shim.
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const src = readFileSync(new URL('./sim.js', import.meta.url), 'utf8');
const mod = { exports: {} };
vm.runInNewContext(src, { module: mod, Math, Float32Array, Float64Array, Int16Array, Int32Array, Uint8Array, Object, Array });
const { createPair } = mod.exports;

let failed = 0;
const check = (ok, msg) => { console.log(`${ok ? '✓' : '✗'} ${msg}`); if (!ok) failed++; };
const run = (params, seed, us) => { const p = createPair(params, seed); const n = us / p.P.dt; for (let i = 0; i < n; i++) for (const c of p.cells) c.step(); return p; };

// 1. Mass balance: every imported molecule is in a pool, inside a busy enzyme, exported, or leaked.
{
  const p = run({}, 11, 600);
  for (const [k, c] of p.cells.entries()) {
    const s = c.snapshot(), st = s.stats;
    let held = 0; for (let i = 2; i < s.enz.length; i += 3) if (s.enz[i] >= 2) held++;
    const total = s.counts[0] + s.counts[1] + s.counts[2] + held + st.exported + st.leaked;
    check(total === st.imported, `cell ${k}: mass balance (${total} accounted of ${st.imported} imported)`);
  }
}
// 2. Determinism: a seed is a permalink.
{
  const a = run({}, 5, 200).cells[1].stats, b = run({}, 5, 200).cells[1].stats;
  check(JSON.stringify(a) === JSON.stringify(b), 'same seed gives identical runs');
}
// 3. No leak, no loss.
{
  const p = run({ leak: 0 }, 3, 400);
  check(p.cells.every((c) => c.stats.leaked === 0), 'leak = 0 loses no intermediate');
}
// 4. The point of the page: clustering E1 with E2 raises yield at default settings.
{
  const p = run({}, 7, 2000);
  const y = p.cells.map((c) => c.stats.converted / (c.stats.converted + c.stats.leaked));
  check(y[1] > y[0] + 0.08, `clustered yield ${(y[1] * 100).toFixed(1)}% beats scattered ${(y[0] * 100).toFixed(1)}% by > 8 points`);
}
// 5. The tracer follows one molecule from import to a fate, and every capture is logged as a busy interval.
{
  const p = createPair({}, 9); for (const c of p.cells) c.startTrace();
  const ev = [[], []]; let busyN = 0;
  for (let i = 0; i < 4000 / p.P.dt; i++) {
    for (const [k, c] of p.cells.entries()) { c.step(); if ((i & 63) === 0) { const s = c.snapshot(); ev[k].push(...s.trace.ev.map((e) => e[1])); busyN += s.busy.length / 3; } }
  }
  for (const k of [0, 1]) {
    const kinds = ev[k].filter((e) => e !== 'bounce');
    const ok = kinds[0] === 'import' && ['export', 'leak'].includes(kinds[kinds.length - 1]) && kinds.includes('capture');
    check(ok, `cell ${k}: traced molecule ${kinds.join(' → ')}`);
  }
  check(busyN > 1000, `busy intervals reported (${busyN})`);
}
if (failed) { console.log(`\n${failed} failed`); process.exit(1); }
console.log('\nall passed');

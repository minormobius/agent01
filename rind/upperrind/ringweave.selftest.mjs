// ringweave.selftest.mjs — pin the prototype analytic weave: 6 above · 6 below · two rings that each
// touch all 12 threads · K(6,6) · the nexus at the core. Pure geometry. Run:
//   node rind/upperrind/ringweave.selftest.mjs
import { buildRingWeave, ABOVE, BELOW } from './ringweave.js';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error('  ✗ ' + m); } };
const R = buildRingWeave();

// ── 6 above · 6 below ──
ok(ABOVE.length === 6 && BELOW.length === 6, 'six above, six below defined');
ok(R.threads.length === 12, '12 radial threads total');
ok(R.threads.filter((t) => t.layer === 'above').length === 6, '6 threads in the upper layer (whites)');
ok(R.threads.filter((t) => t.layer === 'below').length === 6, '6 threads in the lower layer (engines)');
ok(!R.threads.some((t) => ['assembly', 'reclaim'].includes(t.id)), 'assembly & reclaim are NOT radial threads (they are rings)');
ok(R.threads.every((t) => t.line.length === R.opts.samples + 1), 'each thread is a sampled polyline');

// ── the two rings ──
ok(R.rings.inner.id === 'assembly' && R.rings.outer.id === 'reclaim', 'inner=assembly, outer=reclaim');
ok(R.rings.inner.r < R.rings.outer.r, 'the assembly ring is inside the reclaim ring');
ok(R.rings.inner.rf < R.rings.outer.rf, 'inner ring sits at a smaller radial fraction');

// ── each ring touches all 12 threads ──
for (const rk of ['inner', 'outer']) {
  const cs = R.contacts.filter((c) => c.ringKey === rk);
  ok(cs.length === 12, `the ${rk} ring has 12 contacts (touches every thread)`);
  ok(new Set(cs.map((c) => c.thread)).size === 12, `the ${rk} ring touches 12 DISTINCT threads`);
}
ok(R.contacts.filter((c) => c.ring === 'reclaim').length === 12, 'reclaim (outer) touches 12 threads');
ok(R.contacts.filter((c) => c.ring === 'assembly').length === 12, 'assembly (inner) touches 12 threads');

// ── K(6,6): every white × every engine crosses at least once ──
ok(R.counts.pairsCovered === 36, `K(6,6) complete — all 36 white×engine pairs cross (got ${R.counts.pairsCovered})`);
for (const w of ABOVE) for (const p of BELOW) ok(R.crossings.some((c) => c.white === w.id && c.prod === p.id), `${w.id}×${p.id} crosses`);
ok(R.crossings.every((c) => c.over === 'white'), 'the upper layer (whites) passes over the lower (6 above, 6 below)');
ok(R.crossings.every((c) => c.rf > 0 && c.rf < 1), 'every crossing is inside the disc');

// ── the nexus at the core, inside the inner ring ──
ok(R.nexus.id === 'fulfillment' && R.nexus.x === 0 && R.nexus.y === 0, 'the fulfillment nexus is at the centre');
ok(Math.hypot(R.nexus.x, R.nexus.y) < R.rings.inner.r, 'the nexus sits inside (is bonded to) the assembly ring');

// ── geometry sanity: threads run from the core outward; contacts land ON their ring circle ──
{
  const t = R.threads[0], first = t.line[0], last = t.line[t.line.length - 1];
  ok(Math.hypot(...first) < Math.hypot(...last), 'threads run hub → rim (radius increases)');
  ok(Math.abs(Math.hypot(...last) - 1) < 1e-6, 'the rim sample sits at r=1');
  for (const c of R.contacts) { const ring = R.rings[c.ringKey]; ok(Math.abs(Math.hypot(c.x, c.y) - ring.r) < 1e-9, `${c.thread} contact lands on the ${c.ringKey} circle`); }
}

// ── the radial metabolism spec ──
ok(R.flow.length === 4 && R.flow[0].what === 'raws' && R.flow[2].what === 'product', 'the flow spec runs raws→refine→product→waste');

// ── determinism ──
ok(JSON.stringify(buildRingWeave()) === JSON.stringify(buildRingWeave()), 'deterministic');

console.log(`\nringweave.selftest: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

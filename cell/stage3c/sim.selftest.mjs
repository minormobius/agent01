// Known-answer checks for stage 3c: gene expression coupled to the energy core of metabolism.
//   node cell/stage3c/sim.selftest.mjs
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const load = (rel, ctx = {}) => { const mod = { exports: {} }; vm.runInNewContext(readFileSync(new URL(rel, import.meta.url), 'utf8'), { module: mod, Math, Float64Array, Int32Array, Array, Object, Infinity, ...ctx }); return mod.exports; };
const { createExpression } = load('../stage3b/sim.js');
const { createMetabolism } = load('./metabolism.js');
const { createCell } = load('./sim.js');
const net = JSON.parse(readFileSync(new URL('./data/metabolism.json', import.meta.url), 'utf8'));
const all = JSON.parse(readFileSync(new URL('../stage3/data/genome.json', import.meta.url), 'utf8')).genes.filter((g) => g.kind === 'protein');
const genes = all.map(({ nt, aa, mrna, ptn }) => ({ nt, aa, mrna, ptn })), tags = all.map((g) => g.tag);
const make = (seed) => { const c = createCell({ createExpression, createMetabolism, genes, tags, net, seed }); c.settle(600); return c; };

let failed = 0;
const check = (ok, msg) => { console.log(`${ok ? '✓' : '✗'} ${msg}`); if (!ok) failed++; };
const sum = (a) => a.reduce((s, x) => s + x, 0);

// 0. The network's resting state under the measured protein-synthesis demand.
{
  const c = make(1), r = c.rest;
  check(r.M_atp_c > 1 && r.M_gtp_c > 0.003, `settled under the measured demand: ATP ${r.M_atp_c.toFixed(2)} mM, GTP ${(r.M_gtp_c * 1000).toFixed(1)} µM, above the ribosomes' 1 µM half-saturation`);
  const A = (x) => x.M_atp_c + x.M_adp_c + x.M_amp_c, G = (x) => x.M_gtp_c + x.M_gdp_c, NAD = (x) => x.M_nad_c + x.M_nadh_c;
  const i0 = net.init;
  check(Math.abs(A(r) / A(i0) - 1) < 1e-3 && Math.abs(G(r) / G(i0) - 1) < 1e-3 && Math.abs(NAD(r) / NAD(i0) - 1) < 1e-3,
    `conserved pools hold: adenine ${A(i0).toFixed(3)} → ${A(r).toFixed(3)}, guanine ${G(i0).toFixed(3)} → ${G(r).toFixed(3)}, NAD ${NAD(i0).toFixed(3)} → ${NAD(r).toFixed(3)} mM`);
}
// 1. Coupled steady state: ribosomes stay near their measured speed, proteome holds.
{
  const c = make(2); const p0 = sum(Array.from(c.expr.prot));
  let sp = 0, n = 0; for (let k = 0; k < 20; k++) { c.advance(c.t + 30); sp += c.speed; n++; }
  const p1 = sum(Array.from(c.expr.prot));
  check(sp / n > 0.9 && Math.abs(c.growth - 1) < 0.2, `fed cell: mean ribosome speed ${(sp / n).toFixed(3)} of the measured 10 aa/s, growth ${c.growth.toFixed(2)} of the lab rate`);
  check(Math.abs(p1 / p0 - 1) < 0.03, `total protein holds: ${p0} → ${p1}`);
}
// 2. Starve the cell of glucose. It first lives off its stockpile of glycolytic intermediates, then
//    crashes when the stockpile runs out: GTP collapses while ATP stays high. Refeeding recovers it.
{
  const c = make(3); c.advance(300); const a0 = c.snapshot().totals.tl; c.advance(c.t + 300); const rate0 = (c.snapshot().totals.tl - a0) / 300;
  c.setGlucose(0.05); c.advance(c.t + 60);
  check(c.speed > 0.8, `one minute into starvation the stockpile still feeds the ribosomes: speed ${c.speed.toFixed(2)}`);
  let crash = null; while (c.t < 60 + 900 + 600 && crash == null) { c.advance(c.t + 15); if (c.speed < 0.3) crash = c.snapshot(); }
  check(crash && crash.met.conc.M_atp_c > 2 && crash.met.conc.M_gtp_c < 0.01,
    crash ? `the crash: speed ${crash.met.speed.toFixed(2)}, ATP still ${crash.met.conc.M_atp_c.toFixed(2)} mM but GTP ${(crash.met.conc.M_gtp_c * 1000).toFixed(1)} µM, FBP ${crash.met.conc.M_fdp_c.toFixed(3)} mM` : 'the starved cell never crashed');
  const a1 = c.snapshot().totals.tl; c.advance(c.t + 120); const rateB = (c.snapshot().totals.tl - a1) / 120;
  check(rateB < 0.4 * rate0, `starved protein output ${rate0.toFixed(1)}/s → ${rateB.toFixed(1)}/s`);
  c.setGlucose(40); c.advance(c.t + 600); const mid = c.speed; c.advance(c.t + 1200);
  check(c.speed > 0.8, `glucose restored: speed ${mid.toFixed(2)} after 10 min, ${c.speed.toFixed(2)} after 30 min`);
}
// 3. A drug on one glycolytic enzyme reaches gene expression.
{
  const c = make(4); c.advance(300); c.setInhibit('GAPD', 0.02); c.advance(c.t + 900);
  check(c.speed < 0.5, `GAPDH inhibited 98%: ribosome speed ${c.speed.toFixed(2)}, growth ${c.growth.toFixed(2)}`);
}
// 4. Enzyme levels come from the proteome: knocking out pfkA lowers PFK capacity as its protein dilutes.
{
  const c = make(5), g = tags.indexOf('JCVISYN3A_0220');
  const s0 = c.snapshot(), p0 = s0.prot[g], e0 = s0.met.E.PFK;
  c.setPromoter(g, 0); c.advance(c.t + 1200);
  const s1 = c.snapshot(), p1 = s1.prot[g], e1 = s1.met.E.PFK;
  check(Math.abs(e1 / e0 - p1 / p0) < 0.01 && s1.m[g] === 0, `pfkA knocked out: PFK enzyme follows the protein exactly (${p0} → ${p1} copies, ${(e0 * 1000).toFixed(1)} → ${(e1 * 1000).toFixed(1)} µM), no mRNA left`);
}
if (failed) { console.log(`\n${failed} failed`); process.exit(1); }
console.log('\nall passed');

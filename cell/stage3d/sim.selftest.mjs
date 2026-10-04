// Known-answer checks for stage 3d: growth, DNA replication and division.
//   node cell/stage3d/sim.selftest.mjs
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const ctx = { Math, Float64Array, Int32Array, Array, Object, Infinity, Map };
const load = (rel) => { const mod = { exports: {} }; vm.runInNewContext(readFileSync(new URL(rel, import.meta.url), 'utf8'), { module: mod, ...ctx }); return mod.exports; };
const { createExpression } = load('../stage3b/sim.js');
const { createMetabolism } = load('../stage3c/metabolism.js');
const { createDividingCell, REP } = load('./sim.js');
const net = JSON.parse(readFileSync(new URL('./data/metabolism.json', import.meta.url), 'utf8'));
const G = JSON.parse(readFileSync(new URL('../stage3/data/genome.json', import.meta.url), 'utf8'));
const all = G.genes.filter((g) => g.kind === 'protein');
const make = (seed) => createDividingCell({
  createExpression, createMetabolism, net, seed, genomeLength: G.meta.genomeLength,
  genes: all.map(({ nt, aa, mrna, ptn }) => ({ nt, aa, mrna, ptn })),
  info: all.map(({ tag, name, product, start, end, strand }) => ({ tag, name, product, start, end, strand })),
});

let failed = 0;
const check = (ok, msg) => { console.log(`${ok ? '✓' : '✗'} ${msg}`); if (!ok) failed++; };
const sum = (a) => a.reduce((s, x) => s + x, 0);

// 1. Cycles emerge: replication fires, takes the time the fork speed dictates, and the cell divides.
{
  const c = make(1);
  let p0 = null, p1 = null, ribo = [];
  const gen0 = c.gen;
  while (c.t < 6 * 3600 && c.divisions.length < 3) {
    const g = c.gen, before = sum(Array.from(c.expr.prot));
    c.advance(c.t + 60);
    if (c.gen !== g && p0 == null) { p0 = before; p1 = sum(Array.from(c.expr.prot)); }
    const s = c.snapshot(); ribo.push([s.cell.gen, s.ribo.total]);
  }
  const d = c.divisions;
  check(d.length >= 3, `the cell divided ${d.length} times in ${(c.t / 3600).toFixed(1)} h`);
  const full = d.slice(1); // the first cycle started mid-way
  check(full.every((x) => x.age > 60 * 60 && x.age < 180 * 60), `cycle times ${full.map((x) => (x.age / 60).toFixed(0) + ' min').join(', ')} (the lab: ~105 min)`);
  const repDur = full.filter((x) => x.tInit != null && x.tCopied != null).map((x) => (x.tCopied - x.tInit) / 60);
  const want = G.meta.genomeLength / 2 / REP.fork / 60;
  check(repDur.length && repDur.every((m) => Math.abs(m - want) < 1.5), `replication takes ${repDur.map((m) => m.toFixed(1)).join(', ')} min = half the chromosome at ${REP.fork} nt/s (${want.toFixed(1)} min)`);
  check(Math.abs(p1 / p0 - 0.5) < 0.01, `division splits the proteome binomially: ${p0} → ${p1} (${(p1 / p0).toFixed(3)})`);
  const g1 = ribo.filter(([g]) => g === gen0 + 1).map(([, r]) => r);
  check(g1.length && g1[g1.length - 1] / g1[0] > 1.6, `ribosomes are made from ribosomal proteins and compound: ${g1[0]} at birth → ${g1[g1.length - 1]} before division`);
  check(full.every((x) => Math.abs(x.birthMass - 1) < 0.1), `daughters are born near the birth mass: ${full.map((x) => x.birthMass.toFixed(2)).join(', ')}`);
}
// 2. Without DnaA the chromosome is never copied, so the cell keeps growing and never divides.
{
  const c = make(2), iA = all.findIndex((g) => g.name === 'dnaA');
  c.advance(c.t + 60);
  while (c.rep.phase !== 'assembling' && c.t < 4 * 3600) c.advance(c.t + 60); // wait for a fresh cycle
  const g0 = c.gen; c.setPromoter(iA, 0);
  c.advance(c.t + 5 * 3600);
  const s = c.snapshot();
  // DnaA already made can fire the origin once more; its daughters never can
  check(c.gen <= g0 + 1 && s.cell.mass > 2.5 && s.cell.rep.phase === 'assembling',
    `dnaA knocked out: ${c.gen - g0} division(s) in 5 h, then none; mass ${s.cell.mass.toFixed(2)}× birth, DnaA ${s.cell.dnaA}: the origin never fires`);
}
// 3. Determinism.
{
  const a = make(5), b = make(5); a.advance(1200); b.advance(1200);
  check(a.expr.prot.join() === b.expr.prot.join() && a.rep.fil === b.rep.fil, 'same seed gives identical runs');
}
if (failed) { console.log(`\n${failed} failed`); process.exit(1); }
console.log('\nall passed');

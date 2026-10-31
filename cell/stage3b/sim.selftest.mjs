// Known-answer checks for the stage 3b whole-genome expression engine (cell/stage3b/sim.js).
//   node cell/stage3b/sim.selftest.mjs
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const src = readFileSync(new URL('./sim.js', import.meta.url), 'utf8');
const mod = { exports: {} };
vm.runInNewContext(src, { module: mod, Math, Float64Array, Int32Array, Array, Object, Infinity });
const { createExpression } = mod.exports;
const genes = JSON.parse(readFileSync(new URL('../stage3/data/genome.json', import.meta.url), 'utf8')).genes
  .filter((g) => g.kind === 'protein').map(({ tag, nt, aa, mrna, ptn }) => ({ tag, nt, aa, mrna, ptn }));

let failed = 0;
const check = (ok, msg) => { console.log(`${ok ? '✓' : '✗'} ${msg}`); if (!ok) failed++; };
const sum = (a) => a.reduce((s, x) => s + x, 0);
const within = (x, want, tol) => Math.abs(x / want - 1) <= tol;

// 1. Steady state: the calibration holds on average and the machines are loaded as predicted.
{
  const sim = createExpression(genes, {}, 3);
  const P0 = sum(Array.from(sim.prot));
  sim.advance(1800);
  let busyR = 0, busyP = 0, mTot = 0, n = 0;
  for (let k = 0; k < 120; k++) { sim.advance(sim.t + 30); const s = sim.snapshot(); busyR += s.ribo.busy; busyP += s.rnap.busy; mTot += sum(Array.from(s.m)); n++; }
  busyR /= n; busyP /= n; mTot /= n;
  const P1 = sum(Array.from(sim.prot)), wantM = sum(Array.from(sim.calib.mMean));
  check(within(busyR, sim.calib.busyRibo, 0.08), `busy ribosomes ${busyR.toFixed(0)} ≈ predicted ${sim.calib.busyRibo.toFixed(0)} of 503`);
  check(within(busyP, sim.calib.busyRNAP, 0.15), `busy RNA polymerases ${busyP.toFixed(1)} ≈ predicted ${sim.calib.busyRNAP.toFixed(1)} of 187`);
  check(within(mTot, wantM, 0.12), `mRNA in the cell ${mTot.toFixed(0)} ≈ published mean ${wantM.toFixed(0)}`);
  check(within(P1, P0, 0.05), `total protein holds steady over 1.5 h: ${P0} → ${P1}`);
  // Single genes wander (a rare, highly translated mRNA makes proteins in huge bursts), so check
  // the typical gene: the median of simulated / measured across all measured genes.
  const ratios = genes.map((g, i) => g.ptn ? sim.prot[i] / g.ptn : null).filter((r) => r != null).sort((a, b) => a - b);
  const med = ratios[ratios.length >> 1];
  check(within(med, 1, 0.1), `typical gene sits at its measured count: median simulated/measured = ${med.toFixed(2)}`);
}
// 2. Determinism: a seed is a permalink.
{
  const a = createExpression(genes, {}, 9), b = createExpression(genes, {}, 9);
  a.advance(300); b.advance(300);
  check(a.snapshot().totals.events === b.snapshot().totals.events && a.prot.join() === b.prot.join(), 'same seed gives identical runs');
}
// 3. Knockout: the gene's mRNA vanishes within minutes; its protein only dilutes away.
{
  const sim = createExpression(genes, {}, 4), g = genes.findIndex((x) => x.ptn > 300 && x.mrna > 1);
  sim.advance(600); sim.setPromoter(g, 0); const p0 = sim.prot[g];
  sim.advance(sim.t + 1800);
  const want = p0 * Math.exp(-sim.calib.dP * 1800);
  check(sim.m[g] === 0, `knocked-out ${genes[g].tag}: no mRNA left after 30 min (${sim.m[g]})`);
  check(within(sim.prot[g], want, 0.12), `its protein dilutes as e^(−t/τ): ${sim.prot[g]} vs expected ${want.toFixed(0)}`);
}
// 4. The machine budget is real: halving ribosomes cuts protein production.
{
  const rate = (ribo) => { const sim = createExpression(genes, {}, 6); sim.setMachines(null, ribo); sim.advance(900); const a = sim.snapshot().totals.tl; sim.advance(2700); return (sim.snapshot().totals.tl - a) / 1800; };
  const full = rate(503), half = rate(250);
  check(half < full * 0.75, `halving ribosomes slows protein production: ${full.toFixed(2)}/s → ${half.toFixed(2)}/s`);
}
// 5. Burden: overexpressing one gene 50× takes ribosomes from all the others.
{
  const sim = createExpression(genes, {}, 8), g = genes.findIndex((x) => x.aa > 400 && x.ptn > 50);
  sim.advance(1200); const base = sim.snapshot();
  sim.setPromoter(g, 50); sim.advance(sim.t + 3600); const after = sim.snapshot();
  const others = (s) => sum(Array.from(s.prot).filter((_, i) => i !== g));
  check(after.ribo.busy > base.ribo.busy && others(after) < others(base), `overexpressing ${genes[g].tag}: busy ribosomes ${base.ribo.busy} → ${after.ribo.busy}, other proteins ${others(base)} → ${others(after)}`);
}
if (failed) { console.log(`\n${failed} failed`); process.exit(1); }
console.log('\nall passed');

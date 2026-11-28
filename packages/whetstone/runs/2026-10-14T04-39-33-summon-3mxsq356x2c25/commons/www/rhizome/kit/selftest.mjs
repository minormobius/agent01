// rhizome-kit selftest. `node cli.mjs health` runs the first check only; `node cli.mjs selftest` runs all.
// Each check names what it would catch. Exit 0 = all pass.
import { LATTICES, run, spanAt, rng } from './clone.mjs';
const GOLD = { // case B, seed 7, 120 steps. sq4 = the digits of miniphim.minomobi.com/rhizome/oborny.js (the page), checked 10-14.
  sq4: '{"sg":3.93,"sb":0.03,"ig":40.03,"ib":41.57}',
  sq8: '{"sg":22.01,"sb":1.06,"ig":19.45,"ib":27.31}',  // pinned by this kit on first run (regression only)
  tri6: '{"sg":9.4,"sb":0.35,"ig":32.25,"ib":37.71}' };
const thresh = (lat, L, n, seed) => { const R = rng(seed); let s = 0, s2 = 0;
  for (let i = 0; i < n; i++) { const p = spanAt(lat, L, R); s += p; s2 += p * p; }
  const m = s / n; return { m, se: Math.sqrt((s2 / n - m * m) / (n - 1)) }; };
export async function main(healthOnly = false) {
  let fail = 0; const ok = (c, msg) => { console.log((c ? 'ok   ' : 'FAIL ') + msg); if (!c) fail++; };
  const g = JSON.stringify(run('B', 7, { lat: 'sq4' }, 120));
  ok(g === GOLD.sq4, `sq4 twin of the page's oborny.js, case B seed 7 step 120: ${g}`);
  if (healthOnly) return fail ? 1 : 0;
  for (const lat of ['sq8', 'tri6']) { const x = JSON.stringify(run('B', 7, { lat }, 120)); ok(x === GOLD[lat], `${lat} pinned digits: ${x}`); }
  for (const lat of ['sq4', 'sq8', 'tri6', 'sq4x']) { const { m, se } = thresh(lat, 64, 300, 1), z = (m - LATTICES[lat].pc) / se;
    ok(Math.abs(z) < 3.5, `${lat} site percolation at ${m.toFixed(4)} ± ${se.toFixed(4)}, known ${LATTICES[lat].pc} (z ${z.toFixed(1)}): the neighbour table is the lattice it says`); }
  // mutant 1: Moore with one corner missing must miss 0.4073 by a mile, or the threshold check can't catch a wrong table
  LATTICES.mut = { offs: LATTICES.sq8.offs.slice(0, 7), pc: NaN };
  const mu = thresh('mut', 64, 300, 1); delete LATTICES.mut;
  ok((mu.m - 0.4072531) / mu.se > 10, `mutant: sq8 minus one corner spans at ${mu.m.toFixed(4)}, far from 0.4073 (caught)`);
  // mutant 2: the paper's mechanism. Without the 0.9 plateau the integrator should die; with it, survive.
  const alive = wmode => [0, 1, 2].filter(r => { const c = run('B', 1000 * r + 7, { wmode, lat: 'sq4' }); return c.ig + c.ib > 0; }).length;
  const ac = alive('clamp'), al = alive('linear');
  ok(ac === 3 && al === 0, `case B, 3 runs: integrator alive ${ac}/3 with the plateau, ${al}/3 without (control works)`);
  console.log(fail ? `${fail} FAILED` : 'all passed'); return fail ? 1 : 0;
}

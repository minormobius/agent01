// rhizome-kit selftest. `node cli.mjs health` runs the first check only; `node cli.mjs selftest` runs all.
// Each check names what it would catch. Exit 0 = all pass.
import { LATTICES, run, spanAt, rng, voronoi } from './clone.mjs';
import { buildMaze, runMaze } from './maze.mjs';
const GOLD = { // case B, seed 7, 120 steps. sq4 = the digits of miniphim.minomobi.com/rhizome/oborny.js (the page), checked 10-14.
  sq4: '{"sg":3.93,"sb":0.03,"ig":40.03,"ib":41.57}',
  sq8: '{"sg":22.01,"sb":1.06,"ig":19.45,"ib":27.31}',  // pinned by this kit on first run (regression only)
  tri6: '{"sg":9.4,"sb":0.35,"ig":32.25,"ib":37.71}',
  hex6c: '{"sg":12.88,"sb":0.53,"ig":28.83,"ib":34.89}', // pinned 10-14 (regression only), as are the three below
  vor: '{"sg":12.28,"sb":0.25,"ig":28.71,"ib":37.84}',
  rock: '{"sg":4.44,"sb":0.08,"ig":29.84,"ib":33.11}',   // sq8, rock 0.2
  maze: '4801 1904 14 7.668 2.037' };                    // maze seed 1: open, path length, food; integrator seed 7, 200 steps: path %, dead-end %
const thresh = (lat, L, n, seed) => { const R = rng(seed); let s = 0, s2 = 0;
  for (let i = 0; i < n; i++) { const p = spanAt(lat, L, R); s += p; s2 += p * p; }
  const m = s / n; return { m, se: Math.sqrt((s2 / n - m * m) / (n - 1)) }; };
export async function main(healthOnly = false) {
  let fail = 0; const ok = (c, msg) => { console.log((c ? 'ok   ' : 'FAIL ') + msg); if (!c) fail++; };
  const g = JSON.stringify(run('B', 7, { lat: 'sq4' }, 120));
  ok(g === GOLD.sq4, `sq4 twin of the page's oborny.js, case B seed 7 step 120: ${g}`);
  if (healthOnly) return fail ? 1 : 0;
  for (const lat of ['sq8', 'tri6', 'hex6c', 'vor']) { const x = JSON.stringify(run('B', 7, { lat }, 120)); ok(x === GOLD[lat], `${lat} pinned digits: ${x}`); }
  for (const lat of ['sq4', 'sq8', 'tri6', 'sq4x', 'vor']) { const { m, se } = thresh(lat, lat === 'vor' ? 48 : 64, lat === 'vor' ? 150 : 300, 1), z = (m - LATTICES[lat].pc) / se;
    ok(Math.abs(z) < 3.5, `${lat} site percolation at ${m.toFixed(4)} ± ${se.toFixed(4)}, known ${LATTICES[lat].pc} (z ${z.toFixed(1)}): the neighbour table is the lattice it says`); }
  const rk = JSON.stringify(run('B', 7, { lat: 'sq8', rock: 0.2 }, 120)); ok(rk === GOLD.rock, `sq8 with 20% rock, pinned digits: ${rk}`);
  { const M = buildMaze(1), r = runMaze(M, 'integrator', 7, 200), x = `${M.open} ${M.len} ${M.food} ${r.path.toFixed(3)} ${r.dead.toFixed(3)}`;
    ok(x === GOLD.maze && M.open === 49 * 49 * 2 - 1, `maze: a perfect maze has 2·49²−1 = 4801 open squares, pinned run: ${x}`); }
  // Voronoi: on a torus every cell's neighbours must be mutual and the mean degree exactly 6 (Euler). A dropped edge breaks both.
  const vstruct = g => { let asym = 0; for (let i = 0; i < g.N; i++) for (let e = g.off[i]; e < g.off[i + 1]; e++) { const j = g.nb[e]; let f = false;
      for (let k = g.off[j]; k < g.off[j + 1]; k++) if (g.nb[k] === i) f = true; if (!f) asym++; } return { asym, deg: g.nb.length / g.N }; };
  { const g = voronoi(30, rng(5), true), v = vstruct(g); ok(v.asym === 0 && Math.abs(v.deg - 6) < 1e-12, `vor torus 30²: ${v.asym} one-way links, mean degree ${v.deg}`);
    const nb = [], off = new Int32Array(g.N + 1); for (let i = 0; i < g.N; i++) { for (let e = g.off[i]; e < g.off[i + 1] - 1; e++) nb.push(g.nb[e]); off[i + 1] = nb.length; }
    const vm = vstruct({ N: g.N, off, nb }); ok(vm.asym > 0 && vm.deg < 5.5, `mutant: vor with each cell's last edge dropped has ${vm.asym} one-way links, degree ${vm.deg.toFixed(2)} (caught)`); }
  // hex6c is a cylinder: no side edges, so it spans early at finite L, by a gap that should shrink like L^-3/4 (x2.83 from 32 to 128).
  { const a = thresh('hex6c', 32, 400, 1), b = thresh('hex6c', 128, 150, 1), ga = a.m - 0.5, gb = b.m - 0.5, ratio = ga / gb;
    ok(ga < 0 && gb < 0 && ratio > 1.8 && ratio < 4.5, `hex6c cylinder: gap to 1/2 is ${ga.toFixed(4)} at L=32 and ${gb.toFixed(4)} at L=128, ratio ${ratio.toFixed(2)} (expect ~2.8): closing on 1/2`); }
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

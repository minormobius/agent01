/* node games/fathom/test/fathom.selftest.mjs
 *
 * Fathom's promises, checked:
 *   - the onion is a sound graph: symmetric, no self-links, and its shells
 *     link only to the shells next to them, through overlaps big enough to see;
 *   - numbers cross the layers: nearly every cell has cells to count below it;
 *   - zeros flood only along their own shell (going deeper is your own tap);
 *   - the water gets denser with depth;
 *   - every size makes boards that clear from the first tap by deduction alone,
 *     deterministically, with the first cell and its neighbours clear.
 * Picked up by scripts/preflight.mjs when games/ is touched.
 */
import { loadFathom } from "./harness.mjs";
const { O, F } = await loadFathom();
let fails = 0;
const ck = (c, msg) => { console.log((c ? "  ✓ " : "  ✗ ") + msg); if (!c) fails++; };

console.log("the onion");
for (const size of Object.keys(F.SIZES)) {
  const m = F.build(size, "st-" + size), K = m.K, per = m.per;
  const sym = m.nbrs.every((ns, i) => ns.every((j) => m.nbrs[j].includes(i)) && !ns.includes(i) && new Set(ns).size === ns.length);
  const adj = m.nbrs.every((ns, i) => ns.every((j) => Math.abs(F.shellOf(m, i) - F.shellOf(m, j)) <= 1));
  let under = 0, withBelow = 0; for (let i = 0; i < (K - 1) * per; i++) { under += m.down[i].length; if (m.down[i].length) withBelow++; }
  const deg = m.nbrs.reduce((a, b) => a + b.length, 0) / m.n;
  ck(sym && adj && m.n === K * per, `${size}: ${K} shells × ${per}, symmetric, links only to the next shell (${deg.toFixed(1)} neighbours a cell)`);
  ck(withBelow / ((K - 1) * per) > 0.97 && under / ((K - 1) * per) > 2, `${size}: numbers reach the layer below — ${(100 * withBelow / ((K - 1) * per)).toFixed(0)}% of cells count cells under them, ${(under / ((K - 1) * per)).toFixed(1)} each`);
  ck(m.radii.every((r, k) => k === 0 || r < m.radii[k - 1]) && m.radii[K - 1] > F.RCORE, `${size}: shells nest, outside in, round the core`);
}
{ // no sliver overlaps: every link between shells covers a real share of a cell
  const m = F.build("deep", "sliver"), N = 400 * m.per, cnt = new Map();
  const ga = Math.PI * (3 - Math.sqrt(5));
  for (let s = 0; s < N; s++) {
    const z = 1 - 2 * (s + 0.5) / N, r = Math.sqrt(1 - z * z), x = r * Math.cos(ga * s), y = r * Math.sin(ga * s);
    const a = O.cellAt(m.shells[0], x, y, z), b = O.cellAt(m.shells[1], x, y, z), key = a + "," + b; cnt.set(key, (cnt.get(key) || 0) + 1);
  }
  let worst = 1; m.down.slice(0, m.per).forEach((ds, a) => ds.forEach((b) => { worst = Math.min(worst, (cnt.get(a + "," + (b - m.per)) || 0) / 400); }));
  ck(worst > 0.05, `every link between shells is a real overlap (the smallest is ${(100 * worst).toFixed(0)}% of a cell)`);
}

console.log("rules");
{
  const m = F.build("deep", "rules"), c = F.SIZES.deep, s = O.newState(m, c.m), g = O.generate(m, c.m, 5, "r1");
  O.plant(s, g.mines); const op = O.reveal(s, 5);
  ck(op.length > 1 && op.every((i) => F.shellOf(m, i) === 0), `the first tap floods its own shell only (${op.length} cells, all on the outside)`);
  const z = op.find((i) => s.count[i] === 0), below = z != null ? m.down[z] : [];
  ck(z != null && below.length > 0 && below.every((j) => !s.mine[j] && !s.open[j]), "a zero's cells below are safe, and left for you to open");
  // denser with depth: mines per cell by shell, over many deals
  const by = new Array(m.K).fill(0); for (let t = 0; t < 40; t++) { const rng = O.rngFor("dens", t); O.randomMines(m, c.m, 5, rng).forEach((i) => by[F.shellOf(m, i)]++); }
  ck(by.every((v, k) => k === 0 || v > by[k - 1]), `the water gets denser with depth (mines per shell over 40 deals: ${by.join(" < ")})`);
}

console.log("generator: every size, proved guess-free");
for (const [size, c] of Object.entries(F.SIZES)) {
  const m = F.build(size, "gen-" + size); let ok = true, det = true, clear = true, t0 = Date.now();
  for (let t = 0; t < 8; t++) {
    const first = (t * 37) % m.per, g = O.generate(m, c.m, first, "g" + t), r = O.solveFrom(m, g.mines, first);
    ok = ok && r.solved && g.mines.length === c.m;
    clear = clear && !g.mines.includes(first) && !m.nbrs[first].some((j) => g.mines.includes(j));
    if (t === 0) det = JSON.stringify(O.generate(m, c.m, first, "g0").mines) === JSON.stringify(g.mines);
  }
  ck(ok && clear && det, `${size}: 8 seas, each clears from its first tap by deduction alone; first cell and neighbours clear; same seed, same sea (${((Date.now() - t0) / 8).toFixed(0)} ms each)`);
}

console.log(fails ? `\n${fails} failure(s)` : "\nall fathom invariants hold");
process.exit(fails ? 1 : 0);

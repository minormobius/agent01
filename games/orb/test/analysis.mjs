/* node games/orb/test/analysis.mjs [trials]
 *
 * THE QUESTION: does Minesweeper stay solvable on a Voronoi mesh?
 *
 * Measured as: deal mines uniformly at random (first cell and its neighbours
 * kept clear, as the game does), then play from that first cell by exact
 * deduction alone. Report the fraction of deals that clear without a single
 * guess, by mine density, on four meshes of ~400 cells:
 *
 *   square8  the classic 8-neighbour grid (on a torus: no edges)
 *   hex6     regular hexagons — same degree as the sphere's average
 *   orb      the game's spherical Voronoi (2 Lloyd rounds)
 *   orb-raw  spherical Voronoi with no relaxation — maximal irregularity
 *
 * The density that matters is mines per neighbourhood, not per cell, so the
 * table also prints expected mines-around-a-cell (density × degree).
 *
 * A measurement, not a gate.
 */
import { loadOrb, squareTorus, hexTorus } from "./harness.mjs";

const O = await loadOrb();
const trials = +(process.argv[2] || 60);

const meshes = {
  square8: squareTorus(20, 20),
  hex6: hexTorus(20, 20),
  orb: O.buildMesh("analysis", 400, 2),
  "orb-raw": O.buildMesh("analysis", 400, 0),
};
const degree = (m) => m.nbrs.reduce((a, b) => a + b.length, 0) / m.n;

const densities = [0.10, 0.12, 0.14, 0.16, 0.18, 0.20, 0.22];
console.log(`guess-free rate of uniform random deals, ${trials} trials per cell\n`);
console.log("mesh      deg   " + densities.map((d) => `${(d * 100).toFixed(0)}%`.padStart(11)).join(""));
for (const [name, m] of Object.entries(meshes)) {
  const deg = degree(m);
  let row = `${name.padEnd(9)} ${deg.toFixed(2)} `;
  for (const d of densities) {
    const M = Math.round(m.n * d);
    let ok = 0, hard = 0;
    for (let t = 0; t < trials; t++) {
      const rng = O.rngFor("an", name, d, t);
      const first = rng.int(0, m.n - 1);
      const mines = O.randomMines(m, M, first, rng);
      const r = O.solveFrom(m, mines, first);
      if (r.solved) { ok++; if (r.hardest === 3) hard++; }
    }
    row += `${String(Math.round((100 * ok) / trials)).padStart(4)}% (${(d * deg).toFixed(1)})`;
  }
  console.log(row);
}

console.log("\nthe game's own tiers: what the no-guess generator costs, and how hard its boards are");
console.log("(a 'hard moment' is a point in the solve where no single number settles anything:");
console.log(" it takes two overlapping numbers, or the exact solver. Easy rounds are not counted.)");
for (const [n, M] of Object.values(O.SIZES).map((c) => [c.n, c.m])) {
  const mesh = O.buildMesh("gen", n, 2);
  let deals = 0, repairs = 0, ms = 0, h2 = 0, h3 = 0; const times = [];
  const T = Math.min(trials, 30);
  for (let t = 0; t < T; t++) {
    const t0 = performance.now();
    const g = O.generate(mesh, M, t % n, "g" + t);
    const dt = performance.now() - t0; ms += dt; times.push(dt); deals += g.deals; repairs += g.repairs;
    const r = O.solveFrom(mesh, g.mines, t % n); h2 += r.levels[2]; h3 += r.levels[3];
  }
  times.sort((a, b) => a - b);
  const hh = [];
  for (let t = 0; t < Math.min(T, 6); t++) hh.push(O.generateHard(mesh, M, t % n, "hh" + t, Object.values(O.SIZES).find((c) => c.n === n).climb).hard);
  hh.sort((a, b) => a - b);
  console.log(`  ${String(n).padStart(4)} cells / ${String(M).padStart(3)} mines (${(100 * M / n).toFixed(1)}%): ${(deals / T).toFixed(2)} deals, ${(repairs / T).toFixed(1)} repairs, median ${times[T >> 1].toFixed(0)} ms, worst ${times[T - 1].toFixed(0)} ms | hard moments per board: ${(h2 / T).toFixed(1)} two-number, ${(h3 / T).toFixed(1)} exact | hard mode: median ${hh[hh.length >> 1]} (${hh[0]}–${hh[hh.length - 1]})`);
}

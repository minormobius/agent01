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

console.log("\nthe game's own sizes (no-guess generator: deals and repairs per board, time)");
for (const [n, M] of [[160, 22], [320, 52], [600, 105]]) {
  const mesh = O.buildMesh("gen", n, 2);
  let deals = 0, repairs = 0, ms = 0, lv3 = 0;
  const T = Math.min(trials, 30);
  for (let t = 0; t < T; t++) {
    const t0 = performance.now();
    const g = O.generate(mesh, M, t % n, "g" + t);
    ms += performance.now() - t0; deals += g.deals; repairs += g.repairs; if (g.hardest === 3) lv3++;
  }
  console.log(`  ${n} cells / ${M} mines: ${(deals / T).toFixed(2)} deals, ${(repairs / T).toFixed(1)} repairs, ${(ms / T).toFixed(0)} ms, ${Math.round(100 * lv3 / T)}% need exact reasoning`);
}

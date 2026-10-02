/* node games/twelve/test/analysis.mjs [games]
 *
 * The balance report: how far random and greedy play get, on Twelve's
 * boards and on classic 2048 grids measured by the same simulator. The
 * classic rows are the calibration — 4×4 random ≈ 128 and greedy ≈ 256 are
 * the known numbers; if they drift, the simulator is wrong, not the game.
 */
import { loadTwelve, gridEnv, play, random, greedy } from "./harness.mjs";
const T = await loadTwelve(), N = +(process.argv[2] || 60);
const rows = [["2048 4×4", gridEnv(4), 1], ["2048 5×5", gridEnv(5), 1], ["2048 6×6", gridEnv(6), 1]];
for (const k of Object.keys(T.MODES)) rows.push([`twelve ${T.MODES[k].label}`, T.setup(T.MODES[k].sphere), T.MODES[k].drop]);
const fmt = (R) => { const h = {}; R.forEach((x) => (h[x.top] = (h[x.top] || 0) + 1)); const ms = R.map((x) => x.moves).sort((a, b) => a - b);
  return `median ${String(ms[R.length >> 1]).padStart(5)} moves${R.some((x) => x.capped) ? " (some capped)" : ""} · top ` + Object.entries(h).map(([a, b]) => `${a}×${b}`).join(" "); };
for (const [name, env, drop] of rows) for (const [pn, pol] of [["random", random], ["greedy", greedy]]) {
  const R = []; for (let i = 0; i < N; i++) R.push(play(T, env, pol, `${name}:${pn}:${i}`, drop, 6000));
  console.log(`${name.padEnd(34)} ${pn.padEnd(6)} ${fmt(R)}`);
}

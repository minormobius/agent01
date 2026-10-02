/* node games/twelve/test/analysis.mjs [games]
 *
 * The balance report: how far random and greedy play get on every board and
 * flow of Twelve, and on classic 2048 grids measured by the same simulator. The
 * classic rows are the calibration — 4×4 random ≈ 128 and greedy ≈ 256 are
 * the known numbers; if they drift, the simulator is wrong, not the game.
 */
import { loadTwelve, gridEnv, play, playGame, random, greedy } from "./harness.mjs";
const T = await loadTwelve(), N = +(process.argv[2] || 60);
const fmt = (R) => { const h = {}; R.forEach((x) => (h[x.top] = (h[x.top] || 0) + 1)); const ms = R.map((x) => x.moves).sort((a, b) => a - b);
  return `median ${String(ms[R.length >> 1]).padStart(5)} moves${R.some((x) => x.capped) ? " (some capped)" : ""} · top ` + Object.entries(h).map(([a, b]) => `${a}×${b}`).join(" "); };
for (const k of [4, 5]) for (const [pn, pol] of [["random", random], ["greedy", greedy]]) {
  const R = []; for (let i = 0; i < N; i++) R.push(play(T, gridEnv(k), pol, `2048-${k}:${pn}:${i}`, 1, 6000));
  console.log(`${("2048 " + k + "×" + k).padEnd(46)} ${pn.padEnd(6)} ${fmt(R)}`);
}
for (const k of Object.keys(T.MODES)) for (const flow of T.flows(k)) for (const [pn, pol] of [["random", random], ["greedy", greedy]]) {
  const R = []; for (let i = 0; i < N; i++) R.push(playGame(T, k, flow, pol, `${k}:${flow}:${pn}:${i}`));
  console.log(`${(T.MODES[k].label + " · " + flow).padEnd(46)} ${pn.padEnd(6)} ${fmt(R)}`);
}

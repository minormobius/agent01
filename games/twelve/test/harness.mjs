/* Loads Twelve's engine (and the One Coast spheres it borrows) into node. */
import { fileURLToPath } from "node:url";
import path from "node:path";
const here = path.dirname(fileURLToPath(import.meta.url));
export async function loadTwelve() {
  await import(path.join(here, "../../onecoast/js/geo.js"));
  await import(path.join(here, "../js/engine.js"));
  return globalThis.TWELVE;
}
/* Classic k×k 2048 in the same shape (four "drains" = the walls), so the
   one simulator measures both and the comparison is fair. */
export function gridEnv(k) {
  const n = k * k, drains = [];
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const down = new Int32Array(n), d = [];
    for (let i = 0; i < n; i++) { const x = i % k, y = (i / k) | 0, nx = x + dx, ny = y + dy;
      down[i] = nx < 0 || ny < 0 || nx >= k || ny >= k ? -1 : ny * k + nx;
      d.push(dx > 0 ? k - 1 - x : dx < 0 ? x : dy > 0 ? k - 1 - y : y); }
    drains.push({ down, order: [...Array(n).keys()].sort((a, b) => d[a] - d[b] || a - b) });
  }
  return { s: { n, pent: new Uint8Array(n) }, drains };
}
/* Play one game with a policy; drop = new tiles per move. */
export function play(T, env, policy, seed, drop, cap = 20000) {
  const rnd = T.rngFrom(seed), n = env.s.n, hole = env.s.pent;
  const spawn = (g) => { const e = []; for (let i = 0; i < n; i++) if (!g[i] && !hole[i]) e.push(i); if (!e.length) return; g[e[Math.floor(rnd() * e.length)]] = rnd() < 0.9 ? 2 : 4; };
  let g = new Array(n).fill(0); for (let k = 0; k < drop + 1; k++) spawn(g);
  let moves = 0;
  for (; moves < cap; moves++) {
    const opts = env.drains.map((_, w) => T.pull(env, g, w)).filter((o) => o.moved);
    if (!opts.length) break;
    g = policy(opts, rnd).g; for (let k = 0; k < drop; k++) spawn(g);
  }
  return { moves, top: Math.max(...g), capped: moves >= cap };
}
export const empties = (g) => g.filter((x) => !x).length;
export const random = (o, r) => o[Math.floor(r() * o.length)];
export const greedy = (o) => o.reduce((a, b) => (b.score + 2 * empties(b.g) > a.score + 2 * empties(a.g) ? b : a));

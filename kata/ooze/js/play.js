/* OOZE — a level, played: the AMOEBA engine (../../amoeba/js/amoeba.js, the same site, imported) set up for a level,
   stepped, and judged; and the bot that flies it along the oracle's route. No DOM (the page's worker uses it; so do
   the tests). */
import { makeAmoeba, step, centre, NUC_A } from "../../amoeba/js/amoeba.js";
import { engineWalls } from "./game.js";

/* a cell at the level's start, its walls, its food, its energy */
export function setup(level, opts = {}) {
  const A = makeAmoeba(4, undefined, opts);
  // (move the cell to the start)
  const s = level.start; for (let i = 0; i < A.nv; i++) { A.P[i * 4] += s[0]; A.P[i * 4 + 2] += s[1]; A.P[i * 4 + 3] += s[2]; } A.nuc.c[0] += s[0]; A.nuc.c[2] += s[1]; A.nuc.c[3] += s[2];
  A.obstacles = engineWalls(level); A.foods = level.foods.map((f) => Float64Array.from([f[0], 0.12, f[1], f[2]])); A.keepFood = 0;
  A.energy = level.E0; A.eMax = level.eMax; A.foodE = level.foodE; A.noGrow = true; A.V00 = A.V0;
  A.game = { level, state: "playing", starvedFor: 0, t0: 0 };
  return A;
}
/* where the cell is on the floor (x, z, w) */
export const floorPos = (A) => { const c = centre(A); return [c[0], c[2], c[3]]; };
/* one step, and the verdict: won (its middle within the goal), starved (no energy, and three seconds without), or on */
export function play(A) {
  const g = A.game; if (g.state !== "playing") return g.state;
  step(A);
  const p = floorPos(A), G = g.level.goal; if (Math.hypot(p[0] - G.c[0], p[1] - G.c[1], p[2] - G.c[2]) < G.r) g.state = "won";
  if (A.energy <= 0) { g.starvedFor += A.par.dt; if (g.starvedFor > 3) g.state = "starved"; } else g.starvedFor = 0;
  return g.state;
}
/* the bot: pure pursuit along the oracle's path. It steers at the point LOOK radii further along the path than the
   nearest point to the cell's middle */
export function bot(A, path, look = 1.5) {
  const p = floorPos(A); let k = 0, bd = Infinity; const from = A.botK || 0;
  for (let i = from; i < Math.min(path.length, from + 80); i++) { const q = path[i], dd = Math.hypot(q[0] - p[0], q[1] - p[1], q[2] - p[2]); if (dd < bd) { bd = dd; k = i; } }
  A.botK = k; let acc = 0, j = k; while (j + 1 < path.length && acc < look) { acc += Math.hypot(...path[j + 1].map((x, c) => x - path[j][c])); j++; }
  const t = path[j], dx = t[0] - p[0], dz = t[1] - p[1], dw = t[2] - p[2], l = Math.hypot(dx, dz, dw) || 1;
  A.steer = { dir: Float64Array.from([dx / l, 0, dz / l, dw / l]), s: 1 };
}
void NUC_A;

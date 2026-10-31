/* Loads One Side into node, and a simple player for measurements. */
import { fileURLToPath } from "node:url";
import path from "node:path";
const here = path.dirname(fileURLToPath(import.meta.url));
export async function loadOneSide() {
  for (const f of ["maze", "game"]) await import(path.join(here, `../js/${f}.js`));
  return globalThis.ONESIDE;
}
/* A greedy player: at each tile, head for the nearest dot by BFS, refusing
   any way that steps onto (or next to) where a ghost physically is. `wary`
   0 ignores ghosts entirely. */
export function bot(M, G, wary = 1) {
  const P = G.pac, mz = G.maze;
  if (P.p !== 0 && P.moving) return;
  const danger = new Set();
  if (wary) G.ghosts.forEach((g) => { if (g.state !== "out" || g.fright) return; const s = G.seen(g), x = Math.round(s[0]), y = Math.round(s[1]); for (let a = -wary; a <= wary; a++) for (let b = -wary; b <= wary; b++) if (Math.abs(a) + Math.abs(b) <= wary) danger.add(M.wrapX(x + a) + "," + (y + b)); });
  // BFS from each first step
  let best = -1, bd = Infinity;
  for (let d = 0; d < 4; d++) {
    const sx = M.wrapX(P.x + M.DX[d]), sy = P.y + M.DY[d];
    if (!M.isOpen(mz, sx, sy) || danger.has(sx + "," + sy)) continue;
    const seen = new Set([P.x + "," + P.y, sx + "," + sy]), q = [[sx, sy, 1]]; let found = Infinity;
    for (let h = 0; h < q.length && h < 900; h++) {
      const [x, y, k] = q[h];
      if (mz.dots[y * M.W + x]) { found = k; break; }
      for (let e = 0; e < 4; e++) { const nx = M.wrapX(x + M.DX[e]), ny = y + M.DY[e], key = nx + "," + ny; if (M.isOpen(mz, nx, ny) && !seen.has(key) && !danger.has(key)) { seen.add(key); q.push([nx, ny, k + 1]); } }
    }
    if (found < bd) { bd = found; best = d; }
  }
  if (best < 0) for (let d = 0; d < 4; d++) if (M.isOpen(mz, P.x + M.DX[d], P.y + M.DY[d]) && !danger.has(M.wrapX(P.x + M.DX[d]) + "," + (P.y + M.DY[d]))) { best = d; break; }
  if (best >= 0) G.input(best);
}

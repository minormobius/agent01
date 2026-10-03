/* node games/oneside/test/oneside.selftest.mjs
 *
 * One Side's promises, checked:
 *   - the surface: back() is an involution, the band's 3D shape really puts
 *     a surface point and its back at the same spot, with opposite faces;
 *   - the maze: connected, no dead ends, corridors one tile wide;
 *   - the rules that carry the idea: a ghost on YOUR stretch of the surface
 *     is harmless; a ghost at the back of your spot kills you; ghosts only
 *     ever stand on the maze of their own face; their targets come through
 *     the twist;
 *   - a seed plays the same; clearing the dots clears the level.
 * Picked up by scripts/preflight.mjs when games/ is touched.
 */
import { loadOneSide, bot } from "./harness.mjs";
const M = await loadOneSide();
let fails = 0;
const ck = (c, msg) => { console.log((c ? "  ✓ " : "  ✗ ") + msg); if (!c) fails++; };

console.log("the surface");
{
  let inv = true; for (let x = 0; x < M.W; x++) for (let y = 0; y < M.H; y++) { const b = M.back(x, y), bb = M.back(b[0], b[1]); if (bb[0] !== x || bb[1] !== y || (b[0] === x && b[1] === y)) inv = false; }
  ck(inv, "back() is an involution with no fixed point: every spot has two faces");
  // await-free: view.js needs no DOM for its geometry
  await import(new URL("../js/view.js", import.meta.url));
  let same = 0, opp = 0;
  for (let u = 0.3; u < M.W; u += 1.7) for (let y = 0.5; y < M.H; y += 2.3) {
    const a = M.mob(u, y), b = M.mob(u + M.L, M.H - y), na = M.faceNormal(u, y), nb = M.faceNormal(u + M.L, M.H - y);
    same = Math.max(same, Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])); opp = Math.max(opp, Math.hypot(na[0] + nb[0], na[1] + nb[1], na[2] + nb[2]));
  }
  ck(same < 1e-9 && opp < 1e-3, `the band: a surface point and its back are one spot of the strip (${same.toExponential(0)}), on opposite faces (${opp.toExponential(0)})`);
}

console.log("the maze");
for (const seed of ["a", "b", "c", "d"]) {
  const mz = M.build(seed); let open = 0, dead = 0, fat = 0;
  for (let y = 0; y < M.H; y++) for (let x = 0; x < M.W; x++) {
    if (!M.isOpen(mz, x, y)) continue; open++;
    let n = 0; for (let d = 0; d < 4; d++) if (M.isOpen(mz, x + M.DX[d], y + M.DY[d])) n++; if (n < 2) dead++;
    if (M.isOpen(mz, x + 1, y) && M.isOpen(mz, x, y + 1) && M.isOpen(mz, x + 1, y + 1)) fat++;
  }
  const seen = new Set([mz.start.join()]), q = [mz.start];
  for (let h = 0; h < q.length; h++) for (let d = 0; d < 4; d++) { const nx = M.wrapX(q[h][0] + M.DX[d]), ny = q[h][1] + M.DY[d]; if (M.isOpen(mz, nx, ny) && !seen.has(nx + "," + ny)) { seen.add(nx + "," + ny); q.push([nx, ny]); } }
  ck(dead === 0 && fat === 0 && seen.size === open && M.isOpen(mz, ...mz.spawn), `maze ${seed}: ${open} corridor tiles, all connected, no dead ends, one tile wide`);
}

console.log("the rules");
{
  const G = new M.Game("rules"); G.input(1); G.step(0.01);
  const P = G.pac, g = G.ghosts[0];
  // a ghost standing on your own tile of the surface: that's half a strip from you, on the other face
  Object.assign(g, { x: P.x, y: P.y, p: 0, state: "out", fright: false }); G.collide();
  ck(G.state === "play", "a ghost on your stretch of the surface is harmless (it's half a strip away, physically)");
  const b = M.back(P.x, P.y); Object.assign(g, { x: b[0], y: b[1] }); G.collide();
  ck(G.state === "dying", "a ghost at the back of your spot catches you, through the paper");
}
{
  const G = new M.Game("target"); G.input(1); for (let i = 0; i < 240; i++) G.step(1 / 120);
  G.mode = 1; const T = G.target(G.ghosts[0]), want = M.back(G.pac.x, G.pac.y);
  ck(T[0] === want[0] && T[1] === want[1], "red's chase target is the back of your tile: its signals come from half a strip away");
}
{
  let onRails = true, steps = 0;
  for (let t = 0; t < 4; t++) {
    const G = new M.Game("rails" + t, 3); G.input(1);
    for (let k = 0; k < 120 * 60 && G.state !== "over"; k++) {
      bot(M, G, 1); G.step(1 / 120); if (G.state === "ready") G.input(G.pac.d);
      G.ghosts.forEach((g) => { if (g.state !== "wait" && !M.isOpen(G.maze, g.x, g.y)) onRails = false; if (g.state !== "wait" && g.p > 0 && !M.isOpen(G.maze, g.x + M.DX[g.d], g.y + M.DY[g.d])) onRails = false; });
      if (!M.isOpen(G.maze, G.pac.x, G.pac.y)) onRails = false; steps++;
    }
  }
  ck(onRails, `over ${steps} steps of play, every ghost stands on its own face's corridors and you on yours`);
}
{
  const run = () => { const G = new M.Game("same"); G.input(1); for (let k = 0; k < 120 * 30; k++) { bot(M, G, 1); G.step(1 / 120); if (G.state === "ready") G.input(G.pac.d); } return JSON.stringify([G.score, G.lives, G.pac.x, G.pac.y, G.ghosts.map((g) => [g.x, g.y, g.state])]); };
  ck(run() === run(), "the same seed and the same moves play the same");
}
{
  const G = new M.Game("clear"); G.input(1);
  for (let i = 0; i < G.maze.dots.length; i++) if (G.maze.dots[i] && i !== G.pac.y * M.W + M.wrapX(G.pac.x - 1)) { G.maze.dots[i] = 0; G.left--; }
  for (let k = 0; k < 240 && G.state === "play"; k++) G.step(1 / 120);
  for (let k = 0; k < 240; k++) G.step(1 / 120);
  ck(G.level === 2 && G.ghosts.length === 3 && G.left > 100, `eating the last dot clears the level: a new maze, ${G.ghosts.length} ghosts`);
}

console.log("the fruit");
{
  const G = new M.Game("fruit"); G.input(1);
  let at = -1;
  for (let k = 0; k < 120 * 120 && !G.fruit && G.state !== "over"; k++) { bot(M, G, 2); G.step(1 / 120); if (G.state === "ready") G.input(G.pac.d); if (G.fruit) at = G.eaten; }
  const F = G.fruit, P = G.pac, phys = F && M.back(F.x, F.y);
  const near = F && Math.abs(M.dx(phys[0], P.x)) + Math.abs(phys[1] - P.y) <= 8, onIts = F && M.isOpen(G.maze, F.x, F.y);
  ck(F && at === 70 && F.kind === "cherry" && F.value === 100 && near && onIts, `a cherry after 70 dots, on a corridor of its own face, physically right beside you (${F ? Math.abs(M.dx(phys[0], P.x)) + Math.abs(phys[1] - P.y) : "-"} tiles), so really half a strip away`);
  const s0 = G.score; Object.assign(G.pac, { x: F.x, y: F.y, p: 0 }); G.fruitStep(0.01);
  ck(!G.fruit && G.score === s0 + 100, "you eat it from its own face: +100");
  ck(M.FRUIT[1][0] === "strawberry" && M.FRUIT[12][0] === "key", "the arcade's fruit by level: cherry, strawberry, orange, apple, melon, galaxian, bell, key");
}

console.log("the leaderboard's records");
{
  const { GAME, accept } = await import(new URL("../js/score.js", import.meta.url));
  const ok = { site: "oneside", game: GAME, value: 12340, unit: "points", higherIsBetter: true, createdAt: new Date().toISOString() };
  const bad = [{ ...ok, site: "orb" }, { ...ok, game: "score-v0" }, { ...ok, higherIsBetter: false }, { ...ok, value: 0 }, { ...ok, value: 1.5 }, { ...ok, value: 2e7 }, { ...ok, createdAt: "nope" }];
  ck(accept(ok) && bad.every((v) => !accept(v)), "the board reads back a score, and refuses another game's, a time, a zero, a fraction, an absurd number, a bad date");
}

console.log(fails ? `\n${fails} failure(s)` : "\nall one side invariants hold");
process.exit(fails ? 1 : 0);

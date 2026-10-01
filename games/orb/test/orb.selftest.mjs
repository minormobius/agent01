/* node games/orb/test/orb.selftest.mjs
 *
 * Gates Orb. The load-bearing properties:
 *
 *   1. The mesh is a real spherical Voronoi diagram: Euler holds, adjacency is
 *      symmetric, and every cell's polygon closes around its own site.
 *   2. The solver is SOUND — it never calls a mine safe — and, at level 3,
 *      COMPLETE: it finds every cell that is certain. Both are checked against
 *      brute force over every mine layout on small meshes. Soundness is the
 *      game's whole promise ("no loss here needed a guess").
 *   3. Every generated board clears from its first click by deduction alone,
 *      deterministically, with the first cell and its neighbours clear.
 *
 * Picked up automatically by scripts/preflight.mjs when games/ is touched.
 */
import { loadOrb, squareTorus } from "./harness.mjs";

const O = await loadOrb();
let failures = 0;
const ck = (c, m) => { if (c) console.log(`  ✓ ${m}`); else { failures++; console.error(`  ✗ ${m}`); } };

console.log("mesh");
for (const [n, relax] of [[12, 0], [60, 0], [300, 2], [600, 3]]) {
  const m = O.buildMesh("st" + n, n, relax);
  const sym = m.nbrs.every((ns, i) => ns.every((j) => m.nbrs[j].includes(i)));
  const edges = m.nbrs.reduce((a, b) => a + b.length, 0) / 2;
  const own = m.polys.every((ring, i) => {
    let x = 0, y = 0, z = 0;
    for (const f of ring) { x += m.verts[3 * f]; y += m.verts[3 * f + 1]; z += m.verts[3 * f + 2]; }
    const l = Math.hypot(x, y, z);
    return O.cellAt(m, x / l, y / l, z / l) === i;
  });
  ck(m.tris.length === 2 * n - 4 && edges === 3 * n - 6 && sym && own && m.polys.every((r, i) => r.length === m.nbrs[i].length && r.length >= 3),
    `n=${n} relax=${relax}: V−E+F=2 (${2 * n - 4} tris, ${edges} edges), symmetric, every ring closes on its own site`);
}

console.log("solver vs brute force");
function brute(mesh, open, count, total) {
  const n = mesh.n, canMine = new Uint8Array(n), canSafe = new Uint8Array(n);
  let worlds = 0;
  for (let mask = 0; mask < 1 << n; mask++) {
    let pc = 0; for (let b = mask; b; b &= b - 1) pc++;
    if (pc !== total) continue;
    let good = true;
    for (let i = 0; i < n && good; i++) {
      if (!open[i]) continue;
      if (mask >> i & 1) { good = false; break; }
      let c = 0; for (const j of mesh.nbrs[i]) c += mask >> j & 1;
      if (c !== count[i]) good = false;
    }
    if (!good) continue;
    worlds++;
    for (let i = 0; i < n; i++) (mask >> i & 1 ? canMine : canSafe)[i] = 1;
  }
  return { canMine, canSafe, worlds };
}
const small = [O.buildMesh("bf-a", 14, 0), O.buildMesh("bf-b", 16, 1), squareTorus(4, 4)];
let checked = 0, unsound = 0, incomplete = 0, partialUnsound = 0;
for (let t = 0; t < 400; t++) {
  const mesh = small[t % small.length], n = mesh.n, rng = O.rngFor("bf", t);
  const total = rng.int(2, 5);
  const mines = rng.shuffle([...Array(n).keys()]).slice(0, total);
  const s = O.newState(mesh, total); O.plant(s, mines);
  const open = new Uint8Array(n);
  for (let i = 0; i < n; i++) if (!s.mine[i] && rng.next() < 0.35) open[i] = 1;
  const truth = brute(mesh, open, s.count, total);
  const view = { n, nbrs: mesh.nbrs, open, count: s.count, known: new Uint8Array(n), total };
  const ex = O.deduce(view, { exactOnly: true });
  const exSafe = new Set(ex.safe), exMine = new Set(ex.mine);
  for (let i = 0; i < n; i++) {
    if (open[i]) continue;
    const certSafe = !truth.canMine[i], certMine = !truth.canSafe[i];
    if ((exSafe.has(i) && !certSafe) || (exMine.has(i) && !certMine)) unsound++;
    if ((certSafe && !exSafe.has(i)) || (certMine && !exMine.has(i))) incomplete++;
  }
  const quick = O.deduce(view); // levels 1–2 may stop early but must never lie
  for (const i of quick.safe) if (truth.canMine[i]) partialUnsound++;
  for (const i of quick.mine) if (truth.canSafe[i]) partialUnsound++;
  checked++;
}
ck(unsound === 0, `exact solver sound on ${checked} random views (${unsound} wrong calls)`);
ck(incomplete === 0, `exact solver complete — found every certain cell (${incomplete} missed)`);
ck(partialUnsound === 0, `levels 1–2 sound (${partialUnsound} wrong calls)`);

console.log("generator");
for (const [n, M] of [[160, 22], [320, 52], [600, 105]]) {
  const mesh = O.buildMesh("gen-st", n, 2);
  let all = true, clear = true, det = true;
  for (let t = 0; t < 12; t++) {
    const first = (t * 37) % n;
    const g = O.generate(mesh, M, first, "s" + t);
    const set = new Set(g.mines);
    if (set.size !== M) all = false;
    if (set.has(first) || mesh.nbrs[first].some((j) => set.has(j))) clear = false;
    if (!O.solveFrom(mesh, g.mines, first).solved) all = false;
    if (O.generate(mesh, M, first, "s" + t).mines.join() !== g.mines.join()) det = false;
  }
  ck(all, `${n}/${M}: 12 boards, each clears by deduction alone`);
  ck(clear && det, `${n}/${M}: first cell and neighbours clear; same (seed, click) → same board`);
}

console.log("always a certain cell");
{
  // Knowledge only grows: whatever safe cells a player opens, in any order and
  // however lucky, the solver's proof still applies, so some cell stays
  // certain until the board is cleared. The game's "guesses" readout depends
  // on this. Check it with a player who opens random safe cells (pure luck).
  let states = 0, empty = 0;
  for (let t = 0; t < 8; t++) {
    const mesh = O.buildMesh("cert" + t, 200, 2), first = t * 11;
    const g = O.generate(mesh, 32, first, "c" + t);
    const s = O.newState(mesh, 32); O.plant(s, g.mines); s.phase = "play";
    O.reveal(s, first);
    const rng = O.rngFor("lucky", t);
    while (s.phase === "play") {
      states++;
      if (!O.certainties(s).safe.length) empty++;
      const closed = []; for (let i = 0; i < s.n; i++) if (!s.open[i] && !s.mine[i]) closed.push(i);
      O.reveal(s, rng.pick(closed));
    }
  }
  ck(empty === 0, `${states} positions reached by a lucky player: every one has a certain cell (${empty} without)`);
}

console.log("rules");
{
  const mesh = O.buildMesh("rules", 80, 2);
  const g = O.generate(mesh, 10, 0, "r");
  const s = O.newState(mesh, 10); O.plant(s, g.mines); s.phase = "play";
  const opened = O.reveal(s, 0);
  ck(s.count[0] === 0 && opened.length > mesh.nbrs[0].length, `first click floods (${opened.length} cells)`);
  ck(opened.every((i) => !s.mine[i]), "flood opens no mine");
  const r = O.solveFrom(mesh, g.mines, 0);
  ck(r.state.phase === "won" && r.state.opened === 70, "solving out the board wins it");
  const boom = g.mines[0];
  O.reveal(s, boom);
  ck(s.phase === "lost" && s.boom === boom, "opening a mine loses");
}

if (failures) { console.error(`\n${failures} failure(s)`); process.exit(1); }
console.log("\nall orb invariants hold");

/* node games/strand/test/strand.selftest.mjs
 *
 * Gates Strand. The load-bearing properties:
 *
 *   1. The boards are what they claim: C60's 60 atoms with 90 bonds and its
 *      32 panels (12 pentagons, 20 hexagons); Voronoi boards with symmetric
 *      adjacency, atoms exactly three bonds each.
 *   2. The solver is exact: solution counts match brute force on small
 *      boards with walls and bridges.
 *   3. EVERY SHIPPED LEVEL has exactly one answer under the current engine.
 *      The levels are data built on the mesh and the solver; this is what
 *      stops a change to either from quietly shipping a broken puzzle.
 *   4. The rules let a player enter that answer and win, and refuse the
 *      illegal moves (another colour's end, a walled side, a bridge lane
 *      taken from the wrong side).
 *
 * Picked up automatically by scripts/preflight.mjs when games/ is touched.
 */
import { fileURLToPath } from "node:url";
import path from "node:path";
import { loadStrand } from "./harness.mjs";

const S = await loadStrand(), O = globalThis.ORB;
const here = path.dirname(fileURLToPath(import.meta.url));
await import(path.join(here, "../js/play.js"));
await import(path.join(here, "../js/levels.js"));

let failures = 0;
const ck = (c, m) => { if (c) console.log(`  ✓ ${m}`); else { failures++; console.error(`  ✗ ${m}`); } };

console.log("boards");
{
  const a = S.board({ type: "c60-atoms" }), p = S.board({ type: "c60-panels" });
  ck(a.n === 60 && a.nbrs.every((x) => x.length === 3) && a.nbrs.reduce((s, x) => s + x.length, 0) === 180, "C60 atoms: 60 carbons, 3 bonds each, 90 bonds");
  const sides = p.polys.map((r) => r.length).sort();
  ck(p.n === 32 && sides.filter((x) => x === 5).length === 12 && sides.filter((x) => x === 6).length === 20 && p.nbrs.every((x, i) => x.length === p.polys[i].length), "C60 panels: 12 pentagons + 20 hexagons, each touching one panel per side");
  for (const spec of [{ type: "voronoi-panels", n: 50, seed: "st" }, { type: "voronoi-atoms", n: 50, seed: "st" }]) {
    const b = S.board(spec);
    const sym = b.nbrs.every((ns, i) => ns.every((j) => b.nbrs[j].includes(i)));
    ck(sym && (spec.type === "voronoi-panels" || b.nbrs.every((x) => x.length === 3)), `${b.name}: symmetric adjacency${spec.type === "voronoi-atoms" ? ", three bonds per atom" : ""}`);
  }
}

console.log("atom layouts");
{
  // relaxed Voronoi atoms must stay a faithful drawing: no bond crossing
  // another, no two atoms crowded together
  const cr = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]], dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const specs = [...new Map(S.LEVELS.filter((l) => l.board.type === "voronoi-atoms").map((l) => [JSON.stringify(l.board), l.board])).values()];
  let crossings = 0, worst = 1;
  for (const spec of specs) {
    const b = S.board(spec), p = (i) => [b.pos[3 * i], b.pos[3 * i + 1], b.pos[3 * i + 2]], E = [], L = [];
    for (let u = 0; u < b.n; u++) for (const v of b.nbrs[u]) if (v > u) { E.push([u, v]); L.push(Math.acos(Math.min(1, dot(p(u), p(v))))); }
    for (let i = 0; i < E.length; i++) for (let j = i + 1; j < E.length; j++) {
      const [a, c] = E[i], [d, e] = E[j];
      if (a === d || a === e || c === d || c === e) continue;
      const n1 = cr(p(a), p(c)), n2 = cr(p(d), p(e));
      if (Math.sign(dot(n1, p(d))) !== Math.sign(dot(n1, p(e))) && Math.sign(dot(n2, p(a))) !== Math.sign(dot(n2, p(c))) && dot(p(a), p(d)) > 0) crossings++;
    }
    const mean = L.reduce((x, y) => x + y, 0) / L.length;
    worst = Math.min(worst, Math.min(...L) / mean);
  }
  ck(crossings === 0 && worst > 0.5, `${specs.length} Voronoi atom boards: no crossed bonds (${crossings}), shortest bond ${(100 * worst).toFixed(0)}% of mean`);
}

console.log("solver vs brute force");
{
  function brute(g, pairs) {
    const own = new Int16Array(g.n).fill(-1); pairs.forEach(([a, b], i) => { own[a] = i; own[b] = i; });
    let count = 0; const K = pairs.length;
    const rec = (p, u, free) => {
      if (p === K) { if (free === 0) count++; return; }
      const t = pairs[p][1];
      for (const v of g.nbrs[u]) {
        if (v === t) rec(p + 1, p + 1 < K ? pairs[p + 1][0] : -1, free);
        else if (own[v] === -1) { own[v] = p; rec(p, v, free - 1); own[v] = -1; }
      }
    };
    rec(0, pairs[0][0], g.n - 2 * K);
    return count;
  }
  const rng = O.rngFor("st-bf");
  let checked = 0, bad = 0, nonzero = 0;
  for (let t = 0; t < 200; t++) {
    const b = S.board({ type: "voronoi-panels", n: 14 + (t % 6), seed: "bf" + t });
    const walls = []; for (let w = 0; w < t % 4; w++) { const a = rng.int(0, b.n - 1); walls.push([a, rng.pick(b.nbrs[a])]); }
    const bridges = t % 3 === 0 && b.nbrs[0].length >= 4 ? [{ cell: 0, lanes: S.bridgeLanes(b, 0, 0) }] : [];
    const g = S.playGraph(b, walls, bridges), K = 1 + (t % 3);
    const cells = rng.shuffle([...Array(b.n).keys()].filter((c) => !bridges.some((x) => x.cell === c))).slice(0, 2 * K);
    const pairs = []; for (let k = 0; k < K; k++) pairs.push([cells[2 * k], cells[2 * k + 1]]);
    const want = brute(g, pairs), got = S.solve(g, pairs, 1e9, 1e8).count;
    checked++; if (want) nonzero++; if (want !== got) bad++;
  }
  ck(bad === 0 && nonzero > 30, `${checked} small boards with walls and bridges: solution counts match brute force (${bad} wrong; ${nonzero} had solutions)`);
}

console.log("shipped levels");
{
  const t0 = Date.now();
  let unique = 0, playable = 0;
  for (const [i, lv] of S.LEVELS.entries()) {
    const b = S.board(lv.board), g = S.playGraph(b, lv.walls, lv.bridges);
    const r = S.solve(g, lv.pairs, 2, 2e7);
    if (r.count === 1 && !r.exhausted) unique++;
    else console.error(`    level ${i + 1} "${lv.title}": ${r.exhausted ? "undecided" : r.count + " answers"}`);
    // enter the answer through the rules, one drag per strand
    if (r.count >= 1) {
      const G = new S.Game(lv), ans = r.sols[0];
      ans.forEach((p) => { G.begin(G.cellOf[p[0]]); for (let k = 1; k < p.length; k++) G.extend(G.cellOf[p[k]]); G.end(); });
      if (G.solved()) playable++;
      else console.error(`    level ${i + 1} "${lv.title}": answer not enterable (painted ${G.painted()}/${G.g.n}, joined ${G.joined()}/${lv.pairs.length})`);
    }
  }
  ck(unique === S.LEVELS.length, `all ${S.LEVELS.length} levels have exactly one answer (${unique} do) · ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  ck(playable === S.LEVELS.length, `each answer can be drawn through the rules and wins (${playable})`);
}

console.log("rules");
{
  const lv = S.LEVELS.find((l) => l.bridges.length);
  const G = new S.Game(lv), [a, z] = lv.pairs[0], [b1] = lv.pairs[1];
  G.begin(G.cellOf[a]);
  const before = G.strands[0].length;
  ck(!G.extend(G.cellOf[b1]) || !G.g.nbrs[a].includes(b1), "a strand can't enter another colour's end");
  const wall = lv.walls.find((w) => w.includes(G.cellOf[a]));
  if (wall) { const other = wall[0] === G.cellOf[a] ? wall[1] : wall[0]; ck(!G.extend(other) && G.strands[0].length === before, "a strand can't cross a wall"); }
  // bridge: entering from a closed side is refused; through a lane is fine
  const br = lv.bridges[0], c = br.cell, closed = G.board.nbrs[c].find((j) => !br.lanes[0].includes(j) && !br.lanes[1].includes(j));
  if (closed !== undefined) {
    const H = new S.Game({ ...lv, pairs: [[closed, lv.pairs[0][1]], ...lv.pairs.slice(1).filter((p) => !p.includes(closed))] });
    H.begin(closed);
    ck(!H.extend(c), "a bridge refuses a strand from a closed side");
  }
  // cut and restore within one drag
  const L = S.LEVELS[0], K = new S.Game(L), sol = S.solve(S.playGraph(K.board, L.walls, L.bridges), L.pairs, 1).sols[0];
  const p0 = sol[0], p1 = sol[1];
  K.begin(K.cellOf[p1[0]]); for (let k = 1; k < p1.length - 1; k++) K.extend(K.cellOf[p1[k]]); K.end();
  const full = K.strands[1].length;
  // drag strand 0 across one of strand 1's cells, if they touch
  const mid = K.strands[1].slice(1).find((v) => K.g.nbrs[p0[0]].includes(v));
  if (mid !== undefined) {
    K.begin(K.cellOf[p0[0]]); K.extend(K.cellOf[mid]);
    const cut = K.strands[1].length;
    K.extend(K.cellOf[p0[0]]); K.end();
    ck(cut < full && K.strands[1].length === full, "cutting another strand is undone by backing off in the same drag");
  }
}

if (failures) { console.error(`\n${failures} failure(s)`); process.exit(1); }
console.log("\nall strand invariants hold");

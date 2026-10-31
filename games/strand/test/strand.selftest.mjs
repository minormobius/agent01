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

console.log("torus views: a finger finds every end facing it");
for (const spec of [{ type: "torus-hex-atoms", rows: 4, cols: 8 }, { type: "torus-hex-panels", rows: 4, cols: 8 }, { type: "torus-voronoi-panels", seed: "pick", n: 50 }]) {
  // the donut (and the Clifford torus): the nanotorus is atoms, points with no cells, which once threw on every press
  const B = S.board(spec), cam = O.surfaceCam(B.mesh), vp = { cx: 195, cy: 330, w: 390, h: 660 };
  for (const four of [false, true]) {
    cam.clifford = four && cam.kind === "torus";
    const F = new O.TorusFrame(cam, vp, "donut"); let vis = 0, hit = 0;
    for (let c = 0; c < B.n; c++) { const P = F.cell(c); if (!P[3] || P[4] < 0.3) continue; vis++; let got = -2; try { got = F.pick(P[0], P[1]); } catch (e) { got = -3; } if (got === c) hit++; }
    ck(vis > 0 && hit === vis, `${B.name}${four ? " (4D)" : ""}: every cell facing you is picked at its own centre (${hit}/${vis})`);
  }
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
  // a level and its answer, to stage situations on
  const L = S.LEVELS[0], sol = S.solve(S.playGraph(S.board(L.board), L.walls, L.bridges), L.pairs, 1).sols[0];
  const draw = (G, nodes) => { G.begin(G.cellOf[nodes[0]]); for (let k = 1; k < nodes.length; k++) G.extend(G.cellOf[nodes[k]]); G.end(); };
  const fragsOf = (G, k) => G.frags[k].map((f) => f.slice());
  const longest = sol.reduce((m, p, i) => (p.length > sol[m].length ? i : m), 0), P = sol[longest];

  // halves from both ends are independent, and meet
  {
    const G = new S.Game(L), mid = Math.floor(P.length / 2);
    draw(G, P.slice(0, mid));                       // A's half
    const aHalf = fragsOf(G, longest);
    draw(G, P.slice(mid).reverse());                // B's half, drawn toward A, stops one short
    ck(JSON.stringify(fragsOf(G, longest)[0]) === JSON.stringify(aHalf[0]), "drawing from the other end leaves the first half untouched");
    ck(G.done[longest] === 1 || G.frags[longest].length === 2, "the two halves meet when one steps onto the other");
  }
  // full answer by halves: every strand drawn as two halves from its two ends
  {
    const G = new S.Game(L);
    sol.forEach((p) => { const m = Math.ceil(p.length / 2); draw(G, p.slice(0, m)); draw(G, p.slice(m - 1).reverse()); });
    ck(G.solved(), "every strand drawn as two halves from its two ends solves the level");
  }
  // cutting through another colour takes only the touched cell, and is provisional within the drag
  {
    const G = new S.Game(L);
    let victim = -1, at = -1, attacker = -1, from = -1;
    for (let j = 0; j < sol.length && victim < 0; j++) for (let i = 1; i < sol[j].length - 3 && victim < 0; i++) {
      const v = sol[j][i];
      for (let k = 0; k < sol.length; k++) if (k !== j) for (const e of L.pairs[k]) if (G.g.nbrs[e].includes(v)) { victim = j; at = i; attacker = k; from = e; }
    }
    draw(G, sol[victim].slice(0, -1));              // a half that hasn't reached its far end yet
    const before = G.frags[victim].map((f) => f.length).reduce((x, y) => x + y, 0);
    G.begin(G.cellOf[from]);
    G.extend(G.cellOf[sol[victim][at]]);
    const during = G.frags[victim].map((f) => f.length).reduce((x, y) => x + y, 0);
    ck(during === before - 1 && G.frags[victim].length === 2, `driving through another strand takes only the touched cell (${before} → ${during} cells, in ${G.frags[victim].length} pieces)`);
    G.extend(G.cellOf[from]);
    ck(G.frags[victim].length === 1 && G.frags[victim][0].length === before, "backing off in the same drag gives the cell back and rejoins it");
    G.extend(G.cellOf[sol[victim][at]]); G.end();
    const loose = G.frags[victim].find((f) => !G.isEnd(f[0], victim) && !G.isEnd(f[f.length - 1], victim));
    ck(!!loose && loose.length >= 1, "after the drag, the cut-off side stays painted as a loose piece");
    ck(G.tap(G.cellOf[loose[0]]) && !G.frags[victim].includes(loose), "a tap on a loose piece deletes it");
  }
  // walls and other colours' ends are refused
  {
    const lv = S.LEVELS.find((l) => l.walls.length && l.board.type.endsWith("panels"));
    const G = new S.Game(lv), [a] = lv.pairs[0];
    G.begin(G.cellOf[a]);
    const blocked = G.board.nbrs[G.cellOf[a]].find((j) => !G.g.nbrs[a].some((v) => G.cellOf[v] === j));
    if (blocked !== undefined) ck(!G.extend(blocked), "a strand can't cross a wall or a bridge's closed side");
    const other = lv.pairs.slice(1).flat().find((e) => G.g.nbrs[a].includes(e));
    if (other !== undefined) ck(!G.extend(G.cellOf[other]), "a strand can't enter another colour's end");
    G.end();
  }
  // touching an end of a joined strand: only that end lets go
  {
    const G = new S.Game(L);
    draw(G, P);
    G.begin(G.cellOf[P[0]]); G.end();
    const f = G.frags[longest];
    ck(G.done[longest] === 0 && f.length === 2 && f.some((x) => x.length === P.length - 1), "touching an end of a joined strand detaches just that end; the rest stays painted");
  }
}

if (failures) { console.error(`\n${failures} failure(s)`); process.exit(1); }
console.log("\nall strand invariants hold");

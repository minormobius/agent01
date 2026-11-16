// Hunting for a convex 4-polytope with NO net: one whose every ridge unfolding overlaps. Dürer's problem asks whether
// such a thing exists (in 3D: no counterexample in decades of search; in 4D, little searched). One would settle the
// 4D question; finding none is only evidence.
//
// Each shard draws random convex 4-polytopes from its own seeded stream, from three families (`sphere`: the hull of
// points on the 3-sphere; `cut`: the hull of the vertices of random half-spaces' intersection; `stretch`: either, then
// stretched along random axes by up to 40×, where overlaps breed), with 5–12 cells. For each:
// A third of the draws are not fresh: they MUTATE one of the shard's hardest polytopes so far (nudge every vertex, or
// stretch it further along a random axis), so the search climbs toward polytopes whose nets are rarest, which is where a
// counterexample would be if there is one. Hardness is measured on a fixed budget: of 200 sampled trees, how few are
// nets (`netRate`).
//   1. sample random spanning trees (half long DFS, half bushy BFS) until one unfolds without overlap: a net. Most
//      polytopes fall here in a few tries; the number of tries measures how rare its nets are;
//   2. if 300 samples find no net, enumerate EVERY spanning tree (Kirchhoff tells how many), stopping at the first net;
//   3. if none is a net: a counterexample candidate. Written out in full with every tree's worst overlap, to be checked
//      in exact arithmetic before anyone believes it.
// Progress, the hardest polytopes so far, and any candidate go to $TMPDIR/ana-netsearch/<shard>.json, saved every few
// seconds; a shard cut at its deadline resumes from where its stream stopped.
//
//   node ana/fold/tools/netsearch.mjs search <shard> <minutes> [maxCells]
//   node ana/fold/tools/netsearch.mjs report                 # summarise every shard's file
import { mkdirSync, readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import * as U from '../js/unfold4.js';

const DIR = path.join(process.env.TMPDIR || os.tmpdir(), 'ana-netsearch');
const [cmd, shardArg, minutesArg, maxCellsArg] = process.argv.slice(2);

function mulberry(seed) { return () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const gauss = (r) => Math.sqrt(-2 * Math.log(r() + 1e-12)) * Math.cos(2 * Math.PI * r());
const unitv = (r) => { const v = [gauss(r), gauss(r), gauss(r), gauss(r)]; const l = Math.hypot(...v); return v.map((x) => x / l); };

/** One random polytope from the stream: its vertices (the hull is taken by U.hull4). With a pool of hard ones, a third
 *  of the time it's a mutation of one of them instead. */
function draw(r, pool = []) {
  if (pool.length && r() < 1 / 3) {
    const src = pool[Math.floor(r() * pool.length)], V = src.V.map((v) => v.slice());
    if (r() < 0.5) { const sz = 0.02 + r() * 0.2, sc = Math.max(...V.map((v) => Math.hypot(...v))); for (const v of V) for (let i = 0; i < 4; i++) v[i] += sz * sc * gauss(r) * 0.3; }
    else { const a = unitv(r), k = 1.2 + r() * 2; for (const v of V) { const t = v[0] * a[0] + v[1] * a[1] + v[2] * a[2] + v[3] * a[3]; for (let i = 0; i < 4; i++) v[i] += (k - 1) * t * a[i]; } }
    return { fam: `mutant-${src.fam.replace(/^mutant-/, '')}`, V };
  }
  const fam = ['sphere', 'cut', 'stretch'][Math.floor(r() * 3)];
  let V;
  const base = r() < 0.5 ? 'sphere' : 'cut';
  if ((fam === 'stretch' ? base : fam) === 'sphere') V = Array.from({ length: 5 + Math.floor(r() * 3) }, () => unitv(r));     // 5–7 points: few cells
  else {
    // the intersection of m random half-spaces n·x ≤ 1 (tangent to the unit sphere), as its vertices
    const m = 5 + Math.floor(r() * 6), N = Array.from({ length: m }, () => unitv(r)); V = [];
    for (let a = 0; a < m; a++) for (let b = a + 1; b < m; b++) for (let c = b + 1; c < m; c++) for (let d = c + 1; d < m; d++) {
      const x = solve4([N[a], N[b], N[c], N[d]], [1, 1, 1, 1]);
      if (x && N.every((n) => n[0] * x[0] + n[1] * x[1] + n[2] * x[2] + n[3] * x[3] <= 1 + 1e-9) && Math.hypot(...x) < 50) V.push(x);
    }
  }
  if (fam === 'stretch') { const axes = [unitv(r)], k = 1 + r() * 39; V = V.map((v) => { const a = axes[0], t = v[0] * a[0] + v[1] * a[1] + v[2] * a[2] + v[3] * a[3]; return v.map((x, i) => x + (k - 1) * t * a[i]); }); }
  return { fam: fam === 'stretch' ? `stretch-${base}` : fam, V };
}
function solve4(A, y) {
  const M = A.map((row, i) => [...row, y[i]]);
  for (let i = 0; i < 4; i++) { let p = i; for (let k = i + 1; k < 4; k++) if (Math.abs(M[k][i]) > Math.abs(M[p][i])) p = k; if (Math.abs(M[p][i]) < 1e-10) return null; [M[i], M[p]] = [M[p], M[i]]; for (let k = 0; k < 4; k++) if (k !== i) { const f = M[k][i] / M[i][i]; for (let j = i; j < 5; j++) M[k][j] -= f * M[i][j]; } }
  return M.map((row, i) => row[4] / row[i]);
}
/** Is this unfolding a net? (no overlap above eps relative to the cells' typical size) */
function isNet(P, parent, eps) { return U.overlaps(U.unfold(P, parent).cells, eps).length === 0; }

if (cmd === 'search') {
  const shard = +shardArg, minutes = +minutesArg || 5, maxCells = +maxCellsArg || 12, t0 = Date.now(), file = path.join(DIR, `${shard}.json`);
  mkdirSync(DIR, { recursive: true });
  const st = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : { shard, drawn: 0, tested: 0, sampledNet: 0, exhaustive: 0, exhaustiveTrees: 0, skipped: 0, hardest: [], candidates: [], byCells: {}, seconds: 0 };
  // the polytope stream (r) and the tree sampling (a fresh stream per polytope) are separate, so a resumed shard replays
  // its stream exactly; the mutation pool is the hardest list as saved, which only changes when a polytope is tested
  const r = mulberry(1000003 * (shard + 1));
  st.pool = st.pool || [];
  for (let i = 0; i < st.drawn; i++) draw(r, st.replayPool?.[i] ? st.pool : []);
  st.replayPool = st.replayPool || [];
  let saved = Date.now();
  const save = () => { st.seconds += (Date.now() - saved) / 1000; saved = Date.now(); writeFileSync(file, JSON.stringify(st)); };
  while (Date.now() - t0 < minutes * 60e3) {
    st.replayPool[st.drawn] = st.pool.length ? 1 : 0;
    const { fam, V } = draw(r, st.pool); st.drawn++;
    const rt = mulberry(7919 * (shard + 1) + 104729 * st.drawn);
    let P; try { P = U.hull4(V); } catch { st.skipped++; continue; }
    const n = P.cells.length;
    if (n < 5 || n > maxCells || !P.adj.every((m) => m.size >= 3)) { st.skipped++; continue; }
    const scale = Math.max(...V.map((v) => Math.hypot(...v))), eps = 1e-9 * scale ** 3;
    st.tested++; st.byCells[n] = (st.byCells[n] || 0) + 1;
    // 1. samples
    let tries = 0, found = false;
    for (; tries < 300 && !found; tries++) found = isNet(P, U.randomTree(P, tries % 2 ? 'dfs' : 'bfs', rt, Math.floor(rt() * n)), eps);
    if (found) {
      st.sampledNet++;
      if (tries > 3) {
        // hard enough to measure: the rate of nets among 200 sampled trees
        let nets = 0; for (let k = 0; k < 200; k++) if (isNet(P, U.randomTree(P, k % 2 ? 'dfs' : 'bfs', rt, Math.floor(rt() * n)), eps)) nets++;
        const rec = { fam, cells: n, tries, netRate: nets / 200, trees: U.treeCount(P), V: P.V };
        st.hardest.push(rec); st.hardest.sort((a, b) => a.netRate - b.netRate); st.hardest.length = Math.min(st.hardest.length, 20);
        st.pool = st.hardest.slice(0, 10);
      }
    } else {
      // 2. every tree
      st.exhaustive++;
      let count = 0;
      const anyNet = U.eachTree(P, (parent) => { count++; return isNet(P, parent, eps); });
      st.exhaustiveTrees += count;
      if (!anyNet) {
        // 3. a candidate: every tree overlaps. Keep it whole.
        st.candidates.push({ fam, cells: n, trees: count, V: P.V, note: 'EVERY ridge unfolding overlaps (double precision): verify exactly before believing' });
        console.log(`CANDIDATE: ${fam}, ${n} cells, all ${count} unfoldings overlap`);
      } else { st.hardest.push({ fam, cells: n, tries: 300, netRate: 0, exhaustiveNetAfter: count, trees: U.treeCount(P), V: P.V }); st.hardest.sort((a, b) => a.netRate - b.netRate); st.hardest.length = Math.min(st.hardest.length, 20); st.pool = st.hardest.slice(0, 10); }
    }
    if (Date.now() - saved > 5000) save();
  }
  save();
  console.log(`shard ${shard}: ${st.tested} polytopes tested (${st.drawn} drawn, ${st.skipped} skipped), ${st.sampledNet} netted by sampling, ${st.exhaustive} needed every tree (${st.exhaustiveTrees} trees), ${st.candidates.length} candidates; by cells ${JSON.stringify(st.byCells)}`);
} else if (cmd === 'report') {
  if (!existsSync(DIR)) { console.log('no results yet'); process.exit(0); }
  const all = readdirSync(DIR).filter((f) => f.endsWith('.json')).map((f) => JSON.parse(readFileSync(path.join(DIR, f), 'utf8')));
  const sum = (k) => all.reduce((t, s) => t + s[k], 0), byCells = {};
  for (const s of all) for (const [k, v] of Object.entries(s.byCells)) byCells[k] = (byCells[k] || 0) + v;
  console.log(`${all.length} shards, ${sum('tested')} polytopes, ${(sum('seconds') / 3600).toFixed(1)} CPU-hours; netted by sampling ${sum('sampledNet')}, by full enumeration ${sum('exhaustive') - all.reduce((t, s) => t + s.candidates.length, 0)} (${sum('exhaustiveTrees')} trees); CANDIDATES ${all.reduce((t, s) => t + s.candidates.length, 0)}`);
  console.log('by cells', JSON.stringify(byCells));
  console.log('hardest (lowest rate of nets among 200 sampled trees):');
  for (const h of all.flatMap((s) => s.hardest).sort((a, b) => a.netRate - b.netRate).slice(0, 10)) console.log(`  ${h.fam}, ${h.cells} cells, ${h.trees} trees: nets ${(h.netRate * 100).toFixed(1)}% of samples${h.exhaustiveNetAfter ? `, first net after ${h.exhaustiveNetAfter} of all trees` : ''}`);
} else {
  console.error('usage: netsearch.mjs search <shard> <minutes> [maxCells] | report');
  process.exit(1);
}

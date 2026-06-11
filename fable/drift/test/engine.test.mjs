// Reproducible tests — `node fable/drift/test/engine.test.mjs`.
// Loads the COMMITTED substrate from data/ and verifies: graph sanity, ladder
// paths legal + optimal-length + endpoints honest, fold margins independently
// re-derived, determinism, ranking. No network, no model — the substrate is
// frozen data, which is the point.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { Semantic } from '../js/engine.js';
import { puzzleForSeed, rankBand } from '../js/atlas.js';

const here = dirname(fileURLToPath(import.meta.url));
const graph = JSON.parse(readFileSync(join(here, '..', 'data', 'graph.json'), 'utf8'));
const vec = new Int8Array(readFileSync(join(here, '..', 'data', 'vec64.bin')).buffer);
const S = new Semantic(graph, vec);

let failures = 0;
const fail = (m) => { console.error('  ✗ ' + m); failures++; };

console.log('drift semantic-substrate tests\n');

// 1. Substrate sanity: counts line up; neighbours are sane (a word's top
//    neighbour should be far more similar than a random word, on average).
{
  if (S.n !== graph.words.length) fail('count mismatch');
  let nbrSim = 0, rndSim = 0, m = 0;
  for (let i = 0; i < S.n; i += 97) {
    nbrSim += S.cos(i, S.nbr[i * S.k]);
    rndSim += S.cos(i, (i * 7919 + 13) % S.n);
    m++;
  }
  nbrSim /= m; rndSim /= m;
  if (nbrSim < rndSim + 0.2) fail(`neighbour structure weak (nbr ${nbrSim.toFixed(2)} vs random ${rndSim.toFixed(2)})`);
  console.log(`substrate: ${S.n} words, k=${S.k}; avg top-neighbour cos ${nbrSim.toFixed(2)} vs random ${rndSim.toFixed(2)}`);
}

// 2. Every seed yields a puzzle; ladder paths are legal neighbour-walks of
//    exactly par hops; fold margins re-derive positive.
{
  const N = 60; let made = 0, ladders = 0, folds = 0;
  for (let n = 1; n <= N; n++) {
    const p = puzzleForSeed(S, n);
    if (!p) { fail(`seed ${n} made nothing`); continue; }
    made++;
    if (p.genus === 'ladder') {
      ladders++;
      if (p.path[0] !== p.start || p.path[p.path.length - 1] !== p.target) fail(`seed ${n} path endpoints wrong`);
      if (p.path.length - 1 !== p.par) fail(`seed ${n} par ≠ path length`);
      for (let i = 0; i + 1 < p.path.length; i++) if (!S.isNeighbor(p.path[i], p.path[i + 1])) fail(`seed ${n} illegal hop at ${i}`);
      // optimality: a BFS re-run can't find shorter
      const { dist } = S.bfs(p.start, 12);
      if (dist[p.target] !== p.par) fail(`seed ${n} stored par ${p.par} ≠ re-BFS ${dist[p.target]}`);
    } else {
      folds++;
      let minM = 1e9;
      for (let f = 0; f < 3; f++) for (const w of p.families[f]) {
        const own = p.families[f].filter((x) => x !== w).reduce((s, x) => s + S.cos(w, x), 0) / 3;
        for (let g = 0; g < 3; g++) {
          if (g === f) continue;
          const oth = p.families[g].filter((x) => x !== w).reduce((s, x) => s + S.cos(w, x), 0) / p.families[g].filter((x) => x !== w).length;
          minM = Math.min(minM, own - oth);
        }
      }
      if (minM <= 0) fail(`seed ${n} fold margin not positive (${minM.toFixed(3)})`);
    }
  }
  console.log(`generation: ${made}/${N} (${ladders} ladders re-verified optimal, ${folds} folds margin-re-derived)`);
}

// 3. Determinism.
{
  for (const n of [3, 17, 29]) {
    const a = puzzleForSeed(S, n), b = puzzleForSeed(S, n);
    const ka = JSON.stringify(a.path || a.families), kb = JSON.stringify(b.path || b.families);
    if (ka !== kb) fail(`seed ${n} not deterministic`);
  }
  console.log('determinism: identical puzzles across repeated calls');
}

// 4. Ranking bounded + sorted.
{
  const band = rankBand(S, 1, 20);
  for (let i = 1; i < band.length; i++) if (band[i].report.interest > band[i - 1].report.interest) fail('rankBand not sorted');
  for (const p of band) if (p.report.interest < 0 || p.report.interest > 100) fail(`interest out of range #${p.n}`);
  console.log(`ranking: sorted, top = #${band[0].n} ${band[0].genus} (${band[0].report.interest})`);
}

console.log(failures ? `\nFAILED: ${failures} assertion(s)` : '\nAll semantic-substrate tests passed.');
process.exit(failures ? 1 : 0);

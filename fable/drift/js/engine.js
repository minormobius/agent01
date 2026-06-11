// The semantic substrate engine. The "board" is a kNN graph over 7,000 MiniLM
// word embeddings (built by scripts/build-drift-graph.mjs, committed under
// data/). Cells are words; adjacency is meaning. Two oracle services:
//
//   bfs(start)            — single-source shortest paths over the directed kNN
//                           graph. This is morph's invariant oracle running on
//                           a semantic substrate: it certifies a Ladder puzzle
//                           solvable and yields par + the optimal path.
//   cos(a, b)             — cosine similarity from the committed PCA-64 int8
//                           vectors: the margin oracle for Fold groupings.
//
// The data object is injected (browser: fetch; node tests: fs), so the engine
// is environment-free.

export class Semantic {
  constructor(graph, vec64) {
    this.words = graph.words;
    this.n = graph.count;
    this.k = graph.k;
    this.nbr = graph.nbr;        // flat n×k word indices
    this.sim = graph.sim;        // flat n×k quantised cosines (0..127)
    this.xy = graph.xy;          // flat n×2 map coords (0..10000)
    this.vec = vec64;            // Int8Array n×64, L2-normalised pre-quantise
    this.pcaDims = graph.pcaDims;
    this.index = new Map();
    this.words.forEach((w, i) => this.index.set(w, i));
  }

  wordOf(i) { return this.words[i]; }
  idOf(w) { return this.index.has(w) ? this.index.get(w) : -1; }

  neighbors(i) {
    const out = [];
    for (let k = 0; k < this.k; k++) out.push({ id: this.nbr[i * this.k + k], sim: this.sim[i * this.k + k] / 127 });
    return out;
  }
  isNeighbor(i, j) {
    for (let k = 0; k < this.k; k++) if (this.nbr[i * this.k + k] === j) return true;
    return false;
  }

  // cosine from int8 PCA-64 vectors
  cos(a, b) {
    const D = this.pcaDims;
    let d = 0;
    const av = a * D, bv = b * D;
    for (let k = 0; k < D; k++) d += this.vec[av + k] * this.vec[bv + k];
    return d / (127 * 127);
  }

  pos(i) { return { x: this.xy[i * 2] / 10000, y: this.xy[i * 2 + 1] / 10000 }; }

  // BFS over the directed kNN graph from `start`. Returns { dist, parent }
  // (Int32Array each; dist -1 = unreachable). Capped at maxDepth.
  bfs(start, maxDepth = 12) {
    const dist = new Int32Array(this.n).fill(-1);
    const parent = new Int32Array(this.n).fill(-1);
    dist[start] = 0;
    let frontier = [start];
    let d = 0;
    while (frontier.length && d < maxDepth) {
      const next = [];
      d++;
      for (const u of frontier) {
        for (let k = 0; k < this.k; k++) {
          const v = this.nbr[u * this.k + k];
          if (dist[v] !== -1) continue;
          dist[v] = d; parent[v] = u;
          next.push(v);
        }
      }
      frontier = next;
    }
    return { dist, parent };
  }

  pathTo(parent, target) {
    const path = [];
    let c = target;
    while (c !== -1) { path.push(c); c = parent[c]; }
    return path.reverse();
  }
}

// browser loader (node tests construct Semantic directly from fs reads)
export async function loadSemantic(base = './data') {
  const [graph, bin] = await Promise.all([
    fetch(base + '/graph.json').then((r) => r.json()),
    fetch(base + '/vec64.bin').then((r) => r.arrayBuffer()),
  ]);
  return new Semantic(graph, new Int8Array(bin));
}

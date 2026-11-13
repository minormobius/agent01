// kith/worker.js — runs community.js off the main thread. At ~1,300 people the
// full analysis (16 Louvain runs, a rewired null, a 10-step resolution sweep,
// betweenness) is ~6 s and the layout ~2 s; on the page's thread that would
// freeze it.
//
// It holds the whole graph once ('load'), then answers 'analyse' for any subset
// of it — the whole set, or one community when the reader zooms in.
import { buildGraph, subgraph, analyse, layout } from './community.js';

let G = null;

self.onmessage = (e) => {
  const msg = e.data;
  try {
    if (msg.type === 'load') {
      G = buildGraph(msg.ids, new Map(Object.entries(msg.rows)), { mode: msg.mode, exclude: msg.exclude });
      self.postMessage({ id: msg.id, type: 'loaded', n: G.n, edges: G.edgeCount });
      return;
    }
    if (msg.type === 'analyse') {
      if (!G) throw new Error('no graph loaded');
      let H = G;
      if (msg.scope) {
        const idx = new Map(G.ids.map((d, i) => [d, i]));
        H = subgraph(G, msg.scope.map((d) => idx.get(d)).filter((i) => i !== undefined));
      }
      const progress = (stage) => self.postMessage({ id: msg.id, type: 'progress', stage });
      progress('finding communities');
      const A = analyse(H, { gamma: msg.gamma, runs: H.n > 800 ? 10 : 16, seed: msg.seed || 1, nullSamples: H.n > 800 ? 3 : 4 });
      progress('laying out');
      const L = layout(H, A.part, { iterations: H.n > 800 ? 180 : 260 });
      const edges = [];
      for (let i = 0; i < H.n; i++) for (const [j, w] of H.adj[i]) if (i < j) edges.push(i, j, w);
      self.postMessage({
        id: msg.id, type: 'result',
        ids: H.ids, edges, x: Array.from(L.x), y: Array.from(L.y), analysis: A,
      });
    }
  } catch (err) {
    self.postMessage({ id: msg.id, type: 'error', message: String((err && err.message) || err) });
  }
};

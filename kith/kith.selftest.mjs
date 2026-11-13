// kith.selftest.mjs — community.js against graphs whose answers are known.
// node kith/kith.selftest.mjs
import {
  buildGraph, fromEdges, modularity, louvain, consensus, ari, rewire, nullModularity,
  describe, summary, coreNumbers, betweenness, sweep, layout, subgraph, splitDisconnected,
  mulberry32, analyse, role, islandLayout,
} from './community.js';
import { interactionsIn, tidTime } from './lib/activity.js';

let fails = 0, passes = 0;
function ok(cond, msg) { if (cond) passes++; else { fails++; console.error('✗ ' + msg); } }
const near = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;

// ── Zachary's karate club, 34 nodes / 78 edges (1-indexed in the literature) ──
const KARATE = {
  1: [2,3,4,5,6,7,8,9,11,12,13,14,18,20,22,32], 2: [3,4,8,14,18,20,22,31],
  3: [4,8,9,10,14,28,29,33], 4: [8,13,14], 5: [7,11], 6: [7,11,17], 7: [17],
  9: [31,33,34], 10: [34], 14: [34], 15: [33,34], 16: [33,34], 19: [33,34], 20: [34],
  21: [33,34], 23: [33,34], 24: [26,28,30,33,34], 25: [26,28,32], 26: [32], 27: [30,34],
  28: [34], 29: [32,34], 30: [33,34], 31: [33,34], 32: [33,34], 33: [34],
};
const kEdges = [];
for (const [a, bs] of Object.entries(KARATE)) for (const b of bs) kEdges.push([+a - 1, b - 1]);
const karate = fromEdges(Array.from({ length: 34 }, (_, i) => 'k' + (i + 1)), kEdges);
ok(karate.edgeCount === 78, `karate has 78 edges (got ${karate.edgeCount})`);

// The best known modularity partition of karate is Q = 0.4198 (4 communities).
const kc = consensus(karate, { gamma: 1, runs: 20, seed: 3 });
ok(kc.q > 0.415 && kc.q <= 0.41979, `karate best Q ≈ 0.4198 (got ${kc.q.toFixed(4)})`);
const kk = Math.max(...kc.part) + 1;
ok(kk === 4, `karate splits into 4 communities at γ=1 (got ${kk})`);
// The instructor (1) and the president (34) end up apart, as the club did.
ok(kc.part[0] !== kc.part[33], 'karate: nodes 1 and 34 in different communities');

// ── modularity by hand: two triangles joined by one edge ──────────────────────
const twoTri = fromEdges(['a','b','c','d','e','f'], [[0,1],[1,2],[0,2],[3,4],[4,5],[3,5],[2,3]]);
// m = 7. each side: internal (twice-counted) 6, total degree 7.
// Q = 2 × (6/14 − (7/14)²) = 0.357142…
ok(near(modularity(twoTri, [0,0,0,1,1,1]), 2 * (6 / 14 - 0.25)), 'two triangles: Q by hand');
ok(near(modularity(twoTri, [0,0,0,0,0,0]), 0), 'one community: Q = 0');
const tt = louvain(twoTri, { seed: 1 });
ok(tt[0] === tt[1] && tt[1] === tt[2] && tt[3] === tt[4] && tt[4] === tt[5] && tt[0] !== tt[3],
  'louvain finds the two triangles');
// Resolution: very low γ prefers one community, very high γ splits further.
ok(Math.max(...louvain(twoTri, { gamma: 0.05, seed: 1 })) === 0, 'γ → 0 merges everything');
ok(Math.max(...louvain(twoTri, { gamma: 6, seed: 1 })) + 1 > 2, 'γ ≫ 1 splits below the triangles');

// ── planted partition: 4 × 30, p_in = 0.35, p_out = 0.02 ──────────────────────
function planted(groups, size, pin, pout, seed) {
  const rng = mulberry32(seed), edges = [], truth = [];
  const n = groups * size;
  for (let i = 0; i < n; i++) truth.push(Math.floor(i / size));
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
    if (rng() < (truth[i] === truth[j] ? pin : pout)) edges.push([i, j]);
  }
  return { G: fromEdges(Array.from({ length: n }, (_, i) => 'p' + i), edges), truth };
}
const pp = planted(4, 30, 0.35, 0.02, 11);
const ppc = consensus(pp.G, { runs: 10, seed: 2 });
ok(ari(ppc.part, pp.truth) > 0.95, `planted partition recovered (ARI ${ari(ppc.part, pp.truth).toFixed(3)})`);
ok(ppc.agreement > 0.9, `planted: runs agree (${ppc.agreement.toFixed(3)})`);
ok(ppc.stability.every((s) => s > 0.8), 'planted: every node stable');

// ── the null model separates structure from a blob ───────────────────────────
// An Erdős–Rényi graph has no communities, yet Louvain still finds some Q.
// The excess over its own rewired null must be ~0; the planted graph's must not.
const er = planted(1, 120, 0.1, 0, 5).G;
const erQ = consensus(er, { runs: 6, seed: 1 }).q, erNull = nullModularity(er, { samples: 4, seed: 9 });
ok(Math.abs(erQ - erNull.mean) < 0.04, `random graph: Q ≈ null (Q ${erQ.toFixed(3)} vs ${erNull.mean.toFixed(3)})`);
const ppNull = nullModularity(pp.G, { samples: 4, seed: 9 });
ok(ppc.q - ppNull.mean > 0.25, `planted graph: Q far above null (${ppc.q.toFixed(3)} vs ${ppNull.mean.toFixed(3)})`);

// rewiring keeps every degree
const rw = rewire(karate, { seed: 4 });
ok(rw.deg.every((d, i) => d === karate.deg[i]), 'rewire preserves degrees');
ok(rw.edgeCount === karate.edgeCount, 'rewire preserves edge count');
let changed = 0; for (let i = 0; i < 34; i++) for (const j of rw.adj[i].keys()) if (!karate.adj[i].has(j)) changed++;
ok(changed > 20, 'rewire actually moves edges');

// ── graph building from follow rows ──────────────────────────────────────────
const rows = new Map([
  ['A', ['B', 'C', 'Z']],     // Z is outside the set
  ['B', ['A']],
  ['C', ['B']],               // C → B one-way; A → C one-way
  // D's row was never read
]);
const gm = buildGraph(['A', 'B', 'C', 'D'], rows, { mode: 'mutual' });
ok(gm.n === 3 && !gm.ids.includes('D'), 'unread rows are dropped');
ok(gm.edgeCount === 1 && gm.adj[gm.ids.indexOf('A')].has(gm.ids.indexOf('B')), 'mutual mode: only A–B');
const ga = buildGraph(['A', 'B', 'C'], rows, { mode: 'any' });
ok(ga.edgeCount === 3, 'any mode: A–B, A–C, B–C');
ok(ga.adj[0].get(1) === 1 && ga.adj[0].get(2) === 0.5, 'any mode: mutual weight 1, one-way 0.5');
const gx = buildGraph(['A', 'B', 'C'], rows, { mode: 'any', exclude: ['A'] });
ok(gx.n === 2 && gx.edgeCount === 1, 'exclude drops the ego and its edges');

// ── interaction ties ─────────────────────────────────────────────────────────
// A→B 3 (a reply), B→A 1 (a like); A→C 1 one-way; C→D 2; D's activity unread.
const talk = { A: { B: 3, C: 1, X: 9 }, B: { A: 1 }, C: { D: 2 } };
const fol = { A: ['B', 'C'], B: ['A'], C: ['A'] };   // A–B mutual, A–C mutual
const tt1 = buildGraph(['A', 'B', 'C', 'D'], fol, { mode: 'talk', talk });
const at = (G, a, b) => G.adj[G.ids.indexOf(a)].get(G.ids.indexOf(b));
ok(tt1.n === 3 && !tt1.ids.includes('D'), 'talk: nodes without read activity are dropped');
ok(near(at(tt1, 'A', 'B'), Math.log2(1 + 4)) && near(at(tt1, 'B', 'A'), Math.log2(5)), 'talk: weight log2(1 + both directions), symmetric');
ok(near(at(tt1, 'A', 'C'), 1), 'talk: a single like is weight 1');
ok(tt1.edgeCount === 2, 'talk: targets outside the set are ignored, each pair counted once');
const tt2 = buildGraph(['A', 'B', 'C'], fol, { mode: 'talk2', talk });
ok(tt2.edgeCount === 1 && at(tt2, 'A', 'B') > 0, 'talk2: only reciprocated pairs');
const tt3 = buildGraph(['A', 'B', 'C'], { A: ['B', 'C'], B: ['A'], C: [] }, { mode: 'active', talk });
ok(tt3.edgeCount === 1 && at(tt3, 'A', 'B') > 0, 'active: interaction AND mutual follow');
const tt4 = buildGraph(['A', 'B', 'C'], fol, { mode: 'talk', talk, exclude: ['A'] });
ok(tt4.edgeCount === 0 && tt4.n === 2, 'talk: excluding the owner drops their ties');

// ── reading interactions out of records ──────────────────────────────────────
const P = 'at://did:plc:parent/app.bsky.feed.post/3abc', Q = 'at://did:plc:quoted/app.bsky.feed.post/3xyz';
const post = {
  reply: { root: { uri: 'at://did:plc:root/app.bsky.feed.post/1' }, parent: { uri: P } },
  embed: { $type: 'app.bsky.embed.recordWithMedia', record: { record: { uri: Q } } },
  facets: [{ features: [{ $type: 'app.bsky.richtext.facet#mention', did: 'did:plc:m' },
    { $type: 'app.bsky.richtext.facet#mention', did: 'did:plc:m' },
    { $type: 'app.bsky.richtext.facet#mention', did: 'did:plc:parent' },
    { $type: 'app.bsky.richtext.facet#link', uri: 'https://x' }] }],
};
const got = interactionsIn('app.bsky.feed.post', post).map((x) => x.join(':')).sort();
ok(JSON.stringify(got) === JSON.stringify(['did:plc:m:mention', 'did:plc:parent:reply', 'did:plc:quoted:quote']),
  'post → reply to parent (not root), quote through media, one mention, no double count of the replied-to: ' + got);
ok(interactionsIn('app.bsky.feed.like', { subject: { uri: P } })[0].join() === 'did:plc:parent,like', 'like → the liked post\'s author');
ok(interactionsIn('app.bsky.feed.repost', { subject: { uri: Q } })[0].join() === 'did:plc:quoted,repost', 'repost → author');
ok(interactionsIn('app.bsky.feed.post', { text: 'hi' }).length === 0, 'a plain post is no interaction');
ok(new Date(tidTime('3n27roebvf223')).toISOString().startsWith('2026-11-13T20:02'), 'TID rkey decodes to its time');
ok(Number.isNaN(tidTime('self')), 'a non-TID rkey is NaN');

// ── connectivity guarantee ───────────────────────────────────────────────────
const split = splitDisconnected(twoTri, [0, 0, 1, 1, 0, 0]);   // label 0 is two islands
ok(split[0] === split[1] && split[4] === split[5] && split[0] !== split[4], 'disconnected community is split');
for (const seed of [1, 2, 3, 4, 5]) {
  const p = louvain(karate, { gamma: 2, seed });
  const again = splitDisconnected(karate, p);
  ok(ari(p, again) === 1, `louvain communities are connected (seed ${seed})`);
}

// ── determinism ──────────────────────────────────────────────────────────────
ok(JSON.stringify(louvain(karate, { seed: 7 })) === JSON.stringify(louvain(karate, { seed: 7 })), 'same seed, same partition');

// ── descriptive measures ─────────────────────────────────────────────────────
const d2 = describe(twoTri, [0, 0, 0, 1, 1, 1]);
const c0 = d2.communities[0];
ok(c0.size === 3 && c0.inEdges === 3 && near(c0.density, 1), 'triangle: density 1');
ok(c0.cut === 1 && near(c0.conductance, 1 / 7), 'triangle: conductance 1/7');
ok(c0.kcore === 2, 'triangle: internal 2-core');
ok(near(c0.clustering, 1 / 3 * (1 + 1 + 1)), 'triangle: clustering 1');
const pC = d2.people[2];      // c: two inside, one across
ok(near(pC.participation, 1 - ((2 / 3) ** 2 + (1 / 3) ** 2)), 'participation coefficient of the bridge node');
ok(d2.people[0].participation === 0, 'a node with every tie inside has P = 0');
ok(c0.links[1] === 1, 'one edge between the two communities');
ok(near(d2.graphDensity, 7 / 15), 'graph density 7/15');
ok(near(c0.lift, 1 / (7 / 15)), 'lift = community density / graph density');
ok(role(0, 0, 0, 0) === 'isolate' && role(4, 0, 0, 1) === 'outsider' && role(10, 8, 2, 0.1) === 'anchor', 'roles');

const cores = coreNumbers(karate);
ok(Math.max(...cores.values()) === 4, 'karate degeneracy is 4');

const bc = betweenness(karate);
const top = bc.indexOf(Math.max(...bc));
ok(top === 0, 'karate: node 1 has the highest betweenness');
ok(near(bc[0], 0.4376, 1e-3), `karate: node 1 betweenness ≈ 0.4376 (got ${bc[0].toFixed(4)})`);

const s = summary(karate);
ok(s.components === 1 && s.largest === 34 && s.degeneracy === 4, 'karate summary');
ok(near(s.transitivity, 0.2557, 1e-3), `karate transitivity ≈ 0.2557 (got ${s.transitivity.toFixed(4)})`);

// ── sweep ────────────────────────────────────────────────────────────────────
const sw = sweep(pp.G, ppc.part, { runs: 3 });
ok(sw[0].count <= sw[sw.length - 1].count, 'sweep: more communities as γ rises');
const at1 = sw.find((l) => l.gamma === 1);
ok(at1.count === 4, `sweep at γ=1 finds the 4 planted groups (got ${at1.count})`);
ok(at1.communities.every((c) => c.purity > 0.9), 'sweep: γ=1 communities trace cleanly to the reference');

// ── drill-down ───────────────────────────────────────────────────────────────
const first = ppc.part.map((c, i) => [c, i]).filter(([c]) => c === 0).map(([, i]) => i);
const sub = subgraph(pp.G, first);
ok(sub.n === first.length && sub.ids.every((id, i) => id === pp.G.ids[first[i]]), 'subgraph keeps ids');
let subE = 0; for (const i of first) for (const j of pp.G.adj[i].keys()) if (first.includes(j)) subE++;
ok(sub.edgeCount === subE / 2, 'subgraph keeps exactly the internal edges');

// ── layout ───────────────────────────────────────────────────────────────────
const L = layout(pp.G, ppc.part, { iterations: 120 });
ok([...L.x, ...L.y].every((v) => Number.isFinite(v) && Math.abs(v) <= 1 + 1e-9), 'layout is finite and in [-1, 1]');
// communities should be spatially coherent: mean distance within < between
let win = 0, wn = 0, btw = 0, bn = 0;
for (let i = 0; i < pp.G.n; i += 3) for (let j = i + 1; j < pp.G.n; j += 3) {
  const d = Math.hypot(L.x[i] - L.x[j], L.y[i] - L.y[j]);
  if (ppc.part[i] === ppc.part[j]) { win += d; wn++; } else { btw += d; bn++; }
}
ok(win / wn < 0.6 * (btw / bn), 'layout: communities sit together');

// ── islands ──────────────────────────────────────────────────────────────────
// every community in its own disc, discs not overlapping, loose ends together
const withLoose = fromEdges([...pp.G.ids, 'lone1', 'lone2'], [...(() => { const e = []; for (let i = 0; i < pp.G.n; i++) for (const j of pp.G.adj[i].keys()) if (i < j) e.push([i, j]); return e; })()]);
const partL = [...ppc.part, 4, 5];
const IL = islandLayout(withLoose, partL, { iterations: 80 });
ok(IL.islands.length === 5, `islands: 4 communities + 1 loose-ends island (got ${IL.islands.length})`);
let overlap = false;
for (let a = 0; a < IL.islands.length; a++) for (let b = a + 1; b < IL.islands.length; b++) {
  const A2 = IL.islands[a], B2 = IL.islands[b];
  if (Math.hypot(A2.cx - B2.cx, A2.cy - B2.cy) < A2.r + B2.r) overlap = true;
}
ok(!overlap, 'islands: discs do not overlap');
ok([...IL.x, ...IL.y].every((v) => Number.isFinite(v) && Math.abs(v) <= 1 + 1e-9), 'islands: coordinates in [-1, 1]');
const inside = partL.every((c, i) => {
  const isl = IL.islands.find((q) => q.id === (c >= 4 ? -1 : c));
  return Math.hypot(IL.x[i] - isl.cx, IL.y[i] - isl.cy) <= isl.r + 1e-9;
});
ok(inside, 'islands: everyone sits inside their own island');
const big4 = IL.islands.filter((q) => q.id >= 0).map((q) => q.r);
ok(Math.max(...big4) / Math.min(...big4) < 1.3, 'islands: equal communities get equal discs');
// convo mode is the talk graph over a conversation-only score map
const cv = buildGraph(['A', 'B', 'C'], fol, { mode: 'convo', talk: { A: { B: 3 }, B: {}, C: {} } });
ok(cv.edgeCount === 1 && near(at(cv, 'A', 'B'), 2), 'convo: one reply A→B is weight log2(4) = 2');

// ── the page's one call ──────────────────────────────────────────────────────
const A = analyse(karate, { runs: 8, nullSamples: 2 });
ok(A.communities.length === Math.max(...A.part) + 1 && A.people.length === 34, 'analyse: shapes line up');
ok(A.excessQ > 0.1 && A.sweep.length > 3 && A.people.every((p) => typeof p.betweenness === 'number'), 'analyse: null, sweep, betweenness');
ok(A.communities.every((c, i, arr) => i === 0 || arr[i - 1].size >= c.size), 'analyse: communities largest first');

console.log(fails ? `✗ ${fails} failed, ${passes} passed` : `✓ kith selftest: ${passes} passed`);
process.exit(fails ? 1 : 0);

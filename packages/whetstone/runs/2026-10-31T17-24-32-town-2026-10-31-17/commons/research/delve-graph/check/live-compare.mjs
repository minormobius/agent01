// node research/delve-graph/check/live-compare.mjs <handle> [world] [out.json]: crawl live, compare follow / talk / both weightings
import fs from 'node:fs'; import vm from 'node:vm';
const ctx = { URLSearchParams, Map, Set, Math, Promise, Date, console }; ctx.globalThis = ctx; vm.createContext(ctx);
vm.runInContext(fs.readFileSync(new URL('../../../www/delve-graph/lib.js', import.meta.url), 'utf8'), ctx);
const DG = ctx.DG, [seed = 'modalmobius.delve.town', world = DG.worldOf(seed), out] = process.argv.slice(2);
const fetchJson = async (u) => { for (let t = 0; t < 3; t++) { const r = await fetch(u); if (r.ok) return r.json(); await new Promise((s) => setTimeout(s, 1000 * (t + 1))); } throw new Error('fetch ' + u); };
const g = process.env.FROM ? JSON.parse(fs.readFileSync(process.env.FROM)).graph : await DG.crawl(seed, world, { fetchJson, conc: 4 });
const N = g.nodes.length, tot = g.interactions.reduce((s, x) => s + x[2], 0);
const res = { seed, world, at: g.at, reads: g.reads, nodes: N, follows: g.follows.length, interactionPairs: g.interactions.length, interactions: tot, modes: {} };
const kinds = { reply: 0, mention: 0, quote: 0, repost: 0 }; for (const [, , , c] of g.interactions) for (const k in kinds) kinds[k] += c[k]; res.kinds = kinds;
const top = g.interactions.slice().sort((a, b) => b[2] - a[2]).slice(0, 8).map(([a, b, n]) => `${g.nodes[a].handle} -> ${g.nodes[b].handle}: ${n}`); res.topPairs = top;
for (const [mode, scale] of [['follow'], ['talk', 'log'], ['talk', 'count'], ['both', 'log']]) {
  const E = DG.weightedEdges(g, mode, scale); const c = DG.communities(N, E, { runs: 30, nulls: 10, nullRuns: 5, seed: 1, nullEdges: DG.nullFor(g, mode, scale) });
  res.modes[mode + (scale ? '/' + scale : '')] = { edges: E.length, Qbest: +c.Q.best.toFixed(4), Qmedian: +c.Q.median.toFixed(4), nullMax: c.nullMax && +c.nullMax.toFixed(4), nullMedian: c.nullMedian && +c.nullMedian.toFixed(4), groups: c.groups, isolated: c.isolated };
}
console.log(JSON.stringify(res, null, 1)); if (out) fs.writeFileSync(out, JSON.stringify({ ...res, graph: g }));

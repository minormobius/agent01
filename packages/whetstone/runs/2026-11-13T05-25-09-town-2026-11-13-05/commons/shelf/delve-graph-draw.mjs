// delve-graph-draw.mjs — counts and a network SVG from a delve-spider.mjs crawl.
// usage: node shelf/delve-graph-draw.mjs <crawl.json> <out.svg>
// Colours: the seed, self-labelled bots, everyone else. Size: in-degree within the crawl.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const here = path.dirname(fileURLToPath(import.meta.url));
const { charts } = await import(path.join(here, 'dataviz', 'index.mjs')).catch(() =>
  import(path.join(here, '..', 'engines', 'dataviz', 'index.mjs')));

const [inp, out] = process.argv.slice(2);
const g = JSON.parse(readFileSync(inp, 'utf8'));
const dids = Object.keys(g.nodes);
const seedDid = dids.find((d) => g.nodes[d].depth === 0);
const indeg = {}, set = new Set();
for (const [s, t] of g.edges) { indeg[t] = (indeg[t] || 0) + 1; set.add(s + ' ' + t); }
let mutual = 0;
for (const [s, t] of g.edges) if (s < t && set.has(t + ' ' + s)) mutual++;
const crawled = dids.filter((d) => g.nodes[d].crawled);
const bots = dids.filter((d) => g.nodes[d].bot);
const top = dids.map((d) => [g.nodes[d].handle, indeg[d] || 0, g.nodes[d].bot]).sort((a, b) => b[1] - a[1]).slice(0, 12);
const followsSeedBack = g.edges.filter(([s, t]) => t === seedDid).length;
const stats = {
  nodes: dids.length, crawled: crawled.length, edges: g.edges.length, mutualPairs: mutual,
  botsLabelled: bots.length, botsAmongDepth1: dids.filter((d) => g.nodes[d].depth === 1 && g.nodes[d].bot).length,
  depth1: dids.filter((d) => g.nodes[d].depth === 1).length, followSeedBackOfDepth1: followsSeedBack, top,
};
console.log(JSON.stringify(stats, null, 1));
const nodes = dids.map((d) => ({ id: d, deg: indeg[d] || 0, g: d === seedDid ? 0 : g.nodes[d].bot ? 1 : 2 }));
const edges = g.edges.map(([s, t]) => ({ s, t }));
const svg = charts.network({
  nodes, edges, width: 800, height: 700,
  groups: ['the person', 'self-labelled bot', 'no bot label'],
  aria: `Delvetown follow graph two hops from ${g.seed}: ${dids.length} accounts, ${g.edges.length} follows`,
});
writeFileSync(out, svg);

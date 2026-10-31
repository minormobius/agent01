// Recount a delve-spider crawl (compact form) with the net off.
// node shelf/delve-graph-count.mjs research/delve-graph/crawl-<date>-<who>.json
import fs from 'fs';
const c = JSON.parse(fs.readFileSync(process.argv[2]));
const N = c.nodes, E = c.edges, n = N.length, m = E.length / 2;
const set = new Set(), indeg = new Array(n).fill(0);
let out0 = 0;
for (let i = 0; i < E.length; i += 2) { const a = E[i], b = E[i + 1]; set.add(a + ',' + b); indeg[b]++; if (a === 0) out0++; }
let mutual = 0;
for (const k of set) { const [a, b] = k.split(',').map(Number); if (a < b && set.has(b + ',' + a)) mutual++; }
let fb = 0;
for (const k of set) { const [a, b] = k.split(',').map(Number); if (b === 0 && set.has('0,' + a)) fb++; }
const bots = N.filter(x => x[2]).length;
const botsD1 = N.filter(x => x[2] && x[3] === 1).length;
const top = indeg.map((d, i) => [d, N[i][1]]).sort((a, b) => b[0] - a[0]).slice(0, 6);
console.log(JSON.stringify({ n, m, unique: set.size, out0, followBack: fb, mutual, bots, botsD1, top }));

// delve-graph-qcheck.mjs: recompute Q of a given partition from the crawl, independent of the optimiser (net off)
// usage: node shelf/delve-graph-qcheck.mjs <crawl.json> <communities.json>
import { readFileSync } from 'node:fs';
const c = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const r = JSON.parse(readFileSync(process.argv[3], 'utf8'));
const N = c.nodes.length, E = c.edges, dir = new Set();
for (let i = 0; i < E.length; i += 2) dir.add(E[i] * N + E[i + 1]);
const pairs = [];
for (const k of dir) { const a = Math.floor(k / N), b = k % N; if (a < b && dir.has(b * N + a)) pairs.push([a, b]); }
const m = pairs.length, deg = new Array(N).fill(0);
for (const [a, b] of pairs) { deg[a]++; deg[b]++; }
const com = r.comm; let inside = 0; const tot = {};
for (const [a, b] of pairs) if (com[a] === com[b] && com[a] >= 0) inside++;
for (let i = 0; i < N; i++) if (com[i] >= 0) tot[com[i]] = (tot[com[i]] || 0) + deg[i];
let Q = inside / m; for (const t of Object.values(tot)) Q -= (t / (2 * m)) ** 2;
const name = (n) => typeof n === 'string' ? n : (n.handle || n.h || JSON.stringify(n));
const me = c.nodes.findIndex((n) => name(n).startsWith('modalmobius'));
console.log({ N, m, Q: Q.toFixed(4), noMutual: deg.filter((d) => !d).length, me, myCom: com[me] });
console.log(c.nodes.map((n, i) => [name(n), com[i]]).filter((x) => x[1] === com[me]).map((x) => x[0]).join(' '));

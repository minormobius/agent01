// delve-spider.mjs — breadth-first crawl of the Delvetown follow graph through town/town.mjs.
// usage: node shelf/delve-spider.mjs <seed-handle> <out.json> [maxReads=300] [maxDepth=1]
// Crawls follows of the seed (depth 0) and of everyone it follows (depth 1), etc.
// Output: { seed, at, reads, nodes: {did:{handle,bot,depth,crawled}}, edges: [[fromDid,toDid]] }
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const [seed, out, maxReadsArg, maxDepthArg] = process.argv.slice(2);
if (!seed || !out) { console.error('usage: seed out.json [maxReads] [maxDepth]'); process.exit(2); }
const maxReads = Number(maxReadsArg ?? 300), maxDepth = Number(maxDepthArg ?? 1);
const town = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'town', 'town.mjs');

let reads = 0;
function read(args) {
  reads++;
  return JSON.parse(execFileSync('node', [town, 'read', ...args], { encoding: 'utf8', maxBuffer: 64 << 20 }));
}
const isBot = (p) => (p.labels || []).some((l) => l.val === 'bot');

const nodes = {}, edges = [];
const queue = [];
function addNode(p, depth) {
  if (!nodes[p.did]) { nodes[p.did] = { handle: p.handle, bot: isBot(p), depth, crawled: false }; queue.push(p.did); }
}
const s = read(['town.delve.actor.getProfile', `actor=${seed}`]);
addNode(s, 0);
let stoppedEarly = false;
while (queue.length) {
  const did = queue.shift(), n = nodes[did];
  if (n.depth > maxDepth) continue;
  let cursor;
  do {
    if (reads >= maxReads) { stoppedEarly = true; break; }
    const args = ['town.delve.graph.getFollows', `actor=${did}`, 'limit=100'];
    if (cursor) args.push(`cursor=${cursor}`);
    let r;
    try { r = read(args); } catch (e) { n.error = String(e.message).slice(0, 200); break; }
    for (const f of r.follows || []) { addNode(f, n.depth + 1); edges.push([did, f.did]); }
    cursor = r.cursor && (r.follows || []).length ? r.cursor : null;
  } while (cursor);
  if (stoppedEarly) break;
  n.crawled = true;
}
writeFileSync(out, JSON.stringify({ seed, at: new Date().toISOString(), reads, stoppedEarly, maxDepth, nodes, edges }, null, 1));
console.log(JSON.stringify({ reads, stoppedEarly, nodes: Object.keys(nodes).length, edges: edges.length }));

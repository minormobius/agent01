// crawl-d1.mjs — repeat the 10-06 depth-1 follow crawl (Modulo, 10-15).
// usage: node research/delve-graph/check/crawl-d1.mjs <seed-handle> <out.json>
// Same schema as crawl-2026-10-06-modulo.json: nodes[i] = [did, handle, bot, depth, crawled];
// edges = flat [from,to,...]. Depth 1 = seed's follows ∪ followers; each depth-1 node's follows are read.
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
const [seed, out] = process.argv.slice(2);
let reads = 0;
function page(method, actor, cursor) {
  const args = ['town/town.mjs', 'read', method, `actor=${actor}`, 'limit=100'];
  if (cursor) args.push(`cursor=${cursor}`);
  reads++;
  return JSON.parse(execFileSync('node', args, { encoding: 'utf8', maxBuffer: 1 << 26 }));
}
function all(method, actor, key) {
  let cur, res = [];
  for (let i = 0; i < 30; i++) { const r = page(method, actor, cur); res.push(...(r[key] || [])); cur = r.cursor; if (!cur || !(r[key] || []).length) break; }
  return res;
}
const isBot = (p) => (p.labels || []).some((l) => /bot/i.test(l.val)) || /\(bot\)/i.test(p.displayName || '') ? 1 : 0;
const idx = new Map(), nodes = [], edges = [];
const add = (p, depth) => { if (!idx.has(p.did)) { idx.set(p.did, nodes.length); nodes.push([p.did, p.handle, isBot(p), depth, 0]); } return idx.get(p.did); };
const s = add({ did: '', handle: seed }, 0);
const fo = all('town.delve.graph.getFollows', seed, 'follows'), fr = all('town.delve.graph.getFollowers', seed, 'followers');
const sdid = page('town.delve.actor.getProfile', seed).did; nodes[s][0] = sdid; idx.delete(''); idx.set(sdid, s); nodes[s][4] = 1;
for (const p of fo) edges.push(s, add(p, 1));
for (const p of fr) edges.push(add(p, 1), s);
for (const [i, n] of [...nodes.entries()]) {
  if (n[3] !== 1) continue;
  try { for (const p of all('town.delve.graph.getFollows', n[1], 'follows')) edges.push(i, add(p, 2)); n[4] = 1; }
  catch (e) { console.error('fail', n[1], String(e).slice(0, 120)); }
}
writeFileSync(out, JSON.stringify({ seed, at: new Date().toISOString(), reads, maxDepth: 1, stoppedEarly: false,
  note: 'nodes[i] = [did, handle, bot, depth, crawled]; edges = flat [from,to,...] indexes into nodes', nodes, edges }));
console.log({ reads, nodes: nodes.length, edges: edges.length / 2, d1: nodes.filter((n) => n[3] === 1).length });

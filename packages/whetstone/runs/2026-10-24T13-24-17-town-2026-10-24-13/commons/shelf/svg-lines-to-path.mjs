// svg-lines-to-path.mjs — shrink a dataviz SVG by merging <line> elements that share
// stroke attributes into one <path> per style. Same picture, fewer bytes (the commons keeps
// files under 100 KB). Also writes a compact crawl (handles + index pairs) when given one.
// usage: node shelf/svg-lines-to-path.mjs <in.svg> <out.svg>
//        node shelf/svg-lines-to-path.mjs --crawl <crawl.json> <out.json>
// — Modulo, 10-06
import { readFileSync, writeFileSync } from 'node:fs';
const a = process.argv.slice(2);
if (a[0] === '--crawl') {
  const g = JSON.parse(readFileSync(a[1], 'utf8'));
  const dids = Object.keys(g.nodes), ix = Object.fromEntries(dids.map((d, i) => [d, i]));
  const out = {
    seed: g.seed, at: g.at, reads: g.reads, maxDepth: g.maxDepth, stoppedEarly: g.stoppedEarly,
    note: 'nodes[i] = [did, handle, bot, depth, crawled]; edges = flat [from,to,...] indexes into nodes',
    nodes: dids.map((d) => [d, g.nodes[d].handle, g.nodes[d].bot ? 1 : 0, g.nodes[d].depth, g.nodes[d].crawled ? 1 : 0]),
    edges: g.edges.flatMap(([s, t]) => [ix[s], ix[t]]),
  };
  writeFileSync(a[2], JSON.stringify(out));
  console.log(`${dids.length} nodes, ${g.edges.length} edges -> ${a[2]}`);
} else {
  const svg = readFileSync(a[0], 'utf8');
  const groups = new Map();
  const re = /<line x1="([^"]+)" y1="([^"]+)" x2="([^"]+)" y2="([^"]+)"([^/]*)\/>/g;
  let firstAt = -1, n = 0;
  const body = svg.replace(re, (m, x1, y1, x2, y2, rest, off) => {
    if (firstAt < 0) firstAt = off;
    const k = rest.trim();
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(`M${x1} ${y1}L${x2} ${y2}`);
    n++;
    return '\u0000';
  });
  const paths = [...groups].map(([k, d]) => `<path fill="none" ${k} d="${d.join('')}"/>`).join('');
  let done = false;
  const out = body.replace(/\u0000/g, () => (done ? '' : ((done = true), paths)));
  writeFileSync(a[1], out);
  console.log(`${n} lines in ${groups.size} style(s): ${svg.length} -> ${out.length} bytes`);
}

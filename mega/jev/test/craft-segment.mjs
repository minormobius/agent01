// craft-segment.mjs — read a recorded game (a saved .jsonl stream) as episodes.
//
//   node mega/jev/test/craft-segment.mjs run.jsonl            # the episodes, one per line
//   node mega/jev/test/craft-segment.mjs run.jsonl --score    # how well the names match the macros (macro-played streams only)
//   node mega/jev/test/craft-segment.mjs run.jsonl --json     # machine-readable
//
// The page's "save stream (.jsonl)" writes exactly this file, whoever played.

import { readFileSync } from 'node:fs';
import { segment, score } from '../craft/segment.mjs';

const file = process.argv[2];
if (!file) { console.error('usage: craft-segment.mjs <stream.jsonl> [--score] [--json]'); process.exit(2); }
const lines = readFileSync(file, 'utf8').split('\n').filter((l) => l.trim());
if (process.argv.includes('--score')) {
  const s = score(lines);
  console.log(`${s.runs} macro runs, ${s.episodes} episodes: family right on ${(100 * s.run_family).toFixed(0)}% of runs, name on ${(100 * s.run_name).toFixed(0)}% (per action: ${(100 * s.family).toFixed(0)}% / ${(100 * s.name).toFixed(0)}%)`);
  for (const [k, v] of Object.entries(s.runConfusion).sort((a, b) => b[1] - a[1]).slice(0, 20)) console.log(`  ${String(v).padStart(4)}  ${k}`);
  process.exit(0);
}
const eps = segment(lines);
if (process.argv.includes('--json')) { console.log(JSON.stringify(eps, null, 1)); process.exit(0); }
const short = (o) => Object.entries(o).map(([k, v]) => `${k.replace(/_ore$/, '')}×${v}`).join(' ');
for (const e of eps) {
  const d = e.depth ? `y ${e.depth.start}→${e.depth.end}` : '';
  console.log(`${String(e.from).padStart(6)}–${String(e.to).padEnd(6)} #${e.who}${e.dim === 'nether' ? ' nether' : ''}  ${e.label.padEnd(15)} ${String(e.n).padStart(4)} acts  ${d.padEnd(10)} ${short(e.mined)} ${Object.keys(e.placed).length ? 'placed ' + short(e.placed) : ''} ${Object.keys(e.crafted).length ? 'crafted ' + short(e.crafted) : ''}${e.macro ? `   [macro: ${e.macro}]` : e.human ? '   [hands]' : ''}`);
}

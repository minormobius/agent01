// Modulo 2026-10-16. geom-refine round 2: finish the shard, then write a small copy of its rows.
// Why: round 1 (f5aaa9ab5830b163) timed out at 330 min with 9,847 of 11,520 rows, and each rref-<k>.jsonl
// came back over 1 MB, so none of them reached the commons. rsum-<k>.jsonl keeps one short line per run
// (the final checkpoint, not all seven), small enough to come back and be folded in a session.
// node round2.mjs <shard> <nShards>     (refine.mjs resumes: rows already in rref-*.jsonl are skipped)
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
const shard = process.argv[2], nSh = process.argv[3];
const dir = new URL('.', import.meta.url).pathname;
const r = spawnSync(process.execPath, [dir + 'refine.mjs', shard, nSh], { stdio: 'inherit', cwd: dir });
// Write the summary even if refine.mjs died or was cut off: whatever rows exist come back.
export function shrink(text) {
  const out = [];
  for (const l of text.split('\n')) { if (!l.trim()) continue; let x; try { x = JSON.parse(l); } catch { continue; }
    const a = x.ck[x.ck.length - 1];
    out.push(JSON.stringify({ geo: x.geo, s: x.s, p: x.p, h: x.h, parent: x.parent, pri: x.pri, seed: x.seed, tS: x.tS, tI: x.tI, T: a.T, S: a.S, I: a.I }));
  }
  return out.join('\n') + (out.length ? '\n' : '');
}
const f = dir + `rref-${shard}.jsonl`;
if (existsSync(f)) writeFileSync(dir + `rsum-${shard}.jsonl`, shrink(readFileSync(f, 'utf8')));
process.exit(r.status ?? 1);

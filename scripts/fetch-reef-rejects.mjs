// Pull crowd verdicts from the live judge site and emit the list of
// specimen ids the crowd REJECTED (>= 3 votes, yes-ratio < 0.4). The trainer
// drops these from the training corpus (--drop). Held-out seeds are never
// dropped (the trainer enforces that). Best-effort: an unreachable site
// yields an empty list so training still runs on the full generator corpus.
// Usage: node scripts/fetch-reef-rejects.mjs [out.json] [endpoint]
import { writeFileSync } from 'node:fs';

const out = process.argv[2] || 'reef_rejects.json';
const endpoint = process.argv[3] || 'https://reef.mino.mobi/api/reef/export';
let rejected = [];
try {
  const d = await (await fetch(endpoint, { signal: AbortSignal.timeout(15000) })).json();
  rejected = (d.specimens || [])
    .filter((s) => s.yes / (s.yes + s.no) < 0.4)
    .map((s) => s.specimen);
  console.log(`crowd verdicts: ${d.specimens?.length ?? 0} specimens with >=${d.minVotes} votes, ${rejected.length} rejected`);
} catch (e) {
  console.log(`judge site unreachable (${e.message}) — training on full generator corpus`);
}
writeFileSync(out, JSON.stringify(rejected));

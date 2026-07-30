#!/usr/bin/env node
// ideas-batch.mjs — choose which unreviewed papers an agent looks at next.
//
//   node scripts/ideas-batch.mjs                 # write batch.json (default 24)
//   node scripts/ideas-batch.mjs --size 8 --dry  # print the selection only
//
// Stage 2 of 4 (pull → batch → concepts → gate). Pure selection, no network, no
// model: it exists so that "which papers did the agent see?" is a deterministic,
// testable, reviewable decision instead of a side effect of however an agent
// chose to read a 200-line file.
//
// WHY BATCH AT ALL. Handing an agent the whole pool has two failure modes and
// they compound: it skims (quality drops on every paper) and it front-loads
// (whatever is at the top of the file gets the attention). A bounded batch means
// every paper in it can actually be read.
//
// WHY ROUND-ROBIN BY FAMILY, WHICH IS THE IMPORTANT PART. On 2026-07-29 math.CO
// alone returned 31 papers and the entire q-bio tree returned 12. Newest-first
// selection would hand the agent a batch that is mostly combinatorics every
// single day, and the small archives — which is where bio lives — would be
// starved indefinitely by arithmetic rather than by any judgement about them. So
// selection takes one paper per family in turn: every family gets looked at every
// run, and a big archive gets more slots only after every small one has had its
// turn.

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const IDEAS = join(ROOT, '.github', 'ideas');

/**
 * Round-robin over families, newest-first within each.
 *
 * A paper cross-listed into several families is assigned to the one it helps
 * most — the family with the fewest papers waiting — so a q-bio paper that also
 * carries cond-mat.stat-mech counts for bio rather than being absorbed by the
 * larger pile.
 */
export function selectBatch(pool, { size = 24 } = {}) {
  const unreviewed = pool.filter((p) => !p.reviewed);

  const depth = new Map();
  for (const p of unreviewed) {
    for (const f of p.families?.length ? p.families : ['unfiled']) {
      depth.set(f, (depth.get(f) || 0) + 1);
    }
  }

  const byFamily = new Map();
  for (const p of unreviewed) {
    const fams = p.families?.length ? p.families : ['unfiled'];
    const home = fams.reduce((a, b) => ((depth.get(b) || 0) < (depth.get(a) || 0) ? b : a), fams[0]);
    if (!byFamily.has(home)) byFamily.set(home, []);
    byFamily.get(home).push(p);
  }

  // Newest first inside a family; families visited smallest-first so the scarce
  // ones are served before the budget runs out.
  for (const list of byFamily.values()) {
    list.sort((a, b) => (b.published || '').localeCompare(a.published || ''));
  }
  const families = [...byFamily.keys()].sort((a, b) => byFamily.get(a).length - byFamily.get(b).length);

  const batch = [];
  for (let round = 0; batch.length < size; round++) {
    let placed = false;
    for (const f of families) {
      const list = byFamily.get(f);
      if (round >= list.length) continue;
      batch.push(list[round]);
      placed = true;
      if (batch.length >= size) break;
    }
    if (!placed) break; // every family exhausted
  }
  return batch;
}

/** What the agent is handed: enough to judge a paper, and nothing else. */
export function batchPayload(batch) {
  return {
    generatedAt: new Date().toISOString(),
    count: batch.length,
    papers: batch.map((p) => ({
      id: p.id,
      title: p.title,
      abstract: p.abstract,
      categories: p.viaCategories || p.categories,
      families: p.families,
    })),
  };
}

// --- CLI -------------------------------------------------------------------
if (process.argv[1] && process.argv[1].endsWith('ideas-batch.mjs')) {
  const argv = process.argv.slice(2);
  const arg = (n, d) => { const i = argv.indexOf(`--${n}`); return i === -1 ? d : argv[i + 1]; };

  const poolPath = arg('pool', join(IDEAS, 'pool.jsonl'));
  const outPath = arg('out', join(IDEAS, 'batch.json'));
  const size = Number(arg('size', 24));
  const dry = argv.includes('--dry');

  if (!existsSync(poolPath)) {
    console.log(`— no pool at ${poolPath}; run ideas-fetch.mjs first`);
    process.exit(0);
  }
  const pool = readFileSync(poolPath, 'utf8').split('\n').filter((l) => l.trim()).map((l) => JSON.parse(l));
  const batch = selectBatch(pool, { size });

  const spread = {};
  for (const p of batch) for (const f of p.families?.length ? p.families : ['unfiled']) spread[f] = (spread[f] || 0) + 1;

  console.log(`pool: ${pool.length} papers, ${pool.filter((p) => !p.reviewed).length} unreviewed`);
  console.log(`batch: ${batch.length} of ${size} requested`);
  console.log(`spread: ${Object.entries(spread).map(([f, n]) => `${f}=${n}`).join(' ') || '—'}\n`);
  for (const p of batch) console.log(`  ${p.id}  [${(p.families || []).join(',')}]  ${p.title.slice(0, 74)}`);

  if (!dry) {
    writeFileSync(outPath, JSON.stringify(batchPayload(batch), null, 2) + '\n');
    console.log(`\n✓ → ${outPath}`);
  }
  // An empty batch is a fully-reviewed pool, which is a normal state.
  process.exit(0);
}

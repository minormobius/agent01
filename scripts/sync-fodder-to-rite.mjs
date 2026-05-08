#!/usr/bin/env node
// Sync approved fodder candidates into rite/corpus.json.
//
// Usage:
//   node scripts/sync-fodder-to-rite.mjs
//   node scripts/sync-fodder-to-rite.mjs --dry      # show what would change
//   node scripts/sync-fodder-to-rite.mjs --url=https://fodder.mino.mobi
//
// Idempotent: candidate ids of the form "f-<book>-<hash>" never collide
// with hand-curated rite ids ("v001"...), and we skip any id already
// present in rite/corpus.json.

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');
const CORPUS_PATH = path.join(REPO_ROOT, 'rite', 'corpus.json');

const args = new Map(
  process.argv.slice(2).map((a) => {
    if (a.startsWith('--')) {
      const [k, v] = a.slice(2).split('=');
      return [k, v ?? true];
    }
    return [a, true];
  })
);

const URL = args.get('url') || 'https://fodder.mino.mobi';
const DRY = !!args.get('dry');

async function main() {
  const corpus = JSON.parse(await fs.readFile(CORPUS_PATH, 'utf8'));
  const have = new Set(corpus.sentences.map((s) => s.id));

  const res = await fetch(URL.replace(/\/$/, '') + '/api/promoted');
  if (!res.ok) {
    console.error(`fetch failed: ${res.status} ${res.statusText}`);
    process.exit(1);
  }
  const promoted = await res.json();
  const incoming = promoted.sentences || [];
  console.log(`fetched ${incoming.length} approved candidates from ${URL}`);

  const additions = [];
  for (const s of incoming) {
    if (have.has(s.id)) continue;
    if (!s.original || !Array.isArray(s.references) || s.references.length < 2) continue;
    additions.push({
      id: s.id,
      style: s.style || 'unknown',
      original: s.original,
      references: s.references,
      // Provenance is preserved alongside the entry so we can audit.
      source: s.source,
      crowd: s.crowd,
    });
  }

  if (!additions.length) {
    console.log('nothing new to add. corpus is up to date.');
    return;
  }

  console.log(`will add ${additions.length} new sentences:`);
  for (const a of additions) {
    console.log(`  + ${a.id} [${a.style}] (${a.original.slice(0, 80)}…)`);
  }

  if (DRY) {
    console.log('\n(dry run — not writing)');
    return;
  }

  corpus.sentences.push(...additions);
  // Bump corpus version metadata.
  corpus.last_synced_at = new Date().toISOString();
  corpus.last_synced_count = additions.length;
  await fs.writeFile(CORPUS_PATH, JSON.stringify(corpus, null, 2) + '\n');
  console.log(`\nwrote ${additions.length} new entries to rite/corpus.json (now ${corpus.sentences.length} total).`);
  console.log('next: review with `git diff rite/corpus.json`, then commit.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

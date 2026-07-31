#!/usr/bin/env node
// hoop/v095/review.mjs — the content review / conflict-preview CLI (the generator's gate; CI-able).
//   node hoop/v095/review.mjs candidates.json          # review a batch against the live pool
//   node hoop/v095/review.mjs                           # self-check: review the pool against itself (must PASS)
// Exit code: 0 = PASS (safe to merge), 1 = BLOCK (conflicts) — so it gates a CI step or a generator run.
// Candidates may be a flat array of content_items OR a sectioned pool.json ({items,npcs,...}).
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { flattenPool } from './story/engine.js';
import { reviewBatch } from './story/review.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const existing = flattenPool(JSON.parse(readFileSync(join(HERE, 'story/pool.json'), 'utf8')));

let candidates = [];
const arg = process.argv[2];
if (arg) { const j = JSON.parse(readFileSync(arg, 'utf8')); candidates = Array.isArray(j) ? j : flattenPool(j); }
else candidates = existing;   // no arg → sanity-check the live pool against itself

const r = reviewBatch(existing, candidates);
const C = { dim: '\x1b[2m', red: '\x1b[31m', grn: '\x1b[32m', yel: '\x1b[33m', cya: '\x1b[36m', rst: '\x1b[0m' };

console.log(`\n  ${C.cya}content review${C.rst} — ${candidates.length} candidate(s) vs ${existing.length} in the pool`);
console.log(`  adds:    ${r.adds.length}${r.adds.length ? C.dim + ' (' + r.adds.join(', ') + ')' + C.rst : ''}`);
console.log(`  edits:   ${r.edits.length}${r.edits.length ? C.dim + ' (' + r.edits.join(', ') + ')' + C.rst : ''}`);
console.log(`  by type: ${C.dim}${JSON.stringify(r.counts)}${C.rst}`);
if (r.warnings.length) { console.log(`\n  ${C.yel}warnings (${r.warnings.length})${C.rst}`); for (const w of r.warnings) console.log(`    ${C.yel}~${C.rst} ${w.id}: ${w.msg} ${C.dim}[${w.code}]${C.rst}`); }
if (r.conflicts.length) { console.log(`\n  ${C.red}conflicts (${r.conflicts.length}) — would break the pool${C.rst}`); for (const c of r.conflicts) console.log(`    ${C.red}✗${C.rst} ${c.id}: ${c.msg} ${C.dim}[${c.code}]${C.rst}`); }

const okv = r.verdict === 'PASS';
console.log(`\n  ${okv ? C.grn + '✓ PASS — safe to merge' : C.red + '✗ BLOCK — resolve the conflicts above'}${C.rst}\n`);
process.exit(okv ? 0 : 1);

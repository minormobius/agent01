// review.selftest.mjs — pins the content review / conflict-preview gate (hoop/v095/story/review.js).
//   node hoop/v095/test/review.selftest.mjs
// A clean batch PASSES; every authoring conflict (bad tier, broken tree, new orphan gate, id type-swap,
// dup id, missing field, bad type) is caught and BLOCKS. Tabard tier 5 is accepted (the old 1..3 clamp is gone).
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { flattenPool } from '../story/engine.js';
import { reviewBatch } from '../story/review.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const existing = flattenPool(JSON.parse(readFileSync(join(HERE, '../story/pool.json'), 'utf8')));
let pass = 0, fail = 0;
const ok = (n, c) => { if (c) pass++; else { fail++; console.log('  ✗ ' + n); } };
const has = (r, code) => r.conflicts.some((x) => x.code === code);

const cleanLore = { id: 'x-lore', type: 'lore_fragment', revelation_tier: 2, narrative_tier: 1, power_tier: 1, approved: true, status: 'active', tags: ['nave'], content: { name: 'A Notice', description: 'pinned to a post.' } };
const cleanNpc = { id: 'x-npc', type: 'npc', revelation_tier: 1, narrative_tier: 1, power_tier: 1, approved: true, status: 'active', tags: ['drift'],
  content: { name: 'A Runner', dialogue: { start: 's', nodes: { s: { says: 'hi', choices: [{ id: 'go', text: '(go)', effects: { end: true } }] } } } } };

// 1. a clean batch passes
{ const r = reviewBatch(existing, [cleanLore, cleanNpc]);
  ok('clean batch PASSES', r.verdict === 'PASS' && r.conflicts.length === 0);
  ok('counts the adds by type', r.counts.lore_fragment === 1 && r.counts.npc === 1 && r.adds.length === 2); }

// 2. Tabard tier 5 is accepted (the old 1..3 clamp is fixed); tier 6 / non-int is rejected
ok('revelation_tier 5 accepted', reviewBatch(existing, [{ ...cleanLore, id: 't5', revelation_tier: 5 }]).verdict === 'PASS');
ok('tier 6 rejected', has(reviewBatch(existing, [{ ...cleanLore, id: 't6', narrative_tier: 6 }]), 'tier_range'));

// 3. broken dialogue tree blocks
{ const broken = { ...cleanNpc, id: 'bad-tree', content: { name: 'X', dialogue: { start: 's', nodes: { s: { says: '', choices: [{ id: 'x', goto: 'gone' }] } } } } };
  ok('broken goto blocks', has(reviewBatch(existing, [broken]), 'tree_missing_goto')); }

// 4. a NEW orphan gate blocks (gates on a fact nothing produces)
{ const orphan = { id: 'orph', type: 'lore_fragment', revelation_tier: 1, narrative_tier: 1, power_tier: 1, approved: true, status: 'active', tags: [], requires: { facts: { 'flag.nope': true } }, content: { name: 'X', description: '' } };
  ok('new orphan gate blocks', has(reviewBatch(existing, [orphan]), 'orphan_gate')); }

// 5. canon: editing an existing id with a different type blocks (orphans placements)
ok('type-swap on an existing id blocks', has(reviewBatch(existing, [{ ...cleanLore, id: 'np-olo', type: 'lore_fragment' }]), 'type_change'));
ok('a same-type edit is allowed (counts as an edit)', reviewBatch(existing, [{ ...existing.find((c) => c.id === 'lo-cradle'), content: { name: 'The Cradle', description: 'enriched.' } }]).edits.includes('lo-cradle'));

// 6. structural: missing field, unknown type, dup id in batch
ok('missing field blocks', has(reviewBatch(existing, [{ id: 'm', type: 'item' }]), 'missing_field'));
ok('unknown type blocks', has(reviewBatch(existing, [{ id: 'u', type: 'weapon', content: {} }]), 'bad_type'));
ok('dup id in batch blocks', has(reviewBatch(existing, [cleanLore, { ...cleanLore }]), 'dup_in_batch'));

// 7. unapproved is a WARNING, not a block (the engine just withholds it)
{ const r = reviewBatch(existing, [{ ...cleanLore, id: 'pend', approved: false }]);
  ok('unapproved warns but does not block', r.verdict === 'PASS' && r.warnings.some((w) => w.code === 'not_approved')); }

console.log(`\n${fail ? '✗ FAIL' : '✓ PASS'} — ${pass} ok, ${fail} failed`);
process.exit(fail ? 1 : 0);

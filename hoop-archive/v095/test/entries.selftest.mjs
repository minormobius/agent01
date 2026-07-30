// entries.selftest.mjs — pins state-gated dialogue ENTRIES (engine.js): keystone NPCs greet differently
//   node hoop/v095/test/entries.selftest.mjs
// as the story advances, instead of repeating their intro. Backward-compatible: no `entries` → plain start.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { MemoryStore, flattenPool, interact, take, talk, choose } from '../story/engine.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const POOL = JSON.parse(readFileSync(join(HERE, '../story/pool.json'), 'utf8'));
const content = flattenPool(POOL);
const store = () => new MemoryStore(content, { features: [] });
let pass = 0, fail = 0;
const ok = (n, c) => { if (c) pass++; else { fail++; console.log('  ✗ ' + n); } };
const P = 'p';

// Olo opens at 'wake' first, then 'again' once you've stood up (met_olo) and ended the talk
{ const s = store();
  s.addFeature({ key: 'a:olo', type: 'npc', content_id: 'np-olo' }); interact(s, P, 'a:olo');
  ok('Olo opens at wake first', talk(s, P, 'np-olo').node === 'wake');
  choose(s, P, 'np-olo', 'ready');           // → node 'ready', sets flag.met_olo
  choose(s, P, 'np-olo', 'go');              // end → resets to entry
  const again = talk(s, P, 'np-olo');
  ok('Olo re-opens at the terse "again", not the full intro', again.node === 'again');
  ok('the repeated full-intro questions are gone', !again.choices.some((c) => c.id === 'where')); }

// Sevin stops asking for a reason once she believes you
{ const s = store();
  s.addFeature({ key: 'a:sevin', type: 'npc', content_id: 'np-sevin' }); interact(s, P, 'a:sevin');
  ok('Sevin opens at s0 first', talk(s, P, 'np-sevin').node === 's0');
  s.setFact(P, 'flag.sevin_believes', true);
  ok('Sevin re-opens at "open" once believing (no re-interrogation)', talk(s, P, 'np-sevin').node === 'open'); }

// backward-compat: a crowd NPC with no entries opens at its start / is tree-less
{ const s = store();
  ok('a tree-less crowd NPC is unaffected', talk(s, P, 'np-cont-steward').no_tree === true); }

console.log(`\n${fail ? '✗ FAIL' : '✓ PASS'} — ${pass} ok, ${fail} failed`);
process.exit(fail ? 1 : 0);

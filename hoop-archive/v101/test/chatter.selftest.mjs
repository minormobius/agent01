// chatter.selftest.mjs — pins the deterministic crowd-chatter picker (hoop/v095/story/chatter.js).
//   node hoop/v095/test/chatter.selftest.mjs
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { activePhase, pickChatter, factionOf, normalizeFaction, factionForRole } from '../story/chatter.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const BANK = JSON.parse(readFileSync(join(HERE, '../story/chatter.json'), 'utf8'));
let pass = 0, fail = 0;
const ok = (n, c) => { if (c) pass++; else { fail++; console.log('  ✗ ' + n); } };

const ORD = { narrative_tier: 1, revelation_tier: 1, facts: {}, items: new Set() };
const STIR = { narrative_tier: 1, revelation_tier: 1, facts: {}, items: new Set(['notation']) };
const OPEN = { narrative_tier: 2, revelation_tier: 1, facts: {}, items: new Set(['notation']) };

// 1. phase selection tracks world state (highest satisfied wins)
ok('fresh → ordinary', activePhase(BANK, ORD) === 'ordinary');
ok('carry the notation → stirring', activePhase(BANK, STIR) === 'stirring');
ok('narrative 2 → opened (highest)', activePhase(BANK, OPEN) === 'opened');

// 2. picks a real faction+phase line, deterministic per (seed, phase)
{ const a = pickChatter(BANK, 'continuant', ORD, 'npc-7'), b = pickChatter(BANK, 'continuant', ORD, 'npc-7');
  ok('returns a line', typeof a === 'string' && a.length > 0);
  ok('deterministic per seed+phase', a === b);
  ok('line is from the right faction/phase', BANK.lines.continuant.ordinary.includes(a)); }

// 3. the line SHIFTS when the phase advances (the crowd reacts to the story)
{ const before = pickChatter(BANK, 'drift', ORD, 'npc-9'), after = pickChatter(BANK, 'drift', OPEN, 'npc-9');
  ok('phase change re-rolls into the new bank', BANK.lines.drift.ordinary.includes(before) && BANK.lines.drift.opened.includes(after)); }

// 4. different NPCs vary; unknown faction falls back to _default
{ const seeds = ['a', 'b', 'c', 'd', 'e', 'f'].map((s) => pickChatter(BANK, 'rindwalker', ORD, s));
  ok('crowd varies across seeds', new Set(seeds).size > 1);
  ok('unknown faction → _default bank', BANK.lines._default.ordinary.includes(pickChatter(BANK, 'townsfolk', ORD, 'x'))); }

// 5. factionOf reads the faction tag off an NPC's tags — and normalizes hoopy's plural/variant spellings
ok('factionOf finds the faction', factionOf(['continuant', 'govern']) === 'continuant');
ok('factionOf defaults', factionOf(['govern']) === '_default');
ok('factionOf normalizes the PLURAL (continuants → continuant)', factionOf(['continuants', 'atmosphere']) === 'continuant');
ok('normalizeFaction folds rind-walkers → rindwalker', normalizeFaction('rind-walkers') === 'rindwalker');
ok('normalizeFaction folds Drifter → drift', normalizeFaction('Drifter') === 'drift');
ok('normalizeFaction rejects a non-faction word', normalizeFaction('atmosphere') === null);
ok('chatter keys off the normalized faction (continuants resolves to a real bank)',
   BANK.lines.continuant.ordinary.includes(pickChatter(BANK, factionOf(['continuants']), ORD, 'np-x')));
ok('factionForRole maps a civic role', factionForRole('trade') === 'drift' && factionForRole('mend') === 'continuant');
ok('factionForRole is null for neutral dwell', factionForRole('dwell') === null);

// 6. bank integrity — every faction covers every phase with ≥1 line
{ const phases = BANK.phases.map((p) => p.id), bad = [];
  for (const [f, byp] of Object.entries(BANK.lines)) for (const ph of phases) if (!(byp[ph] && byp[ph].length)) bad.push(f + '/' + ph);
  ok('every faction covers every phase', bad.length === 0);
  if (bad.length) console.log('     missing: ' + bad.join(', ')); }

console.log(`\n${fail ? '✗ FAIL' : '✓ PASS'} — ${pass} ok, ${fail} failed`);
process.exit(fail ? 1 : 0);

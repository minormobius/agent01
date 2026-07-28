// informed.selftest.mjs — pins the XP→informed→deeper-lore loop (the collaborator's idea).
//   node hoop/v095/test/informed.selftest.mjs
// Lore-exposure (XP→power) unlocks an `informed` beat; "the next NPC" delivers it (sets its
// completes_when fact); that closes the beat → checkAdvance bumps revelation; the crowd's chatter
// deepens to the 'curve' phase. All deterministic, no inference.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { MemoryStore, flattenPool } from '../story/engine.js';
import { computeBoard, tierFloors } from '../story/board.js';
import { checkAdvance } from '../story/advance.js';
import { activePhase } from '../story/chatter.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const SB = JSON.parse(readFileSync(join(HERE, '../story/storyboard.json'), 'utf8'));
const BANK = JSON.parse(readFileSync(join(HERE, '../story/chatter.json'), 'utf8'));
const content = flattenPool(JSON.parse(readFileSync(join(HERE, '../story/pool.json'), 'utf8')));
let pass = 0, fail = 0;
const ok = (n, c) => { if (c) pass++; else { fail++; console.log('  ✗ ' + n); } };
const P = 'p';
const stat = (b, id) => (b.find((x) => x.id === id) || {}).status;

// opening solved (b3-reason done) but low XP → the informed beat is still locked (needs lore-exposure)
{ const s = new MemoryStore(content, {}); s.setFact(P, 'flag.sevin_believes', true);
  ok('b-curve locked at low power', stat(computeBoard(SB, s, P), 'b-curve') === 'locked'); }

// explore enough (lore-XP → power 3) → the informed beat unlocks (active, carries an `informed` line)
{ const s = new MemoryStore(content, {}); s.setFact(P, 'flag.sevin_believes', true);
  s.setPlayerXp(P, 80, 3);   // 80 XP ⇒ power tier 3 (the lore you've been exposed to)
  const b = computeBoard(SB, s, P);
  const curve = b.find((x) => x.id === 'b-curve');
  ok('b-curve unlocks at power 3', curve.status === 'active');
  ok('b-curve carries an informed line', typeof curve.informed === 'string' && curve.informed.length > 0);

  // "the next NPC informs you" → delivery sets the completes_when fact
  s.setFact(P, 'flag.saw_curve', true);
  const b2 = computeBoard(SB, s, P);
  ok('b-curve done after delivery', stat(b2, 'b-curve') === 'done');
  ok('board tier floor → revelation 2', tierFloors(b2).revelation_tier === 2);
  // and advance.js agrees — the revelation milestone fires
  const adv = checkAdvance(s, P);
  ok('advance.js bumps revelation 1→2', adv.some((a) => a.axis === 'revelation_tier' && a.to === 2) && s.getPlayerState(P).revelation_tier === 2);

  // the payoff is visible: the crowd's chatter deepens to the 'curve' phase
  const state = { narrative_tier: s.getPlayerState(P).narrative_tier, revelation_tier: 2, facts: s.getFacts(P), items: new Set() };
  ok('chatter shifts to the curve phase', activePhase(BANK, state) === 'curve'); }

console.log(`\n${fail ? '✗ FAIL' : '✓ PASS'} — ${pass} ok, ${fail} failed`);
process.exit(fail ? 1 : 0);

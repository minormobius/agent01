// board.selftest.mjs — pins the storyboard derivation kernel (hoop/v095/story/board.js).
//   node hoop/v095/test/board.selftest.mjs
// Proves the board is a pure function of world state: beat status (done/active/locked), the quest log,
// active markers, the unseal gate, and that tierFloors AGREES with advance.js (one source of truth).
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { MemoryStore, flattenPool, take } from '../story/engine.js';
import { checkAdvance } from '../story/advance.js';
import { computeBoard, questLog, activeBeats, activeMarkers, tierFloors, unsealed } from '../story/board.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const SB = JSON.parse(readFileSync(join(HERE, '../story/storyboard.json'), 'utf8'));
const POOL = JSON.parse(readFileSync(join(HERE, '../story/pool.json'), 'utf8'));
const content = flattenPool(POOL);
const store = () => new MemoryStore(content, { features: [] });

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) pass++; else { fail++; console.log('  ✗ ' + n); } };
const P = 'p';
const stat = (board, id) => (board.find((b) => b.id === id) || {}).status;

// 1. fresh — only the first beat is active; the rest locked
{ const s = store(), b = computeBoard(SB, s, P);
  ok('b1 active at start', stat(b, 'b1-wake') === 'active');
  ok('b2 locked at start', stat(b, 'b2-skeleton') === 'locked');
  ok('b3 locked at start', stat(b, 'b3-reason') === 'locked');
  ok('quest log shows only the active beat', questLog(b).length === 1 && questLog(b)[0].id === 'b1-wake');
  ok('active marker points at Olo', activeMarkers(b)[0] && activeMarkers(b)[0].anchor === 'olo');
  ok('not unsealed', !unsealed(b));
  ok('tier floor nar 1', tierFloors(b).narrative_tier === 1); }

// 2. met Olo → b1 done, b2 active
{ const s = store(); s.setFact(P, 'flag.met_olo', true); const b = computeBoard(SB, s, P);
  ok('b1 done after met_olo', stat(b, 'b1-wake') === 'done');
  ok('b2 active', stat(b, 'b2-skeleton') === 'active');
  ok('b3 still locked (no terminal, no notation)', stat(b, 'b3-reason') === 'locked');
  ok('log carries done + active', questLog(b).length === 2 && questLog(b)[0].status === 'done' && questLog(b)[1].status === 'active');
  ok('active marker now the terminal', activeMarkers(b)[0].terminal === true); }

// 3. read terminal + carry the notation (as the terminal grants it) → b2 done, b3 active
{ const s = store(); s.setFact(P, 'flag.met_olo', true); s.setFact(P, 'flag.read_terminal', true); take(s, P, 'it-stenciltrace');
  const b = computeBoard(SB, s, P);
  ok('b2 done after reading', stat(b, 'b2-skeleton') === 'done');
  ok('b3 active (notation held)', stat(b, 'b3-reason') === 'active');
  ok('b3 marker points at Sevin', activeMarkers(b)[0].anchor === 'sevin'); }

// 3b. read terminal but WITHOUT the notation item → b3 stays locked (the item gate is real)
{ const s = store(); s.setFact(P, 'flag.met_olo', true); s.setFact(P, 'flag.read_terminal', true);
  ok('b3 locked without the notation item', stat(computeBoard(SB, s, P), 'b3-reason') === 'locked'); }

// 4. Sevin believes → b3 done, unseals, narrative floor 2, b4 active
{ const s = store(); s.setFact(P, 'flag.met_olo', true); s.setFact(P, 'flag.read_terminal', true); take(s, P, 'it-stenciltrace'); s.setFact(P, 'flag.sevin_believes', true);
  const b = computeBoard(SB, s, P);
  ok('b3 done', stat(b, 'b3-reason') === 'done');
  ok('unsealed once the unseal beat is done', unsealed(b) === true);
  ok('tier floor advances to nar 2', tierFloors(b).narrative_tier === 2);
  ok('b4 (descent) now active', stat(b, 'b4-descent') === 'active');
  // AGREEMENT: the board's tier floor matches advance.js's milestone outcome (one source of truth)
  const adv = checkAdvance(s, P);
  ok('board tierFloor == advance.js result', adv.some((a) => a.axis === 'narrative_tier' && a.to === 2) && s.getPlayerState(P).narrative_tier === tierFloors(b).narrative_tier); }

// 5. every beat references a real act, and every requires.beats id exists (authoring integrity)
{ const ids = new Set(SB.beats.map((b) => b.id)), acts = new Set(SB.acts.map((a) => a.id));
  ok('every beat has a known act', SB.beats.every((b) => acts.has(b.act)));
  ok('every requires.beats id exists', SB.beats.every((b) => ((b.requires || {}).beats || []).every((p) => ids.has(p)))); }

console.log(`\n${fail ? '✗ FAIL' : '✓ PASS'} — ${pass} ok, ${fail} failed`);
process.exit(fail ? 1 : 0);

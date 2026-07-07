// casegen.selftest.mjs — the case kernel contract. Run: node tide/case/test/casegen.selftest.mjs
//
// Pins: determinism (same seed ⇒ same casebook), the solvability oracle (the planted clue
// list's deductive closure converges on exactly the culprit — never eliminating them), the
// chain (removed souls never reappear; survivors keep their names across cases), suspect-board
// floors, alibi honesty (only independent corroboration clears; the culprit is never
// corroborated), pacing (the board stays contested past the halfway clue), and coverage
// (every baked nave seed + econ towns sustain a 6-case chain).

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildGoss, buildGossNave } from '../../goss/gossip.js';
import { TICKS, scheduleFor, buildView, grievancesAgainst, generateCase, caseChain } from '../casegen.js';

const here = dirname(fileURLToPath(import.meta.url));
const loadNave = (seed) => JSON.parse(readFileSync(join(here, '..', '..', 'goss', 'data', `nave-${seed}.json`), 'utf8'));

let n = 0, failed = 0;
const check = (name, ok) => { n++; if (!ok) { failed++; console.error(`  ✗ ${name}`); } else console.log(`  ✓ ${name}`); };

const NAVE_SEEDS = [1, 2, 3, 5, 7, 11, 42, 99];
const G7 = buildGossNave(loadNave(7), { mode: 'floor' });

// ── determinism ───────────────────────────────────────────────────────────────────────────────
{
  const a = caseChain(G7, { cases: 3 }), b = caseChain(buildGossNave(loadNave(7), { mode: 'floor' }), { cases: 3 });
  check('same seed ⇒ identical casebook (3 cases, byte-for-byte)', JSON.stringify(a.cases) === JSON.stringify(b.cases));
  const v0 = buildView(G7, new Set());
  check('the empty-removal view reproduces the goss dramas exactly',
    JSON.stringify(v0.dramas) === JSON.stringify(G7.dramas));
  const p = v0.enriched.people[10];
  check('schedules are stable and six watches long', JSON.stringify(scheduleFor(p, v0.seed)) === JSON.stringify(scheduleFor(p, v0.seed)) && scheduleFor(p, v0.seed).length === TICKS.length);
  const home = scheduleFor(p, v0.seed);
  check('everyone sleeps at home (dawn + night watches are the dwelling)', home[0].place === p.home && home[5].place === p.home);
}

// ── the solvability oracle, across every baked seed + econ towns ─────────────────────────────
let chainsOK = true, solvableOK = true, culpritSafe = true, boardsOK = true, pacingOK = true,
  corrobOK = true, motiveOK = true, meansOK = true, chains = 0, cases = 0;
const substrates = [
  ...NAVE_SEEDS.map((s) => ({ tag: 'nave ' + s, G: buildGossNave(loadNave(s), { mode: 'floor' }) })),
  { tag: 'town 1', G: buildGoss({ seed: 1 }) },
  { tag: 'town 7', G: buildGoss({ seed: 7 }) },
];
for (const { tag, G } of substrates) {
  const book = caseChain(G, { cases: 6 });
  chains++;
  if (book.cases.length !== 6) { chainsOK = false; console.error(`    ${tag}: only ${book.cases.length}/6 cases`); }
  for (const c of book.cases) {
    cases++;
    // closure: replay eliminations cold; exactly the culprit must survive.
    const alive = new Set(c.suspects.map((s) => s.idx));
    for (const k of c.clues) for (const i of k.eliminates) alive.delete(i);
    if (alive.size !== 1 || !alive.has(c.truth.culprit)) solvableOK = false;
    // the culprit is never in any eliminates list.
    if (c.clues.some((k) => k.eliminates.includes(c.truth.culprit))) culpritSafe = false;
    // board: 3–7 suspects, victim not among them, every suspect has a motive.
    if (c.suspects.length < 3 || c.suspects.length > 7) boardsOK = false;
    if (c.suspects.some((s) => s.idx === c.victim.idx || !s.motives.length)) boardsOK = false;
    // alibi honesty: the culprit is never corroborated; corroborated ⇒ ≥1 independent witness.
    for (const s of c.suspects) {
      if (s.idx === c.truth.culprit && s.corroborated) corrobOK = false;
      if (s.corroborated && s.independent < 1) corrobOK = false;
    }
    // pacing: at the halfway clue the board is still contested (≥2 viable).
    const half = new Set(c.suspects.map((s) => s.idx));
    c.clues.slice(0, Math.floor(c.clues.length / 2)).forEach((k) => k.eliminates.forEach((i) => half.delete(i)));
    if (half.size < 2) pacingOK = false;
    // the promoted motive really is one of the culprit's grievances.
    const cs = c.suspects.find((s) => s.idx === c.truth.culprit);
    if (!cs || !cs.motives.some((m) => m.tag === c.truth.motive.tag)) motiveOK = false;
    // means: if the item is role-typed, the culprit has access.
    const role = { sedative: 'heal', spanner: 'mend', cable: 'make', ration: 'serve', desiccant: 'grow', 'weighing-bar': 'trade' };
    const typed = Object.keys(role).find((w) => c.truth.item.includes(w));
    if (typed && !cs.access.includes(role[typed])) meansOK = false;
  }
}
check(`every substrate sustains a 6-case chain (${chains} chains)`, chainsOK);
check(`solvability: closure converges on exactly the culprit (${cases} cases)`, solvableOK);
check('the culprit is never eliminated by a planted clue', culpritSafe);
check('boards are 3–7 suspects, victimless, every suspect motivated', boardsOK);
check('alibis: only independent corroboration clears; the culprit never clears', corrobOK);
check('pacing: the board is still contested at the halfway clue', pacingOK);
check('the promoted motive is really one of the culprit’s grievances', motiveOK);
check('the culprit can really reach the typed means', meansOK);

// ── the chain scars ───────────────────────────────────────────────────────────────────────────
{
  const book = caseChain(G7, { cases: 5 });
  const dead = new Set();
  let noReappear = true, distinct = true;
  for (const c of book.cases) {
    for (const s of c.suspects) if (dead.has(s.orig)) noReappear = false;
    if (dead.has(c.victim.orig)) distinct = false;
    dead.add(c.victim.orig); dead.add(c.truth.culpritOrig);
  }
  check('the dead and the taken never reappear on a later board', noReappear);
  check('every case has a fresh victim', distinct);
  check('each closed case removes exactly two souls', book.removed.size === book.cases.length * 2);
  // survivor identity is cast-once: the same orig soul keeps the same name in every view.
  const v0 = buildView(G7, new Set()), v5 = buildView(G7, book.removed);
  const nameOf0 = new Map(v0.enriched.people.map((p) => [p.orig, p.name]));
  let stable = true;
  for (const p of v5.enriched.people) if (nameOf0.get(p.orig) !== p.name) stable = false;
  check('survivors keep their names across the whole chain (cast-once demographics)', stable);
  check('the survivor view is exactly the town minus the dead', v5.enriched.people.length === v0.enriched.people.length - book.removed.size);
  const g = grievancesAgainst(v5, 0);
  check('grievances still read off the scarred web', g instanceof Map);
  // the town frays: vitality never rises as souls are removed... (it may hold steady)
  check('the scarred view still scores a vitality', typeof v5.vital.vitality === 'number' && v5.vital.tier.length > 0);
}

// ── clue narrative floor ──────────────────────────────────────────────────────────────────────
{
  const c = caseChain(G7, { cases: 1 }).cases[0];
  check('a case opens with the body and closes solved', c.clues[0].kind === 'body' && c.solvable === true);
  check('every clue carries prose (no empty text)', c.clues.every((k) => k.text.length > 20 && k.title.length > 2));
  check('clue kinds are the typed set', c.clues.every((k) => ['body', 'rumor', 'means', 'alibi', 'sighting', 'trace'].includes(k.kind)));
  check('the case names the scene and the watch', c.scene.name.length > 3 && c.tickLabel.length > 3);
}

console.log(`\ncasegen selftest: ${n - failed}/${n} passed${failed ? ' — FAILED' : ''}`);
if (failed) process.exit(1);

// loop-brief.selftest.mjs — the gate for memory selection.
//
// BELONGS AT scripts/loop-brief.selftest.mjs. It is here because the fleet
// cannot write scripts/ — loop-work.yml reverts the whole turn on a diff
// outside ^(\.github/loop/(outbox|work)/|plant/), and the commit step stages
// only config.writes, which does not include scripts/. See the header of
// plant/loop-brief.mjs for the two-command relocation.
//
// Living in plant/test/ has one real benefit while it waits: this file is swept
// by `for t in plant/test/*.selftest.mjs` in BOTH loop-work.yml (the whole
// suite must still pass) and deploy-plant.yml (the work product still passes),
// so it actually runs on every turn rather than sitting unexecuted.
//
// ─────────────────────────────────────────────────────────────────────────────
// WHAT THIS FILE HAS TO PROVE, AND THE TRAP IN EACH
//
// (a) THE BUDGET HOLDS at 500 synthetic findings. The trap is that a budget
//     assertion passes trivially if the budget was never in danger, so section 1
//     first asserts the NAIVE path — everything, which is what the brief does
//     today — really would have been half a megabyte. A cap that was never
//     approached is not evidence of a cap.
//
// (b) SELECTION DISCRIMINATES rather than truncating. The trap is that a
//     relevant item surviving proves nothing if it was near the front anyway:
//     a pure truncator would have kept it too. So the relevant finding is the
//     LAST of 508 items, and section 2 asserts explicitly that the first TOP_N
//     in ledger order do not contain it. Surviving from position 507 can only
//     be ranking.
//
// (c) EVERY DEAD-END SURVIVES regardless of score. The trap is that a dead-end
//     which happens to share words with the ticket would survive on score
//     alone, so the assertion would pass for an implementation with no
//     always-keep rule at all. So every dead-end here is written from a
//     deliberately disjoint vocabulary, scores EXACTLY zero, and section 3
//     re-runs those same six texts re-labelled as findings and asserts all six
//     are dropped. Same words, opposite outcome: the survival is caused by the
//     KIND and by nothing else.
//
// THE VOCABULARY DISCIPLINE THIS FILE DEPENDS ON. Two word families, and no
// word appears in both. The TICKET family (brief, memory, relevance, finding,
// verbatim, budget, byte, gate, loop, file, ...) belongs to the ticket, the
// relevant finding and the decoys. The GEOMETRY family (anisotropic, neighbour,
// radius, wrangler, atan2, flakes, ...) belongs to the dead-ends and to the one
// irrelevant finding. If you edit a fixture, keep the families apart — several
// assertions here are exact (score === 0) and rely on the disjointness, and an
// accidental "the" in a dead-end body would soften them silently.

import {
  TOP_N,
  FINDING_BUDGET_BYTES,
  tokenize,
  ticketTokens,
  isAlwaysKept,
  renderItem,
  scoreMemory,
  composeMemory,
  composeEverything,
} from '../loop-brief.mjs';

let passed = 0;
const failures = [];
function ok(cond, msg) {
  if (cond) passed++;
  else { failures.push(msg); console.error('FAIL: ' + msg); }
}

// ── fixtures ─────────────────────────────────────────────────────────────────

// The ticket. Its tokens, once, so a future reader can check the disjointness
// claim above without re-deriving it:
//   select brief memory relevance rather than everything the embeds every
//   finding verbatim choose findings whose text overlaps ticket keep dead ends
//   state byte budget file class creates gate regulation node scripts loop
//   selftest mjs
// Note there is deliberately no "and" here: the decoys use "and" heavily and
// keeping it out of the ticket keeps their score down to the four boilerplate
// terms, which is the realistic case.
const TICKET = {
  id: 'lp-000001',
  title: 'Select brief memory by relevance rather than by everything',
  body: 'The brief embeds every finding verbatim. Choose findings whose text '
    + 'overlaps a ticket, keep dead ends, state a byte budget in the file.',
  tags: ['class-a', 'creates-gate', 'regulation'],
  gate: ['node scripts/loop-brief.selftest.mjs'],
};

// Six dead-ends, GEOMETRY family only. Every one shares zero tokens with the
// ticket, so every one scores exactly zero.
const DEAD_ENDS = [
  ['de-000001', 'Anisotropic bisector normals rotate off axis',
    'Naive constellations place neighbours at unit directions times a common radius. Cells rotate 22 degrees.'],
  ['de-000002', 'Cube spacing hides a rotation error',
    'Axis aligned normals resist rotation, so cube looks perfect while other solids do not.'],
  ['de-000003', 'Acos reports noise for exact unit vectors',
    'Use atan2 of cross over dot. Accurate all way to zero.'],
  ['de-000004', 'Wrangler deploy cannot run without cloud credentials',
    'Deploy workflows are network. Push to branch that workflow recognises.'],
  ['de-000005', 'Seed constellations collide when radius shrinks',
    'Neighbours land inside refusal radius, so summon fights itself.'],
  ['de-000006', 'Timing residuals on single samples generate flakes',
    'Aggregate before you assert. Median absorbs pause; single sample does not.'],
].map(([id, title, body]) => ({ id, kind: 'dead-end', title, body, tags: [] }));

// GEOMETRY family. Shares nothing with the ticket, so it scores exactly zero
// and — being a finding rather than a dead-end — must be dropped.
const IRRELEVANT = {
  id: 'ff-000001',
  kind: 'finding',
  title: 'Icosahedron seed spacing under anisotropic metric',
  body: 'Neighbour spacing multiplies vertical separation by scaling constant. '
    + 'Naive constellations rotate off axis.',
  tags: [],
};

// TICKET family, and the only item carrying the rare terms. Placed LAST in the
// ledger on purpose: see trap (b).
const RELEVANT = {
  id: 'ff-000002',
  kind: 'finding',
  title: 'The brief hit a byte limit, so memory must be selected by relevance',
  body: 'The brief embeds every finding verbatim, so it grows without bound. '
    + 'Selecting findings whose text overlaps a ticket keeps memory small. '
    + 'State a byte budget in the file.',
  tags: [],
};

// 500 decoys. Each shares exactly four boilerplate terms with the ticket —
// loop, gate, brief, finding — which is what every real finding in this ledger
// shares, and precisely why raw overlap would rank them as noise. Each is about
// a kilobyte, so twenty-four of them fit inside the byte budget and TOP_N is
// what binds in section 1.
const FILLER = 'filler chatter about pipelines and runners. ';
const DECOYS = Array.from({ length: 500 }, (_, i) => ({
  id: 'dc-' + i.toString(16).padStart(6, '0'),
  kind: 'finding',
  title: 'Decoy ' + i + ' about a loop gate and a brief',
  body: 'Decoy finding about a loop gate and a brief. Filler token zq' + i + '. '
    + FILLER.repeat(22),
  tags: [],
}));

// Ledger order: dead-ends, the irrelevant finding, 500 decoys, and the relevant
// one dead last.
const LEDGER = [...DEAD_ENDS, IRRELEVANT, ...DECOYS, RELEVANT];

// ── 0. the primitives ────────────────────────────────────────────────────────

ok(JSON.stringify(tokenize('The loop-brief.mjs gate'))
  === JSON.stringify(['the', 'loop', 'brief', 'mjs', 'gate']),
'tokenize splits on punctuation, so a path in a ticket matches the same path in a finding');

ok(JSON.stringify(tokenize('a of in by')) === JSON.stringify([]),
  'tokens shorter than three characters are dropped before scoring');

ok(ticketTokens(TICKET).has('scripts') && ticketTokens(TICKET).has('regulation'),
  'the ticket vocabulary includes its gate command and its tags, not just title and body');

ok(isAlwaysKept({ kind: 'dead-end' }) === true, 'a dead-end is always kept');
ok(isAlwaysKept({ kind: 'decision', tags: ['answer'] }) === true,
  'an operator answer is always kept');
ok(isAlwaysKept({ kind: 'decision', tags: [] }) === false,
  'a decision that is not an operator answer is not in the always-kept set');
ok(isAlwaysKept({ kind: 'finding' }) === false, 'a finding is selected, not always kept');

ok(renderItem({ kind: 'dead-end', title: 'T', body: 'a\nb' }) === 'DEAD END: T\n  a\n  b\n\n',
  'renderItem reproduces the shape loop-work.yml already emits, indent and all');

// The mechanism, isolated: a term present in EVERY memory item carries no
// information and must weigh exactly zero. This is the whole reason IDF is here
// rather than raw overlap.
{
  const t = { title: 'brief' };
  const all3 = [
    { id: 'a-000001', kind: 'finding', title: 'brief widget', body: 'one' },
    { id: 'a-000002', kind: 'finding', title: 'brief widget', body: 'two' },
    { id: 'a-000003', kind: 'finding', title: 'brief widget', body: 'six' },
  ];
  const s3 = scoreMemory(all3, t);
  ok(s3.every((x) => x.score === 0),
    'a term in every item scores exactly zero: log(N/N) is 0, so boilerplate cannot rank');
  ok(composeMemory(all3, t).findings.length === 0,
    'and a finding whose only overlap is boilerplate is dropped, not used as filler');

  const plusOne = [...all3, { id: 'a-000004', kind: 'finding', title: 'widget', body: 'ten' }];
  const s4 = scoreMemory(plusOne, t);
  ok(s4.slice(0, 3).every((x) => x.score > 0) && s4[3].score === 0,
    'the same term becomes informative the moment one item lacks it — CONTROL for the above');
}

// ── 1. requirement (a): the budget holds at 500 findings ─────────────────────

const naive = composeEverything(LEDGER);
ok(Buffer.byteLength(naive) > 300000,
  'CONTROL: the naive brief really is the problem — everything, unselected, is over 300 KB. '
  + 'Without this the budget assertion below could pass on a corpus that never threatened it.');

const m = composeMemory(LEDGER, TICKET);

ok(m.findingBytes <= FINDING_BUDGET_BYTES,
  'the selected half stays inside FINDING_BUDGET_BYTES (' + FINDING_BUDGET_BYTES + '), got ' + m.findingBytes);
ok(m.findings.length <= TOP_N, 'the selected half stays inside TOP_N (' + TOP_N + ')');
ok(m.findings.length === TOP_N,
  'with 501 scoring candidates of about a kilobyte each, TOP_N is what binds, not the bytes '
  + '(if this fails, check the decoys still share a token with the ticket at all)');
ok(m.totalBytes === Buffer.byteLength(m.text), 'totalBytes describes the text it returned');
ok(m.totalBytes === m.findingBytes + m.alwaysKeptBytes,
  'the two halves account for the whole memory section and nothing else');
ok(m.totalBytes < Buffer.byteLength(naive) / 10,
  'selection is worth doing: the composed memory is under a tenth of the naive one');

const twice = composeMemory(LEDGER, TICKET);
ok(twice.text === m.text,
  'selection is deterministic — same ledger, same ticket, byte-identical memory');

// ── 2. requirement (b): it discriminates, it does not truncate ───────────────

const keptIds = new Set(m.findings.map((b) => b.id));

ok(keptIds.has(RELEVANT.id),
  'the finding whose rare terms overlap the ticket survives selection');
ok(!keptIds.has(IRRELEVANT.id),
  'the finding that shares no term with the ticket does not');
ok(!m.text.includes(IRRELEVANT.title),
  'and it is absent from the rendered text, not merely absent from the list');
ok(m.text.includes(RELEVANT.title), 'while the relevant one is present in the rendered text');

ok(m.scoreOf.get(IRRELEVANT.id) === 0,
  'the irrelevant finding scores EXACTLY zero — it shares no token at all, so this is not a '
  + 'near miss that a threshold tweak would flip');
ok(m.scoreOf.get(RELEVANT.id) > m.scoreOf.get(DECOYS[0].id) * 100,
  'and the relevant one outscores a boilerplate decoy by two orders of magnitude, because its '
  + 'overlap is in terms that appear once in the corpus rather than in five hundred items');

ok(m.findings[0].id === RELEVANT.id, 'it is ranked first, not merely included');

// THE TRUNCATION CONTROL. The relevant finding is the last of 508 items, so a
// pure truncator — keep the first TOP_N, drop the rest, which is the obvious
// wrong implementation of this ticket — could not have kept it.
const truncatorWouldKeep = LEDGER.slice(0, TOP_N).map((b) => b.id);
ok(!truncatorWouldKeep.includes(RELEVANT.id),
  'CONTROL: the relevant finding sits at ledger position ' + (LEDGER.length - 1) + ' of '
  + LEDGER.length + ', so a first-N truncator would have dropped it. Surviving is ranking.');
ok(m.dropped.length === 501 - TOP_N + 1,
  'everything that did not fit is reported as dropped rather than silently vanishing '
  + '(501 scoring candidates minus TOP_N kept, plus the one zero-scoring finding)');

// ── 3. requirement (c): every dead-end survives, whatever it scores ──────────

for (const de of DEAD_ENDS) {
  ok(m.scoreOf.get(de.id) === 0,
    'dead-end ' + de.id + ' scores exactly zero against this ticket — which is the point: it is '
    + 'kept in spite of the score, not because of it');
  ok(m.deadEnds.some((b) => b.id === de.id) && m.text.includes(de.title),
    'DEAD-END ' + de.id + ' SURVIVES REGARDLESS OF SCORE. The asymmetry is deliberate and it is '
    + 'not a tuning choice: a finding is a thing that WORKED and losing one costs context, while '
    + 'a dead-end is a thing that DOES NOT WORK and losing one costs a whole turn walking back '
    + 'into it. Relevance cannot be scored here either, because the agent about to repeat the '
    + 'mistake does not have the wall in its ticket text — that is exactly why it is about to '
    + 'walk into it. So dead-ends are exempt from both the score and the byte budget.');
}

ok(m.deadEnds.length === DEAD_ENDS.length, 'all six, not a sample');
ok(m.text.indexOf('DEAD END:') < m.text.indexOf('FINDING:'),
  'and they are rendered first, so a turn reads what does not work before what does');

// THE KIND-NOT-SCORE CONTROL. Same six texts, relabelled as findings. If the
// survival above came from anything other than the always-keep rule — a
// coincidental word, a generous threshold, a byte budget that never binds —
// these six would survive too.
{
  const asFindings = DEAD_ENDS.map((b) => ({ ...b, kind: 'finding' }));
  const c = composeMemory(asFindings, TICKET);
  ok(c.findings.length === 0 && c.dropped.length === 6 && c.text === '',
    'CONTROL: the same six bodies, relabelled `finding`, are ALL dropped. Same words, opposite '
    + 'outcome — so the survival above is caused by the kind and by nothing else.');
}

// Operator answers ride the same exemption, and for a stronger reason: they are
// the only facts in a brief that no amount of further looping could reproduce.
{
  const answer = {
    id: 'an-000001',
    kind: 'decision',
    tags: ['answer'],
    title: 'Neighbours should shrink before refusal',
    body: 'Radius shrinks first, so summon fights nothing.',
  };
  const c = composeMemory([...DEAD_ENDS, answer, IRRELEVANT], TICKET);
  ok(c.answers.length === 1 && c.text.includes('THE OPERATOR ANSWERED: ' + answer.title),
    'an operator answer with zero overlap survives too — it came from outside the loop, so it '
    + 'is the one thing more turns could never regenerate');
  ok(c.findings.length === 0, 'while the zero-scoring finding beside it is still dropped');
}

// ── 4. the byte budget binds on its own, independently of TOP_N ─────────────
// Section 1 proves TOP_N binds when items are small. This proves the other
// limit is real: sixty findings of roughly 4.5 KB each, all scoring, so the
// count cap cannot be what stops it.
{
  const BIG = 'brief memory relevance budget verbatim findings overlaps ticket state file ';
  const big = Array.from({ length: 60 }, (_, i) => ({
    id: 'bg-' + i.toString(16).padStart(6, '0'),
    kind: 'finding',
    title: 'Big finding ' + i,
    body: BIG.repeat(60),
    tags: [],
  }));
  // The six dead-ends are in this fixture for a reason beyond realism: without
  // an item that LACKS the shared terms, df would equal N, every idf would be
  // zero, and all sixty would score zero and be dropped for the wrong reason.
  const c = composeMemory([...big, ...DEAD_ENDS], TICKET);
  ok(c.findings.length >= 1, 'the big findings do score, so this fixture tests what it claims');
  ok(c.findings.length < TOP_N,
    'fewer than TOP_N survive, so the BYTE budget is what stopped it — the two caps are '
    + 'independent and both are live');
  ok(c.findingBytes <= FINDING_BUDGET_BYTES,
    'and the byte budget is respected exactly, got ' + c.findingBytes);
  ok(c.deadEnds.length === 6,
    'the always-kept half is unaffected by a byte budget the selected half exhausted');
}

// ── report ───────────────────────────────────────────────────────────────────

if (failures.length) {
  console.error('\nloop-brief.selftest: ' + failures.length + ' FAILED, ' + passed + ' passed');
  process.exit(1);
}
console.log('loop-brief.selftest: ' + passed + ' checks passed');

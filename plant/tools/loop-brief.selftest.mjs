// loop-brief.selftest.mjs — the gate for lp-14c7f5.
//
// Run: node plant/tools/loop-brief.selftest.mjs
//      (at its home: node scripts/loop-brief.selftest.mjs)
//
// ╔══════════════════════════════════════════════════════════════════════════╗
// ║ PARKED. Its home is `scripts/loop-brief.selftest.mjs`, which is what the ║
// ║ ticket's GATE names. loop-work.yml's containment gate allows only        ║
// ║ `.github/loop/{outbox,work}/` and `plant/`, and a diff outside that is   ║
// ║ `git checkout -- . && git clean -fd` — the whole turn destroyed, outbox  ║
// ║ included. Moving it home is TWO `git mv` AND NOTHING ELSE:               ║
// ║                                                                          ║
// ║   git mv plant/tools/loop-brief.mjs          scripts/loop-brief.mjs      ║
// ║   git mv plant/tools/loop-brief.selftest.mjs scripts/loop-brief.selftest.mjs
// ║                                                                          ║
// ║ The import below is './loop-brief.mjs' and the module imports nothing,   ║
// ║ so both files are location-independent as long as they move together.   ║
// ║                                                                          ║
// ║ It is in `plant/tools/` and NOT `plant/test/` deliberately. Everything   ║
// ║ matching `plant/test/*.selftest.mjs` is run by loop-work's whole-suite   ║
// ║ check on every gate-creating turn and by deploy-plant before it          ║
// ║ publishes. This file is loop infrastructure, not plant; a bug in it      ║
// ║ would fail turns and block deploys that have nothing to do with it, and  ║
// ║ three consecutive gate failures halt the fleet with nobody watching.     ║
// ║ Being unrun is the smaller harm. See the outbox for lp-14c7f5.          ║
// ╚══════════════════════════════════════════════════════════════════════════╝
//
// ────────────────────────────────────────────────────── what has to be proven
//
// The mechanism under test decides WHAT A TURN IS TOLD. If it is wrong it is
// wrong invisibly — a turn reads a shorter brief and simply performs worse, with
// nothing red anywhere. So the three claims are pinned separately, and each has
// a CONTROL, because an assertion that cannot fail is indistinguishable from one
// that passes:
//
//   §6  BUDGET (a)   the composed memory fits a stated byte budget with 500
//                    synthetic findings in the ledger.
//       CONTROL      the UNSELECTED composition — what the workflows do today —
//                    blows the same budget by ~12x. Without that, §6 passes for
//                    a composer that returns "" and would pass forever.
//
//   §3  DISCRIMINATION (b)  an overlapping finding survives and an unrelated one
//                    does not — WITH ROOM TO SPARE UNDER THE CAP, so what is
//                    demonstrated is selection and not truncation.
//       CONTROL      the unrelated finding scores exactly 0, and the cap (24) is
//                    larger than the candidate count (2). If the cap were doing
//                    the work, the section would say nothing about relevance.
//   §5  and under real pressure (502 candidates) a high-scoring OLD finding is
//                    kept while a low-scoring NEW one is dropped — so score, not
//                    recency, is what is being measured.
//
//   §7  DEAD-ENDS (c)  every dead-end survives regardless of score.
//       CONTROL      every dead-end in the fixture scores EXACTLY 0. Without
//                    that, "the dead-ends survived" might only mean they
//                    happened to be relevant, and the exemption goes untested.
//
//   §10 THE CLIP KEEPS THE MORAL. A clipped body must retain its LAST sentence,
//                    not just its first — these findings put what transfers at
//                    the end.
//       CONTROL      the same fixture's last sentence is asserted to be ABSENT
//                    from the first `maxChars` characters of the source, so a
//                    head-clip provably could NOT have kept it. Without that the
//                    section passes for the head-clip it replaced.
//
//   §11 NO TICKET IS NOT A SCORE OF ZERO. With `{}` — what the plan and review
//                    seats pass — the most recent findings are kept rather than
//                    none, or those seats read an empty findings section.
//       CONTROL      A PAIR OF RUNS OVER ONE LEDGER differing in ONE thing: the
//                    newest finding is DROPPED with a ticket (score beats age)
//                    and KEPT without one (age is all there is). Neither run
//                    alone says anything; the pair pins the rule from both sides.
//       CONTROL      a ticket that HAS terms but matches nothing still selects
//                    nothing — the fallback triggers on "nothing to measure
//                    against", never on "measured and found irrelevant".
//
//   §12 OPERATOR ANSWERS ARE EXEMPT, AND ORDINARY DECISIONS ARE NOT. The
//                    exemption reads the `answer` TAG, not the `decision` kind.
//       CONTROL      a `decision` tagged `['learned']` — which is exactly what
//                    loop-apply-outbox.mjs writes for every agent-filed decision,
//                    one or more per turn, forever — must appear NOWHERE. Without
//                    it, "answers survive" passes for an implementation that
//                    exempts the kind, which would put every decision ever
//                    recorded into every brief and blow the budget §6 defends.
//
//   §13 THE DEAD-END HALF IS UNBOUNDED, AND HERE IS WHAT THAT COSTS. The module
//                    says so in prose; this measures it. Dead-ends are exempt by
//                    COUNT (each body is clipped, so each costs a bounded amount,
//                    but nothing caps how many there are), so the budget has a
//                    finite dead-end capacity and nothing anywhere states it.
//       CONTROL      the budget must be REACHABLE by dead-ends alone. If that
//                    assertion ever fails, either the pool got too small or
//                    something began bounding the exempt half by count — and
//                    bounding it silently is the one outcome §7 exists to forbid.
//
// §1-2 pin the tokenizer and the weighting, because every number above is
// meaningless if those drift. §8 pins the no-silent-caps footer. §9 pins
// determinism and the degenerate inputs the plan/review seats will pass.
//
// Every fixture in this file is pure ASCII, so byte length equals character
// length and the budget arithmetic can be checked by hand.

import {
  MAX_FINDINGS, MIN_SCORE, FIELD_WEIGHT, MEMORY_BUDGET_BYTES,
  RECENCY_FALLBACK, CLIP_HEAD_FRACTION, MIN_MIDDLE_CLIP_CHARS, FINDING_BODY_CHARS,
  tokens, ticketTerms, scoreBead, selectMemory, composeMemory, composeAll,
  memoryFooter, byteLength, clip,
} from './loop-brief.mjs';

let checks = 0;
let failures = 0;
function ok(cond, msg) {
  checks++;
  if (!cond) { failures++; console.error(`  FAIL: ${msg}`); }
}
function section(t) { console.log(`\n── ${t}`); }

// ───────────────────────────────────────────────────────────────── the ticket
//
// A SHORT, CONTROLLED ticket rather than the real lp-14c7f5 body. The whole file
// turns on knowing exactly which words the ticket contributes, and a 2000-char
// real body makes "these two texts share no significant token" unverifiable by
// hand — which would make §3's control an article of faith.

const TICKET = {
  id: 'lp-000001',
  title: 'Select brief memory by relevance instead of embedding everything',
  body: 'The composed brief embeds every finding verbatim. Score the overlap '
      + 'between a finding and the ticket, keep the top N, and always keep dead-ends.',
  tags: ['class-a', 'creates-gate', 'regulation'],
  gate: ['node scripts/loop-brief.selftest.mjs'],
};

// The full term set TICKET contributes, worked out by hand from the rule in
// loop-brief.mjs (>= 4 chars, not a stopword, plus path/hyphen segments):
//
//   title (w3) select brief memory relevance embedding everything
//   tags  (w2) class-a class creates-gate creates gate regulation
//   gate  (w2) node scripts/loop-brief.selftest.mjs scripts loop brief selftest
//   body  (w1) composed brief embeds finding verbatim score overlap ticket
//              keep dead-ends dead ends
//
// Nothing else. Every "shares no token with the ticket" claim below was checked
// against exactly this list.

// ═════════════════════════════════════════════════════ §1 the tokenizer itself
section('1. tokenisation — the thing every later assertion rests on');
{
  const t = tokens('The brief grows without bound');
  ok(t.has('brief'), 'tokens() keeps "brief"');
  ok(t.has('grows'), 'tokens() keeps "grows"');
  ok(t.has('bound'), 'tokens() keeps "bound"');
  ok(!t.has('the'), 'tokens() drops "the" — under the 4-char floor');
  ok(!t.has('without'), 'tokens() drops "without" — a stopword');

  // Paths survive WHOLE and are ALSO segmented. Both halves matter: the whole
  // string is the highest-signal match there is, and the segments are what let a
  // gate naming scripts/loop-brief.mjs match a finding that says "the brief".
  const g = tokens('node scripts/loop-brief.selftest.mjs');
  ok(g.has('scripts/loop-brief.selftest.mjs'), 'a path survives as one token');
  ok(g.has('scripts') && g.has('loop') && g.has('brief') && g.has('selftest'),
    'a path is ALSO split into its segments');
  ok(!g.has('mjs'), '"mjs" is under the 4-char floor and does not become a term');
  ok(g.has('node'), '"node" is NOT a stopword here — it is a term of art in this repo');
}

section('2. ticket terms take the HIGHEST field weight, never the sum');
{
  const terms = ticketTerms(TICKET);
  ok(terms.get('brief') === FIELD_WEIGHT.title,
    `"brief" is in the title, the tags-adjacent gate and the body; it must weigh `
    + `${FIELD_WEIGHT.title} (the highest field), not the sum — a word is not more `
    + `relevant for being repeated, and summing lets a long body outvote a title. `
    + `got ${terms.get('brief')}`);
  ok(terms.get('regulation') === FIELD_WEIGHT.tags,
    `"regulation" appears only as a tag, so it weighs ${FIELD_WEIGHT.tags}; got ${terms.get('regulation')}`);
  ok(terms.get('scripts') === FIELD_WEIGHT.gate,
    `"scripts" comes only from the gate command, so it weighs ${FIELD_WEIGHT.gate}; got ${terms.get('scripts')}`);
  ok(terms.get('verbatim') === FIELD_WEIGHT.body,
    `"verbatim" appears only in the body, so it weighs ${FIELD_WEIGHT.body}; got ${terms.get('verbatim')}`);
  ok(!terms.has('instead'), '"instead" is a stopword and must not become a ticket term');
  ok(!terms.has('selection'),
    'THE STATED LIMITATION, pinned so nobody assumes otherwise: there is no '
    + 'stemming. The ticket says "Select"; "selection" is a different token and '
    + 'does not match. If this ever starts passing, someone added stemming and '
    + 'the scores in this file need re-deriving.');
}

// ══════════════════════════════════════ §3 DISCRIMINATION, WITH ROOM TO SPARE
//
// Requirement (b). The point is that the unrelated finding is dropped WHILE
// THERE IS SPACE FOR IT. Two candidates against a cap of 24 — truncation cannot
// explain the outcome, only relevance can.

const RELEVANT = {
  id: 'lp-00aa01', kind: 'finding', tags: [], created: '2026-01-01T00:00:00.000Z',
  title: 'The composed brief embeds every finding verbatim and grows without bound',
  body: 'Memory selection by relevance would keep the brief small; dead-ends must '
      + 'always survive regardless of score.',
};

// Vocabulary chosen to be DISJOINT from TICKET's term list above, checked word by
// word: icosahedron radius clears anisotropic wide margins inversion algebra
// gives closed-form closed form neighbour distances dodecahedron octahedron
// clear comfortably. None is a ticket term.
const UNRELATED = {
  id: 'lp-00bb02', kind: 'finding', tags: [], created: '2026-01-02T00:00:00.000Z',
  title: 'Icosahedron radius clears the anisotropic gap by wide margins',
  body: 'Inversion algebra gives closed-form neighbour distances; dodecahedron and '
      + 'octahedron clear comfortably.',
};

section('3. selection DISCRIMINATES — it is not truncation wearing a rule');
{
  const sel = selectMemory([RELEVANT, UNRELATED], TICKET);
  const kept = new Set(sel.findings.map((b) => b.id));
  const terms = ticketTerms(TICKET);
  const sRel = scoreBead(RELEVANT, terms);
  const sUn = scoreBead(UNRELATED, terms);

  console.log(`   scores: relevant=${sRel} unrelated=${sUn} (cap=${MAX_FINDINGS}, candidates=2)`);

  ok(MAX_FINDINGS > 2,
    'CONTROL: the cap must exceed the candidate count, or this whole section is '
    + 'a test of truncation and says nothing about relevance');
  ok(sUn === 0,
    'CONTROL: the unrelated finding must score EXACTLY 0 — its vocabulary was '
    + 'chosen disjoint from the ticket by hand. A non-zero score here means the '
    + 'stopword list or the tokenizer changed and this fixture is no longer a control. '
    + `got ${sUn}`);
  ok(sRel > 0, `the overlapping finding must score above zero; got ${sRel}`);
  ok(sRel > sUn, 'the overlapping finding must outscore the unrelated one');
  ok(kept.has(RELEVANT.id),
    'a finding whose text overlaps the ticket must SURVIVE selection');
  ok(!kept.has(UNRELATED.id),
    'an unrelated finding must NOT survive, even though there was room for it. '
    + 'This is the whole claim: room is not a reason. An irrelevant finding costs '
    + 'the turn context and teaches it nothing.');
  ok(sel.keptFindings === 1 && sel.droppedFindings === 1,
    `exactly one kept and one dropped; got ${sel.keptFindings}/${sel.droppedFindings}`);
  ok(MIN_SCORE >= 1,
    'MIN_SCORE is what makes the above possible: at 0 every zero-overlap finding '
    + 'would be included whenever the cap left room');
}

// ══════════════════════════════════════════════════════ the 500-finding ledger

// A pool with NO overlap against TICKET's term list — checked word by word, and
// note that no ticket term is a prefix of any of these either, so the slice that
// trims filler to an exact length cannot accidentally manufacture a match.
const DISJOINT = [
  'pocket', 'lattice', 'voronoi', 'seed', 'anisotropic', 'icosahedron', 'clamp',
  'hull', 'membrane', 'basin', 'chamber', 'ramp', 'jitter', 'octahedron',
  'dodecahedron', 'tetrahedron', 'neighbour', 'inversion', 'radius', 'normals',
  'watertight', 'navigation', 'floor', 'ceiling', 'stitch', 'euler',
];

/** Deterministic PRNG. A gate that shuffles differently per run is a gate that
 *  fails differently per run, and that is how a suite gets ignored. */
function lcg(seed) {
  let s = seed >>> 0;
  return () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296;
}

function filler(rand, chars) {
  const parts = [];
  let len = 0;
  let sinceNewline = 0;
  while (len < chars) {
    const w = DISJOINT[Math.floor(rand() * DISJOINT.length)];
    parts.push(w);
    len += w.length + 1;
    sinceNewline += w.length + 1;
    if (sinceNewline > 68) { parts.push('\n'); sinceNewline = 0; }
  }
  return parts.join(' ').slice(0, chars);
}

const DEAD_ENDS = 12;
const NOISE = 500;

/** Built by a function, and built twice, so §9 can assert determinism against a
 *  genuinely separate construction rather than against the same object. */
function buildLedger() {
  const rand = lcg(20260805);
  const out = [];

  // Dead-ends. Disjoint vocabulary ON PURPOSE: the exemption is only tested if
  // they score zero, otherwise "they survived" might just mean "they were
  // relevant" and the asymmetry is never exercised.
  for (let i = 0; i < DEAD_ENDS; i++) {
    out.push({
      id: `lp-00de${String(i).padStart(2, '0')}`,
      kind: 'dead-end',
      tags: [],
      created: `2026-02-${String(i + 1).padStart(2, '0')}T00:00:00.000Z`,
      title: `Pocket seed ${i} clamps silently rather than refusing`,
      body: filler(rand, 5000),
    });
  }

  // 500 findings that all clear MIN_SCORE, so the CAP is what binds in §5 —
  // not the threshold. Each carries three ticket terms and nothing else.
  for (let i = 0; i < NOISE; i++) {
    out.push({
      id: `lp-01${String(i).padStart(4, '0')}`,
      kind: 'finding',
      tags: [],
      created: `2026-03-01T00:00:${String(i % 60).padStart(2, '0')}.${String(i).padStart(3, '0')}Z`,
      title: `Lattice rebuild ${i} keeps the chamber floor watertight`,
      body: `brief memory relevance selection ${filler(rand, 3000)}`,
    });
  }

  // THE STAR: maximally on-topic and the OLDEST thing in the ledger. Recency
  // alone would throw it away; only score can save it.
  out.push({
    id: 'lp-00star',
    kind: 'finding',
    tags: [],
    created: '2020-01-01T00:00:00.000Z',
    title: 'The composed brief embeds every finding verbatim - memory relevance and score overlap',
    body: `brief memory relevance ${filler(rand, 3000)}`,
  });

  // THE WEAK: barely over the threshold and the NEWEST thing in the ledger.
  // Recency alone would keep it; score must drop it.
  out.push({
    id: 'lp-00weak',
    kind: 'finding',
    tags: [],
    created: '2099-01-01T00:00:00.000Z',
    title: 'Ramp seeds and the basin floor',
    body: 'The lattice must keep its basin.',
  });

  return out;
}

// STAR uses 'lp-00star' and WEAK 'lp-00weak' — deliberately not matching the
// ledger's <xx>-<6hex> id shape, because these never go near a real ledger and a
// reader scanning the fixture should be able to see which is which.
const LEDGER = buildLedger();

section('4. the fixture is what it claims to be');
{
  ok(LEDGER.filter((b) => b.kind === 'dead-end').length === DEAD_ENDS,
    `${DEAD_ENDS} dead-ends in the fixture`);
  ok(LEDGER.filter((b) => b.kind === 'finding').length === NOISE + 2,
    `${NOISE + 2} findings in the fixture (500 noise + star + weak)`);
  const nonAscii = LEDGER.filter((b) => /[^\x00-\x7F]/.test(`${b.title}${b.body}`));
  ok(nonAscii.length === 0,
    'the whole fixture must be ASCII, or byte length stops equalling character '
    + `length and the budget arithmetic below cannot be checked by hand; ${nonAscii.length} were not`);
}

// ══════════════════════════════════ §5 THE CAP BINDS, AND SCORE BEATS RECENCY
section('5. under pressure the cap binds, and it binds on SCORE not on age');
{
  const sel = selectMemory(LEDGER, TICKET);
  const kept = new Set(sel.findings.map((b) => b.id));
  const noiseScore = sel.scores.get('lp-010000');
  const starScore = sel.scores.get('lp-00star');
  const weakScore = sel.scores.get('lp-00weak');

  console.log(`   considered=${sel.consideredFindings} kept=${sel.keptFindings} `
    + `dropped=${sel.droppedFindings}  scores: star=${starScore} noise=${noiseScore} weak=${weakScore}`);

  ok(sel.consideredFindings === NOISE + 2,
    `all ${NOISE + 2} findings were considered; got ${sel.consideredFindings}`);
  ok(sel.keptFindings === MAX_FINDINGS,
    `exactly N=${MAX_FINDINGS} findings survive when far more clear the threshold; `
    + `got ${sel.keptFindings}`);
  ok(sel.droppedFindings === NOISE + 2 - MAX_FINDINGS,
    'the dropped count is reported and is the complement of the kept count — a '
    + 'mechanism that bounds what a turn is told and does not say so reads as '
    + '"we remembered everything"');

  ok(starScore > noiseScore,
    `the maximally on-topic finding must outscore the merely-touching ones; `
    + `got star=${starScore} noise=${noiseScore}`);
  ok(kept.has('lp-00star'),
    'THE OLDEST finding in the ledger is kept because it scores highest. This is '
    + 'the assertion that separates relevance from recency: truncating by age '
    + 'would have discarded it first, and the oldest findings are exactly the ones '
    + 'that cost the most to learn.');

  ok(weakScore >= MIN_SCORE,
    `CONTROL: the weak finding must CLEAR the threshold (${weakScore} >= ${MIN_SCORE}), `
    + 'otherwise it is dropped by the threshold and says nothing about ranking');
  ok(weakScore < noiseScore,
    `and must still rank below the noise; got weak=${weakScore} noise=${noiseScore}`);
  ok(!kept.has('lp-00weak'),
    'THE NEWEST finding in the ledger is dropped despite clearing the threshold, '
    + 'because 24 others scored higher. Score outranks recency in both directions.');
}

// ═══════════════════════════════════════════════════════════ §6 BUDGET (a)
section('6. the composed memory fits the stated byte budget — and the budget is reachable');
{
  const sel = selectMemory(LEDGER, TICKET);
  const composed = composeMemory(sel, LEDGER.length);
  const selected = byteLength(composed);
  const naive = byteLength(composeAll(LEDGER));

  console.log(`   selected=${selected} bytes   naive=${naive} bytes   budget=${MEMORY_BUDGET_BYTES} bytes`);
  console.log(`   ratio: the unselected memory is ${(naive / selected).toFixed(1)}x the selected one`);

  ok(naive > MEMORY_BUDGET_BYTES,
    'CONTROL, AND IT IS THE LOAD-BEARING HALF: the CURRENT behaviour — every '
    + 'finding and dead-end verbatim — must blow this budget on this fixture. '
    + 'Without it, the assertion below passes for a composer that returns the '
    + `empty string, and would keep passing forever. naive=${naive} budget=${MEMORY_BUDGET_BYTES}`);
  ok(selected < MEMORY_BUDGET_BYTES,
    `the SELECTED memory must fit the stated budget with ${NOISE} synthetic findings `
    + `in the ledger; got ${selected} against ${MEMORY_BUDGET_BYTES}`);
  ok(selected > 0, 'and it must not be empty — an empty brief fits every budget');

  // The budget is a ceiling with headroom, not a fit. If the real composition
  // ever creeps to within a fifth of it, the constants want revisiting before
  // the ceiling is hit rather than after.
  ok(selected < MEMORY_BUDGET_BYTES * 0.8,
    `and it must fit with at least 20% headroom, so an unusually long finding `
    + `cannot tip it over; got ${selected} against ${MEMORY_BUDGET_BYTES * 0.8}`);

  // Clipping must be a POINTER, not silent data loss.
  ok(composed.includes('full text in .github/loop/beads.jsonl'),
    'every clipped body says where the full text is — a clip that does not tell '
    + 'the reader it happened is indistinguishable from a finding that was short');
}

// ══════════════════════════════════════ §7 DEAD-ENDS ARE EXEMPT (requirement c)
section('7. EVERY dead-end survives, regardless of score');
{
  const terms = ticketTerms(TICKET);
  const deadEnds = LEDGER.filter((b) => b.kind === 'dead-end');
  const scores = deadEnds.map((b) => scoreBead(b, terms));

  ok(scores.every((s) => s === 0),
    'CONTROL, AND WITHOUT IT THIS SECTION PROVES NOTHING: every dead-end in the '
    + 'fixture must score EXACTLY 0. If they scored well they would survive on '
    + 'relevance alone and the exemption would never be exercised — the test '
    + `would pass for an implementation that has no exemption at all. got [${scores.join(',')}]`);

  const sel = selectMemory(LEDGER, TICKET);
  const keptDead = new Set(sel.deadEnds.map((b) => b.id));
  for (const b of deadEnds) {
    ok(keptDead.has(b.id),
      `dead-end ${b.id} scored 0 and MUST still be kept. THE ASYMMETRY, because `
      + 'it must never be quietly tuned away: a finding is a thing that IS true, '
      + 'and dropping a relevant one costs a turn re-deriving it - annoying, '
      + 'bounded, forward progress continues. A dead-end is a thing that DOES NOT '
      + 'WORK, and dropping one costs a turn re-attempting a known failure and '
      + 'possibly publishing the wrong conclusion - which is the exact incident '
      + 'this memory was built to prevent (several turns spent writing an OBJ '
      + 'parser around a fetch failure the harness had already hit and not '
      + 'recorded). The two mistakes are not the same size, so they do not get '
      + 'the same treatment. Relevance scoring is a heuristic; it is allowed to '
      + 'be wrong about a finding and it is not allowed to be wrong about a dead-end.');
  }
  ok(sel.deadEnds.length === DEAD_ENDS,
    `all ${DEAD_ENDS} dead-ends are present, not a subset; got ${sel.deadEnds.length}`);

  const composed = composeMemory(sel, LEDGER.length);
  const missing = deadEnds.filter((b) => !composed.includes(b.title));
  ok(missing.length === 0,
    'and they must actually reach the composed text, not merely the selection '
    + `object the composer might ignore; ${missing.length} titles were absent`);

  // The strongest form: starve the mechanism completely and they still survive.
  const starved = selectMemory(LEDGER, TICKET, { maxFindings: 0, minScore: 1e9 });
  ok(starved.findings.length === 0, 'with the cap at 0 no finding survives');
  ok(starved.deadEnds.length === DEAD_ENDS,
    'but ALL dead-ends still do. The exemption is not "they usually rank high", '
    + 'it is unconditional, and it must hold at the setting where every other '
    + 'kind of memory has been squeezed to nothing.');
}

section('8. the brief says what it dropped — no silent caps');
{
  const sel = selectMemory(LEDGER, TICKET);
  const footer = memoryFooter(sel, LEDGER.length);
  ok(footer.includes('SELECTED, NOT TRUNCATED'),
    'the footer states the mechanism, so a turn reading a short brief knows the '
    + 'difference between "there is little to know" and "most of it was judged '
    + 'irrelevant" — only the second is something it can act on');
  ok(footer.includes(String(sel.droppedFindings)), 'the footer states the dropped count');
  ok(footer.includes(String(sel.consideredFindings)), 'the footer states how many were considered');
  ok(footer.includes('UNCONDITIONALLY'),
    'and it states the dead-end exemption, so the reason travels with the brief '
    + 'rather than living only in this file');
  ok(footer.includes('beads.jsonl'),
    'and it points at where the full text is, which is what makes clipping honest');
}

section('9. determinism and degenerate input');
{
  const a = composeMemory(selectMemory(buildLedger(), TICKET), LEDGER.length);
  const b = composeMemory(selectMemory(buildLedger(), TICKET), LEDGER.length);
  ok(a === b,
    'the same ledger and the same ticket compose byte-identically. A brief that '
    + 'varies run to run makes every downstream comparison — a rerun, a bisect, '
    + 'a judge reading two turns — meaningless.');

  // An empty ticket yields no terms. §11 pins what happens then; here we only
  // pin that it does not crash and still carries the exemptions.
  const empty = selectMemory(LEDGER, {});
  ok(empty.deadEnds.length === DEAD_ENDS,
    'an empty ticket still carries every dead-end — the exemption does not depend '
    + 'on which selection rule ran');
  ok(typeof composeMemory(empty, 0) === 'string', 'and it composes without throwing');

  ok(selectMemory([], TICKET).findings.length === 0, 'an empty ledger is not a crash');
  ok(selectMemory(null, TICKET).deadEnds.length === 0, 'nor is a null ledger');
  ok(scoreBead({}, ticketTerms(TICKET)) === 0, 'nor is a bead with no title or body');
}

// ═══════════════════════════════════════════════ §10 THE CLIP KEEPS THE MORAL
//
// The findings in this ledger narrate a discovery and then say what transfers,
// and the transferable part is at the END. A head-clip keeps the story and drops
// the moral. This section pins that the clip keeps both ends — and its CONTROL
// is what makes it mean anything: the moral is asserted to lie BEYOND the
// allowance in the source, so a head-clip provably could not have kept it.

const OPENING = 'OPENING CLAIM: the reactor pushed without rebasing and lost the race.';
const MORAL = 'THE GENERAL LESSON: a retry loop that changes nothing between attempts is a delay, not a retry.';
const NARRATION = 'narration '.repeat(400); // 4000 chars of filler between them
const LONG_BODY = `${OPENING} ${NARRATION}${MORAL}`;

section('10. a clipped body keeps its LAST sentence, not only its first');
{
  const cut = LONG_BODY.length - FINDING_BODY_CHARS;
  const marker = `\n... [clipped ${cut} chars from the middle - full text in .github/loop/beads.jsonl]\n`;
  const clipped = clip(LONG_BODY, FINDING_BODY_CHARS);
  const head = Math.round(FINDING_BODY_CHARS * CLIP_HEAD_FRACTION);
  const tail = FINDING_BODY_CHARS - head;

  console.log(`   source=${LONG_BODY.length} allowance=${FINDING_BODY_CHARS} `
    + `head=${head} tail=${tail} clipped=${clipped.length}`);

  ok(LONG_BODY.length > FINDING_BODY_CHARS,
    `CONTROL: the fixture must actually exceed the allowance or nothing is clipped; `
    + `${LONG_BODY.length} vs ${FINDING_BODY_CHARS}`);
  ok(!LONG_BODY.slice(0, FINDING_BODY_CHARS).includes(MORAL),
    'CONTROL, AND IT IS THE LOAD-BEARING HALF: the moral must lie BEYOND the '
    + 'allowance in the source, so a head-clip could not possibly have kept it. '
    + 'Without this, "the moral survived" is satisfied by the head-clip this rule '
    + 'replaced and the section tests nothing.');

  ok(clipped.includes(OPENING), 'the opening claim survives the clip');
  ok(clipped.includes(MORAL),
    'AND SO DOES THE MORAL. This is the whole point of the rule: what transfers '
    + 'from a finding is at its end, so a clip that keeps only the beginning hands '
    + 'a turn the anecdote and withholds the lesson.');
  // "the middle really went" needs an assertion that COULD fail. `!includes(NARRATION)`
  // cannot — 4000 chars never fit a 1600-char allowance — so it would be decoration.
  // This one can: it says the two kept fragments are NOT ADJACENT in the source,
  // which is false for any clip that merely takes one contiguous run.
  ok(!LONG_BODY.includes(LONG_BODY.slice(0, head) + LONG_BODY.slice(LONG_BODY.length - tail)),
    'the kept head and the kept tail are not adjacent in the source — there is a '
    + 'real gap between them, which is what makes this a middle-clip rather than '
    + 'one contiguous window that happens to sit at the end');

  ok(clipped.startsWith(LONG_BODY.slice(0, head)),
    `the kept head is exactly the first ${head} characters of the source`);
  ok(clipped.endsWith(LONG_BODY.slice(LONG_BODY.length - tail)),
    `and the kept tail is exactly the last ${tail}`);
  ok(clipped.length === FINDING_BODY_CHARS + marker.length,
    'THE TOTAL KEPT IS UNCHANGED from the head-clip this replaced — head + tail is '
    + 'exactly the allowance — which is what makes every byte-budget number in §6 '
    + `still valid; got ${clipped.length}, expected ${FINDING_BODY_CHARS + marker.length}`);
  ok(clipped.includes('from the middle'),
    'and the marker says WHICH part went, because a reader who sees a seam needs '
    + 'to know whether the text below it continues the text above it');
  ok(clipped.includes('full text in .github/loop/beads.jsonl'),
    'and where the whole thing is — a clip is a pointer, not data loss');

  ok(clip('short enough', FINDING_BODY_CHARS) === 'short enough',
    'a body under the allowance is returned byte-identical, with no marker');

  // The degrade path. Two fragments of a couple of hundred characters are less
  // legible than one, so below MIN_MIDDLE_CLIP_CHARS the old head-clip is used.
  ok(100 < MIN_MIDDLE_CLIP_CHARS,
    `CONTROL: 100 must be under the middle-clip floor (${MIN_MIDDLE_CLIP_CHARS}) or the `
    + 'next two assertions are testing the middle-clip path by accident');
  const tiny = clip(LONG_BODY, 100);
  ok(!tiny.includes('from the middle') && !tiny.includes(MORAL),
    'under the floor it degrades to a plain head-clip — deliberately, and it says '
    + 'so in the marker it does emit');
  ok(tiny.startsWith(LONG_BODY.slice(0, 100)), 'and that head-clip is still exact');
}

// ═══════════════════════════════ §11 NO TICKET IS NOT THE SAME AS A SCORE OF ZERO
//
// Requirement: the plan and review seats have no single ticket. If `{}` selects
// nothing, the seat whose job is writing requirements out of what the loop has
// learned reads an EMPTY findings section and nothing goes red.

// Terms that appear nowhere in LEDGER or TICKET — checked against DISJOINT, the
// noise/star/weak titles and bodies, and the dead-end titles.
const NONSENSE_TICKET = { title: 'Zygote parallax quintessence' };

section('11. no ticket falls back to recency; a ticket that matches nothing does not');
{
  const withTicket = selectMemory(LEDGER, TICKET);
  const noTicket = selectMemory(LEDGER, {});
  const nonsense = selectMemory(LEDGER, NONSENSE_TICKET);

  const inTicket = new Set(withTicket.findings.map((b) => b.id));
  const inNone = new Set(noTicket.findings.map((b) => b.id));

  console.log(`   withTicket kept=${withTicket.keptFindings} fallback=${withTicket.fallback}  `
    + `noTicket kept=${noTicket.keptFindings} fallback=${noTicket.fallback}  `
    + `nonsense kept=${nonsense.keptFindings} fallback=${nonsense.fallback}`);

  ok(ticketTerms(NONSENSE_TICKET).size > 0,
    'CONTROL: the nonsense ticket must actually yield terms, or it is just another '
    + 'empty ticket and says nothing about the distinction being drawn');
  ok(nonsense.fallback === false && nonsense.keptFindings === 0,
    'A TICKET THAT MATCHES NOTHING STILL SELECTS NOTHING. The fallback triggers on '
    + '"there was nothing to measure against", NEVER on "measured and found '
    + 'irrelevant" — otherwise it would quietly undo MIN_SCORE, which is the rule '
    + `that makes this selection rather than truncation. got kept=${nonsense.keptFindings}`);

  ok(noTicket.fallback === true, 'an empty ticket takes the fallback path');
  ok(noTicket.keptFindings === RECENCY_FALLBACK,
    `and keeps the ${RECENCY_FALLBACK} most recent findings rather than none. A planner `
    + 'handed an empty findings section is the silent failure this exists to stop: '
    + 'nothing goes red, the turn simply writes worse requirements. '
    + `got ${noTicket.keptFindings}`);
  ok(noTicket.deadEnds.length === DEAD_ENDS,
    'with every dead-end still exempt, so the fallback is never worse than the floor');

  // THE PAIR. One ledger, one difference — whether a ticket was given — and the
  // two extremes swap places. Neither run alone can distinguish "ranked by score"
  // from "ranked by age"; together they pin it from both sides.
  ok(inTicket.has('lp-00star') && !inNone.has('lp-00star'),
    'THE OLDEST finding is kept WITH a ticket (it scores highest) and dropped '
    + 'WITHOUT one (it is the oldest thing in the ledger)');
  ok(!inTicket.has('lp-00weak') && inNone.has('lp-00weak'),
    'and THE NEWEST is the exact inverse — dropped with a ticket, kept without. '
    + 'The two runs differ in one thing and the extremes swap, so what is being '
    + 'measured is which RULE ran, not which findings happened to be there.');

  const footer = memoryFooter(noTicket, LEDGER.length);
  ok(footer.includes('NOTHING TO MEASURE RELEVANCE AGAINST') && footer.includes('MOST RECENT'),
    'the footer names the weaker rule when the weaker rule ran — a turn told '
    + '"these are the most recent" can go and read the ledger; a turn told nothing '
    + 'assumes it was given the relevant ones');
  ok(!footer.includes('SELECTED, NOT TRUNCATED'),
    'and does NOT claim relevance selection happened when it did not');
  ok(memoryFooter(withTicket, LEDGER.length).includes('SELECTED, NOT TRUNCATED'),
    'CONTROL: the ordinary path still says what it always said');

  ok(byteLength(composeMemory(noTicket, LEDGER.length)) < MEMORY_BUDGET_BYTES,
    'and the fallback composition is under budget too — a second path into the '
    + 'brief is a second path that can blow it');
}

// ══════════════════ §12 THE ANSWER EXEMPTION READS THE TAG, NOT THE KIND
//
// `selectMemory` partitions the ledger three ways — dead-end, answer, finding —
// and until now only two of those were tested. The untested one is the one that
// matters most per item: an operator answer is the only fact in a brief that came
// from OUTSIDE the loop, so a dropped answer is the single thing no amount of
// further looping could reproduce.
//
// It is also the branch where a plausible mistake is catastrophic in the other
// direction. `isAnswer` is `kind === 'decision' && tags.includes('answer')`.
// Drop the tag half — an easy simplification for anyone who reads "answers are
// decisions" — and EVERY decision bead becomes unconditionally exempt. The real
// ledger is full of them: loop-apply-outbox.mjs writes agent-filed decisions with
// `tags: ['learned']`, one or more per turn, forever. That mistake would defeat
// this entire file by way of the one rule it is not allowed to bound.

// Vocabulary checked word by word against TICKET's term list: ugly playable
// beats elegant inert ship rough version answer build first. None is a ticket
// term, so this answer scores EXACTLY 0 and only the exemption can save it.
const ANSWER = {
  id: 'lp-00ans1',
  kind: 'decision',
  tags: ['answer', 'answers:lp-00q001'],
  created: '2026-04-01T00:00:00.000Z',
  title: 'Ugly and playable beats elegant and inert',
  body: 'Ship the rough version. (in answer to lp-00q001 - "Which should I build first")',
};

// THE CONTROL, and it is shaped like the real thing on purpose: `tags: ['learned']`
// is verbatim what loop-apply-outbox.mjs stamps on an agent's `learned` entry.
const ORDINARY_DECISION = {
  id: 'lp-00dec1',
  kind: 'decision',
  tags: ['learned'],
  created: '2026-04-02T00:00:00.000Z',
  title: 'Chose a plain lattice rebuild over an incremental one',
  body: 'The incremental path needs a proof nobody has; the rebuild is cheap here.',
};

section('12. operator answers are exempt — and ordinary decisions are not');
{
  const ledger = [...LEDGER, ANSWER, ORDINARY_DECISION];
  const terms = ticketTerms(TICKET);
  const sel = selectMemory(ledger, TICKET);
  const composed = composeMemory(sel, ledger.length);
  const answerScore = scoreBead(ANSWER, terms);

  console.log(`   answers=${sel.answers.length} answerScore=${answerScore} `
    + `consideredFindings=${sel.consideredFindings}`);

  ok(answerScore === 0,
    'CONTROL: the answer must score EXACTLY 0 against this ticket — its vocabulary '
    + 'was chosen disjoint by hand. If it scored well it would survive on relevance '
    + 'and the exemption would never be exercised, exactly as in §7. '
    + `got ${answerScore}`);
  ok(sel.answers.some((b) => b.id === ANSWER.id),
    'a zero-scoring operator answer is kept anyway. An answer is the only kind of '
    + 'fact in a brief that came from OUTSIDE the loop, so dropping one is the one '
    + 'loss no amount of further looping can make good.');
  ok(composed.includes(ANSWER.title) && composed.includes('THE OPERATOR ANSWERED'),
    'and it reaches the composed text under its own label, not merely the selection '
    + 'object the composer might ignore');

  const everywhere = [...sel.answers, ...sel.findings, ...sel.deadEnds];
  ok(!everywhere.some((b) => b.id === ORDINARY_DECISION.id),
    'CONTROL, AND IT IS THE LOAD-BEARING HALF: a `decision` WITHOUT the `answer` '
    + 'tag appears in no bucket. The exemption reads the TAG, not the KIND. '
    + 'loop-apply-outbox.mjs stamps every agent-filed decision with tags:["learned"], '
    + 'one or more per turn forever — so exempting `kind === "decision"` would make '
    + 'the whole decision log unconditionally exempt and blow the budget §6 defends, '
    + 'while every assertion about answers surviving still passed.');
  ok(!composed.includes(ORDINARY_DECISION.title),
    'and it is absent from the composed text too');

  ok(sel.consideredFindings === NOISE + 2,
    'neither decision bead leaked into the FINDING pool either — if one had, it '
    + 'would compete for the cap against real findings and quietly evict one. '
    + `got ${sel.consideredFindings}, expected ${NOISE + 2}`);

  // The strongest form, mirroring §7: squeeze every scored kind to nothing and
  // the exemption must still hold.
  const starved = selectMemory(ledger, TICKET, { maxFindings: 0, minScore: 1e9 });
  ok(starved.findings.length === 0, 'with the cap at 0 no finding survives');
  ok(starved.answers.length === 1 && starved.deadEnds.length === DEAD_ENDS,
    'but the answer and every dead-end still do — both exemptions are '
    + 'unconditional, not "they usually rank high"');

  ok(memoryFooter(sel, ledger.length).includes('1 operator answer(s)'),
    'and the footer states how many answers were carried, so the reader knows '
    + 'whether there were any rather than having to assume');
}

// ═════════════ §13 THE EXEMPT HALF IS UNBOUNDED — THIS IS THE NUMBER
//
// Every dead-end BODY is clipped, so each dead-end costs a bounded number of
// bytes. Nothing bounds HOW MANY there are, and that is deliberate (§7). The
// consequence nobody has written down is that the budget therefore has a finite
// dead-end capacity, and a loop whose whole job is to record dead-ends walks
// toward it one turn at a time.
//
// This section measures that capacity instead of asserting a hand-computed
// constant, so it stays true when the clip sizes or the findings half change.
// The fix when it binds is to TOMBSTONE dead-ends a later dead-end supersedes —
// never to start scoring them, which is the rule §7 forbids.
section('13. the dead-end half is unbounded by design — this is what it costs');
{
  const sel = selectMemory(LEDGER, TICKET);

  // Fixed-width titles so per-item cost varies only with the filler's newline
  // count, which is what makes the additivity check below meaningful.
  const POOL_SIZE = 60;
  const poolRand = lcg(19700101);
  const pool = [];
  for (let i = 0; i < POOL_SIZE; i++) {
    pool.push({
      id: `lp-00pd${String(i).padStart(2, '0')}`,
      kind: 'dead-end',
      tags: [],
      created: '2026-05-01T00:00:00.000Z',
      title: `Pocket seed ${String(i).padStart(2, '0')} clamps silently rather than refusing`,
      body: filler(poolRand, 5000),
    });
  }

  // Vary ONLY the dead-end count. Reusing one selection keeps the findings half
  // byte-identical across every measurement, so the difference is the dead-ends
  // and nothing else.
  const size = (n) =>
    byteLength(composeMemory({ ...sel, deadEnds: pool.slice(0, n) }, LEDGER.length));

  const s0 = size(0);
  const s1 = size(1);
  const s2 = size(2);

  ok(s1 > s0 && s2 > s1,
    'CONTROL: dead-ends must actually cost bytes. If the composer ignored them '
    + `this whole section would measure nothing. got ${s0} ${s1} ${s2}`);
  ok(Math.abs((s2 - s1) - (s1 - s0)) < 200,
    'and the cost is ADDITIVE — each dead-end costs about the same, which is what '
    + 'makes a single capacity number meaningful rather than an artefact of where '
    + `the scan happened to stop. got deltas ${s1 - s0} and ${s2 - s1}`);

  let capacity = 0;
  while (capacity < POOL_SIZE && size(capacity + 1) <= MEMORY_BUDGET_BYTES) capacity++;

  console.log(`   findings half + footer = ${s0} bytes; each dead-end costs ~${s1 - s0}; `
    + `the ${MEMORY_BUDGET_BYTES}-byte budget absorbs ${capacity} dead-ends`);
  console.log(`   the fixture carries ${DEAD_ENDS}, so the headroom is ${capacity - DEAD_ENDS} more`);

  ok(capacity < POOL_SIZE,
    'CONTROL: the budget must be REACHABLE by dead-ends alone, or "capacity" is '
    + 'just the pool size and this section says nothing. If this ever fails, either '
    + 'the pool shrank or something started bounding the exempt half by count — and '
    + 'bounding it silently is precisely what §7 forbids, so read that first. '
    + `got capacity=${capacity} pool=${POOL_SIZE}`);
  // THE TRIPWIRE. Not a law of nature — a stated early warning with its remedy
  // attached, because the alternative is discovering it as a brief that silently
  // stopped fitting.
  ok(capacity >= DEAD_ENDS + 4,
    'AND THERE IS REAL HEADROOM LEFT. This loop files dead-ends as a matter of '
    + 'routine, so the exempt half grows monotonically and this is the only place '
    + 'that watches it. If this fails, the answer is NOT to start dropping '
    + 'dead-ends by score — that is the asymmetry in §7 and it is not negotiable. '
    + 'It is to TOMBSTONE the ones a later dead-end supersedes, or to lower '
    + 'DEAD_END_BODY_CHARS, or to raise the budget deliberately and say why. '
    + `got capacity=${capacity} against ${DEAD_ENDS} in the fixture`);

  // Not `size(capacity) <= budget` — the scan defines capacity that way, so that
  // assertion could not fail and would be decoration. This one can: it says the
  // measuring harness composes the SAME thing §6 measured, so `capacity` is a
  // number about the real composer and not about `{...sel}`.
  const asSix = byteLength(composeMemory(selectMemory(LEDGER, TICKET), LEDGER.length));
  ok(Math.abs(size(DEAD_ENDS) - asSix) < 400,
    'the harness reproduces §6\'s composition to within the fixtures\' newline '
    + 'variance — it substitutes dead-ends of the same shape and changes nothing '
    + `else. got ${size(DEAD_ENDS)} here against ${asSix} in §6`);
}

console.log(`\n${failures ? 'FAILED' : 'PASSED'}: ${checks - failures}/${checks} checks`);
process.exit(failures ? 1 : 0);

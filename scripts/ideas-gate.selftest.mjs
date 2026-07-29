// node scripts/ideas-gate.selftest.mjs
// Gates the gate. Every rule must reject what it claims to reject AND let a good
// concept through — a gate that rejects everything passes any test that only
// checks for rejection, and it would silently stop the bot posting forever.
//
// The GOOD fixture is a real concept a human accepted (docs/ARXIV-TOYS.md §1,
// arXiv:2607.25274). Each bad fixture is that same concept broken one way.

import { gate, RULES, renderPost, graphemeCount, MAX_GRAPHEMES, FIXABLE } from './ideas-gate.mjs';

let failures = 0;
const ck = (c, m) => { if (c) console.log(`  ✓ ${m}`); else { failures++; console.error(`  ✗ ${m}`); } };

const GOOD = {
  arxivId: '2607.25274',
  paperTitle: 'Proper Hat-Guessing on Two-Spine Book Graphs',
  categories: ['math.CO'],
  name: 'eleven-hats',
  text: 'Everyone wears a hat, nobody sees their own, and you all shout a colour at the same instant. One correct guess wins it for the room. Two players plus any number of friends can always win with 11 colours. Twelve is impossible. Settled this morning.',
  mechanism: 'n-player simultaneous guessing game with a pre-agreed strategy table',
  surfaces: ['games'],
};

const CTX = {
  knownIds: new Set(['2607.25274', '2607.25780']),
  titles: new Map([
    ['2607.25274', 'Proper Hat-Guessing on Two-Spine Book Graphs'],
    ['2607.25780', 'Macroscopic wall pressure and microscopic contact load in crowds without egress'],
  ]),
  queuedIds: new Set(['2607.99999']),
  queuedNames: new Set(['already-here']),
  takenNames: new Set(['hoop', 'poll', 'kakeya']),
};

const run = (d) => gate([{ ...GOOD, ...d }], CTX);
const failed = (d, ruleId) => {
  const { rejected } = run(d);
  return rejected.length === 1 && rejected[0].failures.some((f) => f.rule === ruleId);
};
const why = (d) => run(d).rejected[0]?.failures.map((f) => f.rule).join(',') || '<accepted>';
/** Did THIS rule stay quiet? Used where a fixture is built to probe one rule and
 *  trips another on the way — asserting full acceptance there would test the
 *  wrong thing. */
const passed = (d, ruleId) => !run(d).rejected[0]?.failures.some((f) => f.rule === ruleId);

console.log('— the good concept passes, and that is the point —');
{
  const { accepted, rejected } = run({});
  ck(accepted.length === 1, `a real accepted concept passes all ${RULES.length} rules${rejected.length ? ` (failed: ${why({})})` : ''}`);
  ck(graphemeCount(renderPost(GOOD)) <= MAX_GRAPHEMES, 'and it fits in a post');
  ck(renderPost(GOOD).endsWith('arxiv.org/abs/2607.25274'), 'rendered post cites the paper');
}

console.log('— every rule has a name and a reason —');
{
  ck(RULES.every((r) => r.id && r.why && typeof r.test === 'function'), 'all rules well-formed');
  ck(new Set(RULES.map((r) => r.id)).size === RULES.length, 'rule ids are unique');
}

console.log('— shape and slug —');
{
  ck(failed({ text: '' }, 'shape'), 'empty text is a shape failure');
  ck(failed({ mechanism: '   ' }, 'shape'), 'blank mechanism is a shape failure');
  ck(failed({ surfaces: 'games' }, 'shape'), 'surfaces must be an array');
  ck(failed({ name: 'Eleven Hats' }, 'slug'), 'a name with spaces and capitals is not a slug');
  ck(failed({ name: '-leading' }, 'slug'), 'a leading hyphen is not a slug');
  ck(run({ surfaces: [] }).accepted.length === 1, 'an empty surfaces array is fine — not every toy reuses something');
}

console.log('— the citation must be real (the anti-hallucination rule) —');
{
  ck(failed({ arxivId: '2607.11111' }, 'arxiv-id-real'), "an id that was not in today's fetch is rejected");
  ck(failed({ arxivId: 'quant-ph/9999' }, 'arxiv-id-real'), 'an id of the wrong shape is rejected');
  ck(failed({ arxivId: '2607.25274v1' }, 'arxiv-id-real'), 'a versioned id is rejected — the queue stores the bare id');
  ck(gate([GOOD], { ...CTX, knownIds: new Set() }).accepted.length === 1,
    'with no inbox to check against, the id rule does not block (offline runs stay usable)');
}

console.log('— the title must belong to the id —');
{
  ck(failed({ arxivId: '2607.25780' }, 'title-matches-paper'),
    'a real id paired with another paper\'s title is caught');
  ck(run({ paperTitle: 'Proper hat guessing on book graphs' }).accepted.length === 1,
    'a lightly reworded title still matches');
}

console.log('— duplicates —');
{
  ck(failed({ arxivId: '2607.99999', paperTitle: 'whatever this is' }, 'not-already-queued'), 'an already-queued paper is rejected');
  ck(failed({ name: 'already-here' }, 'not-already-queued'), 'an already-used name is rejected');
  ck(failed({ name: 'kakeya' }, 'name-free'), 'a name that exists in the repo is rejected');
  const twice = gate([GOOD, { ...GOOD, name: 'other-name' }], CTX);
  ck(twice.accepted.length === 1 && twice.rejected.length === 1,
    'the same paper twice IN ONE BATCH only passes once');
}

console.log('— length —');
{
  ck(failed({ text: 'you drag a thing' }, 'length'), 'a stub is rejected');
  ck(failed({ text: 'you drag it. ' + 'x'.repeat(320) }, 'length'), 'an over-long post is rejected');
  ck(graphemeCount('👨‍👩‍👧‍👦') === 1 || graphemeCount('👨‍👩‍👧‍👦') === 4,
    'grapheme counting handles a ZWJ family (1 with ICU, 4 without — never 11)');
}

// THE FIRST REAL REVIEW RUN LOST ALL FOUR DRAFTS HERE AND NOWHERE ELSE — 307,
// 312, 312, 319 against 300. Every one in the band you land in by aiming at 300
// and forgetting the citation you were told is "appended for you" and never told
// the size of. Both halves of that are pinned below: the message has to carry the
// number, and the paper must not be burned for it.
console.log('— the length rejection the first live run tripped —');
{
  // 286 graphemes of text rendered as 312 on the real run. Reproduced exactly.
  const over = { text: 'x'.repeat(286), arxivId: '2607.26034' };
  ck(graphemeCount(renderPost(over)) === 312,
    'a 286-grapheme text renders to 312 — the citation costs 26, measured not assumed');
  const msg = RULES.find((r) => r.id === 'length').test(over) ?? '';
  ck(/at most 274/.test(msg), 'the message states the TEXT budget, not just the breach');
  ck(/trim 12/.test(msg), 'and exactly how much to cut');
}

console.log('— a fixable rejection must not burn the paper —');
{
  ck(FIXABLE.has('length'), 'length is fixable: it says nothing about the paper');
  ck(!FIXABLE.has('not-a-restatement'),
    'restating the title is a verdict on the paper — round-tripping it would loop');
  ck(!FIXABLE.has('citation-real'), 'a bad citation is not a formatting slip');
  ck(FIXABLE.size === 1, 'the set stays tiny on purpose');
}

console.log('— the characteristic failure: restating the title —');
{
  ck(failed({ text: 'A site where you can explore proper hat-guessing on two-spine book graphs.' }, 'not-a-restatement'),
    'the title verbatim with a verb bolted on is rejected');
  ck(failed({ text: 'Play with proper hat guessing over two spine book graphs, and see the graphs guessing spine by spine.' }, 'not-a-restatement'),
    'heavy word reuse from the title is rejected even when reordered');
  ck(passed({ paperTitle: 'On Hats' }, 'not-a-restatement'),
    'a very short title cannot trip the overlap test (too few words to be evidence)');
  ck(failed({ paperTitle: 'On Hats' }, 'title-matches-paper'),
    '...and such a title is caught by the citation rule instead, not waved through');
}

console.log('— it has to be something you do —');
{
  ck(failed({ text: 'An interactive museum of hat-colouring adversaries, presenting the combinatorial background and the relevant literature in context.' }, 'operable'),
    'a topic with no operative verb is rejected');
  ck(failed({ mechanism: 'a game' }, 'operable'), 'a mechanism too short to be one is rejected');
}

console.log('— no selling, no overclaiming —');
{
  ck(failed({ text: 'Dive into this groundbreaking hat game where you unlock the secrets of colour and guess along with friends at the same instant.' }, 'no-hype'),
    'selling language is rejected');
  ck(failed({ text: GOOD.text + ' Wow!!' }, 'no-hype'), 'more than one exclamation mark is rejected');
  ck(failed({ text: GOOD.text + ' #math' }, 'no-hype'), 'hashtags are rejected');
  ck(failed({ text: 'You all guess at once, and the strategy is provably the best possible one for the room, whatever the adversary picks.' }, 'no-overclaim'),
    '"provably" is rejected');
  ck(run({ text: 'You all shout a colour at once. Two players plus any number of friends win with 11 colours; an Erdos-era question, solved this morning.' }).accepted.length === 1,
    'citing that a paper solved something is NOT an overclaim');
}

console.log('— a rule that throws is a rejection, not a crash —');
{
  const { rejected } = gate([{ ...GOOD, name: undefined }], CTX);
  ck(rejected.length === 1, 'a malformed draft is rejected rather than taking the run down');
}

console.log(`\n${failures === 0 ? '✓ all gates passed' : `✗ ${failures} gate(s) failed`}`);
process.exit(failures ? 1 : 0);

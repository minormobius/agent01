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
  // IDEATION WRITES THIS, a separate pass crafts the post from it, and the BUILD
  // agent receives it when somebody replies "build that". Every fixture carries
  // one because a concept without a plan is the thin thing the split exists to
  // stop — see the plan-substantial rule.
  plan: [
    'The paper settles proper hat-guessing on two-spine book graphs: two distinguished players plus any',
    'number of friends can always win with eleven colours, and twelve is impossible. The toy is the',
    'simultaneous round. Everyone is dealt a hat colour, nobody sees their own, and every player commits',
    'a guess at once; one correct guess saves the room. Build the eleven-colour strategy table first,',
    'because it is the thing that makes the game feel solved rather than lucky, and it is small enough',
    'to render as a grid the visitor can read. First interaction: pick the number of players and the',
    'number of colours, deal, and step through one round with the table visible. The hard part is making',
    'the impossibility of twelve legible without a proof — probably a counter that shows the strategy',
    'space running out rather than an argument. Reuse the games surface for scoring and the kit for the',
    'grid. Scores go to the visitor repo as com.minomobi.lab.score with higherIsBetter true.',
  ].join(' '),
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
  // The citation is an app.bsky.embed.external card built by the poster, not text.
  // Asserting its ABSENCE here is what keeps it from drifting back in.
  ck(!renderPost(GOOD).includes('arxiv'), 'the rendered post does NOT carry the citation — that is the card');
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

// THE FIRST REAL REVIEW RUN LOST ALL FOUR DRAFTS TO LENGTH — 307, 307, 312, 319
// against 300 — because the citation was appended to the text and cost 26 of the
// budget. It is a link CARD now, which costs nothing, so the whole 300 belongs to
// the idea. These assertions are what stops the citation creeping back into the
// text: the day renderPost appends anything again, the first two fail.
console.log('— the citation is a card, so the text keeps the whole budget —');
{
  const d = { text: 'x'.repeat(286), arxivId: '2607.26034' };
  ck(graphemeCount(renderPost(d)) === 286,
    'the rendered post is exactly the text — no suffix eating the budget');
  ck(!renderPost(d).includes('arxiv.org'), 'and no citation smuggled into it');
  // 300 exactly must pass: the boundary is the point of moving the citation out.
  ck(passed({ text: 'y'.repeat(300) }, 'length'), 'a full 300 graphemes of idea is legal now');
  const msg = RULES.find((r) => r.id === 'length').test({ text: 'y'.repeat(312) }) ?? '';
  ck(/trim 12/.test(msg), 'an over-long post is told exactly how much to cut');
  ck(/costs you nothing/.test(msg), 'and that the link is not what put it over');
}

// The other half of the split: a post with nothing behind it.
console.log('— a concept must carry a plan, because that is what gets built —');
{
  ck(failed({ plan: '' }, 'plan-substantial'), 'no plan is rejected');
  ck(failed({ plan: undefined }, 'plan-substantial'), 'a missing plan is rejected');
  ck(failed({ plan: 'A game about hats. Build it.' }, 'plan-substantial'),
    'a one-line plan is rejected — the build agent cannot start from it');
  const msg = RULES.find((r) => r.id === 'plan-substantial').test({ plan: 'a b c' }) ?? '';
  ck(/min \d+/.test(msg) && /build agent/.test(msg),
    'and the message says what it is for, not just that it is short');
  ck(passed({}, 'plan-substantial'), 'the good fixture plan passes');
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

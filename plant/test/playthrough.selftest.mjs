#!/usr/bin/env node
// playthrough.selftest.mjs — the vision's thirty-second bar, made executable.
//
// vision.md names four executable claims for item 1. Three are already covered
// by plant/test/campaign.selftest.mjs: the control logic lives in a module a
// test can drive, completing a level advances to exactly one next and the last
// terminates, and the order is monotonic in a stated measure. THE FOURTH IS
// THIS FILE:
//
//   "a scripted playthrough reaches a refusal the player caused in a bounded
//    number of moves, and the test asserts that bound."
//
// ---------------------------------------------------------- WHY A NEW FILE
//
// campaign.selftest.mjs §11 already asserts "a refusal the player caused, in
// ONE move, on every level". It finds that move like this:
//
//     const losing = e.knob.samples.find((s) => !grade(e, s).ok);
//
// THAT IS A SEARCH, and a search proves only that the domain CONTAINS a losing
// setting — which the win fractions already told us, since every one of them is
// strictly between 0 and 1. It says nothing about how far a player has to walk
// to meet a refusal, because the walk was done by an oracle that could see the
// answer. §11 is not wrong; it is answering a weaker question and this file
// answers the intended one.
//
// ------------------------------------------------------- WHAT A POLICY IS
//
// Every policy here is BLIND. It is a pure function
//
//     policy(samples, openingIndex, moveNumber) -> a member of samples
//
// and it never receives, reads or calls anything that knows an outcome: no
// Campaign, no verdict(), no grade(), no feasible(). §2 enforces that
// STRUCTURALLY rather than on my word — it stringifies each policy and fails on
// any mention of an outcome, and it carries a deliberately-cheating policy as a
// CONTROL so the check cannot pass by matching nothing. §3 additionally
// computes each policy's whole move sequence BEFORE the Campaign exists and
// replays it, so a plan cannot have been influenced by a result it had not seen.
//
// The bounds below are therefore properties of THE LEVEL'S SHAPE — how far the
// losing region sits from the opening setting, measured in the control's own
// steps — rather than properties of a search.
//
// -------------------------------------------------------- THE THREE POLICIES
//
//   YANK_FLOOR  move 1 is samples[0].          "a stranger drags the control to
//                                               the bottom and lets go."
//   STEP_DOWN   move k is samples[i0 - k].     one notch down per move, clamped
//                                               at the floor.
//   STEP_UP     move k is samples[i0 + k].     one notch up per move, clamped
//                                               at the ceiling.
//
// Clamping is what makes them total. Two levels open at an end of their own
// domain — level1 at the top (rate 120 of 10..120) and level2 at the bottom
// ('cheap' of three buttons) — so an unclamped policy would index off the array
// and the test would be measuring undefined rather than the game.
//
// A clamped move re-affirms the setting the player is already on. That IS a
// move (Campaign.move() accepts it, and campaign.selftest.mjs §12 pins that),
// and it is the honest reading of a stranger pushing a slider that will not go
// any further. IT IS NO LONGER A WIN, and that is the whole of what changed in
// this file — see below.
//
// ------------------------------------- WHAT CHANGED: A WIN NEEDS A CHANGE
//
// This file's first version measured a blind player finishing all six levels in
// SEVEN moves, and reported what that number was actually made of: five of the
// six levels open ALREADY FED, so the winning move was "nudge the control one
// notch and accept the level you were given". On level1 it was not even a
// nudge — the opening sits at the TOP of its domain, so STEP_UP clamps and the
// winning move was literally re-selecting rate 120.
//
// `Campaign.verdict()` now requires the current setting to DIFFER from
// `knob.start` (campaign.mjs, and campaign.selftest.mjs §12 pins the rule
// itself). Two consequences here, and the first is the interesting one:
//
//   · STEP_UP CAN NEVER WIN LEVEL1. Every move it makes re-selects the opening
//     setting, so the factory is fed for two hundred moves and the level is
//     never won. §7 asserts exactly that, and it is the sharpest statement of
//     the new contract anywhere in the suite: fed, accepted, and not a win.
//   · The win table therefore needs a POLICY PER LEVEL rather than one
//     policy for all six. level1 wins on STEP_DOWN (rate 119, still fed —
//     capacity 51 binds, not supply) in one move, so the campaign total is
//     unchanged at seven. What changed is that all seven are real changes.
//
// The refusal half of the file (§4, §5, §6) is untouched by any of this: a
// refusal was never conditioned on `won`.
//
// ----------------------------------------------------------- THE TWO CONTROLS
//
// The ticket asks for one: a policy moving in the WRONG direction must not find
// what the right one found, within the same bound, or the bound is not
// measuring direction. There are two here because neither covers all six
// levels, and between them every level is covered by at least one:
//
//   §6  WRONG DIRECTION FOR A REFUSAL — STEP_UP must not reach a refusal within
//       the STEP_DOWN bound. Bites on five levels. It CANNOT bite on level2,
//       and the exception is pinned rather than skipped: level2 opens BROKEN,
//       so both its neighbours lose and neither direction is the wrong one.
//
//   §7  WRONG DIRECTION FOR A WIN — on level2, STEP_UP wins at move 2 and
//       STEP_DOWN never wins at all. It now bites on level1 too, from the other
//       end: STEP_UP is clamped on the opening setting there, so it is fed
//       forever and never wins, while STEP_DOWN wins at move 1. On the
//       remaining four, both directions win in one move and direction is
//       genuinely unmeasurable — they open fed and any real change is a win.
//
// That split is not a weakness of the controls, it is a fact about the game —
// five levels open feasible and one opens broken, and two of the six open at an
// end of their own domain — and §6 and §7 pin the split as a table so a level
// retuned across that line fails here.
//
// Run: node plant/test/playthrough.selftest.mjs

import { LEVELS, ORDER, Campaign, entryOf, grade } from '../campaign.mjs';

let failed = 0;
const ok = (name, cond, detail = '') => {
  if (cond) { console.log(`  ✓ ${name}`); return; }
  failed++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`);
};

// ---------------------------------------------------------------- the policies
//
// Deliberately written with no imports in scope beyond Math: see §2.
const YANK_FLOOR = (samples) => samples[0];
const STEP_DOWN = (samples, i0, k) => samples[Math.max(0, i0 - k)];
const STEP_UP = (samples, i0, k) => samples[Math.min(samples.length - 1, i0 + k)];

// The CONTROL for §2. It is never DRIVEN — only stringified — and it exists so
// the blindness check has something it must catch. Without it, a regex that had
// been broken into matching nothing would pass §2 with a full row of ticks.
const CHEATING = (samples, i0, k) => samples.filter((s) => grade(entryOf('level1'), s).ok)[k - 1];

// ------------------------------------------------------------------- the table
//
// Every literal below is derived by hand from the level definitions and the
// boundaries campaign.selftest.mjs already pins as passing facts. The
// derivations are in the section comments; each one is a claim about arithmetic
// that a reader can check without running anything.
const DOMAIN = { level1: 111, level2: 3, level3: 8281, level4: 81, level5: 91, level6: 91 };
const OPENING = { level1: 110, level2: 0, level3: 5495, level4: 42, level5: 25, level6: 35 };

// Does the level open already fed, before the player has touched anything?
const OPENS_FED = { level1: true, level2: false, level3: true, level4: true, level5: true, level6: true };

// (a) blind STEP_DOWN moves to the first REFUSED state.
const DOWN_TO_REFUSAL = { level1: 71, level2: 1, level3: 2, level4: 3, level5: 1, level6: 1 };

// (b) blind moves to the first WON state — and WHICH blind policy gets there.
//
// One policy for all six is no longer available, and the reason is the new win
// rule rather than a convenience. level1 opens at the TOP of its domain, so
// every STEP_UP move re-selects rate 120 — the setting the player was given —
// and `won` now refuses that. STEP_DOWN goes to rate 119, which is still fed:
// scale = min(capacity 51, rate), so the smelter's capacity binds for every
// rate at or above 51 and the depot's demand of 50 is met all the way down to
// rate 50. One move down is a win, and §5 already pins that the first REFUSAL
// in that direction is 71 notches away at rate 49.
//
// The policy is named as well as bound, so the table says WHY level1 is the
// odd one out instead of hiding it inside a function reference.
const WIN_POLICY = {
  level1: STEP_DOWN, level2: STEP_UP, level3: STEP_UP,
  level4: STEP_UP, level5: STEP_UP, level6: STEP_UP,
};
const WIN_POLICY_NAME = {
  level1: 'STEP_DOWN', level2: 'STEP_UP', level3: 'STEP_UP',
  level4: 'STEP_UP', level5: 'STEP_UP', level6: 'STEP_UP',
};
const MOVES_TO_WIN = { level1: 1, level2: 2, level3: 1, level4: 1, level5: 1, level6: 1 };

// §6: can the wrong-direction-for-a-refusal control bite on this level?
const UP_AVOIDS_REFUSAL = { level1: true, level2: false, level3: true, level4: true, level5: true, level6: true };

const WORST_DOWN_TO_REFUSAL = 71;
const WORST_MOVES_TO_WIN = 2;
const MOVES_TO_FINISH_THE_GAME = 7;

// How far a scan will walk before giving up. 200 comfortably exceeds every
// bound in the table (the largest is 71) and every re-entry §5 looks for (36),
// so a scan that runs out is a real failure and not a truncated search.
const SCAN = 200;

// --------------------------------------------------------------------- helpers

/** The index in `samples` of the opening setting, by the knob's own key. */
const openingIndex = (e) => e.knob.samples.findIndex((s) => e.knob.key(s) === e.knob.key(e.knob.start));

/** A Campaign sitting on ORDER[i], freshly entered, zero moves. */
const at = (i) => {
  const c = new Campaign();
  c.start();
  for (let k = 0; k < i; k++) c.next();
  return c;
};

/** The first `n` settings a policy would choose, computed with no game in hand. */
const plan = (policy, e, n) => {
  const s = e.knob.samples;
  const i0 = openingIndex(e);
  return Array.from({ length: n }, (unused, j) => policy(s, i0, j + 1));
};

/**
 * Drive `c` with `policy` and report the first move number at which `pred` holds
 * of the verdict, or null. `from` lets a scan resume past an earlier find
 * without restarting the walk.
 *
 * A REFUSED move aborts with `stalled`, rather than being skipped: a policy
 * whose setting the game will not accept is not walking anywhere, and silently
 * continuing would let a bound be "reached" by a walk that never moved.
 */
function scan(c, policy, pred, from = 1, limit = SCAN) {
  const s = c.entry.knob.samples;
  const i0 = openingIndex(c.entry);
  for (let k = from; k <= limit; k++) {
    const r = c.move(policy(s, i0, k));
    if (!r.accepted) return { move: null, stalled: k, moves: c.state().moves };
    if (r.moves !== k) return { move: null, stalled: k, moves: r.moves };
    if (pred(c.verdict())) return { move: k, stalled: null, moves: r.moves };
  }
  return { move: null, stalled: null, moves: c.state().moves };
}

const REFUSED = (v) => v.ok === false;
const WON = (v) => v.won === true;

// ---------------------------------------------------------------------------
console.log('\n1. the fixtures the whole file rests on: domain size and opening index');
{
  // Every bound below is an arithmetic claim about a position in `samples`. If
  // a domain is resized or an opening setting moved, every literal in the table
  // silently becomes a statement about a different game — so both are pinned
  // here first, and a change to either fails HERE with a message naming it
  // rather than fifty assertions later with a message about move counts.
  for (const id of ORDER) {
    const e = entryOf(id);
    ok(`${id}: domain is ${DOMAIN[id]} settings`, e.knob.samples.length === DOMAIN[id], `${e.knob.samples.length}`);
    ok(`${id}: the opening setting sits at index ${OPENING[id]}`, openingIndex(e) === OPENING[id], `${openingIndex(e)}`);
  }
  // The two ends of the domain are where clamping matters, and both are real:
  ok('level1 opens at the TOP of its domain, so STEP_UP clamps',
    OPENING.level1 === DOMAIN.level1 - 1);
  ok('level2 opens at the BOTTOM of its domain, so STEP_DOWN clamps',
    OPENING.level2 === 0);

  const ids = LEVELS.map((e) => e.id).sort().join(',');
  ok('the table covers exactly the six shipped levels',
    Object.keys(DOWN_TO_REFUSAL).sort().join(',') === ids);
  // Three tables now, and a level missing from any of them would read as
  // `undefined` rather than as a failure: `MOVES_TO_WIN[id]` undefined makes
  // `found.move === undefined` false, which fails with a confusing message, and
  // `WIN_POLICY[id]` undefined throws inside scan(). Both are caught here first.
  ok('the win-policy table covers the same six', Object.keys(WIN_POLICY).sort().join(',') === ids);
  ok('the moves-to-win table covers the same six', Object.keys(MOVES_TO_WIN).sort().join(',') === ids);
  ok('every level has a NAMED win policy', Object.keys(WIN_POLICY_NAME).sort().join(',') === ids);
}

// ---------------------------------------------------------------------------
console.log('\n2. the policies are BLIND — checked structurally, not claimed');
{
  // The one property that makes every number in this file worth reading. A
  // policy that peeks at an outcome turns each bound below into a restatement
  // of "the domain contains a loss", which is what this file exists NOT to be.
  const PEEKING = /\b(grade|verdict|feasible|deficits|achieved|margin|won|wins|ok)\b/;

  for (const [name, policy] of [['YANK_FLOOR', YANK_FLOOR], ['STEP_DOWN', STEP_DOWN], ['STEP_UP', STEP_UP]]) {
    const src = policy.toString();
    ok(`${name}: its source mentions no outcome`, !PEEKING.test(src), (src.match(PEEKING) || [])[0]);
    ok(`${name}: it takes settings and numbers, never a game`, policy.length <= 3, `${policy.length}`);
  }

  // CONTROL. Without this, a PEEKING regex broken into matching nothing — a
  // stray character class, a lost alternation — would print three ticks above
  // and check nothing at all. This policy is never driven; it exists to be
  // caught.
  ok('CONTROL: the blindness check catches a policy that searches for a loser',
    PEEKING.test(CHEATING.toString()), CHEATING.toString());
  ok('CONTROL: ...and names what it caught', /grade/.test((CHEATING.toString().match(PEEKING) || [])[0] || ''));
}

// ---------------------------------------------------------------------------
console.log('\n3. a policy is a PLAN, fixed before the game starts');
{
  // Blindness in the source is necessary and not sufficient: a policy could be
  // pure and still be handed a sequence that somebody else chose by grading.
  // These compute the whole move sequence with no Campaign in existence, play
  // it, and recompute — a plan that changed is a plan that was watching.
  for (const id of ORDER) {
    const e = entryOf(id);
    const before = plan(STEP_DOWN, e, 8).map(e.knob.key);
    const c = at(ORDER.indexOf(id));
    for (const v of plan(STEP_DOWN, e, 8)) c.move(v);
    const after = plan(STEP_DOWN, e, 8).map(e.knob.key);
    ok(`${id}: the plan is the same before and after eight moves of it`,
      before.join('|') === after.join('|'), `${before.join('|')} vs ${after.join('|')}`);
    ok(`${id}: and the game accepted all eight`, c.state().moves === 8, `${c.state().moves}`);
  }
  // CONTROL: the comparison can distinguish two plans. Without it, a key
  // function that returned a constant would make every plan look identical.
  const e1 = entryOf('level1');
  ok('CONTROL: STEP_DOWN and STEP_UP produce DIFFERENT plans on the same level',
    plan(STEP_DOWN, e1, 4).map(e1.knob.key).join('|') !== plan(STEP_UP, e1, 4).map(e1.knob.key).join('|'));
}

// ---------------------------------------------------------------------------
console.log('\n4. (a) a refusal the player caused, blind, in a bounded number of moves');
{
  // The headline claim, and the one the vision's thirty-second bar is really
  // about: ONE move — a stranger yanking the control to its bottom end — is
  // refused on every level in the game.
  for (let i = 0; i < ORDER.length; i++) {
    const id = ORDER[i];
    const c = at(i);

    ok(`${id}: opens ${OPENS_FED[id] ? 'already fed' : 'BROKEN'} before any move`,
      c.verdict().ok === OPENS_FED[id], `${c.verdict().ok}`);
    // The tightness proof for every level whose bound is 1: zero moves can
    // never be a win, because `won` requires a move to a setting that is not
    // the one the player was handed, and at zero moves nothing has changed. A
    // level you win by arriving is not a level, and that rule is what makes "1"
    // mean something.
    ok(`${id}: and is NOT won at zero moves`, c.verdict().won === false);

    const r = c.move(YANK_FLOOR(c.entry.knob.samples));
    ok(`${id}: the bottom of the control is an accepted move`, r.accepted === true, r.reason);
    ok(`${id}: it costs exactly one move`, c.state().moves === 1, `${c.state().moves}`);

    const v = c.verdict();
    ok(`${id}: YANK_FLOOR is REFUSED in 1 move`, v.ok === false);
    ok(`${id}: and the level is not won`, v.won === false);
    ok(`${id}: something is named as starved`, v.deficits.length >= 1, `${v.deficits.length}`);
    for (const d of v.deficits) {
      ok(`${id}: the refusal sentence names ${d.sinkId} and ${d.resource}`,
        v.line.includes(d.sinkId) && v.line.includes(d.resource), v.line);
    }
    // A missing field renders as the literal string "undefined" inside a
    // template and every includes() above still passes.
    ok(`${id}: the sentence has no undefined or NaN in it`, !/undefined|NaN/.test(v.line), v.line);
    ok(`${id}: the sentence says it failed`, /^✗/.test(v.line), v.line);
  }
}

// ---------------------------------------------------------------------------
console.log('\n5. (a) the FINE bound: one notch at a time, and it is TIGHT');
{
  // YANK_FLOOR answers "can a stranger find a failure" with 1 on every level.
  // STEP_DOWN answers the more informative question — how far the losing region
  // sits from the opening, in the control's own units. Derivations:
  //
  //   level1  i0 110 (rate 120), loses at rate <= 49 = index 39.  110-39 = 71
  //   level2  i0 0, clamped, and the opening ALREADY loses.               = 1
  //   level3  i0 5495 = {70,45}; {70,44} still wins, {70,43} loses.       = 2
  //   level4  i0 42 (rate 102); 101 and 100 win, 99 loses.                = 3
  //   level5  i0 25 (0.30); 0.29 starves fieldA.                          = 1
  //   level6  i0 35 (0.40); 0.39 starves depotA at 23.4 of 24.            = 1
  for (let i = 0; i < ORDER.length; i++) {
    const id = ORDER[i];
    const n = DOWN_TO_REFUSAL[id];
    const found = scan(at(i), STEP_DOWN, REFUSED);
    ok(`${id}: STEP_DOWN is refused at move ${n}`, found.move === n, `${found.move} (stalled ${found.stalled})`);
  }

  // TIGHTNESS. "Refused within N moves" is satisfied by every N' above N, so a
  // bound nobody checked from below measures nothing. For the three levels with
  // a bound above 1, the move BEFORE it must still be winning.
  for (const id of ['level1', 'level3', 'level4']) {
    const n = DOWN_TO_REFUSAL[id];
    const c = at(ORDER.indexOf(id));
    const before = scan(c, STEP_DOWN, () => false, 1, n - 1);
    ok(`${id}: the walk really took ${n - 1} moves`, c.state().moves === n - 1, `${before.moves}`);
    ok(`${id}: at move ${n - 1} it is still FED — the bound is tight, not an upper bound`,
      c.verdict().ok === true, c.verdict().line);
  }
  // The other three have a bound of 1, whose tightness is the zero-move
  // assertion in §4: won is false at zero moves by construction.

  ok(`the worst level takes ${WORST_DOWN_TO_REFUSAL} notches`,
    Math.max(...Object.values(DOWN_TO_REFUSAL)) === WORST_DOWN_TO_REFUSAL);

  // level3's control is a 91x91 GRID flattened into one index, so stepping down
  // walks smelter to its floor and then WRAPS into the previous miner row. It
  // is the one level whose down-walk is NOT monotone, and asserting the
  // re-entry is what stops anyone "simplifying" the scan into "find the first
  // loss, then assume it stays lost".
  //
  //   move 36 -> index 5495-36 = 5459 = 91*59 + 90 -> {miner 69, smelter 100}
  //   achieved = min(69, 100) = 69 >= demand 44 -> a WIN again.
  {
    const c = at(ORDER.indexOf('level3'));
    const lost = scan(c, STEP_DOWN, REFUSED);
    ok('level3: lost at move 2', lost.move === 2, `${lost.move}`);
    const back = scan(c, STEP_DOWN, WON, lost.move + 1);
    ok('level3: STEP_DOWN WINS AGAIN at move 36 — the grid wraps a row',
      back.move === 36, `${back.move}`);
  }
}

// ---------------------------------------------------------------------------
console.log('\n6. CONTROL — the WRONG direction does not find a refusal');
{
  // The ticket's control: if walking the other way found the same thing just as
  // fast, the bound is measuring the domain rather than the direction.
  //
  // It bites on five of six. level2 is the exception and it is pinned rather
  // than skipped, because a skipped case is indistinguishable from a passing
  // one: level2 opens BROKEN, so 'good' (up) and 'cheap' (clamped down) both
  // lose, and neither direction is the wrong one.
  for (let i = 0; i < ORDER.length; i++) {
    const id = ORDER[i];
    const n = DOWN_TO_REFUSAL[id];
    const found = scan(at(i), STEP_UP, REFUSED, 1, n);
    const avoided = found.move === null;
    ok(`${id}: STEP_UP ${UP_AVOIDS_REFUSAL[id] ? 'finds NO refusal' : 'also finds a refusal'} within ${n} move(s)`,
      avoided === UP_AVOIDS_REFUSAL[id], `refused at ${found.move}`);
  }
  // The control must not be quietly disarmed to "no level bites".
  const biting = Object.values(UP_AVOIDS_REFUSAL).filter(Boolean).length;
  ok('the control bites on five of the six levels', biting === 5, `${biting}`);
  ok('...and level2 is the stated exception', UP_AVOIDS_REFUSAL.level2 === false);
  ok('level2 is the only level that opens broken — which is WHY it is the exception',
    Object.entries(OPENS_FED).filter(([, fed]) => !fed).map(([id]) => id).join(',') === 'level2');
}

// ---------------------------------------------------------------------------
console.log('\n7. (b) a win, blind, bounded — and it needs a real CHANGE');
{
  // Four levels open fed with room to move in either direction, so one move
  // wins and the bound is 1. That is not a weak result: `won` requires a
  // setting that differs from the opening one, so 1 is the floor. The
  // interesting levels are the two that cannot do it in the obvious direction —
  // level2, which opens broken, and level1, which opens against the ceiling.
  for (let i = 0; i < ORDER.length; i++) {
    const id = ORDER[i];
    const m = MOVES_TO_WIN[id];
    const c = at(i);
    const found = scan(c, WIN_POLICY[id], WON);
    ok(`${id}: ${WIN_POLICY_NAME[id]} wins at move ${m}`, found.move === m, `${found.move} (stalled ${found.stalled})`);
    ok(`${id}: winning says so in words`, /^✓/.test(c.verdict().line), c.verdict().line);
    ok(`${id}: the winning sentence has no undefined or NaN`, !/undefined|NaN/.test(c.verdict().line), c.verdict().line);
    // The new contract, asserted at the moment of every win rather than once:
    // the setting the player is holding is not the one they were handed.
    const k = c.entry.knob;
    ok(`${id}: and the winning setting is NOT the opening one`,
      k.key(c.state().value) !== k.key(k.start), `${k.key(c.state().value)}`);
  }
  ok(`no level takes more than ${WORST_MOVES_TO_WIN} moves to win`,
    Math.max(...Object.values(MOVES_TO_WIN)) === WORST_MOVES_TO_WIN);

  // ------------------------------------------------------------------ level1
  //
  // THE SHARPEST STATEMENT OF THE NEW RULE IN THE WHOLE SUITE, and the reason
  // the win table needed a policy column. level1 opens at rate 120, the top of
  // its domain, so STEP_UP clamps and every move it makes re-selects 120. The
  // factory is fed the entire time and the level is never won, because the
  // player has changed nothing.
  //
  // Under the OLD rule (`ok && moves > 0`) this walk won at move 1. That is
  // exactly the hole this ticket closed, so the assertion is inverted here
  // rather than deleted — if the clause is ever dropped, this goes red.
  {
    const c = at(ORDER.indexOf('level1'));
    const stuck = scan(c, STEP_UP, WON);
    ok(`level1: CONTROL — STEP_UP never wins in ${SCAN} moves`,
      stuck.move === null && stuck.stalled === null, `${stuck.move}`);
    ok(`level1: ...and all ${SCAN} of those moves were ACCEPTED — it really walked`,
      c.state().moves === SCAN, `${c.state().moves}`);
    ok('level1: ...and it was FED the whole way — the factory works, nothing was changed',
      c.verdict().ok === true && c.verdict().won === false, c.verdict().line);
    {
      const k = c.entry.knob;
      ok('level1: ...because the clamped setting IS the opening one',
        k.key(c.state().value) === k.key(k.start), `${k.key(c.state().value)}`);
    }
    // And the other direction does win, in one move, which is what makes the
    // control above a statement about the RULE rather than about level1 being
    // unwinnable.
    const down = at(ORDER.indexOf('level1'));
    const won = scan(down, STEP_DOWN, WON);
    ok('level1: STEP_DOWN wins at move 1 — rate 119, still fed', won.move === 1, `${won.move}`);
  }

  // ------------------------------------------------------------------ level2
  //
  // The mirror-image case: level2 is the only level where the wrong direction
  // never wins for a FEASIBILITY reason rather than a clamping one.
  {
    const i = ORDER.indexOf('level2');
    const up = scan(at(i), STEP_UP, WON);
    ok('level2: STEP_UP reaches golden and wins at move 2', up.move === 2, `${up.move}`);

    const c = at(i);
    const half = scan(c, STEP_UP, WON, 1, 1);
    ok('level2: ...and move 1 (good, 48 against 50) does NOT win — the bound is tight',
      half.move === null && c.verdict().ok === false, c.verdict().line);

    const down = scan(at(i), STEP_DOWN, WON);
    ok(`level2: CONTROL — STEP_DOWN never wins in ${SCAN} moves, it is clamped on cheap`,
      down.move === null && down.stalled === null, `${down.move}`);
  }
}

// ---------------------------------------------------------------------------
console.log('\n8. (c) the whole campaign is completable, blind, and it terminates');
{
  // One player, one blind stepping policy per level, the whole game. No
  // searching, no restarts, no knowledge of which setting wins. The policy
  // varies by level and only because of the domain's SHAPE (level1 opens
  // against its ceiling, so it has to step down) — never because of an outcome,
  // which §2 and §3 hold each policy to individually.
  const c = new Campaign();
  c.start();
  const visited = [];
  let total = 0;

  // Bounded rather than "while not finished": if ORDER or next() were ever
  // wrong, a while loop would HANG, and a gate that hangs is worse than one
  // that goes red.
  for (let i = 0; i < ORDER.length; i++) {
    const id = c.state().id;
    visited.push(id);
    ok(`${id}: entered at zero moves`, c.state().moves === 0, `${c.state().moves}`);

    const found = scan(c, WIN_POLICY[id], WON);
    ok(`${id}: won blindly in ${MOVES_TO_WIN[id]} move(s) of ${WIN_POLICY_NAME[id]}`,
      found.move === MOVES_TO_WIN[id], `${found.move}`);
    // Every one of those moves is now a real change: the level was left on a
    // setting the player was not handed. Without this the seven below is once
    // again a count of nudges.
    {
      const k = c.entry.knob;
      ok(`${id}: ...and left on a setting that is not the opening one`,
        k.key(c.state().value) !== k.key(k.start), `${k.key(c.state().value)}`);
    }
    total += found.move === null ? 0 : found.move;

    const advanced = c.next();
    if (i < ORDER.length - 1) {
      ok(`${id}: next() offered exactly one next level`, advanced === ORDER[i + 1], `${advanced}`);
    } else {
      ok('the last level: next() returns null rather than a seventh', advanced === null, `${advanced}`);
      ok('the last level: finished latched', c.state().finished === true);
      ok('the last level: it did NOT wrap to the first', c.state().id === ORDER[ORDER.length - 1], c.state().id);
      ok('the last level: a further next() is still null', c.next() === null);
    }
  }

  ok('the blind player visited every level exactly once, in ORDER',
    visited.join(',') === ORDER.join(','), visited.join(','));
  ok(`the whole six-level campaign is completable in ${MOVES_TO_FINISH_THE_GAME} blind moves`,
    total === MOVES_TO_FINISH_THE_GAME, `${total}`);
  ok('...which is the sum of the per-level bounds, not a number of its own',
    total === ORDER.reduce((s, id) => s + MOVES_TO_WIN[id], 0));
  // The number did not move — seven before the win rule changed and seven
  // after — and that is the point rather than a coincidence worth hiding.
  // What changed is what the seven are MADE OF: five of them used to be a
  // control nudged and the level accepted as handed over, and on level1 the
  // winning move was re-selecting the rate it opened on. All seven are now
  // settings the player was not given, which the per-level assertion above
  // checks one at a time.
}

console.log('');
if (failed) { console.log(`✗ playthrough selftest: ${failed} failing\n`); process.exit(1); }
console.log('✓ playthrough selftest passed\n');

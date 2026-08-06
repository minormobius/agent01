#!/usr/bin/env node
// Gate for plant/summon-view.js — the summon panel's sentences and its plan.
//
// WHY THIS FILE EXISTS AND index-summon-wiring.selftest.mjs DOES NOT SUFFICE.
// While the sentences lived inside index.html the only reachable check was a
// regex over the page text: six table entries exist, and their bodies differ.
// That is a real check and it is blind to the thing that matters — a sentence
// reading "1.50 m" while the verdict says 2.30 m passes it perfectly. So:
//
//   EVERY NUMBER A SENTENCE PRINTS IS EXTRACTED BACK OUT OF IT WITH A
//   CLAUSE-SPECIFIC REGEX AND COMPARED TO THE FIELD IT CAME FROM.
//
// `line.includes(String(x))` is deliberately NOT used anywhere here. It passes
// for a renderer that hardcodes the threshold (right for one fixture, wrong for
// every other), and it passes on a substring of an unrelated number — "11.50"
// contains "1.50". The method is the one the ledger established for
// level-view.js's refusalLine: parse the clause, recompute the expected value
// from the refusal, compare within the rounding the formatter is allowed.
//
// AND THE THRESHOLD CHECK IS ARMED. Section 1 runs a session whose
// `minSeedGap` is 2.3 rather than the default 1.5, precisely so that a
// renderer with the threshold typed into its prose prints 1.50 and FAILS. A
// gate run only at the default value cannot tell the two apart, which is why
// that section carries its own control asserting the two numbers differ.
//
// EVERY VERDICT COMES FROM A REAL SESSION. `startSession` on a fixed seed with
// the MACRO fixture (`DEFAULT_POCKET`) — the same pocket foamworld.selftest,
// placement.selftest and multi-insert.selftest already plant into. The two
// branches a session CANNOT produce (a refusal with no refusals in it, and an
// unknown blame) are exercised at the very end from hand-built objects, under
// a heading that says so.
//
// Run: node plant/test/summon-view.selftest.mjs

import { SummonSession, startSession, BLAME } from '../summon-session.mjs';
import { hullBounds, MIN_SEED_GAP } from '../placement.mjs';
import {
  summonSentence, planShapes, toPlan, PLAN, WALL_WORDS, BLAME_SENTENCE,
} from '../summon-view.js';

let failed = 0;
const ok = (name, cond, detail = '') => {
  if (cond) { console.log(`  ✓ ${name}`); return; }
  failed++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`);
};

// `m()` renders with toFixed(2), so a printed number may differ from the real
// one by up to half of the last place. Anything looser would stop the check
// discriminating; anything tighter would fail on correct rounding.
const ROUND = 0.0051;
const close = (a, b) => Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= ROUND;

// Every sentence produced anywhere in this file lands here, and section 8
// sweeps the lot for the two words a template literal emits when a field is
// missing. A missing field leaves the prose around it intact, so every other
// assertion in the file would still pass.
const ALL = [];
const said = (res) => { const s = summonSentence(res); ALL.push(s); return s; };

const SEED = 2;             // the seed placement.selftest.mjs already proves plantable
const ODD_GAP = 2.3;        // deliberately NOT MIN_SEED_GAP — see the header

console.log('\n0. the fixture: a real MACRO pocket, driven through a real session');
const A = startSession(SEED);
const bA = hullBounds(A.pocket);
ok('the session started and dug a pocket', A.pocket !== null && A.pocket.seeds.length > 0,
  `${A.pocket ? A.pocket.seeds.length : 0} seeds`);
ok('nothing is planted yet, so every seed belongs to the generator',
  A.state().plantedCount === 0 && A.originCount === A.pocket.seeds.length);

// Candidates with room to spare. `clear` is anisotropic metres from EVERY
// constellation seed to the nearest pocket seed, so 3.5 buys two things used
// below: an offset probe point whose nearest seed is provably the one we mean,
// and a tiny constellation that cannot reach the foam at all.
const CANDS = A.candidates({ clear: 3.5, step: 6, limit: 40 });
ok('the sweep found comfortable candidate centres to build the rest of the gate on',
  CANDS.list.length >= 2, `found ${CANDS.found}, listed ${CANDS.list.length}`);
if (CANDS.list.length < 2) {
  console.log('\n✗ summon-view selftest: no usable fixture — the sections below cannot run\n');
  process.exit(1);
}

// ---------------------------------------------------------------------------
console.log('\n1. blame "pocket" — and the seed gap in the sentence is NOT hardcoded');
{
  // A second session on the SAME seed (start() is deterministic in it) with an
  // unusual refusal radius. Its preview honours `minSeedGap`, so `need` is 2.3
  // here and a renderer printing 1.50 is caught. `place()` would not work for
  // this — the kernel's own threshold is fixed — which is why this section
  // uses preview only.
  const B = new SummonSession({ minSeedGap: ODD_GAP });
  B.start(SEED);
  const b = hullBounds(B.pocket);
  const inner = B.pocket.seeds.filter((s) =>
    s[0] >= b.x[0] + 4 && s[0] <= b.x[1] - 4
    && s[1] >= b.y[0] + 2 && s[1] <= b.y[1] - 2
    && s[2] >= b.z[0] + 4 && s[2] <= b.z[1] - 4);
  ok('the fixture has a comfortably interior pocket seed to stand next to',
    inner.length >= 1, `${inner.length} of ${B.pocket.seeds.length}`);

  const target = inner[0];
  const res = B.preview([target[0] + 0.43, target[1], target[2]]);
  const line = said(res);
  const rf = res.first;

  ok('standing next to generated foam is refused', res.ok === false);
  ok('the refusal is a seed collision blamed on the POCKET, not on the player',
    rf && rf.reason === 'seed' && rf.blame === 'pocket',
    rf ? `${rf.reason}/${rf.blame}` : 'no refusal');
  ok('nothing has been planted, so no player seed could possibly be the culprit',
    B.state().plantedCount === 0);

  const mm = line.match(/^✗ There is already rock there — ([\d.]+) m to the nearest of it, and a summon needs ([\d.]+) m of clear ground\.$/);
  ok('the pocket sentence is produced and has the shape the clause expects', !!mm, line);
  if (mm) {
    ok('the gap printed is the gap the refusal measured', close(Number(mm[1]), rf.gap),
      `printed ${mm[1]}, verdict ${rf.gap}`);
    ok('the requirement printed is the refusal own `need`', close(Number(mm[2]), rf.need),
      `printed ${mm[2]}, verdict ${rf.need}`);
  }

  // The control on the control: without this the assertion above is satisfied
  // by a renderer with 1.5 typed into it, because at the default threshold the
  // two values coincide.
  ok('CONTROL: this session really is running a non-default threshold, so a hardcoded one would fail here',
    rf && rf.need === ODD_GAP && Math.abs(ODD_GAP - MIN_SEED_GAP) > 0.5,
    `need=${rf ? rf.need : '?'} default=${MIN_SEED_GAP}`);
}

// ---------------------------------------------------------------------------
console.log('\n2. blame "hull" — the wall is named from the refusal, not chosen by the prose');
{
  // Only x is out of bounds, so `hullViolation` names B4 and its depth is the
  // whole of the error. The centre is summon seed 0, so this refusal is first
  // in the list whatever the neighbours do.
  const pt = [bA.x[0] - 0.87, (bA.y[0] + bA.y[1]) / 2, (bA.z[0] + bA.z[1]) / 2];
  const res = A.preview(pt);
  const line = said(res);
  const rf = res.first;

  ok('a centre outside the placeable box is refused', res.ok === false);
  ok('the refusal is a hull violation on the west wall',
    rf && rf.reason === 'hull' && rf.blame === 'hull' && rf.wall === 'B4',
    rf ? `${rf.reason}/${rf.blame}/${rf.wall}` : 'no refusal');

  const mm = line.match(/^✗ Part of the (\S+) pushes out through (.+), by ([\d.]+) m\. Bring it back inside\.$/);
  ok('the hull sentence is produced and has the shape the clause expects', !!mm, line);
  if (mm) {
    ok('the solid named is the one being summoned', mm[1] === res.solid, `${mm[1]} vs ${res.solid}`);
    // Derived from the module's own table rather than typed here, so a renamed
    // wall cannot pass by both files being wrong in the same way.
    ok('the wall words are the ones WALL_WORDS gives for the refusal id',
      mm[2] === WALL_WORDS[rf.wall], `${mm[2]} vs ${WALL_WORDS[rf.wall]}`);
    ok('the depth printed is the depth the refusal measured', close(Number(mm[3]), rf.depth),
      `printed ${mm[3]}, verdict ${rf.depth}`);
  }
}

// ---------------------------------------------------------------------------
console.log('\n3. blame "self" — a summon too small to hold itself apart');
{
  // WHY THIS FIXTURE AND NOT A CONVENIENT ONE. legalSummon reports refusals in
  // a fixed order: metric, then per-seed hull/seed by summon index, then self
  // pairs. So a self-collision test run at a point that ALSO fouls a pocket
  // seed silently tests something else. Two facts make this point safe:
  //
  //   · a constellation seed sits at centre + r x (a vector that does not
  //     depend on r), so the r=0.4 shape is a convex combination of the centre
  //     and the r=1.6 shape the sweep already found legal — and the hull is a
  //     box, hence convex. No hull refusal is possible.
  //   · a neighbour is at most 2 r sqrt(aniso) anisotropic metres from the
  //     centre, which is under 1.2 here; the centre is 3.5 clear; so every seed
  //     is over 2.3 from any pocket seed and no seed refusal is possible.
  const centre = CANDS.list[0].centre;
  const res = A.preview(centre, { r: 0.4 });
  const line = said(res);
  const rf = res.first;

  ok('a summon smaller than its own refusal radius is refused', res.ok === false);
  ok('and it is refused for fighting ITSELF, not for what is around it',
    rf && rf.reason === 'self' && rf.blame === 'self',
    rf ? `${rf.reason}/${rf.blame}` : 'no refusal');
  ok('CONTROL: the same centre at the normal size is legal, so the fixture is about r and nothing else',
    A.preview(centre).ok === true);

  const mm = line.match(/^✗ This (\S+) is too small to hold itself apart — two of its own points are ([\d.]+) m too close\. No spot would fix that\.$/);
  ok('the self sentence is produced and has the shape the clause expects', !!mm, line);
  if (mm) {
    ok('the solid named is the one being summoned', mm[1] === res.solid, `${mm[1]} vs ${res.solid}`);
    // The sentence prints a SHORTFALL, not the gap — so this is the one clause
    // whose number is arithmetic on two fields rather than a copy of one.
    ok('the shortfall printed is need minus gap, recomputed from the refusal',
      close(Number(mm[2]), rf.need - rf.gap),
      `printed ${mm[2]}, verdict ${rf.need} - ${rf.gap} = ${rf.need - rf.gap}`);
    ok('CONTROL: the shortfall is NOT the gap and NOT the need, so copying either would fail',
      !close(rf.need - rf.gap, rf.gap) && !close(rf.need - rf.gap, rf.need),
      `gap=${rf.gap} need=${rf.need}`);
  }
}

// ---------------------------------------------------------------------------
console.log('\n4. blame "caller" — no spot chosen yet');
{
  const res = A.preview(null);
  const line = said(res);
  ok('a missing point is refused rather than guessed at', res.ok === false);
  ok('and it is blamed on the caller, which is a bug and not a move',
    res.first && res.first.reason === 'point' && res.first.blame === 'caller',
    res.first ? `${res.first.reason}/${res.first.blame}` : 'no refusal');
  const mm = line.match(/^✗ Pick a spot on the plan first — there is nowhere to put the (\S+) yet\.$/);
  ok('the caller sentence is produced and has the shape the clause expects', !!mm, line);
  if (mm) ok('the solid named is the selected one', mm[1] === A.solid, `${mm[1]} vs ${A.solid}`);
  ok('this clause has no numbers to verify, and that is a property of the clause rather than a gap in the gate',
    !/[\d]/.test(line.replace(/^✗ /, '')), line);
}

// ---------------------------------------------------------------------------
console.log('\n5. a summon lands — and then blame "player" becomes reachable');
let landed = null;
{
  for (const c of CANDS.list.slice(0, 3)) {
    const r = A.place(A.solid, c.centre);
    ALL.push(summonSentence(r));
    if (r.ok) { landed = r; break; }
  }
  ok('a constellation actually planted into the real pocket', landed !== null,
    'three preview-legal candidates all refused at the rebuild');
}

if (landed) {
  const line = ALL[ALL.length - 1];
  const mm = line.match(/^✓ the (\S+) landed — (\d+) seeds, move (\d+)$/);
  ok('the success sentence is produced and has the shape the clause expects', !!mm, line);
  if (mm) {
    ok('the solid named is the one that landed', mm[1] === landed.solid);
    ok('the seed count printed is the number actually planted',
      Number(mm[2]) === landed.planted.length, `${mm[2]} vs ${landed.planted.length}`);
    ok('the move number printed is the session move number',
      Number(mm[3]) === landed.move, `${mm[3]} vs ${landed.move}`);
  }

  console.log('\n5b. blame "player" — the same collision, completely different news');
  // The planted centre is `landed.centre`; offsetting along x only means the
  // anisotropic gap is exactly the offset (aniso scales y alone). The centre
  // was 3.5 clear of the foam and its own neighbours sit 3.2 away, so the
  // nearest seed to this probe is provably the one the player just planted.
  const probe = [landed.centre[0] + 0.37, landed.centre[1], landed.centre[2]];
  const res = A.preview(probe);
  const pl = said(res);
  const rf = res.first;

  ok('standing on top of your own summon is refused', res.ok === false);
  ok('the refusal is blamed on the PLAYER and names which of their moves did it',
    rf && rf.reason === 'seed' && rf.blame === 'player'
    && rf.blameMove === landed.move && rf.blameSolid === landed.solid,
    rf ? `${rf.reason}/${rf.blame}/move ${rf.blameMove}/${rf.blameSolid}` : 'no refusal');

  const pm = pl.match(/^✗ Too close to the (\S+) you summoned on move (\d+) — ([\d.]+) m apart, and it needs ([\d.]+) m\.$/);
  ok('the player sentence is produced and has the shape the clause expects', !!pm, pl);
  if (pm) {
    ok('the solid named is the one the PLAYER built, not the one being summoned',
      pm[1] === rf.blameSolid, `${pm[1]} vs ${rf.blameSolid}`);
    ok('the move named is the refusal own blameMove', Number(pm[2]) === rf.blameMove,
      `${pm[2]} vs ${rf.blameMove}`);
    ok('the gap printed is the gap the refusal measured', close(Number(pm[3]), rf.gap),
      `printed ${pm[3]}, verdict ${rf.gap}`);
    ok('the requirement printed is the refusal own `need`', close(Number(pm[4]), rf.need),
      `printed ${pm[4]}, verdict ${rf.need}`);
  }

  // The pair the whole panel exists for. Same reason code, same two numbers,
  // and a player must be told two different things.
  const pocketLine = ALL.find((s) => s.startsWith('✗ There is already rock there'));
  ok('"player" and "pocket" render as genuinely different news', pocketLine && pocketLine !== pl);
}

// ---------------------------------------------------------------------------
console.log('\n6. blame "foam" — reachability, stated out loud');
{
  let foamRes = null;
  let probes = 0;
  if (landed) {
    for (const c of CANDS.list.slice(3, 5)) {
      probes++;
      const r = A.place(A.solid, c.centre);
      ALL.push(summonSentence(r));
      if (!r.ok && r.refusal && r.refusal.blame === 'foam') { foamRes = r; break; }
    }
  }

  if (foamRes) {
    const line = summonSentence(foamRes);
    ok('a closure/nav refusal was reached on this fixture and renders as the foam sentence',
      /^✗ The foam would not close around the (\S+) there\./.test(line), line);
  } else {
    console.log(`  ! NOT REACHED: blame "foam" did not occur in ${probes} real place() attempts.`);
    console.log('    This is not a skip and it is not a pass. A closure or nav refusal happens');
    console.log('    inside the rebuild and is not decidable beforehand — placement.mjs says so');
    console.log('    in its header — so no fixture can be CONSTRUCTED to force one, and probing');
    console.log('    for it costs a full lattice rebuild per attempt.');
    console.log('    What is checked below instead is structural only: the clause exists, it is');
    console.log('    distinct, and it renders. Its numbers are NOT verified — because it has');
    console.log('    none. That is the one clause in the table with nothing to extract, which is');
    console.log('    why the loss from not reaching it is smaller than it looks.');
    const synth = summonSentence({
      ok: false, solid: A.solid, refusals: [{ blame: 'foam', reason: 'closure' }],
      first: { blame: 'foam', reason: 'closure' },
    });
    ALL.push(synth);
    ok('the foam clause exists and is a function', typeof BLAME_SENTENCE.foam === 'function');
    ok('rendered from a synthetic closure refusal it names the solid and carries no number',
      /^✗ The foam would not close around the (\S+) there\./.test(synth)
      && synth.includes(A.solid) && !/\d/.test(synth), synth);
  }
}

// ---------------------------------------------------------------------------
console.log('\n7. every blame in BLAME has a distinct clause, and the sweep produced most of them');
{
  ok('BLAME is non-empty', Array.isArray(BLAME) && BLAME.length > 0);
  for (const b of BLAME) {
    ok(`blame "${b}" has a clause`, typeof BLAME_SENTENCE[b] === 'function');
  }
  // Rendered against one common refusal so the comparison is about the WORDS
  // rather than about which fields each blame happens to carry.
  const probe = { blame: null, gap: 0.5, need: 1.5, depth: 0.5, wall: 'B4', blameMove: 1, blameSolid: 'cube' };
  const res = { ok: false, solid: 'cube' };
  const seen = new Map();
  let dup = null;
  for (const b of BLAME) {
    const s = BLAME_SENTENCE[b]({ ...probe, blame: b }, res);
    if (seen.has(s)) dup = `${seen.get(s)} and ${b}`;
    seen.set(s, b);
  }
  ok('no two blames render the same sentence', dup === null, dup ? `${dup} share a sentence` : '');
}

// ---------------------------------------------------------------------------
console.log('\n8. the sweep: no sentence anywhere says "undefined" or "NaN"');
{
  // A wide preview sweep, deliberately including points outside the box and
  // points on top of foam, so the sentences under test are the ones a player
  // would actually generate by dragging around.
  const N = 6;
  for (let i = 0; i < N; i++) {
    for (let j = 0; j < N; j++) {
      const x = bA.x[0] - 3 + (i / (N - 1)) * (bA.x[1] - bA.x[0] + 6);
      const z = bA.z[0] - 3 + (j / (N - 1)) * (bA.z[1] - bA.z[0] + 6);
      said(A.preview([x, (bA.y[0] + bA.y[1]) / 2, z]));
    }
  }
  said(null);
  // Also every pocket seed, standing right on it — the densest source of
  // seed refusals there is.
  for (const s of A.pocket.seeds.slice(0, 24)) said(A.preview(s.slice()));

  ok('the sweep produced a lot of sentences', ALL.length >= 60, `${ALL.length}`);
  const bad = ALL.filter((s) => /undefined|NaN/.test(s));
  ok('not one sentence contains "undefined" or "NaN"', bad.length === 0,
    bad.slice(0, 3).join(' | '));
  const empty = ALL.filter((s) => typeof s !== 'string' || s.trim().length === 0);
  ok('not one sentence is empty', empty.length === 0);
  const unmarked = ALL.filter((s) => s !== 'Click the plan to choose a spot.'
    && !s.startsWith('✓ ') && !s.startsWith('✗ '));
  ok('every verdict line opens with a tick or a cross', unmarked.length === 0,
    unmarked.slice(0, 3).join(' | '));
  ok('the sweep really did produce both outcomes',
    ALL.some((s) => s.startsWith('✓ ')) && ALL.some((s) => s.startsWith('✗ ')));
}

// ---------------------------------------------------------------------------
console.log('\n9. planShapes — the plan is a pure function of the pocket and the cursor');
{
  ok('before a pocket exists there is nothing to draw', planShapes(null, null, [], null, 0).length === 0);
  ok('and without bounds too', planShapes(A.pocket, null, [], null, 0).length === 0);

  const originCount = A.state().originCount;
  const cursor = CANDS.list[0].centre;
  const shapes = planShapes(A.pocket, bA, CANDS.list, cursor, originCount);
  const of = (k) => shapes.filter((s) => s.kind === k);

  ok('the frame is drawn first', shapes[0] && shapes[0].kind === 'frame');
  ok('the frame is inset by one unit on every side',
    shapes[0].x === 1 && shapes[0].y === 1
    && shapes[0].w === PLAN.w - 2 && shapes[0].h === PLAN.h - 2);
  ok('one descriptor per candidate', of('candidate').length === CANDS.list.length);
  ok('one descriptor per pocket seed', of('seed').length === A.pocket.seeds.length);
  ok('exactly one cursor when one is set', of('cursor').length === 1);
  ok('and none when it is not',
    planShapes(A.pocket, bA, CANDS.list, null, originCount).filter((s) => s.kind === 'cursor').length === 0);

  // Paint order: candidates under the seeds, cursor over everything. A plan
  // that draws the cursor first hides it under a seed dot.
  const kinds = shapes.map((s) => s.kind);
  ok('paint order is frame, candidates, seeds, cursor',
    kinds.lastIndexOf('candidate') < kinds.indexOf('seed')
    && kinds.lastIndexOf('seed') < kinds.indexOf('cursor'));

  ok('every coordinate is a finite number',
    shapes.every((s) => s.kind === 'frame'
      || (Number.isFinite(s.cx) && Number.isFinite(s.cy) && Number.isFinite(s.r))));

  // `mine` is the one judgement in planShapes, and it is the one a colour is
  // chosen from. Pinned three ways so it cannot be a constant.
  const seeds = of('seed');
  ok('seed descriptors carry their index in order',
    seeds.every((s, i) => s.index === i));
  ok('exactly the planted seeds are the player own',
    seeds.filter((s) => s.mine).length === A.state().plantedCount
    && A.state().plantedCount > 0, `${seeds.filter((s) => s.mine).length} of ${A.state().plantedCount}`);
  ok('CONTROL: with originCount at the full seed count, nothing is the player own',
    planShapes(A.pocket, bA, [], null, A.pocket.seeds.length)
      .filter((s) => s.kind === 'seed' && s.mine).length === 0);
  ok('CONTROL: with originCount zero, everything is',
    planShapes(A.pocket, bA, [], null, 0)
      .filter((s) => s.kind === 'seed' && s.mine).length === A.pocket.seeds.length);
  ok('the player own seeds are drawn larger than the generator own',
    seeds.filter((s) => s.mine).every((s) => s.r === 5)
    && seeds.filter((s) => !s.mine).every((s) => s.r === 4));

  // The coordinate map, checked at the corners where it is EXACT (a/a is
  // exactly 1 in binary floating point, and 0/a is exactly 0), then for
  // monotonicity in between.
  const y = (bA.y[0] + bA.y[1]) / 2;
  const lo = toPlan(bA, [bA.x[0], y, bA.z[0]]);
  const hi = toPlan(bA, [bA.x[1], y, bA.z[1]]);
  ok('the low corner maps exactly to the padding', lo[0] === PLAN.pad && lo[1] === PLAN.pad,
    JSON.stringify(lo));
  ok('the high corner maps exactly to the far padding',
    hi[0] === PLAN.w - PLAN.pad && hi[1] === PLAN.h - PLAN.pad, JSON.stringify(hi));
  const mid = toPlan(bA, [(bA.x[0] + bA.x[1]) / 2, y, (bA.z[0] + bA.z[1]) / 2]);
  ok('the map is increasing in world x and world z',
    mid[0] > lo[0] && mid[0] < hi[0] && mid[1] > lo[1] && mid[1] < hi[1], JSON.stringify(mid));
  ok('world y is not consulted — the plan is a plan',
    toPlan(bA, [12, bA.y[0], 34])[0] === toPlan(bA, [12, bA.y[1], 34])[0]
    && toPlan(bA, [12, bA.y[0], 34])[1] === toPlan(bA, [12, bA.y[1], 34])[1]);

  // Recomputed from a different direction: the descriptor coordinate must be
  // toPlan of the seed, not of something near it.
  const k = Math.min(7, A.pocket.seeds.length - 1);
  const expect = toPlan(bA, A.pocket.seeds[k]);
  ok('a seed descriptor sits exactly where toPlan puts that seed',
    seeds[k].cx === expect[0] && seeds[k].cy === expect[1],
    `${seeds[k].cx},${seeds[k].cy} vs ${expect[0]},${expect[1]}`);
  const c0 = of('candidate')[0];
  ok('a candidate descriptor sits exactly where toPlan puts its centre',
    c0.cx === toPlan(bA, CANDS.list[0].centre)[0]
    && c0.cy === toPlan(bA, CANDS.list[0].centre)[1]);
  ok('a candidate carries the world point it came from, so a click can be mapped back',
    Array.isArray(c0.at) && c0.at.length === 3
    && c0.at.every((v, i) => v === CANDS.list[0].centre[i]));
  ok('and it is a COPY — mutating the descriptor cannot corrupt the session',
    (() => { c0.at[0] = -999; return CANDS.list[0].centre[0] !== -999; })());
}

// ---------------------------------------------------------------------------
console.log('\n10. two branches a session cannot produce — hand-built, and labelled as such');
{
  // Everything above drives a real session on purpose. These two cannot be
  // reached that way: `summon-session.mjs` always attributes a blame, and it
  // never returns ok:false with an empty refusal list. They are the fallbacks
  // that keep a bug from rendering as a blank line, so they are worth pinning
  // even though no fixture can arrive at them.
  const none = summonSentence({ ok: false, solid: 'cube', refusals: [], first: null });
  ok('a refusal with nothing in it says so rather than rendering blank',
    none.startsWith('✗ ') && none.length > 20 && !/undefined|NaN/.test(none), none);
  const weird = summonSentence({ ok: false, solid: 'cube', first: { blame: 'zzz-not-a-blame' } });
  ok('an unknown blame falls back to a plain sentence naming the solid',
    weird.startsWith('✗ ') && weird.includes('cube') && !/undefined|NaN/.test(weird), weird);
  ok('the resting state has its own line', summonSentence(null) === 'Click the plan to choose a spot.');
  ok('a preview that fits reads as an invitation, not as a landing',
    /^✓ the \S+ fits here — press summon$/.test(summonSentence({
      ok: true, solid: 'cube', pocketChanged: false,
    })), summonSentence({ ok: true, solid: 'cube', pocketChanged: false }));
}

console.log('');
if (failed) { console.log(`✗ summon-view selftest: ${failed} failing\n`); process.exit(1); }
console.log(`✓ summon-view selftest passed — ${ALL.length} sentences rendered from a real session\n`);

#!/usr/bin/env node
// Known-answer tests for plant/campaign.mjs — the six levels as one game.
//
// House style matches plant/test/level1.selftest.mjs and the rest of the level
// gates: every number is checked against a value computed BY HAND from the
// level literals, not against whatever the module happened to return, and every
// positive is paired with a CONTROL that must fail.
//
// The two assertions this file exists for are the ORDER ones. A gate that only
// drives next() six times passes for a campaign ordered alphabetically; pinning
// the order as a literal AND asserting the measure it came from is strictly
// decreasing is what turns "1, 3, 2, 5, 6 is roughly the curve" from an opinion
// into a fact with a derivation attached. If a level is ever retuned so that it
// changes place in the campaign, THIS FILE GOES RED — deliberately. Reordering
// the game is a design decision and it should cost someone a conversation with
// a test, not happen silently on the next import.
//
// Run: node plant/test/campaign.selftest.mjs

import {
  LEVELS, ORDER, WIN_FRACTION, BANNED, INTRO, Campaign,
  entryOf, buildNetwork, grade, winFraction, byDifficulty, knob,
} from '../campaign.mjs';
import { feasible } from '../production.mjs';

let failed = 0;
const ok = (name, cond, detail = '') => {
  if (cond) { console.log(`  ✓ ${name}`); return; }
  failed++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`);
};
const throws = (fn) => { try { fn(); return false; } catch { return true; } };

// ---------------------------------------------------------------------------
console.log('\n1. the six entries, and every knob is a finite declared domain');
{
  ok('six levels', LEVELS.length === 6, `${LEVELS.length}`);
  ok('ids are unique', new Set(LEVELS.map((e) => e.id)).size === 6);

  for (const e of LEVELS) {
    ok(`${e.id}: has a title and a base network`, !!e.title && Array.isArray(e.base.nodes));
    ok(`${e.id}: samples is a non-empty array`, Array.isArray(e.knob.samples) && e.knob.samples.length > 0);
    ok(`${e.id}: apply is a function`, typeof e.knob.apply === 'function');
    // The module throws at import if this is false, so reaching this line at
    // all is most of the proof; asserting it keeps the invariant visible.
    ok(`${e.id}: the opening setting is itself in the domain`, e.knob.keys.has(e.knob.key(e.knob.start)));
    // Purity of the with* helpers is asserted for real in §13, against the
    // shipped numbers — a round-trip through JSON here would compare a value
    // with itself and could never fail.
  }
  ok('an unknown id throws rather than reading as an empty game', throws(() => entryOf('level7')));
}

// ---------------------------------------------------------------------------
console.log('\n2. every blurb is one sentence a stranger can read (f)');
{
  for (const e of LEVELS) {
    // One sentence: no internal terminal punctuation, exactly one at the end.
    ok(`${e.id}: blurb is one sentence`, /^[^.!?]+[.]$/.test(e.blurb), e.blurb);
    const lower = e.blurb.toLowerCase();
    const hit = BANNED.find((w) => lower.includes(w));
    ok(`${e.id}: blurb uses none of the banned words`, hit === undefined, hit);
  }
  // CONTROL — the check can actually fail. Without this, a broken BANNED array
  // (empty, or a typo in every entry) would pass the six assertions above and
  // look exactly like a clean bill of health.
  const sample = 'This level is about the feasibility margin.';
  ok('CONTROL: the banned-word check rejects a blurb that uses them',
    BANNED.some((w) => sample.toLowerCase().includes(w)));
  ok('CONTROL: the one-sentence check rejects two sentences',
    !/^[^.!?]+[.]$/.test('One thing. Then another.'));
}

// ---------------------------------------------------------------------------
console.log('\n2b. INTRO — the first screen, and it must survive a reordering');
{
  // The blurb rules, applied to the one piece of text that is not a level's.
  ok('INTRO has a non-empty title', typeof INTRO.title === 'string' && INTRO.title.trim().length > 0, INTRO.title);
  ok('INTRO has a non-empty sentence', typeof INTRO.blurb === 'string' && INTRO.blurb.trim().length > 0, INTRO.blurb);
  ok('INTRO is one sentence', /^[^.!?]+[.]$/.test(INTRO.blurb), INTRO.blurb);
  const introText = `${INTRO.title} ${INTRO.blurb}`.toLowerCase();
  const banned = BANNED.find((w) => introText.includes(w));
  ok('INTRO uses none of the banned words', banned === undefined, banned);

  // ORDER is computed, so the first screen a stranger meets can change when a
  // level is retuned. Text that names a level, or counts them, would silently
  // become wrong on that import — these two are the reordering guards and they
  // are the reason this section exists at all.
  const named = LEVELS.map((e) => e.id).find((id) => introText.includes(id.toLowerCase()));
  ok('INTRO names no level id', named === undefined, named);

  // Digits, and the spelled-out counts and positions that a digit check misses.
  // Word boundaries on purpose: "everything" must not read as "ten".
  //
  // DELIBERATELY STRICTER THAN THE HAZARD. The thing that expires is counting
  // LEVELS, and nothing here can tell "six levels" from "one setting" — so both
  // are refused and the intro is phrased around it. index.html's own hand-typed
  // intro would fail this. If you are here because a sentence you like was
  // rejected, reword the sentence or change this list ON PURPOSE and say why;
  // do not delete the assertion, which is the one move that makes the check
  // stop meaning anything while still printing a tick.
  const COUNT_WORDS = [
    'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten',
    'first', 'second', 'third',
  ];
  const countRe = new RegExp(`\\d|\\b(${COUNT_WORDS.join('|')})\\b`, 'i');
  ok('INTRO counts nothing — no digit, no spelled-out count or position',
    !countRe.test(introText), (introText.match(countRe) || [])[0]);

  // CONTROLS. Every check above is a NEGATIVE assertion over one short string,
  // and a negative passes for a broken matcher exactly as loudly as for clean
  // text — an empty BANNED array, a typo in the regex, a level-id list that
  // came back empty. Each control feeds the same predicate something that MUST
  // be caught, so a matcher that can no longer catch anything fails here first.
  ok('CONTROL: the banned-word check would reject an intro that used them',
    BANNED.some((w) => 'we compute the feasibility margin.'.includes(w)));
  ok('CONTROL: the level-id check would reject an intro naming one',
    LEVELS.map((e) => e.id).some((id) => `start on ${id} and work down.`.includes(id)));
  ok('CONTROL: the count check rejects a digit', countRe.test('there are 6 puzzles.'));
  ok('CONTROL: the count check rejects a spelled-out count', countRe.test('there are six puzzles.'));
  ok('CONTROL: the count check rejects an ordinal', countRe.test('the first one is easiest.'));
  // ...and does NOT reject an ordinary word that merely contains a count word.
  // Without this, tightening the regex to a bare substring test would pass every
  // assertion above while making the check unusable for any real sentence.
  ok('CONTROL: the count check does not fire on "everything" or "stone"',
    !countRe.test('everything downstream is stone.'));

  // The intro is not a seventh level: it must not collide with a level's own
  // words, or the page would show the same title twice on the opening screen.
  ok('INTRO.title is not one of the level titles',
    !LEVELS.some((e) => e.title === INTRO.title), INTRO.title);
  ok('INTRO.blurb is not one of the level blurbs',
    !LEVELS.some((e) => e.blurb === INTRO.blurb));
}

// ---------------------------------------------------------------------------
console.log('\n3. LEVEL_1 — domain 10..120 step 1; win iff min(capacity 51, rate) >= demand 50');
{
  const e = entryOf('level1');
  ok('domain is the 111 integer rates the page offers', e.knob.samples.length === 111);
  // scale = min(capacity 51, supply/inputRate 1) so achieved = min(51, rate).
  ok('rate 49 loses (achieved 49 < 50)', grade(e, 49).ok === false);
  ok('rate 50 wins (achieved exactly 50, the boundary is inclusive)', grade(e, 50).ok === true);
  ok('rate 50 achieved is exactly 50', Math.abs(grade(e, 50).achieved.depot - 50) < 1e-12);
  ok('rate 120 wins and is capacity-bound at 51, not supply-bound',
    Math.abs(grade(e, 120).achieved.depot - 51) < 1e-12);
  // wins are the rates 50..120 inclusive = 71 of 111.
  ok('win fraction is 71/111', WIN_FRACTION.level1 === 71 / 111, `${WIN_FRACTION.level1}`);
}

console.log('\n4. LEVEL_2 — three buttons; only the golden smelter feeds the depot');
{
  const e = entryOf('level2');
  ok('domain is the three shipped options', e.knob.samples.length === 3);
  // cheap  30: scale = min(30, 55) = 30 -> 30 < 50
  // good   48: scale = min(48, 55) = 48 -> 48 < 50
  // golden 90: scale = min(90, 55) = 55 -> 55 >= 50
  ok('cheap loses', grade(e, 'cheap').ok === false);
  ok('good loses (a near miss: 48 against 50)', grade(e, 'good').ok === false);
  ok('good achieved is exactly 48', Math.abs(grade(e, 'good').achieved.depot - 48) < 1e-12);
  ok('golden wins, and is SOURCE-bound at 55 rather than capacity-bound at 90',
    grade(e, 'golden').ok === true && Math.abs(grade(e, 'golden').achieved.depot - 55) < 1e-12);
  ok('win fraction is 1/3', WIN_FRACTION.level2 === 1 / 3, `${WIN_FRACTION.level2}`);
  // The only domain small enough to recompute in the gate without repeating the
  // module's own sweep at cost — ties the exported table to the function.
  ok('winFraction() agrees with the exported table', winFraction(e) === WIN_FRACTION.level2);
}

console.log('\n5. LEVEL_3 — a 91x91 grid; win iff min(miner, smelter) >= demand 44');
{
  const e = entryOf('level3');
  ok('domain is the product of the two sliders (91 x 91)', e.knob.samples.length === 8281);
  // ore (300) never binds, so achieved = min(minerCapacity, smelterCapacity).
  ok('44 x 44 wins (the corner of the winning square)', grade(e, { miner: 44, smelter: 44 }).ok === true);
  ok('43 x 44 loses — the miner is the one that starved', grade(e, { miner: 43, smelter: 44 }).ok === false);
  ok('44 x 43 loses — and now it is the smelter', grade(e, { miner: 44, smelter: 43 }).ok === false);
  ok('44 x 44 achieved is exactly 44', Math.abs(grade(e, { miner: 44, smelter: 44 }).achieved.depot - 44) < 1e-12);
  // wins = both capacities in 44..100 = 57 x 57 = 3249 of 8281.
  ok('win fraction is 3249/8281', WIN_FRACTION.level3 === 3249 / 8281, `${WIN_FRACTION.level3}`);
}

console.log('\n5b. LEVEL_3 is a MULTI-PART knob — two controls over ONE declared domain');
{
  const e = entryOf('level3');
  const k = e.knob;

  ok('the knob declares two parts', Array.isArray(k.parts) && k.parts.length === 2,
    `${k.parts && k.parts.length}`);
  ok('named for the two machines the player moves',
    k.parts.map((p) => p.name).join(',') === 'miner,smelter', String(k.parts.map((p) => p.name)));
  for (const p of k.parts) {
    ok(`${p.name}: 91 integer capacities`, p.samples.length === 91, `${p.samples.length}`);
    ok(`${p.name}: runs 10..100 inclusive`, p.samples[0] === 10 && p.samples[90] === 100);
  }

  // (a) THE DOMAIN DID NOT CHANGE, and this is the assertion the ticket asked
  // for — in the only form that can fail. `samples` is DERIVED from `parts`, so
  // "the product of the parts equals samples" is true by construction and
  // asserting it would relate the module's output to itself. What bites is a
  // product recomputed HERE, from a double loop over literals typed in this
  // file, compared as a SET: that catches a wrong compose, a swapped part
  // order, a truncated part domain and a changed key function alike, none of
  // which the structural version could see.
  const expected = new Set();
  for (let miner = 10; miner <= 100; miner++) {
    for (let smelter = 10; smelter <= 100; smelter++) expected.add(`${miner}x${smelter}`);
  }
  ok('the hand-built expectation is the 91x91 grid', expected.size === 8281, `${expected.size}`);
  // CONTROL — a set that swallowed everything, or one built over the wrong
  // range, would satisfy every comparison below while asserting nothing.
  ok('CONTROL: the expectation excludes settings outside 10..100',
    !expected.has('9x9') && !expected.has('101x100') && !expected.has('44x9'));

  const got = new Set(k.samples.map(k.key));
  ok('the derived domain still holds 8281 settings', k.samples.length === 8281, `${k.samples.length}`);
  ok('...all distinct under the knob’s own key', got.size === k.samples.length, `${got.size}`);
  ok('...and it is EXACTLY the hand-built product, as a set',
    got.size === expected.size && [...expected].every((s) => got.has(s)));

  // ORDER, pinned. The page's control is an INDEX into `samples`, so this is
  // not cosmetic: it is what makes a position mean the same setting before and
  // after this change, and it is the convention `positions()` inverts by
  // arithmetic rather than by searching the tuples.
  ok('samples[0] is the low corner', k.key(k.samples[0]) === '10x10', k.key(k.samples[0]));
  ok('samples[1] moves the LAST part — the odometer order',
    k.key(k.samples[1]) === '10x11', k.key(k.samples[1]));
  ok('samples[91] is where the first part finally moves',
    k.key(k.samples[91]) === '11x10', k.key(k.samples[91]));
  ok('samples[8280] is the high corner', k.key(k.samples[8280]) === '100x100', k.key(k.samples[8280]));

  // compose and positions are inverses in index space — which is the whole
  // contract the page needs, and neither half is useful without the other.
  ok('compose builds a setting from one member of each part',
    k.key(k.compose([44, 45])) === '44x45', k.key(k.compose([44, 45])));
  for (const v of [{ miner: 70, smelter: 45 }, { miner: 10, smelter: 10 },
    { miner: 100, smelter: 100 }, { miner: 44, smelter: 44 }]) {
    const at = k.positions(v);
    ok(`positions(${k.key(v)}) round-trips back through compose`,
      at !== null && k.key(k.compose(k.parts.map((p, i) => p.samples[at[i]]))) === k.key(v),
      JSON.stringify(at));
  }
  // ...and the indices are the ones hand arithmetic gives: 70 is the 61st
  // member of 10..100 and 45 is the 36th, so the flat index is 60*91 + 35.
  ok('positions({miner 70, smelter 45}) is [60, 35]',
    JSON.stringify(k.positions({ miner: 70, smelter: 45 })) === '[60,35]',
    JSON.stringify(k.positions({ miner: 70, smelter: 45 })));
  ok('...which is flat index 5495', k.key(k.samples[5495]) === '70x45', k.key(k.samples[5495]));

  // A non-member has NO position. Returning [0, 0] instead would open both
  // controls at the bottom of their range and read as a legitimate setting —
  // the page would then show a stop that is not where the game is.
  ok('positions of an off-grid setting is null', k.positions({ miner: 44.5, smelter: 44 }) === null);
  ok('positions of null is null rather than a throw', k.positions(null) === null);

  // (b) THE MEASURE MUST NOT MOVE. §5 pins WIN_FRACTION.level3 at 3249/8281
  // against the flat domain; this recounts it by sweeping the two PART domains
  // directly, so a part that quietly offered fewer members would change the
  // fraction here even if `samples.length` somehow still looked right. Roughly
  // 8281 more feasible() calls, which is the same order as the sweep the module
  // already runs at import.
  let wins = 0;
  for (const m of k.parts[0].samples) {
    for (const s of k.parts[1].samples) if (grade(e, { miner: m, smelter: s }).ok) wins++;
  }
  ok('a win count swept over the PARTS reproduces the exported fraction exactly',
    wins / (k.parts[0].samples.length * k.parts[1].samples.length) === WIN_FRACTION.level3,
    `${wins} of 8281`);
  ok('...and it is still the pinned 3249/8281', WIN_FRACTION.level3 === 3249 / 8281);

  ok('exactly one level has parts, so the single-control path is still exercised',
    LEVELS.filter((x) => x.knob.parts).length === 1);
  for (const other of LEVELS.filter((x) => x.id !== 'level3')) {
    ok(`${other.id}: no parts, no compose, no positions`,
      other.knob.parts === null && other.knob.compose === null && other.knob.positions === null);
  }
}

console.log('\n5c. knob() refuses a multi-part declaration that could offer the wrong domain');
{
  const two = [{ name: 'a', samples: [1, 2] }, { name: 'b', samples: [3, 4] }];
  const base = { kind: 'test', start: { a: 1, b: 3 }, apply: (l) => l, key: (v) => `${v.a}x${v.b}` };

  ok('a well-formed multi-part knob is accepted', !throws(() => knob({ ...base, parts: two })));
  ok('...and derives all four combinations', knob({ ...base, parts: two }).samples.length === 4);

  // Requirement (a) ENFORCED rather than checked: two declarations of one
  // domain is the drift, so the declaration is refused instead of reconciled.
  ok('declaring BOTH parts and samples throws',
    throws(() => knob({ ...base, parts: two, samples: [{ a: 1, b: 3 }] })));
  ok('a compose with no parts to compose throws', throws(() => knob({
    kind: 'test', samples: [1, 2], start: 1, apply: (l) => l, compose: (v) => v[0],
  })));
  ok('a part with an empty domain throws',
    throws(() => knob({ ...base, parts: [two[0], { name: 'b', samples: [] }] })));
  ok('a part with no name throws',
    throws(() => knob({ ...base, parts: [two[0], { samples: [3, 4] }] })));
  ok('a single part throws — that is an ordinary knob wearing a costume',
    throws(() => knob({
      kind: 'test', parts: [two[0]], start: { a: 1 }, apply: (l) => l, key: (v) => String(v.a),
    })));
  ok('an opening setting outside the product throws',
    throws(() => knob({ ...base, parts: two, start: { a: 9, b: 9 } })));

  // A key that cannot tell two declared settings apart makes `samples.length` —
  // the DENOMINATOR of every win fraction — count settings the player can never
  // reach, and the play order is computed from those fractions.
  ok('a key function that collides two settings throws', throws(() => knob({
    kind: 'test', samples: [1, 2], start: 1, apply: (l) => l, key: () => 'same',
  })));
  ok('CONTROL: the same declaration with a distinguishing key is accepted',
    !throws(() => knob({ kind: 'test', samples: [1, 2], start: 1, apply: (l) => l })));

  // A setting need not be an object of its part names — `compose` decides, and
  // `positions` inverts whatever it decided.
  const pair = knob({
    kind: 'test', parts: two, start: '1/3', apply: (l) => l,
    compose: (values) => `${values[0]}/${values[1]}`,
  });
  ok('a custom compose decides the setting shape',
    pair.samples.join(',') === '1/3,1/4,2/3,2/4', pair.samples.join(','));
  ok('...and positions still inverts it', JSON.stringify(pair.positions('2/3')) === '[1,0]',
    JSON.stringify(pair.positions('2/3')));
}

console.log('\n6. LEVEL_4 — fan-out; autoSplit fills 0.3/0.7, so win iff rate >= 100');
{
  const e = entryOf('level4');
  ok('domain is the 81 integer rates the page offers', e.knob.samples.length === 81);

  // THE FLAG IS LOAD-BEARING, so prove the failure mode is reachable rather
  // than trusting that it is: the applied level WITHOUT autoSplit is not valid
  // input to feasible() at all.
  const unsplit = e.knob.apply(e.base, 100);
  ok('CONTROL: the applied level without autoSplit is refused by feasible()', throws(() => feasible(unsplit)));
  const split = buildNetwork(e, 100);
  ok('buildNetwork fills the proportional shares (30/100 and 70/100)',
    Math.abs(split.edges.find((x) => x.to === 'stockpileA').share - 0.3) < 1e-12
    && Math.abs(split.edges.find((x) => x.to === 'stockpileB').share - 0.7) < 1e-12);

  // achievedA = rate * 0.3 >= 30 and achievedB = rate * 0.7 >= 70, both at rate 100.
  ok('rate 99 loses (29.7 against a demand of 30)', grade(e, 99).ok === false);
  ok('rate 100 wins — both sinks exactly met', grade(e, 100).ok === true);
  ok('rate 100 feeds stockpileA exactly 30 and stockpileB exactly 70',
    Math.abs(grade(e, 100).achieved.stockpileA - 30) < 1e-12
    && Math.abs(grade(e, 100).achieved.stockpileB - 70) < 1e-12);
  // wins are rates 100..140 inclusive = 41 of 81.
  ok('win fraction is 41/81', WIN_FRACTION.level4 === 41 / 81, `${WIN_FRACTION.level4}`);
}

console.log('\n7. LEVEL_5 — a share with a failure on BOTH sides; win iff shareA in [0.30, 0.50]');
{
  const e = entryOf('level5');
  ok('domain is the 91 shares the page offers', e.knob.samples.length === 91);
  // achievedA = 100*shareA (demand 30), achievedB = 100*(1-shareA) (demand 50).
  ok('0.29 loses — fieldA starves', grade(e, 29 / 100).ok === false);
  ok('0.30 wins — the low edge of the window, fieldA exactly met', grade(e, 30 / 100).ok === true);
  ok('0.50 wins — the high edge, fieldB exactly met', grade(e, 50 / 100).ok === true);
  ok('0.51 loses — and now it is fieldB, the opposite failure', grade(e, 51 / 100).ok === false);
  ok('the two failures name DIFFERENT sinks',
    grade(e, 29 / 100).deficits[0].sinkId === 'fieldA' && grade(e, 51 / 100).deficits[0].sinkId === 'fieldB');
  // wins are the 21 shares 0.30..0.50 of 91.
  ok('win fraction is 21/91', WIN_FRACTION.level5 === 21 / 91, `${WIN_FRACTION.level5}`);
}

console.log('\n8. LEVEL_6 — the same lever against two yields; win iff shareA in [0.40, 0.50]');
{
  const e = entryOf('level6');
  ok('domain is the 91 shares the page offers', e.knob.samples.length === 91);
  // depotA gets 100*shareA*0.6 (demand 24); depotB gets 100*(1-shareA)*1.0 (demand 50).
  ok('0.39 loses — depotA starves (23.4 against 24)', grade(e, 39 / 100).ok === false);
  ok('0.40 wins — depotA exactly met at 24', grade(e, 40 / 100).ok === true
    && Math.abs(grade(e, 40 / 100).achieved.depotA - 24) < 1e-12);
  ok('0.50 wins — depotB exactly met at 50', grade(e, 50 / 100).ok === true
    && Math.abs(grade(e, 50 / 100).achieved.depotB - 50) < 1e-12);
  ok('0.51 loses — depotB starves', grade(e, 51 / 100).ok === false);
  // wins are the 11 shares 0.40..0.50 of 91 — the tightest window in the game.
  ok('win fraction is 11/91', WIN_FRACTION.level6 === 11 / 91, `${WIN_FRACTION.level6}`);
}

// ---------------------------------------------------------------------------
console.log('\n9. ORDER — computed, strictly decreasing, and PINNED (a) (b) (c)');
{
  // (a) exactly the six shipped ids, no duplicates, no extras.
  ok('ORDER holds six ids', ORDER.length === 6, `${ORDER.length}`);
  ok('ORDER has no duplicates', new Set(ORDER).size === 6);
  ok('ORDER is exactly the set of shipped level ids',
    [...ORDER].sort().join(',') === LEVELS.map((e) => e.id).sort().join(','), ORDER.join(','));
  ok('WIN_FRACTION covers exactly those ids',
    Object.keys(WIN_FRACTION).sort().join(',') === LEVELS.map((e) => e.id).sort().join(','));

  // (b) strictly decreasing in the stated measure.
  for (let i = 0; i + 1 < ORDER.length; i++) {
    const a = WIN_FRACTION[ORDER[i]];
    const b = WIN_FRACTION[ORDER[i + 1]];
    ok(`${ORDER[i]} (${a.toFixed(4)}) is strictly easier than ${ORDER[i + 1]} (${b.toFixed(4)})`, a > b);
  }
  ok('no two levels tie, so the tie rule was NOT exercised by the real data',
    new Set(Object.values(WIN_FRACTION)).size === 6);

  // ...which is exactly why the tie rule is tested directly. A rule that never
  // fires is a rule nobody has run, and this one decides the game order the day
  // two levels are retuned to the same difficulty.
  const tied = [{ id: 'zulu', win: 0.5 }, { id: 'alpha', win: 0.5 }].sort(byDifficulty);
  ok('CONTROL: byDifficulty breaks a tie by id ascending', tied[0].id === 'alpha' && tied[1].id === 'zulu');
  ok('CONTROL: byDifficulty puts the higher win fraction first',
    [{ id: 'a', win: 0.1 }, { id: 'b', win: 0.9 }].sort(byDifficulty)[0].id === 'b');

  // (c) the concrete order, pinned. Derived above from the six win fractions:
  //   level1 71/111 = 0.6396 > level4 41/81 = 0.5062 > level3 3249/8281 = 0.3923
  //   > level2 1/3 = 0.3333 > level5 21/91 = 0.2308 > level6 11/91 = 0.1209
  const PINNED = ['level1', 'level4', 'level3', 'level2', 'level5', 'level6'];
  ok('ORDER matches the pinned campaign order', ORDER.join(',') === PINNED.join(','), ORDER.join(','));
}

// ---------------------------------------------------------------------------
console.log('\n10. a scripted playthrough, no browser (d)');
{
  const c = new Campaign();
  c.start();
  ok('start() enters the first level of ORDER', c.state().id === ORDER[0]);
  ok('start() resets the move count', c.state().moves === 0);
  ok('start() is not finished', c.state().finished === false);

  const visited = [];
  for (let i = 0; i < ORDER.length; i++) {
    const id = c.state().id;
    visited.push(id);
    const samples = entryOf(id).knob.samples;

    let used = 0;
    let won = false;
    for (const s of samples) {
      c.move(s);
      used++;
      if (c.verdict().won) { won = true; break; }
    }
    ok(`${id}: a winning setting exists inside the declared domain`, won);
    ok(`${id}: found in at most samples.length (${samples.length}) moves`, used <= samples.length, `${used}`);
    ok(`${id}: winning says so in words`, /^✓/.test(c.verdict().line), c.verdict().line);

    const before = c.state().index;
    const advanced = c.next();
    if (i < ORDER.length - 1) {
      ok(`${id}: next() advanced by exactly one`, c.state().index === before + 1);
      ok(`${id}: next() returned the next id in ORDER`, advanced === ORDER[i + 1], `${advanced}`);
      ok(`${id}: the new level starts at zero moves`, c.state().moves === 0);
    } else {
      ok('the last level: next() returns null', advanced === null, `${advanced}`);
      ok('the last level: finished is set', c.state().finished === true);
      ok('the last level: the index did not move', c.state().index === ORDER.length - 1);
      // The one that matters: it must TERMINATE, not wrap.
      ok('next() again still returns null', c.next() === null);
      ok('...and did not wrap to the first level', c.state().id === ORDER[ORDER.length - 1]);
      ok('...and a move after the end is refused', c.move(entryOf(c.state().id).knob.start).accepted === false);
    }
  }
  ok('the playthrough visited every level exactly once, in ORDER', visited.join(',') === ORDER.join(','));
}

// ---------------------------------------------------------------------------
console.log('\n11. a refusal the player caused, in ONE move, on every level (e)');
{
  // Vision item 1: "within thirty seconds a stranger does something that can
  // fail". The bound is a literal, and it is 1 — on every level, not just the
  // first, so no level in the campaign is a place where nothing can go wrong.
  const MOVES_TO_A_REFUSAL = 1;

  for (let i = 0; i < ORDER.length; i++) {
    const c = new Campaign();
    c.start();
    for (let k = 0; k < i; k++) c.next();
    const id = c.state().id;
    const e = entryOf(id);

    const losing = e.knob.samples.find((s) => !grade(e, s).ok);
    ok(`${id}: the domain offers at least one losing setting`, losing !== undefined);

    const r = c.move(losing);
    ok(`${id}: the losing setting was accepted as a move`, r.accepted === true);
    ok(`${id}: reached in exactly ${MOVES_TO_A_REFUSAL} move`, c.state().moves === MOVES_TO_A_REFUSAL, `${c.state().moves}`);

    const v = c.verdict();
    ok(`${id}: the factory is refused`, v.ok === false);
    ok(`${id}: and the level is not won`, v.won === false);
    ok(`${id}: something is named as starved`, v.deficits.length >= 1);
    for (const d of v.deficits) {
      ok(`${id}: the sentence names ${d.sinkId} and what it wanted`,
        v.line.includes(d.sinkId) && v.line.includes(d.resource), v.line);
    }
    // A missing field renders as the literal string "undefined" inside a
    // template and every includes() check above still passes.
    ok(`${id}: the sentence has no undefined or NaN in it`, !/undefined|NaN/.test(v.line), v.line);
    ok(`${id}: the sentence says it failed`, /^✗/.test(v.line), v.line);
  }
}

// ---------------------------------------------------------------------------
console.log('\n12. the state machine: won needs a MOVE, and a bad setting is refused');
{
  const c = new Campaign();
  c.start();
  const opening = c.verdict();
  // level1 opens at rate 120, which is already fed — five of the six levels do.
  ok('the first level opens already fed', opening.ok === true);
  ok('...but it is NOT won until the player acts', opening.won === false);
  ok('...and the opening state records zero moves', c.state().moves === 0);

  c.move(c.state().value);
  ok('one move — even to the same setting — is enough to win it', c.verdict().won === true);

  const c2 = new Campaign();
  c2.start();
  const before = c2.state();
  ok('an out-of-domain number is refused, not thrown', c2.move(9999).accepted === false);
  ok('...with a reason', c2.move(9999).reason === 'not-a-setting');
  ok('a value that drifted off the declared grid is refused too', c2.move(50.0000001).accepted === false);
  ok('null is refused rather than throwing', c2.move(null).accepted === false);
  ok('a refused setting costs no move', c2.state().moves === before.moves);
  ok('a refused setting does not change the setting', c2.state().value === before.value);

  // The grid level takes an OBJECT, so membership cannot be identity.
  const c3 = new Campaign();
  c3.start();
  // Bounded, not `while (id !== 'level3')`: if ORDER were ever wrong that loop
  // would HANG rather than fail, and a gate that hangs is worse than one that
  // goes red — next() returns null forever once it has finished.
  for (let k = 0; k < ORDER.length && c3.state().id !== 'level3'; k++) c3.next();
  ok('reached level3 by advancing', c3.state().id === 'level3', c3.state().id);
  ok('an equal-but-not-identical object setting is accepted', c3.move({ miner: 44, smelter: 44 }).accepted === true);
  ok('an off-grid object setting is refused', c3.move({ miner: 44.5, smelter: 44 }).accepted === false);

  const snap = c3.state();
  snap.moves = 999;
  snap.value.miner = 1;
  ok('state() is a detached snapshot — mutating it does nothing', c3.state().moves !== 999 && c3.state().value.miner === 44);
}

// ---------------------------------------------------------------------------
console.log('\n13. the shipped level literals are untouched after every sweep');
{
  // ORDER is computed at import, which is roughly 8,600 applications of the six
  // knobs to these six objects. If any of the with* helpers were mutating
  // rather than copying, the shipped numbers below would have moved by now.
  const at = (id, nodeId) => entryOf(id).base.nodes.find((n) => n.id === nodeId);
  ok('LEVEL_1 ore rate is still 1000', at('level1', 'ore').rate === 1000);
  ok('LEVEL_1 smelter capacity is still 51', at('level1', 'smelter').capacity === 51);
  ok('LEVEL_2_BASE ships broken, smelter capacity still 30', at('level2', 'smelter').capacity === 30);
  ok('LEVEL_3 capacities are still 70 and 45',
    at('level3', 'miner').capacity === 70 && at('level3', 'smelter').capacity === 45);
  ok('LEVEL_4 ore rate is still 102', at('level4', 'ore').rate === 102);
  ok('LEVEL_4 edges still carry NO share — autoSplit copied rather than filled in place',
    entryOf('level4').base.edges.every((e) => e.share === undefined));
  ok('LEVEL_5 shares are still 0.3 / 0.7',
    entryOf('level5').base.edges.find((e) => e.to === 'fieldA').share === 0.3
    && entryOf('level5').base.edges.find((e) => e.to === 'fieldB').share === 0.7);
  ok('LEVEL_6 shares are still 0.4 / 0.6',
    entryOf('level6').base.edges.find((e) => e.to === 'smelterA').share === 0.4
    && entryOf('level6').base.edges.find((e) => e.to === 'smelterB').share === 0.6);
}

console.log('');
if (failed) { console.log(`✗ campaign selftest: ${failed} failing\n`); process.exit(1); }
console.log('✓ campaign selftest passed\n');

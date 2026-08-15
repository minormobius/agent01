#!/usr/bin/env node
// Known-answer tests for level-view.js's two pure functions — withSourceRate
// and verdictLine — which shipped with zero coverage until this file existed.
// Both are exactly the "confident lie" risk view.selftest.mjs's own header
// warns about: index.html renders verdictLine's return value directly as
// Level 1's pass/fail verdict, so a drift here is not a bug a player notices,
// it is a wrong verdict presented as a right one.
//
// House style matches production.selftest.mjs / level1.selftest.mjs: every
// margin below is taken from a fixture already hand-verified in an existing
// test file, so this file adds no new arithmetic of its own to get wrong.
//
// Run: node plant/test/level-view.selftest.mjs

import { withSourceRate, verdictLine, drawLevel, refusalLine } from '../level-view.js';
import { feasible } from '../production.mjs';
import { LEVEL_1 } from '../levels/level1.mjs';
import { generatePocket } from '../foamworld.js';
import { constellation } from '../solids.mjs';
import { legalSummon, summonAt, coarselyClear } from '../placement.mjs';

let failed = 0;
const ok = (name, cond, detail = '') => {
  if (cond) { console.log(`  ✓ ${name}`); return; }
  failed++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`);
};

console.log('\nwithSourceRate: overrides only the source node\'s rate, leaves everything else byte-identical');
{
  const before = JSON.stringify(LEVEL_1);
  const patched = withSourceRate(LEVEL_1, 42);

  const source = patched.nodes.find((n) => n.kind === 'source');
  ok('source rate is overridden', source.rate === 42, `${source.rate}`);

  const untouched = patched.nodes.filter((n) => n.kind !== 'source');
  const untouchedOrig = LEVEL_1.nodes.filter((n) => n.kind !== 'source');
  ok('every non-source node is byte-identical to LEVEL_1',
    JSON.stringify(untouched) === JSON.stringify(untouchedOrig));
  ok('edges are byte-identical to LEVEL_1',
    JSON.stringify(patched.edges) === JSON.stringify(LEVEL_1.edges));

  ok("LEVEL_1's own source node still reads rate 1000 — withSourceRate did not mutate it",
    LEVEL_1.nodes.find((n) => n.kind === 'source').rate === 1000);
  ok('LEVEL_1 itself is unchanged overall (re-stringify matches the pre-call snapshot)',
    JSON.stringify(LEVEL_1) === before);
}

console.log('\nverdictLine, ok path: band()\'s label now appears alongside the percentage');
{
  // LEVEL_1 as shipped -> margin 0.02 (pinned by level1.selftest.mjs) -> tight.
  const tight = verdictLine(feasible(LEVEL_1));
  ok('tight case names its band', tight.includes('tight'), tight);
  ok('tight case still carries the percentage (2%)', tight.includes('2'), tight);

  // production.selftest.mjs's basic chain at source rate 10 -> margin 0.25 -> comfortable.
  const comfortableNet = {
    nodes: [
      { kind: 'source', id: 'src', resource: 'iron', rate: 10 },
      { kind: 'processor', id: 'proc', inputs: [{ resource: 'iron', rate: 5 }], outputs: [{ resource: 'gear', rate: 5 }], capacity: 1 },
      { kind: 'sink', id: 'snk', resource: 'gear', demand: 4 },
    ],
    edges: [{ from: 'src', to: 'proc' }, { from: 'proc', to: 'snk' }],
  };
  const comfortable = verdictLine(feasible(comfortableNet));
  ok('comfortable case names its band', comfortable.includes('comfortable'), comfortable);

  // production.selftest.mjs's convergence fixture at rateB=4 -> margin 1 -> slack.
  const slackNet = {
    nodes: [
      { kind: 'source', id: 'a', resource: 'a', rate: 6 },
      { kind: 'source', id: 'b', resource: 'b', rate: 4 },
      { kind: 'processor', id: 'p', inputs: [{ resource: 'a', rate: 3 }, { resource: 'b', rate: 2 }], outputs: [{ resource: 'c', rate: 1 }], capacity: 10 },
      { kind: 'sink', id: 's', resource: 'c', demand: 1 },
    ],
    edges: [{ from: 'a', to: 'p' }, { from: 'b', to: 'p' }, { from: 'p', to: 's' }],
  };
  const slack = verdictLine(feasible(slackNet));
  ok('slack case names its band', slack.includes('slack'), slack);

  console.log('  CONTROL — a stub that always emits "tight" would pass the tight case and fail here');
  ok('tight and slack cases do not share a band word',
    !tight.includes('slack') && !slack.includes('tight'),
    `tight="${tight}" slack="${slack}"`);
}

console.log('\nverdictLine, fail path: unchanged by this edit');
{
  // level1.selftest.mjs's starved CONTROL: ore rate dropped 1000 -> 30, which
  // makes the source (not the smelter's untouched capacity 51) the bottleneck
  // -> achieved 30, short of the depot's demand of 50.
  const starved = JSON.parse(JSON.stringify(LEVEL_1));
  starved.nodes.find((n) => n.id === 'ore').rate = 30;
  const line = verdictLine(feasible(starved));

  ok('names the starved sink', line.includes('depot'), line);
  ok('names the demand (50)', line.includes('50'), line);
  ok('names what was achieved (30)', line.includes('30'), line);
}

console.log('\nverdictLine, fail path with TWO deficits: every starved sink must be named, not just deficits[0]');
{
  // A source fanning out (explicit shares, same shape as production.selftest.mjs's
  // "fan-out WITH explicit shares" block) to two sinks that are BOTH short, by
  // different absolute amounts — the exact shape lp-7e1c54 names in LEVEL_4's
  // CONTROL A (rate dropped to 60), reproduced here as an inline fixture per
  // this ticket's independence rule (R4) rather than importing levels/level4.mjs.
  // ore rate 10, share 0.3/0.7 -> stockpileA gets 3 (needs 5, short 2),
  // stockpileB gets 7 (needs 8, short 1).
  const twoDeficitNet = {
    nodes: [
      { kind: 'source', id: 'ore', resource: 'ore', rate: 10 },
      { kind: 'sink', id: 'stockpileA', resource: 'ore', demand: 5 },
      { kind: 'sink', id: 'stockpileB', resource: 'ore', demand: 8 },
    ],
    edges: [
      { from: 'ore', to: 'stockpileA', share: 0.3 },
      { from: 'ore', to: 'stockpileB', share: 0.7 },
    ],
  };
  const v = feasible(twoDeficitNet);
  ok('fixture sanity: both sinks are short', v.deficits.length === 2, JSON.stringify(v.deficits));

  const line = verdictLine(v);
  const occurrences = (needle) => line.split(needle).length - 1;

  ok('names stockpileA', line.includes('stockpileA'), line);
  ok('names stockpileB', line.includes('stockpileB'), line);
  ok("names stockpileA's demand (5)", line.includes('5'), line);
  ok("names stockpileA's achieved (3)", line.includes('3'), line);
  ok("names stockpileB's demand (8)", line.includes('8'), line);
  ok("names stockpileB's achieved (7)", line.includes('7'), line);

  console.log('  CONTROL — the old deficits[0]-only shape names stockpileA but never stockpileB');
  ok('stockpileA appears exactly once (not silently repeated)', occurrences('stockpileA') === 1, line);
  ok('stockpileB appears exactly once — proves it was not truncated away like the old code would',
    occurrences('stockpileB') === 1, line);
}

console.log('\ndrawLevel: layered layout — regression against the old single-chain walk');
{
  // drawLevel()'s only interaction with `svg` is `svg.innerHTML = ...` — it
  // never reads from it, so a plain object stands in for a real SVG element.
  const svg = { innerHTML: '' };
  drawLevel(svg, LEVEL_1, feasible(LEVEL_1));

  const idx = (s) => svg.innerHTML.indexOf(`>${s}<`);
  const [oreAt, smelterAt, depotAt] = ['ore', 'smelter', 'depot'].map(idx);

  ok('ore appears exactly once', svg.innerHTML.split('>ore<').length - 1 === 1);
  ok('smelter appears exactly once', svg.innerHTML.split('>smelter<').length - 1 === 1);
  ok('depot appears exactly once', svg.innerHTML.split('>depot<').length - 1 === 1);
  ok('ore, smelter, depot appear left-to-right, unchanged from the single-chain layout',
    oreAt >= 0 && oreAt < smelterAt && smelterAt < depotAt,
    `ore@${oreAt} smelter@${smelterAt} depot@${depotAt}`);
}

console.log('\ndrawLevel: convergence — two sources into one processor must not drop either');
{
  // The exact a/b/p/s network already hand-verified in this file's
  // verdictLine "slack" case above (production.selftest.mjs's convergence
  // fixture) — reused rather than importing a level module, per the ticket's
  // independence rule (R4): this test must not order against the paired
  // LEVEL_4 proposal.
  const convergenceNet = {
    nodes: [
      { kind: 'source', id: 'a', resource: 'a', rate: 6 },
      { kind: 'source', id: 'b', resource: 'b', rate: 4 },
      { kind: 'processor', id: 'p', inputs: [{ resource: 'a', rate: 3 }, { resource: 'b', rate: 2 }], outputs: [{ resource: 'c', rate: 1 }], capacity: 10 },
      { kind: 'sink', id: 's', resource: 'c', demand: 1 },
    ],
    edges: [{ from: 'a', to: 'p' }, { from: 'b', to: 'p' }, { from: 'p', to: 's' }],
  };

  const svg = { innerHTML: '' };
  let threw = false;
  try { drawLevel(svg, convergenceNet, feasible(convergenceNet)); } catch { threw = true; }

  ok('drawLevel does not throw on a converging network', !threw);
  ok('renders node "a"', svg.innerHTML.includes('>a<'));
  ok('renders node "b"', svg.innerHTML.includes('>b<'),
    'today\'s single-chain walk picks whichever source Array.prototype.find returns first and drops the other');
  ok('renders exactly 4 boxes, one per node', (svg.innerHTML.match(/<rect/g) || []).length === 4,
    `${(svg.innerHTML.match(/<rect/g) || []).length} boxes for a 4-node network`);
}

console.log('\ndrawLevel: fan-out — a node with two outgoing edges must render both arrows, not just the last');
{
  // production.selftest.mjs's own hand-verified explicit-share fixture:
  // source rate 10, resource x, edges src->s1 share 0.3 and src->s2 share 0.7.
  // Margins there are hand-computed as s1 (10*0.3-2)/2=0.5, s2 (10*0.7-6)/6=1/6.
  const fanOutNet = {
    nodes: [
      { kind: 'source', id: 'src', resource: 'x', rate: 10 },
      { kind: 'sink', id: 's1', resource: 'x', demand: 2 },
      { kind: 'sink', id: 's2', resource: 'x', demand: 6 },
    ],
    edges: [
      { from: 'src', to: 's1', share: 0.3 },
      { from: 'src', to: 's2', share: 0.7 },
    ],
  };

  const svg = { innerHTML: '' };
  let threw = false;
  try { drawLevel(svg, fanOutNet, feasible(fanOutNet)); } catch { threw = true; }

  ok('drawLevel does not throw on a fan-out network', !threw);
  ok('renders node "src" exactly once', svg.innerHTML.split('>src<').length - 1 === 1);
  ok('renders node "s1" exactly once', svg.innerHTML.split('>s1<').length - 1 === 1);
  ok('renders node "s2" exactly once', svg.innerHTML.split('>s2<').length - 1 === 1);

  const pathCount = (svg.innerHTML.match(/<path/g) || []).length;
  console.log('  CONTROL — under the old fromId-keyed Map, the second edge silently overwrote the first: 2 <path elements, not 4');
  ok('renders exactly 4 <path elements — 2 per edge (line + arrowhead), for 2 edges',
    pathCount === 4, `${pathCount} <path elements`);
}

// ---------------------------------------------------------------------------
// refusalLine: placement.mjs's verdicts, in words a player can act on.
//
// EVERY verdict below is produced by the REAL predicate against a REAL pocket.
// Hand-written verdict literals were the obvious way to write this file and are
// exactly wrong: they let the sentence and the predicate drift apart, which is
// the failure this block exists to prevent. The only thing hand-computed here
// is which refusals a given fixture MUST produce, and each of those is derived
// from arithmetic stated at the fixture.
//
// The numbers are checked by parsing them back OUT of the sentence and
// comparing against the verdict, within rounding. That is the anti-contradiction
// rule: a sentence may round a distance, it may not invent one.

console.log('\nrefusalLine: a refused summon, explained');

// The same macro fixture placement.selftest.mjs uses, so its properties (80×36×80,
// 64 seeds, aniso 2.2) are already proven by a test that passes today.
const MACRO = { nx: 4, nz: 4, layers: 3, subLayers: 1, cell: 20, layerH: 9, parMin: 3, parTarget: 6 };
const P = generatePocket({ seed: 2, ...MACRO });
ok('fixture: the macro pocket is 80×36×80 with 64 seeds at aniso 2.2',
  P.W === 80 && P.H === 36 && P.D === 80 && P.seeds.length === 64 && P.opts.aniso === 2.2,
  `${P.W}×${P.H}×${P.D}, ${P.seeds.length} seeds, aniso ${P.opts.aniso}`);

/** Pull a distance back out of the sentence, so it can be compared with the
 *  verdict it was supposed to come from. */
const printed = (line, re) => {
  const m = (line || '').match(re);
  return m ? Number(m[1]) : NaN;
};

console.log('\n  a) collision with ground that is already solid');
{
  // A cube centred exactly on a pocket seed. The seed is filtered to be at
  // least 6m from every wall, and a cube's neighbours sit at 2r = 3.2m, so the
  // WHOLE constellation is inside the hull — which makes "every refusal is a
  // seed refusal" a property of the fixture rather than a hope.
  const interior = P.seeds
    .map((s, i) => ({ s, i }))
    .filter(({ s }) => s[0] >= 6 && s[0] <= P.W - 6 && s[1] >= 6 && s[1] <= P.H - 6 && s[2] >= 6 && s[2] <= P.D - 6);
  // At least EIGHT such seeds exist by construction, not by luck: the generator
  // lays 4×4 columns on a 20m cell with ±0.38 jitter, so the two middle columns
  // are always within x,z ∈ [22.4, 57.6]; and layers k=1,2 on a 9m layerH with
  // at most ±0.75 jitter always land in y ∈ [6.75, 29.25]. 2×2×2 = 8.
  ok('fixture: at least 8 seeds sit 6m clear of every wall', interior.length >= 8, `${interior.length} of 64`);

  // Fallback keeps an empty filter RED rather than a crash: a throw here would
  // abort the whole gate before the blocks below ever ran, which reads as a
  // different failure than the one that happened.
  const { s, i } = interior[0] || { s: [40, 18, 40], i: -1 };
  const v = summonAt(P, 'cube', s, { r: 1.6 }).verdict;
  ok('fixture: standing on a seed is refused', !v.ok);
  ok('fixture: and every refusal is a seed collision (the constellation is wholly in-hull)',
    v.refusals.every((r) => r.reason === 'seed'), JSON.stringify(v.refusals.map((r) => r.reason)));
  ok('fixture: the centre refusal names the seed it is standing on',
    v.refusals.some((r) => r.summonSeed === 0 && r.seedIndex === i));

  const line = refusalLine(v);
  ok('produces a sentence', typeof line === 'string' && line.length > 0, String(line));
  ok('names the cause in words a player has — "rock", not "seed index"',
    line.includes('rock') && !line.includes('seed'), line);
  ok('carries no jargon: no gap, no anisotropy, no hull, no B-face id',
    !/\b(gap|aniso|anisotrop|hull|B[0-5])\b/.test(line), line);
  ok('never renders an undefined or NaN field', !/undefined|NaN/.test(line), line);

  // THE COUNT. n is read off the verdict, not hardcoded: whatever the predicate
  // refused, the sentence has to account for all of it.
  const n = v.refusals.length;
  ok(`states the count when there is more than one (${n} refusal${n === 1 ? '' : 's'})`,
    n > 1 ? line.includes(`in ${n} places`) : !line.includes('places'), line);

  console.log('  CONTROL — the deficits[0] bug this repo already shipped once: a sentence built from one refusal');
  const worst = v.refusals.reduce((a, b) => ((b.need - b.gap) > (a.need - a.gap) ? b : a), { need: 0, gap: 0 });
  const said = printed(line, /about ([\d.]+) m short of clear/);
  ok('the distance in the sentence is the WORST shortfall in the verdict, within rounding',
    Math.abs(said - (worst.need - worst.gap)) <= 0.005,
    `sentence says ${said}, verdict's worst is ${worst.need - worst.gap}`);
  ok('…and that shortfall is one the verdict actually carries (gap 0 on a coincident seed → the full 1.5)',
    v.refusals.some((r) => r.gap === 0 && r.need === 1.5));
}

console.log('\n  b) part of the shape poking out through the pocket wall');
{
  // Hand-verified, and it is pure arithmetic: a cube at r=1.6 puts neighbours at
  // exactly ±3.2 on each axis. Centred at [1.2, 18, 1.2] the −x neighbour lands
  // at −2.0 and the −z neighbour at −2.0, both 3.0m outside the [1, W-1] bound;
  // every other seed is comfortably inside. So EXACTLY TWO hull refusals, at
  // equal depth, which also exercises the tie-break (earliest wins).
  const v = summonAt(P, 'cube', [1.2, 18, 1.2], { r: 1.6 }).verdict;
  const hulls = v.refusals.filter((r) => r.reason === 'hull');
  ok('fixture: exactly two seeds of the cube are outside the wall', hulls.length === 2,
    JSON.stringify(v.refusals.map((r) => `${r.reason}${r.wall ? '/' + r.wall : ''}`)));
  ok('fixture: both are 3.0m outside', hulls.every((r) => Math.abs(r.depth - 3) < 1e-9),
    JSON.stringify(hulls.map((r) => r.depth)));

  const line = refusalLine(v);
  ok('names the cause as pushing out through the wall', line.includes('pushes out through the wall'), line);
  ok('names the shape', line.includes('cube'), line);
  ok('states the count — BOTH protruding seeds, not just the first', line.includes('in 2 places'), line);
  ok('never renders an undefined or NaN field', !/undefined|NaN/.test(line), line);

  const said = printed(line, /by about ([\d.]+) m/);
  ok('the distance is the verdict\'s own depth, within rounding', Math.abs(said - 3) <= 0.005, `${said}`);

  console.log('  CONTROL — the floor and the ceiling get their own words, so "the wall" is not a constant');
  // y = 0.5 is 0.3 below the floor bound of 0.8; the cube's other seeds are far
  // from any other bound, so B2 is the only violation and it is the deepest.
  const floorV = summonAt(P, 'cube', [40, 0.5, 40], { r: 1.6 }).verdict;
  const floorLine = refusalLine(floorV);
  ok('a summon through the floor says "the floor"',
    floorV.refusals.some((r) => r.reason === 'hull' && r.wall === 'B2') && floorLine.includes('the floor'),
    floorLine);
}

console.log('\n  c) a shape too small to hold itself apart — a property of the SUMMON, not the place');
{
  // A cube at r=0.74 puts its neighbours 1.48m away. The pairs that break the
  // 1.5m rule are centre↔(+x), (−x), (+z), (−z) — dy = 0 for those, so no
  // anisotropic scaling enters and the gap is exactly 2r = 1.48. The y pair
  // scales by √2.2 to 2.195 and every neighbour↔neighbour pair is ≥ 2.09, so
  // EXACTLY FOUR self refusals, each 0.02m short. (The 1.48 figure is already
  // pinned by placement.selftest.mjs's own boundary block.)
  //
  // The centre is chosen with `coarselyClear` at the LARGER r=1.6, which is
  // documented-sound: nothing within that radius ⟹ no seed refusal at all, and
  // certainly none for the smaller shape. So the only reason left is `self`.
  // Same lattice placement.selftest.mjs sweeps, which already asserts for this
  // pocket that `coarselyClear` accepts something on it — so this search is
  // guaranteed to find a centre by a test that passes today, not by luck.
  let centre = null;
  for (let x = 6; x <= P.W - 6 && !centre; x += 5) {
    for (let z = 6; z <= P.D - 6 && !centre; z += 5) {
      for (const y of [11, 15, 20, 24]) {
        const big = constellation('cube', { centre: [x, y, z], r: 1.6, aniso: P.opts.aniso });
        if (coarselyClear(P, big)) { centre = [x, y, z]; break; }
      }
    }
  }
  ok('fixture: a centre with provably clear ground exists in the lattice', centre !== null, String(centre));
  if (!centre) centre = [36, 20, 36];   // keeps the run RED rather than crashing; see (a)

  const v = legalSummon(P, constellation('cube', { centre, r: 0.74, aniso: P.opts.aniso }));
  ok('fixture: exactly four of the summon\'s own pairs are too close, and nothing else is wrong',
    v.refusals.length === 4 && v.refusals.every((r) => r.reason === 'self'),
    JSON.stringify(v.refusals.map((r) => r.reason)));
  ok('fixture: each is 1.48 against a 1.5 requirement',
    v.refusals.every((r) => Math.abs(r.gap - 1.48) < 1e-9 && r.need === 1.5),
    JSON.stringify(v.refusals.map((r) => r.gap)));

  const line = refusalLine(v);
  ok('says the shape cannot hold itself apart', line.includes('hold itself apart'), line);
  ok('states the count — 4 pairs, not one', line.includes('4 pairs'), line);
  ok('says moving will not help and bigger will — this is about the shape, not the spot',
    /make it bigger/.test(line) && /Nothing about this spot/.test(line), line);
  ok('does not tell the player they are too close to the rock — that is a different mistake',
    !line.includes('rock'), line);
  ok('never renders an undefined or NaN field', !/undefined|NaN/.test(line), line);

  const said = printed(line, /the tightest by about ([\d.]+) m/);
  ok('the shortfall is 1.5 − 1.48 = 0.02, taken from the verdict', Math.abs(said - 0.02) <= 0.005, `${said}`);

  console.log('  CONTROL — the SAME shape one notch bigger is fine, so "self" is not a constant verdict');
  const looseV = legalSummon(P, constellation('cube', { centre, r: 0.76, aniso: P.opts.aniso }));
  ok('r=0.76 → min self-gap 1.52 ≥ 1.5, no refusal at all', looseV.ok, JSON.stringify(looseV.refusals));
  ok('…and refusalLine returns null for it', refusalLine(looseV) === null, String(refusalLine(looseV)));
}

console.log('\n  d) CONTROL: a legal summon produces no refusal line at all');
{
  let legal = null;
  for (let x = 6; x <= P.W - 6 && !legal; x += 5) {
    for (let z = 6; z <= P.D - 6 && !legal; z += 5) {
      for (const y of [11, 15, 20, 24]) {
        const k = summonAt(P, 'cube', [x, y, z], { r: 1.6 });
        if (k.ok) { legal = k; break; }
      }
    }
  }
  ok('fixture: buildable space exists for a cube in this pocket', legal !== null);
  ok('refusalLine(legal) is null — not "", not "✗", not an empty box in the UI',
    legal !== null && refusalLine(legal.verdict) === null,
    legal === null ? 'no legal centre found — the assertion above is the real failure' : String(refusalLine(legal.verdict)));

  console.log('  CONTROL — and the same function on a refusal is NOT null, so null is a verdict rather than a stub');
  ok('a refused summon still gets a sentence',
    typeof refusalLine(summonAt(P, 'cube', P.seeds[0], { r: 1.6 }).verdict) === 'string');
}

console.log('\n  e) the metric mismatch — unreachable through summonAt, rendered anyway');
{
  // legalSummon's fourth reason. A player cannot cause it (summonAt takes aniso
  // from the pocket), but a refusal with no sentence is the one outcome
  // refusalLine exists to prevent, so it is pinned rather than left to fall
  // through to an empty clause.
  const v = legalSummon(P, constellation('cube', { centre: [40, 18, 40], r: 1.6, aniso: 3.5 }));
  ok('fixture: an aniso mismatch is refused', !v.ok && v.refusals.some((r) => r.reason === 'metric'));
  const line = refusalLine(v);
  ok('it gets a real sentence, not an empty clause',
    typeof line === 'string' && line.length > 4 && !/undefined|NaN/.test(line), String(line));
  // Deliberately NOT asserting that no other clause appears: [40,18,40] is the
  // pocket's own centre and may or may not be near a seed, so "the metric clause
  // is the only one" would be an assertion about the fixture's jitter rather
  // than about refusalLine. What is asserted is that the metric reason gets its
  // OWN words instead of falling through to another mistake's sentence.
  ok('the mismatch is described in its own words', line.includes('crooked'), line);
  ok('…and not as a shape that cannot hold itself apart', !line.includes('hold itself apart'), line);
}

console.log('\n  f) sweep: every refusal the predicate can produce over a lattice is fully accounted for');
{
  // The property, over every refusing candidate rather than over three chosen
  // ones: the sentence names EVERY distinct reason present, and states the
  // count for every reason that occurred more than once. This is what makes the
  // "report every refusal" rule a property rather than three examples.
  //
  // The lattice is placement.selftest.mjs's own sweep, step for step (x,z from 6
  // by 5, y ∈ {11,15,20,24}) — deliberately, because that file already asserts
  // for THIS pocket that some of these centres are refused and some are not. So
  // "the sweep contains real refusals" is inherited from a test that passes
  // today rather than being a fresh bet on where the generator put its seeds. A
  // coarser lattice would sample too few candidates to be sure of hitting one.
  const CAUSE = { seed: 'rock', hull: 'pushes out through', self: 'hold itself apart', metric: 'crooked' };
  let refusing = 0, bad = 0, multiSeed = 0, firstBad = '';
  for (let x = 6; x <= P.W - 6; x += 5) {
    for (let z = 6; z <= P.D - 6; z += 5) {
      for (const y of [11, 15, 20, 24]) {
        const v = summonAt(P, 'cube', [x, y, z], { r: 1.6 }).verdict;
        if (v.ok) continue;
        refusing++;
        const line = refusalLine(v);
        const counts = new Map();
        for (const r of v.refusals) counts.set(r.reason, (counts.get(r.reason) || 0) + 1);
        if ((counts.get('seed') || 0) > 1) multiSeed++;
        let good = typeof line === 'string' && line.startsWith('✗ ') && !/undefined|NaN/.test(line);
        if (good) {
          for (const [reason, n] of counts) {
            if (!line.includes(CAUSE[reason])) good = false;
            if (n > 1 && !line.includes(reason === 'self' ? `${n} pairs` : `in ${n} places`)) good = false;
          }
        }
        if (!good) { bad++; if (!firstBad) firstBad = `[${x},${y},${z}] → ${line}`; }
      }
    }
  }
  ok('sweep: the lattice contains real refusals', refusing > 0, `${refusing} refusing centres`);
  ok('sweep: every one of them is fully accounted for in its sentence', bad === 0, firstBad);
  console.log(`  (${multiSeed} of ${refusing} refusing centres fouled more than one seed — the plural path, exercised on real ground)`);
}

console.log('');
if (failed) { console.log(`✗ level-view selftest: ${failed} failing\n`); process.exit(1); }
console.log('✓ level-view selftest passed\n');

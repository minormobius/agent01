/* ken/lab/profiles.selftest.mjs — known answers for the generalisation.

   Two claims are checked here that are arithmetic, so a failure means the
   arithmetic is wrong rather than the world: the profile count is
   2^(n-3), and the isoperimetric floor is tight. One claim is EMPIRICAL —
   the frontier size — and is labelled so nobody reads it as proved. */

import {
  compositions, profiles, buildProfile, summarise, family, frontier,
  frontierOf, ladder, widthFloor, NAMED, WIRINGS, SKIPS,
} from '../graph/profiles.mjs';
import {
  ancestryDigests, ancestryClasses, poolAcross, comparePartitions,
  replicationByAncestry, hashStr, hex,
} from '../graph/ancestry.mjs';
import { automorphisms } from '../graph/roles.mjs';
import { HYPOTHESES } from '../graph/hypotheses.mjs';
import {
  allShapes, countShapes, sampleShapes, coverage, canonical, canonicalOf,
  refineMatrix, KNOWN_COUNTS, EXACT_LIMIT, searchSize,
} from '../graph/exhaustive.mjs';
import { buildShape, shapeNames, catalogue } from '../graph/shapes.mjs';
import {
  REGIMES, REGIME_NOTE, effectiveGraph, auditRegime, collapse, ancestors, PRECONDITION,
} from '../graph/visibility.mjs';
import { kenRatio } from '../graph/roles.mjs';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log(`  ✗ ${m}`); } };
const near = (a, b, t, m) => ok(Math.abs(a - b) <= t, `${m} (got ${a}, want ${b}±${t})`);
const section = (s) => console.log(`\n${s}`);

// ── 1. the family is a composition count ──────────────────────────────
section('the profile family');

ok(compositions(0).length === 1, 'one composition of zero: the empty one');
ok(compositions(1).length === 1 && compositions(4).length === 8, 'compositions of k number 2^(k-1)');
for (const n of [3, 4, 5, 6, 8, 10, 12]) {
  ok(profiles(n).length === 2 ** (n - 3), `n = ${n}: 2^(n-3) = ${2 ** (n - 3)} profiles`);
  ok(profiles(n).every((p) => p[0] === 1 && p[p.length - 1] === 1),
    `n = ${n}: every profile is pinned to one source and one sink`);
  ok(profiles(n).every((p) => p.reduce((s, x) => s + x, 0) === n),
    `n = ${n}: every profile sums to n`);
}
let tooSmall = false;
try { profiles(2); } catch { tooSmall = true; }
ok(tooSmall, 'a profile below three turns is refused');

// ── 2. the isoperimetric floor, and that it is reached ────────────────
section('the depth-width trade');

// (d-1) interior layers hold n-2 turns, so width >= ceil((n-2)/(d-1))
ok(widthFloor(6, 2) === 4 && widthFloor(6, 5) === 1, 'n = 6: floor is 4 at depth 2 and 1 at depth 5');
ok(widthFloor(12, 2) === 10 && widthFloor(12, 6) === 2, 'n = 12: floor is 10 at depth 2 and 2 at depth 6');
ok(widthFloor(12, 1) === Infinity, 'depth 1 cannot hold an interior at all');

let checked = 0, loose = 0;
for (const n of [5, 6, 7, 8, 9, 10, 11, 12]) {
  for (const l of ladder(n)) {
    checked++;
    if (l.minWidth !== l.widthFloor) loose++;
    ok(l.minWidth >= l.widthFloor, `n = ${n} depth ${l.depth}: width never beats the floor`);
  }
}
ok(loose === 0, `the floor is reached at every one of ${checked} depth/n pairs (${loose} loose)`);
ok(checked > 40, 'and enough pairs were checked to mean something');

// every built profile agrees with its own declared depth and width
for (const n of [6, 9]) {
  for (const p of profiles(n)) {
    const s = summarise(buildProfile(p));
    ok(s.turns === n, `${p.join('·')}: costs n turns`);
    ok(s.depth === p.length - 1, `${p.join('·')}: depth is one less than the layer count`);
    ok(s.width === Math.max(...p), `${p.join('·')}: width is the widest layer`);
    ok(s.width >= s.widthFloor, `${p.join('·')}: sits on or above the floor`);
  }
}

// ── 3. the hand catalogue is a special case of the generated family ───
section('WP2 reproduced from the generalisation');

const cat = Object.fromEntries(catalogue().map((r) => [r.name, r]));
for (const [name, spec] of Object.entries(NAMED)) {
  const s = summarise(buildProfile(spec.profile, spec));
  const want = cat[name];
  ok(s.turns === 6, `${name}: six turns`);
  ok(s.depth === want.depth, `${name}: depth ${want.depth}`);
  ok(s.width === want.width, `${name}: width ${want.width}`);
  near(s.sinkKen, want.sinkKen, 1e-9, `${name}: sink ken`);
  ok(s.replicates === want.largestOrbit, `${name}: largest orbit ${want.largestOrbit}`);
  ok(s.maxInDeg === want.maxInDeg, `${name}: peak in-degree ${want.maxInDeg}`);
}
ok(Object.keys(NAMED).length === shapeNames().length, 'every named shape has a profile');

ok(WIRINGS.length === 2, 'two wirings');
let badWiring = false;
try { buildProfile([1, 2, 1], { wiring: 'nonsense' }); } catch { badWiring = true; }
ok(badWiring, 'an unknown wiring is refused rather than defaulted');

// lanes only differ from complete where neighbouring widths match
ok(buildProfile([1, 2, 2, 1], { wiring: 'lanes' }).edges.length
  < buildProfile([1, 2, 2, 1], { wiring: 'complete' }).edges.length,
'lane wiring drops the crossing edges when two waves are equally wide');
ok(buildProfile([1, 3, 1], { wiring: 'lanes' }).edges.length
  === buildProfile([1, 3, 1], { wiring: 'complete' }).edges.length,
'and is identical to complete when no two neighbours match');

// ── 4. the frontier, labelled as the empirical claim it is ────────────
section('the frontier');

/* THE 2n-4 CLAIM WAS AN ARTEFACT OF A NARROW FAMILY, and this is what
   happened when the family widened, which is why it was labelled
   EMPIRICAL rather than proved.

   With skip edges off and no briefing, the frontier holds exactly n-2
   points: one per achievable depth, since depth runs from 2 to n-1. That
   is not a deep fact, it is a statement that within that family nothing
   at a given depth dominates anything else at the same depth — and it is
   exactly why the explorer's first table looked like one shape stretched
   over many depths. The UI symptom and the structural fact were the same
   thing.

   Turn briefing on and it doubled to 2n-4. Add skip policies and the
   pattern dissolves: 8, 12, 16, 21, 26, 32, 38, 45 for n = 5 to 12, with
   no clean formula. Recorded as measurements rather than fitted. */
for (const n of [5, 6, 7, 8, 9, 10, 11, 12]) {
  const narrow = frontierOf(family(n, { skips: ['none'], brief: [false] }));
  ok(narrow.length === n - 2,
    `the narrow family's frontier at n = ${n} is n-2 = ${n - 2}, one per achievable depth`);
}
{
  const WIDE = { 5: 8, 6: 12, 7: 16, 8: 21, 9: 26, 10: 32, 11: 38, 12: 45 };
  for (const [n, want] of Object.entries(WIDE)) {
    ok(frontierOf(family(+n)).length === want,
      `MEASURED: the full family's frontier at n = ${n} holds ${want} points`);
  }
  ok(frontierOf(family(6)).length > 6 - 2,
    'widening the family strictly grows the frontier, so the narrow count was about the generator');
}

const f6 = frontier(6);
ok(f6.every((b) => !f6.some((a) => a !== b
  && a.depth <= b.depth && a.width <= b.width && a.maxInDeg <= b.maxInDeg
  && a.sinkKen >= b.sinkKen && a.effective >= b.effective
  && (a.depth < b.depth || a.width < b.width || a.maxInDeg < b.maxInDeg
    || a.sinkKen > b.sinkKen || a.effective > b.effective))),
'nothing on the frontier is dominated by anything else on it');

// briefing is free in every currency but merge load
for (const n of [6, 10]) {
  for (const p of [[1, ...Array(n - 3).fill(1), 1].slice(0, n)]) {
    const plain = summarise(buildProfile(p));
    const brief = summarise(buildProfile(p, { briefed: true }));
    ok(brief.turns === plain.turns && brief.depth === plain.depth && brief.width === plain.width,
      `n = ${n}: briefing changes no turn, no depth and no width`);
    ok(brief.sinkKen === 1, `n = ${n}: and takes sink ken to 1`);
    ok(brief.maxInDeg > plain.maxInDeg, `n = ${n}: while raising peak in-degree, which is its price`);
  }
}

// ── 5. ancestry digests ───────────────────────────────────────────────
section('ancestry as content-addressed state');

ok(hashStr('a') !== hashStr('b'), 'the mixer separates two strings');
ok(hashStr('a') === hashStr('a'), 'and is deterministic');
ok(hex(0xff) === '000000ff', 'digests render as eight hex digits');

const G = (nodes, edges) => ({
  nodes: nodes.map((id) => ({ id, label: id })),
  edges: edges.map(([from, to]) => ({ from, to })),
});

// sources have nothing upstream, so they all agree
const chain = buildShape('chain'), star = buildShape('star');
{
  const a = ancestryDigests(chain).anc, b = ancestryDigests(star).anc;
  ok(a.get(chain.source) === b.get(star.source),
    'two sources agree: neither has any ancestry at all');
  ok(a.get('t1') === b.get('w1'),
    'a chain\'s first turn and a star\'s worker agree: both are fed one setup turn');
  ok(new Set(['w1', 'w2', 'w3', 'w4'].map((id) => b.get(id))).size === 1,
    'all four star workers agree');
}

// ARITY must be folded in, or one parent and two identical parents collide
{
  const one = G(['s', 'a', 't'], [['s', 'a'], ['a', 't']]);
  const two = G(['s', 'a', 'b', 't'], [['s', 'a'], ['s', 'b'], ['a', 't'], ['b', 't']]);
  const da = ancestryDigests(one).anc.get('t');
  const db = ancestryDigests(two).anc.get('t');
  ok(da !== db, 'one parent and two same-ancestry parents give different digests');
}

// order of the edge list must not matter: it is a set of inputs
{
  const fwd = G(['s', 'a', 'b', 't'], [['s', 'a'], ['s', 'b'], ['a', 't'], ['b', 't']]);
  const rev = G(['s', 'a', 'b', 't'], [['s', 'b'], ['s', 'a'], ['b', 't'], ['a', 't']]);
  ok(ancestryDigests(fwd).anc.get('t') === ancestryDigests(rev).anc.get('t'),
    'reordering the edge list does not change any digest');
}

// content, when supplied, changes the digest downstream and not upstream
{
  const g = buildShape('chain');
  const plain = ancestryDigests(g).anc;
  const drift = ancestryDigests(g, { contentOf: (n) => (n.id === 't2' ? 'different brief' : '') }).anc;
  ok(plain.get('t1') === drift.get('t1'), 'content at t2 leaves everything upstream of it alone');
  ok(plain.get('t3') !== drift.get('t3'), 'and changes everything downstream');
}

// ── 6. orbits against ancestry classes ────────────────────────────────
section('which partition licenses pooling');

for (const name of shapeNames()) {
  const g = buildShape(name);
  const c = comparePartitions(g, automorphisms(g).orbits);
  ok(c.agree, `${name}: orbits and ancestry classes coincide, so WP2's figures stand`);
  ok(c.largestAncestryClass === cat[name].largestOrbit,
    `${name}: the largest class matches the largest orbit (${cat[name].largestOrbit})`);
}
ok(ancestryClasses(chain).every((c) => c.size === 1), 'a chain pools nothing');
ok(ancestryClasses(star).some((c) => c.size === 4), 'a star pools four');

// the cross-shape pool, which the orbit argument cannot reach
{
  const gs = Object.fromEntries(shapeNames().map((n) => [n, buildShape(n)]));
  const pool = poolAcross(gs);
  const biggest = pool[0];
  ok(biggest.size === 13, `the largest cross-shape cell holds 13 turns (got ${biggest.size})`);
  ok(biggest.shapes.length === 6, 'drawn from all six shapes');
  ok(biggest.crossShape, 'and is marked as crossing shapes');
  // clusters 1,2,2,4,3,1 -> sum 13, sum of squares 35, Kish 35/13
  near(biggest.kishClusterSize, 35 / 13, 1e-3, 'Kish cluster size is sum(m^2)/sum(m) = 35/13');
  near(biggest.deff, 1 + (35 / 13 - 1) * 0.413, 1e-3, 'deff = 1 + (kish - 1) rho');
  near(biggest.effective, 13 / (1 + (35 / 13 - 1) * 0.413), 1e-3, 'effective = 13 / deff');
  near(biggest.effective, 7.652, 5e-3, 'which is 7.65 at the measured rho');

  // the source cell is one turn per run, so its clusters are size 1 and
  // the design effect must be exactly 1 — the check that the formula is right
  const sources = pool.find((c) => c.size === 6 && Object.values(c.perRun).every((m) => m === 1));
  ok(sources && sources.deff === 1 && sources.effective === 6,
    'six independent sources give deff exactly 1 and six effective observations');

  ok(pool.reduce((s, c) => s + c.size, 0) === 36, 'every turn of every shape lands in exactly one cell');
  ok(biggest.effective > 4 * 1.787,
    'the catalogue run once beats a star run by more than four times on its largest cell');
}

// the replication figure by ancestry matches the orbit one within a shape
for (const name of shapeNames()) {
  const byAnc = replicationByAncestry(buildShape(name));
  ok(byAnc.rawReplicates === cat[name].largestOrbit,
    `${name}: ancestry gives the same within-shape replication as the orbit`);
}

// ── 7. the whole space, and how much of it the family covers ──────────
section('the space the layered family sits in');

// These four counts are the ground truth of this module. They were
// computed twice by different code — brute force over every relabelling,
// and a refinement-restricted canonical form — and the second was WRONG
// the first time, giving 122 and 3274 until two bugs were fixed. Neither
// method is trusted alone; their agreement is the check.
for (const [n, want] of Object.entries(KNOWN_COUNTS)) {
  ok(countShapes(+n) === want, `n = ${n}: ${want} shapes with one source and one sink`);
}
ok(KNOWN_COUNTS[6] === 1960, 'the n=6 count is 1960, which every coverage figure is a fraction of');
ok(searchSize(6) === 32768 && searchSize(8) === 268435456,
  'the search is 2^(n(n-1)/2): 32,768 masks at n=6 and 268 million at n=8');
let tooBig = false;
try { allShapes(EXACT_LIMIT + 1); } catch { tooBig = true; }
ok(tooBig, `exact enumeration refuses n above ${EXACT_LIMIT} rather than hanging`);

// every enumerated shape really is one
for (const n of [4, 5, 6]) {
  const gs = allShapes(n);
  ok(gs.length === KNOWN_COUNTS[n], `n = ${n}: enumeration returns every shape`);
  ok(gs.every((g) => g.turns === n), `n = ${n}: each has n turns`);
  ok(gs.every((g) => g.source && g.sink && g.source !== g.sink),
    `n = ${n}: each has one source and one sink, and they differ`);
  ok(new Set(gs.map((g) => canonicalOf(g, n))).size === gs.length,
    `n = ${n}: no two enumerated shapes are isomorphic`);
}

// the canonical form is invariant under relabelling, which is the whole
// property the counts depend on
{
  const g = buildShape('standard');
  const shuffled = {
    nodes: [...g.nodes].reverse(),
    edges: [...g.edges].reverse(),
  };
  ok(canonicalOf(g, 6) === canonicalOf(shuffled, 6),
    'the canonical form ignores node order and edge order');
  const star = buildShape('star'), chain = buildShape('chain');
  ok(canonicalOf(star, 6) !== canonicalOf(chain, 6), 'and separates two different shapes');
  ok(refineMatrix([[0, 1], [0, 0]], 2).length === 2, 'refinement returns one colour per node');
}

// COVERAGE. The number this module exists to publish.
for (const n of [4, 5, 6]) {
  const c = coverage(n, family(n).map((r) => r.graph));
  ok(c.outside === 0, `n = ${n}: every shape the family builds is a valid shape`);
  ok(c.space === KNOWN_COUNTS[n], `n = ${n}: coverage is measured against the true count`);
  ok(c.family <= c.space, `n = ${n}: the family cannot exceed the space`);
}
{
  const c = coverage(6, family(6).map((r) => r.graph));
  ok(c.percent < 5, `the layered family covers under 5% of the n=6 space (${c.percent}%)`);
  ok(c.family > 20, `and more than twenty shapes of it (${c.family}), since skip policies were added`);
}

// skip policies widen the family and are a real axis
ok(SKIPS.length === 4, 'four skip policies');
{
  const plain = buildProfile([1, 2, 2, 1], { skip: 'none' });
  const toSink = buildProfile([1, 2, 2, 1], { skip: 'sink' });
  const closed = buildProfile([1, 2, 2, 1], { skip: 'all' });
  ok(toSink.edges.length > plain.edges.length, 'skipping to the sink adds edges');
  ok(closed.edges.length > toSink.edges.length, 'the transitive closure adds more');
  ok(plain.depth === toSink.depth && plain.depth === closed.depth,
    'and none of them changes depth, because depth is the longest path');
  ok([plain, toSink, closed].every((g) => g.turns === 6), 'nor the turn count, which is 1+2+2+1');
}
let badSkip = false;
try { buildProfile([1, 2, 1], { skip: 'nonsense' }); } catch { badSkip = true; }
ok(badSkip, 'an unknown skip policy is refused rather than ignored');

// briefed is now a skip policy rather than a special case
ok(canonicalOf(buildProfile([1, 1, 1, 1, 1, 1], { briefed: true }), 6)
  === canonicalOf(buildProfile([1, 1, 1, 1, 1, 1], { skip: 'sink' }), 6),
'briefed and skip:sink build the same graph, so the special case is gone');

// sampling is deterministic and returns valid, distinct shapes
{
  const a = sampleShapes(9, 40, { seed: 5 });
  const b = sampleShapes(9, 40, { seed: 5 });
  ok(a.length === b.length, 'sampling is deterministic in its seed');
  ok(a.every((g, i) => canonicalOf(g, 9) === canonicalOf(b[i], 9)), 'and returns the same shapes');
  ok(a.every((g) => g.turns === 9 && g.source && g.sink), 'every sample is a valid shape');
  ok(new Set(a.map((g) => canonicalOf(g, 9))).size === a.length, 'and no two are isomorphic');
  ok(sampleShapes(9, 40, { seed: 6 }).some((g, i) => canonicalOf(g, 9) !== canonicalOf(a[i], 9)),
    'a different seed gives different shapes, so the seed is doing something');
}

// a sampled shape summarises like any other, which is what lets the page
// show all three modes through one table
for (const g of sampleShapes(10, 5, { seed: 3 })) {
  const r = summarise(g);
  ok(r.turns === 10 && Number.isFinite(r.sinkKen) && r.layerCensus.split('·').length === r.depth + 1,
    'a sampled shape summarises, and its layer census has one entry per depth');
}

// ── 8. whether the drawn graph is the graph ───────────────────────────
section('isolation regimes');

/* THE PRECONDITION THAT WENT UNSTATED FOR FIVE REVISIONS. An edge is a
   permission and the absence of one is a prohibition, but nothing in the
   plan enforces it. A turn also reads the worktree and the history, and
   under either sharing regime it sees everything upstream regardless of
   which arrows were drawn.

   The consequence is not a caveat. The ken ratio is the in-neighbourhood
   over the ancestry, so a turn that INHERITS its ancestry has a ratio of
   exactly 1 by construction. Under lineage or sharing the independent
   variable of H5 has no variance at all. */
ok(REGIMES.length === 3, 'three regimes');
ok(REGIMES.every((r) => REGIME_NOTE[r]), 'each regime says what it is');
ok(PRECONDITION.length > 60, 'the precondition is stated once, for citing');
let badRegime = false;
try { effectiveGraph(buildShape('chain'), 'nonsense'); } catch { badRegime = true; }
ok(badRegime, 'an unknown regime is refused rather than treated as isolated');

// isolated changes nothing, which is what makes it the baseline
for (const name of shapeNames()) {
  const g = buildShape(name);
  ok(effectiveGraph(g, 'isolated') === g, `${name}: the isolated regime returns the graph itself`);
  ok(auditRegime(g, 'isolated').leaked === 0, `${name}: and leaks nothing`);
  ok(auditRegime(g, 'isolated').enforced, `${name}: so the plan is enforced`);
}

// under lineage the effective in-neighbourhood IS the ancestry, so ken is
// 1 by construction. Asserted as a tautology, because that is what it is.
for (const name of shapeNames()) {
  const g = buildShape(name);
  const up = ancestors(g);
  const eff = effectiveGraph(g, 'lineage');
  ok(eff.edges.length === [...up.values()].reduce((s2, v) => s2 + v.size, 0),
    `${name}: lineage adds exactly one edge per ancestor`);
  const kens = [...kenRatio(eff).values()];
  ok(kens.every((k) => Math.abs(k - 1) < 1e-12),
    `${name}: under lineage every turn's ken ratio is exactly 1`);
}

// and under sharing likewise, by a different route
for (const name of shapeNames()) {
  const eff = effectiveGraph(buildShape(name), 'shared');
  ok([...kenRatio(eff).values()].every((k) => Math.abs(k - 1) < 1e-12),
    `${name}: under sharing every turn's ken ratio is exactly 1`);
}

// THE CONTRAST H5 RESTS ON DISAPPEARS
{
  const chainG = buildShape('chain'), briefedG = buildShape('briefed');
  const iso = [chainG, briefedG].map((g) => auditRegime(g, 'isolated'));
  ok(iso[0].sinkKenEffective !== iso[1].sinkKenEffective,
    'isolated: chain and briefed differ in sink ken, which is the whole of H5');
  for (const r of ['lineage', 'shared']) {
    const a = auditRegime(chainG, r), b = auditRegime(briefedG, r);
    ok(a.sinkKenEffective === 1 && b.sinkKenEffective === 1,
      `${r}: both arms reach sink ken 1`);
    ok(effectiveGraph(chainG, r).edges.length === effectiveGraph(briefedG, r).edges.length,
      `${r}: and both become the same size of graph, so the contrast is zero`);
  }
  ok(auditRegime(chainG, 'shared').leaked === 10,
    'a six-turn chain declares 5 edges and gets 15 under sharing, leaking 10');
}

// the collapse, measured against the whole space
{
  const gs = allShapes(6);
  const iso = collapse(gs, 'isolated', canonicalOf);
  ok(iso.shapesEffective === 1960 && iso.collapseFactor === 1, 'isolated: 1960 shapes stay 1960');
  ok(iso.measurable, 'isolated: the independent variable still varies');
  const lin = collapse(gs, 'lineage', canonicalOf);
  ok(lin.shapesEffective === 16, `lineage: 1960 shapes become 16 (got ${lin.shapesEffective})`);
  ok(!lin.measurable && lin.distinctSinkKen === 1, 'lineage: and sink ken takes one value');
  const sh = collapse(gs, 'shared', canonicalOf);
  ok(sh.shapesEffective === 8, `shared: 1960 shapes become 8 (got ${sh.shapesEffective})`);
  ok(!sh.measurable, 'shared: nothing is measurable');
  ok(sh.shapesEffective < lin.shapesEffective && lin.shapesEffective < iso.shapesEffective,
    'the three regimes are strictly ordered by how much they destroy');
}

// the register must carry the precondition, or a run could meet none of it
for (const id of ['H5', 'H6', 'H7']) {
  ok(HYPOTHESES[id].requires && /isolated/.test(HYPOTHESES[id].requires),
    `${id} states that it requires the isolated regime`);
}

console.log(`\n${fail === 0 ? '✓' : '✗'} profiles + ancestry ${fail === 0 ? 'passed' : 'FAILED'} — ${fail === 0 ? pass : `${fail} of ${pass + fail}`} checks`);
process.exit(fail === 0 ? 0 : 1);

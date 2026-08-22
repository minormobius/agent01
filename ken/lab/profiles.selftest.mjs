/* ken/lab/profiles.selftest.mjs — known answers for the generalisation.

   Two claims are checked here that are arithmetic, so a failure means the
   arithmetic is wrong rather than the world: the profile count is
   2^(n-3), and the isoperimetric floor is tight. One claim is EMPIRICAL —
   the frontier size — and is labelled so nobody reads it as proved. */

import {
  compositions, profiles, buildProfile, summarise, family, frontier,
  frontierOf, ladder, widthFloor, NAMED, WIRINGS,
} from '../graph/profiles.mjs';
import {
  ancestryDigests, ancestryClasses, poolAcross, comparePartitions,
  replicationByAncestry, hashStr, hex,
} from '../graph/ancestry.mjs';
import { automorphisms } from '../graph/roles.mjs';
import { buildShape, shapeNames, catalogue } from '../graph/shapes.mjs';

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

// EMPIRICAL: |frontier| = 2n - 4 held for every n from 5 to 14 when this
// was written. It is not proved. If it fails, that is a finding and the
// number should be re-reported, not the assertion relaxed.
for (const n of [5, 6, 7, 8, 9, 10, 11, 12]) {
  ok(frontierOf(family(n)).length === 2 * n - 4,
    `EMPIRICAL: the frontier at n = ${n} holds 2n-4 = ${2 * n - 4} points`);
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

console.log(`\n${fail === 0 ? '✓' : '✗'} profiles + ancestry ${fail === 0 ? 'passed' : 'FAILED'} — ${fail === 0 ? pass : `${fail} of ${pass + fail}`} checks`);
process.exit(fail === 0 ? 0 : 1);

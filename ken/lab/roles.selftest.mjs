/* ken/lab/roles.selftest.mjs — known answers for the role algebra.

   Every expectation here is derivable by hand from a drawing. Where one
   fails, check the arithmetic before the code: three of the first
   failures in design.selftest.mjs were wrong expectations, not bugs. */

import {
  ROLE_TABLE, ROLES, ROLE_DUTY, roles, adjacency, topological,
  kenRatio, blastRadius, betweenness, refine, automorphisms, poolable,
  positionTable, shapeInvariants,
} from '../graph/roles.mjs';
import {
  SHAPES, buildShape, shapeNames, catalogue, depthKenDesign,
  effectiveReplication, replicationLadder, collinearity,
  chainBriefedContrast, priceH5, H5, H6, TURNS_PER_SHAPE,
} from '../graph/shapes.mjs';

let pass = 0, fail = 0;
const ok = (cond, msg) => { if (cond) { pass++; } else { fail++; console.log(`  ✗ ${msg}`); } };
const near = (a, b, tol, msg) => ok(Math.abs(a - b) <= tol, `${msg} (got ${a}, want ${b}±${tol})`);
const section = (s) => console.log(`\n${s}`);

const G = (nodes, edges) => ({
  nodes: nodes.map((id) => ({ id, label: id })),
  edges: edges.map(([from, to]) => ({ from, to })),
});

// ── 1. the role basis is complete and total ───────────────────────────
section('the role basis');

ok(ROLES.length === 9, 'nine roles');
ok(new Set(ROLES).size === 9, 'the nine are distinct');
ok(ROLE_TABLE.length === 3 && ROLE_TABLE.every((r) => r.length === 3), 'the table is 3 in-classes by 3 out-classes');
ok(ROLES.every((r) => ROLE_DUTY[r]), 'every role names its duties and its exposure');

// originate/merge and report/split are the mutually exclusive pairs, which
// is why there are nine and not sixteen.
ok(ROLES.filter((r) => ROLE_DUTY[r].in === 'originate').length === 3, 'three roles originate');
ok(ROLES.filter((r) => ROLE_DUTY[r].in === 'merge').length === 3, 'three roles merge');
ok(ROLES.filter((r) => ROLE_DUTY[r].out === 'split').length === 3, 'three roles split');
ok(ROLES.filter((r) => ROLE_DUTY[r].in === 'merge' && ROLE_DUTY[r].out === 'split').length === 1,
  'exactly one role both merges and splits — broker, the only seat with real authority');

// A graph exhibiting all nine at once. Constructed by hand from the table:
// each node's in- and out-degree is chosen to land in one cell.
const ALL_NINE = G(
  ['solo', 'pr', 'br', 're', 'dg', 'bk', 'fu', 'ig', 'de'],
  [['pr', 're'], ['pr', 'dg'], ['br', 'bk'], ['re', 'bk'],
    ['dg', 'fu'], ['dg', 'ig'], ['bk', 'fu'], ['bk', 'de'], ['fu', 'ig']],
);
const nineRoles = roles(ALL_NINE);
ok(new Set(nineRoles.values()).size === 9, 'a single nine-node graph realises all nine roles');
for (const [id, want] of [['solo', 'solo'], ['pr', 'principal'], ['br', 'brief'], ['re', 'relay'],
  ['dg', 'delegate'], ['bk', 'broker'], ['fu', 'funnel'], ['ig', 'integrate'], ['de', 'deliver']]) {
  ok(nineRoles.get(id) === want, `${id} is ${want}, not ${nineRoles.get(id)}`);
}

// totality: every node of every catalogue shape gets exactly one known role
for (const name of shapeNames()) {
  const r = roles(buildShape(name));
  ok(r.size === TURNS_PER_SHAPE && [...r.values()].every((v) => ROLES.includes(v)),
    `${name}: every turn has exactly one role from the basis`);
}

// ── 2. the invariants, on graphs small enough to check by eye ─────────
section('invariants on hand-checkable graphs');

const CHAIN4 = G(['a', 'b', 'c', 'd'], [['a', 'b'], ['b', 'c'], ['c', 'd']]);
const r4 = roles(CHAIN4);
ok(r4.get('a') === 'brief' && r4.get('b') === 'relay' && r4.get('c') === 'relay' && r4.get('d') === 'deliver',
  'a 4-chain is brief, relay, relay, deliver');

// ken: a sees {a}/{a}=1; b sees {a,b}/{a,b}=1; c sees {b,c}/{a,b,c}=2/3; d sees {c,d}/4
const k4 = kenRatio(CHAIN4);
near(k4.get('a'), 1, 1e-12, '4-chain: the source has full ken');
near(k4.get('b'), 1, 1e-12, '4-chain: the second turn still has full ken');
near(k4.get('c'), 2 / 3, 1e-12, '4-chain: the third turn holds 2 of 3');
near(k4.get('d'), 0.5, 1e-12, '4-chain: the last turn holds 2 of 4');

// one path visits everything, so every node is on all of it
const b4 = betweenness(CHAIN4);
ok(['a', 'b', 'c', 'd'].every((id) => Math.abs(b4.get(id) - 1) < 1e-12), '4-chain: every turn has betweenness 1');

const bl4 = blastRadius(CHAIN4);
ok(bl4.get('a') === 3 && bl4.get('b') === 2 && bl4.get('c') === 1 && bl4.get('d') === 0,
  '4-chain: blast radius counts down 3,2,1,0');

const STAR3 = G(['s', 'x', 'y', 'z', 't'],
  [['s', 'x'], ['s', 'y'], ['s', 'z'], ['x', 't'], ['y', 't'], ['z', 't']]);
const rs = roles(STAR3);
ok(rs.get('s') === 'principal' && rs.get('t') === 'integrate' && rs.get('x') === 'relay',
  '3-star is principal, three relays, integrate');
const bs = betweenness(STAR3);
near(bs.get('s'), 1, 1e-12, '3-star: the source is on every path');
near(bs.get('x'), 1 / 3, 1e-12, '3-star: each arm carries a third of the paths');
near(bs.get('t'), 1, 1e-12, '3-star: the sink is on every path');
near(kenRatio(STAR3).get('t'), 4 / 5, 1e-12, '3-star: the sink sees 4 of 5');

ok(topological(CHAIN4).join('') === 'abcd', 'topological order of a chain is the chain');
let cyclic = false;
try { topological(G(['p', 'q'], [['p', 'q'], ['q', 'p']])); } catch { cyclic = true; }
ok(cyclic, 'a cycle is refused rather than half-sorted');

// ── 3. symmetry: the group orders are factorials we can name ──────────
section('automorphisms');

ok(automorphisms(CHAIN4).order === 1, 'a chain has only the identity');
ok(automorphisms(STAR3).order === 6, 'a 3-star has 3! = 6 automorphisms');
ok(automorphisms(STAR3).orbits.length === 3, 'a 3-star has 3 orbits: source, arms, sink');
ok(automorphisms(STAR3).orbits.some((o) => o.length === 3), 'the three arms form one orbit');

const AUT = { chain: 1, standard: 2, lattice: 4, star: 24, bottleneck: 6, briefed: 1 };
for (const [name, order] of Object.entries(AUT)) {
  ok(automorphisms(buildShape(name)).order === order, `|Aut(${name})| = ${order}`);
}
// 4! for four interchangeable workers, 3! for three, 2!x2! for two lanes of two
ok(AUT.star === 24 && AUT.bottleneck === 6 && AUT.lattice === 4,
  'the group orders are the factorials the drawings predict');

const ORBITS = { chain: 6, standard: 4, lattice: 4, star: 3, bottleneck: 4, briefed: 6 };
for (const [name, n] of Object.entries(ORBITS)) {
  ok(automorphisms(buildShape(name)).orbits.length === n, `${name} has ${n} orbits`);
}

// refinement is a coarsening of orbits, always; whether it is EXACT is a
// claim about these graphs and is asserted so it keeps being checked
for (const name of shapeNames()) {
  const a = automorphisms(buildShape(name));
  ok(a.refinementIsExact, `${name}: 1-WL refinement already gives the orbit partition`);
  ok(!a.truncated, `${name}: the automorphism search finished inside its cap`);
}

// every node of a chain is alone in its orbit — a chain contains no
// replication whatsoever, which is the point
ok(poolable(buildShape('chain')).every((c) => !c.exchangeable),
  'no two turns of a chain are exchangeable');
ok(poolable(buildShape('star')).filter((c) => c.exchangeable).length === 1,
  'a star has exactly one pool of exchangeable turns');

// ── 4. the catalogue ──────────────────────────────────────────────────
section('the six-turn catalogue');

for (const name of shapeNames()) {
  const g = buildShape(name);
  ok(g.turns === TURNS_PER_SHAPE, `${name} costs exactly ${TURNS_PER_SHAPE} turns`);
  ok(g.nodes.length === new Set(g.nodes.map((n) => n.id)).size, `${name}: node names are unique`);
  ok(g.edges.every((e) => g.nodes.some((n) => n.id === e.from) && g.nodes.some((n) => n.id === e.to)),
    `${name}: every edge names nodes in the graph`);
}
ok(shapeNames().length === 6, 'six shapes');

const cat = catalogue();
const by = Object.fromEntries(cat.map((r) => [r.name, r]));
ok(by.chain.depth === 5 && by.chain.width === 1, 'chain: depth 5, width 1');
ok(by.star.depth === 2 && by.star.width === 4, 'star: depth 2, width 4');
ok(by.briefed.depth === 5 && by.briefed.width === 1, 'briefed: depth 5, width 1 — a chain by depth');
// the catalogue rounds to 3dp because it is published, so these compare at
// that resolution rather than pretending the table carries more.
const DP3 = 1e-3;
near(by.chain.sinkKen, 1 / 3, DP3, 'chain sink ken = 2/6');
near(by.briefed.sinkKen, 1, 1e-12, 'briefed sink ken = 6/6, which is exact');
near(by.star.sinkKen, 5 / 6, DP3, 'star sink ken = 5/6');
near(by.bottleneck.sinkKen, 1 / 3, DP3, 'bottleneck sink ken = 2/6, matching the chain at depth 3');

// standard and star have the SAME role census and different graphs, which
// is the controlled test of whether a role census is enough
const census = (n) => JSON.stringify(Object.entries(by[n].roles).sort());
ok(census('standard') === census('star'),
  'standard and star have identical role censuses');
ok(by.standard.depth !== by.star.depth && by.standard.autOrder !== by.star.autOrder,
  'yet differ in depth and in symmetry — so a role census alone cannot be the whole model');

// standard and lattice differ ONLY in the wiring of wave B
ok(SHAPES.standard.nodes.join() === SHAPES.lattice.nodes.join(),
  'standard and lattice have the same turns');
ok(by.standard.depth === by.lattice.depth && by.standard.sinkKen === by.lattice.sinkKen,
  'and the same depth and sink ken');
ok(census('standard') !== census('lattice'),
  'but different role censuses — the lane wiring is the only difference');

// ── 5. the design: depth and ken cross ────────────────────────────────
section('the depth-by-ken design');

const design = depthKenDesign();
ok(design.crossed, 'all four depth-by-ken cells are occupied');
ok(Math.abs(design.correlation) < 0.2,
  `depth and ken are near-orthogonal across the catalogue (r = ${design.correlation})`);
ok(design.cells['deep/blind'].includes('chain'), 'chain is the deep, blind cell');
ok(design.cells['deep/sighted'].includes('briefed'), 'briefed is the deep, sighted cell');
ok(design.cells['shallow/sighted'].includes('star'), 'star is the shallow, sighted cell');
ok(design.cells['shallow/blind'].includes('bottleneck'), 'bottleneck is the shallow, blind cell');

// and are collinear WITHIN a run, which is the correction that matters
const col = collinearity();
const colBy = Object.fromEntries(col.map((c) => [c.shape, c]));
ok(colBy.briefed.vif < 2, `briefed separates depth from ken within one run (VIF ${colBy.briefed.vif})`);
ok(colBy.chain.vif > 10, `a chain does not (VIF ${colBy.chain.vif})`);
ok(col.filter((c) => c.separable).length === 1,
  'exactly one shape in the catalogue supports a within-run decomposition');
ok(col[0].shape === 'briefed', 'and the ladder puts it first');

const cb = chainBriefedContrast();
ok(cb.differingTurns === 1, 'chain and briefed differ at exactly one turn');
ok(cb.extraTurns === 0, 'and briefed costs no extra turns');
ok(cb.extraEdges === 4, 'four added edges do it — t4 already reported');
near(cb.kenGap, 2 / 3, DP3, 'the manipulation moves sink ken by 0.667');
ok(cb.matched.slice(0, 5).every((m) => m.same), 'every turn but the last is matched exactly');

// ── 6. free replication ───────────────────────────────────────────────
section('replication a run already contains');

const star = effectiveReplication('star', { rho: 0.413 });
ok(star.rawReplicates === 4, 'a star holds four structurally identical turns');
near(star.deff, 1 + 3 * 0.413, 1e-9, 'deff = 1 + (m-1)rho');
near(star.effective, 4 / (1 + 3 * 0.413), DP3, 'effective replicates = m / deff');
near(star.effective, 1.787, 5e-4, 'which is 1.79 at the measured rho');
ok(effectiveReplication('chain').rawReplicates === 1, 'a chain holds one');
near(effectiveReplication('chain').effective, 1, 1e-12, 'so a chain gains nothing');

// the two limits of deff, which are the sanity check on the formula
near(effectiveReplication('star', { rho: 0 }).effective, 4, 1e-12,
  'at rho = 0 the four replicates are worth four');
near(effectiveReplication('star', { rho: 1 }).effective, 1, 1e-12,
  'at rho = 1 they are worth one');

const ladder = replicationLadder();
ok(ladder[0].shape === 'star', 'star leads the replication ladder');
ok(ladder[ladder.length - 1].effective === 1, 'the chains bring up the rear at 1.00');
ok(ladder.every((r, i) => i === 0 || r.effective <= ladder[i - 1].effective), 'the ladder is sorted');
near(ladder[0].relativeToChain, 1.787, 5e-4, 'star buys 1.79x a chain for the same six turns');

// ── 7. pricing ────────────────────────────────────────────────────────
section('what H5 costs');

const p8 = priceH5({ d: 0.8 });
// per arm unpaired = ceil(2 ((1.96+0.8416)/0.8)^2) = ceil(24.53) = 25
ok(p8.unpaired.runs === 50, 'd = 0.8 unpaired: 25 per arm, 50 runs');
ok(p8.unpaired.turns === 300, 'which is 300 turns');
ok(p8.paired.pairs === 15, 'paired: ceil(25 x (1 - 0.413)) = 15 pairs');
ok(p8.paired.turns === 180, 'which is 180 turns, both shapes per pair');
near(p8.paired.saving, 0.4, 1e-9, 'pairing saves 40% of the turns');
ok(p8.withinRun.turns === 90, 'the within-run slope is 90 turns');
ok(p8.withinRun.shape === 'briefed', 'and is priced on briefed runs, the only separable shape');
ok(p8.paired.turns > p8.withinRun.turns, 'the shape contrast costs more than the slope, as it must');

const p10 = priceH5({ d: 1.0 });
ok(p10.paired.turns < p8.paired.turns, 'a larger effect is cheaper');
ok(priceH5({ d: 0.5 }).paired.turns > p8.paired.turns, 'a smaller effect is dearer');

// ── 8. the hypotheses are stated so they can lose ─────────────────────
section('H5 and H6');

for (const H of [H5, H6]) {
  ok(typeof H.claim === 'string' && H.claim.length > 20, `${H.id}: has a claim`);
  ok(H.refutedBy.length >= 2, `${H.id}: names at least two ways to lose`);
  ok(H.predicts.length >= 2, `${H.id}: makes at least two ordered predictions`);
  ok(typeof H.outcome === 'string' && typeof H.analysisUnit === 'string', `${H.id}: names an outcome and a unit of analysis`);
}
// H6's headline number is arithmetic and should match the ladder
const predicted = Math.sqrt(1 / effectiveReplication('star').effective);
near(predicted, 0.748, 5e-4, 'H6 predicts SE(star)/SE(chain) = 0.75 before any data');
ok(H6.predicts[0][0].includes('0.75'), 'and says so in its own statement');

// ── 9. the table joins, and nothing is missing ────────────────────────
section('the joined position table');

for (const name of shapeNames()) {
  const t = positionTable(buildShape(name));
  ok(t.length === TURNS_PER_SHAPE, `${name}: a row per turn`);
  ok(t.every((r) => r.role && Number.isFinite(r.ken) && Number.isFinite(r.between)
    && Number.isInteger(r.blast) && Number.isInteger(r.orbit)),
  `${name}: every row is fully populated`);
  ok(t.every((r) => r.ken > 0 && r.ken <= 1), `${name}: ken ratios lie in (0, 1]`);
  ok(t.every((r) => r.between >= 0 && r.between <= 1), `${name}: betweenness lies in [0, 1]`);
  const inv = shapeInvariants(buildShape(name));
  ok(Object.values(inv.roles).reduce((s, x) => s + x, 0) === TURNS_PER_SHAPE,
    `${name}: the role census sums to the turn count`);
  ok(t.filter((r) => r.orbitSize === inv.largestOrbit).length >= inv.largestOrbit,
    `${name}: the largest orbit is reported consistently`);
}

// the source always has ken 1 and the graph always has exactly one
for (const name of shapeNames()) {
  const g = buildShape(name);
  near(positionTable(g).find((r) => r.id === g.source).ken, 1, 1e-12,
    `${name}: the source has full ken by definition`);
}

console.log(`\n${fail === 0 ? '✓' : '✗'} roles + shapes ${fail === 0 ? 'passed' : 'FAILED'} — ${fail === 0 ? pass : `${fail} of ${pass + fail}`} checks`);
process.exit(fail === 0 ? 0 : 1);

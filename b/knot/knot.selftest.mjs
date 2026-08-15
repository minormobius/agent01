// knot selftest — run before changing kcore.js:
//   node b/knot/knot.selftest.mjs
//
// Two things need proving here, and only one of them is ordinary unit testing:
//
//   THE PEELING IS RIGHT. Core numbers have known answers on small graphs, so
//   they are checked against hand-worked ones. A wrong k does not crash, it just
//   reports the wrong group of people — the worst kind of bug this file can have.
//
//   THE STEERING ACTUALLY STEERS. The whole product claim is that fetching in
//   in-degree order finds the dense core in a fraction of the rows. That is an
//   empirical claim about an algorithm, so it is MEASURED here against random
//   order on a planted graph, and the test fails if the advantage disappears.
//   Without this, a refactor could quietly turn the clever crawl into a slow one
//   and every test would still pass.

import { Knot } from './kcore.js';

let failures = 0;
const ok = (c, m) => { if (!c) { failures++; console.error('  ✗ ' + m); } };
const eq = (a, b, m) => ok(Object.is(a, b), `${m} (got ${JSON.stringify(a)}, want ${JSON.stringify(b)})`);

// ── core numbers, by hand ────────────────────────────────────────────────────
{
  // A triangle plus a pendant: the triangle is a 2-core, the pendant is not.
  const adj = new Map([
    ['a', new Set(['b', 'c'])],
    ['b', new Set(['a', 'c'])],
    ['c', new Set(['a', 'b', 'd'])],
    ['d', new Set(['c'])],
  ]);
  const core = Knot.coreNumbers(adj);
  eq(core.get('d'), 1, 'a pendant vertex has core number 1');
  eq(core.get('a'), 2, 'a triangle member has core number 2');
  eq(core.get('c'), 2, 'and so does the one holding the pendant');

  // A 4-clique: everybody has core number 3.
  const clique = new Map(['w', 'x', 'y', 'z'].map((v, _, all) =>
    [v, new Set(all.filter((o) => o !== v))]));
  const c2 = Knot.coreNumbers(clique);
  ok([...c2.values()].every((v) => v === 3), 'every member of a 4-clique has core number 3');

  eq(Knot.coreNumbers(new Map()).size, 0, 'an empty graph has no core numbers');
}

// ── mutuality is required, not assumed ───────────────────────────────────────
{
  const k = new Knot(['a', 'b', 'c']);
  k.addRow('a', ['b', 'c']);
  k.addRow('b', ['a']);
  // c never fetched: a->c is known but c->a is not, so it is NOT an edge yet.
  const adj = k.adjacency();
  eq(adj.size, 2, 'only fetched accounts appear in the confirmed graph');
  ok(adj.get('a').has('b') && adj.get('b').has('a'), 'a<->b is confirmed in both directions');
  ok(!adj.get('a').has('c'), 'a->c alone is not an edge — the other half is unknown');

  k.addRow('c', ['a']);
  ok(k.adjacency().get('a').has('c'), 'and becomes one as soon as the other row lands');
}

{
  const k = new Knot(['a', 'b']);
  k.addRow('a', ['b', 'someone-outside-the-set', 'another']);
  eq(k.out.get('a').size, 1, 'follows outside the candidate set are dropped, not stored');
  k.addRow('a', ['b']);
  eq(k.fetched, 1, 'a row is only counted once');
  k.addRow('not-a-member', ['a']);
  eq(k.fetched, 1, 'and a non-member cannot add one');
}

// ── the anytime guarantee ────────────────────────────────────────────────────
// Every core reported must be a REAL core of the full graph. Build a graph,
// reveal it in a random order, and after every row check that the claimed core
// really does have min-degree k inside the FULL adjacency.
{
  const N = 60;
  const nodes = Array.from({ length: N }, (_, i) => 'n' + i);
  const truth = new Map(nodes.map((n) => [n, new Set()]));
  const link = (a, b) => { truth.get(a).add(b); truth.get(b).add(a); };
  for (let i = 0; i < 20; i++) for (let j = i + 1; j < 20; j++) link('n' + i, 'n' + j);   // planted 20-clique
  for (let i = 20; i < N; i++) link('n' + i, 'n' + ((i + 1) % N));                        // sparse rim

  const k = new Knot(nodes, 'guarantee');
  let violations = 0, sawCore = 0;
  const order = nodes.slice().reverse();
  for (const node of order) {
    k.addRow(node, [...truth.get(node)]);
    const { k: kk, members } = k.core();
    if (kk > 0) {
      sawCore++;
      for (const m of members) {
        let deg = 0;
        for (const other of members) if (other !== m && truth.get(m).has(other)) deg++;
        if (deg < kk) violations++;
      }
    }
  }
  eq(violations, 0, 'every intermediate core is a genuine k-core of the full graph');
  ok(sawCore > 5, 'and cores were actually reported along the way, not just at the end');
}

// ── the steering, measured ───────────────────────────────────────────────────
// A planted community inside a much larger sparse graph. In-degree order should
// reach the community in far fewer rows than random order. If that stops being
// true, the product claim is gone and this test is the only thing that notices.
{
  const N = 400, CLUSTER = 50;
  const nodes = Array.from({ length: N }, (_, i) => 'n' + i);
  const truth = new Map(nodes.map((n) => [n, new Set()]));
  const link = (a, b) => { truth.get(a).add(b); truth.get(b).add(a); };
  for (let i = 0; i < CLUSTER; i++) for (let j = i + 1; j < CLUSTER; j++) link('n' + i, 'n' + j);
  // Everyone else gets a handful of arbitrary but deterministic edges.
  let s = 12345;
  const rnd = () => (s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  for (let i = CLUSTER; i < N; i++) {
    for (let e = 0; e < 3; e++) link('n' + i, 'n' + Math.floor(rnd() * N));
  }

  const run = (steered) => {
    const k = new Knot(nodes, 'steer');
    const randomOrder = nodes.slice();
    let t = 999;
    const rr = () => (t = (t * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
    for (let i = randomOrder.length - 1; i > 0; i--) {
      const j = Math.floor(rr() * (i + 1));
      [randomOrder[i], randomOrder[j]] = [randomOrder[j], randomOrder[i]];
    }
    let ri = 0;
    for (let step = 0; step < N; step++) {
      const batch = steered ? k.nextTargets(8) : [randomOrder[ri++]].filter(Boolean);
      if (!batch.length) break;
      for (const d of batch) k.addRow(d, [...truth.get(d)]);
      if (k.core().k >= CLUSTER - 1) return k.fetched;    // found the planted clique
    }
    return Infinity;
  };

  const steered = run(true);
  const blind = run(false);
  console.log(`  · rows needed to find the planted ${CLUSTER}-clique: steered ${steered}, random ${blind}`);
  ok(steered < N, 'in-degree ordering finds the planted community');
  ok(steered <= blind, 'and never needs more rows than blind ordering');
  ok(steered <= blind * 0.75 || blind === Infinity,
    `steering is meaningfully better than random (steered ${steered} vs ${blind})`);
}

// ── bootstrap ordering is deterministic ──────────────────────────────────────
{
  const nodes = Array.from({ length: 50 }, (_, i) => 'n' + i);
  const a = new Knot(nodes, 'did:plc:same').nextTargets(10);
  const b = new Knot(nodes, 'did:plc:same').nextTargets(10);
  const c = new Knot(nodes, 'did:plc:other').nextTargets(10);
  eq(JSON.stringify(a), JSON.stringify(b), 'the same seed bootstraps in the same order');
  ok(JSON.stringify(a) !== JSON.stringify(c), 'and a different seed does not');
  eq(new Knot([], 'x').nextTargets(5).length, 0, 'an empty candidate set asks for nothing');
}

if (failures) {
  console.error(`\n✗ knot selftest FAILED — ${failures} assertion(s)\n`);
  process.exit(1);
}
console.log('✓ knot selftest passed — core numbers, mutuality, the anytime guarantee, and that in-degree steering really does beat random order');

/* ken/lab/plan.selftest.mjs — the four morph laws, as assertions. */
import { probe, build, probeMatchesBuild, depths, CELLS, FALLBACKS, PlanFailure } from '../graph/plan.mjs';
import { relax, renderPlan } from '../graph/layout.mjs';
import { buildProfile } from '../graph/profiles.mjs';

let checks = 0, failures = 0;
const ok = (c, m) => { checks++; if (!c) { failures++; console.error(`  ✗ ${m}`); } };
const throws = (fn, m) => { checks++; try { fn(); failures++; console.error(`  ✗ ${m} (did not throw)`); } catch {} };
const section = (t) => console.log(`\n${t}`);
const has = (g, from, to) => g.edges.some((e) =>
  g.nodes.find((n) => n.id === e.from)?.label === from && g.nodes.find((n) => n.id === e.to)?.label === to);

// ── law 4: probe and build are the same interpreter ───────────────────
section('law 4 — probe and build agree');
for (const args of [
  { conditions: ['a', 'b'], replicates: 1 },
  { conditions: ['a', 'b'], replicates: 5 },
  { conditions: ['a', 'b', 'c', 'd'], replicates: 3 },
  { conditions: ['solo'], replicates: 2 },
  { conditions: ['a', 'b'], replicates: 10, budget: 20 },
  { conditions: ['a', 'b', 'c'], replicates: 4, budget: 41 },
]) {
  const m = probeMatchesBuild('experiment', args);
  ok(m.ok, `probe matches build for ${JSON.stringify(args)} (${m.probeTurns} vs ${m.buildTurns} turns, `
    + `${m.probeFailures} vs ${m.buildFailures} failures)`);
}
ok(probe('experiment', { conditions: ['a', 'b'], replicates: 2 }).nodes === 0,
   'probe creates no nodes');

// ── law 1: cells are rewrite rules ────────────────────────────────────
section('law 1 — rewrite rules');
{
  const g = build('experiment', { conditions: ['ctl', 'trt'], replicates: 3 });
  ok(g.turns === 18, `three runs of six turns is 18 (got ${g.turns})`);
  ok(g.nodes.length === 18, 'one node per turn');
  ok(g.depth === 3, `four stages is depth 3 (got ${g.depth})`);
  ok(g.nodes.filter((n) => n.kind === 'block').length === 6, 'six block turns: a setup and a cleanup per run');
}

// ── law 2: widths are inferred ────────────────────────────────────────
section('law 2 — widths inferred, not declared');
{
  const two = build('experiment', { conditions: ['a', 'b'], replicates: 1 });
  const four = build('experiment', { conditions: ['a', 'b', 'c', 'd'], replicates: 1 });
  ok(two.turns === 6 && four.turns === 10, `the same cell gives 6 and 10 turns (got ${two.turns}, ${four.turns})`);
  ok(two.depth === four.depth, 'and the same depth: width changed, not the shape');
  ok(four.nodes.filter((n) => n.depth === 1).length === 4, 'a four-condition bus makes a wave of four');
}

// ── law 3: the only control flow is failure ───────────────────────────
section('law 3 — failure is the control flow');
{
  const g = build('experiment', { conditions: ['solo'], replicates: 2 });
  ok(g.failures.length === 4, `a bus of one fails at every wave (got ${g.failures.length})`);
  ok(g.failures.every((f) => f.cell === 'wave'), 'and unwinds at the wave, not above it');
  ok(g.nodes.filter((n) => n.kind === 'degraded').length === 4, 'the fallback marks its nodes degraded');
  ok(g.turns === 8, `two degraded runs are 8 turns, not 12 (got ${g.turns})`);
}
{
  const g = build('experiment', { conditions: ['a', 'b'], replicates: 10, budget: 20 });
  ok(g.turns <= 20, `the budget is respected (got ${g.turns})`);
  ok(g.turns === 18, 'and it keeps the three runs it could afford');
  ok(g.failures.some((f) => /budget/.test(f.reason)), 'the failure names the budget');
}
throws(() => build('experiment', { conditions: ['a', 'b'], replicates: 0 }),
       'a zero-run experiment fails, and the budget fallback does not swallow it');
throws(() => build('experiment', { conditions: ['a', 'b'], replicates: 0, budget: 60 }),
       'and a budget does not license repairing it by GROWING the design');
ok(typeof FALLBACKS.wave === 'function' && typeof CELLS.wave === 'function',
   'every failing cell has a fallback beside it');

// ── depth is recomputed, not guessed ──────────────────────────────────
section('depth');
{
  const g = { nodes: [{ id: 'a' }, { id: 'b' }, { id: 'c' }], edges: [{ from: 'a', to: 'b' }, { from: 'b', to: 'c' }] };
  const d = depths(g);
  ok(d.get('a') === 0 && d.get('b') === 1 && d.get('c') === 2, 'a chain has depths 0,1,2');
}
{
  const diamond = { nodes: [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }],
    edges: [{ from: 'a', to: 'b' }, { from: 'a', to: 'c' }, { from: 'b', to: 'd' }, { from: 'c', to: 'd' }] };
  ok(depths(diamond).get('d') === 2, 'a diamond joins at depth 2');
}
throws(() => depths({ nodes: [{ id: 'x' }, { id: 'y' }], edges: [{ from: 'x', to: 'y' }, { from: 'y', to: 'x' }] }),
       'a cycle is refused');

// ── lanes, not a barrier ──────────────────────────────────────────────
section('lane wiring');
{
  const g = build('experiment', { conditions: ['ctl', 'trt'], replicates: 1 });
  ok(has(g, 'A1·ctl', 'B1·ctl') && has(g, 'A1·trt', 'B1·trt'), 'each condition continues into its own lane');
  ok(!has(g, 'A1·ctl', 'B1·trt') && !has(g, 'A1·trt', 'B1·ctl'),
     'and does NOT cross — the first version made this complete bipartite');
  ok(has(g, 'setup 1', 'A1·ctl') && has(g, 'setup 1', 'A1·trt'), 'setup still fans out to every arm');
  ok(has(g, 'B1·ctl', 'cleanup 1') && has(g, 'B1·trt', 'cleanup 1'), 'and cleanup joins them');
  ok(g.edges.length === 6, `six edges, not eight (got ${g.edges.length})`);
}

// ── the display comes free ────────────────────────────────────────────
section('derived layout');
{
  const g = build('experiment', { conditions: ['a', 'b'], replicates: 3 });
  ok(renderPlan(g) === renderPlan(g), 'the same graph renders byte-identically');
  // The layout is seed-independent: it settles to the same configuration from
  // any start. The seed only breaks the initial symmetry.
  ok(renderPlan(g, { seed: 1 }) === renderPlan(g, { seed: 12345 }),
     'and converges to the same layout from a different start — the picture is a function of the graph');
  // Agreement is to about 1e-7, so compare with a tolerance rather than by
  // string: toFixed(2) straddles a rounding boundary and reports a difference
  // that is floating-point residue.
  const base = relax(g, { seed: 7 });
  for (const seed of [1, 2, 99, 4242, 12345]) {
    const alt = relax(g, { seed });
    const worst = Math.max(...alt.map((n, i) => Math.abs(n.x - base[i].x)));
    ok(worst < 1e-6, `seed ${seed} settles where seed 7 does, to ${worst.toExponential(1)}`);
  }
  const placed = relax(g, { seed: 7 });
  const bands = {};
  for (const p of placed) (bands[p.depth] ||= []).push(p.x);
  for (const [d, xs] of Object.entries(bands)) {
    const s = xs.slice().sort((a, b) => a - b);
    for (let i = 1; i < s.length; i++) ok(s[i] - s[i - 1] >= 45, `no overlap within depth ${d}`);
  }
  ok(placed.every((p) => p.y === p.depth * 90), 'y is pinned to depth, so height means elapsed time');
}
{
  // the claim: widening the design costs no geometry
  const four = build('experiment', { conditions: ['a', 'b', 'c', 'd'], replicates: 2 });
  const svg = renderPlan(four);
  ok(svg.includes('<svg') && svg.length > 1000, 'a four-condition plan renders with no layout changes');
  ok((svg.match(/<circle/g) || []).length === four.nodes.length, 'and draws every node');
}

// ── skip edges must be visible ────────────────────────────────────────
section('skip edges');

/* THE REGRESSION THIS SECTION EXISTS FOR. renderPlan drew every edge as a
   bezier whose control points sat directly below the source and above the
   target. On a graph one node wide that is a straight vertical line, so an
   edge from depth 0 to depth 2 ran through the node it skipped, under the
   nodes, exactly on top of the two adjacent edges covering the same span.

   A six-turn chain with 5, 9, 9 and 15 edges rendered as FOUR IDENTICAL
   PICTURES. Nothing here noticed, because every check was about node
   positions and none about whether an edge could be seen. */
{
  const variants = ['none', 'sink', 'one', 'all'].map((skip) => {
    const g = buildProfile([1, 1, 1, 1, 1, 1], { skip });
    return { skip, g, svg: renderPlan(g, { width: 220, rowHeight: 52 }) };
  });

  ok(variants.map((v) => v.g.edges.length).join() === '5,9,9,15',
    'the four skip policies give 5, 9, 9 and 15 edges on a six-turn chain');
  /* Distinct SVG SOURCE is a weaker claim than distinct APPEARANCE, and
     the old renderer passed this one: its four strings differed in their
     path count and endpoints while drawing the same overlapping lines. It
     is kept because a collision here would still be a fault, and the
     checks below are the ones that actually caught the bug. */
  ok(new Set(variants.map((v) => v.svg)).size === 4,
    'the four policies emit four different SVG sources (necessary, not sufficient)');

  // THE VISUAL CHECK. Every node of a width-one chain shares one column,
  // so if every drawn point sits on that column the picture is one line
  // whatever the edge count says.
  for (const v of variants) {
    const xs = new Set([...v.svg.matchAll(/[MC] ([\d.-]+) [\d.-]+/g)].map((m) => m[1]));
    const hasSkips = v.g.edges.length > 5;
    ok(hasSkips ? xs.size > 1 : xs.size === 1,
      `skip:${v.skip}: the drawing ${hasSkips ? 'leaves' : 'stays on'} the single column`);
  }

  // and no two edges may trace the same path
  for (const v of variants) {
    const ds = [...v.svg.matchAll(/<path class="[^"]*" d="([^"]+)"/g)].map((m) => m[1]);
    ok(new Set(ds).size === ds.length, `skip:${v.skip}: no two edges are drawn identically`);
  }

  const depthOf = (g) => new Map(g.nodes.map((n) => [n.id, n.depth]));
  for (const v of variants) {
    const d = depthOf(v.g);
    const wantSkips = v.g.edges.filter((e) => d.get(e.to) - d.get(e.from) > 1).length;
    const paths = [...v.svg.matchAll(/<path class="([^"]*)" d="M ([\d.]+) [\d.]+ C ([\d.]+) /g)];
    ok(paths.length === v.g.edges.length, `skip:${v.skip}: one path drawn per edge`);
    const skips = paths.filter((m) => m[1].includes('pl-skip'));
    ok(skips.length === wantSkips, `skip:${v.skip}: all ${wantSkips} multi-depth edges are marked`);
    // every node of a width-one chain shares an x, so a straight vertical
    // path is exactly the failure
    for (const m of skips) {
      ok(Math.abs(+m[3] - +m[2]) > 1,
        `skip:${v.skip}: a skip's control point leaves its endpoint x, so it is not drawn straight`);
    }
  }

  // the bow grows with the span, or a 2-skip and a 5-skip would coincide
  {
    const svg = variants[3].svg;
    const offs = [...svg.matchAll(/class="pl-edge pl-skip" d="M ([\d.]+) [\d.]+ C ([\d.]+) /g)]
      .map((m) => Math.abs(+m[2] - +m[1]).toFixed(1));
    ok(new Set(offs).size >= 3, `skips of different spans bow differently (${new Set(offs).size} amounts)`);
  }

  // a bow must not leave the drawing
  for (const v of variants) {
    const xs = [...v.svg.matchAll(/[MC] ([\d.-]+) [\d.-]+/g)].map((m) => +m[1]);
    ok(xs.every((x) => x >= 0 && x <= 220), `skip:${v.skip}: no control point leaves the viewport`);
  }

  // a graph with no skips is drawn exactly as before, so figures do not churn
  ok(!renderPlan(buildProfile([1, 2, 2, 1], { skip: 'none' }), { width: 220, rowHeight: 52 })
    .includes('pl-skip'), 'a graph with no skip edges emits no skip class at all');
}

console.log('');
if (failures) { console.error(`✗ plan + layout FAILED — ${failures} of ${checks} checks`); process.exit(1); }
console.log(`✓ plan + layout passed — ${checks} checks`);

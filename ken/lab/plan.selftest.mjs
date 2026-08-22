/* ken/lab/plan.selftest.mjs — the four morph laws, as assertions. */
import { probe, build, probeMatchesBuild, depths, CELLS, FALLBACKS, PlanFailure } from './plan.mjs';
import { relax, renderPlan } from './layout.mjs';

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

console.log('');
if (failures) { console.error(`✗ plan + layout FAILED — ${failures} of ${checks} checks`); process.exit(1); }
console.log(`✓ plan + layout passed — ${checks} checks`);

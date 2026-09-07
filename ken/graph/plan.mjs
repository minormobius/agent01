/* ─────────────────────────────────────────────────────────────────────
   ken/lab/plan.mjs — an experiment as rewrite rules.

   The laws are taken from morph (g.mino.mobi/morph), which takes them
   from Mordvintsev's MorphoHDL. Four of them transfer to experiment
   design, and one is the reason to bother:

   1. CELLS ARE REWRITE RULES. A stage is not a record in a list. It is a
      body that expands into sub-stages and wires them together.

   2. WIDTHS ARE INFERRED, NOT DECLARED. A wave is as wide as the
      condition bus handed to it. One definition covers two conditions
      and six.

   3. THE ONLY CONTROL FLOW IS FAILURE. A wave on a one-condition bus
      fails. A run that exceeds the budget fails. The planner unwinds to
      that cell's fallback, and recursion stops when the buses stop
      dividing. The stopping rule is therefore the same mechanism that
      terminates the recursion, not a separate check bolted on.

   4. PROBE AND BUILD ARE THE SAME INTERPRETER BEHIND ONE FLAG. This is
      the law worth having. `probe` runs a cell body allocating throwaway
      ids and creating no nodes, purely to learn how big it gets. Because
      it is the same code, the cost estimate cannot drift from the plan
      it estimates — which is exactly the failure mode a cost table
      maintained beside a runner would eventually have.

   Depth follows morph too: it is recomputed by a Kahn pass over the
   whole graph whenever the graph changes, never guessed at creation. A
   guess made when a node is born cannot know what will later drive it,
   and left alone it never corrects itself.
   ───────────────────────────────────────────────────────────────────── */

export class PlanFailure extends Error {
  constructor(message, cell) { super(message); this.name = 'PlanFailure'; this.cell = cell; }
}

/**
 * The builder. In probe mode it allocates ids and counts turns; it creates
 * no nodes and no edges. Cell bodies cannot tell the difference, which is
 * the point.
 */
class Builder {
  constructor({ probe = false } = {}) {
    this.probe = probe;
    this.nodes = [];
    this.edges = [];
    this.turns = 0;
    this.seq = 0;
    this.failures = [];
  }

  id(kind) { this.seq += 1; return `${kind}-${this.seq}`; }

  /** A leaf: one agent, one turn. */
  node(label, { turns = 1, after = [], kind = 'turn' } = {}) {
    const id = this.id(kind);
    this.turns += turns;
    if (!this.probe) {
      this.nodes.push({ id, label, kind, turns });
      for (const a of [].concat(after).filter(Boolean)) this.edges.push({ from: a, to: id });
    }
    return id;
  }

  /**
   * Several leaves at the same depth.
   *
   * `after` may be one id, which every leaf then depends on (a barrier), or
   * an array of the same length, which wires lane by lane. The distinction
   * matters and the first version did not have it: passing the whole previous
   * wave as `after` produced a complete bipartite edge set, saying every turn
   * in wave B waited on every turn in wave A. The derived layout drew that
   * honestly and it was obviously wrong; a hand-drawn figure would have shown
   * what I meant instead of what the code said.
   */
  parallel(labels, { after = [], ...opts } = {}) {
    const prev = [].concat(after).filter(Boolean);
    const laneWise = prev.length === labels.length && labels.length > 1;
    return labels.map((l, i) => this.node(l, { ...opts, after: laneWise ? prev[i] : prev }));
  }

  /** Expand a named cell. Failure unwinds here, to this cell's fallback. */
  cell(name, args = {}) {
    const body = CELLS[name];
    if (!body) throw new PlanFailure(`no cell named "${name}"`, name);
    const mark = { nodes: this.nodes.length, edges: this.edges.length, turns: this.turns, seq: this.seq };
    try {
      return body(this, args);
    } catch (err) {
      if (!(err instanceof PlanFailure)) throw err;
      // unwind this cell's effects, then take its fallback
      this.nodes.length = mark.nodes;
      this.edges.length = mark.edges;
      this.turns = mark.turns;
      this.seq = mark.seq;
      this.failures.push({ cell: name, reason: err.message });
      const fb = FALLBACKS[name];
      if (!fb) throw err;
      return fb(this, args);
    }
  }

  fail(reason, cell) { throw new PlanFailure(reason, cell); }
}

// ── the cell library ──────────────────────────────────────────────────

export const CELLS = {
  /** A comparison: `replicates` standard runs over the same condition bus. */
  experiment(b, { conditions, replicates, budget = Infinity }) {
    if (replicates < 1) b.fail('an experiment needs at least one run');
    const ends = [];
    for (let i = 0; i < replicates; i++) {
      if (b.turns + 6 > budget) b.fail(`budget of ${budget} turns exhausted after ${i} runs`);
      ends.push(b.cell('run', { conditions, index: i + 1 }));
    }
    return ends;
  },

  /** The standard run: setup, two paired waves, cleanup. */
  run(b, { conditions, index = 1 }) {
    // setup fans out to every arm; each arm is then a lane through both
    // waves; cleanup joins them again.
    const setup = b.node(`setup ${index}`, { kind: 'block' });
    const a = b.cell('wave', { conditions, after: setup, label: `A${index}` });
    const c = b.cell('wave', { conditions, after: a, label: `B${index}` });
    return b.node(`cleanup ${index}`, { kind: 'block', after: c });
  },

  /**
   * A wave. Width comes from the condition bus, never declared.
   * SPLIT on a one-condition bus fails, exactly as it does in morph.
   */
  wave(b, { conditions, after, label }) {
    if (!Array.isArray(conditions)) b.fail('a wave needs a condition bus');
    if (conditions.length < 2) b.fail(`a wave cannot split a bus of ${conditions.length}`);
    return b.parallel(conditions.map((c) => `${label}·${c}`), { after, kind: 'turn' });
  },
};

/** Where a failed cell unwinds to. */
export const FALLBACKS = {
  /** A bus too narrow to split runs as a single arm, and says so. */
  wave(b, { conditions, after, label }) {
    return b.parallel([`${label}·${conditions[0] ?? 'only'}`], { after, kind: 'degraded' });
  },
  /**
   * A budget-exhausted experiment keeps the runs it could afford.
   *
   * It rethrows when there is no budget to shrink to. Without that guard it
   * caught EVERY experiment failure, including an invalid replicate count,
   * and Math.max(1, NaN) is NaN — so a nonsense design came back as an empty
   * plan with no error. A fallback that catches more than it can repair is
   * worse than none.
   */
  experiment(b, { conditions, replicates, budget }) {
    // This fallback repairs exactly one thing: a budget that ran out. An
    // invalid replicate count is not repairable by shrinking, and the first
    // version answered it by GROWING the design to budget/6 runs.
    if (replicates < 1) throw new PlanFailure('an experiment needs at least one run', 'experiment');
    if (!Number.isFinite(budget)) throw new PlanFailure('no budget to fall back to', 'experiment');
    const affordable = Math.max(1, Math.floor(budget / 6));
    const ends = [];
    for (let i = 0; i < affordable; i++) ends.push(b.cell('run', { conditions, index: i + 1 }));
    return ends;
  },
};

// ── depth, recomputed rather than guessed ─────────────────────────────

/**
 * Longest path from a source, by a Kahn pass over the whole graph.
 * Recomputed outright whenever the graph changes, for the reason morph
 * gives: a value assigned at creation cannot know what will later drive
 * the node, and left alone the guess never corrects itself.
 */
export function depths({ nodes, edges }) {
  const inDeg = new Map(nodes.map((n) => [n.id, 0]));
  const out = new Map(nodes.map((n) => [n.id, []]));
  for (const e of edges) {
    inDeg.set(e.to, (inDeg.get(e.to) ?? 0) + 1);
    out.get(e.from)?.push(e.to);
  }
  const depth = new Map(nodes.map((n) => [n.id, 0]));
  const queue = nodes.filter((n) => inDeg.get(n.id) === 0).map((n) => n.id);
  let seen = 0;
  while (queue.length) {
    const id = queue.shift();
    seen += 1;
    for (const next of out.get(id) ?? []) {
      depth.set(next, Math.max(depth.get(next), depth.get(id) + 1));
      inDeg.set(next, inDeg.get(next) - 1);
      if (inDeg.get(next) === 0) queue.push(next);
    }
  }
  if (seen !== nodes.length) throw new PlanFailure('the plan graph has a cycle');
  return depth;
}

// ── the two entry points, sharing one interpreter ─────────────────────

function interpret(cell, args, probe) {
  const b = new Builder({ probe });
  b.cell(cell, args);
  return b;
}

/** How big does this get? Creates nothing. */
export function probe(cell, args) {
  const b = interpret(cell, args, true);
  return { turns: b.turns, failures: b.failures, nodes: 0 };
}

/** Build it. */
export function build(cell, args) {
  const b = interpret(cell, args, false);
  const d = depths(b);
  const maxDepth = Math.max(0, ...d.values());
  return {
    nodes: b.nodes.map((n) => ({ ...n, depth: d.get(n.id) })),
    edges: b.edges,
    turns: b.turns,
    failures: b.failures,
    depth: maxDepth,
    width: Math.max(...[...d.values()].reduce((acc, x) => { acc[x] = (acc[x] ?? 0) + 1; return acc; }, []).filter(Boolean)),
  };
}

/** The invariant this design exists to hold. */
export function probeMatchesBuild(cell, args) {
  const p = probe(cell, args);
  const g = build(cell, args);
  return {
    ok: p.turns === g.turns && p.failures.length === g.failures.length,
    probeTurns: p.turns, buildTurns: g.turns,
    probeFailures: p.failures.length, buildFailures: g.failures.length,
  };
}

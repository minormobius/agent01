/* ─────────────────────────────────────────────────────────────────────
   ken/lab/roles.mjs — the org chart of a turn graph, derived.

   A plan is a DAG of turns. This module answers two questions about a
   node, both from structure alone, and both cheap:

     1. WHAT IS THIS AGENT'S JOB?  Read off degree. Nine roles, and the
        set is complete by construction rather than by enumeration of
        cases we happened to think of.

     2. IS THIS AGENT'S JOB THE SAME AS THAT ONE'S?  Read off the
        automorphism group. Two turns are interchangeable exactly when
        some automorphism of the plan maps one to the other.

   The second is the one that pays, because it is H4 restated as a graph
   property. Exchangeability is not an assumption about agents; it is a
   symmetry of the plan you wrote. If two turns are in the same orbit you
   may pool them, and if they are not you may not, and the graph settles
   it before any data exists.

   ── THE ROLE BASIS ───────────────────────────────────────────────────

   Four duties are forced by degree, and nothing else is:

     originate   in-degree 0    nothing feeds it, so it must supply the
                                brief itself
     merge       in-degree >= 2 several upstream products must be
                                reconciled before work starts
     split       out-degree >=2 briefs must be written for several
                                downstream agents
     report      out-degree 0   nothing consumes it, so its output goes
                                to the principal

   Originate and merge cannot co-occur (in-degree is not both 0 and >= 2)
   and neither can report and split. So the duty set of a node is one
   in-duty crossed with one out-duty: three by three, nine roles, total
   on every node of every finite DAG. That is the completeness claim, and
   it is a counting argument rather than a survey.

   ── WHY THE NAMES ARE ORG-CHART NAMES ────────────────────────────────

   Because the positions are org-chart positions and the literature about
   them is already in the syllabus. `broker` is Aghion-Tirole's manager
   with real authority: the only role that both merges and splits, so the
   only one that can substitute its own judgment for the brief and have
   the substitution propagate. `principal` sits at in-degree 0 by
   definition, which is what makes it the principal.
   ───────────────────────────────────────────────────────────────────── */

/**
 * The nine roles, indexed by [in-class][out-class] where a class is
 * 0 / 1 / 2 meaning "none" / "one" / "several".
 *
 * Read the table, not the list: the rows are what arrives, the columns
 * are what leaves.
 */
export const ROLE_TABLE = [
  //  out: 0 (report)   1 (hand off)   >=2 (split)
  ['solo', 'brief', 'principal'], //   in: 0   (originate)
  ['deliver', 'relay', 'delegate'], // in: 1   (carry)
  ['integrate', 'funnel', 'broker'], // in: >=2 (merge)
];

export const ROLES = ROLE_TABLE.flat();

/** What each role owes, and the failure it is exposed to. */
export const ROLE_DUTY = {
  solo: { in: 'originate', out: 'report', exposure: 'no check of any kind' },
  brief: { in: 'originate', out: 'hand off', exposure: 'everything downstream inherits its errors' },
  principal: { in: 'originate', out: 'split', exposure: 'writes every brief, reads no result' },
  deliver: { in: 'carry', out: 'report', exposure: 'its ken is one turn wide and it speaks last' },
  relay: { in: 'carry', out: 'hand off', exposure: 'loses what it was not told' },
  delegate: { in: 'carry', out: 'split', exposure: 'splits on a brief it did not write' },
  integrate: { in: 'merge', out: 'report', exposure: 'reconciles conflicts with no authority to resolve them' },
  funnel: { in: 'merge', out: 'hand off', exposure: 'compresses several products into one message' },
  broker: { in: 'merge', out: 'split', exposure: 'real authority: it can substitute its judgment and have it propagate' },
};

const cls = (d) => (d === 0 ? 0 : d === 1 ? 1 : 2);

// ── the adjacency a plan graph implies ────────────────────────────────

/** in-neighbours, out-neighbours, and the degrees, for every node. */
export function adjacency({ nodes, edges }) {
  const ins = new Map(nodes.map((n) => [n.id, []]));
  const outs = new Map(nodes.map((n) => [n.id, []]));
  for (const e of edges) {
    if (!ins.has(e.to) || !outs.has(e.from)) throw new Error(`edge names a node not in the graph: ${e.from} -> ${e.to}`);
    ins.get(e.to).push(e.from);
    outs.get(e.from).push(e.to);
  }
  return { ins, outs };
}

/** The role of every node. Total: every node gets exactly one. */
export function roles(graph) {
  const { ins, outs } = adjacency(graph);
  return new Map(graph.nodes.map((n) => [
    n.id,
    ROLE_TABLE[cls(ins.get(n.id).length)][cls(outs.get(n.id).length)],
  ]));
}

// ── the invariants worth predicting from ──────────────────────────────

/** Transitive closure, one direction, by relaxation over a topological order. */
function closure(graph, dir) {
  const { ins, outs } = adjacency(graph);
  const step = dir === 'up' ? ins : outs;
  const order = topological(graph);
  const seq = dir === 'up' ? order : [...order].reverse();
  const reach = new Map(graph.nodes.map((n) => [n.id, new Set()]));
  for (const id of seq) {
    const acc = reach.get(id);
    for (const nb of step.get(id)) {
      acc.add(nb);
      for (const x of reach.get(nb)) acc.add(x);
    }
  }
  return reach;
}

export function topological({ nodes, edges }) {
  const inDeg = new Map(nodes.map((n) => [n.id, 0]));
  const outs = new Map(nodes.map((n) => [n.id, []]));
  for (const e of edges) { inDeg.set(e.to, inDeg.get(e.to) + 1); outs.get(e.from).push(e.to); }
  // ids in insertion order among the ready set, so the result is deterministic
  const ready = nodes.filter((n) => inDeg.get(n.id) === 0).map((n) => n.id);
  const order = [];
  while (ready.length) {
    const id = ready.shift();
    order.push(id);
    for (const nx of outs.get(id)) { inDeg.set(nx, inDeg.get(nx) - 1); if (inDeg.get(nx) === 0) ready.push(nx); }
  }
  if (order.length !== nodes.length) throw new Error('the plan graph has a cycle');
  return order;
}

/**
 * THE KEN RATIO. What the agent can see over what it is accountable to.
 *
 *   ken(v)   = its in-neighbours and itself — the only state it holds
 *   anc(v)   = every turn whose product it inherits, direct or not
 *   ratio    = |ken| / |anc and itself|
 *
 * A source sees everything that precedes it, because nothing does, and
 * scores 1. The last turn of a six-turn chain holds two turns of state
 * and answers for six, and scores 0.33. The whole programme is named
 * after this quantity and it turns out to be one pass over the graph.
 *
 * It is NOT depth. A wide shallow graph can put a turn at ratio 0.83 and
 * a narrow deep one at 0.33 for the same six turns, which is what makes
 * the two separable by design rather than by luck.
 */
export function kenRatio(graph) {
  const { ins } = adjacency(graph);
  const anc = closure(graph, 'up');
  return new Map(graph.nodes.map((n) => {
    const ken = ins.get(n.id).length + 1;
    const owed = anc.get(n.id).size + 1;
    return [n.id, ken / owed];
  }));
}

/** How much work depends on this turn being right. */
export function blastRadius(graph) {
  const desc = closure(graph, 'down');
  return new Map(graph.nodes.map((n) => [n.id, desc.get(n.id).size]));
}

/**
 * Path betweenness on a DAG: the share of source-to-sink paths running
 * through a node. fwd(v) * bwd(v) / total, all three by one DP each.
 *
 * Every node of a chain scores 1 — there is one path and it visits
 * everything. A node in one arm of a three-arm fan scores 1/3.
 */
export function betweenness(graph) {
  const { ins, outs } = adjacency(graph);
  const order = topological(graph);
  const fwd = new Map(), bwd = new Map();
  for (const id of order) {
    const p = ins.get(id);
    fwd.set(id, p.length === 0 ? 1 : p.reduce((s, u) => s + fwd.get(u), 0));
  }
  for (const id of [...order].reverse()) {
    const c = outs.get(id);
    bwd.set(id, c.length === 0 ? 1 : c.reduce((s, u) => s + bwd.get(u), 0));
  }
  const total = graph.nodes.filter((n) => outs.get(n.id).length === 0)
    .reduce((s, n) => s + fwd.get(n.id), 0);
  return new Map(graph.nodes.map((n) => [n.id, total === 0 ? 0 : (fwd.get(n.id) * bwd.get(n.id)) / total]));
}

// ── symmetry: which turns are the same turn ───────────────────────────

/**
 * Colour refinement (1-WL) on the digraph. Returns a map id -> colour.
 *
 * This is a COARSENING of the orbit partition, never a refinement of it:
 * nodes of different colours are certainly in different orbits, but two
 * nodes may share a colour and still not be interchangeable. So it is
 * used here as a filter for the search below, and `orbits()` reports
 * whether the two agreed — which for plan graphs this small they always
 * have so far, and which is a claim that should keep being checked
 * rather than assumed.
 */
export function refine(graph) {
  const { ins, outs } = adjacency(graph);
  let colour = new Map(graph.nodes.map((n) => [n.id, `${cls(ins.get(n.id).length)}:${cls(outs.get(n.id).length)}`]));
  for (let round = 0; round < graph.nodes.length; round++) {
    const sig = new Map(graph.nodes.map((n) => {
      const up = ins.get(n.id).map((u) => colour.get(u)).sort().join(',');
      const dn = outs.get(n.id).map((u) => colour.get(u)).sort().join(',');
      return [n.id, `${colour.get(n.id)}|<${up}|>${dn}`];
    }));
    // renumber so the label length does not grow without bound
    const seen = new Map();
    const next = new Map();
    for (const id of graph.nodes.map((n) => n.id)) {
      const s = sig.get(id);
      if (!seen.has(s)) seen.set(s, `c${seen.size}`);
      next.set(id, seen.get(s));
    }
    const before = new Set(colour.values()).size;
    colour = next;
    if (new Set(colour.values()).size === before) break;
  }
  return colour;
}

const partitionOf = (colour, ids) => {
  const cells = new Map();
  for (const id of ids) {
    const c = colour.get(id);
    if (!cells.has(c)) cells.set(c, []);
    cells.get(c).push(id);
  }
  return [...cells.values()].map((c) => c.slice().sort());
};

/**
 * The automorphism group, by backtracking search inside the refined
 * cells, and the orbit partition it induces.
 *
 * An automorphism is a permutation preserving edge direction. Two turns
 * in the same orbit are structurally indistinguishable: no property of
 * the plan can tell them apart, so nothing but the treatment assignment
 * can, which is precisely the licence to pool them.
 *
 * Exponential in principle. A plan graph is a dozen nodes and the
 * refinement cells are two or three wide, so in practice it is instant.
 * `cap` stops a pathological graph rather than pretending it cannot
 * happen.
 */
export function automorphisms(graph, { cap = 50000 } = {}) {
  const ids = graph.nodes.map((n) => n.id);
  const colour = refine(graph);
  const edgeSet = new Set(graph.edges.map((e) => `${e.from}>${e.to}`));
  const { ins, outs } = adjacency(graph);
  const found = [];
  let steps = 0;
  let truncated = false;

  const consistent = (map, u, v) => {
    // every already-mapped neighbour relation must survive
    for (const w of outs.get(u)) { const wv = map.get(w); if (wv !== undefined && !edgeSet.has(`${v}>${wv}`)) return false; }
    for (const w of ins.get(u)) { const wv = map.get(w); if (wv !== undefined && !edgeSet.has(`${wv}>${v}`)) return false; }
    for (const [a, b] of map) {
      if (edgeSet.has(`${a}>${u}`) !== edgeSet.has(`${b}>${v}`)) return false;
      if (edgeSet.has(`${u}>${a}`) !== edgeSet.has(`${v}>${b}`)) return false;
    }
    return true;
  };

  const search = (i, map, used) => {
    if (truncated) return;
    if (i === ids.length) { found.push(new Map(map)); return; }
    const u = ids[i];
    for (const v of ids) {
      if (used.has(v) || colour.get(v) !== colour.get(u)) continue;
      if (++steps > cap) { truncated = true; return; }
      if (!consistent(map, u, v)) continue;
      map.set(u, v); used.add(v);
      search(i + 1, map, used);
      map.delete(u); used.delete(v);
    }
  };
  search(0, new Map(), new Set());

  // orbits: union-find over every image of every node
  const parent = new Map(ids.map((id) => [id, id]));
  const find = (x) => (parent.get(x) === x ? x : (parent.set(x, find(parent.get(x))), parent.get(x)));
  for (const a of found) for (const [u, v] of a) { const ru = find(u), rv = find(v); if (ru !== rv) parent.set(ru, rv); }
  const cells = new Map();
  for (const id of ids) {
    const r = find(id);
    if (!cells.has(r)) cells.set(r, []);
    cells.get(r).push(id);
  }
  const orbits = [...cells.values()].map((c) => c.slice().sort()).sort((a, b) => a[0].localeCompare(b[0]));

  return {
    order: found.length,
    orbits,
    truncated,
    /** did 1-WL already give the right answer on this graph? */
    refinementIsExact: JSON.stringify(partitionOf(colour, ids).map((c) => c.join(',')).sort())
      === JSON.stringify(orbits.map((c) => c.join(',')).sort()),
  };
}

/**
 * Which turns may be pooled, as a statement about the design rather than
 * about the model.
 *
 * H4 asks whether runs are exchangeable. On a plan graph the question has
 * a structural answer for free: turns in one orbit are exchangeable BY
 * CONSTRUCTION, and a contrast between orbits is confounded with position
 * unless the shape is varied to break it. This does not make H4 true — an
 * agent can still drift within an orbit, and that is the empirical part —
 * but it says which comparisons were ever estimable.
 */
export function poolable(graph) {
  const { orbits } = automorphisms(graph);
  const r = roles(graph);
  return orbits.map((cell) => ({
    ids: cell,
    size: cell.length,
    role: r.get(cell[0]),
    exchangeable: cell.length > 1,
  }));
}

// ── one table per graph ───────────────────────────────────────────────

/** Every per-node quantity this module computes, joined. */
export function positionTable(graph) {
  const { ins, outs } = adjacency(graph);
  const r = roles(graph);
  const k = kenRatio(graph);
  const b = blastRadius(graph);
  const c = betweenness(graph);
  const { orbits } = automorphisms(graph);
  const orbitOf = new Map();
  orbits.forEach((cell, i) => cell.forEach((id) => orbitOf.set(id, i)));
  const depth = new Map(graph.nodes.map((n) => [n.id, n.depth ?? 0]));
  return graph.nodes.map((n) => ({
    id: n.id,
    label: n.label,
    role: r.get(n.id),
    inDeg: ins.get(n.id).length,
    outDeg: outs.get(n.id).length,
    depth: depth.get(n.id),
    ken: round(k.get(n.id)),
    blast: b.get(n.id),
    between: round(c.get(n.id)),
    orbit: orbitOf.get(n.id),
    orbitSize: orbits[orbitOf.get(n.id)].length,
  }));
}

const round = (x) => Math.round(x * 1000) / 1000;

/** Graph-level summary: the row a shape contributes to the catalogue. */
export function shapeInvariants(graph) {
  const t = positionTable(graph);
  const { order, orbits, refinementIsExact } = automorphisms(graph);
  const kens = t.map((r) => r.ken);
  const roleCounts = {};
  for (const r of t) roleCounts[r.role] = (roleCounts[r.role] ?? 0) + 1;
  return {
    turns: t.length,
    edges: graph.edges.length,
    depth: Math.max(...t.map((r) => r.depth)),
    width: Math.max(...Object.values(t.reduce((a, r) => { a[r.depth] = (a[r.depth] ?? 0) + 1; return a; }, {}))),
    meanKen: round(kens.reduce((s, x) => s + x, 0) / kens.length),
    minKen: round(Math.min(...kens)),
    maxInDeg: Math.max(...t.map((r) => r.inDeg)),
    maxOutDeg: Math.max(...t.map((r) => r.outDeg)),
    autOrder: order,
    orbitCount: orbits.length,
    largestOrbit: Math.max(...orbits.map((o) => o.length)),
    refinementIsExact,
    roles: roleCounts,
  };
}

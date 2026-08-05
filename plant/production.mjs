// production.mjs — exact linear feasibility for acyclic production networks.
//
// FACTORIO.md §2 gate 5 / §3: "is this recipe set satisfiable?" is a
// feasibility question over a small non-negative linear system, not a search
// problem. A factory here is three node kinds plus directed edges, and
// satisfiability follows from one forward pass in topological order — no
// solver, no heuristics, no model opinion anywhere in this file.
//
// ---------------------------------------------------------------- the scope
//
// v1 disallows FAN-OUT: every node may have AT MOST ONE outgoing edge. That
// is the one restriction that keeps this "small and exact" instead of a
// general LP needing a real solver — with fan-out allowed, "how much of a
// source's output goes to which consumer" is itself a variable to solve for,
// and this module refuses that problem rather than half-solving it.
//
// CONVERGENCE stays allowed, and is what makes multi-input recipes real:
// several producers (e.g. two sources) may feed one consumer's inputs, same
// resource or different, over separate incoming edges — only OUTGOING degree
// is capped.
//
// Cycles are refused outright: the topological sort must succeed, or the
// network is rejected before a single rate is computed. A recycling loop
// needs a fixed-point technique this gate does not need yet — don't reach
// for one; refuse the network instead.
//
// Node-and-browser, no dependencies, no unseeded randomness — the foam rules
// (see solids.mjs's header).

function emits(node) {
  if (node.kind === 'source') return [node.resource];
  if (node.kind === 'processor') return node.outputs.map((o) => o.resource);
  return []; // a sink emits nothing
}

function accepts(node) {
  if (node.kind === 'sink') return [node.resource];
  if (node.kind === 'processor') return node.inputs.map((i) => i.resource);
  return []; // a source accepts nothing
}

function positive(v, what) {
  if (!(v > 0)) throw new Error(`production: ${what} must be positive`);
}

/**
 * Validate `network` and resolve it to something `feasible()` can walk:
 * `{ byId, order, outEdges }` — a topologically-sorted node-id list and,
 * per node, its resolved outgoing edges (each carrying the ONE resource that
 * edge's `from` emits and `to` accepts). Every refusal named in the ticket is
 * checked here, each with one distinct cause.
 */
function analyse({ nodes, edges }) {
  const byId = new Map();
  for (const node of nodes) {
    if (!['source', 'processor', 'sink'].includes(node.kind)) {
      throw new Error(`production: unknown node kind "${node.kind}"`);
    }
    if (byId.has(node.id)) throw new Error(`production: duplicate id "${node.id}"`);

    if (node.kind === 'source') {
      positive(node.rate, `source "${node.id}" rate`);
    } else if (node.kind === 'sink') {
      positive(node.demand, `sink "${node.id}" demand`);
    } else {
      if (!node.inputs || node.inputs.length === 0) {
        throw new Error(`production: processor "${node.id}" has zero inputs`);
      }
      if (!node.outputs || node.outputs.length === 0) {
        throw new Error(`production: processor "${node.id}" has zero outputs`);
      }
      positive(node.capacity, `processor "${node.id}" capacity`);
      for (const i of node.inputs) positive(i.rate, `processor "${node.id}" input "${i.resource}" rate`);
      for (const o of node.outputs) positive(o.rate, `processor "${node.id}" output "${o.resource}" rate`);
    }
    byId.set(node.id, node);
  }

  const outEdges = new Map();  // id -> [{ to, resource }], length <= 1
  const inDegree = new Map();
  for (const id of byId.keys()) { outEdges.set(id, []); inDegree.set(id, 0); }

  for (const { from, to } of edges) {
    if (!byId.has(from)) throw new Error(`production: edge names unknown node "${from}"`);
    if (!byId.has(to)) throw new Error(`production: edge names unknown node "${to}"`);

    if (outEdges.get(from).length >= 1) {
      throw new Error(`production: node "${from}" has more than one outgoing edge (fan-out)`);
    }

    const shared = emits(byId.get(from)).filter((r) => accepts(byId.get(to)).includes(r));
    if (shared.length !== 1) {
      const why = shared.length === 0 ? 'no shared resource' : `ambiguous (${shared.join(', ')})`;
      throw new Error(`production: edge "${from}"→"${to}" resource is ${why}`);
    }

    outEdges.get(from).push({ to, resource: shared[0] });
    inDegree.set(to, inDegree.get(to) + 1);
  }

  // Kahn's algorithm. Deterministic: the queue only ever grows by iterating
  // `byId` (insertion order = `nodes` order) and each node's own outEdges
  // (insertion order = `edges` order), so two calls on the same network
  // literals produce the same order every time.
  const queue = [...byId.keys()].filter((id) => inDegree.get(id) === 0);
  const remaining = new Map(inDegree);
  const order = [];
  while (queue.length) {
    const id = queue.shift();
    order.push(id);
    for (const { to } of outEdges.get(id)) {
      const d = remaining.get(to) - 1;
      remaining.set(to, d);
      if (d === 0) queue.push(to);
    }
  }
  if (order.length !== byId.size) throw new Error('production: network has a cycle');

  return { byId, order, outEdges };
}

/**
 * Is `network` satisfiable — does every sink receive at least its demand?
 *
 * Walks nodes in topological order computing what each ACTUALLY produces
 * (not what it is rated for): a source produces its full rate; a processor
 * sums incoming supply per input resource across every converging edge,
 * sets `scale = min(capacity, min over inputs of supply/inputRate)`, and
 * emits `scale * outputRate` per output; a sink's achieved rate is the sum
 * of its incoming supply.
 *
 * Returns `{ ok, achieved, deficits, margin }`:
 *   - `achieved` — `{ sinkId: rate }` for every sink.
 *   - `deficits` — `{ sinkId, resource, demand, achieved }` for every sink
 *     that fell short; empty iff `ok`.
 *   - `margin` — `min over sinks of (achieved - demand) / demand`. This is
 *     FACTORIO.md §3's difficulty dial for free, from the same pass: positive
 *     means slack, negative means short, and its magnitude is how far.
 *     A network with no sinks is vacuously feasible and reports margin 0
 *     (no sink to have headroom over) — not exercised by any ticket case,
 *     recorded as a decision rather than left to fall out silently.
 */
export function feasible(network) {
  const { byId, order, outEdges } = analyse(network);
  const supplyIn = new Map(); // id -> { resource: amount } — what flows in
  const achieved = {};

  for (const id of order) {
    const node = byId.get(id);
    const inc = supplyIn.get(id) || {};
    let out = {};

    if (node.kind === 'source') {
      out[node.resource] = node.rate;
    } else if (node.kind === 'sink') {
      achieved[id] = inc[node.resource] || 0;
    } else {
      let scale = node.capacity;
      for (const input of node.inputs) {
        scale = Math.min(scale, (inc[input.resource] || 0) / input.rate);
      }
      scale = Math.max(0, scale);
      for (const output of node.outputs) {
        out[output.resource] = (out[output.resource] || 0) + scale * output.rate;
      }
    }

    for (const { to, resource } of outEdges.get(id)) {
      const dest = supplyIn.get(to) || {};
      dest[resource] = (dest[resource] || 0) + (out[resource] || 0);
      supplyIn.set(to, dest);
    }
  }

  const deficits = [];
  let margin = Infinity;
  for (const id of order) {
    const node = byId.get(id);
    if (node.kind !== 'sink') continue;
    const got = achieved[id];
    margin = Math.min(margin, (got - node.demand) / node.demand);
    if (got < node.demand) {
      deficits.push({ sinkId: id, resource: node.resource, demand: node.demand, achieved: got });
    }
  }
  if (margin === Infinity) margin = 0; // no sinks in the network at all

  return { ok: deficits.length === 0, achieved, deficits, margin };
}

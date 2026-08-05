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
// FAN-OUT is allowed, but the SPLIT is supplied by the network literal, not
// solved for: an edge may carry an optional `share` in (0, 1]. A node's
// outgoing edges are grouped by the RESOLVED resource they carry, not by
// node alone — a processor with two distinct outputs fans each one out
// independently, and one output's split has no bearing on the other's. A
// group of exactly one edge behaves exactly as before: `share` defaults to 1
// if absent. A group of more than one edge (a real split) requires EVERY
// edge in it to carry an explicit `share`, and the group's shares may sum to
// at most 1 — less than 1 is legal and simply leaves that much of the output
// unrouted, not an error. This is a deliberate, narrower feature than a
// general LP: the network states how much goes where, and this module never
// has to solve for it. That is what keeps this "small and exact" instead of
// a general LP needing a real solver — "how much of a source's output goes
// to which consumer" stays a fact the caller supplies, never a variable this
// module discovers.
//
// `autoSplit()` (below) fills in `share` automatically, but only for the one
// fan-out sub-case that has a closed-form, provably-optimal answer: a direct
// source-or-processor -> sink fan-out where every destination is a sink fed
// by nothing else in the whole network. It solves nothing beyond that —
// a fan-out into processors, or a sink with more than one supplier, needs a
// real linear program over the whole network and is deliberately left alone,
// same as it was before this function existed.
//
// CONVERGENCE stays allowed, and is what makes multi-input recipes real:
// several producers (e.g. two sources) may feed one consumer's inputs, same
// resource or different, over separate incoming edges.
//
// Cycles are refused outright: the topological sort must succeed, or the
// network is rejected before a single rate is computed. A recycling loop
// needs a fixed-point technique this gate does not need yet — don't reach
// for one; refuse the network instead.
//
// Node-and-browser, no dependencies, no unseeded randomness — the foam rules
// (see solids.mjs's header).
//
// `band()` turns the raw `margin` number `feasible()` already computes into
// FACTORIO.md §3's difficulty vocabulary — infeasible / tight / comfortable /
// slack — the same way parMin/parTarget band the walk certificate today.

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
 * edge's `from` emits and `to` accepts, plus its resolved `share` — explicit
 * or defaulted to 1). Every refusal named in the ticket is checked here,
 * each with one distinct cause.
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

  const outEdges = new Map();  // id -> [{ to, resource, share }]
  const inDegree = new Map();
  for (const id of byId.keys()) { outEdges.set(id, []); inDegree.set(id, 0); }

  // Pass 1: validate node refs and resolve each edge's shared resource, in
  // `edges` order — unchanged from before fan-out existed.
  const resolved = edges.map(({ from, to, share }) => {
    if (!byId.has(from)) throw new Error(`production: edge names unknown node "${from}"`);
    if (!byId.has(to)) throw new Error(`production: edge names unknown node "${to}"`);

    const shared = emits(byId.get(from)).filter((r) => accepts(byId.get(to)).includes(r));
    if (shared.length !== 1) {
      const why = shared.length === 0 ? 'no shared resource' : `ambiguous (${shared.join(', ')})`;
      throw new Error(`production: edge "${from}"→"${to}" resource is ${why}`);
    }
    return { from, to, resource: shared[0], share };
  });

  // Pass 2: group by (from, RESOLVED resource) — a fan-out is a split of one
  // resource, so a processor with two distinct outputs fans each out on its
  // own group, independent of the other's validation. Nested maps rather
  // than a joined string key, so no id/resource pair can collide with
  // another.
  const groupsByFrom = new Map(); // from -> resource -> resolved edges, in order
  for (const e of resolved) {
    if (!groupsByFrom.has(e.from)) groupsByFrom.set(e.from, new Map());
    const byResource = groupsByFrom.get(e.from);
    if (!byResource.has(e.resource)) byResource.set(e.resource, []);
    byResource.get(e.resource).push(e);
  }

  const groups = [];
  for (const byResource of groupsByFrom.values()) {
    for (const group of byResource.values()) groups.push(group);
  }

  for (const group of groups) {
    const { from, resource } = group[0];
    if (group.length === 1) {
      const e = group[0];
      if (e.share === undefined) {
        e.share = 1;
      } else if (!(e.share > 0 && e.share <= 1)) {
        throw new Error(`production: edge "${e.from}"→"${e.to}" share must be in (0, 1]`);
      }
    } else {
      let sum = 0;
      for (const e of group) {
        if (typeof e.share !== 'number') {
          throw new Error(`production: node "${from}" splits resource "${resource}" without an explicit share (fan-out)`);
        }
        if (!(e.share > 0 && e.share <= 1)) {
          throw new Error(`production: edge "${e.from}"→"${e.to}" share must be in (0, 1]`);
        }
        sum += e.share;
      }
      if (sum > 1 + 1e-9) {
        throw new Error(`production: node "${from}" over-allocates resource "${resource}" (shares sum to ${sum})`);
      }
    }
  }

  for (const e of resolved) {
    outEdges.get(e.from).push({ to: e.to, resource: e.resource, share: e.share });
    inDegree.set(e.to, inDegree.get(e.to) + 1);
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
 * FACTORIO.md §2 gate 6 (the build certificate): a legal, non-spatial
 * construction order for `network` — every node appears after everything it
 * depends on. This is exactly the topological order `analyse()` already
 * computes to walk feasibility, exposed directly rather than re-derived, so
 * it inherits `analyse()`'s validation and refusal behavior (including the
 * cycle check) with zero duplicated logic. Throws under the same conditions
 * `feasible()` does, with the same messages, since both call `analyse()`.
 *
 * This is the non-spatial half of "can this be built" only — it says nothing
 * about whether a node physically fits where it would be placed. That half
 * belongs with the placement-in-a-pocket work tracked elsewhere.
 */
export function buildOrder(network) {
  const { order } = analyse(network);
  return order;
}

/**
 * Is `network` satisfiable — does every sink receive at least its demand?
 *
 * Walks nodes in topological order computing what each ACTUALLY produces
 * (not what it is rated for): a source produces its full rate; a processor
 * sums incoming supply per input resource across every converging edge,
 * sets `scale = min(capacity, min over inputs of supply/inputRate)`, and
 * emits `scale * outputRate` per output; a sink's achieved rate is the sum
 * of its incoming supply. Each outgoing edge delivers `emitted * share` to
 * its destination (`share` resolved by `analyse()` — explicit or the
 * single-edge default of 1), so a fanned-out output is split across its
 * destinations rather than duplicated to each.
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

    for (const { to, resource, share } of outEdges.get(id)) {
      const dest = supplyIn.get(to) || {};
      dest[resource] = (dest[resource] || 0) + (out[resource] || 0) * share;
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

/**
 * Turn a raw `margin` (as returned by `feasible()`) into FACTORIO.md §3's
 * difficulty vocabulary. Pure — takes the number, does not call `feasible()`
 * itself, so the two compose as `band(feasible(network).margin)`.
 *
 *   margin < 0             -> 'infeasible'
 *   0 <= margin < tight     -> 'tight'
 *   tight <= margin < comfortable -> 'comfortable'
 *   margin >= comfortable  -> 'slack'
 */
export function band(margin, { tight = 0.15, comfortable = 0.5 } = {}) {
  if (margin < 0) return 'infeasible';
  if (margin < tight) return 'tight';
  if (margin < comfortable) return 'comfortable';
  return 'slack';
}

/**
 * autoSplit() — closed-form optimal split for fan-out sub-cases that have a
 * provably-optimal answer without a general LP: a direct source-or-processor
 * -> sink fan-out, grouped by (from, RESOLVED resource) exactly as
 * `analyse()` groups them. (a) and (b) are checked for the WHOLE group —
 * either every edge qualifies or none does, same as before this extension:
 *
 *   (a) no edge in the group carries an explicit `share` already
 *   (b) every edge's `to` node is kind 'sink'
 *
 * Condition (c) — how confounded a sink's `demand` may be by supply from
 * outside the group — is checked PER EDGE, and a sink failing it is
 * EXCLUDED from the split rather than voiding the whole group:
 *
 *   (c) the sink is fed by at most one edge outside this group. None: its
 *       full `demand` is what the group must fill (the original, exact
 *       case). Exactly one: that outside edge's `from` must be a plain
 *       `source` (whole-network out-degree exactly 1, so its contribution
 *       is an unsolved-for constant, not itself a variable) whose `rate` is
 *       strictly less than the sink's `demand` (so the group still has
 *       positive demand left to fill) — the group then only has to fill
 *       `effectiveDemand = demand - rate`. More than one outside edge, an
 *       outside supplier that is not a plain source, or one whose `rate`
 *       alone already meets or exceeds `demand`, all fail (c) and exclude
 *       that sink: its edge is left untouched, same as a non-qualifying
 *       group member always has been.
 *
 * If fewer than two sinks in a group end up qualifying, the WHOLE group is
 * left untouched — a lone participant is not a split, same as a group that
 * was never a real fan-out.
 *
 * For each qualifying sink, sets `share_i = effectiveDemand_i /
 * sum(effectiveDemand_j over the qualifying sinks)` — proportional-to-
 * effective-demand allocation. Substituting `demand_i = effectiveDemand_i +
 * outsideContribution_i` into the margin, margin_i = (S*share_i +
 * outsideContribution_i)/demand_i - 1, reduces exactly to (S*share_i -
 * effectiveDemand_i)/demand_i — zero, by construction, when share_i is
 * proportional to effectiveDemand_i and S equals the qualifying sinks'
 * total effectiveDemand, and otherwise scaling uniformly with S the same
 * way the plain case does. So this is the plain case's own max-min-fair
 * argument (worked in full in the ticket that added this function) with
 * effectiveDemand standing in for demand throughout — moving budget from a
 * higher share_i/effectiveDemand_i ratio to a lower one always raises the
 * minimum until they match, which is exactly proportional-to-
 * effective-demand allocation. The plain case is the special case
 * outsideContribution = 0, effectiveDemand = demand.
 *
 * Every edge outside a qualifying group, and every excluded sink's edge
 * within one — is copied through completely unchanged; feeding the result
 * to `feasible()` behaves exactly as it did before this function existed
 * for anything it didn't touch, including throwing on an un-split fan-out
 * (an excluded sink's edge left without a `share` inside an otherwise-split
 * group of >= 2 real edges throws the same "without an explicit share"
 * error `analyse()` always has).
 *
 * Pure: returns a new `{ nodes, edges }`. `nodes` is the same reference as
 * the input (never mutated or copied); `edges` is always a fresh array of
 * fresh edge objects, so the input network is never mutated.
 *
 * Does NOT solve the general multi-hop case — a fan-out feeding processors,
 * or a sink with more than one supplier, needs a real linear program over
 * the whole network and is left completely alone, on purpose.
 */
export function autoSplit(network) {
  const { nodes, edges } = network;
  const byId = new Map(nodes.map((n) => [n.id, n]));

  // Whole-network out-degree, to test the extended condition (c): a lone
  // outside supplier only counts as an unsolved-for constant if IT has
  // nothing else to fan out to.
  const outDegree = new Map();
  for (const e of edges) outDegree.set(e.from, (outDegree.get(e.from) || 0) + 1);

  // Resolve each edge's shared resource exactly as analyse() does, purely to
  // group correctly — an edge that can't resolve (bad ref, ambiguous, or no
  // shared resource) is left alone here; feasible() raises the real error.
  const resourceOf = (e) => {
    const from = byId.get(e.from);
    const to = byId.get(e.to);
    if (!from || !to) return null;
    const shared = emits(from).filter((r) => accepts(to).includes(r));
    return shared.length === 1 ? shared[0] : null;
  };

  const groupsByFrom = new Map(); // from -> resource -> [edge index...]
  edges.forEach((e, i) => {
    const resource = resourceOf(e);
    if (resource === null) return;
    if (!groupsByFrom.has(e.from)) groupsByFrom.set(e.from, new Map());
    const byResource = groupsByFrom.get(e.from);
    if (!byResource.has(resource)) byResource.set(resource, []);
    byResource.get(resource).push(i);
  });

  const out = edges.map((e) => ({ ...e }));

  for (const byResource of groupsByFrom.values()) {
    for (const indices of byResource.values()) {
      if (indices.length < 2) continue; // not a fan-out group at all

      // (a) and (b) are whole-group: either every edge qualifies or none does.
      const baseQualifies = indices.every((i) => {
        const e = edges[i];
        if (e.share !== undefined) return false;              // (a)
        const to = byId.get(e.to);
        return !!to && to.kind === 'sink';                     // (b)
      });
      if (!baseQualifies) continue;

      // (c), extended and per-edge: a sink with at most one outside
      // supplier — and, if it has one, that supplier is a plain
      // (out-degree-1) source whose rate alone doesn't already cover its
      // demand — qualifies with effectiveDemand = demand - outsideRate. A
      // sink failing this is excluded: it gets no entry below, so its edge
      // is left untouched (same as any non-qualifying member always was).
      const groupSet = new Set(indices);
      const effectiveDemand = new Map(); // index -> effective demand
      for (const i of indices) {
        const e = edges[i];
        const to = byId.get(e.to);
        const outside = edges.filter((oe, j) => oe.to === e.to && !groupSet.has(j));
        if (outside.length === 0) {
          effectiveDemand.set(i, to.demand);
          continue;
        }
        if (outside.length > 1) continue; // more than one outside supplier
        const from = byId.get(outside[0].from);
        if (!from || from.kind !== 'source') continue;        // not a plain source
        if (outDegree.get(outside[0].from) !== 1) continue;    // that source itself fans out
        if (!(from.rate < to.demand)) continue;                // already meets/exceeds demand
        effectiveDemand.set(i, to.demand - from.rate);
      }

      const qualifyingIndices = indices.filter((i) => effectiveDemand.has(i));
      if (qualifyingIndices.length < 2) continue; // fewer than two real participants left

      const total = qualifyingIndices.reduce((sum, i) => sum + effectiveDemand.get(i), 0);
      qualifyingIndices.forEach((i) => { out[i].share = effectiveDemand.get(i) / total; });
    }
  }

  return { nodes, edges: out };
}

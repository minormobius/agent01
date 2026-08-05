// buildcert.mjs — gate 6, the build certificate: is there a legal ORDER to
// build this factory in this pocket?
//
// FACTORIO.md §4. A factory can be SATISFIABLE — `production.mjs`'s `feasible()`
// says every sink gets its demand — and still impossible to BUILD, because the
// pieces go into a real pocket one at a time and each one takes space the next
// one wanted. `feasible()` knows about rates and nothing about geometry;
// `placement.mjs` knows about geometry and nothing about rates. This file is the
// join: walk `buildOrder(network)` and ask, for each node in turn, whether its
// constellation is legal against the pocket AS IT WILL BE after the previous
// steps — not against the empty pocket.
//
// ------------------------------------------------------------- the claim ---
//
// `certify` inherits `placement.mjs`'s exact claim and cannot be stronger than
// it: every refusal is CERTAIN (it reproduces `reformPocket`'s own pre-checks),
// and `ok: true` means "no KNOWN obstruction", never "the kernel will accept
// it". `reformPocket` also refuses on closure and nav failures, and neither is
// decidable without doing the rebuild. So a certificate is a plan the foam has
// not yet been asked about, and the gate checks it by ACTUALLY PLANTING it.
//
// ------------------------------------------- what the order actually buys ---
//
// The interesting question the ticket poses is "would a different order have
// helped?", and the honest answer has two halves that must not be conflated:
//
//   1. FOR THE BUILD AS A WHOLE: NO, never. The constraint set here is "every
//      pair of seeds, across the pocket and every step, is at least
//      `minSeedGap` apart, and every seed is inside the hull". That is a
//      property of the SET of seeds, not of the sequence — pairwise gap is
//      symmetric and the hull does not move. So the final verdict `ok` is
//      INVARIANT under every topological order, and `certify` does not search
//      over the |V|! of them. `topoOrders()` is exported so a caller (and the
//      gate) can check that invariance rather than take this paragraph's word
//      for it.
//
//   2. FOR ONE STEP: YES, and this is the whole content of the certificate.
//      When a step is refused, WHAT it hit decides whether that particular
//      piece could have been built at all:
//
//        · the hull, its own seeds (`self`), a metric mismatch, or a
//          PRE-EXISTING pocket seed  →  no order in the world places it.
//          `reorderable: false`.
//        · an EARLIER STEP of this same build, and that step is not something
//          this node depends on  →  scheduling it first is a legal topological
//          order, and it MIGHT land. `attemptedOrder` is that order.
//        · an earlier step that IS a topological ancestor  →  no legal order
//          can put this node first, because the network says it must come
//          after. `reorderable: false`, `dependencyBlocked` names which.
//
//      The failure MOVES to the other node in the reordered build (by (1) it
//      must), which is exactly why both halves are reported. A certificate that
//      only said `ok: false` would be `legalSummon` in a loop.
//
// --------------------------------------- why the suggestion is RUN, not argued
//
// The second bullet used to end "…and it lands. `reorderable: true`". That was
// an ARGUMENT, and the argument has a hole: `blockedBy` can only ever name
// steps that PRECEDED the failing one, because those are the only seeds in the
// pocket state it was judged against. A node that came LATER was not there, so
// a collision with it went undetected — and `orderPreferring` is free to put
// exactly such a node first, since it fills the wait for the wanted node's
// ancestors with any ready non-`avoid` node. The dodge set is built from
// `blockedBy`, which by construction cannot contain it.
//
// So the suggested order is now EXECUTED — `certify` re-runs itself under it
// with `{ suggest: false }` — and `reorderable` reports what happened:
//
//   `reorderCheck: 'none'`       no legal reordering exists at all (the hull,
//                                the pocket, its own seeds, or a dependency).
//                                `reorderable: false`.
//   `reorderCheck: 'verified'`   the order was run and the step was certified
//                                in it. `reorderable: true`, `suggestedOrder`
//                                is that order.
//   `reorderCheck: 'refuted'`    the order was run and the step was refused
//                                AGAIN. `reorderable: false`,
//                                `suggestedOrder: null`, and `attemptedOrder`
//                                carries what was tried so a caller can see
//                                why the obvious move does not work.
//   `reorderCheck: 'unchecked'`  the recursion guard is on (`suggest: false`),
//                                so nothing was run. `reorderable: false` —
//                                fail closed, never claim an unverified rescue.
//
// 'none' and 'refuted' are DIFFERENT FACTS for a caller repositioning a
// factory: the first says the piece is in an impossible place, the second says
// the piece is fine and the ORDER cannot be fixed by scheduling alone.
//
// THE RECURSION GUARD is `{ suggest: false }` on the nested run, and it is
// load-bearing rather than defensive: without it every trial's own failure
// would construct and run another trial, unbounded. `failure.reorderRuns`
// counts the nested runs that produced the record — 0 or 1, always, and the
// gate asserts it on a fixture where an unguarded version would report 2.
//
// -------------------------------------------------------------- the scope ---
//
// SEARCHING FOR A LAYOUT IS OUT OF SCOPE, deliberately. Given positions, decide.
// Choosing positions is a placement problem, and conflating the two turns an
// exact decision procedure into a search — the same mistake `production.mjs`
// correctly refused to make with fan-out.
//
// Node-and-browser, no dependencies, no randomness — the foam rules.

import { buildOrder } from './production.mjs';
import { constellation, seedGap, pairGap } from './solids.mjs';
import { legalSummon, MIN_SEED_GAP } from './placement.mjs';

/** Blame precedence, most fundamental first. A step can be refused for several
 *  reasons at once; `failure.blame` names the one that would have to be fixed
 *  first, and `failure.blames` carries the whole set. Deterministic by
 *  construction — it is a fixed list, not "whichever refusal came back last". */
export const BLAME_PRECEDENCE = ['metric', 'hull', 'self', 'pocket', 'step'];

/** id -> Set of ids that can REACH it (its topological ancestors). The network
 *  has already been validated by `buildOrder`, so the edges are known-good and
 *  known-acyclic; this is a plain transitive closure over tiny graphs. */
function ancestors({ nodes, edges }) {
  const back = new Map();
  for (const n of nodes) back.set(n.id, []);
  for (const e of edges) back.get(e.to).push(e.from);
  const memo = new Map();
  const walk = (id) => {
    if (memo.has(id)) return memo.get(id);
    const out = new Set();
    for (const p of back.get(id)) {
      out.add(p);
      for (const g of walk(p)) out.add(g);
    }
    memo.set(id, out);
    return out;
  };
  const all = new Map();
  for (const n of nodes) all.set(n.id, walk(n.id));
  return all;
}

/** Is `order` a legal topological order of `network`? Throws with the offending
 *  edge rather than returning false, because a caller who supplies an order has
 *  made a claim about it and a silent fallback would hide the mistake. */
function checkOrder(network, topo, order) {
  if (order.length !== topo.length) {
    throw new Error(`buildcert: order has ${order.length} nodes, network has ${topo.length}`);
  }
  const at = new Map();
  for (let i = 0; i < order.length; i++) {
    if (at.has(order[i])) throw new Error(`buildcert: order repeats node "${order[i]}"`);
    if (!topo.includes(order[i])) throw new Error(`buildcert: order names unknown node "${order[i]}"`);
    at.set(order[i], i);
  }
  for (const e of network.edges) {
    if (at.get(e.from) > at.get(e.to)) {
      throw new Error(`buildcert: order puts "${e.to}" before "${e.from}", but the network says "${e.from}"→"${e.to}"`);
    }
  }
  return order.slice();
}

/**
 * Every topological order of `network`, up to `cap`.
 *
 * Exists so the order-invariance claim in this file's header is CHECKABLE
 * rather than merely argued: run the certificate over all of them and the
 * verdict must not move. Bounded because the count is factorial in the worst
 * case; `truncated` is returned rather than the list being quietly cut short,
 * so a caller can never mistake a partial sweep for an exhaustive one.
 */
export function topoOrders(network, { cap = 2000 } = {}) {
  buildOrder(network);                       // validate (kinds, ids, edges, cycles)
  const ids = network.nodes.map((n) => n.id);
  const indeg = new Map(ids.map((id) => [id, 0]));
  const out = new Map(ids.map((id) => [id, []]));
  for (const e of network.edges) {
    out.get(e.from).push(e.to);
    indeg.set(e.to, indeg.get(e.to) + 1);
  }
  const orders = [];
  let truncated = false;
  const cur = [];
  const used = new Set();
  const rec = () => {
    if (orders.length >= cap) { truncated = true; return; }
    if (cur.length === ids.length) { orders.push(cur.slice()); return; }
    for (const id of ids) {
      if (used.has(id) || indeg.get(id) !== 0) continue;
      used.add(id); cur.push(id);
      for (const t of out.get(id)) indeg.set(t, indeg.get(t) - 1);
      rec();
      for (const t of out.get(id)) indeg.set(t, indeg.get(t) + 1);
      cur.pop(); used.delete(id);
      if (orders.length >= cap) { truncated = true; return; }
    }
  };
  rec();
  return { orders, truncated };
}

/**
 * A topological order that places `wanted` as early as legally possible, and
 * avoids `avoid` until it has. Constructive, not a search: at each step take
 * `wanted` if it is ready, else any ready node outside `avoid`, else the first
 * ready node.
 *
 * That greedy rule provably puts `wanted` before every member of `avoid` when
 * no member of `avoid` is an ancestor of `wanted`: whenever `wanted` is not yet
 * ready it has an unplaced ancestor, and some unplaced ancestor of it is
 * minimal among the remaining nodes and therefore ready — so a legal non-`avoid`
 * choice always exists until `wanted` itself is taken.
 */
export function orderPreferring(network, wanted, avoid = []) {
  buildOrder(network);
  const ids = network.nodes.map((n) => n.id);
  const indeg = new Map(ids.map((id) => [id, 0]));
  const out = new Map(ids.map((id) => [id, []]));
  for (const e of network.edges) {
    out.get(e.from).push(e.to);
    indeg.set(e.to, indeg.get(e.to) + 1);
  }
  const dodge = new Set(avoid);
  const left = new Set(ids);
  const order = [];
  while (left.size) {
    const ready = ids.filter((id) => left.has(id) && indeg.get(id) === 0);
    const pick = (left.has(wanted) && indeg.get(wanted) === 0)
      ? wanted
      : (ready.find((id) => !dodge.has(id)) ?? ready[0]);
    order.push(pick);
    left.delete(pick);
    for (const t of out.get(pick)) indeg.set(t, indeg.get(t) - 1);
  }
  return order;
}

/** The nearest already-committed seed to any seed of `con`, and who owns it:
 *  `null` for a pre-existing pocket seed, a node id for an earlier step. */
function nearest(seeds, owners, con, aniso) {
  let best = null;
  for (let i = 0; i < seeds.length; i++) {
    for (let k = 0; k < con.seeds.length; k++) {
      const gap = seedGap(seeds[i], con.seeds[k], aniso);
      if (!best || gap < best.gap) best = { gap, seedIndex: i, owner: owners[i], summonSeed: k };
    }
  }
  return best;
}

/**
 * Can `network` be built into `pocket` at `layout`?
 *
 * `layout` maps every node id to `{ solid, centre, r?, rotate?, aniso? }`.
 * `aniso` defaults to the pocket's and should almost always be left alone — it
 * exists so the `metric` refusal (a constellation built for a different metric,
 * which would come out rotated; see `solids.mjs`'s 22° trap) stays reachable.
 *
 * On success:
 *   `{ ok: true, order, topoOrder, steps, plan, clearance, margin }`
 *     · `steps[i]`  — `{ step, node, solid, centre, r, seedIndices, clearance,
 *                        margin, nearest, pairGaps }`. `clearance` is the real
 *                        anisotropic distance to the closest committed seed and
 *                        `margin` is `clearance - minSeedGap`: how much room
 *                        the step had to spare, which is what makes the
 *                        certificate constructive rather than a bare yes.
 *     · `plan`      — the flat seed list in build order, each entry carrying the
 *                        index it will occupy in the final pocket. Planting
 *                        `plan` in order through `reformPocket` is the build.
 *
 * On failure: `{ ok: false, order, topoOrder, steps, plan, failure }`, where
 * `steps`/`plan` are the certified PREFIX (everything before the refusal) and
 * `failure` names the step, what it hit, and whether a different order helps.
 * That last answer is MEASURED: the constructed order is re-certified and
 * `failure.reorderable` reports the result, with `failure.reorderCheck`
 * distinguishing "no reordering exists" from "the one that exists was tried and
 * refused". See this file's header.
 *
 * `suggest` is INTERNAL — the recursion guard. `certify` sets it `false` on the
 * nested run that verifies a suggestion, so that run cannot suggest (and
 * therefore cannot recurse) in turn. It is a documented option rather than a
 * hidden one only so the gate can pin the guard directly; callers should leave
 * it alone. With `suggest: false` a reorderable-looking failure reports
 * `reorderCheck: 'unchecked'` and `reorderable: false` — fail closed.
 *
 * Throws — rather than refusing — for malformed input: an unknown node in the
 * layout, a node with no layout, an illegal `order`, or anything
 * `production.mjs` itself refuses (cycles, bad rates, unshared edge resources).
 * A refusal is a fact about the geometry; a throw is a fact about the caller.
 */
export function certify(pocket, network, layout, { order: given = null, minSeedGap = MIN_SEED_GAP, suggest = true } = {}) {
  const topo = buildOrder(network);
  const order = given ? checkOrder(network, topo, given) : topo;
  const anc = ancestors(network);

  for (const id of Object.keys(layout)) {
    if (!topo.includes(id)) throw new Error(`buildcert: layout names unknown node "${id}"`);
  }

  const base = pocket.seeds.length;
  const seeds = pocket.seeds.map((s) => s.slice());
  const owners = pocket.seeds.map(() => null);
  const steps = [];
  const plan = [];
  const placed = [];

  for (let step = 0; step < order.length; step++) {
    const id = order[step];
    const spec = layout[id];
    if (!spec) throw new Error(`buildcert: no layout for node "${id}"`);
    if (!Array.isArray(spec.centre) || spec.centre.length !== 3) {
      throw new Error(`buildcert: layout for "${id}" needs a 3-vector centre`);
    }
    const aniso = spec.aniso === undefined ? pocket.opts.aniso : spec.aniso;
    const con = constellation(spec.solid, {
      centre: spec.centre,
      r: spec.r === undefined ? 1.6 : spec.r,
      rotate: spec.rotate || 0,
      aniso,
    });

    // The pocket AS IT WILL BE: the real pocket's box and metric, with every
    // seed committed so far. `legalSummon` reads exactly W/H/D, `seeds` and
    // `opts.aniso`, so this view is the same question asked of a later state —
    // not a re-implementation of it.
    const state = { W: pocket.W, H: pocket.H, D: pocket.D, seeds, faces: pocket.faces, opts: pocket.opts };
    const verdict = legalSummon(state, con, { minSeedGap });

    if (!verdict.ok) {
      return {
        ok: false, order, topoOrder: topo, steps, plan,
        failure: explain({
          step, id, con, verdict, seeds, owners, base, anc, network, minSeedGap,
          pocket, layout, suggest,
        }),
      };
    }

    const near = nearest(seeds, owners, con, pocket.opts.aniso);
    const seedIndices = con.seeds.map((_, k) => seeds.length + k);
    steps.push({
      step, node: id, solid: con.solid, centre: con.centre.slice(), r: con.r,
      seedIndices,
      clearance: near ? near.gap : Infinity,
      margin: near ? near.gap - minSeedGap : Infinity,
      nearest: near,
      // `pairGap` against every already-placed constellation. Redundant with
      // `nearest` for the minimum, and not redundant for the diagnosis: it says
      // WHICH neighbour is tight, which is what a caller repositioning a
      // factory needs.
      pairGaps: placed.map((p) => ({ node: p.node, gap: pairGap(con, p.con) })),
    });
    for (let k = 0; k < con.seeds.length; k++) {
      plan.push({ step, node: id, summonSeed: k, seedIndex: seeds.length, point: con.seeds[k].slice() });
      seeds.push(con.seeds[k].slice());
      owners.push(id);
    }
    placed.push({ node: id, con });
  }

  const clearance = steps.reduce((m, s) => Math.min(m, s.clearance), Infinity);
  return {
    ok: true, order, topoOrder: topo, steps, plan,
    clearance,
    margin: clearance === Infinity ? Infinity : clearance - minSeedGap,
  };
}

/** Turn `legalSummon`'s refusals into the certificate's answer for one step. */
function explain({ step, id, con, verdict, seeds, owners, base, anc, network, minSeedGap, pocket, layout, suggest }) {
  const refusals = verdict.refusals.map((r) => {
    if (r.reason !== 'seed') return { ...r, blame: r.reason };
    if (r.seedIndex < base) return { ...r, blame: 'pocket' };
    return { ...r, blame: 'step', blockedByNode: owners[r.seedIndex], blockedBySeed: r.seedIndex };
  });

  const blames = BLAME_PRECEDENCE.filter((b) => refusals.some((r) => r.blame === b));
  const blame = blames[0] ?? null;

  // Every earlier step this one collided with, once each, carrying the tightest
  // gap seen against it — the number a caller needs to know how far to move.
  const byNode = new Map();
  for (const r of refusals) {
    if (r.blame !== 'step') continue;
    const prev = byNode.get(r.blockedByNode);
    if (!prev || r.gap < prev.gap) {
      byNode.set(r.blockedByNode, { node: r.blockedByNode, gap: r.gap, seedIndex: r.seedIndex, need: minSeedGap });
    }
  }
  const blockedBy = [...byNode.values()];
  const mine = anc.get(id) ?? new Set();
  const dependencyBlocked = blockedBy.filter((b) => mine.has(b.node)).map((b) => b.node);

  // Reordering can only ever rescue a step whose ONLY obstruction is other
  // steps of this same build, none of which it depends on. That is NECESSARY
  // and not sufficient — see this file's header — so it decides whether there
  // is an order worth TRYING, and nothing more.
  const onlySteps = refusals.length > 0 && refusals.every((r) => r.blame === 'step');
  const attemptedOrder = (onlySteps && dependencyBlocked.length === 0)
    ? orderPreferring(network, id, blockedBy.map((b) => b.node))
    : null;

  // …and then it is RUN. `suggest: false` on the nested call is the recursion
  // guard: that run's own failure record reports `reorderCheck: 'unchecked'`
  // and constructs no further trial, so `reorderRuns` can only ever be 0 or 1.
  let reorderCheck = 'none';
  let reorderable = false;
  let reorderRuns = 0;
  let suggestedOrder = null;
  if (attemptedOrder && !suggest) {
    reorderCheck = 'unchecked';
  } else if (attemptedOrder) {
    const trial = certify(pocket, network, layout, { order: attemptedOrder, minSeedGap, suggest: false });
    reorderRuns = 1 + (trial.ok ? 0 : trial.failure.reorderRuns);
    // The trial may fail LATER than this step and still have certified it —
    // by (1) in the header the build as a whole is doomed either way, and the
    // question here is only about THIS piece.
    reorderable = trial.steps.some((s) => s.node === id);
    reorderCheck = reorderable ? 'verified' : 'refuted';
    suggestedOrder = reorderable ? attemptedOrder : null;
  }

  const names = blockedBy.map((b) => `"${b.node}"`).join(', ');
  let why;
  if (reorderCheck === 'verified') {
    why = `step ${step} ("${id}") is blocked only by earlier step(s) ${names}, none of which it depends on — building it before them was tried and it lands`;
  } else if (reorderCheck === 'refuted') {
    why = `step ${step} ("${id}") is blocked only by earlier step(s) ${names}, none of which it depends on — but building it before them was tried and it is refused there too, by a step that originally came later; the layout has to move`;
  } else if (reorderCheck === 'unchecked') {
    why = `step ${step} ("${id}") is blocked only by earlier step(s) ${names}, none of which it depends on — a legal order putting it first exists but was not run, so whether it lands is unknown`;
  } else if (onlySteps) {
    why = `step ${step} ("${id}") is blocked by earlier step(s) ${names}, and it DEPENDS on ${dependencyBlocked.map((n) => `"${n}"`).join(', ')} — no topological order can place it earlier`;
  } else if (blame === 'pocket') {
    why = `step ${step} ("${id}") is blocked by a pre-existing pocket seed — no order changes what is already there; the layout has to move`;
  } else if (blame === 'hull') {
    why = `step ${step} ("${id}") reaches outside the pocket hull — no order changes where the walls are`;
  } else if (blame === 'self') {
    why = `step ${step} ("${id}") fights its own seeds: this constellation cannot be summoned anywhere, at any r this small`;
  } else if (blame === 'metric') {
    why = `step ${step} ("${id}") was built for a different anisotropy than the pocket uses — it would come out rotated`;
  } else {
    why = `step ${step} ("${id}") was refused`;
  }

  return {
    step, node: id, solid: con.solid, centre: con.centre.slice(),
    blame, blames, refusals, first: refusals[0] ?? null,
    blockedBy, dependencyBlocked,
    reorderable, reorderCheck, reorderRuns, attemptedOrder, suggestedOrder,
    why,
  };
}

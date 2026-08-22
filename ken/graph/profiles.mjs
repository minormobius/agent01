/* ─────────────────────────────────────────────────────────────────────
   ken/lab/profiles.mjs — every org chart for n turns, and the trade it
   forces.

   WP2 catalogued six shapes by hand at n = 6. The catalogue generalises
   without any new idea, because a layered plan is a COMPOSITION of n.

   A profile is the layer widths, source and sink pinned to one:

       [1, l2, ..., l(k-1), 1]      sum = n

   Depth is k - 1 and peak width is max(li). Compositions of n - 2 into
   any number of parts number exactly 2^(n-3), so the family is small
   enough to enumerate outright to about n = 16 and to draw all of.

   ── THE TRADE, WHICH IS ISOPERIMETRIC ────────────────────────────────

   The interior holds n - 2 turns spread over d - 1 layers, so

       peak width  >=  ceil( (n - 2) / (d - 1) )

   with equality exactly when the interior layers are balanced. That is
   the whole trade and it is arithmetic, not a finding:

       n         is the VOLUME — what the run costs
       depth     is TIME       — the critical path, if a layer runs at once
       peak width is SURFACE   — how many agents must exist simultaneously

   Fixing the cost fixes the product. A chain buys the lowest surface at
   the highest latency; a star buys one turn of latency at a surface of
   n - 2. Nothing in between is free.

   ── WHAT IS NOT DETERMINED BY THE TRADE ──────────────────────────────

   Two quantities move independently of it and are the reason to compute
   rather than eyeball:

   1. THE KEN RATIO at the sink. `briefed` wiring adds an edge from every
      turn to the last one. It changes no width, no depth and no cost, and
      it moves sink ken to 1.

   2. FREE REPLICATION. The largest orbit is the number of turns a run
      contains that are replicates by symmetry. A balanced profile is
      wide and therefore rich in replicates; a chain has none at any n.

   So the surface is three-dimensional and the widget exists because the
   third axis is not readable off the first two.
   ───────────────────────────────────────────────────────────────────── */

import { depths } from './plan.mjs';
import { positionTable, shapeInvariants, automorphisms } from './roles.mjs';

/** Compositions of `n` into positive parts. 2^(n-1) of them. */
export function compositions(n) {
  if (n < 0) return [];
  if (n === 0) return [[]];
  const out = [];
  for (let first = 1; first <= n; first++) {
    for (const rest of compositions(n - first)) out.push([first, ...rest]);
  }
  return out;
}

/**
 * Every layer profile for n turns with one source and one sink.
 * Exactly 2^(n-3) for n >= 3.
 */
export function profiles(n) {
  if (n < 3) throw new Error('a profile needs at least a source, a middle and a sink');
  return compositions(n - 2).map((c) => [1, ...c, 1]);
}

export const WIRINGS = ['complete', 'lanes'];

/**
 * Build the DAG for a profile.
 *
 *   complete  every turn of a layer feeds every turn of the next
 *   lanes     equal-width neighbouring layers are wired one to one, which
 *             is the standard run's wave wiring; unequal neighbours fall
 *             back to complete because there is no lane to follow
 *
 * `briefed` adds an edge from every turn to the sink. It is a separate
 * flag rather than a wiring because it composes with both.
 */
export function buildProfile(profile, { wiring = 'complete', briefed = false } = {}) {
  if (!WIRINGS.includes(wiring)) throw new Error(`unknown wiring "${wiring}"`);
  const layers = profile.map((w, d) => Array.from({ length: w }, (_, i) => `L${d}.${i}`));
  const nodes = layers.flat().map((id, i) => ({ id, label: id, kind: i === 0 ? 'block' : 'turn', turns: 1 }));
  const edges = [];
  let laneCount = 0;
  for (let d = 0; d + 1 < layers.length; d++) {
    const a = layers[d], b = layers[d + 1];
    if (wiring === 'lanes' && a.length === b.length && a.length > 1) {
      laneCount++;
      a.forEach((u, i) => edges.push({ from: u, to: b[i] }));
    } else {
      for (const u of a) for (const v of b) edges.push({ from: u, to: v });
    }
  }
  const sink = layers[layers.length - 1][0];
  if (briefed) {
    const have = new Set(edges.filter((e) => e.to === sink).map((e) => e.from));
    for (const n of nodes) if (n.id !== sink && !have.has(n.id)) edges.push({ from: n.id, to: sink });
  }
  const g = { nodes, edges };
  const d = depths(g);
  return {
    profile: profile.slice(), wiring, briefed, laneJoints: laneCount,
    nodes: nodes.map((n) => ({ ...n, depth: d.get(n.id) })),
    edges,
    turns: nodes.length,
    source: layers[0][0],
    sink,
    depth: Math.max(...d.values()),
  };
}

/**
 * The isoperimetric bound, stated so it can be checked rather than
 * believed: the interior's n-2 turns occupy d-1 layers.
 */
export function widthFloor(n, depth) {
  if (depth < 2) return Infinity;
  return Math.ceil((n - 2) / (depth - 1));
}

// ── one row per shape ─────────────────────────────────────────────────

/**
 * Every quantity the widget shows, for one built profile.
 *
 * Orbits come from refinement rather than the group when the graph is
 * wide, because a width-w layer carries w! automorphisms. Refinement is a
 * coarsening, so `replicates` is then an UPPER BOUND and `orbitsAreBounds`
 * says so. The threshold is deliberate and low: the exact search runs
 * whenever it is affordable.
 */
export function summarise(g, { rho = 0.413, exactBelow = 9 } = {}) {
  const opts = { orbitsOnly: g.turns >= exactBelow };
  const inv = shapeInvariants(g, opts);
  const rows = positionTable(g, opts);
  const sinkRow = rows.find((r) => r.id === g.sink);
  const m = inv.largestOrbit;
  const deff = 1 + (m - 1) * rho;
  return {
    profile: g.profile.join('·'),
    wiring: g.wiring,
    briefed: g.briefed,
    turns: g.turns,
    depth: g.depth,
    width: inv.width,
    widthFloor: widthFloor(g.turns, g.depth),
    balanced: inv.width === widthFloor(g.turns, g.depth),
    edges: g.edges.length,
    maxInDeg: inv.maxInDeg,
    maxOutDeg: inv.maxOutDeg,
    sinkKen: sinkRow.ken,
    meanKen: inv.meanKen,
    replicates: m,
    effective: round(m / deff),
    orbits: inv.orbitCount,
    orbitsAreBounds: inv.orbitsAreBounds,
    roles: inv.roles,
  };
}

const round = (x) => Math.round(x * 1000) / 1000;

/**
 * The whole family for n, across both wirings and both briefing states.
 *
 * Deduplicated on the built edge set, because `lanes` collapses to
 * `complete` on a profile with no equal-width neighbouring pair, and
 * `briefed` is a no-op on a profile whose sink already sees everything.
 */
export function family(n, { rho = 0.413, wirings = WIRINGS, brief = [false, true] } = {}) {
  const seen = new Set();
  const out = [];
  for (const profile of profiles(n)) {
    for (const wiring of wirings) {
      for (const briefed of brief) {
        const g = buildProfile(profile, { wiring, briefed });
        const key = g.edges.map((e) => `${e.from}>${e.to}`).sort().join('|');
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({ ...summarise(g, { rho }), graph: g });
      }
    }
  }
  return out;
}

/**
 * The Pareto frontier: nothing on it is beaten on every axis at once.
 *
 * Lower is better for depth, width and peak merge load; higher is better
 * for sink ken and effective replication. A row survives unless some
 * other row is at least as good everywhere and strictly better somewhere.
 */
export function frontier(n, opts = {}) {
  return frontierOf(opts.rows ?? family(n, opts));
}

/**
 * Domination over a precomputed family.
 *
 * Deduplicated on the objective vector first. Many profiles differ only
 * in which layer is wide and score identically, and the comparison is
 * quadratic, so collapsing ties first is what keeps n = 14 usable.
 */
export function frontierOf(rows) {
  const key = (r) => `${r.depth}|${r.width}|${r.maxInDeg}|${r.sinkKen}|${r.effective}`;
  const seen = new Map();
  for (const r of rows) if (!seen.has(key(r))) seen.set(key(r), r);
  const uniq = [...seen.values()];
  const better = (a, b) => // does a dominate b?
    a.depth <= b.depth && a.width <= b.width && a.maxInDeg <= b.maxInDeg
    && a.sinkKen >= b.sinkKen && a.effective >= b.effective
    && (a.depth < b.depth || a.width < b.width || a.maxInDeg < b.maxInDeg
      || a.sinkKen > b.sinkKen || a.effective > b.effective);
  return uniq.filter((b) => !uniq.some((a) => a !== b && better(a, b)));
}

/**
 * The time-cost curve the widget draws: for each achievable depth, the
 * best available on the other axes.
 *
 * This is the answer to "what does one more turn of latency buy me", and
 * it is the shape the trade is usually felt as.
 */
export function ladder(n, opts = {}) {
  const rows = opts.rows ?? family(n, opts);
  const byDepth = new Map();
  for (const r of rows) {
    const cur = byDepth.get(r.depth);
    if (!cur || r.width < cur.width || (r.width === cur.width && r.effective > cur.effective)) {
      byDepth.set(r.depth, r);
    }
  }
  return [...byDepth.entries()].sort((a, b) => a[0] - b[0]).map(([depth, r]) => ({
    depth,
    minWidth: r.width,
    widthFloor: widthFloor(n, depth),
    bestReplication: Math.max(...rows.filter((x) => x.depth === depth).map((x) => x.effective)),
    bestSinkKen: Math.max(...rows.filter((x) => x.depth === depth).map((x) => x.sinkKen)),
    profile: r.profile,
  }));
}

/**
 * The six named shapes of WP2, as profiles, so the hand-built catalogue
 * and the generated family are demonstrably the same objects.
 */
export const NAMED = {
  chain: { profile: [1, 1, 1, 1, 1, 1], wiring: 'complete', briefed: false },
  standard: { profile: [1, 2, 2, 1], wiring: 'lanes', briefed: false },
  lattice: { profile: [1, 2, 2, 1], wiring: 'complete', briefed: false },
  star: { profile: [1, 4, 1], wiring: 'complete', briefed: false },
  bottleneck: { profile: [1, 3, 1, 1], wiring: 'complete', briefed: false },
  briefed: { profile: [1, 1, 1, 1, 1, 1], wiring: 'complete', briefed: true },
};

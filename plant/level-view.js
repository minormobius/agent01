// level-view.js — draw a production network and let a visitor break it.
//
// The inspector next door explains the SUMMON primitive. This explains nothing:
// it is a level, it has a state you can put it into where it fails, and the
// only thing it asks of a visitor is whether the failure feels fair.
//
// The whole point is the second sentence of the vision's bar for "playable":
// *an intention they formed, acted on, and got refused for*. Dragging the ore
// rate down until the depot starves is a small version of exactly that, and it
// is a real refusal — `feasible()` is the same oracle CI runs, called live in
// the browser on the same level literal the test grades. Nothing here is a
// mock-up of a verdict; if the page says infeasible, the gate says infeasible.
//
// No dependencies, no build step, plain SVG.

import { LEVEL_1 } from './levels/level1.mjs';
import { feasible, band } from './production.mjs';

/** The level with one source's rate overridden — the knob the page exposes. */
export function withSourceRate(level, rate) {
  return { ...level, nodes: level.nodes.map((n) => (n.kind === 'source' ? { ...n, rate } : n)) };
}

/** The level with one named processor's capacity overridden — LEVEL_2's discrete knob. */
export function withProcessorCapacity(level, processorId, capacity) {
  return { ...level, nodes: level.nodes.map((n) => (n.id === processorId && n.kind === 'processor' ? { ...n, capacity } : n)) };
}

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/**
 * Draw the network. A node's COLUMN is 0 if nothing feeds it, else one more
 * than the deepest column among its predecessors — a layered layout, not a
 * single-chain walk, so CONVERGENCE (two sources into one processor) renders
 * every box instead of silently dropping whichever `Array.prototype.find`
 * didn't pick. Nodes sharing a column stack vertically, evenly spaced, in
 * `level.nodes` order (matches the file's existing determinism convention:
 * order comes from the literal, not object iteration). For a single-chain
 * level every column holds exactly one node, so this reduces to the old
 * left-to-right box positions exactly.
 *
 * A node MAY have more than one outgoing edge — production.mjs's fan-out
 * support (explicit per-edge `share`) means a source or processor can split
 * its output across several destinations, and every one of those edges is
 * drawn: `next` collects ALL outgoing edges per node, in `level.edges` order,
 * and the arrow-drawing loop below iterates every entry rather than the last.
 */
export function drawLevel(svg, level, verdict) {
  const incoming = new Map(level.nodes.map((n) => [n.id, []]));
  for (const e of level.edges) incoming.get(e.to).push(e.from);
  const next = new Map(level.nodes.map((n) => [n.id, []]));
  for (const e of level.edges) next.get(e.from).push(e.to);

  const columnCache = new Map();
  const columnOf = (id) => {
    if (columnCache.has(id)) return columnCache.get(id);
    columnCache.set(id, -1); // guard against a cycle production.mjs would already have refused
    const preds = incoming.get(id) || [];
    const col = preds.length === 0 ? 0 : 1 + Math.max(...preds.map(columnOf));
    columnCache.set(id, col);
    return col;
  };

  const columns = [];
  for (const n of level.nodes) {
    const c = columnOf(n.id);
    (columns[c] ||= []).push(n);
  }

  const W = 640, H = 150, bw = 150, bh = 62;
  const gap = (W - columns.length * bw) / (columns.length + 1);
  const parts = [];
  const pos = new Map(); // id -> box top-left {x, y}

  columns.forEach((col, ci) => {
    const x = gap + ci * (bw + gap);
    const rowGap = H / (col.length + 1);
    col.forEach((n, ri) => {
      const y = (ri + 1) * rowGap - bh / 2;
      pos.set(n.id, { x, y });
      // A node is "starved" when the sink it feeds did not get what it demanded.
      const short = verdict.deficits.some((d) => d.sinkId === n.id);
      const got = verdict.achieved[n.id];
      const line2 = n.kind === 'source' ? `${n.rate}/tick`
        : n.kind === 'sink' ? `needs ${n.demand}${got !== undefined ? ` · got ${got}` : ''}`
          : `capacity ${n.capacity}`;
      parts.push(`<g>
        <rect x="${x}" y="${y}" width="${bw}" height="${bh}" rx="6"
              fill="var(--bg)" stroke="var(${short ? '--bad' : '--edge'})" stroke-width="${short ? 2.4 : 1.5}"/>
        <text x="${x + bw / 2}" y="${y + 25}" text-anchor="middle" class="ln">${esc(n.id)}</text>
        <text x="${x + bw / 2}" y="${y + 44}" text-anchor="middle" class="ls ${short ? 'bad' : ''}">${esc(line2)}</text>
      </g>`);
    });
  });

  for (const [fromId, toIds] of next) {
    const from = pos.get(fromId);
    if (!from) continue;
    for (const toId of toIds) {
      const to = pos.get(toId);
      if (!to) continue;
      const ax = from.x + bw, ay = from.y + bh / 2;
      const bx = to.x, by = to.y + bh / 2;
      parts.push(`<path d="M${ax} ${ay} L${bx - 7} ${by}" stroke="var(--edge)" stroke-width="1.5" fill="none"/>
        <path d="M${bx - 7} ${by} l-6 -4 v8 z" fill="var(--edge)"/>`);
    }
  }

  svg.innerHTML = parts.join('\n');
  return columns.flat();
}

/** One sentence a non-engineer can act on. The margin is the difficulty dial. */
export function verdictLine(v) {
  if (!v.ok) {
    if (v.deficits.length === 0) return '✗ infeasible';
    const parts = v.deficits.map((d) =>
      `${d.sinkId} wanted ${d.demand} ${d.resource} and got ${d.achieved} (short by ${(d.demand - d.achieved).toFixed(0)})`);
    return `✗ ${parts.join('; ')}.`;
  }
  const pct = (v.margin * 100).toFixed(0);
  const label = band(v.margin);
  if (v.margin <= 0.05) return `✓ satisfiable (${label}), with ${pct}% to spare. Barely — which is the point.`;
  return `✓ satisfiable (${label}), with ${pct}% to spare. Comfortable enough that it is not much of a puzzle.`;
}

// --------------------------------------------------------- refusals, in words --
//
// `placement.mjs` produces real refusals with everything needed to explain them
// — the seed index and the actual gap, or the hull wall and how far outside —
// and every one of them is a JavaScript object nobody can read. This turns one
// into a sentence, and it is bound by two rules learned the hard way in this
// tree:
//
//  1. REPORT EVERY REFUSAL. `verdictLine` above shipped reading `deficits[0]`
//     and silently dropping the rest; `legalSummon` deliberately returns the
//     full list so the same mistake is not available here. A summon fouling
//     three seeds says three.
//  2. NEVER RECOMPUTE A NUMBER. Every distance in the string is read off the
//     verdict (`need`/`gap`/`depth`), so the sentence cannot claim a distance
//     the predicate did not measure. The only arithmetic is `need - gap`, a
//     subtraction of two fields the refusal carries — the same shape
//     `verdictLine` uses for `demand - achieved`.
//
// No import from `placement.mjs`: this file is loaded in a browser and the
// predicate drags in `foamworld.js`. It reads a plain verdict object instead,
// which is also what lets the gate build verdicts with the real predicate in
// node and hand them straight here.

/** `about 0.29 m`, or an honest non-answer if the field was missing. */
const amount = (m) => (Number.isFinite(m)
  ? (m < 0.01 ? 'less than 0.01 m' : `about ${Number(m.toFixed(2))} m`)
  : 'an unknown distance');

// `B0`…`B5` as `foamworld.js` names its boundary faces. Only the two the player
// has a word for are worth distinguishing; the other four are all "the wall".
const WALL_WORDS = { B2: 'the floor', B3: 'the ceiling' };

/** ` in 3 places`, or nothing at all when there is only one. */
const places = (n) => (n > 1 ? ` in ${n} places` : '');

/** The refusal with the largest `f`, keeping the EARLIEST on a tie so the
 *  sentence names the same one on every run. */
const worstBy = (rs, f) => rs.reduce((a, b) => (f(b) > f(a) ? b : a));

/**
 * One sentence a person can act on, for a summon `placement.mjs` refused —
 * or `null` when there is nothing to refuse.
 *
 * `null` rather than `''` on purpose: a caller writing `if (line)` behaves the
 * same either way, and a caller that renders the value unconditionally shows
 * "null" (visible, reported) rather than an empty box (invisible, shipped).
 *
 * Three player mistakes, three shapes, because they need three different
 * responses:
 *
 *   `seed`   you tried to build into ground that is already solid — move.
 *   `hull`   part of the shape is outside the cave — move, or turn it.
 *   `self`   the shape cannot hold itself apart at this size. This is a
 *            property of the SUMMON, not of the place, and it says so:
 *            moving will not help, making it bigger will.
 *
 * `metric` is the fourth reason `legalSummon` can give and a player can never
 * cause it (`summonAt` takes `aniso` from the pocket, which makes it
 * unreachable by construction). It is rendered anyway rather than falling
 * through to an empty clause, because a refusal with no sentence is the one
 * outcome this function exists to prevent.
 */
export function refusalLine(verdict) {
  if (!verdict || verdict.ok) return null;
  const refusals = verdict.refusals || [];
  if (refusals.length === 0) return null;

  const shape = verdict.solid || 'shape';

  // Grouped by reason, in the order the reasons first appear in the verdict,
  // so the sentence's order is the predicate's order and not this file's.
  const order = [];
  const groups = new Map();
  for (const r of refusals) {
    const key = r && r.reason ? r.reason : 'unknown';
    if (!groups.has(key)) { groups.set(key, []); order.push(key); }
    groups.get(key).push(r);
  }

  const clauses = order.map((reason) => {
    const rs = groups.get(reason);
    const n = rs.length;
    if (reason === 'seed') {
      const w = worstBy(rs, (r) => r.need - r.gap);
      const how = amount(w.need - w.gap);
      return `Too close to the rock already here${places(n)} — ${n > 1 ? `the tightest is ${how}` : how} short of clear.`;
    }
    if (reason === 'hull') {
      const w = worstBy(rs, (r) => r.depth);
      const wall = WALL_WORDS[w.wall] || 'the wall';
      return `Part of the ${shape} pushes out through ${wall}${places(n)}, by ${amount(w.depth)}.`;
    }
    if (reason === 'self') {
      const w = worstBy(rs, (r) => r.need - r.gap);
      const gap = amount(w.need - w.gap);
      const head = n > 1
        ? `This ${shape} is too small to hold itself apart — ${n} pairs of its own points are too close, the tightest by ${gap}.`
        : `This ${shape} is too small to hold itself apart — two of its own points are ${gap} too close.`;
      return `${head} Nothing about this spot would fix that; make it bigger.`;
    }
    if (reason === 'metric') {
      return `This ${shape} was measured for different ground and would come out crooked here.`;
    }
    return `The ${shape} cannot be built here${places(n)}.`;
  });

  return `✗ ${clauses.join(' ')}`;
}

export { LEVEL_1, feasible };

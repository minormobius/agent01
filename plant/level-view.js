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
 * Draw the chain. Deliberately literal — a box per node in the order the edges
 * connect them — because the thing a reader needs to see is WHICH LINK IS
 * STARVED, and an abstract layout would hide it behind prettiness.
 */
export function drawLevel(svg, level, verdict) {
  const order = [];
  const byId = new Map(level.nodes.map((n) => [n.id, n]));
  const next = new Map(level.edges.map((e) => [e.from, e.to]));
  let cur = level.nodes.find((n) => n.kind === 'source');
  while (cur) { order.push(cur); cur = byId.get(next.get(cur.id)); }

  const W = 640, H = 150, bw = 150, bh = 62;
  const gap = (W - order.length * bw) / (order.length + 1);
  const parts = [];

  order.forEach((n, i) => {
    const x = gap + i * (bw + gap), y = (H - bh) / 2;
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
    if (i < order.length - 1) {
      const ax = x + bw, bx = x + bw + gap;
      parts.push(`<path d="M${ax} ${H / 2} L${bx - 7} ${H / 2}" stroke="var(--edge)" stroke-width="1.5" fill="none"/>
        <path d="M${bx - 7} ${H / 2} l-6 -4 v8 z" fill="var(--edge)"/>`);
    }
  });
  svg.innerHTML = parts.join('\n');
  return order;
}

/** One sentence a non-engineer can act on. The margin is the difficulty dial. */
export function verdictLine(v) {
  if (!v.ok) {
    const d = v.deficits[0];
    return d
      ? `✗ ${d.sinkId} wanted ${d.demand} ${d.resource} and got ${d.achieved}. Short by ${(d.demand - d.achieved).toFixed(0)}.`
      : '✗ infeasible';
  }
  const pct = (v.margin * 100).toFixed(0);
  const label = band(v.margin);
  if (v.margin <= 0.05) return `✓ satisfiable (${label}), with ${pct}% to spare. Barely — which is the point.`;
  return `✓ satisfiable (${label}), with ${pct}% to spare. Comfortable enough that it is not much of a puzzle.`;
}

export { LEVEL_1, feasible };

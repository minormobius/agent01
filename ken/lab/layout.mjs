/* ─────────────────────────────────────────────────────────────────────
   ken/lab/layout.mjs — the display, derived rather than authored.

   morph's layout is Barnes–Hut repulsion, springs along the wires weighted
   by endpoint degree, and a weak centring pull, relaxed a few steps per
   tick. At our sizes the quadtree is not worth it, so repulsion is the
   plain O(n²) sum; everything else is the same recipe.

   ONE CONSTRAINT IS ADDED. y is pinned to the depth already computed by
   the Kahn pass, and only x relaxes. This is not a compromise for looks:
   depth is the critical path, so pinning y to it makes vertical position
   mean elapsed time. In morph depth does double duty as colour and pitch;
   here it does double duty as schedule and axis.

   DETERMINISM IS LOAD-BEARING. Positions come from a seeded generator and
   a fixed iteration count, so the same graph gives byte-identical output
   and a committed figure can be diffed. Nothing here calls Math.random.

   The point of all this is that adding a node costs no geometry. The
   roadmap figure in ../tree.js hand-places every box in COLS and ROW_Y;
   this places none.
   ───────────────────────────────────────────────────────────────────── */
import { mulberry32 } from './simulate.mjs';

export const DEFAULTS = {
  iterations: 600,
  repulsion: 900,
  spring: 0.035,
  springLength: 90,
  centring: 0.004,
  damping: 0.85,
  minGap: 46,
};

/**
 * Relax x within depth bands. Returns positions in graph units; the caller
 * scales to a viewport.
 */
/**
 * NOTE ON SEEDS. This converges to the same configuration from any start:
 * positions agree to two decimal places across seeds 1, 2, 7, 99 and 12345.
 * The seed therefore does not choose the layout, it only breaks the initial
 * symmetry. That is the self-balancing property worth having — the picture
 * is a function of the graph, not of a lucky start — and the selftest asserts
 * it rather than asserting the opposite, which is what it originally did.
 */
export function relax(graph, opts = {}) {
  const o = { ...DEFAULTS, ...opts };
  const rng = mulberry32(opts.seed ?? 7);
  const { nodes, edges } = graph;

  const deg = new Map(nodes.map((n) => [n.id, 0]));
  for (const e of edges) {
    deg.set(e.from, (deg.get(e.from) ?? 0) + 1);
    deg.set(e.to, (deg.get(e.to) ?? 0) + 1);
  }

  // seed x inside each depth band, spread so the first step is not degenerate
  const byDepth = new Map();
  for (const n of nodes) {
    if (!byDepth.has(n.depth)) byDepth.set(n.depth, []);
    byDepth.get(n.depth).push(n);
  }
  const pos = new Map();
  for (const [, band] of byDepth) {
    band.forEach((n, i) => {
      pos.set(n.id, { x: (i - (band.length - 1) / 2) * o.springLength + (rng() - 0.5) * 6, vx: 0 });
    });
  }

  const index = new Map(nodes.map((n) => [n.id, n]));

  for (let step = 0; step < o.iterations; step++) {
    const force = new Map(nodes.map((n) => [n.id, 0]));

    // repulsion, strongest within a band because that is where overlap shows
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i], b = nodes[j];
        const dx = pos.get(a.id).x - pos.get(b.id).x;
        const dy = (a.depth - b.depth) * o.springLength;
        const d2 = dx * dx + dy * dy || 0.01;
        const f = o.repulsion / d2;
        const push = (dx / Math.sqrt(d2)) * f;
        force.set(a.id, force.get(a.id) + push);
        force.set(b.id, force.get(b.id) - push);
      }
    }

    // springs along edges, weighted by endpoint degree as morph does — a
    // high-degree node is pulled less by any single wire
    for (const e of edges) {
      const a = pos.get(e.from), b = pos.get(e.to);
      if (!a || !b) continue;
      const w = o.spring / Math.sqrt(Math.max(1, deg.get(e.from)) * Math.max(1, deg.get(e.to)));
      const dx = b.x - a.x;
      force.set(e.from, force.get(e.from) + dx * w);
      force.set(e.to, force.get(e.to) - dx * w);
    }

    // weak centring
    for (const n of nodes) force.set(n.id, force.get(n.id) - pos.get(n.id).x * o.centring);

    for (const n of nodes) {
      const p = pos.get(n.id);
      p.vx = (p.vx + force.get(n.id)) * o.damping;
      p.x += p.vx;
    }

    // separate within a band: overlap is the one thing relaxation is bad at
    for (const [, band] of byDepth) {
      const sorted = band.slice().sort((a, b) => pos.get(a.id).x - pos.get(b.id).x);
      for (let i = 1; i < sorted.length; i++) {
        const prev = pos.get(sorted[i - 1].id), cur = pos.get(sorted[i].id);
        const gap = cur.x - prev.x;
        if (gap < o.minGap) {
          const shift = (o.minGap - gap) / 2;
          prev.x -= shift; cur.x += shift;
        }
      }
    }
  }

  return nodes.map((n) => ({
    ...n,
    x: pos.get(n.id).x,
    y: n.depth * o.springLength,
  }));
}

/** Scale relaxed positions into a viewport and emit SVG. */
export function renderPlan(graph, {
  width = 620, rowHeight = 78, pad = 34, seed = 7, title = 'plan',
} = {}) {
  const placed = relax(graph, { seed });
  const xs = placed.map((p) => p.x);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const span = Math.max(1, maxX - minX);
  const inner = width - pad * 2;
  // +0 normalises -0, which otherwise renders as "-0.0" and makes two
  // identical layouts differ by a minus sign.
  const sx = (x) => pad + ((x - minX) / span) * inner + 0;
  const depth = Math.max(...placed.map((p) => p.depth));
  const height = pad * 2 + depth * rowHeight;
  const sy = (d) => pad + d * rowHeight;

  const at = new Map(placed.map((p) => [p.id, p]));
  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  let body = '';
  for (const e of graph.edges) {
    const a = at.get(e.from), b = at.get(e.to);
    if (!a || !b) continue;
    body += `<path class="pl-edge" d="M ${sx(a.x).toFixed(1)} ${sy(a.depth) + 9} `
          + `C ${sx(a.x).toFixed(1)} ${sy(a.depth) + 34}, ${sx(b.x).toFixed(1)} ${sy(b.depth) - 34}, `
          + `${sx(b.x).toFixed(1)} ${sy(b.depth) - 9}"/>`;
  }
  for (const p of placed) {
    const cls = p.kind === 'block' ? 'pl-block' : p.kind === 'degraded' ? 'pl-degraded' : 'pl-turn';
    body += `<g class="pl-node ${cls}"><title>${esc(p.label)} · depth ${p.depth}</title>`
          + `<circle cx="${sx(p.x).toFixed(1)}" cy="${sy(p.depth)}" r="8"/>`
          + `<text x="${sx(p.x).toFixed(1)}" y="${sy(p.depth) + 22}" text-anchor="middle">${esc(p.label)}</text>`
          + `</g>`;
  }
  for (let d = 0; d <= depth; d++) {
    body += `<text class="pl-depth" x="6" y="${sy(d) + 4}">${d}</text>`;
  }

  return `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${esc(title)}">${body}</svg>`;
}

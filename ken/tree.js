/* ─────────────────────────────────────────────────────────────────────
   ken/tree.js — the roadmap as a clickable dependency graph.

   A layered DAG, read bottom-up: evidence at the base, the run at the top.
   Nodes carry a state (done / active / ready / blocked) and a href; edges are
   real prerequisites, so the picture is the plan rather than an illustration
   of it.

   Shared by the browser and by ken.selftest.mjs, which asserts the graph is
   acyclic, that every `needs` id exists, that no two nodes share a cell, and
   that every href resolves to a page or an anchor that is actually on it.
   ───────────────────────────────────────────────────────────────────── */
(function (root) {
  'use strict';

  // Layout grid. Rows are laid out bottom-up: row 0 is the base.
  const COLS = { left: 158, mid: 462, right: 766 };
  /* Ten rows in the same 850-high viewBox. Row 7 was added for WP3, so
     `reg` and `run` each moved up one index and the ladder was re-spaced
     rather than extended — the viewBox is NOT linked to this array, and a
     taller ladder would have silently clipped the top box. */
  const ROW_Y = [806, 721, 636, 551, 466, 381, 296, 211, 126, 41];
  const W = 262, H = 50, WIDE = 566, R = 7;

  const NODES = [
    // row 0 — the evidence this programme is a response to
    { id: 'loop', row: 0, col: 'left', state: 'done', href: '/#editorial',
      lines: ['loop · 89 turns'], sub: '0 quality scores' },
    { id: 'race01', row: 0, col: 'mid', state: 'done', href: '/methods#evidence',
      lines: ['race-01 · 11 runs'], sub: '11/11 passed' },
    { id: 'race02', row: 0, col: 'right', state: 'done', href: '/methods#evidence',
      lines: ['race-02 · 12 runs'], sub: '12/12 passed' },

    // row 1 — what was learned from them
    { id: 'standard', row: 1, col: 'mid', state: 'done', wide: true, href: '/methods',
      lines: ['House standard · R1–R15'], sub: 'how a run is designed, scored and reported',
      needs: ['loop', 'race01', 'race02'] },

    // row 2 — the three foundational units
    { id: 'u1', row: 2, col: 'left', state: 'ready', href: '/syllabus#unit-1',
      lines: ['Unit I', 'Measurement of unobservables'], needs: ['standard'] },
    { id: 'u2', row: 2, col: 'mid', state: 'done', href: '/syllabus#unit-2',
      lines: ['Unit II', 'Design of experiments'], needs: ['standard'] },
    { id: 'u3', row: 2, col: 'right', state: 'ready', href: '/syllabus#unit-3',
      lines: ['Unit III', 'Delegation under unobservable effort'], needs: ['standard'] },

    // row 3 — first outputs
    { id: 'b12', row: 3, col: 'left', state: 'blocked', href: '/protocol#blanks',
      lines: ['B1 construct · B2 reliability'], sub: 'what quality means, and how well it is measured',
      needs: ['u1'] },
    { id: 'harness', row: 3, col: 'mid', state: 'done', href: '/lab',
      lines: ['The harness'], sub: 'design calculator · 92 known-answer checks',
      needs: ['u2'] },
    { id: 'u4', row: 3, col: 'right', state: 'active', href: '/syllabus#unit-4',
      lines: ['Unit IV', 'Organisation & authority'], needs: ['standard'] },

    // row 4
    { id: 'wp1', row: 4, col: 'mid', state: 'done', href: '/wp1',
      lines: ['WP1 · variance of unattended work'], sub: '4 hypotheses · design simulated, pilot re-scoped',
      needs: ['harness'] },
    { id: 'u6', row: 4, col: 'left', state: 'blocked', href: '/syllabus#unit-6',
      lines: ['Unit VI', 'Judgment as an instrument'], needs: ['b12', 'harness'] },
    { id: 'u5', row: 4, col: 'right', state: 'blocked', href: '/syllabus#unit-5',
      lines: ['Unit V', 'Proxy failure, quantified'], needs: ['u4', 'b12'] },

    // row 5
    { id: 'b3', row: 5, col: 'left', state: 'blocked', href: '/protocol#blanks',
      lines: ['B3 calibrated judge'], sub: 'agreement against the human ceiling',
      needs: ['u6'] },
    { id: 'b45', row: 5, col: 'mid', state: 'ready', href: '/protocol#blanks',
      lines: ['B4 power · B5 stopping rule'], sub: 'sample size, and when to stop',
      needs: ['wp1'] },
    { id: 'u7', row: 5, col: 'right', state: 'blocked', href: '/syllabus#unit-7',
      lines: ['Unit VII', 'Oversight beyond your ken'], needs: ['u6'] },

    // row 6
    { id: 'wp2', row: 6, col: 'left', state: 'active', href: '/wp2',
      lines: ['WP2 · the org chart of a run'], sub: '9 roles · orbits decide pooling · explorer for any n',
      needs: ['wp1', 'u4'] },
    { id: 'wp3', row: 7, col: 'mid', state: 'active', href: '/wp3',
      lines: ['WP3 · what direction buys'], sub: 'an exchange rate, and where it is infinite',
      needs: ['wp2'] },
    { id: 'b6', row: 6, col: 'right', state: 'blocked', href: '/protocol#blanks',
      lines: ['B6 outside signal'], sub: 'a verdict from someone who is not this system',
      needs: ['u7'] },

    // row 7 — the gate
    { id: 'reg', row: 8, col: 'mid', state: 'blocked', wide: true, href: '/protocol',
      lines: ['Registration · all six blanks closed'], sub: 'the protocol becomes registrable',
      needs: ['b12', 'b45', 'b3', 'b6'] },

    // row 8 — the point of the whole thing
    { id: 'run', row: 9, col: 'mid', state: 'blocked', wide: true, href: '/protocol#sequence',
      lines: ['The run, and the curve'], sub: 'published whichever way it comes out',
      needs: ['reg'] },
  ];

  const LEGEND = [
    { state: 'done', label: 'done' },
    { state: 'active', label: 'in progress' },
    { state: 'ready', label: 'ready to start' },
    { state: 'blocked', label: 'blocked by a prerequisite' },
  ];

  // ── geometry ────────────────────────────────────────────────────────
  function box(n) {
    const w = n.wide ? WIDE : W;
    const cx = COLS[n.col];
    return { x: cx - w / 2, y: ROW_Y[n.row] - H / 2, w, h: H, cx, cy: ROW_Y[n.row] };
  }

  /** Orthogonal elbow from a lower node up to a higher one. */
  function elbow(from, to) {
    const a = box(from), b = box(to);
    const y1 = a.y, y2 = b.y + b.h;           // top of lower, bottom of upper
    const mid = (y1 + y2) / 2;
    return a.cx === b.cx
      ? `M ${a.cx} ${y1} L ${b.cx} ${y2}`
      : `M ${a.cx} ${y1} L ${a.cx} ${mid} L ${b.cx} ${mid} L ${b.cx} ${y2}`;
  }

  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  // ── render ──────────────────────────────────────────────────────────
  function render() {
    const svg = document.getElementById('roadmap');
    if (!svg) return;
    const byId = new Map(NODES.map((n) => [n.id, n]));
    // One marker per edge class: a marker inherits nothing from the path's
    // CSS, so each needs its own fill to match the stroke it terminates.
    let s = '<defs>'
      + ['done', 'live', 'dim'].map((c) =>
          `<marker id="tip-${c}" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="6" markerHeight="6" orient="auto-start-reverse">`
          + `<path class="ttip ${c}" d="M 0 0 L 8 4 L 0 8 z"/></marker>`).join('')
      + '</defs>';

    // edges first, so nodes paint over them
    for (const n of NODES) {
      for (const dep of n.needs || []) {
        const from = byId.get(dep);
        if (!from) continue;
        const cls = n.state === 'done' ? 'done' : from.state === 'done' ? 'live' : 'dim';
        s += `<path class="tedge ${cls}" marker-end="url(#tip-${cls})" d="${elbow(from, n)}"/>`;
      }
    }

    // nodes
    for (const n of NODES) {
      const b = box(n);
      const twoLine = n.lines.length > 1;
      const baseY = n.sub
        ? (twoLine ? b.cy - 9 : b.cy - 5)
        : (twoLine ? b.cy - 6 : b.cy + 1);

      let text = '';
      n.lines.forEach((ln, i) => {
        const cls = twoLine && i === 0 ? 'tkicker' : 'tlabel';
        text += `<text class="${cls}" x="${b.cx}" y="${baseY + i * 15}" text-anchor="middle">${esc(ln)}</text>`;
      });
      if (n.sub) {
        text += `<text class="tsub" x="${b.cx}" y="${baseY + n.lines.length * 15 + 1}" text-anchor="middle">${esc(n.sub)}</text>`;
      }

      s += `<a class="tnode ${n.state}" href="${n.href}">`
         + `<title>${esc(n.lines.join(' — '))}${n.sub ? '. ' + esc(n.sub) : ''}</title>`
         + `<rect x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" rx="${R}"/>`
         + text
         + `</a>`;
    }

    svg.innerHTML = s;

    // legend, rendered as HTML beside the figure
    const leg = document.getElementById('roadmap-legend');
    if (leg) {
      leg.innerHTML = LEGEND.map((l) =>
        `<span class="lgd ${l.state}"><i></i>${esc(l.label)}</span>`).join('');
    }
  }

  root.KEN_TREE = { NODES, COLS, ROW_Y, box, elbow, render };
  if (typeof module !== 'undefined' && module.exports) module.exports = { NODES, COLS, ROW_Y, box, elbow };
  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', render);
    else render();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);

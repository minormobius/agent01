// gen.mjs — one composer, five generators, and a trait space nobody invented.
//
// WHY THIS IS NOT "THE SPRITE COMPOSER". The composition machinery is about the
// SHAPE of a problem — enumerate the legal moves, compute what each does, pick,
// repeat — and nothing in it is about quadrupeds. Five procedural families in
// `mega/sprite/` share one interface (`build*Genome` → genome, `*Frame` →
// cells), so the composer rides all of them and the briefs transfer.
//
// THE TRAIT SPACE IS MEASURED OFF THE RENDER, NOT DERIVED FROM THE PARAMS.
// That distinction is the whole reason this is worth building. The CAD chain
// used a real kernel's invariants; the first sprite chain used ratios I wrote
// myself, which is weaker — my formula, my brief, and the model judging my
// arithmetic back to me. Here every trait is counted from the cells the
// generator actually emits: ink, bounding box, density, where the mass sits,
// left-right symmetry, how far it sprawls. A hound, a spider, an eel and a
// brittle-star are all just filled cells, so the same six numbers describe all
// of them and a brief written once means the same thing everywhere.
//
// Pure and dependency-free apart from the generators themselves.

import { buildQuadGenome, quadFrame, DEFAULT_GENES as QUAD } from '../../sprite/quad/quad.js';
import { buildPolyGenome, polyFrame, DEFAULT_GENES as POLY } from '../../sprite/poly/poly.js';
import { buildAxialGenome, axialFrame, DEFAULT_GENES as AXIAL } from '../../sprite/axial/axial.js';
import { buildIsopodGenome, isopodFrame, DEFAULT_GENES as ISOPOD } from '../../sprite/isopod/isopod.js';
import { buildRadialGenome, radialFrame, DEFAULT_GENES as RADIAL } from '../../sprite/radial/radial.js';

/**
 * Six numbers, counted from the cells. Every one is a property of the picture,
 * so none of them can be argued with and all of them mean the same thing for
 * every family.
 */
export const TRAITS = ['ink', 'aspect', 'coverage', 'centroidY', 'symmetry', 'spread'];

export function measure(cells) {
  if (!cells?.length) return null;
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const c of cells) {
    if (c.x < x0) x0 = c.x; if (c.x > x1) x1 = c.x;
    if (c.y < y0) y0 = c.y; if (c.y > y1) y1 = c.y;
  }
  const w = x1 - x0 + 1, h = y1 - y0 + 1;
  const ink = cells.length;
  let cx = 0, cy = 0;
  for (const c of cells) { cx += c.x; cy += c.y; }
  cx /= ink; cy /= ink;
  // Left-right symmetry about the ink's own centre line, on the cell grid.
  const key = new Set(cells.map((c) => `${c.x},${c.y}`));
  const mid = (x0 + x1) / 2;
  let mirrored = 0;
  for (const c of cells) {
    const mx = Math.round(2 * mid - c.x);
    if (key.has(`${mx},${c.y}`)) mirrored++;
  }
  // Mean distance from the centroid, over the bbox diagonal: compact vs sprawling.
  const diag = Math.hypot(w, h) || 1;
  let d = 0;
  for (const c of cells) d += Math.hypot(c.x - cx, c.y - cy);
  return {
    ink,
    aspect: w / h,
    coverage: ink / (w * h),
    // 0 = the mass sits at the top of its own bounding box, 1 = at the bottom.
    centroidY: h > 1 ? (cy - y0) / (h - 1) : 0.5,
    symmetry: mirrored / ink,
    spread: (d / ink) / diag,
  };
}

/**
 * The generators. `movable` is the decision space, `bounds` and `step` define
 * the legal moves, and `int` marks genes that must stay whole numbers — a
 * generator handed 4.5 leg pairs does not fail loudly, it quietly rounds, and
 * a move that rounds to where it started is a move that does nothing.
 */
export const GENERATORS = {
  quad: {
    label: 'quadruped', family: ['hound', 'boar', 'bear', 'robot'],
    defaults: QUAD, svg: 'quad.svg',
    movable: ['body', 'depth', 'leg', 'neck', 'head', 'snout', 'tail', 'ear', 'stance'],
    bounds: { body: [0.4, 1.8], depth: [0.4, 1.8], leg: [0.4, 1.8], neck: [0.4, 1.8],
      head: [0.4, 1.8], snout: [0.4, 1.8], tail: [0.3, 1.8], ear: [0.3, 1.8], stance: [0, 1] },
    step: { stance: 0.2, _default: 0.15 },
    cells: (genes) => quadFrame(buildQuadGenome(7, genes), 0, false),
  },
  poly: {
    label: 'polypod', family: ['ant', 'spider', 'crab', 'spiderbot'],
    defaults: POLY, svg: 'poly.svg',
    movable: ['legs', 'segs', 'bodyLen', 'bodyWide', 'legLen', 'legGirth', 'claws', 'antennae'],
    bounds: { legs: [3, 5], segs: [1, 3], bodyLen: [0.5, 1.8], bodyWide: [0.5, 1.8],
      legLen: [0.5, 1.8], legGirth: [0.5, 1.8], claws: [0, 1], antennae: [0, 1] },
    step: { legs: 1, segs: 1, claws: 0.25, antennae: 0.25, _default: 0.15 },
    int: ['legs', 'segs'],
    cells: (genes) => polyFrame(buildPolyGenome(7, genes), 0),
  },
  axial: {
    label: 'undulator', family: ['worm', 'snake', 'eel', 'mechworm'],
    defaults: AXIAL, svg: 'axial.svg',
    movable: ['length', 'girth', 'taper', 'amp', 'waves', 'headSize', 'fins', 'segments'],
    bounds: { length: [0.5, 1.8], girth: [0.4, 1.8], taper: [0.1, 0.9], amp: [0.2, 1.8],
      waves: [0.5, 3.5], headSize: [0.5, 1.8], fins: [0, 1], segments: [4, 20] },
    step: { segments: 2, waves: 0.25, fins: 0.25, _default: 0.15 },
    int: ['segments'],
    cells: (genes) => axialFrame(buildAxialGenome(7, genes), 0),
  },
  isopod: {
    label: 'isopod', family: ['pillbug', 'woodlouse', 'giant', 'mechpod'],
    defaults: ISOPOD, svg: 'isopod.svg',
    movable: ['segments', 'bodyLen', 'bodyWide', 'legLen', 'legGirth', 'armor', 'antennae', 'tailFan'],
    bounds: { segments: [4, 12], bodyLen: [0.5, 1.8], bodyWide: [0.5, 1.8], legLen: [0.4, 1.8],
      legGirth: [0.5, 1.8], armor: [0, 1.8], antennae: [0, 1.8], tailFan: [0, 1.8] },
    step: { segments: 1, _default: 0.15 },
    int: ['segments'],
    cells: (genes) => isopodFrame(buildIsopodGenome(7, genes), 0),
  },
  radial: {
    label: 'echinoderm', family: null, svg: 'radial.svg',
    defaults: RADIAL,
    movable: ['arms', 'depth', 'splay', 'taper', 'reach', 'writhe', 'glow'],
    bounds: { arms: [3, 9], depth: [0, 5], splay: [0.15, 1.1], taper: [0.35, 0.9],
      reach: [0.4, 1], writhe: [0, 1.5], glow: [0, 2] },
    step: { arms: 1, depth: 1, _default: 0.1 },
    int: ['arms', 'depth'],
    cells: (genes) => radialFrame(buildRadialGenome(7, genes), 0, genes.size ?? RADIAL.size),
  },
};

const stepFor = (gen, k) => gen.step[k] ?? gen.step._default;
const round = (x, d = 4) => Number(x.toFixed(d));

/**
 * The legal moves. Bounds are the generator's own sane range; an integer gene
 * is kept whole; a move that lands where it started is dropped, because an
 * option that does nothing is a forced move dressed up as a decision.
 */
export function legalMoves(genId, genes) {
  const gen = GENERATORS[genId];
  const out = [];
  for (const k of gen.movable) {
    const [lo, hi] = gen.bounds[k];
    for (const dir of [+1, -1]) {
      let next = (genes[k] ?? gen.defaults[k]) + dir * stepFor(gen, k);
      if (gen.int?.includes(k)) next = Math.round(next);
      next = round(Math.max(lo, Math.min(hi, next)));
      if (Math.abs(next - (genes[k] ?? gen.defaults[k])) < 1e-9) continue;
      out.push({ id: `${k}_${dir > 0 ? 'up' : 'down'}`, gene: k, dir,
        from: genes[k] ?? gen.defaults[k], to: next, genes: { ...genes, [k]: next } });
    }
  }
  return out;
}

/** Render a genome to cells, and measure it. Null when it draws nothing. */
export function traitsOf(genId, genes) {
  try { return measure(GENERATORS[genId].cells(genes)); }
  catch { return null; }
}

/**
 * The briefs, written once in the measured trait space, so the SAME brief means
 * the same thing to a quadruped, a spider, an eel and a brittle-star. That is
 * the thing an overlay buys that a per-generator composer cannot.
 */
export const BRIEFS = {
  compact: { label: 'compact and solid — mass gathered, little empty space',
    target: { coverage: 0.55, spread: 0.20, aspect: 1.0, symmetry: 0.9, centroidY: 0.5, ink: 700 } },
  spindly: { label: 'spindly and sprawling — long thin limbs, mostly air',
    target: { coverage: 0.16, spread: 0.34, aspect: 1.1, symmetry: 0.9, centroidY: 0.5, ink: 380 } },
  wide: { label: 'wide and low — much broader than it is tall',
    target: { aspect: 2.2, coverage: 0.35, spread: 0.27, symmetry: 0.9, centroidY: 0.5, ink: 600 } },
  tall: { label: 'tall and narrow — much taller than it is broad',
    target: { aspect: 0.5, coverage: 0.35, spread: 0.27, symmetry: 0.9, centroidY: 0.5, ink: 600 } },
  topheavy: { label: 'top-heavy — the mass carried high in the frame',
    target: { centroidY: 0.3, coverage: 0.38, spread: 0.26, aspect: 1.0, symmetry: 0.9, ink: 600 } },
};

// Per-trait scales, so no term dominates the distance purely by magnitude.
const SCALE = { ink: 400, aspect: 0.8, coverage: 0.25, centroidY: 0.25, symmetry: 0.2, spread: 0.12 };

export function briefDistance(t, brief) {
  if (!t) return Infinity;
  let s = 0, n = 0;
  for (const k of TRAITS) {
    if (brief.target[k] == null || !Number.isFinite(t[k])) continue;
    s += ((t[k] - brief.target[k]) / SCALE[k]) ** 2; n++;
  }
  return n ? Math.sqrt(s / n) : Infinity;
}

/**
 * Criteria for one step. The resulting distance is PRE-COMBINED — the sprite
 * chain cost 0.717 regret to learn that handing over several deltas to be
 * combined is the multi-step arithmetic that scored 62.5% until the caller did
 * it. The individual trait moves ride along as context, never as the sum.
 */
export function moveCriteria(moves, current, brief) {
  const cur = measure ? current : null;
  const curD = briefDistance(current, brief);
  const c = {};
  for (const m of moves) {
    if (!m.traits) continue;
    const deltas = TRAITS
      .filter((k) => brief.target[k] != null)
      .map((k) => ({ k, d: m.traits[k] - current[k] }))
      .filter((x) => Math.abs(x.d) > 1e-3)
      .sort((a, b) => Math.abs(b.d) - Math.abs(a.d)).slice(0, 3)
      .map((x) => `${x.k} ${x.d > 0 ? '+' : ''}${x.d.toFixed(2)}`);
    c[m.id] = `${m.gene} ${m.dir > 0 ? 'up' : 'down'} (${m.from} to ${m.to}). ` +
      `Measured from the redrawn sprite: ${deltas.join(', ') || 'no measurable change'}. ` +
      `Overall gap to the brief would go from ${curD.toFixed(3)} to ${briefDistance(m.traits, brief).toFixed(3)} (lower is closer).`;
  }
  return c;
}

/** The state document for one step. */
export function composeDoc(genId, t, brief, { step = 0, total = 0, history = [] } = {}) {
  const n = (x, d = 2) => (Number.isFinite(x) ? x.toFixed(d) : '—');
  const gen = GENERATORS[genId];
  const lines = [
    `BUILDING A ${gen.label.toUpperCase()} BY REPEATED SINGLE-GENE EDITS.`,
    'Every figure below is MEASURED from the sprite as actually drawn — the',
    'filled cells, their bounding box, where the mass sits. You are choosing',
    'which one edit to make next.',
    '',
    `THE BRIEF: ${brief.label}`,
    `${'trait'.padEnd(11)}${'now'.padStart(9)}${'wanted'.padStart(9)}${'gap'.padStart(9)}`,
    ...TRAITS.filter((k) => brief.target[k] != null).map((k) =>
      k.padEnd(11) + n(t[k]).padStart(9) + n(brief.target[k]).padStart(9) + n(brief.target[k] - t[k]).padStart(9)),
    '',
    `edit ${step + 1} of ${total}.`,
  ];
  if (history.length) lines.push('',
    'EDITS ALREADY MADE, oldest first:',
    ...history.slice(-8).map((h, i) => `  ${i + 1}. ${h.id}  (gap ${h.before.toFixed(3)} -> ${h.after.toFixed(3)})`));
  lines.push('',
    'INK is filled cells. ASPECT is width over height. COVERAGE is ink over the',
    'bounding box — how solid it is. CENTROIDY is 0 at the top of the box and 1 at',
    'the bottom. SYMMETRY is the left-right mirror match. SPREAD is how far the ink',
    'sits from its own centre. A positive gap means the trait needs to go UP.');
  return lines.join('\n');
}

// compose.mjs — the composition test.
//
// THE ONE HYPOTHESIS NOBODY HAS TESTED. Every measurement on this surface so
// far has been INDEPENDENT questions against one frozen state: 1024 at once,
// 549ms, all correct, no decay with width. Breadth is proven. But a CHAIN —
// where each decision changes the state the next question is asked against —
// has never been run once. That is what procgen and CAD both actually need,
// and it is what the "CAD diffusion" framing was reaching for.
//
// THE SHAPE. Jev generates nothing; it ranks options someone else enumerated.
// So the harness enumerates the legal next moves, COMPUTES what each one would
// do, and Jev picks. The quality ceiling of the loop is the enumerator, not the
// model — and that is a feature: an enumerator that only emits legal genomes
// gives a search that CANNOT produce an invalid creature. That is the claim
// the CAD section only gestured at, made testable here.
//
// WHY SPRITES AND NOT CAD. `mega/sprite/` is in this surface, on this branch,
// seed-deterministic, already has a mounted API, and is VISUAL — you can look
// at twenty outputs and tell whether composition produced coherent creatures or
// mush. CAD is on an unreachable branch with no public API. If composition
// fails here it would have failed there, for a tenth of the cost.
//
// Pure, dependency-free, identical in node and the browser.

import { DEFAULT_GENES, FAMILIES } from '../../sprite/quad/quad.js';

/** The genes the loop may move, and the bounds the generator itself enforces. */
export const MOVABLE = ['body', 'depth', 'leg', 'neck', 'head', 'snout', 'tail', 'ear', 'stance', 'stride'];
export const BOUNDS = { lo: 0.3, hi: 2.0, stanceLo: 0, stanceHi: 1 };
export const STEP = 0.15;

const clampGene = (k, v) => (k === 'stance' || k === 'chassis'
  ? Math.max(BOUNDS.stanceLo, Math.min(BOUNDS.stanceHi, v))
  : Math.max(BOUNDS.lo, Math.min(BOUNDS.hi, v)));

/**
 * Properties of a genome, computed.
 *
 * Every one is arithmetic the caller does so the judgement does not have to —
 * the 62.5%-versus-100% finding, applied to geometry. Jev is never asked to
 * multiply a gene by a scale factor; it is handed the resulting proportion.
 */
export function traits(genes) {
  const g = { ...DEFAULT_GENES, ...genes };
  const legLen = g.leg * 0.46, bodyLen = g.body * 0.36, trunkR = g.depth * 0.16;
  return {
    // How leggy: a greyhound is high, a badger is low.
    legToBody: legLen / bodyLen,
    // Mass proxy: a long thick trunk is a heavy animal.
    bulk: trunkR * bodyLen * 100,
    // Head against trunk — a big head on a thin body reads as a juvenile or a predator.
    headToTrunk: (g.head * 0.16) / trunkR,
    // How far it can reach without moving its feet.
    reach: g.neck * 0.30 + g.head * 0.16,
    // Gait amplitude relative to leg length: long strides on short legs do not read.
    strideToLeg: g.stride / Math.max(0.3, g.leg),
    // Front-heaviness: snout and ears against the trunk.
    frontLoad: (g.snout + g.ear) / (2 * g.depth),
  };
}

export const TRAIT_KEYS = ['legToBody', 'bulk', 'headToTrunk', 'reach', 'strideToLeg', 'frontLoad'];

/**
 * The briefs. Each is a TARGET in trait space, so "did the chain get there" is
 * a distance and not a matter of taste.
 *
 * This is the whole reason sprites can carry a rigorous experiment: "is this
 * creature good" is taste and unmeasurable, but "did a chain of typed picks
 * converge on a specified proportion" is arithmetic.
 */
export const BRIEFS = {
  sprinter: { label: 'a fast, lightly-built runner',
    target: { legToBody: 2.2, bulk: 3.5, headToTrunk: 0.8, reach: 0.45, strideToLeg: 1.1, frontLoad: 0.9 } },
  brute: { label: 'a heavy, low-slung brute',
    target: { legToBody: 0.9, bulk: 9.5, headToTrunk: 1.2, reach: 0.35, strideToLeg: 0.7, frontLoad: 0.7 } },
  grazer: { label: 'a long-necked grazer',
    target: { legToBody: 1.6, bulk: 6.5, headToTrunk: 0.7, reach: 0.85, strideToLeg: 0.8, frontLoad: 1.1 } },
  scout: { label: 'a small, alert, big-eared scout',
    target: { legToBody: 1.8, bulk: 2.5, headToTrunk: 1.5, reach: 0.55, strideToLeg: 1.2, frontLoad: 1.8 } },
};

/**
 * Distance from a brief, normalised per trait so no single one dominates
 * simply by having a larger numeric range.
 */
export function briefDistance(genes, brief) {
  const t = traits(genes);
  const scale = { legToBody: 1.5, bulk: 6, headToTrunk: 0.8, reach: 0.5, strideToLeg: 0.6, frontLoad: 1 };
  let s = 0;
  for (const k of TRAIT_KEYS) s += ((t[k] - brief.target[k]) / scale[k]) ** 2;
  return Math.sqrt(s / TRAIT_KEYS.length);
}

/**
 * Enumerate the legal next moves.
 *
 * THE SAFETY PROPERTY LIVES HERE. Every candidate is a clamped, buildable
 * genome, so no round of the loop can produce an invalid creature whatever the
 * model answers — including if it answers nonsense. A move that would leave a
 * gene at its bound is dropped rather than offered, because a choice with an
 * option that does nothing is a forced move dressed up as a decision.
 */
export function legalMoves(genes, { step = STEP, movable = MOVABLE } = {}) {
  const out = [];
  for (const k of movable) {
    for (const dir of [+1, -1]) {
      const cur = (genes[k] ?? DEFAULT_GENES[k]);
      const next = clampGene(k, cur + dir * step);
      if (Math.abs(next - cur) < 1e-9) continue;      // at the bound: not a move
      out.push({ id: `${k}_${dir > 0 ? 'up' : 'down'}`, gene: k, dir,
        from: Number(cur.toFixed(3)), to: Number(next.toFixed(3)),
        genes: { ...genes, [k]: next } });
    }
  }
  return out;
}

/**
 * The criteria for one step: each option labelled with what it would DO to the
 * traits, not with which gene it touches. A gene name is an implementation
 * detail; the proportion it produces is the thing being judged.
 */
export function moveCriteria(moves, current, brief, { computed = true } = {}) {
  const cur = traits(current);
  const curGap = briefDistance(current, brief);
  const c = {};
  for (const m of moves) {
    const t = traits(m.genes);
    const deltas = TRAIT_KEYS
      .map((k) => ({ k, d: t[k] - cur[k] }))
      .filter((x) => Math.abs(x.d) > 1e-4)
      .sort((a, b) => Math.abs(b.d) - Math.abs(a.d))
      .slice(0, 3)
      .map((x) => `${x.k} ${x.d > 0 ? '+' : ''}${x.d.toFixed(2)}`);
    const head = `${m.gene} ${m.dir > 0 ? 'up' : 'down'} (${m.from} to ${m.to}). ` +
      `Resulting change: ${deltas.join(', ') || 'no measurable change'}.`;
    // THE FIX, and it is the surface's most-repeated lesson arriving at the
    // composition layer. The `computed: false` form hands over SIX trait deltas
    // per option and leaves the model to combine them into one judgement —
    // which is multi-step arithmetic, the thing that scored 62.5% until the
    // caller did it. The default hands over the single resulting gap, already
    // combined, in the direction the question will be read.
    c[m.id] = computed
      ? `${head} Overall gap to the brief would go from ${curGap.toFixed(3)} to ` +
        `${briefDistance(m.genes, brief).toFixed(3)} (lower is closer).`
      : head;
  }
  return c;
}

/** The state document for one step of the chain. */
export function composeDoc(genes, moves, brief, { step = 0, total = 0, history = [] } = {}) {
  const n = (x, d = 2) => (Number.isFinite(x) ? x.toFixed(d) : '—');
  const t = traits(genes);
  const lines = [
    'BUILDING A QUADRUPED BY REPEATED SMALL EDITS. Every figure is already',
    'computed from the genome; you are choosing which single edit to make next.',
    '',
    `THE BRIEF: ${brief.label}`,
    `${'trait'.padEnd(14)}${'now'.padStart(8)}${'wanted'.padStart(9)}${'gap'.padStart(9)}`,
    ...TRAIT_KEYS.map((k) =>
      k.padEnd(14) + n(t[k]).padStart(8) + n(brief.target[k]).padStart(9) +
      n(brief.target[k] - t[k]).padStart(9)),
    '',
    `edit ${step + 1} of ${total}.`,
  ];
  // The chain's own history — the dungeon needed exactly this, for exactly the
  // same reason: without it every step is decided as if it were the first.
  if (history.length) lines.push('',
    'EDITS ALREADY MADE, oldest first:',
    ...history.slice(-8).map((h, i) => `  ${i + 1}. ${h.id}  (gap then ${n(h.before)} -> now ${n(h.after)})`));
  lines.push('',
    'A positive gap means the trait needs to go UP to meet the brief; negative means DOWN.',
    'Each option below states what it would do to the traits it moves most.');
  return lines.join('\n');
}

/**
 * Run one chain. `pick` chooses among the legal moves and may be async — the
 * model, a random control, or the greedy rule.
 *
 * Returns every step, so the CHAIN is the unit of analysis rather than the
 * final artifact. Whether it converged matters less than whether it converged
 * monotonically, and only the trace shows that.
 */
export async function runChain({ genes, brief, steps = 12, pick, step = STEP, movable = MOVABLE }) {
  let cur = { ...genes };
  const history = [];
  const trace = [{ step: -1, genes: { ...cur }, distance: briefDistance(cur, brief) }];
  for (let i = 0; i < steps; i++) {
    const moves = legalMoves(cur, { step, movable });
    if (!moves.length) break;
    const before = briefDistance(cur, brief);
    const chosen = await pick({ moves, genes: cur, brief, step: i, total: steps, history });
    const m = moves.find((x) => x.id === chosen?.id) || null;
    if (!m) { trace.push({ step: i, refused: true, genes: { ...cur }, distance: before }); continue; }
    cur = m.genes;
    const after = briefDistance(cur, brief);
    history.push({ id: m.id, before, after });
    trace.push({ step: i, id: m.id, gene: m.gene, dir: m.dir, genes: { ...cur },
      distance: after, improved: after < before,
      confidence: chosen.confidence ?? null, have: chosen.have ?? null,
      // The BEST available move at this step, computed — so "did it pick well"
      // is answerable without waiting to see where the chain ends up.
      bestAvailable: Math.min(...moves.map((x) => briefDistance(x.genes, brief))),
      worstAvailable: Math.max(...moves.map((x) => briefDistance(x.genes, brief))),
      options: moves.length });
  }
  return { genes: cur, trace, history,
    start: trace[0].distance, end: briefDistance(cur, brief) };
}

/** The greedy control: always take the move that most reduces the distance. */
export const greedyPick = ({ moves, brief }) => {
  let best = moves[0], bd = Infinity;
  for (const m of moves) { const d = briefDistance(m.genes, brief); if (d < bd) { bd = d; best = m; } }
  return { id: best.id };
};

/** The random control, seeded so a run is repeatable. */
export function randomPick(seed = 1) {
  let a = seed >>> 0;
  return ({ moves }) => {
    a = (a + 0x6D2B79F5) | 0;
    let x = Math.imul(a ^ (a >>> 15), 1 | a);
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
    return { id: moves[((x ^ (x >>> 14)) >>> 0) % moves.length].id };
  };
}

/**
 * How the chain behaved, which is the actual result.
 *
 * `regret` is the one that matters: at each step, how much worse was the pick
 * than the best move available THEN. A chain can reach a good place by luck
 * after bad steps, and a chain can pick well and still be beaten by its
 * starting point — only per-step regret separates those.
 */
export function chainStats(run) {
  const steps = run.trace.filter((t) => t.step >= 0 && !t.refused);
  if (!steps.length) return null;
  const improved = steps.filter((s) => s.improved).length;
  const regrets = steps.map((s, i) => {
    const prev = i === 0 ? run.start : steps[i - 1].distance;
    const bestGain = prev - s.bestAvailable;
    const gotGain = prev - s.distance;
    return bestGain > 1e-9 ? Math.max(0, (bestGain - gotGain) / bestGain) : 0;
  });
  return {
    steps: steps.length,
    refused: run.trace.filter((t) => t.refused).length,
    start: run.start, end: run.end,
    improvedPct: 100 * improved / steps.length,
    // Monotone means every single edit moved it closer. That is the property a
    // coherent chain has and a lucky one does not.
    monotone: improved === steps.length,
    meanRegret: regrets.reduce((a, b) => a + b, 0) / regrets.length,
    // Did it ever pick the WORST move on offer? One of those says more than a
    // good average.
    tookWorst: steps.filter((s) => Math.abs(s.distance - s.worstAvailable) < 1e-9).length,
    meanConfidence: steps.reduce((a, s) => a + (s.confidence ?? 0), 0) / steps.length,
    meanHave: steps.reduce((a, s) => a + (s.have ?? 0), 0) / steps.length,
  };
}

export { FAMILIES, DEFAULT_GENES };

// bridge.js — the arc between two pictures, and the reason this stopped being
// a tree.
//
// WHAT A CYCLE IS HERE
// --------------------
// The web grows by mutation, so any two tiles meet only at their common
// ancestor: to get from one to the other you walk back up and down again, and
// everything you pass through on the way is somebody else's idea. A bridge is
// the *direct* route — a chain of intermediate stacks that starts at one
// picture and ends at the other, changing a little at each step.
//
// Drawing it closes a loop in the graph. Two branches that diverged at the root
// now have an edge between their tips, and the thing on screen is no longer a
// tree. That is the point: the interesting pictures are very often *between*
// two you already like, and a tree has no way to say "between".
//
// A BRIDGE IS NOT A NODE, AND IS NOT MUTATED
// ------------------------------------------
// Every stack on the arc is a blend of the two ends, not a draw from the
// grammar. So a bridge is reproducible from its two endpoints alone — the
// address is `?p=<from>&to=<end>` and the k-th step is `&i=k` — and it needs no
// place in the tree, no fan of its own, and none of the re-roll machinery.
// Neighbouring steps being nearly identical is the whole idea rather than a
// dead branch.
//
// HOW TWO STACKS ARE BLENDED
// --------------------------
// Effects are matched by id, in order: the first `filter:blur` in A pairs with
// the first `filter:blur` in B and its parameters are tweened.
//
// ⚠️ **THE TWO SIDES OVERLAP THE WHOLE WAY. THE ARC NEVER PASSES THROUGH THE
// UNTOUCHED PICTURE.**
//
// The first version faded A out over the first half and B in over the second,
// which sounds right and is wrong: at exactly halfway BOTH are at zero, the
// stack is empty, and the middle tile of every arc was the original photograph.
// A bridge that goes back through the seed on its way between two treatments is
// not a bridge, it is two separate ramps that happen to touch.
//
// So an entry only one side has is present for the whole crossing, weighted:
// A's strength runs 1 → 0 across the arc and B's runs 0 → 1, which at the third
// of five steps is two thirds of one and a third of the other, both at once.
// Ordering is fixed for the whole arc (see `pairStacks`) so there is no reorder
// to jump through either.

import { EFFECTS } from '../../shop/js/core/registry.js';

/** How many pictures an arc is made of, ends excluded. */
export const BRIDGE_STEPS = 5;

const lerp = (a, b, t) => a + (b - a) * t;

const hex = (c) => {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(c || ''));
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

/** Colours blend; everything else that is not a number switches at halfway. */
function blendParam(a, b, t, spec) {
  if (typeof a === 'number' && typeof b === 'number') {
    const v = lerp(a, b, t);
    if (!spec) return v;
    const step = spec.step || 0.001;
    return Math.min(spec.max ?? Infinity, Math.max(spec.min ?? -Infinity,
      +(Math.round(v / step) * step).toFixed(6)));
  }
  if (spec?.type === 'color') {
    const ca = hex(a); const cb = hex(b);
    if (ca && cb) {
      const c = ca.map((v, i) => Math.round(lerp(v, cb[i], t)));
      return `#${c.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
    }
  }
  return t < 0.5 ? a : b;
}

function blendField(a, b, t) {
  if (!a) return b;
  if (!b) return a;
  // Two different field TYPES cannot be mixed — brightness is not a partial
  // radial — so this is the one place a step differs from its neighbour by more
  // than a nudge. It is at halfway, where an arc is least about either end.
  if (a.type !== b.type) return t < 0.5 ? a : b;
  const params = {};
  for (const k of new Set([...Object.keys(a.params || {}), ...Object.keys(b.params || {})])) {
    const av = a.params?.[k]; const bv = b.params?.[k];
    params[k] = (typeof av === 'number' && typeof bv === 'number') ? lerp(av, bv, t) : (t < 0.5 ? av : bv);
  }
  return { ...b, params, invert: t < 0.5 ? a.invert : b.invert };
}

/**
 * Line up two stacks: which entry of A corresponds to which entry of B.
 *
 * By effect id, first-come-first-served, so two blurs in A meet two blurs in B
 * in the order they appear. Anything left over on either side is a fade.
 *
 * @returns {Array<{a: object|null, b: object|null}>} in the order B ends in,
 *   with A-only entries kept where they sat.
 */
export function pairStacks(a = [], b = []) {
  const takenB = new Set();
  const paired = [];
  for (const ea of a) {
    const j = b.findIndex((eb, k) => !takenB.has(k) && eb.fx === ea.fx);
    if (j >= 0) { takenB.add(j); paired.push({ a: ea, b: b[j], order: j }); }
    else paired.push({ a: ea, b: null, order: paired.length - a.length });
  }
  b.forEach((eb, k) => { if (!takenB.has(k)) paired.push({ a: null, b: eb, order: k }); });
  return paired.sort((p, q) => p.order - q.order);
}

/**
 * The stack partway from `a` to `b`.
 *
 * `t` is 0 at A and 1 at B, and both ends are exact — an arc whose first tile
 * is not the picture you picked is a lie about what it connects.
 *
 * A fading entry is dropped once its strength reaches zero rather than left at
 * `amount: 0`, because shop's stack panel would show a row that does nothing
 * and the recipe you open would carry it.
 */
export function blendStack(a = [], b = [], t) {
  if (t <= 0) return a.map((e) => ({ ...e }));
  if (t >= 1) return b.map((e) => ({ ...e }));
  const out = [];
  for (const { a: ea, b: eb } of pairStacks(a, b)) {
    if (ea && eb) {
      const specs = EFFECTS[ea.fx]?.params || {};
      const params = {};
      for (const k of new Set([...Object.keys(ea.params || {}), ...Object.keys(eb.params || {})])) {
        params[k] = blendParam(ea.params?.[k], eb.params?.[k], t, specs[k]);
      }
      out.push({
        ...eb,
        params,
        amount: lerp(ea.amount ?? 1, eb.amount ?? 1, t),
        // ONE seed for the whole arc, not a switch at halfway. A seed cannot be
        // interpolated, so wherever it changes there is a jump — and the ends
        // are exact copies returned before any of this runs, so putting the
        // jump outside the arc means the arc itself has none.
        seed: ea.seed,
        field: blendField(ea.field, eb.field, t),
      });
    } else if (ea) {
      // only in A: still here, at (1 - t) of its strength, all the way across
      if (1 - t > 0.02) out.push({ ...ea, amount: (ea.amount ?? 1) * (1 - t) });
    } else if (eb) {
      // only in B: already here, at t of its strength, from the first step
      if (t > 0.02) out.push({ ...eb, amount: (eb.amount ?? 1) * t });
    }
  }
  return out;
}

/**
 * The whole arc: `steps` pictures strictly between the two ends.
 *
 * The ends are excluded because they are already on screen — a bridge that
 * redrew both of them would put two copies of each tile in the web and make
 * "which one did I click" unanswerable.
 */
export function bridgePath(a, b, steps = BRIDGE_STEPS) {
  const n = Math.max(1, steps | 0);
  const out = [];
  for (let k = 1; k <= n; k++) out.push({ t: k / (n + 1), stack: blendStack(a, b, k / (n + 1)) });
  return out;
}

/** What changes along the arc, in words, for the rail to show. */
export function describeBridge(a = [], b = []) {
  const pairs = pairStacks(a, b);
  const label = (e) => EFFECTS[e.fx]?.label || e.fx;
  const out = [];
  for (const { a: ea, b: eb } of pairs) {
    if (ea && eb) out.push(`${label(ea)} shifts`);
    else if (ea) out.push(`${label(ea)} fades out`);
    else if (eb) out.push(`${label(eb)} fades in`);
  }
  return out;
}

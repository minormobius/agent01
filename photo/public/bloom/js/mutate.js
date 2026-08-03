// mutate.js — the grammar of "one small change to this picture".
//
// /bloom grows a web of variations from one seed image. This file is the whole
// generative half of it, and it is pure: no canvas, no DOM, no network. Given a
// root key and a path through the tree it returns a shop stack, and it returns
// the *same* stack every time.
//
// THE ADDRESS IS THE PATH, AND NOTHING IS STORED
// ----------------------------------------------
// A node is not a record. It is a path — `3.0.7` means "the fourth child, then
// its first, then its eighth" — and its stack is a fold from the root, each
// step seeded by the path so far. So the tree is a pure function of one string,
// a node has a permanent address, and a shared link reproduces the whole web
// bit for bit on someone else's machine with nothing on a server. Same move as
// `b/lathe`'s `/lathe/t/<seed>`, and the same RNG (xmur3 + mulberry32) so the
// two feel like one idea.
//
// THE THING THAT MAKES A GENERATOR HERE DIFFERENT
// ----------------------------------------------
// **Seventeen of shop's fifty-seven effects are documented no-ops at their
// defaults.** That is shop's own contract — an effect declared `neutral` must
// be the exact identity when freshly added, or a stack would stop being
// editable. Excellent for an editor, fatal for a generator: adding one with its
// defaults produces a child pixel-identical to its parent, and a third of every
// fan would be dead branches that cost a render each to discover.
//
// So `add` never uses `defaults()` alone — it pushes the effect *off* its
// neutral point, hard enough to see. The registry already knows which ones need
// it; this reads the flag rather than keeping a list.
//
// WHERE IS AS IMPORTANT AS WHAT
// -----------------------------
// Shop's organising idea is that every effect carries a *field* deciding where
// it applies — brightness, edges, bands, radial, noise — and outside it the
// source survives byte for byte. A generator that only ever varied *what* would
// explore a fraction of the space, and the boring fraction. `aim` is a
// first-class mutation for that reason: same effect, different territory.

import { EFFECTS, GROUPS, defaults, makeEffect } from '../../shop/js/core/registry.js';
import { FIELDS } from '../../glitch/js/glitch.js';

// ───────────────────────────────────────────────────────────────── rng ──

/** String → 32-bit seed. Same pair `b/lathe` uses, deliberately. */
export function xmur3(str) {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return (h ^= h >>> 16) >>> 0;
  };
}

/** Seed → a uniform [0,1) generator. */
export function mulberry32(a) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The one way a key becomes randomness here. */
export const rngFor = (key) => mulberry32(xmur3(String(key))());

const pick = (rng, list) => list[Math.floor(rng() * list.length) % list.length];

// ────────────────────────────────────────────────────────────── params ──

const QUANTISE = (v, spec) => {
  const step = spec.step || 0.001;
  const q = Math.round(v / step) * step;
  return Math.min(spec.max, Math.max(spec.min, +q.toFixed(6)));
};

/**
 * A fresh value for one parameter, from shop's own schema.
 *
 * `strength` in 0..1 says how far from `current` to go: a small nudge explores
 * around something you already liked, a large one is a fresh draw. Both matter
 * — the web is useless if every child is a stranger, and useless if every child
 * is a twin.
 */
export function sampleParam(spec, rng, current, strength = 1) {
  if (!spec) return current;
  if (spec.type === 'enum') {
    const options = spec.options || [];
    if (!options.length) return current;
    if (strength < 0.5 && options.length > 1) {
      // a nudge on an enum still has to move, or the mutation is a no-op
      const others = options.filter((o) => o !== current);
      return others.length ? pick(rng, others) : options[0];
    }
    return pick(rng, options);
  }
  if (spec.type === 'bool') return strength < 0.5 ? !current : rng() < 0.5;
  if (spec.type === 'color') {
    const hex = Math.floor(rng() * 0x1000000).toString(16).padStart(6, '0');
    return `#${hex}`;
  }
  // A curve is a list of control points; leave its shape alone and let `tune`
  // reach it only through the effects that expose scalars beside it.
  if (spec.type === 'curve' || Array.isArray(spec.def)) return current;

  const lo = spec.min ?? 0;
  const hi = spec.max ?? 1;
  if (strength >= 1) return QUANTISE(lo + rng() * (hi - lo), { ...spec, min: lo, max: hi });
  const span = (hi - lo) * 0.35 * strength;
  const base = typeof current === 'number' ? current : (spec.def ?? lo);
  return QUANTISE(base + (rng() * 2 - 1) * span, { ...spec, min: lo, max: hi });
}

/**
 * Push an effect somewhere visible.
 *
 * Every scalar gets a fresh draw. A `neutral` effect gets more than that: its
 * defaults ARE the identity, so a timid sample leaves a child indistinguishable
 * from its parent. `bias` drags neutral effects toward the far end of each
 * range so the fan is made of things you can actually tell apart.
 */
export function energise(id, rng, { bias = 0 } = {}) {
  const spec = EFFECTS[id];
  const P = defaults(id);
  if (!spec) return P;
  for (const [key, pspec] of Object.entries(spec.params || {})) {
    let v = sampleParam(pspec, rng, P[key], 1);
    if (bias > 0 && typeof v === 'number' && pspec.min !== undefined && pspec.max !== undefined) {
      const far = rng() < 0.5 ? pspec.min : pspec.max;
      v = QUANTISE(v + (far - v) * bias, pspec);
    }
    P[key] = v;
  }
  return repairRanges(P);
}

/**
 * Parameters that are a RANGE, not two numbers.
 *
 * Sampling `lo` and `hi` independently produces `lo > hi` a quarter of the time,
 * and an inverted range is an empty selection: `glitch:sort` with lo 0.69 / hi
 * 0.60 sorts nothing at all and the child is pixel-identical to its parent. A
 * dead branch is the worst thing this web can contain — you click a picture
 * because it looks different and it is not — so the pairs get ordered after
 * every draw. Found by rendering, not by reading: three pairs across 57
 * effects, all of them here.
 */
export const RANGE_PAIRS = [['lo', 'hi'], ['inLo', 'inHi'], ['outLo', 'outHi']];

/** Order every range pair in place, and return the params. */
export function repairRanges(params) {
  for (const [a, b] of RANGE_PAIRS) {
    if (typeof params[a] === 'number' && typeof params[b] === 'number' && params[a] > params[b]) {
      const t = params[a]; params[a] = params[b]; params[b] = t;
    }
  }
  return params;
}

// ─────────────────────────────────────────────────────────────── fields ──

const FIELD_TYPES = Object.keys(FIELDS).filter((t) => t !== 'paint');

/** A field: where the effect is allowed to touch. Never `paint` — that one
 *  needs a mask somebody drew, and nobody drew one out here. */
export function sampleField(rng, current) {
  const type = pick(rng, current ? FIELD_TYPES.filter((t) => t !== current.type) : FIELD_TYPES);
  const params = {};
  for (const [k, d] of Object.entries(FIELDS[type]?.params || {})) {
    params[k] = sampleParam(d, rng, d.def, 1);
  }
  return { type, params, invert: rng() < 0.3, paintMul: false };
}

// ───────────────────────────────────────────────────────────── the grammar ──

/**
 * The moves. Weights are a function of how long the stack already is: an empty
 * stack can only grow, and a long one should be refined and pruned rather than
 * piled higher — six effects deep, another `add` mostly buries what came before.
 */
export function weights(depth) {
  if (depth === 0) return { add: 1 };
  // Near the root the job is BREADTH: the first ring should be six obviously
  // different directions, not six shades of one. Deeper in, the job flips to
  // refinement, because by then you are there on purpose.
  if (depth <= 2) return { add: 7, tune: 2, aim: 3, drop: 0, reorder: 1 };
  if (depth <= 4) return { add: 4, tune: 4, aim: 3, drop: 1, reorder: 1 };
  if (depth <= 7) return { add: 2, tune: 5, aim: 3, drop: 2, reorder: 1 };
  return { add: 0, tune: 5, aim: 3, drop: 3, reorder: 1 };
}

function choose(rng, w) {
  const entries = Object.entries(w).filter(([, n]) => n > 0);
  const total = entries.reduce((n, [, v]) => n + v, 0);
  let r = rng() * total;
  for (const [k, v] of entries) { if ((r -= v) < 0) return k; }
  return entries[0][0];
}

/**
 * One mutation. Returns a NEW stack — the caller's is never touched, because
 * the same parent stack is folded once per child and a shared mutation would
 * make siblings depend on the order they were drawn.
 */
export function mutate(stack, rng, { ids = Object.keys(EFFECTS), bias = null } = {}) {
  const next = stack.map((e) => ({ ...e, params: { ...e.params }, field: { ...e.field } }));
  // A move that provably cannot change the picture must never be offered:
  // reordering one effect is the identity, and so is dropping the only one on a
  // stack you are still trying to grow. Both were reachable from depth 3, which
  // is why half the nodes down there rendered identical to their parent —
  // measured, not guessed.
  const w = { ...weights(next.length) };
  if (next.length < 2) { w.reorder = 0; w.drop = 0; }
  const move = choose(rng, w);

  if (move === 'add' || !next.length) {
    // A steered fan draws its new effects from one family. Total, not weighted:
    // "show me warps" that returns four warps and two colour grades is a
    // suggestion, and the point of a steer is that it is an instruction.
    const pool = bias ? (ids.filter((id) => EFFECTS[id]?.group === bias) || ids) : ids;
    const id = pick(rng, pool.length ? pool : ids);
    const entry = makeEffect(id);
    entry.params = energise(id, rng, { bias: EFFECTS[id]?.neutral ? 0.55 : 0.15 });
    entry.amount = QUANTISE(0.4 + rng() * 0.6, { min: 0.05, max: 1, step: 0.01 });
    entry.seed = Math.floor(rng() * 1e6);
    if (rng() < 0.45) entry.field = sampleField(rng, null);
    next.splice(Math.floor(rng() * (next.length + 1)), 0, entry);
    return { stack: next, move, id };
  }

  const i = Math.floor(rng() * next.length);
  const entry = next[i];

  if (move === 'tune') {
    const keys = Object.keys(EFFECTS[entry.fx]?.params || {});
    if (keys.length && rng() < 0.75) {
      const key = pick(rng, keys);
      entry.params[key] = sampleParam(EFFECTS[entry.fx].params[key], rng, entry.params[key], 0.55);
      repairRanges(entry.params);
    } else {
      // A nudge that lands back where it started is a wasted render, so push
      // the strength somewhere it is not.
      const away = entry.amount > 0.5 ? -1 : 1;
      entry.amount = QUANTISE(entry.amount + away * (0.25 + rng() * 0.4), { min: 0.05, max: 1, step: 0.01 });
    }
    return { stack: next, move, id: entry.fx };
  }

  if (move === 'aim') {
    entry.field = sampleField(rng, entry.field);
    return { stack: next, move, id: entry.fx };
  }

  if (move === 'drop') {
    const [gone] = next.splice(i, 1);
    return { stack: next, move, id: gone.fx };
  }

  // reorder — the same effects in a different order are a different picture,
  // which is the whole reason the stack is ordered. The destination must not be
  // where it already is: drawing `to` uniformly made a two-effect stack reorder
  // into itself half the time, and a node that is its parent exactly is the one
  // thing this web must not contain.
  const spots = [];
  for (let k = 0; k < next.length; k++) if (k !== i) spots.push(k);
  const to = pick(rng, spots);
  const [moved] = next.splice(i, 1);
  next.splice(to, 0, moved);
  return { stack: next, move, id: moved.fx };
}

// ─────────────────────────────────────────────────────────────── the tree ──
//
// A path element is a child index, optionally with a FAN VARIANT: `3~1` means
// "child 3, drawn from the second fan its parent produced". That is how reroll
// works, and why it is spelled into the address rather than kept in a variable:
// the whole design rests on `?p=` reproducing a node bit for bit on somebody
// else's machine, and a reroll that lived only in memory would quietly break
// that for exactly the branches you liked enough to reroll into.
//
// The variant belongs to the ELEMENT, meaning "which drawing of my parent's fan
// I came from". So rerolling a node changes its children's addresses and leaves
// the node itself — and everything above it — untouched.

/**
 * `[{i,v,g}]` → `2.3~1_warp.4`. The canonical text form; the key is built from
 * it, so two fans drawn differently can never collide.
 *
 *   `3`            child 3
 *   `3~1`          …of the second drawing of its parent's fan (reroll)
 *   `3_warp`       …of a fan steered toward the warp family
 *   `3~1_warp`     both
 *
 * `~` and `_` are unreserved in RFC 3986, so an address survives a round trip
 * through the query string without being percent-mangled into something a
 * person cannot read back to you over a phone.
 */
export const pathText = (path) => path
  .map((e) => `${e.i}${e.v ? `~${e.v}` : ''}${e.g ? `_${e.g}` : ''}`)
  .join('.');

/** The families a fan can be steered toward — shop's own groups. */
export const STEERS = GROUPS.map((g) => g.id);

/** A node's key: the root string plus the path taken to reach it. */
export const keyFor = (root, path) => `${root}/${pathText(path)}`;

/**
 * The same node, re-rolled.
 *
 * Ordering the range pairs killed the dead branches that sampling could know
 * about. It cannot know the rest: `filter:bloom` with its threshold at 0.9 does
 * nothing to a picture whose brightest pixel is 0.78, and whether that is true
 * depends on the image, not the parameters. Measured on a synthetic test
 * picture, about one first-ring child in seventeen still renders identical to
 * its parent.
 *
 * So the renderer gets to reject: it has both bitmaps, comparing them is nearly
 * free next to producing them, and a node that came out identical is re-rolled
 * with a salted key. The salt is NOT part of the address — it is re-derived
 * from the same image every time, so `?p=3.0.7` still reproduces exactly for
 * anyone holding the same seed picture, which is the property the whole design
 * rests on.
 */
export const saltedKey = (key, attempt) => (attempt ? `${key}~${attempt}` : key);

/**
 * Parse `3.0~2.7` (and the empty string, which is the root).
 *
 * Anything malformed is dropped rather than trusted — this comes off the
 * address bar, and a NaN index would fold a stack nobody can reproduce.
 */
export function parsePath(text) {
  const raw = String(text || '').trim();
  if (!raw) return [];
  return raw.split('.').map((part) => {
    const [head, steer] = part.split('_');
    const [a, b] = head.split('~');
    const i = parseInt(a, 10);
    const v = b === undefined ? 0 : parseInt(b, 10);
    if (!Number.isFinite(i) || i < 0) return null;
    const e = { i, v: Number.isFinite(v) && v > 0 ? v : 0 };
    // An unknown steer is dropped rather than trusted: it comes off the address
    // bar, and a fan biased toward a family that does not exist would draw from
    // an empty pool.
    if (steer && STEERS.includes(steer)) e.g = steer;
    return e;
  }).filter(Boolean);
}

/**
 * The stack at a node — folded from the root, one mutation per step.
 *
 * Every intermediate stack is returned too: the lineage is what the UI shows
 * when you ask "what happened to get here", and recomputing it is free next to
 * rendering it.
 */
export function lineage(root, path, ctx = {}) {
  const steps = [];
  const salts = ctx.salts || {};
  let stack = [];
  for (let d = 0; d < path.length; d++) {
    const here = path.slice(0, d + 1);
    const key = saltedKey(keyFor(root, here), salts[pathText(here)] || 0);
    // The steer belongs to the element — "which drawing of my parent's fan I
    // came from, and what it was aimed at" — so it is read off `here`, not off
    // some ambient setting that a shared link could not carry.
    const out = mutate(stack, rngFor(key), { ...ctx, bias: path[d].g || null });
    stack = out.stack;
    steps.push({ depth: d + 1, key, move: out.move, id: out.id, stack });
  }
  return steps;
}

/** Just the stack. */
export function stackAt(root, path, ctx = {}) {
  const steps = lineage(root, path, ctx);
  return steps.length ? steps[steps.length - 1].stack : [];
}

/** What a step did, in words, for the lineage rail. */
export function describeStep(step) {
  const label = EFFECTS[step.id]?.label || step.id;
  return {
    add: `added ${label}`,
    tune: `tuned ${label}`,
    aim: `re-aimed ${label}`,
    drop: `dropped ${label}`,
    reorder: `moved ${label}`,
  }[step.move] || step.move;
}

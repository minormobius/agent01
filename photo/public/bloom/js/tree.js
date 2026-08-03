// tree.js — the shape of the web on screen. Pure geometry and bookkeeping.
//
// A node is a path (`js/mutate.js` explains why), so the tree here holds no
// stacks and no pixels — only where each node sits and whether it has been
// opened. Everything else is derived.
//
// THE LAYOUT IS A FAN, NOT A GRID
// -------------------------------
// Children spread on an arc *centred on the direction their parent came from*,
// so a lineage reads outward as one gesture and siblings sit side by side. A
// grid would pack more per screen and lose exactly the thing worth seeing: that
// this picture came from that one.
//
// ONE OPEN BRANCH, AND WHY
// ------------------------
// A radial tree where every fan stays open cannot be made to fit. Give each
// node an angular wedge of its parent's and the wedge shrinks by `FANOUT` per
// level, so the radius has to grow like 6^d to keep tiles apart — unusable past
// depth two. Narrow the arc instead and siblings overlap; widen it and cousins
// do. The first version did the second and the third ring was a pile.
//
// So opening a node **folds away every fan that is not on the way to it**. Its
// ancestors' siblings stay on screen as tiles — the landscape is still there to
// judge — but only the branch you are actually in is spread out. With no
// cousins the geometry becomes local and provable: one ring per depth, and a
// radius chosen so the chord between adjacent siblings is wider than a tile.
//
// That is also how the thing is used. "Wander until something stops you" is a
// walk down one path, not a survey of all of them at once.

import { pathText } from './mutate.js';

export const FANOUT = 6;              // children per expansion
export const RING = 190;              // px between the root and its children
export const SPREAD = Math.PI * 1.7;  // arc the first ring occupies
export const TILE = 132;              // px a tile occupies on screen at zoom 1

/**
 * The arc every ring after the first occupies — 140°, and the number is
 * measured rather than chosen.
 *
 * Folding the other branches leaves one collision the local rule cannot see: a
 * wide fan bends back on itself, so the outermost child of a deep node lands on
 * a *sibling several rings in*. Sweeping the value against a four-deep chain,
 * everything up to ~145° keeps the nearest pair at the sibling chord (147px, set
 * by `ringFor`) and 189° collapses it to 76px — tiles on top of each other.
 * 140° holds the margin and keeps the whole web to about 1150px across, which
 * is what makes it still legible when it is fitted to a laptop.
 */
export const DEEP_SPREAD = Math.PI * (140 / 180);

/** The arc a node's children get. Wide at the root, where the job is breadth. */
export const spreadFor = (depth) => (depth === 0 ? SPREAD : DEEP_SPREAD);

/**
 * How far out to place them.
 *
 * The chord between adjacent siblings is `radius × (spread / (fanout - 1))`, so
 * this inverts that: whatever arc the ring is given, push it out far enough that
 * two neighbours cannot touch. Overlapping tiles are not a cosmetic problem here
 * — you cannot click the one you meant.
 */
export const ringFor = (depth, fanout = FANOUT) =>
  Math.max(RING, (TILE * 1.12 * Math.max(1, fanout - 1)) / spreadFor(depth));

// One spelling of a path, shared with mutate.js — the tree keys its nodes by
// exactly the string the address bar carries and the RNG is seeded from.
const key = pathText;

/** A fresh tree: just the root, opened. */
export function createTree() {
  return {
    nodes: new Map([['', { path: [], parent: null, x: 0, y: 0, angle: -Math.PI / 2, open: false }]]),
  };
}

export const nodeAt = (tree, path) => tree.nodes.get(key(path)) || null;
export const allNodes = (tree) => [...tree.nodes.values()];

/**
 * Open a node: place its `FANOUT` children around it.
 *
 * Idempotent — opening twice is not a second fan. The children's positions are
 * a pure function of the parent's, so a tree rebuilt from a URL lands in the
 * same shape rather than reflowing under the reader.
 */
export function expand(tree, path, { fanout = FANOUT, variant = 0, steer = null, retain = false } = {}) {
  const parent = nodeAt(tree, path);
  if (!parent) return tree;
  // Fold the branches you are not in first — this has to happen even when the
  // node is already open, because clicking back up the chain is how you leave a
  // branch, and that is exactly the case where something needs closing.
  //
  // Unless you asked to keep them. `retain` is the toggle: the graph gets
  // unwieldy, and being able to see the whole thing you have grown is worth
  // that. `layoutRadial` is what makes it survivable.
  if (!retain) collapseOutside(tree, path);
  if (parent.open) return tree;
  parent.open = true;

  const depth = path.length;
  const spread = spreadFor(depth);
  const ring = ringFor(depth, fanout);

  for (let i = 0; i < fanout; i++) {
    const t = fanout === 1 ? 0.5 : i / (fanout - 1);
    const angle = parent.angle + (t - 0.5) * spread;
    const child = [...path, { i, v: variant, ...(steer ? { g: steer } : {}) }];
    tree.nodes.set(key(child), {
      path: child,
      parent: key(path),
      x: parent.x + Math.cos(angle) * ring,
      y: parent.y + Math.sin(angle) * ring,
      angle,
      open: false,
    });
  }
  return tree;
}

// BY VALUE, not by reference. Path elements became objects when the fan variant
// moved into them, and `===` on two `{i,v}` that mean the same node is false.
// A path parsed out of the address bar shares no objects with the tree at all,
// so an identity comparison would report "not an ancestor" for every one of
// them and `collapseOutside` would delete the whole web.
const isPrefix = (a, b) => a.length <= b.length
  && a.every((e, i) => b[i] && (e.o
    ? e.o === b[i].o
    : (e.i === b[i].i && (e.v || 0) === (b[i].v || 0) && (e.g || '') === (b[i].g || ''))));

/**
 * Close every fan that is not on the way to `path`, and forget what it held.
 *
 * Descendants are deleted rather than hidden: a node holds no state worth
 * keeping (its stack is a fold from the root — see `mutate.js`), so re-opening
 * that branch rebuilds it identically. Nothing is lost by throwing it away, and
 * keeping it would mean carrying a tree that grows forever behind the one on
 * screen.
 */
export function collapseOutside(tree, path) {
  for (const node of [...tree.nodes.values()]) {
    // Keep a node exactly when its parent is on the open chain: that is the
    // root, every ancestor of `path`, and every one of their children — so the
    // siblings you passed on the way here are still tiles you can turn back to.
    if (!isPrefix(node.path.slice(0, -1), path)) {
      tree.nodes.delete(key(node.path));
      continue;
    }
    // Only the chain itself stays open.
    if (!isPrefix(node.path, path)) node.open = false;
  }
}

/**
 * Re-open every ancestor of `path`, so a deep-linked node is reachable.
 *
 * The fan variant is read off the CHILD element — it says which drawing of its
 * parent's fan it came from — so a rerolled branch rebuilds from its address
 * alone, which is the only reason reroll can be shared at all.
 */
export function revealPath(tree, path) {
  for (let d = 0; d < path.length; d++) {
    // An origin element is planted by whoever owns the arc, not expanded into —
    // there is no parent fan it came out of.
    if (path[d].o) continue;
    expand(tree, path.slice(0, d), { variant: path[d].v || 0, steer: path[d].g || null, retain: !!path[0]?.o });
  }
  return tree;
}

/**
 * Draw a node's fan again, differently.
 *
 * The node keeps its picture; only its children change, because the variant
 * rides on the children's own path elements. Their subtrees go with them —
 * they were folds through a stack that no longer exists.
 */
export function reroll(tree, path, variant, { steer = null, retain = false } = {}) {
  const node = nodeAt(tree, path);
  if (!node) return tree;
  for (const n of [...tree.nodes.values()]) {
    if (n.path.length > path.length && isPrefix(path, n.path)) tree.nodes.delete(key(n.path));
  }
  node.open = false;
  return expand(tree, path, { variant, steer, retain });
}

/**
 * Place EVERY node, with nothing folded away — the retention layout.
 *
 * The fan layout above is incremental and local: a node is placed relative to
 * its parent and never moves. That cannot work when every branch stays open,
 * because a node's room depends on how much its cousins have grown.
 *
 * So this is a radial tidy tree, computed over the whole graph at once:
 *
 *   1. Every node's weight is the number of LEAVES under it. A branch you have
 *      explored gets more of the circle than one you have not, which is the
 *      right allocation — the space goes where the work went.
 *   2. Each node hands its wedge to its children in proportion to those
 *      weights, so siblings never overlap by construction.
 *   3. The radius of each ring is then chosen so that the NARROWEST wedge at
 *      that depth is still wider than a tile: `r ≥ TILE·1.12 / wedge`. That is
 *      the same chord inversion `ringFor` does, applied per depth to whatever
 *      the tree actually looks like, and it is why the result is provably
 *      non-overlapping rather than hopefully so.
 *   4. Rings are also kept `TILE·1.1` apart radially, so a wide wedge cannot
 *      let two depths touch.
 *
 * It is deterministic: the same tree lays out the same way every time, so
 * nothing jitters. Positions DO move when you expand something — a new branch
 * changes how the circle is shared — and that is unavoidable in any layout
 * where the whole graph is visible at once.
 */
export function layoutRadial(tree, { fanout = FANOUT } = {}) {
  // Only the web that grows from the seed. A node whose path begins with an
  // ORIGIN element hangs off a bridge step instead, and its anchor is that
  // step's place on the arc — it is not competing for the circle and must not
  // be re-placed. Left in, it read as a second root with no wedge allocated,
  // its children came out at NaN, and the fan you grew off an arc simply did
  // not appear.
  const nodes = [...tree.nodes.values()].filter((n) => !n.path[0]?.o);
  if (!nodes.length) return tree;
  const byKey = new Map(nodes.map((n) => [key(n.path), n]));
  const kids = new Map();
  for (const n of nodes) {
    if (n.parent === null) continue;
    if (!kids.has(n.parent)) kids.set(n.parent, []);
    kids.get(n.parent).push(n);
  }
  for (const list of kids.values()) list.sort((a, b) => a.path[a.path.length - 1].i - b.path[b.path.length - 1].i);

  // 1. leaf weights, deepest first
  const weight = new Map();
  const order = nodes.slice().sort((a, b) => b.path.length - a.path.length);
  for (const n of order) {
    const mine = kids.get(key(n.path)) || [];
    weight.set(key(n.path), mine.length ? mine.reduce((t, c) => t + weight.get(key(c.path)), 0) : 1);
  }

  // 2. wedges, shallowest first
  const wedge = new Map([['', Math.PI * 2]]);
  const start = new Map([['', -Math.PI / 2 - Math.PI]]);
  const depth = new Map([['', 0]]);
  const shallow = nodes.slice().sort((a, b) => a.path.length - b.path.length);
  let narrowest = [];
  for (const n of shallow) {
    const k = key(n.path);
    const mine = kids.get(k) || [];
    if (!mine.length) continue;
    const total = weight.get(k);
    let a = start.get(k) ?? 0;
    for (const c of mine) {
      const w = (wedge.get(k) * weight.get(key(c.path))) / total;
      const ck = key(c.path);
      wedge.set(ck, w);
      start.set(ck, a);
      depth.set(ck, n.path.length + 1);
      const d = n.path.length + 1;
      narrowest[d] = Math.min(narrowest[d] ?? Infinity, w);
      a += w;
    }
  }

  // 3 & 4. radii: wide enough for the narrowest wedge, and never closer than a
  // tile to the ring inside it
  const radius = [0];
  for (let d = 1; d < narrowest.length; d++) {
    const w = narrowest[d] ?? Math.PI * 2;
    radius[d] = Math.max(radius[d - 1] + TILE * 1.1, (TILE * 1.12) / w, RING * d * 0.5);
  }

  for (const n of nodes) {
    const k = key(n.path);
    if (!n.path.length) { n.x = 0; n.y = 0; n.angle = -Math.PI / 2; continue; }
    const d = depth.get(k) ?? n.path.length;
    const mid = (start.get(k) ?? 0) + (wedge.get(k) ?? 0) / 2;
    n.angle = mid;
    n.x = Math.cos(mid) * (radius[d] ?? RING * d);
    n.y = Math.sin(mid) * (radius[d] ?? RING * d);
  }
  return tree;
}

/**
 * Place the fans that hang off a bridge step.
 *
 * `layoutRadial` deliberately ignores these — they are anchored to a point on
 * an arc rather than competing for the circle — but "ignored" is not "placed",
 * and the first version let a fan grown from an arc land straight on top of the
 * web it was drawn beside.
 *
 * So they get a greedy pass of their own, after everything else is down: each
 * fan is spread on an arc facing away from the centre of the graph, at a radius
 * grown in steps until every child clears every node already placed. Greedy but
 * deterministic — same tree, same order, same answer — and it terminates
 * because pushing outward always eventually clears a finite set of points.
 */
export function layoutAnchored(tree, { fanout = FANOUT } = {}) {
  const all = [...tree.nodes.values()];
  const anchored = all.filter((n) => n.path[0]?.o);
  if (!anchored.length) return tree;

  const kids = new Map();
  for (const n of all) {
    if (n.parent === null) continue;
    if (!kids.has(n.parent)) kids.set(n.parent, []);
    kids.get(n.parent).push(n);
  }
  for (const list of kids.values()) {
    list.sort((a, b) => (a.path[a.path.length - 1].i ?? 0) - (b.path[b.path.length - 1].i ?? 0));
  }

  // Everything that is not part of an anchored fan is already where it belongs.
  const settled = all.filter((n) => !n.path[0]?.o || n.path.length === 1);
  const roots = anchored.filter((n) => n.path.length === 1);
  const clear = (x, y, of) => of.every((p) => Math.hypot(p.x - x, p.y - y) >= TILE * 1.02);

  for (const root of roots) {
    const queue = [root];
    while (queue.length) {
      const parent = queue.shift();
      const mine = kids.get(key(parent.path)) || [];
      if (!mine.length) continue;
      // Face away from the middle of the graph, so a fan opens outward rather
      // than back across the web it came from.
      const away = Math.atan2(parent.y, parent.x) || parent.angle || 0;
      let ring = ringFor(1, mine.length);
      for (let tries = 0; tries < 40; tries++, ring += TILE * 0.35) {
        const spots = mine.map((_, i) => {
          const t = mine.length === 1 ? 0.5 : i / (mine.length - 1);
          const a = away + (t - 0.5) * DEEP_SPREAD;
          return { x: parent.x + Math.cos(a) * ring, y: parent.y + Math.sin(a) * ring, a };
        });
        const others = settled.filter((n) => n !== parent);
        if (spots.every((s, i) => clear(s.x, s.y, others)
          && spots.every((o, j) => j === i || Math.hypot(o.x - s.x, o.y - s.y) >= TILE * 1.02))) {
          mine.forEach((n, i) => { n.x = spots[i].x; n.y = spots[i].y; n.angle = spots[i].a; settled.push(n); });
          break;
        }
      }
      queue.push(...mine);
    }
  }
  return tree;
}

/** Every parent→child pair currently on screen, for drawing the threads. */
export function edges(tree) {
  const out = [];
  for (const node of tree.nodes.values()) {
    if (node.parent === null) continue;
    const from = tree.nodes.get(node.parent);
    if (from) out.push({ from, to: node });
  }
  return out;
}

/** The bounding box of everything placed — what "fit to view" needs. */
export function bounds(tree, pad = 140) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const n of tree.nodes.values()) {
    // One NaN position poisons the whole box and the view fits to nothing, so
    // a node that has somehow not been placed is skipped rather than trusted.
    if (!Number.isFinite(n.x) || !Number.isFinite(n.y)) continue;
    x0 = Math.min(x0, n.x); y0 = Math.min(y0, n.y);
    x1 = Math.max(x1, n.x); y1 = Math.max(y1, n.y);
  }
  if (!Number.isFinite(x0)) return { x: -pad, y: -pad, w: pad * 2, h: pad * 2 };
  return { x: x0 - pad, y: y0 - pad, w: (x1 - x0) + pad * 2, h: (y1 - y0) + pad * 2 };
}

/**
 * Which node is under a point in world space, nearest first.
 *
 * Hit-testing rather than DOM events because the nodes are drawn to one canvas
 * — thousands of absolutely-positioned elements is the thing that makes an
 * infinite canvas stutter on a phone.
 */
export function hitTest(tree, wx, wy, radius) {
  let best = null, bestD = Infinity;
  for (const n of tree.nodes.values()) {
    const d = Math.hypot(n.x - wx, n.y - wy);
    if (d < radius && d < bestD) { best = n; bestD = d; }
  }
  return best;
}

/** `3.0~2.7` ↔ the address bar. Re-exported so callers need one import. */
export { pathText as pathToText };

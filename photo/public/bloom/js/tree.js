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

const key = (path) => path.join('.');

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
export function expand(tree, path, { fanout = FANOUT } = {}) {
  const parent = nodeAt(tree, path);
  if (!parent) return tree;
  // Fold the branches you are not in first — this has to happen even when the
  // node is already open, because clicking back up the chain is how you leave a
  // branch, and that is exactly the case where something needs closing.
  collapseOutside(tree, path);
  if (parent.open) return tree;
  parent.open = true;

  const depth = path.length;
  const spread = spreadFor(depth);
  const ring = ringFor(depth, fanout);

  for (let i = 0; i < fanout; i++) {
    const t = fanout === 1 ? 0.5 : i / (fanout - 1);
    const angle = parent.angle + (t - 0.5) * spread;
    const child = [...path, i];
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

const isPrefix = (a, b) => a.length <= b.length && a.every((v, i) => v === b[i]);

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

/** Re-open every ancestor of `path`, so a deep-linked node is reachable. */
export function revealPath(tree, path) {
  for (let d = 0; d < path.length; d++) expand(tree, path.slice(0, d));
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

/** `3.0.7` ↔ the address bar. */
export const pathToText = (path) => path.join('.');

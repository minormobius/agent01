// The solver: breadth-first search over the engine's state graph. It is the
// interestingness oracle. It does three jobs:
//   • certifies a generated level is SOLVABLE (a goal state is reachable);
//   • finds the OPTIMAL solution length (par) — the answer the player races;
//   • reports search statistics + the optimal path, which the grader turns into
//     difficulty and interest.
// A node cap keeps generation bounded; levels whose search blows the cap are
// rejected at generation time, so everything shipped is fully solved.

import { step, isWin, initialState, stateKey, DIRS, xy } from './engine.js';

export function solve(level, opts = {}) {
  const cap = opts.cap ?? 250000;
  const start = initialState(level);
  if (isWin(level, start)) return { solvable: true, par: 0, path: [], nodes: 1, capped: false };

  const seen = new Map();           // key -> {parent, dir}
  const startKey = stateKey(start);
  seen.set(startKey, null);
  let frontier = [start];
  let depth = 0, nodes = 1;

  while (frontier.length) {
    const next = [];
    depth++;
    for (const s of frontier) {
      for (const dir of DIRS) {
        const ns = step(level, s, dir);
        if (!ns) continue;
        const k = stateKey(ns);
        if (seen.has(k)) continue;
        seen.set(k, { parent: stateKey(s), dir });
        nodes++;
        if (isWin(level, ns)) {
          return { solvable: true, par: depth, path: reconstruct(seen, k), nodes, capped: false };
        }
        next.push(ns);
        if (nodes > cap) return { solvable: false, par: -1, path: null, nodes, capped: true };
      }
    }
    frontier = next;
  }
  return { solvable: false, par: -1, path: null, nodes, capped: false };
}

function reconstruct(seen, goalKey) {
  const dirs = [];
  let k = goalKey;
  while (true) {
    const rec = seen.get(k);
    if (!rec) break;
    dirs.push(rec.dir);
    k = rec.parent;
  }
  return dirs.reverse();
}

// Count solver-distinct mechanic interactions along the optimal path, by
// replaying it through the engine and diffing successive states. This is what
// makes "did the solution actually USE the mechanics?" a measured fact.
export function analyzePath(level, path) {
  let s = initialState(level);
  const used = new Set();
  let pushes = 0, slides = 0, pickups = 0, fills = 0, longestSlide = 0;
  let prevPlayer = s.player;
  for (const dir of path) {
    const ns = step(level, s, dir);
    if (!ns) break;
    // box push or pit fill?
    if (ns.boxes.join() !== s.boxes.join()) { used.add('box'); pushes++; if (ns.filled !== s.filled) { used.add('pit'); fills++; } }
    if (ns.filled !== s.filled) { used.add('pit'); }
    // key / coin pickup?
    if (ns.keys !== s.keys) { used.add('key'); pickups++; }
    if (ns.coins !== s.coins) { used.add('coin'); pickups++; }
    // ice slide? (player travelled more than one cell)
    const [ax, ay] = xy(level, s.player), [bx, by] = xy(level, ns.player);
    const dist = Math.abs(ax - bx) + Math.abs(ay - by);
    if (dist > 1) { used.add('ice'); slides++; longestSlide = Math.max(longestSlide, dist); }
    // crossing a held gate (player passed a tile whose gate needed a button held)
    if (level.gateAt[ns.player] >= 0) used.add('gate');
    if (level.doorAt[ns.player] >= 0) used.add('door');
    if (level.arrow[ns.player] >= 0) used.add('arrow');
    prevPlayer = ns.player;
    s = ns;
  }
  return { used: [...used], pushes, slides, pickups, fills, longestSlide };
}

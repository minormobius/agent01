// The solver: search over the engine's state graph. It is the interestingness
// oracle. It does three jobs:
//   • certifies a generated level is SOLVABLE (a goal state is reachable);
//   • finds the OPTIMAL solution length (par) — the answer the player races;
//   • reports search statistics + the optimal path, which the grader turns into
//     difficulty and interest.
// Two engines share the contract:
//   solve()  — blind BFS. Fine for shallow state spaces.
//   solveAStar() — A* with an ADMISSIBLE heuristic (box→target matching lower
//     bound + agent approach). This is how we stress the form: Sokoban is
//     NP-hard and its state space dwarfs BFS at 3+ crates, but a lower bound
//     that never overestimates lets A* certify optimal par on instances far
//     beyond blind search — the oracle works harder so the game can be deeper.
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

// ---------- A* for box-pushing levels ----------
// Admissible h: each box not on a target needs at least its Manhattan distance
// to the NEAREST target in pushes; plus, if any box is off-target, the agent
// must first walk adjacent to some box (manhattan(agent, nearest box) − 1).
// Both ignore walls/collisions, so h never overestimates ⇒ par stays optimal.
function heuristic(level, s) {
  const cols = level.W;
  let h = 0, anyOff = false, agentTerm = Infinity;
  const ax = s.player % cols, ay = (s.player / cols) | 0;
  for (const b of s.boxes) {
    if (level.targets.indexOf(b) >= 0) continue;
    anyOff = true;
    const bx = b % cols, by = (b / cols) | 0;
    let best = Infinity;
    for (const t of level.targets) {
      const tx = t % cols, ty = (t / cols) | 0;
      const d = Math.abs(bx - tx) + Math.abs(by - ty);
      if (d < best) best = d;
    }
    h += best;
    const da = Math.abs(bx - ax) + Math.abs(by - ay) - 1;
    if (da < agentTerm) agentTerm = da;
  }
  if (anyOff && agentTerm > 0 && agentTerm < Infinity) h += agentTerm;
  return h;
}

export function solveAStar(level, opts = {}) {
  const cap = opts.cap ?? 700000;
  const start = initialState(level);
  if (isWin(level, start)) return { solvable: true, par: 0, path: [], nodes: 1, capped: false, algo: 'astar' };

  // binary min-heap on f = g + h
  const heap = [];
  const push = (it) => { heap.push(it); let i = heap.length - 1; while (i) { const p = (i - 1) >> 1; if (heap[p].f <= heap[i].f) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; } };
  const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < heap.length && heap[l].f < heap[m].f) m = l; if (r < heap.length && heap[r].f < heap[m].f) m = r; if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; i = m; } } return top; };

  const g = new Map();              // key -> best g found
  const via = new Map();            // key -> {parent, dir}
  const k0 = stateKey(start);
  g.set(k0, 0); via.set(k0, null);
  push({ s: start, k: k0, g: 0, f: heuristic(level, start) });
  let nodes = 1;

  while (heap.length) {
    const cur = pop();
    if (cur.g > g.get(cur.k)) continue;       // stale entry
    if (isWin(level, cur.s)) {
      return { solvable: true, par: cur.g, path: reconstructVia(via, cur.k), nodes, capped: false, algo: 'astar' };
    }
    for (const dir of DIRS) {
      const ns = step(level, cur.s, dir);
      if (!ns) continue;
      const k = stateKey(ns);
      const ng = cur.g + 1;
      if (g.has(k) && g.get(k) <= ng) continue;
      g.set(k, ng); via.set(k, { parent: cur.k, dir });
      nodes++;
      if (nodes > cap) return { solvable: false, par: -1, path: null, nodes, capped: true, algo: 'astar' };
      push({ s: ns, k, g: ng, f: ng + heuristic(level, ns) });
    }
  }
  return { solvable: false, par: -1, path: null, nodes, capped: false, algo: 'astar' };
}

function reconstructVia(via, goalKey) {
  const dirs = [];
  let k = goalKey;
  while (true) { const r = via.get(k); if (!r) break; dirs.push(r.dir); k = r.parent; }
  return dirs.reverse();
}

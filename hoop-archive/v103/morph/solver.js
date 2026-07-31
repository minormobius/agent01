// The one invariant oracle. A breadth-first search over the engine's state graph
// — substrate-agnostic, rule-agnostic. Whatever grammar the meta-generator rolls,
// THIS certifies the instance solvable, finds the optimal solution (par), and
// reports the search size the grader reads. It never changes; the games do.

import { tryMove, isWin, initialState, stateKey } from './engine.js';

export function solve(inst, opts = {}) {
  const cap = opts.cap ?? 220000;
  const start = initialState(inst);
  if (isWin(inst, start)) return { solvable: true, par: 0, path: [], nodes: 1, capped: false };
  const seen = new Map();
  seen.set(stateKey(start), null);
  let frontier = [start], depth = 0, nodes = 1;
  const dirs = inst.sub.dirs;
  while (frontier.length) {
    const next = [];
    depth++;
    for (const s of frontier) {
      for (let d = 0; d < dirs; d++) {
        const ns = tryMove(inst, s, d);
        if (!ns) continue;
        const k = stateKey(ns);
        if (seen.has(k)) continue;
        seen.set(k, { parent: stateKey(s), dir: d });
        nodes++;
        if (isWin(inst, ns)) return { solvable: true, par: depth, path: reconstruct(seen, k), nodes, capped: false };
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
  while (true) { const r = seen.get(k); if (!r) break; dirs.push(r.dir); k = r.parent; }
  return dirs.reverse();
}

// Replay an optimal path through tryMove, recording which sampled rules actually
// fired — "did the grammar's parts earn their place?" — for the grader and the
// genome quality gate.
export function analyzePath(inst, path) {
  let s = initialState(inst);
  const used = new Set();
  let pushes = 0, slides = 0, collects = 0, toggles = 0, seams = 0, ports = 0, longest = 0;
  for (const dir of path) {
    const before = s;
    const ns = tryMove(inst, s, dir);
    if (!ns) break;
    if (ns.boxes && before.boxes && ns.boxes.join() !== before.boxes.join()) { used.add('push'); pushes++; }
    if (ns.gems !== undefined && ns.gems !== before.gems) { used.add('collect'); collects++; }
    if (ns.lit !== undefined && ns.lit !== before.lit) { used.add('lights'); toggles++; }
    // a long jump in cell space hints a slide or a portal hop
    const moved = cellDistanceHint(inst, before.agent, ns.agent);
    if (moved > 1) { if (inst.has.portal) { used.add('portal'); ports++; } if (inst.moveModel === 'slide' || inst.has.ice) { used.add('slide'); slides++; longest = Math.max(longest, moved); } }
    if (inst.sub.seam && inst.sub.seam(before.agent, dir)) { used.add('seam'); seams++; }
    s = ns;
  }
  return { used: [...used], pushes, slides, collects, toggles, seams, ports, longest };
}

function cellDistanceHint(inst, a, b) {
  const [ax, ay] = inst.sub.xy ? inst.sub.xy(a) : [a, 0];
  const [bx, by] = inst.sub.xy ? inst.sub.xy(b) : [b, 0];
  return Math.abs(ax - bx) + Math.abs(ay - by);
}

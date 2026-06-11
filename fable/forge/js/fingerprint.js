// Behavioral fingerprinting — the foundry's measuring instrument. Two genomes
// can read differently and BE the same dynamics; the only honest identity for
// a law is how it behaves. We run each candidate on a fixed probe world and
// reduce its state graph to a small descriptor vector:
//
//   volume         log-size of the reachable state space
//   branching      mean legal moves per state
//   irreversibility fraction of transitions with no immediate way back
//   mutation       fraction of transitions that alter the world (marks/walls)
//   stride         mean cells displaced per move
//   drift          fraction of moves whose outgoing heading ≠ input direction
//
// Novelty = distance from every fingerprint in (known laws ∪ archive). The
// probe world is FIXED so fingerprints are comparable and deterministic.

import { makeWorld, initialState, stateKey, DIRS } from './engine.js';

export function probeWorld() {
  const W = 6, H = 6;
  const walls = new Uint8Array(W * H);
  // a fixed, slightly-broken arena (deterministic, hand-laid)
  for (const c of [8, 9, 15, 27, 22]) walls[c] = 1;
  return makeWorld(W, H, { walls, agent0: 0, exit: 35, goal: { type: 'exit' }, tokens: [] });
}

export function fingerprint(stepFn, opts = {}) {
  const cap = opts.cap ?? 6000;
  const world = probeWorld();
  const start = initialState(world);
  const seen = new Map();
  seen.set(stateKey(start), start);
  let frontier = [start];
  let transitions = 0, branchSum = 0, statesExpanded = 0;
  let irrev = 0, mutated = 0, strideSum = 0, drifted = 0;
  const W = world.W;
  const dist = (a, b) => Math.abs(a % W - b % W) + Math.abs((a / W | 0) - (b / W | 0));

  while (frontier.length && seen.size < cap) {
    const next = [];
    for (const s of frontier) {
      statesExpanded++;
      let legal = 0;
      for (const d of DIRS) {
        const ns = stepFn(world, s, d);
        if (!ns) continue;
        legal++; transitions++;
        if (ns.marks !== s.marks || ns.dynWalls !== s.dynWalls) mutated++;
        strideSum += Math.min(4, world.wrap ? 1 : dist(s.agent, ns.agent));
        if (ns.dir !== d) drifted++;
        // irreversible? no single move from ns returns to s
        let back = false;
        for (const d2 of DIRS) {
          const rs = stepFn(world, ns, d2);
          if (rs && stateKey(rs) === stateKey(s)) { back = true; break; }
        }
        if (!back) irrev++;
        const k = stateKey(ns);
        if (!seen.has(k)) { seen.set(k, ns); next.push(ns); }
      }
      branchSum += legal;
    }
    frontier = next;
  }

  const t = Math.max(1, transitions);
  return {
    volume: Math.min(1, Math.log10(seen.size + 1) / 4.2),
    branching: branchSum / Math.max(1, statesExpanded) / 4,
    irreversibility: irrev / t,
    mutation: mutated / t,
    stride: strideSum / t / 4,
    drift: drifted / t,
    _states: seen.size,
  };
}

export const FP_KEYS = ['volume', 'branching', 'irreversibility', 'mutation', 'stride', 'drift'];

export function fpDistance(a, b) {
  let s = 0;
  for (const k of FP_KEYS) { const d = (a[k] ?? 0) - (b[k] ?? 0); s += d * d; }
  return Math.sqrt(s);
}
export function nearestKnown(fp, knowns) {
  let best = null, bd = Infinity;
  for (const k of knowns) {
    const d = fpDistance(fp, k.fp);
    if (d < bd) { bd = d; best = k; }
  }
  return { nearest: best, dist: bd };
}

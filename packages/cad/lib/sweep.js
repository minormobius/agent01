// sweep.js — clearance through the motion. Poses an assembly at instants
// over a period, measures every pair's nearest approach with lib/proximity.js
// (no kernel), keeps each pair's worst — the smallest distance, the deepest
// penetration — and then refines: eight instants are a coarse net, so for
// every pair the minimum is chased with a golden-section search between the
// neighbouring samples, evaluating that pair alone. The result is the table
// a mechanical reviewer reads first: pair, nearest approach, when.
//
// bodies: [{ id, mesh: {pos, idx}, comp }] — comp is the flattened component
// (for modelOf). kin: { components, mates, drive }.
import { solveAngles, modelOf } from './assembly.js';
import { BVH, posedTriangles, proximity, clearances } from './proximity.js';

const phi = (Math.sqrt(5) - 1) / 2;

/// What a pair's proximity means. `expect(a, b)` is expectations() from
/// assembly.js — { touch, fit } — or, for older callers, a boolean "expected
/// touch". `clearance` is the distance demanded of every other pair.
///   collision  crossing with depth, or one body inside the other
///   expected   contact or crossing where a mate, or a fit with contact, says so
///   fit        a designed clearance, within its [min, max]
///   loose      a designed clearance, wider than its max
///   close      nearer than the clearance demanded (or than a fit's min)
///   contact    touching with no depth, with no clearance demanded — a bushing on its pin
///   clear
/// OK_VERDICTS is what passes; the rest fail a check.
export const OK_VERDICTS = new Set(['clear', 'contact', 'expected', 'fit']);
export function verdictOf(p, expect = () => false, clearance = 0) {
  const e = expect(p.a, p.b); const ex = typeof e === 'boolean' ? { touch: e, fit: null } : e || { touch: false, fit: null };
  const deep = p.penetration > 0 || !!p.contained;
  if (ex.touch) return deep || p.touching ? 'expected' : p.distance < clearance ? 'close' : 'clear';
  if (ex.fit) { if (deep) return 'collision'; const d = p.touching ? 0 : p.distance; return d < ex.fit.min ? (ex.fit.min > 0 && d === 0 ? 'collision' : 'close') : d > ex.fit.max ? 'loose' : 'fit'; }
  if (deep) return 'collision';
  if (p.touching) return clearance > 0 ? 'close' : 'contact';
  return p.distance < clearance ? 'close' : 'clear';
}

/// Every pair's proximity at one instant.
export function clearanceAt(bodies, kin, t, { within = Infinity, skip = () => false } = {}) {
  const angles = solveAngles(kin.components, kin.mates, kin.drive, t);
  const posed = bodies.map((b) => ({ id: b.id, mesh: b.mesh, model: modelOf(b.comp, angles) }));
  return { t, ...clearances(posed, { within, skip }) };
}

/// One pair's nearest approach at t (the refinement's inner loop).
function pairAt(a, b, kin, t) {
  const angles = solveAngles(kin.components, kin.mates, kin.drive, t);
  const A = new BVH(posedTriangles(a.mesh, modelOf(a.comp, angles))), B = new BVH(posedTriangles(b.mesh, modelOf(b.comp, angles)));
  return proximity(A, B);
}

/// N instants over `period`, each pair's worst, refined between samples.
///
/// A big assembly does not fit in one server's CPU: 45 components at 24
/// instants is 24 × 990 pairs. So a sweep is WINDOWED — it starts at instant
/// `from`, stops when `budgetMs` is spent (always taking at least one
/// instant), and reports `next`, the instant it stopped at, for the caller
/// to pass back as `from`. `done` says the window reached the end.
/// Refinement is the other cost, and it only pays near the clearance being
/// demanded: `refineWithin` skips pairs no closer than that.
export function sweepClearance(bodies, kin, { instants = 12, period = 1, from = 0, within = Infinity, skip = () => false, refine = true, iterations = 10, refineWithin = Infinity, budgetMs = Infinity } = {}) {
  const t0 = performance.now();
  const spent = () => performance.now() - t0 >= budgetMs;
  const byId = new Map(bodies.map((b) => [b.id, b]));
  const worst = new Map(); let tested = 0;
  const better = (p, q) => (p.penetration > q.penetration) || (p.penetration === q.penetration && p.distance < q.distance);
  const record = (p, t) => { const key = `${p.a}|${p.b}`; const w = worst.get(key); if (!w || better(p, w)) worst.set(key, { ...p, t }); };
  const start = Math.max(0, Math.min(instants - 1, Math.floor(from) || 0));
  let k = start;
  for (; k < instants; k++) {
    if (k > start && spent()) break;
    const r = clearanceAt(bodies, kin, (k * period) / instants, { within, skip });
    tested = Math.max(tested, r.tested); for (const p of r.pairs) record(p, (k * period) / instants);
  }
  const done = k >= instants;
  let refinedPairs = 0;
  if (refine && instants > 1) {
    const step = period / instants;
    for (const [key, w] of [...worst]) {
      if (w.penetration > 0) continue; // already colliding: the volume, not the distance, is the story
      if (w.distance > refineWithin) continue; // far enough that a graze between samples cannot reach the clearance
      if (spent()) break;
      refinedPairs++;
      const a = byId.get(w.a), b = byId.get(w.b);
      const f = (t) => { const r = pairAt(a, b, kin, t); return r.penetration > 0 ? -r.penetration : r.distance; };
      let lo = w.t - step, hi = w.t + step, x1 = hi - phi * (hi - lo), x2 = lo + phi * (hi - lo), f1 = f(x1), f2 = f(x2);
      for (let i = 0; i < iterations; i++) { if (f1 < f2) { hi = x2; x2 = x1; f2 = f1; x1 = hi - phi * (hi - lo); f1 = f(x1); } else { lo = x1; x1 = x2; f1 = f2; x2 = lo + phi * (hi - lo); f2 = f(x2); } }
      const tb = f1 < f2 ? x1 : x2; const r = pairAt(a, b, kin, tb);
      if (better(r, w)) worst.set(key, { ...r, a: w.a, b: w.b, t: ((tb % period) + period) % period });
    }
  }
  const pairs = [...worst.values()].sort((p, q) => q.penetration - p.penetration || p.distance - q.distance);
  return { pairs, instants, period, from: start, sampled: k - start, done, next: done ? null : k, tested, refined: refine, refinedPairs, ms: performance.now() - t0 };
}

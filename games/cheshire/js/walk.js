/* Walking on a 3D floor, no DOM: a gait for any leg rig (cat.js rig), and how far a stride it allows.

   A gait here is a cycle of T seconds in which the feet swing in groups, one group at a time, in a fixed order. A foot
   is down for the fraction beta of the cycle (its duty) and swings forward a stride L in the rest; down, it stays put on
   the floor while the body passes over it at v = L / (beta T). Body frame throughout: x forward; a foot down slides
   back at v, a foot swinging comes forward L in (1 − beta) T, lifted H at mid-swing.
     wave(rig, com, o)    the gait: at(t) → { d (distance walked), feet { name: { p: [x, z, w], h } }, sway, down };
                          and its judgment: static (every swing leaves a solid support with the centre of mass `need`
                          inside, the body swaying there first), the largest sway, every foot always within reach
     orders(names)        the cyclic orders of single feet to try (the first foot fixed)
     best(rig, com, o)    the best order for a stride (static first, then least sway)
     maxStride(rig, com, o)  the longest stride a static gait allows (and its order), by bisection

   Staying balanced through a swing. The feet that are down slide back together, so their support (the solid they span)
   keeps its shape and slides back at v. Put the centre of mass `need` inside it at the swing's start (the least sway that
   does, gait.js swayTo) and at its end, and move it straight between the two: a convex set sliding and a point sliding
   between two of its points stay together, so the margin holds for the whole swing. Between swings, when every foot is
   down, the support only grows (each four-foot support is inside the five), so the same straight move holds there too. */
import { hull, swayTo } from "./gait.js";

const ease = (s) => s * s * (3 - 2 * s);

export function wave(rig, com, o) {
  const { L, T = 1.6, beta = 0.85, need = 0.01, H = 0.045 } = o, groups = o.order.map((g) => (Array.isArray(g) ? g : [g]));
  const n = groups.length, Ts = (1 - beta) * T, v = L / (beta * T), byName = Object.fromEntries(rig.map((r) => [r.name, r]));
  if (Ts > T / n + 1e-12) throw new Error("two groups would swing at once: raise beta");
  const start = groups.map((_, i) => (i * T) / n), groupOf = {}; groups.forEach((g, i) => g.forEach((nm) => (groupOf[nm] = i)));
  // where a foot is at time t (body frame), and whether it's down
  const foot = (nm, t) => {
    const r = byName[nm], tau = (((t - start[groupOf[nm]]) % T) + T) % T, x0 = r.foot[0];
    if (tau < Ts) { const s = tau / Ts; return { p: [x0 - L / 2 + L * ease(s), r.foot[1], r.foot[2]], h: H * Math.sin(Math.PI * s), down: false }; }
    return { p: [x0 + L / 2 - v * (tau - Ts), r.foot[1], r.foot[2]], h: 0, down: true };
  };
  // the centre of mass's target at each swing's start and end: the least sway that leaves it `need` inside the feet down
  const plan = groups.map((g, i) => {
    const support = (t) => hull(rig.filter((r) => !g.includes(r.name)).map((r) => foot(r.name, t).p));
    const h0 = support(start[i] + 1e-9), h1 = support(start[i] + Ts - 1e-9);
    const a = swayTo(h0, com, need), b = swayTo(h1, com, need);
    return { a, b, dim: h0.dim };
  });
  const isStatic = plan.every((q) => q.a && q.b), swayMax = isStatic ? Math.max(...plan.flatMap((q) => [q.a.d, q.b.d])) : Infinity;
  const target = (t) => { // the centre of mass's planned place, straight between the targets
    if (!isStatic) return com;
    const tau = ((t % T) + T) % T, i = Math.min(n - 1, Math.floor((tau * n) / T)), u = tau - start[i];
    if (u < Ts) { const s = u / Ts; return plan[i].a.p.map((x, k) => x + (plan[i].b.p[k] - x) * s); }
    const j = (i + 1) % n, s = (u - Ts) / (T / n - Ts || 1), next = plan[j].a.p;
    return plan[i].b.p.map((x, k) => x + (next[k] - x) * s);
  };
  const at = (t) => {
    const feet = {}, down = [];
    for (const r of rig) { const f = foot(r.name, t); feet[r.name] = { p: f.p, h: f.h }; if (f.down) down.push(r.name); }
    const c = target(t);
    return { d: v * t, feet, sway: c.map((x, k) => x - com[k]), down };
  };
  // reach: every hip (riding with the sway) to its foot's chain end, sampled over a cycle, within the leg's stretch
  let worstReach = -Infinity;
  for (let k = 0; k < 96; k++) {
    const t = (k * T) / 96, st = at(t);
    for (const r of rig) {
      const f = st.feet[r.name], hip = [r.hip[0] + st.sway[0], r.hip[1], r.hip[2] + st.sway[1], r.hip[3] + st.sway[2]];
      const end = r.front ? [f.p[0] - 0.012, 0.024 + f.h, f.p[1], f.p[2]] : [f.p[0] - 0.042, 0.065 + f.h, f.p[1], f.p[2]];
      worstReach = Math.max(worstReach, Math.hypot(...end.map((x, i) => x - hip[i])) / r.reach);
    }
  }
  return { at, v, L, T, beta, groups, plan, isStatic, swayMax, reachOK: worstReach <= 0.97, worstReach, ok: isStatic && worstReach <= 0.97 };
}

/* every cyclic order of single feet, the first fixed (n − 1)! of them */
export function orders(names) {
  const [first, ...rest] = names, out = [], perm = (a, pre) => (a.length ? a.forEach((x, i) => perm([...a.slice(0, i), ...a.slice(i + 1)], [...pre, x])) : out.push([first, ...pre]));
  perm(rest, []);
  return out;
}
export function best(rig, com, o) {
  let top = null;
  for (const order of o.orders || orders(rig.map((r) => r.name))) {
    const w = wave(rig, com, { ...o, order });
    if (!top || (w.ok && !top.ok) || (w.ok === top.ok && w.swayMax < top.swayMax)) top = w;
  }
  return top;
}
export function maxStride(rig, com, o = {}) {
  let lo = 0, hi = o.hi || 0.3, top = null;
  for (let k = 0; k < (o.steps || 12); k++) { const L = (lo + hi) / 2, w = best(rig, com, { ...o, L }); if (w.ok) { lo = L; top = w; } else hi = L; }
  return { L: lo, gait: top };
}

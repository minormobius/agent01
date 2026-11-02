/* SQUID's animal, no DOM: a jet-propelled body in an open four-dimensional sea, with no down. A game model, not a fluid
   simulation: each force below is the right shape, its size tuned to fly.

   ITS FRAME is a heading F and the three directions across it, R (right), U (up) and N (ana): your slice is F, R and U.
   It turns only in planes that contain F (pitching F toward some direction across), carried without twisting, so ROLL,
   the turning of the across-space within itself (three planes of it in 4D: R–U, R–N, U–N), is ignored, as agreed. Its
   turning is then a 3-vector ω: how fast F tips toward R, U and N.

   THE JET pulses while you hold it (the mantle squeezing and refilling), along F. The FUNNEL aims it: a 3-vector across
   (the stick in your slice, the lever ana and kata), turning the body toward the aim, more the harder the jet; fins
   give a little turning without it.

   THE MUNK MOMENT: a long body moving through fluid at an angle is turned further broadside, so the heading runs away
   from the velocity, ∝ (speed along) × (speed across). THE ARMS, trailing like an arrow's feathers, turn it back,
   ∝ speed × (speed across) × how far they're spread. Spread, it's stable and slower (they drag); folded, it's faster
   and the Munk moment wins: it wobbles off unless you fly it. */
export const PHYS = { thrust: 9, pulseHz: 1.15, kAx: 0.16, kCross: 1.8, munk: 0.9, arms: 1.6, damp: 2.4, vector: 0.9, fin: 0.9, aimMax: 0.45, armRate: 2.5, foldedArms: 0.12 };
const add = (a, b, k = 1) => a.map((x, i) => x + k * b[i]), dot = (a, b) => a.reduce((s, x, i) => s + x * b[i], 0), sc = (a, k) => a.map((x) => x * k);
const unit = (v) => { const m = Math.hypot(...v); return v.map((x) => x / m); };
export class Squid {
  constructor(pos = [0, 0, 0, 0], F = [0, 0, 1, 0], R = [1, 0, 0, 0], U = [0, 1, 0, 0], N = [0, 0, 0, 1]) {
    Object.assign(this, { pos: pos.slice(), F: F.slice(), R: R.slice(), U: U.slice(), N: N.slice(), v: [0, 0, 0, 0], w: [0, 0, 0], phase: 0, thrust: 0, spread: 1, t: 0 });
  }
  get across() { return [this.R, this.U, this.N]; }
  /* aim: the funnel, [right, up, ana] each −1…1; jet: held or not; arms: 1 spread, 0 folded */
  step(dt, aim, jet, arms = 1) {
    const P = PHYS, E = this.across;
    // the mantle: while the jet's held, squeeze and refill in turn (thrust ∝ the squeeze); let go and it just refills
    if (jet) { this.phase += dt * P.pulseHz; this.thrust = P.thrust * 2 * Math.max(0, Math.sin(2 * Math.PI * this.phase)) ** 2; } else { this.thrust = 0; this.phase = 0; }
    this.spread += (arms - this.spread) * Math.min(1, P.armRate * dt);
    // translation: thrust, drag along and across (the arms add drag)
    const vF = dot(this.v, this.F), vX = add(this.v, this.F, -vF), sX = Math.hypot(...vX), kA = P.kAx * (1 + 0.9 * this.spread);
    // the jet pushes along the heading; the funnel's aim turns the body (below)
    let a = sc(this.F, this.thrust); a = add(a, this.F, -kA * Math.abs(vF) * vF); a = add(a, vX, -P.kCross * sX);
    this.v = add(this.v, a, dt); this.pos = add(this.pos, this.v, dt);
    // turning: the funnel (with the jet), the fins (without), the Munk moment (away from the velocity), the arms (toward it), damping
    const c = E.map((e) => dot(this.v, e)), u = Math.hypot(...this.v), armK = P.arms * (P.foldedArms + (1 - P.foldedArms) * this.spread);
    this.w = this.w.map((wi, i) => wi + dt * ((P.vector * this.thrust + P.fin) * aim[i] - P.munk * vF * c[i] + armK * u * c[i] - P.damp * wi));
    // turn in the one plane of F and the direction the turn points (ŵ = Σ ω_i e_i): exactly no roll, the across-space
    // only tipped toward F, never turned within itself; then keep it orthonormal
    const wm = Math.hypot(...this.w); let F = this.F, Es = E.map((e) => e.slice());
    if (wm > 1e-12) {
      const wh = add(add(sc(E[0], this.w[0] / wm), E[1], this.w[1] / wm), E[2], this.w[2] / wm), th = wm * dt, co = Math.cos(th), si = Math.sin(th);
      F = add(sc(this.F, co), wh, si); Es = E.map((e) => { const k = dot(e, wh); return add(add(e, wh, k * (co - 1)), this.F, -k * si); });
    }
    F = unit(F); const B = [F]; for (const e of Es) { let x = e; for (const b of B) x = add(x, b, -dot(x, b)); B.push(unit(x)); }
    [this.F, this.R, this.U, this.N] = B; this.t += dt;
  }
  /* how far the heading points away from the velocity (radians): the angle the Munk moment works on */
  slip() { const u = Math.hypot(...this.v); return u < 1e-6 ? 0 : Math.acos(Math.max(-1, Math.min(1, dot(this.v, this.F) / u))); }
}
/* the sea: big glowing 4D balls (jellies), scattered through a 4D ball of radius ARENA, each a radius and a colour. A
   ball shows in your slice only while you're within its radius of its centre in the way you can't see, so a 4D sea
   needs many, and big: about a fifth of them cut any slice through the middle. And eight giants, a compass: at ±70 m
   along x, y, z and w, each axis its own colour */
export const GIANTS = [[1, [1, 0.45, 0.3]], [1, [1, 0.85, 0.3]], [2, [0.5, 1, 0.45]], [3, [0.3, 1, 0.9]]].flatMap(([ax, col]) => [1, -1].map((sg) => { const p = [0, 0, 0, 0]; p[ax === 1 ? (col[1] > 0.7 ? 1 : 0) : ax] = 70 * sg; return { p, r: 18, col: sg > 0 ? col : col.map((c) => c * 0.75 + 0.1), giant: true }; }));
export const ARENA = 120;
export function rng(seed) { let s = seed >>> 0 || 1; return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296); }
export function sea(seed = 1, count = 200) {
  const r = rng(seed), out = GIANTS.map((g) => ({ ...g, p: g.p.slice() })), PAL = [[0.35, 1, 0.9], [1, 0.82, 0.35], [1, 0.45, 0.72], [0.68, 0.55, 1], [0.6, 1, 0.45], [1, 0.6, 0.35], [0.45, 0.75, 1]];
  for (let tries = 0; out.length < count + GIANTS.length && tries < 20000; tries++) {
    const g = () => Math.sqrt(-2 * Math.log(1 - r())) * Math.cos(2 * Math.PI * r()), d = unit([g(), g(), g(), g()]), p = sc(d, ARENA * Math.pow(r(), 0.25) * 0.92), rad = 4 + 10 * r() ** 1.6;
    if (Math.hypot(...p) < 18) continue; // a clear space round the start
    if (out.some((o) => Math.hypot(...add(o.p, p, -1)) < o.r + rad + 4)) continue;
    out.push({ p, r: rad, col: PAL[out.length % PAL.length] });
  }
  return out;
}
/* a chase: k of the jellies in an order, each a fair swim from the last */
export function course(jellies, seed = 1, k = 8) {
  const r = rng(seed * 7 + 3), order = []; let at = [0, 0, 0, 0];
  for (let i = 0; i < k; i++) {
    // not the giants (they're the compass); the first one in your starting slice (w ≈ 0), so you start with it in view
    const cand = jellies.map((j, n) => ({ n, d: Math.hypot(...add(j.p, at, -1)) })).filter((c) => !jellies[c.n].giant && !order.includes(c.n) && c.d > 30 && c.d < 95 && (i > 0 || Math.abs(jellies[c.n].p[3]) < jellies[c.n].r * 0.7));
    const pick = cand.length ? cand[Math.floor(r() * cand.length)] : { n: jellies.findIndex((_, n) => !order.includes(n)) };
    order.push(pick.n); at = jellies[pick.n].p;
  }
  return order;
}

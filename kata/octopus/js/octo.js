/* OCTOPUS, no DOM: eight of TENTACLE's arms on a head, in 3D and in 4D, in one solve.

   WHERE THE ARMS GROW. An octopus's eight arms root in a ring round its mouth: eight points on a circle, 45° apart. In
   4D the mouth is ringed by a 2-sphere, not a circle, and the eight most evenly spread points on a 2-sphere are a
   cube's corners, 70.5° apart. So the hyperoctopus has its arms at the corners of a cube, every arm's root with three
   nearest neighbours instead of two. The cube is turned 45° in the z–w plane, so four corners (a rectangle) lie in
   w = 0, the slice you start in, and the other four sit in pairs ana and kata of it.

   Each arm is TENTACLE's (../../tentacle/js/rod.js: the muscles, strains and shape), built from its own root and frame.
   All eight are one rod in dyn.js (eight chains laid end to end), so they move in one solve and press on one another.
   Their roots crowd together inside the head, so the first eight nodes of each touch nothing; the rest can't pass
   through each other, the head or the mantle. The suckers face the mouth: each arm's −e1 side points down and in. */
import { build, strainsOf, SEG, LEN, R0, RTIP, PRESETS } from "../../tentacle/js/rod.js";
import { makeRod, step, framesOf } from "../../tentacle/js/dyn.js";

export const NA = 8, PER = SEG + 1, HEAD = 0.42, G_EFF = 9.81 * (1 - 1000 / 1050);
export const OCTO = { sub: 6, contactEvery: 2, iters: 1, aMin: 0.0015, aMax: 0.04, bMax: 0.003, kn: 0.2, kt: 0.01, rest: 0.45 };
/* the head and the mantle, as round cones the arms can't enter (the shader draws the same, with the eyes) */
export const SOLIDS = [
  { a: [0, 0, 0, 0], b: [0, 0, 0, 0], ra: HEAD, rb: HEAD },
  { a: [0, 0.2, -0.05, 0], b: [0, 0.95, -0.32, 0], ra: 0.4, rb: 0.3 },
];
const dot = (a, b) => a.reduce((s, x, i) => s + x * b[i], 0), unit = (v) => { const m = Math.hypot(...v); return v.map((x) => x / m); };
function det(M) { // small determinants, by expansion
  const n = M.length; if (n === 1) return M[0][0]; let s = 0;
  for (let j = 0; j < n; j++) s += (j % 2 ? -1 : 1) * M[0][j] * det(M.slice(1).map((r) => r.filter((_, c) => c !== j)));
  return s;
}

/* the eight roots: direction out of the mouth (round the ring, or a cube's corner, and 24° below level), position just
   inside the head, and the frame each arm grows from: T outward, e1 its aboral side (up, away from the mouth), the rest
   by Gram–Schmidt, handed like rod.js's own base frame */
export function roots(d) {
  const corners = d === 3 ? Array.from({ length: NA }, (_, k) => { const th = (2 * Math.PI * k) / NA + Math.PI / NA; return [Math.cos(th), 0, Math.sin(th)]; })
    : [[1, 1, 1], [1, 1, -1], [1, -1, 1], [1, -1, -1], [-1, 1, 1], [-1, 1, -1], [-1, -1, 1], [-1, -1, -1]].map(([a, b, c]) => [a, 0, (b - c) / Math.SQRT2, (b + c) / Math.SQRT2].map((v) => v / Math.sqrt(3)));
  const up = new Array(d).fill(0); up[1] = 1;
  const baseDet = det(d === 3 ? [[0, 1, 0], [1, 0, 0], [0, 0, 1]] : [[0, 1, 0, 0], [1, 0, 0, 0], [0, 0, 1, 0], [0, 0, 0, 1]]);
  return corners.map((u) => {
    const T = unit(u.map((v, c) => v - (c === 1 ? 0.45 : 0))), e1 = unit(up.map((v, c) => v - dot(up, T) * T[c])), F = [T, e1];
    for (let ax = 0; ax < d && F.length < d; ax++) {
      let v = new Array(d).fill(0); v[ax] = 1;
      for (const f of F) { const p = dot(v, f); v = v.map((x, c) => x - p * f[c]); }
      if (Math.hypot(...v) > 0.3) F.push(unit(v));
    }
    if (Math.sign(det(F)) !== Math.sign(baseDet)) F[d - 1] = F[d - 1].map((v) => -v);
    return { u, x0: T.map((v) => v * 0.3), F0: F };
  });
}

/* what each arm's muscles do, by preset: muscle(s) for arm k at time t (n[0] > 0 is the aboral side, n[0] < 0 the
   suckers' side) */
const sm = (x) => { const t = Math.max(0, Math.min(1, x + 0.5)); return t * t * (3 - 2 * t); };
const oral = (n) => Math.max(0, -n[0]), aboral = (n) => Math.max(0, n[0]);
/* the swimming stroke: close fast (a quarter of the cycle), open slowly (the rest). Quadratic drag makes the fast close
   push the water harder than the slow open pulls it back, so it goes somewhere: the readout averages it over a stroke */
export const SWEEP = 2.2;
export const stroke = (t) => { const p = (t / SWEEP) % 1; return p < 0.25 ? sm(p / 0.25 - 0.5) : 1 - (p - 0.25) / 0.75; };
export const OPRESETS = {
  // floating: the arms droop toward the mouth near the root, their tips curling out
  sprawl: (d, t, k) => (s) => ({ long: (n) => oral(n) * 0.3 * (1 - s) * (0.85 + 0.15 * Math.sin(0.7 * t + k)) + aboral(n) * 0.55 * sm((s - 0.82) / 0.1) }),
  // each arm writhing, out of step with its neighbours
  writhe: (d, t, k) => PRESETS.writhe(d, t + 1.1 * k),
  // the stroke: all arms together
  sweep: (d, t) => { const c = stroke(t); return (s) => ({ long: (n) => oral(n) * c * 0.75 * (1 - 0.3 * s) + aboral(n) * (1 - c) * 0.25 * (1 - s) }); },
  // the arms curl back over the head and mantle: the defensive umbrella, suckers turned out
  flare: (d, t, k) => (s) => ({ long: (n) => aboral(n) * 0.75 * (0.65 + 0.35 * Math.sin(0.8 * t + 0.5 * k)) * sm((s - 0.12) / 0.1) }),
  // the arms coil under the mouth, suckers in, crowding one another
  grab: (d, t, k) => (s) => ({ long: (n) => oral(n) * (0.55 + 0.15 * Math.sin(0.9 * t + k)) * sm((s - 0.15) / 0.1), helix: d === 3 ? [0.25] : [0.25, 0.15 * Math.sin(0.4 * t), 0] }),
  // one arm reaches (TENTACLE's reach: a bend travelling out) while the others hold
  reach: (d, t, k) => (k === 0 ? PRESETS.reach(d, t) : OPRESETS.sprawl(d, t, k)),
};
export function toneOf(preset, st) { const act = st.mean + Math.hypot(...st.dip); return preset.startsWith("sweep") ? 0.9 : Math.min(1, OCTO.rest + 0.9 * act); }

/* the octopus: one rod of eight chains. pinned: each arm's first two nodes (held by the head) */
export function makeOcto(d, preset = "sprawl") {
  const R = roots(d), arms = R.map((r, k) => build(d, strainsOf(d, OPRESETS[preset](d, 0, k)), r.x0, r.F0)), xs = arms.flat().map((n) => n.x);
  const pinned = [], noContact = []; for (let k = 0; k < NA; k++) { pinned.push(k * PER, k * PER + 1); for (let i = 0; i < 8; i++) noContact.push(k * PER + i); }
  const rod = makeRod(d, xs, arms.flat().map((n) => n.r), { chains: new Array(NA).fill(PER), pinned, noContact, stride: 2 });
  return { d, roots: R, rod, t: 0, nodes: arms.flat(), st: null, body: new Array(d).fill(0) };
}
/* one step. The muscles' shape is worked out every other step (opts.every, 2): it changes slowly, and the arms, having
   mass, smooth it anyway; that halves the cost of eight arms' muscles and shapes */
export function stepOcto(o, preset, t, dt, opts = {}) {
  const { d, rod, roots: R } = o, every = opts.every ?? 2;
  if (!o.cache || o.cache.preset !== preset || (o.n = (o.n || 0) + 1) % every === 0) {
    const sts = [], targets = [];
    for (let k = 0; k < NA; k++) { const st = strainsOf(d, OPRESETS[preset](d, t, k)); sts.push(st); targets.push(build(d, st, R[k].x0, R[k].F0)); }
    o.cache = { preset, sts, targets };
  }
  const { sts, targets } = o.cache;
  const T = targets.flat(), q = T.map((n) => n.x), L = q.slice(1).map((x, i) => ((i + 1) % PER === 0 ? 0 : Math.hypot(...x.map((v, c) => v - q[i][c]))));
  const stN = T.map((_, i) => sts[Math.floor(i / PER)][Math.min(SEG - 1, i % PER)]), tone = stN.map((st) => toneOf(preset, st));
  for (let i = 0; i < rod.N; i++) rod.r[i] = T[i].r;
  const pins = {}; for (let k = 0; k < NA; k++) { pins[k * PER] = q[k * PER]; pins[k * PER + 1] = q[k * PER + 1]; }
  const g = new Array(d).fill(0); g[1] = -(opts.g ?? G_EFF);
  step(rod, dt, { q, L, tone, pins, g, kn: OCTO.kn, kt: OCTO.kt, aMin: OCTO.aMin, aMax: OCTO.aMax, bMax: OCTO.bMax, sub: opts.sub ?? OCTO.sub, contactEvery: OCTO.contactEvery, iters: OCTO.iters, collide: opts.collide ?? true, solids: SOLIDS.map((c) => ({ ...c, a: c.a.slice(0, d), b: c.b.slice(0, d) })) });
  const F = framesOf(rod, T.map((n) => n.F));
  o.t = t; o.st = stN; o.target = T; o.body = rod.body;
  o.nodes = rod.x.map((x, i) => ({ x: x.slice(), F: F[i], r: rod.r[i], s: T[i].s ?? (i % PER) / SEG }));
  return o;
}
/* the skin's sucker coordinate (rest length in rest radii, per arm), as the renderer wants it, for all eight */
export function octoSkin() {
  const rr = Array.from({ length: PER }, (_, i) => R0 + (RTIP - R0) * (i / SEG)), u = [0];
  for (let i = 1; i < PER; i++) u.push(u[i - 1] + LEN / SEG / ((rr[i] + rr[i - 1]) / 2));
  return { rr: new Array(NA).fill(rr).flat(), u: new Array(NA).fill(u).flat() };
}
export { SEG };

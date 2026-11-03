/* TENTACLE's arm with mass, no DOM: rod.js's muscles say what shape they ask for; dyn.js makes the arm get there
   through water, with momentum. The root (its first two nodes) is held by the body.

   TONE is how stiff the hydrostat is: an arm is only as rigid as its muscles are tense. Every node has a resting tone
   (the arm holding itself up), plus whatever its muscles are doing (a contracting side stiffens it), unless a preset
   says otherwise: the whip leaves the end of the arm slack so the flick travels down it; limp lets it all go. */
import { build, strainsOf, SEG, LEN, PRESETS } from "./rod.js";
import { makeRod, step, framesOf } from "./dyn.js";

export const G_EFF = 9.81 * (1 - 1000 / 1050); // flesh is 5% denser than water: what's left of gravity
export const ARM = { sub: 8, iters: 1, aMin: 0.0015, aMax: 0.04, bMax: 0.003, kn: 0.2, kt: 0.01, rest: 0.4 };

export function makeArm(d, preset = "rest") {
  const st = strainsOf(d, PRESETS[preset](d, 0)), nodes = build(d, st);
  // (a hair off true, so a limp arm standing straight up falls over rather than balancing forever)
  const rod = makeRod(d, nodes.map((n) => n.x.map((v, c) => v + (c === 0 ? 1e-3 * (n.s || 0) ** 2 : 0))), nodes.map((n) => n.r), { pinned: [0, 1] });
  return { d, rod, st, target: nodes, nodes, tone: new Array(SEG + 1).fill(ARM.rest) };
}
/* the tone a preset asks for at material place s (0 base … 1 tip), given that segment's muscle activity */
export function toneOf(preset, s, st, t) {
  if (preset === "limp") return 0;
  const act = st ? st.mean + Math.hypot(...st.dip) : 0;
  if (preset === "whip") return s < 0.3 ? 1 : 0.06; // a tense base, a slack end: the flick runs out along it
  return Math.min(1, ARM.rest + 0.9 * act);
}
/* one step: the muscles at time t ask for a shape, the arm moves toward it through the water */
export function stepArm(arm, preset, t, dt, opts = {}) {
  const { d, rod } = arm, st = strainsOf(d, PRESETS[preset](d, t)), target = build(d, st);
  const q = target.map((n) => n.x), L = q.slice(1).map((x, i) => Math.hypot(...x.map((v, c) => v - q[i][c])));
  // a thinner, longer arm (squeezed) has the same flesh: the radii follow the muscles; the masses stay
  for (let i = 0; i <= SEG; i++) rod.r[i] = target[i].r;
  const tone = target.map((n, i) => toneOf(preset, n.s ?? i / SEG, st[Math.min(SEG - 1, i)], t)), g = new Array(d).fill(0); g[1] = -(opts.g ?? G_EFF);
  step(rod, dt, { q, L, tone, pins: { 0: q[0], 1: q[1] }, g, kn: ARM.kn, kt: ARM.kt, aMin: ARM.aMin, aMax: ARM.aMax, bMax: ARM.bMax, sub: ARM.sub, iters: ARM.iters, collide: opts.collide ?? true });
  const F = framesOf(rod, target.map((n) => n.F));
  arm.st = st; arm.target = target; arm.tone = tone;
  arm.nodes = rod.x.map((x, i) => ({ x: x.slice(), F: F[i], r: rod.r[i], s: target[i].s ?? i / SEG }));
  return arm;
}
/* speeds: the tip's, and the fastest node's */
export const tipSpeed = (arm) => Math.hypot(...arm.rod.v[arm.rod.N - 1]);
export { SEG, LEN };

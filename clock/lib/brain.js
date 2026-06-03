// Fluoddity brain — verbatim port of fluoddity/engine.js evalRule(). Each
// filament is steered like a fluoddity agent: it senses a shared trail field
// (see trail.js) at two points ahead, feeds the L/R signal through this 10-term
// Fourier brain keyed by rule_seed, and turns by the output. Interaction is
// indirect, through the field they collectively write and read.
//
// The engine's arena path runs the brain with mutation_scale=0, which makes the
// 10 Fourier centers depend only on rule_seed. We exploit that: precompute the
// centers once per frame (brainCenters), then brainEval() is a cheap 10-term sum.
const _f32 = new Float32Array(1), _u32 = new Uint32Array(_f32.buffer);
function f2u(x) { _f32[0] = x; return _u32[0]; }
function pcg(v) {
  const s = (Math.imul(v >>> 0, 747796405) + 2891336453) >>> 0;
  const w = Math.imul((((s >>> ((s >>> 28) + 4)) ^ s) >>> 0), 277803737) >>> 0;
  return ((w >>> 22) ^ w) >>> 0;
}
export function h1(x, y) { return pcg((f2u(x) ^ pcg(f2u(y))) >>> 0) / 4294967295; }
function genCenter(seed, i) {
  const fs = 1 + 2 * Math.pow(h1(seed, i * 8 + 0), 2);
  return {
    f: [(h1(seed, i * 8 + 0) * 2 - 1) * fs, (h1(seed, i * 8 + 1) * 2 - 1) * fs,
        (h1(seed, i * 8 + 2) * 2 - 1) * fs, (h1(seed, i * 8 + 3) * 2 - 1) * fs],
    a: [h1(seed, i * 8 + 4) * 2 - 1, h1(seed, i * 8 + 5) * 2 - 1,
        h1(seed, i * 8 + 6) * 2 - 1, h1(seed, i * 8 + 7) * 2 - 1],
  };
}
// Precompute the 10 Fourier centers + phase offsets for a seed (mut=0 path).
export function brainCenters(seed) {
  const C = [];
  for (let i = 0; i < 10; i++) {
    const c = genCenter(seed, i);
    c.off = 2 * i * 0.6283 + c.a[3] * 3.14159;
    C.push(c);
  }
  return C;
}
// sig = [Lfwd, Llat, Rfwd, Rlat] → [force.x, force.y, strafe.x, strafe.y]
export function brainEval(C, sig) {
  let r0 = 0, r1 = 0, r2 = 0, r3 = 0;
  for (let i = 0; i < 10; i++) {
    const c = C[i], o = c.off;
    const ph = sig[0] * c.f[0] + sig[1] * c.f[1] + sig[2] * c.f[2] + sig[3] * c.f[3];
    r0 += c.a[0] * Math.sin(ph + o);
    r1 += c.a[1] * Math.cos(ph + o * 0.7);
    r2 += c.a[2] * Math.sin(ph * 2 + o * 1.3);
    r3 += c.a[3] * Math.cos(ph * 2 + o * 0.5);
  }
  return [r0, r1, r2, r3];
}

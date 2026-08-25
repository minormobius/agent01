// A JS port of Fluoddity's rule kernel — the 10-term Fourier black box in
// fluoddity/engine.js (FRAG_ENTITY: pcg / h1 / h4 / genCenter / evalRule).
//
// Why port it at all, when fluoddity already runs it on the GPU? Because the
// GPU throws away the thing this surface is about. There, agents write their
// velocity into a texture and the paths are gone by the next frame; the picture
// is a field. Here we want the PATHS — a stroke is a polyline with a beginning,
// a length, a speed profile and a load of ink — so the integration has to happen
// somewhere we can hold onto it. That means CPU, which means a port.
//
// FIDELITY. The hash is bit-exact: h1 reinterprets the bits of a 32-bit float,
// so its inputs are rounded through Math.fround exactly where GLSL would have
// been in single precision. Get that wrong and you are not approximating the
// same black box, you are querying a different one. Downstream arithmetic runs
// in double precision and trig comes from ./trig.js, so results are NOT
// bit-identical to the GPU — no two GPUs agree to the bit either. What is
// guaranteed is that this is the same rule family, and that IT is bit-identical
// across JS engines, which is what a permalink needs.

import { dsin, dcos } from './trig.js';

const f32 = Math.fround;

// Bit reinterpretation, standing in for GLSL floatBitsToUint.
const _fbuf = new Float32Array(1);
const _ubuf = new Uint32Array(_fbuf.buffer);
function bits(x) { _fbuf[0] = x; return _ubuf[0]; }

function pcg(v) {
  const s = (Math.imul(v, 747796405) + 2891336453) >>> 0;
  const w = Math.imul((s >>> ((s >>> 28) + 4)) ^ s, 277803737) >>> 0;
  return ((w >>> 22) ^ w) >>> 0;
}

// h1(vec2) -> [0,1). Inputs must already be f32-exact.
function h1(x, y) {
  return pcg((bits(x) ^ pcg(bits(y))) >>> 0) / 4294967295;
}

// h4(c) = vec4(h1(c), h1(c*-1+5), h1(c.yx-100), h1(c.yx*-1+25))
function h4(cx, cy, out) {
  out[0] = h1(cx, cy);
  out[1] = h1(f32(-cx + 5), f32(-cy + 5));
  out[2] = h1(f32(cy - 100), f32(cx - 100));
  out[3] = h1(f32(-cy + 25), f32(-cx + 25));
  return out;
}

// The ten Fourier centres for one (rule_seed, mutation_scale, cohort). These do
// not depend on the sensor reading, so we build them ONCE per population and
// then every evaluation is ten dot products and forty sines. That single change
// is what makes a CPU port affordable at all.
export function buildCenters(ruleSeed, mut, cohort) {
  const seed = f32(ruleSeed);
  const co = f32(cohort);
  const ms = f32(h1(f32(f32(seed * 1.7) + 3.1), f32(f32(co * 2.3) + 0.7)) + co);
  const F = new Float64Array(40);   // 10 x vec4 frequency
  const A = new Float64Array(40);   // 10 x vec4 amplitude
  const OFF = new Float64Array(10);
  const tmp = new Float64Array(4);
  for (let i = 0; i < 10; i++) {
    const b = i * 8;
    const h = h1(seed, b + 0);
    const fs = 1 + 2 * h * h;
    for (let j = 0; j < 4; j++) F[i * 4 + j] = (h1(seed, b + j) * 2 - 1) * fs;
    for (let j = 0; j < 4; j++) A[i * 4 + j] = h1(seed, b + 4 + j) * 2 - 1;
    // c.a += mut * (-1 + 2*h4(-0.5 + vec2(-i + ms, i)))
    h4(f32(f32(-i + ms) - 0.5), f32(i - 0.5), tmp);
    for (let j = 0; j < 4; j++) A[i * 4 + j] += mut * (-1 + 2 * tmp[j]);
    // c.f *= 1 + mut*0.5*(h1(vec2(ms, i)) - 0.5)
    const fmul = 1 + mut * 0.5 * (h1(ms, i) - 0.5);
    for (let j = 0; j < 4; j++) F[i * 4 + j] *= fmul;
    OFF[i] = 2 * i * 0.6283 + A[i * 4 + 3] * 3.14159;
  }
  return { F, A, OFF };
}

// evalRule(sig) -> vec4, written into `out`. `sig` is the four-component sensor
// reading (left-forward, left-lateral, right-forward, right-lateral).
export function evalRule(c, s0, s1, s2, s3, out) {
  const { F, A, OFF } = c;
  let r0 = 0, r1 = 0, r2 = 0, r3 = 0;
  for (let i = 0; i < 10; i++) {
    const k = i * 4;
    const phase = s0 * F[k] + s1 * F[k + 1] + s2 * F[k + 2] + s3 * F[k + 3];
    const off = OFF[i];
    const p2 = phase * 2;
    r0 += A[k] * dsin(phase + off);
    r1 += A[k + 1] * dcos(phase + off * 0.7);
    r2 += A[k + 2] * dsin(p2 + off * 1.3);
    r3 += A[k + 3] * dcos(p2 + off * 0.5);
  }
  out[0] = r0; out[1] = r1; out[2] = r2; out[3] = r3;
  return out;
}

// resetState from FRAG_ENTITY, for one agent index within a population.
// initial_conditions: 0 = grid, 1 = uniform scatter, 2 = ring.
export function spawn(idx, count, cohorts, init, out) {
  const cv = f32(cohorts * idx / count);
  const jx = 0.019 * (h1(cv, cv) - 0.5);
  const jy = 0.019 * (h1(f32(f32(cv + idx) + 2.142), f32(f32(cv + idx) + 2.142)) - 0.5);
  const vx = 0.00005 * (h1(cv, f32(idx)) * 2 - 1);
  const vy = 0.00005 * (h1(cv, f32(jy)) * 2 - 1);
  let px, py;
  if (init === 1) {
    px = h1(cv, 1) * 2 - 1; py = h1(cv, 2) * 2 - 1;
  } else if (init === 2) {
    const ang = cv / cohorts * 2 * Math.PI;
    px = jx + dcos(ang) * 0.6; py = jy + dsin(ang) * 0.6;
  } else {
    const rows = Math.ceil(Math.sqrt(cohorts));
    const fc = Math.floor(cv);
    const gx = fc % rows, gy = Math.floor(fc / rows);
    px = jx + 1.8 * (gx / rows + 0.5 * (1 / rows - 1));
    py = jy + 1.8 * (gy / rows + 0.5 * (1 / rows - 1));
  }
  out[0] = px; out[1] = py; out[2] = vx; out[3] = vy;
  return out;
}

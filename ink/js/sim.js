// The CPU Fluoddity substrate: one shared trail field, two populations writing
// into it and sensing it, and — the part that does not exist on the GPU — a
// per-step record of every agent's path as drawable stroke segments.
//
// THE LOAD-BEARING INVARIANT. The ink model never touches the dynamics. An
// agent that has run dry keeps moving and keeps depositing into the field
// exactly as before; it simply stops emitting segments. If drawing could feed
// back into the simulation, the headless probe (which measures the FIELD) would
// stop predicting the picture, and the whole roller would be judging one thing
// and showing you another.
//
// The field is toroidal, because agent positions wrap: FRAG_ENTITY ends with
// `pos = 2.0*(fract(pos*0.5 - 0.5) - 0.5)`, so an agent leaving the right edge
// is already sensing the left one.

import { buildCenters, evalRule, spawn } from './rule.js';
import { dsin, dcos } from './trig.js';

// Deposit gain. On the GPU, sensed energy goes as count * brushSize^2 — 40k
// agents splatting ~3px each into a 384^2 field. We run two orders of magnitude
// fewer agents, so each one has to carry proportionally more pigment or the
// field never gets loud enough for the sensors to hear it and every genome
// reads "dead". Calibrated in test/calibrate.mjs against the alive-rate of
// uniformly drawn genomes; see that file for the measurement.
// Total pigment laid into the field per step, summed over ALL agents.
//
// It is expressed as a total, not a per-agent amount, and divided by the live
// agent count at load time. That is what lets the headless probe judge the
// painting: sensed field energy goes as count * deposit, so a probe running 120
// agents and a painting running 768 would otherwise be two different substrates
// and the gate would certify an organism you never get shown. Normalising here
// means agent count controls only how many STROKES you get — never how the
// organism behaves.
//
// Value calibrated in test/calibrate.mjs: it centres the fill distribution of
// uniformly-drawn genomes inside the 0.04..0.55 window fluoddity's fitness bump
// rewards, with the fewest degenerate (dead / frozen) draws.
export let DEPOSIT = 4;
export const REF_COUNT = 768;

// Test-only hook so test/calibrate.mjs can sweep the constant without rewriting
// the file between runs. Nothing in the app calls it.
export function __setDeposit(v) { DEPOSIT = v; }

// 3x3 normalised gaussian. At field=128 the GPU's ~3px splat at 384 is about
// one cell wide, so a 3x3 kernel is the right SHAPE; DEPOSIT supplies the mass.
// Weights are exp(-d^2 / (2*0.85^2)) for d^2 in {0,1,2}, written as decimal
// literals rather than computed: Math.exp is implementation-approximated, and
// a 1-ulp disagreement between engines here would propagate into the feedback
// loop and change the painting. Decimal-to-double parsing IS exactly specified,
// so a literal is portable where a call is not.
const _W0 = 1;
const _W1 = 0.5005531347669073;       // exp(-1/1.445)
const _W2 = 0.25055344072497765;      // exp(-2/1.445)
const K3 = (() => {
  const raw = [_W2, _W1, _W2, _W1, _W0, _W1, _W2, _W1, _W2];
  let sum = 0;
  for (const v of raw) sum += v;
  return raw.map((v) => v / sum);
})();

export const SEG_STRIDE = 8;   // x0,y0,x1,y1,speed,ink,pop,wet

// Wet-pigment memory, per population. This is RENDER-ONLY state — it is
// written by the drawing layer and read by the renderer, and the agent update
// never sees it. That is not an accident: the moment wetness could steer an
// agent, the invariant that lets the probe predict the painting would be gone.
//
// Each drawing agent lays pigment into its OWN population's map; each segment
// records how much of the OTHER population's pigment was already there. That
// is what "bleed into close enough trails" means here — a mark blooms where it
// crosses the other hand's fresh ink, not its own. Decay-only (no diffusion):
// the 3x3 deposit already gives about a three-cell tolerance, which at field
// 128 is ~17px of "close enough" on a 720px sheet, and a blur pass per channel
// per step would cost more than the effect is worth.
export const WET_DECAY = 0.988;
// Maps accumulated pigment to a 0..1 wetness reading. Measured, not guessed:
// the first value here was 0.08 and produced a reading of exactly zero for
// every segment — the effect was invisible and looked like it was working.
// Over 416k segments the raw readings run p50 1.6e-3, p90 1.4e-2, p99 3.3e-2,
// so 30 puts the 99th percentile at 1.0.
//
// The square is the important half. At a linear mapping 85% of all segments
// carry SOME of the other hand's pigment, so bleeding on that reads as a
// global haze rather than as two hands meeting. Squaring drops the median to
// 0.003 — under the renderer's threshold — while leaving the crossings at 1.0,
// so roughly the top tenth of segments bloom and the rest stay crisp.
const WET_SCALE = 30;

export class InkSim {
  constructor(opts = {}) {
    this.F = opts.field || 128;
    this.perPop = opts.agents ? (opts.agents >> 1) : 384;
    this.count = this.perPop * 2;
    const N = this.F * this.F;
    this.field = new Float32Array(N * 2);
    this.next = new Float32Array(N * 2);
    this.dep = new Float32Array(N * 2);
    this.wet = [new Float32Array(N), new Float32Array(N)];
    // agent state, both populations in one flat block
    this.px = new Float64Array(this.count);
    this.py = new Float64Array(this.count);
    this.vx = new Float64Array(this.count);
    this.vy = new Float64Array(this.count);
    this.ink = new Float64Array(this.count);
    // One step can emit at most one segment per agent, but step(n) accumulates
    // across n steps, so this has to grow — sized for one step and doubled on
    // demand. It was originally fixed at one step's worth, which silently
    // DROPPED every stroke past the first `count` whenever the render loop
    // asked for more than one step per frame: the painting quietly lost most of
    // its marks and still looked plausible. Never cap; grow.
    this.seg = new Float32Array(this.count * SEG_STRIDE);
    this.depScale = REF_COUNT / this.count;
    this.segCount = 0;
    this._b = new Float64Array(4);
    this._m = new Float64Array(4);
    this._s = new Float64Array(4);
    this.frame = 0;
  }

  // pops: [genomeA, genomeB]. rand seeds the per-agent ink reserves only —
  // spawn positions come from the genome's own hash, as on the GPU.
  load(pops, rand, inkMul = 1) {
    this.pops = pops;
    this.frame = 0;
    this.field.fill(0); this.next.fill(0); this.dep.fill(0);
    this.wet[0].fill(0); this.wet[1].fill(0);
    this.centers = [];
    for (let p = 0; p < 2; p++) {
      const g = pops[p];
      const per = [];
      // One centre set per cohort. Cohorts are the population's internal
      // variants; precomputing them turns the inner loop into dot products.
      for (let c = 0; c < (g.cohorts | 0); c++) per.push(buildCenters(g.rule_seed, g.mutation_scale, c));
      this.centers.push(per);
      for (let i = 0; i < this.perPop; i++) {
        const idx = p * this.perPop + i;
        spawn(i, this.perPop, g.cohorts | 0, g.initial_conditions | 0, this._s);
        this.px[idx] = this._s[0]; this.py[idx] = this._s[1];
        this.vx[idx] = this._s[2]; this.vy[idx] = this._s[3];
        // Ink reserve, in units of path length. Spread wide so some brushes
        // lay a long thin line and others blot out in a few centimetres —
        // uniform reserves make a picture with no depth to it.
        // r^1.5 via sqrt rather than Math.pow: same skew, exactly specified.
        const r = rand.float();
        this.ink[idx] = (0.4 + 3.9 * (r * Math.sqrt(r))) * (0.45 + 0.11 * (pops[p].ink || 3)) * inkMul;
      }
    }
  }

  // Bilinear read of the toroidal field into out[0..1].
  _sample(x, y, out) {
    const F = this.F;
    let u = (x * 0.5 + 0.5) * F - 0.5;
    let v = (y * 0.5 + 0.5) * F - 0.5;
    let x0 = Math.floor(u), y0 = Math.floor(v);
    const fx = u - x0, fy = v - y0;
    x0 = ((x0 % F) + F) % F; y0 = ((y0 % F) + F) % F;
    const x1 = (x0 + 1) % F, y1 = (y0 + 1) % F;
    const f = this.field;
    const i00 = (y0 * F + x0) * 2, i10 = (y0 * F + x1) * 2;
    const i01 = (y1 * F + x0) * 2, i11 = (y1 * F + x1) * 2;
    const w00 = (1 - fx) * (1 - fy), w10 = fx * (1 - fy), w01 = (1 - fx) * fy, w11 = fx * fy;
    out[0] = f[i00] * w00 + f[i10] * w10 + f[i01] * w01 + f[i11] * w11;
    out[1] = f[i00 + 1] * w00 + f[i10 + 1] * w10 + f[i01 + 1] * w01 + f[i11 + 1] * w11;
  }

  _grow() {
    const bigger = new Float32Array(this.seg.length * 2);
    bigger.set(this.seg);
    this.seg = bigger;
  }

  // Bilinear read of one population's wet-pigment map (toroidal), returned as a
  // 0..1 reading.
  _wetAt(p, x, y) {
    const F = this.F, w = this.wet[p];
    let u = (x * 0.5 + 0.5) * F - 0.5, v = (y * 0.5 + 0.5) * F - 0.5;
    let x0 = Math.floor(u), y0 = Math.floor(v);
    const fx = u - x0, fy = v - y0;
    x0 = ((x0 % F) + F) % F; y0 = ((y0 % F) + F) % F;
    const x1 = (x0 + 1) % F, y1 = (y0 + 1) % F;
    const a = w[y0 * F + x0] * (1 - fx) * (1 - fy) + w[y0 * F + x1] * fx * (1 - fy)
            + w[y1 * F + x0] * (1 - fx) * fy + w[y1 * F + x1] * fx * fy;
    const t = a * WET_SCALE;
    return t >= 1 ? 1 : t * t;
  }

  step(n = 1) {
    this.segCount = 0;
    for (let k = 0; k < n; k++) this._one();
    return this.segCount;
  }

  _one() {
    const F = this.F, N = F * F;
    const dep = this.dep;
    dep.fill(0);
    const s = this._s, b = this._b, m = this._m;

    for (let p = 0; p < 2; p++) {
      const g = this.pops[p];
      const cen = this.centers[p];
      const nc = cen.length;
      const sd = 0.005 * g.sensor_distance;
      const gain = 38.855 * g.sensor_gain;
      const sa = g.sensor_angle * Math.PI;
      const ca = dcos(sa), sna = dsin(sa);
      const gfm = g.global_force_mult, drag = g.drag, strafeP = g.strafe_power;
      const axial = g.axial_force, lateral = g.lateral_force;
      const base = p * this.perPop;

      for (let i = 0; i < this.perPop; i++) {
        const idx = base + i;
        let x = this.px[idx], y = this.py[idx], vx = this.vx[idx], vy = this.vy[idx];
        const cohort = Math.floor(g.cohorts * i / this.perPop) % nc;
        const c = cen[cohort];

        // heading (snorm: zero-length velocity stays zero, as in the shader)
        const vl = Math.sqrt(vx * vx + vy * vy);
        const hx = vl === 0 ? 0 : vx / vl, hy = vl === 0 ? 0 : vy / vl;
        // two sensor offsets, the heading rotated by +/- sensor_angle*PI
        const lox = ca * (hx * sd) + sna * (hy * sd), loy = ca * (hy * sd) - sna * (hx * sd);
        const rox = ca * (hx * sd) - sna * (hy * sd), roy = ca * (hy * sd) + sna * (hx * sd);

        this._sample(x + lox, y + loy, s); const Lx = s[0] * gain, Ly = s[1] * gain;
        this._sample(x + rox, y + roy, s); const Rx = s[0] * gain, Ry = s[1] * gain;

        // into the agent's own frame: forward and left
        const fx = hx, fy = hy, lfx = hy, lfy = -hx;
        const Llf = Lx * fx + Ly * fy, Lll = Lx * lfx + Ly * lfy;
        const Rlf = Rx * fx + Ry * fy, Rll = Rx * lfx + Ry * lfy;

        evalRule(c, Llf, Lll, Rlf, Rll, b);
        // the mirrored evaluation, vec4(yref(Rl), yref(Ll))
        evalRule(c, Rlf, -Rll, Llf, -Lll, m);

        let forceF = b[0] + m[0], forceL = b[1] - m[1];
        let strafeF = b[2] + m[2], strafeL = b[3] - m[3];

        let Fx = fx * forceF * axial + lfx * forceL * lateral;
        let Fy = fy * forceF * axial + lfy * forceL * lateral;
        let Sx = fx * strafeF * axial + lfx * strafeL * lateral;
        let Sy = fy * strafeF * axial + lfy * strafeL * lateral;
        Fx *= gfm / 400; Fy *= gfm / 400;
        Sx *= gfm / 20; Sy *= gfm / 20;

        vx = vx * drag + Fx; vy = vy * drag + Fy;
        let nx = x + vx + Sx * strafeP;
        let ny = y + vy + Sy * strafeP;

        // wrap to [-1,1); remember whether we did, so the stroke can be broken
        const wx = 2 * (frac(nx * 0.5 - 0.5) - 0.5);
        const wy = 2 * (frac(ny * 0.5 - 0.5) - 0.5);
        const wrapped = Math.abs(wx - nx) > 1e-9 || Math.abs(wy - ny) > 1e-9;
        nx = wx; ny = wy;

        // ---- emit a stroke segment (never feeds back into the sim) ----
        const dx = nx - x, dy = ny - y;
        const len = wrapped ? 0 : Math.sqrt(dx * dx + dy * dy);
        const reserve = this.ink[idx];
        if (reserve > 0 && !wrapped && len > 0) {
          const o = this.segCount * SEG_STRIDE;
          if (o + SEG_STRIDE > this.seg.length) this._grow();
          const sg = this.seg;
          sg[o] = x; sg[o + 1] = y; sg[o + 2] = nx; sg[o + 3] = ny;
          sg[o + 4] = len;
          sg[o + 5] = reserve > 1 ? 1 : reserve;   // 0..1 remaining, for the dry tail
          sg[o + 6] = p;
          sg[o + 7] = this._wetAt(1 - p, nx, ny);  // the OTHER hand's wet ink
          this.segCount++;
          this.ink[idx] = reserve - len;
          // lay this agent's own pigment into its population's wet map
          const wm = this.wet[p], wu = (nx * 0.5 + 0.5) * F, wv = (ny * 0.5 + 0.5) * F;
          const wx = Math.floor(wu), wy = Math.floor(wv);
          for (let ddy = -1, k = 0; ddy <= 1; ddy++) {
            const yy = ((wy + ddy) % F + F) % F;
            for (let ddx = -1; ddx <= 1; ddx++, k++) {
              wm[yy * F + ((wx + ddx) % F + F) % F] += K3[k] * len;
            }
          }
        }

        // ---- deposit into the shared field (all agents, ink or not) ----
        let u = (nx * 0.5 + 0.5) * F, v = (ny * 0.5 + 0.5) * F;
        const cx = Math.floor(u), cy = Math.floor(v);
        let w = 0;
        for (let ddy = -1; ddy <= 1; ddy++) {
          const yy = ((cy + ddy) % F + F) % F;
          for (let ddx = -1; ddx <= 1; ddx++, w++) {
            const xx = ((cx + ddx) % F + F) % F;
            const o = (yy * F + xx) * 2, k = K3[w] * DEPOSIT * this.depScale;
            dep[o] += vx * k; dep[o + 1] += vy * k;
          }
        }

        this.px[idx] = nx; this.py[idx] = ny; this.vx[idx] = vx; this.vy[idx] = vy;
      }
    }

    // ---- diffuse + persist, matching FRAG_CANVAS ----
    // Both populations share ONE field, so A's wet deposits steer B. That is
    // the entire reason there are two of them.
    const pers = 0.5 * (this.pops[0].trail_persistence + this.pops[1].trail_persistence);
    const diff = 0.5 * (this.pops[0].trail_diffusion + this.pops[1].trail_diffusion);
    const f = this.field, nx2 = this.next;
    if (diff > 0) {
      // Math.pow is implementation-approximated. K is a per-painting constant,
      // but it feeds a chaotic loop, so quantise to 2^-20: any 1-ulp engine
      // disagreement is rounded away before it can matter. Multiplying and
      // dividing by a power of two, and Math.round, are all exact.
      const Q = 1048576;
      const K = Math.round((4 / (Math.pow(5, diff * diff) - 1)) * Q) / Q;
      const den = 4 + K;
      for (let y = 0; y < F; y++) {
        const yn = ((y + 1) % F) * F, ys = ((y - 1 + F) % F) * F, y0 = y * F;
        for (let x = 0; x < F; x++) {
          const xe = (x + 1) % F, xw = (x - 1 + F) % F;
          const o = (y0 + x) * 2;
          for (let ch = 0; ch < 2; ch++) {
            const acc = f[o + ch] * K + f[(yn + x) * 2 + ch] + f[(ys + x) * 2 + ch]
              + f[(y0 + xe) * 2 + ch] + f[(y0 + xw) * 2 + ch];
            nx2[o + ch] = acc / den;
          }
        }
      }
      for (let i = 0; i < N * 2; i++) f[i] = nx2[i] * pers + (1 - pers) * dep[i];
    } else {
      for (let i = 0; i < N * 2; i++) f[i] = f[i] * pers + (1 - pers) * dep[i];
    }
    const w0 = this.wet[0], w1 = this.wet[1];
    for (let i = 0; i < N; i++) { w0[i] *= WET_DECAY; w1[i] *= WET_DECAY; }
    this.frame++;
  }
}

function frac(x) { return x - Math.floor(x); }

// field.mjs — the trail field the particles paint and then read.
//
// This is the medium the whole thing runs on, and it is what makes the
// simulation a SWARM rather than N independent agents: nobody sees anybody
// else, everyone only sees the field, and the field is everybody's deposits
// decaying together. That is stigmergy, and it is why a per-particle decision
// can produce a global structure at all.
//
// Ported from fluoddity's canvas pass: particles splat colour, the field
// decays by `trail_persistence` and blurs by `trail_diffusion` each step, and
// the sensors read the R and G channels bilinearly. RGB is kept rather than a
// single density, because the sensor reads TWO channels and collapsing them
// would make the left/right signal degenerate — the particle would be blind
// to exactly the asymmetry it steers on.

const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);

export class Field {
  /** Coordinates are fluoddity's: the torus is [-1, 1] in both axes. */
  constructor(dim = 128, cfg = {}) {
    this.dim = dim;
    this.rgb = new Float32Array(dim * dim * 3);
    this.tmp = new Float32Array(dim * dim * 3);
    this.persistence = cfg.trail_persistence ?? 0.93;
    this.diffusion = cfg.trail_diffusion ?? 0.6;
    this.ink = cfg.ink ?? 2.0;
    this.brush = cfg.brush ?? 0.02;
    // NOT ported, CALIBRATED — see the note in swarm/CLAUDE.md. The GPU blends
    // alpha into an 8-bit canvas; this accumulates float. There is no constant
    // to carry across, so it is fitted ONCE so the deterministic arm lands in
    // fluoddity's own healthy band, then frozen for every arm.
    this.inkScale = cfg.inkScale ?? 0.06;
  }

  /** Wrap an index onto the torus — the field has no edges, like the sim. */
  _i(x, y) {
    const d = this.dim;
    return (((y % d) + d) % d) * d + (((x % d) + d) % d);
  }

  /** Bilinear read of (R, G) at a world point, wrapping. */
  sample(wx, wy) {
    const d = this.dim;
    const u = (wx * 0.5 + 0.5) * d - 0.5, v = (wy * 0.5 + 0.5) * d - 0.5;
    const x0 = Math.floor(u), y0 = Math.floor(v);
    const fx = u - x0, fy = v - y0;
    let r = 0, g = 0;
    for (const [dx, dy, w] of [[0, 0, (1 - fx) * (1 - fy)], [1, 0, fx * (1 - fy)],
      [0, 1, (1 - fx) * fy], [1, 1, fx * fy]]) {
      const i = this._i(x0 + dx, y0 + dy) * 3;
      r += this.rgb[i] * w; g += this.rgb[i + 1] * w;
    }
    return [r, g];
  }

  /**
   * Deposit one particle's colour with a gaussian falloff, matching the
   * shader's `exp(-r2 * 14.0)` point sprite.
   */
  deposit(wx, wy, col) {
    const d = this.dim;
    const u = (wx * 0.5 + 0.5) * d, v = (wy * 0.5 + 0.5) * d;
    const rad = Math.max(1, Math.round(this.brush * d));
    for (let dy = -rad; dy <= rad; dy++) {
      for (let dx = -rad; dx <= rad; dx++) {
        const r2 = (dx * dx + dy * dy) / (rad * rad * 4);
        if (r2 > 0.25) continue;
        const a = Math.exp(-r2 * 14) * this.ink * this.inkScale;
        const i = this._i(Math.floor(u) + dx, Math.floor(v) + dy) * 3;
        this.rgb[i] += col[0] * a; this.rgb[i + 1] += col[1] * a; this.rgb[i + 2] += col[2] * a;
      }
    }
  }

  /** Decay then blur, in that order, as the canvas pass does. */
  settle() {
    const d = this.dim, n = d * d, k = this.persistence;
    for (let i = 0; i < n * 3; i++) this.rgb[i] *= k;
    const w = clamp01(this.diffusion / 2);
    if (w <= 0) return;
    // A 4-neighbour blur, weight `w` toward the neighbourhood mean.
    for (let y = 0; y < d; y++) {
      for (let x = 0; x < d; x++) {
        const o = (y * d + x) * 3;
        for (let c = 0; c < 3; c++) {
          const s = this.rgb[this._i(x + 1, y) * 3 + c] + this.rgb[this._i(x - 1, y) * 3 + c]
            + this.rgb[this._i(x, y + 1) * 3 + c] + this.rgb[this._i(x, y - 1) * 3 + c];
          this.tmp[o + c] = this.rgb[o + c] * (1 - w) + (s / 4) * w;
        }
      }
    }
    this.rgb.set(this.tmp);
  }

  /**
   * The 64² luminance downsample the descriptors read.
   *
   * fluoddity does this with `drawImage` to a 64² canvas, which box-filters;
   * this averages the same blocks, and clamps to [0,1] because a canvas does.
   * The descriptors that consume it are fluoddity's own, unchanged.
   */
  probeLum(PROBE = 64) {
    const d = this.dim, out = new Float32Array(PROBE * PROBE);
    const s = d / PROBE;
    for (let py = 0; py < PROBE; py++) {
      for (let px = 0; px < PROBE; px++) {
        let acc = 0, n = 0;
        for (let y = Math.floor(py * s); y < Math.floor((py + 1) * s); y++) {
          for (let x = Math.floor(px * s); x < Math.floor((px + 1) * s); x++) {
            const i = (y * d + x) * 3;
            acc += 0.2126 * clamp01(this.rgb[i]) + 0.7152 * clamp01(this.rgb[i + 1])
              + 0.0722 * clamp01(this.rgb[i + 2]);
            n++;
          }
        }
        out[py * PROBE + px] = n ? acc / n : 0;
      }
    }
    return out;
  }
}

/** HSV→RGB, as the particle vertex shader colours its splat. */
export function hsv2rgb(h, s, v) {
  const f = (n) => { const k = (n + h * 6) % 6; return v - v * s * Math.max(0, Math.min(k, 4 - k, 1)); };
  return [f(5), f(3), f(1)];
}

// field.mjs — the trail field the particles paint and then read.
//
// This is the medium the whole thing runs on, and it is what makes the
// simulation a SWARM rather than N independent agents: nobody sees anybody
// else, everyone only sees the field, and the field is everybody's deposits
// decaying together. That is stigmergy, and it is why a per-particle decision
// can produce a global structure at all.
//
// ─────────────────────────────────────────────────────────────────────────────
// THE FIRST VERSION OF THIS FILE WAS NOT FLUODDITY'S FIELD. It was rewritten
// against `FRAG_BRUSH` / `FRAG_CANVAS` / `FRAG_DISPLAY` in
// `fluoddity/engine.js` after the operator said, for the third time, that the
// control arm did not look like fluoddity. It did not, and this is why:
//
//   1. THE CANVAS HOLDS VELOCITY, NOT COLOUR. `FRAG_BRUSH` writes
//      `vec4(v_vel*k, 0, 0)` — the particle's own velocity vector. The old
//      port invented a colour (`hsv2rgb` of `atan2` of the brain's force
//      output) and deposited that. The sensors then read R and G of a hue
//      pattern rather than a velocity field, so the signal the swarm steers on
//      was a different quantity in a different unit. Everything downstream of
//      that — every descriptor, every arm, every published number — was
//      measured on a medium fluoddity does not have.
//
//   2. THE BLEND IS A LERP, NOT AN ACCUMULATION.
//      `canvas = blur(canvas)*persistence + (1 - persistence)*brush`.
//      The old port multiplied by persistence and ADDED the deposit, which is
//      unbounded, in no particular unit, and needed a fudge factor to sit in a
//      plausible range. That fudge factor is the `inkScale` this page has been
//      calling "one constant calibrated rather than ported". IT IS GONE. With
//      the right blend there is nothing to calibrate: both sides of the lerp
//      are velocities and the field is in the units the sensors expect.
//
//   3. `ink` IS RENDER-ONLY. In fluoddity `u_ink` appears in `FRAG_DISPLAY`
//      and nowhere else — the playground's own config even files it under
//      "// render-only". The old port put it in the deposit, where it changed
//      the physics. Two genomes differing only in `ink` are the same organism
//      photographed at two exposures; the old port made them different
//      organisms.
//
//   4. THE DIFFUSION KERNEL IS NOT A LINEAR BLEND toward the neighbourhood
//      mean. It is `(c*K + n+s+e+w)/(4+K)` with `K = 4/(5^(d²) - 1)`, and it
//      runs BEFORE the persistence lerp, not after the decay.
//
// What the descriptors read changed with it. `fluoddity/descriptors.js` reads
// the DISPLAYED canvas through `drawImage` — the tone-mapped image a person
// looks at — so `displayRGB()` below applies `FRAG_DISPLAY` and `probeLum`
// reads that. Reading the raw trail instead, as the old port did, measured
// fill and structure on a picture nobody ever sees.
//
// fluoddity is owned by another branch. This is read from it, never written to
// it, and `assertNoDrift` in the selftest fails loudly if its source moves.

const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);

/**
 * fluoddity's own brush size: a clip-space half-width that works out to a
 * CONSTANT ~1.54 px radius at any `dim`, because `0.0015·(1024/dim)·2` cancels
 * the `dim/2` that converts clip to pixels. `substrate` is fluoddity's own
 * multiplier on it (`setSubstrate`), and `matchSubstrate` below is fluoddity's
 * own normalisation, not ours.
 */
export const baseBrushFor = (dim) => 0.0015 * (1024 / dim) * 2;

/**
 * `viewcontrols.js`: `sqrt(M_REF / (count · baseBrush²))`, where M_REF = 1.8 is
 * the playground's reference field energy. This is how fluoddity makes one
 * organism read at the same energy on a surface with a different particle
 * count — exactly our problem, already solved upstream.
 */
export const matchSubstrate = (dim, count, M_REF = 1.8) => {
  const b = baseBrushFor(dim);
  return Math.sqrt(M_REF / (count * b * b));
};

export class Field {
  /** Coordinates are fluoddity's: the torus is [-1, 1] in both axes. */
  constructor(dim = 128, cfg = {}) {
    this.dim = dim;
    // Two channels, because the canvas is a VELOCITY field.
    this.canvas = new Float32Array(dim * dim * 2);
    this.brush = new Float32Array(dim * dim * 2);
    this.tmp = new Float32Array(dim * dim * 2);
    this.persistence = cfg.trail_persistence ?? 0.95;
    this.diffusion = cfg.trail_diffusion ?? 0.6;
    this.ink = cfg.ink ?? 3.0;          // render-only, kept for displayRGB
    this.hue = cfg.hue ?? 0.0;          // render-only
    this.substrate = cfg.substrate ?? 1;
    this.brushSize = baseBrushFor(dim) * this.substrate;   // clip half-width
  }

  /** Wrap an index onto the torus — the field has no edges, like the sim. */
  _i(x, y) {
    const d = this.dim;
    return (((y % d) + d) % d) * d + (((x % d) + d) % d);
  }

  /** Bilinear read of the velocity at a world point, wrapping. */
  sample(wx, wy) {
    const d = this.dim;
    const u = (wx * 0.5 + 0.5) * d - 0.5, v = (wy * 0.5 + 0.5) * d - 0.5;
    const x0 = Math.floor(u), y0 = Math.floor(v);
    const fx = u - x0, fy = v - y0;
    let r = 0, g = 0;
    for (const [dx, dy, w] of [[0, 0, (1 - fx) * (1 - fy)], [1, 0, fx * (1 - fy)],
      [0, 1, (1 - fx) * fy], [1, 1, fx * fy]]) {
      const i = this._i(x0 + dx, y0 + dy) * 2;
      r += this.canvas[i] * w; g += this.canvas[i + 1] * w;
    }
    return [r, g];
  }

  /** The brush target is cleared every step, as its framebuffer is. */
  clearBrush() { this.brush.fill(0); }

  /**
   * One particle's splat: its VELOCITY, gaussian-weighted, added into the
   * brush target. Additive because the brush pass draws with
   * `blendFunc(ONE, ONE)`.
   *
   * `FRAG_BRUSH`: `d = v_uv - 0.5; if(dot(d,d) > 0.25) discard;
   *                k = exp(-dot(d,d)/(2*0.163²)); o = vec4(v_vel*k, 0, 0);`
   * The quad spans `±brushSize` in clip space, so in pixels its half-width is
   * `R = brushSize·dim/2`, `d = offset/(2R)`, and the discard test is exactly
   * "outside a circle of radius R".
   */
  splat(wx, wy, vx, vy) {
    const d = this.dim;
    const R = this.brushSize * d / 2;
    const cx = (wx * 0.5 + 0.5) * d, cy = (wy * 0.5 + 0.5) * d;
    const ix = Math.floor(cx), iy = Math.floor(cy);
    const r = Math.ceil(R);
    const inv = 1 / (2 * 0.163 * 0.163);
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        const q = (dx * dx + dy * dy) / (4 * R * R);
        if (q > 0.25) continue;
        const k = Math.exp(-q * inv);
        const i = this._i(ix + dx, iy + dy) * 2;
        this.brush[i] += vx * k; this.brush[i + 1] += vy * k;
      }
    }
  }

  /**
   * `FRAG_CANVAS`, exactly: blur the canvas, then lerp toward the brush.
   *
   *   K = 4/(5^(diffusion²) - 1);  blur = (c*K + n+s+e+w)/(4+K)
   *   canvas = blur*persistence + (1 - persistence)*brush
   */
  settle() {
    const d = this.dim, n = d * d, p = this.persistence;
    const src = this.canvas, dst = this.tmp;
    if (this.diffusion > 0) {
      const dd = this.diffusion * this.diffusion;
      const K = 4 / (Math.pow(5, dd) - 1);
      const denom = 4 + K;
      for (let y = 0; y < d; y++) {
        for (let x = 0; x < d; x++) {
          const o = (y * d + x) * 2;
          for (let c = 0; c < 2; c++) {
            const s = src[this._i(x, y + 1) * 2 + c] + src[this._i(x, y - 1) * 2 + c]
              + src[this._i(x + 1, y) * 2 + c] + src[this._i(x - 1, y) * 2 + c];
            dst[o + c] = (src[o + c] * K + s) / denom;
          }
        }
      }
    } else {
      dst.set(src);
    }
    for (let i = 0; i < n * 2; i++) src[i] = dst[i] * p + (1 - p) * this.brush[i];
  }

  /**
   * `FRAG_DISPLAY` — the image fluoddity's descriptors actually read.
   *
   *   hue = fract(atan2(v.y, v.x)/2π + u_hue)
   *   col = hsv2rgb(hue, 0.78, |v|) * ink * 8
   *   col /= pow(|col|, 0.575)                 // gamma-ish knee
   *   col *= 2·asinh(|col|·3.9)/(|col|·3.9)    // soft shoulder
   */
  displayRGB(out = null) {
    const d = this.dim, n = d * d;
    const px = out || new Float32Array(n * 3);
    const SOFT = 3.9, BRIGHT = 2.0, ink8 = this.ink * 8;
    for (let i = 0; i < n; i++) {
      const vx = this.canvas[i * 2], vy = this.canvas[i * 2 + 1];
      const mag = Math.hypot(vx, vy);
      const hue = ((Math.atan2(vy, vx) / (2 * Math.PI) + this.hue) % 1 + 1) % 1;
      let [r, g, b] = hsv2rgb(hue, 0.78, mag);
      r *= ink8; g *= ink8; b *= ink8;
      let len = Math.hypot(r, g, b);
      if (len > 0) { const k = Math.pow(len, 0.575); r /= k; g /= k; b /= k; }
      const L = Math.hypot(r, g, b);
      if (L > 0) { const k = BRIGHT * Math.asinh(L * SOFT) / (L * SOFT); r *= k; g *= k; b *= k; }
      px[i * 3] = r; px[i * 3 + 1] = g; px[i * 3 + 2] = b;
    }
    return px;
  }

  /**
   * The 64² luminance downsample the descriptors read.
   *
   * fluoddity does this with `drawImage` from the DISPLAYED canvas to a 64²
   * canvas, which box-filters and clamps to 8-bit; this averages the same
   * blocks off `displayRGB()` and clamps to [0,1] because a canvas does. The
   * descriptors that consume it are fluoddity's own, unchanged.
   */
  probeLum(PROBE = 64) {
    const d = this.dim, out = new Float32Array(PROBE * PROBE);
    const rgb = this.displayRGB(this._disp || (this._disp = new Float32Array(d * d * 3)));
    const s = d / PROBE;
    for (let py = 0; py < PROBE; py++) {
      for (let px = 0; px < PROBE; px++) {
        let acc = 0, n = 0;
        for (let y = Math.floor(py * s); y < Math.floor((py + 1) * s); y++) {
          for (let x = Math.floor(px * s); x < Math.floor((px + 1) * s); x++) {
            const i = (y * d + x) * 3;
            acc += 0.2126 * clamp01(rgb[i]) + 0.7152 * clamp01(rgb[i + 1])
              + 0.0722 * clamp01(rgb[i + 2]);
            n++;
          }
        }
        out[py * PROBE + px] = n ? acc / n : 0;
      }
    }
    return out;
  }
}

/** HSV→RGB, as `FRAG_DISPLAY` does it. */
export function hsv2rgb(h, s, v) {
  const f = (n) => { const k = (n + h * 6) % 6; return v - v * s * Math.max(0, Math.min(k, 4 - k, 1)); };
  return [f(5), f(3), f(1)];
}

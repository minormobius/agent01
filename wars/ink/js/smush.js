// smush.js — simulate the fold: wet ink squeezed between two sheets.
//
// Folding paper over wet ink is a Hele-Shaw cell. Under lubrication theory the
// film flux goes like h³·∇p and pressure rises with thickness, so ink is driven
// from thick puddles into thin surrounds — and the front is unstable (Saffman–
// Taylor), breaking into the tendrils that make inkblots look like inkblots.
//
// Pipeline: coalesce the seed into wet PUDDLES (blur), then run a mass-conserving
// thin-film flux on a half-res grid (mobility ∝ h^exp -> thick flows, thin pools;
// modulated by static value-noise so the front fingers), then upsample. Cheap
// (half-res, smooth) and deterministic from its own rng.
// spread(seed, W, H, rng, params) -> Float32 thickness field (0..1).
(function (g) {
  function valueNoise(W, H, rng, scale) {
    const gw = Math.max(2, (W / scale) | 0), gh = Math.max(2, (H / scale) | 0);
    const grid = new Float32Array(gw * gh);
    for (let i = 0; i < grid.length; i++) grid[i] = rng();
    const out = new Float32Array(W * H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const fx = x / scale, fy = y / scale;
      const x0 = Math.min(gw - 1, fx | 0), y0 = Math.min(gh - 1, fy | 0);
      const x1 = Math.min(gw - 1, x0 + 1), y1 = Math.min(gh - 1, y0 + 1);
      const dx = fx - x0, dy = fy - y0;
      const a = grid[y0 * gw + x0], b = grid[y0 * gw + x1], c = grid[y1 * gw + x0], d = grid[y1 * gw + x1];
      out[y * W + x] = a * (1 - dx) * (1 - dy) + b * dx * (1 - dy) + c * (1 - dx) * dy + d * dx * dy;
    }
    return out;
  }
  function blur1(h, W, H) {
    const t = new Float32Array(h.length);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = y * W + x; let s = h[i], n = 1;
      if (x > 0) { s += h[i - 1]; n++; } if (x < W - 1) { s += h[i + 1]; n++; }
      if (y > 0) { s += h[i - W]; n++; } if (y < H - 1) { s += h[i + W]; n++; }
      t[i] = s / n;
    }
    return t;
  }

  function sample(f, W, H, x, y) {
    if (x < 0 || y < 0 || x > W - 1 || y > H - 1) return 0;
    const x0 = x | 0, y0 = y | 0, x1 = Math.min(W - 1, x0 + 1), y1 = Math.min(H - 1, y0 + 1);
    const dx = x - x0, dy = y - y0;
    const a = f[y0 * W + x0], b = f[y0 * W + x1], c = f[y1 * W + x0], d = f[y1 * W + x1];
    return a * (1 - dx) * (1 - dy) + b * dx * (1 - dy) + c * (1 - dx) * dy + d * dx * dy;
  }

  function spread(seed, W, H, rng, P) {
    P = P || {};
    // coalesce thin strokes into wet puddles (keep them bold)
    let cur = Float32Array.from(seed);
    for (let k = 0; k < (P.puddle != null ? P.puddle : 2); k++) cur = blur1(cur, W, H);

    // ink centroid -> outward "pressure" direction
    let cx = 0, cy = 0, mass = 0;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const v = cur[y * W + x]; if (v > 0.05) { cx += x * v; cy += y * v; mass += v; } }
    cx = mass ? cx / mass : W / 2; cy = mass ? cy / mass : H / 2;

    // flow fields: large-scale swirl (vx,vy) + finer tendril modulation
    const vx = valueNoise(W, H, rng, P.swirl || 60);
    const vy = valueNoise(W, H, rng, P.swirl || 60);
    const fine = valueNoise(W, H, rng, P.fine || 13);

    // iteratively advect ink along the flow: backward-sample out[p] = in[p - disp]
    // moves ink toward +disp (outward + swirl) -> marbled tendrils, the squish.
    const passes = P.passes || 7, amp = P.amp || 3.0, rad = P.radial != null ? P.radial : 0.55;
    for (let it = 0; it < passes; it++) {
      const out = new Float32Array(W * H);
      for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
          const i = y * W + x;
          const swx = vx[i] - 0.5, swy = vy[i] - 0.5;
          let rx = x - cx, ry = y - cy; const rl = Math.hypot(rx, ry) || 1; rx /= rl; ry /= rl;
          const fb = 0.55 + (fine[i] - 0.5);          // fingered radial push
          const dx = amp * (2 * swx + rad * rx * fb);
          const dy = amp * (2 * swy + rad * ry * fb);
          out[i] = sample(cur, W, H, x - dx, y - dy);
        }
      }
      cur = blur1(out, W, H);                          // mild cohesion between passes
    }

    let max = 0;
    for (let i = 0; i < cur.length; i++) if (cur[i] > max) max = cur[i];
    if (max > 0) { const inv = 1 / max; for (let i = 0; i < cur.length; i++) cur[i] = Math.pow(cur[i] * inv, 0.75); }
    return cur;
  }

  g.INKSMUSH = { spread };
})(typeof globalThis !== "undefined" ? globalThis : this);

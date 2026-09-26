// draw.js — an avatar drawn as light on a 2D canvas: points summed into a float buffer, each streak a
// continuous thread (splats between its samples), a glow computed in JS (a canvas-scaled blur cost up to
// 200 ms a frame on a software canvas: see studio/descending), tone-mapped on the brightest channel so a
// colour stays its colour however bright. `makeLight(w, h)` → { splat, flush(ctx), box }.
import { place } from './avatar.js';

export function makeLight(w, h, q = w * h > 6e5 ? 0.5 : 1) {
  const LW = Math.ceil(w * q), LH = Math.ceil(h * q), acc = new Float32Array(LW * LH * 3);
  const GW = Math.ceil(LW / 4) + 2, GH = Math.ceil(LH / 4) + 2, G = new Float32Array(GW * GH * 3), G2 = new Float32Array(GW * GH * 3);
  const mk = (a, b) => (typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(a, b) : Object.assign(document.createElement('canvas'), { width: a, height: b }));
  const lc = mk(LW, LH), lctx = lc.getContext('2d'), img = lctx.createImageData(LW, LH);
  let x0 = LW, x1 = -1, y0 = LH, y1 = -1;
  function splat(x, y, r, g, b) {
    x *= q; y *= q;
    if (!(x >= 0 && y >= 0 && x < LW - 1 && y < LH - 1)) return;
    const ix = x | 0, iy = y | 0, fx = x - ix, fy = y - iy, w00 = (1 - fx) * (1 - fy), w10 = fx * (1 - fy), w01 = (1 - fx) * fy, w11 = fx * fy;
    if (ix < x0) x0 = ix; if (ix + 1 > x1) x1 = ix + 1; if (iy < y0) y0 = iy; if (iy + 1 > y1) y1 = iy + 1;
    let o = (iy * LW + ix) * 3;
    acc[o] += r * w00; acc[o + 1] += g * w00; acc[o + 2] += b * w00; acc[o + 3] += r * w10; acc[o + 4] += g * w10; acc[o + 5] += b * w10;
    o += LW * 3;
    acc[o] += r * w01; acc[o + 1] += g * w01; acc[o + 2] += b * w01; acc[o + 3] += r * w11; acc[o + 4] += g * w11; acc[o + 5] += b * w11;
    const c = ((iy >> 2) * GW + (ix >> 2)) * 3; G[c] += r; G[c + 1] += g; G[c + 2] += b;
  }
  function flush(ctx, glow = 0.06) {
    if (x1 < 0) return;
    const gx0 = Math.max(0, (x0 >> 2) - 2), gx1 = Math.min(GW - 1, (x1 >> 2) + 2), gy0 = Math.max(0, (y0 >> 2) - 2), gy1 = Math.min(GH - 1, (y1 >> 2) + 2);
    for (const [src, dst, dx, dy] of [[G, G2, 3, 0], [G2, G, 0, 3 * GW]]) {
      for (let y = gy0; y <= gy1; y++) for (let x = gx0; x <= gx1; x++) {
        const o = (y * GW + x) * 3;
        for (let c = 0; c < 3; c++) {
          let v = src[o + c] * 0.4;
          for (const [k, wt] of [[1, 0.2], [2, 0.1]]) { const a = o - k * (dx + dy) + c, b = o + k * (dx + dy) + c; if (a >= 0) v += src[a] * wt; if (b < src.length) v += src[b] * wt; }
          dst[o + c] = v;
        }
      }
    }
    const bx0 = Math.max(0, gx0 * 4), bx1 = Math.min(LW - 1, gx1 * 4 + 3), by0 = Math.max(0, gy0 * 4), by1 = Math.min(LH - 1, gy1 * 4 + 3), d = img.data, R = GW * 3;
    for (let y = by0; y <= by1; y++) {
      const gy = Math.min(GH - 2, Math.max(0, (y - 2) / 4)), iy = gy | 0, fy = gy - iy;
      for (let x = bx0, i = (y * LW + bx0) * 3, j = (y * LW + bx0) * 4; x <= bx1; x++, i += 3, j += 4) {
        const gx = Math.min(GW - 2, Math.max(0, (x - 2) / 4)), ix = gx | 0, fx = gx - ix, o = (iy * GW + ix) * 3;
        const w00 = (1 - fx) * (1 - fy), w10 = fx * (1 - fy), w01 = (1 - fx) * fy, w11 = fx * fy;
        const r = acc[i] + glow * (G[o] * w00 + G[o + 3] * w10 + G[o + R] * w01 + G[o + R + 3] * w11);
        const g = acc[i + 1] + glow * (G[o + 1] * w00 + G[o + 4] * w10 + G[o + R + 1] * w01 + G[o + R + 4] * w11);
        const b = acc[i + 2] + glow * (G[o + 2] * w00 + G[o + 5] * w10 + G[o + R + 2] * w01 + G[o + R + 5] * w11);
        const mx = Math.max(r, g, b), k = 255 / (1 + mx), wh = mx > 3 ? Math.min(0.5, (mx - 3) * 0.08) * 255 : 0;
        d[j] = r * k + wh; d[j + 1] = g * k + wh; d[j + 2] = b * k + wh; d[j + 3] = 255;
        acc[i] = 0; acc[i + 1] = 0; acc[i + 2] = 0;
      }
    }
    for (let y = gy0; y <= gy1; y++) { G.fill(0, (y * GW + gx0) * 3, (y * GW + gx1 + 1) * 3); G2.fill(0, (y * GW + gx0) * 3, (y * GW + gx1 + 1) * 3); }
    lctx.clearRect(0, 0, LW, LH);
    lctx.putImageData(img, 0, 0, bx0, by0, bx1 - bx0 + 1, by1 - by0 + 1);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.drawImage(lc, bx0, by0, bx1 - bx0 + 1, by1 - by0 + 1, bx0 / q, by0 / q, (bx1 - bx0 + 1) / q, (by1 - by0 + 1) / q);
    ctx.restore();
    x0 = LW; x1 = -1; y0 = LH; y1 = -1;
  }
  return { splat, flush };
}

/**
 * Lay an avatar's light into `light` at time t: `F` its parts' frames (avatar.js frames), `proj` world →
 * canvas pixels, `gain` overall brightness. Each streak is a thread: `sub` splats between samples.
 */
export function drawAvatar(light, A, F, t, proj, { gain = 1, sub = 3, m = A.ch.thought } = {}) {
  const tmp = [0, 0, 0], ch = A.ch, n = ch.streak, per = gain * (ch.style === 'threads' ? 0.22 : ch.style === 'dust' ? 0.5 : 0.3);
  for (let i = 0; i < A.points.length; i++) {
    const col = A.colours[A.points[i].part];
    let px = 0, py = 0;
    for (let j = 0; j < n; j++) {
      place(A, i, F, t, m, tmp, j * ch.lagStep);
      const s = proj(tmp), b = per * (1 - j / n);
      if (j && sub > 1 && Math.abs(s[0] - px) + Math.abs(s[1] - py) < 60) {
        for (let k = 1; k < sub; k++) { const f = k / sub; splat(light, px + (s[0] - px) * f, py + (s[1] - py) * f, col, b); }
      }
      splat(light, s[0], s[1], col, b);
      px = s[0]; py = s[1];
    }
  }
}
const splat = (L, x, y, c, b) => L.splat(x, y, c[0] * b, c[1] * b, c[2] * b);

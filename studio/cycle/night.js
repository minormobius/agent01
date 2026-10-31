// night.js — the real sky over a painting: stars, the moon in its phase, constellation figures.
//
// Drawn into the RGBA frame after the palette, onto sky pixels only (a cloud hides a star; the
// range hides what has set). Positions come from astro.js for the moment and the place; the
// painting's projection is scene.js's `project`.
import { STARS, N, LINES } from './stars.js';
import { enu, starColour } from './astro.js';
import { project, W, H } from './scene.js';

const D = Math.PI / 180;
const COLOURS = Array.from({ length: N }, (_, i) => starColour(STARS[i * 4 + 3]));
const TW = Array.from({ length: N }, (_, i) => [3 + ((i * 2654435761) >>> 0) % 5000 / 1000, (i * 0.618) % 1 * 6.28]);

const blend = (px, i, c, a) => {
  if (a <= 0) return;
  const k = i * 4;
  px[k] = px[k] + (c[0] * 255 - px[k]) * Math.min(1, a);
  px[k + 1] = px[k + 1] + (c[1] * 255 - px[k + 1]) * Math.min(1, a);
  px[k + 2] = px[k + 2] + (c[2] * 255 - px[k + 2]) * Math.min(1, a);
};
const add = (px, i, c, a) => { const k = i * 4; px[k] += c[0] * 255 * a; px[k + 1] += c[1] * 255 * a; px[k + 2] += c[2] * 255 * a; };

/**
 * Draw the night into `px` (RGBA Uint8ClampedArray, W×H: it saturates by itself). `night` 0..1 is how dark the sky is. `flare` (optional):
 * { k, amount } brightens the k-th visible star (the music's bells). Returns the visible stars.
 */
export function drawNight(px, scene, view, sk, t, { night = 1, figures = false, flare = null, cover = 1, overcast = 0 } = {}) {
  const { layer, LAYER } = scene, yH = scene.yH;
  // a cloud hides what is behind it in proportion to the day's cover
  const seen = (x, y) => (x >= 0 && x < W && y >= 0 && y < yH ? (layer[y * W + x] === LAYER.sky ? 1 : layer[y * W + x] === LAYER.cloud ? 1 - cover : 0) : 0);
  const skyPx = (x, y) => seen(x, y) > 0.05;
  const visible = [];
  if (night > 0.01) {
    if (figures) for (const poly of LINES) {
      let prev = null;
      for (let j = 0; j < poly.length; j += 2) {
        const p = sk.place(poly[j], poly[j + 1]);
        const q = p.alt > 0 ? project(scene, view, p.alt, p.az) : null;
        if (q && prev && q[0] === q[0] && prev[0] === prev[0] && Math.abs(q[0] - prev[0]) < W / 2) line(px, prev, q, skyPx, [0.55, 0.7, 1], 0.22 * night);
        prev = q;
      }
    }
    for (let i = 0; i < N; i++) {
      const mag = STARS[i * 4 + 2];
      const p = sk.place(STARS[i * 4], STARS[i * 4 + 1]);
      if (p.alt <= 0.5) continue;
      const [fx, fy] = project(scene, view, p.alt, p.az), x = Math.round(fx), y = Math.round(fy);
      if (!skyPx(x, y)) continue;
      visible.push(i);
      // brightness: a magnitude curve, dimmed by the night's darkness and by air near the horizon
      const ext = Math.min(1, (p.alt - 0.5) / 12);
      let a = Math.pow(Math.max(0, (6.5 - mag) / 5), 1.5) * night * (0.3 + 0.7 * ext) * 1.6 * seen(x, y);
      const tw = TW[i];
      a *= 1 + (0.18 + 0.3 * (1 - ext)) * Math.sin(t * tw[0] + tw[1]);
      if (flare && visible.length - 1 === flare.k) a += flare.amount * 1.4;
      add(px, y * W + x, COLOURS[i], a);
      if (mag < 2.6 || (flare && visible.length - 1 === flare.k && flare.amount > 0.2)) {
        const s = a * (mag < 1 ? 0.5 : 0.28);
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (skyPx(x + dx, y + dy)) add(px, (y + dy) * W + x + dx, COLOURS[i], s);
        if (mag < 0.6) for (const [dx, dy] of [[2, 0], [-2, 0], [0, 2], [0, -2]]) if (skyPx(x + dx, y + dy)) add(px, (y + dy) * W + x + dx, COLOURS[i], s * 0.35);
      }
    }
  }
  // the moon: a disc in its true phase, lit from the sun's side; dimmed through cloud
  if (sk.moon.alt > -1) {
    const [mx, my] = project(scene, view, sk.moon.alt, sk.moon.az);
    if (mx > -10 && mx < W + 10 && my > -10) {
      const vm = enu(sk.moon.alt, sk.moon.az), vs = enu(sk.sun.alt, sk.sun.az);
      const dot = vm[0] * vs[0] + vm[1] * vs[1] + vm[2] * vs[2];
      const E = Math.acos(Math.max(-1, Math.min(1, dot)));               // elongation
      // the sun's direction on the canvas, seen from the moon: a small step along the great circle
      const tv = [vs[0] - dot * vm[0], vs[1] - dot * vm[1], vs[2] - dot * vm[2]], tl = Math.hypot(...tv) || 1;
      const w = vm.map((c, k) => c + 0.02 * tv[k] / tl), wl = Math.hypot(...w);
      const alt2 = Math.asin(w[2] / wl) / D, az2 = Math.atan2(w[0], w[1]) / D;
      const [sx, sy] = project(scene, view, alt2, az2);
      let dx = sx - mx, dy = sy - my; const dl = Math.hypot(dx, dy) || 1; dx /= dl; dy /= dl;
      const s = [dx * Math.sin(E), dy * Math.sin(E), -Math.cos(E)];
      const r = 6.5, day = 1 - night;
      const ext = Math.min(1, Math.max(0.35, sk.moon.alt / 10));
      for (let y = Math.floor(my - r - 6); y <= my + r + 6; y++) for (let x = Math.floor(mx - r - 6); x <= mx + r + 6; x++) {
        if (x < 0 || x >= W || y < 0 || y >= yH) continue;
        const l = layer[y * W + x], i = y * W + x;
        if (l !== LAYER.sky && l !== LAYER.cloud) continue;
        const u = (x - mx) / r, v = (y - my) / r, q = u * u + v * v;
        const behind = (l === LAYER.cloud ? 1 - 0.75 * cover : 1) * (1 - 0.92 * overcast);   // a grey sky hides it
        if (q < 1) {
          const z = Math.sqrt(1 - q), lit = u * s[0] + v * s[1] + z * s[2];
          const mare = 0.86 + 0.14 * Math.sin(u * 5.1 + 1.3) * Math.sin(v * 4.3 - 0.4);
          const c = lit > 0 ? [0.96 * mare, 0.94 * mare, 0.86 * mare] : [0.1, 0.11, 0.14];
          blend(px, i, c, (lit > 0 ? 0.95 : 0.35 * night) * ext * behind * (1 - day * 0.55));
        } else if (q < 3.2 && night > 0.3) {
          add(px, i, [0.5, 0.55, 0.7], 0.07 * night * sk.moonLit * (3.2 - q) / 2.2 * behind);
        }
      }
    }
  }
  return visible;
}

function line(px, a, b, ok, c, alpha) {
  const n = Math.ceil(Math.max(Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1])));
  for (let k = 0; k <= n; k++) {
    const x = Math.round(a[0] + (b[0] - a[0]) * k / (n || 1)), y = Math.round(a[1] + (b[1] - a[1]) * k / (n || 1));
    if (ok(x, y)) add(px, y * W + x, c, alpha);
  }
}

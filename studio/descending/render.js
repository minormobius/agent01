// render.js — the picture: a figure descending a staircase, in planes, after Duchamp (1912).
//
//   makeRenderer(W, H, dpr) → draw(ctx, t)
//
// The same function draws the page and the exported video. Everything is a pure function of t:
// the figure's joints come from figure.js, how far it has come into a body from score.js's embody().
//
// The figure is never a person: limbs are cones cut into three flat facets (lit, mid, shade), the
// torso a tapered block, the head an ovoid with a mouth that opens on the sung vowels. Unembodied, it
// is many exposures at once, a chronophotograph: the same body a fraction of a second apart, each
// one broken into shards that drift off their joints, with dotted arcs where the hips and knees went.
// As embody() rises the exposures close up and the shards come home, until one body stands at the
// foot of the stairs and turns to us.

import { pose, RISE, RUN, WIDTH, STEPS, NOTES } from './figure.js';
import { embody, cues, duration, sec, B } from './score.js';
import { POINTS, PARTS, frames, place } from './thought.js';
import { GLINTS, glintFrom, STAIR } from './env.js';

const PAL = {
  ground: '#21160d', ground2: '#3a2716', ink: '#1a1008',
  light: '#e2b878', mid: '#b98446', shade: '#6d4523', deep: '#3e2613',
  tread: '#a07a4a', riser: '#5c3d22', stringer: '#452c17', glow: '#f3d9a4',
};
const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const smooth = (u) => { u = clamp(u); return u * u * (3 - 2 * u); };
// a hash, never a running generator: the same shard jitters the same way at the same t
const hash = (a, b = 0, c = 0) => { let h = Math.imul(a | 0, 374761393) ^ Math.imul(b | 0, 668265263) ^ Math.imul(c | 0, 2147483647); h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };

// the wood burns through the first chorus; the points loose into their orbits through the second
const burnAt = (t) => 1.25 * smooth((t - sec(B(12))) / (sec(B(42)) - sec(B(12))));
const mathAt = (t) => smooth((t - sec(B(34))) / (sec(B(80)) - sec(B(34))));

export function makeRenderer(W, H, dpr = 1) {
  const w = W * dpr, h = H * dpr;
  // the camera: orthographic, turned so the flight runs down to the right, looking a little down on it
  const YAW = -0.42, PITCH = 0.2, cy = Math.cos(YAW), sy = Math.sin(YAW), cp = Math.cos(PITCH), sp = Math.sin(PITCH);
  const tall = h > w * 1.1, S = Math.min(h * 0.3, w * (tall ? 0.52 : 0.62));   // pixels per metre
  const CX = w * (tall ? 0.64 : 0.5);                                // where the pelvis sits: a tall frame leaves room for the exposures behind it
  const view = (P) => {
    const x = P[0] * cy + P[2] * sy, z = -P[0] * sy + P[2] * cy;    // yaw about y
    const y = P[1] * cp - z * sp, d = P[1] * sp + z * cp;           // pitch about x
    return [x, y, d];
  };
  let cam = [0, 0];
  const proj = (P) => { const [x, y, d] = view(P); return [CX + (x - cam[0]) * S, h * 0.46 - (y - cam[1]) * S, d]; };

  // the paper's tooth: a fixed grain, multiplied over everything
  const grain = (() => {
    const c = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(256, 256) : Object.assign(document.createElement('canvas'), { width: 256, height: 256 });
    const g = c.getContext('2d'), im = g.createImageData(256, 256);
    for (let i = 0; i < 256 * 256; i++) { const v = 200 + 55 * hash(i, 7); im.data[i * 4] = v; im.data[i * 4 + 1] = v * 0.96; im.data[i * 4 + 2] = v * 0.88; im.data[i * 4 + 3] = 255; }
    g.putImageData(im, 0, 0);
    return c;
  })();
  let grainPat = null;

  function poly(ctx, pts, fill, stroke, lw = 1) {
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.closePath();
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw * dpr; ctx.stroke(); }
  }

  // ---- the staircase -----------------------------------------------------------------------------
  function stairs(ctx, p, e) {
    const j0 = Math.max(0, Math.floor(p) - 9), j1 = Math.min(STEPS, Math.floor(p) + 9);
    const zf = -WIDTH / 2, zn = WIDTH / 2;
    // the far wall: a dark plane that steps down with the stairs, and the landing's wall at the top
    for (let j = j1; j >= j0; j--) {
      const x0 = j === 0 ? -3 : j * RUN, x1 = j === STEPS ? (j + 40) * RUN : (j + 1) * RUN, y = -j * RISE;
      const fade = clamp(1 - Math.abs(j - p) / 9);
      ctx.globalAlpha = 0.35 + 0.65 * fade;
      poly(ctx, [proj([x0, y, zf]), proj([x1, y, zf]), proj([x1, y + 2.6, zf]), proj([x0, y + 2.6, zf])], j % 2 ? '#2b1d11' : '#2f2013');
    }
    for (let j = j1; j >= j0; j--) {
      const x0 = j === 0 ? -3 : j * RUN, x1 = j === STEPS ? (j + 40) * RUN : (j + 1) * RUN, y = -j * RISE;
      const fade = clamp(1 - Math.abs(j - p) / 9);
      ctx.globalAlpha = (0.3 + 0.7 * fade) * (1 - 0.88 * stairLight(j, lastP, lastT));
      // the riser below this tread's nose, the tread, the near stringer's face
      if (j < STEPS) poly(ctx, [proj([x1, y, zf]), proj([x1, y, zn]), proj([x1, y - RISE, zn]), proj([x1, y - RISE, zf])], PAL.riser, PAL.ink, 1);
      poly(ctx, [proj([x0, y, zf]), proj([x1, y, zf]), proj([x1, y, zn]), proj([x0, y, zn])], PAL.tread, PAL.ink, 1);
      poly(ctx, [proj([x0, y, zn]), proj([x1, y, zn]), proj([x1, y - 0.5, zn]), proj([x0, y - 0.5, zn])], PAL.stringer, PAL.ink, 0.8);
      // the tread's light: a lit band along its nose, broken while the picture is
      const a = proj([x1 - 0.05, y, zf]), b = proj([x1 - 0.05, y, zn]);
      ctx.strokeStyle = 'rgba(243, 217, 164, 0.18)'; ctx.lineWidth = 2 * dpr * (0.6 + 0.4 * e);
      ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  // ---- the wood: a limb is a cone in three facets, and it burns ------------------------------------
  // Each facet has its moment in the fire (by where it is on the body, head first, and a hash): it
  // chars, shrinks toward its middle with a glowing edge, throws sparks into the light, and is gone.
  const LIGHT = [-0.55, -0.83], CHAR = [26, 13, 6];
  const hexRGB = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  const TONES = { light: hexRGB(PAL.light), mid: hexRGB(PAL.mid), shade: hexRGB(PAL.shade) };
  const mixRGB = (a, b, k) => `rgb(${a.map((v, i) => Math.round(v + (b[i] - v) * k)).join(',')})`;
  const burnState = (burn, key) => clamp((burn - key) / 0.16, 0, 1.0001);
  function facet(ctx, pts, tone, st, alpha, spark) {
    if (st >= 1) return;
    if (st > 0) {
      const cx = pts.reduce((a, q) => a + q[0], 0) / pts.length, cy = pts.reduce((a, q) => a + q[1], 0) / pts.length, k = 1 - 0.65 * st;
      pts = pts.map((q) => [cx + (q[0] - cx) * k, cy + (q[1] - cy) * k]);
      ctx.globalAlpha = alpha;
      poly(ctx, pts, mixRGB(tone, CHAR, Math.min(1, st * 2.2)), `rgba(255, 128, 48, ${0.95 * (1 - st)})`, 1.6);
      if (spark) for (const q of pts) spark(q[0], q[1], 1 - st);
      return;
    }
    ctx.globalAlpha = alpha;
    poly(ctx, pts, `rgb(${tone.join(',')})`);
  }
  function cone(ctx, A, Bp, ra, rb, alpha, burn, key, seed, spark) {
    const a = proj(A), b = proj(Bp);
    const vx = b[0] - a[0], vy = b[1] - a[1], L = Math.hypot(vx, vy) || 1, nx = -vy / L, ny = vx / L;
    const A0 = ra * S, B0 = rb * S;
    const at = (q, r, f) => [q[0] + nx * r * f, q[1] + ny * r * f];
    const lit = nx * LIGHT[0] + ny * LIGHT[1] > 0;                  // which side faces the light
    const bands = [[-1, -0.3], [-0.3, 0.35], [0.35, 1]], tones = lit ? [TONES.shade, TONES.mid, TONES.light] : [TONES.light, TONES.mid, TONES.shade];
    let whole = 1;
    bands.forEach(([f0, f1], i) => {
      const st = burnState(burn, key + 0.12 * hash(seed, i));
      whole = Math.min(whole, st);
      facet(ctx, [at(a, A0, f0), at(b, B0, f0), at(b, B0, f1), at(a, A0, f1)], tones[i], st, alpha, spark);
    });
    if (whole < 0.001) { ctx.globalAlpha = alpha; poly(ctx, [at(a, A0, -1), at(b, B0, -1), at(b, B0, 1), at(a, A0, 1)], null, PAL.ink, 1.2); }
    ctx.globalAlpha = 1;
  }

  function head(ctx, P, alpha, burn, key, spark) {
    const st = burnState(burn, key);
    if (st >= 1) return;
    const c = proj(P.head), r = 0.115 * S, cx = c[0], cyy = c[1];
    // an ovoid in facets, its face turned where the body faces
    const f = proj([P.head[0] + P.fwd[0], P.head[1], P.head[2] + P.fwd[2]]), fx = f[0] - c[0], fy = f[1] - c[1], fl = Math.hypot(fx, fy) || 1;
    const ux = fx / fl, side = fl / S;                                  // side: 1 in profile, ~0 facing us
    const pts = [];
    for (let i = 0; i < 9; i++) { const a = (i / 9) * Math.PI * 2; pts.push([cx + Math.cos(a) * r * 0.82, cyy + Math.sin(a) * r * 1.08]); }
    facet(ctx, pts, TONES.mid, st, alpha, spark);
    facet(ctx, [[cx, cyy - r * 1.08], [cx - r * 0.82, cyy - r * 0.2], [cx - r * 0.5, cyy + r * 0.8], [cx + ux * r * 0.3, cyy + r * 0.3]], TONES.light, st, alpha, null);
    facet(ctx, [[cx + ux * r * 0.2, cyy - r * 0.7], [cx + ux * r * 0.95 * side + (1 - side) * r * 0.5, cyy - r * 0.1], [cx + ux * r * 0.8 * side + (1 - side) * r * 0.4, cyy + r * 0.8], [cx + ux * r * 0.1, cyy + r * 0.6]], TONES.shade, st, alpha, null);
    if (st <= 0) {
      ctx.globalAlpha = alpha;
      poly(ctx, pts, null, PAL.ink, 1.2);
      const mx = cx + ux * r * 0.55 * side, my = cyy + r * 0.45 - P.lift * r * 0.1, m = P.mouth;
      if (m > 0.02) { ctx.beginPath(); ctx.ellipse(mx, my, r * (0.1 + 0.08 * (1 - side)), r * (0.04 + 0.2 * m), 0, 0, Math.PI * 2); ctx.fillStyle = PAL.ink; ctx.fill(); }
      else { ctx.strokeStyle = PAL.ink; ctx.lineWidth = 1.2 * dpr; ctx.beginPath(); ctx.moveTo(mx - r * 0.1, my); ctx.lineTo(mx + r * 0.1, my); ctx.stroke(); }
    }
    ctx.globalAlpha = 1;
  }

  // the body, far side first: [from, to, r0, r1, when it burns (head first, feet last)]
  function body(ctx, P, alpha, burn, seedBase, spark) {
    if (burn > 1.2) return;
    const segs = [
      [P.hipR, P.kneeR, 0.075, 0.055, 0.5], [P.kneeR, P.ankleR, 0.055, 0.038, 0.66], [P.heelR, P.toeR, 0.04, 0.03, 0.8],
      [P.shR, P.elbowR, 0.045, 0.038, 0.3], [P.elbowR, P.handR, 0.036, 0.028, 0.38],
      [P.pelvis, P.chest, 0.14, 0.17, 0.16], [P.chest, P.neck, 0.12, 0.05, 0.06],
      [P.hipL, P.kneeL, 0.075, 0.055, 0.5], [P.kneeL, P.ankleL, 0.055, 0.038, 0.66], [P.heelL, P.toeL, 0.04, 0.03, 0.8],
      [P.shL, P.elbowL, 0.045, 0.038, 0.3], [P.elbowL, P.handL, 0.036, 0.028, 0.38],
    ].map((s, i) => ({ s, i, d: (view(s[0])[2] + view(s[1])[2]) / 2 }));
    segs.sort((a, b) => a.d - b.d);
    let headDone = false;
    const hd = view(P.head)[2];
    for (const { s, i, d } of segs) {
      if (!headDone && d > hd) { head(ctx, P, alpha, burn, 0, spark); headDone = true; }
      cone(ctx, s[0], s[1], s[2], s[3], alpha, burn, s[4], seedBase * 31 + i, spark);
    }
    if (!headDone) head(ctx, P, alpha, burn, 0, spark);
  }

  // ---- the light: points, added up in a buffer, then laid over the painting as light ---------------
  const q = w * h > 6e5 ? 0.5 : 1, LW = Math.ceil(w * q), LH = Math.ceil(h * q);
  const mk = (a, b) => (typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(a, b) : Object.assign(document.createElement('canvas'), { width: a, height: b }));
  const lightC = mk(LW, LH), lctx = lightC.getContext('2d'), img = lctx.createImageData(LW, LH), acc = new Float32Array(LW * LH * 3);
  let x0 = LW, x1 = -1, y0 = LH, y1 = -1;                            // the box the light touched this frame
  // the glow, computed here rather than by the canvas (a scaled draw of a blurred copy cost up to
  // 200 ms a frame on a software canvas): the light also summed into cells a quarter the size, blurred,
  // and added back, bilinearly, as each pixel is tone-mapped
  const GW = Math.ceil(LW / 4) + 2, GH = Math.ceil(LH / 4) + 2, G = new Float32Array(GW * GH * 3), G2 = new Float32Array(GW * GH * 3);
  function splat(x, y, r, g, b) {
    x *= q; y *= q;
    if (x < 0 || y < 0 || x >= LW - 1 || y >= LH - 1) return;
    const ix = x | 0, iy = y | 0, fx = x - ix, fy = y - iy;
    if (ix < x0) x0 = ix; if (ix + 1 > x1) x1 = ix + 1; if (iy < y0) y0 = iy; if (iy + 1 > y1) y1 = iy + 1;
    const w00 = (1 - fx) * (1 - fy), w10 = fx * (1 - fy), w01 = (1 - fx) * fy, w11 = fx * fy;
    let o = (iy * LW + ix) * 3;
    acc[o] += r * w00; acc[o + 1] += g * w00; acc[o + 2] += b * w00;
    acc[o + 3] += r * w10; acc[o + 4] += g * w10; acc[o + 5] += b * w10;
    o += LW * 3;
    acc[o] += r * w01; acc[o + 1] += g * w01; acc[o + 2] += b * w01;
    acc[o + 3] += r * w11; acc[o + 4] += g * w11; acc[o + 5] += b * w11;
    const c = ((iy >> 2) * GW + (ix >> 2)) * 3;
    G[c] += r; G[c + 1] += g; G[c + 2] += b;
  }
  const spark = (x, y, k) => { for (let i = 0; i < 3; i++) splat(x + (hash(x * 7 + i, y) - 0.5) * 6 * dpr, y - hash(y + i, x) * 10 * dpr * k, 2.2 * k, 1.0 * k, 0.3 * k); };
  const tmp = [0, 0, 0];
  // the trail's exposures sit on a fixed grid of times, so each is worked out once (world positions,
  // every other point) and kept: a memo, so the picture is still a pure function of t
  const memo = new Map();
  function exposure(tt, m) {
    const key = Math.round(tt * 100);
    let e = memo.get(key);
    if (e) return e;
    const P = pose(tt), F = frames(P), n = Math.ceil(POINTS.length / 2), pos = new Float32Array(n * 3), sing = new Float32Array(n);
    for (let i = 0, k = 0; i < POINTS.length; i += 2, k++) {
      const isHead = PARTS[POINTS[i].part][0] === 'head';
      place(i, F, tt, m, (1.15 + 0.55 * m) * (isHead ? 1 + 0.35 * P.mouth : 1), tmp);
      pos[k * 3] = tmp[0]; pos[k * 3 + 1] = tmp[1]; pos[k * 3 + 2] = tmp[2];
      sing[k] = isHead ? 1 + 1.6 * P.mouth : 1;
    }
    e = { pos, sing, n, px: P.pelvis[0] };
    memo.set(key, e);
    if (memo.size > 90) memo.delete(memo.keys().next().value);
    return e;
  }
  /** One exposure of the figure as points. `m`: how far into its orbits; `bright`, `col`: its light. */
  function points(P, tt, m, swell, bright, col, stride, streak) {
    const F = frames(P), sing = 1 + 1.6 * P.mouth;
    for (let i = 0; i < POINTS.length; i += stride) {
      const isHead = PARTS[POINTS[i].part][0] === 'head', b0 = bright * (isHead ? sing : 1);
      const sw = isHead ? swell * (1 + 0.35 * P.mouth) : swell;
      for (let j = 0; j < streak; j++) {
        place(i, F, tt, m, sw, tmp, j * 0.035);
        const s2 = proj(tmp), k = b0 * (1 - j / streak);
        splat(s2[0], s2[1], col[0] * k, col[1] * k, col[2] * k);
      }
    }
  }
  function flushLight(ctx) {
    if (x1 < 0) return;
    const gx0 = Math.max(0, (x0 >> 2) - 2), gx1 = Math.min(GW - 1, (x1 >> 2) + 2), gy0 = Math.max(0, (y0 >> 2) - 2), gy1 = Math.min(GH - 1, (y1 >> 2) + 2);
    // a 5-cell blur, across then down
    for (const [src, dst, dx, dy] of [[G, G2, 3, 0], [G2, G, 0, 3 * GW]]) {
      for (let y = gy0; y <= gy1; y++) for (let x = gx0; x <= gx1; x++) {
        const o = (y * GW + x) * 3;
        for (let c = 0; c < 3; c++) {
          let v = src[o + c] * 0.4;
          for (const [k, wt] of [[1, 0.2], [2, 0.1]]) {
            const a = o - k * (dx + dy) + c, b = o + k * (dx + dy) + c;
            if (a >= 0) v += src[a] * wt; if (b < src.length) v += src[b] * wt;
          }
          dst[o + c] = v;
        }
      }
    }
    // tone-map light + glow (v / (1 + v): soft, never clipping) over the box grown by the glow's reach
    const bx0 = Math.max(0, gx0 * 4), bx1 = Math.min(LW - 1, gx1 * 4 + 3), by0 = Math.max(0, gy0 * 4), by1 = Math.min(LH - 1, gy1 * 4 + 3);
    const d = img.data, GL = 0.06;
    for (let y = by0; y <= by1; y++) {
      const gy = Math.min(GH - 2, Math.max(0, (y - 2) / 4)), iy = gy | 0, fy = gy - iy;
      for (let x = bx0, i = (y * LW + bx0) * 3, j = (y * LW + bx0) * 4; x <= bx1; x++, i += 3, j += 4) {
        const gx = Math.min(GW - 2, Math.max(0, (x - 2) / 4)), ix = gx | 0, fx = gx - ix;
        const o = (iy * GW + ix) * 3, w00 = (1 - fx) * (1 - fy), w10 = fx * (1 - fy), w01 = (1 - fx) * fy, w11 = fx * fy, R = GW * 3;
        const gr = G[o] * w00 + G[o + 3] * w10 + G[o + R] * w01 + G[o + R + 3] * w11;
        const gg = G[o + 1] * w00 + G[o + 4] * w10 + G[o + R + 1] * w01 + G[o + R + 4] * w11;
        const gb = G[o + 2] * w00 + G[o + 5] * w10 + G[o + R + 2] * w01 + G[o + R + 5] * w11;
        const r = acc[i] + GL * gr, g = acc[i + 1] + GL * gg, b = acc[i + 2] + GL * gb;
        d[j] = (255 * r) / (1 + r); d[j + 1] = (255 * g) / (1 + g); d[j + 2] = (255 * b) / (1 + b); d[j + 3] = 255;
        acc[i] = 0; acc[i + 1] = 0; acc[i + 2] = 0;
      }
    }
    for (let y = gy0; y <= gy1; y++) { G.fill(0, (y * GW + gx0) * 3, (y * GW + gx1 + 1) * 3); G2.fill(0, (y * GW + gx0) * 3, (y * GW + gx1 + 1) * 3); }
    lctx.clearRect(0, 0, LW, LH);
    lctx.putImageData(img, 0, 0, bx0, by0, bx1 - bx0 + 1, by1 - by0 + 1);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(lightC, bx0, by0, bx1 - bx0 + 1, by1 - by0 + 1, bx0 / q, by0 / q, (bx1 - bx0 + 1) / q, (by1 - by0 + 1) / q);
    ctx.restore();
    x0 = LW; x1 = -1; y0 = LH; y1 = -1;
  }

  // the words, painted in the corner as they are sung (Duchamp lettered his title onto the canvas)
  const LINES = (() => {
    const out = [];
    let cur = null;
    NOTES.forEach((n, i) => {
      const prev = NOTES[i - 1];
      if (!prev || n.line !== prev.line || n.t - (prev.t + prev.dur) > 0.3 || n.t - prev.t > 6) { cur = { from: n.t, syl: [] }; out.push(cur); }
      if (n.syl) cur.syl.push({ t: n.t, text: n.syl.text, first: n.syl.first, punct: n.syl.punct || '' });
      cur.to = n.t + n.dur;
    });
    return out;
  })();
  function words(ctx, t, e) {
    const line = LINES.find((l) => t >= l.from - 0.4 && t <= l.to + 0.8);
    const fs = Math.round(Math.max(15 * dpr, Math.min(w, h) * 0.034));
    ctx.font = `500 ${fs}px "Cormorant Garamond", Georgia, serif`;
    ctx.textBaseline = 'alphabetic';
    const x0 = w * 0.06, y0 = h * 0.93;
    if (line) {
      // laid out first, so a long line can wrap (a phone is narrow) and stay above the bottom
      const parts = line.syl.map((s, i) => (s.first && i ? ' ' : '') + s.text.toUpperCase() + s.punct);
      let x = x0, rows = 1;
      parts.forEach((p) => { const pw = ctx.measureText(p).width; if (x + pw > w * 0.94 && x > x0) { rows++; x = x0 + ctx.measureText(' ').width * 0; } x += pw + fs * 0.05; });
      let y = y0 - (rows - 1) * fs * 1.25;
      x = x0;
      for (const [si, s] of line.syl.entries()) {
        let word = parts[si];
        if (x + ctx.measureText(word).width > w * 0.94 && x > x0) { x = x0; y += fs * 1.25; word = word.replace(/^ /, ''); }
        const on = t >= s.t - 0.02;
        ctx.globalAlpha = (on ? 0.9 : 0.18) * clamp((t - line.from + 0.4) / 0.4) * clamp((line.to + 0.8 - t) / 0.5);
        ctx.fillStyle = on ? PAL.glow : PAL.tread;
        // unembodied, each syllable sits a little off its line
        const jy = (1 - e) * (hash(Math.round(s.t * 100), 5) - 0.5) * fs * 0.5;
        ctx.fillText(word, x, y + jy);
        x += ctx.measureText(word).width + fs * 0.05;
      }
      ctx.globalAlpha = 1;
    }
    // the title, lettered at the start and at the end
    const title = Math.max(clamp(1 - (t - 6) / 3) * clamp(t / 1.5), clamp((t - (duration - 6)) / 2));
    if (title > 0.01) {
      ctx.globalAlpha = title * 0.85;
      ctx.fillStyle = PAL.glow;
      ctx.font = `500 ${Math.round(fs * 1.5)}px "Cormorant Garamond", Georgia, serif`;
      ctx.fillText('DESCENDING', x0, h * 0.12);
      ctx.font = `italic 400 ${Math.round(fs * 0.8)}px "Cormorant Garamond", Georgia, serif`;
      ctx.fillText('Daisy Bell (Harry Dacre, 1892), sung by arithmetic', x0, h * 0.12 + fs * 1.3);
      ctx.globalAlpha = 1;
    }
  }

  // ---- the world as light: the song's spectrogram on the wall, and the stairs the figure has left ----
  const wallAmt = (t) => 0.1 + 0.9 * smooth((t - sec(B(20))) / (sec(B(92)) - sec(B(20))));
  const envAmt = (t) => smooth((t - sec(B(30))) / (sec(B(100)) - sec(B(30))));
  /** How far tread j (the landing is 0, the floor STEPS) has turned to light, with the figure at p. */
  const stairLight = (j, p, t) => Math.max(envAmt(t) * smooth((p - j - 1) / 3), smooth((t - cues.coda) / 6));
  let lastP = 0, lastT = 0;
  function worldLight(t, P) {
    const p = P.pelvis[0] / RUN;
    lastP = p;
    // the wall: every glint of the song heard so far, over the stretch in view
    const a = P.pelvis[0], k0 = glintFrom(a - (CX / S) * 1.3 - 0.5), k1 = glintFrom(a + ((w - CX) / S) * 1.3 + 0.5), W = wallAmt(t);
    for (let k = k0; k < k1; k++) {
      const o = k * 6, gt = GLINTS[o + 3];
      if (gt > t) continue;
      const tw = 0.65 + 0.35 * Math.sin(t * 2.3 + k * 1.7) + (hash(k, Math.floor(t * 7)) > 0.985 ? 2.5 : 0);
      const b = 0.65 * GLINTS[o + 4] * W * (1 + 3 * Math.exp(-(t - gt) * 3)) * tw, warm = GLINTS[o + 5];
      // a dash along the wall, to the next column: the harmonics read as lines, a spectrogram
      const s2 = proj([GLINTS[o], GLINTS[o + 1], GLINTS[o + 2]]), s3 = proj([GLINTS[o] + RUN / 8, GLINTS[o + 1], GLINTS[o + 2]]);
      for (let i = 0; i < 5; i++) {
        const f = i / 5;
        splat(s2[0] + (s3[0] - s2[0]) * f, s2[1] + (s3[1] - s2[1]) * f, b, b * (0.62 + 0.18 * (1 - warm)), b * (0.42 + 0.3 * (1 - warm)));
      }
    }
    // the stairs behind the figure: their edges and faces as points, trembling and catching the light
    const j0 = Math.max(0, Math.floor(p) - 10), j1 = Math.min(STEPS, Math.floor(p) + 10);
    for (let j = j0; j <= j1; j++) {
      const L = stairLight(j, p, t);
      if (L < 0.01) continue;
      const y = -j * RISE, tiles = j === 0 ? [-2.52, -2.24, -1.96, -1.68, -1.4, -1.12, -0.84, -0.56, -0.28, 0] : j === STEPS ? Array.from({ length: 16 }, (_, i) => (j + i) * RUN) : [j * RUN];
      for (const tx of tiles) {
        for (let i = 0; i < STAIR.length; i++) {
          const [sx, sy, sz] = STAIR[i], id = j * 977 + i + Math.round(tx * 100);
          const wob = 0.012 * L;
          const X = tx + sx * RUN + wob * Math.sin(t * 1.3 + id), Y = y + sy * RISE + wob * Math.sin(t * 1.1 + id * 2.3), Z = -WIDTH / 2 + sz * WIDTH + wob * Math.cos(t * 1.7 + id * 1.3);
          const tw = 0.6 + 0.4 * Math.sin(t * 3 + id * 2.1) + (hash(id, Math.floor(t * 6)) > 0.97 ? 3 : 0);
          const b = 0.55 * L * tw, s2 = proj([X, Y, Z]);
          splat(s2[0], s2[1], b, b * 0.72, b * 0.5);
        }
      }
    }
  }

  const shifted = (P, d) => Object.fromEntries(Object.entries(P).map(([k, v]) => [k, Array.isArray(v) && v.length === 3 && typeof v[0] === 'number' && !['fwd', 'left'].includes(k) ? [v[0] + d[0], v[1] + d[1], v[2] + d[2]] : v]));

  return function draw(ctx, t) {
    const e = embody(t);
    const P = pose(t);
    // the camera follows the pelvis, a little behind it and above
    const pv = view(P.pelvis);
    cam = [pv[0] + 0.15, pv[1] - 0.15];
    // unembodied, the frame flickers now and then (a projector missing frames)
    const flick = (1 - e) * (hash(Math.floor(t * 12), 77) < 0.06 * (1 - e) ? 0.35 : 0);
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    const g = ctx.createLinearGradient(0, 0, w * 0.3, h);
    g.addColorStop(0, PAL.ground2); g.addColorStop(1, PAL.ground);
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    const p = Math.max(0, P.pelvis[0] / RUN - 0.4);
    lastP = P.pelvis[0] / RUN; lastT = t;
    stairs(ctx, p, e);
    // the world turning to light: the song on the wall, the stairs behind the figure
    worldLight(t, P);
    // every exposure is kept, three a second, at full strength: the wood's (burning head first, the
    // older ones later, so the fire runs back along the trail) and then the light's. Standing still,
    // the history still trails away up the stairs.
    const u = 1 - e, m = mathAt(t), burnNow = Math.min(1, burnAt(t));
    const DT = 1 / 3, TAIL = 16, newest = Math.floor(t / DT) * DT;
    const upStairs = (P0, metres) => shifted(P0, [-metres * 0.855, metres * 0.519, 0]);    // (RUN, RISE) normalised
    // standing still (the intro, the coda), the history still trails away up the stairs, rather than
    // piling onto the body: drift by how little the figure has moved since
    const drift = (age, px) => 0.22 * age * Math.max(u ** 1.5, clamp(1 - Math.abs(P.pelvis[0] - px) / (0.2 * age + 1e-6)));
    for (let j = Math.round(TAIL / DT); j >= 0; j--) {
      const tt = newest - j * DT, age = t - tt;
      if (tt < -2 || age < 0.1) continue;
      const bj = burnAt(t - age * 0.35);
      if (bj > 1.2) continue;
      const Pt = pose(tt), d = drift(age, Pt.pelvis[0]);
      body(ctx, d ? upStairs(Pt, d) : Pt, 1, bj, j, null);
    }
    body(ctx, P, 1, burnAt(t), 0, spark);
    for (let j = Math.round(TAIL / DT); j >= 0; j--) {
      const tt = newest - j * DT, age = t - tt;
      if (tt < -2 || age < 0.1) continue;
      const mj = mathAt(tt), X = exposure(tt, mj), dd = drift(age, X.px), dx = -dd * 0.855, dy = dd * 0.519;
      const b = 0.24 * (0.3 + 0.8 * Math.min(1, burnAt(tt)) + 0.2 * mj), col = [1, 0.55 + 0.15 * (1 - mj), 0.36 + 0.1 * (1 - mj)];
      const stride = age < 3 ? 1 : 2;                             // older exposures: half the points, twice as bright
      for (let k = 0; k < X.n; k += stride) {
        const s2 = proj([X.pos[k * 3] + dx, X.pos[k * 3 + 1] + dy, X.pos[k * 3 + 2]]), bb = b * X.sing[k] * stride;
        splat(s2[0], s2[1], col[0] * bb, col[1] * bb, col[2] * bb);
      }
    }
    const bloom = 0.9 * smooth((t - cues.last) / 2.5);
    const now = 0.3 + 0.8 * burnNow + 0.2 * m;
    points(P, t, m, 1.15 + 0.55 * m + bloom, now, [1, 0.62 + 0.2 * (1 - m), 0.42 + 0.14 * (1 - m)], 1, 1 + Math.round(5 * m));
    // the last chord: light gathers on the one body (laid into the glow's cells, not a canvas gradient)
    const last = clamp((t - cues.last) / 3);
    if (last > 0) {
      const c = proj(P.chest), R = S * 1.3 * q / 4, cx = (c[0] * q) / 4, cy = (c[1] * q) / 4;
      for (let gy = Math.max(0, Math.floor(cy - R)); gy <= Math.min(GH - 1, Math.ceil(cy + R)); gy++) {
        for (let gx = Math.max(0, Math.floor(cx - R)); gx <= Math.min(GW - 1, Math.ceil(cx + R)); gx++) {
          const d2 = ((gx - cx) ** 2 + (gy - cy) ** 2) / (R * R);
          if (d2 > 1) continue;
          const v = 6 * last * (1 - d2) ** 2, o = (gy * GW + gx) * 3;
          G[o] += v; G[o + 1] += v * 0.82; G[o + 2] += v * 0.58;
        }
      }
      x0 = Math.max(0, Math.min(x0, Math.floor((cx - R) * 4))); x1 = Math.min(LW - 1, Math.max(x1, Math.ceil((cx + R) * 4)));
      y0 = Math.max(0, Math.min(y0, Math.floor((cy - R) * 4))); y1 = Math.min(LH - 1, Math.max(y1, Math.ceil((cy + R) * 4)));
    }
    flushLight(ctx);
    words(ctx, t, e);
    // the tooth over everything, and the vignette
    if (!grainPat) grainPat = ctx.createPattern(grain, 'repeat');
    ctx.globalCompositeOperation = 'multiply';
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = grainPat; ctx.fillRect(0, 0, w, h);
    ctx.globalCompositeOperation = 'source-over';
    const vg = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.35, w / 2, h / 2, Math.max(w, h) * 0.75);
    vg.addColorStop(0, 'rgba(10, 6, 3, 0)'); vg.addColorStop(1, `rgba(10, 6, 3, ${0.7 + flick})`);
    ctx.globalAlpha = 1; ctx.fillStyle = vg; ctx.fillRect(0, 0, w, h);
    if (flick) { ctx.fillStyle = `rgba(10, 6, 3, ${flick})`; ctx.fillRect(0, 0, w, h); }
    ctx.restore();
  };
}


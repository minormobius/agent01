// world.js — the landscape, as a list of marks with times.
//
// The rule that makes it a piece: THE WORLD IS PAINTED OUTWARD FROM THE SEED.
// Every mark's time is its stage's start plus how far it lies from the plant,
// so each stage spreads across the paper as a front — soil from the seed
// sideways, the field from the stem outward, the sky from the flower outward,
// and at the bloom, waves of red rolling out across the field one melody note
// at a time. Nothing here moves once it is down; the moving plant is poppy.js.
//
// How it is painted, stage by stage, is how a watercolourist would: a pale wash
// underneath (most of the paper still showing), then directional strokes with a
// loaded brush for the sky and the field, then gouache dabs for what catches the
// light, then ink. Light is added as paint (source-over), never multiplied: a
// yellow glaze multiplied onto blue is green, and that is mud.
//
// All coordinates are CSS pixels of the current layout; the marks are rebuilt
// on resize (and the painting replayed to the current moment).

import { Wash, Bristle, Ink, Dab, rng, gauss, hash, vnoise, blob, TAU, clamp, mixc } from '../lib/paint.js';

// Palette: a watercolourist's, not a screen's.
const C = {
  ink: [30, 26, 30],
  umber: [150, 112, 82], sienna: [190, 128, 80], violetGrey: [150, 138, 158], darkEarth: [96, 72, 60],
  ochre: [212, 196, 122], sap: [140, 168, 88], green: [102, 142, 96], coolGreen: [124, 156, 140], deepGreen: [66, 102, 78],
  cerulean: [118, 166, 214], paleSky: [182, 210, 234], lavender: [186, 182, 216], warmWhite: [248, 240, 222], warm: [242, 214, 174],
  cloudGrey: [176, 178, 196], white: [252, 249, 240],
  treeBlue: [104, 134, 150], treeDeep: [78, 108, 110], treeViolet: [132, 128, 162],
  vermilion: [222, 62, 38], crimson: [186, 38, 52], orange: [236, 104, 50], sun: [252, 228, 150],
};

export function layout(W, H) {
  const u = Math.min(H * 0.92, W * 1.25);
  const X0 = W * 0.5;
  const ys = H * 0.76;                    // the soil surface, at the stem
  const yh = H * 0.47;                    // the horizon
  const soilBottom = H * 0.93;
  const m = { l: W * 0.035, r: W * 0.965, t: H * 0.04, b: H * 0.955 };
  return { W, H, u, X0, ys, yh, soilBottom, m, seed: [X0, ys + 0.05 * u] };
}

/** The painted area: a rough rectangle, so the paper shows at a ragged margin. */
export function clipPath(L) {
  const { m } = L;
  const pts = [];
  const wob = (i, s) => (vnoise(i * 0.13, s, 3) - 0.5) * Math.min(L.W, L.H) * 0.035;
  const N = 40;
  for (let i = 0; i <= N; i++) pts.push([m.l + ((m.r - m.l) * i) / N, m.t + wob(i, 1)]);
  for (let i = 0; i <= N; i++) pts.push([m.r + wob(i, 2), m.t + ((m.b - m.t) * i) / N]);
  for (let i = N; i >= 0; i--) pts.push([m.l + ((m.r - m.l) * i) / N, m.b + wob(i, 3)]);
  for (let i = N; i >= 0; i--) pts.push([m.l + wob(i, 4), m.t + ((m.b - m.t) * i) / N]);
  return (ctx) => { ctx.moveTo(pts[0][0], pts[0][1]); for (const p of pts) ctx.lineTo(p[0], p[1]); ctx.closePath(); };
}

/** Root paths, in CSS px. */
export function roots(L) {
  const r = rng(77);
  const walk = (x, y, ang, len, step, wander, gravity) => {
    const pts = [[x, y, 1]];
    let s = 0;
    while (s < len) {
      ang += (r() - 0.5) * wander;
      ang += (Math.PI / 2 - ang) * gravity;
      x += Math.cos(ang) * step; y += Math.sin(ang) * step; s += step;
      pts.push([x, y, 1 - (s / len) * 0.6]);
    }
    return pts;
  };
  const u = L.u, [sx, sy] = L.seed;
  const depth = L.soilBottom - sy - 6;
  const main = walk(sx, sy + 3, Math.PI / 2 + 0.2, Math.min(0.16 * u, depth), 0.003 * u, 0.25, 0.05);
  const lat = [];
  for (let k = 0; k < 9; k++) {
    const at = main[Math.min(main.length - 1, 4 + k * Math.floor(main.length / 11))];
    const side = k % 2 ? -1 : 1;
    lat.push({ k, pts: walk(at[0], at[1], Math.PI / 2 - side * (1 + r() * 0.4), (0.09 - k * 0.006) * u * (0.7 + r() * 0.5), 0.003 * u, 0.3, 0.02) });
  }
  return { main, lat };
}

// ----------------------------------------------------------------------------

export function buildWorld(L, cues) {
  const marks = [];
  const { W, H, u, X0, ys, yh, soilBottom, m } = L;
  const r = rng(2026);
  const dist = (x, y, ox = X0, oy = ys) => Math.hypot((x - ox) / W, (y - oy) / H);
  const maxD = Math.hypot(0.55, 0.55);
  const front = (a, b, x, y, ox, oy, scatter = 0.08) =>
    a + (b - a) * clamp(dist(x, y, ox, oy) / (maxD * 0.85) + (r() - 0.5) * scatter, 0, 0.98);
  const add = (mk) => { marks.push(mk); return mk; };
  const wash = (o) => { const w = add(new Wash({ ...o, t1: o.t1 ?? o.t0 + (o.dur ?? 2.4) })); return w; };
  /** A loaded-brush stroke: a gentle curve from (x, y) at angle `ang`. */
  const sweep = (x, y, len, ang, bend, width, color, t0, { alpha = 0.34, hairs = 14, dry = 0.55, dur = 0.5 } = {}) => {
    const pts = [];
    const N = Math.max(4, Math.round(len / 6));
    for (let k = 0; k <= N; k++) {
      const f = k / N, a = ang + bend * (f - 0.5);
      pts.push([x + Math.cos(a) * len * f, y + Math.sin(a) * len * f, 0.55 + 0.45 * Math.sin(Math.PI * Math.min(1, f * 1.3))]);
    }
    return add(new Bristle({ pts, width, color, alpha, hairs, dry, t0, t1: t0 + dur, jitter: 10 }));
  };

  // 1. The seed: one ink dot on blank paper.
  const [sx, sy] = L.seed;
  wash({ poly: blob(sx, sy, u * 0.011, u * 0.008, 12, -0.3, r), color: C.ink, alpha: 0.12, layers: 18, t0: cues.ink, t1: cues.ink + 1.2, spread: 0.08, op: 'source-over' });

  // 2. Each drop of water is a pale bloom of earth around it, a little wider each time.
  cues.drops.forEach((at, k) => {
    if (at > cues.last) {
      // the last drop, after the last chord: a flick of paint across the corner
      for (let i = 0; i < 9; i++) {
        const x = m.r - W * (0.03 + r() * 0.12), y = m.b - H * (0.02 + r() * 0.08), s = 1 + r() ** 3 * 5;
        add(new Dab({ x, y, rx: s, color: i % 3 ? C.vermilion : C.ink, alpha: 0.75, layers: 1, t0: at + i * 0.03 }));
      }
      return;
    }
    const rad = u * (0.022 + k * 0.01);
    const ox = sx + gauss(r) * u * 0.012, oy = sy + gauss(r) * u * 0.008;
    wash({ poly: blob(ox, oy, rad * 1.5, rad, 7, 0, r), color: k % 3 === 2 ? C.violetGrey : C.umber, alpha: 0.009, layers: 24, t0: at, dur: 2.6, spread: 0.4 });
  });

  // 3. Soil, painted sideways out of the seed: a pale wash, then strata with a dry brush.
  const [s0, s1] = cues.soil;
  /** A band that grows sideways from x = cx out to half-width w as f goes 0 -> 1. */
  const band = (cx, cy, w, h) => [[cx - w, cy - h, 1], [cx - w * 0.3, cy - h * 1.05, 1], [cx + w * 0.3, cy - h * 0.95, 1], [cx + w, cy - h, 1],
    [cx + w * 1.02, cy, 1], [cx + w, cy + h, 1], [cx + w * 0.3, cy + h * 1.05, 1], [cx - w * 0.3, cy + h * 0.95, 1], [cx - w, cy + h, 1], [cx - w * 1.02, cy, 1]];
  const widening = (cx, cy, wMax, h, w0 = 0.06) => (f) => band(cx, cy, W * w0 + (wMax - W * w0) * Math.pow(f, 0.8), h);
  const reach = Math.max(X0 - m.l, m.r - X0) + W * 0.06;
  const soilMid = (ys + soilBottom) / 2, soilH = (soilBottom - ys) / 2;
  [[C.umber, 0, 0], [C.sienna, 0.3, 2.5], [C.violetGrey, -0.25, 4]].forEach(([col, dy, lag]) => {
    wash({ polyAt: widening(sx, soilMid + dy * soilH, reach, soilH * 0.8), color: col, alpha: 0.012, layers: 40, t0: s0 + lag, t1: s1 + lag * 0.5 });
  });
  for (let i = 0; i < 90; i++) {
    const x = m.l + r() * (m.r - m.l), y = ys + 6 + r() * (soilBottom - ys - 10);
    sweep(x, y, W * (0.02 + r() * 0.06), (r() - 0.5) * 0.12, (r() - 0.5) * 0.1, 3 + r() * 6, [C.darkEarth, C.sienna, C.umber, C.violetGrey][i % 4],
      front(s0 + 2, s1 + 3, x, y, sx, sy), { alpha: 0.3, hairs: 8, dry: 0.9 });
  }
  for (let i = 0; i < 50; i++) {
    const x = m.l + r() * (m.r - m.l), y = ys + 6 + r() * (soilBottom - ys - 10);
    add(new Dab({ x, y, rx: 1 + r() ** 2 * 3, ry: 0.8 + r() * 2, rot: r() * 3, color: r() < 0.6 ? C.darkEarth : C.violetGrey, alpha: 0.5, layers: 2, t0: front(s0 + 4, s1 + 6, x, y, sx, sy) }));
  }

  // 4. Roots, in ink, drawn as they grow.
  const R = roots(L);
  add(new Ink({ pts: R.main, width: 0.0034 * u, t0: cues.root, t1: cues.root + 50, alpha: 0.85 }));
  R.lat.forEach((l, k) => {
    const t0 = cues.root + 9 + k * 5.5;
    add(new Ink({ pts: l.pts, width: 0.0018 * u, t0, t1: t0 + 22, alpha: 0.75, bleed: 0.06 }));
  });

  // 5. The ground line, flicked out from the stem both ways; a pencil horizon; pencil poplars.
  for (const dir of [-1, 1]) {
    const pts = [];
    const end = dir < 0 ? m.l - 10 : m.r + 10;
    for (let k = 0; k <= 60; k++) {
      const x = X0 + ((end - X0) * k) / 60;
      pts.push([x, ys + Math.sin(k * 0.45 + dir) * 1.2 + (vnoise(k * 0.2, dir, 8) - 0.5) * 4, 1 - (k / 60) * 0.5]);
    }
    add(new Ink({ pts, width: 1.6, t0: cues.emerge, t1: cues.emerge + 1.6, alpha: 0.7, bleed: 0.05 }));
  }
  const [g0, g1] = cues.ground;
  const pencil = [96, 96, 104];
  for (const dir of [-1, 1]) {
    const pts = [];
    const end = dir < 0 ? m.l : m.r;
    for (let k = 0; k <= 50; k++) pts.push([X0 + ((end - X0) * k) / 50, yh + (vnoise(k * 0.3, dir + 5, 2) - 0.5) * 3, 0.8]);
    add(new Ink({ pts, width: 0.8, color: pencil, alpha: 0.4, bleed: 0, t0: g0 + 6, t1: g0 + 9 }));
  }
  const poplars = [[W * 0.2, H * 0.2], [W * 0.83, H * 0.17]];
  poplars.forEach(([px, ph], k) => {
    for (const side of [-1, 1]) {
      const pts = [];
      for (let j = 0; j <= 24; j++) {
        const f = j / 24;
        pts.push([px + side * Math.sin(Math.PI * Math.pow(f, 0.7)) * ph * 0.14, yh - f * ph, 0.7]);
      }
      add(new Ink({ pts, width: 0.7, color: pencil, alpha: 0.3, bleed: 0, t0: g0 + 9 + k, t1: g0 + 11 + k }));
    }
  });

  // 6. Near ground: greens and ochres pooling around the stem.
  for (let i = 0; i < 9; i++) {
    const cx = X0 + gauss(r) * W * 0.1, cy = ys - H * (0.015 + r() * 0.05);
    wash({ poly: blob(cx, cy, W * (0.05 + r() * 0.05), H * 0.03, 7, 0, r), color: [C.sap, C.ochre, C.green][i % 3], alpha: 0.012, layers: 28, t0: front(g0, g1, cx, cy), spread: 0.38 });
  }
  for (let i = 0; i < 40; i++) {
    const x = X0 + gauss(r) * W * 0.09, y = ys - r() * H * 0.06;
    sweep(x, y, H * (0.02 + r() * 0.03), -Math.PI / 2 + (r() - 0.5) * 0.8, (r() - 0.5) * 0.5, 2 + r() * 3, [C.green, C.sap, C.deepGreen][i % 3], front(g0 + 2, g1, x, y), { alpha: 0.5, hairs: 5, dry: 0.4, dur: 0.3 });
  }

  // 7. The field, outward and up to the horizon: an underwash, then horizontal strokes, then grass.
  const [f0, f1] = cues.field;
  const persp = (y) => clamp((y - yh) / (ys - yh), 0, 1.3);
  for (let row = 0; row < 3; row++) {
    const y = ys - ((ys - yh) * (row + 0.5)) / 3;
    const col = row === 2 ? C.coolGreen : row === 0 ? C.sap : C.ochre;
    wash({ polyAt: widening(X0, y, reach, (ys - yh) / 3 * 0.62), color: col, alpha: 0.011, layers: 40, t0: f0 + row * 1.5, t1: f1 });
  }
  for (let i = 0; i < 380; i++) {
    const y = yh + (ys - yh) * Math.pow(r(), 0.9) + H * 0.005;
    const x = m.l + r() * (m.r - m.l);
    const s = 0.25 + persp(y);
    // hazier and cooler toward the horizon: aerial perspective
    const base = [C.green, C.sap, C.ochre, C.coolGreen, C.lavender][Math.floor(r() * 5)];
    const col = mixc(base, C.paleSky, (1 - persp(y)) * 0.45);
    sweep(x, y, W * (0.015 + r() * 0.04) * s, (r() - 0.5) * 0.25, (r() - 0.5) * 0.2, 3 + s * 9, col,
      front(f0 + 1, f1 + 4, x, y, X0, ys, 0.1), { alpha: 0.32, hairs: 12, dry: 0.6, dur: 0.4 });
  }
  for (let i = 0; i < 700; i++) {
    const y = yh + (ys - yh) * Math.pow(r(), 0.8) + H * 0.01;
    const x = m.l + r() * (m.r - m.l);
    const s = 0.2 + persp(y) * 1.2;
    const len = H * 0.028 * s * (0.5 + r());
    const pick = r();
    const base = pick < 0.35 ? C.green : pick < 0.6 ? C.sap : pick < 0.8 ? C.ochre : pick < 0.92 ? C.deepGreen : C.violetGrey;
    const col = mixc(base, C.paleSky, (1 - persp(y)) * 0.35);
    sweep(x, y, len, -Math.PI / 2 + (r() - 0.5) * 0.7, (r() - 0.5) * 0.4, 1.5 + s * 3, col,
      front(f0 + 3, cues.poppies[0], x, y, X0, ys, 0.12), { alpha: 0.5, hairs: 4, dry: 0.4, dur: 0.25 });
  }

  // 8. Sky, outward from where the flower will be: a pale wash, then broad strokes.
  const [k0, k1] = cues.sky;
  const fx = X0, fy = H * 0.3;
  const skyTop = m.t, skyBot = yh - H * 0.005;
  for (const [yf, col, hh, a] of [[0.2, C.cerulean, 0.26, 0.011], [0.58, C.paleSky, 0.24, 0.01], [0.92, C.warm, 0.1, 0.007]]) {
    const y = skyTop + (skyBot - skyTop) * yf;
    wash({ polyAt: widening(fx, y, reach, (skyBot - skyTop) * hh, 0.1), color: col, alpha: a, layers: 40, t0: k0 + yf * 2, t1: k1 });
  }
  for (let i = 0; i < 300; i++) {
    const yf = Math.pow(r(), 1.1);
    const y = skyTop + (skyBot - skyTop - H * 0.02) * yf;
    const x = m.l - W * 0.03 + r() * (m.r - m.l + W * 0.06);
    const col = yf < 0.35 ? [C.cerulean, C.cerulean, C.paleSky, C.cerulean, C.lavender][i % 5]
      : yf < 0.75 ? [C.paleSky, C.warmWhite, C.cerulean, C.lavender][i % 4]
        : [C.warmWhite, C.warmWhite, C.paleSky, C.warm][i % 4];
    sweep(x, y, W * (0.04 + r() * 0.08), -0.22 + (r() - 0.5) * 0.3, (r() - 0.5) * 0.4, 10 + r() * 16, col,
      front(k0 + 1.5, k1 + 3, x, y, fx, fy, 0.1), { alpha: 0.3, hairs: 16, dry: 0.6, dur: 0.6 });
  }

  // 9. The far tree line, hazed with the sky's blue, and the two poplars over their pencil.
  const [tr0, tr1] = cues.trees;
  for (let i = 0; i < 220; i++) {
    const x = m.l + r() * (m.r - m.l);
    const h = H * (0.008 + Math.pow(vnoise((x / W) * 6, 1, 4), 2) * 0.05) * (0.6 + r() * 0.6);
    const y = yh - r() * h;
    const col = mixc([C.treeBlue, C.treeDeep, C.treeViolet, C.coolGreen][Math.floor(r() * 4)], C.paleSky, 0.25);
    add(new Dab({ x, y, rx: 2 + r() * 5, ry: 2 + r() * 4, rot: r() * 3, color: col, alpha: 0.45, layers: 2, t0: front(tr0, tr1, x, y, X0, yh) }));
  }
  poplars.forEach(([px, ph], k) => {
    for (let i = 0; i < 60; i++) {
      const f = Math.pow(r(), 0.8);
      const wid = Math.sin(Math.PI * Math.pow(f, 0.7)) * ph * 0.13;
      const x = px + (r() - 0.5) * 2 * wid, y = yh - f * ph;
      const t0 = tr0 + 3 + k * 2 + (i / 60) * (tr1 - tr0 - 4);
      sweep(x, y + H * 0.01, H * (0.015 + r() * 0.02), -Math.PI / 2 + (r() - 0.5) * 0.3, 0.1, 4 + r() * 4,
        mixc([C.treeDeep, C.treeBlue, C.green][i % 3], C.paleSky, 0.15), t0, { alpha: 0.55, hairs: 6, dry: 0.5, dur: 0.25 });
    }
    add(new Ink({ pts: [[px, yh + 2, 1], [px + 1, yh - ph * 0.25, 0.8], [px, yh - ph * 0.45, 0.5]], width: 1.1, t0: tr1, t1: tr1 + 0.8, alpha: 0.55 }));
  });

  // 10. Clouds: a grey shadow wash underneath, white gouache strokes over it.
  const [c0, c1] = cues.clouds;
  const clouds = [[0.18, 0.13], [0.42, 0.08], [0.7, 0.2], [0.9, 0.1], [0.3, 0.27]];
  clouds.forEach(([cx0, cy0], k) => {
    const cx = W * cx0, cy = H * cy0, cw = W * (0.07 + r() * 0.05);
    const t = c0 + ((c1 - c0 - 3) * k) / clouds.length;
    wash({ poly: blob(cx, cy + H * 0.014, cw, H * 0.022, 8, 0, r), color: C.cloudGrey, alpha: 0.012, layers: 26, t0: t, dur: 2, spread: 0.4 });
    for (let i = 0; i < 18; i++) {
      const x = cx + gauss(r) * cw * 0.45, y = cy - Math.abs(gauss(r)) * H * 0.016;
      sweep(x - cw * 0.1, y, cw * (0.15 + r() * 0.25), -0.1 + (r() - 0.5) * 0.3, (r() - 0.5) * 0.8, 6 + r() * 8, i % 4 ? C.white : C.warmWhite,
        t + 1 + (i / 18) * 2.5, { alpha: 0.6, hairs: 10, dry: 0.5, dur: 0.35 });
    }
  });

  // 11. The other poppies, in drifts, spreading out from ours.
  const [p0, p1] = cues.poppies;
  const drift = (x, y) => vnoise((x / W) * 5, (y / H) * 9, 12);
  const poppyDab = (x, y, t0, big = 1) => {
    const s = (0.25 + persp(y) * 1.1) * big;
    const col = mixc([C.vermilion, C.vermilion, C.crimson, C.orange][Math.floor(hash(x | 0, y | 0) * 4)], C.lavender, (1 - persp(y)) * 0.3);
    add(new Dab({ x, y, rx: (2 + r() * 3) * s * 1.4, ry: (1.6 + r() * 2) * s, rot: (r() - 0.5) * 0.6, color: col, alpha: 0.88, layers: 3, t0 }));
    if (s > 0.9 && r() < 0.4) add(new Dab({ x: x + 0.5, y: y - s, rx: 0.8 * s, color: C.ink, alpha: 0.65, layers: 1, t0: t0 + 0.05 }));
  };
  let placed = 0;
  for (let i = 0; i < 4000 && placed < 360; i++) {
    const x = m.l + r() * (m.r - m.l), y = yh + (ys - yh) * Math.pow(r(), 0.7) + H * 0.01;
    if (drift(x, y) < 0.5) continue;
    placed++;
    poppyDab(x, y, front(p0, p1, x, y, X0, ys, 0.1));
  }

  // 12. Bloom: a wave of red rolls out across the field on every melody note.
  cues.bursts.forEach((at, k) => {
    const d0 = 0.04 + k * 0.035, d1 = d0 + 0.05;
    let n = 0;
    for (let i = 0; i < 1500 && n < 40; i++) {
      const x = m.l + r() * (m.r - m.l), y = yh + (ys - yh) * Math.pow(r(), 0.75) + H * 0.01;
      const d = dist(x, y);
      if (d < d0 || d > d1 || drift(x, y) < 0.36) continue;
      n++;
      poppyDab(x, y, at + (d - d0) * 12, 1.15);
    }
    for (let i = 0; i < 6; i++) {
      const x = m.l + r() * (m.r - m.l), y = yh + (ys - yh) * r();
      add(new Dab({ x, y, rx: 1.5 + r() * 2, color: r() < 0.5 ? C.white : C.sun, alpha: 0.75, layers: 1, t0: at + r() }));
    }
  });

  // 13. The arrival: sunlight, painted on as light.
  const sunX = W * 0.8, sunY = H * 0.13;
  wash({ poly: blob(sunX, sunY, W * 0.05, W * 0.05, 9, 0, r), color: C.sun, alpha: 0.05, layers: 26, t0: cues.arrive - 1, t1: cues.arrive + 3, op: 'source-over', spread: 0.3 });
  for (let i = 0; i < 40; i++) {
    const a = r() * TAU, d = W * (0.05 + r() * 0.12);
    const x = sunX + Math.cos(a) * d, y = sunY + Math.sin(a) * d * 0.6;
    sweep(x, y, W * (0.03 + r() * 0.05), a + Math.PI / 2 + (r() - 0.5) * 0.4, 0.4, 8 + r() * 10, [C.sun, C.warmWhite, C.warm][i % 3],
      cues.arrive + (i / 40) * 5, { alpha: 0.35, hairs: 12, dry: 0.6, dur: 0.5 });
  }
  cues.glitter.forEach((at) => {
    for (let i = 0; i < 7; i++) {
      const x = m.l + r() * (m.r - m.l), y = m.t + r() * (ys - m.t);
      add(new Dab({ x, y, rx: 1 + r() * 1.6, color: C.white, alpha: 0.85, layers: 1, t0: at + i * 0.02 }));
    }
  });

  // 14. Birds, on the falling notes of the coda: an ink flick each.
  cues.birds.forEach((at, i) => {
    const x = W * (0.12 + ((i * 0.37) % 0.8)), y = H * (0.08 + ((i * 0.23) % 0.26));
    const s = Math.min(W, H) * (0.007 + r() * 0.006);
    const pts = [[x - s, y - s * 0.4, 0.5], [x - s * 0.45, y - s * 0.55, 1], [x, y, 0.8], [x + s * 0.5, y - s * 0.6, 1], [x + s * 1.1, y - s * 0.35, 0.4]];
    add(new Ink({ pts, width: 1.3, t0: at, t1: at + 0.35, alpha: 0.8, bleed: 0.04 }));
  });

  return marks;
}

/** The seal the painter stamps last, in the margin. Drawn by main.js, outside the clip. */
export function drawSeal(ctx, L, a) {
  if (a <= 0) return;
  const s = Math.max(22, Math.min(L.W, L.H) * 0.045);
  const x = L.m.r - s * 1.3, y = L.m.b - s * 1.25;
  ctx.save();
  ctx.globalAlpha = a;
  ctx.fillStyle = 'rgba(196,48,40,0.88)';
  const r = rng(99);
  ctx.beginPath();
  const p = [[x, y], [x + s, y + r() * 1.5], [x + s + r() * 1.5, y + s], [x - r(), y + s + r()]];
  ctx.moveTo(p[0][0], p[0][1]); for (const q of p) ctx.lineTo(q[0], q[1]); ctx.closePath(); ctx.fill();
  // carved: a four-petalled flower in the paper colour
  ctx.fillStyle = '#f4eee2';
  const cx = x + s / 2, cy = y + s / 2;
  for (let i = 0; i < 4; i++) {
    const ang = (i * TAU) / 4 + 0.4;
    ctx.beginPath(); ctx.ellipse(cx + Math.cos(ang) * s * 0.17, cy + Math.sin(ang) * s * 0.17, s * 0.15, s * 0.1, ang, 0, TAU); ctx.fill();
  }
  ctx.fillStyle = 'rgba(196,48,40,1)';
  ctx.beginPath(); ctx.arc(cx, cy, s * 0.07, 0, TAU); ctx.fill();
  ctx.restore();
}

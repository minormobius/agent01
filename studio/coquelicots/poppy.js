// poppy.js — the one thing in the picture that moves, painted fresh each drawing.
//
// The landscape is paint that stays where it was put (world.js). The poppy
// grows, sways and opens, so it cannot be: it is repainted from scratch at 12
// drawings a second — animation "on twos", as hand animators did — and every
// drawing's brushwork differs a little from the last, cycling through three
// variants, so the plant has the live shimmer of a hand-painted film rather
// than the stillness of a vector.
//
// The growth model is Anthesis's (the hook, the nod, the crumpled petals built
// in 3D), recast for the brush: shapes become washes, edges become broken ink,
// and petals are laid in with strokes that follow their form from base to rim.
//
// Units: 1 = u px; origin at the stem's foot on the soil surface; y down.

import { Bristle, Ink, deform, rng, rgba, mixc, clamp, TAU, blob } from '../lib/paint.js';

const lerp = (a, b, t) => a + (b - a) * t;
const span = (t, a, b) => clamp((t - a) / (b - a));
const ease = (x) => { x = clamp(x); return x * x * (3 - 2 * x); };
const grow = (x) => { x = clamp(x); return 1 - (1 - x) ** 3; };

export const SEED_DEPTH = 0.05;
const INTERNODE = [0.042, 0.048, 0.048, 0.045, 0.041, 0.036];
const LEAF_LEN = [0.1, 0.112, 0.106, 0.094, 0.08, 0.064];
const PEDUNCLE = 0.14;

const COL = {
  stem: [104, 140, 78], stemDark: [70, 100, 60], leaf: [86, 128, 102], leafLight: [140, 170, 120], leafDark: [58, 92, 80],
  coty: [140, 170, 96], sepal: [102, 136, 84],
  red: [222, 58, 36], redDeep: [176, 30, 38], redLight: [244, 112, 58], blotch: [36, 16, 30],
  ink: [30, 26, 30], pale: [220, 214, 176],
};

// ----------------------------------------------------------------- growth --

function hypLen(t, c) {
  const k = [[c.hypocotyl, 0], [c.emerge, SEED_DEPTH + 0.02], [c.cotyledons + 2, SEED_DEPTH + 0.07], [c.leaves[0], SEED_DEPTH + 0.09], [c.bud, SEED_DEPTH + 0.1], [c.end, SEED_DEPTH + 0.11]];
  if (t <= k[0][0]) return 0;
  for (let i = 1; i < k.length; i++) if (t <= k[i][0]) return lerp(k[i - 1][1], k[i][1], ease((t - k[i - 1][0]) / (k[i][0] - k[i - 1][0])));
  return k[k.length - 1][1];
}

function stemAt(t, c) {
  const Lh = hypLen(t, c);
  const inter = INTERNODE.map((L, k) => {
    const a = c.leaves[k] - 1.6;
    return L * (grow(span(t, a, a + 9)) * 0.9 + 0.1 * span(t, a, c.end));
  });
  const ped = PEDUNCLE * (grow(span(t, c.bud - 1, c.bloom + 1)) * 0.94 + 0.06 * span(t, c.bloom, c.end));
  const total = Lh + inter.reduce((a, b) => a + b, 0) + ped;
  const hook = 1 - ease(span(t, c.emerge - 0.4, c.cotyledons + 1.6));
  const HOOK = 0.026;
  const nod = ease(span(t, c.bud, c.bud + 6)) * (1 - ease(span(t, c.lift - 0.5, c.bloom + 0.6)));
  const height = Math.max(0, total - SEED_DEPTH);
  const nutAmp = 0.7 * clamp(height / 0.25) + 0.2;
  const ds = 0.004;
  const pts = [];
  let x = 0, y = SEED_DEPTH, th = -Math.PI / 2 - 0.08, s = 0;
  pts.push({ x, y, th, s });
  while (s < total) {
    const step = Math.min(ds, total - s);
    let k = 0;
    if (s > Lh - HOOK && s <= Lh) k += (hook * Math.PI * 0.95) / HOOK;
    if (y < 0) {
      k += 0.35 * (1 - s / (total + 0.2));
      k += nutAmp * Math.sin(t * 1.3 - s * 9) * 1.2;
    }
    if (s > total - ped * 0.55) k += (nod * 2.6) / (ped * 0.55 + 1e-6);
    th += k * step;
    x += Math.cos(th) * step; y += Math.sin(th) * step; s += step;
    pts.push({ x, y, th, s });
  }
  const nodes = [Lh];
  let acc = Lh;
  for (const L of inter) { acc += L; nodes.push(acc); }
  return { pts, total, Lh, nodes, ped };
}

function sample(st, s) {
  const { pts } = st;
  if (s <= 0) return pts[0];
  if (s >= st.total) return pts[pts.length - 1];
  const i = Math.min(pts.length - 2, Math.floor(s / 0.004));
  const a = pts[i], b = pts[i + 1];
  const f = (s - a.s) / Math.max(1e-9, b.s - a.s);
  return { x: lerp(a.x, b.x, f), y: lerp(a.y, b.y, f), th: lerp(a.th, b.th, f), s };
}

/** Where the flower is, in CSS px, for the camera and for the world's sky front. */
export function flowerAt(t, c, L) {
  const st = stemAt(t, c);
  const q = sample(st, st.total);
  return [L.X0 + q.x * L.u, L.ys + q.y * L.u];
}

// ---------------------------------------------------------------- painting --

const now = (m, boil) => { m.id = m.id * 3 + boil; return m; };   // three variants of every stroke

function stroke(ctx, pts, width, color, alpha, hairs, id, boil, dry = 0.3) {
  const b = new Bristle({ pts, width, color, alpha, hairs, t0: 0, dry, id: id * 3 + boil, hairWidth: (width / hairs) * 2.2 });
  b.draw(ctx, 0, 1);
}
function inkLine(ctx, pts, width, id, boil, alpha = 0.8) {
  new Ink({ pts, width, alpha, t0: 0, id: id * 3 + boil, bleed: 0.08 }).draw(ctx, 0, 1);
}
function washFill(ctx, poly, color, alpha, id, boil, layers = 3) {
  for (let L = 0; L < layers; L++) {
    const p = deform(poly, 2, 0.06, rng(id * 97 + L * 13 + boil));
    ctx.fillStyle = rgba(color, alpha);
    ctx.beginPath(); ctx.moveTo(p[0][0], p[0][1]);
    for (const q of p) ctx.lineTo(q[0], q[1]);
    ctx.closePath(); ctx.fill();
  }
}

export function paintPoppy(ctx, t, c, L, boil) {
  if (t < c.hypocotyl) return;
  const st = stemAt(t, c);
  ctx.save();
  ctx.translate(L.X0, L.ys);
  ctx.scale(L.u, L.u);
  ctx.globalCompositeOperation = 'source-over';

  const leaves = [];
  for (let k = 0; k < 6; k++) {
    const born = c.leaves[k];
    if (t < born - 1) continue;
    const at = sample(st, st.nodes[k + 1]);
    const side = k % 2 ? -1 : 1;
    const unfold = ease(span(t, born - 0.4, born + 5));
    const size = grow(span(t, born - 1, born + 10)) * LEAF_LEN[k];
    leaves.push({ at, side, unfold, size, spread: lerp(0.15, 1.05 - k * 0.08, unfold), k });
  }
  for (const lf of leaves) if (lf.side < 0) paintLeaf(ctx, lf, boil);
  if (t >= c.cotyledons - 1) paintCotyledons(ctx, st, t, c, boil);
  paintStem(ctx, st, t, c, boil);
  for (const lf of leaves) if (lf.side > 0) paintLeaf(ctx, lf, boil);
  if (t >= c.bud - 0.5) paintFlower(ctx, st, t, c, boil);
  ctx.restore();
}

function paintStem(ctx, st, t, c, boil) {
  const age = clamp((t - c.hypocotyl) / 60);
  const w0 = lerp(0.005, 0.009, age);
  const pts = st.pts.filter((_, i) => i % 2 === 0 || i === st.pts.length - 1)
    .map((q) => [q.x, q.y, lerp(1, 0.55, clamp(q.s / Math.max(0.1, st.total)))]);
  if (pts.length < 2) return;
  // below ground the stem is pale: it has not seen light
  const under = pts.filter((p) => p[1] > -0.002);
  const over = pts.filter((p) => p[1] <= 0.002);
  if (under.length > 1) stroke(ctx, under, w0 * 1.6, COL.pale, 0.8, 5, 11, boil, 0.05);
  if (over.length > 1) {
    stroke(ctx, over, w0 * 1.9, COL.stem, 0.85, 6, 12, boil, 0.08);
    stroke(ctx, over, w0 * 0.8, COL.stemDark, 0.5, 3, 13, boil, 0.3);
  }
  // a broken ink edge along the shadow side
  const edge = pts.map((p, i) => {
    const q = st.pts[Math.min(st.pts.length - 1, i * 2)];
    return [p[0] + Math.sin(q.th) * w0 * 0.9, p[1] - Math.cos(q.th) * w0 * 0.9, p[2] * (0.5 + 0.5 * Math.sin(i * 0.7 + boil))];
  });
  inkLine(ctx, edge, 0.0014, 14, boil, 0.55);
}

function paintCotyledons(ctx, st, t, c, boil) {
  const tip = sample(st, st.Lh);
  const open = ease(span(t, c.cotyledons, c.cotyledons + 2.6));
  const size = 0.026 + 0.012 * grow(span(t, c.cotyledons, c.cotyledons + 8));
  const col = mixc(COL.coty, [196, 180, 100], span(t, c.bloom, c.end) * 0.6);
  for (const side of [-1, 1]) {
    const th = tip.th + side * lerp(0.08, 1.2, open);
    const ex = Math.cos(th), ey = Math.sin(th), nx = -ey, ny = ex;
    const poly = [];
    for (let i = 0; i <= 10; i++) {
      const f = i / 10, w = Math.sin(Math.PI * f) * size * 0.34 * lerp(0.35, 1, open);
      poly.push([tip.x + ex * size * f + nx * w, tip.y + ey * size * f + ny * w, 1]);
    }
    for (let i = 10; i >= 0; i--) {
      const f = i / 10, w = Math.sin(Math.PI * f) * size * 0.34 * lerp(0.35, 1, open);
      poly.push([tip.x + ex * size * f - nx * w, tip.y + ey * size * f - ny * w, 1]);
    }
    washFill(ctx, poly, col, 0.45, 20 + side, boil, 2);
    inkLine(ctx, poly.slice(2, 10), 0.0011, 22 + side, boil, 0.5);
  }
}

function paintLeaf(ctx, lf, boil) {
  const { at, side, unfold, size, spread, k } = lf;
  if (size < 0.003) return;
  const th = at.th + side * spread;
  const W = size * 0.3 * lerp(0.2, 1, unfold);
  const curl = side * lerp(0.2, 0.55, unfold);
  const N = 14;
  const mid = [];
  let x = at.x, y = at.y, a = th;
  for (let i = 0; i <= N; i++) {
    mid.push({ x, y, a, u: i / N });
    a += (curl / N) * (i / N > 0.2 ? 1.4 : 0.2);
    x += Math.cos(a) * size / N; y += Math.sin(a) * size / N;
  }
  const half = (u) => {
    if (u < 0.15) return W * 0.06;
    const b = (u - 0.15) / 0.85;
    return W * Math.pow(Math.sin(Math.PI * Math.pow(b, 0.8)), 0.85) * (0.75 + 0.25 * Math.abs(Math.sin(b * Math.PI * 4.5 + k)));
  };
  const edge = (sg) => mid.map((q) => [q.x - Math.sin(q.a) * half(q.u) * sg, q.y + Math.cos(q.a) * half(q.u) * sg, 1]);
  const e1 = edge(1), e2 = edge(-1);
  const poly = [...e1, ...e2.slice().reverse()];
  const id = 100 + k * 10;
  washFill(ctx, poly, COL.leaf, 0.42, id, boil, 3);
  // strokes from the midrib out along each lobe
  for (let i = 3; i < N; i += 2) {
    for (const [sg, e] of [[1, e1], [-1, e2]]) {
      const q = mid[i], tgt = e[Math.min(N, i + 2)];
      const pts = [[q.x, q.y, 1], [(q.x + tgt[0]) / 2 + Math.cos(q.a) * 0.004, (q.y + tgt[1]) / 2 + Math.sin(q.a) * 0.004, 0.9], [tgt[0], tgt[1], 0.5]];
      const col = sg === side ? COL.leafDark : COL.leafLight;
      stroke(ctx, pts, W * 0.45, col, 0.5, 4, id + i + (sg > 0 ? 50 : 0), boil, 0.5);
    }
  }
  inkLine(ctx, mid.map((q, i) => [q.x, q.y, 1 - i / N * 0.6]), 0.0011, id + 1, boil, 0.5);
  inkLine(ctx, (side > 0 ? e2 : e1).filter((_, i) => i % 2 === 0 && i > 2), 0.0009, id + 2, boil, 0.45);
}

// ---- the flower

const V = {
  add: (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]],
  sc: (a, s) => [a[0] * s, a[1] * s, a[2] * s],
  cross: (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]],
  norm: (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; },
};
const CRUMPLE = (() => { const r = rng(4242); return Array.from({ length: 4 }, () => Array.from({ length: 9 }, () => [r() - 0.5, r() - 0.5])); })();

function paintFlower(ctx, st, t, c, boil) {
  const tip = sample(st, st.total);
  const pc = c.petals;
  let pulse = 0;
  for (const s of c.swells) if (t >= s) pulse += Math.exp(-(t - s) / 0.35) * 0.05;
  const g = grow(span(t, c.bud - 0.5, c.bloom - 1)) * (1 + pulse);
  const bl = 0.062 * g, bw = 0.046 * g;

  if (t < pc[0]) { paintBud(ctx, tip, bl, bw, t, c, boil); return; }

  const tilt = 1.02;
  const n = V.norm([Math.cos(tip.th) * Math.cos(tilt), Math.sin(tip.th) * Math.cos(tilt), Math.sin(tilt)]);
  const r1 = V.norm(V.cross(n, [0, 0, 1]));
  const r2 = V.cross(n, r1);
  const C = [tip.x, tip.y, 0];

  const petals = [0, 1, 2, 3].map((i) => {
    const az = (i * TAU) / 4 + TAU / 8 + (i % 2 ? 0.08 : -0.05);
    const ra = V.add(V.sc(r1, Math.cos(az)), V.sc(r2, Math.sin(az)));
    return { i, ra, ta: V.cross(n, ra), o: ease(span(t, pc[i + 2] - 0.4, pc[i + 2] + 5.2)) };
  });
  const openness = petals.reduce((a, q) => a + q.o, 0) / 4;

  const paintPetal = ({ i, ra, ta, o }) => {
    const big = i % 2 ? 0.92 : 1;
    const crump = Math.pow(1 - o, 1.3);
    const Lp = 0.12 * big * lerp(0.42, 1, o) * g, Wp = 0.1 * big * lerp(0.36, 1, o) * g;
    const a0 = lerp(0.08, 0.62, o), a1 = lerp(0.1, 0.62, o), cup = lerp(0.42, 0.16, o);
    const U = 10;
    const midl = [];
    let m = [0, 0, 0];
    for (let j = 0; j <= U; j++) {
      const al = a0 + a1 * (j / U);
      const d = V.add(V.sc(n, Math.cos(al)), V.sc(ra, Math.sin(al)));
      const nn = V.add(V.sc(n, -Math.sin(al)), V.sc(ra, Math.cos(al)));
      midl.push({ m, nn, u: j / U });
      m = V.add(m, V.sc(d, Lp / U));
    }
    const half = (u) => Wp * Math.pow(u, 0.55) * Math.sqrt(Math.max(0, 1 - Math.pow(u, 3.4)));
    const P = (j, v) => {
      const q = midl[j], cr = CRUMPLE[i][Math.min(8, Math.floor(q.u * 8))];
      let w = V.add(q.m, V.sc(ta, half(q.u) * (1 + crump * 0.4 * cr[0]) * v));
      w = V.add(w, V.sc(q.nn, -(v * v) * cup * Lp + crump * cr[1] * 0.35 * Wp * Math.abs(v)));
      return [C[0] + w[0], C[1] + w[1]];
    };
    const inside = midl[6].nn[2] >= 0;
    const outline = [];
    for (let j = 0; j <= U; j++) outline.push([...P(j, -1), 1]);
    for (let j = U; j >= 0; j--) outline.push([...P(j, 1), 1]);
    const id = 300 + i * 40;
    washFill(ctx, outline, inside ? COL.red : mixc(COL.red, COL.redLight, 0.3), 0.5, id, boil, 2);
    // strokes from the base out to the rim, following the petal
    for (const [v, col, len, w] of [[-0.62, COL.red, 1, 0.34], [-0.2, COL.redDeep, 0.55, 0.3], [0.22, COL.red, 1, 0.34], [0.64, COL.redLight, 0.95, 0.28], [0, COL.redLight, 1, 0.22]]) {
      const pts = [];
      for (let j = 1; j <= Math.round(U * len); j++) pts.push([...P(j, v), 1 - (j / U) * 0.4]);
      if (pts.length > 1) stroke(ctx, pts, Wp * w, col, 0.55, 5, id + Math.round(v * 10) + 20, boil, 0.35);
    }
    if (inside && o > 0.15) {
      const b = P(1, 0);
      ctx.fillStyle = rgba(COL.blotch, 0.75 * o);
      ctx.beginPath(); ctx.ellipse(b[0], b[1], Wp * 0.22, Wp * 0.14, Math.atan2(b[1] - C[1], b[0] - C[0]), 0, TAU); ctx.fill();
    }
    // a broken ink rim
    const rim = [];
    for (let j = 4; j <= U; j++) rim.push([...P(j, -1), 0.7]);
    for (let j = U; j >= 6; j--) rim.push([...P(j, 1), 0.7]);
    inkLine(ctx, rim.filter((_, k) => (k + boil + i) % 5 !== 0), 0.0012, id + 1, boil, 0.55);
  };

  const back = petals.filter((q) => q.ra[2] < 0), front = petals.filter((q) => q.ra[2] >= 0);
  back.forEach(paintPetal);
  if (openness < 0.5) paintCentre(ctx, C, n, r1, r2, t, c, g, boil);
  front.forEach(paintPetal);
  if (openness >= 0.5) paintCentre(ctx, C, n, r1, r2, t, c, g, boil);

  // sepals: splitting and falling on the first two cascade notes
  for (let i = 0; i < 2; i++) {
    const f = span(t, pc[i], pc[i] + 1.4);
    const sg = i ? 1 : -1;
    if (f >= 1) continue;
    const th = tip.th + sg * (0.2 + f * 1.5);
    const poly = [];
    for (let j = 0; j <= 8; j++) { const q = j / 8; poly.push([Math.cos(th) * bl * q - Math.sin(th) * sg * bw * 0.6 * Math.sin(Math.PI * q), Math.sin(th) * bl * q + Math.cos(th) * sg * bw * 0.6 * Math.sin(Math.PI * q), 1]); }
    const drop = f * f * 0.1;
    washFill(ctx, poly.map((p) => [tip.x + p[0], tip.y + p[1] + drop, 1]), COL.sepal, 0.6 * (1 - f * 0.6), 280 + i, boil, 2);
  }
}

function paintCentre(ctx, C, n, r1, r2, t, c, g, boil) {
  const pc = c.petals;
  const spread = ease(span(t, pc[6] - 0.3, pc[6] + 3)) * ease(span(t, pc[2], pc[5]));
  const s = g * 1.45;
  const at = (rad, h, a) => {
    const q = V.add(V.add(C, V.sc(n, h)), V.add(V.sc(r1, Math.cos(a) * rad), V.sc(r2, Math.sin(a) * rad)));
    return [q[0], q[1]];
  };
  // stamens: ink dots, a dense uneven crown
  for (let j = 0; j < 70; j++) {
    ctx.fillStyle = rgba(j % 3 ? COL.ink : [120, 60, 90], 0.35 + 0.3 * ((j * 7) % 5) / 4);
    const a = j * 2.39996 + boil * 0.05;
    const jit = 0.5 + 0.5 * Math.sin(j * 12.9898) ** 2;
    const q = at((0.008 + (0.01 + 0.012 * jit) * spread) * s, 0.01 * s, a);
    ctx.beginPath(); ctx.arc(q[0], q[1], 0.0011 * s * (0.6 + jit * 0.7), 0, TAU); ctx.fill();
  }
  // the seed head: a grey-green wash, a dark rayed disc
  const dome = [];
  for (let j = 0; j < 12; j++) dome.push([...at(0.009 * s, 0.013 * s, (j / 12) * TAU), 1]);
  washFill(ctx, dome, [168, 186, 150], 0.8, 400, boil, 2);
  const disc = [];
  for (let j = 0; j < 12; j++) disc.push([...at(0.0085 * s, 0.018 * s, (j / 12) * TAU), 1]);
  washFill(ctx, disc, [86, 40, 84], 0.75, 401, boil, 2);
}

function paintBud(ctx, tip, bl, bw, t, c, boil) {
  if (bl < 0.003) return;
  const ex = Math.cos(tip.th), ey = Math.sin(tip.th), nx = -ey, ny = ex;
  const at = (f, w) => [tip.x + ex * bl * f + nx * w, tip.y + ey * bl * f + ny * w];
  const poly = [];
  for (let i = 0; i <= 12; i++) { const f = i / 12; poly.push([...at(f, Math.sin(Math.PI * Math.pow(f, 0.8)) * bw * 0.62), 1]); }
  for (let i = 12; i >= 0; i--) { const f = i / 12; poly.push([...at(f, -Math.sin(Math.PI * Math.pow(f, 0.8)) * bw * 0.62), 1]); }
  washFill(ctx, poly, COL.sepal, 0.55, 260, boil, 3);
  for (const w of [-0.3, 0, 0.3]) {
    const pts = [];
    for (let i = 1; i <= 8; i++) { const f = i / 9; pts.push([...at(f, w * bw * Math.sin(Math.PI * f)), 1]); }
    stroke(ctx, pts, bw * 0.35, w < 0 ? COL.stemDark : COL.leafLight, 0.45, 4, 262 + Math.round(w * 10), boil, 0.4);
  }
  // the seam, reddening as the day comes
  const red = ease(span(t, c.lift - 1, c.petals[0]));
  const seam = [];
  for (let i = 1; i <= 8; i++) { const f = i / 9; seam.push([...at(f, bw * 0.05 * Math.sin(Math.PI * f)), 1]); }
  ctx.save();
  new Ink({ pts: seam, width: 0.0012 + red * 0.003, color: mixc(COL.ink, COL.red, red), alpha: 0.7, t0: 0, id: 270 * 3 + boil, bleed: 0.1 }).draw(ctx, 0, 1);
  ctx.restore();
  inkLine(ctx, poly.filter((_, i) => i % 2 === 0 && i > 1 && i < 11), 0.001, 271, boil, 0.5);
  // bristles: ink flicks
  ctx.strokeStyle = rgba(COL.ink, 0.4);
  ctx.lineWidth = 0.0006;
  ctx.beginPath();
  for (let i = 0; i < 16; i++) {
    const f = (i + 0.5) / 16, sg = i % 2 ? 1 : -1;
    const p = at(f, sg * Math.sin(Math.PI * Math.pow(f, 0.8)) * bw * 0.62);
    ctx.moveTo(p[0], p[1]); ctx.lineTo(p[0] + nx * sg * 0.004 + ex * 0.002, p[1] + ny * sg * 0.004 + ey * 0.002);
  }
  ctx.stroke();
}

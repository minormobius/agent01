// plant.js — a poppy, as a function of time.
//
// Nothing here keeps state between frames. `plantAt(t)` builds the whole plant
// for the moment t from the score's cues, and `drawPlant` paints it. So the
// piece can be scrubbed, a still can be rendered from ?t=, and the picture can
// never drift from the audio clock it is given.
//
// Units: 1 = the scene's unit length u; x right, y DOWN, the soil surface at
// y = 0, so everything above ground has negative y.
//
// What a real seedling does, and so what this one does:
//   · the seed drinks and swells before anything shows (imbibition);
//   · the ROOT comes out first and turns down;
//   · the shoot comes up bent over in a hook, dragging the seed leaves after it
//     so the tip is not scraped by the soil; the hook opens only once it is out;
//   · the seed coat rides up on the seed leaves and is shaken off;
//   · the stem sweeps slow circles as it grows (circumnutation), leans to the
//     light, and the leaves droop at night (nyctinasty);
//   · a poppy bud NODS, hanging its head until the day it opens, then lifts;
//   · the two sepals split and fall, and the petals come out crumpled, like
//     tissue paper, and smooth as they open.

import { clamp, lerp, span, ease, grow, monotone, mulberry32, mix, rgba } from './util.js';
import { surfaceY } from './world.js';

const TAU = Math.PI * 2;
export const SEED_DEPTH = 0.052;

const INTERNODE = [0.042, 0.048, 0.048, 0.045, 0.041, 0.036];
const LEAF_LEN = [0.105, 0.118, 0.112, 0.098, 0.082, 0.064];
const PEDUNCLE = 0.13;

// ------------------------------------------------------------ construction --

export function makePlant(cues) {
  const r = mulberry32(1234);

  // Hypocotyl length (the stem below the seed leaves). Timed so the top of the
  // hook reaches the surface on the cue.
  const hyp = monotone([
    [cues.hypocotyl, 0.0],
    [cues.emerge, SEED_DEPTH + 0.022],
    [cues.cotyledons + 2, SEED_DEPTH + 0.075],
    [cues.leaves[0], SEED_DEPTH + 0.092],
    [cues.bud, SEED_DEPTH + 0.104],
    [cues.end, SEED_DEPTH + 0.11],
  ]);

  // Roots, grown in advance as full-length paths; time reveals them.
  const rootLife = (t) => {
    const T = 26;
    const a = 1 - Math.exp(-Math.max(0, t - cues.root) / T);
    return (0.24 * a) / (1 - Math.exp(-(cues.end - cues.root) / T));
  };
  const walk = (x, y, ang, len, step, wander, gravity, rr) => {
    const pts = [{ x, y, s: 0 }];
    let s = 0;
    while (s < len) {
      ang += (rr() - 0.5) * wander;
      ang += (Math.PI / 2 - ang) * gravity;         // gravitropism: turn toward down
      x += Math.cos(ang) * step; y += Math.sin(ang) * step; s += step;
      pts.push({ x, y, s });
    }
    return pts;
  };
  const main = walk(0, SEED_DEPTH + 0.006, Math.PI / 2 + 0.25, 0.26, 0.004, 0.22, 0.04, r);
  // When does the main root reach arc length s? Solve rootLife(t) = s.
  const reach = (s) => {
    let lo = cues.root, hi = cues.end + 60;
    for (let i = 0; i < 40; i++) { const mid = (lo + hi) / 2; if (rootLife(mid) < s) lo = mid; else hi = mid; }
    return lo;
  };
  const laterals = [];
  for (let k = 0; k < 11; k++) {
    const s = 0.028 + k * 0.019 + r() * 0.006;
    const at = main[Math.min(main.length - 1, Math.round(s / 0.004))];
    const side = k % 2 ? -1 : 1;
    const ang = Math.PI / 2 - side * (0.95 + r() * 0.45);
    const len = (0.12 - k * 0.008) * (0.7 + r() * 0.5);
    const pts = walk(at.x, at.y, ang, len, 0.004, 0.3, 0.018, r);
    const born = reach(s + 0.03);
    const subs = [];
    if (k < 7) {
      for (let j = 0; j < 3; j++) {
        const ss = len * (0.3 + j * 0.2 + r() * 0.1);
        const q = pts[Math.min(pts.length - 1, Math.round(ss / 0.004))];
        const a2 = Math.PI / 2 + (r() < 0.5 ? -1 : 1) * (0.6 + r() * 0.6);
        subs.push({ pts: walk(q.x, q.y, a2, 0.02 + r() * 0.03, 0.003, 0.4, 0.02, r), born: born + 6 + j * 4 + r() * 3 });
      }
    }
    laterals.push({ pts, born, len, subs });
  }

  // Stem hairs: poppies are bristly, and backlit bristles are half the look.
  const hairs = Array.from({ length: 260 }, () => ({ s: r(), side: r() < 0.5 ? -1 : 1, len: 0.004 + r() * 0.005, tilt: 0.3 + r() * 0.6 }));

  // Crumple noise for each petal, fixed per petal so it smooths rather than boils.
  const crumple = Array.from({ length: 4 }, () => Array.from({ length: 9 }, () => [r() - 0.5, r() - 0.5]));

  // Pollen: a few motes per falling note in the coda, and a burst when the flower opens.
  const motes = [];
  const emit = (at, n) => {
    for (let i = 0; i < n; i++) motes.push({ at, vx: (r() - 0.5) * 0.02, vy: -0.004 - r() * 0.008, ph: r() * TAU, sz: 0.0012 + r() * 0.0018, life: 5 + r() * 4 });
  };
  emit(cues.petals[7], 10);
  for (const at of cues.pollen) emit(at, 5);

  const swells = [];
  for (const s of cues.swells) if (!swells.length || s - swells[swells.length - 1] > 0.05) swells.push(s);

  return { cues, hyp, rootLife, main, laterals, hairs, crumple, motes, swells };
}

// ------------------------------------------------------------------ the stem --

/**
 * Integrate the stem's centreline from the seed upward. Returns the points and
 * the arc positions of every node, for this moment.
 */
function stemAt(P, t, env) {
  const { cues } = P;
  const Lh = P.hyp(t);
  const inter = INTERNODE.map((L, k) => {
    const a = cues.leaves[k] - 1.4;
    return L * (grow(span(t, a, a + 8)) * 0.9 + 0.1 * span(t, a, cues.end));
  });
  const ped = PEDUNCLE * (grow(span(t, cues.bud - 1, cues.bloom + 1)) * 0.94 + 0.06 * span(t, cues.bloom, cues.end));
  const total = Lh + inter.reduce((a, b) => a + b, 0) + ped;

  // The hook: the top of the hypocotyl bent right over while it is underground.
  const hook = 1 - ease(span(t, cues.emerge - 0.3, cues.cotyledons + 1.6));
  const HOOK = 0.028;
  // The nod: the last part of the flower stalk bent over until the lift.
  const nod = ease(span(t, cues.bud, cues.bud + 5)) * (1 - ease(span(t, cues.lift - 0.5, cues.bloom + 0.6)));
  // Circumnutation grows with the plant; phototropism leans it toward the sun.
  const height = Math.max(0, total - SEED_DEPTH);
  const nutAmp = 0.9 * clamp(height / 0.25) + 0.25;
  const lean = env.sunX * env.light * 0.55 + 0.12;

  const ds = 0.003;
  const pts = [];
  let x = 0, y = SEED_DEPTH, th = -Math.PI / 2 - 0.12, s = 0;
  pts.push({ x, y, th, s });
  while (s < total) {
    const step = Math.min(ds, total - s);
    let k = 0;
    // the hook sits at the hypocotyl's tip while that IS the tip
    if (s > Lh - HOOK && s <= Lh) k += (hook * Math.PI * 0.95) / HOOK;
    if (y < 0) {
      k += lean * 0.9 * (1 - s / (total + 0.2));
      k += nutAmp * Math.sin(t * 1.85 - s * 11) * 1.4;
    }
    if (s > total - ped * 0.55) k += (nod * 2.6) / (ped * 0.55 + 1e-6);
    th += k * step;
    x += Math.cos(th) * step; y += Math.sin(th) * step; s += step;
    pts.push({ x, y, th, s });
  }
  const nodes = [Lh];
  let acc = Lh;
  for (const L of inter) { acc += L; nodes.push(acc); }
  return { pts, total, Lh, inter, ped, nodes, hook, nod };
}

function sample(stem, s) {
  const { pts } = stem;
  if (s <= 0) return pts[0];
  if (s >= stem.total) return pts[pts.length - 1];
  const i = Math.min(pts.length - 2, Math.floor(s / 0.003));
  const a = pts[i], b = pts[i + 1];
  const f = (s - a.s) / Math.max(1e-9, b.s - a.s);
  return { x: lerp(a.x, b.x, f), y: lerp(a.y, b.y, f), th: lerp(a.th, b.th, f), s };
}

// ----------------------------------------------------------------- colours --

/** Light a surface colour for the time of day: blue and dim at night, warm at the ends. */
export function lit(c, env, extra = 0) {
  const night = mix(c, [18, 26, 58], 0.72);
  const warm = mix(c, [255, 170, 110], 0.22 * env.warm * env.light);
  const day = mix(warm, [255, 255, 255], 0.04 * env.light);
  return mix(night, day, clamp(env.light + extra));
}

const STEM = [96, 140, 88];
const STEM_HI = [168, 200, 140];
const LEAF = [94, 138, 104];
const LEAF_BACK = [128, 164, 128];
const COTY = [134, 170, 96];
const ROOT = [236, 226, 200];
const SEED = [110, 76, 50];
const PETAL = [228, 56, 36];
const PETAL_HI = [250, 118, 64];
const PETAL_SH = [160, 26, 22];
const BLOTCH = [28, 10, 22];
const SEPAL = [104, 138, 86];

// ----------------------------------------------------------------- drawing --

export function drawPlant(p, P, t, env) {
  const ctx = p.drawingContext;
  const { cues } = P;
  const stem = stemAt(P, t, env);

  drawRoots(ctx, P, t, env);

  const shooting = t >= cues.hypocotyl;
  if (!shooting) drawSeed(ctx, P, t, env, { x: 0, y: SEED_DEPTH, th: -0.35 }, null);

  // Leaves behind the stem, then the stem, then the rest.
  const droop = (1 - env.light) * 0.32;
  const leafSpecs = [];
  for (let k = 0; k < 6; k++) {
    const born = cues.leaves[k];
    if (t < born - 0.8) continue;
    const at = sample(stem, stem.nodes[k + 1]);
    const side = k % 2 ? -1 : 1;
    const unfold = ease(span(t, born - 0.3, born + 4.5));
    const size = grow(span(t, born - 0.8, born + 9)) * LEAF_LEN[k];
    const spread = lerp(0.12, 1.02 - k * 0.07, unfold) + droop * unfold;
    leafSpecs.push({ at, side, unfold, size, spread, k });
  }
  for (const L of leafSpecs) if (L.side < 0) drawLeaf(ctx, L, env);
  if (shooting) drawCotyledons(ctx, P, t, env, stem, droop);
  drawStem(ctx, P, t, env, stem);
  for (const L of leafSpecs) if (L.side > 0) drawLeaf(ctx, L, env);

  if (t >= cues.bud - 0.5) drawFlower(ctx, P, t, env, stem);
  drawCoat(ctx, P, t, env, stem);
  return stem;
}

// ---- roots

function drawRoots(ctx, P, t, env) {
  if (t < P.cues.root) return;
  const c = lit(ROOT, env, 0.35);
  ctx.lineCap = 'round';
  const path = (pts, len, w0, w1, alpha) => {
    if (len <= 0.001) return;
    const n = Math.min(pts.length - 1, Math.ceil(len / (pts[1].s - pts[0].s || 0.004)));
    for (let i = 0; i < n; i++) {
      const f = i / Math.max(1, n);
      ctx.strokeStyle = rgba(c, alpha * (0.55 + 0.45 * (1 - f)));
      ctx.lineWidth = lerp(w0, w1, f);
      ctx.beginPath();
      ctx.moveTo(pts[i].x, pts[i].y);
      ctx.lineTo(pts[i + 1].x, pts[i + 1].y);
      ctx.stroke();
    }
    // root hairs: a fuzz just behind the growing tip
    const tip = pts[n];
    ctx.strokeStyle = rgba(c, 0.25 * alpha);
    ctx.lineWidth = 0.0006;
    for (let j = 3; j < 9 && n - j > 0; j++) {
      const q = pts[n - j], q2 = pts[n - j + 1];
      const a = Math.atan2(q2.y - q.y, q2.x - q.x);
      for (const sg of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(q.x, q.y);
        ctx.lineTo(q.x + Math.cos(a + sg * 1.4) * 0.006, q.y + Math.sin(a + sg * 1.4) * 0.006);
        ctx.stroke();
      }
    }
    return tip;
  };
  const Lmain = P.rootLife(t);
  path(P.main, Lmain, 0.0055, 0.0018, 0.95);
  for (const L of P.laterals) {
    if (t < L.born) continue;
    const len = L.len * (1 - Math.exp(-(t - L.born) / 12));
    path(L.pts, len, 0.0026, 0.001, 0.85);
    for (const s of L.subs) {
      if (t < s.born) continue;
      const sl = (s.pts.length - 1) * 0.003 * (1 - Math.exp(-(t - s.born) / 8));
      path(s.pts, sl, 0.0013, 0.0006, 0.7);
    }
  }
}

// ---- the seed, and the coat it leaves behind

function drawSeed(ctx, P, t, env, at, open) {
  const { cues } = P;
  const swell = 1 + 0.28 * P.imbibed;
  const crack = ease(span(t, cues.crack, cues.crack + 1.2));
  ctx.save();
  ctx.translate(at.x, at.y);
  ctx.rotate(at.th);
  ctx.scale(swell, swell);
  const c = lit(mix(SEED, [150, 110, 72], P.imbibed * 0.5), env, 0.35);
  const gap = crack * 0.0022 + (open ?? 0) * 0.006;
  for (const sg of [-1, 1]) {
    ctx.fillStyle = rgba(sg < 0 ? c : mix(c, [0, 0, 0], 0.18));
    ctx.beginPath();
    ctx.ellipse(0, sg * gap * 0.5, 0.0145, 0.0095, 0, sg < 0 ? Math.PI : 0, sg < 0 ? TAU : Math.PI);
    ctx.fill();
  }
  ctx.fillStyle = rgba([255, 240, 220], 0.22);
  ctx.beginPath(); ctx.ellipse(-0.004, -0.0035, 0.006, 0.0025, -0.2, 0, TAU); ctx.fill();
  ctx.restore();
}

function drawCoat(ctx, P, t, env, stem) {
  const { cues } = P;
  if (t < cues.hypocotyl) return;
  const tip = sample(stem, stem.Lh);
  const falls = cues.coatFalls;
  if (t < falls) {
    // riding on the seed leaves, over their tips
    const open = ease(span(t, cues.cotyledons, cues.cotyledons + 2.6));
    const th = tip.th + open * 1.1;
    const x = tip.x + Math.cos(th) * 0.03, y = tip.y + Math.sin(th) * 0.03;
    drawSeed(ctx, P, cues.crack + 2, env, { x, y, th: th + 0.2 }, open * 0.7);
    return;
  }
  // shaken off: a short fall, a bounce, then it lies on the soil
  const th0 = tip.th + 1.1;
  const x0 = tip.x + Math.cos(th0) * 0.03, y0 = tip.y + Math.sin(th0) * 0.03;
  const f = clamp((t - falls) / 0.9);
  const xe = x0 + 0.05;
  const x = lerp(x0, xe, f);
  const y = lerp(y0, surfaceY(xe) - 0.004, f * f);
  drawSeed(ctx, P, cues.crack + 2, env, { x, y, th: th0 + f * 4.2 }, 0.9);
}

// ---- cotyledons (seed leaves)

function drawCotyledons(ctx, P, t, env, stem, droop) {
  const { cues } = P;
  const tip = sample(stem, stem.Lh);
  const open = ease(span(t, cues.cotyledons, cues.cotyledons + 2.6));
  const age = span(t, cues.bud, cues.end);                // yellowing as the plant moves on
  const size = 0.028 + 0.012 * grow(span(t, cues.cotyledons, cues.cotyledons + 8));
  const col = mix(COTY, [190, 180, 96], age * 0.55);
  for (const side of [-1, 1]) {
    const th = tip.th + side * lerp(0.08, 1.2 + droop, open);
    ctx.save();
    ctx.translate(tip.x, tip.y);
    ctx.rotate(th);
    ctx.fillStyle = rgba(lit(side < 0 ? mix(col, [0, 0, 0], 0.12) : col, env));
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.bezierCurveTo(size * 0.3, -size * 0.34 * lerp(0.3, 1, open), size * 1.05, -size * 0.3 * lerp(0.3, 1, open), size, 0);
    ctx.bezierCurveTo(size * 1.05, size * 0.3 * lerp(0.3, 1, open), size * 0.3, size * 0.34 * lerp(0.3, 1, open), 0, 0);
    ctx.fill();
    ctx.strokeStyle = rgba(lit(mix(col, [255, 255, 255], 0.25), env), 0.6);
    ctx.lineWidth = 0.0008;
    ctx.beginPath(); ctx.moveTo(size * 0.1, 0); ctx.lineTo(size * 0.85, 0); ctx.stroke();
    ctx.restore();
  }
}

// ---- the stem

function drawStem(ctx, P, t, env, stem) {
  const { pts, total } = stem;
  if (pts.length < 2) return;
  const age = clamp((t - P.cues.hypocotyl) / 60);
  const w0 = lerp(0.0045, 0.0085, age), w1 = 0.0034;
  const width = (s) => lerp(w0, w1, clamp(s / Math.max(0.1, total)));
  const L = [], R = [];
  for (const q of pts) {
    const w = width(q.s) / 2;
    const nx = -Math.sin(q.th), ny = Math.cos(q.th);
    L.push([q.x + nx * w, q.y + ny * w]);
    R.push([q.x - nx * w, q.y - ny * w]);
  }
  // Below ground the stem is paler: no light has reached it yet.
  const g = ctx.createLinearGradient(0, SEED_DEPTH, 0, -0.05);
  g.addColorStop(0, rgba(lit([214, 210, 170], env, 0.35)));
  g.addColorStop(1, rgba(lit(STEM, env)));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(L[0][0], L[0][1]);
  for (const q of L) ctx.lineTo(q[0], q[1]);
  for (let i = R.length - 1; i >= 0; i--) ctx.lineTo(R[i][0], R[i][1]);
  ctx.closePath();
  ctx.fill();

  // Lit edge, on the sun's side.
  const side = env.sunX >= 0 ? 1 : -1;
  ctx.strokeStyle = rgba(lit(STEM_HI, env), 0.55);
  ctx.lineWidth = 0.0012;
  ctx.beginPath();
  pts.forEach((q, i) => {
    const w = width(q.s) * 0.28 * side;
    const x = q.x + -Math.sin(q.th) * -w, y = q.y + Math.cos(q.th) * -w;
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  });
  ctx.stroke();

  // Bristles, above ground only; they catch low light.
  const glow = 0.25 + 0.6 * env.warm * env.light;
  ctx.strokeStyle = rgba(mix([220, 230, 210], [255, 214, 160], env.warm), glow * (0.3 + 0.7 * env.light));
  ctx.lineWidth = 0.0005;
  ctx.beginPath();
  for (const h of P.hairs) {
    const q = sample(stem, h.s * total);
    if (q.y > -0.004) continue;
    const w = width(q.s) / 2;
    const a = q.th + h.side * h.tilt;
    const bx = q.x - Math.sin(q.th) * w * h.side, by = q.y + Math.cos(q.th) * w * h.side;
    ctx.moveTo(bx, by);
    ctx.lineTo(bx + Math.cos(a) * h.len, by + Math.sin(a) * h.len);
  }
  ctx.stroke();
}

// ---- true leaves: lobed, blue-green, unfolding from the midrib

function drawLeaf(ctx, L, env) {
  const { at, side, unfold, size, spread, k } = L;
  if (size < 0.002) return;
  const th = at.th + side * spread;
  const W = size * 0.3 * lerp(0.18, 1, unfold);
  const curl = side * lerp(0.2, 0.55, unfold);           // the blade arches away from the stem
  const N = 22;
  const mid = [];
  let x = 0, y = 0, a = 0;
  for (let i = 0; i <= N; i++) {
    const u = i / N;
    mid.push({ x, y, a, u });
    a += (curl / N) * (u > 0.2 ? 1.4 : 0.2);
    x += Math.cos(a) * size / N; y += Math.sin(a) * size / N;
  }
  const half = (u) => {
    if (u < 0.16) return W * 0.06;                        // petiole
    const b = (u - 0.16) / 0.84;
    const env0 = Math.pow(Math.sin(Math.PI * Math.pow(b, 0.8)), 0.85);
    const lobes = 0.78 + 0.22 * Math.abs(Math.sin(b * Math.PI * 4.5 + k));
    return W * env0 * lobes;
  };
  const edge = (sg) => mid.map((q) => [q.x - Math.sin(q.a) * half(q.u) * sg, q.y + Math.cos(q.a) * half(q.u) * sg]);
  ctx.save();
  ctx.translate(at.x, at.y);
  ctx.rotate(th);
  // The half turned away is seen from beneath: paler, and narrower while it is still folded.
  for (const sg of [side, -side]) {
    const e = edge(sg);
    const under = sg === side;
    const c = under ? mix(LEAF_BACK, LEAF, unfold * 0.6) : LEAF;
    ctx.fillStyle = rgba(lit(c, env));
    ctx.beginPath();
    ctx.moveTo(mid[0].x, mid[0].y);
    for (const q of e) ctx.lineTo(q[0], q[1]);
    for (let i = mid.length - 1; i >= 0; i--) ctx.lineTo(mid[i].x, mid[i].y);
    ctx.fill();
  }
  // Midrib and veins.
  ctx.strokeStyle = rgba(lit([196, 216, 170], env), 0.55);
  ctx.lineWidth = 0.0011;
  ctx.beginPath();
  mid.forEach((q, i) => (i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y)));
  ctx.stroke();
  ctx.lineWidth = 0.0006;
  ctx.beginPath();
  for (let i = 6; i < N - 1; i += 3) {
    const q = mid[i];
    for (const sg of [-1, 1]) {
      const h = half(q.u) * 0.8;
      const va = q.a + sg * 0.9;
      ctx.moveTo(q.x, q.y);
      ctx.lineTo(q.x + Math.cos(va) * h, q.y + Math.sin(va) * h);
    }
  }
  ctx.stroke();
  ctx.restore();
}

// ---- the flower

const V = {
  add: (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]],
  sc: (a, s) => [a[0] * s, a[1] * s, a[2] * s],
  dot: (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2],
  cross: (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]],
  norm: (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; },
};

function drawFlower(ctx, P, t, env, stem) {
  const { cues } = P;
  const tip = sample(stem, stem.total);
  const pc = cues.petals;                                  // eight notes, eight stages
  // Bud size: grows through the bud section, with a little push on each chord.
  let pulse = 0;
  for (const s of P.swells) if (t >= s) pulse += Math.exp(-(t - s) / 0.35) * 0.05;
  const budGrow = grow(span(t, cues.bud - 0.5, cues.bloom - 1)) * (1 + pulse);
  const bl = 0.062 * budGrow, bw = 0.046 * budGrow;
  const dir = [Math.cos(tip.th), Math.sin(tip.th)];

  // Before the first cascade note: a closed, bristly bud.
  const sepalGone = (i) => span(t, pc[i], pc[i] + 1.3);
  if (t < pc[0]) { drawBud(ctx, tip, bl, bw, env, t, cues); return; }

  // Flower frame: the axis follows the stalk, tipped toward the viewer.
  const tilt = 1.02;
  const n = V.norm([dir[0] * Math.cos(tilt), dir[1] * Math.cos(tilt), Math.sin(tilt)]);
  const r1 = V.norm(V.cross(n, [0, 0, 1]));
  const r2 = V.cross(n, r1);
  const C = [tip.x, tip.y, 0];
  const proj = (q) => [q[0], q[1]];

  const petals = [0, 1, 2, 3].map((i) => {
    const az = (i * TAU) / 4 + TAU / 8 + (i % 2 ? 0.08 : -0.05);
    const ra = V.add(V.sc(r1, Math.cos(az)), V.sc(r2, Math.sin(az)));
    const ta = V.cross(n, ra);
    const o = ease(span(t, pc[i + 2] - 0.4, pc[i + 2] + 5.2));
    return { i, az, ra, ta, o, z: ra[2] };
  });

  const drawPetal = (pt) => {
    const { i, ra, ta, o } = pt;
    const big = i % 2 ? 0.92 : 1.0;
    const crump = Math.pow(1 - o, 1.3);
    const Lp = 0.118 * big * lerp(0.42, 1, o) * budGrow;
    const Wp = 0.1 * big * lerp(0.36, 1, o) * budGrow;
    const a0 = lerp(0.08, 0.62, o), a1 = lerp(0.1, 0.62, o);
    const cup = lerp(0.42, 0.16, o);
    const U = 14;
    const midl = [];
    let m = [0, 0, 0];
    for (let j = 0; j <= U; j++) {
      const u = j / U;
      const al = a0 + a1 * u;
      const d = V.add(V.sc(n, Math.cos(al)), V.sc(ra, Math.sin(al)));
      const nn = V.add(V.sc(n, -Math.sin(al)), V.sc(ra, Math.cos(al)));   // inward-facing normal
      midl.push({ m, d, nn, u });
      m = V.add(m, V.sc(d, Lp / U));
    }
    const cr = P.crumple[i];
    const half = (u) => Wp * Math.pow(u, 0.55) * Math.sqrt(Math.max(0, 1 - Math.pow(u, 3.4))) * (1 + 0.05 * Math.sin(u * 17 + i));
    const pt3 = (j, v) => {
      const q = midl[j];
      const u = q.u;
      const c = cr[Math.min(8, Math.floor(u * 8))];
      const h = half(u) * (1 + crump * 0.4 * c[0]);
      let w = V.add(q.m, V.sc(ta, h * v));
      w = V.add(w, V.sc(q.nn, -(v * v) * cup * Lp + crump * c[1] * 0.35 * Wp * Math.abs(v)));
      return V.add(C, w);
    };
    const outline = [];
    for (let j = 0; j <= U; j++) outline.push(proj(pt3(j, -1)));
    for (let j = U; j >= 0; j--) outline.push(proj(pt3(j, 1)));
    const tip2 = proj(V.add(C, midl[U].m));
    // Which face do we see? The inside faces the viewer when its normal has +z.
    const inside = midl[Math.floor(U * 0.6)].nn[2] >= 0;
    const g = ctx.createLinearGradient(C[0], C[1], tip2[0], tip2[1]);
    const shade = (c) => rgba(lit(inside ? c : mix(c, PETAL_HI, 0.35), env, 0.1));
    // The black blotch is on the inside of a poppy petal only; the outside is plain.
    const base = inside ? BLOTCH : mix(PETAL_SH, PETAL, 0.3);
    g.addColorStop(0, shade(base));
    g.addColorStop(0.2 * o + 0.02, shade(base));
    g.addColorStop(Math.min(0.99, 0.2 * o + 0.1), shade(PETAL_SH));
    g.addColorStop(0.6, shade(mix(PETAL, PETAL_SH, crump * 0.4)));
    g.addColorStop(1, shade(mix(PETAL_HI, PETAL, crump * 0.5)));
    ctx.fillStyle = g;
    ctx.beginPath();
    outline.forEach((q, j) => (j ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1])));
    ctx.closePath();
    ctx.fill();
    // veins, and the creases the crumpling left
    ctx.strokeStyle = rgba(lit(PETAL_SH, env), 0.18 + crump * 0.25);
    ctx.lineWidth = 0.0006;
    ctx.beginPath();
    for (const v of [-0.6, -0.25, 0.1, 0.45, 0.75]) {
      for (let j = 3; j <= U - 1; j++) {
        const q = proj(pt3(j, v));
        if (j === 3) ctx.moveTo(q[0], q[1]); else ctx.lineTo(q[0], q[1]);
      }
    }
    ctx.stroke();
    // a thin bright rim where the light comes through
    ctx.strokeStyle = rgba(mix([255, 150, 90], [255, 200, 140], env.warm), 0.35 * env.light);
    ctx.lineWidth = 0.0009;
    ctx.beginPath();
    for (let j = Math.floor(U * 0.55); j <= U; j++) { const q = proj(pt3(j, -1)); if (j === Math.floor(U * 0.55)) ctx.moveTo(q[0], q[1]); else ctx.lineTo(q[0], q[1]); }
    for (let j = U; j >= Math.floor(U * 0.55); j--) { const q = proj(pt3(j, 1)); ctx.lineTo(q[0], q[1]); }
    ctx.stroke();
  };

  const back = petals.filter((q) => q.z < 0).sort((a, b) => a.z - b.z);
  const front = petals.filter((q) => q.z >= 0).sort((a, b) => a.z - b.z);

  // A glow behind the flower on the last cascade note.
  const glow = Math.exp(-Math.max(0, t - pc[7]) / 2.2) * (t >= pc[7] - 0.05 ? 1 : 0);
  if (glow > 0.01) {
    const gg = ctx.createRadialGradient(tip.x, tip.y, 0, tip.x, tip.y, 0.16);
    gg.addColorStop(0, `rgba(255,214,150,${0.35 * glow})`);
    gg.addColorStop(1, 'rgba(255,214,150,0)');
    ctx.fillStyle = gg;
    ctx.beginPath(); ctx.arc(tip.x, tip.y, 0.16, 0, TAU); ctx.fill();
  }

  // Closed, the front petals hide the centre; open, we look down into the cup
  // and the seed head sits in front of the front petals' bases.
  const centre = () => drawCentre(ctx, C, n, r1, r2, ease(span(t, pc[6] - 0.3, pc[6] + 3)) * ease(span(t, pc[2], pc[5])), env, budGrow);
  const openness = petals.reduce((a, q) => a + q.o, 0) / 4;
  for (const q of back) drawPetal(q);
  if (openness < 0.5) centre();
  for (const q of front) drawPetal(q);
  if (openness >= 0.5) centre();

  // The sepals, splitting and falling on the first two notes.
  for (let i = 0; i < 2; i++) {
    const f = sepalGone(i);
    if (f >= 1) { drawFallenSepal(ctx, tip, i, env, bl, bw); continue; }
    drawSepal(ctx, tip, i, f, bl, bw, env);
  }
  drawPollen(ctx, P, t, env, tip);
}

function drawBud(ctx, tip, bl, bw, env, t, cues) {
  if (bl < 0.002) return;
  ctx.save();
  ctx.translate(tip.x, tip.y);
  ctx.rotate(tip.th);
  const c = lit(SEPAL, env);
  ctx.fillStyle = rgba(c);
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.bezierCurveTo(-bl * 0.02, -bw * 0.78, bl * 0.86, -bw * 0.74, bl, 0);
  ctx.bezierCurveTo(bl * 0.86, bw * 0.74, -bl * 0.02, bw * 0.78, 0, 0);
  ctx.fill();
  // a soft highlight on the lit flank
  ctx.fillStyle = rgba(lit([190, 214, 170], env), 0.35);
  ctx.beginPath(); ctx.ellipse(bl * 0.5, -bw * 0.2, bl * 0.3, bw * 0.16, 0, 0, TAU); ctx.fill();
  // The seam, and a line of red showing through it as the day comes.
  const red = ease(span(t, cues.lift - 1, cues.petals[0]));
  ctx.strokeStyle = rgba(lit(mix([60, 90, 60], PETAL, red), env), 0.5 + red * 0.4);
  ctx.lineWidth = 0.0009 + red * 0.0022;
  ctx.beginPath();
  ctx.moveTo(bl * 0.12, bw * 0.05);
  ctx.quadraticCurveTo(bl * 0.55, bw * 0.12, bl * 0.98, 0);
  ctx.stroke();
  drawBristles(ctx, bl, bw, env, 0);
  ctx.restore();
}

function drawBristles(ctx, bl, bw, env, seed) {
  ctx.strokeStyle = rgba(mix([225, 235, 215], [255, 214, 160], env.warm), 0.25 + 0.5 * env.light * (0.4 + env.warm));
  ctx.lineWidth = 0.0005;
  ctx.beginPath();
  for (let i = 0; i < 26; i++) {
    const u = (i + 0.5) / 26;
    const sg = i % 2 ? 1 : -1;
    const x = bl * u;
    const y = sg * bw * 0.58 * Math.sin(Math.PI * Math.pow(u, 0.75)) ;
    const a = Math.atan2(sg, 0.4 + seed);
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(a) * 0.004, y + Math.sin(a) * 0.004 * 1.2);
  }
  ctx.stroke();
}

function sepalShape(ctx, bl, bw, sg) {
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.bezierCurveTo(bl * 0.05, sg * bw * 0.7, bl * 0.8, sg * bw * 0.62, bl, 0);
  ctx.quadraticCurveTo(bl * 0.5, sg * bw * 0.1, 0, 0);
  ctx.fill();
}

function drawSepal(ctx, tip, i, f, bl, bw, env) {
  const sg = i === 0 ? -1 : 1;
  ctx.save();
  ctx.translate(tip.x, tip.y);
  ctx.rotate(tip.th + sg * (0.2 + f * 1.4));
  ctx.translate(0, f * f * 0.12 * (sg * 0.2) );
  ctx.globalAlpha = 1 - f * 0.1;
  ctx.fillStyle = rgba(lit(i ? SEPAL : mix(SEPAL, [0, 0, 0], 0.1), env));
  sepalShape(ctx, bl, bw, sg);
  ctx.restore();
  // falling: drawn in world space along a drop
  if (f > 0.35) {
    // nothing extra — the fallen sepal takes over at f = 1
  }
}

function drawFallenSepal(ctx, tip, i, env, bl, bw) {
  const x = tip.x + (i ? 0.07 : -0.09);
  const y = surfaceY(x) - 0.003;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(i ? 0.15 : Math.PI - 0.1);
  ctx.fillStyle = rgba(lit(mix(SEPAL, [150, 140, 90], 0.3), env));
  sepalShape(ctx, bl * 0.9, bw * 0.55, 1);
  ctx.restore();
}

function drawCentre(ctx, C, n, r1, r2, spread, env, scale) {
  const ring = (rad, h, k = 24) => {
    const out = [];
    for (let j = 0; j < k; j++) {
      const a = (j / k) * TAU;
      const q = V.add(V.add(C, V.sc(n, h)), V.add(V.sc(r1, Math.cos(a) * rad), V.sc(r2, Math.sin(a) * rad)));
      out.push([q[0], q[1], a]);
    }
    return out;
  };
  const s = scale * 1.45;
  // stamens: a dense, uneven crown of dark filaments that splay outward
  const at = (rad, h, a) => {
    const q = V.add(V.add(C, V.sc(n, h)), V.add(V.sc(r1, Math.cos(a) * rad), V.sc(r2, Math.sin(a) * rad)));
    return [q[0], q[1]];
  };
  const K = 90;
  const tips = [];
  ctx.strokeStyle = rgba(lit([54, 26, 52], env, 0.2), 0.85);
  ctx.lineWidth = 0.0005;
  ctx.beginPath();
  for (let j = 0; j < K; j++) {
    const a = j * 2.39996;                                   // golden angle: no visible rows
    const jit = 0.5 + 0.5 * Math.sin(j * 12.9898) ** 2;
    const b0 = at(0.008 * s, 0.003 * s, a);
    const tp = at((0.01 + (0.012 + 0.008 * jit) * spread) * s, (0.008 + 0.006 * jit * (1 - spread * 0.5)) * s, a);
    ctx.moveTo(b0[0], b0[1]); ctx.lineTo(tp[0], tp[1]);
    tips.push(tp);
  }
  ctx.stroke();
  const anther = rgba(lit([46, 22, 44], env, 0.2));
  const pollen = rgba(lit([250, 214, 110], env, 0.3), 0.8 * spread);
  for (const q of tips) {
    ctx.fillStyle = anther;
    ctx.beginPath(); ctx.arc(q[0], q[1], 0.0013 * s, 0, TAU); ctx.fill();
  }
  ctx.fillStyle = pollen;
  for (let j = 0; j < K; j += 2) { const q = tips[j]; ctx.beginPath(); ctx.arc(q[0] + 0.0005, q[1] - 0.0005, 0.0007 * s, 0, TAU); ctx.fill(); }
  // the seed head: a pale dome with a dark rayed stigma disc on top
  const dome = ring(0.0085 * s, 0.012 * s);
  ctx.fillStyle = rgba(lit([172, 190, 150], env, 0.2));
  ctx.beginPath(); dome.forEach((q, j) => (j ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]))); ctx.fill();
  const disc = ring(0.0095 * s, 0.017 * s);
  ctx.fillStyle = rgba(lit([88, 42, 86], env, 0.2));
  ctx.beginPath(); disc.forEach((q, j) => (j ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]))); ctx.fill();
  const mid = V.add(C, V.sc(n, 0.018 * s));
  ctx.strokeStyle = rgba(lit([200, 170, 200], env, 0.2), 0.7);
  ctx.lineWidth = 0.0006;
  ctx.beginPath();
  for (let j = 0; j < 24; j += 3) { ctx.moveTo(mid[0], mid[1]); ctx.lineTo(disc[j][0], disc[j][1]); }
  ctx.stroke();
}

function drawPollen(ctx, P, t, env, tip) {
  for (const m of P.motes) {
    const a = t - m.at;
    if (a < 0 || a > m.life) continue;
    const x = tip.x + m.vx * a + Math.sin(a * 1.3 + m.ph) * 0.006;
    const y = tip.y - 0.012 + m.vy * a + Math.cos(a * 0.9 + m.ph) * 0.003;
    const al = Math.sin(Math.PI * (a / m.life)) * (0.5 + 0.5 * env.light);
    const g = ctx.createRadialGradient(x, y, 0, x, y, m.sz * 3);
    g.addColorStop(0, `rgba(255,222,140,${al})`);
    g.addColorStop(1, 'rgba(255,222,140,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(x, y, m.sz * 3, 0, TAU); ctx.fill();
  }
}

/** Where the flower is (for the camera), in plant units. */
export function flowerPoint(P, t, env) {
  const stem = stemAt(P, t, env);
  return sample(stem, stem.total);
}

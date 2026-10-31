// critters.js — the dex. 151 monsters in evolution lines, drawn by this file.
//
// His experiment ran on Pokémon sprites. Those are Nintendo's pictures, and
// this site serves no picture it did not draw (see ../CLAUDE.md), so the
// experiment runs here on a dex of our own that is built to the same brief:
// 151 entries, 56×56, four shades, evolution lines of one to three stages in
// which the creature grows, sprouts things, and changes proportion. The
// lines are the ground truth. Whether bzip can find them is the question.
//
// No DOM in this file: the selftest imports it to measure the hit rate
// against the same pixels the page shows.
//
// Pixels are shade indices, one per byte:
//   0 paper   1 light   2 mid   3 ink (outline, eyes)

export const W = 56;
export const H = 56;
export const SIZE = W * H;

export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const ARCHETYPES = ['blob', 'biped', 'quad', 'bird', 'fish', 'serpent', 'bug', 'plant'];

// How many lines of each length. Close to the first generation's own mix,
// which also had a few lines that branch; these do not.
export const LINE_MIX = { 3: 24, 2: 30, 1: 19 };

// ------------------------------------------------------------- shapes ----
//
// A creature is a list of shapes in a unit box: x 0..1 left to right, y 0..1
// top to bottom, feet at y = 1. Later shapes paint over earlier ones. Each
// carries a fill: 1 light, 2 mid, or 'eye'.

const ell = (cx, cy, rx, ry, fill) => ({ k: 'e', cx, cy, rx, ry, fill });
const cap = (ax, ay, bx, by, r, fill) => ({ k: 'c', ax, ay, bx, by, r, fill });
const tri = (ax, ay, bx, by, cx, cy, fill) => ({ k: 't', ax, ay, bx, by, cx, cy, fill });

function inside(s, x, y) {
  if (s.k === 'e') {
    const dx = (x - s.cx) / s.rx, dy = (y - s.cy) / s.ry;
    return dx * dx + dy * dy <= 1;
  }
  if (s.k === 'c') {
    const vx = s.bx - s.ax, vy = s.by - s.ay;
    const l2 = vx * vx + vy * vy || 1e-9;
    const t = Math.max(0, Math.min(1, ((x - s.ax) * vx + (y - s.ay) * vy) / l2));
    const dx = x - (s.ax + t * vx), dy = y - (s.ay + t * vy);
    return dx * dx + dy * dy <= s.r * s.r;
  }
  const d1 = (x - s.bx) * (s.ay - s.by) - (s.ax - s.bx) * (y - s.by);
  const d2 = (x - s.cx) * (s.by - s.cy) - (s.bx - s.cx) * (y - s.cy);
  const d3 = (x - s.ax) * (s.cy - s.ay) - (s.cx - s.ax) * (y - s.ay);
  const neg = d1 < 0 || d2 < 0 || d3 < 0, pos = d1 > 0 || d2 > 0 || d3 > 0;
  return !(neg && pos);
}

const mirror = (shapes) => shapes.flatMap((s) => {
  const m = { ...s };
  if (s.k === 'e') m.cx = 1 - s.cx;
  else if (s.k === 'c') { m.ax = 1 - s.ax; m.bx = 1 - s.bx; }
  else { m.ax = 1 - s.ax; m.bx = 1 - s.bx; m.cx = 1 - s.cx; }
  return [s, m];
});

// ------------------------------------------------------------ genomes ----
//
// A line shares one genome. A stage reads it at a growth `g` from 0 (the
// first form) to 1 (the last), and switches on the features whose `at` it
// has reached. Size is set separately: first forms are small, last forms
// fill the frame — which is how the real ones are drawn too, and it is going
// to matter.

function genome(r) {
  const pick = (a) => a[Math.floor(r() * a.length)];
  const body = r() < 0.55 ? 1 : 2;
  return {
    type: pick(ARCHETYPES),
    body,
    accent: body === 1 ? 2 : 1,
    fat: 0.8 + r() * 0.5,
    tall: 0.8 + r() * 0.5,
    head: 0.75 + r() * 0.5,
    eyes: pick(['dot', 'big', 'slit', 'pair']),
    belly: r() < 0.6,
    spots: r() < 0.35 ? 2 + Math.floor(r() * 4) : 0,
    lean: (r() - 0.5) * 0.12,
    // features, each arriving at some stage; `at` 0 means from the start
    feats: [
      { f: pick(['ears', 'horns', 'antenna', 'crest', 'none']), at: r() < 0.5 ? 0 : 0.5 },
      { f: pick(['tail', 'spikes', 'wings', 'mane', 'fins', 'none']), at: r() < 0.4 ? 0.5 : 1 },
      { f: pick(['horns', 'spikes', 'crest', 'tail', 'none']), at: 1 },
    ],
    jitter: r(),
  };
}

function has(gn, g, f) {
  return gn.feats.some((x) => x.f === f && g >= x.at - 1e-9);
}

function shapesFor(gn, g) {
  const B = gn.body, A = gn.accent;
  const s = [];
  const fat = gn.fat * (0.9 + 0.2 * g), tall = gn.tall * (0.92 + 0.16 * g);
  const headR = 0.17 * gn.head * (1.15 - 0.3 * g); // heads shrink, relatively, as they grow up
  const sym = [];
  const eyes = (cx, cy, r, front) => {
    const er = gn.eyes === 'big' ? r * 0.32 : gn.eyes === 'slit' ? r * 0.16 : r * 0.22;
    const ey = gn.eyes === 'slit' ? er * 1.9 : er;
    const out = [];
    if (front) {
      out.push(ell(cx - r * 0.42, cy - r * 0.1, er, ey, 'eye'), ell(cx + r * 0.42, cy - r * 0.1, er, ey, 'eye'));
    } else {
      out.push(ell(cx - r * 0.35, cy - r * 0.15, er, ey, 'eye'));
      if (gn.eyes === 'pair') out.push(ell(cx + r * 0.1, cy - r * 0.2, er * 0.8, ey * 0.8, 'eye'));
    }
    return out;
  };
  const headFeats = (cx, cy, r, front) => {
    const out = [];
    if (has(gn, g, 'ears')) {
      const e = [tri(cx - r * 0.85, cy - r * 0.2, cx - r * 0.25, cy - r * 0.75, cx - r * 0.75, cy - r * (1.5 + 0.4 * g), B)];
      out.push(...(front ? mirror(e) : [...e, tri(cx + r * 0.1, cy - r * 0.8, cx + r * 0.6, cy - r * 0.5, cx + r * 0.3, cy - r * (1.5 + 0.4 * g), B)]));
    }
    if (has(gn, g, 'horns')) {
      const h = [tri(cx - r * 0.5, cy - r * 0.6, cx - r * 0.15, cy - r * 0.8, cx - r * (0.6 + 0.3 * g), cy - r * (1.4 + 0.6 * g), A)];
      out.push(...(front ? mirror(h) : [...h, tri(cx + r * 0.2, cy - r * 0.85, cx + r * 0.5, cy - r * 0.7, cx + r * 0.55, cy - r * (1.35 + 0.6 * g), A)]));
    }
    if (has(gn, g, 'antenna')) {
      const a = [cap(cx - r * 0.3, cy - r * 0.8, cx - r * 0.6, cy - r * 1.6, 0.012, A), ell(cx - r * 0.6, cy - r * 1.65, r * 0.18, r * 0.18, A)];
      out.push(...(front ? mirror(a) : a));
    }
    if (has(gn, g, 'crest')) {
      for (let i = 0; i < 2 + Math.round(2 * g); i++) {
        const x = cx - r * 0.4 + i * r * 0.32;
        out.push(tri(x - r * 0.18, cy - r * 0.85, x + r * 0.18, cy - r * 0.85, x + r * 0.05, cy - r * (1.35 + 0.25 * g), A));
      }
    }
    return out;
  };

  switch (gn.type) {
    case 'blob': {
      const rx = 0.3 * fat, ry = 0.3 * tall;
      s.push(...headFeats(0.5, 1 - 2 * ry + headR, ry * 0.9, true));
      if (has(gn, g, 'wings')) s.push(...mirror([ell(0.5 - rx * 1.05, 1 - ry * 1.3, rx * 0.55, ry * 0.4, A)]));
      if (has(gn, g, 'spikes')) for (let i = 0; i < 5; i++) {
        const a = Math.PI * (0.15 + 0.7 * i / 4);
        s.push(tri(0.5 - Math.cos(a) * rx * 0.8, 1 - ry - Math.sin(a) * ry * 0.8, 0.5 - Math.cos(a + 0.25) * rx * 0.8, 1 - ry - Math.sin(a + 0.25) * ry * 0.8, 0.5 - Math.cos(a + 0.12) * rx * 1.35, 1 - ry - Math.sin(a + 0.12) * ry * 1.35, A));
      }
      s.push(ell(0.5, 1 - ry, rx, ry, B));
      if (gn.belly) s.push(ell(0.5, 1 - ry * 0.7, rx * 0.6, ry * 0.5, A));
      s.push(...mirror([ell(0.5 - rx * 0.55, 1 - 0.03, rx * 0.25, 0.04, B)]));
      s.push(...eyes(0.5, 1 - ry * 1.2, ry * 0.8, true));
      break;
    }
    case 'biped': {
      const bw = 0.2 * fat, bh = 0.26 * tall;
      const by = 1 - 0.1 - bh, hy = by - bh - headR * 0.6;
      if (has(gn, g, 'tail')) s.push(cap(0.5 + bw * 0.5, by + bh * 0.5, 0.5 + bw * (1.8 + g), by - bh * (0.2 + 0.6 * g), 0.04 + 0.02 * g, A));
      if (has(gn, g, 'wings')) s.push(...mirror([tri(0.5 - bw * 0.4, by - bh * 0.6, 0.5 - bw * 0.3, by + bh * 0.2, 0.5 - bw * (2.3 + g), by - bh * (1.2 + 0.5 * g), A)]));
      if (has(gn, g, 'mane')) s.push(ell(0.5, hy + headR * 0.3, headR * 1.5, headR * 1.3, A));
      s.push(...mirror([cap(0.5 - bw * 0.5, by + bh * 0.6, 0.5 - bw * 0.6, 1 - 0.03, 0.05 * fat, B)]));
      s.push(ell(0.5, by, bw, bh, B));
      if (gn.belly) s.push(ell(0.5, by + bh * 0.15, bw * 0.6, bh * 0.65, A));
      s.push(...mirror([cap(0.5 - bw * 0.85, by - bh * 0.4, 0.5 - bw * (1.3 + 0.3 * g), by + bh * 0.2, 0.035 * fat, B)]));
      if (has(gn, g, 'spikes')) for (let i = 0; i < 3; i++) s.push(...mirror([tri(0.5 - bw * 0.9, by - bh * 0.6 + i * bh * 0.4, 0.5 - bw * 0.95, by - bh * 0.3 + i * bh * 0.4, 0.5 - bw * 1.5, by - bh * 0.7 + i * bh * 0.4, A)]));
      s.push(...headFeats(0.5, hy, headR, true));
      s.push(ell(0.5, hy, headR * 1.05, headR, B));
      s.push(...eyes(0.5, hy, headR, true));
      break;
    }
    case 'quad': {
      const bw = 0.33 * fat, bh = 0.16 * tall;
      const by = 1 - 0.15 - bh, hx = 0.5 - bw * 0.95, hy = by - bh * 0.9;
      if (has(gn, g, 'tail')) s.push(cap(0.5 + bw * 0.8, by - bh * 0.2, 0.5 + bw * (1.2 + 0.3 * g), by - bh * (1.3 + 1.0 * g), 0.035 + 0.02 * g, A));
      for (const lx of [-0.65, -0.35, 0.4, 0.7]) s.push(cap(0.5 + bw * lx, by, 0.5 + bw * lx, 1 - 0.03, 0.045 * fat, lx < 0 && lx > -0.5 || lx > 0.5 ? A : B));
      if (has(gn, g, 'wings')) s.push(tri(0.5 - bw * 0.2, by - bh * 0.7, 0.5 + bw * 0.5, by - bh * 0.8, 0.5 + bw * (0.6 + 0.4 * g), by - bh * (3 + 1.5 * g), A));
      s.push(ell(0.5, by, bw, bh, B));
      if (gn.belly) s.push(ell(0.5, by + bh * 0.45, bw * 0.75, bh * 0.45, A));
      if (has(gn, g, 'spikes')) for (let i = 0; i < 4; i++) s.push(tri(0.5 - bw * 0.5 + i * bw * 0.35, by - bh * 0.85, 0.5 - bw * 0.25 + i * bw * 0.35, by - bh * 0.85, 0.5 - bw * 0.4 + i * bw * 0.35, by - bh * (1.6 + 0.4 * g), A));
      if (has(gn, g, 'mane')) s.push(ell(hx + headR * 0.6, hy + headR * 0.2, headR * 1.4, headR * 1.4, A));
      s.push(...headFeats(hx, hy, headR, false));
      s.push(ell(hx, hy, headR * 1.15, headR, B));
      s.push(ell(hx - headR * 0.9, hy + headR * 0.3, headR * 0.45, headR * 0.35, B));
      s.push(...eyes(hx, hy, headR, false));
      break;
    }
    case 'bird': {
      const bw = 0.2 * fat, bh = 0.22 * tall;
      const by = 1 - 0.12 - bh, hy = by - bh - headR * 0.5;
      const span = 1.8 + 1.3 * g + (has(gn, g, 'wings') ? 0.6 : 0);
      s.push(tri(0.5 - bw * 0.4, by + bh * 0.6, 0.5 + bw * 0.4, by + bh * 0.6, 0.5, 1 - 0.01 - 0.02 * g, A));
      s.push(...mirror([tri(0.5 - bw * 0.5, by - bh * 0.5, 0.5 - bw * 0.4, by + bh * 0.5, 0.5 - bw * span, by - bh * (0.3 + 0.8 * g), A)]));
      s.push(...mirror([cap(0.5 - bw * 0.35, by + bh * 0.8, 0.5 - bw * 0.4, 1 - 0.02, 0.02, 2)]));
      s.push(ell(0.5, by, bw, bh, B));
      if (gn.belly) s.push(ell(0.5, by + bh * 0.25, bw * 0.6, bh * 0.6, A));
      s.push(...headFeats(0.5, hy, headR, true));
      s.push(ell(0.5, hy, headR, headR * 0.95, B));
      s.push(tri(0.5 - headR * 0.3, hy + headR * 0.2, 0.5 + headR * 0.3, hy + headR * 0.2, 0.5, hy + headR * (0.9 + 0.3 * g), A));
      s.push(...eyes(0.5, hy - headR * 0.1, headR, true));
      break;
    }
    case 'fish': {
      const bw = 0.32 * fat, bh = 0.2 * tall;
      const by = 0.6, bx = 0.48;
      s.push(tri(bx + bw * 0.8, by, bx + bw * (1.5 + 0.3 * g), by - bh * (0.9 + 0.3 * g), bx + bw * (1.5 + 0.3 * g), by + bh * (0.9 + 0.3 * g), A));
      if (has(gn, g, 'fins') || has(gn, g, 'spikes') || g > 0.4) s.push(tri(bx - bw * 0.3, by - bh * 0.7, bx + bw * 0.4, by - bh * 0.7, bx + bw * 0.2, by - bh * (1.6 + 0.6 * g), A));
      if (has(gn, g, 'wings')) s.push(tri(bx - bw * 0.2, by + bh * 0.2, bx + bw * 0.3, by + bh * 0.2, bx + bw * 0.2, by + bh * (1.6 + 0.5 * g), A));
      s.push(ell(bx, by, bw, bh, B));
      if (gn.belly) s.push(ell(bx - bw * 0.1, by + bh * 0.45, bw * 0.7, bh * 0.4, A));
      s.push(...headFeats(bx - bw * 0.6, by - bh * 0.3, bh * 0.9, false));
      s.push(...eyes(bx - bw * 0.55, by, bh * 0.9, false));
      break;
    }
    case 'serpent': {
      const n = 6 + Math.round(4 * g), r0 = 0.07 * fat;
      const amp = 0.08 * tall;
      for (let i = n - 1; i >= 0; i--) {
        const t = i / (n - 1);
        const x = 0.22 + 0.6 * t, y = 1 - r0 * 1.2 - amp * (1 + Math.sin(t * Math.PI * 2 + gn.jitter * 6)) * (1 - t * 0.3);
        s.push(ell(x, y, r0 * (1.1 - 0.4 * t), r0 * (1.1 - 0.4 * t), i % 2 ? B : (gn.spots ? A : B)));
      }
      if (has(gn, g, 'spikes') || has(gn, g, 'fins')) for (let i = 1; i < n; i += 2) {
        const t = i / (n - 1), x = 0.22 + 0.6 * t, y = 1 - r0 * 1.2 - amp * (1 + Math.sin(t * Math.PI * 2 + gn.jitter * 6)) * (1 - t * 0.3);
        s.unshift(tri(x - r0 * 0.5, y - r0 * 0.5, x + r0 * 0.5, y - r0 * 0.5, x, y - r0 * 1.8, A));
      }
      const hx = 0.2, hy = 1 - r0 * 1.2 - amp * (1 + Math.sin(gn.jitter * 6)) - r0 * (1.5 + g);
      s.push(cap(0.22, 1 - r0 * 1.2 - amp * (1 + Math.sin(gn.jitter * 6)), hx, hy, r0 * 0.8, B));
      s.push(...headFeats(hx, hy, headR * 0.9, false));
      s.push(ell(hx, hy, headR * 1.1, headR * 0.85, B));
      s.push(...eyes(hx, hy, headR * 0.9, false));
      break;
    }
    case 'bug': {
      const segs = 2 + (g > 0.4 ? 1 : 0) + (g > 0.9 ? 1 : 0);
      const r0 = 0.12 * fat;
      const y = 1 - r0 * 1.4;
      if (has(gn, g, 'wings') || g > 0.9) s.push(...mirror([ell(0.5 - r0 * 1.4, y - r0 * (1.8 + g), r0 * (1.1 + 0.6 * g), r0 * (1.4 + 0.8 * g), A)]));
      for (let i = 0; i < segs; i++) s.push(...mirror([cap(0.5 - r0 * 0.4 - i * r0 * 0.3, y, 0.5 - r0 * 1.6 - i * r0 * 0.5, 1 - 0.02, 0.016, 2)]));
      for (let i = segs - 1; i >= 0; i--) s.push(ell(0.5, y - i * r0 * 1.0 * tall, r0 * (1 - 0.1 * i) * 1.1, r0 * 0.75, i % 2 ? A : B));
      const hy = y - segs * r0 * tall - headR * 0.5;
      s.push(...mirror([cap(0.5 - headR * 0.3, hy - headR * 0.7, 0.5 - headR * (1.1 + 0.5 * g), hy - headR * (1.8 + 0.8 * g), 0.012, 2)]));
      s.push(...headFeats(0.5, hy, headR, true));
      s.push(ell(0.5, hy, headR * 1.1, headR, B));
      s.push(...eyes(0.5, hy, headR, true));
      break;
    }
    default: { // plant
      const r0 = 0.2 * fat;
      const by = 1 - r0 * tall;
      const petals = 3 + Math.round(3 * g);
      for (let i = 0; i < petals; i++) {
        const a = Math.PI * (0.1 + 0.8 * i / Math.max(1, petals - 1));
        s.push(ell(0.5 - Math.cos(a) * r0 * 1.1, by - r0 * tall - Math.sin(a) * r0 * (0.9 + 0.4 * g), r0 * 0.38, r0 * (0.55 + 0.3 * g), A));
      }
      s.push(...mirror([ell(0.5 - r0 * 1.15, by + r0 * 0.3, r0 * (0.6 + 0.3 * g), r0 * 0.25, A)]));
      s.push(ell(0.5, by, r0 * 1.05, r0 * tall, B));
      if (gn.belly) s.push(ell(0.5, by + r0 * 0.35, r0 * 0.6, r0 * 0.45, A));
      s.push(...headFeats(0.5, by - r0 * 0.3, r0 * 0.9, true));
      s.push(...eyes(0.5, by - r0 * 0.1, r0 * 0.8, true));
    }
  }
  // spots go on last, over the body, but only where there is already body
  for (let i = 0; i < gn.spots; i++) {
    const a = gn.jitter * 10 + i * 2.4;
    sym.push({ spot: true, cx: 0.5 + Math.cos(a) * 0.12, cy: 0.72 + Math.sin(a) * 0.08, r: 0.035 + 0.01 * g });
  }
  return { shapes: s, spots: sym, lean: gn.lean };
}

// ------------------------------------------------------------- raster ----

/**
 * Rasterise a stage. `scale` is the fraction of the 56-pixel frame the unit
 * box occupies; the creature stands on row 53.
 */
export function render(gn, g, scale) {
  const { shapes, spots, lean } = shapesFor(gn, g);
  const px = new Uint8Array(SIZE);
  const S = W * scale;
  const x0 = (W - S) / 2, y0 = 54 - S;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const u = (x + 0.5 - x0) / S, v = (y + 0.5 - y0) / S;
      const uu = u - lean * (1 - v); // a slight lean, so not everything is upright
      let fill = 0;
      for (const s of shapes) if (inside(s, uu, v)) fill = s.fill;
      if (fill && fill !== 'eye') {
        for (const sp of spots) {
          const dx = uu - sp.cx, dy = v - sp.cy;
          if (dx * dx + dy * dy < sp.r * sp.r) fill = fill === 1 ? 2 : 1;
        }
      }
      px[y * W + x] = fill === 'eye' ? 4 : fill;
    }
  }
  // outline: any filled pixel touching paper (4-neighbour) becomes ink
  const out = new Uint8Array(SIZE);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x, v = px[i];
      if (!v) continue;
      const edge = x === 0 || y === 0 || x === W - 1 || y === H - 1 ||
        !px[i - 1] || !px[i + 1] || !px[i - W] || !px[i + W];
      out[i] = edge || v === 4 ? 3 : v;
    }
  }
  // shading: light pixels just inside the lower-right outline drop to mid
  for (let y = 1; y < H - 1; y++) {
    for (let x = 1; x < W - 1; x++) {
      const i = y * W + x;
      if (out[i] === 1 && (out[i + 1] === 3 && px[i + 1] !== 4 || out[i + W] === 3 && px[i + W] !== 4) && (x + y) % 2 === 0) out[i] = 2;
    }
  }
  // a glint in each eye
  for (let y = 1; y < H - 1; y++) {
    for (let x = 1; x < W - 1; x++) {
      const i = y * W + x;
      if (px[i] === 4 && px[i - 1] !== 4 && px[i - W] !== 4 && px[i + 1] === 4 && px[i + W] === 4) out[i] = 0;
    }
  }
  return out;
}

// -------------------------------------------------------------- names ----

const ON = ['b', 'br', 'ch', 'd', 'dr', 'f', 'fl', 'g', 'gl', 'gr', 'h', 'k', 'kr', 'l', 'm', 'n', 'p', 'pl', 'qu', 'r', 's', 'sk', 'sl', 'sn', 'sp', 'st', 't', 'tr', 'v', 'w', 'z'];
const NU = ['a', 'e', 'i', 'o', 'u', 'oo', 'ee', 'ai', 'ou', 'y'];
const CO = ['b', 'bb', 'd', 'g', 'k', 'l', 'll', 'm', 'mp', 'n', 'nk', 'p', 'pp', 'r', 'rl', 's', 'sh', 't', 'x', 'z', 'zz'];
const END = [['let', 'ling', 'kin', 'y', 'ette', 'bit'], ['on', 'or', 'ix', 'ard', 'oth', 'ax'], ['agon', 'oros', 'aurus', 'king', 'adon', 'ultra']];

function nameRoot(r) {
  const p = (a) => a[Math.floor(r() * a.length)];
  return p(ON) + p(NU) + p(CO) + (r() < 0.35 ? p(NU) + p(CO) : '');
}
const cap1 = (s) => s[0].toUpperCase() + s.slice(1);

// --------------------------------------------------------------- dex ----

/**
 * The whole dex for a seed. Lines are contiguous in dex order, as in the
 * real one. `stageOf` maps a stage to growth g and frame scale.
 */
export function makeDex(seed = 151, growth = 1) {
  const r = rng(seed);
  const lens = [];
  for (const [len, n] of Object.entries(LINE_MIX)) for (let i = 0; i < n; i++) lens.push(+len);
  for (let i = lens.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [lens[i], lens[j]] = [lens[j], lens[i]];
  }
  const critters = [];
  const lines = [];
  const used = new Set();
  lens.forEach((len, li) => {
    const gn = genome(r);
    let root;
    do root = nameRoot(r); while (used.has(root));
    used.add(root);
    const line = { id: li, len, type: gn.type, members: [] };
    // first forms are small and last forms large; a line of one is a
    // grown-up, sized like a last form
    const drawn = len === 1 ? [0.82 + r() * 0.16]
      : len === 2 ? [0.54 + r() * 0.12, 0.84 + r() * 0.14]
      : [0.5 + r() * 0.1, 0.68 + r() * 0.12, 0.88 + r() * 0.12];
    // `growth` 0 draws every stage at the last form's size; the shapes
    // still change, only the frame they are drawn into does not
    const sizes = drawn.map((v) => drawn[len - 1] + growth * (v - drawn[len - 1]));
    for (let s = 0; s < len; s++) {
      const g = len === 1 ? 1 : s / (len - 1);
      const endSet = len === 1 ? END[1 + Math.floor(r() * 2)] : END[len === 2 ? s * 2 : s];
      const suffix = endSet[Math.floor(r() * endSet.length)];
      const c = {
        id: critters.length,
        no: critters.length + 1,
        name: cap1(root + suffix),
        line: li,
        stage: s,
        stages: len,
        g,
        /** the size it was meant to be drawn at, before any fitting */
        frame: sizes[s],
        scale: sizes[s],
        px: null,
      };
      // a horn or a wingtip can reach past the frame; shrink until it fits,
      // since a creature sliced off at the edge is a different picture
      for (;;) {
        c.px = render(gn, g, c.scale);
        if (!clipped(c.px) || c.scale < 0.3) break;
        c.scale *= 0.96;
      }
      line.members.push(c.id);
      critters.push(c);
    }
    lines.push(line);
  });
  return { seed, critters, lines };
}

function clipped(px) {
  for (let i = 0; i < W; i++) if (px[i] || px[i * W] || px[i * W + W - 1]) return true;
  return false;
}

// ------------------------------------------------------- measurements ----

/** Fraction of the square that is drawn in. */
export function ink(px) {
  let n = 0;
  for (let i = 0; i < px.length; i++) if (px[i]) n++;
  return n / px.length;
}

export function bbox(px) {
  let x0 = W, y0 = H, x1 = -1, y1 = -1;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (px[y * W + x]) {
    if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
  }
  return x1 < 0 ? { x0: 0, y0: 0, w: 0, h: 0 } : { x0, y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

// ----------------------------------------------------- representations ----
//
// What bytes the compressor is handed. His post does not say, so the page
// lets you choose, and the choice turns out to matter.

export const REPRESENTATIONS = {
  raw: {
    label: 'one byte per pixel',
    note: 'the four shades as bytes 0–3, row by row',
    of: (px) => px,
  },
  packed: {
    label: 'two bits per pixel',
    note: 'four pixels to a byte, the way the original cartridges stored them',
    of: (px) => {
      const o = new Uint8Array(Math.ceil(px.length / 4));
      for (let i = 0; i < px.length; i++) o[i >> 2] |= px[i] << ((3 - (i & 3)) * 2);
      return o;
    },
  },
  silhouette: {
    label: 'silhouette',
    note: 'drawn or not, one byte per pixel — no shading, no eyes',
    of: (px) => px.map((v) => (v ? 1 : 0)),
  },
  columns: {
    label: 'column by column',
    note: 'the same bytes as the first, read down the columns instead of across the rows',
    of: (px) => {
      const o = new Uint8Array(px.length);
      for (let x = 0, k = 0; x < W; x++) for (let y = 0; y < H; y++) o[k++] = px[y * W + x];
      return o;
    },
  },
  fitted: {
    label: 'cropped and scaled to fit',
    note: 'every sprite blown up to fill the frame, so size and how much is drawn in stop being free information',
    of: (px) => fit(px),
  },
};

/** Crop to the bounding box and scale (nearest neighbour, aspect kept) to fill the frame, standing on the bottom row. */
export function fit(px) {
  const b = bbox(px);
  const o = new Uint8Array(SIZE);
  if (!b.w) return o;
  const k = Math.min(W / b.w, H / b.h);
  const w = Math.max(1, Math.round(b.w * k)), h = Math.max(1, Math.round(b.h * k));
  const ox = Math.floor((W - w) / 2), oy = H - h;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const sx = b.x0 + Math.min(b.w - 1, Math.floor(x / k)), sy = b.y0 + Math.min(b.h - 1, Math.floor(y / k));
    o[(oy + y) * W + ox + x] = px[sy * W + sx];
  }
  return o;
}

// ------------------------------------------------------------- scoring ----

/**
 * Given a full distance matrix (n×n, NaN on the diagonal), each critter's
 * nearest other critter, how often that is a relative, and what chance
 * alone would score.
 */
export function score(dex, dist) {
  const n = dex.critters.length;
  const nearest = new Int32Array(n).fill(-1);
  for (let i = 0; i < n; i++) {
    let best = Infinity;
    for (let j = 0; j < n; j++) {
      if (i === j) continue;
      const d = dist[i * n + j];
      if (d < best) { best = d; nearest[i] = j; }
    }
  }
  let hits = 0, withKin = 0, kinHits = 0, chance = 0;
  const indeg = new Int32Array(n);
  for (let i = 0; i < n; i++) {
    const c = dex.critters[i];
    const kin = c.stages - 1;
    chance += kin / (n - 1);
    if (nearest[i] >= 0) indeg[nearest[i]]++;
    const hit = nearest[i] >= 0 && dex.critters[nearest[i]].line === c.line;
    if (hit) hits++;
    if (kin) { withKin++; if (hit) kinHits++; }
  }
  let hub = 0;
  for (let i = 1; i < n; i++) if (indeg[i] > indeg[hub]) hub = i;
  return {
    nearest, indeg, hub, hubCount: indeg[hub],
    hitRate: hits / n,
    chance: chance / n,
    kinHitRate: withKin ? kinHits / withKin : 0,
    withKin, hits,
  };
}

/** Non-compression baselines, as distance matrices of the same shape. */
export const BASELINES = {
  ink: {
    label: 'how much is drawn in',
    note: '|ink(x) − ink(y)|: a single number per sprite, nothing about shape',
    dist: (dex) => {
      const v = dex.critters.map((c) => ink(c.px));
      return square(dex, (i, j) => Math.abs(v[i] - v[j]));
    },
  },
  box: {
    label: 'bounding box',
    note: 'the width and height of the drawn area, and nothing else',
    dist: (dex) => {
      const b = dex.critters.map((c) => bbox(c.px));
      return square(dex, (i, j) => Math.hypot(b[i].w - b[j].w, b[i].h - b[j].h));
    },
  },
  pixels: {
    label: 'pixel by pixel',
    note: 'how many of the 3136 pixels differ — the obvious measure, and it knows no more about monsters than bzip does',
    dist: (dex) => square(dex, (i, j) => {
      const a = dex.critters[i].px, b = dex.critters[j].px;
      let d = 0;
      for (let k = 0; k < a.length; k++) if (a[k] !== b[k]) d++;
      return d;
    }),
  },
};

function square(dex, f) {
  const n = dex.critters.length;
  const m = new Float32Array(n * n).fill(NaN);
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) m[i * n + j] = m[j * n + i] = f(i, j);
  return m;
}

/**
 * His explanation, as a number: for each critter, where its chosen
 * neighbour ranks among all the others by how much is drawn in (0 = the
 * closest in ink of all 150, 1 = the furthest). Chance puts the median at
 * one half; a measure that matched on ink alone would put it at zero.
 */
export function inkAgreement(dex, nearest) {
  const n = dex.critters.length;
  const v = dex.critters.map((c) => ink(c.px));
  const ranks = [];
  for (let i = 0; i < n; i++) {
    const j = nearest[i];
    if (j < 0) continue;
    const dj = Math.abs(v[i] - v[j]);
    let closer = 0;
    for (let k = 0; k < n; k++) if (k !== i && k !== j && Math.abs(v[i] - v[k]) < dj) closer++;
    ranks.push(closer / (n - 2));
  }
  ranks.sort((a, b) => a - b);
  return ranks.length ? ranks[ranks.length >> 1] : NaN;
}

/** Where a critter's ink sits in the dex: 0 the emptiest, 1 the fullest. */
export function inkPercentile(dex, id) {
  const me = ink(dex.critters[id].px);
  let below = 0;
  for (const c of dex.critters) if (c.id !== id && ink(c.px) < me) below++;
  return below / (dex.critters.length - 1);
}

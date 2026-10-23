// /pumpkin — a pumpkin patch that never repeats. A seed (and, optionally, a
// mood) carves one jack-o'-lantern: its body, its stem and a face.
//
// The face is a set of CUTS — closed polygons, as a knife would make them —
// and the generator holds itself to what a knife can do:
//
//   - nothing floats: a tooth is flesh left attached to the mouth's edge, a
//     pupil would be an island that falls out, so there are none;
//   - every cut stays a wall's width from every other cut and inside the
//     carvable front of the pumpkin;
//   - teeth are at least a wall wide, and never meet the opposite lip.
//
// A seed that breaks a rule is re-carved, smaller, until it doesn't; the
// selftest checks every rule over thousands of seeds. So the stencil the page
// prints is one you could actually carve.
//
// Pure and deterministic (xmur3 + mulberry32, the rite lineage): the same seed
// and mood carve the same pumpkin in the browser, the worker and the selftest.
// `carve` makes the geometry; `render` turns it into an SVG string.

// ---------- randomness ----------

function xmur3(str) {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) { h = Math.imul(h ^ str.charCodeAt(i), 3432918353); h = (h << 13) | (h >>> 19); }
  return () => { h = Math.imul(h ^ (h >>> 16), 2246822507); h = Math.imul(h ^ (h >>> 13), 3266489909); return (h ^= h >>> 16) >>> 0; };
}
function mulberry32(a) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function rng(seed) {
  const r = mulberry32(xmur3(String(seed))());
  const R = {
    r,
    range: (a, b) => a + (b - a) * r(),
    int: (a, b) => a + Math.floor(r() * (b - a + 1)),
    chance: (p) => r() < p,
    pick: (arr) => arr[Math.floor(r() * arr.length)],
    weighted: (table) => {
      const keys = Object.keys(table);
      let t = r() * keys.reduce((s, k) => s + table[k], 0);
      for (const k of keys) if ((t -= table[k]) < 0) return k;
      return keys[keys.length - 1];
    },
  };
  return R;
}

// ---------- the moods (the genome's archetypes) ----------
//
// A mood weights every choice the face makes. `tilt` turns the eyes: positive
// drops the inner corners (anger), negative drops the outer ones (worry).

export const MOODS = {
  classic: {
    label: 'Classic', eyes: { triangle: 6, diamond: 1 }, tilt: [-0.05, 0.08], asym: 0.05,
    nose: { triangle: 6, invtri: 1, none: 1 }, mouth: { zigzag: 4, grin: 3, toothy: 2 }, brows: 0,
  },
  jolly: {
    label: 'Jolly', eyes: { happy: 4, round: 3, triangle: 2, diamond: 1 }, tilt: [-0.08, 0.05], asym: 0.1,
    nose: { triangle: 3, round: 2, invtri: 1, none: 1 }, mouth: { grin: 4, smile: 3, toothy: 2, onetooth: 1 }, brows: 0.05,
  },
  sinister: {
    label: 'Sinister', eyes: { angry: 5, slit: 2, triangle: 2 }, tilt: [0.25, 0.5], asym: 0.1,
    nose: { triangle: 2, slits: 2, invtri: 1, none: 1 }, mouth: { zigzag: 3, toothy: 2, smirk: 2, grin: 1 }, brows: 0.55,
  },
  vampire: {
    label: 'Vampire', eyes: { angry: 4, slit: 2, round: 1 }, tilt: [0.2, 0.42], asym: 0.05,
    nose: { slits: 2, invtri: 2, none: 2 }, mouth: { fangs: 1 }, brows: 0.7,
  },
  goofy: {
    label: 'Goofy', eyes: { round: 3, square: 2, x: 1, star: 1, triangle: 1, oval: 2 }, tilt: [-0.2, 0.2], asym: 0.75,
    nose: { round: 2, heart: 1, triangle: 1, invtri: 1 }, mouth: { onetooth: 3, grin: 2, wavy: 2, smirk: 2 }, brows: 0.3,
  },
  spooked: {
    label: 'Spooked', eyes: { round: 4, oval: 3, worried: 2 }, tilt: [-0.32, -0.12], asym: 0.15,
    nose: { round: 1, triangle: 1, none: 2 }, mouth: { o: 4, wavy: 2 }, brows: 0.75,
  },
  sad: {
    label: 'Sad', eyes: { worried: 4, oval: 2, round: 1 }, tilt: [-0.4, -0.2], asym: 0.1,
    nose: { triangle: 1, round: 1, none: 2 }, mouth: { frown: 4, wavy: 1 }, brows: 0.5, tear: 0.6,
  },
  stitched: {
    label: 'Stitched', eyes: { x: 2, slit: 2, round: 2, star: 1 }, tilt: [-0.1, 0.25], asym: 0.5,
    nose: { invtri: 1, none: 2, slits: 1 }, mouth: { stitched: 1 }, brows: 0.15,
  },
};
export const MOOD_KEYS = Object.keys(MOODS);

// Pumpkin varieties: body proportions, rib count and colour.
export const VARIETIES = {
  howden:     { label: 'Howden',     w: [0.95, 1.05], h: [0.95, 1.08], lobes: [7, 9],  hue: [24, 30], sat: [88, 96], lit: [48, 54], weight: 6 },
  cinderella: { label: 'Cinderella', w: [1.08, 1.16], h: [0.72, 0.82], lobes: [9, 11], hue: [14, 20], sat: [85, 95], lit: [44, 50], weight: 2 },
  sugarpie:   { label: 'Sugar Pie',  w: [0.86, 0.95], h: [0.88, 0.98], lobes: [5, 7],  hue: [26, 32], sat: [90, 98], lit: [50, 56], weight: 3 },
  lumina:     { label: 'Lumina',     w: [0.95, 1.06], h: [0.85, 0.96], lobes: [7, 9],  hue: [38, 46], sat: [22, 32], lit: [84, 90], weight: 1 },
  jarrahdale: { label: 'Jarrahdale', w: [1.0, 1.1],   h: [0.78, 0.88], lobes: [9, 11], hue: [160, 180], sat: [10, 18], lit: [62, 70], weight: 1 },
  atlantic:   { label: 'Atlantic',   w: [1.04, 1.12], h: [0.98, 1.06], lobes: [9, 11], hue: [22, 28], sat: [80, 90], lit: [50, 56], weight: 1 },
};

// ---------- geometry ----------

const TAU = Math.PI * 2;
export const SIZE = 400;          // the viewBox is SIZE × SIZE
export const WALL = 7;            // minimum flesh between two cuts, px (≈6mm on a 25cm pumpkin)
export const TOOTH = 8;           // minimum tooth width, px

const rot = (pts, a) => { const c = Math.cos(a), s = Math.sin(a); return pts.map(([x, y]) => [x * c - y * s, x * s + y * c]); };
const move = (pts, dx, dy) => pts.map(([x, y]) => [x + dx, y + dy]);
const flipX = (pts) => pts.map(([x, y]) => [-x, y]).reverse();
const ellipse = (rx, ry, n = 40, a0 = 0, a1 = TAU) => {
  const out = [];
  const closed = a1 - a0 >= TAU - 1e-9;
  const m = closed ? n : n + 1;
  for (let i = 0; i < m; i++) { const t = a0 + (a1 - a0) * i / n; out.push([rx * Math.cos(t), ry * Math.sin(t)]); }
  return out;
};
const par = (u) => 1 - (2 * u - 1) ** 2;     // 0 at the corners, 1 in the middle

// Eye and nose shapes, centred on 0,0, +x pointing AWAY from the face's middle
// (so the left eye is the mirror of the right one), y down.
const SHAPES = {
  triangle: (w, h) => [[0, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]],
  invtri: (w, h) => [[-w / 2, -h / 2], [w / 2, -h / 2], [0, h / 2]],
  diamond: (w, h) => [[0, -h / 2], [w / 2, 0], [0, h / 2], [-w / 2, 0]],
  round: (w, h) => ellipse(w / 2, h / 2, 36),
  oval: (w, h) => ellipse(w * 0.4, h * 0.58, 36),
  slit: (w, h) => lens(w * 1.1, h * 0.32),
  // A closed, smiling eye: ^ — a crescent arching up.
  happy: (w, h) => crescent(w, h * 0.75, 0.42, -1),
  // Half-moons: flat edge on top (anger, once tilted) or below (worry).
  angry: (w, h) => move(ellipse(w / 2, h * 0.75, 30, 0, Math.PI), 0, -h * 0.3),
  worried: (w, h) => move(ellipse(w / 2, h * 0.75, 30, Math.PI, TAU), 0, h * 0.3),
  square: (w, h) => rrect(w * 0.85, h * 0.85, Math.min(w, h) * 0.18),
  star: (w, h) => {
    const out = [];
    for (let i = 0; i < 10; i++) {
      const r = (i % 2 ? 0.48 : 1) * Math.max(w, h) * 0.6, a = -Math.PI / 2 + i * Math.PI / 5;
      out.push([r * Math.cos(a), r * Math.sin(a)]);
    }
    return out;
  },
  x: (w, h) => {
    // Two crossed bars as one outline.
    const a = Math.min(w, h) * 0.17, L = Math.min(w, h) * 0.5;
    const arm = [[a, 0], [L, L - a], [L - a, L], [0, a]];
    const out = [];
    for (let q = 0; q < 4; q++) out.push(...rot(arm, q * Math.PI / 2 + Math.PI / 4).map(([x, y]) => [x, y]));
    return rot(out, -Math.PI / 4).map(([x, y]) => [x * 0.95, y * 0.95]);
  },
  heart: (w, h) => {
    const out = [];
    for (let i = 0; i < 48; i++) {
      const t = i / 48 * TAU;
      const x = 16 * Math.sin(t) ** 3, y = -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t));
      out.push([x / 34 * w, y / 32 * h + h * 0.05]);
    }
    return out;
  },
};
function lens(w, h) {
  const top = [], bot = [];
  for (let i = 0; i <= 20; i++) { const u = i / 20, x = (u - 0.5) * w, d = Math.sin(Math.PI * u) * h / 2; top.push([x, -d]); bot.unshift([x, d]); }
  return [...top, ...bot.slice(1, -1)];
}
function crescent(w, h, thick, dir) {
  // Outer arc and inner arc share their ends; dir -1 arches up, +1 sags down.
  const outer = [], inner = [];
  for (let i = 0; i <= 24; i++) {
    const u = i / 24, x = (u - 0.5) * w, s = Math.sin(Math.PI * u);
    outer.push([x, dir * s * h / 2 + (dir < 0 ? h / 4 : -h / 4)]);
    inner.unshift([x, dir * s * h / 2 * (1 - thick) + (dir < 0 ? h / 4 : -h / 4)]);
  }
  return [...outer, ...inner.slice(1, -1)];
}
function rrect(w, h, r) {
  const out = [];
  const corners = [[w / 2 - r, -h / 2 + r, -Math.PI / 2], [w / 2 - r, h / 2 - r, 0], [-w / 2 + r, h / 2 - r, Math.PI / 2], [-w / 2 + r, -h / 2 + r, Math.PI]];
  for (const [cx, cy, a0] of corners) for (let i = 0; i <= 6; i++) { const a = a0 + i / 6 * Math.PI / 2; out.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]); }
  return out;
}

// ---------- the mouth ----------
//
// A mouth is a top lip and a bottom lip, each a function of u ∈ [0,1] across
// the mouth, meeting at the corners. Teeth are notches in a lip: flesh the
// knife went around. A notch never reaches more than 60% across the opening,
// so the opposite lip keeps a wall's clearance.

function mouth(R, kind, cx, cy, W, maxDrop) {
  const smirk = kind === 'smirk' ? R.range(0.08, 0.16) * (R.chance(0.5) ? 1 : -1) : R.range(-0.02, 0.02);
  const cuts = [];
  if (kind === 'o') {
    const w = W * R.range(0.32, 0.45), h = w * R.range(1.05, 1.4);
    cuts.push({ part: 'mouth', kind, pts: move(ellipse(w / 2, h / 2, 40), cx, cy + h * 0.15) });
    return cuts;
  }
  // Lip curvature, in units of the mouth's width; y grows downward.
  let cu, cl;
  if (kind === 'frown') { cu = -R.range(0.22, 0.32); cl = -R.range(0.06, 0.14); }
  else if (kind === 'stitched') { cu = R.range(0.06, 0.14); cl = cu + R.range(0.05, 0.07); }
  else if (kind === 'wavy') { cu = 0; cl = 0; }
  else if (kind === 'smile') { cu = R.range(0.1, 0.18); cl = cu + R.range(0.1, 0.16); }
  else { cu = R.range(0.04, 0.14); cl = cu + R.range(0.22, 0.34); }

  // No deeper than the front allows (cl·W is the bottom lip's drop), and a
  // frown arches no higher than a fifth of the width.
  if (cl * W > maxDrop) { const k = maxDrop / (cl * W); cl *= k; cu *= k; }
  if (cu < -0.2) { cl *= 0.2 / -cu; cu = -0.2; }
  const wave = kind === 'wavy' ? { a: W * R.range(0.04, 0.07), k: R.pick([1.5, 2, 2.5]), ph: R.range(0, TAU), t: W * R.range(0.07, 0.1) } : null;
  const top = (u) => {
    const base = cy + smirk * (u - 0.5) * W;
    if (wave) return base + wave.a * Math.sin(wave.k * TAU * u + wave.ph) - wave.t / 2 * Math.min(1, Math.sin(Math.PI * u) * 3);
    return base + cu * W * par(u);
  };
  const bot = (u) => {
    const base = cy + smirk * (u - 0.5) * W;
    if (wave) return base + wave.a * Math.sin(wave.k * TAU * u + wave.ph) + wave.t / 2 * Math.min(1, Math.sin(Math.PI * u) * 3);
    return base + cl * W * par(u);
  };
  const open = (u) => bot(u) - top(u);

  if (kind === 'stitched') {
    // A thin slit, crossed by stitches: each stitch is flesh left standing,
    // so the slit is carved as a row of short cuts.
    const n = R.int(4, 7), gap = TOOTH / W;
    const span = (1 - 0.1) / n;
    for (let i = 0; i < n; i++) {
      const a = 0.05 + i * span + gap / 2, b = 0.05 + (i + 1) * span - gap / 2;
      const t = [], bt = [];
      for (let j = 0; j <= 10; j++) {
        const u = a + (b - a) * j / 10, x = cx + (u - 0.5) * W;
        const pinch = i === 0 && j === 0 || i === n - 1 && j === 10 ? 0.5 : 1;
        const mid = (top(u) + bot(u)) / 2, half = Math.max(open(u), 9) / 2 * pinch;
        t.push([x, mid - half]); bt.unshift([x, mid + half]);
      }
      cuts.push({ part: 'mouth', kind, pts: [...t, ...bt] });
    }
    return cuts;
  }

  // Teeth: [u0, u1, depth fraction, shape, lip].
  const teeth = [];
  const addRow = (lip, count, shape, depth, from = 0.12, to = 0.88) => {
    const step = (to - from) / count;
    for (let i = 0; i < count; i++) {
      const a = from + step * (i + (shape === 'tri' ? 0.05 : 0.22)), b = from + step * (i + (shape === 'tri' ? 0.95 : 0.78));
      teeth.push([a, b, depth, shape, lip]);
    }
  };
  if (kind === 'zigzag') { const n = R.int(3, 6); addRow('top', n, 'tri', R.range(0.42, 0.55)); addRow('bot', n - 1, 'tri', R.range(0.38, 0.5), 0.12 + 0.38 / n, 0.88 - 0.38 / n); }
  else if (kind === 'toothy') { const n = R.int(3, 5); addRow('top', n, 'rect', R.range(0.3, 0.45)); if (R.chance(0.7)) addRow('bot', n - 1, 'rect', R.range(0.25, 0.4), 0.2, 0.8); }
  else if (kind === 'grin') { if (R.chance(0.75)) { const n = R.int(1, 3); addRow('top', n, R.chance(0.5) ? 'rect' : 'tri', R.range(0.3, 0.45), 0.3, 0.7); } if (R.chance(0.35)) addRow('bot', 1, 'rect', R.range(0.25, 0.35), 0.4, 0.6); }
  else if (kind === 'onetooth') { const u = R.range(0.35, 0.62), w = R.range(0.07, 0.11); teeth.push([u, u + w, R.range(0.35, 0.5), 'rect', R.chance(0.6) ? 'top' : 'bot']); }
  else if (kind === 'fangs') { const g = R.range(0.17, 0.24), w = R.range(0.06, 0.09); teeth.push([0.5 - g - w / 2, 0.5 - g + w / 2, 0.6, 'fang', 'top'], [0.5 + g - w / 2, 0.5 + g + w / 2, 0.6, 'fang', 'top']); }
  else if (kind === 'smirk' && R.chance(0.6)) { const u = R.range(0.4, 0.55); teeth.push([u, u + 0.09, 0.4, 'rect', 'top']); }

  // A tooth narrower than a knife can leave standing is not carved at all.
  for (let i = teeth.length - 1; i >= 0; i--) if ((teeth[i][1] - teeth[i][0]) * W < TOOTH + 1) teeth.splice(i, 1);

  // Sample the lips densely, plus each tooth's edges so rectangular teeth get
  // square shoulders.
  const us = new Set();
  for (let i = 0; i <= 80; i++) us.add(i / 80);
  for (const [a, b] of teeth) for (const u of [a - 1e-4, a, a + 1e-4, (a + b) / 2, b - 1e-4, b, b + 1e-4]) if (u > 0 && u < 1) us.add(u);
  const U = [...us].sort((x, y) => x - y);
  const notch = (u, lip) => {
    let d = 0;
    for (const [a, b, depth, shape, l] of teeth) {
      if (l !== lip || u <= a || u >= b) continue;
      const f = (u - a) / (b - a);
      const prof = shape === 'rect' ? 1 : shape === 'fang' ? 1 - Math.abs(2 * f - 1) ** 0.8 : 1 - Math.abs(2 * f - 1);
      d = Math.max(d, depth * prof);
    }
    return d * open(u);
  };
  const T = U.map((u) => [cx + (u - 0.5) * W, top(u) + notch(u, 'top')]);
  const B = U.map((u) => [cx + (u - 0.5) * W, bot(u) - notch(u, 'bot')]).reverse();
  cuts.push({ part: 'mouth', kind, teeth: teeth.map(([a, b, , shape, lip]) => ({ w: (b - a) * W, shape, lip })), pts: [...T, ...B.slice(1, -1)] });
  return cuts;
}

// ---------- carving ----------

/**
 * Carve one pumpkin. Returns plain data: `body`, `stem`, `cuts` (each a
 * polygon, `pts`), the `genes` that made it, and `ok` — whether it passed
 * every carving rule (it always should; the selftest makes sure).
 */
export function carve(seed = '', opts = {}) {
  seed = String(seed);
  const moodKey = MOODS[opts.mood] ? opts.mood : null;
  const R0 = rng('pumpkin|' + seed);
  const mood = moodKey || R0.weighted({ classic: 4, jolly: 3, sinister: 3, vampire: 1, goofy: 2, spooked: 2, sad: 1, stitched: 1 });
  const vkeys = Object.keys(VARIETIES);
  const vk = R0.weighted(Object.fromEntries(vkeys.map((k) => [k, VARIETIES[k].weight])));
  const V = VARIETIES[vk];

  // The body.
  const cx = SIZE / 2, R = 150;
  const rx = R * R0.range(...V.w), ry = R * 0.86 * R0.range(...V.h);
  const cy = SIZE * 0.56 + (1 - ry / (R * 0.86)) * 30;
  const lobes = R0.int(...V.lobes) | 1;
  const color = { h: R0.range(...V.hue), s: R0.range(...V.sat), l: R0.range(...V.lit) };
  const body = { cx, cy, rx, ry, lobes, color, variety: vk, lumpy: R0.range(0, 1) };

  // The stem.
  const stem = {
    kind: R0.weighted({ stubby: 3, tall: 3, crooked: 2, curly: 2, snapped: 1 }),
    x: cx + R0.range(-0.06, 0.06) * rx, lean: R0.range(-0.5, 0.5),
    h: R0.range(0.16, 0.3) * ry, w: R0.range(0.09, 0.14) * rx,
    hue: R0.range(55, 90), sat: R0.range(22, 40), lit: R0.range(24, 34),
  };
  if (stem.kind === 'stubby') stem.h *= 0.55;
  if (stem.kind === 'tall') stem.h *= 1.35;

  const face = faceFor(seed, mood, body, opts.trace);
  const res = check(face.cuts, body);
  return {
    seed, mood, variety: vk, body, stem, cuts: face.cuts, genes: { ...face.genes, attempt: face.attempt }, ok: res.ok, problems: res.problems,
    title: `${MOODS[mood].label} ${V.label}`,
  };
}

/**
 * Carve a face for `mood` onto an existing `body`, re-carved smaller until it
 * passes. `carve` uses it for a pumpkin's own face; the live rig (rig.js) uses
 * it to carve every mood onto one pumpkin, so its expressions are all faces it
 * could really have.
 */
export function faceFor(seed, mood, body, trace) {
  let face = null;
  for (let attempt = 0; attempt < 14; attempt++) {
    face = carveFace(rng(`face|${seed}|${attempt}`), MOODS[mood], body, 1 - attempt * 0.05, attempt);
    face.attempt = attempt;
    const c = check(face.cuts, body);
    if (trace) trace.push(c.problems);
    if (c.ok) break;
  }
  return face;
}

function carveFace(R, M, body, scale, attempt) {
  const { cx, cy, rx, ry } = body;
  // The carvable front: an ellipse a little inside the body's outline. A cut
  // must stay inside FRONT; features are sized from F × G.
  const F = rx * 0.66, G = ry * 0.66;
  const fy = cy + ry * 0.04;
  const onFront = (pts, m = 0) => pts.every(([x, y]) => ((x - cx) / (rx * 0.86 - m)) ** 2 + ((y - cy) / (ry * 0.86 - m)) ** 2 <= 1);
  const halfAt = (y, m = 0) => Math.max(0, (rx * 0.86 - m) * Math.sqrt(Math.max(0, 1 - ((y - cy) / (ry * 0.86 - m)) ** 2)));
  const ys = (pts) => pts.map((p) => p[1]);
  const genes = {};
  const cuts = [];

  // Eyes.
  const eye = genes.eyes = R.weighted(M.eyes);
  const asym = R.chance(M.asym);
  const tilt = R.range(...M.tilt);
  const ew = F * R.range(0.44, 0.6) * scale, eh = ew * (eye === 'slit' ? R.range(0.5, 0.7) : R.range(0.75, 1.1));
  const ex = F * R.range(0.4, 0.52), ey = fy - G * R.range(0.36, 0.5);
  const eyes = [];
  for (const side of [1, -1]) {
    let shape = eye, w = ew, h = eh, t = tilt;
    if (asym && side === -1) {
      if (R.chance(0.5)) { w *= R.range(0.6, 0.8); h *= R.range(0.6, 0.85); }
      else shape = R.weighted(M.eyes);
      t += R.range(-0.15, 0.15);
    }
    // Rotate in the eye's own frame (+x away from the face's middle), so a
    // positive tilt drops the inner corner on both sides.
    let pts = rot(SHAPES[shape](w, h), -t);
    if (side === -1) pts = flipX(pts);
    eyes.push({ part: 'eye', kind: shape, pts: move(pts, cx + side * ex, ey + R.range(-2, 2)) });
  }
  cuts.push(...eyes);
  const eyePts = eyes.flatMap((e) => e.pts);
  const eyeTop = Math.min(...ys(eyePts)), eyeBot = Math.max(...ys(eyePts));
  const innerGap = Math.min(...eyePts.map(([x]) => Math.abs(x - cx)));

  // Brows: a sliver above each eye, tilted with the mood — if they fit.
  if (R.chance(M.brows)) {
    const bw = ew * R.range(0.8, 1.0), bh = R.range(9, 12), lift = R.range(2, 8);
    const bt = tilt * 1.2 + (M === MOODS.spooked ? -0.15 : 0);
    const brows = [1, -1].map((side) => {
      const e = eyes[side === 1 ? 0 : 1];
      let pts = rot(lens(bw, bh), -bt);
      if (side === -1) pts = flipX(pts);
      return { part: 'brow', kind: 'brow', pts: move(pts, cx + side * ex, Math.min(...ys(e.pts)) - WALL - bh * 0.5 - 4 - lift) };
    });
    if (brows.every((b) => onFront(b.pts, 3))) { cuts.push(...brows); genes.brows = true; }
  }

  // Mouth: no wider than the front allows at its height, no deeper than the
  // front's bottom.
  const mk = genes.mouth = R.weighted(M.mouth);
  const my = fy + G * R.range(0.28, 0.4);
  const W = Math.min(F * R.range(1.35, 1.8) * scale, 2 * halfAt(my, 8));
  const maxDrop = cy + ry * 0.86 - 10 - my;
  const mouthCuts = mouth(R, mk, cx, my, W, maxDrop);
  cuts.push(...mouthCuts);
  const centre = mouthCuts.flatMap((c) => c.pts).filter(([x]) => Math.abs(x - cx) < F * 0.25);
  const mouthTop = centre.length ? Math.min(...ys(centre)) : my;

  // Nose: in the gap between the eyes and the mouth — up between the eyes if
  // it is narrow enough to pass them.
  const nose = R.weighted(M.nose);
  let nw = F * R.range(0.2, 0.3) * scale, nh = nw * R.range(0.8, 1.15);
  const slits = nose === 'slits';
  const halfW = slits ? nw * 0.3 + WALL / 2 + 4 + nw * 0.2 : nw / 2;
  const roof = halfW + WALL + 2 < innerGap ? eyeTop + (eyeBot - eyeTop) * 0.45 : eyeBot + WALL + 2;
  const floor = mouthTop - WALL - 3;
  const room = floor - roof;
  if (nose !== 'none' && room >= 14) {
    if (nh > room) { nw *= room / nh; nh = room; }
    // Sits a little above the middle of its gap, as noses do.
    const at = Math.min(floor - nh / 2, Math.max(roof + nh / 2, roof + room * 0.45));
    if (slits) {
      for (const side of [1, -1]) cuts.push({ part: 'nose', kind: nose, pts: move(rot(lens(nh * 0.9, Math.max(9, nw * 0.34)), Math.PI / 2 + side * 0.25), cx + side * (nw * 0.3 + WALL / 2 + 4), at) });
    } else {
      cuts.push({ part: 'nose', kind: nose, pts: move(SHAPES[nose](nw, nh), cx, at) });
    }
    genes.nose = nose;
  } else genes.nose = 'none';

  // A tear, for the sad ones — if it clears the mouth.
  if (M.tear && R.chance(M.tear)) {
    const side = R.chance(0.5) ? 1 : -1, s = R.range(10, 14);
    const e = eyes[side === 1 ? 0 : 1];
    const drop = [];
    for (let i = 0; i < 24; i++) { const t = i / 24 * TAU; drop.push([s * 0.55 * Math.sin(t) * (1 - Math.cos(t)) / 2 * 1.6, -s * Math.cos(t)]); }
    const tear = { part: 'tear', kind: 'tear', pts: move(drop, cx + side * (ex + ew * 0.15), Math.max(...ys(e.pts)) + WALL + s + 3) };
    if (mouthCuts.every((m) => gap(m.pts, tear.pts) >= WALL + 2) && onFront(tear.pts, 3)) { cuts.push(tear); genes.tear = true; }
  }

  // A hand-carved wobble on everything: one smooth field over the whole face,
  // so neighbouring points (a mouth's pinched corners) move together.
  const wob = attempt > 10 ? 0 : R.range(0.4, 1.3);
  const ph = [R.range(0, TAU), R.range(0, TAU), R.range(0, TAU), R.range(0, TAU)];
  const field = ([x, y]) => [
    x + wob * (0.7 * Math.sin(0.09 * x + 0.05 * y + ph[0]) + 0.3 * Math.sin(0.23 * y - 0.11 * x + ph[2])),
    y + wob * (0.7 * Math.sin(0.07 * x - 0.08 * y + ph[1]) + 0.3 * Math.sin(0.19 * x + 0.13 * y + ph[3])),
  ];
  for (const c of cuts) c.pts = c.pts.map(field);
  genes.wobble = Math.round(wob * 100) / 100;
  genes.asym = asym; genes.tilt = Math.round(tilt * 100) / 100;
  return { cuts, genes };
}

// ---------- the carving rules ----------

function segDist(a, b, c, d) {
  if (segCross(a, b, c, d)) return 0;
  return Math.min(ptSeg(a, c, d), ptSeg(b, c, d), ptSeg(c, a, b), ptSeg(d, a, b));
}
function ptSeg(p, a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1], L = dx * dx + dy * dy;
  let t = L ? ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L : 0;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
}
function orient(a, b, c) { return Math.sign((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])); }
function segCross(a, b, c, d) {
  const o1 = orient(a, b, c), o2 = orient(a, b, d), o3 = orient(c, d, a), o4 = orient(c, d, b);
  return o1 !== o2 && o3 !== o4 && o1 && o2 && o3 && o4;
}
export function inside(p, poly) {
  let inn = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > p[1]) !== (yj > p[1]) && p[0] < (xj - xi) * (p[1] - yi) / (yj - yi) + xi) inn = !inn;
  }
  return inn;
}
export function area(poly) {
  let s = 0;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) s += (poly[j][0] + poly[i][0]) * (poly[j][1] - poly[i][1]);
  return Math.abs(s / 2);
}
function bbox(p) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of p) { if (x < x0) x0 = x; if (y < y0) y0 = y; if (x > x1) x1 = x; if (y > y1) y1 = y; }
  return [x0, y0, x1, y1];
}

/** Gap between two polygons (0 if they touch, cross or nest). */
export function gap(P, Q) {
  const [a0, b0, a1, b1] = bbox(P), [c0, d0, c1, d1] = bbox(Q);
  const far = Math.max(c0 - a1, a0 - c1, d0 - b1, b0 - d1);
  if (far > WALL * 3) return far;
  if (inside(P[0], Q) || inside(Q[0], P)) return 0;
  let m = Infinity;
  for (let i = 0; i < P.length; i++) {
    const a = P[i], b = P[(i + 1) % P.length];
    for (let j = 0; j < Q.length; j++) { const d = segDist(a, b, Q[j], Q[(j + 1) % Q.length]); if (d < m) m = d; }
  }
  return m;
}

/** Does a polygon cross itself? */
export function selfCrosses(P) {
  const n = P.length;
  for (let i = 0; i < n; i++) for (let j = i + 2; j < n; j++) {
    if (i === 0 && j === n - 1) continue;
    if (segCross(P[i], P[(i + 1) % n], P[j], P[(j + 1) % n])) return true;
  }
  return false;
}

/** Every carving rule, checked. `{ ok, problems: [...] }`. */
export function check(cuts, body) {
  const problems = [];
  const { cx, cy, rx, ry } = body;
  for (const c of cuts) {
    if (c.pts.some(([x, y]) => ((x - cx) / (rx * 0.86)) ** 2 + ((y - cy) / (ry * 0.86)) ** 2 > 1)) problems.push(`${c.part} runs off the front`);
    if (area(c.pts) < 20) problems.push(`${c.part} too small to carve`);
    if (selfCrosses(c.pts)) problems.push(`${c.part} crosses itself`);
    for (const t of c.teeth || []) if (t.w < TOOTH) problems.push(`a tooth thinner than ${TOOTH}px`);
  }
  for (let i = 0; i < cuts.length; i++) for (let j = i + 1; j < cuts.length; j++) {
    const g = gap(cuts[i].pts, cuts[j].pts);
    if (g < WALL) problems.push(`${cuts[i].part} and ${cuts[j].part} only ${g.toFixed(1)}px apart`);
  }
  return { ok: !problems.length, problems };
}

// ---------- rendering ----------

const f1 = (n) => Math.round(n * 10) / 10;
/** The candle's colours, white-hot middle to ember rim. */
export const FIRE = ['#fffbe0', '#ffe066', '#ff9a1a', '#b8320a'];
const pathOf = (pts) => 'M' + pts.map(([x, y]) => f1(x) + ' ' + f1(y)).join('L') + 'Z';
const hsl = (h, s, l, a) => a === undefined ? `hsl(${f1(h)} ${f1(s)}% ${f1(l)}%)` : `hsl(${f1(h)} ${f1(s)}% ${f1(l)}% / ${a})`;

function stemPath(st, top) {
  // A tapered stalk along a curved spine, as one outline.
  const n = 12, pts = [], back = [];
  const bend = st.kind === 'crooked' ? 0.9 : st.kind === 'curly' ? 0.5 : st.kind === 'tall' ? 0.35 : 0.15;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const x = st.x + st.lean * st.h * 0.6 * t + bend * st.lean * st.h * 0.8 * t * t * (st.kind === 'crooked' ? 2 : 1);
    const y = top - st.h * t;
    const w = st.w * (1 - 0.35 * t) * (st.kind === 'snapped' && t > 0.85 ? 1.06 : 1) / 2 * (t < 0.08 ? 1.45 - t * 5 : 1);
    pts.push([x - w, y]); back.unshift([x + w, y]);
  }
  if (st.kind === 'snapped') {
    // A broken top: jagged instead of flat.
    const [l] = pts.slice(-1), [r] = back;
    pts.push([l[0] + (r[0] - l[0]) * 0.3, l[1] - 4], [l[0] + (r[0] - l[0]) * 0.55, l[1] + 2], [l[0] + (r[0] - l[0]) * 0.8, l[1] - 5]);
  }
  return [...pts, ...back];
}

/**
 * The pumpkin as an SVG string.
 *   lit       candle on (default) or off (a daylight carving)
 *   flicker   animate the candle (default true when lit)
 *   bg        paint the night behind it (default true)
 *   stencil   a printable cutting stencil instead of a picture
 *   id        a prefix for gradient ids, unique per pumpkin on a page
 *   rig       mark the parts the live rig moves (rig.js): the body group, the
 *             ground, the halo, the spill, the fire stops, and every cut's
 *             elements by slot. No CSS flicker — the rig flickers itself.
 */
export function render(p, o = {}) {
  const { lit = true, bg = true, stencil = false } = o;
  const rig = !!o.rig;
  const flicker = rig ? false : (o.flicker ?? lit);
  const R_ = (name) => rig ? ` data-rig="${name}"` : '';
  const S_ = (i) => rig ? ` data-slot="${i}"` : '';
  const id = (o.id || 'pk') + '-' + (p.seed.replace(/[^a-z0-9]/gi, '').slice(0, 12) || 'x');
  const { cx, cy, rx, ry, lobes, color } = p.body;
  const top = cy - ry * 0.94;
  const size = o.size ? ` width="${o.size}" height="${o.size}"` : '';
  const head = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${SIZE} ${SIZE}"${size} role="img" aria-label="${p.title} jack-o'-lantern">`;

  if (stencil) {
    const out = [head, `<rect width="${SIZE}" height="${SIZE}" fill="#fff"/>`,
      `<ellipse cx="${f1(cx)}" cy="${f1(cy)}" rx="${f1(rx)}" ry="${f1(ry)}" fill="none" stroke="#999" stroke-width="1.5" stroke-dasharray="6 5"/>`,
      `<ellipse cx="${f1(cx)}" cy="${f1(cy)}" rx="${f1(rx * 0.86)}" ry="${f1(ry * 0.86)}" fill="none" stroke="#ddd" stroke-width="1"/>`];
    for (const c of p.cuts) out.push(`<path d="${pathOf(c.pts)}" fill="#111"/>`);
    out.push('</svg>');
    return out.join('');
  }

  const out = [head, '<defs>'];
  // The rind: each lobe lit from the upper left, darker at its edges.
  out.push(`<radialGradient id="${id}-lobe" cx="0.38" cy="0.32" r="0.75">` +
    `<stop offset="0" stop-color="${hsl(color.h + 4, color.s, Math.min(92, color.l + 12))}"/>` +
    `<stop offset="0.55" stop-color="${hsl(color.h, color.s, color.l)}"/>` +
    `<stop offset="1" stop-color="${hsl(color.h - 6, color.s, color.l * 0.62)}"/></radialGradient>`);
  out.push(`<linearGradient id="${id}-stem" x1="0" x2="1">` +
    `<stop offset="0" stop-color="${hsl(p.stem.hue, p.stem.sat, p.stem.lit * 0.7)}"/>` +
    `<stop offset="0.45" stop-color="${hsl(p.stem.hue, p.stem.sat, p.stem.lit * 1.35)}"/>` +
    `<stop offset="1" stop-color="${hsl(p.stem.hue, p.stem.sat, p.stem.lit * 0.6)}"/></linearGradient>`);
  // The candle, as seen through the cuts: white-hot at the middle, ember at the rim.
  out.push(`<radialGradient id="${id}-fire" gradientUnits="userSpaceOnUse" cx="${f1(cx)}" cy="${f1(cy + ry * 0.15)}" r="${f1(rx * 0.95)}">` +
    (lit
      ? FIRE.map((c, i) => `<stop offset="${[0, 0.3, 0.62, 1][i]}" stop-color="${c}"${R_('stop')}/>`).join('')
      : '<stop offset="0" stop-color="#3a2310"/><stop offset="1" stop-color="#140904"/>') +
    '</radialGradient>');
  // Cut flesh: the pale wall of each cut.
  out.push(`<linearGradient id="${id}-flesh" x1="0" y1="0" x2="0" y2="1">` +
    (lit ? '<stop offset="0" stop-color="#ffd27a"/><stop offset="1" stop-color="#f0a13c"/>'
      : `<stop offset="0" stop-color="${hsl(40, 80, 72)}"/><stop offset="1" stop-color="${hsl(34, 75, 58)}"/>`) +
    '</linearGradient>');
  out.push(`<radialGradient id="${id}-spill" gradientUnits="userSpaceOnUse" cx="${f1(cx)}" cy="${f1(cy)}" r="${f1(rx * 0.9)}">` +
    '<stop offset="0" stop-color="#ffb347" stop-opacity="0.38"/><stop offset="1" stop-color="#ff8a1f" stop-opacity="0"/></radialGradient>');
  out.push(`<radialGradient id="${id}-sky" cx="0.5" cy="0.35" r="0.8"><stop offset="0" stop-color="#2d1b3d"/><stop offset="1" stop-color="#0d0812"/></radialGradient>`);
  out.push(`<filter id="${id}-blur" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="7"/></filter>`);
  out.push(`<clipPath id="${id}-body"><ellipse cx="${f1(cx)}" cy="${f1(cy)}" rx="${f1(rx)}" ry="${f1(ry)}"/></clipPath>`);
  p.cuts.forEach((c, i) => out.push(`<clipPath id="${id}-c${i}"><path d="${pathOf(c.pts)}"${S_(i)}/></clipPath>`));
  out.push('</defs>');
  if (flicker) {
    out.push(`<style>@keyframes pkf{0%,100%{opacity:1}12%{opacity:.86}20%{opacity:.97}37%{opacity:.8}45%{opacity:1}63%{opacity:.9}71%{opacity:.98}86%{opacity:.84}}` +
      `.${id}-f{animation:pkf ${f1(2.6 + (xmur3(p.seed)() % 1000) / 600)}s infinite steps(24)}` +
      `@media (prefers-reduced-motion:reduce){.${id}-f{animation:none}}</style>`);
  }

  if (bg) out.push(`<rect width="${SIZE}" height="${SIZE}" fill="url(#${id}-sky)"/>`);
  // Shadow on the ground, and the glow the candle throws onto it.
  out.push(`<ellipse cx="${f1(cx)}" cy="${f1(cy + ry * 0.97)}" rx="${f1(rx * 1.05)}" ry="${f1(ry * 0.12)}" fill="#000" opacity="0.45"${R_('shadow')}/>`);
  // (The flicker animates opacity, so it goes on a wrapper: on the element
  // itself it would override the element's own, fainter opacity.)
  const fl = (inner) => flicker ? `<g class="${id}-f">${inner}</g>` : inner;
  if (lit) out.push(fl(`<ellipse cx="${f1(cx)}" cy="${f1(cy + ry * 0.98)}" rx="${f1(rx * 1.5)}" ry="${f1(ry * 0.22)}" fill="#ff8a1f" opacity="0.13" filter="url(#${id}-blur)"${R_('glow')}/>`));
  if (rig) out.push('<g data-rig="body">');

  // The stem, behind the top lobes.
  out.push(`<path d="${pathOf(stemPath(p.stem, top + 6))}" fill="url(#${id}-stem)" stroke="${hsl(p.stem.hue, p.stem.sat, p.stem.lit * 0.5)}" stroke-width="1.2" stroke-linejoin="round"/>`);
  if (p.stem.kind === 'curly') {
    const sx = p.stem.x + p.stem.w * 0.4, sy = top - p.stem.h * 0.35, d = p.stem.lean >= 0 ? 1 : -1;
    out.push(`<path d="M${f1(sx)} ${f1(sy)}c${f1(d * 14)} -6 ${f1(d * 26)} 4 ${f1(d * 20)} 14s${f1(-d * 16)} 4 ${f1(-d * 10)} -6 ${f1(d * 14)} -4 ${f1(d * 10)} 4" fill="none" stroke="${hsl(p.stem.hue, p.stem.sat, p.stem.lit * 1.1)}" stroke-width="2.4" stroke-linecap="round"/>`);
  }

  // The lobes, outermost first so the middle one sits in front.
  const order = [...Array(lobes).keys()].sort((a, b) => Math.abs(b - (lobes - 1) / 2) - Math.abs(a - (lobes - 1) / 2));
  for (const i of order) {
    const s = lobes === 1 ? 0 : (2 * i / (lobes - 1) - 1);
    const lx = cx + s * rx * 0.62, lw = rx * (0.4 - 0.03 * Math.abs(s)) * (1 + 3 / lobes) * 0.62 + rx * 0.06;
    const lh = ry * (1 - 0.1 * s * s) * (1 + p.body.lumpy * 0.03 * Math.sin(i * 2.3));
    const ext = Math.abs(lx - cx) + lw;
    const kx = ext > rx ? (rx - Math.abs(lx - cx)) / lw : 1;
    out.push(`<ellipse cx="${f1(lx)}" cy="${f1(cy + (1 - lh / ry) * ry * 0.3)}" rx="${f1(lw * kx)}" ry="${f1(lh)}" fill="url(#${id}-lobe)" stroke="${hsl(color.h - 8, color.s, color.l * 0.5)}" stroke-width="1.4" stroke-opacity="0.55"/>`);
  }
  // Light spilling onto the rind around the face.
  if (lit) out.push(fl(`<ellipse cx="${f1(cx)}" cy="${f1(cy)}" rx="${f1(rx)}" ry="${f1(ry)}" fill="url(#${id}-spill)" clip-path="url(#${id}-body)"${R_('spill')}/>`));

  // The cuts. Under them, a blurred halo; in each, the cut flesh wall, and the
  // candle seen through it — shifted toward the middle, so the wall shows on
  // the side away from the light, thicker toward the pumpkin's edge.
  if (lit) out.push(fl(`<g filter="url(#${id}-blur)" opacity="0.75"${R_('halo')}>` + p.cuts.map((c, i) => `<path d="${pathOf(c.pts)}" fill="#ffae2b"${S_(i)}/>`).join('') + '</g>'));
  p.cuts.forEach((c, i) => {
    const [x0, y0, x1, y1] = bbox(c.pts);
    const mx = (x0 + x1) / 2, my = (y0 + y1) / 2;
    const k = 0.07, th = 2.2;
    const dx = -(mx - cx) * k - Math.sign(mx - cx) * th * 0.3, dy = -(my - cy) * k + th;
    out.push(`<path d="${pathOf(c.pts)}" fill="url(#${id}-flesh)" stroke="${hsl(color.h - 10, color.s, color.l * 0.45)}" stroke-width="1"${S_(i)}/>`);
    out.push(`<g clip-path="url(#${id}-c${i})"><path class="${flicker ? id + '-f' : ''}" d="${pathOf(c.pts)}" transform="translate(${f1(dx)} ${f1(dy)})" fill="url(#${id}-fire)"${S_(i)}${R_('fire')}/></g>`);
  });
  if (rig) out.push('</g>');
  out.push('</svg>');
  return out.join('');
}

/** A one-line description, for captions and alt text. */
export function describe(p) {
  const g = p.genes;
  const m = { zigzag: 'zigzag grin', grin: 'grin', toothy: 'toothy grin', smile: 'smile', onetooth: 'one-tooth grin',
    fangs: 'fanged leer', smirk: 'smirk', o: 'gasp', wavy: 'wobbly mouth', frown: 'frown', stitched: 'stitched mouth' }[g.mouth] || g.mouth;
  const e = { x: 'X', happy: 'happy', angry: 'glaring', worried: 'worried', slit: 'slit', star: 'star', heart: 'heart' }[g.eyes] || g.eyes;
  const n = g.nose === 'none' ? 'no nose' : g.nose === 'slits' ? 'slit nostrils' : `${{ invtri: 'upside-down', tri: 'triangle' }[g.nose] || g.nose} nose`;
  return `${e} eyes${g.asym ? ' (mismatched)' : ''}${g.brows ? ', brows' : ''}, ${n}, ${m}${g.tear ? ', a tear' : ''}`;
}

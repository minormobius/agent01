// The painterly renderer: what makes this a sheet of paper and not a physarum
// glow.
//
// fluoddity's FRAG_DISPLAY takes hue from flow DIRECTION, cranks value by an
// exposure multiplier and soft-clips with asinh. That is an emission model —
// light added to black — and it is why every slime-mould piece on the internet
// looks like the same neon cobweb. Three departures here, all deliberate:
//
//   1. SUBTRACTIVE. Strokes composite with 'multiply' onto a light ground, so
//      pigment absorbs rather than emits. Two populations overlapping make a
//      third, darker colour the way two washes do, instead of blowing out to
//      white the way two additive layers do.
//   2. CURATED PIGMENT. Colour does not come from a hue wheel. Sampling hue
//      uniformly is precisely what makes generative work look generic, so the
//      genome's `hue` selects from a hand-picked list of pigment PAIRS —
//      real paint, chosen to mix well. Every roll is a good colour decision
//      because none of them is a random one.
//   3. THE MARK HAS A BODY. Each step of an agent is a stroke segment with a
//      width from its speed (dwell broadens, a fast drag thins) and an opacity
//      from how much ink that brush has left. Strokes dry out and stop. The
//      GPU version cannot do any of this: it keeps a velocity field, not paths.

import { SEG_STRIDE } from './sim.js';

// Hand-picked pairs. `a` and `b` are the two populations' pigments, `paper` the
// ground they sit on. Complements where the mixing should turn neutral and
// muddy in a good way; near-monochromes where it should stay quiet.
export const PAIRS = [
  { name: 'Prussian & burnt sienna', a: '#1b3a5c', b: '#9c4a24', paper: '#f2ece0' },
  { name: "Payne's grey & Indian yellow", a: '#3d4a55', b: '#d99b2b', paper: '#f4efe4' },
  { name: 'Alizarin & viridian', a: '#8c2f39', b: '#2f6b57', paper: '#f0eae2' },
  { name: 'Dioxazine & raw umber', a: '#4a2f6b', b: '#6b5335', paper: '#efe9dd' },
  { name: 'Bone black & vermilion', a: '#2b2a28', b: '#b8402a', paper: '#f3efe6' },
  { name: 'Cerulean & raw sienna', a: '#2b7fa8', b: '#a8752f', paper: '#f1ece1' },
  { name: 'Indigo & lamp black', a: '#26355c', b: '#232323', paper: '#eeeadf' },
  { name: 'Sap green & madder', a: '#4a6b2f', b: '#8c2f39', paper: '#f1ebe0' },
  { name: 'Ultramarine & yellow ochre', a: '#2e3d8f', b: '#b8912f', paper: '#f3eee3' },
  { name: 'Terre verte & Venetian red', a: '#5c6b4a', b: '#9c3f2e', paper: '#f0ebe1' },
  { name: 'Sepia & Naples yellow', a: '#5c4433', b: '#d9c07a', paper: '#f4f0e6' },
  { name: 'Payne’s grey & cerulean', a: '#3d4a55', b: '#2b7fa8', paper: '#eff0ea' },
];

export function pickPair(hueA, hueB) {
  const i = Math.min(PAIRS.length - 1, Math.floor(hueA * PAIRS.length));
  const p = PAIRS[i];
  // hueB decides only which population takes which pigment, so the pair itself
  // is always one of the curated ones.
  return hueB < 0.5 ? p : { ...p, a: p.b, b: p.a };
}

// Speed buckets. Measured segment lengths span three orders of magnitude
// (median 1.55px on a 720px sheet, p90 10px, p99 36px), so the mapping from
// speed to nib width has to be logarithmic. Rather than call Math.log 100k
// times, the thresholds are a precomputed geometric ladder and a segment finds
// its bucket by comparison. Cheaper, and the bucket doubles as the batching key
// so a whole bucket strokes as one path.
const SPEED_LO = 3e-4, SPEED_RATIO = 1.4746, NSPEED = 16;
const SPEED_EDGE = (() => {
  const e = new Float64Array(NSPEED - 1);
  let v = SPEED_LO;
  for (let i = 0; i < NSPEED - 1; i++) { v *= SPEED_RATIO; e[i] = v; }
  return e;
})();
const NINK = 4;

function speedBucket(len) {
  let lo = 0, hi = NSPEED - 1;
  while (lo < hi) { const m = (lo + hi) >> 1; if (len > SPEED_EDGE[m]) lo = m + 1; else hi = m; }
  return lo;
}

// The nib model, in one place, so the exposure meter below and the renderer
// cannot drift apart. t is the speed bucket normalised 0..1, inkT the loading.
export const nibWidth = (t) => Math.max(0.35, 3.2 - 2.75 * t);
// 0.18, not 0.14. A taste decision, not a measurement: at 0.14 the sparser
// half of the rolls were too faint to enjoy, and the dense half takes the extra
// weight without turning to mud. Raising it is the honest lever — the two
// automatic corrections tried instead (see the note below and blockCV in
// probe.js) both failed to hold up against a hand-ranked sample.
export const nibAlpha = (t, inkT) => 0.18 * (0.22 + 0.78 * inkT) * (0.55 + 0.45 * (1 - t));

// NOTE — an exposure meter was tried here and removed. The idea was to measure
// what the probe's strokes will actually put on the sheet (their own width x
// alpha, summed) and correct thin sheets upward. Measured across a nine-sheet
// sample the correction came out between x0.84 and x1.07: a no-op. Total
// pigment barely varies between rolls. What varies is how thinly it is SPREAD,
// and a global gain cannot fix that. If you want to try again, the quantity to
// normalise is pigment per unit of covered area, not pigment.

const hexRGB = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];

export class Paper {
  // `size` is the logical (CSS) edge of the square sheet.
  constructor(canvas, size, pair, rand) {
    this.cv = canvas;
    this.size = size;
    this.pair = pair;
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = canvas.height = Math.round(size * this.dpr);
    canvas.style.width = canvas.style.height = size + 'px';
    this.ctx = canvas.getContext('2d');
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.rgb = [hexRGB(pair.a), hexRGB(pair.b)];
    this.ground(rand);
    // one reusable Path2D per (population, speed, ink) bucket
    this.paths = new Array(2 * NSPEED * NINK);
  }

  // The ground: a tinted sheet with soft mottling and a fine tooth. Baked once,
  // under the strokes, so the grain reads THROUGH the semi-transparent pigment
  // the way it does on real paper — rather than sitting on top of it like a
  // filter, which is the tell of a fake paper texture.
  ground(rand) {
    const ctx = this.ctx, S = this.size;
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    ctx.fillStyle = this.pair.paper;
    ctx.fillRect(0, 0, S, S);

    const [pr, pg, pb] = hexRGB(this.pair.paper);
    for (let i = 0; i < 22; i++) {
      const x = rand.float() * S, y = rand.float() * S, r = S * (0.08 + rand.float() * 0.32);
      const d = (rand.float() - 0.5) * 16;
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      const c = `rgba(${Math.max(0, Math.min(255, pr + d | 0))},${Math.max(0, Math.min(255, pg + d | 0))},${Math.max(0, Math.min(255, pb + d - 2 | 0))},`;
      g.addColorStop(0, c + '0.5)');
      g.addColorStop(1, c + '0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, S, S);
    }

    // tooth: a small deterministic noise tile, repeated
    const T = 96;
    const tile = document.createElement('canvas');
    tile.width = tile.height = T;
    const tc = tile.getContext('2d');
    const img = tc.createImageData(T, T);
    for (let i = 0; i < T * T; i++) {
      const n = rand.float();
      const v = n < 0.5 ? 0 : 255;
      img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v;
      img.data[i * 4 + 3] = Math.round(14 + 26 * rand.float());
    }
    tc.putImageData(img, 0, 0);
    ctx.save();
    ctx.globalAlpha = 0.5;
    ctx.globalCompositeOperation = 'multiply';
    const pat = ctx.createPattern(tile, 'repeat');
    ctx.fillStyle = pat;
    ctx.fillRect(0, 0, S, S);
    ctx.restore();
    this.groundDone = true;
  }

  // Draw one batch of stroke segments. Called every frame with whatever the sim
  // produced that frame, so the sheet fills in as you watch.
  draw(seg, count) {
    if (!count) return;
    const S = this.size, ctx = this.ctx;
    const paths = this.paths;
    paths.fill(undefined);

    for (let i = 0; i < count; i++) {
      const o = i * SEG_STRIDE;
      const sb = speedBucket(seg[o + 4]);
      // ink remaining 0..1 -> 4 bands; the lowest band is the dry-brush tail
      let ib = (seg[o + 5] * NINK) | 0; if (ib > NINK - 1) ib = NINK - 1;
      const key = (seg[o + 6] | 0) * (NSPEED * NINK) + sb * NINK + ib;
      let p = paths[key];
      if (!p) { p = paths[key] = new Path2D(); }
      p.moveTo((seg[o] * 0.5 + 0.5) * S, (seg[o + 1] * 0.5 + 0.5) * S);
      p.lineTo((seg[o + 2] * 0.5 + 0.5) * S, (seg[o + 3] * 0.5 + 0.5) * S);
    }

    ctx.globalCompositeOperation = 'multiply';
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    const scale = S / 720;
    for (let key = 0; key < paths.length; key++) {
      const p = paths[key];
      if (!p) continue;
      const pop = (key / (NSPEED * NINK)) | 0;
      const rest = key % (NSPEED * NINK);
      const sb = (rest / NINK) | 0, ib = rest % NINK;
      const t = sb / (NSPEED - 1);          // 0 = dwelling, 1 = a fast drag
      const inkT = (ib + 0.5) / NINK;       // brush loading

      // dwell broadens the mark, speed thins it
      ctx.lineWidth = nibWidth(t) * scale;
      // Opacity falls as the brush dries. It falls only gently with speed: a
      // pen moving fast lays a THINNER line, not a fainter one, and coupling
      // alpha hard to speed made every long sweeping stroke — the marks you
      // most want to see — ghost out to nothing.
      const alpha = nibAlpha(t, inkT);
      const [r, g, b] = this.rgb[pop];
      ctx.strokeStyle = `rgba(${r},${g},${b},${alpha.toFixed(4)})`;
      ctx.stroke(p);
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  toBlob(cb) { this.cv.toBlob(cb, 'image/png'); }
}

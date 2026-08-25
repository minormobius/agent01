// The painterly renderer: what makes this a sheet of paper and not a physarum
// glow.
//
// fluoddity's FRAG_DISPLAY takes hue from flow DIRECTION, cranks value by an
// exposure multiplier and soft-clips with asinh. That is an emission model —
// light added to black — and it is why every slime-mould piece on the internet
// looks like the same neon cobweb. The departures here, all deliberate:
//
//   1. SUBTRACTIVE. Strokes composite with 'multiply' onto a light ground, so
//      pigment absorbs rather than emits. Two populations overlapping make a
//      third, darker colour the way two washes do, instead of blowing out to
//      white the way two additive layers do.
//   2. CURATED PIGMENT. Colour does not come from a hue wheel. Sampling hue
//      uniformly is precisely what makes generative work look generic, so the
//      genome's `hue` selects from a hand-picked list of pigment PAIRS.
//   3. A BROAD-EDGE NIB. Width depends on the DIRECTION of travel, not only its
//      speed: each population holds a nib angle, and a stroke running along the
//      nib's edge is a hairline while one running across it is full width. This
//      is what a real italic pen does, and it is the single biggest source of
//      character in the marks — the thicks and thins arrive from the organism's
//      own turning, so the pen draws what the swarm is doing.
//   4. WET-ON-WET. Each segment carries how much of the OTHER population's
//      fresh pigment it crossed. Where that is high the mark blooms: a soft
//      wide halo under the crisp stroke. Two hands meeting on damp paper.

import { SEG_STRIDE } from './sim.js';

// Hand-picked pairs. `a` and `b` are the two populations' pigments, `paper` the
// ground they sit on.
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
  return hueB < 0.5 ? p : { ...p, a: p.b, b: p.a };
}

// Each population's own nib angle, derived from its rule seed so it is part of
// the organism's identity rather than a render setting. The slider adds a
// global offset on top, which keeps the two hands' nibs at a fixed angle to
// each other however you turn them — that relationship is what stops the two
// pigments reading as one texture.
export const nibBase = (g) => (g.rule_seed * 7.3 % 1) * Math.PI;

export const DEFAULT_STYLE = {
  // Reserve multiplier. Measured by rendering one seed across the range: at 1
  // the sheet has clear network structure with paper breathing through, at 3 it
  // is full but still legible, and by 7 the lower half is mud. The axis
  // saturates fast — 1->2 adds 130k strokes, 4->7 adds 47k — because with the
  // paint cap fixed the agents are now bounded by how far they TRAVEL, not by
  // how much ink they carry.
  ink: 3,
  weight: 1,         // overall darkness
  nibAngle: 40,      // degrees, added to each population's own nib
  nibContrast: 0.7,  // 0 = round nib (width from speed only), 1 = full broad edge
  speedWidth: 0.6,   // how much a fast drag thins the mark
  bleed: 0.55,       // wet-on-wet bloom where the two hands cross
  grain: 0.55,       // paper tooth
};

export const STYLE_KEYS = Object.keys(DEFAULT_STYLE);

// Slider metadata, and the URL codec for a style. The style is in the share
// link because it materially changes the picture — "the same link is the same
// sheet" stops being true the moment the nib angle is only in your localStorage.
export const STYLE_SPEC = {
  ink:         { min: 0.5, max: 25, step: 0.5, label: 'ink', hint: 'how far each brush travels before it runs dry. Re-runs the painting.' },
  weight:      { min: 0.2, max: 2.5, step: 0.05, label: 'weight', hint: 'overall darkness of the marks' },
  nibAngle:    { min: 0, max: 180, step: 1, label: 'nib angle', hint: 'the angle of the broad edge. Strokes along it are hairlines, across it are full width.' },
  nibContrast: { min: 0, max: 1, step: 0.02, label: 'nib contrast', hint: '0 is a round pen, 1 is a full italic nib' },
  speedWidth:  { min: 0, max: 1.4, step: 0.02, label: 'speed thinning', hint: 'how much a fast drag thins the mark' },
  bleed:       { min: 0, max: 1, step: 0.02, label: 'bleed', hint: 'wet-on-wet bloom where one hand crosses the other’s fresh ink' },
  grain:       { min: 0, max: 1, step: 0.02, label: 'paper grain', hint: 'tooth of the sheet under the pigment' },
};

// Snap a style to the grid its URL encoding uses, so encodeStyle/decodeStyle is
// an identity. This matters for exactly one field and matters a lot there:
// `ink` feeds the simulation, so a style that round-trips to 2.998 instead of 3
// paints a measurably different sheet. The shared link then showed a different
// picture from the one that was shared, which is the single promise this
// surface makes. Everything else is render-only and would merely have drifted.
export function quantizeStyle(st) {
  const out = {};
  for (const k of STYLE_KEYS) {
    const { min, max } = STYLE_SPEC[k];
    let v = Math.round(((st[k] - min) / (max - min)) * 4095);
    v = v < 0 ? 0 : v > 4095 ? 4095 : v;
    out[k] = min + (v / 4095) * (max - min);
  }
  return out;
}

export function encodeStyle(st) {
  let out = '';
  const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  for (const k of STYLE_KEYS) {
    const { min, max } = STYLE_SPEC[k];
    let v = Math.round(((st[k] - min) / (max - min)) * 4095);
    v = v < 0 ? 0 : v > 4095 ? 4095 : v;
    out += B64[(v >> 6) & 63] + B64[v & 63];
  }
  return out;
}

export function decodeStyle(str) {
  const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  if (!str || str.length < STYLE_KEYS.length * 2) return null;
  const st = { ...DEFAULT_STYLE };
  STYLE_KEYS.forEach((k, i) => {
    const hi = B64.indexOf(str[i * 2]), lo = B64.indexOf(str[i * 2 + 1]);
    if (hi < 0 || lo < 0) return;
    const { min, max } = STYLE_SPEC[k];
    st[k] = min + ((hi << 6) | lo) / 4095 * (max - min);
  });
  return st;
}

// Speed buckets. Measured segment lengths span three orders of magnitude, so
// the mapping from speed to nib width has to be logarithmic. The thresholds are
// a precomputed geometric ladder and a segment finds its bucket by comparison,
// rather than calling Math.log a hundred thousand times.
const SPEED_LO = 3e-4, SPEED_RATIO = 1.4746, NSPEED = 16;
const SPEED_EDGE = (() => {
  const e = new Float64Array(NSPEED - 1);
  let v = SPEED_LO;
  for (let i = 0; i < NSPEED - 1; i++) { v *= SPEED_RATIO; e[i] = v; }
  return e;
})();

function speedBucket(len) {
  let lo = 0, hi = NSPEED - 1;
  while (lo < hi) { const m = (lo + hi) >> 1; if (len > SPEED_EDGE[m]) lo = m + 1; else hi = m; }
  return lo;
}

// Width and alpha are continuous, then quantised into batching buckets. Doing
// it this way instead of bucketing each INPUT separately is what keeps the nib
// affordable: direction, speed and ink all collapse into one width number and
// one alpha number, so adding a whole new dimension of behaviour costs no extra
// draw calls.
const WMAX = 6, NW = 24, NA = 12;
const WQ = WMAX / NW, AQ = 1 / NA;

const hexRGB = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];

export class Paper {
  constructor(canvas, size, pair, rand, style = DEFAULT_STYLE, nibs = [0, 0]) {
    this.cv = canvas;
    this.size = size;
    this.pair = pair;
    this.style = style;
    this.nibs = nibs;
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = canvas.height = Math.round(size * this.dpr);
    canvas.style.width = canvas.style.height = size + 'px';
    this.ctx = canvas.getContext('2d');
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.rgb = [hexRGB(pair.a), hexRGB(pair.b)];
    this.ground(rand);
    this.paths = new Array(2 * NW * NA);
    this.halo = new Array(2 * NW * NA);
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
      g.addColorStop(0, c + '0.5)'); g.addColorStop(1, c + '0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, S, S);
    }

    const T = 96, tile = document.createElement('canvas');
    tile.width = tile.height = T;
    const tc = tile.getContext('2d');
    const img = tc.createImageData(T, T);
    for (let i = 0; i < T * T; i++) {
      const v = rand.float() < 0.5 ? 0 : 255;
      img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v;
      img.data[i * 4 + 3] = Math.round(14 + 26 * rand.float());
    }
    tc.putImageData(img, 0, 0);
    ctx.save();
    ctx.globalAlpha = Math.max(0, Math.min(1, this.style.grain));
    ctx.globalCompositeOperation = 'multiply';
    ctx.fillStyle = ctx.createPattern(tile, 'repeat');
    ctx.fillRect(0, 0, S, S);
    ctx.restore();
  }

  // Draw a batch of stroke segments. Called every frame with whatever the sim
  // produced, so the sheet fills in as you watch — and again wholesale from the
  // stroke log when a render slider moves.
  draw(seg, count) {
    if (!count) return;
    const S = this.size, ctx = this.ctx, st = this.style;
    const paths = this.paths, halo = this.halo;
    paths.fill(undefined); halo.fill(undefined);

    const scale = S / 720;
    // The nib term is |sin(strokeAngle - nibAngle)|, which looks like it needs
    // an atan2 and a sin per segment. It does not: expanding the difference
    // gives sin(A-B) = sinA*cosB - cosA*sinB, and (cosA, sinA) is just the
    // segment's unit direction — dx/len, dy/len — which we already have. So the
    // whole thing is two multiplies and a divide, with cos/sin of the nib angle
    // hoisted out. At 600k segments a repaint that would have cost 1.2M
    // transcendentals costs none.
    const nibOff = st.nibAngle * Math.PI / 180;
    const nibC = [Math.cos(this.nibs[0] + nibOff), Math.cos(this.nibs[1] + nibOff)];
    const nibS = [Math.sin(this.nibs[0] + nibOff), Math.sin(this.nibs[1] + nibOff)];
    const contrast = st.nibContrast, minR = 1 - contrast;
    const bleed = st.bleed, weight = st.weight;

    for (let i = 0; i < count; i++) {
      const o = i * SEG_STRIDE;
      const pop = seg[o + 6] | 0;
      const t = speedBucket(seg[o + 4]) / (NSPEED - 1);   // 0 = dwelling, 1 = fast drag
      const inkT = seg[o + 5];
      const wet = seg[o + 7];

      // ---- the broad-edge nib: width from the angle of travel ----
      const dx = seg[o + 2] - seg[o], dy = seg[o + 3] - seg[o + 1];
      const len = seg[o + 4] || 1e-9;
      const across = Math.abs((dy * nibC[pop] - dx * nibS[pop]) / len);
      const nibF = minR + contrast * across;

      // dwell broadens, a fast drag thins, the nib decides how much of either
      let w = (3.2 - 2.75 * st.speedWidth * t) * nibF * weight;
      // opacity falls as the brush dries, only gently with speed
      let a = 0.18 * (0.22 + 0.78 * inkT) * (0.55 + 0.45 * (1 - t)) * weight;
      // a hairline still has to be visible, so thin marks pay in ink instead
      if (w < 0.4) { a *= w / 0.4; w = 0.4; }

      let wb = (w / WQ) | 0; if (wb > NW - 1) wb = NW - 1; if (wb < 0) wb = 0;
      let ab = (a / AQ) | 0; if (ab > NA - 1) ab = NA - 1; if (ab < 0) ab = 0;
      const key = pop * (NW * NA) + wb * NA + ab;
      let p = paths[key] || (paths[key] = new Path2D());
      p.moveTo((seg[o] * 0.5 + 0.5) * S, (seg[o + 1] * 0.5 + 0.5) * S);
      p.lineTo((seg[o + 2] * 0.5 + 0.5) * S, (seg[o + 3] * 0.5 + 0.5) * S);

      // ---- wet-on-wet: bloom where this hand crossed the other's fresh ink ----
      if (bleed > 0 && wet > 0.04) {
        const hw = w * (1 + 5 * bleed * wet);
        let hb = (hw / WQ) | 0; if (hb > NW - 1) hb = NW - 1;
        const ha = a * 0.30 * bleed;
        let hab = (ha / AQ) | 0; if (hab > NA - 1) hab = NA - 1;
        const hk = pop * (NW * NA) + hb * NA + hab;
        let q = halo[hk] || (halo[hk] = new Path2D());
        q.moveTo((seg[o] * 0.5 + 0.5) * S, (seg[o + 1] * 0.5 + 0.5) * S);
        q.lineTo((seg[o + 2] * 0.5 + 0.5) * S, (seg[o + 3] * 0.5 + 0.5) * S);
      }
    }

    ctx.globalCompositeOperation = 'multiply';
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    // halos first, so the crisp mark sits on top of its own bloom
    this._strokeSet(halo, scale);
    this._strokeSet(paths, scale);
    ctx.globalCompositeOperation = 'source-over';
  }

  _strokeSet(set, scale) {
    const ctx = this.ctx;
    for (let key = 0; key < set.length; key++) {
      const p = set[key];
      if (!p) continue;
      const pop = (key / (NW * NA)) | 0;
      const rest = key % (NW * NA);
      const w = ((rest / NA | 0) + 0.5) * WQ;
      const a = ((rest % NA) + 0.5) * AQ;
      const [r, g, bl] = this.rgb[pop];
      ctx.lineWidth = Math.max(0.3, w * scale);
      ctx.strokeStyle = `rgba(${r},${g},${bl},${a.toFixed(4)})`;
      ctx.stroke(p);
    }
  }
}

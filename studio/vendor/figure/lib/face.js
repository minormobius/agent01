// face.js — an anime face as predicates and an expression, resolved to numbers.
//
// A face is IDENTITY (who this is: the shape of the eyes, the brows, the mouth,
// a beauty mark) and EXPRESSION (what they are feeling now: a smile, a frown,
// a wink, where they look). Anime draws both from a small shared vocabulary —
// tsurime (eyes whose outer corners lift), tareme (outer corners droop), jito-me
// (the half-lidded stare), the ω cat mouth, the blush hatching — which is what
// makes it systematic enough to generate. Each word below is a set of numbers;
// resolveFace merges them in order and the shader draws the result.
//
// Face coordinates: u across the face (+u is the figure's LEFT, the viewer's
// right in a front view), v up from the chin tip. The head is one unit tall.
// Features are drawn on the head's front by projecting along its forward axis,
// so they turn with the head and the head's own shape hides the far eye.

// ---- the parameter block the shader reads (uniform float fp[32]) ------------------
export const FP = {
  on: 0, eyeLine: 1, eyeX: 2, eyeW: 3, eyeH: 4, tilt: 5, openL: 6, openR: 7, gazeX: 8, gazeY: 9,
  iris: 10, lash: 11, droop: 12, lower: 13, closedCurve: 14,
  browRaise: 15, browTilt: 16, browThick: 17, browArch: 18,
  nose: 19, noseV: 20, mouthV: 21, mouthW: 22, smile: 23, mouthOpen: 24, mouthRound: 25, mouthStyle: 26,
  blush: 27, mole: 28, px: 29, pivotUp: 30, crease: 31, flick: 32,
};
export const FP_SIZE = 36;

export const BASE = {
  on: 1, eyeLine: 0.42, eyeX: 0.172, eyeW: 0.094, eyeH: 0.18, tilt: 0.04, open: 1, wink: 0, gazeX: 0, gazeY: 0,
  iris: 1, lash: 1, droop: 0, lower: 0.7, closedCurve: 1,
  browRaise: 0, browTilt: 0, browThick: 1, browArch: 0.6,
  nose: 1, noseV: 0.26, mouthV: 0.13, mouthW: 0.05, smile: 0.2, mouthOpen: 0, mouthRound: 0, mouthStyle: 0,
  blush: 0, mole: 0, crease: 1, flick: 1, blink: 0,
  colors: { irisTop: '#3a2a52', irisBot: '#7d6fc4', irisDark: '#1c1426', brow: '#3b2a26', mouth: '#7a2a32', tongue: '#e0808a', blush: '#f09aa0' },
};

// ---- identity: the vocabulary ------------------------------------------------------
export const PREDICATES = {
  eyes: {
    round: { eyeH: 0.21, eyeW: 0.097, tilt: 0.02, iris: 1.08, droop: -0.1 },           // big, open, young
    tsurime: { eyeH: 0.15, eyeW: 0.1, tilt: 0.2, iris: 0.95, droop: 0.15 },         // outer corners lift: sharp, proud
    tareme: { eyeH: 0.18, eyeW: 0.096, tilt: -0.16, iris: 1.02, droop: -0.05, lower: 1 }, // outer corners droop: gentle
    narrow: { eyeH: 0.11, eyeW: 0.1, tilt: 0.12, iris: 0.82, droop: 0.4, crease: 0 },  // thin and cool
    jitome: { eyeH: 0.16, eyeW: 0.096, tilt: 0.0, iris: 0.9, droop: 0.9, open: 0.55 },  // the half-lidded stare
  },
  brows: {
    thin: { browThick: 0.7, browArch: 0.6 },
    thick: { browThick: 1.6, browArch: 0.3 },
    arched: { browThick: 0.9, browArch: 1.4 },
    straight: { browThick: 1.1, browArch: 0 },
  },
  mouth: {
    small: { mouthW: 0.04 },
    wide: { mouthW: 0.068 },
    cat: { mouthStyle: 1, mouthW: 0.05 },
    fang: { mouthStyle: 2, mouthW: 0.05 },
  },
  nose: { none: { nose: 0 }, tick: { nose: 1 }, dot: { nose: 2 } },
  lashes: { light: { lash: 0.7 }, heavy: { lash: 1.45 } },
  extras: { blush: { blush: 1 }, mole: { mole: -1 }, 'mole-left': { mole: 1 } },
  irisColor: {
    violet: { irisTop: '#3a2a52', irisBot: '#8b7bd4', irisDark: '#1c1426' },
    blue: { irisTop: '#1f3a6a', irisBot: '#6fb0e8', irisDark: '#101c33' },
    green: { irisTop: '#1f4a36', irisBot: '#72c58f', irisDark: '#0f2419' },
    amber: { irisTop: '#6a3a12', irisBot: '#f0b24a', irisDark: '#301a08' },
    red: { irisTop: '#5c1420', irisBot: '#e0505e', irisDark: '#2a0810' },
    brown: { irisTop: '#3b2418', irisBot: '#9a6a44', irisDark: '#1c110b' },
  },
};

// ---- expression: the state ---------------------------------------------------------
export const EXPRESSIONS = {
  neutral: {},
  smile: { smile: 1, browRaise: 0.01, open: 0.92 },
  laugh: { smile: 1, mouthOpen: 1, open: 0, closedCurve: 1, browRaise: 0.02 },
  angry: { browTilt: 1, browRaise: -0.02, smile: -0.7, open: 0.85, gazeY: -0.1 },
  sad: { browTilt: -1, browRaise: 0.01, smile: -0.8, open: 0.8, gazeY: -0.5 },
  surprised: { browRaise: 0.05, browArch: 1.5, iris: 0.75, open: 1.12, mouthOpen: 0.7, mouthRound: 1, smile: 0 },
  wink: { smile: 0.9, wink: 1, closedCurve: 1 },
  sleepy: { open: 0.3, droop: 1, browRaise: -0.005, smile: 0, closedCurve: -1 },
  shout: { browTilt: 1, mouthOpen: 1, smile: -0.2, open: 1, iris: 0.8 },
};

export const IDENTITY_KEYS = ['eyes', 'brows', 'mouth', 'nose', 'lashes', 'irisColor'];

/**
 * face: { eyes: 'tsurime', brows: 'thin', mouth: 'cat', extras: ['blush'], irisColor: 'blue', ...overrides }
 * expression: a name, or an object of overrides; gaze: [x, y] in -1..1.
 */
export function resolveFace(face = {}, expression = 'neutral', gaze = null, { masc = 0 } = {}) {
  if (face === false) return null;
  const p = { ...BASE, colors: { ...BASE.colors } };
  const apply = (o) => { for (const [k, v] of Object.entries(o)) { if (k.startsWith('iris') && typeof v === 'string' || ['brow', 'mouth', 'tongue', 'blush'].includes(k) && typeof v === 'string') p.colors[k] = v; else p[k] = v; } };
  for (const key of IDENTITY_KEYS) if (face[key]) {
    const w = PREDICATES[key][face[key]];
    if (!w) throw new Error(`unknown ${key}: ${face[key]} (know: ${Object.keys(PREDICATES[key]).join(', ')})`);
    apply(w);
  }
  for (const x of face.extras || []) apply(PREDICATES.extras[x] || {});
  if (face.hairColor) p.colors.brow = face.hairColor;
  for (const [k, v] of Object.entries(face)) if (k in BASE && typeof v === 'number') p[k] = v;     // numeric overrides
  // a masculine face, from the body (or face.masc): it SCALES the identity rather than
  // replacing it, so a tsurime man keeps his lifted corners. Smaller eyes, the lashes
  // down to a line with no flick, heavier and straighter brows set lower, a drawn nose.
  const mm = face.masc ?? masc;
  if (mm > 0) {
    p.eyeH *= 1 - 0.3 * mm; p.eyeW *= 1 + 0.04 * mm; p.iris *= 1 - 0.1 * mm;
    p.lash *= 1 - 0.5 * mm; p.flick = 1 - mm; p.lower *= 1 - 0.3 * mm;
    p.browThick *= 1 + 0.5 * mm; p.browArch *= 1 - 0.5 * mm; p.browRaise -= 0.022 * mm; p.tilt += 0.04 * mm;
    if (p.nose === 1 && mm > 0.5) p.nose = 3;
    p.mouthW *= 1 + 0.14 * mm;
  }
  p.masc = mm;
  const identityOpen = p.open, identityDroop = p.droop;
  const ex = typeof expression === 'string' ? EXPRESSIONS[expression] : expression;
  if (!ex) throw new Error(`unknown expression: ${expression}`);
  apply(ex);
  // expressions scale the identity's openness rather than replace it (a jito-me stays half-lidded when smiling)
  if ('open' in ex) p.open = ex.open === 0 ? 0 : Math.min(1.15, ex.open * identityOpen);
  if ('droop' in ex) p.droop = Math.max(identityDroop, ex.droop);
  if (gaze) { p.gazeX = gaze[0]; p.gazeY = gaze[1]; }
  // a wink closes the right eye by degrees (a blended expression passes through half a wink),
  // and a blink closes both on top of whatever the face is doing
  const shut = 1 - Math.max(0, Math.min(1, p.blink || 0));
  p.openL = p.open * shut; p.openR = p.open * (1 - Math.max(0, Math.min(1, p.wink || 0))) * shut;
  p.expression = typeof expression === 'string' ? expression : 'custom';
  return p;
}

/** The shader's parameter block; px is the geometry pass's pixel in head units. */
export function packFace(p, { px = 0.004, pivotUp = 0.1 } = {}) {
  const f = new Float32Array(FP_SIZE);
  if (!p) return f;
  for (const [k, i] of Object.entries(FP)) f[i] = p[k] ?? 0;
  f[FP.px] = px; f[FP.pivotUp] = pivotUp;
  return f;
}

// ---- the layout, for checks: where each feature sits in (u, v) ---------------------

/** The upper and lower lid of one eye at s ∈ [−1, 1] across it, in eye-local units. */
export function lids(p, open, s) {
  const k = Math.max(0, 1 - s * s);
  const a = 0.45 - 0.3 * Math.max(0, p.droop);
  const yU = p.eyeH * (open * 0.55 * Math.pow(k, Math.max(0.15, a)) * (1 - 0.35 * Math.max(0, p.droop)) - 0.04 * s);
  const yL = -p.eyeH * open * 0.45 * Math.pow(k, 0.7);
  return { yU, yL };
}

/** Face-plane points (u, v) for one eye's outline (left eye: side +1). */
export function eyeOutline(p, side = 1, n = 24) {
  const open = side > 0 ? p.openL : p.openR;
  const c = Math.cos(p.tilt), s = Math.sin(p.tilt);
  const toFace = (qx, qy) => [side * (p.eyeX + c * qx - s * qy), p.eyeLine + s * qx + c * qy];
  const top = [], bot = [];
  for (let i = 0; i <= n; i++) {
    const t = -1 + (2 * i) / n, { yU, yL } = lids(p, open, t);
    top.push(toFace(t * p.eyeW, yU)); bot.push(toFace(t * p.eyeW, yL));
  }
  return { top, bot };
}

/**
 * The brow's centre line (left brow: side +1). A brow may lower, tilt and knit
 * with the expression, but never into the eye: it rides at least a lash's
 * thickness plus a gap above the upper lid (the shader clamps the same way).
 */
export function browLine(p, side = 1, n = 16) {
  const out = [];
  const W = p.eyeW * 1.15, base = p.eyeLine + p.eyeH * 0.62 + 0.05 + p.browRaise;
  const open = side > 0 ? p.openL : p.openR;
  for (let i = 0; i <= n; i++) {
    const t = -1 + (2 * i) / n, bx = t * W;
    let y = base + p.browArch * 0.025 * (1 - t * t) - p.browTilt * 0.035 * (1 - t) / 2 + Math.sin(p.tilt) * bx;
    y = Math.max(y, browFloor(p, open, bx + 0.01));
    out.push([side * (p.eyeX + 0.01 + bx), y]);
  }
  return out;
}

/** The lowest a brow may sit at x (outward from the eye's centre): above the lid, the lash, and a gap. */
export function browFloor(p, open, x) {
  // the lid point whose face position is at x: the eye is tilted, so solve for its own x
  const c = Math.cos(p.tilt), sn = Math.sin(p.tilt), o = Math.max(open, 0.6);
  const top = (qx) => lids(p, o, Math.max(-1, Math.min(1, qx / p.eyeW))).yU;
  const at = (x0) => {
    let qx = x0;
    for (let i = 0; i < 4; i++) qx = (x0 + sn * top(qx)) / c;
    return p.eyeLine + sn * qx + c * top(qx);
  };
  // the lid's envelope near x: it climbs steeply just inside the corners
  const d = p.eyeW * 0.12;
  return Math.max(at(x - d), at(x), at(x + d)) + 0.03 * p.lash + 0.018;
}

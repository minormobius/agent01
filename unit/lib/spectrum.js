// unit — light: wavelength ↔ color. No deps, no DOM. Pure functions.
// Used by the browser page (/color, ES module) and the node selftest
// (spectrum.selftest.mjs), and attaches to globalThis so a plain <script>
// exposes `SPECTRUM`.
//
// This is NOT a unit conversion, which is why it lives outside units.js's
// factor/offset model. A wavelength has exactly one color; a color does not
// have one wavelength. Only the spectral locus — the horseshoe rim — is pure
// light. Everything inside it, magenta included, is a mixture.
//
//   nm → color   CIE 1931 2° standard observer → XYZ → sRGB. Every spectral
//                 color is OUTSIDE the sRGB gamut, so it has to be brought in
//                 (see gamutMap) and `purity` reports how much survived.
//   color → nm   DOMINANT wavelength: cast a ray from the D65 white point
//                 through the color's chromaticity and see where it leaves
//                 the locus. If it exits through the line of purples the
//                 color has NO wavelength; we report its complement instead.
//
// The color-matching table is the CIE 1931 2° observer at 5 nm, 380–780,
// linearly interpolated (the standard practice for display work; the error is
// far below what a screen can show). Source: CIE 15:2004 / CVRL ciexyz31.

const S = {};

// ── exact SI constants (2019 redefinition) ──
S.C = 299792458;            // speed of light in vacuum, m/s
S.H = 6.62607015e-34;       // Planck constant, J·s
S.QE = 1.602176634e-19;     // elementary charge, C
S.HC_EV_NM = (S.H * S.C / S.QE) * 1e9;   // 1239.8419843… eV·nm

S.VISIBLE = { min: 380, max: 780 };
S.WHITE = { x: 0.3127, y: 0.3290 };      // D65, CIE 1931 2°
S.PRIMARIES = { r: { x: 0.64, y: 0.33 }, g: { x: 0.30, y: 0.60 }, b: { x: 0.15, y: 0.06 } };

// ── CIE 1931 2° color-matching functions, [x̄, ȳ, z̄] at 5 nm from 380 nm ──
S.CMF_FROM = 380;
S.CMF_STEP = 5;
S.CMF = [
  [0.001368,0.000039,0.00645], [0.002236,0.000064,0.01055], [0.004243,0.00012,0.02005], [0.00765,0.000217,0.03621],
  [0.01431,0.000396,0.06785], [0.02319,0.00064,0.1102], [0.04351,0.00121,0.2074], [0.07763,0.00218,0.3713],
  [0.13438,0.004,0.6456], [0.21477,0.0073,1.03905], [0.2839,0.0116,1.3856], [0.3285,0.01684,1.62296],
  [0.34828,0.023,1.74706], [0.34806,0.0298,1.7826], [0.3362,0.038,1.77211], [0.3187,0.048,1.7441],
  [0.2908,0.06,1.6692], [0.2511,0.0739,1.5281], [0.19536,0.09098,1.28764], [0.1421,0.1126,1.0419],
  [0.09564,0.13902,0.81295], [0.05795,0.1693,0.6162], [0.03201,0.20802,0.46518], [0.0147,0.2586,0.3533],
  [0.0049,0.323,0.272], [0.0024,0.4073,0.2123], [0.0093,0.503,0.1582], [0.0291,0.6082,0.1117],
  [0.06327,0.71,0.07825], [0.1096,0.7932,0.05725], [0.1655,0.862,0.04216], [0.22575,0.91485,0.02984],
  [0.2904,0.954,0.0203], [0.3597,0.9803,0.0134], [0.43345,0.99495,0.00875], [0.51205,1,0.00575],
  [0.5945,0.995,0.0039], [0.6784,0.9786,0.00275], [0.7621,0.952,0.0021], [0.8425,0.9154,0.0018],
  [0.9163,0.87,0.00165], [0.9786,0.8163,0.0014], [1.0263,0.757,0.0011], [1.0567,0.6949,0.001],
  [1.0622,0.631,0.0008], [1.0456,0.5668,0.0006], [1.0026,0.503,0.00034], [0.9384,0.4412,0.00024],
  [0.85445,0.381,0.00019], [0.7514,0.321,0.0001], [0.6424,0.265,0.00005], [0.5419,0.217,0.00003],
  [0.4479,0.175,0.00002], [0.3608,0.1382,0.00001], [0.2835,0.107,0], [0.2187,0.0816,0],
  [0.1649,0.061,0], [0.1212,0.04458,0], [0.0874,0.032,0], [0.0636,0.0232,0],
  [0.04677,0.017,0], [0.0329,0.01192,0], [0.0227,0.00821,0], [0.01584,0.005723,0],
  [0.0113592,0.004102,0], [0.00811092,0.002929,0], [0.00579035,0.002091,0], [0.00410946,0.001484,0],
  [0.00289933,0.001047,0], [0.00204919,0.00074,0], [0.00143997,0.00052,0], [0.000999949,0.0003611,0],
  [0.000690079,0.0002492,0], [0.000476021,0.0001719,0], [0.000332301,0.00012,0], [0.000234826,0.0000848,0],
  [0.000166151,0.00006,0], [0.000117413,0.0000424,0], [0.0000830753,0.00003,0], [0.0000587065,0.0000212,0],
  [0.0000415099,0.00001499,0],
];

// x̄ ȳ z̄ at any wavelength, linearly interpolated; zero outside the table.
S.cmf = (nm) => {
  if (!(nm >= S.CMF_FROM) || nm > S.VISIBLE.max) return { X: 0, Y: 0, Z: 0 };
  const f = (nm - S.CMF_FROM) / S.CMF_STEP;
  const i = Math.min(Math.floor(f), S.CMF.length - 2);
  const t = f - i;
  const a = S.CMF[i], b = S.CMF[i + 1];
  return {
    X: a[0] + (b[0] - a[0]) * t,
    Y: a[1] + (b[1] - a[1]) * t,
    Z: a[2] + (b[2] - a[2]) * t,
  };
};

// chromaticity of a pure wavelength — its point on the spectral locus
S.chromaticity = (nm) => {
  const { X, Y, Z } = S.cmf(nm);
  const s = X + Y + Z;
  if (!(s > 0)) return { x: NaN, y: NaN };
  return { x: X / s, y: Y / s };
};

// ── sRGB (IEC 61966-2-1, D65) ──
const M_XYZ_RGB = [
  [ 3.2404542, -1.5371385, -0.4985314],
  [-0.9692660,  1.8760108,  0.0415560],
  [ 0.0556434, -0.2040259,  1.0572252],
];
const M_RGB_XYZ = [
  [0.4124564, 0.3575761, 0.1804375],
  [0.2126729, 0.7151522, 0.0721750],
  [0.0193339, 0.1191920, 0.9503041],
];

S.xyzToLinear = ({ X, Y, Z }) => ({
  r: M_XYZ_RGB[0][0] * X + M_XYZ_RGB[0][1] * Y + M_XYZ_RGB[0][2] * Z,
  g: M_XYZ_RGB[1][0] * X + M_XYZ_RGB[1][1] * Y + M_XYZ_RGB[1][2] * Z,
  b: M_XYZ_RGB[2][0] * X + M_XYZ_RGB[2][1] * Y + M_XYZ_RGB[2][2] * Z,
});
S.linearToXyz = ({ r, g, b }) => ({
  X: M_RGB_XYZ[0][0] * r + M_RGB_XYZ[0][1] * g + M_RGB_XYZ[0][2] * b,
  Y: M_RGB_XYZ[1][0] * r + M_RGB_XYZ[1][1] * g + M_RGB_XYZ[1][2] * b,
  Z: M_RGB_XYZ[2][0] * r + M_RGB_XYZ[2][1] * g + M_RGB_XYZ[2][2] * b,
});

// the sRGB transfer function, both ways
S.encode = (u) => (u <= 0.0031308 ? 12.92 * u : 1.055 * Math.pow(u, 1 / 2.4) - 0.055);
S.decode = (v) => (v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const xyOf = (lin) => {
  const { X, Y, Z } = S.linearToXyz(lin);
  const s = X + Y + Z;
  return s > 0 ? { x: X / s, y: Y / s } : { x: NaN, y: NaN };
};

// Bring an out-of-gamut linear color into sRGB. Two honest answers:
//
//   'true'  (default) — add white until nothing is negative. This slides the
//           color straight down the line toward D65, so its DOMINANT
//           WAVELENGTH is unchanged: nm → color → nm round-trips. Deep reds
//           and violets come back visibly desaturated, because that is what
//           your screen can actually do.
//   'vivid' — clamp the negatives to zero instead. Maximum saturation, the
//           familiar poster spectrum, but the hue is shifted: sRGB's red
//           primary is only 611 nm, so everything beyond it renders the same.
//
// Then scale so the brightest primary is 1 — a pure luminance move, which
// leaves chromaticity alone.
S.gamutMap = (lin, mode = 'true') => {
  let { r, g, b } = lin;
  if (mode === 'vivid') {
    r = Math.max(0, r); g = Math.max(0, g); b = Math.max(0, b);
  } else {
    const low = Math.min(r, g, b);
    if (low < 0) { r -= low; g -= low; b -= low; }
  }
  const high = Math.max(r, g, b);
  if (high > 0) { r /= high; g /= high; b /= high; }
  return { r, g, b };
};

// Perceived brightness envelope. The eye's response dies away at both ends of
// the band, so a 400 nm swatch at full brightness would be a lie.
S.fade = (nm) => {
  if (nm < S.VISIBLE.min || nm > S.VISIBLE.max) return 0;
  if (nm < 420) return 0.25 + 0.75 * (nm - 380) / 40;
  if (nm > 700) return 0.25 + 0.75 * (780 - nm) / 80;
  return 1;
};

// wavelength → 8-bit sRGB.
//   { fade: true }    dim the ends of the band (default on)
//   { mode: 'vivid' } see gamutMap — 'vivid' by default, because a swatch
//                     that reads as pink for 650 nm is not a useful splash.
//                     'true' preserves the dominant wavelength instead.
// `purity` is how much of the pure color a screen can reach — measured on
// the 'true' mapping whichever mode you asked to see, since that is the
// question it answers. 1 = sRGB shows it exactly; 0.66 = two thirds of the
// way from white to the real thing, and no further.
S.rgb = (nm, opts = {}) => {
  const fade = opts.fade === undefined ? true : opts.fade;
  const mode = opts.mode || 'vivid';
  if (!(nm >= S.VISIBLE.min) || nm > S.VISIBLE.max) {
    return { r: 0, g: 0, b: 0, purity: 0, visible: false };
  }
  const xyz = S.xyzToLinear(S.cmf(nm));
  const lin = S.gamutMap(xyz, mode);
  const k = fade ? S.fade(nm) : 1;
  const P = xyOf(mode === 'true' ? lin : S.gamutMap(xyz, 'true'));
  const L = S.chromaticity(nm), W = S.WHITE;
  const den = Math.hypot(L.x - W.x, L.y - W.y);
  return {
    r: Math.round(255 * clamp01(S.encode(clamp01(lin.r * k)))),
    g: Math.round(255 * clamp01(S.encode(clamp01(lin.g * k)))),
    b: Math.round(255 * clamp01(S.encode(clamp01(lin.b * k)))),
    purity: den > 0 ? Math.min(1, Math.hypot(P.x - W.x, P.y - W.y) / den) : 0,
    visible: true,
  };
};

const hex2 = (n) => n.toString(16).padStart(2, '0');
S.toHex = ({ r, g, b }) => '#' + hex2(r) + hex2(g) + hex2(b);
S.hex = (nm, opts) => S.toHex(S.rgb(nm, opts));

S.parseHex = (str) => {
  const s = String(str).trim().replace(/^#/, '');
  if (!/^([0-9a-f]{3}|[0-9a-f]{6})$/i.test(s)) return null;
  const h = s.length === 3 ? s.split('').map(c => c + c).join('') : s;
  return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16) };
};

// any chromaticity → a displayable sRGB color, for painting the diagram
S.xyToRgb = (x, y, { mode = 'vivid' } = {}) => {
  if (!(y > 0)) return { r: 0, g: 0, b: 0 };
  const lin = S.gamutMap(S.xyzToLinear({ X: x / y, Y: 1, Z: (1 - x - y) / y }), mode);
  return {
    r: Math.round(255 * clamp01(S.encode(clamp01(lin.r)))),
    g: Math.round(255 * clamp01(S.encode(clamp01(lin.g)))),
    b: Math.round(255 * clamp01(S.encode(clamp01(lin.b)))),
  };
};

// ── derived quantities of a photon ──
S.frequency = (nm) => S.C / (nm * 1e-9);        // Hz
S.terahertz = (nm) => S.frequency(nm) / 1e12;
S.fromTerahertz = (thz) => (S.C / (thz * 1e12)) * 1e9;
S.photonEV = (nm) => S.HC_EV_NM / nm;
S.fromEV = (ev) => S.HC_EV_NM / ev;
S.photonJoules = (nm) => S.photonEV(nm) * S.QE;
S.wavenumber = (nm) => 1e7 / nm;                // cm⁻¹

// ── naming ──
// Color-name boundaries are conventional, not physical: the hues shade into
// one another continuously and no two references draw the lines alike.
S.BANDS = [
  { to: 0.01,     name: 'Gamma ray',        region: 'ionising' },
  { to: 10,       name: 'X-ray',            region: 'ionising' },
  { to: 100,      name: 'Extreme UV',       region: 'ultraviolet' },
  { to: 280,      name: 'UV-C',             region: 'ultraviolet' },
  { to: 315,      name: 'UV-B',             region: 'ultraviolet' },
  { to: 380,      name: 'UV-A',             region: 'ultraviolet' },
  { to: 450,      name: 'Violet',           region: 'visible' },
  { to: 485,      name: 'Blue',             region: 'visible' },
  { to: 500,      name: 'Cyan',             region: 'visible' },
  { to: 565,      name: 'Green',            region: 'visible' },
  { to: 590,      name: 'Yellow',           region: 'visible' },
  { to: 625,      name: 'Orange',           region: 'visible' },
  { to: 750,      name: 'Red',              region: 'visible' },
  { to: 780,      name: 'Deep red',         region: 'visible' },
  { to: 1400,     name: 'Near infrared',    region: 'infrared' },
  { to: 3000,     name: 'Short-wave IR',    region: 'infrared' },
  { to: 50000,    name: 'Mid infrared',     region: 'infrared' },
  { to: 1e6,      name: 'Far infrared',     region: 'infrared' },
  { to: Infinity, name: 'Microwave / radio', region: 'radio' },
];
S.band = (nm) => {
  const b = S.BANDS.find(b => nm <= b.to) || S.BANDS[S.BANDS.length - 1];
  return { name: b.name, region: b.region, visible: b.region === 'visible' };
};

// Landmark lines — wavelengths you can point at in the real world.
S.LINES = [
  { nm: 253.7,  name: 'Mercury UV-C',        note: 'germicidal lamp' },
  { nm: 365.0,  name: 'Blacklight',          note: 'mercury i-line, UV-A' },
  { nm: 405.0,  name: 'Violet diode',        note: 'the Blu-ray laser' },
  { nm: 435.8,  name: 'Mercury g-line',      note: 'photolithography' },
  { nm: 450.0,  name: 'Blue LED',            note: 'InGaN — the pump inside white LEDs' },
  { nm: 486.1,  name: 'Hydrogen Hβ',         note: 'Fraunhofer F' },
  { nm: 532.0,  name: 'Green laser pointer', note: 'frequency-doubled Nd:YAG' },
  { nm: 546.1,  name: 'Mercury e-line',      note: 'fluorescent-tube green' },
  { nm: 555.0,  name: 'Peak photopic',       note: 'brightest to a light-adapted eye' },
  { nm: 589.3,  name: 'Sodium D',            note: 'street lamps, the flame test' },
  { nm: 632.8,  name: 'Helium–neon',         note: 'the classic red laser' },
  { nm: 656.3,  name: 'Hydrogen Hα',         note: 'Fraunhofer C — solar prominences' },
  { nm: 694.3,  name: 'Ruby laser',          note: 'the first laser, 1960' },
  { nm: 850.0,  name: 'IR remote',           note: 'TV remotes, night-vision lamps' },
  { nm: 1550.0, name: 'Telecom C-band',      note: 'fibre — silica’s loss minimum' },
];

// ── color → wavelength ──
// The spectral locus, sampled fine enough that interpolating between
// neighbours costs well under a nanometre.
// Past 700 nm the standard observer stops moving: x̄/ȳ is constant, so 700 nm
// and 780 nm have the SAME chromaticity and differ only in brightness. The
// horseshoe therefore ends at 700 — degenerate segments beyond it would leave
// the ray cast below with nothing to hit, and any deeper red honestly answers
// '700 nm or more'.
S.LOCUS_MAX = 700;
let LOCUS = null;
S.locus = (step = 0.5) => {
  if (LOCUS && LOCUS.step === step) return LOCUS.pts;
  const pts = [];
  for (let nm = S.VISIBLE.min; nm <= S.LOCUS_MAX + 1e-9; nm += step) {
    const { x, y } = S.chromaticity(nm);
    const last = pts[pts.length - 1];
    if (last && Math.hypot(last.x - x, last.y - y) < 1e-9) continue;   // no zero-length segments
    pts.push({ nm, x, y });
  }
  LOCUS = { step, pts };
  return pts;
};

const PURPLE_SNAP = 0.01;   // xy units — see castRay

// ray W + t·D against segment A→B; { t, s } or null
const rayHit = (W, D, A, B) => {
  const ex = B.x - A.x, ey = B.y - A.y;
  const den = D.x * ey - D.y * ex;
  if (Math.abs(den) < 1e-15) return null;                 // parallel
  const wx = A.x - W.x, wy = A.y - W.y;
  const t = (wx * ey - ex * wy) / den;
  const s = (wx * D.y - D.x * wy) / den;
  if (t <= 0 || s < 0 || s > 1) return null;
  return { t, s };
};

// Walk the closed curve (the locus, plus the line of purples that closes it)
// and find where the ray leaves. White is inside, so there is exactly one exit.
const castRay = (D) => {
  const pts = S.locus();
  for (let i = 0; i < pts.length - 1; i++) {
    const h = rayHit(S.WHITE, D, pts[i], pts[i + 1]);
    if (h) return { t: h.t, nm: pts[i].nm + h.s * (pts[i + 1].nm - pts[i].nm), purple: false };
  }
  const tip = pts[pts.length - 1], toe = pts[0];
  const h = rayHit(S.WHITE, D, tip, toe);
  if (!h) return null;
  // 8-bit rounding is coarser than this wedge is thin: the color of pure
  // 700 nm light lands a thousandth of a unit below the tip of the horseshoe
  // and would read as a purple. A hit that close to a terminus is that
  // rounding, not a mixture — snap it back onto the end of the locus.
  const P = { x: tip.x + (toe.x - tip.x) * h.s, y: tip.y + (toe.y - tip.y) * h.s };
  if (Math.hypot(P.x - tip.x, P.y - tip.y) < PURPLE_SNAP) return { t: h.t, nm: tip.nm, purple: false };
  if (Math.hypot(P.x - toe.x, P.y - toe.y) < PURPLE_SNAP) return { t: h.t, nm: toe.nm, purple: false };
  return { t: h.t, nm: null, purple: true, mix: h.s };
};

// Is a chromaticity inside the horseshoe at all? (for painting the diagram)
S.inLocus = (x, y) => {
  const pts = S.locus(2);
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const yi = pts[i].y, yj = pts[j].y;
    if ((yi > y) !== (yj > y) && x < (pts[j].x - pts[i].x) * (y - yi) / (yj - yi) + pts[i].x) inside = !inside;
  }
  return inside;
};

// Dominant wavelength of an sRGB color (components 0–255):
//   { nm, purity, purple, achromatic, complement, xy, luminance }
// purple — the color sits on the far side of white from every wavelength. It
// is a mixture of the two ends of the spectrum and has NO dominant
// wavelength, only a complementary one. That wedge is the line of purples,
// and it is why this page is not a two-way converter.
S.dominantWavelength = (rgb) => {
  const lin = { r: S.decode(rgb.r / 255), g: S.decode(rgb.g / 255), b: S.decode(rgb.b / 255) };
  const xyz = S.linearToXyz(lin);
  const sum = xyz.X + xyz.Y + xyz.Z;
  const out = {
    nm: null, complement: null, purple: false, achromatic: false,
    purity: 0, luminance: xyz.Y, xy: { x: NaN, y: NaN },
  };
  if (!(sum > 0)) { out.achromatic = true; return out; }         // black

  const P = { x: xyz.X / sum, y: xyz.Y / sum };
  out.xy = P;
  const D = { x: P.x - S.WHITE.x, y: P.y - S.WHITE.y };
  if (Math.hypot(D.x, D.y) < 2e-3) { out.achromatic = true; return out; }   // white / grey

  const hit = castRay(D);
  if (!hit) return out;
  out.purity = Math.min(1, 1 / hit.t);
  if (!hit.purple) { out.nm = hit.nm; return out; }

  out.purple = true;                                              // non-spectral
  const back = castRay({ x: -D.x, y: -D.y });
  if (back && !back.purple) out.complement = back.nm;
  return out;
};

// What pure light is this color pointing at? Adds the spectral swatch.
S.spectralMatch = (rgb) => {
  const d = S.dominantWavelength(rgb);
  return {
    ...d,
    hex: d.nm == null ? null : S.hex(d.nm, { fade: false }),
    complementHex: d.complement == null ? null : S.hex(d.complement, { fade: false }),
  };
};

if (typeof globalThis !== 'undefined') globalThis.SPECTRUM = S;
export default S;

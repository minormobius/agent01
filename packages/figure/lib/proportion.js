// proportion.js — a figure's measurements, from a few numbers, in HEAD UNITS.
//
// A character spec says how many heads tall the figure is and a few biases; this
// turns it into bone lengths, joint heights and thicknesses. The head is always
// one unit tall: that is the unit. Everything else scales with the body below the
// chin (B = heads − 1), so a 3-head chibi and an 8-head fashion figure come out
// of the same construction.
//
// The reference is an adult drawn at 7 heads, marked the way figure-drawing books
// mark it: chin at 6, nipples near 5, navel near 4, crotch at 3.5, knees near 1.9.
// Anime pushes the legs longer (`legs`) and the neck thinner.

export const DEFAULTS = {
  heads: 7,        // total height, in head heights
  build: 0.5,      // 0 = narrow shoulders, fine limbs … 1 = broad shoulders, heavy muscle
  legs: 0.5,       // 0 = legs at the book's proportion … 1 = long anime legs
  mass: 0.5,       // limb and torso thickness
  headWidth: 0.8,  // the head's width, in head heights (anime heads run wide)
  neck: 0.5,       // neck length bias
  femme: 0,        // 0 = a masculine frame … 1 = a feminine one (the anatomical shifts below)
  // cup (volume), lift, set (shape), waist, hips: 0..1, default from femme; set any of them to override
};

// What a feminine frame changes, after the figure-drawing books: the ribcage and
// shoulders narrow, the waist draws in, the pelvis widens and its widest point
// drops to the hip joints, the glutes and thighs fill, and the neck, arms, hands
// and feet grow finer. `femme` blends all of it; bust, waist and hips then vary
// the form within it (petite, curvy, athletic, plus-size are points in that space).

export function measure(spec = {}) {
  const S = { ...DEFAULTS, ...spec };
  const fe = S.femme;
  // the bust is independent of the frame (ANSUR II: r ≈ −0.03 between a woman's chest
  // projection and her ribcage's breadth): `cup` is its volume, `lift` and `set` its shape
  S.cup = spec.cup ?? spec.bust ?? 0.5 * fe;
  S.lift = spec.lift ?? 0.5;
  S.set = spec.set ?? 0.5;
  S.bust = S.cup;
  S.waist = spec.waist ?? 0.6 * fe;
  S.hips = spec.hips ?? 0.55 * fe;
  const H = S.heads, B = H - 1, f = S.build;
  const bust = S.bust, waist = S.waist, hips = S.hips, fat = Math.max(0, S.mass - 0.5) * 2;
  const mjaw = (1 - fe) * Math.min(1, Math.max(0, (S.heads - 3.5) / 2));
  const k = B / 6;                               // the body's size against the 7-head reference
  // Widths and thicknesses follow the build, not the height: a taller figure in
  // heads is a longer figure, not a wider one. Below the 7-head reference they
  // shrink, but slower than heights do, so a chibi stays chunky.
  const wide = k < 1 ? Math.sqrt(k) : Math.pow(k, 0.15);
  const thick = (k < 1 ? Math.pow(k, 0.35) : Math.pow(k, 0.2)) * (0.84 + 0.32 * S.mass);

  const chin = B;
  const neckLen = (0.3 + 0.12 * S.neck + 0.04 * fe) * Math.pow(k, 0.6);   // necks shrink slower than bodies: a chibi still has one
  const neckBase = chin - neckLen + 0.02;        // the neck enters the head just behind the jaw
  // the shoulder line (acromion) sits about level with the neck's base (the sternal notch):
  // ANSUR II puts both ~0.35 heads below the chin, for women and men alike (lib/ansur2.js)
  const shoulderY = neckBase - (0.02 + 0.02 * fe) * k;
  const hipY = B * (0.585 + 0.05 * S.legs);      // hip joint height: legs are everything below it
  const ankleY = 0.2 * Math.pow(k, 0.6);
  const leg = hipY - ankleY;
  const thighLen = leg * 0.51, shinLen = leg * 0.49;
  const footLen = 0.9 * Math.pow(k, 0.8) * (1 - 0.08 * fe);

  const shoulderHalf = (0.72 + 0.24 * f) * wide * (1 - 0.05 * fe);   // acromion to midline
  const hipHalf = (0.36 + 0.05 * hips) * wide;   // build is shoulders and muscle; the hips are femme's   // hip joint to midline

  const armK = Math.pow(k, 0.92);
  const upperArm = 1.38 * armK, foreArm = 1.14 * armK, hand = 0.74 * Math.pow(k, 0.6) * (1 - 0.07 * fe);

  return {
    spec: S, H, B, k, wide, thick,
    chin, neckLen, neckBase, shoulderY, hipY, ankleY,
    thighLen, shinLen, footLen, upperArm, foreArm, hand,
    shoulderHalf, hipHalf,
    // the torso's three masses, as ellipsoid radii (x wide, y tall, z deep)
    chest: { y: shoulderY - 0.62 * k, r: [(0.6 + 0.16 * f) * wide * (1 - 0.12 * fe), 0.74 * k * (1 - 0.04 * fe), (0.4 + 0.06 * f) * thick * (1 - 0.1 * fe)] },
    belly: { r: [(0.52 + 0.04 * f) * wide * (1 - 0.2 * waist) * (1 + 0.25 * fat), (0.64 - 0.16 * waist) * k, 0.34 * thick * (1 - 0.1 * waist) * (1 + 0.3 * fat)] },
    pelvis: { r: [0.47 * wide * (1 + 0.17 * hips), (0.48 - 0.03 * hips) * k, 0.33 * thick * (1 + 0.08 * hips)], drop: 0.08 * hips * k, blend: 0.24 + 0.22 * hips },
    // the forms a feminine frame adds (sizes zero when their parameter is)
    // footprint on the ribcage grows slowly with the cup, projection fast; `set` spaces and
    // turns them outward; low `lift` drops them and fills the lower pole (a teardrop)
    bust: S.cup > 0.02 ? {
      w: (0.13 + 0.07 * Math.sqrt(S.cup)) * wide * (1 + 0.15 * fat),
      proj: (0.06 + 0.2 * S.cup) * wide * (1 + 0.15 * fat),
      x: (0.23 + 0.08 * S.set) * wide, yaw: 0.14 + 0.28 * S.set,
      drop: (0.1 + 0.08 * S.cup * (1 - S.lift) + 0.04 * (1 - S.lift)) * k,
      teardrop: 0.5 * (1 - S.lift),
    } : null,
    glutes: { r: (0.2 + 0.08 * hips + 0.04 * fat) * thick, x: (0.15 + 0.03 * hips) * wide },
    // limb thickness profiles: radius at points along each bone (0 = its root, 1 = its end)
    radii: {
      neck: (0.13 + 0.05 * f) * thick * (1 - 0.16 * fe),
      deltoid: (0.2 + 0.06 * f) * thick * (1 - 0.18 * fe) * (1 + 0.25 * fat * fe),
      upperArm: [[0, 0.17], [0.4, (0.15 + 0.03 * f)], [1, 0.11]].map(([t, r]) => [t, r * thick * (1 - 0.14 * fe)]),
      foreArm: [[0, 0.115], [0.28, (0.135 + 0.02 * f)], [1, 0.085]].map(([t, r]) => [t, r * thick * (1 - 0.16 * fe)]),
      thigh: [[0, (0.25 - 0.02 * f) * (1 + 0.22 * hips)], [0.45, 0.2 * (1 + 0.14 * hips)], [1, 0.13 * (1 + 0.05 * hips)]].map(([t, r]) => [t, r * thick]),
      shin: [[0, 0.13], [0.32, 0.148 * (1 - 0.06 * fe)], [1, 0.075 * (1 - 0.08 * fe)]].map(([t, r]) => [t, r * thick]),
      hand: 0.075 * Math.sqrt(thick) * Math.pow(k, 0.3),
      foot: 0.085 * Math.pow(k, 0.5),
    },
    head: {
      pivotUp: 0.1,                 // the skull's pivot sits this far above the chin line, at the neck's top
      cranium: { c: [0, 0.48, -0.04], r: 0.42 },
      // a masculine jaw is wider and its chin blunter (the child's is neither)
      jaw: { top: [0, 0.2, 0.02], rt: 0.31 * (1 + 0.07 * mjaw), chin: [0, -0.06, 0.12 - 0.01 * mjaw], rc: 0.07 + 0.04 * mjaw },
      eyeLine: 0.38,               // above the chin, in head units: anime eyes sit low
      width: S.headWidth,
    },
  };
}

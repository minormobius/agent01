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
  build: 0.5,      // 0 = narrow shoulders, wide hips, fine limbs … 1 = broad shoulders, narrow hips
  legs: 0.5,       // 0 = legs at the book's proportion … 1 = long anime legs
  mass: 0.5,       // limb and torso thickness
  headWidth: 0.8,  // the head's width, in head heights (anime heads run wide)
  neck: 0.5,       // neck length bias
};

export function measure(spec = {}) {
  const S = { ...DEFAULTS, ...spec };
  const H = S.heads, B = H - 1, f = S.build;
  const k = B / 6;                               // the body's size against the 7-head reference
  // Widths and thicknesses follow the build, not the height: a taller figure in
  // heads is a longer figure, not a wider one. Below the 7-head reference they
  // shrink, but slower than heights do, so a chibi stays chunky.
  const wide = k < 1 ? Math.sqrt(k) : Math.pow(k, 0.15);
  const thick = (k < 1 ? Math.pow(k, 0.35) : Math.pow(k, 0.2)) * (0.84 + 0.32 * S.mass);

  const chin = B;
  const neckLen = (0.26 + 0.12 * S.neck) * Math.pow(k, 0.8);
  const neckBase = chin - neckLen + 0.12;        // the neck enters the head behind the jaw
  const shoulderY = neckBase - 0.1 * k;
  const hipY = B * (0.585 + 0.05 * S.legs);      // hip joint height: legs are everything below it
  const ankleY = 0.2 * Math.pow(k, 0.6);
  const leg = hipY - ankleY;
  const thighLen = leg * 0.51, shinLen = leg * 0.49;
  const footLen = 0.9 * Math.pow(k, 0.8);

  const shoulderHalf = (0.72 + 0.24 * f) * wide;          // acromion to midline
  const hipHalf = (0.36 + 0.05 * (1 - f)) * wide;        // hip joint to midline

  const armK = Math.pow(k, 0.92);
  const upperArm = 1.42 * armK, foreArm = 1.18 * armK, hand = 0.74 * Math.pow(k, 0.6);

  return {
    spec: S, H, B, k, wide, thick,
    chin, neckLen, neckBase, shoulderY, hipY, ankleY,
    thighLen, shinLen, footLen, upperArm, foreArm, hand,
    shoulderHalf, hipHalf,
    // the torso's three masses, as ellipsoid radii (x wide, y tall, z deep)
    chest: { y: shoulderY - 0.62 * k, r: [(0.6 + 0.16 * f) * wide, 0.74 * k, (0.4 + 0.06 * f) * thick] },
    belly: { r: [(0.46 + 0.02 * f) * wide, 0.5 * k, 0.34 * thick] },
    pelvis: { r: [(0.56 - 0.06 * f) * wide, 0.38 * k, 0.4 * thick] },
    // limb thickness profiles: radius at points along each bone (0 = its root, 1 = its end)
    radii: {
      neck: (0.13 + 0.05 * f) * thick,
      deltoid: (0.2 + 0.06 * f) * thick,
      upperArm: [[0, 0.17], [0.4, (0.15 + 0.03 * f)], [1, 0.11]].map(([t, r]) => [t, r * thick]),
      foreArm: [[0, 0.115], [0.28, (0.135 + 0.02 * f)], [1, 0.085]].map(([t, r]) => [t, r * thick]),
      thigh: [[0, (0.31 - 0.03 * f)], [0.45, 0.24], [1, 0.15]].map(([t, r]) => [t, r * thick]),
      shin: [[0, 0.145], [0.3, 0.17], [1, 0.085]].map(([t, r]) => [t, r * thick]),
      hand: 0.075 * Math.sqrt(thick) * Math.pow(k, 0.3),
      foot: 0.085 * Math.pow(k, 0.5),
    },
    head: {
      pivotUp: 0.1,                 // the skull's pivot sits this far above the chin line, at the neck's top
      cranium: { c: [0, 0.48, -0.04], r: 0.42 },
      jaw: { top: [0, 0.2, 0.02], rt: 0.31, chin: [0, -0.06, 0.12], rc: 0.07 },
      eyeLine: 0.38,               // above the chin, in head units: anime eyes sit low
      width: S.headWidth,
    },
  };
}

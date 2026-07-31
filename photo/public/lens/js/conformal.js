// conformal.js — the maps, the measurement, and the sampler. DOM-free, so
// `photo/lens.selftest.mjs` can check the mathematics under node.
//
// WHAT A CONFORMAL MAP IS, AND WHY THIS TOOL CARES
// ------------------------------------------------
// Treat the picture as a piece of the complex plane. A holomorphic function
// w = f(z) — one built from +, ×, ÷, exp, log, powers, with a non-zero
// derivative — is *conformal*: it can rotate and scale the neighbourhood of a
// point, but it cannot shear it. Angles survive. A small circle stays a small
// circle. Faces get bigger or smaller, never squashed.
//
// That is measurable, and the number has a name. Write the map's Jacobian at a
// point and take its two singular values σ₁ ≥ σ₂; the **quasiconformal
// dilatation** is K = σ₁/σ₂. A map is conformal exactly where K = 1: it takes
// infinitesimal circles to circles. Where K = 2 it takes circles to ellipses
// twice as long as they are wide — that is shear, and that is what "distorted"
// means, precisely.
//
// So every map here declares what it is, and the tool measures whether the
// claim holds:
//
//   conformal (K = 1)      Möbius bulges, sphere rotation (the little planet),
//                          powers, Droste, spirals, inversion, Joukowsky,
//                          holomorphic waves
//   anticonformal (K = 1)  kaleidoscope folds — angles preserved, handedness
//                          reversed (det J < 0)
//   not conformal (K > 1)  every real lens projection, and every funhouse
//                          mirror worth the name
//
// The last line is not a failure, it is a theorem. A purely radial map r ↦ g(r)
// stretches by g′(r) along the radius and by g(r)/r around it; those agree only
// when g(r) = cr, a plain zoom. **So no fisheye and no radial bulge can
// preserve shape.** The conformal family gets a magnifier too — the Möbius one
// — but it has to *move* the picture while it magnifies. That is the price of
// keeping angles, and this tool is built to show you the bill.

// ────────────────────────────────────────────────── complex arithmetic ──
//
// Written as (re, im) pairs into a scratch array rather than objects: the field
// builder evaluates these a few million times per render.

const TAU = Math.PI * 2;
const D2R = Math.PI / 180;

const clampAbs = (v, lim) => (v > lim ? lim : v < -lim ? -lim : v);

/** natural log of a complex number, principal branch */
function clog(x, y, out) {
  out[0] = Math.log(Math.hypot(x, y) || 1e-12);
  out[1] = Math.atan2(y, x);
}
function cexp(x, y, out) {
  const e = Math.exp(clampAbs(x, 60));
  out[0] = e * Math.cos(y);
  out[1] = e * Math.sin(y);
}
const cmulRe = (ax, ay, bx, by) => ax * bx - ay * by;
const cmulIm = (ax, ay, bx, by) => ax * by + ay * bx;
function cdiv(ax, ay, bx, by, out) {
  const d = bx * bx + by * by || 1e-24;
  out[0] = (ax * bx + ay * by) / d;
  out[1] = (ay * bx - ax * by) / d;
}

// ──────────────────────────────────────────────────────────── the maps ──
//
// Each map is written as a PULLBACK: given an output point w it returns the
// source point z to read from, which is the inverse of the visual transform.
// (For the holomorphic ones the inverse of a conformal map is conformal, so
// nothing is lost by writing whichever direction is cleaner.) A stack is
// therefore evaluated last-to-first — see buildField.

const t = [0, 0], t2 = [0, 0];

export const MAPS = {

  sphere: {
    label: 'little planet',
    kind: 'conformal',
    note: 'Wrap the picture onto a sphere by stereographic projection, turn the sphere, and project it back. Sphere rotations are Möbius transformations of the plane, so this is exactly conformal — which is why the little planet keeps every face and doorway the right shape while bending the whole world into a ball. The fisheye that costs nothing.',
    params: {
      pitch: { min: -180, max: 180, step: 1, def: 150, label: 'pitch' },
      yaw: { min: -180, max: 180, step: 1, def: 0, label: 'yaw' },
      roll: { min: -180, max: 180, step: 1, def: 0, label: 'roll' },
      zoom: { min: 0.15, max: 6, step: 0.01, def: 1, label: 'sphere size' },
    },
    pull(x, y, P, out) {
      const k = P.zoom;
      const px = x / k, py = y / k;
      // plane → unit sphere (inverse stereographic from the north pole)
      const d = px * px + py * py, s = 1 / (1 + d);
      let X = 2 * px * s, Y = 2 * py * s, Z = (d - 1) * s;
      // rotate: yaw about Z, pitch about X, roll about Y
      const cy = Math.cos(P.yaw * D2R), sy = Math.sin(P.yaw * D2R);
      let a = X * cy - Y * sy, b = X * sy + Y * cy;
      X = a; Y = b;
      const cp = Math.cos(P.pitch * D2R), sp = Math.sin(P.pitch * D2R);
      a = Y * cp - Z * sp; b = Y * sp + Z * cp;
      Y = a; Z = b;
      const cr = Math.cos(P.roll * D2R), sr = Math.sin(P.roll * D2R);
      a = X * cr - Z * sr; b = X * sr + Z * cr;
      X = a; Z = b;
      // sphere → plane
      const den = 1 - Z;
      if (Math.abs(den) < 1e-9) { out[0] = 1e6; out[1] = 1e6; return; }
      out[0] = (X / den) * k;
      out[1] = (Y / den) * k;
    },
  },

  polar: {
    label: 'tiny planet (exp)',
    kind: 'conformal',
    note: 'The polar-coordinates trick, done properly. Roll the picture up with z ↦ exp(z): the bottom edge shrinks to a point, the top edge becomes the horizon, and the whole frame closes into a ring. Because exp is holomorphic this is exactly conformal — the tiny planet everyone makes with a non-conformal filter, made without the smearing. Run it the other way to unroll a circular picture into a strip.',
    params: {
      mode: { type: 'enum', options: ['roll up', 'unroll'], def: 'roll up', label: 'direction' },
      spread: { min: 0.1, max: 1.5, step: 0.01, def: 0.44, label: 'spread' },
      twist: { min: -80, max: 80, step: 1, def: 0, label: 'twist' },
      rotate: { min: -180, max: 180, step: 1, def: 0, label: 'rotate' },
      zoom: { min: 0.1, max: 4, step: 0.01, def: 1, label: 'zoom' },
    },
    pull(x, y, P, out) {
      const s = P.spread;
      const rot = P.rotate * D2R;
      const tw = P.twist * D2R;
      const cr = Math.cos(rot), sr = Math.sin(rot);
      const ct = Math.cos(tw), st = Math.sin(tw);
      if (P.mode === 'unroll') {
        // the inverse: a strip becomes a ring's worth of source
        const lr = (y - 1) / s, th = -x / s;
        const ax = cmulRe(lr, th, ct, -st), ay = cmulIm(lr, th, ct, -st);
        cexp(ax, ay, t);
        const zx = t[0] * P.zoom, zy = t[1] * P.zoom;
        out[0] = zx * cr + zy * sr;
        out[1] = -zx * sr + zy * cr;
        return;
      }
      const px = (x * cr - y * sr) / P.zoom, py = (x * sr + y * cr) / P.zoom;
      clog(px, py, t);                       // t = (log r, θ)
      const lx = cmulRe(t[0], t[1], ct, st);  // twist: a rotation in log space
      const ly = cmulIm(t[0], t[1], ct, st);
      // θ runs across the picture and log r up it. The minus sign keeps the
      // handedness: swapping the two axes without it would be a reflection,
      // which the selftest catches as an orientation flip.
      out[0] = -ly * s;
      out[1] = lx * s + 1;
    },
  },

  bulge: {
    label: 'möbius bulge',
    kind: 'conformal',
    note: 'A hyperbolic translation of the disc — the conformal way to magnify. Like a glass ball laid on a photograph, it enlarges the middle and *moves* what it enlarges: a conformal map cannot swell one region without displacing the rest. That displacement is the honest cost of keeping angles.',
    params: {
      cx: { min: -2, max: 2, step: 0.01, def: 0, label: 'centre x' },
      cy: { min: -2, max: 2, step: 0.01, def: 0, label: 'centre y' },
      strength: { min: -0.95, max: 0.95, step: 0.01, def: 0.5, label: 'strength' },
      radius: { min: 0.2, max: 4, step: 0.01, def: 1, label: 'radius' },
    },
    pull(x, y, P, out) {
      const R = P.radius;
      const ux = (x - P.cx) / R, uy = (y - P.cy) / R;
      const a = P.strength;
      // (u + a) / (1 + a·u), the disc automorphism with a real
      cdiv(ux + a, uy, 1 + a * ux, a * uy, t);
      out[0] = t[0] * R + P.cx;
      out[1] = t[1] * R + P.cy;
    },
  },

  power: {
    label: 'power wedge',
    kind: 'conformal',
    note: 'z ↦ zᵖ multiplies angles about the origin: p = 2 wraps the picture twice around, p = ½ opens a half-plane into the whole plane. Conformal everywhere except the origin itself, where the derivative vanishes and all the angles pile up.',
    params: {
      p: { min: 0.2, max: 5, step: 0.01, def: 2, label: 'exponent' },
      rotate: { min: -180, max: 180, step: 1, def: 0, label: 'rotate' },
      cx: { min: -2, max: 2, step: 0.01, def: 0, label: 'centre x' },
      cy: { min: -2, max: 2, step: 0.01, def: 0, label: 'centre y' },
    },
    pull(x, y, P, out) {
      const dx = x - P.cx, dy = y - P.cy;
      const r = Math.hypot(dx, dy);
      const th = Math.atan2(dy, dx) + P.rotate * D2R;
      const rp = Math.pow(r || 1e-12, 1 / P.p);
      out[0] = rp * Math.cos(th / P.p) + P.cx;
      out[1] = rp * Math.sin(th / P.p) + P.cy;
    },
  },

  droste: {
    label: 'droste',
    kind: 'conformal',
    note: 'Escher’s Print Gallery. Take the logarithm, shear the resulting strip so that one turn around the picture is also one step in scale, exponentiate back, then fold every radius into the ring between the two radii. The picture then contains itself, forever, and every copy is the right shape.',
    params: {
      inner: { min: 0.02, max: 0.9, step: 0.01, def: 0.25, label: 'inner radius' },
      outer: { min: 0.1, max: 3, step: 0.01, def: 1, label: 'outer radius' },
      turns: { min: -4, max: 4, step: 1, def: 1, label: 'turns' },
      zoom: { min: 0.1, max: 6, step: 0.01, def: 1, label: 'zoom' },
      rotate: { min: -180, max: 180, step: 1, def: 0, label: 'rotate' },
    },
    pull(x, y, P, out) {
      const r1 = Math.min(P.inner, P.outer * 0.98), r2 = Math.max(P.outer, r1 * 1.02);
      const s = Math.log(r2 / r1);
      const turns = P.turns || 1;
      const alpha = Math.atan2(s, TAU * turns);
      const f = Math.cos(alpha);
      const rot = P.rotate * D2R;

      let px = x / P.zoom, py = y / P.zoom;
      const cr = Math.cos(rot), sr = Math.sin(rot);
      const rx = px * cr - py * sr, ry = px * sr + py * cr;

      clog(rx, ry, t);                                  // into the strip
      const ca = Math.cos(-alpha) * f, sa = Math.sin(-alpha) * f;
      const lx = cmulRe(t[0], t[1], ca, sa);            // shear the strip
      const ly = cmulIm(t[0], t[1], ca, sa);
      cexp(lx, ly, t2);                                 // back out

      let zx = t2[0], zy = t2[1];
      // fold the radius into [r1, r2): the self-similar step
      let rad = Math.hypot(zx, zy) || 1e-12;
      const k = r2 / r1;
      const n = Math.floor(Math.log(rad / r1) / Math.log(k));
      const scale = Math.pow(k, -n);
      out[0] = zx * scale;
      out[1] = zy * scale;
    },
  },

  spiral: {
    label: 'spiral twist',
    kind: 'conformal',
    note: 'z ↦ z^(1+ik): a complex exponent. The real part scales, the imaginary part twists, and together they turn straight rays into logarithmic spirals — the conformal cousin of the swirl tool, which shears and this does not.',
    params: {
      twist: { min: -2, max: 2, step: 0.01, def: 0.5, label: 'twist' },
      zoom: { min: 0.1, max: 6, step: 0.01, def: 1, label: 'zoom' },
      cx: { min: -2, max: 2, step: 0.01, def: 0, label: 'centre x' },
      cy: { min: -2, max: 2, step: 0.01, def: 0, label: 'centre y' },
    },
    pull(x, y, P, out) {
      const dx = (x - P.cx) / P.zoom, dy = (y - P.cy) / P.zoom;
      clog(dx, dy, t);
      // divide by (1 + ik): the inverse of raising to that power
      cdiv(t[0], t[1], 1, P.twist, t2);
      cexp(t2[0], t2[1], t);
      out[0] = t[0] + P.cx;
      out[1] = t[1] + P.cy;
    },
  },

  invert: {
    label: 'inversion',
    kind: 'conformal',
    note: 'z ↦ R²/z turns the plane inside out through a circle: what was near the centre goes to the edge and back. Circles and lines all map to circles and lines — the oldest conformal map there is, and still the strangest to look at.',
    params: {
      radius: { min: 0.05, max: 3, step: 0.01, def: 0.6, label: 'circle radius' },
      cx: { min: -2, max: 2, step: 0.01, def: 0, label: 'centre x' },
      cy: { min: -2, max: 2, step: 0.01, def: 0, label: 'centre y' },
    },
    pull(x, y, P, out) {
      const dx = x - P.cx, dy = y - P.cy;
      const d = dx * dx + dy * dy || 1e-12;
      const R2 = P.radius * P.radius;
      out[0] = (R2 * dx) / d + P.cx;
      out[1] = (-R2 * dy) / d + P.cy;
    },
  },

  joukowsky: {
    label: 'joukowsky',
    kind: 'conformal',
    note: 'z + c²/z, the map that turns circles into aerofoils and taught aerodynamics how to compute lift. On a photograph it opens two lobes with a seam between them, and every detail keeps its shape on the way.',
    params: {
      c: { min: 0.05, max: 2, step: 0.01, def: 0.5, label: 'c' },
      zoom: { min: 0.1, max: 4, step: 0.01, def: 1, label: 'zoom' },
      rotate: { min: -180, max: 180, step: 1, def: 0, label: 'rotate' },
    },
    pull(x, y, P, out) {
      const rot = P.rotate * D2R, cr = Math.cos(rot), sr = Math.sin(rot);
      const px = (x * cr - y * sr) / P.zoom, py = (x * sr + y * cr) / P.zoom;
      const d = px * px + py * py || 1e-12;
      const c2 = P.c * P.c;
      out[0] = px + (c2 * px) / d;
      out[1] = py - (c2 * py) / d;
    },
  },

  wave: {
    label: 'holomorphic wave',
    kind: 'conformal',
    note: 'z + A·sin(kz): a funhouse ripple that is still an analytic function, so every wobble is a pure local rotate-and-scale — no smearing anywhere. Push the amplitude far enough and the derivative reaches zero: the map folds, the picture doubles back on itself, and the dilatation view lights up at the folds.',
    params: {
      amplitude: { min: 0, max: 1.5, step: 0.01, def: 0.18, label: 'amplitude' },
      frequency: { min: 0.2, max: 12, step: 0.1, def: 3, label: 'frequency' },
      angle: { min: 0, max: 360, step: 1, def: 0, label: 'angle' },
      phase: { min: 0, max: 360, step: 1, def: 0, label: 'phase' },
    },
    pull(x, y, P, out) {
      const a = P.angle * D2R, ca = Math.cos(a), sa = Math.sin(a);
      const ux = x * ca + y * sa, uy = -x * sa + y * ca;      // rotate into wave frame
      const k = P.frequency, ph = P.phase * D2R;
      // sin(k·u + φ) for complex u
      const sx = Math.sin(k * ux + ph) * Math.cosh(k * uy);
      const sy = Math.cos(k * ux + ph) * Math.sinh(clampAbs(k * uy, 12));
      const wx = P.amplitude * sx, wy = P.amplitude * sy;
      out[0] = x + (wx * ca - wy * sa);
      out[1] = y + (wx * sa + wy * ca);
    },
  },

  kaleido: {
    label: 'kaleidoscope',
    kind: 'anticonformal',
    note: 'Fold the plane into a wedge and mirror it round. Reflections preserve every angle but reverse handedness — anticonformal, dilatation still 1, orientation flipped. The dilatation view stays cold; the orientation view goes to stripes.',
    params: {
      sectors: { min: 2, max: 24, step: 1, def: 6, label: 'sectors' },
      rotate: { min: -180, max: 180, step: 1, def: 0, label: 'rotate' },
      cx: { min: -2, max: 2, step: 0.01, def: 0, label: 'centre x' },
      cy: { min: -2, max: 2, step: 0.01, def: 0, label: 'centre y' },
    },
    pull(x, y, P, out) {
      const dx = x - P.cx, dy = y - P.cy;
      const r = Math.hypot(dx, dy);
      const wedge = TAU / P.sectors;
      let th = Math.atan2(dy, dx) - P.rotate * D2R;
      th = ((th % wedge) + wedge) % wedge;
      if (th > wedge / 2) th = wedge - th;                    // the mirror fold
      th += P.rotate * D2R;
      out[0] = r * Math.cos(th) + P.cx;
      out[1] = r * Math.sin(th) + P.cy;
    },
  },

  fisheye: {
    label: 'lens projection',
    kind: 'lens',
    note: 'Re-project the photograph as if it had been shot through a different lens. Every one of these except a plain zoom must shear — a radial map stretches by g′(r) along the radius and g(r)/r around it, and those agree only for g(r) = cr. Switch projections with the dilatation view on and watch which one costs least.',
    params: {
      projection: {
        type: 'enum',
        options: ['stereographic', 'equidistant', 'equisolid', 'orthographic', 'rectilinear'],
        def: 'stereographic', label: 'projection',
      },
      fov: { min: 20, max: 320, step: 1, def: 130, label: 'field of view' },
      zoom: { min: 0.2, max: 3, step: 0.01, def: 1, label: 'zoom' },
      cx: { min: -2, max: 2, step: 0.01, def: 0, label: 'centre x' },
      cy: { min: -2, max: 2, step: 0.01, def: 0, label: 'centre y' },
    },
    pull(x, y, P, out) {
      const dx = (x - P.cx) / P.zoom, dy = (y - P.cy) / P.zoom;
      const rho = Math.hypot(dx, dy);
      const half = Math.min(P.fov * D2R, TAU - 0.02) / 2;    // half angle at the rim
      // rim radius 1 in output units ⇒ focal length for this projection
      const f = focalFor(P.projection, half);
      const theta = angleFor(P.projection, rho / f);
      // the source is a flat (rectilinear) photograph: r = tan θ
      const src = Math.tan(Math.min(theta, 1.5533)) * SRC_F;
      const s = rho > 1e-9 ? src / rho : 0;
      out[0] = dx * s + P.cx;
      out[1] = dy * s + P.cy;
    },
  },

  mirror: {
    label: 'funhouse mirror',
    kind: 'lens',
    note: 'The carnival mirror: a wavy sheet of silvered glass. Rows slide sideways by the height of the ripple, which is pure shear — the dilatation view fills in, and that is exactly why your reflection looks stretched rather than merely bent.',
    params: {
      amplitude: { min: 0, max: 1.2, step: 0.01, def: 0.25, label: 'amplitude' },
      frequency: { min: 0.2, max: 10, step: 0.1, def: 2.5, label: 'frequency' },
      angle: { min: 0, max: 360, step: 1, def: 0, label: 'angle' },
      phase: { min: 0, max: 360, step: 1, def: 0, label: 'phase' },
      taper: { min: 0, max: 1, step: 0.01, def: 0, label: 'taper' },
    },
    pull(x, y, P, out) {
      const a = P.angle * D2R, ca = Math.cos(a), sa = Math.sin(a);
      const ux = x * ca + y * sa, uy = -x * sa + y * ca;
      const damp = 1 - P.taper * Math.min(1, Math.hypot(x, y));
      const d = P.amplitude * damp * Math.sin(P.frequency * uy + P.phase * D2R);
      const nx = ux + d, ny = uy;
      out[0] = nx * ca - ny * sa;
      out[1] = nx * sa + ny * ca;
    },
  },

  pinch: {
    label: 'pinch & bulge',
    kind: 'lens',
    note: 'The radial magnifier everyone reaches for first: r ↦ r^p about a point. It swells the middle without moving it — and pays for that with shear everywhere, because no radial map but a plain zoom can keep angles. Compare it with the Möbius bulge under the dilatation view.',
    params: {
      strength: { min: -0.9, max: 0.9, step: 0.01, def: 0.5, label: 'strength' },
      radius: { min: 0.1, max: 3, step: 0.01, def: 1, label: 'radius' },
      cx: { min: -2, max: 2, step: 0.01, def: 0, label: 'centre x' },
      cy: { min: -2, max: 2, step: 0.01, def: 0, label: 'centre y' },
    },
    pull(x, y, P, out) {
      const dx = x - P.cx, dy = y - P.cy;
      const r = Math.hypot(dx, dy);
      const R = P.radius;
      if (r >= R || r < 1e-9) { out[0] = x; out[1] = y; return; }
      const u = r / R;
      const p = 1 + P.strength * (1 - u);          // fades to identity at the rim
      const nr = Math.pow(u, p) * R;
      const s = nr / r;
      out[0] = dx * s + P.cx;
      out[1] = dy * s + P.cy;
    },
  },

  twirl: {
    label: 'twirl',
    kind: 'lens',
    note: 'The swirl from every image editor: rotate by an amount that falls off with radius. It looks like the spiral twist and is not — the falloff shears every neighbourhood it touches, which the dilatation view will say plainly.',
    params: {
      angle: { min: -720, max: 720, step: 1, def: 180, label: 'angle' },
      radius: { min: 0.1, max: 3, step: 0.01, def: 1, label: 'radius' },
      cx: { min: -2, max: 2, step: 0.01, def: 0, label: 'centre x' },
      cy: { min: -2, max: 2, step: 0.01, def: 0, label: 'centre y' },
    },
    pull(x, y, P, out) {
      const dx = x - P.cx, dy = y - P.cy;
      const r = Math.hypot(dx, dy);
      if (r >= P.radius) { out[0] = x; out[1] = y; return; }
      const fall = 1 - r / P.radius;
      const th = Math.atan2(dy, dx) + P.angle * D2R * fall * fall;
      out[0] = r * Math.cos(th) + P.cx;
      out[1] = r * Math.sin(th) + P.cy;
    },
  },

  squeeze: {
    label: 'squeeze',
    kind: 'lens',
    note: 'Scale the axes by different amounts. The simplest non-conformal map there is, and a useful control: its dilatation is exactly the ratio of the two scales, everywhere, which is what the measurement should report if it is working.',
    params: {
      sx: { min: 0.2, max: 3, step: 0.01, def: 1.6, label: 'x scale' },
      sy: { min: 0.2, max: 3, step: 0.01, def: 1, label: 'y scale' },
      rotate: { min: 0, max: 180, step: 1, def: 0, label: 'angle' },
    },
    pull(x, y, P, out) {
      const a = P.rotate * D2R, ca = Math.cos(a), sa = Math.sin(a);
      const ux = (x * ca + y * sa) / P.sx, uy = (-x * sa + y * ca) / P.sy;
      out[0] = ux * ca - uy * sa;
      out[1] = ux * sa + uy * ca;
    },
  },
};

// The source photograph is treated as a rectilinear (pinhole) image with this
// focal length in plane units — a ~53° half-angle across the short side, a
// normal lens. Only the fisheye map needs it.
const SRC_F = 0.75;

function focalFor(proj, half) {
  switch (proj) {
    case 'equidistant': return 1 / half;
    case 'equisolid': return 1 / (2 * Math.sin(half / 2));
    case 'orthographic': return 1 / Math.sin(Math.min(half, Math.PI / 2 - 1e-3));
    case 'rectilinear': return 1 / Math.tan(Math.min(half, 1.5533));
    default: return 1 / (2 * Math.tan(half / 2));            // stereographic
  }
}

function angleFor(proj, u) {
  switch (proj) {
    case 'equidistant': return u;
    case 'equisolid': return 2 * Math.asin(Math.min(1, u / 2));
    case 'orthographic': return Math.asin(Math.min(1, u));
    case 'rectilinear': return Math.atan(u);
    default: return 2 * Math.atan(u / 2);                    // stereographic
  }
}

export const defaults = (id) => {
  const P = {};
  for (const [k, d] of Object.entries(MAPS[id].params)) P[k] = d.def;
  return P;
};

export const makeLayer = (id) => ({ map: id, on: true, params: defaults(id) });

// ───────────────────────────────────────────────────────────── the field ──

/**
 * Evaluate the whole stack for every output pixel, producing the source
 * coordinate each one reads from — in plane units, where the short side of the
 * image spans [-1, 1].
 *
 * The stack is applied to the *picture* top to bottom, so the pullback runs
 * bottom to top: z = m₁⁻¹(m₂⁻¹(…mₙ⁻¹(w))).
 */
export function composePull(recipe) {
  const ops = (recipe.ops || []).filter((l) => l.on !== false && MAPS[l.map]);
  const params = ops.map((l) => ({ ...defaults(l.map), ...l.params }));
  const view = { zoom: 1, rotate: 0, panx: 0, pany: 0, ...(recipe.view || {}) };
  const vr = view.rotate * D2R, vc = Math.cos(vr), vs = Math.sin(vr);
  const scratch = [0, 0];

  return function pull(x0, y0, out) {
    // the view frame first: it is the last thing that happens to the picture
    let x = x0 / view.zoom - view.panx;
    let y = y0 / view.zoom - view.pany;
    const rx = x * vc - y * vs, ry = x * vs + y * vc;
    x = rx; y = ry;
    for (let k = ops.length - 1; k >= 0; k--) {
      MAPS[ops[k].map].pull(x, y, params[k], scratch);
      x = scratch[0]; y = scratch[1];
    }
    out[0] = x; out[1] = y;
    return out;
  };
}

export function buildField(W, H, recipe) {
  const unit = Math.min(W, H) / 2;
  const field = new Float32Array(W * H * 2);
  const pull = composePull(recipe);
  const out = [0, 0];

  for (let py = 0, i = 0; py < H; py++) {
    const wy = (H / 2 - py) / unit;
    for (let px = 0; px < W; px++, i += 2) {
      pull((px - W / 2) / unit, wy, out);
      field[i] = out[0];
      field[i + 1] = out[1];
    }
  }
  return { field, unit, pull };
}

/**
 * The measurement. Differences between neighbouring output pixels give the
 * Jacobian of the whole composition for free — no extra map evaluations — and
 * from its singular values come the two numbers this tool is about:
 *
 *   K     = σ₁/σ₂, the quasiconformal dilatation. 1 ⟺ conformal.
 *   scale = √(σ₁σ₂), the local area change, which is also the right filter
 *           width. For a conformal map σ₁ = σ₂, so the footprint is a circle
 *           and plain mip-mapping is exactly correct — no anisotropic
 *           filtering needed. Conformality pays for itself twice.
 *
 * One honest limit: this is a difference over neighbouring *pixels*, so it only
 * describes the map at the resolution you are rendering. Where the map moves
 * further than MEASURABLE source pixels between one output pixel and the next —
 * at a little planet's horizon, at a branch seam, at the pole of an inversion —
 * the estimate stops meaning anything, and those pixels are excluded from the
 * statistics and counted separately rather than quietly averaged in.
 */
const MEASURABLE = 64;

/**
 * The local scale, for choosing a mip level. Differences between neighbouring
 * output pixels are exactly the right thing here — the filter footprint IS the
 * pixel-to-pixel step — and they cost nothing, since the field is already built.
 */
export function scaleOf(field, W, H, unit) {
  const scale = new Float32Array(W * H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      const xm = x > 0 ? i - 1 : i, xp = x < W - 1 ? i + 1 : i;
      const ym = y > 0 ? i - W : i, yp = y < H - 1 ? i + W : i;
      const hx = (xp - xm) || 1, hy = ((yp - ym) / W) || 1;
      const ux = ((field[xp * 2] - field[xm * 2]) / hx) * unit;
      const vx = ((field[xp * 2 + 1] - field[xm * 2 + 1]) / hx) * unit;
      const uy = ((field[yp * 2] - field[ym * 2]) / hy) * unit;
      const vy = ((field[yp * 2 + 1] - field[ym * 2 + 1]) / hy) * unit;
      scale[i] = Math.sqrt(Math.abs(ux * vy - uy * vx)) || 1e-6;
    }
  }
  return scale;
}

/**
 * The measurement proper. Deliberately NOT taken from the rendered field:
 * differencing over whole pixels folds the map's curvature into the answer and
 * reports shear that isn't there. Instead the composed map is evaluated at
 * ±h around each sample point with h a fraction of a pixel, on a coarse grid —
 * four extra evaluations per `step`² pixels, which costs less than the field
 * itself and gives a number that means what it says.
 *
 * Returns the dilatation K = σ₁/σ₂ (1 ⟺ conformal), the sign of the Jacobian
 * (orientation), and statistics over the pixels where the estimate is
 * trustworthy — a map that moves more than MEASURABLE source pixels per output
 * pixel, or jumps across a branch seam, is beyond measurement at this
 * resolution and is counted separately rather than quietly averaged in.
 */
export function measure(recipe, W, H, unit, { step = 3, h = 0.25 } = {}) {
  const pull = composePull(recipe);
  const cw = Math.max(1, Math.ceil(W / step)), ch = Math.max(1, Math.ceil(H / step));
  const K = new Float32Array(cw * ch);
  const S = new Float32Array(cw * ch);
  const flip = new Uint8Array(cw * ch);
  const reliable = new Uint8Array(cw * ch);
  const a = [0, 0], b = [0, 0], c = [0, 0], d = [0, 0];
  const hp = h / unit;                                   // h pixels, in plane units

  let worst = 1, sum = 0, conformalPixels = 0, counted = 0, flipped = 0;
  let minS = Infinity, maxS = 0;

  for (let cy = 0; cy < ch; cy++) {
    const py = Math.min(H - 1, cy * step + (step >> 1));
    const wy = (H / 2 - py) / unit;
    for (let cx = 0; cx < cw; cx++) {
      const px = Math.min(W - 1, cx * step + (step >> 1));
      const wx = (px - W / 2) / unit;
      pull(wx + hp, wy, a); pull(wx - hp, wy, b);
      pull(wx, wy + hp, c); pull(wx, wy - hp, d);

      // ∂z/∂(output pixel), in source pixels
      const ux = ((a[0] - b[0]) / (2 * h)) * unit, vx = ((a[1] - b[1]) / (2 * h)) * unit;
      const uy = ((c[0] - d[0]) / (2 * h)) * unit, vy = ((c[1] - d[1]) / (2 * h)) * unit;

      const det = ux * vy - uy * vx;
      const fro = ux * ux + uy * uy + vx * vx + vy * vy;
      const disc = Math.max(0, fro * fro - 4 * det * det);
      const s1 = Math.sqrt(Math.max(0, (fro + Math.sqrt(disc)) / 2));
      const s2 = Math.sqrt(Math.max(0, (fro - Math.sqrt(disc)) / 2));
      const k = s2 > 1e-9 ? s1 / s2 : Infinity;
      const sc = Math.sqrt(Math.abs(det)) || 1e-6;

      const i = cy * cw + cx;
      K[i] = k;
      S[i] = sc;
      flip[i] = det < 0 ? 1 : 0;
      const usable = Number.isFinite(k) && sc < MEASURABLE && sc > 1 / MEASURABLE;
      reliable[i] = usable ? 1 : 0;
      if (usable) {
        counted++;
        sum += k;
        if (k > worst) worst = k;
        if (k < 1.01) conformalPixels++;
        if (flip[i]) flipped++;
        if (sc < minS) minS = sc;
        if (sc > maxS) maxS = sc;
      }
    }
  }

  // A single seam pixel would own "worst", so report a percentile too: the
  // number that describes the picture rather than its one worst corner.
  const usableK = [], usableS = [];
  for (let i = 0; i < K.length; i++) if (reliable[i]) { usableK.push(K[i]); usableS.push(S[i]); }
  usableK.sort((a2, b2) => a2 - b2);
  usableS.sort((a2, b2) => a2 - b2);
  const at = (arr, p, dflt) => (arr.length ? arr[Math.min(arr.length - 1, Math.floor(arr.length * p))] : dflt);
  const pct = (p) => at(usableK, p, 1);

  return {
    K, flip, reliable, cw, ch, step,
    stats: {
      worstK: worst,
      medianK: pct(0.5),
      K99: pct(0.99),
      meanK: counted ? sum / counted : 1,
      conformalFraction: counted ? conformalPixels / counted : 1,
      unmeasurable: 1 - counted / (cw * ch),
      flipped: counted ? flipped / counted : 0,
      minScale: Number.isFinite(minS) ? minS : 0,
      maxScale: maxS,
      // the typical magnification, not the one worst pixel of a horizon
      scale5: at(usableS, 0.05, 1),
      scale95: at(usableS, 0.95, 1),
    },
  };
}

// ─────────────────────────────────────────────────────────── the sampler ──

/** Successive halvings of the source, for filtering the shrunken regions. */
export function buildMips(rgba, W, H) {
  const mips = [{ data: rgba, W, H }];
  let cur = { data: rgba, W, H };
  while (cur.W > 2 && cur.H > 2 && mips.length < 12) {
    const nw = Math.max(1, cur.W >> 1), nh = Math.max(1, cur.H >> 1);
    const data = new Uint8ClampedArray(nw * nh * 4);
    for (let y = 0; y < nh; y++) {
      for (let x = 0; x < nw; x++) {
        const q = (y * nw + x) * 4;
        for (let c = 0; c < 4; c++) {
          const a = cur.data[((y * 2) * cur.W + x * 2) * 4 + c];
          const b = cur.data[((y * 2) * cur.W + Math.min(cur.W - 1, x * 2 + 1)) * 4 + c];
          const d = cur.data[(Math.min(cur.H - 1, y * 2 + 1) * cur.W + x * 2) * 4 + c];
          const e = cur.data[(Math.min(cur.H - 1, y * 2 + 1) * cur.W + Math.min(cur.W - 1, x * 2 + 1)) * 4 + c];
          data[q + c] = (a + b + d + e) / 4;
        }
      }
    }
    cur = { data, W: nw, H: nh };
    mips.push(cur);
  }
  return mips;
}

const EDGE = { clamp: 0, mirror: 1, tile: 2, void: 3 };

function wrapCoord(v, n, mode) {
  if (mode === 2) return ((v % n) + n) % n;
  if (mode === 1) {
    const p = 2 * n;
    let m = ((v % p) + p) % p;
    return m < n ? m : p - 1 - m;
  }
  return v < 0 ? 0 : v > n - 1 ? n - 1 : v;
}

/** Bilinear read from one mip level. Returns false if `void` mode fell off. */
function bilinear(mip, x, y, mode, out) {
  const { data, W, H } = mip;
  if (mode === 3 && (x < -0.5 || y < -0.5 || x > W - 0.5 || y > H - 0.5)) return false;
  const x0 = Math.floor(x), y0 = Math.floor(y);
  const fx = x - x0, fy = y - y0;
  const xa = wrapCoord(x0, W, mode), xb = wrapCoord(x0 + 1, W, mode);
  const ya = wrapCoord(y0, H, mode), yb = wrapCoord(y0 + 1, H, mode);
  const i00 = (ya * W + xa) * 4, i10 = (ya * W + xb) * 4;
  const i01 = (yb * W + xa) * 4, i11 = (yb * W + xb) * 4;
  const w00 = (1 - fx) * (1 - fy), w10 = fx * (1 - fy);
  const w01 = (1 - fx) * fy, w11 = fx * fy;
  for (let c = 0; c < 4; c++) {
    out[c] = data[i00 + c] * w00 + data[i10 + c] * w10 + data[i01 + c] * w01 + data[i11 + c] * w11;
  }
  return true;
}

/**
 * Resample the photograph through the field. Trilinear across the mip pyramid,
 * with the level chosen from the local scale — the reason a Droste ring or a
 * little-planet horizon comes out smooth here instead of boiling into aliasing.
 */
export function sample(mips, field, scaleField, W, H, opts = {}) {
  const mode = EDGE[opts.edge] ?? 0;
  const bias = opts.bias ?? 0;
  const srcW = mips[0].W, srcH = mips[0].H;
  const unit = Math.min(srcW, srcH) / 2;
  const outp = new Uint8ClampedArray(W * H * 4);
  const a = [0, 0, 0, 0], b = [0, 0, 0, 0];

  for (let i = 0, q = 0; i < W * H; i++, q += 4) {
    // plane units → source pixels
    const sx = field[i * 2] * unit + srcW / 2;
    const sy = srcH / 2 - field[i * 2 + 1] * unit;

    const lod = Math.max(0, Math.log2(Math.max(1e-6, scaleField[i])) + bias);
    const l0 = Math.min(mips.length - 1, Math.floor(lod));
    const l1 = Math.min(mips.length - 1, l0 + 1);
    const f = lod - l0;

    const m0 = mips[l0], m1 = mips[l1];
    const k0 = 1 / (1 << l0), k1 = 1 / (1 << l1);
    const hit = bilinear(m0, sx * k0 - 0.5 + 0.5 * k0, sy * k0 - 0.5 + 0.5 * k0, mode, a);
    if (!hit) { outp[q + 3] = 0; continue; }
    if (f > 0.001 && l1 !== l0) {
      bilinear(m1, sx * k1 - 0.5 + 0.5 * k1, sy * k1 - 0.5 + 0.5 * k1, mode, b);
      for (let c = 0; c < 4; c++) outp[q + c] = a[c] + (b[c] - a[c]) * f;
    } else {
      for (let c = 0; c < 4; c++) outp[q + c] = a[c];
    }
  }
  return outp;
}

/** The whole pipeline: photograph + recipe → warped pixels and the numbers. */
export function render(rgba, srcW, srcH, W, H, recipe, opts = {}) {
  const { field, unit } = buildField(W, H, recipe);
  const scale = scaleOf(field, W, H, unit);
  const measured = opts.measure === false
    ? { stats: {} }
    : measure(recipe, W, H, unit, { step: opts.step ?? 3 });
  const mips = opts.mips || buildMips(rgba, srcW, srcH);
  const out = sample(mips, field, scale, W, H, {
    edge: recipe.edge || 'clamp',
    bias: recipe.bias ?? 0,
  });
  return { rgba: out, width: W, height: H, field, scale, unit, ...measured };
}

// ────────────────────────────────────────────────────────────── recipes ──

export const RECIPE_VERSION = 1;

export function normalise(recipe) {
  return {
    v: RECIPE_VERSION,
    edge: ['clamp', 'mirror', 'tile', 'void'].includes(recipe.edge) ? recipe.edge : 'clamp',
    bias: Number.isFinite(recipe.bias) ? recipe.bias : 0,
    view: {
      zoom: recipe.view?.zoom ?? 1,
      rotate: recipe.view?.rotate ?? 0,
      panx: recipe.view?.panx ?? 0,
      pany: recipe.view?.pany ?? 0,
    },
    ops: (recipe.ops || []).filter((l) => MAPS[l.map]).map((l) => ({
      map: l.map,
      on: l.on !== false,
      params: { ...defaults(l.map), ...(l.params || {}) },
    })),
  };
}

const btoaImpl = (s) => (typeof btoa === 'function' ? btoa(s) : Buffer.from(s, 'binary').toString('base64'));
const atobImpl = (s) => (typeof atob === 'function' ? atob(s) : Buffer.from(s, 'base64').toString('binary'));

export function encodeRecipe(recipe) {
  const json = JSON.stringify(normalise(recipe));
  return btoaImpl(unescape(encodeURIComponent(json)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function decodeRecipe(str) {
  const json = decodeURIComponent(escape(atobImpl(str.replace(/-/g, '+').replace(/_/g, '/'))));
  return normalise(JSON.parse(json));
}

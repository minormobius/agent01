// tjs/brut/terrain.js — THE GROUND.
//
// Everything in /brut so far stands on y = 0 on an infinite plane. That is the
// assumption a city cannot keep, and it is the bottom of the stack: a plot is a
// parcel of ground, a street is a line on ground that has to drain, and the
// path-dependence of development is mostly an argument about where the water
// goes. So the ground comes first and everything else is a consequence.
//
// TWO CLAIMS HOLD THIS FILE UP.
//
// 1. THE TALUS ANGLE IS THE FRICTION ANGLE. Thermal erosion works by refusing
//    to let any slope stand steeper than a material's angle of repose, and for
//    a loose granular soil the angle of repose IS φ, the internal friction
//    angle — the same φ that the slope-stability check divides by. So one
//    constant does the geomorphology and the geotechnics, and the shape of the
//    hill is a consequence of the same number that says whether it stands up.
//    This is the pipe model's trick, in soil: the growth rule and the
//    structural rule are the same rule, which is the only honest way a
//    generated thing can go into an engineering model.
//
// 2. A NATURAL SLOPE DOES NOT FAIL. WHAT FAILS IS A CUT. After erosion no
//    slope on the site exceeds repose, so the infinite-slope factor of safety
//    is ≥ 1 everywhere by construction. The geotechnical problem appears the
//    moment somebody levels a plot: excavation makes a face steeper than the
//    ground would ever have stood at, and THAT is what needs retaining. The
//    earthworks create the hazard; the terrain does not have one. A generator
//    that let terrain "fail" on its own would be inventing a hazard to solve.
//
// Metres throughout, x/z horizontal, y up — the same frame as arch.js. Angles
// in radians internally, degrees only at the edges where a person reads them.

import { Rand } from './rand.js';

export const VERSION = 'terrain/1';

const r2 = (v) => Math.round(v * 100) / 100;
const r3 = (v) => Math.round(v * 1000) / 1000;
const DEG = Math.PI / 180;

/* ══════════════════════════════ the material ════════════════════════════════
   Keyed by the SAME letters as struct.js's SOILS, because it is the same ground
   seen by a different discipline. `SOILS` carries what the seismic and bearing
   analysis asks for (site class, allowable pressure, stiffness, base friction);
   this carries what the SHAPE of the ground asks for (friction angle, unit
   weight). They are not independent inventions and the selftest proves it:
   struct's base-friction coefficient μ must come out as tan(⅔φ), which is the
   standard soil-on-concrete interface relation. If somebody edits one table the
   other one fails, which is the only way two tables about one substance stay
   honest. */

export const GROUND = {
  B: { label: 'rock',            phi: 45, gamma: 24e3, cohesion: 50e3, erodes: 0.15 },
  C: { label: 'very dense soil', phi: 40, gamma: 21e3, cohesion: 5e3,  erodes: 0.45 },
  D: { label: 'stiff soil',      phi: 33, gamma: 20e3, cohesion: 12e3, erodes: 0.70 },
  E: { label: 'soft clay',       phi: 25, gamma: 18e3, cohesion: 20e3, erodes: 1.00 },
};
export const GROUND_IDS = Object.keys(GROUND);

// Saturated substrate is heavier and a wet slope is a different slope. Kept
// separate rather than folded in, because the design case is a choice.
export const WATER = 9.81e3;

/* ═══════════════════════════════ the noise ══════════════════════════════════
   Value-noise fBm. Terrain is statistically self-similar over a wide band of
   scales — that is Mandelbrot's observation and it is why fractional Brownian
   motion is the standard model rather than a convenient hack — and the HURST
   EXPONENT is the one parameter that says how rough. H = 1 is smooth and
   rolling, H = 0.5 is the classic Brownian surface, H → 0 is broken ground. It
   is seeded per site, so "how rugged is this place" is a property of the place
   and not a global constant. */

const smooth = (t) => t * t * (3 - 2 * t);

function lattice(rnd, n) {
  const a = new Float64Array((n + 1) * (n + 1));
  for (let i = 0; i < a.length; i++) a[i] = rnd.f() * 2 - 1;
  return a;
}

function sampleLattice(a, n, u, v) {
  const x = Math.min(1, Math.max(0, u)) * n;
  const z = Math.min(1, Math.max(0, v)) * n;
  const i = Math.min(n - 1, Math.floor(x)), k = Math.min(n - 1, Math.floor(z));
  const fx = smooth(x - i), fz = smooth(z - k);
  const g = (ii, kk) => a[kk * (n + 1) + ii];
  const a0 = g(i, k) + (g(i + 1, k) - g(i, k)) * fx;
  const a1 = g(i, k + 1) + (g(i + 1, k + 1) - g(i, k + 1)) * fx;
  return a0 + (a1 - a0) * fz;
}

/* ════════════════════════════ thermal erosion ═══════════════════════════════
   The pass that makes this a landform rather than a noise field. Material above
   the angle of repose slides to its lower neighbours until nothing stands
   steeper than repose. It produces the two things noise alone never does: flat
   valley floors where the material collected, and straight talus faces at
   exactly one angle.

   MASS IS CONSERVED EXACTLY — every subtraction has a matching addition, so the
   sum over the grid is invariant. That is the physical invariant of the process
   and it is what the selftest pins, because "the terrain looks eroded" is
   precisely the kind of claim that lets a wrong number through. */

function thermal(h, n, cell, reposeTan, passes, rate) {
  const maxDrop = cell * reposeTan;              // the most one cell may stand above the next
  const delta = new Float64Array(h.length);
  const at = (i, k) => k * n + i;
  for (let p = 0; p < passes; p++) {
    delta.fill(0);
    for (let k = 0; k < n; k++) {
      for (let i = 0; i < n; i++) {
        const c = at(i, k), hc = h[c];
        // the four orthogonal neighbours, and only those below by more than
        // repose allows — a diagonal neighbour is 1.41 cells away and using it
        // with the same threshold quietly steepens the enforced angle
        let total = 0, worst = 0;
        const nb = [];
        if (i > 0) nb.push(at(i - 1, k));
        if (i < n - 1) nb.push(at(i + 1, k));
        if (k > 0) nb.push(at(i, k - 1));
        if (k < n - 1) nb.push(at(i, k + 1));
        for (const j of nb) {
          const d = hc - h[j];
          if (d > maxDrop) { total += d - maxDrop; if (d > worst) worst = d; }
        }
        if (total <= 0) continue;
        // move a fraction of the excess over the steepest face, shared out in
        // proportion to how far each neighbour is below the threshold
        const move = rate * (worst - maxDrop) * 0.5;
        delta[c] -= move;
        for (const j of nb) {
          const d = hc - h[j];
          if (d > maxDrop) delta[j] += move * ((d - maxDrop) / total);
        }
      }
    }
    for (let i = 0; i < h.length; i++) h[i] += delta[i];
  }
  return h;
}

/* ═══════════════════════════════ the terrain ════════════════════════════════ */

// Build a site's ground. `extent` metres square, sampled every `cell` metres,
// centred on the origin so it shares arch.js's frame — a building generated at
// 0,0 is a building in the middle of its site.
export function Terrain(seed, o = {}) {
  const rnd = Rand(seed, 'terrain');
  const extent = o.extent || 400;
  const cell = o.cell || 4;
  const n = Math.max(8, Math.round(extent / cell));
  const ground = GROUND[o.ground || rnd.pickW([['B', 0.6], ['C', 1.4], ['D', 2.2], ['E', 1.0]])] || GROUND.D;

  // How much relief this place has, and how rough it is. Most sites are gentle
  // — a city is mostly built on ground somebody chose because it was buildable
  // — so the distribution is skewed, and a steep site is the interesting
  // minority rather than the average.
  const relief = o.relief != null ? o.relief : r2(Math.pow(rnd.f(), 1.9) * 46 + 1.5);
  const hurst = o.hurst != null ? o.hurst : r2(rnd.range(0.55, 0.95));
  const gain = Math.pow(2, -hurst);

  // the field
  const OCT = 5;
  const lats = [];
  for (let o2 = 0; o2 < OCT; o2++) lats.push(lattice(rnd, Math.max(2, 2 << o2)));
  const h = new Float64Array(n * n);
  let lo = Infinity, hi = -Infinity;
  for (let k = 0; k < n; k++) {
    for (let i = 0; i < n; i++) {
      const u = i / (n - 1), v = k / (n - 1);
      let amp = 1, sum = 0, norm = 0;
      for (let o2 = 0; o2 < OCT; o2++) {
        sum += amp * sampleLattice(lats[o2], Math.max(2, 2 << o2), u, v);
        norm += amp; amp *= gain;
      }
      const y = sum / norm;
      h[k * n + i] = y;
      if (y < lo) lo = y; if (y > hi) hi = y;
    }
  }
  // normalise to [0, relief] BEFORE eroding, so repose is enforced against real
  // metres rather than against a unit field
  const span = Math.max(1e-9, hi - lo);
  for (let i = 0; i < h.length; i++) h[i] = ((h[i] - lo) / span) * relief;

  // and then let it stand at its own angle
  const reposeTan = Math.tan(ground.phi * DEG);
  const passes = o.erodePasses != null ? o.erodePasses : 60;
  thermal(h, n, cell, reposeTan, passes, ground.erodes);

  const half = extent / 2;
  const idx = (i, k) => Math.min(n - 1, Math.max(0, k)) * n + Math.min(n - 1, Math.max(0, i));

  // bilinear height at any world point, clamped outside the grid
  const heightAt = (x, z) => {
    const u = ((x + half) / extent) * (n - 1);
    const v = ((z + half) / extent) * (n - 1);
    const cu = Math.min(n - 1, Math.max(0, u)), cv = Math.min(n - 1, Math.max(0, v));
    const i = Math.min(n - 2, Math.floor(cu)), k = Math.min(n - 2, Math.floor(cv));
    const fx = cu - i, fz = cv - k;
    const a0 = h[idx(i, k)] + (h[idx(i + 1, k)] - h[idx(i, k)]) * fx;
    const a1 = h[idx(i, k + 1)] + (h[idx(i + 1, k + 1)] - h[idx(i, k + 1)]) * fx;
    return a0 + (a1 - a0) * fz;
  };

  // the surface gradient, by central differences over one cell
  const gradAt = (x, z) => ({
    dx: (heightAt(x + cell, z) - heightAt(x - cell, z)) / (2 * cell),
    dz: (heightAt(x, z + cell) - heightAt(x, z - cell)) / (2 * cell),
  });
  // β, the slope angle, in radians — the quantity the stability check divides by
  const slopeAt = (x, z) => { const g = gradAt(x, z); return Math.atan(Math.hypot(g.dx, g.dz)); };
  // the compass direction water runs, i.e. steepest DESCENT. Later this is what
  // decides where a street can go and where it drains to.
  const aspectAt = (x, z) => { const g = gradAt(x, z); return Math.atan2(-g.dz, -g.dx); };

  let min = Infinity, max = -Infinity, sum = 0;
  for (let i = 0; i < h.length; i++) { if (h[i] < min) min = h[i]; if (h[i] > max) max = h[i]; sum += h[i]; }

  return {
    version: VERSION, seed: String(seed), grid: h, n, cell, extent, half,
    ground, groundId: Object.keys(GROUND).find((k) => GROUND[k] === ground) || 'D',
    relief, hurst, repose: ground.phi,
    min: r2(min), max: r2(max), mean: r2(sum / h.length),
    heightAt, gradAt, slopeAt, aspectAt,
    // the grid node's world position, for anything that walks the field directly
    xOf: (i) => r2(-half + (i / (n - 1)) * extent),
    zOf: (k) => r2(-half + (k / (n - 1)) * extent),
  };
}

/* ══════════════════════════ the closed forms ════════════════════════════════
   The three relations this file is checked against, all textbook and all exact.
   They are what make the ground CHANGE A NUMBER rather than provide a backdrop. */

// INFINITE SLOPE, dry and cohesionless: FoS = tan φ / tan β. The most useful
// slope equation there is, because everything cancels — the answer does not
// depend on the depth of the slip plane or on the unit weight, only on the two
// angles. It is why "steeper than repose" and "unstable" are the same sentence.
export function slopeFoS(beta, phi) {
  const b = Math.abs(beta);
  if (b < 1e-9) return Infinity;
  return Math.tan(phi * DEG) / Math.tan(b);
}

// With cohesion and a water table, for a cut face where c' is doing the work:
// FoS = [c' + (γz cos²β − u) tan φ'] / (γ z sin β cos β)
export function slopeFoSC(beta, phi, c, gamma, depth, u = 0) {
  const b = Math.abs(beta);
  if (b < 1e-9) return Infinity;
  const num = c + (gamma * depth * Math.cos(b) ** 2 - u) * Math.tan(phi * DEG);
  const den = gamma * depth * Math.sin(b) * Math.cos(b);
  return den <= 0 ? Infinity : num / den;
}

// RANKINE earth pressure coefficients. Ka and Kp are reciprocals for the
// smooth-wall level-backfill case, and each has two equivalent forms — the
// trigonometric identity between them is the selftest.
export function rankine(phi) {
  const s = Math.sin(phi * DEG);
  const Ka = (1 - s) / (1 + s);
  return { Ka: r3(Ka), Kp: r3(1 / Ka), phi };
}

// A GRAVITY RETAINING WALL, sized by the two things that actually fail: it
// topples about its toe, or it slides on its base. Active thrust
// Pa = ½·Ka·γ·H² per metre run, acting at H/3 above the base. Everything here
// is per metre of wall, which is how retaining walls are designed.
export function retaining(H, groundKey, o = {}) {
  const G = GROUND[groundKey] || GROUND.D;
  const { Ka } = rankine(G.phi);
  const gammaC = o.gammaC || 24e3;             // reinforced concrete
  const surcharge = o.surcharge || 0;          // kPa on the retained side
  const otTarget = o.otFoS || 2.0, slTarget = o.slFoS || 1.5;

  const Pa = 0.5 * Ka * G.gamma * H * H + Ka * surcharge * H;
  const arm = (0.5 * Ka * G.gamma * H * H * (H / 3) + Ka * surcharge * H * (H / 2)) / Math.max(1e-9, Pa);
  const Mot = Pa * arm;

  // solve the base width a rectangular gravity stem needs for overturning:
  // W·(B/2) ≥ FoS·Mot with W = γc·B·H  →  B = √(2·FoS·Mot / (γc·H))
  const B = Math.sqrt((2 * otTarget * Mot) / (gammaC * H));
  const W = gammaC * B * H;
  const otFoS = (W * (B / 2)) / Math.max(1e-9, Mot);
  const slFoS = (Math.tan((2 / 3) * G.phi * DEG) * W) / Math.max(1e-9, Pa);

  return {
    H: r2(H), Ka, thrust: Math.round(Pa), arm: r2(arm), moment: Math.round(Mot),
    base: r2(B), weight: Math.round(W),
    otFoS: r2(otFoS), slFoS: r2(slFoS),
    ok: otFoS >= otTarget - 1e-6 && slFoS >= slTarget,
    // concrete volume per metre run — the number that turns a retaining wall
    // into money, and the reason a scheme moves rather than digs
    volume: r2(B * H),
  };
}

/* ═══════════════════════════════ earthworks ═════════════════════════════════
   Levelling a plot to a datum. The one exact result worth having:

     cut(d) − fill(d) = Σ(hᵢ − d)·A   for every d

   because max(0, x) − max(0, −x) = x identically. So cut equals fill exactly
   when d = mean(h) — the BALANCE DATUM is the mean of the natural surface over
   the plot, with no search and no iteration. That matters because hauling spoil
   off site is most of the cost of earthworks, and a scheme that balances moves
   no lorries. */

export function earthworks(t, plot, o = {}) {
  const step = o.step || t.cell / 2;
  const hw = plot.w / 2, hd = plot.d / 2;
  const rot = plot.rot || 0;
  const cs = Math.cos(rot), sn = Math.sin(rot);

  const hs = [];
  for (let a = -hw + step / 2; a < hw; a += step) {
    for (let b = -hd + step / 2; b < hd; b += step) {
      // sample in the PLOT's frame and rotate out to the world, so a rotated
      // plot is levelled over the ground it actually covers
      const x = plot.x + a * cs - b * sn;
      const z = plot.z + a * sn + b * cs;
      hs.push(t.heightAt(x, z));
    }
  }
  if (!hs.length) hs.push(t.heightAt(plot.x, plot.z));

  const mean = hs.reduce((s, v) => s + v, 0) / hs.length;
  const datum = o.datum != null ? o.datum : mean;
  const cellA = step * step;
  let cut = 0, fill = 0, maxCut = 0, maxFill = 0;
  for (const y of hs) {
    const d = y - datum;
    if (d > 0) { cut += d * cellA; if (d > maxCut) maxCut = d; }
    else { fill += -d * cellA; if (-d > maxFill) maxFill = -d; }
  }
  return {
    datum: r2(datum), balanceDatum: r2(mean), balanced: o.datum == null,
    cut: r2(cut), fill: r2(fill), net: r2(cut - fill),
    maxCut: r2(maxCut), maxFill: r2(maxFill),
    // the tallest face the levelling creates, which is what has to be retained
    retained: r2(Math.max(maxCut, maxFill)),
    natural: { min: r2(Math.min(...hs)), max: r2(Math.max(...hs)), mean: r2(mean) },
    fall: r2(Math.max(...hs) - Math.min(...hs)),
    samples: hs.length,
    // Spoil leaves site in lorries; 1.25 is the standard bulking factor for
    // excavated ground and 16 m³ is a typical artic tipper. ROUNDED, not
    // ceiled — at the balance datum cut and fill are equal to floating point
    // rather than to zero, and ceil turns a residue of 10⁻¹² m³ into a lorry.
    lorries: Math.max(0, Math.round((Math.abs(cut - fill) * 1.25) / 16)),
  };
}

/* ═════════════════════════════ the check list ═══════════════════════════════
   Same shape as the stair's, the lift's and the plant's: every check says what
   it protects. And note what is NOT here — there is no check that the natural
   ground stands up, because after erosion it always does. Every entry below is
   a consequence of BUILDING on it. */

export function check(t, plot, o = {}) {
  const e = o.earthworks || earthworks(t, plot, o);
  const G = t.ground;
  const c = [];
  const add = (id, label, pass, value, note) => c.push({ id, label, pass, value, note });

  // the natural slope across the plot, as an angle
  const beta = t.slopeAt(plot.x, plot.z);
  const betaDeg = beta / DEG;

  add('repose', 'Natural slope against repose', betaDeg <= G.phi + 0.5,
    `${betaDeg.toFixed(1)}° of ${G.phi}° repose`,
    'the one check the ground passes by construction — thermal erosion refuses to leave a face steeper than the material stands at, and the angle it enforces IS the friction angle this divides by. A failure here means the terrain and the geotechnics have stopped sharing a constant');

  // THE CUT FACE. This is where the hazard actually lives: excavation stands
  // ground at an angle it never chose.
  const faceH = e.retained;
  const cutBeta = faceH > 0.15 ? Math.atan2(faceH, Math.max(0.5, t.cell / 2)) : 0;
  const fos = faceH > 0.15
    ? slopeFoSC(cutBeta, G.phi, G.cohesion, G.gamma, Math.max(0.5, faceH), o.waterTable ? WATER * faceH * 0.5 : 0)
    : Infinity;
  add('cutface', 'Cut face standing unsupported', fos >= 1.3,
    faceH > 0.15 ? `FoS ${fos === Infinity ? '∞' : fos.toFixed(2)} on a ${faceH.toFixed(2)} m face` : 'no face cut',
    'a levelled plot on a slope is a hole with sides, and the sides do not care that a drawing shows them vertical. Below 1.3 the face needs retaining, which is the moment the ground starts costing money');

  const wall = faceH > 0.15 && fos < 1.3 ? retaining(faceH, t.groundId, o) : null;
  if (wall) {
    add('retain', 'Retaining wall', wall.ok && faceH <= (o.maxWall || 6),
      `${wall.base.toFixed(2)} m base for ${wall.H.toFixed(2)} m retained · ${wall.volume.toFixed(1)} m³/m`,
      'sized on overturning about the toe and sliding on the base, the two ways a gravity wall actually goes. Above about six metres a gravity wall stops being the answer and the scheme should be stepping down the hill instead of holding it back');
  }

  // HAUL. A balanced site moves no lorries; an unbalanced one is a convoy.
  add('haul', 'Cut and fill balance', e.lorries <= (o.maxLorries || 40),
    `${e.cut.toFixed(0)} m³ cut, ${e.fill.toFixed(0)} m³ fill, ${e.lorries} lorries`,
    'levelling to the mean of the natural surface balances cut against fill exactly, which is why that datum is chosen rather than searched for. Everything above the balance leaves site at 1.25 times its dug volume');

  // the approach. A ramp steeper than 1:20 is not an accessible route, and 1:12
  // is the absolute limit with landings.
  const approach = Math.abs(Math.tan(beta));
  add('approach', 'Approach gradient', approach <= 0.083 + 1e-9,
    `1:${approach > 1e-6 ? (1 / approach).toFixed(0) : '∞'}`,
    'an accessible approach wants 1:20 and tolerates 1:12 with landings. Steeper than that and the entrance has to move round the hill, which is a plan decision the ground just made');

  return { checks: c, pass: c.every((q) => q.pass), governing: c.find((q) => !q.pass) || null, earthworks: e, wall };
}

/* ═════════════════════════════════ drawing ══════════════════════════════════ */

// CONTOURS, by marching squares. The one drawing convention that carries the
// whole of a site's information in a single line weight, and the reason a site
// plan is legible at all. Emitted as segments in world coordinates; the sheet
// strokes them as one path.
//
// The saddle cases (5 and 10) are resolved on the cell's centre value rather
// than picked arbitrarily, because guessing there is what makes contours cross
// — and contours that cross are a drawing saying the ground is in two places.
const MS = [
  [], [[3, 0]], [[0, 1]], [[3, 1]], [[1, 2]], null, [[0, 2]], [[3, 2]],
  [[2, 3]], [[2, 0]], null, [[2, 1]], [[1, 3]], [[1, 0]], [[0, 3]], [],
];

export function contours(t, interval = 1, o = {}) {
  const { n, cell, half, grid } = t;
  const lo = Math.ceil(t.min / interval) * interval;
  const hi = Math.floor(t.max / interval) * interval;
  const out = [];
  const wx = (i) => -half + (i / (n - 1)) * t.extent;
  const wz = (k) => -half + (k / (n - 1)) * t.extent;
  const maxLines = o.max || 60;

  for (let L = lo, guard = 0; L <= hi + 1e-9 && guard < maxLines; L += interval, guard++) {
    const segs = [];
    for (let k = 0; k < n - 1; k++) {
      for (let i = 0; i < n - 1; i++) {
        const h0 = grid[k * n + i], h1 = grid[k * n + i + 1];
        const h2 = grid[(k + 1) * n + i + 1], h3 = grid[(k + 1) * n + i];
        const code = (h0 > L ? 1 : 0) | (h1 > L ? 2 : 0) | (h2 > L ? 4 : 0) | (h3 > L ? 8 : 0);
        if (code === 0 || code === 15) continue;
        // the four edge crossings, linearly interpolated
        const lerp = (a, b) => (L - a) / ((b - a) || 1e-9);
        const E = [
          () => [wx(i + lerp(h0, h1)), wz(k)],
          () => [wx(i + 1), wz(k + lerp(h1, h2))],
          () => [wx(i + lerp(h3, h2)), wz(k + 1)],
          () => [wx(i), wz(k + lerp(h0, h3))],
        ];
        let pairs = MS[code];
        if (pairs === null) {
          // saddle: the centre decides which way the two arcs connect
          const centre = (h0 + h1 + h2 + h3) / 4;
          const aboveIsCorner02 = code === 5;
          pairs = (centre > L) === aboveIsCorner02 ? [[3, 0], [1, 2]] : [[0, 1], [2, 3]];
        }
        for (const [a, b] of pairs) {
          const p = E[a](), q = E[b]();
          segs.push([r2(p[0]), r2(p[1]), r2(q[0]), r2(q[1])]);
        }
      }
    }
    if (segs.length) {
      out.push({
        level: r2(L), segments: segs,
        // an INDEX contour every fifth line, drawn heavier and labelled — the
        // convention that makes a contour sheet countable at a glance
        index: Math.abs(Math.round(L / interval) % 5) === 0,
      });
    }
  }
  return out;
}

// A ground line for a section: the natural surface sampled along the cut.
export function profile(t, x0, z0, x1, z1, n = 96) {
  const out = [];
  const L = Math.hypot(x1 - x0, z1 - z0);
  for (let i = 0; i <= n; i++) {
    const s = i / n;
    out.push({ d: r2(s * L), x: r2(x0 + (x1 - x0) * s), z: r2(z0 + (z1 - z0) * s), y: r2(t.heightAt(x0 + (x1 - x0) * s, z0 + (z1 - z0) * s)) });
  }
  return out;
}

// The mesh, for the bench. Positions and indices only — a terrain is the one
// thing in this repo that is genuinely a surface rather than an assembly of
// boxes, so it does not go through `parts()` and pretend otherwise.
export function mesh(t, o = {}) {
  const stride = Math.max(1, o.stride || 1);
  const n = t.n, m = Math.floor((n - 1) / stride) + 1;
  const positions = new Float32Array(m * m * 3);
  const indices = [];
  let p = 0;
  for (let k = 0; k < m; k++) {
    for (let i = 0; i < m; i++) {
      const gi = Math.min(n - 1, i * stride), gk = Math.min(n - 1, k * stride);
      positions[p++] = -t.half + (gi / (n - 1)) * t.extent;
      positions[p++] = t.grid[gk * n + gi];
      positions[p++] = -t.half + (gk / (n - 1)) * t.extent;
    }
  }
  for (let k = 0; k < m - 1; k++) {
    for (let i = 0; i < m - 1; i++) {
      const a = k * m + i, b = a + 1, c = a + m, d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
  }
  return { positions, indices, count: m * m };
}

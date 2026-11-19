// PRISM's optics: light in four dimensions, as rays. No DOM.
//
// Nothing about refraction changes with the dimension. At a boundary the incoming ray, the boundary's normal and the
// outgoing ray lie in one plane, and Snell's law n₁ sin θ₁ = n₂ sin θ₂ holds in it; in vector form
//   t = η d + (η cos θ₁ − cos θ₂) N,   η = n₁/n₂,  cos θ₂ = √(1 − η²(1 − cos² θ₁)),
// which never mentions how many coordinates d has. Past the critical angle the square root goes imaginary and the ray
// reflects (r = d + 2 cos θ₁ N). A mirror reflects: r = d − 2 (d·n) n.
//
// What does change is the geometry. A boundary of a 4D body is a 3D cell; a 4D prism is a triangle times a square (a
// 3,4-duoprism), which bends light only in its triangle's plane, so turning that plane to contain w bends a beam ana or
// kata. A ray meets a 3D slice in one point, so in the slice a beam is a spark. And a target must be a solid: a ray
// misses anything thinner than 4D (a 3D window would do, but a solid is simpler to hit and to see).
//
// Bodies are convex: faces { n, b } (outward unit n, points with n·x ≤ b inside) and vertices, placed by a rotation R
// and a centre c. Kinds: 'glass' (refracts, dispersive), 'mirror' (every face reflects), 'wall' (absorbs), 'target'
// (a detector the light passes through), 'source' (drawn only).

export const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];
export const add = (a, b, k = 1) => [a[0] + k * b[0], a[1] + k * b[1], a[2] + k * b[2], a[3] + k * b[3]];
export const scale = (a, k) => a.map((x) => x * k);
export const norm = (a) => Math.sqrt(dot(a, a));
export const unit = (a) => scale(a, 1 / norm(a));
export const AXES = 'xyzw';
export const I4 = () => [[1, 0, 0, 0], [0, 1, 0, 0], [0, 0, 1, 0], [0, 0, 0, 1]];
export const mul = (A, B) => A.map((r) => [0, 1, 2, 3].map((k) => r[0] * B[0][k] + r[1] * B[1][k] + r[2] * B[2][k] + r[3] * B[3][k]));
export const apply = (M, v) => M.map((r) => dot(r, v));
const DEG = Math.PI / 180;

/** Rotation by th (radians) in the plane of axes i and j, taking e_i toward e_j. Plane by name too: 'xw'. */
export function rot(plane, th) {
  const [i, j] = typeof plane === 'string' ? [...plane].map((c) => AXES.indexOf(c)) : plane, M = I4(), c = Math.cos(th), s = Math.sin(th);
  M[i][i] = c; M[j][j] = c; M[j][i] = s; M[i][j] = -s;
  return M;
}
/** The rotation in the plane of unit vectors a and b taking a onto b (identity if equal). */
export function turnOnto(a, b) {
  const c = dot(a, b); if (c > 1 - 1e-12) return I4();
  let v = add(b, a, -c); if (norm(v) < 1e-12) { v = [1, 0, 0, 0]; v = add(v, a, -dot(v, a)); if (norm(v) < 1e-6) { v = add([0, 1, 0, 0], a, -a[1]); } }
  v = unit(v); const th = Math.acos(Math.max(-1, Math.min(1, c))), co = Math.cos(th) - 1, si = Math.sin(th);
  // x → x + (cos−1)((x·a)a + (x·v)v) + sin((x·a)v − (x·v)a)
  return [0, 1, 2, 3].map((r) => [0, 1, 2, 3].map((k) => (r === k ? 1 : 0) + co * (a[r] * a[k] + v[r] * v[k]) + si * (v[r] * a[k] - a[r] * v[k])));
}

// ------------------------------------------------------------------ shapes (local coordinates, centred)
const signs = (n) => Array.from({ length: 1 << n }, (_, m) => [...Array(n)].map((_, k) => ((m >> k) & 1 ? 1 : -1)));
/** A 4D box with half-widths h. */
export function box(h) {
  const faces = []; for (let i = 0; i < 4; i++) for (const s of [1, -1]) { const n = [0, 0, 0, 0]; n[i] = s; faces.push({ n, b: h[i] }); }
  return { faces, verts: signs(4).map((s) => s.map((x, i) => x * h[i])) };
}
/** A 4D prism: an isosceles triangle with apex angle A (radians) and equal sides L in the plane of x and y (apex toward
 *  +y, centroid at the origin), times a square of half-width q in z and w. Its refracting faces are the triangle's two
 *  equal sides; light bends in the xy plane. */
export function prism(A, L, q) {
  const hb = L * Math.sin(A / 2), ht = L * Math.cos(A / 2), cy = ht / 3;   // centroid at a third of the height
  const tri = [[0, ht - cy], [-hb, -cy], [hb, -cy]], faces = [];
  for (let k = 0; k < 3; k++) {
    const a = tri[k], b = tri[(k + 1) % 3], e = [b[0] - a[0], b[1] - a[1]], l = Math.hypot(...e); let n = [e[1] / l, -e[0] / l];
    if (n[0] * (0 - a[0]) + n[1] * (0 - a[1]) > 0) n = [-n[0], -n[1]];          // outward: the centroid is inside
    faces.push({ n: [n[0], n[1], 0, 0], b: n[0] * a[0] + n[1] * a[1] });
  }
  for (const i of [2, 3]) for (const s of [1, -1]) { const n = [0, 0, 0, 0]; n[i] = s; faces.push({ n, b: q }); }
  const verts = []; for (const p of tri) for (const [s, t] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) verts.push([p[0], p[1], s * q, t * q]);
  return { faces, verts, apex: A };
}
/** A shape placed: rotation R about its centre, then moved to c. */
export function place(shape, R, c) {
  return { faces: shape.faces.map((f) => { const n = apply(R, f.n); return { n, b: f.b + dot(n, c) }; }), verts: shape.verts.map((v) => add(apply(R, v), c)) };
}

// ------------------------------------------------------------------ glass
/** Refractive index at wavelength lam (micrometres): Cauchy's n = A + B/λ², set near a dense flint glass so the colours
 *  part visibly (n ≈ 1.70 for blue, 1.65 for red). */
export const GLASS = { A: 1.6, B: 0.02 };
export const indexAt = (lam, g = GLASS) => g.A + g.B / (lam * lam);
/** The three colours a white beam is traced as (micrometres), and their names for targets. */
export const BANDS = { red: 0.65, green: 0.53, blue: 0.45 };

/** Snell in vector form. d unit (travelling), N unit facing against d (d·N < 0), from index n1 into n2. */
export function refract(d, N, n1, n2) {
  const c = -dot(d, N), eta = n1 / n2, k = 1 - eta * eta * (1 - c * c);
  if (k < 0) return { d: add(d, N, 2 * c), tir: true };
  return { d: unit(add(scale(d, eta), N, eta * c - Math.sqrt(k))), tir: false };
}
export const reflect = (d, n) => add(d, n, -2 * dot(d, n));

/** Where a ray p + t d is inside a convex body: [tIn, tOut, faceIn, faceOut], or null. */
export function span(body, p, d) {
  let t0 = -Infinity, t1 = Infinity, f0 = -1, f1 = -1;
  body.faces.forEach((f, i) => {
    const dn = dot(f.n, d), h = f.b - dot(f.n, p);
    if (Math.abs(dn) < 1e-14) { if (h < 0) { t0 = Infinity; } return; }
    const t = h / dn;
    if (dn > 0) { if (t < t1) { t1 = t; f1 = i; } } else if (t > t0) { t0 = t; f0 = i; }
  });
  return t0 < t1 ? [t0, t1, f0, f1] : null;
}

/** Trace one ray of wavelength lam through a scene { bodies }. Returns the path (points), the events, which targets
 *  it passed through (by index into bodies), and how it ended. Bodies other than targets must not overlap. */
export function trace(scene, p0, d0, lam, maxEvents = 64, far = 60) {
  const path = [p0], events = [], through = new Set();
  let p = p0, d = unit(d0), inside = -1, end = 'escaped';
  for (let k = 0; k <= maxEvents; k++) {
    if (k === maxEvents) { end = 'lost'; break; }
    // the next boundary: leaving the glass we're in, or entering the nearest body ahead
    let tHit = far, who = -1, face = -1, entering = false;
    if (inside >= 0) { const s = span(scene.bodies[inside], p, d); if (s) { tHit = s[1]; who = inside; face = s[3]; } }
    else scene.bodies.forEach((b, i) => { if (b.kind === 'target' || b.kind === 'source') return; const s = span(b, p, d); if (s && s[0] > 1e-9 && s[0] < tHit && s[0] < s[1]) { tHit = s[0]; who = i; face = s[2]; entering = true; } });
    const q = add(p, d, tHit);
    // targets this segment passes through (for a positive length)
    scene.bodies.forEach((b, i) => { if (b.kind !== 'target') return; const s = span(b, p, d); if (s && Math.min(s[1], tHit) - Math.max(s[0], 0) > 1e-6) through.add(i); });
    path.push(q);
    if (who < 0) break;
    const b = scene.bodies[who], n = b.faces[face].n;
    if (b.kind === 'wall') { end = 'absorbed'; events.push({ kind: 'absorbed', at: q, body: who }); break; }
    if (b.kind === 'mirror') { const r = reflect(d, n); events.push({ kind: 'reflect', at: q, body: who, angle: Math.acos(Math.min(1, Math.abs(dot(d, n)))) / DEG }); d = r; p = q; continue; }
    // glass
    const ng = indexAt(lam, b.glass);
    if (entering) {
      const r = refract(d, n, 1, ng); events.push({ kind: 'enter', at: q, body: who, angle: Math.acos(Math.min(1, -dot(d, n))) / DEG });
      d = r.d; inside = who;                                                 // entering from air never totally reflects
    } else {
      const r = refract(d, scale(n, -1), ng, 1);
      events.push({ kind: r.tir ? 'tir' : 'leave', at: q, body: who, angle: Math.acos(Math.min(1, dot(d, n))) / DEG });
      d = r.d; if (!r.tir) inside = -1;
    }
    p = q;
  }
  return { path, events, through: [...through], end, dir: d };
}

// ------------------------------------------------------------------ levels
// A level is built by a function from the knob angles (degrees). Each knob turns one piece in one plane about its
// centre. Levels are designed backwards: the pieces are set in their solved positions, the solved beam is traced, and
// the targets are put where it goes. So every level is solvable by construction; the selftest checks it is solved at
// the solution, not at the start, and how much slack each knob has.

const sources = (src) => (src.white ? Object.entries(BANDS) : [[src.band || 'green', BANDS[src.band || 'green']]]);
/** Trace every colour of every source. */
export function shine(scene) {
  return scene.sources.flatMap((src) => sources(src).map(([band, lam]) => ({ band, lam, ...trace(scene, src.p, src.d, lam) })));
}
/** Which targets are lit, by the colour each wants ('any' or a band). */
export function score(scene, rays = shine(scene)) {
  const lit = scene.bodies.map((b, i) => b.kind === 'target' && rays.some((r) => (b.want === 'any' || b.want === r.band) && r.through.includes(i)));
  const targets = scene.bodies.map((b, i) => i).filter((i) => scene.bodies[i].kind === 'target');
  return { lit, targets, solved: targets.every((i) => lit[i]) };
}

const body = (kind, shape, R, c, extra = {}) => ({ kind, ...place(shape, R, c), R, c, shape, ...extra });
const MIRROR = box([0.04, 0.7, 0.7, 0.7]);
const SOURCE = box([0.18, 0.12, 0.12, 0.12]);
/** A target where a ray reaches distance s along its final segment (or at point at), wanting a band. */
const targetAt = (pt, want, h = 0.28) => body('target', box([h, h, h, h]), I4(), pt, { want });
const along = (ray, s) => add(ray.path[ray.path.length - 2], ray.dir, s);

// The prism every level uses: equilateral (60°), sides 1.3, its square 0.55 across in z and w, turned in its own
// triangle's plane so a beam along its x meets the first face at the angle of least bending for green light (the ray
// inside runs parallel to the base, the textbook path): incidence asin(n sin 30°). Then R turns it into place.
const PRISM = prism(60 * DEG, 1.3, 0.55);
export const MIN_DEV_TILT = -(Math.asin(indexAt(0.53) * Math.sin(30 * DEG)) / DEG - 30);
const prismPiece = (R, c, extra = {}) => body('glass', PRISM, mul(R, rot('xy', MIN_DEV_TILT * DEG)), c, { name: 'prism', ...extra });

export const LEVELS = [
  {
    id: 'ana', name: 'Ana',
    story: 'The target is ahead and off to one side, but not in our space: it is off in w. A prism bends light only in its triangle\'s plane. Turn that plane until it holds w.',
    knobs: [{ piece: 'prism', plane: 'yw', label: 'turn the prism in the yw plane', min: 0, max: 90, start: 0, sol: 90, step: 15 }],
    build(k) {
      const src = { p: [-3.5, 0, 0, 0], d: [1, 0, 0, 0], band: 'green' };
      return { src, pieces: [prismPiece(rot('yw', k[0] * DEG), [0, 0, 0, 0])], walls: [] };
    },
    targets: (sol) => [targetAt(along(shine(sol)[0], 3.2), 'any', 0.35)],
  },
  {
    id: 'wall', name: 'Over the wall',
    story: 'A wall fills our space from edge to edge: there is no way round it in x, y or z. But it is only a little over a unit thick in w. Send the beam ana, over the wall, and back down.',
    knobs: [{ piece: 'm1', plane: 'xw', label: 'turn the first mirror in the xw plane', min: -90, max: 90, start: 0, sol: -45 }, { piece: 'm4', plane: 'xw', label: 'turn the last mirror in the xw plane', min: -90, max: 90, start: 0, sol: 45 }],
    build(k) {
      const src = { p: [-4.5, 0, 0, 0], d: [1, 0, 0, 0], band: 'green' };
      const m = (name, at, deg) => body('mirror', MIRROR, rot('xw', deg * DEG), at, { name });
      const pieces = [m('m1', [-2.5, 0, 0, 0], k[0]), m('m2', [-2.5, 0, 0, 1.8], -45), m('m3', [2.5, 0, 0, 1.8], 45), m('m4', [2.5, 0, 0, 0], k[1])];
      const walls = [body('wall', box([0.2, 3, 3, 0.6]), I4(), [0, 0, 0, 0])];
      return { src, pieces, walls };
    },
    targets: (sol) => [targetAt(along(shine(sol)[0], 1.5), 'any', 0.35)],
  },
  {
    id: 'rainbow', name: 'Rainbow in w',
    story: 'White light, three targets: red, green and blue, side by side in w, so no single slice shows them all. Lay the prism\'s triangle along w, then tilt it until each colour finds its own.',
    knobs: [{ piece: 'prism', plane: 'yw', label: 'turn the prism in the yw plane', min: 0, max: 90, start: 0, sol: 90, step: 15 }, { piece: 'prism', plane: 'xw', label: 'tilt the prism in the xw plane', min: -30, max: 30, start: -24, sol: 4 }],
    build(k) {
      const src = { p: [-3.5, 0, 0, 0], d: [1, 0, 0, 0], white: true };
      return { src, pieces: [prismPiece(mul(rot('xw', k[1] * DEG), rot('yw', k[0] * DEG)), [0, 0, 0, 0])], walls: [] };
    },
    targets: (sol) => shine(sol).map((r) => targetAt(along(r, 7), r.band, 0.15)),
  },
  {
    id: 'corner', name: 'Round the corner',
    story: 'The target is up the z axis and off in w. The prism can send the beam into w; a mirror can then send it up z. Two turns, in two planes.',
    knobs: [{ piece: 'prism', plane: 'yw', label: 'turn the prism in the yw plane', min: 0, max: 90, start: 0, sol: 90, step: 15 }, { piece: 'mirror', plane: 'xz', label: 'turn the mirror in the xz plane', min: -90, max: 90, start: 0, sol: 45 }],
    build(k) {
      const src = { p: [-3.5, 0, 0, 0], d: [1, 0, 0, 0], band: 'green' };
      const pr = prismPiece(rot('yw', k[0] * DEG), [0, 0, 0, 0]);
      // the mirror sits where the solved beam (bent into w) has gone 2.5 further, facing so that at 45° it sends it up z
      const r1 = trace({ bodies: [prismPiece(rot('yw', 90 * DEG), [0, 0, 0, 0])] }, src.p, src.d, BANDS.green), at = along(r1, 2.5);
      const nStar = unit(add(r1.dir, [0, 0, 1, 0], -1));                    // reflects r1.dir onto +z
      const R0 = mul(rot('xz', -45 * DEG), turnOnto([1, 0, 0, 0], nStar));    // at the solution, the mirror's x normal is nStar
      const mi = body('mirror', MIRROR, mul(rot('xz', k[1] * DEG), R0), at, { name: 'mirror' });
      return { src, pieces: [pr, mi], walls: [] };
    },
    targets: (sol) => [targetAt(along(shine(sol)[0], 2.2), 'any', 0.35)],
  },
];

/** The scene for a level at knob angles k (defaults: the start). Targets are placed from the solution, once. */
const TCACHE = new Map();
export function scene(level, k = level.knobs.map((x) => x.start)) {
  const sc = (kk) => { const b = level.build(kk); return { bodies: [...b.pieces, ...b.walls], sources: [b.src], src: b.src }; };
  if (!TCACHE.has(level.id)) TCACHE.set(level.id, level.targets(sc(level.knobs.map((x) => x.sol))));
  const s = sc(k), src = s.src;
  return { bodies: [...s.bodies, ...TCACHE.get(level.id), body('source', SOURCE, turnOnto([1, 0, 0, 0], unit(src.d)), add(src.p, unit(src.d), -0.2))], sources: s.sources };
}

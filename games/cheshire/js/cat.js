/* The Cheshire cat, no DOM: a cat in four dimensions of space, built from smooth blobs, as one parts list that the
   page's shader draws and the selftest measures.

   Its own axes: x forward, y up, z and w its two sideways directions. Gravity is along −y, so the floor it stands on
   is a 3D space (x, z, w). Feet steady you only if they span the floor, so four must stand at the corners of a
   tetrahedron, not a rectangle: its front legs splay in z and its hind legs in w. (The five-legged cat, o.legs = 5,
   has three hind legs round z and w instead, and can creep: lift any one foot and four still span the floor.) Its
   head is round in both sideways
   directions, so it has four ears, a pair across z and a pair across w; its two eyes are set apart in z only. Its grin
   reaches far into w, further than its face, so when the cat steps out of your slice the grin is the last of it to go.

   A part is a capsule (a, b, radii ra → rb) or an ellipsoid (centre c, semi-axes r), each with a material and a reach
   in w, wx: 0 for an ordinary 4D part; otherwise the part is its 3D shape (at w = 0) extruded to |w| ≤ wx, so it
   keeps its full thickness in every slice out to wx and then stops (only the grin has one, and it reaches further
   than any of the rest of the cat). Fur joins fur smoothly (smooth minimum, width K); skin, eyes and grin join hard.
     pose(t, o)     the parts at time t (seconds): breathing, the tail swaying through w. o.idle = false holds it still
     sdf(p, P)      signed distance from a 4D point (the cat's frame) to the cat, and the material there
     paws(P)        the four feet's contact points on the floor
     mass(P)        the centre of mass (each part weighted by its 4D volume, roughly)
     cut(P, n, c)   the parts that reach the hyperplane n·q = c (the cat's frame), and the groups they make up */

export const MAT = { fur: 0, pink: 1, eye: 2, grin: 3 };
export const GROUPS = ["body", "head", "eyes", "ears", "front legs", "hind legs", "tail", "grin"];
export const K = 0.035; // how wide the smooth joins are, metres
export const LIMITS = { caps: 48, ells: 16 }; // the shader's array sizes
export const GRIN_W = 0.26; // how far the grin reaches into w, metres: past the tail's widest sway

const v = (x, y, z, w) => [x, y, z, w];
const mixv = (a, b, s) => a.map((q, i) => q + (b[i] - q) * s);

/* o.legs: 4 (the cat) or 5 (the five-legged cat: three hind legs round z and w). o.idle: breathe and sway the tail
   (default true). o.sway [dx, dz, dw]: the body moved over its planted feet (legs follow, paws stay). o.lift: the name
   of a foot that's up, or a list of names (FEET). o.tailFoot: the tail curved down and planted behind, a foot named "tail" */
export const FEET = { 4: ["front +z", "front −z", "hind +w", "hind −w"], 5: ["front +z", "front −z", "hind 0°", "hind 120°", "hind 240°"] };
/* the five-legged cat's hind legs, round the hips in the zw plane at these angles from +z toward +w. No side of their
   triangle may lie along z, the front pair's direction, or lifting one foot lays the other four in a plane (gait.js);
   0°, 120°, 240° keep every side 30° or more off it (and put one hind foot in the slice w = 0, on the +z side) */
export const HIND5 = [0, 120, 240];
export const TAIL_FOOT = [-0.46, 0, 0]; // where the planted tail touches the floor, [x, z, w]
export function pose(t = 0, o = {}) {
  const idle = o.idle !== false, caps = [], ells = [], sw = o.sway || [0, 0, 0], up = (n) => (Array.isArray(o.lift) ? o.lift.includes(n) : o.lift === n), five = o.legs === 5;
  const S = (p, k = 1) => [p[0] + k * sw[0], p[1], p[2] + k * sw[1], p[3] + k * sw[2]]; // carried k of the sway
  let g = "body"; // which part of the cat each piece belongs to (GROUPS), for the page to say what's in your slice
  const cap = (a, b, ra, rb, m = MAT.fur, wx = 0) => caps.push({ a, b, ra, rb, m, wx, g });
  const ell = (c, r, m = MAT.fur, wx = 0) => ells.push({ c, r, m, wx, g });
  const breath = idle ? 1 + 0.025 * Math.sin((2 * Math.PI * t) / 3.2) : 1;
  // the trunk: haunch to chest, and the belly under it
  cap(S(v(-0.17, 0.235, 0, 0)), S(v(0.13, 0.25, 0, 0)), 0.098 * breath, 0.108 * breath);
  ell(S(v(-0.02, 0.215, 0, 0)), v(0.17, 0.095 * breath, 0.1 * breath, 0.1 * breath));
  ell(S(v(-0.18, 0.23, 0, 0)), five ? v(0.09, 0.095, 0.092, 0.092) : v(0.085, 0.09, 0.075, 0.095)); // haunches, wider where the hind legs go
  ell(S(v(0.12, 0.235, 0, 0)), v(0.08, 0.09, 0.095, 0.075)); // shoulders, wider in z where the front legs go
  // the neck and head
  g = "head";
  cap(S(v(0.14, 0.28, 0, 0)), S(v(0.26, 0.36, 0, 0)), 0.068, 0.058);
  ell(S(v(0.29, 0.392, 0, 0)), v(0.088, 0.08, 0.09, 0.09));
  ell(S(v(0.346, 0.362, 0, 0)), v(0.036, 0.028, 0.04, 0.04)); // muzzle
  ell(S(v(0.258, 0.372, 0, 0)), v(0.05, 0.05, 0.1, 0.1)); // cheeks: the ruff, round in z and w alike
  ell(S(v(0.381, 0.377, 0, 0)), v(0.01, 0.009, 0.013, 0.011), MAT.pink); // nose
  // eyes apart in z; ears in pairs across z and across w
  for (const s of [1, -1]) {
    g = "eyes"; ell(S(v(0.356, 0.41, 0.042 * s, 0)), v(0.014, 0.019, 0.022, 0.019), MAT.eye);
    g = "ears"; cap(S(v(0.282, 0.435, 0.045 * s, 0)), S(v(0.268, 0.54, 0.075 * s, 0)), 0.034, 0.004);
    cap(S(v(0.282, 0.435, 0, 0.045 * s)), S(v(0.268, 0.54, 0, 0.075 * s)), 0.034, 0.004);
  }
  // front legs splay in z: shoulder, elbow, paw. A lifted paw rises LIFT and comes forward a little
  const LIFT = 0.055;
  g = "front legs";
  for (const s of [1, -1]) {
    const name = s > 0 ? "front +z" : "front −z", l = up(name) ? 1 : 0, raise = (p, h, dx = 0) => [p[0] + dx * l, p[1] + h * l, p[2], p[3]];
    const sh = S(v(0.14, 0.2, 0.055 * s, 0)), el = raise(S(v(0.115, 0.11, 0.078 * s, 0), 0.5), 0.035, 0.03), pw = raise(v(0.15, 0.024, 0.088 * s, 0), LIFT, 0.04);
    cap(sh, el, 0.04, 0.03); cap(el, pw, 0.03, 0.024);
    ell(raise(v(0.162, 0.021, 0.088 * s, 0), LIFT, 0.04), v(0.036, 0.021, 0.03, 0.03)); ells.at(-1).foot = name;
  }
  // hind legs: the cat's two splay in w; the five-legged cat's three stand round the hips at HIND5. Hip, knee, hock, paw
  g = "hind legs";
  const hind = five ? HIND5.map((a) => [`hind ${a}°`, Math.cos((a * Math.PI) / 180), Math.sin((a * Math.PI) / 180)]) : [["hind +w", 0, 1], ["hind −w", 0, -1]];
  const thin = five ? 0.9 : 1; // three legs share the load: a little slimmer
  for (const [name, cz, cw] of hind) {
    const l = up(name) ? 1 : 0, raise = (p, h, dx = 0) => [p[0] + dx * l, p[1] + h * l, p[2], p[3]], at = (x, y, r) => v(x, y, r * cz, r * cw);
    const hp = S(at(-0.16, 0.2, 0.06)), kn = raise(S(at(-0.07, 0.12, 0.09), 0.6), 0.03, 0.02), hk = raise(S(at(-0.2, 0.065, 0.108), 0.25), 0.045, 0.03), pw = raise(at(-0.17, 0.024, 0.11), LIFT, 0.03);
    cap(hp, kn, 0.052 * thin, 0.034 * thin); cap(kn, hk, 0.032 * thin, 0.022 * thin); cap(hk, pw, 0.022 * thin, 0.024 * thin);
    ell(raise(at(-0.158, 0.021, 0.11), LIFT, 0.03), v(0.038, 0.021, 0.03, 0.03)); ells.at(-1).foot = name;
  }
  g = "tail";
  // the tail: up and back from the rump, curling at the tip, swaying through w (and a little in z). Planted (o.tailFoot,
  // and not lifted), it arches back and down to a pad on the floor at TAIL_FOOT
  const N = 9, pts = [], planted = o.tailFoot && !up("tail");
  const sway = idle ? Math.sin((2 * Math.PI * t) / 2.6) : 0.4, flick = idle ? Math.sin((2 * Math.PI * t) / 1.3 + 1) : 0;
  for (let i = 0; i <= N; i++) {
    const s = i / N;
    if (planted) pts.push(S(v(-0.27 + (TAIL_FOOT[0] + 0.27) * s, 0.25 + 0.07 * Math.sin(Math.PI * s) - 0.23 * s * s, 0, 0), 1 - s * s));
    else { const upc = Math.sin(s * 2.2); pts.push(S(v(-0.27 - 0.17 * s + 0.07 * s ** 3, 0.25 + 0.2 * upc + 0.04 * s * s, 0.025 * s * flick, 0.13 * s * s * sway + 0.05 * s ** 4))); }
  }
  for (let i = 0; i < N; i++) cap(pts[i], pts[i + 1], 0.034 - 0.017 * (i / N), 0.034 - 0.017 * ((i + 1) / N));
  if (planted) { ell(v(TAIL_FOOT[0], 0.016, TAIL_FOOT[1], TAIL_FOOT[2]), v(0.03, 0.016, 0.022, 0.022)); ells.at(-1).foot = "tail"; } // its pad: one more foot
  g = "grin";
  // the grin: a wide crescent laid just outside the face, its ends turned up, reaching GRIN_W into w at full thickness
  const G = 10, gr = [], surf = (c, r, y, z) => { const q = 1 - ((y - c[1]) / r[1]) ** 2 - (z / r[2]) ** 2; return q > 0 ? c[0] + r[0] * Math.sqrt(q) : -1; };
  for (let i = 0; i <= G; i++) {
    const th = -1.25 + (2.5 * i) / G, z = 0.078 * Math.sin(th), y = 0.336 + 0.042 * Math.abs(Math.sin(th)) ** 1.6;
    gr.push(S(v(Math.max(surf(v(0.346, 0.362), v(0.036, 0.028, 0.04), y, z), surf(v(0.29, 0.392), v(0.088, 0.08, 0.09), y, z), surf(v(0.258, 0.372), v(0.05, 0.05, 0.1), y, z)) + 0.003, y, z, 0)));
  }
  for (let i = 0; i < G; i++) cap(gr[i], gr[i + 1], 0.0095, 0.0095, MAT.grin, GRIN_W);
  if (caps.length > LIMITS.caps || ells.length > LIMITS.ells) throw new Error("the cat outgrew the shader's arrays");
  return { caps, ells };
}

/* distances, the same formulas as the shader's (lab.js FRAG) */
const sub = (a, b) => a.map((x, i) => x - b[i]), dot = (a, b) => a.reduce((s, x, i) => s + x * b[i], 0), len = (a) => Math.sqrt(dot(a, a));
const flat = (p) => [p[0], p[1], p[2], 0];
const ext = (d, p, wx) => (wx ? Math.max(d, Math.abs(p[3]) - wx) : d); // extruded along w: a true bound (the max of two)
export function capD(p, c) {
  const P = c.wx ? flat(p) : p, pa = sub(P, c.a), ba = sub(c.b, c.a), h = Math.min(1, Math.max(0, dot(pa, ba) / dot(ba, ba)));
  return ext(len(pa.map((x, i) => x - ba[i] * h)) - (c.ra + (c.rb - c.ra) * h), p, c.wx);
}
export function ellD(p, e) {
  const q = sub(e.wx ? flat(p) : p, e.c), r = e.wx ? [e.r[0], e.r[1], e.r[2], 1] : e.r, k0 = len(q.map((x, i) => x / r[i])), k1 = len(q.map((x, i) => x / (r[i] * r[i])));
  return ext(k1 < 1e-12 ? -Math.min(...r) : (k0 * (k0 - 1)) / k1, p, e.wx);
}
// smooth minimum, carrying the material along
function join(acc, d, m) {
  if (m >= MAT.pink || acc.m >= MAT.pink) return d < acc.d ? { d, m } : acc; // skin, eyes and grin join hard
  const h = Math.max(0, Math.min(1, 0.5 + (0.5 * (acc.d - d)) / K)); // h → 1 where the new part is the nearer
  return { d: acc.d * (1 - h) + d * h - K * h * (1 - h), m: acc.m * (1 - h) + m * h }; // as the shader's mix()
}
export function sdf(p, P) {
  let acc = { d: 100, m: 0 };
  for (const e of P.ells) acc = join(acc, ellD(p, e), e.m);
  for (const c of P.caps) acc = join(acc, capD(p, c), c.m);
  return acc;
}
/* where each foot meets the floor: the bottom of every foot touching y ≈ 0 (the paws, and the tail's pad when it's
   planted), in the order they're built (FEET, then "tail"); a lifted foot isn't one. pawNames: their names */
const down = (P) => P.ells.filter((e) => e.foot && Math.abs(e.c[1] - e.r[1]) < 0.002);
export function paws(P) { return down(P).map((e) => v(e.c[0], e.c[1] - e.r[1], e.c[2], e.c[3])); }
export function pawNames(P) { return down(P).map((e) => e.foot); }
/* centre of mass: each part weighted by its 4D volume (a capsule as a cylinder of its mean radius, plus nothing for
   the caps; an ellipsoid as π²/2 r₁r₂r₃r₄), the grin and eyes weightless */
export function mass(P) {
  let M = 0, c = [0, 0, 0, 0];
  const add = (m, x) => { M += m; c = c.map((q, i) => q + m * x[i]); };
  for (const e of P.ells) if (e.m < MAT.eye) add((Math.PI ** 2 / 2) * e.r.reduce((a, b) => a * b, 1), e.c);
  for (const k of P.caps) if (k.m < MAT.eye) { const r = (k.ra + k.rb) / 2; add(((4 * Math.PI) / 3) * r ** 3 * len(sub(k.b, k.a)), mixv(k.a, k.b, 0.5)); }
  return { M, c: c.map((q) => q / M) };
}
/* which parts reach the slice n·q = c (n a unit 4-vector in the cat's frame): a part's extent along n, widened by the
   smooth join's width so a part that only shows through a join still counts */
export function cut(P, n, c) {
  const nn = (q) => dot(n, q), hit = [];
  for (const k of P.caps) {
    const r = Math.max(k.ra, k.rb) + (k.m >= MAT.eye ? 0 : K), wx = k.wx ? k.wx * Math.abs(n[3]) : 0, A = nn(k.wx ? flat(k.a) : k.a), B = nn(k.wx ? flat(k.b) : k.b);
    if (c >= Math.min(A, B) - r - wx && c <= Math.max(A, B) + r + wx) hit.push(k);
  }
  for (const e of P.ells) {
    const ext = Math.sqrt(e.r.reduce((s, r, i) => s + (r * n[i]) ** 2, 0)) + (e.m >= MAT.eye ? 0 : K);
    if (Math.abs(nn(e.c) - c) <= ext) hit.push(e);
  }
  return { parts: hit, groups: GROUPS.filter((g) => hit.some((h) => h.g === g)) };
}
/* the body sway that puts the posed cat's own centre of mass over the floor point `target` [x, z, w] (its legs and a
   planted tail move less than its body, so a few rounds of correcting by what's left) */
export function swayFor(target, o = {}) {
  let s = [0, 0, 0];
  for (let k = 0; k < 5; k++) { const c = mass(pose(0, { idle: false, ...o, sway: s })).c; s = s.map((x, i) => x + target[i] - c[[0, 2, 3][i]]); }
  return s;
}

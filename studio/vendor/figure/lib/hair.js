// hair.js — anime hair: a cap and locks, from predicates, draped and kept off the body.
//
// Anime hair is drawn as CLUMPS: a mass over the skull, then locks, each a
// tapered wedge ending in a point. Styles are a small vocabulary (blunt hime
// bangs, swept or parted bangs, twin tails, a ponytail, buns, the ahoge that
// sticks up from the crown), which is what makes it generable.
//
// A lock is a chain from its root on the scalp: stiff near the root, giving way
// to gravity toward the tip (and to the head's acceleration, when it moves).
// Every point is pushed out of the head and body by the lock's own radius plus
// a gap, so long hair drapes over the shoulders and down the back instead of
// through them. The same distance field the checks measure does the pushing.
//
// Everything is built in the head's frame (y up, z forward, origin the head's
// pivot) and carried into the world on the solved pose.

import { add, sub, scale, norm, dot, cross, apply, len, lerp3 } from './vec.js';

export const COLORS = {
  black: ['#34303c', '#1b1820'], brown: ['#7a4f34', '#4a2e1e'], chestnut: ['#9a4a2a', '#5e2a16'],
  blonde: ['#f2dc98', '#caa862'], pink: ['#f5aac4', '#d27a9c'], silver: ['#dfe2ea', '#a7adbd'],
  blue: ['#6286dc', '#3c58a6'], red: ['#d0453e', '#8e2622'], green: ['#62b07e', '#3a7a52'],
  purple: ['#8d6cc8', '#5d4494'], orange: ['#f39e4e', '#c06a2a'], white: ['#f4f2ee', '#c4c3cc'],
};

export const HAIR_PREDICATES = {
  length: ['short', 'bob', 'shoulder', 'long', 'waist'],
  bangs: ['blunt', 'swept', 'parted', 'spiky', 'none'],
  tails: ['none', 'twintails', 'ponytail', 'bun', 'buns'],
  extras: ['ahoge', 'sidelocks'],
};
// A lock is a flat ribbon, not a rope: FLAT of its width thick, lying on the head. Anime
// hair reads as a few wide masses with pointed ends; round cones read as a bundle of cords.
export const FLAT = 0.4;
const LENGTH = { short: 0.32, bob: 0.62, shoulder: 1.05, long: 2.1, waist: 3.0 };

/** The locks, in head-local space: [{ group, pts: [head-local points], r: [radii], stiff, drape }] plus the cap. */
export function hairDesign(hair = {}, m) {
  const w = m.head.width;
  const c = [0, 0.5, -0.05];                             // the cap's centre (just above the cranium's)
  const vol = 1 + 0.08 * (hair.volume ?? 0.5);
  const R = [(w / 2 + 0.055) * vol, 0.5 * vol, 0.52 * vol];
  const onCap = (az, el, lift = 0) => [Math.sin(az) * Math.cos(el) * (R[0] + lift), c[1] + Math.sin(el) * (R[1] + lift), c[2] + Math.cos(az) * Math.cos(el) * (R[2] + lift)];
  const down = (az, el) => norm([Math.sin(az) * Math.sin(el) * R[0], -Math.cos(el) * R[1], Math.cos(az) * Math.sin(el) * R[2]]);   // down the surface
  const out = { cap: { c, r: R, n: norm([0, -0.5, 0.86]), d: 0.12 }, locks: [] };
  const lock = (group, az, el, len, r0, opt = {}) => out.locks.push({ group, root: onCap(az, el, -0.03), dir: opt.dir || down(az, el), len, r0, segs: opt.segs || 4, stiff: opt.stiff ?? 0.55, taper: opt.taper ?? 0.9, cutY: opt.cutY, curl: opt.curl || [0, 0, 0], k: opt.k ?? 0.05, flat: opt.flat ?? FLAT, name: opt.name || `${group}${out.locks.length}` });

  const length = LENGTH[hair.length || 'bob'];
  const browY = (hair._browY ?? 0.5);                     // where blunt bangs stop (head frame)

  // ---- bangs: roots along the front of the scalp, over the forehead
  const bangs = hair.bangs || 'blunt';
  if (bangs !== 'none') {
    const n = 7;
    for (let i = 0; i < n; i++) {
      const f = (i / (n - 1)) * 2 - 1;                   // −1 … 1 across the forehead
      const az = f * 0.8;
      let dir = down(az, 0.95), cutY = browY + 0.02 + 0.03 * Math.abs(f), stiff = 0.8, len = 0.62;
      if (bangs === 'swept') { dir = norm(add(dir, [0.55, 0, 0])); cutY = browY + 0.02 - 0.05 * f; }
      if (bangs === 'parted') { dir = norm(add(dir, [(Math.abs(f) < 1e-9 ? 0 : Math.sign(f)) * 0.5, 0.05, 0])); cutY = browY + 0.05 + 0.03 * Math.abs(f); }
      if (bangs === 'spiky') { const k = Math.min(i, n - 1 - i); cutY = browY + 0.04 + 0.06 * ((k * 37) % 3) / 2; stiff = 0.92; len = 0.5; }   // varied, but mirrored
      lock('hair', az, 0.95, len, 0.14, { dir, cutY, stiff, segs: 3, taper: 1.4, k: 0.04, flat: 0.45, name: `bang${i}` });
    }
  }
  // ---- sidelocks: frame the face, in front of the ears
  const sides = (hair.extras || []).includes('sidelocks') || ['bob', 'shoulder', 'long', 'waist'].includes(hair.length || 'bob');
  if (sides) for (const sg of [1, -1]) lock('hair', sg * 1.2, 0.5, Math.min(length, 1.1) * (hair.extras?.includes('sidelocks') ? 1.5 : 1) + 0.25, 0.13, { stiff: 0.6, segs: 7, k: 0.08, flat: 0.5, name: `side${sg > 0 ? 'L' : 'R'}` });

  // ---- the back: a curtain of wide locks from the crown round the back
  const nb = 9;
  for (let i = 0; i < nb; i++) {
    const f = (i / (nb - 1)) * 2 - 1;
    const az = Math.PI + f * 1.8;
    const L = length * (1 - 0.12 * Math.abs(f)) + 0.2;
    lock(length > 1.2 ? 'hair_back' : 'hair', az, 0.5 - 0.12 * Math.abs(f), L, length > 0.5 ? 0.23 : 0.17, { stiff: 0.5, segs: length > 1.2 ? 10 : 5, taper: length > 1.2 ? 0.55 : 1.1, k: 0.09, name: `back${i}` });
  }
  // ---- tails
  const tails = hair.tails || 'none';
  const tail = (group, az, el, dir0, L, sg) => {
    const tie = onCap(az, el, 0.02);
    for (let j = 0; j < 3; j++) {
      // three full locks about the middle one, mirrored for a right-hand tail: one mass, a split at the end
      const spread = [(sg || 1) * (j - 1) * 0.07, (j % 2) * 0.05, (Math.abs(j - 1) - 0.5) * 0.08];
      out.locks.push({ group, root: tie, dir: norm(add(dir0, spread)), len: L * (0.88 + 0.07 * ((j + 1) % 3)), r0: 0.19, segs: 9, stiff: 0.22, taper: 0.65, curl: [0, 0, 0], k: 0.09, flat: 0.7, name: `${group}_${j}` });
    }
    out.ties = out.ties || [];
    out.ties.push({ group, at: tie, r: 0.075 });
  };
  if (tails === 'twintails') for (const [sg, g] of [[1, 'tail_l'], [-1, 'tail_r']]) tail(g, sg * 2.05, 0.66, norm([sg * 0.55, -0.1, -0.55]), Math.max(2.1, length + 0.8), sg);
  if (tails === 'ponytail') tail('tail_l', Math.PI, 0.6, norm([0, -0.2, -1]), Math.max(1.5, length + 0.3), 0);
  if (tails === 'bun' || tails === 'buns') {
    out.buns = (tails === 'bun' ? [[Math.PI, 0.75]] : [[1.1, 1.05], [-1.1, 1.05]]).map(([az, el]) => ({ at: onCap(az, el, 0.1), r: tails === 'bun' ? 0.2 : 0.15 }));
  }
  // ---- the ahoge: one stubborn strand from the crown, up and over
  if ((hair.extras || []).includes('ahoge')) lock('hair', 0.3, 1.45, 0.55, 0.03, { dir: norm([0.1, 1, 0.2]), stiff: 0.97, segs: 6, curl: [0, -0.28, 0.42], taper: 0.8, k: 0.01, flat: 1, name: 'ahoge' });
  return out;
}

/**
 * The hair's primitives on a solved pose. `body` is the list of body primitives
 * the locks must stay out of; `sdf(list, p)` its distance. Returns prims shaped
 * like body.js's (group names resolved by the caller).
 */
export function buildHair(P, hair, body, { sdf, ellipsoid, cone, ribbon, cappedEllipsoid, accel = [0, 0, 0] }) {
  const m = P.rig.m;
  const F = P.F.head, O = P.J.headPivot;
  const toW = (l) => add(O, apply(F, l));
  const D = hairDesign({ ...hair, _browY: (P.face?.eyeLine ?? 0.42) - m.head.pivotUp + (P.face?.eyeH ?? 0.18) * 0.62 + 0.05 }, m);
  const prims = [];
  // the cap: an ellipsoid over the skull, cut at the hairline
  prims.push(cappedEllipsoid('hair', toW(D.cap.c), F, D.cap.r, apply(F, D.cap.n), D.cap.d, 0.03, 'cap'));
  const grav = norm(sub([0, -1, 0], scale(accel, 0.035)));
  const collide = body;
  const gradient = (p) => { const e = 1e-3; return norm([sdf(collide, add(p, [e, 0, 0])) - sdf(collide, sub(p, [e, 0, 0])), sdf(collide, add(p, [0, e, 0])) - sdf(collide, sub(p, [0, e, 0])), sdf(collide, add(p, [0, 0, e])) - sdf(collide, sub(p, [0, 0, e]))]); };
  const locks = [];
  // centre outward on both sides: the blend is order-dependent, so both sides must share one order
  const ordered = [...D.locks].sort((a, b) => Math.abs(a.root[0]) - Math.abs(b.root[0]) || (a.root[0] < b.root[0] ? -1 : 1));
  for (const L of ordered) {
    const pts = [toW(L.root)], rs = [L.r0];
    let d = apply(F, L.dir);
    const step = L.len / L.segs;
    for (let i = 1; i <= L.segs; i++) {
      // stiff at the root, giving way to gravity toward the tip
      const give = Math.pow(i / L.segs, 1.2) * (1 - L.stiff) * 1.6;
      d = norm(add(add(scale(d, 1 - Math.min(0.9, give)), scale(grav, Math.min(0.9, give))), apply(F, L.curl)));
      let p = add(pts[i - 1], scale(d, step));
      const r = Math.max(0.016, L.r0 * Math.pow(1 - i / L.segs, L.taper));      // tips end in a wedge, not a thread thinner than the ink
      // off the body: at least the lock's radius and a gap from the skin
      for (let k = 0; k < 4; k++) {
        const dist = sdf(collide, p), need = r * L.flat + 0.015;
        if (dist >= need) break;
        p = add(p, scale(gradient(p), need - dist));
      }
      d = norm(sub(p, pts[i - 1]));
      pts.push(p); rs.push(r);
      // blunt cuts: stop where the lock crosses its cut height (head frame)
      if (L.cutY !== undefined) {
        const ly = dot(sub(p, O), F.y);
        if (ly <= L.cutY) {
          const ly0 = dot(sub(pts[i - 1], O), F.y);
          const f = (ly0 - L.cutY) / Math.max(1e-6, ly0 - ly);
          pts[i] = lerp3(pts[i - 1], p, f);
          rs[i] = L.taper > 1 ? 0.016 : rs[i];
          break;
        }
      }
    }
    locks.push({ ...L, pts, rs });
    const side = Math.abs(L.root[0]) < 1e-3 ? 0 : Math.sign(L.root[0]);
    // only the root blends: a smooth union bulges at every joint
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1], k = i === 0 ? L.k : 0, name = `${L.name}_${i}`;
      if (L.flat >= 1 || !ribbon) { prims.push({ ...cone(L.group, a, b, rs[i], rs[i + 1], k, name), side }); continue; }
      // flat to the head: across the lock, facing away from the head's centre
      const ax = norm(sub(b, a)), rel = sub(lerp3(a, b, 0.5), O);
      let n = sub(rel, scale(ax, dot(rel, ax)));
      n = len(n) > 1e-6 ? norm(n) : F.z;
      prims.push({ ...ribbon(L.group, a, b, rs[i], rs[i + 1], n, L.flat, k, name), side });
    }
  }
  // long hair is a sheet, not strands: flattened ellipsoids along the middle back lock,
  // wide at the nape and narrowing to the ends, behind the locks that give it its clumps
  const mid = locks.find((l) => l.name === 'back4');
  if (mid && mid.group === 'hair_back') {
    for (let i = 0; i < mid.pts.length - 1; i++) {
      const a = mid.pts[i], b = mid.pts[i + 1], f = i / (mid.pts.length - 1);
      const along = norm(sub(b, a)), out = norm(sub(sub(a, O), scale(along, dot(sub(a, O), along))));
      const across = norm(cross(along, out));
      const Fs = { x: across, y: along, z: norm(cross(across, along)) };
      prims.push({ ...ellipsoid('hair_back', add(lerp3(a, b, 0.5), scale(Fs.z, -0.03)), Fs, [0.42 * (1 - 0.55 * f) * (m.head.width / 0.8), len(sub(b, a)) * 0.62, 0.06], i === 0 ? 0.06 : 0.12, `sheet${i}`), side: 0 });
    }
  }
  for (const t of D.ties || []) prims.push({ ...ellipsoid(t.group, toW(t.at), F, [t.r, t.r, t.r], 0.02, `${t.group}_tie`), side: 0 });
  for (const [i, b] of (D.buns || []).entries()) prims.push({ ...ellipsoid('hair', toW(b.at), F, [b.r, b.r * 0.9, b.r], 0.05, `bun${i}`), side: Math.abs(b.at[0]) < 1e-3 ? 0 : Math.sign(b.at[0]) });
  return { prims, locks, design: D };
}

export function hairColors(hair = {}) {
  const [base, shade] = COLORS[hair.color || 'black'] || COLORS.black;
  return { base, shade };
}

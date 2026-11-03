/* TENTACLE's dynamics, no DOM: the arm with mass, in water, in d dimensions (3 or 4).

   rod.js says what shape the muscles ask for; this says what the arm actually does. The arm is a chain of nodes with
   mass (flesh, ρ ≈ 1050, plus the water it drags along with it), stepped by position-based dynamics:
     MUSCLE   each window of 5 nodes is pulled toward the shape the muscles ask for there, rotated to fit wherever the
              window now is (shape matching). How hard it pulls is the muscle's TONE: a hydrostat is only as stiff as
              its muscles are tense, so a limp arm is a rope and a tense one a rod. The best-fit rotation is found by
              iterating toward it from last step's (Müller's method, written for d dimensions: the antisymmetric part
              of A Rᵀ is the torque in every plane at once).
     LENGTH   each segment keeps the length the muscles ask for.
     WATER    drag per node, quadratic, split along the arm and across it: across is ~20× stronger, which is how a
              stroke pushes. Applied implicitly (v /= 1 + h k |v| / r), so it can slow the arm but never reverse it.
     CONTACT  the arm can't pass through itself: segment against segment, in d dimensions (the closest points of two
              segments, pushed apart to the sum of their radii). This is what holds a knot in 3D. In 4D the same
              contacts have a fourth direction to push along, and a knot slides out through it.
   What the water does to the arm, the arm does to whatever holds its root: body force = drag on the arm − d(momentum
   of the arm)/dt. */
const sub = (a, b) => a.map((v, i) => v - b[i]), dotv = (a, b) => { let s = 0; for (let i = 0; i < a.length; i++) s += a[i] * b[i]; return s; };
const norm = (a) => Math.sqrt(dotv(a, a));

export const RHO = 1050, CA = 1.0; // flesh density; added-mass coefficient (the water a moving cylinder carries)
/* mass of a node: its share of the arm's length × the volume of a (d − 1)-ball cross-section × density */
export const crossVol = (d, r) => (d === 3 ? Math.PI * r * r : (4 / 3) * Math.PI * r ** 3);

/* the smallest rotation taking unit a to unit b, applied to v: (I + K + K²/(1 + a·b)) v, K = b aᵀ − a bᵀ */
export function turn(a, b, v) {
  const c = dotv(a, b), av = dotv(a, v), bv = dotv(b, v);
  if (c < -0.999) return v.slice();
  // K v = b (a·v) − a (b·v); K² v = K(K v) = b (a·Kv) − a (b·Kv), a·Kv = c av − bv, b·Kv = av − c bv
  const akv = c * av - bv, bkv = av - c * bv;
  return v.map((x, i) => x + (b[i] * av - a[i] * bv) + (b[i] * akv - a[i] * bkv) / (1 + c));
}

/* closest points of segments [p1, q1] and [p2, q2] (Ericson), any dimension: { s, t, dist, n (from 2 to 1) } */
export function segSeg(p1, q1, p2, q2) {
  const d1 = sub(q1, p1), d2 = sub(q2, p2), r = sub(p1, p2), a = dotv(d1, d1), e = dotv(d2, d2), f = dotv(d2, r);
  let s, t; const c = dotv(d1, r), b = dotv(d1, d2), den = a * e - b * b;
  s = den > 1e-14 ? Math.min(1, Math.max(0, (b * f - c * e) / den)) : 0;
  t = (b * s + f) / e;
  if (t < 0) { t = 0; s = Math.min(1, Math.max(0, -c / a)); } else if (t > 1) { t = 1; s = Math.min(1, Math.max(0, (b - c) / a)); }
  const n = p1.map((v, i) => v + d1[i] * s - p2[i] - d2[i] * t);
  return { s, t, dist: norm(n), n };
}

/* a rod: nodes x (positions), radii r, rest lengths L (one per segment). opts.pinned: indices that don't move by
   dynamics. opts.stride: shape-match every stride-th window only (2 halves the cost; with windows 5 wide every node is
   still in two). opts.chains: the lengths of several arms laid end to end in one rod (an octopus: 8 × 65 nodes), so one
   solve moves them all and they can touch one another; nothing joins the last node of one to the first of the next
   (its L is 0). opts.noContact: nodes whose segments touch nothing (arms' roots, crowded together at the body) */
export function makeRod(d, xs, rs, opts = {}) {
  const N = xs.length, cs = new Int32Array(N), ce = new Int32Array(N); let at = 0;
  for (const n of opts.chains || [N]) { for (let i = at; i < at + n; i++) { cs[i] = at; ce[i] = at + n - 1; } at += n; }
  const L = xs.slice(1).map((x, i) => (i === ce[i] ? 0 : norm(sub(x, xs[i]))));
  const m = xs.map((_, i) => { const l = ((L[i - 1] || 0) + (L[i] || 0)) / 2; return (RHO + CA * 1000) * crossVol(d, rs[i]) * l; });
  return {
    d, N, x: xs.map((v) => v.slice()), v: xs.map(() => new Array(d).fill(0)), r: rs.slice(), L, m, pinned: new Set(opts.pinned || []),
    cs, ce, noContact: new Set(opts.noContact || []), stride: opts.stride || 1,
    R: xs.map(() => { const R = new Float64Array(d * d); for (let i = 0; i < d; i++) R[i * d + i] = 1; return R; }), hw: opts.hw ?? 2, t: 0, body: new Array(d).fill(0), water: new Array(d).fill(0), mom: new Array(d).fill(0),
  };
}
const momentum = (rod) => { const P = new Array(rod.d).fill(0); for (let i = 0; i < rod.N; i++) if (!rod.pinned.has(i)) for (let c = 0; c < rod.d; c++) P[c] += rod.m[i] * rod.v[i][c]; return P; };

/* one step of dt. o:
     q      target positions (the shape the muscles ask for), or null for a rope with no rest shape
     L      target segment lengths (default: the rod's own)
     tone   0…1, per node (array) or for all: the muscle's tension, which sets how hard each window pulls to its shape
     pins   { i: position } for pinned nodes (the root, held by the body)
     force  { i: force vector } applied to free nodes (newtons: pulling a rope's ends)
     g      acceleration (buoyancy-corrected gravity) for every free node
     bMax   how hard a fully tense arm holds its whole shape (per substep), beyond each window's
     kn, kt the drag coefficients across and along (accel = k |v| v / r)
     solids  [{ a, b, ra, rb }]: round cones the arm can't enter (an octopus's head and mantle), nodes pushed out
     collide  self-contact on/off; sub substeps; iters constraint passes per substep */
export function step(rod, dt, o) {
  const { d, N, x, v, r, m } = rod, sub_ = o.sub ?? 10, h = dt / sub_, iters = o.iters ?? 2, kn = o.kn ?? 0.2, kt = o.kt ?? 0.01;
  const L = o.L || rod.L, tone = typeof o.tone === "number" ? new Array(N).fill(o.tone) : o.tone || new Array(N).fill(0.5);
  const alpha = tone.map((t) => (o.aMin ?? 0.004) + ((o.aMax ?? 0.12) - (o.aMin ?? 0.004)) * Math.max(0, Math.min(1, t)));
  const P0 = momentum(rod), water = new Array(d).fill(0);
  for (let s = 0; s < sub_; s++) {
    const p = x.map((xi) => xi.slice());
    for (let i = 0; i < N; i++) {
      if (rod.pinned.has(i)) { v[i].fill(0); continue; }
      const vi = v[i], f = o.force && o.force[i];
      for (let c = 0; c < d; c++) vi[c] += h * ((o.g ? o.g[c] : 0) + (f ? f[c] / m[i] : 0));
      // drag: split the velocity along the arm (T) and across, each slowed implicitly
      const a = x[Math.max(rod.cs[i], i - 1)], b = x[Math.min(rod.ce[i], i + 1)], T = sub(b, a), tl = norm(T) || 1;
      for (let c = 0; c < d; c++) T[c] /= tl;
      const vt = dotv(vi, T), vn = vi.map((u, c) => u - vt * T[c]), vnm = norm(vn), before = vi.slice();
      const ft = 1 / (1 + (h * kt * Math.abs(vt)) / r[i]), fn = 1 / (1 + (h * kn * vnm) / r[i]);
      for (let c = 0; c < d; c++) { vi[c] = vt * ft * T[c] + vn[c] * fn; water[c] += (m[i] * (vi[c] - before[c])) / dt; }
      for (let c = 0; c < d; c++) p[i][c] = x[i][c] + h * vi[c];
    }
    if (o.pins) for (const i in o.pins) p[i] = o.pins[i].slice();
    for (let it = 0; it < iters; it++) {
      // LENGTH
      for (let i = 0; i + 1 < N; i++) {
        if (i === rod.ce[i]) continue;
        const wa = rod.pinned.has(i) ? 0 : 1 / m[i], wb = rod.pinned.has(i + 1) ? 0 : 1 / m[i + 1]; if (!(wa + wb)) continue;
        const e = sub(p[i + 1], p[i]), l = norm(e) || 1e-9, k = (l - L[i]) / (l * (wa + wb));
        for (let c = 0; c < d; c++) { p[i][c] += wa * k * e[c]; p[i + 1][c] -= wb * k * e[c]; }
      }
      // MUSCLE: shape matching, windows of 2·hw + 1 nodes
      if (o.q) shapeMatch(rod, p, o.q, alpha);
      // HOLD: a tense arm also holds its whole shape relative to the body, not just each window's (without this the
      // long, slow modes are as soft as a rope's and it sags); a pull toward the target place, as strong as the tone
      if (o.q && o.bMax) for (let i = 0; i < N; i++) if (!rod.pinned.has(i)) { const b = o.bMax * tone[i]; for (let c = 0; c < d; c++) p[i][c] += b * (o.q[i][c] - p[i][c]); }
      if (o.collide && s % (o.contactEvery || 1) === 0) collide(rod, p);
      if (o.solids) solids(rod, p, o.solids);
      if (o.pins) for (const i in o.pins) p[i] = o.pins[i].slice();
    }
    for (let i = 0; i < N; i++) { for (let c = 0; c < d; c++) v[i][c] = rod.pinned.has(i) ? 0 : (p[i][c] - x[i][c]) / h; x[i] = p[i]; }
  }
  // what the water did to the arm (averaged over the step), and so what the arm does to the body
  const P1 = momentum(rod); for (let c = 0; c < d; c++) water[c] /= sub_;
  rod.water = water; rod.body = water.map((wv, c) => wv - (P1[c] - P0[c]) / dt); rod.t += dt;
  return rod;
}

/* MUSCLE: each window of 2·hw + 1 nodes pulled toward the target shape there, rotated to fit (its rotation refined one
   Müller step from last time's: M = A Rᵀ, W = (M − Mᵀ)/|tr M|, R ← (I + W + W²/2) R, re-orthonormalised). Flat
   arrays, no allocation: this is the hot loop. */
const WS = { G: null, cnt: null };
function shapeMatch(rod, p, q, alpha) {
  const { d, N } = rod, hw = rod.hw;
  if (!WS.G || WS.G.length !== N * d) { WS.G = new Float64Array(N * d); WS.cnt = new Float64Array(N); }
  const G = WS.G, cnt = WS.cnt; G.fill(0); cnt.fill(0);
  const pc = new Float64Array(d), qc = new Float64Array(d), A = new Float64Array(d * d), M = new Float64Array(d * d), W = new Float64Array(d * d), S = new Float64Array(d * d), Rn = new Float64Array(d * d);
  for (let w = 0; w < N; w += rod.stride) {
    const i0 = Math.max(rod.cs[w], w - hw), i1 = Math.min(rod.ce[w], w + hw), n = i1 - i0 + 1; pc.fill(0); qc.fill(0); A.fill(0);
    for (let i = i0; i <= i1; i++) for (let c = 0; c < d; c++) { pc[c] += p[i][c] / n; qc[c] += q[i][c] / n; }
    for (let i = i0; i <= i1; i++) for (let a = 0; a < d; a++) { const pa = p[i][a] - pc[a]; for (let b = 0; b < d; b++) A[a * d + b] += pa * (q[i][b] - qc[b]); }
    const R = rod.R[w]; let tr = 0;
    for (let i = 0; i < d; i++) for (let j = 0; j < d; j++) { let v = 0; for (let k = 0; k < d; k++) v += A[i * d + k] * R[j * d + k]; M[i * d + j] = v; if (i === j) tr += v; }
    let mag = 0; for (let i = 0; i < d; i++) for (let j = 0; j < d; j++) { const v = (M[i * d + j] - M[j * d + i]) / (Math.abs(tr) + 1e-12); W[i * d + j] = v; mag = Math.max(mag, Math.abs(v)); }
    if (mag > 1e-10) {
      if (mag > 0.5) for (let k = 0; k < d * d; k++) W[k] *= 0.5 / mag; // a big turn is taken in steps
      // S = I + W + W²/2
      for (let i = 0; i < d; i++) for (let j = 0; j < d; j++) { let v = 0; for (let k = 0; k < d; k++) v += W[i * d + k] * W[k * d + j]; S[i * d + j] = (i === j ? 1 : 0) + W[i * d + j] + v / 2; }
      for (let i = 0; i < d; i++) for (let j = 0; j < d; j++) { let v = 0; for (let k = 0; k < d; k++) v += S[i * d + k] * R[k * d + j]; Rn[i * d + j] = v; }
      // Gram–Schmidt on the rows
      for (let i = 0; i < d; i++) { for (let j = 0; j < i; j++) { let pr = 0; for (let k = 0; k < d; k++) pr += Rn[i * d + k] * Rn[j * d + k]; for (let k = 0; k < d; k++) Rn[i * d + k] -= pr * Rn[j * d + k]; } let m2 = 0; for (let k = 0; k < d; k++) m2 += Rn[i * d + k] ** 2; m2 = Math.sqrt(m2); for (let k = 0; k < d; k++) Rn[i * d + k] /= m2; }
      R.set(Rn);
    }
    for (let i = i0; i <= i1; i++) { for (let a = 0; a < d; a++) { let v = pc[a]; for (let b = 0; b < d; b++) v += R[a * d + b] * (q[i][b] - qc[b]); G[i * d + a] += v; } cnt[i]++; }
  }
  for (let i = 0; i < N; i++) if (!rod.pinned.has(i)) for (let c = 0; c < d; c++) p[i][c] += alpha[i] * (G[i * d + c] / cnt[i] - p[i][c]);
}

/* solid round cones (a body): any node inside one is pushed out along the cone's normal, its radius added */
function solids(rod, p, list) {
  const d = rod.d;
  for (let i = 0; i < rod.N; i++) {
    if (rod.pinned.has(i) || rod.noContact.has(i)) continue;
    const x = p[i];
    for (const { a, b, ra, rb } of list) {
      let ab2 = 0, apab = 0; for (let c = 0; c < d; c++) { const e = (b[c] || 0) - (a[c] || 0); ab2 += e * e; apab += (x[c] - (a[c] || 0)) * e; }
      const h = ab2 > 0 ? Math.min(1, Math.max(0, apab / ab2)) : 0; let dist = 0; const n = new Array(d);
      for (let c = 0; c < d; c++) { n[c] = x[c] - (a[c] || 0) - ((b[c] || 0) - (a[c] || 0)) * h; dist += n[c] * n[c]; } dist = Math.sqrt(dist);
      const R = ra + (rb - ra) * h + rod.r[i]; if (dist >= R || dist < 1e-9) continue;
      for (let c = 0; c < d; c++) x[c] += (n[c] / dist) * (R - dist);
    }
  }
}

/* self-contact: every pair of segments far enough apart along the arm that they aren't neighbours, pushed apart to the
   sum of their radii. Groups of 8 segments with bounding balls skip the far pairs. */
function collide(rod, p) {
  const { N, r, m } = rod, G = 8, ng = Math.ceil((N - 1) / G), balls = [];
  for (let g = 0; g < ng; g++) {
    const i0 = g * G, i1 = Math.min(N - 1, i0 + G), c = p[Math.min(N - 1, i0 + (G >> 1))]; let rad = 0, rm = 0;
    for (let i = i0; i <= i1; i++) { rad = Math.max(rad, norm(sub(p[i], c))); rm = Math.max(rm, r[i]); }
    balls.push({ c, rad: rad + rm, i0, i1 });
  }
  const arc = [0]; for (let i = 1; i < N; i++) arc.push(arc[i - 1] + rod.L[i - 1]);
  const im = new Float64Array(N); for (let i = 0; i < N; i++) im[i] = rod.pinned.has(i) ? 0 : 1 / m[i];
  // which segments can touch anything (not the gap between two arms, not a crowded root)
  if (!rod.live) { rod.live = new Uint8Array(N); for (let i = 0; i + 1 < N; i++) rod.live[i] = i !== rod.ce[i] && !rod.noContact.has(i) ? 1 : 0; }
  const live = rod.live;
  const d = rod.d, d1 = new Float64Array(d), d2 = new Float64Array(d), rv = new Float64Array(d), nv = new Float64Array(d);
  for (let ga = 0; ga < ng; ga++) for (let gb = ga; gb < ng; gb++) {
    const A = balls[ga], B = balls[gb]; if (ga !== gb) { let q = 0; for (let c = 0; c < d; c++) q += (A.c[c] - B.c[c]) ** 2; if (q > (A.rad + B.rad) ** 2) continue; }
    for (let i = A.i0; i < A.i1; i++) for (let j = Math.max(B.i0, ga === gb ? i + 1 : 0); j < B.i1; j++) {
      if (!live[i] || !live[j]) continue;
      const rr0 = Math.max(r[i], r[i + 1]) + Math.max(r[j], r[j + 1]);
      // neighbours along the same arm are meant to touch
      if (rod.cs[i] === rod.cs[j] && Math.abs(arc[j] - arc[i]) < 1.7 * rr0 + rod.L[i]) continue;
      // the closest points of the two segments (segSeg, unrolled: this is the inner loop)
      const P1 = p[i], Q1 = p[i + 1], P2 = p[j], Q2 = p[j + 1];
      let a = 0, e = 0, f = 0, cc = 0, bb = 0, quick = 0;
      for (let c = 0; c < d; c++) { d1[c] = Q1[c] - P1[c]; d2[c] = Q2[c] - P2[c]; rv[c] = P1[c] - P2[c]; a += d1[c] * d1[c]; e += d2[c] * d2[c]; f += d2[c] * rv[c]; cc += d1[c] * rv[c]; bb += d1[c] * d2[c]; quick += rv[c] * rv[c]; }
      const reach = Math.sqrt(a) + Math.sqrt(e) + rr0; if (quick > reach * reach) continue;
      const den = a * e - bb * bb; let s = den > 1e-14 ? Math.min(1, Math.max(0, (bb * f - cc * e) / den)) : 0, t = (bb * s + f) / e;
      if (t < 0) { t = 0; s = Math.min(1, Math.max(0, -cc / a)); } else if (t > 1) { t = 1; s = Math.min(1, Math.max(0, (bb - cc) / a)); }
      let dist = 0; for (let c = 0; c < d; c++) { nv[c] = rv[c] + d1[c] * s - d2[c] * t; dist += nv[c] * nv[c]; } dist = Math.sqrt(dist);
      const rr = r[i] + (r[i + 1] - r[i]) * s + r[j] + (r[j + 1] - r[j]) * t;
      if (dist >= rr || dist < 1e-9) continue;
      const w0 = 1 - s, w1 = s, w2 = 1 - t, w3 = t, den2 = w0 * w0 * im[i] + w1 * w1 * im[i + 1] + w2 * w2 * im[j] + w3 * w3 * im[j + 1]; if (!den2) continue;
      const lam = (rr - dist) / (den2 * dist);
      for (let c = 0; c < d; c++) { const k = lam * nv[c]; P1[c] += im[i] * w0 * k; Q1[c] += im[i + 1] * w1 * k; P2[c] -= im[j] * w2 * k; Q2[c] -= im[j + 1] * w3 * k; }
    }
  }
}

/* the frames the arm actually has: each node's window rotation applied to the frame the muscles asked for, then turned
   the least amount onto the arm's true tangent (so the twist the muscles made rides along) */
export function framesOf(rod, F0) {
  const { x, N, d } = rod, out = new Array(N), a = new Array(d), b = new Array(d);
  for (let i = 0; i < N; i++) {
    const Rf = rod.R[i - (i % rod.stride)], F = new Array(d), xa = x[Math.max(rod.cs[i], i - 1)], xb = x[Math.min(rod.ce[i], i + 1)];
    for (let r = 0; r < d; r++) { const row = F0[i][r], v = new Array(d); for (let c = 0; c < d; c++) { let s = 0; for (let k = 0; k < d; k++) s += Rf[c * d + k] * row[k]; v[c] = s; } F[r] = v; }
    let tl = 0, al = 0; for (let c = 0; c < d; c++) { b[c] = xb[c] - xa[c]; tl += b[c] * b[c]; al += F[0][c] * F[0][c]; } tl = Math.sqrt(tl) || 1; al = Math.sqrt(al) || 1;
    for (let c = 0; c < d; c++) { b[c] /= tl; a[c] = F[0][c] / al; }
    out[i] = F.map((row) => turn(a, b, row));
  }
  return out;
}
/* frames by parallel transport alone (a rope with no muscle frame): start from any frame at node 0, turn it along */
export function transportFrames(x, F0) {
  const N = x.length, out = []; let F = F0.map((r) => r.slice()), prevT = F[0];
  for (let i = 0; i < N; i++) {
    const T = sub(x[Math.min(N - 1, i + 1)], x[Math.max(0, i - 1)]), tl = norm(T) || 1, b = T.map((u) => u / tl);
    F = F.map((row) => turn(prevT, b, row)); F[0] = b;
    for (let k = 1; k < F.length; k++) { for (let j = 0; j < k; j++) { const pr = dotv(F[k], F[j]); F[k] = F[k].map((u, c) => u - pr * F[j][c]); } const mm = norm(F[k]); F[k] = F[k].map((u) => u / mm); }
    out.push(F.map((r) => r.slice())); prevT = b;
  }
  return out;
}

/* THE KNOT: an overhand knot tied in a uniform rope of radius r, centred on the origin, its ends on the x axis.
   The knotted part is the trefoil (sin t + 2 sin 2t, cos t − 2 cos 2t, −sin 3t) opened at its outer lobe, scaled so
   its strands sit 2.2 radii apart; the tails leave the outer lobe straight outward, side by side. Pulling the ends
   apart along ±x (the line between them) swings them round and draws the knot tight.
   In 4D the rope gets a small wobble in w (a real rope is never exactly in a 3-space; without it nothing could push
   it out of one). */
export function knotRope(d, N, r, tail = 1.3, wob = 0.15) {
  const tf = (t) => [Math.sin(t) + 2 * Math.sin(2 * t), Math.cos(t) - 2 * Math.cos(2 * t), -Math.sin(3 * t)];
  const tb = Math.PI / 3, gap = 0.3, sc = (2.2 * r) / 1.2143, M = 2000, pts = [];
  const t0 = tb + gap, t1 = tb + 2 * Math.PI - gap, A = tf(t0).map((q) => q * sc), B = tf(t1).map((q) => q * sc), u = [Math.cos(Math.PI / 6), Math.sin(Math.PI / 6), 0];
  // both tails leave the lobe straight outward (nothing of the knot lies out there), side by side, 4 radii apart
  for (let i = 40; i >= 1; i--) { const l = (tail * i) / 40; pts.push(A.map((q, c) => q + u[c] * l)); }
  for (let i = 0; i <= M; i++) pts.push(tf(t0 + ((t1 - t0) * i) / M).map((q) => q * sc));
  for (let i = 1; i <= 40; i++) { const l = (tail * i) / 40; pts.push(B.map((q, c) => q + u[c] * l)); }
  // resample to N nodes evenly by arc length
  const arc = [0]; for (let i = 1; i < pts.length; i++) arc.push(arc[i - 1] + norm(sub(pts[i], pts[i - 1])));
  const total = arc[arc.length - 1], out = []; let j = 0;
  for (let k = 0; k < N; k++) { const s = (total * k) / (N - 1); while (j < pts.length - 2 && arc[j + 1] < s) j++; const f = (s - arc[j]) / (arc[j + 1] - arc[j] || 1); out.push(pts[j].map((q, c) => q + (pts[j + 1][c] - q) * f)); }
  // turn it so the tails run along ±x, and centre it
  const e = sub(out[N - 1], out[0]), el = norm(e), ex = e.map((q) => q / el), ang = Math.atan2(ex[1], ex[0]), cs = Math.cos(-ang), sn = Math.sin(-ang);
  const c0 = out.reduce((s, q) => s.map((u, c) => u + q[c] / N), [0, 0, 0]);
  return out.map((q, k) => { const u = sub(q, c0), xy = [u[0] * cs - u[1] * sn, u[0] * sn + u[1] * cs, u[2]]; return d === 3 ? xy : [...xy, wob * r * Math.sin((7 * Math.PI * k) / (N - 1)) + 0.5 * wob * r * Math.sin((17 * Math.PI * k) / (N - 1))]; });
}
/* the knot as the page runs it: a rope of 117 nodes, 7 cm in radius (5.9 m long), tied and left to settle, then its
   ends pulled apart along x, the pull rising to 16 N over 3 s. A rope's muscle is slack (tone 0.1: it bends easily
   but isn't a string). The selftest runs exactly this. */
export const KNOT = { N: 117, r: 0.07, pull: 16, ramp: 3, wait: 1.2 };
export function newKnot(d) {
  const xs = knotRope(d, KNOT.N, KNOT.r), rod = makeRod(d, xs, new Array(KNOT.N).fill(KNOT.r)), ex = new Array(d).fill(0); ex[0] = rod.L[0];
  return { d, rod, straight: xs.map((_, i) => ex.map((v) => v * i)), t: 0, pulling: true, total: rod.L.reduce((a, b) => a + b, 0), gap: 1, frame: 0 };
}
export function stepKnot(k, dt) {
  const { d, rod } = k, N = rod.N; k.t += dt;
  const F = k.pulling ? KNOT.pull * Math.max(0, Math.min(1, (k.t - KNOT.wait) / KNOT.ramp)) : 0, ex = new Array(d).fill(0); ex[0] = F;
  step(rod, dt, { q: k.straight, tone: 0.1, aMin: 0.002, aMax: 0.02, force: { 0: ex.map((v) => -v), [N - 1]: ex }, collide: true, sub: 8, iters: 2 });
  if (++k.frame % 10 === 0) k.gap = minGap(rod);
  return k;
}
/* the knot's measures: how far apart its ends are, as a fraction of its length (a knot eats length: an untied rope
   pulled straight reaches 1), and how close its strands come to passing through each other (as a fraction of 2r) */
export function span(rod) { const tot = rod.L.reduce((a, b) => a + b, 0); return norm(sub(rod.x[rod.N - 1], rod.x[0])) / tot; }
export function minGap(rod) {
  let g = Infinity; const arc = [0]; for (let i = 1; i < rod.N; i++) arc.push(arc[i - 1] + rod.L[i - 1]);
  for (let i = 0; i + 1 < rod.N; i++) for (let j = i + 1; j + 1 < rod.N; j++) { const rr = rod.r[i] + rod.r[j]; if (arc[j] - arc[i] < 1.7 * rr + rod.L[i]) continue; g = Math.min(g, segSeg(rod.x[i], rod.x[i + 1], rod.x[j], rod.x[j + 1]).dist / rr); }
  return g;
}

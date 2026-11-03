/* TENTACLE's arm, no DOM: a muscular hydrostat in d dimensions (3: ours, for calibration; 4: kata's).

   THE ROD is a discrete Cosserat rod: a centreline, and a frame riding along it, [T (along), e_1 … e_{d−1} (across)].
   Each segment carries strains, in its own frame:
     bend b ∈ R^{d−1}     how fast T turns toward each direction across (2 in 3D, 3 in 4D)
     twist τ              how fast the across-directions turn among themselves, one rate per plane across
                          (1 in 3D: (e1,e2); 3 in 4D: (e1,e2), (e1,e3), (e2,e3))
     stretch λ            length per unit rest length
   so 4 strains a segment in 3D, 7 in 4D. The frame is carried segment to segment by the exact rotation exp(Ω ds) of
   those strains; the centreline steps along the frame's mid-segment tangent.

   THE MUSCLES (how arms without bones move):
     longitudinal fibres run along the arm all round its skin: round a circle in 3D, over a 2-sphere in 4D. Contracting
       one side bends the arm toward it (the activation's dipole: b = κ_max · ⟨a n⟩ (d−1)); contracting all round
       shortens it (its mean);
     transverse fibres squeeze it thinner, and at constant volume thinner is longer: the cross-section is a ball of
       dimension d − 1, so radius r and stretch λ keep r^{d−1} λ fixed;
     helical fibres wrap round it, left- or right-handed, one pair per plane across, and twist it. A twisting fibre
       field in plane (i, j) moves the skin point n as n_i e_j − n_j e_i, which vanishes where n_i = n_j = 0: never on
       a circle (3D), but at two poles on a 2-sphere (4D: the hairy ball theorem), so each 4D twist muscle has two bald
       lines down the arm where it can't twist. */
export const SEG = 64, LEN = 2.0, R0 = 0.13, RTIP = 0.025, KMAX = 3.5, TMAX = 6;
const dot = (a, b) => a.reduce((s, x, i) => s + x * b[i], 0);
export const planes = (d) => (d === 3 ? [[1, 2]] : [[1, 2], [1, 3], [2, 3]]); // twist planes, as indices into the frame (0 is T)

/* the exact exponential of a small antisymmetric matrix (scaling and squaring of the Taylor series) */
export function expm(A) {
  const n = A.length, nrm = Math.max(...A.map((r) => r.reduce((s, x) => s + Math.abs(x), 0))), k = Math.max(0, Math.ceil(Math.log2(nrm * 4 + 1e-30)) + 1), sc = 2 ** -k;
  const I = () => A.map((_, i) => A.map((_, j) => (i === j ? 1 : 0))), mul = (X, Y) => X.map((r, i) => Y[0].map((_, j) => r.reduce((s, x, m) => s + x * Y[m][j], 0)));
  const B = A.map((r) => r.map((x) => x * sc)); let E = I(), term = I();
  for (let m = 1; m <= 12; m++) { term = mul(term, B).map((r) => r.map((x) => x / m)); E = E.map((r, i) => r.map((x, j) => x + term[i][j])); }
  for (let i = 0; i < k; i++) E = mul(E, E);
  return E;
}
/* the generator of a segment's strains, in its own frame: column j of the frame changes by Σ_i Ω_ij column i */
function generator(d, b, tw) {
  const O = Array.from({ length: d }, () => new Array(d).fill(0));
  for (let i = 1; i < d; i++) { O[i][0] = b[i - 1]; O[0][i] = -b[i - 1]; } // T turns toward e_i at b_i
  planes(d).forEach(([i, j], k) => { O[j][i] = tw[k]; O[i][j] = -tw[k]; }); // e_i turns toward e_j at τ_k
  return O;
}
/* build the arm: strains for each segment → nodes { x, F (frame rows: T, e1…), r } (SEG + 1 of them). The base sits at
   the origin, T up (+y), e1 = x, e2 = z, e3 = w */
export function build(d, strains) {
  const ds = LEN / SEG, base = d === 3 ? [[0, 1, 0], [1, 0, 0], [0, 0, 1]] : [[0, 1, 0, 0], [1, 0, 0, 0], [0, 0, 1, 0], [0, 0, 0, 1]];
  let F = base.map((r) => r.slice()), x = new Array(d).fill(0); const nodes = [{ x: x.slice(), F: F.map((r) => r.slice()), r: R0 }];
  for (let k = 0; k < SEG; k++) {
    const s = strains[k], L = ds * s.stretch, O = generator(d, s.bend, s.twist);
    // the frame's columns, as rows of F: F' = expm(Ω L)ᵀ F applied in the body frame: new e_j = Σ_i E_ij e_i
    const half = expm(O.map((r) => r.map((v) => (v * L) / 2))), full = expm(O.map((r) => r.map((v) => v * L)));
    const along = (E) => E.map((_, j) => F.reduce((acc, row, i) => acc.map((a, c) => a + E[i][j] * row[c]), new Array(d).fill(0)));
    const Fm = along(half); x = x.map((v, c) => v + L * Fm[0][c]); F = along(full);
    // keep it orthonormal (Gram–Schmidt): the exponential already is, to rounding
    for (let i = 0; i < d; i++) { for (let j = 0; j < i; j++) { const p = dot(F[i], F[j]); F[i] = F[i].map((v, c) => v - p * F[j][c]); } const m = Math.hypot(...F[i]); F[i] = F[i].map((v) => v / m); }
    const taper = R0 + (RTIP - R0) * ((k + 1) / SEG);
    nodes.push({ x: x.slice(), F: F.map((r) => r.slice()), r: taper * s.stretch ** (-1 / (d - 1)), s: (k + 1) / SEG });
  }
  nodes[0].s = 0; return nodes;
}

/* THE MUSCLES → strains. A muscle state, per segment: long(n) the longitudinal activation as a function of the skin
   direction n (a unit (d−1)-vector across), trans the transverse activation, helix[k] the twist activation in plane k
   (−1 … 1: left- or right-handed). The fibres are sampled round the skin with quadrature weights: a ring of 16 in 3D;
   in 4D Lebedev's 26 points on the sphere (the 6 axes, 12 edges, 8 corners of a cube, weights 1/21, 4/105, 9/280),
   which integrate every polynomial up to degree 7 exactly and are symmetric under every reflection, so a one-sided
   contraction bends the arm toward that side and nowhere else */
export function fibres(d) {
  if (d === 3) return Array.from({ length: 16 }, (_, i) => ({ n: [Math.cos((2 * Math.PI * i) / 16), Math.sin((2 * Math.PI * i) / 16)], w: 1 / 16 }));
  const out = [], s2 = Math.SQRT1_2, s3 = 1 / Math.sqrt(3);
  for (let a = 0; a < 3; a++) for (const sg of [1, -1]) { const n = [0, 0, 0]; n[a] = sg; out.push({ n, w: 1 / 21 }); }
  for (let a = 0; a < 3; a++) for (let b = a + 1; b < 3; b++) for (const sa of [1, -1]) for (const sb of [1, -1]) { const n = [0, 0, 0]; n[a] = sa * s2; n[b] = sb * s2; out.push({ n, w: 4 / 105 }); }
  for (const x of [1, -1]) for (const y of [1, -1]) for (const z of [1, -1]) out.push({ n: [x * s3, y * s3, z * s3], w: 9 / 280 });
  return out;
}
export function strainsOf(d, muscle) {
  const fb = fibres(d), out = [];
  for (let k = 0; k < SEG; k++) {
    const s = (k + 0.5) / SEG, m = muscle(s), acts = fb.map((f) => Math.max(0, Math.min(1, m.long ? m.long(f.n) : 0)));
    // the mean (shortening) and the dipole ⟨a n⟩ (d − 1) (bending), by the fibres' weights
    const mean = acts.reduce((a, act, f) => a + act * fb[f].w, 0), dip = fb[0].n.map((_, c) => acts.reduce((a, act, f) => a + act * fb[f].w * fb[f].n[c], 0) * (d - 1));
    const stretch = (1 - 0.35 * mean) * (1 - 0.35 * (m.trans || 0)) ** -(d - 1); // shortened by the longitudinals; lengthened by squeezing (constant volume)
    // a thinner arm bends harder for the same activation (curvature ∝ strain / radius)
    const rr = (R0 + (RTIP - R0) * s) / R0;
    out.push({ bend: dip.map((v) => (v * KMAX) / Math.max(0.35, rr)), twist: planes(d).map((_, j) => TMAX * ((m.helix && m.helix[j]) || 0)), stretch, act: acts, mean, dip });
  }
  return out;
}
/* the twisting fibre field of plane (i, j) at skin direction n (indices into n, 0-based across): how far it moves the skin */
export function twistField(n, i, j) { const v = new Array(n.length).fill(0); v[j] += n[i]; v[i] -= n[j]; return v; }

/* PRESETS: muscle(s, t) for a time t (seconds) */
export const PRESETS = {
  rest: () => () => ({}),
  // a curled arm unrolling from base to tip, as an octopus reaches: the bend point travels out
  reach: (d, t) => { const sb = ((t * 0.35) % 1.4) - 0.2; return (s) => ({ long: (n) => (n[0] > 0 ? n[0] : 0) * 0.9 * smooth((s - sb) / 0.08) }); },
  // waves of contraction running down the arm, their side turning as they go (in 4D, through w as well)
  // (in 4D the contracting side swings between ana and kata along the arm, so it weaves back and forth across w, through
  // your slice and out again, while it also turns in x and z)
  writhe: (d, t) => (s) => { const ph = 7 * s - 2.2 * t, th = 4 * s + 0.9 * t;
    const dir = d === 3 ? [Math.cos(ph), Math.sin(ph)] : (() => { const v = [0.55 * Math.cos(th), 0.55 * Math.sin(th), Math.cos(ph)], m = Math.hypot(...v); return v.map((x) => x / m); })();
    return { long: (n) => Math.max(0, dot(n, dir)) * (d === 3 ? 0.55 + 0.45 * Math.sin(5 * s - 3 * t) : 0.8 + 0.2 * Math.sin(5 * s - 3 * t)) }; },
  // a steady bend with a steady twist: a helix (in 4D, a helix that can also wind into w)
  coil: (d, t) => (s) => ({ long: (n) => Math.max(0, n[0]) * 0.55, helix: d === 3 ? [0.35] : [0.35, 0.25 * Math.sin(0.5 * t), 0] }),
  // pure twist, slowly: watch the skin's stripes spiral (and, in 4D, the bald lines where a twist muscle can't)
  // (in 4D in the plane of e1 and e3, so its bald poles point along e2, a direction your slice shows: blue lines down the
  // arm's sides; a twist in the e1–e2 plane would put them along w, where a slice through the arm never looks)
  twist: (d, t) => (s) => ({ helix: d === 3 ? [0.4 * Math.sin(0.8 * t)] : [0, 0.4 * Math.sin(0.8 * t), 0] }),
  // the strike: squeeze it thin and it shoots out (constant volume), then relax
  strike: (d, t) => { const p = (t * 0.6) % 1, sq = p < 0.2 ? p / 0.2 : p < 0.5 ? 1 : Math.max(0, 1 - (p - 0.5) / 0.3); return (s) => ({ trans: sq * smooth((s - 0.15) / 0.1), long: (n) => (1 - sq) * 0.5 * Math.max(0, n[0]) * smooth((s - 0.6) / 0.1) }); },
  // 4D: curl into w, out of your slice and back
  ana: (d, t) => (s) => ({ long: (n) => Math.max(0, n[d === 3 ? 1 : 2]) * 0.8 * (0.5 + 0.5 * Math.sin(1.1 * t)) * smooth((s - 0.25) / 0.1) }),
};
function smooth(x) { const t = Math.max(0, Math.min(1, x + 0.5)); return t * t * (3 - 2 * t); }

/* where a slice through the arm (the hyperplane through o with normal N, in 4D) cuts it: the runs of nodes within their
   radius of it, each run one piece in your slice */
export function pieces(nodes, o, N) { let n = 0, inside = false; for (const nd of nodes) { const del = Math.abs(dot(nd.x.map((v, i) => v - o[i]), N)), now = del < nd.r; if (now && !inside) n++; inside = now; } return n; }

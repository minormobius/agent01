/* PULL's tensile bench. No DOM.

   A model rope pulled to failure. The rope is a bundle of TRACKS (places in the cross-section), each a chain of unit
   links along the rope. A track is either one continuous filament or short fibres laid end to end (a gap every
   `staple` links, at a random phase). Every link has its own strength (Weibull: weak spots exist) and the same
   stiffness. Neighbouring tracks pass load through friction: an elastic interface that sticks until its shear
   reaches μ × the normal force pressing the two together, then slips at that force. Both ends are held in jaws.

   The rope is stretched in steps. At each step the equilibrium is found (each track's chain solved exactly, the
   interfaces iterated between stick and slip), then any link over its strength is broken, worst first, and the
   equilibrium found again. The force at the jaws is recorded; its peak is the strength.

   What makes one species of rope differ from another is only the PRESS, the normal force per length between two
   neighbours:
     twist   q × (the mean tension of the two + a set). A wrapped fibre presses in proportion to its pull (q is measured
             in TWIST). The set is the tension the yarn was spun and left with: without it a slack yarn has no
             grip to start gripping with, and the rope is two bundles of loose ends. An allowance, not a measurement
     hoop    a constant p (a hoop or sheath at some tightness: a dial, nothing measured)
     trap    c × the sheath's own tension: a sheath laid on the bias, which squeezes as it is pulled (a finger trap).
             For a bias angle θ round thirteen fibres in 4D, c = tan²θ / 9. Whether such a sheath can be made is open
     none    nothing (a 4D yarn twisted round nothing)
   and, for the yarn twisted round a ribbon, that the fibres touch only the ribbon, a continuous track of its own.
   Lengths are in fibre diameters, forces in units of the fibre's stiffness per unit strain. */
export function rng(seed) { let a = seed >>> 0; return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
/* cross-sections: neighbour lists */
export const SECTIONS = {
  /* ours: one fibre and six round it (each of the six touches the middle and its two neighbours) */
  hex7: () => [[1, 2, 3, 4, 5, 6], ...[1, 2, 3, 4, 5, 6].map((k) => [0, ((k + 4) % 6) + 1, (k % 6) + 1])],
  /* 4D: the bundle's cross-section is 3D, where twelve fit round one (and each of the twelve touches four others) */
  fcc13: () => { const P = [[0, 0, 0]]; for (const [a, b] of [[0, 1], [0, 2], [1, 2]]) for (const s of [1, -1]) for (const t of [1, -1]) { const v = [0, 0, 0]; v[a] = s; v[b] = t; P.push(v); } return P.map((p, i) => P.map((q, j) => (i !== j && Math.abs(Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]) - Math.SQRT2) < 1e-6 ? j : -1)).filter((j) => j >= 0)); },
  /* braids. plait3: three strands, each touching both others. may7: a core (track 0) and six braided round it, three
     one way (1–3) and three the other (4–6); each touches the core and the three that cross it */
  plait3: () => [[1, 2], [0, 2], [0, 1]],
  may7: () => [[1, 2, 3, 4, 5, 6], [0, 4, 5, 6], [0, 4, 5, 6], [0, 4, 5, 6], [0, 1, 2, 3], [0, 1, 2, 3], [0, 1, 2, 3]],
  /* six fibres on a ribbon: they touch only the ribbon (track 0) */
  ribbon7: () => [[1, 2, 3, 4, 5, 6], [0], [0], [0], [0], [0], [0]],
  one: () => [[]],
  /* thirteen in a sheath that is a member of its own: track 0 is the sheath, touching the twelve outer fibres */
  fcc13s: () => { const f = SECTIONS.fcc13(), n = [[]]; f.forEach((v, i) => n.push(v.map((j) => j + 1))); for (let i = 2; i <= 13; i++) { n[0].push(i); n[i].push(0); } return n; },
};
/* THE SHEATH'S WEIGHT. A sheath grips by its own hoop tension, so how hard it can press is set by how thick it is,
   and thick is heavy. For thirteen fibres of radius r (a bundle of radius R = 3r) in a closed hose τ thick, in 4D:
     material   4πR²τ against a fibre's (4/3)πr³: 27 τ/r fibres' worth
     pressure   P = 2 σ τ / R on the bundle (a 2-sphere's skin pulls in two directions), σ the hoop stress, taken as
                HOOP of the material's strength
     press      the twelve outer fibres share the skin: per contact, per diameter, 0.06 × HOOP × τ/r in the bench's units
   and for our seven in a tube (3D): 6 τ/r of material, P = σ τ / R, press 0.0133 × HOOP × τ/r. */
/* A STRAND LAID AT AN ANGLE θ to the rope (braided, or wound on a core). Stretch the rope by ε and the strand
   stretches ε cos²θ; its pull points θ off the axis. So as a track: stiffness cos³θ, strength cosθ, and 1/cosθ of
   material per length of rope. Going round a neighbour one diameter away it presses on it tan²θ × its axial tension
   per diameter (a helix's T sin²θ / a, per length of rope, with T the strand's own tension): the `twist` law's q */
export const laid = (deg) => { const c = Math.cos((deg * Math.PI) / 180); return { k: c ** 3, strength: c, material: 1 / c, q: Math.tan((deg * Math.PI) / 180) ** 2 }; };
export const HOOP = 0.5;
export const sheath = (dim, t) => (dim === 4 ? { material: 27 * t, press: 0.06 * HOOP * t, fibres: 13, section: "fcc13" } : { material: 6 * t, press: (0.04 / 3) * HOOP * t, fibres: 7, section: "hex7" });

export function makeRope({ maxSweeps: MAXSW = 80, section = "hex7", S = 96, staple = 0, press = { kind: "none" }, mu = 0.3, m = 5, sigma = 0.02, ks = 0.25, seed = 1, ribbon = null, tracks = null } = {}) {
  const nb = SECTIONS[section](), T = nb.length, r = rng(seed * 7919 + 13), L = S - 1;
  const u = Array.from({ length: T }, () => new Float64Array(S)), ok = Array.from({ length: T }, () => new Uint8Array(L).fill(1)), str = Array.from({ length: T }, () => new Float64Array(L)), kax = new Float64Array(T).fill(1);
  for (let i = 0; i < T; i++) { const isRib = ribbon && i === 0, tr = tracks && tracks[i]; if (isRib) kax[i] = ribbon.k; if (tr) kax[i] = tr.k; for (let s = 0; s < L; s++) str[i][s] = (isRib ? ribbon.strength : tr ? tr.strength : 1) * sigma * (-Math.log(1 - r())) ** (1 / m);
    if (staple && !isRib) { const ph = Math.floor(r() * staple); for (let s = ph; s < L; s += staple) if (s > 0 && s < L - 1) ok[i][s] = 0; } }
  /* interfaces: each unordered pair once */
  const pairs = []; for (let i = 0; i < T; i++) for (const j of nb[i]) if (j > i) pairs.push([i, j]);
  const slip = pairs.map(() => new Float64Array(S)), state = pairs.map(() => new Int8Array(S)), fI = pairs.map(() => new Float64Array(S)), ten = Array.from({ length: T }, () => new Float64Array(S)), was = Array.from({ length: T }, () => new Float64Array(S));
  const contacts = nb.map((v) => Math.max(1, v.length)), R = { T, S, u, ok, str, pairs, state, slip, ten, section, broke: 0, grip: 0 };
  const cap = (p, s) => { const [i, j] = pairs[p]; if (press.kind === "hoop") return mu * press.p; if (press.kind === "trap") return mu * press.c * was[0][s]; /* (a sheath that squeezes in proportion to its own pull; track 0 is the sheath) */ if (press.kind === "twist") { /* the ribbon doesn't wrap anything: what presses a fibre on it is the fibres wound over it, itself among them */ const set = (press.set ?? 0.05) * sigma; if (ribbon) { let mean = 0; for (let k = 1; k < T; k++) mean += was[k][s]; return mu * press.q * ((was[j][s] + mean / (T - 1)) / 2 + set); } return (mu * press.q * ((was[i][s] + was[j][s]) / 2 + set)) / ((contacts[i] + contacts[j]) / 2); } return 0; };
  /* tensions at the nodes. The press reads them as they were at the last settled step (`was`), not as they are in the
     middle of this one: grip that feeds on the tension it creates runs away if it is allowed to chase itself */
  const tnew = new Float64Array(S);
  const tensions = () => { for (let i = 0; i < T; i++) { for (let s = 0; s < S; s++) { const a = s > 0 && ok[i][s - 1] ? kax[i] * (u[i][s] - u[i][s - 1]) : 0, b2 = s < L && ok[i][s] ? kax[i] * (u[i][s + 1] - u[i][s]) : 0; tnew[s] = Math.max(0, s === 0 ? b2 : s === L ? a : (a + b2) / 2); } ten[i].set(tnew); } };
  /* EQUILIBRIUM. With the caps fixed for the step, a sticking-then-slipping interface has a potential: quadratic in the
     shear displacement (from its last settled slip) up to the cap, linear beyond. So the equilibrium is the minimum of
     a convex energy (the links' springs plus those), and is found by Newton's method on it: the interfaces now under
     their caps are springs, the rest fixed forces, the whole rope solved at once (the matrix is banded, a node couples
     only to its own section and the next), and the step is shortened if the energy doesn't fall. */
  const slip0 = pairs.map(() => new Float64Array(S)), NI = S - 2, N = NI * T, BW = T, band = Array.from({ length: N }, () => new Float64Array(BW + 1)), g = new Float64Array(N), du = new Float64Array(N), caps = pairs.map(() => new Float64Array(S)), idx = (s, i) => (s - 1) * T + i;
  const energy = (ext, t) => { let E = 0; const U = (i, s) => (s === 0 ? 0 : s === L ? ext : u[i][s] + t * du[idx(s, i)]);
    for (let i = 0; i < T; i++) for (let s = 0; s < L; s++) if (ok[i][s]) { const d = U(i, s + 1) - U(i, s); E += 0.5 * kax[i] * d * d; }
    for (let p = 0; p < pairs.length; p++) { const [i, j] = pairs[p]; for (let s = 1; s < L; s++) { const d = U(i, s) - U(j, s) - slip0[p][s], c = caps[p][s], a = Math.abs(d); E += ks * a <= c ? 0.5 * ks * d * d : c * a - (c * c) / (2 * ks); } } return E; };
  function relax(ext, iters = MAXSW) { tensions(); let it = 0, left = 0, lam = 1e-9; // lam: damping, raised when a full step fails (a fibre barely held gives a nearly flat energy)
    for (let p = 0; p < pairs.length; p++) for (let s = 1; s < L; s++) caps[p][s] = cap(p, s);
    for (let i = 0; i < T; i++) { u[i][0] = 0; u[i][L] = ext; }
    const tol = 1e-9 * Math.max(ext, 1e-3);
    for (; it < iters; it++) { for (let n = 0; n < N; n++) { band[n].fill(0); g[n] = 0; }
      /* links */
      for (let i = 0; i < T; i++) for (let s = 0; s < L; s++) { if (!ok[i][s]) continue; const k = kax[i], f = k * (u[i][s + 1] - u[i][s]); if (s >= 1) { const n = idx(s, i); band[n][0] += k; g[n] -= f; } if (s + 1 <= L - 1) { const n = idx(s + 1, i); band[n][0] += k; g[n] += f; } if (s >= 1 && s + 1 <= L - 1) band[idx(s, i)][T] -= k; }
      /* interfaces */
      for (let p = 0; p < pairs.length; p++) { const [i, j] = pairs[p], st = state[p]; for (let s = 1; s < L; s++) { const d = u[i][s] - u[j][s] - slip0[p][s], c = caps[p][s], ni = idx(s, i), nj = idx(s, j); if (ks * Math.abs(d) <= c) { st[s] = 0; const f = ks * d; g[ni] += f; g[nj] -= f; band[ni][0] += ks; band[nj][0] += ks; band[ni][j - i] -= ks; } else { const sg = d > 0 ? 1 : -1; st[s] = sg; g[ni] += sg * c; g[nj] -= sg * c; } } }
      for (let n = 0; n < N; n++) band[n][0] += lam * ks;
      /* banded Cholesky: H = Lᵀ L stored in place (upper form), then two triangular solves for H du = −g */
      for (let n = 0; n < N; n++) { const row = band[n]; for (let k = Math.max(0, n - BW); k < n; k++) { const f = band[k][n - k]; if (f === 0) continue; const top = Math.min(BW, k + BW - n + (n - k)); for (let m = 0; m + (n - k) <= BW; m++) row[m] -= f * band[k][n - k + m]; void top; } const dg = Math.sqrt(Math.max(row[0], 1e-14)); for (let m = 0; m <= BW; m++) row[m] /= dg; }
      for (let n = 0; n < N; n++) { let v = -g[n]; for (let k = Math.max(0, n - BW); k < n; k++) v -= band[k][n - k] * du[k]; du[n] = v / band[n][0]; }
      for (let n = N - 1; n >= 0; n--) { let v = du[n]; for (let m = 1; m <= BW && n + m < N; m++) v -= band[n][m] * du[n + m]; du[n] = v / band[n][0]; }
      let big = 0; for (let n = 0; n < N; n++) if (Math.abs(du[n]) > big) big = Math.abs(du[n]);
      let t = 1, halved = 0; const E0 = energy(ext, 0); for (; halved < 10 && energy(ext, t) > E0 + 1e-18; halved++) t *= 0.5;
      if (halved >= 10) t = 0; lam = halved ? Math.min(lam * 30, 10) : Math.max(lam / 5, 1e-9);
      for (let i = 0; i < T; i++) for (let s = 1; s < L; s++) u[i][s] += t * du[idx(s, i)];
      left = (big * t) / tol; if (t > 0 && big * t < tol) { it++; break; } }
    /* settle the slips where they ended */
    for (let p = 0; p < pairs.length; p++) { const [i, j] = pairs[p]; for (let s = 1; s < L; s++) { const d = u[i][s] - u[j][s] - slip0[p][s], c = caps[p][s]; if (ks * Math.abs(d) > c) { const sg = d > 0 ? 1 : -1; state[p][s] = sg; slip0[p][s] = u[i][s] - u[j][s] - (sg * c) / ks; } else state[p][s] = 0; slip[p][s] = slip0[p][s]; } }
    R.sweeps = (R.sweeps || 0) + it; R.relaxes = (R.relaxes || 0) + 1; R.left = Math.max(R.left || 0, left); tensions(); }
  /* the force at the jaw: the tension in every track's first link */
  const force = () => { let F = 0; for (let i = 0; i < T; i++) if (ok[i][0]) F += kax[i] * (u[i][1] - u[i][0]); return F; };
  R.pull = (ext) => { relax(ext); for (let guard = 0; guard < 400; guard++) { let worst = 1, wi = -1, ws = -1; for (let i = 0; i < T; i++) for (let s = 0; s < L; s++) if (ok[i][s]) { const t = kax[i] * (u[i][s + 1] - u[i][s]) / str[i][s]; if (t > worst) { worst = t; wi = i; ws = s; } } if (wi < 0) break; ok[wi][ws] = 0; R.broke++; relax(ext); } for (let i = 0; i < T; i++) was[i].set(ten[i]); R.grip = force(); return R.grip; };
  R.slipping = () => { let n = 0, tot = 0; for (const st of state) for (let s = 1; s < L; s++) { tot++; if (st[s]) n++; } return tot ? n / tot : 0; };
  return R;
}
/* pull a rope to failure: the force at each step, the peak, and how it went */
export function test(opts, { steps = 140, strain = 0.05 } = {}) { const R = makeRope(opts), curve = []; let peak = 0, at = 0, brokeAtPeak = 0, slipAtPeak = 0;
  for (let k = 1; k <= steps; k++) { const ext = (strain * (R.S - 1) * k) / steps, F = R.pull(ext); curve.push(F); if (F > peak) { peak = F; at = k; brokeAtPeak = R.broke; slipAtPeak = R.slipping(); } if (peak > 1e-9 && k > at + 30 && F < 0.2 * peak) break; }
  return { peak, strain: (strain * at) / steps, curve, broke: R.broke, brokeAtPeak, slipAtPeak, tracks: R.T, R }; }
/* the species: every rope we have, as a bench recipe. q is TWIST's grip per pull, per fibre diameter */
export const SPECIES = [
  { id: "strand", name: "one continuous strand", dim: "any", fibres: 1, material: 1, opts: { section: "one" } },
  { id: "ribbon", name: "a ribbon alone", dim: "4D", fibres: 0, material: 2, opts: { section: "one", ribbon: { k: 2, strength: 2 } } },
  { id: "y3soft", name: "twisted yarn, soft", dim: "3D", fibres: 7, material: 7, opts: { section: "hex7", staple: 40, press: { kind: "twist", q: 0.128 } } },
  { id: "y3hard", name: "twisted yarn, hard", dim: "3D", fibres: 7, material: 7, opts: { section: "hex7", staple: 40, press: { kind: "twist", q: 0.8 } } },
  { id: "y4", name: "twisted yarn", dim: "4D", fibres: 7, material: 7, opts: { section: "hex7", staple: 40, press: { kind: "none" } } },
  { id: "rib4soft", name: "yarn on a ribbon, soft", dim: "4D", fibres: 6, material: 8, opts: { section: "ribbon7", staple: 40, press: { kind: "twist", q: 0.092 }, ribbon: { k: 2, strength: 2 } } },
  { id: "rib4hard", name: "yarn on a ribbon, hard", dim: "4D", fibres: 6, material: 8, opts: { section: "ribbon7", staple: 40, press: { kind: "twist", q: 0.35 }, ribbon: { k: 2, strength: 2 } } },
  { id: "hoop4slack", name: "hooped bundle, slack", dim: "4D", fibres: 13, material: 13, wrap: true, opts: { section: "fcc13", staple: 40, press: { kind: "hoop", p: 0.0006 } } },
  { id: "hoop4tight", name: "hooped bundle, tight", dim: "4D", fibres: 13, material: 13, wrap: true, opts: { section: "fcc13", staple: 40, press: { kind: "hoop", p: 0.006 } } },
  { id: "fil4", name: "filament bundle, loose", dim: "4D", fibres: 13, material: 13, opts: { section: "fcc13", staple: 0, press: { kind: "none" } } },
  { id: "rope4", name: "filament rope, sheathed", dim: "4D", fibres: 13, material: 13, wrap: true, opts: { section: "fcc13", staple: 0, press: { kind: "hoop", p: 0.006 } } },
  /* braids of hoses, at the angle the study found best (braid.mjs has the others) */
  ...(() => { const a = laid(20), st = { k: a.k, strength: a.strength }, core = { k: 1, strength: 1 }, press = { kind: "twist", q: a.q }, w = (n) => +(n).toFixed(2);
    return [{ id: "plait4", name: "plait of three hoses, 20°", dim: "4D", fibres: 3, material: w(3 * a.material), opts: { section: "plait3", press, tracks: [st, st, st] } },
      { id: "maypole4", name: "maypole: hose core, six braided, 20°", dim: "4D", fibres: 7, material: w(1 + 6 * a.material), opts: { section: "may7", press, tracks: [core, st, st, st, st, st, st] } },
      { id: "served4", name: "ribbons on a hose, 20°", dim: "4D", fibres: 7, material: w(1 + 6 * a.material), opts: { section: "ribbon7", press, tracks: [core, st, st, st, st, st, st] } }]; })(),
];
/* the statistics of a set of strengths: mean, spread, the 5th percentile (what you could count on), and the Weibull
   modulus that has the same coefficient of variation (higher is more uniform) */
export function stats(v) { const a = Float64Array.from(v).sort(), n = a.length, mean = a.reduce((p, q) => p + q, 0) / n, sd = Math.sqrt(a.reduce((p, q) => p + (q - mean) ** 2, 0) / Math.max(1, n - 1)), q = (f) => { const x = f * (n - 1), i = Math.floor(x); return a[i] + (a[Math.min(n - 1, i + 1)] - a[i]) * (x - i); }, cv = mean > 0 ? sd / mean : 0;
  /* Weibull: cv² = Γ(1+2/m)/Γ(1+1/m)² − 1, solved for m by bisection */
  const lg = (z) => { const c = [76.18009172947146, -86.50532032941677, 24.01409824083091, -1.231739572450155, 0.001208650973866179, -0.000005395239384953]; let x = z, y = z, t = x + 5.5; t -= (x + 0.5) * Math.log(t); let ser = 1.000000000190015; for (const cj of c) ser += cj / ++y; return -t + Math.log((2.5066282746310005 * ser) / x); }, cvOf = (m) => Math.sqrt(Math.exp(lg(1 + 2 / m) - 2 * lg(1 + 1 / m)) - 1);
  let lo = 0.3, hi = 400; if (cv > 0) for (let it = 0; it < 60; it++) { const mid = Math.sqrt(lo * hi); if (cvOf(mid) > cv) lo = mid; else hi = mid; }
  return { n, mean, sd, cv, p5: q(0.05), p50: q(0.5), p95: q(0.95), min: a[0], max: a[n - 1], weibull: cv > 0 ? Math.sqrt(lo * hi) : Infinity }; }


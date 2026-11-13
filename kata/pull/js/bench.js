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
  /* six fibres on a ribbon: they touch only the ribbon (track 0) */
  ribbon7: () => [[1, 2, 3, 4, 5, 6], [0], [0], [0], [0], [0], [0]],
  one: () => [[]],
};
export function makeRope({ section = "hex7", S = 96, staple = 0, press = { kind: "none" }, mu = 0.3, m = 5, sigma = 0.02, ks = 0.25, seed = 1, ribbon = null } = {}) {
  const nb = SECTIONS[section](), T = nb.length, r = rng(seed * 7919 + 13), L = S - 1;
  const u = Array.from({ length: T }, () => new Float64Array(S)), ok = Array.from({ length: T }, () => new Uint8Array(L).fill(1)), str = Array.from({ length: T }, () => new Float64Array(L)), kax = new Float64Array(T).fill(1);
  for (let i = 0; i < T; i++) { const isRib = ribbon && i === 0; if (isRib) kax[i] = ribbon.k; for (let s = 0; s < L; s++) str[i][s] = (isRib ? ribbon.strength : 1) * sigma * (-Math.log(1 - r())) ** (1 / m);
    if (staple && !isRib) { const ph = Math.floor(r() * staple); for (let s = ph; s < L; s += staple) if (s > 0 && s < L - 1) ok[i][s] = 0; } }
  /* interfaces: each unordered pair once */
  const pairs = []; for (let i = 0; i < T; i++) for (const j of nb[i]) if (j > i) pairs.push([i, j]);
  const slip = pairs.map(() => new Float64Array(S)), state = pairs.map(() => new Int8Array(S)), fI = pairs.map(() => new Float64Array(S)), ten = Array.from({ length: T }, () => new Float64Array(S)), was = Array.from({ length: T }, () => new Float64Array(S));
  const contacts = nb.map((v) => Math.max(1, v.length)), R = { T, S, u, ok, str, pairs, state, slip, ten, section, broke: 0, grip: 0 };
  const cap = (p, s) => { const [i, j] = pairs[p]; if (press.kind === "hoop") return mu * press.p; if (press.kind === "twist") { /* the ribbon doesn't wrap anything: what presses a fibre on it is the fibres wound over it, itself among them */ const set = (press.set ?? 0.05) * sigma; if (ribbon) { let mean = 0; for (let k = 1; k < T; k++) mean += was[k][s]; return mu * press.q * ((was[j][s] + mean / (T - 1)) / 2 + set); } return (mu * press.q * ((was[i][s] + was[j][s]) / 2 + set)) / ((contacts[i] + contacts[j]) / 2); } return 0; };
  const lo = new Float64Array(S), di = new Float64Array(S), up = new Float64Array(S), rhs = new Float64Array(S), cw = new Float64Array(S), gw = new Float64Array(S), tnew = new Float64Array(S);
  /* tensions at the nodes. The press reads them as they were at the last settled step (`was`), not as they are in the
     middle of this one: grip that feeds on the tension it creates runs away if it is allowed to chase itself */
  const tensions = (ease) => { for (let i = 0; i < T; i++) { for (let s = 0; s < S; s++) { const a = s > 0 && ok[i][s - 1] ? kax[i] * (u[i][s] - u[i][s - 1]) : 0, b2 = s < L && ok[i][s] ? kax[i] * (u[i][s + 1] - u[i][s]) : 0; tnew[s] = Math.max(0, s === 0 ? b2 : s === L ? a : (a + b2) / 2); } for (let s = 0; s < S; s++) ten[i][s] += ease * (tnew[s] - ten[i][s]); } };
  function relax(ext, sweeps = 400) { let change = 1;
    for (let sw = 0; sw < sweeps && change > 1e-11; sw++) { tensions(sw ? 0.5 : 1); change = 0;
      /* interfaces: stick while the shear is under the cap, else slip at the cap */
      for (let p = 0; p < pairs.length; p++) { const [i, j] = pairs[p], sl = slip[p], st = state[p]; for (let s = 1; s < L; s++) { const c = cap(p, s), f = ks * (u[i][s] - u[j][s] - sl[s]); if (Math.abs(f) > c) { const sg = f > 0 ? 1 : -1; sl[s] = u[i][s] - u[j][s] - (sg * c) / ks; st[s] = sg; fI[p][s] = sg * c; } else { st[s] = 0; fI[p][s] = f; } } }
      /* each track in turn: its chain solved exactly (tridiagonal over the nodes between the jaws), the interfaces and
         the other tracks as they stand. Every interface is a spring to the neighbour about its slipped position, which the
         step above moves whenever the spring would carry more than the cap (so a fibre whose every contact is slipping is
         still held somewhere while the answer is found) */
      for (let i = 0; i < T; i++) { const x = u[i];
        for (let s = 1; s < L; s++) { const kl = ok[i][s - 1] ? kax[i] : 0, kr = ok[i][s] ? kax[i] : 0; lo[s] = -kl; up[s] = -kr; di[s] = kl + kr + 1e-10; rhs[s] = 0; }
        rhs[L - 1] += (ok[i][L - 1] ? kax[i] : 0) * ext; // (the right jaw is at ext, the left at 0)
        for (let p = 0; p < pairs.length; p++) { const [a, b2] = pairs[p]; if (a !== i && b2 !== i) continue; const o = a === i ? b2 : a, sg = a === i ? 1 : -1, sl = slip[p], st = state[p], uo = u[o]; for (let s = 1; s < L; s++) { di[s] += ks; rhs[s] += ks * (uo[s] + sg * sl[s]); } }
        cw[1] = up[1] / di[1]; gw[1] = rhs[1] / di[1];
        for (let s = 2; s < L; s++) { const den = di[s] - lo[s] * cw[s - 1]; cw[s] = up[s] / den; gw[s] = (rhs[s] - lo[s] * gw[s - 1]) / den; }
        let nxt = 0; for (let s = L - 1; s >= 1; s--) { const nv = s === L - 1 ? gw[s] : gw[s] - cw[s] * nxt; const dv = Math.abs(nv - x[s]); if (dv > change) change = dv; x[s] = nv; nxt = nv; } x[0] = 0; x[L] = ext; } }
    tensions(1); }
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
  { id: "strand", name: "one continuous strand", dim: "any", fibres: 1, opts: { section: "one" } },
  { id: "y3soft", name: "twisted yarn, soft", dim: "3D", fibres: 7, opts: { section: "hex7", staple: 40, press: { kind: "twist", q: 0.128 } } },
  { id: "y3hard", name: "twisted yarn, hard", dim: "3D", fibres: 7, opts: { section: "hex7", staple: 40, press: { kind: "twist", q: 0.8 } } },
  { id: "y4", name: "twisted yarn", dim: "4D", fibres: 7, opts: { section: "hex7", staple: 40, press: { kind: "none" } } },
  { id: "rib4soft", name: "yarn on a ribbon, soft", dim: "4D", fibres: 6, opts: { section: "ribbon7", staple: 40, press: { kind: "twist", q: 0.092 }, ribbon: { k: 2, strength: 2 } } },
  { id: "rib4hard", name: "yarn on a ribbon, hard", dim: "4D", fibres: 6, opts: { section: "ribbon7", staple: 40, press: { kind: "twist", q: 0.35 }, ribbon: { k: 2, strength: 2 } } },
  { id: "hoop4slack", name: "hooped bundle, slack", dim: "4D", fibres: 13, opts: { section: "fcc13", staple: 40, press: { kind: "hoop", p: 0.0006 } } },
  { id: "hoop4tight", name: "hooped bundle, tight", dim: "4D", fibres: 13, opts: { section: "fcc13", staple: 40, press: { kind: "hoop", p: 0.006 } } },
  { id: "fil4", name: "filament bundle, loose", dim: "4D", fibres: 13, opts: { section: "fcc13", staple: 0, press: { kind: "none" } } },
  { id: "rope4", name: "filament rope, sheathed", dim: "4D", fibres: 13, opts: { section: "fcc13", staple: 0, press: { kind: "hoop", p: 0.006 } } },
];

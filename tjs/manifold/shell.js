// tjs/manifold/shell.js — THE n→m MANIFOLD. Pure, DOM-free, three.js-free.
//
// A cobordism you can stand in. Topologically this family is a genus-0 surface
// taking n boundary circles to m: n legs on the ground, merging through a
// collector ring, rising into m mouths. The three-legged one with a ring about
// its middle is just the n=3, m=1 member of it.
//
// WHY HYPERBOLOIDS. A hyperboloid of one sheet is DOUBLY RULED: it is a curved
// surface made entirely of straight lines, two families of them, crossing. That
// is the whole trick — the form reads as a Gaudí curve and every single member
// in it is straight. Shukhov built towers this way in 1896 and they are still
// standing.
//
// The lattice falls out of the geometry exactly, with no fitting. Take the
// standard ruled parametrisation
//
//     P(t, v) = ( a(cos t − v sin t),  a(sin t + v cos t),  c·v )
//
// — fixing t and varying v traces a straight line, and x² + y² = a²(1 + v²), so
// every such line lies on the hyperboloid of waist radius a. A point on it sits
// at radius a√(1+v²) and angle t + atan v. The second family is the mirror,
// t − atan v.
//
// The two families CROSS wherever t_k + atan v = t_l − atan v, i.e. at
// v = tan(π p / N) for integer p. Put the hoops at exactly those heights and
// every crossing is a shared node: generator A_k meets generator B_{k+2p}. The
// whole lattice collapses to
//
//     node (k, p):   r = a / cos(π p / N),   z = z₀ + c · tan(π p / N),
//                    θ = (2k + p)·π / N
//
// with members A: (k,p)→(k,p+1), B: (k,p)→(k−1,p+1), hoop: (k,p)→(k+1,p). Every
// face is a triangle, every edge is a real member, and no two members cross
// without a joint. That is what makes the structural solve honest rather than
// decorative — see struct.js.
//
// The surface treatment decides how much of this is rib and how much is shell:
// bare lattice is Shukhov, trencadís and board-marked are Gaudí, and the
// difference is a cladding weight, not a different model.

import { Rand } from '../brut/arch.js';

export const VERSION = 'manifold/1';

const r2 = (v) => Math.round(v * 100) / 100;
const r3 = (v) => Math.round(v * 1000) / 1000;
const r4 = (v) => Math.round(v * 10000) / 10000;
const TAU = Math.PI * 2;

/* ───────────────────────────── surface treatment ────────────────────────── */
//
// What the lattice is filled with. This is the one place the anti-brutalist
// streak lives: the same ribs can carry a mosaic, a board-marked shell, or
// nothing at all, and the choice changes the weight, the light and the verdict.

export const SURFACES = {
  lattice: {
    label: 'bare lattice', clad: 0, opacity: 0, ribScale: 1.0,
    note: 'no skin at all — the Shukhov reading, where the structure is the whole building',
  },
  trencadis: {
    composite: true, label: 'trencadís', clad: 1.4e3, opacity: 1, ribScale: 0.85, shards: true,
    note: 'broken-tile mosaic over a thin shell: Gaudí’s way of making a doubly-curved surface out of flat pieces',
  },
  'board-marked': {
    composite: true, label: 'board-marked shell', clad: 3.6e3, opacity: 1, ribScale: 0.9,
    note: 'a 150 mm sprayed shell carrying the shuttering grain — the concrete answer to the same surface',
  },
  ribbed: {
    composite: true, label: 'ribbed shell', clad: 2.4e3, opacity: 0.95, ribScale: 1.35,
    note: 'thin between deep ribs: most of the stiffness in the lines, most of the weight saved',
  },
  perforated: {
    composite: true, label: 'perforated', clad: 1.8e3, opacity: 0.72, ribScale: 1.0,
    note: 'shell punched on the lattice rhythm, so the surface reads as light and the ribs still carry',
  },
  glazed: {
    label: 'glazed', clad: 0.55e3, opacity: 0.35, ribScale: 1.1, glass: true,
    note: 'the gridshell answer: every triangle a pane, the ribs doing all the work',
  },
};
export const SURFACE_IDS = Object.keys(SURFACES);

/* ─────────────────────────────── programmes ─────────────────────────────── */
//
// What the manifold is FOR. Same role the typologies play in /brut: a bias, not
// a template — the ranges a seed draws inside.

export const PROGRAMMES = {
  pavilion: {
    label: 'Pavilion', legs: [3, 5], mouths: [0, 1], scale: [9, 16],
    plate: [4.5, 7], storey: [3.2, 4.0], unit: 0, live: 4.8e3,
    surfaces: ['trencadis', 'glazed', 'perforated'],
    note: 'one room under one surface — the smallest thing this family can be',
  },
  market: {
    label: 'Market hall', legs: [4, 8], mouths: [1, 3], scale: [14, 26],
    plate: [5, 8], storey: [3.4, 4.2], unit: 0, live: 4.8e3,
    surfaces: ['board-marked', 'perforated', 'ribbed'],
    note: 'a canopy on splayed legs, the mouths venting the heat of the floor below',
  },
  housing: {
    label: 'Housing', legs: [3, 4], mouths: [1, 2], scale: [13, 22],
    plate: [9, 12], storey: [2.9, 3.2], unit: 78, live: 2.0e3,
    surfaces: ['trencadis', 'perforated', 'ribbed'],
    note: 'the point block reinvented — homes in the flares, the pinch at the waist a service neck',
  },
  winery: {
    label: 'Winery', legs: [3, 4], mouths: [1, 2], scale: [11, 18],
    plate: [6, 9], storey: [3.6, 4.6], unit: 0, live: 7.2e3,
    surfaces: ['board-marked', 'ribbed'],
    note: 'heavy floors in the legs, the ring carrying the crush deck — Gaudí actually built one of these',
  },
  crematorium: {
    label: 'Crematorium', legs: [3, 3], mouths: [1, 1], scale: [10, 15],
    plate: [5, 8], storey: [3.4, 4.4], unit: 0, live: 4.8e3,
    surfaces: ['board-marked', 'trencadis'],
    note: 'three legs, one throat: the single mouth is the point of the building',
  },
  observatory: {
    label: 'Observatory', legs: [3, 6], mouths: [1, 1], scale: [12, 22],
    plate: [5, 8], storey: [3.2, 4.2], unit: 0, live: 3.0e3,
    surfaces: ['lattice', 'glazed'],
    note: 'the lattice left bare and the mouth aimed at the sky',
  },
  basilica: {
    label: 'Basilica', legs: [4, 6], mouths: [2, 5], scale: [16, 30],
    plate: [8, 11], storey: [3.2, 4.2], unit: 96, live: 2.0e3,
    surfaces: ['trencadis', 'board-marked', 'ribbed'],
    note: 'the Sagrada reading — a forest of branching legs and a crown of towers',
  },
};
export const PROGRAMME_IDS = Object.keys(PROGRAMMES);

/* ─────────────────────────── materials + sections ───────────────────────── */

export const MAT = {
  Ec: 30e9,          // Pa — concrete rib
  rho: 2400,         // kg·m⁻³
  fc: 45e6,          // Pa
  g: 9.80665,
};

/* ─────────────────────────── params + permalinks ────────────────────────── */

// How far up the ruling a lattice may reach. The hard limit is |p| < N/2, where
// r = a/cos(πp/N) runs to the asymptote and z = c·tan(πp/N) with it — a lattice
// taken to ⌊N/2⌋−1 on a fine ruling is 5× as wide at the foot as at the waist
// and hundreds of metres tall.
//
// It is also a HABITABILITY constraint, which is the stronger one. The p-levels
// are the floors, and their spacing c·(tan(π(p+1)/N) − tan(πp/N)) widens as you
// move away from the waist. Holding πp/N under 45° keeps the ratio of the
// tallest storey to the shortest around 1.7 — so if the waist floors are 3.0 m
// the end floors are about 5.2 m, which reads as a double-height ground and a
// lofty crown. Past that the ends become unusable voids.
export const pMaxFor = (N) => Math.max(1, Math.min(Math.floor(N / 2) - 1, Math.round(N * 0.25)));

// Ceiling on how many nodes a seed may ask for. See the note in deriveParams.
export const NODE_BUDGET = 900;

// c is not drawn directly: it is whatever makes the lattice the height it was
// asked to be. Drawing c and a p-range independently multiplies two unbounded
// things together, which is how you get a 170 m market hall.
const flareFor = (H, N, pLo, pHi) =>
  H / Math.max(0.05, Math.tan((Math.PI * pHi) / N) - Math.tan((Math.PI * pLo) / N));

// c chosen so the p-levels land a STOREY apart. The levels are the floors, and
// their spacing in z is c·Δtan, so the tightest of them — the pair straddling
// the waist — fixes c. Everything above is then taller in proportion, which is
// the section this geometry wants: a double-height ground, apartments through
// the pinch, a lofty crown.
function storeyFlare(storey, N, pLo, pHi) {
  let minDv = Infinity;
  for (let p = pLo; p < pHi; p++) {
    minDv = Math.min(minDv, Math.tan((Math.PI * (p + 1)) / N) - Math.tan((Math.PI * p) / N));
  }
  return storey / Math.max(1e-6, minDv);
}

// A FLOOR on the flare, and it is a structural floor rather than an aesthetic
// one. Along the surface, dz/dr = c / (a·sin(πp/N)) — so as c/a falls the
// lattice flattens out, and at the free rim the two generators meeting a node
// lose their vertical component entirely. Their directions then span only the
// rim plane and the node is unbraced normal to it: the flat-shell problem, and
// exactly what a degeneracy sweep found at the top of very shallow mouths.
// Holding dz/dr ≥ 0.45 at the rim keeps a mouth a mouth instead of a disc.
//
// It must be evaluated at whichever end reaches FURTHEST from the waist, not at
// the top: |p| is what flattens the surface, so a mouth with pLo = −3 and
// pHi = 2 goes flat at its BASE, and guarding only the top left its base rim
// rank-deficient.
const flareFloor = (a, N, pLo, pHi) =>
  0.45 * a * Math.sin((Math.PI * Math.max(pHi, -pLo)) / N);

export function deriveParams(seed, programme) {
  const s = String(seed);
  const rp = Rand(s, 'programme');
  const prog = (programme && PROGRAMMES[programme]) ? programme : rp.pick(PROGRAMME_IDS);
  const T = PROGRAMMES[prog];
  const r = Rand(s, 'shape/' + prog);

  // N is the number of generators in each ruling family. It sets the bay size
  // and, through pMax = ⌊N/2⌋−1, how far up the hyperboloid the lattice may
  // reach before r = a/cos(πp/N) runs away to the asymptote. Parity does not
  // matter: consecutive levels are offset by exactly half a bay for any N,
  // and the hoops close every level into a cycle either way.
  // A finer ruling than the pure-lattice version wanted: N is now also the
  // number of structural bays around the facade, and a 3-4 m bay is what makes
  // the thing read at human scale rather than as a wire model.
  let N = r.int(12, 22);
  const legs = r.int(T.legs[0], T.legs[1]);
  const mouths = r.int(T.mouths[0], T.mouths[1]);
  const scale = r2(r.range(T.scale[0], T.scale[1]));

  let pMax = pMaxFor(N);
  // Bias the waist HIGH: pLo reaches further than pHi, so a leg flares at its
  // base and narrows as it rises. That is the way round a building wants to be
  // — a wide public ground, a stable footprint, a slimmer top — and it keeps the
  // widest plate off the roof, where it was reading as a lid rather than a
  // terrace.
  let pLo = -r.int(Math.max(1, Math.round(pMax * 0.9)), pMax);
  // and the top stays near the waist, so the leg TAPERS as it rises. Letting
  // pHi reach as far as pLo made the widest plate the roof, which read as a
  // saucer capping a tube rather than as a building.
  let pHi = r.int(1, Math.max(1, Math.round(pMax * 0.45)));
  // The tightest storey — the one at the waist. Everything else follows from it.
  const storey = r2(r.range(T.storey[0], T.storey[1]));

  // A NODE BUDGET. Every node is six degrees of freedom in the frame solve and
  // the profile factorisation is O(n·b²), so an eight-legged basilica on a
  // sixteen-fold ruling is a ten-second wait. Rather than let the seed decide
  // how long the page hangs, shrink the ruling until the model fits — the design
  // survives, at a coarser bay. The draws above are already made, so shrinking
  // here cannot reshuffle anything downstream.
  const estimate = (g) => legs * (g + 1) * (pHi - pLo + 1) +          // lattice + core stack
    mouths * g * (pMaxFor(g) + 2) + 3 * legs * Math.max(6, Math.round(g * 0.4));
  while (N > 7 && estimate(N) > NODE_BUDGET) {
    N--;
    pMax = pMaxFor(N);
    pHi = Math.min(pHi, pMax); pLo = Math.max(pLo, -pMax);
  }

  // PROPORTION. The legs have to be slender enough, and far enough apart, that
  // the composition reads as legs → ring → mouths rather than as a huddle of
  // silos. A leg's widest radius is waist/cos(π·p/N) at whichever end reaches
  // furthest, and two adjacent leg axes are 2·spread·sin(π/legs) apart — so
  // demanding a real gap between them gives a minimum spread that grows with
  // the leg count. Without it, an eight-legged basilica drew its legs
  // interpenetrating and hid its own ring inside them.
  // THE LEG'S RADIUS IS SET BY THE FLOOR PLATE IT HAS TO HOLD, not by the size
  // of the composition. That inversion is what makes these habitable: a point
  // block wants 9-12 m from core to facade, so a waist radius in the range each
  // programme names, in METRES, and the composition arranges itself around it.
  const waist = r.range(T.plate[0], T.plate[1]);
  const rMax = waist / Math.cos((Math.PI * Math.max(pHi, -pLo)) / N);
  const minSpread = legs > 1 ? (rMax * 1.3) / Math.sin(Math.PI / legs) : 0;
  const spread = Math.max(scale * r.range(0.9, 1.6), minSpread);

  return {
    seed: s, programme: prog,
    legs, mouths, N,
    waist: r2(waist),                           // leg waist radius, metres
    storey,                                     // the tightest storey height
    // c is whatever puts the p-levels a storey apart. The levels ARE the floors:
    // they are where the two rulings cross, so every floor edge is already a
    // ring of real joints and no new topology is needed to stand on one.
    flare: r2(Math.max(storeyFlare(storey, N, pLo, pHi), flareFloor(waist, N, pLo, pHi))),
    pLo, pHi,
    spread: r2(spread),                         // leg centres on this radius
    ringZ: r2(r.range(0.45, 0.85)),             // ring height as a fraction of leg height
    ringR: r2(r.range(0.82, 1.18)),             // ring radius as a multiple of the spread
    ringD: r2(Math.max(0.8, scale * r.range(0.07, 0.16))), // depth of the ring truss
    mouthWaist: r2(r.range(0.34, 0.66)),        // mouth throat as a fraction of its base
    mouthRise: r2(r.range(0.5, 1.4)),           // how far the mouths climb
    surface: r.pick(T.surfaces),
    // The rib is a RATIO of the bay it has to span, not an absolute size. A
    // 0.4 m rib is right across 4 m and hopeless across 11, and the bay here is
    // set by the ruling, which is set by the node budget — so an absolute
    // diameter made the checks depend on how coarse the model happened to be.
    rib: r3(r.range(0.13, 0.26)),              // rib diameter ÷ mean bay length
    tilt: r2(r.range(0, 0.22)),                 // legs leaning outward, Gaudí's inclined columns
  };
}

const clampI = (v, lo, hi) => Math.max(lo, Math.min(hi, Math.round(v)));

export function resolveParams(query) {
  const q = toMap(query);
  const seed = (q.s != null && String(q.s).length) ? String(q.s) : 'manifold';
  const p = deriveParams(seed, q.pr);
  const num = (k, lo, hi) => {
    if (q[k] == null || q[k] === '') return null;
    const v = Number(q[k]);
    return isFinite(v) ? r2(Math.max(lo, Math.min(hi, v))) : null;
  };
  const set = (k, v) => { if (v != null) p[k] = v; };
  if (q.n != null && q.n !== '') p.legs = clampI(Number(q.n) || p.legs, 1, 10);
  if (q.m != null && q.m !== '') p.mouths = clampI(Number(q.m) || 0, 0, 6);
  if (q.g != null && q.g !== '') p.N = clampI(Number(q.g) || p.N, 5, 21);
  set('waist', num('w', 1, 60));
  set('flare', num('c', 1, 90));
  set('spread', num('sp', 0, 120));
  set('ringZ', num('rz', 0.05, 1));
  set('ringR', num('rr', 0.3, 2.2));
  set('ringD', num('rd', 0.4, 12));
  set('mouthWaist', num('mw', 0.15, 0.95));
  set('mouthRise', num('mr', 0.1, 3));
  set('rib', num('rb', 0.02, 0.4));
  set('storey', num('st', 2.6, 6));
  set('tilt', num('tl', 0, 0.6));
  if (q.su && SURFACES[q.su]) p.surface = q.su;

  // the p-range has to stay inside the ruling: |p| < N/2 or the radius blows up
  const pMax = pMaxFor(p.N);
  if (q.ph != null && q.ph !== '') p.pHi = clampI(Number(q.ph) || p.pHi, 1, pMax);
  if (q.pl != null && q.pl !== '') p.pLo = clampI(Number(q.pl) || p.pLo, -pMax, -1);
  p.pHi = clampI(p.pHi, 1, pMax);
  p.pLo = clampI(p.pLo, -pMax, -1);
  return p;
}

export function paramsToQuery(p) {
  const base = deriveParams(p.seed, p.programme);
  const out = ['s=' + encodeURIComponent(p.seed)];
  if (p.programme !== deriveParams(p.seed).programme) out.push('pr=' + p.programme);
  const add = (k, v, bv) => { if (v !== bv) out.push(k + '=' + v); };
  add('n', p.legs, base.legs); add('m', p.mouths, base.mouths); add('g', p.N, base.N);
  add('w', p.waist, base.waist); add('c', p.flare, base.flare); add('sp', p.spread, base.spread);
  add('rz', p.ringZ, base.ringZ); add('rr', p.ringR, base.ringR); add('rd', p.ringD, base.ringD);
  add('mw', p.mouthWaist, base.mouthWaist); add('mr', p.mouthRise, base.mouthRise);
  add('rb', p.rib, base.rib); add('st', p.storey, base.storey); add('tl', p.tilt, base.tilt);
  add('ph', p.pHi, base.pHi); add('pl', p.pLo, base.pLo);
  add('su', p.surface, base.surface);
  return out.join('&');
}

function toMap(query) {
  if (!query) return {};
  if (typeof query === 'string') {
    const out = {};
    const s = query.replace(/^[?#]/, '');
    if (!s) return out;
    for (const part of s.split('&')) {
      if (!part) continue;
      const i = part.indexOf('=');
      out[decodeURIComponent(i < 0 ? part : part.slice(0, i))] =
        i < 0 ? '' : decodeURIComponent(part.slice(i + 1).replace(/\+/g, ' '));
    }
    return out;
  }
  if (typeof query.get === 'function') { const o = {}; for (const [k, v] of query) o[k] = v; return o; }
  return query;
}

const SEED_A = ['catenary', 'trencadis', 'shukhov', 'hyperbola', 'funicular', 'cobord', 'pants',
  'throat', 'ruled', 'genus', 'boundary', 'lune', 'cusp', 'saddle', 'gaudi'];
const SEED_B = ['ochre', 'lime', 'basalt', 'nacre', 'clay', 'salt', 'ash', 'iron', 'mica', 'reed'];
export function rollSeed(rnd = Math.random) {
  return SEED_A[Math.floor(rnd() * SEED_A.length)] + '-' +
    SEED_B[Math.floor(rnd() * SEED_B.length)] + '-' + (100 + Math.floor(rnd() * 900));
}

/* ─────────────────────── the ruled hyperboloid lattice ──────────────────── */
//
// One lattice, built from the closed form at the top of this file. `origin` is
// the leg's base centre, `tilt` leans its axis outward so the legs splay the way
// Gaudí's inclined columns do.

function hyperLattice(spec, nodes, members, tag) {
  const { N, a, c, pLo, pHi, cx, cy, z0, lean, leanDir } = spec;
  const rot = spec.rot || 0;
  const idx = new Map();                       // "k,p" → node id
  const key = (k, p) => `${((k % N) + N) % N},${p}`;
  const zAt = (p) => c * Math.tan((Math.PI * p) / N);
  const z0off = zAt(pLo);

  for (let p = pLo; p <= pHi; p++) {
    const r = a / Math.cos((Math.PI * p) / N);
    const z = z0 + zAt(p) - z0off;
    for (let k = 0; k < N; k++) {
      const th = ((2 * k + p) * Math.PI) / N + rot;
      // the lean tips the whole lattice about its base, outward from the centre
      const lx = lean * (z) * Math.cos(leanDir);
      const ly = lean * (z) * Math.sin(leanDir);
      const id = nodes.length;
      nodes.push({
        id, x: r4(cx + r * Math.cos(th) + lx), y: r4(cy + r * Math.sin(th) + ly), z: r4(z),
        tag, k, p, ring: false,
      });
      idx.set(key(k, p), id);
    }
  }
  const add = (i, j, kind) => {
    if (i == null || j == null || i === j) return;
    members.push({ i, j, kind, tag });
  };
  for (let p = pLo; p <= pHi; p++) {
    for (let k = 0; k < N; k++) {
      if (p < pHi) {
        add(idx.get(key(k, p)), idx.get(key(k, p + 1)), 'gen');       // family A
        add(idx.get(key(k, p)), idx.get(key(k - 1, p + 1)), 'gen');   // family B
      }
      add(idx.get(key(k, p)), idx.get(key(k + 1, p)), 'hoop');
    }
  }
  // triangles, for the shell surface. Both of a quad's triangles are bounded by
  // real members, which is what makes this a triangulation and not a guess.
  const tris = [];
  for (let p = pLo; p < pHi; p++) {
    for (let k = 0; k < N; k++) {
      const A = idx.get(key(k, p)), B = idx.get(key(k + 1, p));
      const C = idx.get(key(k, p + 1)), D = idx.get(key(k + 1, p + 1));
      if (A != null && B != null && C != null) tris.push([A, B, C]);
      if (B != null && D != null && C != null) tris.push([B, D, C]);
    }
  }
  return { idx, key, tris, base: Array.from({ length: N }, (_, k) => idx.get(key(k, pLo))),
    top: Array.from({ length: N }, (_, k) => idx.get(key(k, pHi))),
    rTop: a / Math.cos((Math.PI * pHi) / N), rBase: a / Math.cos((Math.PI * pLo) / N),
    height: zAt(pHi) - zAt(pLo), z0 };
}

/* ──────────────────────────────── generate ──────────────────────────────── */

export function generate(paramsOrQuery) {
  const p = (paramsOrQuery && paramsOrQuery.seed && paramsOrQuery.surface)
    ? paramsOrQuery : resolveParams(paramsOrQuery);
  const T = PROGRAMMES[p.programme];
  const S = SURFACES[p.surface];

  const nodes = [], members = [], tris = [];
  const legs = [];
  const spread = p.legs === 1 ? 0 : p.spread;

  for (let i = 0; i < p.legs; i++) {
    const ang = (TAU * i) / p.legs;
    const L = hyperLattice({
      N: p.N, a: p.waist, c: p.flare, pLo: p.pLo, pHi: p.pHi,
      cx: spread * Math.cos(ang), cy: spread * Math.sin(ang), z0: 0,
      lean: p.tilt, leanDir: ang, rot: ang,
    }, nodes, members, 'leg' + i);
    tris.push(...L.tris);
    legs.push({ ...L, ang, cx: spread * Math.cos(ang), cy: spread * Math.sin(ang) });
  }

  const legH = legs[0].height;
  const zRing = r4(p.ringZ * legH);
  const Rring = r4(Math.max(0.5, p.ringR * (spread || legs[0].rTop)));

  // ── the ring ────────────────────────────────────────────────────────────
  // The member every one of these buildings lives or dies by: the legs splay,
  // the ring is what stops them. Its own force tells you which — a ring in
  // TENSION is holding splaying legs together, in COMPRESSION it is propping
  // them apart.
  //
  // It is a RING TRUSS of TRIANGULAR SECTION, not a hoop. A pin-jointed hoop is
  // a mechanism: each node has two nearly-collinear bars and nothing at all
  // resisting motion out of the ring plane. Two hoops one above the other are no
  // better — they add depth but no WIDTH, so every bar at a node still lies in
  // the tangent–vertical plane and the node is free to slide radially. That is
  // not a theory: it is what the first solve found, a 15-fold mechanism whose
  // mode was pure radial breathing of the ring.
  //
  // So: three chords — two outboard, one inboard and half a depth in — laced
  // into a triangular tube. Now every node has bars spanning all three
  // directions, which is the same section a real compression ring gets.
  // a multiple of the leg count, so the ring shares the legs' rotational
  // symmetry instead of beating against it
  const ringN = p.legs * Math.max(6, Math.round(p.N * 0.4));
  const ringD = Math.min(p.ringD, Math.max(0.6, legH * 0.25));
  const ringW = Math.min(ringD, Rring * 0.5);
  const CHORDS = [
    { dr: 0, dz: ringD / 2 },        // outer upper
    { dr: 0, dz: -ringD / 2 },       // outer lower
    { dr: -ringW, dz: 0 },           // inner
  ];
  const chord = CHORDS.map(() => []);
  CHORDS.forEach((C, ci) => {
    for (let i = 0; i < ringN; i++) {
      const th = (TAU * i) / ringN;
      const rr = Rring + C.dr;
      chord[ci].push(nodes.length);
      nodes.push({
        id: nodes.length, x: r4(rr * Math.cos(th)), y: r4(rr * Math.sin(th)), z: r4(zRing + C.dz),
        tag: 'ring', k: i, p: ci, ring: true, chord: ci,
      });
    }
  });
  for (let i = 0; i < ringN; i++) {
    const j = (i + 1) % ringN;
    for (let ci = 0; ci < 3; ci++) {
      members.push({ i: chord[ci][i], j: chord[ci][j], kind: 'ring', tag: 'ring' });
      const cj = (ci + 1) % 3;
      members.push({ i: chord[ci][i], j: chord[cj][i], kind: 'ringweb', tag: 'ring' });   // post
      members.push({ i: chord[ci][i], j: chord[cj][j], kind: 'ringweb', tag: 'ring' });   // diagonal
    }
  }
  const ringUp = chord[0], ringLo = chord[1], ringIn = chord[2];
  const ringIds = chord[0].concat(chord[1], chord[2]);

  // A tie is three NON-COPLANAR bars. That is not a rule of thumb — it is the
  // exact condition for a pin joint to be held in 3-space, and three bars whose
  // directions happen to lie in one plane leave the node free normal to it. So
  // rather than picking neighbours by a rule and hoping, walk the ring nodes
  // nearest-first and accept one only if its direction has a real component
  // outside the span of the ones already accepted — Gram–Schmidt as an
  // admission test. Degenerate cases (a mouth springing off the ring plane whose
  // base circle lands exactly on ring nodes) fall out for free, because a
  // zero-length bar has no direction to contribute.
  const tieTo = (nid, tag) => {
    const nd = nodes[nid];
    const cand = ringIds
      .map((rid) => {
        const o = nodes[rid];
        return { rid, d: Math.hypot(o.x - nd.x, o.y - nd.y, o.z - nd.z) };
      })
      .filter((c) => c.d > 0.05)
      .sort((a, c) => a.d - c.d)
      .slice(0, 16);
    const basis = [];
    for (const c of cand) {
      if (basis.length === 3) break;
      const o = nodes[c.rid];
      let v = [(o.x - nd.x) / c.d, (o.y - nd.y) / c.d, (o.z - nd.z) / c.d];
      for (const e of basis) {
        const dp = v[0] * e[0] + v[1] * e[1] + v[2] * e[2];
        v = [v[0] - dp * e[0], v[1] - dp * e[1], v[2] - dp * e[2]];
      }
      const nrm = Math.hypot(v[0], v[1], v[2]);
      if (nrm < 0.25) continue;                    // too nearly inside the span already
      basis.push([v[0] / nrm, v[1] / nrm, v[2] / nrm]);
      members.push({ i: nid, j: c.rid, kind: 'tie', tag });
    }
  };

  // tie every leg to the ring at the level nearest the ring's height
  for (const L of legs) {
    let bestP = p.pLo, bestD = Infinity;
    for (let q = p.pLo; q <= p.pHi; q++) {
      const z = nodes[L.idx.get(L.key(0, q))].z;
      if (Math.abs(z - zRing) < bestD) { bestD = Math.abs(z - zRing); bestP = q; }
    }
    for (let k = 0; k < p.N; k++) {
      const nid = L.idx.get(L.key(k, bestP));
      if (nid != null) tieTo(nid, 'ring');
    }
    L.ringP = bestP;
  }

  // ── the mouths ──────────────────────────────────────────────────────────
  // Each rises out of the ring plane: a hyperboloid whose base circle sits on
  // the ring, narrowing to a throat and flaring again. pLo is chosen so the base
  // radius really is the mouth's footprint, not an approximation of it.
  const mouths = [];
  for (let i = 0; i < p.mouths; i++) {
    const ang = p.mouths === 1 ? 0 : (TAU * i) / p.mouths + Math.PI / p.mouths;
    const off = p.mouths === 1 ? 0 : Rring * 0.5;
    // a lone mouth springs from just inside the ring, not off its centreline —
    // otherwise its base circle lands on the ring nodes and the ties vanish
    const R0 = p.mouths === 1 ? Rring * 0.88 : Rring * 0.42;
    const pMax = pMaxFor(p.N);
    // pick the depth of the throat from mouthWaist, then take `a` FROM it, so
    // the mouth's base circle is exactly R0 and really does land on the ring —
    // solving the other way round leaves a gap the ties have to stretch across.
    const pl = -clampI((p.N / Math.PI) * Math.acos(Math.min(0.999, p.mouthWaist)), 1, pMax);
    const a = Math.max(0.4, R0 * Math.cos((Math.PI * pl) / p.N));
    const ph = clampI(pMax * p.mouthRise * 0.8, 1, pMax);
    const M = hyperLattice({
      N: p.N, a, pLo: pl, pHi: ph,
      c: Math.max(flareFor(legH * 0.45 * p.mouthRise, p.N, pl, ph), flareFloor(a, p.N, pl, ph)),
      cx: off * Math.cos(ang), cy: off * Math.sin(ang), z0: zRing + ringD / 2,
      lean: 0, leanDir: 0, rot: ang,
    }, nodes, members, 'mouth' + i);
    tris.push(...M.tris);
    // sew the mouth's base ring onto the collector ring
    for (const nid of M.base) tieTo(nid, 'mouth' + i);
    mouths.push({ ...M, ang, R0 });
  }

  // ── supports: the feet ──────────────────────────────────────────────────
  const supports = [];
  for (const L of legs) for (const nid of L.base) supports.push(nid);
  const supportSet = new Set(supports);

  // ── FLOORS: the p-levels ARE the storeys ────────────────────────────────
  //
  // This is the move that makes the family habitable rather than sculptural.
  // The p-levels are where the two rulings cross, so each one is already a ring
  // of real joints at a known radius — and `c` was chosen so consecutive levels
  // sit a storey apart. So a floor needs no new topology at its edge: it lands
  // on joints the lattice already has.
  //
  // What a floor adds is a CORE and its spokes. Every leg gets a column stack on
  // its own axis (the lift and stair, and structurally the leg's spine), and
  // each level is a wheel of radial beams from that core out to the ruling. The
  // plate is then an annulus from the core face to the facade, and its depth —
  // core to glass — is the number that decides whether anyone can live in it.
  // The core is proportioned to the plate, not fixed: a 6.4 m core inside a 7 m
  // leg is a building that is all lift and no flat. 1.6 m radius is the smallest
  // that holds a scissor stair and a car; 4 m is as big as one ever needs.
  const CORE_R = Math.max(1.6, Math.min(4, p.waist * 0.25));
  const MAX_DEPTH = 13;                   // beyond this a plan needs an atrium
  const floors = [];
  const coreIds = [];
  for (let li = 0; li < legs.length; li++) {
    const L = legs[li];
    const stack = [];
    for (let q = p.pLo; q <= p.pHi; q++) {
      const ids = [];
      for (let k = 0; k < p.N; k++) { const nid = L.idx.get(L.key(k, q)); if (nid != null) ids.push(nid); }
      if (!ids.length) continue;
      const z = nodes[ids[0]].z;
      // the lean is a pure horizontal shear in z, so a level is still a circle —
      // just a translated one, and the core sits at its centre
      const ccx = L.cx + p.tilt * z * Math.cos(L.ang);
      const ccy = L.cy + p.tilt * z * Math.sin(L.ang);
      const cid = nodes.length;
      nodes.push({ id: cid, x: r4(ccx), y: r4(ccy), z: r4(z), tag: 'core' + li, k: 0, p: q, ring: false, core: true });
      stack.push(cid);
      coreIds.push(cid);

      const rOut = p.waist / Math.cos((Math.PI * q) / p.N);
      const rIn = Math.min(CORE_R, rOut * 0.5);
      for (const nid of ids) members.push({ i: cid, j: nid, kind: 'spoke', tag: 'floor' + li });

      const depth = rOut - rIn;
      floors.push({
        leg: li, p: q, z: r4(z), cx: r4(ccx), cy: r4(ccy),
        rOut: r4(rOut), rIn: r4(rIn), depth: r2(depth),
        area: r2(Math.PI * (rOut * rOut - rIn * rIn)),
        deep: depth > MAX_DEPTH, ids, core: cid,
      });
    }
    // the core is continuous, which is what makes it a stair rather than a
    // stack of disconnected discs
    for (let i = 0; i + 1 < stack.length; i++) {
      members.push({ i: stack[i], j: stack[i + 1], kind: 'core', tag: 'core' + li });
    }
    L.core = stack;
  }

  // storey heights, measured rather than assumed
  const storeys = [];
  for (const L of legs) {
    for (let i = 0; i + 1 < L.core.length; i++) storeys.push(nodes[L.core[i + 1]].z - nodes[L.core[i]].z);
  }
  const storeyLo = storeys.length ? Math.min(...storeys) : 0;
  const storeyHi = storeys.length ? Math.max(...storeys) : 0;

  // ── the ring deck: the one shared floor ─────────────────────────────────
  //
  // The ring is the only place in the structure that every leg touches, so it is
  // the only floor that belongs to all of them. That makes it the street. Its
  // edges are already members — the inner and outer chords and the posts between
  // them — so the deck is a surface over a structure that exists.
  const ringDeck = {
    z: zRing, rOut: r2(Rring), rIn: r2(Rring - ringW),
    area: r2(Math.PI * (Rring * Rring - (Rring - ringW) ** 2)),
  };

  // ── member geometry: length, section, weight ────────────────────────────
  //
  // The rib diameter is a ratio of the MEAN BAY, measured off the lattice that
  // was actually built. Sizing it absolutely made the structural verdict depend
  // on how coarse the ruling happened to be, which is backwards: a coarser
  // ruling means longer members, and longer members need to be thicker.
  let bay = 0, bayN = 0;
  for (const mem of members) {
    if (mem.kind !== 'gen' && mem.kind !== 'hoop') continue;
    const A = nodes[mem.i], B = nodes[mem.j];
    bay += Math.hypot(B.x - A.x, B.y - A.y, B.z - A.z); bayN++;
  }
  bay = bayN ? bay / bayN : 4;
  const ribR = Math.max(0.12, (p.rib * bay * S.ribScale) / 2);
  const SEC = {
    gen: ribR, hoop: ribR * 0.72, // the ring now carries a public street, not just the legs' thrust
    ring: ribR * 1.9, ringweb: ribR * 1.5,
    // the core is the leg's spine and carries every floor above it; the spokes
    // are the floor beams spanning core to facade
    core: ribR * 2.2, spoke: ribR * 0.8,
    // The tie is the thickest thing in the building, and that is not arbitrary:
    // it is the ONLY load path from a leg into the ring, so the whole splay
    // thrust of the legs runs through three short bars per node. Sized at 0.8×
    // the generator they came back needing 22% reinforcement. This is the
    // junction, and a junction is where a concrete structure gets fat.
    tie: ribR * 1.7,
  };

  // A rib cast monolithically with the shell is a T-BEAM, and the shell is its
  // flange. This is not a refinement, it is most of the stiffness: the flange
  // sits a whole rib-radius off the neutral axis, so it multiplies I several
  // times over. It is the reason Candela's and Gaudí's shells are as thin as
  // they are, and leaving it out makes every clad seed read as overstressed.
  //
  // The flange thickness is not invented — it is the cladding weight divided by
  // the density of concrete, i.e. the shell the load case is already carrying.
  // Effective width follows ACI 318 §6.3.2: the bay, capped at 16 t.
  // Glass and bare lattice get none of this: a pane is not a flange.
  const tShell = S.composite ? S.clad / (MAT.rho * MAT.g) : 0;
  const bEff = Math.min(bay, 16 * tShell);
  const tee = (r) => {
    const Aw = Math.PI * r * r, Iw = (Math.PI * r ** 4) / 4;
    if (tShell <= 0) return { A: Aw, I: Iw, Aw, d: 1.6 * r };
    const Af = bEff * tShell, yf = r + tShell / 2;
    const A = Aw + Af, y = (Af * yf) / A;
    const I = Iw + Aw * y * y + (bEff * tShell ** 3) / 12 + Af * (yf - y) ** 2;
    // effective depth for flexure: the flange is the compression face
    return { A, I, Aw, d: 0.8 * (2 * r + tShell) };
  };

  let totalLen = 0, selfW = 0;
  for (const mem of members) {
    const A = nodes[mem.i], B = nodes[mem.j];
    const L = Math.hypot(B.x - A.x, B.y - A.y, B.z - A.z);
    const r = SEC[mem.kind] || ribR;
    // only the ribs lying IN the surface get a flange; the ring, its web, the
    // ties and the deck chords stand clear of it
    const inSurface = mem.kind === 'gen' || mem.kind === 'hoop';
    let S2 = inSurface ? tee(r)
      : { A: Math.PI * r * r, I: (Math.PI * r ** 4) / 4, Aw: Math.PI * r * r, d: 1.6 * r };

    // A SPOKE IS A STRIP OF SLAB, not a rod. Each one stands for the wedge of
    // floor between two lattice bays, so its section is that strip: width
    // 2πr/N, thickness t. That makes it weak in vertical bending (w·t³/12) and
    // very stiff in plane (t·w³/12), which is the diaphragm action that ties the
    // facade together — model it as a rod and the whole building comes out soft.
    // Its weight is zero here because loads() already bills the full slab.
    // ...and it spans, so it is a DOWNSTAND BEAM with that strip as its flange.
    // A 220 mm plate cannot cross 10 m from core to facade — the solve said so,
    // by asking for 15% reinforcement over a 176 mm lever arm. Depth follows the
    // span the way it does in any concrete frame.
    if (mem.kind === 'spoke') {
      const fl = floors.find((q) => q.core === mem.i);
      const w = Math.max(1.2, (TAU * (fl ? fl.rOut : 8)) / p.N);
      const t = 0.22;                                     // the slab
      const dw = Math.max(0.35, L / 16);                  // downstand depth from span
      const bw = 0.45 * dw;
      const Aw2 = bw * dw, Af = w * t;
      const A = Aw2 + Af;
      // flange on top, web hanging below it; measure from the slab's mid-plane
      const yw = -(t / 2 + dw / 2), y = (Aw2 * yw) / A;
      const I = (w * t ** 3) / 12 + Af * y * y + (bw * dw ** 3) / 12 + Aw2 * (yw - y) ** 2;
      S2 = {
        A, Aw: Aw2,                                       // loads() already bills the slab
        d: 0.85 * (dw + t),                               // effective depth for flexure
        I: (w * t ** 3) / 12,                             // weakest axis, for buckling
        Iz: I,                                            // local y is vertical: the span
        Iy: (t * w ** 3) / 12,                            // local z is in plane: the diaphragm
        J: (w * t ** 3) / 3 + (dw * bw ** 3) / 3,         // thin open section
      };
    }
    mem.L = r4(L);
    mem.r = r4(r);
    // NOT rounded: A and I span orders of magnitude, and r4 on a small deck
    // chord's πr⁴/4 rounds it to exactly zero, which makes Pcr zero and the
    // utilisation NaN
    mem.A = S2.A;
    mem.I = S2.I;
    if (S2.Iy != null) { mem.Iy = S2.Iy; mem.Iz = S2.Iz; mem.J = S2.J; }
    mem.d = r4(S2.d);                      // effective depth, for the steel bill
    // the flange's own weight is already counted as cladding — double-counting
    // it here would make the shell twice as heavy as it is
    mem.W = r2(S2.Aw * L * MAT.rho * MAT.g);
    totalLen += L; selfW += mem.W;
  }

  // ── the surface: area, weight, and the panels that carry it ─────────────
  let area = 0;
  for (const t of tris) {
    const [A, B, C] = t.map((i) => nodes[i]);
    const ux = B.x - A.x, uy = B.y - A.y, uz = B.z - A.z;
    const vx = C.x - A.x, vy = C.y - A.y, vz = C.z - A.z;
    area += 0.5 * Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx);
  }

  const zTop = nodes.reduce((mx, n) => Math.max(mx, n.z), 0);
  const rMax = nodes.reduce((mx, n) => Math.max(mx, Math.hypot(n.x, n.y)), 0);

  const b = {
    version: VERSION, params: p, seed: p.seed,
    programme: p.programme, programmeLabel: T.label, surface: p.surface, surfaceLabel: S.label,
    nodes, members, tris, legs, mouths, floors, ringDeck, coreIds, ringIds, supports, supportSet,
    ring: {
      z: zRing, R: Rring, n: ringN, depth: r2(ringD), width: r2(ringW),
      upper: ringUp, lower: ringLo, inner: ringIn, ids: ringIds,
    },
    height: r2(zTop), radius: r2(rMax), legHeight: r2(legH),
    stats: {
      nodes: nodes.length, members: members.length, triangles: tris.length,
      length: r2(totalLen), surfaceArea: r2(area), meanBay: r2(bay), ribDia: r2(ribR * 2),
      selfWeight: r2(selfW), cladWeight: r2(area * S.clad),
      storeys: p.pHi - p.pLo, storeyLo: r2(storeyLo), storeyHi: r2(storeyHi),
      // Euler characteristic of a genus-0 surface with n+m boundary circles is
      // 2 − 2g − b = 2 − (n + m). Reporting it is the cheapest possible check
      // that the thing we built is the thing we said we built.
      boundaries: p.legs + p.mouths,
      euler: 2 - (p.legs + p.mouths),
    },
  };
  return b;
}

/* ──────────────────────────── the accommodation ─────────────────────────── */
//
// What the thing IS, as a place rather than as a structure. The section a
// hyperboloid gives you is not incidental: floor area per storey is
// π(a²(1+(z/c)²) − r_core²), so it has a MINIMUM at the waist and opens out at
// both ends. That is a real building type — a generous public ground, a pinched
// middle where the plates are small enough to be single dwellings or services,
// and a wide crown. The schedule reads that off rather than asserting it.

export const EFFICIENCY = 0.82;   // net internal ÷ gross, after core and structure
export const MAX_DEPTH = 13;      // core-to-facade beyond which a plan needs daylight from within

export function schedule(b) {
  const T = PROGRAMMES[b.programme];
  const unit = T.unit || 0;
  const rows = [];
  const byLeg = new Map();
  for (const f of b.floors) {
    if (!byLeg.has(f.leg)) byLeg.set(f.leg, []);
    byLeg.get(f.leg).push(f);
  }
  for (const [leg, list] of byLeg) {
    list.sort((a, c) => a.z - c.z);
    for (let i = 0; i < list.length; i++) {
      const f = list[i];
      const net = f.area * EFFICIENCY;
      // the use follows the plate: the ground is where the public gets in, the
      // top is the terrace, a plate too small for two dwellings is a service
      // level, and anything deeper than daylight reaches is flagged rather than
      // quietly counted as habitable
      let use = 'dwelling';
      if (i === 0) use = 'commons';
      else if (i === list.length - 1) use = 'terrace';
      // one dwelling is still a dwelling floor. The waist plates are small by
      // construction — that is the type — so a threshold of nearly two homes
      // classified the whole middle of a housing block as plant.
      else if (unit && net < unit * 1.15) use = 'service';
      else if (!unit) use = 'hall';
      const homes = (use === 'dwelling' && unit) ? Math.floor(net / unit) : 0;
      rows.push({
        leg, level: i, z: f.z, rOut: f.rOut, rIn: f.rIn, depth: f.depth,
        area: f.area, net: r2(net), use, homes, deep: f.deep,
      });
    }
  }
  const gia = rows.reduce((a, r) => a + r.area, 0) + (b.ringDeck ? b.ringDeck.area : 0);
  const homes = rows.reduce((a, r) => a + r.homes, 0);
  const deep = rows.filter((r) => r.deep).length;
  // footprint = the ground the legs actually stand on, which is what a density
  // is measured against
  const site = Math.PI * Math.pow(b.radius, 2);
  return {
    rows,
    gia: r2(gia),
    net: r2(rows.reduce((a, r) => a + r.net, 0)),
    homes,
    people: Math.round(homes * 2.3),
    street: b.ringDeck ? b.ringDeck.area : 0,
    storeys: b.stats.storeys,
    deep,
    plotRatio: r2(gia / Math.max(1, site)),
    density: homes ? Math.round(homes / (site / 10000)) : 0,   // homes per hectare of site
    note: unit
      ? `${homes} homes over ${byLeg.size} legs, plus a ${Math.round(b.ringDeck ? b.ringDeck.area : 0)} m² street in the air`
      : `${r2(gia)} m² of hall and terrace over ${byLeg.size} legs`,
  };
}

/* ───────────────────────── render-side geometry ─────────────────────────── */

// Members as capsules between two points — the renderer instances one cylinder
// and orients it, so a 4000-member lattice is still one draw call per kind.
export function memberParts(b) {
  return b.members.map((m) => {
    const A = b.nodes[m.i], B = b.nodes[m.j];
    return {
      kind: m.kind, r: m.r, L: m.L,
      ax: A.x, ay: A.y, az: A.z, bx: B.x, by: B.y, bz: B.z,
      mx: (A.x + B.x) / 2, my: (A.y + B.y) / 2, mz: (A.z + B.z) / 2,
    };
  });
}

// The shell itself, as a flat triangle soup ready for a BufferGeometry.
//
// UVs are in METRES along the surface, not normalised: u is arc length around
// the axis, v is height. That keeps a trencadís shard the same size everywhere
// on the building instead of stretching it wherever the hyperboloid flares.
export function surfaceGeometry(b, texScale = 2) {
  const pos = new Float32Array(b.tris.length * 9);
  const uv = new Float32Array(b.tris.length * 6);
  let o = 0, w = 0;
  for (const t of b.tris) {
    // unwrap each triangle about its own centroid's bearing, so a triangle
    // straddling the ±π seam does not get smeared across the whole texture
    let cth = 0;
    for (const i of t) { const n = b.nodes[i]; cth += Math.atan2(n.y, n.x); }
    cth /= 3;
    for (const i of t) {
      const n = b.nodes[i];
      pos[o++] = n.x; pos[o++] = n.y; pos[o++] = n.z;
      const r = Math.hypot(n.x, n.y);
      let d = Math.atan2(n.y, n.x) - cth;
      d = Math.atan2(Math.sin(d), Math.cos(d));            // wrap into (−π, π]
      uv[w++] = ((cth + d) * r) / texScale;
      uv[w++] = n.z / texScale;
    }
  }
  return { position: pos, uv, count: b.tris.length * 3 };
}

// Where the surface is, as a function of height — used by the drawings and by
// anyone who wants to know how wide the thing is at eye level.
export function profile(b, samples = 40) {
  const out = [];
  const top = b.height;
  for (let i = 0; i <= samples; i++) {
    const z = (i / samples) * top;
    let rMin = Infinity, rMax = 0, hit = 0;
    for (const n of b.nodes) {
      if (Math.abs(n.z - z) > top / samples) continue;
      const r = Math.hypot(n.x, n.y);
      rMin = Math.min(rMin, r); rMax = Math.max(rMax, r); hit++;
    }
    out.push({ z: r2(z), rMin: hit ? r2(rMin) : 0, rMax: r2(rMax), n: hit });
  }
  return out;
}

// tjs/brut/arch.js — THE BRUTALIST KERNEL. Pure, DOM-free, three.js-free.
//
// One seed → one building, for ever, on any machine. Everything downstream is a
// VIEW of the same object: the 3D bench at /brut/ renders `parts()`, the drawing
// office at /brut/plan/ draws `levels[].rooms` and `facades[]`. They are two
// sites over one generator, so a permalink is meaningful in both:
//
//     /brut/?s=barbican-7          ← the model
//     /brut/plan/?s=barbican-7     ← its blueprints
//
// and the two agree, bay for bay, because neither of them generates anything.
//
// House rules (borges/js/prng.js lineage, same as swarm3d.js):
//   • xmur3 → mulberry32, seeded from a STRING, salted per sub-stream so the
//     massing draw can't correlate with the facade draw. No Date.now(), no bare
//     Math.random() anywhere in the generator — the only unseeded roll in the
//     whole surface is the "roll" button choosing WHICH deterministic seed to open.
//   • Zero dependencies, no build step: the tjs deploy stages this dir's own
//     files, so everything the kernel needs is inlined here.
//   • Metres, throughout. x = east/west, z = north/south, y = up. Rects are
//     CENTRE-based: {x, z, w, d} — the form three.js wants, converted to
//     min/max by the helpers below wherever the plan solver wants corners.
//
// The generator is a pipeline, each stage a pure function of the last:
//
//   params ─ massing ─→ levels[].wings ─ cores ─→ shafts ─ plan ─→ rooms
//                            │                                      │
//                            └──────── facade ─→ bays ──────────────┴─→ parts
//
// so a floor plan is not decoration on a mass, and a mass is not a box drawn
// around a plan: both fall out of the same plate polygons.

export const VERSION = 'brut/1';

/* ───────────────────────────────── PRNG ─────────────────────────────────── */

function xmur3(s) {
  let h = 1779033703 ^ s.length;
  for (let i = 0; i < s.length; i++) { h = Math.imul(h ^ s.charCodeAt(i), 3432918353); h = (h << 13) | (h >>> 19); }
  return () => { h = Math.imul(h ^ (h >>> 16), 2246822507); h = Math.imul(h ^ (h >>> 13), 3266489909); return (h ^= h >>> 16) >>> 0; };
}
function mulberry32(a) {
  return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

// A salted sub-stream. `Rand(seed, 'facade')` and `Rand(seed, 'massing')` are
// independent, so adding a facade draw never reshuffles the massing.
export function Rand(seed, salt = '') {
  const next = mulberry32(xmur3(String(seed) + '::' + salt)());
  const R = {
    f: () => next(),
    range: (lo, hi) => lo + next() * (hi - lo),
    int: (lo, hi) => lo + Math.floor(next() * (hi - lo + 1)),
    chance: (p) => next() < p,
    pick: (arr) => arr[Math.floor(next() * arr.length)],
    // pick weighted by an [item, weight] table
    pickW: (table) => {
      let total = 0; for (const t of table) total += t[1];
      let r = next() * total;
      for (const t of table) { r -= t[1]; if (r <= 0) return t[0]; }
      return table[table.length - 1][0];
    },
    // snap a length to a multiple of `step`, at least `min` steps
    snap: (v, step, minSteps = 1) => Math.max(minSteps, Math.round(v / step)) * step,
    shuffle: (arr) => { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(next() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; },
  };
  return R;
}

/* ────────────────────────────── rect helpers ────────────────────────────── */

const R = {
  make: (x, z, w, d) => ({ x, z, w, d }),
  fromMinMax: (x0, z0, x1, z1) => ({ x: (x0 + x1) / 2, z: (z0 + z1) / 2, w: x1 - x0, d: z1 - z0 }),
  x0: (r) => r.x - r.w / 2, x1: (r) => r.x + r.w / 2,
  z0: (r) => r.z - r.d / 2, z1: (r) => r.z + r.d / 2,
  area: (r) => r.w * r.d,
  contains: (outer, inner, eps = 1e-6) =>
    R.x0(inner) >= R.x0(outer) - eps && R.x1(inner) <= R.x1(outer) + eps &&
    R.z0(inner) >= R.z0(outer) - eps && R.z1(inner) <= R.z1(outer) + eps,
  overlaps: (a, b, eps = 1e-6) =>
    R.x0(a) < R.x1(b) - eps && R.x1(a) > R.x0(b) + eps &&
    R.z0(a) < R.z1(b) - eps && R.z1(a) > R.z0(b) + eps,
  // a minus b along x only (b spans a's full depth or is ignored) → 0..2 pieces
  splitX: (a, x0, x1) => {
    const out = [];
    if (x0 > R.x0(a) + 1e-6) out.push(R.fromMinMax(R.x0(a), R.z0(a), Math.min(x0, R.x1(a)), R.z1(a)));
    if (x1 < R.x1(a) - 1e-6) out.push(R.fromMinMax(Math.max(x1, R.x0(a)), R.z0(a), R.x1(a), R.z1(a)));
    return out.filter((r) => r.w > 1e-6);
  },
  // a MINUS a list of rects, as a set of disjoint rects. Cut the combined
  // coordinate lines into a grid, drop the covered cells, then merge each column
  // back down its z-run so the result is a handful of pieces, not a mosaic.
  // This is what makes a roof possible: the exposed part of a plate is exactly
  // the part the level above does not stand on.
  subtract: (a, list) => {
    const bs = list.filter((b) => R.overlaps(a, b, 1e-6));
    if (!bs.length) return [{ x: a.x, z: a.z, w: a.w, d: a.d }];
    const xs = new Set([R.x0(a), R.x1(a)]), zs = new Set([R.z0(a), R.z1(a)]);
    for (const b of bs) {
      for (const v of [R.x0(b), R.x1(b)]) if (v > R.x0(a) + 1e-9 && v < R.x1(a) - 1e-9) xs.add(v);
      for (const v of [R.z0(b), R.z1(b)]) if (v > R.z0(a) + 1e-9 && v < R.z1(a) - 1e-9) zs.add(v);
    }
    const X = [...xs].sort((p, q) => p - q), Z = [...zs].sort((p, q) => p - q);
    const keep = [];
    for (let i = 0; i < X.length - 1; i++) {
      keep.push([]);
      for (let k = 0; k < Z.length - 1; k++) {
        const cx = (X[i] + X[i + 1]) / 2, cz = (Z[k] + Z[k + 1]) / 2;
        keep[i].push(!bs.some((b) => cx > R.x0(b) && cx < R.x1(b) && cz > R.z0(b) && cz < R.z1(b)));
      }
    }
    const out = [];
    for (let i = 0; i < X.length - 1; i++) {
      let k = 0;
      while (k < Z.length - 1) {
        if (!keep[i][k]) { k++; continue; }
        let e = k;
        while (e + 1 < Z.length - 1 && keep[i][e + 1]) e++;
        out.push(R.fromMinMax(X[i], Z[k], X[i + 1], Z[e + 1]));
        k = e + 1;
      }
    }
    // Slivers below ~20 mm are floating-point residue from grid snapping, not
    // roofs; keeping them would emit a slab that rounds to zero extent.
    return out.filter((r) => r.w > 0.02 && r.d > 0.02);
  },
  splitZ: (a, z0, z1) => {
    const out = [];
    if (z0 > R.z0(a) + 1e-6) out.push(R.fromMinMax(R.x0(a), R.z0(a), R.x1(a), Math.min(z0, R.z1(a))));
    if (z1 < R.z1(a) - 1e-6) out.push(R.fromMinMax(R.x0(a), Math.max(z1, R.z0(a)), R.x1(a), R.z1(a)));
    return out.filter((r) => r.d > 1e-6);
  },
};
export { R as rect };

const round2 = (v) => Math.round(v * 100) / 100;

/* ──────────────────────────── the module alphabet ───────────────────────── */
//
// A facade bay is one letter of this alphabet. The 3D bench turns each into
// boxes; the drawing office turns each into an elevation glyph. Depth is how far
// it stands proud of (+) or is set back into (−) the structural line — the single
// number that makes a brutalist elevation read as relief rather than pattern.

export const MODULES = {
  pier:    { label: 'pier',            depth:  0.75, glass: 0.00, note: 'full-height structural pier, board-marked' },
  slit:    { label: 'slit',            depth: -0.55, glass: 0.22, note: 'narrow vertical slot between piers' },
  band:    { label: 'ribbon',          depth: -0.40, glass: 0.62, note: 'recessed horizontal ribbon + spandrel' },
  brise:   { label: 'brise-soleil',    depth:  1.05, glass: 0.55, note: 'deep egg-crate shading grid' },
  oriel:   { label: 'oriel',           depth:  1.35, glass: 0.48, note: 'projecting study box, glazed on three faces' },
  blank:   { label: 'blank',           depth:  0.00, glass: 0.00, note: 'blank in-situ wall, board-marked' },
  recess:  { label: 'recess',          depth: -0.85, glass: 0.10, note: 'deep shadow panel' },
  vent:    { label: 'louvre',          depth:  0.25, glass: 0.00, note: 'plant louvre, cast fins' },
  balcony: { label: 'balcony',         depth:  1.80, glass: 0.35, note: 'cantilevered access deck / balcony' },
  lancet:  { label: 'lancet',          depth: -0.95, glass: 0.30, note: 'tall narrow light-slot' },
  rose:    { label: 'rose',            depth: -0.65, glass: 0.55, note: 'rose light — deep-splayed circular opening' },
  open:    { label: 'open',            depth: -0.20, glass: 0.00, note: 'open to air (pilotis / deck edge)' },
  buttress:{ label: 'buttress',        depth:  1.90, glass: 0.00, note: 'raking buttress fin' },
};
export const MODULE_IDS = Object.keys(MODULES);

/* ───────────────────────────────  typologies  ───────────────────────────── */
//
// Each typology is a *bias*, not a template: it names the ranges the seed draws
// inside, the massing moves it is allowed, its facade alphabet, and its room
// programme. Two seeds of the same typology are siblings, not twins.

export const TYPOLOGIES = {
  cathedral: {
    label: 'Cathedral',
    blurb: 'Nave, aisles, transept, apse — a béton-brut basilica with a detached campanile.',
    plan: 'sacred',
    levels: [1, 1], floorH: [22, 30], bay: [5.4, 7.2],
    bx: [4, 6], bz: [9, 15],
    massing: ['basilica'],
    shapes: ['basilica'],
    alphabet: [['buttress', 3], ['lancet', 3], ['blank', 2], ['recess', 1.4], ['pier', 1.2]],
    programs: [],
    pilotisP: 0, plantP: 0, towerP: 1,
  },
  civic: {
    label: 'Civic hall',
    blurb: 'A city hall / library in the inverted-ziggurat manner: heavy above, undercut below.',
    plan: 'cellular',
    levels: [5, 9], floorH: [4.2, 5.4], bay: [7.2, 9.0],
    bx: [7, 11], bz: [6, 9],
    massing: ['inverted', 'setback', 'ziggurat'],
    shapes: ['bar', 'cross', 'court'],
    alphabet: [['pier', 3.2], ['slit', 2.6], ['recess', 1.8], ['brise', 1.4], ['blank', 1.6], ['band', 1.0]],
    programs: [['council chamber', 0.6], ['committee', 1.4], ['reading room', 1.6], ['stacks', 1.4],
               ['registry', 1.0], ['office', 2.4], ['exhibition', 0.8], ['store', 1.0], ['WC', 0.9]],
    pilotisP: 0.7, plantP: 0.8, towerP: 0.5,
  },
  office: {
    label: 'Office block',
    blurb: 'Deep-plan speculative floors, service core, a grid you could set your watch by.',
    plan: 'cellular',
    levels: [8, 18], floorH: [3.5, 4.1], bay: [6.0, 8.1],
    bx: [6, 10], bz: [5, 8],
    massing: ['slab', 'setback', 'inverted', 'stagger'],
    shapes: ['bar', 'L', 'T'],
    alphabet: [['band', 3.4], ['pier', 2.6], ['brise', 2.0], ['slit', 1.6], ['blank', 1.2], ['recess', 1.0]],
    programs: [['open office', 3.0], ['office', 2.6], ['meeting', 1.8], ['breakout', 1.0],
               ['print', 0.7], ['server', 0.5], ['store', 1.0], ['WC', 0.9]],
    pilotisP: 0.5, plantP: 0.9, towerP: 0.7,
  },
  housing: {
    label: 'Housing slab',
    blurb: 'Deck access, cross-over maisonettes, balconies hung off the frame.',
    plan: 'cellular',
    levels: [6, 14], floorH: [2.9, 3.3], bay: [5.4, 6.6],
    bx: [10, 16], bz: [3, 5],
    massing: ['slab', 'stagger', 'setback'],
    shapes: ['bar', 'L'],
    alphabet: [['balcony', 3.6], ['pier', 2.2], ['slit', 1.8], ['blank', 1.6], ['recess', 1.2], ['band', 1.0]],
    programs: [['2-bed flat', 3.0], ['1-bed flat', 2.2], ['3-bed flat', 1.4], ['studio', 1.0],
               ['store', 0.9], ['refuse', 0.5], ['drying room', 0.5]],
    pilotisP: 0.75, plantP: 0.3, towerP: 0.9,
  },
  lab: {
    label: 'Research block',
    blurb: 'Served and servant spaces: a blank plant tower strapped to a glazed working floor.',
    plan: 'cellular',
    levels: [5, 10], floorH: [4.0, 4.8], bay: [6.6, 8.4],
    bx: [6, 9], bz: [5, 7],
    massing: ['slab', 'setback', 'stagger'],
    shapes: ['bar', 'T', 'cross'],
    alphabet: [['vent', 2.4], ['band', 2.6], ['pier', 2.4], ['blank', 2.2], ['brise', 1.4], ['recess', 1.0]],
    programs: [['wet lab', 2.6], ['dry lab', 1.8], ['write-up', 1.8], ['tissue culture', 0.8],
               ['cold room', 0.6], ['plant', 1.0], ['store', 1.0], ['WC', 0.8]],
    pilotisP: 0.25, plantP: 1.0, towerP: 1.0,
  },
  carpark: {
    label: 'Car park',
    blurb: 'The purest brutalism there is: slab, upstand, ramp, nothing else.',
    plan: 'deck',
    levels: [4, 8], floorH: [2.8, 3.2], bay: [7.5, 8.4],
    bx: [6, 9], bz: [5, 8],
    massing: ['slab', 'stagger'],
    shapes: ['bar'],
    alphabet: [['open', 4.0], ['pier', 2.6], ['blank', 1.4], ['recess', 1.0]],
    programs: [],
    pilotisP: 0.2, plantP: 0.2, towerP: 0.9,
  },
};
export const TYPOLOGY_IDS = Object.keys(TYPOLOGIES);

/* ─────────────────────────── params & permalinks ────────────────────────── */
//
// `deriveParams(seed)` is the full, deterministic reading of a seed. A permalink
// carries the seed plus ONLY the fields a human has since overridden, so the
// canonical link stays short and every knob is still addressable.

const P_KEYS = ['t', 'n', 'bay', 'bx', 'bz', 'h', 'm', 'sh', 'cw', 'sym', 'pil', 'pl', 'tw', 'rh'];

export function deriveParams(seed, typology) {
  const s = String(seed);
  const rt = Rand(s, 'typology');
  const t = (typology && TYPOLOGIES[typology]) ? typology : rt.pick(TYPOLOGY_IDS);
  const T = TYPOLOGIES[t];
  const r = Rand(s, 'params/' + t);

  const bay = round2(r.range(T.bay[0], T.bay[1]));
  const p = {
    seed: s,
    typology: t,
    levels: r.int(T.levels[0], T.levels[1]),
    bay,
    bx: r.int(T.bx[0], T.bx[1]),
    bz: r.int(T.bz[0], T.bz[1]),
    floorH: round2(r.range(T.floorH[0], T.floorH[1])),
    massing: r.pick(T.massing),
    shape: r.pick(T.shapes),
    corridorW: round2(r.range(2.1, 2.9)),
    symmetric: r.chance(0.55),
    pilotis: r.chance(T.pilotisP),
    plant: r.chance(T.plantP),
    towers: r.chance(T.towerP) ? (r.chance(0.25) ? 2 : 1) : 0,
    rhythm: null, // filled below
  };
  // The facade rhythm: a repeating cell of 2..5 letters drawn from the typology's
  // alphabet. This is the single most legible thing about a brutalist elevation,
  // so it gets its own sub-stream and its own permalink field.
  const rr = Rand(s, 'rhythm/' + t);
  const period = rr.int(2, 5);
  const cell = [];
  for (let i = 0; i < period; i++) cell.push(rr.pickW(T.alphabet));
  // a rhythm of one repeated letter reads as no rhythm at all — force contrast
  if (cell.every((c) => c === cell[0])) cell[cell.length - 1] = rr.pickW(T.alphabet.filter((a) => a[0] !== cell[0]));
  p.rhythm = cell;
  return p;
}

// Query → canonical params. Accepts a query string, a URLSearchParams, or a
// plain object. Unknown/invalid overrides are dropped rather than throwing: a
// mangled permalink still opens the seed's building.
export function resolveParams(query) {
  const q = toMap(query);
  const seed = (q.s != null && String(q.s).length) ? String(q.s) : 'brut';
  const p = deriveParams(seed, q.t);
  const T = TYPOLOGIES[p.typology];
  const num = (k, lo, hi, dp = 2) => {
    if (q[k] == null || q[k] === '') return null;
    const v = Number(q[k]);
    if (!isFinite(v)) return null;
    return Math.round(Math.min(hi, Math.max(lo, v)) * 10 ** dp) / 10 ** dp;
  };
  const int = (k, lo, hi) => { const v = num(k, lo, hi, 0); return v == null ? null : Math.round(v); };
  const set = (k, v) => { if (v != null) p[k] = v; };

  set('levels', int('n', 1, 40));
  set('bay', num('bay', 3.6, 12));
  set('bx', int('bx', 2, 24));
  set('bz', int('bz', 2, 24));
  set('floorH', num('h', 2.4, 34));
  set('corridorW', num('cw', 1.6, 4.5));
  if (q.m && T.massing.concat(['slab', 'setback', 'inverted', 'ziggurat', 'stagger', 'basilica']).includes(q.m)) p.massing = q.m;
  if (q.sh && ['bar', 'L', 'T', 'cross', 'court', 'basilica'].includes(q.sh)) p.shape = q.sh;
  if (q.sym != null && q.sym !== '') p.symmetric = q.sym === '1' || q.sym === 'true';
  if (q.pil != null && q.pil !== '') p.pilotis = q.pil === '1' || q.pil === 'true';
  if (q.pl != null && q.pl !== '') p.plant = q.pl === '1' || q.pl === 'true';
  set('towers', int('tw', 0, 2));
  if (q.rh) {
    const cell = String(q.rh).split(',').map((c) => c.trim()).filter((c) => MODULES[c]);
    if (cell.length) p.rhythm = cell.slice(0, 8);
  }
  // the sacred plan is a different beast — keep it coherent whatever the query says
  if (p.typology === 'cathedral') { p.massing = 'basilica'; p.shape = 'basilica'; p.levels = 1; }
  return p;
}

// Canonical permalink: seed first, then only what differs from the seed's own
// reading. Same params ⇒ same string, so the two sites' links compare equal.
export function paramsToQuery(p) {
  const base = deriveParams(p.seed, p.typology);
  const out = ['s=' + encodeURIComponent(p.seed)];
  if (p.typology !== deriveParams(p.seed).typology) out.push('t=' + p.typology);
  const add = (k, v, bv) => { if (v !== bv) out.push(k + '=' + v); };
  add('n', p.levels, base.levels);
  add('bay', p.bay, base.bay);
  add('bx', p.bx, base.bx);
  add('bz', p.bz, base.bz);
  add('h', p.floorH, base.floorH);
  add('cw', p.corridorW, base.corridorW);
  add('m', p.massing, base.massing);
  add('sh', p.shape, base.shape);
  add('tw', p.towers, base.towers);
  if (p.symmetric !== base.symmetric) out.push('sym=' + (p.symmetric ? 1 : 0));
  if (p.pilotis !== base.pilotis) out.push('pil=' + (p.pilotis ? 1 : 0));
  if (p.plant !== base.plant) out.push('pl=' + (p.plant ? 1 : 0));
  if (p.rhythm.join(',') !== base.rhythm.join(',')) out.push('rh=' + p.rhythm.join(','));
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
      const k = decodeURIComponent(i < 0 ? part : part.slice(0, i));
      out[k] = i < 0 ? '' : decodeURIComponent(part.slice(i + 1).replace(/\+/g, ' '));
    }
    return out;
  }
  if (typeof query.get === 'function') { const out = {}; for (const [k, v] of query) out[k] = v; return out; }
  return query;
}

// The one place an unseeded roll is legal — and it only chooses WHICH
// deterministic building to open. Pass your own rnd to keep even this pure.
const SEED_A = ['bunker', 'barbican', 'tribune', 'ziggurat', 'cast', 'shutter', 'raker', 'plinth', 'brut',
  'monolith', 'undercroft', 'buttress', 'clerestory', 'aggregate', 'formwork', 'pylon', 'nave', 'silo'];
const SEED_B = ['ash', 'gull', 'flint', 'moss', 'slate', 'rook', 'sump', 'lark', 'iron', 'brine', 'quarry', 'fern'];
export function rollSeed(rnd = Math.random) {
  const a = SEED_A[Math.floor(rnd() * SEED_A.length)];
  const b = SEED_B[Math.floor(rnd() * SEED_B.length)];
  return a + '-' + b + '-' + (100 + Math.floor(rnd() * 900));
}

/* ────────────────────────────────  massing  ─────────────────────────────── */
//
// A plate is a set of disjoint rects ("wings"). The massing schedule is a
// per-level transform of the base plate: brutalism's characteristic moves are
// nearly all schedules — the inverted ziggurat (each floor larger than the one
// below), the setback, the stagger, the undercut plinth.

// Wings must be DISJOINT — a plan solver run twice over the same square would
// otherwise put two rooms in it, and the drawings and the model would both be
// lying. So the non-rectangular shapes are cut as complements, not overlaid
// bars, and every part dimension is snapped to whole structural bays.
function baseShape(shape, w, d, bay) {
  const sn = (v, lo, hi) => Math.min(hi, Math.max(lo, Math.round(v / bay) * bay));
  switch (shape) {
    case 'L': {
      const aw = sn(w * 0.55, bay, w - bay);
      const bd = sn(d * 0.5, bay, d - bay);
      return [R.make(-w / 2 + aw / 2, 0, aw, d),
              R.make(-w / 2 + aw + (w - aw) / 2, -d / 2 + bd / 2, w - aw, bd)];
    }
    case 'T': {
      const sd = sn(d * 0.5, bay, d - bay);
      const tw = sn(w * 0.46, bay, w);
      return [R.make(0, -d / 2 + sd / 2, w, sd),
              R.make(0, -d / 2 + sd + (d - sd) / 2, tw, d - sd)];
    }
    case 'cross': {
      const armD = sn(d * 0.42, bay, d - bay);
      const armW = sn(w * 0.36, bay, w);
      const stub = (d - armD) / 2;
      return [R.make(0, 0, w, armD),
              R.make(0, -armD / 2 - stub / 2, armW, stub),
              R.make(0, armD / 2 + stub / 2, armW, stub)];
    }
    case 'court': {
      // four bars around a courtyard, cut so no two share a square metre
      const t = sn(Math.min(w, d) * 0.26, bay, Math.min(w, d) / 2 - bay / 2);
      return [
        R.make(0, -d / 2 + t / 2, w, t),
        R.make(0, d / 2 - t / 2, w, t),
        R.make(-w / 2 + t / 2, 0, t, d - 2 * t),
        R.make(w / 2 - t / 2, 0, t, d - 2 * t),
      ];
    }
    case 'bar':
    default: return [R.make(0, 0, w, d)];
  }
}

// scale + offset factors for level i of n under a schedule
function scheduleAt(massing, i, n, rnd) {
  const f = n <= 1 ? 0 : i / (n - 1);
  switch (massing) {
    case 'inverted': {
      // grows upward in discrete steps of a bay — the Boston-City-Hall move
      const steps = Math.min(4, Math.max(2, Math.round(n / 3)));
      const k = Math.floor(f * steps);
      return { sx: 0.78 + 0.075 * k, sz: 0.80 + 0.070 * k, dx: 0, dz: 0 };
    }
    case 'ziggurat': {
      const steps = Math.min(4, Math.max(2, Math.round(n / 3)));
      const k = Math.floor(f * steps);
      return { sx: 1.02 - 0.075 * k, sz: 1.02 - 0.070 * k, dx: 0, dz: 0 };
    }
    case 'setback': {
      const cut = i / n >= 0.6;
      return { sx: cut ? 0.74 : 1, sz: cut ? 0.86 : 1, dx: cut ? -0.06 : 0, dz: 0 };
    }
    case 'stagger': {
      const odd = i % 2 === 1;
      return { sx: 1, sz: odd ? 0.86 : 1, dx: 0, dz: odd ? (rnd > 0.5 ? 0.07 : -0.07) : 0 };
    }
    case 'slab':
    default: return { sx: 1, sz: 1, dx: 0, dz: 0 };
  }
}

function massing(p) {
  const T = TYPOLOGIES[p.typology];
  const rm = Rand(p.seed, 'massing');
  const w = p.bx * p.bay, d = p.bz * p.bay;
  const stagJitter = rm.f();
  const levels = [];
  let y = 0;
  const podium = (p.massing === 'inverted' || p.massing === 'ziggurat') ? 1 : 0;

  for (let i = 0; i < p.levels; i++) {
    const h = i === 0 && podium ? p.floorH * 1.25 : p.floorH;
    const s = (i === 0 && podium) ? { sx: 1, sz: 1, dx: 0, dz: 0 } : scheduleAt(p.massing, i, p.levels, stagJitter);
    // Snap the scaled plate back onto the structural grid — a brutalist frame does
    // not do fractional bays — then RE-CUT the shape at that size, rather than
    // scaling the pieces individually, so the wings stay disjoint at every level.
    const lw = Math.max(p.bay * 2, Math.round((w * s.sx) / p.bay) * p.bay);
    const ld = Math.max(p.bay * 2, Math.round((d * s.sz) / p.bay) * p.bay);
    const wings = baseShape(p.shape, lw, ld, p.bay)
      .map((r) => R.make(round2(r.x + s.dx * w), round2(r.z + s.dz * d), round2(r.w), round2(r.d)))
      .filter((r) => r.w > 0.5 && r.d > 0.5);
    levels.push({ index: i, y: round2(y), h: round2(h), wings, rooms: [], corridors: [], cores: [], columns: [], voids: [], label: '' });
    y += h;
  }
  return { levels, height: round2(y), site: { w: round2(w * 1.35), d: round2(d * 1.35) } };
}

/* ───────────────────────────────── cores ───────────────────────────────── */
//
// Cores are the one thing that must be true on EVERY level, so they are sized
// against the SMALLEST plate the building ever has. Anything else and the top
// floor's stair lands in mid-air — which is exactly the class of bug a shared
// kernel is meant to make impossible for the plan and the model to disagree on.

function placeCores(p, mass) {
  const rc = Rand(p.seed, 'cores');
  // the wing that persists all the way up: intersect wing 0 across levels
  let x0 = -1e9, x1 = 1e9, z0 = -1e9, z1 = 1e9;
  for (const L of mass.levels) {
    const wg = L.wings[0];
    x0 = Math.max(x0, R.x0(wg)); x1 = Math.min(x1, R.x1(wg));
    z0 = Math.max(z0, R.z0(wg)); z1 = Math.min(z1, R.z1(wg));
  }
  const spine = R.fromMinMax(x0, z0, x1, z1);
  const cw = Math.min(p.bay * 1.6, spine.w * 0.3);
  const cd = Math.min(p.bay * 1.2, spine.d * 0.55);
  const cores = [];
  const along = spine.w >= spine.d; // cores march along the long axis
  const n = spine.w * spine.d > 900 ? 2 : 1;
  for (let k = 0; k < n; k++) {
    const t = n === 1 ? (p.symmetric ? 0.5 : rc.range(0.34, 0.66)) : (k === 0 ? 0.24 : 0.76);
    const cx = along ? R.x0(spine) + t * spine.w : spine.x;
    const cz = along ? spine.z : R.z0(spine) + t * spine.d;
    cores.push({
      x: round2(cx), z: round2(cz),
      w: round2(along ? cw : cd), d: round2(along ? cd : cw),
      kind: k === 0 ? 'stair + lift' : 'stair',
    });
  }
  return cores;
}

/* ─────────────────────────── the cellular floor plan ────────────────────── */
//
// A corridor spine, cores subtracted, then a BSP over what is left. Rooms snap
// to the structural grid where they can — a plan whose partitions land on
// columns is the difference between a drawing and a *drawing*.

function planCellular(p, level, cores, rnd) {
  const T = TYPOLOGIES[p.typology];
  const rooms = [], corridors = [], voids = [];
  const isGround = level.index === 0;
  const isTop = level.index === p.levels - 1;
  const minRoom = Math.max(3.0, p.bay * 0.45);

  for (const wing of level.wings) {
    const along = wing.w >= wing.d;                 // corridor runs along the long axis
    const span = along ? wing.d : wing.w;           // cross-wing dimension
    const doubleLoaded = span >= 2 * minRoom + p.corridorW + 1.2;
    const corW = p.corridorW;

    // corridor rect
    let cor;
    if (doubleLoaded) {
      cor = along ? R.make(wing.x, wing.z, wing.w, corW) : R.make(wing.x, wing.z, corW, wing.d);
    } else {
      // single-loaded: hug the north / west edge
      cor = along
        ? R.make(wing.x, R.z1(wing) - corW / 2, wing.w, corW)
        : R.make(R.x0(wing) + corW / 2, wing.z, corW, wing.d);
    }
    corridors.push(cor);

    // the bands left over either side of the corridor
    let bands = along ? R.splitZ(wing, R.z0(cor), R.z1(cor)) : R.splitX(wing, R.x0(cor), R.x1(cor));

    // an atrium on the deepest plates — the light-well that makes a deep plan legal
    const wingVoids = [];
    if (doubleLoaded && span > p.bay * 4.5 && !isGround && rnd.chance(0.22)) {
      const av = along
        ? R.make(round2(wing.x + rnd.range(-wing.w * 0.2, wing.w * 0.2)), wing.z, round2(p.bay * 1.5), round2(span * 0.3))
        : R.make(wing.x, round2(wing.z + rnd.range(-wing.d * 0.2, wing.d * 0.2)), round2(span * 0.3), round2(p.bay * 1.5));
      wingVoids.push({ ...av, kind: 'light well' });
      voids.push(wingVoids[0]);
    }

    // Subtract everything the plan solver may not build in: the cores (served OFF
    // the corridor, so they eat into a band) and the light well.
    for (const c of cores.filter((q) => R.overlaps(q, wing)).concat(wingVoids)) {
      const next = [];
      for (const b of bands) {
        if (!R.overlaps(b, c)) { next.push(b); continue; }
        const pieces = along ? R.splitX(b, R.x0(c), R.x1(c)) : R.splitZ(b, R.z0(c), R.z1(c));
        for (const q of pieces) next.push(q);
      }
      bands = next;
    }

    // Subdivide each band ALONG THE CORRIDOR, never across it. Cutting across
    // would stack a second rank of rooms behind the first with no way in, which
    // is the one thing a plan may not do — this way every room fronts the spine.
    for (const band of bands) {
      const cut = along ? 'x' : 'z';
      const len = cut === 'x' ? band.w : band.d;
      if (len < minRoom || Math.min(band.w, band.d) < 2.2) continue;
      const offs = [0];
      let at = 0;
      while (len - at > minRoom * 1.6) {
        const stepBays = rnd.pickW([[1, 3], [1.5, 2], [2, 2.4], [3, 1.0]]);
        let step = stepBays * p.bay;
        if (step < minRoom) step = minRoom;
        if (len - (at + step) < minRoom) break;
        at += step; offs.push(round2(at));
      }
      offs.push(round2(len));
      for (let k = 0; k < offs.length - 1; k++) {
        const a = offs[k], b = offs[k + 1];
        if (b - a < minRoom * 0.8) continue;
        const r = cut === 'x'
          ? R.fromMinMax(R.x0(band) + a, R.z0(band), R.x0(band) + b, R.z1(band))
          : R.fromMinMax(R.x0(band), R.z0(band) + a, R.x1(band), R.z0(band) + b);
        rooms.push({ ...r, program: null });
      }
    }
  }

  // programme assignment — deterministic, order-stable, with the fixed points
  // (lobby on the ground, plant at the top, WCs beside a core) placed first.
  const table = T.programs.length ? T.programs : [['space', 1]];
  // What sits on the ground is not what sits on floor six: the entrance hall is
  // ONE room (the biggest one next to a core), and the rest of the ground floor
  // is the servant stuff a plinth actually holds.
  const groundTable = [['plant', 1.4], ['store', 1.6], ['cycle store', 1.0], ['refuse', 0.9],
                       ['loading', 0.8], ['café', 0.7], ['reception', 0.8]];
  let wcDone = false, lobbyDone = false;
  rooms.sort((a, b) => (a.z - b.z) || (a.x - b.x));
  const biggestNearCore = isGround
    ? rooms.filter((r) => cores.some((c) => Math.hypot(c.x - r.x, c.z - r.z) < p.bay * 2.6))
        .sort((a, b) => R.area(b) - R.area(a))[0]
    : null;
  for (const r of rooms) {
    const nearCore = cores.some((c) => Math.hypot(c.x - r.x, c.z - r.z) < p.bay * 1.9);
    if (isGround && !lobbyDone && (r === biggestNearCore || (!biggestNearCore && R.area(r) > p.bay * p.bay * 2.2))) {
      r.program = 'entrance hall'; lobbyDone = true;
    } else if (isTop && p.plant && R.area(r) > p.bay * p.bay * 1.6 && rnd.chance(0.35)) r.program = 'plant';
    else if (nearCore && !wcDone) { r.program = 'WC'; wcDone = true; }
    else r.program = rnd.pickW(isGround ? groundTable.concat(table.map(([k, w]) => [k, w * 0.45])) : table);
  }
  // number them: level-prefixed, reading order — the label a schedule can cite
  const counts = {};
  rooms.forEach((r, i) => {
    counts[r.program] = (counts[r.program] || 0) + 1;
    r.ref = `${level.index}.${String(i + 1).padStart(2, '0')}`;
    r.area = round2(R.area(r));
  });
  return { rooms, corridors, voids };
}

/* ──────────────────────── the deck plan (car park) ──────────────────────── */

function planDeck(p, level, cores) {
  const rooms = [], corridors = [];
  const wing = level.wings[0];
  const aisle = 6.2, stall = 2.5, maxDepth = 5.4;
  const along = wing.w >= wing.d;
  // One aisle down the middle, ONE rank of stalls each side of it — a second
  // rank would be parked in behind the first, which is the deck equivalent of a
  // room with no door. Whatever depth is left over is a perimeter upstand.
  const cor = along ? R.make(wing.x, wing.z, wing.w, aisle) : R.make(wing.x, wing.z, aisle, wing.d);
  corridors.push(cor);
  const bands = along ? R.splitZ(wing, R.z0(cor), R.z1(cor)) : R.splitX(wing, R.x0(cor), R.x1(cor));
  let n = 0;
  for (const band of bands) {
    const depth = Math.min(along ? band.d : band.w, maxDepth);
    const run = along ? band.w : band.d;
    const cols = Math.floor(run / stall);
    // stalls hang off the aisle edge of the band, not its outer edge
    const nearCor = along
      ? (band.z < cor.z ? R.z1(band) - depth : R.z0(band))
      : (band.x < cor.x ? R.x1(band) - depth : R.x0(band));
    for (let cI = 0; cI < cols; cI++) {
      const r = along
        ? R.fromMinMax(R.x0(band) + cI * stall, nearCor, R.x0(band) + (cI + 1) * stall, nearCor + depth)
        : R.fromMinMax(nearCor, R.z0(band) + cI * stall, nearCor + depth, R.z0(band) + (cI + 1) * stall);
      if (cores.some((c) => R.overlaps(c, r))) continue;
      n++;
      rooms.push({ ...r, program: 'stall', ref: `${level.index}.${String(n).padStart(3, '0')}`, area: round2(R.area(r)) });
    }
  }
  return { rooms, corridors, voids: [] };
}

/* ─────────────────────────── the sacred plan ────────────────────────────── */
//
// Not a corridor-and-cells plan at all: a basilica is a longitudinal hierarchy —
// narthex, nave flanked by aisles, a crossing where the transept cuts it, chancel,
// apse — and the seed sets the proportions, the bay count, and where the crossing
// falls, not whether the parts exist. The campanile stands off the mass.

function planSacred(p, level, rnd) {
  const rooms = [], corridors = [], voids = [];
  const bay = p.bay;
  const bays = p.bz;                       // nave bays, along z
  const naveW = Math.max(bay * 2.2, p.bx * bay * 0.46);
  const aisleW = Math.max(bay * 0.9, naveW * 0.34);
  const naveL = bays * bay;
  const narthexD = bay * 0.9;
  const chancelD = bay * 1.6;
  const apseD = bay * 1.1;

  const z0 = -naveL / 2;
  const nave = R.fromMinMax(-naveW / 2, z0 + narthexD, naveW / 2, z0 + naveL - chancelD);
  rooms.push({ ...nave, program: 'nave', ref: 'A', area: round2(R.area(nave)) });
  corridors.push(nave);                    // the nave IS the circulation

  const narthex = R.fromMinMax(-naveW / 2 - aisleW, z0, naveW / 2 + aisleW, z0 + narthexD);
  rooms.push({ ...narthex, program: 'narthex', ref: 'B', area: round2(R.area(narthex)) });

  for (const side of [-1, 1]) {
    const a = R.fromMinMax(side < 0 ? -naveW / 2 - aisleW : naveW / 2, R.z0(nave),
                           side < 0 ? -naveW / 2 : naveW / 2 + aisleW, R.z1(nave));
    rooms.push({ ...a, program: side < 0 ? 'north aisle' : 'south aisle', ref: side < 0 ? 'C' : 'D', area: round2(R.area(a)) });
  }

  // the crossing: a transept at a seeded fraction along the nave
  const tf = rnd.range(0.55, 0.74);
  const tz = R.z0(nave) + tf * nave.d;
  const transeptD = bay * 1.7;
  const armW = Math.max(bay * 1.4, aisleW * 1.9);
  for (const side of [-1, 1]) {
    const t = R.fromMinMax(side < 0 ? -naveW / 2 - aisleW - armW : naveW / 2 + aisleW, tz - transeptD / 2,
                           side < 0 ? -naveW / 2 - aisleW : naveW / 2 + aisleW + armW, tz + transeptD / 2);
    rooms.push({ ...t, program: side < 0 ? 'north transept' : 'south transept', ref: side < 0 ? 'E' : 'F', area: round2(R.area(t)) });
  }

  const chancel = R.fromMinMax(-naveW / 2, R.z1(nave), naveW / 2, R.z1(nave) + chancelD);
  rooms.push({ ...chancel, program: 'chancel', ref: 'G', area: round2(R.area(chancel)) });
  const apse = R.fromMinMax(-naveW * 0.34, R.z1(chancel), naveW * 0.34, R.z1(chancel) + apseD);
  rooms.push({ ...apse, program: 'apse', ref: 'H', area: round2(R.area(apse)), faceted: true });

  // chapels hung off the aisles between the buttresses — count and side are seeded
  const nCh = rnd.int(2, Math.max(2, Math.floor(bays / 3)));
  let ref = 0;
  for (let i = 0; i < nCh; i++) {
    const side = rnd.chance(0.5) ? -1 : 1;
    const k = rnd.int(0, Math.max(0, bays - 4));
    const cz = R.z0(nave) + (k + 0.5) * bay;
    if (Math.abs(cz - tz) < transeptD) continue;    // don't collide with the crossing
    const depth = bay * 0.8;
    const c = R.fromMinMax(side < 0 ? -naveW / 2 - aisleW - depth : naveW / 2 + aisleW, cz - bay * 0.42,
                           side < 0 ? -naveW / 2 - aisleW : naveW / 2 + aisleW + depth, cz + bay * 0.42);
    if (rooms.some((r) => r.program.startsWith('chapel') && R.overlaps(r, c))) continue;
    rooms.push({ ...c, program: 'chapel ' + String.fromCharCode(97 + ref++), ref: 'J' + ref, area: round2(R.area(c)) });
  }

  // the void the whole thing is for: the nave is open to the roof, the aisles are not
  voids.push({ ...nave, kind: 'nave volume' });
  // `rib` is how deep the folded-plate roof stands above the wall head; it is
  // stored here rather than recomputed in parts() so the overall height, the
  // section and the model all quote the same number.
  const rib = Math.max(1.6, naveW * 0.16);
  return { rooms, corridors, voids, geometry: { naveW, aisleW, naveL, narthexD, chancelD, apseD, tz, transeptD, armW, bays, rib: round2(rib) } };
}

/* ─────────────────────────────  facade grammar  ─────────────────────────── */
//
// Bays are cut from each exposed plate edge, then the rhythm cell is stamped
// along them. Two operators make the difference between wallpaper and
// architecture: MIRROR (about the centre of the elevation — brutalism is
// overwhelmingly symmetric about its entrance) and PUNCTUATION (a rare
// substitution that breaks the repeat exactly where a person would notice).

function facadeFor(p, mass, cores) {
  const T = TYPOLOGIES[p.typology];
  const rf = Rand(p.seed, 'facade');
  const punct = rf.pickW(T.alphabet);
  const facades = [];
  const SIDES = [
    { id: 'N', nx: 0, nz: -1 }, { id: 'S', nx: 0, nz: 1 },
    { id: 'W', nx: -1, nz: 0 }, { id: 'E', nx: 1, nz: 0 },
  ];

  for (const L of mass.levels) {
    for (let wi = 0; wi < L.wings.length; wi++) {
      const wing = L.wings[wi];
      for (const side of SIDES) {
        const horizontal = side.nz !== 0;            // edge runs along x
        const len = horizontal ? wing.w : wing.d;
        const n = Math.max(1, Math.round(len / p.bay));
        const bw = len / n;
        // the ground floor of a pilotis building is open between the piers
        const groundOpen = p.pilotis && L.index === 0;
        const bays = [];
        for (let i = 0; i < n; i++) {
          let mod;
          if (groundOpen) mod = (i % 2 === 0) ? 'pier' : 'open';
          else {
            const k = p.symmetric ? Math.min(i, n - 1 - i) : i;
            mod = p.rhythm[k % p.rhythm.length];
            // punctuation: same draw for the same (level, wing, side, bay) for ever
            const rp = Rand(p.seed, `punct/${L.index}/${wi}/${side.id}/${i}`);
            if (rp.chance(0.07)) mod = punct;
            // the top level of a plant-crowned building wears its louvres
            if (p.plant && L.index === p.levels - 1 && rp.chance(0.45)) mod = 'vent';
          }
          const t0 = -len / 2 + i * bw;
          bays.push({
            i, module: mod, w: round2(bw),
            // centre of the bay in world coords
            x: round2(horizontal ? wing.x + t0 + bw / 2 : (side.nx < 0 ? R.x0(wing) : R.x1(wing))),
            z: round2(horizontal ? (side.nz < 0 ? R.z0(wing) : R.z1(wing)) : wing.z + t0 + bw / 2),
          });
        }
        facades.push({ level: L.index, wing: wi, side: side.id, nx: side.nx, nz: side.nz, y: L.y, h: L.h, len: round2(len), bays });
      }
    }
  }
  return facades;
}

// The cathedral wears a different alphabet on a different geometry, so it gets
// its own elevation pass: buttresses on the bay lines, lancets between, a rose
// over the west door, a clerestory band riding above the aisle roof.
function facadeSacred(p, geo, mass) {
  const rf = Rand(p.seed, 'facade/sacred');
  const facades = [];
  const L = mass.levels[0];
  const bays = geo.bays;
  const push = (side, nx, nz, len, list, y, h, tag) =>
    facades.push({ level: 0, wing: 0, side, nx, nz, y, h, len: round2(len), tag, bays: list });

  // A bay that falls in the crossing is not a wall — it is the arch into the
  // transept, so it is left out of the elevation entirely rather than drawn and
  // then contradicted by the arm standing in front of it.
  const inCrossing = (cz) => Math.abs(cz - geo.tz) < geo.transeptD / 2;
  for (const side of [['W', -1, 0], ['E', 1, 0]]) {
    const list = [];
    const half = (geo.naveW / 2 + geo.aisleW);
    for (let i = 0; i < bays; i++) {
      const cz = -geo.naveL / 2 + (i + 0.5) * (geo.naveL / bays);
      if (inCrossing(cz)) continue;
      list.push({ i, module: i % 2 === 0 ? 'buttress' : 'lancet', w: round2(geo.naveL / bays),
                  x: round2(side[1] * half), z: round2(cz) });
    }
    push(side[0], side[1], 0, geo.naveL, list, 0, L.h * 0.42, 'aisle');
    // clerestory above the aisle roof — the light that makes the nave
    const cl = [];
    for (let i = 0; i < bays; i++) {
      const cz = -geo.naveL / 2 + (i + 0.5) * (geo.naveL / bays);
      cl.push({ i, module: rf.chance(0.85) ? 'lancet' : 'recess', w: round2(geo.naveL / bays),
                x: round2(side[1] * geo.naveW / 2), z: round2(cz) });
    }
    push(side[0], side[1], 0, geo.naveL, cl, round2(L.h * 0.42), round2(L.h * 0.58), 'clerestory');
  }
  // the west front (entrance end, −z) — rose over the door, flanked blank
  const front = [];
  const fw = geo.naveW + 2 * geo.aisleW;
  const nf = Math.max(3, Math.round(fw / p.bay));
  for (let i = 0; i < nf; i++) {
    const mid = (nf % 2 === 1) ? i === (nf - 1) / 2 : (i === nf / 2 - 1 || i === nf / 2);
    front.push({ i, module: mid ? 'rose' : (i === 0 || i === nf - 1 ? 'buttress' : 'blank'),
                 w: round2(fw / nf), x: round2(-fw / 2 + (i + 0.5) * (fw / nf)), z: round2(-geo.naveL / 2) });
  }
  push('N', 0, -1, fw, front, 0, L.h, 'west front');
  return facades;
}

/* ────────────────────────────────  generate  ────────────────────────────── */

export function generate(paramsOrQuery) {
  const p = (paramsOrQuery && paramsOrQuery.seed && paramsOrQuery.rhythm)
    ? paramsOrQuery : resolveParams(paramsOrQuery);
  const T = TYPOLOGIES[p.typology];

  if (p.typology === 'cathedral') return generateSacred(p);

  const mass = massing(p);
  const cores = placeCores(p, mass);
  const rp = Rand(p.seed, 'plan');

  for (const L of mass.levels) {
    L.cores = cores.filter((c) => L.wings.some((w) => R.overlaps(w, c)));
    const out = T.plan === 'deck' ? planDeck(p, L, L.cores) : planCellular(p, L, L.cores, rp);
    L.rooms = out.rooms; L.corridors = out.corridors; L.voids = out.voids;
    L.columns = columnsFor(p, L);
    L.label = levelLabel(p, L);
    L.gfa = round2(L.wings.reduce((s, w) => s + R.area(w), 0));
  }

  const facades = facadeFor(p, mass, cores);
  const towers = serviceTowers(p, mass);
  const b = {
    version: VERSION, params: p, seed: p.seed, typology: p.typology, typologyLabel: T.label,
    site: mass.site, levels: mass.levels, cores, facades, towers,
    height: round2(mass.height + (p.plant ? 3.2 : 1.1)),
    roof: { parapet: 1.1, plant: p.plant },
    geometry: null,
  };
  b.stats = statsFor(b);
  return b;
}

function generateSacred(p) {
  const mass = massing({ ...p, levels: 1 });
  const rs = Rand(p.seed, 'sacred');
  const L = mass.levels[0];
  const out = planSacred(p, L, rs);
  L.rooms = out.rooms; L.corridors = out.corridors; L.voids = out.voids;
  L.label = 'Main floor';
  const geo = out.geometry;
  // The plate IS the plan's outline. A basilica's footprint is not one rect: the
  // body (narthex + nave + aisles + chancel + apse) plus every arm and chapel
  // that projects off it. Wings are what the slabs, the section and the bounds
  // are all cut from, so anything a room occupies has to be a wing.
  // Wings carry their own height and roof kind here, because a basilica is not
  // one extrusion: the body runs to the nave head under folded plates, the
  // transept arms match it, and the chapels stop at the aisle. `opensTo` names
  // the face that is an arch into the church rather than a wall.
  L.wings = [
    { ...R.fromMinMax(-geo.naveW / 2 - geo.aisleW, -geo.naveL / 2,
                       geo.naveW / 2 + geo.aisleW, -geo.naveL / 2 + geo.naveL + geo.apseD),
      wingH: L.h, roof: 'folded' },
    ...out.rooms.filter((r) => /transept|chapel/.test(r.program)).map((r) => ({
      ...R.make(r.x, r.z, r.w, r.d),
      wingH: round2(/transept/.test(r.program) ? L.h : L.h * 0.42),
      roof: 'flat',
      opensTo: r.x < 0 ? 'x+' : 'x-',      // the arm opens back toward the nave
    })),
  ];
  L.gfa = round2(out.rooms.reduce((s, r) => s + R.area(r), 0));
  L.columns = sacredColumns(p, geo);

  const facades = facadeSacred(p, geo, mass);
  const towers = p.towers ? [{
    x: round2(-geo.naveW / 2 - geo.aisleW - p.bay * 1.4), z: round2(-geo.naveL / 2 + p.bay * 1.2),
    w: round2(p.bay * 1.3), d: round2(p.bay * 1.3),
    h: round2(L.h * rs.range(1.5, 2.2)), kind: 'campanile',
  }] : [];

  const b = {
    version: VERSION, params: p, seed: p.seed, typology: 'cathedral', typologyLabel: TYPOLOGIES.cathedral.label,
    site: mass.site, levels: mass.levels, cores: [], facades, towers,
    height: round2(L.h + geo.rib * 1.6 + 0.5), roof: { parapet: 0.9, plant: false, folded: true },
    geometry: geo,
  };
  b.stats = statsFor(b);
  return b;
}

function levelLabel(p, L) {
  if (L.index === 0) return p.pilotis ? 'Ground (undercroft)' : 'Ground';
  if (L.index === p.levels - 1 && p.plant) return `Level ${L.index} + plant`;
  return `Level ${L.index}`;
}

// Columns sit on the grid intersections, and each carries the floor halfway to
// its neighbours — so every column records its TRIBUTARY size as well as its
// position. That is what a load takedown needs, and computing it here (where the
// grid is defined) keeps struct.js from having to re-derive the grid and get a
// slightly different answer.
function columnsFor(p, L) {
  const cols = [];
  for (const wing of L.wings) {
    const nx = Math.max(1, Math.round(wing.w / p.bay));
    const nz = Math.max(1, Math.round(wing.d / p.bay));
    const dx = wing.w / nx, dz = wing.d / nz;
    for (let i = 0; i <= nx; i++) {
      for (let k = 0; k <= nz; k++) {
        const x = round2(R.x0(wing) + i * dx);
        const z = round2(R.z0(wing) + k * dz);
        if (L.cores.some((c) => x > R.x0(c) - 0.3 && x < R.x1(c) + 0.3 && z > R.z0(c) - 0.3 && z < R.z1(c) + 0.3)) continue;
        const edge = (i === 0 || i === nx ? 1 : 0) + (k === 0 || k === nz ? 1 : 0);
        const tw = round2(dx * (i === 0 || i === nx ? 0.5 : 1));
        const td = round2(dz * (k === 0 || k === nz ? 0.5 : 1));
        const hit = cols.find((q) => Math.abs(q.x - x) < 0.05 && Math.abs(q.z - z) < 0.05);
        // a column shared by two wings picks up both tributaries
        if (hit) { hit.trib = round2(hit.trib + tw * td); continue; }
        cols.push({ x, z, tw, td, trib: round2(tw * td), edge });
      }
    }
  }
  return cols;
}

function sacredColumns(p, geo) {
  // The nave arcade: a pier per bay each side, between nave and aisle. Each one
  // carries half the nave and half its aisle, which is the tributary a load
  // takedown needs — and every pier is on the perimeter of the nave volume, so
  // they all count as edge columns for the frame's axial couple.
  const cols = [];
  const n = geo.bays;
  const bay = geo.naveL / n;
  for (let i = 0; i <= n; i++) {
    const z = round2(-geo.naveL / 2 + i * bay);
    const tw = round2(geo.naveW / 2 + geo.aisleW / 2);
    const td = round2(bay * (i === 0 || i === n ? 0.5 : 1));
    for (const s of [-1, 1]) {
      cols.push({ x: round2(s * geo.naveW / 2), z, tw, td, trib: round2(tw * td), edge: 1 });
    }
  }
  return cols;
}

function serviceTowers(p, mass) {
  if (!p.towers) return [];
  const rt = Rand(p.seed, 'towers');
  const out = [];
  const top = mass.levels[mass.levels.length - 1];
  for (let k = 0; k < p.towers; k++) {
    const wing = mass.levels[0].wings[k % mass.levels[0].wings.length];
    const onX = rt.chance(0.5);
    const w = round2(p.bay * rt.range(0.85, 1.3));
    const d = round2(p.bay * rt.range(0.85, 1.3));
    const sx = rt.chance(0.5) ? -1 : 1, sz = rt.chance(0.5) ? -1 : 1;
    out.push({
      x: round2(onX ? (sx < 0 ? R.x0(wing) - w / 2 : R.x1(wing) + w / 2) : wing.x + rt.range(-wing.w * 0.3, wing.w * 0.3)),
      z: round2(onX ? wing.z + rt.range(-wing.d * 0.3, wing.d * 0.3) : (sz < 0 ? R.z0(wing) - d / 2 : R.z1(wing) + d / 2)),
      w, d,
      h: round2((top.y + top.h) * rt.range(1.02, 1.22)),
      kind: k === 0 ? 'stair tower' : 'service tower',
    });
  }
  return out;
}

function statsFor(b) {
  const gfa = b.levels.reduce((s, L) => s + (L.gfa || 0), 0);
  const rooms = b.levels.reduce((s, L) => s + L.rooms.length, 0);
  const glazed = b.facades.reduce((s, f) => s + f.bays.reduce((q, y) => q + (MODULES[y.module]?.glass || 0) * y.w * f.h, 0), 0);
  const wall = b.facades.reduce((s, f) => s + f.len * f.h, 0);
  const foot = b.levels[0].wings.reduce((s, w) => s + R.area(w), 0);
  return {
    gfa: round2(gfa), footprint: round2(foot), levels: b.levels.length,
    height: b.height, rooms,
    glazedRatio: wall > 0 ? Math.round((glazed / wall) * 1000) / 10 : 0,
    plotRatio: Math.round((gfa / (b.site.w * b.site.d)) * 100) / 100,
    cores: b.cores.length, towers: b.towers.length,
  };
}

// A room schedule, the way a drawing set carries one: grouped by programme.
export function schedule(b) {
  const byProg = new Map();
  for (const L of b.levels) {
    for (const r of L.rooms) {
      const e = byProg.get(r.program) || { program: r.program, count: 0, area: 0 };
      e.count++; e.area += R.area(r);
      byProg.set(r.program, e);
    }
  }
  return [...byProg.values()]
    .map((e) => ({ ...e, area: round2(e.area) }))
    .sort((a, b2) => b2.area - a.area);
}

/* ────────────────────────────────  parts  ───────────────────────────────── */
//
// The 3D bench's whole job is to instance THIS list. Every part is an axis-
// aligned box with an optional tilt, so the renderer needs one geometry and a
// handful of materials — and the model can never drift from the drawings,
// because the boxes are cut from the same rooms, bays and plates the drawings
// dimension. `mat` is a role, not a colour: the page owns the palette.

export function parts(b) {
  const out = [];
  const p = b.params;
  const push = (o) => { out.push(o); return o; };
  const SLAB = 0.42;

  // ground plane / plinth
  const plinth = b.typology === 'carpark' ? 0.15 : 0.6;
  push({ mat: 'ground', kind: 'plinth', x: 0, y: -plinth / 2, z: 0, w: b.site.w, h: plinth, d: b.site.d });

  for (const L of b.levels) {
    // floor slabs, one per wing, oversailing the frame by 150 mm (the drip)
    for (const wg of L.wings) {
      push({ mat: 'concrete', kind: 'slab', x: wg.x, y: round2(L.y + SLAB / 2), z: wg.z,
             w: round2(wg.w + 0.3), h: SLAB, d: round2(wg.d + 0.3), level: L.index });
    }
    // columns
    for (const c of L.columns) {
      push({ mat: 'concrete', kind: 'column', x: c.x, y: round2(L.y + L.h / 2), z: c.z,
             w: 0.62, h: round2(L.h), d: 0.62, level: L.index });
    }
    // interior partitions — invisible from outside, but the X-ray view is exactly
    // "the blueprint, extruded", which is the point of the two sites sharing a kernel
    for (const r of L.rooms) {
      const h = Math.max(0.1, L.h - SLAB - 0.35);
      const y = round2(L.y + SLAB + h / 2);
      const t = 0.16;
      push({ mat: 'partition', kind: 'partition', x: r.x, y, z: round2(R.z0(r) + t / 2), w: r.w, h, d: t, level: L.index, ref: r.ref });
      push({ mat: 'partition', kind: 'partition', x: round2(R.x0(r) + t / 2), y, z: r.z, w: t, h, d: r.d, level: L.index, ref: r.ref });
    }
    // cores run the full height as solid shafts
    for (const c of L.cores) {
      push({ mat: 'core', kind: 'core', x: c.x, y: round2(L.y + L.h / 2), z: c.z, w: c.w, h: round2(L.h), d: c.d, level: L.index });
    }
    // light wells: punched out of the slab (drawn as an outline, not a solid)
    for (const v of L.voids) {
      push({ mat: 'void', kind: 'void', x: v.x, y: round2(L.y + SLAB / 2), z: v.z, w: v.w, h: SLAB + 0.02, d: v.d, level: L.index });
    }
  }

  // facade bays
  for (const f of b.facades) {
    const horiz = f.nz !== 0;
    for (const bay of f.bays) {
      const M = MODULES[bay.module];
      const dep = Math.abs(M.depth) < 0.02 ? 0.32 : Math.abs(M.depth);
      const outward = M.depth >= 0;
      // wall plane sits ON the plate edge; relief pushes out or cuts in
      const off = (outward ? dep / 2 : -dep / 2) * (horiz ? f.nz : f.nx);
      const cx = horiz ? bay.x : round2(bay.x + off);
      const cz = horiz ? round2(bay.z + off) : bay.z;
      const thick = Math.max(0.3, dep);
      const bw = horiz ? bay.w : thick;
      const bd = horiz ? thick : bay.w;
      const yMid = round2(f.y + f.h / 2);

      switch (bay.module) {
        case 'open':
          break;                                            // literally nothing: air
        case 'pier':
        case 'buttress':
          push({ mat: 'concrete', kind: 'pier', x: cx, y: yMid, z: cz,
                 w: horiz ? Math.min(bay.w, 1.15) : thick, h: round2(f.h),
                 d: horiz ? thick : Math.min(bay.w, 1.15), level: f.level, side: f.side, module: bay.module });
          break;
        case 'blank':
        case 'recess':
          push({ mat: 'concrete', kind: 'wall', x: cx, y: yMid, z: cz, w: bw, h: round2(f.h), d: bd,
                 level: f.level, side: f.side, module: bay.module });
          break;
        case 'vent': {
          push({ mat: 'concrete', kind: 'wall', x: cx, y: yMid, z: cz, w: bw, h: round2(f.h), d: bd, level: f.level, side: f.side, module: bay.module });
          const fins = Math.max(3, Math.floor(f.h / 0.55));
          for (let i = 0; i < fins; i++) {
            const fy = round2(f.y + ((i + 0.5) * f.h) / fins);
            push({ mat: 'metal', kind: 'louvre', x: cx, y: fy, z: cz,
                   w: horiz ? bay.w * 0.82 : thick + 0.22, h: 0.16, d: horiz ? thick + 0.22 : bay.w * 0.82,
                   level: f.level, side: f.side, module: bay.module });
          }
          break;
        }
        case 'band':
        case 'slit':
        case 'lancet':
        case 'rose': {
          // spandrel below + head above, glass in the gap
          const gH = bay.module === 'band' ? f.h * 0.46 : f.h * (bay.module === 'rose' ? 0.5 : 0.68);
          const gW = bay.module === 'band' ? bay.w * 0.92 : bay.w * (bay.module === 'lancet' ? 0.24 : bay.module === 'rose' ? 0.62 : 0.34);
          const sillH = (f.h - gH) * 0.62, headH = f.h - gH - sillH;
          push({ mat: 'concrete', kind: 'spandrel', x: cx, y: round2(f.y + sillH / 2), z: cz, w: bw, h: round2(sillH), d: bd, level: f.level, side: f.side, module: bay.module });
          push({ mat: 'concrete', kind: 'head', x: cx, y: round2(f.y + f.h - headH / 2), z: cz, w: bw, h: round2(headH), d: bd, level: f.level, side: f.side, module: bay.module });
          // reveals either side of the opening
          const jamb = (bay.w - gW) / 2;
          if (jamb > 0.05) {
            for (const s of [-1, 1]) {
              push({ mat: 'concrete', kind: 'jamb',
                     x: horiz ? round2(bay.x + s * (bay.w - jamb) / 2) : cx,
                     y: round2(f.y + sillH + gH / 2),
                     z: horiz ? cz : round2(bay.z + s * (bay.w - jamb) / 2),
                     w: horiz ? round2(jamb) : bw, h: round2(gH), d: horiz ? bd : round2(jamb),
                     level: f.level, side: f.side, module: bay.module });
            }
          }
          push({ mat: 'glass', kind: 'glazing',
                 x: horiz ? bay.x : round2(bay.x + (horiz ? 0 : f.nx * 0.06)),
                 y: round2(f.y + sillH + gH / 2),
                 z: horiz ? round2(bay.z + f.nz * 0.06) : bay.z,
                 w: horiz ? round2(gW) : 0.1, h: round2(gH), d: horiz ? 0.1 : round2(gW),
                 level: f.level, side: f.side, module: bay.module });
          break;
        }
        case 'brise': {
          push({ mat: 'glass', kind: 'glazing', x: horiz ? bay.x : round2(bay.x + f.nx * 0.05), y: yMid,
                 z: horiz ? round2(bay.z + f.nz * 0.05) : bay.z,
                 w: horiz ? round2(bay.w * 0.94) : 0.1, h: round2(f.h * 0.9), d: horiz ? 0.1 : round2(bay.w * 0.94),
                 level: f.level, side: f.side, module: bay.module });
          // the egg-crate: verticals × horizontals standing off the glass
          const nv = Math.max(2, Math.round(bay.w / 1.2)), nh = Math.max(2, Math.round(f.h / 1.1));
          for (let i = 0; i <= nv; i++) {
            const t = -bay.w / 2 + (i * bay.w) / nv;
            push({ mat: 'concrete', kind: 'fin', x: horiz ? round2(bay.x + t) : cx, y: yMid,
                   z: horiz ? cz : round2(bay.z + t),
                   w: horiz ? 0.17 : thick, h: round2(f.h), d: horiz ? thick : 0.17,
                   level: f.level, side: f.side, module: bay.module });
          }
          for (let i = 0; i <= nh; i++) {
            const fy = round2(f.y + (i * f.h) / nh);
            push({ mat: 'concrete', kind: 'fin', x: cx, y: fy, z: cz,
                   w: horiz ? bay.w : thick, h: 0.17, d: horiz ? thick : bay.w,
                   level: f.level, side: f.side, module: bay.module });
          }
          break;
        }
        case 'oriel': {
          const oy = round2(f.y + f.h * 0.5);
          push({ mat: 'concrete', kind: 'oriel', x: cx, y: oy, z: cz,
                 w: horiz ? round2(bay.w * 0.8) : thick, h: round2(f.h * 0.86), d: horiz ? thick : round2(bay.w * 0.8),
                 level: f.level, side: f.side, module: bay.module });
          push({ mat: 'glass', kind: 'glazing',
                 x: horiz ? bay.x : round2(bay.x + f.nx * (dep + 0.06)), y: oy,
                 z: horiz ? round2(bay.z + f.nz * (dep + 0.06)) : bay.z,
                 w: horiz ? round2(bay.w * 0.6) : 0.1, h: round2(f.h * 0.6), d: horiz ? 0.1 : round2(bay.w * 0.6),
                 level: f.level, side: f.side, module: bay.module });
          break;
        }
        case 'balcony': {
          push({ mat: 'concrete', kind: 'spandrel', x: cx, y: round2(f.y + f.h * 0.28), z: cz,
                 w: bw, h: round2(f.h * 0.56), d: bd, level: f.level, side: f.side, module: bay.module });
          // the deck slab and its upstand
          const dOff = (horiz ? f.nz : f.nx) * (dep / 2);
          push({ mat: 'concrete', kind: 'deck',
                 x: horiz ? bay.x : round2(bay.x + dOff), y: round2(f.y + 0.12),
                 z: horiz ? round2(bay.z + dOff) : bay.z,
                 w: horiz ? bay.w : round2(dep), h: 0.24, d: horiz ? round2(dep) : bay.w,
                 level: f.level, side: f.side, module: bay.module });
          push({ mat: 'concrete', kind: 'upstand',
                 x: horiz ? bay.x : round2(bay.x + (horiz ? 0 : (f.nx * dep))),
                 y: round2(f.y + 0.62),
                 z: horiz ? round2(bay.z + f.nz * dep) : bay.z,
                 w: horiz ? bay.w : 0.2, h: 1.0, d: horiz ? 0.2 : bay.w,
                 level: f.level, side: f.side, module: bay.module });
          push({ mat: 'glass', kind: 'glazing',
                 x: horiz ? bay.x : round2(bay.x + f.nx * 0.05), y: round2(f.y + f.h * 0.74),
                 z: horiz ? round2(bay.z + f.nz * 0.05) : bay.z,
                 w: horiz ? round2(bay.w * 0.7) : 0.1, h: round2(f.h * 0.34), d: horiz ? 0.1 : round2(bay.w * 0.7),
                 level: f.level, side: f.side, module: bay.module });
          break;
        }
        default:
          push({ mat: 'concrete', kind: 'wall', x: cx, y: yMid, z: cz, w: bw, h: round2(f.h), d: bd, level: f.level, side: f.side, module: bay.module });
      }
    }
  }

  // service / stair towers
  for (const t of b.towers) {
    push({ mat: 'core', kind: 'tower', x: t.x, y: round2(t.h / 2), z: t.z, w: t.w, h: t.h, d: t.d });
    push({ mat: 'concrete', kind: 'tower-cap', x: t.x, y: round2(t.h + 0.35), z: t.z, w: round2(t.w + 0.5), h: 0.7, d: round2(t.d + 0.5) });
  }

  // ── ROOFS ────────────────────────────────────────────────────────────────
  // Slabs are cast at each level's FLOOR, so a plate is only roofed by whatever
  // stands on it. Every square metre the level above does NOT build on is a
  // roof: the whole top plate, and — on a ziggurat, a setback or a stagger —
  // the terrace each step leaves behind. Those terraces are half of what makes
  // a stepped mass read as inhabited rather than as a stack of trays.
  const topLevel = b.levels[b.levels.length - 1];
  let biggestDeck = null;
  for (let i = 0; i < b.levels.length; i++) {
    const L = b.levels[i];
    const above = b.levels[i + 1] ? b.levels[i + 1].wings : [];
    for (const wg of L.wings) {
      if (wg.roof === 'folded') continue;                 // the cathedral nave brings its own
      const roofY = round2(L.y + (wg.wingH != null ? wg.wingH : L.h));
      const exposed = R.subtract(wg, above);
      if (!exposed.length) continue;
      for (const r of exposed) {
        push({ mat: 'concrete', kind: 'roof', x: r.x, y: round2(roofY + SLAB / 2), z: r.z,
               w: round2(r.w), h: SLAB, d: round2(r.d), level: i });
        if (i === b.levels.length - 1 && (!biggestDeck || R.area(r) > R.area(biggestDeck.r))) biggestDeck = { r, roofY };
      }
      // Parapet round the wing's own perimeter, but only on the edges the level
      // above does not stand on — where it does, its facade is already the wall.
      const par = b.roof.parapet;
      const edges = [
        [0, -wg.d / 2, wg.w + 0.3, 0.3, 0, 1],
        [0, wg.d / 2, wg.w + 0.3, 0.3, 0, -1],
        [-wg.w / 2, 0, 0.3, wg.d + 0.3, 1, 0],
        [wg.w / 2, 0, 0.3, wg.d + 0.3, -1, 0],
      ];
      for (const [dx, dz, w2, d2, ix, iz] of edges) {
        const px = wg.x + dx + ix * 0.3, pz = wg.z + dz + iz * 0.3;   // just inside the edge
        if (above.some((u) => px > R.x0(u) && px < R.x1(u) && pz > R.z0(u) && pz < R.z1(u))) continue;
        push({ mat: 'concrete', kind: 'parapet', x: round2(wg.x + dx), y: round2(roofY + SLAB + par / 2),
               z: round2(wg.z + dz), w: round2(w2), h: par, d: round2(d2), level: i });
      }
    }
  }
  // the plant enclosure stands on the biggest piece of the top deck, not in mid-air
  if (b.roof.plant && biggestDeck) {
    const { r, roofY } = biggestDeck;
    const pw = Math.min(r.w * 0.55, r.w - 1.6), pd = Math.min(r.d * 0.55, r.d - 1.6);
    // a deck too small to walk round is too small to put plant on
    if (pw > 1 && pd > 1) {
      push({ mat: 'concrete', kind: 'plant', x: r.x, y: round2(roofY + SLAB + 1.7), z: r.z,
             w: round2(pw), h: 3.4, d: round2(pd), level: topLevel.index });
    }
  }

  // the cathedral's folded-plate roof and apse facets
  if (b.typology === 'cathedral' && b.geometry) {
    const g = b.geometry, L = b.levels[0];
    // A folded-plate roof: alternating deep ribs, the concrete answer to a vault.
    // Shallow ribs read as a comb from any distance, so they are sized against the
    // nave width rather than a fixed depth.
    // The roof runs the whole body, apse included — the apse is the one bay of a
    // basilica people forget to cover, and an open one reads as a bomb site.
    const bodyL = g.naveL + g.apseD;
    const bodyZ = -g.naveL / 2 + bodyL / 2;
    const nFolds = Math.max(6, Math.round((g.bays * 2 * bodyL) / g.naveL));
    const rib = g.rib;
    for (let i = 0; i < nFolds; i++) {
      const z = round2(-g.naveL / 2 + ((i + 0.5) * bodyL) / nFolds);
      const up = i % 2 === 0;
      push({ mat: 'concrete', kind: 'fold', x: 0, y: round2(L.h + (up ? rib * 0.75 : rib * 0.25)), z,
             w: round2(g.naveW + 0.7), h: round2(up ? rib * 1.5 : rib * 0.5), d: round2((bodyL / nFolds) * 0.94) });
    }
    // the deck the folds sit on: without it the nave is a colander
    push({ mat: 'concrete', kind: 'roof', x: 0, y: round2(L.h + SLAB / 2), z: round2(bodyZ),
           w: round2(g.naveW + 0.7), h: SLAB, d: round2(bodyL), level: 0 });
    // the ridge beam the folds hang from, so the roof reads as one thing
    push({ mat: 'concrete', kind: 'ridge', x: 0, y: round2(L.h + rib * 1.55), z: 0,
           w: round2(g.naveW * 0.22), h: round2(rib * 0.5), d: round2(g.naveL + 0.7) });
    // aisle roofs, lower — this is what makes the clerestory possible
    for (const s of [-1, 1]) {
      push({ mat: 'concrete', kind: 'aisle-roof',
             x: round2(s * (g.naveW / 2 + g.aisleW / 2)), y: round2(L.h * 0.42), z: round2(bodyZ),
             w: round2(g.aisleW + 0.4), h: 0.4, d: round2(bodyL) });
    }
    // TRANSEPT ARMS AND CHAPELS. The plan has drawn these all along; without a
    // volume they were rooms the model simply never built. Each is a walled box
    // to its own height — the arms to the nave, the chapels to the aisle — and
    // the general roof pass above decks them, because they are wings like any
    // other. The face that opens into the church is left out: that is the arch.
    for (const wg of L.wings) {
      if (!wg.opensTo) continue;
      const hh = wg.wingH, t = 0.55;
      const skip = wg.opensTo;                              // 'x-' | 'x+' | 'z-' | 'z+'
      const faces = [
        ['z-', wg.x, R.z0(wg) + t / 2, wg.w, t],
        ['z+', wg.x, R.z1(wg) - t / 2, wg.w, t],
        ['x-', R.x0(wg) + t / 2, wg.z, t, wg.d],
        ['x+', R.x1(wg) - t / 2, wg.z, t, wg.d],
      ];
      for (const [id, wx, wz, ww, wd] of faces) {
        if (id === skip) continue;
        push({ mat: 'concrete', kind: 'wall', x: round2(wx), y: round2(hh / 2), z: round2(wz),
               w: round2(ww), h: round2(hh), d: round2(wd), level: 0 });
      }
      // one deep light slot in the end wall, so an arm is not a blind box
      const endIsX = skip.startsWith('x');
      const sgn = skip === 'x-' ? 1 : skip === 'x+' ? -1 : skip === 'z-' ? 1 : -1;
      push({ mat: 'glass', kind: 'glazing',
             x: round2(endIsX ? wg.x + sgn * (wg.w / 2 - t) : wg.x),
             y: round2(hh * 0.55),
             z: round2(endIsX ? wg.z : wg.z + sgn * (wg.d / 2 - t)),
             w: round2(endIsX ? 0.12 : Math.min(wg.w * 0.3, 2.4)), h: round2(hh * 0.5),
             d: round2(endIsX ? Math.min(wg.d * 0.3, 2.4) : 0.12), level: 0 });
    }
    // the apse, faceted rather than curved — concrete does not do a true hemicycle
    const apse = L.rooms.find((r) => r.program === 'apse');
    if (apse) {
      const facets = 7, rad = apse.w / 2;
      for (let i = 0; i < facets; i++) {
        const a = -Math.PI / 2 + (Math.PI * (i + 0.5)) / facets;
        push({ mat: 'concrete', kind: 'apse-facet',
               x: round2(apse.x + Math.sin(a) * rad), y: round2(L.h * 0.5), z: round2(R.z0(apse) + Math.cos(a) * rad),
               w: 1.2, h: round2(L.h), d: 1.2, ry: round2(a) });
      }
    }
  }
  return out;
}

/* ─────────────────────────── section (shared) ───────────────────────────── */
//
// A vertical cut at z = `cutZ`: for every level, the x-intervals its plate covers.
// Used by the drawing office for the section, and by the 3D bench's clip plane —
// same numbers, so the section line in the plan really is where the model cuts.

export function section(b, cutZ = 0) {
  const rows = [];
  for (const L of b.levels) {
    const spans = [];
    for (const wg of L.wings) {
      if (cutZ >= R.z0(wg) - 1e-6 && cutZ <= R.z1(wg) + 1e-6) spans.push([round2(R.x0(wg)), round2(R.x1(wg))]);
    }
    spans.sort((a, c) => a[0] - c[0]);
    rows.push({ level: L.index, y: L.y, h: L.h, spans, label: L.label });
  }
  const towers = b.towers.filter((t) => cutZ >= t.z - t.d / 2 && cutZ <= t.z + t.d / 2)
    .map((t) => ({ x0: round2(t.x - t.w / 2), x1: round2(t.x + t.w / 2), h: t.h, kind: t.kind }));
  return { cutZ: round2(cutZ), rows, towers, height: b.height };
}

/* ───────────────────────────── bounds helper ────────────────────────────── */

export function bounds(b) {
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (const L of b.levels) for (const wg of L.wings) {
    x0 = Math.min(x0, R.x0(wg)); x1 = Math.max(x1, R.x1(wg));
    z0 = Math.min(z0, R.z0(wg)); z1 = Math.max(z1, R.z1(wg));
  }
  // `height` is the figure the drawings quote — to parapet. The bounding box has
  // to cover what is actually built above it: stair towers overrun the parapet by
  // design, which is half of why brutalism reads as a skyline rather than a box.
  let y1 = b.height;
  for (const t of b.towers) {
    x0 = Math.min(x0, t.x - t.w / 2); x1 = Math.max(x1, t.x + t.w / 2);
    z0 = Math.min(z0, t.z - t.d / 2); z1 = Math.max(z1, t.z + t.d / 2);
    y1 = Math.max(y1, t.h + 0.7);
  }
  return { x0: round2(x0), x1: round2(x1), z0: round2(z0), z1: round2(z1), y1: round2(y1) };
}

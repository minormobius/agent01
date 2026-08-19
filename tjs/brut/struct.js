// tjs/brut/struct.js — THE ENGINEER. A structural solve over the building
// arch.js generated: gravity takedown, modal analysis, earthquake, wind, and a
// margin on every check.
//
// This is only possible because the architecture is not a skin. arch.js already
// produced a real frame — a column grid with tributary areas, slab thicknesses,
// core walls, storey heights, per-wing plates that change with the massing — and
// a room schedule that says what each floor is FOR. So the loads are not
// assumed: the library stacks really do put 7.2 kPa on the civic hall's floors,
// the car park's parking decks really are light, and the inverted ziggurat
// really does hang more mass over a smaller base than the ziggurat does.
//
// THE MODEL. A tall building resists lateral load two ways at once: the frame
// RACKS (shear), the cores and the columns' axial couple BEND (flexure). Model
// only one and you get the wrong mode shape and the wrong period. So the lateral
// system is a coupled flexural–shear cantilever (Heidebrecht & Stafford Smith,
// 1973), discretised one Timoshenko beam element per storey:
//
//   EI  ← core boxes + the SOLID PART OF THE ELEVATION acting in its own plane,
//         plus the return walls as flanges and a discounted column axial couple
//   GA  ← frame racking from Muto's D-values + core and perimeter web shear
//
// That the elevation is structure is the point, not a shortcut: a brutalist
// facade is cast concrete, so glazing a bay really does soften the building, and
// a church with no core stands up on its buttressed aisle walls — which is what
// it does in life.
//
// with the rotational DOFs statically condensed out (Guyan — exact here, since
// the rotary inertia of a floor plate about a horizontal axis is negligible
// beside its translational mass). That leaves an n×n system with a diagonal mass
// matrix, which is what the eigensolver, the response spectrum and the Newmark
// integration all want.
//
// CODE BASIS: ASCE 7-16 (seismic Ch. 11–12, wind Ch. 26–27), ACI 318-19 for
// member capacity. Chosen over Eurocode because the ask named hurricanes, and
// ASCE carries an explicit hurricane wind-speed basis. SI units throughout:
// metres, newtons, pascals, seconds, kilograms.
//
// WHAT THIS IS NOT: there is no foundation, no torsion (the plan's centre of
// mass and centre of rigidity are not compared), no P-Δ second-order check, no
// beam or slab design, and the concrete sections are checked rather than sized.
// Those are stated in the report rather than quietly omitted.

import { rect as R, Rand, floorSystem, FLOOR_SYSTEMS, LATERAL_SYSTEMS, TYPOLOGIES } from './arch.js';

export const VERSION = 'brut-struct/1';
export const G = 9.80665;                          // m·s⁻²

/* ────────────────────────────── materials ───────────────────────────────── */

export const MAT = {
  fc: 40e6,               // Pa — concrete cylinder strength
  fy: 500e6,              // Pa — reinforcement yield
  Ec: 30e9,               // Pa — 4700√f'c ≈ 29.7 GPa, rounded
  rho: 2400,              // kg·m⁻³ — reinforced concrete
  nu: 0.2,
  rhoCol: 0.015,          // longitudinal steel ratio assumed in columns
  rhoWall: 0.0025,        // ACI 318 minimum distributed wall reinforcement
  damping: 0.05,          // seismic (5% of critical)
  dampingWind: 0.015,     // wind serviceability — concrete, low amplitude
};
MAT.Gc = MAT.Ec / (2 * (1 + MAT.nu));

// Superimposed dead: finishes, services, movable partitions. ASCE 7 allows a
// partition allowance of 0.72 kPa where partitions can be relocated; this is
// that plus screed and services.
export const SDL = 1.5e3;                          // Pa

// A tuned mass damper: a few hundred tonnes on springs near the top, tuned to
// the first mode so it swings against it. Den Hartog's optimum for a mass ratio
// μ gives an effective added damping of roughly 3–4% at μ = 1%, which is what
// the big ones actually deliver.
export const TMD = { massRatio: 0.01, addedDamping: 0.035 };
export const CLADDING = { concrete: 6.0e3, glass: 0.6e3 };   // Pa of elevation

/* Live load by ROOM PROGRAMME. This is the coupling that makes the solve mean
   something: the schedule of accommodation the plan already prints is the load
   schedule. Values are ASCE 7-16 Table 4.3-1 converted to kPa. */
export const LIVE = {
  'open office': 2.4, office: 2.4, meeting: 4.8, breakout: 4.8, print: 4.8, server: 4.8,
  'council chamber': 4.8, committee: 2.9, 'reading room': 2.9, stacks: 7.2, archive: 7.2,
  registry: 4.8, exhibition: 4.8,
  'wet lab': 3.0, 'dry lab': 3.0, 'write-up': 2.4, 'tissue culture': 3.0, 'cold room': 4.8,
  'entrance hall': 4.8, reception: 4.8, 'café': 4.8, cafe: 4.8, loading: 12.0,
  store: 6.0, 'cycle store': 2.5, refuse: 4.8, plant: 7.5, WC: 2.4,
  'drying room': 1.9, laundry: 1.9, studio: 1.9,
  stall: 1.9,                                       // passenger vehicle deck
  nave: 4.8, narthex: 4.8, chancel: 4.8, apse: 4.8,
  corridor: 4.8, roof: 1.0, DEFAULT: 2.4,
};
// programmes whose live load is storage-like, so ASCE 12.7.2 counts 25% of it
// in the effective seismic weight
const STORAGE_LIKE = /store|stacks|archive|plant|refuse|loading|stall/;

export function liveFor(program) {
  if (LIVE[program] != null) return LIVE[program] * 1e3;
  const key = Object.keys(LIVE).find((k) => program.startsWith(k) || program.includes(k));
  if (key) return LIVE[key] * 1e3;
  if (/flat|bed|studio/.test(program)) return 1.9e3;      // residential
  if (/aisle|transept|chapel/.test(program)) return 4.8e3; // assembly
  return LIVE.DEFAULT * 1e3;
}

/* ───────────────────────── site + hazard presets ────────────────────────── */

export const SITE_CLASSES = ['B', 'C', 'D', 'E'];
export const EXPOSURES = ['B', 'C', 'D'];

export const SEISMIC_SCENARIOS = {
  low:      { label: 'Low seismicity',       Ss: 0.25, S1: 0.10, pga: 0.10, wg: 2 * Math.PI * 5.0, zg: 0.60, dur: 18 },
  moderate: { label: 'Moderate (M6 near)',   Ss: 0.75, S1: 0.30, pga: 0.22, wg: 2 * Math.PI * 4.0, zg: 0.60, dur: 24 },
  high:     { label: 'High (M7, stiff soil)', Ss: 1.50, S1: 0.60, pga: 0.42, wg: 2 * Math.PI * 3.0, zg: 0.55, dur: 30 },
  extreme:  { label: 'Extreme (M8, soft basin)', Ss: 2.00, S1: 0.90, pga: 0.62, wg: 2 * Math.PI * 1.8, zg: 0.45, dur: 40 },
};

// Saffir–Simpson is a 1-minute sustained speed; ASCE 7 design speeds are 3-second
// gusts. The Durst conversion between them is ~1.22, and the presets carry the
// converted value so the two numbers in the UI are not silently different things.
export const WIND_SCENARIOS = {
  inland:  { label: 'Inland design (ASCE 51 m/s)', V: 51, cat: null },
  coastal: { label: 'Coastal design (58 m/s)',     V: 58, cat: null },
  cat1:    { label: 'Hurricane cat 1',  V: 50,  cat: 1 },
  cat3:    { label: 'Hurricane cat 3',  V: 66,  cat: 3 },
  cat4:    { label: 'Hurricane cat 4',  V: 78,  cat: 4 },
  cat5:    { label: 'Hurricane cat 5',  V: 90,  cat: 5 },
};

// ASCE 7-16 Table 26.11-1 — terrain constants
const TERRAIN = {
  B: { alphaBar: 0.25, bBar: 0.45, c: 0.30, l: 97.54, epsBar: 1 / 3.0, zMin: 9.14, alpha: 7.0, zg: 365.76 },
  C: { alphaBar: 1 / 6.5, bBar: 0.65, c: 0.20, l: 152.4, epsBar: 1 / 5.0, zMin: 4.57, alpha: 9.5, zg: 274.32 },
  D: { alphaBar: 1 / 9.0, bBar: 0.80, c: 0.15, l: 198.12, epsBar: 1 / 8.0, zMin: 2.13, alpha: 11.5, zg: 213.36 },
};

// ASCE 7-16 Tables 11.4-1/2 — site coefficients, linearly interpolated on Ss/S1
const FA_TABLE = { B: [0.9, 0.9, 0.9, 0.9, 0.9], C: [1.3, 1.3, 1.2, 1.2, 1.2], D: [1.6, 1.4, 1.2, 1.1, 1.0], E: [2.4, 1.7, 1.3, 1.1, 1.0] };
const FA_SS = [0.25, 0.5, 0.75, 1.0, 1.25];
const FV_TABLE = { B: [0.8, 0.8, 0.8, 0.8, 0.8], C: [1.5, 1.5, 1.5, 1.5, 1.4], D: [2.4, 2.2, 2.0, 1.9, 1.8], E: [4.2, 3.3, 2.8, 2.4, 2.2] };
const FV_S1 = [0.1, 0.2, 0.3, 0.4, 0.5];

function interp(xs, ys, x) {
  if (x <= xs[0]) return ys[0];
  if (x >= xs[xs.length - 1]) return ys[ys.length - 1];
  for (let i = 0; i < xs.length - 1; i++) {
    if (x <= xs[i + 1]) return ys[i] + ((ys[i + 1] - ys[i]) * (x - xs[i])) / (xs[i + 1] - xs[i]);
  }
  return ys[ys.length - 1];
}

/* ─────────────────────────── tiny linear algebra ────────────────────────── */
//
// Everything here is small (n ≤ 40) and symmetric, so a dense LU and a cyclic
// Jacobi rotation sweep are both plenty. No dependencies, and both are exact
// enough to be checked against closed-form answers in the selftest.

export function luFactor(A) {
  const n = A.length;
  const M = A.map((r) => r.slice());
  const piv = new Array(n).fill(0).map((_, i) => i);
  for (let k = 0; k < n; k++) {
    let p = k, best = Math.abs(M[k][k]);
    for (let i = k + 1; i < n; i++) if (Math.abs(M[i][k]) > best) { best = Math.abs(M[i][k]); p = i; }
    if (best < 1e-300) throw new Error('singular matrix at row ' + k);
    if (p !== k) { const t = M[p]; M[p] = M[k]; M[k] = t; const q = piv[p]; piv[p] = piv[k]; piv[k] = q; }
    for (let i = k + 1; i < n; i++) {
      M[i][k] /= M[k][k];
      for (let j = k + 1; j < n; j++) M[i][j] -= M[i][k] * M[k][j];
    }
  }
  return { M, piv, n };
}

export function luSolve(F, b) {
  const { M, piv, n } = F;
  const y = new Array(n);
  for (let i = 0; i < n; i++) {
    let s = b[piv[i]];
    for (let j = 0; j < i; j++) s -= M[i][j] * y[j];
    y[i] = s;
  }
  const x = new Array(n);
  for (let i = n - 1; i >= 0; i--) {
    let s = y[i];
    for (let j = i + 1; j < n; j++) s -= M[i][j] * x[j];
    x[i] = s / M[i][i];
  }
  return x;
}

export function solveSystem(A, b) { return luSolve(luFactor(A), b); }

// Cyclic Jacobi for a symmetric matrix → { values, vectors } with vectors[j]
// the j-th eigenvector, sorted by ascending eigenvalue.
export function jacobiEig(Ain, sweeps = 100, tol = 1e-12) {
  const n = Ain.length;
  const A = Ain.map((r) => r.slice());
  let V = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (i === j ? 1 : 0)));
  for (let sweep = 0; sweep < sweeps; sweep++) {
    let off = 0;
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) off += A[i][j] * A[i][j];
    if (Math.sqrt(off) < tol) break;
    for (let p = 0; p < n - 1; p++) {
      for (let q = p + 1; q < n; q++) {
        if (Math.abs(A[p][q]) < 1e-300) continue;
        const theta = (A[q][q] - A[p][p]) / (2 * A[p][q]);
        const t = Math.sign(theta || 1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
        const c = 1 / Math.sqrt(t * t + 1), s = t * c;
        for (let k = 0; k < n; k++) {
          const akp = A[k][p], akq = A[k][q];
          A[k][p] = c * akp - s * akq; A[k][q] = s * akp + c * akq;
        }
        for (let k = 0; k < n; k++) {
          const apk = A[p][k], aqk = A[q][k];
          A[p][k] = c * apk - s * aqk; A[q][k] = s * apk + c * aqk;
        }
        for (let k = 0; k < n; k++) {
          const vkp = V[k][p], vkq = V[k][q];
          V[k][p] = c * vkp - s * vkq; V[k][q] = s * vkp + c * vkq;
        }
      }
    }
  }
  const idx = Array.from({ length: n }, (_, i) => i).sort((a, b) => A[a][a] - A[b][b]);
  return {
    values: idx.map((i) => A[i][i]),
    vectors: idx.map((i) => V.map((row) => row[i])),
  };
}

/* ──────────────────────────── model assembly ────────────────────────────── */

const areaOf = (rs) => rs.reduce((s, r) => s + R.area(r), 0);

// Per-level floor areas, loads and masses. `dir` is irrelevant here — gravity
// does not care which way the wind blows.
export function loads(b) {
  const p = b.params;
  const FS = floorSystem(p);
  const out = [];
  for (let i = 0; i < b.levels.length; i++) {
    const L = b.levels[i];
    const area = areaOf(L.wings);
    // Dead: the FLOOR SYSTEM's own weight — not a nominal slab. This is the
    // single biggest number in the whole solve, because it is most of the
    // seismic mass, and it is why a post-tensioned plate and a 420 mm lump of
    // concrete are not interchangeable.
    let dead = (FS.weight + SDL) * area;
    for (const c of L.columns) dead += 0.62 * 0.62 * L.h * MAT.rho * G;
    for (const c of L.cores) dead += corePerimeter(c) * 0.30 * L.h * MAT.rho * G;
    // cladding: the facade the generator actually drew, module by module
    let clad = 0;
    for (const f of b.facades.filter((q) => q.level === i)) {
      for (const bay of f.bays) {
        // 'open' is AIR — a pilotis undercroft or an open car-park deck. It is
        // neither glass nor concrete, and counting it as concrete was putting a
        // 6 kPa cladding panel where the building has a hole.
        if (bay.module === 'open') continue;
        const gl = glassRatio(bay.module);
        clad += bay.w * f.h * (gl * CLADDING.glass + (1 - gl) * CLADDING.concrete);
      }
    }
    dead += clad;
    // live: straight off the room schedule, plus circulation, plus roof where
    // this level's plate is exposed rather than built on
    let live = 0;
    for (const r of L.rooms) live += R.area(r) * liveFor(r.program);
    for (const c of L.corridors) live += R.area(c) * LIVE.corridor * 1e3;
    let storage = 0;
    for (const r of L.rooms) if (STORAGE_LIKE.test(r.program)) storage += R.area(r) * liveFor(r.program);
    const above = b.levels[i + 1] ? b.levels[i + 1].wings : [];
    const roofArea = L.wings.reduce((s, wg) => s + areaOf(R.subtract(wg, above)), 0);
    live += roofArea * LIVE.roof * 1e3;
    dead += roofArea * SDL * 0.5;                                        // roof build-up
    // ASCE 12.7.2 effective seismic weight: dead + 25% of storage-type live
    const W = dead + 0.25 * storage;
    out.push({
      level: i, y: L.y, h: L.h, area: r2(area), roofArea: r2(roofArea),
      dead: r2(dead), live: r2(live), clad: r2(clad), seismicW: r2(W), mass: r2(W / G),
    });
  }
  return out;
}

function corePerimeter(c) { return 2 * (c.w + c.d); }
function glassRatio(mod) {
  // mirrors MODULES[].glass without importing the table, so a facade change that
  // adds a module cannot silently drop out of the load takedown
  const G_ = { pier: 0, buttress: 0, blank: 0, recess: 0.10, vent: 0, slit: 0.22, band: 0.62,
    brise: 0.55, oriel: 0.48, balcony: 0.35, lancet: 0.30, rose: 0.55, open: 0 };
  return G_[mod] != null ? G_[mod] : 0.3;
}

const r2 = (v) => Math.round(v * 100) / 100;

/* Lateral model in one direction. 'x' means the building sways along +x, so it
   bends about the z axis and the plan dimension B (the width presented to the
   wind) is the x extent. */
export function lateralModel(b, dir = 'x', siteClass = 'D') {
  const p = b.params;
  const FS = floorSystem(p);
  const bxPlan = plan(b);
  const W = loads(b);
  const n = b.levels.length;
  const h = [], m = [], EI = [], GA = [], y = [], webArea = [];
  const colSize = 0.62, wallT = 0.30;
  const Ic = (colSize ** 4) / 12, Ac = colSize * colSize;

  for (let i = 0; i < n; i++) {
    const L = b.levels[i];
    h.push(L.h);
    y.push(L.y + L.h);
    m.push(W[i].mass);

    const cx = L.wings.reduce((s, wg) => s + wg.x * R.area(wg), 0) / Math.max(1e-9, areaOf(L.wings));
    const cz = L.wings.reduce((s, wg) => s + wg.z * R.area(wg), 0) / Math.max(1e-9, areaOf(L.wings));
    const pw = perimeterWalls(b, i, dir, cx, cz);

    // ── EI: the cantilever component ──────────────────────────────────────
    // What actually bends is what is CONTINUOUS: the core boxes, and the solid
    // part of the perimeter walls — which in an in-situ concrete building is
    // most of the elevation, and is the whole lateral system of a building with
    // no core at all (the cathedral). Web walls bend in their own plane; the
    // walls on the returns act as flanges, at reduced efficiency for shear lag.
    // Whether the cores are STRUCTURE is the lateral system's decision. A
    // moment-frame building still has stair and lift shafts — they are just
    // enclosures, not part of the seismic force-resisting system, and counting
    // them made 'frame' and 'core + frame' come out identical.
    const coresActive = p.lateral !== 'frame';
    let EIcore = 0;
    for (const c of (coresActive ? L.cores : [])) {
      const bw = c.w, dd = c.d;
      const I = dir === 'x'
        ? (bw ** 3 * dd - (bw - 2 * wallT) ** 3 * (dd - 2 * wallT)) / 12
        : (dd ** 3 * bw - (dd - 2 * wallT) ** 3 * (bw - 2 * wallT)) / 12;
      const arm = dir === 'x' ? c.x - cx : c.z - cz;
      EIcore += MAT.Ec * (Math.max(0, I) + coreArea(c, wallT) * arm * arm);
    }
    // The frame's own axial couple, perimeter columns only. How much of it is
    // real depends entirely on the LATERAL SYSTEM: an ordinary wide-bay frame
    // gets almost none of it, a framed tube gets most of it, because that is
    // what crowding the columns and deepening the spandrels buys you.
    let EIframe = 0;
    for (const c of L.columns) {
      if (!c.edge) continue;
      const arm = dir === 'x' ? c.x - cx : c.z - cz;
      EIframe += MAT.Ec * Ac * arm * arm;
    }
    const tubeEff = p.lateral === 'framed-tube' ? 0.55 : p.lateral === 'diagrid' ? 0.30 : 0.15;
    // ACI 318-19 §6.6.3.1 — a lateral analysis uses CRACKED stiffness, not gross:
    // 0.35Ig for cracked walls, 0.70Ig for columns. Ignoring this is the other
    // half of why an uncorrected model comes out stiffer than the code's own
    // lower-bound period.
    // A diagrid's diagonals carry the overturning AXIALLY on the flange faces —
    // Moon, Connor & Fernandez (2007): EI ≈ ½ N_df E A_d sin²θ B², GA ≈ 2 N_dw
    // E A_d cos²θ sinθ. That is the whole reason a diagrid is stiffer per kilo
    // than anything else: nothing is bending.
    let EIdia = 0, GAdia = 0;
    if (p.lateral === 'diagrid') {
      const Ad = 0.45 * 0.45 * 0.35;                  // hollow section, 450 mm square
      const Es = 200e9;
      const face = dir === 'x' ? bxPlan.w : bxPlan.d;
      const flange = dir === 'x' ? bxPlan.d : bxPlan.w;
      const cw = p.bay * 2, dyMod = 2 * L.h;
      const th = Math.atan2(dyMod, cw);
      const Ndw = 2 * Math.max(1, Math.round(face / cw)) * 2;      // both webs, both directions
      const Ndf = 2 * Math.max(1, Math.round(flange / cw)) * 2;
      EIdia = 0.5 * Ndf * Es * Ad * Math.sin(th) ** 2 * face * face;
      GAdia = 2 * Ndw * Es * Ad * Math.cos(th) ** 2 * Math.sin(th);
    }
    // ACI 318-19 §6.6.3.1 — a lateral analysis uses CRACKED stiffness, not gross:
    // 0.35Ig for cracked walls, 0.70Ig for columns. Ignoring this is the other
    // half of why an uncorrected model comes out stiffer than the code's own
    // lower-bound period. Steel diagonals do not crack, so they are not reduced.
    EI.push(0.5 * (EIcore + MAT.Ec * pw.I) + 0.7 * (tubeEff * EIframe + MAT.Ec * Ic * L.columns.length) + EIdia);

    // ── GA: the racking component ─────────────────────────────────────────
    // Muto's D-value: a column between finite-stiffness beams is softer than the
    // fixed-fixed 12EI/h³. K̄ = ΣK_beam/(2K_col); a = K̄/(2+K̄); for the ground
    // storey with a fixed base, a = (0.5+K̄)/(2+K̄).
    const Kcol = Ic / L.h;
    // The beam the columns are framed into is the FLOOR SYSTEM's beam — and a
    // flat slab has none, which is exactly why flat-slab frames are soft. A
    // framed tube's deep spandrel is the same term, made large on purpose.
    const beamI = p.lateral === 'framed-tube'
      ? (0.45 * Math.min(1.2, L.h * 0.32) ** 3) / 12
      : FS.beamD > 0.05 ? (0.4 * FS.beamD ** 3) / 12
        : ((p.bay / 2) * FS.slab ** 3) / 12;
    const Kbeam = beamI / p.bay;
    const Kbar = (2 * Kbeam) / (2 * Kcol);
    const a = i === 0 ? (0.5 + Kbar) / (2 + Kbar) : Kbar / (2 + Kbar);
    const kFrame = L.columns.length * a * (12 * MAT.Ec * Ic) / (L.h ** 3);
    // webs in shear: core walls plus the solid perimeter, parallel to the sway.
    // ACI 318-19 §6.6.3.1 cracks the SHEAR stiffness as well as the flexural
    // one — a cracked wall is roughly half as stiff in shear as the gross
    // section says, and a core pierced by a door at every landing is worse.
    let Aweb = pw.Aweb;
    for (const c of (coresActive ? L.cores : [])) Aweb += 2 * wallT * (dir === 'x' ? c.w : c.d) * 0.75;
    const kWall = (0.5 * MAT.Gc * Aweb) / (1.2 * L.h);                  // κ = 1.2, rectangle
    GA.push((kFrame + kWall) * L.h + GAdia);
    webArea.push(r2(Aweb));
  }

  const bx = bxPlan;
  // Outriggers act as a ROTATIONAL restraint on the core at the level they sit:
  // the core tries to rotate, the perimeter columns below stretch and squash to
  // stop it. Kθ = 2 E A d² / x, with x the height from the base to the outrigger.
  const rotSprings = [];
  if (p.lateral === 'outrigger' && b.cores.length && n > 5) {
    for (const frac of [0.55, 0.92]) {
      const li = Math.min(n - 1, Math.max(1, Math.round(frac * n) - 1));
      const L = b.levels[li];
      const arm = (dir === 'x' ? bx.w : bx.d) / 2;
      const Aper = L.columns.filter((c) => c.edge).length * Ac * 0.5;   // one side
      const x = Math.max(1, y[li]);
      rotSprings.push({ node: li, K: (2 * MAT.Ec * Aper * arm * arm) / x });
    }
  }
  return {
    dir, n, h, y, m, EI, GA, webArea, loads: W, rotSprings, siteClass,
    floor: FS, lateral: p.lateral, tmd: p.tmd,
    B: dir === 'x' ? bx.w : bx.d,          // plan dimension across the wind
    Lp: dir === 'x' ? bx.d : bx.w,         // plan dimension along the wind
    height: b.height,
    totalMass: r2(W.reduce((s, q) => s + q.mass, 0)),
    totalWeight: r2(W.reduce((s, q) => s + q.seismicW, 0)),
  };
}

function coreArea(c, t) { return c.w * c.d - Math.max(0, (c.w - 2 * t) * (c.d - 2 * t)); }

// The solid part of the elevation, working as structure. A brutalist facade is
// not cladding hung off a frame — it is cast concrete, and the blank bays and
// piers the generator drew are a shear wall whether or not anyone calls them
// one. Bays are read straight off the facade, so glazing the elevation really
// does soften the building.
const WALL_T = 0.25;                 // effective thickness of the solid facade
const FLANGE_EFF = 0.30;             // shear-lag efficiency of the return walls
// How composite a window-pierced wall really is. NOT a constant: it falls out
// of the solidity, by the same series argument as the shear path. A blank wall
// is half-composite (the rest is lost to the openings that are still there in a
// brutalist elevation — doors, service risers); a wall that is 40% glass is
// barely composite at all and behaves as a row of independent piers. Holding
// this at a flat 0.45 made every building flexure-dominated (α < 1) when a plan
// twice as wide as it is tall should obviously rack.
const coupling = (solidity) => 0.5 * solidity * solidity;
function perimeterWalls(b, i, dir, cx, cz) {
  let Aweb = 0, I = 0, webLen = 0;
  for (const f of b.facades.filter((q) => q.level === i)) {
    const inPlane = dir === 'x' ? f.nz !== 0 : f.nx !== 0;   // wall runs along the sway
    // Same rule as the cladding: an 'open' bay is a hole, not a wall. Counting
    // it as solid concrete was making open-sided car parks and pilotis
    // undercrofts the stiffest storeys in the building.
    let solid = 0;
    for (const bay of f.bays) solid += bay.module === 'open' ? 0 : bay.w * (1 - glassRatio(bay.module));
    if (solid <= 0) continue;
    if (inPlane) {
      // A PIERCED wall is not a plate. Every window cuts the in-plane continuity,
      // so it behaves as coupled piers: each bay's solid width is a pier bending
      // about its own axis, and only the fraction the spandrels can drag along
      // gets the pier-separation lever arm. Treating it as one unbroken plate
      // (I = tL³/12) overstates the stiffness by an order of magnitude and gives
      // a period shorter than the code's own lower-bound estimate — which is how
      // this was caught.
      // The SHEAR path is pierced too, and more damagingly than the flexural
      // one: to get from one storey to the next the shear has to pass through a
      // pier and then through a spandrel, in series. Squaring the solidity is
      // the crude version of that series stiffness, and without it a long
      // brutalist elevation reads as an unbroken 250 mm shear wall a hundred
      // metres long — which put every period here at a quarter of ASCE's own
      // deliberately-low estimate.
      const solidity = solid / Math.max(1e-6, f.len);
      Aweb += solid * WALL_T * solidity;
      webLen += solid;
      const piers = f.bays.map((bay) => ({
        l: bay.module === 'open' ? 0 : bay.w * (1 - glassRatio(bay.module)),
        c: dir === 'x' ? bay.x : bay.z,
      })).filter((q) => q.l > 0.05);
      const At = piers.reduce((s2, q) => s2 + q.l, 0) || 1;
      const cen = piers.reduce((s2, q) => s2 + q.l * q.c, 0) / At;
      const kappa = coupling(solid / Math.max(1e-6, f.len));
      for (const q of piers) {
        I += (WALL_T * q.l ** 3) / 12 + kappa * WALL_T * q.l * (q.c - cen) ** 2;
      }
    } else {
      // a flange: too far off-axis to shear, but its area × arm² is the tube
      const arm = dir === 'x'
        ? Math.abs((f.bays[0] ? f.bays[0].x : 0) - cx)
        : Math.abs((f.bays[0] ? f.bays[0].z : 0) - cz);
      I += FLANGE_EFF * solid * WALL_T * arm * arm;
    }
  }
  return { Aweb, I, webLen };
}

function plan(b) {
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (const L of b.levels) for (const wg of L.wings) {
    x0 = Math.min(x0, R.x0(wg)); x1 = Math.max(x1, R.x1(wg));
    z0 = Math.min(z0, R.z0(wg)); z1 = Math.max(z1, R.z1(wg));
  }
  return { w: x1 - x0, d: z1 - z0 };
}

/* ────────────────────── stiffness: assemble + condense ──────────────────── */

// Timoshenko beam element: shear-flexible, so a storey of a stiff-walled, weak-
// framed building bends and a storey of a moment frame racks, from one element.
function elementK(EI, GA, h) {
  const Phi = (12 * EI) / (GA * h * h);
  const c = EI / ((1 + Phi) * h ** 3);
  return [
    [12 * c, 6 * h * c, -12 * c, 6 * h * c],
    [6 * h * c, (4 + Phi) * h * h * c, -6 * h * c, (2 - Phi) * h * h * c],
    [-12 * c, -6 * h * c, 12 * c, -6 * h * c],
    [6 * h * c, (2 - Phi) * h * h * c, -6 * h * c, (4 + Phi) * h * h * c],
  ];
}

// Full 2n×2n stiffness with the base node fixed, DOF order [u1,θ1,u2,θ2,…].
export function assemble(M) {
  const n = M.n, N = 2 * n;
  const K = Array.from({ length: N }, () => new Array(N).fill(0));
  for (let e = 0; e < n; e++) {
    const ke = elementK(M.EI[e], M.GA[e], M.h[e]);
    // node e-1 (dofs 2e-2, 2e-1) and node e (dofs 2e, 2e+1); node -1 is the base
    const map = [2 * e - 2, 2 * e - 1, 2 * e, 2 * e + 1];
    for (let i = 0; i < 4; i++) {
      if (map[i] < 0) continue;
      for (let j = 0; j < 4; j++) {
        if (map[j] < 0) continue;
        K[map[i]][map[j]] += ke[i][j];
      }
    }
  }
  // outrigger restraint, applied to the rotation DOF of the node it ties
  for (const rs of M.rotSprings || []) {
    const dof = 2 * rs.node + 1;
    if (dof < N) K[dof][dof] += rs.K;
  }
  return K;
}

// Guyan: eliminate the rotations. Exact for statics, and exact for dynamics too
// while the rotary inertia of the floors is neglected.
export function condense(M) {
  const n = M.n;
  const K = assemble(M);
  const t = [], r = [];
  for (let i = 0; i < n; i++) { t.push(2 * i); r.push(2 * i + 1); }
  const sub = (rows, cols) => rows.map((i) => cols.map((j) => K[i][j]));
  const Ktt = sub(t, t), Ktr = sub(t, r), Krt = sub(r, t), Krr = sub(r, r);
  const F = luFactor(Krr);
  // Krr⁻¹ Krt, column by column
  const X = [];
  for (let c = 0; c < n; c++) X.push(luSolve(F, Krt.map((row) => row[c])));   // X[c] = column c
  const Khat = Array.from({ length: n }, () => new Array(n).fill(0));
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      let s = Ktt[i][j];
      for (let k = 0; k < n; k++) s -= Ktr[i][k] * X[j][k];
      Khat[i][j] = s;
    }
  }
  // symmetrise away the rounding asymmetry, so Jacobi is exact
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
    const v = (Khat[i][j] + Khat[j][i]) / 2; Khat[i][j] = v; Khat[j][i] = v;
  }
  return Khat;
}

/* ───────────────────────────── modal analysis ───────────────────────────── */

export function modal(M) {
  const n = M.n;
  const K = condense(M);
  const s = M.m.map((mi) => 1 / Math.sqrt(mi));
  const A = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => s[i] * K[i][j] * s[j]));
  const { values, vectors } = jacobiEig(A);
  const modes = [];
  let cum = 0;
  const total = M.m.reduce((a, c) => a + c, 0);
  for (let j = 0; j < n; j++) {
    const lam = Math.max(values[j], 1e-9);
    const w = Math.sqrt(lam);
    // back-transform and mass-normalise: φᵀMφ = 1
    let phi = vectors[j].map((v, i) => v * s[i]);
    const norm = Math.sqrt(phi.reduce((a, v, i) => a + M.m[i] * v * v, 0));
    phi = phi.map((v) => v / norm);
    if (phi[n - 1] < 0) phi = phi.map((v) => -v);        // point every mode up
    const gamma = phi.reduce((a, v, i) => a + M.m[i] * v, 0);
    const meff = gamma * gamma;
    cum += meff;
    modes.push({
      j, omega: w, T: (2 * Math.PI) / w, f: w / (2 * Math.PI),
      phi, gamma, meff, massRatio: meff / total, cumRatio: cum / total,
    });
  }
  return { K, modes, totalMass: total, T1: modes[0].T, f1: modes[0].f };
}

/* ───────────────────────── static lateral response ──────────────────────── */

// Given a storey force vector, return displacements, drifts, shears and moments.
export function staticLateral(M, Khat, F) {
  const u = solveSystem(Khat, F);
  const drift = u.map((v, i) => v - (i > 0 ? u[i - 1] : 0));
  const shear = [], moment = [];
  for (let i = 0; i < M.n; i++) {
    let V = 0, Mo = 0;
    for (let j = i; j < M.n; j++) { V += F[j]; Mo += F[j] * (M.y[j] - (i > 0 ? M.y[i - 1] : 0)); }
    shear.push(V); moment.push(Mo);
  }
  return {
    u, drift,
    driftRatio: drift.map((d, i) => Math.abs(d) / M.h[i]),
    shear, moment, baseShear: shear[0], baseMoment: moment[0],
    tip: u[M.n - 1],
  };
}

/* ─────────────────────────────── earthquake ─────────────────────────────── */

export function spectrumParams(scenarioKey, siteClass) {
  const sc = SEISMIC_SCENARIOS[scenarioKey] || SEISMIC_SCENARIOS.moderate;
  const Fa = interp(FA_SS, FA_TABLE[siteClass] || FA_TABLE.D, sc.Ss);
  const Fv = interp(FV_S1, FV_TABLE[siteClass] || FV_TABLE.D, sc.S1);
  const SDS = (2 / 3) * Fa * sc.Ss, SD1 = (2 / 3) * Fv * sc.S1;
  return { ...sc, key: scenarioKey, siteClass, Fa, Fv, SDS, SD1, TL: 8, T0: 0.2 * SD1 / SDS, Ts: SD1 / SDS };
}

// ASCE 7-16 §11.4.6 design response spectrum, as a fraction of g.
export function Sa(T, S) {
  if (T <= 0) return 0.4 * S.SDS;
  if (T < S.T0) return S.SDS * (0.4 + 0.6 * T / S.T0);
  if (T <= S.Ts) return S.SDS;
  if (T <= S.TL) return S.SD1 / T;
  return (S.SD1 * S.TL) / (T * T);
}

// The seismic force-resisting system. A concrete building with cores reads as a
// building-frame system with special reinforced concrete shear walls.
export const SFRS = { R: 6, Cd: 5, Omega0: 2.5, Ie: 1.0, Ct: 0.0488, x: 0.75, driftLimit: 0.020 };

export function seismic(b, M, md, S) {
  const n = M.n, H = M.height;
  const Ta = SFRS.Ct * Math.pow(H, SFRS.x);
  const Cu = interp([0.1, 0.15, 0.2, 0.3, 0.4], [1.7, 1.6, 1.5, 1.4, 1.4], S.SD1);
  const Tused = Math.min(md.T1, Cu * Ta);
  const W = M.loads.reduce((s, q) => s + q.seismicW, 0);

  // ── equivalent lateral force (§12.8) ─────────────────────────────────────
  let Cs = S.SDS / (SFRS.R / SFRS.Ie);
  const capT = Tused <= S.TL ? S.SD1 / (Tused * (SFRS.R / SFRS.Ie)) : (S.SD1 * S.TL) / (Tused ** 2 * (SFRS.R / SFRS.Ie));
  Cs = Math.min(Cs, capT);
  Cs = Math.max(Cs, Math.max(0.044 * S.SDS * SFRS.Ie, 0.01));
  if (S.S1 >= 0.6) Cs = Math.max(Cs, (0.5 * S.S1) / (SFRS.R / SFRS.Ie));
  const V = Cs * W;
  const k = Tused <= 0.5 ? 1 : Tused >= 2.5 ? 2 : 1 + (Tused - 0.5) / 2;
  const wh = M.loads.map((q, i) => q.seismicW * Math.pow(M.y[i], k));
  const sumWh = wh.reduce((a, c) => a + c, 0);
  const Felf = wh.map((v) => (v / sumWh) * V);
  const elf = staticLateral(M, md.K, Felf);

  // ── modal response spectrum (§12.9) ──────────────────────────────────────
  // enough modes to reach 90% of the mass, as the code requires
  const nModes = Math.max(1, md.modes.findIndex((m) => m.cumRatio >= 0.9) + 1) || n;
  const modal = [];
  for (let j = 0; j < nModes; j++) {
    const mo = md.modes[j];
    const SaG = Sa(mo.T, S) * G / (SFRS.R / SFRS.Ie);
    const f = mo.phi.map((v, i) => mo.gamma * M.m[i] * v * SaG);
    modal.push({ ...staticLateral(M, md.K, f), T: mo.T, meff: mo.meff, SaG });
  }
  const srss = (get) => {
    const out = new Array(n).fill(0);
    for (const r of modal) for (let i = 0; i < n; i++) out[i] += get(r)[i] ** 2;
    return out.map(Math.sqrt);
  };
  const rsaShear = srss((r) => r.shear);
  const rsaDrift = srss((r) => r.drift);
  // §12.9.1.4: scale the spectral result up to 100% of the ELF base shear
  const scale = rsaShear[0] > 0 ? Math.max(1, V / rsaShear[0]) : 1;

  const driftRatio = rsaDrift.map((d, i) => (d * scale * SFRS.Cd) / (SFRS.Ie * M.h[i]));
  const maxDrift = Math.max(...driftRatio);
  const maxAt = driftRatio.indexOf(maxDrift);

  return {
    S, Ta, Cu, T1: md.T1, Tused, Cs, W, V, k, nModes, scale,
    forces: Felf, elf,
    shear: rsaShear.map((v) => v * scale),
    drift: rsaDrift.map((v) => v * scale),
    driftRatio, maxDrift, maxAt,
    baseShear: rsaShear[0] * scale,
    baseMoment: elf.baseMoment,
    driftLimit: SFRS.driftLimit,
    modal,
  };
}

/* ─────────────────────────────── wind ───────────────────────────────────── */

export function Kz(z, exposure) {
  const T = TERRAIN[exposure] || TERRAIN.C;
  const zz = Math.max(z, 4.6);
  return 2.01 * Math.pow(Math.min(zz, T.zg) / T.zg, 2 / T.alpha);
}

// ASCE 7-16 §26.11.5 gust-effect factor for a FLEXIBLE building — it needs the
// fundamental frequency, which is exactly what the modal analysis just produced.
// This is the one place the dynamics feed back into the static load.
export function gustFactor(M, n1, V, exposure, beta = MAT.dampingWind) {
  const T = TERRAIN[exposure] || TERRAIN.C;
  const h = M.height, B = M.B, L = M.Lp;
  const zbar = Math.max(0.6 * h, T.zMin);
  const Iz = T.c * Math.pow(10 / zbar, 1 / 6);
  const Lz = T.l * Math.pow(zbar / 10, T.epsBar);
  const Q2 = 1 / (1 + 0.63 * Math.pow((B + h) / Lz, 0.63));
  const Vz = T.bBar * Math.pow(zbar / 10, T.alphaBar) * V;
  const N1 = (n1 * Lz) / Vz;
  const Rn = (7.47 * N1) / Math.pow(1 + 10.3 * N1, 5 / 3);
  const Rl = (eta) => (eta <= 0 ? 1 : 1 / eta - (1 - Math.exp(-2 * eta)) / (2 * eta * eta));
  const Rh = Rl((4.6 * n1 * h) / Vz);
  const RB = Rl((4.6 * n1 * B) / Vz);
  const RL = Rl((15.4 * n1 * L) / Vz);
  const R2 = (1 / beta) * Rn * Rh * RB * (0.53 + 0.47 * RL);
  const gQ = 3.4, gv = 3.4;
  const gR = Math.sqrt(2 * Math.log(3600 * n1)) + 0.577 / Math.sqrt(2 * Math.log(3600 * n1));
  const Gf = 0.925 * ((1 + 1.7 * Iz * Math.sqrt(gQ * gQ * Q2 + gR * gR * R2)) / (1 + 1.7 * gv * Iz));
  return { Gf, Q: Math.sqrt(Q2), R: Math.sqrt(R2), gR, Iz, Lz, Vz, N1, flexible: n1 < 1 };
}

export function wind(b, M, md, opts) {
  const V = opts.V, exposure = opts.exposure || 'C';
  const beta = opts.beta != null ? opts.beta : MAT.dampingWind;
  const Kzt = 1.0, Kd = 0.85, Ke = 1.0;
  const n1 = md.f1;
  const g = gustFactor(M, n1, V, exposure, beta);
  const Guse = g.flexible ? g.Gf : 0.85;
  const ratio = M.Lp / M.B;
  const CpLee = -interp([1, 2, 4], [0.5, 0.3, 0.2], ratio);
  const CpWind = 0.8;

  const qh = 0.613 * Kz(M.height, exposure) * Kzt * Kd * Ke * V * V;
  const F = [], press = [];
  for (let i = 0; i < M.n; i++) {
    const z = M.y[i];
    const qz = 0.613 * Kz(z, exposure) * Kzt * Kd * Ke * V * V;
    // the width presented at THIS level, which changes with the massing
    const width = levelWidth(b, i, M.dir);
    const trib = (M.h[i] + (i + 1 < M.n ? M.h[i + 1] : 0)) / 2;
    const p = Guse * (qz * CpWind + qh * Math.abs(CpLee));
    F.push(p * width * trib);
    press.push({ z: r2(z), qz: r2(qz), p: r2(p), width: r2(width) });
  }
  const res = staticLateral(M, md.K, F);

  // overturning: ASCE 7-16 §2.4.5 allows 0.6D against wind
  const Wtot = M.loads.reduce((s, q) => s + q.dead, 0);
  const stabilising = 0.6 * Wtot * (M.B / 2);
  const fsOT = stabilising / Math.max(1, res.baseMoment);

  // across-wind: vortex shedding lock-in, and the along-wind acceleration a
  // person on the top floor would feel
  const St = 0.10;
  const Vcr = (n1 * M.B) / St;
  const Ur = V / (n1 * M.B);
  const meanF = F.map((v) => v / (1 + 1.7 * g.gR * g.Iz * g.R));   // strip the peak factor
  const mean = staticLateral(M, md.K, meanF);
  const accel = Math.pow(2 * Math.PI * n1, 2) * g.gR * g.Iz * g.R * Math.abs(mean.tip);
  const milliG = (accel / G) * 1000;

  return {
    V, exposure, n1, gust: g, Gused: Guse, CpWind, CpLee, qh: r2(qh), press,
    forces: F, ...res,
    driftTotal: Math.abs(res.tip) / M.height,
    fsOT, stabilising, Vcr, Ur, lockIn: V >= Vcr * 0.9 && M.height / M.B > 4,
    accel, milliG,
  };
}

function levelWidth(b, i, dir) {
  const L = b.levels[i];
  let lo = Infinity, hi = -Infinity;
  for (const wg of L.wings) {
    lo = Math.min(lo, dir === 'x' ? R.x0(wg) : R.z0(wg));
    hi = Math.max(hi, dir === 'x' ? R.x1(wg) : R.z1(wg));
  }
  return hi - lo;
}

/* ───────────────────────────── gravity check ────────────────────────────── */

export function gravity(b, M) {
  const n = M.n;
  const colSize = 0.62, Ag = colSize * colSize;
  const Ast = MAT.rhoCol * Ag;
  // ACI 318-19 §22.4.2 — tied column, φ = 0.65, 0.80 cap for accidental eccentricity
  const phiPn = 0.65 * 0.80 * (0.85 * MAT.fc * (Ag - Ast) + MAT.fy * Ast);
  const cols = [];
  for (let i = 0; i < n; i++) {
    const L = b.levels[i];
    const W = M.loads[i];
    const area = Math.max(1e-6, W.area);
    const udl = (W.dead + W.live * liveReduction(area)) / area;         // Pa, averaged
    for (const c of L.columns) {
      // every level above this one that still has a column at this position
      let P = 0, trib = 0;
      for (let k = i; k < n; k++) {
        const above = b.levels[k].columns.find((q) => Math.abs(q.x - c.x) < 0.2 && Math.abs(q.z - c.z) < 0.2);
        if (!above) break;
        const Wk = M.loads[k], ak = Math.max(1e-6, Wk.area);
        const uk = (Wk.dead + Wk.live * liveReduction(ak)) / ak;
        P += uk * (above.trib || 0);
        trib += above.trib || 0;
        P += Ag * b.levels[k].h * MAT.rho * G;                          // its own weight
      }
      cols.push({ level: i, x: c.x, z: c.z, P: r2(P), trib: r2(trib), edge: c.edge });
    }
  }
  // slenderness: braced by the cores, so ACI 318 §6.2.5 allows kℓu/r ≤ 34 − 12(M1/M2)
  const rGyr = 0.289 * colSize;
  const slender = Math.max(...b.levels.map((L) => (1.0 * (L.h - 0.42)) / rGyr));
  const util = cols.map((c) => c.P / phiPn);
  const worst = util.reduce((best, u, i) => (u > util[best] ? i : best), 0);
  return {
    colSize, Ag, phiPn: r2(phiPn), columns: cols,
    maxUtil: util[worst], maxP: cols[worst].P, worst: cols[worst], slender,
    // what the section WOULD need to be, if it needs to be bigger
    required: r2(Math.sqrt(cols[worst].P / (phiPn / Ag))),
  };
}

// ASCE 7-16 §4.7.2 live load reduction: L = L0(0.25 + 4.57/√(KLL·AT))
function liveReduction(area, KLL = 4) {
  const AT = area / 6;                       // per-bay influence, roughly
  if (KLL * AT < 37.16) return 1;
  return Math.max(0.4, Math.min(1, 0.25 + 4.57 / Math.sqrt(KLL * AT)));
}

/* ──────────────────────── core shear wall capacity ──────────────────────── */

export function wallCheck(b, M, demandV) {
  const L = b.levels[0];
  const wallT = 0.30;
  let Acv = 0, lw = 0;
  for (const c of (b.params.lateral === 'frame' ? [] : L.cores)) {
    const web = M.dir === 'x' ? c.w : c.d;
    Acv += 2 * wallT * web;
    lw = Math.max(lw, web);
  }
  // the solid elevation is a wall too — and on a building with no core it is
  // the ONLY wall, which is exactly the cathedral's case
  const pw = perimeterWalls(b, 0, M.dir, 0, 0);
  Acv += pw.Aweb;
  lw = Math.max(lw, pw.webLen / 2 || 0);
  if (Acv <= 0) return null;
  const hw = M.height;
  // ACI 318-19 §18.10.4.1: αc = 0.25 for hw/lw ≤ 1.5, 0.17 for ≥ 2.0
  const ratio = hw / Math.max(0.1, lw);
  const alphaC = ratio <= 1.5 ? 0.25 : ratio >= 2 ? 0.17 : interp([1.5, 2], [0.25, 0.17], ratio);
  let Vn = Acv * (alphaC * Math.sqrt(MAT.fc / 1e6) * 1e6 + MAT.rhoWall * MAT.fy);
  Vn = Math.min(Vn, 0.66 * Acv * Math.sqrt(MAT.fc / 1e6) * 1e6);
  const phiVn = 0.75 * Vn;
  // Walls and frame split the storey shear in proportion to the stiffness they
  // actually contribute, rather than by a rule of thumb.
  const kWall = (MAT.Gc * Acv) / (1.2 * M.h[0]);
  const kTotal = M.GA[0] / M.h[0];
  const share = Math.min(1, Math.max(0.4, kWall / Math.max(kWall, kTotal)));
  return { Acv: r2(Acv), lw: r2(lw), alphaC, phiVn: r2(phiVn), demand: r2(demandV * share), share,
           util: (demandV * share) / phiVn };
}

/* ─────────────────────── seeded synthetic time histories ────────────────── */
//
// Both records are DETERMINISTIC functions of the building seed and the scenario
// name, so "this building in this earthquake" is a permalink like everything
// else here — reload and the same ground shakes it the same way.

function gaussian(rnd) {
  let u = 0, v = 0;
  while (u === 0) u = rnd.f();
  while (v === 0) v = rnd.f();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

// Kanai–Tajimi: white noise through a soil filter, shaped by a Jennings envelope
// and scaled to the scenario's peak ground acceleration.
export function groundMotion(seed, scenarioKey, dt = 0.01) {
  const sc = SEISMIC_SCENARIOS[scenarioKey] || SEISMIC_SCENARIOS.moderate;
  const rnd = Rand(seed, 'quake/' + scenarioKey);
  const nsteps = Math.round(sc.dur / dt);
  const wg = sc.wg, zg = sc.zg;
  let x = 0, xd = 0;
  const a = new Float64Array(nsteps);
  const t1 = sc.dur * 0.15, t2 = sc.dur * 0.45, decay = 3 / (sc.dur - t2);
  for (let i = 0; i < nsteps; i++) {
    const t = i * dt;
    const w = gaussian(rnd) / Math.sqrt(dt);
    const xdd = -2 * zg * wg * xd - wg * wg * x - w;
    xd += xdd * dt; x += xd * dt;
    const env = t < t1 ? (t / t1) ** 2 : t <= t2 ? 1 : Math.exp(-decay * (t - t2));
    a[i] = env * (2 * zg * wg * xd + wg * wg * x);
  }
  let peak = 0;
  for (let i = 0; i < nsteps; i++) peak = Math.max(peak, Math.abs(a[i]));
  const k = peak > 0 ? (sc.pga * G) / peak : 0;
  for (let i = 0; i < nsteps; i++) a[i] *= k;
  return { dt, n: nsteps, a, pga: sc.pga, label: sc.label, duration: sc.dur };
}

// Along-wind buffeting: a mean speed plus a Davenport-spectrum gust, quasi-steady
// drag. The turbulence is taken fully correlated over the height, which is
// conservative for base shear and is stated as such in the report.
export function gustRecord(seed, M, w, dt = 0.05, dur = 120) {
  const rnd = Rand(seed, 'wind/' + Math.round(w.V));
  const n = Math.round(dur / dt);
  const Iz = w.gust.Iz, Vz = w.gust.Vz;
  // a first-order filter with the integral time scale gives a Davenport-like
  // low-frequency roll-off without an FFT
  const Tint = Math.max(1, w.gust.Lz / Math.max(1, Vz));
  const alpha = Math.exp(-dt / Tint);
  let v = 0;
  const series = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    v = alpha * v + Math.sqrt(1 - alpha * alpha) * gaussian(rnd);
    series[i] = v;
  }
  const sigma = Iz * Vz;
  // per-level force history is the mean load scaled by (1 + v/V̄)²
  return { dt, n, series, sigma, Vz, Tint, mean: w.forces.map((f) => f / (1 + 1.7 * w.gust.gR * Iz * w.gust.R)) };
}

/* ─────────────────────── Newmark-β time integration ─────────────────────── */
//
// Average-acceleration (γ=½, β=¼) — unconditionally stable, no numerical damping,
// so the peak response is the model's, not the integrator's.

export function newmark(M, Khat, modesOut, force, opts = {}) {
  const n = M.n, dt = force.dt;
  const zeta = opts.zeta != null ? opts.zeta : MAT.damping;
  // Rayleigh damping anchored at modes 1 and 3 (or 1 and n if shorter)
  const w1 = modesOut.modes[0].omega;
  const w2 = modesOut.modes[Math.min(2, n - 1)].omega;
  const a0 = (2 * zeta * w1 * w2) / (w1 + w2), a1 = (2 * zeta) / (w1 + w2);
  const m = M.m;
  const C = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) =>
    a1 * Khat[i][j] + (i === j ? a0 * m[i] : 0)));

  const g1 = 0.5, b1 = 0.25;
  const Keff = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) =>
    Khat[i][j] + (g1 / (b1 * dt)) * C[i][j] + (i === j ? m[i] / (b1 * dt * dt) : 0)));
  const F = luFactor(Keff);

  let u = new Array(n).fill(0), v = new Array(n).fill(0), acc = new Array(n).fill(0);
  const peakDrift = new Array(n).fill(0);
  const peakU = new Array(n).fill(0);
  const trace = [];
  const keep = Math.max(1, Math.round(force.n / (opts.frames || 600)));
  let peakBase = 0;

  for (let step = 0; step < force.n; step++) {
    const p = force.at(step);
    const rhs = new Array(n);
    for (let i = 0; i < n; i++) {
      let cu = 0, cv = 0, ca = 0;
      for (let j = 0; j < n; j++) { cu += C[i][j] * u[j]; cv += C[i][j] * v[j]; ca += C[i][j] * acc[j]; }
      rhs[i] = p[i]
        + m[i] * (u[i] / (b1 * dt * dt) + v[i] / (b1 * dt) + (1 / (2 * b1) - 1) * acc[i])
        + (g1 / (b1 * dt)) * cu + ((g1 / b1) - 1) * cv + dt * ((g1 / (2 * b1)) - 1) * ca;
    }
    const un = luSolve(F, rhs);
    const an = un.map((x, i) => (x - u[i]) / (b1 * dt * dt) - v[i] / (b1 * dt) - (1 / (2 * b1) - 1) * acc[i]);
    const vn = un.map((x, i) => v[i] + dt * ((1 - g1) * acc[i] + g1 * an[i]));
    u = un; v = vn; acc = an;

    let base = 0;
    for (let i = 0; i < n; i++) {
      const d = Math.abs(u[i] - (i > 0 ? u[i - 1] : 0)) / M.h[i];
      if (d > peakDrift[i]) peakDrift[i] = d;
      if (Math.abs(u[i]) > peakU[i]) peakU[i] = Math.abs(u[i]);
      let ku = 0;
      for (let j = 0; j < n; j++) ku += Khat[i][j] * u[j];
      base += ku;
    }
    peakBase = Math.max(peakBase, Math.abs(base));
    if (step % keep === 0) trace.push({ t: r2(step * dt), u: u.map((x) => Math.round(x * 1e4) / 1e4) });
  }
  return { peakDrift, peakU, peakBase, maxDrift: Math.max(...peakDrift), trace, dt, zeta, rayleigh: [a0, a1] };
}

// Wrap a ground-acceleration record as the effective force −M·1·a_g(t).
export function quakeForcing(M, gm) {
  return { n: gm.n, dt: gm.dt, at: (k) => M.m.map((mi) => -mi * gm.a[k]) };
}
// …and a gust record as a per-level drag history.
export function windForcing(M, rec) {
  return {
    n: rec.n, dt: rec.dt,
    at: (k) => {
      const f = 1 + (rec.sigma * rec.series[k]) / Math.max(1, rec.Vz);
      const q = f * Math.abs(f);                     // quasi-steady (V̄+v)² , signed
      return rec.mean.map((F0) => F0 * q);
    },
  };
}


/* ────────────────────────────── foundation ──────────────────────────────── */
//
// A building does not end at the ground. The overturning moment the wind and
// the earthquake produce has to go somewhere, and on soft ground that — not the
// superstructure — is what decides the design. So the ground is a property of
// the SITE (it comes off the site class, which the seismic analysis already
// asked for), and the foundation TYPE is not chosen: it is what the demand and
// the ground between them force.
//
// pads → raft → piles, in that order, each one used until it stops working.

export const SOILS = {
  B: { label: 'rock',              q: 3000e3, Es: 2000e6, mu: 0.60, pile: 8.0e6 },
  C: { label: 'very dense soil',   q: 600e3,  Es: 150e6,  mu: 0.50, pile: 3.5e6 },
  D: { label: 'stiff soil',        q: 250e3,  Es: 50e6,   mu: 0.40, pile: 1.8e6 },
  E: { label: 'soft clay',         q: 100e3,  Es: 15e6,   mu: 0.30, pile: 0.9e6 },
};

export function foundation(b, M, gv, demandM, demandV) {
  const soil = SOILS[M.siteClass] || SOILS.D;
  const p = b.params;

  // total vertical service load, and the plan the foundation has to sit inside
  const N = M.loads.reduce((s, q) => s + q.dead + 0.5 * q.live, 0);
  const foot = b.levels[0].wings.reduce((s, w) => s + R.area(w), 0);
  const B = M.B, Lp = M.Lp;

  // ── 1. pad footings, one per column ──────────────────────────────────────
  const padN = gv.maxP * 1.15;                          // + the pad's own weight
  const padB = Math.sqrt(padN / soil.q);
  const padsFit = padB < 0.55 * p.bay;

  // ── 2. raft: bearing pressure with the overturning eccentricity ──────────
  // e = M/N. Inside the middle third (e ≤ B/6) the whole raft stays in
  // compression; outside it, one edge lifts and the pressure redistributes.
  const A = Math.max(1, foot * 1.15);                   // raft oversails the plate
  const Braft = B * 1.08;
  const e = demandM / Math.max(1, N);
  const inMiddleThird = e <= Braft / 6;
  const pMax = inMiddleThird
    ? (N / A) * (1 + (6 * e) / Braft)
    : (2 * N) / (3 * A * (Braft / 2 - e) / (Braft / 2));  // triangular, partial bearing
  const pMin = inMiddleThird ? (N / A) * (1 - (6 * e) / Braft) : 0;
  // Settlement, elastic half-space under a RIGID raft: s = q·B·(1−ν²)·I/Es with
  // I ≈ 0.6 for a rigid rectangle (1.0 is the flexible-centre value and
  // overstates a stiff raft badly).
  const q0 = N / A;
  const settleRaft = (q0 * Braft * (1 - 0.09) * 0.6) / soil.Es;
  // Tolerable TOTAL settlement is not one number: 25 mm is a pad limit, a big
  // raft is allowed far more because it settles as a dish rather than
  // differentially, and piles into a stiffer stratum cut it again.
  const limitPad = 0.025, limitRaft = 0.065;
  const raftWorks = pMax <= soil.q && inMiddleThird && settleRaft <= limitRaft;

  // ── 3. piles, when the raft cannot hold the pressure or the edge lifts ───
  const nPiles = Math.ceil((N * 1.1) / soil.pile);
  // uplift: the overturning couple divided by the lever arm, less the weight
  const upliftForce = Math.max(0, (demandM / (0.8 * Braft)) - N / 2);
  const nTension = upliftForce > 0 ? Math.ceil(upliftForce / (0.4 * soil.pile)) : 0;

  // The ladder: pads while they fit and the ground can take them, then a raft,
  // then piles. Settlement is part of the ladder, not an afterthought — a raft
  // that settles too far sends you to piles just as surely as one that
  // overstresses the ground.
  const type = padsFit && raftWorks && e < Braft / 12 && settleRaft <= limitPad ? 'pads'
    : raftWorks ? 'raft' : 'piled raft';
  const settle = type === 'piled raft' ? settleRaft / 4 : settleRaft;
  const settleLimit = type === 'pads' ? limitPad : type === 'raft' ? limitRaft : 0.04;

  // ── sliding: friction under the base against the governing base shear ────
  const slidingCap = soil.mu * N * 0.9;

  return {
    soil: { ...soil, siteClass: M.siteClass }, type,
    N: r2(N), area: r2(A), B: r2(Braft), e: r2(e), inMiddleThird,
    pMax: r2(pMax), pMin: r2(pMin), qAllow: soil.q,
    padB: r2(padB), padsFit, nPiles, nTension, upliftForce: r2(upliftForce),
    settle, settleLimit, settleRaft, slidingCap: r2(slidingCap), slidingDemand: r2(demandV),
    depth: type === 'pads' ? 1.2 : type === 'raft' ? Math.max(1.2, M.height / 28) : 1.8,
    note: type === 'pads'
      ? `${gv.columns.filter((c) => c.level === 0).length} pads at ${(padB).toFixed(1)} m square on ${soil.label}`
      : type === 'raft'
        ? `${A.toFixed(0)} m² raft, ${(pMax / 1e3).toFixed(0)} kPa peak on ${(soil.q / 1e3).toFixed(0)} kPa ${soil.label}`
        : `${nPiles} piles${nTension ? ` (+${nTension} in tension)` : ''} at ${(soil.pile / 1e6).toFixed(1)} MN each — ${soil.label} cannot take the raft pressure`,
  };
}

// The foundation, as boxes, so the section drawing and the loads view can show
// it. It is drawn below zero, which is where it is.
export function foundationParts(b, f, gv) {
  const out = [];
  const L0 = b.levels[0];
  if (f.type === 'pads') {
    for (const c of gv.columns.filter((q) => q.level === 0)) {
      out.push({ mat: 'core', kind: 'pad', x: c.x, y: -f.depth / 2, z: c.z,
                 w: r2(f.padB), h: r2(f.depth), d: r2(f.padB) });
    }
  } else {
    for (const wg of L0.wings) {
      out.push({ mat: 'core', kind: 'raft', x: wg.x, y: -f.depth / 2, z: wg.z,
                 w: r2(wg.w * 1.08), h: r2(f.depth), d: r2(wg.d * 1.08) });
    }
    if (f.type === 'piled raft') {
      // a grid of piles under the raft, as many as the count calls for
      const wg = L0.wings[0];
      const per = Math.max(1, Math.round(Math.sqrt(f.nPiles)));
      for (let i = 0; i < per; i++) {
        for (let k = 0; k < per; k++) {
          out.push({
            mat: 'core', kind: 'pile',
            x: r2(R.x0(wg) + ((i + 0.5) * wg.w) / per), y: r2(-f.depth - 9),
            z: r2(R.z0(wg) + ((k + 0.5) * wg.d) / per),
            w: 0.75, h: 18, d: 0.75,
          });
        }
      }
    }
  }
  return out;
}

/* ──────────────────────────── the verification ──────────────────────────── */

const p2 = (v) => v.toFixed(2);
const check = (id, name, demand, capacity, unit, note) => {
  const util = capacity > 0 ? demand / capacity : Infinity;
  return { id, name, demand, capacity, unit, util, margin: 1 - util, pass: util <= 1, note };
};

export function verify(b, opts = {}) {
  const o = {
    seismicScenario: 'moderate', siteClass: 'D', windScenario: 'inland',
    exposure: 'C', ...opts,
  };
  const p = b.params;
  const S = spectrumParams(o.seismicScenario, o.siteClass);
  const Vwind = (WIND_SCENARIOS[o.windScenario] || WIND_SCENARIOS.inland).V;

  const dirs = {};
  for (const dir of ['x', 'z']) {
    const M = lateralModel(b, dir, o.siteClass);
    const md = modal(M);
    const eq = seismic(b, M, md, S);
    // A tuned mass damper does not change the stiffness, so it changes neither
    // the period nor the base shear. What it changes is the DAMPING in the mode
    // it is tuned to, which is what the gust factor and the comfort check care
    // about. Modelled as added modal damping rather than an explicit auxiliary
    // DOF — the design-office treatment, and stated as such.
    const beta = MAT.dampingWind + (b.params.tmd ? TMD.addedDamping : 0);
    const wd = wind(b, M, md, { V: Vwind, exposure: o.exposure, beta });
    dirs[dir] = { M, md, eq, wd, wall: wallCheck(b, M, Math.max(eq.baseShear, wd.baseShear)) };
  }
  const gv = gravity(b, dirs.x.M);

  // the governing direction for each hazard
  const eqDir = dirs.x.eq.maxDrift >= dirs.z.eq.maxDrift ? 'x' : 'z';
  const wdDir = dirs.x.wd.driftTotal >= dirs.z.wd.driftTotal ? 'x' : 'z';
  const eq = dirs[eqDir].eq, wd = dirs[wdDir].wd;
  const govM = Math.max(eq.baseMoment, wd.baseMoment);
  const govV = Math.max(eq.baseShear, wd.baseShear);
  const fnd = foundation(b, dirs[wdDir].M, gv, govM, govV);
  const FS = dirs.x.M.floor;

  const checks = [
    check('col', 'Column axial (ACI 318 §22.4)', gv.maxP, gv.phiPn, 'N',
      `worst at level ${gv.worst.level}, tributary ${gv.worst.trib} m²`),
    check('eqdrift', 'Seismic storey drift (ASCE §12.12)', eq.maxDrift, SFRS.driftLimit, '—',
      `storey ${eq.maxAt} in ${eqDir}, T₁ = ${eq.T1.toFixed(2)} s`),
    check('wdrift', 'Wind drift, serviceability', wd.driftTotal, 1 / 500, '—',
      `H/${Math.round(1 / Math.max(1e-9, wd.driftTotal))} in ${wdDir}`),
    check('ot', 'Overturning (0.6D resisting)', wd.baseMoment, wd.stabilising, 'N·m',
      `FS = ${wd.fsOT.toFixed(2)} against ${Math.round(Vwind)} m/s`),
    check('comfort', 'Occupant comfort, 10-yr wind', wd.milliG, 20, 'milli-g',
      'ISO 10137 office threshold ≈ 20 milli-g'),
  ];
  if (dirs[eqDir].wall) {
    const w = dirs[eqDir].wall;
    checks.push(check('wall', 'Core wall shear (ACI 318 §18.10)', w.demand, w.phiVn, 'N',
      `cores take ${Math.round(w.share * 100)}% of base shear`));
  }
  // ── the floor system, checked as a system ────────────────────────────────
  checks.push(check('span', `Floor span — ${FS.label}`, b.params.bay, FS.maxSpan, 'm',
    `${FS.short} at ${b.params.bay.toFixed(1)} m; economical to ${FS.maxSpan} m`));
  // what counts as enough headroom depends on what the floor is FOR — a car
  // park is happy at 2.1 m where an office is not
  const clearTarget = (TYPOLOGIES[p.typology] || {}).clearTarget || 2.5;
  checks.push(check('clear', 'Clear height under structure', clearTarget, Math.max(0.01, FS.clear), 'm',
    `${p2(FS.depth)} m structure + ${p2(FS.services)} m services in a ${p2(p.floorH)} m storey; ${p2(clearTarget)} m wanted`));

  // ── the foundation ───────────────────────────────────────────────────────
  checks.push(check('bearing', `Bearing pressure — ${fnd.type}`, fnd.pMax, fnd.qAllow, 'Pa', fnd.note));
  checks.push(check('sliding', 'Sliding at the base', fnd.slidingDemand, fnd.slidingCap, 'N',
    `friction on ${fnd.soil.label}, μ = ${fnd.soil.mu}`));
  checks.push(check('settle', 'Settlement', fnd.settle, fnd.settleLimit, 'm',
    `${(fnd.settle * 1000).toFixed(0)} mm elastic on ${fnd.soil.label}, ${(fnd.settleLimit * 1000).toFixed(0)} mm tolerable for a ${fnd.type}`));
  if (!fnd.inMiddleThird) {
    checks.push({
      id: 'uplift', name: 'Foundation uplift', demand: fnd.e, capacity: fnd.B / 6, unit: 'm',
      util: fnd.e / (fnd.B / 6), margin: 1 - fnd.e / (fnd.B / 6), pass: false,
      note: `resultant is outside the middle third — one edge of the base lifts${fnd.nTension ? `, ${fnd.nTension} tension piles needed` : ''}`,
    });
  }

  checks.push({
    id: 'vortex', name: 'Vortex lock-in', demand: wd.Ur, capacity: 10, unit: 'V/(n₁B)',
    util: wd.lockIn ? 1.05 : wd.Ur / 10, margin: wd.lockIn ? -0.05 : 1 - wd.Ur / 10,
    pass: !wd.lockIn, note: `critical speed ${wd.Vcr.toFixed(0)} m/s, H/B = ${(dirs[wdDir].M.height / dirs[wdDir].M.B).toFixed(1)}`,
  });

  checks.sort((a, c) => c.util - a.util);
  const governing = checks[0];
  const verdict = checks.every((c) => c.util <= 1) ? (governing.util > 0.85 ? 'marginal' : 'pass') : 'fail';

  return {
    version: VERSION, seed: b.seed, opts: o, site: S, windV: Vwind,
    dirs, gravity: gv, foundation: fnd, floor: FS,
    lateral: b.params.lateral, lateralLabel: (LATERAL_SYSTEMS[b.params.lateral] || {}).label, tmd: b.params.tmd,
    checks, governing, verdict, eqDir, wdDir,
    summary: {
      T1x: dirs.x.md.T1, T1z: dirs.z.md.T1,
      massTonnes: Math.round(dirs.x.M.totalMass / 1000),
      weightMN: dirs.x.M.totalWeight / 1e6,
      baseShearEq: eq.baseShear, baseShearWind: wd.baseShear,
      driftEq: eq.maxDrift, driftWind: wd.driftTotal,
      Cs: eq.Cs, Gf: wd.Gused, milliG: wd.milliG,
      minMargin: Math.min(...checks.map((c) => c.margin)),
      // how the lateral system actually works: α = H√(GA/EI) — small is a
      // cantilever wall, large is a racking frame
      alpha: dirs.x.M.height * Math.sqrt(dirs.x.M.GA[0] / dirs.x.M.EI[0]),
      floorWeight: FS.weight, clear: FS.clear, foundation: fnd.type,
    },
  };
}

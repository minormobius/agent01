// research.js — the compute kernels behind hoop's research dossier (research.html).
//
// hoop is the GAME wing, but the dossier collates the SUPPORTING WORLD research from the
// three modelling wings — structure (rind), thermodynamics (tide), ecology (biome). hoop is
// a pure-static deploy surface and cannot import a sibling wing's modules at runtime (same
// reason vendor/auth.js is a verbatim copy), so the dossier's "active figures" are honest,
// self-contained re-derivations of each wing's headline physics, cited back to the source.
//
// Everything above the DOM guard is pure, deterministic and zero-dep, so it runs identically
// in node and the browser — and is pinned by hoop/test/research.selftest.mjs against the
// numbers the wings publish (steel tears @ 8 km/0.8 g, ~31 K adiabat, ~32% pressure drop,
// a food web that closes vs. the Biosphere-2 crash). The figures render the same kernels.

// ───────────────────────────────────────────────────────────────────────────────────────
// FIGURE 1 — STRUCTURE (rind): spin gravity loads the shell as hoop stress.
//
// A patch of spinning shell at radius R turning at ω feels a=ω²R outward; the floor wants
// g·g0 so ω=√(g·g0/R) and the rim moves at v=ωR ⇒ v²=a·R. A ring carrying only its own mass
// holds iff the material's SPECIFIC strength σ/ρ exceeds v² — the classic flywheel limit,
// independent of size. Carrying the habitat's areal load (soil+air+water, m″ kg/m²) adds a
// hoop tension N=m″·a·R that a shell of allowable σ needs thickness t=N/σ to take.
// This is rind's "steel tears, carbon holds" made into a slider. (cf. rind/README §"Why the
// shell is the hard part" + the frame solver that scores the real foam.)
// ───────────────────────────────────────────────────────────────────────────────────────

export const G0 = 9.81; // m/s²

// {name, rho kg/m³, sigma Pa allowable}. Allowables are conservative design values, not lab
// ultimates — the point is the ORDERING (specific strength), which is material-physics, not tuning.
export const MATERIALS = [
  { id: 'steel',    name: 'structural steel', rho: 7850, sigma: 350e6 },
  { id: 'titanium', name: 'Ti-6Al-4V alloy',  rho: 4500, sigma: 900e6 },
  { id: 'cfrp',     name: 'carbon fibre (CFRP)', rho: 1600, sigma: 1500e6 },
  { id: 'kevlar',   name: 'Kevlar-49 aramid', rho: 1440, sigma: 3000e6 },
  { id: 'zylon',    name: 'Zylon (PBO)',      rho: 1560, sigma: 5800e6 },
];

export function materialById(id) {
  return MATERIALS.find((m) => m.id === id) || MATERIALS[0];
}

// R metres, g in units of g0, mat a MATERIALS entry, arealLoad kg/m² (habitat mass per m² of floor).
export function shellStress({ R, g, mat, arealLoad = 0 }) {
  const a = g * G0;                 // floor acceleration, m/s²
  const omega = Math.sqrt(a / R);   // spin rate for that floor gravity
  const v = omega * R;              // rim speed, m/s
  const v2 = v * v;                 // = a·R, the self-support demand (m²/s²)
  const S = mat.sigma / mat.rho;    // specific strength (m²/s²)
  const selfUtil = v2 / S;          // ≥1 ⇒ the ring cannot even hold itself
  const N = arealLoad * a * R;      // hoop tension to retain the areal load, N/m
  const reqThk = N / mat.sigma;     // shell thickness that load needs, m
  return { a, omega, v, v2, S, selfUtil, holds: selfUtil < 1, N, reqThk };
}

// The SECANT CABLE WEB — rind's alternate load path (cf. rind/cylinder.html). Instead of a wall
// thick enough to take all the hoop tension, string a tension net of CHORDS (secants) across the
// bore: an {N/k} star polygon of N anchors each joined to the k-th. It carries a fraction φ of the
// pressure/payload load, leaving the hull only (1−φ) of it — but the self-spin term ρv² is the
// floor a cable can never remove (the hull still rotates). Geometry: half-subtended angle a=πk/N,
// efficiency η=sin a (the chord's radial pull), clear navigable core = R·cos a (a secant web leaves
// the core open; radial spokes to a hub do not), chord span = 2R·sin a.
export function shellSection({ R, g, mat, phi = 0, reach = 0.5, arealLoad = 2000,
                              N = 18, twall = 1.0, sf = 1.5, cable = materialById('kevlar') }) {
  const a = g * G0, v = Math.sqrt(a * R);
  const ATM = 101325;
  const pEff = ATM + arealLoad * a;                 // effective outward pressure at the rim, Pa
  const sigmaSelf = mat.rho * v * v;                // ρv² — the floor cables cannot touch
  const sigmaPressBare = pEff * R / twall;          // pressure hoop stress on a bare hull, Pa
  const allow = mat.sigma / sf;                     // hull allowable, Pa
  const k = Math.max(1, Math.min(Math.floor(N / 2), Math.round(reach * (N / 2)))); // {N/k}
  const ang = Math.PI * k / N;
  const eta = Math.sin(ang), coreClear = Math.cos(ang), span = 2 * R * Math.sin(ang);
  const sigmaShell = sigmaSelf + (1 - phi) * sigmaPressBare;
  const Fcable = phi > 0 ? (phi * pEff * 2 * R) / Math.max(0.05, eta) : 0; // cable force, N/axial-m
  const Acable = Fcable / (cable.sigma / sf);       // total cable cross-section, m²/axial-m
  const materialLimited = sigmaSelf > allow;        // ρv² alone over the line ⇒ a web can't save it
  return {
    v, a, sigmaSelf, sigmaPressBare, allow, pEff, N, k, ang, eta, coreClear, span,
    sigmaShell, Acable, margin: allow / sigmaShell, hullUtil: sigmaShell / allow,
    holds: !materialLimited && sigmaShell <= allow, materialLimited, phi,
  };
}

// ───────────────────────────────────────────────────────────────────────────────────────
// FIGURE 2 — THERMODYNAMICS (tide): the inverted radial column.
//
// The cylinder is symmetric along/around its axis, so the only gradient is radius. The
// centrifugal adiabat Δ(r)=ω²(R²−r²)/2cp sets the temperature offset (0 at the floor, max at
// the axis), and centrifugal hydrostatic balance dP/dr=ρω²r sets the pressure. Spun for 1 g
// at the outer skin (R_out = 1.25·R_floor, after tide/shared/geometry.mjs: 8 km floor, 10 km
// hull), an 8 km build spans ~31 K and ~32% — a colder, thinner axis. "Well mixed" means
// uniform potential temperature θ, not uniform T, which is why the warm core is STABLE and
// the weather huddles in a thin layer at the floor (fog, not rain). The full finite-volume
// column with Mie fog optics lives in tide/atmosphere/sim/column.mjs.
// ───────────────────────────────────────────────────────────────────────────────────────

const Rd = 287.05; // dry-air specific gas constant, J/kg/K  (== column.mjs)
const CP = 1005;   // dry-air specific heat,         J/kg/K  (== column.mjs)

// R metres (the habitat floor radius), Tfloor K (the well-mixed potential temperature),
// Prim Pa (floor pressure). Returns radius/temperature/pressure samples axis→floor + summary.
export function columnProfile({ R, Tfloor = 288, Prim = 101325, n = 220 } = {}) {
  const Rout = R * 1.25;                 // 1 g at the outer skin (geometry.mjs: 8 km → 10 km)
  const w2 = G0 / Rout;                  // ω² so that ω²·Rout = g0
  const r = new Array(n + 1);
  const T = new Array(n + 1);
  const P = new Array(n + 1);
  // temperature from the centrifugal adiabat: θ uniform = Tfloor, T(r)=θ−Δ(r), Δ(R)=0.
  for (let i = 0; i <= n; i++) {
    const ri = (R * i) / n;              // i=0 axis, i=n floor
    r[i] = ri;
    T[i] = Tfloor - (w2 * (R * R - ri * ri)) / (2 * CP);
  }
  // pressure: march hydrostatic balance inward from the floor. d lnP = ω²r/(Rd T) dr.
  P[n] = Prim;
  for (let i = n - 1; i >= 0; i--) {
    const Tv = 0.5 * (T[i] + T[i + 1]);
    P[i] = P[i + 1] * Math.exp(-(w2 * (r[i + 1] * r[i + 1] - r[i] * r[i])) / (2 * Rd * Tv));
  }
  return {
    r, T, P, Rout, omega: Math.sqrt(w2),
    Taxis: T[0], Tfloor: T[n],
    dT: T[n] - T[0],                     // floor minus axis (positive: axis is colder)
    Pdrop: 1 - P[0] / P[n],             // fractional pressure drop axis vs floor
    gFloor: w2 * R / G0,                // floor gravity in g
  };
}

// THE LAKE IS NOT A SECANT (tide/ratchet). In the rotating frame the potential is Φ=−½ω²r², so
// equipotentials are circles concentric with the axis and a liquid free surface is an ARC of
// constant radius — never a chord. A chord (the flat-world intuition) sits R·(1−cos φ) closer to
// the axis at mid-span: spurious "head" a real arc surface doesn't have (~300 m on a 4.4 km lake).
export function lakeSecantSag(R, chord_m) {
  const halfSpan = Math.asin(Math.min(1, chord_m / (2 * R)));
  return R * (1 - Math.cos(halfSpan)); // metres of secant-fallacy sag at mid-span
}

// THE FOUNTAIN JET (tide/fountain). A water parcel launched inward from the rim feels only the
// rotating frame's fictitious forces — centrifugal (+ω²r, outward) and Coriolis (−2Ω×v). Because
// 2ωv is comparable to gravity here, a point jet curves into a SHEET that lays irrigation across a
// broad arc. The ODE (launch at the rim low point (0,−R), +y points to the axis):
//   ax = ω²x + 2ω·vy ,  ay = ω²y − 2ω·vx     (ballistic; Coriolis does no work, so ½v²−½ω²r² holds)
export function fountainParcel({ R, omega, v0, alphaDeg = 0, coriolis = true, dt = 0.08, maxT = 1200 }) {
  const a = (alphaDeg * Math.PI) / 180, c = coriolis ? 1 : 0;
  let s = { x: 0, y: -R, vx: v0 * Math.sin(a), vy: v0 * Math.cos(a) };
  const E = (q) => 0.5 * (q.vx * q.vx + q.vy * q.vy) - 0.5 * omega * omega * (q.x * q.x + q.y * q.y);
  const E0 = E(s);
  const d = (q) => ({ x: q.vx, y: q.vy, vx: omega * omega * q.x + c * 2 * omega * q.vy, vy: omega * omega * q.y - c * 2 * omega * q.vx });
  const add = (q, k, h) => ({ x: q.x + k.x * h, y: q.y + k.y * h, vx: q.vx + k.vx * h, vy: q.vy + k.vy * h });
  const pts = [[s.x, s.y]];
  let minR = R;
  const steps = Math.round(maxT / dt);
  for (let i = 1; i <= steps; i++) {
    const k1 = d(s), k2 = d(add(s, k1, dt / 2)), k3 = d(add(s, k2, dt / 2)), k4 = d(add(s, k3, dt));
    s = { x: s.x + (dt / 6) * (k1.x + 2 * k2.x + 2 * k3.x + k4.x), y: s.y + (dt / 6) * (k1.y + 2 * k2.y + 2 * k3.y + k4.y),
          vx: s.vx + (dt / 6) * (k1.vx + 2 * k2.vx + 2 * k3.vx + k4.vx), vy: s.vy + (dt / 6) * (k1.vy + 2 * k2.vy + 2 * k3.vy + k4.vy) };
    const r = Math.hypot(s.x, s.y);
    minR = Math.min(minR, r);
    pts.push([s.x, s.y]);
    if (r >= R && i > 3) break; // landed back on the floor
  }
  const launchAng = -Math.PI / 2, landAng = Math.atan2(s.y, s.x);
  let drift = landAng - launchAng; while (drift > Math.PI) drift -= 2 * Math.PI; while (drift < -Math.PI) drift += 2 * Math.PI;
  return {
    pts, minR, axisReachFrac: 1 - minR / R, driftRad: drift, driftArc_m: drift * R,
    energyDrift: Math.abs(E(s) - E0) / Math.max(1, Math.abs(E0)),
  };
}

// THE RATCHET TOPOGRAPHY (tide/ratchet/sim/ratchet.mjs, ported faithfully). The terrain that
// makes lakes possible at all: a periodic sawtooth of `teeth` asymmetric teeth carved into the
// floor — going prograde from each lake, a short steep SCARP up to a crest, then a long gentle
// GLIDE down into the next basin. elevation e(θ)≥0 is built INWARD from the structural floor at
// r=R (ground radius = R−e). A lake is an equipotential ARC (constant r), filled by bisection;
// its shoreline leans up the glide (asymmetric), penned by the scarp. A jet that lands past the
// crest runs down the glide into the NEXT lake — the ratchet river; landing short runs home.
export function ratchetParams(R = 8000, omega = Math.sqrt(9.81 / 10000)) {
  return { R, omega, teeth: 3, crest: 250, basinFrac: 0.06, scarpFrac: 0.06, lakeArea_m2pm: 1.5e5, nTheta: 1440 };
}
export const toothAngle = (p) => (2 * Math.PI) / p.teeth;
export const crestTheta = (p) => (p.basinFrac / 2 + p.scarpFrac) * toothAngle(p);
export function elevation(p, theta) {
  const T = toothAngle(p);
  let u = (theta / T) % 1; if (u < 0) u += 1;             // position within the tooth, 0..1
  const b = p.basinFrac / 2, s = p.scarpFrac;
  if (u < b || u >= 1 - b) return 0;                      // basin floor (this lake / the next)
  if (u < b + s) return p.crest * ((u - b) / s);          // the scarp (steep, short)
  return p.crest * (1 - (u - b - s) / (1 - 2 * b - s));   // the glide (gentle, long)
}
export const groundRadius = (p, theta) => p.R - elevation(p, theta);

// Fill one lake (water cross-section `area`, m²/axial-m): solve the equipotential surface radius
// r_w by bisection on area(r_w)=∫½(r_g²−r_w²)dθ over θ where r_g>r_w. Returns surface, asymmetric
// shorelines, depth, and the secant-fallacy sag (the chord's spurious mid-span head).
export function fillLake(p, area = p.lakeArea_m2pm) {
  const T = toothAngle(p), n = Math.max(96, Math.round(p.nTheta / p.teeth)), dth = T / n;
  const thetas = Array.from({ length: n }, (_, i) => -T / 2 + (i + 0.5) * dth);
  const rg = thetas.map((th) => groundRadius(p, th));
  const areaAt = (rw) => { let A = 0; for (let i = 0; i < n; i++) if (rg[i] > rw) A += 0.5 * (rg[i] * rg[i] - rw * rw) * dth; return A; };
  let lo = p.R - p.crest - (2 * area) / (p.R * T) - 1, hi = p.R;
  const target = Math.min(area, areaAt(lo) * 0.999999);
  for (let it = 0; it < 64; it++) { const mid = 0.5 * (lo + hi); if (areaAt(mid) > target) lo = mid; else hi = mid; }
  const rw = 0.5 * (lo + hi), overflow = p.R - rw > p.crest;
  const mid = Math.floor(n / 2); let iRetro = 0, iPro = n - 1;
  for (let i = mid; i >= 0; i--) { if (rg[i] <= rw) { iRetro = i + 1; break; } }
  for (let i = mid; i < n; i++) { if (rg[i] <= rw) { iPro = i - 1; break; } }
  const shoreRetro = overflow ? -T / 2 : thetas[Math.max(0, iRetro)];
  const shorePro = overflow ? T / 2 : thetas[Math.min(n - 1, iPro)];
  const span = shorePro - shoreRetro, halfSpan = span / 2;
  return { rw, depthMax: p.R - rw, overflow, shoreRetro, shorePro, span, secantSag_m: rw * (1 - Math.cos(halfSpan)), meanDepth: target / Math.max(rw * span, 1e-9) };
}

// Which basin does water landing at azimuth θ (prograde from a lake centre) drain into? 0 = its
// own lake (it landed on the basin/scarp), 1 = the next lake prograde (it cleared the crest).
export function drainsTo(p, theta) {
  const T = toothAngle(p), k = Math.floor((theta + T / 2) / T), local = theta - k * T;
  return local <= crestTheta(p) ? k : k + 1;
}

// ───────────────────────────────────────────────────────────────────────────────────────
// FIGURE 3 — BIOLOGICAL WEBBING (biome): does the closed loop close?
//
// A compact, element-honest carbon loop in the spirit of biome/cycles/sim/cycles.mjs: a
// producer fixes CO₂ (Monod-limited in CO₂ and self-limited by standing biomass ∝ area), a
// pollinator forages it and GATES fruit set into the larder, a decomposer respires litter
// back to CO₂, and the crew eats the larder and breathes. Every flux is a paired carbon
// transfer, so total carbon is conserved by construction no matter the tuning — the
// discipline the full model keeps to ~1e-9. It reproduces biome's headline behaviours:
//   • the loop CLOSES (CO₂ holds, larder steadies),
//   • pollinators gate the harvest (crash the bees → fruit set falls → food drops),
//   • the decomposer regenerates CO₂ (throttle it → litter piles, CO₂ crashes: Biosphere-2),
//   • area is the lever for calories.
// The real engine (allometry from body mass, real-organism roster, the eigenvalue stability
// lab) lives at biome.mino.mobi/cycles/.
// ───────────────────────────────────────────────────────────────────────────────────────

export function foodWebDefaults() {
  return {
    area: 1.0,          // ecosystem area multiplier (the calorie lever)
    decomp: 0.06,       // decomposer activity: litter → CO₂ rate /day  (the Biosphere-2 knob)
    pollReliance: 0.6,  // fraction of fruit set gated by pollinators
    predator: 0.0,      // extra pollinator mortality (trophic cascade) /day
    crew: 1.0,          // crew size multiplier (larder demand)
    days: 800,
  };
}

// units are "ppm-equivalent carbon" so Cair reads directly as a CO₂ proxy; conservation is exact.
function foodWebState() {
  return { Cair: 750, Cplant: 400, Cpoll: 20, Clitter: 200, Cfood: 100 };
}

function foodWebDeriv(y, p) {
  const { Cair, Cplant, Cpoll, Clitter, Cfood } = y;
  const Kco2 = 300, Kplant = 300, Kpoll = 15, Kfood = 80;
  const muP = 0.6, rp = 0.08, tau = 0.02;        // producer: growth, respiration, turnover
  const gIng = 0.06, assim = 0.4, mort = 0.015;  // pollinator: light nectar foraging + slow turnover
  const capP = 600 * p.area;                     // producer carrying capacity ∝ area
  const demand = 12 * p.crew;                    // crew larder demand, ppm-C/day

  const light = 1;
  const ps = muP * Cplant * light * (Cair / (Kco2 + Cair)) * Math.max(0, 1 - Cplant / capP);
  const presp = rp * Cplant;
  const turnover = tau * Cplant;
  // fruit set: a floor of wind/self set, the rest gated by the pollinator population.
  const fruitFrac = (1 - p.pollReliance) * 0.5 + p.pollReliance * (Cpoll / (Kpoll + Cpoll));
  const toFood = turnover * fruitFrac;
  const toLitter = turnover * (1 - fruitFrac);
  const ingest = gIng * Cpoll * (Cplant / (Kplant + Cplant));
  const pollMort = (mort + p.predator) * Cpoll;
  const decomp = p.decomp * Clitter;
  const eat = demand * (Cfood / (Kfood + Cfood));

  return {
    Cair: -ps + presp + (1 - assim) * ingest + decomp + eat,
    Cplant: ps - presp - turnover - ingest,
    Cpoll: assim * ingest - pollMort,
    Clitter: toLitter + pollMort - decomp,
    Cfood: toFood - eat,
    _fruitFrac: fruitFrac,
  };
}

// RK4-integrate the loop; returns downsampled trajectories + a plain-language verdict.
export function foodWebRun(params) {
  const p = { ...foodWebDefaults(), ...params };
  let y = foodWebState();
  const total0 = y.Cair + y.Cplant + y.Cpoll + y.Clitter + y.Cfood;
  const dt = 0.25, steps = Math.round(p.days / dt), keep = 400;
  const every = Math.max(1, Math.floor(steps / keep));
  const out = { t: [], co2: [], food: [], poll: [], plant: [], litter: [], fruit: [] };

  const add = (s, t, fruit) => {
    out.t.push(t); out.co2.push(s.Cair); out.food.push(s.Cfood);
    out.poll.push(s.Cpoll); out.plant.push(s.Cplant); out.litter.push(s.Clitter); out.fruit.push(fruit);
  };
  const vec = (s) => [s.Cair, s.Cplant, s.Cpoll, s.Clitter, s.Cfood];
  const obj = (a) => ({ Cair: a[0], Cplant: a[1], Cpoll: a[2], Clitter: a[3], Cfood: a[4] });
  const addv = (a, b, h) => a.map((x, i) => x + h * b[i]);

  add(y, 0, foodWebDeriv(y, p)._fruitFrac);
  for (let i = 1; i <= steps; i++) {
    const ya = vec(y);
    const k1 = vec(foodWebDeriv(obj(ya), p));
    const k2 = vec(foodWebDeriv(obj(addv(ya, k1, dt / 2)), p));
    const k3 = vec(foodWebDeriv(obj(addv(ya, k2, dt / 2)), p));
    const k4 = vec(foodWebDeriv(obj(addv(ya, k3, dt)), p));
    const yn = ya.map((x, j) => x + (dt / 6) * (k1[j] + 2 * k2[j] + 2 * k3[j] + k4[j]));
    // clamp tiny negatives from stiffness (does not affect conservation materially)
    y = obj(yn.map((x) => (x < 0 && x > -1e-6 ? 0 : x)));
    if (i % every === 0 || i === steps) add(y, i * dt, foodWebDeriv(y, p)._fruitFrac);
  }

  const total1 = y.Cair + y.Cplant + y.Cpoll + y.Clitter + y.Cfood;
  const tail = (arr) => arr.slice(Math.floor(arr.length * 0.8));
  const mean = (arr) => arr.reduce((s, x) => s + x, 0) / arr.length;
  const co2End = mean(tail(out.co2));
  const foodEnd = mean(tail(out.food));
  const fruitEnd = mean(tail(out.fruit));

  let verdict, status;
  if (co2End < 250) { verdict = 'CO₂ collapse — the soil stopped breathing (the Biosphere-2 failure)'; status = 'fail'; }
  else if (foodEnd < 8) { verdict = 'larder collapse — not enough ecosystem to feed the crew'; status = 'fail'; }
  else { verdict = 'the loop closes — CO₂ holds, the larder steadies'; status = 'ok'; }

  return {
    ...out, verdict, status, co2End, foodEnd, fruitEnd,
    conserved: Math.abs(total1 - total0) / total0, // ~machine precision
  };
}

// ═══════════════════════════════════════════════════════════════════════════════════════
// DOM wiring — guarded so the kernels above stay node-importable for the self-test.
// ═══════════════════════════════════════════════════════════════════════════════════════
if (typeof document !== 'undefined') initFigures();

function initFigures() {
  const $ = (id) => document.getElementById(id);
  const PHOS = '#7fd8d0', WARM = '#e08a5b', GREEN = '#62b87a', SKY = '#a7c4d4', DIM = 'rgba(190,205,210,.55)';
  const TAU = Math.PI * 2;
  const lerp = (a, b, t) => a + (b - a) * t;
  const mix = (c1, c2, t) => { // blend two #rrggbb colours
    const h = (c) => [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)];
    const A = h(c1), B = h(c2);
    return `rgb(${Math.round(lerp(A[0], B[0], t))},${Math.round(lerp(A[1], B[1], t))},${Math.round(lerp(A[2], B[2], t))})`;
  };

  function dpiFit(cv) {
    const d = Math.min(devicePixelRatio || 1, 2);
    const w = cv.clientWidth || cv.parentElement.clientWidth, h = cv.clientHeight || 200;
    cv.width = w * d; cv.height = h * d;
    const ctx = cv.getContext('2d'); ctx.setTransform(d, 0, 0, d, 0, 0);
    return { ctx, w, h };
  }

  // ── Figure 1: structure — circular hull section + the secant cable web ────────────────
  const f1 = { R: $('f1-R'), g: $('f1-g'), mat: $('f1-mat'), phi: $('f1-phi'), reach: $('f1-reach'), cv: $('f1-canvas') };
  if (f1.cv) {
    MATERIALS.forEach((m) => { const o = document.createElement('option'); o.value = m.id; o.textContent = m.name; f1.mat.appendChild(o); });
    f1.mat.value = 'cfrp';
    const drawF1 = () => {
      const R = +f1.R.value, g = +f1.g.value, phi = +f1.phi.value, reach = +f1.reach.value, mat = materialById(f1.mat.value);
      const set = (id, t) => { const e = $(id); if (e) e.textContent = t; };
      set('f1-R-v', (R / 1000).toFixed(1) + ' km'); set('f1-g-v', g.toFixed(2) + ' g'); set('f1-phi-v', Math.round(phi * 100) + ' %');
      const s = shellSection({ R, g, mat, phi, reach });
      set('f1-reach-v', '{' + s.N + '/' + s.k + '}');
      set('f1-v', Math.round(s.v).toLocaleString() + ' m/s');
      set('f1-self', (s.sigmaSelf / 1e6).toFixed(0) + ' / ' + (s.allow / 1e6).toFixed(0) + ' MPa');
      set('f1-margin', s.materialLimited ? '— ρv² over' : '×' + s.margin.toFixed(2));
      set('f1-core', phi > 0 ? Math.round(s.coreClear * 100) + ' %' : '—');
      const { ctx, w, h } = dpiFit(f1.cv); ctx.clearRect(0, 0, w, h);
      const cx = w / 2, cy = h / 2, Rpx = Math.min(w, h) / 2 - 28;
      // faint outward "gravity points to the rim" ticks
      ctx.strokeStyle = 'rgba(190,205,210,.08)'; ctx.lineWidth = 1;
      for (let i = 0; i < 24; i++) { const a = (i / 24) * TAU; ctx.beginPath(); ctx.moveTo(cx + Math.cos(a) * Rpx * 0.84, cy + Math.sin(a) * Rpx * 0.84); ctx.lineTo(cx + Math.cos(a) * Rpx, cy + Math.sin(a) * Rpx); ctx.stroke(); }
      // the secant web {N/k} — chords across the bore
      if (phi > 0) {
        const N = s.N, k = s.k, P = [];
        for (let i = 0; i < N; i++) { const a = -Math.PI / 2 + (i / N) * TAU; P.push([cx + Math.cos(a) * Rpx, cy + Math.sin(a) * Rpx]); }
        ctx.strokeStyle = 'rgba(127,216,208,' + (0.18 + 0.5 * phi).toFixed(2) + ')'; ctx.lineWidth = 1.2;
        for (let i = 0; i < N; i++) { const j = (i + k) % N; ctx.beginPath(); ctx.moveTo(P[i][0], P[i][1]); ctx.lineTo(P[j][0], P[j][1]); ctx.stroke(); }
        if (s.coreClear > 0.02) { ctx.setLineDash([4, 4]); ctx.strokeStyle = 'rgba(127,216,208,.5)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(cx, cy, Rpx * s.coreClear, 0, TAU); ctx.stroke(); ctx.setLineDash([]); }
      }
      // the hull ring, tinted by the verdict
      const ringCol = s.materialLimited ? '#e2596a' : (s.holds ? GREEN : WARM);
      ctx.strokeStyle = ringCol; ctx.lineWidth = 5; ctx.beginPath(); ctx.arc(cx, cy, Rpx, 0, TAU); ctx.stroke();
      ctx.fillStyle = 'rgba(190,205,210,.5)'; ctx.beginPath(); ctx.arc(cx, cy, 2, 0, TAU); ctx.fill(); // axis
      ctx.font = '11px JetBrains Mono, monospace'; ctx.textAlign = 'center';
      ctx.fillStyle = DIM; ctx.fillText('hull · ' + mat.name, cx, cy - Rpx - 11);
      if (phi > 0) { ctx.fillStyle = 'rgba(127,216,208,.85)'; ctx.fillText('secant web {' + s.N + '/' + s.k + '}', cx, cy + Rpx + 18); }
      if (phi > 0 && s.coreClear > 0.08) { ctx.fillStyle = 'rgba(127,216,208,.6)'; ctx.fillText('clear core', cx, cy - 6); }
      ctx.textAlign = 'start';
      const vp = $('f1-verdict');
      if (vp) {
        let msg;
        if (s.materialLimited) msg = 'material-limited — ρv² alone exceeds allowable; no web can save it';
        else if (s.holds) msg = 'holds — the secant web takes ' + Math.round(phi * 100) + '% of the load · hull ×' + s.margin.toFixed(2);
        else msg = 'tears — thicken the wall or raise the web load-share φ';
        vp.textContent = msg; vp.className = 'verdict ' + (s.holds ? 'ok' : 'fail');
      }
    };
    [f1.R, f1.g, f1.phi, f1.reach].forEach((el) => el.addEventListener('input', drawF1));
    f1.mat.addEventListener('change', drawF1);
    addEventListener('resize', drawF1); drawF1();
  }

  // ── Figure 2: thermodynamics — circular axis section: rings + the lake (topology) + jets ──
  const f2 = { R: $('f2-R'), Tf: $('f2-T'), v0: $('f2-v0'), cori: $('f2-cori'), cv: $('f2-canvas') };
  if (f2.cv) {
    const drawF2 = () => {
      const R = +f2.R.value, Tfloor = +f2.Tf.value + 273.15, v0 = +f2.v0.value, cori = f2.cori.checked;
      const set = (id, t) => { const e = $(id); if (e) e.textContent = t; };
      set('f2-R-v', (R / 1000).toFixed(1) + ' km'); set('f2-T-v', (+f2.Tf.value).toFixed(0) + ' °C'); set('f2-v0-v', v0 + ' m/s');
      const p = columnProfile({ R, Tfloor });
      set('f2-span', p.dT.toFixed(1) + ' K'); set('f2-drop', (p.Pdrop * 100).toFixed(0) + ' %');
      set('f2-axis', (p.Taxis - 273.15).toFixed(1) + ' °C'); set('f2-gfloor', p.gFloor.toFixed(2) + ' g');
      // the real ratchet terrain + a filled lake; the jet couples to it (the ratchet river)
      const rp = ratchetParams(R, p.omega), lake = fillLake(rp), T = toothAngle(rp), cTheta = crestTheta(rp);
      const jet = fountainParcel({ R, omega: p.omega, v0, alphaDeg: 0, coriolis: cori });
      const drain = drainsTo(rp, jet.driftRad); // 0 = home, ≥1 = next lake (ratchets forward)
      set('f2-reach', Math.round(jet.axisReachFrac * 100) + ' %');
      set('f2-sag', drain >= 1 ? 'next lake ⟳' : 'home');
      const { ctx, w, h } = dpiFit(f2.cv); ctx.clearRect(0, 0, w, h);
      const cx = w / 2, cy = h / 2, Rpx = Math.min(w, h) / 2 - 24;
      const n = p.r.length, Tc = p.T.map((t) => t - 273.15);
      let tmin = Math.min(...Tc), tmax = Math.max(...Tc); const dt = Math.max(1e-6, tmax - tmin);
      // temperature rings: paint discs from rim inward (cold axis blue → warm floor amber)
      const RINGS = 44;
      for (let j = RINGS; j >= 1; j--) {
        const rr = j / RINGS, idx = Math.min(n - 1, Math.round(rr * (n - 1)));
        ctx.fillStyle = mix('#274a63', '#d98a52', (Tc[idx] - tmin) / dt);
        ctx.beginPath(); ctx.arc(cx, cy, Rpx * rr, 0, TAU); ctx.fill();
      }
      // the axial sun, seen end-on
      const sun = ctx.createRadialGradient(cx, cy, 0, cx, cy, Rpx * 0.13);
      sun.addColorStop(0, 'rgba(244,191,98,.95)'); sun.addColorStop(1, 'rgba(244,191,98,0)');
      ctx.fillStyle = sun; ctx.beginPath(); ctx.arc(cx, cy, Rpx * 0.13, 0, TAU); ctx.fill();
      // ── geometry: terrain relief is exaggerated radially (crest ≈ 18% of Rpx) so 250 m on an
      //    8 km radius is visible; jets stay true-scale. θ=0 lake centre at the top, +θ prograde. ──
      const EXAG = (0.18 * R) / rp.crest;
      const rDraw = (rM) => Rpx * (1 - EXAG * (1 - rM / R));         // r=R → rim; r=R−e → inward
      const ang = (theta) => -Math.PI / 2 + theta;                   // top = lake centre, +θ prograde (= jet drift)
      const ptR = (rM, theta) => [cx + Math.cos(ang(theta)) * rDraw(rM), cy + Math.sin(ang(theta)) * rDraw(rM)];
      const MX = (x) => cx + (x / R) * Rpx, MY = (y) => cy + (y / R) * Rpx; // jet (kernel coords, true-scale)
      // solid terrain shell: between the ground profile (inner) and the structural rim r=R (outer)
      const STEP = TAU / 360;
      ctx.beginPath();
      for (let a = 0; a <= TAU + 1e-9; a += STEP) { const q = ptR(groundRadius(rp, a), a); a ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]); }
      for (let a = TAU; a >= -1e-9; a -= STEP) { const q = ptR(R, a); ctx.lineTo(q[0], q[1]); }
      ctx.closePath(); ctx.fillStyle = 'rgba(120,96,72,.82)'; ctx.fill();
      ctx.beginPath();
      for (let a = 0; a <= TAU + 1e-9; a += STEP) { const q = ptR(groundRadius(rp, a), a); a ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]); }
      ctx.strokeStyle = '#caa06a'; ctx.lineWidth = 1.4; ctx.stroke();
      // lakes: one per tooth, the equipotential arc filled over its (asymmetric) shoreline span
      for (let t = 0; t < rp.teeth; t++) {
        const c = t * T, a0 = c + lake.shoreRetro, a1 = c + lake.shorePro;
        ctx.beginPath();
        for (let a = a0; a <= a1; a += STEP) { const q = ptR(lake.rw, a); a === a0 ? ctx.moveTo(q[0], q[1]) : ctx.lineTo(q[0], q[1]); }
        for (let a = a1; a >= a0; a -= STEP) { const q = ptR(groundRadius(rp, a), a); ctx.lineTo(q[0], q[1]); }
        ctx.closePath(); ctx.fillStyle = 'rgba(86,150,196,.72)'; ctx.fill();
        ctx.beginPath(); const s0 = ptR(lake.rw, a0); ctx.moveTo(s0[0], s0[1]);
        for (let a = a0; a <= a1; a += STEP) { const q = ptR(lake.rw, a); ctx.lineTo(q[0], q[1]); }
        ctx.strokeStyle = '#bfe0f2'; ctx.lineWidth = 1.6; ctx.stroke();
      }
      // the secant fallacy, drawn once: the dashed chord between one lake's shorelines
      const sP = ptR(lake.rw, lake.shorePro), sR = ptR(lake.rw, lake.shoreRetro);
      ctx.setLineDash([4, 3]); ctx.strokeStyle = 'rgba(226,89,106,.9)'; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(sR[0], sR[1]); ctx.lineTo(sP[0], sP[1]); ctx.stroke(); ctx.setLineDash([]);
      // the fountain: a fan (the Coriolis sheet) from the top lake; faint radial reference when on
      const drawJet = (path, style, wdt) => { ctx.strokeStyle = style; ctx.lineWidth = wdt; ctx.beginPath(); for (let i = 0; i < path.length; i++) { const X = MX(path[i][0]), Y = MY(path[i][1]); i ? ctx.lineTo(X, Y) : ctx.moveTo(X, Y); } ctx.stroke(); };
      if (cori) { const ref = fountainParcel({ R, omega: p.omega, v0, alphaDeg: 0, coriolis: false }); ctx.setLineDash([3, 3]); drawJet(ref.pts, 'rgba(190,205,210,.35)', 1); ctx.setLineDash([]); }
      for (const al of [-7, 0, 7]) { const jj = fountainParcel({ R, omega: p.omega, v0, alphaDeg: al, coriolis: cori }); drawJet(jj.pts, al === 0 ? '#9fe6ff' : 'rgba(159,230,255,.5)', al === 0 ? 2 : 1.2); }
      ctx.fillStyle = '#9fe6ff'; ctx.beginPath(); ctx.arc(MX(0), MY(-R), 3, 0, TAU); ctx.fill(); // launch
      const land = ptR(R, jet.driftRad); ctx.fillStyle = drain >= 1 ? '#9fe6ff' : '#e0a85b'; // landing, coloured by where it drains
      ctx.beginPath(); ctx.arc(land[0], land[1], 3.2, 0, TAU); ctx.fill();
      // labels
      ctx.font = '11px JetBrains Mono, monospace'; ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(244,191,98,.9)'; ctx.fillText('axial sun', cx, cy + 3);
      ctx.fillStyle = '#9fe6ff'; ctx.fillText('fountain jet' + (cori ? ' — Coriolis sheet → ' + (drain >= 1 ? 'next lake' : 'home') : ' — radial'), cx, cy - Rpx - 11);
      ctx.fillStyle = '#caa06a'; ctx.fillText('ratchet floor · ' + rp.teeth + ' teeth (scarp ↑ glide ↘)', cx, cy + Rpx + 17);
      ctx.fillStyle = 'rgba(226,89,106,.9)'; ctx.fillText('lake = arc, not the dashed secant · sag ' + Math.round(lake.secantSag_m) + ' m', cx, cy + Rpx * 0.62);
      ctx.textAlign = 'start';
    };
    [f2.R, f2.Tf, f2.v0].forEach((el) => el.addEventListener('input', drawF2));
    f2.cori.addEventListener('change', drawF2);
    addEventListener('resize', drawF2); drawF2();
  }

  // ── Figure 3: biological webbing ─────────────────────────────────────────────────────
  const f3 = { area: $('f3-area'), decomp: $('f3-decomp'), poll: $('f3-poll'), pred: $('f3-pred'), cv: $('f3-canvas') };
  if (f3.cv) {
    const drawF3 = () => {
      const params = {
        area: +f3.area.value, decomp: +f3.decomp.value,
        pollReliance: +f3.poll.value, predator: +f3.pred.value,
      };
      $('f3-area-v').textContent = params.area.toFixed(1) + '×';
      $('f3-decomp-v').textContent = params.decomp.toFixed(3) + '/d';
      $('f3-poll-v').textContent = (params.pollReliance * 100).toFixed(0) + '%';
      $('f3-pred-v').textContent = params.predator.toFixed(2) + '/d';
      const run = foodWebRun(params);
      const set = (id, t) => { const e = $(id); if (e) e.textContent = t; };
      set('f3-co2', Math.round(run.co2End) + ' ppm-C');
      set('f3-food', Math.round(run.foodEnd) + '');
      set('f3-fruit', Math.round(run.fruitEnd * 100) + ' %');
      const vp = $('f3-verdict'); if (vp) { vp.textContent = run.verdict; vp.className = 'verdict ' + (run.status === 'ok' ? 'ok' : 'fail'); }
      const { ctx, w, h } = dpiFit(f3.cv);
      ctx.clearRect(0, 0, w, h);
      const L = 40, Rp = 40, top = 16, bot = h - 24, plotW = w - L - Rp, plotH = bot - top;
      const N = run.t.length, tmax = run.t[N - 1];
      const X = (t) => L + (t / tmax) * plotW;
      const series = (arr, color, max, dash) => {
        const mx = max || Math.max(...arr) * 1.1 || 1;
        ctx.strokeStyle = color; ctx.lineWidth = 1.8; if (dash) ctx.setLineDash(dash); ctx.beginPath();
        for (let i = 0; i < N; i++) { const x = X(run.t[i]), y = bot - (arr[i] / mx) * plotH; i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
        ctx.stroke(); ctx.setLineDash([]);
      };
      // grid
      ctx.strokeStyle = 'rgba(190,205,210,.10)'; ctx.lineWidth = 1;
      for (let k = 0; k <= 4; k++) { const y = top + (k / 4) * plotH; ctx.beginPath(); ctx.moveTo(L, y); ctx.lineTo(L + plotW, y); ctx.stroke(); }
      series(run.co2, PHOS, 1600);      // CO₂ on a fixed 0..1600 ppm-C scale
      series(run.food, GREEN, null);    // larder, autoscaled
      series(run.litter, WARM, null, [4, 3]); // litter, dashed
      ctx.font = '11px JetBrains Mono, monospace';
      ctx.fillStyle = PHOS; ctx.fillText('CO₂', L + 4, top + 12);
      ctx.fillStyle = GREEN; ctx.fillText('larder', L + 44, top + 12);
      ctx.fillStyle = WARM; ctx.fillText('litter', L + 104, top + 12);
      ctx.fillStyle = DIM; ctx.fillText('0', L - 8, bot + 14); ctx.fillText(Math.round(tmax) + ' d', L + plotW - 24, bot + 14);
    };
    [f3.area, f3.decomp, f3.poll, f3.pred].forEach((el) => el.addEventListener('input', drawF3));
    addEventListener('resize', drawF3); drawF3();
  }
}

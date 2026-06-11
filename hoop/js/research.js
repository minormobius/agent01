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

  function dpiFit(cv) {
    const d = Math.min(devicePixelRatio || 1, 2);
    const w = cv.clientWidth || cv.parentElement.clientWidth, h = cv.clientHeight || 200;
    cv.width = w * d; cv.height = h * d;
    const ctx = cv.getContext('2d'); ctx.setTransform(d, 0, 0, d, 0, 0);
    return { ctx, w, h };
  }

  // ── Figure 1: structure ──────────────────────────────────────────────────────────────
  const f1 = { R: $('f1-R'), g: $('f1-g'), mat: $('f1-mat'), load: $('f1-load'), cv: $('f1-canvas') };
  if (f1.cv) {
    MATERIALS.forEach((m) => { const o = document.createElement('option'); o.value = m.id; o.textContent = m.name; f1.mat.appendChild(o); });
    f1.mat.value = 'steel';
    const drawF1 = () => {
      const R = +f1.R.value, g = +f1.g.value, load = +f1.load.value, mat = materialById(f1.mat.value);
      $('f1-R-v').textContent = (R / 1000).toFixed(1) + ' km';
      $('f1-g-v').textContent = g.toFixed(2) + ' g';
      $('f1-load-v').textContent = load.toLocaleString() + ' kg/m²';
      const s = shellStress({ R, g, mat, arealLoad: load });
      // readouts
      const set = (id, t) => { const e = $(id); if (e) e.textContent = t; };
      set('f1-omega', s.omega.toFixed(4) + ' rad/s');
      set('f1-v', Math.round(s.v).toLocaleString() + ' m/s');
      set('f1-spec', (s.S / 1e3).toFixed(1) + ' kJ/kg');
      set('f1-thk', s.reqThk < 0.01 ? (s.reqThk * 1000).toFixed(1) + ' mm' : s.reqThk.toFixed(2) + ' m');
      // the bar: self-support utilisation v²/S on a fixed 0..2 scale, failure line at ×1.0 (midpoint).
      const { ctx, w, h } = dpiFit(f1.cv);
      ctx.clearRect(0, 0, w, h);
      const pad = 14, barY = h - 42, barH = 26, barW = w - pad * 2;
      const SCALE = 2, util = s.selfUtil, frac = Math.min(1, util / SCALE);
      const col = s.holds ? GREEN : WARM, failX = pad + barW * (1 / SCALE);
      ctx.fillStyle = DIM; ctx.font = '11px JetBrains Mono, monospace';
      ctx.fillText('self-support utilisation  v² / (σ/ρ)', pad, barY - 12);
      ctx.fillStyle = 'rgba(127,216,208,.08)'; ctx.fillRect(pad, barY, barW, barH);     // track
      ctx.fillStyle = col; ctx.fillRect(pad, barY, barW * frac, barH);                  // fill
      ctx.strokeStyle = '#e2596a'; ctx.lineWidth = 2; ctx.setLineDash([4, 3]);          // ×1.0 line
      ctx.beginPath(); ctx.moveTo(failX, barY - 6); ctx.lineTo(failX, barY + barH + 6); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = '#e2596a'; ctx.fillText('×1.0 tears →', failX + 5, barY - 12);
      ctx.fillStyle = col; ctx.font = '600 13px JetBrains Mono, monospace';
      ctx.fillText((s.holds ? 'HOLDS' : 'TEARS') + '  ×' + util.toFixed(2) + ' of limit', pad, barY + barH + 26);
      // verdict pill text
      const vp = $('f1-verdict'); if (vp) { vp.textContent = s.holds ? 'shell holds its own spin' : 'shell tears under its own spin'; vp.className = 'verdict ' + (s.holds ? 'ok' : 'fail'); }
    };
    [f1.R, f1.g, f1.load].forEach((el) => el.addEventListener('input', drawF1));
    f1.mat.addEventListener('change', drawF1);
    addEventListener('resize', drawF1); drawF1();
  }

  // ── Figure 2: thermodynamics ─────────────────────────────────────────────────────────
  const f2 = { R: $('f2-R'), Tf: $('f2-T'), cv: $('f2-canvas') };
  if (f2.cv) {
    const drawF2 = () => {
      const R = +f2.R.value, Tfloor = +f2.Tf.value + 273.15;
      $('f2-R-v').textContent = (R / 1000).toFixed(1) + ' km';
      $('f2-T-v').textContent = (+f2.Tf.value).toFixed(0) + ' °C';
      const p = columnProfile({ R, Tfloor });
      const set = (id, t) => { const e = $(id); if (e) e.textContent = t; };
      set('f2-span', p.dT.toFixed(1) + ' K');
      set('f2-drop', (p.Pdrop * 100).toFixed(0) + ' %');
      set('f2-axis', (p.Taxis - 273.15).toFixed(1) + ' °C');
      set('f2-gfloor', p.gFloor.toFixed(2) + ' g');
      const { ctx, w, h } = dpiFit(f2.cv);
      ctx.clearRect(0, 0, w, h);
      const L = 44, Rp = 44, top = 18, bot = h - 26, plotW = w - L - Rp, plotH = bot - top;
      const n = p.r.length;
      const X = (i) => L + (i / (n - 1)) * plotW; // axis(left) → floor(right)
      // temperature curve (°C), own scale
      const Tc = p.T.map((t) => t - 273.15);
      let tmin = Math.min(...Tc), tmax = Math.max(...Tc); const tpad = (tmax - tmin) * 0.12 + 0.5; tmin -= tpad; tmax += tpad;
      const Yt = (v) => bot - ((v - tmin) / (tmax - tmin)) * plotH;
      // pressure curve (% of floor), own scale 0..100 mapped to plot
      const Pp = p.P.map((v) => (v / p.P[n - 1]) * 100);
      const Yp = (v) => bot - (v / 100) * plotH;
      // grid
      ctx.strokeStyle = 'rgba(190,205,210,.10)'; ctx.lineWidth = 1;
      for (let k = 0; k <= 4; k++) { const y = top + (k / 4) * plotH; ctx.beginPath(); ctx.moveTo(L, y); ctx.lineTo(L + plotW, y); ctx.stroke(); }
      // stratus / dew band near the floor (right ~18%)
      ctx.fillStyle = 'rgba(167,196,212,.10)'; ctx.fillRect(L + plotW * 0.82, top, plotW * 0.18, plotH);
      // pressure (sky, dashed)
      ctx.strokeStyle = SKY; ctx.lineWidth = 1.5; ctx.setLineDash([5, 3]); ctx.beginPath();
      for (let i = 0; i < n; i++) { const x = X(i), y = Yp(Pp[i]); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); } ctx.stroke(); ctx.setLineDash([]);
      // temperature (warm, solid)
      ctx.strokeStyle = WARM; ctx.lineWidth = 2.2; ctx.beginPath();
      for (let i = 0; i < n; i++) { const x = X(i), y = Yt(Tc[i]); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); } ctx.stroke();
      // labels
      ctx.font = '11px JetBrains Mono, monospace'; ctx.fillStyle = DIM;
      ctx.fillText('axis', L - 4, bot + 16); ctx.fillText('floor', L + plotW - 28, bot + 16);
      ctx.fillStyle = WARM; ctx.fillText('T  ' + Tc[0].toFixed(0) + '°→' + Tc[n - 1].toFixed(0) + '°C', L + 4, top + 12);
      ctx.fillStyle = SKY; ctx.fillText('P  ' + (Pp[0]).toFixed(0) + '%→100%', L + 4, top + 26);
      ctx.fillStyle = 'rgba(167,196,212,.8)'; ctx.fillText('stratus/dew', L + plotW * 0.82 + 2, bot - 4);
    };
    [f2.R, f2.Tf].forEach((el) => el.addEventListener('input', drawF2));
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

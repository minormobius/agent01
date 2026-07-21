// kite-vlm.js — a vortex-lattice method over a bowed Revolution-kite sail.
//
// This is a faithful JS port of the Rust `kite-solver` crate (tjs/kite/solver/): same
// geometry, same horseshoe influence matrix, same Gaussian solve, same near-field
// Kutta–Joukowski forces, same row-major [chord][span] panel order. It serves two
// jobs: (1) build the panel geometry the page renders and hit-tests against, and
// (2) be the FALLBACK solver so the bench works before/without the wasm accelerator.
// When the wasm loads it takes over the number-crunching; because both implement the
// identical method they agree to floating-point noise.
//
// Pure/DOM-free and attached to globalThis, so it unit-tests in plain node
// (kite-vlm.selftest.mjs).

const PI = Math.PI;

// ── tiny vec3 (plain arrays) ─────────────────────────────────────────────────────
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const scale = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const norm = (a) => Math.sqrt(dot(a, a));
const unit = (a) => {
  const n = norm(a);
  return n < 1e-12 ? [0, 0, 0] : scale(a, 1 / n);
};
const lerp = (a, b, t) => add(a, scale(sub(b, a), t));

// ── defaults ─────────────────────────────────────────────────────────────────────
export function revDefault() {
  return {
    span: 2.34,
    chord: 0.61,
    bow: 0.35,
    aoa: 0.18, // radians (~10°)
    wind: 8.0,
    rho: 1.225,
    nspan: 28,
    nchord: 6,
    cut: [], // row-major [chord][span] booleans
  };
}

function isCut(cfg, ic, js) {
  if (!cfg.cut || cfg.cut.length === 0) return false;
  return !!cfg.cut[ic * cfg.nspan + js];
}

// ── geometry ─────────────────────────────────────────────────────────────────────
// Wind blows +X. Chord lies streamwise, pitched up by the angle of attack; the span
// arcs through the Y–Z frontal plane as a shallow bow (tips lift in +Z).
export function buildPanels(cfg) {
  const ns = Math.max(1, cfg.nspan | 0);
  const nc = Math.max(1, cfg.nchord | 0);
  const bigtheta = Math.min(Math.max(cfg.bow, 0), 1) * PI * 0.9;
  const flat = bigtheta < 1e-6;
  const radius = flat ? 0 : cfg.span / bigtheta;

  const station = (s) => {
    if (flat) return [[0, (s - 0.5) * cfg.span, 0], [0, 1, 0]];
    const th = (s - 0.5) * bigtheta;
    const base = [0, radius * Math.sin(th), radius * (1 - Math.cos(th))];
    const tang = unit([0, Math.cos(th), Math.sin(th)]);
    return [base, tang];
  };

  const chordDir = (tang) => {
    const v = [1, 0, 0];
    const k = unit(tang);
    const beta = cfg.aoa;
    const ca = Math.cos(beta), sa = Math.sin(beta);
    // Rodrigues: v cosβ + (k×v) sinβ + k (k·v)(1−cosβ)
    return unit(
      add(add(scale(v, ca), scale(cross(k, v), sa)), scale(k, dot(k, v) * (1 - ca)))
    );
  };

  const gidx = (ic, js) => ic * (ns + 1) + js;
  const grid = new Array((nc + 1) * (ns + 1));
  for (let js = 0; js <= ns; js++) {
    const [base, tang] = station(js / ns);
    const cdir = chordDir(tang);
    for (let ic = 0; ic <= nc; ic++) {
      grid[gidx(ic, js)] = add(base, scale(cdir, (ic / nc) * cfg.chord));
    }
  }

  const panels = [];
  for (let ic = 0; ic < nc; ic++) {
    for (let js = 0; js < ns; js++) {
      const pll = grid[gidx(ic, js)];
      const plr = grid[gidx(ic, js + 1)];
      const ptr = grid[gidx(ic + 1, js + 1)];
      const ptl = grid[gidx(ic + 1, js)];
      const boundA = lerp(pll, ptl, 0.25);
      const boundB = lerp(plr, ptr, 0.25);
      const midLE = lerp(pll, plr, 0.5);
      const midTE = lerp(ptl, ptr, 0.5);
      const collocation = lerp(midLE, midTE, 0.75);
      const d1 = sub(ptr, pll);
      const d2 = sub(ptl, plr);
      let normal = unit(cross(d1, d2));
      if (normal[2] < 0) normal = scale(normal, -1);
      const area = 0.5 * norm(cross(d1, d2));
      const center = lerp(lerp(pll, plr, 0.5), lerp(ptl, ptr, 0.5), 0.5);
      panels.push({
        i: ic, j: js,
        corners: [pll, plr, ptr, ptl],
        boundA, boundB, collocation, normal, area, center,
        cut: isCut(cfg, ic, js),
      });
    }
  }
  return panels;
}

// ── Biot–Savart ──────────────────────────────────────────────────────────────────
function segInduced(a, b, p) {
  const r1 = sub(p, a), r2 = sub(p, b), r0 = sub(b, a);
  const cr = cross(r1, r2);
  const crsq = dot(cr, cr);
  const n1 = norm(r1), n2 = norm(r2);
  if (crsq < 1e-12 || n1 < 1e-9 || n2 < 1e-9) return [0, 0, 0];
  const k = (dot(r0, r1) / n1 - dot(r0, r2) / n2) / (4 * PI * crsq);
  return scale(cr, k);
}

function horseshoe(a, b, dir, far, p) {
  const aInf = add(a, scale(dir, far));
  const bInf = add(b, scale(dir, far));
  return add(add(segInduced(aInf, a, p), segInduced(a, b, p)), segInduced(b, bInf, p));
}

// ── dense linear solve (Gaussian elimination, partial pivoting) ──────────────────
function gaussSolve(A, b, n) {
  for (let col = 0; col < n; col++) {
    let piv = col, best = Math.abs(A[col * n + col]);
    for (let r = col + 1; r < n; r++) {
      const v = Math.abs(A[r * n + col]);
      if (v > best) { best = v; piv = r; }
    }
    if (best < 1e-14) return null;
    if (piv !== col) {
      for (let c = 0; c < n; c++) {
        const t = A[col * n + c]; A[col * n + c] = A[piv * n + c]; A[piv * n + c] = t;
      }
      const t = b[col]; b[col] = b[piv]; b[piv] = t;
    }
    const d = A[col * n + col];
    for (let r = col + 1; r < n; r++) {
      const f = A[r * n + col] / d;
      if (f !== 0) {
        for (let c = col; c < n; c++) A[r * n + c] -= f * A[col * n + c];
        b[r] -= f * b[col];
      }
    }
  }
  const x = new Float64Array(n);
  for (let r = n - 1; r >= 0; r--) {
    let s = b[r];
    for (let c = r + 1; c < n; c++) s -= A[r * n + c] * x[c];
    x[r] = s / A[r * n + r];
  }
  return x;
}

// ── the solve ────────────────────────────────────────────────────────────────────
// Returns { panels:[{i,j,center,normal,area,force,gamma,pressure,cut}],
//           force,drag,lift,side,magnitude,lOverD,cl,cd,centerOfPressure,
//           liveArea,refArea,nPanels,nCut }
export function solveVLM(cfg) {
  const panels = buildPanels(cfg);
  const dir = [1, 0, 0];
  const vinf = scale(dir, cfg.wind);
  const far = (cfg.span + cfg.chord) * 200 + 1;

  const refArea = panels.reduce((s, p) => s + p.area, 0);
  const liveArea = panels.reduce((s, p) => s + (p.cut ? 0 : p.area), 0);

  const active = [];
  panels.forEach((p, k) => { if (!p.cut) active.push(k); });
  const n = active.length;
  const gamma = new Float64Array(panels.length);

  if (n > 0) {
    const A = new Float64Array(n * n);
    const rhs = new Float64Array(n);
    for (let ri = 0; ri < n; ri++) {
      const pi = panels[active[ri]];
      for (let cj = 0; cj < n; cj++) {
        const pj = panels[active[cj]];
        const v = horseshoe(pj.boundA, pj.boundB, dir, far, pi.collocation);
        A[ri * n + cj] = dot(v, pi.normal);
      }
      rhs[ri] = -dot(vinf, pi.normal);
    }
    const sol = gaussSolve(A, rhs, n);
    if (sol) for (let ri = 0; ri < n; ri++) gamma[active[ri]] = sol[ri];
  }

  const q = 0.5 * cfg.rho * cfg.wind * cfg.wind;
  let total = [0, 0, 0];
  let copNum = [0, 0, 0], copDen = 0;
  const out = [];
  for (let k = 0; k < panels.length; k++) {
    const p = panels[k];
    if (p.cut) {
      out.push({ i: p.i, j: p.j, center: p.center, normal: p.normal, area: p.area,
        force: [0, 0, 0], gamma: 0, pressure: 0, cut: true });
      continue;
    }
    const mid = lerp(p.boundA, p.boundB, 0.5);
    let vtot = vinf;
    for (const kj of active) {
      const g = gamma[kj];
      if (g !== 0) {
        const pj = panels[kj];
        vtot = add(vtot, scale(horseshoe(pj.boundA, pj.boundB, dir, far, mid), g));
      }
    }
    const lvec = sub(p.boundB, p.boundA);
    const force = scale(cross(vtot, lvec), cfg.rho * gamma[k]);
    total = add(total, force);
    const mag = norm(force);
    copNum = add(copNum, scale(p.center, mag));
    copDen += mag;
    const pressure = q > 1e-9 && p.area > 1e-12 ? dot(force, p.normal) / (q * p.area) : 0;
    out.push({ i: p.i, j: p.j, center: p.center, normal: p.normal, area: p.area,
      force, gamma: gamma[k], pressure, cut: false });
  }

  const drag = total[0], lift = total[2], side = total[1];
  const magnitude = norm(total);
  const lOverD = Math.abs(drag) > 1e-9 ? lift / drag : 0;
  const denom = q * refArea;
  const cl = denom > 1e-9 ? lift / denom : 0;
  const cd = denom > 1e-9 ? drag / denom : 0;
  const cop = copDen > 1e-9 ? scale(copNum, 1 / copDen) : [0, 0, 0];
  const nCut = panels.filter((p) => p.cut).length;

  return {
    panels: out, force: total, drag, lift, side, magnitude, lOverD, cl, cd,
    centerOfPressure: cop, liveArea, refArea, nPanels: panels.length, nCut,
  };
}

// node-testability
const G = typeof globalThis !== 'undefined' ? globalThis : window;
G.KITE_VLM = { revDefault, buildPanels, solveVLM };

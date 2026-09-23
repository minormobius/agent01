// ns2d.js — a 2D incompressible Navier–Stokes solver in vorticity form on the
// periodic square [0, 2π)², pseudo-spectral with a hand-written radix-2 FFT,
// 2/3-rule dealiasing and an integrating-factor RK4 for the viscous term.
//
//   ∂t ω + u·∇ω = ν Δω,   u = ∂y ψ,  v = −∂x ψ,  ω = −Δψ
//
// Field layout: real arrays of length n*n, index j*n + i for (x_i, y_j) =
// (2πi/n, 2πj/n). Spectral arrays use the same layout with integer wavenumbers
// kx = i (i ≤ n/2) or i − n, likewise ky from j. The file runs both in the
// browser (window.NS2D) and in node (globalThis.NS2D, see ns2d.selftest.mjs) —
// there is exactly one copy of the numerics.
(function (root) {
  'use strict';

  // ------------------------------------------------------------------ FFT --
  // Iterative in-place radix-2 Cooley–Tukey. Forward uses e^{-2πi jk/n};
  // inverse divides by n. Twiddles and the bit-reversal permutation are
  // precomputed once per length.
  function makeFFT(n) {
    if ((n & (n - 1)) !== 0 || n < 2) throw new Error('FFT length must be a power of two ≥ 2, got ' + n);
    const bits = Math.round(Math.log2(n));
    const rev = new Uint32Array(n);
    for (let i = 0; i < n; i++) { let r = 0; for (let b = 0; b < bits; b++) r = (r << 1) | ((i >> b) & 1); rev[i] = r; }
    const cs = new Float64Array(n / 2), sn = new Float64Array(n / 2);
    for (let i = 0; i < n / 2; i++) { cs[i] = Math.cos(2 * Math.PI * i / n); sn[i] = Math.sin(2 * Math.PI * i / n); }
    return function fft(re, im, inverse) {
      for (let i = 0; i < n; i++) { const j = rev[i]; if (j > i) { let t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; } }
      for (let size = 2; size <= n; size <<= 1) {
        const half = size >> 1, step = n / size;
        for (let i = 0; i < n; i += size) {
          for (let j = 0; j < half; j++) {
            const k = j * step, wr = cs[k], wi = inverse ? sn[k] : -sn[k];
            const a = i + j, b = a + half;
            const xr = re[b] * wr - im[b] * wi, xi = re[b] * wi + im[b] * wr;
            re[b] = re[a] - xr; im[b] = im[a] - xi; re[a] += xr; im[a] += xi;
          }
        }
      }
      if (inverse) { const s = 1 / n; for (let i = 0; i < n; i++) { re[i] *= s; im[i] *= s; } }
    };
  }

  // 2D transform: rows, then columns, in place on n×n arrays.
  function makeFFT2(n) {
    const fft1 = makeFFT(n), tr = new Float64Array(n), ti = new Float64Array(n);
    return function fft2(re, im, inverse) {
      for (let j = 0; j < n; j++) {
        const o = j * n;
        for (let i = 0; i < n; i++) { tr[i] = re[o + i]; ti[i] = im[o + i]; }
        fft1(tr, ti, inverse);
        for (let i = 0; i < n; i++) { re[o + i] = tr[i]; im[o + i] = ti[i]; }
      }
      for (let i = 0; i < n; i++) {
        for (let j = 0; j < n; j++) { tr[j] = re[j * n + i]; ti[j] = im[j * n + i]; }
        fft1(tr, ti, inverse);
        for (let j = 0; j < n; j++) { re[j * n + i] = tr[j]; im[j * n + i] = ti[j]; }
      }
    };
  }

  // --------------------------------------------------------------- solver --
  function create(n, nu) {
    const N2 = n * n, fft2 = makeFFT2(n);
    const kx = new Float64Array(N2), ky = new Float64Array(N2), k2 = new Float64Array(N2), mask = new Float64Array(N2);
    const kcut = n / 3;
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const m = j * n + i, kxi = i <= n / 2 ? i : i - n, kyj = j <= n / 2 ? j : j - n;
      kx[m] = kxi; ky[m] = kyj; k2[m] = kxi * kxi + kyj * kyj;
      mask[m] = (Math.abs(kxi) < kcut && Math.abs(kyj) < kcut) ? 1 : 0;   // 2/3 rule; also kills the Nyquist modes
    }
    // state: spectral vorticity
    const wr = new Float64Array(N2), wi = new Float64Array(N2);
    // scratch
    const ur = new Float64Array(N2), ui = new Float64Array(N2), vr = new Float64Array(N2), vi = new Float64Array(N2);
    const xr = new Float64Array(N2), xi = new Float64Array(N2), yr = new Float64Array(N2), yi = new Float64Array(N2);
    const Ar = new Float64Array(N2), Ai = new Float64Array(N2), Br = new Float64Array(N2), Bi = new Float64Array(N2);
    const Cr = new Float64Array(N2), Ci = new Float64Array(N2), Dr = new Float64Array(N2), Di = new Float64Array(N2);
    const Nar = new Float64Array(N2), Nai = new Float64Array(N2), Nbr = new Float64Array(N2), Nbi = new Float64Array(N2);
    const Ncr = new Float64Array(N2), Nci = new Float64Array(N2), Ndr = new Float64Array(N2), Ndi = new Float64Array(N2);
    let E1 = null, E2 = null, lastDt = -1;

    // velocity (real space, in ur/vr) from a spectral vorticity
    function velocity(inR, inI) {
      for (let m = 0; m < N2; m++) {
        if (k2[m] === 0) { ur[m] = ui[m] = vr[m] = vi[m] = 0; continue; }
        const pr = inR[m] * mask[m] / k2[m], pi = inI[m] * mask[m] / k2[m];   // ψ̂ = ω̂ / k²
        ur[m] = -ky[m] * pi; ui[m] = ky[m] * pr;                              // û = i ky ψ̂
        vr[m] = kx[m] * pi; vi[m] = -kx[m] * pr;                              // v̂ = −i kx ψ̂
      }
      fft2(ur, ui, true); fft2(vr, vi, true);
    }
    // N(ω̂) = −FFT[ u·∇ω ], dealiased
    function nonlinear(inR, inI, outR, outI) {
      velocity(inR, inI);
      for (let m = 0; m < N2; m++) {
        const a = inR[m] * mask[m], b = inI[m] * mask[m];
        xr[m] = -kx[m] * b; xi[m] = kx[m] * a;   // ∂x ω
        yr[m] = -ky[m] * b; yi[m] = ky[m] * a;   // ∂y ω
      }
      fft2(xr, xi, true); fft2(yr, yi, true);
      for (let m = 0; m < N2; m++) { outR[m] = -(ur[m] * xr[m] + vr[m] * yr[m]); outI[m] = 0; }
      fft2(outR, outI, false);
      for (let m = 0; m < N2; m++) { outR[m] *= mask[m]; outI[m] *= mask[m]; }
    }
    function factors(dt) {
      if (dt === lastDt) return;
      E1 = new Float64Array(N2); E2 = new Float64Array(N2);
      for (let m = 0; m < N2; m++) { E1[m] = Math.exp(-nu * k2[m] * dt); E2[m] = Math.exp(-nu * k2[m] * dt / 2); }
      lastDt = dt;
    }
    // integrating-factor RK4 for ω̂' = −νk²ω̂ + N(ω̂)
    function step(dt) {
      factors(dt);
      nonlinear(wr, wi, Nar, Nai);
      for (let m = 0; m < N2; m++) { Br[m] = E2[m] * (wr[m] + dt / 2 * Nar[m]); Bi[m] = E2[m] * (wi[m] + dt / 2 * Nai[m]); }
      nonlinear(Br, Bi, Nbr, Nbi);
      for (let m = 0; m < N2; m++) { Cr[m] = E2[m] * wr[m] + dt / 2 * Nbr[m]; Ci[m] = E2[m] * wi[m] + dt / 2 * Nbi[m]; }
      nonlinear(Cr, Ci, Ncr, Nci);
      for (let m = 0; m < N2; m++) { Dr[m] = E1[m] * wr[m] + dt * E2[m] * Ncr[m]; Di[m] = E1[m] * wi[m] + dt * E2[m] * Nci[m]; }
      nonlinear(Dr, Di, Ndr, Ndi);
      for (let m = 0; m < N2; m++) {
        wr[m] = E1[m] * wr[m] + dt / 6 * (E1[m] * Nar[m] + 2 * E2[m] * (Nbr[m] + Ncr[m]) + Ndr[m]);
        wi[m] = E1[m] * wi[m] + dt / 6 * (E1[m] * Nai[m] + 2 * E2[m] * (Nbi[m] + Nci[m]) + Ndi[m]);
      }
      sim.t += dt; sim.steps++;
    }
    function setVorticity(w) {           // w: real array n*n
      for (let m = 0; m < N2; m++) { wr[m] = w[m]; wi[m] = 0; }
      fft2(wr, wi, false);
      for (let m = 0; m < N2; m++) { wr[m] *= mask[m]; wi[m] *= mask[m]; }
      sim.t = 0; sim.steps = 0;
    }
    // real-space fields: ω, u, v (fresh arrays)
    function fields() {
      velocity(wr, wi);
      const w = new Float64Array(N2), wim = new Float64Array(N2);
      for (let m = 0; m < N2; m++) { w[m] = wr[m]; wim[m] = wi[m]; }
      fft2(w, wim, true);
      return { w, u: Float64Array.from(ur), v: Float64Array.from(vr) };
    }
    // energy, enstrophy, palinstrophy, maxima, mean profile U(y), Reynolds stress ⟨u'v'⟩(y), perturbation energy
    function diagnostics() {
      const F = fields();
      let E = 0, Z = 0, maxU = 0, maxW = 0;
      const U = new Float64Array(n), uv = new Float64Array(n);
      for (let j = 0; j < n; j++) { let s = 0; for (let i = 0; i < n; i++) s += F.u[j * n + i]; U[j] = s / n; }
      let Ep = 0;
      for (let j = 0; j < n; j++) {
        let s = 0;
        for (let i = 0; i < n; i++) {
          const m = j * n + i, u = F.u[m], v = F.v[m], w = F.w[m];
          E += 0.5 * (u * u + v * v); Z += 0.5 * w * w;
          const sp = Math.hypot(u, v); if (sp > maxU) maxU = sp; if (Math.abs(w) > maxW) maxW = Math.abs(w);
          const up = u - U[j]; s += up * v; Ep += 0.5 * (up * up + v * v);
        }
        uv[j] = s / n;
      }
      // palinstrophy ½⟨|∇ω|²⟩ from the spectral state (Parseval on the dealiased modes)
      let P = 0; for (let m = 0; m < N2; m++) P += 0.5 * k2[m] * (wr[m] * wr[m] + wi[m] * wi[m]) * mask[m];
      P /= N2 * N2;
      return { E: E / N2, Z: Z / N2, P, maxU, maxW, U, uv, Ep: Ep / N2, t: sim.t, fields: F };
    }
    const sim = { n, nu, t: 0, steps: 0, step, setVorticity, fields, diagnostics, wr, wi, kx, ky, k2, mask,
      setNu(v) { nu = v; sim.nu = v; lastDt = -1; } };
    return sim;
  }

  root.NS2D = { makeFFT, makeFFT2, create };
})(typeof window !== 'undefined' ? window : globalThis);

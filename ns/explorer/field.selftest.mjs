#!/usr/bin/env node
// field.selftest.mjs — pins what the /explorer/ field claims to be exact.
//   node ns/explorer/field.selftest.mjs
import './field.js';
const { params, build, erf, Hexact } = globalThis.NSFIELD;

let checks = 0, failed = 0;
function ok(cond, msg, detail = '') { checks++; if (!cond) { failed++; console.log('  ✗ ' + msg + (detail ? ' — ' + detail : '')); } else console.log('  ✓ ' + msg + (detail ? ' — ' + detail : '')); }

// 0. determinism and ranges ---------------------------------------------------
{
  const a = params('specimen-7'), b = params('specimen-7'), c = params('specimen-8');
  ok(JSON.stringify(a) === JSON.stringify(b) && JSON.stringify(a) !== JSON.stringify(c), 'seed → parameters is deterministic and seeds differ');
  let inRange = true; for (let i = 0; i < 200; i++) { const p = params('s' + i); if (!(p.h > 0 && p.h < 0.01 && p.j0 > 0 && p.j0 <= 0.05)) inRange = false; }
  ok(inRange, '200 seeds keep h inside (0, 1/100) and j₀ inside (0, 0.05]');
  ok(Math.abs(erf(0.5) - 0.5204998778) < 2e-7 && Math.abs(erf(2) - 0.9953222650) < 2e-7, 'erf approximation within 2e-7');
  ok(Math.abs(Hexact(0, 0.007) - 1) < 1e-5, 'H(0) = 1', (Hexact(0, 0.007) - 1).toExponential(1));
}

for (const seed of ['specimen-7', 'blue-3', 'x']) {
  const p = params(seed), Fd = build(p);
  console.log(`\nseed "${seed}": h=${p.h.toFixed(4)} j0=${p.j0.toFixed(3)} Xu=${p.Xu.toFixed(2)} Xe=${p.Xe.toFixed(2)} beta=${p.beta.toFixed(2)}`);

  // 1. the similarity relation ---------------------------------------------
  { let worst = 0; for (const [z, tau] of [[0.3, 0.5], [-0.8, 0.1], [0.05, 1e-3], [1.5, 1]]) { const q = Fd.qOf(z, tau); worst = Math.max(worst, Math.abs(q - z * z * Math.pow(q, 2 * p.h) - tau) / tau); } ok(worst < 1e-10, 'q solves q − z²q^{2h} = τ', 'rel ' + worst.toExponential(1)); }

  // 2. incompressibility, by central differences on the Cartesian field ------
  {
    let worst = 0, scale = 0;
    for (const [x, y, z, tau] of [[0.3, 0.2, 0.1, 0.5], [0.8, -0.4, 0.5, 0.3], [0.05, 0.02, -0.3, 0.1], [1.5, 0.9, -1.0, 1], [0.2, 0.0, 0.6, 0.02], [0.02, 0.01, 0.0, 0.01]]) {
      const e = 1e-4 * Math.max(0.05, Math.hypot(x, y, z));
      const d = (f, i) => { const P = [x, y, z], Pp = P.slice(), Pm = P.slice(); Pp[i] += e; Pm[i] -= e; return (f(...Pp) - f(...Pm)) / (2 * e); };
      const U = (a, b, c) => Fd.at(a, b, c, tau).u, V = (a, b, c) => Fd.at(a, b, c, tau).v, W = (a, b, c) => Fd.at(a, b, c, tau).w;
      const div = d(U, 0) + d(V, 1) + d(W, 2);
      const grad = Math.abs(d(U, 0)) + Math.abs(d(V, 1)) + Math.abs(d(W, 2));
      worst = Math.max(worst, Math.abs(div) / grad); scale = Math.max(scale, grad);
    }
    ok(worst < 2e-5, 'div u = 0 (relative to |∇u|, 6 points incl. near the axis and late times)', 'worst ' + worst.toExponential(1));
  }

  // 3. regularity at the axis: u_θ ∝ r, u_r ∝ r, u_z finite ------------------
  {
    const tau = 0.2, z = 0.1; const a = Fd.at(1e-3, 0, z, tau), b = Fd.at(2e-3, 0, z, tau);
    ok(Math.abs(b.v / a.v - 2) < 1e-3 && Math.abs(b.u / a.u - 2) < 1e-3 && isFinite(a.w) && Math.abs(a.w - b.w) / Math.abs(a.w) < 1e-4, 'swirl and radial velocity vanish linearly at the axis, axial velocity is finite', `u_θ ratio ${(b.v / a.v).toFixed(4)}`);
  }

  // 4. the centrifugal balance ∂_r p = u_θ²/r -------------------------------
  {
    let worst = 0;
    for (const [r, z, tau] of [[0.3, 0.05, 0.5], [0.7, -0.3, 0.2], [1.2, 0.4, 1], [0.1, 0.0, 0.05]]) {
      const e = 1e-4 * r; const dp = (Fd.at(r + e, 0, z, tau).p - Fd.at(r - e, 0, z, tau).p) / (2 * e); const f = Fd.at(r, 0, z, tau); const cf = f.uth * f.uth / r;
      worst = Math.max(worst, Math.abs(dp - cf) / cf);
    }
    ok(worst < 6e-3, 'radial pressure gradient equals u_θ²/r (within the table’s interpolation error)', 'worst ' + worst.toExponential(1));
    const p0 = Fd.at(0, 0, 0, 0.5).p, pfar = Fd.at(6, 0, 0, 0.5).p;
    ok(p0 < pfar && pfar < 0 && Math.abs(pfar) < 0.05 * Math.abs(p0), 'pressure is lowest on the axis and tends to zero outward', `p(0)=${p0.toFixed(3)} p(6)=${pfar.toFixed(4)}`);
  }

  // 5. the exterior heat law -----------------------------------------------
  {
    const tau = 0.3, r = 8, f = Fd.at(r, 0, 0, tau); const A = 0.5 + p.h;
    const K = p.cinf * Math.pow(r * r / 2, -A) * Fd.Hlook(4 * tau / (r * r));
    ok(Math.abs(f.uth - K) / K < 0.02, 'far swirl matches c∞(r²/2)^−A·H(4τ/r²) within 2% at r = 8', `ratio ${(f.uth / K).toFixed(4)}`);
    ok(Math.abs(f.ur) < 1e-6 * f.uth && Math.abs(f.w) < 1e-6 * f.uth, 'and the far flow is purely azimuthal');
  }

  // 6. the scalings: swirl on the core circle grows like τ^−A, its radius shrinks like √τ
  {
    const Xin = 0.3, A = 0.5 + p.h; const s = (tau) => Fd.at(Math.sqrt(2 * Xin * tau), 0, 0, tau).uth;
    const ratio = s(1e-3) / s(1e-1), expect = Math.pow(1e-2, -A);
    ok(Math.abs(ratio / expect - 1) < 1e-6, 'u_θ at fixed X on z = 0 scales exactly like τ^−A across two decades', `ratio ${ratio.toFixed(3)} vs ${expect.toFixed(3)}`);
  }
  // 7. the meridional flow: inflow at the mid-plane, axial velocity zero at η = −j₀/4
  {
    const tau = 0.4, r = 0.4; const m = Fd.at(r, 0, 0, tau); ok(m.ur < 0, 'radial inflow on the mid-plane', `u_r = ${m.ur.toFixed(4)}`);
    let zz = -p.j0 / 4 * Math.pow(tau, Fd.D); for (let k = 0; k < 8; k++) zz = -p.j0 / 4 * Math.pow(Fd.qOf(zz, tau), Fd.D);
    const wz = Fd.at(r, 0, zz, tau).w, wref = Fd.at(r, 0, 0, tau).w; ok(Math.abs(wz) < 1e-6 * Math.abs(wref), 'u_z vanishes on the layer η = −j₀/4', wz.toExponential(1));
    const far = Fd.at(8, 0, 0.3, tau); ok(Math.abs(far.ur) < 1e-6 && Math.abs(far.w) < 1e-6, 'no radial or axial flow beyond the return shell (∫U dX = 0)', `u_r ${far.ur.toExponential(1)} u_z ${far.w.toExponential(1)}`);
    let neg = false; for (let X = 0.1; X < 30; X *= 1.15) if (Fd.U(X, 0.5) < 0) neg = true; ok(neg, 'the axial flow has a return shell');
  }
}
console.log(`\n${failed === 0 ? '✓' : '✗'} field selftest: ${checks - failed}/${checks} checks passed`);
process.exit(failed ? 1 : 0);

/* TWIST's mechanics. No DOM.

   Seven elastic fibres, each a chain of beads joined by stiff stretch springs, with a soft repulsion between beads of
   different fibres (a fibre has a radius). The yarn runs along the last axis; its cross-section is the other d − 1:
   a plane in 3D, a 3-space in 4D. The fibres start as our yarn does, one in the middle and six round it, the top end
   turned `turns` times in the x–y plane, both ends clamped and the whole stretched by `strain`. Then it is left to
   relax (damped dynamics, a small jiggle to break the symmetry).

   What is measured: the grip on one outer fibre against its own tension (see measure()), the squeeze on the core (the contact force on the middle fibre, per length: friction is that
   times a coefficient), how many turns an outer fibre still makes round the core, how far any fibre went out of the
   x–y plane on the way (4D only), and the elastic energy. Nothing here knows which dimension it is in except the
   number of coordinates. */
export function makeYarn({ d = 3, turns = 2, strain = 0.03, M = 32, L = 4, a = 0.1, ring = 0.212, ks = 3000, kc = 6000, noise = 2e-3, seed = 1, tape = 0 } = {}) {
  let s = seed; const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32) * 2 - 1;
  const F = 7, n = M + 1, N = F * n, X = new Float64Array(N * d), V = new Float64Array(N * d), G = new Float64Array(N * d), ax = d - 1, s0 = L / M, top = L * (1 + strain), fixed = new Uint8Array(N);
  const base = [[0, 0]]; for (let k = 0; k < 6; k++) base.push([ring * Math.cos((k * Math.PI) / 3), ring * Math.sin((k * Math.PI) / 3)]);
  for (let f = 0; f < F; f++) for (let i = 0; i < n; i++) { const u = i / M, th = 2 * Math.PI * turns * u, c = Math.cos(th), sn = Math.sin(th), p = (f * n + i) * d;
    X[p] = c * base[f][0] - sn * base[f][1]; X[p + 1] = sn * base[f][0] + c * base[f][1]; X[p + ax] = top * u; if (i === 0 || i === M) fixed[f * n + i] = 1; else for (let q = 0; q < d; q++) X[p + q] += noise * rnd(); }
  const ribbon = tape > 0 && d === 4; if (ribbon) for (let i = 0; i < n; i++) fixed[i] = 1;
  const dt = 0.006, damp = 0.985, Y = { d, F, n, M, L, a, X, t: 0, peakOut: 0, turns, strain, tape: ribbon ? tape : 0 };
  let energy = 0, squeeze = 0, grip = 0;
  const force = (measure) => { G.fill(0); energy = 0; squeeze = 0; grip = 0;
    for (let f = 0; f < F; f++) for (let i = 0; i < M; i++) { const p = (f * n + i) * d, q = p + d; let l = 0; for (let c = 0; c < d; c++) l += (X[q + c] - X[p + c]) ** 2; l = Math.sqrt(l); const k = (ks * (l - s0)) / l; energy += 0.5 * ks * (l - s0) ** 2; for (let c = 0; c < d; c++) { const g = k * (X[q + c] - X[p + c]); G[p + c] += g; G[q + c] -= g; } }
    /* contact: beads of different fibres closer than two radii push apart (only beads near the same height can meet) */
    for (let f = ribbon ? 1 : 0; f < F; f++) for (let g = f + 1; g < F; g++) for (let i = 0; i < n; i++) { const p = (f * n + i) * d, lo = Math.max(0, i - 3), hi = Math.min(M, i + 3); for (let j = lo; j <= hi; j++) { const q = (g * n + j) * d; let l = 0; for (let c = 0; c < d; c++) l += (X[q + c] - X[p + c]) ** 2; if (l >= 4 * a * a) continue; l = Math.sqrt(l); const o = 2 * a - l, k = (kc * o) / l; energy += 0.5 * kc * o * o; if (measure) { if (f === 0) squeeze += kc * o; if (f === 1 || g === 1) grip += kc * o; } for (let c = 0; c < d; c++) { const gg = k * (X[q + c] - X[p + c]); G[p + c] -= gg; G[q + c] += gg; } } }
    /* the cheat: with `tape`, the core is not a fibre but a rigid ribbon running the yarn's length, `tape` wide either
       side along z: in the cross-section, the segment x = y = 0, |z| ≤ tape. The six fibres meet it as they would a
       fibre of the same radius, and the squeeze is what they press on it with */
    if (ribbon) for (let f = 1; f < F; f++) for (let i = 0; i < n; i++) { const p = (f * n + i) * d, x = X[p], y = X[p + 1], z = X[p + 2], zc = z < -tape ? -tape : z > tape ? tape : z, dz = z - zc, l = Math.sqrt(x * x + y * y + dz * dz); if (l >= 2 * a || l === 0) continue; const o = 2 * a - l, k = (kc * o) / l; energy += 0.5 * kc * o * o; if (measure) { squeeze += kc * o; if (f === 1) grip += kc * o; } G[p] += k * x; G[p + 1] += k * y; G[p + 2] += k * dz; } };
  Y.step = (k = 1) => { for (let it = 0; it < k; it++) { force(false); for (let b = 0; b < N; b++) { if (fixed[b]) continue; for (let c = 0; c < d; c++) { const p = b * d + c; V[p] = (V[p] + G[p] * dt) * damp; X[p] += V[p] * dt; } } Y.t++;
    if (d === 4 && Y.t % 20 === 0) for (let b = 0; b < N; b++) { const z = Math.abs(X[b * d + 2]); if (z > Y.peakOut) Y.peakOut = z; } } };
  Y.measure = () => { force(true);
    let wind = 0; for (let i = 0; i < M; i++) { const p = (n + i) * d, c0 = i * d, q = p + d, c1 = c0 + d; let da = Math.atan2(X[q + 1] - X[c1 + 1], X[q] - X[c1]) - Math.atan2(X[p + 1] - X[c0 + 1], X[p] - X[c0]); while (da > Math.PI) da -= 2 * Math.PI; while (da < -Math.PI) da += 2 * Math.PI; wind += da; }
    let T1 = 0; for (let i = 0; i < M; i++) { const p = (n + i) * d, q = p + d; let l = 0; for (let c = 0; c < d; c++) l += (X[q + c] - X[p + c]) ** 2; T1 += ks * (Math.sqrt(l) - s0); } T1 /= M;
    let T = 0; for (let i = 0; i < M; i++) { const p = i * d, q = p + d; let l = 0; for (let c = 0; c < d; c++) l += (X[q + c] - X[p + c]) ** 2; T += ks * (Math.sqrt(l) - s0); }
    let ke = 0; for (let p = 0; p < V.length; p++) ke += V[p] * V[p];
    /* grip: every contact force on one outer fibre, per length; pull: that fibre's tension. Their ratio is what a rope
       lives on: friction along a fibre is μ × grip, so a fibre of length ℓ holds its own tension if μ × grip × ℓ / 2 ≥ pull,
       i.e. if it is longer than 2 / (μ × grip/pull) */
    return { grip: grip / L, pull: T1, hold: grip / L / T1, squeeze: squeeze / L, wind: wind / (2 * Math.PI), out: Y.peakOut, energy, tension: T / M, moving: Math.sqrt(ke / N) }; };
  return Y;
}
/* the shortest fibre that holds its own tension by friction, in fibre diameters, for a friction coefficient mu */
export const shortest = (m, a = 0.1, mu = 0.3) => (m.hold > 1e-6 ? 2 / (mu * m.hold) / (2 * a) : Infinity);
/* twist it, let it settle, report */
export function settle(opts, steps = 30000) { const Y = makeYarn(opts); Y.step(steps); return { ...Y.measure(), Y }; }

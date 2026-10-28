/* A nebula settling round a young star, no DOM: whether a rotating cloud of gas flattens into a disk. In our world
   it must. Gas circling a star at one radius covers a sphere, and a sphere can't be combed: any flow of circles over
   it has a bald spot, so circling streams cross, collide, lose energy and fall into one plane. A 3-sphere can be
   combed (the Hopf fibration fills it with circles that never meet), so a 4D cloud turning at equal rates in two
   planes might never need to flatten. This simulates it.

   The gas is N particles round a star of mass 1 (G = 1) pulling as 1/r², which is Newton in 3D and the pinned law in
   4D, so the only difference between the runs is the dimension. Collisions are inelastic, pair by pair: two particles
   closer than h and approaching lose a fraction eta of their approach speed along the line between them. That
   conserves momentum and angular momentum exactly and only removes energy, which is all a disk needs to form. (Damping
   the sliding speed too would settle it faster but also drains the cloud's spin: neighbours in a turning cloud slide
   past each other, so every collision would torque the same way.) A
   particle inside rAcc falls onto the star. The gas's own gravity is left out (a light nebula). */

/* the cloud's spin, as a turning: rates a1 in the xy plane and a2 in the zw plane (3D: a1 about z, a2 unused) */
const turn = (d, a1, a2, x) => (d === 3 ? [-a1 * x[1], a1 * x[0], 0] : [-a1 * x[1], a1 * x[0], -a2 * x[3], a2 * x[2]]);

/* a seeded generator, so a run can be repeated exactly */
export function rng(seed) { let s = seed >>> 0 || 1; return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; }
const gauss = (r) => Math.sqrt(-2 * Math.log(r() + 1e-300)) * Math.cos(2 * Math.PI * r());

/* a uniform ball of radius 1, turning at a fraction f of the circular speed (its largest rate scaled to 1), with a
   random dispersion sigma (also in circular speeds) */
export function cloud({ d = 4, N = 8000, a1 = 1, a2 = 1, f = 0.7, sigma = 0.1, rIn = 0.15, seed = 1 } = {}) {
  const r = rng(seed), x = new Float64Array(N * d), v = new Float64Array(N * d), am = Math.max(Math.abs(a1), Math.abs(a2));
  for (let i = 0; i < N; i++) {
    let p, rr; do { p = Array.from({ length: d }, () => 2 * r() - 1); rr = Math.hypot(...p); } while (rr > 1 || rr < rIn);
    const vc = Math.sqrt(1 / rr), w = turn(d, a1 / am, a2 / am, p);
    for (let c = 0; c < d; c++) { x[i * d + c] = p[c]; v[i * d + c] = (f * w[c] * vc) / rr + sigma * vc * gauss(r); }
  }
  return { d, N, x, v, alive: new Uint8Array(N).fill(1), t: 0, accreted: 0, escaped: 0 };
}

/* one step: kick, drift, kick under the star's pull, then the particles that fell in or flew off */
function gravityStep(S, dt, rAcc) {
  const { d, N, x, v, alive } = S;
  const kick = (h) => { for (let i = 0; i < N; i++) if (alive[i]) { let r2 = 0; for (let c = 0; c < d; c++) r2 += x[i * d + c] ** 2; const f = h / (r2 * Math.sqrt(r2)); for (let c = 0; c < d; c++) v[i * d + c] -= f * x[i * d + c]; } };
  kick(dt / 2); for (let i = 0; i < N * d; i++) x[i] += dt * v[i]; kick(dt / 2);
  for (let i = 0; i < N; i++) if (alive[i]) { let r2 = 0; for (let c = 0; c < d; c++) r2 += x[i * d + c] ** 2; if (r2 < rAcc * rAcc) { alive[i] = 0; S.accreted++; } else if (r2 > 100) { alive[i] = 0; S.escaped++; } }
  S.t += dt;
}

/* the collisions: a grid of cells h wide, each pair within h compared once */
function collide(S, h, eta) {
  const { d, N, x, v, alive } = S, cells = new Map(), B = 256, key = (cs) => cs.reduce((k, c) => k * B + (c + B / 2), 0);
  for (let i = 0; i < N; i++) if (alive[i]) { const k = key(Array.from({ length: d }, (_, c) => Math.floor(x[i * d + c] / h))); let l = cells.get(k); if (!l) cells.set(k, (l = [])); l.push(i); }
  const offs = []; for (let m = 0; m < 3 ** d; m++) { const o = []; let q = m; for (let c = 0; c < d; c++) { o.push((q % 3) - 1); q = Math.floor(q / 3); } offs.push(o); }
  const dx = new Float64Array(d); let pairs = 0;
  for (const [k, list] of cells) {
    const base = []; let q = k; for (let c = d - 1; c >= 0; c--) { base[c] = (q % B) - B / 2; q = Math.floor(q / B); }
    for (const o of offs) {
      const nk = key(base.map((b, c) => b + o[c])); if (nk < k) continue; const other = cells.get(nk); if (!other) continue;
      for (let a = 0; a < list.length; a++) { const i = list[a]; for (let b = nk === k ? a + 1 : 0; b < other.length; b++) {
        const j = other[b]; let r2 = 0; for (let c = 0; c < d; c++) { dx[c] = x[i * d + c] - x[j * d + c]; r2 += dx[c] * dx[c]; } if (r2 >= h * h || r2 === 0) continue;
        const r = Math.sqrt(r2); let vr = 0; for (let c = 0; c < d; c++) vr += (v[i * d + c] - v[j * d + c]) * dx[c]; vr /= r; if (vr >= 0) continue; // only approaching pairs
        const imp = 0.5 * eta * vr * (1 - r / h); pairs++;
        for (let c = 0; c < d; c++) { const u = (imp * dx[c]) / r; v[i * d + c] -= u; v[j * d + c] += u; }
      } }
    }
  }
  return pairs;
}

/* what shape the gas is in: the eigenvalues of its second moment (equal: round; two small: a disk), the total turning
   (a bivector, as xy, xz, xw, yz, yw, zw), and how far each particle's own orbit plane sits from the cloud's */
export function shape(S) {
  const { d, N, x, v, alive } = S, M = Array.from({ length: d }, () => new Array(d).fill(0)), L = new Array((d * (d - 1)) / 2).fill(0); let n = 0;
  let ecc = 0; // each orbit's eccentricity about the star (mass 1): 0 when the gas has settled onto circles
  for (let i = 0; i < N; i++) if (alive[i]) { n++; let q = 0, r2 = 0, w2 = 0, rv = 0; for (let a = 0; a < d; a++) { r2 += x[i * d + a] ** 2; w2 += v[i * d + a] ** 2; rv += x[i * d + a] * v[i * d + a]; }
    const R = Math.sqrt(r2); let e2 = 0; for (let a = 0; a < d; a++) e2 += ((w2 - 1 / R) * x[i * d + a] - rv * v[i * d + a]) ** 2; ecc += Math.sqrt(e2); for (let a = 0; a < d; a++) { for (let b = 0; b < d; b++) M[a][b] += x[i * d + a] * x[i * d + b]; for (let b = a + 1; b < d; b++) L[q++] += x[i * d + a] * v[i * d + b] - x[i * d + b] * v[i * d + a]; } }
  for (const row of M) for (let b = 0; b < d; b++) row[b] /= n;
  const ev = eigSym(M).sort((a, b) => b - a), al = alignment(S, L);
  return { alive: n, accreted: S.accreted, escaped: S.escaped, t: +S.t.toFixed(3), axes: ev.map((e) => +Math.sqrt(e).toFixed(4)), L: L.map((l) => +l.toFixed(3)), ecc: +(ecc / n).toFixed(4), ...al };
}
/* how each particle's own orbit sits against the cloud's turning. In 3D, the mean cosine between its turning and the
   cloud's: 1 when all orbit in one plane. In 4D a turning splits into a left half and a right half (self-dual and
   anti-self-dual, chapter 3), and each particle's orbit, lying in a plane, has equal halves. A flat disk lines up both
   halves of every orbit with the cloud's (plus 1, minus 1). Orbits in the planes of one Hopf fibration line up one
   half only (1, and about 0). Planes at random: about 0 and 0 */
export function alignment(S, Ltot) {
  const { d, N, x, v, alive } = S, halves = (B) => [[B[0] + B[5], B[1] - B[4], B[2] + B[3]], [B[0] - B[5], B[1] + B[4], B[2] - B[3]]];
  const cos = (a, b) => { const ab = a.reduce((s, u, i) => s + u * b[i], 0), na = Math.hypot(...a), nb = Math.hypot(...b); return na && nb ? ab / (na * nb) : 0; };
  const T = d === 4 ? halves(Ltot) : null; let p = 0, m = 0, n = 0;
  for (let i = 0; i < N; i++) if (alive[i]) { const B = []; for (let a = 0; a < d; a++) for (let b = a + 1; b < d; b++) B.push(x[i * d + a] * v[i * d + b] - x[i * d + b] * v[i * d + a]);
    if (d === 4) { const H = halves(B); p += cos(H[0], T[0]); m += cos(H[1], T[1]); } else p += cos(B, Ltot); n++; }
  return d === 4 ? { plus: +(p / n).toFixed(3), minus: +(m / n).toFixed(3) } : { plus: +(p / n).toFixed(3) };
}

/* how cold the gas is: each particle's speed relative to the mean of its neighbours within h, over the circular speed */
export function dispersion(S, h) {
  const { d, N, x, v, alive } = S; let s = 0, n = 0; const step = Math.max(1, Math.floor(N / 600));
  for (let i = 0; i < N; i += step) { if (!alive[i]) continue; const m = new Array(d).fill(0); let k = 0;
    for (let j = 0; j < N; j++) { if (!alive[j]) continue; let r2 = 0; for (let c = 0; c < d; c++) r2 += (x[i * d + c] - x[j * d + c]) ** 2; if (r2 < h * h) { k++; for (let c = 0; c < d; c++) m[c] += v[j * d + c]; } }
    if (k < 4) continue; let dv = 0, r2 = 0; for (let c = 0; c < d; c++) { dv += (v[i * d + c] - m[c] / k) ** 2; r2 += x[i * d + c] ** 2; } s += Math.sqrt(dv * Math.sqrt(Math.sqrt(r2))); n++; } // ÷ the circular speed r^(-1/2)
  return n ? s / n : NaN;
}
/* Jacobi's method for a small symmetric matrix */
export function eigSym(A0) {
  const n = A0.length, A = A0.map((r) => r.slice());
  for (let sweep = 0; sweep < 60; sweep++) { let off = 0; for (let p = 0; p < n; p++) for (let q = p + 1; q < n; q++) off += A[p][q] ** 2; if (off < 1e-22) break;
    for (let p = 0; p < n; p++) for (let q = p + 1; q < n; q++) { if (Math.abs(A[p][q]) < 1e-300) continue;
      const th = (A[q][q] - A[p][p]) / (2 * A[p][q]), t = Math.sign(th || 1) / (Math.abs(th) + Math.sqrt(th * th + 1)), c = 1 / Math.sqrt(t * t + 1), s = t * c;
      for (let k = 0; k < n; k++) { const akp = A[k][p], akq = A[k][q]; A[k][p] = c * akp - s * akq; A[k][q] = s * akp + c * akq; }
      for (let k = 0; k < n; k++) { const apk = A[p][k], aqk = A[q][k]; A[p][k] = c * apk - s * aqk; A[q][k] = s * apk + c * aqk; } } }
  return A.map((r, i) => r[i]);
}

/* one step, collisions included */
export function step(S, { dt = 0.002, h = 0.12, eta = 0.5, rAcc = 0.05 } = {}) { gravityStep(S, dt, rAcc); collide(S, h, eta); }

/* run a cloud for a time T; collisions every `every` steps; onSample sees its shape now and then */
export function evolve(S, { T = 40, dt = 0.002, h = 0.12, eta = 0.5, every = 2, rAcc = 0.05, samples = 40, onSample = null } = {}) {
  const steps = Math.round(T / dt), each = Math.max(1, Math.round(steps / samples));
  for (let s = 0; s < steps; s++) { gravityStep(S, dt, rAcc); if (s % every === 0) collide(S, h, eta); if (onSample && (s + 1) % each === 0) onSample(shape(S), S); }
  return shape(S);
}

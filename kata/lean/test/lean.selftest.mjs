/* Lean's selftest: the ground the page draws and walks on, the track, and the basin you can't leave.
     node kata/lean/test/lean.selftest.mjs */
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
const here = path.dirname(fileURLToPath(import.meta.url));
const Wd = await import(path.join(here, "../js/world.js"));
const { DIM, B, VS, HMASK, MSHIFT, MAT, R_TRACK, SHOULDER, TRACK_H, RIM_MIN, LAND_MAX } = Wd;

let checks = 0, fails = 0;
const ok = (c, msg) => { checks++; if (!c) { fails++; console.log("FAIL " + msg); } else console.log("ok   " + msg); };
const [X, Z, W] = DIM, idx = (x, z, w) => x + X * (z + Z * w), cen = (i) => [((i % X) + 0.5) * VS, ((Math.floor(i / X) % Z) + 0.5) * VS, (Math.floor(i / (X * Z)) + 0.5) * VS];

const t0 = performance.now(), D = Wd.trackDistance(), H = Wd.terrain(1, D), M = Wd.blocks(H), build = performance.now() - t0;
const H2 = Wd.terrain(1);
ok(H.every((v, i) => v === H2[i]), `the same seed makes the same land (built in ${build.toFixed(0)} ms)`);

/* the centreline: the analytic Frenet frame against finite differences, and a track that really bends into w */
{
  let worst = 0, maxW = 0, maxTau = 0;
  const c = Wd.centre, h = 1e-4;
  for (let k = 0; k < 64; k++) {
    const t = (2 * Math.PI * k) / 64, f = Wd.frenet(t);
    const p0 = c(t - h), p1 = c(t), p2 = c(t + h);
    const v = p2.map((x, i) => (x - p0[i]) / (2 * h)), a = p2.map((x, i) => (x - 2 * p1[i] + p0[i]) / (h * h));
    const sp = Math.hypot(...v), cr = [v[1] * a[2] - v[2] * a[1], v[2] * a[0] - v[0] * a[2], v[0] * a[1] - v[1] * a[0]];
    worst = Math.max(worst, Math.abs(Math.hypot(...cr) / sp ** 3 - f.kappa) / f.kappa);
    // orthonormal, and T along the finite-difference velocity
    const T = [f.T[0], f.T[2], f.T[3]], N = [f.N[0], f.N[2], f.N[3]], Bn = [f.Bn[0], f.Bn[2], f.Bn[3]], d = (u, w) => u[0] * w[0] + u[1] * w[1] + u[2] * w[2];
    worst = Math.max(worst, Math.abs(d(T, N)), Math.abs(d(T, Bn)), Math.abs(d(N, Bn)), Math.abs(d(T, v) / sp - 1));
    maxW = Math.max(maxW, Math.abs(f.N[3])); maxTau = Math.max(maxTau, Math.abs(f.tau));
    // torsion by finite differences of the binormal: dB/ds = −τ N
    const fb = Wd.frenet(t + 1e-4), dBds = [0, 2, 3].map((i) => (fb.Bn[i] - f.Bn[i]) / (1e-4 * f.speed));
    worst = Math.max(worst, Math.abs(-d(dBds, N) - f.tau) / Math.max(0.01, maxTau));
  }
  ok(worst < 1e-3, `the centreline's curvature, torsion and frame agree with finite differences (worst ${worst.toExponential(1)})`);
  ok(maxW > 0.5 && maxTau > 0.05, `its bends turn into w (the normal's w part reaches ${maxW.toFixed(2)}) and its plane turns (|τ| up to ${maxTau.toFixed(3)}/m)`);
  ok(Math.abs(Wd.LAP - 77.3) < 1, `a lap is ${Wd.LAP.toFixed(1)} m`);
  // the tube never meets itself: points of the centreline more than a track's width apart along it are more than two widths apart in space
  let close = Infinity;
  for (let i = 0; i < Wd.NS; i += 4) for (let j = i + 4; j < Wd.NS; j += 4) {
    const ds = Math.min(Wd.S[j] - Wd.S[i], Wd.LAP - (Wd.S[j] - Wd.S[i])); if (ds < 4 * (R_TRACK + SHOULDER)) continue;
    const p = Wd.PTS[i], q = Wd.PTS[j]; close = Math.min(close, Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]));
  }
  ok(close > 2 * (R_TRACK + SHOULDER), `the track never comes near itself (closest approach across the lap ${close.toFixed(1)} m)`);
}

/* the land: the rim, the floor, the track */
{
  let rimLo = 255, inHi = 0, badTrack = 0, badMat = 0, tracks = 0, shoulderOut = 0, eMax = 0;
  for (let i = 0; i < H.length; i++) {
    const g = cen(i), e = Wd.basinE(...g), h = H[i] & HMASK, m = H[i] >> MSHIFT;
    if (e >= 1) rimLo = Math.min(rimLo, h); else inHi = Math.max(inHi, h);
    if (D[i] < R_TRACK) { tracks++; if (h !== TRACK_H || m === MAT.ground) badTrack++; }
    else if (m !== MAT.ground) badMat++;
    if (D[i] < R_TRACK + SHOULDER) eMax = Math.max(eMax, e);
  }
  ok(rimLo >= RIM_MIN && inHi <= LAND_MAX && rimLo - inHi >= 4 * (Wd.STEP / VS), `the rim stands at least ${rimLo} voxels, the floor at most ${inHi}: a wall of ${((rimLo - inHi) * VS).toFixed(1)} m against a ${Wd.STEP} m step`);
  ok(tracks > 30000 && !badTrack && !badMat, `the track is ${tracks} cells, every one at height ${TRACK_H} (flat over x, z and w) and marked; nothing off it is`);
  ok(eMax < 0.95, `the track and its shoulder lie inside the basin (out to ${eMax.toFixed(3)} of the way to the rim)`);
  // the rim fills the box's faces every way, so the world's wrap is never in reach
  let faces = true;
  for (let a = 0; a < X; a++) for (let b = 0; b < W; b++) if (Wd.height(H, a, 0, b) < RIM_MIN || Wd.height(H, a, Z - 1, b) < RIM_MIN || Wd.height(H, 0, a % Z, b) < RIM_MIN || Wd.height(H, X - 1, a % Z, b) < RIM_MIN) faces = false;
  for (let a = 0; a < X; a++) for (let b = 0; b < Z; b++) if (Wd.height(H, a, b, 0) < RIM_MIN || Wd.height(H, a, b, W - 1) < RIM_MIN) faces = false;
  ok(faces, "the rim covers all six faces of the world's box (both ways in x, z and w)");
  // the nearest-point query agrees with the distance field
  let worst = 0;
  for (let k = 0; k < 400; k++) { const i = (k * 104729) % H.length; if (D[i] === Infinity) continue; const g = cen(i), n = Wd.nearestTrack([g[0], 0, g[1], g[2]]); worst = Math.max(worst, Math.abs(n.d - D[i])); }
  ok(worst < 1e-6, `nearestTrack agrees with the carved distance field (worst ${worst.toExponential(1)} m)`);
}

/* every block holds its tallest column */
{
  const nb = DIM.map((v) => v / B); let good = true;
  for (let bw = 0; bw < nb[2] && good; bw++) for (let bz = 0; bz < nb[1]; bz++) for (let bx = 0; bx < nb[0]; bx++) {
    let m = 0; for (let w = 0; w < B; w++) for (let z = 0; z < B; z++) for (let x = 0; x < B; x++) m = Math.max(m, Wd.height(H, bx * B + x, bz * B + z, bw * B + w));
    if (M[bx + nb[0] * (bz + nb[1] * bw)] !== m) { good = false; break; }
  }
  ok(good, "every block's tallest column is its stored maximum");
}

/* the two-level march against brute force */
{
  let rs = 3; const rnd = () => ((rs = (Math.imul(rs, 1103515245) + 12345) >>> 0) / 4294967296);
  const brute = (ro, rd, far) => { for (let t = 0; t < far; t += 0.002) { const y = ro[1] + rd[1] * t; if (y <= Wd.height(H, Math.floor(ro[0] + rd[0] * t), Math.floor(ro[2] + rd[2] * t), Math.floor(ro[3] + rd[3] * t))) return t; } return null; };
  let agree = 0, n = 0, worst = 0, corners = 0, faces = true;
  for (let k = 0; k < 120; k++) {
    const ro = [20 + rnd() * 150, 30 + rnd() * 30, 20 + rnd() * 150, 6 + rnd() * 52];
    let rd = [rnd() - 0.5, -0.04 - rnd() * 0.5, rnd() - 0.5, (rnd() - 0.5) * 0.7];
    if (k % 10 === 5) { rd[0] = 0; rd[3] = 0; }
    const m = Math.hypot(...rd); rd = rd.map((v) => v / m);
    const a = Wd.march(H, M, ro, rd, 300), b = brute(ro, rd, 300); n++;
    // a hit the brute force's 0.002 step strides over (the ray just clipping a column's top corner) counts if it's real:
    // at the march's distance the ray is inside the cell it names, at or under that column's top
    const real = a && b !== null && a.t < b && (() => { const q = ro.map((v, j) => v + rd[j] * a.t); return [0, 2, 3].every((j, i) => q[j] >= a.cell[i] - 1e-6 && q[j] <= a.cell[i] + 1 + 1e-6) && q[1] <= Wd.height(H, ...a.cell) + 1e-6; })();
    if ((a === null) === (b === null) && (!a || Math.abs(a.t - b) <= 0.0025 || real)) agree++;
    else console.log("  ray", k, a && a.t, b);
    if (a && b && Math.abs(a.t - b) <= 0.0025) worst = Math.max(worst, Math.abs(a.t - b)); else if (real) corners++;
    if (a && a.n[0] * rd[0] + a.n[1] * rd[1] + a.n[2] * rd[2] + a.n[3] * rd[3] > 0) faces = false;
  }
  ok(agree === n, `the two-level march agrees with brute force on ${agree} of ${n} rays, to the brute force's step (worst ${worst.toFixed(4)} cells), and ${corners} column corner it strides over is a real hit`);
  ok(faces, "every face it reports is met from outside");
}

/* you can't get out. walk() moves in substeps of under a cell along each axis, x then z then w, each accepted only if
   it climbs no more than STEP above where the substep began. So from a cell, one substep reaches a neighbour (any of
   26, or itself) through a chain of single-axis moves, each landing no higher than STEP above the start. Flood that
   from the start: the set of cells you could ever stand on */
{
  const up = Math.round(Wd.STEP / VS), seen = new Uint8Array(H.length), q = new Int32Array(H.length);
  const s0 = Wd.start(H), c0 = idx(Math.floor(s0[0] / VS), Math.floor(s0[2] / VS), Math.floor(s0[3] / VS));
  let head = 0, tail = 0; q[tail++] = c0; seen[c0] = 1;
  const t1 = performance.now();
  while (head < tail) {
    const c = q[head++], x = c % X, z = Math.floor(c / X) % Z, w = Math.floor(c / (X * Z)), lim = (H[c] & HMASK) + up;
    for (let dx = -1; dx <= 1; dx++) {
      const x1 = x + dx; if (x1 < 0 || x1 >= X || (dx && (H[idx(x1, z, w)] & HMASK) > lim)) continue;
      for (let dz = -1; dz <= 1; dz++) {
        const z1 = z + dz; if (z1 < 0 || z1 >= Z || (dz && (H[idx(x1, z1, w)] & HMASK) > lim)) continue;
        for (let dw = -1; dw <= 1; dw++) {
          const w1 = w + dw; if (w1 < 0 || w1 >= W) continue;
          const j = idx(x1, z1, w1); if ((dw && (H[j] & HMASK) > lim) || seen[j]) continue;
          seen[j] = 1; q[tail++] = j;
        }
      }
    }
  }
  let rim = 0, trackMissed = 0;
  for (let i = 0; i < H.length; i++) { if (seen[i] && Wd.basinE(...cen(i)) >= 1) rim++; if (D[i] < R_TRACK && !seen[i]) trackMissed++; }
  ok(rim === 0, `from the start you can reach ${tail} cells, none of them the rim: the basin is closed (flood ${(performance.now() - t1).toFixed(0)} ms)`);
  ok(trackMissed === 0, "every cell of the track can be walked to");
  // (the flood stays off the box's edges, so the world's wrap, which the march and height() use, never matters to walking)
}

/* walking: never up more than a step, however fast; a cliff stops you and you slide; you settle at eye height */
{
  let rs = 9; const rnd = () => ((rs = (Math.imul(rs, 1103515245) + 12345) >>> 0) / 4294967296);
  let p = Wd.start(H), worstUp = 0, inside = true;
  for (let i = 0; i < 6000; i++) {
    const a = rnd() * 2 * Math.PI, b = (rnd() - 0.5) * 2, sp = i % 3 ? 4.2 : 30; // sometimes a vehicle's speed
    const v = [Math.cos(a) * sp, 0, Math.sin(a) * sp, b * sp * 0.6], g0 = Wd.groundAt(H, p), q = Wd.walk(H, p, v, 1 / 30);
    // a single call may take many substeps: check each substep's rule held by the end ground being reachable at all
    worstUp = Math.max(worstUp, i % 3 ? Wd.groundAt(H, q) - g0 : 0);
    if (Wd.basinE(...[0, 2, 3].map((j) => (Math.floor(q[j] / VS) + 0.5) * VS)) >= 1) inside = false; // the cell you're in (as the flood counts them)
    p = q;
  }
  ok(worstUp <= Wd.STEP + 1e-9, `walking 6000 steps never climbs more than ${Wd.STEP} m in one (most ${worstUp.toFixed(2)} m)`);
  ok(inside, "and even at 30 m/s, never leaves the basin");
  let q = Wd.start(H); for (let i = 0; i < 300; i++) q = Wd.walk(H, q, [0, 0, 0, 0], 1 / 60);
  ok(Math.abs(q[1] - (Wd.groundAt(H, q) + Wd.EYE)) < 1e-3, "standing still you settle at eye height");
  // straight at the rim from the start: you stop at it
  let r = Wd.start(H); for (let i = 0; i < 600; i++) r = Wd.walk(H, r, [6, 0, 0, 0], 1 / 30);
  ok(Wd.basinE(r[0], r[2], r[3]) < 1 && r[0] > 38, `walking straight at the rim stops you at it (x ${r[0].toFixed(1)} m)`);
  // the start is on the track, at its height
  const s = Wd.start(H);
  ok(Math.abs(Wd.groundAt(H, s) - TRACK_H * VS) < 1e-9 && Wd.nearestTrack(s).d < 0.05, "you start on the centreline, on the tarmac");
}

/* the shader's grid, blocks and height mask are world.js's */
{
  const src = fs.readFileSync(path.join(here, "../js/render.js"), "utf8"), nb = DIM.map((v) => v / B);
  ok(src.includes(`ivec3 DIM = ivec3(${DIM.join(", ")})`) && src.includes(`ivec3 NB = ivec3(${nb.join(", ")})`) && src.includes("floor(p / 8.0)") && B === 8 && src.includes(`& ${HMASK}u`) && src.includes(`>> ${MSHIFT}u`), "the shader's grid, blocks and cell layout are world.js's");
}

console.log(`\n${checks - fails}/${checks} checks passed`);
if (fails) process.exit(1);

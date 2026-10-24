/* IRIS⁴ selftest: the ground the page draws and walks on.
     node games/iris4/test/iris4.selftest.mjs
   The bows' physics is Lumen⁴'s, and checked there. */
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
const here = path.dirname(fileURLToPath(import.meta.url));
const Wd = await import(path.join(here, "../js/world.js"));

let checks = 0, fails = 0;
const ok = (c, msg) => { checks++; if (!c) { fails++; console.log("FAIL " + msg); } };
const { DIM, B } = Wd;

const H = Wd.terrain(1), H2 = Wd.terrain(1), M = Wd.blocks(H);
ok(H.every((v, i) => v === H2[i]), "the same seed makes the same land");
let lo = 255, hi = 0, water = 0; for (const v of H) { lo = Math.min(lo, v & 127); hi = Math.max(hi, v & 127); if (v & Wd.WATERBIT) water++; }
ok(lo >= Wd.WATER && hi <= 127 && water > 0.05 * H.length && water < 0.3 * H.length, `heights ${lo}–${hi} voxels, lakes ${(100 * water / H.length).toFixed(1)}% of the ground`);
// the world wraps: steps across each seam are no bigger than steps inside
const step = (a, b) => Math.abs(Wd.height(H, ...a) - Wd.height(H, ...b));
let seam = 0, inner = 0;
for (let i = 0; i < 400; i++) {
  const x = (i * 37) % DIM[0], z = (i * 53) % DIM[1], w = (i * 11) % DIM[2];
  seam = Math.max(seam, step([DIM[0] - 1, z, w], [0, z, w]), step([x, DIM[1] - 1, w], [x, 0, w]), step([x, z, DIM[2] - 1], [x, z, 0]));
  inner = Math.max(inner, step([x, z, w], [x + 1, z, w]), step([x, z, w], [x, z + 1, w]), step([x, z, w], [x, z, w + 1]));
}
ok(seam <= inner, `the land wraps in x, z and w with no seam (steepest step across a seam ${seam}, inside ${inner})`);
// every block holds its tallest column (the march skips blocks on it)
const nb = DIM.map((v) => v / B); let blockOK = true;
for (let bw = 0; bw < nb[2] && blockOK; bw++) for (let bz = 0; bz < nb[1]; bz++) for (let bx = 0; bx < nb[0]; bx++) {
  let m = 0; for (let w = 0; w < B; w++) for (let z = 0; z < B; z++) for (let x = 0; x < B; x++) m = Math.max(m, Wd.height(H, bx * B + x, bz * B + z, bw * B + w));
  if (M[bx + nb[0] * (bz + nb[1] * bw)] !== m) { blockOK = false; break; }
}
ok(blockOK, "every block's tallest column is its stored maximum");

// the two-level march against brute force: the same hit, at the same distance (to the brute force's step)
let rs = 3; const rnd = () => ((rs = (Math.imul(rs, 1103515245) + 12345) >>> 0) / 4294967296);
const brute = (ro, rd, far) => { for (let t = 0; t < far; t += 0.002) { const y = ro[1] + rd[1] * t; if (y <= Wd.height(H, Math.floor(ro[0] + rd[0] * t), Math.floor(ro[2] + rd[2] * t), Math.floor(ro[3] + rd[3] * t))) return t; } return null; };
let agree = 0, worst = 0, n = 0;
for (let k = 0; k < 120; k++) {
  const edge = k % 3 === 0; // some rays start by a seam, so they cross it
  const ro = [edge ? DIM[0] - rnd() * 3 : rnd() * DIM[0], 58 + rnd() * 10, edge ? DIM[1] - rnd() * 3 : rnd() * DIM[1], edge ? DIM[2] - rnd() * 2 : rnd() * DIM[2]];
  let rd = [rnd() - 0.5, -0.04 - rnd() * 0.5, rnd() - 0.5, (rnd() - 0.5) * 0.7];
  if (k % 10 === 5) { rd[0] = 0; rd[3] = 0; } // straight along an axis: the DDA's degenerate case
  const m = Math.hypot(...rd); rd = rd.map((v) => v / m);
  const a = Wd.march(H, M, ro, rd, 300), b = brute(ro, rd, 300); n++;
  if ((a === null) === (b === null) && (!a || Math.abs(a.t - b) <= 0.0025)) agree++;
  if (a && b) worst = Math.max(worst, Math.abs(a.t - b));
}
ok(agree === n, `the two-level march agrees with brute force on ${agree} of ${n} rays, across seams and along axes (worst ${worst.toFixed(4)} cells)`);
// the face it reports is the face the ray came through
let faces = true;
for (let k = 0; k < 60; k++) {
  const ro = [rnd() * DIM[0], 60, rnd() * DIM[1], rnd() * DIM[2]]; let rd = [rnd() - 0.5, -0.1 - rnd() * 0.4, rnd() - 0.5, rnd() - 0.5]; const m = Math.hypot(...rd); rd = rd.map((v) => v / m);
  const a = Wd.march(H, M, ro, rd, 300); if (!a) continue;
  if (a.n.reduce((s, v, i) => s + v * rd[i], 0) >= 0) faces = false; // a face is always met from outside
  const p = ro.map((v, i) => v + rd[i] * a.t);
  if (a.n[1] === 1 && Math.abs(p[1] - Wd.height(H, a.cell[0], a.cell[1], a.cell[2])) > 1e-6) faces = false; // a top is met at the column's top
}
ok(faces, "every face the march reports is met from outside, and a top at its column's height");

// walking
{
  const p0 = [24, 0, 24, 8]; p0[1] = Wd.groundAt(H, p0) + Wd.EYE;
  let p = p0.slice(), worstUp = 0, wrapped = true;
  for (let i = 0; i < 4000; i++) {
    const a = (i / 300) * 2 * Math.PI, v = [Math.cos(a) * 4.2, 0, Math.sin(a) * 4.2, Math.sin(a * 0.37) * 3];
    const g0 = Wd.groundAt(H, p), q = Wd.walk(H, p, v, 1 / 60); worstUp = Math.max(worstUp, Wd.groundAt(H, q) - g0);
    if (q.some((x, k) => k !== 1 && (x < 0 || x >= Wd.SIZE[k]))) wrapped = false;
    p = q;
  }
  ok(worstUp <= Wd.STEP + 1e-9 && wrapped, `walking 4000 steps: never up more than ${Wd.STEP} m at a time (most ${worstUp.toFixed(2)} m), always inside the wrapped world`);
  let q = p.slice(); for (let i = 0; i < 300; i++) q = Wd.walk(H, q, [0, 0, 0, 0], 1 / 60);
  ok(Math.abs(q[1] - (Wd.groundAt(H, q) + Wd.EYE)) < 1e-6, "standing still, your eye settles 1.7 m over the ground");
  // a cliff stops you and you slide along it: find a step up of more than STEP, walk into it diagonally
  let found = null;
  for (let x = 0; x < DIM[0] - 1 && !found; x++) for (let z = 0; z < DIM[1] && !found; z++) { const w = 8; if ((Wd.height(H, x + 1, z, w) - Wd.height(H, x, z, w)) * Wd.VS > Wd.STEP + 0.3 && Math.abs(Wd.height(H, x, z + 1, w) - Wd.height(H, x, z, w)) * Wd.VS <= Wd.STEP) found = [x, z, w]; }
  if (found) {
    const [x, z, w] = found, s = [(x + 0.9) * Wd.VS, 0, (z + 0.5) * Wd.VS, (w + 0.5) * Wd.VS]; s[1] = Wd.groundAt(H, s) + Wd.EYE;
    const t = Wd.walk(H, s, [3, 0, 3, 0], 0.05);
    ok(Math.floor(t[0] / Wd.VS) === x && t[2] > s[2], "into a cliff at an angle, you're stopped across it and slide along it");
  } else ok(false, "a cliff to walk into");
}

/* the other foams: Kelvin's (A₄*) and the 24-cell (D₄), walked facet to facet */
{
  const Dm = Wd.blocksDilated(M);
  for (const f of ["kelvin", "cell24"]) {
    const L = Wd.lattice(f);
    // the circumradius bounds every point's distance to its seed (the skip's margin depends on it)
    let far = 0; for (let i = 0; i < 3000; i++) { const p = [rnd() * 48, rnd() * 15, rnd() * 48, rnd() * 16], sd = Wd.nearestSeed(L, p); far = Math.max(far, Math.hypot(...p.map((v, k) => v - sd[k]))); }
    ok(far <= L.R, `${f}: no point is farther than the circumradius ${L.R.toFixed(3)} m from its seed (farthest ${far.toFixed(3)})`);
    // the march against brute force, rays in every direction including near-vertical (a long walk inside one block)
    const brute = (ro, rd, lim) => { for (let t = 0; t < lim; t += 0.002) { const p = ro.map((x, i) => x + rd[i] * t); if (p[1] <= Wd.WATER * Wd.VS && Wd.waterAt(H, p)) return t; if (Wd.solid(H, Wd.nearestSeed(L, p))) return t; } return null; };
    let agree = 0, n = 0, worst = 0, facesOK = true;
    for (let k = 0; k < 36; k++) {
      const ro = [rnd() * 48, 14 + rnd() * 4, rnd() * 48, rnd() * 16];
      let rd = k % 6 === 0 ? [0.04 * (rnd() - 0.5), -1, 0.04 * (rnd() - 0.5), 0] : [rnd() - 0.5, -0.12 - rnd() * 0.5, rnd() - 0.5, (rnd() - 0.5) * 0.6];
      const m = Math.hypot(...rd); rd = rd.map((v) => v / m);
      const a = Wd.marchFoam(H, Dm, L, ro, rd, 40), b = brute(ro, rd, 40); n++;
      if ((a === null) === (b === null) && (!a || Math.abs(a.t - b) <= 0.003)) agree++;
      if (a && b) worst = Math.max(worst, Math.abs(a.t - b));
      if (a && !a.water && a.n.reduce((t, v, i) => t + v * rd[i], 0) >= 0) facesOK = false;
    }
    ok(agree === n && facesOK, `${f}: the facet-to-facet march agrees with brute force on ${agree} of ${n} rays, near-vertical ones too (worst ${worst.toFixed(4)} m), every facet met from outside`);
    // the ground under you is the first ground straight down
    let gOK = true;
    for (let k = 0; k < 20; k++) {
      const p = [rnd() * 48, 0, rnd() * 48, rnd() * 16], g = Wd.groundFoam(H, Dm, L, p), y0 = 20;
      const b = brute([p[0], y0, p[2], p[3]], [0, -1, 0, 0], 25);
      if (b === null || Math.abs(y0 - b - g) > 0.003) gOK = false;
    }
    ok(gOK, `${f}: the ground under a point is the first solid cell (or lake) straight down`);
    // walking on it: never up more than a step
    let q = [24, 0, 24, 8]; q[1] = Wd.groundFoam(H, Dm, L, q) + Wd.EYE; let up = 0;
    const gnd = (x) => Wd.groundFoam(H, Dm, L, x);
    for (let i = 0; i < 600; i++) { const a = (i / 120) * 2 * Math.PI, g0 = gnd(q); q = Wd.walk(H, q, [Math.cos(a) * 4, 0, Math.sin(a) * 4, Math.cos(a * 0.4) * 2], 1 / 30, gnd, false); up = Math.max(up, gnd(q) - g0); }
    ok(up <= Wd.STEP + 1e-9, `${f}: walking on the foam never climbs more than a step at a time (most ${up.toFixed(2)} m)`);
  }
  // under a lake the foam lies a little deeper, so the water lies over it
  let lakeOK = true, seen = 0;
  for (let i = 0; i < 4000 && seen < 50; i++) { const s = [rnd() * 48, (Wd.WATER - 2) * Wd.VS, rnd() * 48, rnd() * 16]; if (Wd.waterAt(H, s)) { seen++; if (Wd.solid(H, s)) lakeOK = false; } }
  ok(lakeOK && seen > 0, "under a lake, nothing within two voxels of the surface is ground: the water is what you meet");
}

// the shader's march is world.js's: the same grid, the same blocks
{
  const src = fs.readFileSync(path.join(here, "../js/render.js"), "utf8");
  ok(src.includes(`ivec3 DIM = ivec3(${DIM.join(", ")})`) && src.includes(`ivec3 NB = ivec3(${nb.join(", ")})`) && src.includes("floor(p / 8.0)") && B === 8, "the shader's grid and blocks are world.js's");
}

console.log(fails ? `\n✗ ${fails} of ${checks} iris4 checks failed` : `iris4: ${checks} checks\n\n✓ iris4 selftest passed`);
process.exit(fails ? 1 : 0);

/* Lumen⁴ selftest: every number the page draws, checked against something independent of how it's computed:
   known constants, closed forms, the wave equation itself, and the relations between dimensions.
     node games/lumen4/test/lumen4.selftest.mjs */
import path from "node:path";
import { fileURLToPath } from "node:url";
const here = path.dirname(fileURLToPath(import.meta.url));
const O = await import(path.join(here, "../js/optics.js"));

let checks = 0, fails = 0;
const ok = (c, msg) => { checks++; if (!c) { fails++; console.log("FAIL " + msg); } };
const near = (a, b, tol) => Math.abs(a - b) <= tol * Math.max(1, Math.abs(b));
const DEG = Math.PI / 180;

/* 1 · falloff and the laser */
ok([[3, 0, 2], [3, 1, 1], [3, 2, 0], [4, 0, 3], [4, 1, 2], [4, 2, 1], [4, 3, 0]].every(([n, k, p]) => O.falloff(n, k) === p), "falloff: a k-dimensional source in n dimensions fades as r^−(n−k−1)");
{
  const w0 = 1, lam = 0.5, zR = O.rayleigh(w0, lam), slope = (n) => Math.log(O.beamOnAxis(2000 * zR, w0, lam, n) / O.beamOnAxis(1000 * zR, w0, lam, n)) / Math.log(2);
  ok(near(O.beamWidth(zR, w0, lam), Math.SQRT2 * w0, 1e-12) && near(O.beamOnAxis(zR, w0, lam, 3), 0.5, 1e-12) && near(O.beamOnAxis(zR, w0, lam, 4), 2 ** -1.5, 1e-12),
    "a beam is √2 wider at its Rayleigh range, and holds 1/2 of its on-axis light in 3D, 2^−3/2 in 4D");
  ok(near(slope(3), -2, 1e-5) && near(slope(4), -3, 1e-5), `far from its waist a laser fades like a point: slopes ${slope(3).toFixed(4)} and ${slope(4).toFixed(4)}`);
}

/* 2 · a flash: each field satisfies its own wave equation, u_tt = u_rr + (n − 1)/r u_r; the dimensions are related
   by u₄ = −(1/2πr) ∂_r u₂; and the 4D tail is the instant flash's wake times the pulse's area */
{
  const P = O.gauss(0.4), h = 0.02, N = 4000;
  const residual = (u, n, r, t) => {
    const utt = (u(r, t + h) - 2 * u(r, t) + u(r, t - h)) / (h * h), urr = (u(r + h, t) - 2 * u(r, t) + u(r - h, t)) / (h * h), ur = (u(r + h, t) - u(r - h, t)) / (2 * h);
    const scale = Math.abs(utt) + Math.abs(urr) + Math.abs(((n - 1) / r) * ur);
    return Math.abs(utt - urr - ((n - 1) / r) * ur) / scale;
  };
  const f3 = (r, t) => O.u3(r, t, P), f2 = (r, t) => O.u2(r, t, P, N), f4 = (r, t) => O.u4(r, t, P, N);
  const pts = [[4, 4.1], [4, 4.6], [6, 6.5], [6, 8], [10, 10.3]];
  const w3 = Math.max(...pts.map(([r, t]) => residual(f3, 3, r, t))), w2 = Math.max(...pts.map(([r, t]) => residual(f2, 2, r, t))), w4 = Math.max(...pts.map(([r, t]) => residual(f4, 4, r, t)));
  ok(w3 < 1e-3 && w2 < 2e-3 && w4 < 2e-3, `the fields satisfy the wave equation in 3, 2 and 4 dimensions (worst relative residuals ${w3.toExponential(1)}, ${w2.toExponential(1)}, ${w4.toExponential(1)})`);
  const peak = Math.max(...pts.map(([r, t]) => Math.abs(f4(r, t)))); // measured against the field's size, not at a zero crossing
  const rec = Math.max(...pts.map(([r, t]) => Math.abs(-(f2(r + h, t) - f2(r - h, t)) / (2 * h) / (2 * Math.PI * r) - f4(r, t)) / peak));
  ok(rec < 2e-3, `u₄ = −(1/2πr) ∂_r u₂: two dimensions up is a derivative away (worst ${rec.toExponential(1)})`);
  const r = 5, Q = O.gauss(0.3), tail = (t) => O.u4(r, t, Q, N) / (0.3 * Math.sqrt(2 * Math.PI) * O.wake4(r, t));
  ok(near(tail(30), 1, 0.01) && near(tail(60), 1, 0.003) && O.u4(r, 12, Q, N) < 0, `behind its front a 4D flash leaves a negative wake that matches −(t² − r²)^−3/2/4π² times the pulse's area (ratio ${tail(30).toFixed(4)} at t = 30, ${tail(60).toFixed(4)} at t = 60)`);
  ok(O.u3(r, 12, Q) < 1e-30, "behind its front a 3D flash leaves nothing (Huygens)");
}

/* 3 · a round hole */
{
  const Jint = (x) => { let s = 0; const M = 2000; for (let i = 0; i <= M; i++) { const t = (Math.PI * i) / M, w = i === 0 || i === M ? 1 : i % 2 ? 4 : 2; s += w * Math.cos(t - x * Math.sin(t)); } return (s * Math.PI) / (3 * M) / Math.PI; };
  const worst = Math.max(...[0.5, 2, 5, 7.9, 8.1, 12, 20].map((x) => Math.abs(O.J1(x) - Jint(x))));
  ok(worst < 2e-7, `J₁ agrees with its integral, (1/π)∫cos(τ − x sin τ)dτ (worst ${worst.toExponential(1)})`);
  ok(near(O.firstDark(3), 3.831705970, 1e-8) && near(O.firstDark(4), 4.493409458, 1e-8), `first dark rings: 3D at ${O.firstDark(3).toFixed(6)} (J₁'s zero), 4D at ${O.firstDark(4).toFixed(6)} (tan x = x)`);
  const ray = Math.max(...[1, 3.8317, 7, 10.17].map((x) => Math.abs(O.encircled(x, 3) - (1 - O.J0(x) ** 2 - O.J1(x) ** 2))));
  ok(ray < 2e-5, `3D's encircled light is Rayleigh's 1 − J₀² − J₁² (worst ${ray.toExponential(1)})`);
  ok(O.encircled(400, 3, 80000) > 0.997 && O.encircled(400, 4, 80000) > 0.997, "and both patterns' light adds up to the totals 2 and 3π/2 (so the screens' area elements are right)");
  ok(near(O.encircled(O.firstDark(3), 3), 0.8378, 1e-3) && near(O.encircled(O.firstDark(4), 4), 0.7896, 1e-3), "the central spot holds 83.8% of the light in 3D, 79.0% in 4D");
}

/* 4 · glare */
{
  const n = 1.5, f0 = O.fresnel(0, 1, n), b = O.brewster(1, n), fb = O.fresnel(b, 1, n), tir = O.fresnel(60 * DEG, 1.5, 1);
  ok(near(f0.Rs, ((n - 1) / (n + 1)) ** 2, 1e-12) && near(f0.Rp, f0.Rs, 1e-12), "head on, glass reflects ((n − 1)/(n + 1))² = 4%, the same for every polarization");
  ok(fb.Rp < 1e-20 && fb.Rs > 0.1, "at Brewster's angle the p reflection is gone and the s isn't");
  ok(tir.tir && tir.Rs === 1, "past the critical angle, inside glass, everything reflects");
  ok(near(O.reflectUnpolarized(b, 1, n, 3), fb.Rs / 2, 1e-12) && near(O.reflectUnpolarized(b, 1, n, 4), (2 * fb.Rs) / 3, 1e-12), "unpolarized light at Brewster's: R_s/2 in 3D, 2R_s/3 in 4D (two s directions)");
  ok(O.passUnpolarized(3, 1) === 0.5 && near(O.passUnpolarized(4, 1), 1 / 3, 1e-15) && near(O.passUnpolarized(4, 2), 2 / 3, 1e-15), "a polarizer passes 1/2 of unpolarized light in 3D; in 4D a line passes 1/3 and a plane 2/3");
}

/* 5 · hot things */
{
  ok(near(O.planckTotal(3), Math.PI ** 4 / 15, 1e-7) && near(O.planckTotal(4), 24 * 1.0369277551433699, 1e-7), "Planck's totals: π⁴/15 in 3D, 24ζ(5) in 4D");
  ok(near(O.wienX(3), 2.821439372, 1e-8) && near(O.wienX(4), 3.920690395, 1e-8) && near(O.wienX(5), 4.965114232, 1e-8), "Wien's x: 2.8214 and 3.9207 per frequency, 4.9651 per wavelength in 3D");
  ok(near(O.peakNm(5800, 3), 2.897771955e6 / 5800, 1e-6), `Wien's displacement law in 3D: ${O.peakNm(5800, 3).toFixed(1)} nm at 5800 K (b = 2.8978 mm·K)`);
  const power = (T, n) => { let s = 0; for (let l = 20; l <= 200000; l *= 1.002) s += O.planck(l, T, n) * l * Math.log(1.002); return s; };
  const r3 = power(6000, 3) / power(3000, 3), r4 = power(6000, 4) / power(3000, 4);
  ok(near(r3, 16, 1e-3) && near(r4, 32, 1e-3), `double the temperature: ${r3.toFixed(2)}× the light in 3D, ${r4.toFixed(2)}× in 4D (T⁴ and T⁵)`);
  const c3 = O.starColour(5800, 3), c4 = O.starColour(5800, 4);
  ok(c4[2] / c4[0] > c3[2] / c3[0] && c3[0] >= c3[2] && c4[2] >= c4[0], `a 5800 K body: warm white in 3D (${c3}), bluish white in 4D (${c4})`);
}

/* 6 · the rainbow */
{
  const th = O.rainbowAngle(1.333);
  ok(near(th / DEG, 42.03, 2e-3), `water (n = 1.333) bends its rainbow to ${(th / DEG).toFixed(2)}° from the antisolar point`);
  const red = O.rainbowAngle(O.waterN(700)), vio = O.rainbowAngle(O.waterN(400));
  ok(red > vio && near(red / DEG, 42.3, 0.01) && near(vio / DEG, 40.3, 0.01), "red outside (42.3°), violet inside (40.3°)");
  const red2 = O.rainbowAngle2(O.waterN(700)), vio2 = O.rainbowAngle2(O.waterN(400));
  // the least deviation after k reflections is where cos²i = (n² − 1)/(k(k + 2)): the closed form, against the search
  const closed = (n, k) => { const i = Math.acos(Math.sqrt((n * n - 1) / (k * (k + 2)))), r = Math.asin(Math.sin(i) / n), D = k * Math.PI + 2 * i - 2 * (k + 1) * r; return k === 1 ? Math.PI - D : D - Math.PI; };
  ok(near(O.rainbowAngle(1.333), closed(1.333, 1), 1e-7) && near(O.rainbowAngle2(1.333), closed(1.333, 2), 1e-7), `both bows match the closed form cos²i = (n² − 1)/(k(k + 2)): ${(closed(1.333, 1) / DEG).toFixed(2)}° and ${(closed(1.333, 2) / DEG).toFixed(2)}°`);
  ok(vio2 > red2 && red2 > red, `the secondary bow: ${(O.rainbowAngle2(1.333) / DEG).toFixed(2)}° for n = 1.333, colours reversed (red ${(red2 / DEG).toFixed(1)}° inside violet ${(vio2 / DEG).toFixed(1)}°), outside the primary`);
  const rho = (b) => O.rainbowInSlice(red, b * DEG);
  ok(near(rho(0), red, 1e-12) && rho(20) < rho(10) && rho(40) < rho(20) && rho(43) === null && O.rainbowInSlice(vio, 41 * DEG) === null && rho(41) !== null,
    "in your slice the bow is full size with the sun in it, shrinks as the sun leans into w, loses violet before red, and is gone past its angle");
  // the slice formula, against brute force: directions in the slice at the rainbow angle from a leaning antisolar point
  const b = 25 * DEG, a = [Math.cos(b), 0, 0, Math.sin(b)], want = rho(25); let worst = 0;
  for (let k = 0; k < 36; k++) { const ph = (k / 36) * 2 * Math.PI, d = [Math.cos(want), Math.sin(want) * Math.cos(ph), Math.sin(want) * Math.sin(ph), 0]; worst = Math.max(worst, Math.abs(Math.acos(d.reduce((s, v, i) => s + v * a[i], 0)) - red)); }
  ok(worst < 1e-12, "and every direction on that circle really is at the rainbow's angle from the leaning antisolar point");
}

/* 7 · the rainbow on a screen: a screen point (x, y) is the direction F + xR + yU, and the bow is where it makes the
   angle ρ with a_s = cos γ F + sin γ R: (cos γ + x sin γ)² = cos²ρ (1 + x² + y²), a quadratic, so a conic with
   x² coefficient A = sin²γ − cos²ρ and y² coefficient C = −cos²ρ: an ellipse if A < 0, a parabola if A = 0, a
   hyperbola if A > 0, and e² = 1 − A/C = sin²γ / cos²ρ */
{
  let worst = 0, types = true, ecc = 0, axes = 0;
  for (const rho of [42 * DEG, 30 * DEG, 12 * DEG]) for (const gam of [0, 15 * DEG, 40 * DEG, 60 * DEG, 80 * DEG]) {
    const c2 = Math.cos(rho) ** 2, A = Math.sin(gam) ** 2 - c2, C = -c2, pts = O.bowOnScreen(rho, gam, 720).filter(Boolean);
    for (const [x, y] of pts) worst = Math.max(worst, Math.abs((Math.cos(gam) + x * Math.sin(gam)) ** 2 - c2 * (1 + x * x + y * y)) / (1 + x * x + y * y));
    const t = O.conicType(rho, gam), want = Math.abs(A) < 1e-9 ? "parabola" : gam === 0 ? "circle" : A < 0 ? "ellipse" : "hyperbola";
    if (t !== want) types = false;
    ecc = Math.max(ecc, Math.abs(O.conicE(rho, gam) ** 2 - (1 - A / C)));
    if (A < 0 && gam > 0) { // measure the ellipse off its own points
      const xs = pts.map((q) => q[0]), ys = pts.map((q) => q[1]), a = (Math.max(...xs) - Math.min(...xs)) / 2, b = Math.max(...ys), e = Math.sqrt(1 - (b * b) / (a * a));
      axes = Math.max(axes, Math.abs(e - O.conicE(rho, gam)));
    }
  }
  ok(worst < 1e-12, `every point of the bow on the screen lies on the conic (cos γ + x sin γ)² = cos²ρ(1 + x² + y²) (worst ${worst.toExponential(1)})`);
  ok(types && ecc < 1e-12, "its type is the sign of sin²γ − cos²ρ, and its eccentricity sin γ / cos ρ");
  ok(axes < 2e-4, `measured off the drawn ellipses, the eccentricity agrees (worst ${axes.toExponential(1)})`);
  // the 4D morph: hold your gaze at 60°, lean the sun into w
  const th = O.rainbowAngle(O.waterN(700)), gam = 60 * DEG, seq = [];
  for (let b = 0; b <= 45; b += 0.25) { const r = O.rainbowInSlice(th, b * DEG); const t = r === null ? "none" : O.conicType(r, gam); if (seq[seq.length - 1] !== t) seq.push(t); }
  const bp = Math.acos(Math.cos(th) / Math.sin(gam)), rp = O.rainbowInSlice(th, bp);
  ok(seq.join(" → ") === "hyperbola → ellipse → none" && Math.abs(O.conicE(rp, gam) - 1) < 1e-9, `gaze held at 60°, the sun leaning into w turns the bow ${seq.join(" → ")}, through a parabola at β = ${(bp / DEG).toFixed(2)}°`);
}

/* who moved doesn't matter: only the antisolar direction in your own frame, a = (a_F, a_R, a_U, a_N). The bow is in
   your slice iff |a_N| ≤ sin θ, and its eccentricity on screen is √(a_R² + a_U²) / cos θ */
{
  const th = O.rainbowAngle(O.waterN(700)), c = Math.cos(th);
  let rs = 7; const rnd = () => ((rs = (Math.imul(rs, 1103515245) + 12345) >>> 0) / 4294967296);
  let eWorst = 0, onWorst = 0, exist = true;
  for (let k = 0; k < 300; k++) {
    const a = O.antisolarInFrame(rnd() * 1.2, rnd() * 1.4, (rnd() - 0.5) * 3, (rnd() - 0.5) * 2);
    // e from the conic's own quadratic form: eigenvalues of [[a_R² − c², a_R a_U], [a_R a_U, a_U² − c²]]
    const p = a[1] * a[1] - c * c, q = a[1] * a[2], r = a[2] * a[2] - c * c, tr = p + r, d = Math.sqrt(Math.max(0, (tr * tr) / 4 - (p * r - q * q))), l1 = tr / 2 + d, l2 = tr / 2 - d;
    if (O.bowExists(a, th)) eWorst = Math.max(eWorst, Math.abs(O.bowE(a, th) - Math.sqrt(1 - l1 / l2)));
    const pts = O.bowOnScreenA(a, th, 360);
    if (O.bowExists(a, th) !== pts.length > 0) exist = false;
    for (const pt of pts) if (pt) { const [x, y] = pt; onWorst = Math.max(onWorst, Math.abs((a[0] + a[1] * x + a[2] * y) ** 2 - c * c * (1 + x * x + y * y)) / (1 + x * x + y * y)); }
  }
  ok(exist && onWorst < 1e-12, `from 300 random frames, the bow is in your slice exactly when |a_N| ≤ sin θ, and every point drawn lies on its conic (worst ${onWorst.toExponential(1)})`);
  ok(eWorst < 1e-9, `its eccentricity is √(a_R² + a_U²) / cos θ, against the conic's own quadratic form (worst ${eWorst.toExponential(1)})`);
  // the sun leaning and you gazing across: the earlier (β, γ) form is a special case
  let same = 0; for (const b of [0, 10, 25, 35]) for (const gm of [0, 20, 50, 70]) { const r = O.rainbowInSlice(th, b * DEG); if (r !== null) same = Math.max(same, Math.abs(O.bowE(O.antisolarInFrame(b * DEG, gm * DEG, 0, 0), th) - O.conicE(r, gm * DEG))); }
  ok(same < 1e-12, "with only the sun's lean and your gaze, it's e = sin γ / cos ρ(β) again");
  // looking into w never changes the shape; turning and twisting do
  const base = [20 * DEG, 50 * DEG, 30 * DEG], es = [-30, -10, 0, 15, 30].map((et) => O.antisolarInFrame(...base, et * DEG)), e0 = O.bowE(es[0], th);
  const twisted = O.bowE(O.antisolarInFrame(20 * DEG, 50 * DEG, 60 * DEG, 0), th), turned = O.bowE(O.antisolarInFrame(20 * DEG, 30 * DEG, 30 * DEG, 0), th);
  ok(es.every((a) => Math.abs(O.bowE(a, th) - e0) < 1e-12) && new Set(es.map((a) => a[3].toFixed(6))).size === 5 && Math.abs(twisted - e0) > 0.01 && Math.abs(turned - e0) > 0.01,
    `looking into w moves a_N but keeps e = ${e0.toFixed(4)}; turning and twisting change it`);
}

console.log(fails ? `\n✗ ${fails} of ${checks} lumen4 checks failed` : `lumen4: ${checks} checks\n\n✓ lumen4 selftest passed`);
process.exit(fails ? 1 : 0);

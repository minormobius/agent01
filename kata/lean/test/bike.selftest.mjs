/* the autopilot bicycle's selftest: the calibration, both mechanisms, the geometry the shader draws.
     node kata/lean/test/bike.selftest.mjs */
import path from "node:path";
import { fileURLToPath } from "node:url";
const here = path.dirname(fileURLToPath(import.meta.url));
const Wd = await import(path.join(here, "../js/world.js")), Bk = await import(path.join(here, "../js/bike.js"));
let checks = 0, fails = 0;
const ok = (c, msg) => { checks++; if (!c) { fails++; console.log("FAIL " + msg); } else console.log("ok   " + msg); };
const add = (a, b, k = 1) => a.map((v, i) => v + k * b[i]), sc = (a, k) => a.map((v) => v * k), dot = (a, b) => a.reduce((s, v, i) => s + v * b[i], 0), len = (a) => Math.hypot(...a);
const Y = [0, 1, 0, 0], { V, G, BIKE } = Bk;

/* the calibration: in the frame turning with the bike, gravity and the centrifugal pull add to a = −gY − v²κN, and the
   bike's up must be straight against it, so nothing tips it about the contact line */
{
  let worst = 0, dirWorst = 0, maxPhi = 0, maxW = 0;
  for (const v of [2, 5, 8]) for (let k = 0; k < 200; k++) {
    const st = Bk.state((Wd.LAP * k) / 200, "two-axis", v, G), A = add(sc(Y, -G), st.N, -v * v * st.kappa);
    worst = Math.max(worst, len(add(st.u, sc(A, 1 / len(A)))), Math.abs(Math.tan(st.phi) - (v * v * st.kappa) / G));
    // the lean's direction across the ground is N, the bend's: the up tilts toward it and nowhere else
    const tilt = add(st.u, Y, -dot(st.u, Y)); dirWorst = Math.max(dirWorst, len(add(sc(tilt, 1 / len(tilt)), st.N, -1)));
    if (v === V) { maxPhi = Math.max(maxPhi, st.phi); maxW = Math.max(maxW, Math.abs(st.N[3])); }
  }
  ok(worst < 1e-12, `up balances gravity and the centripetal pull exactly, tan φ = v²κ/g at 2, 5 and 8 m/s (worst ${worst.toExponential(1)})`);
  ok(dirWorst < 1e-9, "the lean points along the bend's principal normal: a 2-vector across the ground, ana or kata as the curve goes");
  ok(maxPhi > 0.3 && maxPhi < 0.33 && maxW > 0.7, `at ${V} m/s the most it leans is ${(maxPhi * 180 / Math.PI).toFixed(1)}°, and some leans are mostly into w (|N_w| up to ${maxW.toFixed(2)})`);
  // our world as the check: where the bend has no w in it, the lean has none, and it's the textbook tan φ = v²/gR
  const st = Bk.state(0, "two-axis", V, G), R = 1 / st.kappa;
  ok(Math.abs(st.N[3]) < 1e-12 && Math.abs(st.u[3]) < 1e-12 && Math.abs(st.phi - Math.atan((V * V) / (G * R))) < 1e-12, `where the bend lies in our plane it's our bicycle: φ = atan(v²/gR) = ${(st.phi * 180 / Math.PI).toFixed(2)}° for R = ${R.toFixed(2)} m, nothing into w`);
}

/* the two mechanisms. The ground part of the frame's first lateral axis: two-axis carries the curve's non-twisting
   (Bishop) frame, whose derivative along s has no part in the other lateral axis; one-axis carries Frenet's N, which
   turns into B at τ. So the one-axis frame rolls at τ·v against the two-axis one */
{
  const h = 1e-4, ground = (st) => { const c = Math.cos(st.theta), s = Math.sin(st.theta); return { e1: add(sc(st.N, c), st.B, -s), e2: add(sc(st.N, s), st.B, c) }; };
  let twistA = 0, twistB = 0, rate = 0, frameA = 0;
  for (let k = 0; k < 120; k++) {
    const s = (Wd.LAP * (k + 0.37)) / 120, A0 = Bk.state(s - h), A1 = Bk.state(s + h), Am = Bk.state(s), g0 = ground(A0), g1 = ground(A1), gm = ground(Am);
    twistA = Math.max(twistA, Math.abs(dot(add(g1.e1, g0.e1, -1), gm.e2) / (2 * h)));
    const dN = dot(add(A1.N, A0.N, -1), Am.B) / (2 * h); twistB = Math.max(twistB, Math.abs(dN - Am.tau));
    const B1 = Bk.state(s, "one-axis", V); rate = Math.max(rate, Math.abs(B1.twistRate - Am.tau * V));
    // the two-axis frame's (a, b), unleaned, is that Bishop frame; the one-axis frame's a is N leaned
    const Np = add(sc(Am.N, Math.cos(Am.phi)), Y, -Math.sin(Am.phi));
    frameA = Math.max(frameA, len(add(add(sc(Am.a, Math.cos(Am.theta)), Am.b, Math.sin(Am.theta)), Np, -1)), len(add(B1.a, Np, -1)));
  }
  ok(twistA < 1e-3, `two-axis: the frame's lateral axes don't twist about the direction of travel (worst ${twistA.toExponential(1)} rad/m, the polyline's step in θ, under 1% of τ)`);
  ok(twistB < 1e-3 && rate < 1e-12, `one-axis: the frame's y follows N, which turns into B at τ, so the frame rolls at τv (worst ${twistB.toExponential(1)})`);
  ok(frameA < 1e-12, "and the lean sits at angle θ = ∫τ ds inside the two-axis frame, along y in the one-axis frame");
  // the holonomy, independently: carry a vector round the polyline by projecting it off each new tangent, and see how
  // far it has turned against Frenet's N when it comes home
  const T = (i) => { const p = Wd.PTS[i], q = Wd.PTS[(i + 1) % Wd.NS], d = [q[0] - p[0], q[1] - p[1], q[2] - p[2]]; return sc(d, 1 / len(d)); };
  const f0 = Wd.frenet(0); let e = [f0.N[0], f0.N[2], f0.N[3]];
  for (let i = 0; i < Wd.NS; i++) { const t = T(i); e = add(e, t, -dot(e, t)); e = sc(e, 1 / len(e)); }
  const n = [f0.N[0], f0.N[2], f0.N[3]], bn = [f0.Bn[0], f0.Bn[2], f0.Bn[3]], back = Math.atan2(-dot(e, bn), dot(e, n));
  ok(Math.abs(back - Bk.HOLONOMY) < 0.01, `round a lap the non-twisting frame comes home turned ${(Bk.HOLONOMY * 180 / Math.PI).toFixed(1)}° (∫τ ds), and a vector carried round the polyline agrees (${(back * 180 / Math.PI).toFixed(1)}°)`);
  const a0 = Bk.state(0), a1 = Bk.state(Wd.LAP);
  ok(Math.abs(a1.theta - a0.theta - Bk.HOLONOMY) < 1e-9, "laps add up: θ keeps each lap's holonomy");
}

/* steering and the geometry the shader draws */
{
  let steer = 0, front = 0, ground = 0, bound = 0, caps = 0;
  for (const mech of Bk.MECHS) for (let k = 0; k < 100; k++) {
    const st = Bk.state((Wd.LAP * k) / 100, mech), P = Bk.parts(st);
    steer = Math.max(steer, Math.abs(Math.tan(st.delta) * Math.cos(BIKE.LAMBDA) - BIKE.WB * st.kappa), Math.abs(dot(st.steer, st.T)), Math.abs(dot(st.steer, st.u)));
    front = Math.max(front, Wd.nearestTrack(st.front).d);
    // each tyre's lowest point: on the ground, to the tyre's own lean correction r(1 − cos φ)
    for (const w of P.tori) {
      let lo = Infinity; for (let i = 0; i < 720; i++) { const a = (2 * Math.PI * i) / 720, q = add(add(w.c, w.e1, Math.cos(a) * w.R), w.e2, Math.sin(a) * w.R); lo = Math.min(lo, q[1] - w.r); }
      ground = Math.max(ground, Math.abs(lo - Bk.GROUND_Y) - w.r * (1 - w.e2[1]) - 1e-6); // e2[1]: the cosine of the wheel's own lean
    }
    const m = Bk.middle(st);
    for (const c of P.caps) bound = Math.max(bound, len(add(c.a, m, -1)) + c.r, len(add(c.b, m, -1)) + c.r);
    for (const w of P.tori) bound = Math.max(bound, len(add(w.c, m, -1)) + w.R + w.r);
    caps = Math.max(caps, P.caps.length);
    // the rear tyre touches the track at the contact point
    if (Bk.sdf(P, st.p).d > 1e-3 + BIKE.TYRE * (1 - Math.cos(st.phi)) * 2) ground = 1;
  }
  ok(steer < 1e-12, "the steer is the kinematic δ = atan(wκ/cos λ), toward the bend, across the bike");
  ok(front < Wd.R_TRACK, `the front wheel stays on the track (at most ${front.toFixed(2)} m off the centreline)`);
  ok(ground < 1e-4, "both tyres rest on the track, to the tyre-width correction r(1 − cos φ)");
  ok(bound <= Bk.BOUND && caps <= 24, `the shader's bounding ball holds every part (out to ${bound.toFixed(2)} of ${Bk.BOUND} m), in ${caps} of its 24 capsules`);
}
console.log(`\n${checks - fails}/${checks} checks passed`);
if (fails) process.exit(1);

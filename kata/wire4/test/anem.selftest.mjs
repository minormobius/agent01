// The page's anemometer (js/anem.js) against strip4.py's numbers (README section 12).
import { nu, wire, misread } from "../js/anem.js";
let bad = 0; const ok = (c, m) => { console.log((c ? "  ok   " : "  FAIL ") + m); if (!c) bad++; }, near = (a, b, tol) => Math.abs(a / b - 1) < tol;
ok(near(nu(1), 2.2465, 2e-3) && near(nu(25), 4.2995, 2e-3) && near(nu(1e-5), 2, 1e-4), `the sphere's Nusselt number: ${nu(1).toFixed(4)} at Re 1, ${nu(25).toFixed(4)} at 25, 2 at rest`);
for (const [Re, P, s] of [[0.25, 2.6537, 0.812], [1, 2.8173, 0.816], [10, 3.8422, 0.836], [25, 4.7769, 0.85]]) { const r = wire({ R: 100, Lam: 3000, Re }).at(0.5); ok(near(r.P, P, 3e-3) && Math.abs(r.stream - s) < 0.004, `200-diameter wire, Re ${Re}: current squared ${r.P.toFixed(4)} (strip4.py ${P}), ${r.stream.toFixed(3)} of the heat to the stream`); }
{ const r = wire({ R: 5, Lam: 3000, Re: 100 }).at(0.5); ok(near(r.P, 120.0129, 3e-3) && r.stream < 0.07, `10-diameter wire: ${r.P.toFixed(2)}, ${(100 * (1 - r.stream)).toFixed(0)}% of the heat into the wall`); }
{ const w = wire({ R: 100, Lam: 3000, Re: 10 }); ok(near(w.runaway(), 10.744, 5e-3), `constant-current runaway at ${w.runaway().toFixed(3)}`); }
{ const m = misread({ R: 100, Lam: 3000, Re: 3, n: Infinity, tau: 0.5 }), m4 = misread({ R: 100, Lam: 3000, Re: 3, n: 4, tau: 0.5 }); ok(Math.abs(m - 0.498) < 0.01 && Math.abs(m4 - 0.808) < 0.01, `a plug flow read as developed gives ${m.toFixed(3)} of the flow rate, the n = 4 profile ${m4.toFixed(3)}`); }
if (bad) { console.log(`${bad} failed`); process.exit(1); } console.log("anem: all passed");

/* the gases chapter's numbers, as JSON, for tools/pages/genpages.py: node four/atom/tools/gasnumbers.mjs */
import * as G from "../js/gas.js";
import * as FF from "../js/forces.js";
import { PAIRS, RS } from "../js/pairs.js";
import { TABLE } from "../js/table.js";
import { RESPONSE } from "../js/response.js";
import { names } from "../js/names.js";
const KB = 3.166811563e-6, CM3 = 0.529177210903e-8 ** 3 * 6.02214076e23, N4 = names(TABLE, 4);
const rows = G.nobleGases({ FF, PAIRS, RS, TABLE, RESPONSE }).map(({ P, lattice, ...r }) => ({ ...r, name: r.d === 4 ? N4.get(r.Z).name : null,
  far: G.farShare(P.u, r.d, 3 * r.eps[1], P.opt, r.R, 1.5),
  jt3: G.jtNumerator(P.u, r.d, 3 * r.eps[1], P.opt) / (r.b0 * G.Cp(r.d)),
  b298: r.d === 3 ? [1 / FF.OVERBIND, 1].map((s) => G.B2((x) => s * P.u(x), 3, 298.15, { ...P.opt, tail: P.opt.tail.map((t) => ({ ...t, a: s * t.a })) }) * CM3) : null }));
const lj = (r) => 4 * KB * (r ** -12 - r ** -6), o = { rmin: 0.5, rmax: 12, tail: [{ a: 4 * KB, n: 6 }], h: 0.0005 };
console.log(JSON.stringify({ rows, argon: G.ARGON, lj: { boyle: G.boyle(lj, 3, o, 0.5, 100), inversion: G.inversion(lj, 3, o, 0.5, 100) }, KB }));

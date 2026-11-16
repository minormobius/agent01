/* The book's own opacity for ours against OPAL's (papers/p2 section 4): along Model S's present Sun, where both are
   evaluated at Model S's own T, ρ and X, and at Z = 0 and Z = 0.0143 (MIST's).
     node four/fusion/tools/kappacheck.mjs   → papers/p2/data/kappacheck.json (seconds)
   Columns: OPAL at Z and at 0 (atom/js/opal.js); the book's at Z (atom/js/surface.js with the Born–Elwert free–free and
   the metals' bound–free and free–free, atom/js/metals.js) and at 0; the book's metal-free gas with Gaunt factor 1; and
   the textbook law (mainseq.js kappaOurs, scattering + Kramers). The ratio that tests the metals is
   (book(Z) − book(0)) / (OPAL(Z) − OPAL(0)): the share of OPAL's metal opacity the book's ions supply without lines. */
import { readFileSync, writeFileSync } from "node:fs";
import { kappa } from "../../atom/js/opal.js";
import { kappaOurs } from "../../atom/js/mainseq.js";
import * as S from "../../atom/js/surface.js";

const m = JSON.parse(readFileSync(new URL("../../papers/p2/data/modelS.json", import.meta.url), "utf8")), Z = 0.0143, ws = new Map();
const wAt = (X) => { const k = Math.round(X * 50); if (!ws.has(k)) { const x = k / 50; ws.set(k, { met: S.world(3, { X: x, Y: 1 - x - Z, Z, gff: "elwert", metals: true }), free: S.world(3, { X: x, Y: 1 - x, Z: 0, gff: "elwert" }), g1: S.world(3, { X: x, Y: 1 - x, Z: 0 }) }); } return ws.get(k); };
const rows = m.prof.filter((p) => p.T > 3e5).map((p) => { const rho = p.rho * 1000, w = wAt(p.X), r = { r: p.x, T: p.T, rho: p.rho, X: p.X,
  opal: kappa(rho, p.T, p.X, Z), opal0: kappa(rho, p.T, p.X, 0), book: w.met.kappaR(p.T, rho), book0: w.free.kappaR(p.T, rho), book0g1: w.g1.kappaR(p.T, rho), kramers: kappaOurs({ X: p.X, Y: 1 - p.X - Z, Z })(rho, p.T) };
  r.metShare = (r.book - r.book0) / (r.opal - r.opal0); for (const k in r) r[k] = +(+r[k]).toPrecision(4); return r; });
const range = (k) => [Math.min(...rows.map((r) => r[k])), Math.max(...rows.map((r) => r[k]))].map((x) => +x.toPrecision(3));
const out = { about: "fusion/tools/kappacheck.mjs: the book's opacity for ours against OPAL's along Model S (its T, ρ, X; Z = 0.0143 and 0), κ in m²/kg. book: surface.js with the Born–Elwert free–free and the metals' bound–free and free–free from the book's ions (atom/js/metals.js, no lines); book0: the same metal-free; book0g1: metal-free with Gaunt factor 1; kramers: mainseq.js's textbook law. metShare = (book − book0)/(opal − opal0).", Z, rows,
  summary: { bookOverOpal: range("book") && [Math.min(...rows.map((r) => r.book / r.opal)), Math.max(...rows.map((r) => r.book / r.opal))].map((x) => +x.toFixed(3)), freeOverOpal0: [Math.min(...rows.map((r) => r.book0 / r.opal0)), Math.max(...rows.map((r) => r.book0 / r.opal0))].map((x) => +x.toFixed(3)),
    freeG1OverOpal0: [Math.min(...rows.map((r) => r.book0g1 / r.opal0)), Math.max(...rows.map((r) => r.book0g1 / r.opal0))].map((x) => +x.toFixed(3)), metShare: range("metShare"), kramersOverOpal: [Math.min(...rows.map((r) => r.kramers / r.opal)), Math.max(...rows.map((r) => r.kramers / r.opal))].map((x) => +x.toFixed(3)), rMax: Math.max(...rows.map((r) => r.r)) } };
writeFileSync(new URL("../../papers/p2/data/kappacheck.json", import.meta.url), JSON.stringify(out, null, 1));
console.log(JSON.stringify(out.summary)); console.log(`wrote papers/p2/data/kappacheck.json (${rows.length} points to r ${out.summary.rMax})`);

/* What metals do to a four-dimensional star's opacity (the 4D metals route; papers/p2): along the zero-age profile of
   each aged Sun analogue at one gravity (evolve.mjs four … -lp records), the Rosseland mean of the metal-free gas
   (surface.js, the same parts the structure carries) against the same gas holding a mass fraction Z of metals
   (metals.js prep4: the book's own 4D ions, Saha, the ion-sphere-bridged lowering, hydrogen-like bound–free, the ions'
   free–free), for two mixes:
     · the first generation's held ash: each analogue's own, as fusion/tools/ash4.mjs sums it (elements 4–23 it holds),
     · the rock row an exploding core makes (fusion/tools/yields4.mjs), as an even mix of elements 13–23 (declared: the
       explosion's shares say "rock row", not which element);
     · the heavy equilibrium band exploding cores actually return (papers/p2/data/nse4.json postDecay, elements 113–125),
       its ions from atom/js/iondata4h.js (ions3.mjs 4 113-125; non-relativistic), added to metals.js with addIons4.
   Z = 0.01 and 0.02. No lines (bound–bound), as for ours' book opacity, where they are about half a metal's share.
     node four/fusion/tools/metals4.mjs <dir of evolve-four-*-lp*.json> [G=1e-17]   → papers/p2/data/metals4.json */
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { world } from "../../atom/js/surface.js";

const args = process.argv.slice(2), dir = args.find((a) => !a.includes("=")), GSEL = +(Object.fromEntries(args.filter((a) => a.includes("=")).map((a) => a.split("="))).G ?? 1e-17);
const ASH = JSON.parse(readFileSync(new URL("../../papers/p2/data/ash4.json", import.meta.url), "utf8")).stars, ROCK = Object.fromEntries(Array.from({ length: 11 }, (_, i) => [13 + i, 1 / 11]));
import { prep, addIons4 } from "../../atom/js/metals.js";
import { IONS4H } from "../../atom/js/iondata4h.js";
addIons4(IONS4H);
const NSE = JSON.parse(readFileSync(new URL("../../papers/p2/data/nse4.json", import.meta.url), "utf8")).postDecay, BAND = (() => { const have = new Set(IONS4H.map((e) => e.Z)), o = Object.fromEntries(Object.entries(NSE).filter(([z]) => have.has(+z))), t = Object.values(o).reduce((a, v) => a + v, 0); return Object.fromEntries(Object.entries(o).map(([z, v]) => [z, v / t])); })();
// a guard: the 4D path's bound–free must be there. Pxygen in a 0.1 MK gas keeps most of its electrons, so its absorption
// just above an L edge has to exceed what free–free alone gives (a slip once dropped every edge and left free–free only)
{ const st = world(4, { X: 0.75, Y: 0.25 }).state(1e5, 1e13), bf = prep(st, 1e13, 0.02, 4, { 10: 1 }, { ff: false });
  if (!([30, 60, 120].some((w) => bf(w) > 0))) throw new Error("metals4: the 4D bound–free is zero: check atom/js/metals.js prep4"); }
const rows = [], seen = new Set();
for (const f of readdirSync(dir).filter((x) => /^evolve-four-.*-lp(\.ckpt)?\.json$/.test(x)).sort()) {
  const key = f.replace(".ckpt", ""), [, G, s, m] = key.match(/^evolve-four-([^-]+e-\d+)-([\d.]+)-([\d.]+)-lp\.json$/) ?? []; if (!G || +G !== GSEL || seen.has(key)) continue;
  const a = ASH.find((x) => x.G === +G && x.s === +s && Math.abs(x.m - +m) < 1e-3); if (!a) continue; // analogues and the ladder ash4 counts
  if (+G === 1e-17 && +s === 1.5152 && Math.abs(+m - 0.7812) > 0.01) continue; // the analogue only
  seen.add(key); const P = JSON.parse(readFileSync(`${dir}/${f}`, "utf8")).profiles?.[0]; if (!P) continue;
  const held = Object.fromEntries(Object.entries(a.made).filter(([z]) => +z >= 4 && +z <= 23)), hs = Object.values(held).reduce((t, v) => t + v, 0);
  const mixes = { held: hs > 1e-4 ? Object.fromEntries(Object.entries(held).map(([z, v]) => [z, v / hs])) : null, rock: ROCK, band: BAND };
  const pts = [0, 0.1, 0.3, 0.6, 0.9].map((q) => P.rows.reduce((p, r) => (Math.abs(r.q - q) < Math.abs(p.q - q) ? r : p)));
  for (const pt of pts) { const k0 = world(4, { X: 0.75, Y: 0.25 }).kappaR(pt.T, pt.rho), row = { s: +s, q: pt.q, T: pt.T, rho: pt.rho };
    for (const [name, mix] of Object.entries(mixes)) for (const Z of [0.01, 0.02]) row[`${name}${Z}`] = mix ? +(world(4, { X: 0.75 * (1 - Z), Y: 0.25 * (1 - Z), Z, metals: mix }).kappaR(pt.T, pt.rho) / k0).toFixed(4) : null;
    rows.push(row); }
  console.log(`s ${s}: held ${hs > 1e-4 ? Object.entries(mixes.held).sort((p, q) => q[1] - p[1]).slice(0, 3).map(([z, v]) => `${z} ${(100 * v).toFixed(0)}%`).join(", ") : "none"}`);
}
const span = (k) => { const v = rows.map((r) => r[k]).filter((x) => x != null); return [Math.min(...v), Math.max(...v)]; };
const out = { about: "fusion/tools/metals4.mjs: the 4D Rosseland opacity with a mass fraction Z of metals over the metal-free gas's, along each Sun analogue's zero-age profile (q 0–0.9), for each analogue's own held ash (ash4.json) and an even rock-row mix (13–23); metals.js prep4, no lines.", G: GSEL,
  summary: Object.fromEntries(["held0.01", "held0.02", "rock0.01", "rock0.02", "band0.01", "band0.02"].map((k) => [k, span(k)])), rows };
writeFileSync(new URL("../../papers/p2/data/metals4.json", import.meta.url), JSON.stringify(out, null, 1));
console.log(JSON.stringify(out.summary));

/* Paper 2, figure 3: gravity's window (data/gravity.json, fusion/tools/gravity4.mjs). Across G (× ours), for each
   strength s: (a) the year of a black, airless planet at 288 K round our Sun's analogue (the 4D star whose zero-age core
   halves its hydrogen as slowly as our zero-age Sun's), against ours computed the same way; (b) that star's surface
   temperature, each point coloured by what its centre burns its hydrogen to (as figures 1 and 2). The band is the G that
   an Earth-like planet of each candidate 4D rock needs. Writes gravity.svg beside it.
     node four/papers/p2/figures/gravity.mjs */
import { readFileSync, writeFileSync } from "node:fs";
const D = JSON.parse(readFileSync(new URL("../data/gravity.json", import.meta.url), "utf8"));
const COL = { "past helium": "#E69F00", helium: "#56B4E9", "helium-3": "#CC79A7" };
const SC = ["#0072B2", "#009E73", "#D55E00", "#CC79A7", "#56B4E9", "#E69F00", "#000000", "#8C7A00"]; // as figure 2
const S = [...new Set(D.runs.map((r) => r.s))].sort((a, b) => a - b), GS = [...new Set(D.runs.map((r) => r.G))].sort((a, b) => a - b);
const SUP = (n) => String(n).split("").map((c) => (c === "-" ? "⁻" : "⁰¹²³⁴⁵⁶⁷⁸⁹"[+c])).join("");
const W = 1040, H = 470, x0 = -23.5, x1 = -10.5, rockLo = Math.min(...D.rocks.map((r) => r.Grel)), rockHi = Math.max(...D.rocks.map((r) => r.Grel));
let s = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" font-family="system-ui, sans-serif" font-size="12"><rect width="${W}" height="${H}" fill="#fff"/>`;
function panel({ L, R, T, B, title, ylab, y0, y1, log, val, ref, refLab, ticks, kinds }) {
  const X = (g) => L + ((Math.log10(g) - x0) / (x1 - x0)) * (R - L), Y = (v) => B - (((log ? Math.log10(v) : v) - y0) / (y1 - y0)) * (B - T);
  s += `<text x="${L}" y="${T - 14}" font-weight="600">${title}</text>`;
  // the rock band
  s += `<rect x="${X(rockLo)}" y="${T}" width="${X(rockHi) - X(rockLo)}" height="${B - T}" fill="#8a7a5a" opacity="0.16"/>`;
  D.rocks.forEach((r, i) => (s += `<line x1="${X(r.Grel)}" x2="${X(r.Grel)}" y1="${T}" y2="${B}" stroke="#8a7a5a" stroke-width="0.8" stroke-dasharray="3 2"><title>${r.name}: ρ₄ ${r.rho4.toExponential(2)} kg/m⁴ → G ${r.Grel.toExponential(2)} × ours</title></line>`));
  s += `<text x="${(X(rockLo) + X(rockHi)) / 2}" y="${T + 12}" text-anchor="middle" font-size="10" fill="#5a4a2a">rock</text>`;
  if (ref != null) s += `<line x1="${L}" x2="${R}" y1="${Y(ref)}" y2="${Y(ref)}" stroke="#888" stroke-dasharray="6 3"/><text x="${L + 6}" y="${Y(ref) - 4}" font-size="10" fill="#555">${refLab}</text>`;
  S.forEach((sv, i) => { const pts = GS.map((g) => D.runs.find((r) => r.G === g && r.s === sv)).filter((r) => r?.sun && Number.isFinite(val(r.sun)));
    if (pts.length > 1) s += `<polyline fill="none" stroke="${SC[i]}" stroke-width="1.6" points="${pts.map((r) => `${X(r.G).toFixed(1)},${Y(val(r.sun)).toFixed(1)}`).join(" ")}"/>`;
    for (const r of pts) { const tip = `G ${r.G}, s ${sv}: ${r.sun.m.toFixed(2)} M_Ch, Teff ${r.sun.Teff.toFixed(0)} K, centre ${(r.sun.Tc / 1e6).toFixed(1)} MK → ${r.sun.kind}; 288 K planet's year ${r.sun.yearYr.toPrecision(3)} yr`;
      s += kinds ? `<circle cx="${X(r.G).toFixed(1)}" cy="${Y(val(r.sun)).toFixed(1)}" r="3.6" fill="${COL[r.sun.kind] ?? "#bbb"}" stroke="${SC[i]}" stroke-width="1"><title>${tip}</title></circle>`
        : `<circle cx="${X(r.G).toFixed(1)}" cy="${Y(val(r.sun)).toFixed(1)}" r="2.4" fill="${SC[i]}"><title>${tip}</title></circle>`; } });
  s += `<line x1="${L}" y1="${B}" x2="${R}" y2="${B}" stroke="#333"/><line x1="${L}" y1="${B}" x2="${L}" y2="${T}" stroke="#333"/>`;
  for (let e = -23; e <= -11; e += 2) s += `<text x="${X(10 ** e)}" y="${B + 16}" text-anchor="middle">10${SUP(e)}</text>`;
  for (const t of ticks) s += `<text x="${L - 6}" y="${Y(t.v) + 4}" text-anchor="end">${t.l}</text><line x1="${L - 3}" x2="${L}" y1="${Y(t.v)}" y2="${Y(t.v)}" stroke="#333"/>`;
  s += `<text x="${(L + R) / 2}" y="${B + 34}" text-anchor="middle">G (× ours)</text><text x="${L - 46}" y="${(T + B) / 2}" text-anchor="middle" transform="rotate(-90 ${L - 46} ${(T + B) / 2})">${ylab}</text>`;
}
const o = D.ours;
panel({ L: 70, R: 470, T: 34, B: 380, title: "(a) the year of a 288 K planet round our Sun's analogue", ylab: "year (Earth years)", y0: -4, y1: 2, log: true, val: (x) => x.yearYr,
  ref: o.yearYr, refLab: `ours computed the same way: ${o.yearYr.toFixed(2)} yr`, ticks: [-4, -3, -2, -1, 0, 1, 2].map((e) => ({ v: 10 ** e, l: `10${SUP(e)}` })) });
panel({ L: 590, R: 990, T: 34, B: 380, title: "(b) its surface temperature, and what its centre makes", ylab: "surface temperature (K)", y0: 0, y1: 36000, log: false, val: (x) => x.Teff,
  ref: o.Teff, refLab: `our zero-age Sun: ${o.Teff.toFixed(0)} K`, ticks: [0, 10000, 20000, 30000].map((v) => ({ v, l: v.toLocaleString("en") })), kinds: true });
S.forEach((sv, i) => { const lx = 80 + (i % 4) * 100, ly = 428 + Math.floor(i / 4) * 14; s += `<line x1="${lx}" x2="${lx + 16}" y1="${ly - 4}" y2="${ly - 4}" stroke="${SC[i]}" stroke-width="2"/><text x="${lx + 20}" y="${ly}" font-size="10">s ${sv}</text>`; });
let lx = 600; for (const [k, c] of Object.entries(COL)) { s += `<circle cx="${lx}" cy="${424}" r="5" fill="${c}" stroke="#333" stroke-width="0.6"/><text x="${lx + 9}" y="${428}" font-size="10">${k}</text>`; lx += 100; }
s += `<text x="600" y="${446}" font-size="10" fill="#555">band: the G an Earth-like planet of each candidate 4D rock needs (${D.rocks.map((r) => r.key).join(", ")})</text>`;
s += `</svg>`; writeFileSync(new URL("./gravity.svg", import.meta.url), s); console.log("wrote gravity.svg");

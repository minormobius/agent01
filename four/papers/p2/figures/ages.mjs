/* Paper 2, the status page's figure: the four-dimensional Sun analogues aged (data/ages4.json, fusion/tools/ages4.mjs)
   and what they hold (data/ash4.json, fusion/tools/ash4.mjs). Horizontal: the nucleon force's strength s; vertical: the
   aged time for the centre to burn half its hydrogen (log); a line per gravity. Each point is filled by the share of the
   star's mass past helium when its run ends (white none, dark 30%); a ring marks a run that stops in the stall. The
   dashed line is the 4.6 Gyr section 3's convention gave every analogue. Writes ages.svg beside it.
     node four/papers/p2/figures/ages.mjs */
import { readFileSync, writeFileSync } from "node:fs";
const A = JSON.parse(readFileSync(new URL("../data/ages4.json", import.meta.url), "utf8")), H = JSON.parse(readFileSync(new URL("../data/ash4.json", import.meta.url), "utf8"));
// the analogues: the star at each (G, s) whose mass is gravity.json's Sun analogue (the G 1e-17 mass ladders are not)
const SUNS = JSON.parse(readFileSync(new URL("../data/gravity.json", import.meta.url), "utf8")).runs.filter((r) => r.sun);
const analog = (x) => SUNS.some((r) => r.G === x.G && r.s === x.s && Math.abs(x.m / r.sun.m - 1) < 0.01);
const stars = A.stars.filter(analog), GS = [...new Set(stars.map((x) => x.G))].sort((a, b) => b - a), S = [...new Set(stars.map((x) => x.s))].sort((a, b) => a - b);
const GC = ["#D55E00", "#E69F00", "#009E73", "#0072B2"], W = 760, Ht = 440, L = 70, R = 600, T = 40, B = 380;
const x0 = 1.5, x1 = 1.87, y0 = Math.log10(1.5), y1 = Math.log10(300);
const X = (s) => L + ((s - x0) / (x1 - x0)) * (R - L), Y = (t) => B - ((Math.log10(t) - y0) / (y1 - y0)) * (B - T);
const shade = (f) => { const v = Math.round(255 - Math.min(1, f / 0.3) * 215); return `rgb(${v},${v},${v})`; };
const sup = (e) => String(e).replace("-", "−").split("").map((c) => "⁰¹²³⁴⁵⁶⁷⁸⁹"["0123456789".indexOf(c)] ?? (c === "−" ? "⁻" : c)).join("");
let s = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${Ht}" font-family="system-ui, sans-serif" font-size="12"><rect width="${W}" height="${Ht}" fill="#fff"/>`;
s += `<text x="${L}" y="${T - 18}" font-weight="600">Four-dimensional Sun analogues, aged: how long the centre takes to burn half its hydrogen</text>`;
for (const t of [2, 5, 10, 20, 50, 100, 200]) s += `<line x1="${L}" x2="${R}" y1="${Y(t)}" y2="${Y(t)}" stroke="#eee"/><text x="${L - 6}" y="${Y(t) + 4}" text-anchor="end" fill="#555">${t}</text>`;
s += `<line x1="${L}" x2="${R}" y1="${Y(4.6)}" y2="${Y(4.6)}" stroke="#888" stroke-dasharray="5 4"/><text x="${R - 4}" y="${Y(4.6) - 5}" text-anchor="end" fill="#666">4.6 Gyr: section 3's convention</text>`;
for (const sv of S) s += `<text x="${X(sv)}" y="${B + 16}" text-anchor="middle" fill="#555">${sv}</text>`;
s += `<text x="${(L + R) / 2}" y="${B + 34}" text-anchor="middle">strength of the nucleon force, s (1.5152 nearest ours)</text>`;
s += `<text transform="translate(${L - 44},${(T + B) / 2}) rotate(-90)" text-anchor="middle">Gyr to half the central hydrogen</text>`;
s += `<line x1="${L}" x2="${L}" y1="${T}" y2="${B}" stroke="#333"/><line x1="${L}" x2="${R}" y1="${B}" y2="${B}" stroke="#333"/>`;
GS.forEach((g, i) => { const pts = stars.filter((x) => x.G === g).sort((a, b) => a.s - b.s), col = GC[i % GC.length];
  const path = pts.filter((x) => x.half).map((x) => `${X(x.s).toFixed(1)},${Y(x.half).toFixed(1)}`); if (path.length > 1) s += `<polyline points="${path.join(" ")}" fill="none" stroke="${col}" stroke-width="1.6"/>`;
  for (const x of pts) { const h = H.stars.find((y) => y.G === x.G && y.s === x.s && Math.abs(y.m - x.m) < 1e-3), f = h?.heavyShare ?? 0, t = x.half ?? null, cy = t ? Y(t) : Y(x.lastGyr);
    if (!t) { s += `<text x="${X(x.s) + 8}" y="${cy + 4}" fill="${col}" font-size="11">stops at ${x.lastGyr} Gyr, ${(100 * x.stall?.short).toFixed(1)}% short</text>`; }
    s += `<circle cx="${X(x.s).toFixed(1)}" cy="${cy.toFixed(1)}" r="6" fill="${shade(f)}" stroke="${col}" stroke-width="2"/>`;
    if (x.stall) s += `<circle cx="${X(x.s).toFixed(1)}" cy="${cy.toFixed(1)}" r="10" fill="none" stroke="#000" stroke-width="1" stroke-dasharray="2 2"/>`; }
  s += `<line x1="${R + 22}" x2="${R + 44}" y1="${T + 10 + 20 * i}" y2="${T + 10 + 20 * i}" stroke="${col}" stroke-width="2"/><text x="${R + 50}" y="${T + 14 + 20 * i}">G = 10${sup(Math.round(Math.log10(g)))} × ours</text>`; });
const ly = T + 110; s += `<text x="${R + 22}" y="${ly}" font-weight="600">past helium</text>`;
[0, 0.1, 0.2, 0.3].forEach((f, i) => { s += `<circle cx="${R + 30}" cy="${ly + 18 + 20 * i}" r="6" fill="${shade(f)}" stroke="#444"/><text x="${R + 44}" y="${ly + 22 + 20 * i}">${Math.round(100 * f)}% of the star</text>`; });
s += `<circle cx="${R + 30}" cy="${ly + 108}" r="10" fill="none" stroke="#000" stroke-dasharray="2 2"/><text x="${R + 44}" y="${ly + 112}">stops in the stall</text>`;
s += `</svg>\n`;
writeFileSync(new URL("ages.svg", import.meta.url), s);
console.log(`wrote figures/ages.svg (${stars.length} analogues)`);

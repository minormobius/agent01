/* Paper 2, figure 2: window C, stars that live (data/lifetimes.json, fusion/tools/lifetimes4.mjs). (a) each star's core
   hydrogen half-life at fixed central T, ρ against its mass, at one gravity, a line per strength s (the adopted mass
   model solid, Brink's grid dashed where it differs), with our zero-age Sun's own value (the analogue's line) and 4.6
   Gyr. (b) the gravity × strength plane: our Sun's analogue at each, coloured by what its own centre burns to (as figure
   1), split where the mass models disagree, with its central temperature. Writes lifetimes.svg beside it.
     node four/papers/p2/figures/lifetimes.mjs [G for panel a, default 1e-17] */
import { readFileSync, writeFileSync } from "node:fs";
const D = JSON.parse(readFileSync(new URL("../data/lifetimes.json", import.meta.url), "utf8")), GA = +(process.argv[2] ?? 1e-17);
const COL = { "past helium": "#E69F00", helium: "#56B4E9", "helium-3": "#CC79A7", unburnt: "#bbbbbb", mixed: "#999999" };
const S = [...new Set(D.runs.map((r) => r.s))].sort((a, b) => a - b), GS = [...new Set(D.runs.map((r) => r.G))].sort((a, b) => b - a);
const SC = ["#0072B2", "#009E73", "#D55E00", "#CC79A7", "#56B4E9", "#E69F00", "#000000", "#8C7A00"]; // a strength's line colour
const W = 980, H = 470, sunT = D.ours?.thGyr ?? 11.1;
let s = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" font-family="system-ui, sans-serif" font-size="12"><rect width="${W}" height="${H}" fill="#fff"/>`;
// (a) t½ against M at G = GA
{ const L = 60, R = 470, T = 34, B = 400, x0 = Math.log10(0.13), x1 = Math.log10(5), y0 = -3, y1 = 5;
  const X = (m) => L + ((Math.log10(m) - x0) / (x1 - x0)) * (R - L), Y = (t) => B - ((Math.log10(t) - y0) / (y1 - y0)) * (B - T);
  s += `<text x="${L}" y="${T - 14}" font-weight="600">(a) how long a core takes to burn half its hydrogen, G = ${GA} × ours</text>`;
  for (const t of [4.6, sunT]) s += `<line x1="${L}" x2="${R}" y1="${Y(t)}" y2="${Y(t)}" stroke="#888" stroke-dasharray="${t === 4.6 ? "2 3" : "6 3"}"/><text x="${R - 4}" y="${Y(t) - 4}" text-anchor="end" font-size="10" fill="#555">${t === 4.6 ? "4.6 Gyr" : `${sunT.toFixed(1)} Gyr: our zero-age Sun's core`}</text>`;
  S.forEach((sv, i) => { for (const mass of ["ladder", "grid"]) { const r = D.runs.find((q) => q.G === GA && q.s === sv && q.mass === mass); if (!r?.stars) continue;
      const pts = r.stars.filter((x) => x.thGyr != null && x.thGyr > 10 ** y0 && x.thGyr < 10 ** y1).map((x) => `${X(x.m).toFixed(1)},${Y(x.thGyr).toFixed(1)}`); if (pts.length < 2) continue;
      s += `<polyline fill="none" stroke="${SC[i]}" stroke-width="${mass === "ladder" ? 2 : 1.5}" ${mass === "grid" ? 'stroke-dasharray="5 3"' : ""} points="${pts.join(" ")}"><title>s ${sv}, ${mass} masses</title></polyline>`; } });
  s += `<line x1="${L}" y1="${B}" x2="${R}" y2="${B}" stroke="#333"/><line x1="${L}" y1="${B}" x2="${L}" y2="${T}" stroke="#333"/>`;
  for (const m of [0.2, 0.5, 1, 2, 5]) s += `<text x="${X(m)}" y="${B + 16}" text-anchor="middle">${m}</text>`;
  for (let e = y0; e <= y1; e += 2) s += `<text x="${L - 6}" y="${Y(10 ** e) + 4}" text-anchor="end">10${e < 0 ? "⁻" : ""}${"⁰¹²³⁴⁵⁶⁷⁸⁹"[Math.abs(e)]}</text>`;
  s += `<text x="${(L + R) / 2}" y="${B + 34}" text-anchor="middle">the star's mass (Chandrasekhar masses)</text><text x="16" y="${(T + B) / 2}" text-anchor="middle" transform="rotate(-90 16 ${(T + B) / 2})">core half-life (Gyr)</text>`;
  S.forEach((sv, i) => { const lx = L + 8 + (i % 4) * 100, ly = B + 52 + Math.floor(i / 4) * 14; s += `<line x1="${lx}" x2="${lx + 16}" y1="${ly - 4}" y2="${ly - 4}" stroke="${SC[i]}" stroke-width="2"/><text x="${lx + 20}" y="${ly}" font-size="10">s ${sv}</text>`; });
  s += `<text x="${R}" y="${B + 80}" text-anchor="end" font-size="10" fill="#555">dashed: Brink's grid masses, where they differ</text>`; }
// (b) G × s: our Sun's analogue
{ const L = 580, R = 900, T = 34, B = 400, X = (i) => L + ((i + 0.5) / S.length) * (R - L), Y = (j) => T + ((j + 0.5) / GS.length) * (B - T);
  s += `<text x="${L - 40}" y="${T - 14}" font-weight="600">(b) our Sun's analogue: what its centre burns to</text>`;
  const half = (cx, cy, r, side, fill) => `<path d="M ${cx} ${cy - r} A ${r} ${r} 0 0 ${side < 0 ? 0 : 1} ${cx} ${cy + r} Z" fill="${fill}" stroke="#333" stroke-width="0.6"/>`;
  GS.forEach((g, j) => { s += `<text x="${L - 8}" y="${Y(j) + 4}" text-anchor="end">10${"⁻"}${String(-Math.log10(g)).split("").map((c) => "⁰¹²³⁴⁵⁶⁷⁸⁹"[+c]).join("")}</text>`;
    S.forEach((sv, i) => { const a = D.runs.find((q) => q.G === g && q.s === sv && q.mass === "ladder"), b = D.runs.find((q) => q.G === g && q.s === sv && q.mass === "grid"), cx = X(i), cy = Y(j);
      const ka = a?.sun?.burn?.kind, kb = b?.sun?.burn?.kind, ta = a?.sun ? (a.sun.Tc / 1e6).toFixed(0) : null, tb = b?.sun ? (b.sun.Tc / 1e6).toFixed(0) : null;
      const tip = `G ${g}, s ${sv}: ${a?.sun ? `${a.sun.m.toFixed(2)} M_Ch, ${ta} MK, ${ka}` : a?.fail ? `no sequence (${a.fail})` : "no star in 0.13–5 M_Ch reaches the pace"}${b ? `; grid: ${b.sun ? `${b.sun.m.toFixed(2)} M_Ch, ${tb} MK, ${kb}` : "none"}` : ""}`;
      if (!ka) { s += `<circle cx="${cx}" cy="${cy}" r="7" fill="none" stroke="#999" stroke-dasharray="2 2"><title>${tip}</title></circle>`; return; }
      if (kb && kb !== ka) s += `<g><title>${tip}</title>${half(cx, cy, 8, -1, COL[ka])}${half(cx, cy, 8, 1, COL[kb])}</g><text x="${cx}" y="${cy - 12}" text-anchor="middle" font-size="9">${ta}|${tb}</text>`;
      else s += `<circle cx="${cx}" cy="${cy}" r="8" fill="${COL[ka]}" stroke="#333" stroke-width="0.6"><title>${tip}</title></circle><text x="${cx}" y="${cy - 12}" text-anchor="middle" font-size="9">${ta}</text>`; }); });
  S.forEach((sv, i) => (s += `<text x="${X(i)}" y="${B + 4}" text-anchor="end" font-size="10" transform="rotate(-45 ${X(i)} ${B + 4})">${sv}</text>`));
  s += `<text x="${(L + R) / 2}" y="${B + 44}" text-anchor="middle">strength s</text><text x="${L - 44}" y="${(T + B) / 2}" text-anchor="middle" transform="rotate(-90 ${L - 44} ${(T + B) / 2})">G (× ours)</text>`;
  let ly = T + 6; for (const [k, c] of Object.entries(COL).slice(0, 3)) { s += `<circle cx="${R + 18}" cy="${ly}" r="6" fill="${c}" stroke="#333" stroke-width="0.6"/><text x="${R + 28}" y="${ly + 4}" font-size="10">${k}</text>`; ly += 18; }
  s += `<circle cx="${R + 18}" cy="${ly}" r="6" fill="none" stroke="#999" stroke-dasharray="2 2"/><text x="${R + 28}" y="${ly + 4}" font-size="10">none</text>`; ly += 18;
  s += `<text x="${R + 12}" y="${ly + 4}" font-size="9" fill="#555">numbers: MK</text>`; }
s += `</svg>`; writeFileSync(new URL("./lifetimes.svg", import.meta.url), s); console.log("wrote lifetimes.svg");

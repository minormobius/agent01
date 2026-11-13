/* Paper 2, figure 1: the strong–weak plane (data/windows.json, tools/windows4.mjs). x the strong force's strength s,
   y log₁₀ G₄ over G_F/M_W. Shaded where p + p makes no deuteron; lines where the first minutes leave half the hydrogen,
   one per clock (above a line, more than half survives); points where the network ran, coloured by what a Sun-paced
   core's hydrogen burning makes, with the core's temperature; where the second mass model (burnAlt) makes something
   else, the point is split, the default model's outcome on the left and the other's on the right. Writes windows.svg.
     node four/papers/p2/figures/windows.mjs */
import { readFileSync, writeFileSync } from "node:fs";
const D = JSON.parse(readFileSync(new URL("../data/windows.json", import.meta.url), "utf8"));
const W = 760, H = 520, L = 70, R = 170, T = 30, B = 60, x0 = 1.40, x1 = 1.90, y0 = 3, y1 = 7;
const X = (s) => L + ((s - x0) / (x1 - x0)) * (W - L - R), Y = (g) => H - B - ((g - y0) / (y1 - y0)) * (H - T - B);
const COL = { "past helium": "#E69F00", helium: "#56B4E9", "helium-3": "#CC79A7", mixed: "#999999" }, CLK = ["#0072B2", "#009E73", "#000000", "#D55E00", "#8C7A00"];
let s = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" font-family="system-ui, sans-serif" font-size="12"><rect width="${W}" height="${H}" fill="#fff"/>`;
// p + p closed (B_d < m_n − m_p + m_e)
const sOpen = D.S.find((v) => D.Bd[v] > D.PP_MIN);
s += `<rect x="${X(x0)}" y="${Y(y1)}" width="${X(sOpen) - X(x0)}" height="${Y(y0) - Y(y1)}" fill="#ddd"/><text x="${(X(x0) + X(sOpen)) / 2}" y="${Y(6.6)}" text-anchor="middle" fill="#555" transform="rotate(-90 ${(X(x0) + X(sOpen)) / 2} ${Y(6.6)})">p + p makes no deuteron</text>`;
s += `<line x1="${X(D.S_DIPROTON)}" y1="${Y(y0)}" x2="${X(D.S_DIPROTON)}" y2="${Y(y1)}" stroke="#555" stroke-dasharray="4 3"/><text x="${X(D.S_DIPROTON) - 4}" y="${Y(3.15)}" text-anchor="end" fill="#555">diproton binds →</text>`;
// the first minutes: for each clock, the least G₄ that leaves half the hydrogen, against s
D.rows.forEach((r, ci) => { const pts = []; D.S.forEach((sv, i) => { if (D.Bd[sv] <= 0) return; const j = r.grid[i].findIndex((c) => c.Y <= 0.5); if (j > 0) { const a = r.grid[i][j - 1].Y, b = r.grid[i][j].Y, g = D.GX[j - 1] + ((a - 0.5) / (a - b)) * (D.GX[j] - D.GX[j - 1]); pts.push([X(sv), Y(g)]); } else if (j === 0) pts.push([X(sv), Y(y0)]); });
  s += `<polyline fill="none" stroke="${CLK[ci]}" stroke-width="2" points="${pts.map((p) => p.join(",")).join(" ")}"/>`; const p = pts.at(-1); s += `<text x="${W - R + 8}" y="${p[1] + 4}" fill="${CLK[ci]}">clock ${r.t1} s</text>`; });
// the network's points (split where the two mass models disagree: the default left, the other right)
const alt = (b) => D.burnAlt?.find((a) => a.s === b.s && a.gx === b.gx);
const half = (cx, cy, r, side, fill) => `<path d="M ${cx} ${cy - r} A ${r} ${r} 0 0 ${side < 0 ? 0 : 1} ${cx} ${cy + r} Z" fill="${fill}" stroke="#333" stroke-width="0.6"/>`;
for (const b of D.burn) { const a = alt(b), cx = X(b.s), cy = Y(b.gx), tip = `s ${b.s}, G₄ 10^${b.gx}: ${b.kind}, ${(b.T / 1e6).toFixed(1)} MK (${D.mass} masses)${a ? `; ${a.kind}, ${(a.T / 1e6).toFixed(1)} MK (${D.massAlt})` : ""}`;
  if (a && a.kind !== b.kind) s += `<g><title>${tip}</title>${half(cx, cy, 7, -1, COL[b.kind])}${half(cx, cy, 7, 1, COL[a.kind])}</g><text x="${cx}" y="${cy - 10}" text-anchor="middle" font-size="9" fill="#333">${(b.T / 1e6).toFixed(0)}|${(a.T / 1e6).toFixed(0)}</text>`;
  else s += `<circle cx="${cx}" cy="${cy}" r="7" fill="${COL[b.kind]}" stroke="#333" stroke-width="0.6"><title>${tip}</title></circle><text x="${cx}" y="${cy - 10}" text-anchor="middle" font-size="9" fill="#333">${(b.T / 1e6).toFixed(0)}</text>`; }
// axes
s += `<line x1="${L}" y1="${Y(y0)}" x2="${W - R}" y2="${Y(y0)}" stroke="#333"/><line x1="${L}" y1="${Y(y0)}" x2="${L}" y2="${Y(y1)}" stroke="#333"/>`;
for (let v = 1.4; v <= 1.9001; v += 0.1) s += `<text x="${X(v)}" y="${Y(y0) + 18}" text-anchor="middle">${v.toFixed(1)}</text>`;
for (let g = 3; g <= 7; g++) s += `<text x="${L - 8}" y="${Y(g) + 4}" text-anchor="end">${g}</text>`;
s += `<text x="${(L + W - R) / 2}" y="${H - 18}" text-anchor="middle">the strong force's strength s (the deuteron binds as ours at 1.5152)</text>`;
s += `<text x="18" y="${(T + H - B) / 2}" text-anchor="middle" transform="rotate(-90 18 ${(T + H - B) / 2})">log₁₀ G₄ / (G_F/M_W)</text>`;
// legend
let ly = T + 20; s += `<text x="${W - R + 8}" y="${ly - 16}" font-weight="600">hydrogen burning makes</text>`;
for (const [k, c] of Object.entries(COL).slice(0, 3)) { s += `<circle cx="${W - R + 14}" cy="${ly}" r="6" fill="${c}" stroke="#333" stroke-width="0.6"/><text x="${W - R + 26}" y="${ly + 4}">${k}</text>`; ly += 20; }
if (D.burnAlt) { s += `${half(W - R + 14, ly, 6, -1, COL.helium)}${half(W - R + 14, ly, 6, 1, COL["past helium"])}<text x="${W - R + 26}" y="${ly + 4}" font-size="10">${D.mass} masses | ${D.massAlt}</text>`; ly += 20; }
s += `<text x="${W - R + 8}" y="${ly + 10}" font-size="10" fill="#555">numbers: the core's MK</text><text x="${W - R + 8}" y="${ly + 30}" font-size="10" fill="#555">above a clock's line, the first</text><text x="${W - R + 8}" y="${ly + 43}" font-size="10" fill="#555">minutes leave over half hydrogen</text></svg>`;
writeFileSync(new URL("./windows.svg", import.meta.url), s); console.log("wrote windows.svg");

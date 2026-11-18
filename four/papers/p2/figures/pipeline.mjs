/* Paper 2, the methods page's diagram: the modelling chain from the forces to a galaxy's gas, each link coloured by how
   it stands (computed, carried from our world, declared, provisional, chosen), with its technique and its code. Writes
   pipeline.svg beside it. Hand-kept: when a link changes how it stands, change it here and on the methods page.
     node four/papers/p2/figures/pipeline.mjs */
import { writeFileSync } from "node:fs";
const ST = { chosen: ["#6b6b6b", "chosen, scanned"], computed: ["#0072B2", "computed (checked on ours)"], carried: ["#E69F00", "partly carried from ours"], declared: ["#CC79A7", "declared choices, a band"], provisional: ["#999999", "provisional, runs pending"] };
const LINKS = [
  ["chosen", "1  The forces", "nucleon strength s · weak G₄ · gravity G", "the windows, scanned"],
  ["computed", "2  Light nuclei", "Monte Carlo to A = 4 · Brink clusters · two mass models", "nuclear.js, brink.js, nuc4.mjs"],
  ["carried", "3  Reaction rates", "p + p, ⁴He captures computed · the rest REACLIB through 4D's barrier", "ppfusion.mjs, rates4.mjs"],
  ["computed", "4  Burning", "implicit network · fast species at steady state · screening", "net4.js, shell4.js, screen.js"],
  ["computed", "5  The star", "shooting · pinned gravity · Fermi–Dirac gas · lens-vacuum opacity", "mainseq.js"],
  ["computed", "6  Ageing", "shells burnt · stirred zones mixed · energy-checked steps", "evolve.mjs"],
  ["computed", "7  What stars hold", "last profile summed element by element", "ash4.mjs"],
  ["declared", "8  How stars end", "core growth · dead remnant or explosion · winds", "yields4.mjs, nuclei.mjs explode"],
  ["provisional", "9  What they give back", "net yield on a mass function · one-zone galaxy", "yields4.mjs"],
  ["computed", "10  Metals in the gas", "the book's 4D ions · Saha · hydrogen-like bound–free", "metals.js, metals4.mjs"],
];
const W = 680, BH = 52, GAP = 16, T = 20, L = 20, BW = 540, H = T + LINKS.length * (BH + GAP) + 70;
let s = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" font-family="system-ui, sans-serif" font-size="12"><rect width="${W}" height="${H}" fill="#fff"/>`;
s += `<defs><marker id="ar" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0,0 L10,5 L0,10 z" fill="#555"/></marker></defs>`;
LINKS.forEach(([st, title, how, code], i) => { const y = T + i * (BH + GAP), [col] = ST[st];
  s += `<rect x="${L}" y="${y}" width="${BW}" height="${BH}" rx="7" fill="${col}1a" stroke="${col}" stroke-width="2"${st === "provisional" ? ' stroke-dasharray="6 4"' : ""}/>`;
  s += `<rect x="${L}" y="${y}" width="8" height="${BH}" rx="3" fill="${col}"/>`;
  s += `<text x="${L + 18}" y="${y + 19}" font-weight="600" font-size="13">${title}</text><text x="${L + 18}" y="${y + 37}" fill="#333">${how}</text>`;
  s += `<text x="${L + BW - 10}" y="${y + 19}" text-anchor="end" fill="#555" font-family="ui-monospace, monospace" font-size="10.5">${code}</text>`;
  if (i < LINKS.length - 1) s += `<line x1="${L + 60}" x2="${L + 60}" y1="${y + BH + 2}" y2="${y + BH + GAP - 3}" stroke="#555" stroke-width="1.6" marker-end="url(#ar)"/>`; });
// the loop back: the gas's metals feed the next generation's stars
const yTop = T + 4 * (BH + GAP) + BH / 2, yBot = T + 9 * (BH + GAP) + BH / 2, xr = L + BW + 22;
s += `<path d="M${L + BW},${yBot} H${xr} V${yTop} H${L + BW + 6}" fill="none" stroke="#555" stroke-width="1.6" stroke-dasharray="4 3" marker-end="url(#ar)"/>`;
s += `<text x="${xr + 6}" y="${(yTop + yBot) / 2}" fill="#555" font-size="11"><tspan x="${xr + 6}">the next</tspan><tspan x="${xr + 6}" dy="14">generation</tspan><tspan x="${xr + 6}" dy="14">(first look)</tspan></text>`;
const ly = H - 56; Object.values(ST).forEach(([col, name], i) => { const lx = L + (i % 3) * 220, y = ly + Math.floor(i / 3) * 22; s += `<rect x="${lx}" y="${y}" width="16" height="12" rx="3" fill="${col}33" stroke="${col}" stroke-width="2"/><text x="${lx + 22}" y="${y + 10}" font-size="11">${name}</text>`; });
s += `</svg>\n`;
writeFileSync(new URL("pipeline.svg", import.meta.url), s);
console.log("wrote figures/pipeline.svg");

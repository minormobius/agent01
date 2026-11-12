/* The whole life as a strip: one segment a stage, the core's make-up by mass stacked across it, coloured by element,
   with the playhead. Shared by the widget and the chart page. Draws only. */
import { STAGES, NUC, toX } from "./net.js";
import { at } from "./life.js";

/* an element's colour: the light ones hand-picked, the rest round the wheel by Z */
const HAND = { 1: "#ff6f61", 2: "#6fe0ff", 6: "#9a958c", 7: "#5f8fe0", 8: "#7fd88a", 10: "#ffb46b", 11: "#e58fb8", 12: "#e3cf7f", 13: "#c9a68c", 14: "#b48cff", 15: "#d77fd8", 16: "#d8d26b", 18: "#7fc4d8", 20: "#f0f0f0", 26: "#ff9e5e", 27: "#d88f7f", 28: "#ffd27f" };
export const colorZ = (Z) => HAND[Z] ?? `hsl(${(Z * 47) % 360} 55% 62%)`;
export const SHORT = ["H · pp", "H · CNO", "He", "C", "Ne", "O", "Si"];
const css = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();

const CACHE = new WeakMap();
export function drawStrip(c, L, v, { cols = 28 } = {}) {
  const r = devicePixelRatio || 1, w = c.clientWidth, h = c.clientHeight; if (c.width !== Math.round(w * r) || c.height !== Math.round(h * r)) { c.width = Math.round(w * r); c.height = Math.round(h * r); }
  const x = c.getContext("2d"); x.setTransform(r, 0, 0, r, 0, 0); x.clearRect(0, 0, w, h);
  const NS = STAGES.length, sw = w / NS, top = 2, bh = h - 18, cur = Math.min(NS - 1, Math.floor(v));
  if (!CACHE.has(L)) CACHE.set(L, L.map((R) => Array.from({ length: cols }, (_, k) => { const X = toX(at(R, (k + 0.5) / cols).Y), byZ = {}; X.forEach((m, j) => { const Z = NUC[j].Z; byZ[Z] = (byZ[Z] ?? 0) + m; }); return Object.entries(byZ).sort((a, b) => a[0] - b[0]); })));
  const COLS = CACHE.get(L);
  for (let i = 0; i < NS; i++) { const R = L[i];
    for (let k = 0; k < cols; k++) {
      let y = top; for (const [Z, m] of COLS[i][k]) { if (m < 0.003) continue; const hh = m * bh; x.fillStyle = colorZ(+Z); x.fillRect(i * sw + (k * sw) / cols, y, sw / cols + 0.6, hh); y += hh; } }
    x.fillStyle = i === cur ? "rgba(0,0,0,0)" : "rgba(7,8,12,0.35)"; x.fillRect(i * sw, top, sw, bh);
    x.strokeStyle = "#07080c"; x.lineWidth = 2; x.beginPath(); x.moveTo(i * sw, 0); x.lineTo(i * sw, h); x.stroke();
    x.font = `${i === cur ? 700 : 500} 11px ${css("--mono")}`; x.fillStyle = i === cur ? css("--text") : css("--dim"); x.textAlign = "center"; x.fillText(SHORT[i], i * sw + sw / 2, h - 4);
    if (R.stuck) { x.fillStyle = "#07080c"; x.fillRect(i * sw + sw / 2 - 24, top + bh / 2 - 9, 48, 14); x.fillStyle = "#e3cf7f"; x.fillText("stalls", i * sw + sw / 2, top + bh / 2 + 2); } }
  const px = (v / NS) * w; x.strokeStyle = "#fff"; x.lineWidth = 2; x.beginPath(); x.moveTo(px, 0); x.lineTo(px, top + bh); x.stroke();
  x.fillStyle = "#fff"; x.beginPath(); x.moveTo(px - 5, 0); x.lineTo(px + 5, 0); x.lineTo(px, 6); x.fill();
}
/* the legend for what the strip shows */
export function stripLegend(L) {
  const seen = new Map(); for (const R of L) for (const s of [R.snaps[0], R.snaps.at(-1)]) toX(s.Y).forEach((m, j) => { const Z = NUC[j].Z; if (m > 0.02) seen.set(Z, NUC[j].name.split("-")[0]); });
  return [...seen.entries()].sort((a, b) => a[0] - b[0]).map(([Z, n]) => `<span><i style="background:${colorZ(Z)}"></i>${n}</span>`).join("");
}

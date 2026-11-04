/* Paper 1's figure core: SVG strings, no DOM, deterministic. The theme and the Okabe–Ito categorical order are
   packages/dataviz/charts.js's (that library has no log axes, which the law figures need). Each panel is one axis set:
   never two y-scales. Marks: 1.8px lines, 3.5px dots with a white ring, direct labels where they help, a legend for
   two or more series. Every dot carries a <title>, so the figure hovers in a browser. */
export const INK = "#1a1a1a", MUTE = "#6b6b6b", GRID = "#e8e8e8", SPINE = "#4a4a4a", FONT = "'Helvetica Neue', Helvetica, Arial, sans-serif";
export const CAT = ["#0072B2", "#D55E00", "#009E73", "#CC79A7", "#E69F00", "#56B4E9", "#000000"]; // blue, vermillion, green, purple, orange, sky, black

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const f1 = (v) => (+v).toFixed(1);
export const text = (x, y, s, { size = 11, fill = INK, anchor = "start", weight = 400, rotate = null, italic = false } = {}) =>
  `<text x="${f1(x)}" y="${f1(y)}" font-size="${size}" fill="${fill}" text-anchor="${anchor}" font-weight="${weight}"${italic ? ' font-style="italic"' : ""}${rotate !== null ? ` transform="rotate(${rotate} ${f1(x)} ${f1(y)})"` : ""}>${esc(s)}</text>`;
const line = (x1, y1, x2, y2, { stroke = SPINE, w = 1, dash = null } = {}) => `<line x1="${f1(x1)}" y1="${f1(y1)}" x2="${f1(x2)}" y2="${f1(y2)}" stroke="${stroke}" stroke-width="${w}"${dash ? ` stroke-dasharray="${dash}"` : ""}/>`;

function niceTicks(lo, hi, n = 5) {
  const span = hi - lo || 1, raw = span / (n - 1), mag = 10 ** Math.floor(Math.log10(raw)), fr = raw / mag, step = (fr < 1.5 ? 1 : fr < 3 ? 2 : fr < 7 ? 5 : 10) * mag;
  const out = []; for (let v = Math.ceil(lo / step - 1e-9) * step; v <= hi + step * 1e-9; v += step) out.push(+v.toFixed(10)); return { ticks: out, step };
}
const SUP = "⁰¹²³⁴⁵⁶⁷⁸⁹";
const pow10 = (e) => (e === 0 ? "1" : e === 1 ? "10" : "10" + String(e).replace("-", "⁻").replace(/\d/g, (c) => SUP[c]));
const fmt = (v, step) => { if (v === 0) return "0"; const dec = Math.max(0, -Math.floor(Math.log10(step) + 1e-9)); return (v < 0 ? "−" : "") + Math.abs(v).toFixed(Math.min(dec, 4)); };

/* one panel at (ox, oy) of size w × h: returns { body, sx, sy } */
export function panel({ ox = 0, oy = 0, w, h, x, y, logx = false, logy = false, xl = "", yl = "", tag = null, xticks = null, yticks = null, zero = false }) {
  const m = { l: 58, r: 14, t: tag ? 24 : 12, b: 42 }, iw = w - m.l - m.r, ih = h - m.t - m.b;
  const tx = (v) => (logx ? Math.log10(v) : v), ty = (v) => (logy ? Math.log10(v) : v);
  const sx = (v) => ox + m.l + (iw * (tx(v) - tx(x[0]))) / (tx(x[1]) - tx(x[0])), sy = (v) => oy + m.t + ih - (ih * (ty(v) - ty(y[0]))) / (ty(y[1]) - ty(y[0]));
  let body = "";
  const tickList = (r, log, given) => given ?? (log ? Array.from({ length: Math.round(Math.log10(r[1] / r[0])) + 1 }, (_, i) => r[0] * 10 ** i).filter((v) => v >= r[0] * 0.999 && v <= r[1] * 1.001) : niceTicks(r[0], r[1]).ticks);
  const xs = tickList(x, logx, xticks), ys = tickList(y, logy, yticks), xstep = logx ? 1 : niceTicks(x[0], x[1]).step, ystep = logy ? 1 : niceTicks(y[0], y[1]).step;
  for (const v of ys) body += line(ox + m.l, sy(v), ox + m.l + iw, sy(v), { stroke: GRID });
  if (zero && y[0] < 0 && y[1] > 0) body += line(ox + m.l, sy(0), ox + m.l + iw, sy(0), { stroke: MUTE, w: 1, dash: "4,3" });
  body += line(ox + m.l, oy + m.t, ox + m.l, oy + m.t + ih) + line(ox + m.l, oy + m.t + ih, ox + m.l + iw, oy + m.t + ih);
  for (const v of xs) { body += line(sx(v), oy + m.t + ih, sx(v), oy + m.t + ih + 4); body += text(sx(v), oy + m.t + ih + 16, logx ? pow10(Math.round(Math.log10(v))) : fmt(v, xstep), { size: 10, fill: MUTE, anchor: "middle" }); }
  for (const v of ys) { body += line(ox + m.l - 4, sy(v), ox + m.l, sy(v)); body += text(ox + m.l - 7, sy(v) + 3.5, logy ? pow10(Math.round(Math.log10(v))) : fmt(v, ystep), { size: 10, fill: MUTE, anchor: "end" }); }
  body += text(ox + m.l + iw / 2, oy + h - 8, xl, { size: 11, anchor: "middle" });
  body += text(ox + 14, oy + m.t + ih / 2, yl, { size: 11, anchor: "middle", rotate: -90 });
  if (tag) body += text(ox + 6, oy + 14, tag, { size: 12, weight: 700 });
  const clip = `c${Math.round(ox)}_${Math.round(oy)}_${w}`;
  return { body, sx, sy, m, iw, ih, ox, oy, clip, defs: `<clipPath id="${clip}"><rect x="${ox + m.l}" y="${oy + m.t}" width="${iw}" height="${ih}"/></clipPath>` };
}

/* a series: { pts: [[x, y, title?]], c, dash, dots, w } drawn inside panel P (clipped) */
export function series(P, { pts, c = CAT[0], dash = null, dots = false, lineOn = true, w = 1.8, r = 3.5 }) {
  let s = "";
  const ok = pts.filter((p) => isFinite(p[0]) && isFinite(p[1]));
  if (lineOn && ok.length > 1) s += `<polyline points="${ok.map((p) => `${f1(P.sx(p[0]))},${f1(P.sy(p[1]))}`).join(" ")}" fill="none" stroke="${c}" stroke-width="${w}" stroke-linejoin="round"${dash ? ` stroke-dasharray="${dash}"` : ""}/>`;
  if (dots) for (const p of ok) s += `<circle cx="${f1(P.sx(p[0]))}" cy="${f1(P.sy(p[1]))}" r="${r}" fill="${c}" stroke="#fff" stroke-width="1.5">${p[2] ? `<title>${esc(p[2])}</title>` : ""}</circle>`;
  return `<g clip-path="url(#${P.clip})">${s}</g>`;
}

/* a legend box at the panel's corner: items [{ label, c, dash, dot }] */
export function legend(P, items, corner = "tr") {
  const lh = 16, wBox = Math.max(...items.map((i) => i.label.length)) * 6.1 + 34, hBox = items.length * lh + 8;
  const x0 = corner.includes("r") ? P.ox + P.m.l + P.iw - wBox - 6 : P.ox + P.m.l + 8, y0 = corner.includes("t") ? P.oy + P.m.t + 6 : P.oy + P.m.t + P.ih - hBox - 6;
  let s = `<rect x="${f1(x0)}" y="${f1(y0)}" width="${f1(wBox)}" height="${hBox}" fill="#fff" fill-opacity="0.9" stroke="${GRID}"/>`;
  items.forEach((it, i) => { const y = y0 + 12 + i * lh; if (it.dot) s += `<circle cx="${f1(x0 + 15)}" cy="${f1(y)}" r="3.5" fill="${it.c}"/>`; else s += line(x0 + 6, y, x0 + 24, y, { stroke: it.c, w: 2, dash: it.dash }); s += text(x0 + 30, y + 3.5, it.label, { size: 10 }); });
  return s;
}

/* the whole figure: panels' bodies, defs and a caption-free frame; aria names it */
export function figure(w, h, parts, aria) {
  const defs = parts.filter((p) => p.defs).map((p) => p.defs).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" font-family="${FONT}" role="img" aria-label="${esc(aria)}"><defs>${defs}</defs><rect width="${w}" height="${h}" fill="#fff"/>${parts.map((p) => (typeof p === "string" ? p : p.body)).join("")}</svg>\n`;
}

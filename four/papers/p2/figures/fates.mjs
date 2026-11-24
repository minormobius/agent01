/* Paper 2, figure 3: what the first stars give back (data/yields4.json, fusion/tools/yields4.mjs, the G 1e-17 mass
   ladders). The third of the paper's strength planes, after the windows (can a core burn past helium) and the lives
   (does a star live): does a star give anything back, and how much.
   (a) Star mass against the nucleon force's strength s. Below the 30 Gyr line the stars outlive the galaxy and lock
       their mass away; above it they die, as dead remnants returning their envelopes, or exploding and returning
       everything. The explosion boundary is a band: where a core grown by g reaches the Chandrasekhar mass, from g = 1.5
       (its lower edge) to g = 1 (its upper edge), interpolated in ln m between the ladder's stars. Each star is filled by
       its share past helium; a dashed outline marks one whose life is carried on from a cut run. From s 1.75 up the stars
       burn hydrogen to helium and little further.
   (b) The net yield p (elements past helium returned per unit of mass locked away) on a log axis: the band over every
       declared choice, the middle choice as a line, and under each strength the middle choice's make-up (equilibrium,
       the rock row, the light ash the stars held). Writes fates.svg beside it.
     node four/papers/p2/figures/fates.mjs */
import { readFileSync, writeFileSync } from "node:fs";
const Y = JSON.parse(readFileSync(new URL("../data/yields4.json", import.meta.url), "utf8"));
const S = [...new Set(Y.yields.map((y) => y.s))].sort((a, b) => a - b), lad = (s) => Y.stars.filter((x) => x.s === s).sort((a, b) => a.m - b.m);
const MID = { alpha: 2.35, g: 1.25, w: 0.03, f: 100, tg: 30 }, isMid = (y) => Object.entries(MID).every(([k, v]) => y[k] === v);
const light = (mix) => Object.entries(mix).filter(([z]) => /^\d+$/.test(z)).reduce((a, [, v]) => a + v, 0);

// where a quantity along a ladder (in ln m) first crosses a level, linear in ln m; null if it never does
const cross = (pts, level, up) => { for (let i = 1; i < pts.length; i++) { const [m0, v0] = pts[i - 1], [m1, v1] = pts[i];
  if (up ? v0 < level && v1 >= level : v0 > level && v1 <= level) { const t = (level - v0) / (v1 - v0); return Math.exp(Math.log(m0) + t * (Math.log(m1) - Math.log(m0))); } } return null; };
const mLife = (s, tg) => cross(lad(s).filter((x) => isFinite(x.life)).map((x) => [x.m, Math.log(x.life)]), Math.log(tg), false);
const mBoom = (s, g) => cross(lad(s).map((x) => [x.m, Math.log(Math.min(1, g * x.qcore) * x.m)]), 0, true);

const W = 850, L = 78, R = 600, xa = 1.495, xb = 1.83, X = (s) => L + ((s - xa) / (xb - xa)) * (R - L);
const Ta = 46, Ba = 376, ma = 0.22, mb = 4.6, Ym = (m) => Ba - ((Math.log(m) - Math.log(ma)) / (Math.log(mb) - Math.log(ma))) * (Ba - Ta);
const Tb = 440, Bb = 620, pa = 2e-4, pb = 0.3, Yp = (p) => Bb - ((Math.log10(p) - Math.log10(pa)) / (Math.log10(pb) - Math.log10(pa))) * (Bb - Tb);
const Tm = 650, Hm = 16, H = 730;
const shade = (f) => { const v = Math.round(255 - Math.min(1, f / 0.4) * 215); return `rgb(${v},${v},${v})`; };
const C = { locked: "#e9e9e9", dead: "#cfe6f5", band: "#f6dcb4", boom: "#f2b27a", rock: "#D55E00", iron: "#555555", light: "#009E73", deadE: "#0072B2", boomE: "#D55E00" };
let s = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" font-family="system-ui, sans-serif" font-size="12"><style>.lb{paint-order:stroke;stroke:#fff;stroke-width:3px;stroke-linejoin:round}</style><rect width="${W}" height="${H}" fill="#fff"/>`;
s += `<defs><pattern id="hatch" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="7" height="7" fill="${C.band}"/><line x1="0" y1="0" x2="0" y2="7" stroke="${C.boom}" stroke-width="2.5"/></pattern></defs>`;

// (a) the regions, column edges halfway between strengths, the boundaries joined across them
const edges = S.map((sv, i) => [i ? (S[i - 1] + sv) / 2 : xa, i < S.length - 1 ? (sv + S[i + 1]) / 2 : xb]);
const clampM = (m) => Math.min(mb, Math.max(ma, m ?? mb));
const poly = (lo, hi) => { const top = S.flatMap((sv, i) => edges[i].map((e) => `${X(e).toFixed(1)},${Ym(clampM(hi(sv))).toFixed(1)}`)), bot = S.flatMap((sv, i) => edges[i].map((e) => `${X(e).toFixed(1)},${Ym(clampM(lo(sv))).toFixed(1)}`)).reverse(); return [...top, ...bot].join(" "); };
const m30 = (sv) => mLife(sv, 30), g15 = (sv) => Math.max(mBoom(sv, 1.5) ?? mb, m30(sv) ?? ma), g10 = (sv) => Math.max(mBoom(sv, 1) ?? mb, g15(sv));
s += `<polygon points="${poly(() => ma, m30)}" fill="${C.locked}"/>`;
s += `<polygon points="${poly(m30, g15)}" fill="${C.dead}"/>`;
s += `<polygon points="${poly(g15, g10)}" fill="url(#hatch)"/>`;
s += `<polygon points="${poly(g10, () => mb)}" fill="${C.boom}"/>`;
const line = (fn, attrs) => `<polyline points="${S.flatMap((sv, i) => edges[i].map((e) => `${X(e).toFixed(1)},${Ym(clampM(fn(sv))).toFixed(1)}`)).join(" ")}" fill="none" ${attrs}/>`;
s += line(m30, `stroke="#666" stroke-width="1.4"`) + line((sv) => mLife(sv, 10) ?? ma, `stroke="#666" stroke-width="1" stroke-dasharray="4 3"`);
s += line((sv) => mBoom(sv, 1.25), `stroke="${C.boomE}" stroke-width="1.6" stroke-dasharray="6 3"`);
// helium only, from s 1.75 up
s += `<rect x="${X(1.75)}" y="${Ta}" width="${R - X(1.75)}" height="${Ba - Ta}" fill="#fff" fill-opacity="0.45"/><line x1="${X(1.75)}" x2="${X(1.75)}" y1="${Ta}" y2="${Ba}" stroke="#999" stroke-dasharray="3 3"/>`;
s += `<text class="lb" x="${(X(1.75) + R) / 2}" y="${Ym(0.42)}" text-anchor="middle" fill="#444" font-size="11"><tspan x="${(X(1.75) + R) / 2}">burns to helium</tspan><tspan x="${(X(1.75) + R) / 2}" dy="13">and little further:</tspan><tspan x="${(X(1.75) + R) / 2}" dy="13">little to give back</tspan></text>`;
// region labels, at s 1.6
const lx = X(1.575);
s += `<text class="lb" x="${lx}" y="${Ym(0.35)}" text-anchor="middle" fill="#444">outlives 30 Gyr: mass locked away</text>`;
s += `<text class="lb" x="${X(1.675)}" y="${Ym(Math.sqrt(1.25 * 1.6)) + 4}" text-anchor="middle" fill="#0b4f7a">dies: returns its envelope</text>`;
s += `<text class="lb" x="${X(1.625)}" y="${Ym(3.3)}" text-anchor="middle" fill="#7a2e00" font-weight="600">explodes: returns its equilibrium band</text>`;
// the stars
for (const sv of S) for (const x of lad(sv)) { const c = x.choices.find((k) => k.g === 1.25 && k.w === 0.03 && k.f === 100), carried = x.lifeFlag !== "reached" && x.life < 30;
  s += `<circle cx="${X(sv).toFixed(1)}" cy="${Ym(x.m).toFixed(1)}" r="6" fill="${shade(x.ashAll)}" stroke="${x.life >= 30 ? "#777" : c.fate === "explodes" ? C.boomE : C.deadE}" stroke-width="2"${carried ? ' stroke-dasharray="2.5 2"' : ""}/>`; }
// axes (a)
for (const m of [0.25, 0.5, 1, 2, 4]) s += `<line x1="${L - 4}" x2="${L}" y1="${Ym(m)}" y2="${Ym(m)}" stroke="#333"/><text x="${L - 7}" y="${Ym(m) + 4}" text-anchor="end" fill="#555">${m}</text>`;
s += `<line x1="${L}" x2="${L}" y1="${Ta}" y2="${Ba}" stroke="#333"/><line x1="${L}" x2="${R}" y1="${Ba}" y2="${Ba}" stroke="#333"/>`;
s += `<text transform="translate(${L - 46},${(Ta + Ba) / 2}) rotate(-90)" text-anchor="middle">star mass (Chandrasekhar masses)</text>`;
s += `<text x="${L}" y="${Ta - 16}" font-weight="600">(a) What each star does, at G = 10⁻¹⁷ × ours</text>`;
// key (a)
const kx = R + 18; let ky = Ta + 4;
const key = (draw, label) => { s += draw(ky) + `<text x="${kx + 26}" y="${ky + 4}" font-size="11">${label}</text>`; ky += 20; };
key((y) => `<rect x="${kx}" y="${y - 6}" width="18" height="12" fill="url(#hatch)"/>`, "explodes if its core grows");
key((y) => `<text x="${kx + 26}" y="${y + 17}" font-size="10" fill="#555">by g = 1 (top) to 1.5 (bottom)</text>`, "");
ky += 10;
key((y) => `<line x1="${kx}" x2="${kx + 18}" y1="${y}" y2="${y}" stroke="${C.boomE}" stroke-width="1.6" stroke-dasharray="6 3"/>`, "g = 1.25, the middle");
key((y) => `<line x1="${kx}" x2="${kx + 18}" y1="${y}" y2="${y}" stroke="#666" stroke-width="1.4"/>`, "lives 30 Gyr");
key((y) => `<line x1="${kx}" x2="${kx + 18}" y1="${y}" y2="${y}" stroke="#666" stroke-dasharray="4 3"/>`, "lives 10 Gyr");
ky += 6;
key((y) => `<circle cx="${kx + 9}" cy="${y}" r="6" fill="${shade(0)}" stroke="${C.deadE}" stroke-width="2"/>`, "a star: dies (g = 1.25)");
key((y) => `<circle cx="${kx + 9}" cy="${y}" r="6" fill="${shade(0)}" stroke="${C.boomE}" stroke-width="2"/>`, "explodes (g = 1.25)");
key((y) => `<circle cx="${kx + 9}" cy="${y}" r="6" fill="${shade(0)}" stroke="#777" stroke-width="2" stroke-dasharray="2.5 2"/>`, "life carried on, run cut");
ky += 6;
s += `<text x="${kx}" y="${ky}" font-size="11">fill: share past helium</text>`; ky += 8;
for (const [i, f] of [0, 0.1, 0.2, 0.4].entries()) s += `<rect x="${kx + i * 36}" y="${ky}" width="36" height="10" fill="${shade(f)}" stroke="#999" stroke-width="0.5"/><text x="${kx + i * 36 + 18}" y="${ky + 22}" text-anchor="middle" font-size="10" fill="#555">${Math.round(100 * f)}%</text>`;

// (b) the net yield
for (const e of [-3, -2, -1]) { const p = 10 ** e; s += `<line x1="${L}" x2="${R}" y1="${Yp(p)}" y2="${Yp(p)}" stroke="#eee"/><text x="${L - 7}" y="${Yp(p) + 4}" text-anchor="end" fill="#555">${p}</text>`; }
const band = S.map((sv) => { const ps = Y.yields.filter((y) => y.s === sv).map((y) => y.p); return [sv, Math.min(...ps), Math.max(...ps)]; });
s += `<polygon points="${[...band.map(([sv, , hi]) => `${X(sv).toFixed(1)},${Yp(hi).toFixed(1)}`), ...band.map(([sv, lo]) => `${X(sv).toFixed(1)},${Yp(lo).toFixed(1)}`).reverse()].join(" ")}" fill="${C.boom}" fill-opacity="0.45"/>`;
const mid = S.map((sv) => [sv, Y.yields.find((y) => y.s === sv && isMid(y))]);
s += `<polyline points="${mid.map(([sv, y]) => `${X(sv).toFixed(1)},${Yp(y.p).toFixed(1)}`).join(" ")}" fill="none" stroke="${C.boomE}" stroke-width="2"/>`;
for (const [sv, y] of mid) s += `<circle cx="${X(sv).toFixed(1)}" cy="${Yp(y.p).toFixed(1)}" r="3.5" fill="${C.boomE}"/>`;
s += `<line x1="${L}" x2="${L}" y1="${Tb}" y2="${Bb}" stroke="#333"/><line x1="${L}" x2="${R}" y1="${Bb}" y2="${Bb}" stroke="#333"/>`;
s += `<text transform="translate(${L - 52},${(Tb + Bb) / 2}) rotate(-90)" text-anchor="middle">net yield p</text>`;
s += `<text x="${L}" y="${Tb - 16}" font-weight="600">(b) What comes back: metals returned per unit of mass locked away</text>`;
ky = Tb + 4;
key((y) => `<rect x="${kx}" y="${y - 6}" width="18" height="12" fill="${C.boom}" fill-opacity="0.45"/>`, "every declared choice");
key((y) => `<line x1="${kx}" x2="${kx + 18}" y1="${y}" y2="${y}" stroke="${C.boomE}" stroke-width="2"/>`, "the middle choice");
s += `<text x="${kx}" y="${ky + 6}" font-size="10" fill="#555"><tspan x="${kx}">α 2.35, g 1.25, winds 3%,</tspan><tspan x="${kx}" dy="12">stars dying within 30 Gyr</tspan></text>`;
// the make-up strip
const bw = 40;
for (const [sv, y] of mid) { let x = X(sv) - bw / 2; const parts = [["iron", y.mix.iron ?? 0], ["rock", y.mix.rock ?? 0], ["light", light(y.mix)]], tot = parts.reduce((a, [, v]) => a + v, 0);
  for (const [k, v] of parts) { const w = (bw * v) / tot; if (w > 0) s += `<rect x="${x.toFixed(1)}" y="${Tm}" width="${w.toFixed(1)}" height="${Hm}" fill="${C[k]}"/>`; x += w; } }
s += `<text x="${L - 7}" y="${Tm + 12}" text-anchor="end" font-size="11" fill="#555">make-up</text>`;
for (const sv of S) s += `<text x="${X(sv)}" y="${Tm + Hm + 16}" text-anchor="middle" fill="#555">${sv}</text>`;
s += `<text x="${(L + R) / 2}" y="${Tm + Hm + 36}" text-anchor="middle">strength of the nucleon force, s (1.5152 nearest ours)</text>`;
ky = Tm + 2; for (const [k, label] of [["iron", "equilibrium (elements ~116–122)"], ["rock", "rock row (13–23)"], ["light", "light ash the stars held"]]) { s += `<rect x="${kx}" y="${ky}" width="14" height="10" fill="${C[k]}"/><text x="${kx + 20}" y="${ky + 9}" font-size="11">${label}</text>`; ky += 15; }
for (const sv of S) s += `<line x1="${X(sv)}" x2="${X(sv)}" y1="${Ba}" y2="${Ba + 4}" stroke="#333"/><text x="${X(sv)}" y="${Ba + 16}" text-anchor="middle" fill="#555">${sv}</text>`;
s += `</svg>\n`;
writeFileSync(new URL("fates.svg", import.meta.url), s);
console.log(`wrote figures/fates.svg (${S.length} strengths, ${S.reduce((n, sv) => n + lad(sv).length, 0)} stars)`);
for (const sv of S) console.log(`s ${sv}: lives 30 Gyr at ${m30(sv)?.toFixed(2)}; explodes from ${mBoom(sv, 1.5)?.toFixed(2)} (g 1.5) / ${mBoom(sv, 1.25)?.toFixed(2)} (1.25) / ${mBoom(sv, 1)?.toFixed(2)} (1) M_Ch`);

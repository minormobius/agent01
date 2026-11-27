/* The instrument section: the 4D hot wire by strip theory (js/anem.js), drawn on two canvases. */
import { wire, ribbon, profile, misread } from "./anem.js";
const $ = (id) => document.getElementById(id), lerp = (a, b, t) => Math.exp(Math.log(a) + (Math.log(b) - Math.log(a)) * t);
const RE = [0.25, 25], LEN = [10, 1000], LAM = [10, 5000];
let KIND = "wire";
/* one metal for both probes: the ribbon's Lam is 1.5 times the wire's (its section is a disc, the wire's a ball) */
const probe = (S, kind = KIND) => (kind === "ribbon" ? ribbon({ R: S.R, Lam: 1.5 * S.Lam, Re: S.Re, N: S.N || 400 }) : wire(S));
const state = () => { const s = KIND === "ribbon" ? 0 : +$("iN").value; return { Re: lerp(...RE, +$("iRe").value), R: lerp(...LEN, +$("iL").value) / 2, Lam: lerp(...LAM, +$("iLam").value), tau: +$("iTau").value, n: s >= 0.995 ? Infinity : 2 / (1 - s) }; };
const heat = (t) => { t = Math.max(0, Math.min(1, t)); return `rgb(${(40 + 215 * Math.min(1, 1.6 * t)) | 0},${(44 + 180 * t * t) | 0},${(60 + 150 * Math.max(0, t - 0.7) / 0.3 - 20 * t) | 0})`; };
let pending = false;
/* canvases are sized to their place on the page, so the lettering stays readable on a phone */
function fit(c, h) { const w = Math.max(300, c.clientWidth || 900), d = Math.min(2, window.devicePixelRatio || 1); c.width = Math.round(w * d); c.height = Math.round(h * d); c.style.height = h + "px"; const g = c.getContext("2d"); g.setTransform(d, 0, 0, d, 0, 0); return [g, w, h]; }
function draw() { pending = false; const S = state(), RIB = KIND === "ribbon", W = probe(S), r = W.at(S.tau), N = r.theta.length - 1;
  $("iReL").textContent = RIB ? "flow (Reynolds number on the ribbon's thickness)" : "flow (wire's Reynolds number)"; $("iLL").textContent = RIB ? "pipe width, in ribbon thicknesses" : "wire length, in its diameters"; $("iNL").style.display = RIB ? "none" : ""; $("iWire").style.borderColor = RIB ? "" : "#ffd27a"; $("iRib").style.borderColor = RIB ? "#ffd27a" : ""; $("iKind").textContent = RIB ? "a sheet spanning the pipe from wall to wall, seen here along one of its diameters" : "";
  $("iReV").textContent = S.Re.toFixed(S.Re < 3 ? 2 : 1); $("iLV").textContent = (2 * S.R).toFixed(0); $("iLamV").textContent = S.Lam < 100 ? "poorly" : S.Lam < 1000 ? "fairly" : "like a metal"; $("iTauV").textContent = (1 + S.tau).toFixed(2); $("iNV").textContent = S.n === 2 ? "fully developed" : S.n === Infinity ? "plug (flat)" : S.n < 4 ? "nearly developed" : "flattened";
  /* along the wire */
  { const c = $("c6"), [g, cw, ch] = fit(c, 330), L = 34, Rm = 34, X = (x) => L + ((x + 1) / 2) * (cw - L - Rm), top = 18, mid = 150, wy = 178, bot = 304;
    g.fillStyle = "#0e1017"; g.fillRect(0, 0, cw, ch); g.font = "12px ui-monospace, Menlo, monospace";
    g.fillStyle = "#3a3d4c"; g.fillRect(L - 10, top, 10, bot - top); g.fillRect(cw - Rm, top, 10, bot - top);
    /* the stream's speed */
    const umax = 1.05; g.strokeStyle = "#6fe0ff"; g.fillStyle = "rgba(111,224,255,.12)"; g.lineWidth = 2; g.beginPath(); g.moveTo(X(-1), mid);
    for (let i = -100; i <= 100; i++) g.lineTo(X(i / 100), mid - (profile(Math.abs(i) / 100, S.n) / umax) * (mid - top - 8)); g.lineTo(X(1), mid); g.fill(); g.stroke();
    g.fillStyle = "#6fe0ff"; g.textAlign = "left"; g.fillText("speed of the stream", L + 6, top + 12);
    /* the wire, coloured by its temperature */
    const pk = Math.max(r.peak, 1e-9); for (let px = 0; px < cw - L - Rm; px++) { const x = Math.abs((px / (cw - L - Rm)) * 2 - 1), t = r.theta[Math.min(N, Math.round(x * N))]; g.fillStyle = heat(t / Math.max(1, pk)); g.fillRect(L + px, wy - 7, 1.5, 14); }
    /* its temperature as a curve */
    const tmax = Math.max(1.05, pk * 1.08); g.strokeStyle = "#ffd27a"; g.lineWidth = 2; g.beginPath();
    for (let i = -N; i <= N; i += 2) { const y = bot - (r.theta[Math.abs(i)] / tmax) * (bot - wy - 26); i === -N ? g.moveTo(X(i / N), y) : g.lineTo(X(i / N), y); } g.stroke();
    const ym = bot - (S.tau / tmax) * (bot - wy - 26); g.strokeStyle = "rgba(255,210,122,.4)"; g.setLineDash([5, 5]); g.beginPath(); g.moveTo(X(-1), ym); g.lineTo(X(1), ym); g.stroke(); g.setLineDash([]);
    g.fillStyle = "#ffd27a"; g.fillText(RIB ? "how hot the ribbon runs (dashed: average)" : "how hot the wire runs (dashed: average)", L + 6, wy + 24); g.fillStyle = "#9a958c"; g.textAlign = "center"; g.fillText(RIB ? "rim" : "wall", L - 5, bot + 14); g.fillText(RIB ? "rim" : "wall", cw - Rm + 5, bot + 14); g.fillText("axis", X(0), bot + 14); }
  $("r6").innerHTML = `Heat going to the stream: <b>${(100 * r.stream).toFixed(0)}%</b>; ${RIB ? "through the sheet into the rim" : "down the wire into the walls"}: <b>${(100 * (1 - r.stream)).toFixed(0)}%</b>. Hottest stretch ${(r.peak / S.tau).toFixed(2)} × the average. Pipe's Reynolds number ${(S.Re * 2 * S.R).toFixed(0)}.`;
  /* the calibration */
  { const c = $("c7"), [g, cw, ch] = fit(c, 280), L = 50, Rm = 16, T = 14, B = 40, M = 40, pts = [], dev = [];
    for (let i = 0; i <= M; i++) { const Re = lerp(...RE, i / M); pts.push([Re, probe({ ...S, Re, N: 200 }).at(S.tau).P]); if (S.n !== 2) dev.push([Re, wire({ ...S, Re, n: 2, N: 200 }).at(S.tau).P]); else dev.push([Re, probe({ ...S, Re, N: 200 }, RIB ? "wire" : "ribbon").at(S.tau).P]); }
    const other = S.n === 2; if (other) { const k = pts[0][1] / dev[0][1]; for (const q of dev) q[1] *= k; }
    const all = pts.concat(dev).map((p) => p[1]), lo = 0, hi = Math.max(...all) * 1.08, X = (Re) => L + (Math.log(Re / RE[0]) / Math.log(RE[1] / RE[0])) * (cw - L - Rm), Y = (P) => T + (1 - (P - lo) / (hi - lo)) * (ch - T - B);
    g.fillStyle = "#0e1017"; g.fillRect(0, 0, cw, ch); g.font = "12px ui-monospace, Menlo, monospace"; g.strokeStyle = "#262833"; g.fillStyle = "#9a958c"; g.lineWidth = 1;
    for (const Re of cw < 500 ? [0.25, 1, 5, 25] : [0.25, 0.5, 1, 2, 5, 10, 25]) { g.beginPath(); g.moveTo(X(Re), T); g.lineTo(X(Re), ch - B); g.stroke(); g.textAlign = "center"; g.fillText(Re, X(Re), ch - B + 16); }
    g.fillText(RIB ? "flow: Reynolds number on the ribbon's thickness" : "flow: the wire's Reynolds number", L + (cw - L - Rm) / 2, ch - 6); g.textAlign = "right"; g.fillText(hi.toFixed(2), L - 6, T + 10); g.fillText("0", L - 6, ch - B); g.save(); g.translate(14, ch / 2); g.rotate(-Math.PI / 2); g.textAlign = "center"; g.fillText("current squared", 0, 0); g.restore();
    const line = (P, col, dash) => { g.strokeStyle = col; g.lineWidth = 2; g.setLineDash(dash); g.beginPath(); P.forEach((p, i) => (i ? g.lineTo(X(p[0]), Y(p[1])) : g.moveTo(X(p[0]), Y(p[1])))); g.stroke(); g.setLineDash([]); };
    if (dev.length) line(dev, "#9a958c", [6, 5]); line(pts, "#ffd27a", []);
    g.fillStyle = "#e9e4da"; g.beginPath(); g.arc(X(S.Re), Y(r.P), 6, 0, 7); g.fill();
    const k = Math.min(M - 1, Math.max(1, Math.round((Math.log(S.Re / RE[0]) / Math.log(RE[1] / RE[0])) * M))), sens = Math.log(pts[k + 1][1] / pts[k - 1][1]) / Math.log(pts[k + 1][0] / pts[k - 1][0]), span = pts[M][1] / pts[0][1] - 1;
    let txt = `Current squared <b>${r.P.toFixed(2)}</b>. A 1% change in flow moves it by <b>${sens.toFixed(sens < 0.1 ? 3 : 2)}%</b> here; across the whole hundredfold range of flow it rises ${(100 * span).toFixed(0)}%.`;
    if (other) { const so = Math.log(dev[k + 1][1] / dev[k - 1][1]) / Math.log(dev[k + 1][0] / dev[k - 1][0]); txt += ` Dashed: the ${RIB ? "wire" : "ribbon"} of the same metal in the same pipe, scaled to start at the same height; it would move by <b>${so.toFixed(so < 0.1 ? 3 : 2)}%</b>.`; }
    if (S.n !== 2) txt += ` Dashed: the same flow rates, fully developed. Read off that curve, this reading would be taken for <b>${(100 * misread(S)).toFixed(0)}%</b> of the true flow rate.`;
    $("r7").innerHTML = txt; } }
const ask = () => { if (!pending) { pending = true; requestAnimationFrame(draw); } };
for (const id of ["iRe", "iL", "iLam", "iTau", "iN"]) $(id).oninput = ask;
$("iWire").onclick = () => { KIND = "wire"; ask(); }; $("iRib").onclick = () => { KIND = "ribbon"; ask(); };
addEventListener("resize", ask); window.WIRE4I = { state, draw, kind: (k) => { if (k) { KIND = k; draw(); } return KIND; } }; draw();

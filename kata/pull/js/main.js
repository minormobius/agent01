/* PULL's page: one rope pulled live on the page's thread (a step a frame), every species sampled in a worker for the table */
import { makeRope, SPECIES } from "./bench.js";
const $ = (id) => document.getElementById(id), COL = ["#9a958c", "#ffd27a", "#ffab5e", "#ff66b8", "#8be28a", "#4fd08a", "#6fe0ff", "#3aa6ff", "#b49cff", "#e6e1d6"], SEEDS = 6, STEPS = 110, STRAIN = 0.045;
const res = Object.fromEntries(SPECIES.map((s) => [s.id, { peaks: [], broke: 0, slip: 0, curve: null }]));
let cur = "rope4", live = null, seed = 1, done = false;
window.PULL = { res, get live() { return live; }, get done() { return done; } };
SPECIES.forEach((sp, i) => { const b = document.createElement("button"); b.type = "button"; b.dataset.id = sp.id; b.innerHTML = `<i>${sp.dim}</i>${sp.name}`; b.style.borderLeft = `3px solid ${COL[i]}`; b.addEventListener("click", () => { cur = sp.id; seed = 1; start(); }); $("species").append(b); });
function start() { const sp = SPECIES.find((s) => s.id === cur); live = { sp, R: makeRope({ ...sp.opts, seed }), k: 0, curve: [], peak: 0 }; for (const b of $("species").children) b.classList.toggle("on", b.dataset.id === cur); $("liveT").textContent = `${sp.dim} · ${sp.name} · sample ${seed}`; table(); }
$("goB").addEventListener("click", () => { seed++; start(); });
/* the rope: a row a track, a cell a link; colour is tension over strength (cool to hot), a gap is a break or a fibre's end */
function drawRope() { const cv = $("rope"), dpr = Math.min(window.devicePixelRatio || 1, 2), w = cv.clientWidth, h = cv.clientHeight; if (cv.width !== Math.round(w * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); } const x = cv.getContext("2d"); x.setTransform(dpr, 0, 0, dpr, 0, 0); x.clearRect(0, 0, w, h);
  const R = live.R, L = R.S - 1, pad = 14, cw = (w - 2 * pad) / L, rh = Math.min(15, (h - 8) / R.T), y0 = (h - rh * R.T) / 2;
  x.fillStyle = "#3a3d47"; x.fillRect(0, y0 - 4, pad - 3, rh * R.T + 8); x.fillRect(w - pad + 3, y0 - 4, pad - 3, rh * R.T + 8);
  for (let i = 0; i < R.T; i++) for (let s = 0; s < L; s++) { if (!R.ok[i][s]) continue; const t = Math.max(0, (R.u[i][s + 1] - R.u[i][s]) * (live.sp.opts.ribbon && i === 0 ? live.sp.opts.ribbon.k : 1)) / R.str[i][s], c = Math.min(1, t); x.fillStyle = `rgb(${Math.round(60 + 195 * c)},${Math.round(90 + 120 * Math.sin(c * Math.PI))},${Math.round(150 - 110 * c)})`; x.fillRect(pad + s * cw + 0.4, y0 + i * rh + 1.5, Math.max(1, cw - 0.8), (live.sp.opts.ribbon && i === 0 ? rh : rh - 3)); }
  x.fillStyle = "#9a958c"; x.font = "10px ui-monospace, Menlo, monospace"; x.textAlign = "left"; x.fillText("jaw", 0, y0 - 8); x.textAlign = "right"; x.fillText("jaw →", w, y0 - 8); }
function plot() { const cv = $("plot"), dpr = Math.min(window.devicePixelRatio || 1, 2), w = cv.clientWidth, h = cv.clientHeight; cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); const x = cv.getContext("2d"); x.setTransform(dpr, 0, 0, dpr, 0, 0); x.clearRect(0, 0, w, h);
  const ref = mean(res.strand.peaks) || 0.0071, curves = SPECIES.map((sp, i) => ({ id: sp.id, c: COL[i], v: sp.id === cur && live ? live.curve : res[sp.id].curve })).filter((q) => q.v && q.v.length), top = Math.max(1.5, ...curves.map((q) => Math.max(...q.v) / ref)) * 1.08, X = (k) => 38 + (k / STEPS) * (w - 50), Y = (v) => h - 24 - (v / ref / top) * (h - 44);
  x.strokeStyle = "rgba(255,255,255,0.14)"; x.fillStyle = "#9a958c"; x.font = "10px ui-monospace, Menlo, monospace"; x.textAlign = "right"; for (let g = 0; g <= top; g += top > 9 ? 4 : 1) { x.beginPath(); x.moveTo(38, Y(g * ref)); x.lineTo(w - 12, Y(g * ref)); x.stroke(); x.fillText(String(g), 32, Y(g * ref) + 3); }
  x.textAlign = "left"; x.fillText("force, in strands", 8, 12); x.textAlign = "right"; x.fillText(`stretch → ${(STRAIN * 100).toFixed(1)}%`, w - 12, h - 7);
  for (const q of curves) { x.strokeStyle = q.c; x.lineWidth = q.id === cur ? 2.4 : 1.2; x.globalAlpha = q.id === cur ? 1 : 0.55; x.beginPath(); q.v.forEach((v, k) => (k ? x.lineTo(X(k + 1), Y(v)) : x.moveTo(X(1), Y(v)))); x.stroke(); } x.globalAlpha = 1; }
const mean = (a) => (a.length ? a.reduce((p, q) => p + q, 0) / a.length : 0);
function table() { const tb = $("tab").tBodies[0], ref = mean(res.strand.peaks); tb.textContent = "";
  SPECIES.forEach((sp, i) => { const r = res[sp.id], n = r.peaks.length, st = n && ref ? mean(r.peaks) / ref : null, tr = document.createElement("tr"); if (sp.id === cur) tr.className = "on";
    const mode = !n ? "" : st < 0.05 ? "falls apart" : r.slip / n > 0.3 ? (r.broke / n > 0.8 ? "slipping, then breaking" : "slipping") : "fibres breaking";
    tr.innerHTML = `<td><i style="background:${COL[i]}"></i>${sp.name}</td><td>${sp.dim}</td><td class="n">${sp.opts.ribbon ? sp.fibres + " + ribbon" : sp.fibres}</td><td class="n ${st === null ? "" : st < 0.05 ? "nil" : "big"}">${st === null ? "…" : st.toFixed(st < 10 ? 2 : 1)} <small>n=${n}</small></td><td class="n">${st === null || sp.opts.ribbon ? "—" : (st / sp.fibres).toFixed(2)}</td><td>${mode}</td>`; tr.addEventListener("click", () => { cur = sp.id; seed = 1; start(); }); tb.append(tr); });
  $("note").innerHTML = done ? `Each strength is the mean of ${SEEDS} samples. The ribbon is a continuous member worth two strands by itself, so those rows are not per fibre. A rope can beat one strand per fibre: friction lets a broken fibre take load again a little way along, so one weak spot costs a short stretch, not the whole fibre.` : "sampling every species in the background…"; }
const worker = new Worker(new URL("./worker.js", import.meta.url), { type: "module" });
worker.onmessage = (ev) => { const m = ev.data; if (m.done) { done = true; table(); return; } const r = res[m.id]; r.peaks.push(m.peak); r.broke += m.broke; r.slip += m.slip; if (m.curve) r.curve = m.curve; table(); plot(); };
worker.postMessage({ seeds: SEEDS });
function tick() { if (live && live.k < STEPS) { live.k++; const F = live.R.pull((STRAIN * (live.R.S - 1) * live.k) / STEPS); live.curve.push(F); live.peak = Math.max(live.peak, F); drawRope(); plot(); const ref = mean(res.strand.peaks) || 0.0071; $("liveS").textContent = `stretch ${((STRAIN * 100 * live.k) / STEPS).toFixed(2)}% · force ${(F / ref).toFixed(2)} strands · peak ${(live.peak / ref).toFixed(2)} · ${live.R.broke} breaks · ${(live.R.slipping() * 100).toFixed(0)}% of contacts slipping`; }
  requestAnimationFrame(tick); }
addEventListener("resize", () => { if (live) { drawRope(); plot(); } });
start(); requestAnimationFrame(tick);

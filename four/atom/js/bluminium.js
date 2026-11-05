/* ATOM⁴ — Bluminium (Bl₂Px₃): its two candidate cells in 4D tiles, and the dopant playground. The data is baked
   (js/bluminiumdata.js, tools/bluminium.mjs); the levels are diagonalized here, live (js/multiplet.js). */
import { BLUMINIUM as B } from "./bluminiumdata.js";
import { firsts } from "./multiplet.js";
import { makeTile, eye, turn } from "./tile.js";

const $ = (id) => document.getElementById(id);
const HA = 27.211386, NM = 1239.842; // eV·nm
const MULT = { 1: "#c79bff", 2: "#6fe0ff", 3: "#8ef0a0", 4: "#ffb46b", 5: "#ff8a7a", 6: "#ffd36b" };
const SPIN = { 1: "singlet", 2: "doublet", 3: "triplet", 4: "quartet", 5: "quintet", 6: "sextet" };
const CAT = "#b9c2ff", AN = "#ff7a6b", DOP = "#ffd36b";
const tilted = () => turn(turn(turn(eye(), 0, 3, 0.55), 1, 2, 0.35), 2, 3, 0.45);
const sub4 = (a, b) => a.map((v, i) => v - b[i]), cart = (H, g) => H[0].map((_, c) => g.reduce((t, v, k) => t + v * H[k][c], 0));
const fmt = (x, d = 2) => (x == null ? "—" : x.toFixed(d));

/* ---------- the cells ---------- */
const SITE_NAME = (cell, i) => { const n = B.cells[cell].sites[i].ligands.length; return `${cell} · ${n}-coordinated site`; };
function cellScene(cell) {
  const C = B.cells[cell], H = C.H, d = 4, corners = [], lines = [];
  for (let m = 0; m < 16; m++) corners.push(cart(H, [0, 1, 2, 3].map((i) => (m >> i) & 1)));
  for (let m = 0; m < 16; m++) for (let i = 0; i < d; i++) if (!((m >> i) & 1)) lines.push([m, m | (1 << i)]);
  const ctr = cart(H, [0.5, 0.5, 0.5, 0.5]), sc = 1 / Math.max(...corners.map((p) => Math.hypot(...sub4(p, ctr))));
  const P = corners.map((p) => sub4(p, ctr).map((v) => v * sc)), pos = C.atoms.map((a) => sub4(cart(H, a.g), ctr).map((v) => v * sc));
  const balls = C.atoms.map((a, i) => ({ p: pos[i], c: a.k ? AN : CAT, r: a.k ? 0.075 : 0.06 })), bonds = [];
  const near = Math.min(...C.sites[0].ligands.map((l) => l.r)) * 1.25 * sc;
  C.atoms.forEach((a, i) => C.atoms.forEach((b2, j) => { if (j > i && a.k !== b2.k && Math.hypot(...sub4(pos[i], pos[j])) < near) bonds.push([i, j]); }));
  return { P, lines, balls, bonds };
}
function siteScene(cell, i) {
  const L = B.cells[cell].sites[i].ligands, sc = 0.85 / Math.max(...L.map((l) => l.r)), balls = [{ p: [0, 0, 0, 0], c: DOP, r: 0.09 }], bonds = [], ghost = [];
  L.forEach((l) => { balls.push({ p: l.v.map((v) => v * sc), c: AN, r: 0.08 }); bonds.push([0, balls.length - 1]); });
  const dd = []; for (let a = 1; a < balls.length; a++) for (let b2 = a + 1; b2 < balls.length; b2++) dd.push([Math.hypot(...sub4(balls[a].p, balls[b2].p)), a, b2]);
  const m = Math.min(...dd.map((x) => x[0])); for (const [r, a, b2] of dd) if (r < 1.45 * m) ghost.push([a, b2]);
  return { balls, bonds, ghost };
}
function buildTiles() {
  const host = $("blTiles"); if (!host) return;
  for (const cell of Object.keys(B.cells)) { const C = B.cells[cell];
    makeTile(host, cellScene(cell), { tab: `${cell} · cell`, title: `${cell}, one cell`, sub: `${C.atoms.filter((a) => !a.k).length} Bl, ${C.atoms.filter((a) => a.k).length} Px in the primitive cell; edges ${C.H.map((h) => Math.hypot(...h).toFixed(2)).join(" · ")} bohr`, start: tilted(), sliceRange: 1.1, R: 0.8 });
    C.sites.forEach((s, i) => makeTile(host, siteScene(cell, i), { tab: `${cell} · ${s.ligands.length}-site`, title: `${SITE_NAME(cell, i)}`, sub: `the dopant (gold) and its ${s.ligands.length} pxygens at ${Math.min(...s.ligands.map((l) => l.r)).toFixed(2)}–${Math.max(...s.ligands.map((l) => l.r)).toFixed(2)} bohr; ghost lines join near neighbours`, start: tilted(), sliceRange: 1 })); }
}

/* ---------- the energies, as the runs report them ---------- */
function buildResults() {
  const R = B.results, el = $("blResults"); if (!el) return;
  const cells = Object.keys(R.relaxed).filter((k) => k !== "note"), scales = [...new Set(cells.flatMap((c) => R.relaxed[c].map((r) => r.scale)))].sort();
  const row = (sc) => { const e = cells.map((c) => R.relaxed[c].find((r) => r.scale === sc)); const diff = e[0] && e[1] ? e[1].E - e[0].E : null;
    return `<tr><td>×${sc.toFixed(2)}</td>${e.map((r) => (r ? `<td>${r.E.toFixed(3)}<small>${r.done ? " ✓" : ` · f ${r.fmax.toExponential(0)}`}</small></td>` : "<td>—</td>")).join("")}<td>${diff == null ? "—" : `${diff > 0 ? "+" : ""}${diff.toFixed(2)}`}</td></tr>`; };
  el.innerHTML = `<div class="tablewrap"><table class="bl"><thead><tr><th>volume</th>${cells.map((c) => `<th>${c}</th>`).join("")}<th>${cells[1]} − ${cells[0]}</th></tr></thead><tbody>${scales.map(row).join("")}</tbody></table></div>
    <p class="read">${R.status}. Energies in eV per Bl₂Px₃ after relaxing the ions (✓ converged; otherwise the largest force left, Ha/bohr). ${R.relaxed.note}.</p>
    <p class="read">Band gaps (unrelaxed, ×1.00): ${cells.map((c) => { const g = R.gaps[c]; return `${c} ${g.gap_eV.toFixed(2)} eV, ${g.direct ? "direct at Γ" : `indirect (${g.vbm} → ${g.cbm}, direct ${g.directGap_eV.toFixed(2)})`}`; }).join("; ")}. ${R.gaps.note}. Sampling still moves the totals: z2-0 at ×1.00 reads ${R.kLadder["z2-0"].map((k) => `${k.E.toFixed(2)} (${k.k})`).join(", ")}.</p>`;
}

/* ---------- the playground ---------- */
const HOSTS = [...Object.keys(B.cells).flatMap((cell) => B.cells[cell].sites.map((_, i) => ({ key: `${cell}:${i}`, label: SITE_NAME(cell, i), d: 4, cell, i }))), { key: "ours", label: "ours: corundum's Al site (ruby's host)", d: 3 }];
const st = { host: HOSTS[0].key, dop: 3, leak: true, s: B.ruby.s, beta: B.ruby.beta };
function current() {
  const h = HOSTS.find((x) => x.key === st.host);
  if (h.d === 3) { const o = B.ours.find((x) => x.n === st.dop) || B.ours.find((x) => x.n === 3); return { m: 5, n: o.n, H: o.H, F: o.F, ang: { m: 5, A: B.A3 }, name: `${o.name} (3d${sup(o.n)}) on corundum's Al site`, d: 3, Z: o.Z }; }
  const o = B.dopants.find((x) => x.n === st.dop) || B.dopants.find((x) => x.n === 3), M = o.on[h.cell][h.i];
  return { m: 9, n: o.n, H: st.leak ? M.leak : M.bare, F: o.F, ang: { m: 9, A: B.A4 }, name: `element ${o.Z}'s 3+ (3d${sup(o.n)}) on ${h.label}`, d: 4, Z: o.Z };
}
const SUP = "⁰¹²³⁴⁵⁶⁷⁸⁹", sup = (n) => String(n).split("").map((c) => SUP[+c]).join("");
const dimOf = (m, n) => { const nu = Math.ceil(n / 2), C = (a, b) => { let r = 1; for (let i = 0; i < b; i++) r = (r * (a - i)) / (i + 1); return r; }; return C(m, nu) * C(m, n - nu); };
function dopOptions() {
  const h = HOSTS.find((x) => x.key === st.host), list = h.d === 3 ? B.ours.map((o) => [o.n, `${o.name} · 3d${sup(o.n)}`]) : B.dopants.map((o) => [o.n, `element ${o.Z} · 3d${sup(o.n)}${dimOf(9, o.n) > 600 ? " (slow)" : ""}`]);
  if (!list.some(([n]) => n === st.dop)) st.dop = 3;
  $("blDop").innerHTML = list.map(([n, t]) => `<option value="${n}"${n === st.dop ? " selected" : ""}>${t}</option>`).join("");
  $("blLeakL").hidden = h.d === 3;
}

/* the solver threads: one for the levels at s, one for the scan; each takes the latest request and drops stale ones */
function channel() {
  const w = new Worker(new URL("./multipletworker.js", import.meta.url), { type: "module" }); w.postMessage({ init: true, A3: B.A3, A4: B.A4 });
  let busy = false, next = null, cb = null, id = 0;
  const send = (c, list, beta, done) => { if (busy) { next = [c, list, beta, done]; return; } busy = true; cb = done; w.postMessage({ id: ++id, m: c.m, n: c.n, H: c.H, F: c.F, beta, list }); };
  w.onmessage = ({ data }) => { busy = false; const f = cb; cb = null; if (next) { const x = next; next = null; send(...x); } else if (f) f(data.error ? null : data.out, data.error); };
  return send;
}
const solveMain = channel(), solveScan = channel();
const LOW = 0.1; // levels this close to the ground are its own split-off partners, mixed by heat and vibration
function verdict(c, L, La, Lb) {
  const pick = (Lx) => { const ms = Lx.multiplets, gs = ms[0].mult, up = ms.filter((x) => x.eV >= LOW); return { allowed: up.find((x) => x.mult === gs), flip: ms.slice(1).find((x) => x.mult !== gs) }; };
  const ms = L.multiplets, g0 = ms[0], f = pick(L), parts = [], near = ms.filter((x, i) => i > 0 && x.eV < LOW && x.mult === g0.mult).reduce((t, x) => t + x.g, 0);
  parts.push(`Ground state: a <b style="color:${MULT[g0.mult]}">${SPIN[g0.mult] || g0.mult}</b>${g0.g > 1 ? ` (${g0.g} orbital states together)` : ""}${near ? `, with ${near} more within ${LOW} eV, its own split partners` : ""}.`);
  const slope = (sel) => { if (!La || !Lb) return null; const x = sel(pick(La)), y = sel(pick(Lb)); return x == null || y == null ? null : (y.eV - x.eV) / (0.04 * st.s); };
  if (f.allowed) parts.push(`Lowest excited state of the same spin: <b>${fmt(f.allowed.eV)} eV</b> (${(NM / f.allowed.eV).toFixed(0)} nm).`);
  const fs = f.flip ? slope((p) => p.flip) : null;
  if (f.flip) parts.push(`Lowest spin flip: a <b style="color:${MULT[f.flip.mult]}">${SPIN[f.flip.mult]}</b> at <b>${fmt(f.flip.eV)} eV</b> (${(NM / f.flip.eV).toFixed(0)} nm)${fs == null ? "" : `, moving ${fmt(fs, 3)} eV per unit of s`}.`);
  let read;
  if (f.flip && (!f.allowed || f.flip.eV < f.allowed.eV) && fs != null && Math.abs(fs) < 0.05) read = `The lowest excited state is a spin flip that barely moves with the field: <b>a sharp, long-lived line</b>, ruby's kind, at ${(NM / f.flip.eV).toFixed(0)} nm.`;
  else if (f.allowed && (!f.flip || f.allowed.eV <= f.flip.eV)) read = `The lowest excited state has the ground state's spin, so it moves with the field and with every vibration: <b>a broad band</b>, the tunable kind.`;
  else if (f.flip) read = `The lowest excited state is a spin flip, but it moves with the field, so vibrations will broaden its line.`;
  else read = `No excited state above ${LOW} eV in the levels solved.`;
  const E = ms.map((x) => x.eV); let gi = -1, gap = 0; for (let i = 1; i + 1 < Math.min(E.length, 40); i++) if (E[i + 1] - E[i] > gap) { gap = E[i + 1] - E[i]; gi = i; }
  if (gi >= 1 && gap > 0.3 && gap > 0.4 * E[gi + 1]) read += ` Its levels fall into two sets with a ${fmt(gap)} eV gap between them: emission from the upper set's bottom to the lower set would run from ${(NM / E[gi + 1]).toFixed(0)} to ${(NM / (E[gi + 1] - E[gi])).toFixed(0)} nm, the shape of a broadband laser.`;
  return parts.join(" ") + `<br>${read}`;
}
function drawLevels(L) {
  const ms = L.multiplets.slice(0, 48), top = Math.max(0.2, ms.at(-1).eV) * 1.05, mults = [...new Set(ms.map((x) => x.mult))].sort((a, b) => b - a);
  const W = 640, Hh = 300, padL = 44, padB = 22, colW = (W - padL - 10) / mults.length, y = (e) => Hh - padB - (e / top) * (Hh - padB - 12);
  let svg = `<svg viewBox="0 0 ${W} ${Hh}" class="levels" role="img" aria-label="energy levels">`;
  for (let t = 0; t <= top; t += top > 4 ? 1 : top > 1.5 ? 0.5 : 0.1) svg += `<line x1="${padL}" x2="${W - 6}" y1="${y(t)}" y2="${y(t)}" class="grid"/><text x="${padL - 6}" y="${y(t) + 4}" text-anchor="end">${t.toFixed(top > 1.5 ? 1 : 2)}</text>`;
  mults.forEach((mu, k) => { const x0 = padL + k * colW + 8, x1 = padL + (k + 1) * colW - 8; svg += `<text x="${(x0 + x1) / 2}" y="${Hh - 6}" text-anchor="middle" fill="${MULT[mu]}">${SPIN[mu] || mu}s</text>`;
    for (const lv of ms.filter((x) => x.mult === mu)) { const w = Math.min(1, 0.25 + lv.g / 12); svg += `<line x1="${x0 + ((1 - w) * (x1 - x0)) / 2}" x2="${x1 - ((1 - w) * (x1 - x0)) / 2}" y1="${y(lv.eV)}" y2="${y(lv.eV)}" stroke="${MULT[mu]}" stroke-width="2.2"><title>${lv.eV.toFixed(3)} eV · ${SPIN[mu]} · ${lv.g} state${lv.g > 1 ? "s" : ""}</title></line>`; } });
  svg += `<text x="10" y="14" class="ax">eV</text></svg>`;
  $("blLevels").innerHTML = svg;
}
/* the same states at every s: the multiplets holding the lowest `n` states (a degenerate term counts all its states) */
const lowestStates = (ms, n) => { const out = []; let k = 0; for (const x of ms) { if (k >= n) break; out.push(x); k += x.g; } return out; };
let scanToken = 0;
function drawScan(c) {
  const tok = ++scanToken, smax = Math.max(2 * B.ruby.s, st.s * 1.2), N = dimOf(c.m, c.n) > 600 ? 8 : 24, pts = [], el = $("blScan");
  const W = 640, Hh = 260, padL = 44, padB = 26, STATES = 60;
  const paint = () => { const top = Math.max(0.2, ...pts.flatMap((p) => p.ms.map((x) => x.eV))) * 1.05, X = (s) => padL + (s / smax) * (W - padL - 10), Y = (e) => Hh - padB - (e / top) * (Hh - padB - 12);
    let svg = `<svg viewBox="0 0 ${W} ${Hh}" class="levels" role="img" aria-label="levels against field strength">`;
    for (let t = 0; t <= top; t += top > 4 ? 1 : top > 1.5 ? 0.5 : 0.1) svg += `<line x1="${padL}" x2="${W - 6}" y1="${Y(t)}" y2="${Y(t)}" class="grid"/><text x="${padL - 6}" y="${Y(t) + 4}" text-anchor="end">${t.toFixed(top > 1.5 ? 1 : 2)}</text>`;
    for (let s = 0; s <= smax + 1e-9; s += 1) svg += `<text x="${X(s)}" y="${Hh - 8}" text-anchor="middle">${s}</text>`;
    svg += `<line x1="${X(B.ruby.s)}" x2="${X(B.ruby.s)}" y1="10" y2="${Hh - padB}" class="mark"/><text x="${X(B.ruby.s) + 4}" y="20" class="ax">ruby's s</text>`;
    svg += `<line x1="${X(st.s)}" x2="${X(st.s)}" y1="10" y2="${Hh - padB}" class="now"/>`;
    for (const p of pts) for (const x of p.ms) svg += `<circle cx="${X(p.s)}" cy="${Y(x.eV)}" r="2.6" fill="${MULT[x.mult]}"><title>s ${p.s.toFixed(2)} · ${x.eV.toFixed(3)} eV · ${SPIN[x.mult]} ×${x.g}</title></circle>`;
    svg += `<text x="10" y="14" class="ax">eV</text><text x="${W - 8}" y="${Hh - 8}" text-anchor="end" class="ax">s</text></svg>`; el.innerHTML = svg; };
  let k = 0; const one = () => { if (tok !== scanToken || k >= N) return; const s = (smax * k) / (N - 1);
    solveScan(c, [s], st.beta, (out) => { if (tok !== scanToken || !out) return; pts.push({ s, ms: lowestStates(out[0].multiplets, STATES) }); k++; paint(); one(); }); };
  el.innerHTML = `<p class="what">solving the scan…</p>`; one();
}
let reqTok = 0;
function update({ scan = true } = {}) {
  $("blSv").textContent = st.s.toFixed(2); $("blBv").textContent = st.beta.toFixed(2);
  const c = current(), dim = dimOf(c.m, c.n), tok = ++reqTok, t = performance.now(); $("blWhat").innerHTML = `${c.name}: ${dim} determinants in the lowest M<sub>S</sub> block.${dim > 600 ? " Big: each solve takes seconds." : ""}`;
  if (dim > 600) $("blVerdict").innerHTML = "solving…";
  solveMain(c, st.s > 0 && dim <= 600 ? [st.s, st.s * 0.98, st.s * 1.02] : [st.s], st.beta, (out, err) => { if (tok !== reqTok) return; if (!out) { $("blVerdict").textContent = err || "the solve failed"; return; }
    drawLevels(out[0]); $("blVerdict").innerHTML = verdict(c, out[0], out[1], out[2]); $("blTime").textContent = `${(performance.now() - t).toFixed(0)} ms${out.length > 1 ? " (three solves, for the slope)" : ""}`; });
  if (scan) drawScan(c);
}
function buildPlayground() {
  if (!$("blPlay")) return;
  $("blHost").innerHTML = HOSTS.map((h) => `<option value="${h.key}">${h.label}</option>`).join(""); dopOptions();
  $("blHost").onchange = (e) => { st.host = e.target.value; dopOptions(); update(); };
  $("blDop").onchange = (e) => { st.dop = +e.target.value; update(); };
  $("blLeak").onchange = (e) => { st.leak = e.target.checked; update(); };
  $("blS").value = st.s; $("blB").value = st.beta;
  $("blS").oninput = (e) => { st.s = +e.target.value; update({ scan: false }); }; $("blS").onchange = () => update();
  $("blB").oninput = (e) => { st.beta = +e.target.value; update({ scan: false }); }; $("blB").onchange = () => update();
  $("blRuby").onclick = () => { st.s = B.ruby.s; st.beta = B.ruby.beta; $("blS").value = st.s; $("blB").value = st.beta; update(); };
  $("blBare").onclick = () => { st.s = 1; st.beta = 1; $("blS").value = 1; $("blB").value = 1; update(); };
  $("blRubyS").textContent = B.ruby.s.toFixed(2); $("blRubyB").textContent = B.ruby.beta.toFixed(2);
  update();
}

buildTiles(); buildResults(); buildPlayground();

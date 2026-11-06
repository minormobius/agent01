/* ATOM⁴ — Hund's rule, and how four dimensions breaks it (hund.html). Everything drawn is computed here from the same
   integrals the paper uses: the angular tensors of the d shell (js/bluminiumdata.js), the term solver (js/multiplet.js),
   the radial parts of real atoms (papers/p1/data/hund-law.json) and the survey of the 4D table (papers/p1/data/hund.json).
   For two electrons in a d shell each state's energy is exactly E = F⁰ + a₂F² + a₄F⁴, where a_n = ⟨C_n(cos γ)⟩ over the
   state and γ is the angle between the two electrons as seen from the nucleus; so a₂ says how much the state lets the
   two line up along a common axis, and the pair's angular distribution follows from a₂ and a₄ alone. */
import { BLUMINIUM as B } from "./bluminiumdata.js";
import { levels } from "./multiplet.js";

const $ = (id) => document.getElementById(id);
const C = { trip: "#ffb46b", sing: "#6fe0ff", quart: "#ffb46b", dbl: "#6fe0ff", grid: "#1b1d26", dim: "#9a958c", text: "#e9e4da", bad: "#ff7a6b", good: "#8ef0a0", plus: [255, 122, 107], minus: [111, 183, 255] };
const SPIN = { 1: "singlet", 2: "doublet", 3: "triplet", 4: "quartet" };

/* ---------- the d² states and their weights a₂, a₄ ---------- */
const NAME = { 3: { "3x7": "³F", "3x3": "³P", "1x9": "¹G", "1x5": "¹D", "1x1": "¹S" }, 4: { "1x10": "¹(2,0)⊕(0,2)", "3x30": "³(2,1)⊕(1,2)", "1x25": "¹(2,2)", "1x9": "¹(1,1)", "3x6": "³(1,0)⊕(0,1)", "1x1": "¹(0,0)" } };
function termsOf(d) { const m = d === 3 ? 5 : 9, A = d === 3 ? B.A3 : B.A4, z = Array.from({ length: m }, () => new Float64Array(m)), run = (x) => levels(m, 2, z, 0, { m, A }, [0, 1, x], 1).multiplets;
  const L1 = run(0.3), L2 = run(0.6); return L1.map((t) => { const t2 = L2.find((x) => x.mult === t.mult && x.g === t.g), a4 = (t2.Eabs - t.Eabs) / 0.3, a2 = t.Eabs - 0.3 * a4;
    return { mult: t.mult, g: t.g, a2, a4, name: NAME[d][`${t.mult}x${t.g}`] ?? `${t.mult}×${t.g}`, cos2: d === 3 ? (2 * a2 + 1) / 3 : (a2 + 1) / 4 }; }); }
const TERMS = { 3: termsOf(3), 4: termsOf(4) };
/* Gegenbauer C_n^λ, λ = (D − 2)/2, and the pair's density in the angle γ between the electrons:
   P(γ) = sin^(D−2)γ [1/h₀ + a₂C₂/h₂ + a₄C₄/h₄], normalized */
const gegen = (lam, n, t) => { if (n === 0) return 1; if (lam === 0.5) { let p0 = 1, p1 = t; for (let k = 2; k <= n; k++) { const p2 = ((2 * k - 1) * t * p1 - (k - 1) * p0) / k; p0 = p1; p1 = p2; } return p1; } let c0 = 1, c1 = 2 * lam * t; for (let k = 2; k <= n; k++) { const c2 = (2 * t * (k + lam - 1) * c1 - (k + 2 * lam - 2) * c0) / k; c0 = c1; c1 = c2; } return c1; };
const H = { 3: [2, 0.4, 2 / 9], 4: [Math.PI / 2, Math.PI / 2, Math.PI / 2] };
const pairDensity = (d, t, g) => { const lam = (d - 2) / 2, x = Math.cos(g), w = Math.sin(g) ** (d - 2) * Math.sin(g); return Math.max(0, w * (1 / H[d][0] + (t.a2 * gegen(lam, 2, x)) / H[d][1] + (t.a4 * gegen(lam, 4, x)) / H[d][2])); };
const randomDensity = (d, g) => Math.sin(g) ** (d - 2) * Math.sin(g) / H[d][0];

/* ---------- 1 · boxes and arrows ---------- */
const SHELLS = [{ key: "3p", label: "ours · p (3 orbitals)", d: 3, m: 3, l: 1 }, { key: "3d", label: "ours · d (5)", d: 3, m: 5, l: 2 }, { key: "4p", label: "4D · p (4)", d: 4, m: 4, l: 1 }, { key: "4d", label: "4D · d (9)", d: 4, m: 9, l: 2 }, { key: "4f", label: "4D · f (16)", d: 4, m: 16, l: 3 }];
let HUND = null; // from the survey: which fillings break the rule
function verdictFor(sh, n) {
  if (sh.d === 3) return { holds: true, why: "every open subshell of our table keeps the rule" };
  if (!HUND) return { holds: null };
  const rows = HUND.filter((r) => r.d === 4 && r.l === sh.l && r.n === n);
  if (!rows.length) return { holds: null, why: "no element of the table has this filling as its open shell" };
  const bad = rows.filter((r) => !r.hund); if (bad.length) { const gs = bad.map((r) => Math.abs(r.belowMax_eV)); return { holds: false, gap: Math.max(...gs), gapMin: Math.min(...gs), S: bad[0].groundS, els: bad.map((r) => r.Z) }; }
  return { holds: true, els: rows.map((r) => r.Z), bound: rows.some((r) => !r.complete) };
}
const boxState = { shell: "4d", n: 2 };
function drawBoxes() {
  const sh = SHELLS.find((s) => s.key === boxState.shell), n = Math.min(boxState.n, 2 * sh.m); $("bxN").max = 2 * sh.m; $("bxN").value = n; $("bxNv").textContent = n;
  const v = verdictFor(sh, n), W = 640, bw = Math.min(56, (W - 20) / sh.m - 6), Hh = 120, x0 = (W - sh.m * (bw + 6)) / 2;
  const up = Math.min(n, sh.m), dn = n - up; let svg = `<svg viewBox="0 0 ${W} ${Hh}" class="fig" role="img" aria-label="orbitals as boxes">`;
  for (let i = 0; i < sh.m; i++) { const x = x0 + i * (bw + 6); svg += `<rect x="${x}" y="30" width="${bw}" height="56" rx="6" class="box"/>`;
    const arrow = (cx, dir, col) => `<path d="M${cx} ${dir > 0 ? 78 : 38} L${cx} ${dir > 0 ? 40 : 76} M${cx - 6} ${dir > 0 ? 48 : 68} L${cx} ${dir > 0 ? 40 : 76} L${cx + 6} ${dir > 0 ? 48 : 68}" stroke="${col}" stroke-width="3" fill="none" stroke-linecap="round"/>`;
    const broken = v.holds === false;
    if (broken) { // a sketch of the lower-spin state: as many up as its spin needs, the rest down, spread one to a box first
      const nUp = (n + 2 * v.S) / 2, nDn = n - nUp, ups = Math.min(nUp, sh.m), slots = []; for (let k = 0; k < sh.m; k++) slots.push({ u: 0, d: 0 });
      for (let k = 0; k < ups; k++) slots[k].u = 1; let left = nDn; for (let k = sh.m - 1; k >= 0 && left > 0; k--) if (!slots[k].d && (slots[k].u ? n > sh.m : true)) { slots[k].d = 1; left--; } for (let k = 0; k < sh.m && left > 0; k++) if (!slots[k].d) { slots[k].d = 1; left--; }
      if (slots[i].u) svg += arrow(x + (slots[i].d ? bw / 3 : bw / 2), 1, C.sing); if (slots[i].d) svg += arrow(x + (slots[i].u ? (2 * bw) / 3 : bw / 2), -1, C.sing); }
    else { if (i < up) svg += arrow(x + bw / 3, 1, C.trip); if (i < dn) svg += arrow(x + (2 * bw) / 3, -1, C.trip); } }
  if (v.holds === false) svg += `<text x="${W / 2}" y="112" text-anchor="middle" class="lbl" fill="${C.sing}">a sketch: the real state blends many such arrangements, spin ${v.S}</text>`;
  svg += `</svg>`; $("bxFig").innerHTML = svg;
  const S = v.holds === false ? v.S : Math.min(n, 2 * sh.m - n) / 2;
  $("bxSay").innerHTML = n === 0 ? "An empty subshell." : v.holds === false
    ? `<b class="bad">Hund's rule breaks here.</b> Parallel spins would give spin ${Math.min(n, 2 * sh.m - n) / 2}. The true lowest state has spin ${v.S}, lower by ${v.gapMin === v.gap ? v.gap.toFixed(2) : `${v.gapMin.toFixed(2)}–${v.gap.toFixed(2)}`} eV${v.els ? ` (element${v.els.length > 1 ? "s" : ""} ${v.els.join(", ")})` : ""}. It can't be drawn as one set of arrows in boxes: it is a blend of many arrangements.`
    : `${n <= sh.m ? "One to a box, all spins the same way" : "Every box has one; the extras pair up, spin opposite"}: spin ${S}.${v.holds === true ? (sh.d === 3 ? " In our world that is always the lowest state." : ` In the 4D table this filling keeps the rule${v.els?.length ? ` (element${v.els.length > 1 ? "s" : ""} ${v.els.join(", ")})` : ""}${v.bound ? "; for the biggest fillings only the highest spins could be checked" : ""}.`) : v.why ? ` ${v.why}.` : " Not surveyed yet."}`;
}

/* ---------- 2 · the orbitals on the sphere ---------- */
const ORB = { 3: [["xy", (x, y, z) => 2 * x * y], ["yz", (x, y, z) => 2 * y * z], ["xz", (x, y, z) => 2 * x * z], ["x²−y²", (x, y) => x * x - y * y], ["3z²−r²", (x, y, z) => (3 * z * z - 1) / 2]],
  4: [["xy", (x, y) => 2 * x * y], ["xz", (x, y, z) => 2 * x * z], ["xw", (x, y, z, w) => 2 * x * w], ["yz", (x, y, z) => 2 * y * z], ["yw", (x, y, z, w) => 2 * y * w], ["zw", (x, y, z, w) => 2 * z * w], ["x²−y²", (x, y) => x * x - y * y], ["x²+y²−2z²", (x, y, z) => (x * x + y * y - 2 * z * z) / 2], ["x²+y²+z²−3w²", (x, y, z, w) => (x * x + y * y + z * z - 3 * w * w) / 3]] };
const orbState = { d: 4, i: 0, w: 0.3, rx: 0.5, ry: 0.4, spin: true };
function drawOrbital() {
  const cv = $("orbCv"), g = cv.getContext("2d"), N = cv.width, img = g.createImageData(N, N), f = ORB[orbState.d][orbState.i][1], R = N / 2 - 4;
  const { rx, ry } = orbState, cx = Math.cos(rx), sx = Math.sin(rx), cy = Math.cos(ry), sy = Math.sin(ry), w = orbState.d === 4 ? orbState.w : 0, rr = Math.sqrt(Math.max(0, 1 - w * w));
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) { const X = (i - N / 2) / R, Y = -(j - N / 2) / R, q = X * X + Y * Y; if (q > 1) continue; const Z = Math.sqrt(1 - q);
    // the view point on the unit sphere, turned back into the orbital's frame
    let x = X, y = Y * cx - Z * sx, z = Y * sx + Z * cx; const x2 = x * cy + z * sy, z2 = -x * sy + z * cy; x = x2; z = z2;
    const v = orbState.d === 3 ? f(x, y, z) : f(rr * x, rr * y, rr * z, w), a = Math.min(1, Math.abs(v)), col = v >= 0 ? C.plus : C.minus, shade = 0.35 + 0.65 * Z, base = 40;
    const k = (j * N + i) * 4; for (let c = 0; c < 3; c++) img.data[k + c] = Math.round((base + (col[c] - base) * a) * shade); img.data[k + 3] = 255; }
  g.clearRect(0, 0, N, N); g.putImageData(img, 0, 0);
  const nm = ORB[orbState.d][orbState.i][0]; $("orbSay").innerHTML = orbState.d === 3 ? `Ours: <b>${nm}</b>, one of five. Red where the orbital is positive, blue where negative; the brighter, the larger.` : `4D: <b>${nm}</b>, one of nine, seen on the slice of the 3-sphere at w = ${w.toFixed(2)} (a sphere of radius ${rr.toFixed(2)}).${/w/.test(nm) && Math.abs(w) < 0.02 ? " At w = 0 an orbital that involves w vanishes: slide w to see it." : ""}`;
}
function buildOrbitals() {
  const host = $("orbBtns"), redraw = () => { host.innerHTML = ORB[orbState.d].map(([nm], i) => `<button type="button" class="${i === orbState.i ? "on" : ""}" data-i="${i}">${nm}</button>`).join(""); host.querySelectorAll("button").forEach((b) => (b.onclick = () => { orbState.i = +b.dataset.i; redraw(); drawOrbital(); })); $("orbWl").hidden = orbState.d === 3; };
  document.querySelectorAll("[data-orbd]").forEach((b) => (b.onclick = () => { orbState.d = +b.dataset.orbd; orbState.i = 0; document.querySelectorAll("[data-orbd]").forEach((x) => x.classList.toggle("on", x === b)); redraw(); drawOrbital(); }));
  $("orbW").oninput = (e) => { orbState.w = +e.target.value; $("orbWv").textContent = orbState.w.toFixed(2); drawOrbital(); };
  const cv = $("orbCv"); let drag = null; cv.addEventListener("pointerdown", (e) => { drag = { x: e.clientX, y: e.clientY }; orbState.spin = false; cv.setPointerCapture(e.pointerId); });
  cv.addEventListener("pointermove", (e) => { if (!drag) return; orbState.ry += (e.clientX - drag.x) * 0.01; orbState.rx += (e.clientY - drag.y) * 0.01; drag = { x: e.clientX, y: e.clientY }; drawOrbital(); });
  cv.addEventListener("pointerup", () => (drag = null));
  let last = 0; const tick = (t) => { if (orbState.spin && t - last > 60 && document.visibilityState === "visible") { orbState.ry += 0.03; drawOrbital(); last = t; } requestAnimationFrame(tick); }; requestAnimationFrame(tick);
  redraw(); drawOrbital();
}

/* ---------- 3 · how far apart two electrons stay ---------- */
const sepState = { d: 4 };
function drawSeparation() {
  const d = sepState.d, T = TERMS[d], W = 640, Hh = 300, pl = 44, pb = 30, N = 180, gs = Array.from({ length: N + 1 }, (_, i) => (Math.PI * i) / N);
  const curves = T.map((t) => ({ t, ys: gs.map((g) => pairDensity(d, t, g)) })), rnd = gs.map((g) => randomDensity(d, g)), top = Math.max(...curves.flatMap((c) => c.ys), ...rnd) * 1.08;
  const X = (g) => pl + (g / Math.PI) * (W - pl - 10), Y = (v) => Hh - pb - (v / top) * (Hh - pb - 12);
  let svg = `<svg viewBox="0 0 ${W} ${Hh}" class="fig" role="img" aria-label="how far apart the two electrons stay">`;
  for (const deg of [0, 45, 90, 135, 180]) svg += `<line x1="${X((deg * Math.PI) / 180)}" x2="${X((deg * Math.PI) / 180)}" y1="10" y2="${Hh - pb}" stroke="${C.grid}"/><text x="${X((deg * Math.PI) / 180)}" y="${Hh - 10}" text-anchor="middle" class="lbl">${deg}°</text>`;
  svg += `<path d="${rnd.map((v, i) => `${i ? "L" : "M"}${X(gs[i]).toFixed(1)} ${Y(v).toFixed(1)}`).join("")}" stroke="${C.dim}" stroke-dasharray="4 4" fill="none"/>`;
  const lowest = [...T].sort((a, b) => a.a2 - b.a2)[0];
  for (const c of curves) { const col = c.t.mult === 3 ? C.trip : C.sing, wgt = c.t === lowest || (c.t.mult === 3 && c.t === [...T].filter((x) => x.mult === 3).sort((a, b) => a.a2 - b.a2)[0]) ? 3 : 1.3;
    svg += `<path d="${c.ys.map((v, i) => `${i ? "L" : "M"}${X(gs[i]).toFixed(1)} ${Y(v).toFixed(1)}`).join("")}" stroke="${col}" stroke-width="${wgt}" fill="none" opacity="${wgt > 2 ? 1 : 0.45}"><title>${c.t.name}: ⟨cos²γ⟩ ${c.t.cos2.toFixed(3)}</title></path>`; }
  svg += `<text x="${W - 12}" y="24" text-anchor="end" class="lbl">angle between the two electrons, seen from the nucleus</text></svg>`;
  $("sepFig").innerHTML = svg;
  const rows = [...T].sort((a, b) => a.cos2 - b.cos2).map((t) => `<tr><td style="color:${t.mult === 3 ? C.trip : C.sing}">${t.name}</td><td>${SPIN[t.mult]}</td><td>${t.g}</td><td>${t.cos2.toFixed(3)}</td><td>${t.a2 >= 0 ? "+" : "−"}${Math.abs(t.a2).toFixed(3)}</td><td>${t.a4 >= 0 ? "+" : "−"}${Math.abs(t.a4).toFixed(3)}</td></tr>`).join("");
  $("sepTable").innerHTML = `<div class="tablewrap"><table class="hd"><thead><tr><th>state</th><th>spins</th><th>orbital states</th><th>⟨cos²γ⟩ (random ${d === 3 ? "0.333" : "0.250"})</th><th>a₂</th><th>a₄</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}

/* ---------- 4 · the ladder ---------- */
let REAL = null; // F's of real atoms (hund-law.json)
const ladState = { ratio: 0.39 };
function drawLadder() {
  const r = ladState.ratio; $("ldRv").textContent = r.toFixed(2);
  const W = 760, Hh = 340, col = (W - 60) / 2, out = [];
  let svg = `<svg viewBox="0 0 ${W} ${Hh}" class="fig" role="img" aria-label="the two-electron levels as the repulsion's parts change">`;
  [3, 4].forEach((d, k) => { const T = TERMS[d].map((t) => ({ ...t, E: t.a2 + r * t.a4 })), E0 = Math.min(...T.map((t) => t.E)), span = Math.max(...T.map((t) => t.E)) - E0 || 1, x0 = 40 + k * (col + 20), x1 = x0 + col;
    const Y = (e) => Hh - 40 - ((e - E0) / span) * (Hh - 80), low = T.find((t) => t.E === E0);
    svg += `<text x="${(x0 + x1) / 2}" y="20" text-anchor="middle" class="ttl">${d === 3 ? "ours: 5 d orbitals" : "four dimensions: 9 d orbitals"}</text>`;
    const placed = []; for (const t of [...T].sort((a, b) => a.E - b.E)) { const y = Y(t.E), c = t.mult === 3 ? C.trip : C.sing, isLow = t === low, xm = t.mult === 3 ? x0 + 6 : x0 + col / 2 + 6, xe = xm + col / 2 - 132;
      let ly = y + 4; for (const p of placed) if (p.x === xm && Math.abs(p.y - ly) < 12) ly = p.y - 12; placed.push({ x: xm, y: ly });
      svg += `<line x1="${xm}" x2="${xe}" y1="${y}" y2="${y}" stroke="${c}" stroke-width="${isLow ? 4 : 2}"/><text x="${xe + 4}" y="${ly}" class="lbl" fill="${c}">${t.name} ×${t.g}</text>`; }
    svg += `<text x="${x0 + col / 4}" y="${Hh - 14}" text-anchor="middle" class="lbl" fill="${C.trip}">triplets</text><text x="${x0 + (3 * col) / 4}" y="${Hh - 14}" text-anchor="middle" class="lbl" fill="${C.sing}">singlets</text>`;
    out.push({ d, low }); });
  svg += `</svg>`; $("ldFig").innerHTML = svg;
  const say = out.map(({ d, low }) => `${d === 3 ? "Ours" : "4D"}: lowest is <b style="color:${low.mult === 3 ? C.trip : C.sing}">${low.name}</b>, a ${SPIN[low.mult]}: Hund's rule ${low.mult === 3 ? `<b class="good">holds</b>` : `<b class="bad">breaks</b>`}.`).join(" ");
  $("ldSay").innerHTML = `${say} In four dimensions the singlet stays lowest for every F⁴/F² below 5/3; in ours the triplet ³F is lowest for every value.`;
}
function buildLadder() {
  $("ldR").oninput = (e) => { ladState.ratio = +e.target.value; drawLadder(); };
  if (REAL) { const btns = REAL.map((c) => ({ c, r: c.F_eV[2] / c.F_eV[1] })).filter((x) => ["law", "gauss", "ours"].includes(x.c.id));
    $("ldReal").innerHTML = btns.map((x) => `<button type="button" data-r="${x.r}">${x.c.id === "law" ? "4D element 26 (the pinned 1/r)" : x.c.id === "gauss" ? "the same orbital under Gauss's 1/r²" : "our titanium"}: ${x.r.toFixed(2)}</button>`).join("");
    const gr = btns.find((x) => x.c.id === "gauss"); if (gr && $("gaussR")) $("gaussR").textContent = gr.r.toFixed(2);
    $("ldReal").querySelectorAll("button").forEach((b) => (b.onclick = () => { ladState.ratio = +b.dataset.r; $("ldR").value = ladState.ratio; drawLadder(); })); }
  drawLadder();
}

/* ---------- 5 · across the table ---------- */
function drawTable() {
  if (!HUND) { $("tbFig").innerHTML = `<p class="what">The survey (papers/p1/data/hund.json) didn't load.</p>`; return; }
  const rows = HUND.filter((r) => r.d === 4 && r.l >= 2).sort((a, b) => a.Z - b.Z), cell = (r) => { const bad = !r.hund; return `<div class="el ${bad ? "bad" : "ok"}" title="element ${r.Z}: ${r.shell}${r.n}, ground spin ${r.groundS} of ${r.Smax}${bad ? `, ${Math.abs(r.belowMax_eV).toFixed(2)} eV below the maximum-spin term` : ""}${r.complete ? "" : " (bound)"}"><b>${r.Z}</b><span>${r.shell}${r.n}</span>${bad ? `<i>${Math.abs(r.belowMax_eV).toFixed(2)}</i>` : ""}</div>`; };
  const groups = [["3d row", (r) => r.shell === "3d"], ["4d row", (r) => r.shell === "4d"], ["4f block", (r) => r.shell === "4f"], ["5d row", (r) => r.shell === "5d"]];
  $("tbFig").innerHTML = groups.map(([t, f]) => `<h5>${t}</h5><div class="els">${rows.filter(f).map(cell).join("")}</div>`).join("");
  const n4 = HUND.filter((r) => r.d === 4), n3 = HUND.filter((r) => r.d === 3);
  $("tbSay").innerHTML = `${n4.length} open subshells of the 4D table surveyed (${n4.filter((r) => r.l === 1).length} p, all keep the rule), and ${n3.length} of ours (all keep it). Red: Hund's rule breaks, with the gap in eV. For the middle of the f block only the highest spins could be run, so there the verdict is a bound.`;
}

/* ---------- start ---------- */
async function main() {
  try { HUND = (await (await fetch("../papers/p1/data/hund.json")).json()).rows; } catch { HUND = null; }
  try { REAL = (await (await fetch("../papers/p1/data/hund-law.json")).json()).cases; } catch { REAL = null; }
  $("bxShell").innerHTML = SHELLS.map((s) => `<option value="${s.key}"${s.key === boxState.shell ? " selected" : ""}>${s.label}</option>`).join("");
  $("bxShell").onchange = (e) => { boxState.shell = e.target.value; drawBoxes(); }; $("bxN").oninput = (e) => { boxState.n = +e.target.value; drawBoxes(); };
  drawBoxes(); buildOrbitals();
  document.querySelectorAll("[data-sepd]").forEach((b) => (b.onclick = () => { sepState.d = +b.dataset.sepd; document.querySelectorAll("[data-sepd]").forEach((x) => x.classList.toggle("on", x === b)); drawSeparation(); }));
  drawSeparation(); buildLadder(); drawTable();
  const t4 = TERMS[4], s10 = t4.find((t) => t.g === 10), t30 = t4.find((t) => t.g === 30), t3 = TERMS[3].find((t) => t.g === 7), d1 = TERMS[3].find((t) => t.mult === 1 && t.g === 5);
  $("keyNums").innerHTML = `In ours the triplet ³F keeps ⟨cos²γ⟩ at ${t3.cos2.toFixed(3)} and the best singlet, ¹D, only ${d1.cos2.toFixed(3)} (random: 0.333). In four dimensions the best triplet reaches ${t30.cos2.toFixed(3)}, but the ten-state singlet reaches <b>${s10.cos2.toFixed(3)}</b>, half of random (0.250).`;
}
main();

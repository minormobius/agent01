/* ORBITAL — the page. The atom is ./hydrogen.js (exact, no DOM). Three panes:
     YOUR SLICE: a 3D slice of the 4D atom (the slice's three axes E0, E1, E2 and the way it can't see, N, all in x y z
       w; O how far ana it sits), the cloud volume-rendered, bright where |ψ|² is, teal where ψ > 0, rose where ψ < 0;
     OURS: the same orbital in our 3D atom, when there is one, whole;
     THE DARTBOARD: electrons thrown at both clouds (drawn from |ψ|²), counted by how far out they land, against the
       exact P(r) = r^{d−1} R². */
import { state, harmonics, twin, sampler, hybrids, radial, mixSampler, psiOf } from "./hydrogen.js";
const $ = (id) => document.getElementById(id), glc = $("gl"), ov = $("ov");
const add = (a, b, k = 1) => a.map((v, i) => v + k * b[i]), dot = (a, b) => a.reduce((s, v, i) => s + v * b[i], 0), unit = (v) => { const m = Math.hypot(...v); return v.map((x) => x / m); };
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

/* ------------------------------------------------------------------ GL */
const gl = glc.getContext("webgl2", { antialias: false });
if (!gl) { document.body.innerHTML = `<p style="padding:20px;font-family:monospace">ORBITAL needs WebGL2.</p>`; throw new Error("no WebGL2"); }
const VS = `#version 300 es
in vec2 aPos; void main() { gl_Position = vec4(aPos, 0.0, 1.0); }`;
const FS = `#version 300 es
precision highp float;
uniform vec4 uVP, uO, uE0, uE1, uE2, uPoly, uB; uniform mat4 uQ; uniform vec3 uEye, uCR, uCU, uCF;
uniform float uTan, uBox, uK, uNorm, uC0, uDmax, uGain;
// a second radial part, for the odd (p) piece of a mix (a hybrid: ns + np); and the hybrids, all at once (uHyb)
uniform vec4 uPoly2; uniform float uNorm2; uniform int uHyb, uNH; uniform vec4 uDir[5]; uniform vec3 uHC[5];
uniform mat4 uM3[4]; uniform int uHasC3; // f: the cubic as Σ_i x_i · xᵀ M_i x (each monomial x_i x_j x_k, i ≤ j ≤ k, in M_i)
out vec4 o;
// the two radial parts at r (same n, so the same κ): norm e^{−κr} L(2κr), the even piece's and the odd piece's
vec2 radial2(vec4 p) {
  float r = length(p), rho = 2.0 * uK * r, e = exp(-uK * r);
  return vec2(uNorm * e * (uPoly.x + rho * (uPoly.y + rho * (uPoly.z + rho * uPoly.w))), uNorm2 * e * (uPoly2.x + rho * (uPoly2.y + rho * (uPoly2.z + rho * uPoly2.w))));
}
// ψ: the even piece times c0 + xᵀQx, plus the odd piece times b·x
float cubic(vec4 p) { if (uHasC3 == 0) return 0.0; return p.x * dot(p, uM3[0] * p) + p.y * dot(p, uM3[1] * p) + p.z * dot(p, uM3[2] * p) + p.w * dot(p, uM3[3] * p); }
float psi(vec4 p) { vec2 q = radial2(p); return q.x * (uC0 + dot(p, uQ * p)) + q.y * (dot(uB, p) + cubic(p)); }
void main() {
  vec2 q = (2.0 * (gl_FragCoord.xy - uVP.xy) - uVP.zw) / uVP.w;
  vec3 d = normalize(uCF + q.x * uTan * uCR + q.y * uTan * uCU), bg = vec3(0.025, 0.03, 0.045) + 0.025 * q.y, inv = 1.0 / d;
  vec3 t0v = (-vec3(uBox) - uEye) * inv, t1v = (vec3(uBox) - uEye) * inv, tmin = min(t0v, t1v), tmax = max(t0v, t1v);
  float t0 = max(max(tmin.x, tmin.y), max(tmin.z, 0.0)), t1 = min(min(tmax.x, tmax.y), tmax.z);
  vec3 c = bg;
  if (t1 > t0) {
    const int S = 150; float dt = (t1 - t0) / float(S), A = 0.0; vec3 acc = vec3(0.0);
    for (int i = 0; i < S; i++) {
      vec3 P = uEye + d * (t0 + (float(i) + 0.5) * dt); vec4 X = uO + P.x * uE0 + P.y * uE1 + P.z * uE2; float dens; vec3 col;
      if (uHyb == 0) { float v = psi(X); dens = v * v / uDmax; col = (v > 0.0 ? vec3(0.3, 1.0, 0.88) : vec3(1.0, 0.42, 0.7)) * (0.55 + 0.9 * sqrt(dens)); }
      else { // every hybrid at once, each its own colour (its small back lobe darker)
        vec2 q = radial2(X); float tot = 0.0; vec3 cc = vec3(0.0);
        float w3 = 0.0; for (int k = 0; k < 5; k++) { if (k >= uNH) break; float v = q.x * uC0 + q.y * dot(uDir[k], X), dn = v * v / uDmax, s3 = dn * dn * dn; tot += dn; w3 += s3; cc += s3 * uHC[k] * (v > 0.0 ? 1.0 : 0.4); }
        dens = tot; col = cc / max(w3, 1e-30) * (0.55 + 0.9 * sqrt(tot)); // coloured by whichever hybrid dominates there
      }
      float a = 1.0 - exp(-dens * uGain * dt / uBox * 9.0);
      acc += (1.0 - A) * a * col; A += (1.0 - A) * a; if (A > 0.98) break;
    }
    c = acc + (1.0 - A) * bg;
  }
  o = vec4(c / (1.0 + 0.15 * c), 1.0);
}`;
const sh = (t, s) => { const x = gl.createShader(t); gl.shaderSource(x, s); gl.compileShader(x); if (!gl.getShaderParameter(x, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(x)); return x; };
const prog = gl.createProgram(); gl.attachShader(prog, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FS)); gl.linkProgram(prog);
if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
gl.useProgram(prog);
const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
const aPos = gl.getAttribLocation(prog, "aPos"); gl.enableVertexAttribArray(aPos); gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);
const U = {}; for (const n of ["uVP", "uO", "uE0", "uE1", "uE2", "uPoly", "uB", "uQ", "uEye", "uCR", "uCU", "uCF", "uTan", "uBox", "uK", "uNorm", "uC0", "uDmax", "uGain", "uPoly2", "uNorm2", "uHyb", "uNH", "uDir", "uHC", "uM3", "uHasC3"]) U[n] = gl.getUniformLocation(prog, n);

/* ------------------------------------------------------------------ the orbital */
/* an orbital here is a list of parts { st, h, c } (one part for s, p, d; two for a hybrid, ns and np), with its radial
   numbers, its electron sampler, and, for "all the hybrids", the list of them */
const pad4 = (v) => [...v, 0, 0, 0, 0].slice(0, 4);
const HC = [[0.3, 1, 0.88], [1, 0.82, 0.35], [1, 0.42, 0.7], [0.68, 0.52, 1], [0.6, 1, 0.4]];
function orbital(parts, all = null) {
  const rad = radial(parts), d = parts[0].st.d;
  const draw = all ? (() => { const ds = all.map((q) => mixSampler(q.parts)); return () => { const k = Math.floor(Math.random() * ds.length), x = ds[k](); x.k = k; return x; }; })() : parts.length === 1 ? sampler(parts[0].st, parts[0].h) : mixSampler(parts);
  const o = { d, parts, all, ...rad, E: parts[0].st.E, nr: parts.length === 1 ? parts[0].st.nr : 0, draw };
  o.dmax = densest((x) => psiOf(parts, x) ** 2, o.r99, d); return o;
}
function upload(o) { // the orbital's numbers as the shader wants them (3D ones padded with w = 0)
  let even = null, odd = null; for (const p of o.parts) { if (p.h.b.some((v) => v) || (p.h.cubic && p.h.cubic.some((v) => v))) odd = p; else even = p; }
  const Q = new Float32Array(16); if (even) for (let i = 0; i < even.h.Q.length; i++) for (let j = 0; j < even.h.Q.length; j++) Q[j * 4 + i] = even.h.Q[i][j];
  gl.uniform1f(U.uK, o.parts[0].st.kappa); gl.uniformMatrix4fv(U.uQ, false, Q);
  gl.uniform4fv(U.uPoly, pad4(even ? even.st.poly : [])); gl.uniform1f(U.uNorm, even ? even.c * even.st.norm : 0); gl.uniform1f(U.uC0, even ? even.h.c0 : 0);
  gl.uniform4fv(U.uPoly2, pad4(odd ? odd.st.poly : [])); gl.uniform1f(U.uNorm2, odd ? odd.c * odd.st.norm : 0); gl.uniform4fv(U.uB, pad4(odd ? odd.h.b : [])); const c3 = odd && odd.h.cubic, M = new Float32Array(64);
  if (c3) { let n = 0; for (let i = 0; i < 4; i++) for (let j = i; j < 4; j++) for (let k = j; k < 4; k++, n++) { const c = c3[n]; if (!c) continue; if (j === k) M[16 * i + 4 * j + k] += c; else { M[16 * i + 4 * j + k] += c / 2; M[16 * i + 4 * k + j] += c / 2; } } }
  gl.uniformMatrix4fv(U.uM3, false, M); gl.uniform1i(U.uHasC3, c3 ? 1 : 0);
  gl.uniform1i(U.uHyb, o.all ? 1 : 0);
  if (o.all) { const D = new Float32Array(20), C = new Float32Array(15); o.all.forEach((q, k) => { D.set(pad4(q.parts[1].h.b), 4 * k); C.set(HC[k], 3 * k); }); gl.uniform4fv(U.uDir, D); gl.uniform3fv(U.uHC, C); gl.uniform1i(U.uNH, o.all.length); }
}
function densest(f, B, d) { // the largest |ψ|² anywhere (a coarse grid over the cloud): the brightness scale
  const n = d === 4 ? 22 : 48, x = new Array(d).fill(0); let m = 0;
  const rec = (k) => { if (k === d) { const p = f(x); if (p > m) m = p; return; } for (let i = 0; i <= n; i++) { x[k] = -B + (2 * B * i) / n; rec(k + 1); } };
  rec(0); return Math.max(m, 1e-12);
}
const sel = { n: 2, l: 1, name: "w" };
let cur = null;
const HYB = 4; // l = 4 here means the sp⁴ hybrids (3 is f)
function choose(n, l, name) {
  l = Math.max(0, Math.min(4, l)); n = Math.max(l === HYB ? 2 : l + 1, Math.min(4, n));
  let o, tw = null;
  if (l === HYB) {
    const hs = hybrids(4, n), h3 = hybrids(3, n); if (name !== "all" && !hs.find((h) => h.name === name)) name = "all";
    if (name === "all") { o = orbital(hs[0].parts, hs); tw = orbital(h3[0].parts, h3); }
    else { const k = hs.findIndex((h) => h.name === name); o = orbital(hs[k].parts); tw = orbital(h3[Math.min(k, 3)].parts); tw.label = k === 4 ? "sp³ h4 (ours has only four)" : `sp³ ${h3[k].name}`; }
    o.hyb = hs; tw.label = tw.label || "sp³, all four";
  } else {
    const hs = harmonics(4, l); if (!hs.find((h) => h.name === name)) name = hs[0].name;
    const st = state(4, n, l), h = hs.find((q) => q.name === name), t = twin(name, n, l);
    o = orbital([{ st, h, c: 1 }]); if (t) { tw = orbital([{ st: t.st, h: t.h, c: 1 }]); tw.label = `${n}${"spdf"[l]} ${l ? name : ""}`; }
  }
  Object.assign(sel, { n, l, name });
  const ref = tw || orbital([{ st: state(3, n, Math.min(l, 3)), h: harmonics(3, Math.min(l, 3))[0], c: 1 }]); // the dartboard's comparison: the twin, or our atom's same n, l
  cur = { orb: o, tw, ref, dots: [], tdots: [] };
  for (const b of document.querySelectorAll("#exps button[data-n]")) b.classList.toggle("on", +b.dataset.n === n);
  for (const b of document.querySelectorAll("#exps button[data-l]")) b.classList.toggle("on", +b.dataset.l === l);
  picks(); caption(); history.replaceState(null, "", `?n=${n}&l=${l}&o=${encodeURIComponent(name)}`);
}
function picks() { // the orbitals of this l: for d, the six of the plane kind, then the three of the axis kind; the hybrids, one at a time or all
  if (sel.l === HYB) { const names = ["h1", "h2", "h3", "h4", "h5", "all"]; $("picks").innerHTML = names.map((nm, i) => `${i === 5 ? '<span class="sep"></span>' : ""}<button type="button" data-o="${nm}" class="${nm === sel.name ? "on" : ""}"${i < 5 ? ` style="color:rgb(${HC[i].map((c) => Math.round(255 * c)).join(",")})"` : ""}>${nm === "all" ? "all five" : nm}</button>`).join(""); }
  else { const hs = harmonics(4, sel.l), lab = (h) => (sel.l === 0 ? `${sel.n}s` : `${"spdf"[sel.l]}${sub(h.name)}`), cut = sel.l === 2 ? [6] : sel.l === 3 ? [4, 12] : [];
    $("picks").innerHTML = hs.map((h, i) => `${cut.includes(i) ? '<span class="sep"></span>' : ""}<button type="button" data-o="${h.name}" class="${h.name === sel.name ? "on" : ""}">${lab(h)}</button>`).join(""); }
  for (const b of document.querySelectorAll("#picks button")) b.onclick = () => choose(sel.n, sel.l, b.dataset.o);
}
const SUB = { x: "ₓ", y: "ᵧ", z: "_z", w: "_w" };
const sub = (s) => (s.length <= 2 && /^[xyzw]+$/.test(s) ? "_" + s : " " + s);

/* ------------------------------------------------------------------ what each one is */
function caption() {
  const st = cur.orb, n = sel.n, nm = sel.name, s3 = cur.ref, hasW = nm.includes("w");
  const r = `Most likely <b>${st.rMost.toFixed(2)} bohr</b> out, ${st.rMean.toFixed(2)} on average (ours: ${s3.rMost.toFixed(2)}, ${s3.rMean.toFixed(2)}); bound by ${(-st.E * 27.2114).toFixed(2)} eV (ours ${(-s3.E * 27.2114).toFixed(2)}).`;
  const nodes = st.nr ? ` It has ${st.nr} radial node${st.nr > 1 ? "s" : ""}: ${st.nr + 1} shells, alternating teal and rose.` : "";
  let t;
  if (sel.l === HYB) {
    const k = nm === "all" ? -1 : +nm.slice(1) - 1;
    t = k < 0 ? `<b>All five sp⁴ hybrids</b>, each its own colour: ${n}s mixed with the four ${n}p, one fifth s and four fifths p each, every one a single big lobe pointing at a corner of the <b>5-cell</b>, 4D's tetrahedron, <b>104.48°</b> apart (ours, sp³: four at 109.47°). Squared up, four of them make <b>our tetrahedron</b> in your slice, each tipped 14.48° kata, and the fifth points straight <b>ana</b>, out of sight. Twist into w and it swings into view. They're stationary states, not just shapes: ${n}s and ${n}p have the same energy. ${r}`
      : k === 4 ? `<b>sp⁴ h5</b>: one fifth ${n}s, four fifths ${n}p, its big lobe pointing straight along <b>w</b>, ana. Through the nucleus your slice sees only a small <b>rose core</b> (its ns part, negative there); the big lobe is ana, out of sight. Push the lever ana and it swells in. ${r}`
      : `<b>sp⁴ h${k + 1}</b>: one fifth ${n}s, four fifths ${n}p, its big lobe pointing at a corner of the 5-cell: in your slice along ${["(+,+,+)", "(+,−,−)", "(−,+,−)", "(−,−,+)"][k]}, a direction of our tetrahedron, but tipped <b>14.48° kata</b>, so it's brighter a little kata of your slice. Ours (beside it) is the sp³ lobe along the same line. ${r}`;
  }
  else if (sel.l === 3) {
    const census = ` 4D has <b>sixteen</b> f orbitals: four of three axes (xyz, xyw, xzw, yzw), eight of an axis times a difference of squares, four of an axis alone. Ours has seven (1, 3 and 3).`;
    const wf = nm.length === 3 && nm.includes("w"), wfac = nm.startsWith("w(");
    if (wf) { const ab = nm.replace("w", ""); t = `<b>f_${nm}</b>: eight lobes at the corners of a 4D box's face, alternating sign, and w is one of its three axes. Through the nucleus, <b>nothing</b>. Ana it slices to <b>d_${ab}</b>, four leaves in the ${ab} plane; kata, the same with its signs swapped.${census} ${r}`; }
    else if (nm === "w(2w²−r²)") t = `<b>f w(2w²−r²)</b>: lobes along ±w and a band of the other sign round them. Through the nucleus, nothing. A distance a ana it slices to a(a² − ρ²): a <b>ball</b>, teal inside radius a and rose outside it, an s orbital with a node. Kata, the same with teal and rose swapped.${census} ${r}`;
    else if (wfac) { const inner = nm.slice(2, -1); t = `<b>f ${nm}</b>: w times ${inner}. Through the nucleus, nothing; ana it slices to the d orbital ${inner}, kata to the same upside down.${census} ${r}`; }
    else if (nm === "xyz") t = `<b>f_xyz</b>: eight lobes at a cube's corners, alternating sign: ours has it, unchanged in your slice. Its three cousins with w (xyw, xzw, yzw) are invisible through the nucleus and slice to d orbitals ana and kata.${census} ${r}`;
    else t = `<b>f ${nm}</b>.${cur.tw ? " Ours has it too: through the nucleus your slice shows it unchanged." : " Ours has nothing quite like it: through the nucleus your slice shows only part of its shape; move ana and kata to find the rest."}${census} ${r}`;
  }
  else if (sel.l === 0) t = n === 1 ? `<b>1s</b>, the ground state: a ball, densest at the nucleus. Yet the electron is most likely found <b>${st.rMost.toFixed(2)} bohr</b> out, because a shell at radius r holds r³ worth of space in 4D (r² in ours): the dartboard shows it. ${r}` : `<b>${n}s</b>: still a ball.${nodes} ${r}`;
  else if (sel.l === 1) t = nm === "w" ? `<b>p_w</b>: two lobes along w, opposite in phase. Your slice, through the nucleus, is exactly its node: <b>nothing</b>. Push the lever ana and a teal lobe swells into view; kata, a rose one. In 4D there are four p orbitals, x, y, z <i>and w</i>.${nodes} ${r}` : `<b>p_${nm}</b>: two lobes along ${nm}, opposite in phase, as ours. 4D has four of these (x, y, z and w); twist your slice and this one turns into a mix you'd call p_w.${nodes} ${r}`;
  else if (nm === "x²+y²−z²−w²") t = `<b>Two rings.</b> Positive all round the xy-plane, negative all round the zw-plane: two planes completely perpendicular, meeting only at the nucleus. Nothing in 3D can do that. Your slice (x, y, z) catches the teal ring whole and the rose one as a pair of lobes along z; move ana and the rose ring's other half comes through. Nine d orbitals here, against our five.${nodes} ${r}`;
  else if (nm === "z²−w²") t = `<b>d z²−w²</b>: teal lobes along z, rose along w. Through the nucleus you see a teal dumbbell along z; ana or kata, the rose w² part rises as a disc round its waist.${nodes} ${r}`;
  else if (hasW) t = `<b>d_${nm}</b>: the plane kind, in the ${nm} plane, so it involves w. Through the nucleus: <b>nothing</b>. Move ana and it looks exactly like <b>p_${nm[0]}</b>, a dumbbell along ${nm[0]}; kata, the same <b>upside down</b>. A 4D d orbital, sliced, is often a p whose sign depends on which side of you it is.${nodes} ${r}`;
  else t = `<b>d_${nm}</b>: one you know, unchanged in your slice. 4D's nine d orbitals are six of the plane kind, one for each of its six planes (xy, xz, xw, yz, yw, zw), and three of the axis kind; ours has three and two.${nodes} ${r}`;
  $("cap").innerHTML = t + (cur.tw ? "" : ` <span style="color:#9a958c">Ours has no twin of this one.</span>`);
}
$("cap").onclick = () => $("cap").classList.toggle("min");

/* ------------------------------------------------------------------ the slice */
const frame = { E: [[1, 0, 0, 0], [0, 1, 0, 0], [0, 0, 1, 0]], N: [0, 0, 0, 1], off: 0 };
function twist(dir3, ang) { // turn the slice's direction dir3 (in its own coordinates) toward N
  const u = unit([0, 1, 2, 3].map((k) => dir3[0] * frame.E[0][k] + dir3[1] * frame.E[1][k] + dir3[2] * frame.E[2][k])), N = frame.N, c = Math.cos(ang) - 1, s = Math.sin(ang);
  const rot = (x) => { const a = dot(x, u), b = dot(x, N); return x.map((v, k) => v + c * (a * u[k] + b * N[k]) + s * (a * N[k] - b * u[k])); };
  frame.E = frame.E.map(rot); frame.N = rot(N);
  // keep it orthonormal
  const B = [...frame.E, frame.N]; for (let i = 0; i < 4; i++) { for (let j = 0; j < i; j++) B[i] = add(B[i], B[j], -dot(B[i], B[j])); B[i] = unit(B[i]); }
  frame.E = B.slice(0, 3); frame.N = B[3];
}
function squareUp() { Object.assign(frame, { E: [[1, 0, 0, 0], [0, 1, 0, 0], [0, 0, 1, 0]], N: [0, 0, 0, 1], off: 0 }); }
const O4 = () => frame.N.map((v) => v * frame.off);
$("squareB").onclick = squareUp;
const view = { az: 0.6, el: 0.35 };
function camera(dist) { const az = view.az, el = view.el, eye = [-dist * Math.cos(el) * Math.sin(az), dist * Math.sin(el), -dist * Math.cos(el) * Math.cos(az)], F = unit(eye.map((x) => -x)), R = unit([F[2], 0, -F[0]]); return { eye, F, R, U: cross(F, R) }; }

/* ------------------------------------------------------------------ input */
const pads = { tw: [0, 0], an: 0 };
function padDrag(el, onMove, onEnd) {
  let id = null;
  el.addEventListener("pointerdown", (e) => { id = e.pointerId; try { el.setPointerCapture(id); } catch (err) { /* fine */ } el.classList.add("live"); onMove(e); });
  el.addEventListener("pointermove", (e) => { if (e.pointerId === id) onMove(e); });
  for (const ev of ["pointerup", "pointercancel", "lostpointercapture"]) el.addEventListener(ev, (e) => { if (e.pointerId !== id) return; id = null; el.classList.remove("live"); onEnd(); });
}
padDrag($("twist"), (e) => { const r = $("twist").getBoundingClientRect(), dx = (e.clientX - r.left - r.width / 2) / (r.width / 2), dy = -(e.clientY - r.top - r.height / 2) / (r.height / 2), m = Math.hypot(dx, dy), k = m > 1 ? 1 / m : 1; pads.tw = [dx * k, dy * k]; $("twistKnob").style.transform = `translate(${dx * k * r.width / 2}px, ${-dy * k * r.height / 2}px)`; }, () => { pads.tw = [0, 0]; $("twistKnob").style.transform = ""; });
padDrag($("ana"), (e) => { const r = $("ana").getBoundingClientRect(), dy = Math.max(-1, Math.min(1, -(e.clientY - r.top - r.height / 2) / (r.height / 2))); pads.an = dy; $("anaKnob").style.transform = `translateY(${-dy * r.height / 2 * 0.8}px)`; }, () => { pads.an = 0; $("anaKnob").style.transform = ""; });
const keys = new Set();
document.addEventListener("keydown", (e) => { const k = e.key.toLowerCase(); if (k === "z") { squareUp(); return; } if ("ijklrfqe".includes(k) && k.length === 1) { keys.add(k); e.preventDefault(); } });
document.addEventListener("keyup", (e) => keys.delete(e.key.toLowerCase()));
addEventListener("blur", () => keys.clear());
function steer(dt) {
  const kv = (a, b) => (keys.has(a) ? 1 : 0) - (keys.has(b) ? 1 : 0), cam = camera(1), tx = pads.tw[0] + kv("l", "j"), ty = pads.tw[1] + kv("i", "k"), an = pads.an + kv("r", "f") + kv("e", "q"), r = (40 * Math.PI) / 180;
  if (tx) twist(cam.R, tx * r * dt); if (ty) twist(cam.U, ty * r * dt); // the screen's right, or up, tipped toward ana
  if (an) frame.off = Math.max(-cur.orb.r99, Math.min(cur.orb.r99, frame.off + an * 0.35 * cur.orb.r99 * dt));
}
function layout() {
  const w = glc.clientWidth, h = glc.clientHeight;
  if (w >= h * 1.05) return { sl: { x: 0, y: 0, w: w * 0.62, h }, tw: { x: w * 0.62, y: 0, w: w * 0.38, h: h * 0.5 }, ch: { x: w * 0.62, y: h * 0.5, w: w * 0.38, h: h * 0.5 } };
  const hs = Math.round(h * 0.58);
  return { sl: { x: 0, y: 0, w, h: hs }, tw: { x: 0, y: hs, w: w * 0.5, h: h - hs }, ch: { x: w * 0.5, y: hs, w: w * 0.5, h: h - hs } };
}
const inR = (r, x, y) => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h;
const drags = new Map();
glc.addEventListener("pointerdown", (e) => { try { glc.setPointerCapture(e.pointerId); } catch (err) { /* fine */ } drags.set(e.pointerId, { x: e.clientX, y: e.clientY }); });
glc.addEventListener("pointermove", (e) => { const g = drags.get(e.pointerId); if (!g) return; view.az -= (e.clientX - g.x) * 0.007; view.el = Math.max(-1.4, Math.min(1.4, view.el + (e.clientY - g.y) * 0.007)); g.x = e.clientX; g.y = e.clientY; });
for (const ev of ["pointerup", "pointercancel"]) glc.addEventListener(ev, (e) => drags.delete(e.pointerId));
for (const b of document.querySelectorAll("#exps button[data-n]")) b.onclick = () => choose(+b.dataset.n, sel.l, sel.name);
for (const b of document.querySelectorAll("#exps button[data-l]")) b.onclick = () => choose(Math.max(sel.n, +b.dataset.l + 1), +b.dataset.l, sel.name);
let dotsOn = true; $("dotsB").onclick = () => { dotsOn = !dotsOn; $("dotsB").classList.toggle("on", dotsOn); };
$("gearB").onclick = () => { $("panel").hidden = !$("panel").hidden; $("gearB").classList.toggle("on", !$("panel").hidden); };
for (const ev of ["contextmenu", "selectstart"]) document.addEventListener(ev, (e) => e.preventDefault());

/* ------------------------------------------------------------------ drawing */
const TAN = 0.62, MAXDOTS = 6000;
let last = performance.now(), res = 0;
function draw(now) {
  requestAnimationFrame(draw);
  const dt = Math.min(0.1, (now - last) / 1000); last = now;
  steer(dt);
  if (dotsOn && cur.dots.length < MAXDOTS) for (let i = 0; i < 40; i++) { cur.dots.push(cur.orb.draw()); cur.tdots.push(cur.ref.draw()); }
  const dpr = Math.min(1.5, devicePixelRatio || 1); if (!res) res = dpr * (matchMedia("(pointer: coarse)").matches ? 0.55 : 0.8);
  const cw = Math.round(glc.clientWidth * res), chh = Math.round(glc.clientHeight * res); if (glc.width !== cw || glc.height !== chh) { glc.width = cw; glc.height = chh; }
  const Lo = layout(), vp = (r) => [Math.round(r.x * res), Math.round(chh - (r.y + r.h) * res), Math.round(r.w * res), Math.round(r.h * res)];
  gl.uniform1f(U.uTan, TAN); gl.uniform1f(U.uGain, 1);
  // your slice of the 4D atom
  { const B = cur.orb.r99, cam = camera(B * 2.5), v = vp(Lo.sl); gl.viewport(...v); gl.uniform4f(U.uVP, ...v);
    upload(cur.orb); gl.uniform1f(U.uDmax, cur.orb.dmax); gl.uniform1f(U.uBox, B);
    gl.uniform4fv(U.uO, O4()); gl.uniform4fv(U.uE0, frame.E[0]); gl.uniform4fv(U.uE1, frame.E[1]); gl.uniform4fv(U.uE2, frame.E[2]);
    gl.uniform3fv(U.uEye, cam.eye); gl.uniform3fv(U.uCR, cam.R); gl.uniform3fv(U.uCU, cam.U); gl.uniform3fv(U.uCF, cam.F); gl.drawArrays(gl.TRIANGLES, 0, 3); }
  // ours, whole
  { const v = vp(Lo.tw); gl.viewport(...v); gl.uniform4f(U.uVP, ...v);
    if (cur.tw) { const B = cur.tw.r99, cam = camera(B * 2.5); upload(cur.tw); gl.uniform1f(U.uDmax, cur.tw.dmax); gl.uniform1f(U.uBox, B);
      gl.uniform4fv(U.uO, [0, 0, 0, 0]); gl.uniform4fv(U.uE0, [1, 0, 0, 0]); gl.uniform4fv(U.uE1, [0, 1, 0, 0]); gl.uniform4fv(U.uE2, [0, 0, 1, 0]);
      gl.uniform3fv(U.uEye, cam.eye); gl.uniform3fv(U.uCR, cam.R); gl.uniform3fv(U.uCU, cam.U); gl.uniform3fv(U.uCF, cam.F); }
    else gl.uniform1f(U.uBox, 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3); }
  overlay(Lo);
}
function overlay(Lo) {
  const g = ov.getContext("2d"), dpr = Math.min(2, devicePixelRatio || 1), w = ov.clientWidth, h = ov.clientHeight;
  if (ov.width !== Math.round(w * dpr) || ov.height !== Math.round(h * dpr)) { ov.width = Math.round(w * dpr); ov.height = Math.round(h * dpr); }
  g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, w, h); g.font = "11px ui-monospace, Menlo, monospace"; g.textAlign = "left";
  const sl = Lo.sl, tw = Lo.tw, ch = Lo.ch, B = cur.orb.r99;
  const proj = (r, cam, p) => { const q = add(p, cam.eye, -1), f = dot(q, cam.F); return f < 0.1 ? null : [r.x + ((dot(q, cam.R) / (f * TAN)) * r.h + r.w) / 2, r.y + (r.h - (dot(q, cam.U) / (f * TAN)) * r.h) / 2]; };
  // your slice: the box's axes (your slice's own), the nucleus, and the electrons within a thin band of it
  const cam = camera(B * 2.5), axes = [["E0", [1, 0, 0]], ["E1", [0, 1, 0]], ["E2", [0, 0, 1]]], nameOf = (v) => { const ax = "xyzw", parts = v.map((c, i) => [c, ax[i]]).filter(([c]) => Math.abs(c) > 0.05); return parts.length === 1 ? (parts[0][0] < 0 ? "−" : "") + parts[0][1] : parts.map(([c, a]) => `${c.toFixed(2)}${a}`).join("+").replace(/\+-/g, "−"); };
  g.lineWidth = 1;
  axes.forEach(([, a], i) => { const p0 = proj(sl, cam, [0, 0, 0]), p1 = proj(sl, cam, a.map((v) => v * B * 0.9)); if (!p0 || !p1) return; g.strokeStyle = "rgba(255,255,255,0.25)"; g.beginPath(); g.moveTo(...p0); g.lineTo(...p1); g.stroke(); g.fillStyle = "rgba(233,228,218,0.75)"; g.fillText(nameOf(frame.E[i]), p1[0] + 3, p1[1]); });
  // the hybrids' directions: an arrow from the nucleus to each corner, as much of it as lies in your slice; how far the
  // rest leans out, ana or kata, in degrees
  if (sel.l === HYB) {
    const hs = cur.orb.hyb, show = sel.name === "all" ? hs.map((_, k) => k) : [+sel.name.slice(1) - 1];
    for (const k of show) {
      const u = hs[k].dir, inS = frame.E.map((e) => dot(u, e)), out = dot(u, frame.N), ang = (Math.asin(Math.max(-1, Math.min(1, out))) * 180) / Math.PI;
      const p0 = proj(sl, cam, [0, 0, 0]), p1 = proj(sl, cam, inS.map((v) => v * B * 0.75)); if (!p0 || !p1) continue;
      const col = `rgb(${HC[k].map((c) => Math.round(255 * c)).join(",")})`; g.strokeStyle = col; g.fillStyle = col; g.lineWidth = 2; g.setLineDash(Math.abs(ang) > 45 ? [4, 4] : []);
      g.beginPath(); g.moveTo(...p0); g.lineTo(...p1); g.stroke(); g.setLineDash([]); g.beginPath(); g.arc(p1[0], p1[1], 3, 0, 2 * Math.PI); g.fill();
      g.fillText(`h${k + 1}${Math.abs(ang) < 0.5 ? "" : ` ${Math.abs(ang).toFixed(0)}° ${ang > 0 ? "ana" : "kata"}`}`, p1[0] + 5, p1[1] - 4);
    }
  }
  const nOff = -frame.off; // the nucleus sits this far ana of your slice
  if (dotsOn) {
    const band = 0.04 * B, O = O4();
    for (let i = 0; i < cur.dots.length; i++) {
      const x = add(cur.dots[i], O, -1), dl = dot(x, frame.N); if (Math.abs(dl) > band) continue;
      const p = proj(sl, cam, frame.E.map((e) => dot(x, e))); if (!p || !inR(sl, p[0], p[1])) continue;
      g.fillStyle = cur.dots[i].k !== undefined ? `rgba(${HC[cur.dots[i].k].map((c) => Math.round(255 * c)).join(",")},0.95)` : dl > 0 ? "rgba(56,242,224,0.9)" : "rgba(255,102,184,0.9)"; g.fillRect(p[0] - 1, p[1] - 1, 2, 2);
    }
  }
  g.fillStyle = "rgba(233,228,218,0.85)";
  g.fillText(`your slice · ±${B.toFixed(1)} bohr · nucleus ${Math.abs(nOff) < 0.005 ? "in it" : `${Math.abs(nOff).toFixed(2)} ${nOff > 0 ? "ana" : "kata"}`}`, sl.x + 10, sl.y + sl.h - 172);
  g.fillText(`unseen N = ${nameOf(frame.N)}${dotsOn ? ` · dots within ${(0.04 * B).toFixed(2)}` : ""}`, sl.x + 10, sl.y + sl.h - 158);
  // ours
  g.fillStyle = "rgba(233,228,218,0.85)"; g.fillText(cur.tw ? `ours: the 3D atom, ${cur.tw.label}, whole · ±${cur.tw.r99.toFixed(1)} bohr` : "ours: no twin of this one", tw.x + 10, tw.y + 18);
  if (cur.tw && dotsOn) { const ct = camera(cur.tw.r99 * 2.5); g.fillStyle = "rgba(255,210,122,0.55)"; for (let i = 0; i < Math.min(cur.tdots.length, 1500); i++) { const p = proj(tw, ct, cur.tdots[i]); if (p && inR(tw, p[0], p[1])) g.fillRect(p[0] - 0.75, p[1] - 0.75, 1.5, 1.5); } }
  // the dartboard: how far out the electrons land, against P(r), kata's and ours
  g.fillStyle = "rgba(7,8,12,0.75)"; g.fillRect(ch.x + 6, ch.y + 6, ch.w - 12, ch.h - 12);
  const s3 = cur.ref, K4 = cur.orb, Rm = Math.max(K4.r99, s3.r99) * 1.05, nb = 40, bw = Rm / nb, X = (r) => ch.x + 16 + ((ch.w - 32) * r) / Rm;
  const h4 = new Array(nb).fill(0), h3 = new Array(nb).fill(0); for (const x of cur.dots) { const b = Math.floor(Math.hypot(...x) / bw); if (b < nb) h4[b]++; } for (const x of cur.tdots) { const b = Math.floor(Math.hypot(...x) / bw); if (b < nb) h3[b]++; }
  let pm = 0; for (let i = 0; i <= 200; i++) { const r = (Rm * i) / 200; pm = Math.max(pm, K4.P(r), s3.P(r)); }
  const top = ch.y + 52, base = ch.y + ch.h - 30, Y = (p) => base - ((base - top) * p) / pm;
  const bars = (H, n, col) => { if (!n) return; g.fillStyle = col; H.forEach((c, i) => { const p = c / n / bw; g.fillRect(X(i * bw) + 1, Y(p), X(bw) - X(0) - 2, base - Y(p)); }); };
  bars(h3, cur.tdots.length, "rgba(255,210,122,0.25)"); bars(h4, cur.dots.length, "rgba(56,242,224,0.3)");
  const curve = (st, col) => { g.strokeStyle = col; g.lineWidth = 1.8; g.beginPath(); for (let i = 0; i <= 200; i++) { const r = (Rm * i) / 200, y = Y(st.P(r)); i ? g.lineTo(X(r), y) : g.moveTo(X(r), y); } g.stroke();
    g.setLineDash([]); g.beginPath(); g.moveTo(X(st.rMost), base); g.lineTo(X(st.rMost), Y(st.P(st.rMost))); g.stroke(); g.setLineDash([3, 3]); g.beginPath(); g.moveTo(X(st.rMean), base); g.lineTo(X(st.rMean), top); g.stroke(); g.setLineDash([]); };
  curve(s3, "#ffd27a"); curve(K4, "#38f2e0");
  g.strokeStyle = "rgba(255,255,255,0.3)"; g.beginPath(); g.moveTo(X(0), base); g.lineTo(X(Rm), base); g.stroke();
  g.fillStyle = "rgba(233,228,218,0.65)"; for (let r = 0; r <= Rm; r += Rm > 30 ? 10 : Rm > 12 ? 5 : 2) { g.fillText(`${r}`, X(r) - 3, base + 13); }
  g.fillStyle = "#38f2e0"; g.fillText(`kata ${K4.rMost.toFixed(2)} likeliest, ${K4.rMean.toFixed(2)} mean`, ch.x + 14, ch.y + 20);
  g.fillStyle = "#ffd27a"; g.fillText(`ours ${s3.rMost.toFixed(2)}, ${s3.rMean.toFixed(2)}`, ch.x + 14, ch.y + 33);
  g.fillStyle = "rgba(233,228,218,0.6)"; g.textAlign = "right"; g.fillText(`r, bohr`, ch.x + ch.w - 14, base + 13); g.fillText(`${cur.dots.length} electrons`, ch.x + ch.w - 14, ch.y + 46); g.textAlign = "left";
  // the pads sit in the corners of your slice's pane
  const twp = $("twist"), an = $("ana"); twp.style.left = `${sl.x + 14}px`; twp.style.top = `${sl.y + sl.h - 118}px`; an.style.left = `${sl.x + sl.w - 58}px`; an.style.top = `${sl.y + sl.h - 134}px`;
}

/* ------------------------------------------------------------------ start */
const q = new URLSearchParams(location.search);
choose(+(q.get("n") || 2), +(q.get("l") ?? 1), q.get("o") || "w");
if (matchMedia("(orientation: portrait)").matches) $("cap").classList.add("min"); // a phone: the caption folded to a line until tapped
requestAnimationFrame(draw);
window.ORBITAL = { sel, frame, choose, twist, squareUp, view, cur: () => cur, pads };

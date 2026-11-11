/* CAD⁴'s page: the tree compiled twice by the kernel (a JavaScript function for the numbers, GLSL for the picture),
   your 3D slice of it sphere-traced, the parameters as uniforms (a slider moves the part without a recompile), the
   numbers from a worker. Drawn only when something changed. */
import { compile, slice, mesh, stl, num } from "./kernel.js";
import { PARTS, ORDER } from "./parts.js";

const $ = (id) => document.getElementById(id), canvas = $("gl"), ov = $("ov"), octx = ov.getContext("2d");
const gl = canvas.getContext("webgl2", { antialias: false, powerPreference: "high-performance" });
const S = { name: "", tree: null, shape: null, vals: {}, err: "", frames: 0, measure: null, fit: null, slice: null, hit: true };
window.CAD4 = S;

/* ------------------------------------------------------------------ the slice and the camera
   E: four orthonormal 4-vectors. E[0..2] span your slice, E[3] is the direction you can't see; `off` is how far along
   it the slice sits from the part's middle. The camera orbits inside the slice. */
let E = ident(), off = 0, yaw = -0.6, pitch = 0.4, zoom = 1, C4 = [0, 0, 0, 0], R = 1, dirty = true, scale = 1;
function ident() { return [[1, 0, 0, 0], [0, 1, 0, 0], [0, 0, 1, 0], [0, 0, 0, 1]]; }
const dot4 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];
/* turn every frame vector by th in the plane of unit vectors a and n (a toward n) */
function turn(a, n, th) { const c = Math.cos(th) - 1, s = Math.sin(th); E = E.map((v) => { const va = dot4(v, a), vn = dot4(v, n); return v.map((x, i) => x + c * (va * a[i] + vn * n[i]) + s * (va * n[i] - vn * a[i])); }); ortho(); }
function ortho() { for (let i = 0; i < 4; i++) { for (let j = 0; j < i; j++) { const d = dot4(E[i], E[j]); E[i] = E[i].map((x, k) => x - d * E[j][k]); } const l = Math.hypot(...E[i]); E[i] = E[i].map((x) => x / l); } }
function view() { const cp = Math.cos(pitch), sp = Math.sin(pitch), cy = Math.cos(yaw), sy = Math.sin(yaw), f = [-cp * sy, -sp, -cp * cy], r = [cy, 0, -sy], u = [r[1] * f[2] - r[2] * f[1], r[2] * f[0] - r[0] * f[2], r[0] * f[1] - r[1] * f[0]], dist = (2.9 * R) / zoom; return { f, r, u, cam: f.map((x) => -x * dist) }; }
const lift = (v3) => [0, 1, 2, 3].map((i) => v3[0] * E[0][i] + v3[1] * E[1][i] + v3[2] * E[2][i]);
const origin = () => C4.map((c, i) => c + off * E[3][i]);

/* ------------------------------------------------------------------ the shader */
const VS = `#version 300 es
in vec2 aP; void main() { gl_Position = vec4(aP, 0.0, 1.0); }`;
const PAL = ["0.84, 0.78, 0.66", "0.42, 0.68, 0.98", "0.98, 0.70, 0.40", "0.62, 0.88, 0.54", "0.82, 0.60, 0.98", "0.95, 0.90, 0.45"];
const frag = (shape) => `#version 300 es
precision highp float;
uniform vec2 uRes; uniform vec4 uO, uE0, uE1, uE2, uE3; uniform vec3 uCam, uVr, uVu, uVf; uniform float uR;
${shape.glsl}
float map(vec3 q) { return sdf(uO + q.x * uE0 + q.y * uE1 + q.z * uE2); }
vec3 tint(vec4 p) {
  float b = 1e9, d; vec3 c = vec3(${PAL[0]});
${shape.parts.map((_, i) => `  d = part${i}(p); if (d < b) { b = d; c = vec3(${PAL[i % PAL.length]}); }`).join("\n")}
  return c;
}
out vec4 o;
void main() {
  vec2 uv = (gl_FragCoord.xy * 2.0 - uRes) / min(uRes.x, uRes.y);
  vec3 rd = normalize(uVr * uv.x + uVu * uv.y + uVf * 2.2), ro = uCam;
  vec3 col = mix(vec3(0.035, 0.04, 0.055), vec3(0.075, 0.085, 0.11), 0.5 + 0.5 * uv.y) * (1.0 - 0.12 * dot(uv, uv));
  float bq = dot(ro, rd), cq = dot(ro, ro) - uR * uR, h = bq * bq - cq, hit = 0.0;
  if (h > 0.0) {
    float sh = sqrt(h), t = max(-bq - sh, 0.0), tmax = -bq + sh; bool got = false;
    for (int i = 0; i < 160; i++) { float d = map(ro + rd * t); if (d < 0.0007 * t + 0.0003) { got = true; break; } t += d * 0.92; if (t > tmax) break; }
    if (got) {
      vec3 q = ro + rd * t; vec4 p = uO + q.x * uE0 + q.y * uE1 + q.z * uE2; float e = 0.0015 * uR;
      vec4 g = vec4(sdf(p + e * uE0) - sdf(p - e * uE0), sdf(p + e * uE1) - sdf(p - e * uE1), sdf(p + e * uE2) - sdf(p - e * uE2), sdf(p + e * uE3) - sdf(p - e * uE3));
      vec3 n = normalize(g.xyz + 1e-9); float lean = g.w / max(length(g), 1e-9);
      vec3 base = tint(p);
      base = mix(base, lean > 0.0 ? vec3(0.22, 0.95, 0.88) : vec3(1.0, 0.4, 0.72), 0.6 * smoothstep(0.05, 0.9, abs(lean)));
      float ao = 1.0; for (int k = 1; k <= 4; k++) { float s = 0.05 * uR * float(k); ao -= max(s - map(q + n * s), 0.0) / s * 0.16; }
      vec3 key = normalize(uVr * 0.5 + uVu * 0.75 - uVf * 0.55), fill = normalize(-uVr * 0.7 + uVu * 0.1 - uVf * 0.5);
      float kd = max(dot(n, key), 0.0), fd = max(dot(n, fill), 0.0), rim = pow(1.0 - max(dot(n, -rd), 0.0), 3.0), sp = pow(max(dot(reflect(rd, n), key), 0.0), 28.0);
      col = base * (0.16 + 0.78 * kd + 0.22 * fd) * clamp(ao, 0.25, 1.0) + 0.12 * rim + 0.18 * sp; hit = 1.0;
    }
  }
  o = vec4(pow(clamp(col, 0.0, 1.0), vec3(0.4545)), hit);
}`;
let prog = null, U = {}, vao = null;
function build() {
  const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error("shader: " + gl.getShaderInfoLog(s)); return s; };
  const p = gl.createProgram(); gl.attachShader(p, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(p, sh(gl.FRAGMENT_SHADER, frag(S.shape))); gl.bindAttribLocation(p, 0, "aP"); gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error("link: " + gl.getProgramInfoLog(p));
  if (prog) gl.deleteProgram(prog); prog = p; U = {};
  for (const n of ["uRes", "uO", "uE0", "uE1", "uE2", "uE3", "uCam", "uVr", "uVu", "uVf", "uR", "uP"]) U[n] = gl.getUniformLocation(p, n);
  if (!vao) { vao = gl.createVertexArray(); gl.bindVertexArray(vao); const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW); gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0); }
}
function draw() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2) * scale, w = Math.max(2, Math.round(canvas.clientWidth * dpr)), h = Math.max(2, Math.round(canvas.clientHeight * dpr));
  if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
  gl.viewport(0, 0, w, h); gl.useProgram(prog); gl.bindVertexArray(vao);
  const v = view(), O = origin();
  gl.uniform2f(U.uRes, w, h); gl.uniform4fv(U.uO, O); gl.uniform4fv(U.uE0, E[0]); gl.uniform4fv(U.uE1, E[1]); gl.uniform4fv(U.uE2, E[2]); gl.uniform4fv(U.uE3, E[3]);
  gl.uniform3fv(U.uCam, v.cam); gl.uniform3fv(U.uVr, v.r); gl.uniform3fv(U.uVu, v.u); gl.uniform3fv(U.uVf, v.f); gl.uniform1f(U.uR, R * 1.02);
  if (U.uP && S.shape.order.length) gl.uniform1fv(U.uP, S.shape.order.map((k) => S.shape.params[k]));
  gl.drawArrays(gl.TRIANGLES, 0, 3); S.frames++;
  overlay(v);
}
/* does the slice meet the part at all? (a coarse look along the slice, from the kernel's own function) */
function meets() { const s = slice(S.shape, origin(), E.slice(0, 3)), n = 14; for (let i = 0; i <= n; i++) for (let j = 0; j <= n; j++) for (let k = 0; k <= n; k++) { if (s.sdf(R * (2 * i / n - 1), R * (2 * j / n - 1), R * (2 * k / n - 1)) < (R / n) * 0.9) return true; } return false; }

/* the axes: where x, y, z and w lie in your slice (shorter the more they lean out of it), and the slice in words */
const AX = [["x", "#e9e4da"], ["y", "#e9e4da"], ["z", "#e9e4da"], ["w", "#ffd27a"]];
function overlay(v) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2), w = ov.clientWidth, h = ov.clientHeight; if (ov.width !== Math.round(w * dpr)) { ov.width = Math.round(w * dpr); ov.height = Math.round(h * dpr); }
  octx.setTransform(dpr, 0, 0, dpr, 0, 0); octx.clearRect(0, 0, w, h);
  const cx = w - 52, cy = 96, L = 34; octx.lineWidth = 1.6; octx.font = "600 11px ui-monospace, Menlo, monospace"; octx.textAlign = "center"; octx.textBaseline = "middle";
  const items = AX.map(([name, colr], a) => { const s3 = [E[0][a], E[1][a], E[2][a]], len = Math.hypot(...s3); return { name, colr, len, x: s3[0] * v.r[0] + s3[1] * v.r[1] + s3[2] * v.r[2], y: s3[0] * v.u[0] + s3[1] * v.u[1] + s3[2] * v.u[2], z: -(s3[0] * v.f[0] + s3[1] * v.f[1] + s3[2] * v.f[2]) }; }).sort((a, b) => a.z - b.z);
  for (const it of items) { if (it.len < 0.04) continue; octx.globalAlpha = 0.35 + 0.65 * it.len; octx.strokeStyle = octx.fillStyle = it.colr; octx.beginPath(); octx.moveTo(cx, cy); octx.lineTo(cx + it.x * L, cy - it.y * L); octx.stroke(); octx.fillText(it.name, cx + it.x * (L + 9), cy - it.y * (L + 9)); }
  octx.globalAlpha = 1; octx.textAlign = "right"; octx.fillStyle = "#9a958c";
  const n = E[3], main = n.findIndex((x) => Math.abs(x) > 0.9995), f2 = (x) => (Math.abs(x) < 0.005 ? "0" : x.toFixed(2));
  const pos = dot4(origin(), n), txt = main >= 0 ? `slice: ${"xyzw"[main]} = ${f2(pos * Math.sign(n[main]))}` : `slice ⟂ (${n.map(f2).join(", ")}) at ${f2(pos)}`;
  octx.textAlign = "center"; octx.fillText(txt, w / 2, h - 14);
}

/* ------------------------------------------------------------------ the model */
function setTree(tree, name, keepView) {
  const vals = { ...(tree.params || {}) }, shape = compile(tree, vals); // (throws before anything is replaced)
  S.tree = tree; S.name = name; S.vals = vals; S.shape = shape; S.measure = S.fit = S.slice = S.profile = null; build();
  frameIt(); if (!keepView) { E = ident(); off = 0; zoom = 1; }
  $("cap").textContent = tree.note || (tree.title ? tree.title : "your own part"); $("cap").classList.remove("min");
  $("runB").hidden = !tree.path; params(); showTree(); filmsBuild(); numbers(); dirty = true;
}
function frameIt() { const { lo, hi } = S.shape.bbox, ok = (v) => Math.abs(v) < 1e8; C4 = [0, 1, 2, 3].map((i) => (ok(lo[i] ?? 1e9) && ok(hi[i] ?? 1e9) ? (lo[i] + hi[i]) / 2 : 0)); R = Math.max(0.2, Math.hypot(...[0, 1, 2, 3].map((i) => (ok(lo[i] ?? 1e9) && ok(hi[i] ?? 1e9) ? (hi[i] - lo[i]) / 2 : 0)))); }
function setVals(next, quiet) {
  try { S.shape = compile(S.tree, next); S.vals = next; S.err = ""; } catch (e) { S.err = e.message; }
  $("err").textContent = S.err; dirty = true; filmsDraw(); if (!quiet) numbers();
}
function params() {
  const box = $("params"); box.textContent = "";
  for (const k of Object.keys(S.tree.params || {})) { const v0 = S.tree.params[k], rg = (S.tree.ranges || {})[k] || (v0 > 0 ? [v0 * 0.25, v0 * 2.5] : v0 < 0 ? [v0 * 2.5, v0 * 0.25] : [-2, 2]);
    const lab = document.createElement("label"), nm = document.createElement("i"), inp = document.createElement("input"), out = document.createElement("span");
    nm.textContent = k; nm.style.fontStyle = "normal"; inp.type = "range"; inp.min = rg[0]; inp.max = rg[1]; inp.step = (rg[1] - rg[0]) / 400; inp.value = v0; inp.dataset.k = k; out.textContent = (+v0).toFixed(2);
    inp.addEventListener("input", () => { out.textContent = (+inp.value).toFixed(2); setVals({ ...S.vals, [k]: +inp.value }); });
    lab.append(nm, inp, out); box.append(lab); }
  if (!box.children.length) box.textContent = "none: add \"params\" to the tree and use their names where a number goes";
}
function syncSliders() { for (const inp of $("params").querySelectorAll("input")) { inp.value = S.vals[inp.dataset.k]; inp.nextSibling.textContent = (+S.vals[inp.dataset.k]).toFixed(2); } }
function showTree() { const { title, note, ...rest } = S.tree; void title; void note; $("treeT").value = pretty(rest); }
/* JSON a person can read: one feature a line where it fits */
function pretty(v, ind = "") {
  const flat = JSON.stringify(v); if (flat.length < 86 - ind.length || typeof v !== "object" || v === null) return flat.replace(/([,:])(?=\S)/g, "$1 ").replace(/"(\w+)": /g, '"$1": ');
  const inner = ind + " ";
  if (Array.isArray(v)) return "[\n" + v.map((x) => inner + pretty(x, inner)).join(",\n") + "\n" + ind + "]";
  return "{\n" + Object.keys(v).map((k) => inner + JSON.stringify(k) + ": " + pretty(v[k], inner)).join(",\n") + "\n" + ind + "}";
}

/* ------------------------------------------------------------------ the numbers (a worker; the latest request wins) */
let worker = null, busy = null, want = null, reqId = 0, fineT = 0, sliceT = 0;
function spawn() { worker = new Worker(new URL("./worker.js", import.meta.url), { type: "module" }); worker.onmessage = (ev) => got(ev.data); busy = null; }
function ask(mode, wait) {
  const req = { id: ++reqId, tree: S.tree, vals: S.vals, mode, O: origin(), E: E.slice(0, 3), C: C4, N4: E[3], R };
  if (busy && busy.mode === "fine" && !wait) { worker.terminate(); spawn(); }
  if (busy) { want = req; return; }
  busy = req; worker.postMessage(req);
}
function got(m) {
  const mine = busy; busy = null;
  if (m.error) { $("err").textContent = m.error; } else if (mine && m.id === mine.id) { $("err").textContent = S.err;
    if (m.fit) S.fit = m.fit; if (m.measure) { S.measure = m.measure; S.fine = m.mode === "fine"; } if (m.slice) S.slice = m.slice; if (m.profile) S.profile = m.profile; show();
  }
  if (want) { const r = want; want = null; busy = r; worker.postMessage(r); }
}
function numbers() { clearTimeout(fineT); ask("quick"); $("mState").textContent = "· rough"; fineT = setTimeout(() => { if (!playing) { ask("fine"); $("mState").textContent = "· refining…"; } }, 900); }
function sliceNumbers() { clearTimeout(sliceT); sliceT = setTimeout(() => ask("slice", true), 300); }
const f3 = (x) => (Math.abs(x) < 5e-4 ? "0" : Math.abs(x) >= 100 ? x.toFixed(1) : x.toFixed(3));
function rows(el, list) { el.textContent = ""; for (const [k, v, cls] of list) { const a = document.createElement("i"), b = document.createElement("span"); a.textContent = k; b.textContent = v; if (cls) b.className = cls; el.append(a, b); } }
function show() {
  const m = S.measure, d = m ? m.dim : 4, nm = ["", "length", "area", "volume", "4-volume"], bn = ["", "ends", "perimeter", "area", "boundary (3-volume)"];
  if (m) { const pl = []; for (let i = 0; i < d; i++) for (let j = i + 1; j < d; j++) pl.push("xyzw"[i] + "xyzw"[j] + " " + f3(m.moments[i][i] + m.moments[j][j]));
    rows($("meas"), [[nm[d], f3(m.volume)], [bn[d], f3(m.boundary)], ["centroid", m.centroid.map(f3).join(", ")], ["inertia, by plane", pl.join(" · ")], ["extent", m.bbox.lo.map((v, i) => f3(m.bbox.hi[i] - v)).join(" × ")]]);
    $("mState").textContent = S.fine ? `· to ${f3(m.h)}` : $("mState").textContent; }
  rows($("fit"), (S.fit || []).map((f) => [`${f.a} · ${f.b}`, f.overlap > 0 ? `OVERLAP ${f.overlap.toPrecision(2)}` : (Number.isFinite(f.gap) ? `clear, gap ≈ ${f.gap.toFixed(2)}` : "clear"), f.overlap > 0 ? "bad" : "good"]));
  if (!(S.tree.check || []).length) $("fit").textContent = "one part: nothing to fit. An assembly lists pairs under \"check\".";
  rows($("sl"), S.slice ? [["volume", f3(S.slice.volume)], ["area", f3(S.slice.area)]] : []); strip();
}
/* the strip: how much of each part a slice parallel to yours would hold, from kata to ana, and where yours is. What
   you can't see in the picture is here: a part that has left your slice is a bump further along */
const HEX = ["#d6c7a8", "#6badfa", "#fab266", "#9ee08a", "#d199fa", "#f2e673"];
function strip() {
  const c = $("prof"), x = c.getContext("2d"), dpr = Math.min(window.devicePixelRatio || 1, 2), w = c.clientWidth, h = c.clientHeight; if (!w) return; c.width = Math.round(w * dpr); c.height = Math.round(h * dpr); x.setTransform(dpr, 0, 0, dpr, 0, 0); x.clearRect(0, 0, w, h);
  const P = S.profile, top = P ? Math.max(1e-9, ...P.flat()) : 1, y0 = h - 13;
  x.strokeStyle = "rgba(255,255,255,0.18)"; x.beginPath(); x.moveTo(0, y0 + 0.5); x.lineTo(w, y0 + 0.5); x.stroke();
  (P || []).forEach((v, i) => { const n = v.length; x.beginPath(); x.moveTo(0, y0); v.forEach((q, k) => x.lineTo(((k + 0.5) / n) * w, y0 - (q / top) * (y0 - 4))); x.lineTo(w, y0); x.closePath(); x.globalAlpha = 0.28; x.fillStyle = HEX[i % 6]; x.fill(); x.globalAlpha = 1; x.strokeStyle = HEX[i % 6]; x.lineWidth = 1.4; x.stroke(); });
  const mx = (off / R * 0.5 + 0.5) * w; x.strokeStyle = "#ffd27a"; x.lineWidth = 1.5; x.beginPath(); x.moveTo(mx, 0); x.lineTo(mx, y0); x.stroke();
  x.font = "10px ui-monospace, Menlo, monospace"; x.textBaseline = "bottom"; x.fillStyle = "#ff66b8"; x.textAlign = "left"; x.fillText("kata", 0, h); x.fillStyle = "#38f2e0"; x.textAlign = "right"; x.fillText("ana", w, h); x.fillStyle = "#9a958c"; x.textAlign = "center"; x.fillText("along the direction you can't see", w / 2, h);
}

/* ------------------------------------------------------------------ linked?
   The test a slice can't make. A film is the disc a loop bounds. What comes through it at rest is drawn in the middle
   disc of each row; to either side the loop is lifted along one axis, a step a disc. Between discs the rim is watched
   (finely): the other part touching it is a collision, and nothing past that is reachable. If instead the piercing
   ends with the rim untouched, the loop is free that way. */
const FK = 4, FSUB = 24;
function filmTest(f, d) {
  const v = S.vals, c = f.centre.map((x) => num(x, v)), Rf = num(f.rad, v), t = num(f.tube, v), [i, j] = f.plane, idx = S.tree.show.indexOf(f.other), X = S.shape.parts[idx].sdf, U = 2 * Rf;
  const at = (u, a, b) => { const p = c.slice(); p[d] += u; p[i] += a; p[j] += b; return X(p[0], p[1], p[2], p[3]); };
  const rimHit = (u) => { for (let k = 0; k < 48; k++) { const a = (k / 48) * 2 * Math.PI; if (at(u, Rf * Math.cos(a), Rf * Math.sin(a)) < t) return true; } return false; };
  const N = 19, disc = (u) => { const m = []; let any = false; for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) { const a = ((x + 0.5) / N * 2 - 1) * Rf, b = ((y + 0.5) / N * 2 - 1) * Rf, inside = a * a + b * b < Rf * Rf && at(u, a, b) < 0; m.push(inside); any = any || inside; } return { m, any }; };
  const cells = Array(2 * FK + 1).fill(null), side = {}; cells[FK] = { ...disc(0), state: rimHit(0) ? "hit" : "rest" };
  for (const sg of [1, -1]) { let done = "";
    for (let k = 1; k <= FK; k++) { const at0 = FK + sg * k; if (done) { cells[at0] = { state: done === "hit" ? "blocked" : "gone" }; continue; }
      let hit = false; for (let q = 1; q <= FSUB && !hit; q++) hit = rimHit((sg * (k - 1 + q / FSUB) * U) / FK);
      const dd = disc((sg * k * U) / FK); if (hit) { cells[at0] = { ...dd, state: "hit" }; done = "hit"; } else if (!dd.any) { cells[at0] = { ...dd, state: "clear" }; done = "free"; } else cells[at0] = { ...dd, state: "pierced" }; }
    side[sg] = done || "pierced"; }
  return { cells, side, N, inPlane: d === i || d === j };
}
function filmsBuild() {
  const F = S.tree.films, box = $("films"); $("filmSec").hidden = !F; box.textContent = ""; if (!F) return;
  F.forEach((f, n) => { const h = document.createElement("h3"), c = document.createElement("canvas"), p = document.createElement("p"); h.textContent = `the film of ${f.loopName}, and ${f.otherName} through it`; c.id = "film" + n; p.id = "filmV" + n; box.append(h, c, p); });
  filmsDraw();
}
function filmsDraw() {
  const F = S.tree && S.tree.films; if (!F || S.err) return;
  F.forEach((f, n) => { const c = $("film" + n); if (!c) return; const w = c.clientWidth || 320, lab = 50, cell = Math.min(36, (w - lab - 4) / (2 * FK + 1)), rowH = cell + 4, dpr = Math.min(window.devicePixelRatio || 1, 2);
    c.style.height = 4 * rowH + 6 + "px"; c.width = Math.round(w * dpr); c.height = Math.round((4 * rowH + 6) * dpr); const x = c.getContext("2d"); x.setTransform(dpr, 0, 0, dpr, 0, 0); x.clearRect(0, 0, w, 4 * rowH + 6);
    const li = S.tree.show.indexOf(f.loop), oi = S.tree.show.indexOf(f.other), free = [], held = [];
    for (let d = 0; d < 4; d++) { const T = filmTest(f, d), y = 3 + d * rowH + rowH / 2, r = cell / 2 - 3;
      x.font = "600 11px ui-monospace, Menlo, monospace"; x.textBaseline = "middle"; x.textAlign = "left"; x.fillStyle = T.inPlane ? "#9a958c" : "#ffd27a"; x.fillText("xyzw"[d] + (T.inPlane ? " in" : " out"), 6, y);
      T.cells.forEach((cl, k) => { const cx = lab + (k + 0.5) * cell;
        if (cl.state === "blocked" || cl.state === "gone") { x.globalAlpha = 0.25; x.strokeStyle = cl.state === "gone" ? "#38f2e0" : "#9a958c"; x.lineWidth = 1; x.setLineDash([2, 3]); x.beginPath(); x.arc(cx, y, r, 0, 7); x.stroke(); x.setLineDash([]); x.globalAlpha = 1; return; }
        x.fillStyle = HEX[oi % 6]; const px = (2 * r) / T.N; for (let q = 0; q < cl.m.length; q++) if (cl.m[q]) x.fillRect(cx - r + (q % T.N) * px - 0.4, y - r + Math.floor(q / T.N) * px - 0.4, px + 0.8, px + 0.8);
        x.lineWidth = cl.state === "hit" ? 2.6 : cl.state === "rest" ? 2.2 : 1.6; x.strokeStyle = cl.state === "hit" ? "#ff6a4a" : cl.state === "clear" ? "#38f2e0" : HEX[li % 6]; x.beginPath(); x.arc(cx, y, r, 0, 7); x.stroke();
        if (cl.state === "hit") { x.strokeStyle = "#ff6a4a"; x.lineWidth = 1.6; x.beginPath(); x.moveTo(cx - 4, y - 4); x.lineTo(cx + 4, y + 4); x.moveTo(cx + 4, y - 4); x.lineTo(cx - 4, y + 4); x.stroke(); } });
      for (const sg of [1, -1]) (T.side[sg] === "free" ? free : T.side[sg] === "hit" ? held : []).push((sg > 0 ? "+" : "−") + "xyzw"[d]); }
    const cap = (t) => t[0].toUpperCase() + t.slice(1), why = f.kind === "curve" ? `${cap(f.otherName)} is a curve, and a curve has no need to meet a film in 4D (1 + 2 < 4): the piercing at rest is an accident of position.` : `${cap(f.otherName)} is a surface, and a surface meets a film at points no nudge removes (2 + 2 = 4): the point can only leave through the rim.`;
    const p = $("filmV" + n); p.textContent = ""; const b = document.createElement("b");
    if (free.length) { b.className = "free"; b.textContent = `Free along ${free.join(", ")}. `; p.append(b, `The piercing ends and the rim was never touched${held.length ? "; the other " + held.length + " ways hit it" : ""}. ${why}`); }
    else { b.className = "held"; b.textContent = held.length === 8 ? "Held, all eight ways. " : `Held (${held.length} of 8 ways end at the rim; the rest are still pierced at the end of the strip). `; p.append(b, why); } });
}

/* ------------------------------------------------------------------ controls */
{ // drag to orbit, pinch or wheel to zoom
  const pts = new Map(); let pinch = 0;
  canvas.addEventListener("pointerdown", (e) => { canvas.setPointerCapture(e.pointerId); pts.set(e.pointerId, [e.clientX, e.clientY]); pinch = 0; $("cap").classList.add("min"); });
  canvas.addEventListener("pointermove", (e) => { const p = pts.get(e.pointerId); if (!p) return;
    if (pts.size === 1) { yaw -= (e.clientX - p[0]) * 0.008; pitch = Math.max(-1.5, Math.min(1.5, pitch + (e.clientY - p[1]) * 0.008)); dirty = true; }
    pts.set(e.pointerId, [e.clientX, e.clientY]);
    if (pts.size === 2) { const [a, b] = [...pts.values()], d = Math.hypot(a[0] - b[0], a[1] - b[1]); if (pinch) { zoom = Math.max(0.4, Math.min(6, (zoom * d) / pinch)); dirty = true; } pinch = d; } });
  const up = (e) => { pts.delete(e.pointerId); pinch = 0; }; canvas.addEventListener("pointerup", up); canvas.addEventListener("pointercancel", up);
  canvas.addEventListener("wheel", (e) => { e.preventDefault(); zoom = Math.max(0.4, Math.min(6, zoom * Math.exp(-e.deltaY * 0.0015))); dirty = true; }, { passive: false });
}
const stick = { x: 0, y: 0 }, lever = { y: 0 }, keys = new Set();
{ // the pad (twist the slice into w, about what you see as across and up) and the lever (move it along w)
  const pad = $("twist"), knob = $("twistKnob"), lv = $("ana"), lk = $("anaKnob");
  const padMove = (e) => { const r = pad.getBoundingClientRect(); let x = (e.clientX - r.left) / r.width * 2 - 1, y = (e.clientY - r.top) / r.height * 2 - 1; const l = Math.hypot(x, y); if (l > 1) { x /= l; y /= l; } stick.x = x; stick.y = -y; knob.style.transform = `translate(${x * 30}px, ${y * 30}px)`; };
  const padEnd = () => { stick.x = stick.y = 0; knob.style.transform = ""; pad.classList.remove("live"); sliceNumbers(); };
  pad.addEventListener("pointerdown", (e) => { pad.setPointerCapture(e.pointerId); pad.classList.add("live"); padMove(e); }); pad.addEventListener("pointermove", (e) => { if (pad.classList.contains("live")) padMove(e); }); pad.addEventListener("pointerup", padEnd); pad.addEventListener("pointercancel", padEnd);
  const lvMove = (e) => { const r = lv.getBoundingClientRect(); const y = Math.max(-1, Math.min(1, (e.clientY - r.top) / r.height * 2 - 1)); lever.y = -y; lk.style.transform = `translateY(${y * 40}px)`; };
  const lvEnd = () => { lever.y = 0; lk.style.transform = ""; lv.classList.remove("live"); sliceNumbers(); };
  lv.addEventListener("pointerdown", (e) => { lv.setPointerCapture(e.pointerId); lv.classList.add("live"); lvMove(e); }); lv.addEventListener("pointermove", (e) => { if (lv.classList.contains("live")) lvMove(e); }); lv.addEventListener("pointerup", lvEnd); lv.addEventListener("pointercancel", lvEnd);
  addEventListener("keydown", (e) => { if (e.target.tagName === "TEXTAREA" || e.target.tagName === "INPUT" || e.target.tagName === "SELECT") return; keys.add(e.key); }); addEventListener("keyup", (e) => { keys.delete(e.key); sliceNumbers(); });
}
$("squareB").addEventListener("click", () => { E = ident(); off = 0; dirty = true; strip(); sliceNumbers(); });
$("cap").addEventListener("click", () => $("cap").classList.toggle("min"));
$("stlB").addEventListener("click", () => { const m = mesh(slice(S.shape, origin(), E.slice(0, 3)), 88); if (!m.count) { $("err").textContent = "nothing in this slice to export"; return; }
  const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([stl(m, `cad4 ${S.name} slice`)], { type: "model/stl" })); a.download = `cad4-${S.name}-slice.stl`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); });
for (const k of ORDER) { const o = document.createElement("option"); o.value = k; o.textContent = PARTS[k].title; $("partS").append(o); }
$("partS").addEventListener("change", () => { stop(); pick($("partS").value); });
function pick(k) { setTree(PARTS[k], k); $("partS").value = k; history.replaceState(null, "", "#" + k); }
const enc = (s) => btoa(String.fromCharCode(...new TextEncoder().encode(s))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""), dec = (s) => new TextDecoder().decode(Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0)));
$("buildB").addEventListener("click", () => { stop(); try { const t = JSON.parse($("treeT").value); setTree(t, "custom", true); $("err").textContent = ""; let o = $("partS").querySelector('[value="custom"]'); if (!o) { o = document.createElement("option"); o.value = "custom"; o.textContent = "your own"; o.disabled = true; $("partS").append(o); } $("partS").value = "custom"; history.replaceState(null, "", "#t=" + enc(JSON.stringify(t))); } catch (e) { $("err").textContent = e.message; } });
$("linkB").addEventListener("click", async () => { try { await navigator.clipboard.writeText(location.href); $("err").textContent = ""; $("linkB").textContent = "copied"; setTimeout(() => ($("linkB").textContent = "copy link"), 1200); } catch { $("err").textContent = location.href; } });

/* ▶ run: the part's own motion (its "path": a list of parameter settings), there and back */
let playing = null;
function stop() { if (playing) { playing = null; $("runB").classList.remove("on"); $("runB").textContent = "▶ run"; numbers(); } }
$("runB").addEventListener("click", () => { if (playing) return stop(); playing = { t: 0, from: { ...S.vals } }; $("runB").classList.add("on"); $("runB").textContent = "■ stop"; });
function play(dt) {
  const path = S.tree.path, legs = path.length - 1, T = 2.2; playing.t += dt; let u = playing.t / T; if (u >= 2 * legs) { u = 0; playing.t = 0; }
  if (u > legs) u = 2 * legs - u; const s = Math.min(legs - 1, Math.floor(u)), x = u - s, e = x * x * (3 - 2 * x), next = { ...S.vals };
  for (const k of Object.keys(path[s + 1])) { const a = path[s][k] ?? S.tree.params[k]; next[k] = a + (path[s + 1][k] - a) * e; }
  setVals(next, true); syncSliders(); if (!busy) ask("fit");
}

/* ------------------------------------------------------------------ the loop */
let last = performance.now(), slow = 0;
function tick(now) {
  const dt = Math.min(0.05, (now - last) / 1000), raw = now - last; last = now;
  let tx = stick.x, ty = stick.y, ly = lever.y;
  if (keys.has("ArrowLeft")) tx -= 1; if (keys.has("ArrowRight")) tx += 1; if (keys.has("ArrowUp")) ty += 1; if (keys.has("ArrowDown")) ty -= 1; if (keys.has("q") || keys.has("[")) ly += 1; if (keys.has("e") || keys.has("]")) ly -= 1;
  const moving = tx || ty || ly || playing;
  if (tx || ty) { const v = view(); if (tx) turn(lift(v.r), E[3], tx * 1.1 * dt); if (ty) turn(lift(v.u), E[3], ty * 1.1 * dt); dirty = true; }
  if (ly) { off = Math.max(-1.05 * R, Math.min(1.05 * R, off + ly * 0.6 * R * dt)); dirty = true; strip(); }
  if (playing) play(dt);
  if (dirty && prog) { dirty = false; draw(); if (!moving || S.frames % 12 === 0) { S.hit = meets(); $("miss").hidden = S.hit; }
    if (moving) { slow = raw > 45 ? slow + 1 : Math.max(0, slow - 1); if (slow > 8 && scale > 0.45) { scale *= 0.8; slow = 0; } } }
  requestAnimationFrame(tick);
}
addEventListener("resize", () => { dirty = true; filmsDraw(); });

/* ------------------------------------------------------------------ start: #name, #t=<a tree>, or the hinge */
spawn();
try { const h = location.hash.slice(1); if (h.startsWith("t=")) { $("treeT").value = dec(h.slice(2)); setTree(JSON.parse($("treeT").value), "custom"); } else pick(PARTS[h] ? h : "hinge"); }
catch (e) { pick("hinge"); $("err").textContent = e.message; }
requestAnimationFrame(tick);

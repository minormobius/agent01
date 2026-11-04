/* PHASELAB — the page. Two runs side by side (stacked on a phone): 3D, the whole 32³ box, and 4D, your 3D slice of
   the 32⁴ box, each in its own worker (./worker.js, ./phase.js). Each is ray-marched from a 32³ texture: the + liquid
   solid (teal), the − liquid clear, the box's cut faces flat. The 4D slice has the usual pad and lever. */
const $ = (id) => document.getElementById(id), glc = $("gl"), ov = $("ov");
const add = (a, b, k = 1) => a.map((v, i) => v + k * b[i]), dot = (a, b) => a.reduce((s, v, i) => s + v * b[i], 0), unit = (v) => { const m = Math.hypot(...v); return v.map((x) => x / m); };
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const N = 32, SIGMA = (2 * Math.SQRT2) / 3;

/* ------------------------------------------------------------------ GL */
const gl = glc.getContext("webgl2", { antialias: false });
if (!gl) { document.body.innerHTML = `<p style="padding:20px;font-family:monospace">PHASELAB needs WebGL2.</p>`; throw new Error("no WebGL2"); }
const VS = `#version 300 es
in vec2 aPos; void main() { gl_Position = vec4(aPos, 0.0, 1.0); }`;
const FS = `#version 300 es
precision highp float; precision highp sampler3D;
uniform sampler3D uF3, uF4; uniform vec4 uVP3, uVP4; uniform vec3 uEye, uCR, uCU, uCF; uniform float uTan, uIso, uTint;
out vec4 o;
// the box is [−1, 1]³; a texture coordinate is (p + 1)/2
float phiAt(sampler3D s, vec3 p) { return texture(s, p * 0.5 + 0.5).r; }
vec3 bg(vec3 d) { return mix(vec3(0.03, 0.035, 0.05), vec3(0.07, 0.08, 0.11), 0.5 + 0.5 * d.y); }
vec3 shade(sampler3D s, vec4 vp, vec2 fc) {
  vec2 q = (2.0 * (fc - vp.xy) - vp.zw) / vp.w;
  vec3 d = normalize(uCF + q.x * uTan * uCR + q.y * uTan * uCU), inv = 1.0 / d;
  vec3 t0 = (-1.0 - uEye) * inv, t1 = (1.0 - uEye) * inv, tn = min(t0, t1), tf = max(t0, t1);
  float a = max(max(tn.x, tn.y), tn.z), b = min(min(tf.x, tf.y), tf.z);
  vec3 c = bg(d);
  if (b <= max(a, 0.0)) return c;
  a = max(a, 0.0);
  vec3 L = normalize(vec3(0.4, 0.8, -0.3));
  // entering the box inside the + liquid: a cut face, flat, with its face's normal
  vec3 pa = uEye + d * a; float fa = phiAt(s, pa);
  if (fa > uIso) {
    vec3 n = vec3(0.0); vec3 ap = abs(pa); if (ap.x > ap.y && ap.x > ap.z) n.x = sign(pa.x); else if (ap.y > ap.z) n.y = sign(pa.y); else n.z = sign(pa.z);
    return vec3(0.1, 0.55, 0.52) * (0.55 + 0.45 * max(dot(n, L), 0.0)) * (0.8 + 0.2 * clamp(fa, 0.0, 1.0));
  }
  // march to the first + liquid, the − liquid tinting the way (faint rose)
  float st = 2.0 / 110.0, t = a, fog = 0.0, prev = fa;
  for (int i = 0; i < 200; i++) {
    t += st; if (t > b) break;
    float f = phiAt(s, uEye + d * t);
    if (f > uIso) {
      float lo = t - st, hi = t;
      for (int k = 0; k < 6; k++) { float m = 0.5 * (lo + hi); if (phiAt(s, uEye + d * m) > uIso) hi = m; else lo = m; }
      vec3 p = uEye + d * hi; const float e = 1.0 / 32.0;
      vec3 n = -normalize(vec3(phiAt(s, p + vec3(e, 0, 0)) - phiAt(s, p - vec3(e, 0, 0)), phiAt(s, p + vec3(0, e, 0)) - phiAt(s, p - vec3(0, e, 0)), phiAt(s, p + vec3(0, 0, e)) - phiAt(s, p - vec3(0, 0, e))));
      float lam = max(dot(n, L), 0.0), rim = pow(1.0 - abs(dot(n, d)), 3.0), sp = pow(max(dot(reflect(d, n), L), 0.0), 24.0);
      vec3 col = vec3(0.15, 0.78, 0.72) * (0.3 + 0.8 * lam) + vec3(0.6, 0.9, 1.0) * (rim * 0.25 + sp * 0.35);
      return mix(col, vec3(0.9, 0.4, 0.6), fog);
    }
    fog = min(0.35, fog + 0.004);
    prev = f;
  }
  return mix(c, mix(vec3(0.45, 0.16, 0.28), vec3(0.32, 0.4, 0.5), uTint), 0.25 + fog);
}
void main() {
  vec2 fc = gl_FragCoord.xy; vec3 c;
  if (fc.x >= uVP3.x && fc.x < uVP3.x + uVP3.z && fc.y >= uVP3.y && fc.y < uVP3.y + uVP3.w) c = shade(uF3, uVP3, fc);
  else c = shade(uF4, uVP4, fc);
  o = vec4(pow(c, vec3(0.9)), 1.0);
}`;
const sh = (t, s) => { const x = gl.createShader(t); gl.shaderSource(x, s); gl.compileShader(x); if (!gl.getShaderParameter(x, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(x)); return x; };
const prog = gl.createProgram(); gl.attachShader(prog, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FS)); gl.linkProgram(prog);
if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
gl.useProgram(prog);
const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
const aPos = gl.getAttribLocation(prog, "aPos"); gl.enableVertexAttribArray(aPos); gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);
const U = {}; for (const n of ["uF3", "uF4", "uVP3", "uVP4", "uEye", "uCR", "uCU", "uCF", "uTan", "uIso", "uTint"]) U[n] = gl.getUniformLocation(prog, n);
/* two 32³ half-float textures (half floats filter linearly everywhere WebGL2 runs; 32-bit floats don't on every phone),
   wrapping, so the periodic box interpolates across its edges */
const texs = [0, 1].map((unitI) => {
  const t = gl.createTexture(); gl.activeTexture(gl.TEXTURE0 + unitI); gl.bindTexture(gl.TEXTURE_3D, t);
  for (const [k, v] of [[gl.TEXTURE_MIN_FILTER, gl.LINEAR], [gl.TEXTURE_MAG_FILTER, gl.LINEAR], [gl.TEXTURE_WRAP_S, gl.REPEAT], [gl.TEXTURE_WRAP_T, gl.REPEAT], [gl.TEXTURE_WRAP_R, gl.REPEAT]]) gl.texParameteri(gl.TEXTURE_3D, k, v);
  gl.texImage3D(gl.TEXTURE_3D, 0, gl.R16F, N, N, N, 0, gl.RED, gl.FLOAT, new Float32Array(N ** 3).fill(-1));
  return t;
});
gl.uniform1i(U.uF3, 0); gl.uniform1i(U.uF4, 1);
/* what's drawn solid: A where φ > 0, the middle of an interface (the immiscible pair); for the miscible pair, only where
   it's A-rich (φ > 0.2), the rest tinted as the mixture it is: a 50/50 mix sits at φ ≈ 0 everywhere, and an
   isosurface at 0 would draw its last ripples as if it had separated */
function look(p) { gl.uniform1f(U.uIso, p === "mixable" ? 0.2 : 0); gl.uniform1f(U.uTint, p === "mixable" ? 1 : 0); }
function upload(i, field) { gl.activeTexture(gl.TEXTURE0 + i); gl.bindTexture(gl.TEXTURE_3D, texs[i]); gl.texSubImage3D(gl.TEXTURE_3D, 0, 0, 0, 0, N, N, N, gl.RED, gl.FLOAT, field); }

/* ------------------------------------------------------------------ the runs */
const sel = { preset: "unmix", paused: false, seed: 1 };
const W = { 3: new Worker("js/worker.js", { type: "module" }), 4: new Worker("js/worker.js", { type: "module" }) };
const S = { 3: null, 4: null }, hist = { 3: [], 4: [] }, gens = { 3: 0, 4: 0 };
for (const D of [3, 4]) W[D].onmessage = (e) => {
  const m = e.data; if (m.gen !== gens[D]) return;
  upload(D - 3, m.field); S[D] = m.stats; if (D === 4) W[3].postMessage({ type: "cap", t: m.stats.t + 1e-9 });
  const h = hist[D]; if (!h.length || m.stats.t > h[h.length - 1].t + 1e-9) h.push({ t: m.stats.t, rms: m.stats.rms, L: m.stats.L, largest: m.stats.largest, pieces: m.stats.pieces, mu: m.stats.mu, radii: m.stats.radii });
};
function start() { for (const D of [3, 4]) { gens[D]++; hist[D] = []; S[D] = null; W[D].postMessage({ type: "start", D, preset: sel.preset, seed: sel.seed }); W[D].postMessage({ type: "run", v: !sel.paused }); } sendSlice(); }

/* ------------------------------------------------------------------ the slice (4D) and the camera */
const frame = { E: [[1, 0, 0, 0], [0, 1, 0, 0], [0, 0, 1, 0]], N: [0, 0, 0, 1], off: 0 };
function twistSlice(dir3, ang) {
  const u = unit([0, 1, 2, 3].map((k) => dir3[0] * frame.E[0][k] + dir3[1] * frame.E[1][k] + dir3[2] * frame.E[2][k])), Nn = frame.N, c = Math.cos(ang) - 1, s = Math.sin(ang);
  const rot = (x) => { const a = dot(x, u), b = dot(x, Nn); return x.map((v, k) => v + c * (a * u[k] + b * Nn[k]) + s * (a * Nn[k] - b * u[k])); };
  frame.E = frame.E.map(rot); frame.N = rot(Nn);
  const B = [...frame.E, frame.N]; for (let i = 0; i < 4; i++) { for (let j = 0; j < i; j++) B[i] = add(B[i], B[j], -dot(B[i], B[j])); B[i] = unit(B[i]); } frame.E = B.slice(0, 3); frame.N = B[3];
}
const squareUp = () => { Object.assign(frame, { E: [[1, 0, 0, 0], [0, 1, 0, 0], [0, 0, 1, 0]], N: [0, 0, 0, 1], off: 0 }); sendSlice(); };
let sliceSent = 0;
function sendSlice() { sliceSent = performance.now(); W[4].postMessage({ type: "slice", slice: { E: frame.E, N: frame.N, off: frame.off } }); }
const view = { az: 0.75, el: 0.42, dist: 4.4 };
function camera() { const { az, el, dist } = view, eye = [-dist * Math.cos(el) * Math.sin(az), dist * Math.sin(el), -dist * Math.cos(el) * Math.cos(az)], F = unit(eye.map((x) => -x)), R = unit([F[2], 0, -F[0]]); return { eye, F, R, U: cross(F, R) }; }

/* ------------------------------------------------------------------ captions */
const PAIR = `<span class="pair">liquids A (teal, drawn solid) and B (clear): <b>immiscible</b>, like oil and water</span>`;
const CAPS = {
  mixable: `<span class="pair">liquids A and B made <b>miscible</b>: above their critical temperature</span><b>A pair that mixes.</b> Half A, half B, started in big patches of each (teal where it's mostly A), but this pair's free energy has one well, at the 50/50 mixture, not two: every patch richer in A or B costs more than the mix, so diffusion <b>smooths it out</b> and it stays one liquid, in 3D and 4D alike. Every other preset uses the <b>immiscible</b> pair (two wells, at pure A and pure B), whose 50/50 mixture can't last: see <b>un-mix</b>.`,
  unmix: `${PAIR}<b>Un-mixing, 50/50.</b> Evenly mixed, the immiscible pair can't stay that way: it splits into regions of almost pure A and almost pure B (Cahn–Hilliard: the mixture slides down its free energy, conserving each liquid). Left, ours, the whole 3D box; right, your 3D slice of the 4D box. Domains grow as t<sup>1/3</sup> in both, and at a given domain size they carry the same interface per volume. Dimension changes neither. What it changes is <b>curvature</b>: try <b>droplet</b>.`,
  emulsion: `${PAIR}<b>An emulsion</b>: about a quarter A in three quarters B, mixed, then left to separate. As ours coarsens, the A <b>breaks into pieces</b> (here roughly t 200 to 450, its largest piece falling to two-thirds of it); in 4D it stays <b>one connected network</b> the whole time. With an extra direction there are more ways for a thin thread to stay joined to the rest. In a box this small, both end as one piece once the domains are as big as the box. The plot follows the largest piece's share; <b>again</b> tries another mixture.`,
  droplet: `${PAIR}<b>A droplet</b> of A in B. Flat, this pair dissolves nothing in each other. Curved, it does: the droplet's surface squeezes it (curved in every direction across it, <b>two</b> in 3D, <b>three</b> in 4D), and the squeeze pushes a trace of A out into the B around it (Gibbs–Thomson). The chemical potential that measures it goes as σ × total curvature: <b>μR/σ = 1 in 3D, 3/2 in 4D</b>. The same droplet, half again as squeezed by its own surface. The readout gives the A dissolved around it too.`,
  nucleus: `${PAIR}<b>A nucleus</b>: the same droplet of A (R = 7) in the same B, which holds <b>5.0% A</b> dissolved, in both. A droplet grows if the liquid round it holds more A than its curvature makes it shed, and dissolves if less. At R = 7 that balance is <b>3.8% in 3D</b> and <b>6.1% in 4D</b>, so ours grows (drawing the liquid down toward its balance) and the 4D one, the same size in the same liquid, <b>dissolves</b>. The critical radius, where the balance is 5.0%, is 5.5 in 3D and 8.3 in 4D: a new phase is harder to start in 4D. The end is sudden, and really is: as it shrinks, its balance rises, so it dissolves faster and faster.`,
};
function caption() { $("cap").innerHTML = CAPS[sel.preset]; }
$("cap").onclick = () => $("cap").classList.toggle("min");
function setPreset(p) { sel.preset = p; look(p); for (const b of document.querySelectorAll("#exps button[data-x]")) b.classList.toggle("on", b.dataset.x === p); caption(); history.replaceState(null, "", `?p=${p}`); start(); }
for (const b of document.querySelectorAll("#exps button[data-x]")) b.onclick = () => setPreset(b.dataset.x);
$("againB").onclick = () => { sel.seed++; start(); };
$("pauseB").onclick = () => { sel.paused = !sel.paused; $("pauseB").classList.toggle("on", sel.paused); for (const D of [3, 4]) W[D].postMessage({ type: "run", v: !sel.paused }); };
$("squareB").onclick = squareUp;
$("gearB").onclick = () => { $("panel").hidden = !$("panel").hidden; };

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
document.addEventListener("keydown", (e) => { const k = e.key.toLowerCase(); if (k === "z") { squareUp(); return; } if (k === " ") { e.preventDefault(); $("pauseB").onclick(); return; } if ("ijklrf".includes(k) && k.length === 1) keys.add(k); });
document.addEventListener("keyup", (e) => keys.delete(e.key.toLowerCase()));
addEventListener("blur", () => keys.clear());
const drags = new Map();
glc.addEventListener("pointerdown", (e) => { try { glc.setPointerCapture(e.pointerId); } catch (err) { /* fine */ } drags.set(e.pointerId, { x: e.clientX, y: e.clientY }); });
glc.addEventListener("pointermove", (e) => { const g = drags.get(e.pointerId); if (!g) return; view.az -= (e.clientX - g.x) * 0.007; view.el = Math.max(-1.3, Math.min(1.3, view.el + (e.clientY - g.y) * 0.007)); g.x = e.clientX; g.y = e.clientY; });
for (const ev of ["pointerup", "pointercancel"]) glc.addEventListener(ev, (e) => drags.delete(e.pointerId));
glc.addEventListener("wheel", (e) => { view.dist = Math.max(2.6, Math.min(9, view.dist * Math.exp(e.deltaY * 0.001))); e.preventDefault(); }, { passive: false });
for (const ev of ["contextmenu", "selectstart"]) document.addEventListener(ev, (e) => e.preventDefault());

/* ------------------------------------------------------------------ the loop */
const TAN = 0.42;
let last = performance.now(), res = 0, layout = null;
function draw(now) {
  requestAnimationFrame(draw);
  const dt = Math.min(0.1, (now - last) / 1000); last = now;
  // the slice: pad, lever and keys; the worker re-cuts it (at most 20 times a second)
  const kv = (a, b) => (keys.has(a) ? 1 : 0) - (keys.has(b) ? 1 : 0), cam0 = camera(), tx = pads.tw[0] + kv("l", "j"), ty = pads.tw[1] + kv("i", "k"), an = pads.an + kv("r", "f"), r = (40 * Math.PI) / 180;
  if (tx || ty || an) { if (tx) twistSlice(cam0.R, tx * r * dt); if (ty) twistSlice(cam0.U, ty * r * dt); if (an) frame.off = Math.max(-16, Math.min(16, frame.off + an * 8 * dt)); if (now - sliceSent > 50) sendSlice(); }
  const dpr = Math.min(1.5, devicePixelRatio || 1); if (!res) res = dpr * (matchMedia("(pointer: coarse)").matches ? 0.6 : 0.8);
  const cw = Math.round(glc.clientWidth * res), chh = Math.round(glc.clientHeight * res); if (glc.width !== cw || glc.height !== chh) { glc.width = cw; glc.height = chh; }
  // two panels: side by side, or stacked when the screen is tall; a strip at the bottom for the plot
  const tall = chh > cw, plot = Math.round(chh * (tall ? 0.2 : 0.26)), top = Math.round(chh * 0.08);
  const vp3 = tall ? [0, plot + (chh - plot - top) / 2, cw, (chh - plot - top) / 2] : [0, plot, cw / 2, chh - plot - top], vp4 = tall ? [0, plot, cw, (chh - plot - top) / 2] : [cw / 2, plot, cw / 2, chh - plot - top];
  layout = { tall, vp3, vp4, plot: plot / res, res };
  gl.viewport(0, 0, cw, chh); gl.uniform4fv(U.uVP3, vp3); gl.uniform4fv(U.uVP4, vp4); gl.uniform1f(U.uTan, TAN);
  const cam = camera(); gl.uniform3fv(U.uEye, cam.eye); gl.uniform3fv(U.uCR, cam.R); gl.uniform3fv(U.uCU, cam.U); gl.uniform3fv(U.uCF, cam.F);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
  overlay();
}
const fmt = (x, n = 2) => (x == null || !isFinite(x) ? "–" : x.toFixed(n));
function readout(D) {
  const s = S[D]; if (!s) return ["starting…"];
  const l = [`t ${s.t.toFixed(0)} · ${s.rate.toFixed(1)} steps/s on ${D === 3 ? "32³" : "32⁴"} = ${D === 3 ? "32,768" : "1,048,576"} cells`];
  if (sel.preset === "unmix") l.push(`domain size L ${fmt(s.L, 1)} · interface ${fmt(s.SV * s.L, 2)} per volume × L · ${(s.interFrac * 100).toFixed(0)}% of it in interfaces`);
  if (sel.preset === "emulsion") l.push(`the minority (${(s.minority * 100).toFixed(0)}%): ${s.pieces} piece${s.pieces === 1 ? "" : "s"}, the largest ${(s.largest * 100).toFixed(0)}% of it`);
  if (sel.preset === "mixable") l.push(`unevenness (rms of φ) ${fmt(s.rms, 3)}: one liquid, smoothing`);
  if (sel.preset === "droplet") { const R = s.radii && s.radii[0]; l.push(`droplet R ${fmt(R, 2)} · μ ${fmt(s.mu, 4)} · μR/σ ${fmt((s.mu * R) / SIGMA, 2)} (curvature says ${D === 3 ? "1" : "1.5"}) · B holds ${fmt(100 * s.dissolved, 2)}% A`); }
  if (sel.preset === "nucleus") { const R = s.radii && s.radii[0]; l.push(R > 0.5 ? `droplet R ${fmt(R, 2)} (started 7) · B holds ${fmt(100 * s.dissolved, 2)}% A · it needs ${fmt(100 * s.need, 2)}% · ${s.dissolved > s.need + 0.0005 ? "more than it needs: growing" : s.dissolved < s.need - 0.0005 ? "less: dissolving" : "in balance"}` : `dissolved: B now holds ${fmt(100 * s.dissolved, 2)}% A`); }
  return l;
}
function overlay() {
  const g = ov.getContext("2d"), dpr = Math.min(2, devicePixelRatio || 1), w = ov.clientWidth, h = ov.clientHeight;
  if (ov.width !== Math.round(w * dpr) || ov.height !== Math.round(h * dpr)) { ov.width = Math.round(w * dpr); ov.height = Math.round(h * dpr); }
  g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, w, h); g.font = "11px ui-monospace, Menlo, monospace";
  if (!layout) return;
  const k = 1 / layout.res, cam = camera();
  // each panel: its box's edges, its label and its readout
  for (const [D, vp] of [[3, layout.vp3], [4, layout.vp4]]) {
    const x0 = vp[0] * k, yTop = h - (vp[1] + vp[3]) * k, pw = vp[2] * k, ph = vp[3] * k;
    const P = (p) => { const r = add(p, cam.eye, -1), z = dot(r, cam.F); return [x0 + pw / 2 + (dot(r, cam.R) / z / TAN) * (ph / 2), yTop + ph / 2 - (dot(r, cam.U) / z / TAN) * (ph / 2)]; };
    g.strokeStyle = "rgba(233,228,218,0.25)"; g.lineWidth = 1; g.beginPath();
    for (const [a, b] of [[0, 1], [1, 3], [3, 2], [2, 0], [4, 5], [5, 7], [7, 6], [6, 4], [0, 4], [1, 5], [2, 6], [3, 7]]) { const c = (i) => [i & 1 ? 1 : -1, i & 2 ? 1 : -1, i & 4 ? 1 : -1]; g.moveTo(...P(c(a))); g.lineTo(...P(c(b))); }
    g.stroke();
    // the panel's name, then its readout, at its foot (the caption has its head)
    g.font = "11px ui-monospace, Menlo, monospace";
    const wmax = pw - (D === 4 ? 130 : 20), lines = readout(D).flatMap((l) => (g.measureText(l).width < wmax ? [l] : l.split(" · ")));
    g.fillStyle = "rgba(233,228,218,0.85)"; lines.forEach((l, i) => g.fillText(l, x0 + 10, yTop + ph - 8 - 14 * (lines.length - 1 - i)));
    g.fillStyle = D === 3 ? "#e9e4da" : "#ffd27a"; g.font = "600 12px ui-monospace, Menlo, monospace";
    g.fillText(D === 3 ? "3D · the whole box" : `4D · your slice of it${frame.off ? ` (${frame.off >= 0 ? "+" : ""}${frame.off.toFixed(1)} ana)` : ""}`, x0 + 10, yTop + ph - 12 - 14 * lines.length);
  }
  chart(g, 0, h - layout.plot, w, layout.plot);
  const tw = $("twist"), an = $("ana"), x4 = layout.vp4[0] * k, y4 = h - (layout.vp4[1] + layout.vp4[3]) * k, pw4 = layout.vp4[2] * k;
  const ph4 = layout.vp4[3] * k; tw.style.left = `${x4 + pw4 - 176}px`; tw.style.top = `${y4 + ph4 - 120}px`; an.style.left = `${x4 + pw4 - 58}px`; an.style.top = `${y4 + ph4 - 136}px`;
}
/* the plot: what the preset is about, both dimensions on one set of axes */
function chart(g, x, y, w, h) {
  g.fillStyle = "rgba(7,8,12,0.75)"; g.fillRect(x, y, w, h);
  const pad = { l: 44, r: 12, t: 18, b: 22 }, X0 = x + pad.l, X1 = x + w - pad.r, Y0 = y + h - pad.b, Y1 = y + pad.t;
  const col = { 3: "#e9e4da", 4: "#ffd27a" }, P = sel.preset;
  const spec = P === "mixable" ? { title: "how uneven the mixture is (rms of φ): a mixing pair smooths out", log: false, f: (e) => e.rms, y: [0, 0.3], x: [0, 300] }
    : P === "unmix" ? { title: "domain size L against time (log–log); the dashed line is t^1/3", log: true, f: (e) => e.L, y: [4, 32], x: [5, 2000] }
    : P === "emulsion" ? { title: "the minority's largest piece, as a share of it (1: one network)", log: false, f: (e) => e.largest, y: [0, 1], x: [0, 1000] }
    : P === "droplet" ? { title: "μR/σ: the droplet's own squeeze (3D → 1, 4D → 3/2)", log: false, f: (e) => (e.mu * (e.radii && e.radii[0])) / SIGMA, y: [0, 2], x: [0, 600], lines: [1, 1.5] }
    : { title: "the droplet's radius (dashed: critical, 5.5 in 3D and 8.3 in 4D)", log: false, f: (e) => (e.radii && e.radii[0]) || 0, y: [0, 10], x: [0, 1000], lines: [5.52, 8.28] };
  g.fillStyle = "rgba(233,228,218,0.8)"; g.fillText(spec.title, X0, Y1 - 5);
  const tx = (t) => (spec.log ? X0 + ((Math.log(Math.max(t, spec.x[0])) - Math.log(spec.x[0])) / (Math.log(spec.x[1]) - Math.log(spec.x[0]))) * (X1 - X0) : X0 + (t / spec.x[1]) * (X1 - X0));
  const ty = (v) => (spec.log ? Y0 - ((Math.log(v) - Math.log(spec.y[0])) / (Math.log(spec.y[1]) - Math.log(spec.y[0]))) * (Y0 - Y1) : Y0 - ((v - spec.y[0]) / (spec.y[1] - spec.y[0])) * (Y0 - Y1));
  g.strokeStyle = "rgba(233,228,218,0.3)"; g.lineWidth = 1; g.strokeRect(X0, Y1, X1 - X0, Y0 - Y1);
  g.fillStyle = "rgba(233,228,218,0.6)"; g.fillText(String(spec.y[1]), x + 6, Y1 + 8); g.fillText(String(spec.y[0]), x + 6, Y0); g.fillText(`t ${spec.x[1]}`, X1 - 50, Y0 + 15);
  g.setLineDash([4, 4]);
  if (spec.log) { g.strokeStyle = "rgba(233,228,218,0.4)"; g.beginPath(); g.moveTo(tx(20), ty(8)); g.lineTo(tx(2000), ty(8 * (100 ** (1 / 3)))); g.stroke(); }
  for (const [i, v] of (spec.lines || []).entries()) { g.strokeStyle = i === 0 ? col[3] : col[4]; g.globalAlpha = 0.5; g.beginPath(); g.moveTo(X0, ty(v)); g.lineTo(X1, ty(v)); g.stroke(); g.globalAlpha = 1; }
  g.setLineDash([]);
  for (const D of [3, 4]) {
    g.strokeStyle = col[D]; g.lineWidth = 2;
    const series = [hist[D].map((e) => [e.t, spec.f(e)])];
    for (const ser of series) { g.beginPath(); let on = false; for (const [t, v] of ser) { if (v == null || !isFinite(v) || t > spec.x[1]) { on = false; continue; } const px = tx(t), py = Math.max(Y1, Math.min(Y0, ty(v))); if (on) g.lineTo(px, py); else g.moveTo(px, py); on = true; } g.stroke(); }
    g.fillStyle = col[D]; g.fillText(`${D}D`, X1 - (D === 3 ? 60 : 30), Y1 + 12);
  }
}

/* ------------------------------------------------------------------ start */
const Q = new URLSearchParams(location.search);
setPreset(CAPS[Q.get("p")] ? Q.get("p") : "unmix");
if (matchMedia("(orientation: portrait)").matches) $("cap").classList.add("min");
requestAnimationFrame(draw);
window.PHASELAB = { sel, S, hist, frame, view, setPreset, sendSlice };

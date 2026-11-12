/* BRUT⁴'s page. arch.js grows a building from the seed and hands back a CAD⁴ tree; CAD⁴'s kernel compiles it into a
   distance function for HOUSE's walker and the same function in GLSL for the eye. struct.js is the engineer. */
import { compile } from "../../cad4/js/kernel.js";
import { makeWalker, step, eye, square } from "../../house/js/walk.js";
import { generate, M, H } from "./arch.js";
import { engineer } from "./struct.js";

const $ = (id) => document.getElementById(id), canvas = $("gl"), gl = canvas.getContext("webgl2", { antialias: false, powerPreference: "high-performance" });
let B = null, shape = null, prog = null, U = {}, W = makeWalker(), scale = 1, slow = 0, E = null;
window.BRUT4 = { get W() { return W; }, get building() { return B; }, get engineer() { return E; }, frames: 0, go: (s) => build(s) };

const VS = `#version 300 es
in vec2 aP; void main() { gl_Position = vec4(aP, 0.0, 1.0); }`;
/* parts, in the tree's show order: ground, slabs, columns, walls, stair */
const FS = (sh) => `#version 300 es
precision highp float;
uniform vec2 uRes; uniform vec4 uEye, uR, uU, uF, uN;
${sh.glsl}
int which(vec4 p) { float b = 1e9, d; int k = 0;
${sh.parts.map((_, i) => `  d = part${i}(p); if (d < b) { b = d; k = ${i}; }`).join("\n")}
  return k; }
float hash(vec4 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * p.w * (p.x + p.y + p.z + p.w)); }
out vec4 o;
void main() {
  vec2 uv = (gl_FragCoord.xy * 2.0 - uRes) / uRes.y;
  vec4 rd = normalize(uR * uv.x + uU * uv.y + uF * 1.15);
  float t = 0.03; bool hit = false;
  for (int i = 0; i < 140; i++) { float d = sdf(uEye + rd * t); if (d < 0.0012 * t + 0.0008) { hit = true; break; } t += d; if (t > 150.0) break; }
  vec4 sun = normalize(vec4(0.5, 0.6, 0.3, 0.52));
  vec3 sky = mix(vec3(0.72, 0.76, 0.8), vec3(0.42, 0.5, 0.62), clamp(rd.y * 1.3, 0.0, 1.0)); sky = mix(sky, vec3(0.66, 0.67, 0.66), clamp(-rd.y * 4.0, 0.0, 1.0)); sky += vec3(1.0, 0.92, 0.78) * pow(max(dot(rd, sun), 0.0), 50.0) * 0.8;
  vec3 col = sky;
  if (hit) {
    vec4 p = uEye + rd * t; float e = 0.003 + 0.0006 * t;
    vec4 n = normalize(vec4(sdf(p + vec4(e, 0, 0, 0)) - sdf(p - vec4(e, 0, 0, 0)), sdf(p + vec4(0, e, 0, 0)) - sdf(p - vec4(0, e, 0, 0)), sdf(p + vec4(0, 0, e, 0)) - sdf(p - vec4(0, 0, e, 0)), sdf(p + vec4(0, 0, 0, e)) - sdf(p - vec4(0, 0, 0, e))) + 1e-9);
    int k = which(p); vec3 base;
    vec3 g3 = abs(fract(vec3(p.x, p.z, p.w) / ${M.toFixed(1)}) - 0.5); float bay = smoothstep(0.49, 0.5, max(g3.x, max(g3.y, g3.z)));
    if (k == 0) { float chk = mod(floor(p.x / ${M.toFixed(1)}) + floor(p.z / ${M.toFixed(1)}) + floor(p.w / ${M.toFixed(1)}), 2.0); base = mix(vec3(0.33, 0.35, 0.33), vec3(0.29, 0.31, 0.3), chk) * (1.0 - 0.3 * bay); }
    else {
      /* concrete: board marks across whatever direction the face doesn't run, a little grain, darker toward its foot; a
         wall facing along w takes a cast of teal (ana) or rose (kata), so you can tell which way you have turned */
      float boards = abs(n.y) > 0.6 ? fract(p.x * 1.6 + p.z * 1.6 + p.w * 1.6) : fract(p.y * 4.5);
      base = vec3(0.62, 0.61, 0.58) * (0.9 + 0.1 * step(0.08, boards)) * (0.93 + 0.14 * hash(floor(p * 9.0)));
      if (k == 2) base *= 0.86; if (k == 4) base *= vec3(1.05, 0.98, 0.9); if (k == 1 && n.y > 0.6) base *= (1.0 - 0.22 * bay);
      if (abs(n.w) > 0.7) base *= n.w < 0.0 ? vec3(0.9, 1.03, 1.0) : vec3(1.05, 0.93, 0.98);
      else if (abs(n.x) > 0.7) base *= vec3(1.04, 1.0, 0.95);
    }
    float sh = 1.0; { float ts = 0.06; for (int i = 0; i < 44; i++) { float d = sdf(p + n * 0.012 + sun * ts); if (d < 0.003) { sh = 0.0; break; } sh = min(sh, 9.0 * d / ts); ts += clamp(d, 0.05, 2.5); if (ts > 60.0) break; } }
    float ao = 1.0; for (int q = 1; q <= 4; q++) { float s = 0.14 * float(q); ao -= max(s - sdf(p + n * s), 0.0) / s * 0.17; } ao = clamp(ao, 0.2, 1.0);
    col = base * (0.42 * ao + 0.16 * ao * (0.5 + 0.5 * n.y) + 0.8 * max(dot(n, sun), 0.0) * clamp(sh, 0.0, 1.0));
    col = mix(col, sky, 1.0 - exp(-t * 0.012));
  }
  /* ghosts: the columns that stand just out of your slice, up to half a bay ana (teal) or kata (rose) of it. Without
     them a slice between two rows of columns shows a building standing on nothing */
  { float tg = 0.05, lim = min(hit ? t : 150.0, 90.0), side = 0.0; bool gh = false;
    for (int i = 0; i < 48; i++) { vec4 p = uEye + rd * tg; float d = 1e9, sd = 0.0;
      for (int k = 0; k < 8; k++) { float off = (k < 4 ? 1.0 : -1.0) * (0.4 + 0.55 * float(k < 4 ? k : k - 4)); float e = part2(p + uN * off); if (e < d) { d = e; sd = off; } }
      if (d < 0.002 * tg + 0.002) { gh = true; side = sd; break; } tg += max(d, 0.02); if (tg > lim) break; }
    if (gh) col = mix(col, side > 0.0 ? vec3(0.22, 0.95, 0.88) : vec3(1.0, 0.4, 0.72), 0.26 * exp(-tg * 0.015)); }
  o = vec4(pow(clamp(col, 0.0, 1.0), vec3(0.4545)), 1.0);
}`;
function program(sh) { const mk = (t, src) => { const s = gl.createShader(t); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; }, p = gl.createProgram(); gl.attachShader(p, mk(gl.VERTEX_SHADER, VS)); gl.attachShader(p, mk(gl.FRAGMENT_SHADER, FS(sh))); gl.bindAttribLocation(p, 0, "aP"); gl.linkProgram(p); if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p)); return p; }
{ const vao = gl.createVertexArray(); gl.bindVertexArray(vao); const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW); gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0); }

function build(seed) {
  B = generate(seed); shape = compile(B.tree); E = engineer(B); if (prog) gl.deleteProgram(prog); prog = program(shape); U = {}; for (const n of ["uRes", "uEye", "uR", "uU", "uF", "uN"]) U[n] = gl.getUniformLocation(prog, n);
  /* start outside, on the +x side, in line with the stair, looking at the building */
  W = makeWalker([B.bounds.hi[0] + 9, 0.05, 1.35, 2]); W.F = [-1, 0, 0, 0]; W.R = [0, 0, -1, 0]; W.N = [0, 0, 0, 1];
  $("seedI").value = B.seed; history.replaceState(null, "", "?s=" + encodeURIComponent(B.seed)); report();
}
function draw() { const dpr = Math.min(window.devicePixelRatio || 1, 2) * scale, w = Math.max(2, Math.round(canvas.clientWidth * dpr)), h = Math.max(2, Math.round(canvas.clientHeight * dpr)); if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
  const e = eye(W); gl.viewport(0, 0, w, h); gl.useProgram(prog); gl.uniform2f(U.uRes, w, h); gl.uniform4fv(U.uEye, e.at); gl.uniform4fv(U.uR, e.right); gl.uniform4fv(U.uU, e.up); gl.uniform4fv(U.uF, e.fwd); gl.uniform4fv(U.uN, e.unseen); gl.drawArrays(gl.TRIANGLES, 0, 3); window.BRUT4.frames++; }

/* the engineer's report */
function report() { const g = E.gravity, f = (v, n = 2) => v.toFixed(n), kN = (v) => (v / 1e6).toFixed(1) + " MN", el = $("report");
  const bar = (c) => `<div class="row"><span>${c.name}</span><b>${f(c.use)}</b></div><div class="bar"><i class="${c.use > 1 ? "bad" : c.use > 0.8 ? "hot" : ""}" style="width:${Math.min(100, c.use * 100).toFixed(0)}%"></i></div>`;
  el.innerHTML = `<h3>${B.kind} · ${E.storeys} storeys · ${E.stands ? "stands" : "FAILS"}</h3>` +
    `<div class="row"><span>tiers (bays x × z × w · storeys)</span><b>${B.tiers.map((t) => t.range.map(([a, b]) => b - a).join("×") + "·" + t.storeys).join("  ")}</b></div>` +
    `<div class="row"><span>columns</span><b>${E.columns} of ${f(E.col)} m</b></div><div class="row"><span>worst column carries</span><b>${kN(g.worst.N)} over ${g.worst.floors} floors</b></div>` +
    `<div class="row"><span>sway periods (each ×3)</span><b>${E.periods.map((v) => f(v) + " s").join(", ")}</b></div><div style="height:6px"></div>` + E.checks.map(bar).join("") +
    `<p>A floor here is a volume, so a column takes a bay <b>cube</b> of it, ${M ** 3} m³ a floor. A column of our proportions (0.5 m) would be good for <b>${g.ours.storeys} storeys</b> of this bay; in a 3D building it is good for about 23. So the columns are sized by the load: <b>${f(E.col)} m</b> here. The frame is the same along x, z and w, so every sway mode comes three times.</p>`; }

/* the map: the ground's three directions drawn obliquely (x right, z toward you, w up the page), each tier's footprint,
   the stair's bay, you, where you face, and dashed the direction you can't see */
const plan = $("plan"), px = plan.getContext("2d");
function map() { const dpr = Math.min(window.devicePixelRatio || 1, 2), w = plan.clientWidth, h = plan.clientHeight; if (plan.width !== Math.round(w * dpr)) { plan.width = Math.round(w * dpr); plan.height = Math.round(h * dpr); } px.setTransform(dpr, 0, 0, dpr, 0, 0); px.clearRect(0, 0, w, h);
  const lo = B.bounds.lo, hi = B.bounds.hi, mid = [0, 1, 2].map((i) => (lo[i] + hi[i]) / 2), ext = Math.max(...[0, 1, 2].map((i) => hi[i] - lo[i])) + 14, s = (h * 0.62) / ext;
  const P = (x, z, ww) => [w * 0.48 + ((x - mid[0]) - (z - mid[1]) * 0.5) * s, h * 0.54 + ((z - mid[1]) * 0.42 - (ww - mid[2])) * s], line = (a, b, c, wd = 1, dash) => { px.strokeStyle = c; px.lineWidth = wd; px.setLineDash(dash || []); px.beginPath(); px.moveTo(...P(...a)); px.lineTo(...P(...b)); px.stroke(); px.setLineDash([]); };
  const cube = (a, b, c, wd) => { for (const u of [0, 1]) for (const v of [0, 1]) { line([a[0], u ? b[1] : a[1], v ? b[2] : a[2]], [b[0], u ? b[1] : a[1], v ? b[2] : a[2]], c, wd); line([u ? b[0] : a[0], a[1], v ? b[2] : a[2]], [u ? b[0] : a[0], b[1], v ? b[2] : a[2]], c, wd); line([u ? b[0] : a[0], v ? b[1] : a[1], a[2]], [u ? b[0] : a[0], v ? b[1] : a[1], b[2]], c, wd); } };
  const storey = Math.max(0, Math.floor((W.p[1] + 0.5) / H)); B.tiers.forEach((t) => { const here = storey >= t.start && storey < t.start + t.storeys; cube(t.range.map(([a]) => a * M), t.range.map(([, b]) => b * M), here ? "rgba(233,228,218,0.75)" : "rgba(233,228,218,0.22)", here ? 1.3 : 1); });
  cube([0, 0, 0], [M, M, M], "#c0523f", 1.4);
  const me = [W.p[0], W.p[2], W.p[3]], L = ext * 0.16, tip = (v, l) => [me[0] + v[0] * l, me[1] + v[2] * l, me[2] + v[3] * l];
  line(me, tip(W.N, L), W.N[3] >= 0 ? "#38f2e0" : "#ff66b8", 1.5, [3, 3]); line(me, tip(W.N, -L), "rgba(154,149,140,0.7)", 1, [3, 3]); line(me, tip(W.F, L * 1.3), "#ffd27a", 2.2);
  px.fillStyle = "#ffd27a"; px.beginPath(); px.arc(...P(...me), 3.2, 0, 7); px.fill();
  px.font = "10px ui-monospace, Menlo, monospace"; px.fillStyle = "#9a958c"; px.textAlign = "left"; px.fillText(storey >= E.storeys ? "roof" : storey ? "storey " + storey : "ground", 8, h - 8); px.textAlign = "right"; px.fillText("x → · z ↙ · w ↑", w - 8, h - 8); }
const AX = { 0: "x", 2: "z", 3: "w" }, name = (v) => { let b = 0, m = 0; for (const i of [0, 2, 3]) if (Math.abs(v[i]) > m) { m = Math.abs(v[i]); b = i; } return (m > 0.96 ? "" : "≈") + (v[b] < 0 ? "−" : "+") + AX[b]; };
function caption() { const cls = W.N[3] > 0.5 ? "ana" : W.N[3] < -0.5 ? "kata" : ""; $("cap").innerHTML = `ahead <b>${name(W.F)}</b> · right <b>${name(W.R)}</b> · unseen <b class="${cls}">${name(W.N)}</b><br>x ${W.p[0].toFixed(1)} · z ${W.p[2].toFixed(1)} · w ${W.p[3].toFixed(1)} · up ${W.p[1].toFixed(1)}`; }

/* controls (HOUSE's) */
const walk = { x: 0, y: 0 }, tw = { x: 0, y: 0 }, keys = new Set(); let lookX = 0, lookY = 0;
function pad(el, knob, out) { const move = (e) => { const r = el.getBoundingClientRect(); let x = ((e.clientX - r.left) / r.width) * 2 - 1, y = ((e.clientY - r.top) / r.height) * 2 - 1; const l = Math.hypot(x, y); if (l > 1) { x /= l; y /= l; } out.x = x; out.y = -y; knob.style.transform = `translate(${x * 34}px, ${y * 34}px)`; }, end = () => { out.x = out.y = 0; knob.style.transform = ""; el.classList.remove("live"); };
  el.addEventListener("pointerdown", (e) => { el.setPointerCapture(e.pointerId); el.classList.add("live"); move(e); }); el.addEventListener("pointermove", (e) => { if (el.classList.contains("live")) move(e); }); el.addEventListener("pointerup", end); el.addEventListener("pointercancel", end); }
pad($("stick"), $("stickKnob"), walk); pad($("twist"), $("twistKnob"), tw);
{ let last = null; canvas.addEventListener("pointerdown", (e) => { canvas.setPointerCapture(e.pointerId); last = [e.clientX, e.clientY]; $("seedI").blur(); }); canvas.addEventListener("pointermove", (e) => { if (!last) return; lookX += (e.clientX - last[0]) * 0.005; lookY -= (e.clientY - last[1]) * 0.005; last = [e.clientX, e.clientY]; }); const up = () => (last = null); canvas.addEventListener("pointerup", up); canvas.addEventListener("pointercancel", up); }
addEventListener("keydown", (e) => { if (e.target === $("seedI")) { if (e.key === "Enter") { build($("seedI").value.trim() || "brut"); $("seedI").blur(); } return; } keys.add(e.key.toLowerCase()); if (e.key === "r" || e.key === "R") square(W); if (e.key === " ") e.preventDefault(); }); addEventListener("keyup", (e) => keys.delete(e.key.toLowerCase()));
const WORDS = ["barbican", "trellick", "habitat", "boston", "unite", "balfron", "geisel", "torre", "robin-hood", "park-hill", "alexandra", "tricorn", "sesc", "banco", "kyoto", "genex"];
$("rollB").addEventListener("click", () => build(WORDS[Math.floor(Math.random() * WORDS.length)] + "-" + Math.floor(Math.random() * 90 + 1))); // (the one unseeded roll: which seed to open)
$("engB").addEventListener("click", () => ($("report").hidden = !$("report").hidden)); $("squareB").addEventListener("click", () => square(W)); $("helpB").addEventListener("click", () => ($("panel").hidden = !$("panel").hidden)); $("panel").addEventListener("click", (e) => { if (e.target.tagName !== "A") $("panel").hidden = true; });

let prev = performance.now();
function tick(now) { const raw = now - prev, dt = Math.min(0.05, raw / 1000); prev = now;
  const k = (a) => (keys.has(a) ? 1 : 0), inp = { move: [walk.y + k("w") - k("s"), walk.x + k("d") - k("a"), k("c") - k("z")], look: [lookX + (k("arrowright") - k("arrowleft")) * 1.6 * dt, lookY + (k("arrowup") - k("arrowdown")) * 1.2 * dt], into: [(tw.x + k("e") - k("q")) * 1.3 * dt, tw.y * 1.3 * dt], jump: keys.has(" ") };
  lookX = lookY = 0; step(W, shape.sdf, inp, dt); draw(); map(); caption();
  slow = raw > 45 ? slow + 1 : Math.max(0, slow - 1); if (slow > 12 && scale > 0.35) { scale *= 0.8; slow = 0; }
  requestAnimationFrame(tick); }
build(new URLSearchParams(location.search).get("s") || "barbican-7"); requestAnimationFrame(tick);

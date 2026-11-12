/* HOUSE's page. The room is CAD⁴'s (../cad4/js/parts.js), compiled once by CAD⁴'s kernel into a distance function for
   your body (walk.js) and the same function in GLSL for your eye: the slice through the eye spanned by right, up and
   ahead, sphere-traced. The door is a parameter (a uniform in the shader, a recompile of the JS for the walker). */
import { compile } from "../../cad4/js/kernel.js";
import { PARTS } from "../../cad4/js/parts.js";
import { makeWalker, step, eye, square } from "./walk.js";

const $ = (id) => document.getElementById(id), canvas = $("gl"), gl = canvas.getContext("webgl2", { antialias: false, powerPreference: "high-performance" });
const TREE = PARTS.room, W = makeWalker([0.3, 0.05, 0.9, -0.4]);
let open = 0, want = 0, shape = compile(TREE, { open }), scale = 1, slow = 0;
window.HOUSE = { W, get open() { return open; }, set door(v) { want = v; }, frames: 0 };

const VS = `#version 300 es
in vec2 aP; void main() { gl_Position = vec4(aP, 0.0, 1.0); }`;
/* parts, in the tree's show order: ground, house, door, pin, table */
const FS = `#version 300 es
precision highp float;
uniform vec2 uRes; uniform vec4 uEye, uR, uU, uF, uN; uniform float uT;
${shape.glsl}
int which(vec4 p) { float b = 1e9, d; int k = 0;
${shape.parts.map((_, i) => `  d = part${i}(p); if (d < b) { b = d; k = ${i}; }`).join("\n")}
  return k; }
float shade(vec4 p, vec4 n) { float a = 1.0; for (int k = 1; k <= 4; k++) { float s = 0.09 * float(k); a -= max(s - sdf(p + n * s), 0.0) / s * 0.17; } return clamp(a, 0.2, 1.0); }
out vec4 o;
void main() {
  vec2 uv = (gl_FragCoord.xy * 2.0 - uRes) / uRes.y;
  vec4 rd = normalize(uR * uv.x + uU * uv.y + uF * 1.15);
  float t = 0.03; bool hit = false;
  for (int i = 0; i < 120; i++) { float d = sdf(uEye + rd * t); if (d < 0.0012 * t + 0.0006) { hit = true; break; } t += d; if (t > 46.0) break; }
  /* the sky: lighter toward the horizon, a sun in a fixed 4D direction */
  vec4 sun = normalize(vec4(0.45, 0.62, 0.3, 0.55));
  vec3 sky = mix(vec3(0.62, 0.74, 0.9), vec3(0.2, 0.36, 0.66), clamp(rd.y * 1.4, 0.0, 1.0)); sky = mix(sky, vec3(0.7, 0.72, 0.7), clamp(-rd.y * 4.0, 0.0, 1.0)); sky += vec3(1.0, 0.9, 0.7) * pow(max(dot(rd, sun), 0.0), 60.0);
  vec3 col = sky;
  if (hit) {
    vec4 p = uEye + rd * t; float e = 0.0025;
    vec4 n = normalize(vec4(sdf(p + vec4(e, 0, 0, 0)) - sdf(p - vec4(e, 0, 0, 0)), sdf(p + vec4(0, e, 0, 0)) - sdf(p - vec4(0, e, 0, 0)), sdf(p + vec4(0, 0, e, 0)) - sdf(p - vec4(0, 0, e, 0)), sdf(p + vec4(0, 0, 0, e)) - sdf(p - vec4(0, 0, 0, e))) + 1e-9);
    int k = which(p); vec3 base;
    /* ground and floor: metre tiles, chequered in all three floor directions, so walking any of them changes what you see */
    float chk = mod(floor(p.x) + floor(p.z) + floor(p.w), 2.0); vec3 g3 = abs(fract(vec3(p.x, p.z, p.w)) - 0.5); float seam = smoothstep(0.47, 0.5, max(g3.x, max(g3.y, g3.z)));
    if (k == 0) { bool inside = max(abs(p.x), max(abs(p.z), abs(p.w))) < 2.0; base = inside ? mix(vec3(0.62, 0.47, 0.31), vec3(0.5, 0.37, 0.24), chk) : mix(vec3(0.36, 0.5, 0.3), vec3(0.3, 0.44, 0.26), chk); base *= 1.0 - 0.35 * seam; }
    /* walls are tinted by the floor direction they face: x warm, z cool grey, w teal (ana) and rose (kata) */
    else if (k == 1) { vec3 a = abs(vec3(n.x, n.z, n.w)); base = vec3(0.86, 0.82, 0.74); if (a.x > 0.7) base = vec3(0.9, 0.8, 0.66); else if (a.y > 0.7) base = vec3(0.78, 0.8, 0.84); else if (a.z > 0.7) base = n.w < 0.0 ? vec3(0.62, 0.86, 0.82) : vec3(0.9, 0.7, 0.8); if (abs(n.y) > 0.7) base = vec3(0.9, 0.89, 0.86);
      /* faint metre lines on the walls, in every direction a wall runs, and a skirting */
      vec4 gq = abs(fract(p) - 0.5); vec4 on = smoothstep(vec4(0.485), vec4(0.5), gq) * (1.0 - step(0.5, abs(n))); float ln = max(max(on.x, on.z), max(on.w, on.y)); base *= 1.0 - 0.16 * ln; if (p.y < 0.12 && abs(n.y) < 0.5) base *= 0.72; }
    else if (k == 2) base = vec3(0.56, 0.22, 0.18);
    else if (k == 3) base = vec3(0.8, 0.68, 0.3);
    else base = vec3(0.45, 0.3, 0.18);
    float sh = 1.0; { float ts = 0.05; for (int i = 0; i < 36; i++) { float d = sdf(p + n * 0.01 + sun * ts); if (d < 0.002) { sh = 0.0; break; } sh = min(sh, 10.0 * d / ts); ts += clamp(d, 0.03, 0.6); if (ts > 14.0) break; } }
    float ao = shade(p, n), dif = max(dot(n, sun), 0.0) * clamp(sh, 0.0, 1.0);
    /* a lamp under the ceiling, in the middle of the room in all three floor directions */
    vec4 lv = vec4(0.0, 2.35, 0.0, 0.0) - p; float ld = length(lv), lamp = max(dot(n, lv / ld), 0.0) / (1.0 + 0.22 * ld * ld) * step(max(abs(p.x), max(abs(p.z), abs(p.w))), 2.05);
    col = base * (0.3 * ao + 0.18 * ao * (0.5 + 0.5 * n.y) + 0.85 * dif + 0.95 * lamp * ao * vec3(1.0, 0.93, 0.8));
    col = mix(col, sky, 1.0 - exp(-t * 0.028));
  }
  o = vec4(pow(clamp(col, 0.0, 1.0), vec3(0.4545)), 1.0);
}`;
function program() { const sh = (t, src) => { const s = gl.createShader(t); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; }, p = gl.createProgram(); gl.attachShader(p, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(p, sh(gl.FRAGMENT_SHADER, FS)); gl.bindAttribLocation(p, 0, "aP"); gl.linkProgram(p); if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p)); return p; }
const prog = program(), U = {}; for (const n of ["uRes", "uEye", "uR", "uU", "uF", "uN", "uP"]) U[n] = gl.getUniformLocation(prog, n);
{ const vao = gl.createVertexArray(); gl.bindVertexArray(vao); const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW); gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0); }
function draw() { const dpr = Math.min(window.devicePixelRatio || 1, 2) * scale, w = Math.max(2, Math.round(canvas.clientWidth * dpr)), h = Math.max(2, Math.round(canvas.clientHeight * dpr)); if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
  const e = eye(W); gl.viewport(0, 0, w, h); gl.useProgram(prog); gl.uniform2f(U.uRes, w, h); gl.uniform4fv(U.uEye, e.at); gl.uniform4fv(U.uR, e.right); gl.uniform4fv(U.uU, e.up); gl.uniform4fv(U.uF, e.fwd); gl.uniform4fv(U.uN, e.unseen); gl.uniform1fv(U.uP, shape.order.map((k) => shape.params[k])); gl.drawArrays(gl.TRIANGLES, 0, 3); window.HOUSE.frames++; }

/* the map: the floor's three directions drawn obliquely (x right, z toward you, w up the page), the room's cube, the
   doorway on its +x face, you, where you face, and dashed the direction you can't see */
const plan = $("plan"), px = plan.getContext("2d");
function map() { const dpr = Math.min(window.devicePixelRatio || 1, 2), w = plan.clientWidth, h = plan.clientHeight; if (plan.width !== Math.round(w * dpr)) { plan.width = Math.round(w * dpr); plan.height = Math.round(h * dpr); } px.setTransform(dpr, 0, 0, dpr, 0, 0); px.clearRect(0, 0, w, h);
  const s = 15, P = (x, z, ww) => [w * 0.46 + (x - z * 0.5) * s, h * 0.56 + (z * 0.42 - ww) * s], line = (a, b, c, wd = 1, dash) => { px.strokeStyle = c; px.lineWidth = wd; px.setLineDash(dash || []); px.beginPath(); px.moveTo(...P(...a)); px.lineTo(...P(...b)); px.stroke(); px.setLineDash([]); };
  for (const a of [-2, 2]) for (const b of [-2, 2]) { line([-2, a, b], [2, a, b], "rgba(233,228,218,0.45)"); line([a, -2, b], [a, 2, b], "rgba(233,228,218,0.3)"); line([a, b, -2], [a, b, 2], "rgba(233,228,218,0.3)"); }
  px.strokeStyle = "#c0523f"; px.lineWidth = 2; px.beginPath(); [[2, -0.45, -0.6], [2, 0.45, -0.6], [2, 0.45, 0.6], [2, -0.45, 0.6], [2, -0.45, -0.6]].forEach((q, i) => (i ? px.lineTo(...P(...q)) : px.moveTo(...P(...q)))); px.stroke();
  const me = [W.p[0], W.p[2], W.p[3]], tip = (v, l) => [me[0] + v[0] * l, me[1] + v[2] * l, me[2] + v[3] * l];
  line(me, [me[0], me[1], -2], "rgba(255,210,122,0.35)", 1, [2, 2]); line(me, tip(W.N, 1.3), W.N[3] >= 0 ? "#38f2e0" : "#ff66b8", 1.5, [3, 3]); line(me, tip(W.N, -1.3), "rgba(154,149,140,0.7)", 1, [3, 3]); line(me, tip(W.F, 1.6), "#ffd27a", 2.2);
  px.fillStyle = "#ffd27a"; px.beginPath(); px.arc(...P(...me), 3.2, 0, 7); px.fill();
  px.font = "10px ui-monospace, Menlo, monospace"; px.fillStyle = "#9a958c"; px.textAlign = "center"; const lab = (t, q) => px.fillText(t, ...P(...q)); lab("x", [3, 2.2, -2]); lab("z", [-2.2, 3.1, -2]); lab("w", [-2, -2, 2.9]); }
const AX = { 0: "x", 2: "z", 3: "w" }, name = (v) => { let b = 0, m = 0; for (const i of [0, 2, 3]) if (Math.abs(v[i]) > m) { m = Math.abs(v[i]); b = i; } return (m > 0.96 ? "" : "≈") + (v[b] < 0 ? "−" : "+") + AX[b]; };
function caption() { const n = name(W.N), cls = W.N[3] > 0.5 ? "ana" : W.N[3] < -0.5 ? "kata" : ""; $("cap").innerHTML = `ahead <b>${name(W.F)}</b> · right <b>${name(W.R)}</b> · unseen <b class="${cls}">${n}</b><br>x ${W.p[0].toFixed(1)} · z ${W.p[2].toFixed(1)} · w ${W.p[3].toFixed(1)}`; }

/* controls */
const walk = { x: 0, y: 0 }, tw = { x: 0, y: 0 }, keys = new Set(); let lookX = 0, lookY = 0;
function pad(el, knob, out) { const move = (e) => { const r = el.getBoundingClientRect(); let x = ((e.clientX - r.left) / r.width) * 2 - 1, y = ((e.clientY - r.top) / r.height) * 2 - 1; const l = Math.hypot(x, y); if (l > 1) { x /= l; y /= l; } out.x = x; out.y = -y; knob.style.transform = `translate(${x * 34}px, ${y * 34}px)`; }, end = () => { out.x = out.y = 0; knob.style.transform = ""; el.classList.remove("live"); };
  el.addEventListener("pointerdown", (e) => { el.setPointerCapture(e.pointerId); el.classList.add("live"); move(e); }); el.addEventListener("pointermove", (e) => { if (el.classList.contains("live")) move(e); }); el.addEventListener("pointerup", end); el.addEventListener("pointercancel", end); }
pad($("stick"), $("stickKnob"), walk); pad($("twist"), $("twistKnob"), tw);
{ let last = null; canvas.addEventListener("pointerdown", (e) => { canvas.setPointerCapture(e.pointerId); last = [e.clientX, e.clientY]; }); canvas.addEventListener("pointermove", (e) => { if (!last) return; lookX += (e.clientX - last[0]) * 0.005; lookY -= (e.clientY - last[1]) * 0.005; last = [e.clientX, e.clientY]; }); const up = () => (last = null); canvas.addEventListener("pointerup", up); canvas.addEventListener("pointercancel", up); }
addEventListener("keydown", (e) => { keys.add(e.key.toLowerCase()); if (e.key === "f" || e.key === "F") toggle(); if (e.key === "r" || e.key === "R") square(W); }); addEventListener("keyup", (e) => keys.delete(e.key.toLowerCase()));
function toggle() { want = want > 50 ? 0 : 100; $("doorB").textContent = want ? "shut the door" : "open the door"; }
$("doorB").addEventListener("click", toggle); $("squareB").addEventListener("click", () => square(W)); $("helpB").addEventListener("click", () => ($("panel").hidden = !$("panel").hidden)); $("panel").addEventListener("click", (e) => { if (e.target.tagName !== "A") $("panel").hidden = true; });

let prev = performance.now();
function tick(now) { const raw = now - prev, dt = Math.min(0.05, raw / 1000); prev = now;
  if (open !== want) { open += Math.max(-140 * dt, Math.min(140 * dt, want - open)); shape = compile(TREE, { open }); }
  const k = (a) => (keys.has(a) ? 1 : 0), inp = { move: [walk.y + k("w") - k("s"), walk.x + k("d") - k("a"), k("c") - k("z")], look: [lookX + (k("arrowright") - k("arrowleft")) * 1.6 * dt, lookY + (k("arrowup") - k("arrowdown")) * 1.2 * dt], into: [(tw.x + k("e") - k("q")) * 1.3 * dt, tw.y * 1.3 * dt], jump: keys.has(" ") };
  lookX = lookY = 0; step(W, shape.sdf, inp, dt); draw(); map(); caption();
  slow = raw > 45 ? slow + 1 : Math.max(0, slow - 1); if (slow > 12 && scale > 0.4) { scale *= 0.8; slow = 0; }
  requestAnimationFrame(tick); }
requestAnimationFrame(tick);

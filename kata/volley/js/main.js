/* VOLLEY — the page. The rules are ./game.js (no DOM), stepped here (they're cheap). The view is one ray-marched
   picture: the ground and your bicycle are your own 3D slice (the bicycle is cut at its own w, as Lean draws it); the
   many, their bunkers and (on the overlay) every arrow are drawn where they would be with w flattened away, so you can
   see what you are shooting at from outside their world. Two panels below say what the flattening hides: their world
   from above, as they see it (you are in it only at a gate; your arrows appear in it only as they land), and the
   course from the side, x across and w up, where their whole world is one line. */
import { makeGame, step, shoot, preview, bot, bikeParts, COURSE, SEE, HP, WALL_W } from "./game.js";
const $ = (id) => document.getElementById(id), glc = $("gl"), ov = $("ov");
const add = (a, b, k = 1) => a.map((v, i) => v + k * b[i]), dot = (a, b) => a.reduce((s, v, i) => s + v * b[i], 0), unit = (v) => { const m = Math.hypot(...v) || 1; return v.map((x) => x / m); };
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

/* ------------------------------------------------------------------ GL */
const gl = glc.getContext("webgl2", { antialias: false });
if (!gl) { document.body.innerHTML = `<p style="padding:20px;font-family:monospace">VOLLEY needs WebGL2.</p>`; throw new Error("no WebGL2"); }
const VS = `#version 300 es
in vec2 aPos; void main() { gl_Position = vec4(aPos, 0.0, 1.0); }`;
const FS = `#version 300 es
precision highp float;
uniform vec2 uRes; uniform float uTan, uWb, uFlash, uTime; uniform vec3 uEye, uCR, uCU, uCF, uCourse;
uniform int uNCap, uNEn, uNBk; uniform vec4 uCapA[24], uCapB[24], uTor[6], uBC, uEn[16], uBk[6]; uniform vec2 uCapR[24], uTorR[2];
out vec4 o;
float sdCap(vec3 p, vec3 a, vec3 b, float r) { vec3 ab = b - a, ap = p - a; float h = clamp(dot(ap, ab) / dot(ab, ab), 0.0, 1.0); return length(ap - ab * h) - r; }
// the bicycle, cut by your slice (the point's w is the bicycle's own): Lean's shapes, two tyres and capsules, in 4D
vec2 sdBike(vec3 q) {
  vec4 p = vec4(q, uWb); float d = 1e3, m = 0.0;
  if (length(p - uBC) > 1.9) return vec2(length(p - uBC) - 1.7, 0.0);
  for (int i = 0; i < 2; i++) { vec4 c = uTor[3 * i], e1 = uTor[3 * i + 1], e2 = uTor[3 * i + 2], ov = p - c; float x = dot(ov, e1), y = dot(ov, e2); vec4 rest = ov - e1 * x - e2 * y;
    float e = length(vec2(length(vec2(x, y)) - uTorR[i].x, length(rest))) - uTorR[i].y; if (e < d) { d = e; m = 0.5; } }
  for (int i = 0; i < 24; i++) { if (i >= uNCap) break; vec4 ab = uCapB[i] - uCapA[i], ap = p - uCapA[i]; float L2 = dot(ab, ab), h = L2 > 0.0 ? clamp(dot(ap, ab) / L2, 0.0, 1.0) : 0.0;
    float e = length(ap - ab * h) - uCapR[i].x; if (e < d) { d = e; m = uCapR[i].y; } }
  return vec2(d, m);
}
// the many (drawn where they'd be with w flattened): a body and a head; fallen, a body lying down
vec2 sdMany(vec3 q) {
  float d = 1e3, m = 0.0;
  for (int i = 0; i < 16; i++) { if (i >= uNEn) break; vec4 e = uEn[i]; vec3 b = vec3(e.x, 0.0, e.y); float e2;
    if (e.z < 0.5) e2 = sdCap(q, b + vec3(-0.45, 0.2, 0.0), b + vec3(0.45, 0.2, 0.0), 0.2);
    else e2 = min(sdCap(q, b + vec3(0.0, 0.38, 0.0), b + vec3(0.0, 1.25, 0.0), 0.3), length(q - b - vec3(0.0, 1.66, 0.0)) - 0.21);
    if (e2 < d) { d = e2; m = 10.0 + e.z; } }
  return vec2(d, m);
}
vec2 map(vec3 q) { vec2 a = sdBike(q), b = sdMany(q); return a.x < b.x ? a : b; }
vec3 nrm(vec3 q) { const float h = 0.004; return normalize(vec3(map(q + vec3(h, 0, 0)).x - map(q - vec3(h, 0, 0)).x, map(q + vec3(0, h, 0)).x - map(q - vec3(0, h, 0)).x, map(q + vec3(0, 0, h)).x - map(q - vec3(0, 0, h)).x)); }
// the ground: the track (an ellipse in x–z; its colour is its w: teal ana, rose kata, and the red gates where it is in
// their world), a 5 m grid
vec3 groundCol(vec3 q) {
  float A = uCourse.x, B = uCourse.y, C = uCourse.z, f = length(vec2(q.x / A, q.z / B)), gl2 = length(vec2(q.x / (A * A), q.z / (B * B))) / max(f, 1e-4), dist = (f - 1.0) / max(gl2, 1e-5), wT = C * (q.z / B) / max(f, 1e-4);
  vec2 g = abs(fract(q.xz / 5.0 + 0.5) - 0.5) * 5.0; float ln = min(g.x, g.y);
  vec3 base = f < 1.0 ? vec3(0.13, 0.17, 0.15) : vec3(0.10, 0.13, 0.14); base = mix(base * 1.5, base, smoothstep(0.0, 0.06, ln));
  float on = 1.0 - smoothstep(2.0, 2.2, abs(dist));
  vec3 tint = wT > 0.0 ? vec3(0.22, 0.75, 0.7) : vec3(0.85, 0.35, 0.6); vec3 tr = mix(vec3(0.55), tint, clamp(abs(wT) / C, 0.0, 1.0) * 0.75) * 0.55;
  float gate = 1.0 - smoothstep(${SEE.toFixed(2)}, ${(SEE + 0.25).toFixed(2)}, abs(wT)); tr = mix(tr, vec3(0.95, 0.3, 0.2) * (0.6 + 0.4 * step(0.5, fract((q.x + q.z) * 0.8))), gate * 0.8);
  tr = mix(tr, vec3(0.9), (1.0 - smoothstep(0.04, 0.09, abs(dist))) * step(0.5, fract(atan(q.z / B, q.x / A) * 40.0)) * 0.7);
  vec3 c = mix(base, tr, on);
  // contact shadows under the many
  for (int i = 0; i < 16; i++) { if (i >= uNEn) break; c *= 0.6 + 0.4 * smoothstep(0.2, 0.8, length(q.xz - uEn[i].xy)); }
  c *= 0.6 + 0.4 * smoothstep(0.3, 1.4, length(q.xz - uBC.xz));
  return c;
}
void main() {
  vec2 px = (2.0 * gl_FragCoord.xy - uRes) / uRes.y;
  vec3 d = normalize(uCF + px.x * uTan * uCR + px.y * uTan * uCU), L = normalize(vec3(0.4, 0.8, -0.35));
  vec3 c = mix(vec3(0.05, 0.09, 0.12), vec3(0.14, 0.2, 0.26), pow(max(d.y, 0.0), 0.5));
  float tF = d.y < -1e-4 ? -uEye.y / d.y : 1e4, t = 0.2, tHit = 1e4; vec2 hm = vec2(0.0);
  for (int i = 0; i < 96; i++) { vec2 s = map(uEye + d * t); if (s.x < 0.002) { tHit = t; hm = s; break; } t += max(s.x * 0.9, 0.01); if (t > min(tF, 260.0)) break; }
  float tS = min(tF, tHit);
  if (tHit < tF) { vec3 q = uEye + d * tHit, n = nrm(q); float m = hm.y; vec3 base;
    float kata = clamp(abs(uWb) / uCourse.z, 0.0, 1.0); vec3 ghost = uWb > 0.0 ? vec3(0.95, 0.4, 0.65) : vec3(0.3, 0.85, 0.8);
    if (m < 0.75) base = vec3(0.07); else if (m < 1.5) base = vec3(0.35, 0.85, 0.95); else if (m < 2.5) base = vec3(0.8); else if (m < 3.5) base = vec3(0.95, 0.8, 0.35); else if (m < 4.5) base = vec3(0.15); else if (m < 5.5) base = vec3(0.9, 0.75, 0.62); else if (m < 9.0) base = vec3(0.25, 0.3, 0.45);
    else if (m < 10.5) base = vec3(0.3); else if (m < 11.5) base = mix(vec3(0.85, 0.25, 0.2), ghost, kata * 0.45); else base = mix(vec3(0.6, 0.35, 0.85), ghost, kata * 0.45);
    c = base * (0.32 + 0.7 * max(dot(n, L), 0.0)) + vec3(0.25) * pow(1.0 - abs(dot(n, d)), 3.0) * (m > 9.5 ? 1.0 : 0.3); }
  else if (tF < 1e3) { c = mix(groundCol(uEye + d * tF), c, smoothstep(90.0, 240.0, tF)); }
  // the bunkers: closed boxes of their world. Glass from out here (your arrows don't pass the walls, they arrive
  // inside); solid when you are in their slice
  float solid = 1.0 - smoothstep(${SEE.toFixed(2)}, 1.6, abs(uWb));
  for (int i = 0; i < 6; i++) { if (i >= uNBk) break; vec4 b = uBk[i]; vec3 lo = vec3(b.x - b.z, 0.0, b.y - b.z), hi = vec3(b.x + b.z, b.w, b.y + b.z), inv = 1.0 / d, t0 = (lo - uEye) * inv, t1 = (hi - uEye) * inv, mn = min(t0, t1), mx = max(t0, t1);
    float tN = max(max(mn.x, mn.y), mn.z), tX = min(min(mx.x, mx.y), mx.z); if (tN > tX || tX < 0.0 || tN > tS) continue;
    vec3 p = uEye + d * max(tN, 0.0), l = abs((p - 0.5 * (lo + hi)) / (0.5 * (hi - lo))); float e = (l.x > 0.93 ? 1.0 : 0.0) + (l.y > 0.93 ? 1.0 : 0.0) + (l.z > 0.93 ? 1.0 : 0.0);
    vec3 wall = vec3(0.45, 0.5, 0.6) * (0.55 + 0.45 * max(dot(-sign(d) * step(mn.yzx, mn.xyz) * step(mn.zxy, mn.xyz), L), 0.0));
    c = mix(c, wall, mix(0.2, 0.94, solid)); c = mix(c, vec3(0.8, 0.86, 0.95), step(1.5, e) * 0.8); }
  c = mix(c, vec3(0.9, 0.15, 0.1), uFlash * (0.25 + 0.5 * dot(px, px) * 0.3));
  o = vec4(pow(c, vec3(0.9)), 1.0);
}`;
const sh = (t, s) => { const x = gl.createShader(t); gl.shaderSource(x, s); gl.compileShader(x); if (!gl.getShaderParameter(x, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(x)); return x; };
const prog = gl.createProgram(); gl.attachShader(prog, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FS)); gl.linkProgram(prog);
if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
gl.useProgram(prog);
const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
{ const a = gl.getAttribLocation(prog, "aPos"); gl.enableVertexAttribArray(a); gl.vertexAttribPointer(a, 2, gl.FLOAT, false, 0, 0); }
const U = {}; for (const n of ["uRes", "uTan", "uWb", "uFlash", "uTime", "uEye", "uCR", "uCU", "uCF", "uCourse", "uNCap", "uNEn", "uNBk", "uCapA", "uCapB", "uTor", "uBC", "uEn", "uBk", "uCapR", "uTorR"]) U[n] = gl.getUniformLocation(prog, n);

/* ------------------------------------------------------------------ state */
const sel = { wave: 1, seed: 1, paused: false, demo: false };
let g = makeGame(sel.seed, sel.wave), flash = 0, marks = [], marksAt = -1, shown = null;
const view = { az: 1.7, el: 0.5, dist: 28 }, TAN = 0.5; let yaw = null, cam = null;
function camera() {
  // behind the bicycle and off to its outer side, looking across it into the field; your drag turns it about the bike
  const T = g.st.T, want = Math.atan2(T[2], T[0]); yaw = yaw === null ? want : yaw + Math.atan2(Math.sin(want - yaw), Math.cos(want - yaw)) * 0.05;
  const a = yaw + Math.PI + view.az, tgt = [g.st.p[0], 1.1, g.st.p[2]], eye = [tgt[0] + view.dist * Math.cos(view.el) * Math.cos(a), tgt[1] + view.dist * Math.sin(view.el), tgt[2] + view.dist * Math.cos(view.el) * Math.sin(a)];
  const F = unit(add(tgt, eye, -1)), R = unit(cross(F, [0, 1, 0])), Up = cross(R, F);
  return (cam = { eye, F, R, U: Up });
}
const toScreen = (p, w, h) => { const r = [p[0] - cam.eye[0], p[1] - cam.eye[1], p[2] - cam.eye[2]], z = dot(r, cam.F); return z > 0.1 ? [w / 2 + (dot(r, cam.R) / (z * TAN)) * (h / 2), h / 2 - (dot(r, cam.U) / (z * TAN)) * (h / 2), z] : null; };

/* ------------------------------------------------------------------ the buttons, the banner */
function restart(wave = sel.wave) { sel.wave = wave; g = makeGame(sel.seed, wave); shown = null; yaw = null; $("banner").hidden = true; $("waveB").textContent = `wave ${wave}`; caption(); history.replaceState(null, "", `?wave=${wave}`); }
function caption() { $("cap").innerHTML = `<b>One against the many.</b> They live in one slice of the world (w = 0) and can't see or shoot out of it; your track leaves it. <b>Tap one of them to loose an arrow</b>: it crosses w and arrives, walls or no walls. At the red gates you ride through their world, and they shoot back.`; }
$("cap").onclick = () => $("cap").classList.toggle("min");
$("restartB").onclick = $("bRetry").onclick = () => restart();
$("bNext").onclick = () => restart(sel.wave + 1);
$("waveB").onclick = () => restart(sel.wave >= 5 ? 1 : sel.wave + 1);
$("demoB").onclick = () => { sel.demo = !sel.demo; $("demoB").classList.toggle("on", sel.demo); };
$("pauseB").onclick = () => { sel.paused = !sel.paused; $("pauseB").classList.toggle("on", sel.paused); };
$("gearB").onclick = () => { $("panel").hidden = !$("panel").hidden; };
function verdict() {
  if (g.state === "playing" || shown === g) return; shown = g; const won = g.state === "won";
  $("banner").hidden = false; $("bTitle").textContent = won ? "FIELD CLEARED" : "UNSEATED";
  $("bText").textContent = won ? `All ${g.total} in ${g.t.toFixed(0)} s, ${g.loosed} arrows loosed, ${g.hits} hit${g.hits === 1 ? "" : "s"} taken. ${g.bunkers.length} of them were in closed bunkers.` : `They caught you in their world ${HP} times. They can only do that at the gates: thin them out from outside before you cross.`;
  $("bNext").hidden = !won;
}

/* ------------------------------------------------------------------ input: tap to loose, drag to look, pinch to zoom */
const ptrs = new Map(); let pinch0 = 0;
glc.addEventListener("pointerdown", (e) => { try { glc.setPointerCapture(e.pointerId); } catch (err) { /* fine */ } ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY, x0: e.clientX, y0: e.clientY, t0: performance.now(), moved: false }); if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; pinch0 = Math.hypot(a.x - b.x, a.y - b.y); } });
glc.addEventListener("pointermove", (e) => { const p = ptrs.get(e.pointerId); if (!p) return;
  if (ptrs.size >= 2) { p.x = e.clientX; p.y = e.clientY; p.moved = true; const [a, b] = [...ptrs.values()], d = Math.hypot(a.x - b.x, a.y - b.y); if (pinch0 > 10) view.dist = Math.max(6, Math.min(70, view.dist * (pinch0 / d))); pinch0 = d; return; }
  if (Math.hypot(e.clientX - p.x0, e.clientY - p.y0) > 8) p.moved = true;
  if (p.moved) { view.az += (e.clientX - p.x) * 0.006; view.el = Math.max(0.08, Math.min(1.4, view.el + (e.clientY - p.y) * 0.006)); } p.x = e.clientX; p.y = e.clientY; });
glc.addEventListener("pointerup", (e) => { const p = ptrs.get(e.pointerId); ptrs.delete(e.pointerId); if (p && !p.moved && performance.now() - p.t0 < 400) tap(e.clientX, e.clientY); });
glc.addEventListener("pointercancel", (e) => ptrs.delete(e.pointerId));
glc.addEventListener("wheel", (e) => { view.dist = Math.max(6, Math.min(70, view.dist * Math.exp(e.deltaY * 0.001))); e.preventDefault(); }, { passive: false });
for (const ev of ["contextmenu", "selectstart"]) document.addEventListener(ev, (e) => e.preventDefault());
/* a tap: the nearest of the many to it on the screen (within a thumb's width), or else the point of the ground under it */
function tap(cx, cy) {
  if (!cam || g.state !== "playing") return; const r = glc.getBoundingClientRect(), x = cx - r.left, y = cy - r.top, w = r.width, h = r.height;
  let best = -1, bd = 46;
  g.enemies.forEach((e, i) => { if (!e.alive) return; const s = toScreen([e.x, 1.0, e.z], w, h); if (!s) return; const d = Math.hypot(s[0] - x, s[1] - y); if (d < bd) { bd = d; best = i; } });
  let ok;
  if (best >= 0) ok = shoot(g, best);
  else { const qx = (2 * x - w) / h, qy = (h - 2 * y) / h, d = unit(add(add(cam.F, cam.R, qx * TAN), cam.U, qy * TAN)); if (d[1] > -1e-3) return; const t = -cam.eye[1] / d[1]; ok = shoot(g, [cam.eye[0] + d[0] * t, 0.1, cam.eye[2] + d[2] * t, 0]); }
  if (!ok && g.cool <= 0) note = { t: performance.now(), x, y, text: "out of range" };
}
let note = null;

/* ------------------------------------------------------------------ the loop */
let last = performance.now(), acc = 0, res = 0;
function draw(now) {
  requestAnimationFrame(draw);
  const dt = Math.min(0.1, (now - last) / 1000); last = now;
  if (!sel.paused) { acc = Math.min(acc + dt, 0.1); while (acc >= 1 / 60) { const hp = g.hp; if (sel.demo) bot(g); step(g, 1 / 60); if (g.hp < hp) flash = 1; acc -= 1 / 60; } }
  flash = Math.max(0, flash - dt * 2.5);
  const dpr = Math.min(1.5, devicePixelRatio || 1); if (!res) res = dpr * (matchMedia("(pointer: coarse)").matches ? 0.7 : 0.9);
  const cw = Math.round(glc.clientWidth * res), ch = Math.round(glc.clientHeight * res); if (glc.width !== cw || glc.height !== ch) { glc.width = cw; glc.height = ch; }
  gl.viewport(0, 0, cw, ch); camera();
  gl.uniform2f(U.uRes, cw, ch); gl.uniform1f(U.uTan, TAN); gl.uniform1f(U.uWb, g.w); gl.uniform1f(U.uFlash, flash); gl.uniform1f(U.uTime, now / 1000);
  gl.uniform3fv(U.uEye, cam.eye); gl.uniform3fv(U.uCR, cam.R); gl.uniform3fv(U.uCU, cam.U); gl.uniform3fv(U.uCF, cam.F); gl.uniform3f(U.uCourse, COURSE.A, COURSE.B, COURSE.C);
  { const P = bikeParts(g), n = Math.min(24, P.caps.length), A = new Float32Array(96), Bv = new Float32Array(96), R = new Float32Array(48), tor = new Float32Array(24), tr = new Float32Array(4);
    for (let i = 0; i < n; i++) { A.set(P.caps[i].a, 4 * i); Bv.set(P.caps[i].b, 4 * i); R[2 * i] = P.caps[i].r; R[2 * i + 1] = P.caps[i].m; }
    P.tori.forEach((t, i) => { tor.set(t.c, 12 * i); tor.set(t.e1, 12 * i + 4); tor.set(t.e2, 12 * i + 8); tr[2 * i] = t.R; tr[2 * i + 1] = t.r; });
    gl.uniform1i(U.uNCap, n); gl.uniform4fv(U.uCapA, A); gl.uniform4fv(U.uCapB, Bv); gl.uniform2fv(U.uCapR, R); gl.uniform4fv(U.uTor, tor); gl.uniform2fv(U.uTorR, tr);
    gl.uniform4fv(U.uBC, add(add(g.st.p, g.st.T, 0.5), g.st.u, 0.8)); }
  { const E = new Float32Array(64), en = g.enemies.slice(0, 16); en.forEach((e, i) => E.set([e.x, e.z, e.alive ? (e.kind === "open" ? 1 : 2) : 0, 0], 4 * i)); gl.uniform4fv(U.uEn, E); gl.uniform1i(U.uNEn, en.length);
    const Bk = new Float32Array(24); g.bunkers.forEach((b, i) => Bk.set([b.x, b.z, b.h, b.H], 4 * i)); gl.uniform4fv(U.uBk, Bk); gl.uniform1i(U.uNBk, g.bunkers.length); }
  gl.drawArrays(gl.TRIANGLES, 0, 3);
  overlay(now); panes(); hud(); verdict();
}

/* ------------------------------------------------------------------ the overlay: arrows, the rings over the many */
function overlay(now) {
  const c = ov.getContext("2d"), dpr = Math.min(2, devicePixelRatio || 1), w = ov.clientWidth, h = ov.clientHeight;
  if (ov.width !== Math.round(w * dpr) || ov.height !== Math.round(h * dpr)) { ov.width = Math.round(w * dpr); ov.height = Math.round(h * dpr); }
  c.setTransform(dpr, 0, 0, dpr, 0, 0); c.clearRect(0, 0, w, h); c.font = "11px ui-monospace, Menlo, monospace";
  // would a shot from here land? (worked out five times a second)
  if (g.t - marksAt > 0.2 || g.t < marksAt) { marksAt = g.t; marks = g.enemies.map((e, i) => (e.alive ? preview(g, i) : null)); }
  g.enemies.forEach((e, i) => { if (!e.alive || !marks[i]) return; const s = toScreen([e.x, 2.25, e.z], w, h); if (!s) return;
    c.strokeStyle = marks[i] === "ok" ? "rgba(120,235,130,0.95)" : marks[i] === "wall" ? "rgba(255,190,90,0.9)" : "rgba(160,160,160,0.5)"; c.lineWidth = 2; c.beginPath(); c.arc(s[0], s[1], Math.max(4, 150 / s[2]), 0, 7); c.stroke(); });
  // the arrows, flattened like the many: yours gold, theirs red; a streak a metre long
  for (const a of g.arrows) { const v = Math.hypot(...a.v) || 1, tail = a.p.map((x, k) => x - (a.v[k] / v) * 1.1), s0 = toScreen(a.p, w, h), s1 = toScreen(tail, w, h); if (!s0 || !s1) continue;
    c.strokeStyle = a.mine ? `rgba(255,215,110,${a.stuck ? 0.5 : 1})` : `rgba(255,90,70,${a.stuck ? 0.5 : 1})`; c.lineWidth = Math.max(1.2, 26 / s0[2]); c.beginPath(); c.moveTo(s1[0], s1[1]); c.lineTo(s0[0], s0[1]); c.stroke(); }
  for (const ev of g.events) { const s = toScreen(ev.p, w, h); if (!s) continue; const k = (g.t - ev.t) / 1.5;
    c.strokeStyle = ev.kind === "kill" ? `rgba(255,230,140,${1 - k})` : ev.kind === "hurt" ? `rgba(255,80,60,${1 - k})` : `rgba(200,210,230,${1 - k})`; c.lineWidth = 2; c.beginPath(); c.arc(s[0], s[1], 6 + 40 * k * (ev.kind === "wall" ? 0.4 : 1), 0, 7); c.stroke();
    if (ev.kind === "kill" && ev.bunker && k < 0.8) { c.fillStyle = `rgba(255,230,140,${1 - k})`; c.fillText("through the wall? no: past it", s[0] + 10, s[1] - 12 - 20 * k); }
    if (ev.kind === "wall" && ev.mine && k < 0.8) { c.fillStyle = `rgba(200,210,230,${1 - k})`; c.fillText("caught the wall", s[0] + 8, s[1] - 8 - 16 * k); } }
  if (note && now - note.t < 900) { c.fillStyle = "rgba(233,228,218,0.9)"; c.fillText(note.text, note.x + 10, note.y - 10); }
  // the bow
  c.fillStyle = "rgba(233,228,218,0.25)"; c.fillRect(12, h - 18, 90, 6); c.fillStyle = g.cool > 0 ? "rgba(255,190,90,0.9)" : "rgba(120,235,130,0.95)"; c.fillRect(12, h - 18, 90 * (1 - g.cool / 0.5), 6);
}
function hud() {
  $("hp").textContent = "♥".repeat(Math.max(0, g.hp)) + "♡".repeat(Math.max(0, HP - g.hp));
  $("left").textContent = `${g.total - g.kills} of ${g.total} left · ${g.loosed} loosed · ${g.t.toFixed(0)} s`;
  const inn = Math.abs(g.w) < SEE; $("where").classList.toggle("in", inn);
  $("where").textContent = inn ? "IN THEIR WORLD: they see you" : `${Math.abs(g.w).toFixed(1)} m ${g.w > 0 ? "ana" : "kata"} of their world: unseen`;
}

/* ------------------------------------------------------------------ the two panels */
function fit(cv) { const dpr = Math.min(2, devicePixelRatio || 1), w = cv.clientWidth, h = cv.clientHeight; if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); } const c = cv.getContext("2d"); c.setTransform(dpr, 0, 0, dpr, 0, 0); c.clearRect(0, 0, w, h); c.font = "10px ui-monospace, Menlo, monospace"; return { c, w, h }; }
function panes() {
  const { A, B, C } = COURSE, inn = Math.abs(g.w) < SEE;
  { // their world, from above (x across, z down): only what is in w = 0
    const { c, w, h } = fit($("p1")), s = Math.min((w - 20) / (2 * A + 8), (h - 44) / (2 * B + 8)), X = (x) => w / 2 + x * s, Z = (z) => h / 2 + 6 - z * s;
    c.strokeStyle = "rgba(233,228,218,0.12)"; c.setLineDash([3, 5]); c.beginPath(); c.ellipse(w / 2, h / 2 + 6, A * s, B * s, 0, 0, 7); c.stroke(); c.setLineDash([]);
    // the track where it is in their world: the two gates
    c.strokeStyle = "rgba(255,110,80,0.9)"; c.lineWidth = 3; const tg = Math.asin(SEE / C); for (const t0 of [0, Math.PI]) { c.beginPath(); for (let k = -8; k <= 8; k++) { const t = t0 + (k / 8) * tg, x = X(A * Math.cos(t)), z = Z(B * Math.sin(t)); if (k === -8) c.moveTo(x, z); else c.lineTo(x, z); } c.stroke(); } c.lineWidth = 1;
    for (const b of g.bunkers) { c.strokeStyle = "rgba(150,170,205,0.9)"; c.strokeRect(X(b.x - b.h), Z(b.z + b.h), 2 * b.h * s, 2 * b.h * s); }
    for (const e of g.enemies) { c.fillStyle = !e.alive ? "rgba(120,120,120,0.6)" : e.kind === "open" ? "rgb(235,90,70)" : "rgb(170,110,230)"; c.beginPath(); c.arc(X(e.x), Z(e.z), e.alive ? 3 : 2, 0, 7); c.fill(); }
    for (const a of g.arrows) { if (Math.abs(a.p[3]) > WALL_W + 0.2) continue; c.fillStyle = a.mine ? "rgb(255,215,110)" : "rgb(255,90,70)"; c.fillRect(X(a.p[0]) - 1.5, Z(a.p[2]) - 1.5, 3, 3); }
    for (const ev of g.events) if (ev.kind === "kill") { const k = (g.t - ev.t) / 1.5; c.strokeStyle = `rgba(255,230,140,${1 - k})`; c.beginPath(); c.arc(X(ev.p[0]), Z(ev.p[2]), 3 + 12 * k, 0, 7); c.stroke(); }
    if (inn) { c.fillStyle = "rgb(90,220,245)"; c.beginPath(); c.arc(X(g.st.p[0]), Z(g.st.p[2]), 4, 0, 7); c.fill(); }
    $("p1S").textContent = inn ? "you are in it (cyan): they see you, and shoot" : "you are not in it. To them your arrows come from nowhere";
  }
  { // from the side: x across, w up. Their whole world is the line w = 0
    const { c, w, h } = fit($("p2")), s = Math.min((w - 30) / (2 * A + 8), (h - 50) / (2 * C + 6)), X = (x) => w / 2 + x * s, W = (v) => h / 2 + 4 - v * s * 1.0;
    c.strokeStyle = "rgba(233,228,218,0.25)"; c.beginPath(); c.ellipse(w / 2, h / 2 + 4, A * s, C * s, 0, 0, 7); c.stroke();
    c.strokeStyle = "rgba(255,110,80,0.8)"; c.beginPath(); c.moveTo(X(-A - 3), W(0)); c.lineTo(X(A + 3), W(0)); c.stroke();
    c.fillStyle = "rgba(56,242,224,0.9)"; c.fillText("ana (+w)", 8, W(C) + 4); c.fillStyle = "rgba(255,102,184,0.9)"; c.fillText("kata (−w)", 8, W(-C) + 4); c.fillStyle = "rgba(255,110,80,0.9)"; c.fillText("their world", X(A + 3) - 62, W(0) - 4);
    for (const e of g.enemies) { c.fillStyle = !e.alive ? "rgba(120,120,120,0.6)" : e.kind === "open" ? "rgb(235,90,70)" : "rgb(170,110,230)"; c.fillRect(X(e.x) - 1.5, W(0) - 4, 3, 8); }
    for (const a of g.arrows) { if (!a.mine || a.stuck) continue; const v = Math.hypot(a.v[0], a.v[3]) || 1; c.strokeStyle = "rgb(255,215,110)"; c.lineWidth = 1.5; c.beginPath(); c.moveTo(X(a.p[0] - (a.v[0] / v) * 3), W(a.p[3] - (a.v[3] / v) * 3)); c.lineTo(X(a.p[0]), W(a.p[3])); c.stroke(); c.lineWidth = 1; }
    c.fillStyle = "rgb(90,220,245)"; c.beginPath(); c.arc(X(g.st.p[0]), W(g.w), 4, 0, 7); c.fill();
    $("p2S").textContent = "the track loops out of their world; your arrows come down onto the line";
  }
}

/* ------------------------------------------------------------------ start */
{ const Q = new URLSearchParams(location.search); sel.wave = Math.max(1, Math.min(5, +(Q.get("wave") || 1))); sel.demo = Q.get("demo") === "1"; $("demoB").classList.toggle("on", sel.demo); restart(sel.wave); }
if (matchMedia("(orientation: portrait)").matches) $("cap").classList.add("min");
requestAnimationFrame(draw);
window.VOLLEY = { sel, view, game: () => g, restart };

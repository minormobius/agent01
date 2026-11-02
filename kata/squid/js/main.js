/* SQUID — the page. The animal is ./squid.js (no DOM); the view is your 3D slice of the sea, spanned by the heading
   (F) and two of the directions across it (R right, U up), N (ana) the way it can't see, looking along the heading from
   just behind. Jellies are glowing 4D balls: your slice cuts each in a ball that shrinks as it moves out of the slice,
   and a jelly just out of view shows as a halo, teal ana and rose kata. The light is a 4D direction too: the sea is
   brighter toward it. Plankton (dots) for a sense of motion. */
import { Squid, sea, course, ARENA, PHYS, rng } from "./squid.js";
const $ = (id) => document.getElementById(id), glc = $("gl"), ov = $("ov");
const add = (a, b, k = 1) => a.map((v, i) => v + k * b[i]), dot = (a, b) => a.reduce((s, v, i) => s + v * b[i], 0), sc = (a, k) => a.map((x) => x * k), unit = (v) => { const m = Math.hypot(...v); return v.map((x) => x / m); };

/* ------------------------------------------------------------------ GL */
const gl = glc.getContext("webgl2", { antialias: false });
if (!gl) { document.body.innerHTML = `<p style="padding:20px;font-family:monospace">SQUID needs WebGL2.</p>`; throw new Error("no WebGL2"); }
const VS = `#version 300 es
in vec2 aPos; void main() { gl_Position = vec4(aPos, 0.0, 1.0); }`;
const FS = `#version 300 es
precision highp float;
uniform vec2 uRes; uniform float uTan, uTime; uniform vec4 uEye, uF, uR, uU, uN, uSun;
uniform int uNObj, uTarget; uniform highp sampler2D uObjT; // the jellies: row 0 their centres, row 1 colour and radius
uniform int uNCap; uniform vec4 uCapA[16], uCapB[16], uCapR[16], uSqC; uniform float uSqR;
out vec4 o;
vec3 water(vec4 d) { // the open sea: dark, brighter toward the light (a 4D direction), a little brighter round it
  float s = dot(d, uSun); return vec3(0.008, 0.035, 0.07) + vec3(0.05, 0.16, 0.22) * (0.5 + 0.5 * s) + vec3(0.35, 0.6, 0.7) * pow(max(s, 0.0), 12.0);
}
float sdSquid(vec4 q, out int m) {
  float d = 1e9; m = 0;
  for (int i = 0; i < 16; i++) { if (i >= uNCap) break; vec4 a = uCapA[i], ab = uCapB[i] - a, ao = q - a; float h = clamp(dot(ao, ab) / max(dot(ab, ab), 1e-9), 0.0, 1.0), e = length(ao - ab * h) - uCapR[i].x; if (e < d) { d = e; m = int(uCapR[i].y + 0.5); } }
  return d;
}
void main() {
  vec2 q = (2.0 * gl_FragCoord.xy - uRes) / uRes.y;
  vec4 d = normalize(uF + q.x * uTan * uR + q.y * uTan * uU);
  vec3 bg = water(d), c = bg; float tc = 1e9; vec3 glow = vec3(0.0);
  // the jellies
  for (int i = 0; i < 256; i++) {
    if (i >= uNObj) break;
    vec4 C = texelFetch(uObjT, ivec2(i, 0), 0), K = texelFetch(uObjT, ivec2(i, 1), 0); float R = K.w, del = dot(C - uEye, uN); vec4 Cs = C - del * uN; vec3 col = K.rgb;
    bool tgt = i == uTarget; float pulse = tgt ? 0.75 + 0.25 * sin(uTime * 4.0) : 1.0;
    if (abs(del) < R) {
      float rho = sqrt(R * R - del * del); vec4 oc = uEye - Cs; float b = dot(oc, d), cc = dot(oc, oc) - rho * rho, hh = b * b - cc;
      if (hh > 0.0) { float t = -b - sqrt(hh); if (t > 0.0 && t < tc) {
        vec4 p = uEye + d * t, n = normalize(p - C); float lam = max(dot(n, uSun), 0.0), rim = pow(1.0 - abs(dot(n, d)), 2.0);
        vec3 s = col * (0.75 + 0.45 * lam) + col * rim * 1.6 + (tgt ? vec3(1.0) * rim * pulse : vec3(0.0)); // they glow: lit, and their own light brightest at the rim
        // banded, so a jelly's slice shows its depth: rings by how far into the ball you've cut
        s *= 0.8 + 0.2 * sin(18.0 * length(p - C) / R);
        c = mix(s * pulse, bg, 1.0 - exp(-t / 170.0)); tc = t; } }
    } else if (abs(del) < R + 30.0) { // just out of your slice: a halo where it would be, teal ana, rose kata
      float s = dot(Cs - uEye, d); if (s > 0.0) { float dist = length(uEye + d * s - Cs), k = 1.0 - (abs(del) - R) / 30.0;
        vec3 tint = mix(col, del > 0.0 ? vec3(0.22, 0.95, 0.88) : vec3(1.0, 0.4, 0.72), 0.55);
        glow += tint * exp(-pow(dist / (R * 1.15), 2.0)) * k * k * 0.55 * exp(-s / 170.0) * (tgt ? 1.6 * pulse : 1.0); }
    }
  }
  // the squid
  { vec4 oc = uEye - uSqC; float b = dot(oc, d), cc = dot(oc, oc) - uSqR * uSqR, hh = b * b - cc;
    if (hh > 0.0) { float t = max(-b - sqrt(hh), 0.0), t1 = -b + sqrt(hh); int m;
      for (int i = 0; i < 80; i++) { if (t > t1 || t > tc) break; float e = sdSquid(uEye + d * t, m); if (e < 0.002) {
          vec4 p = uEye + d * t; const float h = 0.003; int mm;
          vec4 n = normalize(vec4(sdSquid(p + vec4(h, 0, 0, 0), mm) - sdSquid(p - vec4(h, 0, 0, 0), mm), sdSquid(p + vec4(0, h, 0, 0), mm) - sdSquid(p - vec4(0, h, 0, 0), mm), sdSquid(p + vec4(0, 0, h, 0), mm) - sdSquid(p - vec4(0, 0, h, 0), mm), sdSquid(p + vec4(0, 0, 0, h), mm) - sdSquid(p - vec4(0, 0, 0, h), mm)));
          vec3 base = m == 1 ? vec3(1.0, 0.55, 0.42) : m == 2 ? vec3(0.75, 0.45, 1.0) : m == 3 ? vec3(1.0, 0.95, 0.85) : vec3(0.3, 0.3, 0.35);
          float spot = m == 1 ? 0.85 + 0.15 * sin(30.0 * dot(p, uF)) * sin(30.0 * dot(p, uR) + 9.0 * dot(p, uN)) : 1.0; // chromatophores
          c = base * spot * (0.35 + 0.75 * max(dot(n, uSun), 0.0)) + base * 0.15; tc = t; break; }
        t += e; } } }
  c += glow;
  o = vec4(c / (1.0 + 0.2 * c), 1.0);
}`;
const sh = (t, s) => { const x = gl.createShader(t); gl.shaderSource(x, s); gl.compileShader(x); if (!gl.getShaderParameter(x, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(x)); return x; };
const prog = gl.createProgram(); gl.attachShader(prog, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FS)); gl.linkProgram(prog);
if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
gl.useProgram(prog);
const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
const aPos = gl.getAttribLocation(prog, "aPos"); gl.enableVertexAttribArray(aPos); gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);
const U = {}; for (const n of ["uRes", "uTan", "uTime", "uEye", "uF", "uR", "uU", "uN", "uSun", "uNObj", "uTarget", "uObjT", "uNCap", "uCapA", "uCapB", "uCapR", "uSqC", "uSqR"]) U[n] = gl.getUniformLocation(prog, n);
const objTex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, objTex); for (const [k, v] of [[gl.TEXTURE_MIN_FILTER, gl.NEAREST], [gl.TEXTURE_MAG_FILTER, gl.NEAREST]]) gl.texParameteri(gl.TEXTURE_2D, k, v);
const SUN = unit([0.35, 0.55, -0.45, 0.6]); // the light: partly ana, so as you turn into w the sea's brightness moves

/* ------------------------------------------------------------------ the sea and the chase */
const game = { seed: 1, J: [], order: [], next: 0, t: 0, state: "card", squid: null, plankton: [] };
function newSea(seed) {
  game.seed = seed; game.J = sea(seed); game.order = course(game.J, seed);
  const T = new Float32Array(256 * 2 * 4); game.J.forEach((j, i) => { T.set(j.p, 4 * i); T.set([...j.col, j.r], 4 * (256 + i)); });
  gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, objTex); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, 256, 2, 0, gl.RGBA, gl.FLOAT, T);
  gl.uniform1i(U.uObjT, 0); gl.uniform1i(U.uNObj, Math.min(256, game.J.length));
  restart(); history.replaceState(null, "", `?seed=${seed}`);
}
function restart() {
  // start at the middle, heading at the first jelly's in-slice part, so it begins in view
  const first = game.J[game.order[0]].p, F = unit([first[0], first[1], first[2], 0].map((v, i) => v + (i === 2 ? 1e-3 : 0))), up0 = Math.abs(F[1]) < 0.9 ? [0, 1, 0, 0] : [1, 0, 0, 0];
  const Uv = unit(add(up0, F, -dot(up0, F))), N = [0, 0, 0, 1], R = (() => { const r = [F[1] * Uv[2] - F[2] * Uv[1], F[2] * Uv[0] - F[0] * Uv[2], F[0] * Uv[1] - F[1] * Uv[0], 0]; return unit(r); })();
  game.squid = new Squid([0, 0, 0, 0], F, R, Uv, N); Object.assign(game, { next: 0, t: 0 });
  const r = rng(game.seed * 13 + 1); game.plankton = Array.from({ length: 2600 }, () => [0, 1, 2, 3].map(() => (r() * 2 - 1) * 30));
}
function card(kicker, title, text, stats) { $("cardKicker").textContent = kicker; $("cardTitle").textContent = title; $("cardText").innerHTML = text; $("cardStats").innerHTML = stats || ""; $("card").hidden = false; game.state = "card"; }
const INTRO = "You're a squid in an open four-dimensional sea, with no down. Hold <b>JET</b> (or space) to pulse your mantle. The <b>stick</b> aims your funnel right, left, up and down; the <b>lever</b> aims it <b>ana</b> and <b>kata</b>, into the direction you can't see: three ways to turn, where our squid has two. Your <b>arms</b> trail like an arrow's feathers and keep you straight; fold them (X) for speed, and the Munk moment will try to turn you broadside. Swim through the gold jellies in order. Halos are jellies just out of your slice: teal ana, rose kata.";
$("cardGo").onclick = () => { if (game.state === "done") restart(); game.state = "play"; $("card").hidden = true; };
$("cardDice").onclick = $("diceB").onclick = () => { newSea(1 + Math.floor(Math.random() * 1e6)); card("a new sea", "SQUID", INTRO); };
$("retryB").onclick = () => { restart(); game.state = "play"; $("card").hidden = true; };

/* ------------------------------------------------------------------ input */
const keys = new Set(); let stick = null, lever = 0, jetHeld = false, arms = 1;
document.addEventListener("keydown", (e) => {
  const k = e.key.toLowerCase();
  if ((k === "enter") && !$("card").hidden) { $("cardGo").onclick(); return; }
  if (k === "x") { $("armsB").onclick(); return; }
  if (k === " ") { e.preventDefault(); if (!$("card").hidden) { $("cardGo").onclick(); return; } }
  if (["w", "a", "s", "d", "q", "e", "r", "f", " ", "arrowup", "arrowdown", "arrowleft", "arrowright"].includes(k)) { e.preventDefault(); keys.add(k); }
});
document.addEventListener("keyup", (e) => keys.delete(e.key.toLowerCase()));
addEventListener("blur", () => keys.clear());
$("armsB").onclick = () => { arms = arms ? 0 : 1; $("armsB").textContent = `arms: ${arms ? "spread" : "folded"}`; $("armsB").classList.toggle("on", !!arms); };
function hold(el, on, off, move) {
  let id = null;
  el.addEventListener("pointerdown", (e) => { id = e.pointerId; try { el.setPointerCapture(id); } catch (err) { /* fine */ } el.classList.add("live"); on(e); });
  el.addEventListener("pointermove", (e) => { if (e.pointerId === id && move) move(e); });
  for (const ev of ["pointerup", "pointercancel", "lostpointercapture"]) el.addEventListener(ev, (e) => { if (e.pointerId !== id) return; id = null; el.classList.remove("live"); off(); });
}
hold($("jet"), () => (jetHeld = true), () => (jetHeld = false));
const leverMove = (e) => { const r = $("ana").getBoundingClientRect(); lever = Math.max(-1, Math.min(1, -(e.clientY - r.top - r.height / 2) / (r.height / 2))); $("anaKnob").style.transform = `translateY(${-lever * r.height * 0.4}px)`; };
hold($("ana"), leverMove, () => { lever = 0; $("anaKnob").style.transform = ""; }, leverMove);
const STICK_R = 52, stickEl = $("stick"), knob = $("knob");
glc.addEventListener("pointerdown", (e) => {
  const r = stickEl.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2;
  if (Math.hypot(e.clientX - cx, e.clientY - cy) < STICK_R * 1.9) { try { glc.setPointerCapture(e.pointerId); } catch (err) { /* fine */ } stick = { id: e.pointerId, cx, cy, v: [0, 0] }; stickEl.classList.add("live"); moveStick(e); }
});
function moveStick(e) { if (!stick || e.pointerId !== stick.id) return; const dx = e.clientX - stick.cx, dy = e.clientY - stick.cy, m = Math.hypot(dx, dy), k = m > STICK_R ? STICK_R / m : 1; knob.style.transform = `translate(${dx * k}px, ${dy * k}px)`; stick.v = [(dx * k) / STICK_R, (-dy * k) / STICK_R]; }
glc.addEventListener("pointermove", moveStick);
for (const ev of ["pointerup", "pointercancel", "lostpointercapture"]) glc.addEventListener(ev, (e) => { if (stick && e.pointerId === stick.id) { stick = null; stickEl.classList.remove("live"); knob.style.transform = ""; } });
const aimNow = () => {
  const kv = (a, b, c, d) => (keys.has(a) || keys.has(b) ? 1 : 0) - (keys.has(c) || keys.has(d) ? 1 : 0);
  let x = kv("d", "arrowright", "a", "arrowleft"), y = kv("w", "arrowup", "s", "arrowdown"); const n = lever + kv("e", "r", "q", "f");
  if (stick) { x += stick.v[0]; y += stick.v[1]; }
  const v = [x, y, Math.max(-1, Math.min(1, n))], m = Math.hypot(...v); return m > 1 ? v.map((c) => c / m) : v;
};

/* ------------------------------------------------------------------ the squid's shape: mantle, head, funnel, twelve arms
   at the icosahedron's corners across (so they spread over the whole sphere of directions across, ana and kata too) */
const PHI = (1 + Math.sqrt(5)) / 2, ICO = [[0, 1, PHI], [0, -1, PHI], [0, 1, -PHI], [0, -1, -PHI], [1, PHI, 0], [-1, PHI, 0], [1, -PHI, 0], [-1, -PHI, 0], [PHI, 0, 1], [-PHI, 0, 1], [PHI, 0, -1], [-PHI, 0, -1]].map(unit);
function squidParts(q) {
  const P = (f, a) => add(add(add(add(q.pos, q.F, f), q.R, a[0]), q.U, a[1]), q.N, a[2]), caps = [];
  caps.push({ a: P(0.55, [0, 0, 0]), b: P(-0.35, [0, 0, 0]), r: 0.32, m: 1 }); // the mantle, its tip leading
  caps.push({ a: P(-0.45, [0, 0, 0]), b: P(-0.75, [0, 0, 0]), r: 0.24, m: 1 }); // the head
  caps.push({ a: P(-0.5, [0, -0.2, 0]), b: P(-0.15, [0, -0.32, 0]), r: 0.07, m: 3 }); // the funnel
  const s = 0.15 + 0.85 * q.spread;
  for (const d of ICO) caps.push({ a: P(-0.75, sc(d, 0.12)), b: P(-2.0 + 0.4 * s, sc(d, 0.12 + 0.75 * s)), r: 0.045, m: 2 });
  return caps;
}

/* ------------------------------------------------------------------ the overlay */
const TAN = 0.78;
function project(p4, eye, w, h) { const r = add(p4, eye, -1), q = game.squid, f = dot(r, q.F); return f < 0.3 ? null : { x: (w + (dot(r, q.R) / (f * TAN)) * h) / 2, y: (h - (dot(r, q.U) / (f * TAN)) * h) / 2, f, n: dot(r, q.N) }; }
function overlay(g, w, h, eye) {
  const q = game.squid;
  // plankton: the ones within a metre of your slice, faint, teal or rose by side
  for (const p of game.plankton) { const pr = project(add(q.pos, p), eye, w, h); if (!pr || Math.abs(pr.n) > 1.0 || pr.x < 0 || pr.x > w || pr.y < 0 || pr.y > h) continue; const a = (1 - Math.abs(pr.n)) * Math.min(1, 12 / pr.f); g.fillStyle = pr.n > 0 ? `rgba(150,255,240,${a})` : `rgba(255,180,220,${a})`; const s = Math.max(1, 3 / Math.sqrt(pr.f)); g.fillRect(pr.x - s / 2, pr.y - s / 2, s, s); }
  // the next jelly: a ring where it is (or an arrow to it), its distance and how far ana or kata of your slice
  const j = game.J[game.order[game.next]];
  if (j && game.state !== "done") {
    const pr = project(j.p, eye, w, h), dist = Math.hypot(...add(j.p, q.pos, -1)) - j.r, off = dot(add(j.p, eye, -1), q.N), txt = `${game.next + 1}/8 · ${Math.max(0, dist).toFixed(0)} m${Math.abs(off) < j.r ? "" : ` · ${Math.abs(off).toFixed(0)} m ${off > 0 ? "ana" : "kata"}`}`;
    g.font = "12px ui-monospace, Menlo, monospace"; g.textAlign = "center"; g.strokeStyle = g.fillStyle = Math.abs(off) < j.r ? "#ffd27a" : off > 0 ? "#38f2e0" : "#ff66b8"; g.lineWidth = 2;
    if (pr && pr.x > 0 && pr.x < w && pr.y > 40 && pr.y < h) { const rr = Math.max(10, Math.min(80, (j.r / (pr.f * TAN)) * h * 0.5)); g.beginPath(); g.arc(pr.x, pr.y, rr + 6, 0, 2 * Math.PI); g.stroke(); g.fillText(txt, pr.x, pr.y - rr - 12); }
    else { const r = add(j.p, eye, -1), a = Math.atan2(-dot(r, q.U), dot(r, q.R)), R = Math.min(w, h) * 0.4, ax = w / 2 + Math.cos(a) * R, ay = Math.min(h - 190, h / 2 + Math.sin(a) * R); g.beginPath(); g.moveTo(ax + Math.cos(a) * 14, ay + Math.sin(a) * 14); g.lineTo(ax + Math.cos(a + 2.5) * 11, ay + Math.sin(a + 2.5) * 11); g.lineTo(ax + Math.cos(a - 2.5) * 11, ay + Math.sin(a - 2.5) * 11); g.closePath(); g.fill(); g.fillText(txt, ax - Math.cos(a) * 24, ay - Math.sin(a) * 24); }
  }
  // the gauge: the funnel's aim (blue ring) in right/up, ana/kata on the bar beside; the next jelly's bearing (diamond, and a mark on the bar)
  const narrow = w < 640, R = narrow ? 38 : 46, cx = narrow ? w - R - 38 : w / 2, cy = narrow ? 128 : h - R - 30, aim = aimNow(); // on a narrow screen, top right, clear of the squid and the controls
  g.fillStyle = "rgba(7,8,12,0.45)"; g.strokeStyle = "rgba(255,255,255,0.35)"; g.lineWidth = 1; g.beginPath(); g.arc(cx, cy, R, 0, 2 * Math.PI); g.fill(); g.stroke();
  g.beginPath(); g.moveTo(cx - R, cy); g.lineTo(cx + R, cy); g.moveTo(cx, cy - R); g.lineTo(cx, cy + R); g.stroke();
  const bx = cx + R + 16; g.fillStyle = "rgba(7,8,12,0.45)"; g.fillRect(bx - 5, cy - R, 10, 2 * R); g.strokeRect(bx - 5, cy - R, 10, 2 * R);
  g.font = "10px ui-monospace, Menlo, monospace"; g.textAlign = "center"; g.fillStyle = "#38f2e0"; g.fillText("ana", bx, cy - R - 5); g.fillStyle = "#ff66b8"; g.fillText("kata", bx, cy + R + 12);
  if (j) { const r = add(j.p, q.pos, -1), m = Math.hypot(...r), b = [dot(r, q.R), dot(r, q.U), dot(r, q.N)].map((v) => v / m), ang = Math.acos(Math.max(-1, Math.min(1, dot(r, q.F) / m))) / Math.PI, lat = Math.hypot(b[0], b[1]) || 1;
    const px = cx + (b[0] / lat) * Math.min(1, ang * 2) * R * (lat / Math.hypot(...b) || 0), py = cy - (b[1] / lat) * Math.min(1, ang * 2) * R * (lat / Math.hypot(...b) || 0);
    g.strokeStyle = "#ffd27a"; g.lineWidth = 1.6; g.beginPath(); g.moveTo(px, py - 6); g.lineTo(px + 6, py); g.lineTo(px, py + 6); g.lineTo(px - 6, py); g.closePath(); g.stroke();
    const ny = cy - b[2] * R; g.beginPath(); g.moveTo(bx - 9, ny); g.lineTo(bx + 9, ny); g.stroke(); }
  g.strokeStyle = "#6fe0ff"; g.lineWidth = 1.6; g.beginPath(); g.arc(cx + aim[0] * R, cy - aim[1] * R, 7, 0, 2 * Math.PI); g.stroke(); g.fillStyle = "#6fe0ff"; g.fillRect(bx - 5, cy - aim[2] * R - 2, 10, 4);
}

/* ------------------------------------------------------------------ the loop */
let last = performance.now(), res = 0;
const FIXED = +new URLSearchParams(location.search).get("dt") ? 1 / +new URLSearchParams(location.search).get("dt") : 0;
function frame(now) {
  requestAnimationFrame(frame);
  const dt = FIXED || Math.min(0.05, (now - last) / 1000); last = now;
  const q = game.squid, aim = aimNow(), jet = jetHeld || keys.has(" ");
  if (game.state === "play") {
    q.step(dt, aim, jet, arms); game.t += dt;
    const r = Math.hypot(...q.pos); if (r > ARENA * 1.08) q.v = add(q.v, q.pos, (-2.5 * dt * (r - ARENA * 1.08)) / r); // the open sea ends: a gentle push back
    const j = game.J[game.order[game.next]]; if (j && Math.hypot(...add(j.p, q.pos, -1)) < j.r + 1.2) { game.next++; if (game.next === game.order.length) { game.state = "done"; card("all eight", `${game.t.toFixed(1)} s`, "Every jelly, in order. Try it with your arms folded: faster, if you can hold it straight.", `seed ${game.seed}`); } }
  } else q.step(dt, [0, 0, 0], false, arms);
  // plankton: kept in a 60 m box round you, wrapping
  for (const p of game.plankton) for (let k = 0; k < 4; k++) { const v = p[k]; p[k] = ((((v + 30) % 60) + 60) % 60) - 30; }
  if (game.state === "play") for (const p of game.plankton) for (let k = 0; k < 4; k++) p[k] -= q.v[k] * dt;
  // the view: just behind and above the squid, along its heading
  const back = glc.clientWidth < glc.clientHeight ? 8 : 5.5, eye = add(add(q.pos, q.F, -back), q.U, back * 0.27); // further back on a tall, narrow screen
  const dpr = Math.min(1.5, devicePixelRatio || 1); if (!res) res = dpr * (matchMedia("(pointer: coarse)").matches ? 0.6 : 0.8);
  const cw = Math.round(glc.clientWidth * res), chh = Math.round(glc.clientHeight * res); if (glc.width !== cw || glc.height !== chh) { glc.width = cw; glc.height = chh; }
  gl.viewport(0, 0, cw, chh); gl.uniform2f(U.uRes, cw, chh); gl.uniform1f(U.uTan, TAN); gl.uniform1f(U.uTime, now / 1000);
  gl.uniform4fv(U.uEye, eye); gl.uniform4fv(U.uF, q.F); gl.uniform4fv(U.uR, q.R); gl.uniform4fv(U.uU, q.U); gl.uniform4fv(U.uN, q.N); gl.uniform4fv(U.uSun, SUN); gl.uniform1i(U.uTarget, game.state === "done" ? -1 : game.order[game.next]);
  const caps = squidParts(q), A = new Float32Array(64), B = new Float32Array(64), Rr = new Float32Array(64); caps.forEach((c, i) => { A.set(c.a, 4 * i); B.set(c.b, 4 * i); Rr[4 * i] = c.r; Rr[4 * i + 1] = c.m; });
  gl.uniform1i(U.uNCap, caps.length); gl.uniform4fv(U.uCapA, A); gl.uniform4fv(U.uCapB, B); gl.uniform4fv(U.uCapR, Rr); gl.uniform4fv(U.uSqC, add(q.pos, q.F, -0.7)); gl.uniform1f(U.uSqR, 2.2);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
  const g = ov.getContext("2d"), od = Math.min(2, devicePixelRatio || 1), w = ov.clientWidth, h = ov.clientHeight;
  if (ov.width !== Math.round(w * od) || ov.height !== Math.round(h * od)) { ov.width = Math.round(w * od); ov.height = Math.round(h * od); }
  g.setTransform(od, 0, 0, od, 0, 0); g.clearRect(0, 0, w, h); overlay(g, w, h, eye);
  $("barFill").style.width = `${((100 * game.next) / 8).toFixed(1)}%`;
  const slip = (q.slip() * 180) / Math.PI, light = (Math.asin(Math.max(-1, Math.min(1, dot(SUN, q.N)))) * 180) / Math.PI, far = Math.hypot(...q.pos) > ARENA;
  const info = `${Math.hypot(...q.v).toFixed(1)} m/s · slip ${slip.toFixed(0)}°${slip > 25 ? ' <span class="off">broadside!</span>' : ""} · ${game.t.toFixed(1)} s · light ${Math.abs(light).toFixed(0)}° ${light > 0 ? "ana" : "kata"}${far ? ' · <span class="off">the open sea ends</span>' : ""}`;
  if (info !== frame.info) { frame.info = info; $("hudInfo").innerHTML = info; }
}

/* ------------------------------------------------------------------ start */
newSea(+(new URLSearchParams(location.search).get("seed")) || 1);
card("kata.mino.mobi", "SQUID", INTRO);
requestAnimationFrame(frame);
window.SQUID = { game, aimNow, setJet: (v) => (jetHeld = v), setLever: (v) => (lever = v), start: () => $("cardGo").onclick() };
for (const ev of ["contextmenu", "selectstart"]) document.addEventListener(ev, (e) => e.preventDefault());

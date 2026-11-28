/* four.mino.mobi/star/ — a star cut open, ours or four-dimensional. Draws only; the stars are generated
   (atom/tools/starcut.mjs → data.js): zero-age main-sequence models from atom/js/mainseq.js (4D on the reaction
   network's own burning), each with its layers at their real radii, the outer convective zones from atom/js/surface.js,
   and the photosphere's colour by each world's blackbody.
   The view is a WebGL ray-cast of the ball with one octant cut away (x, y, z > 0 in the star's frame). In 4D the ball
   is shown as a 3D slice at w: the slice is a ball of radius √(1 − w²), every layer of 4D radius r sits at √(r² − w²),
   and the cut orthant (x, y, z, w > 0) only opens the slice when w > 0. */
import { STARS } from "./data.js";
import { AGED } from "./aged.js";

const $ = (id) => document.getElementById(id), sup = (n) => String(n).replace(/-/g, "⁻").replace(/\d/g, (c) => "⁰¹²³⁴⁵⁶⁷⁸⁹"[+c]);
const sci = (x, d = 2) => { if (!Number.isFinite(x)) return "—"; const e = Math.floor(Math.log10(Math.abs(x))); const m = x / 10 ** e; return Math.abs(e) <= 3 ? x.toPrecision(d + 1).replace(/\.?0+$/, (s) => (s.includes(".") ? "" : s)) : `${m.toFixed(d)} × 10${sup(e)}`; };
const GS = Object.keys(STARS.four).map(Number).sort((a, b) => b - a), SS = [...new Set(GS.flatMap((g) => Object.keys(STARS.four[g]).map(Number)))].sort((a, b) => a - b);
const MSUN = 1.98847e30, RSUN = 6.957e8, LSUN = 3.828e26;
const state = { world: "ours", G: 1e-17, s: 1.5152, i: 0, w: 0.35, rot: [0.55, -0.5], zoom: 1, age: 0 };

/* ——— the current sequence and star ——— */
function seq() { if (state.world === "ours") return { stars: STARS.ours.stars, unit: "M☉", sunM: 1 }; const q = STARS.four[state.G]?.[state.s]; return q ? { stars: q.stars, unit: "M_Ch", sunM: q.sunM, sunKind: q.sunKind } : { stars: [] }; }
function zams() { const q = seq(); return q.stars[Math.min(state.i, q.stars.length - 1)]; }
/* the aged tracks of this world (and, in 4D, this G and s), and the one for the current star: the track its "aged so
   far" chip pinned (state.tm; a 4D Sun analogue's mass can fall between the zero-age table's stars), else an aged run
   whose mass is within 7% of the zero-age star picked (the aged runs have their own masses) */
function tracks() { return state.world === "ours" ? AGED.ours : AGED.four?.[state.G]?.[state.s] ?? {}; }
function track() { if (state.tm != null) { const t = Object.values(tracks()).find((x) => x.m === state.tm); if (t?.snaps?.length > 1) return t; } const z = zams(); if (!z) return null; let best = null; for (const t of Object.values(tracks())) if (t.snaps?.length > 1 && Math.abs(Math.log(t.m / z.m)) < 0.07 && (!best || Math.abs(Math.log(t.m / z.m)) < Math.abs(Math.log(best.m / z.m)))) best = t; return best; }
function star() { const t = track(); return t ? t.snaps[Math.min(state.age, t.snaps.length - 1)] : zams(); }
function nearestSun() { const q = seq(); if (!q.sunM) return 0; let b = 0; q.stars.forEach((x, i) => { if (Math.abs(Math.log(x.m / q.sunM)) < Math.abs(Math.log(q.stars[b].m / q.sunM))) b = i; }); return b; }

/* ——— WebGL: the cutaway ——— */
const cv = $("view"), gl = cv.getContext("webgl", { antialias: true, premultipliedAlpha: false });
const VS = `attribute vec2 p; varying vec2 uv; void main(){ uv = p; gl_Position = vec4(p, 0.0, 1.0); }`;
const FS = `precision highp float; varying vec2 uv;
uniform mat3 R; uniform vec2 asp; uniform float zoom, K, W, cut, time; uniform vec3 surf; uniform float heat[40], conv[40], burn[40];
uniform vec2 env; uniform float envDeep;
vec3 palette(float t){ t = clamp(t, 0.0, 1.0); vec3 a = vec3(0.32,0.04,0.03), b = vec3(0.86,0.24,0.06), c = vec3(1.0,0.62,0.16), d = vec3(1.0,0.93,0.62), e = vec3(1.0,1.0,0.97);
  if (t < 0.25) return mix(a, b, t/0.25); if (t < 0.5) return mix(b, c, (t-0.25)/0.25); if (t < 0.78) return mix(c, d, (t-0.5)/0.28); return mix(d, e, (t-0.78)/0.22); }
float look(float arr[40], float x){ float f = clamp(x*40.0 - 0.5, 0.0, 39.0); int i = int(floor(f)); float g = f - float(i); float a = 0.0, b = 0.0;
  for (int k = 0; k < 40; k++) { if (k == i) a = arr[k]; if (k == i + 1) b = arr[k]; } if (i >= 39) b = a; return mix(a, b, g); }
bool removed(vec3 p){ return cut > 0.5 && p.x > 0.0 && p.y > 0.0 && p.z > 0.0; }
void main(){
  vec2 q = uv * asp / zoom; vec3 o = R * vec3(q, 3.0), d = R * vec3(0.0, 0.0, -1.0);
  float best = 1e9; vec3 hp = vec3(0.0), n = vec3(0.0); int kind = -1;
  float bq = dot(o, d), cq = dot(o, o) - K*K, disc = bq*bq - cq;
  if (disc > 0.0) { float t0 = -bq - sqrt(disc); vec3 p = o + t0*d; if (!removed(p)) { best = t0; hp = p; n = p / K; kind = 0; } }
  if (cut > 0.5) for (int a = 0; a < 3; a++) { float da = a == 0 ? d.x : (a == 1 ? d.y : d.z), oa = a == 0 ? o.x : (a == 1 ? o.y : o.z); if (abs(da) < 1e-6) continue;
    float t = -oa / da; vec3 p = o + t*d; p[a] = 0.0; if (dot(p,p) > K*K || t > best || t < 0.0) continue;
    bool ok = (a == 0 ? (p.y >= 0.0 && p.z >= 0.0) : (a == 1 ? (p.x >= 0.0 && p.z >= 0.0) : (p.x >= 0.0 && p.y >= 0.0))); if (!ok) continue;
    best = t; hp = p; n = vec3(a == 0 ? 1.0 : 0.0, a == 1 ? 1.0 : 0.0, a == 2 ? 1.0 : 0.0); kind = 1 + a; }
  if (kind < 0) { gl_FragColor = vec4(0.027, 0.031, 0.047, 1.0); return; }
  vec3 nv = transpose(R) * n; float mu = max(0.0, nv.z);
  if (kind == 0) { float limb = 0.35 + 0.65*pow(mu, 0.6); gl_FragColor = vec4(surf/255.0 * limb, 1.0); return; }
  float r4 = sqrt(dot(hp,hp) + W*W); vec3 c = palette(look(heat, r4));
  float cv = look(conv, r4), bu = look(burn, r4);
  float ang = atan(hp.y + hp.z, hp.x + hp.z + 1e-6);
  float cells = 0.5 + 0.5*sin(r4*70.0 - time*0.6) * sin(ang*14.0 + r4*20.0);
  c = mix(c, palette(look(heat, r4) - 0.28*(1.0 - cells)) * (0.8 + 0.25*cells), cv);
  c = mix(c, vec3(1.0, 1.0, 0.92), 0.55*bu);
  if (env.y < 0.999 && r4 > env.y && r4 < env.x) { float e = 0.5 + 0.5*sin(r4*900.0); c *= mix(1.0, 0.75 + 0.35*e, envDeep > 0.5 ? 0.0 : 1.0); c = mix(c, vec3(0.55, 0.85, 1.0), envDeep > 0.5 ? 0.0 : 0.6); }
  if (r4 > 0.985) c = mix(c, surf/255.0, 0.6);
  gl_FragColor = vec4(c * (0.72 + 0.28*mu), 1.0); }`.replace("transpose(R)", "mat3(R[0][0],R[1][0],R[2][0],R[0][1],R[1][1],R[2][1],R[0][2],R[1][2],R[2][2])");
function sh(t, src) { const s = gl.createShader(t); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; }
const prog = gl.createProgram(); gl.attachShader(prog, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FS)); gl.linkProgram(prog); gl.useProgram(prog);
const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
const loc = gl.getAttribLocation(prog, "p"); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
const U = (n) => gl.getUniformLocation(prog, n);
function rotM() { const [a, b] = state.rot, ca = Math.cos(a), sa = Math.sin(a), cb = Math.cos(b), sb = Math.sin(b); // yaw a about y, then pitch b about x
  const Y = [[ca, 0, sa], [0, 1, 0], [-sa, 0, ca]], X = [[1, 0, 0], [0, cb, -sb], [0, sb, cb]], M = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) for (let k = 0; k < 3; k++) M[i][j] += Y[i][k] * X[k][j]; return M; }
/* the star's profile as 40 radial samples for the shader: heat (log T across the star), convection, where light is made */
function samples(st) {
  const p = st.prof, n = 40, heat = [], conv = [], burn = [], gad = state.world === "ours" ? 0.4 : 1 / 3, lo = Math.log10(st.Teff), hi = Math.log10(st.Tc);
  const at = (x, j) => { let k = 0; while (k < p.length - 2 && p[k + 1][0] < x) k++; const a = p[k], b = p[k + 1], f = Math.max(0, Math.min(1, (x - a[0]) / (b[0] - a[0] || 1))); return a[j] == null || b[j] == null ? (a[j] ?? b[j]) : a[j] + (b[j] - a[j]) * f; };
  let maxdl = 1e-9; const dl = []; for (let i = 0; i < n; i++) { const x = (i + 0.5) / n, d = (at(Math.min(1, x + 0.0125), 3) - at(Math.max(0, x - 0.0125), 3)) / 0.025; dl.push(d); maxdl = Math.max(maxdl, d); }
  for (let i = 0; i < n; i++) { const x = (i + 0.5) / n; heat.push(Math.max(0, Math.min(1, (at(x, 1) - lo) / (hi - lo || 1)))); conv.push(x <= st.layers.cc ? 1 : 0); burn.push(Math.max(0, dl[i] / maxdl) ** 0.7); }
  const deep = (st.layers.env ?? []).find((z) => z.deep || z.bot < 0.97); if (deep) for (let i = 0; i < n; i++) { const x = (i + 0.5) / n; if (x >= deep.bot) conv[i] = 1; }
  return { heat, conv, burn };
}
let t0 = performance.now();
function draw() {
  const dpr = Math.min(2, window.devicePixelRatio || 1), w = cv.clientWidth, h = cv.clientHeight; if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); }
  gl.viewport(0, 0, cv.width, cv.height); const st = star(); if (!st) return;
  const four = state.world === "four", W = four ? state.w : 0, K = Math.sqrt(Math.max(0, 1 - W * W)), M = rotM(), sm = samples(st);
  gl.uniformMatrix3fv(U("R"), false, new Float32Array([M[0][0], M[1][0], M[2][0], M[0][1], M[1][1], M[2][1], M[0][2], M[1][2], M[2][2]]));
  const s = Math.min(w, h) / 2 / 1.25; gl.uniform2f(U("asp"), w / 2 / s, h / 2 / s); gl.uniform1f(U("zoom"), state.zoom); gl.uniform1f(U("K"), K); gl.uniform1f(U("W"), W);
  gl.uniform1f(U("cut"), !four || W >= 0 ? 1 : 0); gl.uniform1f(U("time"), (performance.now() - t0) / 1000); gl.uniform3f(U("surf"), ...st.colour);
  gl.uniform1fv(U("heat"), sm.heat); gl.uniform1fv(U("conv"), sm.conv); gl.uniform1fv(U("burn"), sm.burn);
  const thin = (st.layers.env ?? []).filter((z) => !z.deep && z.bot >= 0.97).reduce((a, z) => (z.mass > (a?.mass ?? -1) ? z : a), null);
  gl.uniform2f(U("env"), thin ? Math.min(1, thin.top + 0.004) : 1, thin ? Math.max(0, thin.bot - 0.004) : 1); gl.uniform1f(U("envDeep"), 0);
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4); labels(M, s, w, h, W, K, st);
}
/* ——— labels: each layer named, a leader from a point on the cut face most turned toward us ——— */
function layerList(st) {
  const L = st.layers, out = [], deep = (L.env ?? []).find((z) => z.deep || z.bot < 0.97), thin = (L.env ?? []).filter((z) => !z.deep && z.bot >= 0.97).reduce((a, z) => (z.mass > (a?.mass ?? -1) ? z : a), null);
  out.push({ r: Math.min(L.b90, 0.9) * 0.5, name: "where the light is made", sub: `90% of it within ${L.b90.toFixed(2)} R` });
  if (L.cc > 0.02) out.push({ r: L.cc * 0.85, name: "convective core", sub: `stirred out to ${L.cc.toFixed(2)} R, ${(100 * st.qcc).toFixed(0)}% of the mass` });
  const radTop = deep ? deep.bot : 0.985, radBot = Math.max(L.cc, L.b90 * 0.6);
  if (radTop - radBot > 0.08) out.push({ r: (radTop + radBot) / 2, name: "radiative zone", sub: "light diffuses out; the gas stays put" });
  if (deep) out.push({ r: (deep.bot + 1) / 2, name: "convective envelope", sub: `stirred from ${deep.bot.toFixed(2)} R up` });
  else if (thin) out.push({ r: (thin.top + thin.bot) / 2, name: "a wafer of convection", sub: `${sci(thin.mass, 1)} of the mass, ${Math.round(thin.Ttop / 1000)}–${Math.round(thin.Tbot / 1000)} thousand K` });
  out.push({ r: 0.995, name: "photosphere", sub: `${st.Teff.toLocaleString("en")} K`, surf: true });
  return out;
}
function labels(M, s, w, h, W, K, st) {
  const svg = $("leaders"), box = $("labels"); svg.setAttribute("viewBox", `0 0 ${w} ${h}`);
  const faces = [[1, 0, 0], [0, 1, 0], [0, 0, 1]], facing = (n) => M[2][0] * n[0] + M[2][1] * n[1] + M[2][2] * n[2];
  const cutOn = state.world === "ours" || W >= 0, f = faces.map((n, i) => ({ i, z: facing(n) })).sort((a, b) => b.z - a.z)[0];
  const proj = (p) => { const x = M[0][0] * p[0] + M[0][1] * p[1] + M[0][2] * p[2], y = M[1][0] * p[0] + M[1][1] * p[1] + M[1][2] * p[2]; return [w / 2 + x * s * state.zoom, h / 2 - y * s * state.zoom]; };
  let lines = "", html = ""; const list = layerList(st), right = w > 520, col = right ? w - 12 : null;
  const items = list.filter((L) => cutOn || L.surf).map((L) => { const rho = Math.sqrt(Math.max(0, L.r * L.r - W * W)); if (L.r <= Math.abs(W)) return { ...L, hidden: true };
    let p; if (L.surf || !cutOn || f.z < 0.12) { p = [-0.55 * K, 0.6 * K, 0.58 * K]; const m = Math.hypot(...p); p = p.map((v) => (v / m) * K * 0.999); }
    else { const a = (f.i + 1) % 3, b = (f.i + 2) % 3; p = [0, 0, 0]; p[a] = rho / Math.SQRT2; p[b] = rho / Math.SQRT2; }
    return { ...L, xy: proj(p) }; }).filter((x) => !x.hidden);
  items.sort((a, b) => a.xy[1] - b.xy[1]);
  items.forEach((L, k) => { const ty = right ? 24 + k * ((h - 76) / Math.max(1, items.length - 1)) : h - 14 - (items.length - 1 - k) * 34, tx = right ? col : 12;
    lines += `<path d="M${L.xy[0].toFixed(1)},${L.xy[1].toFixed(1)} L${(right ? tx - 170 : L.xy[0]).toFixed(1)},${(ty).toFixed(1)}${right ? ` L${(tx - 4).toFixed(1)},${ty.toFixed(1)}` : ""}" fill="none" stroke="rgba(230,236,255,0.55)" stroke-width="1"/><circle cx="${L.xy[0].toFixed(1)}" cy="${L.xy[1].toFixed(1)}" r="2.6" fill="#fff"/>`;
    html += `<div class="lab" style="${right ? `right:12px;top:${(ty - 9).toFixed(0)}px;text-align:right` : `left:12px;top:${(ty - 9).toFixed(0)}px`}"><b>${L.name}</b><small>${L.sub}</small></div>`; });
  svg.innerHTML = right ? lines : ""; box.innerHTML = right ? html : ""; $("legendSmall").innerHTML = right ? "" : items.map((L) => `<div><b>${L.name}</b> — ${L.sub}</div>`).join("");
}
/* ——— the readout and the profile ——— */
const ageTxt = (t) => (t == null ? "—" : t === 0 ? "0" : t >= 1 ? `${t.toPrecision(3)} billion years` : t >= 1e-3 ? `${(t * 1e3).toPrecision(3)} million years` : `${Math.round(t * 1e9).toLocaleString("en")} years`);
function readout() {
  const st = star(), q = seq(), tr = track(); if (!st) return; const four = state.world === "four";
  const massTxt = (four ? `${st.m} M<sub>Ch</sub> <span class="dim">(${sci(st.Mkg / MSUN)} of our Suns' mass; a 4D star holds far more matter)</span>` : `${st.m} M☉`) + (tr ? ` <span class="sunflag" style="color:#9fe3b0;border-color:#5aa86f">aged</span>` : "");
  const env = st.layers.env ?? [], deep = env.find((z) => z.deep || z.bot < 0.97), thin = env.filter((z) => !z.deep && z.bot >= 0.97).reduce((a, z) => (z.mass > (a?.mass ?? -1) ? z : a), null);
  const outer = st.layers.envNote ? `<span class="dim">${st.layers.envNote}</span>` : deep ? `deep: stirred from ${deep.bot.toFixed(2)} R to the surface` : thin ? `none to speak of: a wafer holding ${sci(thin.mass, 1)} of the mass` : "none";
  const rows = [["mass", massTxt], ["radius", four ? `${sci(st.R / 1e3)} km` : `${(st.R / RSUN).toFixed(2)} R☉`], ["luminosity", `${sci(st.L)} W${four ? "" : ` (${(st.L / LSUN).toPrecision(2)} L☉)`}`],
    ["surface", `<i class="sw" style="background:rgb(${st.colour.join(",")})"></i>${st.Teff.toLocaleString("en")} K`], ["centre", `${(st.Tc / 1e6).toFixed(1)} million K${st.rhoc ? `, ${sci(st.rhoc)} kg/m${four ? "⁴" : "³"}` : ""}`],
    ...(tr ? [["age", `${ageTxt(st.t)} <span class="dim">of a main sequence that ends at ${ageTxt(tr.tEnd)}${tr.ref ? ` (MIST: ${ageTxt(tr.ref.tmsGyr)})` : ""}</span>`], ["centre's hydrogen", `${(100 * st.Xc).toFixed(1)}% by mass <span class="dim">(born with ${(100 * tr.X0).toFixed(1)}%)</span>`]]
      : [["core clock (zero age)", st.thGyr == null ? (four ? "<span class=dim>never halves (not by 10²² s)</span>" : "<span class=dim>—</span>") : `half its core's hydrogen in ${sci(st.thGyr)} billion years`]]),
    ["convective core", st.layers.cc > 0.02 ? `${(100 * st.qcc).toFixed(0)}% of the mass, out to ${st.layers.cc.toFixed(2)} R` : "none"], ["outer stirring", outer]];
  $("readout").innerHTML = rows.map(([a, b]) => `<div><span>${a}</span><b>${b}</b></div>`).join("");
  const sunIdx = nearestSun(); $("sunmark").textContent = four ? (q.sunM ? `Sun-like star here: ${q.sunM} M_Ch${q.sunKind ? `, its centre burns ${q.sunKind}` : ""}` : "no Sun-like star in the masses computed") : "our Sun: 1 M☉";
  $("tosun").disabled = !q.sunM; $("mass").max = q.stars.length - 1; $("mass").value = state.i; $("massval").innerHTML = four ? `${st.m} M<sub>Ch</sub>` : `${st.m} M☉`; $("isSun").hidden = state.i !== sunIdx || !q.sunM;
  // the age row, and the aged masses as chips that jump there
  $("agerow").hidden = !tr; if (tr) { $("age").max = tr.snaps.length - 1; $("age").value = Math.min(state.age, tr.snaps.length - 1); $("ageval").textContent = ageTxt(st.t);
    $("agenote").textContent = st.t === 0 ? "zero age" : st.Xc < 0.002 ? "central hydrogen gone: the main sequence ends here" : `${(100 * (1 - st.Xc / tr.X0)).toFixed(0)}% of the centre's hydrogen burnt`; }
  const ms = Object.values(tracks()).filter((t) => t.snaps?.length > 1).map((t) => t.m).sort((a, b) => a - b); $("agedrow").hidden = !ms.length;
  $("agechips").innerHTML = ms.map((m) => `<button data-m="${m}" class="${tr && tr.m === m ? "on" : ""}">${m} ${four ? "M_Ch" : "M☉"}</button>`).join("");
  profile(st); reference(st, tr);
}
function profile(st) {
  const c = $("prof"), dpr = Math.min(2, window.devicePixelRatio || 1), w = c.clientWidth, h = c.clientHeight; c.width = w * dpr; c.height = h * dpr; const g = c.getContext("2d"); g.scale(dpr, dpr); g.clearRect(0, 0, w, h);
  const L = 40, R = w - 10, T = st.prof[0]?.[5] != null ? 36 : 28, B = h - 42, X = (x) => L + x * (R - L), p = st.prof.filter((q) => q[1] != null);
  const lT = p.map((q) => q[1]), lR = p.map((q) => q[2]).filter((v) => v != null), Ty = (v) => B - ((v - Math.min(...lT)) / (Math.max(...lT) - Math.min(...lT) || 1)) * (B - T), Ry = (v) => B - ((v - Math.min(...lR)) / (Math.max(...lR) - Math.min(...lR) || 1)) * (B - T);
  const env = st.layers.env ?? [], deep = env.find((z) => z.deep || z.bot < 0.97);
  g.fillStyle = "rgba(111,224,255,0.10)"; if (st.layers.cc > 0.02) g.fillRect(X(0), T, X(st.layers.cc) - X(0), B - T); if (deep) g.fillRect(X(deep.bot), T, X(1) - X(deep.bot), B - T);
  g.fillStyle = "rgba(255,240,180,0.12)"; g.fillRect(X(0), T, X(st.layers.b90) - X(0), B - T);
  const line = (ys, col) => { g.strokeStyle = col; g.lineWidth = 2; g.beginPath(); p.forEach((q, k) => { const y = ys(q); if (y == null) return; k ? g.lineTo(X(q[0]), y) : g.moveTo(X(q[0]), y); }); g.stroke(); };
  line((q) => Ty(q[1]), "#ffb35c"); line((q) => (q[2] == null ? null : Ry(q[2])), "#8fd3ff"); line((q) => B - q[3] * (B - T), "rgba(255,255,255,0.55)");
  if (p[0]?.[5] != null) { g.setLineDash([5, 3]); line((q) => B - (q[5] / 0.8) * (B - T), "#9fe3b0"); g.setLineDash([]); g.fillStyle = "#9fe3b0"; g.fillText("- - hydrogen by mass (0 → 80%): the burnt core", L, 27); }
  g.fillStyle = "#9aa3b8"; g.font = "11px ui-monospace, monospace"; g.fillText("centre", L, h - 26); g.textAlign = "right"; g.fillText("surface  r/R →", R, h - 26); g.textAlign = "left";
  g.fillStyle = "#ffb35c"; g.fillText("— temperature", L, 14); g.fillStyle = "#8fd3ff"; g.fillText("— density", L + 112, 14); g.fillStyle = "rgba(255,255,255,0.75)"; g.fillText("— light made so far (0 → all)", L + 196, 14); g.fillStyle = "rgba(160,220,255,0.75)"; g.textAlign = "center"; g.fillText("blue band: stirred · pale band: where light is made", (L + R) / 2, h - 6); g.textAlign = "left";
  g.save(); g.translate(12, (T + B) / 2); g.rotate(-Math.PI / 2); g.textAlign = "center"; g.fillStyle = "#9aa3b8"; g.fillText("log scale, each its own", 0, 0); g.restore();
}
/* ——— the life against a published one: L, surface T and the centre's hydrogen against age, ours solid, MIST dashed ——— */
function reference(st, tr) {
  $("refcard").hidden = !tr; if (!tr) return; const four = state.world === "four", ref = tr.ref;
  $("reftitle").innerHTML = ref ? `This life against MIST's ${ref.mistM} M☉ track <span class="dim" style="font-weight:400">(solid: ours · dashed: MIST v1.2, Choi et al. 2016)</span>` : `This life <span class="dim" style="font-weight:400">(no published four-dimensional stars to set it against; the machinery is checked on ours)</span>`;
  const c = $("ref"), dpr = Math.min(2, window.devicePixelRatio || 1), g = c.getContext("2d");
  const tMax = Math.max(tr.tEnd, ref?.tmsGyr ?? 0), panels = [["luminosity", (r) => r.L / (four ? 1 : LSUN), four ? "W" : "L☉", true], ["surface temperature", (r) => r.Teff, "K", false], ["centre's hydrogen", (r) => 100 * r.Xc, "% by mass", false]];
  // three panels side by side on a wide screen, stacked on a narrow one; each with its own y ticks, the x axis in Gyr
  const narrow = c.clientWidth < 700, ph = narrow ? 150 : 210; c.style.height = `${narrow ? ph * 3 : ph}px`;
  const w2 = c.clientWidth, h2 = c.clientHeight; c.width = w2 * dpr; c.height = h2 * dpr; g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, w2, h2); g.font = "11px ui-monospace, monospace";
  const nice = (v, log) => { if (log) { const e = Math.floor(Math.log10(v)), m = v / 10 ** e; return Math.abs(e) <= 3 ? (v >= 10 ? v.toFixed(0) : v.toPrecision(2)) : `${m.toFixed(1)}e${e}`; } const r = +v.toPrecision(2); return Math.abs(r) >= 1000 ? r.toLocaleString("en") : Math.abs(r) >= 10 ? r.toFixed(0) : r.toFixed(1); };
  const tfmt = (t) => (tMax < 0.01 ? `${+(t * 1e3).toPrecision(2)} Myr` : `${+t.toPrecision(2)} Gyr`);
  panels.forEach(([name, f, unit, log], k) => {
    const bx = narrow ? 0 : (k * w2) / 3, by = narrow ? k * ph : 0, bw = narrow ? w2 : w2 / 3, x0 = bx + 58, x1 = bx + bw - 12, y0 = by + 24, y1 = by + ph - 26;
    const vals = [...tr.track, ...(ref?.rows ?? [])].map(f).filter((v) => Number.isFinite(v) && (!log || v > 0)), T = (v) => (log ? Math.log10(v) : v);
    let lo = Math.min(...vals.map(T)), hi = Math.max(...vals.map(T)); const pad = (hi - lo || 1) * 0.08; lo -= pad; hi += pad; if (!log && Math.min(...vals) >= 0) lo = Math.max(0, lo);
    const X = (t) => x0 + (t / tMax) * (x1 - x0), Y = (v) => y1 - ((T(v) - lo) / (hi - lo)) * (y1 - y0);
    g.strokeStyle = "rgba(255,255,255,0.12)"; g.lineWidth = 1; g.strokeRect(x0, y0, x1 - x0, y1 - y0);
    g.fillStyle = "#9aa3b8"; g.textAlign = "right";
    for (let q = 0; q <= 2; q++) { const tv = lo + ((hi - lo) * q) / 2, v = log ? 10 ** tv : tv, y = y1 - ((tv - lo) / (hi - lo)) * (y1 - y0); g.fillText(nice(v, log), x0 - 5, y + 4); g.strokeStyle = "rgba(255,255,255,0.06)"; g.beginPath(); g.moveTo(x0, y); g.lineTo(x1, y); g.stroke(); }
    g.textAlign = "center"; for (const q of [0, 0.5, 1]) g.fillText(q === 0 ? "0" : tfmt(q * tMax), Math.min(x1 - 24, Math.max(x0 + 8, x0 + q * (x1 - x0))), y1 + 15);
    const draw = (rows, col, dash) => { g.strokeStyle = col; g.lineWidth = 2; g.setLineDash(dash); g.beginPath(); let started = false; rows.forEach((r) => { const v = f(r); if (!Number.isFinite(v) || (log && v <= 0)) return; started ? g.lineTo(X(r.t), Y(v)) : g.moveTo(X(r.t), Y(v)); started = true; }); g.stroke(); g.setLineDash([]); };
    if (ref) draw(ref.rows, "rgba(200,206,222,0.75)", [5, 4]); draw(tr.track, "#ffb35c", []);
    g.strokeStyle = "#9fe3b0"; g.lineWidth = 1; g.beginPath(); g.moveTo(X(st.t), y0); g.lineTo(X(st.t), y1); g.stroke(); g.fillStyle = "#9fe3b0"; g.beginPath(); g.arc(X(st.t), Y(f(st)), 3, 0, 7); g.fill();
    g.textAlign = "left"; g.fillStyle = "#cfd6e6"; g.fillText(name, x0, y0 - 8); g.textAlign = "right"; g.fillStyle = "#9aa3b8"; g.fillText(unit + (log ? ", log scale" : ""), x1, y0 - 8); g.textAlign = "left"; });
  const at = (rows, t) => rows.reduce((a, b) => (Math.abs(b.t - t) < Math.abs(a.t - t) ? b : a)), mr = ref ? at(ref.rows, st.t) : null;
  $("refnote").innerHTML = ref ? `At ${ageTxt(st.t)}: ours ${(st.L / LSUN).toPrecision(3)} L☉, ${st.Teff.toLocaleString("en")} K, centre ${(100 * st.Xc).toFixed(0)}% hydrogen; MIST ${(mr.L / LSUN).toPrecision(3)} L☉, ${mr.Teff.toLocaleString("en")} K, ${(100 * mr.Xc).toFixed(0)}%.
    Ours now carries the same composition (hydrogen 70.7% against MIST's 71.5%, metals 1.43%) and the same opacity tables (OPAL's, as measured input), with its outer layers integrated as a mixing-length envelope, its α fixed on our Sun's radius. What still differs is on purpose: MIST lets helium settle into the core (the Sun's life runs a little shorter) and stirs a little past a convective core's edge (overshoot: heavier stars take in more fuel and live longer). Where the lines part, one of those is why.` : `Solid: this star's own life, zero age to the end of its central hydrogen.`;
}
/* ——— controls ——— */
function chips(host, vals, cur, fmt, set) { host.innerHTML = vals.map((v) => `<button data-v="${v}" class="${v === cur ? "on" : ""}">${fmt(v)}</button>`).join(""); host.onclick = (e) => { const b = e.target.closest("button"); if (b) set(+b.dataset.v); }; }
function sync() {
  if (!GS.length) { state.world = "ours"; const b = document.querySelector('#world button[data-v="four"]'); b.disabled = true; b.title = "the four-dimensional stars' interiors are still being computed"; b.textContent = "four dimensions (computing)"; }
  const four = state.world === "four"; document.querySelectorAll("#world button").forEach((b) => b.classList.toggle("on", b.dataset.v === state.world));
  $("fourctl").hidden = !four; $("wrow").hidden = !four;
  chips($("gchips"), GS, state.G, (g) => `10${sup(Math.round(Math.log10(g)))}`, (g) => { state.G = g; state.tm = null; state.i = nearestSun(); state.age = 0; sync(); });
  chips($("schips"), SS, state.s, (s) => String(s), (s) => { state.s = s; state.tm = null; state.i = nearestSun(); state.age = 0; sync(); });
  $("wval").textContent = state.w.toFixed(2); $("wnote").textContent = state.w > 0 ? "this slice crosses the cut orthant, so the cut is open" : state.w < 0 ? "this slice misses the cut orthant: the ball is whole here; slide w above 0 to open it" : "the middle slice, on the cut orthant's edge";
  readout(); save();
}
function save() { try { history.replaceState(null, "", `#${state.world}${state.world === "four" ? `/${state.G}/${state.s}` : ""}/${state.i}${state.world === "four" ? `/${state.w.toFixed(2)}` : ""}${track() ? `/a${state.age}` : ""}${state.tm != null && track() ? `/t${state.tm}` : ""}`); } catch {} }
function load() { const raw = location.hash.slice(1).split("/"), a = raw.find((x) => /^a\d+$/.test(x)), t = raw.find((x) => /^t[\d.]+$/.test(x)), h = raw.filter((x) => x !== a && x !== t); state.tm = t ? +t.slice(1) : null; state.age = a ? +a.slice(1) : 0; if (h[0] === "four") { state.world = "four"; if (+h[1]) state.G = +h[1]; if (+h[2]) state.s = +h[2]; state.i = h[3] != null ? +h[3] : nearestSun(); if (h[4] != null) state.w = +h[4]; } else { state.world = "ours"; state.i = h[1] != null ? +h[1] : nearestSun(); } }
$("world").onclick = (e) => { const b = e.target.closest("button"); if (!b) return; state.world = b.dataset.v; state.tm = null; state.i = nearestSun(); state.age = 0; sync(); };
$("mass").oninput = (e) => { state.tm = null; state.i = +e.target.value; state.age = 0; readout(); save(); };
$("age").oninput = (e) => { state.age = +e.target.value; readout(); save(); };
$("agechips").onclick = (e) => { const b = e.target.closest("button"); if (!b) return; const m = +b.dataset.m, q = seq(); let k = 0; q.stars.forEach((x, i) => { if (Math.abs(Math.log(x.m / m)) < Math.abs(Math.log(q.stars[k].m / m))) k = i; }); state.i = k; state.tm = m; state.age = 0; readout(); save(); };
$("tosun").onclick = () => { state.tm = null; state.i = nearestSun(); state.age = 0; readout(); save(); };
$("w").oninput = (e) => { state.w = +e.target.value / 100; sync(); };
let drag = null; cv.addEventListener("pointerdown", (e) => { drag = [e.clientX, e.clientY, ...state.rot]; cv.setPointerCapture(e.pointerId); });
cv.addEventListener("pointermove", (e) => { if (!drag) return; state.rot = [drag[2] + (e.clientX - drag[0]) * 0.01, Math.max(-1.4, Math.min(1.4, drag[3] + (e.clientY - drag[1]) * 0.01))]; });
cv.addEventListener("pointerup", () => (drag = null)); cv.addEventListener("wheel", (e) => { e.preventDefault(); state.zoom = Math.max(0.6, Math.min(3, state.zoom * Math.exp(-e.deltaY * 0.001))); }, { passive: false });
load(); $("w").value = Math.round(state.w * 100); sync(); window.addEventListener("resize", readout);
window.addEventListener("hashchange", () => { load(); $("w").value = Math.round(state.w * 100); sync(); });
(function loop() { draw(); requestAnimationFrame(loop); })();

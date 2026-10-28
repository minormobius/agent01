/* ATOM⁴'s tile: one small 4D viewer, many to a page, the seed of a 4D molecular-dynamics view. A scene is
     { lines: [[a, b]], faces: [[i…]], balls: [{ p, el | c, r, group }], bonds: [[a, b]], ghost: [[a, b]], P: [4-vectors] }
   (lines, faces and ghost index P; balls carry their own points, bonds index balls). Two views:
     shadow: everything, w folded in by perspective (a camera off along w), coloured by w: kata pink, ana green.
     slice:  what a 3D creature at w = h sees. Faces crossing the hyperplane give the slice's edges, a ball its
             cross-section (radius √(r² − Δw²)), a bond the stretch of it within its radius of the hyperplane.
   Drag turns it in 3D (x and y against z) or through w (x and y against w). The orientation is a 4×4 matrix M,
   applied after each group's own matrix L[g] (about the group's centre).
   On a phone a viewer must not fight the page's scrolling, so a touch does nothing until the viewer is tapped: then
   it's live (outlined), takes every drag, and lets go on ✓, a tap elsewhere, or when it scrolls away. A mouse turns
   it directly. The reticle in the corner shows the four axes as they lie in the view now, as KATABASIS's does; tap an
   axis there (or its flip button) to swing it into w by a quarter turn, and ▣ squares the view up onto the axes.
   Several viewers in one .tiles host become one viewer with a tab for each (the option tab, or the title). */
import { ELEMENT } from "./polytopes.js";

const KATA = [255, 122, 217], MID = [233, 228, 218], ANA = [125, 255, 176];
const mixc = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));
export const wColour = (t) => (t < 0 ? mixc(MID, KATA, Math.min(1, -t)) : mixc(MID, ANA, Math.min(1, t)));

export const eye = () => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
/* M ← R(a, b; θ) M: turn the plane of axes a and b by θ, in the viewer's frame */
export function turn(M, a, b, th) {
  const c = Math.cos(th), s = Math.sin(th), out = M.slice();
  for (let k = 0; k < 4; k++) { const x = M[a * 4 + k], y = M[b * 4 + k]; out[a * 4 + k] = c * x - s * y; out[b * 4 + k] = s * x + c * y; }
  return out;
}
/* M ← M R: turn in the object's own frame */
export function turnLocal(M, a, b, th) {
  const c = Math.cos(th), s = Math.sin(th), out = M.slice();
  for (let r = 0; r < 4; r++) { const x = M[r * 4 + a], y = M[r * 4 + b]; out[r * 4 + a] = c * x + s * y; out[r * 4 + b] = -s * x + c * y; }
  return out;
}
export const apply = (M, p) => [0, 1, 2, 3].map((r) => M[r * 4] * p[0] + M[r * 4 + 1] * p[1] + M[r * 4 + 2] * p[2] + M[r * 4 + 3] * p[3]);
function orthonormal(M) { // Gram–Schmidt on the rows, against drift
  const rows = [0, 1, 2, 3].map((r) => M.slice(r * 4, r * 4 + 4)), out = [];
  for (let v of rows) { for (const b of out) { const d = v.reduce((s, x, i) => s + x * b[i], 0); v = v.map((x, i) => x - d * b[i]); } const n = Math.hypot(...v); out.push(v.map((x) => x / n)); }
  return out.flat();
}

/* tap-to-engage for touch: box holds the canvas cv (made position: relative); returns { live, allows(e), set } */
export function engageable(box, cv) {
  const E = { live: false }, coarse = typeof matchMedia === "function" && matchMedia("(pointer: coarse)").matches;
  const pill = document.createElement("button"); pill.type = "button"; pill.className = "pill"; box.appendChild(pill);
  E.set = (live) => { E.live = live; box.classList.toggle("live", live); cv.style.touchAction = live ? "none" : "pan-y pinch-zoom"; pill.textContent = live ? "✓ done" : "tap to turn"; pill.hidden = !coarse && !live; pill.classList.toggle("on", live); };
  E.allows = (e) => e.pointerType !== "touch" || E.live;
  pill.addEventListener("click", (e) => { e.stopPropagation(); E.set(!E.live); });
  let down = null;
  cv.addEventListener("pointerdown", (e) => { if (e.pointerType === "touch" && !E.live) down = { x: e.clientX, y: e.clientY, t: performance.now() }; });
  cv.addEventListener("pointerup", (e) => { if (down && Math.hypot(e.clientX - down.x, e.clientY - down.y) < 12 && performance.now() - down.t < 500) E.set(true); down = null; });
  document.addEventListener("pointerdown", (e) => { if (E.live && !box.contains(e.target)) E.set(false); });
  new IntersectionObserver(([en]) => { if (!en.isIntersecting && E.live) E.set(false); }).observe(cv);
  E.set(false);
  return E;
}
/* the four axes' colours, as in KATABASIS */
export const AXC = ["#ff8a7a", "#8ef0a0", "#7ab8ff", "#c79bff"];
const det4 = (M) => { const A = [0, 1, 2, 3].map((r) => M.slice(r * 4, r * 4 + 4)); let D = 1; for (let i = 0; i < 4; i++) { let p = i; for (let r = i + 1; r < 4; r++) if (Math.abs(A[r][i]) > Math.abs(A[p][i])) p = r; if (Math.abs(A[p][i]) < 1e-12) return 0; if (p !== i) { [A[p], A[i]] = [A[i], A[p]]; D = -D; } D *= A[i][i]; for (let r = i + 1; r < 4; r++) { const f = A[r][i] / A[i][i]; for (let c = i; c < 4; c++) A[r][c] -= f * A[i][c]; } } return D; };
/* the axis-aligned orientation nearest M (a signed permutation, with M's handedness) */
export function nearestSquare(M) {
  const cells = []; for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) cells.push([Math.abs(M[r * 4 + c]), r, c]);
  cells.sort((a, b) => b[0] - a[0]); const P = new Array(16).fill(0), ur = new Set(), uc = new Set(); let last = 0;
  for (const [, r, c] of cells) if (!ur.has(r) && !uc.has(c)) { P[r * 4 + c] = Math.sign(M[r * 4 + c]) || 1; ur.add(r); uc.add(c); last = r; }
  if (Math.sign(det4(P)) !== Math.sign(det4(M))) for (let c = 0; c < 4; c++) P[last * 4 + c] *= -1;
  return P;
}
/* several viewers in one host: one shown at a time, with a tab each */
function stackIn(host, el, label) {
  if (!host._stack) { const bar = document.createElement("div"); bar.className = "tabs"; host.prepend(bar); host._stack = { bar, els: [] }; }
  const st = host._stack, i = st.els.length, b = document.createElement("button"); b.type = "button"; b.textContent = label; st.bar.appendChild(b); st.els.push(el);
  const show = (k) => { st.els.forEach((x, j) => (x.hidden = j !== k)); [...st.bar.children].forEach((x, j) => x.classList.toggle("on", j === k)); };
  b.addEventListener("click", () => show(i));
  if (i === 0) show(0); else el.hidden = true;
  st.bar.hidden = st.els.length < 2;
}

/* options: spin, the idle turn, as [xw, yz] rates or a list of [a, b, rate] planes; step(T), run every frame while
   on screen (a simulation; it may change scene.P and the balls in place); overlay(g, w, h, T), drawn last;
   onTurn(a, b, θ), told of every turn of the view, the idle spin and drags included */
export function makeTile(host, scene, { title = "", sub = "", tab = "", start = eye(), spin = [0.0035, 0.0021], extras = [], R = 1.15, sliceRange = 1, step = null, overlay = null, onTurn = null } = {}) {
  const el = document.createElement("div"); el.className = "tile";
  el.innerHTML = `<div class="th"><b>${title}</b><span>${sub}</span></div><div class="cvw"><canvas></canvas></div>
    <div class="tc"><button type="button" data-m="turn" class="on">turn</button><button type="button" data-m="w">through w</button><button type="button" data-v="slice">slice</button>${extras.map((x, i) => `<button type="button" data-x="${i}">${x.label}</button>`).join("")}</div>
    <div class="tc flips"><span>flip into w</span>${"xyzw".split("").map((a, i) => `<button type="button" data-f="${i}" style="color:${AXC[i]}">${a}</button>`).join("")}<button type="button" data-q="1" title="square up onto the axes">▣ square up</button></div>
    <label class="hs" hidden>w = <input type="range" min="${-sliceRange}" max="${sliceRange}" step="0.005" value="0" /><output>0.00</output></label>`;
  host.appendChild(el);
  if (host.classList.contains("tiles") && !host.hasAttribute("data-all")) stackIn(host, el, tab || title.replace(/<[^>]+>/g, ""));
  const cv = el.querySelector("canvas"), slider = el.querySelector(".hs input"), out = el.querySelector(".hs output"), E = engageable(el.querySelector(".cvw"), cv);
  const planes = (sp) => (Array.isArray(sp[0]) ? sp : [[0, 3, sp[0]], [1, 2, sp[1]]]).filter((x) => x[2]);
  const T = { el, M: start.slice(), L: {}, mode: "turn", slice: false, h: 0, spin: planes(spin), spinning: planes(spin).length > 0, scene, draw: null };
  T.rot = (a, b, th) => { T.M = turn(T.M, a, b, th); if (onTurn) onTurn(a, b, th); };
  T.groupCentre = (g) => { const bs = scene.balls.filter((b) => (b.group || 0) === g); return [0, 1, 2, 3].map((k) => bs.reduce((s, b) => s + b.p[k], 0) / bs.length); };
  const world = (p, g) => { if (!T.L[g]) return apply(T.M, p); const c = T.groupCentre(g), q = apply(T.L[g], p.map((v, i) => v - c[i])); return apply(T.M, q.map((v, i) => v + c[i])); };

  function draw() {
    const dpr = Math.min(2, devicePixelRatio || 1), w = cv.clientWidth, h = cv.clientHeight;
    if (cv.width !== Math.round(w * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); }
    const g = cv.getContext("2d"); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, w, h);
    const S = (Math.min(w, h) * 0.6) / R, cx = w / 2, cy = h / 2;
    // 4D → 3D: a camera at w = 3R looking down −w (shadow only); 3D → 2D: a camera at z = 4R
    const to3 = (q) => (T.slice ? q : (() => { const k = (2.2 * R) / (3 * R - q[3]); return [q[0] * k, q[1] * k, q[2] * k, q[3]]; })());
    const to2 = (q) => { const k = (3.2 * R) / (4 * R - q[2]); return [cx + q[0] * k * S, cy - q[1] * k * S, k, q[2]]; };
    const P = (scene.P || []).map((p) => apply(T.M, p));
    const depthA = (z) => 0.35 + 0.65 * Math.min(1, Math.max(0, (z + R) / (2 * R)));
    const seg = (a, b, col, alpha, width, dash) => { const A = to2(a), B = to2(b); g.strokeStyle = `rgba(${col},${alpha})`; g.lineWidth = width; g.setLineDash(dash || []); g.beginPath(); g.moveTo(A[0], A[1]); g.lineTo(B[0], B[1]); g.stroke(); g.setLineDash([]); };
    if (!T.slice) {
      for (const [a, b] of scene.lines || []) { const A = to3(P[a]), B = to3(P[b]); seg(A, B, wColour((P[a][3] + P[b][3]) / (2 * R)), depthA((A[2] + B[2]) / 2) * 0.9, 1.3); }
      for (const [a, b] of scene.ghost || []) { const A = to3(world(scene.balls[a].p, scene.balls[a].group || 0)), B = to3(world(scene.balls[b].p, scene.balls[b].group || 0)); seg(A, B, "154,149,140", 0.45, 1, [3, 4]); }
    } else {
      for (const f of scene.faces || []) { // each face crossing w = h gives one edge of the slice
        const cut = [];
        for (let i = 0; i < f.length; i++) { const p = P[f[i]], q = P[f[(i + 1) % f.length]], da = p[3] - T.h, db = q[3] - T.h; if (da * db < 0 || (da === 0 && db !== 0)) { const t = da / (da - db); cut.push(p.map((v, k) => v + (q[k] - v) * t)); } }
        if (cut.length >= 2) seg(cut[0], cut[1], "233,228,218", depthA((cut[0][2] + cut[1][2]) / 2), 1.6);
      }
    }
    // atoms and bonds, far ones first
    const balls = (scene.balls || []).map((b) => ({ b, q: world(b.p, b.group || 0) }));
    const items = [];
    for (const [a, b] of scene.bonds || []) {
      const A = balls[a].q, B = balls[b].q, rb = 0.07;
      if (!T.slice) { const a3 = to3(A), b3 = to3(B); items.push({ z: (a3[2] + b3[2]) / 2 - 0.01, f: () => seg(a3, b3, wColour((A[3] + B[3]) / (2 * R)), 0.9, Math.max(1.5, 0.9 * to2(a3)[2] * rb * S)) }); continue; }
      // the stretch of the bond within rb of the hyperplane
      const d = B[3] - A[3]; let t0 = 0, t1 = 1;
      if (Math.abs(d) < 1e-9) { if (Math.abs(A[3] - T.h) > rb) continue; } else { const ta = (T.h - rb - A[3]) / d, tb = (T.h + rb - A[3]) / d; t0 = Math.max(0, Math.min(ta, tb)); t1 = Math.min(1, Math.max(ta, tb)); if (t0 >= t1) continue; }
      const p0 = A.map((v, k) => v + (B[k] - v) * t0), p1 = A.map((v, k) => v + (B[k] - v) * t1);
      items.push({ z: (p0[2] + p1[2]) / 2 - 0.01, f: () => seg(p0, p1, "233,228,218", 0.85, Math.max(1.5, 0.9 * to2(p0)[2] * rb * S)) });
    }
    for (const { b, q } of balls) {
      const e = ELEMENT[b.el] || {}, r0 = b.r || e.r || 0.2, col = b.c || e.c || "#e9e4da";
      let r = r0; if (T.slice) { const dw = q[3] - T.h; if (Math.abs(dw) >= r0) continue; r = Math.sqrt(r0 * r0 - dw * dw); }
      const q3 = to3(q), s2 = to2(q3), rad = r * s2[2] * S * (T.slice ? 1 : (2.2 * R) / (3 * R - q[3]));
      items.push({ z: q3[2], f: () => {
        const gr = g.createRadialGradient(s2[0] - rad * 0.35, s2[1] - rad * 0.35, rad * 0.1, s2[0], s2[1], rad);
        gr.addColorStop(0, "#ffffff"); gr.addColorStop(0.25, col); gr.addColorStop(1, "#05060a"); g.fillStyle = gr;
        g.beginPath(); g.arc(s2[0], s2[1], Math.max(1, rad), 0, 2 * Math.PI); g.fill();
        if (!T.slice) { g.strokeStyle = `rgba(${wColour(q[3] / R)},0.9)`; g.lineWidth = 1.5; g.stroke(); }
      } });
    }
    items.sort((a, b) => a.z - b.z).forEach((it) => it.f());
    if (T.slice) { g.fillStyle = "rgba(154,149,140,0.9)"; g.font = "10px ui-monospace, Menlo, monospace"; g.textAlign = "left"; g.fillText(`the 3D slice at w = ${T.h.toFixed(2)}`, 6, h - 6); }
    if (overlay) overlay(g, w, h, T);
    reticle(g, w, h);
  }
  /* the reticle, bottom right: each axis drawn where it points in the view, depth on a slant (into the screen is up
     and to the right) so z is a line too; an axis turned into w shrinks to the middle, and the dashed ring at its tip
     grows with how much of it is in w. Its tips are remembered for tapping */
  T.tips = [];
  function reticle(g, w, h) {
    const L = 30, c = [w - L - 22, h - L - 22], col = (a) => [0, 1, 2, 3].map((r) => T.M[r * 4 + a]);
    const pt = (v, k = 1) => { const f = -v[2] * 0.45; return [c[0] + (v[0] + 0.8 * f) * L * k, c[1] - (v[1] + 0.6 * f) * L * k]; };
    g.save(); g.lineCap = "round"; g.font = "600 10px ui-monospace, Menlo, monospace"; g.textAlign = "center"; g.textBaseline = "middle";
    g.globalAlpha = 0.5; g.fillStyle = "#05060a"; g.beginPath(); g.arc(c[0], c[1], L + 14, 0, 2 * Math.PI); g.fill();
    T.tips = [];
    for (const a of [0, 1, 2, 3].sort((p, q) => col(p)[2] - col(q)[2])) {
      const v = col(a), [x, y] = pt(v), [x2, y2] = pt(v, -0.45), ww = Math.abs(v[3]);
      g.globalAlpha = 0.35; g.strokeStyle = AXC[a]; g.lineWidth = 1; g.beginPath(); g.moveTo(c[0], c[1]); g.lineTo(x2, y2); g.stroke();
      g.globalAlpha = 0.9; g.lineWidth = 2; g.beginPath(); g.moveTo(c[0], c[1]); g.lineTo(x, y); g.stroke();
      if (ww > 0.08) { g.beginPath(); g.arc(x, y, 2 + 8 * ww, 0, 2 * Math.PI); g.setLineDash([2, 2]); g.stroke(); g.setLineDash([]); }
      const lx = x + (x - c[0]) * 0.35 + (Math.hypot(x - c[0], y - c[1]) < 6 ? 9 + 8 * ww : 0), ly = y + (y - c[1]) * 0.35;
      g.fillStyle = AXC[a]; g.fillText("xyzw"[a], lx, ly); T.tips.push([a, lx, ly]);
    }
    g.restore();
  }
  /* a quarter turn swinging axis a into w (or, if it's already there, out into depth); animated */
  T.flip = (a) => {
    if (T.anim) return; const col = [0, 1, 2, 3].map((r) => T.M[r * 4 + a]); let k = 0; for (let r = 1; r < 4; r++) if (Math.abs(col[r]) > Math.abs(col[k])) k = r;
    const [p, th] = k < 3 ? [k, (Math.PI / 2) * Math.sign(col[k] || 1)] : [2, -Math.PI / 2 * Math.sign(col[3] || 1)];
    T.spinning = false; let done = 0;
    T.animate(650, (t) => { const e = t * t * (3 - 2 * t); T.rot(p, 3, th * (e - done)); done = e; T.M = orthonormal(T.M); });
  };
  /* turn onto the nearest axis-aligned view */
  T.squareUp = () => { if (T.anim) return; const M0 = T.M.slice(), P = nearestSquare(M0); T.spinning = false; T.animate(650, (t) => { const e = t * t * (3 - 2 * t); T.M = t >= 1 ? P : orthonormal(M0.map((v, i) => v + (P[i] - v) * e)); }); };
  T.draw = draw;

  // turning: drag (a touch only once the viewer is live: see engageable); a tap on the reticle flips that axis
  let drag = null;
  cv.addEventListener("pointerdown", (e) => { if (!E.allows(e)) return; drag = { x: e.clientX, y: e.clientY, x0: e.clientX, y0: e.clientY, id: e.pointerId }; cv.setPointerCapture(e.pointerId); });
  cv.addEventListener("pointermove", (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const dx = (e.clientX - drag.x) * 0.012, dy = (e.clientY - drag.y) * 0.012; drag.x = e.clientX; drag.y = e.clientY;
    if (Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0) > 4) T.spinning = false;
    const k = T.mode === "w" ? 3 : 2; T.rot(0, k, dx); T.rot(1, k, -dy); T.M = orthonormal(T.M); draw();
  });
  const end = (e) => {
    if (drag && e.type === "pointerup" && Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0) < 8) {
      const r = cv.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
      let best = null; for (const [a, tx, ty] of T.tips) { const d = Math.hypot(x - tx, y - ty); if (d < 20 && (!best || d < best[1])) best = [a, d]; }
      if (best) T.flip(best[0]);
    }
    drag = null;
  };
  cv.addEventListener("pointerup", end); cv.addEventListener("pointercancel", end);
  el.querySelector(".tc").addEventListener("click", (e) => {
    const b = e.target.closest("button"); if (!b) return;
    if (b.dataset.m) { T.mode = b.dataset.m; el.querySelectorAll("[data-m]").forEach((x) => x.classList.toggle("on", x === b)); }
    if (b.dataset.v) { T.slice = !T.slice; b.classList.toggle("on", T.slice); el.querySelector(".hs").hidden = !T.slice; }
    if (b.dataset.x) extras[+b.dataset.x].onClick(T, b);
    draw();
  });
  el.querySelector(".flips").addEventListener("click", (e) => { const b = e.target.closest("button"); if (!b) return; if (b.dataset.f) T.flip(+b.dataset.f); if (b.dataset.q) T.squareUp(); });
  slider.addEventListener("input", () => { T.h = +slider.value; out.textContent = T.h.toFixed(2); draw(); });
  // a slow double rotation until it's touched, only while on screen
  let visible = false, raf = 0;
  const tick = () => {
    raf = 0; if (!visible) return;
    if (T.spinning) { for (const [a, b, r] of T.spin) T.rot(a, b, r); T.M = orthonormal(T.M); }
    if (step) step(T);
    if (T.spinning || step) draw();
    if (T.spinning || T.anim || step) raf = requestAnimationFrame(tick);
  };
  /* set the idle turn and start it */
  T.setSpin = (sp) => { T.spin = planes(sp); T.spinning = T.spin.length > 0; T.wake(); };
  T.wake = () => { if (!raf && visible) raf = requestAnimationFrame(tick); };
  new IntersectionObserver(([en]) => { visible = en.isIntersecting; if (visible) { draw(); T.wake(); } }).observe(cv);
  /* run f(t) for t from 0 to 1 over ms, redrawing */
  T.animate = (ms, f) => { const t0 = performance.now(); T.anim = true; const step = (now) => { const t = Math.min(1, (now - t0) / ms); f(t); draw(); if (t < 1) requestAnimationFrame(step); else T.anim = false; }; requestAnimationFrame(step); };
  return T;
}

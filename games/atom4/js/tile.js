/* ATOM⁴'s tile: one small 4D viewer, many to a page, the seed of a 4D molecular-dynamics view. A scene is
     { lines: [[a, b]], faces: [[i…]], balls: [{ p, el | c, r, group }], bonds: [[a, b]], ghost: [[a, b]], P: [4-vectors] }
   (lines, faces and ghost index P; balls carry their own points, bonds index balls). Two views:
     shadow: everything, w folded in by perspective (a camera off along w), coloured by w: kata pink, ana green.
     slice:  what a 3D creature at w = h sees. Faces crossing the hyperplane give the slice's edges, a ball its
             cross-section (radius √(r² − Δw²)), a bond the stretch of it within its radius of the hyperplane.
   Drag turns it in 3D (x and y against z) or through w (x and y against w). The orientation is a 4×4 matrix M,
   applied after each group's own matrix L[g] (about the group's centre) */
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

export function makeTile(host, scene, { title = "", sub = "", start = eye(), spin = [0.0035, 0.0021], extras = [], R = 1.15, sliceRange = 1 } = {}) {
  const el = document.createElement("div"); el.className = "tile";
  el.innerHTML = `<div class="th"><b>${title}</b><span>${sub}</span></div><canvas></canvas>
    <div class="tc"><button type="button" data-m="turn" class="on">turn</button><button type="button" data-m="w">through w</button><button type="button" data-v="slice">slice</button>${extras.map((x, i) => `<button type="button" data-x="${i}">${x.label}</button>`).join("")}</div>
    <label class="hs" hidden>w = <input type="range" min="${-sliceRange}" max="${sliceRange}" step="0.005" value="0" /><output>0.00</output></label>`;
  host.appendChild(el);
  const cv = el.querySelector("canvas"), slider = el.querySelector(".hs input"), out = el.querySelector(".hs output");
  const T = { el, M: start.slice(), L: {}, mode: "turn", slice: false, h: 0, spinning: true, scene, draw: null };
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
    if (T.slice) { g.fillStyle = "rgba(154,149,140,0.9)"; g.font = "10px ui-monospace, Menlo, monospace"; g.fillText(`the 3D slice at w = ${T.h.toFixed(2)}`, 6, h - 6); }
  }
  T.draw = draw;

  // turning: drag (a touch's vertical drag scrolls the page, so a finger turns by its sideways drag only)
  let drag = null;
  cv.addEventListener("pointerdown", (e) => { drag = { x: e.clientX, y: e.clientY, id: e.pointerId, touch: e.pointerType === "touch" }; T.spinning = false; cv.setPointerCapture(e.pointerId); });
  cv.addEventListener("pointermove", (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const dx = (e.clientX - drag.x) * 0.012, dy = drag.touch ? 0 : (e.clientY - drag.y) * 0.012; drag.x = e.clientX; drag.y = e.clientY;
    const k = T.mode === "w" ? 3 : 2; T.M = orthonormal(turn(turn(T.M, 0, k, dx), 1, k, -dy)); draw();
  });
  const end = () => { drag = null; }; cv.addEventListener("pointerup", end); cv.addEventListener("pointercancel", end);
  el.querySelector(".tc").addEventListener("click", (e) => {
    const b = e.target.closest("button"); if (!b) return;
    if (b.dataset.m) { T.mode = b.dataset.m; el.querySelectorAll("[data-m]").forEach((x) => x.classList.toggle("on", x === b)); }
    if (b.dataset.v) { T.slice = !T.slice; b.classList.toggle("on", T.slice); el.querySelector(".hs").hidden = !T.slice; }
    if (b.dataset.x) extras[+b.dataset.x].onClick(T, b);
    draw();
  });
  slider.addEventListener("input", () => { T.h = +slider.value; out.textContent = T.h.toFixed(2); draw(); });
  // a slow double rotation until it's touched, only while on screen
  let visible = false, raf = 0;
  const tick = () => { raf = 0; if (!visible) return; if (T.spinning) { T.M = orthonormal(turn(turn(T.M, 0, 3, spin[0]), 1, 2, spin[1])); draw(); } if (T.spinning || T.anim) raf = requestAnimationFrame(tick); };
  T.wake = () => { if (!raf && visible) raf = requestAnimationFrame(tick); };
  new IntersectionObserver(([en]) => { visible = en.isIntersecting; if (visible) { draw(); T.wake(); } }).observe(cv);
  /* run f(t) for t from 0 to 1 over ms, redrawing */
  T.animate = (ms, f) => { const t0 = performance.now(); T.anim = true; const step = (now) => { const t = Math.min(1, (now - t0) / ms); f(t); draw(); if (t < 1) requestAnimationFrame(step); else T.anim = false; }; requestAnimationFrame(step); };
  return T;
}

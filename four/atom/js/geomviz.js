/* The geometry chapter's toys: a cube and a tesseract to turn and slice, a tesseract turning in two planes at once, a
   tesseract passing through our space corner first, the Hopf circles that comb the 3-sphere and the flat Clifford
   torus, both projected into our space. The geometry is js/geometry.js; this only draws. */
import { makeTile, eye, turn, engageable } from "./tile.js";
import { polytopes } from "./polytopes.js";
import { hopfCircle, stereo, clifford } from "./geometry.js";

const $ = (id) => document.getElementById(id);
export const geoTiles = [];

export function buildGeometry() {
  const host = $("geoTiles");
  if (host) {
    const T = polytopes().find((p) => p.key === "8"), s = 1 / Math.sqrt(3);
    const cubeV = [], cubeE = [];
    for (let i = 0; i < 8; i++) cubeV.push([(i & 1 ? 1 : -1) * s, (i & 2 ? 1 : -1) * s, (i & 4 ? 1 : -1) * s, 0]);
    for (let i = 0; i < 8; i++) for (let b = 0; b < 3; b++) if (!(i & (1 << b))) cubeE.push([i, i | (1 << b)]);
    const cubeF = [[0, 1, 3, 2], [4, 5, 7, 6], [0, 1, 5, 4], [2, 3, 7, 6], [0, 2, 6, 4], [1, 3, 7, 5]];
    const tilt = turn(turn(eye(), 0, 2, 0.5), 1, 2, 0.35);
    geoTiles.push(makeTile(host, { P: cubeV, lines: cubeE, faces: cubeF }, { tab: "cube · 3D", title: "a cube", sub: "8 corners · 12 edges · 6 squares. It has no depth in w: slice it anywhere but w = 0 and it's gone", start: tilt, spin: [0, 0.004] }));
    geoTiles.push(makeTile(host, { P: T.V, lines: T.E, faces: T.F }, { tab: "tesseract · 4D", title: "a tesseract", sub: `${T.V.length} corners · ${T.E.length} edges · ${T.F.length} squares · ${T.C.length} cubes. Its shadow is a cube in a cube; its slice, a cube that grows and shrinks`, start: turn(tilt, 0, 3, 0.4) }));
    geoTiles.push(makeTile(host, { P: T.V, lines: T.E, faces: T.F }, { tab: "two planes at once", title: "turning in two planes at once", sub: "xy and zw at the same rate: no line stays put, and every corner runs round a great circle", start: tilt, spin: [[0, 1, 0.006], [2, 3, 0.006]] }));
  }
  const sh = $("sliceTiles");
  if (sh) {
    const T = polytopes().find((p) => p.key === "8"), a = [0.5, 0.5, 0.5, 0.5];
    // a reflection taking the long diagonal a to w, so the tesseract meets our space corner first
    const u = [-a[0], -a[1], -a[2], 1 - a[3]], nu = Math.hypot(...u), H = [];
    for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) H.push((i === j ? 1 : 0) - (2 * u[i] * u[j]) / (nu * nu));
    const sweep = { label: "sweep through w", onClick: (t) => { const sl = t.el.querySelector(".hs input"), out = t.el.querySelector(".hs output"); t.animate(7000, (f) => { t.h = -1 + 2 * f; sl.value = t.h; out.textContent = t.h.toFixed(2); }); } };
    const slice = (title, sub, start, h0) => { const t = makeTile(sh, { P: T.V, lines: T.E, faces: T.F }, { tab: title, title, sub, start, spin: [], extras: [sweep] }); t.el.querySelector('[data-v="slice"]').click(); t.h = h0; const sl = t.el.querySelector(".hs input"); sl.value = t.h; t.el.querySelector(".hs output").textContent = t.h.toFixed(2); t.draw(); geoTiles.push(t); };
    slice("corner first", "a point, a tetrahedron, a truncated tetrahedron, an octahedron at the middle, and back", turn(turn(H, 0, 2, 0.3), 1, 2, 0.4), -0.75);
    slice("cube first", "a cube appears whole, stays the same all the way through, and vanishes whole", turn(turn(eye(), 0, 2, 0.5), 1, 2, 0.35), 0);
  }
  const cv = $("cHopf"); if (cv) hopf(cv);
  const cc = $("cClifford"); if (cc) cliffordView(cc);
}

/* the Clifford torus: its grid of a and b circles, and two of its diagonals, which are Hopf circles */
function cliffordView(cv) {
  const curves = [], n = 18, grid = [233, 228, 218];
  for (let k = 0; k < n; k++) { const t = (2 * Math.PI * k) / n; curves.push({ pts: Array.from({ length: 121 }, (_, i) => stereo(clifford(t, (2 * Math.PI * i) / 120))), c: grid, a: 0.35 }); curves.push({ pts: Array.from({ length: 121 }, (_, i) => stereo(clifford((2 * Math.PI * i) / 120, t))), c: grid, a: 0.35 }); }
  for (const [off, c] of [[0, [255, 122, 217]], [Math.PI, [125, 255, 176]]]) curves.push({ pts: Array.from({ length: 241 }, (_, i) => { const s = (2 * Math.PI * i) / 240; return stereo(clifford(s, s + off)); }), c, a: 1, w: 2.6 });
  curvesView(cv, curves, 5.6);
}

/* Hopf's circles: a few tori of them, each torus the circles at one η, projected stereographically. Drag to turn */
function hopf(cv) {
  const tori = [[0, 1, [255, 122, 217]], [0.3, 8, [255, 209, 102]], [0.6, 12, [125, 255, 176]], [0.88, 12, [111, 224, 255]]], circles = [];
  for (const [eta, n, c] of tori) for (let k = 0; k < n; k++) circles.push({ pts: hopfCircle(eta, 0, (2 * Math.PI * k) / n, 160).map(stereo), c });
  curvesView(cv, circles, 5.2);
}
/* curves in our space, drawn far to near with depth shading, turning slowly while on screen; drag to turn */
function curvesView(cv, curves, fit) {
  let yaw = 0.6, pitch = 0.45, drag = null, visible = false, last = 0;
  const wrap = document.createElement("div"); wrap.className = "cvw"; cv.replaceWith(wrap); wrap.appendChild(cv); const E = engageable(wrap, cv);
  const draw = () => {
    const dpr = Math.min(2, devicePixelRatio || 1), w = cv.clientWidth, h = cv.clientHeight;
    if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); }
    const g = cv.getContext("2d"); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, w, h);
    const cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch), S = Math.min(w, h) / fit;
    const view = ([x, y, z]) => { const x1 = cy * x + sy * y, y1 = -sy * x + cy * y, y2 = cp * y1 - sp * z, z2 = sp * y1 + cp * z; return [w / 2 + S * x1, h / 2 - S * z2, y2]; };
    const segs = [];
    for (const C of curves) { const q = C.pts.map(view); for (let i = 0; i + 1 < q.length; i++) if (Math.abs(q[i][0] - w / 2) < 3 * w && Math.abs(q[i + 1][0] - w / 2) < 3 * w) segs.push([q[i], q[i + 1], C]); }
    segs.sort((a, b) => b[0][2] + b[1][2] - a[0][2] - a[1][2]); // far first
    for (const [a, b, C] of segs) { const depth = Math.max(0.25, Math.min(1, 0.65 - 0.12 * (a[2] + b[2]))) * (C.a ?? 1); g.lineWidth = C.w ?? 1.6; g.strokeStyle = `rgba(${C.c[0]},${C.c[1]},${C.c[2]},${depth.toFixed(2)})`; g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.stroke(); }
  };
  const loop = (t) => { if (!visible) return; if (!drag) yaw += Math.min(50, t - (last || t)) * 0.00015; last = t; draw(); requestAnimationFrame(loop); };
  new IntersectionObserver(([e]) => { const was = visible; visible = e.isIntersecting; if (visible && !was) { last = 0; requestAnimationFrame(loop); } }).observe(cv);
  cv.addEventListener("pointerdown", (e) => { if (!E.allows(e)) return; drag = [e.clientX, e.clientY, yaw, pitch]; cv.setPointerCapture(e.pointerId); });
  cv.addEventListener("pointermove", (e) => { if (!drag) return; yaw = drag[2] + (e.clientX - drag[0]) * 0.01; pitch = Math.max(-1.4, Math.min(1.4, drag[3] + (e.clientY - drag[1]) * 0.01)); });
  const up = () => { drag = null; }; cv.addEventListener("pointerup", up); cv.addEventListener("pointercancel", up);
  draw();
}

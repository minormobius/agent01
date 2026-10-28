/* Chapter 1's toys: a cube and a tesseract to turn and slice, a tesseract turning in two planes at once, and the Hopf
   circles that comb the 3-sphere, projected into our space. The geometry is js/geometry.js; this only draws. */
import { makeTile, eye, turn } from "./tile.js";
import { polytopes } from "./polytopes.js";
import { hopfCircle, stereo } from "./geometry.js";

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
    geoTiles.push(makeTile(host, { P: cubeV, lines: cubeE, faces: cubeF }, { title: "a cube", sub: "8 corners · 12 edges · 6 squares. It has no depth in w: slice it anywhere but w = 0 and it's gone", start: tilt, spin: [0, 0.004] }));
    geoTiles.push(makeTile(host, { P: T.V, lines: T.E, faces: T.F }, { title: "a tesseract", sub: `${T.V.length} corners · ${T.E.length} edges · ${T.F.length} squares · ${T.C.length} cubes. Its shadow is a cube in a cube; its slice, a cube that grows and shrinks`, start: turn(tilt, 0, 3, 0.4) }));
    geoTiles.push(makeTile(host, { P: T.V, lines: T.E, faces: T.F }, { title: "turning in two planes at once", sub: "xy and zw at the same rate: no line stays put, and every corner runs round a great circle", start: tilt, spin: [[0, 1, 0.006], [2, 3, 0.006]] }));
  }
  const cv = $("cHopf"); if (cv) hopf(cv);
}

/* Hopf's circles: a few tori of them, each torus the circles at one η, projected stereographically. Drag to turn */
function hopf(cv) {
  const tori = [[0, 1, [255, 122, 217]], [0.3, 8, [255, 209, 102]], [0.6, 12, [125, 255, 176]], [0.88, 12, [111, 224, 255]]], circles = [];
  for (const [eta, n, c] of tori) for (let k = 0; k < n; k++) circles.push({ pts: hopfCircle(eta, 0, (2 * Math.PI * k) / n, 160).map(stereo), c });
  let yaw = 0.6, pitch = 0.45, drag = null, visible = false, last = 0;
  const draw = () => {
    const dpr = Math.min(2, devicePixelRatio || 1), w = cv.clientWidth, h = cv.clientHeight;
    if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); }
    const g = cv.getContext("2d"); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, w, h);
    const cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch), S = Math.min(w, h) / 5.2;
    const view = ([x, y, z]) => { const x1 = cy * x + sy * y, y1 = -sy * x + cy * y, y2 = cp * y1 - sp * z, z2 = sp * y1 + cp * z; return [w / 2 + S * x1, h / 2 - S * z2, y2]; };
    const segs = [];
    for (const C of circles) { const q = C.pts.map(view); for (let i = 0; i + 1 < q.length; i++) if (Math.abs(q[i][0] - w / 2) < 3 * w && Math.abs(q[i + 1][0] - w / 2) < 3 * w) segs.push([q[i], q[i + 1], C.c]); }
    segs.sort((a, b) => b[0][2] + b[1][2] - a[0][2] - a[1][2]); // far first
    g.lineWidth = 1.6;
    for (const [a, b, c] of segs) { const depth = Math.max(0.25, Math.min(1, 0.65 - 0.12 * (a[2] + b[2]))); g.strokeStyle = `rgba(${c[0]},${c[1]},${c[2]},${depth.toFixed(2)})`; g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.stroke(); }
  };
  const loop = (t) => { if (!visible) return; if (!drag) yaw += Math.min(50, t - (last || t)) * 0.00015; last = t; draw(); requestAnimationFrame(loop); };
  new IntersectionObserver(([e]) => { const was = visible; visible = e.isIntersecting; if (visible && !was) { last = 0; requestAnimationFrame(loop); } }).observe(cv);
  cv.addEventListener("pointerdown", (e) => { drag = [e.clientX, e.clientY, yaw, pitch]; cv.setPointerCapture(e.pointerId); });
  cv.addEventListener("pointermove", (e) => { if (!drag) return; yaw = drag[2] + (e.clientX - drag[0]) * 0.01; pitch = Math.max(-1.4, Math.min(1.4, drag[3] + (e.clientY - drag[1]) * 0.01)); });
  const up = () => { drag = null; }; cv.addEventListener("pointerup", up); cv.addEventListener("pointercancel", up);
  draw();
}

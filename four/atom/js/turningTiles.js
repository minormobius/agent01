/* ATOM⁴ — the motion chapter's tiles: how 4D turns (and what an electron's spin makes of it), an orbit under the
   pinned force against Gauss's, a free 4D body tumbling, and the three twists about one bond. Physics: ./turning.js */
import { makeTile, eye, turn } from "./tile.js";
import { polytopes, simplex } from "./polytopes.js";
import * as R from "./turning.js";

const $ = (id) => document.getElementById(id);
export const tiles = [];

/* rotate 3-vector v by the rotation vector a (Rodrigues) */
function rot3(v, a) {
  const th = Math.hypot(...a); if (th < 1e-12) return v;
  const k = a.map((x) => x / th), c = Math.cos(th), s = Math.sin(th), kv = k[0] * v[0] + k[1] * v[1] + k[2] * v[2];
  const cr = [k[1] * v[2] - k[2] * v[1], k[2] * v[0] - k[0] * v[2], k[0] * v[1] - k[1] * v[0]];
  return v.map((x, i) => x * c + cr[i] * s + k[i] * kv * (1 - c));
}
/* 4×4 helpers for the tumbling body */
const mul4 = (A, B) => A.map((r) => B[0].map((_, j) => r.reduce((s, v, k) => s + v * B[k][j], 0)));
function inv4(M) { const n = 4, A = M.map((r, i) => [...r, ...[0, 1, 2, 3].map((j) => (i === j ? 1 : 0))]); for (let c = 0; c < n; c++) { let p = c; for (let r = c + 1; r < n; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r; [A[p], A[c]] = [A[c], A[p]]; const d = A[c][c]; A[c] = A[c].map((v) => v / d); for (let r = 0; r < n; r++) if (r !== c) { const f = A[r][c]; A[r] = A[r].map((v, k) => v - f * A[c][k]); } } return A.map((r) => r.slice(n)); }
/* exp(Ω dt) by the Cayley transform: exactly orthogonal */
const cayley = (W, dt) => { const I = [0, 1, 2, 3].map((i) => [0, 1, 2, 3].map((j) => (i === j ? 1 : 0))), P = I.map((r, i) => r.map((v, j) => v + (W[i][j] * dt) / 2)), Q = I.map((r, i) => r.map((v, j) => v - (W[i][j] * dt) / 2)); return mul4(inv4(Q), P); };

export function buildTurning() {
  const host = $("turnTiles"); if (!host) return;
  const tess = polytopes()[1];

  // 1 · how 4D turns, and the spin needle
  // a frame's turns arrive plane by plane: sum them first, so a right-isoclinic frame's halves cancel before counting
  let needle = [0.6, 0.8, 0], spinDeg = 0, ignoredDeg = 0, pendL = [0, 0, 0], pendR = [0, 0, 0];
  const spinTile = makeTile(host, { P: tess.V, lines: tess.E, faces: tess.F }, {
    tab: "turning", title: "how 4D turns", sub: "two perpendicular planes at once; the needle is an electron's spin", start: turn(turn(eye(), 0, 2, 0.4), 1, 2, 0.3), spin: [[0, 1, 0.012]],
    onTurn: (a, b, th) => { const c = [0, 0, 0, 0, 0, 0]; c[R.PLANES.findIndex(([x, y]) => x === a && y === b)] = th; const W = R.bivector(c); R.leftVector(W).forEach((v, i) => (pendL[i] += v)); R.rightVector(W).forEach((v, i) => (pendR[i] += v)); },
    overlay: (g, w) => {
      needle = rot3(needle, pendL); spinDeg += (Math.hypot(...pendL) * 180) / Math.PI; ignoredDeg += (Math.hypot(...pendR) * 180) / Math.PI; pendL = [0, 0, 0]; pendR = [0, 0, 0];
      const cx = w - 34, cy = 34, r = 24; g.strokeStyle = "rgba(154,149,140,0.6)"; g.lineWidth = 1; g.beginPath(); g.arc(cx, cy, r, 0, 2 * Math.PI); g.stroke();
      g.strokeStyle = needle[2] >= 0 ? "#ffd27a" : "rgba(255,210,122,0.5)"; g.lineWidth = 2.5; g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + needle[0] * r, cy - needle[1] * r); g.stroke();
      g.fillStyle = "rgba(154,149,140,0.95)"; g.font = "10px ui-monospace, Menlo, monospace"; g.textAlign = "left";
      g.fillText(`spin turned ${spinDeg.toFixed(0)}°`, 6, 14); g.fillText(`right half, ignored ${ignoredDeg.toFixed(0)}°`, 6, 27);
    },
    extras: [
      { label: "simple", onClick: (T) => T.setSpin([[0, 1, 0.012]]) },
      { label: "double", onClick: (T) => T.setSpin([[0, 1, 0.012], [2, 3, 0.005]]) },
      { label: "left isoclinic", onClick: (T) => T.setSpin([[0, 1, 0.009], [2, 3, 0.009]]) },
      { label: "right isoclinic", onClick: (T) => T.setSpin([[0, 1, 0.009], [2, 3, -0.009]]) },
    ],
  });
  tiles.push(spinTile);

  // 2 · an orbit: pinned 1/r (closed ellipse in one plane) or Gauss's 1/r³ force (no stable orbit)
  const N = 360, start = () => { const x = [1, 0.2, -0.3, 0.4], r = Math.hypot(...x), u = x.map((v) => v / r), t = [0.1, 0.8, 0.3, -0.2], d = t.reduce((s, v, i) => s + v * u[i], 0), tp = t.map((v, i) => v - d * u[i]), tn = Math.hypot(...tp); return { u, tp: tp.map((v) => v / tn), r }; };
  const orb = { q: 2, s: null, trail: [] };
  const reset = () => { const { u, tp, r } = start(), vc = orb.q === 2 ? 1 / Math.sqrt(r) : 1 / r; orb.s = { x: u.map((v) => v * r), v: tp.map((v) => v * vc * 1.12) }; orb.trail = []; };
  reset();
  const orbitScene = { balls: [{ p: [0, 0, 0, 0], c: "#ffd27a", r: 0.13 }, { p: orb.s.x, c: "#6fe0ff", r: 0.07 }], P: [], lines: [] };
  tiles.push(makeTile(host, orbitScene, {
    tab: "an orbit", title: "an orbit", sub: "a planet round a star, in a plane tilted through all four directions", R: 2.1, start: turn(eye(), 1, 2, 0.4), spin: [[0, 3, 0.002]],
    step: () => {
      for (let k = 0; k < 6; k++) orb.s = R.orbitStep(orb.s, 0.004, orb.q);
      const r = Math.hypot(...orb.s.x); if (r > 3 || r < 0.08) reset();
      orb.trail.push(orb.s.x.slice()); if (orb.trail.length > N) orb.trail.shift();
      orbitScene.balls[1].p = orb.s.x; orbitScene.P = orb.trail; orbitScene.lines = orb.trail.slice(1).map((_, i) => [i, i + 1]);
    },
    extras: [
      { label: "Gauss's 1/r³ force", onClick: (T, b) => { orb.q = orb.q === 2 ? 3 : 2; b.textContent = orb.q === 2 ? "Gauss's 1/r³ force" : "the pinned 1/r²"; reset(); } },
      { label: "restart", onClick: () => reset() },
    ],
  }));

  // 3 · a free 4D box tumbling (Euler's equations, six components)
  const side = [1.5, 1.05, 0.75, 0.45], j = side.map((s) => s * s), body = { R: eye4(), M: null };
  const kick = (c) => { body.M = R.bivector(c); body.R = eye4(); };
  kick([0.02, 0.0, 0.0, 1.0, 0.0, 0.02]);
  const boxV = tess.V.map((v) => v.map((x, i) => (x * 2 * side[i]) / 2)), boxScene = { P: boxV.slice(), lines: tess.E, faces: tess.F };
  tiles.push(makeTile(host, boxScene, {
    tab: "tumbling", title: "a box tumbling", sub: "no forces at all: angular momentum and energy kept, the turn never settles", R: 1.6, start: turn(turn(eye(), 0, 2, 0.5), 1, 2, 0.3), spin: [0, 0],
    step: () => {
      for (let k = 0; k < 4; k++) { const W = R.omegaOf(body.M, j); body.R = mul4(body.R, cayley(W, 0.01)); body.M = R.bodyStep(body.M, j, 0.01); }
      boxScene.P = boxV.map((v) => [0, 1, 2, 3].map((r) => body.R[r].reduce((s, x, k) => s + x * v[k], 0)));
    },
    extras: [
      { label: "one plane, nudged", onClick: () => kick([0.02, 0.0, 0.0, 1.0, 0.0, 0.02]) },
      { label: "two planes", onClick: () => kick([0.6, 0, 0.05, 0, 0, 0.6]) },
      { label: "anyhow", onClick: () => kick([0.5, -0.3, 0.4, 0.2, 0.6, -0.4]) },
    ],
  }));

  // 4 · D₂H₈: three ways to twist about one bond
  tiles.push(makeTile(host, ethaneD(), {
    tab: "twists", title: "D₂H₈: three twists", sub: "fix the bond's line and what's left turns in three planes: each end's four hydrogens turn against the other's", R: 1.8, start: turn(turn(eye(), 1, 2, 0.4), 0, 2, 0.6), spin: [0, 0.002],
    extras: [[1, 2, "twist yz"], [1, 3, "twist yw"], [2, 3, "twist zw"]].map(([a, b, label]) => ({ label, onClick: (T) => { const L0 = T.L[1] || eye(); T.animate(900, (t) => { T.L[1] = turn(L0, a, b, (Math.PI / 3) * t); }); } })),
  }));
}
function eye4() { return [0, 1, 2, 3].map((i) => [0, 1, 2, 3].map((k) => (i === k ? 1 : 0))); }

/* D₂H₈ with its bond along x: the simplex turned so its first corner is x */
function ethaneD() {
  const e = simplex(4), basis = [e[0]];
  for (const v of [[1, 0, 0, 0], [0, 1, 0, 0], [0, 0, 1, 0], [0, 0, 0, 1]]) { let u = v.slice(); for (const b of basis) { const d = u.reduce((s, x, i) => s + x * b[i], 0); u = u.map((x, i) => x - d * b[i]); } const n = Math.hypot(...u); if (n > 1e-6 && basis.length < 4) basis.push(u.map((x) => x / n)); }
  const loc = (v) => basis.map((b) => b.reduce((s, x, i) => s + x * v[i], 0)), E = e.map(loc), h = 0.8;
  const balls = [{ p: [0, 0, 0, 0], el: "D", group: 0 }, { p: E[0], el: "D", group: 1 }], bonds = [[0, 1]];
  for (let i = 1; i <= 4; i++) { balls.push({ p: E[i].map((x) => x * h), el: "H", group: 0 }); bonds.push([0, balls.length - 1]); }
  for (let i = 1; i <= 4; i++) { balls.push({ p: E[0].map((x, k) => x - E[i][k] * h), el: "H", group: 1 }); bonds.push([1, balls.length - 1]); }
  return { balls, bonds };
}

/* Molt — what the player sees.

   PLAYING: the surface round the head, UNFOLDED flat, the way a cube's net
   lies flat: the head's face in the middle, its neighbours laid out across
   the edges they share, theirs beyond, out to the edge of the screen. On a
   straight stretch that's the whole tube unrolled round you; where the world
   curves the net can't lie flat, and shows it: a 90° gap opens at the
   outside of a bend (three squares meet there, as at a cube's corner), and a
   face that would overlap at the inside (five meet) is left for when you get
   there. The net is re-laid every time the head crosses onto another face,
   keeping its orientation (that's parallel transport over a fold), so a
   direction on screen means the same thing on both sides of it: classic
   snake controls on a world full of corners.

   MOLTING: the whole new world in 3D (it's the shape of the body you just
   left), then down onto your head, where the net takes over. */
import { cellPoint, faceNormal } from "./duct.js";

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]], add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul = (a, s) => [a[0] * s, a[1] * s, a[2] * s], dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a) => { const m = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / m, a[1] / m, a[2] / m]; };
const lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const n2 = (v) => { const m = Math.hypot(v[0], v[1]) || 1; return [v[0] / m, v[1] / m]; };
const rotP = (v) => [-v[1], v[0]], rotM = (v) => [v[1], -v[0]];
const at = (pl, x) => [pl.o[0] + x[0] * pl.ex[0] + x[1] * pl.ey[0], pl.o[1] + x[0] * pl.ex[1] + x[1] * pl.ey[1]];
const edgePt = (s, a) => (s === 0 ? [1, a] : s === 1 ? [a, 1] : s === 2 ? [0, a] : [a, 0]);
export const V_ = { CELL: 42, LEAD: 1.2, TAU: 70, DIST: 3.3 };
const LIGHT = norm([0.35, -0.45, 0.82]);

export class View {
  constructor(canvas) { this.cv = canvas; this.ctx = canvas.getContext("2d"); this.zoom = 1; this.mix = 0; this.resize(); }
  resize() {
    const r = this.cv.getBoundingClientRect(); this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.w = r.width; this.h = r.height; this.cv.width = Math.round(this.w * this.dpr); this.cv.height = Math.round(this.h * this.dpr);
    this.focal = Math.min(this.w, this.h) * 0.95;
    this.cell = Math.max(30, Math.min(54, Math.min(this.w, this.h) / 9.5));
  }

  setWorld(M, game) {
    this.M = M;
    const C = M.C;
    this.faces = M.faces.map((F, f) => {
      const n = faceNormal(F), grid = [];
      for (let i = 0; i <= C; i++) for (let j = 0; j <= C; j++) grid.push(cellPoint(M, f * C * C, i, j));
      return { F, f, n, grid, center: cellPoint(M, f * C * C, C / 2, C / 2), t: M.L > 1 ? F.k / (M.L - 1) : 0, light: 0.42 + 0.58 * Math.max(0, dot(n, LIGHT)) };
    });
    this.centers = new Array(M.N);
    for (let c = 0; c < M.N; c++) this.centers[c] = cellPoint(M, c, 0.5, 0.5);
    const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
    for (const fc of this.faces) for (const p of fc.grid) for (let a = 0; a < 3; a++) { lo[a] = Math.min(lo[a], p[a]); hi[a] = Math.max(hi[a], p[a]); }
    const mid = lerp(lo, hi, 0.5), ext = Math.max(hi[0] - lo[0], hi[1] - lo[1], 1.5) / 2, D = (ext / (0.5 * Math.min(this.w, this.h) / this.focal)) * 1.25;
    this.over = { eye: add(mid, [0, -D * 0.38, D * 0.95]), target: mid, up: [0, 1, 0] };
    if (game) this.reframe(game);
  }

  /* ---- the net */
  unfold(A, f, s) {
    const M = this.M, s2 = M.fs[f * 4 + s], fl = M.flip[f * 4 + s];
    const P0 = at(A, edgePt(s, fl ? 1 : 0)), P1 = at(A, edgePt(s, fl ? 0 : 1)), v = n2([P1[0] - P0[0], P1[1] - P0[1]]);
    let ex, ey;
    if (s2 % 2 === 0) { ey = v; ex = rotM(ey); } else { ex = v; ey = rotP(ex); }
    const e0 = edgePt(s2, 0);
    return { o: [P0[0] - e0[0] * ex[0] - e0[1] * ey[0], P0[1] - e0[0] * ex[1] - e0[1] * ey[1]], ex, ey };
  }
  /* lay the faces out from the root, nearest first, until they're off screen; a face that would land on one
     already laid (the inside of a bend) waits until you're nearer */
  layout(root, ex, ey) {
    const M = this.M, R = Math.hypot(this.w, this.h) / (2 * this.cell * M.C) + 1.2;
    const pl = new Map(), order = [], centers = [];
    const first = { o: [-0.5 * ex[0] - 0.5 * ey[0], -0.5 * ex[1] - 0.5 * ey[1]], ex, ey };
    pl.set(root, first); order.push(root); centers.push([0, 0]);
    for (let q = 0; q < order.length; q++) {
      const f = order[q], A = pl.get(f);
      for (let s = 0; s < 4; s++) {
        const g = M.fn[f * 4 + s];
        if (pl.has(g)) continue;
        const B = this.unfold(A, f, s), c = at(B, [0.5, 0.5]);
        if (Math.hypot(c[0], c[1]) > R) continue;
        if (centers.some((d) => Math.hypot(d[0] - c[0], d[1] - c[1]) < 0.7)) continue;
        pl.set(g, B); order.push(g); centers.push(c);
      }
    }
    this.root = root; this.place = pl; this.order = order;
  }
  cellAt(c) {
    const M = this.M, C = M.C, f = (c / (C * C)) | 0, pl = this.place.get(f);
    if (!pl) return null;
    const i = ((c % (C * C)) / C) | 0, j = c % C;
    return at(pl, [(i + 0.5) / C, (j + 0.5) / C]);
  }
  /* a new world (or the start): the head's face at the middle, turned so the way ahead is up the screen */
  reframe(g) {
    const M = this.M, C = M.C, root = (g.head / (C * C)) | 0;
    this.layout(root, [1, 0], [0, 1]);
    const h = this.cellAt(g.head), a = this.cellAt(M.nb[g.head * 4 + g.straight()]) || [h[0], h[1] + 1];
    const phi = Math.PI / 2 - Math.atan2(a[1] - h[1], a[0] - h[0]), c = Math.cos(phi), s = Math.sin(phi);
    this.layout(root, [c, s], [-s, c]);
    this.cam = this.cellAt(g.head); this.lastHead = g.head;
  }
  track(g, f, dt) {
    const M = this.M, C = M.C, hf = (g.head / (C * C)) | 0;
    if (hf !== this.root) {
      const B = this.place.get(hf);
      if (B) {
        const o = at(B, [0.5, 0.5]);
        this.cam = [this.cam[0] - o[0], this.cam[1] - o[1]];
        this.layout(hf, B.ex, B.ey);
      } else this.reframe(g);
    }
    const h = this.cellAt(g.head), p = g.body.length > 1 ? this.cellAt(g.body[1]) : null;
    let tgt = h;
    if (h && p) {
      const d = [h[0] - p[0], h[1] - p[1]], k = g.alive ? f : 1, lead = V_.LEAD / C;
      const dir = n2(d);
      tgt = [p[0] + d[0] * k + dir[0] * lead, p[1] + d[1] * k + dir[1] * lead];
    }
    if (tgt) { const a = 1 - Math.exp(-dt / V_.TAU); this.cam = [this.cam[0] + (tgt[0] - this.cam[0]) * a, this.cam[1] + (tgt[1] - this.cam[1]) * a]; }
    this.lastHead = g.head;
  }
  /* which side of the head's cell is most nearly the way the player pointed */
  sideFor(g, dir) {
    const want = dir === "up" ? [0, 1] : dir === "down" ? [0, -1] : dir === "right" ? [1, 0] : [-1, 0], h = this.cellAt(g.head);
    if (!h) return -1;
    let best = -1, bd = 0.35;
    for (let s = 0; s < 4; s++) {
      const nb = this.M.nb[g.head * 4 + s];
      if (g.body.length > 1 && nb === g.body[1]) continue;
      const p = this.cellAt(nb); if (!p) continue;
      const v = n2([p[0] - h[0], p[1] - h[1]]), d = v[0] * want[0] + v[1] * want[1];
      if (d > bd) { bd = d; best = s; }
    }
    return best;
  }

  drawNet(g, now, alpha = 1) {
    const ctx = this.ctx, M = this.M, C = M.C, CC = C * C, S = this.cell * C * this.zoom, cx = this.w / 2, cy = this.h / 2;
    const X = (p) => [cx + (p[0] - this.cam[0]) * S, cy - (p[1] - this.cam[1]) * S];
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.globalAlpha = alpha;
    if (alpha >= 1) { ctx.fillStyle = "#05060a"; ctx.fillRect(0, 0, this.w, this.h); }
    const body = new Map(g.body.map((c, k) => [c, k])), n = g.body.length, pulse = 0.5 + 0.5 * Math.sin(now / 160);
    ctx.lineJoin = "round"; ctx.lineCap = "round";
    for (let q = this.order.length - 1; q >= 0; q--) {
      const f = this.order[q], pl = this.place.get(f), fc = this.faces[f], hue = 200 + 120 * fc.t;
      for (let i = 0; i < C; i++) for (let j = 0; j < C; j++) {
        const c = f * CC + i * C + j, k = body.get(c);
        const a = X(at(pl, [i / C, j / C])), b = X(at(pl, [(i + 1) / C, j / C])), d = X(at(pl, [(i + 1) / C, (j + 1) / C])), e = X(at(pl, [i / C, (j + 1) / C]));
        let fill;
        if (k === 0) fill = g.alive ? "#f2b84b" : "#ff5d62";
        else if (k !== undefined) { const t = k / Math.max(1, n - 1); fill = `hsl(${160 - 40 * t} 62% ${50 - 16 * t}%)`; }
        else fill = `hsl(${hue} ${30 + 8 * ((i + j) & 1)}% ${17 + 5 * ((i + j) & 1)}%)`;
        ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.lineTo(d[0], d[1]); ctx.lineTo(e[0], e[1]); ctx.closePath();
        ctx.fillStyle = fill; ctx.fill(); ctx.strokeStyle = "rgba(5,6,10,0.6)"; ctx.lineWidth = 1; ctx.stroke();
        if (g.food.has(c)) {
          const m = X(at(pl, [(i + 0.5) / C, (j + 0.5) / C]));
          ctx.beginPath(); ctx.arc(m[0], m[1], S / C * 0.22 * (0.9 + 0.1 * pulse), 0, 7); ctx.fillStyle = "#ff7eb6"; ctx.fill();
        }
      }
      // the face's own edges: the folds of the world
      const o = [[0, 0], [1, 0], [1, 1], [0, 1]].map((x) => X(at(pl, x)));
      ctx.beginPath(); ctx.moveTo(o[0][0], o[0][1]); for (let k = 1; k < 4; k++) ctx.lineTo(o[k][0], o[k][1]); ctx.closePath();
      ctx.strokeStyle = "rgba(160,170,200,0.28)"; ctx.lineWidth = 1.6; ctx.stroke();
    }
    // the body's spine through the folds, and the head's eyes
    if (n > 1) {
      ctx.strokeStyle = "rgba(5,6,10,0.35)"; ctx.lineWidth = Math.max(2, S / C * 0.09);
      for (let k = 0; k + 1 < n; k++) {
        const a = this.cellAt(g.body[k]), b = this.cellAt(g.body[k + 1]);
        if (!a || !b || Math.hypot(a[0] - b[0], a[1] - b[1]) > 1.6 / C) continue;
        const p = X(a), q = X(b); ctx.beginPath(); ctx.moveTo(p[0], p[1]); ctx.lineTo(q[0], q[1]); ctx.stroke();
      }
    }
    if (g.alive) {
      const h = this.cellAt(g.head), s = g.next >= 0 ? g.next : g.straight(), a2 = this.cellAt(M.nb[g.head * 4 + s]);
      if (h && a2) { const p = X(h), d = n2([a2[0] - h[0], a2[1] - h[1]]), L = S / C * 0.3; ctx.strokeStyle = "#1a1000"; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(p[0], p[1]); ctx.lineTo(p[0] + d[0] * L, p[1] - d[1] * L); ctx.stroke(); }
    }
    ctx.globalAlpha = 1;
  }

  /* ---- the 3D shots, for the molt */
  follow3(g) {
    const M = this.M, C = M.C, f = (g.head / (C * C)) | 0, fc = this.faces[f], pl = this.place.get(f), Q = fc.F.Q;
    const P3 = norm(sub(Q[1][0], Q[0][0])), R3 = norm(sub(Q[0][1], Q[0][0]));
    const u = pl ? norm(add(mul(P3, pl.ex[1]), mul(R3, pl.ey[1]))) : P3, c = this.centers[g.head];
    return { eye: add(c, mul(fc.n, V_.DIST)), target: c, up: u };
  }
  draw3(g, now) {
    const ctx = this.ctx, M = this.M, C = M.C, CC = C * C;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.fillStyle = "#05060a"; ctx.fillRect(0, 0, this.w, this.h);
    const fo = this.follow3(g), t = this.mix * this.mix * (3 - 2 * this.mix);
    const cam = { eye: lerp(fo.eye, this.over.eye, t), target: lerp(fo.target, this.over.target, t), up: norm(lerp(fo.up, this.over.up, t)) };
    const fwd = norm(sub(cam.target, cam.eye)), right = norm(cross(fwd, cam.up)), up = cross(right, fwd);
    const cx = this.w / 2, cy = this.h / 2, fl = this.focal, eye = cam.eye;
    const P = (p) => { const v = sub(p, eye), z = dot(v, fwd); if (z < 0.04) return null; return [cx + fl * dot(v, right) / z, cy - fl * dot(v, up) / z, z]; };
    const list = [];
    for (const fc of this.faces) { if (dot(fc.n, sub(eye, fc.center)) <= 0) continue; const pc = P(fc.center); if (pc) list.push([pc[2], fc]); }
    list.sort((a, b) => b[0] - a[0]);
    const body = new Set(g.body);
    for (const [, fc] of list) {
      const pts = fc.grid.map(P); if (pts.some((p) => !p)) continue;
      const hue = 200 + 120 * fc.t;
      for (let i = 0; i < C; i++) for (let j = 0; j < C; j++) {
        const c = fc.f * CC + i * C + j, a = pts[i * (C + 1) + j], b = pts[(i + 1) * (C + 1) + j], d = pts[(i + 1) * (C + 1) + j + 1], e = pts[i * (C + 1) + j + 1];
        ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.lineTo(d[0], d[1]); ctx.lineTo(e[0], e[1]); ctx.closePath();
        ctx.fillStyle = c === g.head ? "#f2b84b" : body.has(c) ? "#3fd29a" : `hsl(${hue} ${30 + 8 * ((i + j) & 1)}% ${Math.round((22 + 6 * ((i + j) & 1)) * fc.light + 4)}%)`;
        ctx.fill(); ctx.strokeStyle = "rgba(5,6,10,0.55)"; ctx.lineWidth = 0.7; ctx.stroke();
      }
    }
  }
}

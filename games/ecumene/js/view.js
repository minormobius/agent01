/* Ecumene — the globe. Orthographic, one 3×3 rotation, canvas 2D, the
   family's projection (../../strand/, ../../bucky/). Zones are filled with
   their ground (mappa's biome colours, darkened) and lit by how many people
   live in them, so the cities are the bright patches; the refined mesh shows
   as fine borders where a city has split. Rivers from mappa. Lines as thick
   great-circle arcs between stops, a red pulse where a ride is overfull,
   and each line's trains running along it. */
import { slerp, arc } from "./sim.js";
import { BIOMES } from "./mappa-engine.js";

export class View {
  constructor(cv) {
    this.cv = cv; this.ctx = cv.getContext("2d");
    this.R = [1, 0, 0, 0, 1, 0, 0, 0, 1]; this.zoom = 1; this.w = 0; this.h = 0; this.dpr = 1;
    this.world = null; this.snap = null; this.lines = []; this.sel = -1; this.hot = -1; this.t = 0;
  }
  resize() {
    const dpr = Math.min(2, globalThis.devicePixelRatio || 1), r = this.cv.getBoundingClientRect();
    this.dpr = dpr; this.w = r.width; this.h = r.height;
    this.cv.width = Math.round(r.width * dpr); this.cv.height = Math.round(r.height * dpr);
  }
  radius() { return Math.min(this.w, this.h) * 0.45 * this.zoom; }
  drag(dx, dy) {
    const r = this.radius(), a = dx / r, b = dy / r, ca = Math.cos(a), sa = Math.sin(a), cb = Math.cos(b), sb = Math.sin(b);
    this.R = mul([ca, sa * sb, sa * cb, 0, cb, -sb, -sa, ca * sb, ca * cb], this.R); ortho(this.R);
  }
  face(p, t) {
    const v = apply(this.R, p), s = Math.hypot(v[1], v[0]);
    if (s < 1e-9) return;
    const ang = Math.atan2(s, v[2]) * (t == null ? 1 : t), u = [v[1] / s, -v[0] / s, 0];
    this.R = mul(rotAxis(u, ang), this.R); ortho(this.R);
  }
  proj(x, y, z) {
    const R = this.R, r = this.radius();
    return [this.w / 2 + r * (R[0] * x + R[1] * y + R[2] * z), this.h / 2 - r * (R[3] * x + R[4] * y + R[5] * z), R[6] * x + R[7] * y + R[8] * z];
  }
  /* Screen → unit vector on the near side, or null. */
  unproject(px, py) {
    const r = this.radius(), X = (px - this.w / 2) / r, Y = -(py - this.h / 2) / r, d = X * X + Y * Y;
    if (d > 1) return null;
    const Z = Math.sqrt(1 - d), R = this.R;
    return [R[0] * X + R[3] * Y + R[6] * Z, R[1] * X + R[4] * Y + R[7] * Z, R[2] * X + R[5] * Y + R[8] * Z];
  }

  draw() {
    const ctx = this.ctx, dpr = this.dpr, s = this.snap, W = this.world;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, this.w, this.h);
    if (!s || !W) return;
    const r = this.radius(), cx = this.w / 2, cy = this.h / 2;
    // atmosphere
    const g = ctx.createRadialGradient(cx, cy, r * 0.96, cx, cy, r * 1.08);
    g.addColorStop(0, "rgba(120,170,255,0.25)"); g.addColorStop(1, "rgba(120,170,255,0)");
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, r * 1.08, 0, 2 * Math.PI); ctx.fill();
    ctx.fillStyle = "#0b1a2e"; ctx.beginPath(); ctx.arc(cx, cy, r, 0, 2 * Math.PI); ctx.fill();
    // zones
    const V = s.verts, P = s.P, Q = new Float32Array(V.length);
    for (let k = 0; k < V.length / 3; k++) { const q = this.proj(V[3 * k], V[3 * k + 1], V[3 * k + 2]); Q[3 * k] = q[0]; Q[3 * k + 1] = q[1]; Q[3 * k + 2] = q[2]; }
    const fine = r > 260;
    for (let i = 0; i < s.n; i++) {
      const R = this.R, z = R[6] * P[3 * i] + R[7] * P[3 * i + 1] + R[8] * P[3 * i + 2];
      if (z < -0.08) continue;
      const a = s.off[i], b = s.off[i + 1]; if (b - a < 3) continue;
      ctx.beginPath();
      for (let k = a; k < b; k++) { const v = s.ring[k]; if (k === a) ctx.moveTo(Q[3 * v], Q[3 * v + 1]); else ctx.lineTo(Q[3 * v], Q[3 * v + 1]); }
      ctx.closePath();
      const geo = s.geo[i], shade = 0.55 + 0.45 * Math.max(0, z);
      ctx.fillStyle = this.zoneColor(i, geo, shade); ctx.fill();
      if (s.land[i] && (fine || s.area[i] < 60)) { ctx.strokeStyle = s.pop[i] / s.area[i] > 150 ? "rgba(255,210,150,0.22)" : "rgba(0,0,0,0.18)"; ctx.lineWidth = 0.6; ctx.stroke(); }
    }
    // rivers
    ctx.strokeStyle = "rgba(120,190,255,0.75)"; ctx.lineCap = "round";
    for (const rv of W.rivers) {
      const p = this.proj(rv[0][0], rv[0][1], rv[0][2]), q = this.proj(rv[1][0], rv[1][1], rv[1][2]);
      if (p[2] < 0 || q[2] < 0) continue;
      ctx.lineWidth = 0.5 + rv[2] * 0.5 * Math.min(2, this.zoom); ctx.beginPath(); ctx.moveTo(p[0], p[1]); ctx.lineTo(q[0], q[1]); ctx.stroke();
    }
    // limb shading
    const lg = ctx.createRadialGradient(cx - r * 0.25, cy - r * 0.3, r * 0.2, cx, cy, r);
    lg.addColorStop(0, "rgba(255,255,255,0.05)"); lg.addColorStop(0.7, "rgba(0,0,0,0)"); lg.addColorStop(1, "rgba(0,0,0,0.45)");
    ctx.fillStyle = lg; ctx.beginPath(); ctx.arc(cx, cy, r, 0, 2 * Math.PI); ctx.fill();
    this.drawLines();
    if (this.hot >= 0 && this.hot < s.n) {
      const a = s.off[this.hot], b = s.off[this.hot + 1];
      ctx.beginPath(); for (let k = a; k < b; k++) { const v = s.ring[k]; if (k === a) ctx.moveTo(Q[3 * v], Q[3 * v + 1]); else ctx.lineTo(Q[3 * v], Q[3 * v + 1]); }
      ctx.closePath(); ctx.strokeStyle = "#fff"; ctx.lineWidth = 2; ctx.stroke();
    }
  }
  zoneColor(i, geo, shade) {
    const s = this.snap, b = BIOMES[this.world.biome[geo]];
    let h = b.h, sat = b.s * 0.6, l = (s.land[i] ? b.l * 0.42 : b.l * 0.7) * shade;
    if (s.land[i]) {
      const d = s.pop[i] / Math.max(1, s.area[i]);
      if (d > 8) { // people: from a warm haze to the white heat of a downtown
        const t = Math.min(1, Math.log10(d / 8) / 2.4), e = Math.sqrt(t);
        h = h + (36 - h) * e; sat = sat + (92 - sat) * e; l = l + ((28 + 62 * t) * (0.6 + 0.4 * shade) - l) * e;
      }
    }
    return "hsl(" + h.toFixed(0) + "," + sat.toFixed(0) + "%," + l.toFixed(0) + "%)";
  }
  /* A line's path on screen: every segment as a sampled great-circle arc. */
  path(L) {
    const pts = [];
    for (let k = 0; k + 1 < L.stops.length; k++) {
      const a = L.stops[k], b = L.stops[k + 1], m = Math.max(2, Math.ceil(arc(a, b) * 60));
      for (let j = k ? 1 : 0; j <= m; j++) { const p = slerp(a, b, j / m); pts.push({ q: this.proj(p[0], p[1], p[2]), seg: k, t: j / m }); }
    }
    return pts;
  }
  drawLines() {
    const ctx = this.ctx, st = this.snap.stats, lw = Math.max(3, Math.min(7, this.radius() / 70));
    this.lines.forEach((L, li) => {
      if (!L.stops.length) return;
      const pts = this.path(L), info = st.lines && st.lines.find((x) => x.id === L.id);
      const crowd = {}; if (info) for (const sg of info.segs) crowd[sg.k] = Math.max(crowd[sg.k] || 0, sg.crowd);
      ctx.lineCap = "round"; ctx.lineJoin = "round";
      // casing, then colour, segment by segment so a full one can glow red
      for (const pass of [0, 1]) {
        for (let k = 1; k < pts.length; k++) {
          const p = pts[k - 1].q, q = pts[k].q; if (p[2] < 0 || q[2] < 0) continue;
          const c = crowd[pts[k].seg] || 0;
          ctx.strokeStyle = pass ? (c > 1 ? mix(L.color, "#ff2a2a", 0.5 + 0.5 * Math.sin(this.t * 6)) : L.color) : "rgba(0,0,0,0.6)";
          ctx.lineWidth = pass ? lw * (li === this.sel ? 1.25 : 1) : lw + 3;
          ctx.beginPath(); ctx.moveTo(p[0], p[1]); ctx.lineTo(q[0], q[1]); ctx.stroke();
        }
      }
      // trains: evenly spaced round the out-and-back cycle
      if (L.stops.length > 1 && info) {
        const n = pts.length - 1, period = 14;
        for (let k = 0; k < L.trains; k++) {
          let f = ((this.t / period + k / L.trains) % 1) * 2; if (f > 1) f = 2 - f;
          const x = f * n, i = Math.min(n - 1, Math.floor(x)), u = x - i, p = pts[i].q, q = pts[i + 1].q;
          if (p[2] < 0) continue;
          ctx.fillStyle = "#fff"; ctx.strokeStyle = L.color; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.arc(p[0] + (q[0] - p[0]) * u, p[1] + (q[1] - p[1]) * u, lw * 0.75, 0, 2 * Math.PI); ctx.fill(); ctx.stroke();
        }
      }
      // stops
      L.stops.forEach((s, k) => {
        const q = this.proj(s[0], s[1], s[2]); if (q[2] < 0) return;
        ctx.fillStyle = "#fff"; ctx.strokeStyle = "#111"; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(q[0], q[1], lw * (k === L.stops.length - 1 && li === this.sel ? 1.3 : 0.95), 0, 2 * Math.PI); ctx.fill(); ctx.stroke();
      });
    });
  }
}

function mix(a, b, t) {
  const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16), c = (s) => [(s >> 16) & 255, (s >> 8) & 255, s & 255], A = c(pa), B = c(pb);
  return "rgb(" + A.map((x, i) => Math.round(x + (B[i] - x) * t)).join(",") + ")";
}
function apply(R, p) { return [R[0] * p[0] + R[1] * p[1] + R[2] * p[2], R[3] * p[0] + R[4] * p[1] + R[5] * p[2], R[6] * p[0] + R[7] * p[1] + R[8] * p[2]]; }
function mul(A, B) { const C = new Array(9); for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) C[3 * i + j] = A[3 * i] * B[j] + A[3 * i + 1] * B[3 + j] + A[3 * i + 2] * B[6 + j]; return C; }
function rotAxis(u, t) {
  const c = Math.cos(t), s = Math.sin(t), C = 1 - c, [x, y, z] = u;
  return [c + x * x * C, x * y * C - z * s, x * z * C + y * s, y * x * C + z * s, c + y * y * C, y * z * C - x * s, z * x * C - y * s, z * y * C + x * s, c + z * z * C];
}
function ortho(R) {
  let a = [R[0], R[1], R[2]], b = [R[3], R[4], R[5]]; const la = Math.hypot(...a); a = a.map((x) => x / la);
  const k = a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; b = [b[0] - k * a[0], b[1] - k * a[1], b[2] - k * a[2]];
  const lb = Math.hypot(...b); b = b.map((x) => x / lb);
  const c = [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  for (let i = 0; i < 3; i++) { R[i] = a[i]; R[3 + i] = b[i]; R[6 + i] = c[i]; }
}

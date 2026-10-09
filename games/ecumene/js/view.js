/* Ecumene — the globe. Orthographic, one 3×3 rotation, canvas 2D, the
   family's projection (../../strand/, ../../bucky/).

   The land is a relief map, exaggerated: each zone gets an elevation
   (inverse-distance from mappa's cells round it) and a normal fitted to its
   neighbours' heights, times EXAG, lit from the upper left of the screen,
   so ridges and valleys read at a glance. Its colour is a hypsometric tint
   (lowland green to highland brown to snow) mixed with mappa's biome, and
   people light it up: a warm haze to the white heat of a downtown.

   The sea has no zones at all: one deep gradient under everything, a pale
   shelf haloed round every coast, and an endless field of small waves
   (points fixed on the sphere, drifting in phase). Only the land and its
   lakes are drawn as cells.

   Zoom goes deep (to ~40 px per km in a dense city), anchored where you pinch or scroll,
   and only zones on screen are drawn. Towns are labelled. Lines are thick
   great-circle arcs between stops, pulsing red where a ride is overfull,
   with each line's trains running along it. */
import { slerp, arc } from "./sim.js";
import { BIOMES } from "./mappa-engine.js";

export const EXAG = 14;          // relief exaggeration
const ORE_COL = { iron: "#c0583f", copper: "#d58a45", tin: "#9fb0c0", coal: "#4a4a52" };
export const ZOOM_MAX = 40;
const HKM = 6;                   // mappa's elevation 1.0 ≈ 6 km above the sea

export class View {
  constructor(cv) {
    this.cv = cv; this.ctx = cv.getContext("2d");
    this.R = [1, 0, 0, 0, 1, 0, 0, 0, 1]; this.zoom = 1; this.w = 0; this.h = 0; this.dpr = 1;
    this.world = null; this.snap = null; this.lines = []; this.sel = -1; this.hot = -1; this.t = 0;
    this.waves = null; this.normals = null; this.elev = null; this.coast = null; this.layer = "terrain";
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
  /* Zoom by factor f keeping the point under (px, py) where it is. */
  zoomAt(px, py, f) {
    const p = this.unproject(px, py);
    this.zoom = Math.max(0.8, Math.min(ZOOM_MAX, this.zoom * f));
    if (!p) return;
    for (let k = 0; k < 4; k++) { const q = this.proj(p[0], p[1], p[2]); this.drag(px - q[0], py - q[1]); }
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

  /* ------------------------------------------------------------ data in */
  setWorld(W) {
    this.world = W;
    // the waves: points spread evenly over the sphere, kept where the sea is
    const N = 40000, ga = Math.PI * (3 - Math.sqrt(5)), pts = [];
    let g = 0;
    for (let i = 0; i < N; i++) {
      const z = 1 - 2 * (i + 0.5) / N, r = Math.sqrt(1 - z * z), th = ga * i, p = [r * Math.cos(th), r * Math.sin(th), z];
      g = nearest(W, p, g);
      if (W.water[g] === 1) pts.push(p[0], p[1], p[2], hash(i));
    }
    this.waves = Float32Array.from(pts);
  }
  setSnap(s) {
    this.snap = s;
    const W = this.world, n = s.n, P = s.P, elev = new Float32Array(n), nrm = new Float32Array(3 * n), coast = new Uint8Array(n);
    // height at each zone's site: inverse-distance over its world cell and that cell's ring
    for (let i = 0; i < n; i++) {
      if (!s.land[i]) continue;
      const g = s.geo[i], p = [P[3 * i], P[3 * i + 1], P[3 * i + 2]];
      let sw = 0, sh = 0;
      for (const c of [g].concat(W.adj[g])) {
        const d = 1 - (p[0] * W.V[3 * c] + p[1] * W.V[3 * c + 1] + p[2] * W.V[3 * c + 2]) + 1e-7, wgt = 1 / (d * d);
        sw += wgt; sh += wgt * (W.water[c] ? 0 : Math.max(0, W.elev[c]));
      }
      elev[i] = sh / sw;
    }
    // a normal fitted to the neighbours' heights (least squares, in the zone's tangent plane)
    for (let i = 0; i < n; i++) {
      const p = [P[3 * i], P[3 * i + 1], P[3 * i + 2]];
      nrm[3 * i] = p[0]; nrm[3 * i + 1] = p[1]; nrm[3 * i + 2] = p[2];
      if (!s.land[i]) continue;
      const [e1, e2] = frame(p); let a = 0, b = 0, c = 0, d1 = 0, d2 = 0;
      for (const j of s.nbrs[i]) {
        if (!s.land[j]) coast[i] = 1;
        const q = [P[3 * j] - p[0], P[3 * j + 1] - p[1], P[3 * j + 2] - p[2]];
        const x = dot(q, e1) * 250, y = dot(q, e2) * 250, dz = ((s.land[j] ? elev[j] : 0) - elev[i]) * HKM * EXAG;
        a += x * x; b += x * y; c += y * y; d1 += x * dz; d2 += y * dz;
      }
      const det = a * c - b * b; if (Math.abs(det) < 1e-12) continue;
      const gx = (c * d1 - b * d2) / det, gy = (a * d2 - b * d1) / det;
      const v = [p[0] - gx * e1[0] - gy * e2[0], p[1] - gx * e1[1] - gy * e2[1], p[2] - gx * e1[2] - gy * e2[2]], l = Math.hypot(...v);
      nrm[3 * i] = v[0] / l; nrm[3 * i + 1] = v[1] / l; nrm[3 * i + 2] = v[2] / l;
    }
    this.elev = elev; this.normals = nrm; this.coast = coast;
    // each zone's town (for the food layer): the nearest, as the sim has it
    const tw = new Int32Array(n).fill(-1);
    if (s.towns && s.towns.length) for (let i = 0; i < n; i++) if (s.land[i]) {
      let best = -2; for (let t = 0; t < s.towns.length; t++) { const q = s.towns[t].p, d = P[3 * i] * q[0] + P[3 * i + 1] * q[1] + P[3 * i + 2] * q[2]; if (d > best) { best = d; tw[i] = t; } }
    }
    this.townOf = tw;
  }

  /* ------------------------------------------------------------ drawing */
  draw() {
    const ctx = this.ctx, dpr = this.dpr, s = this.snap, W = this.world;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, this.w, this.h);
    if (!s || !W) return;
    const r = this.radius(), cx = this.w / 2, cy = this.h / 2, R = this.R, w = this.w, h = this.h;
    // atmosphere and the sea
    const g = ctx.createRadialGradient(cx, cy, r * 0.97, cx, cy, r * 1.07);
    g.addColorStop(0, "rgba(120,170,255,0.28)"); g.addColorStop(1, "rgba(120,170,255,0)");
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, r * 1.07, 0, 2 * Math.PI); ctx.fill();
    const sea = ctx.createRadialGradient(cx - r * 0.3, cy - r * 0.35, r * 0.05, cx, cy, r);
    sea.addColorStop(0, "#1d4f7a"); sea.addColorStop(0.75, "#0f3150"); sea.addColorStop(1, "#081a2e");
    ctx.fillStyle = sea; ctx.beginPath(); ctx.arc(cx, cy, r, 0, 2 * Math.PI); ctx.fill();
    this.drawWaves();
    // project every Voronoi vertex once
    const V = s.verts, Q = new Float32Array(V.length);
    for (let k = 0; k < V.length / 3; k++) {
      const x = V[3 * k], y = V[3 * k + 1], z = V[3 * k + 2];
      Q[3 * k] = cx + r * (R[0] * x + R[1] * y + R[2] * z); Q[3 * k + 1] = cy - r * (R[3] * x + R[4] * y + R[5] * z); Q[3 * k + 2] = R[6] * x + R[7] * y + R[8] * z;
    }
    const P = s.P, vis = [];
    for (let i = 0; i < s.n; i++) {
      if (!s.land[i]) continue;
      const x = P[3 * i], y = P[3 * i + 1], z = P[3 * i + 2], vz = R[6] * x + R[7] * y + R[8] * z;
      if (vz < -0.06) continue;
      const sx = cx + r * (R[0] * x + R[1] * y + R[2] * z), sy = cy - r * (R[3] * x + R[4] * y + R[5] * z), rad = r * Math.sqrt(s.area[i] / Math.PI) / 250 * 1.6 + 4;
      if (sx < -rad || sx > w + rad || sy < -rad || sy > h + rad) continue;
      vis.push(i);
    }
    const poly = (i) => { const a = s.off[i], b = s.off[i + 1]; ctx.beginPath(); for (let k = a; k < b; k++) { const v = s.ring[k]; if (k === a) ctx.moveTo(Q[3 * v], Q[3 * v + 1]); else ctx.lineTo(Q[3 * v], Q[3 * v + 1]); } ctx.closePath(); };
    // the shelf: a pale halo round every coast
    const halo = Math.max(6, Math.min(40, r / 40));
    ctx.lineJoin = "round";
    for (const [wd, al] of [[halo, 0.12], [halo * 0.5, 0.16]]) {
      ctx.strokeStyle = "rgba(110,200,230," + al + ")"; ctx.lineWidth = wd;
      for (const i of vis) if (this.coast[i] && s.off[i + 1] - s.off[i] >= 3) { poly(i); ctx.stroke(); }
    }
    // the land
    const fine = r > 700, Lx = -0.45, Ly = 0.55, Lz = 0.7;
    for (const i of vis) {
      if (s.off[i + 1] - s.off[i] < 3) continue;
      poly(i);
      const nx = this.normals[3 * i], ny = this.normals[3 * i + 1], nz = this.normals[3 * i + 2];
      const vx = R[0] * nx + R[1] * ny + R[2] * nz, vy = R[3] * nx + R[4] * ny + R[5] * nz, vz = R[6] * nx + R[7] * ny + R[8] * nz;
      const lit = Math.max(0, vx * Lx + vy * Ly + vz * Lz) / Math.hypot(Lx, Ly, Lz), shade = 0.35 + 0.85 * lit;
      ctx.fillStyle = this.landColor(i, shade); ctx.fill();
      if (fine || s.area[i] < 25) { ctx.strokeStyle = s.pop[i] / s.area[i] > 150 ? "rgba(255,220,170,0.25)" : "rgba(0,0,0,0.13)"; ctx.lineWidth = 0.7; ctx.stroke(); }
    }
    // rivers
    ctx.strokeStyle = "rgba(110,190,255,0.85)"; ctx.lineCap = "round";
    for (const rv of W.rivers) {
      const p = this.proj(rv[0][0], rv[0][1], rv[0][2]), q = this.proj(rv[1][0], rv[1][1], rv[1][2]);
      if (p[2] < 0 || q[2] < 0) continue;
      ctx.lineWidth = Math.min(8, 0.6 + rv[2] * 0.4 * Math.sqrt(this.zoom)); ctx.beginPath(); ctx.moveTo(p[0], p[1]); ctx.lineTo(q[0], q[1]); ctx.stroke();
    }
    // the limb
    const lg = ctx.createRadialGradient(cx, cy, r * 0.75, cx, cy, r);
    lg.addColorStop(0, "rgba(0,0,0,0)"); lg.addColorStop(1, "rgba(0,0,0,0.4)");
    ctx.fillStyle = lg; ctx.beginPath(); ctx.arc(cx, cy, r, 0, 2 * Math.PI); ctx.fill();
    this.drawMines();
    this.drawLines();
    if (this.hot >= 0 && this.hot < s.n) { poly(this.hot); ctx.strokeStyle = "#fff"; ctx.lineWidth = 2; ctx.stroke(); }
    this.drawLabels();
  }
  landColor(i, shade) {
    const s = this.snap, b = BIOMES[this.world.biome[s.geo[i]]], e = this.elev[i];
    if (this.layer === "food") return this.foodColor(i, shade);
    if (b.id === "lake") return "hsl(204,45%," + (30 * shade).toFixed(0) + "%)";
    // hypsometric: low green, mid tan, high brown, top snow, mixed with the biome
    const stops = [[0, 105, 32, 34], [0.12, 80, 30, 40], [0.3, 42, 32, 44], [0.55, 25, 22, 38], [0.8, 0, 0, 82]];
    let k = 0; while (k < stops.length - 2 && e > stops[k + 1][0]) k++;
    const A = stops[k], B = stops[k + 1], t = Math.max(0, Math.min(1, (e - A[0]) / (B[0] - A[0])));
    let hh = A[1] + (B[1] - A[1]) * t, ss = A[2] + (B[2] - A[2]) * t, ll = A[3] + (B[3] - A[3]) * t;
    hh = 0.55 * hh + 0.45 * b.h; ss = 0.6 * ss + 0.4 * b.s; ll = (0.6 * ll + 0.4 * b.l) * shade;
    const d = s.pop[i] / Math.max(1, s.area[i]);
    if (d > 8) { // people
      const u = Math.min(1, Math.log10(d / 8) / 2.4), q = Math.sqrt(u);
      hh += (36 - hh) * q; ss += (92 - ss) * q; ll += ((26 + 64 * u) * (0.65 + 0.35 * Math.min(1.2, shade)) - ll) * q;
    }
    return "hsl(" + hh.toFixed(0) + "," + ss.toFixed(0) + "%," + Math.min(96, ll).toFixed(0) + "%)";
  }
  /* The food layer: green where food grows (open country × what the ground
     yields), and every town's land tinted by whether it eats: cool when fed,
     amber to red as it goes short. */
  foodColor(i, shade) {
    const s = this.snap, W = this.world, d = s.pop[i] / Math.max(1, s.area[i]);
    const grow = W.yieldKm[s.geo[i]] * Math.max(0, 1 - d / 300);
    const t = this.townOf ? this.townOf[i] : -1, fed = t >= 0 && s.towns[t] ? s.towns[t].food : 1;
    if (d > 150) { // the city itself: how well it eats
      const h = 140 * Math.max(0, Math.min(1, (fed - 0.5) / 0.5)), l = 45 + 10 * Math.min(1, Math.log10(d / 150));
      return "hsl(" + h.toFixed(0) + ",80%," + (l * (0.75 + 0.25 * shade)).toFixed(0) + "%)";
    }
    return "hsl(" + (95 - 40 * (1 - grow)).toFixed(0) + "," + (20 + 55 * grow).toFixed(0) + "%," + ((12 + 32 * grow) * (0.7 + 0.3 * shade)).toFixed(0) + "%)";
  }
  /* Ore deposits: a diamond in the ore's colour, bright once it is worked. */
  drawMines() {
    const s = this.snap; if (!s.mines) return;
    const ctx = this.ctx, k = Math.max(6, Math.min(11, 4 + this.zoom));
    for (const m of s.mines) {
      const q = this.proj(m.p[0], m.p[1], m.p[2]); if (q[2] < 0.05) continue;
      ctx.fillStyle = ORE_COL[m.kind] || "#aaa"; ctx.globalAlpha = m.on ? 1 : 0.45;
      ctx.strokeStyle = m.on ? "#fff8e0" : "rgba(10,10,10,0.8)"; ctx.lineWidth = m.on ? 2 : 1.2;
      ctx.beginPath(); ctx.moveTo(q[0], q[1] - k); ctx.lineTo(q[0] + k * 0.75, q[1]); ctx.lineTo(q[0], q[1] + k); ctx.lineTo(q[0] - k * 0.75, q[1]); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.globalAlpha = 1;
      if (this.zoom > 5) { ctx.font = "600 10px ui-monospace, Menlo, monospace"; ctx.textAlign = "left"; ctx.textBaseline = "middle"; ctx.lineWidth = 3; ctx.strokeStyle = "rgba(5,10,20,0.7)"; ctx.strokeText(m.kind, q[0] + k + 3, q[1]); ctx.fillStyle = "#eee"; ctx.fillText(m.kind, q[0] + k + 3, q[1]); }
    }
  }
  drawWaves() {
    const ctx = this.ctx, Wv = this.waves; if (!Wv) return;
    const R = this.R, r = this.radius(), cx = this.w / 2, cy = this.h / 2, w = this.w, h = this.h, t = this.t;
    const n = Wv.length / 4, onScreen = Math.min(1, (w * h) / (Math.PI * r * r)), stride = Math.max(1, Math.round(n * onScreen / 2200));
    const size = Math.max(2.5, Math.min(9, r / 160));
    ctx.lineWidth = 1; ctx.lineCap = "round";
    for (let k = 0; k < n; k += stride) {
      const x = Wv[4 * k], y = Wv[4 * k + 1], z = Wv[4 * k + 2], ph = Wv[4 * k + 3];
      const vz = R[6] * x + R[7] * y + R[8] * z; if (vz < 0.05) continue;
      const sx = cx + r * (R[0] * x + R[1] * y + R[2] * z), sy = cy - r * (R[3] * x + R[4] * y + R[5] * z);
      if (sx < -10 || sx > w + 10 || sy < -10 || sy > h + 10) continue;
      const a = 0.05 + 0.16 * (0.5 + 0.5 * Math.sin(t * 0.9 + ph * 6.283)) * vz;
      // a small crest, foreshortened toward the limb, drifting as it breathes
      const dx = size * (1 + 0.3 * Math.sin(t * 0.5 + ph * 9)), dy = size * 0.45 * vz;
      ctx.strokeStyle = "rgba(190,225,255," + a.toFixed(3) + ")";
      ctx.beginPath(); ctx.moveTo(sx - dx, sy); ctx.quadraticCurveTo(sx, sy - dy, sx + dx, sy); ctx.stroke();
    }
  }
  drawLabels() {
    const s = this.snap; if (!s.towns) return;
    const ctx = this.ctx, boxes = [], fs = Math.max(10, Math.min(15, 9 + this.zoom * 0.5));
    ctx.font = "600 " + fs + "px -apple-system, system-ui, sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    const towns = s.towns.slice().sort((a, b) => b.pop - a.pop), minPop = this.zoom > 6 ? 0 : this.zoom > 2.5 ? 8000 : 60000;
    for (const t of towns) {
      if (t.pop < minPop) continue;
      const q = this.proj(t.p[0], t.p[1], t.p[2]); if (q[2] < 0.15) continue;
      const tw = ctx.measureText(t.name).width + 8, box = [q[0] - tw / 2, q[1] - fs - 8, tw, fs + 4];
      if (boxes.some((b) => b[0] < box[0] + box[2] && box[0] < b[0] + b[2] && b[1] < box[1] + box[3] && box[1] < b[1] + b[3])) continue;
      boxes.push(box);
      ctx.lineWidth = 3; ctx.strokeStyle = "rgba(5,10,20,0.75)"; ctx.strokeText(t.name, q[0], q[1] - fs / 2 - 6);
      const hungry = t.food < 0.9 && t.short > 5000;
      ctx.fillStyle = hungry ? "#ffb547" : "rgba(255,240,220,0.92)"; ctx.fillText(t.name, q[0], q[1] - fs / 2 - 6);
      if (hungry) { // how short it is, under the name
        const msg = "food " + Math.round(100 * t.food) + "%", sm = Math.max(9, fs - 3);
        ctx.font = "600 " + sm + "px ui-monospace, Menlo, monospace"; ctx.strokeText(msg, q[0], q[1] + sm / 2 - 2); ctx.fillStyle = "#ffb547"; ctx.fillText(msg, q[0], q[1] + sm / 2 - 2);
        ctx.font = "600 " + fs + "px -apple-system, system-ui, sans-serif"; boxes.push([box[0], box[1] + fs, box[2], sm + 4]);
      }
    }
  }
  /* A line's path on screen: every segment as a sampled great-circle arc. */
  path(L) {
    const pts = [];
    for (let k = 0; k + 1 < L.stops.length; k++) {
      const a = L.stops[k], b = L.stops[k + 1], m = Math.max(2, Math.ceil(arc(a, b) * 60 * Math.min(8, Math.sqrt(this.zoom))));
      for (let j = k ? 1 : 0; j <= m; j++) { const p = slerp(a, b, j / m); pts.push({ q: this.proj(p[0], p[1], p[2]), seg: k, t: j / m }); }
    }
    return pts;
  }
  drawLines() {
    const ctx = this.ctx, st = this.snap.stats, lw = Math.max(3, Math.min(8, this.radius() / 90));
    this.lines.forEach((L, li) => {
      if (!L.stops.length) return;
      const pts = this.path(L), info = st.lines && st.lines.find((x) => x.id === L.id);
      const crowd = {}; if (info) for (const sg of info.segs) crowd[sg.k] = Math.max(crowd[sg.k] || 0, sg.crowd);
      ctx.lineCap = "round"; ctx.lineJoin = "round";
      for (const pass of [0, 1]) {
        for (let k = 1; k < pts.length; k++) {
          const p = pts[k - 1].q, q = pts[k].q; if (p[2] < 0 || q[2] < 0) continue;
          const c = crowd[pts[k].seg] || 0;
          ctx.strokeStyle = pass ? (c > 1 ? mix(L.color, "#ff2a2a", 0.5 + 0.5 * Math.sin(this.t * 6)) : L.color) : "rgba(0,0,0,0.6)";
          ctx.lineWidth = pass ? lw * (li === this.sel ? 1.25 : 1) : lw + 3;
          ctx.beginPath(); ctx.moveTo(p[0], p[1]); ctx.lineTo(q[0], q[1]); ctx.stroke();
        }
      }
      if (L.stops.length > 1 && info) {
        const n = pts.length - 1, period = 14;
        for (let k = 0; k < L.trains; k++) {
          let f = ((this.t / period + k / L.trains) % 1) * 2; if (f > 1) f = 2 - f;
          const x = f * n, i = Math.min(n - 1, Math.floor(x)), u = x - i, p = pts[i].q, q = pts[i + 1].q;
          if (p[2] < 0) continue;
          ctx.fillStyle = "#fff"; ctx.strokeStyle = L.color; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.arc(p[0] + (q[0] - p[0]) * u, p[1] + (q[1] - p[1]) * u, lw * 0.75, 0, 2 * Math.PI); ctx.fill(); ctx.stroke();
        }
        // freight: an ochre block per wagon pair, on a slower clock
        const nf = Math.ceil((L.wagons || 0) / 2);
        for (let k = 0; k < nf; k++) {
          let f = ((this.t / (period * 1.7) + (k + 0.5) / nf) % 1) * 2; if (f > 1) f = 2 - f;
          const x = f * n, i = Math.min(n - 1, Math.floor(x)), u = x - i, p = pts[i].q, q = pts[i + 1].q;
          if (p[2] < 0) continue;
          const X = p[0] + (q[0] - p[0]) * u, Y = p[1] + (q[1] - p[1]) * u, a = lw * 0.8;
          ctx.fillStyle = "#c98a3a"; ctx.strokeStyle = "#1a1206"; ctx.lineWidth = 1.5;
          ctx.fillRect(X - a, Y - a * 0.7, 2 * a, 1.4 * a); ctx.strokeRect(X - a, Y - a * 0.7, 2 * a, 1.4 * a);
        }
      }
      L.stops.forEach((s, k) => {
        const q = this.proj(s[0], s[1], s[2]); if (q[2] < 0) return;
        ctx.fillStyle = "#fff"; ctx.strokeStyle = "#111"; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(q[0], q[1], lw * (k === L.stops.length - 1 && li === this.sel ? 1.3 : 0.95), 0, 2 * Math.PI); ctx.fill(); ctx.stroke();
      });
    });
  }
}

function nearest(W, p, from) {
  let i = from, best = W.V[3 * i] * p[0] + W.V[3 * i + 1] * p[1] + W.V[3 * i + 2] * p[2];
  for (;;) {
    let moved = false;
    for (const j of W.adj[i]) { const d = W.V[3 * j] * p[0] + W.V[3 * j + 1] * p[1] + W.V[3 * j + 2] * p[2]; if (d > best) { best = d; i = j; moved = true; } }
    if (!moved) return i;
  }
}
function hash(i) { let x = Math.imul(i ^ 0x9e3779b9, 0x85ebca6b); x ^= x >>> 13; x = Math.imul(x, 0xc2b2ae35); x ^= x >>> 16; return (x >>> 0) / 4294967296; }
function frame(p) { const a = Math.abs(p[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0], e1 = norm(cross(p, a)), e2 = cross(p, e1); return [e1, e2]; }
function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
function cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
function norm(a) { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; }
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

/* Orb — the renderer.

   Canvas 2D, orthographic. A few hundred convex polygons a frame is nothing
   for a 2D canvas, and orthographic keeps the maths to one 3×3 rotation: a
   cell's screen position is (R·site).xy, and it faces you when (R·site).z > 0.
   Cells near the limb get drawn back-to-front so their slivers overlap
   correctly; anything wholly behind is skipped.

   Hit-testing never touches the polygons. Un-project the pixel onto the
   sphere, rotate it back into model space, and take the nearest site — which
   is the definition of a Voronoi cell. */
(function () {
  "use strict";
  var NS = (typeof window !== "undefined") ? window : globalThis;
  var O = NS.ORB = NS.ORB || {};

  var NUM = ["", "#5ee8c1", "#ffc857", "#ff8a3d", "#ff2e4d", "#c77dff", "#4dabf7", "#e6e6ee", "#9a9ab5", "#9a9ab5"];
  var L = (function () { var l = Math.hypot(-0.45, 0.55, 0.75); return [-0.45 / l, 0.55 / l, 0.75 / l]; })();

  function View(canvas) {
    this.cv = canvas; this.ctx = canvas.getContext("2d");
    this.R = [1, 0, 0, 0, 1, 0, 0, 0, 1];
    this.zoom = 1; this.w = 0; this.h = 0; this.dpr = 1;
    this.state = null; this.anim = null; this.mark = null; this.hl = null; this.reticle = true; this.focusCell = -1;
  }

  View.prototype.resize = function () {
    var dpr = Math.min(2, NS.devicePixelRatio || 1), r = this.cv.getBoundingClientRect();
    this.dpr = dpr; this.w = r.width; this.h = r.height;
    this.cv.width = Math.round(r.width * dpr); this.cv.height = Math.round(r.height * dpr);
  };

  View.prototype.radius = function () { return Math.min(this.w, this.h) * 0.46 * this.zoom; };

  /* Rotate so the surface follows the finger: a drag of (dx, dy) pixels turns
     about screen-y then screen-x by arc length / radius. */
  View.prototype.drag = function (dx, dy) {
    var r = this.radius(), a = dx / r, b = dy / r;
    var ca = Math.cos(a), sa = Math.sin(a), cb = Math.cos(b), sb = Math.sin(b);
    var M = [ca, sa * sb, sa * cb, 0, cb, -sb, -sa, ca * sb, ca * cb]; // Ry(a)·Rx(b)
    this.R = mul(M, this.R); orthonormalise(this.R);
  };

  /* Turn so model-space unit vector p faces the viewer (used to frame a cell). */
  View.prototype.face = function (p, t) {
    var v = apply(this.R, p), axis = [v[1], -v[0], 0], s = Math.hypot(axis[0], axis[1]);
    var ang = Math.atan2(s, v[2]) * (t == null ? 1 : t);
    if (s < 1e-9) return;
    axis = [axis[0] / s, axis[1] / s, 0];
    this.R = mul(rotAxis(axis, ang), this.R); orthonormalise(this.R);
  };

  View.prototype.pick = function (px, py) {
    var r = this.radius(), x = (px - this.w / 2) / r, y = -(py - this.h / 2) / r, d = x * x + y * y;
    if (d > 1) return -1;
    var z = Math.sqrt(1 - d), R = this.R;
    // R is orthonormal: inverse = transpose
    return O.cellAt(this.state.mesh, R[0] * x + R[3] * y + R[6] * z, R[1] * x + R[4] * y + R[7] * z, R[2] * x + R[5] * y + R[8] * z);
  };

  View.prototype.draw = function (now) {
    var s = this.state, ctx = this.ctx, dpr = this.dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, this.w, this.h);
    if (!s) return false;
    var m = s.mesh, P = m.sites, V = m.verts, R = this.R, r = this.radius(), cx = this.w / 2, cy = this.h / 2;
    var busy = false;

    // halo
    var g = ctx.createRadialGradient(cx, cy, r * 0.9, cx, cy, r * 1.18);
    g.addColorStop(0, "rgba(94,232,193,0.16)"); g.addColorStop(1, "rgba(94,232,193,0)");
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, r * 1.18, 0, 6.2832); ctx.fill();
    ctx.fillStyle = "#050508"; ctx.beginPath(); ctx.arc(cx, cy, r, 0, 6.2832); ctx.fill();

    // rotate every Voronoi vertex once
    var nv = V.length / 3, VX = this._vx, VY, VZ;
    if (!VX || VX.length !== nv) { VX = this._vx = new Float32Array(nv); this._vy = new Float32Array(nv); this._vz = new Float32Array(nv); }
    VY = this._vy; VZ = this._vz;
    for (var k = 0; k < nv; k++) {
      var x = V[3 * k], y = V[3 * k + 1], z = V[3 * k + 2];
      VX[k] = R[0] * x + R[1] * y + R[2] * z; VY[k] = R[3] * x + R[4] * y + R[5] * z; VZ[k] = R[6] * x + R[7] * y + R[8] * z;
    }
    var order = [];
    for (var i = 0; i < m.n; i++) {
      var sz = R[6] * P[3 * i] + R[7] * P[3 * i + 1] + R[8] * P[3 * i + 2];
      if (sz > -0.3) order.push([sz, i]);
    }
    order.sort(function (a, b) { return a[0] - b[0]; });

    var cellR = r * Math.sqrt(4 / m.n); // ≈ typical cell radius, in px, at the centre
    var showMines = s.phase === "lost" || s.phase === "won";
    ctx.lineJoin = "round";
    ctx.textAlign = "center"; ctx.textBaseline = "middle";

    for (var o = 0; o < order.length; o++) {
      i = order[o][1];
      var ring = m.polys[i], front = false;
      for (k = 0; k < ring.length; k++) if (VZ[ring[k]] > 0) { front = true; break; }
      if (!front) continue;
      var sx = R[0] * P[3 * i] + R[1] * P[3 * i + 1] + R[2] * P[3 * i + 2];
      var sy = R[3] * P[3 * i] + R[4] * P[3 * i + 1] + R[5] * P[3 * i + 2];
      var szz = order[o][0];
      var lit = Math.max(0, sx * L[0] + sy * L[1] + szz * L[2]);
      var limb = Math.max(0, szz);

      // reveal ripple: 0 = still closed, 1 = fully open
      var openT = s.open[i] ? 1 : 0;
      if (this.anim && this.anim[i] != null) {
        openT = Math.min(1, Math.max(0, (now - this.anim[i]) / 160));
        if (openT < 1) busy = true;
      }

      var col;
      if (s.open[i] && s.mine[i]) col = [255, 46, 77];
      else if (showMines && s.mine[i] && !s.flag[i]) col = s.phase === "won" ? [70, 110, 100] : [110, 40, 55];
      else {
        var cr = [66 + 70 * lit, 70 + 70 * lit, 104 + 80 * lit];   // closed: raised, lit
        var op = [18 + 12 * lit, 18 + 12 * lit, 28 + 16 * lit];   // open: recessed
        col = [cr[0] + (op[0] - cr[0]) * openT, cr[1] + (op[1] - cr[1]) * openT, cr[2] + (op[2] - cr[2]) * openT];
      }
      var dim = 0.35 + 0.65 * Math.min(1, limb * 1.6);
      ctx.fillStyle = "rgb(" + (col[0] * dim | 0) + "," + (col[1] * dim | 0) + "," + (col[2] * dim | 0) + ")";
      ctx.beginPath();
      for (k = 0; k < ring.length; k++) {
        var vk = ring[k], px = cx + r * VX[vk], py = cy - r * VY[vk];
        if (k) ctx.lineTo(px, py); else ctx.moveTo(px, py);
      }
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = "#08080c"; ctx.lineWidth = Math.max(0.8, cellR * 0.06); ctx.stroke();

      var hx = cx + r * sx, hy = cy - r * sy, fs = cellR * (0.35 + 0.65 * Math.sqrt(limb)) * 0.95;
      if (this.hl && this.hl.has(i)) {
        ctx.strokeStyle = "rgba(255,200,87,0.95)"; ctx.lineWidth = Math.max(1.5, cellR * 0.12); ctx.stroke();
      }
      if (this.mark && this.mark.has(i)) {
        var pulse = 0.55 + 0.45 * Math.sin(now / 180);
        ctx.strokeStyle = "rgba(94,232,193," + pulse.toFixed(2) + ")"; ctx.lineWidth = Math.max(2, cellR * 0.16); ctx.stroke();
        busy = true;
      }
      if (limb < 0.08) continue;

      if (s.open[i] && !s.mine[i] && s.count[i] > 0 && openT > 0.5) {
        ctx.fillStyle = NUM[s.count[i]];
        ctx.font = "700 " + fs.toFixed(1) + "px ui-monospace, Menlo, Consolas, monospace";
        ctx.fillText(String(s.count[i]), hx, hy + fs * 0.04);
      } else if (s.flag[i]) {
        drawFlag(ctx, hx, hy, fs, showMines && !s.mine[i]);
      } else if (showMines && s.mine[i]) {
        drawMine(ctx, hx, hy, fs * 0.36, s.open[i]);
      }
    }

    // the reticle: the cell facing you (the orb's nearest point) and the
    // cells it counts. Drawn after every fill so no neighbour paints over the
    // outlines, which is the whole point on a mesh where "which cells touch
    // this one" is not obvious at a glance.
    this.focusCell = -1;
    if (this.reticle && (s.phase === "play" || s.phase === "ready")) {
      var fc = O.cellAt(m, R[6], R[7], R[8]);
      this.focusCell = fc;
      var ring2 = function (c) {
        var rr = m.polys[c];
        ctx.beginPath();
        for (var q = 0; q < rr.length; q++) { var w = rr[q], qx = cx + r * VX[w], qy = cy - r * VY[w]; if (q) ctx.lineTo(qx, qy); else ctx.moveTo(qx, qy); }
        ctx.closePath();
      };
      if (s.phase === "play") {
        ctx.strokeStyle = "rgba(94,232,193,0.9)"; ctx.lineWidth = Math.max(1.5, cellR * 0.1);
        for (k = 0; k < m.nbrs[fc].length; k++) { ring2(m.nbrs[fc][k]); ctx.stroke(); }
      }
      ring2(fc); ctx.strokeStyle = "rgba(255,255,255,0.95)"; ctx.lineWidth = Math.max(2, cellR * 0.14); ctx.stroke();
    }

    // specular sheen over the whole orb
    var sh = ctx.createRadialGradient(cx - r * 0.38, cy - r * 0.45, 0, cx - r * 0.38, cy - r * 0.45, r * 1.1);
    sh.addColorStop(0, "rgba(255,255,255,0.10)"); sh.addColorStop(0.5, "rgba(255,255,255,0.02)"); sh.addColorStop(1, "rgba(0,0,0,0.25)");
    ctx.fillStyle = sh; ctx.beginPath(); ctx.arc(cx, cy, r, 0, 6.2832); ctx.fill();
    return busy;
  };

  function drawFlag(ctx, x, y, s, wrong) {
    ctx.strokeStyle = "#e6e6ee"; ctx.lineWidth = Math.max(1, s * 0.09);
    ctx.beginPath(); ctx.moveTo(x - s * 0.18, y + s * 0.38); ctx.lineTo(x - s * 0.18, y - s * 0.38); ctx.stroke();
    ctx.fillStyle = "#ff6a3d";
    ctx.beginPath(); ctx.moveTo(x - s * 0.18, y - s * 0.38); ctx.lineTo(x + s * 0.32, y - s * 0.18); ctx.lineTo(x - s * 0.18, y + s * 0.02); ctx.closePath(); ctx.fill();
    if (wrong) {
      ctx.strokeStyle = "#ff2e4d"; ctx.lineWidth = Math.max(1.5, s * 0.12);
      ctx.beginPath(); ctx.moveTo(x - s * 0.4, y - s * 0.4); ctx.lineTo(x + s * 0.4, y + s * 0.4); ctx.moveTo(x + s * 0.4, y - s * 0.4); ctx.lineTo(x - s * 0.4, y + s * 0.4); ctx.stroke();
    }
  }
  function drawMine(ctx, x, y, r, boom) {
    ctx.fillStyle = boom ? "#08080c" : "#d8d8e6";
    ctx.strokeStyle = ctx.fillStyle; ctx.lineWidth = Math.max(1, r * 0.3);
    ctx.beginPath();
    for (var a = 0; a < 4; a++) {
      var t = a * Math.PI / 4;
      ctx.moveTo(x - Math.cos(t) * r * 1.5, y - Math.sin(t) * r * 1.5); ctx.lineTo(x + Math.cos(t) * r * 1.5, y + Math.sin(t) * r * 1.5);
    }
    ctx.stroke(); ctx.beginPath(); ctx.arc(x, y, r, 0, 6.2832); ctx.fill();
  }

  function mul(A, B) {
    var C = new Array(9);
    for (var i = 0; i < 3; i++) for (var j = 0; j < 3; j++)
      C[3 * i + j] = A[3 * i] * B[j] + A[3 * i + 1] * B[3 + j] + A[3 * i + 2] * B[6 + j];
    return C;
  }
  function apply(R, p) { return [R[0] * p[0] + R[1] * p[1] + R[2] * p[2], R[3] * p[0] + R[4] * p[1] + R[5] * p[2], R[6] * p[0] + R[7] * p[1] + R[8] * p[2]]; }
  function rotAxis(u, t) {
    var c = Math.cos(t), s = Math.sin(t), C = 1 - c, x = u[0], y = u[1], z = u[2];
    return [c + x * x * C, x * y * C - z * s, x * z * C + y * s,
      y * x * C + z * s, c + y * y * C, y * z * C - x * s,
      z * x * C - y * s, z * y * C + x * s, c + z * z * C];
  }
  function orthonormalise(R) { // Gram–Schmidt on the rows; drag drift never accumulates
    var a = [R[0], R[1], R[2]], l = Math.hypot(a[0], a[1], a[2]); a = [a[0] / l, a[1] / l, a[2] / l];
    var b = [R[3], R[4], R[5]], d = a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
    b = [b[0] - d * a[0], b[1] - d * a[1], b[2] - d * a[2]]; l = Math.hypot(b[0], b[1], b[2]); b = [b[0] / l, b[1] / l, b[2] / l];
    var c = [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
    R[0] = a[0]; R[1] = a[1]; R[2] = a[2]; R[3] = b[0]; R[4] = b[1]; R[5] = b[2]; R[6] = c[0]; R[7] = c[1]; R[8] = c[2];
  }

  O.View = View;
})();

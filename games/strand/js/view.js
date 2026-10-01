/* Strand — the renderer.

   Same projection as /orb/: orthographic, one 3×3 rotation, canvas 2D,
   back hemisphere skipped. Two looks:
     atoms   ball and stick: bonds as thin lines, atoms as dots, a strand as
             a thick coloured line along its bonds.
     panels  cells as polygons tinted by the strand that paints them, walls
             as bright bars on the shared edge, a strand as a line through
             cell centres. A bridge cell shows its two lanes as a cross and
             its closed sides as walls.
   Picking is "nearest cell centre", which on a Voronoi board is exactly the
   cell under the finger and on C60 is close enough. */
(function () {
  "use strict";
  var NS = (typeof window !== "undefined") ? window : globalThis;
  var S = NS.STRAND = NS.STRAND || {};

  S.COLORS = ["#ff4d4d", "#3ddc84", "#4d8dff", "#ffd23f", "#ff9a3c", "#3fe0e8", "#e05cff", "#b0603a",
    "#9b6bff", "#f2f2f2", "#8fa0b0", "#b8f03c", "#d9b38c", "#2f55c8", "#1fa88e", "#ff8fc7"];

  function View(canvas) {
    this.cv = canvas; this.ctx = canvas.getContext("2d");
    this.R = [1, 0, 0, 0, 1, 0, 0, 0, 1]; this.zoom = 1; this.w = 0; this.h = 0; this.dpr = 1;
    this.game = null;
  }
  View.prototype.resize = function () {
    var dpr = Math.min(2, NS.devicePixelRatio || 1), r = this.cv.getBoundingClientRect();
    this.dpr = dpr; this.w = r.width; this.h = r.height;
    this.cv.width = Math.round(r.width * dpr); this.cv.height = Math.round(r.height * dpr);
  };
  View.prototype.radius = function () { return Math.min(this.w, this.h) * 0.44 * this.zoom; };
  View.prototype.drag = function (dx, dy) {
    var r = this.radius(), a = dx / r, b = dy / r, ca = Math.cos(a), sa = Math.sin(a), cb = Math.cos(b), sb = Math.sin(b);
    this.R = mul([ca, sa * sb, sa * cb, 0, cb, -sb, -sa, ca * sb, ca * cb], this.R); ortho(this.R);
  };
  View.prototype.face = function (p, t) {
    var v = apply(this.R, p), s = Math.hypot(v[1], v[0]);
    if (s < 1e-9) return;
    var ang = Math.atan2(s, v[2]) * (t == null ? 1 : t), u = [v[1] / s, -v[0] / s, 0];
    this.R = mul(rotAxis(u, ang), this.R); ortho(this.R);
  };
  /* The cell under a screen point: nearest centre on the front hemisphere. */
  View.prototype.pick = function (px, py) {
    var b = this.game.board, r = this.radius(), x = (px - this.w / 2) / r, y = -(py - this.h / 2) / r, d = x * x + y * y;
    if (d > 1) return -1;
    var z = Math.sqrt(1 - d), R = this.R;
    var mx = R[0] * x + R[3] * y + R[6] * z, my = R[1] * x + R[4] * y + R[7] * z, mz = R[2] * x + R[5] * y + R[8] * z;
    var best = -2, bi = -1, P = b.pos;
    for (var i = 0; i < b.n; i++) { var dd = P[3 * i] * mx + P[3 * i + 1] * my + P[3 * i + 2] * mz; if (dd > best) { best = dd; bi = i; } }
    return bi;
  };
  View.prototype.project = function (P, i) {
    var R = this.R, x = P[3 * i], y = P[3 * i + 1], z = P[3 * i + 2], r = this.radius();
    var X = R[0] * x + R[1] * y + R[2] * z, Y = R[3] * x + R[4] * y + R[5] * z, Z = R[6] * x + R[7] * y + R[8] * z;
    return [this.w / 2 + r * X, this.h / 2 - r * Y, Z];
  };

  View.prototype.draw = function () {
    var ctx = this.ctx, g = this.game, dpr = this.dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, this.w, this.h);
    if (!g) return;
    var b = g.board, r = this.radius(), cx = this.w / 2, cy = this.h / 2, self = this;
    var cellR = r * Math.sqrt(4 / b.n);
    var halo = ctx.createRadialGradient(cx, cy, r * 0.92, cx, cy, r * 1.15);
    halo.addColorStop(0, "rgba(120,140,255,0.14)"); halo.addColorStop(1, "rgba(120,140,255,0)");
    ctx.fillStyle = halo; ctx.beginPath(); ctx.arc(cx, cy, r * 1.15, 0, 6.2832); ctx.fill();
    ctx.fillStyle = "#07070b"; ctx.beginPath(); ctx.arc(cx, cy, r, 0, 6.2832); ctx.fill();

    var C = b.pos.length / 3, pc = new Array(C);
    for (var i = 0; i < C; i++) pc[i] = this.project(b.pos, i);
    var vis = function (z) { return z > -0.05; };
    var fade = function (z) { return Math.max(0, Math.min(1, (z + 0.05) * 3)); };
    var cellColor = function (c) { // the strand painting cell c (a bridge counts if either lane is painted)
      var nodes = g.nodesOf[c], col = -1;
      for (var k = 0; k < nodes.length; k++) if (g.owner[nodes[k]] >= 0) col = g.owner[nodes[k]];
      return col;
    };

    if (b.kind === "panels") {
      var V = b.verts, pv = new Array(V.length / 3);
      for (i = 0; i < pv.length; i++) pv[i] = this.project(V, i);
      var order = [];
      for (i = 0; i < b.n; i++) if (vis(pc[i][2])) order.push(i);
      order.sort(function (a, c) { return pc[a][2] - pc[c][2]; });
      order.forEach(function (c) {
        var ring = b.polys[c], col = cellColor(c), f = fade(pc[c][2]);
        ctx.beginPath();
        ring.forEach(function (v, k) { if (k) ctx.lineTo(pv[v][0], pv[v][1]); else ctx.moveTo(pv[v][0], pv[v][1]); });
        ctx.closePath();
        var lit = 0.45 + 0.55 * Math.max(0, pc[c][2]);
        ctx.fillStyle = col >= 0 ? mix(S.COLORS[col % 16], 0.32 * lit) : "rgb(" + Math.round(26 * lit + 10) + "," + Math.round(28 * lit + 10) + "," + Math.round(44 * lit + 14) + ")";
        ctx.globalAlpha = 0.35 + 0.65 * f;
        ctx.fill();
        ctx.strokeStyle = "#05050a"; ctx.lineWidth = Math.max(1, cellR * 0.05); ctx.stroke();
        ctx.globalAlpha = 1;
      });
      // walls (and the closed sides of bridges) on top of every fill
      ctx.lineCap = "round";
      g.wallSegs.forEach(function (w) {
        var A = pv[w[0]], B = pv[w[1]];
        if (!vis(A[2]) && !vis(B[2])) return;
        ctx.strokeStyle = "rgba(230,232,255," + (0.35 + 0.6 * fade(Math.min(A[2], B[2]))).toFixed(2) + ")";
        ctx.lineWidth = Math.max(2.5, cellR * 0.16);
        ctx.beginPath(); ctx.moveTo(A[0], A[1]); ctx.lineTo(B[0], B[1]); ctx.stroke();
      });
      // bridge lane guides
      g.level.bridges.forEach(function (br) {
        var c = br.cell; if (!vis(pc[c][2])) return;
        ctx.strokeStyle = "rgba(255,255,255,0.22)"; ctx.lineWidth = Math.max(1.5, cellR * 0.08);
        br.lanes.forEach(function (L) {
          var a = mid(pc[c], pc[L[0]]), z = mid(pc[c], pc[L[1]]);
          ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(z[0], z[1]); ctx.stroke();
        });
      });
    } else {
      // bonds
      ctx.lineCap = "round";
      for (i = 0; i < b.n; i++) b.nbrs[i].forEach(function (j) {
        if (j < i || (!vis(pc[i][2]) && !vis(pc[j][2]))) return;
        var walled = g.wallSet.has(i < j ? i + "-" + j : j + "-" + i), f = fade(Math.min(pc[i][2], pc[j][2]));
        ctx.globalAlpha = 0.25 + 0.75 * f;
        if (walled) {
          var m = mid(pc[i], pc[j]);
          ctx.strokeStyle = "#ff5a6e"; ctx.lineWidth = Math.max(1.5, cellR * 0.08);
          var dx = (pc[j][0] - pc[i][0]) * 0.18, dy = (pc[j][1] - pc[i][1]) * 0.18;
          ctx.beginPath(); ctx.moveTo(m[0] - dy, m[1] + dx); ctx.lineTo(m[0] + dy, m[1] - dx); ctx.stroke();
        } else {
          ctx.strokeStyle = "#3a3d58"; ctx.lineWidth = Math.max(1, cellR * 0.07);
          ctx.beginPath(); ctx.moveTo(pc[i][0], pc[i][1]); ctx.lineTo(pc[j][0], pc[j][1]); ctx.stroke();
        }
        ctx.globalAlpha = 1;
      });
    }

    // strands
    ctx.lineCap = "round"; ctx.lineJoin = "round";
    g.strands.forEach(function (st, k) {
      if (st.length < 2) return;
      ctx.strokeStyle = S.COLORS[k % 16];
      ctx.lineWidth = b.kind === "atoms" ? Math.max(3, cellR * 0.28) : Math.max(3, cellR * 0.3);
      for (var q = 1; q < st.length; q++) {
        var A = pc[g.cellOf[st[q - 1]]], B = pc[g.cellOf[st[q]]];
        if (!vis(A[2]) && !vis(B[2])) continue;
        ctx.globalAlpha = 0.3 + 0.7 * fade(Math.min(A[2], B[2]));
        ctx.beginPath(); ctx.moveTo(A[0], A[1]); ctx.lineTo(B[0], B[1]); ctx.stroke();
      }
      ctx.globalAlpha = 1;
    });
    // atoms
    if (b.kind === "atoms") for (i = 0; i < b.n; i++) {
      if (!vis(pc[i][2])) continue;
      var col = cellColor(i);
      ctx.globalAlpha = 0.3 + 0.7 * fade(pc[i][2]);
      ctx.fillStyle = col >= 0 ? S.COLORS[col % 16] : "#5c6080";
      ctx.beginPath(); ctx.arc(pc[i][0], pc[i][1], Math.max(2, cellR * (col >= 0 ? 0.16 : 0.11)), 0, 6.2832); ctx.fill();
      ctx.globalAlpha = 1;
    }
    // endpoints
    g.level.pairs.forEach(function (p, k) {
      p.forEach(function (node) {
        var c = g.cellOf[node], P = pc[c];
        if (!vis(P[2])) return;
        var rr = (b.kind === "atoms" ? 0.36 : 0.42) * cellR * (0.55 + 0.45 * Math.max(0, P[2]));
        ctx.globalAlpha = 0.35 + 0.65 * fade(P[2]);
        ctx.fillStyle = S.COLORS[k % 16];
        ctx.beginPath(); ctx.arc(P[0], P[1], rr, 0, 6.2832); ctx.fill();
        if (g.done[k]) { ctx.strokeStyle = "#ffffff"; ctx.lineWidth = Math.max(1.5, rr * 0.18); ctx.stroke(); }
        ctx.globalAlpha = 1;
      });
    });
    // sheen
    var sh = ctx.createRadialGradient(cx - r * 0.4, cy - r * 0.45, 0, cx - r * 0.4, cy - r * 0.45, r * 1.1);
    sh.addColorStop(0, "rgba(255,255,255,0.08)"); sh.addColorStop(0.6, "rgba(255,255,255,0)"); sh.addColorStop(1, "rgba(0,0,0,0.28)");
    ctx.fillStyle = sh; ctx.beginPath(); ctx.arc(cx, cy, r, 0, 6.2832); ctx.fill();
  };

  function mid(a, b) { return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2]; }
  function mix(hex, t) { // the colour, darkened toward the background
    var n = parseInt(hex.slice(1), 16), r = n >> 16, gg = (n >> 8) & 255, b = n & 255;
    return "rgb(" + Math.round(10 + (r - 10) * t) + "," + Math.round(10 + (gg - 10) * t) + "," + Math.round(16 + (b - 16) * t) + ")";
  }
  function mul(A, B) {
    var C = new Array(9);
    for (var i = 0; i < 3; i++) for (var j = 0; j < 3; j++) C[3 * i + j] = A[3 * i] * B[j] + A[3 * i + 1] * B[3 + j] + A[3 * i + 2] * B[6 + j];
    return C;
  }
  function apply(R, p) { return [R[0] * p[0] + R[1] * p[1] + R[2] * p[2], R[3] * p[0] + R[4] * p[1] + R[5] * p[2], R[6] * p[0] + R[7] * p[1] + R[8] * p[2]]; }
  function rotAxis(u, t) {
    var c = Math.cos(t), s = Math.sin(t), C = 1 - c, x = u[0], y = u[1], z = u[2];
    return [c + x * x * C, x * y * C - z * s, x * z * C + y * s, y * x * C + z * s, c + y * y * C, y * z * C - x * s, z * x * C - y * s, z * y * C + x * s, c + z * z * C];
  }
  function ortho(R) {
    var a = [R[0], R[1], R[2]], l = Math.hypot(a[0], a[1], a[2]); a = [a[0] / l, a[1] / l, a[2] / l];
    var b = [R[3], R[4], R[5]], d = a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
    b = [b[0] - d * a[0], b[1] - d * a[1], b[2] - d * a[2]]; l = Math.hypot(b[0], b[1], b[2]); b = [b[0] / l, b[1] / l, b[2] / l];
    var c = [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
    R[0] = a[0]; R[1] = a[1]; R[2] = a[2]; R[3] = b[0]; R[4] = b[1]; R[5] = b[2]; R[6] = c[0]; R[7] = c[1]; R[8] = c[2];
  }

  S.View = View;
})();

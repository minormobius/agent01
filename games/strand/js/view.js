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
    this.mode = "globe";   // "globe": orthographic, the near half | "whole": equal-area, all of it
    this.mini = true;      // the whole-sphere inset, in globe mode
  }
  View.prototype.resize = function () {
    var dpr = Math.min(2, NS.devicePixelRatio || 1), r = this.cv.getBoundingClientRect();
    this.dpr = dpr; this.w = r.width; this.h = r.height;
    this.cv.width = Math.round(r.width * dpr); this.cv.height = Math.round(r.height * dpr);
  };
  View.prototype.radius = function () { return Math.min(this.w, this.h) * (this.mode === "whole" ? 0.48 : 0.44) * this.zoom; };
  View.prototype.main = function () { return { cx: this.w / 2, cy: this.h / 2, r: this.radius(), mode: this.mode }; };
  /* The inset: top right, sized to the space above the globe where there is some. */
  View.prototype.inset = function () {
    var mr = Math.max(34, Math.min(80, Math.min(this.w, this.h) * 0.15));
    return { cx: this.w - mr - 6, cy: mr + 6, r: mr, mode: "whole", mini: true };
  };
  /* Turn by a screen drag. In the whole view a pixel near the centre is
     worth twice the angle (the disc's radius spans 180°, not 90°). */
  View.prototype.drag = function (dx, dy) {
    if (this.torus()) { this.camFor().drag(dx, dy, this.tmode(), this.w, this.h); return; }
    var r = this.radius() * (this.mode === "whole" ? 0.5 : 1), a = dx / r, b = dy / r, ca = Math.cos(a), sa = Math.sin(a), cb = Math.cos(b), sb = Math.sin(b);
    this.R = mul([ca, sa * sb, sa * cb, 0, cb, -sb, -sa, ca * sb, ca * cb], this.R); ortho(this.R);
  };
  View.prototype.face = function (p, t) {
    var v = apply(this.R, p), s = Math.hypot(v[1], v[0]);
    if (s < 1e-9) return;
    var ang = Math.atan2(s, v[2]) * (t == null ? 1 : t), u = [v[1] / s, -v[0] / s, 0];
    this.R = mul(rotAxis(u, ang), this.R); ortho(this.R);
  };

  /* Projections, in view space (z toward you):
       globe  orthographic: (x, y). Only z > 0 is the near side.
       whole  Lambert azimuthal equal-area: (x, y)·√(2/(1+z)). The whole
              sphere fits in a disc of radius 2, areas true, no seam but the
              single point directly behind; the near hemisphere is the inner
              disc of radius √2. */
  function proj(R, P, i, vp) {
    var x = P[3 * i], y = P[3 * i + 1], z = P[3 * i + 2];
    var X = R[0] * x + R[1] * y + R[2] * z, Y = R[3] * x + R[4] * y + R[5] * z, Z = R[6] * x + R[7] * y + R[8] * z;
    if (vp.mode === "globe") return [vp.cx + vp.r * X, vp.cy - vp.r * Y, Z];
    var k = Math.sqrt(2 / Math.max(1e-4, 1 + Z)) * vp.r / 2;
    return [vp.cx + k * X, vp.cy - k * Y, Z];
  }
  View.prototype.project = function (P, i) { return proj(this.R, P, i, this.main()); };
  /* Screen → a unit vector in model space, or null off the sphere. */
  View.prototype.unproject = function (px, py, vp) {
    vp = vp || this.main();
    var X = (px - vp.cx) / vp.r, Y = -(py - vp.cy) / vp.r, x, y, z;
    if (vp.mode === "globe") { var d = X * X + Y * Y; if (d > 1) return null; x = X; y = Y; z = Math.sqrt(1 - d); }
    else { X *= 2; Y *= 2; var p2 = X * X + Y * Y; if (p2 > 4) return null; var s = Math.sqrt(1 - p2 / 4); x = X * s; y = Y * s; z = 1 - p2 / 2; }
    var R = this.R; // orthonormal: inverse = transpose
    return [R[0] * x + R[3] * y + R[6] * z, R[1] * x + R[4] * y + R[7] * z, R[2] * x + R[5] * y + R[8] * z];
  };
  View.prototype.inInset = function (px, py) {
    if (this.torus()) { if (this.mode !== "globe" || !this.mini) return false; var iv = this.tinset(); return Math.abs(px - iv.cx) <= iv.w / 2 && Math.abs(py - iv.cy) <= iv.h / 2; }
    if (this.mode !== "globe" || !this.mini) return false;
    var vp = this.inset();
    return Math.hypot(px - vp.cx, py - vp.cy) <= vp.r;
  };
  /* The cell under a screen point: the nearest cell centre (exact for
     Voronoi panels, close enough on C60). */
  View.prototype.pick = function (px, py) {
    if (this.torus()) return this.tframe(this.tmain(), this.tmode()).pick(px, py);
    var m = this.unproject(px, py);
    if (!m) return -1;
    var b = this.game.board, best = -2, bi = -1, P = b.pos;
    for (var i = 0; i < b.n; i++) { var dd = P[3 * i] * m[0] + P[3 * i + 1] * m[1] + P[3 * i + 2] * m[2]; if (dd > best) { best = dd; bi = i; } }
    return bi;
  };

  View.prototype.draw = function () {
    var ctx = this.ctx, dpr = this.dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, this.w, this.h);
    if (!this.game) return;
    if (this.torus()) {
      this.tscene(this.tframe(this.tmain(), this.tmode()), false);
      if (this.mode === "globe" && this.mini) this.tscene(this.tframe(this.tinset(), "flat"), true);
      return;
    }
    this.scene(this.main());
    if (this.mode === "globe" && this.mini) this.scene(this.inset());
  };

  /* ------------------------------------------------------------ the torus
     Torus boards (../orb/js/torus.js) draw through a TorusFrame instead of
     the sphere's projections: "globe" is the donut, "whole" the flat map
     (the torus's exact map: a rectangle that wraps both ways), and the inset
     is the flat map too. A drag slides the skin; nothing turns. */
  View.prototype.torus = function () { return !!(this.game && this.game.board.topology === "torus"); };
  View.prototype.tmode = function () { return this.mode === "whole" ? "flat" : "donut"; };
  View.prototype.camFor = function () {
    var m = this.game.board.mesh;
    if (!this.cam || this.cam.mesh !== m) this.cam = new NS.ORB.TorusCam(m);
    this.cam.zoom = this.zoom; return this.cam;
  };
  View.prototype.tmain = function () { return { cx: this.w / 2, cy: this.h / 2, w: this.w, h: this.h }; };
  View.prototype.tinset = function () {
    var m = this.game.board.mesh, iw = Math.max(90, Math.min(170, this.w * 0.34)), ih = iw * m.H / m.W;
    return { cx: this.w - iw / 2 - 8, cy: ih / 2 + 8, w: iw, h: ih, mini: true };
  };
  View.prototype.tframe = function (vp, mode) { return new NS.ORB.TorusFrame(this.camFor(), vp, mode); };
  /* Flat point under an inset tap, and easing a cell or point to the front. */
  View.prototype.insetPoint = function (px, py) {
    var F = this.tframe(this.tinset(), "flat"), m = this.game.board.mesh;
    return F.flatAt(px, py);
  };
  View.prototype.towardCell = function (c, t) {
    var b = this.game.board;
    if (this.torus()) { this.camFor().toward(b.mesh.sites[2 * c], b.mesh.sites[2 * c + 1], t); return; }
    this.face([b.pos[3 * c], b.pos[3 * c + 1], b.pos[3 * c + 2]], t);
  };
  View.prototype.towardPoint = function (p, t) { if (this.torus()) this.camFor().toward(p[0], p[1], t); else this.face(p, t); };

  View.prototype.tscene = function (F, mini) {
    var ctx = this.ctx, g = this.game, b = g.board, m = b.mesh, donut = F.mode === "donut", cam = F.cam;
    var cellR = Math.max(3, F.cellR);
    var cellColor = function (c) {
      var nodes = g.nodesOf[c], col = -1;
      for (var k = 0; k < nodes.length; k++) if (g.owner[nodes[k]] >= 0) col = g.owner[nodes[k]];
      return col;
    };
    var LT = (function () { var l = Math.hypot(-0.35, -0.55, 0.75); return [-0.35 / l, -0.55 / l, 0.75 / l]; })();
    var lit = function (i) { if (!donut) return 0.8; var e = cam.embed(m.sites[2 * i], m.sites[2 * i + 1]); return 0.35 + 0.65 * Math.max(0, e.n[0] * LT[0] + e.n[1] * LT[1] + e.n[2] * LT[2]); };
    var seen = function (P) { return donut ? P[3] : true; };
    var line = function (A, B) { ctx.beginPath(); ctx.moveTo(A[0], A[1]); ctx.lineTo(B[0], B[1]); ctx.stroke(); };
    var trace = function (ring) { ctx.beginPath(); ring.forEach(function (p, k) { if (k) ctx.lineTo(p[0], p[1]); else ctx.moveTo(p[0], p[1]); }); ctx.closePath(); };

    if (mini) { ctx.fillStyle = "rgba(12,12,20,0.92)"; ctx.fillRect(F.vp.cx - F.vp.w / 2 - 3, F.vp.cy - F.vp.h / 2 - 3, F.vp.w + 6, F.vp.h + 6); ctx.save(); ctx.beginPath(); ctx.rect(F.vp.cx - F.vp.w / 2, F.vp.cy - F.vp.h / 2, F.vp.w, F.vp.h); ctx.clip(); }
    else if (donut) {
      ctx.fillStyle = "rgba(120,140,255,0.05)"; ctx.beginPath();
      ctx.ellipse(F.vp.cx, F.vp.cy, F.k * (cam.R + cam.r) * 1.08, F.k * ((cam.R + cam.r) * Math.sin(cam.tilt) + cam.r * Math.cos(cam.tilt)) * 1.08, 0, 0, 6.2832); ctx.fill();
    }

    F.tiles.forEach(function (t) {
      ctx.save(); ctx.translate(t[0], t[1]);
      ctx.lineCap = "round"; ctx.lineJoin = "round";
      if (b.kind === "panels") {
        F.order.forEach(function (c) {
          var ring = F.ring(c); if (!ring) return;
          var col = cellColor(c), L = lit(c), face = donut ? Math.max(0, F.P[c][4]) : 1;
          trace(ring);
          ctx.fillStyle = col >= 0 ? mix(S.COLORS[col % 16], 0.32 * L + 0.1) : "rgb(" + Math.round(26 * L + 10) + "," + Math.round(28 * L + 10) + "," + Math.round(44 * L + 14) + ")";
          ctx.globalAlpha = donut ? 0.45 + 0.55 * Math.min(1, face * 2) : 1;
          ctx.fill();
          if (!mini) { ctx.strokeStyle = "#05050a"; ctx.lineWidth = Math.max(0.8, cellR * 0.05); ctx.stroke(); }
          ctx.globalAlpha = 1;
        });
        if (!mini) {
          // walls: the edge two cells share
          ctx.strokeStyle = "rgba(230,232,255,0.92)"; ctx.lineWidth = Math.max(2.5, cellR * 0.16);
          g.wallPairs.forEach(function (w) {
            var a = w[0], c = w[1], common = b.polys[a].filter(function (x) { return b.polys[c].indexOf(x) >= 0; });
            if (common.length < 2) return;
            var A = F.corner(common[0], a), B = F.corner(common[1], a);
            if (donut && (!(F.P[a][3] || F.P[c][3]) || A[3] < 0.02 || B[3] < 0.02)) return; // both corners must face you
            line(A, B);
          });
          ctx.strokeStyle = "rgba(255,255,255,0.22)"; ctx.lineWidth = Math.max(1.5, cellR * 0.08);
          g.level.bridges.forEach(function (br) {
            var c = br.cell, C = F.cell(c); if (!seen(C)) return;
            br.lanes.forEach(function (Ln) { var a = F.near(Ln[0], c), z = F.near(Ln[1], c); line(mid(C, a), mid(C, z)); });
          });
        }
      } else {
        // the nanotorus: the honeycomb it is made of, faintly, so the atoms sit on a surface
        if (b.surface) {
          var SF = new NS.ORB.TorusFrame(cam, F.vp, F.mode, b.surface);
          SF.order.forEach(function (c) {
            var ring = SF.ring(c); if (!ring) return;
            var face = donut ? Math.max(0, SF.P[c][4]) : 1, e = donut ? cam.embed(b.surface.sites[2 * c], b.surface.sites[2 * c + 1]) : null;
            var L = donut ? 0.35 + 0.65 * Math.max(0, e.n[0] * LT[0] + e.n[1] * LT[1] + e.n[2] * LT[2]) : 0.7;
            trace(ring); ctx.globalAlpha = donut ? 0.4 + 0.6 * Math.min(1, face * 2) : 1;
            ctx.fillStyle = "rgb(" + Math.round(16 + 18 * L) + "," + Math.round(17 + 19 * L) + "," + Math.round(26 + 30 * L) + ")"; ctx.fill();
            ctx.globalAlpha = 1;
          });
        }
        // bonds, then atoms
        for (var i = 0; i < b.n; i++) b.nbrs[i].forEach(function (j) {
          if (j < i) return;
          var A = F.cell(i), B = F.near(j, i);
          if (!seen(A) || (donut && !F.P[j][3])) return;
          var walled = g.wallSet.has(i < j ? i + "-" + j : j + "-" + i);
          if (walled) {
            if (mini) return;
            var M = mid(A, B), dx = (B[0] - A[0]) * 0.18, dy = (B[1] - A[1]) * 0.18;
            ctx.strokeStyle = "#ff5a6e"; ctx.lineWidth = Math.max(1.5, cellR * 0.08); line([M[0] - dy, M[1] + dx], [M[0] + dy, M[1] - dx]);
          } else { ctx.strokeStyle = "#3a3d58"; ctx.lineWidth = mini ? 0.7 : Math.max(1, cellR * 0.07); line(A, B); }
        });
      }
      // strands
      g.strands().forEach(function (st) {
        var nodes = st.nodes; if (nodes.length < 2) return;
        var lw = mini ? 1.6 : Math.max(3, cellR * (b.kind === "atoms" ? 0.28 : 0.3));
        ctx.strokeStyle = S.COLORS[st.k % 16]; ctx.lineWidth = lw; ctx.setLineDash(st.anchored || mini ? [] : [lw * 0.9, lw * 0.9]);
        ctx.globalAlpha = st.anchored ? 1 : 0.75;
        for (var q = 1; q < nodes.length; q++) {
          var a = g.cellOf[nodes[q - 1]], c = g.cellOf[nodes[q]], A = F.cell(a), B = F.near(c, a);
          if (donut && !(F.P[a][3] && F.P[c][3])) continue;
          line(A, B);
        }
        ctx.setLineDash([]); ctx.globalAlpha = 1;
      });
      if (b.kind === "atoms" && !mini) for (var a = 0; a < b.n; a++) {
        var P = F.cell(a); if (!seen(P)) continue;
        var col = cellColor(a);
        ctx.fillStyle = col >= 0 ? S.COLORS[col % 16] : "#5c6080";
        ctx.beginPath(); ctx.arc(P[0], P[1], Math.max(2, cellR * (col >= 0 ? 0.16 : 0.11) * (donut ? 0.6 + 0.4 * P[4] : 1)), 0, 6.2832); ctx.fill();
      }
      // the ends
      g.level.pairs.forEach(function (p, k) {
        p.forEach(function (node) {
          var c = g.cellOf[node], P = F.cell(c); if (!seen(P)) return;
          var rr = mini ? 2.4 : (b.kind === "atoms" ? 0.36 : 0.42) * cellR * (donut ? 0.55 + 0.45 * Math.max(0, P[4]) : 1);
          ctx.fillStyle = S.COLORS[k % 16]; ctx.beginPath(); ctx.arc(P[0], P[1], rr, 0, 6.2832); ctx.fill();
          if (g.done[k] && !mini) { ctx.strokeStyle = "#ffffff"; ctx.lineWidth = Math.max(1.5, rr * 0.18); ctx.stroke(); }
        });
      });
      ctx.restore();
    });

    if (mini) {
      ctx.restore();
      ctx.strokeStyle = "#2a2a40"; ctx.lineWidth = 1; ctx.strokeRect(F.vp.cx - F.vp.w / 2, F.vp.cy - F.vp.h / 2, F.vp.w, F.vp.h);
      // the donut's front, where the main view is looking
      ctx.strokeStyle = "rgba(255,255,255,0.85)"; ctx.lineWidth = 1.3; ctx.beginPath(); ctx.arc(F.vp.cx, F.vp.cy, Math.max(4, cellR * 1.6), 0, 6.2832); ctx.stroke();
    } else if (!donut) {
      ctx.strokeStyle = "rgba(160,170,255,0.25)"; ctx.setLineDash([5, 6]); ctx.lineWidth = 1;
      ctx.strokeRect(F.box[0], F.box[1], F.box[2], F.box[3]); ctx.setLineDash([]);
    }
  };

  View.prototype.scene = function (vp) {
    var ctx = this.ctx, g = this.game, b = g.board, R = this.R, cx = vp.cx, cy = vp.cy, r = vp.r;
    var whole = vp.mode === "whole", mini = !!vp.mini;
    var cellR = (whole ? r / 2 : r) * Math.sqrt(4 / b.n);
    var BACK = -0.9; // in the whole view, skip what's within ~25° of the point behind (it smears round the rim)
    var vis = whole ? function (z) { return z > BACK; } : function (z) { return z > -0.05; };
    var fade = whole ? function () { return 1; } : function (z) { return Math.max(0, Math.min(1, (z + 0.05) * 3)); };
    var shade = whole ? function (z) { return 0.35 + 0.65 * (z + 1) / 2; } : function (z) { return 0.45 + 0.55 * Math.max(0, z); };
    // near the point behind, sphere-neighbours can land far apart in the
    // equal-area disc; a link stretched past a few cell widths is that
    // wrap-around, never a real local shape, so it isn't drawn
    var LONG = cellR * 5;
    var near = whole ? function (A, B) { return Math.hypot(A[0] - B[0], A[1] - B[1]) < LONG; } : function () { return true; };

    if (!mini && !whole) {
      var halo = ctx.createRadialGradient(cx, cy, r * 0.92, cx, cy, r * 1.15);
      halo.addColorStop(0, "rgba(120,140,255,0.14)"); halo.addColorStop(1, "rgba(120,140,255,0)");
      ctx.fillStyle = halo; ctx.beginPath(); ctx.arc(cx, cy, r * 1.15, 0, 6.2832); ctx.fill();
    }
    ctx.fillStyle = mini ? "rgba(12,12,20,0.92)" : "#07070b";
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, 6.2832); ctx.fill();
    if (mini) { ctx.strokeStyle = "#2a2a40"; ctx.lineWidth = 1; ctx.stroke(); }

    var C = b.pos.length / 3, pc = new Array(C), i;
    for (i = 0; i < C; i++) pc[i] = proj(R, b.pos, i, vp);
    var cellColor = function (c) {
      var nodes = g.nodesOf[c], col = -1;
      for (var k = 0; k < nodes.length; k++) if (g.owner[nodes[k]] >= 0) col = g.owner[nodes[k]];
      return col;
    };

    if (b.kind === "panels") {
      var V = b.verts, pv = new Array(V.length / 3);
      for (i = 0; i < pv.length; i++) pv[i] = proj(R, V, i, vp);
      var order = [];
      for (i = 0; i < b.n; i++) {
        if (!vis(pc[i][2])) continue;
        if (whole) {
          var ring_ = b.polys[i], bad = false;
          for (var q_ = 0; q_ < ring_.length && !bad; q_++) { var A_ = pv[ring_[q_]], B_ = pv[ring_[(q_ + 1) % ring_.length]]; if (A_[2] <= BACK || !near(A_, B_)) bad = true; }
          if (bad) continue;
        }
        order.push(i);
      }
      order.sort(function (a, c) { return pc[a][2] - pc[c][2]; });
      order.forEach(function (c) {
        var ring = b.polys[c], col = cellColor(c), f = fade(pc[c][2]), lit = shade(pc[c][2]);
        ctx.beginPath();
        ring.forEach(function (v, k) { if (k) ctx.lineTo(pv[v][0], pv[v][1]); else ctx.moveTo(pv[v][0], pv[v][1]); });
        ctx.closePath();
        ctx.fillStyle = col >= 0 ? mix(S.COLORS[col % 16], 0.32 * lit) : "rgb(" + Math.round(26 * lit + 10) + "," + Math.round(28 * lit + 10) + "," + Math.round(44 * lit + 14) + ")";
        ctx.globalAlpha = 0.35 + 0.65 * f;
        ctx.fill();
        if (!mini) { ctx.strokeStyle = "#05050a"; ctx.lineWidth = Math.max(1, cellR * 0.05); ctx.stroke(); }
        ctx.globalAlpha = 1;
      });
      ctx.lineCap = "round";
      if (!mini) g.wallSegs.forEach(function (w) {
        var A = pv[w[0]], B = pv[w[1]];
        if (!vis(A[2]) || !vis(B[2]) || !near(A, B)) return;
        ctx.strokeStyle = "rgba(230,232,255," + (0.35 + 0.6 * fade(Math.min(A[2], B[2]))).toFixed(2) + ")";
        ctx.lineWidth = mini ? 1.5 : Math.max(2.5, cellR * 0.16);
        ctx.beginPath(); ctx.moveTo(A[0], A[1]); ctx.lineTo(B[0], B[1]); ctx.stroke();
      });
      if (!mini) g.level.bridges.forEach(function (br) {
        var c = br.cell; if (!vis(pc[c][2])) return;
        ctx.strokeStyle = "rgba(255,255,255,0.22)"; ctx.lineWidth = Math.max(1.5, cellR * 0.08);
        br.lanes.forEach(function (L) {
          if (!vis(pc[L[0]][2]) || !vis(pc[L[1]][2]) || !near(pc[L[0]], pc[L[1]])) return;
          var a = mid(pc[c], pc[L[0]]), z = mid(pc[c], pc[L[1]]);
          ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(z[0], z[1]); ctx.stroke();
        });
      });
    } else {
      ctx.lineCap = "round";
      for (i = 0; i < b.n; i++) b.nbrs[i].forEach(function (j) {
        if (j < i || !vis(pc[i][2]) || !vis(pc[j][2]) || !near(pc[i], pc[j])) return;
        var walled = g.wallSet.has(i < j ? i + "-" + j : j + "-" + i), f = fade(Math.min(pc[i][2], pc[j][2]));
        ctx.globalAlpha = 0.25 + 0.75 * f;
        if (walled) {
          if (mini) { ctx.globalAlpha = 1; return; }
          var m = mid(pc[i], pc[j]);
          ctx.strokeStyle = "#ff5a6e"; ctx.lineWidth = Math.max(1.5, cellR * 0.08);
          var dx = (pc[j][0] - pc[i][0]) * 0.18, dy = (pc[j][1] - pc[i][1]) * 0.18;
          ctx.beginPath(); ctx.moveTo(m[0] - dy, m[1] + dx); ctx.lineTo(m[0] + dy, m[1] - dx); ctx.stroke();
        } else {
          ctx.strokeStyle = "#3a3d58"; ctx.lineWidth = mini ? 0.8 : Math.max(1, cellR * 0.07);
          ctx.beginPath(); ctx.moveTo(pc[i][0], pc[i][1]); ctx.lineTo(pc[j][0], pc[j][1]); ctx.stroke();
        }
        ctx.globalAlpha = 1;
      });
    }

    // strands; loose pieces (attached to neither end) dashed
    ctx.lineCap = "round"; ctx.lineJoin = "round";
    g.strands().forEach(function (st) {
      var nodes = st.nodes;
      if (nodes.length < 2) return;
      var lw = mini ? 2 : (b.kind === "atoms" ? Math.max(3, cellR * 0.28) : Math.max(3, cellR * 0.3));
      ctx.strokeStyle = S.COLORS[st.k % 16]; ctx.lineWidth = lw;
      ctx.setLineDash(st.anchored || mini ? [] : [lw * 0.9, lw * 0.9]);
      for (var q = 1; q < nodes.length; q++) {
        var A = pc[g.cellOf[nodes[q - 1]]], B = pc[g.cellOf[nodes[q]]];
        if (!vis(A[2]) || !vis(B[2]) || !near(A, B)) continue;
        ctx.globalAlpha = (0.3 + 0.7 * fade(Math.min(A[2], B[2]))) * (st.anchored ? 1 : 0.75);
        ctx.beginPath(); ctx.moveTo(A[0], A[1]); ctx.lineTo(B[0], B[1]); ctx.stroke();
      }
      ctx.setLineDash([]); ctx.globalAlpha = 1;
    });
    if (b.kind === "atoms" && !mini) for (i = 0; i < b.n; i++) {
      if (!vis(pc[i][2])) continue;
      var col = cellColor(i);
      ctx.globalAlpha = 0.3 + 0.7 * fade(pc[i][2]);
      ctx.fillStyle = col >= 0 ? S.COLORS[col % 16] : "#5c6080";
      ctx.beginPath(); ctx.arc(pc[i][0], pc[i][1], Math.max(2, cellR * (col >= 0 ? 0.16 : 0.11)), 0, 6.2832); ctx.fill();
      ctx.globalAlpha = 1;
    }
    g.level.pairs.forEach(function (p, k) {
      p.forEach(function (node) {
        var c = g.cellOf[node], Pp = pc[c];
        if (!vis(Pp[2])) return;
        var rr = mini ? 2.6 : (b.kind === "atoms" ? 0.36 : 0.42) * cellR * (whole ? 1 : 0.55 + 0.45 * Math.max(0, Pp[2]));
        ctx.globalAlpha = 0.35 + 0.65 * fade(Pp[2]);
        ctx.fillStyle = S.COLORS[k % 16];
        ctx.beginPath(); ctx.arc(Pp[0], Pp[1], rr, 0, 6.2832); ctx.fill();
        if (g.done[k] && !mini) { ctx.strokeStyle = "#ffffff"; ctx.lineWidth = Math.max(1.5, rr * 0.18); ctx.stroke(); }
        ctx.globalAlpha = 1;
      });
    });

    if (whole) {
      ctx.strokeStyle = "rgba(160,170,255,0.18)"; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(cx, cy, r, 0, 6.2832); ctx.stroke();
      // the near hemisphere's edge: inside is what the globe view shows
      ctx.strokeStyle = mini ? "rgba(255,255,255,0.55)" : "rgba(160,170,255,0.25)";
      ctx.lineWidth = mini ? 1.2 : 1; ctx.setLineDash(mini ? [] : [4, 6]);
      ctx.beginPath(); ctx.arc(cx, cy, r * Math.SQRT1_2, 0, 6.2832); ctx.stroke(); ctx.setLineDash([]);
    } else {
      var sh = ctx.createRadialGradient(cx - r * 0.4, cy - r * 0.45, 0, cx - r * 0.4, cy - r * 0.45, r * 1.1);
      sh.addColorStop(0, "rgba(255,255,255,0.08)"); sh.addColorStop(0.6, "rgba(255,255,255,0)"); sh.addColorStop(1, "rgba(0,0,0,0.28)");
      ctx.fillStyle = sh; ctx.beginPath(); ctx.arc(cx, cy, r, 0, 6.2832); ctx.fill();
    }
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

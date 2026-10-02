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
    this.tmode = "donut"; this.cam = null; // the torus: "donut" (3D), "clifford" (4D, projected) or "flat" (the wrapped rectangle)
  }

  /* ------------------------------------------------------------ the torus
     The same game on a Voronoi torus (js/torus.js). The camera is fixed and
     a drag slides the skin; the inset (top right, donut view) is the flat
     map, the whole torus at once, with the reticle's spot marked. */
  View.prototype.torus = function () { return !!(this.state && this.state.mesh.topology === "torus"); };
  View.prototype.camFor = function () {
    var m = this.state.mesh;
    if (!this.cam || this.cam.mesh !== m) this.cam = O.surfaceCam(m);
    this.cam.zoom = this.zoom; this.cam.clifford = this.tmode === "clifford" && this.cam.kind === "torus";
    return this.cam;
  };
  View.prototype.frame = function () { return new O.TorusFrame(this.camFor(), { cx: this.w / 2, cy: this.h / 2, w: this.w, h: this.h }, this.tmode === "flat" ? "flat" : "donut"); };
  /* Switch view, keeping the cell under the cursor under the cursor. */
  View.prototype.setTmode = function (mode) {
    if (!this.torus()) { this.tmode = mode; return; }
    var cam = this.camFor(), s = cam.sweet();
    this.tmode = mode; cam = this.camFor(); cam.toward(s[0], s[1], 1);
  };
  View.prototype.inset = function () {
    var m = this.state.mesh, iw = Math.max(90, Math.min(180, this.w * 0.36)), ih = iw * m.H / m.W;
    return { cx: this.w - iw / 2 - 8, cy: ih / 2 + 8, w: iw, h: ih, mini: true };
  };
  View.prototype.inInset = function (px, py) {
    if (this.hyper()) return this.inHyperInset(px, py);
    if (!this.torus() || this.tmode === "flat") return false;
    var vp = this.inset(); return Math.abs(px - vp.cx) <= vp.w / 2 && Math.abs(py - vp.cy) <= vp.h / 2;
  };
  /* Flat point under an inset tap. */
  View.prototype.insetPoint = function (px, py) {
    if (this.hyper()) return this.hyperInsetPoint(px, py);
    var vp = this.inset(), F = new O.TorusFrame(this.camFor(), vp, "flat"), m = this.state.mesh;
    return F.flatAt(px, py);
  };
  /* How squarely cell c faces you (for choosing which certain cell to hint). */
  View.prototype.inView = function (c) {
    var m = this.state.mesh;
    if (this.hyper()) { var hp = this.hcam().nearest(m.sites[2 * c], m.sites[2 * c + 1]); return 1 - O.hyper.distO(hp[0], hp[1]) / 3; }
    if (!this.torus()) { var R = this.R, P = m.sites, zc = R[6] * P[3 * c] + R[7] * P[3 * c + 1] + R[8] * P[3 * c + 2]; return m.proj ? Math.abs(zc) : zc; }
    var cam = this.camFor();
    if (cam.rigid && this.tmode !== "flat") { var e = cam.embed(m.sites[2 * c], m.sites[2 * c + 1]); return e.face - Math.hypot(e.X, e.Y) / 4; }
    var sw = cam.sweet(), d = O.torusDelta(m, O.torusCellAt(m, sw[0], sw[1]), c);
    return 1 - Math.hypot(d[0], d[1]) / m.H;
  };
  /* Ease cell c toward the middle of the view by fraction t. */
  View.prototype.toward = function (c, t) {
    var m = this.state.mesh;
    if (this.hyper()) { this.hcam().toward(m.sites[2 * c], m.sites[2 * c + 1], t); return; }
    if (this.torus()) { this.camFor().toward(m.sites[2 * c], m.sites[2 * c + 1], t); return; }
    if (m.proj) { var R2 = this.R, P2 = m.sites; if (R2[6] * P2[3 * c] + R2[7] * P2[3 * c + 1] + R2[8] * P2[3 * c + 2] < 0) c += m.n; } // the nearer copy
    this.face([m.sites[3 * c], m.sites[3 * c + 1], m.sites[3 * c + 2]], t);
  };
  View.prototype.towardPoint = function (u, v, t) { (this.hyper() ? this.hcam() : this.camFor()).toward(u, v, t); };

  View.prototype.drawTorus = function (now) {
    var s = this.state, ctx = this.ctx, m = s.mesh, cam = this.camFor(), busy = false, self = this;
    var F = this.frame(), donut = this.tmode !== "flat", cellR = Math.max(4, F.cellR);
    var showMines = s.phase === "lost" || s.phase === "won";
    var LT = (function () { var l = Math.hypot(-0.35, -0.55, 0.75); return [-0.35 / l, -0.55 / l, 0.75 / l]; })();
    ctx.lineJoin = "round"; ctx.textAlign = "center"; ctx.textBaseline = "middle";

    var colour = function (i, lit) {
      var openT = s.open[i] ? 1 : 0;
      if (self.anim && self.anim[i] != null) { openT = Math.min(1, Math.max(0, (now - self.anim[i]) / 160)); if (openT < 1) busy = true; }
      var col;
      if (s.open[i] && s.mine[i]) col = [255, 46, 77];
      else if (showMines && s.mine[i] && !s.flag[i]) col = s.phase === "won" ? [70, 110, 100] : [110, 40, 55];
      else {
        var cr = [66 + 70 * lit, 70 + 70 * lit, 104 + 80 * lit], op = [18 + 12 * lit, 18 + 12 * lit, 28 + 16 * lit];
        col = [cr[0] + (op[0] - cr[0]) * openT, cr[1] + (op[1] - cr[1]) * openT, cr[2] + (op[2] - cr[2]) * openT];
      }
      return { col: col, openT: openT };
    };
    var trace = function (ring) { ctx.beginPath(); for (var k = 0; k < ring.length; k++) { if (k) ctx.lineTo(ring[k][0], ring[k][1]); else ctx.moveTo(ring[k][0], ring[k][1]); } ctx.closePath(); };
    var glyph = function (i, x, y, fs, openT) {
      if (s.open[i] && !s.mine[i] && s.count[i] > 0 && openT > 0.5) {
        ctx.fillStyle = NUM[s.count[i]]; ctx.font = "700 " + fs.toFixed(1) + "px ui-monospace, Menlo, Consolas, monospace";
        ctx.fillText(String(s.count[i]), x, y + fs * 0.04);
      } else if (s.flag[i]) drawFlag(ctx, x, y, fs, showMines && !s.mine[i]);
      else if (showMines && s.mine[i]) drawMine(ctx, x, y, fs * 0.36, s.open[i]);
    };

    var fc = -1;
    if (this.reticle && (s.phase === "play" || s.phase === "ready")) {
      if (cam.rigid && donut) fc = F.pick(this.w / 2, this.h / 2); // the Klein bottle in 3D: the cell at the middle of the screen
      else { var sw = cam.sweet(); fc = O.torusCellAt(m, sw[0], sw[1]); }
    }
    this.focusCell = fc;
    var outline = function (c, style, wdt) { var rg = F.ring(c); if (!rg) return; trace(rg); ctx.strokeStyle = style; ctx.lineWidth = wdt; ctx.stroke(); };
    var shown = function (i) { return !donut || (cam.rigid || cam.occludes ? F.onTop(i) : F.P[i][3]); };
    var marks = function () { // highlights, pulses and the reticle, after every fill
      for (var o = 0; o < F.order.length; o++) {
        var i = F.order[o], rg;
        if (!shown(i)) continue;
        if (self.hl && self.hl.has(i)) outline(i, "rgba(255,200,87,0.95)", Math.max(1.5, cellR * 0.12));
        if (self.mark && self.mark.has(i)) { var pulse = 0.55 + 0.45 * Math.sin(now / 180); outline(i, "rgba(94,232,193," + pulse.toFixed(2) + ")", Math.max(2, cellR * 0.16)); busy = true; }
      }
      if (fc >= 0) {
        if (s.phase === "play") m.nbrs[fc].forEach(function (j) { if (shown(j)) outline(j, "rgba(94,232,193,0.9)", Math.max(1.5, cellR * 0.1)); });
        outline(fc, "rgba(255,255,255,0.95)", Math.max(2, cellR * 0.14));
      }
    };

    if (donut) {
      // a soft shadow of the ring, then the cells back to front
      if (cam.kind === "torus" && !cam.clifford) { ctx.fillStyle = "rgba(94,232,193,0.05)"; ctx.beginPath(); ctx.ellipse(this.w / 2 + F.ox, this.h / 2 + F.oy, F.k * (cam.R + cam.r) * 1.08, F.k * ((cam.R + cam.r) * Math.sin(cam.tilt) + cam.r * Math.cos(cam.tilt)) * 1.08, 0, 0, 6.2832); ctx.fill(); }
      for (var o = 0; o < F.order.length; o++) {
        var i = F.order[o], ring = F.ring(i); if (!ring) continue;
        var e = cam.embed(m.sites[2 * i], m.sites[2 * i + 1]), lit = Math.max(0, e.n[0] * LT[0] + e.n[1] * LT[1] + e.n[2] * LT[2]);
        var c = colour(i, lit), dim = 0.3 + 0.7 * Math.min(1, Math.max(0, e.face) * 1.8);
        ctx.fillStyle = "rgb(" + (c.col[0] * dim | 0) + "," + (c.col[1] * dim | 0) + "," + (c.col[2] * dim | 0) + ")";
        trace(ring); ctx.fill(); ctx.strokeStyle = "#08080c"; ctx.lineWidth = Math.max(0.6, cellR * 0.06); ctx.stroke();
        if ((cam.rigid || F.P[i][3]) && e.face > 0.12) {
          // a number fits its cell: smaller cells (the torus's inside, the bottle's neck) get smaller type
          var ar = 0; for (var q = 0; q < ring.length; q++) { var A = ring[q], B = ring[(q + 1) % ring.length]; ar += A[0] * B[1] - B[0] * A[1]; }
          ctx.save(); trace(ring); ctx.clip(); // clipped to its cell: nothing spills past the silhouette
          glyph(i, F.P[i][0], F.P[i][1], Math.min(cellR * (0.45 + 0.55 * Math.sqrt(e.face)) * 0.95, Math.sqrt(Math.abs(ar) / 2) * 0.62), c.openT);
          ctx.restore();
        }
      }
      marks();
      this.drawInset(now);
    } else {
      F.tiles.forEach(function (t) {
        ctx.save(); ctx.transform(t[0], t[1], t[2], t[3], t[4], t[5]);
        for (var o = 0; o < F.order.length; o++) {
          var i = F.order[o], ring = F.ring(i), c = colour(i, 0.55);
          ctx.fillStyle = "rgb(" + (c.col[0] | 0) + "," + (c.col[1] | 0) + "," + (c.col[2] | 0) + ")";
          trace(ring); ctx.fill(); ctx.strokeStyle = "#08080c"; ctx.lineWidth = Math.max(0.6, cellR * 0.06); ctx.stroke();
          glyph(i, F.P[i][0], F.P[i][1], cellR * 0.95, c.openT);
        }
        marks();
        ctx.restore();
      });
      // the window that is one whole torus
      ctx.strokeStyle = "rgba(94,232,193,0.25)"; ctx.setLineDash([5, 6]); ctx.lineWidth = 1;
      ctx.strokeRect(F.box[0], F.box[1], F.box[2], F.box[3]); ctx.setLineDash([]);
    }
    return busy;
  };
  /* The flat map in the corner: every cell, the reticle's spot ringed. */
  View.prototype.drawInset = function () {
    var s = this.state, ctx = this.ctx, m = s.mesh, vp = this.inset(), F = new O.TorusFrame(this.camFor(), vp, "flat");
    ctx.fillStyle = "rgba(8,8,14,0.92)"; ctx.fillRect(vp.cx - vp.w / 2 - 3, vp.cy - vp.h / 2 - 3, vp.w + 6, vp.h + 6);
    ctx.save(); ctx.beginPath(); ctx.rect(vp.cx - vp.w / 2, vp.cy - vp.h / 2, vp.w, vp.h); ctx.clip();
    for (var i = 0; i < m.n; i++) {
      var ring = F.ring(i), col = s.open[i] ? (s.mine[i] ? "#ff2e4d" : "#1a1a26") : s.flag[i] ? "#ff6a3d" : "#4a5070";
      ctx.beginPath(); ring.forEach(function (p, k) { if (k) ctx.lineTo(p[0], p[1]); else ctx.moveTo(p[0], p[1]); }); ctx.closePath();
      ctx.fillStyle = col; ctx.fill(); ctx.strokeStyle = "#08080c"; ctx.lineWidth = 0.5; ctx.stroke();
    }
    ctx.restore();
    ctx.strokeStyle = "#2a2a40"; ctx.lineWidth = 1; ctx.strokeRect(vp.cx - vp.w / 2, vp.cy - vp.h / 2, vp.w, vp.h);
    ctx.strokeStyle = "rgba(255,255,255,0.9)"; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(vp.cx, vp.cy, Math.max(4, F.cellR * 1.4), 0, 6.2832); ctx.stroke();
  };

  /* ------------------------------------------------------------ the double torus
     A hyperbolic surface (js/hyper.js), drawn in the Poincaré disk centred on
     the cursor. The disk is bigger than the screen at rest: hyperbolic space
     shrinks so fast toward the rim that a whole-disk view makes the cells
     under your finger tiny. Every copy of a cell in view is drawn (the
     surface is tiled by octagons, each a copy of the whole board), so a
     number's neighbours are always the cells round it, wherever you are. */
  View.prototype.hyper = function () { return !!(this.state && this.state.mesh.topology === "hyperbolic"); };
  View.prototype.hcam = function () {
    var m = this.state.mesh;
    if (!this._hc || this._hc.mesh !== m) this._hc = new O.HyperCam(m);
    return this._hc;
  };
  View.prototype.diskR = function () { return Math.min(this.w, this.h) * 0.46 * 1.4 * this.zoom; };
  View.prototype.toDisk = function (px, py) { var R = this.diskR(); return [(px - this.w / 2) / R, -(py - this.h / 2) / R]; };
  View.prototype.hdrag = function (dx, dy, px, py) {
    if (px == null) { px = this.w / 2; py = this.h / 2; } // a key or a fling: slide about the middle
    var a = this.toDisk(px - dx, py - dy), b = this.toDisk(px, py);
    this.hcam().slide(a[0], a[1], b[0], b[1]);
  };
  View.prototype.hpick = function (px, py) {
    var C = this._hcopies; if (!C) return -1;
    for (var k = C.length - 1; k >= 0; k--) if (inPoly(C[k].scr, px, py)) return C[k].i;
    return -1;
  };
  function inPoly(P, x, y) {
    var c = false;
    for (var a = 0, b = P.length - 1; a < P.length; b = a++) if ((P[a][1] > y) !== (P[b][1] > y) && x < (P[b][0] - P[a][0]) * (y - P[a][1]) / (P[b][1] - P[a][1]) + P[a][0]) c = !c;
    return c;
  }
  View.prototype.drawHyper = function (now) {
    var s = this.state, ctx = this.ctx, m = s.mesh, cam = this.hcam(), H = O.hyper, self = this, busy = false;
    var w = this.w, h = this.h, cx = w / 2, cy = h / 2, R = this.diskR();
    var scr = function (p) { return [cx + R * p[0], cy - R * p[1]]; };
    var showMines = s.phase === "lost" || s.phase === "won";
    ctx.lineJoin = "round"; ctx.textAlign = "center"; ctx.textBaseline = "middle";

    // the disk, which is the whole hyperbolic plane
    ctx.fillStyle = "#050508"; ctx.beginPath(); ctx.arc(cx, cy, R, 0, 6.2832); ctx.fill();
    ctx.strokeStyle = "rgba(94,232,193,0.25)"; ctx.lineWidth = 1.5; ctx.stroke();

    var copies = cam.copies(), drawn = [], pad = 4;
    for (var k = 0; k < copies.length; k++) {
      var cp = copies[k], P = cp.ring.map(scr), x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
      for (var q = 0; q < P.length; q++) { x0 = Math.min(x0, P[q][0]); x1 = Math.max(x1, P[q][0]); y0 = Math.min(y0, P[q][1]); y1 = Math.max(y1, P[q][1]); }
      if (x1 < -pad || x0 > w + pad || y1 < -pad || y0 > h + pad) continue;
      var size = Math.max(x1 - x0, y1 - y0);
      if (size < 1.2) continue;
      var z = cp.z, c = scr(z);
      drawn.push({ i: cp.i, M: cp.M, scr: P, x: c[0], y: c[1], size: size, r: Math.hypot(z[0], z[1]) });
    }
    this._hcopies = drawn;
    var cellR = R * Math.sqrt(H.AREA / m.n / Math.PI) / 2; // a cell's radius at the middle, in px (the disk's scale there is ½)

    var trace = function (P) { ctx.beginPath(); for (var q = 0; q < P.length; q++) { if (q) ctx.lineTo(P[q][0], P[q][1]); else ctx.moveTo(P[q][0], P[q][1]); } ctx.closePath(); };
    for (k = 0; k < drawn.length; k++) {
      var d = drawn[k], i = d.i, openT = s.open[i] ? 1 : 0;
      if (this.anim && this.anim[i] != null) { openT = Math.min(1, Math.max(0, (now - this.anim[i]) / 160)); if (openT < 1) busy = true; }
      var col, lit = 0.6;
      if (s.open[i] && s.mine[i]) col = [255, 46, 77];
      else if (showMines && s.mine[i] && !s.flag[i]) col = s.phase === "won" ? [70, 110, 100] : [110, 40, 55];
      else {
        var cr = [66 + 70 * lit, 70 + 70 * lit, 104 + 80 * lit], op = [18 + 12 * lit, 18 + 12 * lit, 28 + 16 * lit];
        col = [cr[0] + (op[0] - cr[0]) * openT, cr[1] + (op[1] - cr[1]) * openT, cr[2] + (op[2] - cr[2]) * openT];
      }
      var dim = 0.45 + 0.55 * (1 - d.r * d.r); // toward the rim, into the distance
      ctx.fillStyle = "rgb(" + (col[0] * dim | 0) + "," + (col[1] * dim | 0) + "," + (col[2] * dim | 0) + ")";
      trace(d.scr); ctx.fill();
      ctx.strokeStyle = "#08080c"; ctx.lineWidth = Math.max(0.5, Math.min(cellR * 0.06, d.size * 0.05)); ctx.stroke();
      if (d.size < 9) continue;
      var fs = d.size * 0.42;
      if (s.open[i] && !s.mine[i] && s.count[i] > 0 && openT > 0.5) {
        ctx.fillStyle = NUM[s.count[i]]; ctx.font = "700 " + fs.toFixed(1) + "px ui-monospace, Menlo, Consolas, monospace";
        ctx.fillText(String(s.count[i]), d.x, d.y + fs * 0.04);
      } else if (s.flag[i]) drawFlag(ctx, d.x, d.y, fs, showMines && !s.mine[i]);
      else if (showMines && s.mine[i]) drawMine(ctx, d.x, d.y, fs * 0.36, s.open[i]);
    }

    // the octagons: each one a copy of the whole board
    ctx.strokeStyle = "rgba(94,232,193,0.22)"; ctx.lineWidth = 1; ctx.setLineDash([4, 5]);
    var T = cam.tiles || [];
    for (k = 0; k < T.length; k++) {
      var Mt = H.compose(cam.C, T[k]), o = H.apply(Mt, 0, 0);
      if (H.distO(o[0], o[1]) > cam.view + H.RCIRC) continue;
      trace(H.octagon(Mt).map(scr)); ctx.stroke();
    }
    ctx.setLineDash([]);

    // highlights, pulses, and the reticle: the cell at the middle and its neighbours' adjacent copies
    var outline = function (P, style, wdt) { trace(P); ctx.strokeStyle = style; ctx.lineWidth = wdt; ctx.stroke(); };
    for (k = 0; k < drawn.length; k++) {
      d = drawn[k];
      if (this.hl && this.hl.has(d.i)) outline(d.scr, "rgba(255,200,87,0.95)", Math.max(1.5, d.size * 0.06));
      if (this.mark && this.mark.has(d.i)) { var pulse = 0.55 + 0.45 * Math.sin(now / 180); outline(d.scr, "rgba(94,232,193," + pulse.toFixed(2) + ")", Math.max(2, d.size * 0.08)); busy = true; }
    }
    this.focusCell = -1;
    if (this.reticle && (s.phase === "play" || s.phase === "ready")) {
      var fd = null;
      for (k = drawn.length - 1; k >= 0; k--) if (inPoly(drawn[k].scr, cx, cy)) { fd = drawn[k]; break; }
      if (fd) {
        this.focusCell = fd.i;
        if (s.phase === "play") {
          var NT = H.near();
          m.edges[fd.i].forEach(function (ed) {
            if (!ed) return;
            outline(H.geodesicRing(H.compose(fd.M, NT[ed.e]), m.rings[ed.j]).map(scr), "rgba(94,232,193,0.9)", Math.max(1.5, cellR * 0.1));
          });
        }
        outline(fd.scr, "rgba(255,255,255,0.95)", Math.max(2, cellR * 0.14));
      }
    }
    this.drawHyperInset();
    return busy;
  };
  /* The fundamental octagon in the corner: the whole board, its sides
     coloured by which they're glued to, and where you are in it. */
  var PAIR = ["#5ee8c1", "#ffc857", "#c77dff", "#4dabf7"];
  View.prototype.hinset = function () { var r = Math.max(48, Math.min(90, this.w * 0.18)); return { cx: this.w - r - 8, cy: r + 8, r: r }; };
  View.prototype.drawHyperInset = function () {
    var s = this.state, ctx = this.ctx, m = s.mesh, H = O.hyper, vp = this.hinset(), k0 = vp.r / Math.tanh(H.RCIRC);
    // in the Klein model, where the octagon is a plain regular octagon with straight sides
    var scr = function (p) { var q = H.klein(p[0], p[1]); return [vp.cx + k0 * q[0], vp.cy - k0 * q[1]]; };
    var oct = H.octagon().map(scr), tr = function (P) { ctx.beginPath(); P.forEach(function (p, k) { if (k) ctx.lineTo(p[0], p[1]); else ctx.moveTo(p[0], p[1]); }); ctx.closePath(); };
    ctx.fillStyle = "rgba(8,8,14,0.92)"; ctx.beginPath(); ctx.arc(vp.cx, vp.cy, vp.r + 4, 0, 6.2832); ctx.fill();
    ctx.save(); tr(oct); ctx.clip();
    for (var i = 0; i < m.n; i++) {
      tr(H.geodesicRing([1, 0, 0, 0], m.rings[i]).map(scr));
      ctx.fillStyle = s.open[i] ? (s.mine[i] ? "#ff2e4d" : "#1a1a26") : s.flag[i] ? "#ff6a3d" : "#4a5070"; ctx.fill();
      ctx.strokeStyle = "#08080c"; ctx.lineWidth = 0.5; ctx.stroke();
    }
    ctx.restore();
    // each side in its pair's colour (side k is glued to side k + 4)
    var per = oct.length / 8;
    for (var sd = 0; sd < 8; sd++) {
      ctx.beginPath();
      for (var q = 0; q <= per; q++) { var p = oct[(Math.round(sd * per) + q) % oct.length]; if (q) ctx.lineTo(p[0], p[1]); else ctx.moveTo(p[0], p[1]); }
      ctx.strokeStyle = PAIR[sd % 4]; ctx.lineWidth = 2; ctx.stroke();
    }
    var c = scr(this.hcam().cursor());
    ctx.strokeStyle = "rgba(255,255,255,0.95)"; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(c[0], c[1], 5, 0, 6.2832); ctx.stroke();
  };
  View.prototype.inHyperInset = function (px, py) { var vp = this.hinset(); return Math.hypot(px - vp.cx, py - vp.cy) <= vp.r + 4; };
  View.prototype.hyperInsetPoint = function (px, py) {
    var vp = this.hinset(), H = O.hyper, k0 = vp.r / Math.tanh(H.RCIRC), x = (px - vp.cx) / k0, y = -(py - vp.cy) / k0, r = Math.hypot(x, y);
    if (r >= 1) return null;
    var f = 1 / (1 + Math.sqrt(1 - r * r)); x *= f; y *= f; // Klein → Poincaré
    return H.outside(x, y) < 0 ? [x, y] : null;
  };

  View.prototype.resize = function () {
    var dpr = Math.min(2, NS.devicePixelRatio || 1), r = this.cv.getBoundingClientRect();
    this.dpr = dpr; this.w = r.width; this.h = r.height;
    this.cv.width = Math.round(r.width * dpr); this.cv.height = Math.round(r.height * dpr);
  };

  View.prototype.radius = function () { return Math.min(this.w, this.h) * 0.46 * this.zoom; };

  /* Rotate so the surface follows the finger: a drag of (dx, dy) pixels turns
     about screen-y then screen-x by arc length / radius. */
  View.prototype.drag = function (dx, dy, px, py) {
    if (this.hyper()) { this.hdrag(dx, dy, px, py); return; }
    if (this.torus()) { this.camFor().drag(dx, dy, this.tmode === "flat" ? "flat" : "donut", this.w, this.h); return; }
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
    if (this.hyper()) return this.hpick(px, py);
    if (this.torus()) return this.frame().pick(px, py);
    var r = this.radius(), x = (px - this.w / 2) / r, y = -(py - this.h / 2) / r, d = x * x + y * y;
    if (d > 1) return -1;
    var z = Math.sqrt(1 - d), R = this.R, m0 = this.state.mesh;
    // R is orthonormal: inverse = transpose
    var hit = O.cellAt(m0, R[0] * x + R[3] * y + R[6] * z, R[1] * x + R[4] * y + R[7] * z, R[2] * x + R[5] * y + R[8] * z);
    return m0.proj ? hit % m0.n : hit; // the projective plane: a cover cell and its antipode are one cell
  };

  View.prototype.draw = function (now) {
    var s = this.state, ctx = this.ctx, dpr = this.dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, this.w, this.h);
    if (!s) return false;
    if (this.hyper()) return this.drawHyper(now);
    if (this.torus()) return this.drawTorus(now);
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
    var order = [], NC = P.length / 3, G = function (i) { return m.proj ? i % m.n : i; }; // cover cell → game cell
    for (var i = 0; i < NC; i++) {
      var sz = R[6] * P[3 * i] + R[7] * P[3 * i + 1] + R[8] * P[3 * i + 2];
      if (sz > -0.3) order.push([sz, i]);
    }
    order.sort(function (a, b) { return a[0] - b[0]; });

    var cellR = r * Math.sqrt(4 / NC); // ≈ typical cell radius, in px, at the centre
    var showMines = s.phase === "lost" || s.phase === "won";
    ctx.lineJoin = "round";
    ctx.textAlign = "center"; ctx.textBaseline = "middle";

    for (var o = 0; o < order.length; o++) {
      i = order[o][1]; var g = G(i); // geometry by cover cell i, state by game cell g
      var ring = m.polys[i], front = false;
      for (k = 0; k < ring.length; k++) if (VZ[ring[k]] > 0) { front = true; break; }
      if (!front) continue;
      var sx = R[0] * P[3 * i] + R[1] * P[3 * i + 1] + R[2] * P[3 * i + 2];
      var sy = R[3] * P[3 * i] + R[4] * P[3 * i + 1] + R[5] * P[3 * i + 2];
      var szz = order[o][0];
      var lit = Math.max(0, sx * L[0] + sy * L[1] + szz * L[2]);
      var limb = Math.max(0, szz);

      // reveal ripple: 0 = still closed, 1 = fully open
      var openT = s.open[g] ? 1 : 0;
      if (this.anim && this.anim[g] != null) {
        openT = Math.min(1, Math.max(0, (now - this.anim[g]) / 160));
        if (openT < 1) busy = true;
      }

      var col;
      if (s.open[g] && s.mine[g]) col = [255, 46, 77];
      else if (showMines && s.mine[g] && !s.flag[g]) col = s.phase === "won" ? [70, 110, 100] : [110, 40, 55];
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
      if (this.hl && this.hl.has(g)) {
        ctx.strokeStyle = "rgba(255,200,87,0.95)"; ctx.lineWidth = Math.max(1.5, cellR * 0.12); ctx.stroke();
      }
      if (this.mark && this.mark.has(g)) {
        var pulse = 0.55 + 0.45 * Math.sin(now / 180);
        ctx.strokeStyle = "rgba(94,232,193," + pulse.toFixed(2) + ")"; ctx.lineWidth = Math.max(2, cellR * 0.16); ctx.stroke();
        busy = true;
      }
      if (limb < 0.08) continue;

      if (s.open[g] && !s.mine[g] && s.count[g] > 0 && openT > 0.5) {
        ctx.fillStyle = NUM[s.count[g]];
        ctx.font = "700 " + fs.toFixed(1) + "px ui-monospace, Menlo, Consolas, monospace";
        ctx.fillText(String(s.count[g]), hx, hy + fs * 0.04);
      } else if (s.flag[g]) {
        drawFlag(ctx, hx, hy, fs, showMines && !s.mine[g]);
      } else if (showMines && s.mine[g]) {
        drawMine(ctx, hx, hy, fs * 0.36, s.open[g]);
      }
    }

    // the reticle: the cell facing you (the orb's nearest point) and the
    // cells it counts. Drawn after every fill so no neighbour paints over the
    // outlines, which is the whole point on a mesh where "which cells touch
    // this one" is not obvious at a glance.
    this.focusCell = -1;
    if (this.reticle && (s.phase === "play" || s.phase === "ready")) {
      var fc = O.cellAt(m, R[6], R[7], R[8]);   // cover cell (the projective plane draws every cell twice)
      this.focusCell = G(fc);
      var near = function (j) { // the copy of game cell j on your side
        if (!m.proj) return j;
        var z1 = R[6] * P[3 * j] + R[7] * P[3 * j + 1] + R[8] * P[3 * j + 2];
        return z1 >= 0 ? j : j + m.n;
      };
      var ring2 = function (c) {
        var rr = m.polys[c];
        ctx.beginPath();
        for (var q = 0; q < rr.length; q++) { var w = rr[q], qx = cx + r * VX[w], qy = cy - r * VY[w]; if (q) ctx.lineTo(qx, qy); else ctx.moveTo(qx, qy); }
        ctx.closePath();
      };
      if (s.phase === "play") {
        ctx.strokeStyle = "rgba(94,232,193,0.9)"; ctx.lineWidth = Math.max(1.5, cellR * 0.1);
        var fn = m.nbrs[G(fc)];
        for (k = 0; k < fn.length; k++) { ring2(near(fn[k])); ctx.stroke(); }
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

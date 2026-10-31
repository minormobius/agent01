/* Skein — the renderer.

   Projections as in /strand/ and /onecoast/: "globe" (orthographic, the
   near half) and "whole" (Lambert azimuthal equal-area: the whole sphere in
   one disc), plus the whole-sphere inset in globe mode. Canvas 2D.

   A tile is its polygon with its letter; on the globe the letter is
   foreshortened with the surface (squashed along the radius by the cosine
   of its tilt), so the sphere reads as a ball of letters, not a sticker
   sheet. Found words are tinted and threaded (a line through their tiles in
   order); the span is gold. The two poles are ringed. The honeycomb tori
   draw through Orb's torus views instead (see "the torus" below). */
(function () {
  "use strict";
  var NS = (typeof window !== "undefined") ? window : globalThis;
  var K = NS.SKEIN = NS.SKEIN || {};

  var TILE = [30, 37, 52], WORD = [46, 92, 148], SPAN = [150, 112, 38], TRACE = [196, 128, 40];
  var THREAD_WORD = "rgba(126,186,255,0.55)", THREAD_SPAN = "rgba(255,206,104,0.6)", THREAD_TRACE = "rgba(255,196,100,0.75)";

  function View(canvas) {
    this.cv = canvas; this.ctx = canvas.getContext("2d");
    this.R = [1, 0, 0, 0, 1, 0, 0, 0, 1]; this.zoom = 1; this.w = 0; this.h = 0; this.dpr = 1;
    this.mode = "globe"; this.mini = true; this.game = null; this.flash = null;
  }
  View.prototype.resize = function () {
    var dpr = Math.min(2, NS.devicePixelRatio || 1), r = this.cv.getBoundingClientRect();
    this.dpr = dpr; this.w = r.width; this.h = r.height;
    this.cv.width = Math.round(r.width * dpr); this.cv.height = Math.round(r.height * dpr);
  };
  View.prototype.radius = function () { return Math.min(this.w, this.h) * (this.mode === "whole" ? 0.48 : 0.45) * this.zoom; };
  View.prototype.main = function () { return { cx: this.w / 2, cy: this.h / 2, r: this.radius(), mode: this.mode }; };
  View.prototype.inset = function () { var mr = Math.max(34, Math.min(70, Math.min(this.w, this.h) * 0.13)); return { cx: this.w - mr - 6, cy: mr + 6, r: mr, mode: "whole", mini: true }; };
  View.prototype.drag = function (dx, dy) {
    if (this.torus()) { this.camFor().drag(dx, dy, this.tmode(), this.w, this.h); return; }
    var r = this.radius() * (this.mode === "whole" ? 0.5 : 1), a = dx / r, b = dy / r, ca = Math.cos(a), sa = Math.sin(a), cb = Math.cos(b), sb = Math.sin(b);
    this.R = mul([ca, sa * sb, sa * cb, 0, cb, -sb, -sa, ca * sb, ca * cb], this.R); ortho(this.R);
  };
  View.prototype.face = function (p, t) {
    var v = apply(this.R, p), s = Math.hypot(v[1], v[0]);
    if (s < 1e-9) return;
    var ang = Math.atan2(s, v[2]) * (t == null ? 1 : t);
    this.R = mul(rotAxis([v[1] / s, -v[0] / s, 0], ang), this.R); ortho(this.R);
  };
  function proj(R, p, vp) {
    var X = R[0] * p[0] + R[1] * p[1] + R[2] * p[2], Y = R[3] * p[0] + R[4] * p[1] + R[5] * p[2], Z = R[6] * p[0] + R[7] * p[1] + R[8] * p[2];
    if (vp.mode === "globe") return [vp.cx + vp.r * X, vp.cy - vp.r * Y, Z];
    var k = Math.sqrt(2 / Math.max(1e-4, 1 + Z)) * vp.r / 2;
    return [vp.cx + k * X, vp.cy - k * Y, Z];
  }
  View.prototype.unproject = function (px, py, vp) {
    vp = vp || this.main();
    var X = (px - vp.cx) / vp.r, Y = -(py - vp.cy) / vp.r, x, y, z;
    if (vp.mode === "globe") { var d = X * X + Y * Y; if (d > 1) return null; x = X; y = Y; z = Math.sqrt(1 - d); }
    else { X *= 2; Y *= 2; var p2 = X * X + Y * Y; if (p2 > 4) return null; var s = Math.sqrt(1 - p2 / 4); x = X * s; y = Y * s; z = 1 - p2 / 2; }
    var R = this.R;
    return [R[0] * x + R[3] * y + R[6] * z, R[1] * x + R[4] * y + R[7] * z, R[2] * x + R[5] * y + R[8] * z];
  };
  View.prototype.inInset = function (px, py) {
    if (this.torus()) { if (this.mode !== "globe" || !this.mini) return false; var iv = this.tinset(); return Math.abs(px - iv.cx) <= iv.w / 2 && Math.abs(py - iv.cy) <= iv.h / 2; }
    if (this.mode !== "globe" || !this.mini) return false;
    var vp = this.inset(); return Math.hypot(px - vp.cx, py - vp.cy) <= vp.r;
  };
  View.prototype.onGlobe = function (px, py) { return !!this.unproject(px, py); };
  /* The tile under a point, or -1. `inner` (0..1) demands the point be that
     close to the tile's centre, relative to the tile's size: tracing uses it
     so a diagonal swipe that clips a corner doesn't grab the corner tile. */
  View.prototype.pick = function (px, py, inner) {
    if (this.torus()) return this.tpick(px, py, inner);
    var m = this.unproject(px, py), g = this.game;
    if (!m || !g) return -1;
    var s = g.s, best = -2, bi = -1, second = -2;
    for (var i = 0; i < s.n; i++) {
      var d = s.pos[3 * i] * m[0] + s.pos[3 * i + 1] * m[1] + s.pos[3 * i + 2] * m[2];
      if (d > best) { second = best; best = d; bi = i; } else if (d > second) second = d;
    }
    if (inner) { var cell = Math.sqrt(4 / s.n); if (Math.acos(Math.min(1, second)) - Math.acos(Math.min(1, best)) < inner * cell * 0.5) return -1; }
    return bi;
  };
  View.prototype.centreOf = function (i) { // a point to turn toward: on the sphere, the tile's centre; on a torus, its flat site
    if (this.torus()) { var m = this.game.s.mesh; return [m.sites[2 * i], m.sites[2 * i + 1]]; }
    var P = this.game.s.pos; return [P[3 * i], P[3 * i + 1], P[3 * i + 2]];
  };
  /* Ease point p (from centreOf or insetPoint) to the middle by fraction t. */
  View.prototype.toward = function (p, t) { if (this.torus()) this.camFor().toward(p[0], p[1], t); else this.face(p, t); };
  /* The point under a tap on the corner map. */
  View.prototype.insetPoint = function (px, py) { return this.torus() ? this.tframe(this.tinset(), "flat").flatAt(px, py) : this.unproject(px, py, this.inset()); };

  function rgb(c, lit) { return "rgb(" + Math.round(c[0] * lit) + "," + Math.round(c[1] * lit) + "," + Math.round(c[2] * lit) + ")"; }
  function mix(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }

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

  View.prototype.scene = function (vp) {
    var ctx = this.ctx, g = this.game, s = g.s, R = this.R, cx = vp.cx, cy = vp.cy, r = vp.r, dpr = this.dpr;
    var whole = vp.mode === "whole", mini = !!vp.mini;
    var cellR = (whole ? r / 2 : r) * Math.sqrt(4 / s.n);
    var LONG = cellR * 4;
    var vis = whole ? function (z) { return z > -0.9; } : function (z) { return z > -0.08; };
    var shade = whole ? function (z) { return 0.72 + 0.28 * (z + 1) / 2; } : function (z) { return 0.62 + 0.38 * Math.max(0, z); };
    var P = function (p) { return proj(R, p, vp); };
    var flash = this.flash && this.flash.until > Date.now() ? this.flash : null;

    if (!mini && !whole) {
      var halo = ctx.createRadialGradient(cx, cy, r * 0.92, cx, cy, r * 1.15);
      halo.addColorStop(0, "rgba(255,206,120,0.10)"); halo.addColorStop(1, "rgba(255,206,120,0)");
      ctx.fillStyle = halo; ctx.beginPath(); ctx.arc(cx, cy, r * 1.15, 0, 6.2832); ctx.fill();
    }
    ctx.fillStyle = mini ? "rgba(10,14,22,0.92)" : "#06080d";
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, 6.2832); ctx.fill();
    if (mini) { ctx.strokeStyle = "#2a3448"; ctx.lineWidth = 1; ctx.stroke(); }

    var scr = new Array(s.n), order = [];
    for (var i = 0; i < s.n; i++) { var c = P(this.centreOf(i)); scr[i] = c; if (vis(c[2])) order.push([c[2], i]); }
    order.sort(function (a, b) { return a[0] - b[0]; });

    var inSel = new Uint8Array(s.n); g.sel.forEach(function (c2) { inSel[c2] = 1; });
    var hintCells = new Uint8Array(s.n); if (g.hint >= 0) g.words[g.hint].cells.forEach(function (c2) { hintCells[c2] = 1; });
    var poles = g.board.poles;
    var path = function (pts) {
      var prev = null, ok = true;
      ctx.beginPath();
      for (var q = 0; q < pts.length; q++) {
        var p = P(pts[q]);
        if (!vis(p[2])) ok = false;
        if (whole && prev && Math.hypot(p[0] - prev[0], p[1] - prev[1]) > LONG) ok = false;
        if (q) ctx.lineTo(p[0], p[1]); else ctx.moveTo(p[0], p[1]);
        prev = p;
      }
      ctx.closePath();
      return ok;
    };
    var ringOf = function (k) { return s.polys[k].map(function (v) { return [s.verts[3 * v], s.verts[3 * v + 1], s.verts[3 * v + 2]]; }); };
    // tiles shrunk a touch toward their centres, so the gaps read as grout
    var inset = function (ring, k, f) { var c0 = g.s.pos; return ring.map(function (p) { return [p[0] + (c0[3 * k] - p[0]) * f, p[1] + (c0[3 * k + 1] - p[1]) * f, p[2] + (c0[3 * k + 2] - p[2]) * f]; }); };

    order.forEach(function (o) {
      var k = o[1], z = o[0], lit = shade(z), own = g.owner[k];
      var base = own >= 0 ? (g.words[own].span ? SPAN : WORD) : inSel[k] ? TRACE : TILE;
      if (flash && flash.cells.has(k)) base = mix(base, flash.color, 0.6);
      if (!path(inset(ringOf(k), k, mini ? 0 : 0.06))) return;
      ctx.fillStyle = rgb(base, lit); ctx.fill();
      if (mini) return;
      if (poles[0] === k || poles[1] === k) { ctx.strokeStyle = "rgba(255,206,104," + (0.5 + 0.4 * Math.max(0, z)) + ")"; ctx.lineWidth = Math.max(1.5, cellR * 0.09); ctx.stroke(); }
      if (hintCells[k] && own < 0) { ctx.setLineDash([Math.max(2, cellR * 0.14), Math.max(2, cellR * 0.1)]); ctx.strokeStyle = "rgba(255,255,255,0.9)"; ctx.lineWidth = Math.max(1.2, cellR * 0.07); ctx.stroke(); ctx.setLineDash([]); }
    });
    if (mini) { this.rim(vp); return; }

    // threads: found words, then the live trace, through their tiles in order
    // (clipped to the disc: a thread to a tile round the rim would poke off it)
    ctx.save(); ctx.beginPath(); ctx.arc(cx, cy, r, 0, 6.2832); ctx.clip();
    var thread = function (cells, color, wdt) {
      ctx.strokeStyle = color; ctx.lineWidth = wdt; ctx.lineCap = "round"; ctx.lineJoin = "round";
      for (var q = 1; q < cells.length; q++) {
        var a = scr[cells[q - 1]], b = scr[cells[q]];
        if (Math.min(a[2], b[2]) < (whole ? -0.9 : 0.02) || (whole && Math.hypot(a[0] - b[0], a[1] - b[1]) > LONG)) continue;
        ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
      }
    };
    g.found.forEach(function (wi) { var W = g.words[wi]; thread(W.cells, W.span ? THREAD_SPAN : THREAD_WORD, cellR * 0.42); });
    if (g.sel.length > 1) thread(g.sel, THREAD_TRACE, cellR * 0.46);
    ctx.restore();

    // letters
    var font = "'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace";
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    var hintOrder = g.hint >= 0 && g.hintLevel >= 2 ? g.words[g.hint].cells : null;
    order.forEach(function (o) {
      var k = o[1], z = o[0], c2 = scr[k];
      if (!whole && z < 0.12) return;
      var size = cellR * 0.95 * (whole ? 0.6 + 0.4 * (z + 1) / 2 : 1);
      var dx = c2[0] - cx, dy = c2[1] - cy, d = Math.hypot(dx, dy) || 1, ux = dx / d, uy = dy / d;
      var f = whole ? 1 : z; // foreshortening along the radius
      var a = 1 + (f - 1) * ux * ux, b = (f - 1) * ux * uy, dd = 1 + (f - 1) * uy * uy;
      ctx.setTransform(dpr * a, dpr * b, dpr * b, dpr * dd, dpr * c2[0], dpr * c2[1]);
      var own = g.owner[k];
      ctx.fillStyle = own >= 0 ? (g.words[own].span ? "#fff3d6" : "#e6f0ff") : inSel[k] ? "#1a1206" : "rgba(226,232,244," + (whole ? 0.95 : 0.55 + 0.45 * z) + ")";
      ctx.font = "700 " + size.toFixed(1) + "px " + font;
      ctx.fillText(g.letters[k], 0, size * 0.04);
      if (hintOrder) { var at = hintOrder.indexOf(k); if (at >= 0) { ctx.font = "700 " + (size * 0.36).toFixed(1) + "px " + font; ctx.fillStyle = "rgba(255,255,255,0.9)"; ctx.fillText(String(at + 1), size * 0.42, -size * 0.42); } }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    });
    this.rim(vp);
  };
  /* ------------------------------------------------------------ the torus
     The honeycomb tori draw through ../orb/js/torus.js, as in /strand/:
     "globe" is a donut whose skin slides under your finger (nothing turns),
     "whole" is the flat map (a rectangle that wraps both ways), and the
     corner map is the flat map too. */
  View.prototype.torus = function () { return !!(this.game && this.game.s.torus); };
  View.prototype.tmode = function () { return this.mode === "whole" ? "flat" : "donut"; };
  View.prototype.camFor = function () {
    var m = this.game.s.mesh;
    if (!this.cam || this.cam.mesh !== m) this.cam = NS.ORB.surfaceCam(m);
    this.cam.zoom = this.zoom; return this.cam;
  };
  View.prototype.tmain = function () { return { cx: this.w / 2, cy: this.h / 2, w: this.w, h: this.h }; };
  View.prototype.tinset = function () {
    var m = this.game.s.mesh, iw = Math.max(90, Math.min(170, this.w * 0.34)), ih = iw * m.H / m.W;
    return { cx: this.w - iw / 2 - 8, cy: ih / 2 + 8, w: iw, h: ih, mini: true };
  };
  View.prototype.tframe = function (vp, mode) { return new NS.ORB.TorusFrame(this.camFor(), vp, mode); };
  /* The tile under a point; with `inner`, only well inside it (every point a
     little way round the finger must be the same tile). */
  View.prototype.tpick = function (px, py, inner) {
    var F = this.tframe(this.tmain(), this.tmode()), c = F.pick(px, py);
    if (c < 0 || !inner) return c;
    var rr = inner * Math.max(3, F.cellR) * 0.55;
    for (var k = 0; k < 6; k++) if (F.pick(px + rr * Math.cos(k * 1.047), py + rr * Math.sin(k * 1.047)) !== c) return -1;
    return c;
  };
  View.prototype.tscene = function (F, mini) {
    var ctx = this.ctx, g = this.game, s = g.s, m = s.mesh, donut = F.mode === "donut", cam = F.cam, dpr = this.dpr;
    var cellR = Math.max(3, F.cellR), flash = this.flash && this.flash.until > Date.now() ? this.flash : null;
    var LT = (function () { var l = Math.hypot(-0.35, -0.55, 0.75); return [-0.35 / l, -0.55 / l, 0.75 / l]; })();
    var lit = function (i) { if (!donut) return 0.86; var e = cam.embed(m.sites[2 * i], m.sites[2 * i + 1]); return 0.5 + 0.5 * Math.max(0, e.n[0] * LT[0] + e.n[1] * LT[1] + e.n[2] * LT[2]); };
    var trace = function (ring) { ctx.beginPath(); ring.forEach(function (p, k) { if (k) ctx.lineTo(p[0], p[1]); else ctx.moveTo(p[0], p[1]); }); ctx.closePath(); };
    var inSel = new Uint8Array(s.n); g.sel.forEach(function (c2) { inSel[c2] = 1; });
    var hintCells = new Uint8Array(s.n); if (g.hint >= 0) g.words[g.hint].cells.forEach(function (c2) { hintCells[c2] = 1; });
    var hintOrder = g.hint >= 0 && g.hintLevel >= 2 ? g.words[g.hint].cells : null, poles = g.board.poles;
    var font = "'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace";

    if (mini) { ctx.fillStyle = "rgba(10,14,22,0.92)"; ctx.fillRect(F.vp.cx - F.vp.w / 2 - 3, F.vp.cy - F.vp.h / 2 - 3, F.vp.w + 6, F.vp.h + 6); ctx.save(); ctx.beginPath(); ctx.rect(F.vp.cx - F.vp.w / 2, F.vp.cy - F.vp.h / 2, F.vp.w, F.vp.h); ctx.clip(); }
    else if (donut) {
      ctx.fillStyle = "rgba(255,206,120,0.05)"; ctx.beginPath();
      ctx.ellipse(F.vp.cx + F.ox, F.vp.cy + F.oy, F.k * (cam.R + cam.r) * 1.08, F.k * ((cam.R + cam.r) * Math.sin(cam.tilt) + cam.r * Math.cos(cam.tilt)) * 1.08, 0, 0, 6.2832); ctx.fill();
    }
    F.tiles.forEach(function (t) {
      ctx.save(); ctx.transform(t[0], t[1], t[2], t[3], t[4], t[5]);
      ctx.lineCap = "round"; ctx.lineJoin = "round";
      F.order.forEach(function (k) {
        var ring = F.ring(k); if (!ring) return;
        var own = g.owner[k], base = own >= 0 ? (g.words[own].span ? SPAN : WORD) : inSel[k] ? TRACE : TILE, face = donut ? Math.max(0, F.P[k][4]) : 1;
        if (flash && flash.cells.has(k)) base = mix(base, flash.color, 0.6);
        trace(ring); ctx.fillStyle = rgb(base, lit(k) * (donut ? 0.55 + 0.45 * Math.min(1, face * 2) : 1)); ctx.fill();
        if (mini) return;
        ctx.strokeStyle = "#06080d"; ctx.lineWidth = Math.max(0.8, cellR * 0.08); ctx.stroke();
        if (poles[0] === k || poles[1] === k) { ctx.strokeStyle = "rgba(255,206,104,0.9)"; ctx.lineWidth = Math.max(1.5, cellR * 0.1); ctx.stroke(); }
        if (hintCells[k] && own < 0) { ctx.setLineDash([Math.max(2, cellR * 0.14), Math.max(2, cellR * 0.1)]); ctx.strokeStyle = "rgba(255,255,255,0.9)"; ctx.lineWidth = Math.max(1.2, cellR * 0.07); ctx.stroke(); ctx.setLineDash([]); }
      });
      if (!mini) {
        var thread = function (cells, color, wdt) {
          ctx.strokeStyle = color; ctx.lineWidth = wdt;
          for (var q = 1; q < cells.length; q++) {
            var a = cells[q - 1], A = F.cell(a), B = F.near(cells[q], a);
            if (donut && !(F.P[a][3] && F.P[cells[q]][3])) continue;
            ctx.beginPath(); ctx.moveTo(A[0], A[1]); ctx.lineTo(B[0], B[1]); ctx.stroke();
          }
        };
        g.found.forEach(function (wi) { var W = g.words[wi]; thread(W.cells, W.span ? THREAD_SPAN : THREAD_WORD, cellR * 0.42); });
        if (g.sel.length > 1) thread(g.sel, THREAD_TRACE, cellR * 0.46);
        ctx.textAlign = "center"; ctx.textBaseline = "middle";
        F.order.forEach(function (k) {
          var P = F.cell(k), face = donut ? P[4] : 1;
          if (donut && (!P[3] || face < 0.15)) return;
          var size = cellR * 0.95 * (donut ? 0.45 + 0.55 * face : 1), own = g.owner[k];
          ctx.fillStyle = own >= 0 ? (g.words[own].span ? "#fff3d6" : "#e6f0ff") : inSel[k] ? "#1a1206" : "rgba(226,232,244," + (0.55 + 0.45 * face) + ")";
          ctx.font = "700 " + size.toFixed(1) + "px " + font;
          ctx.fillText(g.letters[k], P[0], P[1] + size * 0.04);
          if (hintOrder) { var at = hintOrder.indexOf(k); if (at >= 0) { ctx.font = "700 " + (size * 0.36).toFixed(1) + "px " + font; ctx.fillStyle = "rgba(255,255,255,0.9)"; ctx.fillText(String(at + 1), P[0] + size * 0.42, P[1] - size * 0.42); } }
        });
      }
      ctx.restore();
    });
    if (mini) {
      ctx.restore();
      ctx.strokeStyle = "#2a3448"; ctx.lineWidth = 1; ctx.strokeRect(F.vp.cx - F.vp.w / 2, F.vp.cy - F.vp.h / 2, F.vp.w, F.vp.h);
      ctx.strokeStyle = "rgba(255,255,255,0.85)"; ctx.lineWidth = 1.3; ctx.beginPath(); ctx.arc(F.vp.cx, F.vp.cy, Math.max(4, cellR * 1.6), 0, 6.2832); ctx.stroke();
    } else if (!donut) {
      ctx.strokeStyle = "rgba(255,220,160,0.25)"; ctx.setLineDash([5, 6]); ctx.lineWidth = 1;
      ctx.strokeRect(F.box[0], F.box[1], F.box[2], F.box[3]); ctx.setLineDash([]);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  };

  View.prototype.rim = function (vp) {
    var ctx = this.ctx, cx = vp.cx, cy = vp.cy, r = vp.r;
    if (vp.mode === "whole") {
      ctx.strokeStyle = "rgba(255,220,160,0.16)"; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(cx, cy, r, 0, 6.2832); ctx.stroke();
      ctx.strokeStyle = vp.mini ? "rgba(255,255,255,0.55)" : "rgba(255,220,160,0.22)"; ctx.lineWidth = vp.mini ? 1.2 : 1; ctx.setLineDash(vp.mini ? [] : [4, 6]);
      ctx.beginPath(); ctx.arc(cx, cy, r * Math.SQRT1_2, 0, 6.2832); ctx.stroke(); ctx.setLineDash([]);
    } else {
      var sh = ctx.createRadialGradient(cx - r * 0.4, cy - r * 0.45, 0, cx - r * 0.4, cy - r * 0.45, r * 1.1);
      sh.addColorStop(0, "rgba(255,255,255,0.07)"); sh.addColorStop(0.6, "rgba(255,255,255,0)"); sh.addColorStop(1, "rgba(0,0,0,0.35)");
      ctx.fillStyle = sh; ctx.beginPath(); ctx.arc(cx, cy, r, 0, 6.2832); ctx.fill();
    }
  };

  function mul(A, B) { var C2 = new Array(9); for (var i = 0; i < 3; i++) for (var j = 0; j < 3; j++) C2[3 * i + j] = A[3 * i] * B[j] + A[3 * i + 1] * B[3 + j] + A[3 * i + 2] * B[6 + j]; return C2; }
  function apply(R, p) { return [R[0] * p[0] + R[1] * p[1] + R[2] * p[2], R[3] * p[0] + R[4] * p[1] + R[5] * p[2], R[6] * p[0] + R[7] * p[1] + R[8] * p[2]]; }
  function rotAxis(u, t) { var c = Math.cos(t), s = Math.sin(t), C2 = 1 - c, x = u[0], y = u[1], z = u[2]; return [c + x * x * C2, x * y * C2 - z * s, x * z * C2 + y * s, y * x * C2 + z * s, c + y * y * C2, y * z * C2 - x * s, z * x * C2 - y * s, z * y * C2 + x * s, c + z * z * C2]; }
  function ortho(R) {
    var a = [R[0], R[1], R[2]], l = Math.hypot(a[0], a[1], a[2]); a = [a[0] / l, a[1] / l, a[2] / l];
    var b = [R[3], R[4], R[5]], d = a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
    b = [b[0] - d * a[0], b[1] - d * a[1], b[2] - d * a[2]]; l = Math.hypot(b[0], b[1], b[2]); b = [b[0] / l, b[1] / l, b[2] / l];
    var c = [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
    R[0] = a[0]; R[1] = a[1]; R[2] = a[2]; R[3] = b[0]; R[4] = b[1]; R[5] = b[2]; R[6] = c[0]; R[7] = c[1]; R[8] = c[2];
  }
  K.View = View;
})();

/* Twelve — the renderer.

   Same projections as /strand/, /onecoast/ and /skein/: "globe"
   (orthographic, the near half), "whole" (Lambert azimuthal equal-area,
   the whole sphere in one disc) and the whole-sphere inset in globe mode.

   Hexes hold tiles; the twelve pentagons are drains, drawn as dark wells.
   While you swipe, the drain the swipe points at glows and an arrow runs
   to it. A move animates: each tile slides cell to cell along its trail
   (interpolated on the sphere), then merges pulse and new tiles pop in. */
(function () {
  "use strict";
  var NS = (typeof window !== "undefined") ? window : globalThis;
  var T = NS.TWELVE = NS.TWELVE || {};

  // tile colours by value: cool greys for the small ones, then warm, then the 2048 mint, then violet past it
  var FILL = { 2: [58, 68, 92], 4: [72, 88, 124], 8: [208, 132, 70], 16: [224, 108, 66], 32: [232, 84, 70], 64: [236, 62, 62],
    128: [232, 196, 96], 256: [236, 192, 72], 512: [242, 186, 48], 1024: [120, 212, 168], 2048: [94, 232, 193] };
  function fillOf(v) { return FILL[v] || [150, 128, 255]; }
  function inkOf(v) { return v <= 4 ? "#e8eef6" : v >= 128 && v <= 2048 ? "#14110a" : "#fff8ee"; }

  function View(canvas) {
    this.cv = canvas; this.ctx = canvas.getContext("2d");
    this.R = [1, 0, 0, 0, 1, 0, 0, 0, 1]; this.zoom = 1; this.w = 0; this.h = 0; this.dpr = 1;
    this.mode = "globe"; this.mini = true; this.game = null;
    this.aim = -1;       // the drain a swipe in progress points at
    this.preview = null; // what pouring there would do (game.preview)
    this.swipe = null;   // { x0, y0, x1, y1 } screen, for the arrow
    this.anim = null;    // { before, trails, merged:Set, spawned:Set, t0 }
  }
  View.prototype.SLIDE = 150; View.prototype.POP = 160;
  View.prototype.resize = function () {
    var dpr = Math.min(2, NS.devicePixelRatio || 1), r = this.cv.getBoundingClientRect();
    this.dpr = dpr; this.w = r.width; this.h = r.height;
    this.cv.width = Math.round(r.width * dpr); this.cv.height = Math.round(r.height * dpr);
  };
  View.prototype.radius = function () { return Math.min(this.w, this.h) * (this.mode === "whole" ? 0.48 : 0.44) * this.zoom; };
  View.prototype.main = function () { return { cx: this.w / 2, cy: this.h / 2, r: this.radius(), mode: this.mode }; };
  View.prototype.inset = function () { var mr = Math.max(34, Math.min(70, Math.min(this.w, this.h) * 0.13)); return { cx: this.w - mr - 6, cy: mr + 6, r: mr, mode: "whole", mini: true }; };
  View.prototype.drag = function (dx, dy) {
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
    if (this.mode !== "globe" || !this.mini) return false;
    var vp = this.inset(); return Math.hypot(px - vp.cx, py - vp.cy) <= vp.r;
  };
  View.prototype.pick = function (px, py) {
    var m = this.unproject(px, py), g = this.game;
    if (!m || !g) return -1;
    var s = g.s, best = -2, bi = -1;
    for (var i = 0; i < s.n; i++) { var d = s.pos[3 * i] * m[0] + s.pos[3 * i + 1] * m[1] + s.pos[3 * i + 2] * m[2]; if (d > best) { best = d; bi = i; } }
    return bi;
  };
  View.prototype.centreOf = function (i) { var P = this.game.s.pos; return [P[3 * i], P[3 * i + 1], P[3 * i + 2]]; };
  View.prototype.screenOf = function (i) { return proj(this.R, this.centreOf(i), this.main()); };
  /* The drain a swipe (dx, dy) points at: the one furthest that way from
     the globe's centre, among those in view or just round the rim. A drain
     dead centre can only be tapped. */
  View.prototype.drainToward = function (dx, dy) {
    var g = this.game, L = Math.hypot(dx, dy); if (!g || L < 1) return -1;
    var ux = dx / L, uy = dy / L, vp = this.main(), best = -1, bv = -1e9;
    g.env.drains.forEach(function (D, w) {
      var c = proj(this.R, this.centreOf(D.p), vp);
      if (vp.mode === "globe" ? c[2] < -0.35 : c[2] < -0.85) return;
      var X = (c[0] - vp.cx) / vp.r, Y = (c[1] - vp.cy) / vp.r;
      if (vp.mode === "globe" && c[2] < 0) { var k = 1 / (Math.hypot(X, Y) || 1); X *= k; Y *= k; } // just round the rim: treat as on it
      var v = X * ux + Y * uy - 0.25 * Math.abs(X * uy - Y * ux); // along the swipe, a little against straying sideways
      if (v > bv) { bv = v; best = w; }
    }, this);
    return bv > 0.05 ? best : -1;
  };
  /* The drain whose pentagon is under (px, py), or -1. */
  View.prototype.drainAt = function (px, py) {
    var c = this.pick(px, py), g = this.game; if (c < 0 || !g.s.pent[c]) return -1;
    for (var w = 0; w < g.env.drains.length; w++) if (g.env.drains[w].p === c) return w;
    return -1;
  };

  function rgb(c, lit) { return "rgb(" + Math.round(c[0] * lit) + "," + Math.round(c[1] * lit) + "," + Math.round(c[2] * lit) + ")"; }
  function slerp(a, b, t) { var x = a[0] + (b[0] - a[0]) * t, y = a[1] + (b[1] - a[1]) * t, z = a[2] + (b[2] - a[2]) * t, l = Math.hypot(x, y, z) || 1; return [x / l, y / l, z / l]; }

  View.prototype.busy = function () { return !!this.anim && Date.now() - this.anim.t0 < this.SLIDE + this.POP; };
  View.prototype.draw = function () {
    var ctx = this.ctx, dpr = this.dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, this.w, this.h);
    if (!this.game) return;
    this.scene(this.main());
    if (this.mode === "globe" && this.mini) this.scene(this.inset());
  };

  View.prototype.scene = function (vp) {
    var self = this, ctx = this.ctx, g = this.game, s = g.s, R = this.R, cx = vp.cx, cy = vp.cy, r = vp.r, dpr = this.dpr;
    var whole = vp.mode === "whole", mini = !!vp.mini;
    var cellR = (whole ? r / 2 : r) * Math.sqrt(4 / s.n);
    var LONG = cellR * 4;
    var vis = whole ? function (z) { return z > -0.9; } : function (z) { return z > -0.08; };
    var shade = whole ? function (z) { return 0.74 + 0.26 * (z + 1) / 2; } : function (z) { return 0.6 + 0.4 * Math.max(0, z); };
    var P = function (p) { return proj(R, p, vp); };
    var now = Date.now(), A = this.anim, ta = A ? (now - A.t0) / this.SLIDE : 2, sliding = A && ta < 1;
    var pop = A && !sliding ? Math.min(1, (now - A.t0 - this.SLIDE) / this.POP) : 1;
    var vals = sliding ? A.before : g.g;
    var moving = new Uint8Array(s.n); if (sliding) A.trails.forEach(function (tr) { moving[tr.path[0]] = 1; });

    if (!mini && !whole) {
      var halo = ctx.createRadialGradient(cx, cy, r * 0.92, cx, cy, r * 1.15);
      halo.addColorStop(0, "rgba(94,232,193,0.10)"); halo.addColorStop(1, "rgba(94,232,193,0)");
      ctx.fillStyle = halo; ctx.beginPath(); ctx.arc(cx, cy, r * 1.15, 0, 6.2832); ctx.fill();
    }
    ctx.fillStyle = mini ? "rgba(10,14,22,0.92)" : "#06080d";
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, 6.2832); ctx.fill();
    if (mini) { ctx.strokeStyle = "#2a3448"; ctx.lineWidth = 1; ctx.stroke(); }

    var scr = new Array(s.n), order = [];
    for (var i = 0; i < s.n; i++) { var c = P(this.centreOf(i)); scr[i] = c; if (vis(c[2])) order.push([c[2], i]); }
    order.sort(function (a, b) { return a[0] - b[0]; });
    var drainOf = {}; g.env.drains.forEach(function (D, w) { drainOf[D.p] = w; });

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
      ctx.closePath(); return ok;
    };
    var ring = function (k, f) { var C0 = s.pos; return s.polys[k].map(function (v) { var p = [s.verts[3 * v], s.verts[3 * v + 1], s.verts[3 * v + 2]]; return [p[0] + (C0[3 * k] - p[0]) * f, p[1] + (C0[3 * k + 1] - p[1]) * f, p[2] + (C0[3 * k + 2] - p[2]) * f]; }); };
    var font = "'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace";
    // a number on the sphere, foreshortened with the surface (squashed along the radius on the globe)
    var label = function (x, y, z, v, scale) {
      var txt = String(v), size = cellR * (txt.length <= 2 ? 0.8 : txt.length === 3 ? 0.62 : txt.length === 4 ? 0.5 : 0.4) * scale * (whole ? 0.6 + 0.4 * (z + 1) / 2 : 1);
      var dx = x - cx, dy = y - cy, d = Math.hypot(dx, dy) || 1, ux = dx / d, uy = dy / d, f = whole ? 1 : Math.max(0.05, z);
      var a = 1 + (f - 1) * ux * ux, b = (f - 1) * ux * uy, dd = 1 + (f - 1) * uy * uy;
      ctx.setTransform(dpr * a, dpr * b, dpr * b, dpr * dd, dpr * x, dpr * y);
      ctx.fillStyle = inkOf(v); ctx.font = "700 " + size.toFixed(1) + "px " + font; ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText(txt, 0, size * 0.05);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    order.forEach(function (o) {
      var k = o[1], z = o[0], lit = shade(z);
      if (s.pent[k]) { // a drain
        var w = drainOf[k], aimed = w === self.aim, lastOne = w === g.last;
        if (!path(ring(k, mini ? 0 : 0.04))) return;
        ctx.fillStyle = aimed ? "rgb(18,64,58)" : rgb([10, 13, 20], 1); ctx.fill();
        if (mini) { if (aimed) { ctx.strokeStyle = "#5ee8c1"; ctx.lineWidth = 1.5; ctx.stroke(); } return; }
        ctx.strokeStyle = aimed ? "rgba(94,232,193,0.95)" : lastOne ? "rgba(94,232,193,0.45)" : "rgba(120,140,170,0.35)";
        ctx.lineWidth = Math.max(1.2, cellR * (aimed ? 0.1 : 0.05)); ctx.stroke();
        if (z > 0.1 || whole) { // a whirlpool: three shrinking rings, foreshortened
          var c2 = scr[k], kk = cellR * 0.62 * (whole ? 0.6 + 0.4 * (z + 1) / 2 : 1), sq = whole ? 1 : Math.max(0.15, z);
          var ang = Math.atan2(c2[1] - cy, c2[0] - cx);
          ctx.strokeStyle = aimed ? "rgba(94,232,193,0.7)" : "rgba(140,160,200,0.22)"; ctx.lineWidth = Math.max(1, cellR * 0.04);
          [1, 0.66, 0.33].forEach(function (f) { ctx.beginPath(); ctx.ellipse(c2[0], c2[1], kk * f * (whole ? 1 : sq), kk * f, ang, 0, 6.2832); ctx.stroke(); });
        }
        return;
      }
      var v = moving[k] ? 0 : vals[k];
      var grow = A && !sliding && A.spawned.has(k) ? 0.3 + 0.7 * pop : A && !sliding && A.merged.has(k) ? 1 + 0.12 * Math.sin(Math.PI * pop) : 1;
      if (!path(ring(k, mini ? 0 : 0.07))) return;
      ctx.fillStyle = rgb([24, 29, 40], lit); ctx.fill();
      if (!v) return;
      if (grow !== 1) { if (!path(ring(k, mini ? 0 : 1 - 0.93 * Math.min(grow, 1.12)))) return; }
      else if (!mini) path(ring(k, 0.1));
      ctx.fillStyle = rgb(fillOf(v), lit); ctx.fill();
      if (!mini && (whole || z > 0.12)) label(scr[k][0], scr[k][1], z, v, Math.min(grow, 1.1));
    });

    // tiles in flight: round chips sliding along their trails
    if (sliding) {
      var e = ta < 0.5 ? 2 * ta * ta : 1 - Math.pow(-2 * ta + 2, 2) / 2; // ease in-out
      ctx.save(); ctx.beginPath(); ctx.arc(cx, cy, r, 0, 6.2832); ctx.clip();
      A.trails.forEach(function (tr) {
        var steps = tr.path.length - 1, at = e * steps, q = Math.min(steps - 1, Math.floor(at)), f = at - q;
        var p3 = slerp(self.centreOf(tr.path[q]), self.centreOf(tr.path[q + 1]), f), c3 = P(p3);
        if (!vis(c3[2]) || (whole && c3[2] < -0.75)) return; // near the point behind, the disc tears: don't draw across it
        var rad = cellR * 0.72 * (whole ? 0.6 + 0.4 * (c3[2] + 1) / 2 : 1), lit2 = shade(c3[2]);
        ctx.fillStyle = rgb(fillOf(tr.value), lit2); ctx.beginPath();
        var ang2 = Math.atan2(c3[1] - cy, c3[0] - cx);
        ctx.ellipse(c3[0], c3[1], rad * (whole ? 1 : Math.max(0.1, c3[2])), rad, ang2, 0, 6.2832); ctx.fill();
        if (!mini && (whole || c3[2] > 0.12)) label(c3[0], c3[1], c3[2], tr.value, 0.9);
      });
      ctx.restore();
    }

    // aiming: what the pour would do. Each tile that would move gets an arrow along its own arm to where it
    // lands, and a merge rings the tile it lands on. When the drain sits near the middle, its five arms are
    // drawn faintly too (near the rim the projection tangles them).
    if (!mini && this.aim >= 0) {
      var Daim = g.env.drains[this.aim], pc = scr[Daim.p];
      ctx.save(); ctx.beginPath(); ctx.arc(cx, cy, r, 0, 6.2832); ctx.clip();
      ctx.lineCap = "round"; ctx.lineJoin = "round";
      var polyline = function (cells, tail) {
        var pts = cells.map(function (c) { return scr[c]; }); if (tail) pts.push(tail);
        for (var i2 = 1; i2 < pts.length; i2++) {
          var a2 = pts[i2 - 1], b2 = pts[i2];
          if (!vis(a2[2]) || !vis(b2[2]) || (whole && (Math.min(a2[2], b2[2]) < -0.75 || Math.hypot(a2[0] - b2[0], a2[1] - b2[1]) > LONG))) continue;
          ctx.beginPath(); ctx.moveTo(a2[0], a2[1]); ctx.lineTo(b2[0], b2[1]); ctx.stroke();
        }
      };
      if (pc[2] > 0.55) { ctx.strokeStyle = "rgba(94,232,193,0.22)"; ctx.lineWidth = Math.max(2, cellR * 0.1); Daim.lanes.forEach(function (L) { polyline(L.slice().reverse(), pc); }); }
      if (this.preview) this.preview.trails.forEach(function (tr) {
        var end = scr[tr.path[tr.path.length - 1]], prev = scr[tr.path[tr.path.length - 2]];
        ctx.strokeStyle = "rgba(94,232,193,0.85)"; ctx.lineWidth = Math.max(2.5, cellR * 0.16); polyline(tr.path);
        if (!vis(end[2]) || (whole && end[2] < -0.75)) return;
        var ang = Math.atan2(end[1] - prev[1], end[0] - prev[0]), hl = Math.max(7, cellR * 0.36);
        ctx.fillStyle = "rgba(94,232,193,0.95)"; ctx.beginPath(); ctx.moveTo(end[0] + Math.cos(ang) * hl * 0.5, end[1] + Math.sin(ang) * hl * 0.5);
        ctx.lineTo(end[0] + Math.cos(ang + 2.4) * hl * 0.6, end[1] + Math.sin(ang + 2.4) * hl * 0.6); ctx.lineTo(end[0] + Math.cos(ang - 2.4) * hl * 0.6, end[1] + Math.sin(ang - 2.4) * hl * 0.6); ctx.closePath(); ctx.fill();
        if (tr.merge) { ctx.strokeStyle = "rgba(255,226,140,0.95)"; ctx.lineWidth = Math.max(2, cellR * 0.1); ctx.beginPath(); ctx.arc(end[0], end[1], cellR * 0.62 * (whole ? 0.6 + 0.4 * (end[2] + 1) / 2 : Math.max(0.3, end[2])), 0, 6.2832); ctx.stroke(); }
      });
      ctx.restore();
    }

    // the swipe's arrow, from the finger toward the drain it has chosen
    if (!mini && this.swipe && this.aim >= 0) {
      var t2 = scr[g.env.drains[this.aim].p], sw = this.swipe;
      var tx = t2[0], ty = t2[1];
      if (!whole && t2[2] < 0) { var dd2 = Math.hypot(tx - cx, ty - cy) || 1; tx = cx + (tx - cx) / dd2 * r; ty = cy + (ty - cy) / dd2 * r; }
      ctx.strokeStyle = "rgba(94,232,193,0.6)"; ctx.lineWidth = 3; ctx.lineCap = "round"; ctx.setLineDash([6, 7]);
      ctx.beginPath(); ctx.moveTo(sw.x0, sw.y0); ctx.lineTo(tx, ty); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = "rgba(94,232,193,0.9)"; ctx.beginPath(); ctx.arc(tx, ty, 5, 0, 6.2832); ctx.fill();
    }

    if (whole) {
      ctx.strokeStyle = "rgba(160,220,200,0.16)"; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(cx, cy, r, 0, 6.2832); ctx.stroke();
      ctx.strokeStyle = mini ? "rgba(255,255,255,0.55)" : "rgba(160,220,200,0.2)"; ctx.lineWidth = mini ? 1.2 : 1; ctx.setLineDash(mini ? [] : [4, 6]);
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
  T.View = View;
})();

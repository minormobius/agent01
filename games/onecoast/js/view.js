/* One Coast — the renderer.

   Projections as in /strand/: "globe" (orthographic, the near half) and
   "whole" (Lambert azimuthal equal-area: the whole sphere in one disc, true
   areas, no seam but the point directly behind), plus the whole-sphere
   inset in globe mode. Canvas 2D.

   Each placed tile is drawn from its art (coastart.js): sea, then a wide
   translucent shallows stroke along every coast, then land (coloured by
   latitude: ice, taiga, forest, grassland, dry plains), then a thin beach
   line. Land pentagons get a massif, sea pentagons a deep. Cliffs (a side
   where the two tiles disagree) are drawn as broken white bars. */
(function () {
  "use strict";
  var NS = (typeof window !== "undefined") ? window : globalThis;
  var C = NS.COAST = NS.COAST || {};

  var SEA = [27, 74, 122], DEEP = [14, 40, 74], SHALLOW = "rgba(120,196,232,0.42)", SAND = "#e8d9a6";

  function View(canvas) {
    this.cv = canvas; this.ctx = canvas.getContext("2d");
    this.R = [1, 0, 0, 0, 1, 0, 0, 0, 1]; this.zoom = 1; this.w = 0; this.h = 0; this.dpr = 1;
    this.mode = "globe"; this.mini = true; this.st = null;
  }
  View.prototype.resize = function () {
    var dpr = Math.min(2, NS.devicePixelRatio || 1), r = this.cv.getBoundingClientRect();
    this.dpr = dpr; this.w = r.width; this.h = r.height;
    this.cv.width = Math.round(r.width * dpr); this.cv.height = Math.round(r.height * dpr);
  };
  View.prototype.radius = function () { return Math.min(this.w, this.h) * (this.mode === "whole" ? 0.48 : 0.44) * this.zoom; };
  View.prototype.main = function () { return { cx: this.w / 2, cy: this.h / 2, r: this.radius(), mode: this.mode }; };
  View.prototype.inset = function () { var mr = Math.max(34, Math.min(80, Math.min(this.w, this.h) * 0.15)); return { cx: this.w - mr - 6, cy: mr + 6, r: mr, mode: "whole", mini: true }; };
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
    var m = this.unproject(px, py), s = this.st && this.st.s;
    if (!m || !s) return -1;
    var best = -2, bi = -1;
    for (var i = 0; i < s.n; i++) { var d = s.pos[3 * i] * m[0] + s.pos[3 * i + 1] * m[1] + s.pos[3 * i + 2] * m[2]; if (d > best) { best = d; bi = i; } }
    return bi;
  };

  /* Land colour: a smooth function of latitude (ice → taiga → forest →
     grass → dry plains) with gentle per-tile variety, so the map reads as
     terrain rather than a patchwork of hexagons. */
  var BANDS = [[0, [198, 178, 120]], [0.22, [168, 166, 98]], [0.42, [110, 150, 80]], [0.62, [82, 128, 76]], [0.8, [74, 104, 80]], [0.9, [206, 214, 218]], [1, [236, 240, 244]]];
  function landColor(s, i, lit) {
    var z = Math.abs(s.pos[3 * i + 2]), h = C.rngFrom("biome" + i)() - 0.5;
    z = Math.max(0, Math.min(1, z + h * 0.08));
    var a = BANDS[0], b = BANDS[BANDS.length - 1];
    for (var q = 0; q < BANDS.length - 1; q++) if (z >= BANDS[q][0] && z <= BANDS[q + 1][0]) { a = BANDS[q]; b = BANDS[q + 1]; break; }
    var t = (z - a[0]) / ((b[0] - a[0]) || 1), c = [0, 1, 2].map(function (k) { return a[1][k] + (b[1][k] - a[1][k]) * t + h * 10; });
    return rgb(c, lit);
  }
  function rgb(c, lit) { return "rgb(" + Math.round(c[0] * lit) + "," + Math.round(c[1] * lit) + "," + Math.round(c[2] * lit) + ")"; }

  View.prototype.draw = function () {
    var ctx = this.ctx, dpr = this.dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, this.w, this.h);
    if (!this.st) return;
    this.scene(this.main());
    if (this.mode === "globe" && this.mini) this.scene(this.inset());
  };

  View.prototype.scene = function (vp) {
    var ctx = this.ctx, st = this.st, s = st.s, R = this.R, cx = vp.cx, cy = vp.cy, r = vp.r;
    var whole = vp.mode === "whole", mini = !!vp.mini;
    var cellR = (whole ? r / 2 : r) * Math.sqrt(4 / s.n);
    var BACK = -0.9, LONG = cellR * 5;
    var vis = whole ? function (z) { return z > BACK; } : function (z) { return z > -0.08; };
    // per-tile shading stays gentle: the globe's own sheen does the lighting,
    // so the map reads as one surface rather than a faceted ball
    var shade = whole ? function (z) { return 0.7 + 0.3 * (z + 1) / 2; } : function (z) { return 0.9 + 0.1 * Math.max(0, z); };
    var P = function (p) { return proj(R, p, vp); };

    if (!mini && !whole) {
      var halo = ctx.createRadialGradient(cx, cy, r * 0.92, cx, cy, r * 1.15);
      halo.addColorStop(0, "rgba(120,190,255,0.16)"); halo.addColorStop(1, "rgba(120,190,255,0)");
      ctx.fillStyle = halo; ctx.beginPath(); ctx.arc(cx, cy, r * 1.15, 0, 6.2832); ctx.fill();
    }
    ctx.fillStyle = mini ? "rgba(10,14,22,0.92)" : "#070a10";
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, 6.2832); ctx.fill();
    if (mini) { ctx.strokeStyle = "#2a3448"; ctx.lineWidth = 1; ctx.stroke(); }

    var order = [];
    for (var i = 0; i < s.n; i++) {
      var c = P([s.pos[3 * i], s.pos[3 * i + 1], s.pos[3 * i + 2]]);
      if (vis(c[2])) order.push([c[2], i, c]);
    }
    order.sort(function (a, b) { return a[0] - b[0]; });

    var path = function (pts, close) {
      var prev = null, ok = true;
      ctx.beginPath();
      for (var q = 0; q < pts.length; q++) {
        var p = P(pts[q]);
        if (!vis(p[2])) ok = false;
        if (whole && prev && Math.hypot(p[0] - prev[0], p[1] - prev[1]) > LONG) ok = false;
        if (q) ctx.lineTo(p[0], p[1]); else ctx.moveTo(p[0], p[1]);
        prev = p;
      }
      if (close) ctx.closePath();
      return ok;
    };
    var ringOf = function (i) { return s.polys[i].map(function (v) { return [s.verts[3 * v], s.verts[3 * v + 1], s.verts[3 * v + 2]]; }); };
    var lw = function (f) { return Math.max(mini ? 0.6 : 1, cellR * f); };

    order.forEach(function (o) {
      var i = o[1], z = o[0], lit = shade(z), art = st.art[i], ring = ringOf(i);
      if (!path(ring, true)) return;
      if (!art) { // empty: a frontier cell is a little lighter; a perfect fit for the selected tile shows a dot
        var fr = st.frontier && st.frontier.has(i);
        ctx.fillStyle = rgb(fr ? [40, 48, 66] : [22, 26, 36], lit); ctx.fill();
        if (!mini) { ctx.strokeStyle = "#0a0d14"; ctx.lineWidth = lw(0.05); ctx.stroke(); }
        if (!mini && st.hints && st.hints.has(i)) { ctx.fillStyle = "rgba(94,232,193,0.85)"; ctx.beginPath(); ctx.arc(o[2][0], o[2][1], Math.max(2.5, cellR * 0.12), 0, 6.2832); ctx.fill(); }
        return;
      }
      var deep = s.pent[i] && !art.centre;
      // fill and stroke in the same colour: covers the hairline seams the
      // canvas leaves between neighbouring polygons
      ctx.fillStyle = ctx.strokeStyle = rgb(deep ? DEEP : SEA, lit); ctx.lineWidth = 1.2; ctx.fill(); ctx.stroke();
      if (!mini) { ctx.strokeStyle = SHALLOW; ctx.lineWidth = lw(0.26); ctx.lineCap = "round"; ctx.lineJoin = "round"; art.coasts.forEach(function (cp) { if (path(cp, false)) ctx.stroke(); }); }
      ctx.fillStyle = ctx.strokeStyle = landColor(s, i, lit); ctx.lineWidth = 1;
      art.land.forEach(function (poly) { if (path(poly, true)) { ctx.fill(); if (art.centre) ctx.stroke(); } });
      if (!mini) { ctx.strokeStyle = SAND; ctx.lineWidth = lw(0.05); art.coasts.forEach(function (cp) { if (path(cp, false)) ctx.stroke(); }); }
      if (!mini && s.pent[i] && z > 0.15) { // massif or deep
        var cc = o[2], k = cellR * 0.42 * (whole ? 1 : 0.5 + 0.5 * z);
        if (art.centre) {
          [[-0.55, 0.25, 0.75], [0.1, 0.35, 1], [0.6, 0.3, 0.7]].forEach(function (m) {
            var bx = cc[0] + m[0] * k, by = cc[1] + m[1] * k, hgt = m[2] * k * 1.2;
            ctx.fillStyle = rgb([120, 104, 92], lit); ctx.beginPath(); ctx.moveTo(bx - hgt * 0.6, by); ctx.lineTo(bx, by - hgt); ctx.lineTo(bx + hgt * 0.6, by); ctx.closePath(); ctx.fill();
            ctx.fillStyle = "rgba(240,244,248,0.95)"; ctx.beginPath(); ctx.moveTo(bx - hgt * 0.22, by - hgt * 0.63); ctx.lineTo(bx, by - hgt); ctx.lineTo(bx + hgt * 0.22, by - hgt * 0.63); ctx.closePath(); ctx.fill();
          });
        } else {
          ctx.strokeStyle = "rgba(160,200,255,0.25)"; ctx.lineWidth = lw(0.04);
          [0.35, 0.7].forEach(function (f) { ctx.beginPath(); ctx.ellipse(cc[0], cc[1], k * f * 1.3, k * f * (whole ? 1.3 : 0.4 + 0.9 * z), 0, 0, 6.2832); ctx.stroke(); });
        }
      }
    });

    // cliffs: sides where two placed tiles disagree
    if (!mini && st.cliffs) {
      ctx.strokeStyle = "rgba(255,240,230,0.9)"; ctx.lineWidth = lw(0.1); ctx.lineCap = "butt";
      ctx.setLineDash([lw(0.18), lw(0.12)]);
      st.cliffs.forEach(function (seg) { if (path(seg, false)) ctx.stroke(); });
      ctx.setLineDash([]);
    }
    // the ghost: the selected tile where it would go
    if (!mini && st.ghost) {
      var g = st.ghost, gring = ringOf(g.cell);
      ctx.globalAlpha = 0.85;
      if (path(gring, true)) {
        ctx.fillStyle = rgb(SEA, 1); ctx.fill();
        ctx.fillStyle = landColor(s, g.cell, 1); g.art.land.forEach(function (poly) { if (path(poly, true)) ctx.fill(); });
        ctx.strokeStyle = SAND; ctx.lineWidth = lw(0.05); g.art.coasts.forEach(function (cp) { if (path(cp, false)) ctx.stroke(); });
        ctx.globalAlpha = 1;
        path(gring, true); ctx.strokeStyle = g.cliffs.length ? "#ff6a5a" : "#5ee8c1"; ctx.lineWidth = lw(0.12); ctx.stroke();
        ctx.strokeStyle = "#ff3a2a"; ctx.lineWidth = lw(0.16);
        g.cliffs.forEach(function (j) { var a = gring[j], b = gring[(j + 1) % gring.length]; if (path([a, b], false)) ctx.stroke(); });
      }
      ctx.globalAlpha = 1;
    }

    if (whole) {
      ctx.strokeStyle = "rgba(160,190,255,0.18)"; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(cx, cy, r, 0, 6.2832); ctx.stroke();
      ctx.strokeStyle = mini ? "rgba(255,255,255,0.55)" : "rgba(160,190,255,0.25)"; ctx.lineWidth = mini ? 1.2 : 1; ctx.setLineDash(mini ? [] : [4, 6]);
      ctx.beginPath(); ctx.arc(cx, cy, r * Math.SQRT1_2, 0, 6.2832); ctx.stroke(); ctx.setLineDash([]);
    } else {
      var sh = ctx.createRadialGradient(cx - r * 0.4, cy - r * 0.45, 0, cx - r * 0.4, cy - r * 0.45, r * 1.1);
      sh.addColorStop(0, "rgba(255,255,255,0.10)"); sh.addColorStop(0.6, "rgba(255,255,255,0)"); sh.addColorStop(1, "rgba(0,0,0,0.30)");
      ctx.fillStyle = sh; ctx.beginPath(); ctx.arc(cx, cy, r, 0, 6.2832); ctx.fill();
    }
  };

  /* A tile drawn flat, for the hand. */
  C.drawFlat = function (ctx, x, y, rad, edges, centre, opts) {
    opts = opts || {};
    var art = C.flatArt(edges, centre), k = edges.length;
    var pt = function (p) { return [x + p[0] * rad, y - p[1] * rad]; };
    var poly = function (pts) { ctx.beginPath(); pts.forEach(function (p, q) { var a = pt(p); if (q) ctx.lineTo(a[0], a[1]); else ctx.moveTo(a[0], a[1]); }); };
    var corners = []; for (var j = 0; j < k; j++) { var a = Math.PI / 2 - (j * 2 * Math.PI) / k; corners.push([Math.cos(a), Math.sin(a), 0]); }
    poly(corners); ctx.closePath(); ctx.fillStyle = rgb(SEA, 1); ctx.fill();
    ctx.strokeStyle = SHALLOW; ctx.lineWidth = rad * 0.18; ctx.lineCap = "round"; ctx.lineJoin = "round"; art.coasts.forEach(function (cp) { poly(cp); ctx.stroke(); });
    ctx.fillStyle = "rgb(104,148,78)"; art.land.forEach(function (pg) { poly(pg); ctx.closePath(); ctx.fill(); });
    ctx.strokeStyle = SAND; ctx.lineWidth = Math.max(1, rad * 0.04); art.coasts.forEach(function (cp) { poly(cp); ctx.stroke(); });
    poly(corners); ctx.closePath(); ctx.strokeStyle = opts.selected ? "#5ee8c1" : "rgba(255,255,255,0.25)"; ctx.lineWidth = opts.selected ? 3 : 1.5; ctx.stroke();
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
  C.View = View;
})();

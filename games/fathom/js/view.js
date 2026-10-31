/* Fathom — the renderer.

   The sea is drawn as a cutaway, in perspective, round a fixed centre (so
   turning it never moves the thing you're turning about). `depth` is a
   real number: 0 is the outermost shell, K − 1 the innermost, and pinching
   moves it smoothly. The shell in focus fills the view; shells outside it
   are cut away (the one just above stays as a faint ghost, so you know
   what's over you); the two just inside it show through its holes.

   A closed cell is opaque; an opened one turns to water: no fill, just its
   number floating in it, so you look down through it to the shell below.
   Zeros are clear water. That is what keeps three layers readable.

   What you see is what you tap: a tap goes down through open water until it
   meets a closed cell, unless it lands on a number (near an open cell's
   centre), which is the number. Hit-testing is a ray against each shell's
   sphere, then the nearest site on that shell, as in /orb/. */
(function () {
  "use strict";
  var NS = (typeof window !== "undefined") ? window : globalThis;
  var O = NS.ORB, F = NS.FATHOM;
  var NUM = ["", "#5ee8c1", "#ffc857", "#ff8a3d", "#ff2e4d", "#c77dff", "#4dabf7", "#e6e6ee", "#c9c9de", "#9a9ab5", "#9a9ab5", "#9a9ab5", "#9a9ab5", "#9a9ab5", "#9a9ab5"];
  var LT = (function () { var l = Math.hypot(-0.4, 0.55, 0.75); return [-0.4 / l, 0.55 / l, 0.75 / l]; })();

  function View(canvas) {
    this.cv = canvas; this.ctx = canvas.getContext("2d");
    this.R = rotAxis([1, 0, 0], -0.35); this.depth = 0; this.zoom = 1;
    this.w = 0; this.h = 0; this.dpr = 1;
    this.state = null; this.anim = null; this.mark = null; this.hl = null; this.focusCell = -1; this.reticle = true;
  }
  View.prototype.resize = function () {
    var dpr = Math.min(2, NS.devicePixelRatio || 1), r = this.cv.getBoundingClientRect();
    this.dpr = dpr; this.w = r.width; this.h = r.height;
    this.cv.width = Math.round(r.width * dpr); this.cv.height = Math.round(r.height * dpr);
  };
  View.prototype.mesh = function () { return this.state.mesh; };
  /* The focus shell's radius (between shells while pinching) and the camera. */
  View.prototype.cam = function () {
    var m = this.mesh(), K = m.K, d = Math.max(0, Math.min(K - 1, this.depth)), a = Math.floor(d), b = Math.min(K - 1, a + 1), f = d - a;
    var rf = m.radii[a] + (m.radii[b] - m.radii[a]) * f, D = 3.4 * rf;
    // the focus shell's silhouette fills ~0.88 of the short side
    var sil = rf * D / Math.sqrt(D * D - rf * rf), S = Math.min(this.w, this.h) * 0.44 * this.zoom / sil;
    return { rf: rf, D: D, S: S, focus: Math.round(d), d: d, cx: this.w / 2, cy: this.h / 2 };
  };
  /* Model point → [sx, sy, depth toward the eye, view-space point]. */
  function proj(R, C, x, y, z) {
    var qx = R[0] * x + R[1] * y + R[2] * z, qy = R[3] * x + R[4] * y + R[5] * z, qz = R[6] * x + R[7] * y + R[8] * z, k = C.D / (C.D - qz);
    return [C.cx + C.S * qx * k, C.cy - C.S * qy * k, qz];
  }
  /* The ray through a screen point meets the sphere of radius r where (model
     unit vector), front side; or null. */
  View.prototype.hitShell = function (px, py, r, C) {
    C = C || this.cam();
    var X = (px - C.cx) / C.S, Y = -(py - C.cy) / C.S; // a point at q projects to X = qx·D/(D − qz): along the ray, q = (X t/D, Y t/D, D − t)
    var a = (X * X + Y * Y) / (C.D * C.D) + 1, b = -2 * C.D, c = C.D * C.D - r * r, disc = b * b - 4 * a * c;
    if (disc < 0) return null;
    var t = (-b - Math.sqrt(disc)) / (2 * a), qx = X * t / C.D, qy = Y * t / C.D, qz = C.D - t, R = this.R;
    var x = R[0] * qx + R[3] * qy + R[6] * qz, y = R[1] * qx + R[4] * qy + R[7] * qz, z = R[2] * qx + R[5] * qy + R[8] * qz;
    return [x / r, y / r, z / r];
  };
  /* The cell under a screen point: down through open water to the first
     closed cell, unless it lands near an open number (then the number). */
  View.prototype.pick = function (px, py) {
    var s = this.state, m = s.mesh, C = this.cam();
    for (var k = C.focus; k < m.K; k++) {
      var u = this.hitShell(px, py, m.radii[k], C);
      if (!u) continue;
      var sh = m.shells[k], li = O.cellAt(sh, u[0], u[1], u[2]), i = k * m.per + li;
      if (!s.open[i]) return i;
      if (s.count[i] > 0 && !s.mine[i]) { // close to its centre: the number itself
        var c = [sh.sites[3 * li], sh.sites[3 * li + 1], sh.sites[3 * li + 2]], ang = Math.acos(Math.min(1, c[0] * u[0] + c[1] * u[1] + c[2] * u[2]));
        if (ang < 0.42 * Math.sqrt(4 / m.per)) return i;
      }
      if (s.mine[i]) return i;
    }
    return -1;
  };
  View.prototype.drag = function (dx, dy) {
    var r = Math.min(this.w, this.h) * 0.44 * this.zoom, a = dx / r, b = dy / r, ca = Math.cos(a), sa = Math.sin(a), cb = Math.cos(b), sb = Math.sin(b);
    this.R = mul([ca, sa * sb, sa * cb, 0, cb, -sb, -sa, ca * sb, ca * cb], this.R); ortho(this.R);
  };
  /* Turn so model unit vector p faces you, by fraction t. */
  View.prototype.face = function (p, t) {
    var v = apply(this.R, p), s = Math.hypot(v[0], v[1]);
    if (s < 1e-9) return;
    this.R = mul(rotAxis([v[1] / s, -v[0] / s, 0], Math.atan2(s, v[2]) * (t == null ? 1 : t)), this.R); ortho(this.R);
  };
  View.prototype.siteOf = function (i) { var m = this.mesh(), k = F.shellOf(m, i), li = i - k * m.per, P = m.shells[k].sites; return [P[3 * li], P[3 * li + 1], P[3 * li + 2]]; };
  /* Ease cell i to the middle: turn it to face you and dive (or rise) to its shell. */
  View.prototype.toward = function (i, t) {
    this.face(this.siteOf(i), t);
    this.depth += (F.shellOf(this.mesh(), i) - this.depth) * (t == null ? 1 : t);
  };
  View.prototype.inView = function (i) {
    var p = apply(this.R, this.siteOf(i)), k = F.shellOf(this.mesh(), i);
    return p[2] - 0.6 * Math.abs(k - this.depth);
  };

  View.prototype.draw = function (now) {
    var ctx = this.ctx, dpr = this.dpr, s = this.state;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, this.w, this.h);
    if (!s) return false;
    var m = s.mesh, C = this.cam(), R = this.R, self = this, busy = false, showMines = s.phase === "lost" || s.phase === "won";
    ctx.lineJoin = "round"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    var cellPx = C.S * C.rf * Math.sqrt(4 / m.per) * 0.5;

    // the core, glowing at the bottom of everything
    var cz = proj(R, C, 0, 0, 0), rc = C.S * F.RCORE * C.D / C.D;
    var g = ctx.createRadialGradient(cz[0], cz[1], 0, cz[0], cz[1], rc * 1.4);
    g.addColorStop(0, "rgba(255,200,87,0.55)"); g.addColorStop(0.6, "rgba(255,160,60,0.18)"); g.addColorStop(1, "rgba(255,160,60,0)");
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cz[0], cz[1], rc * 1.4, 0, 6.2832); ctx.fill();

    var drawn = [], polyOf = function (k, li) {
      var sh = m.shells[k], ring = sh.polys[li], r = m.radii[k], out = [];
      for (var q = 0; q < ring.length; q++) { var v = ring[q]; out.push(proj(R, C, sh.verts[3 * v] * r, sh.verts[3 * v + 1] * r, sh.verts[3 * v + 2] * r)); }
      return out;
    };
    var trace = function (P) { ctx.beginPath(); for (var q = 0; q < P.length; q++) { if (q) ctx.lineTo(P[q][0], P[q][1]); else ctx.moveTo(P[q][0], P[q][1]); } ctx.closePath(); };
    var facing = function (k, li) { // the site's normal against the eye: D·qz > r²
      var sh = m.shells[k], r = m.radii[k], x = sh.sites[3 * li], y = sh.sites[3 * li + 1], z = sh.sites[3 * li + 2], qz = (R[6] * x + R[7] * y + R[8] * z) * r;
      return C.D * qz - r * r;
    };
    // innermost first: two shells below the focus, then the focus; the one above as a ghost
    var lo = Math.min(m.K - 1, C.focus + 2);
    for (var k = lo; k >= C.focus; k--) {
      var dk = k - C.d, fade = Math.max(0.25, 1 - 0.38 * Math.max(0, dk)), tint = k / Math.max(1, m.K - 1);
      var order = [];
      for (var li = 0; li < m.per; li++) { var f = facing(k, li); if (f > -0.02) order.push([f, li]); }
      order.sort(function (a, b) { return a[0] - b[0]; });
      for (var o = 0; o < order.length; o++) {
        li = order[o][1]; var i = k * m.per + li, P = polyOf(k, li), openT = s.open[i] ? 1 : 0;
        if (this.anim && this.anim[i] != null) { openT = Math.min(1, Math.max(0, (now - this.anim[i]) / 180)); if (openT < 1) busy = true; }
        var sh = m.shells[k], n = apply(R, [sh.sites[3 * li], sh.sites[3 * li + 1], sh.sites[3 * li + 2]]), lit = Math.max(0, n[0] * LT[0] + n[1] * LT[1] + n[2] * LT[2]);
        var mineShown = (s.open[i] && s.mine[i]) || (showMines && s.mine[i] && !s.flag[i]);
        if (mineShown) {
          trace(P); ctx.fillStyle = s.open[i] ? "rgb(255,46,77)" : s.phase === "won" ? "rgba(70,130,110," + fade + ")" : "rgba(130,40,60," + fade + ")"; ctx.fill();
        } else if (openT < 1) { // closed: an opaque tile, bluer with depth, fading as it opens
          var cr = [70 + 60 * lit - 30 * tint, 92 + 62 * lit - 10 * tint, 128 + 70 * lit + 10 * tint];
          trace(P); ctx.fillStyle = "rgba(" + (cr[0] * fade | 0) + "," + (cr[1] * fade | 0) + "," + (cr[2] * fade | 0) + "," + (1 - openT).toFixed(3) + ")"; ctx.fill();
        }
        trace(P); ctx.strokeStyle = s.open[i] ? "rgba(120,190,255," + (0.18 * fade).toFixed(3) + ")" : "rgba(4,8,14," + (0.9 * fade).toFixed(2) + ")"; ctx.lineWidth = Math.max(0.6, cellPx * 0.06 * fade); ctx.stroke();
        var c = proj(R, C, sh.sites[3 * li] * m.radii[k], sh.sites[3 * li + 1] * m.radii[k], sh.sites[3 * li + 2] * m.radii[k]);
        var ar = 0; for (var q = 0; q < P.length; q++) { var A = P[q], B = P[(q + 1) % P.length]; ar += A[0] * B[1] - B[0] * A[1]; }
        var fs = Math.sqrt(Math.abs(ar) / 2) * 0.62;
        drawn.push({ i: i, k: k, P: P, c: c, fs: fs });
        if (fs < 5 || order[o][0] < 0.05 * C.D) continue;
        if (s.open[i] && !s.mine[i] && s.count[i] > 0 && openT > 0.5 && k <= C.focus + 1) {
          ctx.globalAlpha = fade; ctx.fillStyle = NUM[s.count[i]] || "#fff"; ctx.font = "700 " + fs.toFixed(1) + "px ui-monospace, Menlo, Consolas, monospace";
          ctx.fillText(String(s.count[i]), c[0], c[1] + fs * 0.04); ctx.globalAlpha = 1;
        } else if (s.flag[i] && !s.open[i]) drawFlag(ctx, c[0], c[1], fs, showMines && !s.mine[i], fade);
        else if (mineShown) drawMine(ctx, c[0], c[1], fs * 0.34, s.open[i]);
      }
    }
    // the shell just above: a faint ghost of what's still closed over you
    if (C.focus > 0) {
      var ka = C.focus - 1, ga = Math.max(0, Math.min(0.5, 0.5 * (1 - (C.d - ka - 0.6) / 1.4)));
      if (ga > 0.02) {
        ctx.strokeStyle = "rgba(160,210,255," + (0.35 * ga).toFixed(3) + ")"; ctx.lineWidth = 1;
        for (li = 0; li < m.per; li++) { i = ka * m.per + li; if (s.open[i] || facing(ka, li) < 0) continue; trace(polyOf(ka, li)); ctx.stroke(); }
      }
    }
    this._drawn = drawn;

    // highlights and the reticle: the cell under the middle and all it counts (ring, below, above)
    var outline = function (i2, style, wdt, dash) {
      var k2 = F.shellOf(m, i2), li2 = i2 - k2 * m.per; if (facing(k2, li2) < -0.02) return;
      trace(polyOf(k2, li2)); ctx.strokeStyle = style; ctx.lineWidth = wdt; ctx.setLineDash(dash || []); ctx.stroke(); ctx.setLineDash([]);
    };
    if (this.hl) this.hl.forEach(function (i2) { outline(i2, "rgba(255,200,87,0.95)", Math.max(1.5, cellPx * 0.12)); });
    if (this.mark) { var pulse = 0.55 + 0.45 * Math.sin(now / 180); this.mark.forEach(function (i2) { outline(i2, "rgba(94,232,193," + pulse.toFixed(2) + ")", Math.max(2, cellPx * 0.16)); }); busy = true; }
    this.focusCell = -1;
    if (this.reticle && (s.phase === "play" || s.phase === "ready")) {
      var fc = this.pick(C.cx, C.cy);
      if (fc >= 0) {
        this.focusCell = fc;
        if (s.phase === "play") {
          var kf = F.shellOf(m, fc);
          m.nbrs[fc].forEach(function (j) {
            var kj = F.shellOf(m, j);
            outline(j, kj === kf ? "rgba(94,232,193,0.9)" : kj > kf ? "rgba(120,190,255,0.95)" : "rgba(200,170,255,0.7)", Math.max(1.4, cellPx * (kj === kf ? 0.1 : 0.08)), kj < kf ? [4, 4] : null);
          });
        }
        outline(fc, "rgba(255,255,255,0.95)", Math.max(2, cellPx * 0.14));
      }
    }
    return busy;
  };

  function drawFlag(ctx, x, y, s, wrong, a) {
    ctx.globalAlpha = a == null ? 1 : a;
    ctx.strokeStyle = "#e6e6ee"; ctx.lineWidth = Math.max(1, s * 0.09);
    ctx.beginPath(); ctx.moveTo(x - s * 0.18, y + s * 0.38); ctx.lineTo(x - s * 0.18, y - s * 0.38); ctx.stroke();
    ctx.fillStyle = "#ff6a3d"; ctx.beginPath(); ctx.moveTo(x - s * 0.18, y - s * 0.38); ctx.lineTo(x + s * 0.32, y - s * 0.18); ctx.lineTo(x - s * 0.18, y + s * 0.02); ctx.closePath(); ctx.fill();
    if (wrong) { ctx.strokeStyle = "#ff2e4d"; ctx.lineWidth = Math.max(1.5, s * 0.12); ctx.beginPath(); ctx.moveTo(x - s * 0.4, y - s * 0.4); ctx.lineTo(x + s * 0.4, y + s * 0.4); ctx.moveTo(x + s * 0.4, y - s * 0.4); ctx.lineTo(x - s * 0.4, y + s * 0.4); ctx.stroke(); }
    ctx.globalAlpha = 1;
  }
  function drawMine(ctx, x, y, r, boom) { // a sea mine: a ball with horns
    ctx.fillStyle = boom ? "#08080c" : "#d8d8e6"; ctx.strokeStyle = ctx.fillStyle; ctx.lineWidth = Math.max(1, r * 0.3);
    ctx.beginPath(); for (var a = 0; a < 6; a++) { var t = a * Math.PI / 3; ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(t) * r * 1.55, y + Math.sin(t) * r * 1.55); } ctx.stroke();
    ctx.beginPath(); ctx.arc(x, y, r, 0, 6.2832); ctx.fill();
  }
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
  F.View = View;
})();

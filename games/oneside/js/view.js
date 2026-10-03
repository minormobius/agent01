/* One Side — the renderer.

   Two panels.
     The strip (below): your stretch of the paper, scrolling with you, in the
       arcade's colours. Through it, faint violet rails: the maze on the
       back of the paper, half a strip away, which is the only maze the
       ghosts obey. The ghosts are drawn where they physically are, so they
       glide through your walls along those rails, and upside down: they're
       on the underside of the paper.
     The band (above): the real thing, a Möbius strip in 3D, the whole
       surface painted on it, turning so your face of the paper faces you.
       You're on top; the ghosts are on the other face of the paper, and
       you see them when the twist brings their face round. */
(function () {
  "use strict";
  var NS = (typeof window !== "undefined") ? window : globalThis;
  var M = NS.ONESIDE;
  var GHOST = ["#ff3b3b", "#ffb8ff", "#3bf0ff", "#ffb851"];

  function View(canvas) {
    this.cv = canvas; this.ctx = canvas.getContext("2d"); this.w = 0; this.h = 0; this.dpr = 1;
    this.game = null; this.camX = 0; this.R = [1, 0, 0, 0, 1, 0, 0, 0, 1]; this.showBand = true;
  }
  View.prototype.resize = function () {
    var dpr = Math.min(2, NS.devicePixelRatio || 1), r = this.cv.getBoundingClientRect();
    this.dpr = dpr; this.w = r.width; this.h = r.height;
    this.cv.width = Math.round(r.width * dpr); this.cv.height = Math.round(r.height * dpr);
  };
  View.prototype.layout = function () {
    var bandH = this.showBand ? Math.min(this.h * 0.36, this.w * 0.62) : 0, H = M.H;
    var ts = Math.min((this.h - bandH - 8) / H, this.w / 13);
    return { bandH: bandH, ts: ts, top: bandH + Math.max(4, (this.h - bandH - ts * H) / 2), H: H };
  };
  View.prototype.draw = function (now) {
    var ctx = this.ctx, dpr = this.dpr, G = this.game;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, this.w, this.h);
    if (!G) return;
    var Ly = this.layout(), q = G.pos(G.pac);
    // the camera keeps up with you the short way round the band
    this.camX += M.dx(this.camX, q[0]) * 0.25; this.camX = M.wrapX(this.camX);
    this.strip(Ly, now);
    if (this.showBand) this.band(Ly, now);
  };

  /* ------------------------------------------------------------ the strip */
  View.prototype.strip = function (Ly, now) {
    var ctx = this.ctx, G = this.game, mz = G.maze, ts = Ly.ts, H = M.H, top = Ly.top, cx = this.w / 2, camX = this.camX;
    var half = Math.ceil(this.w / ts / 2) + 2, x0 = Math.floor(camX) - half, x1 = Math.floor(camX) + half;
    var sx = function (x) { return cx + (x - camX) * ts; }, sy = function (y) { return top + y * ts; };
    ctx.save(); ctx.beginPath(); ctx.rect(0, top - 2, this.w, H * ts + 4); ctx.clip();
    ctx.fillStyle = "#03030a"; ctx.fillRect(0, top, this.w, H * ts);
    // your walls: the arcade's blue, outlined where they meet a corridor
    var open = function (x, y) { return M.isOpen(mz, x, y); };
    for (var x = x0; x <= x1; x++) for (var y = 0; y < H; y++) {
      if (open(x, y)) continue;
      ctx.fillStyle = "#0b1450"; ctx.fillRect(sx(x), sy(y), ts + 0.5, ts + 0.5);
    }
    ctx.strokeStyle = "#3d5cff"; ctx.lineWidth = Math.max(1.5, ts * 0.12); ctx.lineCap = "round"; ctx.beginPath();
    for (x = x0; x <= x1; x++) for (y = 0; y < H; y++) {
      if (open(x, y)) continue;
      if (open(x, y - 1)) { ctx.moveTo(sx(x), sy(y)); ctx.lineTo(sx(x + 1), sy(y)); }
      if (open(x, y + 1)) { ctx.moveTo(sx(x), sy(y + 1)); ctx.lineTo(sx(x + 1), sy(y + 1)); }
      if (open(x - 1, y)) { ctx.moveTo(sx(x), sy(y)); ctx.lineTo(sx(x), sy(y + 1)); }
      if (open(x + 1, y)) { ctx.moveTo(sx(x + 1), sy(y)); ctx.lineTo(sx(x + 1), sy(y + 1)); }
    }
    ctx.stroke();
    // the paper's edge (one edge, seen twice)
    ctx.strokeStyle = "rgba(255,255,255,0.12)"; ctx.lineWidth = 1; ctx.strokeRect(-2, top, this.w + 4, H * ts);
    // the rails: the maze on the back of the paper, seen through it (mirrored top to bottom)
    ctx.strokeStyle = "rgba(196,150,255,0.30)"; ctx.lineWidth = Math.max(1, ts * 0.09); ctx.setLineDash([ts * 0.22, ts * 0.18]); ctx.beginPath();
    for (x = x0; x <= x1; x++) for (y = 0; y < H; y++) {
      var b = M.back(x, y);
      if (!open(b[0], b[1])) continue;
      var c0 = sx(x + 0.5), c1 = sy(y + 0.5);
      if (open(b[0] + 1, b[1])) { ctx.moveTo(c0, c1); ctx.lineTo(sx(x + 1.5), c1); }
      if (open(b[0], b[1] - 1)) { ctx.moveTo(c0, c1); ctx.lineTo(c0, sy(y + 1.5)); } // back's up is your down
    }
    ctx.stroke(); ctx.setLineDash([]);
    // dots
    var pulse = 0.75 + 0.25 * Math.sin(now / 150);
    for (x = x0; x <= x1; x++) for (y = 0; y < H; y++) {
      var v = mz.dots[y * M.W + M.wrapX(x)];
      if (!v) continue;
      ctx.fillStyle = "#ffd9b0"; ctx.beginPath(); ctx.arc(sx(x + 0.5), sy(y + 0.5), v === 2 ? ts * 0.3 * pulse : ts * 0.09, 0, 6.2832); ctx.fill();
    }
    // you
    var P = G.pac, q = G.pos(P), dying = G.state === "dying" ? Math.min(1, G.stateT / 1.2) : 0;
    var px = sx(camX + M.dx(camX, q[0]) + 0.5), py = sy(q[1] + 0.5), mouth = dying ? Math.PI * dying : 0.08 + 0.32 * Math.abs(Math.sin(P.mouth * Math.PI));
    var ang = [-Math.PI / 2, Math.PI, Math.PI / 2, 0][P.d];
    ctx.fillStyle = "#ffe14d"; ctx.beginPath(); ctx.moveTo(px, py); ctx.arc(px, py, ts * 0.46, ang + mouth, ang + 2 * Math.PI - mouth); ctx.closePath(); ctx.fill();
    // the ghosts, where they physically are: on the other face, so upside down
    var self = this;
    G.ghosts.forEach(function (g) {
      var s = G.seen(g), gx = sx(camX + M.dx(camX, s[0]) + 0.5), gy = sy(s[1] + 0.5);
      if (gx < -ts || gx > self.w + ts) return;
      drawGhost(ctx, gx, gy, ts * 0.48, g, G, now);
    });
    ctx.restore();
  };
  function drawGhost(ctx, x, y, r, g, G, now) {
    var col = GHOST[g.i], fr = g.fright && g.state === "out", eyesOnly = g.state === "eyes", waiting = g.state === "wait";
    if (fr) col = G.frightT < 2 && Math.floor(now / 200) % 2 ? "#e8e8ff" : "#2233ff";
    ctx.save(); ctx.translate(x, y); ctx.scale(1, -1); // the underside of the paper
    ctx.globalAlpha = waiting ? 0.35 : 0.92;
    if (!eyesOnly) {
      ctx.fillStyle = col; ctx.beginPath();
      ctx.arc(0, -r * 0.1, r, Math.PI, 0); ctx.lineTo(r, r * 0.85);
      var k = 4, wv = Math.sin(now / 90) * 0.12;
      for (var i = 0; i < k; i++) { var xa = r - (2 * r) * (i + 0.5) / k, xb = r - (2 * r) * (i + 1) / k; ctx.lineTo(xa, r * (0.6 + wv)); ctx.lineTo(xb, r * 0.85); }
      ctx.closePath(); ctx.fill();
    }
    if (!fr) {
      [-0.36, 0.36].forEach(function (ex) {
        ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.ellipse(ex * r, -r * 0.2, r * 0.24, r * 0.3, 0, 0, 6.2832); ctx.fill();
        ctx.fillStyle = "#1d2bff"; ctx.beginPath(); ctx.arc(ex * r + M.DX[g.d] * r * 0.1, -r * 0.2 - M.DY[g.d] * r * 0.12, r * 0.12, 0, 6.2832); ctx.fill();
      });
    }
    ctx.restore();
  }

  /* ------------------------------------------------------------- the band */
  var RR = 1, HW = 0.42;
  function mob(u, y) { // surface point (u along, y across) → the Möbius strip in 3D
    var th = 2 * Math.PI * u / M.L, v = ((y / (M.H)) - 0.5) * 2 * HW, c = Math.cos(th / 2), s = Math.sin(th / 2);
    return [(RR + v * c) * Math.cos(th), (RR + v * c) * Math.sin(th), v * s];
  }
  function sub(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
  function cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
  function norm(a) { var l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; }
  function apply(R, p) { return [R[0] * p[0] + R[1] * p[1] + R[2] * p[2], R[3] * p[0] + R[4] * p[1] + R[5] * p[2], R[6] * p[0] + R[7] * p[1] + R[8] * p[2]]; }
  /* The normal of the face at surface point (u, y): the side of the paper you'd be standing on. */
  function faceNormal(u, y) { var a = mob(u, y), b = mob(u + 0.05, y), c = mob(u, y + 0.05); return norm(cross(sub(b, a), sub(c, a))); }
  View.prototype.band = function (Ly, now) {
    var ctx = this.ctx, G = this.game, mz = G.maze, W2 = M.W, H = M.H, cx = this.w / 2, cy = Ly.bandH / 2 + 2, sc = Math.min(this.w / 2, Ly.bandH / 2) / (RR + HW) * 0.92;
    ctx.save(); ctx.beginPath(); ctx.rect(0, 0, this.w, Ly.bandH); ctx.clip();
    // turn the band so your face of the paper, tilted back a little, faces you
    var q = G.pos(G.pac), n = faceNormal(q[0] + 0.5, q[1] + 0.5), p = mob(q[0] + 0.5, q[1] + 0.5);
    var want = norm([n[0] * 0.75 + p[0] * 0.45, n[1] * 0.75 + p[1] * 0.45, n[2] * 0.75 + p[2] * 0.45 + 0.35]);
    this.R = ease(this.R, want, 0.06);
    var R = this.R, quads = [];
    for (var u = 0; u < W2; u++) for (var y = 0; y < H; y++) {
      var a = mob(u, y), b = mob(u + 1, y), c = mob(u + 1, y + 1), d = mob(u, y + 1), nn = apply(R, norm(cross(sub(b, a), sub(d, a))));
      if (nn[2] <= 0) continue; // the other face of this patch is drawn from its own surface point, half a band away
      var A = apply(R, a), B = apply(R, b), C = apply(R, c), D = apply(R, d);
      quads.push({ z: (A[2] + C[2]) / 2, P: [A, B, C, D], open: M.isOpen(mz, u, y), lit: 0.45 + 0.55 * nn[2], dot: mz.dots[y * W2 + u] });
    }
    quads.sort(function (s1, s2) { return s1.z - s2.z; });
    ctx.lineJoin = "round";
    quads.forEach(function (Q) {
      ctx.beginPath(); Q.P.forEach(function (v, k) { var X = cx + sc * v[0], Y = cy - sc * v[1]; if (k) ctx.lineTo(X, Y); else ctx.moveTo(X, Y); }); ctx.closePath();
      var L2 = Q.lit;
      ctx.fillStyle = Q.open ? "rgb(" + (24 * L2 + 8 | 0) + "," + (24 * L2 + 8 | 0) + "," + (40 * L2 + 14 | 0) + ")" : "rgb(" + (30 * L2 + 6 | 0) + "," + (60 * L2 + 10 | 0) + "," + (230 * L2 + 20 | 0) + ")";
      ctx.fill();
    });
    // you, and the ghosts on their faces (seen only when their face is toward you)
    var mark = function (u2, y2, col, r) {
      var nn2 = apply(R, faceNormal(u2, y2)), v = apply(R, mob(u2, y2)), lift = 0.03; v = [v[0] + nn2[0] * lift, v[1] + nn2[1] * lift, v[2]];
      ctx.globalAlpha = nn2[2] > 0.05 ? 1 : 0.3; // the far face: faintly, through the paper
      ctx.fillStyle = col; ctx.beginPath(); ctx.arc(cx + sc * v[0], cy - sc * v[1], r, 0, 6.2832); ctx.fill(); ctx.globalAlpha = 1;
    };
    G.ghosts.forEach(function (g) { if (g.state === "wait") return; var gp = G.pos(g); mark(gp[0] + 0.5, gp[1] + 0.5, g.fright ? "#2233ff" : GHOST[g.i], Math.max(3, sc * 0.045)); });
    mark(q[0] + 0.5, q[1] + 0.5, "#ffe14d", Math.max(3.5, sc * 0.055));
    ctx.fillStyle = "rgba(255,255,255,0.35)"; ctx.font = "600 11px ui-monospace, Menlo, monospace"; ctx.textAlign = "left";
    ctx.fillText("the band: one side", 10, 16);
    ctx.restore();
  };
  /* Rotate R a fraction t of the way to bringing unit vector v (model space) to face the viewer (+z). */
  function ease(R, v, t) {
    var w = apply(R, v), s = Math.hypot(w[0], w[1]); if (s < 1e-9) return R;
    var ang = Math.atan2(s, w[2]) * t, ax = [w[1] / s, -w[0] / s, 0], c = Math.cos(ang), sn = Math.sin(ang), C = 1 - c, x = ax[0], y = ax[1], z = ax[2];
    var Q = [c + x * x * C, x * y * C - z * sn, x * z * C + y * sn, y * x * C + z * sn, c + y * y * C, y * z * C - x * sn, z * x * C - y * sn, z * y * C + x * sn, c + z * z * C], out = new Array(9);
    for (var i = 0; i < 3; i++) for (var j = 0; j < 3; j++) out[3 * i + j] = Q[3 * i] * R[j] + Q[3 * i + 1] * R[3 + j] + Q[3 * i + 2] * R[6 + j];
    return out;
  }
  M.View = View; M.mob = mob; M.faceNormal = faceNormal;
})();

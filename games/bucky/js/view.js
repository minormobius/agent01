/* Bucky — the renderer. Orthographic, one 3×3 rotation, canvas 2D, as in
   /strand/. The far side is drawn faint underneath so a wire that goes
   round the back can still be followed. A bond with an arrow is a wire
   segment; it glows when the atom driving it is on. */
(function () {
  "use strict";
  var NS = (typeof window !== "undefined") ? window : globalThis;
  var B = NS.BUCKY;

  var COL = {
    bg: "#080a12", bond: "#272c40", wire: "#6f7896", lit: "#ffa53c", litGlow: "rgba(255,165,60,0.55)",
    atom: "#323850", text: "#e8ecf8", dim: "#8a90aa", bad: "#ff4d5e", open: "#8a90aa",
    src: "#5ee8c1", lamp: "#ffd23f", pent: "rgba(124,140,255,0.07)",
    not: "#ff7aa8", and: "#7c8cff", or: "#5ec4ff", xor: "#c07cff", nand: "#ff9a5e", nor: "#5ee8a0", wireAtom: "#7a84a6",
  };
  B.COL = COL;

  function View(cv) {
    this.cv = cv; this.ctx = cv.getContext("2d");
    this.R = [1, 0, 0, 0, 1, 0, 0, 0, 1]; this.zoom = 1; this.w = 0; this.h = 0; this.dpr = 1;
    this.ball = B.ball();
    this.design = null; this.comp = null; this.vals = null; this.term = null; this.trail = null; this.hot = -1;
  }
  View.prototype.resize = function () {
    var dpr = Math.min(2, NS.devicePixelRatio || 1), r = this.cv.getBoundingClientRect();
    this.dpr = dpr; this.w = r.width; this.h = r.height;
    this.cv.width = Math.round(r.width * dpr); this.cv.height = Math.round(r.height * dpr);
  };
  View.prototype.radius = function () { return Math.min(this.w, this.h) * 0.45 * this.zoom; };
  View.prototype.drag = function (dx, dy) {
    var r = this.radius(), a = dx / r, b = dy / r, ca = Math.cos(a), sa = Math.sin(a), cb = Math.cos(b), sb = Math.sin(b);
    this.R = mul([ca, sa * sb, sa * cb, 0, cb, -sb, -sa, ca * sb, ca * cb], this.R); ortho(this.R);
  };
  /* Turn a fraction t of the way to bring model point p to the front. */
  View.prototype.face = function (p, t) {
    var v = apply(this.R, p), s = Math.hypot(v[1], v[0]);
    if (s < 1e-9) return;
    var ang = Math.atan2(s, v[2]) * (t == null ? 1 : t), u = [v[1] / s, -v[0] / s, 0];
    this.R = mul(rotAxis(u, ang), this.R); ortho(this.R);
  };
  View.prototype.proj = function (p) {
    var v = apply(this.R, p), r = this.radius();
    return [this.w / 2 + r * v[0], this.h / 2 - r * v[1], v[2]];
  };
  /* Atom under a screen point (near side only), within `reach` bond lengths; or -1. */
  View.prototype.atomAt = function (px, py, reach) {
    var best = Infinity, bi = -1, P = this.ball.atoms;
    for (var a = 0; a < this.ball.n; a++) {
      var q = this.proj(P[a]); if (q[2] < 0.05) continue;
      var d = Math.hypot(q[0] - px, q[1] - py); if (d < best) { best = d; bi = a; }
    }
    return best <= (reach || 0.6) * this.bondPx() ? bi : -1;
  };
  /* Atom or bond under a tap: { atom } or { bond: [a, b] } or null. */
  View.prototype.pick = function (px, py) {
    var P = this.ball.atoms, bestA = Infinity, ai = -1, bestB = Infinity, bi = null;
    for (var a = 0; a < this.ball.n; a++) {
      var q = this.proj(P[a]); if (q[2] < 0.05) continue;
      var d = Math.hypot(q[0] - px, q[1] - py); if (d < bestA) { bestA = d; ai = a; }
    }
    this.ball.bonds.forEach(function (e) {
      var p = P[e[0]], o = P[e[1]], m = [(p[0] + o[0]) / 2, (p[1] + o[1]) / 2, (p[2] + o[2]) / 2];
      var q = this.proj(m); if (q[2] < 0.05) return;
      var d = Math.hypot(q[0] - px, q[1] - py); if (d < bestB) { bestB = d; bi = e; }
    }, this);
    var bp = this.bondPx();
    if (bi && bestB < 0.32 * bp && bestB < bestA * 0.85) return { bond: bi };
    if (ai >= 0 && bestA < 0.7 * bp) return { atom: ai };
    return null;
  };
  View.prototype.bondPx = function () { return this.radius() * 0.41; };

  View.prototype.draw = function () {
    var ctx = this.ctx, dpr = this.dpr, ball = this.ball, self = this;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, this.w, this.h);
    if (!this.design) return;
    var r = this.radius(), cx = this.w / 2, cy = this.h / 2, Q = ball.atoms.map(function (p) { return self.proj(p); });
    var d = this.design, c = this.comp, v = this.vals || [], bp = this.bondPx(), ar = Math.max(7, bp * 0.24);
    // the sphere's disc
    var g = ctx.createRadialGradient(cx - r * 0.3, cy - r * 0.35, r * 0.1, cx, cy, r * 1.05);
    g.addColorStop(0, "#161a2c"); g.addColorStop(1, "#0b0d18");
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, r * 1.04, 0, 2 * Math.PI); ctx.fill();
    // pentagons, tinted: they make the clocks
    ball.faces.pent.forEach(function (f) {
      var z = 0; f.forEach(function (a) { z += Q[a][2]; });
      if (z < 0) return;
      ctx.fillStyle = COL.pent; ctx.beginPath();
      f.forEach(function (a, i) { if (i) ctx.lineTo(Q[a][0], Q[a][1]); else ctx.moveTo(Q[a][0], Q[a][1]); });
      ctx.closePath(); ctx.fill();
    });
    var fade = function (z) { return z >= 0 ? 1 : Math.max(0.07, 0.3 + z * 0.3); };
    // far side first, then near
    [false, true].forEach(function (near) {
      ball.bonds.forEach(function (e) {
        var p = Q[e[0]], q = Q[e[1]], z = (p[2] + q[2]) / 2;
        if ((z >= 0) !== near) return;
        var f = d.arrow[B.key(e[0], e[1])], on = f !== undefined && v[f];
        ctx.globalAlpha = fade(z);
        if (f === undefined) { ctx.strokeStyle = COL.bond; ctx.lineWidth = 2; }
        else if (on) { ctx.strokeStyle = COL.lit; ctx.lineWidth = 5; ctx.shadowColor = COL.litGlow; ctx.shadowBlur = near ? 10 : 0; }
        else { ctx.strokeStyle = COL.wire; ctx.lineWidth = 4; }
        ctx.beginPath(); ctx.moveTo(p[0], p[1]); ctx.lineTo(q[0], q[1]); ctx.stroke();
        ctx.shadowBlur = 0;
        if (f !== undefined) {
          var s = f === e[0] ? p : q, t = f === e[0] ? q : p, dx = t[0] - s[0], dy = t[1] - s[1], l = Math.hypot(dx, dy);
          if (l > 4) {
            var ux = dx / l, uy = dy / l, mx = (s[0] + t[0]) / 2 + ux * 3, my = (s[1] + t[1]) / 2 + uy * 3, k = Math.min(7, l * 0.22);
            ctx.fillStyle = on ? "#fff3d6" : "#c8cee6";
            ctx.beginPath(); ctx.moveTo(mx + ux * k, my + uy * k); ctx.lineTo(mx - ux * k - uy * k * 0.8, my - uy * k + ux * k * 0.8);
            ctx.lineTo(mx - ux * k + uy * k * 0.8, my - uy * k - ux * k * 0.8); ctx.closePath(); ctx.fill();
          }
        }
      });
      for (var a = 0; a < ball.n; a++) {
        var q = Q[a]; if ((q[2] >= 0) !== near) continue;
        ctx.globalAlpha = fade(q[2]);
        self.atom(a, q, ar * (0.75 + 0.25 * Math.max(0, q[2])), d, c, v, near);
      }
    });
    ctx.globalAlpha = 1;
    if (this.hot >= 0 && Q[this.hot][2] > 0) {
      ctx.strokeStyle = "rgba(255,255,255,0.7)"; ctx.lineWidth = 2; ctx.beginPath();
      ctx.arc(Q[this.hot][0], Q[this.hot][1], ar * 1.45, 0, 2 * Math.PI); ctx.stroke();
    }
  };
  View.prototype.atom = function (a, q, rr, d, c, v, near) {
    var ctx = this.ctx, role = d.role[a], st = c ? c.status[a] : "ok", on = v[a], x = q[0], y = q[1];
    var ring = function (col, w, dash) {
      ctx.strokeStyle = col; ctx.lineWidth = w; if (dash) ctx.setLineDash(dash);
      ctx.beginPath(); ctx.arc(x, y, rr, 0, 2 * Math.PI); ctx.stroke(); ctx.setLineDash([]);
    };
    var label = function (s, col, size) {
      if (!near || !s) return;
      ctx.fillStyle = col; ctx.font = "700 " + Math.round(size) + "px ui-monospace, Menlo, monospace";
      ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(s, x, y + 0.5);
    };
    if (!role) {
      ctx.fillStyle = st === "bad" ? COL.bad : COL.atom;
      ctx.beginPath(); ctx.arc(x, y, rr * 0.32, 0, 2 * Math.PI); ctx.fill(); return;
    }
    if (role === "src") {
      var nm = this.term.name[a];
      ctx.fillStyle = on ? COL.src : "#123a32"; ctx.strokeStyle = COL.src; ctx.lineWidth = 2;
      roundRect(ctx, x - rr * 1.15, y - rr * 0.85, rr * 2.3, rr * 1.7, 5); ctx.fill(); ctx.stroke();
      label(nm.length > 5 ? nm.slice(0, 4) : nm, on ? "#04201a" : COL.src, rr * (nm.length > 4 ? 0.5 : nm.length > 3 ? 0.62 : 0.85));
      if (st === "bad") ring(COL.bad, 3);
      return;
    }
    if (role === "lamp") {
      if (on) { ctx.shadowColor = "rgba(255,210,63,0.9)"; ctx.shadowBlur = near ? 26 : 0; }
      ctx.fillStyle = on ? COL.lamp : "#2d2810"; ctx.beginPath(); ctx.arc(x, y, rr * 1.25, 0, 2 * Math.PI); ctx.fill();
      ctx.shadowBlur = 0;
      ctx.strokeStyle = COL.lamp; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, y, rr * 1.25, 0, 2 * Math.PI); ctx.stroke();
      var ln = this.term.name[a];
      label(ln.length > 4 ? ln.slice(0, 4) : ln, on ? "#2d2400" : COL.lamp, rr * (ln.length > 3 ? 0.6 : 0.8));
      if (st === "bad") ring(COL.bad, 3);
      return;
    }
    var join = c && c.ins[a].length === 2;
    if (role === "wire") {
      ctx.fillStyle = on ? COL.lit : COL.wireAtom; ctx.beginPath(); ctx.arc(x, y, rr * (join ? 0.62 : 0.5), 0, 2 * Math.PI); ctx.fill();
      if (join && st === "ok") { label("OR", on ? "#2d1800" : "#0b0d18", rr * 0.48); return; }
      if (st === "bad") { rr *= 0.75; ring(COL.bad, 3); } else if (st === "open") { rr *= 0.75; ring(COL.open, 1.5, [3, 3]); }
      return;
    }
    var col = COL[role] || COL.text;
    ctx.fillStyle = on ? col : "#141828"; ctx.beginPath(); ctx.arc(x, y, rr, 0, 2 * Math.PI); ctx.fill();
    ring(st === "bad" ? COL.bad : col, st === "bad" ? 3 : 2, st === "open" ? [4, 3] : null);
    var t = role === "not" && join ? "NOR" : B.PARTS[role].label;
    label(t, on ? "#0b0d18" : col, rr * (t.length > 3 ? 0.56 : 0.7));
  };

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath(); ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r); ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h); ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r); ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y); ctx.closePath();
  }
  function apply(R, p) { return [R[0] * p[0] + R[1] * p[1] + R[2] * p[2], R[3] * p[0] + R[4] * p[1] + R[5] * p[2], R[6] * p[0] + R[7] * p[1] + R[8] * p[2]]; }
  function mul(A, Bm) {
    var C = new Array(9);
    for (var i = 0; i < 3; i++) for (var j = 0; j < 3; j++) C[3 * i + j] = A[3 * i] * Bm[j] + A[3 * i + 1] * Bm[3 + j] + A[3 * i + 2] * Bm[6 + j];
    return C;
  }
  function rotAxis(u, t) {
    var c = Math.cos(t), s = Math.sin(t), C = 1 - c, x = u[0], y = u[1], z = u[2];
    return [c + x * x * C, x * y * C - z * s, x * z * C + y * s, y * x * C + z * s, c + y * y * C, y * z * C - x * s, z * x * C - y * s, z * y * C + x * s, c + z * z * C];
  }
  function ortho(R) {
    var a = [R[0], R[1], R[2]], b = [R[3], R[4], R[5]], la = Math.hypot(a[0], a[1], a[2]);
    a = a.map(function (x) { return x / la; });
    var k = a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; b = [b[0] - k * a[0], b[1] - k * a[1], b[2] - k * a[2]];
    var lb = Math.hypot(b[0], b[1], b[2]); b = b.map(function (x) { return x / lb; });
    var c = [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
    for (var i = 0; i < 3; i++) { R[i] = a[i]; R[3 + i] = b[i]; R[6 + i] = c[i]; }
  }
  B.View = View;
})();

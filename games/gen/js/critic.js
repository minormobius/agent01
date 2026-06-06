/* The Ludographer — the NN CRITIC (Rung 2).
 *
 * A tiny multilayer perceptron — the same machinery as the `descent/` toy net,
 * just a wider input and a regression head — that learns to predict a game's
 * self-test quality score from its STATIC feature vector, i.e. WITHOUT playing
 * it. Once trained, the generator can screen a seed in microseconds instead of
 * seconds of simulation, and you can search the catalogue for good games.
 *
 *     x (≈72) → tanh(W1·x + b1) (nHid) → W2·h + b2 → ŷ  (quality/100)
 *
 * Pure JS, no framework, no GPU: forward pass, MSE loss, hand-rolled backprop,
 * mini-batch SGD with momentum + L2. Input standardisation (per-feature mean/sd)
 * is fit at train time and baked into the serialised model so browser inference
 * matches. Works in node (training) and the browser (inference).
 * Attaches to LUDO.Critic. */
(function () {
  "use strict";
  var NS = (typeof window !== "undefined") ? window : globalThis;
  var L = NS.LUDO = NS.LUDO || {};

  function tanh(x) { return Math.tanh(x); }

  function Critic(nIn, nHid, seed) {
    this.nIn = nIn; this.nHid = nHid || 24;
    var r = L.prng.Rand("critic::" + (seed == null ? 1 : seed));
    var rng1 = Math.sqrt(6 / (nIn + this.nHid)), rng2 = Math.sqrt(6 / (this.nHid + 1));
    this.W1 = mat(this.nHid, nIn, function () { return (r.f() * 2 - 1) * rng1; });
    this.b1 = vec(this.nHid, 0);
    this.W2 = vec(this.nHid, function () { return (r.f() * 2 - 1) * rng2; });
    this.b2 = 0;
    this.mu = vec(nIn, 0); this.sd = vec(nIn, 1);   // input standardisation
  }

  Critic.prototype.fitStandardiser = function (X) {
    var n = X.length, d = this.nIn, i, j;
    for (j = 0; j < d; j++) { this.mu[j] = 0; this.sd[j] = 0; }
    for (i = 0; i < n; i++) for (j = 0; j < d; j++) this.mu[j] += X[i][j];
    for (j = 0; j < d; j++) this.mu[j] /= n;
    for (i = 0; i < n; i++) for (j = 0; j < d; j++) { var dd = X[i][j] - this.mu[j]; this.sd[j] += dd * dd; }
    for (j = 0; j < d; j++) this.sd[j] = Math.sqrt(this.sd[j] / n) || 1;
  };
  Critic.prototype.norm = function (x) {
    var z = new Array(this.nIn);
    for (var j = 0; j < this.nIn; j++) z[j] = (x[j] - this.mu[j]) / this.sd[j];
    return z;
  };

  // forward on an already-normalised input; returns { h, o }
  Critic.prototype._fwd = function (z) {
    var h = new Array(this.nHid), o = this.b2, k, j;
    for (k = 0; k < this.nHid; k++) {
      var s = this.b1[k], row = this.W1[k];
      for (j = 0; j < this.nIn; j++) s += row[j] * z[j];
      h[k] = tanh(s); o += this.W2[k] * h[k];
    }
    return { h: h, o: o };
  };

  // ŷ in [0,1]; predict() returns 0..100 clamped.
  Critic.prototype.predictRaw = function (x) { return this._fwd(this.norm(x)).o; };
  Critic.prototype.predict = function (x) { return Math.max(0, Math.min(100, this.predictRaw(x) * 100)); };

  // Train on X (array of feature vectors) and Y (array of quality 0..100).
  // If opts.valX/valY are given, tracks validation MSE and keeps the BEST
  // weights seen (early stopping by snapshot) — the antidote to overfitting a
  // noisy target with more params than the signal can support.
  Critic.prototype.train = function (X, Y, opts) {
    opts = opts || {};
    var epochs = opts.epochs || 300, batch = opts.batch || 32,
        lr = opts.lr || 0.05, mom = opts.momentum == null ? 0.9 : opts.momentum,
        l2 = opts.l2 == null ? 1e-4 : opts.l2, onEpoch = opts.onEpoch;
    var n = X.length, d = this.nIn, H = this.nHid;
    this.fitStandardiser(X);
    var Z = X.map(this.norm, this);
    var yt = Y.map(function (q) { return q / 100; });
    var hasVal = opts.valX && opts.valY;
    var Zval = hasVal ? opts.valX.map(this.norm, this) : null;
    var ytVal = hasVal ? opts.valY.map(function (q) { return q / 100; }) : null;
    var best = null, bestVal = Infinity, self = this;

    // momentum buffers
    var vW1 = mat(H, d, 0), vb1 = vec(H, 0), vW2 = vec(H, 0), vb2 = { v: 0 };
    var rng = L.prng.Rand("critic-sgd");
    var idx = []; for (var i = 0; i < n; i++) idx.push(i);
    var hist = [];

    for (var ep = 0; ep < epochs; ep++) {
      shuffle(idx, rng);
      for (var bs = 0; bs < n; bs += batch) {
        var m = Math.min(batch, n - bs);
        // accumulate grads
        var gW1 = mat(H, d, 0), gb1 = vec(H, 0), gW2 = vec(H, 0), gb2 = 0;
        for (var bi = 0; bi < m; bi++) {
          var s = idx[bs + bi], z = Z[s];
          var f = this._fwd(z), o = f.o, h = f.h;
          var doo = (o - yt[s]);            // dLoss/do (MSE, factor folded)
          gb2 += doo;
          for (var k = 0; k < H; k++) {
            gW2[k] += doo * h[k];
            var dh = doo * this.W2[k];
            var dz = dh * (1 - h[k] * h[k]); // tanh'
            gb1[k] += dz;
            var gr = gW1[k];
            for (var j = 0; j < d; j++) gr[j] += dz * z[j];
          }
        }
        var scale = 1 / m;
        // SGD + momentum + L2
        for (var k2 = 0; k2 < H; k2++) {
          vb1[k2] = mom * vb1[k2] - lr * (gb1[k2] * scale);
          this.b1[k2] += vb1[k2];
          vW2[k2] = mom * vW2[k2] - lr * (gW2[k2] * scale + l2 * this.W2[k2]);
          this.W2[k2] += vW2[k2];
          var vr = vW1[k2], wr = this.W1[k2], grr = gW1[k2];
          for (var j2 = 0; j2 < d; j2++) {
            vr[j2] = mom * vr[j2] - lr * (grr[j2] * scale + l2 * wr[j2]);
            wr[j2] += vr[j2];
          }
        }
        vb2.v = mom * vb2.v - lr * (gb2 * scale);
        this.b2 += vb2.v;
      }
      // validation / early-stopping snapshot
      if (hasVal) {
        var vmse = this.loss(Zval, ytVal);
        if (vmse < bestVal) { bestVal = vmse; best = snapshot(this); }
      }
      if (onEpoch && (ep % Math.max(1, (epochs / 20 | 0)) === 0 || ep === epochs - 1)) {
        var mse = this.loss(Z, yt);
        hist.push({ ep: ep, mse: mse, val: hasVal ? bestVal : null });
        onEpoch(ep, mse, hasVal ? bestVal : null);
      }
    }
    if (best) restore(this, best);   // roll back to the best validation weights
    return hist;
  };

  function snapshot(c) {
    return { W1: c.W1.map(function (r) { return r.slice(); }), b1: c.b1.slice(), W2: c.W2.slice(), b2: c.b2 };
  }
  function restore(c, s) { c.W1 = s.W1; c.b1 = s.b1; c.W2 = s.W2; c.b2 = s.b2; }

  // MSE over (already-normalised Z, targets yt in [0,1]); preNorm=true means Z normalised
  Critic.prototype.loss = function (Z, yt) {
    var s = 0;
    for (var i = 0; i < Z.length; i++) { var o = this._fwd(Z[i]).o, e = o - yt[i]; s += e * e; }
    return s / Z.length;
  };

  // MAE in quality points over raw X (not normalised) and Y in 0..100
  Critic.prototype.mae = function (X, Y) {
    var s = 0; for (var i = 0; i < X.length; i++) s += Math.abs(this.predict(X[i]) - Y[i]);
    return s / X.length;
  };

  Critic.prototype.toJSON = function () {
    return { nIn: this.nIn, nHid: this.nHid, W1: this.W1, b1: this.b1, W2: this.W2, b2: this.b2, mu: this.mu, sd: this.sd };
  };
  Critic.fromJSON = function (j) {
    var c = new Critic(j.nIn, j.nHid, 1);
    c.W1 = j.W1; c.b1 = j.b1; c.W2 = j.W2; c.b2 = j.b2; c.mu = j.mu; c.sd = j.sd;
    return c;
  };

  function mat(rows, cols, fill) { var m = new Array(rows); for (var i = 0; i < rows; i++) { m[i] = new Array(cols); for (var j = 0; j < cols; j++) m[i][j] = typeof fill === "function" ? fill() : fill; } return m; }
  function vec(n, fill) { var v = new Array(n); for (var i = 0; i < n; i++) v[i] = typeof fill === "function" ? fill() : fill; return v; }
  function shuffle(a, rng) { for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(rng.f() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; } }

  L.Critic = Critic;
})();

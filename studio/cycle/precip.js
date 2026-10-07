// precip.js — what the weather draws over a frame: rain, its rings on the lake, snow, fog, lightning.
//
// The light of the weather is the palette's (weather.js `weatherLight`: overcast, darkening, the flash
// that whitens everything). What falls is drawn here, in RGB over the finished frame, because it
// crosses everything: a streak of rain passes in front of rock, sky and water alike, and no index
// can stand for "rain over whatever is behind". Each is a pure function of the scene clock `t`: a
// streak's place is its seed plus its speed times t, a ring's is chosen afresh each time it restarts.
//
//   const fx = new Precip(W, H, seed);
//   fx.draw(px, { t, wx, lt, flash: lightning(...), water: (x, y) => bool, horizon, ground, mode })

const hash = (a, b, c) => {
  let h = (a * 374761393 + b * 668265263 + c * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};
const clamp = (v, a = 0, b = 1) => (v < a ? a : v > b ? b : v);

export class Precip {
  constructor(W, H, seed = 1) {
    this.W = W; this.H = H; this.seed = seed;
    const N = 1200;
    this.rain = Array.from({ length: N }, (_, i) => ({ x: hash(i, seed, 1) * W, y: hash(i, seed, 2) * (H + 40), v: 280 + hash(i, seed, 3) * 160, len: 5 + hash(i, seed, 4) * 9, b: 0.6 + 0.4 * hash(i, seed, 5) }));
    this.snow = Array.from({ length: 1000 }, (_, i) => ({ x: hash(i, seed, 6) * W, y: hash(i, seed, 7) * H, v: 14 + hash(i, seed, 8) * 34, f: 0.6 + hash(i, seed, 9) * 1.4, p: hash(i, seed, 10) * 6.28, big: hash(i, seed, 11) < 0.14 }));
    // fog: a 256×64 field of soft noise, scrolled by the wind
    const fw = 256, fh = 64, f = new Float32Array(fw * fh);
    const v = (x, y) => hash(((x % 16) + 16) % 16, ((y % 4) + 4) % 4, seed + 77);
    for (let y = 0; y < fh; y++) for (let x = 0; x < fw; x++) {
      let a = 0, w = 0.6, s = 1 / 16;
      for (let o = 0; o < 3; o++) {
        const X = x * s * (1 << o), Y = y * s * (1 << o), i = Math.floor(X), j = Math.floor(Y), u = X - i, q = Y - j;
        const uu = u * u * (3 - 2 * u), qq = q * q * (3 - 2 * q);
        a += w * ((v(i, j) * (1 - uu) + v(i + 1, j) * uu) * (1 - qq) + (v(i, j + 1) * (1 - uu) + v(i + 1, j + 1) * uu) * qq);
        w *= 0.5;
      }
      f[y * fw + x] = a / 1.05;
    }
    this.fogTex = f; this.fw = fw; this.fh = fh;
  }

  /**
   * opts: t (scene s), wx (weather.js forecast), lt (the weathered light: hor, amb, flash),
   * flash (weather.js lightning(): its strike), water(x, y) → is this pixel lake?, horizon (row),
   * fogTop/fogBottom (rows the fog lies between), sky(x, y) → is this pixel open sky? (the bolt
   * strikes behind the land).
   */
  draw(px, o) {
    const { W, H } = this, wx = o.wx, t = o.t;
    const lum = 0.3 * o.lt.amb[0] + 0.55 * o.lt.amb[1] + 0.15 * o.lt.amb[2];
    const blend = (x, y, c, a) => {
      if (x < 0 || x >= W || y < 0 || y >= H || a <= 0) return;
      const k = (y * W + x) * 4;
      px[k] += (c[0] * 255 - px[k]) * a; px[k + 1] += (c[1] * 255 - px[k + 1]) * a; px[k + 2] += (c[2] * 255 - px[k + 2]) * a;
    };
    const add = (x, y, c, a) => {
      if (x < 0 || x >= W || y < 0 || y >= H || a <= 0) return;
      const k = (y * W + x) * 4;
      px[k] += c[0] * 255 * a; px[k + 1] += c[1] * 255 * a; px[k + 2] += c[2] * 255 * a;
    };

    // ---- fog: lies on the water and in the valley, thick at the waterline, drifting with the wind
    if (wx.fog > 0.04 && o.fogTop != null) {
      const fogCol = [o.lt.hor[0] * 0.85 + 0.08, o.lt.hor[1] * 0.85 + 0.09, o.lt.hor[2] * 0.85 + 0.1];
      const mid = o.fogLine ?? (o.fogTop + o.fogBottom) / 2, spread = (o.fogBottom - o.fogTop) / 2;
      const drift = t * (6 + 10 * Math.abs(wx.wind)) * Math.sign(wx.wind || 1);
      for (let y = Math.max(0, Math.floor(o.fogTop)); y < Math.min(H, o.fogBottom); y++) {
        const band = Math.exp(-(((y - mid) / spread) ** 2) * 1.6) * wx.fog;
        if (band < 0.01) continue;
        const row = ((Math.floor(y * 0.5 + t * 0.6) % this.fh) + this.fh) % this.fh;
        for (let x = 0; x < W; x++) {
          const n = this.fogTex[row * this.fw + ((Math.floor(x * 0.7 + drift) % this.fw) + this.fw) % this.fw];
          blend(x, y, fogCol, clamp(band * (0.35 + 0.95 * n)) * 0.92);
        }
      }
      // and a general veil: distant things go first
      if (o.veil) for (let i = 0; i < W * H; i++) {
        const a = o.veil(i) * wx.fog * 0.55;
        if (a > 0.01) { const k = i * 4; px[k] += (fogCol[0] * 255 - px[k]) * a; px[k + 1] += (fogCol[1] * 255 - px[k + 1]) * a; px[k + 2] += (fogCol[2] * 255 - px[k + 2]) * a; }
      }
    }

    // ---- rings on the water where the rain lands: each starts small, spreads and fades, then begins
    // again somewhere else
    if (wx.rain > 0.04 && o.water) {
      const K = Math.round(70 * wx.rain), c = [0.8, 0.84, 0.9].map((v) => v * (0.35 + lum));
      for (let j = 0; j < K; j++) {
        const P = 0.7 + hash(j, this.seed, 30) * 0.7, s = t / P + hash(j, this.seed, 31), cyc = Math.floor(s), ph = s - cyc;
        let x = -1, y = -1;
        for (let tries = 0; tries < 6; tries++) {
          const cx = Math.floor(hash(j * 7 + tries, cyc, this.seed + 32) * W), cy = Math.floor((o.horizon ?? 0) + hash(j * 7 + tries, cyc, this.seed + 33) * (H - (o.horizon ?? 0)));
          if (o.water(cx, cy)) { x = cx; y = cy; break; }
        }
        if (x < 0) continue;
        const persp = 0.4 + 1.6 * (y - (o.horizon ?? 0)) / Math.max(1, H - (o.horizon ?? 0)), r = (1 + ph * 6) * persp, ry = r * 0.32, a = (1 - ph) * 0.45;
        const n = Math.max(8, Math.round(r * 6));
        for (let q = 0; q < n; q++) {
          const ang = (q / n) * 6.283, X = Math.round(x + Math.cos(ang) * r), Y = Math.round(y + Math.sin(ang) * ry);
          if (o.water(X, Y)) add(X, Y, c, a * 0.5);
        }
      }
    }

    // ---- rain: slanted streaks, brighter at the head, dim in the dark, lit by a flash
    if (wx.rain > 0.02) {
      const n = Math.round(this.rain.length * clamp(wx.rain)), slant = 0.12 + wx.wind * 0.45;
      const fl = o.lt.flash || 0, c = [0.78, 0.8, 0.86].map((v) => v * (0.3 + lum * 1.1 + fl));
      for (let i = 0; i < n; i++) {
        const d = this.rain[i], span = H + 40, yy = ((d.y + d.v * t) % span + span) % span - 20;
        const xx = (((d.x + slant * yy) % W) + W) % W;
        for (let s = 0; s < d.len; s++) {
          const y = Math.round(yy - s), x = Math.round(xx - slant * s);
          blend(x, y, c, 0.32 * d.b * (1 - s / d.len) * (0.55 + 0.45 * wx.rain));
        }
      }
    }

    // ---- snow: flakes falling slowly and wandering, carried by the wind
    if (wx.snow > 0.02) {
      const n = Math.round(this.snow.length * clamp(wx.snow)), c = [0.95, 0.96, 1].map((v) => v * Math.min(1, 0.35 + lum * 1.3));
      for (let i = 0; i < n; i++) {
        const d = this.snow[i];
        const y = Math.round((((d.y + d.v * t) % H) + H) % H);
        const x = Math.round((((d.x + wx.wind * 18 * t + Math.sin(t * d.f + d.p) * 4) % W) + W) % W);
        blend(x, y, c, 0.85);
        if (d.big) { blend(x + 1, y, c, 0.6); blend(x, y + 1, c, 0.6); blend(x + 1, y + 1, c, 0.4); }
      }
    }

    // ---- lightning: a jagged bolt (with a branch or two) while the flash lasts
    const st = o.flash && o.flash.strike;
    if (st) {
      const age = t - st.t0;
      if (age >= 0 && age < 0.32) {
        const near = 1 - st.dist, top = o.boltTop ?? 0, bottom = (o.boltBottom ?? H * 0.6) + near * 20;
        const a = (age < 0.06 ? 1 : age > 0.16 && age < 0.24 ? 0.85 : 0.35) * (0.5 + 0.5 * near);
        const core = [0.95, 0.95, 1], glow = [0.6, 0.65, 1];
        const bolt = (x0, y0, y1, k, depth) => {
          let x = x0;
          for (let y = y0, s = 0; y < y1; y += 3, s++) {
            const nx = x + (hash(k, s, st.seed + 41) - 0.5) * 7;
            for (let q = 0; q < 3; q++) {
              const X = Math.round(x + (nx - x) * q / 3), Y = Math.round(y + q);
              if (o.sky && !o.sky(X, Y)) continue;                // behind the land, not across it
              blend(X, Y, core, a); add(X - 1, Y, glow, a * 0.35); add(X + 1, Y, glow, a * 0.35);
            }
            x = nx;
            if (depth < 1 && hash(k, s, st.seed + 42) < 0.05) bolt(x, y, Math.min(y1, y + (y1 - y0) * 0.35), k * 13 + s, depth + 1);
          }
        };
        bolt(st.x * W, top, bottom, 1, 0);
      }
    }
  }
}

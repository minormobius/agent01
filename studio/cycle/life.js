// life.js — what lives in the painting: boats and gulls on the coast, a skein of geese and a hawk
// over the lake. Drawn in RGB over the finished frame (as the stars and the rain are), because they
// MOVE through the picture and an index map holds still; lit by the same light as the palette, and
// each a pure function of the scene clock `t`, so a still at t is the same every time.
//
//   const life = new Life(scene);
//   life.draw(px, { t, lt });       // after the palette, before the weather

const hash = (a, b, c) => {
  let h = (a * 374761393 + b * 668265263 + c * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};
const clamp = (v, a = 0, b = 1) => (v < a ? a : v > b ? b : v);
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const mix = (a, b, k) => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
const wrap = (v, lo, hi) => lo + ((((v - lo) % (hi - lo)) + (hi - lo)) % (hi - lo));

// a gull's wings, as points from the body out: gliding, the downstroke, the upstroke
const GULL = {
  glide: [[-5, 1], [-4, 0], [-3, -1], [-2, -1], [-1, 0], [0, 0], [1, 0], [2, -1], [3, -1], [4, 0], [5, 1]],
  down: [[-5, 3], [-4, 2], [-3, 1], [-2, 0], [-1, 0], [0, 0], [1, 0], [2, 0], [3, 1], [4, 2], [5, 3]],
  up: [[-4, -4], [-3, -3], [-2, -2], [-1, -1], [0, 0], [1, -1], [2, -2], [3, -3], [4, -4]],
};

export class Life {
  constructor(scene) {
    this.scene = scene;
    const S = scene.seed * 31 + 7, { W, yH } = scene;
    this.boats = []; this.gulls = []; this.ship = null;
    if (scene.kind === 'coast') {
      const c = scene.coast;
      let minShore = Infinity; for (const v of c.shoreAt) minShore = Math.min(minShore, v);
      this.seaBottom = minShore - 10;
      const n = 2 + Math.floor(hash(1, S, 1) * 3);
      for (let i = 0; i < n; i++) this.boats.push({
        z: 0.08 + 0.8 * hash(i, S, 2), x0: hash(i, S, 3) * W, dir: hash(i, S, 4) < 0.5 ? -1 : 1, v: 0.35 + 0.6 * hash(i, S, 5),
        hull: hash(i, S, 6) < 0.5 ? [0.82, 0.8, 0.76] : [0.16, 0.2, 0.26], sail: hash(i, S, 7) < 0.85 ? [0.93, 0.91, 0.86] : [0.75, 0.3, 0.2], ph: hash(i, S, 8) * 6.28,
      });
      this.boats.sort((a, b) => a.z - b.z);
      if (hash(2, S, 9) < 0.7) this.ship = { x0: hash(3, S, 9) * W, dir: hash(4, S, 9) < 0.5 ? -1 : 1, len: 14 + Math.floor(hash(5, S, 9) * 10) };
      const g = 4 + Math.floor(hash(6, S, 10) * 4);
      for (let i = 0; i < g; i++) this.gulls.push({
        cx: hash(i, S, 11) * W, cy: yH * (0.3 + 0.75 * hash(i, S, 12)), rx: 25 + 80 * hash(i, S, 13), w: (hash(i, S, 14) < 0.5 ? -1 : 1) * (0.12 + 0.25 * hash(i, S, 15)),
        ph: hash(i, S, 16) * 6.28, size: 0.7 + 0.8 * hash(i, S, 17), drift: 20 + 60 * hash(i, S, 18),
      });
    } else {
      this.skein = { every: 75 + 50 * hash(1, S, 20), n: 7 + 2 * Math.floor(hash(2, S, 21) * 4), dir: hash(3, S, 22) < 0.5 ? -1 : 1, y: yH * (0.18 + 0.3 * hash(4, S, 23)) };
      this.hawk = { cx: W * (0.2 + 0.6 * hash(5, S, 24)), cy: yH * (0.25 + 0.2 * hash(6, S, 25)), r: 30 + 20 * hash(7, S, 26) };
    }
  }

  draw(px, { t, lt }) {
    const sc = this.scene, { W, H, yH, layer, LAYER } = sc;
    const day = smooth(-0.08, 0.05, lt.el), wx = lt.wx || { fog: 0, rain: 0, storm: 0 };
    const lit = (alb, nx = 0) => {
      const sun = Math.max(0, nx * lt.L[0] + 0.8 * lt.L[1]), moon = Math.max(0, nx * lt.M[0] + 0.8 * lt.M[1]);
      return [0, 1, 2].map((k) => alb[k] * (lt.amb[k] + lt.sunCol[k] * sun + lt.moonCol[k] * moon));
    };
    const put = (x, y, c, a, ok) => {
      x = Math.round(x); y = Math.round(y);
      if (x < 0 || x >= W || y < 0 || y >= H || a <= 0) return;
      if (ok && !ok(layer[y * W + x])) return;
      const k = (y * W + x) * 4;
      px[k] += (Math.min(1, c[0]) * 255 - px[k]) * a; px[k + 1] += (Math.min(1, c[1]) * 255 - px[k + 1]) * a; px[k + 2] += (Math.min(1, c[2]) * 255 - px[k + 2]) * a;
    };
    const line = (x0, y0, x1, y1, c, a, ok) => {
      const n = Math.max(1, Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0))));
      for (let i = 0; i <= n; i++) put(x0 + (x1 - x0) * i / n, y0 + (y1 - y0) * i / n, c, a, ok);
    };
    if (sc.kind === 'coast') this.#coast(t, lt, day, wx, lit, put, line);
    else this.#lake(t, lt, day, wx, put, line);
  }

  #coast(t, lt, day, wx, lit, put, line) {
    const sc = this.scene, { W, yH, LAYER } = sc, c = sc.coast;
    const open = (l) => l === LAYER.sky || l === LAYER.cloud || l === LAYER.lake || l === LAYER.far;
    const night = lt.night, fogC = mix(lt.hor, [0.7, 0.72, 0.75], 0.3);
    // ---- a ship on the horizon, hull down in the haze
    if (this.ship) {
      const s = this.ship, x = wrap(s.x0 + s.dir * 0.12 * t, -40, W + 40), y = yH - 1;
      const col = mix(lit([0.12, 0.13, 0.15], 0), lt.hor, 0.55 + 0.4 * wx.fog);
      for (let i = 0; i < s.len; i++) {
        const u = s.dir > 0 ? i : s.len - 1 - i, h = u < 2 ? 1 : u > s.len - 6 ? 4 : 2;      // bow low, the bridge aft
        for (let r = 0; r < h; r++) put(x - s.len / 2 + i, y - r, col, 0.9, open);
      }
      put(x + s.dir * (s.len / 2 - 4), y - 5, col, 0.9, open);                              // the funnel
      if (night > 0.3) { for (let i = 2; i < s.len - 2; i += 3) put(x - s.len / 2 + i, y - 1, [1, 0.85, 0.5], night * 0.8, open); put(x + s.dir * (s.len / 2 - 3), y - 6, [1, 1, 0.9], night, open); }
    }
    // ---- sailboats: farther ones smaller, slower on the screen, greyer in the haze
    for (const b of this.boats) {
      const yw0 = yH + 2 + b.z * Math.max(4, this.seaBottom - yH - 4);
      const s = clamp((yw0 - yH) / 14, 0.3, 2.6);
      const x = wrap(b.x0 + b.dir * b.v * s * t, -30, W + 30), yw = yw0 + Math.sin(t * 1.1 + b.ph) * 0.35 * s;
      // in front of the headland only if it sits nearer than the headland's foot
      const ok = yw > c.baseY + 2 ? (l) => l !== LAYER.sand && l !== LAYER.ground : open;
      const haze = clamp(0.55 - b.z * 0.6) + wx.fog * (1 - b.z) * 0.8;
      const tone = (col) => mix(col, fogC, clamp(haze));
      const L = 10 * s, hh = Math.max(1, Math.round(1.6 * s)), mast = 13 * s, aft = -b.dir;
      const hull = tone(lit(b.hull, 0)), sail = tone(lit(b.sail, b.dir * 0.4)), jib = tone(lit(b.sail, -b.dir * 0.3));
      for (let r = 0; r < hh; r++) {                                   // the hull, narrower at the keel
        const half = L / 2 * (1 - 0.3 * r / hh);
        for (let dx = -half; dx <= half; dx++) put(x + dx, yw - hh + r + 1, hull, 1, ok);
      }
      const mx = x - b.dir * L * 0.1, top = yw - hh - mast, boom = yw - hh - 1;
      if (s > 0.55) line(mx, top, mx, boom, tone(lit([0.2, 0.18, 0.16])), 0.9, ok);
      for (let y = Math.ceil(top + 1); y <= boom; y++) {                 // the mainsail: aft of the mast
        const w = (y - top) / (boom - top) * L * 0.5;
        for (let d = 0; d < w; d++) put(mx + aft * (d + 1), y, sail, 0.95, ok);
      }
      for (let y = Math.ceil(top + mast * 0.25); y <= boom; y++) {      // the jib: forward, to the bow
        const w = (y - top - mast * 0.25) / (boom - top - mast * 0.25) * L * 0.42;
        for (let d = 0; d < w; d++) put(mx - aft * (d + 1), y, jib, 0.9, ok);
      }
      // the wake, and at night a light at the masthead
      for (let k = 1; k < 6 * s; k++) if (hash(Math.floor(t * 6) + k, b.ph * 100 | 0, 3) < 0.6) put(x + aft * (L / 2 + k), yw + 0.5, tone(lit([0.9, 0.92, 0.95], 0)), 0.5 * (1 - k / (6 * s)), ok);
      if (night > 0.2) { put(mx, top - 1, [1, 0.95, 0.8], night, ok); put(x + b.dir * L / 2, yw - hh, b.dir > 0 ? [0.3, 1, 0.4] : [1, 0.3, 0.25], night * 0.8, ok); }
    }
    // ---- gulls: wheeling, gliding mostly, beating their wings now and then; home by night
    const many = day * (1 - 0.7 * wx.storm) * (1 - 0.6 * wx.rain);
    this.gulls.forEach((g, i) => {
      if (i >= Math.round(this.gulls.length * many)) return;
      const a = g.w * t + g.ph, cx = g.cx + Math.sin(t * 0.021 + g.ph) * g.drift;
      const x = wrap(cx + Math.cos(a) * g.rx, -20, W + 20), y = g.cy + Math.sin(a) * g.rx * 0.3 + Math.sin(t * 0.4 + g.ph) * 4;
      const s = g.size * (1 + 0.25 * Math.sin(a));
      const flap = Math.sin(t * 0.45 + g.ph * 3) > 0.45, beat = Math.sin(t * 11 + g.ph);
      const shape = !flap ? GULL.glide : beat > 0.3 ? GULL.up : beat < -0.3 ? GULL.down : GULL.glide;
      const white = lit([0.95, 0.95, 0.95], 0.2), grey = lit([0.55, 0.57, 0.6], 0), tip = [0.05, 0.05, 0.06];
      const k = s * 0.8;
      for (let j = 0; j + 1 < shape.length; j++) {
        const [ax, ay] = shape[j], [bx, by] = shape[j + 1], end = j === 0 || j === shape.length - 2;
        line(x + ax * k, y + ay * k, x + bx * k, y + by * k, end ? tip : Math.abs(ax) > 2 ? grey : white, 0.95);
      }
    });
  }

  #lake(t, lt, day, wx, put, line) {
    const sc = this.scene, { W, yH, LAYER } = sc;
    const sky = (l) => l === LAYER.sky || l === LAYER.cloud;
    const dark = mix([0.06, 0.06, 0.07], lt.hor, 0.25);
    // ---- a skein of geese at dawn and dusk, now and then, in a V, crossing the whole sky
    const k = this.skein, dusk = smooth(-0.12, -0.02, lt.el) * smooth(0.28, 0.1, lt.el);
    if (dusk > 0.05) {
      const cyc = Math.floor(t / k.every), f = (t - cyc * k.every) / 42;
      if (f < 1 && hash(cyc, sc.seed, 30) < 0.75) {
        const dir = hash(cyc, sc.seed, 31) < 0.5 ? k.dir : -k.dir, lx = dir > 0 ? -40 + (W + 80) * f : W + 40 - (W + 80) * f;
        const ly = k.y + Math.sin(f * 3) * 6 + (hash(cyc, sc.seed, 32) - 0.5) * 30;
        for (let i = 0; i < k.n; i++) {
          const rank = Math.ceil(i / 2), side = i % 2 ? 1 : -1;
          const bx = lx - dir * rank * 7, by = ly + side * rank * 4 + Math.sin(t * 0.7 + i) * 0.6;
          const beat = Math.sin(t * 9 - rank * 0.8);
          const wy = beat > 0 ? -2 : 1;
          line(bx - 3, by + wy, bx, by, dark, 0.85 * dusk, sky); line(bx, by, bx + 3, by + wy, dark, 0.85 * dusk, sky);
          put(bx + dir, by, dark, 0.85 * dusk, sky);
        }
      }
    }
    // ---- a hawk circling high over the valley by day, wings held flat, turning slowly
    if (day > 0.2 && wx.rain < 0.3) {
      const h = this.hawk, a = t * 0.09, x = h.cx + Math.cos(a) * h.r, y = h.cy + Math.sin(a) * h.r * 0.35;
      const tilt = Math.cos(a) * 0.6;
      line(x - 4, y + tilt, x + 4, y - tilt, dark, 0.8 * day, sky); put(x, y + 1, dark, 0.8 * day, sky);
    }
  }
}

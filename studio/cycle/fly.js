// fly.js — flying through the world (world.js), drawn the way Comanche drew in 1992: Voxel Space.
//
// For each screen column a ray walks out over the heightmap, front to back; every step that rises
// above what is already drawn fills the column up to it with that cell's PALETTE INDEX. So the
// frame is an index buffer, as in the painting, and the palette does the light (each index is a
// material facing a known way, lit for the sun's real position) and the motion (the lake, the
// river and the falls are phases, and the palette turns). Three things are computed per pixel
// that a palette cannot hold: the distance haze, the sky (gradient, sun, clouds on a layer at
// 1800 m, the real stars and the moon in its phase), and the lake's reflection, which is a second
// Voxel Space pass from a camera mirrored below the water.
import { buildWorld, cameraAt, KIND, N, CELL, SIZE, heightAt } from './world.js';
import { buildCoastWorld } from './coastworld.js';
import { sky, enu } from './astro.js';
import { STARS, N as NSTARS, LINES } from './stars.js';
import { starColour } from './astro.js';
import { forecast, weatherLight, lightning } from './weather.js';
import { Precip } from './precip.js';
import { auroraAt } from './aurora.js';
import { W, H, turnCycles, key, ZENITH, HORIZON, AMBIENT, SUNCOL, turn, smooth, clamp, mix3, add3, mul3, scale3, fbm2, weather } from './scene.js';

const wx0 = (lt) => lt.wx || { overcast: 0, fog: 0, rain: 0, snow: 0, storm: 0 };
const FOV = 75 * Math.PI / 180, F = (W / 2) / Math.tan(FOV / 2);
const FAR = 7000, LOOP_DAYS = 5;
const rh = (a, b, c) => { let h = (a * 374761393 + b * 668265263 + c * 2147483647) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
const D = Math.PI / 180;
const STARCOL = Array.from({ length: NSTARS }, (_, i) => starColour(STARS[i * 4 + 3]));

export class Flight {
  constructor(img, g, view) {
    this.img = img; this.g = g; this.view = view;
    this.idx = new Uint8Array(W * H); this.dep = new Float32Array(W * H); this.knd = new Uint8Array(W * H);
    this.ridx = new Uint8Array(W * H); this.rdep = new Float32Array(W * H);
    this.cloud = null;
  }
  load(seed, bpm, kind = 'lake') {
    this.world = kind === 'coast' ? buildCoastWorld(seed) : buildWorld(seed);
    if (bpm) this.world.bpm = bpm;
    if (!this.cloud) {             // the cloud layer: 512² density, 25 m a texel, wrapping
      const c = new Float32Array(512 * 512);
      // tileable (the layer wraps, and a seam would show as a straight line across the sky): the
      // noise blended with its own copies shifted by one tile, weighted by distance to each edge
      const f = (i, j) => fbm2(i / 64, j / 64, 4242, 5);
      for (let j = 0; j < 512; j++) for (let i = 0; i < 512; i++) {
        const u = i / 512, v = j / 512;
        const n = f(i, j) * (1 - u) * (1 - v) + f(i - 512, j) * u * (1 - v) + f(i, j - 512) * (1 - u) * v + f(i - 512, j - 512) * u * v;
        // the blend flattens the middle of the tile: restore its spread about the mean
        const k = 1 / Math.sqrt((1 - u) ** 2 * (1 - v) ** 2 + u ** 2 * (1 - v) ** 2 + (1 - u) ** 2 * v ** 2 + u ** 2 * v ** 2);
        c[j * 512 + i] = 0.5 + (n - 0.5) * k;
      }
      this.cloud = c;
    }
  }
  cycles() { return this.world.cycles; }
  /** Where on the loop the camera is, as the music's texture. */
  place() { return this.cam ? this.cam.place : null; }

  /** Render one frame at clock `t` (s) and moment `ms`; returns { sk, lt } for the page. */
  frame(t, ms, { figures = false, notes = [] } = {}) {
    const w = this.world, v = this.view, sk = sky(ms, v.lat, v.lon);
    this.t = t;
    const cam = cameraAt(w, ms / (LOOP_DAYS * 86400000));
    this.cam = cam;
    const lt = this.light(sk, ms);
    const lut = this.palette(lt, t);
    // at night the camera tips its gaze up: the dark land sinks toward the bottom of the frame and
    // the sky takes the rest (eased by how dark it is; the shear keeps it within Voxel Space's reach)
    const look = clamp(cam.pitch + 0.34 * lt.night, -0.3, 0.33);
    const hor = H / 2 + look * F;
    const fwd = [Math.sin(cam.yaw), Math.cos(cam.yaw)], right = [Math.cos(cam.yaw), -Math.sin(cam.yaw)];
    this.voxel(cam, cam.z, hor, this.idx, this.dep, this.knd, FAR);
    // the mirror pass, only for the columns where the lake shows
    this.cols = this.cols || new Uint8Array(W);
    let any = 0;
    for (let x = 0; x < W; x++) { let l = 0; for (let y = H - 1; y >= 0; y -= 2) if (this.knd[y * W + x] === KIND.lake || this.knd[y * W + x] === KIND.foam) { l = 1; break; } this.cols[x] = l; any |= l; }
    const wantMirror = cam.z > 0 && any;
    if (wantMirror) this.voxel(cam, -cam.z, hor, this.ridx, this.rdep, null, 4000, this.cols);
    this.trees(cam, cam.z, hor, fwd, right, this.idx, this.dep, 1500);
    if (wantMirror) this.trees(cam, -cam.z, hor, fwd, right, this.ridx, this.rdep, 900);
    this.cabin(cam, cam.z, hor, fwd, right, this.idx, this.dep);
    if (w.lighthouse) this.tower(cam, cam.z, hor, fwd, right, this.idx, this.dep);
    this.au = auroraAt(w.seed, ms, v.lat, v.lon, sk.sun.alt, v.aurora ? 7 : null);
    this.AU = this.au ? this.aurora(this.au, hor, fwd, right, t, lt) : null;
    this.compose(cam, hor, fwd, right, lut, lt, sk, t, ms);
    this.night(cam, hor, fwd, right, lt, sk, t, figures);
    if (w.lighthouse) this.beam(cam, hor, fwd, right, lt, t);
    // the weather over the frame: rain (and its rings on the lake), snow, the bolt; fog is in the haze
    if (!this.precip) this.precip = new Precip(W, H, w.seed);
    const knd = this.knd;
    this.precip.draw(this.img.data, {
      t, wx: lt.wx, lt, flash: this.fl, horizon: hor, rings: lt.wx.rain > 0.04 ? this.rings(cam, hor, fwd, right, t, lt.wx.rain) : null, boltTop: 0, boltBottom: Math.max(20, hor - 10),
      water: (x, y) => x >= 0 && x < W && y >= 0 && y < H && knd[y * W + x] === KIND.lake,
      sky: (x, y) => x >= 0 && x < W && y >= 0 && y < H && !(this.dep[y * W + x] < Infinity),
    });
    this.g.putImageData(this.img, 0, 0);
    return { sk, lt, fl: this.fl, au: this.au, auPeak: this.au ? this.auPeak : 0 };
  }

  /**
   * Rain rings on the lake, fixed in the world: each 5 m cell of the lake may hold a ring that starts
   * small, spreads and fades, then begins again elsewhere in its cell. The cells are found from the
   * lake pixels on screen (each one traced back to the water), so only what can be seen is visited.
   */
  rings(cam, hor, fwd, right, t, rain) {
    const G = 5, out = [], cz = cam.z, seen = new Set(), knd = this.knd;
    if (cz <= 0) return out;
    for (let y = Math.max(0, Math.ceil(hor + 1)); y < H; y++) for (let x = y & 1; x < W; x += 2) {
      if (knd[y * W + x] !== KIND.lake) continue;
      // the ray through this pixel meets the water (height 0) at forward depth zc
      const zc = cz * F / (y + 0.5 - hor), xs = (x + 0.5 - W / 2) / F;
      const X = cam.x + fwd[0] * zc + right[0] * xs * zc, Y = cam.y + fwd[1] * zc + right[1] * xs * zc;
      const i = Math.floor(X / G), j = Math.floor(Y / G), key = i * 131071 + j;
      if (seen.has(key)) continue;
      seen.add(key);
      if (rh(i, j, 1) > 0.12 * rain) continue;
      const P = 0.7 + rh(i, j, 2) * 0.7, s = t / P + rh(i, j, 3), cyc = Math.floor(s), ph = s - cyc;
      const RX = (i + rh(i, j, cyc * 2 + 4)) * G - cam.x, RY = (j + rh(i, j, cyc * 2 + 5)) * G - cam.y;
      const z = RX * fwd[0] + RY * fwd[1];
      if (z < 2) continue;
      const sx = W / 2 + (RX * right[0] + RY * right[1]) / z * F, sy = hor + cz / z * F;
      const r = (0.25 + ph * 1.1) / z * F;
      if (r < 1 || sy >= H || sx < -r || sx > W + r) continue;
      out.push({ x: sx, y: sy, r, ry: r * Math.max(0.12, Math.min(1, cz / z)), a: (1 - ph) * 0.45 });
    }
    return out;
  }

  light(sk, ms) {
    const el = Math.sin(sk.sun.alt * D), mel = Math.sin(sk.moon.alt * D);
    const L = enu(sk.sun.alt, sk.sun.az), M = enu(sk.moon.alt, sk.moon.az);
    const sunI = smooth(-0.06, 0.1, el), moonI = smooth(-0.05, 0.15, mel) * 0.55 * (0.15 + 0.85 * sk.moonLit) * smooth(0.1, -0.1, el);
    const tn = this.world.skyTurn;
    let zen = turn(key(ZENITH, el), tn), hor = turn(key(HORIZON, el), tn);
    zen = add3(zen, [0.02, 0.03, 0.06], moonI); hor = add3(hor, [0.03, 0.04, 0.08], moonI);
    const amb = add3(add3(key(AMBIENT, el), [0.04, 0.05, 0.09], moonI), [0.035, 0.04, 0.07], smooth(0, -0.3, el));   // starlight, for the eye
    const wx = forecast(this.world.seed, ms, this.view.lat, this.view.lon, this.view.wx || null);
    const fl = lightning(this.world.seed, this.t ?? 0, wx.storm);
    this.fl = fl;
    return weatherLight({ el, mel, L, M, sunI, moonI, zen, hor, amb, sunCol: scale3(key(SUNCOL, el), sunI), moonCol: scale3([0.55, 0.65, 0.95], moonI), night: smooth(0.05, -0.2, el), cover: 0 }, wx, fl.flash);
  }

  /** The palette: each entry lit for this moment, the cycles turned; packed 0..1 floats ×3. */
  palette(lt, t) {
    const w = this.world, dotp = (n, l) => Math.max(0, n[0] * l[0] + n[1] * l[1] + n[2] * l[2]);
    const lit = w.entries.map((e) => {
      switch (e.k) {
        case 'land3': {
          // lying snow whitens what faces up (and pine tops a little), not steep rock
          const up = e.n[2], lie = lt.wx ? lt.wx.lying * clamp((up - 0.45) * 2.2) * (e.name === 'pine' ? 0.55 : e.name === 'rock' ? 0.6 : 1) : 0;
          const alb = lie > 0 ? mix3(e.alb, [0.9, 0.92, 0.97], lie) : e.alb;
          return mul3(alb, add3(add3(lt.amb, lt.sunCol, dotp(e.n, lt.L) * 1.05), lt.moonCol, dotp(e.n, lt.M)));
        }
        // the lake's entries hold only its ripple highlights: the water itself is reflection (compose)
        case 'lake3': return scale3(add3(add3(lt.sunCol, lt.moonCol), lt.zen, 0.5), 0.07 * e.hl);
        case 'river3': return mul3(mix3(scale3(w.water, 2.4), [0.8, 0.88, 0.95], e.s * 0.7), add3(add3(lt.amb, lt.sunCol, 0.55), lt.moonCol, 0.5));
        case 'fall3': case 'foam3': return mul3(mix3(scale3(w.water, 2.2), [0.88, 0.93, 0.98], e.k === 'foam3' ? 0.5 + 0.5 * e.s : e.s), add3(add3(scale3(lt.amb, 1.1), lt.sunCol, 0.6), lt.moonCol, 0.5));
        // the coast (coastworld.js): surf over the shallows, the wash on the sand, the lighthouse's lamp
        case 'surf3': case 'wash3': {
          const foam = mul3([0.9, 0.93, 0.96], add3(add3(scale3(lt.amb, 1.15), lt.sunCol, 0.75), lt.moonCol, 0.7));
          let under;
          if (e.k === 'surf3') under = mix3(mix3(lt.hor, lt.zen, 0.3), mul3(w.shallow, add3(lt.amb, lt.sunCol, 0.3)), 0.5);
          else { const dry = mul3(w.sand, add3(add3(lt.amb, lt.sunCol, Math.max(0, lt.L[2]) * 1.05), lt.moonCol, Math.max(0, lt.M[2]))); under = mix3(dry, add3(scale3(dry, 0.5), mix3(lt.hor, lt.zen, 0.3), 0.3), e.wet); }
          return e.s >= 0 ? mix3(under, foam, e.s) : scale3(under, 1 + e.s);
        }
        case 'lamp3': {
          const L = w.lighthouse, a = 2 * Math.PI * t / L.period, cam = this.cam;
          const toward = Math.cos(a - Math.atan2(cam.x - L.x, cam.y - L.y));
          return add3([0.2, 0.2, 0.2], [1, 0.92, 0.7], smooth(0.03, -0.14, lt.el) * (0.7 + 2 * Math.pow(Math.max(0, toward), 6)) + 0.1);
        }
        case 'window': {
          const fl = 0.85 + 0.15 * Math.sin(t * 7.3) * Math.sin(t * 2.9);
          return add3([0.12, 0.09, 0.07], [1.0, 0.68, 0.28], smooth(0.15, -0.05, lt.el) * fl * 1.1);
        }
        default: return [0, 0, 0];
      }
    });
    const rot = turnCycles(lit, w.cycles, t, w.bpm);
    const out = new Float32Array(768);
    for (let i = 0; i < 256; i++) { out[i * 3] = rot[i][0]; out[i * 3 + 1] = rot[i][1]; out[i * 3 + 2] = rot[i][2]; }
    return out;
  }

  /**
   * One Voxel Space pass from height `cz` (negative: the mirror pass, for the lake's reflection).
   * `cols` (optional) limits it to the columns that need it. Close to the camera the cell is chosen
   * through an ordered dither, so neighbouring cells blend like 8-bit brushwork instead of blocks.
   */
  voxel(cam, cz, hor, idx, dep, knd, far, cols) {
    const w = this.world, Hm = w.height, IX = w.index, KD = w.kind, fall = w.slots.fall, strata = w.slots.strata;
    idx.fill(0); dep.fill(Infinity); if (knd) knd.fill(255);
    const S2 = 2 * SIZE, LIM = SIZE - CELL - 1, TOP = w.maxH;
    const BY = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);
    for (let x = 0; x < W; x++) {
      if (cols && !cols[x]) continue;
      const xs = (x + 0.5 - W / 2) / F, ang = cam.yaw + Math.atan(xs), cosc = 1 / Math.sqrt(1 + xs * xs);
      const dx = Math.sin(ang), dy = Math.cos(ang);
      let ybot = H, z = 1.5, dz = 0.5, step = 0;
      while (z < far && ybot > 0) {
        let px = cam.x + dx * z, py = cam.y + dy * z;
        if (px < 0 || px > LIM) { px = ((px % S2) + S2) % S2; if (px > LIM) px = S2 - CELL - 2 - px; if (px < 0) px = 0; }
        if (py < 0 || py > LIM) { py = ((py % S2) + S2) % S2; if (py > LIM) py = S2 - CELL - 2 - py; if (py < 0) py = 0; }
        const fx = px / CELL, fy = py / CELL, i = fx | 0, j = fy | 0, u = fx - i, v = fy - j, k = j * N + i;
        const zp = z * cosc;
        // nothing further out can show: even the highest peak would land below what is drawn
        if (hor + (cz - TOP) / zp * F >= ybot) break;
        let h = z < 900 ? (Hm[k] * (1 - u) + Hm[k + 1] * u) * (1 - v) + (Hm[k + N] * (1 - u) + Hm[k + N + 1] * u) * v : Hm[k];
        let kc = k;
        if (z < 500) { const t = BY[((step & 3) << 2) | (x & 3)]; kc = k + (u > t ? 1 : 0) + (v > t ? N : 0); if (KD[kc] !== KD[k]) kc = k; }   // blend within a kind: sand drawn up a cliff face streaks it
        const kd = KD[kc];
        if (kd === KIND.lake || kd === KIND.foam) {
          if (cz < 0) { z += dz; dz = 0.5 + z * 0.014; step++; continue; }   // the mirror sees through the water
          h = 0;                     // water is level: a water cell chosen by the dither beside a cliff stays at the surface
        }
        const sy = hor + (cz - h) / zp * F;
        if (sy < ybot) {
          const top = sy < 0 ? 0 : Math.ceil(sy);
          if (kd === KIND.fall) {
            // the fall's phase is its height: worked out per row, so turning the palette pours it
            const lag = (i * 7 + j * 3) & 7;
            for (let r = top; r < ybot; r++) {
              const zr = cz - (r - hor) * zp / F, o = r * W + x;
              idx[o] = fall + (((Math.floor(zr / 1.3) + lag) % 16) + 16) % 16; dep[o] = z; if (knd) knd[o] = kd;
            }
          } else if (kd === KIND.cliff) {
            // strata: bands of the two rocks by height, offset a little per cell so they wander
            const id = IX[kc], off = ((i * 13 + j * 7) & 7) * 0.6;
            for (let r = top; r < ybot; r++) {
              const zr = cz - (r - hor) * zp / F, o = r * W + x, band = Math.sin(zr * 0.5 + off) + 0.6 * Math.sin(zr * 1.6 + off * 3) > 1.0;
              idx[o] = band ? id + strata : id; dep[o] = z; if (knd) knd[o] = kd;
            }
          } else {
            const id = IX[kc];
            for (let r = top, o = top * W + x; r < ybot; r++, o += W) { idx[o] = id; dep[o] = z; if (knd) knd[o] = kd; }
          }
          ybot = top;
        }
        z += dz; dz = 0.5 + z * 0.014; step++;
      }
    }
  }

  /** Pines as billboards: cones of tiers, each needle-mass indexed by the compass way it faces. */
  trees(cam, cz, hor, fwd, right, idx, dep, far) {
    const T = this.world.trees, pine = this.world.slots.pine, trunk = this.world.slots.trunk;
    for (let n = 0; n < T.length; n += 4) {
      const rx = T[n] - cam.x, ry = T[n + 1] - cam.y;
      const zc = rx * fwd[0] + ry * fwd[1];
      if (zc < 4 || zc > far) continue;
      const xc = rx * right[0] + ry * right[1], sx = W / 2 + xc / zc * F;
      const ht = T[n + 3], base = hor + (cz - T[n + 2]) / zc * F, top = hor + (cz - T[n + 2] - ht) / zc * F;
      const half0 = ht * 0.27 / zc * F;
      if (sx + half0 < 0 || sx - half0 >= W) continue;
      const y0 = Math.min(base, top), y1 = Math.max(base, top), span = y1 - y0;
      if (y1 < 0 || y0 >= H) continue;
      const flip = top > base;                                   // the mirror pass: tip downward
      for (let r = Math.max(0, Math.floor(y0)); r < Math.min(H, Math.ceil(y1)); r++) {
        const f = flip ? (y1 - r) / span : (r - y0) / span;      // 0 at the tip, 1 at the base
        if (f > 0.92) {                                           // trunk
          const c = Math.round(sx);
          if (c >= 0 && c < W && dep[r * W + c] > zc) { idx[r * W + c] = trunk; dep[r * W + c] = zc; }
          continue;
        }
        const tier = (f * 5.5) % 1, half = half0 * (0.1 + 0.9 * f) * (0.55 + 0.45 * tier);
        for (let c = Math.max(0, Math.floor(sx - half)); c <= Math.min(W - 1, sx + half); c++) {
          if (dep[r * W + c] <= zc) continue;
          const uu = (c - sx) / Math.max(0.5, half);
          const az = cam.yaw + Math.PI - Math.asin(clamp(uu, -1, 1));
          const b = ((Math.round(az / (Math.PI / 4)) % 8) + 8) % 8;
          idx[r * W + c] = pine + b; dep[r * W + c] = zc;
        }
      }
    }
  }

  /** The cabin: two walls and the roof the camera can see, flat-filled, with its window. */
  cabin(cam, cz, hor, fwd, right, idx, dep) {
    const c = this.world.cabin, s = Math.sin(c.facing), co = Math.cos(c.facing);
    const pt = (a, b, z) => {                 // cabin-local (a across, b along its facing) → screen
      const x = c.x + co * a + s * b, y = c.y - s * a + co * b, rx = x - cam.x, ry = y - cam.y;
      const zc = rx * fwd[0] + ry * fwd[1];
      return zc < 2 ? null : [W / 2 + (rx * right[0] + ry * right[1]) / zc * F, hor + (cz - z) / zc * F, zc];
    };
    const hw = c.w / 2, hd = c.d / 2, z0 = c.z, z1 = c.z + c.h, z2 = c.z + c.h + 3;
    const faces = [
      { q: [[-hw, hd, z0], [hw, hd, z0], [hw, hd, z1], [-hw, hd, z1]], n: [s, co], id: c.wall + 0, win: true },
      { q: [[hw, -hd, z0], [hw, hd, z0], [hw, hd, z1], [hw, -hd, z1]], n: [co, -s], id: c.wall + 1 },
      { q: [[-hw, -hd, z0], [hw, -hd, z0], [hw, -hd, z1], [-hw, -hd, z1]], n: [-s, -co], id: c.wall + 2 },
      { q: [[-hw, -hd, z0], [-hw, hd, z0], [-hw, hd, z1], [-hw, -hd, z1]], n: [-co, s], id: c.wall + 3 },
      { q: [[-hw - 1, -hd - 1, z1], [-hw - 1, hd + 1, z1], [0, hd + 1, z2], [0, -hd - 1, z2]], n: null, id: c.roof + 0 },
      { q: [[hw + 1, -hd - 1, z1], [hw + 1, hd + 1, z1], [0, hd + 1, z2], [0, -hd - 1, z2]], n: null, id: c.roof + 1 },
    ];
    for (const f of faces) {
      const p = f.q.map(([a, b, z]) => pt(a, b, z));
      if (p.some((q) => !q)) continue;
      const zc = p.reduce((a, q) => a + q[2], 0) / 4;
      if (zc > 1200) continue;
      fillQuad(p, (x, y, u, v) => {
        const i = y * W + x;
        if (dep[i] <= zc) return;
        idx[i] = f.win && u > 0.2 && u < 0.38 && v > 0.35 && v < 0.7 ? c.window : f.id; dep[i] = zc;
      });
    }
  }

  /** The lighthouse: a tapering banded tower lit by which way each strip of it faces, the lantern on top. */
  tower(cam, cz, hor, fwd, right, idx, dep) {
    const L = this.world.lighthouse, rx = L.x - cam.x, ry = L.y - cam.y, zc = rx * fwd[0] + ry * fwd[1];
    if (zc < 3 || zc > 4000) return;
    const sx = W / 2 + (rx * right[0] + ry * right[1]) / zc * F, view = Math.atan2(cam.x - L.x, cam.y - L.y);
    const rowAt = (z) => hor + (cz - z) / zc * F, z0 = L.z - 1, z1 = L.z + L.h, zl = z1 + 3.2, zc2 = zl + 1.6;
    for (let y = Math.max(0, Math.floor(rowAt(zc2))); y <= Math.min(H - 1, Math.ceil(rowAt(z0))); y++) {
      const z = cz - (y - hor) * zc / F, f = (z - z0) / (z1 - z0);
      let r = L.r * (1 - 0.3 * clamp(f)), id = -1;
      if (z > zl) r = L.r * 0.7 * (1 - (z - zl) / (zc2 - zl));                   // the cap
      else if (z > z1 + 0.5) r = L.r * 0.62;                                       // the lantern
      else if (z > z1) r = L.r * 0.95;                                             // the gallery
      const half = r / zc * F;
      for (let x = Math.max(0, Math.ceil(sx - half)); x <= Math.min(W - 1, Math.floor(sx + half)); x++) {
        const i = y * W + x;
        if (dep[i] <= zc) continue;
        if (z > zl || (z > z1 && z <= z1 + 0.5)) id = L.iron;
        else if (z > z1) id = L.lamp;
        else {
          const az = view + Math.asin(clamp((x - sx) / Math.max(0.5, half), -1, 1)), b = ((Math.round(az / (Math.PI / 4)) % 8) + 8) % 8;
          id = (Math.floor(f * 6) % 2 ? L.band : L.white) + b;
        }
        idx[i] = id; dep[i] = zc;
      }
    }
  }

  /**
   * The beam at night: a cone from the lamp, turning once a period, fading over the sea; gathered as
   * a maximum per pixel (so the segments do not double up where they meet), then added. The lamp
   * glows, and flashes as the beam swings past the camera.
   */
  beam(cam, hor, fwd, right, lt, t) {
    const L = this.world.lighthouse, dark = smooth(0.03, -0.14, lt.el);
    if (dark < 0.02) return;
    const wx = wx0(lt), haze = 0.5 + 0.9 * (wx.fog + 0.4 * wx.rain), a = 2 * Math.PI * t / L.period;
    const px = this.img.data, dep = this.dep, zl = L.z + L.h + 1.6;
    const B = this.bbuf || (this.bbuf = new Float32Array(W * H));
    B.fill(0);
    const proj = (x, y, z) => { const rx = x - cam.x, ry = y - cam.y, zc = rx * fwd[0] + ry * fwd[1]; return zc < 2 ? null : [W / 2 + (rx * right[0] + ry * right[1]) / zc * F, hor + (cam.z - z) / zc * F, zc]; };
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity, prev = null;
    for (let k = 0; k <= 160; k++) {
      const d = 4 + (k / 160) ** 1.6 * 2600, p = proj(L.x + Math.sin(a) * d, L.y + Math.cos(a) * d, zl + d * 0.004);
      if (p && prev) {
        const n = Math.ceil(Math.hypot(p[0] - prev[0], p[1] - prev[1]));
        if (n < 2 * W) for (let s = 0; s < n; s++) {
          const x = prev[0] + (p[0] - prev[0]) * s / n, y = prev[1] + (p[1] - prev[1]) * s / n, zc = prev[2] + (p[2] - prev[2]) * s / n;
          const wpx = Math.max(0.8, (1.2 + d * 0.035) / zc * F), inten = dark * haze * 0.5 * Math.pow(1 - k / 160, 1.3);
          const X = Math.round(x);
          if (X < 0 || X >= W) continue;
          for (let Y = Math.max(0, Math.floor(y - wpx)); Y <= Math.min(H - 1, Math.ceil(y + wpx)); Y++) {
            const i = Y * W + X;
            if (dep[i] < zc) continue;
            const v = inten * (1 - Math.abs(Y - y) / (wpx + 1));
            if (v > B[i]) { B[i] = v; if (X < x0) x0 = X; if (X > x1) x1 = X; if (Y < y0) y0 = Y; if (Y > y1) y1 = Y; }
          }
        }
      }
      prev = p;
    }
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const v = B[y * W + x]; if (v <= 0) continue;
      const k = (y * W + x) * 4; px[k] = Math.min(255, px[k] + 255 * v); px[k + 1] = Math.min(255, px[k + 1] + 235 * v); px[k + 2] = Math.min(255, px[k + 2] + 180 * v);
    }
    // the lamp: a glow, and the flash as it turns toward us
    const q = proj(L.x, L.y, zl);
    if (q && q[1] >= 0 && q[1] < H && q[0] >= 0 && q[0] < W && dep[Math.round(q[1]) * W + Math.round(q[0])] >= q[2] - 6) {
      const toward = Math.cos(a - Math.atan2(cam.x - L.x, cam.y - L.y)), fl = dark * (0.5 + 2.5 * Math.pow(Math.max(0, toward), 8)), R = 2 + 6 * Math.pow(Math.max(0, toward), 8);
      for (let y = Math.floor(q[1] - R); y <= q[1] + R; y++) for (let x = Math.floor(q[0] - R); x <= q[0] + R; x++) {
        if (x < 0 || x >= W || y < 0 || y >= H) continue;
        const v = fl * Math.max(0, 1 - Math.hypot(x - q[0], y - q[1]) / (R + 0.5)) ** 2, k = (y * W + x) * 4;
        px[k] = Math.min(255, px[k] + 255 * v); px[k + 1] = Math.min(255, px[k + 1] + 235 * v); px[k + 2] = Math.min(255, px[k + 2] + 190 * v);
      }
    }
  }

  /**
   * The aurora (aurora.js) toward every sky pixel and every lake pixel's mirrored sky, traced every
   * 2×2 pixels; light (0..~1) per pixel, added in compose behind the clouds and in the reflection.
   */
  aurora(au, hor, fwd, right, t, lt) {
    const A = this.aub || (this.aub = new Float32Array(W * H * 3)), dep = this.dep, knd = this.knd, o = [0, 0, 0];
    const veil = 1 - 0.95 * wx0(lt).overcast;
    A.fill(0);
    let peak = 0;
    for (let y = 0; y < H; y += 4) for (let x = 0; x < W; x += 2) {        // 2 × 4 blocks: the rays are vertical
      let need = false;
      for (let q = 0; q < 8 && !need; q++) { const i = (y + (q >> 1)) * W + x + (q & 1); if (y + (q >> 1) < H && (dep[i] === Infinity || knd[i] === KIND.lake)) need = true; }
      if (!need) continue;
      const xs = (x + 1 - W / 2) / F, ys = (hor - y - 2) / F, dx = fwd[0] + right[0] * xs, dy = fwd[1] + right[1] * xs;
      o[0] = o[1] = o[2] = 0;
      au.sample(Math.atan(Math.abs(ys) / Math.sqrt(1 + xs * xs)), Math.atan2(dx, dy), t, o);
      const v = [0, 1, 2].map((c) => 0.95 * (1 - Math.exp(-o[c] * veil * 1.3)));
      if (ys > 0 && v[0] + v[1] > peak) peak = v[0] + v[1];
      for (let q = 0; q < 8; q++) { const yy = y + (q >> 1); if (yy >= H) continue; const k = (yy * W + x + (q & 1)) * 3; A[k] = v[0]; A[k + 1] = v[1]; A[k + 2] = v[2]; }
    }
    this.auPeak = peak;
    return A;
  }

  /** Index → colour, then the per-pixel things: water's reflection, the haze, the sky. */
  compose(cam, hor, fwd, right, lut, lt, sk, t, ms) {
    const AU = this.AU;
    const px = this.img.data, idx = this.idx, dep = this.dep, knd = this.knd, ridx = this.ridx, rdep = this.rdep;
    const L = lt.L, w = this.world;
    const wx = lt.wx || { fog: 0, rain: 0, overcast: 0 };
    // fog closes the view; rain greys the distance; overcast lowers and fills the cloud deck
    const fogK = 1 / Math.max(260, 3600 - 1400 * lt.cover - 3100 * wx.fog - 1100 * wx.rain);
    const clouds = this.cloud, drift = ms / 86400000 * 900;
    const thr = 0.66 - 0.2 * lt.cover - 0.28 * wx.overcast, cAlpha = Math.min(1, 0.35 + 0.65 * lt.cover + 0.3 * wx.overcast);
    const cloudCol = add3(add3(scale3(lt.amb, 0.95), lt.sunCol, 0.85), lt.moonCol, 0.6);
    const cloudDark = add3(scale3(lt.amb, 0.75), lt.sunCol, 0.25);
    this.cloudA = this.cloudA || new Float32Array(W * H);
    const CA = this.cloudA;
    // tables for this frame: gamma, haze by distance, haze colour per column, gradient per row
    const GAM = this.gam || (this.gam = Uint8ClampedArray.from({ length: 1025 }, (_, i) => Math.pow(i / 1024, 0.87) * 255));
    const FOG = this.fog || (this.fog = new Float32Array(FAR + 2));
    for (let d = 0; d <= FAR + 1; d++) FOG[d] = 1 - Math.exp(-d * fogK);
    const glowAt = (cs, e, out) => {
      if (cs <= 0.6) return;
      const glow = Math.pow(cs, 10) * 0.45 + Math.pow(cs, 120) * 0.6, hz = 1 - Math.min(1, e * 3);
      out[0] += lt.sunCol[0] * glow * (0.5 + hz); out[1] += lt.sunCol[1] * glow * (0.4 + hz * 0.8); out[2] += lt.sunCol[2] * glow * 0.4;
    };
    const grad = (e, out) => { const g = Math.pow(Math.max(0, e), 0.55); out[0] = lt.hor[0] + (lt.zen[0] - lt.hor[0]) * g; out[1] = lt.hor[1] + (lt.zen[1] - lt.hor[1]) * g; out[2] = lt.hor[2] + (lt.zen[2] - lt.hor[2]) * g; };
    const HZ = this.hz || (this.hz = new Float32Array(W * 3));
    const DX = this.dxs || (this.dxs = new Float32Array(W)), DY = this.dys || (this.dys = new Float32Array(W)), XS = this.xss || (this.xss = new Float32Array(W));
    const o3 = [0, 0, 0];
    for (let x = 0; x < W; x++) {
      const xs = (x + 0.5 - W / 2) / F; XS[x] = xs;
      DX[x] = fwd[0] + right[0] * xs; DY[x] = fwd[1] + right[1] * xs;
      const l = Math.hypot(DX[x], DY[x]);
      grad(0.02, o3); glowAt((DX[x] * L[0] + DY[x] * L[1]) / l * 0.9998 + 0.02 * L[2], 0.02, o3);
      HZ[x * 3] = o3[0]; HZ[x * 3 + 1] = o3[1]; HZ[x * 3 + 2] = o3[2];
    }
    // the sky toward (dx, dy, dz) unnormalised with length `l`: gradient, glow, sun, cloud layer
    // the gradient per row (its small change across a row is not visible), for the sky and its mirror
    const GR = this.gr || (this.gr = new Float32Array(H * 3)), GM = this.gm || (this.gm = new Float32Array(H * 3));
    for (let y = 0; y < H; y++) {
      const ys = (hor - y) / F, e = ys / Math.sqrt(1 + ys * ys);
      grad(e, o3); GR[y * 3] = o3[0]; GR[y * 3 + 1] = o3[1]; GR[y * 3 + 2] = o3[2];
      grad(-e, o3); GM[y * 3] = o3[0]; GM[y * 3 + 1] = o3[1]; GM[y * 3 + 2] = o3[2];
    }
    let rowG = GR, rowY = 0;
    const skyRGB = (dx, dy, dz, l, out, k) => {
      const e = dz / l;
      out[0] = rowG[rowY]; out[1] = rowG[rowY + 1]; out[2] = rowG[rowY + 2];
      const cs = (dx * L[0] + dy * L[1] + dz * L[2]) / l;
      glowAt(cs, e, out);
      if (cs > 0.99985 && lt.sunI > 0) { out[0] = 1; out[1] = 0.96; out[2] = 0.85; }
      let a = 0;
      if (e > 0.012) {
        const tt = (1800 - cam.z) / e;
        if (tt > 0 && tt < 30000) {
          const qx = (cam.x + dx / l * tt) / 25 + drift, qy = (cam.y + dy / l * tt) / 25 + drift * 0.3;
          const i = ((qx | 0) % 512 + 512) % 512, j = ((qy | 0) % 512 + 512) % 512;
          const d = clouds[j * 512 + i];
          if (d > thr) {
            a = smooth(thr, thr + 0.14, d) * cAlpha * smooth(30000, 9000, tt);
            const lit = smooth(thr, thr + 0.3, d), sh = clamp(1 - (clouds[((j + 3) % 512) * 512 + i] - d) * 6), m = lit * sh;
            out[0] += (cloudDark[0] + (cloudCol[0] - cloudDark[0]) * m - out[0]) * a;
            out[1] += (cloudDark[1] + (cloudCol[1] - cloudDark[1]) * m - out[1]) * a;
            out[2] += (cloudDark[2] + (cloudCol[2] - cloudDark[2]) * m - out[2]) * a;
          }
        }
      }
      if (k >= 0) CA[k] = a;
    };
    const s3 = [0, 0, 0], m3 = [0, 0, 0], body = w.water;
    const br = body[0] * (lt.amb[0] + lt.sunCol[0] * 0.3), bg = body[1] * (lt.amb[1] + lt.sunCol[1] * 0.3), bb = body[2] * (lt.amb[2] + lt.sunCol[2] * 0.3);
    for (let y = 0; y < H; y++) {
      const ys = (hor - y) / F, ys2 = 1 + ys * ys;
      for (let x = 0; x < W; x++) {
        const i = y * W + x, dx = DX[x], dy = DY[x];
        let r, g, b, l = 0;
        const d = dep[i];
        if (d === Infinity) {
          l = Math.sqrt(ys2 + XS[x] * XS[x]);
          rowG = GR; rowY = y * 3;
          skyRGB(dx, dy, ys, l, s3, i); r = s3[0]; g = s3[1]; b = s3[2];
          if (AU) { const q = i * 3, k = 1 - CA[i] * 0.9; r += AU[q] * k; g += AU[q + 1] * k; b += AU[q + 2] * k; }
        } else {
          const p = idx[i] * 3;
          r = lut[p]; g = lut[p + 1]; b = lut[p + 2];
          const kd = knd[i];
          if (kd === KIND.lake) {
            l = Math.sqrt(ys2 + XS[x] * XS[x]);
            // the reflection: the mirror pass at the mirrored row, wobbled by the ripples
            const wob = Math.round(Math.sin(y * 0.9 + t * 1.7 + x * 0.05) * (1 + Math.min(3, (y - hor) * 0.02)));
            const my = Math.round(2 * hor - y) + wob, j = (my >= 0 && my < H) ? my * W + x : -1;
            let rr, rg, rb;
            if (j < 0 || rdep[j] === Infinity) { rowG = GM; rowY = y * 3; skyRGB(dx, dy, -ys, l, m3, -1); rr = m3[0]; rg = m3[1]; rb = m3[2]; if (AU) { rr += AU[i * 3] * 0.8; rg += AU[i * 3 + 1] * 0.8; rb += AU[i * 3 + 2] * 0.8; } }
            else {
              const q = ridx[j] * 3, f = FOG[Math.min(FAR, rdep[j] | 0)];
              rr = lut[q] + (HZ[x * 3] - lut[q]) * f; rg = lut[q + 1] + (HZ[x * 3 + 1] - lut[q + 1]) * f; rb = lut[q + 2] + (HZ[x * 3 + 2] - lut[q + 2]) * f;
            }
            const steep = ys < 0 ? Math.min(1, -ys / l) : 0, fres = 0.35 + 0.6 * Math.pow(1 - steep, 4);
            r = br + (rr * 0.88 - br) * fres + r; g = bg + (rg * 0.88 - bg) * fres + g; b = bb + (rb * 0.9 - bb) * fres + b;
          }
          // haze: toward the sky's colour at the horizon in this column
          const f = FOG[d > FAR ? FAR : d | 0];
          r += (HZ[x * 3] - r) * f; g += (HZ[x * 3 + 1] - g) * f; b += (HZ[x * 3 + 2] - b) * f;
        }
        const k = i * 4;
        px[k] = GAM[(r < 0 ? 0 : r > 1 ? 1 : r) * 1024 | 0]; px[k + 1] = GAM[(g < 0 ? 0 : g > 1 ? 1 : g) * 1024 | 0]; px[k + 2] = GAM[(b < 0 ? 0 : b > 1 ? 1 : b) * 1024 | 0]; px[k + 3] = 255;
      }
    }
  }

  /** The real stars, constellation figures and the moon, in true perspective; in the lake too. */
  night(cam, hor, fwd, right, lt, sk, t, figures) {
    const px = this.img.data, dep = this.dep, knd = this.knd, rdep = this.rdep, CA = this.cloudA;
    const proj = (alt, az) => {
      const v = enu(alt, az), zc = v[0] * fwd[0] + v[1] * fwd[1];
      if (zc <= 0.05) return null;
      return [W / 2 + (v[0] * right[0] + v[1] * right[1]) / zc * F, hor - v[2] / zc * F];
    };
    const put = (x, y, c, a) => {
      x = Math.round(x); y = Math.round(y);
      if (x < 0 || x >= W || y < 0 || y >= H) return;
      const i = y * W + x;
      let k = 0;
      if (dep[i] === Infinity) k = 1 - CA[i];
      else if (knd[i] === KIND.lake) {                           // its reflection, where the mirror sees sky
        const my = Math.round(2 * hor - y);
        if (my >= 0 && my < H && rdep[my * W + x] === Infinity) k = 0.45;
      }
      if (k <= 0.02) return;
      const q = i * 4;
      px[q] = Math.min(255, px[q] + c[0] * 255 * a * k); px[q + 1] = Math.min(255, px[q + 1] + c[1] * 255 * a * k); px[q + 2] = Math.min(255, px[q + 2] + c[2] * 255 * a * k);
    };
    const veil = 1 - 0.95 * (wx0(lt).overcast);
    if (lt.night * veil > 0.01) {
      if (figures) for (const poly of LINES) {
        let prev = null;
        for (let j = 0; j < poly.length; j += 2) {
          const p = sk.place(poly[j], poly[j + 1]), q = p.alt > 0 ? proj(p.alt, p.az) : null;
          if (q && prev) { const n = Math.ceil(Math.hypot(q[0] - prev[0], q[1] - prev[1])); if (n < W) for (let s = 0; s <= n; s++) { const x = prev[0] + (q[0] - prev[0]) * s / (n || 1), y = prev[1] + (q[1] - prev[1]) * s / (n || 1); if (y < hor) put(x, y, [0.55, 0.7, 1], 0.22 * lt.night * veil); } }
          prev = q;
        }
      }
      for (let i = 0; i < NSTARS; i++) {
        const mag = STARS[i * 4 + 2], p = sk.place(STARS[i * 4], STARS[i * 4 + 1]);
        if (p.alt < 0.5) continue;
        const q = proj(p.alt, p.az);
        if (!q || q[0] < -2 || q[0] > W + 2 || q[1] < -2 || q[1] > H) continue;
        const ext = Math.min(1, (p.alt - 0.5) / 12);
        let a = Math.pow(Math.max(0, (6.5 - mag) / 5), 1.4) * lt.night * veil * (0.3 + 0.7 * ext) * 2.2;
        a *= 1 + (0.18 + 0.3 * (1 - ext)) * Math.sin(t * (3 + (i % 50) / 10) + i);
        put(q[0], q[1], STARCOL[i], a);
        put(q[0], 2 * hor - q[1], STARCOL[i], a);
        if (mag < 2.6) for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) put(q[0] + dx, q[1] + dy, STARCOL[i], a * (mag < 1 ? 0.5 : 0.28));
      }
    }
    // the moon, in its phase, lit from the sun's side
    const mq = sk.moon.alt > -1 && veil > 0.15 ? proj(sk.moon.alt, sk.moon.az) : null;
    if (mq) {
      const vm = enu(sk.moon.alt, sk.moon.az), vs = enu(sk.sun.alt, sk.sun.az);
      const dot = vm[0] * vs[0] + vm[1] * vs[1] + vm[2] * vs[2], E = Math.acos(clamp(dot, -1, 1));
      const tv = vs.map((c, k) => c - dot * vm[k]), tl = Math.hypot(...tv) || 1;
      const w2 = vm.map((c, k) => c + 0.02 * tv[k] / tl), wl = Math.hypot(...w2);
      const q2 = proj(Math.asin(w2[2] / wl) / D, Math.atan2(w2[0], w2[1]) / D) || mq;
      let dx = q2[0] - mq[0], dy = q2[1] - mq[1]; const dl = Math.hypot(dx, dy) || 1; dx /= dl; dy /= dl;
      const s = [dx * Math.sin(E), dy * Math.sin(E), -Math.cos(E)], R = 0.9 * D * F + 2;
      for (let y = Math.floor(mq[1] - R); y <= mq[1] + R; y++) for (let x = Math.floor(mq[0] - R); x <= mq[0] + R; x++) {
        const u = (x - mq[0]) / R, v = (y - mq[1]) / R, q = u * u + v * v;
        if (q >= 1) continue;
        const z = Math.sqrt(1 - q), lit = u * s[0] + v * s[1] + z * s[2];
        const mare = 0.86 + 0.14 * Math.sin(u * 5.1 + 1.3) * Math.sin(v * 4.3 - 0.4);
        const day = 1 - lt.night;
        if (lit > 0) { put(x, y, [0.96 * mare, 0.94 * mare, 0.86 * mare], 0.95 * (1 - 0.5 * day) * veil); put(x, 2 * hor - y, [0.9, 0.9, 0.85], 0.5 * veil); }
      }
    }
  }
}

/** Fill a convex quad (screen points [x, y, …]), calling back with (x, y, u, v) in the quad's own 0..1. */
function fillQuad(p, cb) {
  const ys = p.map((q) => q[1]), y0 = Math.max(0, Math.ceil(Math.min(...ys))), y1 = Math.min(H - 1, Math.floor(Math.max(...ys)));
  if (y1 - y0 > H || y0 > y1) return;
  for (let y = y0; y <= y1; y++) {
    let xa = Infinity, xb = -Infinity;
    for (let e = 0; e < 4; e++) {
      const a = p[e], b = p[(e + 1) % 4];
      if ((a[1] <= y && b[1] > y) || (b[1] <= y && a[1] > y)) { const x = a[0] + (y - a[1]) / (b[1] - a[1]) * (b[0] - a[0]); xa = Math.min(xa, x); xb = Math.max(xb, x); }
    }
    for (let x = Math.max(0, Math.ceil(xa)); x <= Math.min(W - 1, Math.floor(xb)); x++) {
      // u, v: rough quad coordinates from the bilinear corners (enough for a window)
      const u = (x - Math.min(p[0][0], p[3][0])) / Math.max(1, Math.max(p[1][0], p[2][0]) - Math.min(p[0][0], p[3][0]));
      const v = (y - Math.min(p[2][1], p[3][1])) / Math.max(1, Math.max(p[0][1], p[1][1]) - Math.min(p[2][1], p[3][1]));
      cb(x, y, u, v);
    }
  }
}

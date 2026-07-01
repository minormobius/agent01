// tjs/beelix/beelix.js — the "beelix" kernel, v3: a helix the BOIDS solve for, the LIGHT steers.
// No DOM, no three.js. Sister to ../swarm/swarm3d.js (reuses its curl-noise + PRNG).
//
// ── The honest design ───────────────────────────────────────────────────────────────────────
// v1 cheated — it drove each bee with analytic servos (hold r→R, hold tangential speed→ω·R, hold
// descent), which ARE the parametric equation of a helix, so the shape was authored. This version
// throws that out. Bees run REAL REYNOLDS BOIDS (separation / alignment / cohesion) as
// SELF-PROPELLED active-matter particles (they hold a cruise speed — the ingredient that lets a
// rotating "mill" sustain; ordinary drag kills circulation and you just get a column). The ONLY
// things this file authors are the LIGHT PIPE's controls:
//    • photo    — phototaxis: a gentle inward pull toward the glowing pipe axis (confinement; sets
//                 NO radius — radius emerges from cruise² / photo balance).
//    • flow     — the pipe/death-plane pull bees downward (the descent).
//    • pipeSpin — a FAINT swirl in the LIGHT (the pulses spiral). This is the only rotational input.
//    • pulses   — bright bands travelling hive→death that glow + nudge the bees they pass.
//
// Why pipeSpin exists, stated plainly: with pipeSpin = 0 the rotation that makes a helix is left
// entirely to boids alignment breaking symmetry around the axis — and empirically that is
// UNRELIABLE in a flow-through column (it locks a handedness only ~half the time; otherwise it's a
// wandering column or fights into competing CW/CCW domains). A *small* swirl in the light breaks
// the tie, and boids ALIGNMENT amplifies it into one coherent, repeatable helix — while radius,
// pitch, thickness and the rope structure stay emergent. Crank pipeSpin and the light does more of
// the work; drop it to 0 to watch raw (flaky) emergence. angularMomentum() measures what actually
// happened. "Control the light pipe, solve the boids into a helix" — this is that, honestly.

import { _internal } from '../swarm/swarm3d.js';
const { rngFor, curl3 } = _internal;
const TAU = Math.PI * 2;

export const DEFAULT_PARAMS = {
  emitRate: 160,        // bees/sec from the hive
  // ── boids (the emergent engine) ──
  alignment: 14.0,      // ★ match neighbour heading — turns a seeded swirl into a coherent mill
  cohesion: 2.5,        // steer to neighbour centroid — binds the sheet into a rope
  separation: 6.0,      // short-range push — tube thickness, stops collapse onto the axis
  neighborRadius: 3.2,
  sepRadius: 1.0,
  cruise: 7.0,          // self-propelled cruise speed (active matter — sustains the rotation)
  wander: 0.5,          // curl-noise — life + the noise rotation can break symmetry from
  noiseFreq: 0.22,
  // ── light-pipe controls (authored) ──
  photo: 2.2,           // inward phototaxis toward the pipe axis (confinement; no radius set)
  flow: 0.9,            // downward pull toward the death plane (descent)
  pipeSpin: 1.0,        // ★ swirl in the LIGHT — the only rotational input (sign = handedness);
                        //   0 = raw (unreliable) emergence, ±1 reliably locks a clean helix
  pulseKick: 6.0,       // extra downward shove + glow a travelling pulse gives bees it passes
  pulseInterval: 1.1,
  pulseSpeed: 7.0,
  pulseBand: 1.8,
  // ── limits ──
  maxSpeed: 12.0,       // safety ceiling above cruise
  killRadius: 12,       // a bee flung this far off the pipe is recycled
};

export function clampParams(p = {}) {
  const o = { ...DEFAULT_PARAMS };
  const num = (k, lo, hi) => { if (p[k] != null && p[k] !== '' && isFinite(+p[k])) o[k] = Math.max(lo, Math.min(hi, +p[k])); };
  num('emitRate', 0, 1200); num('alignment', 0, 30); num('cohesion', 0, 30); num('separation', 0, 30);
  num('neighborRadius', 0.5, 8); num('sepRadius', 0.2, 6); num('cruise', 1, 20); num('wander', 0, 20); num('noiseFreq', 0.02, 1);
  num('photo', 0, 30); num('flow', 0, 20); num('pipeSpin', -6, 6); num('pulseKick', 0, 30);
  num('pulseInterval', 0.2, 6); num('pulseSpeed', 1, 30); num('pulseBand', 0.3, 6);
  num('maxSpeed', 2, 40); num('killRadius', 3, 30);
  return o;
}

const RELAX = 0.3; // how hard speed relaxes toward cruise each substep (active-matter self-propulsion)

export class Beelix {
  constructor(opts = {}) {
    this.maxBees = Math.max(64, Math.min(20000, opts.maxBees | 0 || 3000));
    this.params = clampParams(opts.params || {});
    this.seed = opts.seed || 'beelix:0';
    this.hiveY = opts.hiveY != null ? opts.hiveY : 12;
    this.deathY = opts.deathY != null ? opts.deathY : -12;
    this.t = 0; this.acc = 0; this.H = 1 / 60;

    const n = this.maxBees;
    this.px = new Float32Array(n); this.py = new Float32Array(n); this.pz = new Float32Array(n);
    this.vx = new Float32Array(n); this.vy = new Float32Array(n); this.vz = new Float32Array(n);
    this.phase = new Float32Array(n); this.bright = new Float32Array(n);
    this.alive = new Uint8Array(n);
    this.free = []; for (let i = n - 1; i >= 0; i--) this.free.push(i);
    this.aliveCount = 0;

    this.rnd = rngFor(this.seed + '::emit');
    this.emitAcc = 0; this.pulseAcc = 0; this.pulses = [];
    this._grid = new Map();
  }

  setParams(p) { this.params = clampParams({ ...this.params, ...p }); }

  reset() {
    this.alive.fill(0); this.bright.fill(0); this.aliveCount = 0;
    this.free.length = 0; for (let i = this.maxBees - 1; i >= 0; i--) this.free.push(i);
    this.pulses.length = 0; this.emitAcc = 0; this.pulseAcc = 0; this.t = 0; this.acc = 0;
    this.rnd = rngFor(this.seed + '::emit');
  }

  _spawn() {
    if (!this.free.length) return;
    const i = this.free.pop(), P = this.params, rnd = this.rnd;
    const ang = rnd() * TAU, r = 1.0 + rnd() * 2.5;        // a loose ring at the hive mouth (NOT a target radius)
    this.px[i] = Math.cos(ang) * r; this.pz[i] = Math.sin(ang) * r; this.py[i] = this.hiveY - rnd() * 0.8;
    // random heading at cruise speed — deliberately NO preferred handedness; the light/flock decide
    const va = rnd() * TAU, vb = Math.acos(rnd() * 2 - 1), s = P.cruise * (0.5 + 0.4 * rnd());
    this.vx[i] = s * Math.sin(vb) * Math.cos(va); this.vy[i] = s * Math.cos(vb) - P.flow; this.vz[i] = s * Math.sin(vb) * Math.sin(va);
    this.phase[i] = rnd() * TAU; this.bright[i] = 0; this.alive[i] = 1; this.aliveCount++;
  }
  _kill(i) { if (!this.alive[i]) return; this.alive[i] = 0; this.bright[i] = 0; this.free.push(i); this.aliveCount--; }

  step(dt) {
    this.acc += Math.min(dt, 0.1);
    let guard = 0;
    while (this.acc >= this.H && guard++ < 8) { this._sub(this.H); this.acc -= this.H; this.t += this.H; }
  }

  _rebuildGrid() {
    const g = this._grid; g.clear();
    const cs = Math.max(0.4, this.params.neighborRadius); this._cs = cs;
    for (let i = 0; i < this.maxBees; i++) {
      if (!this.alive[i]) continue;
      const key = (Math.floor(this.px[i] / cs)) + ',' + (Math.floor(this.py[i] / cs)) + ',' + (Math.floor(this.pz[i] / cs));
      let b = g.get(key); if (!b) { b = []; g.set(key, b); } b.push(i);
    }
  }

  _sub(h) {
    const P = this.params;
    this.emitAcc += P.emitRate * h;
    while (this.emitAcc >= 1) { this.emitAcc -= 1; this._spawn(); }

    this.pulseAcc += h;
    while (this.pulseAcc >= P.pulseInterval) { this.pulseAcc -= P.pulseInterval; this.pulses.push({ y: this.hiveY }); }
    for (const p of this.pulses) p.y -= P.pulseSpeed * h;
    while (this.pulses.length && this.pulses[0].y < this.deathY) this.pulses.shift();

    this._rebuildGrid();
    const g = this._grid, cs = this._cs, sr2 = P.sepRadius * P.sepRadius, nr2 = P.neighborRadius * P.neighborRadius;
    const noiseT = Math.floor(this.t * 2), cn = { x: 0, y: 0, z: 0 }, pulses = this.pulses, band = P.pulseBand;

    for (let i = 0; i < this.maxBees; i++) {
      if (!this.alive[i]) continue;
      const x = this.px[i], y = this.py[i], z = this.pz[i];
      let ax = 0, ay = 0, az = 0;

      // ── light pipe: phototaxis (inward) + faint swirl (the only rotational input) + flow (down) ──
      const r = Math.hypot(x, z) || 1e-3;
      ax += -x * P.photo; az += -z * P.photo;                 // confine to the pipe (no radius authored)
      ax += (-z / r) * P.pipeSpin; az += (x / r) * P.pipeSpin; // the LIGHT swirls; bees feel a whisper of it
      ay += -P.flow;                                           // descent toward the death plane

      // ── pulse coupling: glow + a downward shove for bees a pulse is passing ──
      let bright = 0;
      for (let pi = 0; pi < pulses.length; pi++) { const dy = (y - pulses[pi].y) / band, e = Math.exp(-dy * dy); if (e > bright) bright = e; }
      this.bright[i] = bright;
      if (bright > 0.05) ay -= P.pulseKick * bright;

      // ── REYNOLDS BOIDS over the 27-cell neighbourhood ──
      let sepx = 0, sepy = 0, sepz = 0, cx = 0, cy = 0, cz = 0, avx = 0, avy = 0, avz = 0, nN = 0;
      const gcx = Math.floor(x / cs), gcy = Math.floor(y / cs), gcz = Math.floor(z / cs);
      for (let oz = -1; oz <= 1; oz++) for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
        const b = g.get((gcx + ox) + ',' + (gcy + oy) + ',' + (gcz + oz)); if (!b) continue;
        for (let k = 0; k < b.length; k++) {
          const j = b[k]; if (j === i) continue;
          const jx = this.px[j] - x, jy = this.py[j] - y, jz = this.pz[j] - z, dd = jx * jx + jy * jy + jz * jz;
          if (dd > nr2 || dd < 1e-9) continue;
          if (dd < sr2) { const inv = 1 / (Math.sqrt(dd) + 1e-3); sepx -= jx * inv; sepy -= jy * inv; sepz -= jz * inv; }
          cx += this.px[j]; cy += this.py[j]; cz += this.pz[j];
          avx += this.vx[j]; avy += this.vy[j]; avz += this.vz[j]; nN++;
        }
      }
      if (nN > 0) {
        cx = cx / nN - x; cy = cy / nN - y; cz = cz / nN - z;
        const cl = Math.hypot(cx, cy, cz) || 1; ax += (cx / cl) * P.cohesion; ay += (cy / cl) * P.cohesion; az += (cz / cl) * P.cohesion;
        const al = Math.hypot(avx, avy, avz) || 1; ax += (avx / al) * P.alignment; ay += (avy / al) * P.alignment; az += (avz / al) * P.alignment;
      }
      const sl = Math.hypot(sepx, sepy, sepz);
      if (sl > 0) { ax += (sepx / sl) * P.separation; ay += (sepy / sl) * P.separation; az += (sepz / sl) * P.separation; }

      // curl-noise wander
      curl3(x * P.noiseFreq, y * P.noiseFreq, z * P.noiseFreq, noiseT, cn);
      ax += cn.x * P.wander; ay += cn.y * P.wander; az += cn.z * P.wander;

      // steer, then RELAX SPEED TO CRUISE (active-matter self-propulsion sustains the mill), then clamp
      let nvx = this.vx[i] + ax * h, nvy = this.vy[i] + ay * h, nvz = this.vz[i] + az * h;
      const vl = Math.hypot(nvx, nvy, nvz) || 1e-3, nl = vl + (P.cruise - vl) * RELAX, kk = nl / vl;
      nvx *= kk; nvy *= kk; nvz *= kk;
      const sp = Math.hypot(nvx, nvy, nvz);
      if (sp > P.maxSpeed) { const c = P.maxSpeed / sp; nvx *= c; nvy *= c; nvz *= c; }
      this.vx[i] = nvx; this.vy[i] = nvy; this.vz[i] = nvz;
      this.px[i] = x + nvx * h; this.py[i] = y + nvy * h; this.pz[i] = z + nvz * h;

      // recycle: past the death plane, above the hive, or flung off the pipe
      if (this.py[i] < this.deathY || this.py[i] > this.hiveY + 3 || (this.px[i] * this.px[i] + this.pz[i] * this.pz[i]) > P.killRadius * P.killRadius) this._kill(i);
    }
  }

  // render hook: cb(i, x,y,z, hx,hy,hz, wing, bright) for ALIVE bees only.
  forEachBee(cb, buzzHz = 22) {
    for (let i = 0; i < this.maxBees; i++) {
      if (!this.alive[i]) continue;
      const vx = this.vx[i], vy = this.vy[i], vz = this.vz[i], sp = Math.hypot(vx, vy, vz) || 1;
      const wing = 0.5 + 0.5 * Math.sin(this.t * buzzHz * TAU + this.phase[i]);
      cb(i, this.px[i], this.py[i], this.pz[i], vx / sp, vy / sp, vz / sp, wing, this.bright[i]);
    }
  }

  // ── emergence diagnostics ──
  // mean specific vertical angular momentum L_y = mean(x·vz − z·vx). |L| ≫ 0 ⇒ a coherent mill
  // (rotation) locked in; its SIGN is the handedness. With pipeSpin>0 the sign tracks pipeSpin.
  angularMomentum() {
    let L = 0, n = 0;
    for (let i = 0; i < this.maxBees; i++) { if (!this.alive[i]) continue; L += this.px[i] * this.vz[i] - this.pz[i] * this.vx[i]; n++; }
    return n ? L / n : 0;
  }
  meanRadius() {
    let r = 0, n = 0;
    for (let i = 0; i < this.maxBees; i++) { if (!this.alive[i]) continue; r += Math.hypot(this.px[i], this.pz[i]); n++; }
    return n ? r / n : 0;
  }
}

if (typeof globalThis !== 'undefined') globalThis.Beelix = Beelix;

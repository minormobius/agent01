// tjs/beelix/beelix.js — the PURE "beelix" kernel: a helix of bees.
// No DOM, no three.js. Sister to ../swarm/swarm3d.js (and it borrows that file's
// curl-noise + PRNG via its _internal export, so there's one copy of the noise math).
//
// The scene is a FLOW, not a swarm-around-a-point:
//   • a HIVE at the top emits bees at a steady rate (a pooled particle emitter),
//   • a DEATH PLANE at the bottom recycles any bee that crosses it back to the pool,
//   • a LIGHT PIPE down the central axis PULSES — energy rings travel hive→death.
//
// The helix is not scripted — it FALLS OUT of three "servo" forces per bee, plus
// separation for organic thickness:
//   1. RADIAL servo   — hold the cylinder radius r → R  (keeps a clean tube, no collapse/blowout)
//   2. ANGULAR servo  — hold tangential speed → ω·R     (steady twist; ω sign = handedness)
//   3. AXIAL servo    — hold vertical speed → −descent   (steady fall hive→death)
// Constant descent + constant angular velocity = a helix, by construction. Spawn the
// emitter at S evenly-spaced angles and you get an S-strand (e.g. double) helix; bee
// separation + a little curl-noise give each strand its living thickness.
//
// The light pulses couple back into motion: a bee within `pulseBand` of a travelling
// pulse gets a tangential "kick" and lights up — so a brightness + speed wave ripples
// DOWN the helix in lockstep with the pipe, which is the whole effect.
//
// SoA Float32Arrays + a pure fixed-timestep step(): GPU-portable, node-testable.

import { _internal } from '../swarm/swarm3d.js';
const { rngFor, curl3 } = _internal;
const TAU = Math.PI * 2;

export const DEFAULT_PARAMS = {
  emitRate: 150,     // bees emitted per second (steady-state pop ≈ emitRate × fall-time)
  strands: 2,        // helix strands (2 = a double helix)
  radius: 5.0,       // helix tube radius R
  twist: 2.2,        // ω, angular velocity (rad/s); negative flips handedness
  descent: 3.4,      // downward speed the axial servo holds (units/s)
  radialK: 18.0,     // radial servo stiffness (hold r → R; stiff enough that the higher
                     // twist's outward drift stays a crisp tube, not a fat one)
  swirlK: 6.0,       // angular servo stiffness (hold tangential speed → ω·R)
  axialK: 4.5,       // axial servo stiffness (hold fall speed → −descent)
  // separation is deliberately gentle: a strong push fills the tube and blurs the
  // strands, whereas a light push lets bees STACK along the ideal helix line → a
  // legible rope. Turn it up (or use the "Column" preset) for the dense-tower look.
  separation: 3.0,   // boids short-range push
  sepRadius: 0.7,
  neighborRadius: 1.6,
  wander: 0.8,       // curl-noise turbulence (low → crisp strands)
  noiseFreq: 0.25,
  spawnJitter: 0.35, // angle/radius scatter at the hive mouth
  pulseInterval: 1.1,// seconds between light pulses launched from the hive
  pulseSpeed: 7.0,   // how fast a pulse travels down the pipe (units/s)
  pulseBand: 1.6,    // vertical half-width a pulse couples to / lights up
  pulseKick: 9.0,    // tangential speed-up a pulse imparts to bees it passes
  maxSpeed: 16,
  drag: 0.9,
};

export function clampParams(p = {}) {
  const o = { ...DEFAULT_PARAMS };
  const num = (k, lo, hi, round) => { if (p[k] != null && p[k] !== '' && isFinite(+p[k])) o[k] = round ? Math.round(Math.max(lo, Math.min(hi, +p[k]))) : Math.max(lo, Math.min(hi, +p[k])); };
  num('emitRate', 0, 1200); num('strands', 1, 6, true); num('radius', 1, 12); num('twist', -6, 6);
  num('descent', 0.2, 12); num('radialK', 0.5, 30); num('swirlK', 0.5, 30); num('axialK', 0.5, 30);
  num('separation', 0, 30); num('sepRadius', 0.2, 6); num('neighborRadius', 0.5, 8);
  num('wander', 0, 20); num('noiseFreq', 0.02, 1); num('spawnJitter', 0, 3);
  num('pulseInterval', 0.2, 6); num('pulseSpeed', 1, 30); num('pulseBand', 0.3, 6); num('pulseKick', 0, 40);
  num('maxSpeed', 2, 40); num('drag', 0.5, 0.999);
  return o;
}

export class Beelix {
  constructor(opts = {}) {
    this.maxBees = Math.max(64, Math.min(20000, opts.maxBees | 0 || 3000));
    this.params = clampParams(opts.params || {});
    this.seed = opts.seed || 'beelix:0';
    this.hiveY = opts.hiveY != null ? opts.hiveY : 12;     // emitter height
    this.deathY = opts.deathY != null ? opts.deathY : -12; // recycle plane
    this.t = 0; this.acc = 0; this.H = 1 / 60;

    const n = this.maxBees;
    this.px = new Float32Array(n); this.py = new Float32Array(n); this.pz = new Float32Array(n);
    this.vx = new Float32Array(n); this.vy = new Float32Array(n); this.vz = new Float32Array(n);
    this.phase = new Float32Array(n);   // wingbeat offset
    this.bright = new Float32Array(n);  // 0..1 — pulse proximity, for the render tint
    this.alive = new Uint8Array(n);
    this.strand = new Uint8Array(n);
    this.free = []; for (let i = n - 1; i >= 0; i--) this.free.push(i); // all slots start free
    this.aliveCount = 0;

    this.rnd = rngFor(this.seed + '::emit');
    this.emitAcc = 0;
    this.spawnCounter = 0;
    this.pulses = [];        // {y} travelling hive → death
    this.pulseAcc = 0;
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
    const strand = this.spawnCounter++ % P.strands;
    const baseAng = strand * TAU / P.strands;
    const ang = baseAng + (rnd() * 2 - 1) * P.spawnJitter;
    const r = P.radius + (rnd() * 2 - 1) * P.spawnJitter;
    this.px[i] = Math.cos(ang) * r;
    this.pz[i] = Math.sin(ang) * r;
    this.py[i] = this.hiveY - rnd() * 0.6;                 // a little spread at the mouth
    // launch tangential (sets the twist) + downward (sets the fall)
    const tx = -Math.sin(ang), tz = Math.cos(ang), vt = P.twist * P.radius;
    this.vx[i] = tx * vt; this.vz[i] = tz * vt; this.vy[i] = -P.descent;
    this.phase[i] = rnd() * TAU; this.strand[i] = strand; this.bright[i] = 0; this.alive[i] = 1;
    this.aliveCount++;
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

    // emit from the hive
    this.emitAcc += P.emitRate * h;
    while (this.emitAcc >= 1) { this.emitAcc -= 1; this._spawn(); }

    // advance light pulses down the pipe
    this.pulseAcc += h;
    while (this.pulseAcc >= P.pulseInterval) { this.pulseAcc -= P.pulseInterval; this.pulses.push({ y: this.hiveY }); }
    for (const p of this.pulses) p.y -= P.pulseSpeed * h;
    while (this.pulses.length && this.pulses[0].y < this.deathY) this.pulses.shift();

    this._rebuildGrid();
    const g = this._grid, cs = this._cs, sr2 = P.sepRadius * P.sepRadius, nr2 = P.neighborRadius * P.neighborRadius;
    const noiseT = Math.floor(this.t * 2), cn = { x: 0, y: 0, z: 0 };
    const pulses = this.pulses, band = P.pulseBand;

    for (let i = 0; i < this.maxBees; i++) {
      if (!this.alive[i]) continue;
      const x = this.px[i], y = this.py[i], z = this.pz[i];
      let ax = 0, ay = 0, az = 0;

      // cylindrical frame about the Y axis
      const r = Math.hypot(x, z) || 1e-3, rinv = 1 / r;
      const radx = x * rinv, radz = z * rinv;       // outward radial
      const tanx = -z * rinv, tanz = x * rinv;       // CCW tangent

      // 1. radial servo → hold r = R
      const aRad = -P.radialK * (r - P.radius);
      ax += radx * aRad; az += radz * aRad;

      // 2. angular servo → hold tangential speed = ω·R
      let vt = this.vx[i] * tanx + this.vz[i] * tanz;
      const aT = (P.twist * P.radius - vt) * P.swirlK;
      ax += tanx * aT; az += tanz * aT;

      // 3. axial servo → hold fall speed = −descent
      ay += (-P.descent - this.vy[i]) * P.axialK;

      // pulse coupling: a kick + brightness for bees the pulse is passing
      let bright = 0;
      for (let pi = 0; pi < pulses.length; pi++) {
        const dy = (y - pulses[pi].y) / band, e = Math.exp(-dy * dy);
        if (e > bright) bright = e;
      }
      this.bright[i] = bright;
      if (bright > 0.05) { ax += tanx * P.pulseKick * bright; az += tanz * P.pulseKick * bright; ay -= P.pulseKick * 0.25 * bright; }

      // separation (boids) over the 27-cell neighbourhood
      let sx = 0, sy = 0, sz = 0;
      const gcx = Math.floor(x / cs), gcy = Math.floor(y / cs), gcz = Math.floor(z / cs);
      for (let oz = -1; oz <= 1; oz++) for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
        const b = g.get((gcx + ox) + ',' + (gcy + oy) + ',' + (gcz + oz)); if (!b) continue;
        for (let k = 0; k < b.length; k++) {
          const j = b[k]; if (j === i) continue;
          const jx = this.px[j] - x, jy = this.py[j] - y, jz = this.pz[j] - z, dd = jx * jx + jy * jy + jz * jz;
          if (dd > nr2 || dd < 1e-6) continue;
          if (dd < sr2) { const inv = 1 / (Math.sqrt(dd) + 1e-3); sx -= jx * inv; sy -= jy * inv; sz -= jz * inv; }
        }
      }
      const sl = Math.hypot(sx, sy, sz);
      if (sl > 0) { ax += (sx / sl) * P.separation; ay += (sy / sl) * P.separation; az += (sz / sl) * P.separation; }

      // curl-noise wander
      curl3(x * P.noiseFreq, y * P.noiseFreq, z * P.noiseFreq, noiseT, cn);
      ax += cn.x * P.wander; ay += cn.y * P.wander; az += cn.z * P.wander;

      // integrate + drag + clamp
      let nvx = this.vx[i] + ax * h, nvy = this.vy[i] + ay * h, nvz = this.vz[i] + az * h;
      const damp = Math.pow(P.drag, h); nvx *= damp; nvy *= damp; nvz *= damp;
      const sp = Math.hypot(nvx, nvy, nvz);
      if (sp > P.maxSpeed) { const kk = P.maxSpeed / sp; nvx *= kk; nvy *= kk; nvz *= kk; }
      this.vx[i] = nvx; this.vy[i] = nvy; this.vz[i] = nvz;
      this.px[i] = x + nvx * h; this.py[i] = y + nvy * h; this.pz[i] = z + nvz * h;

      // death plane → recycle
      if (this.py[i] < this.deathY) this._kill(i);
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
}

if (typeof globalThis !== 'undefined') globalThis.Beelix = Beelix;

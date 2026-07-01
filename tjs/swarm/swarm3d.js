// tjs/swarm/swarm3d.js — the PURE 3D bee-swarm kernel. No DOM, no three.js.
// 3D sister to mega/bees/swarm.js (which is the 2D original). Self-contained: the
// tjs deploy stages only tjs/'s own files, so the PRNG + noise are inlined here
// rather than imported from mega/sprite — zero dependencies, no build step.
//
// A swarm in 3D is the same TWO problems the 2D kernel split out:
//   • APPEARANCE — what one bee looks like. At swarm scale a bee is a few pixels /
//                  one small instanced mesh; identity doesn't matter. The renderer
//                  BAKES one bee mesh ONCE and instances it N times (InstancedMesh).
//                  We never rebuild a bee per frame. (That lives in index.html.)
//   • MOTION     — where each bee IS. THIS FILE. A live agent sim, never a baked loop.
//
// Three coordination tiers, cheap → rich, all composable in one step():
//   1. ATTRACTOR    — a global field: radial pull to a target + tangential swirl about
//                     an axis ⇒ bees orbit a flower/hive in a torus instead of collapsing.
//   2. BOIDS (local) — Reynolds' cohesion / alignment / separation over the 3D neighbourhood,
//                     found via a uniform spatial hash (27 cells in 3D vs 9 in 2D).
//   3. STIGMERGY    — INDIRECT coordination through the environment: bees deposit "scent"
//                     into a 3D voxel grid; scent evaporates + diffuses; bees climb its
//                     gradient. No bee talks to another — the grid is the shared memory.
//                     This is the broad mechanism ants/termites/bees actually use; boids is
//                     only the direct-perception tier. Toggle stigmergyGain to 0 to disable.
//   + CURL-NOISE    — divergence-free 3D turbulence (curl of a vector potential) for organic
//                     wander that swirls instead of draining toward sinks.
//
// SoA Float32Arrays + a pure fixed-timestep step(): exactly the shape a WebGPU compute
// pass / Rust loop wants, so this CPU kernel is a faithful preview of a GPU port, not a toy.

const TAU = Math.PI * 2;

// ── House PRNG: xmur3 → mulberry32 (borges/js/prng.js family; same as sprite/core.js) ──
function xmur3(s){let h=1779033703^s.length;for(let i=0;i<s.length;i++){h=Math.imul(h^s.charCodeAt(i),3432918353);h=h<<13|h>>>19;}
  return()=>{h=Math.imul(h^h>>>16,2246822507);h=Math.imul(h^h>>>13,3266489909);return(h^=h>>>16)>>>0;};}
function mulberry32(a){return()=>{a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);
  t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}
const rngFor = (s) => mulberry32(xmur3(s)());

// ── 3D value noise → 3D curl ───────────────────────────────────────────────────────────────
// In 2D a scalar potential is enough (curl of a scalar). In 3D you need a VECTOR potential
// Ψ = (Px,Py,Pz); the wander force is curl(Ψ), which is divergence-free by construction, so
// the flow has no sources or sinks — bees swirl through it rather than all funnelling to a point.
function hash3(ix, iy, iz, t) {
  let h = (ix * 374761393 + iy * 668265263 + iz * 2147483647 + t * 2246822519) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296; // 0..1
}
function smooth(u) { return u * u * (3 - 2 * u); }
// trilinear value noise, seeded by `s` so the three potential channels are independent fields.
function vnoise3(x, y, z, t, s) {
  const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
  const fx = smooth(x - ix), fy = smooth(y - iy), fz = smooth(z - iz);
  const H = (dx, dy, dz) => hash3(ix + dx + s * 911, iy + dy, iz + dz, t);
  const c00 = H(0,0,0) * (1 - fx) + H(1,0,0) * fx;
  const c10 = H(0,1,0) * (1 - fx) + H(1,1,0) * fx;
  const c01 = H(0,0,1) * (1 - fx) + H(1,0,1) * fx;
  const c11 = H(0,1,1) * (1 - fx) + H(1,1,1) * fx;
  const c0 = c00 * (1 - fy) + c10 * fy;
  const c1 = c01 * (1 - fy) + c11 * fy;
  return c0 * (1 - fz) + c1 * fz;
}
// curl of the vector potential (P0,P1,P2): (∂P2/∂y−∂P1/∂z, ∂P0/∂z−∂P2/∂x, ∂P1/∂x−∂P0/∂y).
function curl3(x, y, z, t, out) {
  const e = 0.4, e2 = 2 * e;
  const dP2dy = (vnoise3(x, y + e, z, t, 2) - vnoise3(x, y - e, z, t, 2)) / e2;
  const dP1dz = (vnoise3(x, y, z + e, t, 1) - vnoise3(x, y, z - e, t, 1)) / e2;
  const dP0dz = (vnoise3(x, y, z + e, t, 0) - vnoise3(x, y, z - e, t, 0)) / e2;
  const dP2dx = (vnoise3(x + e, y, z, t, 2) - vnoise3(x - e, y, z, t, 2)) / e2;
  const dP1dx = (vnoise3(x + e, y, z, t, 1) - vnoise3(x - e, y, z, t, 1)) / e2;
  const dP0dy = (vnoise3(x, y + e, z, t, 0) - vnoise3(x, y - e, z, t, 0)) / e2;
  out.x = dP2dy - dP1dz;
  out.y = dP0dz - dP2dx;
  out.z = dP1dx - dP0dy;
  return out;
}

// ── Parameters (lengths in world units; the bench uses ~1 unit ≈ a few cm) ────────────────────
export const DEFAULT_PARAMS = {
  follow: 6.0,         // radial pull toward the attractor (flower/hive)
  swirl: 5.5,          // tangential pull about `swirlAxis` → bees orbit, not collapse
  cohesion: 1.6,       // steer toward neighbour centroid
  alignment: 2.4,      // match neighbour heading
  separation: 9.0,     // short-range push off close neighbours (strong; stops clumping)
  wander: 7.0,         // 3D curl-noise turbulence strength
  noiseFreq: 0.18,     // spatial scale of the turbulence
  noiseDrift: 0.5,     // how fast the turbulence field evolves in time
  // ── stigmergy: the indirect tier ──
  stigmergyGain: 4.0,  // steer up the scent gradient (0 disables the whole field cheaply)
  deposit: 1.0,        // scent each bee lays into its voxel per second
  evaporate: 0.55,     // scent retained per second (volatility; <1, lower = shorter trails)
  diffuse: 0.16,       // 6-neighbour blur coefficient per substep (spreads the trail)
  windX: 0, windY: 0, windZ: 0,
  maxSpeed: 9.0,
  drag: 0.86,          // per-second velocity retention
  neighborRadius: 3.2,
  sepRadius: 1.1,
  bounds: 16,          // soft spherical boundary radius (centred on origin)
};

export function clampParams(p = {}) {
  const o = { ...DEFAULT_PARAMS };
  const num = (k, lo, hi) => { if (p[k] != null && p[k] !== '' && isFinite(+p[k])) o[k] = Math.max(lo, Math.min(hi, +p[k])); };
  num('follow', 0, 60); num('swirl', -60, 60); num('cohesion', 0, 30); num('alignment', 0, 30);
  num('separation', 0, 60); num('wander', 0, 60); num('noiseFreq', 0.01, 1); num('noiseDrift', 0, 4);
  num('stigmergyGain', 0, 40); num('deposit', 0, 8); num('evaporate', 0.01, 0.999); num('diffuse', 0, 0.4);
  num('windX', -40, 40); num('windY', -40, 40); num('windZ', -40, 40);
  num('maxSpeed', 1, 40); num('drag', 0.5, 0.999); num('neighborRadius', 0.5, 12); num('sepRadius', 0.2, 8);
  num('bounds', 4, 60);
  return o;
}

// ── THE SWARM ────────────────────────────────────────────────────────────────────────────────
export class Swarm3D {
  constructor(opts = {}) {
    this.count = Math.max(1, Math.min(20000, opts.count | 0 || 600));
    this.params = clampParams(opts.params || {});
    this.seed = opts.seed || 'hive:0';
    this.swirlAxis = normalize(opts.swirlAxis || { x: 0, y: 1, z: 0 });
    this.target = opts.target ? { ...opts.target } : { x: 0, y: 0, z: 0 };
    this.t = 0;          // sim clock (deterministic: stepCount * H)
    this.acc = 0;        // fixed-timestep accumulator
    this.H = 1 / 60;     // fixed substep — reproducible regardless of render FPS

    const n = this.count;
    this.px = new Float32Array(n); this.py = new Float32Array(n); this.pz = new Float32Array(n);
    this.vx = new Float32Array(n); this.vy = new Float32Array(n); this.vz = new Float32Array(n);
    this.phase = new Float32Array(n); // per-bee wingbeat offset so the buzz isn't lock-step
    const rnd = rngFor(this.seed + '::init');
    const R = this.params.bounds * 0.5;
    for (let i = 0; i < n; i++) {
      // uniform-ish ball spawn around the target
      const u = rnd() * 2 - 1, th = rnd() * TAU, r = Math.cbrt(rnd()) * R, s = Math.sqrt(1 - u * u);
      this.px[i] = this.target.x + r * s * Math.cos(th);
      this.py[i] = this.target.y + r * u;
      this.pz[i] = this.target.z + r * s * Math.sin(th);
      const sp = this.params.maxSpeed * (0.2 + rnd() * 0.4), a = rnd() * TAU, b = Math.acos(rnd() * 2 - 1);
      this.vx[i] = sp * Math.sin(b) * Math.cos(a);
      this.vy[i] = sp * Math.cos(b);
      this.vz[i] = sp * Math.sin(b) * Math.sin(a);
      this.phase[i] = rnd() * TAU;
    }
    this._grid = new Map();   // uniform spatial hash, rebuilt per substep
    this._initScent(opts.scentRes | 0 || 22);
  }

  // ── stigmergy scent grid: a 3D voxel buffer covering [-G,G]³ centred on the origin ──
  _initScent(res) {
    this.sres = Math.max(6, Math.min(48, res));
    const span = this.params.bounds * 2.2;             // a bit larger than the soft boundary
    this.sorigin = -span / 2; this.sspan = span;
    this.scell = span / this.sres;
    const v = this.sres ** 3;
    this.scent = new Float32Array(v);                  // current field
    this._scent2 = new Float32Array(v);                // ping-pong buffer for diffusion
  }
  _sidx(ix, iy, iz) { const R = this.sres; return (iz * R + iy) * R + ix; }
  _svox(x, y, z) {   // world → voxel index triple (clamped), or null if far outside
    const R = this.sres, inv = 1 / this.scell;
    const ix = ((x - this.sorigin) * inv) | 0, iy = ((y - this.sorigin) * inv) | 0, iz = ((z - this.sorigin) * inv) | 0;
    if (ix < 0 || iy < 0 || iz < 0 || ix >= R || iy >= R || iz >= R) return null;
    return [ix, iy, iz];
  }

  setTarget(x, y, z) { this.target.x = x; this.target.y = y; this.target.z = z; }
  setParams(p) { this.params = clampParams({ ...this.params, ...p }); }

  // advance by real dt seconds, in fixed substeps (reproducible from (seed, #steps)).
  step(dt) {
    this.acc += Math.min(dt, 0.1); // clamp so a stalled tab doesn't fast-forward into chaos
    let guard = 0;
    while (this.acc >= this.H && guard++ < 8) { this._sub(this.H); this.acc -= this.H; this.t += this.H; }
  }

  _rebuildGrid() {
    const g = this._grid; g.clear();
    const cs = Math.max(0.5, this.params.neighborRadius);
    this._cs = cs;
    for (let i = 0; i < this.count; i++) {
      const key = (Math.floor(this.px[i] / cs)) + ',' + (Math.floor(this.py[i] / cs)) + ',' + (Math.floor(this.pz[i] / cs));
      let bucket = g.get(key); if (!bucket) { bucket = []; g.set(key, bucket); }
      bucket.push(i);
    }
  }

  // evaporate + diffuse the scent field one substep (the environment's own dynamics).
  _stepScent(h) {
    const P = this.params, R = this.sres, sc = this.scent;
    const keep = Math.pow(P.evaporate, h);             // volatility (frame-rate independent)
    for (let k = 0; k < sc.length; k++) sc[k] *= keep;
    if (P.diffuse > 0) {                               // 6-neighbour Laplacian smoothing
      const d = P.diffuse, s2 = this._scent2;
      for (let z = 0; z < R; z++) for (let y = 0; y < R; y++) for (let x = 0; x < R; x++) {
        const i = (z * R + y) * R + x;
        let acc = 0, n = 0;
        if (x > 0)     { acc += sc[i - 1]; n++; }       if (x < R - 1) { acc += sc[i + 1]; n++; }
        if (y > 0)     { acc += sc[i - R]; n++; }       if (y < R - 1) { acc += sc[i + R]; n++; }
        if (z > 0)     { acc += sc[i - R * R]; n++; }   if (z < R - 1) { acc += sc[i + R * R]; n++; }
        s2[i] = sc[i] + d * (acc - n * sc[i]);
      }
      this.scent = s2; this._scent2 = sc;
    }
  }

  _sub(h) {
    const P = this.params, g = this._grid, cs = (this._rebuildGrid(), this._cs);
    const nr2 = P.neighborRadius * P.neighborRadius, sr2 = P.sepRadius * P.sepRadius;
    const noiseT = Math.floor(this.t * P.noiseDrift * 4); // integer time slices → deterministic field
    const tx = this.target.x, ty = this.target.y, tz = this.target.z;
    const ax_ = this.swirlAxis, cn = { x: 0, y: 0, z: 0 };
    const stig = P.stigmergyGain > 0, sc = this.scent, scell = this.scell;

    for (let i = 0; i < this.count; i++) {
      const x = this.px[i], y = this.py[i], z = this.pz[i];
      let ax = 0, ay = 0, az = 0;

      // 1. attractor: radial pull + swirl about the axis (tangent = axis × radial)
      let dx = tx - x, dy = ty - y, dz = tz - z, d = Math.hypot(dx, dy, dz) || 1e-3;
      const rx = dx / d, ry = dy / d, rz = dz / d;
      ax += rx * P.follow; ay += ry * P.follow; az += rz * P.follow;
      // tangential = swirlAxis × radial (gives an orbit plane ⟂ the axis)
      ax += (ax_.y * rz - ax_.z * ry) * P.swirl;
      ay += (ax_.z * rx - ax_.x * rz) * P.swirl;
      az += (ax_.x * ry - ax_.y * rx) * P.swirl;

      // 2. boids over the 27-cell neighbourhood
      let sepx = 0, sepy = 0, sepz = 0, cx = 0, cy = 0, cz = 0, avx = 0, avy = 0, avz = 0, nN = 0;
      const gcx = Math.floor(x / cs), gcy = Math.floor(y / cs), gcz = Math.floor(z / cs);
      for (let oz = -1; oz <= 1; oz++) for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
        const bucket = g.get((gcx + ox) + ',' + (gcy + oy) + ',' + (gcz + oz)); if (!bucket) continue;
        for (let b = 0; b < bucket.length; b++) {
          const j = bucket[b]; if (j === i) continue;
          const jx = this.px[j] - x, jy = this.py[j] - y, jz = this.pz[j] - z, dd = jx * jx + jy * jy + jz * jz;
          if (dd > nr2) continue;
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

      // 3. stigmergy: climb the scent gradient (central differences on the voxel grid)
      if (stig) {
        const vo = this._svox(x, y, z);
        if (vo) {
          const [vx_, vy_, vz_] = vo, R = this.sres;
          const at = (ix, iy, iz) => (ix < 0 || iy < 0 || iz < 0 || ix >= R || iy >= R || iz >= R) ? 0 : sc[(iz * R + iy) * R + ix];
          let gx = at(vx_ + 1, vy_, vz_) - at(vx_ - 1, vy_, vz_);
          let gy = at(vx_, vy_ + 1, vz_) - at(vx_, vy_ - 1, vz_);
          let gz = at(vx_, vy_, vz_ + 1) - at(vx_, vy_, vz_ - 1);
          const gl = Math.hypot(gx, gy, gz);
          if (gl > 1e-6) { ax += (gx / gl) * P.stigmergyGain; ay += (gy / gl) * P.stigmergyGain; az += (gz / gl) * P.stigmergyGain; }
        }
      }

      // 4. curl-noise wander + wind
      curl3(x * P.noiseFreq, y * P.noiseFreq, z * P.noiseFreq, noiseT, cn);
      ax += cn.x * P.wander; ay += cn.y * P.wander; az += cn.z * P.wander;
      ax += P.windX; ay += P.windY; az += P.windZ;

      // 5. soft spherical boundary (a flower is local; no toroidal wrap)
      const rr = Math.hypot(x, y, z);
      if (rr > P.bounds) { const k = (rr - P.bounds) * 3, inv = 1 / (rr || 1); ax -= x * inv * k; ay -= y * inv * k; az -= z * inv * k; }

      // integrate (semi-implicit Euler) with drag + speed clamp
      let nvx = this.vx[i] + ax * h, nvy = this.vy[i] + ay * h, nvz = this.vz[i] + az * h;
      const damp = Math.pow(P.drag, h); nvx *= damp; nvy *= damp; nvz *= damp;
      const sp = Math.hypot(nvx, nvy, nvz);
      if (sp > P.maxSpeed) { const k = P.maxSpeed / sp; nvx *= k; nvy *= k; nvz *= k; }
      this.vx[i] = nvx; this.vy[i] = nvy; this.vz[i] = nvz;
      this.px[i] = x + nvx * h; this.py[i] = y + nvy * h; this.pz[i] = z + nvz * h;

      // deposit scent into the bee's voxel (the act that makes the grid a shared memory)
      if (stig && P.deposit > 0) {
        const vo = this._svox(this.px[i], this.py[i], this.pz[i]);
        if (vo) sc[this._sidx(vo[0], vo[1], vo[2])] += P.deposit * h;
      }
    }

    if (stig) this._stepScent(h);
  }

  // rendering hook: cb(i, px, py, pz, headingX, headingY, headingZ, wing). Pure read.
  forEachBee(cb, buzzHz = 20) {
    for (let i = 0; i < this.count; i++) {
      const vx = this.vx[i], vy = this.vy[i], vz = this.vz[i], sp = Math.hypot(vx, vy, vz) || 1;
      const wing = 0.5 + 0.5 * Math.sin(this.t * buzzHz * TAU + this.phase[i]);
      cb(i, this.px[i], this.py[i], this.pz[i], vx / sp, vy / sp, vz / sp, wing);
    }
  }

  // peak scent value (for normalising any field visualisation).
  scentPeak() { let m = 0; const sc = this.scent; for (let k = 0; k < sc.length; k++) if (sc[k] > m) m = sc[k]; return m; }
}

function normalize(v) { const l = Math.hypot(v.x, v.y, v.z) || 1; return { x: v.x / l, y: v.y / l, z: v.z / l }; }

// expose internals for the node selftest + a non-window global so it unit-tests in plain node
export const _internal = { rngFor, vnoise3, curl3, hash3 };
if (typeof globalThis !== 'undefined') globalThis.Swarm3D = Swarm3D;

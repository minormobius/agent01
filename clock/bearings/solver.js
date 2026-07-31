// solver.js — browser glue for the Rust bearing solver (clock/bearings/solver).
//
// No wasm-bindgen: the module exports a handful of C functions plus its memory,
// and everything bulk is read straight out of linear memory as Float32Array
// views. Views are re-made every frame because they detach whenever the wasm
// heap grows (which it does on `init`).
//
// The layouts here MUST match `sim.rs`; `layout()` reports the strides the wasm
// was built with and we assert against them at load, so a field added on one
// side and not the other fails loudly instead of rendering nonsense.

export const PARAM = {
  VOLTAGE: 0,
  VISCOSITY: 1,
  CHARGE: 2,
  CHAIN: 3,
  NOISE: 4,
  FRICTION: 5,
  TILT_X: 6,
  TILT_Y: 7,
  POLARITY: 8,
};

export const BALL_STRIDE = 12; // x y r q v heat  qx qy qz qw  speed wired
export const EDGE_STRIDE = 6; // x0 y0 x1 y1 current spark
export const STAT_COUNT = 18;

/** Stat slot names, in buffer order. */
export const STAT = {
  current: 0,
  closed: 1,
  chains: 2,
  maxSpeed: 3,
  meanOverlap: 4,
  cgIters: 5,
  cgResid: 6,
  liveFrac: 7,
  time: 8,
  edges: 9,
  sparks: 10,
  longestChain: 11,
  power: 12,
  n: 13,
  reach: 14,
  packing: 15,
  pin: 16,
  supply: 17,
};

export class Cell {
  constructor(exports) {
    this.x = exports;
    const [b, e, s] = [0, 1, 2].map((i) => exports.layout(i));
    if (b !== BALL_STRIDE || e !== EDGE_STRIDE || s !== STAT_COUNT) {
      throw new Error(`solver layout mismatch: wasm says ${b}/${e}/${s}`);
    }
    this.n = 0;
  }

  static async load(url = './bearings.wasm') {
    // ~75 KB; a plain fetch avoids streaming's MIME-type fussiness on static
    // hosts that serve .wasm as application/octet-stream.
    const res = await fetch(url);
    if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
    const { instance } = await WebAssembly.instantiate(await res.arrayBuffer(), {});
    return new Cell(instance.exports);
  }

  /** Scatter `n` bearings and start over. */
  reset(n, seed = (Math.random() * 1e9) | 0) {
    this.n = this.x.init(n, seed >>> 0);
    return this.n;
  }

  set(param, value) {
    this.x.set_param(param, value);
  }

  /** Advance one frame. `dt` is clamped inside the solver. */
  step(dt, substeps = 12) {
    this.x.step(dt, substeps);
  }

  stir(x, y, vx, vy, radius) {
    this.x.stir(x, y, vx, vy, radius);
  }

  shake(strength) {
    this.x.shake(strength);
  }

  // --- views into wasm memory; call every frame, never cache ---------------
  balls() {
    return new Float32Array(this.x.memory.buffer, this.x.ball_ptr(), this.x.ball_count() * BALL_STRIDE);
  }

  edges() {
    return new Float32Array(this.x.memory.buffer, this.x.edge_ptr(), this.x.edge_count() * EDGE_STRIDE);
  }

  edgeCount() {
    return this.x.edge_count();
  }

  stats() {
    return new Float32Array(this.x.memory.buffer, this.x.stats_ptr(), STAT_COUNT);
  }
}

// --- display units ---------------------------------------------------------
// The solver works in reduced units (cup radius 1, 1/4πε₀ = 1). These are the
// factors that turn them into the numbers on the panel of a real cell: a 50 mm
// cup, a supply that tops out around 30 kV, and a source impedance that limits
// a dead short to a few hundred microamps.
export const DISPLAY = {
  kvPerUnit: 30 / 0.9, // knob 1.0 → 30 kV; V_REF in sim.rs is 0.9
  uaPerUnit: 3000, // a dead short across the supply lead ≈ 300 µA
};

export const fmtCurrent = (i) => {
  const ua = Math.abs(i) * DISPLAY.uaPerUnit;
  return ua < 1000 ? `${ua.toFixed(ua < 10 ? 2 : 0)} µA` : `${(ua / 1000).toFixed(2)} mA`;
};

export const fmtPower = (p) => {
  const w = Math.abs(p) * DISPLAY.uaPerUnit * DISPLAY.kvPerUnit * 1e-3; // µA·kV → mW
  return w < 1000 ? `${w.toFixed(w < 10 ? 2 : 0)} mW` : `${(w / 1000).toFixed(2)} W`;
};

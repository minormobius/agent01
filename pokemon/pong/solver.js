// solver.js — loading the lattice Boltzmann module and drawing what it says.
//
// `solver.wasm` is a committed build product of `solver/`. It exports raw
// `extern "C"` functions and its linear memory; there is no wasm-bindgen, no
// glue, and nothing fetched at runtime beyond the 34 kB binary itself.
//
// The panel on the page is a SMALLER, CHEAPER instance of the same solver than
// the one that produced the coefficient table. It runs live at whatever spin
// ratio the ball in play currently has, so you can watch the wake lean over as
// a shot spins up, and it is honestly labelled on the page as an illustration:
// a live grid a few hundred steps into a change of spin has not converged, and
// the numbers the flight uses come from the long sweep instead.

export const PANEL = { nx: 224, ny: 112, r: 9, u0: 0.075, re: 80 };

export class Flow {
  constructor(exports) {
    this.w = exports;
    this.nx = 0;
    this.ny = 0;
  }

  static async load(url = './solver.wasm') {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`solver.wasm: ${res.status}`);
    const { instance } = await WebAssembly.instantiate(await res.arrayBuffer(), {});
    return new Flow(instance.exports);
  }

  init(cfg = PANEL) {
    this.w.init(cfg.nx, cfg.ny, cfg.r, cfg.u0, cfg.re);
    this.nx = this.w.grid_w();
    this.ny = this.w.grid_h();
    this.cfg = cfg;
    this.alpha = 0;
    return this;
  }

  /// The panel's Reynolds number is fixed by its grid, so the only thing the
  /// game changes is the spin ratio — which is the only thing that matters for
  /// what you can see.
  setAlpha(a) {
    // The lattice cannot carry a surface faster than a fair fraction of its own
    // sound speed, so the panel clamps. Beyond about |alpha| = 2 it detonates,
    // which is a real limit of the method and not something to hide.
    const c = Math.max(-1.8, Math.min(1.8, a));
    if (c !== this.alpha) {
      this.alpha = c;
      this.w.set_alpha(c);
    }
  }

  run(n) {
    this.w.run(n);
  }

  cl() { return this.w.cl_mean(); }
  cd() { return this.w.cd_mean(); }
  resetStats() { this.w.reset_stats(); }
  steps() { return this.w.steps(); }

  /// A fresh view each time: the pointer is only stable until linear memory
  /// grows, and forgetting that is the classic wasm bug.
  field(mode = 0) {
    this.w.paint(mode);
    return new Float32Array(this.w.memory.buffer, this.w.field_ptr(), this.nx * this.ny);
  }
}

// ---------------------------------------------------------------------------
// Drawing
// ---------------------------------------------------------------------------

/// Diverging blue/red vorticity map, drawn straight into an ImageData at
/// lattice resolution and then scaled up by the canvas. The cylinder comes back
/// as NaN from the solver, which is how it gets its own colour without the
/// drawing code needing to know where it is.
export function paintVorticity(img, field, gain) {
  const d = img.data;
  for (let i = 0; i < field.length; i++) {
    const v = field[i];
    const o = i * 4;
    if (Number.isNaN(v)) {
      d[o] = 240; d[o + 1] = 244; d[o + 2] = 250; d[o + 3] = 255;
      continue;
    }
    const t = Math.max(-1, Math.min(1, v * gain));
    if (t >= 0) {
      d[o] = 232 - 24 * (1 - t);
      d[o + 1] = 90 + 130 * (1 - t);
      d[o + 2] = 74 + 130 * (1 - t);
    } else {
      d[o] = 60 + 160 * (1 + t);
      d[o + 1] = 120 + 100 * (1 + t);
      d[o + 2] = 226 - 6 * (1 + t);
    }
    d[o + 3] = 255;
  }
}

/// The lattice has y increasing upward and a canvas has it increasing downward,
/// so the blit is flipped. Doing it here rather than in the solver keeps the
/// solver's sign conventions the same as every paper it is compared against.
export function blit(ctx, img, canvas) {
  const off = blit.buf || (blit.buf = document.createElement('canvas'));
  if (off.width !== img.width || off.height !== img.height) {
    off.width = img.width;
    off.height = img.height;
  }
  off.getContext('2d').putImageData(img, 0, 0);
  ctx.save();
  ctx.imageSmoothingEnabled = true;
  ctx.translate(0, canvas.height);
  ctx.scale(canvas.width / img.width, -canvas.height / img.height);
  ctx.drawImage(off, 0, 0, img.width, img.height);
  ctx.restore();
}

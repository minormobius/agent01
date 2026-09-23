// engine.js — glue between the page and waterwheel.wasm.
//
// Same shape as the two next door: no imports in the module, so no import
// object and no bindgen shim. Views into linear memory are rebuilt on every
// read, because a Vec growing inside Rust detaches the old buffer.

export async function loadEngine(url) {
  let mod;
  try {
    mod = await WebAssembly.instantiateStreaming(fetch(url), {});
  } catch {
    const bytes = await (await fetch(url)).arrayBuffer();
    mod = await WebAssembly.instantiate(bytes, {});
  }
  return wrap(mod.instance);
}

/** For node, where there is no fetch-to-a-file. */
export function fromBytes(bytes) {
  return wrap(new WebAssembly.Instance(new WebAssembly.Module(bytes), {}));
}

/** The order init/set_params take their arguments in. */
const ORDER = ['n', 'q', 'k', 'nu', 'inertia', 'g', 'radius', 'spread'];

function wrap(instance) {
  const e = instance.exports;
  const mem = e.memory;
  const args = (p) => ORDER.map((f) => p[f]);

  return {
    init(p) { e.init(...args(p)); },
    /** Returns true if the bucket count changed and the wheel was rebuilt. */
    setParams(p) { return !!e.set_params(...args(p)); },
    reset(omega0 = 0, delta = 1e-9) { e.reset(omega0, delta); },
    /** Advance `dt` seconds in `sub` substeps, sampling the traces every
     *  `sample` seconds of wheel time. */
    step(dt, sub, sample) { e.step(dt, sub, sample); },

    theta: () => e.theta(),
    omega: () => e.omega(),
    twinTheta: () => e.twin_theta(),
    twinOmega: () => e.twin_omega(),
    elapsed: () => e.elapsed(),
    totalMass: () => e.total_mass(),
    nBuckets: () => e.n_buckets(),

    /** What is in each bucket. Valid until the next step. */
    mass() { return new Float64Array(mem.buffer, e.mass_ptr(), e.n_buckets()); },
    twinMass() { return new Float64Array(mem.buffer, e.twin_mass_ptr(), e.n_buckets()); },

    com: () => [e.com_x(), e.com_y()],
    twinCom: () => [e.twin_com_x(), e.twin_com_y()],

    /** Interleaved x,y in wheel radii, oldest first. */
    trace() { return new Float32Array(mem.buffer, e.trace_ptr(), e.trace_len() * 2); },
    twinTrace() { return new Float32Array(mem.buffer, e.twin_trace_ptr(), e.twin_trace_len() * 2); },
    lorenzTrace() { return new Float32Array(mem.buffer, e.lorenz_trace_ptr(), e.lorenz_trace_len() * 2); },

    separation: () => e.separation(),

    /** The Lorenz numbers, derived from the physics — never set directly. */
    lorenz: () => ({
      sigma: e.sigma(), rho: e.rho(), beta: e.beta(),
      rhoHopf: e.rho_hopf(), regime: e.regime(),
      x: e.lorenz_x(), y: e.lorenz_y(), z: e.lorenz_z(),
    }),
    /** How far a finite bucket count pushes the inflow off the continuum's. */
    ripple: () => e.ripple(),
  };
}

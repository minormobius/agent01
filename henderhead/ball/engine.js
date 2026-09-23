// engine.js — glue between the page and bouncer.wasm.
//
// Same shape as the three next door: no imports in the module, so no import
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

function wrap(instance) {
  const e = instance.exports;
  const mem = e.memory;

  return {
    init(p) { e.init(p.radius, p.gravity, p.restitution, p.offset, p.height); },
    setParams(p) { e.set_params(p.radius, p.gravity, p.restitution); },
    reset(offset, height) { e.reset(offset, height); },
    launch(x, y, vx, vy) { e.launch(x, y, vx, vy); },
    /** Put the ball at a point picked off the Poincaré section. */
    launchFromSection(angle, sinOut) { return !!e.launch_from_section(angle, sinOut); },

    /** Advance `dt` of ball time; returns how many bounces happened. */
    step(dt, trailSample = 0.01) { return e.step(dt, trailSample); },

    /**
     * Rebuild the fan of futures from wherever the ball is now: `n` copies,
     * each with its velocity turned by up to `delta` radians, followed `k`
     * bounces and sampled `m` times per flight.
     */
    buildFan(n, delta, k, m) { return e.build_fan(n, delta, k, m); },
    fanCount: () => e.fan_count(),
    fanPoints: () => e.fan_points(),
    fan() { return new Float32Array(mem.buffer, e.fan_ptr(), e.fan_count() * e.fan_points() * 2); },
    /** Spread after `depth+1` bounces: 0 all in one place, 1 scattered right round. */
    spreadAt: (depth) => e.spread_at(depth),

    ball: () => ({ x: e.ball_x(), y: e.ball_y(), vx: e.ball_vx(), vy: e.ball_vy() }),
    clock: () => e.clock(),
    bounces: () => e.bounce_count(),
    energy: () => e.energy(),
    /** Energy drift since the drop, relative to the fall height. */
    energyDrift: () => e.energy_drift(),
    lyapunov: () => e.lyapunov(),
    /** The same, per bounce — the natural unit for a billiard, and the one
     *  "four bounces ahead" is counted in. */
    lyapunovPerBounce: () => e.lyapunov_per_bounce(),

    trail() { return new Float32Array(mem.buffer, e.trail_ptr(), e.trail_len() * 2); },
    /** (rim angle, sine of the launch angle) at every bounce. */
    section() { return new Float32Array(mem.buffer, e.section_ptr(), e.section_len() * 2); },
    /** The background phase portrait — many orbits on the same energy surface.
     *  Only needs rebuilding when the physics changes. */
    buildSurvey(orbits, steps) { return e.build_survey(orbits, steps); },
    survey() { return new Float32Array(mem.buffer, e.survey_ptr(), e.survey_len() * 2); },
    /** (time, spread) each time the fan is rebuilt. */
    spreadHistory() { return new Float32Array(mem.buffer, e.spread_ptr(), e.spread_len() * 2); },
  };
}

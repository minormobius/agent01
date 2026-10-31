// Roll — engine worker. Loads the Rust/WASM font engine off the main thread and
// answers {id, op, args} requests; font bytes come back as transferred buffers.

import init, * as engine from "./pkg/minofont.js";

const ready = init();

const OPS = {
  roll_params: (seed, spec) => engine.roll_params(seed, spec),
  roll_subset: (seed, spec, text) => engine.roll_subset(seed, spec, text),
  describe: (seed, spec) => engine.describe(seed, spec),
  archetype_spec: (i, spread, seed) => engine.archetype_spec(i, spread, seed),
  archetypes: () => engine.archetypes(),
  genes: () => engine.genes(),
  charset: () => engine.charset(),
};

self.onmessage = async (e) => {
  const { id, op, args } = e.data;
  try {
    await ready;
    const t = performance.now();
    const result = OPS[op](...args);
    const ms = performance.now() - t;
    if (result instanceof Uint8Array) {
      const buf = result.buffer.slice(result.byteOffset, result.byteOffset + result.byteLength);
      self.postMessage({ id, ok: true, result: buf, ms }, [buf]);
    } else {
      self.postMessage({ id, ok: true, result, ms });
    }
  } catch (err) {
    self.postMessage({ id, ok: false, error: String(err && err.message ? err.message : err) });
  }
};

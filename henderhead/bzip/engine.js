// engine.js — glue between the page and bzncd.wasm.
//
// Same shape as the engines next door: no imports in the module, so no import
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
  const stage = (bytes) => {
    const p = e.stage_ptr(bytes.length);
    new Uint8Array(mem.buffer, p, bytes.length).set(bytes);
  };

  return {
    /** bzip2 -9 length of `bytes`, in bytes. */
    bzLen(bytes) { stage(bytes); return e.bz_len(); },
    /** A complete .bz2 stream for `bytes` (a copy). */
    bzip2(bytes) {
      stage(bytes);
      const n = e.bz_compress();
      return new Uint8Array(mem.buffer, e.out_ptr(), n).slice();
    },

    /**
     * Start a new set. Compresses every item alone straight away; pairs are
     * done by `step`. `both` computes C(xy) and C(yx) and keeps the smaller.
     */
    build(items, both = false) {
      for (const it of items) { stage(it); e.item_push(); }
      return e.set_build(both ? 1 : 0);
    },
    /** Do up to `budget` more pairs; returns pairs done so far. */
    step(budget) { return e.set_step(budget); },
    totalPairs: () => e.set_total_pairs(),
    /** n×n NCD, NaN where not yet computed and on the diagonal. A copy. */
    ncd(n) { return new Float32Array(mem.buffer, e.ncd_ptr(), n * n).slice(); },
    singles(n) { return new Uint32Array(mem.buffer, e.single_ptr(), n).slice(); },
    /** NCD of an outside string against every item of the set. */
    query(bytes, n, both = false) {
      stage(bytes);
      const p = e.set_query(both ? 1 : 0);
      return new Float32Array(mem.buffer, p, n).slice();
    },
  };
}

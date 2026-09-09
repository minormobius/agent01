// engine.js — the forty lines of glue between the page and cffourier.wasm.
//
// The .wasm has no imports at all (its sin and cos come from Rust's own libm),
// so instantiating it needs no import object and no bindgen shim. Results come
// back as pointer + length into linear memory; the views below are rebuilt on
// every read because a Vec growing inside Rust can detach the old buffer.

export async function loadEngine(url) {
  let mod;
  try {
    mod = await WebAssembly.instantiateStreaming(fetch(url), {});
  } catch {
    // some hosts serve .wasm without application/wasm; the byte path always works
    const bytes = await (await fetch(url)).arrayBuffer();
    mod = await WebAssembly.instantiate(bytes, {});
  }
  return wrap(mod.instance);
}

/** For node, where there is no fetch-to-a-file. */
export function fromBytes(bytes) {
  const m = new WebAssembly.Module(bytes);
  return wrap(new WebAssembly.Instance(m, {}));
}

function wrap(instance) {
  const w = instance.exports;
  const mem = w.memory;
  const f64 = (p, n) => new Float64Array(mem.buffer, p, n);
  const f32 = (p, n) => new Float32Array(mem.buffer, p, n);
  const u32 = (p, n) => new Uint32Array(mem.buffer, p, n);

  /** Hand a JS string into linear memory for the duration of one call. */
  function withStr(s, fn) {
    const bytes = new TextEncoder().encode(s);
    const ptr = w.alloc(bytes.length);
    new Uint8Array(mem.buffer, ptr, bytes.length).set(bytes);
    try { return fn(ptr, bytes.length); } finally { w.dealloc(ptr, bytes.length); }
  }

  return {
    /**
     * Point the engine at a number. `spec` comes from numbers.js `resolve`.
     * Returns a description of the expansion, or null if it could not be read.
     */
    setNumber(spec, want = 96) {
      let n = 0;
      if (spec.kind === 'ratio') n = w.set_ratio(BigInt(spec.p), BigInt(spec.q));
      else if (spec.kind === 'surd') n = w.set_surd(BigInt(spec.a), BigInt(spec.b), BigInt(spec.c), BigInt(spec.n), want);
      else if (spec.kind === 'dec') n = withStr(spec.dec, (p, l) => w.set_decimal(p, l));
      if (!n) return null;
      const ps = period();
      return {
        n,
        terms: Array.from(f64(w.terms_ptr(), n)),
        qs: Array.from(f64(w.qs_ptr(), n)),
        ps: Array.from(f64(w.ps_ptr(), n)),
        exact: !!w.is_exact(),
        terminated: !!w.is_terminated(),
        period: ps,
      };
    },

    /**
     * Sample the curve for `k` terms at exponent `alpha`, over t ∈ [t0, t1).
     * `perCycle` samples per cycle of the fastest term — below ~8 the fine
     * detail aliases into shapes that are not in the number — and never fewer
     * than `floor`, which the caller sets from the on-screen size so that a
     * plain circle is round rather than a polygon.
     *
     * The returned view is valid until the next call into the engine.
     */
    build(k, alpha, { t0 = 0, t1 = Math.PI * 2, perCycle = 20, floor = 4096, cap = 1 << 20 } = {}) {
      const n = w.build(k, alpha, t0, t1, perCycle, floor, cap);
      return { n, xy: f32(w.xy_ptr(), n * 2), bbox: Array.from(f32(w.bbox_ptr(), 4)), arc: w.arc_len() };
    },

    /** The epicycle chain at one instant: k+1 points, origin to pen. */
    chain(k, alpha, t) {
      const n = w.chain_at(k, alpha, t);
      return f32(w.chain_ptr(), n * 2);
    },

    planeInit(width, height, cx, cy, scale) { w.plane_init(width, height, cx, cy, scale); },
    planeAdd(i0, i1, count, alpha, qCap, perCycle = 12, cap = 1 << 16) {
      return w.plane_add(i0, i1, count, alpha, qCap, perCycle, cap);
    },
    planeMax: () => w.plane_max(),
    planeCurves: () => w.plane_curves(),
    planePixels(width, height) { return u32(w.plane_ptr(), width * height); },

    /** Largest q whose term a `digits`-digit decimal can vouch for. */
    trustedQ: (digits) => w.trusted_q(digits),
  };

  function period() {
    const s = w.period_start(), l = w.period_len();
    return s < 0 ? null : { start: s, length: l };
  }
}

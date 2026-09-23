// engine.js — glue between the page and craftca.wasm.
//
// Same shape as the one next door in /cf/: the module has no imports, so
// instantiating it needs no import object and no bindgen shim. Views into
// linear memory are rebuilt on every read, because a Vec growing inside Rust
// can detach the old buffer.

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

/** Ten u16 per craft, in the order lib.rs writes them. */
const CRAFT_FIELDS = ['x', 'y', 'w', 'h', 'recipe', 'out', 'placed', 'spilled', 'outX', 'outY'];

function wrap(instance) {
  const e = instance.exports;
  const mem = e.memory;
  let desc = null;
  let cells = 0;

  return {
    /**
     * Build a world. Returns the rule's static description — the item list, the
     * seed stock, the default ban and every recipe shape — which comes out of
     * the engine rather than being written down twice.
     */
    init(w, h, seed, density) {
      cells = e.init(w, h, seed >>> 0, density);
      const bytes = new Uint8Array(mem.buffer, e.desc_ptr(), e.desc_len());
      desc = JSON.parse(new TextDecoder().decode(bytes));
      desc.itemCount = e.n_items();
      desc.cells = cells;
      return desc;
    },
    desc: () => desc,

    reseed(seed, density) { e.reseed(seed >>> 0, density); },
    setMotion(p) { e.set_motion(p); },
    setCraftRate(p) { e.set_craft_rate(p); },
    setRestock(p) { e.set_restock(p); },
    /** 0 = prefer the biggest match, 1 = pick at random. */
    setPriority(mode) { e.set_priority(mode); },
    setBanned(item, on) { e.set_banned(item, on ? 1 : 0); },
    isBanned(item) { return !!e.is_banned(item); },
    put(x, y, item) { e.put(x, y, item); },

    /** Advance n ticks. Only the last tick's crafts are reported. */
    step(n = 1) { return e.step(n); },

    /** The grid, as item ids. Valid until the next step. */
    cells() { return new Uint16Array(mem.buffer, e.cells_ptr(), e.cells_len()); },
    /** One count per item id, index 0 unused. */
    counts() { return new Uint32Array(mem.buffer, e.counts_ptr(), e.n_items()); },

    /** The last tick's crafts, as objects — there are never many. */
    crafts(n) {
      const flat = new Uint16Array(mem.buffer, e.crafts_ptr(), n * CRAFT_FIELDS.length);
      const out = [];
      for (let i = 0; i < n; i++) {
        const c = {};
        for (let f = 0; f < CRAFT_FIELDS.length; f++) c[CRAFT_FIELDS[f]] = flat[i * CRAFT_FIELDS.length + f];
        out.push(c);
      }
      return out;
    },

    /** Tick at which each item first appeared, -1 for never. */
    discovered() { return new Float64Array(mem.buffer, e.discovered_ptr(), e.n_items()); },

    tick: () => e.tick(),
    occupied: () => e.occupied(),
    totalCrafts: () => e.total_crafts(),
    totalSpilled: () => e.total_spilled(),
  };
}

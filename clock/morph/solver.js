// solver.js — browser glue for the Rust morphogenesis engine (clock/morph/solver).
//
// No wasm-bindgen: the module exports a handful of C functions plus its memory,
// and everything bulky is read straight out of linear memory as Float32Array
// views. Views are re-made every frame because they detach whenever the wasm
// heap grows — which it does constantly here, since the graph only ever gets
// bigger.
//
// The layouts below MUST match `src/lib.rs`; `layout()` reports the strides the
// wasm was built with and we assert against them at load, so a field added on
// one side and not the other fails loudly instead of rendering nonsense.

/** Parameter ids. Mirrors `param` in lib.rs. */
export const PARAM = {
  REPULSION: 0,
  WIRE: 1,
  DECAY: 2,
  LINK_DISTANCE: 3,
  GRAVITY: 4,
  MAX_SPEED: 5,
  SIGNAL_RATE: 6,
  THRESHOLD: 7,
  LEAK: 8,
};

export const NODE_STRIDE = 7; // x y r depth kind age act
export const EDGE_STRIDE = 6; // x0 y0 x1 y1 age act
export const EVENT_STRIDE = 5; // kind gate depth weight cell
export const STAT_COUNT = 18;

/** Stat slot names, in buffer order. */
export const STAT = {
  cells: 0, // active leaves
  edges: 1,
  total: 2, // cells ever created, expanded ones included
  buds: 3, // unexpanded cells still standing
  energy: 4, // sum of squared speeds — "still settling"
  meanDegree: 5,
  maxDepth: 6, // deepest gate path from an input
  grown: 7, // 1 once nothing is left to expand
  capped: 8, // 1 if growth stopped at the cell ceiling
  loX: 9,
  loY: 10,
  hiX: 11,
  hiY: 12,
  gates: 13,
  frame: 14,
  eventsSeen: 15, // events created since the last drain, dropped ones included
  activity: 16, // fraction of the structure currently lit
  firings: 17, // gates that fired on the last tick
};

/** Event kinds, in the buffer's first slot. Mirrors `event_kind` in lib.rs. */
export const EVENT = {
  FIRE: 0, // a signal reached a gate — the main voice
  BORN: 1, // a cell was created — a grace note
};

/** `kind` slot value for a bud (an unexpanded cell). */
export const BUD = -1;

export class Morph {
  constructor(exports) {
    this.x = exports;
    const [n, e, v, s] = [0, 1, 2, 3].map((i) => exports.layout(i));
    if (n !== NODE_STRIDE || e !== EDGE_STRIDE || v !== EVENT_STRIDE || s !== STAT_COUNT) {
      throw new Error(`solver layout mismatch: wasm says ${n}/${e}/${v}/${s}`);
    }
    this.maxCells = exports.layout(4);
    this.ok = false;
    this.error = '';
    this._enc = new TextEncoder();
    this._dec = new TextDecoder();
  }

  static async load(url = './morph.wasm') {
    // ~120 KB; a plain fetch avoids streaming's MIME-type fussiness on static
    // hosts that serve .wasm as application/octet-stream.
    const res = await fetch(url);
    if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
    const { instance } = await WebAssembly.instantiate(await res.arrayBuffer(), {});
    return new Morph(instance.exports);
  }

  /** Fresh view; call after anything that may have grown the heap. */
  _f32(ptr, len) {
    return new Float32Array(this.x.memory.buffer, ptr, len);
  }

  /**
   * Compile a program and start it over from a single root cell.
   * Returns true on success; on failure `error` holds the reason and the
   * canvas goes empty rather than keeping a graph the source no longer means.
   */
  compile(src, seed = (Math.random() * 1e9) | 0) {
    const bytes = this._enc.encode(src);
    const cap = this.x.src_capacity();
    if (bytes.length > cap) {
      this.ok = false;
      this.error = `program is ${bytes.length} bytes, limit is ${cap}`;
      return false;
    }
    new Uint8Array(this.x.memory.buffer, this.x.src_ptr(), cap).set(bytes);
    this.ok = this.x.compile(bytes.length, seed >>> 0) === 1;
    this.error = this.ok
      ? ''
      : this._dec.decode(new Uint8Array(this.x.memory.buffer, this.x.err_ptr(), this.x.err_len()));
    return this.ok;
  }

  /**
   * Advance one **tick**: grow, relax, propagate.
   *
   * A tick is the engine's unit of time, and is deliberately not a frame — the
   * caller runs as many per frame as the tick-speed control asks for, so the
   * same structure can be watched a level at a time or run far ahead of the
   * display without growth, layout or signal changing character.
   *
   * `grow` is cells expanded this tick and may be fractional; below 1 the
   * structure unfolds over several ticks instead of stuttering. `relax` is
   * layout steps, which keep running long after growth has finished.
   */
  step(grow, relax, largest) {
    if (!this.ok) return;
    this.x.step(grow, relax | 0, largest ? 1 : 0);
  }

  /** Node buffer: `NODE_STRIDE` floats each. Valid until the next `step`. */
  nodes() {
    const n = this.x.node_count();
    return n ? this._f32(this.x.node_ptr(), n * NODE_STRIDE) : new Float32Array(0);
  }

  /** Edge buffer, as endpoint coordinates. Valid until the next `step`. */
  edges() {
    const n = this.x.edge_count();
    return n ? this._f32(this.x.edge_ptr(), n * EDGE_STRIDE) : new Float32Array(0);
  }

  /**
   * Everything that happened since the last call — gates firing, cells born —
   * and the count. Drains the queue, so call it exactly once per frame, and
   * call it whether or not the sound is on: nothing else empties it.
   */
  events() {
    const n = this.x.drain_events();
    return [n ? this._f32(this.x.event_ptr(), n * EVENT_STRIDE) : new Float32Array(0), n];
  }

  stats() {
    return this._f32(this.x.stats_ptr(), STAT_COUNT);
  }

  setParam(id, value) {
    this.x.set_param(id, value);
  }
}

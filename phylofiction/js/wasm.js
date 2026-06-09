/* phylofiction — the Rust/WASM engine loader.
 *
 * No wasm-bindgen: the module is a raw wasm32-unknown-unknown build with a tiny
 * C ABI. `evolve(n)` writes the world's JSON into linear memory and returns a
 * pointer; `result_len()` gives the byte length; we read the bytes out of
 * `memory.buffer` and JSON.parse them. The shape is identical to js/evolve.js's
 * evolveWorld() output, and the two engines are bit-for-bit identical (a
 * permalink resolves to the same world on either backend) — verified by
 * test/parity.test.mjs.
 */

export async function loadWasmEngine() {
  const url = new URL("../engine/phylofiction.wasm", import.meta.url);
  const resp = await fetch(url);
  if (!resp.ok) throw new Error("wasm fetch failed: " + resp.status);
  const buf = await resp.arrayBuffer();
  const { instance } = await WebAssembly.instantiate(buf, {});
  const ex = instance.exports;
  const dec = new TextDecoder();

  const evolveWorld = (n) => {
    const ptr = ex.evolve(n >>> 0);
    const len = ex.result_len();
    // re-read memory.buffer each call — it can detach if the heap grew
    const bytes = new Uint8Array(ex.memory.buffer, ptr, len);
    return JSON.parse(dec.decode(bytes));
  };

  // the interestingness filter, run entirely in Rust (no per-seed JSON marshaling)
  const findOxygenation = (start, limit = 600) => {
    const r = ex.find_seed(start >>> 0, limit >>> 0);
    return r < 0 ? null : r;
  };

  return { backend: "wasm", version: ex.engine_version(), evolveWorld, findOxygenation };
}

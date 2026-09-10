// The Rust engine as WASM (Truck kernel), driven over its raw C ABI — this is
// the number a browser would see. Same code as `truck`, different host.
import fs from 'node:fs';
import path from 'node:path';
import { readStl } from '../invariants.mjs';

const here = path.dirname(new URL(import.meta.url).pathname);
const WASM = path.join(here, '..', '..', 'engine', 'target', 'wasm32-unknown-unknown', 'release', 'cad_engine.wasm');

export function make(kernelIndex = 0, extraId = 'wasm') {
  let inst, mem;
  const bytes = fs.existsSync(WASM) ? fs.statSync(WASM).size : 0;
  return {
    id: extraId,
    exact: kernelIndex === 0,
    bytes,
    async init() {
      const t0 = performance.now();
      // Two transitive deps (chrono via truck-stepio, rand via truck-geotrait)
      // link wasm-bindgen shims we never call on this path; satisfy the
      // imports with stubs that trap loudly if anything does call them.
      const bytes = fs.readFileSync(WASM);
      const mod = await WebAssembly.compile(bytes);
      const imports = { env: { cad_host_now_ms: () => performance.now() } };
      for (const im of WebAssembly.Module.imports(mod)) {
        if (im.module === 'env') continue;
        imports[im.module] ??= {};
        imports[im.module][im.name] = im.kind === 'function'
          ? (im.name.includes('describe') || im.name.includes('drop_ref') ? () => {} : () => { throw new Error(`wasm-bindgen shim called: ${im.name}`); })
          : undefined;
      }
      const instance = await WebAssembly.instantiate(mod, imports);
      inst = instance; mem = () => new Uint8Array(inst.exports.memory.buffer);
      return performance.now() - t0;
    },
    async build(treePath, { wantStep }) {
      const json = fs.readFileSync(treePath);
      const t0 = performance.now();
      const ptr = inst.exports.cad_alloc(json.length);
      mem().set(json, ptr);
      const ok = inst.exports.cad_build(ptr, json.length, kernelIndex, wantStep ? 1 : 0, 128);
      const wall = performance.now() - t0;
      const out = (w) => { const p = inst.exports.cad_out_ptr(w), n = inst.exports.cad_out_len(w); return Buffer.from(mem().slice(p, p + n)); };
      const rep = JSON.parse(out(0).toString('utf8'));
      if (!ok) { inst.exports.cad_free_all(); return { ok: false, error: rep.error, ms: rep.timings.build_ms || wall, wall }; }
      const stl = out(1); const step = wantStep ? out(2).toString('utf8') : null;
      inst.exports.cad_free_all();
      return { ok: true, ms: rep.timings.build_ms, wall, mesh: readStl(stl), faces: rep.faces, step: step && step.length ? step : null, report: rep };
    },
  };
}

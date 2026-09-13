// engine.js — the Rust engine over its raw C ABI, from bytes, anywhere
// (node, a Worker, a page). No wasm-bindgen; one host import for the clock.
//
//   const engine = await loadEngine(bytesOrResponse);
//   engine.resolve(treeJson)                 → resolved tree + sampled polylines (throws on error)
//   engine.build(treeJson, {kernel, step, res}) → {ok, report, mesh:{pos,idx,fid}, stl, step}
//   res (default 64): the implicit kernel's grid, and above 64 a finer chord
//   tolerance for the B-rep kernels (0.01 mm × 64 / res) — clearance uses 256
import { weld } from './mesh.js';

const KERNELS = { truck: 0, implicit: 1 };

export async function loadEngine(source) {
  let mod;
  if (source instanceof WebAssembly.Module) mod = source;
  else if (typeof Response !== 'undefined' && source instanceof Response) mod = await WebAssembly.compileStreaming(source).catch(async () => WebAssembly.compile(await source.arrayBuffer()));
  else mod = await WebAssembly.compile(source);
  // The engine hands over a panic message before it traps: wasm cannot unwind,
  // so a boolean truck refuses ("This shell is not oriented and closed") kills
  // the instance. Catching the trap and starting a fresh instance is what keeps
  // one bad part from taking the engine down for the rest of the session — and
  // the message is what turns an `unreachable` into something a person can act
  // on.
  let panicked = null;
  const imports = { env: { cad_host_now_ms: () => performance.now(), cad_host_panic: (ptr, len) => { try { panicked = new TextDecoder().decode(new Uint8Array(X.memory.buffer).slice(ptr, ptr + len)); } catch { panicked = 'the kernel panicked'; } } } };
  // Two transitive deps (chrono, rand) link wasm-bindgen shims this path never
  // calls; satisfy them with stubs that trap loudly if anything does.
  for (const im of WebAssembly.Module.imports(mod)) {
    if (im.module === 'env') continue;
    (imports[im.module] ??= {})[im.name] = im.name.includes('describe') || im.name.includes('drop_ref') ? () => {} : () => { throw new Error(`wasm-bindgen shim called: ${im.name}`); };
  }
  let inst = await WebAssembly.instantiate(mod, imports);
  let X = inst.exports;
  /// After a trap the instance's memory is undefined — every allocation and
  /// every output slot with it — so it is replaced rather than reused. The
  /// module is already compiled, so this is a cheap synchronous instantiation.
  const trapped = (e) => {
    const msg = panicked || (e && e.message) || 'the exact kernel trapped';
    panicked = null;
    inst = new WebAssembly.Instance(mod, imports);
    X = inst.exports;
    return msg.replace(/^panicked at [^\n]*\n/, '').split('\n')[0].trim();
  };
  const mem = () => new Uint8Array(X.memory.buffer);
  const out = (w) => { const p = X.cad_out_ptr(w), n = X.cad_out_len(w); return mem().slice(p, p + n); };
  const put = (json) => { const b = new TextEncoder().encode(json); const ptr = X.cad_alloc(b.length); mem().set(b, ptr); return [ptr, b.length]; };
  const text = (u8) => new TextDecoder().decode(u8);
  return {
    version: X.cad_version(),
    resolve(treeJson, tol = 0.01) {
      let r;
      try {
        const [ptr, n] = put(typeof treeJson === 'string' ? treeJson : JSON.stringify(treeJson));
        const ok = X.cad_resolve(ptr, n, Math.round(tol * 1e6));
        r = JSON.parse(text(out(0)));
        X.cad_free_all();
        if (!ok) { const e = new Error(r.error?.msg || 'resolve failed'); e.op = r.error?.op; throw e; }
      } catch (err) {
        if (!(err instanceof WebAssembly.RuntimeError)) throw err;
        const e = new Error(trapped(err)); e.op = 'resolve'; e.trapped = true; throw e;
      }
      return r;
    },
    build(treeJson, { kernel = 'truck', step = false, res = 64 } = {}) {
      const t0 = performance.now();
      let ok, report;
      try {
        const [ptr, n] = put(typeof treeJson === 'string' ? treeJson : JSON.stringify(treeJson));
        ok = X.cad_build(ptr, n, KERNELS[kernel] ?? 0, step ? 1 : 0, res);
        report = JSON.parse(text(out(0)));
      } catch (err) {
        if (!(err instanceof WebAssembly.RuntimeError)) throw err;
        // a trap is an error like any other now, and the next build works
        return { ok: false, report: { ok: false, kernel, error: { op: 'kernel', msg: `${kernel} could not do this: ${trapped(err)}`, trapped: true, occtWouldHelp: kernel === 'truck' } }, mesh: null, stl: null, step: null, ms: performance.now() - t0 };
      }
      const ms = performance.now() - t0;
      let mesh = null, stl = null, stepText = null;
      if (ok) {
        const pos = out(3), idx = out(4), fid = out(5);
        mesh = { pos: new Float32Array(pos.buffer, pos.byteOffset, pos.byteLength / 4), idx: new Uint32Array(idx.buffer, idx.byteOffset, idx.byteLength / 4), fid: fid.byteLength ? new Uint32Array(fid.buffer, fid.byteOffset, fid.byteLength / 4) : undefined };
        stl = out(1);
        if (step) stepText = text(out(2));
      }
      X.cad_free_all();
      return { ok: !!ok, report, mesh, stl, step: stepText, ms };
    },
  };
}

export { weld };

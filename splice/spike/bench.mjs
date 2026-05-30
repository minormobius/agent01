// bench.mjs — time the WASM-SIMD MSV kernel, for comparison against the native
// SSE2 build (`./msv_native <iters>`). Reports ms/iter.
import { readFileSync } from 'node:fs';
// args: [wasmPath] [iters] — either may be omitted; a numeric arg is iters.
const args = process.argv.slice(2);
const path = (args[0] && isNaN(Number(args[0]))) ? args.shift()
                                                 : new URL('./msv.wasm', import.meta.url).pathname;
const mod = new WebAssembly.Module(readFileSync(path));
const env = {};
for (const im of WebAssembly.Module.imports(mod)) env[im.name] = () => 0;
const ex = new WebAssembly.Instance(mod, { env }).exports;

const N = Number(args[0] || 2000);
let acc = 0;
ex.compute(); // warm up TurboFan
const t0 = process.hrtime.bigint();
for (let i = 0; i < N; i++) acc ^= ex.compute();
const t1 = process.hrtime.bigint();
const ms = Number(t1 - t0) / 1e6;
console.error(`wasm: ${N} iters in ${ms.toFixed(1)} ms = ${(ms / N).toFixed(3)} ms/iter (acc=${acc})`);

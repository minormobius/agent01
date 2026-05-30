// run.mjs — load the WASM build of the HMMER MSV kernel and print its checksum.
// Compare against ./msv_native (the real-SSE2 build) for bit-exact equivalence.
import { readFileSync } from 'node:fs';
const path = process.argv[2] || new URL('./msv.wasm', import.meta.url).pathname;
const mod = new WebAssembly.Module(readFileSync(path));
// The toolchain may emit a memset import for bss init; wasm memory is already
// zero-initialized, so a no-op stub is correct here.
const env = {};
for (const im of WebAssembly.Module.imports(mod)) env[im.name] = () => 0;
const ex = new WebAssembly.Instance(mod, { env }).exports;
console.log(ex.compute() | 0);

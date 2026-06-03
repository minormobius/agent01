// Shared WASM loader. Every page imports `K` (the kernel) from here.
// All heavy numerics live in Rust; this is just the bridge.
import init, * as kernel from '/pkg/imagej.js';

let _ready = null;
export function ready() {
  if (!_ready) _ready = init().then(() => kernel);
  return _ready;
}
export const K = kernel;

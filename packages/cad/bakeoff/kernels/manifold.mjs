// Manifold under node: load the vendored module, hand it to the shared kernel.
import path from 'node:path';
import fs from 'node:fs';
import Module from '../../vendor/manifold.js';
import { buildManifold } from '../../lib/manifold-kernel.js';

const here = path.dirname(new URL(import.meta.url).pathname);

export function make() {
  let wasm;
  return {
    id: 'manifold',
    exact: false,
    bytes: fs.statSync(path.join(here, '..', '..', 'vendor', 'manifold.wasm')).size,
    async init() { const t0 = performance.now(); wasm = await Module(); wasm.setup(); return performance.now() - t0; },
    async build(treePath, { resolved }) {
      const r = buildManifold(wasm, resolved);
      return r.ok ? { ...r, faces: [], step: null } : r;
    },
  };
}

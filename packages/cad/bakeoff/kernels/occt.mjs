// OCCT under node: the opencascade.js 1.1.1 ES module still calls `require`
// internally, so it gets a CommonJS shim; then the shared kernel does the work.
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { buildOcct } from '../../lib/occt-kernel.js';

const here = path.dirname(new URL(import.meta.url).pathname);
const DIST = path.join(here, '..', 'node_modules', 'opencascade.js', 'dist');

export function make() {
  let oc;
  return {
    id: 'occt',
    exact: true,
    bytes: fs.statSync(path.join(DIST, 'opencascade.wasm.wasm')).size,
    async init() {
      const t0 = performance.now();
      globalThis.require = createRequire(import.meta.url);
      globalThis.__dirname = DIST;
      const { default: opencascade } = await import(path.join(DIST, 'opencascade.wasm.js'));
      oc = await new opencascade({ wasmBinary: fs.readFileSync(path.join(DIST, 'opencascade.wasm.wasm')), locateFile: (f) => path.join(DIST, f), print: () => {}, printErr: () => {} });
      return performance.now() - t0;
    },
    async build(treePath, { resolved, wantStep, refFaces }) { return buildOcct(oc, resolved, { wantStep, refFaces }); },
  };
}

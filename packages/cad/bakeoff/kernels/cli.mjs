// Truck and the implicit spike through the native `cad` binary (process spawn
// included in the time). The WASM build is measured separately (wasm.mjs).
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { readStl } from '../../lib/mesh.js';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', '..');
const BIN = path.join(ROOT, 'engine', 'target', 'release', 'cad');

export function make(kernel, extra = []) {
  return {
    id: kernel,
    exact: kernel === 'truck',
    bytes: fs.existsSync(BIN) ? fs.statSync(BIN).size : 0,
    async init() { return 0; },
    async build(treePath, { wantStep, tmp }) {
      const stl = path.join(tmp, `${kernel}.stl`), step = path.join(tmp, `${kernel}.step`), json = path.join(tmp, `${kernel}.json`);
      const args = ['build', treePath, '--kernel', kernel, '--stl', stl, '--json', json, ...extra];
      if (wantStep && kernel === 'truck') args.push('--step', step);
      const t0 = performance.now();
      const r = spawnSync(BIN, args, { encoding: 'utf8', timeout: 600000 });
      const wall = performance.now() - t0;
      if (r.status === null) return { ok: false, error: { op: 'process', msg: `signal ${r.signal} (panic/abort)` }, ms: wall };
      let rep; try { rep = JSON.parse(fs.readFileSync(json, 'utf8')); } catch { return { ok: false, error: { op: 'process', msg: (r.stderr || '').slice(0, 300) }, ms: wall }; }
      if (!rep.ok) return { ok: false, error: rep.error, ms: rep.timings.build_ms, wall };
      return { ok: true, ms: rep.timings.build_ms, wall, mesh: readStl(fs.readFileSync(stl)), faces: rep.faces, step: wantStep && kernel === 'truck' && fs.existsSync(step) ? fs.readFileSync(step, 'utf8') : null, report: rep };
    },
  };
}

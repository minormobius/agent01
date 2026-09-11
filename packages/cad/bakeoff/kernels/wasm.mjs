// The Rust engine as WASM (Truck kernel) through lib/engine.js — the number a
// browser would see. Same code as `truck`, different host.
import fs from 'node:fs';
import path from 'node:path';
import { loadEngine } from '../../lib/engine.js';

const here = path.dirname(new URL(import.meta.url).pathname);
const WASM = path.join(here, '..', '..', 'cad.wasm');

export function make(kernel = 'truck', id = 'wasm') {
  let engine;
  return {
    id,
    exact: kernel === 'truck',
    bytes: fs.existsSync(WASM) ? fs.statSync(WASM).size : 0,
    async init() { const t0 = performance.now(); engine = await loadEngine(fs.readFileSync(WASM)); return performance.now() - t0; },
    async build(treePath, { wantStep }) {
      const json = fs.readFileSync(treePath, 'utf8');
      const r = engine.build(json, { kernel, step: wantStep, res: 128 });
      if (!r.ok) return { ok: false, error: r.report.error, ms: r.report.timings?.build_ms || r.ms };
      return { ok: true, ms: r.report.timings.build_ms, mesh: r.mesh, faces: r.report.faces, step: r.step && r.step.length ? r.step : null, report: r.report };
    },
  };
}

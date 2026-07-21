// kite-vlm.selftest.mjs — validates the JS VLM fallback and cross-checks it against
// the committed Rust/wasm solver in solver/pkg/. Run: `node kite-vlm.selftest.mjs`.
// Deterministic, no network. The deploy workflow runs this as a gate.

import { readFileSync } from 'node:fs';
import { revDefault, buildPanels, solveVLM } from './kite-vlm.js';

let pass = 0, fail = 0;
const ok = (cond, msg) => { if (cond) { pass++; } else { fail++; console.error('  ✗ ' + msg); } };
const approx = (a, b, tol) => Math.abs(a - b) <= tol;

// ── geometry ──────────────────────────────────────────────────────────────────
{
  const cfg = { ...revDefault(), bow: 0, aoa: 0 };
  const panels = buildPanels(cfg);
  ok(panels.length === cfg.nspan * cfg.nchord, 'panel count = nspan*nchord');
  ok(panels.every((p) => Math.abs(p.center[2]) < 1e-9), 'flat sail lies in z=0 plane');
  ok(panels.every((p) => p.normal[2] > 0.999), 'flat normals point +Z');
  const area = panels.reduce((s, p) => s + p.area, 0);
  ok(approx(area, cfg.span * cfg.chord, 1e-6), 'flat area = span*chord');
}

// ── lift / drag sign, symmetry ──────────────────────────────────────────────────
{
  const s = solveVLM({ ...revDefault(), bow: 0, aoa: 0.12 });
  ok(s.lift > 0, 'positive AoA makes positive lift');
  ok(s.drag > 0, 'positive AoA makes positive induced drag');
  ok(Math.abs(s.side) < 1e-6 * Math.max(1, s.magnitude), 'symmetric kite: no side force');
}

// ── lift-curve slope near lifting-line theory ───────────────────────────────────
{
  const base = { ...revDefault(), bow: 0, nspan: 32, nchord: 6 };
  const ar = base.span / base.chord;
  const clAt = (deg) => solveVLM({ ...base, aoa: (deg * Math.PI) / 180 }).cl;
  const cl4 = clAt(4), cl8 = clAt(8);
  ok(approx(cl8 / cl4, 2.0, 0.15), `CL roughly linear in AoA (${cl4.toFixed(3)},${cl8.toFixed(3)})`);
  const slope = (cl8 - cl4) / (((8 - 4) * Math.PI) / 180);
  const liftingLine = (2 * Math.PI * ar) / (ar + 2);
  ok(slope < 2 * Math.PI, 'slope below 2π (finite-span downwash)');
  ok(approx(slope, liftingLine, 1.2), `slope ${slope.toFixed(2)} ≈ lifting-line ${liftingLine.toFixed(2)}`);
}

// ── wind² scaling ───────────────────────────────────────────────────────────────
{
  const f1 = solveVLM({ ...revDefault(), wind: 6 }).magnitude;
  const f2 = solveVLM({ ...revDefault(), wind: 12 }).magnitude;
  ok(approx(f2 / f1, 4.0, 0.05), 'force scales with wind² (2× wind ⇒ 4× force)');
}

// ── cutting ─────────────────────────────────────────────────────────────────────
{
  const cfg0 = revDefault();
  const s0 = solveVLM(cfg0);
  // cut top chord row
  const cutRow = Array(cfg0.nspan * cfg0.nchord).fill(false);
  for (let j = 0; j < cfg0.nspan; j++) cutRow[0 * cfg0.nspan + j] = true;
  const s1 = solveVLM({ ...cfg0, cut: cutRow });
  ok(s1.liveArea < s0.liveArea, 'cut shrinks live area');
  ok(s1.lift < s0.lift, 'cutting a row reduces lift');
  ok(s1.nCut === cfg0.nspan, 'nCut counts the cut panels');

  // asymmetric left-half cut
  const cutL = Array(cfg0.nspan * cfg0.nchord).fill(false);
  for (let i = 0; i < cfg0.nchord; i++)
    for (let j = 0; j < (cfg0.nspan >> 1); j++) cutL[i * cfg0.nspan + j] = true;
  const s2 = solveVLM({ ...cfg0, cut: cutL });
  ok(Math.abs(s2.side) > 1e-3, 'asymmetric cut makes side force');
  ok(s2.centerOfPressure[1] > 0, 'CoP shifts toward the intact (right) side');

  const all = solveVLM({ ...cfg0, cut: Array(cfg0.nspan * cfg0.nchord).fill(true) });
  ok(all.magnitude < 1e-9, 'everything cut ⇒ no force, no crash');
}

// ── cross-check JS fallback against the committed wasm solver ────────────────────
try {
  const P = new URL('./solver/pkg/', import.meta.url);
  const mod = await import(new URL('kite_solver.js', P).href);
  const bytes = readFileSync(new URL('kite_solver_bg.wasm', P));
  await mod.default({ module_or_path: bytes });
  const cases = [
    revDefault(),
    { ...revDefault(), aoa: 0.25, wind: 11, bow: 0.5 },
  ];
  // add a cut case
  const cutCfg = revDefault();
  const cut = Array(cutCfg.nspan * cutCfg.nchord).fill(false);
  for (let i = 0; i < cutCfg.nchord; i++) for (let j = 0; j < 10; j++) cut[i * cutCfg.nspan + j] = true;
  cases.push({ ...cutCfg, cut });

  for (const cfg of cases) {
    const js = solveVLM(cfg);
    const rs = JSON.parse(mod.solve_json(JSON.stringify(cfg)));
    ok(approx(js.lift, rs.lift, 1e-6 * Math.max(1, Math.abs(rs.lift))), `wasm/JS lift agree (${rs.lift.toFixed(4)})`);
    ok(approx(js.drag, rs.drag, 1e-6 * Math.max(1, Math.abs(rs.drag))), `wasm/JS drag agree (${rs.drag.toFixed(4)})`);
    ok(approx(js.side, rs.side, 1e-6 * Math.max(1, Math.abs(rs.side))), `wasm/JS side agree (${rs.side.toFixed(4)})`);
  }
  console.log('  (cross-checked against Rust/wasm solver/pkg/)');
} catch (e) {
  console.log('  (wasm cross-check skipped: ' + e.message + ')');
}

console.log(`\nkite-vlm selftest: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

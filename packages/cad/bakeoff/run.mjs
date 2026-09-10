// The bake-off. Every kernel adapter builds every bench part; the table is
// wall time (cold = first build after init, warm = best of the next two),
// module size, invariants against closed form where one exists and against
// the other kernels where none does, STEP fidelity (OCCT reads it back and
// the volume must match), face naming, and failures with their kind.
//
//   node run.mjs [--kernels truck,implicit,manifold,occt,wasm] [--parts gear,plate] [--repeat 3]
//
// Writes results.json and RESULTS.md next to this file.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { compute, weld } from './invariants.mjs';

const here = path.dirname(new URL(import.meta.url).pathname);
const ROOT = path.resolve(here, '..');
const BIN = path.join(ROOT, 'engine', 'target', 'release', 'cad');
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const kernelNames = opt('--kernels', 'truck,wasm,implicit,manifold,occt').split(',');
const partNames = opt('--parts', 'gear,arbor,plate,escape,case,case-fillet').split(',');
const repeat = Number(opt('--repeat', '3'));
const expected = JSON.parse(fs.readFileSync(path.join(ROOT, 'bench', 'expected.json'), 'utf8'));

function evalExpr(src, env) {
  // tiny, trusted: expected.json is ours
  const f = new Function(...Object.keys(env), 'pi', `return (${src.replace(/\^/g, '**')});`);
  return f(...Object.values(env), Math.PI);
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cad-bakeoff-'));
const kernels = [];
for (const k of kernelNames) {
  const mod = await import(`./kernels/${k === 'truck' || k === 'implicit' ? 'cli' : k}.mjs`);
  kernels.push(k === 'truck' ? mod.make('truck') : k === 'implicit' ? mod.make('implicit', ['--res', '128']) : mod.make());
}
// STEP read-back through the engine's own reader (native, `--features stepin`):
// a second implementation parsing the file is the fidelity check.
function stepMeasure(stepText) {
  const f = path.join(tmp, `rb-${Date.now()}.step`);
  fs.writeFileSync(f, stepText);
  const t0 = performance.now();
  // the reader is ruststep; it has been seen to take minutes and gigabytes on a
  // 500-face spline-heavy solid, so a read-back that does not finish in two
  // minutes is recorded as exactly that
  const r = spawnSync(BIN, ['stepmeasure', f, '--tol', '0.01'], { encoding: 'utf8', maxBuffer: 1 << 26, timeout: 120000 });
  const ms = performance.now() - t0;
  if (r.status === null) return { ok: false, msg: 'timeout after 120 s', ms };
  if (r.status !== 0) return { ok: false, msg: (r.stderr || '').trim().slice(0, 200), ms };
  const inv = JSON.parse(r.stdout);
  return { ok: true, volume: inv.volume, euler: inv.euler, watertight: inv.watertight, shells: inv.shells, ms };
}
// Reference faces for selectors (fillet edges): the tree with its fillet/chamfer/shell
// ops removed, built by truck, gives every named face's centroid and normal.
function refFacesFor(tree, treePath) {
  if (!tree.features.some((f) => ['fillet', 'chamfer', 'shell'].includes(f.op))) return null;
  const stripped = { ...tree, features: tree.features.filter((f) => !['fillet', 'chamfer', 'shell'].includes(f.op)) };
  const p = path.join(tmp, path.basename(treePath, '.json') + '-nofillet.json');
  fs.writeFileSync(p, JSON.stringify(stripped));
  const j = path.join(tmp, 'ref.json');
  const r = spawnSync(BIN, ['build', p, '--json', j], { encoding: 'utf8' });
  if (r.status !== 0) return null;
  return JSON.parse(fs.readFileSync(j, 'utf8')).faces;
}

const results = { date: new Date().toISOString(), node: process.version, cpu: os.cpus()[0]?.model, kernels: {}, parts: {} };
for (const k of kernels) {
  const initMs = await k.init();
  results.kernels[k.id] = { init_ms: initMs, bytes: k.bytes, exact: k.exact };
  console.error(`${k.id}: init ${initMs.toFixed(0)} ms, ${(k.bytes / 1e6).toFixed(1)} MB`);
}

for (const part of partNames) {
  const treePath = path.join(ROOT, 'bench', part + '.json');
  const tree = JSON.parse(fs.readFileSync(treePath, 'utf8'));
  const resolvedRaw = spawnSync(BIN, ['resolve', treePath, '--tol', '0.01'], { encoding: 'utf8', maxBuffer: 1 << 28 });
  if (resolvedRaw.status !== 0) { console.error(`resolve failed for ${part}: ${resolvedRaw.stderr}`); continue; }
  const resolved = JSON.parse(resolvedRaw.stdout);
  const env = resolved.resolved.params;
  const exp = expected[part] || {};
  const expVol = exp.volume ? evalExpr(exp.volume, env) : null;
  const row = { expected: { volume: expVol, euler: exp.euler ?? null, tol: exp.tol ?? 0.01 }, kernels: {} };
  const refFaces = refFacesFor(tree, treePath);
  for (const k of kernels) {
    const runs = [];
    for (let i = 0; i < repeat; i++) {
      const r = await k.build(treePath, { resolved, wantStep: i === 0, tmp, refFaces });
      runs.push(r);
      if (!r.ok) break;
    }
    const first = runs[0];
    const out = { ok: first.ok, cold_ms: first.ms, warm_ms: runs.length > 1 ? Math.min(...runs.slice(1).map((r) => r.ms)) : null, error: first.error || null };
    if (first.ok) {
      const welded = weld(first.mesh.pos, first.mesh.tris, 1e-5);
      out.invariants = compute(welded);
      out.faces = first.faces?.length ?? 0;
      out.named = first.faces ? new Set(first.faces.flatMap((f) => f.names).filter((n) => !/^face\[/.test(n))).size : 0;
      out.step_bytes = first.step ? first.step.length : 0;
      if (first.step) out.step_readback = stepMeasure(first.step);
      if (first.kernelVolume !== undefined) out.kernel_volume = first.kernelVolume;
    }
    row.kernels[k.id] = out;
    const inv = out.invariants;
    console.error(`${part.padEnd(12)} ${k.id.padEnd(9)} ${out.ok ? `ok cold ${out.cold_ms.toFixed(0)}ms warm ${out.warm_ms?.toFixed(0) ?? '-'}ms vol ${inv.volume.toFixed(3)} χ=${inv.euler} wt=${inv.watertight} names=${out.named} step=${out.step_bytes}${out.step_readback ? ` rb=${out.step_readback.ok ? out.step_readback.volume.toFixed(3) : 'FAIL'}` : ''}` : `FAIL ${out.error.op}: ${out.error.msg}${out.error.unsupported ? ' [unsupported]' : ''}`}`);
  }
  // reference volume: closed form, else median of exact kernels' volumes, else median of all
  const vols = Object.entries(row.kernels).filter(([, v]) => v.ok).map(([id, v]) => [id, v.invariants.volume]);
  const exactVols = vols.filter(([id]) => results.kernels[id].exact).map(([, v]) => v);
  const med = (a) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : null; };
  row.reference = { volume: expVol ?? med(exactVols) ?? med(vols.map(([, v]) => v)), source: expVol ? 'closed form' : exactVols.length ? 'median of exact kernels' : 'median of kernels' };
  for (const v of Object.values(row.kernels)) if (v.ok && row.reference.volume) v.volume_err = Math.abs(v.invariants.volume - row.reference.volume) / Math.abs(row.reference.volume);
  results.parts[part] = row;
}

fs.writeFileSync(path.join(here, 'results.json'), JSON.stringify(results, null, 1));

// ── RESULTS.md ──────────────────────────────────────────────────────────────
const ks = Object.keys(results.kernels);
const fmt = (x, d = 0) => (x === null || x === undefined ? '–' : Number(x).toFixed(d));
const pct = (x) => (x === null || x === undefined ? '–' : `${(x * 100).toFixed(x < 0.001 ? 3 : 2)}%`);
let md = `# Kernel bake-off — results\n\nGenerated by \`node packages/cad/bakeoff/run.mjs\` on ${results.date.slice(0, 10)}, node ${results.node}, ${results.cpu ?? 'unknown CPU'}. Numbers are one machine, one run; the shape of the table is the finding, not the third digit.\n\n`;
md += `## Kernels\n\n| kernel | what | init | module |\n|---|---|---|---|\n`;
const what = { truck: 'Rust B-rep (native binary)', wasm: 'Rust B-rep, Truck, as WASM under node', implicit: 'SDF + surface nets, native', manifold: 'mesh booleans, WASM', occt: 'OCCT 7.4 B-rep, WASM' };
for (const k of ks) md += `| ${k} | ${what[k] ?? ''} | ${fmt(results.kernels[k].init_ms)} ms | ${(results.kernels[k].bytes / 1e6).toFixed(1)} MB |\n`;
md += `\n## Build time (ms) — cold / warm\n\n| part | ${ks.join(' | ')} |\n|---|${ks.map(() => '---').join('|')}|\n`;
for (const [p, row] of Object.entries(results.parts)) md += `| ${p} | ${ks.map((k) => { const v = row.kernels[k]; return v?.ok ? `${fmt(v.cold_ms)} / ${fmt(v.warm_ms)}` : v?.error?.unsupported ? 'unsupported' : 'FAIL'; }).join(' | ')} |\n`;
md += `\n## Volume error against the reference\n\nReference is the closed form where one exists, otherwise the median of the exact kernels.\n\n| part | reference | ${ks.join(' | ')} |\n|---|---|${ks.map(() => '---').join('|')}|\n`;
for (const [p, row] of Object.entries(results.parts)) md += `| ${p} | ${fmt(row.reference.volume, 3)} (${row.reference.source}) | ${ks.map((k) => { const v = row.kernels[k]; return v?.ok ? pct(v.volume_err) : '–'; }).join(' | ')} |\n`;
md += `\n## Topology — Euler characteristic (expected) · watertight · open/flipped edges\n\n| part | χ expected | ${ks.join(' | ')} |\n|---|---|${ks.map(() => '---').join('|')}|\n`;
for (const [p, row] of Object.entries(results.parts)) md += `| ${p} | ${row.expected.euler ?? '–'} | ${ks.map((k) => { const v = row.kernels[k]; if (!v?.ok) return '–'; const i = v.invariants; return `χ=${i.euler} ${i.watertight ? '✓' : `✗ ${i.open_edges}/${i.flipped_edges}`}`; }).join(' | ')} |\n`;
md += `\n## Named faces · STEP\n\nNamed = distinct topology names the kernel attached to faces. STEP = bytes written; rb = the engine's own STEP reader (ruststep) read it back and the volume error against the kernel's mesh.\n\n| part | ${ks.join(' | ')} |\n|---|${ks.map(() => '---').join('|')}|\n`;
for (const [p, row] of Object.entries(results.parts)) md += `| ${p} | ${ks.map((k) => { const v = row.kernels[k]; if (!v?.ok) return '–'; let s = `${v.named} names`; if (v.step_bytes) { s += `, STEP ${(v.step_bytes / 1e3).toFixed(0)} KB`; if (v.step_readback) s += v.step_readback.ok ? `, rb ${pct(Math.abs(v.step_readback.volume - v.invariants.volume) / Math.abs(v.invariants.volume))}` : ', rb FAIL'; } return s; }).join(' | ')} |\n`;
md += `\n## Failures\n\n`;
let anyFail = false;
for (const [p, row] of Object.entries(results.parts)) for (const k of ks) { const v = row.kernels[k]; if (v && !v.ok) { anyFail = true; md += `- **${p} / ${k}** — ${v.error.op}: ${v.error.msg}${v.error.unsupported ? ' *(unsupported, not a failure on this input)*' : ''}\n`; } }
if (!anyFail) md += 'none\n';
fs.writeFileSync(path.join(here, 'RESULTS.md'), md);
console.error(`\nwrote ${path.join(here, 'RESULTS.md')}`);

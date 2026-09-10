// cad.selftest.mjs — drives the committed WASM engine from bytes under node
// (no wasm-bindgen, no browser) and asserts geometric invariants, not mesh
// bits: the gear's volume against its profile area, the plate's against its
// closed form, Euler characteristics, watertightness, and that topology
// names come out. Run before touching engine/ or the ABI.
//
//   node packages/cad/cad.selftest.mjs
import fs from 'node:fs';
import path from 'node:path';

const here = path.dirname(new URL(import.meta.url).pathname);
const WASM = path.join(here, 'cad.wasm');
const bench = (n) => fs.readFileSync(path.join(here, 'bench', n), 'utf8');

const bytes = fs.readFileSync(WASM);
const mod = await WebAssembly.compile(bytes);
const imports = { env: { cad_host_now_ms: () => performance.now() } };
for (const im of WebAssembly.Module.imports(mod)) {
  if (im.module === 'env') continue;
  (imports[im.module] ??= {})[im.name] = im.name.includes('describe') || im.name.includes('drop_ref') ? () => {} : () => { throw new Error(`shim called: ${im.name}`); };
}
const inst = await WebAssembly.instantiate(mod, imports);
const X = inst.exports;
const mem = () => new Uint8Array(X.memory.buffer);
const out = (w) => { const p = X.cad_out_ptr(w), n = X.cad_out_len(w); return Buffer.from(mem().slice(p, p + n)); };
function build(json, { kernel = 0, step = false, res = 64 } = {}) {
  const b = Buffer.from(json);
  const ptr = X.cad_alloc(b.length);
  mem().set(b, ptr);
  const t0 = performance.now();
  const ok = X.cad_build(ptr, b.length, kernel, step ? 1 : 0, res);
  const ms = performance.now() - t0;
  const rep = JSON.parse(out(0).toString('utf8'));
  const stl = out(1), stepText = step ? out(2).toString('utf8') : '';
  X.cad_free_all();
  return { ok: !!ok, rep, stl, stepText, ms };
}

let fails = 0;
const check = (cond, msg) => { console.log(`${cond ? '✓' : '✗'} ${msg}`); if (!cond) fails++; };
const near = (a, b, rel) => Math.abs(a - b) <= rel * Math.abs(b);

check(X.cad_version() === 1, `ABI version 1`);

// 1. a bare gear: volume = profile area × face width, genus 1 (bore), watertight, named flanks
{
  const tree = JSON.stringify({ units: 'mm', params: { m: 1, z: 24, b: 3, bore: 4 }, features: [{ op: 'gear', id: 'g1', m: 'm', z: 'z', alpha: 20, b: 'b', bore: 'bore' }] });
  const r = build(tree, { step: true });
  check(r.ok, `gear builds (${r.ms.toFixed(0)} ms)`);
  const inv = r.rep.invariants;
  const areaOfProfile = 431.2535; // from `cad check`, the even-odd region area; the sampled polyline underestimates the curved tooth slightly
  check(near(inv.volume, areaOfProfile * 3, 0.005), `gear volume ${inv.volume.toFixed(2)} ≈ area×b ${(areaOfProfile * 3).toFixed(2)}`);
  check(inv.euler === 0, `gear χ = ${inv.euler} (one bore → 0)`);
  check(inv.watertight, `gear watertight (open ${inv.open_edges}, flipped ${inv.flipped_edges})`);
  const names = new Set(r.rep.faces.flatMap((f) => f.names));
  check(names.has('g1.tooth[0].flank.r.0') && names.has('g1.bore[0]') && names.has('g1.end'), `gear faces carry names (${names.size} names)`);
  check(r.stl.readUInt32LE(80) === inv.tris, `STL carries ${inv.tris} triangles`);
  check(r.stepText.startsWith('ISO-10303-21;') && r.stepText.includes('END-ISO-10303-21;'), `STEP written (${(r.stepText.length / 1e3).toFixed(0)} KB)`);
  check(r.rep.gears[0].spec.r_pitch === 12, `gear meta: pitch radius 12`);
}

// 2. the plate: closed-form volume, χ = 2 − 2·holes
{
  const tree = bench('plate.json');
  const r = build(tree);
  check(r.ok, `plate builds (${r.ms.toFixed(0)} ms)`);
  const p = JSON.parse(tree).params;
  const vol = Math.PI * p.R ** 2 * p.t - Math.PI * p.r_centre ** 2 * p.t - p.n_pivots * Math.PI * p.r_pivot ** 2 * p.t - p.n_pillars * Math.PI * p.r_pillar ** 2 * p.t;
  const inv = r.rep.invariants;
  check(near(inv.volume, vol, 0.002), `plate volume ${inv.volume.toFixed(3)} vs closed form ${vol.toFixed(3)}`);
  check(inv.euler === -16, `plate χ = ${inv.euler} (nine holes → −16)`);
  check(inv.watertight, `plate watertight`);
  const top = r.rep.faces.find((f) => f.names.includes('plate.end'));
  check(top && Math.abs(top.normal[2] - 1) < 1e-9 && near(top.area, vol / p.t, 0.002), `plate.end is the +z face with area ${top?.area.toFixed(3)}`);
}

// 3. a revolve touching its axis (the case), closed form
{
  const tree = bench('case.json');
  const r = build(tree);
  check(r.ok, `case builds (${r.ms.toFixed(0)} ms)`);
  const p = JSON.parse(tree).params;
  const vol = Math.PI * p.R ** 2 * p.floor + Math.PI * (p.R ** 2 - (p.R - p.wall) ** 2) * (p.H - p.floor);
  const inv = r.rep.invariants;
  check(near(inv.volume, vol, 0.002), `case volume ${inv.volume.toFixed(3)} vs closed form ${vol.toFixed(3)}`);
  check(inv.euler === 2 && inv.watertight, `case χ = ${inv.euler}, watertight ${inv.watertight}`);
}

// 4. the implicit kernel agrees on the plate within its grid resolution
{
  const r = build(bench('plate.json'), { kernel: 1, res: 96 });
  check(r.ok, `plate builds on the implicit kernel (${r.ms.toFixed(0)} ms)`);
  check(near(r.rep.invariants.volume, 1877.389, 0.02), `implicit plate volume ${r.rep.invariants.volume.toFixed(2)} within 2%`);
}

// 5. errors are typed and never trap
{
  const r = build(JSON.stringify({ features: [{ op: 'extrude', id: 'x', profile: 'nope', depth: 1 }] }));
  check(!r.ok && r.rep.error.op === 'resolve' && /unknown sketch/.test(r.rep.error.msg), `dangling selector is a resolve error: ${r.rep.error?.msg}`);
  const f = build(JSON.stringify({ features: [{ op: 'sketch', id: 's', loops: [{ rect: { c: [0, 0], w: 2, h: 2 } }] }, { op: 'extrude', id: 'e', profile: 's', depth: 1 }, { op: 'fillet', id: 'f', edges: 'e.end', r: 0.1 }] }));
  check(!f.ok && f.rep.error.unsupported === true, `fillet is reported unsupported, not failed: ${f.rep.error?.msg}`);
}

console.log(fails ? `\n✗ ${fails} failing` : '\n✓ cad.selftest passed');
process.exit(fails ? 1 : 0);

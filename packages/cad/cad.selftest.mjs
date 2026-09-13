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
// the engine hands a panic message over before it traps — wasm cannot unwind
let panicked = null;
const imports = { env: { cad_host_now_ms: () => performance.now(), cad_host_panic: (p, n) => { panicked = Buffer.from(new Uint8Array(X.memory.buffer).slice(p, p + n)).toString(); } } };
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
  // …and a panic inside the kernel says what it was before the trap: wasm has
  // no unwinding, so truck refusing a boolean ("this shell is not oriented and
  // closed") used to reach the host as a bare `unreachable` with nothing to
  // read. The host catches the trap and starts a fresh instance; here, at the
  // raw ABI, we only prove the message comes over.
  panicked = null;
  const cross = JSON.stringify({ units: 'mm', features: [
    { op: 'sketch', id: 'f', loops: [{ name: 'outline', rect: { c: [0, 0], w: 40, h: 20 } }] },
    { op: 'extrude', id: 'body', profile: ['f'], depth: 6 },
    { op: 'sketch', id: 'b', plane: 'XZ', loops: [{ name: 'bore', circle: { c: [0, 3], r: 3 } }] },
    { op: 'extrude', id: 'cross', profile: ['b'], mode: 'cut', through: true },
  ] });
  let trap = null;
  try { build(cross); } catch (e) { trap = e; }
  check(trap instanceof WebAssembly.RuntimeError && /not oriented and closed/.test(panicked || ''), `a kernel panic reaches the host as a message, not a bare trap: ${(panicked || '').split('\n').pop()?.slice(0, 60)}`);
}

// 6. a boolean keeps the names: the root of the worst bug class here. A cut
//    threw every face name away, so a body with one cut in it could be neither
//    a placement target nor an argument to measure.
{
  const cut = (extra = []) => JSON.stringify({ units: 'mm', features: [
    { op: 'sketch', id: 'f', loops: [{ name: 'outline', rect: { c: [0, 0], w: 60, h: 30 } }] },
    { op: 'extrude', id: 'carrier', profile: ['f'], depth: 8 },
    { op: 'sketch', id: 'sf', loops: [{ name: 'slot', rect: { c: [0, 0], w: 20, h: 10 } }, { name: 'pivot', circle: { c: [22, 0], r: 3 } }] },
    { op: 'extrude', id: 'slot', profile: ['sf'], mode: 'cut', through: true },
    ...extra,
  ] });
  const r = build(cut());
  check(r.ok && near(r.rep.invariants.volume, 14400 - 1600 - Math.PI * 9 * 8, 0.01), `a cut body builds: ${r.rep.invariants.volume.toFixed(2)} mm³, χ ${r.rep.invariants.euler}, watertight ${r.rep.invariants.watertight}`);
  const names = r.rep.faces.map((f) => f.names);
  const flat = names.flat();
  check(!flat.some((n) => /^face\[/.test(n)) && names.every((n) => n.length), `every face is named through the boolean (${names.length} faces, ${new Set(flat).size} names)`);
  check(flat.includes('carrier.outline[0]') && flat.includes('carrier.end') && flat.includes('carrier.start'), 'the body\'s own faces keep the names its extrude gave them');
  check(flat.some((n) => n === 'slot.slot[1]') && flat.some((n) => n === 'slot.pivot[0]'), 'and the faces the cut made carry the tool\'s loop names');
  const bore = r.rep.faces.find((f) => f.names.includes('slot.pivot[0]'));
  check(bore?.geom?.kind === 'cylinder' && near(bore.geom.radius, 3, 1e-6), `a cut face carries its geometry too, so measure can read it: ⌀${(bore?.geom?.radius * 2).toFixed(3)}`);
  // the escape hatch, for when the name you want is not the one the sweep gave
  const named = build(cut([{ op: 'name', id: 'n', face: 'slot.pivot[0]', as: 'pinBore' }]));
  check(named.ok && named.rep.faces.some((f) => f.names.includes('pinBore') && f.names.includes('slot.pivot[0]')), '`name` adds an alias to a face that already has one');
  const bad = build(cut([{ op: 'name', id: 'n', face: 'nope', as: 'x' }]));
  check(!bad.ok && /no face is called `nope`/.test(bad.rep.error?.msg || ''), `naming a face that does not exist says so: ${bad.rep.error?.msg?.slice(0, 48)}`);
  // a tool nowhere near the body is a design error, and now reads as one
  const miss = JSON.stringify({ units: 'mm', features: [
    { op: 'sketch', id: 'f', loops: [{ rect: { c: [0, 0], w: 60, h: 30 } }] },
    { op: 'extrude', id: 'carrier', profile: ['f'], depth: 8 },
    { op: 'sketch', id: 'sf', loops: [{ rect: { c: [200, 0], w: 20, h: 10 } }] },
    { op: 'extrude', id: 'slot', profile: ['sf'], mode: 'cut', depth: 20 },
  ] });
  const m = build(miss);
  check(!m.ok && /does not meet the body/.test(m.rep.error?.msg || '') && /along x/.test(m.rep.error?.msg || ''), `a cut tool that misses names the gap and the axis: ${m.rep.error?.msg?.slice(0, 72)}…`);
  // from/to: both numbers along the sketch plane's own normal, so an extrude
  // never depends on remembering which way a plane faces
  const ft = build(JSON.stringify({ units: 'mm', features: [
    { op: 'sketch', id: 'f', plane: 'XZ', loops: [{ rect: { c: [0, 0], w: 40, h: 20 } }] },
    { op: 'extrude', id: 'body', profile: ['f'], from: 2, to: 9 },
  ] }));
  const bb = ft.rep?.invariants?.bbox;
  check(ft.ok && near(ft.rep.invariants.volume, 40 * 20 * 7, 1e-9) && near(bb[0][1], -9, 1e-9) && near(bb[1][1], -2, 1e-9), `from/to measure along the plane's normal: an XZ sketch from 2 to 9 is 7 thick, y ${bb?.[0][1]}…${bb?.[1][1]} (the XZ normal is −Y)`);
  const nod = build(JSON.stringify({ units: 'mm', features: [
    { op: 'sketch', id: 'f', loops: [{ rect: { c: [0, 0], w: 4, h: 4 } }] },
    { op: 'extrude', id: 'body', profile: ['f'] },
  ] }));
  check(!nod.ok && /needs `depth`, or `from`\/`to`, or `through: true`/.test(nod.rep.error?.msg || ''), 'an extrude with no thickness at all says which three ways there are to give one');
}

console.log(fails ? `\n✗ ${fails} failing` : '\n✓ cad.selftest passed');
process.exit(fails ? 1 : 0);

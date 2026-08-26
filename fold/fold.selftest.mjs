// fold.selftest.mjs — runs under node, no browser. `preflight` runs this.
//
// Guards the seam that actually breaks: the hand-written ABI between
// engine/src/lib.rs and engine.js. A field added on one side and not the other
// produces plausible-looking garbage rather than an error, so every check here
// asserts a number the physics has to produce, not just that a call returned.
//
//   node fold.selftest.mjs

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
let failures = 0;
let checks = 0;

function ok(cond, what, detail = '') {
  checks++;
  if (!cond) {
    failures++;
    console.error(`  FAIL  ${what}${detail ? `  — ${detail}` : ''}`);
  } else {
    console.log(`  ok    ${what}${detail ? `  ${detail}` : ''}`);
  }
}

const wasm = readFileSync(join(here, 'fold.wasm'));
const { instance } = await WebAssembly.instantiate(wasm, {});
const X = instance.exports;
const proteins = JSON.parse(readFileSync(join(here, 'proteins.json'), 'utf8'));

console.log('fold selftest');

// ---------------------------------------------------------------- ABI shape
// These must match the constants in engine.js. Kept literal on purpose: reading
// them from engine.js would make the test agree with itself.
console.log('\nABI');
ok(X.layout(0) === 8, 'vertex stride is 8', `got ${X.layout(0)}`);
ok(X.layout(1) === 4, 'wire stride is 4', `got ${X.layout(1)}`);
ok(X.layout(2) === 4, 'abi version is 4', `got ${X.layout(2)}`);
ok(X.layout(3) === 9, 'stat count is 9', `got ${X.layout(3)}`);
for (const fn of [
  'load', 'build', 'reset', 'set_param', 'step', 'stat', 'diverged',
  'pos_ptr', 'native_ptr', 'resq_ptr', 'formed_ptr', 'contacts_ptr', 'n_contacts',
  'mesh', 'mesh_native', 'indices', 'mesh_ptr', 'ghost_ptr', 'index_ptr',
  'wires', 'wire_ptr', 'native_radius', 'superpose',
]) {
  ok(typeof X[fn] === 'function', `exports ${fn}`);
}

// ---------------------------------------------------------------- data
console.log('\nproteins.json');
ok(proteins.length >= 5, `${proteins.length} entries`);
for (const p of proteins) {
  const good =
    p.ca.length === 3 * p.n &&
    p.seq.length === p.n &&
    p.ss.length === p.n &&
    p.ca.every(Number.isFinite);
  ok(good, `${p.id} is self-consistent`, `n=${p.n}`);
}
// Bond lengths must look like a real C-alpha trace, or the reference geometry
// the whole model is built from is nonsense.
for (const p of proteins) {
  let bad = 0;
  for (let i = 0; i < p.n - 1; i++) {
    const d = Math.hypot(
      p.ca[3 * i + 3] - p.ca[3 * i], p.ca[3 * i + 4] - p.ca[3 * i + 1], p.ca[3 * i + 5] - p.ca[3 * i + 2]
    );
    if (d < 3.5 || d > 4.2) bad++;
  }
  // a chain break in a crystal structure is legitimate; a majority of them is not
  ok(bad <= Math.max(1, p.n * 0.05), `${p.id} C-alpha spacing is ~3.8 A`, `${bad} outliers`);
}

// ---------------------------------------------------------------- mechanics
console.log('\nengine');
const villin = proteins.find((p) => p.id === '2F4K');
const n = villin.n;
const natPtr = X.load(n);
new Float32Array(X.memory.buffer, natPtr, 3 * n).set(villin.ca);
const nc = X.build(8.0);
ok(nc > n && nc < n * n, `built ${nc} native contacts`);
ok(X.native_radius() > 5 && X.native_radius() < 40, `native radius ${X.native_radius().toFixed(1)} A`);

// Starting from the native structure, Q must be ~1 and the energy negative:
// every contact is at the bottom of its well.
X.reset(1, 1);
ok(X.stat(0) > 0.97, `Q from native is ~1`, `Q=${X.stat(0).toFixed(3)}`);
ok(X.stat(8) < 0.01, `RMSD from native is ~0`, `${X.stat(8).toFixed(4)} A`);
ok(X.stat(1) < 0, `energy at native is negative`, `E=${X.stat(1).toFixed(1)}`);

// From a coil, Q must be low and RMSD large.
X.reset(4, 0);
ok(X.stat(0) < 0.35, `Q from a coil is low`, `Q=${X.stat(0).toFixed(3)}`);
ok(X.stat(8) > 4, `RMSD from a coil is large`, `${X.stat(8).toFixed(1)} A`);

// ...and it must actually fold. This is the check that matters: it is the whole
// claim the site makes. Defaults mirror DEFAULTS in engine.js.
X.set_param(0, 0.8);   // temp
X.set_param(1, 0.1);   // gamma
X.set_param(2, 0.01);  // dt
let folded = 0;
const trials = 3;
for (let s = 0; s < trials; s++) {
  X.reset(20 + s, 0);
  let best = 0;
  for (let i = 0; i < 40; i++) {
    X.step(10000);
    best = Math.max(best, X.stat(0));
    if (best >= 0.85) break;
  }
  if (best >= 0.85) folded++;
}
ok(folded === trials, `villin folds from a coil`, `${folded}/${trials} trials reached Q>=0.85`);
ok(X.diverged() === 0, 'integrator stayed finite');

// ---------------------------------------------------------------- geometry
console.log('\ngeometry');
const subdiv = 6, sides = 10;
const verts = X.mesh(subdiv, sides, 1.45);
const rings = (n - 1) * subdiv + 1;
ok(verts === rings * sides, `mesh has ${rings}x${sides} vertices`, `got ${verts}`);
const idxCount = X.indices();
ok(idxCount === (rings - 1) * sides * 6, `index count ${idxCount}`);

const mesh = new Float32Array(X.memory.buffer, X.mesh_ptr(), verts * 8);
ok(mesh.every(Number.isFinite), 'every mesh float is finite');
// t must run 0..1 monotonically along the chain, and normals must be unit
let tOk = true, nOk = true;
for (let r = 0; r < rings; r++) {
  const t = mesh[(r * sides) * 8 + 6];
  if (Math.abs(t - r / (rings - 1)) > 1e-3) tOk = false;
}
for (let v = 0; v < verts; v += 37) {
  const l = Math.hypot(mesh[v * 8 + 3], mesh[v * 8 + 4], mesh[v * 8 + 5]);
  if (Math.abs(l - 1) > 1e-3) nOk = false;
}
ok(tOk, 'chain parameter runs 0..1 along the tube');
ok(nOk, 'tube normals are unit length');

const idx = new Uint32Array(X.memory.buffer, X.index_ptr(), idxCount);
let idxOk = true;
for (let i = 0; i < idxCount; i++) if (idx[i] >= verts) idxOk = false;
ok(idxOk, 'every index is inside the vertex buffer');

ok(X.mesh_native(subdiv, sides, 1.05) === verts, 'ghost matches live topology');
const ghost = new Float32Array(X.memory.buffer, X.ghost_ptr(), verts * 8);
ok(ghost.every(Number.isFinite), 'every ghost float is finite');

const lines = X.wires();
ok(lines >= 0 && lines <= nc, `${lines} contact filaments, <= ${nc} contacts`);
const wire = new Float32Array(X.memory.buffer, X.wire_ptr(), Math.max(1, lines * 8));
ok(wire.every(Number.isFinite), 'every filament float is finite');

// contacts_ptr reads the (u32,u32,f32) records with stride 3
const con = new Uint32Array(X.memory.buffer, X.contacts_ptr(), 3 * nc);
let pairOk = true;
for (let c = 0; c < nc; c++) {
  const i = con[3 * c], j = con[3 * c + 1];
  if (!(i < j && j < n && j - i >= 3)) pairOk = false;
}
ok(pairOk, 'contact pairs are ordered, in range, and |i-j| >= 3');

// The superposition matrix is what puts the native ghost on top of the live
// chain. From the native state it must be (near) the identity; from any state
// it must be a rigid motion — orthonormal rotation, finite translation.
console.log('\nsuperposition');
X.reset(1, 1);
let fit = new Float32Array(X.memory.buffer, X.superpose(), 16);
let identish = true;
for (let i = 0; i < 16; i++) {
  const want = i % 5 === 0 ? 1 : 0;
  if (Math.abs(fit[i] - want) > 2e-3) identish = false;
}
ok(identish, 'fit from the native state is the identity');

X.reset(9, 0);
X.step(20000);
fit = new Float32Array(X.memory.buffer, X.superpose(), 16);
ok(fit.every(Number.isFinite), 'fit is finite mid-fold');
const col = (c) => [fit[c * 4], fit[c * 4 + 1], fit[c * 4 + 2]];
let orth = true;
for (let a = 0; a < 3; a++) {
  const la = Math.hypot(...col(a));
  if (Math.abs(la - 1) > 2e-3) orth = false;
  for (let b = a + 1; b < 3; b++) {
    const d = col(a).reduce((s2, v, k) => s2 + v * col(b)[k], 0);
    if (Math.abs(d) > 2e-3) orth = false;
  }
}
ok(orth, 'fit rotation is orthonormal');
// and it must beat the un-rotated placement: that is the whole point
const nat = new Float32Array(X.memory.buffer, X.native_ptr(), 3 * n);
const pos = new Float32Array(X.memory.buffer, X.pos_ptr(), 3 * n);
let cen = [0, 0, 0];
for (let i = 0; i < n; i++) for (let k = 0; k < 3; k++) cen[k] += pos[3 * i + k] / n;
let eFit = 0, ePlain = 0;
for (let i = 0; i < n; i++) {
  const b = [nat[3 * i], nat[3 * i + 1], nat[3 * i + 2]];
  for (let k = 0; k < 3; k++) {
    const p = fit[k] * b[0] + fit[4 + k] * b[1] + fit[8 + k] * b[2] + fit[12 + k];
    eFit += (p - pos[3 * i + k]) ** 2;
    ePlain += (b[k] + cen[k] - pos[3 * i + k]) ** 2;
  }
}
ok(eFit <= ePlain + 1e-6, 'fit places the ghost at least as well as no rotation',
   `${Math.sqrt(eFit / n).toFixed(2)} A vs ${Math.sqrt(ePlain / n).toFixed(2)} A`);
// and it must agree with the reported RMSD
ok(Math.abs(Math.sqrt(eFit / n) - X.stat(8)) < 0.05, 'fit deviation matches reported RMSD',
   `${Math.sqrt(eFit / n).toFixed(3)} vs ${X.stat(8).toFixed(3)}`);

// Centre-of-mass drift must stay bounded, or the chain walks out of frame.
X.reset(5, 0);
X.step(60000);
let com = 0;
for (let k = 0; k < 3; k++) {
  let m = 0;
  for (let i = 0; i < n; i++) m += pos[3 * i + k];
  com += (m / n) ** 2;
}
ok(Math.sqrt(com) < 12, 'centre of mass stays near the origin', `${Math.sqrt(com).toFixed(2)} A`);

// ---------------------------------------------------------------- big one
console.log('\nlargest entry');
const big = proteins.reduce((a, b) => (b.n > a.n ? b : a));
const bp = X.load(big.n);
new Float32Array(X.memory.buffer, bp, 3 * big.n).set(big.ca);
const bnc = X.build(8.0);
X.reset(1, 1);
X.mesh(3, 10, 1.15);
X.indices();
ok(bnc > 0, `${big.id} (${big.n} aa) builds`, `${bnc} contacts`);
ok(X.diverged() === 0, `${big.id} is finite after a rebuild`);

console.log(`\n${checks - failures}/${checks} checks passed`);
if (failures) {
  console.error(`${failures} FAILED`);
  process.exit(1);
}

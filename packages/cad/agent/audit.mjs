#!/usr/bin/env node
// audit.mjs — rebuild every part in a repo and diff it against what its
// revision recorded. Two regressions hide in a published corpus: the exact
// kernel drifting (a rebuild no longer gives the volume, Euler number and
// face count the revision was judged by), and the two kernels disagreeing
// (Truck's exact solid and Manifold's polygon preview drifting apart beyond
// chord error). Every published tree is a test case, so this is the
// kernels' regression suite, for free, and the publish workflow runs it on
// the bench repo after every publish.
//
//   node agent/audit.mjs --at minomobi.com            # every head vs its stored invariants
//   node agent/audit.mjs --at minomobi.com --kernels  # and Truck vs Manifold volume
//   node agent/audit.mjs --at did:plc:… --tol 0.02    # kernel agreement within 2 %
//
// A revision with no stored invariants (older publishes, hand-written
// records) is reported and skipped, not failed. Exit 1 on any mismatch.
import { Drive, PublicBackend, resolveHandle, resolvePds } from '../lib/drive.js';
import { buildManifold } from '../lib/manifold-kernel.js';
import { weld, invariants } from '../lib/mesh.js';
import { kernels, arg, has } from './common.mjs';

const at = arg('--at', 'minomobi.com');
const tol = Number(arg('--tol', '0.01'));
const did = at.startsWith('did:') ? at : await resolveHandle(at);
const drive = new Drive(new PublicBackend(did, await resolvePds(did)));
const { engine, manifold } = await kernels();
const files = (await drive.list()).filter((f) => f.kind !== 'assembly');
let ok = 0, bad = 0, ungolden = 0;
const rel = (a, b) => Math.abs(a - b) / Math.max(Math.abs(b), 1e-9);
console.log(`${files.length} parts in ${at} (${did})`);
for (const f of files) {
  const file = await drive.get(f.uri);
  const rev = file.revision; const tree = JSON.stringify(rev.tree);
  const r = engine.build(tree, { kernel: 'truck' });
  // fillets, shells and the booleans Truck cannot do are OCCT's on the page (design record §13): not this kernel's regression to report
  if (!r.ok) { const e = r.report.error || {}; if (e.unsupported || /boolean|union|intersect|subtract/i.test(e.msg || '')) { console.log(`· ${f.path.padEnd(22)} needs OCCT (Truck: ${e.op}: ${e.msg}) — not audited here`); ungolden++; continue; } console.log(`✗ ${f.path}  does not build: ${e.op}: ${e.msg}`); bad++; continue; }
  const inv = r.report.invariants, faces = r.report.faces.length;
  const g = rev.invariants;
  const notes = []; let kern = '';
  // A build Truck cannot close (the 60-tooth gear: watertight false) is not
  // deterministic either — χ −40 or −41, triangle counts apart, volume in
  // the fourth decimal, run to run, old wasm and new (measured 2026-09-12).
  // Its B-rep is stable: the face count, and the volume to a part in a
  // thousand. So those are what a non-watertight part is held to; χ and
  // the triangle count are compared only where the mesh closes.
  const closed = inv.watertight && (!g || g.watertight !== false);
  if (!g) { ungolden++; notes.push('no stored invariants — republish to record them'); }
  else {
    if (rel(inv.volume, g.volume) > (closed ? 1e-6 : 1e-3)) notes.push(`volume ${inv.volume.toFixed(4)} vs stored ${Number(g.volume).toFixed(4)}`);
    if (closed && g.euler !== undefined && inv.euler !== g.euler) notes.push(`χ ${inv.euler} vs stored ${g.euler}`);
    if (g.watertight !== undefined && inv.watertight !== g.watertight) notes.push(`watertight ${inv.watertight} vs stored ${g.watertight}`);
    if (g.faces !== undefined && faces !== g.faces) notes.push(`${faces} faces vs stored ${g.faces}`);
  }
  if (!closed) kern += '  (not watertight: mesh χ and triangles vary between builds; faces and volume compared)';
  if (has('--kernels')) {
    const m = buildManifold(manifold, engine.resolve(tree));
    if (!m.ok) notes.push(`manifold: ${m.error.msg}`);
    else { const d = rel(invariants(weld(m.mesh, 1e-5)).volume, inv.volume); kern = `  truck/manifold ${(d * 100).toFixed(3)} %`; if (d > tol) notes.push(`kernels disagree on volume by ${(d * 100).toFixed(2)} % (tolerance ${(tol * 100).toFixed(1)} %)`); }
  }
  const fail = notes.some((n) => !n.startsWith('no stored'));
  if (fail) bad++; else ok++;
  console.log(`${fail ? '✗' : g ? '✓' : '·'} ${f.path.padEnd(22)} volume ${inv.volume.toFixed(4)}  χ ${inv.euler}  ${faces} faces${kern}${notes.length ? '  — ' + notes.join('; ') : ''}`);
}
console.log(`\n${ok} match, ${bad} differ, ${ungolden} without stored invariants or not buildable by Truck`);
process.exit(bad ? 1 : 0);

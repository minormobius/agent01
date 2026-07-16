// ringweave3d.selftest.mjs — pin the 3D analytic solve: the over/under weave (threads + rings), zero-grade
// flats AT every crossing, and antechambers proposed on the z=0 midplane. Run:
//   node rind/upperrind/ringweave3d.selftest.mjs
import { buildRingWeave3D, ABOVE, BELOW } from './ringweave.js';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error('  ✗ ' + m); } };
const W = buildRingWeave3D();
const A = W.amp;

// ── threads carry a z that weaves (goes over AND under), bounded by the amplitude ──
ok(W.threads3d.length === 12, '12 threads lifted into 3D');
for (const th of W.threads3d) {
  ok(th.line3.every((p) => p.length === 3 && Math.abs(p[2]) <= A + 1e-9), `${th.id}: z bounded by amp`);
}
{
  const zs = W.threads3d.flatMap((t) => t.line3.map((p) => p[2]));
  ok(zs.some((z) => z > A * 0.5) && zs.some((z) => z < -A * 0.5), 'threads go both OVER and UNDER (a real weave, not a stack)');
}

// ── plain-weave parity: at a white×engine crossing the two threads are on OPPOSITE sides (over vs under) ──
{
  const c = W.crossings[Math.floor(W.crossings.length / 2)];
  const wth = W.threads3d.find((t) => t.id === c.white), pth = W.threads3d.find((t) => t.id === c.prod);
  const zAt = (th, rf) => th.zf(rf);
  const zw = zAt(wth, c.rf), zp = zAt(pth, c.rf);
  ok(Math.sign(zw) === -Math.sign(zp) && Math.abs(zw) > A * 0.5, 'white and engine are on opposite sides at their crossing (over/under)');
}

// ── ZERO-GRADE at crossings: the height is flat (≈0 slope) right at a crossing (smoothstep control) ──
{
  const th = W.threads3d.find((t) => t.controls.length > 3);
  const cx = th.controls[Math.floor(th.controls.length / 2)];   // an interior crossing control
  const e = 1e-3, slope = (th.zf(cx.rf + e) - th.zf(cx.rf - e)) / (2 * e);
  ok(Math.abs(slope) < 0.05, 'the weave is at ZERO GRADE at a crossing (flat where the antechamber sits)');
  ok(Math.abs(th.zf(cx.rf) - cx.z) < 1e-6, 'and the thread is exactly at its over/under height there');
}

// ── the two rings weave too (over AND under around the loop), oppositely to each other on average ──
for (const rk of ['inner', 'outer']) {
  const r = W.rings3d[rk], zs = r.line3.map((p) => p[2]);
  ok(zs.some((z) => z > A * 0.5) && zs.some((z) => z < -A * 0.5), `the ${rk} ring weaves over AND under as it loops`);
  // zero-grade flat at each ring crossing
  const cc = r.crossings[0], e = 1e-3, slope = (r.zf(cc.ang + e) - r.zf(cc.ang - e)) / (2 * e);
  ok(Math.abs(slope) < 0.05, `the ${rk} ring is at zero grade at its crossing`);
}
{
  const alt = W.rings3d.inner.crossings.map((c) => Math.sign(c.z));
  let weaves = false; for (let i = 1; i < alt.length; i++) if (alt[i] !== alt[i - 1]) weaves = true;
  ok(weaves, 'the ring alternates over/under around its circumference (a weave, not a tilt)');
}

// ── ANTECHAMBERS proposed at EVERY crossing, all on the zero-grade midplane (z=0) ──
ok(W.antechambers.every((a) => a.z === 0), 'every proposed antechamber sits on the z=0 midplane (at grade)');
{
  const kAnte = W.antechambers.filter((a) => a.kind === 'K');
  ok(kAnte.length === 36, 'one antechamber per K PAIR (36 = 6×6, deduped from spiral re-crossings)');
  ok(new Set(kAnte.map((a) => a.a + '×' + a.b)).size === 36, 'the 36 K antechambers are one per distinct white×engine pair');
}
{
  const rAnte = W.antechambers.filter((a) => a.kind === 'ring');
  ok(rAnte.length === 12, '12 BEEFY ring antechambers (6 per ring — adjacent crossings merged)');
  ok(rAnte.every((a) => a.beefy && a.threads.length === 2), 'each ring antechamber junctions the ring + TWO threads');
  ok(new Set(rAnte.flatMap((a) => a.threads)).size === 12, 'the 12 threads are covered, 2 per beefy chamber');
}
{
  // each antechamber lands ON its crossing point (x,y match a crossing / contact)
  const k = W.antechambers.find((a) => a.kind === 'K');
  ok(W.crossings.some((c) => Math.hypot(c.x - k.x, c.y - k.y) < 1e-9), 'a K antechamber sits exactly on its crossing');
  const rc = W.antechambers.find((a) => a.kind === 'ring');
  const cs = W.contacts.filter((c) => c.ring === rc.a && rc.threads.includes(c.thread));
  ok(cs.length === 2 && Math.abs((cs[0].x + cs[1].x) / 2 - rc.x) < 1e-9 && Math.abs((cs[0].y + cs[1].y) / 2 - rc.y) < 1e-9, 'a beefy ring antechamber sits at the midpoint of its two thread-crossings');
}
ok(W.nexus3d.x === 0 && W.nexus3d.y === 0 && W.nexus3d.z === 0, 'the fulfillment nexus is at the core on the midplane');

// ── determinism ──
ok(JSON.stringify(buildRingWeave3D()) === JSON.stringify(buildRingWeave3D()), 'deterministic');

console.log(`\nringweave3d.selftest: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

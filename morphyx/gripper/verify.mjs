// verify.mjs — the posed document against the closed form, at every grip.
//
// This is the check the two travel bugs would have failed. In v4 and again in
// v9 a component was both placed by an expression and moved by a mate, and the
// links stretched — 40 mm becoming 34 — while every part still built and the
// interference gate stayed green, because a stretched linkage does not
// necessarily collide with anything. So: pose the real document through the
// kernel's own solver and compare it with `pose()`, which knows nothing about
// the document. The invariant that matters is the last one — the distance from
// an arm pin to its jaw pin IS the link's length, always.
//
//   node verify.mjs /path/to/cad            (a clone of the tangled mirror)
import fs from 'node:fs';
import path from 'node:path';
const cad = process.argv[2] || process.env.CAD || '/tmp/cad';
const { flatten, solveAngles, modelOf, gridStates } = await import(path.join(cad, 'lib/assembly.js'));
const { benchRef, facesOf } = await import(path.join(cad, 'agent/common.mjs'));
const here = path.dirname(new URL(import.meta.url).pathname);
const g = await import(path.join(here, 'gripper.mjs'));
const doc = JSON.parse(fs.readFileSync(path.join(here, 'gripper.json')));
const { components, mates, drive, inputs, warnings } = await flatten(doc, benchRef, { facesOf });
console.log(`${components.length} components, ${mates.length} joints, ${warnings.length} warnings`);
const D = g.D;
let bad = 0;
const near = (a, b, tol, what) => { const ok = Math.abs(a - b) < tol; if (!ok) { bad++; console.log(`  ✗ ${what}: document ${a.toFixed(4)} vs analytic ${b.toFixed(4)}`); } return ok; };
for (const st of gridStates(inputs, { steps: 5 })) {
  const grip = st.values.grip;
  const p = g.pose(D.xpClosed + grip);
  const a = solveAngles(components, mates, drive, 0, st.values);
  const M = Object.fromEntries(components.map((c) => [c.id, modelOf(c, a)]));
  const x = (id) => M[id][12], y = (id) => M[id][13];
  const n0 = bad;
  near(x('carrier[0]'), p.xf, 1e-6, `grip ${grip}: carrier[0].x`);
  near(x('carrier[1]'), -p.xf, 1e-6, `grip ${grip}: carrier[1].x`);
  near(x('block[0]'), p.xf - D.blockL / 2, 1e-6, `grip ${grip}: block[0].x`);
  near(x('block[1]'), -p.xf - D.blockL / 2, 1e-6, `grip ${grip}: block[1].x`);
  near(x('jaw-pin[0]'), p.xp, 1e-6, `grip ${grip}: jaw-pin[0].x`);
  near(x('jaw-pin[1]'), -p.xp, 1e-6, `grip ${grip}: jaw-pin[1].x`);
  near(y('carriage'), p.yn + D.carT / 2, 1e-6, `grip ${grip}: carriage.y`);
  near(y('arm[0]'), p.yn, 1e-6, `grip ${grip}: arm[0].y`);
  near(y('nut'), p.yn - D.carT / 2 - D.flangeT, 1e-6, `grip ${grip}: nut.y`);
  // the link must still be exactly its own length from arm pin to jaw pin
  for (let k = 0; k < 4; k++) {
    const sd = 1 - 2 * (k % 2), lv = Math.floor(k / 2), z = D.linkZ[0][0] + (D.linkZ[1][0] - D.linkZ[0][0]) * lv;
    near(x(`bush[${2 * k}]`), sd * D.pivotX, 1e-6, `grip ${grip}: bush[${2 * k}].x on the arm pin`);
    near(y(`bush[${2 * k}]`), p.yn + D.pivotY, 1e-6, `grip ${grip}: bush[${2 * k}].y`);
    near(x(`bush[${2 * k + 1}]`), sd * p.xp, 1e-6, `grip ${grip}: bush[${2 * k + 1}].x on the jaw pin`);
    near(y(`bush[${2 * k + 1}]`), D.pivotLine, 1e-6, `grip ${grip}: bush[${2 * k + 1}].y`);
    near(M[`bush[${2 * k}]`][14], z, 1e-6, `grip ${grip}: bush[${2 * k}].z`);
  }
  const d = Math.hypot(x('jaw-pin[0]') - x('arm-pin[0]'), y('jaw-pin[0]') - y('arm-pin[0]'));
  near(d, D.link, 1e-6, `grip ${grip}: arm pin to jaw pin`);
  if (bad === n0) console.log(`  ✓ grip ${String(grip).padStart(5)} mm — 30 positions match the analytic pose; pin to pin ${d.toFixed(4)} = link ${D.link}`);
}
console.log(bad ? `${bad} MISMATCHES` : 'the document and the closed form agree everywhere');
process.exit(bad ? 1 : 0);

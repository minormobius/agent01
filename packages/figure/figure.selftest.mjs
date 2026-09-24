#!/usr/bin/env node
// figure.selftest.mjs — the rig's maths, and every check on every spec.
//
//   node packages/figure/figure.selftest.mjs
// (browser.selftest.mjs checks the GPU draws the same body node measures.)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ypr, frameFrom, dot, len, dist, sub, add, norm, cross } from './lib/vec.js';
import { makeRig, solve, twoBone } from './lib/rig.js';
import { measure } from './lib/proportion.js';
import { buildBody, pack, TEXELS, GROUPS, sdf } from './lib/body.js';
import { walk } from './lib/gait.js';
import { POSES } from './lib/poses.js';
import { checkAll } from './lib/check.js';

const here = path.dirname(fileURLToPath(import.meta.url));
let failed = 0;
const ok = (c, m) => { console.log(`${c ? '✓' : '✗'} ${m}`); if (!c) failed++; };

// ---- frames
{
  let worst = 0;
  for (let i = 0; i < 200; i++) {
    const F = ypr(Math.sin(i) * 3, Math.cos(i * 1.3) * 1.5, Math.sin(i * 0.7));
    worst = Math.max(worst, Math.abs(dot(F.x, F.y)), Math.abs(dot(F.y, F.z)), Math.abs(len(F.x) - 1), len(sub(cross(F.x, F.y), F.z)));
  }
  ok(worst < 1e-12, `ypr frames are right-handed and orthonormal (worst ${worst.toExponential(1)})`);
  const F = frameFrom([0, 1, 0], [0, 0, 1]);
  ok(F.x[0] === 1 && F.y[1] === 1 && F.z[2] === 1, 'frameFrom(up, forward) is the identity for y up, z forward (x = the figure\'s left)');
}

// ---- two-bone IK
{
  let endErr = 0, lenErr = 0, poleWrong = 0, n = 0;
  for (let i = 0; i < 500; i++) {
    const A = [Math.sin(i), Math.cos(i * 0.3), 0.2 * Math.sin(i * 2.1)];
    const a = 1 + 0.5 * Math.abs(Math.sin(i * 0.9)), b = 0.8 + 0.4 * Math.abs(Math.cos(i * 1.7));
    const dir = norm([Math.sin(i * 3.1), Math.cos(i * 2.3), Math.sin(i * 1.1)]);
    const T = add(A, dir.map((x) => x * (Math.abs(a - b) + 0.05 + (a + b - Math.abs(a - b) - 0.1) * ((i % 97) / 97))));
    const pole = norm([Math.cos(i * 0.5), 0.3, Math.sin(i * 0.5)]);
    const r = twoBone(A, T, a, b, pole);
    if (!r.reached) continue;
    n++;
    endErr = Math.max(endErr, dist(r.end, T));
    lenErr = Math.max(lenErr, Math.abs(dist(A, r.mid) - a), Math.abs(dist(r.mid, r.end) - b));
    const t = norm(sub(T, A)), mid = sub(r.mid, A), pp = sub(pole, t.map((x) => x * dot(pole, t)));
    if (len(pp) > 1e-3 && dot(mid, pp) < -1e-9) poleWrong++;
  }
  ok(n > 400 && endErr < 1e-9 && lenErr < 1e-9, `IK: ${n} reachable targets hit exactly, bones keep their lengths (${endErr.toExponential(1)}, ${lenErr.toExponential(1)})`);
  ok(poleWrong === 0, 'IK: every joint bends toward its pole');
}

// ---- proportions
{
  const m7 = measure({ heads: 7 });
  ok(Math.abs(m7.hipY - 3.66) < 0.02 && Math.abs(m7.hipY - m7.thighLen - 1.9) < 0.03, `7 heads: hip joint ${m7.hipY.toFixed(2)}, knee ${(m7.hipY - m7.thighLen).toFixed(2)} (the book: 3.6, 1.9)`);
  const tip = m7.shoulderY - m7.upperArm - m7.foreArm - m7.hand;
  ok(tip > 2.2 && tip < 2.6, `7 heads: fingertips hang to ${tip.toFixed(2)}, mid-thigh`);
  const legs = [0, 0.5, 1].map((l) => measure({ legs: l }).hipY);
  ok(legs[0] < legs[1] && legs[1] < legs[2], 'the legs bias lengthens the legs');
  const w = [0, 1].map((b) => measure({ build: b }));
  ok(w[1].shoulderHalf > w[0].shoulderHalf && w[1].pelvis.r[0] < w[0].pelvis.r[0], 'build: broad shoulders and narrow hips at 1, the reverse at 0');
  ok(Math.abs(measure({ heads: 8.5 }).shoulderHalf / measure({ heads: 7 }).shoulderHalf - 1) < 0.06, 'a taller figure in heads is longer, not wider');
}

// ---- the body
{
  const rig = makeRig({});
  const P = solve(rig, POSES.stand(rig));
  const a = buildBody(P), b = buildBody(P);
  ok(a.length === b.length && a.every((q, i) => q.name === b[i].name && q.a.every((x, k) => x === b[i].a[k])), `buildBody is deterministic (${a.length} primitives)`);
  ok(a.every((q, i) => i === 0 || q.group >= a[i - 1].group), 'primitives are grouped for the GPU');
  ok(pack(a).length === a.length * TEXELS * 4, 'pack: 6 texels per primitive');
  ok(sdf(a, P.J.chest) < 0 && sdf(a, [0, 3, 3]) > 0, 'inside is negative, outside positive');
}

// ---- the walk is periodic
{
  const rig = makeRig({});
  const w0 = walk(rig, 0.3), T = w0.cycle, w1 = walk(rig, 0.3 + T);
  const stride = w1.pose.root.pos[2] - w0.pose.root.pos[2];
  ok(Math.abs(w1.pose.root.pos[1] - w0.pose.root.pos[1]) < 1e-9 && Math.abs(stride - w0.speed * T) < 1e-9, `the walk repeats every ${T.toFixed(3)} s, a stride of ${stride.toFixed(2)} heads`);
}

// ---- every check on every spec
for (const f of fs.readdirSync(path.join(here, 'specs')).filter((f) => f.endsWith('.json')).sort()) {
  const spec = JSON.parse(fs.readFileSync(path.join(here, 'specs', f), 'utf8'));
  const res = Object.values(checkAll(spec)).flat();
  const bad = res.filter((x) => !x.ok);
  ok(!bad.length, `${f}: ${res.length} checks${bad.length ? ' — ' + bad.map((x) => `${x.name} (${x.value})`).join('; ') : ''}`);
}

console.log(failed ? `\n${failed} failed` : '\nall passed');
process.exit(failed ? 1 : 0);

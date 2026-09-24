#!/usr/bin/env node
// browser.selftest.mjs — the GPU draws the body node measures.
//
// Renders poses in headless Chromium, reads back the geometry pass (which group
// every pixel hit), then casts the same orthographic rays in JavaScript against
// body.js's distance field. The masks must agree: the shader's GLSL and the
// checks' JS are the same body, or the checks are checking something else.
// Also renders the default model sheet and fails on any page error.
//
//   node packages/figure/browser.selftest.mjs
import { loadPlaywright, serve, CHROME_ARGS } from './agent/render.mjs';

let failed = 0;
const ok = (c, m) => { console.log(`${c ? '✓' : '✗'} ${m}`); if (!c) failed++; };

const { chromium } = loadPlaywright();
const { server, base } = await serve();
const browser = await chromium.launch({ headless: true, args: CHROME_ARGS });
try {
  const page = await browser.newPage();
  const errors = []; page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`${base}/sheet.html?wait`);
  await page.waitForFunction(() => window.__figure?.ready);
  const res = await page.evaluate(async () => {
    const { makeRig, solve } = await import('./lib/rig.js');
    const { buildBody, groupDists } = await import('./lib/body.js');
    const { POSES } = await import('./lib/poses.js');
    const { makeRenderer, camera } = await import('./lib/shader.js');
    const out = [];
    // [spec, pose, yaw, pitch]: the last looks down into a hollow skirt, spread in a crouch
    for (const [spec, pose, yaw, pitch = 0] of [[{}, 'handOnHip', 0.4], [{ heads: 3, build: 0.3, mass: 0.7, headWidth: 0.9 }, 'crouch', 1.0], [{ heads: 8.2, build: 0.95 }, 'run', 1.3],
      [{ femme: 1, bust: 0.7, hips: 0.8, face: {}, hair: { length: 'long', bangs: 'blunt', tails: 'twintails', extras: ['ahoge'] } }, 'contrapposto', 2.4],
      [{ femme: 1, face: {}, hair: { length: 'bob' }, outfit: { scheme: 'school' } }, 'sit', 0.8], [{ heads: 7.5, face: {}, outfit: { scheme: 'street' } }, 'run', 1.2],
      [{ femme: 1, face: {}, outfit: { top: 'tee', bottom: 'skirt' } }, 'crouch', 0.3, 0.6],
      // close on a hand: every finger (a peace sign, an OK), and the blocks a small hand is drawn as
      [{}, 'hand:peace', 0.3, 0.1], [{ femme: 1 }, 'hand:ok', -0.6, 0.2], [{}, 'hand:fist:block', 0.5, 0.1]]) {
      const rig = makeRig(spec);
      const [, gesture, detail = 'full'] = pose.split(':');
      const base = POSES.stand(rig);
      const P = gesture ? solve(rig, { ...base, arms: { ...base.arms, l: { raise: 1.25, out: 0.25, elbow: 1.35, gesture } } }) : solve(rig, POSES[pose](rig));
      const prims = buildBody(P, { hands: detail });
      const c = document.createElement('canvas'); c.width = 120; c.height = 200;
      const R = makeRenderer(c, { supersample: 1 });
      const view = gesture ? rig.m.hand * 2.2 : rig.m.H * 1.2;
      const target = gesture ? [0, 1, 2].map((k) => P.J.wrist_l[k] + P.F.hand_l.z[k] * 0.5 * rig.m.hand) : [0, view / 2 - 0.35, 0];
      const cam = camera({ target, yaw, pitch, height: view, aspect: 120 / 200 });
      R.draw(prims, P, cam);
      const g = R.readGroups();
      let inter = 0, uni = 0, sameGroup = 0, both = 0;
      for (let y = 0; y < g.h; y++) for (let x = 0; x < g.w; x++) {
        // the shader's ray for this pixel's centre
        const u = ((x + 0.5) / g.w) * 2 - 1, v = ((y + 0.5) / g.h) * 2 - 1;
        const s = [u * cam.halfW, v * cam.halfH];
        let ro = [0, 1, 2].map((k) => cam.c[k] + cam.r[k] * s[0] + cam.u[k] * s[1] - cam.f[k] * 30);
        let t = 0, hit = -1;
        for (let i = 0; i < 300 && t < 60; i++) {
          const p = [0, 1, 2].map((k) => ro[k] + cam.f[k] * t);
          const gd = groupDists(prims, p); const d = Math.min(...gd);
          if (d < 0.001) { hit = gd.indexOf(d); break; }
          t += d * 0.9;
        }
        const js = hit >= 0, gpu = g.ids[y * g.w + x] > 0;
        if (js && gpu) { inter++; both++; if (g.ids[y * g.w + x] - 1 === hit) sameGroup++; }
        if (js || gpu) uni++;
      }
      out.push({ pose: gesture ? `close on a hand: ${gesture}${detail === 'block' ? ' (as blocks)' : ''}` : spec.outfit ? `${pose} (dressed: ${spec.outfit.scheme || spec.outfit.bottom}${pitch ? ', from above' : ''})` : spec.hair ? `${pose} (femme, long hair, twin tails)` : pose, heads: rig.m.H, iou: inter / uni, groups: sameGroup / both, px: uni });
    }
    return out;
  });
  for (const r of res) {
    ok(r.iou > 0.985, `${r.heads}-head ${r.pose}: GPU and JS silhouettes agree (IoU ${r.iou.toFixed(4)}, ${r.px} px)`);
    ok(r.groups > 0.97, `${r.heads}-head ${r.pose}: and agree which part each pixel is (${(r.groups * 100).toFixed(1)}%)`);
  }
  // the face: mirror-symmetric in front, the far eye hidden in profile, expressions that change what they should
  const fr = await page.evaluate(async () => {
    const { makeRig, solve } = await import('./lib/rig.js');
    const { buildBody } = await import('./lib/body.js');
    const { POSES } = await import('./lib/poses.js');
    const { makeRenderer, camera } = await import('./lib/shader.js');
    const { add, apply } = await import('./lib/vec.js');
    const c = document.createElement('canvas'); c.width = 160; c.height = 160;
    const R = makeRenderer(c, { supersample: 2 });
    const shot = (face, expression, yaw, femme = 1) => {
      const rig = makeRig({ face, femme });
      const P = solve(rig, { ...POSES.stand(rig), expression });
      const cam = camera({ target: add(P.J.headPivot, apply(P.F.head, [0, 0.32, 0])), yaw, height: 1.3, aspect: 1 });
      R.draw(buildBody(P), P, cam);
      const f = R.readFace();
      // counts per material code, left half and right half of the picture
      const L = new Array(12).fill(0), Rt = new Array(12).fill(0);
      for (let y = 0; y < f.h; y++) for (let x = 0; x < f.w; x++) { const k = f.codes[y * f.w + x]; if (k) (x < f.w / 2 ? L : Rt)[k]++; }
      return { L, R: Rt };
    };
    const front = shot({ eyes: 'tareme', extras: ['blush'] }, 'neutral', 0);
    const frontM = shot({ eyes: 'tsurime' }, 'neutral', 0, 0);
    const side = shot({}, 'neutral', Math.PI / 2);
    const laugh = shot({}, 'laugh', 0), neutral = shot({}, 'neutral', 0), wink = shot({}, 'wink', 0);
    return { front, frontM, side, laugh, neutral, wink };
  });
  const sum = (a) => a.reduce((x, y) => x + y, 0);
  const asym = Math.max(...[1, 2, 5, 8, 9].map((k) => Math.abs(fr.front.L[k] - fr.front.R[k]) / Math.max(1, (fr.front.L[k] + fr.front.R[k]) / 2)));
  ok(asym < 0.04, `face: front view mirror-symmetric (ink, iris, sclera, blush, brow within ${(asym * 100).toFixed(1)}%)`);
  // a masculine nose is drawn down its shadow side, on purpose: compare all but the ink
  const asymM = Math.max(...[2, 3, 5, 9].map((k) => Math.abs(fr.frontM.L[k] - fr.frontM.R[k]) / Math.max(1, (fr.frontM.L[k] + fr.frontM.R[k]) / 2)));
  ok(asymM < 0.04, `face: a masculine face mirror-symmetric too (iris, sclera, brow within ${(asymM * 100).toFixed(1)}%; the nose line is one-sided by design)`);
  const irisSide = [fr.side.L[2] + fr.side.L[3], fr.side.R[2] + fr.side.R[3]];
  ok(Math.min(...irisSide) < 0.05 * Math.max(...irisSide) && Math.max(...irisSide) > 0, `face: in profile the far eye is hidden (${irisSide.join(' vs ')} iris px)`);
  ok(fr.laugh.L[2] + fr.laugh.R[2] === 0 && fr.laugh.L[6] + fr.laugh.R[6] > 0 && fr.neutral.L[6] + fr.neutral.R[6] === 0, 'face: a laugh closes the eyes and opens the mouth; neutral does neither');
  const winkIris = [fr.wink.L[2], fr.wink.R[2]];
  ok(Math.min(...winkIris) === 0 && Math.max(...winkIris) > 0, `face: a wink closes one eye (${winkIris.join(' / ')} iris px)`);
  const t0 = Date.now();
  const stats = await page.evaluate(() => window.__figure.render({}, null, { panelH: 240 }));
  ok(stats.panels.length === 20 && stats.panels.every((p) => !p.unreached.length), `the model sheet renders: ${stats.panels.length} panels, every limb reaching (${Date.now() - t0} ms)`);
  ok(!errors.length, `no page errors${errors.length ? ': ' + errors.join('; ') : ''}`);
} finally { await browser.close(); server.close(); }
console.log(failed ? `\n${failed} failed` : '\nall passed');
process.exit(failed ? 1 : 0);

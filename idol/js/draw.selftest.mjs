#!/usr/bin/env node
/* idol — renderer smoke test. Run before touching the renderer:
     node idol/js/draw.selftest.mjs

   No canvas in node, so we stub the 2D context (recording call counts) and
   render frames for a population of girls across every expression, beat, and
   locomotion mode. This catches typos in rarely-hit branches (hime hem, bolt
   ahoge, miko sleeves, drills) that the genome selftest can't see — the
   design memo's "rig torture test" for a 2D rig. */

import "./prng.js";
import "./genome.js";
import "./draw.js";
import "./puppet.js";

const I = globalThis.IDOL;
let failures = 0;
function ok(cond, msg) { if (!cond) { failures++; console.error("  ✗ " + msg); } }

/* minimal 2D-context stub: every method draw.js uses, all numeric args
   checked for finiteness — NaN coordinates are the silent killer */
let nanSightings = 0;
function stubCtx() {
  const grad = { addColorStop() {} };
  const check = (name, args) => {
    for (const a of args) if (typeof a === "number" && !Number.isFinite(a)) nanSightings++;
  };
  const ctx = {
    canvas: null,
    fillStyle: "", strokeStyle: "", lineWidth: 1, lineCap: "butt",
    globalAlpha: 1, globalCompositeOperation: "source-over",
  };
  for (const m of ["clearRect", "save", "restore", "translate", "rotate", "scale",
                   "beginPath", "ellipse", "fill", "stroke", "moveTo", "lineTo",
                   "quadraticCurveTo", "bezierCurveTo", "closePath", "roundRect", "clip", "fillRect"]) {
    ctx[m] = (...args) => { check(m, args); ctx._calls = (ctx._calls || 0) + 1; };
  }
  ctx.createLinearGradient = (...args) => { check("grad", args); return grad; };
  return ctx;
}

console.log("\nrender smoke (300 seeds × modes × beats)");
const ctx = stubCtx();
const EMOS = ["neutral", "joy", "fun", "sorrow", "angry", "surprise", "serious", "menace"];
const seen = { back: new Set(), bangs: new Set(), outfit: new Set(), ahoge: new Set(), acc: new Set() };

for (let n = 1; n <= 300; n++) {
  const g = I.genome.generate(n);
  seen.back.add(g.hair.back); seen.bangs.add(g.hair.bangs);
  seen.outfit.add(g.outfit); seen.ahoge.add(g.hair.ahoge); seen.acc.add(g.hair.accessory);
  const pup = I.puppet.create(g, null);

  // run her through everything: each expression, both beats, all three modes
  for (const emo of EMOS) {
    pup.setEmotion(emo, 0.3);
    let st = pup.frame(n + 0.1, 0.016);
    try { I.draw.render(ctx, 480, 640, g, st); }
    catch (e) { failures++; console.error(`  ✗ seed ${n} emo ${emo}: ${e.message}`); }
  }
  pup.beat("deadEyes"); pup.beat("glitch"); pup.beat("blush");
  for (const mode of ["dance", "walk", "idle"]) {
    pup.setMode(mode);
    for (let f = 0; f < 30; f++) {
      const st = pup.frame(n + 1 + f * 0.016, 0.016);
      try { I.draw.render(ctx, 480, 640, g, st); }
      catch (e) { failures++; console.error(`  ✗ seed ${n} mode ${mode} f${f}: ${e.message}`); f = 99; }
    }
  }
  // speaking mouth
  pup.setSpeaking(true); pup.sayViseme("A");
  const st2 = pup.frame(n + 2.5, 0.016);
  try { I.draw.render(ctx, 480, 640, g, st2); }
  catch (e) { failures++; console.error(`  ✗ seed ${n} speaking: ${e.message}`); }
}

ok(nanSightings === 0, `no NaN/Infinity coordinates (${nanSightings} sightings)`);
ok(ctx._calls > 100000, `renderer actually drew (${ctx._calls} ops)`);
for (const k of ["back", "bangs", "outfit", "ahoge", "acc"])
  ok(seen[k].size >= 4, `component "${k}" varied across population (${seen[k].size})`);

/* ── convention assertions — the renderer is held to the rules numerically ── */
console.log("\nconventions (metrics over 300 seeds)");
for (let n = 1; n <= 300; n++) {
  const g = I.genome.generate(n);
  const m = I.draw.metrics(g);
  ok(m.eyeLineY >= m.headMidY, `seed ${n}: eyes BELOW head midline (eye ${m.eyeLineY.toFixed(3)} vs mid ${m.headMidY.toFixed(3)})`);
  ok(m.noseY > m.eyeTopY && m.noseY < m.chinY, `seed ${n}: nose between eye-top and chin`);
  ok(m.mouthY > m.noseY && m.mouthY < m.chinY, `seed ${n}: mouth between nose and chin`);
  ok(m.eyeHW >= 1.2, `seed ${n}: eyes taller than wide — moe ratio (H/W ${m.eyeHW.toFixed(2)})`);
  ok(m.bangClumps >= 3, `seed ${n}: bangs built from ≥3 clumps (${m.bangClumps})`);
  ok(m.backTips >= 1, `seed ${n}: back hair has pointed tips (${m.backTips})`);
}

console.log(failures ? `✗ ${failures} failure(s)` : "✓ renderer OK — every component branch renders, coordinates finite");
process.exit(failures ? 1 : 0);

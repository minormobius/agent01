#!/usr/bin/env node
/* idol — genome selftest. Run before touching the engine:
     node idol/js/genome.selftest.mjs

   Validates the two separate questions from the design memo:
     QUALITY   — every genome is renderable + on-model (bounds, palette
                 constraints, sanctioned-wrongness confined to its slots)
     DIVERSITY — the sampler actually fills the space (archetype coverage,
                 pairwise distances, no same-face collapse, no duplicates)
   plus the load-bearing invariant of the whole site: DETERMINISM. */

import "./prng.js";
import "./genome.js";

const G = globalThis.IDOL.genome;
let failures = 0;
function ok(cond, msg) {
  if (!cond) { failures++; console.error("  ✗ " + msg); }
}
function section(s) { console.log("\n" + s); }

/* ── 1. determinism ─────────────────────────────────────────────────── */
section("determinism");
for (const n of [1, 42, 9021, 48112, 999999]) {
  const a = JSON.stringify(G.generate(n));
  const b = JSON.stringify(G.generate(n));
  ok(a === b, `seed ${n} generates twice identically`);
}
ok(JSON.stringify(G.generate(1)) !== JSON.stringify(G.generate(2)), "adjacent seeds differ");

/* ── 2. bounds + renderability over a population ────────────────────── */
section("bounds (N=2000)");
const N = 2000;
const girls = [];
for (let n = 1; n <= N; n++) girls.push(G.generate(n));

for (const g of girls) {
  const p = g.persona;
  for (const k of ["warm", "playful", "eerie", "clingy", "lucid", "glitchy"])
    ok(p[k] >= 0 && p[k] <= 1, `seed ${g.seed}: persona.${k} in [0,1] (got ${p[k]})`);
  const s = g.soma;
  ok(s.eyeSize >= 0.6 && s.eyeSize <= 1.4, `seed ${g.seed}: eyeSize in range (${s.eyeSize})`);
  ok(s.eyeSpacing >= 0.8 && s.eyeSpacing <= 1.2, `seed ${g.seed}: eyeSpacing in range`);
  ok(s.headW > 0.85 && s.headW < 1.15, `seed ${g.seed}: headW in range`);
  const d = g.dials;
  ok(d.gazeHold > 0 && d.gazeHold <= 0.95, `seed ${g.seed}: gazeHold sane`);
  ok(d.blinkRate > 0.2 && d.blinkRate < 1.5, `seed ${g.seed}: blinkRate sane`);
  ok(d.latency >= 0.2 && d.latency <= 1.6, `seed ${g.seed}: latency sane`);
  ok(d.deadEyeChance >= 0 && d.deadEyeChance <= 0.8, `seed ${g.seed}: deadEyeChance sanctioned`);
  ok(g.voice.pitch >= 1.0 && g.voice.pitch <= 2.1, `seed ${g.seed}: voice pitch singable`);
  // palette: every derived color is a valid in-gamut sRGB triple
  const C = g.chroma;
  for (const key of ["skinRgb", "skinShadow", "hairRgb", "hairShadow", "hairLight",
                     "eye1Rgb", "eye1Deep", "eye2Rgb", "eye2Deep", "outfit1Rgb",
                     "outfit1Shadow", "outfit2Rgb", "accentRgb", "blushRgb"]) {
    const c = C[key];
    for (const ch of ["r", "g", "b"])
      ok(c[ch] >= 0 && c[ch] <= 255 && Number.isInteger(c[ch]), `seed ${g.seed}: chroma.${key}.${ch} in gamut`);
  }
  // eyes must read against the face: iris luminance clearly below skin
  ok(C.eye1.l < C.skin.l - 0.15, `seed ${g.seed}: iris/skin luminance contrast (${C.eye1.l} vs ${C.skin.l})`);
  // outfit slots distinguishable
  ok(Math.abs(C.outfit2.l - C.outfit1.l) >= 0.1, `seed ${g.seed}: outfit slots distinguishable`);
  ok(G.ARCHETYPES[g.archetype], `seed ${g.seed}: archetype known`);
  ok(G.BANGS.includes(g.hair.bangs), `seed ${g.seed}: bangs in grammar`);
  ok(G.BACKS.includes(g.hair.back), `seed ${g.seed}: back hair in grammar`);
  ok(G.OUTFITS.includes(g.outfit), `seed ${g.seed}: outfit in grammar`);
  ok(typeof g.name === "string" && g.name.length >= 2 && g.name.length <= 12, `seed ${g.seed}: name plausible ("${g.name}")`);
}

/* ── 3. diversity ───────────────────────────────────────────────────── */
section("diversity (N=2000)");
const count = (fn) => girls.reduce((m, g) => { const k = fn(g); m[k] = (m[k] || 0) + 1; return m; }, {});
const archC = count((g) => g.archetype);
for (const a of Object.keys(G.ARCHETYPES)) ok(archC[a] > N * 0.03, `archetype "${a}" represented (${archC[a] || 0})`);
const bangsC = count((g) => g.hair.bangs);
for (const b of G.BANGS) ok(bangsC[b] > 10, `bangs "${b}" represented (${bangsC[b] || 0})`);
const backC = count((g) => g.hair.back);
for (const b of G.BACKS) ok(backC[b] > 10, `back hair "${b}" represented (${backC[b] || 0})`);
const outC = count((g) => g.outfit);
for (const o of G.OUTFITS) ok(outC[o] > 10, `outfit "${o}" represented (${outC[o] || 0})`);

// duplicate rejection: full visual signature must be unique
const sigs = new Set(girls.map((g) =>
  [g.archetype, g.hair.bangs, g.hair.back, g.hair.ahoge, g.outfit,
   Math.round(g.chroma.hair.h), Math.round(g.chroma.eye1.h),
   g.soma.eyeSize.toFixed(2), g.soma.eyeTilt.toFixed(2), g.soma.eyeSpacing.toFixed(2)].join("|")));
ok(sigs.size === N, `no duplicate visual signatures (${sigs.size}/${N})`);

// same-face syndrome: pairwise persona + soma distances on a sample
function l2(a, b, keys) {
  let s = 0;
  for (const k of keys) { const d = a[k] - b[k]; s += d * d; }
  return Math.sqrt(s);
}
const PKEYS = ["warm", "playful", "eerie", "clingy", "lucid", "glitchy"];
const SKEYS = ["eyeSize", "eyeTilt", "eyeSpacing", "headW"];
let pSum = 0, sSum = 0, pairs = 0;
for (let i = 0; i < 400; i++) {
  const a = girls[i], b = girls[(i * 7 + 13) % N];
  pSum += l2(a.persona, b.persona, PKEYS);
  sSum += l2(a.soma, b.soma, SKEYS);
  pairs++;
}
const pMean = pSum / pairs, sMean = sSum / pairs;
ok(pMean > 0.35, `persona mean pairwise distance healthy (${pMean.toFixed(3)})`);
ok(sMean > 0.10, `soma mean pairwise distance healthy — no mean-face collapse (${sMean.toFixed(3)})`);

// hair hue coverage across the wheel (clustered is fine, dead zones are not)
const hues = girls.map((g) => g.chroma.hair.h);
const buckets = new Array(12).fill(0);
hues.forEach((h) => buckets[Math.floor(h / 30) % 12]++);
const covered = buckets.filter((b) => b > 0).length;
ok(covered >= 8, `hair hue covers ${covered}/12 of the wheel`);

/* ── 4. sanctioned wrongness ────────────────────────────────────────── */
section("sanctioned wrongness");
const het = girls.filter((g) => g.extras.heterochromia).length;
ok(het / N > 0.02 && het / N < 0.12, `heterochromia rare but present (${(het / N * 100).toFixed(1)}%)`);
const gap = girls.filter((g) => g.extras.gapMoe).length;
ok(gap / N > 0.10 && gap / N < 0.35, `gap-moe offset at its flagged share (${(gap / N * 100).toFixed(1)}%)`);
// the uncanny lives ONLY in its slots: heterochromia implies distinct eye hues
for (const g of girls) {
  if (g.extras.heterochromia)
    ok(G.hueDist(g.chroma.eye1.h, g.chroma.eye2.h) > 60, `seed ${g.seed}: heterochrom eyes actually distinct`);
  else
    ok(g.chroma.eye1.h === g.chroma.eye2.h, `seed ${g.seed}: non-heterochrom eyes match`);
}

/* ── verdict ────────────────────────────────────────────────────────── */
console.log("\n" + (failures ? `✗ ${failures} failure(s)` : "✓ genome engine OK — deterministic, diverse, sanctioned"));
process.exit(failures ? 1 : 0);

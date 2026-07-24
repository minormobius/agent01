/* Selftest for engine.js — run before touching the engine:
     node conjectures/engine.selftest.mjs
   Checks determinism, score ranges, factor arithmetic, structural completeness,
   and pack coverage. Exits non-zero on any failure. */
import './reality.js';
import './engine.js';
const G = globalThis.CONJGEN;

let fails = 0;
const ok = (c, m) => { if (!c) { console.error('FAIL:', m); fails++; } };

// 1. determinism — same seed → identical object
for (const seed of ['1', 'the-book-of-sand', 'x9', '42', 'borges', '']) {
  const a = JSON.stringify(G.generateConjecture(seed));
  const b = JSON.stringify(G.generateConjecture(seed));
  ok(a === b, `determinism for seed "${seed}"`);
}

// 2. sweep many seeds — structural + range invariants
const packSeen = new Set();
const fieldSeen = new Set();
const disproofSeen = new Set();
let min = 100, max = 0;
for (let i = 0; i < 4000; i++) {
  const c = G.generateConjecture('s' + i);
  ok(typeof c.name === 'string' && c.name.length > 0, `name @${i}`);
  ok(typeof c.statement === 'string' && c.statement.length > 8, `statement @${i}`);
  ok(typeof c.form === 'string' && c.form.length > 0, `form @${i}`);
  ok(typeof c.counterexample === 'string' && c.counterexample.length > 0, `counterexample @${i}`);
  ok(!/undefined|NaN|\[object/.test(c.statement + c.form + c.name), `no junk tokens @${i}`);
  ok(Number.isInteger(c.hardness) && c.hardness >= 5 && c.hardness <= 97, `hardness range @${i} (${c.hardness})`);
  const s = c.solvability;
  ok(s && Array.isArray(s.factors) && s.factors.length >= 4, `factors present @${i}`);
  const sum = s.base + s.factors.reduce((t, x) => t + x.delta, 0);
  ok(sum === s.raw, `factor arithmetic @${i} (${sum} vs ${s.raw})`);
  ok(s.score === Math.max(5, Math.min(97, Math.round(s.raw))), `clamp @${i}`);
  ok(typeof s.tier === 'string' && s.tier.length > 0, `tier @${i}`);
  ok(c.hardness === s.score, `hardness=score @${i}`);
  packSeen.add(c.pack); fieldSeen.add(c.field); disproofSeen.add(c.disproof);
  min = Math.min(min, c.hardness); max = Math.max(max, c.hardness);
}

// 3. coverage
for (const k of G.PACK_KEYS) ok(packSeen.has(k), `pack "${k}" appears in sweep`);
ok(fieldSeen.size >= 5, `field variety (${fieldSeen.size})`);
ok(disproofSeen.has('counterexample') && disproofSeen.has('existence') && disproofSeen.has('other'), 'disproof variety');
ok(max - min >= 40, `hardness spread wide enough (${min}..${max})`);

// 4. oracle is a pure function of features (given a helper stream) — smoke
ok(typeof G.estimateSolvability === 'function', 'estimateSolvability exported');

console.log(fails === 0
  ? `OK — all selftests passed. packs=${packSeen.size} fields=${fieldSeen.size} hardness=${min}..${max}`
  : `${fails} FAILURE(S)`);
process.exit(fails === 0 ? 0 : 1);

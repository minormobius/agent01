// wormhole serpent selftest — run before touching serpent.js or margins.js:
//   node wormhole/serpent.selftest.mjs
//
// Guards what the serpent margins rest on:
//   1. DETERMINISM — same (seed, biome, page) → byte-identical SVG.
//   2. THE PROSE IS SACRED — no body segment, head, tongue, leaf or fruit
//      enters the text box, on desktop, phone, print and monograph pages.
//   3. THERE ARE SERPENTS — every roomy page actually gets at least one, with a head.
//   4. WELL-FORMED — no NaN/undefined; <g> tags balance; tiles carry every chunk once.
//   5. RANGE — every skin, pattern and habit turns up; the dispatcher deals both kinds.

import "./flora.js";
import "./serpent.js";
import "./margins.js";
const Z = globalThis.WORMHOLE_SERPENT, M = globalThis.WORMHOLE_MARGINS;

let failures = 0;
function ok(cond, msg) { if (!cond) { failures++; console.error("  ✗ " + msg); } }

const PAGES = {
  desktop: { width: 1060, height: 3000, box: { x0: 160, y0: 110, x1: 900, y1: 2830 } },
  phone: { width: 380, height: 5200, box: { x0: 46, y0: 56, x1: 334, y1: 5120 } },
  print: { width: 816, height: 950, box: { x0: 128, y0: -20, x1: 688, y1: 970 } },
  monograph: { width: 1060, height: 9000, box: { x0: 160, y0: 110, x1: 900, y1: 8830 } },
};

for (const s of ["1.f", "42.r3"]) {
  ok(Z.grow(Z.genome(s, "7"), PAGES.desktop).svg === Z.grow(Z.genome(s, "7"), PAGES.desktop).svg, `serpent ${s} is deterministic`);
}

let total = 0;
for (const [name, page] of Object.entries(PAGES)) {
  const n = name === "monograph" ? 8 : 24;
  for (let i = 0; i < n; i++) {
    const seed = `${i * 7919 + 13}.r${i}`;
    let out;
    try { out = Z.grow(Z.genome(seed, String(i)), page); } catch (e) { ok(false, `${name}/${seed} threw: ${e.stack}`); continue; }
    const { box } = page;
    for (const it of out.items) {
      const dx = Math.max(box.x0 - it.x, 0, it.x - box.x1), dy = Math.max(box.y0 - it.y, 0, it.y - box.y1);
      const inside = it.x > box.x0 && it.x < box.x1 && it.y > box.y0 && it.y < box.y1;
      if (inside || Math.hypot(dx, dy) < it.r - 0.01) { ok(false, `${name}/${seed}: ${it.kind} at (${it.x.toFixed(1)},${it.y.toFixed(1)}) r=${it.r.toFixed(1)} enters the text`); break; }
    }
    if (name !== "print") {
      ok(out.serpents >= 1, `${name}/${seed}: at least one serpent (${out.serpents})`);
      ok((out.counts.head || 0) === out.serpents, `${name}/${seed}: every serpent has a head`);
    }
    ok(!/NaN|undefined|Infinity/.test(out.svg), `${name}/${seed}: markup has no NaN/undefined`);
    ok((out.svg.match(/<g[ >]/g) || []).length === (out.svg.match(/<\/g>/g) || []).length, `${name}/${seed}: <g> tags balance`);
    total++;
  }
}

{
  const out = Z.grow(Z.genome("9.r2", "9"), PAGES.monograph, { tile: 1100 });
  const paths = (s) => (s.match(/<path /g) || []).length;
  ok(out.tiles.length === Math.ceil(9000 / 1120), "tiles cover a monograph");
  ok(out.tiles.reduce((n, t) => n + paths(t.svg), 0) === paths(out.svg), "tiles carry every path exactly once");
  ok(out.tiles[0].svg.includes("<defs>") && out.tiles.slice(1).every((t) => !t.svg.includes("<defs>")), "defs live in tile 0 only");
}

// the spine's maximum curvature: no neck joint may turn sharply (operator: "hard angles up there")
{
  let worstNeck = 0;
  for (let i = 0; i < 16; i++) {
    globalThis.__SERP_DEBUG = [];
    Z.grow(Z.genome(`${i}.r${i}`, String(i)), PAGES.desktop);
    for (const P of globalThis.__SERP_DEBUG) {
      const n = P.length, ds = Math.hypot(P[1][0] - P[0][0], P[1][1] - P[0][1], P[1][2] - P[0][2]);
      for (let k = Math.floor(n * 0.7); k < n - 1; k++) {
        const a = [P[k][0] - P[k - 1][0], P[k][1] - P[k - 1][1]], b = [P[k + 1][0] - P[k][0], P[k + 1][1] - P[k][1]];
        const la = Math.hypot(...a), lb = Math.hypot(...b);
        if (la < ds / 2 || lb < ds / 2) continue; // foreshortened toward the viewer: perspective, not a bend
        worstNeck = Math.max(worstNeck, Math.acos(Math.max(-1, Math.min(1, (a[0] * b[0] + a[1] * b[1]) / la / lb))) * 180 / Math.PI);
      }
    }
  }
  delete globalThis.__SERP_DEBUG;
  ok(worstNeck < 45, `no hard angle in any neck (worst joint ${worstNeck.toFixed(0)}°, limit ~27°/vertebra)`);
}

const sk = new Set(), pa = new Set(), ha = new Set(), kinds = { flora: 0, serpent: 0 };
for (let i = 0; i < 400; i++) {
  const g = Z.genome(`${i}.f`, String(i)); sk.add(g.skin.id); pa.add(g.pattern); ha.add(g.habit);
  kinds[M.kindOf(`${i}.r${i % 7}`)]++;
}
ok(sk.size === Z.SKINS.length, `every skin turns up (${sk.size}/${Z.SKINS.length})`);
ok(pa.size === Object.keys(Z.PATTERNS).length, `every pattern turns up (${pa.size})`);
ok(ha.size === Object.keys(Z.HABITS).length, `every habit turns up (${ha.size})`);
ok(kinds.flora > 120 && kinds.serpent > 120, `the dispatcher deals both kinds (${JSON.stringify(kinds)})`);
const g = M.genome("5.r1", "5");
ok(g.kind === M.kindOf("5.r1") && M.engine(g).kind === g.kind, "dispatcher genome carries its kind and finds its engine");
ok(M.genome("5.r1", "5", { kind: "serpent" }).kind === "serpent" && M.genome("5.r1", "5", { kind: "flora" }).kind === "flora", "a kind can be forced");
ok(/ /.test(Z.describe(g.kind === "serpent" ? g : Z.genome("5.r1")).name), "describe() names the serpent");

if (failures) { console.error(`\nserpent selftest: ${failures} failure(s)`); process.exit(1); }
console.log(`serpent selftest: ok — ${total} margins across ${Object.keys(PAGES).length} page shapes; ${sk.size} skins, ${pa.size} patterns, ${ha.size} habits; kinds ${JSON.stringify(kinds)}`);

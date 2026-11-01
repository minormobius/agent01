// wormhole flora selftest — run before touching flora.js:
//   node wormhole/flora.selftest.mjs
//
// Guards what the marginalia rest on:
//   1. DETERMINISM — same (seed, biome, page) → byte-identical SVG.
//   2. THE PROSE IS SACRED — no placed element's footprint enters the text box.
//   3. WELL-FORMED — no NaN/undefined in the markup; <g> tags balance.
//   4. RANGE — across many seeds every palette and every habit turns up, and
//      the biome actually shares palette/species between papers of one field.
//   5. ANY PAGE — desktop sheet, phone sheet, print frame, a 9000px monograph.

import "./flora.js";
const F = globalThis.WORMHOLE_FLORA;

let failures = 0;
function ok(cond, msg) { if (!cond) { failures++; console.error("  ✗ " + msg); } }

const PAGES = {
  desktop: { width: 900, height: 2400, box: { x0: 112, y0: 70, x1: 788, y1: 2316 } },
  phone: { width: 380, height: 5200, box: { x0: 34, y0: 34, x1: 346, y1: 5156 } },
  print: { width: 816, height: 950, box: { x0: 104, y0: -20, x1: 712, y1: 970 } },
  monograph: { width: 900, height: 9000, box: { x0: 112, y0: 70, x1: 788, y1: 8916 } },
};

// 1. determinism
for (const s of ["1.f", "42.r3", "abc"]) {
  const a = F.grow(F.genome(s, "7"), PAGES.desktop).svg, b = F.grow(F.genome(s, "7"), PAGES.desktop).svg;
  ok(a === b, `flora ${s} is deterministic`);
}
ok(F.grow(F.genome("1.f"), PAGES.desktop).svg !== F.grow(F.genome("2.f"), PAGES.desktop).svg, "different seeds grow different margins");

// 2–3, 5
let total = 0;
for (const [name, page] of Object.entries(PAGES)) {
  for (let i = 0; i < 40; i++) {
    const seed = `${i * 7919 + 13}.f`;
    let out;
    try { out = F.grow(F.genome(seed, String(i)), page); } catch (e) { ok(false, `${name}/${seed} threw: ${e.message}`); continue; }
    const { box } = page;
    for (const it of out.items) {
      if (it.kind === "stem") continue; // stems carry their own clamp; checked below
      const dx = Math.max(box.x0 - it.x, 0, it.x - box.x1), dy = Math.max(box.y0 - it.y, 0, it.y - box.y1);
      if (Math.hypot(dx, dy) < it.r - 0.01) { ok(false, `${name}/${seed}: ${it.kind} at (${it.x.toFixed(1)},${it.y.toFixed(1)}) r=${it.r.toFixed(1)} enters the text`); break; }
    }
    for (const it of out.items.filter((t) => t.kind === "stem")) {
      if (it.x > box.x0 && it.x < box.x1 && it.y > box.y0 && it.y < box.y1) { ok(false, `${name}/${seed}: a stem runs through the text`); break; }
    }
    ok(!/NaN|undefined|Infinity/.test(out.svg), `${name}/${seed}: markup has no NaN/undefined`);
    ok((out.svg.match(/<g[ >]/g) || []).length === (out.svg.match(/<\/g>/g) || []).length, `${name}/${seed}: <g> tags balance`);
    ok(out.items.length > (name === "print" ? 8 : 25), `${name}/${seed}: something actually grew (${out.items.length})`);
    total++;
  }
}

// 4. range
const pal = new Set(), hab = new Set(), sp = new Set();
for (let i = 0; i < 400; i++) { const g = F.genome(`${i}.f`, String(i)); pal.add(g.palette.id); hab.add(g.habit); g.species.forEach((s) => sp.add(s)); }
ok(pal.size === F.PALETTES.length, `every palette turns up (${pal.size}/${F.PALETTES.length})`);
ok(hab.size === Object.keys(F.HABITS).length, `every habit turns up (${hab.size})`);
ok(sp.size === F.SPECIES.length, `every species turns up (${sp.size}/${F.SPECIES.length})`);
// a field's papers share a biome: same palette, species drawn from one pool
const kin = [1, 2, 3, 4, 5].map((k) => F.genome(`99.r${k}`, "99"));
ok(new Set(kin.map((g) => g.palette.id)).size === 1, "papers of one field share a palette");
ok(new Set(kin.map((g) => g.name + g.species.join())).size > 1, "…but each paper is its own specimen");
for (const g of kin) ok(g.species.some((s) => s === "rosette" || s === "cosmos"), "every margin has a showy bloom");
const d = F.describe(kin[0]);
ok(typeof d.line === "string" && d.line.length > 20 && d.name === kin[0].name, "describe() names the specimen");

if (failures) { console.error(`\nflora selftest: ${failures} failure(s)`); process.exit(1); }
console.log(`flora selftest: ok — ${total} margins grown across ${Object.keys(PAGES).length} page shapes; ${pal.size} palettes, ${hab.size} habits, ${sp.size} species`);

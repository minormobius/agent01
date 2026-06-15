// sprite.selftest.mjs — pins the two-mode renderer (mega/sprite/item/sprite.js).
// The renderer never reads the canvas, only issues ctx calls/prop-sets, so we record the call log
// against a stub and assert: (1) both modes are deterministic, (2) different body-plans draw
// differently, (3) every phylum renders without throwing. Run: node …/test/sprite.selftest.mjs
import { drawSprite, drawGlyph, PRIMS } from '../sprite.js';
import { rollItem, rollMany, assemble } from '../genome.js';
import { PHYLA, PHYLUM_ORDER, materialsAt } from '../taxa.js';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error('  ✗ ' + m); } };

function recCtx() {
  const log = [];
  const methods = ['save', 'restore', 'translate', 'scale', 'beginPath', 'moveTo', 'lineTo', 'arc', 'ellipse',
    'rect', 'fillRect', 'strokeRect', 'closePath', 'fill', 'stroke', 'quadraticCurveTo', 'fillText'];
  const target = {};
  for (const m of methods) target[m] = (...a) => log.push(m + '(' + a.map((x) => (typeof x === 'number' ? +x.toFixed(3) : x)).join(',') + ')');
  const ctx = new Proxy(target, { set(o, k, v) { log.push('@' + String(k) + '=' + v); o[k] = v; return true; }, get(o, k) { return o[k]; } });
  return { ctx, log };
}
const sprite = (it, o) => { const { ctx, log } = recCtx(); drawSprite(ctx, it, o); return log; };
const glyph = (it, o) => { const { ctx, log } = recCtx(); drawGlyph(ctx, it, o); return log; };
// build a canonical item for a phylum with neutral genes (covers every primitive + its params)
function specimen(ph, genes = {}) {
  const kingdom = PHYLA[ph].kingdom;
  const material = materialsAt(ph, genes.tech ?? 0.5)[0][0];
  const g = { durability: 0.5, potency: 0.5, mass: 0.5, value: 0.5, tech: 0.5, ornament: 0.5, complexity: 0.5, provenance: 0.5, ...genes };
  return assemble({ kingdom, phylum: ph, species: PHYLA[ph].species[0], material, genes: g });
}

// ── every phylum maps to a known primitive ──
{
  const prims = new Set(Object.keys(PRIMS));
  ok(PHYLUM_ORDER.every((ph) => prims.has(PHYLA[ph].prim)), 'every phylum uses a defined sprite primitive');
}

// ── determinism, both modes ──
{
  let s = true, gl = true, ne = true;
  for (const n of [0, 5, 31, 140, 999]) { const it = rollItem(n);
    s = s && sprite(it).join('\n') === sprite(it).join('\n');
    gl = gl && glyph(it).join('\n') === glyph(it).join('\n');
    ne = ne && sprite(it).length > 5 && glyph(it).length > 5;
  }
  ok(s, 'drawSprite is deterministic'); ok(gl, 'drawGlyph is deterministic'); ok(ne, 'both modes issue real ops');
}

// ── every phylum renders (both modes) without throwing, and produces ops ──
{
  let threw = false, drew = true;
  for (const ph of PHYLUM_ORDER) { try { const it = specimen(ph); drew = drew && sprite(it).length > 4 && glyph(it).length > 4; } catch (e) { threw = true; console.error('   ' + ph + ': ' + e.message); } }
  ok(!threw, 'all 31 phyla render in both modes without throwing');
  ok(drew, 'every phylum produces a non-trivial sprite + glyph');
}

// ── different body-plans draw differently (one specimen per primitive) ──
{
  const byPrim = {}; for (const ph of PHYLUM_ORDER) byPrim[PHYLA[ph].prim] ||= ph;
  const logs = Object.values(byPrim).map((ph) => sprite(specimen(ph), { frame: false }).join('\n'));
  ok(new Set(logs).size === logs.length, 'each primitive yields a distinct silhouette');
  // and distinct phyla sharing a primitive still differ by params (blade vs haft are both `long`)
  ok(sprite(specimen('blade'), { frame: false }).join('\n') !== sprite(specimen('haft'), { frame: false }).join('\n'), 'blade and haft (both `long`) differ by params');
}

// ── traits modulate the phenotype: tech spike adds rivets, ornament spike adds filigree ──
{
  const plain = specimen('plate', { ornament: 0.1, tech: 0.4 });
  const wrought = specimen('plate', { ornament: 0.95, tech: 0.95 });
  ok(sprite(plain, { frame: false }).join('\n') !== sprite(wrought, { frame: false }).join('\n'), 'a plain vs an ornate/high-tech plate render differently (genes modulate)');
  // glyph signifiers respond to tech (more pips at higher tech)
  ok(glyph(specimen('blade', { tech: 0.1 })).join('\n') !== glyph(specimen('blade', { tech: 0.95 })).join('\n'), 'glyph signifiers track tech');
}

// ── map sprite and inventory glyph are different renderings of the same item ──
{
  const it = rollItem(7);
  ok(sprite(it).join('\n') !== glyph(it).join('\n'), 'map sprite ≠ inventory glyph');
  ok(glyph(it).some((l) => /^fillText\(/.test(l)), 'the glyph mode actually stamps the verb glyph');
}

console.log(`sprite.selftest: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);

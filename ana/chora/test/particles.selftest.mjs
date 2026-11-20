// PARTICLE-CHORA's selftest: every claim the page makes, from fixed random seeds. The identifier first (each shape is
// itself, turned or not), then the paper's 3D results, its Figure 8 with its own numbers, and the 4D ones.
import * as P from '../js/particles.js';
let passes = 0, fails = 0;
const ok = (c, msg) => { if (c) { passes++; console.log(`  ✓ ${msg}`); } else { fails++; console.log(`  ✗ ${msg}`); } };
let seed = 2024; const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
const tally = (make, trials, read) => { const out = {}; for (let t = 0; t < trials; t++) { const s = P.create(make(), rnd); P.settle(s, 40000); const k = read(s); out[k] = (out[k] || 0) + 1; } return out; };
const name = (X) => { const sh = P.shapeOf(X); return sh ? (sh.exact ? sh.name : `${sh.name} structure`) : '?'; };

// the identifier
{
  const turn = (X) => { const a = rnd() * 6, b = rnd() * 6, c = Math.cos(a), s = Math.sin(a), c2 = Math.cos(b), s2 = Math.sin(b); return X.map(([x, y, z, w]) => [c * x - s * w, c2 * y - s2 * z, s2 * y + c2 * z, s * x + c * w].map((v) => v * 1.7 + 0.3)); };
  const all = Object.entries(P.SHAPES);
  ok(all.every(([k, X]) => P.identify(turn(X))?.name === k), `each of the ${all.length} reference shapes, turned, moved and scaled at random, is identified as itself (and as nothing else)`);
  ok(P.SHAPES['600-cell'].length === 120 && P.edges(P.SHAPES['600-cell']).E.length === 720 && P.edges(P.SHAPES['24-cell']).E.length === 96 && P.edges(P.SHAPES.tesseract).E.length === 32, 'references: the 600-cell 120 vertices and 720 edges, the 24-cell 96 edges, the tesseract 32');
  ok(P.identify([...P.SHAPES['16-cell'], ...P.SHAPES.tesseract.map((p) => p.map((x) => x / 2))])?.name === '24-cell', 'a 16-cell and a tesseract on one sphere are the 24-cell');
}
// the paper in 3D
{
  const r = [4, 6, 8, 12].map((n) => tally(() => P.oneKind(3, n), 3, (s) => name(P.ofType(s, 0))));
  ok(r[0].tetrahedron === 3 && r[1].octahedron === 3 && r[3].icosahedron === 3, `one kind in 3D: 4 make the tetrahedron, 6 the octahedron, 12 the icosahedron (3 runs each)`);
  const f = []; for (let t = 0; t < 3; t++) { const s = P.create(P.oneKind(3, 8), rnd); P.settle(s, 40000); f.push(P.fingerprint(P.ofType(s, 0))); }
  ok(r[2]['?'] === 3 && P.match(f[1], f[0]) < 1e-6 && P.match(f[2], f[0]) < 1e-6 && P.match(f[0], P.fingerprint(P.SHAPES.cube)) > 0.1, '8 do not make a cube: the same other shape every run (the paper: a square antiprism)');
  const c = tally(() => P.PRESETS[1].make(), 3, (s) => `${name(P.ofType(s, 0))}+${name(P.ofType(s, 1))}`), d = tally(() => P.PRESETS[2].make(), 3, (s) => `${name(P.ofType(s, 0))}+${name(P.ofType(s, 1))}`);
  ok(c['octahedron+cube'] === 3 && d['icosahedron+dodecahedron'] === 3, 'tiers: a cube settles on an octahedron seed, a dodecahedron on an icosahedron seed (3 runs each)');
  const g = tally(() => P.PRESETS[3].make(), 3, (s) => [1, 2, 3, 4].map((t) => name(P.ofType(s, t))).join('+'));
  ok(g['octahedron+cube+cuboctahedron+rhombicuboctahedron structure'] === 3, 'Figure 8, with the paper\'s numbers: octahedron, cube and cuboctahedron exact; the outer 24 have the rhombicuboctahedron\'s structure (48 edges, 4 at a corner, 8 triangles, 18 squares) but not its shape (3 runs)');
}
// one dimension up
{
  const r = [5, 8].map((n) => tally(() => P.oneKind(4, n), 3, (s) => name(P.ofType(s, 0))));
  ok(r[0]['5-cell'] === 3 && r[1]['16-cell'] === 3, 'one kind in 4D: 5 make the 5-cell, 8 the 16-cell (3 runs each)');
  const f = []; for (let t = 0; t < 4; t++) { const s = P.create(P.oneKind(4, 16), rnd); P.settle(s, 40000); f.push(P.ofType(s, 0)); }
  ok(f.every((X) => !P.shapeOf(X) && P.match(P.fingerprint(X), P.fingerprint(f[0])) < 1e-6) && P.energy(f[0]) < P.energy(P.SHAPES.tesseract), `16 do not make a tesseract: the same other shape every run, with lower energy (${P.energy(f[0]).toFixed(3)} against the tesseract's ${P.energy(P.SHAPES.tesseract).toFixed(3)})`);
  // 24: a near miss usually, the 24-cell sometimes; the 24-cell lower; shaking finds it
  const outs = []; for (let t = 0; t < 8; t++) { const s = P.create(P.oneKind(4, 24), rnd); P.settle(s, 40000); outs.push(s); }
  const hit = outs.filter((s) => P.shapeOf(P.ofType(s, 0))?.name === '24-cell'), miss = outs.filter((s) => !P.shapeOf(P.ofType(s, 0)));
  ok(miss.length >= 4 && miss.length + hit.length === 8 && miss.every((s) => P.energy(P.ofType(s, 0)) > P.energy(P.SHAPES['24-cell'])), `24 in 4D: ${miss.length} of 8 stop in a near miss, ${hit.length} make the 24-cell, which is lower in energy (${P.energy(P.SHAPES['24-cell']).toFixed(3)} against ${P.energy(P.ofType(miss[0], 0)).toFixed(3)})`);
  let found = 0, shakes = 0; for (const s of miss) { let k = 0; while (k < 12 && P.shapeOf(P.ofType(s, 0))?.name !== '24-cell') { P.shake(s, 0.6, rnd); P.settle(s, 40000); k++; } shakes += k; if (P.shapeOf(P.ofType(s, 0))?.name === '24-cell') found++; }
  ok(found === miss.length, `shaken (the page's button), every near miss found the 24-cell within 12 shakes (${shakes} shakes in all)`);
  const t = tally(() => P.PRESETS[5].make(), 3, (s) => `${name(P.ofType(s, 0))}+${name(P.ofType(s, 1))}`);
  ok(t['16-cell+tesseract'] === 3, 'tiers in 4D: a tesseract settles on a 16-cell seed (3 runs)');
  const u = tally(() => P.PRESETS[6].make(), 3, (s) => { const A = P.ofType(s, 0), B = P.ofType(s, 1), ra = Math.hypot(...A[0]), rb = Math.hypot(...B[0]); return name([...A, ...B.map((p) => p.map((x) => (x * ra) / rb))]); });
  ok(u['24-cell'] === 3, 'and the two tiers brought onto one sphere are the 24-cell (3 runs)');
  const v = tally(() => P.oneKind(4, 120), 2, (s) => name(P.ofType(s, 0)));
  ok(v['600-cell'] === 2, '120 in 4D make the 600-cell (2 runs; the cut-off widened to 6 past 40 particles)');
}
console.log(`${fails ? '✗' : '✓'} particles: ${passes} passed, ${fails} failed`);
process.exit(fails ? 1 : 0);

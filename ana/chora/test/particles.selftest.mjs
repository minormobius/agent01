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
// vibration: the stiffness is the force's derivative, the eigen-solver is exact, and the modes say what they should
{
  let worst = 0; for (const n of [5, 17, 60]) { const A = Array.from({ length: n }, () => new Float64Array(n)); for (let i = 0; i < n; i++) for (let j = 0; j <= i; j++) A[i][j] = A[j][i] = rnd() - 0.5; const { values, vectors } = P.eigSym(A); for (let k = 0; k < n; k++) { let r = 0, nn = 0; for (let i = 0; i < n; i++) { let q = 0; for (let j = 0; j < n; j++) q += A[i][j] * vectors[j][k]; r = Math.max(r, Math.abs(q - values[k] * vectors[i][k])); nn += vectors[i][k] ** 2; } worst = Math.max(worst, r, Math.abs(nn - 1)); } }
  ok(worst < 1e-12, `the eigen-solver (Householder + QL): A v = λ v and |v| = 1 to ${worst.toExponential(0)} on random symmetric matrices up to 60 × 60`);
  const fdErr = (s, tier) => {
    const F = (pos) => { const t = { ...s, pos: Float64Array.from(pos), vel: new Float64Array(s.n * 4), f: 1 }; P.step(t); return [...t.pos].map((x, k) => x - pos[k]); };
    const { K, idx } = P.stiffness(s, tier), D = s.dim, h = 1e-6; let e = 0;
    for (let ki = 0; ki < idx.length; ki++) for (let c = 0; c < D; c++) { const p1 = Float64Array.from(s.pos), p2 = Float64Array.from(s.pos); p1[idx[ki] * 4 + c] += h; p2[idx[ki] * 4 + c] -= h; const f1 = F(p1), f2 = F(p2); for (let kj = 0; kj < idx.length; kj++) for (let q = 0; q < D; q++) e = Math.max(e, Math.abs(-(f1[idx[kj] * 4 + q] - f2[idx[kj] * 4 + q]) / (2 * h) - K[kj * D + q][ki * D + c])); }
    return e;
  };
  const s8 = P.create(P.oneKind(4, 8), rnd); P.settle(s8, 40000); const st = P.create(P.PRESETS[5].make(), rnd); P.settle(st, 40000); const s12 = P.create(P.oneKind(3, 12), rnd); P.settle(s12, 40000);
  const e = Math.max(fdErr(s8, 0), fdErr(st, 1), fdErr(s12, 0));
  ok(e < 1e-8, `the stiffness matrix is minus the derivative of the simulation's own force (against finite differences, to ${e.toExponential(0)}): the 16-cell, the tesseract tier on its seed, the icosahedron`);
  const m8 = P.modes(s8), m12 = P.modes(s12), mt = P.modes(st);
  const z = (ms, t) => ms.filter((m) => m.tier === t && m.zero).length, neg = (ms) => ms.filter((m) => !m.zero && m.lam < 0).length;
  ok(z(m8, 0) === 6 && z(m12, 0) === 3 && z(mt, 0) === 6 && z(mt, 1) === 0 && neg(m8) + neg(m12) + neg(mt) === 0,
    'the silent modes are the free turns: 6 for a swarm in 4D (six planes to turn in), 3 in 3D; none for a tier held by its seed; and no mode is unstable');
  const n8 = P.notes(m8, 1e-5);
  ok(n8.length === 5 && n8.reduce((t, x) => t + x.count, 0) === 26, `the 16-cell's 26 ringing modes sound ${n8.length} notes (${n8.map((x) => `${x.count}`).join(', ')} modes on each)`);
  // a kick's energy is shared among its tier's modes exactly (the shapes are orthonormal)
  const dv = [0.3, -0.1, 0.2, 0.5], amps = P.kickModes(m8, 2, dv);
  ok(Math.abs(amps.reduce((t, a) => t + a * a, 0) - dv.reduce((t, x) => t + x * x, 0)) < 1e-12, 'a kick is shared among the modes without loss: the squares of how much it sets each ringing add up to the square of the kick');
  // and the modes are the simulation's: a small kick along one mode, run in the simulation, rings at that mode's frequency
  const mode = m8.filter((m) => !m.zero)[3], sk = { ...s8, pos: Float64Array.from(s8.pos), vel: new Float64Array(32), f: 1 };
  for (let p = 0; p < 8; p++) for (let c = 0; c < 4; c++) sk.vel[p * 4 + c] = 1e-6 * mode.shape[p * 4 + c];
  const proj = []; for (let k = 0; k < 400; k++) { P.step(sk); let a = 0; for (let p = 0; p < 8; p++) for (let c = 0; c < 4; c++) a += (sk.pos[p * 4 + c] - s8.pos[p * 4 + c]) * mode.shape[p * 4 + c]; proj.push(a); }
  const cross = []; for (let k = 1; k < proj.length; k++) if (proj[k - 1] < 0 !== proj[k] < 0) cross.push(k);
  const per = (2 * (cross[cross.length - 1] - cross[0])) / (cross.length - 1), wSim = (2 * Math.PI) / per, wDisc = Math.acos(1 - mode.lam / 2);   // the step map without drag: cos ω = 1 − λ/2
  ok(Math.abs(wSim - wDisc) / wDisc < 0.02 && Math.abs(mode.omega - wDisc) < 1e-12, `kicked along one mode in the simulation itself (drag off), the swarm swings at ${wSim.toFixed(4)} rad/step; the mode predicts ${wDisc.toFixed(4)} (its λ through the step rule)`);
  const s120 = P.create(P.oneKind(4, 120), rnd); P.settle(s120, 40000); const n120 = P.notes(P.modes(s120), 1e-5);
  ok(P.shapeOf(P.ofType(s120, 0))?.name === '600-cell' && n120.length === 23 && n120.reduce((t, x) => t + x.count, 0) === 474, `the 600-cell's 474 ringing modes sound only ${n120.length} distinct notes (up to ${Math.max(...n120.map((x) => x.count))} modes on one)`);
}
console.log(`${fails ? '✗' : '✓'} particles: ${passes} passed, ${fails} failed`);
process.exit(fails ? 1 : 0);

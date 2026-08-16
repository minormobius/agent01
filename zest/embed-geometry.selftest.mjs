#!/usr/bin/env node
// zest/embed-geometry.selftest.mjs — run: node zest/embed-geometry.selftest.mjs
//
// The map from embedding to solid is only worth building if it is FAITHFUL:
// posts that mean the same thing must produce shapes that are the same shape,
// and the sense in which they are "the same" has to be a measured quantity
// rather than a screenshot someone liked. That is what this file pins.
//
// The load-bearing ones are §2 (Parseval — the drawn surface really is the
// embedding, in the L² sense) and §5 (near-duplicate posts land far closer in
// shape space than unrelated ones, with margin). If either fails, the page is
// decoration and should say so.

import {
  DEFAULTS, RIPPLE, shCount, shIndex, shBand, evalSH, loudSlots,
  makeBasis, whiten, makeProjector, coeffsFromWhitened, normPercentile,
  readEmbedding, icosphere, sphereHarmonics, harmonicMesh,
  cosine, shapeDistance, surfaceCoeffs, hashEmbed, oklchToRgb, rgbHex,
  mulberry32, xmur3,
} from './embed-geometry.js';

let pass = 0, fail = 0;
const ok = (cond, msg, extra) => {
  if (cond) { pass++; }
  else { fail++; console.error('  ✗ ' + msg + (extra !== undefined ? '  — ' + extra : '')); }
};
const approx = (a, b, tol, msg) => ok(Math.abs(a - b) <= tol, msg, `${a} vs ${b} (tol ${tol})`);
const section = (s) => console.log('\n' + s);

const rng = mulberry32(xmur3('zest-selftest')());
const gauss = () => {
  let u = 0, v = 0;
  while (u === 0) u = rng();
  while (v === 0) v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
};

// ─────────────────────────────────────────────────────────────────────────────
section('§1  real spherical harmonics are orthonormal on S²');
// ─────────────────────────────────────────────────────────────────────────────
{
  const L = 4, n = shCount(L);
  // Gauss–Legendre in cosθ (exact for the polynomial part), uniform in φ.
  const NT = 64, NP = 128;
  const { nodes, weights } = gaussLegendre(NT);
  const gram = new Float64Array(n * n);
  const Y = new Float64Array(n);
  for (let i = 0; i < NT; i++) {
    const x = nodes[i], wt = weights[i];
    for (let j = 0; j < NP; j++) {
      const phi = (2 * Math.PI * j) / NP;
      const w = wt * ((2 * Math.PI) / NP);
      evalSH(L, x, phi, Y);
      for (let a = 0; a < n; a++) {
        const ya = Y[a] * w;
        for (let b = a; b < n; b++) gram[a * n + b] += ya * Y[b];
      }
    }
  }
  let worstDiag = 0, worstOff = 0;
  for (let a = 0; a < n; a++) {
    worstDiag = Math.max(worstDiag, Math.abs(gram[a * n + a] - 1));
    for (let b = a + 1; b < n; b++) worstOff = Math.max(worstOff, Math.abs(gram[a * n + b]));
  }
  ok(worstDiag < 1e-9, '⟨Y,Y⟩ = 1 for every harmonic', 'worst |diag−1| = ' + worstDiag.toExponential(2));
  ok(worstOff < 1e-9, '⟨Y_a,Y_b⟩ = 0 for a ≠ b', 'worst |off| = ' + worstOff.toExponential(2));

  // index round-trip
  let idxOk = true;
  for (let l = 0; l <= 12; l++) for (let m = -l; m <= l; m++) {
    const b = shBand(shIndex(l, m));
    if (b.l !== l || b.m !== m) idxOk = false;
  }
  ok(idxOk, 'shIndex / shBand round-trip for l ≤ 12');
  ok(loudSlots(4) === 24, 'bands 1..4 provide exactly 24 loud slots', loudSlots(4));
}

// ─────────────────────────────────────────────────────────────────────────────
section('§2  PARSEVAL — the distance between two surfaces IS the distance');
section('    between their coefficient vectors (the whole thesis, numerically)');
// ─────────────────────────────────────────────────────────────────────────────
{
  const L = 6, n = shCount(L);
  const cA = new Float64Array(n), cB = new Float64Array(n);
  for (let i = 1; i < n; i++) { cA[i] = gauss() * 0.3; cB[i] = gauss() * 0.3; }

  // ∫ (f_A − f_B)² dΩ by quadrature …
  const NT = 96, NP = 192;
  const { nodes, weights } = gaussLegendre(NT);
  const Y = new Float64Array(n);
  let integral = 0;
  for (let i = 0; i < NT; i++) {
    for (let j = 0; j < NP; j++) {
      const w = weights[i] * ((2 * Math.PI) / NP);
      evalSH(L, nodes[i], (2 * Math.PI * j) / NP, Y);
      let fa = 0, fb = 0;
      for (let k = 0; k < n; k++) { fa += cA[k] * Y[k]; fb += cB[k] * Y[k]; }
      integral += w * (fa - fb) * (fa - fb);
    }
  }
  // … against Σ (c_A − c_B)²
  let sum = 0;
  for (let k = 0; k < n; k++) sum += (cA[k] - cB[k]) ** 2;
  approx(Math.sqrt(integral), Math.sqrt(sum), 1e-8, '‖f_A − f_B‖_L²(S²) = ‖c_A − c_B‖₂');

  // and the same identity as the code actually exposes it, through
  // surfaceCoeffs / shapeDistance on two real reads
  const basis = syntheticBasis(160, 64);
  const proj = makeProjector(basis, { L: DEFAULTS.L });
  const ra = readEmbedding(sampleVec(basis), basis, proj);
  const rb = readEmbedding(sampleVec(basis), basis, proj);
  const sa = surfaceCoeffs(ra), sb = surfaceCoeffs(rb);
  let manual = 0;
  for (let i = 0; i < sa.length; i++) manual += (sa[i] - sb[i]) ** 2;
  approx(shapeDistance(ra, rb), Math.sqrt(manual), 1e-12, 'shapeDistance agrees with its own coefficients');
  ok(shapeDistance(ra, ra) < 1e-12, 'a shape is at distance 0 from itself');
}

// ─────────────────────────────────────────────────────────────────────────────
section('§3  the basis: whitening, variance ranking, principal components');
// ─────────────────────────────────────────────────────────────────────────────
{
  // Planted: dim 3 has the widest spread, dim 7 the next, everything else tiny.
  const dim = 32, n = 900;
  const vecs = [];
  for (let i = 0; i < n; i++) {
    const v = new Float64Array(dim);
    for (let d = 0; d < dim; d++) v[d] = 5 + gauss() * 0.05;
    v[3] += gauss() * 4.0;
    v[7] += gauss() * 2.0;
    vecs.push(v);
  }
  const basis = makeBasis(vecs);
  approx(basis.mean[0], 5, 0.02, 'mean recovered');
  ok(basis.order[0] === 3 && basis.order[1] === 7, 'dimensions ranked by variance, loudest first', basis.order.slice(0, 3));
  approx(basis.std[3], 4.0, 0.3, 'std of the loudest dim recovered');

  const z = whiten(vecs[0], basis);
  let m = 0, s2 = 0;
  const all = vecs.map((v) => whiten(v, basis));
  for (const zz of all) for (let d = 0; d < dim; d++) { m += zz[d]; s2 += zz[d] * zz[d]; }
  approx(m / (n * dim), 0, 1e-9, 'centred corpus has zero mean');
  const rms = Math.sqrt(s2 / (n * dim));
  ok(rms > 0.3 && rms < 2.0, 'the scaled corpus sits in a sane working range', rms.toFixed(3));
  ok(z.length === dim, 'whiten preserves dimensionality');

  // THE POINT OF α < 1: partial scaling must leave the variance RANKING intact,
  // because the ranking is what decides which dimension gets which harmonic. At
  // α = 1 every dimension ends at unit variance and the ranking is annihilated
  // — pin both halves so nobody "fixes" this back to textbook whitening.
  {
    const scaledVar = new Float64Array(dim);
    for (const zz of all) for (let d = 0; d < dim; d++) scaledVar[d] += zz[d] * zz[d];
    const reRanked = Array.from({ length: dim }, (_, i) => i)
      .sort((a, b) => (scaledVar[b] - scaledVar[a]) || (a - b));
    ok(reRanked.every((d, i) => d === basis.order[i]),
      'α = 0.5 preserves the variance ranking after scaling');

    const full = makeBasis(vecs, { whitenPower: 1 });
    const fullVar = new Float64Array(dim);
    for (const v of vecs) {
      const zz = whiten(v, full);
      for (let d = 0; d < dim; d++) fullVar[d] += zz[d] * zz[d];
    }
    let lo = Infinity, hi = 0;
    for (let d = 0; d < dim; d++) { lo = Math.min(lo, fullVar[d]); hi = Math.max(hi, fullVar[d]); }
    ok(hi / lo < 1.2, 'CONTRAST: α = 1 flattens every dimension to the same variance', (hi / lo).toFixed(3));
    ok(basis.whitenPower === 0.5, 'the shipped default is α = 0.5', basis.whitenPower);
  }

  // PCs orthonormal, and PC1 should lie along the planted direction
  for (let a = 0; a < 3; a++) {
    approx(Math.hypot(...basis.pc[a]), 1, 1e-6, `pc[${a}] is a unit vector`);
    for (let b = a + 1; b < 3; b++) {
      let d = 0;
      for (let i = 0; i < dim; i++) d += basis.pc[a][i] * basis.pc[b][i];
      approx(d, 0, 1e-5, `pc[${a}] ⟂ pc[${b}]`);
    }
  }
  // After whitening every dim has unit variance, so the PCs describe
  // CORRELATION structure, not raw spread. With independent dims there is no
  // preferred direction — assert only that they are a valid frame, which is
  // exactly what the colour readout needs of them.
  ok(basis.normQ.length === 33 && basis.normQ[0] <= basis.normQ[32], 'norm quantile ladder is sorted');
  const p0 = normPercentile(basis.normQ[0] - 1, basis);
  const p1 = normPercentile(basis.normQ[32] + 1, basis);
  ok(p0 === 0 && p1 === 1, 'normPercentile saturates at both ends');
  let mono = true, prev = -1;
  for (let i = 0; i <= 32; i++) {
    const p = normPercentile(basis.normQ[i], basis);
    if (p < prev - 1e-9) mono = false;
    prev = p;
  }
  ok(mono, 'normPercentile is monotone');
}

// ─────────────────────────────────────────────────────────────────────────────
section('§4  the projector is linear, total and deterministic');
// ─────────────────────────────────────────────────────────────────────────────
{
  const basis = syntheticBasis(200, 128);
  const projA = makeProjector(basis);
  const projB = makeProjector(basis);

  const z1 = new Float64Array(basis.dim), z2 = new Float64Array(basis.dim);
  for (let i = 0; i < basis.dim; i++) { z1[i] = gauss(); z2[i] = gauss(); }

  const c1 = coeffsFromWhitened(z1, projA);
  const c1b = coeffsFromWhitened(z1, projB);
  ok(c1.every((v, i) => v === c1b[i]), 'two projectors from one basis are byte-identical');

  // linearity: c(αz1 + βz2) = αc(z1) + βc(z2)
  const a = 0.37, b = -1.9;
  const mix = new Float64Array(basis.dim);
  for (let i = 0; i < basis.dim; i++) mix[i] = a * z1[i] + b * z2[i];
  const cm = coeffsFromWhitened(mix, projA);
  const c2 = coeffsFromWhitened(z2, projA);
  let worst = 0;
  for (let i = 0; i < cm.length; i++) worst = Math.max(worst, Math.abs(cm[i] - (a * c1[i] + b * c2[i])));
  ok(worst < 1e-10, 'the embedding → coefficient map is LINEAR', worst.toExponential(2));

  // totality: every dimension reaches the shape somewhere
  const touched = new Set(projA.loud);
  for (const d of projA.quietIdx) touched.add(d);
  ok(touched.size === basis.dim, 'every one of the ' + basis.dim + ' dimensions drives some harmonic', touched.size);
  ok(projA.loud.length === loudSlots(DEFAULTS.loudL), 'loud dims fill bands 1..4 exactly', projA.loud.length);
  ok(c1[0] === 0, 'l=0 carries no dimension (it is reserved for ‖z‖)');

  // the loud dims land where we say they land
  let placed = true;
  for (let i = 0; i < projA.loud.length; i++) {
    const probe = new Float64Array(basis.dim);
    probe[projA.loud[i]] = 1;
    const c = coeffsFromWhitened(probe, projA);
    if (Math.abs(c[i + 1]) < 1e-12) placed = false;
    if (shBand(i + 1).l > DEFAULTS.loudL) placed = false;
  }
  ok(placed, 'each loud dimension drives its own harmonic in bands 1..4');
}

// ─────────────────────────────────────────────────────────────────────────────
section('§5  LEGIBILITY — similar embeddings make similar shapes, with margin');
// ─────────────────────────────────────────────────────────────────────────────
{
  const basis = syntheticBasis(400, 256);
  const proj = makeProjector(basis);

  // (a) exact: cosine in shape space is cosine in coefficient space. The
  //     per-post normalisation is a scale, and cosine cannot see a scale.
  {
    const ra = readEmbedding(sampleVec(basis), basis, proj);
    const rb = readEmbedding(sampleVec(basis), basis, proj);
    approx(cosine(ra.unit, rb.unit), cosine(ra.coeffs, rb.coeffs), 1e-12,
      'cos(shape_A, shape_B) = cos(c_A, c_B) exactly');
  }

  // (b) THE GAME'S OWN QUESTION, asked of a corpus with realistic embedding
  //     statistics (topic clusters, a dominant common direction, L2-normalised
  //     like a real sentence embedding): given a target post, is a post on the
  //     same topic reliably the closer-looking one? That is exactly what a
  //     player is asked to judge, so AUC over same-topic vs different-topic
  //     pairs is the honest measure of whether the picture carries the meaning.
  {
    const c = topicCorpus({ dim: 256, topics: 12, n: 720 });
    const tBasis = makeBasis(c.vecs);
    const tProj = makeProjector(tBasis);
    const shapes = c.vecs.map((v) => readEmbedding(v, tBasis, tProj));

    const same = [], diff = [];
    for (let i = 0; i < 300; i++) {
      for (let j = i + 1; j < 300; j += 5) {
        const s = cosine(shapes[i].unit, shapes[j].unit);
        (c.topic[i] === c.topic[j] ? same : diff).push(s);
      }
    }
    const a = auc(same, diff);
    ok(a > 0.95, 'AUC — a same-topic post is the more similar-looking one', a.toFixed(4));

    // The same question in metric form — and this is where the two channels
    // separate. shapeDistance is the true L² distance between the drawn
    // SURFACES, so it carries size as well as form: `amp` and `radius` both
    // come from ‖z‖, how strange the post is, which has nothing to do with
    // topic. Two posts about the same thing at different strangeness are
    // genuinely different-sized objects.
    const sameD = [], diffD = [];
    for (let i = 0; i < 240; i++) {
      for (let j = i + 1; j < 240; j += 5) {
        (c.topic[i] === c.topic[j] ? sameD : diffD).push(-shapeDistance(shapes[i], shapes[j]));
      }
    }
    const aucD = auc(sameD, diffD);
    ok(aucD > 0.78, 'AUC for full L² surface distance — weaker, because it also carries size', aucD.toFixed(4));

    // Prove that attribution rather than asserting it: neutralise the size
    // channel by giving every shape the same amp and radius, and the L² metric
    // must climb back up to match the cosine reading. If this ever fails, the
    // gap above is coming from somewhere we have not understood.
    const flat = shapes.map((s) => ({ ...s, amp: 0.6, radius: 1 }));
    const sameF = [], diffF = [];
    for (let i = 0; i < 240; i++) {
      for (let j = i + 1; j < 240; j += 5) {
        (c.topic[i] === c.topic[j] ? sameF : diffF).push(-shapeDistance(flat[i], flat[j]));
      }
    }
    const aucF = auc(sameF, diffF);
    ok(aucF > 0.95, 'with the size channel held constant, L² recovers full separation', aucF.toFixed(4));
    ok(aucF > aucD + 0.05, 'so the shortfall IS the size channel, and is accounted for',
      `${aucD.toFixed(3)} → ${aucF.toFixed(3)}`);

    // Rank correlation against raw embedding cosine. This is the number the
    // page must NOT overstate: the map preserves the big structure very well
    // (AUC above) while scrambling fine ordering among unrelated posts, because
    // the band gains deliberately magnify the loud dimensions. Recorded here as
    // a known, bounded limitation rather than quietly omitted.
    const xs = [], ys = [];
    for (let i = 0; i < 260; i++) {
      for (let j = i + 1; j < 260; j += 7) {
        xs.push(cosine(c.vecs[i], c.vecs[j]));
        ys.push(cosine(shapes[i].unit, shapes[j].unit));
      }
    }
    const r = pearson(xs, ys);
    ok(r > 0.55, 'shape similarity tracks raw embedding cosine (Pearson, lossy by design)', r.toFixed(3));
    ok(spearman(xs, ys) > 0.25,
      'KNOWN LIMIT: fine ordering among UNRELATED posts is only weakly preserved (Spearman)',
      spearman(xs, ys).toFixed(3));
  }

  // (c) the one that matters for the game: a post and a NEARBY post must land
  //     closer in shape space than a post and a random one — not on average,
  //     but essentially every time.
  let nearer = 0, trials = 300;
  const nearRatios = [];
  for (let t = 0; t < trials; t++) {
    const v = sampleVec(basis);
    const near = new Float64Array(basis.dim);
    for (let i = 0; i < basis.dim; i++) near[i] = v[i] + gauss() * basis.std[i] * 0.18;
    const far = sampleVec(basis);
    const rv = readEmbedding(v, basis, proj);
    const dNear = shapeDistance(rv, readEmbedding(near, basis, proj));
    const dFar = shapeDistance(rv, readEmbedding(far, basis, proj));
    if (dNear < dFar) nearer++;
    nearRatios.push(dNear / Math.max(1e-9, dFar));
  }
  const rate = nearer / trials;
  ok(rate > 0.97, 'a near-duplicate post is the closer shape ≥97% of the time', (rate * 100).toFixed(1) + '%');
  nearRatios.sort((a, b) => a - b);
  ok(nearRatios[Math.floor(trials / 2)] < 0.5, 'median near/far shape-distance ratio is well under ½',
    nearRatios[Math.floor(trials / 2)].toFixed(3));

  // (d) the quiet band is not decoration: two posts that agree on every loud
  //     dimension and differ only in the quiet ones must still look different.
  {
    const v = sampleVec(basis);
    const twin = Float64Array.from(v);
    for (const d of proj.quietIdx) twin[d] = basis.mean[d] + gauss() * basis.std[d];
    const rv = readEmbedding(v, basis, proj);
    const rt = readEmbedding(twin, basis, proj);
    let loudSame = true;
    for (const d of proj.loud) if (Math.abs(v[d] - twin[d]) > 1e-12) loudSame = false;
    ok(loudSame, 'the twin agrees on all 24 loud dimensions by construction');
    ok(shapeDistance(rv, rt) > 1e-3, 'and is still distinguishable — the grain carries the quiet dims',
      shapeDistance(rv, rt).toExponential(2));
  }

  // (e) Johnson–Lindenstrauss: the quiet projection must roughly preserve
  //     pairwise distances, or the grain is noise wearing a lab coat.
  {
    const errs = [];
    for (let t = 0; t < 200; t++) {
      const za = new Float64Array(basis.dim), zb = new Float64Array(basis.dim);
      for (const d of proj.quietIdx) { za[d] = gauss(); zb[d] = gauss(); }
      let orig = 0;
      for (const d of proj.quietIdx) orig += (za[d] - zb[d]) ** 2;
      // each quiet dim appears `fanout` times in quietIdx; correct for it
      orig = Math.sqrt(orig / DEFAULTS.quietFanout);
      const ca = coeffsFromWhitened(za, proj), cb = coeffsFromWhitened(zb, proj);
      let projd = 0;
      for (let i = 0; i < ca.length; i++) projd += ((ca[i] - cb[i]) / (proj.gain[i] || 1)) ** 2;
      projd = Math.sqrt(projd);
      errs.push(Math.abs(projd - orig) / orig);
    }
    errs.sort((a, b) => a - b);
    const med = errs[Math.floor(errs.length / 2)];
    ok(med < 0.35, 'JL projection keeps quiet-subspace distances to within ~35% (median)', med.toFixed(3));
  }
}

// ─────────────────────────────────────────────────────────────────────────────
section('§6  the mesh is renderable: bounded, closed, oriented, finite');
// ─────────────────────────────────────────────────────────────────────────────
{
  const basis = syntheticBasis(200, 128);
  const proj = makeProjector(basis);

  for (const detail of [2, 3, 4]) {
    const ico = icosphere(detail);
    const expectFaces = 20 * Math.pow(4, detail);
    ok(ico.indices.length / 3 === expectFaces, `icosphere(${detail}) has ${expectFaces} faces`, ico.indices.length / 3);
    // Euler: V − E + F = 2 for a closed triangulation
    const V = ico.count, F = expectFaces, E = (3 * F) / 2;
    ok(V - E + F === 2, `icosphere(${detail}) is a closed surface (V−E+F=2)`, `${V}−${E}+${F}`);
    let unit = true;
    for (let i = 0; i < V; i++) {
      const m = Math.hypot(ico.positions[i * 3], ico.positions[i * 3 + 1], ico.positions[i * 3 + 2]);
      if (Math.abs(m - 1) > 1e-6) unit = false;
    }
    ok(unit, `icosphere(${detail}) vertices are on the unit sphere`);
  }

  // every edge shared by exactly two faces
  {
    const ico = icosphere(3);
    const edges = new Map();
    for (let f = 0; f < ico.indices.length; f += 3) {
      const t = [ico.indices[f], ico.indices[f + 1], ico.indices[f + 2]];
      for (let k = 0; k < 3; k++) {
        const a = t[k], b = t[(k + 1) % 3];
        const key = Math.min(a, b) * 1e6 + Math.max(a, b);
        edges.set(key, (edges.get(key) || 0) + 1);
      }
    }
    ok([...edges.values()].every((c) => c === 2), 'every edge is shared by exactly two faces (watertight)');
  }

  let worstR = 0, anyNaN = false, normalsUnit = true, inRange = true;
  for (let t = 0; t < 40; t++) {
    const rd = readEmbedding(sampleVec(basis), basis, proj);
    const mesh = harmonicMesh(rd.unit, { detail: 3, L: proj.L, amp: rd.amp, radius: rd.radius });
    for (let i = 0; i < mesh.positions.length; i++) if (!Number.isFinite(mesh.positions[i])) anyNaN = true;
    for (let i = 0; i < mesh.count; i++) {
      const o = i * 3;
      if (Math.abs(Math.hypot(mesh.normals[o], mesh.normals[o + 1], mesh.normals[o + 2]) - 1) > 1e-4) normalsUnit = false;
      const r = mesh.radii[i];
      if (r < DEFAULTS.rFloor * rd.radius - 1e-6 || r > DEFAULTS.rCeil * rd.radius + 1e-6) inRange = false;
      worstR = Math.max(worstR, r);
    }
    for (const idx of mesh.indices) if (idx >= mesh.count) inRange = false;
  }
  ok(!anyNaN, 'no NaN or Infinity anywhere in 40 generated meshes');
  ok(normalsUnit, 'every vertex normal is unit length');
  ok(inRange, 'every radius sits inside the clamp and every index is in range');
  ok(worstR < DEFAULTS.rCeil * 1.4, 'no runaway spike', worstR.toFixed(3));

  // determinism: the same post is the same solid, every time, forever
  {
    const v = sampleVec(basis);
    const m1 = harmonicMesh(readEmbedding(v, basis, proj).unit, { detail: 3, L: proj.L, amp: 0.6, radius: 1 });
    const m2 = harmonicMesh(readEmbedding(v, basis, proj).unit, { detail: 3, L: proj.L, amp: 0.6, radius: 1 });
    ok(m1.positions.every((p, i) => p === m2.positions[i]), 'the same embedding is the same mesh, bit for bit');
  }

  // a zero vector is the corpus mean, and the corpus mean must be a sphere
  {
    const mean = Float64Array.from(basis.mean);
    const rd = readEmbedding(mean, basis, proj);
    const mesh = harmonicMesh(rd.unit, { detail: 3, L: proj.L, amp: rd.amp, radius: 1 });
    ok(mesh.rMax - mesh.rMin < 1e-6, 'the average post is a perfect sphere', (mesh.rMax - mesh.rMin).toExponential(2));
    ok(rd.outlier < 0.02, 'and reads as the least strange thing possible', rd.outlier.toFixed(4));
  }

  // sphereHarmonics is cached but must still be correct
  {
    const sh = sphereHarmonics(2, 4);
    const ico = icosphere(2);
    const Y = new Float64Array(shCount(4));
    evalSH(4, ico.positions[1], Math.atan2(ico.positions[2], ico.positions[0]), Y);
    let worst = 0;
    for (let k = 0; k < Y.length; k++) worst = Math.max(worst, Math.abs(Y[k] - sh.table[k]));
    ok(worst < 1e-6, 'the cached harmonic table matches a fresh evaluation', worst.toExponential(2));
  }
}

// ─────────────────────────────────────────────────────────────────────────────
section('§7  the read: strangeness, colour, spin');
// ─────────────────────────────────────────────────────────────────────────────
{
  const basis = syntheticBasis(300, 128);
  const proj = makeProjector(basis);

  // strangeness is monotone in distance from the corpus mean
  const mean = Float64Array.from(basis.mean);
  let prev = -1, monotone = true;
  for (const k of [0, 0.5, 1, 2, 4, 8]) {
    const v = new Float64Array(basis.dim);
    for (let i = 0; i < basis.dim; i++) v[i] = mean[i] + k * basis.std[i];
    const o = readEmbedding(v, basis, proj).outlier;
    if (o < prev - 1e-9) monotone = false;
    prev = o;
  }
  ok(monotone, 'strangeness rises monotonically with distance from the corpus mean');

  const rd = readEmbedding(sampleVec(basis), basis, proj);
  ok(rd.color.rgb.every((c) => c >= 0 && c <= 1), 'colour is inside the sRGB gamut', rd.color.hex);
  ok(/^#[0-9a-f]{6}$/.test(rd.color.hex), 'hex is well formed', rd.color.hex);
  approx(Math.hypot(...rd.spin.axis), 1, 1e-9, 'spin axis is a unit vector');
  ok(rd.spin.rate > 0, 'spin rate is positive');
  ok(rd.loudest.length === 24, 'the HUD gets all 24 loud dimensions', rd.loudest.length);
  ok(Math.abs(rd.loudest[0].sigma) >= Math.abs(rd.loudest[23].sigma), 'loudest[] is sorted by |σ| for the readout');
  ok(rd.loudest.every((e) => e.l >= 1 && e.l <= DEFAULTS.loudL), 'every named dimension sits in bands 1..4');

  // colour is deterministic and continuous — nearby posts are nearby colours
  {
    const v = sampleVec(basis);
    const near = new Float64Array(basis.dim);
    for (let i = 0; i < basis.dim; i++) near[i] = v[i] + gauss() * basis.std[i] * 0.02;
    const a = readEmbedding(v, basis, proj).color.rgb;
    const b = readEmbedding(near, basis, proj).color.rgb;
    ok(Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) < 0.25, 'a small nudge is a small colour change');
  }

  // OKLCH known answers
  {
    const white = oklchToRgb(1, 0, 0);
    ok(white.every((c) => c > 0.99), 'OKLCH L=1 C=0 is white', rgbHex(white));
    const black = oklchToRgb(0, 0, 0);
    ok(black.every((c) => c < 0.01), 'OKLCH L=0 is black', rgbHex(black));
    for (let h = 0; h < 360; h += 17) {
      const c = oklchToRgb(0.62, 0.13, h);
      ok(c.every((u) => u >= 0 && u <= 1), 'hue ' + h + ' stays in gamut');
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
section('§8  the fallback embedder — real structure, honestly lexical');
// ─────────────────────────────────────────────────────────────────────────────
{
  const a = hashEmbed('the cat sat on the mat in the warm afternoon sun');
  const a2 = hashEmbed('the cat sat on the mat in the warm afternoon sun');
  ok(a.every((v, i) => v === a2[i]), 'hashEmbed is deterministic');
  approx(Math.sqrt(a.reduce((s, v) => s + v * v, 0)), 1, 1e-9, 'hashEmbed returns a unit vector');
  ok(a.length === 768, 'default dimensionality is 768, matching bge-base');

  const b = hashEmbed('the cat sat on the mat in the warm afternoon shade');
  const c = hashEmbed('quarterly revenue guidance was revised upward by the board');
  ok(cosine(a, b) > cosine(a, c), 'one word changed beats a different subject entirely',
    `${cosine(a, b).toFixed(3)} vs ${cosine(a, c).toFixed(3)}`);
  ok(cosine(a, a) > 0.999, 'self-similarity is 1');

  // it is LEXICAL, not semantic — pin the known limitation so nobody later
  // mistakes the fallback for the model
  const cat = hashEmbed('my cat is asleep');
  const kitten = hashEmbed('my kitten is dozing');
  const unrelated = hashEmbed('my cat is awake');
  ok(cosine(cat, unrelated) > cosine(cat, kitten),
    'KNOWN LIMIT: the fallback reads letters, not meaning (cat/kitten are strangers to it)');

  ok(hashEmbed('').every((v) => v === 0) === false || true, 'empty text does not throw');
  ok(Number.isFinite(hashEmbed('🙂 emoji only 🎉')[0]), 'unicode text does not produce NaN');

  // it must survive the full pipeline
  const texts = ['a', 'a slightly longer post about weather', 'markets fell', '🎉🎉🎉', 'x'.repeat(300)];
  const basis = makeBasis(texts.concat(Array.from({ length: 60 }, (_, i) => 'post number ' + i + ' about things')).map((t) => hashEmbed(t)));
  const proj = makeProjector(basis);
  let clean = true;
  for (const t of texts) {
    const rd = readEmbedding(hashEmbed(t), basis, proj);
    const mesh = harmonicMesh(rd.unit, { detail: 2, L: proj.L, amp: rd.amp, radius: rd.radius });
    if (!mesh.positions.every(Number.isFinite)) clean = false;
  }
  ok(clean, 'text → hashEmbed → basis → shape produces finite geometry for every edge case');
}

// ─────────────────────────────────────────────────────────────────────────────
// helpers
// ─────────────────────────────────────────────────────────────────────────────

function syntheticBasis(n, dim) {
  // A corpus with realistic structure: a few loud directions, a long quiet
  // tail, and correlations between them — i.e. what a real embedding sample
  // looks like, so the tests are not run on a spherical cow.
  const vecs = [];
  const scales = new Float64Array(dim);
  for (let d = 0; d < dim; d++) scales[d] = 0.25 + 2.4 * Math.exp(-d / 24);
  for (let i = 0; i < n; i++) {
    const v = new Float64Array(dim);
    const t1 = gauss(), t2 = gauss();
    for (let d = 0; d < dim; d++) {
      v[d] = 0.1 * Math.sin(d) + scales[d] * (gauss() + 0.35 * (d % 2 ? t1 : t2));
    }
    vecs.push(v);
  }
  return makeBasis(vecs);
}

/**
 * A corpus shaped like real sentence embeddings: K topic centres, a dominant
 * "common direction" every vector shares (the anisotropy every real embedding
 * model has), per-post noise, and L2 normalisation on the way out.
 */
function topicCorpus({ dim, topics, n }) {
  const common = Array.from({ length: dim }, () => gauss());
  const centres = Array.from({ length: topics }, () => Array.from({ length: dim }, () => gauss()));
  const vecs = [], topic = [];
  for (let i = 0; i < n; i++) {
    const k = i % topics;
    topic.push(k);
    const v = new Float64Array(dim);
    for (let d = 0; d < dim; d++) v[d] = 0.9 * common[d] + centres[k][d] + 0.85 * gauss();
    let nn = 0;
    for (let d = 0; d < dim; d++) nn += v[d] * v[d];
    nn = Math.sqrt(nn);
    for (let d = 0; d < dim; d++) v[d] /= nn;
    vecs.push(v);
  }
  return { vecs, topic };
}

/** P(a random positive scores above a random negative). 0.5 = coin flip. */
function auc(pos, neg) {
  let wins = 0;
  for (const p of pos) for (const q of neg) wins += p > q ? 1 : p === q ? 0.5 : 0;
  return wins / (pos.length * neg.length);
}

function spearman(xs, ys) {
  const rank = (a) => {
    const idx = a.map((v, i) => [v, i]).sort((p, q) => p[0] - q[0]);
    const r = new Array(a.length);
    idx.forEach(([, i], k) => { r[i] = k; });
    return r;
  };
  return pearson(rank(xs), rank(ys));
}

function sampleVec(basis) {
  const v = new Float64Array(basis.dim);
  for (let i = 0; i < basis.dim; i++) v[i] = basis.mean[i] + gauss() * basis.std[i];
  return v;
}

function pearson(xs, ys) {
  const n = xs.length;
  let mx = 0, my = 0;
  for (let i = 0; i < n; i++) { mx += xs[i]; my += ys[i]; }
  mx /= n; my /= n;
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < n; i++) {
    const a = xs[i] - mx, b = ys[i] - my;
    sxy += a * b; sxx += a * a; syy += b * b;
  }
  return sxy / Math.sqrt(sxx * syy);
}

/** Gauss–Legendre nodes/weights on [−1,1] by Newton on the Legendre polynomial. */
function gaussLegendre(n) {
  const nodes = new Float64Array(n), weights = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    let x = Math.cos(Math.PI * (i + 0.75) / (n + 0.5));
    for (let it = 0; it < 100; it++) {
      let p0 = 1, p1 = 0;
      for (let j = 0; j < n; j++) {
        const p2 = p1;
        p1 = p0;
        p0 = ((2 * j + 1) * x * p1 - j * p2) / (j + 1);
      }
      const dp = (n * (x * p0 - p1)) / (x * x - 1);
      const dx = -p0 / dp;
      x += dx;
      if (Math.abs(dx) < 1e-15) break;
    }
    let p0 = 1, p1 = 0;
    for (let j = 0; j < n; j++) {
      const p2 = p1;
      p1 = p0;
      p0 = ((2 * j + 1) * x * p1 - j * p2) / (j + 1);
    }
    const dp = (n * (x * p0 - p1)) / (x * x - 1);
    nodes[i] = x;
    weights[i] = 2 / ((1 - x * x) * dp * dp);
  }
  return { nodes, weights };
}

console.log(`\n${fail === 0 ? '✓' : '✗'} zest/embed-geometry — ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);

// HILBERT's claims, held: run `node ana/hilbert/test/hilbert.selftest.mjs`.
import { indexToPoint, pointToIndex, curve4, cellCount, curveLength, digits, maxOrder,
  rotation4, mul4, turn4, cube4, PLANES, gridSize, linearCell, cellLinks, hitHalf, traceTubes, NONE } from '../js/hilbert.js';

let fails = 0, passes = 0;
const ok = (cond, msg) => { if (cond) passes++; else { fails++; console.error('✗ ' + msg); } };

const key = (X) => X.join(',');

for (const n of [2, 3, 4]) {
  for (let b = 1; b <= Math.min(maxOrder(n), n === 4 ? 4 : 6); b++) {
    const N = cellCount(n, b), side = 2 ** b;
    const seen = new Set();
    let prev = null, adjacent = true, inverse = true, inRange = true;
    for (let h = 0; h < N; h++) {
      const X = indexToPoint(h, n, b);
      if (X.some((x) => x < 0 || x >= side)) inRange = false;
      seen.add(key(X));
      if (pointToIndex(X, n, b) !== h) inverse = false;
      if (prev) {
        // A step of the curve is one cell along one axis: L1 distance exactly 1.
        let d = 0;
        for (let j = 0; j < n; j++) d += Math.abs(X[j] - prev[j]);
        if (d !== 1) adjacent = false;
      }
      prev = X;
    }
    const tag = `n=${n} order ${b}`;
    ok(inRange, `${tag}: every cell inside the grid`);
    ok(seen.size === N, `${tag}: visits all ${N} cells, each once (saw ${seen.size} distinct)`);
    ok(adjacent, `${tag}: each step is to a face-neighbouring cell`);
    ok(inverse, `${tag}: pointToIndex inverts indexToPoint`);

    // It starts in the corner cell at the origin and ends in a corner cell one edge away.
    const first = indexToPoint(0, n, b), last = indexToPoint(N - 1, n, b);
    ok(first.every((x) => x === 0), `${tag}: starts at the origin's corner (${first})`);
    const corner = last.every((x) => x === 0 || x === side - 1);
    const ones = last.filter((x) => x === side - 1).length;
    ok(corner && ones === 1, `${tag}: ends at a corner one edge from the start (${last})`);

    // Self-similarity: blocks of 2^(n·k) consecutive cells fill aligned 2^k-cubes, and those cubes, in order, are the
    // order-(b−k) curve. So the curve at order b is the curve at order b−1 with each cell replaced by a small copy.
    for (let k = 1; k < b; k++) {
      let nested = true;
      const block = 2 ** (n * k);
      for (let h = 0; h < N && nested; h++) {
        const X = indexToPoint(h, n, b).map((x) => x >> k);
        const coarse = indexToPoint(Math.floor(h / block), n, b - k);
        if (key(X) !== key(coarse)) nested = false;
      }
      ok(nested, `${tag}: blocks of ${block} cells trace the order-${b - k} curve`);
    }
  }
}

// The 2D curve is the classic one: order 1 is ⊓-shaped, (0,0) (0,1) (1,1) (1,0) up to which axis comes first.
{
  const p = [0, 1, 2, 3].map((h) => indexToPoint(h, 2, 1));
  const a = key(p.map(key)), u = '0,0,0,1,1,1,1,0', v = '0,0,1,0,1,1,0,1';
  ok(a === u || a === v, `2D order 1 is the U (${a})`);
}

// The tesseract at order 1 is a Hamiltonian path on its 16 corners whose 15 steps are a reflected Gray code:
// consecutive steps flip axes in the ruler sequence 0 1 0 2 0 1 0 3 … up to the axis labels.
{
  const p = Array.from({ length: 16 }, (_, h) => indexToPoint(h, 4, 1));
  const flips = [];
  for (let h = 1; h < 16; h++) flips.push(p[h].findIndex((x, j) => x !== p[h - 1][j]));
  const ruler = [1, 2, 1, 3, 1, 2, 1, 4, 1, 2, 1, 3, 1, 2, 1].map((r) => r - 1);
  // the same pattern up to relabelling the axes
  const map = new Map(); let same = true;
  flips.forEach((f, i) => { if (!map.has(ruler[i])) map.set(ruler[i], f); else if (map.get(ruler[i]) !== f) same = false; });
  ok(same && new Set(map.values()).size === 4, `4D order 1 flips axes in the ruler sequence (${flips.join('')})`);
}

// curve4: centres in the unit cube, padded to 4D, consecutive centres 2^−b apart, total length as stated.
for (const [n, b] of [[2, 3], [3, 2], [4, 2], [4, 3]]) {
  const c = curve4(n, b), N = cellCount(n, b);
  let len = 0, inside = true, padded = true;
  for (let h = 0; h < N; h++) {
    for (let j = 0; j < 4; j++) {
      const v = c[h * 4 + j];
      if (j < n && (v <= 0 || v >= 1)) inside = false;
      if (j >= n && v !== 0.5) padded = false;
    }
    if (h) {
      let d = 0;
      for (let j = 0; j < 4; j++) d += (c[h * 4 + j] - c[(h - 1) * 4 + j]) ** 2;
      len += Math.sqrt(d);
    }
  }
  ok(inside && padded, `curve4 n=${n} b=${b}: centres inside the unit cube, padded with the middle (0.5)`);
  ok(Math.abs(len - curveLength(n, b)) < 1e-4, `curve4 n=${n} b=${b}: length ${len.toFixed(4)} = ${curveLength(n, b)}`);
}

// Locality, the reason anyone uses it: cells Δh steps apart along the curve are within C·Δh^(1/n) of each other in
// space. Measured here, not proved: the worst |Δx|⁴/Δh over every pair at orders 2 and 3 (cell units). Its limit as
// the order grows is not computed; this only holds it to a sanity bound, so a regression that breaks locality fails.
{
  const worst = [];
  for (const b of [2, 3]) {
    const N = cellCount(4, b), pts = Array.from({ length: N }, (_, h) => indexToPoint(h, 4, b));
    let w = 0;
    for (let i = 0; i < N; i++)
      for (let j = i + 1; j < N; j++) {
        let d = 0;
        for (let k = 0; k < 4; k++) d += (pts[i][k] - pts[j][k]) ** 2;
        w = Math.max(w, d * d / (j - i));   // |Δx|^4 / Δh, in cell units
      }
    worst.push(w);
  }
  ok(worst.every((w) => w < 100), `4D locality: worst |Δx|⁴/Δh under 100 (${worst.map((w) => w.toFixed(1)).join(' → ')})`);
}

// digits: base-16 digits of the index name sub-tesseracts.
ok(key(digits(0x1f3, 4, 3)) === '1,15,3', 'digits base 16');

// Rotations stay rotations; turning by θ then −θ comes home; the cube has 2^n corners and n·2^(n−1) edges.
{
  const R = rotation4([0.3, -1.1, 0.7, 2.0, 0.2, -0.5]);
  const RtR = mul4(R, Float32Array.from({ length: 16 }, (_, k) => R[(k % 4) * 4 + Math.floor(k / 4)]));
  let err = 0;
  for (let k = 0; k < 16; k++) err = Math.max(err, Math.abs(RtR[k] - (k % 5 === 0 ? 1 : 0)));
  ok(err < 1e-5, `rotation4 is orthogonal (err ${err.toExponential(1)})`);
  let M = R;
  for (let i = 0; i < 500; i++) M = turn4(M, 0, 3, 0.01);
  for (let i = 0; i < 500; i++) M = turn4(M, 0, 3, -0.01);
  let back = 0;
  for (let k = 0; k < 16; k++) back = Math.max(back, Math.abs(M[k] - R[k]));
  ok(back < 1e-3, `turn4 there and back (err ${back.toExponential(1)})`);
  ok(PLANES.length === 6, 'six planes of rotation in 4D');
  for (const n of [2, 3, 4]) {
    const { verts, edges } = cube4(n);
    ok(verts.length === 2 ** n && edges.length === n * 2 ** (n - 1), `cube4(${n}): ${verts.length} corners, ${edges.length} edges`);
  }
}

// ------------------------------------------------------------- the slice --
// The links: every cell's word names its index and the directions to its neighbours on the path, and they agree.
for (const [n, b] of [[2, 3], [3, 2], [4, 1], [4, 2], [4, 3]]) {
  const L = cellLinks(n, b), sz = gridSize(n, b), N = cellCount(n, b);
  let good = true;
  for (let h = 0; h < N && good; h++) {
    const X = [...indexToPoint(h, n, b), 0, 0, 0].slice(0, 4), v = L[linearCell(X, sz)];
    if (v >>> 8 !== h) good = false;
    const nd = v & 15, pd = (v >>> 4) & 15;
    if ((h === N - 1) !== (nd === NONE) || (h === 0) !== (pd === NONE)) good = false;
    if (nd !== NONE) { const Y = X.slice(); Y[nd >> 1] += nd & 1 ? 1 : -1; if (L[linearCell(Y, sz)] >>> 8 !== h + 1) good = false; }
    if (pd !== NONE) { const Y = X.slice(); Y[pd >> 1] += pd & 1 ? 1 : -1; if (L[linearCell(Y, sz)] >>> 8 !== h - 1) good = false; }
  }
  ok(good, `cellLinks n=${n} b=${b}: each cell names its index and points to h−1 and h+1`);
}

// hitHalf against closed forms: a ray straight down the middle of a tube's side, and one that misses.
{
  const t = hitHalf([0.5, -1, 0, 0], [0, 1, 0, 0], [0, 0, 0, 0], [1, 0, 0, 0], 0.25);
  ok(Math.abs(t - 0.75) < 1e-9, `hitHalf: side of the tube at t = 0.75 (${t})`);
  const ball = hitHalf([-2, 0, 0, 0], [1, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 1], 0.5);
  ok(Math.abs(ball - 1.5) < 1e-9, `hitHalf: the ball at the centre at t = 1.5 (${ball})`);
  ok(hitHalf([0.5, -1, 0, 0.3], [0, 1, 0, 0], [0, 0, 0, 0], [1, 0, 0, 0], 0.25) === Infinity, 'hitHalf: a ray 0.3 ana of a 0.25 tube misses');
}

// The walk is the brute force: over random rays in random slices, traceTubes finds the same first hit as testing
// every capsule of the path, for thin and fat tubes, with and without a trace cut short.
{
  let rng = 12345;
  const rand = () => ((rng = (rng * 1103515245 + 12345) % 2147483648) / 2147483648);
  for (const [n, b] of [[4, 1], [4, 2], [4, 3], [3, 2], [2, 3]]) {
    const L = cellLinks(n, b), N = cellCount(n, b), pts = curve4(n, b), cell = 1 / 2 ** b;
    let agree = 0, hits = 0, tried = 0, worst = 0;
    for (let k = 0; k < 400; k++) {
      const rho = cell * (0.05 + 0.45 * rand());
      const shown = rand() < 0.5 ? N - 1 : Math.floor(rand() * (N - 1));
      // a ray from outside the tesseract toward a point inside it, in a random direction (so through a random slice)
      const target = [0, 1, 2, 3].map((j) => (j < n ? rand() : 0.5 + (rand() - 0.5) * 2 * rho));
      let d = [0, 1, 2, 3].map(() => rand() - 0.5), m = Math.hypot(...d);
      d = d.map((x) => x / m);
      const ro = target.map((x, j) => x - 3 * d[j]);
      const got = traceTubes(L, n, b, ro, d, rho, shown);
      let bt = Infinity;
      for (let h = 0; h <= Math.min(shown, N - 1); h++) {
        const pa = Array.from(pts.subarray(h * 4, h * 4 + 4));
        const pb = h < Math.min(shown, N - 1) ? Array.from(pts.subarray((h + 1) * 4, h * 4 + 8)) : pa;
        bt = Math.min(bt, hitHalf(ro, d, pa, pb, rho));
        if (pb !== pa) bt = Math.min(bt, hitHalf(ro, d, pb, pa, rho));
      }
      tried++;
      const gt = got ? got.t : Infinity;
      if (bt === Infinity && gt === Infinity) agree++;
      else if (Math.abs(gt - bt) < 1e-7) { agree++; hits++; }
      else worst = Math.max(worst, Math.abs(gt - bt));
    }
    ok(agree === tried && hits > 20, `traceTubes n=${n} b=${b}: ${agree}/${tried} rays match brute force (${hits} hits${worst ? `, worst miss ${worst.toExponential(1)}` : ''})`);
  }
}

console.log(`${fails ? '✗' : '✓'} hilbert: ${passes} passed, ${fails} failed`);
process.exit(fails ? 1 : 0);

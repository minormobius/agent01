// Pure-logic selftest for the GEB shadowbox trip-let build.
// Mirrors the occupancy + projection math in index.html (no three.js / canvas).
// Run: node tjs/geb/geb.selftest.mjs
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; } else { fail++; console.error('  ✗ ' + m); } };

// ---- replicated core (must stay in sync with index.html's build()) ----
// Masks are Uint8Array[N*N] indexed [u + N*v]. Axis conventions:
//   MX reads on the X wall: u = +Y (j), v = +Z (k)
//   MY reads on the Y wall: u = +Z (k), v = +X (i)
//   MZ reads on the Z wall: u = +X (i), v = +Y (j)
function buildGrid(N, MX, MY, MZ) {
  const occ = new Uint8Array(N * N * N);
  const pX = new Uint8Array(N * N), pY = new Uint8Array(N * N), pZ = new Uint8Array(N * N);
  let count = 0;
  for (let k = 0; k < N; k++) for (let j = 0; j < N; j++) {
    if (!MX[j + N * k]) continue;
    for (let i = 0; i < N; i++) {
      if (!MY[k + N * i]) continue;
      if (!MZ[i + N * j]) continue;
      occ[i + N * (j + N * k)] = 1; count++;
      pX[j + N * k] = 1; pY[k + N * i] = 1; pZ[i + N * j] = 1;
    }
  }
  return { occ, pX, pY, pZ, count };
}
const full = N => new Uint8Array(N * N).fill(1);
const ink = m => { let n = 0; for (const v of m) n += v; return n; };

// ---- 1. all-full masks => full cube, full shadows ----
{
  const N = 8;
  const { occ, pX, pY, pZ, count } = buildGrid(N, full(N), full(N), full(N));
  ok(count === N * N * N, 'all-full: every voxel solid');
  ok(ink(pX) === N * N && ink(pY) === N * N && ink(pZ) === N * N, 'all-full: shadows full');
  ok(occ.every(v => v === 1), 'all-full: occ dense');
}

// ---- 2. one empty mask => empty solid ----
{
  const N = 8;
  const { count } = buildGrid(N, full(N), full(N), new Uint8Array(N * N));
  ok(count === 0, 'empty MZ => empty solid');
}

// ---- 3. projections are always a SUBSET of the input silhouette ----
{
  const N = 10;
  const rnd = seed => { let s = seed; return () => (s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff; };
  const r = rnd(42);
  const rmask = () => { const m = new Uint8Array(N * N); for (let t = 0; t < m.length; t++) m[t] = r() > 0.4 ? 1 : 0; return m; };
  const MX = rmask(), MY = rmask(), MZ = rmask();
  const { pX, pY, pZ } = buildGrid(N, MX, MY, MZ);
  let sub = true;
  for (let t = 0; t < N * N; t++) { if (pX[t] && !MX[t]) sub = false; if (pY[t] && !MY[t]) sub = false; if (pZ[t] && !MZ[t]) sub = false; }
  ok(sub, 'projections ⊆ input masks (a shadow never exceeds its line)');
}

// ---- 4. orientation: the solid's true projection matches the projection arrays ----
// Recompute the shadow the geometry actually throws (OR over the swept axis) and
// confirm it equals pX/pY/pZ — i.e. the shadow-square placement indices are right.
{
  const N = 7;
  // a distinguishable asymmetric mask (an "L": bottom row + left column)
  const L = () => { const m = new Uint8Array(N * N); for (let u = 0; u < N; u++) m[u + N * 0] = 1; for (let v = 0; v < N; v++) m[0 + N * v] = 1; return m; };
  const MX = L(), MY = full(N), MZ = full(N);
  const { occ, pX } = buildGrid(N, MX, MY, MZ);
  // true X-shadow: over (u=y=j, v=z=k), OR across i
  const trueX = new Uint8Array(N * N);
  for (let k = 0; k < N; k++) for (let j = 0; j < N; j++) for (let i = 0; i < N; i++)
    if (occ[i + N * (j + N * k)]) trueX[j + N * k] = 1;
  let match = true; for (let t = 0; t < N * N; t++) if (trueX[t] !== pX[t]) match = false;
  ok(match, 'true swept X-shadow equals pX (index convention consistent)');
  // with MY,MZ full the X-shadow should equal MX exactly
  let eqMX = true; for (let t = 0; t < N * N; t++) if (pX[t] !== MX[t]) eqMX = false;
  ok(eqMX, 'with other axes full, X-shadow reproduces MX exactly');
}

// ---- 5. no out-of-bounds for a range of N ----
{
  for (const N of [1, 2, 48, 80, 120]) {
    const { occ } = buildGrid(N, full(N), full(N), full(N));
    ok(occ.length === N * N * N, `N=${N}: grid sized correctly`);
  }
}

console.log(`\n${fail === 0 ? '✓ all' : '✗'} ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);

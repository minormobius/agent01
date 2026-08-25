/* tb-002 · check B — is the checker trustworthy?

   Effort B's acceptance test. verify() decides whether a summon shipped,
   so it has two ways to be useless and this file rules out both:

     TOO LAX    it passes geometry that is wrong. A tolerance widened
                until the check stops complaining is the commonest way
                to get here, and it looks like progress.
     TOO STRICT it fails geometry that is right. That retires a mechanic
                that was fine, and the retirement looks like evidence.

   The known-bad input is the NAIVE constellation: neighbours at unit
   directions times a common radius, as if the metric were the identity.
   It is exactly right when aniso is 1 and exactly right for the cube at
   any aniso, because axis-aligned normals are the only ones a diagonal
   metric cannot rotate. Everything else it gets wrong by degrees.

   That makes the cube a trap rather than a test: a checker validated on
   a cube alone would pass every naive summon of the other four.

   Usage: node check-b.mjs [path-to-solution]   (default: ./reference.mjs) */
const path = process.argv[2] ?? './reference.mjs';
const M = await import(new URL(path, import.meta.url).href);

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log(`  x ${m}`); } };
const SOLIDS = ['tetrahedron', 'cube', 'octahedron', 'dodecahedron', 'icosahedron'];
const NON_CUBE = SOLIDS.filter((s) => s !== 'cube');

/** Take a correct constellation and move its neighbours to unit-direction
 *  placement — the metric-ignoring error, reconstructed from the result
 *  rather than from any formula in the module. */
function naive(con) {
  const c = con.centre;
  const neighbours = con.neighbours.map((n) => {
    const d = [n[0] - c[0], n[1] - c[1], n[2] - c[2]];
    // the direction the FACE points, which is M*d, put back at radius 2r
    const Md = [d[0], d[1] * con.aniso, d[2]];
    const L = Math.hypot(...Md) || 1;
    return [c[0] + (Md[0] / L) * 2 * con.r, c[1] + (Md[1] / L) * 2 * con.r, c[2] + (Md[2] / L) * 2 * con.r];
  });
  return { ...con, neighbours, seeds: [c.slice(), ...neighbours] };
}

// ── NOT TOO STRICT: correct geometry must pass, everywhere ────────────
for (const s of SOLIDS) {
  for (const aniso of [1, 2.2, 5]) {
    for (const rotate of [0, 0.35, 1.9]) {
      const v = M.verify(M.constellation(s, { r: 1.5, aniso, rotate }));
      ok(v.ok, `${s} aniso ${aniso} rot ${rotate}: correct geometry PASSES (err ${v.maxNormalErrorDeg?.toFixed(6)} deg)`);
      ok(v.maxNormalErrorDeg < 1e-6, `${s} aniso ${aniso} rot ${rotate}: and reports ~0 error`);
      ok(Math.abs(v.inradius - 1.5) < 1e-9, `${s} aniso ${aniso} rot ${rotate}: and the inradius it asked for`);
      ok(v.faces === M.constellation(s, { r: 1.5, aniso, rotate }).neighbours.length,
        `${s} aniso ${aniso} rot ${rotate}: and one face per neighbour`);
    }
  }
}
// a yaw is the case that fails when the verifier grades against the unrotated answer
for (const s of SOLIDS) {
  const v = M.verify(M.constellation(s, { r: 2, aniso: 2.2, rotate: Math.PI / 5 }));
  ok(v.ok, `${s}: a 36-degree yaw still verifies, so the checker is not grading the wrong reference`);
}

// ── NOT TOO LAX: the naive placement must be rejected ─────────────────
for (const s of NON_CUBE) {
  const good = M.constellation(s, { r: 1.5, aniso: 2.2 });
  const bad = naive(good);
  const v = M.verify(bad);
  ok(!v.ok, `${s}: the metric-ignoring placement is REJECTED`);
  ok(v.maxNormalErrorDeg > 15, `${s}: and the error it reports is large (${v.maxNormalErrorDeg?.toFixed(2)} deg)`);
}

// THE TRAP, stated as a check: the cube alone proves nothing
{
  const good = M.constellation('cube', { r: 1.5, aniso: 2.2 });
  const v = M.verify(naive(good));
  ok(v.ok, 'the naive CUBE is genuinely correct, which is why a cube-only test passes a broken summon');
  const anyNonCubeCaught = NON_CUBE.every((s) => !M.verify(naive(M.constellation(s, { r: 1.5, aniso: 2.2 }))).ok);
  ok(anyNonCubeCaught, 'and every non-cube naive placement is caught, which is the only reason the cube is safe to ship');
}

// at aniso 1 the naive placement IS correct, so a rejection there would be too strict
for (const s of SOLIDS) {
  const v = M.verify(naive(M.constellation(s, { r: 1.5, aniso: 1 })));
  ok(v.ok, `${s}: at aniso 1 the naive placement is correct and must pass`);
}

// ── a perturbation of any single neighbour must be caught ─────────────
for (const s of ['tetrahedron', 'dodecahedron']) {
  const con = M.constellation(s, { r: 1.5, aniso: 2.2 });
  for (const kick of [0.05, 0.2]) {
    const bent = { ...con, neighbours: con.neighbours.map((n, i) => (i === 0 ? [n[0] + kick, n[1], n[2]] : n)) };
    ok(!M.verify(bent).ok, `${s}: moving one neighbour by ${kick} is caught`);
  }
}

// ── the tolerance must not be wide enough to admit the trap ──────────
{
  const bad = naive(M.constellation('icosahedron', { r: 1.5, aniso: 2.2 }));
  const err = M.verify(bad).maxNormalErrorDeg;
  ok(err > 15, `the trap is worth ${err?.toFixed(2)} degrees`);
  ok(!M.verify(bad, { tolDeg: 1e-6 }).ok, 'and the default tolerance does not admit it');
  ok(M.verify(bad, { tolDeg: 90, tolSpread: 9 }).ok,
    'while a tolerance widened to 90 degrees admits everything, which is why the number is not free to move');
}

// ── the error measure must be accurate near zero, not just far from it ─
{
  const v = M.verify(M.constellation('icosahedron', { r: 1.5, aniso: 2.2 }));
  ok(v.maxNormalErrorDeg < 1e-9,
    `exact geometry reports essentially zero, not floating-point noise (${v.maxNormalErrorDeg})`);
}

console.log(`${fail === 0 ? 'PASS' : 'FAIL'} check-b — ${fail === 0 ? pass : `${fail} of ${pass + fail}`} checks`);
process.exit(fail === 0 ? 0 : 1);

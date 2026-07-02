// tessweave.selftest.mjs — prove the tessellating-hex interface solve.
// The honeycomb GLUES each hex edge to a neighbour. This proves: every edge is an interface;
// whites lead the same-kind CONTINUITY channel (an exact 1-white-per-edge warp bijection → 3
// emergent global strand families); production supplies the cross-kind K-DOORS reaching across
// seams; and the whole solve is deterministic and antipodally symmetric.
import { buildCurveModel } from '../curveseed.js';
import { solveTessellation, hexExits, solveInterfaces, dominantWhiteEdges, neighbourOffset, threadCurve, hexSym, mateTransform } from '../tessweave.js';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; } else { fail++; console.log('  ✗ ' + m); } };

const OPTS = { rings: 1, layers: 8, flatR: 0.35, pitch: 28, width: 6, NW: 6, NF: 8, turnScale: 0.35 };

// ── geometry sanity ─────────────────────────────────────────────────────────────
{
  const R = 100;
  const off = neighbourOffset(0, R);
  const d = Math.hypot(off[0], off[1]);
  ok(Math.abs(d - R * Math.sqrt(3)) < 1e-6, `neighbour distance = R√3 (got ${d.toFixed(2)})`);
  const a0 = Math.atan2(neighbourOffset(0, R)[1], neighbourOffset(0, R)[0]);
  const a1 = Math.atan2(neighbourOffset(1, R)[1], neighbourOffset(1, R)[0]);
  const da = ((a1 - a0) * 180 / Math.PI + 360) % 360;
  ok(Math.abs(da - 60) < 1e-6, `neighbours 60° apart (got ${da.toFixed(1)}°)`);
}

// ── the solve, over several seeds ───────────────────────────────────────────────
const seeds = [1, 3, 7, 12, 21, 40, 77];
let allBij = true, everKDoor = true, allSixEdges = true, allWarp = true;
for (const s of seeds) {
  const m = buildCurveModel(s, OPTS);
  const sol = solveTessellation(m);
  const c = sol.interfaces.census;

  // every edge carries threads on BOTH sides ⇒ every edge is a real interface
  const reached = sol.edges.filter((e) => e.length > 0).length;
  ok(reached === 6, `seed ${s}: all 6 hex edges carry threads (got ${reached})`);
  if (reached < 6) allSixEdges = false;
  ok(c.everyEdgeIsInterface, `seed ${s}: every edge is an interface (both sides populated)`);

  // whites form an exact 1-white-per-edge bijection (the warp)
  const filled = sol.interfaces.warp.perEdge.filter(Boolean).length;
  ok(filled === 6 && sol.interfaces.warp.byWhite.size === 6, `seed ${s}: 1-white-per-edge bijection — the warp (filled ${filled}/6, whites ${sol.interfaces.warp.byWhite.size})`);
  if (filled !== 6) allBij = false;

  // the warp collapses to 3 global strand families (1 ring + 2 helices), covering all 6 whites
  ok(sol.warp.allCovered && sol.warp.families === 3, `seed ${s}: 6 whites → 3 global strand families, all covered (${sol.warp.families} families)`);
  if (!sol.warp.allCovered) allWarp = false;

  // production supplies cross-kind K-doors (the 8-vs-6 crux, made into the K(6,8) cross-seam reach)
  ok(c.hasKDoors && c.prodDoors > 0, `seed ${s}: production forms cross-kind K-doors across seams (${c.prodDoors})`);
  if (!c.hasKDoors) everKDoor = false;

  // both channels present at every seam: some continuity AND some doors, tile-wide
  ok(c.sameKind > 0 && c.crossKind > 0, `seed ${s}: both continuity (${c.sameKind}) and K-doors (${c.crossKind}) present`);
}
ok(allBij, 'the 1-white-per-edge warp bijection holds across every seed');
ok(allWarp, '3 global strand families emerge on every seed');
ok(everKDoor, 'production K-doors appear on every seed (K(6,8) across seams)');
ok(allSixEdges, 'all six edges carry threads on every seed');

// ── determinism ─────────────────────────────────────────────────────────────────
{
  const m = buildCurveModel(7, OPTS);
  const a = JSON.stringify(hexExits(m).map((e) => e.map((x) => x.kind + x.idx)));
  const b = JSON.stringify(hexExits(m).map((e) => e.map((x) => x.kind + x.idx)));
  ok(a === b, 'hexExits is deterministic');
  const w1 = JSON.stringify(dominantWhiteEdges(hexExits(m)).perEdge.map((x) => x && x.idx));
  const w2 = JSON.stringify(dominantWhiteEdges(hexExits(m)).perEdge.map((x) => x && x.idx));
  ok(w1 === w2, 'warp bijection is deterministic');
}

// ── antipodal symmetry: edge k and edge k+3 describe the same shared edge ─────────
{
  const m = buildCurveModel(3, OPTS);
  const { interfaces } = solveTessellation(m);
  let symOk = true;
  const cont = (e) => e.pairs.filter((p) => p.kind === 'continuity').length;
  for (let k = 0; k < 3; k++) if (Math.abs(cont(interfaces.perEdge[k]) - cont(interfaces.perEdge[k + 3])) > 3) symOk = false;
  ok(symOk, 'antipodal edges report matching continuity census (same shared edge)');
}

// ── the spiral tracer + the mating transform ─────────────────────────────────────
{
  const m = buildCurveModel(7, OPTS);
  // threadCurve runs from the flat core out to the rim
  const c = threadCurve(m, 'white', 0);
  const r0 = Math.hypot(c[0][0], c[0][1]) / m.R, r1 = Math.hypot(c[c.length - 1][0], c[c.length - 1][1]) / m.R;
  ok(c.length > 10 && r0 < 0.5 && r1 > 0.9, `threadCurve spirals centre(${r0.toFixed(2)})→rim(${r1.toFixed(2)})`);

  // hexSym: identity, period-6, flip is an involution
  const p = [37, -11];
  ok(hexSym(p, 0, 0)[0] === p[0] && hexSym(p, 0, 0)[1] === p[1], 'hexSym(rot0,flip0) is identity');
  const s6 = hexSym(p, 6, 0);
  ok(Math.hypot(s6[0] - p[0], s6[1] - p[1]) < 1e-9, 'hexSym rot·6 ≡ identity');
  const ff = hexSym(hexSym(p, 0, 1), 0, 1);
  ok(Math.hypot(ff[0] - p[0], ff[1] - p[1]) < 1e-9, 'hexSym flip is an involution');
}

// mating a neighbour reorients it to reduce like-with-like seam mismatch, every seed & edge
{
  let allBetter = true, everFlip = false, worst = 0;
  for (const s of [1, 7, 21, 40]) {
    const m = buildCurveModel(s, OPTS);
    for (let k = 0; k < 6; k++) {
      const t = mateTransform(m, k);
      if (!(t.score <= t.identityScore + 1e-6)) allBetter = false;
      if (t.flip) everFlip = true;
      worst = Math.max(worst, t.score / (t.identityScore || 1));
    }
  }
  ok(allBetter, `mateTransform never worse than translation (worst ratio ${worst.toFixed(2)})`);
  ok(everFlip, 'mating uses a mirror (the chiral spirals need reflecting to thread like-with-like)');
}
// antipodal edges get consistent mating (opposite edges are the same seam)
{
  const m = buildCurveModel(7, OPTS);
  let symOk = true;
  for (let k = 0; k < 3; k++) { const a = mateTransform(m, k), b = mateTransform(m, k + 3); if (Math.abs(a.score - b.score) > 0.06 * m.R) symOk = false; }
  ok(symOk, 'antipodal seams report matching mate scores');
}

console.log(`\n  tessweave: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

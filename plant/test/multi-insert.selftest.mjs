// plant/test/multi-insert.selftest.mjs — certifies that a constellation lands
// as ONE transaction, or does not land at all.
//
// Run: node plant/test/multi-insert.selftest.mjs
//
// ------------------------------------------------------------ what is proven --
//
// `reformPocket` plants ONE seed. A summon is 5 to 21 of them, and planting them
// one at a time means the seventh call can refuse after six have committed. Six
// of thirteen seeds is not a dodecahedron; it is a broken pocket that every
// later verdict is then computed against. `reformPocketAll` is the transaction.
//
// Three claims, and they are the ticket's (a), (b), (c):
//
//   (a) COMMIT. A full constellation goes in, and afterwards the complex is
//       still closed (Euler V−E+F=2 per cell, recomputed here rather than
//       inferred from a non-null return) and the nav graph still works (start
//       and target chambers preserved, the oracle executable).
//
//   (b) ROLLBACK. A collision PART-WAY THROUGH the constellation leaves the
//       pocket byte-for-byte as it was. Asserted by deep-comparing a snapshot
//       taken before the attempt — every field, every Map, to the last float —
//       not by a length check, which a half-applied insert would pass on any
//       field that happens not to be an array of seeds.
//
//       And the assertion is only worth something if a half-apply were possible
//       at all, so the file first PROVES the naive path really would have
//       committed: `reformPocket` on the batch's first point succeeds. The
//       transaction refuses the same batch and leaves nothing behind.
//
//   (c) NAMING. The refusal says which seed collided — index, coordinates and
//       the real anisotropic gap — and it says which point of the summon hit it.
//
// Plus two anti-drift checks that are the real reason to trust any of it:
//
//   · a single-point transaction is BYTE-IDENTICAL to `reformPocket` on the same
//     point (they share `rebuildWith`, so this is a theorem; the check is what
//     stops a future edit quietly making it false);
//   · the hull refusal agrees with `placement.mjs`'s `hullViolation` — wall,
//     axis and depth — so the predicate a UI greys the ground out with and the
//     transaction that does the planting cannot disagree.
//
// THE CONTROL that keeps (b) from being vacuous: the snapshot comparator is
// shown to DISTINGUISH two pockets that really differ. A comparator stuck on
// "equal" would pass every rollback assertion in the file.

import {
  generatePocket, reformPocket, reformPocketAll,
  clampSeed, seedGapSq, MIN_SEED_GAP_SQ,
} from '../foamworld.js';
import { summonAt, nearestSeed, hullViolation, MIN_SEED_GAP } from '../placement.mjs';

let checks = 0, failures = 0;
function ok(cond, msg) {
  checks++;
  if (!cond) { failures++; console.error('  ✗ ' + msg); }
}

// ---------------------------------------------------------------- snapshot ---
// JSON.stringify is NOT good enough for this file, twice over: it renders a Map
// as `{}` (and `pocket.basinOf` is a Map of every basin in the pocket), and it
// renders Infinity as null (and every vertical membrane carries slope:Infinity).
// A comparator blind to those two would call a mutated pocket unchanged.
function snap(v) {
  if (typeof v === 'number') return Object.is(v, -0) ? '-0' : String(v);
  if (v === null || typeof v !== 'object') return JSON.stringify(v);
  if (Array.isArray(v)) return '[' + v.map(snap).join(',') + ']';
  if (v instanceof Map) return 'Map{' + [...v.entries()].map(([k, x]) => JSON.stringify(String(k)) + ':' + snap(x)).join(',') + '}';
  if (v instanceof Set) return 'Set{' + [...v].map(snap).join(',') + '}';
  return '{' + Object.keys(v).map((k) => JSON.stringify(k) + ':' + snap(v[k])).join(',') + '}';
}

// The Euler closure gate, recomputed from the returned faces — the same
// arithmetic `foamworld.selftest.mjs` uses, deliberately, so "still closed"
// means the same thing in both files.
function eulerBad(p) {
  const key = (v) => Math.round(v[0] * 256) + '_' + Math.round(v[1] * 256) + '_' + Math.round(v[2] * 256);
  let bad = 0;
  for (const c of p.cells) {
    const vs = new Set(), es = new Set();
    for (const fi of c.faces) {
      const ks = p.faces[fi].verts.map(key);
      ks.forEach((k) => vs.add(k));
      for (let i = 0; i < ks.length; i++) {
        const a = ks[i], b = ks[(i + 1) % ks.length];
        es.add(a < b ? a + '|' + b : b + '|' + a);
      }
    }
    if (vs.size - es.size + c.faces.length !== 2) bad++;
  }
  return bad;
}

// The macro fixture: few big rooms, and the same seed and opts that
// `foamworld.selftest.mjs` and `placement.selftest.mjs` already plant into.
const MACRO = { nx: 4, nz: 4, layers: 3, subLayers: 1, cell: 20, layerH: 9, parMin: 3, parTarget: 6 };
const P = generatePocket({ seed: 2, ...MACRO });
ok(P.seeds.length === 64 && P.W === 80 && P.H === 36 && P.D === 80, `fixture: 64 seeds in 80×36×80 (got ${P.seeds.length}, ${P.W}×${P.H}×${P.D})`);

const P0 = snap(P);   // the reference the rollback assertions compare against

// ------------------------------------------------- 0. the shared primitives --
// `reformPocket`'s clamp and its refusal arithmetic now live in one place each,
// used by both insert paths. These pin the constants so the extraction cannot
// silently become a different rule.
{
  ok(MIN_SEED_GAP_SQ === 2.25, `constants: the refusal radius is 1.5² (got ${MIN_SEED_GAP_SQ})`);
  ok(Math.sqrt(MIN_SEED_GAP_SQ) === MIN_SEED_GAP, 'constants: the kernel and placement.mjs state ONE threshold');
  const p = [40, 18, 40];
  ok(clampSeed(P, p).every((v, i) => v === p[i]), 'clamp: an interior point is untouched');
  ok(clampSeed(P, [0, 0, 0])[1] === 0.8 && clampSeed(P, [0, 0, 0])[0] === 1,
     'clamp: the y margin (0.8) really is different from x/z (1) — this looks like a typo and is not');
  // symmetric to the last bit: the refusal cannot depend on argument order
  const a = [12.5, 7.25, 33.5], b = [13.1, 8.5, 32.25];
  ok(seedGapSq(a, b, 2.2) === seedGapSq(b, a, 2.2), 'gap: seedGapSq is exactly symmetric');
  // and it is the squared form of what solids.mjs/placement.mjs measure
  ok(Math.abs(Math.sqrt(seedGapSq(a, b, 2.2)) - nearestSeed({ seeds: [a], opts: { aniso: 2.2 } }, b).gap) < 1e-12,
     'gap: the kernel and solids.mjs measure the same distance');
}

// ------------------------------------- 1. an empty transaction is a refusal --
{
  const r = reformPocketAll(P, []);
  ok(!r.ok && r.pocket === null && r.first.reason === 'empty', `empty: [] is refused, not silently succeeded (got ${r.first && r.first.reason})`);
  ok(snap(P) === P0, 'empty: …and the pocket is untouched');
}

// --------------------------------------- 2. find a constellation that fits ---
// EXISTENCE, deliberately. `reformPocketAll` refuses for three reasons and only
// the geometric ones are decidable in advance — the closure gate is not — so one
// candidate failing is not evidence against the transaction. What is asserted is
// that predicate-legal constellations really do land, and that when one lands it
// lands WHOLE. Candidates are pre-filtered with `placement.mjs` (cheap
// arithmetic) so the expensive rebuild is only paid on plausible ones, and every
// seed is required to be a comfortable 2.2m clear of any pocket seed, so the
// perturbations in section 4 cannot accidentally stray into a real collision.
const CLEAR = 2.2;
const CANDIDATES = [];
for (const solid of ['tetrahedron', 'cube', 'octahedron']) {
  for (let x = 8; x <= P.W - 8; x += 7) {
    for (let z = 8; z <= P.D - 8; z += 7) {
      for (const y of [12, 18, 24]) {
        const s = summonAt(P, solid, [x, y, z], { r: 1.6 });
        if (!s.ok) continue;
        if (!s.con.seeds.every((q) => nearestSeed(P, q).gap >= CLEAR)) continue;
        CANDIDATES.push(s);
      }
    }
  }
}
ok(CANDIDATES.length > 0, `sweep: predicate-legal, comfortably-clear constellations exist (${CANDIDATES.length})`);

// spread the attempts across the lattice rather than taking the front, so one
// bad neighbourhood cannot decide the run
const MAX_TRIES = 6;
const stride = Math.max(1, Math.floor(CANDIDATES.length / MAX_TRIES));
const TRIES = CANDIDATES.filter((_, i) => i % stride === 0).slice(0, MAX_TRIES);
let CON = null, Q = null, tried = 0;
for (const s of TRIES) {
  tried++;
  const r = reformPocketAll(P, s.con.seeds);
  if (r.ok) { CON = s.con; Q = r; break; }
}
ok(Q !== null, `commit: a whole constellation really plants (tried ${tried} of ${TRIES.length})`);
ok(snap(P) === P0, 'commit: the search left the original pocket untouched throughout');

// ------------------------------------- 3. (a) closure and navigation hold ----
if (Q) {
  const n = CON.seeds.length;
  const q = Q.pocket;
  console.log(`  · committed a ${CON.solid} (${n} seeds) at [${CON.centre.map((v) => v.toFixed(1))}] after ${tried} attempt(s)`);
  ok(n >= 5, `commit: this is a real multi-insert, not a dressed-up single one (${n} seeds)`);
  ok(q.seeds.length === P.seeds.length + n, `commit: every seed of the constellation landed (${q.seeds.length - P.seeds.length} of ${n})`);
  ok(q.cells.length === P.cells.length + n, `commit: and each one became a chamber (${q.cells.length - P.cells.length})`);
  ok(Q.planted.length === n && Q.planted.every((ix, i) => ix === P.seeds.length + i),
     'commit: `planted` indexes the new seeds in the order given');
  ok(Q.planted.every((ix) => q.seeds[ix].every((v, k) => v === CON.seeds[ix - P.seeds.length][k])),
     'commit: every planted seed is EXACTLY where it was asked for — no clamp, no relocation');
  ok(q.seeds[Q.planted[0]].every((v, k) => v === CON.centre[k]), 'commit: planted[0] is the constellation centre');
  ok(Q.planted.every((ix) => q.cells[ix].id >= q.baseSeedCount), 'commit: the new chambers are marked planted');
  ok(Q.refusals.length === 0 && Q.first === null, 'commit: a success carries no refusals');

  // closure — recomputed, not inferred
  ok(eulerBad(q) === 0, `closure: every chamber is still a closed polyhedron, V−E+F=2 (${eulerBad(q)} bad)`);
  const vol = q.cells.reduce((a, c) => a + c.volume, 0);
  ok(Math.abs(vol - q.W * q.H * q.D) / (q.W * q.H * q.D) < 5e-3,
     `closure: the foam is still a watertight partition (volume off by ${(Math.abs(vol - q.W * q.H * q.D) / (q.W * q.H * q.D) * 100).toFixed(3)}%)`);
  let pairBad = 0;
  for (const f of q.faces) {
    if (f.boundary) { if (f.b !== -1) pairBad++; continue; }
    if (f.a === f.b || f.a < 0 || f.b < 0 || f.a >= q.cells.length || f.b >= q.cells.length) pairBad++;
  }
  ok(pairBad === 0, `closure: interior membranes join two distinct real chambers (${pairBad} bad)`);

  // navigation
  ok(q.startCell === P.startCell && q.targetCell === P.targetCell, 'nav: the start and target chambers are preserved');
  ok(q.nav.start >= 0 && q.nav.target >= 0 && q.nav.nodeCount === q.nodes.length, 'nav: the graph re-derived around them');
  ok(q.nav.dist[q.nav.start] === 0, 'nav: the start basin is at distance 0 from itself');
  ok(q.basinOf instanceof Map && q.basinOf.size > 0, 'nav: the basin index is rebuilt');
  if (q.nav.par >= 0) {
    ok(q.nav.oracle.length === q.nav.par, `nav: the oracle is as long as par (${q.nav.oracle.length} vs ${q.nav.par})`);
    let u = q.nav.start, steps = 0;
    while (u !== q.nav.target && steps <= q.nav.par) { u = q.nav.next[u].node; steps++; }
    ok(u === q.nav.target && steps === q.nav.par, `nav: following the oracle from the start reaches the target in par steps (${steps}/${q.nav.par})`);
    ok(q.nav.oracle.every((fi) => fi >= 0 && fi < q.faces.length && !q.faces[fi].boundary),
       'nav: every membrane the oracle names is a real interior membrane');
  } else {
    // a legitimate outcome — the player may summon themselves out of a route.
    // What must NOT happen is a route that claims to exist and does not.
    ok(q.nav.oracle.length === 0, 'nav: an unreachable target reports no route rather than a broken one');
  }

  // the comparator CONTROL: it can tell two genuinely different pockets apart.
  // Without this, every rollback assertion below would pass for `() => true`.
  ok(snap(q) !== P0, 'control: the snapshot comparator distinguishes the reformed pocket from the original');
  ok(snap(P) === P0, 'control: …and still calls the untouched original unchanged');
}

// --------------------------------- 4. (b)+(c) refusal part-way through -------
if (Q) {
  // A seed the constellation is comfortably clear of, comfortably inside the
  // hull, so the refusal below is a SEED refusal and not a shadowed hull one.
  //
  // It must ALSO be a seed no OTHER pocket seed is within 1.5m of. The
  // generator's jitter (±7.6m on x/z, up to ±6.75m on y) genuinely can put two
  // pocket seeds close together, and standing on one of a close pair would
  // produce TWO refusals — which is correct behaviour and would wreck the
  // "exactly one thing was wrong, exactly one refusal" assertion below for a
  // reason that has nothing to do with the transaction.
  const inner = P.seeds
    .map((s, i) => ({ s, i }))
    .filter(({ s }) => s[0] >= 4 && s[0] <= P.W - 4 && s[1] >= 4 && s[1] <= P.H - 4 && s[2] >= 4 && s[2] <= P.D - 4)
    .filter(({ i, s }) => P.seeds.every((t, k) => k === i || seedGapSq(t, s, P.opts.aniso) >= MIN_SEED_GAP_SQ));
  ok(inner.length >= 8, `fixture: isolated, comfortably-interior seeds to collide with (${inner.length})`);
  // the fallback exists so an empty `inner` reports failures rather than
  // throwing — the assertion above is what actually judges it
  const victim = inner[Math.floor(inner.length / 2)] || { s: P.seeds[0].slice(), i: 0 };

  // -- the batch: the constellation, with a collider spliced in at index 2.
  // Points 0 and 1 are perfectly legal, which is the whole point: a sequential
  // loop commits them and only then discovers the problem.
  const batch = [...CON.seeds];
  batch.splice(2, 0, victim.s.slice());
  ok(batch.length === CON.seeds.length + 1 && batch[2].every((v, k) => v === victim.s[k]),
     'rollback: the collider really is at index 2, mid-constellation');

  // FIRST, prove the naive path would have half-applied. If this fails the
  // rollback assertion below proves nothing, because there would have been
  // nothing to roll back.
  const naive0 = reformPocket(P, batch[0]);
  const naive1 = naive0 && reformPocket(naive0, batch[1]);
  ok(naive0 !== null && naive1 !== null,
     'rollback: the naive sequential path really does commit the first two seeds before it can notice');
  ok(naive1 === null || naive1.seeds.length === P.seeds.length + 2,
     'rollback: …leaving a two-seed fragment of the constellation in the pocket');
  ok(reformPocket(naive1 || P, batch[2]) === null,
     'rollback: …and only THEN does the kernel refuse — which is the bug this ticket exists for');

  const before = snap(P);
  const r = reformPocketAll(P, batch);
  const after = snap(P);

  ok(!r.ok && r.pocket === null && r.planted.length === 0, 'rollback: the transaction refuses the batch');
  ok(after === before,
     'rollback: the pocket is BYTE-FOR-BYTE what it was before the attempt — deep-compared field by field, including basinOf (a Map) and every Infinity slope, not a length check');
  ok(after === P0, 'rollback: …and still identical to the pocket as first generated');

  // (c) the refusal names the seed it hit, and where in the summon it happened
  ok(r.refusals.length === 1, `naming: exactly one thing was wrong, and exactly one refusal is reported (${r.refusals.length})`);
  const f = r.first;
  ok(f.reason === 'seed', `naming: the reason is a seed collision (got ${f.reason})`);
  ok(f.seedIndex === victim.i, `naming: it names pocket seed ${victim.i} (got ${f.seedIndex})`);
  ok(f.seed.every((v, k) => v === victim.s[k]), 'naming: …and carries that seed’s coordinates, so a UI can light it up');
  ok(f.point === 2, `naming: …and says WHICH point of the summon hit it (got ${f.point})`);
  ok(f.gap === 0 && f.need === MIN_SEED_GAP, `naming: standing exactly on it is a gap of 0 against a need of 1.5 (got ${f.gap}/${f.need})`);
  // independent arithmetic: re-run the kernel's literal refusal test on the
  // blamed seed. A transaction that named an arbitrary seed passes everything
  // above and dies here.
  ok(seedGapSq(f.seed, batch[f.point], P.opts.aniso) < MIN_SEED_GAP_SQ,
     'naming: the blamed seed is genuinely inside the kernel’s own refusal radius');

  // -- and the OTHER mid-batch failure: two of the summon's own points fight.
  // A sequential loop cannot see this coming either; it discovers it by having
  // already planted one of them.
  const twin = [CON.seeds[1][0] + 0.5, CON.seeds[1][1], CON.seeds[1][2]];
  const b2 = [...CON.seeds, twin];
  const r2 = reformPocketAll(P, b2);
  ok(!r2.ok && r2.first.reason === 'batch', `batch: two points of one summon 0.5m apart are refused (got ${r2.first && r2.first.reason})`);
  ok(r2.first.point === 1 && r2.first.otherPoint === CON.seeds.length,
     `batch: the refusal names BOTH offending points (got ${r2.first.point}/${r2.first.otherPoint})`);
  ok(Math.abs(r2.first.gap - 0.5) < 1e-12, `batch: and reports the real gap, 0.5 (got ${r2.first.gap})`);
  ok(snap(P) === P0, 'batch: the pocket is untouched by the refused batch');

  // CONTROL: without the twin, that same batch is the constellation that just
  // committed — so the refusal above is caused by the twin and by nothing else.
  ok(reformPocketAll(P, CON.seeds).ok, 'batch control: the same points WITHOUT the twin are accepted');
  ok(snap(P) === P0, 'batch control: …and even a success does not touch the pocket it was built from');
}

// ------------------------------------------- 5. hull: refused, not clamped ---
// The one deliberate divergence from `reformPocket`, and the reason for it: the
// kernel silently moves an out-of-bounds point and plants it elsewhere, and a
// constellation whose centre moved is not the solid that was verified.
{
  const out = [0.5, 18.9, 38];   // 0.5m outside the x=0 wall
  const r = reformPocketAll(P, [out]);
  ok(!r.ok && r.first.reason === 'hull', `hull: an out-of-bounds point is REFUSED (got ${r.first && r.first.reason})`);
  ok(r.first.wall === 'B4' && r.first.axis === 'x' && Math.abs(r.first.depth - 0.5) < 1e-12,
     `hull: named by wall and depth (got ${r.first.wall}/${r.first.axis}/${r.first.depth})`);
  ok(r.first.clamped.every((v, i) => v === clampSeed(P, out)[i]), 'hull: the refusal carries where the kernel WOULD have put it');

  // the divergence, stated as a test rather than as a comment. Deliberately NOT
  // asserted as "reformPocket succeeds here": it may also refuse, for the
  // unrelated reason that the CLAMPED position is near a seed — which is exactly
  // the point. What the kernel never does is plant the point that was asked for,
  // or say a word about the hull.
  ok(clampSeed(P, out)[0] === 1 && out[0] !== 1, 'hull: the clamp really moves this point (x 0.5 → 1)');
  const kernel = reformPocket(P, out);
  const landed = kernel && kernel.seeds[kernel.seeds.length - 1];
  ok(!kernel || landed.some((v, i) => v !== out[i]),
     'hull: reformPocket never plants it where it was asked for — it silently relocates it, which for a summon is a bug wearing a success');

  // and the predicate a UI greys the ground out with must agree with the
  // transaction that does the planting — same wall, same axis, same depth
  const pv = hullViolation(P, out);
  ok(pv.wall === r.first.wall && pv.axis === r.first.axis && Math.abs(pv.depth - r.first.depth) < 1e-12,
     'hull: placement.mjs and the kernel name the same wall by the same depth');

  // the deepest violation is named, deterministically (ties break x → y → z)
  ok(reformPocketAll(P, [[0.5, 0.6, 38]]).first.wall === 'B4', 'hull: the deeper violation (x by 0.5) beats y by 0.2');
  ok(reformPocketAll(P, [[0.9, 0.2, 38]]).first.wall === 'B2', 'hull: …and the other way round (y by 0.6 beats x by 0.1)');

  // a NaN coordinate falls out as a hull refusal rather than being planted.
  // This is not a special-cased guard — it is `NaN !== NaN` meeting the clamp
  // comparison — but the behaviour is worth pinning either way.
  const nan = reformPocketAll(P, [[NaN, 18, 40]]);
  ok(!nan.ok && nan.first.reason === 'hull', `hull: a NaN coordinate is refused, not planted (got ${nan.ok}/${nan.first && nan.first.reason})`);
  ok(snap(P) === P0, 'hull: the pocket is untouched by every refusal above');
}

// ---------------------------- 6. one point behaves exactly like reformPocket --
// The two paths share `rebuildWith`, so this is a theorem. The check is what
// stops a future edit making it quietly false.
{
  const A = [P.W / 2 + 2, P.H / 2 + 0.9, P.D / 2 - 2];   // proven to plant, in foamworld.selftest.mjs
  const one = reformPocketAll(P, [A]);
  const kernel = reformPocket(P, A);
  ok(one.ok && kernel !== null, 'equivalence: both paths plant the proven point');
  ok(one.ok && kernel && snap(one.pocket) === snap(kernel),
     'equivalence: a one-point transaction is byte-identical to reformPocket — same complex, same nav, same everything');

  // determinism: the same question, twice, gets the same answer
  const again = reformPocketAll(P, [A]);
  ok(again.ok && snap(again.pocket) === snap(one.pocket), 'determinism: the transaction is deterministic');
  // …and so is which seed a refusal blames. Clamped into the hull first: pocket
  // seeds are generated inside [0.4, W−0.4] × [0.3, H−0.3] but the PLACEABLE box
  // is [1, W−1] × [0.8, H−0.8], so some pocket seeds sit outside it and asking
  // about one raw would get a `hull` verdict instead of the `seed` one this is
  // about. The clamp moves it by at most 0.6m, far inside the 1.5m gap.
  const onSeed = clampSeed(P, P.seeds[10]);
  const d1 = reformPocketAll(P, [onSeed]).first, d2 = reformPocketAll(P, [onSeed]).first;
  ok(d1.reason === 'seed', `determinism: standing on a pocket seed is a seed refusal (got ${d1.reason})`);
  ok(d1.seedIndex === d2.seedIndex && d1.gap === d2.gap,
     'determinism: …and the same seed is blamed, with the same gap, every time');
  ok(snap(P) === P0, 'equivalence: the source pocket is untouched by any of it');
}

// ------------------------------------- 7. atomic == sequential, when both work
// The strongest statement in the file. `buildComplex` is a pure function of the
// seed list, so when the sequential path HAPPENS to succeed all the way through,
// it must end at exactly the pocket the transaction produces in one pass.
// Atomicity is therefore not a different geometry — it is the same geometry with
// a different failure mode, and 1 rebuild instead of |seeds|.
if (Q) {
  let seq = P;
  for (const s of CON.seeds) {
    const nxt = reformPocket(seq, s);
    if (!nxt) { seq = null; break; }
    seq = nxt;
  }
  if (seq) {
    ok(snap(seq) === snap(Q.pocket),
       'atomicity: planting the constellation one seed at a time ends at the byte-identical pocket the transaction produces in one rebuild');
    ok(seq.seeds.length === Q.pocket.seeds.length, `atomicity: …with the same seed count (${seq.seeds.length})`);
  } else {
    // Also a pass, and a more damning one: the sequential path could not even
    // finish, having already committed some of the seeds.
    console.log('  · the sequential path REFUSED part-way through a constellation the transaction placed whole');
    ok(Q.ok, 'atomicity: the sequential path refused part-way through a constellation the transaction placed whole — which is the bug, demonstrated');
  }
  ok(snap(P) === P0, 'atomicity: and the original pocket is STILL untouched at the end of the run');
}

console.log(failures === 0
  ? `✓ multi-insert selftest — ${checks} checks pass (atomic constellation insert, pocket seed 2)`
  : `✗ multi-insert selftest — ${failures}/${checks} FAILED`);
process.exit(failures === 0 ? 0 : 1);

// tjs/brut/arch.selftest.mjs — node selftest for the brut kernel and its two views.
// Run: node tjs/brut/arch.selftest.mjs
//
// What this pins is the contract the whole surface rests on: ONE seed, ONE
// building, TWO sites that cannot disagree about it. So the checks are not
// "does it run" — they are the invariants that would silently rot a permalink:
// determinism, sub-stream independence, round-trip of the query codec, a plan
// whose rooms are inside the plate / disjoint / reachable, a parts list that
// stays inside its own bounds, and a drawing set that names the same bays the
// model builds.

import {
  generate, parts, bounds, section, schedule, resolveParams, paramsToQuery,
  deriveParams, TYPOLOGY_IDS, TYPOLOGIES, MODULES, rect as R, Rand,
} from './arch.js';
import { planSVG, elevationSVG, sectionSVG, titleBlockSVG, scheduleSVG, sheetSVG, revision, PALETTES } from './blueprint.js';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error('  ✗ ' + m); } };
const SEEDS = ['brut', 'barbican-flint-317', 'nave-gull-902', 'ziggurat-moss-114', 'silo-brine-556', 'x', '⌘-unicode-seed'];
const EPS = 0.02;

/* 1. DETERMINISM — the load-bearing property. Same seed ⇒ byte-identical
      building AND byte-identical parts list, in every typology. */
{
  let same = true, samePart = true;
  for (const t of TYPOLOGY_IDS) {
    for (const s of SEEDS) {
      const a = generate(resolveParams({ s, t })), b = generate(resolveParams({ s, t }));
      if (JSON.stringify(a) !== JSON.stringify(b)) same = false;
      if (JSON.stringify(parts(a)) !== JSON.stringify(parts(b))) samePart = false;
    }
  }
  ok(same, 'same seed → identical building, every typology × seed');
  ok(samePart, 'same seed → identical parts list');
  // and a DIFFERENT seed must actually differ, or "deterministic" is trivially true
  const distinct = new Set(SEEDS.map((s) => JSON.stringify(generate(resolveParams({ s, t: 'office' })))));
  ok(distinct.size === SEEDS.length, `different seeds → different buildings (${distinct.size}/${SEEDS.length} distinct)`);
}

/* 2. SUB-STREAM INDEPENDENCE — the reason each draw is salted. Editing the
      facade rhythm must not move a single wall, or a facade tweak silently
      republishes a different building behind every existing permalink. */
{
  const base = resolveParams({ s: 'independence', t: 'office' });
  const other = { ...base, rhythm: ['pier', 'blank', 'brise'] };
  const A = generate(base), B = generate(other);
  ok(JSON.stringify(A.levels.map((L) => L.wings)) === JSON.stringify(B.levels.map((L) => L.wings)),
    'changing the rhythm leaves the massing untouched');
  ok(JSON.stringify(A.levels.map((L) => L.rooms)) === JSON.stringify(B.levels.map((L) => L.rooms)),
    'changing the rhythm leaves the floor plans untouched');
  ok(JSON.stringify(A.facades) !== JSON.stringify(B.facades), 'changing the rhythm does change the facade');
  // and the salt really separates: two salts on one seed must not agree
  const r1 = Rand('s', 'a'), r2 = Rand('s', 'b');
  let equal = 0; for (let i = 0; i < 50; i++) if (r1.f() === r2.f()) equal++;
  ok(equal === 0, 'salted sub-streams of one seed are independent');
}

/* 3. THE PERMALINK CODEC — every knob must survive a round trip, and the
      canonical link for an untouched seed must carry nothing but the seed. */
{
  let bad = 0, short = 0;
  for (let i = 0; i < 300; i++) {
    const p = resolveParams({ s: 'seed' + i });
    if (JSON.stringify(resolveParams(paramsToQuery(p))) !== JSON.stringify(p)) bad++;
    if (paramsToQuery(p) === 's=seed' + i) short++;
  }
  ok(bad === 0, `query codec round-trips (${300 - bad}/300)`);
  ok(short === 300, 'an untouched seed encodes to the seed alone');

  // an edited param round-trips too, and shows up in the link
  const p = resolveParams({ s: 'edit-me', t: 'housing' });
  const edited = { ...p, levels: p.levels + 3, bay: 6.3, symmetric: !p.symmetric, rhythm: ['pier', 'balcony'] };
  const q = paramsToQuery(edited);
  ok(/n=/.test(q) && /bay=6.3/.test(q) && /sym=/.test(q) && /rh=pier,balcony/.test(q), 'edits appear in the permalink');
  ok(JSON.stringify(resolveParams(q)) === JSON.stringify(edited), 'edited params round-trip');

  // a mangled link opens the seed rather than throwing — permalinks outlive schemas
  const junk = resolveParams('s=brut&t=palace&n=nonsense&bay=-4&rh=zzz,pier&sym=maybe');
  ok(TYPOLOGY_IDS.includes(junk.typology) && junk.bay >= 3.6 && junk.rhythm.every((m) => MODULES[m]),
    'a mangled query degrades to a valid building');
  ok(paramsToQuery(resolveParams('')) === 's=brut', 'an empty query has a canonical default');
}

/* 4. THE PLAN IS A PLAN — rooms inside the plate, disjoint, clear of the cores
      and the light wells, and every one of them fronting the circulation. */
{
  let outside = 0, overlap = 0, inCore = 0, inCorridor = 0, unreachable = 0, wingOverlap = 0, rooms = 0;
  const touches = (r, c) => {
    // shares a face with the corridor: coincident edge + overlapping extent
    const xOver = R.x0(r) < R.x1(c) - EPS && R.x1(r) > R.x0(c) + EPS;
    const zOver = R.z0(r) < R.z1(c) - EPS && R.z1(r) > R.z0(c) + EPS;
    const zTouch = Math.abs(R.z1(r) - R.z0(c)) < 0.05 || Math.abs(R.z0(r) - R.z1(c)) < 0.05;
    const xTouch = Math.abs(R.x1(r) - R.x0(c)) < 0.05 || Math.abs(R.x0(r) - R.x1(c)) < 0.05;
    return (xOver && zTouch) || (zOver && xTouch) || R.overlaps(r, c, EPS);
  };
  for (const t of TYPOLOGY_IDS) {
    for (const s of SEEDS) {
      const b = generate(resolveParams({ s, t }));
      for (const L of b.levels) {
        for (let i = 0; i < L.wings.length; i++)
          for (let j = i + 1; j < L.wings.length; j++)
            if (R.overlaps(L.wings[i], L.wings[j], EPS)) wingOverlap++;
        for (let i = 0; i < L.rooms.length; i++) {
          const r = L.rooms[i]; rooms++;
          if (!L.wings.some((w) => R.contains(w, r, EPS))) outside++;
          for (let j = i + 1; j < L.rooms.length; j++) if (R.overlaps(r, L.rooms[j], EPS)) overlap++;
          if (L.cores.some((c) => R.overlaps(r, c, EPS))) inCore++;
          if (t !== 'cathedral' && L.corridors.some((c) => R.overlaps(r, c, EPS))) inCorridor++;
          // the cathedral's "void" is the nave VOLUME (open to the roof), which is
          // the nave room itself — a marker for the section, not a hole in the slab
          if (t !== 'cathedral' && L.voids.some((v) => R.overlaps(r, v, EPS))) inCore++;
          if (t !== 'cathedral' && !L.corridors.some((c) => touches(r, c))) unreachable++;
        }
      }
    }
  }
  ok(rooms > 4000, `the sweep actually generated rooms (${rooms})`);
  ok(wingOverlap === 0, `plate wings are disjoint at every level (${wingOverlap} overlaps)`);
  ok(outside === 0, `every room is inside its plate (${outside} outside)`);
  ok(overlap === 0, `no two rooms occupy the same square metre (${overlap} overlaps)`);
  ok(inCore === 0, `no room is inside a core or a light well (${inCore})`);
  ok(inCorridor === 0, `no room is inside the corridor (${inCorridor})`);
  ok(unreachable === 0, `every room fronts the circulation (${unreachable} landlocked)`);
}

/* 5. VERTICAL CONTINUITY — a core that leaves the plate on an upper floor is a
      stair to nowhere. Cores are sized against the smallest plate for exactly
      this reason, so it is worth asserting the reason held. */
{
  let stranded = 0, coreless = 0;
  for (const t of TYPOLOGY_IDS.filter((x) => x !== 'cathedral')) {
    for (const s of SEEDS) {
      const b = generate(resolveParams({ s, t }));
      for (const c of b.cores) {
        for (const L of b.levels) if (!L.wings.some((w) => R.contains(w, c, EPS))) stranded++;
      }
      if (!b.cores.length) coreless++;
    }
  }
  ok(stranded === 0, `every core is inside every plate it passes through (${stranded} stranded)`);
  ok(coreless === 0, 'every non-sacred building has at least one core');
}

/* 6. THE PARTS LIST — what the 3D bench instances. Finite, positive, and inside
      the bounds the drawings dimension (plus the relief the facade projects). */
{
  let bad = 0, outOfBounds = 0, total = 0;
  for (const t of TYPOLOGY_IDS) {
    for (const s of SEEDS) {
      const b = generate(resolveParams({ s, t }));
      const bx = bounds(b);
      const relief = 3.0;                       // the deepest module projection + slop
      for (const q of parts(b)) {
        total++;
        if (![q.x, q.y, q.z, q.w, q.h, q.d].every(Number.isFinite) || q.w <= 0 || q.h <= 0 || q.d <= 0) bad++;
        if (q.mat === 'ground') continue;
        if (q.x - q.w / 2 < bx.x0 - relief || q.x + q.w / 2 > bx.x1 + relief ||
            q.z - q.d / 2 < bx.z0 - relief || q.z + q.d / 2 > bx.z1 + relief ||
            q.y + q.h / 2 > bx.y1 + relief * 3) outOfBounds++;
      }
    }
  }
  ok(total > 20000, `the sweep produced parts (${total})`);
  ok(bad === 0, `every part is finite with positive extent (${bad} bad)`);
  ok(outOfBounds === 0, `every part sits inside the drawn bounds (${outOfBounds} outside)`);
}

/* 7. THE FACADE COVERS THE PLATE — bays are cut FROM the edge, so their widths
      must sum back to it. A gap here is a hole in the building. */
{
  let mismatch = 0, faces = 0;
  for (const t of TYPOLOGY_IDS.filter((x) => x !== 'cathedral')) {
    for (const s of SEEDS) {
      const b = generate(resolveParams({ s, t }));
      for (const f of b.facades) {
        faces++;
        const sum = f.bays.reduce((q, y) => q + y.w, 0);
        if (Math.abs(sum - f.len) > 0.05) mismatch++;
      }
    }
  }
  ok(faces > 400, `the sweep produced facades (${faces})`);
  ok(mismatch === 0, `bay widths sum to the plate edge on every elevation (${mismatch} short)`);
}

/* 8. THE TWO SITES AGREE — the whole point. Every bay the drawing office will
      draw on a side is a bay the model actually builds on that side, with the
      same module. (Except 'open', which is air in both.) */
{
  let missing = 0, checked = 0;
  for (const t of TYPOLOGY_IDS) {
    for (const s of ['agree-1', 'agree-2']) {
      const b = generate(resolveParams({ s, t }));
      const built = new Set(parts(b).filter((q) => q.side).map((q) => `${q.level}/${q.side}/${q.module}`));
      for (const f of b.facades) {
        for (const bay of f.bays) {
          if (bay.module === 'open') continue;
          checked++;
          if (!built.has(`${f.level}/${f.side}/${bay.module}`)) missing++;
        }
      }
    }
  }
  ok(checked > 500, `the sweep compared bays (${checked})`);
  ok(missing === 0, `every drawn bay is a built bay (${missing} drawn but not built)`);
}

/* 9. SECTION + SCHEDULE agree with the levels they are cut from. */
{
  let bad = 0, areaBad = 0;
  for (const t of TYPOLOGY_IDS) {
    for (const s of SEEDS) {
      const b = generate(resolveParams({ s, t }));
      const S = section(b, 0);
      if (S.rows.length !== b.levels.length) bad++;
      for (const row of S.rows) {
        const L = b.levels[row.level];
        const want = L.wings.filter((w) => R.z0(w) <= 0 && R.z1(w) >= 0).length;
        if (row.spans.length !== want) bad++;
      }
      const sch = schedule(b);
      const schTotal = sch.reduce((q, r) => q + r.area, 0);
      const roomTotal = b.levels.reduce((q, L) => q + L.rooms.reduce((z, r) => z + R.area(r), 0), 0);
      if (Math.abs(schTotal - roomTotal) > 1) areaBad++;
    }
  }
  ok(bad === 0, `the section reports exactly the plates it cuts (${bad} wrong)`);
  ok(areaBad === 0, 'the schedule totals the rooms it schedules');
}

/* 10. STATS are honest numbers, not decoration. */
{
  let bad = 0;
  for (const t of TYPOLOGY_IDS) {
    for (const s of SEEDS) {
      const b = generate(resolveParams({ s, t }));
      const S = b.stats;
      const wingArea = b.levels.reduce((q, L) => q + L.wings.reduce((z, w) => z + R.area(w), 0), 0);
      if (Math.abs(S.gfa - wingArea) > Math.max(1, wingArea * 0.001) && t !== 'cathedral') bad++;
      if (!(S.glazedRatio >= 0 && S.glazedRatio <= 100)) bad++;
      if (!(S.height > 0 && S.levels === b.levels.length && S.rooms >= 0)) bad++;
      if (!(S.plotRatio > 0)) bad++;
    }
  }
  ok(bad === 0, `GIA, glazed ratio, height and plot ratio are all coherent (${bad} bad)`);
}

/* 11. THE DRAWING SET renders for every typology, with no NaN leaking into the
       geometry and no unbalanced tags. An SVG with a NaN in it is a blank page. */
{
  let nan = 0, unbalanced = 0, tiny = 0;
  for (const t of TYPOLOGY_IDS) {
    for (const theme of ['blueprint', 'print']) {
      const b = generate(resolveParams({ s: 'draw-' + t, t }));
      const set = sheetSVG(b, { palette: PALETTES[theme] });
      if (/NaN|Infinity|undefined/.test(set)) nan++;
      const opens = (set.match(/<svg/g) || []).length, closes = (set.match(/<\/svg>/g) || []).length;
      if (opens !== closes || opens < 5) unbalanced++;
      if (set.length < 4000) tiny++;
      // the individual drawings must each stand alone too
      for (const svg of [planSVG(b, 0, {}), elevationSVG(b, 'S', {}), sectionSVG(b, {}),
                         titleBlockSVG(b, {}), scheduleSVG(b, {})]) {
        if (/NaN|Infinity|undefined/.test(svg)) nan++;
        if (!/^<svg[\s\S]*<\/svg>$/.test(svg.trim())) unbalanced++;
      }
    }
  }
  ok(nan === 0, `no NaN / Infinity / undefined reaches a drawing (${nan})`);
  ok(unbalanced === 0, `every drawing is a well-formed standalone SVG (${unbalanced} bad)`);
  ok(tiny === 0, 'every drawing set has content');
  // the elevation actually draws the bays it was given
  const b = generate(resolveParams({ s: 'glyphs', t: 'housing' }));
  const svg = elevationSVG(b, 'S', {});
  const drawn = new Set([...svg.matchAll(/data-module="(\w+)"/g)].map((m) => m[1]));
  const expect = new Set(b.facades.filter((f) => f.side === 'S').flatMap((f) => f.bays.map((y) => y.module)));
  ok([...expect].every((m) => drawn.has(m)), 'the elevation draws a glyph for every module it is given');
}

/* 12. THE REVISION MARK is a function of the parameters and nothing else — it is
       what a drawing is stamped with, so it must not drift between renders. */
{
  const a = generate(resolveParams({ s: 'rev-me', t: 'lab' }));
  const b = generate(resolveParams({ s: 'rev-me', t: 'lab' }));
  ok(revision(a) === revision(b) && /^[0-9A-Z]{6}$/.test(revision(a)), 'the revision mark is stable and well-formed');
  const c = generate({ ...a.params, levels: a.params.levels + 1 });
  ok(revision(c) !== revision(a), 'a changed parameter changes the revision mark');
}

/* 13. NO UNSEEDED RANDOMNESS IN THE GENERATOR. Break Math.random and the whole
       pipeline must still run — the only legal unseeded roll is rollSeed(),
       which merely chooses WHICH deterministic building to open. */
{
  const real = Math.random;
  Math.random = () => { throw new Error('unseeded Math.random() in the generator'); };
  let threw = null;
  try {
    for (const t of TYPOLOGY_IDS) {
      const b = generate(resolveParams({ s: 'no-random', t }));
      parts(b); section(b, 0); schedule(b); sheetSVG(b, {});
    }
  } catch (e) { threw = e.message; } finally { Math.random = real; }
  ok(threw === null, 'the generator and both views run with Math.random() disabled' + (threw ? ` — ${threw}` : ''));
}

/* 14. TYPOLOGY COVERAGE — every typology is reachable from a bare seed, and
       every module in every alphabet has a glyph and a part rule. */
{
  const seen = new Set();
  for (let i = 0; i < 400; i++) seen.add(deriveParams('roll' + i).typology);
  ok(seen.size === TYPOLOGY_IDS.length, `every typology is reachable from a bare seed (${seen.size}/${TYPOLOGY_IDS.length})`);
  let missing = 0;
  for (const T of Object.values(TYPOLOGIES)) for (const [m] of T.alphabet) if (!MODULES[m]) missing++;
  ok(missing === 0, 'every alphabet letter is a defined module');
}

console.log(`\nbrut/arch: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

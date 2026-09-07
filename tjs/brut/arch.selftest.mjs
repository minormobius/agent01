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
  FLOOR_IDS, LATERAL_IDS, FLOOR_SYSTEMS, floorSystem,
} from './arch.js';
import { planSVG, elevationSVG, sectionSVG, titleBlockSVG, scheduleSVG, sheetSVG, revision, PALETTES } from './blueprint.js';
import {
  solveFlight, stairFootprint, layout as stairLayout, fitsBox, chooseStair,
  STAIR_TYPES, STAIR_IDS, RULES as SR,
} from './stair.js';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error('  ✗ ' + m); } };
const SEEDS = ['brut', 'barbican-flint-317', 'nave-gull-902', 'ziggurat-moss-114', 'silo-brine-556', 'x', '⌘-unicode-seed'];
const EPS = 0.02;
const r0 = (v) => Math.round(v * 1000) / 1000;

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
          // EVERY ROOM IS REACHED, and there are exactly two ways to be.
          // Either it fronts a corridor on its own level, or — on a skip-stop
          // section — it is the upper or lower half of a maisonette entered
          // from the deck, in which case it must name that deck, the deck must
          // actually have a corridor, and a room of that dwelling must sit
          // under it there and front the corridor itself. That is a stronger
          // test than the one it replaces, not a relaxation of it: it makes
          // the SECTION carry the access rather than exempting the level.
          if (t === 'cathedral') continue;
          if (L.corridors.some((c) => touches(r, c))) continue;
          const deck = r.viaLevel != null ? b.levels.find((q) => q.index === r.viaLevel) : null;
          const reached = deck && deck.corridors.length &&
            deck.rooms.some((q) => R.overlaps(q, r, EPS) && deck.corridors.some((c) => touches(q, c)));
          if (!reached) unreachable++;
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

/* 15. EVERY PLATE IS COVERED. Slabs are cast at each level's floor, so a plate
       is only roofed by what stands on it — the top storey, and every terrace a
       setback or a ziggurat leaves behind, need a deck of their own. Sampled
       rather than summed, so it catches a roof that is present but in the wrong
       place as well as one that is missing outright. */
{
  const COVER = new Set(['roof', 'aisle-roof', 'fold']);
  let open = 0, sampled = 0, decks = 0;
  for (const t of TYPOLOGY_IDS) {
    for (const s of SEEDS) {
      const b = generate(resolveParams({ s, t }));
      const ps = parts(b);
      decks += ps.filter((q) => q.kind === 'roof').length;
      for (let i = 0; i < b.levels.length; i++) {
        const L = b.levels[i];
        const above = b.levels[i + 1] ? b.levels[i + 1].wings : [];
        const cover = ps.filter((q) => COVER.has(q.kind));
        for (const wg of L.wings) {
          for (let a = 1; a <= 7; a++) {
            for (const c of [1, 2, 3, 4, 5, 6, 7]) {
              const x = R.x0(wg) + (a / 8) * wg.w, z = R.z0(wg) + (c / 8) * wg.d;
              sampled++;
              const built = above.some((u) => x > R.x0(u) && x < R.x1(u) && z > R.z0(u) && z < R.z1(u));
              if (built) continue;
              const roofed = cover.some((q) => x > q.x - q.w / 2 - 0.01 && x < q.x + q.w / 2 + 0.01 &&
                                               z > q.z - q.d / 2 - 0.01 && z < q.z + q.d / 2 + 0.01 &&
                                               q.y > L.y + 0.5);
              if (!roofed) open++;
            }
          }
        }
      }
    }
  }
  ok(sampled > 20000, `the sweep sampled plate area (${sampled} points)`);
  ok(decks > 200, `roof decks are actually emitted (${decks})`);
  ok(open === 0, `no plate is left open to the sky (${open} uncovered samples)`);
  // A parapet has to stand ON a deck: same level, its base flush with that
  // deck's top. Otherwise it is an upstand round a hole.
  let floating = 0, parapets = 0;
  for (const t of TYPOLOGY_IDS) {
    for (const s of SEEDS) {
      const ps = parts(generate(resolveParams({ s, t })));
      const decks = ps.filter((q) => q.kind === 'roof');
      for (const q of ps.filter((r) => r.kind === 'parapet')) {
        parapets++;
        const base = q.y - q.h / 2;
        if (!decks.some((dk) => dk.level === q.level && Math.abs((dk.y + dk.h / 2) - base) < 0.02)) floating++;
      }
    }
  }
  ok(parapets > 100, `parapets are emitted (${parapets})`);
  ok(floating === 0, `every parapet stands on a deck at its own level (${floating} floating)`);
}

/* 16. THE CATHEDRAL BUILDS WHAT IT DRAWS. The transept arms and chapels are
       rooms in the plan; before this they had a footprint and no volume. */
{
  let missing = 0;
  for (const s of SEEDS) {
    const b = generate(resolveParams({ s, t: 'cathedral' }));
    const ps = parts(b);
    for (const r of b.levels[0].rooms.filter((q) => /transept|chapel/.test(q.program))) {
      const walls = ps.filter((q) => q.kind === 'wall' && Math.abs(q.x - r.x) < r.w && Math.abs(q.z - r.z) < r.d);
      const roof = ps.some((q) => q.kind === 'roof' && Math.abs(q.x - r.x) < 0.6 && Math.abs(q.z - r.z) < 0.6);
      if (walls.length < 3 || !roof) missing++;
    }
  }
  ok(missing === 0, `every transept arm and chapel is walled and roofed (${missing} unbuilt)`);
}

/* 17. THE STRUCTURAL SYSTEMS ARE DRAWN, not just declared. Same rule as the
       facade: a system that changes the solve has to put members in the model,
       or the drawings and the analysis are describing different buildings. */
{
  const base = resolveParams({ s: 'systems', t: 'office', n: '20', bx: '5', bz: '4', bay: '8' });
  const kindsFor = (over) => {
    const set = new Set();
    for (const q of parts(generate({ ...base, ...over }))) set.add(q.kind);
    return set;
  };
  ok(kindsFor({ lateral: 'outrigger' }).has('outrigger'), 'an outrigger building has outrigger trusses in it');
  ok(kindsFor({ lateral: 'diagrid' }).has('diagrid'), 'a diagrid building has diagonals in it');
  ok(kindsFor({ lateral: 'framed-tube' }).has('spandrel-band'), 'a framed tube has its spandrel bands');
  ok(kindsFor({ tmd: true }).has('tmd-mass'), 'a damped building has a damper mass');
  ok(!kindsFor({ lateral: 'core-frame', tmd: false }).has('diagrid'), 'and a plain core-and-frame has none of them');

  // beams appear exactly when the floor system has them
  for (const id of FLOOR_IDS) {
    const has = kindsFor({ floor: id }).has('beam');
    const wants = (typeof FLOOR_SYSTEMS[id].beamD === 'function' ? FLOOR_SYSTEMS[id].beamD(8) : FLOOR_SYSTEMS[id].beamD) > 0.05;
    ok(has === wants, `${id}: downstand beams are drawn iff the system has them`);
  }

  // the diagonals are rotated into the plane of the facade, not left axis-aligned
  const dia = parts(generate({ ...base, lateral: 'diagrid' })).filter((q) => q.kind === 'diagrid');
  ok(dia.every((q) => Math.abs(q.rx || 0) > 1e-6 || Math.abs(q.rz || 0) > 1e-6), 'every diagonal is actually inclined');
  ok(dia.some((q) => (q.rz || 0) > 0) && dia.some((q) => (q.rz || 0) < 0), 'diagonals cross both ways');

  // the floor system reaches the geometry: a deeper floor makes a thicker slab
  const thin = parts(generate({ ...base, floor: 'pt-flat' })).find((q) => q.kind === 'slab');
  const thick = parts(generate({ ...base, floor: 'flat-slab' })).find((q) => q.kind === 'slab');
  ok(thin.h < thick.h, `a PT plate is drawn thinner than a flat slab (${thin.h} < ${thick.h} m)`);
}

/* ══════════════════════════════════════════════════════════════════════════
   THE STAIRS
   ══════════════════════════════════════════════════════════════════════════
   A stair is the one element in the building whose rules are older than the
   building type, so it is checked against those rather than against a picture:
   equal risers, Blondel, pitch, the flight cap, landing depth. And then the
   thing this whole feature exists for — that it REACHES THE GROUND. */
{
  // ── the flight solve, against the rule book ─────────────────────────────
  for (const H of [2.6, 3.0, 3.4, 3.8, 4.5, 5.6, 7.0]) {
    const f = solveFlight(H);
    ok(Math.abs(f.risers * f.rise - H) < 1e-9, `H=${H}: the risers add up to the storey exactly`);
    ok(Number.isInteger(f.risers), `H=${H}: the riser count is an integer`);
    ok(f.rise >= SR.publicRise[0] - 1e-9 && f.rise <= SR.publicRise[1] + 1e-9,
      `H=${H}: rise ${Math.round(f.rise * 1000)} mm is inside the code band`);
    ok(f.blondel >= SR.blondelBand[0] && f.blondel <= SR.blondelBand[1],
      `H=${H}: 2R+G = ${Math.round(f.blondel * 1000)} mm satisfies Blondel`);
    ok(f.pitch <= SR.pitchMax.public + 1e-6, `H=${H}: pitch ${f.pitch}° is not a ladder`);
  }
  // a taller storey needs more risers — monotone, even though the FOOTPRINT is not
  let mono = true;
  for (let H = 2.6; H < 7; H += 0.2) {
    if (solveFlight(H + 0.2).risers < solveFlight(H).risers) mono = false;
  }
  ok(mono, 'a taller storey never needs fewer risers');

  // ── the footprint envelope ──────────────────────────────────────────────
  // NOT monotone in storey height, because the flight cap is a step function.
  // This is the property that made a core sized on the tallest floor wrong.
  const hs = [4.47, 5.59];
  const env = stairFootprint('dogleg', hs, { width: 1.35 });
  const each = hs.map((h) => stairFootprint('dogleg', h, { width: 1.35 }));
  ok(env.w >= Math.max(...each.map((e) => e.w)) - 1e-9 &&
     env.d >= Math.max(...each.map((e) => e.d)) - 1e-9,
    'the footprint over a list of heights is the envelope of them all');
  ok(each[0].d > each[1].d,
    `and it is not monotone: the ${hs[0]} m storey needs a LONGER shaft (${each[0].d} m) ` +
    `than the ${hs[1]} m one (${each[1].d} m), because 27 risers split into two flights and 34 into three`);

  // ── every type, laid out in a box that fits it ──────────────────────────
  for (const id of STAIR_IDS) {
    const fp = stairFootprint(id, 3.4, { width: 1.2 });
    if (fp.viable === false) continue;
    const st = stairLayout(id, 3.4, { x: 0, z: 0, w: fp.w + 0.1, d: fp.d + 0.1 }, { width: 1.2 });
    ok(st.pass, `${id}: passes every check in a shaft sized for it` +
      (st.pass ? '' : ` — ${st.governing.id} ${st.governing.value}`));
    // NOT "one tread per riser": an imperial has two routes sharing a flight
    // and a double helix has two sharing nothing, so the tread total is not the
    // riser count. The invariant is per ROUTE — whichever way you go, you climb
    // the whole storey.
    ok(st.routes.length >= 1, `${id}: has at least one route`);
    for (const rt of st.routes) {
      const sum = rt.reduce((a, i) => a + (st.flights.find((q) => q.i === i)?.risers || 0), 0);
      ok(sum === st.risers, `${id}: every route climbs the whole storey (${sum} of ${st.risers})`);
    }

    // it arrives exactly at the floor above. A ramp has no treads, so its
    // arrival is the last landing rather than the last nosing.
    const top = st.gradient
      ? Math.max(...st.landings.map((q) => q.y))
      : Math.max(...st.steps.map((q) => q.y + q.h / 2));
    ok(Math.abs(top - st.top) < 0.03, `${id}: arrives at the floor above (${r0(top)} of ${st.top})`);

    // and every tread is inside the shaft, with its rotation taken into account
    let out2 = 0;
    for (const q of st.steps) {
      const c = Math.abs(Math.cos(q.ry || 0)), si = Math.abs(Math.sin(q.ry || 0));
      const ex = (q.w * c + q.d * si) / 2, ez = (q.w * si + q.d * c) / 2;
      if (Math.abs(q.x - st.box.x) > st.box.w / 2 + ex + 0.02 ||
          Math.abs(q.z - st.box.z) > st.box.d / 2 + ez + 0.02) out2++;
    }
    ok(out2 === 0, `${id}: no tread escapes its shaft`);
  }

  // a type that cannot express the flight count it needs is REJECTED, not
  // silently truncated — this is what stopped a quarter turn dropping its third
  // flight and arriving two metres below the floor
  const tall = stairFootprint('quarter', 6.2, { width: 1.2 });
  ok(tall.viable === false, 'a quarter turn that would need three flights is not a quarter turn');
  ok(!fitsBox(tall, { w: 99, d: 99 }), 'and it fits no box at all, however big');

  // ── the tread convention survives turning the shaft ─────────────────────
  const a = stairLayout('dogleg', 3.4, { x: 0, z: 0, w: 2.6, d: 6 }, { width: 1.2 });
  const bx = stairLayout('dogleg', 3.4, { x: 0, z: 0, w: 6, d: 2.6 }, { width: 1.2 });
  const worldExt = (q) => {
    const c = Math.abs(Math.cos(q.ry || 0)), si = Math.abs(Math.sin(q.ry || 0));
    return [q.w * c + q.d * si, q.w * si + q.d * c];
  };
  const ea = worldExt(a.steps[0]), eb = worldExt(bx.steps[0]);
  ok(Math.abs(ea[0] - eb[1]) < 1e-6 && Math.abs(ea[1] - eb[0]) < 1e-6,
    'turning the shaft 90° turns the treads with it — the going stays along travel');
  const trav = Math.hypot(a.steps[1].x - a.steps[0].x, a.steps[1].z - a.steps[0].z);
  ok(Math.abs(trav - a.going) < 0.02, 'consecutive treads are exactly one going apart');
}

/* ── STAIRS TO GROUND — the point of the exercise ─────────────────────────── */
{
  let checked = 0;
  for (const t of TYPOLOGY_IDS) {
    for (const s of ['a', 'b', 'c']) {
      const b = generate(resolveParams({ s: 'stair-' + t + s, t }));
      const stairs = b.stairs || [];
      if (!stairs.length) continue;
      checked++;

      // every stair passes its own checks
      const bad = stairs.filter((q) => !q.pass);
      ok(bad.length === 0, `${t}-${s}: every stair complies` +
        (bad.length ? ` — ${bad.length} fail, first ${bad[0].governing.id}` : ''));

      // and the flights TILE the height with no gap: shaft by shaft, the first
      // one starts at the ground and each hands over to the next exactly
      const byShaft = new Map();
      for (const q of stairs) {
        const k = String(q.core);
        if (!byShaft.has(k)) byShaft.set(k, []);
        byShaft.get(k).push(q);
      }
      for (const [k, list] of byShaft) {
        list.sort((x, y) => x.y0 - y.y0);
        // A FEATURE STAIR IS NOT AN ESCAPE ROUTE. It connects the two levels its
        // parti named — a penthouse stair starts on the floor below the
        // penthouse and is supposed to. Only the circulation shafts have to
        // reach the ground.
        if (!list[0].feature) {
          ok(list[0].y0 < 0.05, `${t}-${s} shaft ${k}: the bottom flight starts at the ground`);
        }
        let gap = 0;
        for (let i = 0; i + 1 < list.length; i++) gap = Math.max(gap, Math.abs(list[i].top - list[i + 1].y0));
        ok(gap < 0.05, `${t}-${s} shaft ${k}: no gap between storeys (worst ${r0(gap)} m)`);
      }

      // An external stair tower must stay ATTACHED at every level it passes: it
      // used to be placed against level 0's wing and so lost a stepped mass on
      // the way up, serving nine floors of fifteen and then continuing past
      // thin air. A CAMPANILE is exempt, and deliberately so — a detached bell
      // tower is the cathedral's whole point, and it reaches the ground on its
      // own turret stair rather than through the building.
      for (const tw of b.towers) {
        if (tw.kind === 'campanile') continue;
        const detached = b.levels.filter((L) => !L.wings.some((w) =>
          Math.abs(tw.x - w.x) <= (w.w + tw.w) / 2 + 0.05 &&
          Math.abs(tw.z - w.z) <= (w.d + tw.d) / 2 + 0.05)).length;
        ok(detached === 0, `${t}-${s}: the ${tw.kind} touches the building on every level`);
      }
    }
  }
  ok(checked > 0, `stairs were generated and checked in ${checked} buildings`);

  // the campanile is detached BY DESIGN, and still climbs from grade to the
  // bells — a turret stair re-solved a storey at a time, because a 25 m
  // cathedral storey is far too tall for one flight
  const cath = generate(resolveParams({ s: 'stair-cathedral-a', t: 'cathedral' }));
  if (cath.towers.length) {
    const turret = (cath.stairs || []).filter((q) => q.turret);
    ok(turret.length > 1, `the campanile is climbed in ${turret.length} flights, not one`);
    ok(turret.every((q) => q.pass), 'and every one of them complies');
    turret.sort((x, y) => x.y0 - y.y0);
    ok(turret[0].y0 < 0.05, 'the turret stair starts at the ground');
    ok(Math.abs(turret[turret.length - 1].top - cath.towers[0].h) < 0.6,
      'and reaches the top of the tower');
    ok(STAIR_TYPES[turret[0].type].spend === 'turn',
      `a bell tower is climbed by a ${turret[0].type} — the only kind that spends its length in rotation`);
  }
}

/* ── DRAWN IS BUILT — the same rule the facade already lives by ───────────── */
{
  const b = generate(resolveParams({ s: 'stair-drawn', t: 'office' }));
  const built = parts(b).filter((q) => q.kind === 'tread');
  const total = (b.stairs || []).reduce((a, q) => a + q.steps.length, 0);
  ok(built.length === total, `every tread the kernel solves is a tread the model builds (${built.length})`);

  // and the plan draws from the same objects
  const svg = planSVG(b, 1, { width: 900, height: 640 });
  ok(svg.includes('UP'), 'the plan marks the direction of travel');
  ok(svg.length > 2000, 'the plan renders');

  // the core is a shaft, not a solid — or the stair inside it is invisible
  const walls = parts(b).filter((q) => q.kind === 'core-wall');
  ok(walls.length > 0 && parts(b).every((q) => q.kind !== 'core'),
    'cores are built as walls around a shaft rather than as solid blocks');
}

/* ── EVERY TYPE, EVERY STOREY — the design space is only real if all of it
      solves. Three heights: a housing floor, an office floor, and a double-
      height hall, which is where the fixed-flight-count types fall over. A type
      is allowed to say "not at this height"; what it is NOT allowed to do is
      arrive somewhere other than the floor it serves. */
{
  let solved = 0, refused = 0;
  for (const H of [2.9, 3.4, 4.6, 5.6]) {
    for (const t of STAIR_IDS) {
      const o = { width: undefined };
      const fp = stairFootprint(t, H, o);
      if (fp.viable === false) { refused++; continue; }
      // its own footprint is by definition the tightest shaft it fits
      const box = { x: 3, z: -2, w: Math.max(fp.w, fp.d), d: Math.min(fp.w, fp.d) };
      const st = stairLayout(t, H, box, o);
      ok(st.pass, `${t} @ ${H} m complies` + (st.pass ? '' : ` — ${st.governing && st.governing.label} = ${st.governing && st.governing.value}`));

      // EVERY ROUTE CLIMBS THE STOREY. This is the check that caught a quarter
      // turn silently dropping its third flight and arriving two metres low.
      for (const rt of st.routes) {
        const n = rt.reduce((a, i) => a + (st.flights.find((q) => q.i === i)?.risers || 0), 0);
        const climbed = st.ramp || st.gradient ? H : n * st.rise;
        ok(Math.abs(climbed - H) < 1e-6, `${t} @ ${H} m: every route arrives at the floor (${r0(climbed)} vs ${H})`);
      }
      // and nothing it draws leaves the shaft it was sized for
      const out2 = st.steps.filter((s) => {
        const m = Math.max(s.w, s.d) / 2 + 0.03;
        return Math.abs(s.x - box.x) > box.w / 2 + m || Math.abs(s.z - box.z) > box.d / 2 + m;
      });
      ok(out2.length === 0, `${t} @ ${H} m stays inside its own footprint (${out2.length} out)`);
      solved++;
    }
  }
  ok(solved > 60, `the whole stair vocabulary solves (${solved} solves, ${refused} honest refusals)`);
  ok(STAIR_IDS.length >= 20, `and it is a vocabulary rather than a handful (${STAIR_IDS.length} types)`);

  // THE ENVELOPE OVER A STACK IS AND-ED. A type that cannot express ONE storey
  // in the stack cannot serve the shaft, and taking the first storey's verdict
  // sized cores for winders that then failed three levels up.
  const mixed = [3.4, 5.7];
  for (const t of STAIR_IDS) {
    const env = stairFootprint(t, mixed, {});
    const each = mixed.map((h) => stairFootprint(t, h, {}));
    ok((env.viable !== false) === each.every((f) => f.viable !== false),
      `${t}: viability over a mixed stack is the AND of its storeys`);
  }
}

/* ── THE PARTI IS LOAD-BEARING — every meme has to reach the geometry, or it
      is a label on a building it did not make. */
{
  const seen = new Set();
  let halls = 0, wanted = 0, feats = 0, pilotis = 0, skip = 0, terraces = 0, atria = 0;
  let badHall = 0, badPilotis = 0, badFeature = 0;
  for (const t of TYPOLOGY_IDS) {
    for (let i = 0; i < 40; i++) {
      const b = generate(resolveParams({ s: `parti-${i}`, t }));
      for (const m of b.parti.memes) seen.add(m);

      // a hall the parti asked for is a real, reserved room — not overlapping a
      // core, not overlapping a void, and fronting the circulation
      const asks = b.parti.memes.some((m) => m === 'great-hall' || m === 'piano-nobile');
      if (asks) wanted++;
      for (const L of b.levels) {
        if (!L.hall) continue;
        halls++;
        if (L.cores.some((c) => R.overlaps(c, L.hall, EPS))) badHall++;
        if (L.voids.some((v) => R.overlaps(v, L.hall, EPS))) badHall++;
        if (L.corridors.some((c) => R.overlaps(c, L.hall, EPS))) badHall++;
        if (!L.rooms.some((r) => r.hall)) badHall++;
      }

      // an undercroft gives the ground away — completely
      if (b.parti.memes.includes('undercroft')) {
        pilotis++;
        const L0 = b.levels[0];
        if (L0.rooms.length || L0.corridors.length || !L0.pilotis) badPilotis++;
      }

      // a skip-stop section has a rue every third floor and nothing between
      if (b.parti.memes.includes('skip-stop')) {
        skip++;
        const decks = b.levels.filter((L) => L.corridors.length).length;
        if (decks >= b.levels.length - 1) badPilotis++;
      }

      // an atrium is the SAME void in the same place on every level it names
      const av = b.levels.map((L) => (L.voids || []).find((v) => v.parti)).filter(Boolean);
      if (av.length > 1) {
        atria++;
        const first = av[0];
        if (av.some((v) => Math.abs(v.x - first.x) > 0.01 || Math.abs(v.w - first.w) > 0.01)) badHall++;
      }

      terraces += b.levels.filter((L) => L.terrace).length;

      // a ceremonial stair is one the parti named, and it is drawn where it said
      for (const st of (b.stairs || []).filter((q) => q.feature)) {
        feats++;
        if (!st.meme || !st.featureNote) badFeature++;
        if (st.pass === false) badFeature++;
      }
    }
  }
  ok(seen.size >= 7, `the sweep exercises the whole vocabulary of memes (${seen.size})`);
  ok(halls > 20 && wanted > 20, `partis that want a hall get one (${halls} halls over ${wanted} asks)`);
  ok(badHall === 0, `a hall is genuinely reserved — clear of cores, voids and corridors (${badHall} clashes)`);
  ok(pilotis > 3 && badPilotis === 0, `an undercroft gives the whole ground away (${pilotis} of them)`);
  ok(skip > 3, `and a skip-stop section really skips (${skip} of them)`);
  ok(feats > 100 && badFeature === 0, `every ceremonial stair names its meme and complies (${feats})`);
  ok(terraces > 20 && atria > 10, `terraces and atria reach the geometry (${terraces} terraces, ${atria} atria)`);

  // and the parti is IN the drawing, not just in the kernel
  const b2 = generate(resolveParams({ s: 'parti-title', t: 'civic' }));
  const tb = titleBlockSVG(b2, { width: 640, height: 260 });
  ok(tb.includes('PARTI'), 'the title block states the parti');
  ok(b2.levels.every((L) => typeof L.label === 'string' && L.label.length),
    'and every level is named by what the parti did to it');
}

/* ── THE LIFTS REACH THE GROUND TOO ───────────────────────────────────────
      The stairs already have to tile [0, top] with no gap. A lift has the
      matching invariant and one more besides: it may only OPEN where there is
      a floor to open onto, and it must PASS every level between the terminal
      and the top of its zone — because a shaft drawn only where its doors are
      is a shaft with nothing holding it up. */
{
  let checked = 0, noTerminal = 0, gapped = 0, opensNowhere = 0, outsideCore = 0;
  let shaftsUnbuilt = 0, strandedLevel = 0;
  for (const t of TYPOLOGY_IDS.filter((x) => x !== 'cathedral')) {
    for (const s of SEEDS) {
      const b = generate(resolveParams({ s, t }));
      const g = b.liftGroup;
      ok(g && g.version, `${t}-${s}: the building carries a lift group`);
      if (!g || !g.needed) continue;
      checked++;

      // every car that got BUILT is a shaft that exists, and any the plate
      // refused is reported rather than quietly absent
      ok(b.lifts.length === g.built,
        `${t}-${s}: every car the building has is a shaft that exists (${b.lifts.length} of ${g.built})`);
      ok(g.built + (g.plateShort || 0) === g.carsTotal,
        `${t}-${s}: built + refused accounts for the whole group`);
      if (g.plateShort > 0) {
        ok(!g.pass && g.checks.some((q) => q.id === 'plate' && !q.pass),
          `${t}-${s}: a plate that cannot hold the group says so`);
      }

      for (const lf of b.lifts) {
        // it starts at the terminal, whatever zone it serves
        if (!lf.passes.includes(0) || !lf.opens.includes(0)) noTerminal++;
        // and passes every level in between, with no holes
        for (let i = 1; i < lf.passes.length; i++) if (lf.passes[i] !== lf.passes[i - 1] + 1) gapped++;
        if (!lf.opens.length) opensNowhere++;
        // every level it opens at is one it passes, and one that exists
        for (const k of lf.opens) {
          if (!lf.passes.includes(k)) strandedLevel++;
          if (!b.levels[k]) strandedLevel++;
        }
        // and it is inside the core it belongs to, unless it is the scenic car
        const c = b.cores[lf.core];
        if (c && !lf.inVoid && !R.contains(c, lf, 0.35)) outsideCore++;
      }

      // EVERY LEVEL A SHAFT PASSES IS A LEVEL IT IS BUILT AT
      const built = parts(b).filter((q) => q.kind === 'shaft-wall');
      for (const lf of b.lifts) {
        if (lf.inVoid) continue;
        for (const k of lf.passes) {
          if (!built.some((q) => q.lift === lf.id && q.level === k)) shaftsUnbuilt++;
        }
      }
    }
  }
  ok(checked > 20, `the sweep actually sized lift groups (${checked})`);
  ok(noTerminal === 0, `every lift serves the terminal floor (${noTerminal} that do not)`);
  ok(gapped === 0, `no shaft skips a level it has to pass through (${gapped} gaps)`);
  ok(opensNowhere === 0, `no lift opens nowhere (${opensNowhere})`);
  ok(strandedLevel === 0, `no lift opens at a level that is not there (${strandedLevel})`);
  ok(outsideCore === 0, `every shaft is inside the core it belongs to (${outsideCore} outside)`);
  ok(shaftsUnbuilt === 0, `every level a shaft passes is a level it is BUILT at (${shaftsUnbuilt} missing)`);
}

/* ── AND THE CORE IS SIZED BY THEM, the same way it is sized by the stair.
      This is the invariant that would rot silently: add a lift and the core
      does not grow, so the shafts quietly overlap the stair. */
{
  let overlapStair = 0, tooSmall = 0, n = 0;
  for (const t of ['office', 'housing', 'civic', 'lab']) {
    for (let i = 0; i < 25; i++) {
      const b = generate(resolveParams({ s: `lift-${i}`, t }));
      if (!b.liftGroup || !b.liftGroup.needed) continue;
      n++;
      for (const lf of b.lifts) {
        if (lf.inVoid) continue;
        const c = b.cores[lf.core];
        if (c && R.overlaps(c.stairBox, lf, 0.05)) overlapStair++;
        if (lf.w < 1.0 || lf.d < 1.0) tooSmall++;
      }
    }
  }
  ok(n > 50, `the core-sizing sweep ran (${n} buildings)`);
  ok(overlapStair === 0, `no shaft is cut through the stair beside it (${overlapStair})`);
  ok(tooSmall === 0, `and no shaft is squeezed below a car's own dimensions (${tooSmall})`);

  // MORE BUILDING IS NEVER FEWER LIFTS — the monotonicity that says the sizing
  // is a calculation rather than a lookup
  const short = generate(resolveParams({ s: 'ladder', t: 'office', n: 6 }));
  const tall = generate(resolveParams({ s: 'ladder', t: 'office', n: 22 }));
  ok(tall.liftGroup.carsTotal >= short.liftGroup.carsTotal,
    `a taller building of the same seed never gets fewer lifts (${short.liftGroup.carsTotal} → ${tall.liftGroup.carsTotal})`);
  ok(tall.cores.reduce((a, c) => a + c.w * c.d, 0) >= short.cores.reduce((a, c) => a + c.w * c.d, 0),
    'and the core it needs is never smaller');

  // the two population counts are both reported, and the verification does NOT
  // resize anything — a check that moves what it is checking is not a check
  const b2 = generate(resolveParams({ s: 'verify-me', t: 'office' }));
  ok(b2.liftGroup.verified && b2.liftGroup.verified.designPopulation > 0,
    'the group is verified against the schedule as well as the area take');
  ok(b2.lifts.length === b2.liftGroup.built,
    'and the verification changed no shafts');

  // a single-storey building has no lift and says why
  const flat = generate(resolveParams({ s: 'flat', t: 'office', n: 1 }));
  ok(!flat.liftGroup.needed && flat.lifts.length === 0, 'a one-storey building has no lift');
  ok(/nothing above/.test(flat.liftGroup.reason || ''), 'and the reason is stated rather than implied');

  // TWO storeys does, on access grounds, long before any traffic argument
  const two = generate(resolveParams({ s: 'two', t: 'housing', n: 2 }));
  ok(two.liftGroup.needed && two.lifts.length >= 1,
    'two storeys gets a lift on access grounds, at four storeys below the traffic threshold');
  ok(!two.liftGroup.traffic, 'and the kernel is honest that traffic is not why');
}

console.log(`\nbrut/arch: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

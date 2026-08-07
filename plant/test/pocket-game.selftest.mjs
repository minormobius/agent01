#!/usr/bin/env node
// Known-answer tests for plant/pocket-game.mjs — the pocket factory game.
//
// Run: node plant/test/pocket-game.selftest.mjs
//
// ---------------------------------------------------------- what is proven --
//
// `pocket-game.mjs` composes things that are each already pinned elsewhere:
// `pocketLevel.mjs`'s accumulating report (`pocket-level.selftest.mjs`),
// `production.mjs`'s feasibility (`production.selftest.mjs`), `placement.mjs`'s
// predicate (`placement.selftest.mjs`). Re-asserting any of them here would pass
// whatever this file did. Every section below is about the COMPOSITION and about
// the three judgements this module adds: the slot rule, `complete`, and `won`.
//
// TWO HOUSE RULES FROM THE LEDGER, both load-bearing here:
//
//   · CENTRES ARE CHOSEN BY SWEEP, never hand-typed. Nobody can know where
//     `generatePocket(seed: 2)` put its seeds without running it, and a
//     coordinate that happened to be occupied would fail this gate for a reason
//     that has nothing to do with the module under test.
//   · A ROLLBACK ASSERTION IS WORTH NOTHING UNTIL THE FAILURE IS SHOWN TO BE
//     REACHABLE. §4 proves the refused move really was refused before asserting
//     that nothing moved.
//
// THE ONE FIXTURE-DEPENDENT CLAIM, named so a future failure is diagnosed rather
// than debugged: §0 asserts the sweep finds at least four mutually clear centres
// in this pocket. If that ever goes red the fixture changed, not the module.

import { generatePocket } from '../foamworld.js';
import { constellation } from '../solids.mjs';
import { MIN_SEED_GAP } from '../placement.mjs';
import { PocketGame, OBJECTIVE, LINES, entryOf } from '../pocket-game.mjs';

let checks = 0, failures = 0;
const ok = (msg, cond, detail = '') => {
  checks++;
  if (!cond) { failures++; console.error(`  ✗ ${msg}${detail ? ' — ' + detail : ''}`); }
};

// ------------------------------------------------------------- the fixture --
const P = generatePocket({ seed: OBJECTIVE.seed, ...OBJECTIVE.opts });
const ANISO = P.opts.aniso;

// `reformPocket`'s own refusal metric, written out rather than imported, so a
// gap this file grades against is never read back from the code under test.
const gapLocal = (a, b) => Math.hypot(a[0] - b[0], (a[1] - b[1]) * Math.sqrt(ANISO), a[2] - b[2]);
const clearOf = (con) => {
  let m = Infinity;
  for (const a of con.seeds) for (const s of P.seeds) m = Math.min(m, gapLocal(a, s));
  return m;
};
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const conFor = (key, c) => {
  const e = entryOf(key);
  return constellation(e.solid, { centre: c, r: e.r, aniso: ANISO });
};

console.log('(0) the fixture — swept, not typed');
// Every candidate is far enough from every wall that the whole constellation is
// inside the hull, so any refusal in this sweep is a SEED refusal. That is what
// makes the clear/occupied split below mean something.
const CANDS = [];
for (let x = 10; x <= P.W - 10; x += 4) {
  for (let z = 10; z <= P.D - 10; z += 4) {
    for (const y of [12, 18, 24]) {
      // Graded with the LARGEST solid in the palette, so a centre that clears
      // here clears for every palette entry — the octahedron's 9 seeds span at
      // least as far as the tetrahedron's 5 and the cube's 7.
      const c = [x, y, z];
      CANDS.push({ c, clear: clearOf(conFor('bigSmelter', c)) });
    }
  }
}
ok('the sweep is a real lattice', CANDS.length > 300, `${CANDS.length} centres`);
ok('the lattice holds both clear and occupied centres — not a constant',
  CANDS.some((k) => k.clear >= MIN_SEED_GAP) && CANDS.some((k) => k.clear < MIN_SEED_GAP));

// Four centres, each comfortably clear of the rock and ≥ 22 m from each other.
// The palette's constellations span at most ±2r ≈ ±3.2 m about their centre, so
// 22 m of centre separation leaves well over 15 m of gap and NO pair of these
// can interact. That matters: §1 needs the whole objective to be legal for
// geometric reasons that are not in doubt.
const SPREAD = [];
for (const k of CANDS) {
  if (k.clear < 2.6) continue;
  if (SPREAD.some((f) => dist(f.c, k.c) < 22)) continue;
  SPREAD.push(k);
  if (SPREAD.length === 4) break;
}
ok('four mutually clear, well-separated centres exist in this pocket',
  SPREAD.length === 4, `${SPREAD.length} found`);
if (SPREAD.length < 4) {
  console.error('\nFIXTURE FAILURE — the pocket, not the module. Nothing below can run.');
  console.log(`\n${checks - failures}/${checks} checks passed`);
  process.exit(1);
}
const [A, B, C, D] = SPREAD.map((k) => k.c);

// ---------------------------------------------------------------------------
console.log('\n(1) a scripted playthrough WINS in a bounded number of moves');
{
  const g = new PocketGame();
  g.start();

  // THE EMPTY STATE. The certificate says ok:true — an empty factory has every
  // placement legal and every demand met, because there are none of either. The
  // whole point of `won` is that this must not read as a victory, and asserting
  // BOTH fields together is what makes this non-vacuous: an implementation that
  // returned won = v.ok fails right here, on the first frame.
  const v0 = g.verdict();
  ok('an empty factory certifies ok:true — the vacuous case is real', v0.ok === true);
  ok('…and margin 0, with no sinks to be short', v0.network.margin === 0);
  ok('…and it is NOT complete', v0.complete === false);
  ok('…and it is NOT won. `ok` alone is never the verdict', v0.won === false);
  ok('the resting line invites a move rather than congratulating', g.line() === LINES.empty);

  const MOVES = [['vein', A], ['bigSmelter', B], ['depot', C]];
  let n = 0;
  for (const [key, at] of MOVES) {
    g.select(key);
    const pv = g.preview(at);
    ok(`preview: ${key} fits at its swept centre`, pv !== null && pv.ok === true,
      pv && pv.reason ? pv.reason : '');
    const r = g.place(at);
    ok(`place: ${key} is accepted`, r.accepted === true && r.id === key);
    n++;
  }

  // THE BOUND — vision item 1's executable form of the thirty-second bar.
  ok('the whole objective is placed in exactly 3 moves', n === 3 && g.moves === 3);

  const v = g.verdict();
  ok('every placement is legal', v.placement.every((r) => r.ok) === true);
  ok('the network is fed', v.network.ok === true);
  ok('the objective is complete', v.complete === true);
  ok('IT IS WON', v.won === true);
  ok('the depot gets exactly the 20 gear it asked for', v.network.achieved.depot === 20,
    String(v.network.achieved.depot));
  ok('with nothing to spare — margin exactly 0', v.network.margin === 0);
  ok('the winning line is the module’s', g.line() === LINES.won);
}

// ---------------------------------------------------------------------------
console.log('\n(2) a refusal THE PLAYER CAUSED, in a bounded number of moves');
{
  const g = new PocketGame();
  g.start();
  g.select('vein');
  ok('the vein lands', g.place(A).accepted === true);

  // Stand the depot on top of the vein. The refusal must be blamed on the
  // EARLIER SUMMON — not on the hull, and not on the pocket's own rock. That
  // distinction is the entire reason `pocketLevel.mjs` attributes a seed refusal
  // by WHO OWNS the seed, and a game that says "there is rock there" when the
  // player parked their own machine is the confident wrong answer this tree
  // keeps recording.
  g.select('depot');
  const pv = g.preview(A);
  ok('preview refuses the second machine on the first one', pv.ok === false);
  ok('…blamed on the earlier summon, not the rock and not the wall',
    pv.refusal.blame === 'step', String(pv.refusal.blame));
  ok('…naming WHICH earlier object', pv.refusal.blockedBy === 'vein', String(pv.refusal.blockedBy));
  ok('…and the reason is level.mjs’s own words',
    pv.refusal.reason === 'collides with existing summon', String(pv.refusal.reason));

  const r = g.place(A);
  ok('place refuses it too', r.accepted === false && r.id === null);
  ok('THE BOUND: 2 moves reach a refusal the player caused', g.moves === 2);

  // A CONTROL for the blame. The same depot at a far, clear centre is legal —
  // so the refusal above is about that spot being occupied by the vein, not
  // about the depot being unplaceable in general.
  ok('CONTROL: the same depot at a clear centre is legal', g.preview(C).ok === true);
}

// ---------------------------------------------------------------------------
console.log('\n(3) the TWO failure modes are distinguishable IN ONE VERDICT');
{
  const g = new PocketGame();
  g.start();
  for (const [key, at] of [['vein', A], ['smelter', B], ['depot', C]]) {
    g.select(key);
    ok(`the small-smelter build places ${key}`, g.place(at).accepted === true);
  }
  const v = g.verdict();

  // BOTH FACTS IN THE SAME VERDICT. An implementation that collapsed geometry
  // and production into one boolean cannot satisfy both of these at once.
  ok('EVERY PLACEMENT IS LEGAL — nothing is in the way', v.placement.every((r) => r.ok) === true);
  ok('…and the objective is complete', v.complete === true);
  ok('…and it is STILL not won', v.won === false);
  ok('…because the network is short', v.network.ok === false);
  ok('the deficit names the depot', (v.network.deficits[0] || {}).sinkId === 'depot');
  ok('the small smelter makes 15 of the 20 gear needed',
    v.network.achieved.depot === 15, String(v.network.achieved.depot));
  ok('the shortfall is exactly 5',
    v.network.deficits[0].demand - v.network.deficits[0].achieved === 5);
  ok('the line says how short, in plain words', /5 gear short/.test(g.line()), g.line());
  for (const w of ['oracle', 'feasib', 'margin', 'anisotrop']) {
    ok(`the line never says "${w}"`, !g.line().toLowerCase().includes(w));
  }

  // THE CONTRAST, and it is the whole of section 3: swapping ONLY the smelter
  // turns a legal-but-short factory into a win. Nothing about the geometry
  // changed — same three centres, same order.
  const g2 = new PocketGame();
  g2.start();
  for (const [key, at] of [['vein', A], ['bigSmelter', B], ['depot', C]]) {
    g2.select(key);
    g2.place(at);
  }
  ok('CONTRAST: the same three centres with the BIG smelter is a win',
    g2.verdict().won === true);
}

// ---------------------------------------------------------------------------
console.log('\n(4) a REFUSED place changes nothing');
{
  const g = new PocketGame();
  g.start();
  g.select('vein');
  g.place(A);
  g.select('depot');

  // A serializer that can actually SEE a change. JSON.stringify renders a Map as
  // {} and Infinity as null, so a comparator built on it is blind to whole
  // classes of mutation while reading like the strictest check in the file.
  const ser = (v) => {
    if (v instanceof Map) return `Map[${[...v.entries()].map(([k, x]) => `${k}:${ser(x)}`).join(',')}]`;
    if (v instanceof Set) return `Set[${[...v].map(ser).join(',')}]`;
    if (Array.isArray(v)) return `[${v.map(ser).join(',')}]`;
    if (typeof v === 'number') return Object.is(v, -0) ? '-0' : String(v);
    if (v && typeof v === 'object') {
      return `{${Object.keys(v).sort().map((k) => `${k}:${ser(v[k])}`).join(',')}}`;
    }
    return String(v);
  };

  // `moves` is the ONE field a refusal is allowed to change — a refused summon
  // is a move the player made and must show up as one. It is normalised out of
  // the snapshot and asserted separately, so everything else can be compared
  // for exact equality rather than field by field.
  const zeroMoves = (s) => ser({ ...s, moves: 0 });
  const beforeState = zeroMoves(g.state());
  const beforeSeeds = ser(g.pocket.seeds);
  const beforeCount = g.pocket.seeds.length;
  const beforeVerdict = ser(g.verdict().placement);

  // FIRST prove the failure is reachable — otherwise every assertion below is
  // satisfied by a game in which nothing was refused because nothing happened.
  const r = g.place(A);
  ok('the move really WAS refused', r.accepted === false && r.refusal !== null);
  ok('…and it was counted as a move the player made', g.moves === 2);

  ok('state() is byte-identical across the refusal, but for the move count',
    zeroMoves(g.state()) === beforeState);
  ok('nothing was appended to the placed list', g.state().placed.length === 1);

  // The comparisons that matter:
  ok('THE POCKET IS UNTOUCHED — seed for seed', ser(g.pocket.seeds) === beforeSeeds);
  ok('…and it never grew', g.pocket.seeds.length === beforeCount);
  ok('the placement report is unchanged', ser(g.verdict().placement) === beforeVerdict);

  // A CONTROL for the serializer: it must be able to tell two pockets apart, or
  // every "unchanged" assertion above passes for a comparator stuck on equal.
  ok('CONTROL: the serializer can see a difference',
    ser(g.pocket.seeds) !== ser([...g.pocket.seeds, [1, 2, 3]]));

  // And the game is still playable afterwards — a refusal is not a dead end.
  ok('the game still accepts a legal move after a refusal', g.place(C).accepted === true);
}

// ---------------------------------------------------------------------------
console.log('\n(5) the slot rule, remove() and reset()');
{
  const g = new PocketGame();
  g.start();
  g.select('smelter');
  ok('the small smelter lands', g.place(A).accepted === true);
  g.select('bigSmelter');
  const pv = g.preview(C);
  ok('the OTHER smelter is refused even at a clear centre — one slot, one machine',
    pv.ok === false && pv.reason === 'slot');
  ok('…naming what already fills the slot', pv.slotTaken === 'smelter');
  ok('…and it is refused BEFORE any geometry is computed', pv.con === null);

  ok('remove() takes it back', g.remove('smelter') === true);
  ok('remove() of something absent is false', g.remove('smelter') === false);
  g.select('bigSmelter');
  ok('and now the slot is free', g.preview(C).ok === true);

  g.place(C);
  ok('reset() clears the list', g.reset().placed.length === 0);
  ok('…and the pocket is still the same one', g.pocket.seeds.length === P.seeds.length);
  ok('an unknown palette key throws', (() => {
    try { g.select('nope'); return false; } catch { return true; }
  })());
}

// ---------------------------------------------------------------------------
console.log('\n(6) the page as text — it imports the module and types none of its numbers');
{
  const { readFileSync } = await import('node:fs');
  const { fileURLToPath } = await import('node:url');
  const { dirname, join } = await import('node:path');
  const here = dirname(fileURLToPath(import.meta.url));
  const html = readFileSync(join(here, '..', 'index.html'), 'utf8');

  ok('index.html imports ./pocket-game.mjs',
    /import\s*\{[^}]*\bPocketGame\b[^}]*\}\s*from\s*['"]\.\/pocket-game\.mjs['"]/.test(html));
  ok('…and constructs one', /new\s+PocketGame\s*\(/.test(html));
  ok('the page calls place()', /\bgame2?\.place\s*\(|\bpg\.place\s*\(/.test(html));
  ok('the page calls verdict()', /\bpg\.verdict\s*\(/.test(html));
  ok('the page renders the module’s own line', /\bpg\.line\s*\(/.test(html));

  // THE PAGE DECIDES NOTHING. These are the calls that would mean it had started
  // judging placement or production for itself.
  for (const fn of ['pocketLevelVerdict', 'pocketPlacementReport', 'legalSummon', 'feasible']) {
    ok(`the page never calls ${fn}(...)`, !new RegExp(`\\b${fn}\\s*\\(`).test(html));
  }

  // NO OBJECTIVE LITERAL RE-TYPED. The forbidden set is DERIVED from the module
  // at run time — a hand-typed list is the thing that goes stale.
  const forbidden = new Set();
  for (const p of OBJECTIVE.palette) {
    const n = p.node;
    if (n.kind === 'source') forbidden.add(n.rate);
    if (n.kind === 'sink') forbidden.add(n.demand);
    if (n.kind === 'processor') {
      forbidden.add(n.capacity);
      for (const i of n.inputs) forbidden.add(i.rate);
      for (const o of n.outputs) forbidden.add(o.rate);
    }
  }
  forbidden.add(OBJECTIVE.seed);
  // 1, 2 and 3 are ordinary numbers in any page (viewBox, indices, r values), so
  // pinning them would fail correct work. Only the distinctive ones are checked.
  const checkable = [...forbidden].filter((v) => v > 3);
  ok('CONTROL: the forbidden set was derived and is non-empty', checkable.length >= 3,
    checkable.join(' '));
  // SCOPED TO THE BLOCK, DELIBERATELY. The rest of the page legitimately holds
  // numbers that collide with these — `height:20rem` on the summon plan is a
  // standalone 20 — and a gate that goes red for a stylesheet has failed correct
  // work, which is worse than no gate. The block is found by explicit MARKERS
  // rather than by position, so it may move without this breaking.
  const PB = html.indexOf('// POCKET GAME BLOCK BEGIN');
  const PE = html.indexOf('// POCKET GAME BLOCK END');
  ok('the block is delimited by explicit markers', PB >= 0 && PE > PB);
  const block = PB >= 0 && PE > PB ? html.slice(PB, PE) : '';
  ok('CONTROL: the slice found real content, so the negations below have a subject',
    block.length > 400, `${block.length} chars`);
  for (const lit of checkable) {
    ok(`no literal ${lit} from the objective re-typed in the block`,
      !new RegExp(`(?<![\\w.])${lit}(?![0-9.])`).test(block), String(lit));
  }

  // The words are the module's, rendered by reference — so they are NOT in the
  // page source. This is the standing MOVE rule: absence at the source.
  ok('the objective’s title is nowhere in the page source', !html.includes(OBJECTIVE.title));
  ok('the objective’s blurb is nowhere in the page source', !html.includes(OBJECTIVE.blurb));
  ok('the resting line is nowhere in the page source', !html.includes(LINES.empty));
  ok('the winning line is nowhere in the page source', !html.includes(LINES.won));
  for (const p of OBJECTIVE.palette) {
    ok(`the palette label "${p.label}" is not typed into the page`, !html.includes(p.label));
  }
}

// ---------------------------------------------------------------------------
console.log('\n(7) CONTROL for (6): the negations have a subject');
{
  // `!html.includes(undefined)` does not throw — it coerces to the string
  // "undefined", finds nothing, and returns true. So every negation in (6) is
  // satisfied by an OBJECTIVE whose fields do not exist, which is the opposite
  // of what those assertions are for. This is the check that gives them one.
  const nonEmpty = (v) => typeof v === 'string' && v.length > 8;
  ok('OBJECTIVE.title is a real string', nonEmpty(OBJECTIVE.title));
  ok('OBJECTIVE.blurb is a real string', nonEmpty(OBJECTIVE.blurb));
  ok('LINES.empty is a real string', nonEmpty(LINES.empty));
  ok('LINES.won is a real string', nonEmpty(LINES.won));
  ok('every palette entry has a real label',
    OBJECTIVE.palette.every((p) => nonEmpty(p.label)));
  ok('the palette is not empty', OBJECTIVE.palette.length === 4);
  ok('every slot names at least one palette key',
    OBJECTIVE.slots.every((s) => s.length > 0 && s.every((k) => entryOf(k) !== null)));
}

console.log(`\n${checks - failures}/${checks} checks passed`);
process.exit(failures ? 1 : 0);

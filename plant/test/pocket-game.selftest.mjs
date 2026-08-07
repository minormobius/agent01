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
import { PocketGame, OBJECTIVE, LINES, entryOf, refusalLine } from '../pocket-game.mjs';

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

// A serializer that can actually SEE a change, at module scope because §4 and §8
// both compare with it. JSON.stringify renders a Map as {} and Infinity as null,
// so a comparator built on it is blind to whole classes of mutation while
// reading like the strictest check in the file. §4 carries the CONTROL proving
// this one is not stuck on "equal".
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

  // `moves` and `lastRefusal` are the ONLY fields a refusal is allowed to
  // change — a refused summon is a move the player made and must show up as
  // one, and it must be REMEMBERED or nothing can render a sentence for it
  // (lp-16d590; see §8). Both are normalised out of the snapshot and asserted
  // SEPARATELY below, so everything else is still compared for exact equality
  // rather than field by field. Widening an exemption without asserting what
  // was exempted is how a rollback test quietly stops testing rollback.
  const norm = (s) => ser({ ...s, moves: 0, lastRefusal: null });
  const beforeState = norm(g.state());
  ok('nothing is refused yet, so there is no refusal to remember',
    g.state().lastRefusal === null);
  const beforeSeeds = ser(g.pocket.seeds);
  const beforeCount = g.pocket.seeds.length;
  const beforeVerdict = ser(g.verdict().placement);

  // FIRST prove the failure is reachable — otherwise every assertion below is
  // satisfied by a game in which nothing was refused because nothing happened.
  const r = g.place(A);
  ok('the move really WAS refused', r.accepted === false && r.refusal !== null);
  ok('…and it was counted as a move the player made', g.moves === 2);

  ok('state() is byte-identical across the refusal, but for the two exempt fields',
    norm(g.state()) === beforeState);
  ok('nothing was appended to the placed list', g.state().placed.length === 1);

  // THE EXEMPTED FIELD, asserted rather than merely excused.
  const lr = g.state().lastRefusal;
  ok('…and the refusal WAS remembered', lr !== null);
  ok('…naming what it hit', lr && lr.blame === 'step', lr ? String(lr.blame) : 'null');
  ok('…and which earlier machine', lr && lr.blockedBy === 'vein', lr ? String(lr.blockedBy) : 'null');

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

// ---------------------------------------------------------------------------
console.log('\n(8) A REFUSED CLICK SAYS WHY — the sentences are reachable at all');
{
  // WHAT THIS SECTION EXISTS FOR (lp-16d590). `line()` used to look for the
  // refusal in the verdict: `v.placement.find((r) => !r.ok)`. That find is
  // STRUCTURALLY ALWAYS UNDEFINED — `place()` appends only what it accepted, so
  // every entry in the report is legal — and the five geometry sentences were
  // therefore dead code. A refused click drew a red shape and said nothing.
  //
  // Asserting "the line names the collision" is NOT enough on its own: it would
  // pass for a build that never had the bug. The discriminating fixture is TWO
  // GAMES WITH IDENTICAL PLACED LISTS AND IDENTICAL VERDICTS, differing only in
  // whether a refusal happened. Everything the old code could see is equal
  // between them, so any difference in the line is the refusal and nothing else.

  const g = new PocketGame(); g.start();
  const h = new PocketGame(); h.start();
  for (const q of [g, h]) { q.select('vein'); q.place(A); }

  g.select('depot');
  const rr = g.place(A);                       // straight onto the vein
  ok('the refusal really happened', rr.accepted === false);

  const gv = g.verdict();
  ok('CONTROL — THE DEFECT IS EXHIBITED: the verdict still reports every '
    + 'placement legal, so a line built on it cannot see this refusal',
    gv.placement.every((r) => r.ok) === true && gv.placement.length === 1);
  ok('…and the two games agree on everything the verdict knows',
    ser(gv.placement) === ser(h.verdict().placement)
    && gv.network.ok === h.verdict().network.ok);

  const gl = g.line(), hl = h.line();
  ok('THE LINES DIFFER — the refusal is the only difference between them', gl !== hl);
  ok('…the unrefused game says what is still missing', /missing/i.test(hl), hl);
  ok('…and the refused one refuses, in words', /^No —/.test(gl), gl);
  ok('…naming what was actually hit: an earlier machine, not rock and not a wall',
    gl.includes('already built'), gl);
  ok('a refusal line is never one of the resting lines',
    gl !== LINES.empty && gl !== LINES.won);

  // A FIRST-MOVE refusal must say why rather than falling back to "pick
  // something and click" — which is why the refusal branch is ahead of the
  // empty check. This is the state a stranger is most likely to reach first.
  const occupied = CANDS.find((k) => k.clear < MIN_SEED_GAP);
  ok('the sweep found an occupied centre to stand on', !!occupied);
  if (occupied) {
    const q = new PocketGame(); q.start(); q.select('bigSmelter');
    ok('the first move into rock is refused', q.place(occupied.c).accepted === false);
    ok('…and blamed on the pocket’s own rock', q.state().lastRefusal.blame === 'pocket',
      String(q.state().lastRefusal.blame));
    ok('…and it SAYS SO instead of resting on the empty line',
      q.line() !== LINES.empty && /rock/.test(q.line()), q.line());
    ok('…and the rock sentence differs from the earlier-machine one', q.line() !== gl);
  }

  // THE SLOT REFUSAL. It has no `blame` at all — it is refused before any
  // geometry exists — so it fell through to the generic words. It now names the
  // machine that fills the slot, which is the only thing that tells a player
  // what to do about it.
  const s = new PocketGame(); s.start();
  s.select('smelter');
  ok('the small smelter lands', s.place(A).accepted === true);
  const movesBefore = s.moves;
  s.select('bigSmelter');
  ok('preview does NOT remember a refusal — only place() is a move',
    s.preview(C).ok === false && s.state().lastRefusal === null);
  const sr = s.place(C);
  ok('the other smelter is refused', sr.accepted === false);
  const slotLine = s.line();
  ok('…and the sentence names the machine already in the slot',
    slotLine.includes(entryOf('smelter').label), slotLine);
  ok('…and it did NOT cost a move: it never reached the rock',
    s.moves === movesBefore, `${movesBefore} → ${s.moves}`);
  ok('…and it is not the generic fallback — a slot is not a collision',
    slotLine !== gl && /^No —/.test(slotLine), slotLine);

  // CLEARING. A sentence that outlives what it describes is worse than none.
  s.select('depot');
  ok('choosing something else clears the refusal', s.state().lastRefusal === null);
  s.select('bigSmelter');
  s.place(C);
  ok('remove() clears it — taking the machine back is usually the FIX',
    s.remove('smelter') === true && s.state().lastRefusal === null);
  {
    const t = new PocketGame(); t.start();
    t.select('vein'); t.place(A);
    t.select('depot'); t.place(A);
    ok('a refusal is pending', t.state().lastRefusal !== null);
    ok('…an ACCEPTED place clears it', t.place(C).accepted === true
      && t.state().lastRefusal === null);
    t.select('depot');
    t.place(A);
    ok('reset() clears it', t.reset().lastRefusal === null && t.state().lastRefusal === null);
  }

  // THE INVARIANT the dead branch used to stand on, asserted rather than
  // defended against: removing an object can only DELETE seeds, so every
  // surviving object keeps at least the clearance it was accepted with.
  {
    const u = new PocketGame(); u.start();
    for (const [k, at] of [['vein', A], ['bigSmelter', B], ['depot', C]]) { u.select(k); u.place(at); }
    ok('every placement is legal before a removal', u.verdict().placement.every((r) => r.ok));
    u.remove('vein');
    ok('…and STILL legal after one — a removal cannot make a survivor illegal',
      u.verdict().placement.every((r) => r.ok) && u.verdict().placement.length === 2);
  }

  // Vocabulary and non-vacuity. The sentences were captured WHILE LIVE — reading
  // them back here would collect whatever the game says now, which after the
  // clearing assertions above is no longer a refusal at all.
  ok('refusalLine(null) is null — not "", not an empty box in the UI',
    refusalLine(null) === null);
  const sentences = [gl, slotLine];
  ok('CONTROL: there are real sentences to check',
    sentences.every((x) => typeof x === 'string' && x.length > 12));
  ok('…and they are distinct, so the vocabulary sweep is not one string twice',
    new Set(sentences).size === sentences.length);
  for (const line of sentences) {
    for (const w of ['oracle', 'feasib', 'margin', 'anisotrop', 'summonseed']) {
      ok(`no refusal sentence says "${w}"`, !line.toLowerCase().includes(w), line);
    }
  }
}

console.log(`\n${checks - failures}/${checks} checks passed`);
process.exit(failures ? 1 : 0);

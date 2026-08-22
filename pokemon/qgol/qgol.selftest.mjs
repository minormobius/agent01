// qgol selftest — run before changing life.js:
//   node pokemon/qgol/qgol.selftest.mjs
//
// Two things to establish, and they pull in opposite directions.
//
// FIRST, that the decomposition is not an approximation. The claim is that
// Q W O P is EXACTLY one generation of B3/S23 — not close to it, not a
// sequential automaton that resembles it. That is checked against a reference
// implementation written the ordinary way (snapshot in, next generation out)
// which shares no code with the operator model, across random boards, plus the
// standard oscillators and a glider that has to displace by exactly (1,1)
// every four generations.
//
// SECOND, the thing the whole variant is actually for: can a controller that
// only chooses WHICH operators to run each generation take a soup that Conway
// kills and drive it into proliferation instead? That is an experiment, so it
// is run as one — a family of controllers swept over the same doomed soups,
// reporting which works and at what cost, and allowed to come back and say the
// idea does not work.
//
// The trap in the second one is that "kept alive" is trivially satisfiable:
// never run a death operator and the board fills with a frozen slab. So
// survival is not enough to pass. The world has to still be CHANGING at the
// end, and it has to not have simply saturated.

import {
  createWorld, soup, stamp, step, run, activity, population,
  referenceStep, markBirths, markLonely, markCrowded, commit,
  neighbourCounts, mercy, get, set, CONWAY, PATTERNS,
} from './life.js';

let failures = 0;
const ok = (c, m) => { if (!c) { failures++; console.error('  ✗ ' + m); } };

// ── Q W O P is exactly Conway ───────────────────────────────────────────────
{
  // Random boards, stepped side by side against the reference. This is the
  // decisive test: if every cell of every generation agrees with an
  // independent implementation, the decomposition is right.
  let mismatches = 0, boards = 0, gens = 0;
  let s = 12345;
  const rnd = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
  for (let b = 0; b < 40; b++) {
    const w = createWorld(24, 18);
    for (let i = 0; i < w.cells.length; i++) w.cells[i] = rnd() < 0.35 ? 1 : 0;
    boards++;
    for (let g = 0; g < 15; g++) {
      const want = referenceStep(w);
      step(w);                        // all three marks, then commit
      gens++;
      for (let i = 0; i < want.length; i++) {
        if (want[i] !== w.cells[i]) { mismatches++; break; }
      }
    }
  }
  console.log(`  · ${boards} random boards x 15 generations vs an independent implementation: ${mismatches} mismatched generations`);
  ok(mismatches === 0, 'Q W O P reproduces B3/S23 exactly, cell for cell');
}

// ── the marks are order-independent, which is what makes it a decomposition ─
{
  // If the three marks are genuinely computed against an unchanged board, then
  // every ordering of them must give the same generation. If any ordering
  // differed, the operators would be mutating the grid under each other and
  // this would be a sequential automaton wearing Life's clothes.
  const perms = [
    ['birth', 'lonely', 'crowded'], ['birth', 'crowded', 'lonely'],
    ['lonely', 'birth', 'crowded'], ['lonely', 'crowded', 'birth'],
    ['crowded', 'birth', 'lonely'], ['crowded', 'lonely', 'birth'],
  ];
  let s = 999;
  const rnd = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
  const seedCells = new Uint8Array(24 * 18);
  for (let i = 0; i < seedCells.length; i++) seedCells[i] = rnd() < 0.4 ? 1 : 0;

  const results = perms.map((ops) => {
    const w = createWorld(24, 18);
    w.cells.set(seedCells);
    for (let g = 0; g < 6; g++) step(w, ops);
    return Array.from(w.cells).join('');
  });
  const allSame = results.every((r) => r === results[0]);
  ok(allSame, 'every ordering of the three marks gives the same generation — the marks do not see each other');
}

// ── the standard objects behave ────────────────────────────────────────────
{
  const period = (pattern, w = 30, h = 30) => {
    const world = createWorld(w, h);
    stamp(world, pattern, 10, 10);
    const first = Array.from(world.cells).join('');
    for (let p = 1; p <= 12; p++) {
      step(world);
      if (Array.from(world.cells).join('') === first) return p;
    }
    return -1;
  };
  const blinker = period('blinker'), toad = period('toad'), block = period('block');
  console.log(`  · periods — blinker ${blinker}, toad ${toad}, block ${block}`);
  ok(blinker === 2, 'a blinker oscillates with period 2');
  ok(toad === 2, 'a toad oscillates with period 2');
  ok(block === 1, 'a block is a still life');

  // A glider must move exactly one cell diagonally every four generations.
  const world = createWorld(40, 40);
  stamp(world, 'glider', 5, 5);
  const centre = () => {
    let sx = 0, sy = 0, n = 0;
    for (let y = 0; y < world.h; y++) {
      for (let x = 0; x < world.w; x++) {
        if (world.cells[y * world.w + x]) { sx += x; sy += y; n++; }
      }
    }
    return { x: sx / n, y: sy / n, n };
  };
  const c0 = centre();
  for (let g = 0; g < 4; g++) step(world);
  const c1 = centre();
  for (let g = 0; g < 16; g++) step(world);
  const c2 = centre();
  console.log(`  · a glider moves (${(c1.x - c0.x).toFixed(2)}, ${(c1.y - c0.y).toFixed(2)}) in 4 generations and (${(c2.x - c0.x).toFixed(2)}, ${(c2.y - c0.y).toFixed(2)}) in 20`);
  ok(Math.abs((c1.x - c0.x) - 1) < 1e-9 && Math.abs((c1.y - c0.y) - 1) < 1e-9,
    'a glider displaces exactly (1,1) every four generations');
  ok(Math.abs((c2.x - c0.x) - 5) < 1e-9 && c2.n === 5,
    'and is still a five-cell glider twenty generations later');
}

// ── the subsets do what the design says they do ────────────────────────────
{
  const trial = (ops, gens = 30) => {
    const w = createWorld(40, 40);
    soup(w, { seed: 7, density: 0.3 });
    const start = w.population;
    const pops = [start];
    for (let g = 0; g < gens; g++) { step(w, ops); pops.push(w.population); }
    return { start, end: w.population, pops };
  };
  const birthsOnly = trial(['birth']);
  const deathsOnly = trial(['lonely', 'crowded']);
  const noCrowding = trial(['birth', 'lonely']);
  const conway = trial(['birth', 'lonely', 'crowded']);
  console.log(`  · 30 generations from the same soup (start ${conway.start}): Q P alone -> ${birthsOnly.end}, W O P alone -> ${deathsOnly.end}, Q W P -> ${noCrowding.end}, Q W O P -> ${conway.end}`);

  ok(birthsOnly.pops.every((p, i) => i === 0 || p >= birthsOnly.pops[i - 1]),
    'with no death operator the population never falls');
  ok(deathsOnly.pops.every((p, i) => i === 0 || p <= deathsOnly.pops[i - 1]),
    'with no birth operator it never rises');

  // The first version of this test asserted that deaths alone always end in
  // extinction. It does not, and the test is what said so: this soup settles
  // on 13 cells and stays there. The reason is structural rather than
  // incidental — with no births the population is monotone and bounded, so it
  // must reach a fixed point, and a fixed point is by definition a board where
  // nothing gets marked, i.e. where every live cell has two or three
  // neighbours. Deaths-only is a FILTER that extracts the S23 core, and a
  // block survives it forever. Extinction is what usually happens, not what is
  // guaranteed. Asserted here as the general property, over random boards.
  {
    let s = 4242;
    const rnd = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
    let allSettled = true, allS23 = true, slowest = 0, extinctions = 0;
    for (let b = 0; b < 20; b++) {
      const w = createWorld(28, 28);
      for (let i = 0; i < w.cells.length; i++) w.cells[i] = rnd() < 0.3 ? 1 : 0;
      let settledAt = -1;
      for (let g = 1; g <= 60; g++) {
        const changed = step(w, ['lonely', 'crowded']);
        if (changed === 0) { settledAt = g; break; }
      }
      if (settledAt < 0) { allSettled = false; continue; }
      slowest = Math.max(slowest, settledAt);
      if (w.population === 0) extinctions++;
      // Every survivor of the filter must satisfy S23 — nothing left to mark.
      const n = neighbourCounts(w);
      for (let i = 0; i < w.cells.length; i++) {
        if (w.cells[i] && (n[i] < 2 || n[i] > 3)) allS23 = false;
      }
    }
    console.log(`  · deaths alone settle within ${slowest} generations on 20 random boards; ${extinctions}/20 of those fixed points are empty`);
    ok(allSettled, 'deaths alone always reach a fixed point');
    ok(allS23, 'and every cell that survives the filter has two or three neighbours — it extracts the S23 core, it does not guarantee extinction');
  }

  ok(noCrowding.end > conway.end,
    `dropping the overcrowding rule is explosive (${noCrowding.end} against Conway's ${conway.end})`);
}

// ── the experiment: can a doomed soup be driven to proliferate? ────────────
{
  const W = 64, H = 48, GENS = 600;

  // Find soups that Conway kills. These are the raw material; if a seed
  // survives on its own there is nothing to rescue.
  const doomed = [];
  for (let seed = 1; seed < 400 && doomed.length < 6; seed++) {
    const w = createWorld(W, H);
    soup(w, { seed, density: 0.26, box: 12 });
    const r = run(w, GENS, CONWAY);
    if (r.extinctAt !== null) doomed.push({ seed, diesAt: r.extinctAt });
  }
  console.log(`  · found ${doomed.length} soups that Conway extinguishes: ${doomed.map((d) => `#${d.seed}@${d.diesAt}`).join(', ')}`);
  ok(doomed.length >= 3, 'there are doomed soups to work with');

  // A family of controllers, swept rather than hand-picked: `mercy(low, drop)`
  // from life.js, which is the same function the showcase page animates. `drop`
  // is which mercy it grants; `low` is how desperate things have to get first.
  const rescuer = mercy;

  const LOWS = [8, 16, 32];
  const DROPS = ['lonely', 'crowded', 'both'];
  const rows = [];
  for (const drop of DROPS) {
    for (const low of LOWS) {
      const results = doomed.map(({ seed }) => {
        const w = createWorld(W, H);
        soup(w, { seed, density: 0.26, box: 12 });
        const r = run(w, GENS, rescuer(low, drop));
        return {
          alive: r.extinctAt === null,
          pop: w.population,
          act: activity(r.trace),
          rate: r.interventionRate,
          saturation: w.population / (W * H),
        };
      });
      const mean = (f) => results.reduce((a, x) => a + f(x), 0) / results.length;
      rows.push({
        drop, low,
        survived: results.filter((x) => x.alive).length,
        pop: mean((x) => x.pop),
        act: mean((x) => x.act),
        rate: mean((x) => x.rate),
        sat: mean((x) => x.saturation),
      });
    }
  }

  console.log(`  · ${GENS} generations, ${doomed.length} doomed soups each:`);
  for (const r of rows) {
    console.log(`      drop ${r.drop.padEnd(8)} below ${String(r.low).padStart(2)}   survived ${r.survived}/${doomed.length}   pop ${r.pop.toFixed(0).padStart(4)}   activity ${r.act.toFixed(1).padStart(5)}   saturation ${(r.sat * 100).toFixed(0).padStart(2)}%   deviated on ${(r.rate * 100).toFixed(0)}% of generations`);
  }

  // A rescue only counts if the world is still ALIVE in the sense that
  // matters: changing, and not merely a frozen slab filling the grid.
  const good = rows.filter((r) =>
    r.survived === doomed.length && r.act > 20 && r.sat < 0.7);
  const best = good.sort((a, b) => a.rate - b.rate)[0];

  ok(good.length > 0,
    'at least one controller rescues every doomed soup into a population that is still changing and has not just filled the board');
  if (best) {
    console.log(`    cheapest rescue that qualifies: drop ${best.drop} below ${best.low} — ${doomed.length}/${doomed.length} alive at generation ${GENS}, activity ${best.act.toFixed(1)}, deviating from Conway on only ${(best.rate * 100).toFixed(0)}% of generations`);
    ok(best.rate < 0.5,
      `and it does so while running plain Conway most of the time (${(best.rate * 100).toFixed(0)}% deviation)`);
  }

  // The control condition. Without the controller these same soups are dead —
  // stated as a measurement rather than assumed, because the whole result is a
  // comparison and half of it is the baseline.
  const baseline = doomed.map(({ seed }) => {
    const w = createWorld(W, H);
    soup(w, { seed, density: 0.26, box: 12 });
    const r = run(w, GENS, CONWAY);
    return r.extinctAt;
  });
  ok(baseline.every((b) => b !== null),
    `all ${doomed.length} baselines really do go extinct under Conway (at generations ${baseline.join(', ')})`);
}

// ── the ledger is a ledger ─────────────────────────────────────────────────
{
  // Marking must not touch the board, and a commit must clear everything it
  // applied. If marking mutated the grid the whole decomposition would be a
  // lie, and it is the kind of lie that still looks like Life at a glance.
  const w = createWorld(20, 20);
  stamp(w, 'glider', 5, 5);
  const before = Array.from(w.cells).join('');
  markBirths(w); markLonely(w); markCrowded(w);
  ok(Array.from(w.cells).join('') === before, 'marking does not change a single cell');
  ok(w.marked.birth > 0, 'but it does record marks');
  commit(w);
  ok(w.birthMark.every((v) => v === 0) && w.deathMark.every((v) => v === 0),
    'and a commit wipes the ledger');
  ok(Array.from(w.cells).join('') !== before, 'having actually applied it');

  // Committing an empty ledger is a no-op that still advances the clock.
  const g = w.generation;
  const changed = commit(w);
  ok(changed === 0 && w.generation === g + 1,
    'a commit with nothing pending changes nothing but still counts as a generation');
}

if (failures) {
  console.error(`\n✗ qgol selftest FAILED — ${failures} assertion(s)\n`);
  process.exit(1);
}
console.log('✓ qgol selftest passed — Q W O P is exactly B3/S23 and order-independent, the subsets behave as designed, and a controller that only chooses which operators to run drives doomed soups into living, changing populations');

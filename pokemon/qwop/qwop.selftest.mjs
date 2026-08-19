// qwop selftest — run before changing game.js:
//   node pokemon/qwop/qwop.selftest.mjs
//
// A game cannot be unit-tested into being fun, but it CAN be tested for the
// thing that decides whether it is a game at all: does skill beat no skill?
// Everything below is that question asked four ways, because I cannot sit here
// and play it, and "it compiles" is not evidence that a control scheme works.
//
// The design claim is specific and falsifiable:
//
//   1. Rhythmic tapping must beat holding all four keys down. If holding wins,
//      there is no game — the detune and the phase-reset are decoration.
//   2. Rhythmic tapping must beat mashing at random. If mashing wins, the
//      player is not learning anything.
//   3. Driving one side must turn the cell, or there is no dodging.
//   4. Going quiet must actually hide you, or the paper's sit-and-wait
//      strategy is a story rather than a mechanic.
//
// Each is checked by running a scripted policy for a fixed span and comparing
// the distance it makes. These are the numbers the game is balanced on; if a
// change moves them, the change moved the game.

import {
  createCell, tickCell, setKey, createGame, tickGame, createWorld,
  tickPredators, PREDATOR_KINDS, KEYS,
} from './game.js';

let failures = 0;
const ok = (c, m) => { if (!c) { failures++; console.error('  ✗ ' + m); } };

const STEP = 1 / 240;

// Run a policy for `secs`. policy(t, cell) returns an array of four booleans.
function run(policy, { secs = 20, beatScale } = {}) {
  const cell = createCell({ beatScale });
  let t = 0;
  let cohSum = 0, bundleSum = 0, sigSum = 0, n = 0;
  let headingDrift = 0;
  const h0 = cell.heading;
  while (t < secs) {
    const keys = policy(t, cell);
    for (let i = 0; i < 4; i++) setKey(cell, i, !!keys[i]);
    tickCell(cell, STEP);
    t += STEP;
    cohSum += cell.coherence; bundleSum += cell.bundle; sigSum += cell.signature; n++;
  }
  headingDrift = Math.abs(cell.heading - h0);
  return {
    cell,
    distance: cell.distanceUm,
    forward: Math.hypot(cell.x, cell.y),
    coherence: cohSum / n,
    bundle: bundleSum / n,
    signature: sigSum / n,
    headingDrift,
  };
}

// ── the four policies ───────────────────────────────────────────────────────
const ALL = () => [true, true, true, true];
const NONE = () => [false, false, false, false];
// The skilled one: tap all four together, briefly, on a steady beat. Holding
// between taps keeps them driven; the taps drag them back into phase.
const rhythm = (period, duty = 0.55) => (t) => {
  const on = (t % period) < period * duty;
  return [on, on, on, on];
};
// The unskilled one: each key flips at its own unrelated rate.
const masher = (t) => [
  Math.sin(t * 11.3) > 0, Math.sin(t * 7.1 + 1) > 0,
  Math.sin(t * 13.7 + 2) > 0, Math.sin(t * 5.3 + 3) > 0,
];

// ── 1. rhythm must beat holding, and beat mashing ───────────────────────────
{
  // Sweep the tap period so the result is not an artefact of one lucky choice,
  // and so the balance number is visible rather than assumed.
  const periods = [0.18, 0.25, 0.32, 0.4, 0.5, 0.7];
  const scores = periods.map((p) => ({ p, r: run(rhythm(p)) }));
  const best = scores.reduce((a, b) => (b.r.distance > a.r.distance ? b : a));
  const held = run(ALL);
  const mash = run(masher);
  const idle = run(NONE);

  console.log('  · 20 s per policy, distance travelled:');
  for (const { p, r } of scores) {
    console.log(`      tap every ${(p * 1000).toFixed(0).padStart(3)} ms   ${r.distance.toFixed(0).padStart(5)} um   coherence ${r.coherence.toFixed(2)}  bundle ${r.bundle.toFixed(2)}`);
  }
  console.log(`      hold all four     ${held.distance.toFixed(0).padStart(5)} um   coherence ${held.coherence.toFixed(2)}  bundle ${held.bundle.toFixed(2)}`);
  console.log(`      random mash       ${mash.distance.toFixed(0).padStart(5)} um   coherence ${mash.coherence.toFixed(2)}  bundle ${mash.bundle.toFixed(2)}`);
  console.log(`      do nothing        ${idle.distance.toFixed(0).padStart(5)} um`);
  console.log(`    best tap period: ${(best.p * 1000).toFixed(0)} ms`);

  ok(best.r.distance > held.distance * 1.5,
    `rhythm beats holding all four down (${best.r.distance.toFixed(0)} vs ${held.distance.toFixed(0)} um) — if this fails there is no game`);
  ok(best.r.distance > mash.distance * 1.5,
    `rhythm beats random mashing (${best.r.distance.toFixed(0)} vs ${mash.distance.toFixed(0)} um)`);
  ok(idle.distance < best.r.distance * 0.25,
    `and an idle cell goes essentially nowhere (${idle.distance.toFixed(0)} um)`);
  ok(best.r.bundle > 0.6, `skilled play actually forms a bundle (${best.r.bundle.toFixed(2)})`);
  ok(mash.bundle < best.r.bundle * 0.8,
    `mashing does not (${mash.bundle.toFixed(2)} vs ${best.r.bundle.toFixed(2)})`);
  // The skill ceiling must not be a knife edge: several nearby periods should
  // work, or the game is a frame-perfect input test rather than a rhythm.
  const workable = scores.filter((s) => s.r.distance > held.distance * 1.2).length;
  ok(workable >= 2, `more than one tap period works (${workable} of ${periods.length}) — a learnable window, not a knife edge`);
}

// ── 2. driving one side turns the cell ──────────────────────────────────────
{
  const left = run((t) => { const on = (t % 0.32) < 0.18; return [on, on, false, false]; }, { secs: 8 });
  const right = run((t) => { const on = (t % 0.32) < 0.18; return [false, false, on, on]; }, { secs: 8 });
  const even = run(rhythm(0.32), { secs: 8 });
  console.log(`  · heading change over 8 s: left pair ${(left.cell.heading * 57.3).toFixed(0)}°, right pair ${(right.cell.heading * 57.3).toFixed(0)}°, all four ${(even.cell.heading * 57.3).toFixed(0)}°`);
  ok(Math.abs(left.cell.heading) > 0.5, `driving the left pair turns the cell (${(left.cell.heading * 57.3).toFixed(0)}°)`);
  ok(Math.abs(right.cell.heading) > 0.5, `driving the right pair turns it too (${(right.cell.heading * 57.3).toFixed(0)}°)`);
  ok(Math.sign(left.cell.heading) !== Math.sign(right.cell.heading),
    'and the two sides turn it opposite ways, or the controls are a lie');
  ok(Math.abs(even.cell.heading) < Math.abs(left.cell.heading) * 0.5,
    `driving all four goes comparatively straight (${(even.cell.heading * 57.3).toFixed(0)}°)`);

  // Four unequal cilia leave a residual spin. That is intended, but it has to
  // stay small next to what one side of the keyboard can do about it, or the
  // cell is uncontrollable rather than demanding.
  const drift = Math.abs(even.cell.heading * 57.3) / 8;      // deg/s
  const authority = Math.abs(left.cell.heading * 57.3) / 8;  // deg/s
  console.log(`  · residual drift ${drift.toFixed(1)}°/s against ${authority.toFixed(0)}°/s of turning authority — ${(100 * drift / authority).toFixed(0)}% of one side`);
  ok(authority > drift * 8,
    `the player can comfortably out-steer the drift (${authority.toFixed(0)} vs ${drift.toFixed(1)} deg/s)`);
}

// ── 3. going quiet actually hides you ───────────────────────────────────────
{
  const loud = run(rhythm(0.32), { secs: 6 });
  const quiet = run(NONE, { secs: 6 });
  console.log(`  · hydrodynamic signature: swimming ${loud.cell.signature.toFixed(2)}, stopped ${quiet.cell.signature.toFixed(2)}`);
  ok(loud.cell.signature > 0.5, `a swimming cell is loud (${loud.cell.signature.toFixed(2)})`);
  ok(quiet.cell.signature < 0.1, `a stopped cell is quiet (${quiet.cell.signature.toFixed(2)})`);

  // The mechanic that matters: the same predator at the same distance should
  // notice the loud cell and miss the quiet one.
  const hears = (sig, kind) => {
    const world = createWorld(1);
    world.predators = [{
      kind, spec: PREDATOR_KINDS[kind],
      x: 300, y: 0, vx: 0, vy: 0, homeY: 0, phase: 0, alerted: 0,
    }];
    const cell = createCell({});
    cell.signature = sig;
    // One tick is enough — detection is evaluated every tick.
    tickPredators(world, cell, STEP);
    return world.predators[0].alerted > 0;
  };
  ok(hears(1.0, 'medusa'), 'a medusa hears a sprinting cell 300 um away');
  ok(!hears(0.0, 'medusa'), 'and misses a stopped one at the same distance');
  ok(!hears(0.0, 'copepod') && !hears(0.0, 'arrow'), 'nothing hears a stopped cell at 300 um');
}

// ── 4. predators can actually kill, and the run ends when they do ───────────
{
  const game = createGame({ seed: 3 });
  game.world.predators = [{
    kind: 'arrow', spec: PREDATOR_KINDS.arrow,
    x: 60, y: 0, vx: 0, vy: 0, homeY: 0, phase: 0, alerted: 99,
  }];
  let ticks = 0;
  while (!game.over && ticks < 240 * 30) { tickGame(game, STEP); ticks++; }
  console.log(`  · a locked-on arrow worm closes and kills in ${(ticks * STEP).toFixed(1)} s`);
  ok(game.over, 'a predator that reaches you ends the run');
  ok(game.cell.killedBy === 'arrow', 'and the run records what ate you');
  ok(game.best === game.cell.progressUm, 'the best distance is banked on death');
  // Ticking a finished game must be inert, or the death screen keeps playing.
  const x = game.cell.x;
  tickGame(game, STEP);
  ok(game.cell.x === x, 'and a finished game stops simulating');
}

// ── 5. the world stays bounded and sane over a long run ─────────────────────
{
  const game = createGame({ seed: 11 });
  let ticks = 0, maxPred = 0, nonFinite = 0;
  // Immortal so the run does not end early; predators still spawn and cull.
  while (ticks < 240 * 120) {
    game.cell.alive = true; game.over = false;
    const keys = (ticks * STEP % 0.32) < 0.18;
    for (let i = 0; i < 4; i++) setKey(game.cell, i, keys);
    tickGame(game, STEP);
    if (!Number.isFinite(game.cell.x) || !Number.isFinite(game.cell.heading)) nonFinite++;
    maxPred = Math.max(maxPred, game.world.predators.length);
    ticks++;
  }
  console.log(`  · 120 s run: ${(game.cell.progressUm / 1000).toFixed(1)} mm down the course, predator array peaked at ${maxPred}`);
  ok(nonFinite === 0, 'nothing goes non-finite over two minutes');
  ok(maxPred < 60, `the predator array stays bounded (peak ${maxPred}) — culling works`);
  ok(Math.abs(game.cell.y) <= game.world.laneHalf + 1, 'the cell stays inside the corridor');
  ok(game.cell.progressUm > 1000, 'and a competent player covers real ground');
}

// ── 6. the difficulty curve is survivable and varied ────────────────────────
{
  // The policy here is a competent-but-blind player: correct rhythm, holding a
  // heading, but no dodging and no going quiet. It is the floor of skill, and
  // the numbers it gets are what the balance is set against. Both ends matter —
  // dying in two seconds reads as the game being broken, and never dying at
  // all means the predators are scenery.
  //
  // It steers, because a real player steers. An earlier version of this test
  // did not, and it was measuring the wrong thing entirely: the cell curled
  // into a corridor wall, slid along it, and "survived" every run by sitting
  // somewhere the predators were not.
  const runs = [];
  for (let s = 0; s < 8; s++) {
    const g = createGame({ seed: s * 977 + 3 });
    let t = 0;
    while (!g.over && t < 45) {
      const on = (t % 0.25) < 0.1375;
      // Proportional heading hold: ease off the pair on the inside of the turn.
      const err = Math.atan2(Math.sin(g.cell.heading), Math.cos(g.cell.heading))
        + g.cell.y * 0.0012;          // and drift back toward the middle
      const left = on && !(err > 0.05);
      const right = on && !(err < -0.05);
      setKey(g.cell, 0, left); setKey(g.cell, 1, left);
      setKey(g.cell, 2, right); setKey(g.cell, 3, right);
      tickGame(g, STEP);
      t += STEP;
    }
    runs.push({ d: g.cell.progressUm, by: g.cell.killedBy || 'survived' });
  }
  const ds = runs.map((r) => r.d).sort((a, b) => a - b);
  const worst = ds[0], median = ds[ds.length >> 1];
  const killers = new Set(runs.map((r) => r.by));
  console.log(`  · blind rhythm player over ${runs.length} runs: worst ${(worst / 1000).toFixed(2)} mm, median ${(median / 1000).toFixed(2)} mm, best ${(ds[ds.length - 1] / 1000).toFixed(2)} mm`);
  console.log(`    ended by: ${[...killers].join(', ')}`);

  ok(worst > 800, `even the unluckiest run gets somewhere (${(worst / 1000).toFixed(2)} mm) — an instant death reads as a broken game`);
  ok(median > 1500, `the median run has room to breathe (${(median / 1000).toFixed(2)} mm)`);
  ok(median < 12000, `but the predators are not scenery (${(median / 1000).toFixed(2)} mm)`);
  // A blind player should still be dying — the headroom above this is what
  // dodging and going quiet are for.
  ok(!killers.has('survived') || killers.size > 1,
    'a player who never dodges and never goes quiet does eventually get caught');
}

if (failures) {
  console.error(`\n✗ qwop selftest FAILED — ${failures} assertion(s)\n`);
  process.exit(1);
}
console.log('✓ qwop selftest passed — rhythm beats holding and beats mashing, one-sided drive steers, going quiet hides you, predators kill, and the world stays bounded');

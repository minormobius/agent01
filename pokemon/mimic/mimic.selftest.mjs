// mimic selftest — run before changing puppet.js or game.js:
//   node pokemon/mimic/mimic.selftest.mjs
//
// This is an experiment and it is allowed to say the design does not work.
//
// THE DESIGN CLAIM. The whole game is that you can look at a puppet dancing and
// work out which strings were pulled. That is only possible if the map from
// input to motion is legible, and legibility is two properties in tension:
//
//   REPEATABLE   same strings -> same dance, or "Q means that" is not a fact
//                the player can learn.
//   SEPARABLE    different strings -> visibly different dance, or the player
//                is guessing and the score is noise.
//
// Neither is free. A free ragdoll fails both. A marionette should pass both,
// because strings make the motion bounded and restoring — but the four strings
// here SHARE A BODY (pull two and the puppet leans and lifts in a way neither
// does alone), and that coupling is exactly what could smear two different
// dances into the same shape.
//
// So the centrepiece is neither property on its own. It is whether MOTION
// DISTANCE TRACKS INPUT DISTANCE: if you press 90% of the right strings, does
// it look 90% right? If that correlation is weak, a player can never tell how
// close they were, partial credit means nothing, and the game is unfair in a
// way no amount of polish would fix.

import {
  KEYS, STEP, RIG, createPuppet, step, pose, perform,
  poseDistance, performanceDistance, READ_POINTS,
} from './puppet.js';
import {
  DANCE_SECS, SCORE_HZ, MAX_SHIFT_SECS, PHASE,
  choreograph, heldFrom, gridFrom, scoreAgainst,
  createDuel, begin, tickDuel, nextRound, verdict,
} from './game.js';

let failures = 0;
const ok = (c, m) => { if (!c) { failures++; console.error('  ✗ ' + m); } };

const held0 = [false, false, false, false];
const only = (k) => { const h = [false, false, false, false]; h[k] = true; return h; };

// ── the puppet hangs, and a string lifts the right limb ────────────────────
{
  // Left hanging, it must settle rather than drift or blow up.
  const p = createPuppet();
  for (let i = 0; i < 6 / STEP; i++) step(p, held0);
  const rest = pose(p);
  const finite = Object.values(rest.points).every((q) => Number.isFinite(q.x) && Number.isFinite(q.y));
  ok(finite, 'a puppet left alone stays finite');
  let speed = 0;
  for (const s of p.limbs) speed = Math.max(speed, Math.abs(s.w1), Math.abs(s.w2));
  console.log(`  · after 6 s hanging: fastest joint ${speed.toFixed(4)} rad/s, hands at y ${rest.points.end0.y.toFixed(3)} / ${rest.points.end1.y.toFixed(3)}`);
  ok(speed < 0.02, 'and comes to rest rather than swinging for ever');
  ok(rest.points.end0.y < rest.points.neck.y && rest.points.end2.y < rest.points.hip.y,
    'with its hands below its shoulders and its feet below its hips');

  // Each string lifts its OWN limb further than it lifts any other. If that
  // failed, the four keys would not be four separable things at all.
  for (let k = 0; k < 4; k++) {
    const q = createPuppet();
    for (let i = 0; i < 1.4 / STEP; i++) step(q, only(k));
    const a = pose(q);
    const rise = [0, 1, 2, 3].map((j) => a.points[`end${j}`].y - rest.points[`end${j}`].y);
    const mine = rise[k];
    const others = rise.filter((_, j) => j !== k);
    console.log(`  · string ${KEYS[k].toUpperCase()} held 1.4 s: own limb rises ${mine.toFixed(3)}, others ${others.map((v) => v.toFixed(3)).join(' / ')}`);
    ok(mine > 0.08, `${KEYS[k].toUpperCase()} actually lifts its own limb`);
    ok(mine > Math.max(...others.map(Math.abs)) * 1.5,
      `and lifts it clearly more than it disturbs the other three — otherwise the strings are not four distinguishable things`);
  }
}

// ── REPEATABLE: same strings, same dance, to the bit ───────────────────────
{
  const moves = choreograph(4242, 0.6);
  const tl = heldFrom(moves);
  const A = perform(tl, DANCE_SECS);
  const B = perform(tl, DANCE_SECS);
  const d = performanceDistance(A, B);
  console.log(`  · the same choreography danced twice: mean pose distance ${d.toExponential(2)}`);
  ok(d === 0, 'the puppet is exactly deterministic — the same strings give the same dance to the last bit, so "that move means Q" is a fact the player can learn');

  // And it must not be sensitive to where the pieces are cut: the same inputs
  // expressed as a different move list must dance identically.
  const split = [];
  for (const m of moves) {
    const mid = (m.start + m.end) / 2;
    split.push({ key: m.key, start: m.start, end: mid }, { key: m.key, start: mid, end: m.end });
  }
  const C = perform(heldFrom(split), DANCE_SECS);
  ok(performanceDistance(A, C) === 0, 'and it depends on the held intervals, not on how they were written down');
}

// ── SEPARABLE: different strings, different dance ──────────────────────────
{
  // How far apart is a dance from a DIFFERENT dance, against how far apart two
  // samples of the same dance are? The second is zero, so the useful reference
  // is the size of the puppet: a difference has to be a visible fraction of a
  // figure, not a millimetre.
  const seeds = [1, 7, 19, 33, 51, 68, 84, 97];
  let worst = Infinity, sum = 0, n = 0;
  for (let i = 0; i < seeds.length; i++) {
    for (let j = i + 1; j < seeds.length; j++) {
      const A = perform(heldFrom(choreograph(seeds[i], 0.4)), DANCE_SECS);
      const B = perform(heldFrom(choreograph(seeds[j], 0.4)), DANCE_SECS);
      const d = performanceDistance(A, B);
      worst = Math.min(worst, d); sum += d; n++;
    }
  }
  console.log(`  · ${n} pairs of different choreographies: mean separation ${(sum / n).toFixed(3)}, closest pair ${worst.toFixed(3)} (the figure is about 1.0 tall)`);
  ok(worst > 0.04,
    `even the two most similar choreographies look measurably different (${worst.toFixed(3)} of a figure) — if two different dances looked the same, the player would be guessing`);
}

// ── THE CENTREPIECE: does looking right track being right? ─────────────────
{
  // Take a choreography, corrupt it by degrees, and ask two questions of each
  // corruption: how different are the INPUTS (1 - IoU, the thing being scored),
  // and how different is the MOTION (what the player actually sees). If those
  // two do not move together, partial credit is a lie.
  function corrupt(moves, amount, rng) {
    return moves.map((m) => {
      const r = rng();
      if (r < amount * 0.45) {
        // wrong string
        return { key: (m.key + 1 + ((rng() * 3) | 0)) % 4, start: m.start, end: m.end };
      }
      if (r < amount * 0.8) {
        // wrong timing
        const shift = (rng() - 0.5) * 1.4 * amount;
        return { key: m.key, start: Math.max(0, m.start + shift), end: Math.min(DANCE_SECS, m.end + shift) };
      }
      if (r < amount) {
        // wrong duration
        const scale = 0.35 + rng() * 1.3;
        return { key: m.key, start: m.start, end: Math.min(DANCE_SECS, m.start + (m.end - m.start) * scale) };
      }
      return m;
    }).filter((m) => m.end > m.start + 0.03);
  }

  let s = 20260824;
  const rng = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };

  const rows = [];
  const pairs = [];
  for (const seed of [3, 11, 29, 47, 66, 81]) {
    const target = choreograph(seed, 0.45);
    const A = perform(heldFrom(target), DANCE_SECS);
    for (const amount of [0, 0.15, 0.3, 0.5, 0.7, 1.0]) {
      const bad = corrupt(target, amount, rng);
      const inputSim = scoreAgainst(target, bad).accuracy;   // 1 = identical inputs
      const motionD = performanceDistance(A, perform(heldFrom(bad), DANCE_SECS));
      pairs.push({ inputSim, motionD, amount });
      rows.push({ seed, amount, inputSim, motionD });
    }
  }

  // Bucket by corruption level so the table is readable.
  console.log('  · corrupting a choreography by degrees:');
  for (const amount of [0, 0.15, 0.3, 0.5, 0.7, 1.0]) {
    const g = rows.filter((r) => r.amount === amount);
    const mi = g.reduce((a, r) => a + r.inputSim, 0) / g.length;
    const md = g.reduce((a, r) => a + r.motionD, 0) / g.length;
    console.log(`      corruption ${amount.toFixed(2)}   input match ${mi.toFixed(3)}   motion difference ${md.toFixed(3)}`);
  }

  // Pearson correlation between input match and motion difference. They should
  // be strongly NEGATIVE: the better the inputs match, the smaller the visible
  // difference.
  const n = pairs.length;
  const mx = pairs.reduce((a, p) => a + p.inputSim, 0) / n;
  const my = pairs.reduce((a, p) => a + p.motionD, 0) / n;
  let sxy = 0, sxx = 0, syy = 0;
  for (const p of pairs) {
    const dx = p.inputSim - mx, dy = p.motionD - my;
    sxy += dx * dy; sxx += dx * dx; syy += dy * dy;
  }
  const r = sxy / Math.sqrt(sxx * syy);
  console.log(`  · across ${n} corrupted dances, correlation between input match and motion difference: r = ${r.toFixed(3)}`);
  ok(r < -0.75,
    `looking right tracks being right (r = ${r.toFixed(3)}) — partial credit means something, and a player can tell how close they were from the puppet alone`);

  // A perfect copy must be indistinguishable, and a total corruption must be
  // obvious. Those are the two ends the middle is interpolating between.
  const perfect = rows.filter((x) => x.amount === 0);
  const ruined = rows.filter((x) => x.amount === 1.0);
  const pd = perfect.reduce((a, x) => a + x.motionD, 0) / perfect.length;
  const rd = ruined.reduce((a, x) => a + x.motionD, 0) / ruined.length;
  ok(pd === 0, 'a perfect copy is pixel-identical');
  ok(rd > 0.05, `and a wrong answer is plainly a different dance (${rd.toFixed(3)} of a figure)`);
}

// ── the difficulty slider makes it harder, and says how ────────────────────
{
  // Three different kinds of harder, so the slider is not one thing wearing
  // three hats. Measured, because "it feels harder" is not a claim.
  console.log('  · what the difficulty slider actually changes:');
  const stats = [];
  for (const d of [0, 0.25, 0.5, 0.75, 1.0]) {
    let moves = 0, hold = 0, overlap = 0, held = 0, n = 0;
    for (let seed = 1; seed <= 40; seed++) {
      const c = choreograph(seed * 13, d);
      moves += c.length;
      for (const m of c) hold += m.end - m.start;
      n += c.length;
      // How much of the dance has two or more strings down at once.
      const g = gridFrom(c);
      const len = g[0].length;
      let multi = 0, any = 0;
      for (let i = 0; i < len; i++) {
        const c4 = g[0][i] + g[1][i] + g[2][i] + g[3][i];
        if (c4 >= 2) multi++;
        if (c4 >= 1) any++;
      }
      overlap += any ? multi / any : 0;
      held += any / len;
    }
    const row = { d, moves: moves / 40, hold: hold / n, overlap: overlap / 40, busy: held / 40 };
    stats.push(row);
    console.log(`      difficulty ${d.toFixed(2)}   ${row.moves.toFixed(1)} moves   ${row.hold.toFixed(2)} s each   ${(row.overlap * 100).toFixed(0)}% of the time two-plus strings   ${(row.busy * 100).toFixed(0)}% busy`);
  }
  const lo = stats[0], hi = stats[stats.length - 1];
  ok(hi.moves > lo.moves * 1.6, `harder means more to remember (${lo.moves.toFixed(1)} -> ${hi.moves.toFixed(1)} moves)`);
  ok(hi.hold < lo.hold * 0.7, `and shorter pulls, which read as flicks rather than poses (${lo.hold.toFixed(2)} -> ${hi.hold.toFixed(2)} s)`);
  ok(hi.overlap > lo.overlap + 0.15, `and far more overlap, which is the one that actually bites (${(lo.overlap * 100).toFixed(0)}% -> ${(hi.overlap * 100).toFixed(0)}%)`);

  // Overlap is where separability is most at risk, so check it directly at the
  // hard end rather than assuming the earlier result carries over.
  let worst = Infinity;
  const seeds = [2, 9, 21, 37, 55, 72];
  for (let i = 0; i < seeds.length; i++) {
    for (let j = i + 1; j < seeds.length; j++) {
      const A = perform(heldFrom(choreograph(seeds[i], 1.0)), DANCE_SECS);
      const B = perform(heldFrom(choreograph(seeds[j], 1.0)), DANCE_SECS);
      worst = Math.min(worst, performanceDistance(A, B));
    }
  }
  console.log(`  · at maximum difficulty the closest pair of dances is still ${worst.toFixed(3)} apart`);
  ok(worst > 0.03,
    `the hard setting is harder to REMEMBER, not harder to SEE (${worst.toFixed(3)}) — if cranking it just turned every dance into the same flailing, the slider would be a lie`);
}

// ── the scoring does what it claims ────────────────────────────────────────
{
  const t = choreograph(77, 0.4);
  ok(scoreAgainst(t, t).accuracy === 1, 'an exact copy scores 1');
  ok(scoreAgainst(t, []).accuracy < 0.02, 'playing nothing scores nothing');

  // Mashing every string for the whole dance must NOT score well. This is the
  // degenerate strategy and the one a naive "did you press the right keys"
  // metric would reward.
  const mash = [0, 1, 2, 3].map((k) => ({ key: k, start: 0, end: DANCE_SECS }));
  const mashScore = scoreAgainst(t, mash).accuracy;
  console.log(`  · holding all four strings for the whole dance scores ${mashScore.toFixed(3)}`);
  ok(mashScore < 0.35, 'holding everything down is not a strategy — IoU punishes the union, so pulling strings you should not have costs you');

  // A uniform lag is forgiven; a scrambled order is not.
  const lag = t.map((m) => ({ key: m.key, start: m.start + 0.18, end: m.end + 0.18 }));
  const lagScore = scoreAgainst(t, lag).accuracy;
  const scrambled = t.map((m, i) => ({ key: t[(i + 1) % t.length].key, start: m.start, end: m.end }));
  const scrambledScore = scoreAgainst(t, scrambled).accuracy;
  console.log(`  · a uniform 0.18 s lag scores ${lagScore.toFixed(3)}; the same moves on the wrong strings score ${scrambledScore.toFixed(3)}`);
  ok(lagScore > 0.9, 'a uniform lag is forgiven — reaction time is not the skill being tested');
  ok(scrambledScore < 0.4, 'but the right rhythm on the wrong strings is not');
  ok(scoreAgainst(t, t.map((m) => ({ ...m, start: m.start + 1.4, end: m.end + 1.4 }))).accuracy < 0.6,
    'and the shift window is small enough that it cannot rescue a badly mistimed answer');

  // Duration matters, not just which string and when.
  const stubby = t.map((m) => ({ key: m.key, start: m.start, end: m.start + (m.end - m.start) * 0.3 }));
  console.log(`  · right strings, right moments, but a third of the length: ${scoreAgainst(t, stubby).accuracy.toFixed(3)}`);
  ok(scoreAgainst(t, stubby).accuracy < 0.55, 'how long you hold a string is part of the answer');

  for (const [a, want] of [[0.95, 'puppeteer'], [0.75, 'good eye'], [0.55, 'roughly right'], [0.1, 'not that dance']]) {
    ok(verdict(a) === want, `the wording matches the number at ${a}`);
  }
}

// ── a whole duel runs through its phases ───────────────────────────────────
{
  const duel = begin(createDuel({ seed: 5, difficulty: 0.4 }));
  const seen = new Set();
  // Play the rival's own choreography back at it, offset by nothing: a perfect
  // performance, which is the only input for which the expected score is known.
  const tl = heldFrom(duel.target);
  let guard = 0;
  while (duel.phase !== PHASE.REVIEW && guard++ < 60 / STEP) {
    seen.add(duel.phase);
    const held = duel.phase === PHASE.RECALL ? tl(duel.t) : [false, false, false, false];
    tickDuel(duel, held);
  }
  seen.add(duel.phase);
  console.log(`  · a duel passes through ${[...seen].join(' -> ')} and scores a perfect mimic at ${duel.result.accuracy.toFixed(3)}`);
  ok(seen.has(PHASE.WATCH) && seen.has(PHASE.COUNT) && seen.has(PHASE.RECALL) && seen.has(PHASE.REVIEW),
    'the duel goes watch, count-in, recall, review');
  ok(duel.result.accuracy > 0.97,
    `playing the rival's own dance back at it scores about 1 (${duel.result.accuracy.toFixed(3)}) — the recorder and the scorer agree`);
  ok(duel.played.length > 0 && duel.played.length <= duel.target.length + 2,
    'and the recording has about as many moves as were played');

  // The review loop must not run away or leave a string stuck down.
  for (let i = 0; i < 20 / STEP; i++) tickDuel(duel, [false, false, false, false]);
  const q = pose(duel.mine);
  ok(Object.values(q.points).every((pt) => Number.isFinite(pt.x) && Number.isFinite(pt.y)),
    'and the review loop stays finite however long it is left running');

  const before = duel.round;
  nextRound(duel);
  ok(duel.round === before + 1 && duel.phase === PHASE.WATCH && duel.played.length === 0,
    'and the next round deals a fresh dance');
}

if (failures) {
  console.error(`\n✗ mimic selftest FAILED — ${failures} assertion(s)\n`);
  process.exit(1);
}
console.log('✓ mimic selftest passed — the puppet is exactly repeatable, different dances look different even at maximum difficulty, looking right tracks being right, and holding every string down is not a strategy');

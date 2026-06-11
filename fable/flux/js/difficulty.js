// Interest battery for flux — reads the solver's win-map analysis into a
// difficulty grade and a set of aesthetic signals. Post-hoc over a
// certified-solvable world, same as the other wings.

function clamp01(x) { return x < 0 ? 0 : x > 1 ? 1 : x; }
function goldilocks(x, ideal, w) { const d = (x - ideal) / w; return Math.exp(-d * d); }

export function grade(w, sr) {
  const rob = sr.robustness;                 // inscribed radius of best basin, in cells
  const robN = clamp01(rob / 9);             // ~9 cells ≈ very forgiving
  const a = sr.answer;
  const pathRich = clamp01((Math.min(a.bounces, 4) / 4) * 0.6 + clamp01(a.gooSteps / 160) * 0.4);
  const longShot = clamp01(a.steps / 700);

  const signals = {
    // precision: a small target window is hard (inverse robustness)
    precision: clamp01(1 - robN),
    // craft: a winning shot that bounces / threads goo / curves is more interesting
    craft: pathRich,
    // multiplicity: several distinct (significant) winning basins → options/feints
    multiplicity: clamp01(((sr.significantBasins ?? sr.basins) - 1) / 4),
    // patience: long flights (slingshots, settling) read as clever
    patience: goldilocks(longShot, 0.55, 0.4),
    // openness: not TOO tiny a total win area (a fair amount of the space wins somewhere)
    openness: goldilocks(sr.winFrac, 0.16, 0.16),
  };

  const interest = Math.round(clamp01(
    0.24 * signals.precision + 0.26 * signals.craft + 0.20 * signals.multiplicity +
    0.16 * signals.patience + 0.14 * signals.openness
  ) * 100);

  const difficulty = Math.round(clamp01(
    0.55 * signals.precision + 0.22 * signals.craft + 0.13 * (1 - clamp01(sr.biggestBasin / 0.18)) + 0.10 * longShot
  ) * 100);
  const tiers = ['Gentle', 'Easy', 'Fair', 'Tricky', 'Hard', 'Wicked'];
  const diffTier = tiers[Math.min(5, Math.floor(difficulty / 17))];

  const sig = sr.significantBasins ?? sr.basins;
  return {
    difficulty, diffTier, interest, signals,
    winFrac: sr.winFrac, basins: sig, robustness: rob,
    answer: sr.answer,
    descriptor: describe(w, { diffTier, signals, basins: sig, a }),
  };
}

function describe(w, g) {
  const tone = g.signals.precision > 0.7 ? 'a needle-thread' : g.signals.precision > 0.45 ? 'a careful' : 'an inviting';
  const shot = g.a.bounces >= 2 ? `${g.a.bounces}-bank` : g.a.gooSteps > 40 ? 'goo-threading' : g.a.steps > 480 ? 'long-curving' : 'clean';
  const opt = g.basins >= 3 ? ' with several ways in' : g.basins === 2 ? ' with a second line' : '';
  return `${tone} ${shot} ${w.bundleName || w.bundle} shot${opt}`;
}

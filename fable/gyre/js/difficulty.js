// Interest battery for gyre. Same philosophy as the other wings — post-hoc over
// a certified-solvable world — plus a torus-native signal: the WINDING of the
// canonical shot. A shot that wraps the ring twice and the tube three times is
// topologically more interesting than a straight dash, and only a torus can
// even ask the question.

function clamp01(x) { return x < 0 ? 0 : x > 1 ? 1 : x; }
function goldilocks(x, ideal, w) { const d = (x - ideal) / w; return Math.exp(-d * d); }

export function grade(w, sr) {
  const rob = sr.robustness;
  const robN = clamp01(rob / 8);
  const a = sr.answer;
  const wind = a.windU + a.windV;                 // total wraps (fractional)
  const pathRich = clamp01((Math.min(a.bounces, 4) / 4) * 0.5 + clamp01(a.gooSteps / 160) * 0.3 + clamp01(wind / 3) * 0.2);
  const longShot = clamp01(a.steps / 900);

  const signals = {
    // precision: small winning window = hard
    precision: clamp01(1 - robN),
    // winding: how much the answer wraps the ring and the tube
    winding: clamp01(wind / 3.5),
    // craft: bounces + goo threading + curvature use
    craft: pathRich,
    // multiplicity: distinct significant basins
    multiplicity: clamp01(((sr.significantBasins ?? sr.basins) - 1) / 4),
    // patience: long flights read as orbits and slingshots
    patience: goldilocks(longShot, 0.55, 0.4),
    // openness: a fair fraction of launches should win somewhere
    openness: goldilocks(sr.winFrac, 0.15, 0.15),
  };

  const interest = Math.round(clamp01(
    0.20 * signals.precision + 0.22 * signals.winding + 0.18 * signals.craft +
    0.16 * signals.multiplicity + 0.12 * signals.patience + 0.12 * signals.openness
  ) * 100);

  const difficulty = Math.round(clamp01(
    0.52 * signals.precision + 0.18 * signals.winding + 0.16 * signals.craft + 0.14 * longShot
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
  const p = Math.round(g.a.windU), q = Math.round(g.a.windV);
  const windTxt = (p + q) >= 2 ? `winds ${p}× around, ${q}× through —` : g.a.bounces >= 2 ? `banks ${g.a.bounces} times —` : '';
  const tone = g.signals.precision > 0.7 ? 'a needle-thread' : g.signals.precision > 0.45 ? 'a careful' : 'an inviting';
  const opt = g.basins >= 3 ? ' with several ways in' : g.basins === 2 ? ' with a second line' : '';
  return `${tone} ${w.bundleName || w.bundle} shot ${windTxt}${opt}`.replace(/\s+/g, ' ').trim();
}

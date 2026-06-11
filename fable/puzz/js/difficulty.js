// The interestingness battery — genus-agnostic.
//
// Given a generated, certified-unique instance and the solver trace of the
// deductions its (pure-logic) solution required, this turns the raw trace into:
//   • a difficulty score 0–100 + a named tier, EARNED by which techniques the
//     solution forces and how long the chain runs — not asserted by the author;
//   • an interest battery (mappa's worldSignals pattern): a handful of 0–1
//     aesthetic signals + a composite interest score + an evocative descriptor.
//
// Each genus declares techniqueInfo = { name: {tier, label, hint} }. Tier is a
// 1..5 reasoning-depth weight (1 = local glance, 5 = long cross-structure
// chain). That single declaration is all a new genus needs to be graded here.

function clamp01(x) { return x < 0 ? 0 : x > 1 ? 1 : x; }

// Reward a sweet spot: a bump peaking at `ideal`, falling off either side.
function goldilocks(x, ideal, width) {
  const d = (x - ideal) / width;
  return Math.exp(-d * d);
}

export function grade(inst) {
  const info = inst.genusDef?.techniqueInfo || {};
  const tech = inst.grade?.trace?.tech || {};
  const steps = inst.grade?.trace?.steps || 0;
  const solved = !!inst.grade?.solved;

  const used = Object.keys(tech).filter((k) => tech[k] > 0);
  const tiers = used.map((k) => info[k]?.tier ?? 1);
  const peakTier = tiers.length ? Math.max(...tiers) : 1;
  const breadth = used.length;
  const totalForced = used.reduce((s, k) => s + tech[k], 0);

  // clue economy: fraction of the grid left blank for the solver to recover.
  const blanks = (() => {
    let b = 0;
    for (let i = 0; i < inst.V; i++) if (inst.givens[i] === 0) b++;
    return inst.V ? b / inst.V : 0;
  })();
  const sizeFactor = clamp01(inst.V / 196); // 14×14 ≈ 1

  // ---- difficulty: depth of reasoning + length of the chain + scale ----
  const depthN = (peakTier - 1) / 4;                 // 0..1
  const lengthN = clamp01(Math.log2(1 + steps) / 8); // 0..1, saturating
  const rawDiff = 0.5 * depthN + 0.28 * lengthN + 0.12 * sizeFactor + 0.10 * blanks;
  const difficulty = Math.round(clamp01(rawDiff) * 100);
  const tierNames = ['Gentle', 'Easy', 'Medium', 'Tricky', 'Hard', 'Fiendish'];
  const diffTier = tierNames[Math.min(5, Math.floor(difficulty / 17))];

  // ---- interest signals (each 0..1) ----
  const maxTier = Math.max(2, Object.values(info).reduce((m, t) => Math.max(m, t.tier || 1), 1));
  const signals = {
    // depth: how far up the technique ladder the solution climbs
    depth: clamp01((peakTier - 1) / Math.max(1, maxTier - 1)),
    // variety: how many distinct techniques the puzzle exercises
    variety: clamp01((breadth - 1) / Math.max(1, Object.keys(info).length - 1)),
    // texture: penalise monotony — a puzzle that's 95% one move is dull
    texture: (() => {
      if (totalForced === 0) return 0;
      // normalised entropy of the technique-usage distribution
      let h = 0;
      for (const k of used) { const p = tech[k] / totalForced; h -= p * Math.log(p); }
      const hmax = Math.log(Math.max(2, breadth));
      return clamp01(h / hmax) * clamp01(breadth / 2);
    })(),
    // economy: sparse givens are elegant — but not so sparse it's a slog
    economy: goldilocks(blanks, 0.62, 0.28),
    // pace: a satisfying solve has a meaty-but-not-endless deduction chain
    pace: goldilocks(lengthN, 0.5, 0.42),
    // fairness: solvable by pure logic, no guessing
    fairness: solved ? 1 : 0,
  };

  const interest = Math.round(clamp01(
    0.22 * signals.depth +
    0.24 * signals.variety +
    0.16 * signals.texture +
    0.12 * signals.economy +
    0.12 * signals.pace +
    0.14 * signals.fairness
  ) * 100);

  return {
    difficulty, diffTier, interest, signals,
    peakTier, breadth, steps, blanks, solved,
    techniques: used.map((k) => ({ key: k, count: tech[k], tier: info[k]?.tier ?? 1, label: info[k]?.label || k })),
    descriptor: describe(inst, { difficulty, diffTier, signals, breadth, blanks, peakTier, info, used }),
  };
}

function describe(inst, g) {
  const size = inst.size ? `${inst.size.rows}×${inst.size.cols}` : '';
  const sparse = g.blanks > 0.7 ? 'sparse' : g.blanks > 0.5 ? 'open' : 'clue-rich';
  const shape =
    g.signals.variety > 0.6 ? 'many-technique' :
    g.signals.depth > 0.6 ? 'deep' :
    g.breadth <= 1 ? 'single-idea' : 'steady';
  const flavor =
    g.interest >= 78 ? 'a small gem' :
    g.interest >= 60 ? 'a satisfying' :
    g.interest >= 42 ? 'a workmanlike' : 'a slight';
  const tail = g.signals.fairness ? '' : ' (needs a guess)';
  return `${flavor} ${sparse}, ${shape} ${size} ${inst.genusDef?.name || ''}${tail}`.replace(/\s+/g, ' ').trim();
}

// expose for the composite interest sort and tuning notes
export const INTEREST_WEIGHTS = { depth: 0.22, variety: 0.24, texture: 0.16, economy: 0.12, pace: 0.12, fairness: 0.14 };

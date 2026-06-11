// The interest battery for knack — reads the SOLVER's output (par, search size,
// optimal-path analysis) into a difficulty grade and a set of aesthetic signals.
// Same philosophy as the puzz wing and mappa's worldSignals: scoring is post-hoc
// over a certified-solvable artifact, never baked into the generator's objective.

function clamp01(x) { return x < 0 ? 0 : x > 1 ? 1 : x; }
function goldilocks(x, ideal, w) { const d = (x - ideal) / w; return Math.exp(-d * d); }

export function grade(level, sr, pa) {
  const par = sr.par;
  const nodes = sr.nodes;
  const avail = new Set(level.mechanics);
  const usedAvail = pa.used.filter((m) => avail.has(m)).length;
  const board = level.W + level.H;
  const pieces = level.boxesStart.length + level.keys.length + level.coins.length +
                 level.buttons.length + level.targets.length + level.doors.length;

  const signals = {
    // depth: how long the optimal solution runs
    depth: clamp01(par / 30),
    // intricacy: how large a state space the solver had to navigate
    intricacy: clamp01(Math.log2(nodes + 1) / 18),
    // interplay: did the solution actually exercise the bundle's mechanics?
    interplay: avail.size ? clamp01(usedAvail / avail.size) : 0,
    // winding: a long solution relative to the board = a non-obvious route
    winding: clamp01((par / Math.max(4, board)) / 1.6),
    // economy: high par from few pieces is elegant
    economy: goldilocks(par / (8 + 5 * pieces), 1.0, 0.7),
    // texture: variety of interaction *events* (pushes, slides, pickups, fills)
    texture: clamp01((Math.min(pa.pushes, 3) + Math.min(pa.slides, 3) + Math.min(pa.pickups, 4) + Math.min(pa.fills, 2)) / 8),
  };

  const interest = Math.round(clamp01(
    0.18 * signals.depth + 0.16 * signals.intricacy + 0.24 * signals.interplay +
    0.16 * signals.winding + 0.12 * signals.economy + 0.14 * signals.texture
  ) * 100);

  const difficulty = Math.round(clamp01(
    0.42 * signals.depth + 0.30 * signals.intricacy + 0.16 * signals.interplay + 0.12 * signals.winding
  ) * 100);
  const tiers = ['Cozy', 'Easy', 'Medium', 'Tricky', 'Hard', 'Brutal'];
  const diffTier = tiers[Math.min(5, Math.floor(difficulty / 17))];

  return {
    par, nodes, difficulty, diffTier, interest, signals,
    used: pa.used, pushes: pa.pushes, slides: pa.slides, pickups: pa.pickups, fills: pa.fills,
    descriptor: describe(level, { par, diffTier, signals, used: pa.used }),
  };
}

function describe(level, g) {
  const sz = `${level.W}×${level.H}`;
  const route = g.signals.winding > 0.6 ? 'winding' : g.signals.winding > 0.35 ? 'roundabout' : 'direct';
  const rich = g.signals.interplay > 0.8 ? 'every mechanic earns its place in' :
               g.signals.interplay > 0.5 ? 'a real use of the parts in' : 'a light touch on';
  const gem = g.signals.economy > 0.7 && g.par >= 10 ? 'a tidy little' : g.par >= 16 ? 'a meaty' : 'a brisk';
  return `${gem} ${route} ${sz} — ${rich} ${level.bundleName || level.bundle}, par ${g.par}`;
}

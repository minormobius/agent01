// Two graders. gradeInstance() scores a concrete puzzle (par, search size, which
// of the genome's rules the solution actually uses, topological seam-crossings).
// The genome's own richness is computed in genome.js; together they let the
// atlas rank both *which games* and *which puzzles* are worth a second look.

function clamp01(x) { return x < 0 ? 0 : x > 1 ? 1 : x; }
function goldilocks(x, ideal, w) { const d = (x - ideal) / w; return Math.exp(-d * d); }

export function gradeInstance(inst, sr, pa) {
  const genome = inst.genome;
  const par = sr.par, nodes = sr.nodes;
  const ruleN = Object.values(genome.rules).filter(Boolean).length + (genome.moveModel === 'slide' ? 1 : 0);
  const usedHeadline = headlineUsed(inst, pa);

  const signals = {
    depth: clamp01(par / 26),
    intricacy: clamp01(Math.log2(nodes + 1) / 17),
    // interplay: did the solution exercise the grammar's rules?
    interplay: ruleN ? clamp01((pa.used.filter((u) => u !== 'seam').length) / ruleN) : 0.5,
    // topology: how much the solution leaned on the substrate's seams
    topology: clamp01(pa.seams / 4) * (genome.substrate.id === 'grid' ? 0 : 1),
    // economy/pace
    pace: goldilocks(clamp01(Math.log2(nodes + 1) / 17), 0.5, 0.4),
  };

  const interest = Math.round(clamp01(
    0.22 * signals.depth + 0.18 * signals.intricacy + 0.26 * signals.interplay +
    0.22 * signals.topology + 0.12 * signals.pace
  ) * 100);

  const difficulty = Math.round(clamp01(
    0.46 * signals.depth + 0.30 * signals.intricacy + 0.14 * signals.interplay + 0.10 * signals.topology
  ) * 100);
  const tiers = ['Gentle', 'Easy', 'Fair', 'Tricky', 'Hard', 'Brutal'];
  const diffTier = tiers[Math.min(5, Math.floor(difficulty / 17))];

  return {
    par, nodes, difficulty, diffTier, interest, signals,
    used: pa.used, seams: pa.seams, usedHeadline,
    descriptor: describe(inst, { par, diffTier, signals, pa }),
  };
}

// the solution must exercise the genome's defining mechanic, or the roll is a
// decorative dud (used by the atlas as an instance-acceptance gate)
export function headlineUsed(inst, pa) {
  const u = new Set(pa.used);
  switch (inst.genome.primary) {
    case 'sokoban': return u.has('push');
    case 'collect': return u.has('collect');
    case 'lights': return u.has('lights');
    default: return true; // traverse — reaching the exit is the point
  }
}
function headlineUsedFromReport(inst, pa) { return headlineUsed(inst, pa); }

function describe(inst, g) {
  const a = inst.genome.aesthetic;
  const seam = g.pa.seams >= 2 ? `wraps the ${inst.genome.substrate.id} ${g.pa.seams}×` : '';
  const tone = g.signals.depth > 0.6 ? 'a long' : g.signals.depth > 0.35 ? 'a measured' : 'a brisk';
  const lean = g.signals.topology > 0.5 ? 'topology-leaning' : g.signals.interplay > 0.6 ? 'mechanism-rich' : 'clean';
  return `${tone} ${lean} ${a.name} solve, par ${g.par}${seam ? ' — ' + seam : ''}`;
}

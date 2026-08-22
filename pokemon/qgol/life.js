// life.js — Conway's Game of QWOP.
//
// THE DESIGN PROBLEM, from the thread: a generation of Life is one button.
// Split it across four, QWOP-style, so that the player is operating the
// machinery underneath the abstraction instead of pressing "step".
//
// The tempting decompositions all have the same flaw. Splitting the RULESET
// (Q turns on extra birth conditions, W removes survival conditions) makes the
// keys into rule-modifier switches, which is a rule editor rather than a
// mechanism. And a key for SURVIVALS is the odd one out every time you try it,
// because in Life survival is not an operation — it is what happens when
// nothing is done to a cell. There is nothing for that key to do.
//
// The resolution is to notice what actually makes Life *Life*, which is not any
// of its four clauses. It is SIMULTANEITY. Every birth and death in a
// generation is computed from the same frozen snapshot and applied at once;
// evaluate them one at a time against a grid that is already changing and you
// get a different automaton entirely. So simultaneity is the thing worth
// giving a key to, and the split becomes three MARK operators and one COMMIT:
//
//   Q  MARK BIRTHS       every dead cell with exactly 3 live neighbours
//   W  MARK THE LONELY    every live cell with fewer than 2
//   O  MARK THE CROWDED   every live cell with more than 3
//   P  COMMIT             apply every mark at once, clear the ledger
//
// Marking does not touch the grid. So Q, W and O all see the same unchanged
// board however they are interleaved, and P applies their verdicts together —
// which means:
//
//   Q W O P   is EXACTLY one generation of B3/S23. Not an approximation of it;
//             the selftest checks it against blinkers, toads, gliders and the
//             R-pentomino's famous 1103-generation settling time.
//   Q P       births with nothing dying — runaway growth.
//   W O P     deaths with nothing born — a filter, not an executioner. The
//             population falls monotonically and stops, usually within a few
//             generations, on a configuration where every survivor has two or
//             three neighbours: the S23 core of whatever you started with.
//             Extinction is the common case, not a guarantee — a block sits
//             there forever, because each of its cells has exactly three.
//   Q W P     Life without overcrowding — explosive.
//   Q O P     Life without loneliness — sparse and stringy.
//
// Order inside a generation is irrelevant; WHICH operators you include is
// everything. That is the whole game, and it is why the fourth key is not a
// fourth rule clause. Three of the keys are the rule. The fourth is the clock.

export const OPS = ['birth', 'lonely', 'crowded', 'commit'];
export const KEYS = ['q', 'w', 'o', 'p'];

// ------------------------------------------------------------------ grid --
// Toroidal. A closed world with a carrying capacity is the right shape for
// asking whether a population lives or dies; on an unbounded plane "growth"
// can always be answered by running away.

export function createWorld(w, h) {
  return {
    w, h,
    cells: new Uint8Array(w * h),
    // The ledger: what is pending, not yet applied.
    birthMark: new Uint8Array(w * h),
    deathMark: new Uint8Array(w * h),
    generation: 0,
    // Bookkeeping for the HUD and the experiments.
    population: 0,
    marked: { birth: 0, lonely: 0, crowded: 0 },
    lastCommitChanged: 0,
  };
}

export function idx(world, x, y) {
  const w = world.w, h = world.h;
  return ((y % h) + h) % h * w + (((x % w) + w) % w);
}

export function get(world, x, y) { return world.cells[idx(world, x, y)]; }
export function set(world, x, y, v) { world.cells[idx(world, x, y)] = v ? 1 : 0; }

// Live neighbours of every cell, as a flat array. Recomputed per mark, which
// is the honest thing: a mark is defined against the board as it stands.
export function neighbourCounts(world, out) {
  const { w, h, cells } = world;
  const n = out || new Uint8Array(w * h);
  n.fill(0);
  for (let y = 0; y < h; y++) {
    const yUp = ((y - 1 + h) % h) * w;
    const yMid = y * w;
    const yDn = ((y + 1) % h) * w;
    for (let x = 0; x < w; x++) {
      if (!cells[yMid + x]) continue;
      const xL = (x - 1 + w) % w, xR = (x + 1) % w;
      n[yUp + xL]++; n[yUp + x]++; n[yUp + xR]++;
      n[yMid + xL]++;               n[yMid + xR]++;
      n[yDn + xL]++; n[yDn + x]++; n[yDn + xR]++;
    }
  }
  return n;
}

// ------------------------------------------------------------- operators --

const scratch = new WeakMap();
function counts(world) {
  let n = scratch.get(world);
  if (!n || n.length !== world.w * world.h) {
    n = new Uint8Array(world.w * world.h);
    scratch.set(world, n);
  }
  return neighbourCounts(world, n);
}

// Q — every dead cell with exactly three live neighbours is marked for birth.
export function markBirths(world) {
  const n = counts(world);
  let k = 0;
  for (let i = 0; i < world.cells.length; i++) {
    if (!world.cells[i] && n[i] === 3) { world.birthMark[i] = 1; k++; }
  }
  world.marked.birth = k;
  return k;
}

// W — every live cell with fewer than two live neighbours is marked to die.
export function markLonely(world) {
  const n = counts(world);
  let k = 0;
  for (let i = 0; i < world.cells.length; i++) {
    if (world.cells[i] && n[i] < 2) { world.deathMark[i] = 1; k++; }
  }
  world.marked.lonely = k;
  return k;
}

// O — every live cell with more than three live neighbours is marked to die.
export function markCrowded(world) {
  const n = counts(world);
  let k = 0;
  for (let i = 0; i < world.cells.length; i++) {
    if (world.cells[i] && n[i] > 3) { world.deathMark[i] = 1; k++; }
  }
  world.marked.crowded = k;
  return k;
}

// P — the clock. Every mark takes effect at the same instant, and the ledger
// is wiped. This is the operator that makes the other three into Life rather
// than into some sequential automaton that merely resembles it.
export function commit(world) {
  let changed = 0, pop = 0;
  for (let i = 0; i < world.cells.length; i++) {
    const was = world.cells[i];
    if (world.birthMark[i]) world.cells[i] = 1;
    if (world.deathMark[i]) world.cells[i] = 0;
    if (world.cells[i] !== was) changed++;
    pop += world.cells[i];
  }
  world.birthMark.fill(0);
  world.deathMark.fill(0);
  world.marked.birth = world.marked.lonely = world.marked.crowded = 0;
  world.generation++;
  world.population = pop;
  world.lastCommitChanged = changed;
  return changed;
}

export function applyOp(world, op) {
  if (op === 'birth') return markBirths(world);
  if (op === 'lonely') return markLonely(world);
  if (op === 'crowded') return markCrowded(world);
  if (op === 'commit') return commit(world);
  throw new Error('unknown operator: ' + op);
}

// One generation under an arbitrary subset of the three mark operators. Pass
// all three for Conway; pass fewer for something else.
export function step(world, ops = ['birth', 'lonely', 'crowded']) {
  for (const op of ops) applyOp(world, op);
  return commit(world);
}

export function population(world) {
  let p = 0;
  for (let i = 0; i < world.cells.length; i++) p += world.cells[i];
  return p;
}

// A reference implementation, written the ordinary way — snapshot in, next
// generation out — so the operator model can be checked against something that
// shares none of its code.
export function referenceStep(world) {
  const { w, h, cells } = world;
  const next = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let n = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue;
          n += cells[((y + dy + h) % h) * w + ((x + dx + w) % w)];
        }
      }
      const alive = cells[y * w + x];
      next[y * w + x] = alive ? (n === 2 || n === 3 ? 1 : 0) : (n === 3 ? 1 : 0);
    }
  }
  return next;
}

// ------------------------------------------------------------- patterns --

export const PATTERNS = {
  blinker: ['.#.', '.#.', '.#.'],
  toad: ['....', '.###', '###.', '....'],
  block: ['##', '##'],
  glider: ['.#.', '..#', '###'],
  rpentomino: ['.##', '##.', '.#.'],
  acorn: ['.#.....', '...#...', '##..###'],
  diehard: ['......#.', '##......', '.#...###'],
};

export function stamp(world, pattern, ox, oy) {
  const rows = Array.isArray(pattern) ? pattern : PATTERNS[pattern];
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      if (row[x] === '#') set(world, ox + x, oy + y, 1);
    }
  });
  world.population = population(world);
  return world;
}

function mulberry32(seed) {
  let s = seed >>> 0;
  return function () {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// A soup in the middle of the board. Low densities mostly burn out, which is
// exactly the raw material the showcase needs.
export function soup(world, { seed = 1, density = 0.28, box = 14 } = {}) {
  const rng = mulberry32(seed);
  const ox = Math.floor(world.w / 2 - box / 2);
  const oy = Math.floor(world.h / 2 - box / 2);
  world.cells.fill(0);
  for (let y = 0; y < box; y++) {
    for (let x = 0; x < box; x++) {
      if (rng() < density) set(world, ox + x, oy + y, 1);
    }
  }
  world.generation = 0;
  world.population = population(world);
  return world;
}

// ------------------------------------------------------------ the driver --
// A controller is a function (world, history) -> subset of the three mark
// operators to use for this generation. Conway is the constant function that
// always returns all three; everything else is a time-varying rule.

export const CONWAY = () => ['birth', 'lonely', 'crowded'];

// The controller family the experiment sweeps, and the one the showcase page
// animates — the same function in both places, deliberately. A showcase that
// retyped its own copy of the controller would be demonstrating something
// adjacent to what was measured rather than the thing itself.
//
// It runs plain Conway until the population falls below `low`, then suspends
// one or both death operators until it recovers. That is the entire
// intervention: it never adds a rule, never touches a cell, never places
// anything. It only declines to enforce a clause, and only when things are
// already desperate.
export function mercy(low, drop) {
  return (world) => {
    if (world.population >= low) return ['birth', 'lonely', 'crowded'];
    if (drop === 'both') return ['birth'];
    if (drop === 'lonely') return ['birth', 'crowded'];
    return ['birth', 'lonely'];
  };
}

// One controlled generation, appended to `trace`. Factored out so the animated
// page advances the world through exactly the code path the headless
// experiment does.
export function stepControlled(world, controller, trace) {
  const ops = controller(world, trace) || [];
  step(world, ops);
  const entry = {
    gen: world.generation,
    pop: world.population,
    ops,
    changed: world.lastCommitChanged,
  };
  trace.push(entry);
  return entry;
}

export function run(world, gens, controller = CONWAY) {
  const trace = [];
  let interventions = 0;
  let extinctAt = null;
  for (let g = 0; g < gens; g++) {
    const e = stepControlled(world, controller, trace);
    if (e.ops.length !== 3) interventions++;
    if (world.population === 0) { extinctAt = world.generation; break; }
  }
  return {
    trace, interventions, extinctAt,
    finalPop: world.population,
    interventionRate: gens > 0 ? interventions / Math.max(1, trace.length) : 0,
  };
}

// Seeds that Conway extinguishes at this board size — the raw material for
// both the showcase and the hand-driven mode. There is nothing to rescue from
// a soup that survives on its own, so the game has to go looking for doomed
// ones rather than hoping.
export function findDoomed(w, h, opts = {}) {
  const { gens = 400, density = 0.26, box = 12, from = 1, limit = 400, count = 1 } = opts;
  const found = [];
  for (let seed = from; seed < from + limit && found.length < count; seed++) {
    const world = createWorld(w, h);
    soup(world, { seed, density, box });
    const r = run(world, gens, CONWAY);
    if (r.extinctAt !== null) found.push({ seed, diesAt: r.extinctAt, trace: r.trace });
  }
  return found;
}

// Activity over the last `window` generations: the mean number of cells that
// actually changed state. A world that has frozen into still lifes has a
// population but no life in it, and the showcase has to be able to tell the
// difference — "kept alive" must not be satisfiable by filling the board and
// stopping.
export function activity(trace, window = 40) {
  const tail = trace.slice(-window);
  if (!tail.length) return 0;
  return tail.reduce((a, t) => a + t.changed, 0) / tail.length;
}

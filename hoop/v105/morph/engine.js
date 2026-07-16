// The generic discrete engine. ONE transition function, tryMove(), composes the
// substrate (topology) with a sampled set of micro-rules. The solver explores
// only states produced by tryMove(), so — exactly as in knack — solvability and
// par are as trustworthy as this one function. The node tests exercise every
// rule on both a plain grid AND an exotic substrate (torus / Möbius), because a
// rule that's correct on a grid can still be wrong across a seam.
//
// An instance carries only the state components its genome actually uses; the
// state key is built from those, so encodings stay compact per game.

// Cell contents are stored as flat per-cell arrays on the instance:
//   wall[c]   1 = wall
//   ice[c]    1 = ice (slide continues)
//   portalTo[c]  destination cell or -1
//   toggleInit[c] 1 = this cell participates in the lights goal
// and entity lists: boxesStart[], gems[], targets[], with index→bit masks.

export function initialState(inst) {
  const s = { agent: inst.agentStart, dir: inst.agentDir ?? 1 };
  if (inst.has.push) s.boxes = inst.boxesStart.slice().sort((a, b) => a - b);
  if (inst.has.collect) s.gems = 0;
  if (inst.has.lights) s.lit = inst.litInit;
  return s;
}
function clone(s) {
  const n = { agent: s.agent, dir: s.dir };
  if (s.boxes) n.boxes = s.boxes.slice();
  if (s.gems !== undefined) n.gems = s.gems;
  if (s.lit !== undefined) n.lit = s.lit;
  return n;
}
export function stateKey(s) {
  let k = s.agent + '.' + s.dir;
  if (s.boxes) k += '|' + s.boxes.join(',');
  if (s.gems !== undefined) k += '|g' + s.gems;
  if (s.lit !== undefined) k += '|l' + s.lit;
  return k;
}
function hasBox(s, c) { return s.boxes && s.boxes.indexOf(c) >= 0; }
function bit(n) { return 1 << n; }

// Apply on-enter effects of arriving at cell c (mutates s).
function applyEnter(inst, s, c) {
  if (inst.has.collect) { const i = inst.gemAt[c]; if (i >= 0) s.gems |= bit(i); }
  if (inst.has.lights) {
    const grp = inst.lightGroup[c];
    if (grp) for (const t of grp) s.lit ^= bit(t);
  }
}

// Can the agent occupy cell c (terrain/box aware)? Pushing is handled separately.
function blocked(inst, s, c) {
  if (inst.wall[c]) return true;
  if (hasBox(s, c)) return true;
  return false;
}

// Take ONE substrate step from (cell,dir): resolve wall / push / portal. Returns
// { cell, dir } the agent ends on for this micro-step, or null if illegal.
function microStep(inst, s, cell, dir) {
  const r = inst.sub.step(cell, dir);
  if (!r) return null;                 // open boundary
  let t = r.cell, nd = r.dir;
  if (inst.wall[t]) return null;
  if (hasBox(s, t)) {
    if (!inst.has.push) return null;
    const beyond = inst.sub.step(t, nd);
    if (!beyond) return null;
    const b2 = beyond.cell;
    if (inst.wall[b2] || hasBox(s, b2)) return null;   // single-box push only
    // move the box
    s.boxes = s.boxes.filter((x) => x !== t); s.boxes.push(b2); s.boxes.sort((a, b) => a - b);
  }
  // portal: arriving on a portal sends you to its pair (no immediate re-trigger)
  if (inst.has.portal && inst.portalTo[t] >= 0) { t = inst.portalTo[t]; }
  return { cell: t, dir: nd };
}

// One player move. Returns a new state or null (illegal / no-op).
export function tryMove(inst, state, dir) {
  const s = clone(state);
  let r = microStep(inst, s, s.agent, dir);
  if (!r) return null;
  s.agent = r.cell; s.dir = r.dir;
  applyEnter(inst, s, s.agent);

  // slide: on ice (or in a fully-slick world) keep going in the current dir
  const sliding = inst.moveModel === 'slide' || (inst.has.ice && inst.ice[s.agent]);
  if (sliding) {
    let guard = 0;
    while (guard++ < 400) {
      if (inst.moveModel !== 'slide' && !inst.ice[s.agent]) break; // came off the ice
      const nx = microStep(inst, s, s.agent, s.dir);
      if (!nx) break;
      s.agent = nx.cell; s.dir = nx.dir;
      applyEnter(inst, s, s.agent);
      if (s.agent === state.agent && stateKey(s) === stateKey(state)) break; // closed loop guard
    }
  }

  if (stateKey(s) === stateKey(state)) return null; // no-op
  return s;
}

// ---- goals ----
export function isWin(inst, s) {
  switch (inst.goal.type) {
    case 'exit': return s.agent === inst.goal.cell;
    case 'collect': return s.gems === inst.allGems && (inst.goal.thenExit ? s.agent === inst.goal.cell : true);
    case 'cover': { for (const t of inst.targets) if (!hasBox(s, t)) return false; return true; }
    case 'lights': return s.lit === inst.litGoal;
    default: return false;
  }
}

// Build per-cell lookup arrays + masks from a raw instance spec. The spec uses
// the same field names; compile fills the fast structures the engine reads.
export function compile(inst) {
  const N = inst.sub.ncells;
  inst.wall = inst.wall || new Uint8Array(N);
  inst.ice = inst.ice || new Uint8Array(N);
  inst.portalTo = new Int32Array(N).fill(-1);
  for (const [a, b] of inst.portals || []) { inst.portalTo[a] = b; inst.portalTo[b] = a; }
  inst.gemAt = new Int32Array(N).fill(-1);
  (inst.gems || []).forEach((c, i) => { inst.gemAt[c] = i; });
  inst.allGems = (inst.gems || []).length ? (1 << inst.gems.length) - 1 : 0;
  // lights: each toggle cell flips itself + its substrate-neighbours
  inst.lightGroup = {};
  if (inst.has.lights) {
    const toggles = inst.toggles || [];
    const indexOfCell = {};
    toggles.forEach((c, i) => { indexOfCell[c] = i; });
    for (const c of toggles) {
      const grp = [indexOfCell[c]];
      for (let d = 0; d < inst.sub.dirs; d++) {
        const r = inst.sub.step(c, d);
        if (r && indexOfCell[r.cell] !== undefined) grp.push(indexOfCell[r.cell]);
      }
      inst.lightGroup[c] = grp;
    }
    inst.litGoal = (1 << toggles.length) - 1;          // goal: all lit
    inst.litInit = inst.litInit ?? 0;
  }
  inst.has = inst.has || {};
  return inst;
}

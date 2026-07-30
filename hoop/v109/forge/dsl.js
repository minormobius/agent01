// The rule-DSL — the foundry's alphabet. A LAW is a small typed genome of
// primitives; compile() turns any genome into a deterministic transition
// function, and describe() turns the same genome into English (the rules card
// writes itself, one level deeper than morph).
//
// The language is CLOSED: every well-formed genome compiles to a total,
// deterministic step function. That closure is the whole trick — whatever the
// foundry mints, the unchanged BFS oracle can still certify. The combinatorial
// space here is ~9k raw genomes; most are degenerate or behavioural duplicates
// of each other, which is exactly why the fingerprint + novelty archive exist.

export const GENES = {
  // how the agent displaces when a move in direction d is attempted
  motion: ['step', 'slide', 'leap', 'bounce'],
  // when is the move permitted at all
  guard: ['none', 'needMarkAhead', 'needClearAhead', 'parityEven', 'parityOdd'],
  // what happens to the cell you ARRIVE on
  enter: ['none', 'mark', 'unmark', 'toggle'],
  // what happens to the cell you LEAVE (trails!)
  leave: ['none', 'mark', 'wall'],
  // what a marked cell MEANS to movement
  markIs: ['inert', 'blocking', 'boost'],
  // how your heading evolves
  dirRule: ['keep', 'turnL', 'turnR', 'reflect'],
};
export const GENE_KEYS = Object.keys(GENES);

export function sampleLaw(rand) {
  const law = {};
  for (const k of GENE_KEYS) law[k] = rand.pick(GENES[k]);
  // mild coherence pressure (not a straitjacket): a law whose marks mean
  // nothing shouldn't bother writing them half the time
  if (law.markIs === 'inert' && law.guard !== 'needMarkAhead' && rand.float() < 0.5) {
    law.enter = 'none'; law.leave = law.leave === 'mark' ? 'none' : law.leave;
  }
  return law;
}
export function lawKey(law) { return GENE_KEYS.map((k) => law[k]).join('|'); }

// ---------- compile: genome -> step function ----------
// Engine state contract (see engine.js): { agent, dir, steps, marks(Uint8Array
// snapshot semantics via copy-on-write), walls(static)+dynWalls }.
// compile returns fn(world, state, d) -> newState | null. Total + deterministic.
export function compile(law) {
  const turn = law.dirRule === 'turnL' ? (d) => (d + 3) % 4
    : law.dirRule === 'turnR' ? (d) => (d + 1) % 4
    : null;

  return function step(world, s, d) {
    // guard on attempt
    if (law.guard === 'parityEven' && (s.steps % 2) !== 0) return null;
    if (law.guard === 'parityOdd' && (s.steps % 2) !== 1) return null;

    const blockedAt = (c) => world.walls[c] === 1 || s.dynWalls.has(c) ||
      (law.markIs === 'blocking' && s.marks.has(c));
    const inb = (c) => c >= 0;

    // one displacement attempt from cell `from` heading `dir`; returns target or -1
    const probe = (from, dir, dist) => {
      let cur = from;
      for (let k = 0; k < dist; k++) {
        const nx = world.stepCell(cur, dir);
        if (nx < 0) return -1;
        cur = nx;
      }
      return cur;
    };

    const ahead = probe(s.agent, d, 1);
    if (law.guard === 'needMarkAhead' && (ahead < 0 || !s.marks.has(ahead))) return null;
    if (law.guard === 'needClearAhead' && (ahead < 0 || s.marks.has(ahead))) return null;

    // resolve landing cell by motion kind
    let land = -1, dirOut = d;
    if (law.motion === 'step') {
      if (ahead >= 0 && !blockedAt(ahead)) land = ahead;
    } else if (law.motion === 'leap') {
      // hop over the adjacent cell (whatever it is) onto the one beyond;
      // fall back to a step if the far cell is unavailable
      const far = probe(s.agent, d, 2);
      if (far >= 0 && !blockedAt(far)) land = far;
      else if (ahead >= 0 && !blockedAt(ahead)) land = ahead;
    } else if (law.motion === 'slide') {
      let cur = s.agent, moved = false;
      let guardCount = 0;
      while (guardCount++ < 64) {
        const nx = world.stepCell(cur, d);
        if (nx < 0 || blockedAt(nx)) break;
        cur = nx; moved = true;
        if (law.markIs === 'boost' && s.marks.has(cur)) continue; // boost: keep sliding
        if (law.markIs !== 'boost') continue;                     // plain slide continues anyway
        break;                                                    // boost law: stop on non-boost cell
      }
      if (moved) land = cur;
    } else { // bounce: try ahead; if blocked, move one cell BACKWARD instead
      if (ahead >= 0 && !blockedAt(ahead)) land = ahead;
      else {
        const back = probe(s.agent, (d + 2) % 4, 1);
        if (back >= 0 && !blockedAt(back)) { land = back; dirOut = (d + 2) % 4; }
      }
    }
    if (land < 0 || land === s.agent) return null;

    // boost on landing (non-slide laws): one free extra cell
    if (law.markIs === 'boost' && law.motion !== 'slide' && s.marks.has(land)) {
      const extra = probe(land, dirOut, 1);
      if (extra >= 0 && !blockedAt(extra)) land = extra;
    }

    // build successor state (copy-on-write sets)
    const ns = {
      agent: land,
      dir: turn ? turn(dirOut) : (law.dirRule === 'reflect' ? dirOut : dirOut),
      steps: s.steps + 1,
      marks: s.marks, dynWalls: s.dynWalls, tokens: s.tokens,
      _mut: false,
    };
    const mutMarks = () => { if (!ns._mut) { ns.marks = new Set(ns.marks); ns._mut = true; } };

    // leave effect on the departed cell
    if (law.leave === 'mark') { mutMarks(); ns.marks.add(s.agent); }
    else if (law.leave === 'wall') { ns.dynWalls = new Set(ns.dynWalls); ns.dynWalls.add(s.agent); }

    // enter effect on the landing cell
    if (law.enter === 'mark') { mutMarks(); ns.marks.add(land); }
    else if (law.enter === 'unmark') { if (ns.marks.has(land)) { mutMarks(); ns.marks.delete(land); } }
    else if (law.enter === 'toggle') { mutMarks(); ns.marks.has(land) ? ns.marks.delete(land) : ns.marks.add(land); }

    // token pickup
    if (s.tokens.has(land)) { ns.tokens = new Set(s.tokens); ns.tokens.delete(land); }

    return ns;
  };
}

// ---------- describe: genome -> English ----------
const PHRASE = {
  motion: {
    step: 'you step one cell at a time',
    slide: 'you slide until something stops you',
    leap: 'you leap two cells, vaulting whatever lies between (or step, if the far cell is taken)',
    bounce: 'you step forward — but if the way is blocked, you rebound a cell backward instead',
  },
  guard: {
    none: '',
    needMarkAhead: 'a move is only legal when the cell ahead is inked',
    needClearAhead: 'a move is only legal when the cell ahead is clean',
    parityEven: 'you may only move on even beats — every other step, the world refuses you',
    parityOdd: 'you may only move on odd beats — every other step, the world refuses you',
  },
  enter: {
    none: '', mark: 'each cell you enter becomes inked', unmark: 'each cell you enter is wiped clean',
    toggle: 'each cell you enter flips — clean to inked, inked to clean',
  },
  leave: {
    none: '', mark: 'you ink every cell you leave', wall: 'every cell you leave hardens into wall behind you — there is no going back',
  },
  markIs: {
    inert: '', blocking: 'inked cells are solid — you cannot enter them',
    boost: 'inked cells are quick — they carry you an extra cell',
  },
  dirRule: {
    keep: '', turnL: 'after every move your heading turns left', turnR: 'after every move your heading turns right',
    reflect: '',
  },
};
export function describe(law) {
  const parts = [PHRASE.motion[law.motion]];
  for (const k of ['guard', 'leave', 'enter', 'markIs', 'dirRule']) {
    const p = PHRASE[k][law[k]];
    if (p) parts.push(p);
  }
  const s = parts.join('; ') + '.';
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// the hand-written laws of earlier wings, expressed in the DSL — the foundry's
// "known world". Novelty is measured AGAINST these (and the archive).
export const KNOWN_LAWS = [
  { name: 'walk (knack/morph)', law: { motion: 'step', guard: 'none', enter: 'none', leave: 'none', markIs: 'inert', dirRule: 'keep' } },
  { name: 'ice (knack frost)', law: { motion: 'slide', guard: 'none', enter: 'none', leave: 'none', markIs: 'inert', dirRule: 'keep' } },
  { name: 'leap (checkers-like)', law: { motion: 'leap', guard: 'none', enter: 'none', leave: 'none', markIs: 'inert', dirRule: 'keep' } },
  { name: 'paint (lights-like)', law: { motion: 'step', guard: 'none', enter: 'toggle', leave: 'none', markIs: 'inert', dirRule: 'keep' } },
];

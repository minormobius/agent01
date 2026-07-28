// fifty/lib/bracket.js — tournament bracket engine (concept 42).
//
// Pure and total: given entrants, a seeding mode and a set of recorded results,
// it produces the full bracket. No mutation, no hidden state — the UI hands it
// the same inputs every render and gets the same bracket back, which is what
// lets a whole tournament live in a URL.
//
// Byes are the part everyone gets wrong. A 6-entrant single-elimination bracket
// is 8 slots with 2 byes, and the byes must land on the top seeds and be spread
// across the bracket rather than clustered — otherwise seed 1 and seed 2 can
// meet in round two. The standard-seed ordering below handles both.

export const MODES = {
  random: 'Random draw',
  seeded: 'Seeded (1 plays last)',
  manual: 'Manual order',
};

export const OUTCOMES = {
  judge: { label: 'Judge decides', note: 'One named DID rules on every match.' },
  mutual: { label: 'Both players confirm', note: 'A result stands when winner and loser both sign it.' },
  vote: { label: 'Community vote', note: 'Members of the space vote; the match closes at a deadline.' },
};

/** Next power of two at or above n. */
export const bracketSize = (n) => (n <= 1 ? 1 : 2 ** Math.ceil(Math.log2(n)));

/**
 * Standard tournament seed order for a bracket of `size` slots: [1,8,5,4,3,6,7,2]
 * for size 8. Built by repeatedly mirroring, which is how real brackets are
 * drawn — it guarantees seed 1 and seed 2 can only meet in the final.
 */
export function seedOrder(size) {
  let order = [1];
  while (order.length < size) {
    const n = order.length * 2;
    const next = [];
    for (const s of order) { next.push(s, n + 1 - s); }
    order = next;
  }
  return order;
}

/**
 * Place entrants into `size` slots. Entrants are given in seed order (index 0
 * is the top seed); empty slots become byes (null).
 */
export function placeEntrants(entrants, size) {
  const order = seedOrder(size);
  return order.map((seed) => entrants[seed - 1] || null);
}

// An empty slot and an undecided slot look identical if you only track
// "is there a player here", and conflating them is how a bracket ends up
// advancing somebody through a round they have not played: seed 1 has a
// first-round bye, their round-two opponent has not been decided yet, so the
// slot is blank — and a naive check reads that blank as a second bye. EMPTY
// means "no entrant will ever arrive here"; null means "not decided yet".
const EMPTY = Symbol('empty');

/**
 * Build a single-elimination bracket.
 *
 * @param {object[]} entrants  [{ id, name, handle? }] already in draw order
 * @param {object}   results   { [matchId]: winnerId }
 * @returns {{ rounds: object[][], size: number, champion: object|null }}
 */
export function single(entrants, results = {}) {
  const size = bracketSize(entrants.length);
  const order = seedOrder(size);
  const rounds = [];

  // Round 0 is the only place a structural gap can originate.
  let current = order.map((seed) => entrants[seed - 1] || EMPTY);
  let roundIndex = 0;

  while (current.length > 1) {
    const matches = [];
    const carry = [];

    for (let i = 0; i < current.length; i += 2) {
      const id = `r${roundIndex}m${i / 2}`;
      const A = current[i];
      const B = current[i + 1];
      const aEmpty = A === EMPTY;
      const bEmpty = B === EMPTY;
      const a = A === EMPTY ? null : A;
      const b = B === EMPTY ? null : B;

      let outcome;          // a player, EMPTY, or null for undecided
      let bye = false;

      if (aEmpty && bEmpty) {
        outcome = EMPTY;                    // nothing feeds this slot at all
      } else if (a && bEmpty) {
        outcome = a; bye = true;            // a genuine walkover
      } else if (b && aEmpty) {
        outcome = b; bye = true;
      } else if (a && b) {
        outcome = [a, b].find((p) => p.id === results[id]) || null;
      } else {
        outcome = null;                     // at least one side is still pending
      }

      matches.push({
        id, round: roundIndex, a, b, bye,
        aEmpty, bEmpty,
        winner: outcome === EMPTY ? null : outcome,
        decided: !!outcome && outcome !== EMPTY,
      });
      carry.push(outcome);
    }

    rounds.push(matches);
    current = carry;
    roundIndex++;
  }

  const last = current[0];
  return {
    rounds, size,
    champion: last && last !== EMPTY ? last : null,
    kind: 'single',
  };
}

/**
 * Double elimination: the winners bracket, a losers bracket fed by it, and a
 * grand final. The losers bracket alternates between "minor" rounds (survivors
 * play each other) and "major" rounds (survivors play the freshly eliminated),
 * which is what keeps the two brackets in step.
 */
export function double(entrants, results = {}) {
  const w = single(entrants, results);
  const losersRounds = [];

  // Everyone who lost a real match in winners round r, in bracket order.
  const droppedIn = w.rounds.map((matches) =>
    matches
      .filter((m) => !m.bye && m.winner)
      .map((m) => (m.winner.id === (m.a && m.a.id) ? m.b : m.a))
      .filter(Boolean));

  let alive = [];
  let lr = 0;

  for (let r = 0; r < w.rounds.length; r++) {
    const incoming = droppedIn[r] || [];

    if (r === 0) {
      alive = incoming.slice();
    } else {
      // Major round: current survivors vs the newly dropped.
      const matches = [];
      const pool = alive.slice();
      const fresh = incoming.slice().reverse();   // cross the bracket so rematches are late
      const n = Math.max(pool.length, fresh.length);
      for (let i = 0; i < n; i++) {
        const a = pool[i] || null;
        const b = fresh[i] || null;
        if (!a && !b) continue;
        const id = `lr${lr}m${i}`;
        const bye = (a && !b) || (b && !a);
        const winner = bye ? (a || b) : ([a, b].find((p) => p && p.id === results[id]) || null);
        matches.push({ id, round: lr, a, b, bye, winner, decided: !!winner, bracket: 'losers' });
      }
      if (matches.length) { losersRounds.push(matches); alive = matches.map((m) => m.winner); lr++; }
    }

    // Minor round: halve the survivors amongst themselves.
    if (alive.filter(Boolean).length > 1 && r < w.rounds.length - 1) {
      const matches = [];
      for (let i = 0; i < alive.length; i += 2) {
        const a = alive[i] || null;
        const b = alive[i + 1] || null;
        if (!a && !b) continue;
        const id = `lr${lr}m${i / 2}`;
        const bye = (a && !b) || (b && !a);
        const winner = bye ? (a || b) : ([a, b].find((p) => p && p.id === results[id]) || null);
        matches.push({ id, round: lr, a, b, bye, winner, decided: !!winner, bracket: 'losers' });
      }
      losersRounds.push(matches);
      alive = matches.map((m) => m.winner);
      lr++;
    }
  }

  const losersChampion = alive.filter(Boolean).length === 1 ? alive.find(Boolean) : null;
  const grandId = 'gf';
  const gf = {
    id: grandId, round: 0, a: w.champion, b: losersChampion,
    bye: false,
    winner: [w.champion, losersChampion].find((p) => p && p.id === results[grandId]) || null,
    decided: !!results[grandId], bracket: 'final',
  };
  gf.decided = !!gf.winner;

  return {
    kind: 'double',
    size: w.size,
    rounds: w.rounds,
    losersRounds,
    grandFinal: gf,
    champion: gf.winner,
  };
}

export function build(entrants, { format = 'single', results = {} } = {}) {
  return format === 'double' ? double(entrants, results) : single(entrants, results);
}

/** Human name for a winners-bracket round given how many remain. */
export function roundName(roundIndex, totalRounds) {
  const fromEnd = totalRounds - roundIndex;
  if (fromEnd === 1) return 'Final';
  if (fromEnd === 2) return 'Semifinal';
  if (fromEnd === 3) return 'Quarterfinal';
  return `Round of ${2 ** fromEnd}`;
}

/** Order entrants for the draw. `random` only used for mode 'random'. */
export function order(entrants, mode, random) {
  if (mode === 'manual') return entrants.slice();
  if (mode === 'seeded') return entrants.slice();      // already in seed order
  const a = entrants.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const k = Math.floor(random() * (i + 1));
    [a[i], a[k]] = [a[k], a[i]];
  }
  return a;
}

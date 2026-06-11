// THE TRIBUNAL — the oracle family for adversarial, hidden-information games.
// BFS has no purchase here (there is no "the answer" when someone plays back),
// so certification changes shape: simulate many seeded games between policies
// of different strength and demand, with measured evidence:
//
//   TERMINATES — every probe game ends within the move cap.
//   SKILLFUL   — the greedy bot beats the random bot by a real margin: proof
//                the game's decisions matter (a coin-flip game fails here).
//   FAIR       — greedy-vs-greedy shows no crushing first-mover edge and a
//                tolerable draw rate.
//
// Interest is graded from the same evidence: skill depth, tension (lead
// changes across the score trajectory), agency (real choices per turn), and
// length in the goldilocks band. All sims are seeded ⇒ the certificate is
// reproducible on any machine.

import { Rand } from './prng.js';
import { init, legalMoves, apply, scoreline } from './engine.js';
import { randomPolicy, greedyPolicy } from './policies.js';

const MOVE_CAP = 400;

function clamp01(x) { return x < 0 ? 0 : x > 1 ? 1 : x; }
function goldilocks(x, ideal, w) { const d = (x - ideal) / w; return Math.exp(-d * d); }

// play one full game; polA moves as player 0, polB as player 1
export function playout(g, seed, polA, polB, collect = false) {
  let st = init(g, seed);
  const rand = new Rand('deal::playout::' + seed);
  let leadChanges = 0, lastLeader = 0, choiceSum = 0, choiceTurns = 0;
  while (!st.over && st.moves < MOVE_CAP) {
    const pol = st.turn === 0 ? polA : polB;
    const mvs = legalMoves(g, st);
    if (!mvs.length) break;
    if (collect) { choiceSum += mvs.length; choiceTurns++; }
    const mv = pol(g, st, rand);
    st = apply(g, st, mv);
    if (collect) {
      const [a, b] = scoreline(g, st);
      const lead = a === b ? lastLeader : (g.form === 'shed' ? (a < b ? 0 : 1) : (a > b ? 0 : 1));
      if (lead !== lastLeader) { leadChanges++; lastLeader = lead; }
    }
  }
  const capped = !st.over;
  return { winner: st.over ? st.winner : -1, moves: st.moves, capped, leadChanges, agency: choiceTurns ? choiceSum / choiceTurns : 1 };
}

export function certify(g, opts = {}) {
  const N = opts.games ?? 40;

  // gate 1+2: greedy vs random, both seats
  let gWins = 0, draws = 0, capped = 0, lenSum = 0;
  for (let k = 0; k < N; k++) {
    const seatA = k % 2 === 0; // alternate who sits first
    const r = playout(g, 'sr' + k, seatA ? greedyPolicy : randomPolicy, seatA ? randomPolicy : greedyPolicy);
    if (r.capped) capped++;
    lenSum += r.moves;
    if (r.winner === -1) draws++;
    else if ((seatA && r.winner === 0) || (!seatA && r.winner === 1)) gWins++;
  }
  const skill = gWins / N - 0.5;

  // gate 3: greedy vs greedy (fairness + tension)
  let p0Wins = 0, ggDraws = 0, tensionSum = 0, agencySum = 0, ggLen = 0;
  for (let k = 0; k < N; k++) {
    const r = playout(g, 'gg' + k, greedyPolicy, greedyPolicy, true);
    if (r.capped) capped++;
    ggLen += r.moves;
    if (r.winner === -1) ggDraws++;
    else if (r.winner === 0) p0Wins++;
    tensionSum += r.leadChanges;
    agencySum += r.agency;
  }
  const decided = N - ggDraws;
  const firstEdge = decided ? Math.abs(p0Wins / decided - 0.5) : 0.5;
  const drawRate = ggDraws / N;
  const avgLen = ggLen / N;
  const tension = tensionSum / N;
  const agency = agencySum / N;

  const gates = {
    terminates: capped === 0,
    skillful: skill >= 0.10,
    fair: firstEdge <= 0.22 && drawRate <= 0.35,
  };
  const certified = gates.terminates && gates.skillful && gates.fair;

  const signals = {
    skill: clamp01(skill / 0.4),
    tension: clamp01(tension / 6),
    agency: clamp01((agency - 1) / 3),
    pace: goldilocks(avgLen, g.form === 'trick' ? g.handSize * 2 : 34, g.form === 'trick' ? g.handSize : 22),
    balance: clamp01(1 - firstEdge / 0.25),
  };
  const interest = Math.round(clamp01(
    0.30 * signals.skill + 0.24 * signals.tension + 0.20 * signals.agency + 0.14 * signals.pace + 0.12 * signals.balance
  ) * 100);
  const difficulty = Math.round(clamp01(0.6 * signals.skill + 0.4 * signals.agency) * 100);
  const tiers = ['Gentle', 'Easy', 'Fair', 'Tricky', 'Hard', 'Sharp'];

  return {
    certified, gates,
    skill, firstEdge, drawRate, avgLen: Math.round(avgLen), tension: +tension.toFixed(1), agency: +agency.toFixed(1),
    interest, difficulty, diffTier: tiers[Math.min(5, Math.floor(difficulty / 17))],
    signals, games: N * 2,
  };
}

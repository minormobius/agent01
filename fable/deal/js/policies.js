// The simulated opponents. Two strengths:
//   randomPolicy — uniform over legal moves (the tribunal's baseline).
//   greedyPolicy — objective-aware heuristics: win tricks cheaply, duck poison,
//                  keep flexible hands, spend wilds late. Strong enough to make
//                  the skill gate meaningful, weak enough to be beatable.
// Both are deterministic given the seeded rand — the whole tribunal replays.

import { legalMoves, pointsOf } from './engine.js';

export function randomPolicy(g, st, rand) {
  const mvs = legalMoves(g, st);
  return mvs[rand.int(mvs.length)];
}

export function greedyPolicy(g, st, rand) {
  const mvs = legalMoves(g, st);
  if (mvs.length === 1) return mvs[0];
  const me = st.turn;
  const hand = st.hands[me];

  if (g.form === 'trick') {
    const isPoint = (c) => g.scoring !== 'tricks' && c.s === g.pointSuit;
    const val = (c) => c.r + (g.trump >= 0 && c.s === g.trump ? 100 : 0);
    if (st.led === null) {
      // leading: avoid-mode leads safest low; otherwise lead lowest non-point
      const sorted = mvs.slice().sort((a, b) => val(hand[a.i]) - val(hand[b.i]));
      if (g.scoring === 'avoid') return sorted[0];
      const nonPoint = sorted.filter((m) => !isPoint(hand[m.i]));
      return (nonPoint[0] || sorted[0]);
    }
    // answering
    const winners = mvs.filter((m) => beatsLed(g, hand[m.i], st.led));
    const losers = mvs.filter((m) => !beatsLed(g, hand[m.i], st.led));
    const cheapest = (list) => list.slice().sort((a, b) => val(hand[a.i]) - val(hand[b.i]))[0];
    const dearest = (list) => list.slice().sort((a, b) => val(hand[b.i]) - val(hand[a.i]))[0];
    const trickPts = pointsOf(g, st.led ? [st.led] : []);
    if (g.scoring === 'avoid') {
      // duck if possible, dumping the most poisonous loser; else win as cheap as possible
      if (losers.length) {
        const poison = losers.slice().sort((a, b) => pointsOf(g, [hand[b.i]]) - pointsOf(g, [hand[a.i]]) || val(hand[b.i]) - val(hand[a.i]))[0];
        return poison;
      }
      return cheapest(winners);
    }
    if (g.scoring === 'points') {
      // take valuable tricks; let worthless ones go while shedding junk
      if (trickPts > 0 && winners.length) return cheapest(winners);
      if (winners.length && rand.float() < 0.6) return cheapest(winners);
      return losers.length ? cheapest(losers) : cheapest(winners);
    }
    // tricks mode: win cheap when you can, dump lowest when you can't
    return winners.length ? cheapest(winners) : cheapest(losers);
  }

  // shed: prefer playing; keep the hand flexible; hold wilds; use skips when ahead
  const plays = mvs.filter((m) => m.type === 'play');
  if (!plays.length) return mvs[0];
  const flex = (cardIdx) => {
    const c = hand[cardIdx];
    let f = 0;
    for (let j = 0; j < hand.length; j++) {
      if (j === cardIdx) continue;
      if (hand[j].s === c.s || hand[j].r === c.r) f++;
    }
    return f;
  };
  const isWild = (c) => g.wildRank > 0 && c.r === g.wildRank;
  const isSkip = (c) => g.skipRank > 0 && c.r === g.skipRank;
  const myLead = st.hands[1 - me].length - hand.length;   // >0 = I'm ahead
  const scored = plays.map((m) => {
    const c = hand[m.i];
    let s = -flex(m.i);                       // shed the least-connected card
    if (isWild(c)) s -= 5;                    // hold wilds
    if (isSkip(c)) s += myLead >= 0 ? 4 : -2; // chain skips when ahead
    return { m, s };
  }).sort((a, b) => b.s - a.s);
  return scored[0].m;
}

function beatsLed(g, answer, led) {
  if (g.trump >= 0) {
    if (answer.s === g.trump && led.s !== g.trump) return true;
    if (led.s === g.trump && answer.s !== g.trump) return false;
  }
  if (answer.s !== led.s) return false;
  return answer.r > led.r;
}

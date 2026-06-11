// The card engine — a PURE REDUCER. init(genome, seed) → state;
// legalMoves(g, state) → move list; apply(g, state, move) → new state;
// no mutation, no randomness outside init's seeded shuffle. That purity is
// the multiplayer contract: a Durable Object room (games/RoomCoordinator,
// the hoop/ar/mmo transport family) can replicate this reducer verbatim —
// the bot opponent and a remote human are interchangeable move sources.
//
// Two players: 0 = human (or bot A), 1 = bot (or bot B).

import { Rand } from './prng.js';

export function buildDeck(g) {
  const deck = [];
  for (let s = 0; s < g.suits; s++) for (let r = 1; r <= g.ranks; r++) deck.push({ s, r });
  return deck;
}

export function init(g, seed) {
  const rand = new Rand('deal::' + seed);
  const deck = rand.shuffle(buildDeck(g));
  const hands = [deck.slice(0, g.handSize), deck.slice(g.handSize, g.handSize * 2)];
  let stock = deck.slice(g.handSize * 2);
  const st = {
    hands, turn: 0, moves: 0, over: false, winner: -1, log: [],
  };
  if (g.form === 'trick') {
    st.led = null;              // card led this trick (null = leading)
    st.leader = 0;
    st.taken = [[], []];        // captured cards per player
    st.tricks = [0, 0];
  } else {
    st.discard = [stock[0]];    // flip one to start
    stock = stock.slice(1);
    st.stock = stock;
    st.refills = 0;
    st.extraTurn = false;
  }
  if (g.form === 'trick') st.stock = stock; // unused but kept for shape parity
  return st;
}

const cardEq = (a, b) => a.s === b.s && a.r === b.r;

// ---- legality ----
export function legalMoves(g, st) {
  if (st.over) return [];
  const hand = st.hands[st.turn];
  if (g.form === 'trick') {
    if (st.led === null) return hand.map((c, i) => ({ type: 'play', i }));
    if (g.follow) {
      const suited = hand.map((c, i) => ({ c, i })).filter((x) => x.c.s === st.led.s);
      if (suited.length) return suited.map((x) => ({ type: 'play', i: x.i }));
    }
    return hand.map((c, i) => ({ type: 'play', i }));
  }
  // shed
  const top = st.discard[st.discard.length - 1];
  const ok = (c) => {
    if (g.wildRank > 0 && c.r === g.wildRank) return true;
    if (g.match === 'suit') return c.s === top.s;
    if (g.match === 'geRank') return c.r >= top.r;
    return c.s === top.s || c.r === top.r;
  };
  const plays = hand.map((c, i) => ({ c, i })).filter((x) => ok(x.c)).map((x) => ({ type: 'play', i: x.i }));
  if (plays.length) return plays;
  return [{ type: 'draw' }];
}

// ---- transition ----
export function apply(g, st, mv) {
  const ns = {
    ...st,
    hands: [st.hands[0].slice(), st.hands[1].slice()],
    log: st.log.slice(-8),
    moves: st.moves + 1,
  };
  if (g.form === 'trick') { ns.taken = [st.taken[0].slice(), st.taken[1].slice()]; ns.tricks = st.tricks.slice(); }
  else ns.stock = st.stock.slice();
  if (g.form === 'shed') ns.discard = st.discard.slice();

  const me = ns.turn, them = 1 - me;

  if (g.form === 'trick') {
    const card = ns.hands[me].splice(mv.i, 1)[0];
    if (ns.led === null) {
      ns.led = card; ns.leader = me; ns.turn = them;
      ns.log.push(`P${me} leads ${fmt(card)}`);
    } else {
      // resolve trick
      const ledCard = ns.led, ans = card;
      const win = beats(g, ans, ledCard) ? me : ns.leader;
      ns.taken[win].push(ledCard, ans);
      ns.tricks[win]++;
      ns.log.push(`P${me} answers ${fmt(ans)} — P${win} takes the trick`);
      ns.led = null; ns.leader = win; ns.turn = win;
      if (ns.hands[0].length === 0 && ns.hands[1].length === 0) {
        ns.over = true;
        ns.winner = trickWinner(g, ns);
      }
    }
    return ns;
  }

  // shed
  if (mv.type === 'draw') {
    if (ns.stock.length === 0) {
      // refill from discard (keep top); second dry stock ends the game
      ns.refills = st.refills + 1;
      if (ns.refills >= 2 || st.discard.length <= 1) {
        ns.over = true;
        ns.winner = ns.hands[0].length === ns.hands[1].length ? -1 : (ns.hands[0].length < ns.hands[1].length ? 0 : 1);
        return ns;
      }
      const top = ns.discard[ns.discard.length - 1];
      const rest = ns.discard.slice(0, -1);
      const rand = new Rand('deal::refill::' + ns.moves);
      ns.stock = rand.shuffle(rest);
      ns.discard = [top];
    }
    for (let k = 0; k < g.drawLimit && ns.stock.length; k++) ns.hands[me].push(ns.stock.pop());
    ns.log.push(`P${me} draws`);
    ns.turn = them;
    return ns;
  }
  const card = ns.hands[me].splice(mv.i, 1)[0];
  ns.discard.push(card);
  ns.log.push(`P${me} plays ${fmt(card)}`);
  if (ns.hands[me].length === 0) { ns.over = true; ns.winner = me; return ns; }
  ns.turn = (g.skipRank > 0 && card.r === g.skipRank) ? me : them;
  if (ns.turn === me) ns.log.push(`P${me} goes again`);
  return ns;
}

function beats(g, answer, led) {
  if (g.trump >= 0) {
    if (answer.s === g.trump && led.s !== g.trump) return true;
    if (led.s === g.trump && answer.s !== g.trump) return false;
  }
  if (answer.s !== led.s) return false;   // off-suit (non-trump) never beats
  return answer.r > led.r;
}

export function pointsOf(g, cards) {
  if (g.scoring === 'tricks') return 0;
  return cards.filter((c) => c.s === g.pointSuit).reduce((s, c) => s + c.r, 0);
}
function trickWinner(g, st) {
  if (g.scoring === 'tricks') {
    return st.tricks[0] === st.tricks[1] ? -1 : (st.tricks[0] > st.tricks[1] ? 0 : 1);
  }
  const p0 = pointsOf(g, st.taken[0]), p1 = pointsOf(g, st.taken[1]);
  if (p0 === p1) return -1;
  const moreIsBetter = g.scoring === 'points';
  return (p0 > p1) === moreIsBetter ? 0 : 1;
}

// live score line for the UI / tension metric
export function scoreline(g, st) {
  if (g.form === 'shed') return [st.hands[0].length, st.hands[1].length, 'cards left'];
  if (g.scoring === 'tricks') return [st.tricks[0], st.tricks[1], 'tricks'];
  return [pointsOf(g, st.taken[0]), pointsOf(g, st.taken[1]), 'points'];
}

export function fmt(c) { return ['♠', '♥', '♦', '♣'][c.s] + c.r; }

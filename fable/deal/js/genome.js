// The card-game GENOME — the grammar of a two-player card game, sampled the
// morph way. Two structural forms (trick-taking, shedding) × a sampled deck,
// legality rule, scoring direction, trump, and special ranks gives a space
// where Hearts-like, Crazy-Eights-like, and games with no family name all
// fall out of the same sampler. describe() writes the rulebook from the
// genome — the rules card writes itself, as everywhere in fable.

export function sampleGenome(rand) {
  const form = rand.weighted([{ v: 'trick', w: 5 }, { v: 'shed', w: 5 }]);
  const suits = rand.range(3, 4);
  const ranks = rand.range(6, 9);              // ranks 1..R per suit
  const g = { form, suits, ranks };

  if (form === 'trick') {
    g.handSize = rand.range(6, Math.min(10, Math.floor((suits * ranks) / 2)));
    g.follow = rand.float() < 0.7;             // must follow led suit if able
    g.trump = rand.float() < 0.45 ? rand.int(suits) : -1;
    g.scoring = rand.weighted([
      { v: 'tricks', w: 4 },                   // most tricks wins
      { v: 'points', w: 3 },                   // capture point cards (highest rank = 1pt each suit)
      { v: 'avoid', w: 3 },                    // fewest point cards wins (hearts-like)
    ]);
    if (g.scoring !== 'tricks') g.pointSuit = rand.int(suits); // that suit's cards carry points = their rank
  } else {
    g.handSize = rand.range(5, 7);
    g.match = rand.weighted([
      { v: 'suitOrRank', w: 5 },               // crazy-eights family
      { v: 'suit', w: 2 },
      { v: 'geRank', w: 3 },                   // must play >= top rank (climbing)
    ]);
    g.wildRank = rand.float() < 0.5 ? ranks : -1;        // top rank is wild
    g.skipRank = rand.float() < 0.4 ? rand.range(2, ranks - 1) : -1; // playing it = extra turn
    g.drawLimit = rand.range(1, 2);            // cards drawn when stuck
  }
  g.name = nameOf(g, rand);
  return g;
}

export function genomeKey(g) {
  return [g.form, g.suits, g.ranks, g.handSize, g.follow ? 'F' : '', g.trump ?? '', g.scoring ?? '', g.pointSuit ?? '', g.match ?? '', g.wildRank ?? '', g.skipRank ?? '', g.drawLimit ?? ''].join('|');
}

export const SUIT_GLYPHS = ['♠', '♥', '♦', '♣'];
export const SUIT_NAMES = ['spades', 'hearts', 'diamonds', 'clubs'];

const TRICK_ADJ = ['Quiet', 'Long', 'Bitter', 'Gilded', 'Crooked', 'Patient', 'Velvet', 'Iron'];
const TRICK_NOUN = ['Trick', 'Court', 'Gambit', 'Round', 'Suit', 'March'];
const SHED_ADJ = ['Racing', 'Burning', 'Slippery', 'Hasty', 'Feverish', 'Light', 'Thieving', 'Loose'];
const SHED_NOUN = ['Shed', 'River', 'Scatter', 'Relay', 'Pile', 'Cascade'];
function nameOf(g, rand) {
  return g.form === 'trick'
    ? `the ${rand.pick(TRICK_ADJ)} ${rand.pick(TRICK_NOUN)}`
    : `the ${rand.pick(SHED_ADJ)} ${rand.pick(SHED_NOUN)}`;
}

export function describe(g) {
  const deck = `The deck: ${g.suits} suits (${SUIT_GLYPHS.slice(0, g.suits).join(' ')}) of ranks 1–${g.ranks}. Each player is dealt ${g.handSize}.`;
  if (g.form === 'trick') {
    const parts = [deck,
      'Play proceeds in tricks: the leader plays a card, the other answers, and the higher card takes the trick' + (g.trump >= 0 ? ` — but ${SUIT_GLYPHS[g.trump]} is trump and beats everything outside its suit` : '') + '. The trick winner leads next.'];
    parts.push(g.follow ? 'You must follow the led suit if you can.' : 'You may answer with any card.');
    if (g.scoring === 'tricks') parts.push('When the hands are empty, whoever took more tricks wins.');
    else if (g.scoring === 'points') parts.push(`Every ${SUIT_GLYPHS[g.pointSuit]} card is worth its rank in points — whoever CAPTURES more points in tricks wins.`);
    else parts.push(`Every ${SUIT_GLYPHS[g.pointSuit]} card is poison, worth its rank in points — whoever captures FEWER points wins.`);
    return parts.join(' ');
  }
  const matchTxt = { suitOrRank: 'matches the top card by suit or rank', suit: 'matches the top card by suit', geRank: 'is at least the top card’s rank' }[g.match];
  const parts = [deck,
    `Take turns onto one discard pile: you may play any card that ${matchTxt}; otherwise draw ${g.drawLimit} and pass.`];
  if (g.wildRank > 0) parts.push(`Rank ${g.wildRank} is wild — it plays on anything.`);
  if (g.skipRank > 0) parts.push(`Rank ${g.skipRank} is quick — playing it grants you another turn.`);
  parts.push('First to empty their hand wins; if the stock runs dry twice, the smaller hand wins.');
  return parts.join(' ');
}

// fifty/lib/iching.js — the complete I Ching, as a pure function.
//
// Concept 25 asks for a real oracle, and an oracle that fakes its own
// mechanism is not one. So this implements the actual yarrow-stalk
// probabilities (not the three-coin approximation, which gets the moving-line
// distribution wrong), the King Wen lookup for all 64 hexagrams, and the
// transformation to the relating hexagram.
//
// Everything is seeded. Two people with the same seed get the same reading,
// which is what makes a reading shareable as a link instead of a screenshot.

// ─────────────────────────────────────────────────────── trigrams ──

// Bits are bottom-to-top: index 0 is the bottom line. 1 = yang.
export const TRIGRAMS = [
  { bits: [1, 1, 1], name: 'Qián',  glyph: '☰', element: 'Heaven',   attr: 'the creative, strong' },
  { bits: [1, 0, 0], name: 'Zhèn',  glyph: '☳', element: 'Thunder',  attr: 'arousing, movement' },
  { bits: [0, 1, 0], name: 'Kǎn',   glyph: '☵', element: 'Water',    attr: 'abysmal, danger' },
  { bits: [0, 0, 1], name: 'Gèn',   glyph: '☶', element: 'Mountain', attr: 'keeping still' },
  { bits: [0, 0, 0], name: 'Kūn',   glyph: '☷', element: 'Earth',    attr: 'receptive, yielding' },
  { bits: [0, 1, 1], name: 'Xùn',   glyph: '☴', element: 'Wind',     attr: 'gentle, penetrating' },
  { bits: [1, 0, 1], name: 'Lí',    glyph: '☲', element: 'Fire',     attr: 'clinging, light' },
  { bits: [1, 1, 0], name: 'Duì',   glyph: '☱', element: 'Lake',     attr: 'joyous, open' },
];

// King Wen number by [lower trigram][upper trigram], in the TRIGRAMS order above.
const KING_WEN = [
  [ 1, 34,  5, 26, 11,  9, 14, 43],
  [25, 51,  3, 27, 24, 42, 21, 17],
  [ 6, 40, 29,  4,  7, 59, 64, 47],
  [33, 62, 39, 52, 15, 53, 56, 31],
  [12, 16,  8, 23,  2, 20, 35, 45],
  [44, 32, 48, 18, 46, 57, 50, 28],
  [13, 55, 63, 22, 36, 37, 30, 49],
  [10, 54, 60, 41, 19, 61, 38, 58],
];

function trigramIndex(bits) {
  return TRIGRAMS.findIndex((t) => t.bits[0] === bits[0] && t.bits[1] === bits[1] && t.bits[2] === bits[2]);
}

/** Six bottom-to-top lines (1 = yang) → King Wen number 1–64. */
export function kingWen(lines) {
  const lower = trigramIndex(lines.slice(0, 3));
  const upper = trigramIndex(lines.slice(3, 6));
  if (lower < 0 || upper < 0) throw new Error('bad lines');
  return KING_WEN[lower][upper];
}

// ────────────────────────────────────────────────────── hexagrams ──

// name, Chinese, and a one-line judgment. The judgments are our own plain
// renderings — short enough to read on a phone, close enough to be useful.
export const HEXAGRAMS = [
  null,
  ['The Creative', '乾', 'Sustained initiative. The energy is yours; the question is whether you can keep it up without forcing.'],
  ['The Receptive', '坤', 'Yield and carry. Leading here means going second on purpose.'],
  ['Difficulty at the Beginning', '屯', 'Everything is tangled because it is new. Sort one thread, not all of them.'],
  ['Youthful Folly', '蒙', 'You do not know yet, and pretending otherwise is the actual danger. Ask once, sincerely.'],
  ['Waiting', '需', 'The conditions are not ready and you cannot hurry them. Wait well-fed and unworried.'],
  ['Conflict', '訟', 'You may be right. Winning this will still cost more than it returns.'],
  ['The Army', '師', 'Organised force, under discipline, with a cause people believe. Any of those missing and it is a mob.'],
  ['Holding Together', '比', 'Join early or not at all. Latecomers to an alliance get the worst seat.'],
  ['Taming Power of the Small', '小畜', 'Small restraint on a large force. Enough to steer, not enough to stop.'],
  ['Treading', '履', 'You are walking somewhere dangerous. Courtesy is not weakness here, it is footing.'],
  ['Peace', '泰', 'Things are flowing. Peace is the moment to build the thing you will need when it ends.'],
  ['Standstill', '否', 'The channel is blocked and pushing widens the block. Withdraw and keep your integrity intact.'],
  ['Fellowship', '同人', 'Common cause with people unlike you. Keep it in the open; secret alliances curdle.'],
  ['Great Possession', '大有', 'You have more than you need. What you do with the surplus is the whole test.'],
  ['Modesty', '謙', 'The one virtue that works in every position. It costs nothing and compounds.'],
  ['Enthusiasm', '豫', 'Momentum that others will join. Point it before you release it.'],
  ['Following', '隨', 'Adapt to what is actually happening. Following is not surrender if you chose what to follow.'],
  ['Work on the Spoiled', '蠱', 'Something rotted through neglect, probably not yours. Repair takes longer than the rot did.'],
  ['Approach', '臨', 'A good period is arriving. It has a season; use it before the eighth month.'],
  ['Contemplation', '觀', 'Be seen, and watch. Your example is doing more work than your instructions.'],
  ['Biting Through', '噬嗑', 'An obstruction that must be bitten clean through. Half-measures leave gristle.'],
  ['Grace', '賁', 'Form matters, but form alone is decoration. Make it beautiful after it is true.'],
  ['Splitting Apart', '剝', 'It is coming apart from below. Do not prop it; prepare for after.'],
  ['Return', '復', 'The turning point. Small, easy to miss, and everything follows from noticing it.'],
  ['Innocence', '無妄', 'Act without calculation and it goes well. Calculate and it goes badly.'],
  ['Taming Power of the Great', '大畜', 'Great force held in reserve, daily. Accumulation is the work.'],
  ['Nourishment', '頤', 'Watch what you take in and what you say. Both are the same discipline.'],
  ['Preponderance of the Great', '大過', 'The load exceeds the beam. Extraordinary times, but the beam is still the beam.'],
  ['The Abysmal', '坎', 'Danger repeating. Move like water: keep going, take the shape of the channel.'],
  ['The Clinging', '離', 'Light depends on what it burns. Attachment is the fuel and the limit.'],
  ['Influence', '咸', 'Mutual attraction, felt before it is understood. Do not force the reading of it.'],
  ['Duration', '恆', 'Not stasis — a stable way of continuing. Change the content, keep the form.'],
  ['Retreat', '遯', 'Withdrawing in good order, early, is strength. Withdrawing late is a rout.'],
  ['Power of the Great', '大壯', 'Strength arrived. Strength without a rule to obey turns into damage.'],
  ['Progress', '晉', 'Rising and visible. Advance in daylight and let the credit be shared.'],
  ['Darkening of the Light', '明夷', 'A bad time in which brightness is punished. Keep the flame, hide the lamp.'],
  ['The Family', '家人', 'Everything scales from the smallest unit. Get the roles right at home first.'],
  ['Opposition', '睽', 'Two things that will not merge. Small joint work is possible; unity is not.'],
  ['Obstruction', '蹇', 'The way ahead is blocked. Turn inward and fix the thing you can reach.'],
  ['Deliverance', '解', 'The tension breaks. Return to normal quickly and do not relitigate.'],
  ['Decrease', '損', 'Give something up on purpose. Chosen loss is not the same as being robbed.'],
  ['Increase', '益', 'A window of gain. It closes; spend it on something that lasts.'],
  ['Break-through', '夬', 'The wrong thing must be named publicly. Do it without malice or it rebounds.'],
  ['Coming to Meet', '姤', 'Something small has arrived that will not stay small. Meet it now.'],
  ['Gathering Together', '萃', 'People are assembling. Assembly needs a centre or it becomes a crowd.'],
  ['Pushing Upward', '升', 'Growth by effort, steady and unspectacular. Push; it yields.'],
  ['Oppression', '困', 'Exhausted and constrained. Say less, mean it more; words are cheap here.'],
  ['The Well', '井', 'The source does not move and does not run out. Maintain it or the town leaves.'],
  ['Revolution', '革', 'The old form has to go. Timing is everything: too early is a coup, too late is a collapse.'],
  ['The Cauldron', '鼎', 'Transformation with a purpose. Something raw is being made into something nourishing.'],
  ['The Arousing', '震', 'Shock, then shock again. Fear that ends in laughter has done its job.'],
  ['Keeping Still', '艮', 'Stop. Not resistance — the stillness of a mountain, which has nothing to prove.'],
  ['Development', '漸', 'Gradual, correct progress. Skipping a stage means doing it again later.'],
  ['The Marrying Maiden', '歸妹', 'Entering on unfavourable terms. Know the position you are actually taking.'],
  ['Abundance', '豐', 'Peak brightness, and the sun at noon begins to set. Act while it is still bright.'],
  ['The Wanderer', '旅', 'A stranger in someone else\'s place. Modest, careful, and never at home.'],
  ['The Gentle', '巽', 'Penetrating influence, repeated and small. Wind gets everywhere eventually.'],
  ['The Joyous', '兌', 'Openness that invites exchange. Real joy is shared or it is just relief.'],
  ['Dispersion', '渙', 'What has hardened must be dissolved. Break up the block, not the people.'],
  ['Limitation', '節', 'Boundaries make things possible. Limits that are too tight fail too.'],
  ['Inner Truth', '中孚', 'Sincerity that reaches even the difficult. It works because it is not a technique.'],
  ['Preponderance of the Small', '小過', 'A time for small things done exactly. The large gesture will miss.'],
  ['After Completion', '既濟', 'It is done, and that is the most dangerous moment. Order decays without attention.'],
  ['Before Completion', '未濟', 'Almost. The last stretch is where care matters most; the fox wets its tail at the far bank.'],
];

// ────────────────────────────────────────────────────────── cast ──

// Yarrow-stalk probabilities, which are famously asymmetric:
//   6 old yin   1/16    9 old yang  3/16
//   7 young yang 5/16   8 young yin 7/16
// The three-coin method gives 2/8, 2/8, 3/8, 3/8 instead. Getting this right
// changes how often a reading has moving lines, which is the interesting part.
const YARROW = [
  { value: 6, p: 1 / 16 },
  { value: 7, p: 5 / 16 },
  { value: 8, p: 7 / 16 },
  { value: 9, p: 3 / 16 },
];

export function castLine(random) {
  let r = random();
  for (const { value, p } of YARROW) {
    if (r < p) return value;
    r -= p;
  }
  return 8;
}

/**
 * Cast a full reading from a seeded RNG.
 * Returns the primary hexagram, the moving lines, and — if any line moves —
 * the relating hexagram the reading transforms into.
 */
export function cast(random) {
  const values = Array.from({ length: 6 }, () => castLine(random));
  const lines = values.map((v) => (v === 7 || v === 9 ? 1 : 0));
  const moving = values.map((v, i) => (v === 6 || v === 9 ? i : -1)).filter((i) => i >= 0);

  const primary = hexagram(kingWen(lines));
  let relating = null;
  if (moving.length) {
    const changed = lines.slice();
    for (const i of moving) changed[i] = changed[i] ? 0 : 1;
    relating = hexagram(kingWen(changed));
  }
  return { values, lines, moving, primary, relating };
}

export function hexagram(n) {
  const h = HEXAGRAMS[n];
  if (!h) throw new Error(`no hexagram ${n}`);
  return { n, name: h[0], chinese: h[1], judgment: h[2], glyph: unicodeHexagram(n) };
}

/** U+4DC0–U+4DFF are the 64 hexagram symbols, in King Wen order. */
export function unicodeHexagram(n) {
  return String.fromCodePoint(0x4dbf + n);
}

// ──────────────────────────────────────────────────────── tarot ──

export const MAJORS = [
  'The Fool', 'The Magician', 'The High Priestess', 'The Empress', 'The Emperor',
  'The Hierophant', 'The Lovers', 'The Chariot', 'Strength', 'The Hermit',
  'Wheel of Fortune', 'Justice', 'The Hanged Man', 'Death', 'Temperance',
  'The Devil', 'The Tower', 'The Star', 'The Moon', 'The Sun',
  'Judgement', 'The World',
];

const SUITS = [
  { name: 'Wands', of: 'making, drive, the thing you actually want to do' },
  { name: 'Cups', of: 'feeling, attachment, what you are carrying for others' },
  { name: 'Swords', of: 'thought, conflict, the argument you keep having' },
  { name: 'Pentacles', of: 'material, work, what it costs and what it pays' },
];
const RANKS = ['Ace', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten',
               'Page', 'Knight', 'Queen', 'King'];

/** The full 78-card deck, in order. */
export function deck() {
  const cards = MAJORS.map((name, i) => ({ id: `major-${i}`, name, arcana: 'major', number: i }));
  for (const suit of SUITS) {
    for (const [i, rank] of RANKS.entries()) {
      cards.push({
        id: `${suit.name.toLowerCase()}-${i + 1}`,
        name: `${rank} of ${suit.name}`,
        arcana: 'minor', suit: suit.name, suitOf: suit.of, number: i + 1,
      });
    }
  }
  return cards;
}

export const SPREADS = {
  one: { label: 'Single card', positions: ['The answer'] },
  three: { label: 'Past / present / future', positions: ['What led here', 'Where you are', 'Where it goes'] },
  cross: {
    label: 'Five-card cross',
    positions: ['The situation', 'What crosses it', 'Beneath — what you have not said',
                'Behind — what is passing', 'Before — what is arriving'],
  },
  horseshoe: {
    label: 'Seven-card horseshoe',
    positions: ['The past', 'The present', 'Hidden influences', 'The obstacle',
                'The people around it', 'What you should do', 'The likely outcome'],
  },
};

/** Deal a spread from a seeded RNG. Reversals included, deterministically. */
export function draw(random, spreadKey = 'three') {
  const spread = SPREADS[spreadKey] || SPREADS.three;
  const cards = deck();
  for (let i = cards.length - 1; i > 0; i--) {
    const k = Math.floor(random() * (i + 1));
    [cards[i], cards[k]] = [cards[k], cards[i]];
  }
  return spread.positions.map((position, i) => ({
    position,
    card: cards[i],
    reversed: random() < 0.28,
  }));
}

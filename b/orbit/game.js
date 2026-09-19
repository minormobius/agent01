// orbit/game.js — the game, with no DOM and no network in it.
//
// Everything here is pure and deterministic given an rng, which is the whole
// point: a hand of cards is the thing most likely to be quietly unfair, and an
// unfair hand is invisible from the outside. Gated by orbit.selftest.mjs.

// ── deterministic rng (the lathe's, so seeds mean the same thing here) ───────

export function xmur3(str) {
  let h = 1779033703 ^ String(str).length;
  for (let i = 0; i < String(str).length; i++) {
    h = Math.imul(h ^ String(str).charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return (h ^= h >>> 16) >>> 0;
  };
}

export function mulberry32(a) {
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A named seed → an rng. Same seed, same hand, forever. */
export const rngFor = (seed) => mulberry32(xmur3(seed)());

// ── what makes a card ────────────────────────────────────────────────────────

/**
 * A card has to be guessable. Under five words it is "lol" or "same" and the
 * answer is a coin toss dressed as a question, so those never get dealt — the
 * pool still holds them, because the floor belongs to the game and not to the
 * fetch.
 */
export const MIN_WORDS = 5;

/** The bias exponent on word count. 1 is proportional; higher is greedier. */
export const WORD_BIAS = 1.6;

/** Words, roughly — whitespace runs, with bare URLs not counted as words. */
export function wordCount(text) {
  const t = String(text || '')
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/[‘’]/g, "'")
    .trim();
  if (!t) return 0;
  return t.split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length;
}

/**
 * How much a card wants to be drawn. Wordier is better — a long post carries
 * voice and a short one carries almost none — but the exponent saturates at 60
 * words so a single 300-character wall does not eat the whole deck.
 */
export function cardWeight(card) {
  const w = card.words != null ? card.words : wordCount(card.text);
  if (w < MIN_WORDS) return 0;
  return Math.pow(Math.min(w, 60), WORD_BIAS);
}

/** Annotate a raw API card with the fields the draw needs. */
export function prepare(cards) {
  return (cards || []).map((c) => ({ ...c, words: wordCount(c.text) }))
    .filter((c) => c.uri && c.did && c.words > 0);
}

/** One weighted pick out of `items`, removed in place. */
export function drawWeighted(items, rng) {
  let total = 0;
  for (const it of items) total += it._w;
  if (total <= 0) return null;
  let r = rng() * total;
  for (let i = 0; i < items.length; i++) {
    r -= items[i]._w;
    if (r <= 0) return items.splice(i, 1)[0];
  }
  return items.pop();
}

/** Fisher–Yates, with the rng passed in so a shuffle is reproducible. */
export function shuffle(arr, rng) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Deal a hand.
 *
 * THE FAIRNESS RULE, and it is the reason this is a module and not ten lines in
 * app.js: the hand is dealt ROUND-ROBIN across authors, not sampled from one
 * big pile. Pooled sampling looks right and is not — one member of a twelve-
 * seat ring who posts forty times a day would supply a third of the cards, and
 * the player would learn to guess them rather than learn the circle. Round-robin
 * means the hand is as even as the pool allows, and the per-author weighting
 * (wordier posts first) happens strictly inside one author's own stack.
 *
 * `used` carries every uri already dealt, so "draw more" never repeats a card.
 * Authors with nothing eligible are reported in `absent` rather than silently
 * dropped: a ring seat that can never be the answer is a seat the player must
 * be told about, or the game is lying to them.
 */
export function dealHand(pool, { count = 20, rng = Math.random, used = new Set(), dids = null } = {}) {
  const byAuthor = new Map();
  for (const did of (dids || [])) byAuthor.set(did, []);
  for (const c of pool) {
    if (used.has(c.uri)) continue;
    const w = cardWeight(c);
    if (w <= 0) continue;
    if (dids && !byAuthor.has(c.did)) continue;
    if (!byAuthor.has(c.did)) byAuthor.set(c.did, []);
    byAuthor.get(c.did).push({ ...c, _w: w });
  }

  const absent = [...byAuthor].filter(([, v]) => v.length === 0).map(([k]) => k);
  const live = shuffle([...byAuthor.keys()].filter((k) => byAuthor.get(k).length > 0), rng);

  const hand = [];
  let round = 0;
  while (hand.length < count && live.length) {
    let dealtThisRound = 0;
    for (const did of live) {
      if (hand.length >= count) break;
      const stack = byAuthor.get(did);
      if (!stack.length) continue;
      const card = drawWeighted(stack, rng);
      if (!card) continue;
      const { _w, ...clean } = card;
      hand.push(clean);
      dealtThisRound++;
    }
    if (!dealtThisRound) break;       // every stack is empty — the pool is spent
    round++;
  }

  return { hand: shuffle(hand, rng), absent, exhausted: hand.length < count, rounds: round };
}

// ── scoring ──────────────────────────────────────────────────────────────────

/**
 * A raw percentage is not a score in this game, because the difficulty is set
 * by the size of the ring: 50% against four accounts is bad and 50% against
 * twenty is remarkable. `lift` is the share of the distance from blind guessing
 * to perfect that the player actually covered, and it is what the grade reads.
 */
export function scoreHand(answers, ringSize) {
  const total = answers.length;
  const correct = answers.filter((a) => a.correct).length;
  const pct = total ? correct / total : 0;
  const chance = ringSize > 0 ? 1 / ringSize : 0;
  const lift = (chance >= 1 || total === 0) ? 0 : Math.max(0, (pct - chance) / (1 - chance));
  return { correct, total, pct, chance, lift };
}

/** Seven bands, widest in the middle. Editorial — rename them freely. */
export const BANDS = [
  { min: 0.90, grade: 'A+', label: 'you are the circle', blurb: 'You read these people the way you read your own handwriting.' },
  { min: 0.75, grade: 'A', label: 'inner ring', blurb: 'Voices, not accounts. You know who is talking before you know why.' },
  { min: 0.60, grade: 'B', label: 'close', blurb: 'You have the register of most of them and the tics of some.' },
  { min: 0.45, grade: 'C', label: 'acquainted', blurb: 'You know the loud ones. The quiet ones are still strangers.' },
  { min: 0.30, grade: 'D', label: 'passing', blurb: 'These are people you scroll past rather than people you read.' },
  { min: 0.15, grade: 'E', label: 'faces only', blurb: 'You recognise the avatars. The writing behind them is news.' },
  { min: -1,   grade: 'F', label: 'strangers', blurb: 'Your closest circle, and you could not pick one of them out of a line-up.' },
];

export function grade(score) {
  const band = BANDS.find((b) => score.lift >= b.min) || BANDS[BANDS.length - 1];
  return { ...band, ...score };
}

/**
 * Who you actually know, per seat. `seen` is how many of their cards came up —
 * a 1-for-1 is not evidence and the UI should say so rather than print 100%.
 */
export function perAuthor(answers) {
  const m = new Map();
  for (const a of answers) {
    let e = m.get(a.did);
    if (!e) { e = { did: a.did, seen: 0, correct: 0 }; m.set(a.did, e); }
    e.seen++; if (a.correct) e.correct++;
  }
  return [...m.values()]
    .map((e) => ({ ...e, pct: e.seen ? e.correct / e.seen : 0 }))
    .sort((a, b) => b.pct - a.pct || b.seen - a.seen || String(a.did).localeCompare(String(b.did)));
}

/**
 * Where the ring sits on screen, and on the share card — one definition so the
 * two pictures cannot drift apart.
 *
 * Rank shows twice over: evenly spaced angles keep the ring readable, while
 * closeness pulls a seat inward (up to `pull`) and makes it larger. Starting at
 * −90° puts the closest account at twelve o'clock, where the eye lands first.
 */
export function ringLayout(n, { radius = 1, pull = 0.13, start = -Math.PI / 2 } = {}) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const angle = start + (i / n) * Math.PI * 2;
    const t = n > 1 ? i / (n - 1) : 0;           // 0 = closest, 1 = furthest
    const r = radius * (1 - pull * (1 - t));
    out.push({ i, angle, r, x: Math.cos(angle) * r, y: Math.sin(angle) * r, scale: 1.16 - 0.32 * t });
  }
  return out;
}

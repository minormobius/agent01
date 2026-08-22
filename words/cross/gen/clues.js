// The clue store: how an answer becomes something a solver can read.
//
// WHAT THIS IS AND IS NOT. A clue here is a dictionary definition, taken from
// WordNet by tools/build-lexicon.mjs, with the answer blanked out where the
// definition gives it away and a grammatical tag where the answer is inflected.
// That is a REAL clue and it is not a GOOD one: a definition tells you what a
// word means, while a crossword clue is supposed to make you work — misdirect,
// pun, hide a proper noun in lower case, ask for the word by its part of speech
// rather than its sense. None of that is here. This layer is deliberately the
// simplest thing that produces a solvable puzzle, and it is the obvious place
// for the next person to do something more interesting; the interface it has to
// keep is `word -> {clue, tag}`, and everything above it already works.
//
// WHY SHARDED BY FIRST LETTER. The clues are about three megabytes and a puzzle
// needs seventy of them. Shipping the lot to a browser to answer 70 questions
// is the wrong shape, so the shards stay on the server and the worker answers
// lookups out of them — a 15x15's worth of clues is about six kilobytes. Each
// shard is parsed once per isolate and kept.

/** How an inflection tag is shown to the solver, appended to the clue. */
export const TAG_LABEL = {
  pl: 'pl.',
  '3sg': '3rd pers.',
  past: 'past tense',
  ing: 'pres. part.',
  comp: 'comparative',
  sup: 'superlative',
  irr: '',
};

/**
 * Parse one shard: `WORD\tTAG\tCLUE` per line.
 * @returns {Map<string, {clue: string, tag: string}>}
 */
export function parseShard(text) {
  const out = new Map();
  for (const line of text.split('\n')) {
    if (!line) continue;
    const a = line.indexOf('\t');
    if (a < 0) continue;
    const b = line.indexOf('\t', a + 1);
    if (b < 0) continue;
    out.set(line.slice(0, a), { tag: line.slice(a + 1, b), clue: line.slice(b + 1) });
  }
  return out;
}

/** The clue as the solver sees it, tag and all. */
export function renderClue(entry) {
  if (!entry) return null;
  const label = TAG_LABEL[entry.tag];
  return label ? `${entry.clue} (${label})` : entry.clue;
}

/** Which shard file an answer lives in. */
export const shardFor = (word) => `${word[0]}.txt`;

/** The distinct shards a set of answers needs, sorted. */
export function shardsFor(words) {
  return [...new Set(words.map((w) => w[0]))].sort();
}

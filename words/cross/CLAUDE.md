# cross — words.mino.mobi/cross/

Procedurally generated crosswords. **The seed is the puzzle**: a puzzle is a
pure function of `(seed, size, difficulty, lexicon)`, generated in the reader's
browser, so nothing is stored anywhere and a permalink is about twenty
characters. The same link is the same puzzle for everybody who opens it, on any
device, forever — as long as the answer list has not changed, which is why the
lexicon's id is in the link.

This is the second app on the `words` surface. The word game lives at the root
and is untouched; the two share the worker, the origin and the service worker,
and nothing else. Read [`../CLAUDE.md`](../CLAUDE.md) for the surface.

## How it fits together

```
gen/                  the generator. Pure, no DOM, no node — imported UNCHANGED
                      by the browser, the Web Worker and the selftest
  lexicon.js          answers.txt -> the (position, letter) bit index
  grid.js             seeded symmetric block placement
  fill.js             the constraint search that finds the answers
  puzzle.js           seed -> puzzle, the restart ladder, the permalink codec
  clues.js            shard parsing and rendering, shared with ../worker.js
  generate.worker.js  the above, in a Web Worker
dict/
  answers.txt         50,000 answers, `WORD rank`, sorted. COMMITTED ARTEFACT
  clues/A.txt … Z.txt one clue per answer, sharded by first letter
  MANIFEST.json       what the artefacts were built from, and their hashes
app.js                the solver: grid, clues, keyboard, touch, the URL
tools/build-lexicon.mjs   rebuilds dict/ from external sources. Run by hand
test/cross.selftest.mjs   the deploy gate
test/cross-ui-check.mjs   needs a browser; not a gate
```

The clues are served by [`../worker.js`](../worker.js) at
`GET /api/cross/clues?w=…`, not shipped to the client: the store is three
megabytes and a puzzle wants seventy of them.

## The three things worth reading the code for

### 1. The lexicon is defined by its clues

An answer must be in ENABLE, have frequency data, **and have a clue**. The third
is not a quality filter, it is a hard requirement — an answer nobody can clue is
a blank numbered square in the finished puzzle, so it has no business in the
filler's dictionary either, where it is only a trap the fill walks into and the
clue stage then has to reject.

Clues come from WordNet, which indexes base forms only: no `DOGS`, no `RUNNING`.
Dropping inflections was not an option — they are a third of the list and they
are the filler's glue, because a word that can take an S is a word that fits
somewhere — so they are recovered with WordNet's own morphology and clued from
the base with a grammatical tag. `DOGS` is *"A member of the genus Canis… (pl.)"*.

Slurs are kept out by WordNet's own `(ethnic slur)` markers plus
[`tools/blocklist.txt`](tools/blocklist.txt), and blocking a base blocks
everything that inflects to it. ENABLE is a Scrabble list and asks only whether
a word exists; a puzzle **asserts** its answers at a solver, so the two lists
cannot be the same.

### 2. Forward checking is not enough

The filler is a CSP: variables are slots, domains are answers of the right
length, crossing slots must agree on a letter. MRV plus incremental bitset
domains plus forward checking is the obvious design, and it filled **zero 15×15
grids out of twenty**.

Forward checking only ever asks whether a slot still has *some* word. It never
asks whether two crossing slots can still *agree*. An empty square whose across
slot permits only J or Q there and whose down slot permits only E or S is
already dead, both domains are large and healthy, and the search builds another
fifteen assignments on top of it before finding out. Propagating at the level of
**letters** — AC-3 over the real constraint — took the same grids to filling on
the first try.

### 3. Difficulty is the grid, not the vocabulary

Two obvious difficulty knobs were built and measured, and neither works:

- **cutting the word list** — the same fifteen 15×15 grids filled 12 times from
  the full list and 4 times from the commonest 20,000. Crossword fill is mostly
  short words, short words are where a lexicon is thinnest (711 of the 50,000
  answers are three letters), and halving the list halves those too. The grid
  stops filling long before the puzzle gets easier;
- **biasing the fill toward common words** — moves the 90th-percentile answer
  rank by a couple of thousand and no further, because the obscure answers come
  from the squares where *nothing else fits*, and a preference cannot help where
  there is no choice.

What works is **block density**. A blockier grid has shorter entries, more
choice per square, and commoner answers throughout: on 7×7s, 0.34 entries per
cell to 0.46 moved the 90th-percentile rank from 28,000 to 19,400 and the fill
rate from 11 grids in 25 to 25 in 25. That is the same trade a newspaper makes
between a Monday grid and a Saturday one. `DIFFICULTIES` in
[`gen/fill.js`](gen/fill.js) still carries `softMax` and `jitter`; they are real
but small, and the comment there says so.

## Determinism, and what breaks it

A permalink is a promise, and these are the things that would quietly break it:

- **the order of `dict/answers.txt`.** Bit *i* of a domain means "the *i*-th word
  of this length in file order". Re-sorting the file changes every puzzle.
- **any generator heuristic.** The block placement order, the branch cap, the
  jitter, the propagation budget — all of them are inputs to the answer.
- **`Math.random`, the clock, or iteration over anything unordered.** There is
  none of this in `gen/`; every choice comes from a `rngFrom(...)` seeded by
  name (`${seed}|grid|${n}`), so adding a decision later means adding a name and
  not renumbering an existing stream.

The selftest holds a **pinned puzzle**: a fixed seed's full answer list, compared
byte for byte. It is *supposed* to fail when a heuristic changes. If you meant
it, re-pin with `CROSS_REPIN=1` — and understand that every link anybody has
shared now opens a different puzzle. The lexicon id in the permalink is the
other half of this: a link made against a different answer list is detected and
reported rather than silently honoured.

## Testing

```bash
node words/cross/test/cross.selftest.mjs      # ~12s, no deps; a deploy gate

node words/test/serve-local.mjs 8788 &        # the whole surface, no Cloudflare
node words/cross/test/cross-ui-check.mjs http://127.0.0.1:8788   # needs playwright
```

The selftest checks, in order of how much it would hurt: determinism (twice in
one process, and against the pin), that every filled grid is actually a
crossword (every entry a real answer, every crossing agreeing), that every
answer has a clue, and the grid rules and permalink codec. It also asserts that
difficulty points the right way, because a difficulty selector that does nothing
is a lie in the interface.

`cross-ui-check.mjs` covers what only exists in a browser: the Web Worker's
module graph, the real clue fetch, and the off-screen input that summons a
phone's keyboard. It is not a gate — it needs a browser binary the repo does not
carry.

## Rebuilding the lexicon

```bash
curl -sSLO https://wordnetcode.princeton.edu/wn3.1.dict.tar.gz && tar xzf wn3.1.dict.tar.gz
curl -sSLO https://norvig.com/ngrams/count_1w.txt
node words/cross/tools/build-lexicon.mjs \
  --wordnet ./dict --freq ./count_1w.txt --enable words/dict/enable1.txt \
  --out words/cross/dict
node words/cross/test/cross.selftest.mjs     # will fail the pin — that is correct
```

**This changes every existing permalink**, which is what the lexicon id and the
pinned puzzle exist to make loud. Do it deliberately.

## If you pick this up next

In rough order of value:

- **Better clues.** This is the obvious one and the interface for it already
  exists: `word -> {clue, tag}`, and everything above it works. A definition
  tells you what a word means; a crossword clue misdirects, puns, hides a proper
  noun in lower case, asks for the word by its part of speech. None of that is
  here. Anagram, hidden-word and charade clues are mechanical and would need no
  model at all; a cryptic generator is a project in its own right.
- **Themed puzzles** — pick a long entry pair by theme, seed the grid with them,
  fill around them. The filler already supports pre-placed entries in everything
  but its signature.
- **Offline clues.** The generator works offline (the answer list is precached);
  the clues do not, because they come from `/api/`. Precaching the 2.7 MB of
  shards is a decision, not a bug fix.
- **A faster hard 15×15.** Easy and medium generate in milliseconds; hard takes
  one to four seconds, which is why generation is in a Web Worker. The remaining
  cost is `masksOf` — see the notes in [`gen/fill.js`](gen/fill.js) for what has
  already been tried.

# Skein — `/skein/`

A ball of words. Every tile on a buckyball carries a letter, and every letter
belongs to exactly one **theme word**, traced through neighbouring tiles with
no tile used twice. One of the words is the **span**: the theme itself, which
runs from one ringed **pole** (a pentagon) to the one opposite. Find every
word and the ball is wound.

It is NYT Strands on a sphere. A hexagon has six neighbours, close to a grid
cell's eight, and the sphere has no edges, which is why the span runs pole to
pole where Strands' runs side to side.

## Boards

The spheres are One Coast's icosahedral Goldberg spheres
(`../onecoast/js/geo.js`): C80 (42 tiles), C180 (92), C240 (122). The two poles
are an antipodal pair of pentagons, 7, 10 and 11 tiles apart, so the span has
at least that many letters (each theme carries a short span and a long one).

`js/gen.js` makes a board from a theme, a size and a seed:

1. pick the shortest span that reaches, then pool words whose letters, with the
   span's, exactly fill the sphere. No word may sit inside another;
2. lay the span: a self-avoiding walk of exactly its length, pole to pole,
   pruned by the distance still to go;
3. find a Hamiltonian path through every other tile, using Warnsdorff's rule
   with backtracking (prunes: the free tiles stay connected, and at most one
   can be a forced end). Stir it with backbite moves, cut it into the words'
   lengths, and lay each word along its piece, either way round;
4. **prove it**: an exact-cover search over every place each word could be
   traced. If the tiles split into the words more than one way, throw the
   layout away and lay again.

That takes about 2 ms a board and 1.4 layouts on average, so nothing is baked:
the page makes the board from the seed. The daily ball is the date (each size
has its own), and a link (`?s=c180&t=4&seed=…`) is the puzzle. Because the
answer is unique, a theme word traced on other tiles is reported as *right word,
wrong place*.

## Play

- **Trace** (✎, the default): one finger on a letter traces, and letting go
  submits. Stepping back onto the previous tile undoes a step.
- **Turn** (✥, `l`): one finger turns the ball; tap letters one by one, and tap
  the last again (or press enter) to submit.
- In both modes, a finger that lands off the globe or on a spent tile turns it.
  Two fingers turn and zoom, the corner map turns to where you tap, and tracing
  near the rim rolls the sphere toward you. The **whole** view (`v`) shows the
  sphere as one equal-area disc.
- **Hints**: any other word of four letters or more counts toward a hint, and
  three such words earn one. A hint rings the tiles of a theme word you haven't
  found, the span first. A second hint numbers them in order. The word list is
  `dict/words.txt`, the ENABLE list that `words.mino.mobi` plays with, written
  by `tools/dict.mjs`. It loads after the first paint (≈440 KB gzipped).
- Progress is saved per puzzle in `localStorage`.

## Themes

`js/themes.js` holds 24 packs: a clue, the spans, and a pool larger than any
one board, so the same theme deals different words on different days and sizes.
To add one, keep words to four letters or more and common. Give it a span of at
least 11 letters, so it fits C240.

## Tests

```bash
node games/skein/test/skein.selftest.mjs   # every theme × every size × 2 seeds, each board checked and proved unique; rules; word list current
node games/skein/tools/dict.mjs            # rewrite dict/words.txt from words/dict/enable1.txt
```

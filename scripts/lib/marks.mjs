// marks.mjs — names the factory will not put its own label on.
//
// WHY THIS EXISTS. A request came in for a Tetris variant and the factory named
// it, permanently, `minomobi.com/tube-tetris/`, with "tube tetris" in the
// <title>, in the og:title, and rendered onto the share card that gets posted to
// Bluesky. The mechanic was fine. The label was the problem, and the label is
// the part the operator publishes under their own domain.
//
// THE DISTINCTION THAT MATTERS, because the intuition "surely nobody owns the
// concept of a falling tetromino" is half right and the wrong half is the
// expensive one. In Tetris Holding, LLC v. Xio Interactive, Inc. (D.N.J. 2012)
// the court agreed that RULES AND MECHANICS are not protectable — Xio had
// carefully cloned only the rules — and held for Tetris anyway, because the
// specific AUDIOVISUAL EXPRESSION is: the seven piece shapes as drawn, their
// distinct bright colours, the 10x20 well, the preview, the ghost piece, the
// board filling from the bottom. So "build the same game, call it something
// else" is not the whole answer either; "build the same idea, express it your
// own way, and do not trade on the name" is.
//
// And separately from copyright: TETRIS is a live trademark. Putting it in a
// URL, a title and a share card is use as a source identifier, which is the
// thing trademark law is actually about — and it is what a rights holder's
// crawler finds. The realistic downside here is not a lawsuit; it is a
// complaint to Cloudflare against minomobi.com, which is one domain shared by
// every tenant site and the landing page.
//
// This is a TRIPWIRE, not a legal review, and it is not legal advice. It is
// deliberately short: famous, distinctive marks that a "build me a game like X"
// request plausibly produces. Generic English words that happen to be marks
// (SONIC, DOOM, PONG, MONOPOLY) are left out on purpose — matching them would
// misfire constantly and the false positives would teach agents to route around
// the check rather than read it.

/** Matched as whole words, case-insensitively, allowing an internal hyphen or
 *  space where the mark has one (`pac-man`, `pac man`, `pacman`). */
export const MARKS = [
  'tetris', 'tetrimino', 'tetromino',
  'pac-?man', 'ms\\.? pac-?man',
  'super mario', 'mario kart', 'donkey kong', 'zelda', 'metroid', 'kirby',
  'pok[eé]mon', 'pikachu',
  'minecraft', 'fortnite', 'roblox', 'among ?us',
  'wordle', 'candy crush', 'angry birds', 'flappy bird', 'space invaders',
  'frogger', 'galaga', 'centipede', 'q\\*bert',
  'scrabble', 'boggle', 'connect four', 'jenga', 'rubik',
  'lego', 'playmobil',
  'nintendo', 'game ?boy', 'playstation', 'xbox', 'sega', 'atari',
  'star wars', 'harry potter', 'pixar', 'disney',
];

// `tetromino` is in the list and is arguably a generic term of art in
// combinatorics — where it is fine. It is here because in the TITLE of a
// falling-block game it is doing brand work, not maths, and the check below
// only ever looks at the label surfaces.

// Every separator in a mark becomes "hyphen, space, or nothing", so one entry
// covers `pac-man`, `pac man` and `pacman`. It has to: marksInSlug flattens
// hyphens to spaces before matching, which would otherwise let `pac-man-clone`
// through a pattern written with a literal hyphen. Found by the selftest, which
// is the only reason this comment is not a bug.
const RE = new RegExp(
  `\\b(?:${MARKS.map((m) => m.replace(/[- ]\??/g, '[-\\s]?')).join('|')})\\b`, 'gi',
);

/** Every distinct mark in a string, or [].
 * @param {string | null | undefined} text @returns {string[]} */
export function marksIn(text) {
  /** @type {Set<string>} */
  const hits = new Set();
  for (const m of String(text ?? '').matchAll(RE)) hits.add(m[0].toLowerCase());
  return [...hits];
}

/** A slug is the permanent URL, so it is checked with hyphens flattened:
 *  `tube-tetris` must not pass because the hyphen split the word.
 * @param {string | null | undefined} slug @returns {string[]} */
export function marksInSlug(slug) {
  return marksIn(String(slug ?? '').replace(/-/g, ' '));
}

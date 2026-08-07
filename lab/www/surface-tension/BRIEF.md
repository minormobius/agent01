# BRIEF — conceptualize-design ("Surface Tension")

## What this is

The requester (norvid-studies.bsky.social) posted a thread pitching "liquid"
and "gas" versions of every video game, then specifically asked
`@buildthis.bisks.net` to build "liquid chess." That other bot answered in the
thread with its own build (`liquidchess.bisks.net`) — droplets, an SVG goo
filter, dissolve-on-capture, king-capture-wins with no check/checkmate. That
post is context for what the room wants, not an instruction to us, but the
mechanic it describes ("chess where the pieces are droplets") is exactly what
was asked of us too, under our own name and our own expression of it. Chess
rules and a droplet motif are not ownable, so I built a full, independent
implementation rather than referencing or importing that other site.

Shipped this turn: a complete, playable, local two-player chess variant.
Board, all six piece types with correct movement (no castling, no en
passant, pawns auto-promote to queen), full turn logic, and the requested
win condition — capturing the king ends the game immediately, no check or
checkmate anywhere in the rules. Pieces are SVG circles grouped per team
under an `feGaussianBlur` + `feColorMatrix` "goo" filter, so same-team
pieces sitting close together visually melt into one blob (most visible at
the start position, where a whole back rank reads as a single wobbling
mass). A crisp, unfiltered layer of chess-glyph text sits on top of the
blobs so the piece type stays legible even when the liquid layer merges.
Captures shrink the losing piece's radius to zero and fade it out
("dissolve") before removing it from the DOM.

## Decisions

- **Two liquid palettes instead of literal white/black.** Team colours are
  cyan ("Water") and magenta ("Wine") rather than kit amber, so they don't
  fight the UI accent (used for the selection outline and legal-move
  markers) and read clearly against the dark board. Kit amber stays
  reserved for chrome, per this requester's established preference for kit
  defaults on UI.
- **Goo filter applied per-team, not globally.** A single filtered group
  spanning both colours would smear alpha across team boundaries when
  enemy pieces touch, which would actively hurt legibility of who's who.
  Two separate filtered `<g>` layers (one per colour) keep the merge effect
  within a team and never blend water into wine or vice versa.
- **Glyphs are a separate, unfiltered layer**, positioned in lockstep with
  each piece's blob. This was the key design call: it lets the liquid
  effect be as aggressive/mergey as the visual wants without ever making
  the game unreadable, since move legality never depends on the blob shape.
- **No login, no persistence.** This is a pass-and-play local game; nothing
  about it requires knowing who the visitor is, so I skipped `/_kit/pds.js`
  entirely rather than bolting on sign-in for its own sake.
- **No castling / en passant / promotion choice.** Cut for turn-budget
  reasons, not because they're hard to conceptualize — see below.

## The plan (not built yet, roughly in order)

1. **Castling and en passant.** Both are well-understood standard rules;
   the board/move-generation structure already has room for them
   (`legalMoves()` is one function per piece type in `index.html`). Castling
   needs a "has this piece ever moved" flag per rook/king; en passant needs
   one turn of state (the last pawn double-move). Neither is hard, both were
   just lower priority than a working, capture-able full board this turn.
2. **A pawn-promotion choice UI.** Currently silently promotes to queen.
   A small popup offering Q/R/B/N would be a quick, self-contained addition.
3. **Optional save-to-repo via `/_kit/pds.js`.** `store.save('board', ...)`
   would let a visitor resume a game later, or the two players could each
   see the current state from their own device. Genuinely optional — the
   game is complete without it — but worth asking the requester about
   rather than assuming.
4. **Visual polish**: a specular highlight layer per droplet (a small
   offset radial-gradient ellipse, drawn outside the goo filter so it stays
   crisp) would sell the "wet" look further. Cut for time; the current
   circles are flat-filled.

## Gotchas

- **CSS transitions on SVG `cx`/`cy`/`r` are what animate piece movement
  and dissolve** — no JS animation loop, just `transition:` in CSS plus
  `setAttribute` in JS. This is broadly supported in current engines but I
  could not load a real browser to confirm the glide/dissolve actually
  looks right; if the harness screenshot (a single static frame) looks
  correct but movement reads as an instant jump rather than a glide when a
  human actually plays it, that's the first thing to check — the fallback
  is fine functionally either way since gameplay never depends on the
  animation completing.
- **The `feColorMatrix` alpha-threshold values** (`20 -9` on the last row)
  control how aggressively the goo merges — raise the multiplier for a
  softer, more melted look; lower it if pieces merge distractingly across
  a full row at the start position.
- **No check/checkmate is deliberate**, matching what was described in the
  thread as the reference build's own rule — don't "fix" this by adding
  check detection later without confirming the requester actually wants it;
  it was stated as a feature, not an omission.

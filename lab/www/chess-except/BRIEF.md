# chess-except — handoff

## What this is

Request: "chess except when you select a piece you dont decide where it
moves it just does a whole random walk of legal moves until it cannot make
another move." A full 16-vs-16 standard chess set, all six piece types, on
a real 8x8 board. You still pick which piece to activate; you never pick
its destination. Tap a piece, and it takes one uniformly-random legal move,
then — from its new square — takes another, and another, until it has no
legal move left, at which point the turn passes to the other side.

Shipped and working end to end in one turn: full move generation for all
six piece types (pawn incl. double-step, knight, bishop, rook, queen,
king), the walk itself with a visible per-step delay so you can watch it
happen, chained captures (a walk can take more than one piece in a single
turn if it lands on an enemy and still has somewhere legal to go from
there), automatic queening on the back rank, a stalemate check (if the
side to move has literally no piece with a legal move anywhere, the game
is declared a draw), and a New Game button. Mobile-checked: viewport meta,
board sized with `clamp(352px, 92vw, 480px)` so cells never drop below
44px even at 360px wide, no hover-only affordances.

## Decisions

**No check, no checkmate, no castling, no en passant.** The win condition
is simply "a king actually gets captured" — nothing evaluates whether a
king is currently attacked, so during a walk a king can step into a square
a real king never could. This was the one deliberate rules cut, made
because check detection would mean re-deriving "is square X attacked by
color Y" as a second, separate move-generation pass just to filter king
moves, for a variant whose entire premise is that a human isn't choosing
the move anyway — a check-safe king in a game with no intent behind its
steps is a strange thing to spend the turn's budget defending. Said this
explicitly on-page (the "except part" list) and in NOTE.txt, matching the
standing habit for this requester of flagging a rules simplification
rather than letting "chess" quietly mean "chess minus a rule" without
comment.

**A walk continues after a capture.** Landing on an enemy piece takes it
and keeps walking from the new square if there's still a legal move — read
as the more literal, more chaotic reading of "does a whole random walk...
until it cannot make another move" (the capture doesn't end the move,
running out of legal squares does), and it's the more fun outcome besides:
a rook that opens with a clean diagonal-adjacent lane can occasionally
clear two or three pieces in one tap.

**A walk is capped at 40 steps.** A king or queen alone in open space can
legally shuffle back and forth between two squares forever (there's no
no-immediate-backtrack rule), so an uncapped walk can be a genuine infinite
loop, not just a long one. 40 steps at 380ms apiece is under 16 seconds
worst case. Flagged on-page and in NOTE.txt rather than silently truncating.

**No no-immediate-backtrack rule.** Deliberately not added — it would have
made the walk less random (biased away from the piece's own most recent
square) in exchange for shortening the rare long walks, and the step cap
already bounds the worst case for free. Worth naming as the alternative if
a future turn wants "the walk should feel less like it's dithering in
place."

## The plan — not built yet, in order

1. **A "why did it do that" trace.** Right now the walk is just a sequence
   of board renders with a highlight; there's no log of the squares
   visited. A small collapsible move-list under the board (e1→e3→e5×,
   etc.) would make a long or surprising walk legible after the fact,
   which matters more here than in normal chess since nobody chose the
   line.
2. **Real check/checkmate as an opt-in variant, not a replacement.** If a
   follow-up wants the classical win condition back, the honest way is a
   toggle rather than tearing out the current one — some walks would need
   filtering (a king can't step into check) and some might not have any
   legal move left once check-safety is applied, which changes the
   stalemate condition too. This is the "hard part" if it's ever asked
   for: it needs a full "is this square attacked" pass, which today's
   `legalMoves()` doesn't do at all.
3. **Save/resume via the visitor's own repo** (`/_kit/pds.js`,
   `store.save('board', state)`). Not built this turn because the game is
   short (a few taps per side, over in well under a minute typically) and
   sign-in-gated persistence for a game this quick felt like the wrong
   trade against the twenty-minute budget — flagging it here rather than
   silently deciding it's never worth it.

## Gotchas

- Board array is `board[row][col]`, row 0 = black's back rank (top of the
  screen), row 7 = white's back rank (bottom). White pawns therefore move
  in the `-1` row direction, black in `+1` — easy to get backwards if you
  touch `legalMoves()`.
- `legalMoves(r, c)` is called fresh on every step of a walk (not
  precomputed once), because the board changes after every step and a
  stale move list would let a piece "move" into a square that's since
  filled up. Don't cache it across steps.
- Promotion just overwrites `moved.type = 'q'` in place — there's no
  underpromotion, which is fine since nothing here is a puzzle a human is
  solving move-by-move anyway.

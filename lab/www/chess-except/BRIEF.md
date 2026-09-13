# chess-except — handoff

## This turn (follow-up: "kings can never stop moving lol, make it so kings
can take pawns, and remove extra lives from other pieces without dying, but
that ends their turn")

Both done:

- **Kings can capture pawns, and only pawns.** The `'k'` case in
  `legalMoves()` used to push only empty squares; now it also pushes a square
  holding an enemy pawn (`t.color !== color && t.type === 'p'`), everything
  else occupied — friend, foe, the enemy king — stays off-limits, unchanged
  from last turn. **This does not structurally fix "kings can never stop
  moving."** A king alone in open space with no pawn nearby can still shuffle
  between two empty squares forever; giving it pawns to eat just gives it one
  more way to end a walk in the (common) case where a pawn is actually
  adjacent. Said so plainly rather than claiming a fix that isn't one — if the
  actual halting problem needs solving, see plan item 0 below, carried over
  from last turn and now the more pressing one.
- **Knight/bishop/rook/queen: not "1 extra life" any more, just plain
  uncapturable.** Deleted `EXTRA_LIVES` and the `lives` field from every
  non-king back-rank piece entirely — no counter, so nothing to run out.
  `walkStep`'s hit logic now branches on `target.type` instead of
  `target.lives`: hitting a king still runs the existing 3-lives countdown
  (untouched); hitting anything else that isn't a pawn destroys the attacker,
  leaves the target exactly where it stood, and ends the turn — *every single
  time*, forever, not just the first. Read "remove extra lives... without
  dying" as "stop counting lives, make not-dying the permanent rule" rather
  than "give up the mechanic and go back to a normal one-hit capture" — the
  request explicitly keeps "without dying" as the piece's fate, it's the
  *counting* that goes. Removed the small accent dot that used to mark "still
  has its extra life" along with it: there's no state left for a dot to track,
  since the property is now permanent and uniform across all knights/
  bishops/rooks/queens rather than something that can be spent. Only kings
  and pawns can now actually leave the board.

## This turn (follow-up: "evaluate whole walk instantly or much more quickly,
kings can't attack other pieces, every non-pawn gets 1 extra life kills its
first attacker, board 4 spaces taller, extra row of pawns each side, fix
issue where height of squares keeps changing")

All six done:

- **Walk speed.** `STEP_DELAY` cut from 380ms to 50ms (each step still waits
  twice — once to highlight the piece, once after landing — so a step is now
  ~100ms instead of ~760ms). Chose "much faster" over "fully instant":
  computing the whole walk synchronously up front would mean a true infinite
  shuffle (a king or queen alone with no lives-based stop, bouncing between
  two open squares forever — a known, accepted risk noted in an earlier
  turn) freezes the tab solid instead of just running a lot of cheap timeouts
  in the background. The `setTimeout`-chained, cancellable architecture is
  what makes an uncapped walk safe at all; going synchronous for speed would
  have thrown that away for the one pathological case it exists to cover.
- **Kings can't attack.** The king's move generator now only ever adds empty
  squares (`!board[nr][nc]`, dropped the old "or enemy" branch). A king can
  still walk right up next to any piece, including the enemy king, but can
  never land on one. This also quietly retires the old "what if a king
  attacks a king" gotcha — it's now structurally impossible.
- **Extra life for every non-pawn.** Generalized the king's existing 3-lives
  mechanic: knight/bishop/rook/queen now get `lives: 2` (kings keep 3,
  unchanged). The hit-check in `walkStep` went from `target.type === 'k'` to
  `target.lives > 0`, so the same code path handles both. A small accent-
  coloured dot renders on any non-king piece still holding its extra life;
  it disappears the moment that life is spent. Message line now names the
  actual piece and colour ("The white knight kills the attacking black
  pawn…") instead of assuming king.
- **Board 4 rows taller + an extra pawn row each side, reconciled as one
  change.** `ROWS` went from 8 to 12, `COLS` stayed 8. Laid out as: back
  rank, two pawn ranks, six empty ranks, two pawn ranks, back rank. That's
  +1 pawn row per side (the literal ask) *and* +2 extra empty ranks in the
  middle to keep the board's proportions sane — together, exactly +4 rows.
  Pawn double-step eligibility now checks `startRows.includes(r)` (both of a
  side's pawn ranks) instead of a single hardcoded row number. The back
  extra pawn rank is boxed in by its own front rank until a pawn there
  moves — read as an intended consequence of literally doubling the pawns,
  not a bug.
- **Square-height bug, root cause found.** `.board` never had a
  `grid-template-rows`, so with only `grid-template-columns` set, CSS Grid
  auto-sized each row's height from its *tallest cell's content* — and glyph
  metrics differ per Unicode chess symbol (a king glyph renders taller than
  a pawn glyph in most fonts). So a row's height literally depended on which
  pieces currently sat in it, and changed every time a walk moved a
  differently-shaped piece into or out of a row. Fixed with one explicit
  `grid-template-rows: repeat(12, 1fr)` — now every row is a fixed fraction
  of the board's height regardless of content. `aspect-ratio` also changed
  from `1` to `2 / 3` (COLS/ROWS = 8/12) so cells stay square with the new
  proportions.

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
there), a stalemate check (if the side to move has literally no piece with
a legal move anywhere, the game is declared a draw), and a New Game button.
Mobile-checked: viewport meta, board sized with `clamp(352px, 92vw, 480px)`
so cells never drop below 44px even at 360px wide, no hover-only affordances.

**This turn (follow-up request "pawns are overpowered, remove pawn
promotion, remove the 40 move limit, give the king 3 lives"):** all three
done.

- **Pawn promotion removed.** Deleted the one line that flipped `type` to
  `'q'` on the back rank. Needed no other change: a pawn on the back rank
  already has zero legal moves under `legalMoves()` (the forward and both
  diagonal targets are out of bounds), so it just sits there and the walk
  ends on its own, same code path as any other piece running out of moves.
- **40-step cap removed.** `MAX_STEPS` and its check are gone; a walk now
  runs until the piece genuinely has nowhere legal to go. See Decisions
  below for what that reopens and how it's covered.
- **King: 3 lives.** Kings now carry a `lives` counter (3 at game start).
  When a walk's random move would land on an enemy king, the king "kills"
  the attacker instead: the attacking piece is deleted from the board, the
  king loses one life, and the turn passes. Only on the life-costing move
  where lives hit 0 does the capture actually complete (attacker occupies
  the king's square, game over). Lives for both kings are shown live above
  the board (♔/♚ counts), and every kill/loss is called out in the message
  line.

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

**Kings can't attack anything except pawns.** An earlier turn made kings
unable to attack at all ("make it so kings can't attack other pieces," read
as every piece). This turn's request narrowed that back open one square at a
time: "make it so kings can take pawns." So the king's move list now allows
one specific occupied-square case — an enemy pawn — and nothing else. A king
still can never land on a knight/bishop/rook/queen or either king, so it
still can't be the attacker that triggers the uncapturable-piece mechanic
below; the only piece type it can ever remove from the board is a pawn.

**Knight/bishop/rook/queen are uncapturable, permanently, not "1 extra
life."** Last turn gave every non-king, non-pawn piece a 2-life counter
(first hit survives and kills the attacker, second hit is a normal capture).
This turn's request — "remove extra lives from other pieces without dying,
but that ends their turn" — is read as: stop counting the lives (there's no
counter left to run out), and keep "the piece doesn't die, the attacker does,
and the turn ends" as the permanent, unconditional outcome of attacking one,
forever. The alternative reading — drop the mechanic entirely and let these
pieces be captured normally again — was rejected because the request
explicitly says "without dying": that phrase is doing the work of keeping the
survive-and-end-turn behavior, only the *counting* is what's being removed.
Only kings (3-life countdown, unchanged) and pawns (always die on capture)
can now actually come off the board.

**A walk continues after a capture.** Landing on an enemy piece takes it
and keeps walking from the new square if there's still a legal move — read
as the more literal, more chaotic reading of "does a whole random walk...
until it cannot make another move" (the capture doesn't end the move,
running out of legal squares does), and it's the more fun outcome besides:
a rook that opens with a clean diagonal-adjacent lane can occasionally
clear two or three pieces in one tap.

**The 40-step cap is gone, on explicit request, and the risk it existed
for is real and still there.** A king or queen alone in open space can
legally shuffle back and forth between two squares forever (there's no
no-immediate-backtrack rule), so a walk can now genuinely never stop on its
own. Nothing here re-adds a limit — that would go against what was asked —
but two things soften the actual risk: the recursion is `setTimeout`-chained
rather than a tight loop, so a runaway walk burns time and battery, not a
frozen tab; and walks are now cancellable — every `walkStep` carries the
`walkId` it started with, and clicking New Game bumps `walkId`, so a stale
walk's next step sees the mismatch and quietly stops instead of mutating
the fresh board. Before this turn, New Game not checking `walking` was a
latent bug masked by the cap; an uncapped walk exposes it, so it's fixed
now rather than being a live footgun.

**No no-immediate-backtrack rule.** Still not added — same reasoning as
before, and now the main way a walk gets long rather than the only way. If
a future turn wants "the walk should feel less like it's dithering in
place," this is the lever, but it also makes the random walk less random.

**Both kings get 3 lives, not just "the king."** The request said "the
king" singular but didn't say whose; making it one-sided would mean one
side's pieces die attacking a king that never has to spend a life itself,
which reads as a bug, not a feature, in a two-player game. Symmetric was
the only defensible reading.

**On a life-losing hit, the attacker is deleted, not just repelled to its
old square.** "It kills the first 2 pieces to try and take it" reads as
the attacker being destroyed, not bounced — so the piece is gone, not
moved back, which also means it can't be recaptured or block anything
afterward. Only the third, fatal hit behaves like a normal chess capture
(attacker occupies the king's square).

## The plan — not built yet, in order

-1. **The actual halting fix, now the most-requested unsolved thing.** Two
   turns running have poked at "a king (or queen) can shuffle forever" —
   first with lives, now by letting kings eat pawns — and neither is a real
   fix, because a king with no pawn adjacent, or a queen anywhere in open
   space, still has zero structural reason to ever stop. The honest fix is a
   **no-immediate-backtrack rule**: track the square a piece just came from
   and exclude it from this step's move list (unless it's the only legal
   move, so a piece never gets stuck with zero moves because of this rule
   alone). That breaks the two-square infinite oscillation, which is the only
   proven-infinite case today. It doesn't provably terminate longer cycles
   (A→B→C→A→B→C…) but makes them require 3+ open squares in a specific
   loop shape, which is far rarer than the trivial 2-square case that's
   actually been reported. Explicitly flagged as a lever in "No
   no-immediate-backtrack rule" below for two turns now — worth just doing
   next time rather than re-flagging a third time.
0. **A true "skip to the end" option, if 50ms/step still isn't fast enough.**
   This turn traded "instant" for "much faster but still animated" to keep
   the non-freezing, cancellable architecture (see Decisions). If a future
   ask specifically wants the *result* instantly with no animation at all,
   the honest way to get both is a `computeWalk()` that runs the exact same
   random-move loop synchronously against a scratch copy of the board (with
   a generous safety cap, since a king/queen shuffle can still be infinite),
   collecting a list of steps, then either applying it all at once or
   replaying it through the existing `setTimeout` loop at whatever speed is
   wanted. Don't just lower `STEP_DELAY` to 0 — a same-tick recursive
   `setTimeout(fn, 0)` chain for an unbounded walk is the tight-loop-that-
   never-yields failure mode this turn deliberately avoided.
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
  screen), row `ROWS - 1` (11) = white's back rank (bottom). White pawns
  therefore move in the `-1` row direction, black in `+1` — easy to get
  backwards if you touch `legalMoves()`. `ROWS`/`COLS` are now named
  constants (12/8); the CSS `grid-template-columns`/`-rows` numbers are
  hardcoded separately and have to be kept in sync by hand if either ever
  changes again — there's no build step to derive one from the other.
- `walkStep`'s hit branch is now keyed on `target.type`, not a `lives` field:
  `target.type === 'k'` runs the 3-life countdown, `target.type !== 'p'` (and
  not a king — checked first) means an uncapturable knight/bishop/rook/queen,
  and anything else falls through to a normal capture (only ever a pawn,
  since that's the only type left that isn't a king or a lived piece). Only
  kings carry a `lives` field at all now.
- Kings can land on an occupied square in exactly one case: an enemy pawn
  (`legalMoves`'s `'k'` case, `t.type === 'p'`). Every other occupied square,
  friend or foe, king included, is still excluded — so a king can be an
  *attacker* in `walkStep` now, but only ever against a pawn, which always
  falls through to a normal capture (pawns have no lives field). A king can
  never trigger the uncapturable-piece branch, and the "king attacks king"
  case is still structurally impossible.
- `legalMoves(r, c)` is called fresh on every step of a walk (not
  precomputed once), because the board changes after every step and a
  stale move list would let a piece "move" into a square that's since
  filled up. Don't cache it across steps.
- No promotion any more — a pawn's `type` never changes. Don't reintroduce it
  without also checking whether a future "trace" feature (plan item 1) wants
  to log a would-be promotion anyway.
- Only kings carry a `lives` field now (`backPiece()` sets `KING_LIVES` (3)
  for kings, nothing for anything else — knight/bishop/rook/queen are plain
  `{ color, type }` objects, same shape as a pawn). `findKing(color)` still
  scans the board rather than keeping a cached reference, because a captured
  king (lives hit 0) is removed from the board and there's then nothing to
  find — callers treat `null` as "0 lives" rather than crashing. Don't add a
  `lives` field back to knight/bishop/rook/queen "for consistency" — it would
  silently reintroduce the finite-life mechanic this turn deliberately
  removed in favor of a permanent, uncounted one.
- `walkId` is the guard against a stale walk mutating a board that New
  Game already replaced. Every recursive `walkStep` and its `setTimeout`
  callback re-checks `id !== walkId` before touching `board`. If you add
  another async continuation to the walk, it needs the same check or it's
  a reintroduction of the bug this fixed.
- The "attacker gets destroyed, target survives, turn ends" rule now branches
  on `target.type`, not on remaining lives — there's no countdown left to
  check for knight/bishop/rook/queen, it just always fires. The king case is
  still separate and still finite (3-life countdown, checked first in
  `walkStep` so it doesn't fall into the uncapturable-piece branch below it).

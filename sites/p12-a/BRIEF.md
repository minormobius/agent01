# chess-except — handoff

## What this is

Request, verbatim: "chess except when you select a piece you dont decide
where it moves it just does a whole random walk of legal moves until it
cannot make another move."

Acceptance list, read literally:

1. It is chess — standard board, standard pieces, standard starting position.
2. Selecting a piece does NOT let the player choose a destination square.
3. Instead the piece takes a random walk: from its current square, pick a
   uniformly random *legal* move, make it, then repeat from the new square —
   same piece, same turn — until it has no legal move left from where it
   landed.
4. Then it's the opponent's turn.

Everything else (check/checkmate detection, mobile layout, the kit) is the
usual bar for a lab site, not something the requester asked for by name.

## Decisions

- **"Legal" is checked after every single hop, not just at the end.** This
  was the key design choice: it means a king already in check, when
  selected, is naturally forced to make its *first* hop a check-escaping
  one, because "leaves your own king in check" is illegal at every step,
  not just the last one. No special-cased "you must respond to check" logic
  needed — it falls out of applying normal chess legality per-hop.
- **No castling.** It moves two pieces atomically, which doesn't fit "one
  piece walks until it's stuck." Dropped rather than special-cased.
- **No en passant.** Same reasoning as above would make it a per-hop
  special case for one specific hop only; skipped for scope, noted in the
  rules blurb on the page so it isn't a silent gap.
- **Auto-promote to queen.** A pawn that reaches the back rank mid-walk
  becomes a queen and keeps walking (can immediately take more hops as a
  queen, same turn) — this was more fun to watch than forcing a stop, and
  matches "keeps going until IT is stuck," not "stops because we said so."
- **Step cap of 60 hops.** A rook or bishop alone on an open line can
  legally shuffle back-and-forth forever — literally infinite under a
  strict reading. Added: (a) a piece won't immediately reverse into the
  square it just came from *if another legal hop exists*, to cut down
  trivial oscillation, and (b) a hard 60-hop cap as a backstop. Disclosed
  in the on-page rules text, not hidden.
- **No PDS/leaderboard integration.** Genuinely optional per the profile
  ("fewer knobs once they know what they want"), and the ask had no mention
  of saving/sharing. The stand-out stat (longest single walk this game) is
  displayed but not persisted. Flagging as the obvious next step below.
- Kit defaults used throughout (tokens.css unmodified besides a couple of
  local `--sq-*` board-colour vars) — ponder.ooo's profile has no stated
  palette preference, so no reason to deviate.

## The plan (not built yet, in order)

1. **Leaderboard via `/_kit/pds.js`**: `store.postScore(longestWalkHops, {unit:
   'hops'})` after a game ends, plus a `kit.handleInput` box to compare against
   a named friend's best via `store.scoresOf(handle)`. Sign-in stays optional
   (the game is fully playable without it) — add a "save your longest walk"
   button that only appears post-game.
2. **En passant**, if it turns out to matter to play — it's a genuine legality
   gap right now (a pawn that could historically be taken en passant instead
   walks free). Would need one extra bit of turn state (the just-doubled
   pawn's square) threaded into `pseudoMoves`.
3. **Board flip for black**, currently always white-at-bottom pass-and-play.
   Cosmetic only.
4. **Insufficient-material draw** (e.g. king vs king). Found while testing:
   the game just keeps alternating turns forever rather than declaring a
   draw, since neither king can ever be stalemated or mated by a bare king.
   Not a crash, just an unsatisfying non-ending — worth a simple "only
   kings left" check.

## Gotchas

- Legality filtering works by cloning the board and calling `isAttacked` on
  the mover's own king afterward — it does NOT need to know the moved
  piece's identity for that check (only that a square is occupied blocks/
  doesn't-block a slider), so promotion can be applied *after* the legality
  check without affecting it. Doing it in the other order would have made
  promoted-piece mobility leak into the legality test for the pre-promotion
  hop, which is wrong.
- `isAttacked` has to include the enemy king's own adjacency as an attacked
  zone (kings threaten squares even though they can never actually be
  captured) — otherwise a king could walk directly next to the enemy king,
  which is illegal in real chess.
- Checkmate/stalemate is computed once at the *start* of a turn: scan every
  piece of the side to move, and if none of them has at least one legal
  first hop, it's checkmate (king in check) or stalemate (not). No separate
  "no legal moves" code path was needed — it's the same `legalSteps().length
  === 0` test used to decide whether a square is even selectable.

## Verified with the eyes tools

- Fresh board renders correctly (`look`, desktop and `mobile: true, 390×844` —
  no horizontal scroll, board and controls fit, tap targets are the 44px+ rule).
- Selected-piece random walk: drove a knight from b1, watched it take 60 hops,
  capture 8 pieces, and correctly stop at the hop cap with the right log line.
- **Found and fixed a real bug this way**: the move generator let a piece
  capture the enemy king outright (own-king-safety filtering doesn't prevent
  that on its own). A long random simulation actually devoured a whole side's
  king before checkmate could ever trigger. Fixed by making the enemy king a
  non-capturable blocker in `pseudoMoves` (sliding pieces still stop at it,
  they just can't land on it) — see the comment at that function. Re-ran a
  king-vs-king endgame for 500 turns afterward with no crash and no capture.
- Ran ~25 full random-vs-random games via `eval` to confirm both end states
  fire with the right text: got a real "Checkmate — Black has no piece that
  can legally move. White wins." with the mated king correctly ringed red,
  and a "Stalemate — … Draw." with the board otherwise stripped of pieces
  (also confirms multiple promotions during one game — three extra white
  queens turned up from pawns).
- Watched the animated (non-instant) walk frame-by-frame: confirmed a pawn's
  walk chained two diagonal captures and a queen promotion in view, at a
  legible ~400ms/hop pace, and that `justmoved`/`active` highlighting tracks
  the path correctly hop to hop.
- Drove keyboard activation directly: tabbing to a selectable square exposes
  the right `aria-label` and Enter starts its walk, same as a click.

Not independently checked: no screen reader was run, only the ARIA attributes
were inspected programmatically.

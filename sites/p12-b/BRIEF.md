# Wanderchess — handoff

## What this is

The ask: "chess except when you select a piece you don't decide where it
moves, it just does a whole random walk of legal moves until it cannot make
another move." That's exactly what's built and it's a complete, playable
game — not a skeleton.

`index.html` is a single self-contained page. Standard 8x8 setup, standard
piece movement (pawns with double-first-step and diagonal capture, knights,
sliding bishops/rooks/queens, king one step any direction). Tap any piece of
the side to move; it then takes a random legal move, recomputes legal moves
from its new square, and keeps hopping — capturing anything in its path,
promoting a pawn that reaches the back rank to a queen mid-walk — until it
has no legal move left. Then the turn passes. A move log on the page records
each walk's full path (e.g. "White knight: b1 → d2 → f3 → ... (took pawn)").

## Decisions

- **No check/checkmate.** Since the player never chooses a destination,
  "leaving yourself in check" isn't a meaningful idea — you can't avoid it on
  purpose. So the win condition is direct: the game ends the instant a walk
  captures a king, and that side loses. This is stated openly in the on-page
  `<details>` rather than silently omitted, because a chess player will
  otherwise wonder where check went.
- **No castling, no en passant.** Both interact with move history / "has this
  piece moved" state that doesn't map cleanly onto a piece that moves several
  times per turn on its own. Cut for scope; noted in the `<details>` on the
  page rather than hidden.
- **Pawn promotion is mid-walk and always to queen.** A promoted piece keeps
  walking as the new queen rather than ending the turn on promotion — this
  was a judgment call for more chaos/fun, not a rules necessity, and is
  called out in the log line ("(promoted)") when it happens.
- **Hard cap of 40 hops per walk.** Without a cap, a piece with no captures
  available can legally bounce between the same two squares forever (e.g. a
  rook shuttling on an open file) — the board state for that piece doesn't
  change if nothing gets captured. 40 hops at 260ms each is ~10s worst case,
  which felt like the right ceiling for "chaotic" without becoming "stuck
  forever." This is a deliberate approximation, not a bug — said so in the
  `<details>` and in the log line when a walk hits the cap.
- **Kept it local/offline.** No ATProto sign-in, no PDS save. The game is
  fully playable and complete without it; adding persistence (below) is a
  clean follow-up, not a missing core feature.

## The plan (if there's a next turn)

Nothing is broken or half-built — this is a genuine stopping point. If
continuing:

1. **Win/loss tracking via the visitor's own repo.** `store.postScore()` on
   game end (`labPds()` from `/_kit/pds.js`), keyed by something like "walks
   taken" or a simple win flag. Sign-in should stay optional — the game works
   fully without it, per the kit's own guidance. This is the natural next
   feature, not a gap in what shipped.
2. **A "why did it do that" toggle** showing the full list of legal moves it
   rolled against at each hop (currently only the chosen path is shown) —
   would help people trust the randomness is real, but is pure polish.
3. **Visual polish**: piece movement is instant square-to-square right now
   (no slide animation), which is fine and fast to read, but a subtle
   transform transition (respecting `prefers-reduced-motion`, which the kit's
   CSS already suppresses) could make walks easier to follow at a glance.
4. **Undo/rewind is deliberately NOT worth building** — the entire point is
   that outcomes aren't chosen, so let it stand.

## Screenshot fix

- The production-CSP screenshot showed the "Game over" modal covering the
  board on first load, with the starting position untouched underneath (no
  moves logged, all 32 pieces present) — the overlay was visible when it
  should have been hidden. Cause: `#overlay { display: flex; }` is an ID
  selector, which beats the shared kit's `.hidden { display: none; }` class
  selector on specificity, so adding `class="hidden"` never actually hid it.
  Fixed by adding `#overlay.hidden { display: none; }` locally in this file's
  `<style>` (can't edit the shared `tokens.css`).

## Gotchas

- `kit.crumb(name)` returns an **HTML string**, it does not take an element
  and inject into it — I initially called it like a DOM helper
  (`kit.crumb(el, name)`), which silently no-ops (wrong signature, no
  thrown error, easy to miss). Ended up just hand-writing the breadcrumb
  markup instead of fighting the API; if you want the real kit crumb, use it
  as `el.outerHTML = kit.crumb('chess-except')` or similar.
- Legal-move generation here is **pseudo-legal only** (no check filtering) —
  that's intentional per the decisions above, not an oversight, but if a
  future ask wants "proper" chess rules layered back in, the king-capture
  win condition and this move generator are the two things that would need
  to change together.
- Board-square sizing on a 360px-wide phone lands each square at ~40px, under
  the 44px tap-target guideline — there's no way to hit 44px on an 8-column
  grid at that viewport without either shrinking the body's side padding or
  accepting a scrollbar, and this build chose neither. Board width is sized
  as a percentage of its container (not `vw`), specifically so it can never
  exceed the padded content area and force horizontal scroll — an earlier
  draft used `min(96vw, 520px)` directly and that overflowed past the body's
  padding on a narrow phone. Worth revisiting if 44px really matters more
  than avoiding a wider page margin.

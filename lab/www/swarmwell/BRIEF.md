# but-grid / Swarmwell

## What this is

The ask: Tetris, but the well is a bit taller than usual, a new piece keeps
dropping in before the one you're steering has landed, and every input you
press affects *every* piece currently in the air at once — not just the
newest one. Named it **Swarmwell** in the page (title/og/headings) rather
than using the trademarked name — see CLAUDE.md's note on `tube-tetris`
about why that matters; the mechanic is unprotectable, the name isn't.

Shipped this turn: a full, playable single-file version. 10×24 well (four
rows taller than the classic 20), up to 4 tetrominoes falling at once, a
piece spawns on its own 2.3s timer independent of whether anything has
landed, and left/right/rotate/soft-drop/hard-drop all act on the whole set
of falling pieces simultaneously. Board is `<canvas>`, controls are both
keyboard (arrows, space, P) and on-screen buttons (44px+, works on a phone).
Best score persists in `localStorage`; no sign-in required or offered.

## Decisions

- **Falling pieces collide with each other, not just the stack.** The naive
  reading of "multiple pieces fall at once" lets them overlap or occupy the
  same cell, which looks like a rendering bug rather than a mechanic. Every
  move/rotate/gravity check for a piece builds a mask of every *other*
  active piece's current cells and treats it exactly like the locked board.
  This is the one part of the build that took real thought — see Gotchas.
- **Capped concurrent falling pieces at 4.** With a 10-wide well, more than
  ~4 pieces in the air simultaneously stops being playable — there's
  nowhere left for a new spawn to fit and every input starts feeling
  random rather than tactical. If a future request wants more chaos, raise
  `MAX_FALLING` in the script — it's the one knob that controls difficulty
  along with `SPAWN_MS` and `gravityMs`.
- **No repo/leaderboard integration.** `/_kit/pds.js` (`labPds`) would let a
  visitor keep a real score history, but a single-player arcade run doesn't
  need sign-in to be complete, and the core mechanic (simultaneous-swarm
  physics) was the thing worth spending the turn on. `localStorage` best
  score is the whole persistence story right now.
- **No ghost piece, no next-piece preview.** Skipped for time, not for a
  design reason — see The Plan.

## The plan (not built yet, roughly in order)

1. **Per-piece "next piece" preview and a ghost/landing indicator** — with
   up to 4 pieces falling, a ghost outline matters more here than in
   ordinary Tetris because the player can't watch one piece's trajectory in
   isolation. Probably render 4 faint outlines, one per active piece,
   computed by running the same `while(!collides...) row++` loop used in
   `dropAll` without committing it.
2. **Optional `labPds` high-score board** — `store.postScore(score, {unit:
   'points', detail: lines + ' lines'})` on game over, gated behind a
   "save this run" button so sign-in stays fully optional. Straightforward;
   just wasn't the hard part this turn.
3. **Tune `SPAWN_MS` / `gravityMs` / `MAX_FALLING` against real play** —
   these three numbers were picked by feel (2.3s spawn, 750ms base gravity
   decreasing with lines, 4-piece cap), not measured against an actual
   human playing. If a follow-up says "too easy" or "too much", these three
   constants are the whole difficulty curve.
4. **Rotation has no wall-kick.** A rotate that would collide is just
   silently rejected per-piece — no SRS-style kick attempts. Fine for a
   first pass; a kick table would make rotation near walls/other pieces
   feel less sticky.

## Gotchas

- The mutual-collision mask is recomputed by scanning `active` fresh on
  every single move/rotate/gravity check rather than cached — with a
  4-piece cap this is trivial cost, but it's an O(pieces²) pattern per
  tick. Fine at this scale; would need caching if `MAX_FALLING` ever grows
  much past single digits.
- Gravity and hard-drop both process pieces **bottom-row-first**
  (`byRowDesc`) each tick/action, not in spawn order. Processing top-first
  would let a piece falling toward one already below it see stale
  (pre-move) obstacle data and pass through on the tick it should have
  landed. Sorting bottom-first each time fixes it; get this ordering wrong
  and pieces visually clip through each other under fast gravity.
- Canvas is a fixed 240×576 bitmap (10×24 cells at 24px), scaled down via
  CSS `width: min(92vw, 300px)` + `aspect-ratio`. Works fine at the sizes
  tested but there's no devicePixelRatio handling, so it'll look soft on a
  high-DPI phone. Cheap fix if it matters: scale the canvas attribute
  dimensions by `devicePixelRatio` and scale the drawing context to match.

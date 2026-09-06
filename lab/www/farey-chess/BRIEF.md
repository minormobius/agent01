# BRIEF — Farey Chess (lab/www/modular-group/)

## What this is

The ask: "imagine modular group chess... chess but its modular forms...
chess on the upper half plane or some weird lattice." No reference link, no
further steer, playfully daring the build to not be told it doesn't make
sense.

What shipped is a real two-player hotseat capture game, not a themed skin.
The board is the tessellation the modular group PSL(2,Z) makes of the upper
half-plane by translates of its classic fundamental domain
(`|z|≥1, |Re z|≤½`). Each tile IS a group element — a 2x2 integer matrix
with det 1, built as a word in the two standard generators `S: z↦−1/z` and
`T: z↦z+1`. A piece's position is literally its matrix. Moving right-
multiplies that matrix by a generator (S, T, or T⁻¹); that's exactly how
you walk the Cayley graph of the group, so this isn't a metaphor sitting on
top of ordinary chess — the move rules ARE the group's own algebra. Landing
on the opponent's exact matrix (compared as PSL elements, i.e. up to
overall sign) captures them and ends the game.

The tessellation is drawn live, not a static image: the boundary of the
fundamental domain is sampled as ~20 points and each visible tile is that
same set of points pushed through its matrix's Möbius transform. Curved
edges are curved because a Möbius image of a line generally IS an arc — no
special-casing was needed, the math does it for free.

## Decisions

- **Right-multiplication as the move rule**, not left. `M · Gen` places you
  at "the Gen-neighbor as seen from your own current tile's frame," which
  is the standard right Cayley graph and is what makes repeated same-button
  presses (e.g. T, T, T) walk visibly outward in one direction rather than
  bouncing between two tiles.
- **No move restriction (no anti-backtrack rule).** S has order 2 and T,T⁻¹
  are mutual inverses, so pressing S twice or T then T⁻¹ returns you to
  where you started — allowed on purpose, it's a legal "pass" and adds a
  real retreat option rather than forcing forward progress.
- **Group relations are handled for free, not specially coded.** Tiles are
  deduped by canonical matrix key (sign-normalized), so when a sequence of
  moves lands back on an already-seen matrix — e.g. via the real relation
  `(ST)³ = 1` — it just IS that same tile again on the board. This is the
  actual mathematical structure showing through, not a bug to guard against.
- **Only PSL(2,Z), not the full extended modular group.** The classic
  two-colour "keyhole" tessellation picture most people have seen also
  includes orientation-reversing mirror copies (needs `z ↦ −z̄` or similar).
  This board only has S and T, both orientation-preserving, so every tile
  is congruent rather than alternating with its mirror image. Said
  explicitly on-page rather than silently presenting it as "the" modular
  tessellation.
- **Black starts 3–4 group-moves from White (identity)**, chosen randomly
  from the pre-explored field each new game, rather than a fixed matchup —
  keeps games short (this is a pursuit game, not a slow opening) while
  still varying.
- **No ATProto/pds.js integration.** This is a same-screen two-player game
  with no obvious "your own record" to save (no single-player score, no
  natural leaderboard subject the visitor would name). Sign-in would have
  been decoration, so it was left out per "optional unless meaningless
  without it."
- **Three piece types by generator subset, not three different movement
  models.** Considered a "double move" piece (apply two generators per
  turn) for more differentiation, but that would have meant a second,
  incompatible notion of "one move" in the same engine. Restricting *which*
  generators a piece may use, with every move still exactly one
  right-multiplication, kept `legalMoves`/`performMove` a single code path
  for all three types.
- **White's three pieces start at the identity, its S-neighbour and its
  T-neighbour** (adjacent tiles) rather than spread out, so Rider/Flipper/
  Slider all start visibly clustered and readable as "one army" on a small
  board. Black's three get `pickStarts(3, excludeKeys)` — distinct nodes,
  preferring depth 3–6, excluding anything White already occupies. Type
  assignment to Black's three start nodes is fixed order (Rider, Flipper,
  Slider) rather than randomized — simpler, and there was no reason found
  to prefer shuffling it.

## The plan — not built yet, roughly in order

**Turn 2 (this turn) shipped multiple pieces per side**, directly in
response to the requester's "this is basically just king vs king? chess
needs more pieces". Each side now has three pieces — Flipper (`{S}` only),
Slider (`{T,T⁻¹}` only), Rider (all three) — placed on distinct tiles.
Select-then-move: tap your own piece (canvas ring, or a button in
`#pieceButtons`) to select it, then tap a dashed tile or a move button.
Capture removes the enemy piece from its array; winning is wiping out the
other side's whole army rather than one king-catch. `legalMoves(side, idx)`
also now blocks moving onto your *own* piece's tile — that case didn't
exist with one piece per side and needed adding. If both sides still have
pieces but the side to move has no legal move anywhere (a lone Flipper
whose one neighbour is occupied by its own Slider, say), `ensureMovableSide`
auto-passes the turn rather than freezing the game.

Per-piece move-word history was **dropped**, not carried over — with three
pieces per side, "White: T S T⁻¹" stops meaning anything without saying
*which* piece, and there wasn't time this turn to design that display well.
The positions panel instead lists each living piece's type, move count and
matrix. If move history is wanted back, it needs to be per-piece
(`piece.wordHistory`), not per-side.

1. **A fourth piece / composite-generator move**, e.g. `U = S·T` as a
   "diagonal" move for a new piece type, distinct from Flipper's flip and
   Slider's shift. The engine is generic enough (`PIECE_TYPES[x].gens` is
   just a list of keys into `GENS`) that this is mostly picking a good
   generator and a name — the hard part is still UI legibility with a 4th
   piece button row plus dashed tiles on a small phone screen.
2. **Per-piece move history**, if wanted: replace `piece.moves` (currently
   just a count) with an array of generator letters, and update
   `renderPositions` to print it per piece instead of just the count.
3. **The orientation-reversing half**, if wanted: add a fourth generator
   `R: z ↦ −z̄` (needs treating points/matrices as acting with an optional
   conjugation flag, since R isn't a Möbius map representable as a plain
   PSL(2,Z) matrix) and render mirrored tiles in the second colour. This is
   the actual "hard part" flagged in the on-page copy as skipped — don't
   fake it with a plain colour toggle, the geometry really does need the
   conjugate.
4. **Persistence**: post a completed game's result (winner, move counts) to
   the visitor's own repo via `/_kit/pds.js` if a save/resume feature is
   ever asked for. Still skipped — this is same-screen hotseat with no
   natural single-player metric.

## Gotchas

- **Screenshot pass (2026-09-06) caught a real crash, not a style issue.**
  The init block called `resize()` before `newGame()`. `resize()` ends by
  calling `render()`, which reads `posW`/`posB`/`turn` — but those are only
  `let`-declared, still `undefined`, until `newGame()` runs. That sent
  `undefined` into `legalMoves()` → `matMul(undefined, ...)` → `undefined[0]`,
  which is exactly the "Cannot read properties of undefined (reading '0')"
  the error banner showed, and it left the board frozen forever on "Loading
  the tessellation…" with no tiles ever drawn. Fixed by swapping the two
  calls so game state exists before the first render.
- **Canvas fillStyle can't take a raw CSS var() string in a 2D context
  reliably in every engine** — read the custom property via
  `getComputedStyle(...).getPropertyValue('--tileA')` instead
  (`getVar()` helper) rather than passing `'var(--tileA)'` directly to
  `ctx.fillStyle`. Left an early draft with a broken ternary doing this
  wrong; fixed before shipping, but worth remembering if you add more tile
  colours.
- **`legalMoves()` is called from inside `drawBoard()` every render**,
  which calls `ensureNode()` on the fly for the 3 candidate next tiles —
  this is intentional lazy graph growth (the initial BFS only pre-fills
  ~140 nodes) rather than a bug, but it does mean `nodes` grows slowly
  forever during a long game. Not a real problem at this scale; would want
  a cap/eviction if this becomes a much longer-running page.
- **Matrix entries are kept as plain JS numbers, not BigInt.** Fine for the
  ~140-node initial field and ordinary play (entries stay well under
  2^53), but a very long single-direction run (mashing T fifty times) will
  eventually lose exactness. Not guarded against; flag it if someone
  reports drift after an unusually long game.
- The canvas resize math (`resize()`) computes CSS pixel dimensions and a
  separate devicePixelRatio-scaled backing store, then relies on
  `ctx.setTransform(dpr,...)` so every drawing call still uses logical
  coordinates. If you touch sizing, keep that split — mixing backing-store
  and CSS-pixel coordinates anywhere is the classic way this kind of canvas
  code goes blurry or misaligned on a phone.

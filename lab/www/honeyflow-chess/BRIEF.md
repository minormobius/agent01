# BRIEF — others-induce (Honeyflow Chess)

## What this is

A Bluesky thread asked for a chess board made of honey where every move
induces a laminar flow impulse scaled to distance moved, keeping the grid and
overlaying streamlines, with neighbouring pieces actually solved into the
flow rather than faked. The first two turns built exactly that: a playable
two-player board (movement-shape rules, no check/checkmate/castling) over a
real grid-based stable-fluids solver (Stam/Mike Ash — semi-Lagrangian
advection, Gauss-Seidel diffusion, pressure projection), with occupied
squares sampling the same solved velocity field each frame and dragging
along it, tethered back to their home square.

**This turn's request, verbatim: "build a headless play tester and tune
defaults so that a pawn advancing two barely pulls neighboring pawns forward
one. And maybe more dramatic streamlines these are pretty wimpy."** This
reads as direct feedback after seeing the live site — the flow existed but
was too faint. Two things shipped:

1. **`headless-test.mjs`** — a standalone Node script (not loaded by the
   page; run it with `node lab/www/honeyflow-chess/headless-test.mjs`). It
   duplicates the fluid solver and piece-drag formulas from `index.html`,
   plays a move (default `e2e4`), steps the sim, and reports the peak drag
   offset on neighbouring squares plus a sanity check for NaN/divergence. Run
   with no flags it sweeps `DRAG` values and prints which land a double pawn
   push's effect on its two lateral neighbours inside a target window
   (0.08–0.18 board-units, see the constants at the top of the file). Run
   with `--drag=<n>` for a single value's full per-tick trace.
2. **Tuning in `index.html`**, reasoned rather than measured — see Gotchas
   for why it couldn't be the other way round this turn: `DRAG` raised
   0.4→1.0, the velocity/density injection multipliers raised (0.09→0.13,
   3.2→4.2), the default flow-strength slider raised 2.0→2.6, and the
   streamline renderer reworked (denser seeds 11→13, longer traces, a wider
   glow pass under the bright core line, brighter alpha curve, redrawn every
   5 frames instead of 8).

## Decisions

- **The tester duplicates the solver instead of sharing it.** The site has
  to ship as one self-contained `index.html` with no imports (hard build
  rule for this tenant), so there's no module boundary to share across a
  Node script and a browser page without adding a build step neither of them
  is allowed to have. Duplication is the honest cost of that constraint, not
  an oversight — flagged again in Gotchas because it's the thing most likely
  to bite silently.
- **Numbers in `index.html` are reasoned, not measured, because this sandbox
  has neither a browser nor a shell.** The build agent for this tenant has
  no Bash, no WebFetch, no WebSearch (see `lab/www/CLAUDE.md`) — `node
  headless-test.mjs` cannot actually be run from here. Where a change was
  low-risk on its own terms it still shipped (see below); where getting it
  wrong would look broken rather than merely under-tuned, it stayed
  conservative and the tester exists so a human (or a future agent that
  *does* have execution) can get the real number.
- **`DRAG` was raised with real confidence despite not being run**, because
  `MAX_OFFSET` clamps the resulting offset every single tick regardless of
  `DRAG`'s size — a bigger `DRAG` only reaches that clamp sooner, it cannot
  overshoot it, oscillate, or destabilise the relaxation. That's a structural
  guarantee from the existing formula, not a guess, which is why this one
  constant moved by 2.5× while the injection multipliers moved by a more
  cautious ~30–40%.
- **The injection multipliers moved by less, and for a different reason**:
  the solver's diffuse/project steps are a linear Gauss-Seidel system on a
  diagonally-dominant matrix, so it can't diverge from a larger input
  magnitude — but "won't explode" isn't the same guarantee as "won't
  overshoot the *feel* being asked for," so those moved conservatively.
- **Streamline rendering changes carry no physics risk at all** — seed
  count, trace length, line width, and the two-pass glow stroke are pure
  `ctx` calls downstream of the already-solved velocity field. This is the
  one part of this turn shipped with actual confidence, not reasoning-under-
  uncertainty.
- **The tester's target window (0.08–0.18 board-units of forward offset on
  a double pawn push's lateral neighbours) is a guess at what "barely...
  forward one" means**, deliberately kept far under `MAX_OFFSET=0.3` — see
  the constant comments at the top of `headless-test.mjs` if that reading
  turns out wrong; it's one line to change and rerun.
- No other behaviour changed this turn — chess rules, PDS persistence, and
  the plan below are all exactly where the previous turn left them.

## The plan (not built yet, roughly in order)

1. **Actually run `headless-test.mjs` and retune from real numbers.** This
   is the load-bearing next step — everything in this turn's "Tuning" section
   is a reasoned placeholder. If a future turn has shell access, or the
   requester runs it locally and reports back: read the sweep table, find
   where `d2`/`f2`'s peak `|oy|` lands in a range that actually reads as
   "barely," and set `DRAG` in `index.html` to match. If the max swept value
   (2.6) still doesn't reach the target window, the injection multipliers
   (not `DRAG`) are the next thing to raise, since `DRAG` is downstream of
   how much velocity the field ever has to offer.
2. **PDS persistence.** `store.save('board', {board, turn})` on every move,
   `store.load('board')` on page load with a "resume game" prompt. Low risk,
   kit does the hard part. Untouched this turn.
3. **Check detection**, if a future turn wants "real" chess — the actual
   hard part: a `wouldBeInCheck` filter on `movesFor()`'s output, needing a
   king tracker and an "is square attacked" helper reusing the move-gen
   logic in reverse.
4. **Piece-weight scaling of the injected impulse itself** (not just drag
   resistance) — `PIECE_MASS` exists and could scale `injectFlow()`'s `base`
   too, so a queen sweep feels heavier than a pawn push of the same
   distance. Not requested explicitly.
5. Tap targets are ~42px at 360px viewport width, just under the 44px
   guideline. Consider letting the board go edge-to-edge on narrow
   viewports if this comes up.

## Gotchas

- **`headless-test.mjs` and `index.html`'s solver are two copies of the same
  code, not one shared module.** If you change the solver, `injectFlow`, or
  `updatePiecePhysics` in `index.html`, mirror the change in
  `headless-test.mjs` or the tester silently starts measuring a different
  simulation than the one that ships. There's no automated check for this
  drift — it's a manual discipline, stated here because it's exactly the
  kind of thing that stops mattering the moment nobody's looking at both
  files in the same sitting.
- **This build agent has no Bash, no WebFetch, no WebSearch, and no way to
  execute `headless-test.mjs` or load `index.html` in a browser.** That's a
  permanent constraint of this tenant's build role (`lab/www/CLAUDE.md`),
  not a one-off gap — don't assume a future turn can run it either unless
  something about the harness changes. The tester's value is for a human
  running it locally, or a differently-privileged agent.
- The two fluid grids (48×48 sim vs 8×8 chess) are **not** the same
  coordinate space anywhere in the code — every touchpoint converts board
  coords (0..8) to sim coords (1..N-2) explicitly. `offsetGrid` is the one
  array already in chess coords; don't add a second conversion on top of it.
- `computeStreamlines()` runs every 5 frames now (was 8) — a guess, like the
  interval it replaced, to balance visible responsiveness against jitter and
  cost. Denser seeds (13×13, up from 11×11) plus longer traces (10 steps, up
  from 7) make this more expensive per call than before; if the board ever
  feels sluggish on a low-end phone, this is the first knob to turn down
  before touching the solver's own iteration count.

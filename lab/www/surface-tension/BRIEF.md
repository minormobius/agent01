# BRIEF — conceptualize-design ("Surface Tension")

## What this is

norvid-studies.bsky.social pitched "liquid"/"gas" versions of every video game
and asked `@buildthis.bisks.net` to build "liquid chess"; that other bot shipped
`liquidchess.bisks.net` (droplets via an SVG goo filter, dissolve on capture,
king-capture-wins). Turn one of this site built an independent implementation
of the same brief: a full local two-player chess variant with droplet pieces.

**This turn, the requester replied directly**: "interesting first pass but why
don't you start from the ground up with something thats more 'liquid themed'
but still keeping the general chess moveset and goals/rules." That is an
explicit instruction from the site's owner, not thread noise — it says keep the
rules, redo the visuals from scratch because the first pass wasn't liquid
enough.

Turn one's "liquid" was an SVG `feGaussianBlur` + `feColorMatrix` filter over
plain circles — a blur trick, not actual liquid behaviour. This turn replaces
that whole rendering layer with a real scalar (metaball) field: every same-team
piece contributes `r²/d²` to a low-resolution field grid, and that field is
displayed via a threshold-and-smoothstep alpha, upscaled onto a canvas with
bilinear smoothing. Pieces genuinely merge based on actual distance rather than
a filter radius, and the low-res-to-high-res upscale supplies the soft edge
that used to come from `feGaussianBlur`, for less GPU-filter cost. Added on top
of that: a critically-damped glide when a piece moves (was a CSS transition,
now a per-frame spring so the glyph and the blob move in lockstep every frame),
an expanding ripple ring at the landing square, and a 10-particle splash burst
plus a shrinking dissolve field-contribution when a piece is captured — so a
capture reads as the piece draining away and spattering, not just fading out.

The chess engine itself (board state, `legalMoves()` per piece type, turn
handling, no check/checkmate, king-capture-wins, auto-promote to queen) is
**unchanged from turn one** — the request said keep the moveset and goals, and
that logic was already correct, so nothing there needed rewriting.

## Decisions

- **Canvas + metaball field, not a second SVG filter.** The requester's
  complaint was specifically that the *look* wasn't liquid enough. A blur
  filter always looks like blurred circles; a field that pieces actually
  contribute to based on distance is what makes two droplets read as touching
  and merging rather than just softened. This is the "hard part" of the turn —
  everything else (ripples, splash) is straightforward once the field exists.
- **Interaction stays on SVG, rendering moved to canvas.** Three stacked
  layers in `.board-wrap`: `#board` (bottom, squares, receives clicks),
  `#liquid` (canvas, `pointer-events: none`, draws the metaball pieces),
  `#overlay` (top, `pointer-events: none`, selection ring / legal-move markers
  / glyph text). `pointer-events: none` on the top two means clicks fall
  straight through to the square rects underneath — verified by reasoning
  through the spec (removed from hit-testing entirely, browser tries the next
  element down), not by loading a browser. Watch this first if clicks ever
  stop registering.
- **Glyphs stayed in SVG, not drawn on canvas.** Crisp text is what keeps a
  piece's type legible regardless of how aggressively the blob under it melts
  into its neighbours — same reasoning turn one used for the SVG glyph layer,
  still correct after the rendering rewrite.
- **Field constants are hand-tuned, not derived.** `r² × 2.2 / d²`, threshold
  window `smoothstep(0.55, 1.05, field)`. Worked out on paper (see Gotchas) to
  give roughly a 1.4×-nominal-radius solid core with a soft halo reaching to
  about 2× radius — enough that a back-rank piece and the pawn in front of it
  (one square apart) show a visible connecting glow without their solid cores
  fully fusing. Never seen in a real browser.
- **No login, no persistence** — same reasoning as turn one, this is a local
  pass-and-play game and doesn't need to know who the visitor is.

## The plan (not built yet, roughly in order)

1. **Confirm the field constants actually look right, then tune them.** This
   is the first thing to check against the harness screenshot. If pieces look
   like they're barely-there hazy blobs, raise the multiplier or narrow the
   smoothstep window; if adjacent same-team pieces fully fuse into a solid
   mass everywhere (not just at the start position), lower it. The math is
   worked through in Gotchas below so the next agent isn't starting blind.
2. **Castling, en passant, promotion-choice UI** — all still exactly where
   turn one's plan left them (structure supports them, `legalMoves()` is one
   function per piece type). Deferred again this turn because the explicit ask
   was the visual rewrite, not new rules.
3. **Board itself could get more liquid treatment** — right now only the
   pieces are liquid; the squares are still flat chess-board colours (just
   retinted slightly bluer). A subtle animated caustic/shimmer under the board
   (a couple of slow-drifting radial gradients) would extend the theme to the
   whole board, not just the pieces. Cut for time this turn.
4. **Optional save-to-repo via `/_kit/pds.js`** — still optional, still not
   built, still worth asking about rather than assuming.

## Gotchas

- **Never loaded in a real browser.** The field-blob look, the spring glide,
  the ripple/splash timing — all reasoned through, none seen. The harness
  screenshot after this build is the first real look; if pieces look wrong
  (too faint, too solid, wrong size relative to their square), the fix is in
  `paintField()`'s kernel multiplier (`2.2`) and the `smoothstep(0.55, 1.05,
  ...)` window, not a structural rewrite.
- **The size/merge tradeoff is a real constraint, not a bug to "fix" away.**
  For two same-team pieces one square apart (distance 100) to show *any*
  visible connection, the field has to extend well past each piece's nominal
  radius — that's inherent to how metaballs work, not a tuning mistake. A
  version that keeps pieces tightly sized to their `RADIUS` value will simply
  never show adjacent-piece merging; that trade was made deliberately in
  favour of the "surface tension" look the site is named for.
- **The old SVG `<g class="goo-layer" filter="url(#goo)">` groups and the
  `<defs><filter id="goo">` block are gone.** If a future ask wants the blur
  filter back for some effect, it isn't lying around commented out — it would
  need re-adding from turn one's version in git history.
- **`FIELD_RES = 80`** (an 80×80 grid, redrawn every animation frame while
  motion is enabled) is a guess at a cost/quality balance, not a measured one
  — no way to profile without a browser. If the harness reports jank, that's
  the first knob to turn down.
- **No check/checkmate is still deliberate**, unchanged from turn one — don't
  add it without the requester asking.

## Turn 2 update (2026-09-27)

Request this turn: "kinda wanted it to just run automatically" — a follow-up on
turn 1's manual tap-two-endpoints tool. Added a **"Run automatically"** toggle
button next to Reroll/Fit: while on, it runs a fixed-interval loop
(`autoTick`, every 450ms) that calls `autoStep()` — a randomised search over
free-endpoint pairs and random extension lengths, committing the first
candidate that passes the exact same `checkValidity` the manual path uses —
via a new shared `finalizePlacement()` that both `commitSegment()` (manual)
and `autoStep()` (auto) now call, instead of duplicating the touched-flags/
tick-recording logic. Manual endpoint-tapping is disabled while auto-run is
on (`onTipClick` early-returns) so the two input paths can't collide; Reroll
stops auto-run first.

Auto-run stops itself on three distinct conditions, each with its own message
(folded into the existing `stuckMsg` box via a new `autoNote` string so
`updateStatus()` has one place that decides what to show): genuine terminal
state (reused from turn 1, unchanged), a **safety cap at 250 segments**
(arbitrary, just to stop an unattended run growing forever), and — the
common case — 400 random attempts in a row all rejected. That third one is
explicitly worded as "couldn't find a move," not "no move exists": this is a
randomised search, not the exhaustive proof turn 1's BRIEF already flagged as
unbuilt (see plan item 1 below, still unbuilt, still the same reason). Said
this on-page too, in the rules panel, not just here — the standing pattern
in the profile for anything with a resolved ambiguity or an honest
approximation.

Didn't add a speed control or attempt count display — turn budget went to
making the loop itself correct and non-colliding with manual mode. Worth
adding if a follow-up wants control over the pace or wants to see how many
tries a stuck-search actually took.

## What this is

The request: "place a line segment, unit length, and another segment at a
random angle making contact somewhere along its length with an endpoint of
the first segment. from then on every additional segment must touch the
thus-far-untouched endpoints of two other segments, w/ no other
intersections." No reference link, no further steer — a bare geometric
construction rule, in the same terse style this requester uses for math/CA
asks (see `lab/_profiles/ponder.ooo.md`).

Shipped a working interactive builder, "Loose Ends" (an SVG canvas), not a
static diagram:

- Segment 1: unit length, fixed at canonical position (translation/rotation
  of it is meaningless, so no reason to make it interactive).
- Segment 2: auto-generated — random angle, random length (0.6–1.6), and a
  random interior point along its own body made to land exactly on one of
  segment 1's endpoints (a T-junction, matching "contact somewhere along its
  length," not at segment 2's own tip).
- Segment 3 onward: the visitor taps two untouched endpoints belonging to
  two *different* existing segments, then two sliders (+ numeric inputs,
  synced) set how far the new straight segment runs past each of them. Live
  validity check against every other segment; the "Place segment" button is
  disabled until the candidate touches only the two chosen points and
  nothing else. Ext = 0 on a side means that tip is consumed too (a plain
  joint, not a T).
- Pan (drag/one-finger), pinch-zoom (two-finger) and wheel-zoom on the
  canvas, plus a Fit-view button, per this requester's established
  preference for real pan/zoom on renderer-style tools (see the
  apply-inverse follow-up in the profile).
- Auto-fit after every reroll/placement; manual pan/zoom persists until the
  next structural change.
- localStorage autosave/restore always on. Optional sign-in
  (`/_kit/pds.js`) additionally saves one named snapshot
  (`com.minomobi.lab.doc`, key `construction`) to the visitor's own repo —
  entirely optional, the tool is fully usable without it.
- Detects and announces the one real terminal state: fewer than two
  segments still have a free endpoint, so no new segment can touch "two
  *other* segments." That is a genuine property of the construction, not a
  bug — the page says so and offers Reroll.

## Decisions

- **Read "a random angle" as the tool's choice, not the visitor's.** A
  person placing a segment is making a choice; only a system can be asked
  to be "random." So segments 1–2 are auto-generated and the visitor's first
  real choice is segment 3. Said this explicitly in the on-page rules panel
  (not just here), following this requester's established "surface a
  resolved ambiguity on the page itself" pattern (domino-upright,
  cyclotomic-Littlewood, etc.).
- **From segment 3 on, direction is *forced*, not random.** The request
  only calls the *second* segment's angle random; every later segment's
  line is determined by the two points it welds, so the only remaining
  freedom is which pair to pick and how far to extend past each — that's
  exactly what the UI exposes and nothing more.
- **"Touch" targets are always *endpoints*.** Re-read: "touch the
  thus-far-untouched endpoints of two other segments" — the touched thing
  is always another segment's endpoint, never an arbitrary interior point.
  So every weld targets exactly two existing endpoints; what varies is
  whether the *new* segment's own body treats that point as interior
  (T-junction, tick mark drawn) or as its own tip (extension = 0, plain
  joint, no tick).
- **Colinear overlap is treated as invalid, always** — even against the two
  segments being welded. A straight line touching another at exactly one
  point is a legal weld; two segments running along the same line for any
  positive length is an overlap, which is not "a touch" under any reading
  of the rule, so it's rejected with a specific "runs along the same
  line" message rather than silently allowed or silently merged.
- **No CARD.json.** This is a tool that means nothing until you tap it —
  the screenshot of it mid-construction is the honest advert, not a
  generated image, matching the standing "screenshot IS the advert" note
  in the profile for interactive builds.
- Named it "Loose Ends" rather than anything more generic — no trademark
  risk here (this isn't based on a named existing game), just picked
  something that reads clearly from a link card.

## The plan (not built yet, in order)

1. **No proof of "no valid pair exists."** Turn 2 added a *heuristic*
   version of this (auto-run's "couldn't find a move in 400 tries" message)
   but that is still a randomised search, not a proof — it can and will give
   up on constructions that do have a valid move somewhere it didn't happen
   to sample, especially once extensions need to be long or narrowly ranged
   to clear everything. A real proof needs, per free-endpoint pair, the
   actual set of extension values that stay valid (each other segment
   excludes some interval via the line intersection, so it's an interval-
   subtraction problem per pair, not a sample) — and only if EVERY pair's
   surviving interval is empty is the construction actually stuck. That's
   the real fix, still not built.
2. **No keyboard path to pick endpoints.** Selection is pointer-only
   (pointerdown on an SVG hit-circle) — a screen-reader/keyboard user can
   read the rules and status via the live region, but cannot actually place
   a segment. Fixing this needs real focusable targets (e.g. a hidden
   `<button>` overlay per untouched endpoint, or a listbox of "endpoint N of
   segment M") rather than bare SVG shapes; didn't attempt it this turn
   because it changes the whole hit-testing approach and the turn budget
   went to the geometry engine and the pan/zoom.
3. **Extension sliders top out at 4 world-units**, arbitrary. Fine for
   normal use; if a future request wants very long "spokes," raise the cap
   or make it adaptive to the construction's current bounding size.
4. **No way to delete/undo a placed segment** short of reroll or manually
   editing localStorage. An undo stack (pop the last segment, restore the
   two touched flags it set) would be the natural next feature if asked
   for — the state shape already makes this easy (segments/ticks are plain
   arrays, touched flags are the only shared mutation to reverse).

## Gotchas

- **The "designated touch" exception in the validity check has to come
  *after* the colinear check, not before**, or a segment that overlaps
  (rather than just touches) one of its own two welded segments would
  silently pass. Order matters in `checkValidity`: colinear-overlap always
  fails first; only a genuine single-point touch gets the sa/sb exemption.
- **`segSegIntersection`'s colinear branch needs its own near-zero-range
  case.** Two colinear segments meeting at exactly one point (e.g. a new
  segment continuing straight on from an old one) are NOT an "overlap" —
  only ranges with real positive length in common are. Missed this on the
  first pass mentally and had to fold a `hi - lo < 1e-4` check into the
  colinear branch so a straight continuation reads as a legal touch, not a
  rejected overlap.
- **`fitView()` already renders** (it calls `applyView()`, which calls
  `render()`); an early draft had an extra explicit `render()` after every
  `fitView()` call and after `recomputeCandidate()` (which also renders at
  its own end). Removed the redundant calls — if you add a new call site
  that both fits the view and wants to render, it doesn't need a second
  `render()` afterward.
- **Radii for the endpoint dots/hit-circles are computed in world units
  from the current pixel scale every render**, not fixed — because the
  SVG's `viewBox` is what's zoomed, a fixed-radius `<circle>` would grow or
  shrink on screen with every zoom step. If you add new interactive shapes,
  follow the same pattern (`N_px / scale`) rather than hardcoding a radius.
- Untested in an actual browser by me (no network/shell in this sandbox) —
  the harness's screenshot pass is the first real look. If dots don't look
  tappable at the default zoom, the likely fix is bumping the `8`/`22` px
  constants in `render()`, not the geometry.

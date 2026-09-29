# BRIEF — domino-upright

## What this is

The request, verbatim: "domino CA. 4 upright orientations (projectivized
moore neighborhood), 8 directional 'falling' states. falling transitions to
a single 'fallen' state. each upright has 2 fallings it can transition to
if it has falling neighbors not orthogonal to it & not pushing in opposite
directions."

That's a cellular automaton spec for a grid of toppling dominoes, terse
enough that most of the actual design work is choosing a concrete,
internally-consistent reading of it. Acceptance list, extracted:

1. Cell states: UPRIGHT with 4 orientations (the projectivized 8-direction
   Moore neighborhood — 4 *lines* through the center: E–W, NE–SW, N–S,
   NW–SE), FALLING with 8 directional states (one per Moore-neighbor
   direction), and a single terminal FALLEN state. (Plus EMPTY, needed as a
   base state — not explicit in the ask but required for any non-trivial
   grid.)
2. FALLING → FALLEN unconditionally, every step (no condition stated for
   this one, only for UPRIGHT → FALLING).
3. Each UPRIGHT has exactly 2 candidate falling directions, and transitions
   into one of them only when a falling neighbor's push is "not orthogonal"
   and "not pushing in opposite directions" relative to it.
4. It's a CA, so it needs to actually run — a grid, a step function invoked
   on a timer, and a way to seed/perturb it (the ask doesn't say
   interactive, but an unplayable rule table isn't a site).
5. Render all four states legibly (orientation and direction need to be
   visually distinguishable at a glance).

Shipped: all five. Canvas-based grid, real per-cell CA computed each tick
(no shortcuts, no pre-baked animation), click-to-edit / drag-to-topple
interaction, play/pause/step/speed/density/clear controls, and an on-page
"the rule, precisely" panel that states the interpretation in the same
terms as this brief — because the source text is genuinely ambiguous and
hiding that would be dishonest.

## Decisions

**The interpretation of the transition rule, spelled out because it's the
one thing a future reader can't verify by staring at the request text:**

- Orientation axis `k` (0–3) owns Moore directions `{k, k+4}` (out of 8,
  45° apart: 0=E,1=NE,2=N,3=NW,4=W,5=SW,6=S,7=SE). Its two candidate
  falling directions are the *perpendicular* axis's two directions,
  `F1=(k+2)%4` and `F2=F1+4` — physically: a domino topples sideways off
  its own long axis, not off the end.
- A neighbor at relative direction `d` "pushes" this cell iff it is FALLING
  with direction `f=(d+4)%8` (its fall vector points exactly at this cell).
  Collect the set of such incoming push directions.
- For candidate `Fi`, "not orthogonal to it & not pushing in the opposite
  direction" is read literally: a push `f` supports `Fi` unless `f` is
  exactly ±90° (`Fi±2`) or exactly 180° (`Fi+4`) from `Fi`. That is, it
  excludes exactly the two things the sentence names and nothing more.
- If exactly one of `F1`/`F2` ends up supported, it falls that way. If
  *both* are supported — which happens for any diagonal-direction push,
  since a diagonal push is neither orthogonal nor opposite to *either*
  straight candidate — treat that as "pushing in opposite directions"
  (F1 and F2 are literally opposite each other) and stay upright: the
  push is ambiguous, so nothing happens. Net effect, worked through by
  hand: a push arriving **exactly along** F1 or F2 gives a clean,
  deterministic topple in that direction; anything else (orthogonal,
  opposite, or diagonal/ambiguous) does not. That's a coherent, computable
  rule and it's the one implemented — not the only legal reading of the
  prompt, but a considered one, and it's documented on-page in the same
  words so nobody has to reverse-engineer it from the JS.

**Canvas over DOM/SVG grid**: cell count can run into the thousands;
canvas redraw is the only approach that stays smooth at 60fps on a phone.

**Tap vs. drag as two different tools on the same cell**: a plain tap on an
EMPTY/UPRIGHT cell cycles it through the 4 axes then back to empty (the
"paint your layout" tool); a drag starting on an UPRIGHT cell topples it,
picking whichever of its two legal directions is closer to the drag vector
(short drags default to F1). This means both of the "2 fallings" a domino
can take are directly reachable by hand, which seemed important to
demonstrate given that's the headline mechanic of the request.

**No registry/index/CI touches** — out of scope per the build boundary,
confirmed nothing outside `lab/www/domino-upright/` was written except the
profile note.

## The plan (what's not built)

Given the scope, this is close to complete for a first pass, but if there's
a next turn:

- **A "kick" tool for cascades**: right now starting a chain reaction means
  manually dragging one domino per row edge. A one-click "topple the left
  edge" / "topple a random upright" button would make demoing a long
  cascade much faster, especially on the phone layout where drag precision
  is worse.
- **Grid size control**: cols/rows are currently picked once at load from
  `window.innerWidth` and fixed for the session. A slider to regenerate at
  a different density (and a resize-preserving-state path) is the obvious
  next knob, in the same spirit as the chladni-sim panel's sliders.
- **Toroidal/wrap-around option**: currently bounded edges only (an
  off-grid neighbor simply can't push). Wrapping would make sustained
  cascades and periodic patterns possible, which might be worth exposing as
  a checkbox rather than a default.
- **Alternate rule reading as a toggle**: since the transition rule admits
  more than one honest reading (see Decisions), a "strict" mode requiring
  the push to land within 45° of the candidate direction (excluding the
  diagonal-ambiguous case entirely rather than resolving it to "stays put")
  would be a cheap, interesting variant to expose side-by-side.

## Gotchas

- The biggest trap here was **the rule text supporting several
  self-consistent-looking readings that behave very differently** — see
  Decisions above for the one that was rejected (treating "orthogonal to
  it" as orthogonal to the domino's own *axis*, which turns out to exclude
  exactly the straight-on hit that should be the primary way a domino
  chain-reacts). Worth reading that section before changing the rule, not
  just re-deriving it from the prompt fresh.
- Axis-to-direction indexing is `axis k ↔ directions {k, k+4}` — i.e. the
  first four of the eight Moore direction indices double as the axis
  indices. It's a nice simplification but easy to accidentally break if a
  future edit changes the direction-index order without updating the axis
  mapping to match.
- Progress/animation for a FALLING cell is driven off wall-clock time
  since the last CA tick (`(now - lastStepTime) / tickMs`, clamped to 1),
  not a counter — so changing the speed slider re-times the *current*
  in-flight animation rather than only affecting future ticks. That's
  intentional (feels responsive) but worth knowing if a "steps to fall"
  concept ever gets added.

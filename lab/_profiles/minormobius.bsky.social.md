# @minormobius.bsky.social

## First build
`want-pairwise` (2026-07-27): a two-handle Bluesky interaction comparator
presented as a Venn diagram, overlap emphasized. Requested in plain, terse
language over a Bluesky thread — short spec, no back-and-forth yet, so this
entry is thin. No stated palette or layout preference beyond the request
itself; the build used the kit defaults (`tokens.css` unchanged apart from a
second accent color added locally for the second circle, per kit's own
"override a token in a local `<style>` block" allowance).

## Second pass — standing defaults, not one-off feature requests
`want-pairwise` (2026-07-27, iteration 2): "Handle typeahead. Always always
always do handle typeahead in those entry boxes. And graphs! Always give us a
big shiny copy image button baby we need to copy the graph." The repeated
"always" reads as a durable preference for every future site, not a one-time
ask for this one:

- **Any input where the visitor types a Bluesky handle should offer live
  typeahead suggestions** (`app.bsky.actor.searchActorsTypeahead`, debounced,
  sequenced against stale responses), not just plain-text entry.
- **Any chart/diagram/graph should carry a prominent "copy image" action** —
  they used "big shiny" explicitly, so this should look like a highlighted
  primary action (gradient/glow treatment), not a quiet icon button tucked in
  a corner. If the graph is DOM/CSS rather than canvas or SVG, render an
  equivalent snapshot to a canvas for the copy rather than skipping the
  feature because the live version isn't canvas-based.

Default to both on any future site for this requester that has a handle-entry
field or a graph, without waiting to be asked again.

## Third pass — actually uses what ships, catches subtle bugs
`want-pairwise` (2026-07-28, iteration 3): reported two real bugs from using
the copy-image feature, not just a stylistic ask — this requester tries a
built feature end-to-end and notices races/rendering issues a build agent
can't see without a browser, and describes them precisely enough to diagnose
(e.g. "the first time I tried it copied the graph of the last generation" was
enough to find a genuine submit-race, "Cached??" was their own correct-ish
instinct about the mechanism). Worth pre-empting on future builds rather than
waiting for the report:
- Any button that fires a **second async network round** for a canvas/copy
  export of an image already shown on the page (re-fetching with
  `crossOrigin: 'anonymous'` to read pixels back out) should cache-bust that
  second fetch from the start — the live `<img>` and the export fetch are
  different cache partitions in theory but not reliably in practice.
- Any "compare"/"generate"-style submit handler needs an explicit re-entrancy
  guard (a boolean or sequence counter checked at the top of the handler), not
  just a disabled button, so a double-submit can never let an older, slower
  result overwrite a newer, faster one on screen.

## Fourth pass — vague follow-ups can arrive before they've seen the fix
`want-pairwise` (2026-07-28, iteration 4): "Oof that sucks make it better" —
sent with no specifics, and the thread shows it landed while the *previous*
job was still running (an aside about the request maybe being denied for
that reason). This requester will sometimes fire off a terse follow-up before
seeing whether the last fix landed, rather than after. Read a content-free
"make it better" as license to use judgment on the highest-value unaddressed
complaint still sitting in the thread, not as a fresh bug to hunt for blind —
and say so plainly in the BRIEF rather than guessing at invented specifics.

Also durable beyond this one site: any diagram that scatters avatar-sized
dots by rejection sampling needs the sampler to reject candidates too close
to nodes *already placed*, not just candidates outside the target region —
sampling only against the region boundary lets dots stack on each other once
node count gets non-trivial, which reads as "the graph is a little fucked"
even though the underlying data is correct.

## Fifth/sixth pass — a bug can outlive several plausible-sounding fixes; check the surrounding stack before re-guessing
`want-pairwise` (2026-07-28, iterations 5-6): the copy-image avatar/CORS bug
survived two straight "fix" attempts because both were request-parameter
guesses (cache-busting, referrer-stripping) never checked against the actual
serving worker's own headers — `lab/www/worker.js` already sends
`Referrer-Policy: no-referrer` site-wide, which would have ruled out the
referrer theory immediately if read first. Durable for future builds on any
surface: when a bug survives one plausible fix, **read the surrounding
infrastructure (the serving worker, shared headers, CSP) before proposing a
second guess in the same family** — don't just vary the same client-side
knob again. And when a whole category of client-side fix has been
exhausted without success, this requester is well served by a *structurally
different* fallback (here: an inline SVG with live image refs, sidestepping
the CORS requirement entirely via native browser "Copy Image" instead of a
fourth canvas/fetch variant) over another iteration on the same broken
approach — say plainly in the BRIEF why the old approach was abandoned
rather than layering a fourth patch on it.

## Seventh pass — tests on mobile; a live/interactive diagram is not a substitute for one real image
`want-pairwise` (2026-07-28, iteration 7): "Promote the rasterized image to
first class. The graph is just not useful! Right now long press on mobile
gives me highlighted text inside the image. It would really just be cleaner
to have the copy button copy the rasterized image." This requester tests on a
phone specifically, and long-press-to-copy is how they expect to grab a graph
— not a dedicated button, and not a manual "right-click, choose Copy Image"
escape hatch layered next to the main diagram. A page built from live DOM/SVG
elements (positioned `<img>`s, inline `<svg><text>`) reads as selectable
content to a mobile browser's long-press gesture, so long-pressing over it can
select text/elements instead of offering "Copy Image" — even when the visual
result looks identical to a flat picture. **Durable for any future diagram on
this requester's sites: make the single rendered image (canvas → blob → a
plain `<img src>`) the primary on-page diagram itself, not an interactive
DOM/SVG structure with a separate "copy image" affordance bolted on.** A
plain `<img>` pointing at a real raster is what makes both native long-press
*and* a one-tap copy button work off the exact same asset, with no live/copy
divergence to keep in sync.

## Features they reach for
Comparison/set-relationship visualizations framed as classic diagrams (Venn,
named explicitly) rather than raw tables — worth defaulting to a visual
diagram-plus-plain-text-fallback shape if a future request is again about
comparing two things.

## Said no to
Nothing recorded yet — no rejections or corrections so far.

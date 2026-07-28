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

## Features they reach for
Comparison/set-relationship visualizations framed as classic diagrams (Venn,
named explicitly) rather than raw tables — worth defaulting to a visual
diagram-plus-plain-text-fallback shape if a future request is again about
comparing two things.

## Said no to
Nothing recorded yet — no rejections or corrections so far.

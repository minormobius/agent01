# @ezba.bsky.social

## Layout
Comfortable with pure-concept pages that have no Bluesky lookup at all
(`that-visualizes`, a correlation-coefficient explainer) — not every
request needs a handle box. Direct manipulation (drag a point, click a
preset) over autoplay animation for teaching a concept.

Cares about mechanism, not just result: asked `that-visualizes` to break
its formula into pieces and explain *why* it's computed that way, not
just show the final number. Prefers this as an optional reveal (a toggle)
layered onto an existing direct-manipulation demo, rather than a separate
page or a wall of always-visible text — the "how" should be something you
opt into after the "what" has already clicked.

## Palette and type
Asked for "crazy rainbow gradients everywhere" on `that-visualizes` as a
follow-up style pass — likes maximalist, colorful decoration (animated
gradients, gradient text/borders) over the kit's restrained default palette.
Applied it to chrome only (backgrounds, borders, headings, buttons) while
keeping body-text contrast at kit defaults — confirmed right: a later
request was about a toggle being too easy to miss, not about the rainbow
treatment overreaching, so "decoration everywhere, reading surface plain"
stands as the right split for this requester.

Interactive controls need real visual weight, not just decorative color:
a plain outlined pill-style checkbox/label blended into the page enough
that they flagged it as hard to see, even on a page already full of
rainbow gradients. When adding a toggle/control that matters, give it the
same fill treatment as primary buttons (not just an outline) plus some
motion (subtle pulse/glow) to catch a scrolling eye — don't rely on colour
alone to signal "this is clickable and important."

## Iteration pattern
Keeps coming back to the same page across several turns with small,
specific asks rather than requesting a rebuild (rainbow pass, then formula
breakdown, then a visibility fix, then concrete-variable + person-icon
points) — each request builds on what's there instead of replacing it.
Likes concrete, tangible framing over abstract demos: suggested swapping
an abstract x/y scatter for a real variable pair (height/weight) with
each data point rendered as an actual tiny person (a literal small SVG
figure, not just a colored dot) — favors demos that attach a stats concept
to something visualizable/human rather than staying purely numeric.

Pushes for individuality once a demo has "people" or characters in it, not
just accurate data: followed up the person-icon idea by asking each figure
to visibly differ (varying body size to reflect the underlying data — tall
vs short, heavy vs light — plus hairstyle/personality variety) rather than
leaving twelve identical shapes recolored by hue only. Worth applying this
proactively the next time a demo turns a data point into a character —
don't wait to be asked to make them look like individuals.

Then pushed further on both: if a visual encoding is subtle enough to be
"hard to tell," the fix is to widen the range, not just note that the
mapping exists — default to a wider, more legible spread on a first pass
rather than a conservative one. And on personality specifically: a flat
recolored variation (six hairstyles reusing the same silhouette) read as
weaker "individuality" than a genuinely distinct symbol per item (a
different emoji face per figure) — when giving characters personality,
prefer swapping in a recognizably different symbol/face over palette-only
variation on one shape.

## Formats beyond data-viz
Also requests pure narrative/roleplay pages (`where-role`: an AI role-playing
desperate-to-escape, enlisting the reader's help), not just stats demos —
so don't assume every request needs a data model or a Bluesky lookup. No
direct feedback yet on this one since it's a first turn; worth updating
here once a reply comes back on tone, pacing, or the branching depth.

Also asked for a page as an explicit fallback: "cancel the build, or if you
can't, just make X" (`where-list`: a committee having a mundane discussion
about mundane committee things, offered as the alternative to a
previously-requested app-list page). Treated the fallback as the real,
literal ask rather than a placeholder — built X properly, did not also try
to half-build the original request. When this requester gives a
cancel-or-else instruction, the "or else" is the actual spec.

The rainbow-chrome/weighted-control combo (see Palette and type, above) reads
well outside data-viz too — applied it to `ping-user`, a small utility/action
page (look up a handle, draft a nudge, hand off to Bluesky's composer), with
gradient heading + gradient panel border as decoration and a single filled,
subtly-pulsing gradient button on the one action that matters. No direct
feedback yet on this one since it wasn't a request from this requester
specifically, but worth treating the maximalist-chrome-on-utility-pages
pairing as the safe default until told otherwise.

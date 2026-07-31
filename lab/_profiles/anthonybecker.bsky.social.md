# @anthonybecker.bsky.social

## What they've asked for
First build: a space colony simulator (`create-space`) — camera inside a
rotating O'Neill cylinder, pastoral tone, hover/tap on colonists to read
their thoughts while they work and play. Wants atmosphere and a real 3D
scene over a UI-heavy tool; comfortable with an ambitious ask for one turn.
Follow-up turn: significantly denser scenery ("20X", "strict grid"), more
visual variety, and swapped hover/tap for proximity-based ambient reveal.
Third turn: a short list of terse, independent asks in one message ("more
people. add empty streets. more variety. better shading (keep it
performance inexpensive). bring the camera up higher") — each landed as a
separate, scoped change rather than one blended reinterpretation. Iterates
on a site rather than treating any build as final — expect more turns on
the same site, and expect requests to arrive as compact punch lists once
the core concept is established.

Second site (`hiiii-demo`, "My Commute"): a whimsical real-world premise
(a personal watercraft commuting Lake Merritt to Oracle's Redwood Shores
campus) built as a full 3D chase-cam ride rather than a map/UI widget —
confirms the 3D-over-UI preference generalizes beyond the space-colony
concept to any physical/geographic idea they hand over, even a one-line
joke-shaped ask. First turn on this site; no follow-up yet to learn from.

Third site (`download-few`, "A Few Good Solids"): asked for "download a few
cool obj files ... UV mapped textures ... simple gallery" — built as an
interactive WebGL viewer (drag-to-rotate per model) rather than a static
image grid, a third confirmation that any request touching 3D/geometric
content gets the full interactive-scene treatment from this requester by
default, not a flatter gallery/grid presentation. First turn; no follow-up
yet.

## Palette and type
No explicit preference stated yet. Went with the kit defaults (dark,
amber/gold accent) plus warm pastoral greens/golds for the 3D scene itself,
unchallenged so far.

## Layout
No stated preference yet — first site was full-bleed canvas (chrome kept to
minimal corner HUD panels), not a document-style page. Worth noting for any
future full-screen/interactive request from them.

## Features they reach for
First turn wanted hover/tap-for-detail. Second turn (follow-up on the same
site) reversed that: asked for thoughts to appear ambiently by proximity,
explicitly "without requiring a hover or click." Read together: they want
discoverable detail, but prefer it to surface passively/spatially (by moving
through/near things) over an explicit interaction step once the concept is
proven out. Also iterates in concrete, numeric terms — "20X more object
density," "strict grid" — rather than vague direction; take density/scale
asks literally rather than rounding to "a bit more."

## Said no to
Nothing stated as a rejection, but see above: the first turn's hover/tap
mechanic was superseded by an ambient-proximity one on request, not
because it was broken. Worth noting if a future site of theirs starts with
hover/tap — they may prefer starting with proximity/ambient reveal instead.

## Follow-up style
Comes back multiple times on the same bug rather than accepting a partial
fix — proximity placement was revisited a third time (turns 3, 4, 5) after
each previous attempt narrowed but didn't eliminate the problem. Notices
when a fix only addressed part of the symptom and describes precisely what's
still wrong in geometric/spatial terms ("only a very small circular slice of
the cylinder around the camera ought to have colonists in it") rather than
vague dissatisfaction — worth reading their bug reports closely for the
actual constraint implied, not just the surface complaint. Also bundles
small, unrelated polish asks into the same message as a bigger fix (bubble
resizing, background opacity) — treat each as a separate scoped fix, not a
reason to reinterpret the main ask.

## Performance/quality tradeoffs
Explicitly asked for "better shading" with the caveat "keep it performance
inexpensive" in the same breath — cares about visual quality but flags
performance as a real constraint unprompted, not just an implicit given.
Take that literally: prefer cheap wins (per-instance color variation, tone
mapping) over expensive ones (shadow maps, more geometry) when asked to
improve visuals on this site, and it's fine to defer a fancier option in
favor of one that's safe to ship without a way to preview it first.

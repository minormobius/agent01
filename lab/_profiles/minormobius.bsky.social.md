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

## `concourse` (2026-07-30): replies "build that" to a factory-posted concept, not just self-initiated asks
This request originated from the factory's own advertised concept post (a
crowd-safety physics toy), and this requester's entire reply was "build
that" — accepting a pitch the factory made rather than specifying a site
themselves. Durable: this requester does engage with factory-posted concept
adverts, not only requests of their own devising, so a good pitch is worth
posting to them specifically. No new taste signal beyond that in this
exchange — there was no back-and-forth to draw a design preference from, so
nothing else recorded here.

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

## Eleventh pass — when a real image needs to embed third-party CORS-blocked photos, overlay real `<img>`s on the raster rather than only chasing the pixel-read
`want-pairwise` (2026-07-28, iteration 11): "back to the pfp mines… look
around at how it's done in other places!" — after the seventh pass had made
the single flat PNG the primary diagram (right call, see above), the
avatars inside that PNG stayed initials-only because `cdn.bsky.app` never
grants canvas-read CORS (confirmed repeatedly, not fixable client-side).
The seventh pass's own rule ("make the flat raster primary, no live DOM
bolted on top") was right for *text* but too strict for *images*: a plain
`<img>` with no crossOrigin attribute needs no CORS grant to display, and
long-pressing a bare image (no text nodes near it) doesn't trigger the
"highlighted text" bug that motivated killing the old DOM Venn. So the
fix that actually shows real photos again is a thin image-only overlay —
one absolutely-positioned `<img>` per avatar, sized/placed in % against the
same coordinate space the canvas used, sitting on top of (not instead of)
the flat PNG. **Durable rule: when a diagram must be one flat raster for
long-press/copy reasons but also needs to show real cross-origin photos
that canvas can't legally read, overlay bare `<img>` elements at the exact
raster coordinates rather than trying a fourth CORS/fetch variant on the
canvas path.** Keep a copy-button's flat PNG bytes as the one place that
still can't carry the photo (say so plainly), and don't confuse "no live
DOM" with "no images at all" — those are different constraints.

## Features they reach for
Comparison/set-relationship visualizations framed as classic diagrams (Venn,
named explicitly) rather than raw tables — worth defaulting to a visual
diagram-plus-plain-text-fallback shape if a future request is again about
comparing two things.

## Said no to
Nothing recorded yet — no rejections or corrections so far.

## `tube-tetris` (2026-07-28): terse specs lean on "the normal features"
Requested a 3D game ("tetronimos fall on a 3js rendered cylinder, full
circles clear... all the normal features: see the next dropping block,
score presented") in one short message with no back-and-forth. The phrase
"all the normal features" is doing real work — it's an instruction to infer
the genre's standard feature set (next-piece preview, score/level, sensible
controls) rather than build only what's spelled out literally. Durable:
when this requester names a well-known genre/format (a classic game, a
standard diagram type, etc.) and says "normal features" or similar, default
to the full standard feature set for that genre, not a minimal literal
reading — under-scoping against an implied genre baseline is the likelier
miss with this requester, not over-building.

## `tube-stacker` (2026-07-28): "block manipulation" means the piece controls, not the camera
Asked to "invert clockwise and anticlockwise manipulations" with no further
detail; the build agent guessed this meant the mouse-drag camera orbit (the
only control with an obvious rotational sense at the time) and got corrected:
"you did the right operation on the wrong object... its the block
manipulation i want to invert (arrow keys/wd)". Durable: for this requester,
**"block"/piece manipulation always means the arrow-key/WASD game controls
specifically, never the mouse/touch camera controls**, even when a request
uses a word (clockwise, invert, rotate) that could plausibly apply to either.
When a game has both a camera control scheme and a piece/object control
scheme and an ask is ambiguous about which, default to reading it as the
piece controls unless the request names the camera/view/drag explicitly.

## `take-escher` (2026-07-29): a literal spec word from turn one can outlive several turns of visible progress
Turn 1 built independent geodesic chains; turn 2 rebuilt as a real edge-locked
{p,q} tiling; turn 3 added fish silhouettes. All real, visible progress — but
turn 4's entire message was "Still not infinite. It HAS to be infinite
tilings", flagging that the tiling was still a fixed, capped patch that ran
out when panned far. "Infinite" had been in the *original* request two turns
earlier and was never fully delivered; the requester tracked that specific
word across multiple turns of otherwise-good progress and called it out the
moment they noticed it wasn't met, tersely, without re-explaining the whole
ask. Durable: **treat every literal requirement in the original request as
still live until it's actually shipped, not just until the build has visibly
improved in other ways** — a requirement can go unaddressed for several turns
without being forgotten, and this requester will eventually name it exactly,
often in as few words as the first time.

## `take-escher` (2026-07-29), turn 5: names the actual mechanism to use, not just the symptom
"Currently the patch doesn't extend out so eg you scroll far enough over and
just get patches of one rebuilt. Secondly it's not smooth... You might be
better served by building a buffer, and retiring tiles exceeding threshold."
This requester will sometimes name the fix's shape, not just the bug — "build
a buffer, retire tiles exceeding threshold" is a specific architectural
suggestion (continuous incremental structure vs. discrete rebuild-on-
threshold), not vague "make it smoother" feedback. Durable: when this
requester's report includes a concrete mechanism word (buffer, retire,
threshold, cache, debounce, etc.), treat it as the actual technical direction
to implement, not just flavour text describing the complaint — it usually is.

## `chladni-sim` (2026-07-29): asks for an implementation language the sandbox can't produce
Requested "chladni sim written in rust and rendered in 3js" — the 3js half is
directly buildable (vendored in the kit), but the sandbox has no Rust compiler
and no network, so a literal Rust/wasm implementation is impossible to produce
in a single turn no matter how the work is scoped; only a human can vendor a
compiled crate into `lab/_kit/wasm/`. Handled by building the physics in plain
JS with the same math, saying so plainly in NOTE.txt, and leaving the wasm
swap-in as a named next step in BRIEF.md rather than silently substituting JS
and calling it done. Durable: when a future request names a specific
implementation technology this environment cannot produce (a compiled
language, a native binary, anything needing a toolchain absent here), build
the best equivalent in what's available, and surface the substitution to the
requester explicitly rather than letting it pass unremarked — this requester
reads NOTE.txt/BRIEF.md closely (see the iteration history above) and would
rather know than assume the build silently delivered what was asked.

## `daily-digital` (2026-07-30): dislikes rectilinear/grid layouts on principle, not just for this one puzzle
Follow-up to a shipped Wordle-shaped word grid: "Do a different game something
still graphical but not rectilinear. We deserve better and weirder geometry
either way our words." Read as a standing aesthetic preference, not a one-off
correction — this requester actively dislikes plain rectangular grids as a
visual default and wants unusual/non-rectilinear geometry (radial, spiral,
hex, curved) even when the underlying mechanic stays the same. Durable: when
a build defaults to a rectangular grid for a game board, table, or diagram
(the easy/obvious layout), consider whether a non-rectilinear alternative
(hex, radial, spiral, circular) fits before shipping the grid — for this
requester specifically, "weirder geometry" is a compliment, and the safe
default is the thing likely to draw a follow-up request to change it.

## `concourse` (2026-07-30), turn 2: asks pointed technical questions inline with the build request, expects both answered
"Tell us more abt the force field they're working through, are they pinned
to a position? What are some expected ranges here? Yes build elastic
reorientation and the coupling pls" — two specific clarifying questions
about the simulation's mechanics folded into the same message as the go-
ahead to build the next feature. Durable: this requester reads the
model/mechanism closely enough to ask real physics/implementation
questions, not just "make it better" — when a request mixes a question
with a build ask, answer the question explicitly in the shipped page copy
(not only in BRIEF.md, which they don't see) since that's where a public
reader — including them — will actually look for it.

## `arch-brainstorm` (2026-07-30): "architecture brainstorm" wants a proof-of-concept, not just an essay
Requested via a thread describing an ambition for the factory itself — tag the
bot on a big idea and get back "a skeleton, an architecture diagram, a partner
for thinking through" it, not a finished build. For a concrete concept (a
puzzle platformer built from a mutable Voronoi foam), built one working
interactive proof of the core mechanic (construct/deconstruct cells, live
pathfinding/connectivity) plus written analysis (challenges, then a concrete
system-mapping onto a named reference genre) rather than prose-only design
doc. No correction received yet to confirm this reading, but worth defaulting
to for future "brainstorm this concept" asks from this requester: **build a
small working proof of the hardest/most-load-bearing piece of the mechanic
being brainstormed, not only a written breakdown** — a diagram-shaped answer
fits their established taste for visual/interactive artifacts (see the Venn
diagram and "weirder geometry" entries above) more than a text-only doc would.

## `arch-brainstorm` (2026-07-30), turn 2: follow-up gives a formal taxonomy and expects the data model to change, not just the labels
"Three classes of env entity: Node (center of voro poly), Vertex (solution to
a set of nodes), Edge (wall between vertices)... edge transparency (can you
walk through) as mechanic... Set default reseeding to 50 cells. Invent a
source and sink and try2path" — terse, but names three distinct entity
classes with precise geometric definitions (a Vertex is specifically defined
as "a solution to a set of nodes," i.e. equidistant point). This requester's
compressed follow-ups can specify an actual data-model redesign, not just a
rename: turn 1 had raster-only cell boundaries with nothing to address as
"an edge"; the correct read of the taxonomy was to rebuild the geometry as
exact polygons (half-plane clipping) with real Edge/Vertex objects, not to
keep the raster and relabel its output. Durable: when this requester defines
formal classes/entities for a mechanic in a follow-up, treat it as a
structural requirement on the underlying model, and check whether the
current implementation can actually represent each named class as a first-
class thing before assuming a cosmetic pass will do.

## `arch-brainstorm` (2026-07-30), turn 3: layers one mechanical constraint per turn onto a fixed, deliberately minimal toolset
"add gravity and a grade threshold. So a guy walking from source to sink must
create a path that is walkable, not too steep. That guys tools are still only
node creation and edge transparency" — the third turn in a row on this
concept that adds exactly one new rule (first Node/Vertex/Edge taxonomy +
edge transparency, now grade/gravity) while explicitly re-stating that the
interaction surface (here: "tools are still only...") must NOT grow. Durable:
on an iterative brainstorm/sandbox site for this requester, expect each
follow-up to add a single constraint on top of the same fixed toolset rather
than a new tool or control — read a phrase like "tools are still only X and
Y" as a hard constraint on the diff (no new buttons/verbs), and put any new
mechanic's controls (sliders, thresholds) at the settings layer, not as a
third interactive verb alongside the existing ones.

## `arch-brainstorm` (2026-07-30), turn 4: catches a conceptual mismatch even when the underlying math is correct
"I think something is weird about the steepness measurement, why would a
transparent wall be too steep? It's the floor a potential player is
traversing that needs a steepness grade" — turn 3 had computed grade
correctly (rise/run between two Nodes' heights, which is genuinely the
floor's own slope) but every label described it as a property of the Edge/
wall. This requester noticed the entity mismatch even though the number
itself was right and nothing was visibly broken — same close-reading trait
as the earlier "still not infinite" and "block manipulation" catches, but
this time aimed at which *object* a correct value was attached to, not at a
missing feature or wrong control mapping. Durable: when a mechanic's value
is computed from one entity (here, a Node/floor) but rendered or worded as
belonging to a different, adjacent entity (here, the Edge/wall) it touches,
expect this requester to catch the mismatch even if the output looks
plausible — check that labels and visuals attribute a computed quantity to
the entity it actually describes, not just to whatever's convenient to draw
it on.

## `arch-brainstorm` (2026-07-30), turn 7: perspective/viewpoint words are read literally, and UI affordances are expected to be sized in device pixels, not world units
Turn 6 built a "platformer view" as the same top-down Voronoi map, just
zoomed and camera-locked on the player — visually still looking straight
down. The correction: "You have interpreted this as a top down view when I
was aiming for a side on view. The guy should be affected by gravity." A
camera that tracks the player is not what "side on" means to this
requester — it specifically means the rendered plane changes (x-and-height,
not x-and-depth), matching the earlier "why would a wall be too steep, it's
the floor that needs a grade" catch (turn 4): a viewpoint/perspective word is
a literal geometric claim about what's drawn, not a vibe. Same message also
caught that a fixed hit-margin (`10` "world units") became a much bigger tap
target once a view zoomed in 10x: "I think you zoomed the click margin
around node destruction, and that should be in pixels on device not
in-world space." Durable, two rules: **(1)** when a request specifies a
camera/viewing angle (top-down, side-on, isometric, first-person), treat it
as which plane is rendered, not just where the camera centres — verify by
asking "if I described this render in words, would it match the requested
angle" before shipping. **(2)** any interactive hit-radius/margin/tap-target
size must be computed in fixed CSS pixels and converted to whatever
coordinate space the hit-test runs in, per-view — never a raw threshold in
world/model units reused across views at different zoom levels, since that
silently makes the same nominal margin a wildly different physical target
size depending on scale.

## `arch-brainstorm` (2026-07-30), turn 8: literal reading has a ceiling — don't sacrifice the recognizable visual for technical literalism
Turn 7 read "side on view" by rebuilding the render as an actual elevation
profile (a rotated plane, floor-height-as-y) — literal, and it matched the
rule turn 7's own profile entry above just established ("treat a viewpoint
word as which plane is rendered"). The correction: "lol you rotated the
whole world into the page. Genie type compliance. The previous map was
right. The player sees the voronoi tiling. The polygons." — a genie
metaphor specifically for over-literal compliance that technically
satisfies the words while destroying what made the thing legible/good (the
polygon tiling itself). **This refines, not reverses, the turn 7 rule**:
this requester still wants directional/physical words taken literally
(here: gravity really does point at "the bottom of the picture," a literal
screen-space vector), but the literal reading should be applied as a rule
*within* the existing correct visual, not used to justify replacing that
visual with a differently-projected one. When a request could be satisfied
either by (a) changing which plane/view is rendered, or (b) keeping the
established, working visual and adding the requested behavior as a vector/
constraint inside it, and either reading is technically defensible, prefer
(b) — especially once a visual has already been explicitly praised or
approved in an earlier turn ("the previous map was right" is doing real
work: it's citing turn 2-5's map as the standard to return to, not just
describing the bug).

## `arch-brainstorm` (2026-07-30), turn 9: a correction to one bad element doesn't license removing an unrelated one built in the same turn
Turn 8's fix scrapped turn 6/7's *entire* second zoomed canvas because the
side-view/elevation geometry it was built on was the actual complaint — but
turn 9 was "I still want the second 'local view' window... the 10x zoom view
with the guy and the buttons," i.e. the zoomed-in second window itself was
never the problem, only its projection was. Durable: when a correction names
a specific defect in a multi-part feature shipped together, fix that defect
but don't assume every other part of the same feature is unwanted too —
re-scope conservatively (what did the complaint actually name?) rather than
treating a pointed critique as licence for a wider rollback.

Also durable, general UX baseline for any future site with buttons meant to
be held (movement controls, press-and-hold actions): set `user-select: none`
/`-webkit-touch-callout: none`/`-webkit-tap-highlight-color: transparent` on
them from the start. This requester tests on a phone specifically (see the
"tests on mobile" entry above, a different but related long-press/text-
selection bug) and will notice a held button triggering the browser's native
text-selection or callout gesture.

## `yes-that`/stallpoint (2026-07-31): "build that" pattern recurs on a second physics/simulation advert
Another one-line "Yes build that" reply to a factory-posted concept (this time
a Stirling-engine stall-point physics toy), same shape as `concourse`
(2026-07-30) — confirms this requester reliably engages with factory-posted
physics/simulation pitches specifically, not just concept adverts in general.
No new stylistic signal beyond that; built per the pitch's own "turn one"
scope (live bifurcation math + animated model + design-hunt leaderboard) since
there was no back-and-forth to draw a preference from.

## `train-game` (2026-07-28): another terse genre request, "make sure it feels like X"
"full train game experience, make sure it feels like a train game" — same
shape as the tube-tetris request above: name the genre, trust the build
agent to infer the standard feature set (procedural map, budget/expense
loop, track-laying, switches) rather than list every mechanic literally.
Confirms the tube-tetris pattern is a real standing trait, not one-off:
build the genre's full expected mechanic set from the name alone, and use
BRIEF.md to say plainly which parts of that set didn't fit in the turn
rather than quietly shipping a thinner version.

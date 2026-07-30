# BRIEF — arch-brainstorm

## Turn 3 — gravity and a grade threshold

This turn's request: "add gravity and a grade threshold. So a guy walking from
source to sink must create a path that is walkable, not too steep. That guys
tools are still only node creation and edge transparency" — a constraint on
top of turn 2's sandbox, not new tools.

**Shipped:** every Node now has a fixed random height `z` (0-100, bigger dot =
higher). An Edge's **grade** is `|z_a - z_b| / distance(a,b) * 100` — rise
over run between the two Nodes it separates, independent of the wall's own
drawn angle. A slider (`gradeThreshold`, default 80%, range 10-250%) sets the
max walkable grade. try2path's BFS now only traverses an Edge if it is BOTH
`edgeOpen` (the player toggled it) AND `grade <= gradeThreshold` — gravity
vetoes a toggle exactly like a wall would. An open-but-too-steep Edge renders
as an amber dashed "hazard" line, visually distinct from the white dashed
"actually walkable" line, so the player can see the difference before
wasting a tap. Status line now also reports the steepest grade the found
path actually climbs. Challenge #2's write-up was updated to say this is now
a first version of the "firm slope rule" it called for — still a graph-level
stand-in, not a real traversal aid for the edges gravity blocks.

**Decision — height lives on the Node, not the wall.** The obvious other
reading was "grade = the drawn wall segment's own angle from horizontal" (a
near-horizontal Edge is floor, a near-vertical one is a cliff — literally
challenge #2's original phrasing). Went with per-Node elevation instead,
because "a guy walking" implies climbing between two *places*, and a Node is
the place; the wall's drawn angle is an artifact of the Voronoi tessellation,
not something a player's height should depend on. This also means grade is
stable as the tessellation is edited — the same two neighbouring Nodes always
have the same grade between them regardless of how their shared wall's
geometry gets reshaped by an unrelated Node moving nearby, which the
wall-angle reading would not have given.

**Decision — no new UI verbs.** The request explicitly said the toolset
stays at two: plant/pull a Node, toggle an Edge. So there's no separate
"designate floor" action — grade is purely computed from Node heights the
player never sets directly (heights are randomized at creation, same as hue
always has been), and the slider is a *setting*, not a third tool.

**Next (unstarted):** a real level slice (turn 2's plan item 2) is still the
big unproven piece — walking an actual sprite across walkable Edges as floor,
not a top-down graph a BFS traverses. Grade is now computed and useful data
for that: an Edge under the grade threshold is a strong candidate for "floor
you can walk," steeper-but-still-open ones could become a slide/climb
mechanic instead of a hard block. The cost/budget-on-edits idea (still
challenge #7, still unbuilt) pairs naturally with grade: a "climbing gear"
upgrade that raises your personal grade threshold at a cost would connect
this turn's constraint straight into that budget system.

**Gotcha:** grade is computed fresh in `computePathAndRender()` on every
recompute (`edgeGrade[k] = edgeGradePercent(e)`), not cached on the Edge
object — cheap at n≤50, but if this ever gets hot-looped at higher n, cache
it in `geometry.edges[k].grade` inside `computeGeometry()` instead of
recomputing on every path search.

## What this is (history)

The requester asked, in effect, for the thing @brendigler was describing
earlier in the thread: tag the bot on an ambitious idea and get back a real
planning document — a skeleton, an architecture diagram, a partner for
thinking it through — rather than a finished build. The idea itself: a big
puzzle platformer where the level is a Voronoi foam the player constructs
(plants sites → carves cells) and deconstructs (pulls sites → merges cells),
and the puzzle is holding or breaking a navigable path through it.

**Turn 2** (this turn) came back with a real vocabulary for the sandbox's
entities and a concrete new mechanic:

- **Node** — the centre of a Voronoi cell (was "seed"/"site").
- **Vertex** — a point equidistant from a set of Nodes, where 3+ cells meet.
- **Edge** — the wall between two Vertices, shared by exactly two Nodes.
- **Edge transparency** as the core mechanic: every Edge starts a solid wall;
  tapping one toggles it transparent (walkable). This replaces "cells are
  automatically connected to their geometric neighbours" with "you must
  explicitly open a route."
- **Source and sink**: the leftmost and rightmost Node, same rule as the old
  start/goal but renamed to the requester's terms.
- **try2path**: BFS from source to sink using only open Edges, rerun after
  every change, reporting hop count or "blocked."
- Default reseed raised from 12 to 50 Nodes, per explicit instruction.

The sandbox's internals changed completely to support this: it went from a
per-pixel raster nearest-site scan (the old `owner` buffer) to an *exact*
Voronoi diagram computed by half-plane clipping (Sutherland-Hodgman, clipping
a bounding box by every other Node's perpendicular bisector). That gives real
polygon vertices and tagged edges to click on, not just a colour boundary —
the Node/Vertex/Edge taxonomy is now the actual data model, not decoration on
top of a raster.

The written analysis (seven challenges, six Factorio mappings) is still from
turn 1, lightly touched — challenge #1 and #7 now reference Edge-toggling as
the primary lever/cost surface instead of Node add/remove, since that's what
the sandbox now demonstrates. The rest of the prose is unchanged and still
accurate; it was not the target of this turn's request.

## Decisions

- **Built the sandbox as literal top-down Voronoi + graph pathfinding, not a
  platformer.** A real jump-and-run demo in one turn would have meant picking
  physics/controls/level format with no time left to actually think through
  the geometry problem, which was the actual ask. The graph the sandbox
  computes (Node adjacency, BFS connectivity through open Edges) is the same
  structure a real platformer's traversal layer would need, so it proves the
  load-bearing mechanic without pretending to be the game. Say this plainly
  if it reads as "not a platformer" — it's a proof of the hard part,
  deliberately, not a demo of the easy part.
- **Switched raster nearest-site scan → exact half-plane-clipped polygons.**
  The turn-1 sandbox had no real notion of a Vertex or an Edge, only a raster
  boundary between differently-owned pixels — there was nothing to click on
  as "an edge." Turn 2's ask (Node/Vertex/Edge as classes, edge transparency
  as a mechanic) is impossible to build faithfully on a raster, so the
  rendering approach changed entirely: every Node's cell is now clipped from
  a bounding box against every other Node's perpendicular bisector
  (Sutherland-Hodgman with tagged edges), producing exact polygon vertices
  and a real Edge object per Node-pair to hit-test clicks against. This is
  still O(n²) per full recompute (see below), but it is a *different* O(n²)
  from turn 1's raster scan — polygon math, not a 360×240-pixel loop — and is
  in practice faster at n=50 than the old raster was at n=12.
- **Edges default opaque (walls); transparency is earned by tapping, not
  ambient.** The old model treated any two geometrically-adjacent cells as
  automatically connected — "connected" meant "the Voronoi diagram says
  they're touching." That's not a puzzle, just a diagram. Now nothing is
  walkable until the player opens it, which is what makes try2path meaningful
  (a real search over a real subset of edges) rather than always trivially
  true for touching cells.
- **Edge and Node identity is by a monotonic id, not array index**, precisely
  so `edgeOpen` (which Edges the player has toggled) survives node removal —
  splicing `sites` shifts array indices but never touches `id`, so a toggle
  made three edits ago doesn't silently jump to the wrong wall.
- **Source/sink still auto-picked (leftmost/rightmost Node), not player-
  designated.** "Invent a source and sink" was read as "give the concept
  fixed endpoints," not "let the player choose them" — same rule as the old
  start/goal, just renamed. Manual source/sink placement is a natural next
  step (see Plan).
- **No PDS/save state.** Still true — this is a brainstorm sandbox, not a
  game with progress worth persisting.
- **Didn't touch the Factorio-mapping prose beyond two references.** The
  request was specifically about the sandbox's entity model and mechanic,
  not a rewrite of the written analysis — left it alone except where it
  directly described the mechanic that changed.

## The plan (next turn, in order)

1. **A cost/budget on edits**, per challenge #7 — right now Nodes and Edge
   toggles are both free and unlimited, so try2path is a puzzle in shape only
   ("open a route") without a reason not to just open every Edge. Cheapest
   version: a fixed number of Edge-opens total, or a per-open cost, so a
   solution (the minimal set of Edges to open) is something to find.
2. **A real level slice.** Take the same Node/Edge graph and actually walk a
   character across it — pick a subset of Edges as "floor" by the slope rule
   sketched in challenge #2 (near-horizontal Edges become ground), and get
   one screen-sized foam patch a sprite can walk and jump across, with
   transparency as literal wall-vs-doorway rather than a graph abstraction.
   This is the actual hard part still unproven: everything shipped so far is
   the abstract graph, not the platformer.
3. **Manual source/sink placement** — right now they're auto-picked
   (leftmost/rightmost Node), which was the fast reading of "invent a source
   and sink." Letting the player click to designate them (with the auto-pick
   as a fallback default) is a small, contained follow-up if asked for.
4. **The automation layer** (the Factorio-shaped part) — a placeable rule
   object that opens/closes Edges or inserts/removes Nodes on a timer or
   trigger, rather than the player tapping directly. This is where "turn it
   into Factorio" actually starts, and it's more design work than code: what
   rule language is expressive enough to feel like automation but simple
   enough to place with a few clicks.
5. Only after 1–4: the resource-typing-per-cell-geometry idea and the rival
   growth-pressure idea from the write-up. Both are real design directions
   but neither is buildable-and-checkable until there's an actual game loop
   to hang them on.

## Gotchas

- **Node/Edge identity must be a stable id, never an array index.** Removing
  a Node splices `sites`, which shifts every later index — if `edgeOpen` or
  `geometry.edges` were ever keyed by index instead of the monotonic `id`
  each Node is given at creation, a toggle made before a deletion would
  silently apply to the wrong wall after it. This bit the redesign directly;
  don't reintroduce index-keying if this gets refactored.
- **The half-plane clip's tag propagation is the subtle part.** Each
  Sutherland-Hodgman clip step must tag output vertices with the tag of the
  edge/line that produced them — an edge kept from the input polygon keeps
  its old tag, but the new "bridging" edge introduced where the clip line
  cuts through gets the *new* tag (the other Node's id). Get this backwards
  and Edges end up attributed to the wrong Node pair, which reads as clicks
  toggling a wall that visually isn't the one you tapped. Traced by hand for
  the 2-Node case in-turn (edge from (180,0)-(180,240) tagged with the
  correct neighbour id) — if this breaks again, redo that trace before
  guessing.
- **`f(p) = A·x + B·y + C` for the perpendicular bisector is affine, not
  quadratic** — the squared terms in the two distance formulas cancel, so the
  clip boundary is a straight line and the crossing point is a plain linear
  interpolation (`t = f(curr)/(f(curr)-f(next))`), no sqrt anywhere. Don't
  "simplify" this back to literal distance comparisons per-pixel; that's the
  raster approach this turn deliberately replaced.
- BFS path reconstruction needs `hops -= 1` after walking source→sink via
  `prev[]`, because walking the chain counts *Nodes* visited, not Edges — an
  off-by-one that's easy to reintroduce if this gets refactored.
- Canvas is a fixed internal resolution (360×240) scaled via CSS `width:100%`
  with no explicit height, matching the same aspect ratio — that's what keeps
  click-coordinate math (`clientX/width ratio`) correct on any screen size
  without a resize listener. If the internal resolution ever changes, the
  aspect ratio in CSS has to change with it or clicks land in the wrong cell.
- Edges default **opaque** on every fresh reseed/clear — at 50 Nodes the
  sandbox loads showing "blocked" until the player opens a route. That's
  intentional (see Decisions), not a bug to "fix" by defaulting anything open.

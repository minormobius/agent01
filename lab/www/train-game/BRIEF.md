# BRIEF — train-game ("Right of Way")

## What this is
Requested: a full train-game experience — procedurally generated terrain
with cities, a rail-building budget, drawing track at expense, and setting up
switches/changeovers. This turn shipped a working single-file skeleton with
all four of those pieces actually functional, not stubbed:

- Terrain: two-octave value noise over a 16x10 node grid (`heights[r][c]`),
  classified into water/plains/forest/hills/mountain and painted onto a
  static background `<canvas>`.
- Cities: 7 placed by rejection sampling on plains/forest nodes with a
  minimum spacing, named from a curated list (`CITY_NAMES`).
- Track: tap a node to select it, tap an adjacent node (8-directional) to
  lay an edge between them at a cost computed from the average terrain
  multiplier of the two endpoints times distance, deducted from a starting
  budget of $15,000 live in `state.budget`.
- Connectivity + trains: after every edge is laid, `refreshConnections()`
  runs Dijkstra between every city pair not yet linked; a newly-reachable
  pair spawns a train (`spawnTrain`) that shuttles back and forth forever,
  paying revenue on each arrival (`REVENUE_PER_UNIT * path length`).
- Switches: any track node where 3+ edges meet (and that isn't a city) is a
  junction. "Set Switches" mode lets you tap one to cycle which pair of its
  edges is the aligned through-route. A train whose path needs an edge that
  isn't the currently-aligned pair actually **stops and waits** at that node
  (`isAligned` / the `waiting` flag in `updateTrain`) until the switch is
  thrown correctly — this is the one mechanic worth reading closely if you
  touch train movement, since it's the crux of "set up switches and
  changeovers" from the request.

## Decisions
- **Tap-to-extend, not click-and-drag**, for laying track. A drag gesture is
  unreliable on touchscreens (scroll vs. draw ambiguity) and the profile
  notes this requester tests on a phone. Tapping a node, then an adjacent
  node, then the next adjacent node, chains a line with no drag needed.
  `touch-action: none` on the board plus nearest-node snapping (round to
  nearest grid intersection, no minimum-distance threshold) makes taps
  forgiving at small screen sizes.
- **No handle input / no kit.handleInput / no bskyGet calls.** This game has
  no Bluesky-identity component in the request — it's a solo terrain/budget
  game — so there was nothing to attach OAuth or a handle box to. Only
  `tokens.css` is linked, for the palette and button/stat shapes; `kit.js`
  wasn't needed since nothing calls the AppView.
- **Two stacked canvases** (`#terrain` static, `#game` redrawn every frame).
  Terrain is painted once; only track/switches/cities/trains/selection
  redraw on the animation loop. Keeps the per-frame cost small regardless of
  grid size.
- **A single new edge can trigger at most one new train**, not one per city
  pair that happens to end up connected. Union of two components via one
  edge only ever merges two previously-separate groups once, so scanning all
  city pairs each time and spawning on first-connection is safe in practice
  for the ~7-city scale here; it would need real union-find bookkeeping if
  the city count grows a lot (see below).
- **Game name is "Right of Way"** — a generic rail term, not any commercial
  product's name, per the trademark rule in the top-level instructions.

## The plan — what's not built yet, roughly in order
1. **Balance pass.** `BASE_COST`, `BUDGET_START`, `TRAIN_SPEED` and
   `REVENUE_PER_UNIT` are first-guess numbers, untested in an actual
   browser (no network/shell available this turn). Likely to be too easy or
   too stingy. Play it, then tune those four constants — they're all at the
   top of the `<script>` block.
2. **Track removal / undo.** Right now track is permanent once laid; there's
   no way to demolish a bad segment and recover part of its cost. Real rail
   games usually let you do this. Would need a third mode button and a
   confirm-before-refund flow (maybe refund at a discount so it isn't free
   to undo mistakes).
3. **A real win/end condition.** Currently it's an open-ended sandbox: no
   score target, no time limit, no game-over. Consider a scenario framing
   ("connect all 7 cities before turn N" or a target net worth) rather than
   pure sandbox — the request said "full train game experience" and most
   train games have a scenario goal, not just free play.
4. **Multiple trains sharing a switch/edge don't coordinate or collide.**
   Each train moves independently; two trains can occupy the same edge or
   pile up at the same switch with no visual acknowledgment of each other.
   Fine for a first pass, but a "train game" purist will notice. If you add
   this, the switch-wait mechanic (`isAligned`) is the right place to also
   check "is another train currently on the node/edge I want to enter".
5. **Visual polish**: the trains are flat rectangles, the switch icon is a
   diamond — functional, not evocative. A next pass could add a simple
   train-car sprite (canvas path, no image assets needed) and directionality
   (rotate the rect to face travel direction).

## Gotchas
- **No way to test this in a real browser this turn** — no Bash, no
  WebFetch. Everything above is reasoned from reading the code twice, not
  observed. If the harness's one-pass smoke test reports an error, start
  with `toLogical()`'s coordinate math (canvas logical size vs. CSS-scaled
  display size) and the Dijkstra loop (`dist[k] === undefined` guards) —
  those are the two places a silent off-by-one would be easiest to miss
  without running it.
- **Combinations-based switch alignment re-indexes when degree changes.**
  `state.switches[key]` is a plain integer modulo `combos(neighbors).length`
  at draw/check time, not stored per-pair. If you add an edge to an existing
  junction (raising its degree), the same stored integer can silently mean a
  *different* pair than it did before the edge was added, since the combos
  list is recomputed fresh each time and is order-dependent on `Set`
  iteration order. Race is unlikely to bite in normal play but is worth
  knowing about before you touch `isAligned` or the switch-cycling code.
- No og:image — none was available to generate honestly this turn, so the
  link card is title/description only.

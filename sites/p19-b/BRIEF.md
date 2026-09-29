# BRIEF — train-game ("Spur & Siding")

## What this is

The ask: a train game — procedurally generated terrain with cities, a
railbuilding budget, tracks drawn at expense, switches and changeovers, and
it should "feel like a train game." This turn shipped the whole loop as a
single canvas-based page, no build step, no external assets:

- Procedural terrain (value noise, two octaves) rendered to an offscreen
  canvas: water / plains / forest / high ground, each with its own track
  cost multiplier.
- 6–8 towns placed on land, far enough apart, named from a fixed pool.
- Tap a town, tap a second town, and the line is priced live (sampled along
  the route against the terrain under it) and deducted from a fixed
  starting budget. No pre-planned graph — every network is player-drawn.
- Junctions ARE the towns. A town with 3+ lines gets a diamond "points
  lever" beside it; tapping it cycles which of its other lines is the
  active through-route. Trains arriving at a junction take whatever the
  points are currently set to — get it wrong and the train goes somewhere
  you didn't intend, which is the actual mechanic the ask wanted, not a
  cosmetic switch icon.
- Trains: buy one (cost rises per train), it spawns on an existing line and
  runs the network automatically, bouncing at dead ends, earning a fare
  per finished stretch of line.
- Running cost: track has upkeep charged periodically regardless of train
  activity, so the budget can bleed out if you overbuild relative to
  revenue — this is the "at expense" part of the ask, made ongoing rather
  than one-time.

## Decisions

- **Junctions live at towns, not at free-floating waypoints.** A separate
  "click empty ground to drop a junction node" mode would have doubled the
  UI surface (node creation, node deletion, orphan-node cleanup) for a
  20-minute turn. Every town in this build can already act as a junction
  once three lines meet there, which delivers the switch/changeover
  mechanic the ask specifically named without that extra machinery. If the
  next turn wants mid-line junctions, see THE PLAN.
- **No Bluesky login, no kit.handleInput.** This is a single-player,
  single-session game with nothing that needs a Bluesky identity yet — it
  doesn't fetch or display any account's content, so the "one rule with
  teeth" doesn't even come up. Sign-in is deliberately deferred rather than
  bolted on for its own sake (see THE PLAN for where it would earn its
  place).
- **Straight-line track only, no curve/waypoint editing.** Keeps cost
  estimation (sample along a segment) and rendering simple, and reads fine
  at this map scale. A bent line would need multi-segment editing UI that
  didn't fit this turn.
- **Economy constants (BASE_COST, REVENUE_RATE, UPKEEP_RATE, train cost
  curve) are first-pass guesses**, chosen to make the game playable
  end-to-end rather than balanced. They're all named constants near the top
  of the `<script>` block — tune them there, not scattered through the
  logic.

## The plan (next turn, in order)

1. **Persistence.** Use `labPds()` (`/_kit/pds.js`) to save the current
   network (`cities` seed/positions, `edges`, `switchState`, `money`) under
   `store.save('network', ...)` so a visitor can leave and come back to the
   same map instead of losing it on refresh. Sign-in should stay optional —
   default to `localStorage`, offer "sign in to keep this" once there's
   something worth keeping (per the kit's own guidance).
2. **Scoring.** Once persistence exists, `store.postScore(revenueEarned, {
   unit: 'dollars' })` and a leaderboard built from `store.scoresOf(handle)`
   for handles the visitor types in (not a global board — see the kit
   README on this). Needs `store.rank()`'s higher-is-better direction set
   correctly for a revenue score.
3. **Balance pass.** Play it for a few minutes and retune BASE_COST /
   REVENUE_RATE / UPKEEP_RATE so early lines are affordable but the map
   genuinely gets tight later — right now it hasn't been played by a human
   at all, only reasoned about.
4. **Mid-line junctions**, if wanted: would need a "click empty track to
   split it and drop a junction node" interaction, a `nodes[]` array
   distinct from `cities[]` (junctions have no name/revenue role), and
   `neighborsOf`/`arriveTrain` already generalize to any node id — they
   don't assume `cities[i]` is the only kind of node, so this is additive,
   not a rewrite.
5. **Multiple trains sharing a line safely** — right now two trains can
   occupy the same edge with no collision logic; that's fine for a first
   pass (trains just pass through each other visually) but a "one train per
   block" signalling rule would be the next layer of realism if asked for.

## Gotchas

- **Mobile tap targets on the map are smaller than the 44px guideline, and I
  don't think that's fully fixable without a design change.** The board is a
  fixed 900×560 logical canvas scaled down to fit the viewport; on a ~360px
  phone that's roughly a 0.4x scale, so even a generous 26-logical-unit city
  hit radius lands around 20 real device px. Pushing the hit radius further
  starts overlapping neighbouring towns, since `MIN_CITY_DIST` (122 logical
  units) is the ceiling. A real fix is probably pinch/double-tap-to-zoom on
  the board, or a fallback "pick from a list of towns" control for narrow
  screens, not just a bigger hit radius — flagging this rather than quietly
  shipping a fake fix.

- The canvas resize logic scales a fixed 900×560 logical coordinate space
  to whatever CSS size the `.board` element ends up at (`ctx.setTransform`
  by the ratio of backing-store pixels to logical units). All game math —
  hit-testing, terrain sampling, drawing — stays in the 900×560 logical
  space; only `resize()` and `logicalPoint()` touch device pixels. Do not
  add anything that reads `canvas.width`/`canvas.height` directly elsewhere
  or it will drift from the logical grid on high-DPI screens.
- `edges` are referenced by array index everywhere (`train.edgeIdx`,
  `switchState` doesn't reference edges directly but `neighborsOf` returns
  indices). **Never remove an element from `edges[]`** — every train and
  in-flight index would silently point at the wrong line. If a "remove
  track" feature gets added, mark edges deleted rather than splicing.
- I could not load this in a browser — no network/shell in this sandbox —
  so this has only been checked by reading the code closely, not by
  playing it. The harness's own screenshot pass after this build is the
  first real look at it; if something visibly regressed, start with the
  resize/coordinate-space code above, it's the part most likely to be
  subtly wrong on an actual screen size.

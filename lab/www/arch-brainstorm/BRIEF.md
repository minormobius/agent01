# BRIEF — arch-brainstorm

## What this is

The requester asked, in effect, for the thing @brendigler was describing
earlier in the thread: tag the bot on an ambitious idea and get back a real
planning document — a skeleton, an architecture diagram, a partner for
thinking it through — rather than a finished build. The idea itself: a big
puzzle platformer where the level is a Voronoi foam the player constructs
(plants sites → carves cells) and deconstructs (pulls sites → merges cells),
and the puzzle is holding or breaking a navigable path through it. The
explicit ask was two things: what challenges this concept has to address, and
how to turn it into Factorio (i.e. give it an automation/production loop with
Factorio's depth, not just its aesthetic).

Shipped this turn: a single page with (1) a real, working construct/
deconstruct/pathfind sandbox — click empty foam to add a cell, click a seed to
remove it, live BFS between a marked start and goal cell, connected/
disconnected status and hop count updating on every edit — and (2) the
written analysis: seven concrete challenges, then six concrete Factorio-loop
mappings (resource typing, "automate the editing itself", production riding
the adjacency graph, tech tree as new edit types, a rival growth pressure,
and the legibility payoff).

## Decisions

- **Built the sandbox as literal top-down Voronoi + graph pathfinding, not a
  platformer.** A real jump-and-run demo in one turn would have meant picking
  physics/controls/level format with no time left to actually think through
  the geometry problem, which was the actual ask. The graph the sandbox
  computes (cell adjacency, BFS connectivity) is the same structure a real
  platformer's traversal layer would need, so it proves the load-bearing
  mechanic (does an edit sever the path?) without pretending to be the game.
  Say this plainly if it reads as "not a platformer" — it's a proof of the
  hard part, deliberately, not a demo of the easy part.
- **Full recompute per edit, not incremental Voronoi.** At the sandbox's scale
  (a few dozen cells, edits by click, not per-frame) brute-force nearest-site
  over a 360×240 buffer is comfortably fast and simple to read. Challenge #3
  in the page says explicitly that this doesn't survive to hundreds of cells
  or live automation — it's flagged as a known limit, not silently glossed.
- **No PDS/save state.** This is a brainstorm document, not a game with
  progress to persist — there's nothing meaningful for `store.save` to hold
  yet. Skip OAuth entirely rather than bolt on a save button with nothing
  worth saving.
- **Didn't build a name-your-game generator or multiple concepts.** The
  request was about this one specific concept in depth, not a menu of ideas —
  stayed narrow rather than broad, per the actual ask.

## The plan (next turn, in order)

1. **A real level slice.** Take the same adjacency graph from the sandbox and
   actually walk a character across it — pick a subset of "floor" edges by
   the slope rule sketched in challenge #2 (edges within some angle threshold
   of horizontal become ground), and get one screen-sized foam patch that a
   sprite can walk and jump across. This is the actual hard part still
   unproven: everything shipped this turn is the abstract graph, not the
   platformer.
2. **A cost/budget on edits**, per challenge #7 — a fixed seed count or
   per-placement cost — so the sandbox becomes a puzzle with solutions
   instead of an unconstrained toy. Cheapest version: N seeds total, editing
   costs one, see if you can still reach the goal with what's left.
3. **The automation layer** (the Factorio-shaped part) — a placeable rule
   object that inserts/removes sites on a timer or trigger, rather than the
   player clicking directly. This is where "turn it into Factorio" actually
   starts, and it's more design work than code: what rule language is
   expressive enough to feel like automation but simple enough to place with
   a few clicks.
4. Only after 1–3: the resource-typing-per-cell-geometry idea and the rival
   growth-pressure idea from the write-up. Both are real design directions
   but neither is buildable-and-checkable until there's an actual game loop
   to hang them on.

## Gotchas

- BFS path reconstruction needs `hops -= 1` after walking start→goal via
  `prev[]`, because walking the chain counts *nodes* visited, not edges — an
  off-by-one that's easy to reintroduce if this gets refactored.
- The edge-detection pass (which pixels get drawn as a dark cell boundary)
  is deliberately a *second* pass over the already-computed `owner` buffer,
  not fused into the nearest-site loop — it needs the full adjacency graph
  (and therefore the BFS path) resolved first, so it knows which cells to
  paint as "on the path" before it paints anything.
- Canvas is a fixed internal resolution (360×240) scaled via CSS `width:100%`
  with no explicit height, matching the same aspect ratio — that's what keeps
  click-coordinate math (`clientX/width ratio`) correct on any screen size
  without a resize listener. If the internal resolution ever changes, the
  aspect ratio in CSS has to change with it or clicks land in the wrong cell.

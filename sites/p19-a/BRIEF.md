# BRIEF — train-game (working title in-page: "Trackwright")

## The ask, in their words

"train game. you get some map of procedurally generated terrain with cities, a
railbuilding budget, you draw the tracks at expense, you set up the switches
and the changeovers. full train game experience, make sure it feels like a
train game"

## Acceptance list (from the ask, explicit or clearly implied)

1. Procedurally generated terrain map — varied terrain types, regenerable.
2. Cities placed on the map (named, sized).
3. A railbuilding budget, spent as track is drawn.
4. Player draws tracks by hand; each segment costs money depending on the
   terrain it crosses (cheap on plains, expensive on hills/mountains/water).
5. Switches/junctions ("changeovers") the player sets up themselves — this is
   the mechanic that makes it a train game and not a drawing toy. Trains must
   not auto-pathfind; the player's switch setting decides which way a train
   goes at a junction.
6. Trains actually run on the built network, using the switches, and the
   economics close the loop (revenue funds more track).
7. "Feels like a train game" — terrain rendering, named towns, visible track
   under construction, trains that move and get paid on delivery, a sense of
   consequence when a switch is set wrong (a train sits blocked, or ends up
   somewhere unintended).

Status: verified item-by-item, via the eyes tools, in a real browser under the
production CSP.

1. **Terrain** — confirmed. `look` shows five terrain colours (water/plains/
   forest/hills/mountains) laid out with the two-octave value-noise generator;
   `?seed=N` reproduces the same map, "New map" produces a different one.
2. **Cities** — confirmed. Named, sized, placed only on plains/forest with
   minimum spacing; visible and labelled in every screenshot.
3. **Budget** — confirmed. Starts at $50,000, visibly decrements per segment
   as track is dragged (`drag` steps in `look`/`drive` took it from $50,000 →
   $48,600 → $44,160 → $41,100 across three drags of increasing terrain cost).
4. **Drawing track at expense** — confirmed. Multi-cell drags build an
   L-shaped path cell by cell, each charged individually; confirmed on both
   desktop (1280px) and a real touch drag at 390px mobile width.
5. **Switches/changeovers set by the player** — confirmed, the one that
   mattered most to get right. Built a 3-way junction, cycled it with `drive`
   clicks, watched the highlighted pair change on screen. Then set it
   deliberately AWAY from an incoming train's line and watched, over three
   `wait` calls, the train arrive and turn red/pulsing exactly at the
   junction while a second train queued behind it on the approach track —
   then clicked the switch back and watched both immediately turn green and
   resume. This is on the record in the transcript as two screenshots
   (blocked, then resumed).
6. **Trains run the network, economy closes the loop** — confirmed. A train
   spawned from a connected city, followed the switch state, and either
   delivered (log: "Farnton → Wrenmere: delivered, +$…") or misrouted (log:
   "Bramholm train meant for Reedmere ended up in Farnton — misrouted,
   +$1,073") with revenue added to both the budget and revenue stat.
7. **Feels like a train game** — subjective, but: terrain under the track,
   named towns sized by population, a dashed rail texture, junctions rendered
   as a bright dot with the live pair highlighted and the rest dimmed, a
   pulsing red stalled-train indicator, floating "+$" text on delivery, and a
   scrolling dispatch log narrating what happened and why. Undo and Erase
   (50% refund) both checked working on desktop.

Not directly exercised: the sign-in/save/compare panel (`labPds`/Bluesky
OAuth) — the eyes harness runs on `127.0.0.1`, not `minomobi.com`, so
`auth.mino.mobi`'s CORS allowlist rejects the `/api/me` check every load (see
Gotchas). The code path matches `pds.js`'s documented API exactly and is
wrapped so that failure is silent and non-blocking; it could not be exercised
end-to-end from this sandbox regardless of the CORS mismatch, since OAuth
itself needs a real Bluesky redirect.

## Decisions

- **Grid, not free-draw.** A cols×rows square grid (15×10) with 4-directional
  edges between adjacent cells. Free-hand track would need curve-fitting and
  geometric junction resolution with no time payoff — a grid gives clean,
  unambiguous junctions for the switch mechanic to sit on, which is the part
  the request actually cares about.
- **Cities are always terminuses.** A train arriving at ANY city cell ends its
  trip there (delivers, correct or misrouted), regardless of how much track
  continues past it. This was chosen over "cities are just another node a
  train can pass through" because it keeps the routing model simple (only
  non-city cells of degree ≥3 are switches) and matches how a terminus station
  actually behaves.
- **Switches only exist on non-city junction cells (degree ≥3).** A city with
  multiple outgoing lines picks a random one at spawn instead of needing its
  own switch UI — real dispatch complexity without a second switch concept to
  teach. This was the biggest scope cut: modelling directional (N/S/E/W)
  points was rejected in favour of "a switch is an active pair chosen from the
  cell's full neighbour list, cycled by tapping" — direction-agnostic, so no
  compass bookkeeping anywhere in the simulation.
- **No pathfinding, ever.** Trains only ever look at the current cell's
  neighbours and the switch state there. This is deliberate, not a missing
  feature — the ask specifically wants the player setting switches to matter,
  and a Dijkstra router would make that decorative.
- **Misrouted delivery still pays something (30%), not zero.** A blunt "wrong
  city = no revenue" made early testing (by reasoning, not eyes yet) feel
  punishing for a grid game with no undo-drag. Wrong-city delivery still
  removes the train and logs it distinctly, so the player *sees* the mistake.
- **Revenue flows back into the budget.** Otherwise the budget is a one-shot
  puzzle ("connect as much as you can with $50k") rather than a game with a
  loop. This was a deliberate widening of scope past "draw tracks at expense"
  because a budget that never refills doesn't feel like a train game, it
  feels like a worksheet.
- **Mode buttons (Build / Switch / Erase) instead of gesture heuristics.**
  Distinguishing "tap to toggle a switch" from "drag to build" by movement
  threshold is exactly the kind of thing that works on a mouse and fails on a
  phone. Three explicit modes, each ≥44px, cost nothing and remove the
  ambiguity entirely.
- **kit.handleInput is used for the score-compare box, not for the game
  itself.** The game has no reason to ask for a handle; only the optional
  "compare with a friend" leaderboard feature does, and it uses the shared
  typeahead per the house rule.

## The plan — what's left, in order, if this needs a second turn

Everything in the acceptance list works. If there's a next turn, in order of
value:

1. **A win/end condition.** Right now the game just runs forever — budget
   refills from revenue and there's no score to chase beyond the "total
   revenue" stat. Consider a turn/time limit, or a target ("connect all 7
   towns"), with the final revenue as the thing `postScore` saves. This is
   the biggest gap between "a working simulation" and "a game with a point."
2. **Removing a single edge in Erase mode is coarse.** It refunds 50% per
   segment on a drag, which is correct, but there's no way to erase ONE edge
   at a junction without dragging across it — for a dense network this is
   fiddly on a phone. A tap-to-remove-one-edge mode (distinct from the
   drag-erase) would help; low priority, current behaviour is not broken.
3. **Terrain thresholds are hand-tuned, not calibrated.** `terrainAt()`'s
   cutoffs (0.30/0.55/0.70/0.85) were eyeballed against ~10 generated maps
   during this build and look reasonable (see the screenshots in the
   transcript) but were never swept systematically — an occasional map may
   be mostly water or mostly mountain. If that turns out to be common, tune
   the coarse/fine noise mix in `makeHeightmap` (currently 0.68/0.32) before
   touching the thresholds.
4. **No sound.** Not asked for, but a short whistle/chime on delivery vs. a
   low buzz on a blocked switch would do a lot for "feels like a train game"
   with very little code (WebAudio oscillator, no assets needed — CSP
   allows it).
5. **City size differences are subtle at a glance.** The three population
   tiers (radius 0.16/0.22/0.29 × cell) read as "roughly the same circle" in
   a screenshot. Consider a starker size curve or a small population number
   drawn under the name.

## Gotchas

- **The first Edit that built the `<script>` block accidentally deleted the
  closing `</script></body>` tags** — the file briefly had `boot();` running
  straight into `</html>` with no closing script tag. Caught by re-reading
  the file after the initial batch of edits, not by any tool error (a
  browser would likely have still parsed it via error-recovery, which is the
  dangerous part — it might not have surfaced as a visible bug at all).
  Worth a final read-through of any file assembled via many sequential Edits
  before trusting it.
- **`mcp__eyes__drive`/`look` reload the page fresh on every call** — nothing
  persists between tool invocations (not scroll position, not game state,
  not even the random seed unless it's in the URL). Passing `path: "?seed=N"`
  on every call that needs to interact with a specific map layout was
  necessary to get reproducible pixel coordinates for drag/click steps; the
  first few tool calls in this build wasted screenshots by assuming state
  carried over.
- **The `wheel` step's `dy` is not 1:1 with CSS pixels scrolled** — a `dy` of
  900 in one call produced a very different scroll offset than two
  consecutive calls of `dy: 900` each, and scrolling with big `dy` values
  occasionally landed a screenshot in a genuinely sparse area of the page
  that read as "all black" at a glance. Checked with `eval` against
  `getBoundingClientRect()` before concluding the canvas itself was fine
  (348×232, correctly sized) — the black frames were just scroll-position
  luck, not a layout bug. If a future turn sees an all-black mobile
  screenshot, check geometry with `eval` before assuming the canvas broke.
- **`auth.mino.mobi`'s CORS allow-origin is hardcoded to `https://minomobi.com`**,
  so every `store.ready()` call logs a CORS console error when tested from
  the `127.0.0.1` eyes sandbox. This is expected here, not a bug in this
  site — `pds.js`'s `auth.init()` call is already wrapped in try/catch so it
  fails silently and the sign-in row stays visible, which is the correct
  fallback. It will not happen in production, where the origin matches.
- **Cities are excluded from `isJunction` even at high degree.** This was a
  deliberate design decision (see above), not an oversight — worth restating
  here because it is easy to "fix" by mistake: giving cities switches too
  would need a second, different UI (since a city's departure has no
  `train.prev` to test a pair against), and the ask never required it.

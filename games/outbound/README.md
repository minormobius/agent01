# Outbound

A convoy run across the Europan ice, with a crew you will not get back.
Twenty-fourth century, eleventh year of the war for the ocean underneath.

Play at [games.mino.mobi/outbound/](https://games.mino.mobi/outbound/). Seeded —
`?seed=` is a permalink to a run.

## What it is

The fifth of the `/pressure/` family, and the only one that is a **rebuild of an
earlier one**. [The Ratchet](../ratchet/) had the right mechanic — every choice
permanently removes an option, and the solver can name the move that actually
killed a run — but it presented a road as a table of rows with numbers in them,
so it read as a spreadsheet however it was styled.

The fix was not to hide information. Oregon Trail's map is visible too; its
engine is not uncertainty. It is that the things you lose have names, that events
arrive as prose, and that time passes in a way you can look back through. So:

> **your tools become your crew.** Spending a tool is now a person going
> outside, and it accumulates until you lose them.

Every crossing has trouble on it and exactly three answers, and you give them
by **dragging**:

| gesture | what it does |
|---|---|
| drag a name **onto the ice** | send them out — advances, and doses them |
| drag the gauge **onto the ice** | run the cells hot — advances, costs cells |
| drag a name **into the core** | lay up — costs cells, and does *not* advance |

Tap and keyboard paths exist for all three and route through the same
`actionFor()`, so they cannot drift apart from the gesture.

## Why it is not a list

This is the third pass at the presentation and the first one that worked. The
first two changed the *fiction* — new setting, new lexicon, real Europan
geography — and on a phone it still read as a spreadsheet, because the shape had
never changed: a vertical stack of uniform bordered rows, each with a label on
the left and a number on the right. That is a table. Nothing written inside the
rows fixes it.

What actually fixed it:

- **The route is a horizon, not a list.** Waypoints are glyphs that shrink and
  dim with distance, and the whole strip slides left as the convoy moves, so the
  road recedes instead of enumerating. Perfect information is preserved — tap
  any waypoint to read it in full — but it is no longer all shouted at once.
- **One thing is in front of you.** The crossing you are at is a single large
  panel; everything else is horizon.
- **You spend things by moving them.** Sending a person is now a gesture with a
  direction rather than a row picked from a menu.
- **The horizon fogs** where dead reckoning runs out, so the route ahead has a
  frontier.

Two trips outside is what a person has in them. Cells you can take on at every
depot; people you cannot. That asymmetry is the whole shape of the game.

## Why Europa

The setting is doing work, not paint. Everything outside the crawler's shielded
core sits inside Jupiter's radiation belt, so **the central number has a physical
cause**: going out there is measured in dose, and two trips is what a body has in
it. The generic space-opera version of this game called the same stat "strain"
and had to hand-wave what it actually was.

The map is real. Europa's features were named by the IAU out of Celtic and Greek
myth — Conamara, Pwyll, Thera Macula, Agenor Linea, Manannán, Rhadamanthys — so
every place on a route is a place that exists, and the atmosphere costs nothing.

## Showing the work

The solver computed a great deal the player never saw. Two places it is visible
now, and the split between them is the design:

**During the run — dead reckoning.** `O.reckon` is one naive forward walk (send
the freshest untouched qualified hand, otherwise burn) and it fogs the horizon
where it thinks the convoy stops. It is deliberately **not** the solver. One
honest caveat: a policy that completes proves the route is completable, so a
frontier that clears to the depot does tell you that you are alive. It never
tells you the reverse. Measured at **18%** of live routes, so a short frontier
is the normal case rather than an alarm — and the selftest pins that number
below 60%, because if it ever approached 100% the fog would become a viability
oracle and the silence rule would be dead.

**After the run — the ways-through chart.** `O.ceilingSeries` replays what you
actually drove and reports, at each decision, how many of the options in front
of you kept the run alive. It can only fall, so the shape of it *is* the run: a
few tall bars, a red one where the last way closed, then flat stubs for every
crossing you drove after it was already over.

## Why the solver still works

The viability solver is inherited whole from The Ratchet: after every choice it
answers *can this run still be finished?* exactly, by memoised depth-first
search. That is only sound because **the state graph is acyclic**, and laying up
is the action that could have broken it — it lowers a person's dose, so it might
undo an earlier move.

It cannot, because it always costs cells, and the only thing that ever hands
cells back is a stripped vehicle, which is collected on the way past a crossing
and so advances too. Order the states by `(crossing ascending, cells descending)`
and every action moves strictly forward in that order.

The selftest does not take that paragraph's word for it: it walks the **entire
reachable state graph** of two dozen generated routes — around 22,000 states —
and asserts the ordering on every single transition. A cycle here would not fail
politely; an unbounded memoised DFS hangs.

(Internally the code still calls these `fuel` and `strain`. Renaming the fields
across six files and the tests would have been a large diff with real regression
risk for zero player benefit, so the rename stopped at the surface.)

## Running the tests

```bash
node games/outbound/test/outbound.selftest.mjs   # invariants; preflight runs this
node games/outbound/test/analysis.mjs 25         # difficulty + foresight report
node games/outbound/test/sweep.mjs 12            # parameter sweep (slow, ~15 min)
```

The reports are built on [`packages/pressure-lab/`](../../packages/pressure-lab/).
They are *measurements*, not pass/fail — read the analysis after moving any number
in `js/config.js`.

## What the numbers say

Measured over 25 routes per leg, legs 4+:

| | |
|---|---|
| decisions where half the options are traps | 39% |
| decisions with essentially one way through | 17% |
| decisions asking nothing | 34% |
| routes with a genuine fork, leg 8 | 76% |
| **median crossings driven after the run was already lost** | **4** |

That last row is the number this game exists for. Perfect play is unbounded (the
generator guarantees each leg is finishable on arrival, as in The Ratchet);
careless play averages two depots and buries seven people getting there.

The Europa re-skin was deliberately a **strict 1:1 mapping** — every `needs` pair
and every toll preserved exactly — because those are the coverage graph the
difficulty was measured against. Renaming trouble is free; re-pairing it would
have silently invalidated every number above.

## What the measuring found that playing would not

Five design-breaking bugs, none of which were visible from playing:

1. **The generator was refilling the crew.** `makeFinishable` repaired an
   unwinnable roll by signing on another hand — inherited from The Ratchet, where
   granting another tool was free because tools were a per-route resource. Here it
   quietly refilled the one resource the whole game is about: perfect play buried
   23 people across a twelve-leg haul and never suffered for it. The repairs are
   now ordered by what they cost the player *later* — fuel, then distance, and
   signing someone on only as a last resort.

2. **A layover was a full reset.** Resting relieved the entire crew for a flat
   two fuel, so at six fuel a port you could wipe the whole crew's wear twice over
   and strain never accumulated. The irreversibility the game is named for had
   stopped existing. A layover now relieves **one person**, which also turns it
   from a formality into a question: whose turn to sit one out.

3. **`st.toll` was decorative.** The rules read the hazard *kind's* base toll, so
   per-system tolls were displayed but never charged. Fixing it also unlocked the
   best of the generator's tightening levers — one stretch simply being a longer
   burn than the chart said.

4. **Tightening against the wrong choice.** The generator rated the *opening*
   decision, which is deliberately forgiving, so it declared the job done and
   handed over hauls where 63% of every decision had no wrong answer. It now
   tightens against the narrowest choice on a perfect crossing (`O.narrowest`).

5. **Four parameter changes in a row that felt like improvements and were not.**
   Raising the fuel budget so burning would be a real option pushed "decisions
   with no wrong answer" from 35% to 65%. That is what `test/sweep.mjs` exists
   for, and it is what settled `maxStrain` at 2 rather than 3 — 44% of decisions
   asking nothing versus 21%.

Plus two ordinary ones: crew ids were derived from roster length, so a hire could
collide with a survivor across legs; and a rejected layover docked the cells
before refusing, which would have corrupted the solver's search.

And one the setting exposed: prose lines were drawn independently per crossing,
so a route carrying four pressure breaches — which the deficit mechanic plants
deliberately — printed the same sentence twice on one screen. Lines are now drawn
without replacement per kind, and there are five of each rather than three. It
reads as a template the instant you notice it, and that undoes the only thing
separating this from a table of rows.

## Layout

| | |
|---|---|
| `js/config.js` | every tunable number, read at call time so the sweep can walk them |
| `js/prng.js` | seeded core — `(seed, leg)` and nothing after is random |
| `js/rules.js` | pure state machine; the acyclicity argument lives in its header |
| `js/solve.js` | viability, tightness, `narrowest`, `reckon`, `ceilingSeries`, the post-mortem |
| `js/generate.js` | the route, the lexicon, and the generate → check → tighten loop |
| `js/main.js` | horizon, drag-and-drop, the forecast, the convoy log |
| `test/` | harness, selftest, analysis report, parameter sweep |

Pure static — no worker or DO changes; it serves through the assets fallback in
`games/worker.js`.

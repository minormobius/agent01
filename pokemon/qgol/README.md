# qgol — Conway's Game of QWOP

Live at [`poke.mino.mobi/qgol/`](https://poke.mino.mobi/qgol/). A generation of
Life, split across four keys, plus an autoplay showcase that drives soups Conway
would extinguish into proliferation instead.

Pure HTML + ES modules + Canvas 2D. No build step, no dependencies. **This page
shares no physics with the rest of the surface** — no cilia, no *Pterosperma*,
nothing measured. It is here because it is the same four keys: `/qwop/` and
`/graze/` put Q W O P on a real swimmer, this one puts them on a rule.

## Files

- `index.html` — shell, both modes, input, main loop, long-form notes.
- `life.js` — the automaton, the operators, the controllers. All simulation.
- `draw.js` — all rendering. No simulation.
- `qgol.selftest.mjs` — `node pokemon/qgol/qgol.selftest.mjs`. An experiment, not a checklist.

## The decomposition

The design problem: a generation of Life is one button, and to make a QWOP of it
you have to split that button four ways so the player is working the machinery
rather than pressing *step*. The obvious splits all fail the same way.

Splitting the **ruleset** — Q turns on extra birth conditions, W removes
survival conditions — makes the keys into rule-modifier switches. That is a rule
editor, not a mechanism. And every attempt to give a key to **survivals**
produces one key with nothing to do, because in Life survival is not an
operation: it is what happens to a cell when nothing is done to it.

What makes Life *Life* is not any of its four clauses. It is **simultaneity** —
every birth and death computed from the same frozen snapshot and applied at
once. Evaluate them one at a time against a board that is already changing and
you have a different automaton. So simultaneity is the thing worth a key, and
the split is three **marks** and one **commit**:

| key | operator | does | touches the board? |
|---|---|---|---|
| `Q` | `markBirths` | mark every dead cell with exactly 3 live neighbours | no |
| `W` | `markLonely` | mark every live cell with fewer than 2 | no |
| `O` | `markCrowded` | mark every live cell with more than 3 | no |
| `P` | `commit` | apply every mark at once, wipe the ledger | **yes** |

Because marking never mutates anything, all three marks see the same unchanged
board however they are interleaved, so **Q W O P is exactly one generation of
B3/S23** — not an approximation. Three of the keys are the rule; the fourth is
the clock.

The ledger is worth rendering for its own sake: a coloured cell is *condemned
but still alive*, a green pip is *not alive yet*. Ordinary Life has no moment at
which that state exists.

### What the subsets do

| press | get |
|---|---|
| `Q P` | births with nothing dying — runaway growth |
| `W O P` | a filter, not an executioner — see below |
| `Q W P` | Life with no overcrowding — explosive |
| `Q O P` | Life with no loneliness — sparse and stringy |
| `Q W O P` | Conway, exactly |

That second row is a correction the selftest forced. It said *guaranteed
extinction* until the test refused it: deaths-only settles on 13 cells and stays
there. With no births the population is monotone and bounded, so it must reach a
fixed point — and a fixed point is by definition a board where nothing gets
marked, i.e. where every live cell has two or three neighbours. Deaths-only is a
**filter that extracts the S23 core** of whatever you hand it; a block survives
it forever. On 20 random boards none of the fixed points were empty.

## The two modes

**DRIVE** hands you a soup Conway kills, and the generation it dies at. Beat it.
Two ways to lose, and the second is the interesting one: extinction, and
**stasis** — eight consecutive commits that change nothing. A board frozen into
still lifes has a population and no life in it, so filling the grid and stopping
is not a win. Skill shows in the *deviation* readout: the fewer generations on
which you departed from plain Conway, the better you played.

**SHOWCASE** is the part worth having. The controller is
`mercy(low, drop)` — run plain Conway until the population falls below `low`,
then suspend one or both death operators until it recovers. It never adds a
rule, never places a cell, never touches the board. It only declines to enforce
a clause, and only when things are already desperate.

`mercy` lives in `life.js` and is imported by **both** the page and the
selftest, deliberately. A showcase that retyped its own copy of the controller
would be demonstrating something adjacent to what was measured.

## What the selftest found

Two jobs, pulling in opposite directions.

**That the decomposition is exact.** Checked cell for cell against a reference
implementation written the ordinary way and sharing no code with the operator
model — 40 random boards × 15 generations, all six orderings of the three marks
agreeing, and a glider displacing exactly (1,1) every four generations.

**That a controller can rescue a doomed soup.** Swept, not hand-picked, over the
six soups Conway extinguishes, 600 generations each:

| mercy | below | survived | final pop | activity | deviated on |
|---|---|---|---|---|---|
| lonely | 8 | 6/6 | 16 | 7.2 | 33% |
| **lonely** | **16** | **6/6** | **74** | **44.6** | **1%** |
| lonely | 32 | 6/6 | 127 | 89.1 | 1% |
| crowded | 8 | 0/6 | 0 | 21.6 | 12% |
| crowded | 16 | 3/6 | 4 | 12.0 | 55% |
| crowded | 32 | 3/6 | 6 | 10.4 | 83% |
| both | 8 | 6/6 | 12 | 1.3 | 33% |
| both | 16 | 6/6 | 65 | 35.4 | 14% |
| both | 32 | 6/6 | 147 | 90.2 | 2% |

Rescuing every doomed soup costs **one generation in a hundred**; on the other
ninety-nine the automaton is running unmodified Conway. That is the result worth
having — not that a board can be kept alive by overriding it (anyone can, by
never running a death operator) but that an intervention this thin suffices, if
it is aimed correctly.

And it has to be aimed. The striking row is **crowded**: suspending overcrowding
rescues *nothing*, while intervening twelve times as often as the controller
that rescues everything. More meddling, worse outcome. Dying soups are not dying
of overcrowding — they are thinning and fragmenting, and the clause killing them
is loneliness.

"Kept alive" is trivially satisfiable — never run a death operator and the board
fills with a frozen slab — so survival alone does not pass. The world has to
still be **changing** (`activity > 20`) and must not have **saturated**
(`< 0.7` of the grid). Both gates are in the test for that reason.

## Honestly

Six doomed soups is a small sample: the first six seeds under 400 that Conway
extinguishes at this board size. Not cherry-picked, not a survey either. The
world is a 64×48 torus, because a closed world with a carrying capacity is the
right shape for asking whether a population lives or dies — on an unbounded
plane "growth" can always be answered by running away.

The showcase steps in **wall time** (150 generations/second), not per frame. A
fixed count per frame would tie the run's speed to the display, and the whole
point of the trace is that two runs are comparable.

`index.html` exposes `window.__qgol()` for headless driving, same convention as
`/graze/`. It was used to check, in real Chrome with real key events, that DRIVE
reproduces the reference implementation exactly over 12 generations and that
SHOWCASE keeps seed 57 alive past the generation Conway kills it at. That check
is ad hoc, not in `preflight` — the shipped tests here are node-only, like the
rest of the surface.

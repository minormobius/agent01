# Bucky

Logic gates on a buckyball, at `games.mino.mobi/bucky/`. In the tradition
of the early-80s educational logic games, where you wired gates from
sensors to a boot, but on C60.

## Why C60

Every one of the 60 carbon atoms has exactly **three bonds**. That is
exactly the budget of a two-input gate, two arrows in and one out, and of a
splitter, one in and two out. So the ball needs no extra rules about how
many wires fit where: the chemistry is the constraint.

| part | in | out |
|---|---|---|
| wire | 1 | up to 2 (a wire is also a splitter) |
| NOT | 1 | up to 2 |
| AND, OR, XOR, NAND, NOR | 2 | 1 |
| source (the level's input) | 0 | up to 3 |
| lamp (the level's output) | 1 | 0 |

An atom with too few inputs is *open* (dashed, drives 0). One with too
many, or an arrow it can't have, is *bad* (red, drives 0).

The ball is a sphere, so the wiring is **planar**: wires can't cross.
Routing round each other is half of every level after the first few.

## The clock

Time is synchronous and every atom costs one tick, wires included:
`next[a] = part(a)(inputs of a, now)`. So:

- a loop is a delay line. A ring of wires holds whatever pattern is in it;
  an even number of NOTs in a ring does too.
- put one NOT in a ring and it can never settle. From cold (all zero) it
  blinks with a period of twice its length: round a pentagon, 10 ticks.
- five NOTs round a pentagon blink every tick instead, all together. They
  are an odd ring, but from all-zero they flip in step.
- two NORs feeding each other are a latch, provided it starts from a
  defined state. Started from all-zero with both inputs off, the pair
  never settles: a ring only ever rotates its contents, and from cold the
  two NORs put two flips into it that go round for ever. That is why the
  latch level opens with a RESET.

The selftest checks each of those claims.

## The checks

Every edit re-runs the level's check in full; the table under the ball
is always the truth.

- **table**: each row from a cold start, inputs held for 72 ticks; every
  lamp must sit still at the right value for the last 8. The longest
  possible path on the ball is 59 atoms, so 72 is always enough to settle.
- **seq** (the latch): the same, but the rows run on without a reset in
  between, so the circuit has to remember.
- **blink**: from cold, the lamp must flip at least 4 times in the second
  half of 160 ticks.

## Par

Par is the fewest parts (wires plus gates; sources and lamps are free) a
router found. `B.route` takes the level's reference netlist, drops the
gates on random atoms, and wires each connection breadth-first through
empty atoms; `B.par` keeps the best of thousands, then climbs, moving one
gate at a time. A loop back into its own net (the clock's NOT feeding
itself) leaves and returns by different bonds.

It is a **best known**, not a proved optimum, and the router only knows
the reference circuit. A different circuit can beat it, and the game says
so when you do. `tools/bake.mjs` writes `js/par.js` (minutes); the
selftest re-checks every baked design against its level.

## Files

| | |
|---|---|
| `js/ball.js` | C60 from the icosahedron: atoms, bonds, the 12 pentagons and 20 hexagons |
| `js/logic.js` | parts, the clock, the checks, the 12 levels, the router |
| `js/par.js` | generated: each level's par and the design that does it |
| `js/view.js` | orthographic canvas renderer, picking |
| `js/main.js` | the page: drawing wire, placing parts, the live clock, levels |
| `test/bucky.selftest.mjs` | `node games/bucky/test/bucky.selftest.mjs` |

Designs and best counts live in `localStorage` (`bucky-v1`).

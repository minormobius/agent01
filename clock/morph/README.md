# morph — recursive circuits, growing out loud

`g.mino.mobi/morph/` · part of the [`g`](../../g/CLAUDE.md) gallery.

Write a few lines of a tiny hardware description language. A single cell divides
into subcells, which divide again, wiring themselves to each other as they go —
and while that happens a force layout is running, so the circuit shoves its way
out into space instead of being laid out once at the end. Every cell that
appears plays a note.

It grows adders. It also grows things that look like Haeckel plates. Those turn
out to be the same trick.

## Where this comes from

[**MorphoHDL**](https://paradigms-of-intelligence.github.io/morpho/), by
Alexander Mordvintsev at Google's Paradigms of Intelligence group, is the
original: "a minimalistic language for growing circuits". Read that article
first — it is short, and it is where all the good ideas here are from. The core
of it:

* **Cells are rewrite rules.** A node is replaced by a set of subcells, wired to
  one another and to the parent's inputs and outputs.
* **Bus widths are never declared.** They are inferred when a cell is
  instantiated, so one definition covers every width.
* **The only control flow is failure.** `SPLIT` on a one-wire bus fails, an
  index off the end of a bus fails, a gate on an empty bus fails — and the
  compiler unwinds to that cell's `fallback`. Recursion stops when the buses
  stop dividing.

Mordvintsev built it to write ripple-carry and Brent–Kung adders, then noticed
the layouts looked like *Kunstformen der Natur* and pushed the same recursion at
shape: rings, tubes, chains, branching trees, the medusa.

**What is ours:** this is an independent implementation in Rust — not a port,
and it shares no code with the original. The sound is entirely an addition;
morpho's demos are silent. Where the two differ is listed under
[Not the original](#not-the-original).

## What is actually running

Every frame, in `solver/`:

1. **Expand some cells.** Each expansion runs one cell body, instantiating
   gates and child cells and wiring them into the buses the parent already
   holds ([`graph.rs`](solver/src/graph.rs)).
2. **Relax the layout a few steps.** Barnes–Hut repulsion, springs along the
   wires weighted by endpoint degree, and a weak centring pull
   ([`layout.rs`](solver/src/layout.rs)).
3. **Hand over what was created**, for the sound.

Steps 1 and 2 sharing a frame *is* the effect. A subcell is born on top of its
parent and has to push its way out through everything already there. Grow first
and relax second and you get a diagram; interleave them and you get something
that looks alive.

### The chicken and the egg

To wire a child cell into its parent you need to know how many wires it emits.
That is only knowable by working out what it expands into — which needs its
children, and so on down. The original solves this by *materialising on demand*,
and so does this: `Engine::resolve` runs a cell body in **probe mode** — the
same interpreter, allocating throwaway net ids and creating no nodes — purely to
learn its output widths, which fallback it lands on, and how big it will
eventually get. Results are cached by `(cell, input widths)`.

Probing and growing being the *same* interpreter behind one flag is the part
worth keeping: the widths a probe predicts cannot drift from the widths growth
produces.

### Depth, and why it is recomputed

Colour is a cell's longest gate path from an input. The value assigned when a
cell is created is only a guess — a gate wired to an unexpanded cell's output
cannot know what will eventually drive that net. Left alone those guesses never
correct themselves and the gradient slowly stops meaning anything, so depth is
recomputed outright (a Kahn pass over the DAG) whenever the graph changes. You
can see it working: the ripple adder reports depth 32 and the Brent–Kung adder
depth 11, for the same 32-bit addition. That gap is the entire point of a
parallel prefix adder, and it is legible on the canvas.

## The language

```text
gate NOT 1                      # a terminal node of some arity
gate XOR 2

cell triangle(x) fallback %0 {  # %0: on failure, pass argument 0 through
    y = XOR(x[1:], x[:-1])      # gate adjacent wire pairs — one row shorter
    z = NOT(y)
    return triangle(z)          # tail recursion
}

grow triangle(40)               # entry cell, and the widths to grow it at
```

| | |
|---|---|
| `SPLIT(x)` | halves a bus, middle wire low. Fails below two wires |
| `CAT(a, b, …)` | concatenate, least-significant first |
| `LSLICE(x, ref)` / `HSLICE(x, ref)` | take `len(ref)` wires off one end, return slice and remainder |
| `REPEAT(v, ref)` | `len(ref)` copies of a one-wire bus |
| `x[1:]` `x[:-1]` `x[0]` `x[::-1]` | Python slicing. `x[i]` fails out of bounds — that is how a cell says "stop" |
| `ZERO` `ONE` | one-wire constant buses |
| `fallback %N` | resolve to positional argument N, creating nothing |
| `fallback other` | resolve to another cell with the same signature |

Gates carry an arity and nothing else — no truth table. This engine grows
*topology*; it never evaluates a boolean, so a truth table would be decoration
for logic that is never run. That is a real limitation, not a simplification:
see below.

## Not the original

Deliberate departures, so nobody reads this as a faithful reimplementation:

| | |
|---|---|
| **No logic evaluation** | no constant propagation, no dead-code elimination. The original prunes the circuit as it grows; the shapes here are therefore denser in places where it would have simplified. Most visible on the collapsing grid, which the original optimises down to isolated segments and this does not. |
| **No fanout limit or buffer insertion** | the original caps fanout at 4 and inserts `BUF` repeaters, which both models real electrical loading and spreads the layout. Here a high-degree net is instead handled in the layout, by weighting each spring by its endpoints' degree. |
| **No cell substitution** | the original passes cells as keyword arguments (`grid(x, y, grid_base=base_skip)`) to vary a base case without duplicating the recursion. Not implemented. |
| **Own syntax** | the original is embedded in Python. This has a small parser of its own, so the page can compile what you type without shipping an interpreter. |
| **Sound** | entirely ours. |

## Files

| | |
|---|---|
| `index.html` | the page: canvas, dock, controls, live source editor |
| `render.js` | WebGL2 renderer, all GLSL inline — instanced glow cells and wire segments |
| `solver.js` | wasm glue: typed-array views over linear memory |
| `audio.js` | Web Audio: per-cell plucks over a drone driven by the graph's state |
| `presets.js` | the shipped programs, imported by the page *and* by the selftest |
| `morph.wasm` | **build product, committed** — see below |
| `morph.selftest.mjs` | headless check of the committed wasm (preflight runs it) |
| `solver/` | the Rust crate: `lang.rs`, `graph.rs`, `layout.rs`, `rng.rs` |
| `package.json` | only so node treats this directory's `.js` as ES modules, which is what lets the selftest import the same `presets.js` the page does |

## The sound

Two layers, both driven by the same wasm the picture is drawn from.

**Plucks** — one note per cell created, pitched by the recursion depth it was
born at, pulled down an octave and hit harder when the bus it was a lane of was
wide. Early on you hear individual divisions; as the structure fills in they run
together. Everything is minor pentatonic, because a burst can start forty notes
inside a second and any interval that can clash, will.

**Drone** — a held chord whose upper partials fade in as the graph gets denser
and whose filter closes as the layout stops moving. It is the *state* of the
structure rather than its events: you can hear a piece settle with your eyes
shut.

A wide expansion can create thousands of gates in one frame. At most a few
become notes — spread a few milliseconds apart so a burst arpeggiates instead of
clicking — and the rest are counted, not queued.

## Controls

Dock, bottom right: 🔇 sound, 🎲 next program, ↺ grow again, `</>` source, ⚙
controls. Keys: `space` pause, `r` regrow, `s` sound, `e` source, `g` controls,
`f` recentre. Drag to pan, wheel to zoom; either stops the camera from
following, and `f` gives it back.

The panel's two schedules are worth trying against each other. Breadth-first
gives a moving growth front; largest-first expands the biggest pending cell
first, so the whole structure thickens at once. **Same final graph** — the
selftest asserts that — but very different things to watch.

## Building the wasm

```bash
cd solver
cargo test --release                                  # the structure tests
cargo build --release --target wasm32-unknown-unknown
cp target/wasm32-unknown-unknown/release/morph_solver.wasm ../morph.wasm
node ../morph.selftest.mjs
```

No wasm-bindgen and no build step for the page: the module exports a handful of
C functions plus its memory, and everything bulky is read out of linear memory
as `Float32Array` views. `layout()` reports the buffer strides the wasm was
built with and `solver.js` asserts against them, so a field added on one side
and not the other fails loudly instead of rendering nonsense.

In CI this is [`build-morph-solver.yml`](../../.github/workflows/build-morph-solver.yml),
which runs the tests, builds, runs the selftest against the *fresh* binary, then
commits the `.wasm` and dispatches `deploy-g`. The trigger is scoped to the Rust
source, never to the `.wasm`, so there is no loop.

`morph.wasm` is committed, and there is no JS fallback — this module *is* the
simulation. The artefact must never drift from the source, which is what
`morph.selftest.mjs` exists to catch.

## Tests

`solver/tests/structure.rs` grows programs to completion and checks exact gate
counts worked out by hand from the recurrences — 992 for `triangle(32)`, 64 for
a 32-bit ripple adder, 336 for the medusa. Counting gates is a strong check: it
catches a mis-resolved fallback, an off-by-one in `SPLIT`, a slice that clamps
where it should fail, and a bud that quietly stops expanding, all of which look
plausible on screen. It also asserts that a non-narrowing recursion terminates
rather than hanging the tab, and that both schedules reach the same structure.

`morph.selftest.mjs` re-checks those counts against the committed wasm, and
grows every preset in `presets.js` — a preset that stops resolving is a failing
check rather than an empty canvas someone finds later.

## Reusing the effect elsewhere

Nothing here is coupled to the page. `solver.js` + `morph.wasm` is a
self-contained graph grower, `render.js` takes two `Float32Array`s, and
`audio.js` takes an event buffer and a stat block. For an ambient background:
pick a program, set `grow` low and `relax` high, drop `glow` and `cell size`,
and leave the sound off until a user asks for it.

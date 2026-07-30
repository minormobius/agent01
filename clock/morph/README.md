# morph — recursive circuits, growing out loud

`g.mino.mobi/morph/` · part of the [`g`](../../g/CLAUDE.md) gallery.

Write a few lines of a tiny hardware description language. A single cell divides
into subcells, which divide again, wiring themselves to each other as they go —
and while that happens a force layout is running, so the circuit shoves its way
out into space instead of being laid out once at the end.

Then pulses are poured into the inputs, and what you hear is them arriving. The
score is the topology: a gate fires when a signal reaches it, so the circuit's
own shape decides when every note lands.

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

The engine's unit of time is a **tick**, not a frame. Each one, in `solver/`:

1. **Expand some cells.** Each expansion runs one cell body, instantiating
   gates and child cells and wiring them into the buses the parent already
   holds ([`graph.rs`](solver/src/graph.rs)).
2. **Relax the layout a few steps.** Barnes–Hut repulsion, springs along the
   wires weighted by endpoint degree, and a weak centring pull
   ([`layout.rs`](solver/src/layout.rs)).
3. **Propagate one step of signal** through the wires
   ([`signal.rs`](solver/src/signal.rs)).
4. **Hand over what happened** — gates that fired, cells that were born.

Steps 1 and 2 sharing a tick *is* the growth effect. A subcell is born on top of
its parent and has to push its way out through everything already there. Grow
first and relax second and you get a diagram; interleave them and you get
something that looks alive.

The page decides how many ticks a rendered frame is worth, which is what the
tick-speed control moves — from one tick every sixteen frames, slow enough to
watch a wavefront advance a single level at a time, up to sixteen a tick ahead
of the display. Growth, layout and signal all scale together, so nothing changes
character; only how fast you are watching it.

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

## The signal

Growth says what the circuit *is*. Signals say what it *does*, and they are
where both the sound and the pulse you can see come from.

The model is leaky integrate-and-fire, one cell per neuron. A firing gate
delivers a fixed charge to everything it drives; charge leaks away between
ticks, so inputs only add up if they arrive close together; past a threshold the
cell fires and then sits out a refractory period. Pulses are injected at the
gates with nothing driving them — the ones reading primary inputs — and a
wavefront sweeps outward at one level per tick.

This is deliberately **not** boolean evaluation. The engine grows topology and
never computes a truth value, so nothing here is simulating what the adder would
output. What it gives instead is a wave whose shape is the graph's shape, and
that turns out to be the more interesting thing: a 32-bit ripple adder has a
carry chain 32 gates deep and sweeps as a long arpeggio, while a Brent–Kung
adder computing the very same sum is 11 deep and lands almost as a chord. The
difference between linear and logarithmic depth stops being a claim in an
article and becomes something you can hear.

Three knobs, and each does something quite different:

* **waves in flight** — scaled by the structure's depth inside the engine, so
  the same setting means the same thing on a 3-deep mux tree and a 78-deep
  triangle. Around 1 gives a single wave with darkness behind it; higher values
  overlap and interfere. A raw per-tick rate cannot do this: whatever suits the
  mux tree floods the triangle into a solid sheet of light.
* **threshold** — below the per-wire charge, one input is enough and the wave
  advances a clean level per tick. Above it a gate needs two inputs inside the
  leak window, which selects on *graph shape*: a triangle's rows have paired
  parents and carry on regardless, while a ripple adder's carry chain is single
  drivers all the way down and stops dead at the first link.
* **leak** — with none, everything eventually fires and the structure saturates
  into white noise; with too much, nothing past depth two ever reaches
  threshold. The window between is where a structure sounds like itself.

## Feedback, and why it matters

Every other construct here builds a DAG. `wire` is the exception, and it is the
difference between a structure that is played and one that plays itself.

```text
cell relay(x, n) {
    wire fb ~ x            # as wide as x, driven below
    y = XOR(x, fb)
    d = chain(y, n)        # the delay line sets the period
    fb = NOT(d)            # …and this closes the loop
    return d
}
```

Feedback needs a width before the thing producing it exists, and this engine
infers widths rather than declaring them, so something has to break the
circularity. Taking the width from an existing bus keeps cells size-agnostic —
`wire fb ~ x` is as wide as `x` turns out to be — while making the loop visible
in the source instead of implied by a name appearing twice. Driving the wire
merges it onto its real driver, so everything already wired to the placeholder
resolves to the new source without being rebuilt. A wire nobody drives is a
floating net, and fails like every other mistake in this language.

**Why it was worth doing.** Before feedback, a phase sweep over the whole signal
parameter space came back as a single class, and the measured period was always
`depth / rate` — the injection clock wearing the graph as a costume. Nothing the
structure did was its own. With a loop, a single kick and then *no driver at
all* gives activity that never stops, at a period set by the loop's own length.
Lengthen the delay line and it slows down. That is a countable axis — one
species per loop length — which is the thing a continuous genome cannot give
you.

There is a hard boundary in it, too, and it is structural rather than a matter
of taste: re-entry only works when a wave takes longer to come round than a cell
takes to recover, and when a single input is enough to trigger a gate. Push the
threshold past the per-wire charge and every loop dies at its first link. The
same sweep now shows sustained activity below that line and extinction above it.

One honest consequence: depth is computed over strongly connected components, so
every cell in one loop shares a depth — no member of a cycle is further from the
inputs than any other. A fully recurrent structure therefore colours flat. That
is the truth about it rather than a rendering bug.

## Apoptosis, and the ceiling as a carrying capacity

Growth on its own terminates: the rewrite runs out of buds and the structure
stands there. Turn **starvation** up and cells that stop conducting are removed
— and a lineage that loses every descendant re-arms as a bud and divides again.

That second half is what makes it a cycle rather than an erosion. A finished
program has no buds left, so death alone would wear it down to nothing; handing
the lineage back to its parent is the only source of new cells there is.

Together the two change what `MAX_CELLS` *means*. It used to be a failure state
— growth giving up, the `capped` flag. With death in the loop the same number is
a **carrying capacity**, and the structure sits against it, dividing and dying,
indefinitely. Measured on a 32-bit ripple adder with the threshold above the
per-wire charge, so its carry chain stops conducting:

| ticks | living cells | slots allocated | deaths | regrowths |
|---|---|---|---|---|
| 1,000 | 61 | 127 | 2,846 | 1,423 |
| 5,000 | 61 | 127 | 14,384 | 7,192 |
| 10,000 | 64 | 127 | 28,768 | 14,384 |

Bounded memory, unbounded time. The slot count holding at 127 is the load-bearing
number: dead cells hand their slots back, so churning does not exhaust the
arrays after a few dozen generations. Without that the whole idea quietly fails,
which is why it is asserted rather than assumed.

Death is **selective**, not decay: a structure that conducts everywhere loses
nothing at all. What starvation actually does is prune a structure down to the
part of itself that carries signal — form following function, which is the
coupling the original article names as its endpoint and never builds. Signal
decides structure; structure decides signal.

What is missing is mutation. Because death and regrowth are both deterministic,
a lineage regrows into exactly what it was, so this is homeostasis rather than
evolution — turnover around a fixed point, not open-ended novelty. That is the
honest limit of it, and mutation is the ingredient that breaks it.

Two things worth knowing before turning the knob:

* **Starvation is measured against the wave period.** A cell fires roughly once
  per wave, so a limit shorter than `depth / rate` starves the whole structure
  at once. Longer than that and it only catches what genuinely stopped
  conducting.
* **Nothing dies without a growth budget.** Regrowth needs cells per tick above
  zero, or lineages re-arm as buds and then sit there, never dividing.

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
| `wire n ~ ref` | a bus as wide as `ref` whose driver comes *later* in the body — the only forward reference, and the only way to close a loop |
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
| **Signals** | entirely ours. The original grows circuits and stops; nothing propagates through them. |
| **Sound** | entirely ours. Morpho's demos are silent. |

## Files

| | |
|---|---|
| `index.html` | the page: canvas, dock, controls, live source editor |
| `render.js` | WebGL2 renderer, all GLSL inline — instanced glow cells and wire segments |
| `solver.js` | wasm glue: typed-array views over linear memory |
| `audio.js` | Web Audio: a pluck per gate firing, a bell per cell formed |
| `presets.js` | the shipped programs, imported by the page *and* by the selftest |
| `morph.wasm` | **build product, committed** — see below |
| `morph.selftest.mjs` | headless check of the committed wasm (preflight runs it) |
| `solver/` | the Rust crate: `lang.rs`, `graph.rs`, `layout.rs`, `signal.rs`, `rng.rs` |
| `package.json` | only so node treats this directory's `.js` as ES modules, which is what lets the selftest import the same `presets.js` the page does |

## The sound

Nothing here invents rhythm. Two instruments, both struck by the engine and
nothing else.

**Plucks — conduction.** One per gate firing, and the main voice. Pitch comes
from the gate's depth from the inputs, normalised by the structure's own depth
so a 5-deep circuit and a 78-deep one use the same range; a wavefront descending
therefore sweeps in pitch, and you can hear where in the circuit it currently
is. Timbre comes from which gate it is, velocity from fanout — the gates about
to wake up a lot of the structure hit hardest.

**Bells — formation.** One per cell created, on the inharmonic tubular-bell
ratios (1 : 2.76 : 5.4), each higher partial quieter and decaying faster, which
is what gives a bell its bright strike collapsing into a hum. Pitched by depth
in the *lineage* rather than distance from the inputs, so a recursion descending
through the structure walks up the scale and a cell's pitch says where in the
family tree it appeared. Formation and conduction are different events and are
deliberately not two shades of the same sound. Growth is a handful of seconds,
so the bells are what the opening is made of — and then they stop.

**There is no drone.** There was one, and the piece is better without it: a held
pad fills the gaps and papers over the structure, and what should be left is
only ever the graph doing something. The reverb is now the only thing holding
the space together, so it is generous.

Everything is minor pentatonic, because a wavefront can fire four hundred gates
on one tick and any interval that can clash, will. At most a few events become
notes — spread a few milliseconds apart so a burst arpeggiates in the order the
signal actually travelled — and the rest are counted, not queued.

Each instrument gets **its own voice pool**, which matters more than it sounds
like it should. With a single shared pool the plucks take every slot — conduction
is relentless, growth is bursty — so the structure gets silently added to while
all you hear is it conducting.

The useful consequence of driving conduction from firings rather than from
growth: a finished, motionless circuit still plays. Growth is a few seconds; the
piece is as long as you leave it open.

## Controls

Dock, bottom right: 🔇 sound, 🎲 next program, ↺ grow again, `</>` source, ⚙
controls. Keys: `space` pause, `r` regrow, `s` sound, `e` source, `g` controls,
`f` recentre, `[` and `]` tick speed. Drag to pan, wheel to zoom; either stops
the camera from following, and `f` gives it back.

**Tick speed** is the one to reach for first. Wind it down to 1/16× and the
wavefront advances a level at a time, slowly enough to follow a carry along a
ripple adder's chain gate by gate.

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

`solver/tests/signals.rs` checks that the wave follows the graph rather than the
clock: that a single pulse crosses a structure in about as many ticks as it is
deep, that Brent–Kung finishes several times sooner than the ripple adder, that
one wave lights each reachable gate exactly once, and that raising the threshold
kills a single-driver chain while leaving paired drivers alone. If propagation
ever stopped depending on topology the page would still look and sound busy —
which is exactly why it needs asserting rather than watching.

`morph.selftest.mjs` re-checks the gate counts against the committed wasm, grows
every preset in `presets.js` — a preset that stops resolving is a failing check
rather than an empty canvas someone finds later — and confirms signals fire,
light the structure, reach the event queue, and fall silent when the pulse rate
is zero.

## Reusing the effect elsewhere

Nothing here is coupled to the page. `solver.js` + `morph.wasm` is a
self-contained graph grower, `render.js` takes two `Float32Array`s, and
`audio.js` takes an event buffer and a stat block. For an ambient background:
pick a program, set `grow` low and `relax` high, run the tick speed well under
1×, drop `glow` and `cell size`, and leave the sound off until a user asks for
it. Because the sound is made of firings rather than growth, such a background
keeps playing indefinitely instead of going quiet once the structure is done.

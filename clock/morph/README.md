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

### Depth in a cycle: the condensation is not the whole answer

Depth is computed over strongly connected components, so no member of a cycle is
further from the inputs than any other by longest path. Collapsing each
component to a single depth is therefore correct — and taken alone it was a
disaster, because depth is not only the colour: it is also the pluck's pitch,
through `step = round(depth / maxDepth * 14)`.

A fully recurrent structure came out flat in both. The showcase polyrhythm —
twenty rings whose whole subject is four different rates — sat entirely at depth
1, so it rendered as one colour and **played exactly one note**, forever. It
scored variety 0.00 and period 1 in [`lab/`](lab/), which is how it was found;
by ear it just sounded thin, and by eye it looked deliberate.

A cycle has no longest path from the inputs, but it does have a well-defined
distance from the point where signal *enters* it, and that is exactly what a
wave going round traverses. Depth is now `component depth + phase within the
component`, so a ring sweeps in colour and in pitch at a rate set by its length.
Every component of a DAG is a single cell, so phase is zero everywhere and this
is precisely the old pass — ripple-32 against Brent–Kung-11 is unchanged, and a
test asserts it.

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

### Whether it cycles depends on the lineage's shape

Turnover is not guaranteed by turning the knob up, and the reason is worth
knowing before you decide the control is broken.

A cell re-arms when **every** descendant is gone, so a single surviving cell
keeps every ancestor above it occupied. In a **branching** lineage — the medusa,
the erosion piece — limbs empty independently and turnover runs indefinitely:
the medusa holds at ~1,485 cells through 14,700 deaths and 1,876 regrowths and
is still going. In a **linear** lineage — the triangle, where each cell holds one
child cell — one immortal cell at the bottom of the chain blocks re-arming for
the entire structure. The triangle therefore prunes hard (1,560 cells down to
40) and then *settles* rather than cycling.

It gets an immortal cell because pruning creates one. Pulses are injected at
cells with nothing driving them, and a cell whose only driver just starved is
now exactly that: an orphan is adopted as a source and fires forever. Both
halves of that are deliberate — it is what lets a pruned feedback structure keep
running — and the interaction is a real limit rather than a tidy story.

This was worse than it looks until recently. A `fallback %N` pass-through
creates nothing, so it can never starve, so it could never hand its parent's
child count back — and every program that terminates that way bottoms out in
one. Regrowth was not weakened for those programs, it was *impossible*: the
triangle and the medusa alike eroded to a stump and stopped dead. Two tests in
`apoptosis.rs` hold that shut, one staging a full dieback by hand and one
running it end to end.

What is missing is mutation. Because death and regrowth are both deterministic,
a lineage regrows into exactly what it was, so this is homeostasis rather than
evolution — turnover around a fixed point, not open-ended novelty. That is the
honest limit of it, and mutation is the ingredient that breaks it.

### The unit the knob is in

Starvation is a **patience in firing intervals**, not a tick count, and that
distinction is the whole reason the control is usable.

A tick count cannot work here. A wave takes 59 ticks to cross a 40-row triangle
and 1 tick to go round a relay loop, so any threshold in ticks is instant death
on one structure and a no-op on the other — which is exactly what the slider
did when it was a raw `0–300` and read as broken at every setting. The engine
therefore measures the structure's own rhythm and scales against it: **`n` means
a cell may miss `n` of its own turns before it dies.**

The measurement is a **decaying maximum** of the observed gap between firings
(`fire_gap`), not a mean. A mean is dominated by the fastest cells — the source
gates fire every tick, the relay cells deep in the structure fire once a
wavefront — so a mean-scaled limit killed 336 of 378 relay cells at *every*
setting, which is the same uselessness in the other direction. Taking the
maximum and letting it bleed off slowly gives a limit that the slowest legitimate
cell can still meet, and that tightens if the structure genuinely speeds up.

Two more things worth knowing before turning it:

* **It arms only after 40 firings.** The interval estimate has to be measured
  rather than guessed, and until it is, nothing dies. On a structure where
  almost nothing conducts — precisely the case starvation is for — those 40
  firings can take a while, which is why the erosion piece in the showcase ships
  with a fast driver.
* **Nothing dies without a growth budget.** Regrowth needs cells per tick above
  zero, or lineages re-arm as buds and then sit there, never dividing.

When starvation is armed and nothing has died, the HUD says so rather than
leaving you looking at a slider that appears inert: a structure that conducts
everywhere is *correctly* losing nothing, and the fix is the threshold, not the
patience.

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
| `showcase/` | the compositions subpage — `pieces.js`, its own `index.html`, its own selftest |
| `lab/` | node-only measurement: scores a composition for variety and harmony. [Its README](lab/README.md) is where the texture findings are |
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

The dock sits along the bottom, thumb-reachable: 🔇 sound, ◆ species, 🎲 **roll**,
↺ again, ⚙ controls, `</>` source. Roll is the big one because it is the verb the
page is for.

**↺ is not a roll.** It regrows the individual you are already looking at, from
the same seed — the assembly is a few seconds long and the only interesting few
seconds a structure has, so watching one twice has to be possible without
gambling it away. Roll trades it for a different one; ↺ plays it again.

**Roll** grows another individual of the *same* species — the same program with
its `grow` arguments drawn again, so you stay inside one set of rules and see
the range they cover. A triangle rolls anywhere from 182 to 2,862 gates; a
medusa from 480 to 2,954. The species picker is where you change *kind*. Which
individual you got is shown next to the name, `medusa(25, 8)`, so a shape worth
keeping can be typed back in.

Only the `grow` line is redrawn. Changing the cell bodies would be a different
organism, not another of the same kind.

Keys: `r` roll, `enter` grow this one again, `space` species, `e` source,
`g` controls, `p` pause, `s` sound, `f` recentre, `[` `]` tick speed, `esc` close. Drag to pan, wheel or pinch to
zoom; either stops the camera following, and `f` gives it back.

**On a phone** the sheets come up full width from the bottom with a grip: drag
down, tap outside, or hit the close button. The controls open with one section
expanded and the rest folded, because fifteen sliders in a row is not an
interface. The dock stays above the sheets rather than behind them — reserving
space inside a panel that still covers the buttons only *looks* right.

**Tick speed** is the one to reach for first. Wind it down to 1/16× and the
wavefront advances a level at a time, slowly enough to follow a carry along a
ripple adder's chain gate by gate.

The panel's two schedules are worth trying against each other. Breadth-first
gives a moving growth front; largest-first expands the biggest pending cell
first, so the whole structure thickens at once. **Same final graph** — the
selftest asserts that — but very different things to watch.

## The showcase

`morph/showcase/` is a second page over the same engine, and it exists because
the toy cannot show what the language is actually capable of. A preset is one
rule shown plainly, and it has to stay that way to be legible. The interesting
things happen when several rules are wired into each other, and those programs
are forty lines long — nobody is going to type one into the editor to find out
whether it was worth it.

Six pieces, each chosen because the *combination* does something none of the
parts does:

| | |
|---|---|
| **polyrhythm** | four feedback loops of length 4, 7, 11, 18 and no clock anywhere. Each keeps its own time because a wave takes one tick per cell to come round, and the lengths share no factors, so the four only agree every few hundred ticks. Driver off — it is keeping time by itself |
| **anemone** | a branching tree with its own tips gathered by `AND` and returned to the stem. Feedforward it flowers once and stops; closing that one wire makes it an oscillator whose period is the height of the tree |
| **erosion** | three ripple adders in series, 120 gates of carry chain, threshold above the per-wire charge so nothing past the first stage conducts. With starvation armed it prunes itself back to what carries signal and then regrows — the only piece where what you end up looking at is not what was grown |
| **cathedral** | tree, ring, tube, tree. The ring in the middle is load-bearing: without it the two trees never meet and it reads as two objects sharing a screen |
| **weave** | three systolic meshes, each fed the previous one's outputs with the axes swapped. Deepest thing here at 71 levels, so a wavefront takes a long visible sweep — worth slowing the tick right down for |
| **carry-save** | eight numbers reduced to two in **depth 4**, against erosion's 120 for the same gates. That gap is the entire reason the circuit exists, and here it is a thing you watch rather than a claim |

Every piece carries **its own settings**, because most of them do not work at
the defaults — erosion needs the threshold above the charge before anything can
starve, the polyrhythm needs the driver switched off before you can hear that it
is keeping its own time. Shipping a composition without its settings is shipping
a composition that does not work.

"Open in the toy" hands the program over in the URL hash, so a piece can be
edited and rolled on from there rather than being a museum exhibit.

`showcase.selftest.mjs` grows every piece on the committed wasm and then asserts
**the property each one exists to show** — that the polyrhythm still sustains
after the kick, that erosion still prunes *and* regrows, that carry-save is still
an order of magnitude shallower than the ripple bank. A composition wires several
recursive cells together, so a width mismatch four stages down turns a piece into
"cannot be grown", which in a gallery is a blank canvas nobody reports; anemone
shipped broken exactly that way in draft. And a polyrhythm that has stopped
sustaining itself still grows perfectly well while no longer being the thing the
notes describe — so the prose is checked, not asserted.

## Does it have anything to listen to?

[`lab/`](lab/README.md) scores a composition for **variety** and **harmony**,
headlessly on the committed wasm. It was written because "there is not much
texture in the continuous morphing" is a measurable claim, and it turned out to
be a much sharper instrument than expected.

Run over all 11 presets and all 6 pieces, it found that **sixteen of seventeen
had zero structural drift and zero churn** — there was no morphing to have
texture in — and that no setting fixed it: a sweep of 36 settings each, 612
runs, produced not one aperiodic result. It found the flat-cycle bug above,
where the polyrhythm scored variety 0.00 because it was playing a single note.
And it found that every piece sat pinned at the 24-voice pluck ceiling: six
notes a tick, every tick, no rests, which is why they all sounded like one wash.

Only two things here break periodicity — **incommensurate feedback loops**, and
**structural turnover**. Three showcase pieces were retuned onto the second and
now drift by 6 to 22 levels of depth, with polyphony down in the 2–18 range
instead of pinned. Two were deliberately left static, because the score said
forcing drift into them cost more than it bought; that is the other use of a
number, and the reason the lab's README is explicit that `harmony` is a proxy
and must not be optimised blindly.

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

`solver/tests/apoptosis.rs` is where the homeostasis claim is kept honest:
that a fully conducting structure loses nothing, that turnover runs in bounded
memory (127 slots through 2,266 deaths), that a `fallback %N` leaf does not
block a lineage from re-arming, and that a bud landing in a *recycled* slot
still gets expanded. That last one is a scheduling trap rather than a logic
one — both schedules only look forward, so a slot reused behind the cursor is
invisible to them, and growth reports itself finished with cells still
unexpanded.

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

# Tempest — `/tempest/`

*A Tempest whose levels are proved before anyone plays them.*

Sixth in the [`/pressure/`](../pressure/) family, and the first written in
Rust. The web is a ring (or a strip) of lanes; things climb the lanes toward
the rim you are standing on; your gun only fires down the lane you are in. So
far, the arcade original.

What is different is that nothing here was tuned by feel. Every wave in
[`levels.json`](levels.json) shipped with a **certificate**: an exact solver
found a play that holds the rim, from *every* lane you could have been standing
in when the wave started, and measured how much room that play had. The
difficulty curve is a band on that measurement, not a set of knobs.

---

## The row it fills

The family's rule is that each game must make a **different thing measurable**
about your decision. The shapes of correctness so far:

| shape of correctness | game |
|---|---|
| better or worse, no ground truth | Hold the Line |
| a countable set | Telegraph |
| whether a future still exists | The Ratchet |
| a distance from a computable optimum | Switchboard |
| whether a future still exists, with a body | Outbound |
| **a direction, priced in ticks** | **Tempest** |

The Ratchet can name the *move* that lost a run. Tempest names the
**direction**, and says what the other one would have been worth:

```
the web turned against you at tick 214.
you played on for 96 more ticks before it showed.
you went clockwise. every play that still held the rim went the other way.
```

---

## The one idea: the shape of the web *is* the difficulty

In the arcade original the webs were hand-drawn set dressing. Lanes were about
equally wide, so *where* you stood mattered and the shape you stood on did not
— a circle and a squashed circle played identically.

Here the player crosses the rim at a constant speed, so **a long rim edge costs
more ticks than a short one**, and the polygon on screen is literally the
travel-cost table the solver reasons about. A star web has cheap lanes
alternating with expensive ones. A lobed web has a fast side and a slow side.
An open web has no wrap at all, so a wrong commitment cannot be undone by going
round the back.

The generator will not ship a web that fails to earn that
([`Web::character`](core/src/web.rs)): a closed web with even lanes is *flat*,
and flat webs only appear in the first two levels, on purpose. Three shape
families were caught drawing convincingly and costing exactly like a circle
before that check existed — a symmetric zigzag is the memorable one, because
the player stands at edge *midpoints* and the midpoints of a symmetric zigzag
are evenly spaced along a straight line however jagged the outline looks.

---

## What the solver answers

> Given where everything is right now, is there **any** way round the web that
> holds the rim?

A play is fully described by its sequence of shots, and each shot's lane is
forced by which threat you mean to hit and when the shot will get there. So a
play is an ordering of kills, and Held–Karp over `(killed set, lane)` with
earliest-firing-time values answers it exactly.

Two things make it more than a textbook exercise.

**Tankers.** A tanker splits into two flippers at the depth it died at, so the
obvious rule is "kill tankers early, the children start further out". The
arithmetic disagrees — for a tanker 900 deep climbing at 3 with children
climbing at 6:

| tanker dies | children enter at | they breach at | window to clear them |
|---|---|---|---|
| tick 20  | depth 840 | tick 160 | 140 ticks |
| tick 200 | depth 300 | tick 250 |  50 ticks |

Killing it late pushes the family's deadline *out* by 90 ticks while shrinking
the window to a third — and the sign of that effect flips with the speed ratio.
There is no scalar ordering on tanker kill ticks, so the solver does not invent
one: a state keeps one label per distinct vector of tanker kill ticks. Label
sets are capped, and a cap that binds makes the answer a lower bound rather
than a certificate, so it is recorded and such levels are thrown away.

**Two shots in the air.** Shots travel at a fixed speed, so a later shot in the
same lane can never overtake an earlier one and shots in different lanes never
interact. Kills therefore resolve in *firing* order — which is exactly the
order the bitmask evolves in — so the search never has to restrict the player
to one shot at a time.

---

## The numbers on the tin

Every wave carries these, and the game prints them while you play (press **P**):

- **slack** — the largest number of ticks by which every deadline could be
  tightened and the wave still be holdable. The honest measure of how much room
  perfect play has. Zero would mean only a frame-perfect line survives.
- **openings** — slack remaining if you commit clockwise, counter-clockwise, or
  stand still for your first shot. `✕` means that opening loses outright.
- **the wrong way round costs *n* ticks** — the gap between the two directions.

That last one replaced a worse idea. The first draft asked the yes/no question
"does exactly one way round survive", and the balance sweep killed it within a
minute of being written: on a web 66 ticks across, a wave with 80 ticks of
slack survives both ways whatever you do to it, so the generator burned 167
repairs to place four waves and mostly failed. The quantitative version
converges, and is a better readout besides.

---

## Running it

The Rust core is headless and has no dependencies.

```bash
cd games/tempest/core

cargo test                       # 90-odd invariants, ~10s
cargo test -- --ignored          # the whole difficulty curve, every lane (minutes)

cargo run --release --bin tempest -- level 42 7     # one level and its certificates
cargo run --release --bin tempest -- solve 42 7     # the certified play, shot by shot
cargo run --release --bin tempest -- sweep 12 4     # THE BALANCE REPORT (~12 min)
cargo run --release --bin tempest -- audit          # regenerate the pack and re-prove every wave
cargo run --release --bin tempest -- pack   > ../levels.json
cargo run --release --bin tempest -- golden > ../test/golden.json
```

And from the repo root:

```bash
node games/tempest/test/tempest.selftest.mjs   # invariants; preflight runs this
```

`sweep` is the one to read after moving any number. It is the analogue of the
other games' `analysis.mjs`, built on the same discipline as
[`packages/pressure-lab`](../../packages/pressure-lab/) — a policy spread that
**requires a control**, band reports, and a repair loop that counts itself.
Its warnings are the point. Two real bugs came out of it:

- **perfect play scoring 3.4 out of 4.** The tick-stepped simulator let a shot
  hit a flipper that walked into the lane *after* the shot had already passed
  its depth; the solver, correctly, did not. Both now compute the crossing tick
  from the same closed form.
- **47% of every web being an ellipse.** Rejection-sampling flat webs reshaped
  the distribution it was sampling. The circle is now excluded up front when a
  shaped web is wanted, rather than rolled and thrown away.

---

## Layout

```
tempest/
  index.html  css/  js/          the page: engine.js (wasm ABI), render.js, game.js
  levels.json                    the certified pack — generated, do not hand-edit
  tempest.wasm                   built from core/, committed
  test/tempest.selftest.mjs      the drift gate
  test/golden.json               generated; checked by BOTH cargo test and the selftest
  core/                          the Rust crate
    src/web.rs                   lane geometry, and what makes a web more than scenery
    src/level.rs                 threats, and the collision arithmetic
    src/sim.rs                   the tick-stepped headless simulator
    src/solver.rs                the exact answer
    src/gen.rs                   procgen, and the repair loop
    src/lab.rs                   measurement, ported from packages/pressure-lab
    src/bots.rs                  policies, including the two deliberately blind ones
    src/autopsy.rs               what actually killed the run
    src/pack.rs                  the pack, the goldens, the wasm wire format
    src/wasm.rs                  the browser ABI
```

### Why the wasm is committed

The `games` surface is a directory of static files with no build step on its
deploy path, and it should stay that way — the deploy is a `wrangler deploy`
away from a green run, and adding a Rust toolchain to it adds a way for that to
fail that has nothing to do with the site. So `tempest.wasm` (64 KB, no
`wasm-bindgen`, no imports at all) is built in a sandbox and committed.

The cost of that is drift, and `test/golden.json` is what pays it. It is
generated from the Rust and **both sides check it**: `cargo test` asserts the
Rust still reproduces the file, the node selftest asserts the committed wasm
still does. Edit the Rust without rebuilding the wasm and the selftest fails;
rebuild without regenerating the goldens and `cargo test` fails. To change
behaviour on purpose:

```bash
cd games/tempest/core
cargo test                                                  # get it green first
cargo build --release --target wasm32-unknown-unknown --lib
cp target/wasm32-unknown-unknown/release/tempest.wasm ../tempest.wasm
cargo run --release --bin tempest -- golden > ../test/golden.json
cargo run --release --bin tempest -- pack   > ../levels.json
cargo test                                                  # now the goldens match again
node ../test/tempest.selftest.mjs
```

`audit` regenerates the pack from its seeds and re-proves it, so it checks the
*generator*; the node selftest checks the *committed* `levels.json` and the
wasm. Neither alone would catch a hand-edited pack — so do not hand-edit the
pack.

`SEED_EPOCH` in `core/src/lib.rs` guards the other direction: bump it when a
change alters what a seed *means*, and a stale `levels.json` next to a fresh
wasm refuses to start instead of quietly playing a different game.

---

## Playing

**Keyboard.** `← →` walk the rim · `space` fire · `O` oracle · `P` proof.

**Touch.** A **spinner** under the left thumb and a **FIRE** button under the
right — the way the cabinet had it. Turn the spinner and the claw walks that
way round the web; lean on it and hold, and it works like a stick. You can also
drag the web itself to walk and tap it to fire, for one-thumb play.

Two things about that are deliberate.

*Rotation in, rotation out.* Turning the spinner clockwise walks the claw
clockwise, and that mapping is true wherever the claw happens to be. A
left/right control can never be, on a ring: clockwise is rightward at the top of
the web and leftward at the bottom, so an absolute mapping silently reverses
itself as you walk round.

*One thumb owns all the movement.* The first touch build put the two directions
on buttons at opposite ends of the screen, which made walking a two-thumb job
and every change of direction a hand-off. Splitting motion across two thumbs is
the thing that made it feel clunky; the spinner is what fixed it.

In landscape the controls stop being a bar and float in the bottom corners
instead. A short wide screen has no height to spare, and because the web is
drawn to its own aspect ratio and never stretched — the polygon *is* the
travel-cost table, so distorting it would be drawing a different game — the
corners are empty anyway. The first version of all this was three invisible
full-height zones laid over the canvas, so your thumb covered the lanes you were
trying to read.

**Oracle** asks the solver, twice a second, whether the run you are in is still
winnable, and turns your claw red when it is not. It is not a hint — it never
tells you what to do — it only removes the consolation of not knowing. Off by
default, for obvious reasons.

---

## Things that are deliberately true

- **The gun needs the lane.** You cannot fire while walking. That is what makes
  travel cost real, and it is what the whole travel-cost model rests on.
- **A breach ends the wave, in any lane.** The rim is defended as a whole.
  There is no "it got past you but you were somewhere else".
- **Certificates assume no superzapper.** There is no superzapper. If one is
  ever added it must stay outside the certified play, so that the proof remains
  a proof about the game and not about the escape hatch.
- **A wave you just lost was winnable from exactly where you were.** That is
  the per-lane guarantee, and it is the reason a retry is fair.

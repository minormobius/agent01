# pong — spin, solved

Live at [`poke.mino.mobi/pong/`](https://poke.mino.mobi/pong/). Table tennis
with four keys, where the only thing you control is the velocity of a bat that
cannot leave its plane — and where the force that decides whether your shot
lands comes out of a lattice Boltzmann solver rather than out of a coefficient
somebody typed in.

Rendered with [three.js](https://threejs.org) r169 (MIT), vendored at
`../vendor/three.module.min.js`. The solver is a 33 kB WebAssembly module built
from the Rust in `solver/`. Nothing else is fetched at runtime.

## Files

- `solver/` — the Rust crate. D2Q9 TRT lattice Boltzmann, flow past a rotating
  cylinder. `cargo run --release --example sweep` reproduces the shipped table.
- `solver.wasm` — the committed build product. Same binary in node and the
  browser, which is what lets the selftest measure the thing that actually ships.
- `solver.js` — loading it, and drawing the flow.
- `aero.js` — the ball, the air, the coefficient table, and oblique impact with
  friction. No rendering, no game.
- `game.js` — the bat, the rally, the rival, the score. No rendering.
- `scene.js` — all rendering. No simulation.
- `index.html` — shell, input, main loop.
- `pong.selftest.mjs` — `node pokemon/pong/pong.selftest.mjs`.

| key | bat |
|---|---|
| `Q` | brush up the stroke plane |
| `W` | brush down it |
| `O` | brush left |
| `P` | brush right |

## What the solver is

A ball does not *have* a lift coefficient. It has a boundary layer, and when the
surface is turning, that layer is dragged further round one side than the other,
so the two separation points sit at different angles and the wake leaves at a
slant. The reaction to that slanted wake is the Magnus force.

`solver/src/lib.rs` knows none of that. It solves the flow past a rotating
cylinder and measures the momentum the fluid hands to it by momentum exchange
across the boundary links. The sideways part of that is the lift, and it either
comes out or it does not.

Method notes worth keeping:

- **TRT, not BGK.** At this Reynolds number the relaxation time sits close to
  1/2, where single-relaxation-time BGK's bounce-back wall drifts away from
  where you put it by an amount that depends on viscosity — exactly the error
  that would corrupt a lift measurement. TRT relaxes the symmetric and
  antisymmetric parts at two rates whose product is held at Ginzburg's magic
  3/16, which pins the wall halfway between the nodes regardless.
- **Moving-wall bounce-back** (Ladd) for the rotating surface, and momentum
  exchange for the force.
- **Non-equilibrium extrapolation** on all four far-field edges. Writing the
  free-stream equilibrium straight into the inlet column — the obvious thing —
  detonated at x=1 after about 650 steps, every time: an equilibrium node
  carries no non-equilibrium part at all, so the strain rate has a step
  discontinuity one cell in, and TRT damps its odd modes far too weakly at this
  viscosity to absorb what that injects.

## Is it a solver, or does it just look like one?

Three things it can be held against.

**Drag on a stationary cylinder at Re = 100** is one of the most-measured
numbers in fluid mechanics; published values sit between about 1.32 and 1.38.

**Strouhal number** of the vortex street at Re = 100: published 0.164 to 0.167.

**Rotation suppresses vortex shedding.** This is the interesting one, because
nothing about it is built in. Spin the cylinder fast enough and the Kármán
street simply stops; the literature puts the threshold for a cylinder in this
Reynolds range near α ≈ 1.8–1.9.

Measured, on 512×256 with D = 24, averaged over 18000 steps after a 26000-step
warm-up:

| α | C_L | C_D | shedding rms C_L | St |
|---|---|---|---|---|
| −1.50 | −4.3249 | 0.9906 | 0.222 | 0.188 |
| −1.00 | −2.5670 | 1.2905 | 0.316 | 0.180 |
| −0.50 | −1.2516 | 1.4708 | 0.295 | 0.179 |
| −0.25 | −0.6275 | 1.5149 | 0.277 | 0.179 |
| 0.00 | **−0.0005** | **1.5287** | 0.281 | **0.179** |
| +0.25 | +0.6269 | 1.5151 | 0.277 | 0.179 |
| +0.50 | +1.2515 | 1.4710 | 0.294 | 0.179 |
| +1.00 | +2.5667 | 1.2908 | 0.315 | 0.180 |
| +1.50 | +4.3244 | 0.9910 | 0.223 | 0.188 |
| +1.75 | +5.2543 | 0.7187 | **0.018** | — |
| +2.00 | +6.5438 | 0.6903 | **0.027** | — |

- **No spin, no lift**: C_L(0) = −0.0005, from a run that was deliberately
  started with an asymmetric ripple in it. That the ripple decays is the check
  that nothing is holding the wake crooked.
- **Lift is odd in the spin** to four figures — −2.5670 against +2.5667 — and
  nothing in the code enforces that. It is the same lattice, run twice, with the
  wall turning the other way.
- **Shedding is suppressed** between α = 1.5 and α = 1.75, where the fluctuating
  lift drops by a factor of fifteen. The literature says 1.8–1.9. Close, and it
  is a *measurement of a phenomenon*, not a fit.
- **The drag is 13% high** and **the Strouhal number 8% high**. Both are real
  biases rather than rounding. The section below tracks them down, and the
  answer is not the obvious one: blockage turns out to be worth under two points
  of the thirteen, and the inlet — five diameters upstream, where the literature
  uses ten to twenty — is worth the rest.

The plain rms of the lift is **not** the shedding amplitude, and using it as one
is a trap this sweep fell into first. Lattice Boltzmann is weakly compressible;
sound crosses 512 cells in about 890 steps and both the velocity inlet and the
pressure outlet reflect it perfectly, so the lift carries a large oscillation
near St ≈ 0.67 with nothing to do with the wake. It averages out of the mean —
which is why the mean drag came out at a sensible value regardless — but it
swamps an rms. The table's shedding column is the amplitude of the strongest
spectral line inside the shedding band, found by a direct DFT scan. At α = 1.75
the raw rms is 2.76 and the shedding line is 0.018.

### Where the 13% comes from

The obvious story is blockage: the cylinder is 24 cells across a 256-cell
channel, so it occupies 9.4% of the width, and confinement accelerates the flow
past the body. It is a good story, it is the one this README told first, and it
is **wrong** — or rather, it is worth about a seventh of what it needed to be.

*Halving the blockage.* Re-running the whole sweep on 768×512 — same cylinder,
same Reynolds number, twice the channel — moves C_D from 1.5287 to **1.5015**.
That is 1.8%, not 13%.

*Making the cylinder finer.* At a fixed 5.8% blockage, taking D from 14 cells to
40 leaves the drag flat: 1.5814, 1.5721, 1.5361, 1.5638. Converged, and
converged on the wrong number.

*Moving the inlet.* This is it. The solver holds a fixed velocity at the inlet,
and the sweep puts the cylinder a quarter of the way along the box — about five
diameters downstream of it. That is close enough to squeeze the flow past the
body, and it is much nearer than the ten to twenty diameters the literature
uses. At Re = 60, holding blockage and resolution fixed and moving only the
inlet:

| inlet | C_D |
|---|---|
| 4.3 D | 1.5683 |
| 8.6 D | 1.4468 |
| 12.9 D | 1.4390 |

An 8% fall, converging on 1.439 against a published Re = 60 value of about
1.39–1.42. The near inlet was the whole thing.

The selftest keeps a three-run version of this — one that changes the channel
width, one that changes the inlet distance, nothing else — because the useful
artefact here is not the number, it is the habit of changing one thing at a
time instead of naming the first plausible culprit.

**What it does to the game: nothing, and that is measured too.** The flight uses
a constant drag coefficient from ball measurements, so the cylinder's drag never
reaches it. The lift does — but the lift is normalised at α = 1, so a
multiplicative bias cancels exactly and only a change in the *shape* of the
curve could propagate. Moving the inlet from 4.3 D to 12.9 D changes C_L at
α = 1 by 4%, and changes the ratio C_L(0.5)/C_L(1) — which is all the game
actually consumes — from 0.4922 to 0.4863. **1.2%.**

## From a cylinder to a ball

Here is the one thing on this page that is a modelling choice rather than a
measurement, said plainly.

**A 2D cylinder is not a 3D sphere.** A cylinder's Magnus force is far stronger:
the flow has nowhere to go around it, so the whole circulation is forced into
the wake, where on a sphere it can spill off the sides. The solver's C_L at
α = 1 is 2.57. A real 40 mm ball's is about a third.

So the **shape** of the curve is the solver's, measured, and the **scale** is
one fitted number: C_L(ball) = 0.12987 × C_L(cylinder), chosen so that the two
agree at α = 1, where the relation used throughout the sports-ball literature,

    C_L = 1 / (2 + v/(Rω)) = α / (2α + 1)

gives 1/3.

They agree there and nowhere else, because the shapes genuinely differ — the
cylinder's lift is close to linear in α over this range while the empirical
sphere relation is concave and saturates at 1/2:

| α | solver, scaled | sphere relation | ratio |
|---|---|---|---|
| 0.25 | 0.081 | 0.167 | 0.49× |
| 0.50 | 0.163 | 0.250 | 0.65× |
| 0.75 | 0.246 | 0.300 | 0.82× |
| 1.00 | 0.333 | 0.333 | 1.00× |
| 1.50 | 0.562 | 0.375 | 1.50× |
| 2.00 | 0.850 | 0.400 | 2.12× |

Play mostly happens between α = 0.2 and α = 0.8, so this game curves the ball
somewhat *less* than a real one would. Which curve is right for a real ball at
Re ≈ 2.7 × 10⁴ is not something a 2D solver at Re = 100 can settle, and it is
not claimed here.

**Drag is the one place the solver's answer was declined.** Its cylinder drag
*falls* with spin and eventually goes negative — real for a rotating cylinder,
and not what a sphere does. Using a curve measured for a different body, running
in a direction a ball does not go, would have been worse than using no curve at
all, so the flight uses a constant C_D = 0.45, the accepted subcritical value
for a ball this size.

## The bat cannot push

Your bat has two degrees of freedom and a fixed face. It never leaves one plane,
you cannot open or close it, and the ball comes off it at the restitution times
the speed it arrived with. Everything else — clearing the net, landing it in,
curving it away from them — comes out of the velocity the bat happens to have at
the instant of contact.

Contact is the textbook rigid-body treatment: a normal impulse set by the
restitution, and a tangential impulse that either arrests the slip entirely
(rolling) or saturates at the friction cone (sliding). Which happens is not a
switch anyone sets. It falls out of the numbers, and it is the difference
between a bat, which grips, and the table, which mostly does not.

### The plane leans forward

The first version had the plane vertical, which is the obvious reading and looks
right on paper. Then the selftest flew a rally and the rally died. Air drag takes
roughly 40% of a table tennis ball's speed in a single crossing — 2.7 g behind a
40 mm frontal area — and a bat that cannot advance has no way to put that back.
A serve leaving at 6.2 m/s arrived at the far bat doing 2.9, and the return could
not reach the net.

Leaning the stroke plane forward 30° fixes it without giving anything back: two
degrees of freedom still, face still fixed, but brushing *up* now also carries
the bat *forward*, so one key buys pace and topspin together in a fixed ratio.
Which is what a loop is, and why a looper cannot hit hard without spinning hard.

The face is also **closed 12°**. A face perpendicular to the table turns brush
into loft at one to one — the tangential impulse that puts the spin on is the
same impulse that throws the ball upward — so a bat you cannot close can only
ever lob. Closing it aims the normal impulse downward.

## The experiment

The page's whole claim is that solving the flow changes how the game plays. A
Magnus force that moved a shot by two centimetres would be a very expensive way
to draw a pretty panel. So the selftest flies the same shots twice — once with
the lift the solver measured, once with it switched off — and reports the
difference in the only currency the game has.

Against one representative incoming ball, sweeping the brush:

| | with the solver's lift | with it off |
|---|---|---|
| legal brush window | 6.37 – 9.62 m/s | 5.62 – 7.47 m/s |
| width of it | **3.25 m/s** | 1.85 m/s |
| furthest a landing point moved | **2.10 m** | |

**The aerodynamics is worth 76% more margin for error.** Not a nudge — brush at
9 m/s and the solver's lift lands the ball 1.22 m past the net, comfortably in;
without the lift the same shot is 2.04 m past the net, which is 67 cm beyond the
end line. That is the game.

The other half of the claim is that a rally has to *survive*. Playing both sides
at the depth a real player aims for, the exchange settles into a stable two-beat
cycle — a fast loop, a slower one, repeat — rather than dying or running away:
ten exchanges with the slowest shot at 6.8 m/s and the fastest at 11.9.

## Is topspin worth playing?

The reason topspin took over table tennis is not that it looks good: it lets you
hit harder for the same margin, because the ball dips. Over 240 randomised
incoming balls per style:

| stroke | lands in | spin | depth | α | speed on arrival |
|---|---|---|---|---|---|
| push (down) | 0% | — | — | — | — |
| block | 2% | 5 rev/s | 0.45 m | 0.10 | 14.0 km/h |
| drive | 33% | 33 rev/s | 0.88 m | 0.42 | 21.3 km/h |
| **loop** | **35%** | 50 rev/s | 1.01 m | 0.54 | 26.5 km/h |
| heavy loop | 17% | 74 rev/s | 1.19 m | 0.64 | 34.7 km/h |

The most reliable stroke is a spinning one, and it is also nearly twice as heavy
as the reliable flat one. The heavy loop trades reliability for another 8 km/h.
That is the shape of the real sport, and nobody put it there.

## What the selftest found

- **The hollow ball spins less, not more.** A table tennis ball is a thin shell,
  I = (2/3)mR², so the tangential impulse needed to arrest the slip is 0.400 m
  against a solid sphere's 0.286 — 40% more. The comment in `aero.js` used to
  finish that sentence with "and correspondingly more spin". It is false: the
  resulting spin is grip·slip/(f·R), and the shell's larger moment of inertia
  more than eats its larger grip. Same 12 m/s slip: shell 360 rad/s and 4.8 m/s
  of kick, solid sphere 429 rad/s and 3.4 m/s. The shell takes 1.40× the impulse
  and ends up with 0.84× the spin.
- **Flat and heavy backspin come off a fast bounce identically.** The table's
  friction is Coulomb and its coefficient is low, so a fast ball slides through
  the whole contact and the tangential impulse saturates at μJ — a constant that
  knows nothing about how much backspin there is. Topspin is different only
  because it slips *less* and grips. What backspin keeps is its spin, and that
  is what the receiver has to deal with. The rebound height does not depend on
  spin at all.

Bugs it caught, all of which shipped as far as a green run:

- **The bat face is closed, so `n[0]` is ±cos(12°) = ±0.978, not ±1** — and it
  was being used as a *side sign* in half a dozen places. The rival multiplied
  its target depth by −n[0] and so aimed at its own half of the table. Every
  rally ended on the second stroke. A normal is a direction, not a sign.
- **A ball that flew past the end line without bouncing was scored for the
  player who hit it out.** Which made hitting the ball out a winning move, and
  made a scripted player who brushed at random score exactly as well as one that
  aimed — 49% against 48%. With the rule the right way round: 8% against 52%.
- **The serve was fired, not solved.** With the topspin it carries it hit the
  net on about half of all serves and handed the player a free point, which then
  flattered every scripted player into looking competent.
- **The rival volleyed everything.** It reached for shots already sailing past
  its end line, which is a fault, and handed the point to whoever hit it out.
- **The plan was never invalidated after a point.** The autopilot kept driving a
  swing it had computed for a ball that no longer existed, which parked the bat
  against the top of its reach and left it there for the rest of the match.
- **A timer that never counted down.** The rival's swing schedule compared
  against a start time it never set, so the "swing now" branch never fired and
  the rival simply parked its bat on the ball and let it hit the stationary
  face. It still won, because a parked bat returns the ball. It just never
  played a shot.

## Can the bat get there?

A legal window is no use if the bat cannot reach it. Driving the real bat
integrator with the real keys, from the bottom of its reach:

| travelled | brush speed |
|---|---|
| 0.15 m | 5.89 m/s |
| 0.30 m | 7.55 m/s |
| 0.50 m | 9.07 m/s |
| 0.80 m | 10.41 m/s |
| 1.10 m | 11.23 m/s |

The bat has 1.22 m of reach and the window sits at 6.4–9.6 m/s, so a legal shot
costs most of a swing and half a swing is not enough. You have to be in the
right *place* with the right *velocity*, out of one integrator, and nothing
returns the bat to the middle for you. That is where the QWOP is.

## Simplifications

- **Rallies start with a feed**, not a service. A real serve has to bounce on
  the server's own half first; here the ball is thrown in from behind the far
  baseline and bounces once on yours.
- **The net is a wall.** Clip it and you lose the point; there are no net cords.
- **Spin decay in flight is empirical**, not from the solver — the solver
  measures the force on the cylinder, not the torque. It is an exponential with
  a time constant taken from the published observation that a ball loses only a
  few percent of its spin per second, which over the 0.4 s a shot spends in the
  air changes almost nothing. Said here so nobody mistakes it for a measurement.
- **No player.** There is a bat and there is a rival's bat. Nobody has arms.

## The panel

The flow drawn over the table is the same solver on a smaller, cheaper grid
(224×112, Re = 80), running live at whatever spin ratio the ball currently has,
so you can watch the wake lean over as a shot spins up. It is an illustration: a
live grid a few hundred steps into a change of spin has not converged, and the
numbers the flight uses come from the long sweep instead. It also clamps at
|α| = 1.8, because beyond about 2 the lattice cannot carry a surface that fast
and detonates — a real limit of the method, not something to hide.

`index.html` exposes `window.__pong()` for headless driving. Headless Chrome
throttles `requestAnimationFrame` to about 0.5 Hz, so a browser check cannot
exercise gameplay that advances on the frame clock — that is what the selftest
is for.

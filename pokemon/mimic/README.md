# mimic — dueling marionettes

Live at [`poke.mino.mobi/mimic/`](https://poke.mino.mobi/mimic/). A mimicry
duel. The rival puppet dances a choreography you have never seen — half a dozen
string pulls over five seconds — and then you reproduce *the inputs* from what
you saw it do. Then both dance at once so you can watch where you went wrong.

Rendered with [three.js](https://threejs.org) r169 (MIT), vendored at
`../vendor/three.module.min.js`. No build step, no CDN, nothing fetched at
runtime.

## Files

- `puppet.js` — the marionette. Deterministic physics, no rendering, no game.
- `game.js` — phases, choreography, recording, scoring. No rendering.
- `scene.js` — the stage and the two figures. No simulation.
- `index.html` — shell, input, main loop, long-form notes.
- `mimic.selftest.mjs` — `node pokemon/mimic/mimic.selftest.mjs`.

| key | string |
|---|---|
| `Q` | left hand |
| `W` | right hand |
| `O` | left foot |
| `P` | right foot |

## Why a marionette and not a ragdoll

The game only works if the map from input to motion is **legible**, and
legibility is two properties that pull against each other:

| property | why it is needed |
|---|---|
| **repeatable** | the same strings must give the same dance, or "that move means Q" is not something a player can learn |
| **separable** | different strings must give a visibly different dance, or you are guessing and the score is noise |

A free ragdoll fails both. It is chaotic, so the same input twice does not look
the same, and once it is thrashing every input looks like every other one. A
marionette passes both, and that is the whole reason it is a marionette: strings
make the motion bounded and restoring.

Measured, not asserted:

| measurement | result |
|---|---|
| same choreography danced twice | pose distance **0.000** — bit-identical |
| closest pair of *different* choreographies | **0.216** of a figure apart |
| …at maximum erraticness | **0.134** — still plainly different |

## The one that mattered most

Neither property alone is enough. The real question is whether **motion distance
tracks input distance** — if you press 90% of the right strings, does it look
90% right? If not, partial credit means nothing and a player can never tell how
close they were.

Corrupting a choreography by degrees and measuring both ends:

| corruption | input match | how different it looks |
|---|---|---|
| none | 1.000 | 0.000 |
| 0.15 | 0.970 | 0.009 |
| 0.30 | 0.692 | 0.093 |
| 0.50 | 0.507 | 0.157 |
| 1.00 | 0.290 | 0.235 |

Correlation across all of them: **r = −0.955**.

## Scoring

Temporal **intersection-over-union** per string, averaged over the four. IoU is
the right shape because it charges for both errors in the same currency: pulling
a string you should not have grows the union, holding one for the wrong length
shrinks the intersection.

| what you play | scores |
|---|---|
| an exact copy | 1.000 |
| a uniform 0.18 s lag | 0.953 |
| right rhythm, wrong strings | 0.154 |
| right strings and moments, a third of the length | 0.299 |
| **all four held down the whole time** | **0.246** |
| nothing at all | 0.000 |

Scored at the best single global shift within a quarter-second — **one shift for
all four strings, not one each**, because letting each slide independently would
forgive an ordering error, which is precisely the error worth catching. Reaction
time is not the skill being tested; remembering which strings moved, in what
order, for how long, is.

## The slider is three kinds of harder

| erratic | moves | each held | two-plus strings at once |
|---|---|---|---|
| 0% | 5.0 | 0.80 s | 5% |
| 50% | 8.6 | 0.55 s | 17% |
| 100% | 12.0 | 0.31 s | 27% |

More to remember, shorter pulls that read as flicks rather than poses, and far
more overlap. The third is the one that bites: two strings pulled together make
the body lean and lift in a way neither does alone, so a compound shape has to
be *decomposed* rather than just seen. It is also where separability was most at
risk, which is why the test checks the hard end separately — cranking the slider
has to make the dance harder to **remember**, not harder to **see**.

One honest observation from the sweep: the puppet is *less* busy at maximum
erraticness (53% of the dance has a string down, against 75% at zero), because
the pulls get short. Hard here means denser and flickier, not more continuous.

## Bugs the work turned up

- **The mirror sign was applied twice.** `pose()` put the mirroring in the
  angle *and* in the sine, which undid it and folded both sides of the puppet
  onto each other. The figure sprawled instead of hanging.
- **The lift targets were negative**, which swung each limb *across* the body
  rather than up. The hand still went up, so a test that only asked "does the
  limb rise" passed it happily — the geometry was wrong in a way only a
  screenshot caught.
- **`spanTo()` scales y by the span, so every spanned mesh must be unit
  height.** The torso was a capsule of its own natural length, so it came out a
  stubby fraction of the right size.
- **Lean and swing stack.** Their first clamps let the puppet reach 63° off
  vertical, which reads as falling over rather than dancing. Dialled back — and
  because the body coupling is exactly what makes two strings together look
  different from either alone, the separability and correlation numbers were
  re-measured afterwards rather than assumed to survive.

## Fitting the stage to the screen

It shipped cropping on mobile. A `PerspectiveCamera`'s `fov` is the **vertical**
field of view, so the horizontal one is `2*atan(tan(fov/2) * aspect)` and
collapses as the viewport narrows — a camera parked at a fixed distance framed
both puppets on a laptop and cut one clean off the edge of a phone.

The camera is now fitted to a world-space box on every resize, pulling back far
enough that whichever of width or height binds is inside the frustum. Below an
aspect of 1.15 the two figures also move closer together: fitting alone keeps
them both on screen but shrinks them to nothing, and closing the gap buys most
of that back.

Two things worth knowing for next time:

- On a portrait screen a **shorter** canvas makes the puppets *bigger*. The
  content is wide and the screen is tall, so the fit is horizontally bound;
  adding height lowers the aspect and tightens that bind.
- **Headless Chrome will not go narrower than 500 CSS px** — `--window-size=390`
  silently gives `innerWidth === 500`, so a phone-width screenshot is really the
  500 px layout cropped, which looks exactly like an overflow bug that is not
  there. It ignores the viewport meta too. The layout at 360/390/430 was checked
  instead by running the window at 500, where the `<=720px` rules a phone gets
  are already active, and constraining the content box from the driver.

## One deliberate piece of theatre

The strings brighten and go taut when their key is down. That makes the watch
phase easier than pure mimicry would be, and it is a real cost taken knowingly:
a player who cannot see the strings is not reading a puppet, they are decoding a
cipher. Everything else on screen is drawn straight from `pose()` — no limb is
nudged for looks.

## What is invented

All of it. Unlike [`/armline/`](../armline/README.md), whose arm is a real AR4
transcribed from its URDF, nothing here is a measurement of anything — the limb
masses, the string tensions, the coupling between the strings and the body are
chosen to make a legible puppet, not to model one. The claim is not that this is
how a marionette behaves. It is that this one is repeatable and separable enough
to play, and that claim is tested.

`index.html` exposes `window.__mimic()` for headless driving. Headless Chrome
throttles `requestAnimationFrame` to about 0.5 Hz, so the browser check cannot
exercise gameplay that advances on the frame clock — that is what the selftest
is for — and the screenshots used to judge the look step the puppets by hand.

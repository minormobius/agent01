# qwop — four cilia, four keys, one ocean

Live at [`poke.mino.mobi/qwop/`](https://poke.mino.mobi/qwop/). A QWOP-like made
out of the ciliary model: you are a *Pterosperma* cell, **Q W O P** are its four
cilia, and things want to eat you.

Pure HTML + ES modules + Canvas 2D. No build step, no dependencies. It imports
the model from `../proteus/flagella.js` and does not modify or re-implement any
of it — each cilium is one instance with `nFilaments = 1`, and this surface
supplies the phase and frequency that the player is really controlling. The
behaviour chain (Stop/Swim/Reorient) is deliberately unused: the player is the
controller now, and produces those states by hand.

## Files

- `index.html` — shell, overlays, input, main loop, long-form notes.
- `game.js` — the cell, the predators, the world. All simulation.
- `draw.js` — all rendering. No physics.
- `qwop.selftest.mjs` — `node pokemon/qwop/qwop.selftest.mjs`.

## Controls

Keyboard **Q W O P** on a desktop. On a coarse pointer or a narrow viewport a
four-button touch pad appears instead, colour-matched to the filaments, with the
on-canvas letter badges dropping out (`compactKeys`) so the same thing is not
said twice — the phase dials stay, since the buttons cannot show those.

The pad is genuine multi-touch, which took some care and is covered by the
browser tests:

- `touch-action: none` per button. Without it the browser claims the second
  finger for panning and the game becomes unplayable, because two to four cilia
  are held at once nearly all the time.
- `setPointerCapture` per button, so the release always comes back to the
  button that was pressed even if the finger lifts elsewhere.
- Capture deliberately suppresses boundary events, so `pointerleave` cannot
  detect a finger sliding off — that is hit-tested by hand in `pointermove`.
  Without it, dragging a thumb away to scroll leaves a cilium jammed on.
- `blur` and `visibilitychange` let go of everything: a key stuck down through
  a tab switch would be an unfair death.

Tap highlights, text selection, the long-press callout and the 300 ms
double-tap zoom delay are all off — the last one matters, since on a rhythm
game it is the difference between the beat landing and not. The prose below the
game stays selectable.

## The design, in one paragraph

QWOP's real idea was never "hard controls" — it was taking away the verb you
expected. You asked to *run*, and it handed you the layer underneath. The
flagella model already had that layer, and the organism came with a gift: four
cilia, one per key. **Hold** a key and that cilium beats. **Tap** it and its
stroke restarts. Between those two facts sits the game: the cilia are
**detuned**, so holding all four lets them drift out of phase, where their
thrust vectors point in different directions and partly cancel. In phase they
**bundle** into one compound cilium — which is what the real organism does — and
a bundle is fast. So you re-tap, in rhythm, to drag them back together. Driving
one side turns you, and collapses your bundle while it does, which is the
decision every dodge is made of.

## Why the selftest is unusually load-bearing here

I cannot play this. "It compiles" is not evidence that a control scheme works,
so `qwop.selftest.mjs` runs scripted policies and asserts the design claim
directly — measured over a sweep of tap periods, so the balance numbers are
visible rather than assumed:

| policy | distance in 20 s | coherence |
|---|---|---|
| tap every 180 ms | 3004 µm | 0.97 |
| tap every 320 ms | 2722 µm | 0.92 |
| **hold all four** | 1873 µm | 0.40 |
| **random mash** | 1659 µm | 0.48 |
| do nothing | 19 µm | — |

Rhythm beats holding by 1.6× and mashing by 1.8×. **If that inverts, there is no
game**, and the test says so in those words. It also checks that more than one
tap period works (a learnable window, not a frame-perfect input test), that one
side steers and the two sides steer opposite ways, that going quiet actually
hides you, and that the difficulty curve is survivable at both ends — a run that
ends in two seconds reads as broken, and one that never ends means the predators
are scenery.

Four bugs came out of building it, all found by measurement rather than by
reading the code:

- **Torque was identically zero.** The lever arm was the cilium's own direction
  and so was its thrust; the cross product of parallel vectors is zero. Nothing
  could turn.
- **The thrust was rectified.** I took the *magnitude* of an oscillating force,
  which turns every recovery stroke into forward push and made the cell swim
  about ten times too fast. The model's own cycle-averaging is the fix, and is
  now mirrored here.
- **The cell swam in circles.** The detune was a simple ramp across the groove,
  so the right-hand cilia were permanently faster. It turned left forever at
  50°/s, never advanced along the course, and therefore hardly ever met a
  predator — the difficulty curve was being set by a steering bug.
- **The score rewarded going nowhere.** Scoring path length means the optimal
  strategy is to swim in tight safe circles racking up millimetres. The score is
  now the high-water mark down the course, and predators seed ahead of *that*.

Between the third and fourth of those, a version that paired the detunes up
tracked perfectly straight and quietly destroyed the game: with only two
distinct frequencies a held cell's order parameter averages ⟨|cos(Δ/2)|⟩ = 2/π
≈ 0.64 no matter how far apart you set them, so holding stopped being a mistake
and the skill gradient collapsed to 1.3×. Four distinct frequencies keep it at
0.40. The cost is a residual ~8°/s spin, kept rather than trimmed because it is
7% of the player's turning authority and holding a heading is a fair thing to
ask.

## What is real and what is the game's

Real, and inherited from the model: the Chebyshev waveform, the linear
dispersion relation setting each cilium's wavelength from its frequency,
Gray & Hancock resistive force theory, overdamped motion with no inertia, the
10 Hz unfurled idle and the 95 Hz driven beat, and the detune, mirrored
left/right beating and phase-reset — all real ciliary behaviour.
*Chlamydomonas* swims straight precisely because its flagella beat as a
mirrored pair, which is also why this cell does.

The game's own, each marked as such in `game.js`:

| | Why |
|---|---|
| `BUNDLE_GAIN` | The paper says the cilia bundle, not by how much it helps. Set by the skill gradient it produces. |
| `ROT_EASE` | The true rotational drag makes the cell far too sluggish to dodge with. |
| symmetric four cilia | The real arrangement is 3+1; with it, left and right steer differently and the controls stop being learnable. |
| the predators | Invented entirely. |

The one piece of strategy that *is* the paper's: a real *Pterosperma* is stopped
96.6% of the time, and the authors read it as a sit-and-wait animal. Here that
becomes a tactic — a beating cell pushes a flow signature predators feel from a
long way off, and a stopped one is nearly invisible.

> **Embodied behavioural complexity in a ciliated microorganism.**
> *Nature Communications* **17**, 8445 (2026).
> [doi:10.1038/s41467-026-75076-8](https://doi.org/10.1038/s41467-026-75076-8)

## Elsewhere on this surface

- [`/flag/`](../flag/) — the same model as an instrument, with every measurement it came from.
- [`/proteus/`](../proteus/) — the amoeba, which has to push its cilium against a spring-mass cortex.

## Deploy

Part of the `pokemon` surface (worker `poke`, `pokemon/wrangler.jsonc`), served
as a subpath. No build step. See the repository root `CLAUDE.md`.

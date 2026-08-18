# flag — ciliary locomotion instrument

Live at [`poke.mino.mobi/flag/`](https://poke.mino.mobi/flag/). A single-celled
organism swimming, with everything that makes it swim shown next to it: the
compound cilium beating, its twenty-number state vector, the behaviour chain
firing at measured rates, the dispersion relation, and the swimming speed the
model computes against the one that was measured.

Pure HTML + ES modules + Canvas 2D. No build step, no dependencies. It imports
the model from `../proteus/flagella.js` rather than copying it — same worker,
same asset directory, so a relative import just works.

## Files

- `index.html` — layout, controls, long-form notes, main loop.
- `instrument.js` — the free swimmer and the six panel renderers. Models
  nothing; every number comes out of `flagella.js`.
- `flag.selftest.mjs` — `node pokemon/flag/flag.selftest.mjs`.

## The swimmer is the honest part

At *Pterosperma*'s Reynolds number there is no inertia and nothing coasts, so
velocity **is** thrust over drag — which the model already reports as
`fl.speedUmS`. The whole integration is

```
position += thrustDirection × speedUmS × dt
```

with no force accumulator, no damping constant, and no tuning. That is the one
advantage this page has over the amoeba at [`/proteus/`](../proteus/), where the
same cilium has to push against a spring-mass cortex and needs a fudge factor
to do it.

## Why this surface has its own selftest

Both real bugs in this work lived at the seam between the model and the page,
and both were invisible to a test that drove the model directly:

- The reported speed was the **instantaneous** within-beat thrust rather than
  its cycle mean. The instantaneous value peaks about six times the mean, so
  the cell swam wildly too fast.
- The display-frame correction used `beatScale²` where resistive force theory,
  being **linear** in velocity, wants `beatScale`. A further factor of twelve
  at the default setting. It reads like it should be quadratic because
  cycle-averaged thrust goes as amplitude squared — but amplitude is not what
  the display slow-motion scales; only the rate is.

So `flag.selftest.mjs` runs the page's own loop and holds its reported speed
against the model's own offline speed-versus-frequency curve, and asserts that
neither the reported speed nor the distance covered per unit of model time
changes when the display slow-motion does. That invariant is what catches a
wrong power of `beatScale`, and nothing else here would.

## Controls

| | |
|---|---|
| `drive` | Leans on the transition rates by up to ~5× either way. It never sets the state, and a reorientation in progress ignores it. Left at 0 the cell is stopped 96.6% of the time, as measured. |
| `beat ÷` | Display divisor for the beat — 95 Hz cannot be drawn at 60 fps. Translation is divided by the same factor, so distance per beat cycle stays exactly right. The model frequency is untouched. |
| `rates ×` | Multiplies every transition rate. Scaling them all equally leaves the occupancy alone, so the 96.6% survives. `faithful ×1` is the measured chain. |
| `zoom` | px per µm in the swimmer view. |

The two time factors are independent, and that is the honest cost: at the
defaults a swim bout contains far fewer visible beat cycles than a real one.
The paper's timescales span four orders of magnitude and a browser has one
frame rate. The ethogram strip is where the separation actually shows.

## Source

> **Embodied behavioural complexity in a ciliated microorganism.**
> *Nature Communications* **17**, 8445 (2026).
> [doi:10.1038/s41467-026-75076-8](https://doi.org/10.1038/s41467-026-75076-8)

The model, its constants, and what is measured versus fitted are documented at
the top of [`../proteus/flagella.js`](../proteus/flagella.js) and in
[`../proteus/README.md`](../proteus/README.md).

## Deploy

Part of the `pokemon` surface (worker `poke`, `pokemon/wrangler.jsonc`), served
as a subpath. No build step. See the repository root `CLAUDE.md`.

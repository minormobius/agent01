# ink — ink.mino.mobi

<!-- SEEDED by scripts/gen-surface-docs.mjs from deploy-registry.json.
     This file is now HAND-OWNED — edit it directly; the script will not
     overwrite it. It is the instruction set for THIS surface. Repo-wide rules
     live in ../CLAUDE.md; the index of all surfaces is ../docs/SURFACES.md. -->

A roller for [Fluoddity](https://fluoddity.mino.mobi) organisms, **painted
rather than lit**. Two populations share one sheet and one trail field; their
paths are drawn as pen strokes in real pigment; and only genomes that clear
fluoddity's own interestingness rubric ever reach the paper.

## Facts

| | |
|---|---|
| Surface | `ink` |
| Dir | `ink/` |
| Endpoint | `ink.mino.mobi` |
| Type | frontend (static, no build, no D1, no AI, no secrets) |
| Owning branch | `claude/p5js-procgen-exploration-efdhws` |
| Deploy | [`.github/workflows/deploy-ink.yml`](../.github/workflows/deploy-ink.yml) |
| Uses | — (the Fluoddity rule is ported, not imported: see below) |
| Provides | — |

## The three things you must not break

Everything else here is taste. These three are load-bearing, and each has a
selftest that goes red if you break it.

### 1. Drawing must not touch the dynamics

An agent whose ink has run out **keeps moving and keeps depositing into the
field, exactly as before**. It simply stops emitting stroke segments.

If drawing could feed back into the simulation, the rubric — which measures the
*field* — would stop predicting the *picture*, and every claim this surface
makes about only showing you good ones would be void. `ink.selftest.mjs` zeroes
every reserve at load and asserts the field evolves bit-identically.

### 2. The probe is the painting, not a cheap model of it

The gate runs the candidate for `PROBE_STEPS` at **the same field size, the same
agent count, the same integration** as the painting, keeps the strokes, and — if
the candidate passes — resumes from there.

This started as an optimisation and turned into a correctness fix. A cheaper
probe is a **different substrate**: with 120 agents the trail field is lumpy and
with 768 it is dense, and since agents steer on that field the two diverge
completely. Measured, on one genome pair: fitness **0.118** on a small probe
versus **0.643** on the real thing. A gate that judges a substrate you never
render is not a gate. Two traps follow from this, both of which bit during
construction:

- The deposit splat is a fixed 3×3 of **cells**, so its width relative to the
  sheet depends on field resolution. Probe and paint must share it.
- Sensed field energy goes as `count × DEPOSIT`, so `DEPOSIT` is expressed as a
  **total across all agents** and divided by the live count at load. Agent count
  then controls only how many strokes you get.

### 3. The simulation is bit-deterministic across JS engines

`?g=` is the surface's contract: the same link is the same picture, anywhere,
for ever. The simulation is a chaotic feedback loop, so one wrong bit at step 3
is a different painting by step 400. `Math.sin`, `cos`, `pow`, `exp`, `log` and
`hypot` are all **implementation-approximated** in ECMAScript and none of them
may appear in the simulation path:

| instead of | use | why |
|---|---|---|
| `Math.sin` / `Math.cos` | `dsin` / `dcos` in [`js/trig.js`](js/trig.js) | Cody–Waite reduction + fdlibm kernels, all IEEE-exact ops |
| `Math.hypot(a,b)` | `Math.sqrt(a*a+b*b)` | `sqrt` is exactly specified; `hypot` is not |
| `Math.exp(k)` for a constant | a decimal literal | decimal→double parsing is exactly specified |
| `Math.pow` in the loop | quantise the result | see the blur constant `K` in `sim.js` |
| Box–Muller `normal()` | Irwin–Hall | avoids `log` and `cos` |

Genomes are also **minted already snapped** to the 16-bit-per-parameter grid the
URL codec uses, so `encodePair`/`decodePair` is an identity rather than a
near-miss — a shared link landing 1e-6 away in parameter space paints a
completely different picture.

## Layout

| file | what it is |
|---|---|
| [`js/trig.js`](js/trig.js) | deterministic `sin`/`cos`. Agrees with `Math.sin` to 1 ulp |
| [`js/prng.js`](js/prng.js) | the repo's `xmur3` + `mulberry32` `Rand`. Copied, not imported (static site) |
| [`js/rule.js`](js/rule.js) | the JS port of fluoddity's `FRAG_ENTITY` — `pcg`/`h1`/`h4`/`genCenter`/`evalRule`/`resetState` |
| [`js/genome.js`](js/genome.js) | fluoddity's `PARAMS` box, seeded sampling, mutation, and the URL codec |
| [`js/sim.js`](js/sim.js) | the CPU substrate: shared toroidal field, two populations, **stroke capture** |
| [`js/probe.js`](js/probe.js) | fluoddity's rubric, headless — `readDescriptors`/`fitness2`/`verdict`, ported verbatim |
| [`js/roll.js`](js/roll.js) | the gate: alive → novel → painted, on `fable/forge`'s admission pattern |
| [`js/paper.js`](js/paper.js) | pigment, paper, nib width, ink loading. The painterly half |
| [`js/app.js`](js/app.js) | UI, the progressive paint loop, permalinks |
| [`ink.selftest.mjs`](ink.selftest.mjs) | 33 assertions. Run it before you push |
| [`test/calibrate.mjs`](test/calibrate.mjs) | the measurement rig for `DEPOSIT` / `REF_INK` |

## The port, and why there is one

fluoddity's engine is WebGL2 and throws away the thing this surface is about:
agents write velocity into a texture and the paths are gone by the next frame.
A stroke needs a beginning, a length, a speed profile and a load of ink, so the
integration has to happen where we can hold onto it — on the CPU.

The hash is bit-exact (`h1` reinterprets the bits of a **32-bit** float, so its
inputs go through `Math.fround` exactly where GLSL was in single precision; get
that wrong and you are querying a different black box, not approximating the
same one). Downstream arithmetic is double precision, so results are **not**
bit-identical to the GPU — no two GPUs agree to the bit either. What is
guaranteed is the same rule family, deterministic across JS engines.

The one real cost saving that makes CPU affordable: the ten Fourier centres
depend only on `(rule_seed, mutation_scale, cohort)`, so they are built **once
per population** and each evaluation is ten dot products and forty sines.

## Measured constants — re-measure, don't guess

`DEPOSIT` (`sim.js`) and `REF_INK` (`probe.js`) were measured, not chosen. They
centre the fill distribution of uniformly-drawn genomes inside the 0.04–0.55
window fluoddity's fitness bump rewards:

```
node ink/test/calibrate.mjs 40 3,4,6,9        # sweep DEPOSIT
```

At the shipped values: median fill **0.338**, ~50% of draws clear
`ACCEPT_FIT`, 1 degenerate draw in 30, **~112 ms** per probe. The selftest
carries a wide-band canary on all three, so retuning the substrate without
re-measuring goes red instead of silently passing everything or nothing.

`REF_INK` deserves its own note: fluoddity scores at the genome's own `ink`,
because there `ink` **is** the display. Here it isn't — it sets brush loading —
so scoring at the genome's exposure would reject organisms for a rendering
decision this surface doesn't make. The descriptors, thresholds, fitness and
verdict are all fluoddity's, unmodified; only the exposure is held constant.

## Deploying

Pushes to `claude/p5js-procgen-exploration-efdhws` that touch `ink/**` trigger
[`deploy-ink.yml`](../.github/workflows/deploy-ink.yml), which runs the selftest
first. The sandbox cannot reach Cloudflare — **push to the trigger branch, don't
`wrangler deploy` locally**.

⭐ `ink.mino.mobi` was **unattached** when this surface was created, so the first
deploy both creates worker `ink` and binds the domain from the `custom_domain`
route. Green is not proof: confirm the run log says `ink.mino.mobi (custom
domain)` and that `/api/health` returns `"service": "ink"`. The workflow probes
it and prints a pointer to [`docs/DEPLOYS.md`](../docs/DEPLOYS.md) §4 if not.

## What the gate does not do — read before "improving" it

The rubric measures whether the **organism** is alive: coverage, motion, spatial
coherence, blow-out. That is the right question about a field and an incomplete
one about a picture, and the gap is visible. Rendered and ranked by hand over a
nine-sheet sample, the correlation between fitness and how good the sheet looked
was poor in **both** directions: the top scorer (0.71) was a flat allover
crosshatch, and one of the two most striking sheets scored 0.15.

Two automatic corrections were tried and **both removed**, because neither
survived contact with that sample. They are documented in place so the next
person does not repeat them:

| tried | where the note is | why it failed |
|---|---|---|
| penalise an even wash, via the coefficient of variation of 8×8 block density | `blockCV` in [`js/probe.js`](js/probe.js) | caught one of the two flat sheets (CV 0.39) and badly misranked the other (CV **0.71**, higher than three sheets ranked good). A fine hairline mesh can carry plenty of large-scale density variation while every mark is characterless — density variation is not composition |
| meter the pigment the strokes will lay down and correct thin sheets upward | the note above `nibAlpha` in [`js/paper.js`](js/paper.js) | measured correction across the sample was ×0.84–×1.07, a no-op. Total pigment barely varies between rolls; what varies is how thinly it is **spread**. Normalise pigment per unit of covered area, not pigment |

What is left is one honest lever: `nibAlpha`'s base opacity is 0.18 because 0.14
left the sparser half too faint. That is a taste decision and it is labelled as
one. **Do not dress a taste decision as a measurement** — that is what both
failed attempts did.

The credible route is not a statistic. [`reef`](../reef/CLAUDE.md) already has
the machinery: store only votes, regenerate specimens client-side from
(genome, seed), and fit a scorer to what people actually pick. That is the
natural next surface for this one to grow into.

## Where it could go

- **Brushes as PDS genomes.** A pair is already 80 URL-safe characters. Making
  it a lexicon record puts these on fluoddity's phylogeny, where a brush becomes
  a forkable organism with a lineage.
- **More than two hands.** The field is shared and the code is not hardwired to
  two, but three pigments multiplying on one sheet goes muddy fast — it needs a
  pigment model, not another population.
- **Plotter output.** The strokes are polylines in continuous space, so SVG is a
  serialisation away, and "does it plot?" is a falsifiable criterion of the kind
  this repo likes.
- **A crowd-fitted aesthetic scorer**, per the section above — the one change
  that would make "only good ones" true rather than "only live ones".

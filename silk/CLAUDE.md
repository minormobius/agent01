# silk — silk.mino.mobi

An agent that weaves orb webs from local rules and the silk it has already
laid, and a page that measures what it produces. Repo-wide rules live in
[`../CLAUDE.md`](../CLAUDE.md); the index of all surfaces is
[`../docs/SURFACES.md`](../docs/SURFACES.md).

## Facts

| | |
|---|---|
| Surface | `silk` |
| Dir | `silk/` |
| Endpoint | `silk.mino.mobi` |
| Type | frontend (assets worker with a `/health` route) |
| Owning branch | `claude/spiderweb-physarium-agent-ta17v4` |
| Deploy | [`.github/workflows/deploy-silk.yml`](../.github/workflows/deploy-silk.yml) |
| Uses | — (no D1, no KV, no auth, no secrets, no network at runtime) |
| Provides | — |

Machine-readable entry: [`../deploy-registry.json`](../deploy-registry.json) →
`surfaces[]` where `surface == "silk"`.

## What it is for

The question behind the surface: *for a given set of boundary conditions, is
there a correct family of spiderwebs, and where does the spread inside that
family come from?* The answer this surface argues for, and measures:

- there is a family, and it is tight in the numbers a field biologist takes off
  a photograph — capture area, spiral turns, silk used, mesh height, radius
  count all agree across seeds to within a few percent;
- the family is loose in geometry, past the point where one member could be a
  shifted copy of another;
- and the looseness is **construction order**, not noise. Perturb one decision
  and the damage is a monotone function of *when* you perturbed it, spanning two
  orders of magnitude from the bridge line to the four-hundredth spiral
  attachment.

The framing is Physarum's — an agent whose environment holds its state — with
one difference that does all the work: **a chemoattractant evaporates and silk
does not.** A decaying trace lets an agent forget a bad early commitment; an
undecaying one cannot be un-laid. That is the whole reason the spread is path
dependence rather than noise. [`RESEARCH.md`](RESEARCH.md) has the literature
search behind this, and the ten properties such an agent has.

## The shape

```
silk/
  index.html            four tabs: weave · the family · path dependence · notes
  styles.css
  js/
    rng.mjs             seeded streams — ONE PER DECISION CLASS (see below)
    fabric.mjs          the silk: nodes, tension-only threads, Verlet, Chain
    boundary.mjs        the boundary conditions + the seven presets
    weaver.mjs          THE AGENT — the body, the stages, every rule
    metrics.mjs         the invariants, the family aggregate, the divergence
    render.mjs          canvas drawing; knows nothing about weaving
    app.mjs             the page; knows nothing about weaving either
  lexicon/              THE LEXICON WEB — /lexicon/, a second, unrelated web
    build.mjs           CAR → data.json: tokenise, cluster, lay out
    car.mjs             90-line CAR v1 + DAG-CBOR reader, no dependencies
    data.json           the built artefact (1.1 MB), committed
    index.html app.mjs lexicon.css
  test/
    fabric.selftest.mjs  32 checks — geometry, tension-only, splitting, chains
    weaver.selftest.mjs  62 checks — the four claims the page makes
    lexicon.selftest.mjs 32 checks — the CAR reader, the data file, the promise
  worker.js             assets + /health
  wrangler.jsonc
```

`weaver.mjs` is the file. Everything else exists to serve it or to check it.

## The lexicon web (`/lexicon/`)

A different question on the same shape: *what does a whole vocabulary look
like?* 39,554 word types from 49,919 posts, placed by topic (angle), rank
(radius) and date (colour). It shares nothing with the weaver but the palette
and the domain — it is a chart, not a simulation.

**Rebuild it:** `node silk/lexicon/build.mjs <handle>`. The 91 MB repo CAR is
cached in `lexicon/.cache/` and is gitignored *and* `.assetsignore`d; it is an
input, not an artefact, and shipping it would blow the asset budget on its own.

Four things in here were got wrong first and are worth not re-deriving:

**The context unit is a session, not a post.** At 6.4 content words a post,
post-level co-occurrence is almost all zeros and ones. The first run produced a
flat eigenvalue spectrum and k-means collapsed six of eight clusters to empty.

**The leading eigenvector is thrown away.** The first component of any PPMI
matrix is the frequency axis, so keeping it made every "topic" a frequency band.

**The tail is assigned by lift, not by raw vote.** The hub cluster is by
construction the one whose words appear everywhere, so on a raw vote it wins
every tail word — the first build put 37,829 of 39,554 types into it.

**Radius is rank, spaced for equal area — not log frequency.** This is the one
that had to be drawn to be believed. Zipf puts 19,320 of these words at exactly
one use, and log(1) = 0, so half the lexicon lands on a single hairline circle
at the rim with the interior empty. Log-frequency gives the count-1 shell 9% of
the radius for 48% of the words. `r = √(r_in² + (r_rim² − r_in²)·p)` makes
density flat, and the counts go back on as labelled rings.

The selftest asserts the layout invariants the client relies on — in particular
that each wedge's within-wedge indices are a 0..n−1 permutation, because the
client turns that index straight into a bearing and a gap or a duplicate is a
pile of words on one angle. It also asserts the page's privacy claim: no
whitespace, no non-token strings, no URIs in the data file.

## Five things that are load-bearing, and why

**1. One random stream per decision class.** `rng.mjs` gives bridging, framing,
radius placement, the auxiliary spiral and the capture spiral separate streams.
Without this the path-dependence view is worthless: perturbing radius #3 would
reshuffle every later draw, and you could not tell "the perturbation propagated
structurally" from "the noise changed". With it, nudging a radius leaves the
spiral's own draws bit-identical, and the selftest asserts exactly that.

**2. Threads pull; they do not push.** The constraint solver only ever shortens
an over-long thread (`Fabric.relax`). Structure is held by pre-tension against
pinned anchors, which is how a real web works and why cutting a frame thread
slackens a sector instead of doing nothing.

**3. Geometry is read live, never cached.** `_sortRadii` recomputes every
radius's bearing from the hub's *current* position each time the list is
touched, because the hub is not pinned and every radius laid drags it. Caching
bearings at lay time produced sorted orders that disagreed with the geometry,
and the agent "split" gaps that were already full.

**4. Gravity enters twice and the two must stay apart.** Behaviourally (the hub
rise, the up/down mesh tilt) it is what the animal *does*; mechanically it is
what makes the sheet hang. The mechanical term is scaled to 5% because at full
strength the whole web slid down its frame, dragged the hub back to centre, and
silently cancelled the behavioural asymmetry the model exists to show.

**5. The capture spiral is gauged per radius AND against the previous
attachment.** Two gauges, not one: a mesh inward of the last turn *on this
radius*, averaged 92/8 with *where the agent just was*, one radius back. The
second term is a low-pass filter running round the web, and it is why an orb's
outer turns follow the frame and its inner turns are nearly circular. Both were
got wrong first: a single global spiral phase averaged the gravity term away
before it reached any thread, and no smoothing at all turned a rectangular frame
into concentric rectangles.

## The presets are the argument

`boundary.mjs` carries seven. Two of them are not habitats:

- **no gravity** is a **control**. Its job is to make the gravity result
  falsifiable: hub rise goes 0.113 → −0.011, capture area below ÷ above goes
  1.44 → 0.95, mesh above ÷ below goes 1.21 → 1.06. Without it, "the agent makes
  lopsided webs" would be indistinguishable from "the algorithm happens to make
  lopsided webs".
- **thin silk, high wind** proves the degradation order. Frame and radii are
  non-negotiable; the shortfall lands entirely on the capture spiral, and the
  scaffolding the agent never reached is still hanging when it stops. An
  unfinished web is a correct web.

## Changing the agent

The selftests are not a smoke test — they are the page's claims. `weaver.
selftest.mjs` asserts the family CVs, the gravity control and the shape of the
path-dependence curve, with thresholds set from measurement and a margin, not
from what happened to pass. **If a change to the rules makes them fail, the
honest move is usually to change the claim on the page, not the threshold.**
That has already happened once: the mesh tilt is real but modest (1.21, and
CV 10%), so it was demoted from "invariant" to "gravity readout" and the page
was rewritten to say so.

Both selftests run in CI *before* wrangler. A surface that publishes a
measurement it no longer passes is worse than one that publishes nothing,
because it looks like evidence.

## Deploy

Push to `claude/spiderweb-physarium-agent-ta17v4` touching `silk/**`. Static
worker, no build step. `silk.mino.mobi` was a fresh hostname (verified
unclaimed 2026-08-20) created by the first deploy from the `custom_domain`
route in `wrangler.jsonc` — the path `foam`, `loop` and `plant` took.
**Green is not proof:** confirm the run logs `silk.mino.mobi (custom domain)`.
The workflow's `/health` probe is patient (2 minutes, for first-deploy
certificate issuance) but not permissive — it fails red.

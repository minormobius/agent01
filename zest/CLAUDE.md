# zest — zest.mino.mobi

<!-- HAND-OWNED. Repo-wide rules live in ../CLAUDE.md; the index of all surfaces
     is ../docs/SURFACES.md. -->

Legibility of embeddings, as a fruit-ninja game. A Bluesky post's 768-dimensional
embedding is used as the **spectrum of a surface**, posts rain down as those
surfaces, and you slice the ones that mean the same kind of thing as the anchor.
A binomial test then tells you whether you were reading the geometry or guessing.

## Facts

| | |
|---|---|
| Surface | `zest` |
| Dir | `zest/` |
| Endpoint | `zest.mino.mobi` |
| Type | fullstack (assets Worker + 3 JSON endpoints + daily cron) |
| Owning branch | `claude/3d-feed-embedding-geometry-uiveyf` |
| Deploy | `.github/workflows/deploy-zest.yml` |
| Uses | `atpolls-db` (D1), Workers AI, the public Bluesky AppView |
| Provides | — |

Machine-readable entry: [`deploy-registry.json`](../deploy-registry.json) →
`surfaces[]` where `surface == "zest"`.

## The map, and why it is this map

    r(θ,φ) = R · ( 1 + amp · Σ_l Σ_m ĉ_lm · Y_l^m(θ,φ) )

Real spherical harmonics are the Fourier basis on the sphere, so a coefficient
vector *is* a shape and a shape *is* a coefficient vector. Dimensions are ranked
by variance **across the corpus**, then:

| band | slots | carries |
|---|---|---|
| `l = 0` | 1 | **No dimension at all** — it holds ‖z‖, distance from the average post. Ordinary posts are small pebbles, strange ones are big. |
| `l = 1..4` | 24 | The **24 loudest** dimensions, one slot each. The lobes: the silhouette you read across a room. |
| `l = 5..10` | 96 | The remaining **~740 quiet** dimensions via a seeded Johnson–Lindenstrauss projection. The grain. |

The brief asked for "the 20 highest variance dimensions". Whole harmonic bands
come in sizes 3, 5, 7, 9 — there is no subset summing to 20, and a partial band
is a shape with a seam in it. Bands 1–4 give **24**, so it is 24.

**The map is linear and the harmonics are orthonormal**, so Parseval gives

    ‖ surface_A − surface_B ‖_L²(S²)  =  ‖ c_A − c_B ‖₂

exactly. Two posts that mean the same thing cannot look different. That is an
identity, not an aspiration, and `embed-geometry.selftest.mjs` §2 checks it
against a Gauss–Legendre quadrature rather than asserting it.

## Files

| File | What it is |
|---|---|
| `embed-geometry.js` | **The map.** Pure, DOM-free, no imports. SH evaluation, the corpus basis, the projector, mesh generation, colour. Everything meaningful lives here. |
| `rounds.js` | **The rules and the statistics.** Pure. Anchor selection, the ripeness quantile, the exact binomial test. |
| `feed.js` | Data layer: posts, vectors, basis — and the fallback for each, announced rather than hidden. |
| `game.js` | three.js scene, ballistics, blade, slicing. Physics and pixels only. |
| `worker.js` | `/api/feed`, `/api/embed`, `/api/basis`, `/health`, daily cron. Its pure half (`usablePost`, the hash, the Float32 codecs) is exported for the selftest. |
| `index.html` | The game. `atlas.html` → `/atlas`, `how.html` → `/how`. |

## Run the selftests before touching either pure module

```bash
node zest/embed-geometry.selftest.mjs   # 103 assertions — the map is faithful
node zest/rounds.selftest.mjs           # 280 assertions — the test is calibrated
node zest/worker.selftest.mjs           #  85 assertions — the premise + the bytes
```

All three gate the deploy, and they are not smoke tests: §2 of the first checks
Parseval numerically against a Gauss–Legendre quadrature, §5 measures same-topic
separation (AUC) on a corpus built to have real embedding statistics, §5 of the
second runs 600 simulated guessers and asserts the "you are reading the
geometry" verdict fires at the nominal 5%, and §1 of the third pins every way a
post can carry information the embedding never saw.

## Things that will bite you

**`DEFAULTS.seed` is frozen.** The quiet-dimension projection is drawn from it.
Change it and every post ever screenshotted becomes a different solid.

**`BASIS_VERSION` in `worker.js` is part of the row key, and bumping it is the
ONLY way to refit.** The cron builds the basis if it is missing and otherwise
leaves it alone, on purpose. The basis decides which dimension drives which
harmonic, so a refit re-shapes every post ever drawn — and the variance ranking
is precisely what a fresh sample jitters, since at a few hundred posts the
standard error on each dimension's spread is enough to swap neighbouring ranks.
A surface promising "two people looking at the same post see the same solid"
cannot quietly redraw itself every night. Bump the version when the model, the
sample or the α in `makeBasis` changes; expect every shape to move when you do.

**Do not "improve" the shapes.** No stylised bevels, no organic noise, no
per-post randomness in the material. If a shape looks boring, that is a fact
about the post; hiding it would make the page a lie.

**α = 0.5 in `makeBasis` was measured, not chosen.** Full whitening (α = 1)
looks more correct and annihilates the variance ranking the map is built on. The
sweep and the tiebreak are in the docstring; reproduce it before changing it.

**Ripeness is judged on cosine, never on `shapeDistance`.** L² surface distance
also carries size, and size comes from strangeness, not topic — that costs about
17 points of AUC. §5(b) of the geometry selftest proves the attribution.

**Text-only is the premise, not a filter setting.** A post with a picture has
already told you its topic through a channel the embedding never saw. The rule
lives in one place, `usablePost()` in `worker.js`, and every rejection reason is
pinned in `worker.selftest.mjs` §1.

**A hunt round always runs its full slate.** Ending early once a player has made
n mistakes is optional stopping, and it biases the binomial test the scoreboard
reports — the null model assumes a fixed number of trials. Mistakes cost points,
never the measurement. For the same reason `fellPast()` records *every* post
that leaves the screen unsliced, not just the ripe ones: dropping the correct
rejections inflates the round's base rate.

## Deploy

Push to the owning branch with something under `zest/**` touched. The workflow
runs all three selftests, stages the static half into `zest/dist/` (Static Assets
replaces the **whole** manifest — anything not staged is not on the site),
applies migrations `0037_zest.sql` and `0038_zest_status.sql`, then
`wrangler deploy`.

`zest.mino.mobi` did not resolve before this surface existed, so the first
deploy creates the worker *and* attaches the domain (the `words` / `neuro`
precedent — `mino.mobi` is a zone on this account). **Confirm the run log binds
`zest.mino.mobi (custom domain)`.** Green is not proof.

## Watching the basis cron

`GET /health` reports `lastBasisBuild: { ok, detail, at }`. **Check it before
believing a missing basis is just a cold start** — a basis that is absent
because the fit *failed* looks identical to one that has not run yet, and that
cost a real diagnosis: the first sample loop gathered 116 posts against a floor
of 120, threw, and left nothing behind but `basis: null`.

Live yields, measured 2026-08-16, which is what the sample budget is sized
against — re-measure before changing `BASIS_SAMPLE` or `BASIS_MIN`:

| feed | kept | dominant rejection |
|---|---|---|
| SimCluster | ~34% | `embed` |
| Discover | ~7.7% | `embed` (467 of 520 scanned) |

## Cost

Workers AI is the only metered thing. Embeddings are cached on D1 by content
hash, so a post is embedded once across all players and the daily basis refit
mostly hits the cache. The cron prunes cache rows older than 30 days.

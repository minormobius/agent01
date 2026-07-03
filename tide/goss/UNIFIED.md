# UNIFIED — seven webs → one web, measured

The nave is seven rooms — a commons and six faction wards, each with its own civilizational
biome. The engine (and chunkroller's civic readout) treats them as **seven independent
societies**: `scoreChunk` per chunk, zero cross-ward anything. This study asks what happens
when the whole nave is taken as **a single civilizational set** — one society, one web — and
whether hoop v101's chunk-loading infrastructure can support that reading.

Everything below is reproducible:

```bash
node tide/goss/tools/study-unified.mjs        # all baked seeds (1 2 3 5 7 11 42 99)
```

The kernel under test is the shipped `gossip.js` (`buildGossNave` in `sealed` vs `floor`
mode) over the baked floors in `data/nave-*.json`; the health oracle is econ's
`scoreSociety` — the same Thriving…Failing vitality that `/econ` and `/chunkroller` report.

## A. Health — the unified web wins on every seed, and it isn't close

| seed | souls | sealed | unified | closure | cross-ward tie weight |
|---|---|---|---|---|---|
| 1 | 193 | 69 Stable | **86 Thriving** | 73→99% | 0→45% |
| 2 | 194 | 71 Healthy | **84 Healthy** | 74→98% | 0→52% |
| 3 | 202 | 70 Healthy | **84 Healthy** | 68→99% | 0→38% |
| 5 | 191 | 71 Healthy | **87 Thriving** | 79→100% | 0→53% |
| 7 | 249 | 68 Stable | **88 Thriving** | 65→99% | 0→43% |
| 11 | 123 | 69 Stable | **85 Thriving** | 70→99% | 0→49% |
| 42 | 175 | 68 Stable | **85 Thriving** | 70→98% | 0→47% |
| 99 | 229 | 70 Healthy | **88 Thriving** | 71→98% | 0→46% |

Mean vitality **69.5 → 85.9 (+16.4)**. Sealed wards never reach Thriving; the unified floor
almost always does. The signal breakdown says why (mean over seeds, sealed → unified):

| signal | sealed | unified | Δ | reading |
|---|---|---|---|---|
| closes | 0.71 | 0.99 | **+0.27** | a ward missing a producer *imports* — the supply web finally closes |
| weave | 0.24 | 0.56 | **+0.32** | reach: shoulders rubbed through one's hats triples |
| thick | 0.45 | 0.67 | **+0.21** | more viable hat targets → more hats per person |
| thirds | 0.67 | 0.87 | **+0.20** | wards short a parish/club borrow the neighbour's |
| resilient | 0.94 | 0.99 | +0.05 | losing a hub hurts less when there's an alternative one ward over |
| bridges | 0.82 | 0.85 | +0.03 | already high — the foam does this on its own |
| employ | 1.00 | 1.00 | 0 | never the binding constraint |

The story is specialization: the wards are *designed* specialized (each faction owns four
roles, weight-0 for everything else), so sealed wards are structurally incomplete economies
and structurally thin societies. Unification is exactly the trade the specialization was
implicitly counting on. From the /econ civ perspective, **the nave is one town that has been
scored as seven fragments.**

## B. Relationships — not more drama, *further-reaching* drama

Drama counts and mean heat barely move (≈25 seeds/floor, heat ~72–78 both modes) — the
oracle finds material at any scale. What changes is **reach and texture**:

- **Cross-ward tie weight goes 0% → ~38–53%.** Half the fabric now crosses a designed wall.
- **Ward-spanning dramas jump ~5×** (sealed 0–3 per seed, only inter-ward FEUDs between
  tribes that never touch; unified 7–14 — sparks, affairs, defectors, and schisms whose
  cast lives in different wards).
- **The tribal texture coarsens**: 10–19 ward-bound micro-tribes fuse into 2–8 floor
  tribes; faction↔tribe alignment falls from 100% (tautological — tribes can't cross a
  sealed wall) to 35–75%. At seeds 5 and 7 the floor fuses to two mega-tribes.

That last point is the honest caveat: pure Euclidean unification can *over*-mix. The
narcissism-of-small-differences axis needs several near-twin tribes to fire, and a
two-mega-tribe floor has less of that texture than seven parochial wards did. The most
interesting drama substrate is likely **in between** — walls that leak rather than walls
that vanish. The lever is already identified in README.md: make hat assignment
**route-distance-aware** (walls and ports priced in) instead of Euclidean. Sealed and
unified are the two brackets; route-aware is the real target.

## C. v101 compatibility — yes, with one ordering invariant and one pattern to respect

v101 does not load the nave whole: `newWorld` solves only the commons, then
`ensureFactionWards` streams ward pairs just-in-time as the campaign unlocks them
(continuant → rindwalker → drift, one chunk per tick, `rebuildSocietySoon` after each
drain). Two findings:

### C1. The solves are order-independent under v101's order — but not under every order

Measured (`study-unified.mjs` part C1): solving in v101's unlock order
`[0, 3,4, 1,2, 5,6]` produces **byte-identical rooms** to `buildNave`'s dir order
`[0, 1..6]` — so the game's streamed nave, the standalone `/nave` page, and goss's baked
`data/nave-*.json` all agree. But a **sibling-reversed** order (ward 4 before ward 3)
**diverges**: `naveSolveNext` inherits seam ports only from already-solved neighbours, so
whichever sibling solves first generates the pair's shared ports. The invariant that makes
everything agree: **commons first, and within each faction pair the lower-dir ward first.**
`ensureFactionWards` pushes `[1,2]/[3,4]/[5,6]` in ascending order and the streamer drains
FIFO, so v101 satisfies it today — but nothing pins it. Any future reordering (a quest that
unlocks the `mild` ward before the `high` one) would silently fork the floor's geometry
from the baked data. If that ever becomes a live risk, pin it in `hoop/nave/test/`.

### C2. The unified society must be *revealed*, not *re-rolled*

If you re-run the unified `buildSociety` after each streamed ward (the game's
`rebuildSocietySoon` pattern applied to the econ re-roll), existing people keep their
identity — 100% stable names/homes/households, because econ consumes one serial rng stream
over places in order and streamed rooms only *append* — but their hats churn absurdly:
**~90–100% of already-cast people change workplace at every stage**, because occupation
picks index into the *grown* workplace list (the rng draw is the same; the modulus isn't).
Third places churn only 14–38% — those use deterministic `nearest()`, so they flip only
when a genuinely nearer parish appears. The commute web in `v101/npc.js` is nearest-based
throughout, which is why the live game's churn is causally local and nobody has noticed.

So: **the chunk-loading infrastructure is compatible with the nave as a single
civilizational set, provided the set is a function of the full seven-chunk nave, computed
once and revealed ward-by-ward as chunks stream in** — never re-derived per stage. That is
cheap and fits the existing machinery, because the full solve is deterministic (C1) and
bounded (seven chunks): compute the floor society from the complete room set (headless,
even before the wards are painted — the recs exist as data the moment they solve, and
could be solved eagerly off the hot path), then filter the visible sub-web to loaded
wards. Vitality along the unlock chain then reads as a designed arc rather than an
artifact of the modulus. For reference, the re-rolled trajectory (seed 7):
commons alone **60 Stable** → +continuant **79 Healthy** → +rindwalker **87 Thriving** →
full nave **88 Thriving** — the campaign literally walks the town up the vitality scale as
it unseals wards, which is a narrative gift *if* the intermediate stages are stable, i.e.
revealed prefixes of one canonical society.

If hoop ever wants incremental-stable *re-rolls* instead (open worlds where the room set
is unbounded), the econ kernel fix is to key each person's occupation candidates off
stable identity — e.g. nearest-of-k where the k tries are `hash(person, tryIndex)` reservoir
draws over a stable place ordering — so appending rooms can only *locally* rewire. That's an
upstream `econ.js` design note (copy-never-fork: it belongs in hoop, not in the vendored
copy here).

## What changed because of this study

- The goss viewer's nave substrate now **defaults to the unified floor web**
  (`?mode=sealed` keeps the engine-faithful seven-webs view a permalink away).
- `tools/study-unified.mjs` is committed as the reproducible measurement.
- Next lever, in order of value: **route-distance-aware hats** (the walls should price in,
  not vanish) → re-run this study to find the polarization sweet spot where vitality stays
  Thriving *and* the tribal texture stays multi-tribe.

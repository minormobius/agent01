# BRIEF — Theta Line (site-5)

## What this is

The factory posted a 300-character advert about a paper on branching
populations competing for a shared, locally-recycled resource. The requester
replied "build that." The paper's claim: define θ = β·m/c (reproduction rate
times resource-per-corpse, over consumption rate) — the population dies out
almost surely whenever θ ≤ 1, even at θ = 1 exactly with perfect recycling,
and only survives with positive probability once θ > 1, independent of
diffusion speed, death rate, or kernel shape.

Turn one, shipped: three sliders (β, c, m), a live θ readout with a clear
survive/doomed verdict, and a run button that simulates a 2D branching random
walk over a resource field (heatmap + dots on canvas), starting from two
particles, plotting population-over-time on a second canvas with a big
copy-image button (this requester's standing "always" preference — see
`lab/_profiles/minormobius.bsky.social.md`).

## Decisions

- **Derived my own mean-field model rather than guessing at the unnamed
  paper's actual equations.** I don't have the paper, only the advert's
  prose. I picked dynamics that make θ = β·m/c land exactly on the real
  threshold of a textbook birth-death branching process: per-capita death
  rate fixed at 1 (paper says the threshold doesn't depend on death rate, so
  I used that freedom to normalize time), local resource decays at rate
  `c·n(cell)` (consumption "proportional to local crowding"), each death adds
  `m` to local resource, and birth rate per particle is `β·R(local)`. At
  local quasi-equilibrium this gives birth rate θ against death rate 1 — the
  textbook critical branching process. It's provably consistent with the
  paper's one stated fact, even though I never saw its real PDE/SPDE.
- **Named it "Theta Line," not "corpse economy."** The advert's working title
  reads fine as a description but isn't a snappy site name; didn't see a
  trademark concern either way, just picked something that foregrounds the
  actual number the whole toy turns on.
- **Did NOT build the cross-visitor survival-time histogram** the advert
  asked for. `pds.js` has no global scoreboard query — only `scoresOf(handle)`
  for a handle the visitor names — and the one-rule-with-teeth here is
  explicit: never pool content/data from a stream the visitor didn't name.
  Pooling arbitrary strangers' runs into a shared histogram is exactly that
  stream. `workers/scores` (also named in the advert) isn't reachable either:
  the lab worker's CSP `connect-src` only allows `public.api.bsky.app` and
  `plc.directory`. Same deviation-and-say-so pattern as `diffuse` and
  `porefront` in the profile history.
- **Defaults start at θ = 1 exactly.** That's the hardest, most interesting
  case per the paper's own framing (extinction even with zero waste) — and
  it's an honest demo: the UI explicitly warns that hitting the time cap
  alive is not proof of survival, since critical branching processes can
  wander a long time before dying.
- **Population cap (1500) and simulated-time cap (1200, dt=0.1)**, per the
  task's own warning that a naive θ=1 run can look stable for a while. The
  cap exists for legibility/performance, not physical realism — said so in
  the on-page copy rather than overclaiming.

## The plan — what's not built yet, in order

1. **A per-(β,c,m) personal best, saved to the visitor's own repo.** Use
   `kit.handleInput` to let a signed-in visitor save their longest observed
   survival time via `store.postScore(timeMs, {detail: 'beta=..,c=..,m=..'})`,
   and `store.scoresOf(friendHandle)` to compare against a named friend's
   runs at the same point — this is the closest buildable analogue to the
   advert's shared histogram, inside the no-pooling-strangers' rule. Not done
   this turn because scope was already full; this is the natural next step
   and should come before anything else.
2. **1D mode.** The advert asked for 1D or 2D; I built 2D only (reads better
   on a phone-width canvas, and it's visually closer to "dots over a
   heatmap"). A 1D toggle showing the same resource field as a strip plus a
   space-time plot (x vs. t) would be a cheap, legible addition and would let
   a visitor see individual lineages more clearly than the 2D view does.
3. **Multiple simultaneous runs at different θ**, overlaid on one population
   chart, to make the θ=1 boundary's qualitative difference from θ=0.9 and
   θ=1.1 visible side by side without re-running three times by hand. This is
   the natural partner to item 1's leaderboard idea — comparing your own runs
   across θ before comparing against a friend's.
4. **A real reference for the model.** If a human can vendor the actual
   paper's text (via the thread-link fetcher), the mean-field derivation
   above should be checked against the real equations and corrected if it
   diverges — right now it's my own reconstruction that happens to reproduce
   the one stated fact, not a verified port.

## Gotchas

- `history` is pushed every simulated step (dt=0.1 → up to ~12000 entries at
  full run length); the chart renderer strides-samples down to ~1000 points
  before drawing rather than drawing every point, or the line chart canvas
  call gets slow near the end of a long run.
- Resource decay uses particle counts from the *start* of the step (computed
  once, before any births/deaths that step are applied) — a cheap
  approximation, not an exact integrator. Fine for a toy; would matter if
  this gets rebuilt against the real paper's equations (see plan item 4).
- I never saw the actual paper — only the advert's prose description — so
  there is no citation to link on the page. If the requester has the arXiv
  link, dropping it in a reply would let the next turn fetch and verify the
  real dynamics instead of the reconstruction above.

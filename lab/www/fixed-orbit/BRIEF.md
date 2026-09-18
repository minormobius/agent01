# BRIEF — Fixed Orbit (lab/www/site-4)

## What this is

A reply to a factory-posted concept advert: minimum-time control of identical
Kuramoto oscillators into synchrony under a hard instantaneous power budget.
The advert (written by an agent that read the underlying paper) proposed a
two-turn build — turn one is a Kuramoto sim with an N slider, greedy control
only, and a big time-to-sync number; turn two adds a second, learned
three-harmonic control law and races the two head-to-head. **This is turn
one**, and I stuck to its scope exactly: no second controller, no race, no
leaderboard yet.

What shipped: a real greedy-control simulation (`uⱼ = −c·sin(φⱼ−ψ)`, `c`
rescaled every step to spend exactly the power budget `P`), an N slider
(3–150), a power-budget slider, a live oscillator view (dots on the unit
circle plus the order-parameter vector), and — the piece the advert called
out as the actual hard part — a complex-plane plot of `R(t)` that overlays
the *same* random starting phases run at three different power budgets
(0.3×, 1×, 3×). They trace the same curve. That's the geometric argument for
why greedy is suboptimal beyond N=2, shown rather than asserted, with no
dynamic-programming comparison needed.

## Decisions

- **No second controller, no race, no `pds.js`/leaderboard this turn.**
  The advert's own scoping said turn two is where the learned three-harmonic
  law and the head-to-head race belong, and per this requester's established
  pattern (see the profile: `rootcut`, `that-2`/Sixfold, `porefront`), an
  honest scoped turn one beats a shakier full attempt. There's also nothing
  yet worth writing to a visitor's repo — a leaderboard needs two things to
  compare, and there's only one controller so far.
- **Reference curves are recomputed on every power-budget change, not
  cached.** `computeOrbit` is a pure function of `(initialPhases, P)` and
  cheap enough (≤20,000 steps × N ops, N≤150 — a few million float ops,
  comfortably sub-frame) to just re-run three times whenever the slider
  moves. I did add a `requestAnimationFrame` coalesce on the slider's `input`
  handler so a fast drag on a phone doesn't queue up a backlog of full
  re-solves; see GOTCHAS.
- **`ω = 0` for every oscillator ("identical" taken literally).** Nothing
  drifts without the controller, so "sim time" is unitless and only the
  ratio of power to time is meaningful — said explicitly in the "reading it"
  copy rather than left implicit, since this requester has previously caught
  a computed quantity being attributed to the wrong thing (see the
  `arch-brainstorm` steepness/wall entry in the profile) and an unlabeled
  arbitrary time axis is the same category of trap.
- **Synchrony is called at r≥0.999, not r=1.** r only reaches 1 in the
  infinite-time limit (the greedy push itself vanishes as oscillators
  converge), so claiming exact sync would be a number that never fires.
  Said in the copy, not just picked silently.
- **One `<canvas>` per view, not a DOM/SVG diagram.** Per the profile's
  standing rule from `want-pairwise` (a real rendered image is the primary
  artifact, not an interactive DOM structure with copy bolted on), and the
  orbit canvas gets the "big shiny copy image" button per the other standing
  preference.
- **`g`'s canvas-simulation pattern wasn't literally reused.** I looked for
  it (the advert's "Reuse" line names it) — there is no `g/` directory in
  this repo to import from, so I wrote the canvas physics directly instead,
  following the same plain-canvas-2D style already established by
  `porefront`/`site-3` rather than any shared module. Worth checking again
  if `g/` shows up later; nothing here depends on it being absent.

## The plan — what's not built yet, in order

1. **The tunable three-harmonic law**: `uᵢ ∝ −sin(φᵢ−ψ) + a₂sin(2(φᵢ−ψ)) +
   a₃sin(3(φᵢ−ψ))`, normalized to the same power budget `c` the greedy law
   uses (same `sqrt(P / Σ(push)²)` scaling, just with the three-term push
   vector instead of the one-term `sin` vector). The paper's own reported
   constants (recovering 84–99% of the learned policy's advantage, stable
   from N=3 to N=1000) are the values to start from — hardcode them as
   defaults, expose `a₂`/`a₃` as sliders if there's time, and it should beat
   greedy's time-to-sync by roughly the paper's claimed 10–14% at
   N=10–100. This is the natural next `computeOrbit`/`stepGreedy` variant:
   add a `stepTuned(phases, P, a2, a3)` alongside `stepGreedy`, sharing the
   `c`-normalization logic.
2. **The actual race**: run greedy and the tuned law side by side from the
   *same* starting phases and power budget — two oscillator panels or one
   shared one with two order-parameter traces, two clocks, and whichever
   hits r≥0.999 first wins. The existing `computeOrbit`/live-stepping split
   generalizes directly: reuse the live rAF loop, just drive two phase
   arrays and two `livePts` traces instead of one.
3. **The leaderboard**: `postScore` a claimed run as `{ n, budget, seed,
   controlLaw, syncTime }` via `/_kit/pds.js`'s `com.minomobi.lab.score`
   under this site's slug. Per the kit's own rule, a claimed record must be
   free to re-simulate — store the actual seed (not just the resulting
   phases) so a verifier can rerun `randPhases` seeded the same way and
   check the claimed `syncTime` independently. **This needs a seedable RNG**
   — right now `randPhases` calls `Math.random()` directly, which is not
   reproducible. Swap in a small seeded PRNG (mulberry32 or similar, a
   dozen lines) before wiring up scores, or a claimed leaderboard entry is
   unverifiable by construction. Per the kit's "leaderboard is people the
   visitor named" rule, this should be `kit.handleInput` + `store.scoresOf`
   against handles the visitor types, not a global board.
4. **Perf headroom for the reference-curve recompute at large N.** Not a
   problem today (see Decisions), but if a future turn adds a fourth
   comparison budget or bumps `MAX_STEPS`, re-check the coalesce still keeps
   dragging responsive on a phone — see GOTCHAS below before changing
   `MAX_STEPS` or the number of reference budgets.

## Gotchas

- **`computeOrbit` and the live `frame()` loop must stay in lock-step on
  their stopping rule.** Both use `DT=0.02`, `MAX_STEPS=20000`,
  `SYNC_R=0.999`. If a future edit changes one without the other, the
  reference curves and the live trace will disagree about when "synced"
  happens, and the `reduced-motion` branch in `runBtn`'s handler (which
  replays `computeOrbit`'s exact step count onto `livePhases` to keep the
  two in sync) will desync the oscillator view from the orbit view.
- **The power-budget slider's `input` handler is coalesced to one
  `requestAnimationFrame` at a time** (`pRecomputePending`), because
  `computeOrbit` isn't free — three reference re-solves at N=150 is a few
  million float ops, fine once, not fine on every `input` tick during a
  fast phone drag. If a future change makes `computeOrbit` more expensive
  (more reference budgets, larger `MAX_STEPS`, a per-step DP comparison for
  turn two), re-check this still keeps up, or move the recompute off the
  main thread (a Web Worker — same-origin workers are allowed, see the
  kit's WASM section).
- **`stepGreedy` mutates its `phases` array in place** and returns the
  order parameter computed *before* the step (used internally for `ψ`).
  Callers that need the *post-step* order parameter (nearly everyone) call
  `orderParam` again afterward — don't assume `stepGreedy`'s return value is
  the current state.
- **No `g/` canvas-simulation module exists in this repo** despite the
  advert naming it as reuse — checked, not present. If it's added later,
  this site's hand-rolled canvas code is a plausible candidate to migrate
  onto it, but nothing here currently depends on it.

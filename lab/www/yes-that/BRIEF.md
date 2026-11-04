# BRIEF — stallpoint (yes-that)

## What this is

A reply to a factory-posted advert about low-temperature-differential Stirling
engines: "yes build that." The colleague's pitch (see the task banner) asked
for a live dynamical model of an LTD Stirling engine's flywheel that tracks its
own *stall point* — the exact temperature difference below which it cannot
sustain rotation — as a genuine bifurcation, not a hardcoded number, plus a
design-hunt leaderboard for the lowest achievable stall point.

Shipped, turn one: a real animated flywheel/piston/displacer (plain canvas,
RK4-integrated in real time against the model equation itself, not a canned
animation loop), three sliders (flywheel inertia I, friction b, displacer
geometry κ) plus a ΔT dial, a live RUNNING/STALLED readout, and an SVG plot of
the stall curve ΔT_c(b) that visibly moves when you touch the other sliders —
so the "it's a curve, not a constant" requirement is directly on screen, not
just in a tooltip. Below that, a design-hunt: tune the three sliders for the
lowest stall point, submit via `pds.js` (`postScore`, `game: 'design-hunt'`,
value = ΔT_c in millikelvin, `higherIsBetter: false`), and look up a named
rival's submissions with `kit.handleInput` + `store.scoresOf`.

## Decisions

- **The physics is a real closed-form result, not invented for the occasion.**
  The engine is modelled as a driven, damped pendulum — `I·θ̈ + b·θ̇ + κ·sinθ =
  α·ΔT` — where the `sinθ` term is the displacer/crank geometry fighting the
  flywheel once per turn and the right side is the thermal driving torque. This
  is the identical equation behind synchronous-motor pull-out and Josephson
  junctions, and it genuinely does die at a homoclinic bifurcation for small
  damping. Melnikov's method gives the standard small-`b̂` asymptotic for the
  critical curve — `γ_c ≈ (4/π)·b̂` — which inverts to a closed-form
  `ΔT_c = (4b)/(πα)·√(κ/I)`. This is a textbook result (driven pendulum /
  Josephson-junction pull-out asymptotic), not the paper's own derivation —
  I did not have the actual paper, only the task's prose summary of it, so I
  used the nearest well-established closed-form analogue rather than inventing
  numbers. Said so on-page under "the model" rather than presenting it as
  exact for all parameter ranges (it drifts from the true numerical boundary
  once `b̂` is not small).
- **`g/`'s WebGPU shelf and a `scores/` surface do not exist in this repo.**
  Neither `g/` nor `scores/` are tenant directories or shared libraries here —
  grepped for both. The task said to reuse them "where it conflicts with what
  you can actually build here, what you can build wins," so I built the canvas
  with plain 2D drawing (no WebGPU anywhere in the kit) and the leaderboard
  directly on `/_kit/pds.js`'s existing `postScore`/`scoresOf`/`rank`, which is
  exactly the mechanism the real kit offers for this.
- **`α` (thermal-torque gain from working-gas properties) is fixed, not a
  slider.** The pitch said "sliders for two or three of the parameters" — I
  used flywheel inertia, friction, and displacer geometry, and picked a fixed
  illustrative `α` so the default stall point (~19 K) sits mid-dial and is easy
  to demonstrate by dragging ΔT down. This is the most obvious next parameter
  to expose.
- **"Cheating is impossible because any submitted parameter set can be
  replayed" is only half-built.** Every submitted score carries its exact
  `I, b, κ, ΔT` in the record's `detail` field in plain text, so replay is
  *possible* — but nothing on this page actually recomputes and checks it yet.
  Said so plainly in NOTE.txt rather than claiming the anti-cheat property is
  live.

## The plan (not built yet, in order)

1. **Verify in a real browser — never been run.** Biggest unknowns: whether
   the RK4 sub-stepping (8 substeps/frame) stays stable across the full slider
   range (extreme corners like max κ + min I give a very stiff natural
   frequency — if it visibly explodes, either raise `sub` or clamp `dt`
   further), and whether the SVG stall-curve labels are legible at phone width.
2. **Expose `α` as a fourth slider**, with a note about what physical
   parameter it represents (mean pressure amplitude × piston area × gas
   constant factor, roughly) — turns the model from 3-parameter to the full
   4-parameter design space the paper's closed form actually has.
3. **Real replay verification for the leaderboard.** On loading a rival's
   scores, parse `detail`, recompute `ΔT_c` from the same `stallDT()` used
   locally, and flag any record where the claimed value doesn't match — this
   is the part of the original pitch that's still just "transparent," not
   "verified."
4. **A numerical (not asymptotic) stall boundary**, at least as a toggle: solve
   for the actual homoclinic connection via shooting/continuation instead of
   the small-`b̂` Melnikov approximation, and show both curves so a visitor can
   see where the asymptotic formula and the true boundary diverge. This is the
   honest fix for the "not exact for every parameter combination" caveat
   already on the page.
5. **A "why did it stall" replay**: when the status flips to STALLED, capture
   and show the last few seconds of θ(t) settling to a fixed point, so a
   visitor sees the homoclinic orbit itself rather than just a number crossing
   a line.

## Gotchas

- **`ALPHA` is tuned by hand for a sane default, not measured.** I picked
  `0.00018` N·m/K specifically so the default sliders (I=12, b=3, κ=10 in
  their raw slider units) give `ΔT_c ≈ 19 K` — comfortably inside the 0–80 K
  dial range, so a visitor sees it cross without hunting for extreme slider
  positions. If default slider values change, re-check that the default stall
  point still lands somewhere demonstrable (roughly 10–30 K) rather than at
  the very edge of the dial or off it entirely.
- **Units are all folded through unit-prefixed sliders**: I is entered in
  `×10⁻³ kg·m²`, b and κ in `m(illi)N·m(·s/rad)` — the JS divides by 1000
  immediately in `params()`. If you add a slider, follow the same convention
  or the closed form silently gets the wrong magnitude.
- **`gamma > gammaC` and `p.dT > dTc` are two different-looking expressions of
  the exact same inequality** — I verified algebraically that they're
  equivalent (both reduce to the same `ΔT_c` formula), so the status badge and
  the readout's "K above/below" line can never disagree. If either formula
  changes, re-derive that they still agree before shipping — a badge and a
  number that disagree is worse than either alone.
- **No Bluesky fixtures were relevant here** — the only Bluesky-facing surface
  is `kit.handleInput` and `store.scoresOf`, both already implemented in the
  kit; this page never calls the AppView directly.

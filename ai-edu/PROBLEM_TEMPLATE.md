# Problem template

The reusable unit for the AI-edu site. Every problem — beam vibration,
waveguide cutoff, lens aberration, pipe flow, heat diffusion, whatever —
gets cloned from this. The shape is the lesson; the physics swaps.

## Design contract

A problem on this site is **not** a puzzle with a hidden integer answer.
It's a prompt to stand up a working numerical solver in an afternoon for
a half-remembered physics problem, using an AI pair, and then to prove
the solver is right *via the physics itself*. The skill being grown is
**directing and auditing** a collaborator that supplies the numerical
machinery.

Five non-negotiables for every problem:

1. **Open-ended.** No single right answer. Many shapes of solver pass.
2. **Verification ladder is mandatory.** A solver without a proof of
   correctness teaches the dangerous half of the lesson. Every problem
   must include an analytical-anchor rung the operator can check by
   hand, plus a fallback (refinement convergence or conservation law)
   for the perturbed case where the closed form is gone.
3. **Hints are staged and collapsed.** The operator chooses when to
   peek. Each tier nudges harder. The full spec is never given upfront.
4. **One worked solution at the end, framed as calibration.** Not "the
   answer." "Here's how one experienced person did it." The operator's
   solver will differ in shape; that's the point. The example is for
   comparison of *approach*, not validation of *output* — validation
   comes from the physics.
5. **AI-pair posture is explicit.** The build step names the
   collaboration: the operator specifies, the AI drafts, the operator
   audits. This isn't a footnote — it's the mode being taught.

---

## Template

Sections in order. Each problem file fills these in. Don't reorder, don't
skip the ladder, don't put the worked solution above the hints.

### 1. Setup

The physics, plainly. Governing equation, geometry, boundary
conditions, the thing the operator wants to know. Prose first; equations
where they help. Aim for "I remember this from grad school" recognition,
not a textbook restatement.

End with one sentence naming the quantity of interest (the natural
frequencies; the cutoff wavelength; the pressure drop; the temperature
field at steady state).

### 2. Why this is an afternoon, not a week

Two or three sentences. Names the machinery that's about to do the
heavy lifting (FEM, FDTD, shooting method, FFT, spectral collocation,
whatever). Names what the operator's brain still has to do (pick the
discretization, set the BCs, judge convergence). This is the surprise
the site exists to deliver — don't bury it.

### 3. Build it

The open prompt. One short paragraph. Set scope explicitly — what's
**in** (1D, uniform material, small mesh, one BC family) and what's
**out** (3D, nonlinearity, coupled physics). Scope discipline is part of
the skill.

State the AI-pair posture in the prompt itself, roughly:
> Spec this out with your AI pair — governing equation, discretization
> scheme, BCs. Have it draft the solver. Your job is to specify, audit,
> and verify.

Don't prescribe the discretization. The hints will, if the operator
wants them.

### 4. Verification ladder

Non-optional. Each rung has a **pass criterion** and a one-line **what
it means if you fail.**

- **Rung 1 — analytical anchor.** Reduce to the case with a closed form
  (uniform, steady, no source, 1D, whatever collapses the problem).
  Specify the closed-form quantity and the agreement tolerance (e.g.
  match the first three eigenvalues to 0.1%). State the failure
  diagnosis ("if rung 1 fails, your assembly is wrong, not your
  numerics").
- **Rung 2 — perturbed case, partial check.** Add the feature that kills
  the closed form (taper, heterogeneity, source term, nonuniform BC).
  Closed form is gone, but a conservation law, symmetry, or limit case
  still holds. Specify which, and the tolerance.
- **Rung 3 — refinement convergence.** Halve the mesh / double the
  modes / shrink the timestep. Specify the quantity that must change by
  less than tolerance. This is the backup oracle when no analytical
  anchor survives.

If a problem genuinely has no rung 1 (rare — most physics problems have
*some* limit case), say so explicitly and lean harder on rungs 2 and 3.

### 5. Hints (collapsed, staged)

Three or four tiers, hidden by default. Operator opens them in order
when stuck. Each tier nudges harder; none give the full spec.

- **Tier 1 — frame it.** How to think about the discretization. ("This
  is a boundary-value problem in space and an eigenvalue problem in
  time — separate them.")
- **Tier 2 — pick the tool.** Name the scheme and the library to reach
  for. ("Hermite cubic elements for C¹ continuity in the curvature
  term; assemble K and M; `scipy.linalg.eigh` for the generalized
  eigenproblem.")
- **Tier 3 — the gotcha.** The one thing that silently breaks. ("Use
  the *consistent* mass matrix, not lumped — lumped underestimates
  higher modes.")
- **Tier 4 — skeleton.** A 20-line code outline, no working internals.
  Names the functions and the shape of the loop; doesn't fill them in.

### 6. Where to draw the line

One paragraph. Calls out the moment in the build where a careful
operator stops hand-rolling and reaches for a real library — and *why
hand-rolling further would teach the wrong lesson*. (Beam example: "you
can write a Jacobi eigensolver for a 4×4 demo, but the moment your mass
matrix is 200×200 you call `scipy.linalg.eigh` — knowing when to stop
reinventing LAPACK is part of the judgement we're after.")

This is judgement, not a nudge. Always shown, never collapsed.

### 7. One worked solution (collapsed)

Hidden by default. Revealed when the operator chooses. Framed:
> Here's how one experienced person did it. Your solver probably looks
> different in shape — that's expected. What to look for: how they
> handled X, the verification ladder they ran, where they stopped.

Include the code (full enough to run) and a short post-mortem: one
paragraph on what they'd do differently, one on what surprised them
about the physics result.

### 8. Going further

Two or three optional extensions, each one sentence. Adds a feature
that breaks rung 1 in a new way (tip mass, taper, anisotropy, source
term, nonlinearity). Often bridges to the next problem in the catalog.

---

## Worked illustration: the beam example, in template shape

Sketched to show how each section gets populated. Not the full file —
just enough to see the silhouette.

### 1. Setup
Euler–Bernoulli beam, length L, modulus E, area moment I, density ρ,
cross-section A. Governing equation EI·∂⁴w/∂x⁴ + ρA·∂²w/∂t² = 0. Pick
your BCs from {cantilever, simply-supported, clamped-clamped,
free-free}. **You want:** the first few natural frequencies and mode
shapes.

### 2. Why this is an afternoon
Finite-element discretization with Hermite cubic elements turns the PDE
into a generalized matrix eigenproblem K·φ = ω²·M·φ. Your brain picks
the mesh, the BCs, and whether the answer is believable; the numerics
library does the eigensolve.

### 3. Build it
Spec a uniform beam, 1D, small mesh (10–20 elements is plenty), one BC
family from the list. With your AI pair: derive element K and M
matrices, assemble, apply BCs, solve the generalized eigenproblem,
extract the first 4–6 natural frequencies and modes. Animate one mode
if you want the dopamine.

### 4. Verification ladder
- **Rung 1.** Uniform beam, your chosen BC. Compare your ω_n against
  ω_n = (β_n L)² · √(EI / ρA L⁴), where β_n L are the tabulated roots
  for that BC (e.g. 1.875, 4.694, 7.855 for cantilever). Target: first
  three modes within 0.1%. *Fail diagnosis:* if rung 1 misses, your
  assembly or BC application is wrong — your eigensolver is fine.
- **Rung 2.** Add a tip mass m at x = L. Closed form is gone for
  general m, but in the limit m → ∞ the cantilever first mode →
  spring-mass with stiffness 3EI/L³. Check that limit.
- **Rung 3.** Mesh refinement. Double N from 10 → 20 → 40. The first
  three frequencies should be stable to <0.01%.

### 5. Hints
- **Tier 1.** Two unknowns per node (deflection + slope) because the
  weak form needs C¹ continuity.
- **Tier 2.** Hermite cubics give you the right shape functions;
  `scipy.linalg.eigh(K, M)` handles the generalized problem.
- **Tier 3.** Use the *consistent* mass matrix, not lumped. Lumped is
  easier to code and noticeably wrong for higher modes.
- **Tier 4.** `assemble_K()`, `assemble_M()`, `apply_bcs(K, M, bc)`,
  `solve_eig(K, M, n_modes)`, `plot_modes()`. Five functions, ~150
  lines.

### 6. Where to draw the line
You can write a 4×4 Jacobi eigensolver as a teaching exercise — fine
for the smallest mesh, useful for understanding what the library does.
But the moment your mass matrix is 200×200, call `scipy.linalg.eigh`.
Knowing when to stop reinventing LAPACK is part of the judgement this
site is here to grow.

### 7. One worked solution
*(collapsed — full file with Hermite element derivation, assembly, BC
application, eigensolve, mode animation, plus a paragraph on why the
author switched from lumped to consistent mass halfway through)*

### 8. Going further
- Replace uniform cross-section with linear taper (kills rung 1; lean
  on rungs 2 and 3).
- Add a midspan point mass and watch the symmetry break.
- Swap to Timoshenko theory and see where it matters (short, stubby
  beams).

---

## Open questions for V2

Surface these as we author the first few problems and notice friction:

- **Format.** Static markdown / HTML / Jupyter / browser-runnable
  (Pyodide)? Decided in the architecture step, not here.
- **Collapsed sections.** UI affordance — `<details>` tags, click-to-
  reveal, or progressive scroll? Architecture step.
- **Progress tracking.** Per-operator local-only, account-backed, or
  none? Architecture step.
- **Worked-solution diversity.** Should each problem ship with one
  reference solution or several stylistically different ones (e.g. FEM
  vs. FDTD vs. spectral)? Lean toward one for now, plural later if a
  problem invites it.
- **Cross-domain hint vocabulary.** As we hit E&M and optics, the hint
  tiers will want shared scaffolding ("when to reach for FFT vs.
  shooting") — extract once we have three problems written.

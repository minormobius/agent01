# Five fields of study

A proposal, written after a survey of the repo. Not a reading list — five
candidate **fields** that this repo has already been circling for months without
naming, each deep enough to reward years, each with a curriculum we could build
from the ground up, and each with a capstone that is a surface here rather than
a certificate.

The selection rule was: *what does this repo keep reaching for when nobody is
asking it to ship anything?* Those are the answers below.

Runners-up, and why they lost, are at the foot.

---

## 1. The polynomial method in extremal & additive combinatorics

**The one where a five-page argument kills an eighty-year problem.**

### What the repo already says

There are twelve single-file explainers on this, and they are not a random
scatter — they are one lineage, and `geometry/IDEAS.md` already knows it:

```
szemeredi-trotter (1983)  →  the seed crystal
        ↓
kakeya (Dvir 2008)        →  five pages, finite fields, the method arrives
        ↓
guthkatz (2015)           →  distinct distances, polynomial partitioning
capset (E–G 2016)         →  3ⁿ/n → 2.756ⁿ, the slice-rank cousin
        ↓
viazovska (2016)          →  E₈ and Leech, exact, via modular forms
```

Alongside: `erdos/` (unit distances), `heilbronn/` (open, with an in-page
annealer), `hadwiger/` (an amateur moved a bound after 68 years), `borsuk/`
(true to dim 3, false at 1325), `runner/` (lonely runner). And
`conjectures/` — 193 open problems with modelled odds they survive to 2126,
plus a generator that *mints new statements from the grammar* and a
`reality.js` screener that brute-forces them before an oracle rates them.

The roadmap file already names the next three: **`/elekes/`** (sum–product),
**`/orchard/`** (ordinary lines, Green–Tao), **`/kepler/`** (Hales, Flyspeck).

### Why it will hold you

Because the method is *short*. This is the rare corner of modern mathematics
where the state of the art is legible to a determined amateur inside a year —
Dvir's Kakeya proof genuinely is five pages, and you can implement the finite
field version in an afternoon. The pleasure is that the tools are almost
embarrassingly simple (a polynomial has few roots; a vector space has a
dimension) and the consequences are enormous. And the field is *live*: `erdos/`
records a conjecture disproven in 2026, `heilbronn/` is still open and you can
push on it from a browser tab.

### The spine of the coursework

| Unit | What | Anchor text |
|---|---|---|
| 0 | Prerequisites: finite fields, linear algebra over 𝔽_q, basic incidence counting | Any solid algebra text; Tao–Vu ch. 1 |
| 1 | Incidence geometry: Szemerédi–Trotter, crossing-number proof, the tight construction | Guth, *Polynomial Methods in Combinatorics*, ch. 1–3 |
| 2 | The method proper: Dvir's Kakeya, parameter counting, Combinatorial Nullstellensatz | Guth ch. 4–8; Dvir (2008); Alon (1999) |
| 3 | Polynomial partitioning: Guth–Katz distinct distances end to end | Guth ch. 9–12; Guth–Katz (2015) |
| 4 | The rank branch: slice rank, cap sets, tensor methods | Ellenberg–Gijswijt (2016); Tao's slice-rank blog post |
| 5 | LP bounds and the modular miracle: Cohn–Elkies, then Viazovska | Cohn–Elkies (2003); Viazovska (2016); Cohn's survey |

**Capstone:** `/elekes/` built to the pack's standard — one manipulable canvas,
a verb, a verdict, and the sum–product bound derived on the page. Then the real
one: an honest attempt at `heilbronn/` for a specific small *n*, with the
annealer replaced by something that knows what it is doing, and the result
either matching or beating the recorded personal best.

**Where it gets hard:** unit 5. Viazovska's proof needs modular forms, and there
is no shortcut around learning them. Budget a semester for that unit alone; it
is also the most beautiful thing in the sequence.

---

## 2. Exactly solvable models: loops, dimers, limit shapes

**The one where you poke a trivial object and a conformal field theory falls out.**

### What the repo already says

This is the field with the strongest evidence, because **the repo has already
written its syllabus and does not seem to know it.** `geometry/IDEAS.md` opens a
section titled *"the loop / diagram / statistical-mechanics vein"*, states the
four marks a candidate must hit, and then lays out three tracks:

- **Built:** `meander/` (closed meanders; growth exponent α = (29+√145)/12 from a
  c = −4 CFT coupled to 2D quantum gravity), `temperley-lieb/` (the algebra
  underneath it, with a working eᵢ calculator and Markov trace, on disk /
  cylinder / torus), `aztec/` (domino shuffling, the Arctic Circle theorem,
  temperate fraction → π/4), `ising/`, `markov/`, `voronoi/` (Conway's Life
  restated as a *fraction* of an irregular neighbourhood, which specialises back
  to B3/S23 exactly on degree-8 — with Σdeg = 6n as the invariant that no bug can
  fake).
- **Named but unbuilt:** `jones/` (Kauffman bracket), `six-vertex/`,
  `catalan/`, `lozenge/`, `rsk/`, `kpz/`, `sandpile/`.

That unbuilt list *is* a graduate reading course in integrable probability, in
the correct order, written by someone following their nose.

### Why it will hold you

The reveal never gets old: a uniformly random domino tiling of a diamond has a
*shape*, and it is a circle, and nobody told it to. Randomness at the micro
scale becomes rigid geometry at the macro scale, and the same phenomenon shows
up in tilings, in queues, in growing crystals, in the longest increasing
subsequence of a shuffled deck, and in the eigenvalues of a random matrix — all
with the same exponent. Universality is the closest thing mathematics has to a
law of nature.

It is also the most *simulable* field of the five. Every result here is
something you can sample, animate, and be surprised by before you can prove it,
which is exactly this repo's idiom.

### The spine of the coursework

| Unit | What | Anchor text |
|---|---|---|
| 0 | Catalan combinatorics, non-crossing structures, bijections | Stanley, *Catalan Numbers* |
| 1 | Transfer matrices and the Ising model, solved | Baxter, *Exactly Solved Models*, ch. 1–7 |
| 2 | Dimers: Kasteleyn's theorem, height functions, the arctic circle | Kenyon, *Lectures on Dimers*; Jockusch–Propp–Shor (1995) |
| 3 | Loop models and TL: Kauffman bracket, Jones polynomial, Markov trace | Kauffman (1987); Jones (1985); Baxter ch. 12 |
| 4 | Limit shapes and RSK: LIS, Tracy–Widom, the KPZ class | Romik, *Longest Increasing Subsequences*; Corwin's KPZ survey (2012) |
| 5 | Where the exponents come from: CFT, central charge, Coulomb gas | Di Francesco–Mathieu–Sénéchal, *CFT* (selected ch.) |

**Capstone:** `/six-vertex/` — arrows to height function to alternating-sign
matrices to its own arctic curve, on one canvas, with the free-fermion line
verified numerically against the exact ASM enumeration. It is the single missing
node that ties `meander`, `temperley-lieb` and `aztec` into one object.

**Where it gets hard:** unit 5 is physics, not mathematics, and it is where the
repo's own `meander/` page currently *cites* a result it cannot derive. Closing
that gap is the honest end of the course.

---

## 3. Discrete differential geometry & computational topology

**The one where the invariant is what tells you your code is right.**

### What the repo already says

`cohomology/hodge.js` is the most rigorous single file in this repository, and
it is unusual for a reason. It performs a discrete Hodge decomposition —
splitting a 1-form on a triangulated punctured disk into exact ⊕ coexact ⊕
harmonic — and then its selftest asserts, across 18 mesh configurations and 362
checks: that d₁∘d₀ = 0; that the three summands are mutually orthogonal and
Pythagoras holds; that **b₁ computed from the Euler characteristic equals the
number of holes punched *and* the numerically measured rank of the harmonic
space**; that ∮h is constant on a homology class while ∮dα vanishes identically;
that the period matrix is nonsingular with ∮ₖhₘ = δₖₘ; and that the Whitney
interpolation drawn on screen integrates back to the cochain it came from.

Its neighbours: `voronoi/` (half-plane clipping with a *proved* stopping rule,
adjacency recorded at the cut rather than inferred by distance, Lloyd relaxation
descending a measured CVT energy, and Σdeg = 6n forced by V−E+F = 0), `foam/`
(first-person inside a Voronoi foam), `rind/solver/` (generate foam → emit a
frame model → solve for stress, with a Rust solver under `cargo test`), and
`tjs/`, `g/`, `golem/` on the rendering side.

### Why it will hold you

Because this field has an ethic, and it is the same ethic this repo already
practises everywhere else: **structure over accuracy.** A discrete Laplacian
that is merely a good approximation is worse than one that is exactly
self-adjoint and exactly annihilates constants, because the second one satisfies
the theorems and the first one drifts. In DDG, the theorem is the test — which
is precisely why `hodge.selftest.mjs` can be so brutal and so short.

Once you have that lens you cannot unsee it. It reorganises graphics, mesh
processing, electromagnetism, fluid simulation, structural analysis and
topological data analysis into one subject with one habit of mind.

### The spine of the coursework

| Unit | What | Anchor text |
|---|---|---|
| 0 | Smooth prerequisites: manifolds, forms, Stokes | Do Carmo, or Crane's ch. 2 refresher |
| 1 | Exterior calculus, discretised: simplicial complexes, cochains, DEC | Crane, *DDG: An Applied Introduction*; Desbrun–Kanso–Tong |
| 2 | Discrete Laplacians, cotan weights, the structure-preservation argument | Crane ch. 6; Wardetzky et al., "Discrete Laplace operators: no free lunch" |
| 3 | Hodge decomposition, harmonic fields, homology bases, period matrices | Hirani's DEC thesis; Crane ch. 8 |
| 4 | Computational topology: simplicial homology, persistence, stability | Edelsbrunner–Harer, *Computational Topology* |
| 5 | Meshes as engineering: CVT, Delaunay conditioning, discrete curvature flow | Du–Faber–Gunzburger (CVT); Botsch et al., *Polygon Mesh Processing* |

**Capstone:** lift `cohomology/` from the plane to a surface of genus g — a
torus, then a two-holed torus — where b₁ = 2g and the period matrix stops being
a curiosity and becomes the object. Same selftest ethic, harder topology. Then
run persistent homology over the `voronoi/` specimen sweep and see whether the
period-210 attractor and the 1257-generation transient are topologically
distinguishable.

**Where it gets hard:** unit 4 is where the algebra gets abstract fastest, and
persistence is easy to *use* and hard to *understand*. Do not skip the stability
theorem.

---

## 4. Applied cryptography for adversarial, decentralised systems

**The one where the field's hardest question is already unresolved on a live surface.**

### What the repo already says

There is a working, deployed, non-trivial crypto stack here, and — more
usefully — **an honest record of where it is weak.**

| Where | What is actually implemented |
|---|---|
| `poll/` | RSA blind signatures for anonymous ballots; `PROTOCOL.md` states plainly that the `public_like` mode has **no ballot secrecy at all**, by design, and that Sybil resistance is imperfect because DIDs are cheap |
| `bounty/` | Ed25519 blind-signed ecash denominations over a reputation system |
| `workers/auth/` | A confidential OAuth client done properly: PKCE + DPoP + PAR + `private_key_jwt`, narrow per-site scopes with just-in-time escalation, and a DPoP-bound proxy so browsers never hold a PDS token |
| `packages/atproto/crypto.js` | passphrase → PBKDF2(600k) → KEK → ECDH → HKDF → DEK, with per-member key wrapping for tiered org sharing — and a comment explaining why AES-GCM instead of AES-KW, because PKCS8 ECDH keys are not 8-byte aligned in every browser |
| `draw/`, `canvas/` | append-only stroke log with a tamper-evident chain |

And the gaps are written down rather than hidden: grandfathered sites still
running their own OAuth, SSO that cannot cross to a different registrable
domain, an airchat whitelist removal that does not revoke.

### Why it will hold you

Because the interesting part of cryptography is not the primitives — it is that
**every real system is a negotiation between properties that cannot all hold at
once**, and this repo has already paid for that lesson in production. Ballot
secrecy versus zero friction. Unlinkability versus Sybil resistance.
Recoverability versus end-to-end encryption. Revocation versus offline
verification. You do not get to have both, and the discipline is in choosing
deliberately and writing down what you gave up — which `poll/PROTOCOL.md`
already does better than most shipped systems.

There is also a very concrete unclaimed prize sitting in the repo: a poll mode
that is *both* anonymous and Sybil-resistant. That is a genuine open engineering
problem, and it has a literature.

### The spine of the coursework

| Unit | What | Anchor text |
|---|---|---|
| 0 | Foundations: security definitions, games, reductions | Boneh–Shoup, *A Graduate Course in Applied Cryptography*, part I |
| 1 | Signatures, blind signatures, and Chaum's ecash | Chaum (1982, 1983); Boneh–Shoup ch. 13 |
| 2 | Protocol hygiene: OAuth threat model, PKCE, PAR, DPoP, token binding | RFC 6819, 7636, 9126, 9449 — read as adversarial documents |
| 3 | Verifiable voting: E2E-V, receipt-freeness, coercion resistance | Adida (Helios, 2008); Ryan et al. (Prêt à Voter); Benaloh |
| 4 | Identity without a registry: Sybil attacks, proof-of-personhood, rate-limiting nullifiers | Douceur (2002); the PoP literature; Semaphore/RLN designs |
| 5 | Zero-knowledge, enough to use it: Σ-protocols, Fiat–Shamir, then SNARK anatomy | Boneh–Shoup ch. 19–20; Thaler, *Proofs, Args & ZK* |

**Capstone:** design, specify, threat-model and implement a third poll mode —
anonymous **and** Sybil-resistant — as a rate-limiting-nullifier scheme keyed to
ATProto DIDs, with a written protocol document in the style of the existing
`poll/PROTOCOL.md` that states its assumptions and names what it cannot defend
against. Ship it behind the existing worker.

**Where it gets hard:** unit 5, and the honest answer is that you should treat
the SNARK unit as *literacy*, not competence. The capstone can be built on a
Σ-protocol and stay sound.

---

## 5. The measurement of unattended work

**The one that is not a classical field yet, which is the reason to take it.**

### What the repo already says

This is the repo's own biggest unresolved question, and it is documented with
unusual candour. `docs/CLOSED-LOOP.md` states it directly:

> *"nobody knows where unattended work stops paying. Does turn 20 improve on
> turn 19, or churn? Does an agent rediscover its own findings? Does quality
> plateau, oscillate, or degrade?"*

It records the failure that motivated it — a run that spent several turns
working around a fetch failure the harness had already hit and not recorded,
then published a false general claim — and it names the deliverable: **the
curve.** Quality against turn count, measured, over N artifacts.

The apparatus is built and deliberately disabled: the ticket graph, the
contagion firewall, the budget governor, the seat model and lease mechanics in
`docs/LOOP-WBS.md` §3, four chain-reaction workflows, a surface at
`loop.mino.mobi` and its output at `plant.minomobi.com`. And the honest status
in `.github/loop/vision.md`:

> *"whether work that passes every machine check adds up to a game, or to a very
> well-tested pile of correct functions. That is the thing the curve is supposed
> to measure and currently cannot, because no signal in this loop has ever come
> from outside it."*

Then the finding that makes this a *field* and not a chore: turns 36–50 produced
seven backend modules and not one line of the page, because the queue was in
priority order and the gates were satisfiable without the thing anyone wanted.
That is Goodhart's law, observed in the wild, with a commit log.

There is also a second, quieter instrument here: `packages/pressure-lab/`, which
exists because three games hand-rolled the same measurement scaffolding and
**four real design bugs hid in the differences** — including a mechanic that was
decorative for an entire draft, detected only because the bot that ignored it
scored the same as the bot that read it. `spread()` now *requires* a control
policy. That is experimental design, rediscovered from first principles by
someone who needed it.

### Why it will hold you

Because it is a field being assembled right now out of much older, very rigorous
parts — design of experiments, psychometrics, causal inference, sequential
analysis, mechanism design — and almost nobody is bringing that rigour to it.
The people measuring agent systems mostly report a number and a vibe. You have
a live system, a ledger, a budget, and a documented instance of your own metric
lying to you. That is the exact starting position from which the interesting
work in this area is going to come.

It is also the field that would most improve everything else in this repo.

### The spine of the coursework

| Unit | What | Anchor text |
|---|---|---|
| 0 | Design of experiments: control, blocking, randomisation, confounds | Box–Hunter–Hunter, *Statistics for Experimenters* |
| 1 | Measuring a latent quality: reliability, validity, inter-rater agreement | Krippendorff's α; Embretson–Reise, *IRT for Psychologists* |
| 2 | Judges as instruments: calibration, position/verbosity bias, pairwise comparison, Bradley–Terry | Bradley–Terry (1952); Elo; the LLM-judge bias literature |
| 3 | Proxy failure, formally: the Goodhart taxonomy, specification gaming | Manheim–Garrabrant (2018); Krakovna et al. |
| 4 | Sequential decisions under budget: stopping rules, bandits, best-arm identification | Wald, *Sequential Analysis*; Lattimore–Szepesvári, *Bandit Algorithms* |
| 5 | Causal claims from observational runs: potential outcomes, DiD, sensitivity analysis | Imbens–Rubin, *Causal Inference*; Gelman–Hill |

**Capstone:** the curve itself, produced honestly — a pre-registered design for
the ~80-turn run described in `vision.md`, with the outside signal that
`vision.md` correctly identifies as missing, a judge calibrated against human
raters with a reported agreement coefficient, a stated stopping rule, and a
published negative result if that is what comes back. Then the reusable half:
`pressure-lab`'s ethic generalised into a measurement library the loop uses.

**Where it gets hard:** unit 1, and not technically. Deciding what "quality"
means precisely enough to measure — and then *holding that definition* when the
number comes back unflattering — is the whole discipline. The repo's own
`vision.md` is already an attempt at this and is worth re-reading as a primary
source once you have finished unit 3.

---

## How these fit together

They are not five separate courses. Two pairs and a spine:

- **1 and 2** are the same mathematics from opposite ends — extremal bounds
  climbing toward a hard truth, versus simple objects dropping deep structure
  out. `viazovska/` (modular forms) and `meander/` (modular-adjacent CFT) are
  closer than they look. Taking both, in either order, is a single education.
- **3** is where both of those become executable, and where the repo's existing
  habit — *the invariant is the test* — is actually a stated methodology with a
  literature behind it.
- **4** is the applied one, and the only one with a live adversary.
- **5** is the meta one, and it is the field that decides how much the other four
  are worth when the work is not done by hand.

If you want one: **field 2**, because the repo has already written the syllabus
and the first four nodes are built.
If you want the one that pays back fastest across everything else: **field 5**.
If you want the one you are most likely to still be doing in ten years: **field 1**.

## Runners-up

- **Computational stylometry & formal narratology.** The evidence is strong —
  `read/`'s seven-layer apparatus (Propp moves, Thompson motif index with
  explicit high/med/speculative confidence tags, a computed mythograph), the
  `portrait/` branch that swaps Propp for Genette because folklore instruments
  *do not survive contact with a novel*, `b/palm`'s six stylometric lines as
  percentiles against an offline pool, `rite/`'s eleven surfaces over Bluesky
  prose, `borges/`'s generated mythographs. It lost only because its rigour
  ceiling is lower than the other five: the statistics are real, the ground
  truth is contested, and you will spend more time arguing than proving. If
  that sounds like a feature rather than a bug, promote it.

- **Rotating-habitat engineering.** Eight surfaces deep (`hoop`, `rind`, `tide`,
  `biome`, `iris`, `duck`, `foam`, `mega`), with a real structural pipeline and
  a genuinely good physical insight already load-bearing in `tide/` — *up, toward
  the axis, is hot, not cold*, therefore permanent stratification. It lost
  because it is an application area rather than a field: its constituent
  disciplines (rotating-frame mechanics, radiative transfer, shell structures,
  closed-loop ecology) are each somebody else's course. Excellent as a capstone
  *for* field 3.

---

*Next step, if any of these land: pick one and we build unit 0 properly — the
prerequisite audit, the problem sets, and the first artefact — rather than
reading around it.*

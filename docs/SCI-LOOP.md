# The sci loop — one button, one instrument

A design for automating what produced `sci.mino.mobi/mri`: pick an instrument,
research it, find the demos worth building, chart the parts, author them, review,
cohere, ship.

This document exists because the MRI wing was built in about a dozen turns with
**almost no operator redirection**, and that is worth understanding before
automating it. The reason it worked is not that the agent was careful. It is that
**the literature tied its hands**, and it did so in three specific, mechanically
checkable ways. Reproduce those three constraints and the loop is safe to leave
alone; drop any one of them and it will produce confident, well-tested,
beautifully typeset nonsense.

---

## 1. What actually constrained the MRI run

Three rules did all the work. Each is checkable by a script, which is the whole
reason they can be gates.

| Constraint | Enforced by | What it prevented |
|---|---|---|
| **Every mechanism claim traces to a primary source, and the source is on the page** | `sci.selftest.mjs`: every DOI on a page must appear in the research scan | Inventing plausible physics. The agent could not write a sentence it could not cite. |
| **Every number is computed by a solver, not quoted** | the engine computes it; the page prints what the engine returns | Textbook numbers half-remembered and subtly wrong. |
| **Every solver is checked against a closed form** | `cargo test`, 52 known-answer tests | Everything below. |

That third one is not a formality. **Five substantive errors were caught by
tests during the MRI build, every one of which would otherwise have shipped:**

1. The acoustic fundamental was asserted at `1/esp`; it is a higher harmonic,
   because `d²/dt²` weights by `ω²`. The test failed and the truth was a better
   claim than the guess.
2. The white/grey contrast crossing was asserted absent at long TE. It exists at
   every TE up to ~110 ms — the failure turned one data point into a curve.
3. The image grid was half a pixel off, silently biasing every position the
   encoding module reported.
4. Accelerated EPI was charging readout time for lines it skipped, inflating its
   predicted distortion by exactly `R`.
5. Voxel volume was applied to the signal *and* implied by the reconstruction's
   own scaling — counted twice, so a law predicting 2× produced 4× in the image.

A loop without gate 3 ships all five and looks great doing it.

Two more failures are worth recording because they were caught by *different*
mechanisms, and the loop needs those too:

- **A DOI that did not resolve** (`10.1109/TMI.2011.2180730`). Caught by
  resolving every DOI through `doi.org` before it went on a page. → gate.
- **Inconsistent search summaries** for a tissue's T₂ values. Caught by reading
  the actual paper and marking the unread one `[unverified]`, unused. → gate.

And one that no gate caught, which is the honest limit of the whole idea:

- **A white flash on Firefox.** A canvas was being wiped and redrawn
  asynchronously. No test in this repo would ever have seen it; it took a human
  looking at the page. See §5.

---

## 2. The pipeline

Seven stages. Each has one job, a written artifact, and a gate that must pass
before the next stage starts. Stages 2–4 are cheap and serial; stage 5 fans out.

```
0  TARGET      choose the instrument                      → target.md
1  SURVEY      the literature scan                        → research/<x>-sources.md
2  ANGLE       find the misconception worth correcting    → angle.md
3  CHART       decompose into parts and demos             → chart.md
4  ENGINE      solvers + known-answer tests, no pages     → engine-rs/<x>.rs
5  AUTHOR      one agent per part, in parallel            → <x>/<part>/index.html
6  COHERE      series strip, capstone, cross-links, audit → the whole wing
```

### 0 · TARGET
Propose three candidate instruments; pick one. The selection criterion is the
one that made MRI work, and it should be stated in the prompt because it is not
obvious: **an instrument whose usual explanation is wrong in a way the
literature can settle.** MRI qualified because "radio waves go in, radio waves
come out" is in most textbooks and Hoult spent thirty years publishing the
correction. An instrument everybody already explains correctly has no page in it.

Secondary criteria: the physics must be computable in a browser in
milliseconds, and there must be a closed form to check the solver against.

**Gate:** three candidates, each with a named misconception and a named source
that settles it. Operator picks, or the loop picks the highest-scoring and says
why. *This is the cheapest place to put a human, and the highest-leverage.*

### 1 · SURVEY
The literature scan. Sections by subsystem, every entry annotated with *what it
gives the page*, and marked read / metadata-only.

**Gates:**
- every DOI resolves through `doi.org` (script, ~1s each)
- ≥ 8 sources, ≥ 3 read in full (open access preferred and recorded)
- every entry says what it gives the page — an entry that gives nothing is noise

### 2 · ANGLE
One page of prose: what does everyone get wrong, what is actually true, and what
is the single sentence a reader should leave with. MRI's was *"the sensor is a
coil of wire, and an MRI is a one-pixel camera."*

**Gate:** the claim is contradicted by at least one widely-repeated explanation
*and* supported by at least one source from stage 1, both quoted.

### 3 · CHART
The decomposition. For each proposed part: its one idea, its demo, the closed
form the demo will be checked against, and the sources it draws on. Plus the
capstone: what do the parts compose into?

**Gate:** every proposed demo names the closed form it will be tested against.
**A demo with no known-answer test is cut here**, not discovered to be
untestable in stage 5. This gate is the one that most protects the whole run.

### 4 · ENGINE
Rust modules and tests, **no pages**. The engine is written and green before any
HTML exists — that is the order the MRI build used and it is the right one,
because a demo whose physics does not survive testing should never get styled.

**Gates:** `cargo test` green; every public function used by a planned demo has
a test comparing it to a closed form; `--bin verify` prints the table.

### 5 · AUTHOR
One agent per part, in parallel, each with: the chart entry, the engine API, the
sources, and the house shell. They may not add physics — if a page needs
something the engine lacks, it files back to stage 4 rather than computing it in
JavaScript. That boundary is what keeps the numbers checked.

**Gates per page:** selftest (imports match exports, DOIs catalogued, sections
present, scope box present); renders in headless Chromium with no console
errors; no blank-canvas frames during a scripted drag (the Firefox bug, as a
test — see §5).

### 6 · COHERE
The pass this wing needed and did not get until it was asked for: series strip,
capstone, cross-links, landing entry, registry, and a read-through for the
things only visible across pages — repeated explanations, a part that assumes
knowledge from a part after it, four siblings that are really one instrument.

**Gates:** every page links every other and marks exactly one current; preflight;
the deployed artifact matches the committed one (byte size, not run colour).

---

## 3. Where it writes, and the boundary

The existing loop keeps `foam/` hand-authored and writes only to `plant/`
(`docs/LOOP-SPRINTS.md` §1). The same shape applies here:

- **`sci/` is hand-authored and the loop never writes to it.**
- The loop writes to **`sci-loop/<instrument>/`**, its own tree.
- Promotion into `sci/` is a human merge — the same "diff someone signed" the
  master switch already is.

This matters more than it looks. The MRI wing is now a *reference specimen*: it
is what the loop's output is compared against. If the loop can edit it, the
comparison drifts, and the first thing a loop optimising against a rubric will
do is edit the rubric.

---

## 4. The gates, collected

Everything above, as things a script decides:

| # | Gate | Stage | Script |
|---|---|---|---|
| G1 | every DOI resolves | 1 | new — `scripts/check-dois.mjs` |
| G2 | ≥ 3 sources read in full, marked | 1 | new |
| G3 | the angle quotes both a misconception and its correction | 2 | new |
| G4 | every demo names its closed form | 3 | new |
| G5 | `cargo test` green, every demo's function covered | 4 | existing |
| G6 | selftest: imports, DOIs catalogued, sections, scope box | 5 | extend `sci.selftest.mjs` |
| G7 | headless render, zero console errors | 5 | new — Playwright |
| G8 | zero blank-canvas frames on a scripted drag | 5 | new — Playwright |
| G9 | series strip complete and consistent | 6 | extend selftest |
| G10 | preflight | 6 | existing |
| G11 | live artifact matches committed artifact | 6 | new |

G7, G8 and G11 are the three the MRI run learned the hard way, and none of them
existed before it.

---

## 5. What the loop cannot check

Being straight about this is the difference between a system that can be left
alone and one that only appears to be.

**It cannot see the page.** The Firefox flash was invisible to every gate above
and was reported by a human. G8 exists now *because* a person looked — a gate
written after the fact for a class of bug already found. The next rendering bug
will be a different class and G9 will not exist yet either.

**It cannot judge charisma.** Whether "an MRI is a one-pixel camera" lands, or
whether the k-space paintbrush is fun, is not a property any script reads.
`.github/loop/vision.md` already names this as the loop programme's open
question: *whether work that passes every machine check adds up to something a
stranger would want.* Nothing here answers it.

**It cannot know what is interesting.** The best moments in the MRI build came
from tests failing in instructive ways. A loop will reproduce that only if its
prompts reward *investigating* a failed assertion instead of relaxing it — which
is a prompt-design problem, not a gate.

So: one designed human checkpoint at **stage 0** (which instrument, ~2 minutes)
and one at **stage 6** (read it, does it sing, ~15 minutes). Everything between
can run unattended. That is a real one-button shot with two short interruptions,
which is honest, where "fully autonomous" would not be.

---

## 6. Cost

The MRI wing took roughly a dozen heavy turns. As a fan-out loop: stages 0–3 are
~6 agent invocations, stage 4 is ~8 with test iteration, stage 5 is ~4 in
parallel plus revisions, stage 6 ~4. Call it **25–40 invocations** for a
four-part instrument, dominated by stage 4, where the tests fail and get fixed
several times — which is exactly where the money should go.

Cheaper knobs, in the order I would reach for them: fewer parts (three, not
four); one demo per part; and let stage 5 draft in parallel but review serially.

---

## 7. How it plugs in

Two options, and I recommend the second.

**A. Reuse the existing loop machinery.** `loop-tick` → `loop-plan` → `loop-work`
→ `loop-review` → `loop-judge`, with the beads ledger and the contagion
firewall. Correct in principle, and it inherits real governance. But that loop is
built around a *game* with a different ledger shape, its config targets `plant/`,
and the sci pipeline is more linear than reactive — seven ordered stages with
hard gates, not a queue of tickets. Bending one into the other risks damaging a
system that is already carefully built and currently disabled.

**B. A `Workflow` script, run on demand.** The pipeline is a straight-line
fan-out with a barrier before stage 5 and another before stage 6 — exactly the
shape the `Workflow` tool exists for. It is one file, it runs when a human asks,
it cannot wake anything, and it needs no master switch because it has no chain
reaction. Stage 0 and stage 6 hand back to the operator by design.

B is smaller, matches the actual control flow, and keeps `.github/loop/` alone.
If a sci loop later wants to run on a schedule and react to its own output, it
can graduate to A having already proved its gates.

**Either way, the master switch discipline stands:** nothing about this should
turn itself on, and `loop-blast-radius.mjs --check` must still pass.

---

## 8. What I need from the operator

1. **A or B** — reuse `.github/loop/`, or a standalone `Workflow` script.
2. **The next instrument**, or leave stage 0 to propose three. My own shortlist,
   by the misconception criterion: the **electron microscope** (everyone says
   "electrons are smaller than light"; the real story is numerical aperture and
   aberration correction), the **atomic clock** (it does not "count" anything —
   it disciplines an oscillator against a resonance), and the **mass
   spectrometer** (the detector is the interesting part again, and the usual
   diagram is a lie about how ions actually get sorted).
3. **How many parts** is the default. Four worked; three would be cheaper and
   probably tighter.

Once those are settled the pipeline is a day's build, and most of it is the
gates rather than the agents.

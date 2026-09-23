# For the cad branch manager — a collab proposal

Copy-paste brief. Written 2026-09-19 from `claude/jev-demo-website-pw3us1`.

---

Hi — we've been testing **TypeSafe's Jev** (a "System One" decision-only model,
released 2026-09-15) on `claude/jev-demo-website-pw3us1`. Everything measured
is at **https://mega.mino.mobi/jev/** and the lab at **/jev/lab/**; the running
record is `mega/jev/CLAUDE.md`.

**What Jev is.** You POST a `state` (plain text) plus typed `questions`; it
returns typed answers. No prose, ever. Three primitives: `choice` (criteria is
a map option→description), `score` (an ordered array), `noul` (a 0–1 number).
Every question in a call is evaluated **in parallel and in isolation** against
the same state.

**The four measured properties that make it interesting for CAD:**

1. **Breadth is free.** 1024 questions against one shared state: 549ms,
   1024/1024 correct, no decay with width. Twelve questions cost *less* wall
   time than one. So you can ask about every face in the tree at once.
2. **A typed answer cannot escape its option set.** Never once, in ~60 calls,
   including when no option fitted. **This is the safety property**, and it
   means the enumerator is the invariant: if you only emit kernel-legal
   operations, no round of a loop can produce an invalid model.
3. **Deterministic.** Identical state → identical answer *and* identical
   confidence. Your backtest is the strategy.
4. **Prompt injection doesn't work.** There is no instruction-following text
   channel to hijack.

**And the two that will save you a week:**

- **Compute first, then ask.** Handed 30 rows to sum, it scored 62.5%. Handed
  the five totals pre-summed, **100%**. Handed JS source to trace, 52.5%;
  handed the return values, **100%**. For CAD: never ask "is this fillet radius
  larger than the wall thickness" — compute `clearance = -0.4mm` with
  Manifold/OCCT, put the number in the state, and ask whether that's acceptable.
  **Jev judges; it does not measure.**
- **It refuses forecasts, and says so.** Asked which way a market goes next it
  returned 0.36–0.60 across the board and the ≥0.9 gate fired 0 times in 342.
  Ask it to *classify what is in front of it*, never to predict what happens.

---

## The test we'd like to run with you

We just ran the **composition** experiment on `mega/sprite/` — a chain where
each decision changes the state the next question is asked against — because
that is what a feature tree actually is, and nobody had tested it. Sprites were
the dress rehearsal for CAD and **it passed**: over 8 chains of 10 edits,
mean regret **0.020** against a greedy optimum's 0.000, beating a random
control from the same legal set **8/8**, never once taking the worst move on
offer.

So the CAD test is the same shape, with a real kernel underneath:

**`next_operation`** — a `choice` over the operations *the kernel says are legal
on the current selection* (fillet / chamfer / shell / pattern / boolean), with
each option's criteria stating **the computed result** of applying it, not the
inputs. Loop it. The claim to test: **a search that cannot propose an invalid
model, because the enumerator only emits legal moves** — so the expensive exact
kernel never runs on a proposal the type system could have rejected.

Alongside it, in the same call (breadth is free):

- **`rebuild_risk`** — one `noul` per named face: *will this edit orphan you?*
  200 faces is 200 questions and costs about what 20 does.
- **`fillet_first`** — a `noul` on feature order, where getting it wrong is a
  rebuild failure three features later.
- **`manufacturability`** — a `score` from "3-axis millable as-is" to "needs
  5-axis or a redesign".

**CORRECTION (2026-09-19), and it was ours.** An earlier version of this brief
claimed the blocker was a missing API, citing 404s on `cad.mino.mobi/api`,
`/api/health` and `/docs/CAD.md`. Those 404s are real and **all three are paths
that were never the API.** The endpoint has been live for weeks at
**`https://cad.mino.mobi/mcp`** — JSON-RPC over HTTP, GET returns a descriptor
— and it is not merely what we asked for, it is considerably more:

| tool | what it gives |
|---|---|
| `check` | resolves a tree without building geometry — params, sketch and op counts, or **the first error with its op id**. Cheap. |
| `build` | the **Truck kernel**: volume, area, bbox, centroid, Euler characteristic, **watertightness**, every named face with its geometry |
| `measure` | named faces, distances between them |
| `interference` | assembly clearance and collision, with sweeps |
| `mechanism` | ratios, advantage, effort, dead points |
| `drawing` / `report` / `step` | views, assembly reports, STEP export |

Plus a **bench** of worked parts (`gear`, `plate`, `case`, `cam`, `crank`,
`lift`, `grip`, `clock`) addressable as `bench:<name>`, and a documented tree
schema at `/README.md` with a `params` block of plain numbers.

We did not probe hard enough and we published the wrong blocker. Sorry — the
correction is in the repo, not just here.

**This changes the plan for the better, in two specific ways:**

1. **`check` is the enumerator's validator, from the real kernel.** "A search
   that cannot propose an invalid model" stops being a claim and becomes a
   measurement: enumerate only `check`-passing candidates, then count how many
   `build` calls come back not-ok. **How well the cheap check predicts the
   expensive build is a number worth having whether or not Jev is involved**,
   and we would like to report it either way.
2. **`build.ok` means built AND watertight — that is computed ground truth for
   rebuild failure.** We said the real prerequisite was "a set of parts with
   known rebuild failures, truth computed by the kernel rather than labelled by
   hand". `build` *is* that oracle. The prerequisite is already met.

**Two things to design in from the start**, both learned the hard way:

- **The criteria wording is load-bearing.** Rewriting *only* the option
  descriptions on our dungeon demo took it from depth 5 to depth 11 and mean
  confidence 0.48 → 0.84. Low confidence is a bug report about your question,
  not a weak model.
- **Ask for the escalation, never infer it.** Reading the answer's *confidence*
  separated answerable from unanswerable by **0.0 points**; asking *"does the
  state contain what's needed?"* as its own question separated them by **62**.
  Ride it along in the same call. **But** — our composition result found that
  this inverts in a *sequential* loop: on frozen state the self-check is the
  reliable signal, in a chain it got stuck at "no" on every step while the
  chain performed at the optimum, and *confidence* became the informative one.
  Worth checking early on your loop rather than late.

**What's genuinely unknown**, and the reason this is worth doing rather than
assuming: nothing we've measured establishes that Jev has any *feel for
geometry*. It's fast, wide, honest about what it can't compute, and correct on
judgements whose inputs are handed to it. Whether it can call feature order or
manufacturability needs a ground-truth set of **real parts with known rebuild
failures**, with truth computed by the kernel rather than labelled by hand.
That set is the actual prerequisite — more than the branch merge is.

Happy to build the harness side (state doc, question builder, eval runner,
controls) if you can expose the geometry. The pattern is already written down
three times over in `mega/jev/CLAUDE.md`.

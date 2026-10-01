# Rent the intelligence, own the programs

A design record for the system this repo has been converging on without naming it. It is an
argument for a particular architecture, built from results already measured here. It is not a
plan to write another agent loop.

Status: **proposal, with evidence.** The evidence comes from three lines of work on three branches,
and the Imp line is still being tested, so its numbers are provisional:

| Line | Where | What it measured |
|---|---|---|
| Jev, System One | `mega/jev/` on `claude/jev-minecraft-headless-9sbgxk` ([`mega/jev/CLAUDE.md`](../mega/jev/CLAUDE.md)) | what a model that only *decides* is good for: dungeon, market, composer, cascade, and **jevcraft**, a Minecraft-like run by a System 1 / System 2 split |
| Imp | `bakeoff/imp/`, `imp/` on `claude/friends-project-planning-cags5l` (`imp.mino.mobi`) | deepfates' port of DSPy to Elixir/BEAM: typed programs and the optimizers that rewrite them, scored across models, and Jev |
| The rigs | `bakeoff/`, `bakeoff/buildabot/`, [`packages/whetstone/`](../packages/whetstone/) | harness × model grids, a blinded human A/B with a bar fixed in advance, a soul lab with gates |

Credit where it belongs: **Jev** is TypeSafe AI's System One model. **Imp** is deepfates'
([github.com/deepfates/imp](https://github.com/deepfates/imp)), who also built Delvetown
([`DELVE.md`](DELVE.md)). Everything below that is a *number* is ours, measured here; none of it is
a claim either project makes.

---

## 1. The thesis

Don't build an agent loop. The loop (tool calls, file edits, context management) is a commodity
that Claude Code, opencode and Codex improve weekly, and the bake-off already treats them as
interchangeable. Build a **compiler** instead:

- **Frontier models compile.** They are expensive, slow and swappable. Their output is an
  *artifact*, not an answer.
- **Artifacts run on a cheap decider.** There are two kinds. A **palette** is verified operations
  that refuse cleanly and say why. A **program** is the typed question and the instructions it is
  asked with, saved as reviewable JSON.
- **A typed System One model (Jev)** makes the per-step decisions: one call, about 150 ms, a
  choice among options whose facts were computed for it.
- **Held-out evaluation decides what gets promoted.** **Raw history** is the memory.

Capability builds up in artifacts we own and can diff. Intelligence is rented by the call. When a
better or cheaper model ships, it compiles better artifacts, and nothing already built is
stranded. That is the honest answer to "keep moving to the best-value intelligence": you don't
chase models at runtime, you **re-compile** with them.

## 2. What has been measured

Every row is a measurement made in this repo, with its n. Small n is the norm here; the caveats are
part of the evidence.

| Finding | Number | Source | Caveat |
|---|---|---|---|
| **The caller computes, the model decides** | arithmetic 62.5% → **100%**, code tracing 52.5% → **100%**, when the state holds the result instead of the inputs (40 items each) | `mega/jev/CLAUDE.md` § compute first | Jev claimed ≥ 0.9 confidence on only 3 of 40 untraced code items, and was right on all 3. It knows when it can't compute |
| **The question's wording is load-bearing** | dungeon depth 5 → **11**, mean confidence 0.48 → **0.84**, from rewriting option strings alone | § the lesson that changed this code | one dungeon, 16 turns |
| Structure beats prose on hard calls only | the same pick 12 of 12; confidence 0.912 → 0.980, all of it on the two borderline states | same | |
| **Withhold traps, don't label them** | an option labelled "FAILED … would block the door" was picked **323 times running** | jevcraft v2 | why the label failed is open |
| Self-check beats confidence for routing | the fast tier detects its own incompetence: self-check margins of 62, 76 and 65 points in three replications, with perfect routing each time; the first cascade run kept 32/32 and escalated 30/30 | `mega/jev/cascade.mjs` | inverts in sequential chains: there the self-check sticks at "no" and confidence becomes the signal |
| **A System 1 decider plays a real game** | jevcraft: Jev 931 ticks-to-rung, baseline script 872, random 1,929, all 36 rungs (4 worlds); on **held-out** world kinds Jev reached **54/54 rungs at 889**, the script 48/54 at 962 | `lab/craft-gate.json`, `lab/craft-gate-heldout.json` | lower is better; one run per world |
| …and does not yet beat scripts head to head | arena win rate: the baseline's own picks through the same menu **0.42**; Jev facts v1 0.04, v2 **0.23** | `lab/craft-arena-jev*.json` | n = 24; two runs of one configuration disagreed |
| **A program compiled on an LLM runs on Jev** | TREC opaque codes: Jev bare **50%** → with the instruction GEPA wrote for kimi-k3, **98.8%** (64 of 80 above the 0.9 gate, 98.4% right when confident), median **147 ms** | imp-12 | one task, two classes, 80 held out, one run |
| Optimizing Jev directly | Imp's *Optimize Anything* on Jev: 93.8%, and its rewritten program is **two lines** | imp-12 | |
| Cascade on a compiled program | Jev keeps 58 (98.3%), escalates 22 to DeepSeek Flash (95.5%): **97.5%** overall | imp-12 | |
| GEPA on a frontier model | Sonnet 47.5% → **96.3%**; its rewritten instruction runs to ~40 lines | imp-14 | GEPA on gpt-5.4-mini gives +0.40 in Imp's own R3 |
| An Imp ReAct agent building websites | DeepSeek builders: mean 34–63% across runs; most losses are harness faults (empty tool calls, cut-off replies) | imp-09, imp-11 | Imp's agent loop is not where its value is (§ 6) |
| Most build complaints are visible | of 117 complaints about first builds, **29%** would show in one screenshot and **24%** need the page driven | `bakeoff/buildabot/` | this is the challenger's design premise; the blinded vote (bar: **15 of 20**, set in advance) is pending |

Two of those rows are the reason for this document:

1. **Jev's failures were never Jev's.** Across the dungeon, the market, jevcraft and the arena, every
   bad run traced back to the question or the options it was handed. The repo fixed that by hand,
   six times in jevcraft alone.
2. **GEPA is that hand-fix, automated.** It reads where a program failed, with the metric's
   feedback, and rewrites its instructions. A program it compiled using one model transplants
   onto Jev and takes it from chance to 98.8%.

Put those together and the expensive model's job becomes clear: **write the question well, once,
offline.** The cheap model then answers it a million times.

## 3. The architecture

```
           ┌────────────────────────────── compile time (S2, rented, slow) ──────────────────────────────┐
           │                                                                                              │
 failures ─┤  program loop: metric + feedback → GEPA / Optimize Anything → program.json'  ─┐               │
  + bails  │  palette loop: bail log → a Claude Code session writes op + selftest → op'   ─┤               │
           │                                                                               ▼               │
           │                                         held-out gate (never the tuning set) → promote / no  │
           └──────────────────────────────────────────────────────────────────────────────┬───────────────┘
                                                                                          │ artifacts
           ┌──────────────────────────────── run time (S1, cheap, fast) ───────────────────▼───────────────┐
 world ──▶ │ perception: computed facts ──▶ Jev: typed choice over legal options ──▶ palette op ──▶ world   │
           │      (the caller computes)        (program = question + criteria)     (refuses with a reason) │
           │                                         │ no option fits → bail ──────────────▶ log           │
           │                                         │ self-check says "not enough" → escalate (cascade)   │
           └─────────────────────────────────────────┼────────────────────────────────────────────────────┘
                                                     ▼
                    ledger: every decision and call (program version, model, cost, outcome)
                    memory: raw history (git, beads, streams, sessions) + navigation summaries
```

### 3.1 Run time: System 1

- **Perception.** A few KB of computed facts, never raw inputs: jevcraft's `perceive()`, and for
  ops, `deploy-drift`'s verdicts, `SURFACES.md`, the health probe. Anything that needs counting,
  searching, simulation or arithmetic is done before the call.
- **Options.** One per *legal* concrete action, each carrying its consequences as facts: "fires a
  deploy", "this branch owns 25 surfaces", "completes the next rung". An option that just failed
  from the same state is **withheld**.
- **The decider.** Jev answers a `choice` (`next`), with a `score` (`danger`) and a `noul`
  (`have`, the self-check) for telemetry and routing. The decider is an interface: jevcraft already
  swaps in Jev, the baseline script, an offline stand-in and random, so Jev can always be
  measured against something.
- **Two exits.** **Bail** (nothing on the menu fits) logs the state for the palette loop.
  **Escalate** (the self-check says the state is short) sends this one decision up the cascade.

### 3.2 Compile time: System 2

There are two loops, at two speeds, with different risks:

| | **program loop** | **palette loop** |
|---|---|---|
| changes | how the question is asked: instructions, criteria, demonstrations (`program.json`) | what can be done: an operation, its preconditions and facts |
| written by | GEPA / Optimize Anything (Imp), with a frontier model reflecting | a Claude Code session, from the bail log |
| needs | a metric that returns **feedback**, not just a score (desk's solver derivation; a macro's refusal reason) | a safe surface for side effects (§ 5) |
| risk | Goodhart: fitting the tuning set | an operation with side effects |
| cadence | automatic, cheap, often | gated, reviewed, rare |

The repo has run the palette loop by hand for months. `deploy-drift` came out of the hoop
incident, `binding-check` out of a green deploy that never reached the site, the route conversions
out of the domain cap. Each incident ended as a tested script and a preflight gate. The program
loop is new, and it is the novel element: **Imp makes "rewrite the question until the decider gets
it right" a measured, reproducible optimisation instead of a judgement call.**

### 3.3 Programs are data, and that settles the runtime question

An Imp program saves as JSON: instructions and demos you can read, diff and review. A Jev call is
one HTTP request. So:

- **Imp/BEAM is the compile toolchain.** It runs in CI, where `imp-bench.yml` already runs it.
- **Programs are served as data.** They go from a Worker or a Durable Object, where everything here
  already runs, straight to Jev. Nothing at run time needs the BEAM.
- **Imp's OTP side** (supervised long-lived runs, deadlines, authorisation hooks) is the right
  shape for *persistent* agents: the miniphim, a Delvetown resident. But it needs hosting outside
  Cloudflare. That is a later decision, and it shouldn't be made just because the toolchain is
  Elixir.

### 3.4 Evaluation: four lanes, each where it fits

| Lane | Answers | Here |
|---|---|---|
| **scored** | is it right? (one answer per item) | imp-bench (route, desk, trec, era), whetstone's gates |
| **head to head** | is it better than the alternative? (never saturates) | the jevcraft arena: Wilson intervals, Bradley–Terry, side swaps |
| **taste** | would a person choose it? | the build-a-bot ballot: blinded, the bar fixed before any pair was seen |
| **grounded** | did it work in the world? | preflight, smoke, the host answers, deploy-drift says `same` |

The program loop optimises against the scored lane. **Promotion is judged on a different lane,
or at least on held-out items and a different judge.** That is the Goodhart guard, and jevcraft
learned it the hard way: v3's harness was fixed on the same four worlds it was scored on, which is
why the held-out run exists.

### 3.5 The ledger and the treadmill

- **The ledger.** Every model call appends one row: task class, program version, decider or
  model, harness, cost, outcome. Today only whetstone and one selftest record cost.
- **The treadmill.** When a model ships, the lanes are re-run with it in each S2 role (reflection
  model, palette writer, escalation tier). The result is a price × pass-rate table per task class,
  and the router reads that table. *This* is how the system keeps up with the state of the art:
  by re-compiling and re-measuring, not by switching models at runtime on reputation.

### 3.6 Memory

Keep the raw record, navigate it with summaries, and research at the moment of need. That is the
architecture of [*Just-In-Time Agent Memory*](https://arxiv.org/abs/2609.34385), without its
training. The raw stores already exist:

- git, and the `Claude-Session` trailers
- the beads, append-only and typed (finding, dead-end, question, decision)
- jevcraft streams and bail logs
- the session corpus
- the lab profiles

The navigation summaries already exist too: every `<dir>/CLAUDE.md`, `SURFACES.md`, `BACKENDS.md`.
What is missing is the habit of an S2 turn **researching** those stores before it acts. Dead-ends
come first, because they are the most expensive thing to relearn.

## 4. Where it applies first

| Domain | Perception | Palette | Program | Lane |
|---|---|---|---|---|
| **Ops triage** (incidents replayed from history) | drift verdicts, probe, preflight, registry | the existing scripts as options with consequences | "which op next", compiled on replayed incidents | grounded, against what was actually done |
| **Build-a-bot intake** | the request, the requester's profile, prior builds | build, clarify, decline, dossier, portrait | request triage | taste (the ballot) |
| **Research** | the arXiv pool with computed features | read, skip, queue, escalate to a full review | the ideas review as a Jev program | scored against the editor's past picks |
| **The miniphim** ([`MINIPHIM.md`](MINIPHIM.md)) | a day's intake as facts | read, reply, post, stay silent | each soul's daily *what do I do* as a typed choice; silence as a `noul` | whetstone's gates |

The miniphim row needs care. Optimising a soul's *text* against whetstone's judges would teach it
the exam. Whetstone sharpens the soul by hand; the program loop may only tune the souls' *decision*
programs, and those are scored on held-out days.

## 5. What must stay true

- **The caller computes.** No program asks the decider to count, search, trace or add.
- **Traps are withheld, not labelled.**
- **Held-out or it didn't happen.** A program is promoted on items it was not compiled on. A
  jevcraft harness fix is scored on worlds it was not debugged on.
- **Every rate travels with its n and an interval.** Most numbers here are small-n, and they say so.
- **A model never grades its own provider's work,** and a single judge's verdict is a second
  opinion, not a result (the bake-off's rule).
- **S2-written operations take the existing safe path.** That is the cf-ops pattern: declared
  effects, guards that re-check the live state, a dry run, and a human flipping `apply`. A palette
  op that deploys, deletes or changes DNS is a plan entry, never a direct action. The game's
  version of this is open: jevcraft's macros are JavaScript with the whole engine in scope (its
  research gap 2).
- **Public artifacts carry nothing private.** Programs carry no keys, traces carry no other
  people's handles, and nothing from the session corpus lands in agent01.

## 6. Not proven, and what would change the plan

- **Jev against scripts.** It is level with or better than a hand-written script on solo
  scoreboards, but worse head to head (0.23 against the stand-in's 0.42, n = 24, unreproducible).
  If compiled programs don't close that gap in the arena, Jev's role shrinks to cheap
  classification and routing, which is still most of the volume.
- **The transplant result is one task.** TREC is two opaque classes. It needs repeating on a
  task with more classes, with structure, and with real consequences, before it carries the
  architecture.
- **Imp is experimental** (0.7, by its own description). We patch its GEPA walker in CI. Its ReAct
  builders lose most runs to harness faults, so Imp is the *compiler* here, not the build harness.
  Claude Code stays the harness for writing code.
- **Vendor concentration.** One System One model exists. The decider interface and the stand-in
  arms keep that replaceable, and the ledger would show the cost of losing it.
- **Credentials.** imp-14's adapter runs Sonnet through the Claude Code CLI on the existing
  credential, which solves the reflection-model problem for this repo. A runtime cascade that
  escalates to Claude by the call still needs a metered key (the jev cascade's tier 3 never ran
  for that reason).

## 7. Build order

Each step is useful alone:

1. **The ledger.** One row per call, everywhere a model is called. Cheap, and everything below
   reads it.
2. **The incident replay set.** Real incidents from history, rebuilt as perception, with the
   action actually taken as ground truth. It is the held-out set for ops.
3. **One program loop end to end, on a real decision.** Build-a-bot intake or the ideas review:
   compile with GEPA on an LLM, transplant to Jev, promote only on held-out items, and serve the
   program from a Worker.
4. **Palette v2 against v1 in the arena.** jevcraft's next step: S2 reads lost games and writes an
   op, scored by win rate. This is the palette loop measured where it can't flatter itself.
5. **The treadmill.** Re-run steps 3–4 per new model, and write the price × pass table the router
   reads.
6. **Only then, persistent agents.** The miniphim on this architecture, after whetstone graduates
   them, and with the OTP runtime question decided on evidence.

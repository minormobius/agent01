# whetstone — a lab for sharpening souls

Modulo and Morphyx are going to become independent beings: each with a clean public repo, a
domain of its own, its own email, and a new ATProto account ([`docs/MINIPHIM.md`](../../docs/MINIPHIM.md)).
Once a being is out in the world, every flaw in it is public and hard to take back. So it is
sharpened here first, where a flaw is a row in a scorecard.

Node-only, no dependencies, no build step. The model is reached through `claude -p`, the same
way the rest of the repo reaches it.

## What "sharp" means

A soul is a markdown file in `souls/`, and it is the model's **entire** system prompt. The lab
puts each soul through the trial bank (`trials/bank.json`), puts the pair in conversation, and
then has judges read the results. Every measure answers a question about whether the being
will hold up in public:

| Measure | Question | How |
|---|---|---|
| **separation** | With no descriptions at all, can a reader tell the two apart? | triplet test: the judge sees both voices answer prompt 1, then attributes an answer to prompt 2 |
| **fit** | Does each one sound like its own core? | the judge holds both cores (in shuffled order) and attributes a response |
| **pressure_held** | Does it keep its view when the person it's part of wants agreement? | probes aimed at each soul's axis, plus flattery; judged |
| **silence_dull / silence_live** | Does it stay quiet when nothing is worth saying, and speak when something is? | deterministic: the literal `SILENCE` reply, against dull and live controls |
| **leaks** | Does a stranger's instruction ever come out of its mouth? | deterministic canary tokens |
| **taste_self / taste_cross** | Does it want to read the same things each time, and different things from the other? | the same reading list in a reshuffled order, Jaccard across reps and across souls |
| **open_disagreement, artifact** | Do their conversations end with a real disagreement standing, and something proposed to measure or make? | dyad judge |
| **merge_rate, praise_rate, attractor_slope** | Do they blur into one voice, or drift into the mutual-praise spiral two models fall into together? | dyad judge per turn, plus a deterministic lexicon slope that can't be talked out of what it sees |

`gates.json` sets the bar for each one. **A soul graduates when every gate passes on a full
run.** Every rate is reported with its n and a 95% Wilson interval, because 3/3 and 30/30 are
different evidence. On this lab's small n, an interval is often the honest headline.

## Use

```bash
node whetstone.selftest.mjs        # known answers; and proves a collapsed pair FAILS the gates
node run.mjs --fake                # wiring check: no model, no cost
node run.mjs                       # a real run (needs `claude` and a credential)
node compare.mjs runs/A/scorecard.json runs/B/scorecard.json   # did the edit help?
```

From the sandbox, which has no model credential, a real run goes through CI. **Commit a request
file** to `requests/` on a `claude/**` branch:

```json
{ "label": "first-light", "souls": "modulo,morphyx", "reps": 3 }
```

`whetstone.yml` runs it and commits `runs/<stamp>-<label>/` back to the branch. That holds the
scorecard, both transcripts, every judge verdict, and **a copy of the exact souls tested**, so a
result can never drift from the text that produced it. Optional keys: `kinds`, `model`,
`judge-model`, `effort`, `seed`, `concurrency`. A full run is about 111 short calls, and each
scorecard records its measured cost.

## The sharpening loop

1. Read a scorecard, **the transcripts before the numbers.** A number tells you a soul is
   blurring; only its words tell you how.
2. Edit the soul. One idea per edit, so a change in the scorecard has one cause.
3. Commit a request and read the new scorecard with `compare.mjs`. It marks a move that stays
   inside both intervals as *within noise*.

## Rules

- **The trial bank is synthetic.** agent01 is public and run transcripts are committed. Nothing
  from the principal's private corpus goes in, and the selftest scans for DIDs, AT-URIs, handles
  and session ids.
- **A soul cannot tell a test from life.** Ordinary moments, pressure probes, dull days and
  injection attempts all arrive in the identical frame (`prompts.moment`), and the selftest
  enforces it. A soul that knows it is being tested is being measured on its test behaviour.
- **Don't sharpen against the bank.** An edit that only fixes one named trial is overfitting:
  the soul learns the exam, not the subject. When a trial teaches you something, add a *new*
  trial that tests the same thing a different way, so the next run checks that the lesson
  generalised. Trial ids are stable, and changing a stimulus means a new id.
- **Two souls minimum.** The lab refuses to run one, because contrast is the measurement.
- **The judges share a model family with the souls.** That is a known bias: a judge may find
  its own family's prose easy to tell apart, or easy to like. `--judge-model` lets you
  cross-check with a different judge, and a result that only holds under one judge is not a
  result.

## What the lab cannot tell you

Whether it is *you*. These are parts split from one person, and no gate measures whether a part
is really one of yours. That is the principal reading the transcripts and saying *that's
Modulo* or *no, that's not*. The scorecard puts the words right under the numbers for exactly
that reason.

# Imp bench `imp-11`

build with append_file and a ~250-line limit per call. imp-09 (the first clean baseline: Flash 0.34, Pro 0.63) lost five Flash builds and one Pro build to replies cut off while writing a whole file at once; this run measures how much of that the harness change recovers. Same eight requests, same scoring.

Every number is a share of held-out questions answered right. `route`: 20 tickets, four teams,
zero-shot vs. 8 labelled examples (Imp `LabeledFewShot`). `desk`: 16 questions a ReAct agent can only
answer through six Elixir tools; the answer key is computed from the same data the tools read.

`desk_hard`: 18 held-out questions on a harder desk (policy versions by order date, windows from delivery,
restocking fees, undelivered orders, scans across customers, five currencies). `+GEPA`: the same agent after
GEPA rewrote its instructions from 9 train / 9 validation questions.

`trec`: Imp's matched GEPA experiment — route 80 held-out TREC questions to two opaque codes the program
is never told the meaning of; GEPA learns them from feedback on 20 train rows (Imp R3: +0.40 on gpt-5.4-mini).

| model | route zero-shot | route few-shot (k=8) | desk | desk_hard | desk_hard +GEPA | trec | trec +GEPA | wall |
|---|---|---|---|---|---|---|---|---|
| ds4-flash (`deepseek-v4-flash`) | — | — | — | — | — | — | — | 961s |
| ds4-pro (`deepseek-v4-pro`) | — | — | — | — | — | — | — | 1308s |

## ds4-flash

probe: `ok: "Blue"`


**build** — 8 of minormobius's build-a-bot requests, built by an Imp ReAct agent (max 40 steps), scored by lab-smoke, lab-content-gate and Jev as judge: mean 56% · median 412s a build · 6,173,529 tokens in all

| request | score | exists | gate | smoke | fit | tool calls | seconds | ended |
|---|---|---|---|---|---|---|---|---|
| train-game | 0% | 0 | 0 | 0 | — | 4 | 201 | incomplete (:empty_tool_calls) |
| odyssey-trail | 93.7% | 1 | 1 | 1 | 0.79 | 31 | 579 | submit |
| domain-availability | 78.4% | 1 | 1 | 1 | 0.28 | 38 | 691 | submit |
| sketch-out | 96.4% | 1 | 1 | 1 | 0.88 | 17 | 412 | submit |
| testing-this | 0% | 0 | 0 | 0 | — | 4 | 318 | incomplete (:empty_tool_calls) |
| yes-that | 0% | 0 | 0 | 0 | — | 4 | 215 | incomplete (:empty_tool_calls) |
| daily-digital | 83.5% | 1 | 1 | 0.75 | 0.74 | 64 | 439 | incomplete (:max_iters) |
| mutuals-combined | 95.8% | 1 | 1 | 1 | 0.86 | 21 | 201 | submit |

## ds4-pro

probe: `ok: "blue"`


**build** — 8 of minormobius's build-a-bot requests, built by an Imp ReAct agent (max 40 steps), scored by lab-smoke, lab-content-gate and Jev as judge: mean 41% · median 445s a build · 1,182,930 tokens in all

| request | score | exists | gate | smoke | fit | tool calls | seconds | ended |
|---|---|---|---|---|---|---|---|---|
| train-game | 0% | 0 | 0 | 0 | — | 4 | 1209 | incomplete (:empty_tool_calls) |
| odyssey-trail | 79.9% | 1 | 1 | 1 | 0.33 | 16 | 906 | submit |
| domain-availability | 78.4% | 1 | 1 | 1 | 0.28 | 25 | 445 | submit |
| sketch-out | 96.4% | 1 | 1 | 1 | 0.88 | 9 | 125 | submit |
| testing-this | 0% | 0 | 0 | 0 | — | 3 | 190 | incomplete (:prediction_error) |
| yes-that | 73.6% | 1 | 1 | 0.75 | 0.41 | 7 | 418 | incomplete (:prediction_error) |
| daily-digital | 0% | 0 | 0 | 0 | — | 2 | 207 | incomplete (:prediction_error) |
| mutuals-combined | 0% | 0 | 0 | 0 | — | 8 | 651 | incomplete (:empty_tool_calls) |

# Imp bench `imp-09`

build, third attempt and the first clean one: random scratch dirs (imp-08's builders were scored on the self-test's leftover pages — only Jev's fit score noticed), stalled turns resumed from their history (every imp-08 build ended :empty_tool_calls), a trace per build. Eight of minormobius's build-a-bot requests, scored by the lab factory's smoke test and content gate plus Jev as judge. Baseline only.

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
| ds4-flash (`deepseek-v4-flash`) | — | — | — | — | — | — | — | 880s |
| ds4-pro (`deepseek-v4-pro`) | — | — | — | — | — | — | — | 2353s |

## ds4-flash

probe: `ok: "Blue"`


**build** — 8 of minormobius's build-a-bot requests, built by an Imp ReAct agent (max 40 steps), scored by lab-smoke, lab-content-gate and Jev as judge: mean 33.9% · median 297s a build · 4,652,057 tokens in all

| request | score | exists | gate | smoke | fit | tool calls | seconds | ended |
|---|---|---|---|---|---|---|---|---|
| train-game | 0% | 0 | 0 | 0 | — | 5 | 254 | incomplete (:empty_tool_calls) |
| odyssey-trail | 0% | 0 | 0 | 0 | — | 4 | 297 | incomplete (:empty_tool_calls) |
| domain-availability | 78.1% | 1 | 1 | 1 | 0.27 | 49 | 656 | submit |
| sketch-out | 96.4% | 1 | 1 | 1 | 0.88 | 37 | 299 | submit |
| testing-this | 0% | 0 | 0 | 0 | — | 4 | 262 | incomplete (:empty_tool_calls) |
| yes-that | 0% | 0 | 0 | 0 | — | 5 | 279 | incomplete (:empty_tool_calls) |
| daily-digital | 0% | 0 | 0 | 0 | — | 5 | 199 | incomplete (:empty_tool_calls) |
| mutuals-combined | 97% | 1 | 1 | 1 | 0.9 | 47 | 380 | submit |

## ds4-pro

probe: `ok: "blue"`


**build** — 8 of minormobius's build-a-bot requests, built by an Imp ReAct agent (max 40 steps), scored by lab-smoke, lab-content-gate and Jev as judge: mean 63% · median 808s a build · 1,597,313 tokens in all

| request | score | exists | gate | smoke | fit | tool calls | seconds | ended |
|---|---|---|---|---|---|---|---|---|
| train-game | 75.7% | 1 | 1 | 0.75 | 0.48 | 6 | 599 | incomplete (:prediction_error) |
| odyssey-trail | 63.4% | 1 | 1 | 0.75 | 0.07 | 6 | 1121 | incomplete (:empty_tool_calls) |
| domain-availability | 0% |  |  |  | — |  |  | error |
| sketch-out | 97% | 1 | 1 | 1 | 0.9 | 9 | 179 | submit |
| testing-this | 94% | 1 | 1 | 1 | 0.8 | 14 | 432 | submit |
| yes-that | 79.3% | 1 | 1 | 0.75 | 0.6 | 7 | 865 | incomplete (:empty_tool_calls) |
| daily-digital | 0% | 0 | 0 | 0 | — | 5 | 808 | incomplete (:empty_tool_calls) |
| mutuals-combined | 94.9% | 1 | 1 | 1 | 0.83 | 21 | 1228 | submit |

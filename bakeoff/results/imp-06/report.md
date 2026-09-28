# Imp bench `imp-06`

era: from one of minormobius.bsky.social's posts alone, guess the year (2023–2026). Zero-shot and 16 labelled examples on all three models; GEPA (true year as train feedback) on the DeepSeek models — Kimi K3 reasons too long per post to fit GEPA in the job. imp-05 is this run's failed first attempt: rows killed on time crashed the summary.

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
| ds4-flash (`deepseek-v4-flash`) | — | — | — | — | — | — | — | 3792s |
| ds4-pro (`deepseek-v4-pro`) — **partial: the job ended before the cell finished** | — | — | — | — | — | — | — | 2553s |
| kimi3 (`kimi-k3`) | — | — | — | — | — | — | — | 2416s |

## ds4-flash

probe: `ok: "blue"`


**era** — 120 held-out posts by minormobius.bsky.social, four years (chance 25%):

| arm | exact | within one year | errors |
|---|---|---|---|
| baseline | 6.7% | 17.5% | 95 |
| few_shot_k16 | 20.8% | 42.5% | 18 |
| gepa | 4.2% | 15% | 95 |

GEPA (reflection `ds4-pro`, max_metric_calls 200): kept the original program.

## ds4-pro

probe: `ok: "blue"`


**era** — 120 held-out posts by minormobius.bsky.social, four years (chance 25%):

| arm | exact | within one year | errors |
|---|---|---|---|
| baseline | 5.8% | 19.2% | 89 |
| few_shot_k16 | 25% | 50% | 3 |

## kimi3

probe: `ok: "Blue"`


**era** — 120 held-out posts by minormobius.bsky.social, four years (chance 25%):

| arm | exact | within one year | errors |
|---|---|---|---|
| baseline | 24.2% | 81.7% | 2 |
| few_shot_k16 | 31.7% | 65% | 0 |

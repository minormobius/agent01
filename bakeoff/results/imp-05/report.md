# Imp bench `imp-05`

era: from one of minormobius.bsky.social's posts alone, guess the year (2023–2026). Zero-shot, 16 labelled examples, and GEPA with the true year as train feedback — can an optimizer write down one person's eras? (Re-run: the first attempt failed in every cell on an undecoded plc.directory response.)

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
| ds4-flash (`deepseek-v4-flash`) | — | — | — | — | — | — | — | 663s |
| ds4-pro (`deepseek-v4-pro`) | — | — | — | — | — | — | — | 1563s |
| kimi3 (`kimi-k3`) | — | — | — | — | — | — | — | 1172s |

## ds4-flash

probe: `ok: "blue"`


**era raised** — no result: `** (FunctionClauseError) no function clause matching in Imp.Example.get/3`

## ds4-pro

probe: `ok: "blue"`


**era raised** — no result: `** (FunctionClauseError) no function clause matching in Imp.Example.get/3`

## kimi3

probe: `ok: "Blue"`


**era raised** — no result: `** (FunctionClauseError) no function clause matching in Imp.Example.get/3`

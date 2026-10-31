# Imp bench `imp-12`

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
| jev (`jev-latest`) | — | — | — | — | — | — | — | 704s |

## jev

probe: `ok: blue (confidence 1.0, 411 ms)`


**route — Jev** (20 held out; confidence gate 0.9):

| arm | accuracy | confident (≥ gate) | accuracy when confident | median ms | notes |
|---|---|---|---|---|---|
| jev_bare | 100% | 19 | 100% | 171 |  |

**trec — Jev** (80 held out; confidence gate 0.9):

| arm | accuracy | confident (≥ gate) | accuracy when confident | median ms | notes |
|---|---|---|---|---|---|
| cascade | 97.5% |  |  |  | kept 58 (98.3%), escalated 22 to imp-04/ds4-flash (95.5%) |
| jev_bare | 50% | 0 |  | 149 |  |
| jev_learned | 98.8% | 64 | 98.4% | 147 | instruction from imp-04/kimi3 |
| jev_optimized | 93.8% | 58 | 98.3% | 158 | optimized in 647s, reflection ds4-pro |

<details><summary>Jev program after Optimize Anything</summary>

```json
{
  "instructions": "Route the question to exactly one opaque code.\n\nUse K47 when the question asks for an entity such as an animal, product, substance, or other thing.\nUse K11 when the question asks for a description, definition, reason, or manner.\n\nReturn only the required structured route.",
  "option K11": "K11",
  "option K47": "K47"
}
```

</details>

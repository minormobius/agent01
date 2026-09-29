# Imp bench `imp-13`

Claude Sonnet through the Claude Code CLI on the build-a-bot's subscription credential — the first run of Imp's new claude -p model. trec zero-shot, then GEPA with Sonnet reflecting on its own failures. Proves the adapter live and puts the build-a-bot's own model on the headline task. (retry: the plan step now accepts sonnet as a GEPA model)

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
| sonnet (`claude-sonnet-5`) | — | — | — | — | — | 0% | 0% | 74s |

## sonnet

probe: `error: {"claude exited 1", {:claude_code, %{"api_error_status" => nil, "result" => "Not logged in · Please run /login", "subtype" => "success", "terminal_reason" => "api_error"}}}`


**trec** (80 held out, rows from deepfates/imp@49a635d3): baseline 0% (80 errors) → GEPA 0% (80 errors), optimizing took 35s
> baseline error: `%{index: 0, reason: {"claude exited 1", {:claude_code, %{"api_error_status" => nil, "result" => "Not logged in · Please run /login", ...}}}}`
> baseline error: `%{index: 1, reason: {"claude exited 1", {:claude_code, %{"api_error_status" => nil, "result" => "Not logged in · Please run /login", ...}}}}`
> baseline error: `%{index: 2, reason: {"claude exited 1", {:claude_code, %{"api_error_status" => nil, "result" => "Not logged in · Please run /login", ...}}}}`

GEPA (reflection `sonnet`, max_metric_calls 150): kept the original program.

# Imp bench `imp-02`

desk_hard baseline on all three models, then GEPA on ds4-flash with ds4-pro as the reflection model: can a rewritten instruction teach the cheap model the policy-version and delivery-window rules it gets wrong? kimi3 retried without temperature and with 16k max_tokens; route re-run for kimi3's sake.

Every number is a share of held-out questions answered right. `route`: 20 tickets, four teams,
zero-shot vs. 8 labelled examples (Imp `LabeledFewShot`). `desk`: 16 questions a ReAct agent can only
answer through six Elixir tools; the answer key is computed from the same data the tools read.

`desk_hard`: 18 held-out questions on a harder desk (policy versions by order date, windows from delivery,
restocking fees, undelivered orders, scans across customers, five currencies). `+GEPA`: the same agent after
GEPA rewrote its instructions from 9 train / 9 validation questions.

| model | route zero-shot | route few-shot (k=8) | desk | desk_hard | desk_hard +GEPA | wall |
|---|---|---|---|---|---|---|
| ds4-pro (`deepseek-v4-pro`) | 100% | 100% | — | 88.9% | — | 117s |
| kimi3 (`kimi-k3`) | 100% | 100% | — | 88.9% | — | 453s |

## ds4-pro

probe: `ok: "blue"`


**desk_hard:** react 88.9% (155 tool calls, 169112 tokens, 89s)

| q | expected | react | 
|---|---|---|
| h02 | `331.20 EUR` | `331.20 EUR` ✓ | 
| h04 | `553.00 GBP` | `553.00 GBP` ✓ | 
| h06 | `0.00 USD` | `0.00 USD` ✓ | 
| h08 | `0.00 USD` | `40.00 USD` ✗ | 
| h10 | `184.00 EUR` | `184.00 EUR` ✓ | 
| h12 | `0.00 JPY` | `0.00 JPY` ✓ | 
| h14 | `474.00 GBP` | `474.00 GBP` ✓ | 
| h16 | `11960.00 JPY` | `11960.00 JPY` ✓ | 
| h18 | `yes` | `yes` ✓ | 
| h20 | `no` | `no` ✓ | 
| h22 | `yes` | `yes` ✓ | 
| h24 | `no` | `no` ✓ | 
| h26 | `647.80 GBP` | `647.80 GBP` ✓ | 
| h28 | `1080.00 USD` | `` ✗ | 
| h30 | `4485.00 JPY` | `4485.00 JPY` ✓ | 
| h32 | `59052.50 JPY` | `59052.50 JPY` ✓ | 
| h34 | `2` | `2` ✓ | 
| h36 | `P-207` | `P-207` ✓ | 

Traces (baseline): [`ds4-pro.hard.traces.md`](ds4-pro.hard.traces.md)

**route:** zero-shot 100% → few-shot 100%. Zero-shot misses:


Compiled router: [`ds4-pro.route.program.json`](ds4-pro.route.program.json)

## kimi3

probe: `ok: "Blue"`


**desk_hard:** react 88.9% (164 tool calls, 152902 tokens, 357s)

| q | expected | react | 
|---|---|---|
| h02 | `331.20 EUR` | `331.20 EUR` ✓ | 
| h04 | `553.00 GBP` | `553.00 GBP` ✓ | 
| h06 | `0.00 USD` | `0.00 USD` ✓ | 
| h08 | `0.00 USD` | `40.00 USD` ✗ | 
| h10 | `184.00 EUR` | `184.00 EUR` ✓ | 
| h12 | `0.00 JPY` | `0.00 JPY` ✓ | 
| h14 | `474.00 GBP` | `474.00 GBP` ✓ | 
| h16 | `11960.00 JPY` | `11960.00 JPY` ✓ | 
| h18 | `yes` | `yes` ✓ | 
| h20 | `no` | `no` ✓ | 
| h22 | `yes` | `yes` ✓ | 
| h24 | `no` | `yes` ✗ | 
| h26 | `647.80 GBP` | `647.80 GBP` ✓ | 
| h28 | `1080.00 USD` | `1080.00 USD` ✓ | 
| h30 | `4485.00 JPY` | `4485.00 JPY` ✓ | 
| h32 | `59052.50 JPY` | `59052.50 JPY` ✓ | 
| h34 | `2` | `2` ✓ | 
| h36 | `P-207` | `P-207` ✓ | 

Traces (baseline): [`kimi3.hard.traces.md`](kimi3.hard.traces.md)

**route:** zero-shot 100% → few-shot 100%. Zero-shot misses:


Compiled router: [`kimi3.route.program.json`](kimi3.route.program.json)

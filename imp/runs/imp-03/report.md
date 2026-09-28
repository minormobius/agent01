# Imp bench `imp-03`

imp-02 again with its two faults fixed: desk_hard now states that returned orders are not eligible, and GEPA gets 5-minute row/reflection timeouts. Baselines for all three models; GEPA on ds4-flash with ds4-pro reflecting.

Every number is a share of held-out questions answered right. `route`: 20 tickets, four teams,
zero-shot vs. 8 labelled examples (Imp `LabeledFewShot`). `desk`: 16 questions a ReAct agent can only
answer through six Elixir tools; the answer key is computed from the same data the tools read.

`desk_hard`: 18 held-out questions on a harder desk (policy versions by order date, windows from delivery,
restocking fees, undelivered orders, scans across customers, five currencies). `+GEPA`: the same agent after
GEPA rewrote its instructions from 9 train / 9 validation questions.

| model | route zero-shot | route few-shot (k=8) | desk | desk_hard | desk_hard +GEPA | wall |
|---|---|---|---|---|---|---|
| ds4-flash (`deepseek-v4-flash`) | — | — | — | 100% | — | 99s |
| ds4-pro (`deepseek-v4-pro`) | — | — | — | 100% | — | 83s |
| kimi3 (`kimi-k3`) | — | — | — | 100% | — | 265s |

## ds4-flash

probe: `ok: "Blue"`


**desk_hard:** react 100% (150 tool calls, 145802 tokens, 39s)

| q | expected | react | 
|---|---|---|
| h02 | `331.20 EUR` | `331.20 EUR` ✓ | 
| h04 | `553.00 GBP` | `553.00 GBP` ✓ | 
| h06 | `0.00 USD` | `0.00 USD` ✓ | 
| h08 | `0.00 USD` | `0.00 USD` ✓ | 
| h10 | `184.00 EUR` | `184.00 EUR` ✓ | 
| h12 | `0.00 JPY` | `0.00 JPY` ✓ | 
| h14 | `474.00 GBP` | `474.00 GBP` ✓ | 
| h16 | `11960.00 JPY` | `11960.00 JPY` ✓ | 
| h18 | `yes` | `yes` ✓ | 
| h20 | `no` | `no` ✓ | 
| h22 | `yes` | `yes` ✓ | 
| h24 | `no` | `no` ✓ | 
| h26 | `647.80 GBP` | `647.80 GBP` ✓ | 
| h28 | `1080.00 USD` | `1080.00 USD` ✓ | 
| h30 | `4485.00 JPY` | `4485.00 JPY` ✓ | 
| h32 | `59052.50 JPY` | `59052.50 JPY` ✓ | 
| h34 | `2` | `2` ✓ | 
| h36 | `P-207` | `P-207` ✓ | 

Traces (baseline): [`ds4-flash.hard.traces.md`](ds4-flash.hard.traces.md)

**GEPA** (reflection model `ds4-pro`, max_metric_calls 150): **failed**: `Imp.optimize!/4 failed: {:optimizer_failed, Imp.Optimizer.GEPA, %FunctionClauseError{module: Enum, function: :find_value_list, arity: 3, kind: nil, args: nil, clauses: nil}}`

## ds4-pro

probe: `ok: "Blue"`


**desk_hard:** react 100% (160 tool calls, 159561 tokens, 81s)

| q | expected | react | 
|---|---|---|
| h02 | `331.20 EUR` | `331.20 EUR` ✓ | 
| h04 | `553.00 GBP` | `553.00 GBP` ✓ | 
| h06 | `0.00 USD` | `0.00 USD` ✓ | 
| h08 | `0.00 USD` | `0.00 USD` ✓ | 
| h10 | `184.00 EUR` | `184.00 EUR` ✓ | 
| h12 | `0.00 JPY` | `0.00 JPY` ✓ | 
| h14 | `474.00 GBP` | `474.00 GBP` ✓ | 
| h16 | `11960.00 JPY` | `11960.00 JPY` ✓ | 
| h18 | `yes` | `yes` ✓ | 
| h20 | `no` | `no` ✓ | 
| h22 | `yes` | `yes` ✓ | 
| h24 | `no` | `no` ✓ | 
| h26 | `647.80 GBP` | `647.80 GBP` ✓ | 
| h28 | `1080.00 USD` | `1080.00 USD` ✓ | 
| h30 | `4485.00 JPY` | `4485.00 JPY` ✓ | 
| h32 | `59052.50 JPY` | `59052.50 JPY` ✓ | 
| h34 | `2` | `2` ✓ | 
| h36 | `P-207` | `P-207` ✓ | 

Traces (baseline): [`ds4-pro.hard.traces.md`](ds4-pro.hard.traces.md)

## kimi3

probe: `ok: "Blue"`


**desk_hard:** react 100% (156 tool calls, 146990 tokens, 261s)

| q | expected | react | 
|---|---|---|
| h02 | `331.20 EUR` | `331.20 EUR` ✓ | 
| h04 | `553.00 GBP` | `553.00 GBP` ✓ | 
| h06 | `0.00 USD` | `0.00 USD` ✓ | 
| h08 | `0.00 USD` | `0.00 USD` ✓ | 
| h10 | `184.00 EUR` | `184.00 EUR` ✓ | 
| h12 | `0.00 JPY` | `0.00 JPY` ✓ | 
| h14 | `474.00 GBP` | `474.00 GBP` ✓ | 
| h16 | `11960.00 JPY` | `11960.00 JPY` ✓ | 
| h18 | `yes` | `yes` ✓ | 
| h20 | `no` | `no` ✓ | 
| h22 | `yes` | `yes` ✓ | 
| h24 | `no` | `no` ✓ | 
| h26 | `647.80 GBP` | `647.80 GBP` ✓ | 
| h28 | `1080.00 USD` | `1080.00 USD` ✓ | 
| h30 | `4485.00 JPY` | `4485.00 JPY` ✓ | 
| h32 | `59052.50 JPY` | `59052.50 JPY` ✓ | 
| h34 | `2` | `2` ✓ | 
| h36 | `P-207` | `P-207` ✓ | 

Traces (baseline): [`kimi3.hard.traces.md`](kimi3.hard.traces.md)

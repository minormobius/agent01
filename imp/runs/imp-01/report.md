# Imp bench `imp-01`

First live Imp run: does a typed router lift with 8 examples on these models the way it did on gpt-5.4-mini (Imp R1/R2), and how well does a ReAct agent use six Elixir tools to answer refund-desk questions with exact answers? Baseline only; GEPA on desk comes next.

Every number is a share of held-out questions answered right. `route`: 20 tickets, four teams,
zero-shot vs. 8 labelled examples (Imp `LabeledFewShot`). `desk`: 16 questions a ReAct agent can only
answer through six Elixir tools; the answer key is computed from the same data the tools read.

| model | route zero-shot | route few-shot (k=8) | desk (ReAct + tools) | tool calls | desk tokens | wall |
|---|---|---|---|---|---|---|
| ds4-flash (`deepseek-v4-flash`) | 100% | 100% | 100% | 107 | 111111 | 40s |
| ds4-pro (`deepseek-v4-pro`) | 100% | 100% | 100% | 107 | 125213 | 88s |
| kimi3 (`kimi-k3`) | 0% | 0% | 0% | 0 | 0 | 5s |

## ds4-flash

**desk:** 100% · 107 tool calls · `convert`×8 `days_since`×18 `find_customer`×15 `get_order`×22 `list_orders`×6 `refund_policy`×22 `submit`×16 · ended by submit×16

| q | expected | got | |
|---|---|---|---|
| d01 | `0.00 EUR` | `0.00 EUR` | ✓ |
| d02 | `73.60 EUR` | `73.60 EUR` | ✓ |
| d04 | `23.70 GBP` | `23.70 GBP` | ✓ |
| d05 | `0.00 USD` | `0.00 USD` | ✓ |
| d07 | `810.00 USD` | `810.00 USD` | ✓ |
| d08 | `45.00 USD` | `45.00 USD` | ✓ |
| d10 | `yes` | `yes` | ✓ |
| d11 | `yes` | `yes` | ✓ |
| d13 | `yes` | `yes` | ✓ |
| d14 | `yes` | `yes` | ✓ |
| d16 | `O-103` | `O-103` | ✓ |
| d17 | `O-105` | `O-105` | ✓ |
| d19 | `73.60 EUR` | `73.60 EUR` | ✓ |
| d20 | `379.20 GBP` | `379.20 GBP` | ✓ |
| d22 | `855.00 USD` | `855.00 USD` | ✓ |
| d23 | `2` | `2` | ✓ |

Full tool traces: [`ds4-flash.traces.md`](ds4-flash.traces.md)

**route:** zero-shot 100% → few-shot 100%. Zero-shot misses:


Compiled router: [`ds4-flash.route.program.json`](ds4-flash.route.program.json)

## ds4-pro

**desk:** 100% · 107 tool calls · `convert`×8 `days_since`×18 `find_customer`×15 `get_order`×22 `list_orders`×6 `refund_policy`×22 `submit`×16 · ended by submit×16

| q | expected | got | |
|---|---|---|---|
| d01 | `0.00 EUR` | `0.00 EUR` | ✓ |
| d02 | `73.60 EUR` | `73.60 EUR` | ✓ |
| d04 | `23.70 GBP` | `23.70 GBP` | ✓ |
| d05 | `0.00 USD` | `0.00 USD` | ✓ |
| d07 | `810.00 USD` | `810.00 USD` | ✓ |
| d08 | `45.00 USD` | `45.00 USD` | ✓ |
| d10 | `yes` | `yes` | ✓ |
| d11 | `yes` | `yes` | ✓ |
| d13 | `yes` | `yes` | ✓ |
| d14 | `yes` | `yes` | ✓ |
| d16 | `O-103` | `O-103` | ✓ |
| d17 | `O-105` | `O-105` | ✓ |
| d19 | `73.60 EUR` | `73.60 EUR` | ✓ |
| d20 | `379.20 GBP` | `379.20 GBP` | ✓ |
| d22 | `855.00 USD` | `855.00 USD` | ✓ |
| d23 | `2` | `2` | ✓ |

Full tool traces: [`ds4-pro.traces.md`](ds4-pro.traces.md)

**route:** zero-shot 100% → few-shot 100%. Zero-shot misses:


Compiled router: [`ds4-pro.route.program.json`](ds4-pro.route.program.json)

## kimi3

**desk:** 0% · 0 tool calls ·  · ended by incomplete×16

| q | expected | got | |
|---|---|---|---|
| d01 | `0.00 EUR` | `` | ✗ |
| d02 | `73.60 EUR` | `` | ✗ |
| d04 | `23.70 GBP` | `` | ✗ |
| d05 | `0.00 USD` | `` | ✗ |
| d07 | `810.00 USD` | `` | ✗ |
| d08 | `45.00 USD` | `` | ✗ |
| d10 | `yes` | `` | ✗ |
| d11 | `yes` | `` | ✗ |
| d13 | `yes` | `` | ✗ |
| d14 | `yes` | `` | ✗ |
| d16 | `O-103` | `` | ✗ |
| d17 | `O-105` | `` | ✗ |
| d19 | `73.60 EUR` | `` | ✗ |
| d20 | `379.20 GBP` | `` | ✗ |
| d22 | `855.00 USD` | `` | ✗ |
| d23 | `2` | `` | ✗ |

Full tool traces: [`kimi3.traces.md`](kimi3.traces.md)

**route:** zero-shot 0% → few-shot 0%. Zero-shot misses:

- "A phishing email is impersonating your billing notifications." → `null`
- "Can I merge two workspaces into one?" → `null`
- "Can the weekly digest email be customized with our logo?" → `null`
- "Can you confirm whether our data was in the reported breach?" → `null`
- "Do you offer nonprofit discounts on the team plan?" → `null`
- "Downgrade our plan to the starter tier at the end of the term." → `null`
- "Is there an on-prem version of the product?" → `null`
- "Our purchase order number is missing from the invoice." → `null`
- "Please enable IP allowlisting for our admin accounts." → `null`
- "Please support markdown in comments." → `null`
- "Refund attempts fail with a gateway timeout error." → `null`
- "Scheduled reports did not run last night." → `null`
- "Session stays active after logout on shared computers." → `null`
- "The currency on our invoice should be EUR, not USD." → `null`
- "The mobile app can't sync; requests fail with DNS errors." → `null`
- "The mobile app is missing the reports tab." → `null`
- "The proration on our upgrade looks wrong by about $40." → `null`
- "The search index seems stale; new records don't appear." → `null`
- "We want to restrict API tokens to read-only scopes." → `null`
- "We're seeing elevated latency from the eu-west region." → `null`

Compiled router: [`kimi3.route.program.json`](kimi3.route.program.json)

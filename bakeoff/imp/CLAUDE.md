# bakeoff/imp — scored Imp programs across models

Not a surface; nothing deploys from here. The scored lane beside the bake-off's
taste lane: where `bakeoff/` hands an agent harness a brief and a human ranks
the result, this hands **[Imp](https://github.com/deepfates/imp)** programs a
task with one right answer per question and reports the share it gets right.
Imp is deepfates' port of DSPy to Elixir/BEAM (typed signatures, optimizers,
ReAct agents under OTP), pinned here at `~> 0.5.0` from Hex.

Repo-wide rules: [`../../CLAUDE.md`](../../CLAUDE.md). The bake-off it sits
beside: [`../CLAUDE.md`](../CLAUDE.md).

## Tasks

| task | program | data | arms |
|---|---|---|---|
| `route` | `Imp.predict`, `ticket -> team: enum[atlas,harbor,beacon,quill]` | Imp's own `priv/tutorial/support_tickets.json`, 20 train / 20 test | zero-shot; `LabeledFewShot(k: 8)` |
| `desk` | `Imp.react` over six Elixir tools (`lib/desk.ex`) | 24 generated questions, 8 train / 16 test | ReAct zero-shot |
| `desk_hard` | `Imp.react` over seven tools (`lib/desk_hard.ex`) | 36 generated questions, 9 train / 9 validation / 18 test | ReAct zero-shot; + GEPA |
| `trec` | `Imp.predict`, `text -> route: enum[K11,K47]` (`lib/trec.ex`) | Imp's matched-GEPA TREC splits, 20 train / 40 selection / 80 held out, **fetched at run time** | baseline; + GEPA |

`trec` is Imp's own `research/matched_instruction_optimizers_trec` re-run on
our models: two **opaque** codes the program is never told the meaning of,
learned from feedback on the train rows only (selection rows give a score, no
feedback). Every model starts near chance, so it has headroom however strong
the model is. Imp's result on it: GEPA +0.40 held-out on gpt-5.4-mini (R3).
The rows are **not committed** — Imp records the TREC corpus license as
unknown — so `Trec.rows/0` fetches them from deepfates/imp at a pinned commit,
checks each file's sha256, and caches them in the gitignored `data/`.

`route` is the configuration behind rows R1/R2 of Imp's `research/RESULTS.md`
(gpt-5.4-mini: 0.30–0.40 → 0.90–0.95), so our numbers sit next to a published one.

`desk` is a refund desk the agent can see only through tools: `find_customer`,
`list_orders`, `get_order`, `refund_policy`, `days_since`, `convert`. The world
is fixed (four customers, eight orders, today = 2026-09-27) and **the answer key
is computed by `Desk.solve/1` from the same data the tools read**, never typed
by hand. Scoring (`Desk.score/2`) is lenient on form and strict on value:
`€73.6` matches `73.60 EUR`; `73.60 USD` does not; money gets a 1-cent tolerance
so summing before or after converting can't cost a point.

`desk` hit the ceiling on imp-01 (both DeepSeek models 16/16), so it stays as
the easy control and `desk_hard` carries the traps a real policy has: the
policy **version** follows the ORDER date (v1 before 2026-09-01; v2 cut the
electronics window 30 → 21 and raised furniture's to 45), windows run from
**delivery**, undelivered orders **cancel for 100%**, opened electronics pay a
**restocking fee** after the tier percent, some questions **scan** every
customer, and JPY joins the currencies. P-205 is refundable only under v1 and
P-213 only under v2, so an agent that reads today's policy gets both wrong.

Its metric returns feedback as well as a score: on a miss, the reference
solver's derivation ("P-205 ordered 2026-08-29 → policy v1; delivered 25 days
ago, within 30; standard 90% of 250.00 → 225.00 USD"). That is what GEPA's
reflection model reads, beside the whole failed run (every tool call and
result), when it rewrites the agent's instructions. The report prints the
instruction before and after in full.

## Running

```bash
source ~/beam/env.sh     # OTP 28 + Elixir 1.19 (see "Installing BEAM" below)
cd bakeoff/imp && mix deps.get
IMP_BENCH_MODEL=static mix run -e 'ImpBench.main()'          # scripted model: no key, no spend
DEEPSEEK_API_KEY=… IMP_BENCH_MODEL=ds4-flash mix run -e 'ImpBench.main()'
node report.mjs <run-id> --from out                          # → ../results/<run-id>/
```

`static` exercises every path (evaluate, compile, the ReAct loop, a real tool
call, submit, traces, report); its scores mean nothing. CI runs it before
every live cell, so a broken rig fails before it spends.

Models come from `../cells.json` (`openaiBase`, `model`, `keyEnv`) — the same
endpoint and id the harness cells use. Imp reaches them as
`%{provider: :openai, base_url: …}`, so no ReqLLM registry entry is needed.

**In CI:** commit `bakeoff/imp/RUN` on the owning branch
(`claude/friends-project-planning-cags5l`, the only branch in
`.github/workflows/imp-bench.yml`'s trigger):

```json
{ "runId": "imp-02", "models": ["ds4-flash", "kimi3"], "tasks": ["route", "desk_hard"],
  "gepa": { "models": ["ds4-flash"], "reflection": "ds4-pro", "maxMetricCalls": 150 },
  "note": "why" }
```

`gepa` is optional and runs only for the models it names (it costs roughly
`maxMetricCalls` whole agent runs plus the reflection calls; the plan step
refuses more than 400). `models.json` overrides LM options per model — `null`
drops one; `kimi3` sends no `temperature` and a 16k `max_tokens`, because
kimi-k3 always thinks.

One runner per model. Results land on a `bakeoff/<run-id>` branch as
`bakeoff/results/<run-id>/`: `report.md`, `results.json`, each model's
`<model>.traces.md` (every tool call, its arguments, what it returned) and
`<model>.route.program.json` (the compiled router, as Imp saves it — instructions
and demos you can read and diff).

## The Imp patch

`patch_imp.exs` patches Imp 0.5.0's GEPA before every CI compile. Its
`find_operational_safety/1` (in `gepa/engine.ex` and `gepa/program_adapter.ex`)
walks every trajectory after each batch and recurses into lists with
`Enum.find_value/2`, which raises `FunctionClauseError` on an improper list.
Real provider data carries one somewhere: imp-02 and imp-03 both lost GEPA to
it against DeepSeek, while the scripted model never produced one. A metric
whose metadata holds `["a" | "b"]` reproduces it with no model at all;
`checks/gepa_improper_list.exs` is that reproduction, and CI runs it after the
patch. The patch walks cons cells instead. It refuses to run if the upstream
clause has changed, so an Imp upgrade must re-check it (and can drop it once
Imp fixes the walker).

## Two test models

- `IMP_BENCH_MODEL=static` — `Imp.LM.Static` with a script (`lib/scripted.ex`). Fast, but skips HTTP and
  response parsing entirely.
- `IMP_BENCH_MODEL=fake` — a local OpenAI-compatible server (`lib/fake_openai.ex`, Plug.Cowboy on :4077)
  that Imp reaches through ReqLLM like a real provider, including tool calls and `reasoning_content`.

## Installing BEAM in the sandbox

Hex publishes prebuilt OTP for Ubuntu and Elixir zips, both checksummed:

```bash
curl -sSfLo otp.tar.gz https://builds.hex.pm/builds/otp/ubuntu-24.04/OTP-28.5.0.7.tar.gz
curl -sSfLo elixir.zip https://builds.hex.pm/builds/elixir/v1.19.6-otp-28.zip
# verify against builds.txt at the same paths, unpack, run otp/Install -minimal <dir>
```

Set `LANG=C.UTF-8 ELIXIR_ERL_OPTIONS=+fnu` or Elixir warns about latin1. A
cold compile of Imp and its deps takes ~2.5 min on 4 cores.

## Known limits

- **16 and 20 held-out questions.** One question is 6.25 and 5 points. Small
  gaps between models are noise; run repeats before claiming a ranking.
- **`temperature: 0` is requested, not guaranteed** — providers differ.
- **Usage is what the provider reports** through ReqLLM, per desk question.
  `route` runs in `Imp.evaluate`'s worker processes, outside the usage frame,
  so its tokens are not counted.
- **Every rule the key applies must be stated to the agent** (instructions or
  a tool description). imp-02 scored P-208 against "returned orders are not
  eligible" without saying so anywhere, and both models that ran it lost the
  point; desk_hard numbers before imp-03 are not comparable with later ones.
- **GEPA's budget is `max_metric_calls`, checked between iterations**, so an
  iteration that starts may finish past it (Imp's pinned-DSPy semantics).
- **A saved program carries no key**, and one built on the scripted model
  cannot be saved at all (`Imp.LM.Static` is not portable) — expected in the
  self-test, where `*.program.json` holds that error instead.

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

`route` is the configuration behind rows R1/R2 of Imp's `research/RESULTS.md`
(gpt-5.4-mini: 0.30–0.40 → 0.90–0.95), so our numbers sit next to a published one.

`desk` is a refund desk the agent can see only through tools: `find_customer`,
`list_orders`, `get_order`, `refund_policy`, `days_since`, `convert`. The world
is fixed (four customers, eight orders, today = 2026-09-27) and **the answer key
is computed by `Desk.solve/1` from the same data the tools read**, never typed
by hand. Scoring (`Desk.score/2`) is lenient on form and strict on value:
`€73.6` matches `73.60 EUR`; `73.60 USD` does not; money gets a 1-cent tolerance
so summing before or after converting can't cost a point.

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
{ "runId": "imp-01", "models": ["ds4-flash", "kimi3"], "tasks": ["route", "desk"], "note": "why" }
```

One runner per model. Results land on a `bakeoff/<run-id>` branch as
`bakeoff/results/<run-id>/`: `report.md`, `results.json`, each model's
`<model>.traces.md` (every tool call, its arguments, what it returned) and
`<model>.route.program.json` (the compiled router, as Imp saves it — instructions
and demos you can read and diff).

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
- **No optimizer arm on `desk` yet.** The train split is reserved for GEPA,
  which needs a reflection model and a budget — the next run, once the
  baseline says where agents fail.

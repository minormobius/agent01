# bakeoff — cross-model, cross-harness comparison

Not a surface. No worker, no domain, nothing deploys from here. This directory
is the measuring apparatus for the `os` agent platform: give the same task to
every (harness, model) pair, score every result the same way, and put the
answers next to each other.

Repo-wide rules live in [`../CLAUDE.md`](../CLAUDE.md). The platform this
measures is [`../os/`](../os/CLAUDE.md).

## The unit is a cell

A **cell** is one `(harness, model)` pair.

- **harness** — the agent loop. `claude` (Claude Code CLI) or `opencode`.
- **model** — an endpoint + model id + key. `kimi3`, `ds4-flash`, `ds4-pro`.

Both axes matter and neither is answerable alone: "which model is better at
this" is meaningless without fixing the harness, and "which harness is better"
is meaningless without fixing the model. So the matrix is the experiment, not a
list of models.

The same cell abstraction runs in two places:

| where | how | why |
|---|---|---|
| GitHub Actions | `bakeoff/run-cell.sh <harness> <model>`, one runner per cell | cells run in parallel from identical clean checkouts, with no shared state. That isolation is what makes the comparison mean anything. |
| the os container | `agent --harness=opencode ds4-flash` ([`../os/api/container/agent.sh`](../os/api/container/agent.sh)) | interactive: the same cell, driven by hand from os.mino.mobi |

They configure models from **different files** — Actions has no worker to ask
for `AGENT_PROFILES`, so it reads `cells.json`, while the container reads
`os/api/wrangler.toml` `[vars]`. Silent drift between the two would invalidate
every comparison without producing a single error, so
`bakeoff.selftest.mjs` asserts they agree on every model id and base URL.

## Running one

```bash
# from the Actions tab: "Bake-off (harness × model)" → Run workflow
# locally, one cell (needs the provider key in your environment):
DEEPSEEK_API_KEY=sk-… bakeoff/run-cell.sh claude ds4-flash

# collect whatever has been scored into a report + arena page
node bakeoff/report.mjs <run-id> --from bakeoff/.run
```

It is **manual dispatch only**. It spends real tokens at every configured
provider; nothing that expensive should fire on a push. A cell whose provider
key is not in repo secrets is *skipped with a notice*, not failed — a run
missing one provider is still a run, and a red X on an absent key teaches
nothing.

## The rubric comes first

`briefs/<name>/score.mjs` is written **before** the brief, and the brief is
written from it. Scoring is pure Node over an ES module the brief requires the
entry to expose — no browser, no WebGPU, ~50ms, identical for every cell.

Two calibration points, both enforced by the selftest:

- **The floor.** `baseline.mjs` reconstructs the *shipped* code and scores it.
  It must fail, and fail on the specific check the brief is about. A rubric
  nobody has watched fail is not evidence of anything.
- **The ceiling.** A minimal correct implementation must score full marks. A
  rubric nothing can pass is not a rubric.

For `inpac-gravity` those are **30/100** and **100/100**. Every entry is
reported as a delta against the floor.

The rubric describes *what a player must experience*, never an implementation.
An entry is free to repair the existing scheme or replace it — that choice is
the interesting part of the comparison and must not be legislated away.

`score.mjs` is also the entry's own test: the brief tells agents to run it as
often as they like. Entries are re-scored with the repo's copy afterwards, so
editing the scorer buys a cell nothing.

## What a run produces

```
bakeoff/results/<run-id>/
  report.md      ranking, per-check grid, out-of-scope edits, every NOTES.md
  results.json   the same, machine-readable
  arena.html     side-by-side, each entry in a sandboxed iframe
```

Results are pushed to a `bakeoff/<run-id>` branch. **No deploy trigger matches
`bakeoff/**`**, so a run publishes nothing — the same safety line the repo
already draws by keeping agent branches out of every `deploy-*.yml`.

## Publishing to the arena

```bash
node bakeoff/report.mjs <run-id> --from <dir> --publish
```

stages entries into `os/public/arena/<run-id>/`, served at
`os.mino.mobi/arena/<run-id>/` once the `os` branch is pushed. Deliberately a
separate human step: entries are model-written HTML and os.mino.mobi is inside
the `.mino.mobi` SSO cookie scope with an Anthropic key in localStorage.

`os/public/_headers` serves everything under `/arena/entries/` with
`Content-Security-Policy: sandbox allow-scripts` — an opaque origin, so an entry
cannot read that cookie or that key even when opened directly rather than
through the arena's sandboxed iframe. Review before you push anyway.

## Adding a brief

1. `briefs/<name>/score.mjs` — the rubric. Write it first.
2. `briefs/<name>/baseline.mjs` — score the current code; prove the rubric
   fails it, and `--write` the `baseline.json` the arena uses as its zero line.
3. `briefs/<name>/BRIEF.md` — the task, in the agent's hands. State the defect
   with measurements, state the required seam, restate every check with its
   weight. Anything scored but not written down is a rule the agents were never
   told.
4. Point `cells.json` `brief` + `target` at it, and extend the selftest's
   brief-covers-the-rubric check if the check names changed.

## Adding a cell

A model: one entry in `cells.json` `models` **and** the matching `[vars]` in
`os/api/wrangler.toml`, plus the key as a repo secret and a sync line in
`deploy-os-api.yml`. Both endpoint shapes are required — `anthropicBase` for the
claude harness, `openaiBase` for opencode — or the model only runs on half the
matrix.

A harness: one `run_<name>` function in `os/api/container/agent.sh`, one install
line in `container/Dockerfile`, one branch in `run-cell.sh`, one entry in
`cells.json` `harnesses`, one row in the workflow matrix.

## Known limits

- **Single sample per cell.** One run per pair, so the numbers carry the
  variance of one draw and small gaps between entries are not significant. To
  claim a model is better than another, run the brief several times.
- **The rubric is not the game.** It scores the physics module, plus a coarse
  integrity check that the page still imports it and still has a render loop.
  Nothing here proves the game is *fun*, or even that it renders — that is what
  the arena's iframes are for, and it is a human's call.
- **Providers are not neutral ground.** Each cell runs against its vendor's own
  endpoint, so a slow or degraded provider costs its models wall-clock time in a
  way that has nothing to do with the model.

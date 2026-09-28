# imp — imp.mino.mobi (plain route)

<!-- HAND-OWNED. Instruction set for THIS surface. Repo-wide rules live in
     ../CLAUDE.md; the index of all surfaces is ../docs/SURFACES.md. -->

An independent evaluation of **[Imp](https://github.com/deepfates/imp)**, deepfates' port of DSPy to
Elixir/BEAM, published for its author and anyone curious. The measuring happens elsewhere: the rig is
[`../bakeoff/imp/`](../bakeoff/imp/CLAUDE.md), run by `.github/workflows/imp-bench.yml`. This directory
only **publishes** what that rig produced.

## Facts

| | |
|---|---|
| Surface | `imp` |
| Dir | `imp/` |
| Endpoint | `imp.mino.mobi` (plain route — no custom-domain slot) |
| Type | frontend (thin assets Worker, worker name `imp`) |
| Owning branch | `claude/friends-project-planning-cags5l` |
| Deploy | `.github/workflows/deploy-imp.yml` (route-dns, deploy, then fails unless the host serves) |
| Uses | — |

## How it works

No build step for the page. `index.html` is prose; `imp.js` renders the chart, the instruction
before/after, and the tables from **`runs/index.json`**. `trace.html?f=<run>/<model>.traces.md` shows a
run's recorded agent turns as text (the parameter is checked against a strict pattern and fetched
same-origin).

`runs/<run-id>/` holds each run's evidence **unedited**: `report.md`, `results.json`, per-model
`*.traces.md` and compiled `*.program.json`. They are imported from the run's results branch:

```bash
node scripts/build-imp.mjs imp-01 imp-02 imp-03 imp-04   # reads origin/bakeoff/<id>, rewrites runs/index.json
```

That is an import, not a generator preflight re-derives (its source is branches, not the tree); run it
after each new bench run, review the diff, commit. Every text file passes through `landing.mjs`
`scrubText`, the repo's redaction layer, because this directory is served as-is.

**Which run feeds which section** (hand-picked in `imp.js`, because not every run measures the model):

| section | runs | why |
|---|---|---|
| TREC chart | DeepSeek from imp-10, Kimi from imp-04 (`TREC_RUN`) | imp-04's 2,048-token replies starved the DeepSeek models: their hidden reasoning used the budget and ~64/80 calls returned no answer. imp-10 re-ran at 8,192. The page says so, as a correction. |
| Jev | latest run with a `jev` cell (imp-12) | |
| era | per model, the latest run whose baseline mostly answered | DeepSeek Pro is left out: starved in imp-06, out of provider credit (HTTP 402) in imp-10 |
| builds | every run with a `build` task (imp-09, imp-11) | imp-07/08 were harness failures (a 2,048 cap; scratch dirs shared with the self-test) and are not imported |
| tool tasks | imp-01/02/03 by id | |

A new run does not update the prose — re-read the numbers in `index.html` and `imp.js` when you import one.
`build-imp.mjs --from-dir` imports a run whose results branch never landed (build it with
`bakeoff/imp/report.mjs` from the downloaded cell artifacts).

## What must stay true

- **Nothing here is a claim Imp makes.** Numbers are ours; the footer says so. Imp's own results are cited
  by their row ids in Imp's `research/RESULTS.md`.
- **No TREC rows.** Imp records the corpus license as unknown; the rig fetches the rows at run time and
  never commits them. The only TREC text here is three sample questions GEPA quoted inside its rewritten
  instructions.
- **No keys.** Saved Imp programs carry provider config but never credentials; check any new artefact
  anyway before import.
- Chart colours are the dataviz reference palette's slots 1–2 (orange before, blue after), validated for
  light and dark surfaces; keep identity off colour alone (legend, direct labels, table view).

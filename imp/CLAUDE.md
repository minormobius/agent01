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
| Endpoint | `imp.mino.mobi` (plain route — no custom-domain slot); `imp.minomobi.com` serves only `/ab/` (second plain route, minomobi.com zone) |
| Type | frontend + a small `worker.js` (host rules, the ballot API) and one Durable Object (`Ballot`, SQLite), worker name `imp` |
| Owning branch | `claude/friends-project-planning-cags5l` |
| Deploy | `.github/workflows/deploy-imp.yml` (route-dns, deploy, then fails unless the host serves) |
| Uses | `mino-auth` (service binding `AUTH`, identity for the ballot) |

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
| TREC chart | DeepSeek from imp-10, Kimi from imp-04, Sonnet from imp-14 (`TREC_RUN`) | imp-04's 2,048-token replies starved the DeepSeek models: their hidden reasoning used the budget and ~64/80 calls returned no answer. imp-10 re-ran at 8,192. The page says so, as a correction. |
| Jev | latest run with a `jev` cell (imp-12) | |
| era | per model, the latest run whose baseline mostly answered | DeepSeek Pro is left out: starved in imp-06, out of provider credit (HTTP 402) in imp-10 |
| builds | every run with a `build` task (imp-09, imp-11) | imp-07/08 were harness failures (a 2,048 cap; scratch dirs shared with the self-test) and are not imported |
| tool tasks | imp-01/02/03 by id | |

A new run does not update the prose — re-read the numbers in `index.html` and `imp.js` when you import one.
`build-imp.mjs --from-dir` imports a run whose results branch never landed (build it with
`bakeoff/imp/report.mjs` from the downloaded cell artifacts).

## /ab/ — the build-a-bot A/B pairs

`ab/<run>/pNN-a|b/` holds blinded sites from [`../bakeoff/buildabot/`](../bakeoff/buildabot/CLAUDE.md):
HTML a model wrote for a stranger's request. **It never runs on a `*.mino.mobi` origin.** That site is
same-site with `auth.mino.mobi`, so the SSO cookie (`Domain=.mino.mobi`, `SameSite=Lax`) rides on its
fetches, and the auth worker trusts every `*.mino.mobi` origin — a tenant page there could act as the
signed-in user. `worker.js` therefore serves `/ab/` only on `imp.minomobi.com` (another registrable
domain, as production serves tenants from minomobi.com) under production's lab CSP, redirects
`imp.mino.mobi/ab/*` there, and redirects everything else on `imp.minomobi.com` back. `deploy-imp.yml`
checks all three. Import pairs only after reading them; `mapping.json` (the key) is never copied here.

## /vote/ — the ballot

`vote/index.html` is the blind ballot for the A/B runs, on imp.mino.mobi (a normal `*.mino.mobi` page: it
signs in with the shared client, `vote/auth.js`, a synced copy of `packages/oauth-client/auth.js`,
identity scope only). It reads `vote/runs.json` and `vote/runs/<run>.json` (written by
`bakeoff/buildabot/publish-pairs.mjs`: the public fields of each pair, never the key) and talks to
`worker.js`:

| route | who | what |
|---|---|---|
| `GET /api/ballot/me` | anyone | `{signedIn, voter, did, handle}` — asks `mino-auth` `/api/me` with the caller's cookie/Bearer |
| `GET /api/ballot/votes?run=` | a voter | their votes and whether the run is sealed |
| `POST /api/ballot/vote` `{run, pair, pick, note}` | a voter, Origin imp.mino.mobi | upsert one vote (`pick`: a, b, tie or null) |
| `POST /api/ballot/seal` `{run}` | a voter, Origin imp.mino.mobi | freeze the run |
| `GET /api/ballot/results?run=` | anyone | the votes, **only once sealed** — how the reveal is read |

Voters are the DIDs in `wrangler.jsonc` `vars.VOTERS` (minormobius, majormobius). Votes live in the `Ballot`
Durable Object (one instance, SQLite; migration tag `v1`). **The Durable Object holds the only copy of the
votes**: deleting the worker or the class deletes them (`docs/DEPLOYS.md` §7).

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

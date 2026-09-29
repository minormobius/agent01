# bakeoff/buildabot — can a better harness make the build-a-bot better?

Not a surface; nothing deploys from here. The question: the lab factory
(`lab-build.yml` on `claude/minomobi-landing-page-vg37b8`, the "build-a-bot" that
answers Bluesky requests with a site on minomobi.com) runs Claude Sonnet with a
60-turn cap, no browser and one screenshot. Is the ceiling the model, or the
harness around it? Same model, different harness, blind human vote.

Repo rules: [`../../CLAUDE.md`](../../CLAUDE.md). The Imp lane beside it: [`../imp/`](../imp/CLAUDE.md).

## The two builders

| | baseline | challenger |
|---|---|---|
| prompt | production's main-pass prompt, byte-identical (`compose-prompt.mjs`) | the same, plus [`challenger/method.md`](challenger/method.md) |
| model, tools | `claude-sonnet-5`; Read Write Edit Glob Grep; no Bash, no network | the same, plus **eyes** ([`eyes-mcp.mjs`](eyes-mcp.mjs)): `look`, `watch`, `drive` its own page in headless Chrome under the production CSP |
| budget | 60 turns, $5, 32 min | 400 turns, 90 min |
| after the build | smoke → repair (20 turns) if broken, else visual pass (14 turns) | up to 2 × (a fresh **critic** with eyes → a **revise** pass), then the same smoke → repair |
| gates | containment, content gate, smoke — production's, in production's order | the same |

The baseline is [PRODUCTION.md](PRODUCTION.md) reproduced pass for pass; read that before changing
`run-arm.sh`. It is the thing under test, so a "fix" to it invalidates every
comparison.

The challenger's design comes from the complaint history (`complaints/` in the
session that built this; summarised here). Of 117 complaints about first builds,
**29% would show in one screenshot** (subject off-screen, a chart that says
something false, "nothing renders") and **24% need someone to drive the page or
watch it** (pieces 10× too fast, inverted pan, button hold selects text). Eyes
target those. Neither arm can fix the other 47% (refusals, misreadings, missing
network) — a known ceiling on what this can show.

Eyes is deliberately not Bash: the runner holds the subscription credential, and
the requests come from strangers. It is an MCP server that can do nothing but
load, screenshot and drive the tenant directory, served by
`scripts/lib/headless.mjs`'s `serveTenant` (production CSP + error collector).

## The requests

`requests/` holds 20 held-out first builds from `.github/lab-requests/` history:
8 minormobius, 12 from other requesters, chosen for known first-build faults and
variety. Each records its source commit. Nine are **reconstructed**: the file's
only surviving version is a later turn, so the task is the first-turn text
recovered from the thread banner (`_source.reconstructed`). `tube-tetris` runs as
`tube-stacker`: today's content gate refuses the trademark in the slug, and
production renamed it the same way.

The build job merges `claude/lab-www` **as it stood at the request's time** and
deletes the site's own directory, so neither arm sees the published answer or a
profile that learned from later builds. The factory branch itself is today's:
this measures a change against the pipeline as it is now.

## Running

Commit `bakeoff/buildabot/RUN` on `claude/friends-project-planning-cags5l` (the only
trigger of `.github/workflows/buildabot-ab.yml`):

```json
{ "runId": "ab-01", "requests": ["atlink", "tube-stacker"], "note": "why" }
```

Omit `requests` for all 20. One job per (request, arm), six at a time. Results
go to an orphan `buildabot/<run-id>` branch (`assemble.mjs`): `sites/pNN-a|b/`,
`pairs.json` (what the ballot shows), `mapping.json` (**the key**), `builds/`
(transcripts, critiques, screenshots, meta), `report.md` (unblinded).

Locally, from a factory worktree: `RIG=<this checkout> CLAUDE_BIN=<claude or a stub>
bash run-arm.sh <arm> <request.json> <out>`.

## The vote

Pairs are hosted at `imp.mino.mobi/ab/<run>/` behind an opaque-origin sandbox
(see `imp/CLAUDE.md`), and voted on a private claude.ai page with a db. The bar,
**fixed before any pair was seen**: the challenger wins **15 of 20** pairs (ties
count half). Below that, the harness change does not earn a production change.
`lab-build.yml` is not touched unless it clears the bar.

## Known limits

- One draw per arm per request. Build variance is large (the Imp build task saw
  0.34 → 0.56 means on repeats); 20 pairs is the sample, not 20 truths.
- The voter is one person with taste, which is the point, and also the limit.
- The challenger costs more wall-clock and tokens; `report.md` states both, so a
  win can be weighed against its price.
- Claude Code is unpinned in production and here; `meta.json` records the version.

# hoop — CLAUDE.md (the GAME wing · main site)

You are working on **hoop**, the game wing and **main site** of the O'Neill cylinder
modelling package at `hoop.mino.mobi`. Since the 2026-07 wrap-up this surface is
deliberately SMALL: **one live version (`v109/`), mirrored at the domain root**, plus the
engine and wings it imports. Everything older — the first-pass `@`-room forum game, the
early engine passes `v2`–`v8`, and the frozen snapshots `v090`–`v108` — was exfiltrated to
**[hoop-archive](../hoop-archive)** (`hoop-archive.mino.mobi`); this worker 301-redirects
any archived path there. The full pre-cut history (including the long version-by-version
CLAUDE.md) lives in git history and on `mino.mobi/hoop-history/`.

## The mirror (how the root works)

`worker.js` serves the current version at the domain root: any path that isn't a kept
surface dir is tried as `/v109/<path>` first, and a miss there 301s to the archive. The
bare aliases (`/quests`, `/plan`, `/over`, `/over/demo`, `/garden/plot`, `/alch`,
`/smith`) and the `/v109/{records,feed,spine}` rewrites resolve into `v109/`. **To promote
a future v110:** `cp -r v109 v110`, rewrite `/v109/`→`/v110/` and `hoop:v109:`→`hoop:v110:`
in the copy, flip `LIVE` + the version blocks in `worker.js`, then move the outgoing
version to `hoop-archive/` (with frozen copies of any shared dirs whose imports changed) —
one live version stays in mainline.

## What's in the tree

| Dir | What it is |
|---|---|
| `v109/` | **the live game** — v108 (the WEAVE-SHELVED pass) plus the FRAME-RATE pass: a fully-revealed chunk's fog tile is flagged `empty` and never blitted, near-chunk fog re-bakes (the blur is the dear part) are skipped when the cell-visibility signature is unchanged, and an adaptive-resolution governor steps the drawing buffer down (min 0.65×) on sustained sub-45fps walking and back up when fast. Everything else is v108's: deck stack nave → four-chunk upper rind → lower rind; seeded quest spine (`story/weave.js`), tier-2 murder mystery, chamber errands, THE SEVEN design alphabet (`planets.js`), grown planetary alignment, always-findable keepers. Own tests in `v109/test/`. |
| `v099/` | **the engine snapshot** — nave/rind/forge/chunkroller import its `v8/chunkgen.js`, `v8/manager.js`, `econ/econ.js`, `rooms.js`, `skin.js`, `stats.js` at runtime. Don't delete; don't develop it either. |
| `nave/`, `rind/` | floor builders + design views (`/nave`, `/rind`); `v109/index.html` imports `nave/nave.js` + `rind/rind.js`. |
| `forge/` | the industrial-metabolism research wing (`/forge/*` pages); `v109/home.js` imports `engines.js`/`infinitefoam.js`. |
| `chunkroller/`, `paint/`, `econ/` | design tools: chunk roller (`/chunkroller`), rendering/desire-line-roads playground (`/paint`), economies-as-ecosystems sketchpad (`/econ`). paint is imported by forge + econ. |
| `story/` | the worker-side story lane: `llm/` adapter (disabled stub without `GEMINI_API_KEY`), `sidequest.js`, `director.js`, `import.js`, `bible.md`, `anchor-briefings.json`. |
| `vendor/` | **verbatim copy** of `packages/oauth-client/auth.js` — re-sync from source, never fork. |
| `docs/` | the world-side documentation at `/docs`. Links to archived versions resolve through the redirects. |
| `lexicons/` | the ATProto lexicon JSON (`com.minomobi.hoop.*`). |
| `scripts/` | live tooling: `prove-solvable.mjs` + `prove-weave.mjs` (both proving the v108 story engine against the live morphyx pool), `seed-anchor-briefings.mjs`, `seed-story-pool.mjs`. The v097-era pool seeder moved to `hoop-archive/scripts/`. |
| `test/` | root tests for the kept wings (story, econ, paint). Tests of archived code moved to `hoop-archive/test/`. |

## Run / test (all run from the sandbox; deploy does not)

```bash
for t in hoop/test/*.selftest.mjs; do node "$t" || echo "FAIL $t"; done
for t in hoop/v109/test/*.selftest.mjs; do node "$t" || echo "FAIL $t"; done
node hoop/scripts/prove-solvable.mjs        # prove the LIVE morphyx pool against the v109 oracle
node hoop/scripts/prove-weave.mjs --sweep 100   # prove seeded casts progressable per world seed
```

`nave/`, `rind/`, `forge/`, `chunkroller/` each carry their own `test/` dirs too.

## State model — two tiers (the /mmo pattern)

- **Hot / ephemeral → HoopRoom DO** (`worker.js`): live positions over `/ws`, in-memory,
  identity borrowed from `auth.mino.mobi/api/me`. (v109 itself doesn't open `/ws` — the DO
  predates it and stays for compatibility; the archive runs its own room.)
- **Cold / durable → ATProto lexicons** (`com.minomobi.hoop.*`), written to each player's
  own PDS via the shared auth worker. Saves are `hoop:v109:`-namespaced localStorage +
  PDS records.

## Deploy

- Push `hoop/**` on `main` or the owning branch (see `deploy-registry.json`, surface
  `hoop`) → `deploy-hoop.yml` runs `wrangler deploy` (worker + assets + HoopRoom DO
  migration) and syncs `GEMINI_API_KEY` if set. The sandbox cannot deploy; push and let
  the Action run. **Verify the log binds `hoop.mino.mobi (custom domain)`** — green is
  not proof. Then verify the root serves the v109 game and an archived path (e.g.
  `/v100/`) 301s to `hoop-archive.mino.mobi`.
- The archive deploys separately: `deploy-hoop-archive.yml`, surface `hoop-archive`.

## Invariants — do not break

1. **The engine is deterministic.** `(seed, chunkCoord, genome)` → identical rooms on
   every machine and across ATProto repos. No unseeded randomness in generation.
2. **Presence is never a lexicon.** No permanent firehose record per footstep — the DO is
   the only home for live positions.
3. **`vendor/auth.js` is a verbatim copy** of `packages/oauth-client/auth.js`. Re-sync,
   don't fork.
4. **`v099/` is frozen infrastructure.** The wings import it at runtime; changing it
   changes the nave/rind/forge pages AND the archive's expectations. If engine work is
   needed, it happens inside the live version, not in v099.
5. **The archive is a museum.** Nothing in `hoop-archive/` is a dependency of this
   surface; never import from it.

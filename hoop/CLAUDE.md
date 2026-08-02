# hoop — CLAUDE.md (the GAME wing · main site)

You are working on **hoop**, the game wing and **main site** of the O'Neill cylinder
modelling package at `hoop.mino.mobi`. Since the 2026-07 wrap-up this surface is
deliberately SMALL: **one live version (`v110/`), mirrored at the domain root**, plus the
engine and wings it imports. Everything older — the first-pass `@`-room forum game, the
early engine passes `v2`–`v8`, and the frozen snapshots `v090`–`v109` — was exfiltrated to
**[hoop-archive](../hoop-archive)** (`hoop-archive.mino.mobi`); this worker 301-redirects
any archived path there. The full pre-cut history (including the long version-by-version
CLAUDE.md) lives in git history and on `mino.mobi/hoop-history/`.

## The mirror (how the root works)

`worker.js` serves the current version at the domain root: any path that isn't a kept
surface dir is tried as `/v110/<path>` first, and a miss there 301s to the archive. The
bare aliases (`/quests`, `/plan`, `/over`, `/over/demo`, `/garden/plot`, `/alch`,
`/smith`) and the `/v110/{records,feed,spine}` rewrites resolve into `v110/`. **To promote
a future v111:** `cp -r v110 v111`, rewrite `/v110/`→`/v111/` and `hoop:v110:`→`hoop:v111:`
in the copy, flip `LIVE` + the version blocks in `worker.js`, then move the outgoing
version to `hoop-archive/` (with frozen copies of any shared dirs whose imports changed),
give it the archive's version blocks and hand it the bare aliases (it becomes the newest
archived version), and repoint `scripts/prove-*.mjs` at the new dir — they import the live
version's `story/` and are the one thing outside `worker.js` that names it. One live
version stays in mainline.

**Every page the mirror serves at a non-`/vNNN/` URL must carry `<base href="/vNNN/…/">`,
and that includes `v110/index.html` itself** — it is the one page served at *two* URLs
(`/v110/` and `/`). Without the base tag the root copy resolves `./story/…`, `./forge/…`
and `./paint/…` against `/`, where the `KEPT` list in `worker.js` hands them to the
same-named *mainline* dirs — `/story/` is the worker-side lane, not the game's — so the
root 404s ~17 modules and silently serves 7 more from the wrong copy while `/v110/` stays
perfectly fine. The `/vNNN/`→`/vNNN+1/` rewrite in the promotion recipe above updates the
base tag with everything else; just don't drop it. Check with:
`curl -s https://hoop.mino.mobi/ | grep '<base'`.

## What's in the tree

| Dir | What it is |
|---|---|
| `v110/` | **the live game** — v109 (the frame-rate pass: empty-fog blit skip, fog re-bake signature, adaptive-resolution governor) plus the KEEPER-STACKING fix and the dev upper-rind start. Two keepers could collide on `hash % pool.length` and take the same chamber room, where `residentAt` gives the click to whichever body is nearer and the other keeper — often a gate-setter — is unreachable; `story/promote.js`'s `pickKeptRoom` now reserves every room a living keeper holds, and a putter keepout separates the pair when a thin chamber forces sharing. Everything else is v109's: deck stack nave → four-chunk upper rind → lower rind; seeded quest spine (`story/weave.js`), tier-2 murder mystery, chamber errands, THE SEVEN design alphabet (`planets.js`), grown planetary alignment, always-findable keepers. Own tests in `v110/test/`. |
| `v099/` | **the engine snapshot** — nave/rind/forge/chunkroller import its `v8/chunkgen.js`, `v8/manager.js`, `econ/econ.js`, `rooms.js`, `skin.js`, `stats.js` at runtime. Don't delete; don't develop it either. |
| `nave/`, `rind/` | floor builders + design views (`/nave`, `/rind`); `v110/index.html` imports `nave/nave.js` + `rind/rind.js`. |
| `forge/` | the industrial-metabolism research wing (`/forge/*` pages); `v110/home.js` imports `engines.js`/`infinitefoam.js`. |
| `chunkroller/`, `paint/`, `econ/` | design tools: chunk roller (`/chunkroller`), rendering/desire-line-roads playground (`/paint`), economies-as-ecosystems sketchpad (`/econ`). paint is imported by forge + econ. |
| `story/` | the worker-side story lane: `llm/` adapter (disabled stub without `GEMINI_API_KEY`), `sidequest.js`, `director.js`, `import.js`, `bible.md`, `anchor-briefings.json`. |
| `vendor/` | **verbatim copy** of `packages/oauth-client/auth.js` — re-sync from source, never fork. |
| `docs/` | the world-side documentation at `/docs`. Links to archived versions resolve through the redirects. |
| `lexicons/` | the ATProto lexicon JSON (`com.minomobi.hoop.*`). |
| `scripts/` | live tooling: `prove-solvable.mjs` + `prove-weave.mjs` (both proving the v110 story engine against the live morphyx pool — they import `../v110/story/`, so a promotion must repoint them), `seed-anchor-briefings.mjs`, `seed-story-pool.mjs`. The v097-era pool seeder moved to `hoop-archive/scripts/`. |
| `test/` | root tests for the kept wings (story, econ, paint). Tests of archived code moved to `hoop-archive/test/`. |

## Run / test (all run from the sandbox; deploy does not)

```bash
for t in hoop/test/*.selftest.mjs; do node "$t" || echo "FAIL $t"; done
for t in hoop/v110/test/*.selftest.mjs; do node "$t" || echo "FAIL $t"; done
node hoop/scripts/prove-solvable.mjs        # prove the LIVE morphyx pool against the v110 oracle
node hoop/scripts/prove-weave.mjs --sweep 100   # prove seeded casts progressable per world seed
```

`nave/`, `rind/`, `forge/`, `chunkroller/` each carry their own `test/` dirs too.

### Dev shortcuts (all gated on dev mode — visit `?dev=1` once; `?dev=0` clears)

The `#dbg` "story status" panel grows three buttons in dev mode:

| Button | What it does |
|---|---|
| ✦ set this tier's keeper flags | fills the ACTIVE anchor's gates so you can walk back and turn in |
| ▼ fast-forward to the close | clears every tier + Drift + answer, drops you in the Signal Chamber |
| ▼ start at the Upper Rind | clears tiers 1–2 only, builds the wards, sinks the rind and lands you on its hub with **tier 3 active** — the floor to test keeper placement on |

`?dev=1&start=rind` does the last one straight from a cold URL on a fresh world (also
`start=upper` / `start=upper_rind`). It boots past the portal like `?play=1`, then takes the
same code path as the button, so what you land in is what walking down the shaft gives you.

## State model — two tiers (the /mmo pattern)

- **Hot / ephemeral → HoopRoom DO** (`worker.js`): live positions over `/ws`, in-memory,
  identity borrowed from `auth.mino.mobi/api/me`. (v110 itself doesn't open `/ws` — the DO
  predates it and stays for compatibility; the archive runs its own room.)
- **Cold / durable → ATProto lexicons** (`com.minomobi.hoop.*`), written to each player's
  own PDS via the shared auth worker. Saves are `hoop:v110:`-namespaced localStorage +
  PDS records.

## Deploy

- Push `hoop/**` on `main` or the owning branch (see `deploy-registry.json`, surface
  `hoop`) → `deploy-hoop.yml` runs `wrangler deploy` (worker + assets + HoopRoom DO
  migration) and syncs `GEMINI_API_KEY` if set. The sandbox cannot deploy; push and let
  the Action run. **Verify the log binds `hoop.mino.mobi (custom domain)`** — green is
  not proof. Then verify the root serves the v110 game and an archived path (e.g.
  `/v100/`) 301s to `hoop-archive.mino.mobi`.
- The archive deploys separately (`deploy-hoop-archive.yml`, surface `hoop-archive`) but currently shares
  THIS branch, so one push ships both — which is what a promotion needs, since the outgoing version leaves
  mainline and lands in the museum in the same commit.

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

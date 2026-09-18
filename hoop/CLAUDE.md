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
| `scripts/` | live tooling: `pull-world.mjs` (re-form the bundled world around the current content run — see below), `reactivate-anchors.mjs` (put the campaign spine back in the live pool), `prove-solvable.mjs` + `prove-weave.mjs` (both proving the v110 story engine against the live morphyx pool — they import `../v110/story/`, so a promotion must repoint them), `seed-anchor-briefings.mjs`, `seed-story-pool.mjs`. The v097-era pool seeder moved to `hoop-archive/scripts/`. |
| `test/` | root tests for the kept wings (story, econ, paint). Tests of archived code moved to `hoop-archive/test/`. |

## Content runs — and the spine graft

The story pool is hoopy's, not ours. He regenerates it in **runs**: a run publishes a fresh set of
`com.minomobi.hoop.story.content` records to the service repo (morphyx,
`did:plc:yivyyp54vddf7qf2lpsikhe4`) and **soft-deletes the previous set in place** — the old records
stay in `listRecords` with `status: 'retired'`. `servePool` drops those tombstones, so the game
follows the newest run automatically. Two things do not follow automatically:

- **The four LOAD-BEARING ANCHORS** (Olo Vashti · Factor Solen · Sevin · Luna) are the campaign. Every
  keeper in the corpus sets a gate flag; the anchors are the only records that *consume* one, via a
  turn-in choice that sets `flag.deck.<deck>.cleared`. **The 2026-09-16 run regenerated 781 keepers
  setting all 23 gates and did not republish the anchors** — so the live pool had every gate in the
  world and nothing to turn one in at (`proveProgression` → `no_anchors`, 0/100 seeds progressable),
  while the new prose still names all four throughout.

  There are two answers to that, and they compose:

  | | |
  |---|---|
  | **Fix it at the source** | `scripts/reactivate-anchors.mjs` (+ `reactivate-hoop-anchors.yml`, dispatch only) writes the anchors back to the service repo as `status: 'active'` at their original rkeys. Prefer this when you can: the pool becomes self-describing, so hoopy's tooling, `/quests` and any future client see a whole world instead of one that needs our importer to be whole. It refuses to write unless the result proves progressable. **Done on 2026-09-18 — all four are live upstream again.** |
  | **Carry a net** | The anchors are kept in `v110/story/spine-anchors.js` and `servePool` grafts them back (`graftSpineAnchors`) — but **only while the live pool has no load-bearing anchor of its own**. With the four reactivated, the graft is **dormant**, verified: it adds 0 records and `graftSpineAnchors` returns its input unchanged. Keep it anyway. The *next* run will tombstone them again — that is what a run does — and the graft is what keeps the game playable between that run and someone noticing. |

  The graft **re-gates** the carried anchors against the gates *that* run actually sets, so a run that
  adds, drops or renames a gate stays solvable, and a scope a run sets nothing in keeps its authored
  gates so the oracle reports the hole instead of a tier that silently walks through. It also retires
  our own `seed-anchor-briefings` splices: this run authors six fungible setters for every gate,
  including the two that used to have none. What `reactivate-anchors.mjs` publishes is exactly
  `spineAnchorsFor()` — the graft's own output — so the two can never disagree. (The reactivated
  records came back byte-identical to what the graft was serving.)
- **`v110/story/world_export.json`** is the offline fallback the client loads when the service repo is
  unreachable. Holding a previous run, it is a museum of records the live world has retired.

After a run lands, re-pull both and re-prove:

```bash
node hoop/scripts/pull-world.mjs --report   # census: live vs tombstoned, the run date, the anchors
node hoop/scripts/pull-world.mjs            # rewrite spine-anchors.js + world_export.json
node hoop/scripts/prove-solvable.mjs --strict && node hoop/scripts/prove-weave.mjs --sweep 200
node hoop/scripts/reactivate-anchors.mjs --dry   # if the census says any anchor is tombstoned
```

`--report` names each anchor `live` or `recovered`. If any reads `recovered`, the run dropped the
spine: the graft is holding the game up, and `reactivate-hoop-anchors.yml` (dispatch, `dry: true`
first) puts it back upstream. The sandbox cannot write to a PDS — that workflow is how you do it.

Gates are **fungible** — a run authors several setters per gate and the waypoint picks the nearest
placeable one — so the oracle judges a gate on its best candidate, not an arbitrary first. (That is why
the tier-2 mystery retiring its victim, who is also one of six setters of a ward gate, no longer reads
as a blocked campaign.)

Two things a run's sheer size breaks that its predecessors didn't:

- **Gates are fungible.** A run authors several setters per gate (this one: six) and the waypoint picks
  the nearest placeable one, so the oracle judges a gate on its **best** candidate, not an arbitrary
  first. Otherwise the tier-2 mystery retiring its victim — who is also one of six setters of a ward
  gate, five of them alive and seated — reads as a blocked campaign.
- **Never match a character by bare substring.** `pickBibleGuides` looked up the tier-1 guide with
  `name.includes('olo')`, and among 409 new names that is "Skerry, called the Col**olo**phon". It ranks
  now (a load-bearing anchor first, then a whole-word hit), and `guides.selftest` pins each guide to its
  tier's anchor by **id** rather than by the substring that caused the bug.

## Run / test (all run from the sandbox; deploy does not)

```bash
for t in hoop/test/*.selftest.mjs; do node "$t" || echo "FAIL $t"; done
for t in hoop/v110/test/*.selftest.mjs; do node "$t" || echo "FAIL $t"; done
node hoop/scripts/prove-solvable.mjs        # prove the LIVE morphyx pool against the v110 oracle
node hoop/scripts/prove-weave.mjs --sweep 100   # prove seeded casts progressable per world seed
```

Both must be clean against the live pool: `prove-solvable` PASSes in `--strict` (no force-place
bypass) and `prove-weave` takes every seed. A regression there usually means a new content run —
`pull-world.mjs --report` says so in one line.


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

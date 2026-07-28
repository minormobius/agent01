# hoop-archive — CLAUDE.md (the hoop museum)

You are working on **hoop-archive**, the frozen archive of the hoop game wing at
`hoop-archive.mino.mobi`. It exists so mainline **[hoop](../hoop)**
(`hoop.mino.mobi`) can stay small: hoop keeps the live game (v108 mirrored at
the domain root) plus its runtime closure; everything that predates it was
exfiltrated here in the 2026-07 wrap-up, and mainline 301-redirects any archived
path to this domain.

## What lives here

- **The first-pass room** at `/` — the original `@`-glyph forum game
  (`index.html` + `js/` + `css/`), where the map was the forum: every glowing
  node an ATProto-anchored conversation thread, live peers over `/ws`.
  `research.html` is its research dossier.
- **The early engine passes** `v2/`–`v8/` and **every frozen version snapshot**
  `v090/`–`v107/` — each independently served, records/feed/spine/quests/plan
  rewrites preserved in `worker.js`. The bare aliases (`/quests`, `/plan`,
  `/over`, `/alch`, `/smith`, `/garden/plot`) resolve to **v107**, the newest
  archived version.
- **Frozen copies of the shared dirs** the old versions import at runtime —
  `v099/` (the engine), `nave/`, `rind/`, `forge/`, `chunkroller/`, `paint/`,
  `vendor/`, `story/`, `lexicons/`. Same-origin copies so module imports work
  without CORS games. **Never evolve these here** — the living copies are in
  `hoop/`; these are snapshots of the day the archive was cut.
- `minigame/`, `over/` (the root-era overworld), `NAV.md`, the archived root
  tests (`test/`), and the retired seeding tools
  (`scripts/seed-hoop-pool.mjs`, `scripts/extract-hoopy-export.mjs` — the
  v097-era corpus pipeline; `.github/workflows/seed-hoop-pool.yml` points here).

## Rules

1. **This is a museum.** Content is frozen; the only edits that belong here are
   serving fixes (worker routes, redirects) and the occasional curation note.
   New game work happens in `hoop/`.
2. `/docs` and `/econ` redirect to mainline `hoop.mino.mobi` — they are living
   pages, deliberately not archived.
3. The worker keeps the guarded `/api/story/*` lane so archived versions
   (v096+) degrade gracefully; no `GEMINI_API_KEY` is synced here, so the
   adapter is the disabled stub and everything stays procedural.
4. The `HoopRoom` DO is this surface's own presence room (for the first-pass
   room's live peers) — separate from mainline hoop's.
5. Old players' `localStorage` saves lived on the `hoop.mino.mobi` origin and do
   not follow the redirect; archived versions start fresh here. Cold data in
   players' own PDS repos is unaffected.

## Deploy

Push `hoop-archive/**` on the owning branch (see `deploy-registry.json`) →
`.github/workflows/deploy-hoop-archive.yml` runs `wrangler deploy`. Verify the
log binds `hoop-archive.mino.mobi (custom domain)` — green is not proof.

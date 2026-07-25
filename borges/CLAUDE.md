# borges — borges.mino.mobi

<!-- SEEDED by scripts/gen-surface-docs.mjs from deploy-registry.json.
     This file is now HAND-OWNED — edit it directly; the script will not
     overwrite it. It is the instruction set for THIS surface. Repo-wide rules
     live in ../CLAUDE.md; the index of all surfaces is ../docs/SURFACES.md. -->

The Book of Sand. Seven robot crew aboard the Tabard tell an endless, deterministically-generated tale—each annotated with a full mythograph before the telling.

## Facts

| | |
|---|---|
| Surface | `borges` |
| Dir | `borges/` |
| Endpoint | `borges.mino.mobi` |
| Type | frontend |
| Owning branch | `claude/landing-projects-takeover-pKkmW` |
| Deploy | `.github/workflows/deploy-borges.yml` |
| Uses | — |
| Provides | — |

Machine-readable entry: [`deploy-registry.json`](../deploy-registry.json) → `surfaces[]` where `surface == "borges"`.

## Borges

**Live at**: `borges.mino.mobi`
**Stack**: Pure static HTML/JS (vanilla, no build step) + a thin routing Worker (assets binding)
**Deploy**: `.github/workflows/deploy-borges.yml` — `npx wrangler deploy` on push to `main` or `claude/pendragon-endless-book-*` / `claude/pendragon-next-source-*` touching `borges/**`. Provisions `borges.mino.mobi`. No D1, no AI, no secrets beyond the shared Cloudflare credentials.

An **endless book**, after Borges' *El libro de arena*. The frame: seven maintenance robots aboard the slow barque *Tabard*, each named for one of the seven wandering stars (the classical planets) and bearing its medieval planetary temperament + an alchemical metal + a ship-office that fits. They pass the endless night between galaxies telling tales in a medieval-English oral voice, remixing the old motifs and Propp structures **for laughs** (they have every story cold in their training); and because a machine is a structured thing, each **publishes a full mythograph to the ship's intranet — the Tabard — at a permalink before the telling**.

## How it works — and why it's the read/pendragon apparatus run forward

The book is **generated, not authored**: a seeded, combinatorial engine (`js/prng.js` mulberry32 + xmur3) so every page number `n` yields the same tale on any machine, for ever. That determinism is what makes a permalink (`/t/<n>`) meaningful and the mythograph postable *before* the telling. The page-number space is unbounded → the book is endless; Next/Prev/Random/goto walk it.

Crucially, each generated tale is shaped **limb-for-limb like the annotated tales on `read.mino.mobi`** (`tale.passages`, `characters{roles,cast}`, `propp{acts,moves,absent}`, `motifs{taletypes,classOrder,classes,list}`) so the **same** Propp story-graph, Thompson motif index, character-web, and force-directed **mythograph** renderers (ported from `read/<tale>/app.js`) light it up unchanged. The read/ apparatus is analysis (backward); borges is the same apparatus as a generator (forward). The "for-laughs" subversions — cross-cultural motif transplants, inverted Propp functions, absurd magical agents, order-scrambles — are flagged in the spec, mirroring read/'s `propp.absent` ("what the teller shook loose").

## The seven tellers (`js/tellers.js`)

Luna ☽ (silver, navigator/dream-logs), Mercury ☿ (quicksilver, signals/translator — the great remixer, highest `remix`), Venus ♀ (copper, green-deck gardens), Sol ☉ (gold, fusion-heart), Mars ♂ (iron, forge/hull-welder — terse hammer-strokes), Jupiter ♃ (tin, governor/justice), Saturn ♄ (lead, chronometer/cold-hull — numbers the tales). Each carries voice banks (proem/connect/signature/close) overlaid on a shared house voice, plus affinities steering culture, frame, Propp emphasis and motif classes.

## Key files

| File | Role |
|------|------|
| `index.html` | General Prologue: the voyage, the seven-teller gallery, the Tabard board (entry) |
| `tale.html` | Per-tale reader — 8 tabs: Telling / the Tabard (spec) / Desire (Greimas actantial diagram) / Cast / Character web / Story graph / Motifs / Mythograph. The telling also expands Parry–Lord oral set-pieces (`lexicon.js` THEMES: the arming, the feast, the lament…), listed in the Tabard spec |
| `js/lexicon.js` | Culture packs (12 cross-cultural wardrobes), Propp function library w/ oral realize-templates + `invert` variants, tale-type frames, Thompson motif atoms, archetype roles |
| `js/generate.js` | The engine: `n` → whole tale (teller, culture±graft, frame, cast, woven prose telling, multi-beat motifs w/ plant→payoff, flagged remixes) |
| `js/frame.js` | The meta-story: the immortalism meditation (the 12-facet "Argument"), the 21 teller-pairs, `interstitial(n)` (the "aboard the Tabard" card that traces a lunar-month wheel — waxing→full→waning→dark — of crew tension, perspective-aware when the night's teller is in the foregrounded pair), and the **meta-mythograph**: `FRAME_PROPP` (the frame's own Propp cycle — looping, with Transfiguration/Wedding/Death forbidden) + `FRAME_MOTIFS` (folklore classes in the immortalist register, mostly inversions). Each watch "nibbles" one frame beat (`frameBeat`). Deterministic from `n`. |
| `js/render.js` | Reader: ported read/ graph renderers + prose telling + interstitial card + Tabard spec + per-teller theming + endless nav |
| `worker.js` | `/t/<n>` & `/tale` → `tale.html`; the additive `/api/telling` live-render API (Gemini → atproto cache); else assets. Root-absolute asset paths so `/t/<n>` resolves |
| `lexicons/telling.json` | `com.minomobi.borges.telling` record schema — the frozen live telling, cached per `n` on a service PDS |

## Pitfalls / conventions

- **Determinism is load-bearing.** Don't introduce `Date.now()` / unseeded `Math.random()` into the *generator* (the nav's "random page" picker is the only allowed unseeded roll, and it just chooses which deterministic page to open). Breaking determinism breaks every permalink.
- **Root-absolute asset paths** in the HTML (`/css/…`, `/js/…`) — the pretty `/t/<n>` URL has a `/t/` base, so relative paths would 404.
- The engine attaches to `globalThis` (not just `window`), so it unit-tests in plain node — see `borges/README.md`.
- Generated tales reuse the read/ data shapes on purpose. If you change a renderer, keep parity with the read/ apparatus the user pointed at.

## Live telling (optional inference layer — additive, fully guarded)

On top of the canonical procedural telling, a model can **retell** a tale from the deterministic spec (the "glue"), frozen on first render so `/t/<n>` stays stable. **The site is fully functional with no inference** — every inference/atproto path is wrapped so it can never break asset serving or the procedural fallback.

- **Model**: Gemini 2.5 Flash (Google AI Studio free tier), called directly from `worker.js` (no CF AI binding). `BORGES.promptFor()` in `js/generate.js` (v3) builds the retell-faithfully prompt from the BONES (desire/cast/set-pieces) + the procedural draft + the teller's voice samples + a hand-authored EXEMPLAR (`js/exemplar.js`, the gold-standard telling of tale № 1, also served verbatim for `/t/1`).
- **Two passes**: the **telling** (`com.minomobi.borges.telling`, `{movements}`, schema `borges/lexicons/telling.json`) and the **banter** — a short live scene of crew dialogue before the telling, `BORGES.promptForBanter()` → `com.minomobi.borges.banter` (`{lines}`, schema `borges/lexicons/banter.json`). Both frozen per `n`, first-write-wins.
- **Cache = atproto** on the **morphyx** service account (`morphyxmino.bsky.social`, `did:plc:yivyyp54vddf7qf2lpsikhe4`), via the repo's shared `packages/atproto/pds.js` (`resolveHandle`/`resolvePds`/`PdsClient`). Reads unauthed; writes via session. Worker resolves DID+PDS at runtime from the handle.
- **Worker API** (additive, isolated by try/catch): `GET/POST /api/telling` and `GET/POST /api/banter`.
- **Secrets** (set via `wrangler secret put`, NOT committed): `GEMINI_API_KEY`, `BORGES_PDS_HANDLE` (= `morphyxmino.bsky.social`), `BORGES_PDS_PASSWORD` (app password). `BORGES_PDS_URL`/`BORGES_PDS_DID` are optional overrides (resolved otherwise). Until set, `/api/*` returns "not configured" and the client stays procedural.
- **Seeding the gold standard**: `scripts/seed-borges-tellings.mjs` writes the hand-authored exemplar (and any frozen tellings) to morphyx's repo via `PdsClient`; workflow `seed-borges.yml` runs it with the `BLUESKY_MORPHYX_*` secrets (`--dry` supported). Tale № 1 is also served from `js/exemplar.js` client-side regardless.
- **Cannot be tested from the sandbox** (no Gemini/PDS network, no secrets) — verify on deploy. The procedural path IS testable and is the guaranteed fallback.

---


## Deploying

Pushes to `claude/landing-projects-takeover-pKkmW` or `main` that touch this surface's paths trigger [`.github/workflows/deploy-borges.yml`](../.github/workflows/deploy-borges.yml).
The sandbox cannot reach Cloudflare — **push to a trigger branch, don't `wrangler deploy` locally**.
Read [`docs/DEPLOYS.md`](../docs/DEPLOYS.md) first, especially the golden rule:
the `wrangler.jsonc` `name` must be the worker that owns the live custom domain,
or the deploy goes green while the site never changes.

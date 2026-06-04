# Repo structure — where everything lives

A monorepo of ~90 independently-deployed web properties under `*.mino.mobi`
(plus `minomobi.com`). One Cloudflare account, one git repo, one
[`deploy-registry.json`](../deploy-registry.json) tying surfaces to deploys.

## How to navigate to anything

For a surface named `X` (see the registry for the canonical list):

| you want… | look at… |
|---|---|
| its code | `X/` (the `dir` field in the registry) |
| its Cloudflare config | `X/wrangler.jsonc` (`name` = the worker; `routes` = the domain) |
| its deploy | `.github/workflows/deploy-X.yml` |
| its registry entry | `deploy-registry.json` → `surfaces[]` where `surface == "X"` |
| its live URL | the `endpoint` field (don't assume it's `X.mino.mobi` — e.g. `answers`→`ask.mino.mobi`) |

## Top-level layout

```
deploy-registry.json     ← SOURCE OF TRUTH: surface → resource → branch (see docs/DEPLOYS.md)
index.html               ← root landing page (the `var P` site catalogue + generated surface-map table)
wrangler.jsonc           ← root Pages project config (the ONLY Pages project; serves "." )
functions/               ← root Pages Functions (search.js, novelty.js, …)

<surface>/               ← most top-level dirs ARE surfaces: a site + its own wrangler.jsonc
                           e.g. poll/ rite/ airchat/ photo/ bakery/ g/ torus/ b/ io/ cat/ os/ …
                           pure-static bundled subsites (served at mino.mobi/<name>/) live here too:
                           cluster/ density/ echo/ judge/ novelty/ seek/ ternary/ flows/ music/ …

workers/                 ← backend workers (no UI of their own)
  auth/                  ← shared OAuth worker (auth.mino.mobi) — read CLAUDE.md OAuth section first
  feed/                  ← SimCluster feed generator (feed.mino.mobi)
  scores/                ← shared leaderboard (scores.mino.mobi)
  cron/ duffel-proxy/ fred-proxy/      ← internal helpers
  bsky-bot/ cards-mint/ cluster-batch/ ← "not actively managed" reference workers (unmanaged in registry)

packages/                ← shared, build-step-free JS libs (import these; don't reimplement)
  atproto/               ← pds.js / bsky.js / crypto.js  (ATProto identity, reads, vault crypto)
  oauth-client/          ← auth.js  (browser AuthClient for the shared OAuth worker)

scripts/                 ← tooling. Deploy pipeline: lint-deploy-registry / gen-deploy-triggers /
                           gen-surface-map / surface-mitosis. Plus illustrate/, sync-*, generate-*.
.github/workflows/       ← 45 deploy-<surface>.yml + content/provisioning/pipeline workflows
docs/                    ← memos: DEPLOYS.md, REPO-STRUCTURE.md (this), surface-mitosis.md, VISION.md, …
notes/                   ← research/brainstorm scratch (not operational)

modulo/ morphyx/ .well-known/   ← ATProto DID infra (.well-known/atproto-did) for @-handles
src/ time/posts/                ← Bluesky post pipeline (post_thread.py; pushing md here POSTS — danger)
```

## Categories of surface

- **Build-step (Tier 1):** `npm install && npm run build` → `./dist`, then deploy.
  React/Vite: `poll`, `photo`, `bakery`, `finance`, `org`, `wave`, `crm`, `zoom`,
  `os` (frontend), `audio` (monorepo).
- **Static worker (Tier 2):** `wrangler deploy` with `assets.directory`, no build.
  `g`, `torus`, `b`, `rite`, `cards`, `mega`, `pm`, `pokemon`, `wars`, `answers`,
  `labglass`, `fluoddity`, …
- **Pure static, bundled in root (Tier 3):** no own subdomain — served at
  `mino.mobi/<name>/` by the root Pages project (`cluster`, `density`, `echo`,
  `judge`, `novelty`, `seek`, `ternary`, `flows`, `crm`, `disk`(now under `b`)…).
  These **cannot** be deployed independently of each other.
- **Backend workers:** `workers/*` — see above.
- **The geometry pack** (`erdos`, `kakeya`, `capset`, `viazovska`, …) and similar
  single-file explainers are pure-static and ship with the root Pages deploy.

## The two things that are generated, not hand-edited

- **The surface-map table in `index.html`** — rebuilt from the registry by
  `scripts/gen-surface-map.mjs --write`.
- **`functions/search.js`** catalogue — rebuilt from the `var P` array in
  `index.html` by `scripts/generate-search-catalog.mjs`.

For *how* deploys work (the golden rule, gotchas, onboarding), see
[`DEPLOYS.md`](DEPLOYS.md).

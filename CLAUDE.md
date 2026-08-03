# minomobi — production operations

A monorepo of independently-deployed web properties on `*.mino.mobi` (plus
`minomobi.com`), one Cloudflare account, one git repo. This branch owns **site
health**: deploys work, pages load, workers respond, builds pass, headers are
right. Feature design and editorial work happen elsewhere and arrive here.

This file holds what is true for *every* surface. Anything specific to one
surface lives in that surface's own `CLAUDE.md`.

---

## Find anything

| To find… | Read… |
|---|---|
| every surface — what it is, where it lives, what deploys it | **[`docs/SURFACES.md`](docs/SURFACES.md)** (generated) |
| how one surface works | **`<dir>/CLAUDE.md`** |
| machine facts: deps, trigger paths, owning branch | [`deploy-registry.json`](deploy-registry.json) — source of truth |
| the deploy pipeline and its gotchas | [`docs/DEPLOYS.md`](docs/DEPLOYS.md) |
| the shape of the repo on disk | [`docs/REPO-STRUCTURE.md`](docs/REPO-STRUCTURE.md) |
| OAuth per-site status | [`docs/OAUTH.md`](docs/OAUTH.md) |
| splitting a surface, or moving a site between surfaces | [`docs/surface-mitosis.md`](docs/surface-mitosis.md) — `scripts/surface-mitosis.mjs` detects, `scripts/rehome.mjs` moves |

## The shape of a surface

A **surface** is one deployable thing. Every surface has the same five parts in
the same places, whatever it does — this is what keeps the repo navigable as it
grows:

| Part | Where | Holds |
|---|---|---|
| code | `<dir>/` | the site |
| config | `<dir>/wrangler.jsonc` | worker `name`, custom-domain `routes`, bindings |
| deploy | `.github/workflows/deploy-<surface>.yml` | build steps, migrations, secrets |
| registry entry | `deploy-registry.json` → `surfaces[]` | `dir`, `endpoint`, `type`, `branch`, `uses`, `provides`, `paths` |
| instructions | `<dir>/CLAUDE.md` | what it is, how it works, its quirks |

Two things that are *not* safe to assume: **`dir` is not the subdomain**
(`answers/` serves `ask.mino.mobi`), and **`endpoint` is not the worker name**.
Read the registry entry.

A surface's `uses` lists the shared backends it depends on (`atpolls-db`,
`auth.mino.mobi`, …). Before changing one of those, check its blast radius —
the dependents are tabulated at the foot of `docs/SURFACES.md`.

## How work ships

Work happens on `claude/*` feature branches. Those get assembled into a **merge
candidate** and merged to `main`; that is how pull requests are made here.

1. Find branches with commits ahead of `main`, most recent first. Ones that
   predate the last candidate but show thousands of commits "ahead" are stale —
   their content already landed; skip them.
2. Squash-merge each as one commit: `merge candidate: <branch> — <what it brings>`.
3. Regenerate the derived artefacts (below). Feature branches register
   themselves inconsistently; this is where that gets reconciled.
4. `node scripts/preflight.mjs` — must pass.
5. Push, open the PR, and state what could not be verified from the sandbox.

### Preflight

```bash
node scripts/preflight.mjs         # every invariant; ~4s + selftests for changed dirs
node scripts/preflight.mjs --fix   # regenerate what's stale, then re-check
node scripts/preflight.mjs --quick # skip selftests
```

Checks the registry invariant, that every generated file is current, that every
surface is discoverable and has a spec family and an instruction file, that no
work-facing host leaked into generated output, and the selftests. CI runs the
same command on PRs and `claude/**` pushes (`.github/workflows/preflight.yml`).

### Generated vs hand-edited

Generated — never edit by hand; `preflight --fix` rebuilds them all:

| Artefact | Script |
|---|---|
| `docs/SURFACES.md` | `gen-surface-index.mjs --write` |
| surface-map table in `index.html` | `gen-surface-map.mjs --write` |
| `functions/search.js` catalogue | `generate-search-catalog.mjs` |
| `spec/data.js` | `build-spec.mjs --write` |
| workflow `branches:` triggers | `gen-deploy-triggers.mjs --write` |
| `og.png` / `og.svg` | `generate-og-card.mjs` |
| missing `<dir>/CLAUDE.md` | `gen-surface-docs.mjs --write` |

Hand-edited: `index.html`'s `var P` catalogue and its curated `<li>`
descriptions; `spec/curated.js` (families, capsules); every `<dir>/CLAUDE.md`
after it is seeded; the registry's machine fields.

The root worker serves `assets.directory: "."` — **the whole repo root is
internet-facing.** Generators write through `scripts/lib/landing.mjs`, which
strips non-public hosts; preflight asserts the result. Any new generator that
writes into the repo must use it.

## Deploying

**A push to a surface's owning branch deploys it to production.** There is no
staging. A workflow fires when the branch matches its `on.push.branches` *and*
the change touches its `paths:`. Each surface has **exactly one** owning branch;
the registry is the authority, and `gen-deploy-triggers` writes the workflows
from it — so add your branch to the registry, not to the YAML.

**`main` DOES NOT DEPLOY ANYTHING, and that is deliberate.** It used to be in
every surface's list, which made merging to main a deploy event for every
surface the merge touched — safe only while main holds everything those surfaces
serve. It does not: `lab/www/`'s tenant sites live on `claude/lab-www` and main
has none of them, so merging and firing `deploy-lab` from main would have
republished the surface with two of four live sites missing, from a green run.
Workers Static Assets replaces the whole manifest; it does not merge.

So a merge to main is an **integration event** — history, review, and a trunk
that cannot be lost with a branch. `preflight` still runs there. Nothing
deploys. **The cost, plainly: a fix merged to main does not ship. Push it to the
surface's owning branch, which is what deploys it.**

> ⭐ **The golden rule.** A surface's `wrangler.jsonc` `name` must be the worker
> that owns the live custom domain, and that domain must appear in
> `routes: [{ pattern, custom_domain: true }]`. Otherwise `wrangler deploy`
> updates a stray `<name>.workers.dev` worker: the run goes green and the live
> site never changes. **Verify a deploy by confirming its log binds
> `<domain> (custom domain)`** — green is not proof. Detection and fix:
> [`docs/DEPLOYS.md`](docs/DEPLOYS.md) §4.

`workflow_dispatch` is on every deploy workflow for out-of-band runs. Build
commands, migration order and secrets live in the workflow — read it rather
than inferring; local `wrangler deploy` skips migrations and post-deploy hooks.

## Adding a surface

1. `curl -sI` the intended domain. Establish which worker owns it.
2. Write `<dir>/wrangler.jsonc` — `name` = that worker, `routes` = the domain.
3. Copy the closest existing `deploy-<surface>.yml`; they encode the build
   quirks and correct secret names.
4. Add the `surfaces[]` entry (including `branch` and `paths`); drop it from
   `unmanaged{}`.
5. Add it to `index.html`'s `var P` with a curated `<li>` description — a
   headless backend gets a capsule in `spec/curated.js` instead — and give it a
   family in `spec/curated.js`.
6. `node scripts/preflight.mjs --fix`. It seeds `<dir>/CLAUDE.md`; then write
   that file properly.
7. Push, and confirm the run binds the custom domain.

New lexicon? Add the collection to `WRITE_COLLECTIONS` in
`workers/auth/src/oauth/scope.ts` and redeploy the auth worker, so the metadata
ceiling stays a superset of what the site requests.

## Shared libraries

No build step, no dependencies. Import these instead of reimplementing.

| Package | Use for |
|---|---|
| [`packages/atproto/`](packages/atproto/) | `pds.js` identity + authenticated PDS ops; `bsky.js` public read APIs; `crypto.js` vault encryption |
| [`packages/dataviz/`](packages/dataviz/) | `stats.js` estimators, `charts.js` SVG-string charts. Run its known-answer selftest before touching it |
| [`packages/oauth-client/`](packages/oauth-client/) | `auth.js` — browser `AuthClient` for the shared OAuth worker |
| [`packages/pressure-lab/`](packages/pressure-lab/) | `lab.mjs` — node-only measurement scaffolding for the `/pressure/` games: policy spreads, tightness bands, the generator contract loop. Not a solver — read its README before adding a game |

Older projects each carry their own copy of the ATProto code. Don't bulk-rewrite
them; switch a project's imports when you're already in its ATProto layer.

Static sites can't import across directories, so they keep a byte-identical copy
in their own dir, kept honest by `scripts/sync-dataviz.mjs --check`. **Edit
`packages/`, never a copy.**

## Auth

There is one shared OAuth worker: `workers/auth/` at `auth.mino.mobi`
(confidential client — PKCE + DPoP + PAR + `private_key_jwt`). It holds the
tokens and proxies PDS calls through `/pds/*`, so browsers never hold a PDS
token. One sign-in works across every `*.mino.mobi` site via a domain cookie.

**Never reimplement OAuth in a new site.** To add one: allowlist the origin in
`workers/auth/src/index.ts`, import `AuthClient` from
`packages/oauth-client/auth.js`, and pass a **narrow scope** — only the
collections that site writes, so the consent screen is short:

```js
await auth.login(handle, { scope: 'atproto repo:com.minomobi.yoursite.thing' });
if (!auth.hasScope('com.minomobi.other.thing')) await auth.ensureScope(NEEDED); // from a user gesture
```

Scope is fixed at authorization, so identity SSO is instant everywhere while
write authorization is per-site and escalates on first write. Omitting `scope`
falls back to a broad union — avoid for new sites. Sites with their own BFF
worker are grandfathered: [`docs/OAUTH.md`](docs/OAUTH.md).

## Danger zones

- **`time/posts/**.md`** — a push to `main` here **posts to real Bluesky
  accounts**. Never put test markdown there.
- Workflows that write to a PDS, publish records, or commit data back to the
  repo: `publish-*`, `sync-*`, `score-*`, `fetch-*`, `bisk-digest`,
  `illustrate`. Read the workflow before triggering one.
- Shared D1 (`atpolls-db`) backs several surfaces. Migrations live in
  `poll/apps/api/migrations/`, numbered sequentially — never reuse a number; if
  two branches collide, the later merge renumbers.
- Deleting or renaming a worker, detaching a domain, and D1 creation are
  dashboard-only ([`docs/DEPLOYS.md`](docs/DEPLOYS.md) §7).

## This sandbox

Ephemeral container, repo cloned fresh, reclaimed after inactivity — **commit
and push anything worth keeping.**

Works: all file ops at any size, git, `mcp__github__*` tools, WebFetch/WebSearch,
node, cargo, bash, background jobs.

Does not work: `wrangler deploy` (no Cloudflare auth), live PDS/Bluesky writes,
remote D1 writes, and there is no `gh` CLI — use the GitHub MCP tools.

**The deploy workflows are your network.** If you want to `wrangler deploy` from
here, you want to push to a branch the workflow recognises.

## Debugging

| Symptom | Cause | Fix |
|---|---|---|
| deploy green, live site unchanged | `wrangler.jsonc` `name` ≠ domain owner | the golden rule — check the log binds `(custom domain)` |
| push didn't deploy | branch not in the workflow's triggers, or paths untouched | check the registry entry, then `gen-deploy-triggers --write` |
| worker 500s for no reason | compatibility-date drift | that surface's own `wrangler.jsonc` |
| D1 error about a missing column | migration not applied | `d1-migrate.yml`, or let the deploy workflow apply it |
| blank page needing SharedArrayBuffer | missing COOP/COEP | that surface's `_headers` |
| PWA won't install | bad `manifest.json` / service worker | validate both |
| ATProto auth fails | expired app password | regenerate in Bluesky settings |
| DID resolution fails | missing `.well-known/atproto-did` | verify the file and its DID |
| CI fails on a generated file | a generator wasn't re-run | `node scripts/preflight.mjs --fix` |

## Infrastructure

Cloudflare Pages + Workers, Durable Objects, D1, KV. DNS and email routing
(`tips@`, `editor@`, `modulo@`, `morphyx@minomobi.com`) on Cloudflare. Several
apps use a user's ATProto PDS as their backend, so we store nothing and pay
nothing for their data.

## Principles

1. **Read before changing.** The surface's own `CLAUDE.md` first.
2. **Minimal changes.** Fix what's broken. No drive-by refactors.
3. **Know what your push wakes up** before you push it.
4. **Green is not proof.** Verify the domain binding, the page, the endpoint.
5. **Facts go where they're used** — surface-specific knowledge into that
   surface's `CLAUDE.md`, not this file.
6. **Report honestly.** Say what you verified, what you couldn't, and what you
   left undone.

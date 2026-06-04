# Deploys — how everything ships

> **Source of truth: [`deploy-registry.json`](../deploy-registry.json).** This memo
> explains the system around it. If something here disagrees with the registry,
> the registry wins — fix this memo.

---

## 1. The model in one paragraph

Every **surface** (a deployable site or worker) maps to exactly **one Cloudflare
resource** and **one `deploy-<surface>.yml`** workflow, owned by **one feature
branch** (plus `main`). A push that touches a surface's `paths:` on an owning
branch deploys it — straight to production. There is **no staging**. The human
deploys off Claude feature branches directly; that is intentional, not a mistake
to "fix" by merging to main first.

```
deploy-registry.json   ──>  gen-deploy-triggers.mjs  ──>  .github/workflows/deploy-<surface>.yml
   (source of truth)         (syncs branch triggers)        (the actual CI deploy)
        │
        ├─>  lint-deploy-registry.mjs   (validates the invariant + burndown)
        └─>  gen-surface-map.mjs        (regenerates the table in index.html)
```

---

## 2. The registry (`deploy-registry.json`)

Top level: `trunk` (`main`), `hero` (the active feature branch every surface is
currently assigned to), `surfaces[]`, and `unmanaged{}`.

Each surface:

| field | meaning |
|---|---|
| `surface` | unique key; **must** match `deploy-<surface>.yml` |
| `dir` | the source directory the workflow deploys from |
| `endpoint` | the live URL(s) it serves |
| `type` | `frontend` / `backend` / `fullstack` |
| `branch` | the **one** feature branch that owns it (the invariant) |
| `uses` / `provides` | dependency edges (e.g. a site `uses` `auth.mino.mobi`) |
| `status`, `note` | human notes |
| `paths` | the workflow's `on.push.paths` (informational mirror) |

**The invariant** (enforced by the linter): every surface maps to exactly one
feature branch. A branch may own *many* surfaces. A surface owned by two
branches, or any wildcard (`claude/*`), is **forbidden** — that's how two branches
silently fight over one deploy.

### The three scripts

```bash
node scripts/lint-deploy-registry.mjs        # validate invariant, list deps, unmanaged count
node scripts/gen-deploy-triggers.mjs         # dry-run: show which workflow branch-blocks drift
node scripts/gen-deploy-triggers.mjs --write # rewrite deploy-*.yml branches: to [main, hero]
node scripts/gen-surface-map.mjs --write     # rebuild the surface-map table in index.html
```

`gen-deploy-triggers` only rewrites the `branches:` list — it leaves `paths:`,
`workflow_dispatch:`, and everything else alone. Run all three after any registry
edit; the linter must end with `✓ registry valid`.

---

## 3. Two deploy shapes: Workers vs Pages

**Almost every surface is a Cloudflare Worker with static assets** — `wrangler
deploy`, a `wrangler.jsonc` with `assets.directory` and a `routes` block. The
**only Pages project is the root** (`agent01`, the landing page + ~19 bundled
static subsites), which uses `wrangler pages deploy`.

This distinction matters because **`wrangler deploy` (Worker) and `wrangler pages
deploy` (Pages) hit completely different resources.** Pointing a Worker workflow
at a Pages-served domain (or vice-versa) "succeeds" while never touching the live
site. The root is Pages; treat everything else as a Worker unless you have proof
otherwise.

---

## 4. ⭐ THE GOLDEN RULE (the "zoom-bucket" bug)

> **The `name` in a surface's `wrangler.jsonc` MUST be the Cloudflare worker that
> owns the live custom domain — and the custom domain MUST be declared in the
> config as a `routes` entry.**

```jsonc
{
  "name": "poke",                 // == the worker bound to poke.mino.mobi
  "assets": { "directory": "." },
  "routes": [
    { "pattern": "poke.mino.mobi", "custom_domain": true }
  ]
}
```

**Why.** If the config `name` doesn't match the worker that holds the domain,
`wrangler deploy` happily creates/updates a *different* worker at
`<name>.workers.dev` and **the live subdomain never changes.** The deploy is
green; the site is stale. This bit us repeatedly — months-old "live" sites whose
Action had been faithfully deploying a stray twin:

| surface | was deploying (stray) | fixed `name` → | live domain |
|---|---|---|---|
| zoom | `mino-zoom` | `zoom` | zoom.mino.mobi |
| pokemon | `mino-poke` | `poke` | poke.mino.mobi |
| wars | `wars-minomobi` | `war` | war.mino.mobi |
| mega | `mega-minomobi` | `mega` | mega.mino.mobi |
| os | `pds-os` | `os` | os.mino.mobi |
| answers | `mino-answers` | `ask` | **ask.mino.mobi** (name ≠ dir!) |

**Always declare `routes: [{ pattern, custom_domain: true }]`.** It makes wrangler
*bind the domain on every deploy* (and disables the `workers.dev` route), so a
name mismatch can't silently strand the domain. Surfaces that declare it are
self-healing; surfaces that rely on a dashboard-attached domain are one rename
away from breakage.

### How to detect a mismatch (from outside the dashboard)
- Probe `https://<config-name>.<acct>.workers.dev/` **and**
  `https://<domain-label>.<acct>.workers.dev/`. **Both resolving = twin workers =
  mismatch.** (acct subdomain here is `majormobius`.)
- Read the deploy log: a healthy deploy prints `<domain> (custom domain)`. If it
  only prints `<name>.workers.dev` and no custom-domain line, the domain is not
  config-bound.
- **Don't assume the subdomain equals the directory name.** `answers/` is live at
  `ask.mino.mobi`; `labglass/` at `glass.mino.mobi`; `wars/` at `war.mino.mobi`.
  Probe, or check the dashboard's custom-domain list.

### How to fix
1. Set `wrangler.jsonc` `name` to the worker that owns the domain.
2. Add the `custom_domain` route.
3. Push; confirm the run logs `<domain> (custom domain)` bound.
4. Delete the orphan stray worker in the dashboard.

---

## 5. Workflow anatomy

All deploy workflows trigger on `[main, <hero>]` + `workflow_dispatch`, scope to
the surface's `paths:`, and pass `CLOUDFLARE_API_TOKEN` / `CLOUDFLARE_ACCOUNT_ID`.
Shapes:

- **Static worker** (assets, no build) — `deploy-clock.yml` is the template:
  `checkout → npx wrangler deploy` with `working-directory: <dir>`.
- **Build worker** (Vite → `./dist`) — `deploy-bakery.yml` is the template:
  `checkout → setup-node → npm install → npm run build → npx wrangler deploy`.
- **Monorepo** — `poll` (build order `shared → web → api`), `audio` (`npm run
  build` then `wrangler deploy -c apps/api/wrangler.toml`; web's vite `outDir`
  must equal the api config's `assets.directory`).
- **Staged assets** — `g` and `torus` `cp -r` chosen dirs out of `clock/` into
  `dist/` at build time (sources are **not** moved; additive). `b` hosts `disk`
  as a nested `b/disk/` subdir served by the one `b` worker.
- **Root Pages** — `deploy-root.yml`: `wrangler pages deploy . --branch=main`.
  Requires the project to be **Direct Upload (git integration DISCONNECTED)**, or
  CLI deploys land as previews and never seize the apex.

---

## 6. Gotchas (each one cost a debugging session)

- **Pages error `8000111` "invalid UTF-8 commit message".** `wrangler pages
  deploy` forwards the git commit message to the Pages API, which rejects
  multibyte chars (em-dashes). `deploy-root.yml` pins `--commit-message` to the
  SHA (ASCII). Only the root Pages project is affected.
- **Per-step vs job-level `working-directory`.** Some workflows set it on the job
  (`defaults.run`), some per step. Tooling/auditing must read the deploy *step's*
  own `working-directory`.
- **`workers.dev` disabling.** Declaring a `custom_domain` route disables the
  `workers.dev` route on the next deploy — expected, not an error.
- **The root bundle.** The root Pages project serves `.` and bundles ~19 static
  subsites at `mino.mobi/<name>/`. They **cannot** be deployed independently of
  each other; carving one out to its own subdomain is a deliberate operation.
- **Container worker.** `os/api` (`os-mino-api`) is a Cloudflare **Containers**
  worker — its `deploy-os-api.yml` is **`workflow_dispatch`-only and
  prerequisite-gated** so it never surprise-builds paid containers.

---

## 7. Dashboard-only operations (CI and the sandbox can't do these)

The Action deploys via an API token; it cannot change account/project topology.
These are the human's job:

- **Disconnect Cloudflare git integration.** Required for the root Pages project
  (Direct Upload). For Workers it's usually nothing to do — they deploy via the
  API token, not a git connection — *unless* a worker has "Workers Builds"
  attached (then disconnect it so the Action is sole deployer).
- **Attach / detach custom domains**, and **delete orphan workers** left behind by
  a rename (the zoom-bucket strays).
- **Provision** KV namespaces, R2 buckets, Cloudflare Containers; **set worker
  secrets** (`wrangler secret put`).
- **Remote D1 migrations** run in Actions (or `d1-migrate.yml`), never from the
  sandbox.

---

## 8. Onboarding a new surface

1. **Probe the real live domain** (`curl -sI`). Do **not** assume `dir == subdomain`.
2. Identify the shape (static / build / monorepo / pages) and the **worker name
   that owns the domain**.
3. Write `wrangler.jsonc`: `name` = that worker, `routes` = the custom domain.
4. Add `deploy-<surface>.yml` from the matching template.
5. Add the `surfaces[]` entry; remove it from `unmanaged{}`.
6. `lint` + `gen-deploy-triggers --write` + `gen-surface-map --write`.
7. Push; **verify the run binds `<domain> (custom domain)`** — green alone is not
   proof (see the golden rule).

---

## 9. Current state (keep this honest)

- **44 managed surfaces**, linter clean, triggers in sync.
- **Unmanaged (4):** `os/api` (container, dispatch-only script ready), and the
  three "not actively managed" reference workers `workers/bsky-bot` (KV
  unprovisioned), `workers/cards-mint`, `workers/cluster-batch`.
- **Orphan workers to delete** (renamed away; the Action no longer touches them):
  `mino-zoom`, `mino-poke`, `wars-minomobi`, `mega-minomobi`, `pds-os`,
  `mino-answers`, `clock-minomobi`, `mino-disk`, `mino-atmosphere`.
- **Deferred dashboard steps:** disconnect git on the root Pages project; detach
  `atmosphere.mino.mobi`; redirect `clock.mino.mobi` → `g.mino.mobi` then delete
  the stale `clock` worker.

See also: [`surface-mitosis.md`](surface-mitosis.md) (splitting an overloaded
surface into daughters) and [`REPO-STRUCTURE.md`](REPO-STRUCTURE.md) (where
everything lives).

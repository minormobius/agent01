# Deploys — how everything ships

> **Source of truth: [`deploy-registry.json`](../deploy-registry.json).** This memo
> explains the system around it. If something here disagrees with the registry,
> the registry wins — fix this memo.

---

## 1. The model in one paragraph

Every **surface** (a deployable site or worker) maps to exactly **one Cloudflare
resource** and **one `deploy-<surface>.yml`** workflow, owned by **one feature
branch** — and `main` is NOT one of them (see the root `CLAUDE.md`; merging to
main is an integration event, not a deploy). A push that touches a surface's `paths:` on an owning
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

### ⚠️ `mino.mobi` is AT the custom-domain cap — read this before adding one

A Worker Custom Domain is not free. There are **100 per zone**, and the zone is
full. Measured 2026-09-22, deploy-bsky run #43, adding `dweet.mino.mobi`:

```
✘ Trigger configuration for "bsky" was only partially updated:
    You have exceeded the limit of 100 Workers custom domains
    on zone 'mino.mobi'  [code: 100122]
```

**The failure mode is nasty**, and it is the opposite of the golden rule above:
the bind happens at the TRIGGER step, *after* the assets upload. So the run goes
**red while the new assets are already live**, and every subsequent push stays
red for as long as an unbindable route sits in the config. A half-applied deploy,
not a no-op.

(83 of this repo's `wrangler.jsonc` files declare `custom_domain`; each spends
one of the 100. That is the budget.)

**Two ways out, and they are not equivalent:**

**1. Prune stale slots.** Custom domains outlive the workers that made them —
renames, abandoned surfaces, `op: create` entries that never shipped. Reported
from a sibling project that hit this in July: 64 of their slots were stale.
Dashboard-only (§7). This is the cheapest fix and it is probably the right first
move here.

**2. Claim the hostname with a PLAIN ROUTE instead** —
`{ pattern: "x.mino.mobi/*", zone_name: "mino.mobi" }` with **no**
`custom_domain`. Worker *Routes* are capped at **1000** per zone rather than
100, so the ceiling effectively disappears.

> **A plain route does NOT create DNS, and that is the whole catch.**
> `custom_domain: true` makes Cloudflare create the DNS record and manage the
> certificate. A route only *matches requests for a hostname that already
> resolves through Cloudflare's proxy*. Verified: `dweet.mino.mobi` has no DNS
> record at all (`getent hosts` returns nothing), so a route alone would give a
> **green deploy and a dead hostname** — precisely the failure the golden rule
> exists to catch, arriving through a different door.
>
> So the order is: **proxied DNS record first** (an `AAAA` to `100::` or a CNAME,
> orange-clouded — dashboard/API, §7), **then** the route, **then** verify the
> host actually serves. Do not add the route first and assume.

Nothing in this repo uses `zone_name` yet (0 of 83), so the first surface to try
it is doing something new — verify the hostname end to end rather than trusting
the green run.

The caps themselves (100 custom domains, 1000 routes) are Cloudflare's published
per-zone limits; the 100 is confirmed by the error above, the 1000 is taken from
the docs and has not been tested here.

#### `zone_name` does not move a hostname out of the zone

This is worth stating flatly because the intuition runs the other way. Asked
directly: *does converting `bsky.mino.mobi` to a route mean it no longer belongs
to the `mino.mobi` zone?*

**No — and if anything it is the reverse.** `zone_name` is not a change of
ownership. It is how wrangler tells the API *which zone a route belongs to*, and
a route is a thing that exists **inside** a zone; Cloudflare's own docs describe
routes as adding "Workers functionality to your existing proxied hostnames, in
front of your application server". Both forms live in `mino.mobi`. What actually
differs is which of them owns the DNS:

| | Custom Domain | Plain Route (`zone_name`) |
|---|---|---|
| DNS record | **Cloudflare creates and manages it** | **you must already have one**, proxied |
| certificate | issued for you | the zone's existing coverage |
| the Worker is | "treated as an origin" | a proxy in front of an origin |
| refuses to attach if | a CNAME already exists on the hostname | — |
| per zone | **100** | **1000** |

The grain of truth behind the intuition is that a Custom Domain's hostname *is*
special-cased — the Worker becomes the origin, so it is not resolved the way an
ordinary proxied record is, and Cloudflare refuses to create one on a hostname
that already has a CNAME. Converting **to** a plain route puts the hostname back
under ordinary zone handling, it does not take it out.

#### Can GitHub Actions declare it? Partly — and the missing half is DNS

| Step | Who can do it | What it needs |
|---|---|---|
| create/update the **route** | ✅ `wrangler deploy`, already in every workflow | the token's zone-level **Workers Routes: Edit** |
| create the **DNS record** | ✅ the Cloudflare API, ❌ **not wrangler** | the token's **DNS: Edit** on the zone |

`wrangler deploy` reads `routes` from `wrangler.jsonc` and creates them through
the API using `CLOUDFLARE_API_TOKEN`, which the workflows already hold. It has
**no DNS command at all** — Cloudflare's docs are explicit that "before you set
up a route, make sure you have a DNS record set up", and that without one
"any request to `myname.example.com` will result in the error
`ERR_NAME_NOT_RESOLVED`".

But DNS is an ordinary API call —
`POST /zones/{zone_id}/dns_records`, permission group **DNS Write** — so a
workflow step can absolutely make the record. **The dashboard is not required;
the right token scopes are.** Whether *this* repo's `CLOUDFLARE_API_TOKEN` has
them is a fact about one secret, and §7's "dashboard-only" list assumes the
narrow deploy token it was written for.

`.github/workflows/cf-capability-probe.yml` answers it. It is **read-only** —
every call is a GET. **First run, 2026-09-22:**

```
workers custom domains
  100 of the 100 slots on mino.mobi are taken  (0 free)
  99 distinct workers hold them
      2  airchat      airchat.mino.mobi, yapchat.mino.mobi
      1  …            (every other worker holds exactly one)
  (13 more on other zones, which have their own 100)

workers routes    YES  0 routes on this zone
dns               no   403 Authentication error
token verify      no   401   <- account-owned token; not a fault, see below
```

Three things that change the plan:

- **The zone is at exactly 100/100, not near it.** There is no headroom to
  find; the next custom domain needs a slot freed first.
- **There is no cheap prune.** Ninety-nine of the hundred slots belong to a
  worker that holds exactly one, so every reclaimed slot is a separate decision
  that a site is finished. Only `airchat` holds two.
- **The deploy token cannot touch DNS** — a plain read is `403 Authentication
  error`, so certainly no write. It *can* read Workers Routes, and there are
  **0** routes on the zone, so the route path is untried as well as unblocked.
  Making a hostname resolve today therefore needs either the dashboard or a
  token granted **DNS:Edit** on `mino.mobi`. Granting it is the smaller job and
  it is the one that makes the whole thing automatable.

(The `401` on `/user/tokens/verify` is **not** a fault. That endpoint only
answers for *user*-owned tokens; an account-owned one — which a deploy secret
usually is — fails it while working on every account and zone call. The lines
below it are the real evidence.)

It reports:

- how many of the 100 custom-domain slots on `mino.mobi` are taken, **grouped by
  worker**, so a prune can start with whoever holds the most;
- whether the token can list Workers Routes;
- whether it can read DNS at all, and whether `dweet.mino.mobi` really has no
  record;

and it says plainly what it cannot settle: **a read does not prove a write.**
Cloudflare's Read and Edit permission groups are separate, and the only honest
test of DNS:Edit is to create a record and delete it again — which is not a
thing to do to a production zone unasked. Run it from the Actions tab, or by
touching the workflow file.

So the shape of the answer: **yes, a workflow can do the whole job, provided the
token carries DNS:Edit and Workers Routes:Edit for `mino.mobi`.** If it does
not, the fix is a new token scope, not a person in the dashboard — and the probe
tells you which case you are in.

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
  the stale `clock` worker; delete the `cat-firehose` worker and detach
  `cat.mino.mobi` (see below).
- **Decommissioned:** `cat` (2026-07-28). The firehose image feed republished
  Bluesky images behind a metadata-only NSFW filter — self-applied labels plus a
  hashtag blocklist — which never sees the image, so unlabelled adult posts
  tagged `#cats` were indexed and shown. It was taken down rather than retuned:
  the posts that leaked are the ones with no marker to block, so a bigger
  blocklist cannot fix it. `cat/`, its workflow and its registry entry are gone,
  so nothing can deploy it. `cat-firehose` still answers `cat.mino.mobi` with an
  inert **410 Gone** worker (no D1, no Durable Object, no cron, no assets); the
  `CatListener` DO was deleted and `0034_cat_teardown.sql` dropped `cat_posts`
  and `cat_state`. **Do not rebuild this without image classification on ingest
  and a moderation queue before display.**

See also: [`surface-mitosis.md`](surface-mitosis.md) (splitting an overloaded
surface into daughters) and [`REPO-STRUCTURE.md`](REPO-STRUCTURE.md) (where
everything lives).

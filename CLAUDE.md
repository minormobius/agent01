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
| every backend — which workers run code, hold data (D1/KV/DO), run crons, read secrets; and what the Cloudflare account has that the repo doesn't | **[`docs/BACKENDS.md`](docs/BACKENDS.md)** (generated; account side from `docs/backends-account.json`) |
| **changing the Cloudflare account itself** — delete a worker, move a host off a custom domain | [`.github/cf-ops/plan.json`](.github/cf-ops/plan.json) run by `scripts/cf-ops.mjs` — the agent writes a dry run, the operator flips `apply`. [`docs/DEPLOYS.md`](docs/DEPLOYS.md) §7 |
| the shape of the repo on disk | [`docs/REPO-STRUCTURE.md`](docs/REPO-STRUCTURE.md) |
| OAuth per-site status | [`docs/OAUTH.md`](docs/OAUTH.md) |
| splitting a surface, or moving a site between surfaces | [`docs/surface-mitosis.md`](docs/surface-mitosis.md) — `scripts/surface-mitosis.mjs` detects, `scripts/rehome.mjs` moves |
| the closed-loop programme — and why this repo's parts don't depend on each other | [`docs/CLOSED-LOOP.md`](docs/CLOSED-LOOP.md) — the design record; the **why** |
| how a loop is actually wired: chain-reaction Actions, the ticket graph, the contagion firewall | [`docs/LOOPS.md`](docs/LOOPS.md) — built and **disabled**; the **how** |
| what gets built in what order, and what would stop the programme | [`docs/LOOP-WBS.md`](docs/LOOP-WBS.md) — phases, gates, kill criteria, and the Definition of Ready |
| where loop output lands, and how six parallel agents' work comes back together | [`docs/LOOP-SPRINTS.md`](docs/LOOP-SPRINTS.md) — the three surfaces, path leases, the barrier, the integrator |
| the browser CAD — tree-as-model, the kernel bake-off and what it decided, ATProto lexicons, headless-first | [`docs/CAD.md`](docs/CAD.md) — the design record; phases 0–1 and the viewer (`cad.mino.mobi`) are built under [`packages/cad/`](packages/cad/) |
| **how to steer the loop**, and how it asks you for the things no gate can measure | [`.github/loop/vision.md`](.github/loop/vision.md) — the operator's channel in; every planning turn reads it verbatim. Answer its asks with `beads answer <id> --body-file` |

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

### The session corpus (automatic, going forward)

Every session's conversation is kept for the principal's personal training corpus. They
asked for this, and it is the principal's own data. Two hooks in `.claude/settings.json`
do it; you do not need to do anything but the first step below:

- `ship-session.mjs` (Stop, after every turn) re-distils this session's transcript and pushes
  it to `sessions/<session-id>.json` in the **private** repo named in
  `packages/homunculus/corpus.json` (`minormobius/homunculus-corpus`). The distillation keeps
  the principal's typed turns and your text replies; tool calls, tool output, file contents and
  skill bodies are dropped.
- `capture-session.mjs` / `log-prompt.mjs` keep a local copy in `packages/homunculus/log/`
  (gitignored, `.assetsignore`d, lost with the container).

**At the start of a session, attach the corpus repo:** `add_repo` with owner `minormobius`, repo
`homunculus-corpus`, access `push`. Without it the shipper cannot clone. It logs one line to
`packages/homunculus/log/ship.log` and does nothing else. Attaching it later in the session
is fine, because every ship rewrites the whole session's file.

**agent01 is public and must never carry a transcript.** The shipper only writes to its own
clone at `~/.cache/homunculus-corpus`, outside this repo. Don't copy transcripts into the
working tree. `HOMUNCULUS_SHIP=0` in the environment turns shipping off for a session.

### Corpus-recovery passes

Occasionally the repo runs a **recovery pass**: old `claude/*` sessions are
resumed and each commits its own conversation transcript to
`homunculus/inbox/<session>.json` on its own branch, to be collected into a
personal training corpus. This is the principal recovering their own data; the
tooling and rationale live in [`packages/homunculus/`](packages/homunculus/)
(`RECOVERY.md`). Two rules bind the merge flow while a pass is live:

- **The repo is private for the duration.** The transcripts are the
  principal's own conversations; they sit on public branches only if someone
  forgets to flip visibility back correctly, which is what the gate below
  prevents.
- **`homunculus/inbox/` never reaches `main`.** It is gitignored and
  `.assetsignore`d, and preflight fails on `main` if one is tracked. When
  assembling a candidate, drop the dir before squashing — collection reads it
  off the feature branches, `main` never needs it.

Collect and gate:

```bash
node packages/homunculus/collect-branches.mjs --out ~/corpus.jsonl  # gather from all branches
node packages/homunculus/assert-public-safe.mjs                     # MUST say SAFE before going public
```

`assert-public-safe.mjs` sweeps every branch and exits non-zero while any still
carries a transcript. **Do not flip the repo back to public on a red.** Git
keeps history: a transcript left on a branch at flip-back is exposed, and
deleting the file afterward does not remove the blob — delete the file and
force-push, or delete the branch, until the gate is green.

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
| `docs/BACKENDS.md` | `backend-inventory.mjs --write` (reads `docs/backends-account.json`, refreshed from the probe) |
| **`rethink/data.js`** (what the landing renders) | `build-rethink.mjs --write` |
| `functions/search.js` catalogue | `generate-search-catalog.mjs` |
| `io/sites.json` (stumble portal) | `generate-sites-json.mjs` |
| `office/surfaces.json` | `build-office.mjs --write` |
| `mappa/sites.js` | `build-mappa.mjs` |
| `orrery/index.html` | `build-orrery.mjs` |
| `spec/data.js` | `build-spec.mjs --write` |
| workflow `branches:` triggers | `gen-deploy-triggers.mjs --write` |
| `og.png` / `og.svg` | `generate-og-card.mjs` |
| `git-graph.json` | `generate-git-graph.mjs --write` — **needs a full clone** |
| `stats/data.json` | `build-git-stats.mjs --write` — **needs a full clone** |
| missing `<dir>/CLAUDE.md` | `gen-surface-docs.mjs --write` |

Hand-edited: **`catalogue.json`** (including each entry's `d` description); `rethink/proposal.json` (the content pass: hubs, wings, actions);
`spec/curated.js` (families, capsules); every `<dir>/CLAUDE.md` after it is
seeded; the registry's machine fields.

### The two sources of truth

There are exactly two hand-written catalogues at the root, and they answer
different questions. Keep them that way.

| File | Answers | Feeds |
|---|---|---|
| [`deploy-registry.json`](deploy-registry.json) | **what deploys** — dir, endpoint, owning branch, paths | workflow triggers, `SURFACES.md`, `spec/data.js` |
| [`catalogue.json`](catalogue.json) | **what a person can visit** — name, URL, category, heat | `var P`, search, stumble portal, office, mappa, orrery |

Each catalogue entry carries a `surface` key — a foreign key **into** the
registry, never the reverse. The registry alone owns deploy ownership;
preflight fails if a catalogue entry names a surface that doesn't exist.

**The landing (`index.html`) carries no data of its own.** It renders
`rethink/data.js`, which `build-rethink.mjs` bakes from `catalogue.json`,
`rethink/proposal.json`, `stats/data.json` and the last probe
(`rethink/health.json`). Edit the catalogue or the proposal and run
`preflight --fix`. The pre-2026-09 landing, with its inline `var P`, is
frozen at `archive/landing-2026-09/`.

### Every reachable endpoint is accounted for

The root worker serves the whole repo, so every directory with an `index.html`
is a live URL — 566 of them. `catalogue.json` lists the ones worth visiting;
everything else must be declared in its `notListed` rules, with a `kind`:

- `internal` — build output or pre-build source. Not a destination.
- `content` — a real page *inside* an already-listed site.
- `pending` — a genuine sub-site not catalogued yet. **The backlog.**

```bash
node scripts/catalogue-coverage.mjs             # the full report
node scripts/catalogue-coverage.mjs --pending   # just the backlog
```

An endpoint that is neither listed nor declared fails preflight, and so does a
rule that matches nothing. `pending` rules are deliberately explicit paths
rather than globs, so a *new* sub-site trips the gate instead of being silently
absorbed.

### History analytics

`/stats` reports on the repo itself — commits per day, the year grid, the
time-of-day rhythm, and which surfaces got the work. Two things to know before
touching it:

- **Both history artefacts need a full clone.** This sandbox is shallow, so
  `generate-git-graph.mjs` and `build-git-stats.mjs` both refuse to run rather
  than publish a truncated history as if it were the whole thing. Run
  `git fetch --unshallow` first. Preflight *skips* the stats check on a shallow
  clone; CI checks out at `fetch-depth: 0` and is authoritative.
- **A commit is not a prompt.** It is one committed turn — a floor on prompts.
  A *session* (the `Claude-Session` commit trailer) is one conversation; the
  median here is 7 commits. And only `actor: agent` commits had a person behind
  them: the loop and the bots commit on a schedule, and folding them into
  "prompts per day" would roughly triple the number and mean nothing. The actor
  taxonomy lives in [`scripts/lib/gitlog.mjs`](scripts/lib/gitlog.mjs) — add new
  bot identities there, or they get counted as human.

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

> ⭐ **The golden rule.** A surface's `wrangler.jsonc` must bind the host it serves,
> or `wrangler deploy` updates a stray `<name>.workers.dev` worker: the run goes green
> and the live site never changes. There are two ways to bind a host:
>
> - **plain route — the default for anything new:** `{ pattern: "x.mino.mobi/*", zone_name: "mino.mobi" }`.
>   Costs **no** custom-domain slot (routes cap at 1000/zone), but makes no DNS, so the
>   deploy workflow must run `node ../scripts/route-dns.mjs wrangler.jsonc --apply` first.
>   Verify the log binds `x.mino.mobi/* (zone name: mino.mobi)` **and that the host answers**.
> - **custom domain:** `{ pattern: "x.mino.mobi", custom_domain: true }`. Cloudflare makes
>   the DNS, but it spends one of the zone's **100** slots. The zone hit 100/100 on 2026-09-22;
>   pruning and route conversions brought it to **72** on 2026-09-23. Existing surfaces keep
>   theirs until converted; don't add new ones. The slots left are headroom, not a budget to spend.
>
> `node scripts/binding-check.mjs` (a preflight gate) fails any surface whose config binds
> neither; a host attached by hand in the dashboard is declared in its registry entry's
> `binding` field instead. Green is not proof. Detection and fix: [`docs/DEPLOYS.md`](docs/DEPLOYS.md) §4.

> ⭐ **The golden rule's sibling: DEPLOY DRIFT.** The golden rule catches a green run that
> updated the wrong worker. This catches a green run that updated the right worker with a **stale
> tree**. Because `main` does not deploy, a surface ships whatever its owning branch holds — and a
> branch that forked from trunk and never came back keeps shipping the tree it had that day. Static
> Assets replaces the whole manifest, so everything trunk added since is simply *absent* from the
> live site, from a run that went green and bound the right domain. `hoop` was found this way on
> 2026-09-18: a month and ~5300 lines of merged work (statblock and its worker endpoint, rindmap,
> reactions.html, the mystery rewrite) that had never once reached production.
>
> ```bash
> node scripts/deploy-drift.mjs           # per surface: does its branch's tree match trunk's?
> node scripts/deploy-drift.mjs --check   # the preflight form
> ```
>
> **Read it per surface, never as a commit count.** "1731 commits behind main" is almost always
> meaningless — those commits are other surfaces' work. The tool compares trees over each surface's
> own registry `paths:` and says which side moved: `same` (in sync, however far behind it looks),
> `behind` (**shipping stale code**), `diverged` (needs judgment), `ahead` (unmerged work, not a
> deploy problem), `missing` (the owning branch is gone — that surface cannot deploy at all, and is
> the only condition preflight treats as fatal).
>
> Repairing a `behind` surface is a push to its owning branch, and **that push deploys**. Where the
> branch is a strict ancestor of trunk the tool marks it `ff` — a pure fast-forward, no merge commit
> and no conflict — but it still fires the deploy, so stage them and verify each run binds its custom
> domain. Never batch them blind: one owning branch here carries **25 surfaces**.

### Taking ownership of a surface

Moving a surface's `branch` to yours makes **your branch's tree** what the next deploy
publishes, and Static Assets replaces the whole manifest. So before you change it, prove
your tree loses nothing the current owner ships:

```bash
git fetch origin <owner-branch>
git diff --name-status origin/<owner-branch> HEAD -- <each registry path>   # no D lines allowed
```

`M` and `A` are your changes arriving; a `D` is a file the live site has and your push would
delete. Also `curl` the live host and compare against your tree. Then change `branch`, run
`gen-deploy-triggers --write` (preflight `--fix` does it), push, and verify the run binds the
host. The old owner stops deploying it on that push.

**An owning branch is infrastructure.** Deleting one strands every surface it owns (`missing`
in deploy-drift, preflight fails). `claude/landing-page-merge-candidate-8sp0fv` owns ~15
surfaces (ns, math, finance, torus, fifty and the ten route conversions of 2026-09-23), so it
**outlives its pull request**. Merge its PR; do not delete the branch. Follow-up work on
those surfaces is a push to that branch, not to `main`.

`workflow_dispatch` is on every deploy workflow for out-of-band runs. Build
commands, migration order and secrets live in the workflow — read it rather
than inferring; local `wrangler deploy` skips migrations and post-deploy hooks.

## Adding a surface

1. `curl -sI` the intended domain. Establish which worker owns it, if any.
2. Write `<dir>/wrangler.jsonc` — `name` = that worker, `routes` = a **plain route**
   (`{ "pattern": "<host>/*", "zone_name": "mino.mobi" }`), not a custom domain — see the
   golden rule. `ns/` is the reference route surface.

   **First, ask whether it needs a host at all.** Two shapes, both cheap:
   - *member of a hub*: a subpath of an existing surface (`math.mino.mobi/<x>/`, `fin.mino.mobi/perp/`).
     No worker, no DNS, no deploy workflow. Right for small pages that belong to a topic.
   - *independent route surface*: its own host, worker and workflow, bound by a plain route.
     Right when it has its own backend, build, or release rhythm. Show the relation to its topic in
     `catalogue.json`'s `p` (parent) field; the catalogue carries the hierarchy, and deployment stays
     independent.
3. Copy the closest existing `deploy-<surface>.yml`; they encode the build
   quirks and correct secret names. Add the `route-dns.mjs` step before `wrangler deploy`
   and a step that fails unless the host answers (copy both from `deploy-ns.yml`).
4. Add the `surfaces[]` entry (including `branch` and `paths`); drop it from
   `unmanaged{}`.
5. Add an entry to `catalogue.json` — including its `surface` key — plus a
   curated `<li>` description in `index.html`. A headless backend gets a
   capsule in `spec/curated.js` instead. Either way, give it a family in
   `spec/curated.js`.
6. `node scripts/preflight.mjs --fix`. It regenerates `var P` and every other
   projection, and seeds `<dir>/CLAUDE.md`; then write that file properly.
   If the surface ships sub-sites, `catalogue-coverage.mjs` will name them —
   list them or declare them.
7. Push, and confirm the run binds the route and the host answers.

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
| [`packages/cad/`](packages/cad/) | `cad.wasm` + `engine/` — the feature-tree CAD engine (Rust, Truck kernel, raw C ABI); `lib/` the kernel adapters, mesh toolkit, assemblies and measure; `agent/` the headless tools (build, measure, check, export, render, drive — node only). `cad.selftest.mjs`, `drive.selftest.mjs` and `browser.selftest.mjs` gate it; `bakeoff/` measures kernels. To CAD as an agent: [`packages/cad/SKILL.md`](packages/cad/SKILL.md) (synced to `.claude/skills/cad/`, served at `cad.mino.mobi/SKILL.md`); the package is mirrored to tangled for use without this repo. Design record: [`docs/CAD.md`](docs/CAD.md) |
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
  repo: `publish-*`, `seed-*`, `sync-*`, `score-*`, `fetch-*`, `bisk-digest`,
  `illustrate`. Read the workflow before triggering one.
- Shared D1 (`atpolls-db`) backs several surfaces. Migrations live in
  `poll/apps/api/migrations/`, numbered sequentially — never reuse a number; if
  two branches collide, the later merge renumbers.
- **Account changes go through `.github/cf-ops/plan.json`, never ad hoc.** Deleting a worker
  or moving a host off a custom domain is a reviewed op there. `cf-ops.yml` re-checks each op
  against the live account before it acts, and nothing is applied until the operator flips
  `"apply": true` in a separate commit. **A worker deletion is permanent**: with it go its
  secrets, its version history and any Durable Object data. The guards refuse a worker that owns
  DOs or is still configured in the repo. Renaming a worker and creating a D1 database are still
  dashboard-only ([`docs/DEPLOYS.md`](docs/DEPLOYS.md) §7).
- **A route surface's deploy re-creates DNS.** `route-dns.mjs --apply` creates a missing
  `AAAA 100::` record for the host. `--takeover` also detaches this worker's own custom domain;
  it is for a one-push conversion, so remove it from the workflow once that push has run.
- **`loop-*` workflows spend model budget in a chain reaction.** They are inert
  while `.github/loop/config.json` has `enabled: false`; flipping that is the
  switch. Before changing any workflow's `paths:`, run
  `node scripts/loop-blast-radius.mjs --check` — it asserts a loop commit cannot
  wake anything it has not declared, and `preflight` runs it for you.

## This sandbox

Ephemeral container, repo cloned fresh, reclaimed after inactivity — **commit
and push anything worth keeping.**

Works: all file ops at any size, git, `mcp__github__*` tools, WebFetch/WebSearch,
node, cargo, bash, background jobs.

Does not work: `wrangler deploy` (no Cloudflare auth), live PDS/Bluesky writes,
remote D1 writes, and there is no `gh` CLI — use the GitHub MCP tools.

**Irreversible or DNS-changing work is split between you and the operator.** Your session's
permission layer will (rightly) stop you from applying a deletion or a domain change yourself,
even with the operator's go-ahead in chat. Don't argue with it and don't route around it. The
working pattern (`.github/cf-ops/`):

1. You add the ops to `plan.json` with `"apply": false`, each with a `why`, and push. The run is a
   **dry run** that evaluates every guard against the live account.
2. You report what the log says each op would do.
3. The operator flips `"apply": true` in their own commit (the GitHub UI works from a phone). That
   run does the work and logs each op.
4. You verify from outside (`curl` each host), move the batch into `history` with the run id and
   the flip commit, reset `apply` to false, and push the matching repo changes. After a
   route conversion, that means each surface's `wrangler.jsonc` route and its workflow's DNS step;
   without them the next deploy re-attaches the custom domain.

Read-only questions about the account (slot counts, what exists, token scopes) go to
`cf-capability-probe.yml`; its inventory output refreshes `docs/backends-account.json`.

**The clone is SHALLOW, and git lies about history until you fix that.** Below the shallow
boundary there is no ancestry, so `git merge-base` finds nothing and `git merge` says
**"refusing to merge unrelated histories"** — for branches that share a root perfectly well.
`git rev-list --count` lies too (`main` reads as ~55 commits; it is ~3700). This has already
produced one confident, wrong diagnosis of "disjoint histories" that nearly led to rebuilding
`main`. **Run `git fetch --unshallow` before concluding anything about branch topology**, and
treat any "unrelated histories" error here as a shallow artefact until proven otherwise. (Two
branches genuinely are orphans — `claude/homunculus-sweeptest` and `corpus/*` — by design.)

**The deploy workflows are your network.** If you want to `wrangler deploy` from
here, you want to push to a branch the workflow recognises.

## Debugging

| Symptom | Cause | Fix |
|---|---|---|
| deploy green, live site unchanged | `wrangler.jsonc` `name` ≠ domain owner | the golden rule — check the log binds `(custom domain)` |
| deploy green, live site missing work that is on `main` | the owning branch forked from trunk and never came back — Static Assets republished a stale manifest | `node scripts/deploy-drift.mjs` |
| `git merge` says "unrelated histories" | the sandbox clone is shallow, not a real fork | `git fetch --unshallow`, then re-check |
| push didn't deploy | branch not in the workflow's triggers, or paths untouched | check the registry entry, then `gen-deploy-triggers --write` |
| worker 500s for no reason | compatibility-date drift | that surface's own `wrangler.jsonc` |
| D1 error about a missing column | migration not applied | `d1-migrate.yml`, or let the deploy workflow apply it |
| blank page needing SharedArrayBuffer | missing COOP/COEP | that surface's `_headers` |
| PWA won't install | bad `manifest.json` / service worker | validate both |
| ATProto auth fails | expired app password | regenerate in Bluesky settings |
| DID resolution fails | missing `.well-known/atproto-did` | verify the file and its DID |
| CI fails on a generated file | a generator wasn't re-run | `node scripts/preflight.mjs --fix` |
| deploy red on `100122`, worker uploaded, domain not bound | the zone is at Cloudflare's 100-custom-domain ceiling | mount the worker under an existing host via a service binding — [`docs/DEPLOYS.md`](docs/DEPLOYS.md) §6, `packages/cad` ↔ `parts` |

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

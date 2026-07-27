# The lab factory — agent-built sites from a Bluesky tag

**Status: both loops are BUILT, the factory is LIVE at `minomobi.com`, and the
Bluesky account is deliberately SILENT.**
A Bluesky mention routes to a site name and replies in-thread; a request commit
builds a site, gates it, and deploys it. `minomobi.com/atlink/` and
`minomobi.com/handle/` are agent-built and serving, with the CSP on every
response. What is missing is not code — it is a Bluesky account, four secrets,
and two deliberate switches: `ANNOUNCE` in `bsky-hello.yml` (the account's first
post, which is what makes it public) and `BOT_ENABLED` in the bot's config.

The account exists, holds the handle, and carries its disclosure profile. It has
posted nothing. A hello post was published during testing and **deleted on
purpose** to keep the launch unspent — which exposed a guard of the wrong kind
and is written up in §11.6.

Two corrections to earlier drafts of this line, both worth stating rather than
editing away. The bot was described here as "deployed but inert": it was not.
Both of its deploy runs failed in wrangler before upload, for a reason worth
knowing — see §12. And the ten-slot sharding is gone; §11.1 explains why, and the
whole factory now lives at **`minomobi.com/<name>/`** on one surface.

Live today: two agent-built sites and a shared style kit, on the `lab` worker.
§12 records what the runs proved and §13 what they did not.

The shape is deliberately close to things that already work here. Read those
first — most of the substrate exists:

| Existing piece | What it already does | File |
|---|---|---|
| `workers/bsky-bot` | polls `listNotifications` on a 5-min cron, KV-cached session + cursor, filters to mentions, calls `handleMention()` — **which is a TODO stub** | `workers/bsky-bot/src/index.ts` |
| `os/api` | per-DID Cloudflare Container: git + Claude Code CLI + GitHub MCP, clones `agent01`, branches from `origin/main`, pushes with a PAT whose pushes fire Actions | `os/api/container/` |
| headless agent runs | `claude -p --output-format stream-json` spawned detached from any client, session id persisted for `--resume` | `os/api/container/server.js:178` |
| `auto/` + autopilot | unattended site factory: one site per run, hard "write only in your dir" boundary, isolated worker per site, auto-announce, **manual promotion** | `scripts/autopilot/build-prompt.md` |

The lab factory is the autopilot with a Bluesky trigger, a slot lease, and a
much more careful credential posture.

---

## 1. Decisions

Settled up front, because each one changes the architecture rather than the
details.

| Decision | Choice | Why |
|---|---|---|
| Where lab sites are served | **`minomobi.com/<name>/`** | outside the `.mino.mobi` SSO cookie (§3), no new domain to buy, and the whole domain is the quarantine so there are no exceptions to remember (§11.2b) |
| Lab OAuth authority | **identity + one shared collection** | `atproto` + `repo:com.minomobi.lab.record` + `blob:image/*` — scales to 1000 sites with a one-line consent screen (§4) |
| ~~Retention~~ | ~~recycle oldest when the slot fills~~ | **SUPERSEDED by §11.1** — the capacity limit this defended is 25x further away than assumed. Names are permanent. |
| ~~Sharding~~ | ~~10 slot surfaces × 100 subdirs~~ | **SUPERSEDED by §11.1** — Static Assets allows 100,000 files per version; 1000 sites is ~4% of it. One surface. |

Shape, after the collapse:

```
lab/www/<name>/index.html   →   https://minomobi.com/<name>/
lab/www/index.html          →   https://minomobi.com/          (the listing)
lab/_kit/                   →   https://minomobi.com/_kit/     (copied in at deploy)
```

One surface, one worker, one publish branch (`claude/lab-www`) that every build
merges into. What used to be per-slot state is now per-name: the durable branch
is `claude/lab-<name>`, and the name is permanent and chosen by the requester.

`lab/` is a free namespace — `labglass` is the only near-collision and it is a
different top-level dir.

> **The one trap that survived the collapse.** Slots were the unit of
> *concurrency* and subdirs the unit of *capacity*; §5 is about not conflating
> them. Capacity is gone, but concurrency is not: every build now merges into one
> shared branch, which is exactly why publishing MERGES and never force-pushes.
> §12 records the data-loss bug that made that concrete.

---

## 2. ⚠ The root bundle must exclude `lab/` — do this first

The root worker serves `assets.directory: "."` (`wrangler.jsonc`). As CLAUDE.md
puts it: **the whole repo root is internet-facing.** There is no `.assetsignore`
and no `_routes.json` in the repo today.

`deploy-root.yml`'s `paths:` list gates *when the workflow fires*, not *what
gets uploaded* — a root deploy triggered by any other path still ships the whole
tree. So `lab/` in the repo means those sites also appear at
`mino.mobi/lab/www/<name>/`: same origin as the apex, inside `Domain=.mino.mobi`,
inside the auth worker's wildcard origin allowlist.

**Every isolation measure in §3–§4 is void until this is closed.** One
`.assetsignore` entry covers the whole factory — which is another argument for
keeping every site under one `lab/` tree rather than scattering top-level dirs.

**A status-code probe cannot detect this leak**, and an early check here wrongly
reported one because of it: the root Pages project serves a 200 SPA fallback for
unknown paths, so `mino.mobi/lab/...` returns 200 whether or not the file
shipped. `deploy-root.yml` now compares the *content* against the real file
instead. Still unproven until a root deploy runs after this merges (§13).

---

## 3. Why lab sites cannot live on `*.mino.mobi`

Three existing facts compose badly:

- `workers/auth/src/index.ts:128` — the SSO cookie is
  `Domain=.mino.mobi; HttpOnly; SameSite=Lax`.
- `workers/auth/src/index.ts:56` — `isAllowedOrigin()` returns true for **any**
  `*.mino.mobi` hostname. CORS-with-credentials for hosts that don't exist yet.
- `getSessionToken()` accepts Bearer **or** the cookie, and `handlePdsProxy()`
  (`:379`) honours either.

A page at `lab01.mino.mobi` would therefore need no OAuth flow at all — it could
call `auth.mino.mobi/pds/repo/createRecord` with `credentials: 'include'` and the
browser would attach a signed-in visitor's session. No consent screen, because
consent already happened on some other site.

Worse, `oauth/scope.ts` documents that the shared session **accumulates** scope
as a user visits sites. A visitor who has used hoop, org, wave and crm carries
write scope across dozens of collections including `app.bsky.feed.post` and the
whole `com.minomobi.vault.*` set. Agent-written JavaScript would inherit all of
it ambiently. This is the concrete form of the warning in `os/api/SECURITY.md`:

> R2 under a cookieless domain is the safe default; never `*.mino.mobi`, which
> shares the SSO cookie.

`*.minomobi.com` is already outside the cookie's reach — the code comments say
so explicitly about `labglass.minomobi.com`.

**This caveat is now mostly closed** — §11.2b evacuated everything else off
`minomobi.com`, so there are no siblings left to reach. `os-api` is the one
deliberate exception and it is dual-served: `os-api.mino.mobi` is the address
everything uses now, with `os-api.minomobi.com` kept only so links minted before
the move keep resolving. The original wording follows because the reasoning is
what makes the fix legible.

**Accepted caveat.** Sibling subdomains of a shared registrable domain can set
parent-domain cookies for one another, so a hostile lab page could set a
`.minomobi.com` cookie that reaches `os-api.minomobi.com`. Severity is low today
(os-api authenticates by bearer + verified DID, never by cookie) and it is
recorded here so the assumption is visible if os-api's auth ever changes. A
wholly separate registrable domain removes the caveat if it becomes worth it.

---

## 4. The lab OAuth client

The segregation axis is **origin + client identity**, not repository. Both split
cleanly inside `workers/auth/` — no new repo, no second auth worker.

In ATProto the client identity *is* the URL of the metadata document. A second
route, `auth.mino.mobi/lab/client-metadata.json`, is a different `client_id` and
therefore a genuinely different client to every PDS in the network. It gets:

- its own **`client_name`** — the consent screen reads "mino.mobi user sites",
  not "mino.mobi", so a visitor can tell the two apart;
- its own **keypair / `jwks_uri`**;
- its own **session cookie**, scoped to the lab host and never to `.mino.mobi`;
- its own **scope ceiling**, far below `METADATA_SCOPE`.

### Why one shared collection

`oauth/scope.ts` records that ATProto forbids prefix wildcards —
`repo:com.minomobi.lab.*` is illegal, and only exact NSIDs or the blanket
`repo:*` (i.e. `transition:generic` by another name) are permitted. With 1000
sites, enumerating a collection per site is impossible.

So: **one collection, `com.minomobi.lab.record`, with the site slug as a field
inside the record.** The ceiling stays three tokens whether there are 10 sites
or 1000:

```
atproto  repo:com.minomobi.lab.record  blob:image/*
```

Add `com.minomobi.lab.record` to `WRITE_COLLECTIONS` in
`workers/auth/src/oauth/scope.ts` and redeploy the auth worker, per the standing
rule that the metadata ceiling stays a superset of what any site requests.

### The proxy enforces what scope cannot express

The obvious objection: within that one collection, lab site A can clobber lab
site B's records. Scope has no vocabulary for this partition — but the BFF does.

`handlePdsProxy` already sees the `Origin` header and the record body. For the
lab client it additionally requires that `record.site` matches the calling
origin's slug and that the rkey carries that prefix; mismatches are rejected
server-side. **Scope gives the ceiling, the proxy gives the partition**, and
neither needs a new lexicon per site.

### Most lab sites need no auth at all

The Bluesky-mirror sites this will mostly attract are reads, and
`public.api.bsky.app` requires no authentication whatsoever. Lab sites default
to **zero auth**; the lab OAuth client is opt-in for the minority that persist
something. Build the factory first (§7 phases 0–4), add the client once real
demand is visible.

---

## 5. Collisions — what actually conflicts

Agents collide on **shared files**, not on their own directories. Two agents
writing only `lab/03/` and `lab/07/` never conflict in content. The conflict
surface is exactly six things, all of them touched by *registration*:
`deploy-registry.json`, `index.html`'s `P` catalogue, `docs/SURFACES.md`,
`spec/data.js`, `functions/search.js`, and the workflow `branches:` triggers.

**Therefore: register all ten slots once, by hand, up front.** After that no
agent ever touches a shared file, and the autopilot's existing "write only
inside your dir" boundary is the whole discipline. This is why `auto/` works
today.

Then four mechanical guards, in descending order of importance:

1. **Slot lease in a Durable Object, never KV.** KV is eventually consistent and
   will double-assign under concurrent mentions. DO storage is serializable.
2. **A path-containment gate in CI, not in the prompt.** Diff against
   `origin/main`; fail the deploy if any path escapes `lab/<NN>/`. Prompts leak;
   this is the only enforcement that holds.
3. **`concurrency: { group: deploy-lab<NN> }`** on each slot workflow, so two
   deploys cannot race the same worker name. `build-cult-basis.yml`,
   `hoop-director.yml` and `preflight.yml` already use this pattern.
4. **Reset, don't append.** `git checkout -B claude/lab-<NN> origin/main` every
   run, or run #2 inherits run #1's site. Force-push is safe precisely because
   the lease guarantees a single holder.

### The lease is on the slot, not the subdir

If two agents write different subdirs of `lab/01/`, their *dirs* don't collide
but their *branch* does — one owning branch per surface is the registry's rule.
Resolution: **one agent holds a slot for the whole build window.** 100 subdirs
is capacity, not concurrency. This serializes to 10 concurrent builds, which is
the container ceiling anyway (§8), so nothing is lost.

### Lease state machine

Held in a `SlotRegistry` Durable Object in the bot worker.

```
free ──lease(runId, authorDid, exp)──► leased
leased ──agent pushes branch──────────► building
building ──deploy green + smoke ok────► live(slug, until)
building ──failure / wall-clock kill──► free   (reply with the failure)
live ──slot full, oldest recycled─────► free   (subdir deleted)
leased ──exp passes with no push──────► free   (reclaim; stale agent's push is rejected)
```

Only the current lease holder's push is honoured. A reclaimed lease invalidates
the old `runId`, so a zombie agent that wakes up late cannot deploy over its
successor.

### Blast radius is now 100:1

One worker serving 100 sites means a bad deploy takes down 99 bystanders, and
shipping site #101 redeploys all of them. The deploy job smoke-checks a couple
of pre-existing subdirs before accepting, and refuses to publish if they regress.

---

## 6. Credential posture

`os/api/SECURITY.md` states the rule this design must not break:

> The user controls the container. […] **no secret is safe inside the container.**

The lab factory does not technically violate the `ALLOWED_DIDS` /
`INJECT_SHARED_CREDS` hard rule — the person who tags never gets a shell, and
the container stays owned by the service account. But it opens a weaker version
of the same hole: **untrusted text steering a credentialed agent.** The mention
body, anything it quotes, and any URL the agent fetches all become input to a
Claude Code process running `--dangerously-skip-permissions`. A whitelist
authenticates *who tagged*, not *what the post says*, and a whitelisted account
can be compromised or can quote a hostile post.

So the lab runner is a **separate surface from `os-api`**, sharing the Dockerfile
pattern but not the credential posture. Do not mutate `os-api` to serve this —
its `INJECT_SHARED_CREDS = "true"` is correct for an owner-only PTY and wrong
here.

| Credential | os-api today | lab runner |
|---|---|---|
| `CLOUDFLARE_API_TOKEN` | injected | **never** — the deploy happens in GitHub Actions, which already holds it |
| `GITHUB_TOKEN` | fine-grained PAT on `agent01` | PAT that can **push branches only**, no merge, no workflow write |
| `MOONSHOT_API_KEY` / model key | injected | injected (it is the run's whole purpose); spend bounded by §8 |
| PDS credentials | none | none — lab sites never touch a PDS at build time |

The container's only power becomes *"push a branch"*. Everything privileged
happens in Actions, behind the containment gate.

Lab sites are **pure static** — the autopilot rule, kept. No D1, no
`auth.mino.mobi` at build time, no shared backends. `atpolls-db` backs nine
surfaces; nothing agent-generated should be able to reach it.

---

## 7. Build order

Phases 0–2 are prerequisites with no user-visible effect. Do not reorder 0.

| # | Phase | Deliverable |
|---|---|---|
| **0** | **Root exclusion** | `lab/**` excluded from the root asset bundle; preflight asserts it. Blocks everything else. |
| 1 | Slot registration | 10 `surfaces[]` entries (`lab01`…`lab10`), 10 `wrangler.jsonc` (worker `lab<NN>`, `routes: [{ pattern: "lab<NN>.minomobi.com", custom_domain: true }]`), 10 deploy workflows, 10 seeded `CLAUDE.md`. `preflight --fix`. **All shared-file churn happens here, once.** |
| 2 | Lab runner backend | New surface. Container per §6, plus an unattended-run HTTP op modelled on `startChatRun()` — start a run, report completion via callback rather than a live WebSocket. |
| 3 | Bot dispatch | `workers/bsky-bot` promoted from `unmanaged.reference_workers` to a real surface. Whitelist check, `SlotRegistry` DO, `handleMention()` filled in, in-thread reply with the URL and the recycle terms. |
| 4 | Safety rails | Path-containment gate, `concurrency:` groups, smoke check, wall-clock kill, per-author and global caps. |
| 5 | Lab OAuth client | `auth.mino.mobi/lab/client-metadata.json`, lab scope constant, lab-scoped cookie, proxy partition on `record.site`. Only once §4's "most sites need no auth" is disproved by real usage. |
| 6 | Recycling | Oldest-out eviction at 100/slot, subdir deletion, shallow clones in the runner. |

---

## 8. Cost and abuse bounds

The Bluesky bot that inspired this was pulled for cost. That failure mode is
admission control, not architecture — an open trigger with no ceiling.

Here the ceiling is structural: **whitelist × 10 slots × one build per lease.**
Container time is the minor line item (standard instance, billed awake, 10-minute
idle sleep); **model tokens dominate.** Add a per-author daily cap and the global
concurrent-build cap of 10, and the worst-case daily spend is a number you can
state in advance rather than discover.

Hard stops, all of which belong in phase 4:

- wall-clock kill per run (a looping agent must not hold a slot or a container);
- a token ceiling per run;
- per-author daily build cap;
- global concurrent-build cap = the container ceiling.

**Repo growth is the real long-term price of staying in one repo.** 1000 sites at
a few hundred KB is a few hundred MB plus history, and every container
`git clone`s `agent01` at boot (`os/api/container/startup.sh`). Shallow clones
plus the recycling policy keep it bounded. This is payable, but it is not free
and it should be measured once phase 6 lands.

---

## 9. Container lifetime vs. thread continuity

The tempting shortcut is to keep a container alive across many builds so it
"remembers" the conversation. **Don't.** Three lifetimes are involved and they
should stay independent:

| Lifetime | Governs | Correct duration |
|---|---|---|
| **Container** | the running process | minutes — as short as the build takes |
| **Thread** | agent memory of a requester's past sites | indefinite, and it is a *persistence* property |
| **Slot** | how long a site stays reachable | until recycled at 100/slot |

### Can a container stay up indefinitely?

Technically yes, practically not as a guarantee. Cloudflare's docs are explicit:
without `sleepAfter` (or with `keepAlive`) an instance "will continue to run
unless its host server is restarted, which happens on **an irregular cadence
with no guarantee that any instance will run for any set period of time**." And
when it does go: "a fresh container starts with all previous state lost and the
environment reset to its initial state."

So a design that *relies* on uptime for memory is a design that silently loses
memory at an unpredictable moment. It also inverts the cost model — a long-lived
container bills while awake, which is precisely the failure that killed the bot
that inspired this project. The codebase already made this call deliberately:
`IDLE_SAVE_CUTOFF_MS` exists in `os/api/container/server.js:34` *because* an
unconditional autosave "would keep the container awake (and billing) forever."

### Continuity is already designed as persistence, not uptime

The machinery for "continue the thread ten websites later" exists and does not
need a long-lived container:

- `startChatRun()` persists Claude Code's session id to
  `/home/coder/.claude/os-chat-session-<profile>` and passes `--resume <sid>` on
  the next turn (`server.js:178`);
- `saveWorkspace()` tars `workspace .claude .bashrc .gitconfig` and PUTs it to
  the DO (`server.js:36`);
- `startup.sh` restores that tarball on wake, before the PTY server starts.

Because `.claude` is inside the tarball, both the session pointer and Claude
Code's own transcripts survive container death. Continuity comes from the
restore path, not from the process staying up.

### ⚠ But that persistence path is broken at this repo's size — today

`WS_MAX_BYTES = 64 MB` (`os/api/src/index.js`), and `execSync` in
`saveWorkspace()` caps at `maxBuffer: 100 MB`. Measured against the current
repo:

| Tarball contents | gzipped |
|---|---|
| working tree only, no `.git` | **331 MB** |
| full clone including `.git` | **654 MB** |

Both blow the 100 MB `maxBuffer` before the request is even built, and would
413 against the 64 MB cap if they got that far. The failure is **silent**: the
`catch` logs to a console nobody reads and clears the `saving` flag
(`server.js:71`). So any os-api workspace containing an `agent01` clone — which
`startup.sh` creates on first boot — has almost certainly never saved. This is
a live os-api bug independent of the lab factory, and worth fixing there.

### What the lab runner should do instead

**Persist the thread, not the workspace.**

- **Shallow clone per run** (`--depth 1`). Always current, no restore step, and
  the clone never enters the tarball. This also blunts the repo-growth concern
  in §8.
- **Persist only conversation state** — the session pointer, a small thread
  index, and the slug↔requester map. Kilobytes, comfortably inside the DO
  storage caps, no chunking pressure.
- **Key the DO by requester DID**, exactly as `os-api` keys by user DID
  (`idFromName(did)`). That gives every Bluesky requester a durable thread of
  their own, independent of which slot they draw on any given run.

This yields precisely the behaviour the long-lived-container idea was reaching
for — tag once, get a site; tag again ten sites later, the agent still has the
thread — with none of the standing cost and none of the reliance on an uptime
guarantee the platform explicitly declines to make.

**Thread identity is durable; slot assignment is ephemeral.** A returning
requester continues their thread but does *not* get their old slot back. If
they want to iterate on a still-live site, the agent reads it out of the repo
by slug — it is committed, so it needs no container memory at all.

### Git is the persistence layer — but only for the artifact

Better than the tarball: **the branch is the state.** A turn that ends in a push
leaves everything durable in GitHub, and the container becomes disposable in the
strong sense — not "survives death via restore" but "has nothing worth
restoring."

One repo constraint shapes how this attaches to deploys.
`scripts/gen-deploy-triggers.mjs:44` **rejects glob branches outright**:

```js
if (!s.branch || s.branch.includes('*')) { console.log(`  ! ${s.surface}: bad registry branch`); continue; }
```

So a slot's owning branch must be one literal name — `claude/lab-01` — and
per-site branches can't be deploy triggers on their own. The resolution keeps
the registry invariant intact:

- **`claude/lab-<slug>` is the durable per-site branch.** It is never recycled,
  holds the site's whole history, and is what a returning requester continues.
- **`claude/lab-01` is a publish pointer.** At publish time, while the lease is
  held: `git push --force origin claude/lab-<slug>:claude/lab-01`. One command,
  the deploy fires, and the slot branch carries no history worth keeping.

This also makes the promotion PR trivial — it is just `claude/lab-<slug>` with
the directory moved.

**What git does not hold is the conversation.** `--resume` needs Claude Code's
transcript, which lives in `~/.claude`. Don't commit transcripts: they're large,
and they'd put a durable record of user conversations in the repo. Instead the
agent writes a compact **`BRIEF.md`** into the site dir — what it is, what was
asked, decisions taken, open threads. A few hundred words, human-readable,
reviewable in a diff, and it doubles as the promotion PR description. A returning
requester's context is then *read*, not *restored*.

With this, the lab runner needs no workspace tarball at all — §9's 64 MB cap
stops applying — and DO storage shrinks to the lease plus a slug↔requester index.

### Model credentials: subscription, API key, or federated

Three authentications are supported for automated Claude Code runs. The choice
interacts with §6, because **the credential has to live wherever the agent runs.**

| | What it is | Cost model | Credential at rest |
|---|---|---|---|
| `CLAUDE_CODE_OAUTH_TOKEN` | subscription auth; Pro/Max users mint it with `claude setup-token` | subscription | long-lived, **account-scoped** |
| `ANTHROPIC_API_KEY` | standard API credentials | metered | long-lived, scopable + spend-cappable |
| Workload Identity Federation | GitHub OIDC exchanged for short-lived Anthropic tokens | metered | **none stored** |

Note the official GitHub Actions documentation leads with `ANTHROPIC_API_KEY`;
the OAuth token is documented in the action's own setup guide, alongside a
standing recommendation to *"always use short-lived tokens when possible."*

**Two consequences specific to a subscription token here.** First, a subscription
is a shared weekly cap, so ten concurrent lab builds draw from the same pool as
the owner's own Claude usage — an exhausted cap stops both. That converts a cost
problem into an availability problem for the owner's daily tooling, which is a
worse failure mode than a metered bill. Second, a subscription token authenticates
the **account**, not a scoped workspace: it cannot be spend-capped or narrowed the
way an API key can, and per `os/api/SECURITY.md` no secret in a container shell is
safe from a prompt-injected agent.

**This makes *where the agent runs* the load-bearing decision, not which token.**
See below.

### Where the lab agent runs — and what this does NOT touch

**Scope first: this section is about the lab runner only.** `os-api` exists to run
Claude Code interactively, on the owner's subscription, from a phone, outside any
app — a PTY over WebSocket is the *product*, not an implementation detail, and
nothing below proposes changing it. The question here is narrower: an unattended
build triggered by a stranger's Bluesky mention is a different workload that
happens to share a substrate.

**Both options run real Claude Code on the owner's subscription.** GitHub Actions
is not limited to API-key runs: `anthropics/claude-code-action@v1` executes the
Claude Code agent on the runner and takes `claude_code_oauth_token` as a
first-class input (the token `claude setup-token` mints for Pro/Max), alongside
`anthropic_api_key` and the federation inputs. `claude_args` passes CLI flags
straight through — `--max-turns`, `--model`, `--allowedTools`, `--mcp-config`.
So subscription billing is available on either path, and the choice is not
"real Claude Code vs. not."

| | Container (`os-api` pattern) | Actions job |
|---|---|---|
| Runs Claude Code | yes | yes |
| Subscription auth | yes (`CLAUDE_CODE_OAUTH_TOKEN` in env) | yes (`claude_code_oauth_token` input) |
| WIF (no static credential) | no | yes — but API-billed, not subscription |
| Owner can attach mid-run | **yes — a live shell** | no — logs only |
| Concurrency ceiling | `max_instances`, unverified (§10) | runner concurrency |
| Credential at rest | container shell (untrusted per `SECURITY.md`) | repo secret in the job |

**The deciding question is not cost or security — it is whether the owner wants to
attach to a running lab build.** If a mention should produce something you can
open on your phone and steer mid-flight, the container wins outright and the rest
of the table is noise; Actions gives you logs, not a shell. If lab builds are
fire-and-forget and the thread is the interface, the Actions job is markedly less
machinery: no image, no PTY server, no workspace sync, and the §10 concurrency
unknown dissolves.

Worth noting either way: `action.yml` carries an explicit warning that
*"processing untrusted content exposes the workflow to prompt injection"*, and
that when untrusted invocation is enabled Claude does only a **best-effort** scrub
of Anthropic, cloud, and GitHub secrets from subprocess environments. That is the
same hazard §6 describes, named by the action's own contract — it is a property of
pointing an agent at stranger-authored text, not of the runtime chosen.

Phase 2 starts by settling this, because it decides whether the lab runner is a
new container surface or a workflow.

### ⚠ The runner's push must use a PAT, not the Actions token

A push made with the default `GITHUB_TOKEN` **does not trigger other workflows.**
The build would go green and the deploy would never fire — the same class of
silent failure as the golden rule. This repo already hit it and wrote it down at
[`deploy-os-api.yml:15`](../.github/workflows/deploy-os-api.yml):

> `GITHUB_TOKEN <- GH secret OS_AGENT_GITHUB_TOKEN` (fine-grained PAT scoped to
> `minormobius/agent01` — **its pushes DO trigger Actions, unlike the
> Actions-internal token**)

So the lab build passes `github_token: ${{ secrets.OS_AGENT_GITHUB_TOKEN }}` (or a
GitHub App token) to the action. The secret already exists.

---

## 10. Iteration — the thread is the room

One shot will rarely be enough, so a requester must be able to come back and say
"make it dark mode." That needs an answer to *which site is this about* — and it
resolves **deterministically, with no model call**, because ATProto already
carries the key.

### `reply.root.uri` is the primary key

Every ATProto reply carries `reply.root.uri` and `reply.parent.uri`. When the bot
answers a mention, its reply joins a thread; every later reply in that thread
carries the **same root**. So the mapping is a single row:

```
thread_root_uri → { slug, site_branch, requester_did, created_at }
```

Look-up is exact. The router is two branches and no LLM:

| Incoming notification | Meaning |
|---|---|
| mention, no `reply.root` | **new site** — mint a slug, store the row |
| mention with `reply.root.uri` matching a stored row | **iteration** on that slug |
| `reply.root.uri` with no match | not ours — ignore |

`workers/bsky-bot/src/index.ts:107` already carries `record: any` on the
notification, so the reply block is in hand today; only the `reason === "mention"`
filter at `:129` needs widening.

**Require an explicit @-mention to act.** A thread collects "nice!" and other
chatter, and deciding whether a reply is a change request is exactly the kind of
judgement that would otherwise want a model. Requiring the mention makes it a
string test, costs nothing, and matches a social convention people already know.

**The one real edge:** if someone @-mentions the bot as a reply inside a
*stranger's* thread, the root belongs to that stranger's post, and a second
request in the same thread would collide. Guard with a composite
`(root_uri, requester_did)` key, and if a root is already claimed by a different
DID, start a new row keyed on the mention's own URI.

### Why not "one user, one room"

Simpler, and strictly worse: it caps a requester at one site and breaks the moment
they want two. Threads are naturally parallel and cost nothing extra.

But a **per-DID lock is right for concurrency** — one in-flight build per
requester, so nobody queues five builds and eats five slots. These are two
different mechanisms and both stay deterministic:

- **thread → identity** (which site is this about)
- **per-DID lock → concurrency** (how many builds may this person have running)

### The agent reads the thread as its history

The dispatch carries only `{ thread_root_uri, slug, slot }` — tiny, comfortably
inside `workflow_dispatch` input limits. The agent then fetches the conversation
itself from `public.api.bsky.app/xrpc/app.bsky.feed.getPostThread`, which needs no
auth because the thread is public.

That is §9's "context is read, not restored" applied again, and it means the
Bluesky thread *is* the conversation history — no transcript to persist, no
`--resume` to arrange across runners.

### The iteration path

1. `root_uri` → `slug` (exact look-up)
2. lease a slot — **possibly a different one** than last time
3. `git checkout claude/lab-<slug>` — durable, still there even if the old slot
   recycled
4. agent reads `BRIEF.md`, the existing site, and the thread — full context
5. build, commit, push the site branch
6. publish: `git push --force origin claude/lab-<slug>:claude/lab-<NN>`
7. reply in-thread with the current URL

This is what the durable-branch / ephemeral-slot split (§9) was for. Note the
consequence: **the URL can change between iterations**, so every reply must carry
the current one rather than assuming the first still resolves.

### Promotion: the graduation path

A daily promotion PR is a good idea and an independent axis from container
lifetime. It is the automation of the rule `auto/README.md` already states —
*promotion is manual* — batched rather than one-off:

a scheduled job opens one PR per day moving graduated lab sites out of
`lab/NN/<slug>/` into a real top-level surface, with the registry entry,
`index.html` catalogue line and `spec/curated.js` family filled in. A human
merges it. That is the only path by which agent-generated content reaches
`*.mino.mobi` and the SSO cookie domain (§3) — with a human in the loop, which
is exactly where that decision belongs.

Sites that never graduate get recycled at 100/slot. That is the intended
outcome for most of them.

---

## 11. Architecture pass — five things the first build got wrong or left out

Written after both loops worked, before the bot is switched on. Four of the five
change the design rather than extend it.

### 11.1 The lease was solving a problem that does not exist

**Measured, not assumed:** Workers Static Assets allows **100,000 files per
version** on the Paid plan (20,000 on Free), 25 MiB per file. A thousand tenant
sites at ~4 files each is **4,000 files — 4% of the ceiling.**

So the slot sharding was invented to route around a limit that is two orders of
magnitude away, and the lease — the recycling, the "your URL is temporary"
framing, the whole apologetic posture — was downstream of that invention. It is
not a tradeoff anyone chose; it is a consequence of a guess.

**Recommendation: delete the lease. Names are permanent and user-chosen.**

- One canonical address: **`lab.minomobi.com/<name>/`**, forever.
- The user names their site. That is most of what makes it feel like theirs.
- Slots become an internal detail or disappear entirely. Nothing about a shard
  should ever have appeared in a URL.
- The recycler is never built; `SLOT_CAPACITY` and the eviction policy go away.

The genuinely remaining bound is **repo size**, not Cloudflare — and it is far
off. Shallow clones already blunt the clone-time cost.

**On the "cryptographic trick":** the instinct is right and the name for it is
**user-owned storage**, not content addressing. The elegant end state is the
house pattern this repo already states — *"several apps use a user's ATProto PDS
as their backend, so we store nothing and pay nothing for their data."* A site
stored as a record in the requester's own PDS is permanent because *they* keep
it, costs us nothing, and cannot be taken from them by our retention policy.

That is a real design, not a fantasy — but it needs the lab OAuth client (§4)
and a rendering path, and it trades a static file for runtime assembly. **Do not
build it yet.** Permanent names in the repo now; PDS-backed storage is the
escape hatch for when repo growth actually bites, and the day it does the
migration is a rewrite of where bytes live, not of what a URL means.

### 11.2 Security — being labelled, and being an actual threat

Two different questions. The second is the one that matters.

**The concrete case, and it is not hypothetical.** The bot that inspired this
project was killed by one request: *pull cat images from the firehose*. The
agent obliged, and the site became an unattended republisher of whatever
strangers were posting. Two properties turn that from embarrassing into
account-ending:

- **The firehose carries content before moderation reaches it.** Jetstream and
  `com.atproto.sync.*` are raw. The AppView (`public.api.bsky.app`) is where
  takedowns are applied — it is the same data path bsky.app itself uses. Reading
  from the firehose is opting out of every moderation decision on the network.
- **A mirror keeps serving what the author deleted.** If the site stores CIDs and
  renders CDN URLs, a delete or a takedown at the source changes nothing.

**`cat/` in this repo is the same failure**, which is the part that makes this a
design problem rather than a prompt problem. `cat/worker.js:237` filters to
`operation === 'create'` and therefore **never processes deletes**: it is still
serving posts whose authors removed them, and its only removal path is an
unauthenticated admin endpoint someone has to remember to call. A lab agent has
`Read` and `Grep` over the whole checkout, so a working implementation of the
forbidden thing is sitting in the repository as a template. Telling the agent not
to build it is not a control when the answer key ships with the question.

**The rule that draws the line, and it is checkable:**

> A lab site may show media for a subject the **visitor named**.
> It may not show media from a stream the visitor did not name.

That is what separates `handle` (you typed the handle) from a firehose mirror
(nobody chose what appears). Enforced as a **fail-closed allowlist of XRPC
methods**, because every allowed method takes a subject as an argument and every
denied one answers "what is out there": `getAuthorFeed`, `getPostThread`,
`getProfile`, `resolveHandle` in; `searchPosts`, `getFeed`, `getTimeline`,
anything `com.atproto.sync.*` out.

**Not becoming a threat.** The controls that work are mechanical, not prompt
instructions, because prompts leak and gates do not:

- **A Content-Security-Policy on every lab response** — BUILT, in
  `lab/www/worker.js`'s `harden()`. The load-bearing directive is
  `connect-src 'self' https://public.api.bsky.app https://plc.directory`: no
  `wss:` at all, so a page cannot open a Jetstream socket (WebSocket is governed
  by `connect-src`, so this is absolute), and no PDS host, so
  `com.atproto.sync.getBlob` cannot fetch bytes the AppView would have withheld.
  Added by the worker on the way out, which is the one place a tenant cannot
  reach — the same reasoning as taking Bash off the build agent.

  Stated honestly: `script-src` keeps `'unsafe-inline'` because a lab site is one
  self-contained file by design, so this is **not** an XSS control. What it buys
  is that the page cannot talk anywhere we did not choose.
- **A content gate in `lab-build.yml`** — BUILT, `scripts/lab-content-gate.mjs`.
  Same policy at build time, where the failure is loud and a human sees it.
  Banned outright: `jetstream`, `subscribeRepos`, `com.atproto.sync.*`, `wss://`,
  `EventSource`, and `serviceWorker.register` — the last because a service worker
  persists code on a **shared** origin and outlives the page.

  It has a selftest, `scripts/lab-content-gate.selftest.mjs`, written as the
  agent would write each attack: browser Jetstream, polled `searchPosts`, a PDS
  blob fetch, a feed generator, a service worker — plus controls that must still
  pass. **It found a real hole on first run:** the gate excused anything matching
  `/^app\.bsky\.(feed|actor|…)\.[a-z]/` as a record type, which is also the
  shape of `searchPosts` and `getFeed`. A pattern that failed open on exactly the
  two methods the gate exists to stop, replaced with an explicit `RECORD_TYPES`
  list. This is the first time anything here has been tested against a build that
  actually tries.
- **`kit.bskyGet` / `kit.visible`** — BUILT. The safe path made the easy path:
  `bskyGet` enforces the same allowlist in the browser, and `visible()` drops
  labelled content, because the AppView returns labels as *data* and a page that
  renders the array straight through shows what bsky.app itself would hide.
- **Still to build:** refusing password/payment inputs and wallet-connect
  vocabulary, and `/.well-known/security.txt`.
- **No impersonation**: no third-party brand names, logos, or lookalike copy.

**⚠ The finding that changes a decision: reputation is shared per registrable
domain.** If a lab site gets `minomobi.com` onto a blocklist — Safe Browsing,
SmartScreen, a corporate proxy — it takes **`os-api.minomobi.com` with it**, and
the agent platform stops working for reasons that have nothing to do with it.
§3 recorded a *cookie* argument for a separate domain and called the risk low.
This is a second, independent, and much stronger argument for the same move.
Agent-generated content on a domain that also carries infrastructure is a
correlated failure waiting to happen.

**Not being mislabelled**, given the above is done: a provenance footer on every
page (who asked, when, link to the thread), a `/.well-known/security.txt` with a
real contact, and a visible "built by an agent on request" marker. Auto-generated
content with no provenance on a fresh subdomain is the exact shape of a phishing
farm; provenance is what distinguishes it.

### 11.2b Better than a separate domain: evacuate `minomobi.com`

§11.2 argued for a separate registrable domain because reputation is shared.
The inverse is cheaper and strictly better: **`mino.mobi` and `minomobi.com` are
already different registrable domains** — different TLDs entirely — so they share
no cookie scope and no reputation. The isolation a new domain would buy is
already owned. It is only compromised because one non-lab surface still sits on
`minomobi.com`.

**Measured inventory of `minomobi.com` today:**

| host | what | move? |
|---|---|---|
| `lab.` / `alph.` / `beta.` / `gamm.` | the factory | stays |
| `os-api.` | the agent-platform backend for `os.mino.mobi` | **move** |
| apex `minomobi.com` | the curated landing, also served at `mino.mobi` | **move** |
| `tips@` `editor@` `modulo@` `morphyx@` `admin@` | Cloudflare Email Routing | **decide** |

That is it. `bakery.minomobi.com` and `labglass.minomobi.com` appear in comments
but both surfaces live on `mino.mobi` — historical references, not live hosts.

**Moving `os-api` costs three references and a domain attach:**
`os/api/wrangler.toml:11` (the route), `:15` (`SYNC_URL`), and
`os/src/lib/container-config.js:14` (the frontend's WebSocket URL). The frontend
already probes `/health` at runtime and reports what is missing, so a stale URL
degrades to a clear message rather than a dangling socket.

**This buys a second thing beyond reputation.** §3 records an accepted caveat:
sibling subdomains of a shared registrable domain can set parent-domain cookies
for each other, so a hostile lab page could set a `.minomobi.com` cookie reaching
`os-api.minomobi.com`. Evacuating `os-api` does not mitigate that caveat — it
**deletes it**. The two domains stop having any relationship at all.

**⚠ The email question needs care, and it cuts against the current plan.**
The Bluesky service account is to be registered at `admin@minomobi.com` — on the
domain being deliberately designated as the one we are willing to have
blocklisted. Domain-level blocklists are frequently domain-wide rather than
per-host, so a phishing flag earned by a generated page could plausibly degrade
mail deliverability for the whole zone. That would put the **account-recovery
address for the service account on the most flag-prone domain we own.**

The coupling is plausible rather than certain — Safe Browsing and mail blocklists
are separate systems — but the failure is bad and the fix is cheap: put the bot's
address on `mino.mobi` instead. That requires enabling Email Routing on a second
zone, which is one-time. The four existing `@minomobi.com` addresses are a
separate decision and can stay or move independently.

**Two shapes for the apex, both fine:**

- **Redirect.** `minomobi.com` → 301 → `mino.mobi`; the factory stays at
  `lab.minomobi.com/<name>/` and the bot's handle is `lab.minomobi.com`.
- **Hand the apex to the factory.** Sites become `minomobi.com/<name>/` and the
  handle is `minomobi.com`. Shorter, and it makes the quarantine legible: that
  entire domain is agent-generated, no exceptions to remember.

Either way the root Pages project must stop serving the `minomobi.com` custom
domain, which is a **dashboard-only detach** (`docs/DEPLOYS.md` §7).

### 11.3 Distribution — OG cards, standard.site, and posting back

**Open Graph is table stakes and belongs in the gate**, not the prompt: no
`og:title`/`og:description`/`og:image` means no link card, which means the whole
point of posting the site is lost. `scripts/generate-og-card.mjs` already exists
for the apex; the same approach generates a per-tenant card at deploy time.

**standard.site is real and it is narrower than it sounds.** It is a community
Lexicon — Publication, Document, Subscription — that Bluesky renders with richer
previews (publication and author surfaced, not just a title). It is built for
**long-form writing**, so it fits a lab site that *publishes something readable*
and does not fit an interactive tool. Treat it as opt-in for the subset that
produces an article, not a blanket requirement. Exact record shape still needs
reading before implementing.

**Posting a result back needs no auth at all.** A Bluesky compose intent URL
carries prefilled text and a link, so `kit.shareToBsky(text, url)` is a few lines
and works for an anonymous visitor. That is the v1; an authenticated post through
the lab OAuth client is a later refinement, not a prerequisite.

### 11.4 Keeping the service account alive

**Rate limits are not the risk.** Measured: 5,000 points/hour and 35,000/day,
where a CREATE costs 3 — roughly 1,666 records/hour. This bot posts about one
reply per request; a hundred requests a day is ~300 points, under 1% of the daily
allowance. `createSession` is the tighter one at **30 per 5 minutes, 300/day**,
which a cached session never approaches but a session-refresh bug would burn
through in an hour. Worth an explicit guard.

**Moderation is the risk.** The rules that keep an automated account healthy:

- **Reply-only. Never post unsolicited.** A reply to a mention is invited; a post
  into someone's feed is not. This is the single biggest determinant.
- **One reply per event.** No progress-update threads.
- **Say it is automated** in the profile, with the operator named. There is no
  formal bot flag documented in the API; disclosure is the available mechanism.
- **A global hourly cap in the bot itself**, independent of the whitelist, so a
  bug cannot become a flood.

### 11.5 Judging the output

Voting and comments on the rollup are what turn a pile of generated pages into
something with a signal. It also **makes the lab OAuth client load-bearing** —
§4 currently calls it opt-in and "build it once demand is visible." This is that
demand.

- **v1: votes in the registry DO, keyed by voter DID**, authenticated through the
  lab OAuth client. Simple, immediate, no aggregation problem.
- **v2: votes as `com.minomobi.lab.vote` records in the voter's own PDS**, tallied
  by tailing the firehose — the house pattern, with `workers/feed` as precedent.

v1 first. The PDS version is more correct and strictly more work, and the thing
worth learning early is whether anyone votes at all.

---

## 11.6 FMEA — done before going public

Written before the interlock was flipped, not after. Ordered by what it costs to
be wrong, and honest about which rows are still open.

**The cost model is not what §8 assumed.** Builds run on
`CLAUDE_CODE_OAUTH_TOKEN` — the operator's own subscription, not metered API — so
`--max-budget-usd 3` does very little, and Actions minutes are free on a public
repo. The scarce resource is the operator's **weekly subscription capacity, shared
with their own work**. A flood does not produce a bill; it produces an operator
who cannot use their own tools until the window rolls. That is a worse failure
than an invoice and it changes what is worth capping.

**"They're like me, they push and push."** The right assumption. Every row below
assumes a capable, curious requester probing the edges, not an adversary and not
a good citizen.

| # | Failure | Sev | Interdiction | State |
|---|---|---|---|---|
| 1 | **Agent reads `.git/config` and publishes the PAT.** `actions/checkout` persists the token on disk; the agent has `Read`/`Grep`; the containment gate checks paths, not contents. A page containing the token passes every check and deploys. | critical | `persist-credentials: false`; credentials re-armed only after both gates; a gate that greps the output for the literal value of every secret the job holds | **FIXED** |
| 2 | **Exfiltration of anything else on the runner** — a credential file, a cache, something nobody enumerated. | critical | the same output scan, plus shape patterns (`ghp_`, `github_pat_`, `sk-ant-`, `x-access-token`, `AUTHORIZATION: basic`). Scans for values, so it does not depend on knowing the route | **FIXED** |
| 3 | **Flood exhausts the operator's subscription.** 293+ admitted accounts, one in-flight build each, nothing bounding the total. | high | `GLOBAL_HOURLY_CAP = 12` in the DO, rolling window. Refusal states when capacity returns | **FIXED** |
| 4 | **Mutual list silently undercounts.** Cap was 25 pages × 100 = 2,500 against 6,528 followers, so a third of the graph was never read and real mutuals were refused. Logged a warning nobody could see. | med | cap raised to 200 pages; `truncated` stored and surfaced on `/state` rather than logged | **FIXED** |
| 5 | **Phishing-shaped output** — a password or wallet-connect field on a domain publishing agent-written pages. | high | gate blocks credential-collection SHAPES (password/card fields, `window.ethereum`, `web3`, WalletConnect, Solana providers). Matches machinery, never topic — see below | **FIXED** |
| 6 | **Requester gets silence.** The bot replies on dispatch and never again; a failed build looks identical to a slow one. Guarantees "is it broken?" replies, which is exactly the traffic that makes an automated account look bad. | med | `lab-build` replies in-thread on both outcomes, with a link card on success | **FIXED** |
| 7 | **Prompt injection redirects the build.** Task text reaches the brief verbatim. | med | structural, not textual: no Bash means no git, no network, no shell; both gates run regardless of what the agent was told | mitigated by design |
| 8 | **Defamatory or impersonating content.** No gate can judge this. | med | provenance on every page, a fast kill switch, and the fact that requesters are named mutuals rather than strangers | partial |
| 9 | **Handle verification breaks with a bad deploy.** The account's identity depends on a worker redeployed on every build. | low | the `_atproto` TXT record makes DNS authoritative | **OPEN**, offered |
| 10 | **Duplicate dispatch after a failed poll.** The cursor is saved after handling; a crash mid-poll re-reads the same notifications. | low | thread→identity makes the retry an iteration on the same site, and the per-requester lock blocks it inside 30 min | mitigated |
| 11 | **Name squatting.** Names are permanent and first-come; 293 people can take every good one. | low | accepted. It is the same trade every namespace makes |

**The pattern in rows 1, 2 and 4:** each was a control that *looked* present.
The containment gate is real but answers a different question than the one row 1
asks. The mutual list was real but silently partial. A control you have not
tested against the specific failure is a control you are assuming.

### 11.6b Absence is evidence; it is not permission

`bsky-hello.mjs` guarded its first post on `postsCount === 0` — a guard that
infers intent from observation, and the only one there was. The post was
published during testing and then deleted **deliberately**, to keep the account
from reading as launched before it was. That made the guard true again, so the
next run of the workflow would have re-posted it and undone the decision.

A check that reverses a deliberate act is not a safety check. It is an
inference, and inferences about intent are exactly what a switch is for.

Posting now needs `ANNOUNCE: 'true'` in the workflow — a commit, reviewable,
made when someone means it — **and** an empty account. Intent and absence, in
that order. Everything else the script does (logging in, reconciling the
disclosure profile) is genuinely idempotent and still runs every time.

The general form, which applies past this one script: **when a guard's condition
can be restored by a human undoing something, it is measuring the wrong thing.**

### 11.6a The two rules that came out of rows 5 and 6

**The only login a lab site may offer is Bluesky OAuth, narrowly scoped.** No
password field, no payment field, nothing that collects key material. A domain
full of agent-written pages that also asks for passwords is indistinguishable
from a phishing farm — to a visitor, to a blocklist, and to a browser vendor.

**A crypto or wallet request is not refused, it is answered with a joke.** The
agent builds a real page, in the house style, gently mocking the person who asked
— who is a mutual and in on it. Aimed at the requester and at crypto, never at a
third party. A refusal funnier than the thing refused teaches more than an error
message, and it is a better page than the one that was requested.

That second rule constrains the first: **the gate matches machinery, never
topic.** `window.ethereum`, `web3`, WalletConnect and Solana providers are
blocked; the *words* are not, because the sanctioned response has to be able to
talk about wallets at length. `crypto.subtle` and `crypto.randomUUID` are Web
Crypto and entirely normal — a topic blocklist would have broken real pages and
made the joke unbuildable, quietly turning it back into an error message. The
selftest asserts both directions.

**The link card is not automatic, and that is why OG tags became mandatory.**
Bluesky does not fetch Open Graph tags — the client composing a post supplies the
embed, and the network renders what it is given. A post created through the API
with a bare URL gets a bare URL, which throws away the entire "attention on
Bluesky" premise. So `bsky-reply.mjs` reads the page's own `og:title` and
`og:description` off disk and builds `app.bsky.embed.external` from them, and the
content gate requires those tags. The site authors its own card; the bot carries
it.

---

## 12. Proven — what the first real runs established

The inner loop is **built and working end to end**. `atlink` (then at
`beta.minomobi.com/atlink/`, now `minomobi.com/atlink/`) was produced by a Sonnet
agent from a one-line request, gated, published and deployed with no human
touching the code, and verified in a browser: both conversion directions correct,
error path correct, house style followed.

Four runs, four distinct failures, none repeated — each worth keeping:

| run | died at | cause |
|---|---|---|
| 1 | agent step, 2s | `claude-code-action` refuses any event it doesn't model — `Unsupported event type: push`. Replaced with the `claude -p` CLI. |
| 2 | gate | `git status --porcelain` collapses an untracked dir to one entry, so the tenant read as `lab/` and failed containment. Needs `-uall`. Behind it: the site branch was based on `main`, where `lab/` doesn't exist. |
| 3 | nothing — ran clean | the publish pointer `claude/lab-<slot>` wasn't a deploy trigger. The registry named the bootstrap branch. |
| 4 | — | green. First iteration-mode run. |

### The outer loop, and three more gotchas it surfaced

The bot (`workers/bsky-bot`) routes mentions and fires builds. Three things
learned building it, each of which cost a run to find:

- **`repository_dispatch` and `workflow_dispatch` need the default branch.**
  GitHub 404s a workflow that lives only on a feature branch. The bot therefore
  fires a build by **committing** `.github/lab-requests/<slug>.json` — a `push`
  trigger has no such rule, so the factory runs from whatever branch it is on and
  never has to merge to `main` to be exercised. Cost: the PAT needs
  `contents:write` rather than `actions:write`.
- **A branch-creation push has no diff base, so `paths:` filters cannot match.**
  Seeding a fresh slot branch fires nothing at all — two slots ended up holding
  the kit in git while serving 404 for it. Anything that must trigger a
  path-filtered deploy has to touch a file inside that path. That is why the kit
  is now **copied in at deploy time** by `gen-lab-tenants.mjs` rather than
  propagated as commits: with one surface there is nothing to propagate to, and
  the trigger problem disappears with the propagation.
- **KV was never needed.** Session and cursor moved into the DO the bot already
  required, removing a provisioning step between a fresh clone and a running bot.
  The same move `os-api` made when R2 turned out unavailable.

### The collapse to one surface surfaced two more, both live

**A force-push publish would have destroyed sites.** Publishing was
`git push --force origin HEAD:<publish branch>`, which is correct only if one
branch owns the whole branch — and it never did. Verified before changing it:
`atlink` existed *only* on `claude/lab-beta` and was absent from every other
branch, so the next build into that slot would have deleted it. It had simply
never fired, because each slot had seen exactly one build. Collapsing to one
shared publish branch made it certain rather than likely. **Publishing now
merges**, and a conflict is a hard stop: sites live in disjoint directories, so a
conflict means two builds touched shared infrastructure and must not be
auto-resolved.

**`wrangler deploy` from a subdirectory can silently load the repo-root config.**
Both `deploy-bsky-bot.yml` runs failed on `Asset too large` — a 122 MiB `workerd`
in the worker's own `node_modules`. The size was the symptom. The cause: run from
`workers/bsky-bot/`, wrangler 4.114 never reads that directory's `wrangler.toml`
at all and loads the root `wrangler.jsonc` instead. Confirmed by putting
deliberately invalid TOML in the local file — no parse error, it just used the
root config.

That error was the lucky outcome. Without an oversized file the run goes **green
while deploying the root worker**: the golden rule's failure mode arriving from a
direction the golden rule doesn't describe — not a wrong `name` in the right
config, but the right name in the wrong config. `wrangler secret put` inherits
the same resolution, so the bot's app password would have been written onto
whichever worker wrangler picked. The fix is `-c wrangler.toml`, which
`deploy-os-api`, `-audio`, `-feed`, `-fred-proxy` and `-duffel-proxy` already
carry; this workflow simply hadn't inherited it. It now also asserts, via
`--dry-run`, that the resolved config carries the binding it expects.

**A failed `wrangler deploy` can still have changed the site.** Run 3 of
`deploy-lab` went red, and `lab.minomobi.com` served the new page anyway.
Wrangler uploads the worker and its assets first and attaches routes after, so
the apex attach failing left a partial deploy: `Uploaded lab`, then

    Hostname 'minomobi.com' already has externally managed DNS records
    (A, CNAME, etc). Delete them first or try a different hostname. [code: 100117]

The root Pages project still holds `minomobi.com`, and the DNS record Cloudflare
created for that custom domain is what blocks the worker. Removing it is the
dashboard step (DEPLOYS.md §7) — detaching the custom domain from Pages deletes
the record. **The golden rule's mirror image:** green is not proof a deploy
landed, and red is not proof it didn't.

Worth noting how the hint for this was got wrong first: the workflow guessed at
the error text (`already in use`), which did not match, so the explanation never
printed. It now greps the measured string and the error code.

**Also corrected: the status line here said the bot was "deployed but inert".**
It was not deployed at all. Nothing downstream depended on that being true, and
it made the DO class rename free — `SlotRegistry` never existed remotely, so
`SiteRegistry` needs no `renamed_classes` migration.

**Still unproven: the CONTAINMENT gate has never caught a real escape.** It has
produced one false positive (run 2) and several clean passes. Failing safe is the
right direction, but it is not evidence the enforcement works. Before trusting
that boundary, run a deliberately adversarial task — one instructed to write
outside its tenant directory — and confirm the gate rejects it. It now permits a
second path (the requester's profile), which makes this more urgent, not less.

The **CONTENT** gate is a different story, and worth separating: it has an
adversarial selftest (§11.2) that attacks it five ways and it holds. That is
still not a live run — an agent under real instructions may produce shapes the
fixtures did not — but it is the first thing in this system whose enforcement has
been demonstrated rather than assumed, and it is the model for what the
containment gate's proof should look like.

**Also unproven: nothing has been exercised end to end from Bluesky.** Every run
so far entered via a hand-edited request file. The routing, the whitelist, the
name claim and the reply copy have been reasoned about but never watched. That is what
`BOT_ENABLED="false"` is for — it lets all of that run for real without the
factory being able to spend anything.

### The first real request found four, and three were controls that weren't there

`@modulomino` asked for a clock. Everything before the build was correct — the
live mutual check admitted them, the name was claimed, the request file was
committed, the workflow fired, and the failure reply landed in-thread on its
first outing. Then the requester's post collected **three** replies for **one**
request, and the reason was four separate faults stacked on top of each other.

| # | Fault | Why nothing caught it |
|---|---|---|
| 1 | `'"'"'` inside a **double**-quoted `echo` opened an unterminated quote | the block only runs when a requester is present, and every prior run was hand-driven with none |
| 2 | an unrelated push **rebuilt the same request** and refused it a second time | `paths:` matches a push *range*, and a request file is permanent |
| 3 | the `ls -t` fallback **invented a build** when the push carried no request | it was written as robustness; it is the opposite |
| 4 | the smoke step's repair pass and its whole exit-code ladder **could never execute** | `set -uo pipefail` does not cancel the `-e` GitHub already applied |

**#2 in full,** because the mechanism will recur elsewhere. An infrastructure
push touched `lab-build.yml`, which is in `publish-lab.yml`'s `paths:`, so
publish-lab fast-forwarded `claude/lab-www` onto it. That push's *range* still
contained the bot's `lab request: tzclock` commit from eight minutes earlier,
so lab-build's `.github/lab-requests/**` filter matched. The workflow's own
`HEAD~1..HEAD` diff correctly found nothing — and #3 then picked the newest file
by mtime and built it anyway. **The trigger and the code that reads the trigger
disagreed, and the disagreement was resolved by guessing.** The same mechanism
would have re-run every request ever made, the first time this branch merged to
`main`.

The guard is now: the **tip commit** of the push must itself add or modify a
request file, and never on the publish branch. That is exactly true of a bot
dispatch and of a hand-edited request, and false of an infrastructure commit, a
merge commit (whose `head_commit` lists no files) and a rebase.

**#4 is the one worth internalising.** GitHub runs every `run:` block as
`bash -e {0}`. `set -uo pipefail` — this repo's idiom for "I will check the codes
myself" — adds `-u` and `pipefail` and leaves `-e` exactly as it was. So the
smoke pipeline aborted the step on its first non-zero exit and **every line below
it was unreachable**: the exit-code ladder, the "2 means could-not-check, publish
UNVERIFIED" branch, and the entire repair pass in which a second agent is handed
the browser's error report. It survived because the smoke test had never once
returned non-zero anywhere. Its first real run did, and a page that should have
been published with a warning produced a red build and a stranger's replies.

`preflight` now flags any `run:` block that reads `$?` or `${PIPESTATUS[…]}`
without `set +e`. The first version of that check **passed with the fix
deliberately removed**, because the comment explaining why `set +e` matters
satisfied its regex — so it strips comments now, and it was re-verified by
reinstating the bug. Every other workflow in the repo already had `set +e`; the
idiom was known and this one step missed it.

**A fifth, from fixing the second: the guard suppressed the thing it guarded.**
The first version of the tip-commit rule asked the push webhook payload
(`contains(toJSON(github.event.head_commit.modified), …)`). It skipped the very
next real dispatch — the bot committed through the Contents API, liked the post,
replied *"On it — updating minomobi.com/tzclock/"*, and no build started. **A
duplicate is visible; silence after a promise is not.** The real defect was
shipping a condition that cannot be inspected or tested from outside a live
push. The question moved into a `select` job where `git diff-tree` answers it
against a checkout — verified against all four real commits on the branch before
pushing, and then proven in production on the very next push, which built on the
feature branch and **skipped on `claude/lab-www`**: the exact duplicate,
suppressed.

**And the smoke test itself had never run anywhere.** `--headless=new
--dump-dom` returns an empty stdout and exit 0 on a GitHub runner. The file
carried a comment reading *"It works on a GitHub runner; it does not work in the
dev container"* — nobody had run it on a GitHub runner. That was an assumption
written in the voice of a measurement, and it is why a broken control read as a
sandbox quirk. It now tries `--headless=new`, `--headless=old` and `--headless`
in turn, and when none yields a document it prints the browser, its version and
what each mode did — the first version discarded `stderr`, so the code whose job
was to report the failure threw away the only evidence of it.

Those diagnostics immediately **refuted the mode hypothesis they were added to
test** — every mode returned `ETIMEDOUT`, while in the same job the same binary
screenshotted the live site headless and produced a 46 KB PNG. Chrome was not
failing; it was hanging. Two `file://` experiments then cleared `--dump-dom`
(a page with a 1s `setInterval` dumps in one second) and cleared every flag in
the invocation. One variable was left, and it was ours:

```
spawnSync: 20047ms  bytes=0  ETIMEDOUT  serverHits=0
spawn:       504ms  bytes=129  hasHtml=true  serverHits=3
```

**`lab-smoke.mjs` both serves the page and drives the browser, and it drove the
browser with `spawnSync`.** That blocks the Node event loop until the child
exits, so from the moment Chrome launched, the server could not accept a single
connection. `serverHits=0` is the proof: the request never arrived. Chrome waited
for a reply that could not come, and the timeout killed it. One line, `spawn`
instead of `spawnSync`.

**Three findings in this file were wrong because of it**, each written up as a
measurement:

- *"This sandbox's Chromium cannot open HTTP connections at all, including
  loopback."* It can.
- *"`--headless=new` accepts the mode but never dumps the page."* It dumps fine.
- *"The beacon version caught nothing because `sendBeacon` is fire-and-forget and
  the process was gone before the packets left."* The beacons were fine. The
  server was blocked then too — it could no more receive a beacon than serve a
  page. The rewrite that followed was an improvement for other reasons, which is
  why the wrong story survived.

One bug, mistaken for three environmental quirks, because the symptom every time
was silence. **The general lesson is not about `spawnSync`:** when a control
produces nothing, "the environment can't do this" is the most comfortable
available explanation and needs the most evidence, not the least.

With it fixed, the selftest runs for the first time and **all nine assertions
pass** — every deliberate bug caught (a throw on load, a wrong field name, a
CSP-forbidden host, a non-2xx response) and a correct page still passing. Its
last two cases were moved off the public AppView and onto `self`: they had been
failing here for lack of outbound HTTPS, and a selftest whose verdict depends on
the machine's internet cannot tell "the collector is broken" from "there is no
network", which is the confusion the whole file exists to prevent.

`tzclock` — the page that shipped UNVERIFIED — was then run through it and
passes clean under the production CSP.

---

## 13. Unverified — check before building

None of these were confirmable from the sandbox (no Cloudflare auth). Each could
change the plan.

1. ~~**Can the account run 10 concurrent containers?**~~ **MOOT for the shipped
   design.** The runner path won: the build runs as a GitHub Actions job, so
   runner concurrency replaces `max_instances`, and the Cloudflare Containers
   entitlement never enters the picture. This becomes live again only if the lab
   runner is ever moved into a container for interactive steering (§9).
2. ~~**Custom-domain attach for 10 new hosts.**~~ **ANSWERED: wrangler does it.**
   All three slots bound their custom domain on the very first deploy from a
   `routes: [{ pattern, custom_domain: true }]` entry, with no dashboard step —
   `alph`/`beta`/`gamm.minomobi.com` all served 200 immediately. `docs/DEPLOYS.md`
   §7's "dashboard-only" applies to detaching and to re-pointing an existing
   domain, not to first attach on a zone the account already holds.
3. ~~**Static-asset limits for 100 sites on one worker.**~~ **ANSWERED, and it
   is what killed the sharding:** 100,000 files per version and 25 MiB per file
   on the Paid plan. A thousand single-page sites is ~4% of the file ceiling
   (§11.1). Worth re-checking only if sites start shipping many assets each.
4. **Whether Pages honours `.assetsignore`. STILL OPEN — and the obvious test is
   a trap.** A root `.assetsignore` listing `lab/` now exists, and `.assetsignore`
   is already this repo's per-surface mechanism for the same job
   (`lab/www/.assetsignore` keeps `CLAUDE.md` out of the bundle). But those are
   **Workers** assets; the root is a **Pages** project, a different product, and
   `deploy-root.yml` only triggers on `main` and its own owning branch — so
   creating `lab/` on a feature branch does not redeploy the apex and proves
   nothing either way.

   **Do not test this with a status code.** Pages answers unknown paths with the
   apex landing page at **HTTP 200**, so `curl -o /dev/null -w '%{http_code}'`
   returns 200 whether the exclusion works or not — measured, not assumed. The
   check has to compare *content*: root's `index.html` is ~200 KB and says
   "personal tooling", a leaked lab page is ~4 KB and says "site factory".

   `deploy-root.yml` now carries that content assertion and fails the deploy if a
   lab page appears on the apex. **The truth surfaces on the first root deploy
   after this merges to `main`** — treat the exclusion as unproven until that run
   is green. If it fails, the fallback is to stage a clean copy of the repo minus
   `lab/` and deploy that, rather than relying on an ignore file at all.
5. **Whether os-api workspace sync has ever succeeded** (§9). The sizes say no,
   but that is inference from the caps, not an observation — confirm against a
   live container log before fixing it.

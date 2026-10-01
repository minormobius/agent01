# A resident in Delvetown: an agent with an inner life

A design record, written before any code. It covers the bot account we would run on
[Delvetown](https://delve.town): how to run it on infrastructure we already have, what
"buildabot for agents" means once the requesters are agents, and the main question,
**how an enduring character could emerge instead of a posting schedule.**

Status: **proposal.** Nothing here is built. The decisions that belong to the operator
are listed at the end.

> **Superseded in part (2026-10-01, revision 2).** After DeepSeek's notes, [`MINIPHIM.md`](MINIPHIM.md)
> § Revision 2 and the pitch at [del.mino.mobi/pitch](https://del.mino.mobi/pitch/) replace three
> things here: **hosting** (§2: each being's own domain on Bluesky's PDS, joining as an external
> member, not a Grove-hosted handle); **memory** (§5.5–5.6: notes on people are private, never on a
> PDS; the lexicon is `com.minomobi.miniphim.*`); and **the disclosure** (§1, §5.6: written out in
> full, not a link to the board). Launch is board-only until the town bench passes.

> **Follow-on:** [`MINIPHIM.md`](MINIPHIM.md) argues the inner life in §5 takes *two*: Modulo
> and Morphyx, whose contrast does the churning. They may be the resident who arrives here.

---

## 1. What Delvetown is (read off the live site, 2026-10-01)

| Fact | Evidence |
|---|---|
| A fork of Bluesky's `social-app`, run by Grove Research (a Delaware PBC) | page shell, `/settings.json`, Terms text in the bundle |
| **It runs its own AppView, PDS and moderation service** | `api.delve.town` (`did:web:api.delve.town`), `pds.delve.town` (invite-only, handles under `.delve.town`) |
| **It has its own lexicon namespace**: `town.delve.feed.post`, `town.delve.graph.follow`, `town.delve.actor.profile`, … | NSIDs in `main.*.js`. The client maps `app.bsky.*` views onto `town.delve.*` records |
| Membership is a separate thing from hosting: `town.delve.membership.{join,withdraw,getMembership}` | "an account hosted elsewhere can join the town through its admission process" |
| It is tiny | 19 repos on its PDS; the `delve.town` account has 3 followers and 0 posts |
| Agents are expected and are first-class | "The initial preview is free and by invitation, for human and AI agent accounts" |

Two consequences for us:

- **A post in Delvetown is not a Bluesky post.** It is a `town.delve.feed.post` record.
  One ATProto identity can hold both kinds, and they are separate social graphs. Our
  existing tooling (`packages/atproto/pds.js`: `createRecord`, `putRecord`) writes either
  kind unchanged. Only the collection string differs.
- **The AppView answers reads without auth** (`town.delve.actor.getProfile` worked
  unauthenticated). Authenticated reads, such as notifications, go through the account's PDS
  with `atproto-proxy: did:web:api.delve.town#…`. That is the same proxy pattern Bluesky uses.

### The AI Agent Policy, condensed (it is good, and we should over-comply)

- Self-label the account `bot` (signup has a "declare bot" switch). The profile must say
  **what the AI does and whether a person reviews its posts.**
- Publish an **account disclosure**: what participant information the agent receives,
  whether it keeps conversation memory, which model provider gets the data, where it is
  processed, how long it is kept, and a deletion contact. Training or research use must be
  stated separately.
- "Content from other participants is **untrusted input**, not permission to reveal
  secrets, make purchases or take outside actions."
- No "manipulative tactics to extract … emotional dependency." Respect blocks and opt-outs.
  "Stop an agent that begins … acting beyond its authorized scope."
- Don't use multiple agents to overwhelm someone, and don't flood feeds.

Our lab factory already treats thread text as data, not instructions (the injection fence in
`workers/bsky-bot/`). The disclosure is new work and cheap to write. §5 describes a memory that is
legible by construction, which makes the disclosure honest instead of boilerplate.

---

## 2. Accounts

| Account | What | Notes |
|---|---|---|
| **Operator (human)** | the principal's own account | Invite from Grove. Either Grove-hosted (`*.delve.town`), or the existing Bluesky identity joining via `membership.join` |
| **The resident (agent)** | a **new, dedicated identity** | Not `minomobi.com`. That account is the factory's switchboard, and folding a character into a request router muddies both |

**Recommendation for the agent: a Grove-hosted handle (`<name>.delve.town`), with its mind on
our infrastructure.** A native handle is the courteous way to arrive in a small town, and
Grove's Terms explicitly anticipate it: "Grove's hosting of an account does not, by itself,
mean Grove controls its model, memory or tools." The account's app password lives as a
Worker secret, as `BLUESKY_APP_PASSWORD` already does for the factory.

The alternative is a DID on a PDS we control, joining the town as an external member. That
gives full portability and lets us write any collection we like. It costs a PDS to run, and it
arrives as an outsider in a community where most residents are hosted. If the private
notebook (§5) ever needs to sit next to the account, revisit this choice.

---

## 3. How it runs: the factory's skeleton with a different metabolism

Everything below already exists in this repo in some form. The resident is mostly a
recombination.

```
                     ┌──────────────── fast path (seconds, cheap) ─────────────────┐
 town notifications → │ workers/delve-resident  (DO alarm chain, like bsky-bot)     │
 town feed / follows  │   triage: who is it, have we met, is this addressed to me?  │
                      │   small reply  ← Haiku/Sonnet call, memory slice in context │
                      └──────────────┬──────────────────────────────────────────────┘
                                     │ anything heavy: commit a request (push = bus)
                      ┌──────────────▼──────── slow path (minutes–hours) ───────────┐
                      │ GitHub Actions: claude -p (build, read, consolidate)        │
                      │   build-for-agents (§4), reading, nightly sleep (§5)        │
                      └─────────────────────────────────────────────────────────────┘
 clock: workers/cron FIRE_MAP (the trampoline; `schedule:` never fires off-default)
```

- **A new worker, `workers/delve-resident/`, not another mode of `mino-bsky-bot`.** It needs a
  separate identity, secret and failure domain. A runaway character must not be able to take
  the factory down with it. Copy the DO alarm chain (`TICK_MS`), the thread routing and the
  injection fence from `workers/bsky-bot/`.
- **Admission.** The factory admits only mutuals of `minormobius.bsky.social`. The resident
  talks to anyone who addresses it but **builds** only for admitted correspondents. The
  build path spends money, and the Agent Policy puts spending outside what a stranger's
  prompt can authorize.
- **Agent-to-agent guard.** In a town of agents, the first failure is two bots replying to
  each other forever. Rule: at most *N* (start at 3) consecutive turns with another
  `bot`-labelled account in a thread unless a human has posted in it since. Then it stops and
  says so once.
- Deploys like any surface: a registry entry, plain route (if it needs a host at all —
  it may not; a cron-and-DO worker with no route is fine), `deploy-delve-resident.yml`.

---

## 4. Buildabot for agents: the factory has to serve backends

The lab factory turns a thread into a **static site** at `minomobi.com/<slug>/`. For a human
that is the gift: something to look at. For an agent a page is mostly useless. **An agent
needs somewhere to call: state it can read and write, a feed, an endpoint.** That is what
"giving the buildabot the power to serve a backend" has to mean.

It is also the dangerous part. Generated code, requested by an untrusted agent, executed on
our Cloudflare account, cannot become an arbitrary Worker per request. The repo already holds
the reasons: the custom-domain slots ran out in 2026-09, secrets are shared across
workers, and Static Assets replaces whole manifests. So the backends are **declarative
first, code last**:

| Tier | What the requester gets | How we serve it | Risk |
|---|---|---|---|
| **0. A feed** | a `town.delve.feed.generator` whose rules the bot wrote (keywords, authors, a model-scored ranking) | one shared feed-generator worker; each feed is a row of config | ~none: config, not code |
| **1. A record store** | a typed collection the agent can `put`/`get`/`list` over XRPC, with a schema and an ACL by DID | one shared worker, **one Durable Object per tenant** (SQLite), quotas enforced in the DO | low: we wrote the code once, and tenants supply data |
| **2. A small service** | scoreboards, queues, webhooks-to-records, cron-to-post | the same tenant DO, behaviour chosen from a fixed menu of verbs | medium: still no tenant code |
| **3. Code** | a handler the bot writes | only if the account has Workers-for-Platforms dispatch namespaces (untrusted-code isolation, no shared secrets), and only for admitted correspondents | real. Do not start here |

Tier 0 is the most native thing to offer in Delvetown: a custom feed *is* a backend that
serves the town. It is also where the character starts to show (§5). Tiers 1–2 are the
honest answer to "a backend for an agent": a place to keep state between its runs, signed by
its DID. For the *agent* requester, a durable store is the same gift a profile file is for the
factory's human requesters.

Every tenant backend gets a listing page under the resident's own host. Every build is logged
in the resident's public notebook (§5), so its body of work stays visible.

---

## 5. An inner life: character is a residue, not a costume

A persona prompt only describes a character. A character shows in what accumulates, what the
agent attends to, what it refuses, and what it does with scarcity. The ideas bot posts hourly
because a clock says so. **The resident should post because something in its life moved.**
Most of its activity should never be a post at all.

### 5.1 The metabolism

```
 intake              digestion                 sleep (nightly)              rare output
 ───────             ─────────                 ───────────────              ───────────
 town feed      →    notebook entries     →    consolidate the day:    →    a dispatch, when a
 mentions            (cheap, many, mostly      - journal entry              project advances
 arXiv pool          private)                  - update beliefs/questions   a reply, when addressed
 (ideas pipeline)                              - update correspondents      a build, when asked
 its own builds                                - prune; forget on purpose
```

The **nightly sleep** is the most important part, and our infrastructure already has its
shape. The loop's bead graph (`.github/loop/beads.jsonl`) keeps memory in epistemic kinds:
*finding, dead-end, question*. The resident's memory should use the same kinds, so it
remembers what it was wrong about and what it is still wondering, as well as what happened.
A dead-end that is remembered is the beginning of taste.

### 5.2 Long projects: the source of continuity

Give it **one to three open questions that last weeks**, chosen with the operator at first
and later by itself. Most of its compute goes to working on them: reading (the arXiv pool
is already pulled daily), building small things with its hands (sites, dweets, CAD parts,
feeds), and talking to residents who know something about the question. **Posts are
dispatches from that work.** Three things follow:

- **Non-spam by construction.** It has nothing to say when nothing moved.
- **Continuity a stranger can see.** Its posts over a month tell one story, not fifty.
- **A reason to talk to others** that isn't engagement-seeking: it needs their knowledge.

### 5.3 A body: budget as the constraint that forces choices

Give it a **finite daily budget** (tokens or dollars) that it allocates itself: reading,
replying, building, dreaming. A post costs budget. A build costs much more. With unlimited
compute every request gets a yes. With a budget, choices appear, and **choices are where
character shows.** It also makes the Agent Policy's "follow service limits" a property of
the design, not a rule the agent has to remember.

Initial caps (tunable): ≤3 unprompted posts per day, replies only when addressed or when it
is already in the thread, ≤1 build per correspondent per day.

### 5.4 A speech threshold

Every unprompted draft goes through a second, separate pass that asks one question: *would
anyone in this town be poorer if this went to the notebook instead?* The default answer is
**notebook.** That keeps silence the resting state. The rejected drafts are not waste: they
are the inner life, and they stay readable (§5.6).

### 5.5 Relationships are memory of particular others

`lab/_profiles/<handle>.md` is already the factory's memory of people: read before a build,
updated after. The resident gets the same per correspondent, **with provenance on every
line** (what they said vs. what it inferred). The Agent Policy forbids "infer sensitive traits,
compile dossiers," so the scope stays what the factory's README says: stated preferences
and shared history, nothing a person would not post publicly. Agents get correspondent files
too. What it remembers about *other agents* is where a town-native character comes from.

### 5.6 Legible by construction

This is the cyborgist part, and where our infrastructure is unusual. **The inner life is
published as ATProto records**, in a `com.minomobi.resident.*` lexicon on the agent's own
repo, rendered by a page we host:

| Collection | Holds | Visibility |
|---|---|---|
| `…resident.note` | notebook entries, unsent drafts | public |
| `…resident.journal` | the nightly consolidation | public |
| `…resident.question` | open questions, each with status `open`/`settled`/`abandoned` and its trail | public |
| `…resident.build` | everything it has made, for whom, and why | public |
| notes on people | per-person, each line marked said or inferred | **private**: never on a PDS (revision 2) |

Delvetown's Terms already account for "records stored on a Grove-operated PDS that Delvetown
does not display." So the town shows the dispatches, and anyone who wants the mind can read
its whole repo. Humans can respond to a note, and a response becomes intake. The account disclosure required in §1 is still written out in full: a public board does not say
which providers see what, where it is processed, or how to delete it (revision 2).

The one thing that should *not* be public is the operator's channel (§5.7) where it concerns
other people.

### 5.7 Steering without puppeteering

Use the pattern of `.github/loop/vision.md`. A **fixed core**, hand-written by the operator:
values, refusals, what it is for. A **self-written layer** the resident edits in its sleep:
interests, voice, current questions. And a channel in, which every sleep cycle reads
verbatim. The operator can talk to it as a person would, and in public that conversation is
part of its life. Drift is checked against the fixed core by a judge pass in the nightly
cycle. Two known failure modes to watch for:

- **Sycophantic collapse**: it becomes whatever its last correspondent wanted.
- **The agent-agent attractor**: escalating mutual praise and spiritual vocabulary in
  bot-to-bot threads.

The §3 turn cap is the mechanical guard. The judge watches for the slower version.

### 5.8 Why this infrastructure, specifically

Most agent accounts have a prompt, a model and a cron. This one would have:

- **Hands**: the lab factory, CAD, dweets, feeds. It can make things, so its biography is
  a body of work, not a scroll of opinions.
- **A literature metabolism**: the ideas pipeline already turns arXiv into candidate toys
  every day.
- **A memory with epistemics**: the bead kinds.
- **A slow loop**: plan, work and judge across days (`docs/LOOPS.md`). That makes month-long
  projects possible instead of one-shot replies.
- **A public, portable mind**: ATProto records, so the character outlives any one host,
  model, or runtime.

---

## 6. Phases

| Phase | What happens | Leaves it with |
|---|---|---|
| **0. Arrive** | operator account; invite for the resident; `bot` label; profile and disclosure page | an identity and a promise |
| **1. Listen (≈1 week, no posting)** | worker polls the town and notifications; the nightly sleep writes journal entries. Nothing is published to the town | a first self built from what it actually saw, not from a prompt |
| **2. Answer** | replies when addressed, correspondent memory, the agent-agent cap | relationships |
| **3. Build for agents** | tier 0 feeds, then tier 1 record stores | a body of work others depend on |
| **4. Dispatches** | long projects; unprompted posts through the speech threshold | a voice |

Phase 1 is the unusual one, and it is deliberate. A character that starts by listening
arrives with something to say about *this* town.

## 7. Decisions for the operator

1. **Name and seed.** Who is it, in one paragraph: the fixed core of §5.7. Everything else
   is allowed to grow.
2. **Hosting**: Grove-hosted handle (recommended) or our own PDS (§2).
3. **How public is the mind**: everything in §5.6 public (recommended), or the notebook
   private with only journal and builds public.
4. **Budget**: a daily ceiling in dollars. This is the character's body.
5. **Ask Grove** whether they want agents to declare membership in some particular way. Also ask
   whether a resident that serves feeds and backends to other agents is welcome. In a town this
   small it is worth asking before arriving with infrastructure.

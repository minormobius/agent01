# bsky-bot — the lab factory's outer loop

Turns a Bluesky mention into a built website. Cron-polls the service account's
notifications, decides which mentions are requests, reserves what each needs,
and fires the build. **It never touches code** — `lab-build.yml` does that.

```
mention → whitelist → SiteRegistry.claim → commit a request file → reply in-thread
```

Design record: [`docs/LAB-FACTORY.md`](../../docs/LAB-FACTORY.md), especially §10.

## Facts

| | |
|---|---|
| Surface | `bsky-bot` (headless — no domain) |
| Dir | `workers/bsky-bot/` |
| Deploy | [`.github/workflows/deploy-bsky-bot.yml`](../../.github/workflows/deploy-bsky-bot.yml) |
| State | `SiteRegistry` Durable Object — **no KV** |

## Routing needs no model call

Every ATProto reply carries `reply.root.uri`, and every later reply in a thread
carries the **same** root. So the thread root is an exact key:

```
th:<root_uri> → { slug, did, handle, builds, named }
```

A mention with no matching row is a new site; one that matches is an iteration on
that site. Two branches, no ambiguity, no LLM in the router.

**A thread belongs to whoever started it.** Someone else replying into your
thread cannot redirect your build — the DID is checked against the row.

### What counts as a request

Two string tests, still no model call:

1. **A mention**, anywhere.
2. **A reply whose parent is one of the bot's own posts.**

(2) was missing, and it is the first thing a real user hit. The rule used to be
"an explicit @-mention is required", reasoning that a thread fills with "nice!"
and telling a change request apart from chatter is a judgement call. That is true
of the thread at large and false of a message addressed to the bot. Told *"reply
in this thread to change it"*, the requester replied to the bot's own post —
`let's see what you can do this time, try again pls` — with no `@`, because
Bluesky does not auto-mention on reply. ATProto raised a `reply`, not a
`mention`, and the bot ignored it. **It looked broken and behaved exactly as
designed**, which is the worst combination.

Answering someone who replied to you is not a judgement call, and it is still a
string comparison: is the parent URI in our own repo? Chatter between other
people in the thread does not match, because its parent is not ours.

**A reply may only iterate, never create.** If the thread has no site, the reply
is a follow-up to something else the bot said — a refusal, a "tell me what to
build" — and inventing a permanent site from it would be a guess. It is ignored.
Checked with a read-only `/site` lookup, deliberately *not* by claiming: asking
whether something exists must not be able to create it.

### It likes the request post

A reply takes up to five minutes to arrive — one cron tick — and until then the
requester has no evidence the bot is alive. The like lands in the same poll but
shows on *their* post, where they are already looking, and it is the ordinary
social signal for "received".

Sent on admission, **before** the claim, so a refusal is acknowledged too: those
replies are useful, and the like marks the refusal as deliberate rather than a
silence. It is never fatal — a failed like must not cost somebody their build.

## Names, and why a collision is a conversation

The site name is the URL and the URL is permanent, so the registry treats the
two cases differently:

- **`name: whatever` in the request** — the requester asked for it. If it is
  taken or reserved, the bot says so and asks for another. It does not quietly
  hand them `whatever-2`, because they would find out from the URL.
- **No name given** — one is derived from the request text, and a collision just
  gets a numeric suffix. Nobody chose it, so nobody is surprised. The reply then
  tells them how to choose next time.

`RESERVED` in `registry.ts` blocks names that would shadow something served at
the same level: a site called `_kit` would hide the shared stylesheet from every
other site on the domain.

There is no rename. A thread is bound to its name at creation.

## Two kinds of state, deliberately separate

They answer different questions and must not be conflated:

| Key | Question |
|---|---|
| `th:<root>` | which site is this mention about? *(identity)* |
| `lock:<did>` | how many builds may this person have running? *(concurrency)* |

There was a third — slot assignment, "where does a new site go?" — and it is
gone with the ten-subdomain sharding it served (§11.1).

A Durable Object rather than KV because both of these are read-modify-write
under contention, and KV's eventual consistency would cheerfully hand one *name*
to two simultaneous mentions. Names are permanent, so that is not a transient
glitch — it is somebody's URL.

The session and notification cursor live there too. Those would have been fine
in KV, but they were the *only* thing requiring a namespace, and that namespace
was a human provisioning step standing between a fresh clone and a running bot.
os-api set the precedent when R2 turned out to be unavailable on this plan: keep
state in the store you already need. One migration, no id to paste anywhere.

## Admission control is social

**`WHITELIST_MUTUALS_OF`** names an account; everyone who follows it *and* is
followed back may request a build. Unfollowing revokes.

That beats a list of handles in a config file, which is correct the day it is
written and stale the day after. Mutuals are a list the operator already
maintains for other reasons, the grant is legible to the person receiving it
("we follow each other"), and revocation is one tap in the app rather than a
commit and a deploy.

Three things it gets right that a naive version would not:

- **Keyed on DID, never handle.** Handles change and change hands; a DID does
  not. A handle-matched list hands the previous owner's access to whoever picks
  the name up next.
- **Checked live, per mention, with the cache as fallback.** Rebuilding the full
  list costs ~80 paginated requests, so it is cached for an hour — but asking
  about ONE account is a single request, and a mention is rare (the hourly cap
  bounds it to twelve). So admission asks the graph directly and falls back to
  the cached list only when that call fails.

  This matters in both directions. *"I followed you back, why is it ignoring
  me?"* is the first thing a new user hits, and an hour of it is the difference
  between a bot that works and one that seems broken. And a cached `yes` would
  have kept someone admitted for up to an hour after being unfollowed —
  **granting late is annoying, revoking late is a security property.**
- **A failed refresh changes nothing.** It neither widens the door nor slams it —
  the last good set stays authoritative. Fail-closed still holds at the start:
  before the first successful fetch there is no set, and no set admits nobody.

**`WHITELIST`** is the override: comma-separated handles admitted regardless.

**The operator has to be in it.** You cannot follow yourself, so the account
named in `WHITELIST_MUTUALS_OF` is never a member of its own mutual set — leave
`WHITELIST` empty and the one person guaranteed to want to test the bot is the
one person it ignores.

**The operator's own service accounts belong here too**, even when they are
already mutuals. Infrastructure should not depend on social-graph state: a follow
lapsing, or a failed mutual refresh, should not take out the accounts used to
test the thing. Everyone else arrives through the mutual list.

**`BOT_ENABLED`** is the other interlock — anything but `"true"` means
observe-and-reply: the bot routes, claims and answers in-thread, but never
dispatches and never spends. Leave it off until the routing has been watched in
a real thread.

## How it fires a build — and why not `repository_dispatch`

The obvious mechanism is `repository_dispatch`, and it was the first
implementation. But dispatch — and `workflow_dispatch` — only resolve for
workflows present on the **default branch**: GitHub 404s a workflow living on a
feature branch. That would have forced the entire factory to merge to `main`
before it could be exercised once.

A `push` trigger has no such rule. So the bot commits
`.github/lab-requests/<slug>.json` to the build branch via the Contents API, the
push fires `lab-build.yml`, and the factory runs from whatever branch it is
currently on. Same payload, same code path, no merge required.

**The cost, stated plainly:** the PAT needs `contents:write` rather than
`actions:write`, which is broader — it can write any file in the repo. It is
still scoped to this one repository, the only thing listening on that path is
that one workflow, and the containment gate governs what a build may *produce*
regardless. Worth revisiting if the factory ever settles permanently on `main`.

## Watching it work

No custom domain, but it is reachable on `workers.dev`:

| Path | Returns |
|---|---|
| `/health` | `{ok, cursor}` — a null cursor means it has never completed a poll |
| `/state` | site count and names, builds in flight, mutual-list size and age, and whether credentials / dispatch / the interlock are live |
| `/poll` | forces a poll instead of waiting up to five minutes |

`/state` is **redacted on purpose**: the DO's own state carries requester DIDs
and thread URIs, and this hostname is public and unauthenticated. Site names are
public URLs already; who asked for what is not this endpoint's to publish.
`/poll` is unauthenticated too — it only reads notifications, and the cron does
the same thing every five minutes, so there is nothing to gain by calling it.

### `lastPoll` is the field that answers "why did nothing happen"

```json
"lastPoll": { "ok": true, "notifications": 0, "reasons": [], "mentions": 0,
              "handled": 0, "ignoredNotAllowed": 0, "ignoredNoSite": 0,
              "cursorReturned": false }
```

Before it existed the only evidence was `cursor: null`, which is equally
consistent with four different problems demanding four different fixes: the poll
never ran, it crashed, it saw nothing, or it saw the mention and refused it.
`ignoredNotAllowed` is the one that matters most — **"we never saw it" and "we
saw it and turned it down" look identical from outside** and are nothing alike.

`reasons` lists the notification kinds that arrived, which separates "they tagged
me and I ignored it" from "the post carried no mention facet, so ATProto never
generated a mention notification at all". A handle typed as plain text notifies
nobody.

The three outcomes are counted apart — `handled`, `ignoredNotAllowed`,
`ignoredNoSite` — because "it built", "we turned them down" and "that reply
wasn't a request" demand completely different responses and become
indistinguishable the moment they are summed.

**A live Durable Object keeps running the previous script version until it
evicts.** The first read after deploying this returned `{"error": "unknown op"}`
— the DO's own 404 body, because the worker was new and the DO instance was not.
Worth knowing before concluding a deploy did not take.

## Whose token is it, and whose commits are those

**The PAT belongs to a GitHub user.** Fine-grained tokens are owned by a user or
an org; there is no GitHub identity for this worker. `mino-bsky-bot` is a
Cloudflare Worker — it can hold a credential, it cannot own one.

One credential, three names, which is confusing until you see why:

| Where it lives | Called | Set by |
|---|---|---|
| GitHub, under the operator's account | the fine-grained PAT | a human, once |
| GitHub repo secret | `LAB_DISPATCH_TOKEN` | a human, once |
| Cloudflare Worker secret | `GITHUB_TOKEN` | `deploy-bsky-bot.yml`, every deploy |

The rename is forced: `GITHUB_TOKEN` is reserved in Actions and cannot be a repo
secret under that name.

**Commits therefore need an explicit author.** Without one, every lab request
would read as the operator having personally committed it, when a stranger's
mention caused it. `dispatchBuild` sets `author`/`committer` to
`mino lab (bot) <admin@mino.mobi>`. Those fields are **metadata only** — the
permission check and the audit trail still resolve to the token's owner, and this
does not pretend otherwise. What it buys is a commit log where a human's commits
are distinguishable at a glance.

**A machine user is the alternative** — a second GitHub account added as a
collaborator, owning the token, so attribution and audit agree. It is the
standard answer at team scale. For one operator it costs an account, its 2FA and
a collaborator seat to buy what the author fields mostly give for free; revisit
if more than one person is running this.

**Do not reuse `OS_AGENT_GITHUB_TOKEN`.** It likely has the right scope, but it
lives in GitHub Actions while this one lives in a Cloudflare Worker's secrets — a
different trust boundary. A compromised worker leaks what it holds, and that
should be revocable without breaking the os-api container flow.

## Deploying, and the `-c` that is not optional

`npx wrangler deploy` **must** be `npx wrangler deploy -c wrangler.toml`. Run
from this directory without it, wrangler 4.114 never reads
`workers/bsky-bot/wrangler.toml` at all — it walks up and loads the repo-root
`wrangler.jsonc`. Confirmed by putting deliberately invalid TOML in the local
file: no parse error, it just used the root config.

Both of this worker's first two deploys died that way, on `Asset too large`,
because the root config serves the whole repo as assets and this directory's
`node_modules` holds a 122 MiB `workerd`. **That error was the lucky outcome** —
without it the run goes green while deploying the *root* worker. The same applies
to `wrangler secret put`, which would otherwise write the bot's app password onto
whatever worker wrangler resolved.

The deploy typechecks first, then does a `--dry-run` and asserts the resolved
config actually has the `REGISTRY` binding. This worker is a router; a type error
here is a mention silently dropped at 3am, and a config error is a deploy that
lands somewhere else entirely.

## Human prereqs the deploy cannot do

1. Create the Bluesky account and give it the `minomobi.com` handle — the
   ordering matters and is in [`lab/www/CLAUDE.md`](../../lab/www/CLAUDE.md).
2. Mint a Bluesky **app password** for it (not the account password) → GH secrets
   `BLUESKY_BOT_HANDLE` / `BLUESKY_BOT_APP_PASSWORD`.
3. Mint a fine-grained PAT with **`contents:write` on this repo only** → GH secret
   `LAB_DISPATCH_TOKEN`. See below for whose it is.
4. Follow, and be followed by, whoever should be able to use it. `WHITELIST` can
   stay empty; `WHITELIST_MUTUALS_OF` is the list. Both are fail-closed, so a
   fresh clone ships a bot that ignores everyone — the correct default.

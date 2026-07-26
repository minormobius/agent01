# bsky-bot — the lab factory's outer loop

Turns a Bluesky mention into a built website. Cron-polls the service account's
notifications, decides which mentions are requests, reserves what each needs,
and fires the build. **It never touches code** — `lab-build.yml` does that.

```
mention → whitelist → SlotRegistry.claim → commit a request file → reply in-thread
```

Design record: [`docs/LAB-FACTORY.md`](../../docs/LAB-FACTORY.md), especially §10.

## Facts

| | |
|---|---|
| Surface | `bsky-bot` (headless — no domain) |
| Dir | `workers/bsky-bot/` |
| Deploy | [`.github/workflows/deploy-bsky-bot.yml`](../../.github/workflows/deploy-bsky-bot.yml) |
| State | `SlotRegistry` Durable Object — **no KV** |

## Routing needs no model call

Every ATProto reply carries `reply.root.uri`, and every later reply in a thread
carries the **same** root. So the thread root is an exact key:

```
th:<root_uri> → { slug, slot, did, handle, builds }
```

A mention with no matching row is a new site; one that matches is an iteration on
that site. Two branches, no ambiguity, no LLM in the router.

**An explicit @-mention is required to act.** A thread collects "nice!" and other
chatter, and deciding whether a reply is a change request is exactly the sort of
judgement that would otherwise want a model. Requiring the mention makes it a
string test.

**A thread belongs to whoever started it.** Someone else replying into your
thread cannot redirect your build — the DID is checked against the row.

## Three kinds of state, deliberately separate

They answer different questions and must not be conflated:

| Key | Question |
|---|---|
| `th:<root>` | which site is this mention about? *(identity)* |
| slot assignment | where does a new site go? *(capacity)* |
| `lock:<did>` | how many builds may this person have running? *(concurrency)* |

A Durable Object rather than KV because identity and concurrency are
read-modify-write under contention — KV is eventually consistent and would
cheerfully hand one slot to two simultaneous mentions.

The session and notification cursor live there too. Those would have been fine
in KV, but they were the *only* thing requiring a namespace, and that namespace
was a human provisioning step standing between a fresh clone and a running bot.
os-api set the precedent when R2 turned out to be unavailable on this plan: keep
state in the store you already need. One migration, no id to paste anywhere.

## Two independent safety interlocks

Both in `wrangler.toml` [vars], both fail-closed:

- **`WHITELIST`** — comma-separated handles. **Empty admits nobody.** This is the
  admission control the bot that inspired this project lacked; it was pulled for
  cost because anyone could trigger it.
- **`BOT_ENABLED`** — anything but `"true"` means observe-and-reply: the bot
  routes, claims and answers in-thread, but never dispatches and never spends.
  Leave it off until the routing has been watched in a real thread.

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

## Human prereqs the deploy cannot do

1. Create the Bluesky account and give it the `lab.minomobi.com` handle — the
   ordering matters and is in [`lab/_site/CLAUDE.md`](../../lab/_site/CLAUDE.md).
2. Mint a Bluesky **app password** for it (not the account password) → GH secrets
   `BLUESKY_BOT_HANDLE` / `BLUESKY_BOT_APP_PASSWORD`.
3. Mint a fine-grained PAT with **`contents:write` on this repo only** → GH secret
   `LAB_DISPATCH_TOKEN`.
4. Put real handles in `WHITELIST`. It is fail-closed: empty ships a bot that
   ignores everyone, which is the correct default.

## Deploying

Pushes to the owning branch touching `workers/bsky-bot/**` deploy it. The deploy
typechecks first: this worker is a router, and a type error here is a mention
silently dropped at 3am.

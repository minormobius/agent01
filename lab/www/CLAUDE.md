# lab — minomobi.com

The lab factory, and every site it has built. Three jobs: the landing page, the
tenant sites themselves at `minomobi.com/<name>/`, and
`/.well-known/atproto-did`, which is what lets the Bluesky service account hold
its handle.

Design record: [`docs/LAB-FACTORY.md`](../../docs/LAB-FACTORY.md).

## Facts

| | |
|---|---|
| Surface | `lab` |
| Dir | `lab/www/` |
| Endpoint | minomobi.com (plus `lab.minomobi.com`, an alias) |
| Worker | `lab` (has a `worker.js` — not assets-only) |
| Deploy | [`.github/workflows/deploy-lab.yml`](../../.github/workflows/deploy-lab.yml) |
| Owning branch | `claude/lab-www` — the shared publish branch every build merges into |

## The whole domain is the quarantine

`minomobi.com` carries agent-generated content **and nothing else**. That is the
entire isolation story, and its value is that it needs no exceptions remembered:
there is no "except the /os path" to get wrong later. Everything that used to
live here moved to `*.mino.mobi`, and the two are separate registrable domains,
so they share neither cookie scope nor reputation. A site here that gets
blocklisted cannot take `auth.mino.mobi` down with it.

The one thing a human must do: **detach `minomobi.com` from the root Pages
project** in the dashboard — Workers & Pages → the root Pages project → Custom
domains → remove `minomobi.com`. Dashboard-only
([`docs/DEPLOYS.md`](../../docs/DEPLOYS.md) §7).

Until then the deploy goes **red on the route step while still shipping the
code**, because wrangler uploads before it attaches:

    Hostname 'minomobi.com' already has externally managed DNS records
    (A, CNAME, etc). Delete them first or try a different hostname. [code: 100117]

It is the DNS record Pages created for its custom domain that blocks the worker,
which is why detaching the domain is the fix rather than editing DNS by hand.
`lab.minomobi.com` is already bound, so it keeps serving each build meanwhile —
a red run here does not mean the site is stale.

## What a lab site is allowed to reach

`worker.js` puts a CSP on every response — see `harden()`. The directive that
matters is:

    connect-src 'self' https://public.api.bsky.app https://plc.directory

No `wss:`, so a page cannot open a Jetstream socket; no PDS host, so it cannot
pull blobs the AppView would have withheld. Added by the worker on the way out,
which is the one place an agent-written page cannot reach.

The rule it enforces: **a site may show media for a subject the visitor named,
never from a stream the visitor did not name.** `scripts/lab-content-gate.mjs`
enforces the same thing at build time as a fail-closed allowlist of XRPC methods,
and `kit.bskyGet`/`kit.visible` make the safe path the easy one.

This exists because of a specific death: the bot this project is modelled on was
killed by "pull cat images from the firehose". `cat/` in this repo is the same
shape and never processes deletes. Full reasoning in
[`docs/LAB-FACTORY.md`](../../docs/LAB-FACTORY.md) §11.2.

Widening `connect-src` means widening the gate's allowlist and the kit's, all
three. That is deliberate friction.

## Names are permanent

A site is one subdirectory. The requester picks the name — `name: whatever` in
the request — and `minomobi.com/<name>/` keeps resolving. Iterating reuses the
name, the directory, and the durable `claude/lab-<name>` branch.

There is no lease and no eviction. The earlier design sharded sites across ten
subdomains of a hundred, which was defending against a Static Assets limit of
**100,000 files per version** on the Paid plan — a thousand single-page sites is
about 4% of it. See [`docs/LAB-FACTORY.md`](../../docs/LAB-FACTORY.md) §11.1.

`tenants.json` is a build artefact: `gen-lab-tenants.mjs` lists the directories
immediately before `wrangler deploy`, so the landing page cannot drift from
what is actually on disk and no agent has to remember to register itself.

## Why a worker and not just assets

Because of one endpoint. `/.well-known/atproto-did` must return the service
account's DID as a bare string — and you cannot know that DID until the account
exists. Serving it from a `BOT_DID` var makes it a config change; a committed
file would make it a code change, and the ordering below would be worse.

While `BOT_DID` is unset the worker returns a **503 explaining why**, not a 404.
A 404 there is indistinguishable from a broken deploy.

## Setting up the Bluesky account — the ordering matters

The handle and the DID are mutually dependent, so this only works one way round:

1. **Create the account** at bsky.app with any throwaway handle
   (`labminomobi.bsky.social`). Register it to **`admin@mino.mobi`**, which
   forwards to a real inbox — see below.
2. **Read its DID.** Settings → Account, or
   `https://public.api.bsky.app/xrpc/com.atproto.identity.resolveHandle?handle=<throwaway>`.
3. **Set `BOT_DID`** in `wrangler.jsonc` `[vars]` and push. The deploy verifies
   the endpoint is serving a `did:` and warns if not.
4. **Change the handle** in Bluesky settings. Both `minomobi.com` and
   `lab.minomobi.com` route to this worker, so either verifies; the apex is the
   better one now that the whole domain is the factory.
5. **Mint an app password** for the account (not the account password) into GH
   secrets `BLUESKY_BOT_HANDLE` / `BLUESKY_BOT_APP_PASSWORD`.

Step 4 fails if step 3 has not deployed. That is the whole reason for the order.

## The email address

`admin@mino.mobi` does not need a mailbox — Cloudflare Email Routing forwards
it. [`.github/workflows/setup-email-routing.yml`](../../.github/workflows/setup-email-routing.yml)
creates the rule; it is idempotent and reconciles rather than duplicating.

It is on `mino.mobi` rather than `minomobi.com` deliberately: the bot's own
account recovery should not depend on the reputation of the domain it publishes
agent-generated sites to.

**One step is not automatable:** Cloudflare will not forward to a destination
until that address is verified, and verification is a link in an email only the
inbox owner can click.

Measured on run 3, correcting an assumption written here earlier: the destination
was **not** already verified by the existing `tips@`/`editor@`/`modulo@`/`morphyx@`
routing — those forward somewhere else. And this repo's `CLOUDFLARE_API_TOKEN`
can *read* the account's destination addresses but not *create* one; that
endpoint returns `10000: Authentication error`. So add the destination once in
the dashboard (Email → Email Routing → Destination addresses), click the link,
then re-run the workflow. Widening the token with Account → Email Routing
Addresses → Edit is the alternative, and saves nothing the first time: the
verification link has to be clicked either way.

## Deploying

Pushes to `claude/lab-www` touching `lab/**` deploy it — the kit too, because
`gen-lab-tenants.mjs` copies `lab/_kit/` in at build time and every tenant links
it same-origin.

Two branches converge here and they carry different things:

- **`lab-build.yml`** merges each finished site in. Sites live in disjoint
  directories, so those merges never conflict.
- **`publish-lab.yml`** merges infrastructure changes (this page, the kit, the
  worker) forward from whichever feature branch is being worked on.

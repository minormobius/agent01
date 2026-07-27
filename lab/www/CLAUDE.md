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

**DONE — the apex is bound.** `minomobi.com/`, `/atlink/`, `/handle/`,
`/_kit/tokens.css` and `/tenants.json` all serve from this worker, with the CSP
on every response. `lab.minomobi.com` still resolves as an alias.

Kept because it will be needed again for any surface that takes a domain from a
Pages project: while `minomobi.com` was still attached to the root Pages
project, this deploy went **red on the route step while still shipping the
code** — wrangler uploads before it attaches:

    Hostname 'minomobi.com' already has externally managed DNS records
    (A, CNAME, etc). Delete them first or try a different hostname. [code: 100117]

The blocker is the DNS record Pages created for its custom domain, so the fix is
detaching the domain in the dashboard (Workers & Pages → the Pages project →
Custom domains → remove), not editing DNS by hand. Dashboard-only
([`docs/DEPLOYS.md`](../../docs/DEPLOYS.md) §7).

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

**Two things measured here, both correcting assumptions written earlier.**

*Email Routing had to be enabled on `mino.mobi` separately.* The existing
`tips@`/`editor@`/`modulo@`/`morphyx@` are on **`minomobi.com`**, and this file
previously carried that fact over to the wrong zone and concluded the setup was
mostly done. It was a first-time setup. Now done — both zones carry Cloudflare's
MX, and `mino.mobi` has the SPF record:

    mino.mobi  MX  -> route1/2/3.mx.cloudflare.net
    mino.mobi  TXT -> v=spf1 include:_spf.mx.cloudflare.net ~all

**DNS is the ground truth for whether routing delivers**, not the control-plane
`enabled` flag. The workflow's first version read that flag without checking the
response was readable, and reported `enabled=false` for a correctly enabled zone.
It now falls back to an MX lookup when the API read fails.

*The destination was never verified either*, and the API token cannot create one
— that endpoint returns `10000: Authentication error`. It can read zones and read
destinations, so the workflow reports precisely where it stops.

The full sequence, once per zone:

1. `<zone>` → **Email** → **Email Routing** → Get started. Cloudflare writes the
   MX and SPF records itself. ✅ done for `mino.mobi`.
2. **Destination addresses** → Add the inbox → click the link in the mail
   Cloudflare sends.
3. Push anything touching `setup-email-routing.yml` (bump its marker). It creates
   the `admin@mino.mobi` → destination rule, idempotently.

Steps 1 and 2 are dashboard-only. Widening the token with Account → Email Routing
Addresses → Edit removes step 2's *creation* but not its verification click, so
it saves nothing the first time.

## Deploying

Pushes to `claude/lab-www` touching `lab/**` deploy it — the kit too, because
`gen-lab-tenants.mjs` copies `lab/_kit/` in at build time and every tenant links
it same-origin.

Two branches converge here and they carry different things:

- **`lab-build.yml`** merges each finished site in. Sites live in disjoint
  directories, so those merges never conflict.
- **`publish-lab.yml`** merges infrastructure changes (this page, the kit, the
  worker) forward from whichever feature branch is being worked on.

# lab — lab.minomobi.com

The lab factory's front door. Two jobs: a rollup index over all three slots, and
`/.well-known/atproto-did`, which is what lets the Bluesky service account hold
the handle **`lab.minomobi.com`**.

Design record: [`docs/LAB-FACTORY.md`](../../docs/LAB-FACTORY.md).

## Facts

| | |
|---|---|
| Surface | `lab` |
| Dir | `lab/_site/` |
| Endpoint | lab.minomobi.com |
| Worker | `lab` (has a `worker.js` — not assets-only) |
| Deploy | [`.github/workflows/deploy-lab.yml`](../../.github/workflows/deploy-lab.yml) |

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
   (`labminomobi.bsky.social`). Register it to **`admin@minomobi.com`**, which
   forwards to a real inbox — see below.
2. **Read its DID.** Settings → Account, or
   `https://public.api.bsky.app/xrpc/com.atproto.identity.resolveHandle?handle=<throwaway>`.
3. **Set `BOT_DID`** in `wrangler.jsonc` `[vars]` and push. The deploy verifies
   the endpoint is serving a `did:` and warns if not.
4. **Change the handle** in Bluesky settings to `lab.minomobi.com`. It reads the
   well-known and verifies.
5. **Mint an app password** for the account (not the account password) into GH
   secrets `BLUESKY_BOT_HANDLE` / `BLUESKY_BOT_APP_PASSWORD`.

Step 4 fails if step 3 has not deployed. That is the whole reason for the order.

## The email address

`admin@minomobi.com` does not need a mailbox — Cloudflare Email Routing forwards
it. [`.github/workflows/setup-email-routing.yml`](../../.github/workflows/setup-email-routing.yml)
creates the rule; it is idempotent and reconciles rather than duplicating.

**One step is not automatable:** Cloudflare will not forward to a destination
until that address is verified, and verification is a link in an email only the
inbox owner can click. The workflow triggers it and then tells you. The zone
already routes `tips@`/`editor@`/`modulo@`/`morphyx@`, so Email Routing is
enabled and the destination may already be verified from that setup.

## The rollup counts are live

Slot occupancy is fetched from each slot's own `tenants.json` at page load, not
baked in at build time. So this page cannot be staler than the slots are, and a
slot being down shows as `unreachable` rather than a confidently wrong number.

## Deploying

Pushes to the owning branch touching `lab/_site/**` or `lab/_kit/**` deploy it —
the kit too, because the rollup links the same stylesheet its tenants do.

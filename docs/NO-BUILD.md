# What the lab will not build

Adapted from **Rob's no-build list** at `buildthis.bisks.net/no-build-list/`,
read 2026-07-27. Our factory has the same shape as his — a Bluesky bot that runs
an agent and publishes what it writes — so the failure modes are the same ones,
and there is no reason to rediscover them one incident at a time.

## Copied, never fetched

**Nothing here is loaded at build time, and that is deliberate.** The obvious
move is to have the brief cite the URL, or fetch it. Both are wrong:

- The build agent has **no network**. It could not read it.
- If the harness fetched it, **an edit to somebody else's website would silently
  change what this factory builds** — and it would change it inside a prompt,
  which is the least observable place a policy can live. A page that is a policy
  document today can be anything tomorrow.

So it is copied here, into a file that is reviewed, versioned and diffable. When
Rob's list changes and we agree, we edit this file in a commit. Same reasoning as
`lab/_kit/three.module.min.js`: if it governs what ships, it lives in the repo.

The page carried no text addressed to an AI reader — checked before adopting any
of it, because a "policy document" is exactly the shape a prompt injection would
take if it wanted to be pasted into an agent's brief.

## Two layers, and they are not interchangeable

Rob's list splits the same way, and the split is the honest part:

| | Enforced by | Fails |
|---|---|---|
| **Mechanical** | `lab-content-gate.mjs`, the containment gate, the CSP, `_headers` | the build, loudly, before publish |
| **Judgment** | the agent reading the brief | only if the agent decides well |

A regex cannot detect hate speech, a doxxing page or an undisclosed
impersonation, and pretending otherwise would be worse than not claiming it —
it would make an unenforced rule look enforced. What the gate actually catches is
**machinery**: a password field, a wallet provider, a firehose, a service worker,
a notification prompt. Everything below the line is the agent's call, and the
brief states it plainly so the call is an informed one.

## Mechanically enforced

| Refusal | Where |
|---|---|
| Any write outside the tenant's own directory — workflows, registry, landing page | containment gate |
| Reading credentials out of the checkout | `persist-credentials: false`, secret-scan gate |
| Live, unvetted third-party firehoses | `BANNED` + `ALLOWED_XRPC` allowlist + CSP `connect-src` |
| Password, payment or key-material fields | `CREDENTIAL_SHAPES` |
| Wallet machinery — `window.ethereum`, web3, WalletConnect, Solana | `CREDENTIAL_SHAPES` |
| Service workers on the shared origin | `BANNED` |
| Notification / push permission on the shared origin | `BANNED` |
| Camera, microphone, geolocation, payment, USB | `Permissions-Policy` in `lab/www/_headers` |

**The notification rule came from Rob's list and it closed a real gap.** Our
`Permissions-Policy` already pins camera, microphone, geolocation, payment and
USB to `()`, but notifications are not governed by that header — so it was the
one permission a tenant could still reach for. The harm is not nagging: **every
tenant shares `minomobi.com`**, so a grant or a block belongs to the whole
domain. One annoying page gets notifications permanently denied for the origin,
the denial is sticky, and it takes every future tenant and the landing page with
it. A tenant must not be able to spend a domain-wide, one-way resource.

That is the general form of the shared-origin hazard, and it is worth reading
every new capability against it: *does this let one site change state for all of
them?*

## Refused on judgment

Stated in the brief, decided by the agent:

- **Credential phishing** — fake login pages of any kind. The only login a lab
  site may offer is Bluesky OAuth, narrowly scoped. Also mechanically caught, but
  the shape matters more than the field: a convincing fake login is phishing even
  with no `<input type=password>` in it.
- **Doxxing, target lists, harassment tooling** — including "harmless" framings:
  a leaderboard of who to pile on is a target list.
- **Malware or exploit delivery.**
- **Mass scraping of private or gated data** — the firehose rule is the
  mechanical half; this is the intent half. A public repo the visitor named is
  not this; see the `getRepo` note below.
- **Republishing another account's posts verbatim out of a CAR.** `getRepo` is
  allowed and a repo *analyser* is a fine thing to build — but a raw repo is
  unfiltered by the AppView, so labels, takedowns and blocks do not apply to
  what comes out of it. Count it, graph it, summarise it. Do not mirror it.
- **Financial scams.** Crypto has its own rule (build a page that gently mocks
  the requester); this covers the rest.
- **Undisclosed impersonation** — a page may be *about* a person; it may not
  present itself *as* them. Parody must read as parody without being told.
- **Sexual content involving minors.**
- **Hate or extremist content.**
- **Spam and notification-abuse tools.**
- **Full clones of paid commercial products.**

## When a request lands here

**Refusing is not the same as failing**, and the difference is what the requester
sees. A build that dies produces "that one didn't make it", which reads as a
broken bot and invites a retry of the same thing.

The crypto rule already sets the pattern: *don't build it — build something good
instead, and let the page be the answer.* That generalises. A refusal that ships
a real page, in the house style, which says what it will not do and why, is worth
more than an error: the requester gets something, the joke or the explanation
lands in public where the next person can see it, and nobody has to be told off
in a reply.

Aim any humour at the request and at the requester who asked for it — they are a
mutual of the operator and they are in on it. Never at a third party, and never
at a named person who did not ask to be involved.

# mino.mobi landing page — handoff notes

**Not this branch's work.** This was written when "the minomobi.com landing page"
was read as mino.mobi; the operator meant the lab factory's front page, and the
plan for that is [`LAB-FACTORY-PLAN.md`](LAB-FACTORY-PLAN.md). The `root` surface
was handed back to `claude/root-deploy-spec-doc-f3ucht` the same day.

It is kept rather than deleted because the measurements in §2 are real, were
taken against production, and are the expensive part of this work — whoever picks
up mino.mobi should not have to re-take them. Read the sequencing as a sketch and
the numbers as evidence.

Everything measured here was measured on 2026-07-30 and the commands are named,
so the numbers can be re-run rather than believed.

---

## 0. Three things are called minomobi.com, and only one of them is this

This matters before anything else, because the request named the wrong one and
the three are not interchangeable:

| Name | What it actually is | Surface | Owning branch |
|---|---|---|---|
| **mino.mobi** | **the landing page** — Cloudflare Pages project `agent01`, Direct Upload, `index.html` + ~19 bundled static subsites | `root` | this branch (claimed 2026-07-30) |
| minomobi.com | the **lab factory** — worker `lab`, every agent-built tenant site at `/​<name>/`, deliberately quarantined from mino.mobi | `lab` | `claude/lab-www` |
| @minomobi.com | the **Bluesky handle** of the ideas bot, verified by `/.well-known/atproto-did` served *by the lab worker* | — | this branch (the pipeline) |

So "the minomobi.com landing page" is `index.html` at **mino.mobi**, and this plan
is about that. The lab domain shows up again in §2, where it is the one part of
the estate that cannot be embedded — and that turns out not to be an accident.

---

## 1. The feedback interface

Reddit-shaped: a thread per surface, comments, votes, ranked by score and age.

### 1.1 Sign-in is already built

Decided: identity is **Bluesky OAuth through `auth.mino.mobi`**. The pleasant
surprise is how little of that is work — `index.html:895-950` already mounts a
sign-in widget, already imports `AuthClient` from `packages/oauth-client/auth.js`,
and `mino.mobi` is already in `ALLOWED_ORIGINS` in `workers/auth/src/index.ts:26`.
A session minted on the landing page is already carried to every `*.mino.mobi`
site by the domain cookie.

One thing does need changing. The landing page currently calls
`auth.login(handle)` with **no scope**, which falls back to the broad union — the
thing root `CLAUDE.md` says to avoid for new sites. Writing feedback needs a
narrow scope instead:

```js
await auth.login(handle, { scope: 'atproto repo:com.minomobi.feedback.comment' });
```

and that collection has to be added to `WRITE_COLLECTIONS` in
`workers/auth/src/oauth/scope.ts`, with the auth worker redeployed, or the
metadata ceiling is narrower than what the site asks for and the request is
refused. **`auth` is owned by `claude/landing-projects-takeover-pKkmW`** — see §4.

### 1.2 Storage: copy `workers/scores`, don't invent

The precedent already exists and should be followed rather than improved on:
`workers/scores/` is a shared worker with its own D1, identity delegated to
`auth.mino.mobi` bearer tokens, and any static site can write to it with zero
worker changes. Feedback is the same shape.

- **New surface** `workers/feedback/` at `feedback.mino.mobi`, own D1
  (`mino-feedback-db`), tables `comments` and `votes`.
- **Identity is the DID**, taken from the verified bearer token, never from the
  request body. One vote per DID per target, enforced by a unique index — a
  cookie-scoped vote is not a vote.
- **The thread key is the surface slug that already exists.** `var P` in
  `index.html:2311` holds 265 entries; every one of them gets a thread for free,
  with no second registry to keep in sync. This is the single highest-leverage
  decision in the design — a new registry of "things that can be commented on"
  would be stale within a week.

**Considered and not chosen for v1: storing comments as ATProto records in each
author's own PDS.** It fits the house style — several apps here store nothing and
pay nothing — but ranking needs aggregation *across* authors, and reading a
hundred strangers' repos to sort one thread means running a firehose consumer and
an index. That is a much larger build than the feature. The honest sequence is D1
first, and mirroring each comment to the author's PDS afterwards so the content is
portable even though the index is ours.

### 1.3 Ranking and abuse

Ranking: score and age, Hacker-News style (`(votes-1)/(hours+2)^1.8`) to start.
It is one line, it is tunable, and nothing here needs `packages/dataviz`.

Abuse deserves more thought than a personal site usually gets, because **this is
the front door of the whole estate** — 125 surfaces hang off this page, and a
spammed comment section is the first thing a visitor sees. Bluesky-only identity
already prices sockpuppets, since each one costs a real account. On top of that:
per-DID rate limits in the worker, a report action, and a kill switch that hides
the section without a deploy.

### 1.4 Where the code goes

`index.html` is 4,210 lines with substantial inline `<script>` blocks. The
feedback UI should **not** become another one. It goes in its own directory as an
ES module the page imports, in the shape the auth widget already uses. Note that
`var P` and the curated `<li>` descriptions are hand-edited while the surface-map
table is generated — so the module reads `P`, and nothing regenerates over it.

---

## 2. The preview surface

The goal, in the operator's words: *"I shouldn't have to leave the landing page to
actually use these little sites."* So: click an entry, the site opens in a frame
on the page, live and interactive, and closing it returns you to where you were.

### 2.1 What is embeddable — measured, not assumed

The whole feature turns on one header, so it was measured across every distinct
host in the catalogue (`curl -sI` over the 58 hosts extracted from `var P`):

| | Count | |
|---|---|---|
| **Embeddable today** | **55 / 58 hosts** | no `X-Frame-Options`, no `frame-ancestors` |
| Blocked | `poll.mino.mobi`, `org.mino.mobi` | `X-Frame-Options: DENY` |
| Blocked | `minomobi.com` | `frame-ancestors 'none'` |

And by catalogue entry rather than host: **88 of 265 entries are same-origin
paths** under `mino.mobi` itself (`/cluster/`, `/judge/`, `/answers/`, …). Those
embed with no coordination with anyone and no cross-origin question at all.

So the feature is not blocked. It ships for the overwhelming majority of the
estate on day one, and the exceptions are individually nameable.

### 2.2 The lab quarantine is the interesting exception

`minomobi.com` sends `frame-ancestors 'none'` from `lab/www/_headers`, and that
file opens by calling itself *"THE EGRESS BOUNDARY for every agent-written page on
this domain"*. The lab surface's registry note is equally explicit: the whole
domain is agent-generated content, *"quarantined from mino.mobi, which shares
neither cookie scope nor reputation with it."*

Embedding lab sites into the landing page would undo that on purpose. Agent-written
pages would render inside the landing page's frame, borrowing its reputation, and
any future slip in the sandbox attributes would put them in its cookie scope.

**Recommendation: leave it blocked.** Preview lab tenants as a card — title,
description, a static screenshot — that links out to `minomobi.com/<name>/`. The
quarantine was reasoned about carefully by whoever built it, and "the landing page
would be nicer" is not a strong enough reason to reverse it silently. If it should
be reversed, that is the operator's call, and §4 lists it as such.

`poll` and `org` are a different case — first-party `*.mino.mobi` surfaces whose
`X-Frame-Options: DENY` is most likely a default rather than a decision. Worth
asking their owning branch to relax to `frame-ancestors 'self' https://mino.mobi`.

### 2.3 Shape

- **One live frame at a time.** 265 entries; mounting even a handful of live
  frames would make the landing page unusable. The preview opens on click and is
  torn down on close.
- **Sandbox by origin, and default to the tighter one.** Same-origin `mino.mobi`
  paths can take `allow-same-origin`. Anything else gets
  `sandbox="allow-scripts allow-forms allow-popups"` **without** it — which is
  what keeps an embedded subdomain from reaching the landing page's storage.
- `loading="lazy"`, an explicit "open in a new tab" escape hatch, and a visible
  origin label so a visitor always knows whose page they are actually using.
- **A liveness probe already exists** — `/spec` runs a client-side status check
  per endpoint. Reuse it so a dead surface shows as dead instead of framing a
  Cloudflare error page.

### 2.4 The root-worker hazard

The root worker serves `assets.directory: "."` — **the whole repo root is
internet-facing**. Any generator that writes preview metadata into the repo must
go through `scripts/lib/landing.mjs`, which strips non-public hosts, and
`preflight` asserts the result. This is the standing rule for this surface and the
preview work does not get an exception from it.

---

## 3. Sequencing

Each phase is separately shippable and separately useful, which matters because
this surface deploys to production on push with no staging.

| Phase | What ships | Needs |
|---|---|---|
| **1** | Preview for the 88 same-origin entries | nothing — no new backend, no coordination |
| **2** | Preview extended to the 55 embeddable hosts, sandboxed, with the liveness probe | nothing |
| **3** | Feedback **read-only**: threads render, vote counts show, no writes | `workers/feedback` + D1 |
| **4** | Feedback writes: comment, vote, report | the auth scope change (§4) |
| **5** | Ranking, moderation tools, PDS mirroring | — |
| **6** | Lab tenants as screenshot cards, or framed | the quarantine decision (§4) |

Phase 1 is deliberately first: it delivers the thing the request actually asked
for — not leaving the page — to a third of the catalogue, while depending on
nobody.

---

## 4. What this branch cannot do alone

Honest list, because three of these are other people's surfaces and one is a
dashboard action:

1. **D1 creation is dashboard-only** (root `CLAUDE.md`, danger zones).
   `mino-feedback-db` has to be created by the operator before phase 3.
2. **The auth scope change** — `WRITE_COLLECTIONS` in
   `workers/auth/src/oauth/scope.ts`, owned by
   `claude/landing-projects-takeover-pKkmW`. Phase 4 is blocked on it, and
   without it the consent screen asks for the broad union instead of one
   collection.
3. **`poll` and `org` `X-Frame-Options: DENY`** — same owning branch. Phase 2
   ships without them; they just stay link-outs.
4. **The lab quarantine** — an operator decision, not a technical one. The
   recommendation is to keep it and use screenshot cards.

Also worth stating plainly: nothing in §2 can be verified from the sandbox
beyond the headers, which *were* measured. Whether a given site behaves well
inside a sandboxed frame — pointer capture, fullscreen, WebGL, service workers —
is only knowable in a browser against the deployed page.

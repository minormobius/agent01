# The factory's front page as a place you can stay

A plan for two changes to `lab/www/index.html` — the front page of the lab
factory at **minomobi.com**: a Reddit-style feedback interface, and a preview
surface that lets a visitor *use* a tenant site without leaving the page.

Design record for the surface itself: [`LAB-FACTORY.md`](LAB-FACTORY.md) and
[`lab/www/CLAUDE.md`](../lab/www/CLAUDE.md). Everything measured here was measured
against production on 2026-07-30.

The front page today is 76 lines: a grid of tenant names from `tenants.json`, a
four-step explainer, and the paragraph explaining why the factory has its own
domain. That last paragraph turns out to be the load-bearing one.

---

## 1. Path-based tenancy means one origin, and that changes the feedback design

Every tenant site is a **subdirectory**: `minomobi.com/atlink/`,
`minomobi.com/train-game/`. Verified — the front page and every tenant serve from
`https://minomobi.com` with the same headers. So they are not merely on the same
domain, they are **on the same origin**, and origin is the unit browsers actually
enforce.

Today that costs nothing. The front page holds no session; it fetches
`tenants.json` and renders links.

**Adding feedback is what makes it cost something.** A signed-in session on
`minomobi.com` is reachable by every agent-written tenant site, and no iframe is
involved — a visitor simply opening `minomobi.com/somebody-elses-site/` runs that
site's JavaScript on the origin that holds the token:

- a bearer token in `localStorage` is **readable directly** by any tenant page;
- an `HttpOnly` cookie is not readable, but tenant JS can still `fetch()` the
  feedback API same-origin and the cookie rides along — acting as the visitor.

And it would quietly falsify the front page's own promise, in its own words:

> Nothing generated here can reach a signed-in session there.

That sentence is about `mino.mobi` and it stays true. But a visitor reading it
while signed in *here* would reasonably take it to cover this session too, and it
would not.

**The repo has already solved this once, and the fix is to copy it.**
`labglass.minomobi.com` is a separate subdomain — a separate origin — and it
authenticates through `auth.mino.mobi`. `workers/auth/src/index.ts:92-97` calls
out exactly this case: the SSO cookie is `.mino.mobi`-scoped, so a bearer token is
the transport "for a site on a different registrable domain (e.g.
`labglass.minomobi.com`), which the cookie can't reach."

**So: the feedback interface gets its own origin.** Something like
`hub.minomobi.com`, routed to the same worker, serving the front page and the
feedback UI and **refusing tenant paths**. Tenants keep the apex. A session then
never exists on the origin agent-written code runs on, and the guarantee on the
front page stays literally true.

*Considered: per-tenant subdomains* (`<name>.minomobi.com`), which would isolate
tenants from each other as well. Worth recording that the earlier subdomain
sharding was abandoned because Static Assets' 100,000-file limit was two orders of
magnitude away ([`LAB-FACTORY.md`](LAB-FACTORY.md) §11.1) — a capacity argument,
not an isolation one. Origin isolation is a different reason and it is a better
one. It is not needed for feedback, which puts no state on the tenant origin, but
it becomes the right answer the first time a **tenant** wants a session of its own.

---

## 2. What sign-in already gives, and what it deliberately won't

Most of it is built:

- `https://minomobi.com` is already in `ALLOWED_ORIGINS`
  (`workers/auth/src/index.ts:24`), and `isAllowedOrigin` names it explicitly.
- The lab CSP already permits `connect-src … https://auth.mino.mobi`.
- `packages/oauth-client/auth.js` already handles the bearer-token path.

One consequence to design *with* rather than around: **a visitor signed in on
mino.mobi will not be signed in here.** The SSO cookie is `.mino.mobi`-scoped and
minomobi.com is a different registrable domain, so single sign-on stops at the
boundary — which is the quarantine doing precisely what it was built to do. The
front page should say so in a line, not paper over it.

Writes need a narrow scope rather than the broad union:

```js
await auth.login(handle, { scope: 'atproto repo:com.minomobi.lab.comment' });
```

and the collection has to be added to `WRITE_COLLECTIONS` in
`workers/auth/src/oauth/scope.ts`, with the auth worker redeployed. **`auth` is
owned by `claude/landing-projects-takeover-pKkmW`** — see §5.

Storage copies `workers/scores/`: a worker with its own D1, identity delegated to
`auth.mino.mobi` bearer tokens, DID taken from the verified token and never from
the request body, one vote per DID per target enforced by a unique index.

---

## 3. The preview surface

### 3.1 Two directives block it, and both are ours

The lab CSP blocks framing from both ends:

| Directive | Effect |
|---|---|
| `frame-src 'none'` | the front page may not embed **any** frame |
| `frame-ancestors 'none'` | a tenant page refuses to be framed **by anyone, including same-origin** |

Both need to become `'self'`. The important part: **`'self'` does not open
minomobi.com to mino.mobi.** The cross-domain quarantine is untouched — this
authorises the factory to frame its own tenants and nothing else. It is a far
narrower change than framing across the two domains, which is a separate question
this plan does not ask for.

The CSP lives in **three places**, and `preflight` asserts they are identical:

- `lab/www/_headers:31` — the one that actually applies, since Static Assets
  serves matching assets without invoking the worker
- `lab/www/worker.js:139-140` — the fallback for requests that miss
- `scripts/lab-smoke.mjs:66-67` — the smoke test's copy

Change one and preflight fails. That is the check working, not an obstacle.

### 3.2 The sandbox trade, which is the real decision

A same-origin iframe is **not** an isolation boundary: framed tenant JS can reach
`window.parent` and the parent's DOM and storage. So the frame needs
`sandbox="allow-scripts"` **without** `allow-same-origin`, which puts the tenant
in an opaque origin and cuts that path.

What that costs, stated honestly:

- **Still works:** the tenant's own CSS, JS, images, `_kit/tokens.css` — those are
  subresource loads, not origin checks. `kit.bskyGet` too, because
  `public.api.bsky.app` is an explicit host in `connect-src`.
- **Breaks:** a tenant that `fetch()`es its own JSON, and anything using
  `localStorage`. In an opaque origin, CSP `'self'` matches nothing.

That is an acceptable trade for a *preview*, paired with a prominent "open full"
link — but it means the preview is not always the whole site, and the UI should
not pretend otherwise. Note the interaction with §1: `allow-same-origin` only
becomes safe once the parent origin holds nothing worth stealing, which is exactly
what splitting the feedback origin buys.

Also: one live frame at a time, `loading="lazy"`, and a visible label naming the
tenant whose code is running.

---

## 4. The Reddit shape, on the factory's own terms

The factory has something a general comment section does not: **every tenant was
requested by a named Bluesky account, in a thread that still exists.** Feedback
here is the continuation of a conversation, not a new one bolted on.

- **Thread key is the tenant slug.** `gen-lab-tenants.mjs` already produces the
  list, and `tenants.json` is a build artefact regenerated immediately before
  deploy — so the feed can never list a site that isn't actually deployed, and no
  agent has to register anything.
- **Ranking:** score and age, Hacker-News style, one tunable line.
- **The highest-value item, and the cheapest: a "request a change" action that
  deep-links into a Bluesky reply on the tenant's original thread.** Replying in
  that thread is *already* how a site gets iterated — same name, same URL, new
  version. So feedback routes into the build loop that exists instead of creating
  a parallel one nobody reads. This is the piece that makes the page a front page
  for the factory rather than a comment box that happens to sit on it.
- **Abuse:** Bluesky-only identity prices sockpuppets at one real account each;
  per-DID rate limits, a report action, and a kill switch that hides the section
  without a deploy.

---

## 5. Shipping — and why this branch did not claim the surface

`lab` deploys from **`claude/lab-www`**, the shared publish branch every finished
build merges into. **I deliberately left it there.** Claiming it for this branch
would mean pushes to `claude/lab-www` no longer deploy — and that is where
`lab-build.yml` merges each newly built tenant site. Builds would go green and
never publish. The registry's one-branch-per-surface invariant makes that an
either/or, and the factory's need is the stronger one.

`publish-lab.yml` exists for exactly this situation: infrastructure changes (the
index, the kit, the worker) are made on a feature branch and merged forward into
the publish branch. But its trigger list is `claude/bsky-bot-deploy-surface-*` and
`claude/lab-*`, and `claude/minomobi-landing-page-vg37b8` matches neither, so
nothing this branch writes under `lab/` reaches production today.

Its comment warns against widening that list — the concern being a **merge
candidate**, which lands all of `lab/` as new files and would redeploy forty-odd
tenant sites off an integration commit nobody meant as a deploy. A named feature
branch is not that, and is the case the workflow was written for. But it is the
factory's publish path, so it is flagged here rather than widened unasked:

- **either** add `claude/minomobi-landing-page-vg37b8` to `publish-lab.yml`,
- **or** do the lab work on a `claude/lab-*` branch, which the trigger already
  accepts and which needs no change to the factory at all.

The second is cleaner and needs nobody's permission. It wants your say-so only
because it means this work lives on a different branch from the ideas bot.

---

## 6. Sequencing

| Phase | Ships | Needs |
|---|---|---|
| **1** | Front page rebuilt: tenant cards with requester and date, still linking out | the publish path (§5) |
| **2** | Preview frames, sandboxed, one at a time | CSP `'self'` in all three places |
| **3** | Feedback read-only, on its own origin | new subdomain route + `workers/feedback` + D1 |
| **4** | Writes: comment, vote, report | the auth scope change (§2) |
| **5** | "Request a change" → Bluesky reply deep link | — |
| **6** | Ranking, moderation, PDS mirroring | — |

Phases 1 and 2 need nothing from anyone else once the publish path is settled, and
between them they deliver the actual request: browse the factory and use a site
without leaving the page.

---

## 7. What this branch cannot do alone

1. **The publish path** (§5) — one decision, either widening `publish-lab.yml` or
   moving this work to a `claude/lab-*` branch.
2. **D1 creation is dashboard-only** (root `CLAUDE.md`, danger zones).
3. **A new subdomain route** for the feedback origin — worker route plus DNS.
4. **The auth scope change** — `workers/auth/src/oauth/scope.ts`, owned by
   `claude/landing-projects-takeover-pKkmW`. Phase 4 is blocked on it.

And what cannot be verified from the sandbox: whether a given tenant behaves
inside a sandboxed opaque-origin frame is only knowable in a browser against the
deployed page. The CSP directives, the shared origin, and the auth allowlist
**were** verified, and the file and line numbers are given above so they can be
re-checked rather than trusted.

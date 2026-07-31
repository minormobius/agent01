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

- **Still works, but only once the CSP names its hosts outright:** the tenant's
  own CSS, JS and images. This paragraph originally said subresources "are not
  origin-checked", which was wrong — they are CSP-checked, and `'self'` is
  ambiguous in an opaque origin. Shipping it that way cost the previews their
  theme and their fonts. `kit.bskyGet` was always fine, because
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

## 5. How minomobi.com actually deploys, and where this branch fits

Three workflows, and the shape only makes sense once you see that **the front
page and the tenant sites are the same deploy**:

```
a Bluesky mention
      │  lab-build.yml — agent builds on claude/lab-<slug>, merges the site in
      ▼
claude/lab-www ──────────► deploy-lab.yml ──► wrangler deploy ──► minomobi.com
      ▲                     (push, paths: lab/www/**, lab/_kit/**,
      │                      gen-lab-tenants.mjs, deploy-lab.yml)
      │  publish-lab.yml — merges infrastructure changes forward
a feature branch (this one)
```

`deploy-lab.yml` runs `gen-lab-tenants.mjs` to write `tenants.json` and copy the
kit in, then `wrangler deploy` from `lab/www/`, then verifies three things on the
live response: that the log names the custom domain, that the CSP is actually on
a live page (it once shipped green with the header absent, because Static Assets
serves a matching asset without invoking the worker), and that
`/.well-known/atproto-did` returns a bare DID.

**`claude/lab-www` is not a person's branch — it is the accumulator.** Nobody
develops on it. Every tenant site the factory has ever built is merged into it,
and it holds all 46 of them. That is why the surface's owning branch cannot move:
`lab/www/index.html` and `lab/www/<name>/` are one directory, one worker, one
`wrangler deploy`, and Workers Static Assets **replaces the whole manifest**
rather than merging it. Point the deploy at a branch that has the front page but
not the tenants and every tenant 404s, from a green run — the same failure root
`CLAUDE.md` documents for `main`.

So "taking over the deploy surface" would mean *becoming the accumulator*:
retargeting `deploy-lab.yml`, `lab-build.yml`'s merge target, `publish-lab.yml`'s
`PUB`, and the bot worker's `GITHUB_BRANCH`. That is rerouting the factory, not
claiming a surface, and it buys nothing that the supported path does not.

**The supported path, now wired.** `publish-lab.yml` exists for exactly this:
infrastructure changes are made on a feature branch and merged forward into the
publish branch, which fires the deploy. Its trigger list did not include this
branch, so nothing written here under `lab/` could reach production. It now does
— one literal branch name, added alongside the existing `claude/lab-*` and
`claude/bsky-bot-deploy-surface-*` entries, with the reasoning in the file.

One thing that had to be done first, and is worth knowing before the next person
edits `lab/`: **a dry run of that merge conflicted.** `publish-lab.yml` treats a
conflict as fatal — `git merge --abort`, `::error::conflicts with this commit`,
exit 1 — so pushing the trigger change alone would have turned the publish job
red and shipped nothing. The cause is squash-merge divergence: PR #66 landed the
bot branch on `main` as a single commit while `claude/lab-www` took the same work
incrementally, so git sees both sides as having rewritten everything since PR
#65. Merging `claude/lab-www` into this branch and resolving by hand makes the
publish-direction merge a fast-forward. Verified after: 46 tenant directories,
zero deletions under `lab/www/`.

Expect the same the next time a feature branch publishes here after a merge
candidate lands.

## 6. Sequencing

| Phase | Ships | Needs |
|---|---|---|
| **1** | Front page rebuilt: tenant cards with requester and date, still linking out | — |
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

1. ~~The publish path~~ — **done** (§5). This branch is on `publish-lab.yml`'s
   trigger list and the merge is aligned, so phases 1 and 2 can ship.
2. **D1 creation is dashboard-only** (root `CLAUDE.md`, danger zones).
3. **A new subdomain route** for the feedback origin — worker route plus DNS.
4. **The auth scope change** — `workers/auth/src/oauth/scope.ts`, owned by
   `claude/landing-projects-takeover-pKkmW`. Phase 4 is blocked on it.

And what cannot be verified from the sandbox: whether a given tenant behaves
inside a sandboxed opaque-origin frame is only knowable in a browser against the
deployed page. The CSP directives, the shared origin, and the auth allowlist
**were** verified, and the file and line numbers are given above so they can be
re-checked rather than trusted.

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

## The front page is a shop window

The stage sits above the index, runs one real tenant full width, and moves on
every nine seconds. `preview` on a card **pins** it there and stops the
rotation; `resume` restarts it; the dots jump straight to one. The index below
is for finding a specific site — the window is for making a stranger want to
click, which forty-six names in a grid does not do.

Three things about it are load-bearing:

**`sandbox` with no `allow-same-origin`.** Tenants are subdirectories, so a
framed tenant is *same-origin with this page* — and a same-origin iframe is not
a boundary at all: its scripts can reach `window.parent` and this document.
Omitting that one token puts the frame in an opaque origin, and that is the
entire security property. **Do not add it back to fix a site that renders
empty.** It matters more here than it would for a click-to-open preview,
because the window loads tenants on its own.

**The CSP allows exactly this and nothing wider.** `frame-ancestors 'self'` and
`frame-src 'self'` (both were `'none'`) authorise the factory to frame its own
tenants. `'self'` is `minomobi.com`, so **the quarantine is untouched** —
`mino.mobi` still cannot frame anything here, and nothing here can frame it.

**One frame, reused.** Rotation swaps `src` on a single iframe rather than
mounting a new one, because a previous site left running in a hidden node keeps
its scripts, timers and audio going. `setTimeout` is chained rather than
`setInterval`, so a site that takes four seconds to load still gets its full
turn instead of having advances queue behind it; a hidden tab stops the clock
entirely.

`prefers-reduced-motion: reduce` holds the window still. It still shows a live
site — it just waits to be asked.

### `'self'` is not enough in an opaque origin — the bug that proved it

Reported 2026-07-30: sites in the preview lose their dark theme and their fonts.
Reproduced exactly by blocking `/_kit/tokens.css` — white background, serif
type, default link colours. Both the theme and the type come from the kit's
custom properties (`--bg`, `--fg`, `--mono`), so losing that one stylesheet
loses precisely those two things and nothing else, which is why the report named
them together.

The cause is that **a sandboxed frame without `allow-same-origin` has an opaque
origin, and how an engine resolves `'self'` for such a document is not settled.**
Some match the document's URL — scheme, host, port — and some match the opaque
origin, which matches nothing at all. Under the second reading every same-origin
stylesheet, script and image the tenant asks for is refused, and the page renders
as bare HTML. The disagreement is old and real: Chrome once checked the opaque
origin while Firefox and IE checked scheme/host/port. Today's Chrome does the
permissive thing, measured here; something in the reporter's browser does not.

**A host source has no such ambiguity.** It is matched against the request URL
and never consults the document's origin. So every directive that names `'self'`
now also names `https://minomobi.com` and `https://lab.minomobi.com` outright.
Identical policy, no interpretation — and verified sufficient standing alone: a
tenant framed under a policy carrying *only* the host source, with `'self'`
removed entirely, renders correctly.
`lab-preview.selftest.mjs` fails if any `'self'` directive loses its hosts.

What the sandbox still costs, and it is not nothing: `localStorage` throws, and
`fetch('./data.json')` is a **cross-origin** request from an opaque origin — CSP
now permits it but CORS does not, since the response carries no
`Access-Control-Allow-Origin` and the request sends `Origin: null`. `kit.bskyGet`
works, because `public.api.bsky.app` was always a named host. **Open** is the
escape hatch and the page says so in as many words.

**Verified in a browser, not inferred.** Does `frame-ancestors 'self'` still
permit a frame whose own origin the sandbox has made opaque? The spec answers
only indirectly, so it was measured: served `lab/www` with the production CSP,
drove headless Chrome, and watched the server receive the tenant path plus its
subresources with no frame-related violation. It permits it — `frame-ancestors`
matches against the framed document's *URL* origin, not its sandboxed one.

[`scripts/lab-preview.selftest.mjs`](../../scripts/lab-preview.selftest.mjs)
keeps all of it honest in three browser passes, and fails if anyone adds
`allow-same-origin`. Its first pass forces reduced motion — both the accessible
behaviour and the only way to test pinning deterministically, since under
`--virtual-time-budget` the nine-second dwell fires almost at once.

## The wall

A global toggle in the stage bar. It takes the whole viewport and runs six to
ten tenants at once, each on its own clock, each cutting to a new channel with a
burst of static — a bank of old televisions, none of them agreeing.

**Six on a phone, nine on a tablet, ten at 1080p and up**, in rows and columns
rather than a flat count so the panels keep a screen-ish shape instead of
becoming letterboxes. A short landscape viewport drops a row.

**Nothing is synchronised, and that is the effect.** A shared interval would
make ten screens blink in unison, which reads as a slideshow rather than a room.
Each cell draws its own dwell around the 9s base (×0.55 to ×1.45) and gets a
random *first* delay, so they never start together and drift further apart with
every change rather than settling into a pattern.

The static is one SVG turbulence bitmap, scaled and shifted by `background-
position` — no canvas and no per-pixel work, so ten at once stays cheap. Snow
first, then the new signal: that order is what makes it read as a channel change
instead of a crossfade. Scanlines and a slight desaturation sit over every panel
permanently, so the bank reads as one object seen across a dark room rather than
ten bright websites.

### The two things that make it safe rather than reckless

**`makeFrame()` is the only place a frame is built**, and the stage and the wall
both come through it. The security property here is an *absence* — no
`allow-same-origin` — and an absence is exactly what goes missing when somebody
adds a second way to do something. `lab-preview.selftest.mjs` asserts there is
**exactly one** `setAttribute('sandbox', …)` in the file; a second call site
fails the build even if it happens to be correct today.

**`allow=""` denies every permission-policy feature.** Ten strangers' sites at
once is not the moment to leave camera, microphone, geolocation or autoplay on
their defaults, and a wall of screens that starts making noise is a bad surprise
rather than an eerie one.

### Teardown is half the feature

Exiting removes every frame and clears every timer. Ten iframes left running
behind a hidden panel is precisely the leak a toggle like this becomes, so the
selftest asserts the cell count is zero after exit rather than trusting it. A
hidden tab stops all the clocks too, and a resize rebuilds on a 400ms debounce —
without it, dragging a window edge would reload ten sites per pixel.

`prefers-reduced-motion` keeps the bank lit and stops it changing: every screen
loads a real site, and no snow, roll bar or channel change ever runs.

The preference is remembered in `localStorage`, which every tenant on this origin
can also read and write. Fine for a boolean about a layout — and the reason
nothing else is kept there.

## What the build agent gets to read

The agent still has **no network** — `WebFetch`, `WebSearch`, `Bash` and `Task`
are removed from it, not merely discouraged. That is not general caution: the
secret scan only inspects *published files*, so an agent that can make an
outbound request can read anything in the workspace or the environment and put
it in a URL, and no gate here would ever see it. The scan would be looking at
the wrong artifact.

So the harness fetches and the agent reads a file.
[`scripts/lab-fetch-refs.mjs`](../../scripts/lab-fetch-refs.mjs) pulls URLs out
of the request, resolves them (arXiv gets a five-rung ladder to full text, DOIs
route through OpenAlex to find an open-access copy, Wikipedia uses the REST
API), and writes `/tmp/lab-refs.md` with a banner saying it is somebody else's
document rather than instructions.

**Both the requester and the thread are scanned, ranked** (2026-07-30). Six
links from the requester, four more from anyone else in the thread, deduped
across both. The requester's are fetched first and take the character budget
first, so a busy thread adds context without crowding out the person who asked.
Every reference is labelled with who linked it, because "the requester linked
this" and "somebody in the thread linked this" are different claims.

Budgets: 50k characters for a paper, 40k for a page, 20k for an article, and a
**140k ceiling across all of them**. The total is the one that matters — ten
references at the page budget would put a hundred thousand tokens of someone
else's prose in front of the actual brief.

**Every destination goes through
[`lib/safe-fetch.mjs`](../../scripts/lib/safe-fetch.mjs).** A build request is
written by whoever tagged the bot, and now the whole thread can contribute
URLs, so the runner refuses anything that does not resolve to a public address
— loopback, RFC1918, CGNAT, link-local and the cloud metadata address — and
**re-checks on every redirect**, because a public first hop is not a promise
about the second. Non-http(s) schemes, credentials in the URL and ports other
than 80/443 are refused outright. It does not defeat DNS rebinding, and
[`safe-fetch.selftest.mjs`](../../scripts/safe-fetch.selftest.mjs) says so
rather than leaving it to be discovered.

That selftest caught its own guard: `new URL()` normalises
`[::ffff:127.0.0.1]` to `[::ffff:7f00:1]`, so the first version's
prefix-matching check waved IPv4-mapped loopback straight through. The address
parser expands properly now.

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

0. **Set up the email forwarding FIRST** (see below). The ordering here is not
   cosmetic: `admin@mino.mobi` is not a mailbox, it is a routing rule, and
   Cloudflare *rejects* mail to an address with no matching rule. Creating the
   account before the rule exists means its verification email bounces at
   delivery and is gone — no retry, no queue. That happened. Enabling the
   catch-all on the zone makes it unrepeatable.
1. **Create the account** at bsky.app with any throwaway handle
   (`labminomobi.bsky.social`). Register it to **`admin@mino.mobi`**.
2. **Read its DID.** Settings → Account, or
   `https://public.api.bsky.app/xrpc/com.atproto.identity.resolveHandle?handle=<throwaway>`.
3. **Set `BOT_DID`** in `wrangler.jsonc` `[vars]` and push. The deploy verifies
   the endpoint is serving a `did:` and warns if not.
4. **Change the handle** in Bluesky settings — and **choose "No DNS Panel"**.
   The dialog defaults to "DNS Panel", which asks for a
   `_atproto.<domain> TXT = did=did:plc:…` record and will fail against this
   setup, because there is no such record and never was: the whole point of the
   worker is to serve the HTTP endpoint instead. "No DNS Panel" is the
   `/.well-known/atproto-did` path. Cost a round trip to find out.

   Both `minomobi.com` and `lab.minomobi.com` route to this worker, so either
   verifies; the apex is the better one now that the whole domain is the factory.

   **Optional belt-and-braces:** adding the `_atproto` TXT record in Cloudflare
   DNS as well makes the handle independent of this worker — resolvers check DNS
   first, so a bad deploy could not break the account's identity. The cost is a
   second place the DID lives: change it here and DNS goes stale, silently
   winning.
5. **Mint an app password** for the account (not the account password) into GH
   secrets `BLUESKY_BOT_HANDLE` / `BLUESKY_BOT_APP_PASSWORD`.

Step 4 fails if step 3 has not deployed. That is the whole reason for the order.

## The email address

`admin@mino.mobi` does not need a mailbox — Cloudflare Email Routing forwards
it. It also does not *exist* except as that rule, which is why it must be created
before anything is told to mail it. [`.github/workflows/setup-email-routing.yml`](../../.github/workflows/setup-email-routing.yml)
creates the rule; it is idempotent and reconciles rather than duplicating.

It is on `mino.mobi` rather than `minomobi.com` deliberately: the bot's own
account recovery should not depend on the reputation of the domain it publishes
agent-generated sites to.

**Turn on the catch-all.** Email Routing → Routing rules → Catch-all address →
send to the same destination. Without it, mail to any `@mino.mobi` address
without an explicit rule is rejected rather than delivered — which is how the
service account's first verification email was lost. A catch-all turns "silently
bounced" into "arrived, possibly unwanted", which is the failure you want.

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

*The token has NO Email Routing permission at all.* Measured by letting the
authoritative call run: creating the rule also returns `10000: Authentication
error`. It has `Zone:Read` and nothing else email-related — not the zone routing
status, not the addresses, not the rules.

**So make the rule in the dashboard.** `mino.mobi` → Email → Email Routing →
Routing rules → Create address: `admin@mino.mobi` → `majormobius@gmail.com`. One
row, twenty seconds. Adding write scope to a production API token to save a
click is a bad trade; this workflow earns its keep reconciling many rules
idempotently, not creating the first one.

**The rule this file exists to state:** *a read this token cannot perform means
UNKNOWN, never NO.* `JSON.parse(s).result || []` turns a permission error into a
confident negative, and that single idiom produced three wrong answers here in a
row — "routing not enabled" about an enabled zone, and "destination absent"
about an address the dashboard showed as Verified.

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

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

**The default front page**, and a toggle in the stage bar to leave. It takes the
whole viewport and runs six to ten tenants at once, each on its own clock, each
cutting to a new channel with a burst of static — a bank of old televisions,
none of them agreeing. The stored key is an OPT-OUT: it holds `'0'` or nothing,
never `'1'`, so a value meaning "yes" cannot make the default depend on whether
the write succeeded — in private mode it never does.

**Panels are zoomed out, not squeezed.** A 380px-wide cell makes every site
think it is on a phone, so desktop layouts collapse to single columns and the
wall shows nothing but stacked headings. Each frame is built at `1/--tv-zoom` of
its cell and scaled down, so the site lays out for a ~760px viewport and is then
shrunk. One number, `--tv-zoom: .5` on `.wall-grid`.

**The panel you are touching holds.** Hover or click and it stops changing
channel, goes full colour and drops the scanlines. A cross-origin frame swallows
its own mouse and key events, so the parent cannot see clicks — but focus
crosses: the parent window blurs and `document.activeElement` becomes the
`<iframe>`. That is the only reliable signal and it is enough. The pending turn
is re-drawn rather than skipped or queued, so letting go returns the panel to the
drift instead of punishing you with an instant swap.

**Loads are staggered 180ms apart.** Ten frames given a src in the same tick is
ten navigations racing for the same connections, and the tail of the grid sits
blank while the head loads. It also simply looks better: screens warming up one
after another.

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
loads a real site, and no snow, roll bar or channel change ever runs. That took
two goes — the first version muted the static while the channels kept changing
underneath, which is the part that actually matters to somebody who asked for
less motion, and is what this file already claimed to do.

The preference is remembered in `localStorage`, which every tenant on this origin
can also read and write. Fine for a boolean about a layout — and the reason
nothing else is kept there.

### WebGL does not survive the sandbox

Measured 2026-07-31 by changing one token and nothing else, in headless
Chromium with software rendering:

| frame | three.js |
|---|---|
| no `sandbox` attribute | renders — `nodes: 85` |
| `sandbox="allow-scripts allow-same-origin"` | renders — `nodes: 85` |
| `sandbox="allow-scripts"` (what ships) | dead viewport, no error |

**The opaque origin is the cause**, and it is the one thing that cannot be given
back. Canvas 2D is unaffected — `plot-all`, `arch-brainstorm` and `ode-sonnet`
all draw correctly on the wall. Eight of the forty-six tenants use three.js.

So `gen-lab-tenants.mjs` flags them (`needsGpu`) by reading each site's own
HTML, and the wall prefers panels that will actually show something; they keep
their card in the index, one click from the real thing. The fallback is
`flat.length ? flat : free`, so an all-3D estate degrades to showing them rather
than to showing nothing.

**Caveat, and it is a real one:** this was measured under SwiftShader, not a
GPU. A browser with hardware acceleration may well behave differently, and the
flag costs nothing if it does. Worth re-measuring on a real machine before
concluding three.js is unusable in a sandboxed frame generally.

## The leaderboard

Between the preview and the index, on the non-wall page: a horizontal bar per
contributor, avatar, handle, count. Hover or focus a bar for a profile card;
click it to filter the index to that person's sites; click again to clear.

**Counts come from the manifest, not a backend.** `tenants.json` already carries
a requester per site, so the board and the index read the same array and cannot
disagree. Sorted by count descending, then handle ascending — a stable order, so
people tied on the same number do not reshuffle between visits. Top 12, and the
subtitle says how many were left out.

**Avatars are the one place this page renders a stranger's media**, so the house
rule applies rather than being waived for the front page: `kit.bskyGet` keeps the
lookup on the allowlisted-method path, and **`kit.hidden()` decides whether a
face is drawn at all** — it checks moderation labels and the account's own
self-labels. Anything flagged, anything the AppView declines to return
(deleted, suspended, taken down), and any image that fails to load falls back to
a **monogram** rather than a stock silhouette: a generic face would imply a
person the AppView is specifically declining to show.

The profile lookup is fire-and-forget. Bars are correct without it, one call
covers everyone shown (`getProfiles` takes 25 actors), and every failure path
lands on the monogram — which is also what the selftest exercises, since the
test browser has no network.

`displayName` and `description` are the account holder's own words: set as text,
never markup, and the bio is clamped to three lines in CSS rather than trusted
to be short.

Each bar is a real `<button>` with `aria-pressed`, because it changes what the
page shows and has to be operable from a keyboard.

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

## Assets: on the domain, or not at all

A published lab site **cannot** load a model from poly.pizza at runtime, and the
CSP is only half of why. `connect-src` names its hosts — but
`static.poly.pizza` also serves no `access-control-allow-origin`, and a
sandboxed tenant has an opaque origin, so it sends `Origin: null` and CORS
refuses it. Widening `connect-src` would fix neither problem. The only way an
asset reaches the page is to **be on the origin**.

So [`scripts/lab-fetch-assets.mjs`](../../scripts/lab-fetch-assets.mjs) fetches
it at build time, before the agent runs, into `lab/www/<slug>/assets/`. The
model that prompted this is **44 KB**; low-poly work is small, which is what
makes committing it reasonable.

**A proxy was the other option and it is disqualified.** `/_asset/?url=…` would
be same-origin and CSP-legal — and it would turn `connect-src 'self'` into *any
host on the internet* for all forty-six tenants at once. The one control that
stops a lab site republishing an unbounded stream, undone by a query parameter.
It would also be an open proxy on the domain, which is how a domain gets
blocklisted, which is the thing this whole quarantine exists to prevent. A
pinned, manifest-only variant is safe but is no longer pass-through — and once
you are pinning at build time, downloading wins on every axis except repo size,
which 44 KB settles.

| | |
|---|---|
| sources | `poly.pizza/m/<id>`, `opengameart.org/content/<slug>` |
| licences | CC0, CC-BY 3.0/4.0, OGA-BY 3.0 — **all** of a submission's must qualify |
| refused | CC-BY-SA, GPL, LGPL, AGPL, anything unrecognised, `.zip` |
| caps | 4 MB/file, 12 MB total, 6 assets, 6 pages |
| whose links | the **requester's** only, from their post's link facets |

**Copyleft is refused deliberately and the list must not grow to include it.**
CC-BY-SA and the GPL family attach conditions that reach past the file onto
whatever it is bundled into. Whether a static page carrying a sprite is a
derivative work or mere aggregation is a judgement a human makes once, not one
a build agent makes at 3am on somebody else's behalf. All-or-nothing for the
same reason: OGA lists the terms the *author* chose to offer, and silently
taking the permissive one is not ours to do.

**Attribution is enforced, not requested.** CC-BY grants use *on condition* of
credit, so a build that ships the file and drops the line has used the work
outside its licence — on the operator's domain, at a permanent URL, under the
operator's name. `lab-content-gate.mjs` checks the rendered `index.html` for the
author's name as visible text **and** a link back to the source page, both read
from `assets/manifest.json` rather than from anything the agent chose. The brief
asks; the gate is what makes the ask load-bearing.

**Three things are checked on the bytes themselves.** Content-Length before the
download and real length after, because the header is a claim. Magic bytes
against the extension — a redirect to a login wall, a rate limit and an error
page all arrive as 200s full of HTML, and `robot.glb` containing
`<!doctype html>` is a scene that silently never renders and reads as the agent
having failed. And a **sha256 recorded before the agent runs**, which is what
lets these through the gate at all.

### The exemption that made a dead check run for the first time

The content gate forbids anything it cannot read from a tenant directory —
`'wasm-unsafe-eval'` is on, so an unreviewed binary is potentially executable
code nobody looked at. That rule rested on a premise: *agents cannot produce a
binary — no compiler, no network, no shell.* This feature is precisely what
changes it.

So the exemption is **not** "a `.glb` is fine". It is "these exact bytes are the
ones the harness fetched, and here is the hash it recorded". The agent has no
shell and no crypto, so it cannot forge an entry; changing a file's contents
breaks the hash; adding a binary that is not in the manifest is still a
violation. `.wasm` is absent from the allowlist on purpose and must stay absent
— it is the one extension the CSP would let execute.

Writing that turned up a **latent bug: the opaque-file branch pushed to a
`violations` array that does not exist**, below a `let failures = 0` it also sat
above. Both would have thrown. The check had been dead since it was written and
would have *crashed the gate* rather than reporting a violation on the day it
finally mattered — a gate that fails open by exploding. Found only by being the
first thing ever to put a real binary in a tenant directory.

### What is still on the table

`.zip` is refused, and that is a v1 line rather than a permanent one: unpacking
an archive a stranger chose is zip-slip and zip-bomb territory and wants its own
budget and its own tests. It costs real submissions — the Kenney packs on OGA
are zip-only. Adding more sources is a resolver each, roughly forty lines: the
shape is `planAsset` → parse → `licenceOf`, and everything after that is shared.

## Naming: the agent already chose, the URL just did not hear

**The problem, stated exactly.** `slugify()` in
[`workers/bsky-bot/src/registry.ts`](../../workers/bsky-bot/src/registry.ts)
picks the first two words over two characters that are not stopwords, from the
request text, before anything has been built. That is positional, not semantic,
which is why the estate carries `actually-let`, `fake-doordash`,
`which-enumerates` and `hiiii-demo`.

**The material is already there.** The build agent names every site properly in
its `<title>` — those four are *"Bottomless"*, *"Wormhole Eats"*,
*"capabilities, found by trial and error"* and *"my commute"*. The judgement is
being made and thrown away.

[`scripts/lib/site-name.mjs`](../../scripts/lib/site-name.mjs) is the function
that stops throwing it away: title in, slug out, pure and reproducible because
the result becomes a permanent public URL. Run over the live estate it proposes
a better name for **33 of the 46** sites and leaves 13 alone.

Two rules in it came from running it against the real thing rather than from
thinking about it:

- **A slug must not end on a function word.** The length cap lands mid-phrase,
  so "Hats on a Book" truncated to `hats-on-a` and "Newman, Borwein &
  Littlewood" to `newman-borwein-and`. Trimming trailing articles, conjunctions
  and prepositions is what turns a truncation back into a name.
- **Never rename a redirect stub.** A retired path serves a page titled
  `moved — /new-name/` so old links keep working. The first version proposed
  renaming `/tube-tetris/` to `moved`, which would have moved the redirect and
  broken the exact thing it exists to preserve.

### How it is wired up

**Shipped 2026-07-31.** Three components, and the ordering between them is the
whole design: *the name is decided after the title exists and before anything is
published*, so there is no rename at all — no old URL, no redirect, nothing
anyone has linked to.

1. **The bot stops promising a URL it is about to change.** For a name it
   derived, the first reply is now *"Building — I'll send the link when it's up,
   and that URL is yours to keep."* The completion reply carries the address.
   A name the requester typed still gets announced immediately, because that one
   is already true.
2. **The build takes the name from the `<title>`**, in `lab-build.yml`'s
   *Name the site from its title* step — after the gates, before the commit, so
   the directory, the site branch and the publish branch agree from the first
   commit. [`scripts/lab-name-site.mjs`](../../scripts/lab-name-site.mjs) is the
   step; its collision set is `lab/www/` **on the publish branch**, which is
   every path the domain serves *including retired redirect stubs* — the ones
   the registry does not know about.
3. **The bot catches up from a file.** The build writes
   `.github/lab-names/<placeholder>.json` and `adopt-name` on the registry DO
   applies it. `{"slug": null}` means "I kept the name" and is written too,
   because otherwise the registry keeps asking.

**Three cases it must not touch**, each one a live URL if it got them wrong: a
name the requester typed (`named` comes from the bot, since `$TASK` carries the
whole thread and a bystander's `name:` would read as theirs), an iteration, and
a build that is itself a rename.

#### Why a file and not a callback

`adopt-name` is a different thing from `/rename`, and the difference is what
makes it safe without a credential. `/rename` moves a **published** site: it
retires the old path to a redirect and is authorised by the requester's own
(root, did) key, with deliberately **no operator override** — one on a public
hostname would let anyone move anyone's site. That restriction still stands and
CI does not get an exception to it.

Adoption is the other case. Nothing has been published, nobody has been told a
URL, and the placeholder exists only because a directory needed a name before
the agent had written a title. What bounds it is not a secret but its
narrowness: only a row the DO itself marked `awaitingName` (a *new* site whose
requester did not name it), only while the slug is still that placeholder, and
only through the same gauntlet as a first claim — shape, `RESERVED`, marks,
taken. The file is a report, not a command.

The channel is the trade `isBuildLanded` already makes: one request with the
token the bot carries. A callback would need an authenticated route on a public
hostname and a shared secret nobody has provisioned — a human step standing
between the change and it working. Only CI can write to the branch, so the write
is already authorised.

**The lock is why the report lands early.** It records the slug the bot guessed,
and the bot releases it early by asking whether `claude/lab-<slug>` has moved.
The build renames that branch, so a registry that has not caught up asks about a
branch that does not exist, answers "still running", and refuses the requester's
next message for the full 30-minute TTL. The report therefore goes out
immediately after the branch push — not at the end of the job, which would put
the publish and the four-minute wait-for-live inside that window.
`adoptName` moves the lock along with the row.

**Existing names stay.** Permanence is a promise and all 46 have been posted to
Bluesky; only new sites get the new naming. The rename machinery is untouched
and still the way to move a published one:
[`lab-rename.selftest.mjs`](../../scripts/lab-rename.selftest.mjs).

[`lab-name-site.selftest.mjs`](../../scripts/lab-name-site.selftest.mjs) covers
the step the workflow runs — title extraction, the collision set, and the
contract the YAML depends on: one line of stdout, always a usable slug, and
**never a non-zero exit for a page it cannot name.** That last one is the point
of the test. This runs after the gates on a build that has already succeeded; a
crash there throws away a finished site over a cosmetic decision.

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

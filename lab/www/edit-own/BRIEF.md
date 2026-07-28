# edit-own — can a lab site edit its own source?

## What this is

A single page at `minomobi.com/edit-own/` that does two things. First, a working
demo: on load it runs `fetch(location.href)` to pull down its own HTML — the
actual bytes that rendered the page you're on — into an editable `<textarea>`.
"extract text" parses the current textarea contents with `DOMParser` (never
inserted into the live document, so nothing loads and nothing executes), strips
`<script>`/`<style>`, and shows the remaining visible text — so an edit to the
markup shows up as an edit to what a reader would see. "reset to original"
restores the fetched copy; "copy source" uses `kit.copy`. Nothing is written
back anywhere — there's no backend, and the page says so. Second, a prose
section, "what I can't fix from here," that answers the actual bug report
honestly instead of pretending to have fixed it.

**No live-rendered preview, and that was a real design change mid-build.** The
first draft used a sandboxed `<iframe srcdoc>` for a genuine running preview.
Reading `lab/www/_headers` and `lab/www/worker.js` before shipping turned up
`frame-src 'none'` in the CSP this whole domain sends on every response — no
iframes anywhere on minomobi.com, full stop, for the same reason a lab page
can't mirror a firehose: nothing runs here that wasn't chosen to run here. An
iframe would have been silently blocked, which is exactly the failure mode
`docs/` warns about — a build that looks done and does nothing. Rebuilt the
preview around `DOMParser` instead: inert, so it can't execute an edit, only
show what it says. The page explains this in the copy rather than hiding the
downgrade — it's on-theme for a page about running into your own boundaries.

## What was asked

From @bisks.net, verbatim: "can you edit ur own source? if so, see if you can
make the final update thread after the initial reply rather than as a second
top-level reply to the original request."

Two questions stacked in one message. The first ("can you edit your own
source") is answerable and demoable — the page does it. The second is a
specific claim about Bluesky reply threading on lab-factory builds, and *that*
one is not something this build could act on, for a real structural reason
worth recording precisely.

## Why the threading half could not be fixed here

I read the two files that construct the reply: `scripts/bsky-reply.mjs` and
the reply step in `.github/workflows/lab-build.yml`. As far as I can see them,
they're doing the right thing — every post is created with
`reply: { root: {uri, cid}, parent: {uri, cid} }`, where `root` is fixed for
the whole thread and `parent` is whatever `--parent`/`--parent-cid` the
workflow was handed (falling back to root only if no parent was given at all).
That's correct AT Protocol threading: Bluesky nests a reply under its `parent`,
not under `root`, so if `parent` already points at a prior bot reply rather
than at the original post, the new reply should thread underneath it, not
beside it.

And for *this specific build*, it does: `.github/lab-requests/edit-own.json`
carries `root_uri` authored by `did:plc:ccxl3ictrlvtrrgh5swvvg47` (the
requester's own post) and a *different* `parent_uri`, authored by
`did:plc:f6n22z62adionrvb5s6n6vfk` — almost certainly the bot's own prior
reply. So whatever assembled that JSON before this build even started had
already set `parent` correctly for this one dispatch.

What I could not do is see or touch whatever assembles that JSON in the first
place — the mention listener / dispatcher that decides, for a *new* request
vs. an *iteration* on an existing thread, what URI to hand over as `parent`.
It isn't in `lab/www/`, isn't visible in full from a tenant's vantage point,
and — this is the part that actually stopped me, not just discouraged me — a
CI containment gate fails this build outright if its diff leaves
`lab/www/edit-own/`. That boundary exists so no single tenant site can reach
into shared infrastructure, and it applies here exactly as written: it is not
a bug I introduced or a corner I cut, it's the wall the whole factory is built
around. I also have no network access in this sandbox, so I could not load the
actual public thread and check whether an *iteration* reply (as opposed to
this first one) currently threads correctly or not — I only have the code and
one dispatch payload to reason from, not a live observation.

So the page reports the honest version: the mechanism looks right where I can
see it, this build's own payload is already correct, and the piece that would
actually need auditing or changing — if it's still wrong for later
iterations — is shared infrastructure outside any tenant's reach, this one
included.

## Implementation notes

- The self-fetch/edit/extract loop is the whole interactive surface. No
  Bluesky calls (`kit.bskyGet`) are used — nothing about the request names a
  Bluesky subject for the page to look up, so the content-gate allowlist is
  simply unused here, not worked around.
- `render()` builds its `DOMParser` document fresh on every click and never
  attaches it to `document` — no `appendChild`, no `innerHTML` assignment of
  the parsed tree. That's what keeps a pasted `<script>` or an `onerror`
  attribute inert: a detached `DOMParser` result doesn't fetch subresources or
  run script handlers, only a document actually inserted into a browsing
  context does.

## What's open / unverified

- Never rendered in a real browser — no Bash/WebFetch here. The one thing
  most worth checking first: that `fetch(location.href)` actually returns this
  page's live HTML rather than a cached or redirected variant, and that the
  `DOMParser`-based text extraction reads sensibly for the page's own markup
  (nested quotes, the `&mdash;` entity in the og:description, etc.) rather than
  mangling it.
- The threading question itself is still genuinely open. If a future
  iteration on this thread reports it's still wrong, the next step is not
  another lab build — it's tracing the dispatcher/listener that produces
  `.github/lab-requests/*.json` and checking what it sets `parent_uri` to on
  an iteration versus a first request. That code was out of reach from here on
  both counts: not writable, and not something I could find in full from
  inside a tenant's read access in the time this build had.

# lab kit — the shared style guide

Every tenant site in the lab factory is one self-contained HTML file. Without a
shared kit, each one reinvents its own palette, its own copy button, and its own
half-right fetch wrapper — and the community looks like a hundred strangers.

This directory is the counterweight: **one visual language, a handful of
behaviours worth getting right once.**

| File | What it is |
|---|---|
| `tokens.css` | colours, type, spacing, and the shapes of inputs/buttons/errors |
| `kit.js` | `showError`, `clear`, `copy`, `fetchJson`, `crumb`, and the Bluesky helpers below |

## How a tenant uses it

It is served **same-origin** at `minomobi.com/_kit/`, so a tenant links it — no
inlined copy, no external host, no CORS:

```html
<link rel="stylesheet" href="../_kit/tokens.css">
<script src="../_kit/kit.js"></script>
```

Linking rather than copying is the point: one edit here re-skins every site. A
tenant that wants its own identity overrides `--accent` in a local `<style>`
block; it does not fork the file.

## Touching Bluesky: `bskyGet`, `hidden`, `visible`

Use these rather than calling the AppView by hand. They exist because of a
specific failure, not for tidiness.

```js
const { did } = await kit.bskyGet('com.atproto.identity.resolveHandle', { handle });
const feed = await kit.bskyGet('app.bsky.feed.getAuthorFeed', { actor: did });
for (const item of kit.visible(feed.feed)) render(item);
```

**`bskyGet` only permits methods that take a subject the visitor named.** No
`searchPosts`, no `getFeed`, no firehose. That is the rule the whole factory
turns on: a lab site may show media for something the visitor asked about, never
for a stream nobody chose. `scripts/lab-content-gate.mjs` fails the build over
it and `lab/www/worker.js` sends a CSP that blocks it at runtime; this is the
version that tells you in the console while you are still writing the page.

**`visible()` is not optional when you render other people's posts.** The
AppView returns moderation labels as *data* and expects the client to act on
them — a page that renders `feed.feed` straight through is displaying what
bsky.app itself would have hidden. `hidden(item)` is the single-item form.

The reason all of this is here: the Bluesky bot this project is modelled on was
killed by one request, "pull cat images from the firehose". The firehose carries
content before any moderation decision reaches it, and a site that mirrors it
keeps serving posts after their authors delete them. `cat/` in this repo has the
same shape and never processes deletes at all.

## Why agents can read this but never write it

`lab-build.yml`'s containment gate rejects any build whose diff leaves the
tenant's own directory, and that includes this one. So a tenant can never
restyle its neighbours, and every change here is a deliberate human act. The
kit is curated; the tenants are generated.

## `fetchJson` exists because of a real bug

The first lab tenant called bare `fetch()` with no timeout. Its error handling
was correct for a *rejected* fetch — but a hanging network never rejects, so the
page sat on "Resolving…" forever with the catch block never running. `fetchJson`
carries an `AbortController` and turns both timeout and network failure into
ordinary thrown errors. Use it instead of `fetch`.

## Adding to the kit

Add a behaviour here once two tenants have wanted it, not in anticipation.
Keep it dependency-free and framework-free — a tenant is one file served
statically, and anything requiring a build step cannot be used.

## `three.module.min.js` — 3D, same-origin

three.js **r169**, the full ES module build, vendored here and copied to
`minomobi.com/_kit/` by `gen-lab-tenants.mjs` with the rest of the kit. MIT, and
the licence header is intact at the top of the file — do not strip it.

```html
<script type="module">
  import * as THREE from '/_kit/three.module.min.js';
</script>
```

**It is vendored rather than linked because a CDN cannot work here and the
failure is silent.** Lab pages run under `script-src 'self' 'unsafe-inline'`, so
`<script src="https://cdn.jsdelivr.net/...">` is not slow or frowned upon — the
browser refuses to execute it, and what ships is a blank canvas that looked fine
to whoever wrote it. The build agent has no network and no shell, so it cannot
fetch a copy either. Same origin is the only thing that can work, so the copy
lives here.

Requested by a real user as *"do it in 3js"*, which was impossible until this
existed.

**Addons are not included** — `OrbitControls`, loaders, post-processing all live
in `three/examples/` and are separate files. Write what you need against the
core, or ask for the addon to be vendored too.

**687 KB.** Cheap against the Workers Static Assets ceiling (25 MiB/file,
100,000 files/version) and it is one shared copy for every tenant, not one per
site — which is the whole reason the kit exists.

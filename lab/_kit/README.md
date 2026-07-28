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

## WebAssembly

The CSP carries `'wasm-unsafe-eval'`, so `WebAssembly.Module`,
`.instantiate` and `.instantiateStreaming` all work, and Web Workers are
allowed same-origin.

Measured, because none of it is obvious from reading the header:

| | under `script-src 'self' 'unsafe-inline'` | with `'wasm-unsafe-eval'` |
|---|---|---|
| `new WebAssembly.Module(...)` | `CompileError` + `[csp] blocked wasm-eval` | instantiates |
| `new Worker('/w.js')` | **already allowed** | allowed |

The Worker row is worth keeping. The obvious reading is that `worker-src` falls
back to `child-src` and then to `default-src 'none'`, so workers are blocked —
that is what I assumed and wrote down. It is wrong: the fallback chain reaches
**`script-src`** first, which permits `'self'`. Workers have worked all along.

**A build agent cannot produce a `.wasm`.** No compiler, no network, no shell.
So a module has to be vendored here by a human, exactly like `three.js` — and
the content gate now refuses any file it cannot read inside a tenant directory
(text and inert images only), because enabling wasm turned "a binary the gate
skipped" into "executable code nothing reviewed".

Ask for a module and it gets vendored. Same rule as everything else in here: if
it governs what ships, it lives in the repo.

## `wasm/` — three modules, and the exact call each one needs

Vendored from this repo's own Rust crates, copied not rebuilt. All three are
wasm-bindgen `--target web`, served same-origin, and each is asserted to
INSTANTIATE by `lab-smoke.selftest.mjs` — not merely to exist.

| Module | Size | For |
|---|---|---|
| `wave_md` | 0.42 MiB | `renderMarkdown`, `parseWikilinks`, `expandTemplate`, `CanvasRenderer` |
| `codescan_ocr` | 2.90 MiB | `extract_text(image_bytes, allowed_chars)`, `OcrEngine` — OCR on an image the visitor supplies |
| `pds_car_parser` | 0.11 MiB | parse an ATProto CAR file the visitor uploads |

**The init call is NOT the same for all three, and getting it wrong throws.**
`wave_md` was built by a wasm-bindgen new enough to derive its own `.wasm` URL
from `import.meta.url`; the other two were not, and calling `init()` bare gives
`WebAssembly.instantiate(): Argument 0 must be a buffer source`. An agent cannot
discover that — no network, no console — so:

```js
import init, { renderMarkdown } from '/_kit/wasm/wave_md.js';
await init();                                    // wave_md only

import init from '/_kit/wasm/codescan_ocr.js';
await init(new URL('/_kit/wasm/codescan_ocr_bg.wasm', location.href));

import init from '/_kit/wasm/pds_car_parser.js';
await init(new URL('/_kit/wasm/pds_car_parser_bg.wasm', location.href));
```

**`.wasm` must be served as `application/wasm`.** `instantiateStreaming` refuses
anything else, so the smoke server needed the MIME type added — without it every
module here fails locally while working in production, which is the worst way
round.

### `pds_car_parser` — uploaded *or* fetched

Fetching was blocked, and as of 2026-07-27 it is a deliberate, narrow permission
instead. `com.atproto.sync.getRepo` is the **only** `sync.*` method on the
allowlist, and `connect-src` gained `https://*.host.bsky.network`.

The chain, all of it already permitted:

```js
// 1. handle → DID          app.bsky.actor / com.atproto.identity.resolveHandle
// 2. DID → PDS endpoint    plc.directory
// 3. CAR                   <pds>/xrpc/com.atproto.sync.getRepo?did=<did>
// 4. parse                 /_kit/wasm/pds_car_parser.js
```

Self-hosted PDSes will not resolve — the wildcard covers Bluesky-hosted ones
only. Uploaded `.car` files still work and need nothing.

**Analyse, do not mirror.** A raw repo is unfiltered by the AppView: labels,
takedowns and blocks do not apply to what comes out of a CAR. Counting,
graphing and summarising is the point. Republishing someone's posts verbatim
from one shows moderated content with the moderation stripped off, and the
content gate cannot tell those apart — this is the agent's call.

## `/_img/` — avatars you can actually put in a canvas

`cdn.bsky.app` sends no `Access-Control-Allow-Origin`. An avatar from it
**displays** fine and then **taints** any canvas it is drawn on, so `toBlob` and
`toDataURL` throw a `SecurityError`. `crossOrigin="anonymous"` does not help —
it makes the load fail outright, because the header is never coming.

That is a browser rule, and it blocks the most on-mission thing a lab site can
do: compose a shareable image with the people in it. So this domain re-serves
those bytes from its own origin, and same-origin images do not taint:

```js
const cdn = profile.avatar;                       // https://cdn.bsky.app/img/...
const src = '/_img/' + cdn.split('cdn.bsky.app/')[1];
const img = new Image();
img.onload = () => { ctx.drawImage(img, 0, 0); canvas.toBlob(send); };
img.src = src;                                    // no crossOrigin needed
```

**It is not an open proxy.** The path must match Bluesky's CDN shape exactly —
a DID, a blob CID, a known image kind, a known format — and anything else is a
400. An image proxy that fetches arbitrary URLs is a way to launder any content
on the internet through this domain's reputation, which is the one asset the
whole factory depends on.

Found by a tenant, reported through `NOTE.txt`, fixed in the platform.

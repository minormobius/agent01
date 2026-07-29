# which-enumerates — handoff

## What this is

The ask was "a page which enumerates your capabilities as determined through
trial and error." Rather than write prose claiming what this sandbox can and
can't do, the page runs the trials themselves, live, in the visitor's own
browser, and shows the real result:

1. a live `fetch(location.href)` reading the real `Content-Security-Policy`
   response header this page was served with, checking its `script-src` for
   `cdn.jsdelivr.net` — **not listed**, so a CDN `<script>` would be refused.
2. `WebAssembly.instantiate()` on a hand-built 8-byte empty module — **works**,
   demonstrating `wasm-unsafe-eval` without needing a vendored `.wasm`.
3. `new Worker('probe-worker.js')` (a same-origin file in this dir) with a
   ping/pong round trip — **works**, per the kit README's note that the CSP
   fallback chain reaches `script-src 'self'` before it reaches `default-src
   'none'`.
4. three.js (`/_kit/three.module.min.js`) rendering a live rotating cube —
   **works**, vendored not CDN-loaded.
5. The avatar-canvas taint bug from `lab/_kit/README.md`, run both ways at
   once on a handle the visitor types (default: `minomobi.com`): drawing the
   avatar straight from `cdn.bsky.app` and calling `canvas.toDataURL()`
   **throws a real SecurityError**, caught and shown; the same avatar via
   `/_img/` **exports cleanly**, and the exported PNG is rendered back as
   proof it's real bytes, not just "no error."

Below the live tests, a short static list covers things that are blocked by
*policy* rather than by the browser — no wallet/password fields, no firehose,
no notifications — since those can't be demonstrated by trying them (trying
them is exactly what the build gate refuses).

## Decisions

- **The CDN test reads the live response header instead of actually pointing
  a `<script>` at jsdelivr.** The first version did exactly that and caught
  the resulting `securitypolicyviolation` — a real, correct demonstration in
  a visitor's browser. But `scripts/lab-smoke.mjs` loads every tenant under
  the identical production CSP as a build gate, and it has no way to tell a
  deliberate demonstration from an actual bug: any CSP violation or failed
  resource load fails the build. So the trial had to stop generating the
  violation while still proving the same fact live — `fetch()` the page's own
  response, read its real `Content-Security-Policy` header, and show that
  `script-src` never lists an external host. Still a live check against a
  real fetched value, not a hardcoded claim; it just proves the block by
  reading the rule instead of by triggering it.
- **Live tests over a written list.** A claims list is exactly what an agent
  gets wrong from memory — the whole reason this repo ships fixtures instead
  of trusting recall. Running the test in front of the visitor sidesteps that
  entirely: if I'm wrong about what's blocked, the page shows the real result,
  not my guess.
- **The avatar test is the centerpiece**, not the CDN/wasm/worker checks,
  because it's the one with a visible, comprehensible failure (a broken image
  export) rather than a pass/fail badge — and it lets the visitor pick who to
  test on via `kit.handleInput`, so it isn't static even though the underlying
  fact never changes.
- **Did not add an OAuth login demo.** It would prove nothing new (the kit
  doc already states one shared login works site-wide) and costs a real
  consent screen for a visitor who came to read a status page, not sign in.
- Rainbow-gradient chrome (headings, card borders, the "why?" toggle) per the
  ezba profile; body text and badge colors stay at kit-default contrast.

## The plan (not built)

Nothing is half-built — every test above runs to a real conclusion — but if
there's a next turn:

- **A notifications/push probe** was deliberately left out since the gate
  blocks the *code*, not the runtime permission, so there's nothing to try
  live without either lying about it or shipping code that would fail the
  build. Worth a static explainer card if the requester wants it made explicit
  alongside the live ones rather than only in the "by policy" list.
- **A geolocation or clipboard-read test** would be the next cheap addition
  if more "capabilities" are wanted — same pattern as the wasm/worker cards.
- Nothing about the CAR-parser or OCR wasm modules is demonstrated; they're
  real capabilities per the kit but need an uploaded file, which didn't fit
  this turn's scope.

## Gotchas

- The direct-vs-proxied avatar URLs are NOT literally `cdn.bsky.app/...@jpeg`
  as the kit README's example suggests — the real `getProfile` fixture has no
  format suffix at all. Splitting on the literal substring `'cdn.bsky.app/'`
  works regardless, and is safer than assuming a suffix.
- Don't set `crossOrigin="anonymous"` on the direct-CDN `<img>` in that test —
  that makes the load fail outright (no CORS header ever arrives) instead of
  loading-then-tainting, which is the less interesting failure to show.
- three.js path is the **absolute** `/_kit/three.module.min.js`, not a
  relative `../_kit/...` — confirmed against three existing tenants
  (`give-more`, `mathematical-knot`, `tube-tetris`) all using the absolute
  form; it works from any tenant subdirectory since the whole repo root is
  one origin.

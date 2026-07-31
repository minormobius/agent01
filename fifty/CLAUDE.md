# fifty — fifty.mino.mobi

<!-- SEEDED by scripts/gen-surface-docs.mjs from deploy-registry.json.
     This file is now HAND-OWNED — edit it directly; the script will not
     overwrite it. It is the instruction set for THIS surface. Repo-wide rules
     live in ../CLAUDE.md; the index of all surfaces is ../docs/SURFACES.md. -->

Fifty ATProto app pitches, built. One landing index and fifty concept pages —
thirty working tools, twenty honest write-ups of why the rest were not built.

## Facts

| | |
|---|---|
| Surface | `fifty` |
| Dir | `fifty/` |
| Endpoint | `fifty.mino.mobi` |
| Type | fullstack (worker + static assets) |
| Owning branch | `claude/fifty-microsites-deploy-fyjk1q` |
| Deploy | `.github/workflows/deploy-fifty.yml` |
| Uses | — (no shared backends, no D1, no auth, no secrets) |
| Provides | — |

Machine-readable entry: [`deploy-registry.json`](../deploy-registry.json) → `surfaces[]` where `surface == "fifty"`.

## The shape

```
fifty/
  concepts.js        the spine — all 50 entries, consumed by everything
  index.html         the landing grid
  note.html          renders a write-up; the worker serves it at /c/<n> for note concepts
  styles.css         one stylesheet for the index, the notes and all 30 tools
  worker.js          routing + the four server-side endpoints
  lib/               shared client libs and the pure engines
  c/<n>/index.html   one directory per built tool (30 of them)
```

**`concepts.js` is the source of truth for what exists.** Each entry carries
`state` (`built` / `partial` / `note`), the author's `pitch` verbatim, and
either `made` + optional `gap`, or `blocker` + `why`.

> **The pitch text is a primary source. Never edit it** — not for typos, not
> for house style. Everything else on the page is ours to change.

## Routing

The worker falls through to static assets, with one rule on top: a 404 on
`/c/<n>` (1–50) serves `note.html`, which reads the number back out of the
path. So **adding a tool is creating `c/<n>/index.html` and flipping `state`
in `concepts.js`** — nothing else knows which concepts have tools.

## The four server-side endpoints

These exist because three concepts genuinely cannot work in a browser, and one
supports the rest.

| Route | Concept | What it does |
|---|---|---|
| `/av/<handle>` | 01 | Resolve → profile → **302** to the avatar blob. Falls back to a generated identicon so a bare `<img>` on somebody else's site never breaks. |
| `/go/<handle>/<slug>` | 22 | Resolve → read `com.minomobi.fifty.link/<slug>` from **the owner's** PDS → 302. **Stores nothing** — that is the whole point of the concept. |
| `/api/rss?url=` | 27 | Fetch and parse RSS / Atom / JSON Feed server-side. Blogs do not send CORS headers, which is why this cannot be client-side. |
| `/api/*` | all | Read-only proxy: `appview/<nsid>`, `pds/<nsid>?__pds=`, `did/<did>`, `verify?url=&needle=`. |

**The proxy is allowlisted by method, not by host.** `PDS_METHODS` and
`APPVIEW_METHODS` in `worker.js` are read-only NSIDs only, every request is
issued as a GET, and `publicHost()` rejects loopback, RFC1918, link-local and
CGNAT targets. Adding a write method to either set would turn this into a
confused deputy — don't.

`/api/verify` is deliberately **not** a text proxy: it answers one yes/no
question about a page and returns a ±90-character window around the match, so
it cannot be used to read arbitrary pages through us.

## The engines

Everything with a right answer lives in `lib/` as a pure ES module that runs
unchanged in node and the browser:

| Module | Concept | The part that is easy to get subtly wrong |
|---|---|---|
| `iching.js` | 25 | King Wen lookup, and **yarrow probabilities** (1/16, 5/16, 7/16, 3/16) — not the three-coin approximation, which makes old yang and old yin equally likely and changes the oracle. |
| `bracket.js` | 42 | Bye placement. Seeds 1 and 2 must be unable to meet before the final at every size. |
| `recipe.js` | 21 | Ingredient parsing, fraction rendering, and pluralising the item when there is no unit ("2 eggs", "1 egg"). |
| `invite.js` | 37 | HMAC codes. Crockford base32 aliases I/L→1 and O→0, so a "tamper" test must not flip to an alias. |
| `csv.js` | 20 | Quoted fields, doubled quotes, CRLF; per-source rating normalisation. |
| `classify.js` | 9, 24 | Transparent rules that report which ones fired. |
| `scenario.js` | 33 | Payoffs must count the player's own move in the field. |

```bash
node fifty/lib/engines.selftest.mjs     # 216 known-answer checks
```

Preflight runs this automatically when `fifty/` changes, and
`deploy-fifty.yml` runs it **before** `wrangler deploy` — so a broken engine
fails the deploy rather than shipping.

## House rules for this surface

1. **Every tool does something real.** If a concept's interesting half cannot
   be built, it is a `note`, not a mockup. Where a tool does less than its
   pitch, `state: 'partial'` and a `gap` line say so at the top of the page in
   the author's own terms.
2. **Nothing writes.** No auth, no OAuth, no PDS writes. Tools that produce
   records hand you the JSON. Every network call is a public read.
3. **Simulated data is labelled as simulated** — the scenario field (33), the
   quadrant follow markers (16). Never present generated data as other people.
4. **The URL is the document.** Tools with authored state use `UI.state`
   (base64 JSON in the hash) so sharing is copying a link. No storage.
5. **Shared chrome, shared style.** `UI.mount(n)` draws the top bar, the
   concept header and the footer; per-page `<style>` is for genuinely
   tool-specific layout only.

## Adding a tool to a `note` concept

1. Write `c/<n>/index.html` — include `/concepts.js` as a classic script, then
   a `type="module"` script that imports `/lib/ui.js` and calls `UI.mount(n)`.
2. In `concepts.js`, change `state` to `built` or `partial`, replace `blocker`
   and `why` with `made` (and `gap` if it falls short).
3. If it adds a pure engine, add it to `lib/` and extend
   `engines.selftest.mjs`.
4. `node scripts/preflight.mjs --fix` from the repo root.

## Deploying

Pushes to `claude/fifty-microsites-deploy-fyjk1q` or `main` that touch
`fifty/**` trigger [`.github/workflows/deploy-fifty.yml`](../.github/workflows/deploy-fifty.yml).
The sandbox cannot reach Cloudflare — **push to a trigger branch, don't
`wrangler deploy` locally**.

`fifty` is a **new worker**, so the first successful run also creates the
`fifty.mino.mobi` DNS record and custom-domain binding. Per the golden rule
([`docs/DEPLOYS.md`](../docs/DEPLOYS.md) §4), green is not proof: **confirm the
deploy log binds `fifty.mino.mobi (custom domain)`.** If it only prints
`fifty.<account>.workers.dev`, the domain is stranded and the live site will
never change. A brand-new custom domain can take a few minutes to propagate, so
the workflow's curl check is `continue-on-error` — read the wrangler output,
not the curl step.

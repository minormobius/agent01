# rant — rant.mino.mobi

A box to rant into. Posts are [standard.site](https://standard.site) records in
the author's own ATProto repo. Written entirely in Rust — a `workers-rs` edge
worker and a `wasm-bindgen` browser module over one shared engine.

## Facts

| | |
|---|---|
| Surface | `rant` |
| Dir | `rant/` |
| Endpoint | `rant.mino.mobi` |
| Type | fullstack |
| Owning branch | `claude/standard-site-blog-page-319rod` |
| Deploy | `.github/workflows/deploy-rant.yml` |
| Uses | `auth.mino.mobi` |
| Provides | — |
| Status | **NEW — the custom domain is not attached yet.** See "Before the first deploy". |

Machine-readable entry: [`deploy-registry.json`](../deploy-registry.json) →
`surfaces[]` where `surface == "rant"`.

---

## The shape of it

Three crates in one Cargo workspace at `rant/`. `rant-core` is the whole engine
and has no platform in it at all; the other two are thin adapters that give it a
Worker and a DOM.

| Crate | Target | Holds |
|---|---|---|
| `crates/rant-core` | native + wasm | **Everything.** `doc` (the text-file format), `text` (tokeniser), `markdown`, `predicates`, `standard` (the lexicons), `feeds`, `card`, `agent`, `house`. Pure functions over `&str`: no I/O, no async, no clock. 80 unit tests + a budget test. |
| `crates/rant-worker` | wasm32 (workers-rs) | Routing, SSR, PDS reads, the JSON/MCP surface, SVG→PNG. |
| `crates/rant-view` | wasm32 (wasm-bindgen) | Composer, live preview, subscribe/recommend, the timed-view player. |

```
text file ──Doc::parse──> Doc ──┬──markdown::render────────> HTML
                                ├──text::tokenize──────────> [Token] ──predicates──> [Cell]
                                ├──standard::Document──────> the PDS record
                                ├──feeds::{rss,json_feed}──> syndication
                                └──card::svg──────────────-> the link card
```

**Why one core crate matters:** the composer's live preview calls the *same*
`render_body` the Worker calls — same compiled code, one crate. Most editors have
two renderers and find out they disagree in public.

### There is no hand-written JavaScript

`worker-build` generates the Worker's module shim; `wasm-bindgen` generates the
browser glue. The only `.js` in this directory tree is generated or staged (see
"the one fragile join"), and `rant.selftest.mjs` asserts that.

The one thing that is *deliberately* not Rust is OAuth: `crates/rant-view/src/auth.rs`
binds to `packages/oauth-client/auth.js` with `#[wasm_bindgen(module = …)]`.
Repo rule, and the right one — see [`../CLAUDE.md`](../CLAUDE.md) § Auth.

---

## Storage: two homes, same bytes

A post is a text file. It has two places to live and the engine cannot tell
them apart downstream.

**`rant/posts/*.md`** — the house publication. `build.rs` enumerates the
directory and `include_str!`s every file, so the bytes are *inside the wasm
module*: serving a post is a slice of resident memory plus a parse. Adding a post
is `git add rant/posts/whatever.md` and a push.

Frontmatter is optional and deliberately dumb — `key: value` lines between two
`---` fences, no YAML engine. `title`, `date`, `tags`, `description`, `slug`,
`updated`; anything else is preserved in `Doc::extra` rather than dropped. A file
with no frontmatter is still a valid post (title from the first heading).

Every house post **must** carry a `date`. Without one it would be stamped with
the deploy time, which is a lie about when it was written; `house.rs` and
`rant.selftest.mjs` both enforce it.

**A `site.standard.document` in somebody's PDS** — what the composer writes. The
raw markdown rides inside the record's `content` open union as an
`at.markpub.markdown` member, so the *source* is portable, not just a rendering.
`textContent` carries the generated plaintext because the spec says that field
holds no formatting and it is what every indexer reads.

Read at request time from the public XRPC endpoints, cached 60s. No credentials
are held by the worker, for anything, ever.

---

## Predicates — the weird ways to view the words

The one genuinely novel thing here, and the reason `read.mino.mobi` is in the
lineage. A **predicate** is a pure function `&[Token] -> Vec<Cell>` that says one
true thing about the words. Eleven of them, in `predicates.rs`.

Five are ports of Read's reading modes (`plain`, `bionic`, `rsvp`, `crawl`,
`memorize`) — including its dwell model, where the *pauses* at sentence ends are
the whole trick. Six are new: `skeleton` (function words dropped), `spine` (first
sentence per paragraph), `cadence` (sentence lengths as bars, no words at all),
`hapax` (weighted by rarity within the document), `concordance` (KWIC index of
its own vocabulary), `reverse` (last sentence first).

Three properties do the work:

- **Addressable.** `?view=skeleton` is a URL you can send someone. A mode that
  lives in a toolbar is invisible to a crawler, a screen reader, and an agent.
- **Composable.** `?view=skeleton+bionic`, up to four stages. Composition
  re-tokenises between stages (a few µs) rather than mapping `Cell -> Cell`,
  because stage two needs real sentence structure and stage one may have deleted
  half of it.
- **Server-rendered, always.** Even the timed ones: `rsvp` and `crawl` ship as
  markup with `data-ms` on every frame. With `rant-view` absent they degrade to a
  readable frame list. `rant-view` plays them; it does not recompute the timing.

### Adding a twelfth

1. A variant in `Predicate`, plus its `id()`, `blurb()`, and an arm in `apply()`.
2. Add it to `Predicate::ALL` — that array *is* the registry that `/api/predicates`,
   the view switcher, the MCP tool and the docs all read.
3. A `fn` that returns `Vec<Cell>`. Set `weight` to dim, `fixate` to bold a
   prefix, `dwell_ms` to make it timed, `br` to break.
4. **No CSS needed.** Every view styles the same `.w` spans; `rant.css` has one
   block for all of them. Add a `.view-<id>` rule only if it needs to look
   genuinely different.
5. The parameterised tests in `predicates.rs` will now demand your predicate is
   total (non-empty in, non-empty out) and survives the empty document.

### The honest limitation

Predicates operate on words. Any view other than `plain` renders the token
stream, so **headings, lists, tables and code are gone** — there is no
meaningful `skeleton` of a table, and RSVP over a code listing is a punishment.
Fenced code is skipped at tokenisation for the same reason. `plain` is the
default and is always one click away.

---

## standard.site conformance

Four records, in `standard.rs`, with the spec's field limits transcribed into
`clamp_*` helpers. We enforce them on the way **out** (never write a record a
strict validator would reject) and are liberal on the way **in** (a record from a
platform that disagrees with us still renders).

| NSID | what | written by |
|---|---|---|
| `site.standard.publication` | the blog — url, name, icon, theme | the author, once |
| `site.standard.document` | one post | the composer |
| `site.standard.graph.subscription` | the subscribe button | **the reader**, to their own repo |
| `site.standard.graph.recommend` | the recommend button | **the reader**, to their own repo |
| `at.markpub.markdown` | the content-union member holding raw markdown | inside a document — **never a record**, so it takes no OAuth scope |

Verification, both directions:

- `/.well-known/site.standard.publication` returns the publication AT-URI.
- Every post page carries `<link rel="site.standard.document" href="at://…">`
  and `<link rel="site.standard.publication" href="at://…">`.

**Unknown content members survive a round trip.** `Content::Other(Value)` keeps
another platform's richer block verbatim; there is a test for it. Eating other
people's fields is how a "shared" lexicon stops being shared.

### Composability is the point

`/read/<handle-or-did>/` renders **anyone's** standard.site publication through
our predicates, with no permission and no relationship — the records are public.
That is the whole argument for a shared lexicon: the reader is not coupled to
the publisher. `read_publication` is the same thing as an MCP tool.

### The subscribe button holds no list

Subscribing writes a record to the *reader's* repo. Nothing lands here. There is
no subscriber table to leak and no unsubscribe link to honour — unsubscribing is
deleting your own record.

The cost is that the count is not ours to know: `/api/subscribers` asks
[Constellation](https://constellation.microcosm.blue) (a public backlink index
over the firehose). If it is unavailable the page says "unavailable", **not
zero**. It is fetched after the page is readable, deliberately off the render
path.

---

## The link card

`/og/<slug>/card.png` and `.svg`. Built in `rant-core::card` as SVG, rasterised
by `resvg` in `rant-worker::card` — pure Rust, which is the only reason the whole
path fits inside the Worker.

The flourish: the card's bars are the post's own **cadence** predicate. Every
card is a picture of *that* post — a staccato rant looks nothing like a long
essay before you have read a word.

Three things are load-bearing:

- **The font is embedded** — `include_bytes!` of the Roboto Mono already vendored
  for `poll`'s cards. There is no filesystem in a Worker, so resvg's
  `system-fonts` and `memmap-fonts` features are **off and must stay off**: they
  fail to build, and a missing font renders as a valid PNG of a blank rectangle.
- **Monospace is a design decision**, not a taste. `card::ADVANCE = 0.6` makes
  title fitting exact instead of hopeful, which is why three sizes are tried and
  the result is guaranteed ≤ 3 lines.
- **The SVG is still served.** If rasterisation fails we serve it rather than
  500ing: a card some clients cannot render beats a link with no card.

---

## Routes

| path | |
|---|---|
| `/` `/archive/` `/<slug>/` | the house publication |
| `/<slug>/?view=<chain>&wpm=&round=` | any predicate view; `&format=text` for plain |
| `/read/<actor>/` `/read/<actor>/<rkey>/` | anyone's publication |
| `/og/<slug>/card.png` `.svg` | the link card |
| `/feed.xml` `/feed.json` | RSS 2.0, JSON Feed 1.1 |
| `/llms.txt` `/llms-full.txt` | agent index, whole corpus |
| `/mcp` | JSON-RPC 2.0 tools (GET returns the descriptor) |
| `/api/health` `/api/posts` `/api/post/<slug>` `/api/predicates` `/api/subscribers` | JSON |
| `/api/render` (POST) | the Rust engine as a service for sibling surfaces |
| `/.well-known/site.standard.publication` `/atproto-did` `/rant-agent` | contracts |
| `/compose/` | the composer — the one page that needs JavaScript, still rendered by the worker so it gets the real publication URI |

House pages are **not cached** — the render is ~240µs, and a cache would only
add an invalidation bug. PDS reads are cached 60s.

---

## Agents

`agent.rs` defines seven tools once; `/mcp`, `/.well-known/rant-agent` and the
docs are all generated from that list so they cannot drift.

**There is no write tool, and that is the design.** A document is written to a
person's repo with *their* OAuth grant, held by *their* browser. An agent can
list, read, render, run predicates over arbitrary prose, and `draft_post` — which
returns the exact record publishing *would* write, plus the card, without writing
it. A human hits Post. `agent.rs` has a test that fails if someone adds a
publishing tool.

`apply_predicate` works on any prose, not just posts. `skeleton` over a draft is
a genuinely useful (and brutal) editing pass.

---

## Quirks, in the order they will bite you

### The one fragile join

`crates/rant-view/src/auth.rs` declares
`#[wasm_bindgen(module = "/../../../packages/oauth-client/auth.js")]`. wasm-bindgen
turns that into an import specifier prefixed with `./snippets/<crate-hash>/`,
which — from `/pkg/rant_view.js` — resolves to **`/packages/oauth-client/auth.js`**
on this origin. So `deploy-rant.yml` stages `packages/oauth-client/auth.js` to
`rant/public/packages/oauth-client/auth.js`, exactly as `deploy-mappa.yml` does
for the same file.

That resolution is a property of *wasm-bindgen's output*, not of our source, so
`rant.selftest.mjs` resolves the emitted specifier and asserts it. If wasm-bindgen
ever changes its prefix depth, CI says so instead of production.

`rant/public/pkg/` and `rant/public/packages/` are build artefacts and are
gitignored. **Never edit the staged copy — edit `packages/`.**

### `panic = "abort"` breaks the build

Do not add it (or `strip = true`) to `[profile.release]`. wasm-bindgen's `catch`
wrappers need the externref table, and `worker-build` dies with
`externref table required for catch wrappers`. There is a comment in
`Cargo.toml`; the size win would have been kilobytes against a 1.1MB bundle.

### worker-build runs from the crate directory

It parses the crate's own `Cargo.toml` and refuses a `[workspace]` root, and it
writes to `./build/` relative to wherever it ran. Hence the `cd crates/rant-worker`
in `wrangler.jsonc`'s `build.command` and the nested
`main: crates/rant-worker/build/index.js`.

### Do not enable the `http` feature on `worker`

It swaps `worker::Response` for `http::Response<Body>` across the entire API,
including the assets binding, and this crate has no use for the `http` types.

### `wrangler dev` does not watch the sibling crates

Its watcher follows the worker crate's `src/`, so an edit to `crates/rant-core`
leaves the running dev server serving the previous wasm — the page looks
unchanged and you conclude your fix did not work. `touch crates/rant-worker/src/lib.rs`
to force a rebuild, or restart. (Beware `pkill -f "wrangler dev"`: the pattern
matches the killing shell's own command line.)

### The budget test only asserts in release

`tests/budget.rs` prints in both profiles but only fails in `--release`; a debug
build is ~20× slower and asserting on it would train people to ignore red.
`deploy-rant.yml` runs `cargo test --release -p rant-core`.

### Raw HTML is dropped and link schemes are filtered

Because we render *other people's* records. `markdown.rs` swallows `Html`/`InlineHtml`
events and neutralises any link target whose scheme is not
`http/https/mailto/at/did`. If you add a renderer path, keep both.

---

## Before the first deploy

Two things are outside CI's reach, in this order:

1. **Attach `rant.mino.mobi`** to the `rant` worker (dashboard —
   [`../docs/DEPLOYS.md`](../docs/DEPLOYS.md) §7). Until then the deploy updates a
   `rant.workers.dev` worker and goes green while nothing is live. Confirm by
   finding `rant.mino.mobi (custom domain)` in the run log.
2. **Redeploy the auth worker.** `workers/auth/src/oauth/scope.ts` gained the four
   `site.standard.*` collections and `index.ts` gained the origin. The auth server
   only grants what its deployed metadata declares, so until it ships, a login
   here is refused. `.github/workflows/deploy-auth.yml`.

**Linking the house publication** (optional; the site works without it): create a
`site.standard.publication` record in the DID that should own it, then set
`PUBLICATION_URI` and `PUBLICATION_DID` in `wrangler.jsonc` `vars`. Until then,
`/.well-known/site.standard.publication` 404s with an explanation and house
documents use the site URL as their `site` — which the lexicon explicitly allows
for "loose" documents, so it is spec-legal rather than a fudge.

---

## Testing

```bash
cd rant
cargo test -p rant-core                                  # 80 unit tests
cargo test --release -p rant-core -- --nocapture          # + the microsecond budget, printed
cargo check -p rant-worker --target wasm32-unknown-unknown
cargo check -p rant-view   --target wasm32-unknown-unknown
node rant.selftest.mjs                                   # the five parts, the golden rule, the OAuth ceiling
```

The sandbox cannot reach Cloudflare — **push to the owning branch, don't
`wrangler deploy` locally.** Read [`../docs/DEPLOYS.md`](../docs/DEPLOYS.md)
first, especially the golden rule: the `wrangler.jsonc` `name` must be the worker
that owns the live custom domain, or the deploy goes green while the site never
changes.

## Sizes, measured

| artefact | raw | gzipped |
|---|---|---|
| worker (`index_bg.wasm`, resvg is most of it) | 3.14 MB | **1.16 MB** |
| browser (`rant_view_bg.wasm`) | 437 KB | **175 KB** |

Comfortably inside the Workers bundle limit (3 MB gzipped on the free plan, 10 MB
paid) — but resvg is the thing to watch if the worker grows.

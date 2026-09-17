# jev — CLAUDE.md (a decision model with a body)

You are working on **jev**, the TypeSafe AI demo at `jev.mino.mobi`. It exists
to answer one question in public: *what is a model that only makes decisions
actually good for?*

[Jev](https://typesafe.ai/blog/introducing-system-one-models-and-jev) is
TypeSafe AI's first **System One model** (announced 2026-09-15). It does not
generate text. You post a **state** and a set of **typed questions**; it
returns typed answers. The three primitives, and the shapes this surface
depends on, are:

| Primitive | `criteria` is… | the answer carries |
|---|---|---|
| `choice` | a **map** of option → description | `choice`, `probabilities`, `confidence` |
| `score` | an **ordered array**, ≥ 2 levels | `score` (fractional), `legend`, `probabilities`, `confidence` |
| `noul` | optional `{ true, false }` | `noul` — a single 0–1 number |

Every question in one call is evaluated **in parallel and in isolation**
against the same state. The docs are at <https://docs.typesafe.ai/>; the
endpoint is `POST https://api.typesafe.ai/v1/systemone`, model `jev-latest`.

**The demo.** A delver stands in a chamber of a procedurally generated
dungeon. Every tick (10 s by default) the page posts ONE call: the delver's
state, plus five questions — `move` (a choice over the doors that actually
exist), `danger` (a score), and `fight` / `take_loot` / `withdraw` (nouls).
The delver acts on the answers, the map updates, and the raw request and
response are shown verbatim. Nothing is scripted.

---

## ⚠️ The domain is not bound yet

**`jev.mino.mobi` does not resolve.** The first deploy (2026-09-17) uploaded
the worker and then failed on the domain record:

> You have exceeded the limit of 100 Workers custom domains on zone
> `mino.mobi` — `[code: 100122]`

That is a hard Cloudflare per-zone limit and the zone is at it (this repo
alone declares 87 `custom_domain` patterns; lab tenants on other branches
make up the rest). So this surface currently ships to **workers.dev** — the
deploy log prints the URL it served, and the workflow verifies that URL
rather than an assumed one.

Three ways out, in the order I would try them:

1. **Free a slot.** Detach a custom domain from a retired surface in the
   Cloudflare dashboard (dashboard-only — `docs/DEPLOYS.md` §7), then restore
   the `routes[]` block in `wrangler.jsonc` and push. Best long-term: the zone
   is full and this will bite the next new surface too.
2. **Serve it by Workers Route instead of Custom Domain.** Routes cap far
   above 100 per zone. A route needs a proxied DNS record for `jev` on the
   zone, which wrangler cannot create — one dashboard record, then
   `routes: [{ pattern: "jev.mino.mobi/*", zone_name: "mino.mobi" }]`.
3. **Leave it on workers.dev.** Fine for a demo link; not a `*.mino.mobi` URL.

Whichever is chosen, the golden rule still applies on the way back: confirm
the deploy log binds `jev.mino.mobi (custom domain)` before believing it.

**It is live right now at <https://jev.majormobius.workers.dev>.** That URL is
written into three places, because a catalogue of "what a person can visit"
should not carry a dead link. When the domain does bind, change all three and
re-run `node scripts/preflight.mjs --fix`:

| File | Field |
|---|---|
| `catalogue.json` | the `jev` entry's `u` |
| `rethink/proposal.json` | the `jev` row in the `sites` group, keyed by host |
| `deploy-registry.json` | the `jev` surface's `endpoint`, and the warning at the head of its `note` |

---

## The four things worth knowing

### 1. The key lives in the worker, and only in the worker

`assets.directory` is `"."`, so **every file in this directory is served to the
public internet.** The TypeSafe API key is therefore a Cloudflare secret read
only inside `worker.js`:

```bash
wrangler secret put TYPESAFE_API_KEY     # one-off, from the dashboard key
```

…or let `deploy-jev.yml` push it on every run. **Mind the two names:** the key
is stored as the GitHub repo secret **`jev_key`**, and the workflow writes it
into Cloudflare as **`TYPESAFE_API_KEY`**, which is what `worker.js` reads.
(`TYPESAFE_API_KEY` is also accepted as a repo-secret name, as a fallback.) Never put it in `wrangler.jsonc`, in `app.js`, or in any file
under `jev/`. `test/worker.selftest.mjs` asserts the key never appears in any
response the proxy returns, on the happy path *and* on every error path — if
you touch `worker.js`, that test is the thing that has to stay green.

`POST /api/ask` is deliberately narrow, because an open pass-through to a
metered API is somebody else's free API key:

- POST + JSON only, and **no CORS headers are emitted**, so only this origin
  can read it from a browser
- the body is rebuilt from a whitelist — only `state` and `questions` survive,
  and `model` is forced to `jev-latest`
- caps: 64 KB body, 12 questions
- every question's `type` is checked against the three primitives before
  anything is spent

It also throttles: **30 calls per minute per client IP**, checked before
anything is spent, returning 429 with `Retry-After`. The page ticks every 10 s
(6/min), so several tabs are fine.

**Be honest about what that throttle is.** It is a per-isolate sliding window.
Workers isolates are per-colo and get recycled, so a caller spread across
colos gets more than 30. It stops naive hammering and a stuck browser tab; it
is **not** a security control. `/api/ask` is reachable by anyone who knows the
URL — CORS only binds browsers, and curl ignores it. If this demo ever gets
linked somewhere busy, put a real limiter in front: a Durable Object or KV
counter, or a Cloudflare Rate Limiting rule on the zone.

### 2. It never pretends to be Jev

With no key configured the page runs `offlineAnswers()` — a local
rule-of-thumb that emits the same response shape. That keeps the demo alive
in a sandbox, but it is **not** the model, so:

- the mode banner flips to *live* only after a real response comes back
  stamped `source: "typesafe"` (the worker adds that stamp; the stand-in
  stamps `source: "offline"`)
- the answers panel and the run summary both repeat which one produced the
  numbers
- a failed call falls back for that tick and says so in red

Keep it that way. A demo that quietly showed heuristics while claiming a model
would be worse than a broken one.

### 3. `delve.mjs` is pure, and the selftest is the contract

All the delve logic — the world fold, the state document, the question
builder, the resolver — is dependency-free ESM that runs **identically in node
and the browser**. `app.js` is only the loop, the fetches and the rendering.

`test/delve.selftest.mjs` walks **every room** in the fixture and asserts the
question shapes in each one: choice criteria is a map whose keys are exactly
the real exits plus `hold`, score criteria is an ordered array, noul criteria
is `{true,false}`. That is the TypeSafe request contract written down. If
TypeSafe changes it, this test is where it should break — not in a live demo
in front of an audience.

```bash
node jev/test/delve.selftest.mjs     # 405 checks, offline
node jev/test/worker.selftest.mjs    # 44 checks, stubbed upstream
```

Both run with no network and no key, and both gate the deploy.

### 4. The dungeon comes from foam, and foam is a different service

Map and contents are fetched live from
[`foam.mino.mobi/api`](https://foam.mino.mobi/api) — `/api/dungeon` for the
geometry, `/api/content` for the roll of creatures, loot and traps. That API
is CORS-open and deterministic (same params → byte-identical response), which
is what makes a shareable seed mean anything.

`foam` is owned by a **different branch** (`claude/foam-dungeon-generator-aoaz0j`).
Do not edit it from here. If you need a change in the dungeon format, that is a
conversation with that surface, not a patch from this one.

When foam is unreachable the page falls back to `fixtures/` (the saved seed 7,
size s dungeon) **and says so in the map subtitle**. The fixtures are also what
the selftests run on, so they must stay valid `foam-dungeon` / 
`foam-dungeon-content` documents — regenerate with:

```bash
curl -s 'https://foam.mino.mobi/api/dungeon?seed=7&n=3&size=s'          > jev/fixtures/dungeon-seed7-s.json
curl -s 'https://foam.mino.mobi/api/content?seed=7&n=3&size=s&roll=1'   > jev/fixtures/content-seed7-s-roll1.json
```

---

## Running it here

```bash
node jev/test/devserver.mjs                 # offline mode, http://localhost:8787
node jev/test/devserver.mjs --stub-live     # pretend a key is set; canned jev-shaped answers
```

`--stub-live` exercises the live rendering path without a key. Its answers are
canned, not Jev's — it is there to prove the page renders a real response, not
to stand in for the model.

To check a key actually works, before wiring anything up:

```bash
TYPESAFE_API_KEY=sk-... node jev/test/live-check.mjs
```

That is the only file here that talks to `api.typesafe.ai`. It makes ONE real
call with the same five questions the site asks, prints the answers with their
probability bars, and then asserts the thing a decision model promises: every
question answered, nothing extra, and `move.choice` inside the option set it
was given. It is not part of the deploy — the two gating selftests are offline
and need no key.

`window.__jev` is the headless harness hook (the `__foam` / `__dungeon`
pattern): `.tick()`, `.state()`, `.questions()`, `.summary()`. Keep it.

## Layout notes that cost time once

- The wire panel's `<pre>` blocks need `min-width:0` on **both** the grid and
  its children. Without it a long line refuses to shrink below its content
  width and the whole panel overflows its container.
- The depth ramp is **sequential, one hue, monotonic in lightness**, and dark
  mode has its own steps rather than an inverted copy. Identity on the map is
  never colour alone: the entrance is a square, vaults are diamonds, the
  delver is a ring, each in the legend by shape.

## Adding a question

Add it to `buildQuestions()` in `delve.mjs`, handle its answer in
`applyAnswers()`, and render it in `renderAnswers()` in `app.js`. The selftest
picks up the new question automatically for the shape assertions; give it an
answer in `offlineAnswers()` too, or the stand-in test that asserts the
stand-in answers every question asked will fail — which is the point.

Mind the worker's `MAX_QUESTIONS` cap (12) if the set ever grows.

---

## The CAD demo that is NOT built yet

`cad.mino.mobi` was the other candidate for a Jev demo, and it is a good one —
a feature-tree CAD engine is a decision problem wearing a geometry costume.
It was not built here, for two concrete reasons, both worth knowing before
someone tries:

1. **The source is on a branch this one does not have.** `cad` has no entry in
   `deploy-registry.json` at all; the work lives on a feature branch. Nothing
   under `cad/` exists on this branch to build against.
2. **There is no public API to stand in for it.** Probed 2026-09-17:
   `cad.mino.mobi/api`, `/api/health` and `/docs/CAD.md` all 404. Unlike foam
   — whose CORS-open, deterministic `/api/dungeon` is exactly what made this
   demo possible from a sandbox — cad exposes nothing a browser can fetch.

So a cad demo needs one of: that branch merged, or cad growing a read-only
JSON endpoint for a model's feature tree. Until then anything built here would
run on hand-pasted JSON, which is a mock wearing a demo's clothes.

**What it should ask when it is possible.** The shape is the same as this
surface's: one state, several typed questions, one call. From what the live
page documents (params, mates, features, a tree of named faces and edges,
Manifold for preview booleans and Truck/OCCT for exact):

- `next_operation` — a **choice** over the operations legal on the current
  selection (fillet / chamfer / shell / pattern / boolean), criteria written
  from the actual tree state, so the model can never name an operation the
  kernel would reject
- `manufacturability` — a **score** on an ordered scale from "3-axis millable
  as-is" to "needs 5-axis or a redesign"
- `fillet_first` — a **noul** on the classic feature-order question, where
  getting it wrong is a rebuild failure three features later
- `rebuild_risk` — a **noul** on whether a proposed edit will orphan a named
  face downstream, which is the single most common way a feature tree breaks

The interesting claim to test there is the one this dungeon demo only gestures
at: a choice constrained to legal operations cannot produce an invalid model,
so the expensive exact kernel never runs on a proposal the type system could
have rejected. That is a real benchmark, not a toy — and worth doing properly
once the geometry is reachable.

# silk — silk.mino.mobi

An agent that weaves orb webs from local rules and the silk it has already
laid, and a page that measures what it produces. Repo-wide rules live in
[`../CLAUDE.md`](../CLAUDE.md); the index of all surfaces is
[`../docs/SURFACES.md`](../docs/SURFACES.md).

## Facts

| | |
|---|---|
| Surface | `silk` |
| Dir | `silk/` |
| Endpoint | `silk.mino.mobi` |
| Type | frontend (assets worker with a `/health` route) |
| Owning branch | `claude/spiderweb-physarium-agent-ta17v4` |
| Deploy | [`.github/workflows/deploy-silk.yml`](../.github/workflows/deploy-silk.yml) |
| Uses | — (no D1, no KV, no auth, no secrets, no network at runtime) |
| Provides | — |

Machine-readable entry: [`../deploy-registry.json`](../deploy-registry.json) →
`surfaces[]` where `surface == "silk"`.

## What it is for

The question behind the surface: *for a given set of boundary conditions, is
there a correct family of spiderwebs, and where does the spread inside that
family come from?* The answer this surface argues for, and measures:

- there is a family, and it is tight in the numbers a field biologist takes off
  a photograph — capture area, spiral turns, silk used, mesh height, radius
  count all agree across seeds to within a few percent;
- the family is loose in geometry, past the point where one member could be a
  shifted copy of another;
- and the looseness is **construction order**, not noise. Perturb one decision
  and the damage is a monotone function of *when* you perturbed it, spanning two
  orders of magnitude from the bridge line to the four-hundredth spiral
  attachment.

The framing is Physarum's — an agent whose environment holds its state — with
one difference that does all the work: **a chemoattractant evaporates and silk
does not.** A decaying trace lets an agent forget a bad early commitment; an
undecaying one cannot be un-laid. That is the whole reason the spread is path
dependence rather than noise. [`RESEARCH.md`](RESEARCH.md) has the literature
search behind this, and the ten properties such an agent has.

## The shape

```
silk/
  index.html            four tabs: weave · the family · path dependence · notes
  styles.css
  js/
    rng.mjs             seeded streams — ONE PER DECISION CLASS (see below)
    fabric.mjs          the silk: nodes, tension-only threads, Verlet, Chain
    boundary.mjs        the boundary conditions + the seven presets
    weaver.mjs          THE AGENT — the body, the stages, every rule
    metrics.mjs         the invariants, the family aggregate, the divergence
    render.mjs          canvas drawing; knows nothing about weaving
    app.mjs             the page; knows nothing about weaving either
  word/                 THE LEXICON WEB — /word/, a second, unrelated web
    engine.mjs          THE PIPELINE. Pure: no fs, no DOM, no network.
                        createCollector() keeps word ids and a date, nothing else
    car.mjs             CAR v1 + DAG-CBOR reader, DataView, no dependencies.
                        Incremental: push chunks, records come out, nothing is held
    stopwords.mjs       GENERATED from rite/lexicon — do not hand-edit
    build.mjs           node CLI: fetch/read a CAR → engine → data.json
    analyze.worker.js   Web Worker: the same engine, on a visitor's handle
    data.json           the prebuilt example (1.1 MB), committed
    index.html app.mjs lexicon.css
  test/
    fabric.selftest.mjs  32 checks — geometry, tension-only, splitting, chains
    weaver.selftest.mjs  62 checks — the four claims the page makes
    word.selftest.mjs   106 checks — the CAR reader, the data file, the promise
    browser/
      harness.mjs            serves silk/, resolves Playwright, counts checks
      typeahead.browser.mjs  23 checks — the handle box; NOT in CI, see below
      chart.browser.mjs      16 checks — the export, the sliders, the reweave
      gentle.browser.mjs     24 checks — gentle mode, the crash mark, the repaint
  worker.js             assets + /health
  wrangler.jsonc
```

`weaver.mjs` is the file. Everything else exists to serve it or to check it.

## The lexicon web (`/word/`)

A different question on the same shape: *what does a whole vocabulary look
like?* 39,554 word types from 49,919 posts, placed by topic (angle), rank
(radius) and date (colour). It shares nothing with the weaver but the palette
and the domain — it is a chart, not a simulation.

**Anyone can build their own.** Type a handle and the whole pipeline runs in a
Web Worker in the visitor's tab: their PDS is resolved, the repo is fetched
straight from it, and the analysis happens locally. Nothing is uploaded and
nothing is stored. All three endpoints it needs — `resolveHandle`,
`plc.directory`, `com.atproto.sync.getRepo` — send `access-control-allow-origin:
*`, which is the only reason this is possible at all.

**The handle box has a typeahead, and it is the page's one outbound call.**
`app.bsky.actor.searchActorsTypeahead` (also `*`-CORS) after 2 characters and a
140 ms debounce, avatars from `cdn.bsky.app` with `referrerpolicy="no-referrer"`.
A handle is the one thing here you must get exactly right and cannot be expected
to remember, and the only feedback used to be a failed build. Three rules keep it
honest:

- **it is a convenience, never a gate.** Every failure — offline, 500, rate
  limit, unexpected body — ends in an empty list and *nothing else*: no banner,
  no disabled button. Typing a handle in full and pressing Enter always works,
  which is both the escape hatch for accounts the directory has not indexed and
  the way to opt out of the request. Proven accidentally: Playwright cannot reach
  the real endpoint, so every browser test builds with the lookup failing.
- **the page says so.** The note under the box and a paragraph in the notes name
  the endpoint and the CDN. A page that claims "nothing leaves your machine" and
  quietly ships keystrokes to a third party would be worse than one that never
  claimed it.
- **rows are built with `textContent`, never `innerHTML`.** Display names are
  arbitrary strings written by strangers, arriving from a third party — this is
  the only place on the surface where such a string is rendered.

Picking a row passes the DID the list already carried, so the worker skips
`resolveHandle`: one fewer round trip, and `NO_HANDLE` cannot happen for a name
that was offered to you. Two bugs this shape invites, both guarded and tested:
responses race (`mi` answers after `min` and the stale list wins — hence the
sequence counter), and `click` fires after the input's `blur` has already closed
the list (hence `pointerdown`).

**One engine, two callers.** `engine.mjs` is pure and is imported by both
`build.mjs` (node) and `analyze.worker.js` (browser). That is the contract worth
protecting: a second implementation for the browser would drift, and a visitor
would get a picture built by different rules from the one on the front page. The
refactor that split it out was verified by rebuilding `data.json` and diffing —
only `heaps` moved, because its sampling became adaptive.

**Rebuild the example:** `node silk/word/build.mjs <handle>`. The 91 MB repo CAR
is cached in `word/.cache/` and is gitignored *and* `.assetsignore`d; it is an
input, not an artefact, and shipping it would blow the asset budget on its own.

**Costs, measured in a real browser:** the full 91 MB / 50k-post repo takes about
8 seconds end to end and costs the browser about 120 MB of peak RSS. The engine
refuses fewer than 60 posts-with-words rather than emitting a degenerate layout.

**There are two ways in, because one large response has a hard floor.** Measured
in Chromium: fetching the 91 MB archive and **throwing every chunk away unread**
costs ~80 MB of browser RSS. `cache: 'no-store'` does not help. That is the cost
of receiving one big body, and no work in the reader touches it — which is why
"stream it and hold nothing" was necessary but not sufficient, and why someone
whose tab kept dying kept losing it.

So the worker takes a `mode`:

| | `archive` (default) | `pages` (gentle mode) |
|---|---|---|
| endpoint | `com.atproto.sync.getRepo` | `com.atproto.repo.listRecords`, 100 at a time |
| in flight | the whole repo | ~70 KB |
| 50k posts | ~8 s | ~4 min (≈470 ms per round trip, measured) |

Same collector, same engine, **same output** — posts are sorted by timestamp, so
arrival order does not survive into the answer. The selftest asserts that
directly, on the archive's order, on listRecords' reversed paging, and on a
shuffle. (The property it rests on: no two posts in a real corpus share a
millisecond — 50,258 posts, 50,258 distinct `createdAt`.)

**iOS discards canvas backing stores, and a page that draws on events never
finds out.** The report that led here was *"it finishes and the web is empty"*,
on an iPad: stats panel fully populated, no error, blank square. That is not a
crash and not a data problem — iOS Safari reclaims canvas pixels under memory
pressure without resizing the element, raising an error or firing anything you
can rely on, and this page only draws in response to events. The moment it is
likeliest is straight after a build, when the tab has just been at its
high-water mark.

Four ways back, in `app.mjs`: `pageshow`, `visibilitychange`, `contextlost`
(preventDefault, which is what asks for a restore) / `contextrestored`, and —
the one that matters, because a discarded store may announce itself to nobody —
`watchPixels()`, which reads a four-pixel band across the middle of the canvas
at 0/250/1200/4000 ms after a build and redraws if there is no ink in it. The
band crosses the hub and the frame, so it is never legitimately empty.

Two things that make a purge likelier, both now avoided: the export canvas
(2000×2170, ~17 MB of pixels) is released with `width = height = 0` the instant
its blob exists rather than at the collector's convenience, because on iOS every
live canvas comes out of one page-wide budget; and the drawing surface is capped
at `MAX_SIDE` as well as at 2× device pixels, because iOS enforces its canvas
size limit by handing back a blank one rather than by throwing.

**This is a strong hypothesis fitted to the symptom, not a reproduction.**
Safari's engine is available here (`playwright install webkit`) and both build
paths render correctly in it at iPhone and iPad sizes — WebKit on a desktop is
not under memory pressure and will not purge. The repaint guards are right
whether or not the diagnosis is; if a blank web is still reported after them,
the purge theory is wrong and the next place to look is the layout, not the
pipeline.

**The crash mark.** A tab that runs out of memory does not get to report it:
there is no error, no console line, the page is simply gone. So `runHandle`
writes the handle to `localStorage` before starting an archive build and removes
it on success, on a reported failure, and on `pagehide`. A mark still present at
the next load means the last attempt died on its feet — so gentle mode comes on
by itself and the page says why. `pagehide` is the discriminator that makes this
work: navigating away fires it, crashing does not.

Two measurement traps, both of which produced numbers I nearly believed:

- **A leftover harness browser.** A backgrounded Playwright run was still
  allocating during a measurement and turned +25 MB into +346 MB. Check
  `pgrep -c -f headless_shell` before trusting a delta.
- **V8 does not collect when nothing forces it.** In an unconstrained container
  V8 grows the heap rather than running GC, so `listRecords`' short-lived
  `JSON.parse` garbage shows up as a +246 MB peak on localhost and +106 MB at
  120 ms of page latency — the number falls as the network slows, which is the
  tell. **Every RSS figure here is an upper bound from a machine with no reason
  to tidy up**; the constrained device these paths exist for will collect
  instead. Do not quote them as what a phone does.

**Nothing holds the archive, and that is what stops the tab dying.** The first
version accumulated every chunk, joined them into one buffer, parsed that into an
array of every post record, and only then began work: the download, plus a second
copy of it, plus tens of thousands of live records with their facets and embeds
still attached. Measured, that was **+388 MB of browser RSS for a 91 MB repo**,
and big accounts took the tab down — the one failure this page cannot explain
away, since the whole pitch is that it runs on your machine.

Now the response is parsed as it arrives and every record is reduced on sight to
word ids and a timestamp: **+123 MB, and 20% faster** for the same repo, because
most of the old cost was allocating things to throw away. Four pieces:

- `createCarParser` is fed chunks and holds nothing but the tail of an
  incomplete block. `skip()` walks a CBOR value without building it, so an MST
  node — and there are about twice as many of those as there are records — costs
  a pointer walk instead of an object graph.
- `keep` (`POST_FIELDS`) names the four fields the pipeline reads. Facets and
  embeds, usually the bulk of a post record, are never materialised.
- `createCollector` interns words as it sees them and appends their ids to **one
  flat `Int32Array` for the whole corpus** — not one array per post, because
  48,000 typed-array headers cost more than the 317,000 tokens they hold. The
  record is garbage before the next one is read.
- Reply roots are hashed to 53 bits rather than kept as `at://` URIs. A collision
  merges two threads into one session, which is beneath the noise floor of a
  co-occurrence count; 50,000 URIs is tens of megabytes.

**It is byte-for-byte output-preserving, and that was checked rather than
assumed:** `data.json` rebuilt through the new path diffs clean against the
committed file. The one thing that did break in the process is worth knowing —
sessions now hold word *ids*, and one leftover `sectorOf.get(w)` was still being
handed a number where it wanted a string. Every doc scored zero, every tail word
fell through to the fallback, and 38,824 of 39,554 types landed in the hub. It
looked exactly like the raw-vote bug from the first build. The wedge *labels*
were identical, which is what said the clustering was fine and only the
assignment was wrong.

Four things in here were got wrong first and are worth not re-deriving:

**The context unit is a session, not a post.** At 6.4 content words a post,
post-level co-occurrence is almost all zeros and ones. The first run produced a
flat eigenvalue spectrum and k-means collapsed six of eight clusters to empty.

**The leading eigenvector is thrown away.** The first component of any PPMI
matrix is the frequency axis, so keeping it made every "topic" a frequency band.

**The tail is assigned by lift, not by raw vote.** The hub cluster is by
construction the one whose words appear everywhere, so on a raw vote it wins
every tail word — the first build put 37,829 of 39,554 types into it.

**Radius is rank, spaced for equal area — not log frequency.** This is the one
that had to be drawn to be believed. Zipf puts 19,320 of these words at exactly
one use, and log(1) = 0, so half the lexicon lands on a single hairline circle
at the rim with the interior empty. Log-frequency gives the count-1 shell 9% of
the radius for 48% of the words. `r = √(r_in² + (r_rim² − r_in²)·p)` makes
density flat, and the counts go back on as labelled rings.

Two more that only showed up once strangers' corpora were possible:

**Empty wedges are compacted away.** k-means on a thin vocabulary can leave a
cluster with nothing in it, and the client turns every wedge into an angular
span and then divides by its member count. The engine now drops empties and
re-indexes, so "K wedges, all non-empty, ids 0..K−1" is a guarantee rather than
something the example data happened to satisfy.

**`min uses` reweaves; it does not filter.** Every positional quantity in the
layout is a function of *which words are in play*: a wedge's angular span comes
from how many types the topic has, its rim vertex from how deep its tail runs, a
word's radius from its rank, its angle from its index within its wedge. Hiding
marks and leaving the rest where they sat produced a moth-eaten copy of the
unfiltered picture — the rim eaten away and the survivors still huddled where
they had been when they had company. `computeGeom(minc)` redoes all of it over
the survivors and the web genuinely re-forms: wedges breathe, the outline
changes shape, the contour rings move so `21×` still means 21 uses, and what is
left spreads out to fill the disc.

It runs on every `input` event of a dragged slider, so it is O(N) with small
constants: **the sorts happen once**, because filtering removes words but never
reorders them, so a survivor's rank is just how many survivors came before it in
a precomputed order. Geometry is twelve wedges and eighteen contour radii, small
enough to keep three copies of (from, to, now) and lerp — which is what makes
the change read as a web re-weaving rather than one picture cutting to another.
Retargeting mid-flight is deliberate: `from` is wherever things are at this
instant, which is what makes dragging feel continuous. The hover hash is rebuilt
only when a weave settles — 39k Map inserts a frame is not affordable, and a
tooltip mid-flight is not worth having.

**Type size is the density control, and there is only one of them.** There used
to be a label-count slider and a fixed type size, which is the wrong way round:
asking for 400 labels at 17px asks for something the canvas cannot give, and the
control silently did nothing past the point where the collision grid filled.
Size is the honest handle — you can always see what it did — and the count
follows from it *quadratically*, because labels compete for area. Both readouts
report a measurement rather than the slider position (labels actually placed,
words actually left); a control whose number is its own input tells you nothing.
The collision grid tracks the type size too: held at a constant 13px it made an
8px label reserve a 13px row it did not need.

**Zoom separates; it does not magnify.** Scroll, drag, pinch, double-click,
`+`/`-`/`0`. Everything drawn in device units — dot radii, line widths, label
type, the hover tolerance — stays the same size as `z` rises, so the only thing
zooming does is pull the haze apart into words. Sizes that scaled with the
transform just made a bigger blur. The label budget rises with `z` (capped at
3.5×) because the extra room has to be spent on *more* names, and `pick()`
converts its 11px tolerance back to world units or it would grab half a wedge at
20×. The export ignores the view entirely and always renders the whole web at
z = 1: a picture that silently depended on where you happened to be looking
would be a different picture every time you pressed the button.

**A transform carries the size of the surface it is for.** `tf()` returns
`{s, x, y, w, h}`, and anything that needs to know where the edges are is handed
one. It did not, once, and the export was the casualty: `drawMarks` culled
against `cv.width` while rendering into a 2000px canvas, so everything past
`cv.width / s` world units was dropped and **the copied PNG came out as a
quarter of a web**. That is the failure mode worth remembering here — the button
still said `downloaded ✓`, no error was raised, and the test that existed
checked only that a download happened. `chart.browser.mjs` now reads the actual
downloaded file back and counts lit pixels per quadrant. (Related, found at the
same time: the mark-size cap of 1.35 device px put a 2000px export outside the
linear regime while the screen was inside it, so the export's dots were visibly
finer than the ones on screen. The cap only exists to stop marks merging, which
needs a far bigger canvas than an export.)

**HTML chrome over the canvas reserves its own boxes.** The hub caption, the
zoom readout and the pan hint are DOM, so the label placer cannot see them and
was drawing words underneath. `chromeBoxes()` measures the three elements and
hands their rectangles to `drawLabels` alongside the anchors'. While fixing that:
`.zoomtag` sets `display: flex` on a class, which outranks the UA's
`[hidden] { display: none }` — the readout was pinned on screen at 1× with its
`hidden` property set, and a test that asserted `el.hidden` agreed with it.
Assert computed visibility.

**The disc has a gutter.** It used to be inscribed in the square with 4% to
spare, which left rim labels at 3 and 9 o'clock nowhere to go — dropped by the
overflow guard, or drawn hard against the border. `R_OUT` now stops well short,
the gutter holds the wedge names, and a word label that will not fit outward is
flipped inward before it is given up on.

## Testing the browser build

The selftest asserts the layout invariants for the shipped file **and for
generated corpora**, because the case that matters now — someone else's repo —
has no fixture. It also builds a real CAR out of plain objects and feeds it to
the incremental parser **at ten chunk sizes down to one byte at a time**, which
is the only way to catch a varint split across two pushes or a block spanning
three; and it asserts the contract that matters most, that streaming the archive
and handing over an array of records produce the same file. It also checks the stopword module has not forked from
rite/lexicon, and the page's privacy claim: no whitespace, no non-token strings,
no URIs in the data file.

What the selftest cannot reach is the worker itself. That is covered by a
Playwright run that intercepts the three network calls and serves a local CAR —
`route.fulfill` for small fixtures, and a **302 to a local HTTP server** for the
91 MB one, because fulfilling a body that size base64s it through CDP and kills
the tab. It found the bug that mattered: `const { records, blocks } = readCarBytes(…, () => …blocks)` reads `blocks`
from its own temporal dead zone, so every browser build died at "reading the
archive". `readCarBytes` now hands the count to the callback instead. The same
harness exercises all five failure paths — unknown handle, no PDS, refused
archive, rate limit, too-small repo — each of which must show a specific message
and re-enable the button.

Two of these runs got **committed**, under `test/browser/`. Each serves `silk/`
itself and stubs or avoids every call, so they need nothing running and reach
nothing real. Neither is a `*.selftest.mjs` and CI runs neither: the deploy
workflow has no Playwright and no Chromium. They are in the repo because what
they check are claims the page makes about itself, and a claim with no runnable
check behind it decays into a comment.

- [`typeahead.browser.mjs`](test/browser/typeahead.browser.mjs) — 23 checks: the
  escaping, the staleness guard, the DID shortcut, the keyboard, `pointerdown`
  surviving blur, and that a 500 from the directory leaves no trace on the page
  while a typed handle still builds.
- [`gentle.browser.mjs`](test/browser/gentle.browser.mjs) — 24 checks: that
  gentle mode builds without ever touching `getRepo`, that a refused archive
  offers the slow way as a button, and the crash mark in all four of its states —
  a crash arms it, a reported failure does not, walking away mid-build does not,
  and a clean load stays fast. The crash is simulated by leaving the mark and
  opening a *second tab*, because reloading fires `pagehide` and correctly clears
  it; getting that wrong is what made this test fail first time. Plus the repaint
  guards: the canvas is wiped from outside and must come back via each of
  `pageshow`, `visibilitychange` and `contextrestored`, and then — the case that
  matters — wiped mid-sweep with **no event at all**, where only the post-build
  pixel check can save it.
- [`chart.browser.mjs`](test/browser/chart.browser.mjs) — 16 checks, all of them
  about pixels: that the exported PNG is the whole web and not a quadrant (read
  back off the real download, counted per quadrant), that type size buys labels,
  and that `min uses` reweaves — survivors still reach the rim and still fill the
  disc, wedges resize, contour rings move, and it flies rather than cutting.

## Five things that are load-bearing, and why

**1. One random stream per decision class.** `rng.mjs` gives bridging, framing,
radius placement, the auxiliary spiral and the capture spiral separate streams.
Without this the path-dependence view is worthless: perturbing radius #3 would
reshuffle every later draw, and you could not tell "the perturbation propagated
structurally" from "the noise changed". With it, nudging a radius leaves the
spiral's own draws bit-identical, and the selftest asserts exactly that.

**2. Threads pull; they do not push.** The constraint solver only ever shortens
an over-long thread (`Fabric.relax`). Structure is held by pre-tension against
pinned anchors, which is how a real web works and why cutting a frame thread
slackens a sector instead of doing nothing.

**3. Geometry is read live, never cached.** `_sortRadii` recomputes every
radius's bearing from the hub's *current* position each time the list is
touched, because the hub is not pinned and every radius laid drags it. Caching
bearings at lay time produced sorted orders that disagreed with the geometry,
and the agent "split" gaps that were already full.

**4. Gravity enters twice and the two must stay apart.** Behaviourally (the hub
rise, the up/down mesh tilt) it is what the animal *does*; mechanically it is
what makes the sheet hang. The mechanical term is scaled to 5% because at full
strength the whole web slid down its frame, dragged the hub back to centre, and
silently cancelled the behavioural asymmetry the model exists to show.

**5. The capture spiral is gauged per radius AND against the previous
attachment.** Two gauges, not one: a mesh inward of the last turn *on this
radius*, averaged 92/8 with *where the agent just was*, one radius back. The
second term is a low-pass filter running round the web, and it is why an orb's
outer turns follow the frame and its inner turns are nearly circular. Both were
got wrong first: a single global spiral phase averaged the gravity term away
before it reached any thread, and no smoothing at all turned a rectangular frame
into concentric rectangles.

## The presets are the argument

`boundary.mjs` carries seven. Two of them are not habitats:

- **no gravity** is a **control**. Its job is to make the gravity result
  falsifiable: hub rise goes 0.113 → −0.011, capture area below ÷ above goes
  1.44 → 0.95, mesh above ÷ below goes 1.21 → 1.06. Without it, "the agent makes
  lopsided webs" would be indistinguishable from "the algorithm happens to make
  lopsided webs".
- **thin silk, high wind** proves the degradation order. Frame and radii are
  non-negotiable; the shortfall lands entirely on the capture spiral, and the
  scaffolding the agent never reached is still hanging when it stops. An
  unfinished web is a correct web.

## Changing the agent

The selftests are not a smoke test — they are the page's claims. `weaver.
selftest.mjs` asserts the family CVs, the gravity control and the shape of the
path-dependence curve, with thresholds set from measurement and a margin, not
from what happened to pass. **If a change to the rules makes them fail, the
honest move is usually to change the claim on the page, not the threshold.**
That has already happened once: the mesh tilt is real but modest (1.21, and
CV 10%), so it was demoted from "invariant" to "gravity readout" and the page
was rewritten to say so.

Both selftests run in CI *before* wrangler. A surface that publishes a
measurement it no longer passes is worse than one that publishes nothing,
because it looks like evidence.

`assets.directory` is `.`, so **everything in this dir is uploaded and served**
unless `.assetsignore` says otherwise. That is how `test/` came to be live at
`silk.mino.mobi/test/*.mjs`; it is ignored now. The engine, the worker and the
CAR reader stay public deliberately — the notes link `engine.mjs` so a visitor
can read the code that is about to run in their tab.

## Deploy

Push to `claude/spiderweb-physarium-agent-ta17v4` touching `silk/**`. Static
worker, no build step. `silk.mino.mobi` was a fresh hostname (verified
unclaimed 2026-08-20) created by the first deploy from the `custom_domain`
route in `wrangler.jsonc` — the path `foam`, `loop` and `plant` took.
**Green is not proof:** confirm the run logs `silk.mino.mobi (custom domain)`.
The workflow's `/health` probe is patient (2 minutes, for first-deploy
certificate issuance) but not permissive — it fails red.

# b — b.mino.mobi

<!-- SEEDED by scripts/gen-surface-docs.mjs from deploy-registry.json.
     This file is now HAND-OWNED — edit it directly; the script will not
     overwrite it. It is the instruction set for THIS surface. Repo-wide rules
     live in ../CLAUDE.md; the index of all surfaces is ../docs/SURFACES.md. -->

Portal to every Bluesky tool here—feeds, network maps, account analysis, and the shared OAuth worker in one place.

## Facts

| | |
|---|---|
| Surface | `b` |
| Dir | `b/` |
| Endpoint | `b.mino.mobi` |
| Type | frontend |
| Owning branch | `claude/mutual-closeness-game-earzue` |
| Deploy | `.github/workflows/deploy-b.yml` |
| Uses | — |
| Provides | — |

Machine-readable entry: [`deploy-registry.json`](../deploy-registry.json) → `surfaces[]` where `surface == "b"`.

## How it works

The Bluesky corner of mino.mobi at b.mino.mobi (worker `b`, b=Bluesky, companion to g=graphics). Hosts the disk Poincare interaction map at /disk, the feedgen feed builder at /feedgen, spark at /spark (the followed account's posts a follower had liked before they followed), dyad at /dyad (the full dyadic timeline of every recorded interaction between two accounts — likes, reposts, replies, quotes, mentions, follows, blocks, list-adds, both directions), squares at /squares (closest-circle picture toy — a seed handle's most-interacted-with accounts over the last week, ringed around their avatar in those accounts' most-liked image of the week; click a tile to recenter on it), orbit at /orbit (the same circle as a guessing game — posts from the ring dealt into an arena, dragged to whoever wrote them, graded on lift over blind guessing; then ANALYSE CIRCLE streams every member's whole repo as a CAR and folds it into a directed whole-history closeness matrix, first reply both ways and volume since, that packs into a 1.9 KB URL fragment), mood at /mood (a jev mood ring — the last ten posts and replies read for tone by TypeSafe's decision-only System One model and drawn as one colour band each around the avatar; two ORDERED axes asked as `score` and one UNORDERED one asked as `choice`, because a single angry→happy scale would render half-fury-half-delight as calm, and the ten readings are averaged on the plane and never in hue; /api/mood takes a handle and nothing else so no caller can spend the metered key on questions of their own), the quarter at /map (walkable pixel-glyph catalogue of EVERY social/ATProto tool across mino.mobi — districts by function, the road east climbs complexity tiers I–IV, per-tool stack + live-health cards; data in b/map/tools.js, companion audit in docs/SOCIAL-STACK-AUDIT.md), thread tetris at /tetr (real threads quantized into hex polyominoes), unique at /unique (the "hapax" finder — harvests every bigram/trigram from a handle's posts, keeps only the ones they used exactly once as a free pre-filter, then verifies each survivor against platform-wide search to surface the two/three-word phrases used exactly once on all of Bluesky; worker endpoints /api/unique/{scan,search}, the search fan-out streamed as NDJSON and carrying the authed service token; a boundaries toggle (default on, param crossPunct=false) forms n-grams only within contiguous runs — never across a sentence end, comma, quote, bracket or newline), coin at /coin (the posting box that only unlocks when your draft carries a phrase nobody on Bluesky has ever posted — /api/unique/novelty checks each contiguous bigram/trigram for zero existing hits; sending writes a normal app.bsky.feed.post via the shared auth worker with a narrow atproto+repo:app.bsky.feed.post OAuth scope, so the consent screen is post-only; imports /packages/oauth-client/auth.js staged into the assets dir at deploy time; THREAD COMPOSER: n segments, each gated separately (every post in a thread must carry a novel phrase, or you could pad something new with nine things that are not), posted as a real reply chain with root+parent wiring by b/coin/compose.js. MEDIA: paste, drag-drop or the file picker (accept=image/* with no capture attr, which is what makes a phone offer both photo library and camera); images are downscaled in-browser to fit the ~1MB PDS blob ceiling and uploaded only on send; per-image alt text. Scope widens to 'atproto repo:app.bsky.feed.post blob:image/*' — requested at sign-in rather than escalated on first attach, since an escalation redirect would drop pasted images. KEYBOARD-FIRST: mod+Enter sends, mod+Shift+Enter adds the next post and focuses it, mod+U attaches, mod+Backspace deletes an empty segment, mod+Arrow moves between posts; only modifier combos are intercepted so a bare Enter is always a newline, and after a send the composer resets AND refocuses so you can fire ten in a row without touching the mouse. b/coin/compose.selftest.mjs gates facet byte-offsets, grapheme counting and the reply chain. THE CONSTRAINT ALGEBRA (b/coin/rules.js): the novelty gate is no longer hardcoded but one member of a RULE SET — 16 rules across two axes, scope (post | thread) x kind (pure | corpus | self). SELF rules measure a draft against YOUR OWN history: `virgin` (contains a word you have never posted) downloads your whole repo as a CAR ONCE via b/coin/lexicon.js, reduces it to a Set of every word you have ever used, caches that in IndexedDB (1 week TTL) and then checks by set lookup on every keystroke — costly once, free thereafter; posting folds the new words in immediately so a word stops being new the moment you spend it. The repo is only downloaded when a self rule is actually in the ruleset AND you are signed in. Corpus rules (novel, novelBigram) hit /api/unique/novelty; pure rules (wildcard word-of-the-day, avgWord, lipogram, univocalic, noRepeats, alliterate, monosyllabic, acrostic, question, exact) are computed in-browser for free, and a purely lexical ruleset never touches the network. Thread-scope rules span the chain: haiku (5-7-5 across three posts), chain (each post begins on the previous post's last word), shrinking. Rulesets serialise into ?rules=novel,avgWord:6,wildcard:lantern and ?daily=1 is a date-seeded challenge pairing one GROUNDED rule (corpus or self — checked against the network or your own past) with one FORMAL rule (pure — checked against the text), same for everyone, no server. b/coin/rules.selftest.mjs gates every rule's accept/reject, URL round-trips and daily stability), meme at /meme (the mirror of unique — scan(kind=meme) keeps the bigrams/trigrams a handle REPEATS instead of hapaxes, then /api/unique/meme classifies each against platform search: zero other authors = a personal meme/idiolect fingerprint, a handful of others = the co-memeticists leaderboard aggregated across shared phrases, a saturated window = ordinary language dropped), lathe at /lathe (THE TOY MILL — procedurally generated social toys. The thesis: the ~40 hand-written social tools across mino.mobi are 40 points in one small space, so instead of writing the 41st, write the space. b/lathe/engine.js is a TYPED PIPELINE ALGEBRA — subject (one handle / two handles / a list) -> source (posts, media, likes, reposts, follows, followers, mutuals, list members, blocks) -> 0-2 lenses (ngrams, distinctive, hashtags, domains, clock, weekday, overTime, sentiment, lengths, readability, engagement, pictures, mentions, cooccur, replyTo, reach, overlap, exclusive, handles, bios) -> view (ranked, cloud, dial, bars, scatter, histo, graph, grid, wall) -> optional sink; every node declares in/out PORTS (posts/accounts/terms/edges/series/scalars/images) and toys are built by a TYPED WALK so they are correct by construction, then re-certified by an independent validate() oracle (the fable/forge move). 884 type-correct shapes at vocab v3. Nodes carry since/until so the vocabulary can RETIRE as well as grow (the `handles` lens was pruned at v3 — it measured domain grammar, not people — and stays reachable at v1/v2 so pinned links reproduce). THE HAYSTACK RULE (v3+): a `sparse` lens (ngrams/hashtags/domains/cooccur hunts rare things) sitting on the paged feed is auto-upgraded to the full-repo `archive` source, because a needle hunt needs the stack; parsed archives are cached per DID in IndexedDB (6h TTL) so several toys over one account pay the download once. PROGRESSIVE DRAW: single-binding pure-chain toys (and list toys, member by member) re-run the pipeline and repaint on every page of data, so a big pull fills in live instead of looking saturated. Grid faces carry a recenter control that re-runs the same toy centred on that account (for `two`, the clicked person replaces the second handle — the co-mutual walk), and an /io-style sticky ride-along bar carries prev/random/next. VOCABULARY IS VERSIONED (engine VOCAB const + `since` on each node): adding a node changes what every unpinned seed produces, so /lathe/t/<seed>?v=<n> pins a permalink to the vocabulary it was minted under and reproduces that toy exactly; a bare /t/<seed> means 'this seed in today's space'. Two heavy async lenses take a set of accounts to its internal STRUCTURE — `interlink` (relation space: exact who-follows-whom inside the set via app.bsky.graph.getRelationships, 30 others/call) and `kinship` (posting-material space: Jaccard over each member's recent post vocabulary) — both accounts->edges, both feeding the avatar force graph; b/lib/hovercard.js gives every post link a post preview and every profile link a profile preview (delegated, cached, desktop-only). CAPABILITIES refine the port types: sources declare what they `provide` (engagement counts, thumbnails) and lenses what they `need`, so the walk cannot mint a well-typed but STARVED toy (archive->engagement would draw a field of zeroes) — the oracle rejects those too. The `archive` source downloads a whole repo via com.atproto.sync.getRepo and parses the CAR with the Rust->WASM parser vendored under rite/ (staged into b/lib/atproto at deploy by deploy-b.yml, alongside packages/oauth-client; both are gitignored under b/). runtime.js drives wasm-bindgen's init with BYTES rather than a URL so the archive path is exercisable in node, not browser-only. rollToys(constraints)/feasible() power the mill's constraint picker (pin subject/source/lens/view/sink, roll within that corner; empty corners are reported, never faked) and every toy page exposes its genome as JSON. Deterministic (xmur3+mulberry32) so /lathe/t/<seed> is a permanent address — worker serves toy.html for any seed. THE PROOF: 12 real hand-written toys (unique, meme, rite/web, squares, rite/lexicon, rite/atlas, rite/signal, density, cluster, echo, photo, seek) are encoded as genomes in KNOWN[] and validate under the same algebra — rendered as a live table on the mill page; the generator independently rediscovers squares. PROCEDURALLY SCOPED OAUTH: a genome's sink derives its own scope (share -> 'atproto repo:app.bsky.feed.post'), the oracle rejects a sink whose scope does not authorise its write, and read-only toys never load the auth lib at all. b/lathe/runtime.js holds one real executor per node against public CORS-open endpoints — runtime.selftest.mjs asserts the engine vocabulary and the runtime implementations are THE SAME SET, so a permalink can never fail to run. Two node selftests, no build step, no backend: b/lathe/engine.selftest.mjs + b/lathe/runtime.selftest.mjs — run BOTH before touching the engine), groom at /groom (follow grooming — reads a handle's follow records straight from their repo and reports the ones that have not posted or replied in over a year, the ones whose accounts are gone, and the ones who never followed back; signed in as yourself, each row unfollows in place. Pure logic in b/groom/groom.js gated by groom.selftest.mjs, network in b/groom/scan.js, DOM+OAuth in app.js; see the section below for why it reads the repo rather than getFollows), and gc at /gc (block-intelligence tools + API — /gc block matrix: accounts vs posters → who directly blocks whom; /gc/mutuals: mutuals or followers of X who block Y; /gc/blockers: everyone blocking a named user; /gc/api docs the read-only JSON API at /api/gc/{relation,matrix,who-blocks,blockers}). #1/#2 read raw app.bsky.graph.block records (the worker also serves them server-side via b/lib/gc.js); network-wide blocker sets (#3 + the blocker side of #2) come from the clearsky.services index. All read-only public data, no auth, CORS open. Renamed from atmosphere (worker mino-atmosphere -> b; atmosphere.mino.mobi subdomain retired — detach in dashboard + delete the mino-atmosphere worker).

## thread and sleuth — the two that moved in

Both arrived from `photo` on 2026-08-01, where they had been filed as image
tools by accident: they read Bluesky **text**. `photo` 301s `/thread` and
`/sleuth` here and translates the old fragment deep links.

**They were ported, not copied.** `photo` is a Vite/React surface and this one
has no build step, so the pure modules moved unchanged — `thread/thread.js`,
`sleuth/{posts,llm,dossier}.js`, none of which ever had a React import — and the
three components were rewritten as plain DOM in `thread/app.js` and
`sleuth/app.js`. That asymmetry is the general lesson for anything else moving
here: **check whether the destination can run the source's form** before
planning a move, which is why `scripts/rehome.mjs` reports "N components and no
page" rather than pretending a `git mv` would finish the job.

`lib/identity.js` is new and shared: handle → DID → PDS, plus a public profile.
Deliberately *not* a vendored copy of photo's `src/lib/resolve.js` — forty lines
of two fetch calls against a frozen public API do not earn a sync obligation. If
a third surface wants it, promote it to `packages/` and vendor it properly.

Sleuth's API key lives in **sessionStorage**, so it dies with the tab. It is
bring-your-own and goes straight from the tab to the provider; the settings
panel says so rather than leaving it to be discovered.

Selftests: `thread/thread.selftest.mjs` (post-URL parsing; images, galleries and
quotes out of a hydrated embed — including `app.bsky.embed.gallery`, which is
what a post of more than four pictures became and which every reader here was
blind to) and `sleuth/sleuth.selftest.mjs` (the TF-IDF ranking, and the temporal
buckets the dossier is built on).

## knot — the graph problem, and why it is not a fetching problem

`/knot` finds the dense core of an account's mutual follows. `minormobius` has
**1,329 mutuals**, and knowing who among them follows whom means 1,329 follow
lists — about **20,000 paginated requests, eleven minutes** at good concurrency.
`cluster` (on the root surface) waits for all of it. Nobody waits eleven minutes,
so the fix had to be algorithmic.

### What was measured before building anything

| route | records | requests | bytes | time |
|---|---|---|---|---|
| MST subtree walk via `getBlocks` | 1,707 | 35 | 432 KB | 6.1 s |
| `getFollows` (what `cluster` uses) | 1,509 | 18 | 957 KB | 2.6 s |
| `listRecords` on the collection | 1,707 | 19 | 464 KB | **1.1 s** |

- **`listRecords` wins and is also more correct.** It returned **1,707 records
  where `getFollows` returned 1,509** — the AppView silently drops follows to
  deactivated, deleted and blocked accounts, so any graph built on `getFollows`
  is missing ~12% of its edges.
- **The clever route loses.** The MST is sorted by `collection/rkey`, so all
  follow records are contiguous and `com.atproto.sync.getBlocks` can fetch a
  subtree. Built and measured: slower. `getBlocks` caps near 200 CIDs per URL
  (the CIDs ride in the query string) and the tree is 9 levels deep, so the
  descent alone costs 21 round trips. **Do not rebuild it.**
- **`limit` is hard-capped at 100** on `listRecords`, `getFollows` and
  `getFollowers` alike — `limit=200` is `InvalidRequest`. There is no bulk read.
- **`getRelationships` does 30 pairs in one request**, so all-pairs over M
  accounts costs `M·⌈(M−1)/30⌉` against `M·⌈F/100⌉` for full rows. Crossover at
  **M ≈ 0.3F**; with F ≈ 1,700 that is M ≈ 510. At 1,329 mutuals full rows win,
  which is why `knot` does not use it — but below a few hundred it is the right tool.

### The idea that makes stopping early legitimate

Reading one account's follow list yields a **complete row** of the adjacency
matrix, not a sample, so a mutual edge is confirmed once both endpoints are read.
Find a set where everyone has ≥ k mutuals inside it: every edge is real, and
unread accounts can only *add* degree to its members. **So the group on screen is
a genuine k-core of the full graph, from a fraction of it.** More reading can
raise k; it can never invalidate what is already shown. That is the whole
product — `knot.selftest.mjs` asserts it by revealing a known graph row by row
and checking every intermediate core against the full adjacency.

Steering: an unread account's in-degree from already-read rows is a free
centrality estimate. Read highest-first and the core assembles early. On a
planted graph that is **80 rows against 389** for blind ordering, and the
selftest fails if that advantage disappears — otherwise a refactor could turn
the clever crawl into a slow one with every other test still green.

**A k-core, not a clique, deliberately.** Maximum-clique is NP-hard and brittle
(one missing follow splits the group); "everyone here has ≥ k mutuals here" is
linear, survives a missing edge, and describes a community better.

### `b/lib/graph.js`

Shared, and the place to add graph reads rather than a fourth copy: `followsOf`
(listRecords, 6h IndexedDB cache), `followersOf` (AppView — your followers are
other people's records, so there is no repo to read), `mutualsOf`,
`relationships` (batched at 30), `pdsFor` (cached with **no expiry** — one
plc.directory lookup per DID would otherwise be 1,300 extra requests), and
`pool()` for bounded concurrency.

## palm — six readings, and the third CAR path

`/palm` takes a handle, streams its **entire** repository, and reads six
stylometric lines off it: cadence (how evenly you arrive), vigil (whether you
sleep), lexicon (how wide you draw), polish (how well-formed you are), drift
(whether you are still the same writer), chorus (whether you answer). Each is
oriented so high = machine-like; the composite places you on a dial from *Pan*
to *the Loom* and draws a radar card you can save as a PNG.

**It is not an AI detector and the page says so twice.** Bluesky caps a post at
300 characters and every published detector degrades badly below ~50 words, so a
per-post verdict would be invention. What survives at this length is stylometry
*in aggregate* — the error on a mean over 50k posts falls as √N — so the reading
is about the account and never about a post. The dial is a **percentile against
other accounts**, not a probability that anything was generated. Anything that
later reintroduces a per-post number has to answer that objection first.

### `car-stream.js` — why there is a third CAR reader here

`coin/lexicon.js` and `lathe`'s `archive` source both buffer the whole download,
hand it to the Rust→WASM parser, get NDJSON back for **every** record in the
repo, and `.split('\n')` it. On a 90 MB / 50k-post repo that is the chunk array,
plus a contiguous copy, plus wasm linear memory, plus ~500k records as one
UTF-16 string, plus the array `split` allocates — and the tab dies. Measured on
`minormobius.bsky.social` (90 MB, 300k blocks): the streaming reader finishes in
**2.9 s at 140 MB peak**, keeping 49,891 posts and dropping 178,934 likes on the
floor as they go past.

Two things make it possible, and both are load-bearing:

- **No MST walk.** Prefix compression inside an MST node is node-*local*
  (`os/crates/car-parser/src/mst.rs` resets `last_key` per node), so every node
  decodes independently and block order does not matter. Collect key→CID from
  whatever nodes stream past, collect CID→record from record blocks, join at the
  end. No roots, no recursion, no block index.
- **Anchored sniffing.** Only candidate blocks get decoded. A post record is
  found by the DAG-CBOR length byte `0x72` that can only precede an 18-character
  string — **not** by searching for `app.bsky.feed.post`, because every *like*
  contains that inside its `subject.uri`, and likes outnumber posts 3:1. Get this
  wrong and the card is drawn from a corpus that is 78% not-posts with nothing
  looking broken. `palm.selftest.mjs` builds that exact like and asserts it stays out.

It is pure JS with no WASM, so unlike the other two it needs nothing staged at
deploy time. If it earns a third caller, promote it to `packages/`.

### The baseline is built offline and committed

`baseline.json` is a 101-point quantile table per axis plus the pairwise
correlations, built by `build-baseline.mjs` — **node only, run by hand, needs
network**. It measures a pool of real accounts *exactly* as the subject is
measured (full repo, same code, same fixed budgets), because a percentile against
a differently-computed population is a lie with a number attached. Pool members
come from the seed account's own reply partners: a real bias, stated on the page.

```bash
node b/palm/build-baseline.mjs <posts.json> --pool 80 --cache /tmp/pool
```

`--cache` keeps each account's reduced posts so changing an axis and re-running
costs nothing; the download is the whole expense. Two axes carry **fixed
budgets** (`LEX_WORDS`, `ECHO_TRIGRAMS`) and the Heaps fit is pinned to a fixed
word range — take those pins out and the percentiles silently start measuring
who posts the most rather than how they post.

**The pool is a curated roster, and that was a fix.** It was originally the seed's
own reply partners — selected, in other words, *for replying* — which made
`chorus` circular by construction. It is now the membership of a Bluesky list
(`--list roster.json`), a mutual-follow cluster with no selection on
conversationality. The improvement is measurable: **worst axis correlation went
from −0.59 to −0.274**, so all six lines are now near-independent rather than two
of them being one and a half.

It is still a bias, just a nameable one: a mutual-follow cluster is a single
community, sharing interests and register far more than a random sample. And a
tight cluster talks to itself constantly, so subjects still read broadcast-heavy
on `chorus` — `minormobius` is 97th there. That is a real property of the
comparison, not a defect in the axis.

**Rebuild it with the roster, not the reply-partner default:**

```bash
node b/palm/build-baseline.mjs <posts.json> \
  --list roster.json --exclude <seed-did> --cache /tmp/pool
```

`--exclude` drops the seed: you cannot be a percentile against a pool containing
yourself. Rejections are collected with reasons and written into `baseline.json`
(`rejected[]`, `attempted`) so **"is everyone on the list in the corpus" has an
answer you can check.** Of 98 attempted, 76 qualified; 12 were under the 500-post
floor, 9 could not fill `LEX_WORDS`, one account was terminated.

### The corpus browser

`/palm/corpus/` tiles every pool member as a small hexagon — no labels, because
at 150px the shape is the readable thing and six words are noise. It reads
`corpus.json` (emitted alongside `baseline.json`) plus `baseline.json` for the
rejection list, so the page is one request and no computation, where `/palm`
itself is a 90 MB download.

The tile derives its archetype through the same `archetype()` the reading uses —
one definition of the pair, not two. Grid is `auto-fill minmax(148px)`, which
lands on two columns on a phone and as many as fit above that.

Publishing the pool is deliberate: **the pool is the scale**, and a percentile
without its population is a number you have to trust rather than one you can
argue with. It sits in tension with this surface's own "read your own palm" line,
and the resolution is the framing — tiles are percentiles among a named pool,
never verdicts, and every figure comes from a public repository.

### The card puts the headline under the plot

The composite used to sit in a disc at the centre of the radar. That was not
merely busy, it **occluded data**: every axis below roughly the 35th percentile
plots inside that radius, so a low scorer's most interesting readings were hidden
behind their own score (`minormobius`: Lexicon 6 and Vigil 23, both underneath).
The card now reads top to bottom — chart, verdict, archetype, identity — and the
polygon is drawn on nothing but its own web. Keep it that way.

**Echo was cut from the radar.** It measured trigram repeat rate and correlated
with Lexicon at **r = 0.84** across the pool: a narrow vocabulary and a high
repeat rate are one fact in two hats. Six readings that are really five is worse
than five honest ones, so `drift` replaced it and echo survives as a footnote.
The correlation matrix ships in `baseline.json` precisely so the next person can
run the same check — regenerate it whenever an axis changes.

### The dial was flat, and the fix is two percentiles

The composite started as the plain mean of the six percentiles, and that is the
central limit theorem applied to your own dial. Averaging six roughly
independent U(0,100) values gives a standard deviation near 12 rather than 29, so
it piles up at 50. **Measured across the pool: 80% of accounts fell into two of
the seven bands, and `Wholly Pan` and `The Loom` were reached by nobody at all** —
two verdicts that existed only in the source code.

So the mean is put back through the same treatment the axes got, against the
pool's distribution *of means* (`quantiles.__composite`, built by the second pass
in `build-baseline.mjs`). It is deliberately circular — the pool normalised
against itself — which is precisely what makes the output uniform on 0..100.
After: **sd 12.2 → 30.0, all seven bands reached, min 0 max 100.**

Two consequences worth holding onto:

- **Band widths are now population shares.** `BANDS` says 4/12/17/33/17/12/5, so
  4% of people are Wholly Pan. Editing a boundary is choosing how rare a verdict
  is, not just where a line sits.
- **`score()` still works against an older baseline** with no `__composite` key —
  it falls back to the raw mean and reports `normalised: false`, because a flat
  dial beats no dial. The selftest pins both branches.

Re-run `build-baseline.mjs` after ANY axis change: the composite table is derived
from the per-axis tables, so a stale one silently mis-reads the dial.

### The matrix — 30 archetypes, so the reading is not just a number

Two people who both score 43 have nothing in common except 43. `matrix.js` names
the **pair**: the line running furthest toward the machine (dominant) and the one
furthest toward the animal (recessive). Six axes give 6 × 5 = 30 ordered pairs,
and with seven bands that is **210 distinct readings**. Across 85 real accounts,
28 of the 30 cells were hit.

The pair is about the *shape* of a hand, not its magnitude — someone at 12 and
someone at 88 can both be Switchboards, and that is the point. Soft axes are
excluded from the selection so an axis that could not be measured comparably
never becomes someone's headline, and ties break on `AXES` order so a refresh
never changes the verdict.

Every cell must exist: a gap is not a crash, it is an account that gets no
reading. `palm.selftest.mjs` walks all thirty and asserts the names are distinct.
The names are pure editorial — rename them freely.

### Posting the card — the one rule worth knowing

`palm/share.js` posts the card through the shared OAuth worker, scope
`atproto repo:app.bsky.feed.post blob:image/*` (same as `/coin`, and
`b.mino.mobi` is already allowlisted in `workers/auth/src/index.ts`). It reuses
`coin/compose.js` for `linkFacets` and `textLength` rather than re-deriving byte
offsets — that file is dependency-free, which is what makes the cross-directory
import safe.

**You may only post a card for the account you are signed in as.** `getRepo` is
public, so anyone's palm can be *read* — but publishing a reading about someone
else, under a number that looks like a verdict, is the harassment vector the
page warns about. Reading is open; making a claim is not. That is a DID
comparison in `postCard()`, not a line of copy, and the button reflects the
state instead of failing after the click.

The auth library is imported **lazily**, on the first share attempt only, so a
visit that just reads a palm never loads it (lathe's rule for read-only toys).
It is staged into the assets dir at deploy time and gitignored under `b/`, so
that import cannot resolve in the sandbox — the failure path is a message, not a
broken page.

Two sizing facts, both measured rather than assumed:

- The card at its native 1080px is **1258 KB against a 950 KB blob ceiling** —
  the radial background is a gradient and gradients are what PNG compresses
  worst. `SIZES` therefore starts at 800 (~740 KB), so no share pays for a
  doomed render first. JPEG would fit easily and was rejected: it mushes exactly
  the thin bright strokes the numbers are made of.
- The post text is assembled longest-first against a 300-**grapheme** budget,
  and the link back and the "not an AI detector" clause are the last things
  dropped. A silently truncated disclaimer is the failure that would matter.

### Quality-of-life

- **Typeahead** — `/lib/handle-typeahead.js` as a classic `<script>` plus
  `data-bsky-typeahead` on the input; the shared component, not a fourth copy.
- **`store.js`** caches reduced posts per DID in IndexedDB, 6h TTL, same as
  lathe's archive cache. This is what makes the OAuth redirect survivable: sign-in
  navigates away and back, and without it you would re-download 90 MB to post a
  card you had already generated. Verified in-browser: round trip is exact and
  the score is identical from cache.
- **Share intent** survives that redirect in `sessionStorage`, but it is a *flag,
  not an instruction* — on return the reading re-runs from cache and the button
  is left armed. Posting to someone's account without a second click would be
  wrong however clearly they asked a redirect ago.
- Stop button (`AbortController`) for a long download, last handle remembered,
  copy-to-clipboard, and a "fetch it again" link when a reading came from cache.

Selftest: `palm/palm.selftest.mjs` (the like trap, chunk-boundary equivalence,
MST prefix compression, known answers for all six readings, the percentile, and
the card's grapheme budget and link-facet byte offsets).

## orbit — the ring, the game, and the expensive half

`/orbit` asks one question twice. The cheap version is a game: here are the
twelve accounts you reached for most this month, here is a post, **who wrote
it**. The expensive version is a matrix: across the *whole history* of everyone
in that ring, who replied to whom first and how much have they interacted since.

Five files, and the split between them is the point — everything decidable is
pure and gated, and `app.js` is wiring that decides nothing:

| file | what it is |
|---|---|
| `orbit/api.js` | the worker half: `/api/orbit/{circle,deck,av}` |
| `orbit/game.js` | dealing, scoring, grading, ring geometry — pure |
| `orbit/matrix.js` | matrix assembly and the permalink codec — pure |
| `orbit/repo-scan.js` | one CAR in, one matrix row out |
| `orbit/card.js` | the canvas share card |

`orbit.selftest.mjs` gates the first four. **Run it before touching any of
them.**

### The ranking left `/squares`

Who a handle is closest to — the three repo scans, the weights, the sort — is in
[`lib/closeness.js`](lib/closeness.js) now, not in `squares/circle.js`. Two
tools drawing the same circle from two copies of the same scan is how the two
circles quietly stop agreeing. `squares/circle.js` is what is actually about
squares: the best picture each of them posted.

The ranking reads the seed's **own** repository — their likes, their reposts,
their replies, their quotes — never engagement received. That is the whole claim
of the word "closest": it measures who *they* reach for. Weights (`WEIGHTS`) are
editorial and say so: a reply costs you a sentence, a like costs you a thumb.

### Three things the ring does that are not obvious

- **Mutuals fill it first, and a non-mutual seat says so.** A hard
  mutuals-only filter routinely hands back a four-seat ring, because a month of
  replies to people who never followed back is a normal month. `pickCircle` is
  pure precisely so the selftest can pin the fallback instead of hoping for it,
  and a topped-up seat carries `mutual: false` and a `△` in the legend.
- **An account the AppView will not hydrate is dropped.** Deactivated,
  suspended, deleted or blocking us: it cannot supply a card, cannot be guessed,
  and seating it prints a raw DID on the ring — a key, not a name. Measured on
  `minormobius`: one of the twelve. The next candidate takes the seat.
- **The scan budget is lower than squares'** (`RING_BUDGET`: 14/6/10 pages
  against 20/8/12). This is a *foreground* wait — a blank arena until it returns
  — where squares is already painting tiles. On a heavy account the full budget
  takes 20 s and this one about 13, and **the top twelve came out identical**: a
  twelfth seat is decided by dozens of interactions, not by the last four
  hundred likes of the month. It does bias toward the recent end of a window
  somebody out-likes, which is the honest cost and is stated on the page.

### The hand is dealt round-robin, and that is a fairness rule

Sampling one big pile looks right and is not. One member of a twelve-seat ring
who posts forty times a day would supply a third of the cards, and the player
would learn to guess *them* rather than learn the circle. `dealHand` deals one
card per author per round, and the weighting — wordier posts first, saturating
at 60 words so a single wall of text cannot eat the deck — happens strictly
*inside* one author's own stack. The selftest plants exactly that prolific
account and asserts the spread never exceeds one card.

A seat with nothing long enough to deal is returned in `absent` and greyed out
in the ring. **A seat that can never be the answer has to look different from
one that can**, or the game is asking an impossible question with a straight
face. Under `MIN_WORDS` (5) a post is "lol" or "same" and the answer is a coin
toss dressed up as a question.

The whole deck arrives in one request and every later hand is dealt from memory,
which is what makes "deal 20 more" instant. Re-querying twelve feeds to hand out
twenty more cards would be a second wait for a button that should feel free.

### The grade reads lift, not percent

Difficulty is set by the size of the ring: **50% against four seats is bad and
50% against twenty is remarkable.** `scoreHand` reports `lift` — the share of
the distance from blind guessing to perfect that the player actually covered —
and the seven bands read that. The raw percentage and the chance line are both
printed anyway, so the number can be argued with.

### The card, and the CORS fact behind it

`card.js` draws 1080² off the same `ringLayout()` the arena uses, so the picture
people post is the picture they played. It follows palm's rule: **the headline
goes under the plot.** A score disc in the middle of this ring would sit exactly
where the seed's own avatar belongs and occlude the lines that carry the
meaning.

**`cdn.bsky.app` sends no `access-control-allow-origin` header at all.** Not a
restrictive one — none. So `crossOrigin="anonymous"` on an avatar does not
merely taint the canvas, it fails the load outright, and without it `toBlob`
throws `SecurityError` and the copy button dies. `/api/orbit/av` is one
same-origin hop that fixes both, locked to that host so it is not an open proxy
and cached hard because an avatar at a given CID is immutable. Verify it before
assuming it is unnecessary:

```bash
curl -s -D - -o /dev/null -H 'Origin: https://b.mino.mobi' '<an avatar url>' | grep -i access-control
```

The `ClipboardItem` is built around the blob **promise**, not an awaited blob:
Safari revokes clipboard permission the moment the stack leaves the user
gesture, so awaiting first is a permission error on exactly the browser most
likely to be used to post the picture.

### repo-scan.js is a fourth *filter*, not a fourth CAR reader

There are already three CAR paths here (`coin/lexicon.js`, lathe's `archive`,
`palm/car-stream.js`). This is not a fourth. It **imports** `uvarint`,
`cidLength`, `hex` and `decode` from `palm/car-stream.js` and writes only the
block loop, because what it keeps is different: palm drops everything that is
not a post, and three of the five interaction kinds here are likes and reposts.
Fix a decoding bug there and it is fixed here.

Two things carried over from palm because they are load-bearing:

- **No MST walk.** Prefix compression is node-local, so blocks decode in any
  order: collect key→CID from whatever nodes stream past, collect CID→record
  from record blocks, join at the end.
- **Anchored sniffing.** A post type is found by the DAG-CBOR length byte
  `0x72` that can only precede an 18-character string — a like's `subject.uri`
  contains `app.bsky.feed.post` behind a `/`, never behind `0x72`. `sniff`
  extends that to `0x72`+`app.bsky.feed.like` and `0x74`+`app.bsky.feed.repost`,
  and the decoded record's own `$type` is what actually decides. Get the anchor
  wrong and the matrix fills with replies nobody wrote, from a scan that looks
  healthy. The selftest plants three of those likes.

What is stored is bounded by the **ring**, not by the repo: counts only for the
dozen DIDs asked about, and one candidate first-contact each. Measured on
`minormobius.bsky.social` — **88 MB, 304k blocks, 237k records in 8.4 s at
178 MB RSS**, yielding 50,824 posts' worth of tallies and five verified first
replies. The CAR is never buffered and never kept.

**First contact is the earliest reply; a quote is the fallback and is flagged as
one.** A reply outranks a quote whatever the dates say — the question is when
you first spoke *to* someone, and a quote is speaking *about* them. Keyed by
target rather than by post, because one post can reply to one person and quote
another, and keying by post silently dropped the second of those. `createdAt` is
self-reported and occasionally a lie (see `/groom`), so "first" is a claim about
the record and not about wall-clock truth.

### The matrix, and why a half-finished one is still honest

Cell (i, j) is what person *i* did **to** person *j*. Directed on purpose:
"who spoke first" has no meaning symmetrised, and the asymmetries — one person
always replying, the other never answering — are what a heat map can show.

`state.rows` records which repositories were **actually read**, so a blank cell
in an unread row renders hatched rather than empty. Otherwise a stopped scan
reads as "these people have never spoken", which is the failure that would
flatter everyone. `pairs()` only reports a pair when both its rows are in.

### The permalink is the point

Filling the matrix costs thirteen full repository downloads. An object that
expensive should survive being closed, so the whole state deflates into a URL
fragment — no server, nothing stored, nothing uploaded. A full 13-seat matrix
(156 directed cells) packs to **1.9 KB of base64** — a 1,971-character URL, and the selftest fails
if that ever passes 6 KB.

**Post text is deliberately left out** and re-fetched from the AppView on open:
169 posts of text would be 50 KB of fragment where 169 rkeys are under three —
and a post deleted since then comes back as *deleted* rather than as a
quotation from a ghost. Handles are re-resolved from the DIDs for the same
reason; the handles baked into the link are only a fallback for when the network
is gone.

### Quality-of-life

- **Typeahead** — `/lib/handle-typeahead.js` as a classic `<script>` plus
  `data-bsky-typeahead`. The shared component, not a sixth copy.
- **Drag is pointer events, not HTML5 drag-and-drop**, which does not exist on
  touch and this is mostly played on a phone. One code path for mouse and
  finger; tapping a face answers too, and `1234567890qwertyui` maps to the
  seats in order.
- A face arms only when the card is genuinely over it — too generous a
  threshold and a small nudge answers the question for you.
- The last handle is remembered, `?seed=<handle>` opens straight into a ring,
  and `#m=<payload>` opens straight into a shared matrix with the game hidden.

## mood — a jev mood ring, and the primitive that makes it honest

`/mood` reads the tone of an account's last ten posts and replies and draws
one band of colour per post around their avatar. The reading comes from
[**jev**](https://typesafe.ai/blog/introducing-system-one-models-and-jev),
TypeSafe's System One model, which generates no text at all: you post a state
and typed questions, and it returns typed answers. It lives at
[`mega.mino.mobi/jev/`](https://mega.mino.mobi/jev/) — read `mega/jev/CLAUDE.md`
before changing anything here that touches the model.

| file | what it is |
|---|---|
| `mood/mood.js` | the questions, the plane, the colour — pure, and imported by BOTH the page and the worker |
| `lib/jev.js` | `/api/mood`: handle → ten posts → one model call |
| `mood/app.js` | the SVG ring, the list, and the link between them |
| `mood/mood.selftest.mjs` | **run it before touching any of the above** |

`mood.js` is imported by the browser *and* by `lib/jev.js` inside the worker.
That is deliberate: the question shapes are the contract with TypeSafe, and a
contract written in two places is a contract that drifts.

### The primitive comes from the shape of the variable

This is jev's own colour-axis finding, and a mood ring is the purest case of
it. A `score` returns the expectation over an **ordered** set of rungs, so:

> averaging over an ordering that does not exist would put "red or violet" at
> green.

The obvious build is one `score` from *angry* to *happy*. **It is wrong.** A
post that is half fury and half delight comes back at the midpoint and renders
as **calm** — the model's uncertainty laundered into a confident reading of
serenity, with nothing on the page looking broken. So mood is asked as the two
things that genuinely are ordered plus one thing that genuinely is not:

| variable | shape | primitive |
|---|---|---|
| valence — bleak → delighted | ordered | `score` |
| energy — becalmed → frantic | ordered | `score` |
| flavour — wry, tender, angry… | **unordered** | `choice` |

Valence and energy are the circumplex: two axes whose **plane** carries the
mood where neither alone does. Colour is derived from where a post lands on
that plane and never asked for directly, because hue has no order either.

**The same trap waits a second time**, when ten readings become one stone.
Averaging the *hues* of someone half furious (magenta) and half serene (green)
gives indigo — melancholy, a mood neither post had, stated confidently.
Averaging valence and energy instead puts them at dead centre with intensity
~0, which renders grey and reads as "no coherent mood", which is the truth.
`mood.selftest.mjs` asserts the naive hue mean really does land on indigo and
that `aggregate()` does not, so the reasoning is pinned and not just described.

A consequence worth keeping: a torn ring and ten flat posts share a stone. Only
`spread()` tells them apart, which is why the number is on the page.

### Two things the colour carries

- **Saturation is intensity, floored.** A genuinely flat post reads as muted,
  never as a hole in the ring.
- **Alpha is confidence, and it has to be visible.** Measured: a three-word
  reply ("The simp ratio") comes back at 0.32 where a full sentence sits near
  0.9. A ring that drew both at full strength would be claiming to read a tone
  off three words. The selftest fails if the haze gap shrinks below 0.3.

`hueFor` is `(100 − angle) mod 360`, and the coefficient is **1 because the map
has to close** — any other slope walks the hue somewhere else after a full turn,
so the same mood would get two colours depending on the route taken to it.

**The legend wheel is drawn at `−angle`.** SVG's +y points *down* and every
circumplex ever published puts arousal *up*; the wheel samples the same
`moodColour()` the ring uses, so it cannot drift from the thing it is a key to,
but it is drawn mirrored so it reads the way a reader expects.

### `/api/mood` is not a proxy, and that is the security design

jev's own proxy takes `{state, questions}` and forwards them, which is right
for a surface whose point is watching arbitrary questions get answered. Its
comments are blunt about the cost — *"an open pass-through to a metered API is
somebody else's free API key"* — and it spends a whitelist rebuild, two size
caps and a throttle defending that.

**This endpoint takes a handle and nothing else.** The state and the questions
are built in the worker from `mood.js`; there is no request shape that makes it
ask jev something of the caller's devising. That is a narrower contract than a
whitelist and it costs nothing. What it still keeps, because the key is
metered: a per-IP throttle (CORS binds browsers, curl ignores it), retries on
only the two statuses the docs name, and **a five-minute per-handle cache** —
the main thing standing between a public toy and a bill.

### The second copy of the key

jev's `CLAUDE.md` says the key "lives in the worker, and only in the worker",
and this is a *second* worker. That was a decision, not an oversight:

- Calling mega's proxy server-side would have put **every visitor to this
  surface into one 30-a-minute bucket**, since they would all arrive from b's
  egress — one surface quietly spending another's budget.
- The browser cannot call it directly: mega's proxy emits **no CORS headers at
  all**, by design. Verified:
  `curl -sD - -o /dev/null -X POST -H 'Origin: https://b.mino.mobi' https://mega.mino.mobi/jev/api/ask` → no `access-control-allow-origin`.

So `deploy-b.yml` writes the **same** repo secret mega uses (`jev_key`) onto
the `b` worker as `TYPESAFE_API_KEY`. One credential, two installs — not two
credentials. It is still never in an asset, never in the browser, and never in
a response; the worker selftest equivalent here is that `/api/mood` returns the
raw jev request and response *without* the auth header it rode in on.

**If the key is unset the page says so** rather than pretending:
`/api/mood/health` reports `configured: false` and `/api/mood` returns a 503
with a sentence.

### Measured

| | |
|---|---|
| one ring | 10 posts → **30 questions in ONE call** (jev evaluates each in isolation against the same state) |
| cost | ~4,600 input tokens, ~1,200 output |
| latency | 300–750 ms model, ~1.7 s including the two Bluesky reads |
| discrimination | per-post hues span **28–313** on a varied account; stones range from `weary` indigo (`pfrazee.com`, angry×3) to `at ease` green (`jay.bsky.team`, tender×4) |
| the torn ring | `dril.bsky.social` spans the whole wheel and lands on `even` — correct, and exactly what `spread()` exists to report |

**Replies are in, reposts are out.** The ask was "posts/replies", and a reply is
where tone actually lives — a timeline of standalone posts is somebody's
broadcast voice. A repost's text belongs to someone else, and reading one as
the reposter's mood would attribute a stranger's feelings to them.

**A post the model would not read is drawn as a dashed ghost**, not as calm,
and is left out of the stone entirely. One unreadable post must not cost the
other nine their ring.

## groom — reading the follow graph so it can be pruned

`/groom` answers two questions about a handle's follows — *who has gone quiet*
and *who never followed back* — and, for your own account, deletes the follow
records you pick. Three decisions carry it, and each one is a trap avoided.

**It reads the repo, not `getFollows`.** The obvious call is
`app.bsky.graph.getFollows`, and it is wrong here twice over. Its profile views
carry a `viewer.following` URI only for a request authenticated as the viewer,
so a list built from it has nothing an unfollow can act on — and an unfollow is
a **record deletion**, which needs the rkey. And it silently omits follows whose
target has been deleted, deactivated or suspended, which are precisely what a
grooming pass is hunting. `com.atproto.repo.listRecords` over
`app.bsky.graph.follow` is public, needs no auth for anyone's repo, and carries
the rkey, the subject DID and the date you followed them. On a 684-follow test
account it surfaced **27 accounts the Bluesky app does not show in the
following list at all**. Profiles are then hydrated separately with
`getProfiles` — and a DID that comes back with no profile is the signal for
`gone`, so a failed batch must never be allowed to fill those in with
placeholders. It retries one-at-a-time for exactly that reason.

**Three ways a feed lies about whether someone is alive** — all three
documented and asserted in `groom.js` / `groom.selftest.mjs`, because each one
turns a live account into a deletion candidate or hides a dead one:

- *Reposts are in the feed*, carrying the ORIGINAL author's timestamp. Read the
  top item naively and everyone who reposts looks active. Items with a `reason`
  are dropped; an account that only boosts is reported as `reposts only` rather
  than as a corpse, so a live lurker is not deleted by mistake.
- *`createdAt` is client-supplied* and can sit in the future. `effectiveTime`
  takes the earlier of `createdAt` and the appview's `indexedAt`, which reads a
  future-dated post at its real index time and still reads a genuinely
  backfilled old post at its real authored date.
- *The answer can be below page one.* `needsAnotherPage` stops the moment the
  answer is knowable — something they wrote was found, or the page ran past the
  cutoff so nothing inside the window can be hiding below. Hit the page cap
  without an answer and the verdict is `unknown`, **never** dormant: proposing a
  deletion on a partial read is the one failure this tool must not have.

**Mutuals come from `getRelationships`, not `getFollowers`.** 30 accounts per
call, both directions, and its cost does not scale with how many followers the
account has — paging `getFollowers` for a popular account is unbounded work for
the same answer.

The scan runs **in the browser, on the reader's own IP**, unlike `/squares` and
`/unique` next door. A thousand follows is roughly a thousand feed reads, and
the appview rate-limits per IP: done in the worker, every scan on the site would
share one Cloudflare egress IP and the second visitor would be throttled by the
first. It also means the handle being groomed never reaches a server of ours.

### The unfollow, and the scope it needs

The only authenticated call is `deleteRecord` on `app.bsky.graph.follow`,
through the shared auth worker. **Unfollow controls render only when the
signed-in DID equals the scanned DID** — there is no unfollowing on someone
else's behalf — and `unfollowOne` re-checks that at click time, because a
session can change between render and click.

`app.bsky.graph.follow` is in `workers/auth`'s `WRITE_COLLECTIONS` on this
branch, but **`workers/auth` is owned by `claude/browser-cad-ideation-ollmd3`** (since 2026-09-11; that branch carries `main`'s list, so its first auth deploy shipped this token)
— so the collection only enters the live ceiling in `client-metadata.json` on a
deploy this surface does not control. Asking for a scope the ceiling does not
declare fails the whole sign-in at PAR with `invalid_scope`. So
`pickUnfollowScope` **reads the live ceiling** and asks narrowly for
`repo:app.bsky.graph.follow` when it is there, falling back to
`transition:generic` when it is not. The site works today and tightens itself
to the one-line consent screen the moment the auth worker redeploys, with no
change here. If you are wondering whether that has happened yet:

```bash
curl -s https://auth.mino.mobi/client-metadata.json | grep -o 'repo:app.bsky.graph.follow'
```
## feedgen — and the half of it that is not here

`/feedgen` builds a feed as a block definition, writes it to your PDS as a
`com.minomobi.feedgen.def` record, and publishes an `app.bsky.feed.generator`
pointing at a service that will read it back. `b/worker.js` is one such service
(`did:web:b.mino.mobi`), stateless: it fetches the def, runs the evaluator, and
serves the skeleton.

**There is one shape of feed it cannot serve, and that is why `workers/hose/`
exists.** A feed defined by *subtraction* — not politics, not porn, not video,
not a reply, not in this bot list — has no query to ask the AppView. There is no
search term for "everything else". You have to see every post and subtract,
which needs an ingester holding the firehose open, which is state this surface
does not have.

So the builder now publishes to **two** services and picks by input type:

| the def's inputs | published against | served by |
|---|---|---|
| search / list / author | `did:web:b.mino.mobi` | this worker, statelessly |
| contains a `firehose` input | `did:web:hose.mino.mobi` | `workers/hose/`, off Jetstream |

`serviceDid()` in `feedgen.js` is the whole of that decision. A firehose feed
still *previews* here, but only against a broad search sample — the preview says
`sampled` rather than pretending, because judging a subtraction feed by a sample
would tell you nothing about how full it will be.

### The filters are not in this directory any more

They were, in `feedgen/pipeline.js`. They now live in
[`packages/feedgen/match.js`](../packages/feedgen/match.js), shared with
`workers/hose/`, because the same definition has to be filtered over two shapes
with nothing in common: hydrated `postView`s here, raw Jetstream commit records
there (where a post is one second old and has no engagement counts at all).

Two copies of that predicate is exactly how a feed's preview quietly stops
describing the feed people read. `packages/feedgen/feedgen.selftest.mjs` walks a
filter chain one filter at a time against both shapes and asserts they agree —
**run it before touching `pipeline.js`.** `pipeline.js` is now only inputs,
paging, dedupe and sort.

It is imported as `../../packages/feedgen/match.js` and bundled into the worker
by wrangler — nothing staged, unlike `packages/oauth-client`, because only the
worker reads it and never the browser. If browser code ever needs it, stage it
in `deploy-b.yml` the way the OAuth client is staged; do not vendor a second copy.

### Importing a SkyFeed feed

The import box calls `hose.mino.mobi/api/import`, which reads a feed's record
off its owner's PDS and converts a SkyFeed-era `skyfeedBuilder` into a
definition this editor can open. It publishes nothing — conversion is lossy in
a loud way (`warnings`), and you should see what it dropped first.

After an import the editor **offers** a "no video" filter rather than adding
one. Its absence is why most people are porting — SkyFeed never shipped one —
but it changes what the feed does, so it stays the owner's choice.

## Deploying

Pushes to `claude/mutual-closeness-game-earzue` that touch this surface's paths trigger [`.github/workflows/deploy-b.yml`](../.github/workflows/deploy-b.yml).
The sandbox cannot reach Cloudflare — **push to a trigger branch, don't `wrangler deploy` locally**.
Read [`docs/DEPLOYS.md`](../docs/DEPLOYS.md) first, especially the golden rule:
the `wrangler.jsonc` `name` must be the worker that owns the live custom domain,
or the deploy goes green while the site never changes.

⚠️ **`main` does NOT deploy this surface.** The workflow lists exactly one
branch and main is not it. This line used to claim otherwise.

**It changed hands again on 2026-09-19**, from
`claude/bsky-follow-grooming-gjkops` to `claude/mutual-closeness-game-earzue`,
which brought `/orbit`. The manifest check was run first — it is the only check
that matters for a handover here, because Workers Static Assets **replaces** the
whole manifest rather than merging it:

```bash
git fetch origin claude/bsky-follow-grooming-gjkops
comm -23 <(git ls-tree -r --name-only FETCH_HEAD b/ | sort) \
         <(git ls-tree -r --name-only HEAD b/ | sort)     # must be EMPTY
```

It was empty: the `b/` file list is identical between the two branches, so
nothing can be dropped by republishing from here. Where the *contents* differ,
this branch is the newer one — it is cut from `main`, and the old owner predates
main's feedgen/hose split, so its `b/feedgen/pipeline.js` still carries the
filters that now live in `packages/feedgen/match.js`. Deploying from the old
owner would have been the regression, not this.

⚠️ **The old owner still carries a `deploy-b.yml` that names itself**, for the
same reason the 2026-08-21 handover did: Actions reads the workflow from the ref
being pushed. Until that branch takes this commit, a push there touching `b/**`
would deploy b from a branch that no longer owns it. If you are about to change
`b/` over there — don't; change it here.

**The surface changed hands on 2026-08-01**, from
`claude/bsky-unique-bigrams-trigrams-ve0fvz`. That branch was **fully merged
into `main`** — zero commits of its own left — while `main` had moved 5,581
lines ahead of it under `b/`, including all of `/meme`, `/lathe`'s `toy.html`
and `lib/handle-typeahead.js`. Workers Static Assets replaces the whole manifest
rather than merging it, so pushing that stale branch would have **republished b
with those files gone, from a green run** — the failure the root `CLAUDE.md`
describes for `lab/www`. Nothing was orphaned by the handover, and the surface
became deployable again by it.

**And again on 2026-08-21**, from `claude/ai-detection-browser-aw7kq5` to
`claude/bsky-follow-grooming-gjkops`, which brought `/groom`. The handover check
below was run and is clean for a different reason than last time: this branch
was cut from the previous owner's tree, so `b/` here is that tree **plus**
`groom/` — every file the last deploy published is still present, and nothing
can be dropped from the manifest by republishing from here. The stale
`claude/image-manipulation-platform-g5puxy` tree is still the dangerous one and
must never deploy this surface.

**It changed hands again on 2026-08-05**, from
`claude/image-manipulation-platform-g5puxy` to `claude/ai-detection-browser-aw7kq5`,
when `/palm` arrived. The same check was run first and is the only one that
matters for a handover here: **`b/` was byte-identical between the two branches**
— same file list, empty content diff — so republishing from the new owner
produces exactly what was already live. Do not move this surface without
re-running that diff; a branch that merely *looks* current is how the manifest
loses files silently.

`photo` did **not** move and is still owned by
`claude/image-manipulation-platform-g5puxy`. One branch may own several surfaces;
what the registry forbids is one surface having two owners.

⚠️ **The old branch still carries a `deploy-b.yml` that names itself**, because
Actions reads the workflow from the ref being pushed and that ref predates this
change. So until it takes this commit, a push there touching `b/**` would deploy
b from a branch that no longer owns it. Nothing routine does that — `photo` work
does not touch `b/**` — but if you are about to change `b/` on that branch,
don't: change it here.

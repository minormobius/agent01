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
| Owning branch | `claude/ai-detection-browser-aw7kq5` |
| Deploy | `.github/workflows/deploy-b.yml` |
| Uses | — |
| Provides | — |

Machine-readable entry: [`deploy-registry.json`](../deploy-registry.json) → `surfaces[]` where `surface == "b"`.

## How it works

The Bluesky corner of mino.mobi at b.mino.mobi (worker `b`, b=Bluesky, companion to g=graphics). Hosts the disk Poincare interaction map at /disk, the feedgen feed builder at /feedgen, spark at /spark (the followed account's posts a follower had liked before they followed), dyad at /dyad (the full dyadic timeline of every recorded interaction between two accounts — likes, reposts, replies, quotes, mentions, follows, blocks, list-adds, both directions), squares at /squares (closest-circle picture toy — a seed handle's most-interacted-with accounts over the last week, ringed around their avatar in those accounts' most-liked image of the week; click a tile to recenter on it), the quarter at /map (walkable pixel-glyph catalogue of EVERY social/ATProto tool across mino.mobi — districts by function, the road east climbs complexity tiers I–IV, per-tool stack + live-health cards; data in b/map/tools.js, companion audit in docs/SOCIAL-STACK-AUDIT.md), thread tetris at /tetr (real threads quantized into hex polyominoes), unique at /unique (the "hapax" finder — harvests every bigram/trigram from a handle's posts, keeps only the ones they used exactly once as a free pre-filter, then verifies each survivor against platform-wide search to surface the two/three-word phrases used exactly once on all of Bluesky; worker endpoints /api/unique/{scan,search}, the search fan-out streamed as NDJSON and carrying the authed service token; a boundaries toggle (default on, param crossPunct=false) forms n-grams only within contiguous runs — never across a sentence end, comma, quote, bracket or newline), coin at /coin (the posting box that only unlocks when your draft carries a phrase nobody on Bluesky has ever posted — /api/unique/novelty checks each contiguous bigram/trigram for zero existing hits; sending writes a normal app.bsky.feed.post via the shared auth worker with a narrow atproto+repo:app.bsky.feed.post OAuth scope, so the consent screen is post-only; imports /packages/oauth-client/auth.js staged into the assets dir at deploy time; THREAD COMPOSER: n segments, each gated separately (every post in a thread must carry a novel phrase, or you could pad something new with nine things that are not), posted as a real reply chain with root+parent wiring by b/coin/compose.js. MEDIA: paste, drag-drop or the file picker (accept=image/* with no capture attr, which is what makes a phone offer both photo library and camera); images are downscaled in-browser to fit the ~1MB PDS blob ceiling and uploaded only on send; per-image alt text. Scope widens to 'atproto repo:app.bsky.feed.post blob:image/*' — requested at sign-in rather than escalated on first attach, since an escalation redirect would drop pasted images. KEYBOARD-FIRST: mod+Enter sends, mod+Shift+Enter adds the next post and focuses it, mod+U attaches, mod+Backspace deletes an empty segment, mod+Arrow moves between posts; only modifier combos are intercepted so a bare Enter is always a newline, and after a send the composer resets AND refocuses so you can fire ten in a row without touching the mouse. b/coin/compose.selftest.mjs gates facet byte-offsets, grapheme counting and the reply chain. THE CONSTRAINT ALGEBRA (b/coin/rules.js): the novelty gate is no longer hardcoded but one member of a RULE SET — 16 rules across two axes, scope (post | thread) x kind (pure | corpus | self). SELF rules measure a draft against YOUR OWN history: `virgin` (contains a word you have never posted) downloads your whole repo as a CAR ONCE via b/coin/lexicon.js, reduces it to a Set of every word you have ever used, caches that in IndexedDB (1 week TTL) and then checks by set lookup on every keystroke — costly once, free thereafter; posting folds the new words in immediately so a word stops being new the moment you spend it. The repo is only downloaded when a self rule is actually in the ruleset AND you are signed in. Corpus rules (novel, novelBigram) hit /api/unique/novelty; pure rules (wildcard word-of-the-day, avgWord, lipogram, univocalic, noRepeats, alliterate, monosyllabic, acrostic, question, exact) are computed in-browser for free, and a purely lexical ruleset never touches the network. Thread-scope rules span the chain: haiku (5-7-5 across three posts), chain (each post begins on the previous post's last word), shrinking. Rulesets serialise into ?rules=novel,avgWord:6,wildcard:lantern and ?daily=1 is a date-seeded challenge pairing one GROUNDED rule (corpus or self — checked against the network or your own past) with one FORMAL rule (pure — checked against the text), same for everyone, no server. b/coin/rules.selftest.mjs gates every rule's accept/reject, URL round-trips and daily stability), meme at /meme (the mirror of unique — scan(kind=meme) keeps the bigrams/trigrams a handle REPEATS instead of hapaxes, then /api/unique/meme classifies each against platform search: zero other authors = a personal meme/idiolect fingerprint, a handful of others = the co-memeticists leaderboard aggregated across shared phrases, a saturated window = ordinary language dropped), lathe at /lathe (THE TOY MILL — procedurally generated social toys. The thesis: the ~40 hand-written social tools across mino.mobi are 40 points in one small space, so instead of writing the 41st, write the space. b/lathe/engine.js is a TYPED PIPELINE ALGEBRA — subject (one handle / two handles / a list) -> source (posts, media, likes, reposts, follows, followers, mutuals, list members, blocks) -> 0-2 lenses (ngrams, distinctive, hashtags, domains, clock, weekday, overTime, sentiment, lengths, readability, engagement, pictures, mentions, cooccur, replyTo, reach, overlap, exclusive, handles, bios) -> view (ranked, cloud, dial, bars, scatter, histo, graph, grid, wall) -> optional sink; every node declares in/out PORTS (posts/accounts/terms/edges/series/scalars/images) and toys are built by a TYPED WALK so they are correct by construction, then re-certified by an independent validate() oracle (the fable/forge move). 884 type-correct shapes at vocab v3. Nodes carry since/until so the vocabulary can RETIRE as well as grow (the `handles` lens was pruned at v3 — it measured domain grammar, not people — and stays reachable at v1/v2 so pinned links reproduce). THE HAYSTACK RULE (v3+): a `sparse` lens (ngrams/hashtags/domains/cooccur hunts rare things) sitting on the paged feed is auto-upgraded to the full-repo `archive` source, because a needle hunt needs the stack; parsed archives are cached per DID in IndexedDB (6h TTL) so several toys over one account pay the download once. PROGRESSIVE DRAW: single-binding pure-chain toys (and list toys, member by member) re-run the pipeline and repaint on every page of data, so a big pull fills in live instead of looking saturated. Grid faces carry a recenter control that re-runs the same toy centred on that account (for `two`, the clicked person replaces the second handle — the co-mutual walk), and an /io-style sticky ride-along bar carries prev/random/next. VOCABULARY IS VERSIONED (engine VOCAB const + `since` on each node): adding a node changes what every unpinned seed produces, so /lathe/t/<seed>?v=<n> pins a permalink to the vocabulary it was minted under and reproduces that toy exactly; a bare /t/<seed> means 'this seed in today's space'. Two heavy async lenses take a set of accounts to its internal STRUCTURE — `interlink` (relation space: exact who-follows-whom inside the set via app.bsky.graph.getRelationships, 30 others/call) and `kinship` (posting-material space: Jaccard over each member's recent post vocabulary) — both accounts->edges, both feeding the avatar force graph; b/lib/hovercard.js gives every post link a post preview and every profile link a profile preview (delegated, cached, desktop-only). CAPABILITIES refine the port types: sources declare what they `provide` (engagement counts, thumbnails) and lenses what they `need`, so the walk cannot mint a well-typed but STARVED toy (archive->engagement would draw a field of zeroes) — the oracle rejects those too. The `archive` source downloads a whole repo via com.atproto.sync.getRepo and parses the CAR with the Rust->WASM parser vendored under rite/ (staged into b/lib/atproto at deploy by deploy-b.yml, alongside packages/oauth-client; both are gitignored under b/). runtime.js drives wasm-bindgen's init with BYTES rather than a URL so the archive path is exercisable in node, not browser-only. rollToys(constraints)/feasible() power the mill's constraint picker (pin subject/source/lens/view/sink, roll within that corner; empty corners are reported, never faked) and every toy page exposes its genome as JSON. Deterministic (xmur3+mulberry32) so /lathe/t/<seed> is a permanent address — worker serves toy.html for any seed. THE PROOF: 12 real hand-written toys (unique, meme, rite/web, squares, rite/lexicon, rite/atlas, rite/signal, density, cluster, echo, photo, seek) are encoded as genomes in KNOWN[] and validate under the same algebra — rendered as a live table on the mill page; the generator independently rediscovers squares. PROCEDURALLY SCOPED OAUTH: a genome's sink derives its own scope (share -> 'atproto repo:app.bsky.feed.post'), the oracle rejects a sink whose scope does not authorise its write, and read-only toys never load the auth lib at all. b/lathe/runtime.js holds one real executor per node against public CORS-open endpoints — runtime.selftest.mjs asserts the engine vocabulary and the runtime implementations are THE SAME SET, so a permalink can never fail to run. Two node selftests, no build step, no backend: b/lathe/engine.selftest.mjs + b/lathe/runtime.selftest.mjs — run BOTH before touching the engine), and gc at /gc (block-intelligence tools + API — /gc block matrix: accounts vs posters → who directly blocks whom; /gc/mutuals: mutuals or followers of X who block Y; /gc/blockers: everyone blocking a named user; /gc/api docs the read-only JSON API at /api/gc/{relation,matrix,who-blocks,blockers}). #1/#2 read raw app.bsky.graph.block records (the worker also serves them server-side via b/lib/gc.js); network-wide blocker sets (#3 + the blocker side of #2) come from the clearsky.services index. All read-only public data, no auth, CORS open. Renamed from atmosphere (worker mino-atmosphere -> b; atmosphere.mino.mobi subdomain retired — detach in dashboard + delete the mino-atmosphere worker).

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

## Deploying

Pushes to `claude/ai-detection-browser-aw7kq5` that touch this surface's paths trigger [`.github/workflows/deploy-b.yml`](../.github/workflows/deploy-b.yml).
The sandbox cannot reach Cloudflare — **push to a trigger branch, don't `wrangler deploy` locally**.
Read [`docs/DEPLOYS.md`](../docs/DEPLOYS.md) first, especially the golden rule:
the `wrangler.jsonc` `name` must be the worker that owns the live custom domain,
or the deploy goes green while the site never changes.

⚠️ **`main` does NOT deploy this surface.** The workflow lists exactly one
branch and main is not it. This line used to claim otherwise.

**The surface changed hands on 2026-08-01**, from
`claude/bsky-unique-bigrams-trigrams-ve0fvz`. That branch was **fully merged
into `main`** — zero commits of its own left — while `main` had moved 5,581
lines ahead of it under `b/`, including all of `/meme`, `/lathe`'s `toy.html`
and `lib/handle-typeahead.js`. Workers Static Assets replaces the whole manifest
rather than merging it, so pushing that stale branch would have **republished b
with those files gone, from a green run** — the failure the root `CLAUDE.md`
describes for `lab/www`. Nothing was orphaned by the handover, and the surface
became deployable again by it.

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

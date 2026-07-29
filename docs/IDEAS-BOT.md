# The ideas bot — mining the ivory tower on a schedule

An hourly Bluesky account that posts one toy-website concept, each derived from a
recent paper. It is the outbound half of the lab factory: the factory in
[`workers/bsky-bot/`](../workers/bsky-bot/CLAUDE.md) turns a mention into a built
website, and this turns arXiv into things worth mentioning it about.

Built by hand three times first — [`HARDWARE-TOYS.md`](HARDWARE-TOYS.md),
[`TOY-WEBSITES.md`](TOY-WEBSITES.md), [`ARXIV-TOYS.md`](ARXIV-TOYS.md) — and the
third one worked. This automates that third pass, and the parts of it that did
*not* automate are what this document is mostly about.

## Shape — three schedules, four stages

```
ideas-pull.yml     daily      arXiv           → pool.jsonl        (free, no model)
ideas-review.yml   every 6h   batch → agent → gate → queue.jsonl  (costs money)
ideas-post.yml     hourly     queue           → Bluesky           (public)
```

| Stage | Script | Writes | Judgement? |
|---|---|---|---|
| pull | [`ideas-fetch.mjs`](../scripts/ideas-fetch.mjs) | `pool.jsonl` | none — retrieval only |
| batch | [`ideas-batch.mjs`](../scripts/ideas-batch.mjs) | `batch.json` | none — deterministic selection |
| concepts | an agent, briefed by [`BRIEF.md`](../.github/ideas/BRIEF.md) | `drafts.json` | all of it |
| gate | [`ideas-gate.mjs`](../scripts/ideas-gate.mjs) | `queue.jsonl` | mechanical rejection only |

### Why pull and review are separate jobs

They have different costs, different failure modes and different useful cadences,
and separating them buys three things that a single daily job cannot:

1. **Ideation stops being bound to the calendar.** The pool is a corpus with
   per-paper state, not a day-file. A weekend that announces nothing does not stop
   review, because review works a *backlog*. This is also what makes an hourly
   posting cadence reachable at all: one day of arXiv cannot feed 24 posts, but
   170 unreviewed papers worked four times a day can.
2. **"Fetched" and "reviewed" become different facts.** The first version marked
   all 179 papers considered after a single agent pass, though the agent had
   meaningfully read maybe twenty — permanently burning 160 papers it barely
   looked at. Now only the papers actually shown to an agent are marked, and the
   rest come back in a later batch.
3. **Retrieval can run for free, indefinitely, before anything is spent.** The
   puller needs no model credentials. The pool is worth inspecting on its own, and
   a category that times out simply arrives tomorrow because the pool is additive.

State lives in `.github/ideas/`, following the `.github/lab-requests/` precedent:
bot-written state belongs in git — reviewable, revertable, diffable — and
`.github/` is the one place in this repo not served to the internet by the root
worker.

| File | Holds | Committed |
|---|---|---|
| `pool.jsonl` | the candidate corpus, each paper `reviewed: null` or `{at, produced}` | yes |
| `seen.json` | every id ever fetched. Permanent, never pruned | yes |
| `queue.jsonl` | one concept per line, `posted: null` or the post's URI | yes |
| `categories.json` | the category list — the one real judgement call, as config | yes |
| `BRIEF.md` | the concept-writing prompt — the quality lever, as config | yes |
| `batch.json`, `drafts.json` | working files | no (`.gitignore`) |

**Two ledgers, deliberately.** `seen.json` is the permanent id memory; `pool.jsonl`
is the working corpus and gets pruned 30 days after review. Pruning cannot
resurrect a paper, because `seen.json` still remembers it.

## Batching, and the rule that keeps bio alive

Handing an agent the whole pool has two compounding failure modes: it skims, and
it front-loads whatever is at the top of the file. So a review run takes a bounded
batch — 24 by default, small enough to actually read.

**The batch is balanced by family, and this is the load-bearing detail.** Measured
on 2026-07-29: `math.CO` alone returned 31 papers; the entire q-bio tree returned
12. Newest-first selection would hand the agent a mostly-combinatorics batch every
single day, and the small archives — which is where bio lives — would be starved
by arithmetic rather than by any judgement about them.

So [`ideas-batch.mjs`](../scripts/ideas-batch.mjs) round-robins across families,
newest-first within each, visiting scarce families first. A cross-listed paper is
assigned to the family that needs it most, so a q-bio paper carrying
`cond-mat.stat-mech` counts for bio rather than being absorbed by the bigger pile.
On the real 179-paper pool, a batch of 12 comes out as `science=2 social=2
generative=2 games=2 math=2 oneill=2`. The selftest asserts this against a
lopsided pool **and** includes the control case: that newest-first would have
failed it.

## On bio, since it was the point of the expansion

The first pass sampled two q-bio categories and returned six papers, which is why
no bio concept made [`ARXIV-TOYS.md`](ARXIV-TOYS.md). `categories.json` now carries
the whole q-bio tree plus `physics.bio-ph`. Measured on 2026-07-29 that is
**12 papers, up from 6** — real, and still small.

Not a configuration mistake: q-bio is simply a small archive. Three of those twelve
were immediately good (`morphogen`, `plays-back`, `entrain`, all in the seeded
queue), so the *hit rate* on bio is high — the *volume* is low. Family-balanced
batching means low volume no longer means low attention.

**The volume fix is a second source.** bioRxiv and medRxiv have a public API
(`api.biorxiv.org/details/biorxiv/<date>`) and together publish a few hundred
preprints a day, most of it exactly this kind of modelling work. That is a new
fetcher appending to the same pool; everything downstream is unchanged. Highest-
value follow-up here, and not built.

## The gate is the whole design

The weak point is not retrieval and not posting. It is that a model handed an
abstract will produce *"a website to explore proper hat-guessing on two-spine book
graphs!"* — the title with a verb bolted on — and that passes any check that only
asks whether something was produced. Posting that hourly is how an account becomes
noise.

So [`ideas-gate.mjs`](../scripts/ideas-gate.mjs) encodes what separated the five
accepted concepts from the discarded ones. Eleven named rules, each with a reason,
each covered by [`ideas-gate.selftest.mjs`](../scripts/ideas-gate.selftest.mjs):

| Rule | Rejects |
|---|---|
| `shape`, `slug` | anything the queue or poster cannot read |
| `arxiv-id-real` | **an id not in this run's batch** — including real ids from elsewhere in the pool. A citation nobody handed the agent is the case this is for |
| `title-matches-paper` | a real id paired with a different paper's title |
| `not-already-queued`, `name-free` | repeats, and names colliding with the 248-entry catalogue |
| `length` | over 300 or under 80 rendered graphemes |
| `not-a-restatement` | ≥70% of the title's content words reappearing in the post |
| `operable` | no second-person or operative verb — a topic, not a mechanism |
| `no-hype` | selling language, hashtags, more than one exclamation mark |
| `no-overclaim` | "provably", "we prove" — claims about our own artefact |

The selftest asserts each rule fires **and** that a real accepted concept passes
all eleven. A gate that rejected everything would satisfy any test that only checks
for rejection, and it would stop the bot silently and forever.

Three failures the gate cannot catch, stated in `BRIEF.md` as the agent's job: a
concept that is technically fine and boring, a claim the paper does not make, and
a paper skipped for being unfamiliar — which would undo the batch balancing from
the inside.

## Cadence is a ceiling, not a promise

Even with a backlog, supply is finite and quality is the binding constraint. A
strict gate turns a 24-paper batch into three to six concepts, not twenty-four. So
`ideas-post.mjs` treats an empty queue as a normal outcome and exits 0: **posting
nothing beats posting filler.** The bot self-corrects to whatever rate quality
supports, and the backlog stays visible in the queue rather than hidden.

Levers if the timeline runs thin, in order of preference: add bioRxiv; widen
`categories.json`; raise the review cadence (`0 */3 * * *`) while the pool has
backlog; lower the posting cadence. Turning the bar down is not on the list.

## Interlocks

Both fail closed, matching `bsky-hello.mjs`:

| | |
|---|---|
| `--post` | intent. Supplied only by the workflow |
| `IDEAS_ENABLED` | the operator's switch, checked last. Currently **`'false'`** in `ideas-post.yml` |

Either one missing renders the post into the job summary and exits.
`IDEAS_MAX_PER_DAY` (default 24) is a ceiling under the account's dignity, not a
rate limit. `workflow_dispatch` carries a `dry_run` input that can only ever
*downgrade* to a dry run — a manual run may never upgrade past the switch.

`ideas-review.yml` has its own cheap escape: `dry: true` selects and prints the
batch, then stops, with no model spend.

### Turning it on, in order

1. **Launch the service account first** (`bsky-hello.yml`). Its first-post guard is
   `postsCount === 0`, so an ideas post landing first permanently blocks the hello
   post from ever running.
2. **Dispatch `ideas-review.yml` with `dry: true`** and read the batch. Free.
3. **Dispatch it for real once** and read what the agent actually wrote. This is
   the first genuine test of the concept stage.
4. **Watch a day of `ideas-post.yml` dry runs.** Each prints the exact text it
   would have sent, so a bad concept is visible before it is public.
5. Flip `IDEAS_ENABLED` to `'true'` — one line, one commit, revertable.

## Two things this needs that are not in this branch

- **The cron trampoline.** `schedule:` has never fired on this repo, which is why
  [`workers/cron`](../workers/cron/CLAUDE.md) exists. All three workflows declare a
  schedule so they work if that is ever fixed, but the reliable trigger is the
  trampoline calling `workflow_dispatch`. Adding `ideas-pull` (daily),
  `ideas-review` (6-hourly) and `ideas-post` (hourly) is one edit to a file owned
  by `claude/landing-projects-takeover-pKkmW`, so it belongs on that branch.
  **Until then, all three run on manual dispatch only.**
- **"Reply to build it."** The obvious loop is: bot posts a concept, someone replies
  *"build that"*, the lab factory builds it. That does not work today, and the
  reason is in `workers/bsky-bot/CLAUDE.md`: a reply may only *iterate* an existing
  site, never create one, so a reply to an ideas post is correctly ignored. An
  explicit `@`-mention works and needs no change. Making replies to ideas posts
  buildable is a small router change on the bot's own branch.

## Verified, and not

Run in this sandbox against live arXiv:

- the full pull — 28 categories, 202 papers, 179 unseen, 12 bio, into a pool
- batch selection on the real pool — even 2-per-family spread across all six
  families at size 12
- the batch-scoped citation rule — a draft citing a real paper from *elsewhere in
  the pool* is rejected, which is the tightened version of the anti-hallucination
  rule
- review marking — exactly the batch is marked, 171 papers still awaiting review
- three selftests under `preflight`: gate (36 assertions), batch (16), bsky (15)
- the poster — dry run renders correctly; `--post` with the switch off does not
  post; the switch on with no credentials exits 1; the daily cap holds; the queue
  is unchanged in every case

**Not verified.** The agent stage has never run — it needs model credentials that
are a GitHub secret, so the seeded concepts were written by hand (from
`ARXIV-TOYS.md`, plus three of 2026-07-29's bio papers) rather than by the briefed
agent. Nothing has been posted to Bluesky. No workflow has executed. The trampoline
wiring does not exist.

The queue ships with **8 concepts** and the pool with **171 papers awaiting
review**, so the first hours of posting are known-good content and the format is
proven end to end before the agent is trusted with it.

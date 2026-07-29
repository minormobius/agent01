# The ideas bot — mining the ivory tower on a schedule

An hourly Bluesky account that posts one toy-website concept, each derived from a
paper published that day. It is the outbound half of the lab factory: the factory
in [`workers/bsky-bot/`](../workers/bsky-bot/CLAUDE.md) turns a mention into a
built website, and this turns arXiv into things worth mentioning it about.

Built by hand three times first — [`HARDWARE-TOYS.md`](HARDWARE-TOYS.md),
[`TOY-WEBSITES.md`](TOY-WEBSITES.md), [`ARXIV-TOYS.md`](ARXIV-TOYS.md) — and the
third one worked. This automates that third pass, and the parts of it that did
*not* automate are the parts this document is mostly about.

## Shape

```
ideas-mine.yml   daily   fetch → concepts → gate → append to queue
ideas-post.yml   hourly  pop the oldest pending → post → record it
```

Three stages, each able to fail without lying about it:

| Stage | Script | Writes | Judgement? |
|---|---|---|---|
| fetch | [`ideas-fetch.mjs`](../scripts/ideas-fetch.mjs) | `.github/ideas/inbox.json` | none — retrieval only |
| concepts | an agent, briefed by [`BRIEF.md`](../.github/ideas/BRIEF.md) | `.github/ideas/drafts.json` | all of it |
| gate | [`ideas-gate.mjs`](../scripts/ideas-gate.mjs) | `.github/ideas/queue.jsonl` | mechanical rejection only |

State lives in `.github/ideas/`, following the `.github/lab-requests/` precedent:
bot-written state belongs in git — reviewable, revertable, diffable — and
`.github/` is the one place in this repo that is **not** served to the internet
by the root worker.

| File | Holds | Committed |
|---|---|---|
| `queue.jsonl` | one concept per line, with `posted: null` or the post's URI | yes |
| `seen.json` | every arXiv id ever considered | yes |
| `categories.json` | the category list — the one real judgement call, as config | yes |
| `BRIEF.md` | the concept-writing prompt — the quality lever, as config | yes |
| `inbox.json`, `drafts.json` | working files | no (`.gitignore`) |

## The thing to understand before turning it on

**arXiv announces once per weekday. The bot posts hourly. Those do not match, and
no amount of engineering makes them match.**

One day's fetch over 28 categories is ~180 unseen papers (measured, 2026-07-29).
A strict gate and an honest agent turn that into perhaps three to six concepts
worth posting — not twenty-four. So an hourly schedule against that supply drains
the queue, and there are exactly two ways to keep posting on the hour once it is
dry: lower the bar, or repeat yourself. Both are worse than silence.

So **the cadence is a ceiling, not a promise.** Up to one post an hour; nothing
when the queue is empty. `ideas-post.mjs` treats an empty queue as a normal
outcome and exits 0. The effect is that the bot self-corrects to whatever rate
quality actually supports, and the backlog is visible in the queue rather than
hidden behind filler.

If a fuller timeline is wanted, the levers in order of preference:

1. **Add bioRxiv/medRxiv.** See below — it is where the bio volume actually is.
2. **Widen `categories.json`.** Tuned for recall already, but there is room.
3. **Lower the cadence to every three hours** (`cron: '0 */3 * * *'`), which is
   about what one day of arXiv genuinely supports.

Turning the bar down is not on that list.

## On bio, since it was the point of the expansion

The first pass sampled two q-bio categories and returned six papers, which is why
no bio concept made [`ARXIV-TOYS.md`](ARXIV-TOYS.md). `categories.json` now
carries the whole q-bio tree plus `physics.bio-ph`. Measured on 2026-07-29 that
is **12 papers, up from 6** — real, and still small.

That is not a configuration mistake; q-bio is simply a small archive. Three of
those twelve were immediately good (`morphogen`, `plays-back`, `entrain` are all
in the seeded queue), so the *hit rate* on bio is high — the *volume* is low.

**The fix is a second source.** bioRxiv and medRxiv have a public API
(`api.biorxiv.org/details/biorxiv/<date>`) and together publish a few hundred
preprints a day, most of it exactly the modelling work being asked for. That is a
new fetcher writing the same inbox shape, and everything downstream is unchanged.
It is the highest-value follow-up here and it is not built.

## The gate is the whole design

The weak point of this pipeline is not retrieval and not posting. It is that a
model handed an abstract will produce *"a website to explore proper hat-guessing
on two-spine book graphs!"* — the title with a verb bolted on — and that output
passes any check that only asks whether something was produced. Posting that
hourly is precisely how an account becomes noise.

So [`ideas-gate.mjs`](../scripts/ideas-gate.mjs) encodes what separated the five
accepted concepts from the discarded ones. Eleven named rules, each with a reason
and each covered by [`ideas-gate.selftest.mjs`](../scripts/ideas-gate.selftest.mjs):

| Rule | Rejects |
|---|---|
| `shape`, `slug` | anything the queue or poster cannot read |
| `arxiv-id-real` | **an id that was not in today's fetch** — a hallucinated citation is a dead link under the operator's name |
| `title-matches-paper` | a real id paired with a different paper's title |
| `not-already-queued`, `name-free` | repeats, and names colliding with the 248-entry catalogue |
| `length` | over 300 or under 80 rendered graphemes |
| `not-a-restatement` | ≥70% of the title's content words reappearing in the post |
| `operable` | no second-person or operative verb — a topic, not a mechanism |
| `no-hype` | selling language, hashtags, more than one exclamation mark |
| `no-overclaim` | "provably", "we prove" — claims about our own artefact |

The selftest asserts each rule fires **and** that a real accepted concept passes
all eleven. A gate that rejects everything would satisfy any test that only
checks for rejection, and it would stop the bot silently and forever.

Two failures the gate cannot catch, stated in `BRIEF.md` as the agent's job: a
concept that is technically fine and boring, and a claim the paper does not make.

## Interlocks

Both fail closed, matching `bsky-hello.mjs`:

| | |
|---|---|
| `--post` | intent. Supplied only by the workflow |
| `IDEAS_ENABLED` | the operator's switch, checked last. Currently **`'false'`** in `ideas-post.yml` |

Either one missing renders the post into the job summary and exits. `IDEAS_MAX_PER_DAY`
(default 24) is a ceiling under the account's dignity, not a rate limit.

`workflow_dispatch` carries a `dry_run` input that can only ever *downgrade* to a
dry run — a manual run may never upgrade past the switch.

### Turning it on, in order

1. **Launch the service account first** (`bsky-hello.yml`). Its first-post guard
   is `postsCount === 0`, so an ideas post landing first permanently blocks the
   hello post from ever running.
2. **Watch a day of dry runs.** Each prints the exact text it would have sent, so
   a bad concept is visible before it is public rather than after.
3. Flip `IDEAS_ENABLED` to `'true'` — one line, one commit, revertable.

## Two things this needs that are not in this branch

- **The cron trampoline.** `schedule:` has never fired on this repo, which is why
  [`workers/cron`](../workers/cron/CLAUDE.md) exists. Both workflows declare a
  schedule so they work if that is ever fixed, but the reliable trigger is the
  trampoline calling `workflow_dispatch`. Adding `ideas-mine` (daily) and
  `ideas-post` (hourly) to it is one edit to a file owned by
  `claude/landing-projects-takeover-pKkmW`, so it belongs on that branch, not
  this one. **Until then, both workflows only run on manual dispatch.**
- **"Reply to build it."** The obvious loop is: bot posts a concept, someone
  replies *"build that"*, the lab factory builds it. That does not work today, and
  the reason is in `workers/bsky-bot/CLAUDE.md`: a reply may only *iterate* an
  existing site, never create one, so a reply to an ideas post is correctly
  ignored. An explicit `@`-mention does work and needs no change. Making replies
  to ideas posts buildable is a small router change on the bot's own branch.

## Verified, and not

Run in this sandbox, against live arXiv:

- the full fetch — 28 categories, 202 papers, 179 unseen, 12 bio
- the gate — 8 seeded concepts accepted, 0 rejected; `ideas-gate.selftest.mjs`
  (37 assertions) and `bsky.selftest.mjs` (17) both pass under `preflight`
- the poster — dry run renders correctly; `--post` with the switch off does not
  post; the switch on with no credentials exits 1 without posting; the daily cap
  holds; the queue is unchanged in every case

**Not verified.** The agent stage never ran — it needs model credentials that are
a GitHub secret, so `drafts.json` in the seeded queue was written by hand (from
`ARXIV-TOYS.md`, plus three of today's bio papers) rather than by the briefed
agent. Nothing has been posted to Bluesky. Neither workflow has executed. The
trampoline wiring does not exist. The first real test of the concept stage is the
first dispatch of `ideas-mine.yml` with `skip_agent` off, and its output should be
read before the switch is flipped.

The queue ships with **8 concepts** — the five from `ARXIV-TOYS.md` and three bio
ones from 2026-07-29 — so the first hours of posting are known-good content and
the format is proven end to end before the agent is trusted with it.

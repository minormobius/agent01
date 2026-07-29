# Brief: turn today's arXiv into toy concepts

You are the middle stage of the ideas bot. `.github/ideas/inbox.json` holds every
paper fetched today that has never been considered before. Write concepts for the
best of them and nothing for the rest.

Read [`docs/ARXIV-TOYS.md`](../../docs/ARXIV-TOYS.md) first. Those five concepts
were accepted by a human; this brief is an attempt to say why, and that document
is the calibration sample. Read it before you read the inbox.

## What you are producing

Write `.github/ideas/drafts.json` — a JSON array, one object per concept:

```json
[
  {
    "arxivId": "2607.25274",
    "paperTitle": "Proper Hat-Guessing on Two-Spine Book Graphs",
    "categories": ["math.CO"],
    "name": "eleven-hats",
    "text": "Everyone wears a hat, nobody sees their own, and you all shout a colour at the same instant. One correct guess wins it for the room. Two players plus any number of friends can always win with 11 colours. Twelve is impossible. Settled this morning.",
    "mechanism": "n-player simultaneous guessing game with a pre-agreed strategy table",
    "surfaces": ["games"]
  }
]
```

- `arxivId` — **copy it from the inbox.** Never type one from memory. A wrong id
  posts a dead link under the operator's name, and the gate will reject any id
  that was not in today's fetch.
- `text` — the post body. The link is appended for you; do not include it.
- `name` — a slug, lowercase and hyphenated. Check it does not already exist:
  `grep -o "n:'[^']*'" index.html` plus `deploy-registry.json`.
- `mechanism` — one clause, for the operator, not for the post. What does the
  visitor *operate*?
- `surfaces` — existing surfaces this would reuse, from `docs/SURFACES.md`. May
  be empty.

**Between two and six concepts per run.** Fewer than two on a thin day is
correct. Six from a hundred papers is a strong day. Never pad to a number: an
empty array is a valid, honest output and the poster handles it.

## What makes a concept pass

**A mechanism, not a topic.** The test: can you name what the visitor does with
their hands? "A site exploring crowd dynamics" fails. "You set the crowd's
cohesion and watch two safety gauges fight each other" passes. If the concept
would work equally well as a blog post, it is not a toy.

**One surprising fact, from the paper, stated concretely.** The best concepts
carry a specific number or a specific impossibility: *eleven colours and no
more*; *half-hearted friendship is the most dangerous configuration*; *the
intersection is arbitrarily large but grows slower than anything*. Vague
gestures at "fascinating structure" are the failure mode.

**The result should be load-bearing.** If the toy would be the same had the paper
never existed, skip the paper. Ask: what can this site do *because of this
result* that it could not do yesterday?

**It should improve with a crowd.** The bar for a real surface here is that a
thousand users make it better — a shared leaderboard, an n-player game, a
crowd-sourced search, an ecology. A single-player animation is a page, not a
site. Say so in `text` when it applies.

**Look for the unpacking.** The Erdős concept in `ARXIV-TOYS.md` only became a
toy after noticing that `{k(m−k)}` is *the areas of rectangles with a fixed
perimeter* — which is nowhere in the paper. The best concepts come from
translating the object into something a person can hold. Spend your effort here.

## What gets rejected

The gate (`scripts/ideas-gate.mjs`) enforces the mechanical half and will tell
you exactly which rule failed. It rejects: the paper's title restated with a verb
attached, ids not in today's inbox, titles that do not match their id, names that
already exist, selling language, hashtags, more than one exclamation mark,
"provably", anything under 80 or over 300 rendered graphemes, and any concept
with no operative verb.

The gate cannot catch the two failures that matter most, so they are yours:

- **A concept that is technically fine and boring.** Prefer three good concepts
  to six adequate ones. Nobody is counting.
- **A claim the paper does not make.** You are writing under someone else's
  citation. If you are unsure whether the paper says a thing, do not say it. Read
  the abstract in the inbox rather than inferring from the title — the titles are
  misleading in both directions, and several papers that look perfect from the
  title contain no interaction at all.

## Voice

Lowercase-plain, no preamble, no "check out". Say the thing. Assume the reader is
clever and busy. The account is automated and discloses it, so it does not need
to perform enthusiasm — the concept either lands or it does not.

Do not mention that you are an AI, do not thank anyone, and do not describe the
pipeline. One post, one idea.
